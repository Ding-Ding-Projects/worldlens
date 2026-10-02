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
            blockMappings: {identifiers:[{old_identifier:'minecraft:stone',new_identifier:'minecraft:diamond_block'}]}, worldSettings: { RandomSeed: '7' },
            pruning: { configs: {} }, converterSettings: { mapConversion: false }, dimensionRegistry: { mappings: [] },
            dimensionMappings: { 'minecraft:overworld': 'minecraft:the_nether' }, biomeMappings: { "minecraft:plains": "minecraft:desert" },
            keepOriginalNBT: true,
        });
        expect(config).not.toBeNull();
        expect(chunkerConfigArguments(config ?? {}, "JAVA_1_21_4", "JAVA_1_21_4")).toEqual([
            "--blockMappings", '{"identifiers":[{"old_identifier":"minecraft:stone","new_identifier":"minecraft:diamond_block"}]}', "--worldSettings", '{"RandomSeed":"7"}',
            "--pruning", '{"configs":{}}', "--converterSettings", '{"mapConversion":false}',
            "--dimensionRegistry", '{"mappings":[]}', "--dimensionMappings", '{"minecraft:overworld":"minecraft:the_nether"}',
            "--biomeMappings", '{"minecraft:plains":"minecraft:desert"}', "--keepOriginalNBT",
        ]);
    });

    it("rejects unknown, scalar and unsafe NBT-copy requests", () => {
        expect(validateChunkerCliConfig({ unknown: {} })).toBeNull();
        expect(validateChunkerCliConfig({ worldSettings: [] })).toBeNull();
        expect(() => chunkerConfigArguments({ keepOriginalNBT: true }, "BEDROCK_1_21_40", "JAVA_1_21_4")).toThrow(/only available/);
    });
    it('rejects unknown fixed keys and wrong nested types instead of letting Gson ignore them',()=>{
        for(const config of [
            {worldSettings:{fakeSetting:true}}, {worldSettings:{Difficulty:'hard'}},
            {blockMappings:{'minecraft:stone':'minecraft:dirt'}},
            {blockMappings:{identifiers:[{old_identifier:'minecraft:stone',new_identifier:7}]}},
            {blockMappings:{identifiers:[{old_identifier:'minecraft:stone',invented:true}]}},
            {dimensionRegistry:{mappings:[{identifier:'custom:world',biomeHeight:'64'}]}},
            {dimensionRegistry:{mappings:[],unrecognized:true}},
            {pruning:{configs:{'minecraft:overworld':{include:true,regions:[],unexpected:true}}}},
        ])expect(validateChunkerCliConfig(config)).toBeNull();
    });
    it('uses a selected-jar schema when supplied and preserves exact 64-bit values',()=>{
        expect(validateChunkerCliConfig({worldSettings:{NewField:true}}, {NewField:'Boolean'})).not.toBeNull();
        expect(validateChunkerCliConfig({worldSettings:{NewField:true}})).toBeNull();
        expect(validateChunkerCliConfig({worldSettings:{RandomSeed:'9223372036854775807'}})).not.toBeNull();
        expect(validateChunkerCliConfig({worldSettings:{DayTime:'9223372036854775807'}})).not.toBeNull();
        expect(validateChunkerCliConfig({worldSettings:{DayTime:'9223372036854775808'}})).toBeNull();
    });
});
