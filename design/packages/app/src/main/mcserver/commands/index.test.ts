import { describe, expect, it, vi } from "vitest";
import {
    discoverCommands,
    dispatchPreview,
    previewCommand,
    validateSpatial,
    type CommandTarget,
    type DeclaredPacket,
} from "./index.js";
const target: CommandTarget = {
    serverId: "server-a",
    version: "1.21.4",
    distributionSha256: "a".repeat(64),
    connectionEpoch: "connection-a",
    principalId: "operator-a",
    permissionRevision: "1",
    executionDimension: "minecraft:overworld",
};
const packet: DeclaredPacket = {
    rootIndex: 0,
    nodes: [
        { flags: 0, children: [1, 4, 5] },
        { flags: 1, children: [2], extraNodeData: { name: "teleport" } },
        {
            flags: 6,
            children: [],
            extraNodeData: { name: "destination", parser: "minecraft:vec3" },
        },
        { flags: 6, children: [], extraNodeData: { name: "data", parser: "plugin:unverified" } },
        { flags: 1, children: [3], extraNodeData: { name: "plugin" } },
        { flags: 9, children: [], redirectNode: 1, extraNodeData: { name: "tp" } },
    ],
};
describe("permission-scoped command discovery and dispatch", () => {
    it("preserves every actual node, redirect and unavailable parser without inventing commands", () => {
        const graph = discoverCommands(packet, target);
        expect(graph.nodes).toHaveLength(packet.nodes.length);
        expect(graph.nodes[5]?.redirect).toBe(1);
        expect(graph.nodes[3]?.parser?.control).toBe("unavailable");
        expect(graph.completeness).toBe("complete-for-principal");
    });
    it("serializes map coordinates and traverses actual redirects", () => {
        const graph = discoverCommands(packet, target);
        const preview = previewCommand(
            graph,
            [
                { node: 5 },
                {
                    node: 2,
                    value: {
                        kind: "point",
                        x: 1.5,
                        y: 64,
                        z: -2,
                        dimension: "minecraft:overworld",
                    },
                },
            ],
            "minecraft:overworld",
        );
        expect(preview.command).toBe("tp 1.5 64 -2");
    });
    it("rejects missing arguments, undeclared paths, unavailable parsers and cross-dimension points", () => {
        const graph = discoverCommands(packet, target);
        expect(() => previewCommand(graph, [{ node: 1 }])).toThrow("more arguments");
        expect(() => previewCommand(graph, [{ node: 2 }])).toThrow("not declared");
        expect(() => previewCommand(graph, [{ node: 4 }, { node: 3, value: "raw" }])).toThrow(
            "Unsupported parser",
        );
        expect(() =>
            previewCommand(
                graph,
                [
                    { node: 1 },
                    {
                        node: 2,
                        value: {
                            kind: "point",
                            x: 1,
                            y: 2,
                            z: 3,
                            dimension: "minecraft:the_nether",
                        },
                    },
                ],
                "minecraft:overworld",
            ),
        ).toThrow("dimension");
    });
    it("revalidates permissions, connection epoch and exact preview before dispatch", async () => {
        const graph = discoverCommands(packet, target);
        const preview = previewCommand(
            graph,
            [
                { node: 1 },
                {
                    node: 2,
                    value: { kind: "point", x: 1, y: 2, z: 3, dimension: "minecraft:overworld" },
                },
            ],
            "minecraft:overworld",
        );
        const send = vi.fn();
        await dispatchPreview(preview, async () => graph, send);
        expect(send).toHaveBeenCalledOnce();
        for (const changed of [
            { permissionRevision: "2" },
            { connectionEpoch: "b" },
            { serverId: "b" },
        ])
            await expect(
                dispatchPreview(
                    preview,
                    async () => discoverCommands(packet, { ...target, ...changed }),
                    send,
                ),
            ).rejects.toThrow("changed");
        await expect(
            dispatchPreview({ ...preview, command: "stop" }, async () => graph, send),
        ).rejects.toThrow("changed");
        expect(send).toHaveBeenCalledOnce();
    });
    it("rejects graph omissions, invalid references and mixed spatial dimensions", () => {
        expect(() =>
            discoverCommands({ ...packet, nodes: packet.nodes.slice(0, 2) }, target),
        ).toThrow("reference");
        expect(() => validateSpatial({ kind: "path", points: [] })).toThrow();
        expect(() =>
            validateSpatial({
                kind: "region",
                from: { kind: "point", x: 0, y: 1, z: 2, dimension: "minecraft:overworld" },
                to: { kind: "point", x: 0, y: 1, z: 2, dimension: "minecraft:the_end" },
            }),
        ).toThrow();
    });
});

import { createHash } from "node:crypto";
import { discoverGeneratedReport } from "./report.js";
describe("official generated command reports", () => {
    it("retains full static inventory with a separate non-executable completeness verdict", () => {
        const bytes = Buffer.from(
            JSON.stringify({
                type: "root",
                children: { stop: { type: "literal", executable: true } },
            }),
        );
        const receipt = {
            version: target.version,
            distributionSha256: target.distributionSha256,
            reportSha256: createHash("sha256").update(bytes).digest("hex"),
            generatedAt: "2026-10-23T00:00:00Z",
            source: "official-server-data-generator",
        };
        const graph = discoverGeneratedReport(bytes, receipt, target);
        expect(graph.nodes).toHaveLength(2);
        expect(graph.completeness).toBe("official-report-only");
        expect(() => previewCommand(graph, [{ node: 1 }])).toThrow("live permission-scoped");
        expect(() =>
            discoverGeneratedReport(bytes, { ...receipt, version: "26.3" }, target),
        ).toThrow("provenance");
        expect(() => discoverGeneratedReport(Buffer.from("{}"), receipt, target)).toThrow(
            "provenance",
        );
    });
});

describe("exact numeric parser semantics", () => {
    const numericGraph = (parser: string, properties: unknown) =>
        discoverCommands(
            {
                rootIndex: 0,
                nodes: [
                    { flags: 0, children: [1] },
                    { flags: 1, children: [2], extraNodeData: { name: "value" } },
                    {
                        flags: 6,
                        children: [],
                        extraNodeData: { name: "number", parser, properties },
                    },
                ],
            },
            target,
        );
    it("preserves signed 64-bit metadata and rejects rounded or out-of-range integers", () => {
        const graph = numericGraph("brigadier:long", {
            min: -9223372036854775808n,
            max: 9223372036854775807n,
        });
        expect(
            previewCommand(graph, [{ node: 1 }, { node: 2, value: "9223372036854775807" }]).command,
        ).toBe("value 9223372036854775807");
        expect(() =>
            previewCommand(graph, [{ node: 1 }, { node: 2, value: "9223372036854775808" }]),
        ).toThrow("bounds");
        expect(() =>
            previewCommand(graph, [{ node: 1 }, { node: 2, value: 9007199254740992 }]),
        ).toThrow("Exact integer");
        expect(() =>
            previewCommand(numericGraph("brigadier:integer", null), [
                { node: 1 },
                { node: 2, value: 2147483648 },
            ]),
        ).toThrow("bounds");
    });
});
