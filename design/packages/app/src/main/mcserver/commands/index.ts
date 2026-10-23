import {
    vanillaControl,
    serializeVanilla,
    type VanillaOperand,
    type RegistryData,
} from "./vanilla.js";
import { createHash } from "node:crypto";

export interface CommandTarget {
    serverId: string;
    version: string;
    distributionSha256: string;
    connectionEpoch: string;
    principalId: string;
    permissionRevision: string;
    executionDimension?: string | null;
}
export interface ParserDescriptor {
    parser: string;
    properties: unknown;
    control:
        | "boolean"
        | "number"
        | "integer"
        | "text"
        | "point"
        | "dimension"
        | "unavailable"
        | NonNullable<ReturnType<typeof vanillaControl>>;
    dimensions?: 2 | 3;
    reason?: string;
}
export interface CommandNode {
    id: number;
    kind: "root" | "literal" | "argument";
    name: string;
    executable: boolean;
    children: number[];
    redirect: number | null;
    suggestions: string | null;
    parser: ParserDescriptor | null;
}
export interface CommandGraph {
    target: CommandTarget;
    registries?: RegistryData;
    revision: string;
    source:
        | { kind: "protocol"; packet: "declare_commands"; observedAt: string }
        | { kind: "generated-report"; observedAt: string; source: string; reportSha256: string };
    completeness: "complete-for-principal" | "official-report-only";
    nodes: CommandNode[];
    root: number;
}
export interface DeclaredPacket {
    rootIndex: number;
    nodes: Array<{
        flags:
            number | { command_node_type: number; has_command: number; has_redirect_node?: number };
        children: number[];
        redirectNode?: number;
        extraNodeData?: {
            name: string;
            parser?: string;
            properties?: unknown;
            suggestionType?: string;
        };
        suggestionType?: string;
    }>;
}
export interface PointOperand {
    kind: "point";
    dimension: string;
    x: number;
    y: number;
    z: number;
}
export interface RegionOperand {
    kind: "region";
    from: PointOperand;
    to: PointOperand;
}
export interface PathOperand {
    kind: "path";
    points: PointOperand[];
}
export type CommandValue = string | number | boolean | PointOperand | VanillaOperand;
export interface CommandStep {
    node: number;
    value?: CommandValue;
}
export interface CommandPreview {
    target: CommandTarget;
    graphRevision: string;
    command: string;
    digest: string;
    steps: CommandStep[];
    dimension: string | null;
}
const identifier = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const hash = (value: unknown): string =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function describeParser(parser: string, properties: unknown): ParserDescriptor {
    const base = {
        parser,
        properties: JSON.parse(
            JSON.stringify(properties ?? null, (_key, value: unknown) =>
                typeof value === "bigint" ? value.toString() : value,
            ),
        ) as unknown,
    };
    const typed = vanillaControl(parser);
    if (typed) return { ...base, control: typed };
    if (parser === "brigadier:bool") return { ...base, control: "boolean" };
    if (["brigadier:integer", "brigadier:long"].includes(parser))
        return { ...base, control: "integer" };
    if (["brigadier:float", "brigadier:double"].includes(parser))
        return { ...base, control: "number" };
    if (parser === "brigadier:string") return { ...base, control: "text" };
    if (
        [
            "minecraft:block_pos",
            "minecraft:vec3",
            "minecraft:column_pos",
            "minecraft:vec2",
        ].includes(parser)
    )
        return {
            ...base,
            control: "point",
            dimensions: ["minecraft:vec2", "minecraft:column_pos"].includes(parser) ? 2 : 3,
        };
    if (parser === "minecraft:dimension") return { ...base, control: "dimension" };
    return {
        ...base,
        control: "unavailable",
        reason: "No verified typed serializer is installed for this parser.",
    };
}
export function discoverCommands(
    packet: DeclaredPacket,
    target: CommandTarget,
    observedAt = new Date().toISOString(),
): CommandGraph {
    if (
        !packet.nodes.length ||
        packet.nodes.length > 100_000 ||
        !Number.isInteger(packet.rootIndex)
    )
        throw new Error("Invalid command graph.");
    const nodes = packet.nodes.map((raw, id): CommandNode => {
        const flags = raw.flags;
        const kind = typeof flags === "number" ? flags & 3 : flags.command_node_type;
        if (kind < 0 || kind > 2 || !Array.isArray(raw.children))
            throw new Error("Invalid node type.");
        const extra = raw.extraNodeData;
        if (kind !== 0 && (!extra?.name || /[\r\n\0]/.test(extra.name)))
            throw new Error("Invalid command node name.");
        if (kind === 2 && typeof extra?.parser !== "string")
            throw new Error("Missing parser identifier.");
        return {
            id,
            kind: (["root", "literal", "argument"] as const)[kind]!,
            name: extra?.name ?? "",
            executable: typeof flags === "number" ? Boolean(flags & 4) : flags.has_command === 1,
            children: [...raw.children],
            redirect: raw.redirectNode ?? null,
            suggestions: extra?.suggestionType ?? raw.suggestionType ?? null,
            parser: kind === 2 ? describeParser(extra!.parser!, extra?.properties ?? null) : null,
        };
    });
    for (const node of nodes)
        for (const ref of [...node.children, ...(node.redirect === null ? [] : [node.redirect])])
            if (!Number.isInteger(ref) || !nodes[ref]) throw new Error("Invalid graph reference.");
    if (nodes[packet.rootIndex]?.kind !== "root") throw new Error("Missing root node.");
    const snapshot = structuredClone({ target, nodes, root: packet.rootIndex });
    return {
        ...snapshot,
        revision: hash(snapshot),
        source: { kind: "protocol", packet: "declare_commands", observedAt },
        completeness: "complete-for-principal",
    };
}
export function validateSpatial(value: PointOperand | RegionOperand | PathOperand): void {
    const points =
        value.kind === "point"
            ? [value]
            : value.kind === "region"
              ? [value.from, value.to]
              : value.points;
    if (!points.length || points.length > 10_000) throw new Error("Invalid spatial operand.");
    const dimension = points[0]!.dimension;
    for (const point of points)
        if (
            point.kind !== "point" ||
            !identifier.test(point.dimension) ||
            point.dimension !== dimension ||
            ![point.x, point.y, point.z].every(Number.isFinite) ||
            Math.max(Math.abs(point.x), Math.abs(point.z)) > 30_000_000
        )
            throw new Error("Invalid spatial operand or mixed dimensions.");
}
function serialize(
    parser: ParserDescriptor,
    value: CommandValue | undefined,
    registries?: RegistryData,
): string {
    if (vanillaControl(parser.parser)) {
        if (!value || typeof value !== "object")
            throw new Error("A structured vanilla operand is required.");
        return serializeVanilla(
            parser.parser,
            parser.properties,
            value as VanillaOperand,
            registries,
        );
    }
    if (parser.control === "unavailable") throw new Error(`Unsupported parser: ${parser.parser}`);
    if (parser.control === "point") {
        if (!value || typeof value !== "object" || value.kind !== "point")
            throw new Error("A map point is required.");
        validateSpatial(value);
        const coordinates =
            parser.dimensions === 2 ? [value.x, value.z] : [value.x, value.y, value.z];
        if (
            ["minecraft:block_pos", "minecraft:column_pos"].includes(parser.parser) &&
            !coordinates.every(Number.isInteger)
        )
            throw new Error("Block coordinates must be integers.");
        return coordinates.join(" ");
    }
    if (parser.control === "boolean") {
        if (typeof value !== "boolean") throw new Error("Boolean required.");
        return String(value);
    }
    if (parser.control === "number" || parser.control === "integer") {
        const long = parser.parser === "brigadier:long";
        if (long) {
            if (typeof value !== "string" || !/^-?\d+$/.test(value))
                throw new Error("Exact integer text required.");
            const n = BigInt(value);
            const properties = parser.properties as {
                min?: string | number;
                max?: string | number;
            } | null;
            if (
                n < longBoundary(properties?.min, -9223372036854775808n) ||
                n > longBoundary(properties?.max, 9223372036854775807n)
            )
                throw new Error("Integer outside bounds.");
            return n.toString();
        }
        if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            (parser.control === "integer" && !Number.isSafeInteger(value))
        )
            throw new Error("Valid number required.");
        const properties = parser.properties as { min?: number; max?: number } | null;
        if (
            value <
                (properties?.min ??
                    (parser.parser === "brigadier:integer" ? -2147483648 : -Infinity)) ||
            value >
                (properties?.max ?? (parser.parser === "brigadier:integer" ? 2147483647 : Infinity))
        )
            throw new Error("Number outside bounds.");
        return String(value);
    }
    if (
        typeof value !== "string" ||
        !value.length ||
        value.length > 32_767 ||
        /[\r\n\0]/.test(value)
    )
        throw new Error("Valid argument text required.");
    if (parser.control === "dimension") {
        if (!identifier.test(value)) throw new Error("Invalid dimension.");
        return value;
    }
    const mode = parser.properties;
    if (mode === 0 || mode === "SINGLE_WORD") {
        if (!/^[A-Za-z0-9_+.-]+$/.test(value)) throw new Error("Single word required.");
        return value;
    }
    if (mode === 1 || mode === "QUOTABLE_PHRASE") return JSON.stringify(value);
    if (mode === 2 || mode === "GREEDY_PHRASE") return value;
    throw new Error("Unknown string parser mode.");
}
export function previewCommand(
    graph: CommandGraph,
    steps: CommandStep[],
    dimension: string | null = null,
): CommandPreview {
    if (dimension !== null && graph.target.executionDimension !== dimension)
        throw new Error("Execution dimension is unknown or changed. Refresh the target context.");
    if (graph.completeness !== "complete-for-principal")
        throw new Error("A live permission-scoped command graph is required for execution.");
    if (!steps.length || steps.length > 256) throw new Error("Invalid command path.");
    let current = graph.nodes[graph.root]!;
    const parts: string[] = [];
    for (const step of steps) {
        const visited = new Set<number>();
        while (!current.children.includes(step.node) && current.redirect !== null) {
            if (visited.has(current.id)) throw new Error("Redirect cycle.");
            visited.add(current.id);
            current = graph.nodes[current.redirect]!;
        }
        if (!current.children.includes(step.node)) throw new Error("Command path is not declared.");
        current = graph.nodes[step.node]!;
        if (current.kind === "root") throw new Error("Root cannot be an argument.");
        if (current.kind === "literal") {
            if (/\s/.test(current.name)) throw new Error("Invalid literal.");
            parts.push(current.name);
        } else {
            parts.push(serialize(current.parser!, step.value, graph.registries));
            if (
                typeof step.value === "object" &&
                step.value.kind === "point" &&
                step.value.dimension !== dimension
            )
                throw new Error("Map dimension differs from execution context.");
        }
    }
    if (!current.executable) throw new Error("Command requires more arguments.");
    const command = parts.join(" ");
    if (command.length > 32_767 || /[\r\n\0]/.test(command)) throw new Error("Invalid command.");
    const body = {
        target: structuredClone(graph.target),
        graphRevision: graph.revision,
        command,
        steps: structuredClone(steps),
        dimension,
    };
    return { ...body, digest: hash(body) };
}
export async function dispatchPreview(
    preview: CommandPreview,
    currentGraph: () => Promise<CommandGraph>,
    dispatch: (command: string, target: CommandTarget) => Promise<void>,
): Promise<void> {
    const graph = await currentGraph();
    if (hash(graph.target) !== hash(preview.target) || graph.revision !== preview.graphRevision)
        throw new Error("Command target, permissions or graph changed. Review again.");
    const checked = previewCommand(graph, preview.steps, preview.dimension);
    if (checked.digest !== preview.digest || checked.command !== preview.command)
        throw new Error("Command preview changed.");
    await dispatch(checked.command, checked.target);
}

export * from "./report.js";

/** Convert a map rectangle into the two actual graph arguments used by fill/clone-like paths. */
export function regionArguments(
    region: RegionOperand,
    fromNode: number,
    toNode: number,
): CommandStep[] {
    validateSpatial(region);
    if (
        fromNode === toNode ||
        ![fromNode, toNode].every((value) => Number.isInteger(value) && value >= 0)
    )
        throw new Error("Distinct declared coordinate nodes are required.");
    return [
        { node: fromNode, value: structuredClone(region.from) },
        { node: toNode, value: structuredClone(region.to) },
    ];
}

/** Rebind only after the owning protocol client has observed its current dimension. */
export function bindExecutionDimension(
    graph: CommandGraph,
    executionDimension: string,
): CommandGraph {
    if (!identifier.test(executionDimension)) throw new Error("Invalid execution dimension.");
    const target = { ...graph.target, executionDimension };
    return {
        ...structuredClone(graph),
        target,
        revision: hash({
            target,
            nodes: graph.nodes,
            root: graph.root,
            registries: graph.registries,
        }),
    };
}

function longBoundary(value: unknown, fallback: bigint): bigint {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    if (
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((part) => typeof part === "number" && Number.isInteger(part))
    )
        return BigInt.asIntN(
            64,
            (BigInt(value[0] as number) << 32n) | BigInt((value[1] as number) >>> 0),
        );
    throw new Error("Exact long parser bounds are unavailable.");
}

export * from "./vanilla.js";
