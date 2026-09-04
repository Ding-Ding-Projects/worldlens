import { describe, expect, it } from "vitest";
import { CHUNKER_CLI_OPTION_INVENTORY, chunkerConfigArguments, validateChunkerCliConfig } from "./chunkerConfig.js";

describe("Chunker's pinned CLI inventory", () => {
    it("names every option from pinned CLI.java exactly once", () => {
        expect(CHUNKER_CLI_OPTION_INVENTORY).toEqual([
            "inputDirectory", "outputFormat", "outputDirectory", "blockMappings", "worldSettings", "pruning",
            "converterSettings", "dimensionRegistry", "dimensionMappings", "biomeMappings", "keepOriginalNBT",
        ]);
    });

    it("serializes every optional value as data without a shell", () => {
        const config = validateChunkerCliConfig({
            blockMappings: { "minecraft:stone": "minecraft:diamond_block" }, worldSettings: { seed: 7 },
            pruning: { configs: [] }, converterSettings: { mapConversion: false }, dimensionRegistry: { mappings: [] },
            dimensionMappings: { overworld: "nether" }, biomeMappings: { "minecraft:plains": "minecraft:desert" },
            keepOriginalNBT: true,
        });
        expect(config).not.toBeNull();
        expect(chunkerConfigArguments(config ?? {}, "JAVA_1_21_4", "JAVA_1_21_4")).toEqual([
            "--blockMappings", '{"minecraft:stone":"minecraft:diamond_block"}', "--worldSettings", '{"seed":7}',
            "--pruning", '{"configs":[]}', "--converterSettings", '{"mapConversion":false}',
            "--dimensionRegistry", '{"mappings":[]}', "--dimensionMappings", '{"overworld":"nether"}',
            "--biomeMappings", '{"minecraft:plains":"minecraft:desert"}', "--keepOriginalNBT",
        ]);
    });

    it("rejects unknown, scalar and unsafe NBT-copy requests", () => {
        expect(validateChunkerCliConfig({ unknown: {} })).toBeNull();
        expect(validateChunkerCliConfig({ worldSettings: [] })).toBeNull();
        expect(() => chunkerConfigArguments({ keepOriginalNBT: true }, "BEDROCK_1_21_40", "JAVA_1_21_4")).toThrow(/only available/);
    });
});
