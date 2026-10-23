import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('../registry.js',()=>({createServerRegistry:vi.fn()}));
vi.mock('../../project/save.js',()=>({saveProject:vi.fn()}));
vi.mock('../../project/file.js',()=>({readProject:vi.fn()}));
vi.mock('../create.js',()=>({createLocalServer:vi.fn()}));
vi.mock('./inventory.js',()=>({acquireGenerationInventory:vi.fn()}));
vi.mock('../transport/factory.js',()=>({createTransport:vi.fn()}));
vi.mock('../flavours/catalogue.js',()=>({listCatalogue:vi.fn(async()=>({ok:true,value:{flavours:[{flavour:'vanilla',versions:[{version:'1.21.4',downloadUrl:'https://example.invalid/server.jar'}]}]}}))}));
import { registerGenerationIpc, GENERATION_CHANNELS, GENERATION_PROGRESS_EVENT } from './register.js';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { ServerRecord,ServerRegistry } from '../registry.js';
import type { CreateLocalServerOptions } from '../create.js';

const input={operationId:'generated',name:'Generated',edition:'java',flavour:'vanilla',version:'1.21.4',seed:'9223372036854775807',worldName:'world',memoryMb:1024,port:25566,acceptedEula:true,downloadConsent:true,provisionJavaIfMissing:false};
function setup(root:string){
    const handlers=new Map<string,(event:IpcMainInvokeEvent,input:unknown)=>Promise<unknown>>();
    const ipc={handle:(channel:string,handler:(event:IpcMainInvokeEvent,input:unknown)=>Promise<unknown>)=>handlers.set(channel,handler),removeHandler:(channel:string)=>handlers.delete(channel)} as unknown as Pick<IpcMain,'handle'|'removeHandler'>;
    const sender={isDestroyed:()=>false,getURL:()=> 'file:///workspace/index.html',send:vi.fn()};
    const event={sender} as unknown as IpcMainInvokeEvent;
    const server={id:'generated',name:'Generated',flavour:'vanilla',minecraftVersion:'1.21.4',ref:{kind:'local-process',serverDir:root},localRuntime:{javaPath:'java',jarPath:join(root,'server.jar'),memoryMb:1024}} as ServerRecord;
    const create=vi.fn(async(_options:CreateLocalServerOptions)=>({ok:true as const,value:server}));
    const generate=vi.fn(async(request:{serverProperties:Readonly<Record<string,string>>})=>({ok:true as const,value:{worldFolder:join(root,'world'),zipPath:null,chunkCount:1,bytes:8192,seed:request.serverProperties['level-seed']??null,requestedSeed:request.serverProperties['level-seed']??''}}));
    const registered=registerGenerationIpc(ipc,{dataFolder:root,resourcesPath:'C:/main-owned-resources',registry:{get:vi.fn(async()=>({ok:true,value:server}))} as unknown as ServerRegistry,createServer:create,generate,createProject:async()=>({ok:true,value:{projectPath:join(root,'world','worldlens.json')}}),readProject:async()=>({ok:true,value:{worldFolder:join(root,'world')}})});
    return{handlers,event,sender,create,generate,registered};
}
describe('generation IPC main boundary',()=>{
    it('rejects service, filesystem and runtime injection',async()=>{
        const context=setup(tmpdir());
        for(const extra of [{registry:{}},{dataDir:'C:/elsewhere'},{serversRoot:'C:/elsewhere'},{javaPath:'C:/malicious.exe'},{createProject:'function'}]){
            const result=await context.handlers.get(GENERATION_CHANNELS.run)!(context.event,{...input,...extra}) as {ok:boolean};expect(result.ok).toBe(false);
        }
        expect(context.create).not.toHaveBeenCalled();context.registered.dispose();
    });
    it('rejects untrusted renderers, invalid paths and non-string seeds',async()=>{
        const context=setup(tmpdir());
        for(const invalid of [{...input,worldName:'../outside'},{...input,seed:9223372036854775807},{...input,properties:{'rcon.password':'blocked'}}])expect((await context.handlers.get(GENERATION_CHANNELS.run)!(context.event,invalid) as {ok:boolean}).ok).toBe(false);
        const untrusted={sender:{...context.sender,getURL:()=> 'https://untrusted.invalid/'}} as unknown as IpcMainInvokeEvent;
        expect((await context.handlers.get(GENERATION_CHANNELS.read)!(untrusted,'generated') as {ok:boolean}).ok).toBe(false);context.registered.dispose();
    });
    it('uses main-owned services, keeps the selected port and reports progress',async()=>{
        const root=await mkdtemp(join(tmpdir(),'worldlens-register-'));
        try{
            await mkdir(join(root,'world'),{recursive:true});await writeFile(join(root,'world','level.dat'),Buffer.alloc(8));
            await writeFile(join(root,'server.properties'),'server-port=25566\nenable-rcon=false\n');
            const context=setup(root);
            const result=await context.handlers.get(GENERATION_CHANNELS.run)!(context.event,input) as {ok:boolean};
            expect(result.ok).toBe(true);
            expect(context.create.mock.calls[0]?.[0]).toMatchObject({dataDir:root,resourcesPath:'C:/main-owned-resources',port:25566});
            expect(context.generate.mock.calls[0]?.[0].serverProperties['server-port']).toBe('25566');
            expect(context.generate.mock.calls[0]?.[0].serverProperties['level-seed']).toBe('9223372036854775807');
            expect(context.sender.send).toHaveBeenCalledWith(GENERATION_PROGRESS_EVENT,expect.objectContaining({operationId:'generated',sequence:1}));
            context.registered.dispose();expect(context.handlers.size).toBe(0);
        }finally{await rm(root,{recursive:true,force:true});}
    });
});
