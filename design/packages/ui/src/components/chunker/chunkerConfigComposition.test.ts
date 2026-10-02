import {describe,it,expect} from 'vitest';
import {composeChunkerConfiguration} from './chunkerConfigComposition.js';
describe('guided and advanced Chunker composition',()=>{
    it('preserves guided name and seed when one advanced setting changes',()=>{
        expect(composeChunkerConfiguration({worldSettings:{LevelName:'Own world',RandomSeed:'9223372036854775807'}},{worldSettings:{Difficulty:2}}).config.worldSettings).toEqual({LevelName:'Own world',RandomSeed:'9223372036854775807',Difficulty:2});
    });
    it('preserves unrelated block mappings and records exact-field collisions',()=>{
        const result=composeChunkerConfiguration({blockMappings:{identifiers:[{old_identifier:'minecraft:stone',new_identifier:'minecraft:dirt'},{old_identifier:'minecraft:oak_log',new_identifier:'minecraft:birch_log'}]}},{blockMappings:{identifiers:[{old_identifier:'minecraft:stone',new_identifier:'minecraft:gold_block'}]}});
        expect(result.config.blockMappings.identifiers).toHaveLength(2);expect(result.config.blockMappings.identifiers[1].new_identifier).toBe('minecraft:birch_log');expect(result.collisions).toHaveLength(1);
    });
    it('intersects trims and retains independent dimension rules',()=>{
        const outer={include:true,regions:[{minChunkX:0,minChunkZ:0,maxChunkX:31,maxChunkZ:31}]};
        const inner={include:true,regions:[{minChunkX:10,minChunkZ:10,maxChunkX:40,maxChunkZ:40}]};
        const result=composeChunkerConfiguration({pruning:{configs:{'minecraft:overworld':outer,'minecraft:the_end':outer}}},{pruning:{configs:{'minecraft:overworld':inner}}});
        expect(result.config.pruning.configs['minecraft:overworld'].regions).toEqual([{minChunkX:10,minChunkZ:10,maxChunkX:31,maxChunkZ:31}]);expect(result.config.pruning.configs['minecraft:the_end']).toEqual(outer);
    });
    it('subtracts exclusions from a guided inclusion without broadening it',()=>{
        const result=composeChunkerConfiguration({pruning:{configs:{a:{include:true,regions:[{minChunkX:0,minChunkZ:0,maxChunkX:3,maxChunkZ:3}]}}}},{pruning:{configs:{a:{include:false,regions:[{minChunkX:0,minChunkZ:0,maxChunkX:1,maxChunkZ:3}]}}}});
        expect(result.config.pruning.configs.a).toEqual({include:true,regions:[{minChunkX:2,minChunkZ:0,maxChunkX:3,maxChunkZ:3}]});
    });
});
