import { describe, expect, it } from 'vitest';
import { serverPropertiesFields } from '../config/schemas/serverProperties.js';
import { compileGenerationPlan, describeGenerationCapabilities, type SelectedGenerationInventory } from './capabilities.js';
import { isProtectedGenerationKey } from './protectedFields.js';
const target={edition:'java' as const,version:'1.21.4',flavour:'vanilla'};
const inventory:SelectedGenerationInventory={source:{...target,reference:'generated-server-schema.json',sha256:'a'.repeat(64)},serverPropertyKeys:serverPropertiesFields.map(field=>field.key),gameRules:[{name:'doDaylightCycle',value:true,control:{kind:'switch'}},{name:'mod:customRule',value:8,control:{kind:'number',integer:true}}],generationTypes:['minecraft:normal','minecraft:flat'],dimensions:['minecraft:overworld','mod:custom'],datapacks:[{id:'terrain',file:'terrain/pack.mcmeta',sourceText:'{"pack":{"pack_format":61,"description":"Terrain"}}',fields:[]},{id:'terrain',file:'terrain/data/example/worldgen/noise_settings/custom.json',sourceText:'{"sea_level":63,"unknown":{"keep":true}}',fields:[{key:'sea_level',path:['sea_level'],control:{kind:'number',integer:true}}]}]};
describe('selected generation capability inventory',()=>{
    it('lists every existing property schema member and every discovered rule and dimension',()=>{
        const descriptors=describeGenerationCapabilities(target,inventory);
        for(const field of serverPropertiesFields.filter(field=>!field.secret&&!isProtectedGenerationKey(field.key))) expect(descriptors.some(entry=>entry.key===`property:${field.key}`)).toBe(true);
        for(const rule of inventory.gameRules!) expect(descriptors.some(entry=>entry.key===`gamerule:${rule.name}`&&entry.available)).toBe(true);
        expect(descriptors.find(entry=>entry.key==='dimension:mod:custom')?.available).toBe(false);
    });
    it('keeps absent inventories explicit and refuses a mismatched source target',()=>{
        const empty=describeGenerationCapabilities(target,null);
        expect(empty.filter(entry=>entry.key.startsWith('unavailable:'))).toHaveLength(4);
        expect(empty.every(entry=>!entry.available)).toBe(true);
        const wrong=describeGenerationCapabilities({...target,version:'26.3'},inventory);
        expect(wrong.every(entry=>!entry.available)).toBe(true);
    });
    it('compiles all discovered gamerules rather than a hardcoded shortlist',()=>{
        const plan=compileGenerationPlan(target,inventory,{'gamerule:mod:customRule':12,'gamerule:doDaylightCycle':false});
        expect(plan.commands).toEqual(['gamerule mod:customRule 12','gamerule doDaylightCycle false']);
    });
    it('uses actual registry choices and preserves exact seed strings',()=>{
        const plan=compileGenerationPlan(target,inventory,{'generation:types':'minecraft:flat','property:level-seed':'9223372036854775807'});
        expect(plan.serverProperties).toEqual({'level-type':'minecraft:flat','level-seed':'9223372036854775807'});
        expect(()=>compileGenerationPlan(target,inventory,{'generation:types':'invented'})).toThrow();
    });
    it('edits strict datapack JSON while retaining unknown fields and all supplied pack files',()=>{
        const plan=compileGenerationPlan(target,inventory,{'datapack:terrain:sea_level':80});
        expect(plan.datapackFiles).toHaveLength(2);
        const file=plan.datapackFiles.find(entry=>entry.path.endsWith('custom.json'))!;
        expect(JSON.parse(file.content)).toEqual({sea_level:80,unknown:{keep:true}});
    });
    it('rejects unavailable capabilities, unsafe paths and wrong typed rules',()=>{
        expect(()=>compileGenerationPlan(target,inventory,{'dimension:mod:custom':true})).toThrow();
        expect(()=>compileGenerationPlan(target,inventory,{'gamerule:doDaylightCycle':'false'})).toThrow();
        const escaped={...inventory,datapacks:[{...inventory.datapacks[1]!,file:'../outside.json'}]};
        expect(()=>compileGenerationPlan(target,escaped,{'datapack:terrain:sea_level':80})).toThrow();
    });
});
