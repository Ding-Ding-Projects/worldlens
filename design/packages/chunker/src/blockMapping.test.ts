import { describe, expect, it } from "vitest";

import { BlockMappingTable, UnmappedBlockLog, parseBlockMappingOverrides } from "./blockMapping.js";

describe("BlockMappingTable", () => {
    it("maps a block both ways through one row", () => {
        const table = BlockMappingTable.create();
        const toBedrock = table.toBedrock({ name: "minecraft:snow_block", properties: {} });
        expect(toBedrock.kind).toBe("mapped");
        if (toBedrock.kind !== "mapped") return;
        expect(toBedrock.block.name).toBe("minecraft:snow");

        const back = table.toJava(toBedrock.block);
        expect(back.kind).toBe("mapped");
        if (back.kind !== "mapped") return;
        expect(back.block.name).toBe("minecraft:snow_block");
    });

    it("renames properties and values, and inverts both on the way back", () => {
        const table = BlockMappingTable.create();
        const bedrock = table.toBedrock({
            name: "minecraft:oak_stairs",
            properties: { facing: "north", half: "top" },
        });
        expect(bedrock.kind).toBe("mapped");
        if (bedrock.kind !== "mapped") return;
        expect(bedrock.block.properties).toEqual({ weirdo_direction: "3", upside_down_bit: "1" });

        const java = table.toJava(bedrock.block);
        expect(java.kind).toBe("mapped");
        if (java.kind !== "mapped") return;
        expect(java.block.properties).toEqual({ facing: "north", half: "top" });
    });

    it("reports an unmapped block by name rather than substituting air", () => {
        const table = BlockMappingTable.create();
        const result = table.toBedrock({ name: "somemod:reactor_core", properties: {} });
        expect(result.kind).toBe("unmapped");
        if (result.kind !== "unmapped") return;
        expect(result.name).toBe("somemod:reactor_core");
        expect(result.from).toBe("java");
        expect(result.to).toBe("bedrock");
    });

    it("lets an override row replace a shipped row outright", () => {
        const table = BlockMappingTable.create([
            { java: "minecraft:snow_block", bedrock: "somemod:packed_snow" },
            { java: "somemod:reactor_core", bedrock: "somemod:reactor_core" },
        ]);

        const replaced = table.toBedrock({ name: "minecraft:snow_block", properties: {} });
        expect(replaced.kind === "mapped" && replaced.block.name).toBe("somemod:packed_snow");

        const added = table.toBedrock({ name: "somemod:reactor_core", properties: {} });
        expect(added.kind).toBe("mapped");

        // The replaced row is gone in both directions, so nothing still answers to the old
        // Bedrock name.
        expect(table.rowForBedrock("minecraft:snow")).toBeNull();
    });
});

describe("UnmappedBlockLog", () => {
    it("counts each missing block once per occurrence and orders by frequency", () => {
        const table = BlockMappingTable.create();
        const log = new UnmappedBlockLog();
        expect(log.empty).toBe(true);

        for (let index = 0; index < 3; index++)
            log.record(table.toBedrock({ name: "somemod:pipe", properties: {} }));
        log.record(table.toBedrock({ name: "somemod:core", properties: {} }));
        log.record(table.toBedrock({ name: "minecraft:stone", properties: {} }));

        expect(log.empty).toBe(false);
        expect(log.entries()).toEqual([
            { name: "somemod:pipe", count: 3 },
            { name: "somemod:core", count: 1 },
        ]);
    });
});

describe("parseBlockMappingOverrides", () => {
    it("reads a well-formed file", () => {
        const parsed = parseBlockMappingOverrides(
            JSON.stringify([
                {
                    java: "minecraft:stone",
                    bedrock: "minecraft:stone",
                    properties: { facing: "facing_direction" },
                    values: { facing: { north: "3" } },
                    note: "close enough",
                },
            ]),
        );
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.rows[0]?.note).toBe("close enough");
    });

    it("names the row that is wrong rather than refusing the whole file blankly", () => {
        const parsed = parseBlockMappingOverrides(
            JSON.stringify([{ java: "minecraft:stone", bedrock: "minecraft:stone" }, { java: 4 }]),
        );
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.reason).toContain("Row 1");
    });

    it("refuses input that is not JSON and input that is not an array", () => {
        expect(parseBlockMappingOverrides("{").ok).toBe(false);
        expect(parseBlockMappingOverrides("{}").ok).toBe(false);
    });
});
