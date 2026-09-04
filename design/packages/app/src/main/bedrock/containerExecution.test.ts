import {EventEmitter} from 'node:events';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import type {IpcMain} from 'electron';import {describe,it,expect,vi} from 'vitest';
const probe=vi.hoisted(()=>({signal:null as AbortSignal|null}));
vi.mock('./chunker.js',()=>({findChunker:async()=>({found:true,jarPath:'/selected/chunker.jar'})}));
vi.mock('./approvedImage.js',()=>({APPROVED_CHUNKER_IMAGE:'eclipse-temurin:25-jre',resolveApprovedChunkerImage:(_image:unknown,_run:unknown,signal:AbortSignal)=>new Promise((_resolve,reject)=>{probe.signal=signal;signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});})}));
import {installChunkerContainerIpc} from './containerExecution.js';
class Sender extends EventEmitter{destroyed=false;isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.emit('destroyed');}}
describe('container conversion ownership channels',()=>{
    it('rejects cross-sender state/cancel and aborts on the owner destruction',async()=>{
        const root=await mkdtemp(join(tmpdir(),'chunker-container-owner-')),handlers=new Map<string,Function>(),a=new Sender(),b=new Sender();
        installChunkerContainerIpc({ipcMain:{handle:(name:string,handler:Function)=>handlers.set(name,handler)} as unknown as IpcMain,dataDir:root,resolveJava:async()=>({ok:false,message:'not needed'})});
        const call=(name:string,sender:Sender,value?:unknown)=>handlers.get(`bedrock:${name}`)!({sender},value) as Promise<any>;
        try{
            const started=await call('containerStart',a,{kind:'docker',world:join(root,'source'),output:join(root,'output'),format:'JAVA_1_21_4',config:{},image:'eclipse-temurin:25-jre',acknowledgeTransfer:true});
            expect(started.ok).toBe(true);await vi.waitFor(()=>expect(probe.signal).not.toBeNull());
            expect((await call('containerState',b,started.value.id)).ok).toBe(false);expect((await call('containerCancel',b,started.value.id)).ok).toBe(false);expect(probe.signal?.aborted).toBe(false);
            a.destroy();expect(probe.signal?.aborted).toBe(true);await vi.waitFor(()=>expect(started.value.complete).toBe(true));
        }finally{a.destroy();await rm(root,{recursive:true,force:true});}
    });
});
