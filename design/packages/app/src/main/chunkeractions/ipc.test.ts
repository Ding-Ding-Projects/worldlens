import {EventEmitter} from 'node:events';import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';import {basename,join} from 'node:path';import {tmpdir} from 'node:os';import {createHash,randomUUID} from 'node:crypto';
import type {IpcMain} from 'electron';import {describe,it,expect,vi} from 'vitest';
vi.mock('../cirender/transport.js',()=>({brokerCliTransport:vi.fn()}));
vi.mock('../cirender/upload.js',()=>({uploadWorldForRender:vi.fn()}));
vi.mock('../download/extract.js',async(importOriginal)=>({...(await importOriginal<object>()),extractZip:vi.fn()}));
vi.mock('../bedrock/convert.js',async(importOriginal)=>({...(await importOriginal<object>()),verifyConvertedWorld:vi.fn()}));
vi.mock('../bedrock/outputValidation.js',()=>({validateConvertedPayload:vi.fn()}));
import {installChunkerActionsIpc} from './ipc.js';
import {brokerCliTransport} from '../cirender/transport.js';
import {extractZip} from '../download/extract.js';
import {verifyConvertedWorld} from '../bedrock/convert.js';
import {validateConvertedPayload} from '../bedrock/outputValidation.js';
class Sender extends EventEmitter{destroyed=false;isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.emit('destroyed');}}
function install(root:string,account:unknown=async()=>null){const handlers=new Map<string,Function>();const service=installChunkerActionsIpc({ipcMain:{handle:(name:string,handler:Function)=>handlers.set(name,handler),removeHandler:(name:string)=>handlers.delete(name)} as unknown as IpcMain,account:account as never,dataDir:()=>root,packaged:true,resourcesDir:root});return{service,call:(name:string,sender:Sender,value?:unknown)=>handlers.get(`chunkerActions:${name}`)!({sender},value) as Promise<any>};}
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
describe('collecting a conversion dispatched by an earlier build',()=>{
    it('reads the inner archive under the output name that build actually dispatched',async()=>{
        const root=await mkdtemp(join(tmpdir(),'chunker-legacy-')),sender=new Sender(),id=randomUUID();
        // Exactly the record shape the previous build persisted: it dispatched `output-name` as
        // `converted-<id>` and had no field recording the dispatched value at all.
        const saved={id,request:{owner:'owner',repo:'repo',worldFolder:join(root,'source'),outputDirectory:join(root,'output'),targetFormat:'JAVA_1_21_4',config:{},acknowledgeUpload:true,acknowledgePublic:true},
            state:'completed',message:'',bytesDone:0,bytesTotal:0,upload:null,world:'v1/world.cheaplfs',dispatchedAt:'2026-01-01T00:00:00.000Z',
            run:{id:7,status:'completed',conclusion:'success'},jobs:[],archiveSha256:null,updatedAt:'2026-01-01T00:00:00.000Z'};
        await mkdir(join(root,'chunker-actions'),{recursive:true});
        await writeFile(join(root,'chunker-actions',`${id}.json`),JSON.stringify(saved));
        const payload=Buffer.from('outer artifact');
        const digest=`sha256:${createHash('sha256').update(payload).digest('hex')}`;
        const api={listRunArtifacts:async()=>[{id:1,name:'converted-world',expired:false,digest}],
            downloadArtifact:async(_owner:string,_repo:string,_item:unknown,destination:string)=>{await writeFile(destination,payload);}};
        vi.mocked(brokerCliTransport).mockImplementation((()=>api) as unknown as typeof brokerCliTransport);
        const extracted:string[]=[];
        vi.mocked(extractZip).mockImplementation((async(source:string,destination:string)=>{
            extracted.push(source);
            await mkdir(destination,{recursive:true});
            // The workflow names the inner archive after the dispatched `output-name`.
            if(extracted.length===1)await writeFile(join(destination,`converted-${id}.zip`),'inner archive');
        }) as unknown as typeof extractZip);
        vi.mocked(verifyConvertedWorld).mockImplementation((async()=>({ok:true})) as unknown as typeof verifyConvertedWorld);
        vi.mocked(validateConvertedPayload).mockImplementation((async()=>{}) as unknown as typeof validateConvertedPayload);
        const {service,call}=install(root,async()=>({}));
        try{
            expect((await call('adopt',sender,{id,confirmed:true})).ok).toBe(true);
            const collected=await call('collect',sender,id);
            expect(collected).toMatchObject({ok:true});
            expect(collected.value.state).toBe('collected');
            expect(extracted).toHaveLength(2);
            expect(basename(extracted[1]!)).toBe(`converted-${id}.zip`);
        }finally{await service.dispose();await rm(root,{recursive:true,force:true});}
    });
});
