import {EventEmitter} from 'node:events';import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import type {IpcMain} from 'electron';import {describe,it,expect,vi} from 'vitest';
vi.mock('../cirender/transport.js',()=>({brokerCliTransport:vi.fn()}));
vi.mock('../cirender/upload.js',()=>({uploadWorldForRender:vi.fn()}));
vi.mock('../download/extract.js',async(original)=>({...(await original<object>()),extractZip:vi.fn()}));
vi.mock('../bedrock/convert.js',async(original)=>({...(await original<object>()),verifyConvertedWorld:vi.fn()}));
vi.mock('../bedrock/outputValidation.js',async(original)=>({...(await original<object>()),validateConvertedPayload:vi.fn()}));
vi.mock('@worldlens/parts',async(original)=>({...(await original<object>()),sha256File:vi.fn()}));
import {sha256File} from '@worldlens/parts';
import {brokerCliTransport} from '../cirender/transport.js';
import {extractZip} from '../download/extract.js';
import {verifyConvertedWorld} from '../bedrock/convert.js';
import {validateConvertedPayload} from '../bedrock/outputValidation.js';
import {installChunkerActionsIpc} from './ipc.js';
class Sender extends EventEmitter{destroyed=false;isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.emit('destroyed');}}
function install(root:string,account:(()=>Promise<unknown>)|null=null){const handlers=new Map<string,Function>();const service=installChunkerActionsIpc({ipcMain:{handle:(name:string,handler:Function)=>handlers.set(name,handler),removeHandler:(name:string)=>handlers.delete(name)} as unknown as IpcMain,account:(account??(async()=>null)) as never,dataDir:()=>root,packaged:true,resourcesDir:root});return{service,call:(name:string,sender:Sender,value?:unknown)=>handlers.get(`chunkerActions:${name}`)!({sender},value) as Promise<any>};}
describe('conversion action ownership channels',()=>{
    it('scopes list, check, collect and cancel to the originating sender',async()=>{
        const root=await mkdtemp(join(tmpdir(),'chunker-owner-')),a=new Sender(),b=new Sender();const {service,call}=install(root);
        try{
            const started=await call('start',a,{owner:'owner',repo:'repo',worldFolder:join(root,'source'),outputDirectory:join(root,'output'),targetFormat:'JAVA_1_21_4',config:{},acknowledgeUpload:true,acknowledgePublic:true});
            expect(started.ok).toBe(true);const id=started.value.id;
            expect((await call('list',a)).value).toHaveLength(1);expect((await call('list',b)).value).toEqual([]);
            for(const action of ['check','collect','cancel'])expect(await call(action,b,id)).toMatchObject({ok:false,message:expect.stringContaining('not owned')});
            expect((await call('recoverable',b)).value).toEqual([]);
            expect(await call('adopt',b,{id,confirmed:true})).toMatchObject({ok:false});
            await vi.waitFor(()=>expect(started.value.state).toBe('failed'));
        }finally{await service.dispose();await rm(root,{recursive:true,force:true});}
    });
    it('requires explicit adoption after restart before revealing or acting on a saved record',async()=>{
        const root=await mkdtemp(join(tmpdir(),'chunker-adopt-')),a=new Sender(),b=new Sender();const first=install(root);
        try{
            const started=await first.call('start',a,{owner:'owner',repo:'repo',worldFolder:join(root,'source'),outputDirectory:join(root,'output'),targetFormat:'JAVA_1_21_4',config:{},acknowledgeUpload:true,acknowledgePublic:true});
            await vi.waitFor(()=>expect(started.value.state).toBe('failed'));await first.service.dispose();
            const second=install(root);try{
                const choices=await second.call('recoverable',b);expect(choices.value).toHaveLength(1);expect(choices.value[0]).not.toHaveProperty('request');
                expect((await second.call('list',b)).value).toEqual([]);
                expect((await second.call('check',b,started.value.id)).ok).toBe(false);
                expect((await second.call('adopt',b,{id:started.value.id,confirmed:false})).ok).toBe(false);
                expect((await second.call('adopt',b,{id:started.value.id,confirmed:true})).ok).toBe(true);
                expect((await second.call('list',b)).value).toHaveLength(1);
            }finally{await second.service.dispose();}
        }finally{await first.service.dispose();await rm(root,{recursive:true,force:true});}
    });
});
const DIGEST='a'.repeat(64);
/** Stages a saved record in the completed state, plus the mocked download and extraction collection walks. */
async function stageCompletedConversion(root:string,options:{outputName?:(id:string)=>string;staged:(id:string)=>readonly string[]}){
    const id=randomUUID();
    const archive=join(root,'chunker-actions',`${id}.zip`);
    await mkdir(join(root,'chunker-actions'),{recursive:true});
    await writeFile(join(root,'chunker-actions',`${id}.json`),JSON.stringify({id,bootId:randomUUID(),
        request:{owner:'owner',repo:'repo',worldFolder:join(root,'source'),outputDirectory:join(root,'output'),targetFormat:'JAVA_1_21_4',config:{},acknowledgeUpload:true,acknowledgePublic:true},
        state:'completed',message:'completed',bytesDone:0,bytesTotal:0,upload:null,world:'tag/world.cheaplfs',
        ...(options.outputName?{dispatchedOutputName:options.outputName(id)}:{}),
        dispatchedAt:new Date().toISOString(),run:{id:42,status:'completed',conclusion:'success'},jobs:[],archiveSha256:null,updatedAt:new Date().toISOString()}));
    vi.mocked(sha256File).mockResolvedValue(DIGEST);
    vi.mocked(verifyConvertedWorld).mockResolvedValue({ok:true} as never);
    vi.mocked(validateConvertedPayload).mockResolvedValue(undefined);
    vi.mocked(extractZip).mockImplementation((async(source:string,destination:string)=>{
        await mkdir(destination,{recursive:true});
        if(source===archive)for(const name of options.staged(id))await writeFile(join(destination,name),'world archive');
        return {} as never;
    }) as never);
    vi.mocked(brokerCliTransport).mockResolvedValue({listRunArtifacts:async()=>[{id:7,name:'converted-world',expired:false,digest:`sha256:${DIGEST}`}],
        downloadArtifact:async()=>undefined} as never);
    return {id,archive};
}
describe('collecting the converted world archive',()=>{
    it('collects a conversion dispatched before the output name was recorded',async()=>{
        const root=await mkdtemp(join(tmpdir(),'chunker-legacy-')),sender=new Sender();
        // A record persisted by an earlier build carries no dispatchedOutputName, and its run was dispatched
        // under the `converted-<id>` prefix rather than the current `converted-world-<id>` one.
        const {id}=await stageCompletedConversion(root,{staged:(recordId)=>[`converted-${recordId}.zip`]});
        const {service,call}=install(root,async()=>({}));
        try{
            expect((await call('adopt',sender,{id,confirmed:true})).ok).toBe(true);
            const collected=await call('collect',sender,id);
            expect(collected).toMatchObject({ok:true});
            expect(collected.value.state).toBe('collected');
            expect(collected.value.archiveSha256).toBe(DIGEST);
        }finally{await service.dispose();await rm(root,{recursive:true,force:true});}
    });
    it('names the missing archive plainly when the artifact carries none',async()=>{
        const root=await mkdtemp(join(tmpdir(),'chunker-empty-')),sender=new Sender();
        const {id}=await stageCompletedConversion(root,{outputName:(recordId)=>`converted-world-${recordId}`,staged:()=>[]});
        const {service,call}=install(root,async()=>({}));
        try{
            expect((await call('adopt',sender,{id,confirmed:true})).ok).toBe(true);
            expect(await call('collect',sender,id)).toEqual({ok:false,message:'The expected converted world archive is missing.'});
        }finally{await service.dispose();await rm(root,{recursive:true,force:true});}
    });
    it('uses the recorded output name to choose between several archives',async()=>{
        const root=await mkdtemp(join(tmpdir(),'chunker-several-')),sender=new Sender();
        const {id}=await stageCompletedConversion(root,{outputName:(recordId)=>`converted-world-${recordId}`,
            staged:(recordId)=>['unrelated.zip',`converted-world-${recordId}.zip`]});
        const {service,call}=install(root,async()=>({}));
        try{
            expect((await call('adopt',sender,{id,confirmed:true})).ok).toBe(true);
            expect(await call('collect',sender,id)).toMatchObject({ok:true});
            const sources=vi.mocked(extractZip).mock.calls.map((entry)=>String(entry[0]));
            expect(sources.some((source)=>source.endsWith(`converted-world-${id}.zip`))).toBe(true);
            expect(sources.some((source)=>source.endsWith('unrelated.zip'))).toBe(false);
        }finally{await service.dispose();await rm(root,{recursive:true,force:true});}
    });
});
