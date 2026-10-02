import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import YAML from 'yaml';import {describe,it,expect,vi} from 'vitest';
const workflow=YAML.parse(readFileSync(new URL('../../../../../../.github/workflows/chunk-world.yml',import.meta.url),'utf8'));
function plan(config:object,inspection:string,target='JAVA_1_21_4'){
    const step=workflow.jobs.plan.steps.find((entry:any)=>typeof entry.run==='string'&&entry.run.includes('const sourceFormat ='));
    const text=step.run.replaceAll('\r\n','\n');const source=text.split("node <<'NODE'\n")[1]?.split('\nNODE')[0];if(!source)throw Error('The registered plan script is missing.');
    const writes=new Map<string,string>();
    const settings={dimensions:{'minecraft:overworld':[[0,0]]},settings:{World:[{name:'LevelName',type:'String',value:'World'},{name:'RandomSeed',type:'String',value:'7'}]}};
    const io={readFileSync:(name:string)=>name==='settings-inspection.log'?inspection:JSON.stringify(settings),writeFileSync:(name:string,text:string)=>writes.set(name,text),appendFileSync:vi.fn()};
    runInNewContext(source,{require:(name:string)=>{if(name!=='node:fs')throw Error('Unexpected dependency');return io;},process:{env:{CHUNKER_CONFIG:JSON.stringify(config),TARGET_FORMAT:target,GITHUB_OUTPUT:'output',GITHUB_STEP_SUMMARY:'summary'},exit:(code:number)=>{throw Error(`Exited ${code}`);}},console:{log:vi.fn()}});
    return JSON.parse(writes.get('conversion-plan.json')??'null');
}
describe('registered conversion workflow preflight',()=>{
    it('binds original NBT to the real SETTINGS source format',()=>{
        const result=plan({keepOriginalNBT:true},'Converting from Java 1.21.4 to Settings 1.0.0\nConversion complete!');
        expect(result.shards[0].sourceFormat).toBe('JAVA_1_21_4');
        expect(()=>plan({keepOriginalNBT:true},'Converting from Bedrock 1.21.40 to Settings 1.0.0\nConversion complete!')).toThrow(/exact input and output format/);
    });
    it('does not accept an unknown source or a source format forged in the uploaded configuration',()=>{
        expect(()=>plan({keepOriginalNBT:true,sourceFormat:'JAVA_1_21_4'},'Conversion complete!')).toThrow(/trusted SETTINGS/);
    });
    it('rejects world settings missing from the actual jar report',()=>{
        expect(()=>plan({worldSettings:{FakeField:true}},'Converting from Java 1.21.4 to Settings 1.0.0')).toThrow(/unknown/);
        expect(()=>plan({worldSettings:{LevelName:2}},'Converting from Java 1.21.4 to Settings 1.0.0')).toThrow(/schema/);
        expect(plan({worldSettings:{LevelName:'Chosen',RandomSeed:'7'}},'Converting from Java 1.21.4 to Settings 1.0.0').shards).toHaveLength(1);
    });
});
