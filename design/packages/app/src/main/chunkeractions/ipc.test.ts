import {EventEmitter} from 'node:events';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import type {IpcMain} from 'electron';import {describe,it,expect,vi} from 'vitest';
vi.mock('../cirender/transport.js',()=>({brokerCliTransport:vi.fn()}));
vi.mock('../cirender/upload.js',()=>({uploadWorldForRender:vi.fn()}));
import {brokerCliTransport} from '../cirender/transport.js';
import {installChunkerActionsIpc} from './ipc.js';
class Sender extends EventEmitter{destroyed=false;isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.emit('destroyed');}}
function install(root:string,account:any=async()=>null){const handlers=new Map<string,Function>();const service=installChunkerActionsIpc({ipcMain:{handle:(name:string,handler:Function)=>handlers.set(name,handler),removeHandler:(name:string)=>handlers.delete(name)} as unknown as IpcMain,account,dataDir:()=>root,packaged:true,resourcesDir:root});return{service,call:(name:string,sender:Sender,value?:unknown)=>handlers.get(`chunkerActions:${name}`)!({sender},value) as Promise<any>};}
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
describe('conversion start upload consent',()=>{
    /** The panel renders the upload and public-visibility switches only when this app uploads the world itself, so the
     *  start gate must ask for that consent only in the same case. A url or artifact dispatch uploads nothing. */
    const api=(dispatched:Record<string,string>[])=>({
        readRepository:async()=>({canWrite:true,private:false}),
        readFile:async()=>({contentBase64:Buffer.from('chunker-config: {}').toString('base64'),sha:'recipe'}),
        readDefaultBranch:async()=>'main',
        dispatchWorkflow:async(_owner:string,_repo:string,_file:string,_ref:string,inputs:Record<string,string>)=>{dispatched.push(inputs);},
    });
    it('dispatches a url world with no consent flags, and still demands them for its own upload',async()=>{
        const root=await mkdtemp(join(tmpdir(),'chunker-consent-')),sender=new Sender(),dispatched:Record<string,string>[]=[];
        vi.mocked(brokerCliTransport).mockReturnValue(api(dispatched) as any);
        const {service,call}=install(root,async()=>({}));
        const base={worldFolder:join(root,'source'),outputDirectory:join(root,'output'),targetFormat:'JAVA_1_21_4',config:{}};
        try{
            const external=await call('start',sender,{...base,owner:'owner',repo:'repo',worldSource:'url',externalWorld:'https://example.com/world.zip',acknowledgeUpload:false,acknowledgePublic:false});
            expect(external.ok).toBe(true);
            await vi.waitFor(()=>expect(external.value.state).toBe('waiting'));
            expect(dispatched).toHaveLength(1);
            expect(dispatched[0]).toMatchObject({'world-source':'url',world:'https://example.com/world.zip','world-repository':''});
            const own=await call('start',sender,{...base,owner:'owner',repo:'other',worldSource:'release-asset',externalWorld:'',acknowledgeUpload:false,acknowledgePublic:false});
            expect(own.ok).toBe(true);
            await vi.waitFor(()=>expect(own.value.state).toBe('failed'));
            expect(own.value.message).toContain('Confirm the world upload');
            expect(dispatched).toHaveLength(1);
        }finally{await service.dispose();vi.mocked(brokerCliTransport).mockReset();await rm(root,{recursive:true,force:true});}
    });
});
