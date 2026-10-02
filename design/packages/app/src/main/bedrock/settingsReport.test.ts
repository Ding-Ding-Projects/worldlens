import {describe,it,expect} from 'vitest';import {schemaFromSettings} from './settingsReport.js';import {validateWorldSettings} from './chunkerConfig.js';
describe('trusted selected-jar setting metadata',()=>{
    const valid={World:[{name:'LevelName',type:'String',value:'World'},{name:'RandomSeed',type:'String',value:'7'},{name:'NewBoolean',type:'Boolean',value:true}]};
    it('uses only exact fields and types reported by SETTINGS',()=>{
        const schema=schemaFromSettings(valid);expect(validateWorldSettings({NewBoolean:false},schema)).toBe(true);expect(validateWorldSettings({NewBoolean:'false'},schema)).toBe(false);expect(validateWorldSettings({Invented:true},schema)).toBe(false);
    });
    it('refuses malformed, duplicated and unknown type descriptors',()=>{
        expect(()=>schemaFromSettings({World:[...valid.World,valid.World[0]]})).toThrow(/duplicated/);
        expect(()=>schemaFromSettings({World:[...valid.World,{name:'Unknown',type:'Executable'}]})).toThrow();
        expect(()=>schemaFromSettings({World:[]})).toThrow(/required/);
    });
});
