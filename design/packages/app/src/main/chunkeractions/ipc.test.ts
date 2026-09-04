import {EventEmitter} from 'node:events';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import type {IpcMain} from 'electron';import {describe,it,expect,vi} from 'vitest';
vi.mock('../cirender/transport.js',()=>({brokerCliTransport:vi.fn()}));
vi.mock('../cirender/upload.js',()=>({uploadWorldForRender:vi.fn()}));
import {installChunkerActionsIpc} from './ipc.js';
class Sender extends EventEmitter{destroyed=false;isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.emit('destroyed');}}
function install(root:string){const handlers=new Map<string,Function>();const service=installChunkerActionsIpc({ipcMain:{handle:(name:string,handler:Function)=>handlers.set(name,handler),removeHandler:(name:string)=>handlers.delete(name)} as unknown as IpcMain,account:async()=>null,dataDir:()=>root,packaged:true,resourcesDir:root});return{service,call:(name:string,sender:Sender,value?:unknown)=>handlers.get(`chunkerActions:${name}`)!({sender},value) as Promise<any>};}
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
