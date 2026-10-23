import { createHash } from "node:crypto";
export interface RegistryData {
    version: string;
    distributionSha256: string;
    revision: string;
    values: Record<string, string[]>;
    blocks: Record<string, { properties: Record<string, string[]> }>;
    tags: Record<string, string[]>;
    componentEncoding: "json" | "snbt";
    itemEncoding: "legacy-nbt" | "components";
    heterogeneousLists: boolean;
}
export type SnbtValue =
    | { type: "byte" | "short" | "int" | "long"; value: string }
    | { type: "float" | "double"; value: number }
    | { type: "string"; value: string }
    | { type: "list"; values: SnbtValue[] }
    | { type: "compound"; values: Record<string, SnbtValue> }
    | { type: "byte-array" | "int-array" | "long-array"; values: string[] };
export interface EntityOperand {
    kind: "entity";
    player?: string;
    uuid?: string;
    selector?: { variable: "p" | "a" | "r" | "s" | "e" | "n"; filters: SelectorFilter[] };
}
export type SelectorFilter =
    | { key: "x" | "y" | "z" | "dx" | "dy" | "dz"; value: number }
    | { key: "limit"; value: number }
    | { key: "distance" | "x_rotation" | "y_rotation" | "level"; min?: number; max?: number }
    | { key: "sort"; value: "nearest" | "furthest" | "random" | "arbitrary" }
    | { key: "gamemode"; value: "survival" | "creative" | "adventure" | "spectator"; not?: boolean }
    | { key: "name" | "team" | "tag"; value: string; not?: boolean }
    | { key: "type"; value: string; tag?: boolean; not?: boolean }
    | { key: "nbt"; value: SnbtValue; not?: boolean }
    | { key: "scores"; values: Record<string, { min?: number; max?: number }> }
    | { key: "advancements"; values: Record<string, boolean | Record<string, boolean>> }
    | { key: "predicate"; value: string; not?: boolean };
export interface BlockOperand {
    kind: "block";
    id: string;
    tag?: boolean;
    properties: Record<string, string>;
    nbt?: SnbtValue;
}
export interface ItemOperand {
    kind: "item";
    id: string;
    components?: Array<{ id: string; remove?: boolean; value?: SnbtValue }>;
    nbt?: SnbtValue;
}
export interface ResourceOperand {
    kind: "resource";
    id: string;
    tag?: boolean;
}
export interface NbtOperand {
    kind: "nbt";
    value: SnbtValue;
}
export interface ComponentOperand {
    kind: "component";
    value: JsonData | SnbtValue;
}
export type JsonData = string | number | boolean | null | JsonData[] | { [key: string]: JsonData };
export interface NbtPathOperand {
    kind: "nbt-path";
    segments: Array<
        | { key: string; match?: SnbtValue }
        | { index: number }
        | { all: true }
        | { match: SnbtValue }
    >;
}
export interface RangeOperand {
    kind: "range";
    min?: number;
    max?: number;
}
export interface RotationOperand {
    kind: "rotation";
    yaw: number;
    pitch: number;
}
export type VanillaOperand =
    | EntityOperand
    | BlockOperand
    | ItemOperand
    | ResourceOperand
    | NbtOperand
    | ComponentOperand
    | NbtPathOperand
    | RangeOperand
    | RotationOperand;
const resourceId = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const word = /^[A-Za-z0-9_+.-]+$/;
const quoted = (text: string): string => {
    if (text.length > 32767 || /[\r\n\0]/.test(text)) throw new Error("Invalid text.");
    return JSON.stringify(text);
};
const requireData = (data: RegistryData | undefined): RegistryData => {
    if (!data) throw new Error("Exact version-bound registry data is required.");
    return data;
};
export function registryValue(
    data: RegistryData,
    registry: string,
    id: string,
    tag = false,
): string {
    if (!resourceId.test(id) || !(tag ? data.tags[registry] : data.values[registry])?.includes(id))
        throw new Error(`Value is absent from the selected ${registry} registry.`);
    return (tag ? "#" : "") + id;
}
function integerText(value: string, bits: number): string {
    if (!/^-?\d+$/.test(value) || value.length > 24)
        throw new Error("Exact integer text required.");
    const n = BigInt(value),
        half = 1n << BigInt(bits - 1);
    if (n < -half || n >= half) throw new Error("NBT integer outside bounds.");
    return n.toString();
}
export function serializeSnbt(value: SnbtValue, heterogeneousLists = false): string {
    let count = 0;
    const visit = (input: SnbtValue, depth: number): string => {
        if (++count > 8192 || depth > 64 || !input || typeof input !== "object")
            throw new Error("NBT exceeds supported bounds.");
        if (input.type === "string") return quoted(input.value);
        if (["byte", "short", "int", "long"].includes(input.type)) {
            const tag = input as Extract<SnbtValue, { value: string }>;
            const bits = { byte: 8, short: 16, int: 32, long: 64 }[input.type as "byte"];
            return (
                integerText(tag.value, bits) +
                { byte: "b", short: "s", int: "", long: "L" }[input.type as "byte"]
            );
        }
        if (input.type === "float" || input.type === "double") {
            if (
                !Number.isFinite(input.value) ||
                (input.type === "float" && Math.abs(input.value) > 3.4028234663852886e38)
            )
                throw new Error("Invalid NBT number.");
            return String(input.value) + (input.type === "float" ? "f" : "d");
        }
        if (input.type === "compound") {
            if (Array.isArray(input.values) || Object.keys(input.values).length > 4096)
                throw new Error("Invalid NBT compound.");
            return (
                "{" +
                Object.entries(input.values)
                    .map(([key, child]) => `${quoted(key)}:${visit(child, depth + 1)}`)
                    .join(",") +
                "}"
            );
        }
        if (input.type === "list") {
            if (
                !heterogeneousLists &&
                input.values.some((child) => child.type !== input.values[0]?.type)
            )
                throw new Error("Mixed NBT list types require a compatible version.");
            return "[" + input.values.map((child) => visit(child, depth + 1)).join(",") + "]";
        }
        if (["byte-array", "int-array", "long-array"].includes(input.type)) {
            const array = input as Extract<SnbtValue, { values: string[] }>;
            if (array.values.length > 8192) throw new Error("NBT array exceeds limit.");
            const bits = input.type === "byte-array" ? 8 : input.type === "int-array" ? 32 : 64;
            return (
                "[" +
                (input.type === "byte-array" ? "B" : input.type === "int-array" ? "I" : "L") +
                ";" +
                array.values
                    .map((n) => integerText(n, bits) + (bits === 8 ? "b" : bits === 64 ? "L" : ""))
                    .join(",") +
                "]"
            );
        }
        throw new Error("Unknown NBT type.");
    };
    const result = visit(value, 0);
    if (result.length > 32767) throw new Error("NBT exceeds command limit.");
    return result;
}
function range(value: { min?: number; max?: number }, integers = false): string {
    if (value.min === undefined && value.max === undefined)
        throw new Error("A range bound is required.");
    for (const bound of [value.min, value.max])
        if (
            bound !== undefined &&
            (!Number.isFinite(bound) || (integers && !Number.isSafeInteger(bound)))
        )
            throw new Error("Invalid range.");
    if (value.min !== undefined && value.max !== undefined && value.min > value.max)
        throw new Error("Range is reversed.");
    return value.min === value.max ? String(value.min) : `${value.min ?? ""}..${value.max ?? ""}`;
}
export function serializeEntity(
    value: EntityOperand,
    properties: unknown,
    data?: RegistryData,
): string {
    if ([value.player, value.uuid, value.selector].filter((x) => x !== undefined).length !== 1)
        throw new Error("Choose exactly one entity identity or selector.");
    if (value.player !== undefined) {
        if (!/^[A-Za-z0-9_]{1,16}$/.test(value.player)) throw new Error("Invalid player name.");
        return value.player;
    }
    if (value.uuid !== undefined) {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.uuid))
            throw new Error("Invalid entity UUID.");
        return value.uuid;
    }
    const selector = value.selector!;
    if (
        !["p", "a", "r", "s", "e", "n"].includes(selector.variable) ||
        selector.filters.length > 128
    )
        throw new Error("Invalid selector.");
    if (
        selector.variable === "n" &&
        (!data || (!/^26\./.test(data.version) && !/^1\.21(?:\.|$)/.test(data.version)))
    )
        throw new Error("Nearest-entity selectors require a verified compatible version.");
    const flags = properties as {
        onlyAllowPlayers?: number;
        onlyAllowEntities?: number;
        single?: boolean;
        playersOnly?: boolean;
    } | null;
    const single = flags?.single ?? flags?.onlyAllowEntities === 1;
    const playersOnly = flags?.playersOnly ?? flags?.onlyAllowPlayers === 1;
    if (
        playersOnly &&
        ["e", "n"].includes(selector.variable) &&
        !selector.filters.some(
            (f) => f.key === "type" && !f.not && !f.tag && f.value === "minecraft:player",
        )
    )
        throw new Error("This argument requires players only.");
    if (
        single &&
        ["e", "a"].includes(selector.variable) &&
        !selector.filters.some((f) => f.key === "limit" && f.value === 1)
    )
        throw new Error("This argument requires one entity.");
    const seen = new Set<string>();
    const filters = selector.filters.map((filter) => {
        if (!filter || typeof filter !== "object") throw new Error("Invalid selector filter.");
        if (
            !["tag", "type", "name", "gamemode", "nbt", "predicate"].includes(filter.key) &&
            seen.has(filter.key)
        )
            throw new Error("Duplicate selector filter.");
        seen.add(filter.key);
        if (["x", "y", "z", "dx", "dy", "dz"].includes(filter.key)) {
            const f = filter as { key: string; value: number };
            if (!Number.isFinite(f.value)) throw new Error("Invalid selector coordinate.");
            return `${f.key}=${f.value}`;
        }
        if (filter.key === "limit") {
            if (!Number.isSafeInteger(filter.value) || filter.value < 1)
                throw new Error("Invalid selector limit.");
            return `limit=${filter.value}`;
        }
        if (["distance", "x_rotation", "y_rotation", "level"].includes(filter.key)) {
            const f = filter as { key: string; min?: number; max?: number };
            if (["distance", "level"].includes(f.key) && ((f.min ?? 0) < 0 || (f.max ?? 0) < 0))
                throw new Error("Negative selector range.");
            return `${f.key}=${range(f, f.key === "level")}`;
        }
        if (filter.key === "sort") {
            if (!["nearest", "furthest", "random", "arbitrary"].includes(filter.value))
                throw new Error("Invalid selector sort.");
            return `sort=${filter.value}`;
        }
        if (filter.key === "gamemode") {
            if (!["survival", "creative", "adventure", "spectator"].includes(filter.value))
                throw new Error("Invalid game mode.");
            return `gamemode=${filter.not ? "!" : ""}${filter.value}`;
        }
        if (filter.key === "name" || filter.key === "tag" || filter.key === "team")
            return `${filter.key}=${filter.not ? "!" : ""}${quoted(filter.value)}`;
        if (filter.key === "type")
            return `type=${filter.not ? "!" : ""}${registryValue(requireData(data), "minecraft:entity_type", filter.value, filter.tag)}`;
        if (filter.key === "predicate")
            return `predicate=${filter.not ? "!" : ""}${registryValue(requireData(data), "minecraft:predicate", filter.value)}`;
        if (filter.key === "nbt")
            return `nbt=${filter.not ? "!" : ""}${serializeSnbt(filter.value, data?.heterogeneousLists)}`;
        if (filter.key === "scores")
            return (
                "scores={" +
                Object.entries(filter.values)
                    .map(([key, limits]) => {
                        if (!word.test(key)) throw new Error("Invalid score objective.");
                        return `${key}=${range(limits, true)}`;
                    })
                    .join(",") +
                "}"
            );
        if (filter.key === "advancements")
            return (
                "advancements={" +
                Object.entries(filter.values)
                    .map(([key, achieved]) => {
                        const registry = registryValue(
                            requireData(data),
                            "minecraft:advancement",
                            key,
                        );
                        if (typeof achieved === "boolean") return `${registry}=${achieved}`;
                        return (
                            registry +
                            "={" +
                            Object.entries(achieved)
                                .map(([criterion, done]) => {
                                    if (!word.test(criterion) || typeof done !== "boolean")
                                        throw new Error("Invalid advancement criterion.");
                                    return `${criterion}=${done}`;
                                })
                                .join(",") +
                            "}"
                        );
                    })
                    .join(",") +
                "}"
            );
        throw new Error("Unsupported selector filter.");
    });
    return `@${selector.variable}` + (filters.length ? `[${filters.join(",")}]` : "");
}
export function vanillaControl(
    parser: string,
):
    | "entity"
    | "block"
    | "item"
    | "resource"
    | "nbt"
    | "component"
    | "nbt-path"
    | "range"
    | "rotation"
    | null {
    if (["minecraft:entity", "minecraft:game_profile", "minecraft:score_holder"].includes(parser))
        return "entity";
    if (["minecraft:block_state", "minecraft:block_predicate"].includes(parser)) return "block";
    if (["minecraft:item_stack", "minecraft:item_predicate"].includes(parser)) return "item";
    if (
        [
            "minecraft:resource_location",
            "minecraft:resource",
            "minecraft:resource_key",
            "minecraft:resource_or_tag",
            "minecraft:resource_or_tag_key",
            "minecraft:function",
        ].includes(parser)
    )
        return "resource";
    if (["minecraft:nbt", "minecraft:nbt_tag", "minecraft:compound_tag"].includes(parser))
        return "nbt";
    if (["minecraft:component", "minecraft:style"].includes(parser)) return "component";
    if (parser === "minecraft:nbt_path") return "nbt-path";
    if (["minecraft:int_range", "minecraft:float_range"].includes(parser)) return "range";
    if (parser === "minecraft:rotation") return "rotation";
    return null;
}
export function serializeVanilla(
    parser: string,
    properties: unknown,
    value: VanillaOperand,
    data?: RegistryData,
): string {
    const control = vanillaControl(parser);
    if (value.kind !== control)
        throw new Error("Typed operand does not match the declared parser.");
    if (value.kind === "entity") return serializeEntity(value, properties, data);
    if (value.kind === "nbt") {
        if (
            ["minecraft:nbt", "minecraft:compound_tag"].includes(parser) &&
            value.value.type !== "compound"
        )
            throw new Error("A compound NBT value is required.");
        return serializeSnbt(value.value, data?.heterogeneousLists);
    }
    if (value.kind === "range") return range(value, parser === "minecraft:int_range");
    if (value.kind === "rotation") {
        if (![value.yaw, value.pitch].every(Number.isFinite)) throw new Error("Invalid rotation.");
        return `${value.yaw} ${value.pitch}`;
    }
    if (value.kind === "resource") {
        const registry = (properties as { registry?: string } | null)?.registry;
        if (!registry) {
            if (!resourceId.test(value.id) || value.tag)
                throw new Error("Invalid resource location.");
            return value.id;
        }
        const permitsTag = ["minecraft:resource_or_tag", "minecraft:resource_or_tag_key"].includes(
            parser,
        );
        if (value.tag && !permitsTag) throw new Error("Tags are not accepted here.");
        return registryValue(requireData(data), registry, value.id, value.tag);
    }
    if (value.kind === "block") {
        const registry = requireData(data);
        if (value.tag && parser !== "minecraft:block_predicate")
            throw new Error("Tags are not block states.");
        const block = registryValue(registry, "minecraft:block", value.id, value.tag);
        const schema = registry.blocks[value.id];
        const entries = Object.entries(value.properties);
        if (entries.length && (!schema || value.tag))
            throw new Error("Block property schema unavailable.");
        const state = entries
            .map(([key, choice]) => {
                if (
                    !schema?.properties[key]?.includes(choice) ||
                    !word.test(key) ||
                    !word.test(choice)
                )
                    throw new Error("Invalid block property.");
                return `${key}=${choice}`;
            })
            .join(",");
        if (value.nbt && value.nbt.type !== "compound")
            throw new Error("Block data must be a compound.");
        return (
            block +
            (state ? `[${state}]` : "") +
            (value.nbt ? serializeSnbt(value.nbt, registry.heterogeneousLists) : "")
        );
    }
    if (value.kind === "item") {
        const registry = requireData(data);
        const item = registryValue(registry, "minecraft:item", value.id);
        if (registry.itemEncoding === "legacy-nbt") {
            if (value.components?.length)
                throw new Error("Components are unsupported by this version.");
            return item + (value.nbt ? serializeSnbt(value.nbt, registry.heterogeneousLists) : "");
        }
        if (value.nbt) throw new Error("This version uses item components.");
        const seen = new Set<string>();
        const components = (value.components ?? []).map((component) => {
            registryValue(registry, "minecraft:data_component_type", component.id);
            if (seen.has(component.id)) throw new Error("Duplicate item component.");
            seen.add(component.id);
            if (component.remove) {
                if (component.value !== undefined)
                    throw new Error("Removed components cannot contain a value.");
                return "!" + component.id;
            }
            if (!component.value) throw new Error("Item component value required.");
            return `${component.id}=${serializeSnbt(component.value, registry.heterogeneousLists)}`;
        });
        return item + (components.length ? `[${components.join(",")}]` : "");
    }
    if (value.kind === "component") {
        const registry = requireData(data);
        if (registry.componentEncoding === "snbt")
            return serializeSnbt(value.value as SnbtValue, registry.heterogeneousLists);
        const encoded = JSON.stringify(value.value);
        if (encoded.length > 32767 || encoded === undefined)
            throw new Error("Invalid text component.");
        JSON.parse(encoded);
        return encoded;
    }
    if (value.kind === "nbt-path") {
        if (!value.segments.length || value.segments.length > 128)
            throw new Error("Invalid NBT path.");
        return value.segments
            .map((segment, index) => {
                if ("key" in segment)
                    return (
                        (index ? "." : "") +
                        quoted(segment.key) +
                        (segment.match
                            ? serializeSnbt(segment.match, data?.heterogeneousLists)
                            : "")
                    );
                if ("index" in segment) {
                    if (!Number.isSafeInteger(segment.index))
                        throw new Error("Invalid NBT list index.");
                    return `[${segment.index}]`;
                }
                if ("all" in segment) return "[]";
                return `[${serializeSnbt(segment.match, data?.heterogeneousLists)}]`;
            })
            .join("");
    }
    throw new Error("Unavailable typed parser.");
}
export function bindRegistryReports(
    graph: { target: { version: string; distributionSha256: string } },
    registriesBytes: Buffer,
    blocksBytes: Buffer,
    receipt: {
        version: string;
        distributionSha256: string;
        registriesSha256: string;
        blocksSha256: string;
        componentEncoding: RegistryData["componentEncoding"];
        itemEncoding: RegistryData["itemEncoding"];
        heterogeneousLists: boolean;
        tags?: Record<string, string[]>;
    },
): RegistryData {
    const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
    if (
        registriesBytes.length > 32 * 1024 * 1024 ||
        blocksBytes.length > 32 * 1024 * 1024 ||
        receipt.version !== graph.target.version ||
        receipt.distributionSha256 !== graph.target.distributionSha256 ||
        hash(registriesBytes) !== receipt.registriesSha256 ||
        hash(blocksBytes) !== receipt.blocksSha256
    )
        throw new Error("Registry report provenance differs from selected server.");
    const registries = JSON.parse(registriesBytes.toString()) as Record<
        string,
        { entries: Record<string, unknown> }
    >;
    const blocks = JSON.parse(blocksBytes.toString()) as Record<
        string,
        { properties?: Record<string, string[]> }
    >;
    const values: Record<string, string[]> = {},
        schemas: RegistryData["blocks"] = {};
    for (const [key, registry] of Object.entries(registries)) {
        if (
            !resourceId.test(key) ||
            !registry.entries ||
            Object.keys(registry.entries).some((id) => !resourceId.test(id))
        )
            throw new Error("Invalid registry report.");
        values[key] = Object.keys(registry.entries);
    }
    for (const [key, block] of Object.entries(blocks)) {
        if (!resourceId.test(key)) throw new Error("Invalid block report.");
        schemas[key] = { properties: block.properties ?? {} };
    }
    return {
        version: receipt.version,
        distributionSha256: receipt.distributionSha256,
        revision: hash(
            Buffer.from(
                receipt.registriesSha256 +
                    receipt.blocksSha256 +
                    JSON.stringify(receipt.tags ?? {}),
            ),
        ),
        values,
        blocks: schemas,
        tags: structuredClone(receipt.tags ?? {}),
        componentEncoding: receipt.componentEncoding,
        itemEncoding: receipt.itemEncoding,
        heterogeneousLists: receipt.heterogeneousLists,
    };
}

export function attachRegistries<
    T extends {
        target: { version: string; distributionSha256: string };
        nodes: unknown;
        root: number;
        revision: string;
    },
>(graph: T, data: RegistryData): T & { registries: RegistryData } {
    if (
        data.version !== graph.target.version ||
        data.distributionSha256 !== graph.target.distributionSha256
    )
        throw new Error("Registry source differs from graph target.");
    const registries = structuredClone(data);
    return {
        ...structuredClone(graph),
        registries,
        revision: createHash("sha256")
            .update(
                JSON.stringify({
                    target: graph.target,
                    nodes: graph.nodes,
                    root: graph.root,
                    registries,
                }),
            )
            .digest("hex"),
    };
}
