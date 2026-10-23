import { describe,expect,it } from 'vitest';
import { containsProtectedGenerationInput,isProtectedGenerationKey } from './protectedFields.js';
import { compileGenerationPlan,describeGenerationCapabilities,sanitizeGenerationInventory,type SelectedGenerationInventory } from './capabilities.js';
const target={edition:'java' as const,version:'1.21.4',flavour:'vanilla'};
const inventory:SelectedGenerationInventory={source:{...target,reference:'fixture',sha256:'a'.repeat(64)},serverPropertyKeys:['level-seed','rcon.password','management-server-secret','unknown'],serverPropertyValues:{'level-seed':'9223372036854775807','rcon.password':'fixture-one','management-server-secret':'fixture-two',unknown:{nested:{apiKey:'fixture-three'}}},gameRules:[],generationTypes:[],dimensions:[],datapacks:[],configurationFiles:[]};
describe('generation protected fields',()=>{
    it('excludes protected controls and all observed values at the descriptor and raw-inventory boundary',()=>{
        const descriptors=describeGenerationCapabilities(target,inventory);
        expect(descriptors.some(field=>isProtectedGenerationKey(field.key))).toBe(false);
        const encoded=JSON.stringify(sanitizeGenerationInventory(inventory));
        for(const fixture of ['fixture-one','fixture-two','fixture-three'])expect(encoded).not.toContain(fixture);
        expect(sanitizeGenerationInventory(inventory).serverPropertyValues).toEqual({'level-seed':'9223372036854775807'});
    });
    it('rejects protected capabilities and unknown nested shapes before compilation',()=>{
        for(const values of [
            {'property:rcon.password':'fixture'},
            {'property:management-server-secret':'fixture'},
            {'property:unknown':{unmodelled:[{nested:{password:'fixture'}}]}},
            {'property:unknown':[{key:'rcon.password',value:'fixture'}]},
            {'property:unknown':'{"settings":{"clientSecret":"fixture"}}'},
        ])expect(()=>compileGenerationPlan(target,inventory,values)).toThrow(/Protected/);
    });
    it('detects encoded and normalized protected keys without rewriting values',()=>{
        for(const key of ['rcon.password','management-server-secret','apiKey','client_secret','ｐａｓｓｗｏｒｄ','%72con%2epassword'])expect(isProtectedGenerationKey(key)).toBe(true);
        expect(containsProtectedGenerationInput({seed:'9223372036854775807',generatorSettings:'{"layers":[]}'})).toBe(false);
    });
});
