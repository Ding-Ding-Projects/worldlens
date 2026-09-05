/** Bounded container execution using existing target validation, SSH trust and transfers. */
import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join, dirname, isAbsolute, relative } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { IpcMain } from 'electron';
import { SenderOwnership, type OperationSender } from './senderOwnership.js';
import { ChunkerConversion, verifyConvertedWorld } from './convert.js';
import { validateChunkerCliConfig,validateChunkerConfigStructure } from './chunkerConfig.js';
import {readSelectedSettings,validateSelectedChunkerConfig} from './settingsReport.js';
import {validateConvertedPayload} from './outputValidation.js';
import { findChunker } from './chunker.js';
import { validateTarget } from '../remote/target.js';
import { preflight } from '../remote/preflight.js';
import { sshArguments, remoteCommandLine } from '../remote/ssh.js';
import { scpTransfer } from '../remote/transfer.js';
import { chooseTransfer } from '../remote/rsync.js';
import { execFileCommandRunner } from '../runtime/command.js';
import { APPROVED_CHUNKER_IMAGE, resolveApprovedChunkerImage } from './approvedImage.js';

export const CONTAINER_CHANNELS = ['bedrock:containerImages','bedrock:containerStart','bedrock:containerState','bedrock:containerCancel'] as const;
interface Options { ipcMain: IpcMain; dataDir: string; configuredJar?: string | null; resourcesPath?: string | null; resolveJava:()=>Promise<{ok:true;executable:string}|{ok:false;message:string}> }
interface State { id: string; phase: string; percent: number; logs: string[]; complete: boolean; ok: boolean; output: string | null; message: string; runtimeImage: string|null }
export function installChunkerContainerIpc(options: Options): void {
    const states = new Map<string, State>();
    const cancels = new Map<string, () => void>();
    const activeOutputs = new Set<string>();
    const ownership = new SenderOwnership(id => cancels.get(id)?.());
    const handler = (name: typeof CONTAINER_CHANNELS[number], run: (value: any, sender: OperationSender) => Promise<unknown>) => options.ipcMain.handle(name, async (event, value: unknown) => {
        try { return { ok: true, value: await run(value, event.sender) }; }
        catch(error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    });
    handler('bedrock:containerImages', async () => {
        return [APPROVED_CHUNKER_IMAGE];
    });
    handler('bedrock:containerState', async (id, sender) => states.get(ownership.require(id, sender)) ?? null);
    handler('bedrock:containerCancel', async (id, sender) => { ownership.require(id, sender); cancels.get(id)?.(); return states.get(id) ?? null; });
    handler('bedrock:containerStart', async (request, sender) => {
        if(!request || !['docker','ssh'].includes(request.kind) || typeof request.world !== 'string' || typeof request.output !== 'string' ||
            !isAbsolute(request.world) || !isAbsolute(request.output) || !/^(JAVA|BEDROCK)_[A-Z0-9_]+$/.test(request.format ?? '')) throw Error('Choose a valid source, new output folder and target format.');
        if(request.acknowledgeTransfer !== true) throw Error('Confirm that the selected route may read or receive this world.');
        const rel=relative(request.world,request.output);
        if(rel === '' || (!rel.startsWith('..')&&!isAbsolute(rel))) throw Error('The output folder must be outside the source world.');
        if(await stat(request.output).catch(()=>null)) throw Error('Choose a new output folder; the converter never replaces an existing world.');
        if(activeOutputs.has(request.output)) throw Error('A conversion for this output directory is already active.');
        if(!validateChunkerConfigStructure(request.config)) throw Error('The conversion configuration is invalid.');
        const memory = Number(request.memoryGiB ?? 6);
        if(!Number.isInteger(memory) || memory<2 || memory>64) throw Error('Choose a whole memory limit from 2 through 64 GiB.');
        const image=String(request.image ?? '');
        if(image !== APPROVED_CHUNKER_IMAGE) throw Error('Choose the approved Eclipse Temurin Java runtime.');
        const preflightController=new AbortController();const stopPreflight=()=>preflightController.abort();
        if(sender.isDestroyed())throw Error('The originating window is no longer available.');
        sender.once('destroyed',stopPreflight);
        const {lookup,config}=await (async()=>{
            const lookup=await findChunker({dataDir:options.dataDir,...(options.resourcesPath ? {resourcesPath:options.resourcesPath}:{}),...(options.configuredJar ? {configuredJar:options.configuredJar}:{})});
            if(!lookup.found)throw Error(lookup.reason);
            preflightController.signal.throwIfAborted();
            let config=validateChunkerCliConfig(request.config);
            if(request.config?.worldSettings&&Object.keys(request.config.worldSettings).length){
                const java=await options.resolveJava();if(!java.ok)throw Error(java.message);
                config=await validateSelectedChunkerConfig(request.config,java.executable,lookup.jarPath,request.world,preflightController.signal);
            }
            if(!config)throw Error('A setting is unknown to the selected converter or has the wrong type. Inspect source settings again.');
            if(config.keepOriginalNBT){
                const java=await options.resolveJava();if(!java.ok)throw Error(java.message);
                const report=await readSelectedSettings(java.executable,lookup.jarPath,request.world,preflightController.signal);
                const sourceFormat=report.sourceFormat?.toUpperCase().replace(/[ .]/g,'_');
                if(!sourceFormat||sourceFormat!==request.format)throw Error('Original NBT requires an exact source and target format match from the selected converter.');
            }
            return{lookup,config};
        })().finally(()=>sender.removeListener?.('destroyed',stopPreflight));
        const id=randomUUID();
        ownership.claim(id, sender);
        const state: State={id,phase:'preparing',percent:0,logs:[],complete:false,ok:false,output:null,message:'Preparing the selected container route.',runtimeImage:null};
        states.set(id,state);
        activeOutputs.add(request.output);
        const controller=new AbortController(); let live: ChunkerConversion | null=null;
        let stopContainer: (()=>Promise<void>) | null=null;
        cancels.set(id,()=>{controller.abort();live?.cancel();void stopContainer?.();});
        const operationTimeout=setTimeout(()=>{controller.abort();live?.cancel();void stopContainer?.();},3_600_000);
        const log=(line:string)=>{state.logs=[...state.logs,line].slice(-80);};
        const run=async()=>{
            controller.signal.throwIfAborted();
            const staging=join(dirname(request.output),`.worldlens-chunker-${id}`);
            const configDir=join(staging,'config');
            await mkdir(configDir,{recursive:true});
            const files: string[]=[]; const cli: string[]=[];
            for(const [name,value] of Object.entries(config)) {
                if(name==='keepOriginalNBT') continue;
                await writeFile(join(configDir,`${name}.json`),JSON.stringify(value));
                files.push(`${name}.json`); cli.push(`--${name}`,`/work/config/${name}.json`);
            }
            if(config.keepOriginalNBT) cli.push('--keepOriginalNBT');
            let input=request.world, jar=lookup.jarPath, work=staging;
            let transfer: Awaited<ReturnType<typeof chooseTransfer>>['transfer'] | null=null;
            let command='docker'; let sshPrefix: string[]=[];
            let resolvedImage:string;
            const containerName=`worldlens-chunker-${id}`;
            if(request.kind==='ssh') {
                const targetResult=validateTarget(request.target ?? {});
                if(!targetResult.ok) throw Error(targetResult.failure.message);
                const target=targetResult.target;
                const security={target,knownHostsFile:join(options.dataDir,'known_hosts'),userKnownHostsFile:join(homedir(),'.ssh','known_hosts')};
                const report=await preflight(target,security);
                if(!report.ok || !report.workDir) throw Error(report.failure?.message ?? 'The SSH host did not pass preflight. Review its host key and runtime in Remote settings.');
                state.phase='resolving-runtime';
                const remoteRunner: typeof execFileCommandRunner=(_executable,args,opts)=>execFileCommandRunner('ssh',[...sshArguments(security),remoteCommandLine(['docker',...args])],opts);
                resolvedImage=await resolveApprovedChunkerImage(image,remoteRunner,controller.signal);
                work=`${report.workDir}/chunker-${id}`; input=`${work}/input`; jar=`${work}/chunker.jar`;
                const runner: typeof execFileCommandRunner=(executable,args,opts)=>execFileCommandRunner(executable,args,{...opts,timeoutMs:3_600_000});
                const choice=await chooseTransfer({...security,runner,signal:controller.signal,scpTransfer:scpTransfer({...security,runner}),onLine:log});
                transfer=choice.transfer; log(choice.message);
                const transferOptions={signal:controller.signal,onLine:log};
                state.phase='uploading';
                await transfer.makeRemoteDirectory(`${work}/config`,transferOptions);
                await transfer.uploadDirectory(request.world,input,transferOptions);
                await transfer.uploadFile(lookup.jarPath,jar,transferOptions);
                for(const file of files) await transfer.uploadFile(join(configDir,file),`${work}/config/${file}`,transferOptions);
                command='ssh'; sshPrefix=sshArguments(security);
            } else { state.phase='resolving-runtime'; resolvedImage=await resolveApprovedChunkerImage(image,execFileCommandRunner,controller.signal); }
            state.runtimeImage=resolvedImage;
            await writeFile(join(staging,'runtime.json'),JSON.stringify({image:resolvedImage}));
            if([input,jar,work].some(path=>path.includes(','))) throw Error('Container mount paths containing commas are not supported. Choose another path.');
            const docker=['run','--rm','--pull','never','--name',containerName,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory',`${memory}g`,'--pids-limit','512','--tmpfs','/tmp:rw,nosuid,size=512m','--entrypoint','java',
                '--mount',`type=bind,source=${input},target=/input,readonly`,'--mount',`type=bind,source=${jar},target=/chunker.jar,readonly`,'--mount',`type=bind,source=${work},target=/work`,resolvedImage];
            const stopArgs=['stop','--time','8',containerName];
            stopContainer=async()=>{await execFileCommandRunner(command,command==='ssh'?[...sshPrefix,remoteCommandLine(['docker',...stopArgs])]:stopArgs);};
            state.phase='converting';
            controller.signal.throwIfAborted();
            live=new ChunkerConversion({javaExecutable:'java',jarPath:'/chunker.jar',inputDirectory:'/input',outputDirectory:'/work/output',outputFormat:request.format,jvmArgs:[`-Xmx${Math.max(1,memory-1)}G`],
                onEvent:event=>{if(event.kind==='progress')state.percent=event.percent;else if(event.kind==='log')log(event.line);},
                spawn:(_executable,args,settings)=>spawn(command,command==='ssh'?[...sshPrefix,remoteCommandLine(['docker',...docker,...args,...cli])]:[...docker,...args,...cli],{...settings,cwd:staging,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']}),
            });
            const timeout=setTimeout(()=>{controller.abort();live?.cancel();void stopContainer?.();},3_600_000);
            let result; try {result=await live.start();} finally {clearTimeout(timeout);}
            if(controller.signal.aborted || result.cancelled) throw Error('Conversion cancelled. Partial staging data is retained; the source world was not changed.');
            if(result.exitCode!==0 || !result.completeLineSeen) throw Error(result.silentFailure ?? result.diagnostics.at(-1) ?? 'The converter did not report completion.');
            state.phase='collecting';
            const localOutput=join(staging,'output');
            if(transfer) await transfer.downloadDirectory(`${work}/output`,localOutput,{signal:controller.signal,onLine:log});
            const verified=await verifyConvertedWorld(localOutput,request.format);
            if(!verified.ok) throw Error(verified.reason);
            await validateConvertedPayload(localOutput,request.format);
            controller.signal.throwIfAborted();
            await mkdir(dirname(request.output),{recursive:true});
            await rename(localOutput,request.output);
            state.ok=true; state.output=request.output; state.percent=100; state.phase='finished';
            state.message='The converter completed and the returned world passed structural verification.';
            if(transfer) log(`Remote staging retained at ${work} for recovery.`);
        };
        void run().catch(error=>{state.phase=controller.signal.aborted?'cancelled':'failed';state.message=error instanceof Error?error.message:String(error);}).finally(()=>{clearTimeout(operationTimeout);state.complete=true;cancels.delete(id);activeOutputs.delete(request.output);});
        return state;
    });
}
