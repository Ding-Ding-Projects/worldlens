import { createHash } from "node:crypto";
import {
    discoverCommands,
    type CommandGraph,
    type CommandTarget,
    type DeclaredPacket,
} from "./index.js";
export interface GeneratedReportNode {
    type: "root" | "literal" | "argument";
    executable?: boolean;
    parser?: string;
    properties?: unknown;
    redirect?: string[];
    children?: Record<string, GeneratedReportNode>;
}
export interface GeneratedReportReceipt {
    version: string;
    distributionSha256: string;
    reportSha256: string;
    generatedAt: string;
    source: string;
}
/** Official data-generator output is an inventory, never proof of a live account's permissions or plugins. */
export function discoverGeneratedReport(
    bytes: Buffer,
    receipt: GeneratedReportReceipt,
    target: CommandTarget,
): CommandGraph {
    if (
        bytes.length > 16 * 1024 * 1024 ||
        receipt.version !== target.version ||
        receipt.distributionSha256 !== target.distributionSha256 ||
        !/^[a-f0-9]{64}$/.test(receipt.reportSha256) ||
        createHash("sha256").update(bytes).digest("hex") !== receipt.reportSha256
    )
        throw new Error("Report provenance does not match the selected server distribution.");
    const root = JSON.parse(bytes.toString("utf8")) as GeneratedReportNode;
    if (root.type !== "root") throw new Error("Invalid generated command report.");
    const nodes: DeclaredPacket["nodes"] = [],
        paths = new Map<string, number>(),
        redirects: Array<{ node: number; path: string[] }> = [];
    function visit(
        input: GeneratedReportNode,
        name: string,
        path: string[],
        depth: number,
    ): number {
        if (
            depth > 256 ||
            nodes.length >= 100_000 ||
            !["root", "literal", "argument"].includes(input.type)
        )
            throw new Error("Invalid report node or size.");
        const id = nodes.length;
        paths.set(JSON.stringify(path), id);
        const children: number[] = [];
        nodes.push({
            flags:
                (input.type === "root" ? 0 : input.type === "literal" ? 1 : 2) |
                (input.executable ? 4 : 0) |
                (input.redirect ? 8 : 0),
            children,
            ...(input.type !== "root"
                ? {
                      extraNodeData: {
                          name,
                          ...(input.parser ? { parser: input.parser } : {}),
                          properties: input.properties ?? null,
                      },
                  }
                : {}),
        });
        for (const [childName, child] of Object.entries(input.children ?? {}))
            children.push(visit(child, childName, [...path, childName], depth + 1));
        if (input.redirect) redirects.push({ node: id, path: input.redirect });
        return id;
    }
    visit(root, "", [], 0);
    for (const redirect of redirects) {
        const destination = paths.get(JSON.stringify(redirect.path));
        if (destination === undefined) throw new Error("Unresolved report redirect.");
        nodes[redirect.node]!.redirectNode = destination;
    }
    const graph = discoverCommands({ nodes, rootIndex: 0 }, target, receipt.generatedAt);
    return {
        ...graph,
        completeness: "official-report-only",
        source: {
            kind: "generated-report",
            observedAt: receipt.generatedAt,
            source: receipt.source,
            reportSha256: receipt.reportSha256,
        },
    };
}
