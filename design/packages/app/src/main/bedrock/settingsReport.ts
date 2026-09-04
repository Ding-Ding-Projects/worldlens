/** Main-owned SETTINGS metadata, bound to the exact selected jar rather than renderer claims. */
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ChunkerConversion} from './convert.js';
import {sha256File} from './capabilities.js';
import {validateChunkerCliConfig,type ChunkerCliConfig} from './chunkerConfig.js';
import {worldSettingsEditorSchema,type EditorSchema} from './editorSchema.js';
export interface SettingDescriptor {name:string;type:string;value:unknown;java?:boolean;bedrock?:boolean}
export interface SelectedSettingsReport {jarSha256:string;sourceFormat:string|null;settings:Record<string,SettingDescriptor[]>;schema:Record<string,string>;editorSchema:EditorSchema;dimensions:string[]}
const schemas=new Map<string,Record<string,string>>();
const TYPES=new Set(['String','Single','Double','Byte','Int16','Int32','Int64','Boolean']);
export function schemaFromSettings(settings:unknown):Record<string,string>{
    if(!settings||typeof settings!=='object'||Array.isArray(settings))throw Error('The converter did not return grouped setting metadata.');
    const schema:Record<string,string>={};
    for(const group of Object.values(settings)){
        if(!Array.isArray(group))throw Error('Invalid setting metadata group.');
        for(const entry of group){
            if(!entry||typeof entry.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(entry.name)||!TYPES.has(entry.type)||Object.hasOwn(schema,entry.name))throw Error('Invalid or duplicated setting metadata field.');
            schema[entry.name]=entry.type;
        }
    }
    if(!schema.LevelName||!schema.RandomSeed)throw Error('The converter did not describe required world settings.');
    return schema;
}
export async function readSelectedSettings(java:string,jar:string,world:string,signal?:AbortSignal):Promise<SelectedSettingsReport>{
    signal?.throwIfAborted();
    const jarSha256=await sha256File(jar);
    const staging=await mkdtemp(join(tmpdir(),'worldlens-chunker-settings-'));
    try{
        const run=new ChunkerConversion({javaExecutable:java,jarPath:jar,inputDirectory:world,outputDirectory:staging,outputFormat:'SETTINGS'});
        const abort=()=>run.cancel();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)run.cancel();
        const timeout=setTimeout(()=>run.cancel(),120_000);let result;
        try{result=await run.start();}finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
        signal?.throwIfAborted();
        if(result.exitCode!==0||!result.completeLineSeen)throw Error(result.silentFailure??'The selected converter could not inspect source settings.');
        const path=join(staging,'data.json');if((await stat(path)).size>8*1024*1024)throw Error('The SETTINGS report exceeds 8 MiB.');
        const raw=JSON.parse(await readFile(path,'utf8'),(_key:string,value:unknown,context?:{source?:string})=>{
            if(typeof value==='number'&&Number.isInteger(value)&&!Number.isSafeInteger(value)){
                if(!context?.source)throw Error('The runtime cannot retain this exact integer setting.');return context.source;
            }return value;
        });
        const schema=schemaFromSettings(raw.settings);
        if(await sha256File(jar)!==jarSha256)throw Error('The selected converter changed during settings inspection.');
        schemas.set(jarSha256,schema);
        const values=Object.fromEntries((Object.values(raw.settings).flat() as SettingDescriptor[]).map(entry=>[entry.name,entry.value]));
        return{jarSha256,sourceFormat:result.sourceEdition,settings:raw.settings,schema,editorSchema:worldSettingsEditorSchema(schema,values),dimensions:Object.keys(raw.dimensions??{})};
    }finally{await rm(staging,{recursive:true,force:true});}
}
export async function validateSelectedChunkerConfig(value:unknown,java:string,jar:string,world:string,signal?:AbortSignal):Promise<ChunkerCliConfig|null>{
    signal?.throwIfAborted();
    if(!value||typeof value!=='object'||Array.isArray(value))return validateChunkerCliConfig(value);
    const raw=value as Record<string,unknown>;
    if(raw.worldSettings===undefined)return validateChunkerCliConfig(value);
    if(!raw.worldSettings||typeof raw.worldSettings!=='object'||Array.isArray(raw.worldSettings))return null;
    if(validateChunkerCliConfig({...raw,worldSettings:{}})===null)return null;
    if(!Object.keys(raw.worldSettings).length)return validateChunkerCliConfig(value);
    const hash=await sha256File(jar);
    const schema=schemas.get(hash)??(await readSelectedSettings(java,jar,world,signal)).schema;
    return validateChunkerCliConfig(value,schema);
}
