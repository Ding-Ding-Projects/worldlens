import { createHash } from "node:crypto";
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteTextFile } from '../../storage/atomicReplace.js';
import { createLocalServer, type CreateLocalServerOptions } from '../create.js';
import type { ServerRecord } from '../registry.js';
import { inspectWorldFolder } from '../../world/inspect.js';
import { runVanillaGeneration, type VanillaGenerationRequest, type VanillaGenerationProgress } from '../worldgen/vanillaGeneration.js';
import { fail, ok, type Answer } from '../transport/types.js';
import { compileGenerationPlan, type SelectedGenerationInventory, type CompiledGenerationPlan } from './capabilities.js';
import { containsProtectedGenerationInput } from './protectedFields.js';

export type GenerationStage = 'creating-server' | 'generating' | 'inspecting' | 'creating-project' | 'complete' | 'interrupted' | 'failed' | 'cancelled';
export interface GenerationState {
    readonly version: 1;
    readonly requestHash: string;
    readonly id: string;
    readonly stage: GenerationStage;
    readonly server: ServerRecord | null;
    readonly worldFolder: string | null;
    readonly projectPath: string | null;
    readonly message: string;
    readonly generationPhase?:VanillaGenerationProgress['phase'];
}
export interface GenerateProjectRequest {
    readonly id: string;
    readonly server: CreateLocalServerOptions;
    readonly seed: string;
    readonly worldName: string;
    readonly serverProperties?: Readonly<Record<string,string>>;
    readonly pregeneration?: Pick<VanillaGenerationRequest,'pregenerationRadius'|'pregenerationAdapter'|'chunkyPluginJar'>;
    readonly downloadConsent: boolean;
    readonly generationInventory?: SelectedGenerationInventory;
    readonly generationValues?: Readonly<Record<string,unknown>>;
}
export interface GenerationCoordinatorDeps {
    readonly stateDirectory: string;
    /** Uses the existing project writer, returning its durable path. Must be idempotent by operation id. */
    readonly createProject: (input: { operationId:string; server:ServerRecord; worldFolder:string; listing:Awaited<ReturnType<typeof inspectWorldFolder>> }) => Promise<Answer<{ projectPath:string }>>;
    readonly readProject: (path:string) => Promise<Answer<{ worldFolder:string }>>;
    readonly createServer?: typeof createLocalServer;
    readonly generate?: typeof runVanillaGeneration;
    readonly inspect?: typeof inspectWorldFolder;
    readonly onState?: (state:GenerationState) => void;
    readonly inventoryForServer?: (server:ServerRecord)=>Promise<SelectedGenerationInventory|null>;
}
/** Shared durable coordinator for all entry points. No renderer owns the lifecycle. */
export class GenerationCoordinator {
    private readonly active = new Set<string>();
    private readonly cancelled = new Set<string>();
    constructor(private readonly deps:GenerationCoordinatorDeps) {}
    cancel(id:string):boolean { if (!this.active.has(id)) return false; this.cancelled.add(id); return true; }
    private path(id:string):string { if (!/^[a-z][a-z0-9-]{0,62}$/.test(id)) throw new Error('Invalid generation operation id.'); return join(this.deps.stateDirectory,`${id}.json`); }
    async read(id:string):Promise<GenerationState|null> {
        try {
            const state = JSON.parse(await readFile(this.path(id),'utf8')) as GenerationState;
            if (state.version !== 1 || state.id !== id) throw new Error('Unsupported generation state.');
            if (!this.active.has(id) && ['creating-server','generating','inspecting','creating-project'].includes(state.stage)) return {...state,stage:'interrupted',message:'The previous operation stopped before completion. Inspect retained server/world before resuming.'};
            return state;
        } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    }
    async run(request:GenerateProjectRequest):Promise<Answer<GenerationState>> {
        this.path(request.id);
        if(containsProtectedGenerationInput(request.serverProperties??{})||containsProtectedGenerationInput(request.generationValues??{}))return fail('invalid-request','Protected fields cannot be submitted through generation settings.');
        if (this.active.has(request.id)) return fail('busy','This generation is already running.');
        if (!request.downloadConsent || request.server.acceptedEula !== true) return fail('invalid-request','Explicit download and EULA consent are required.');
        if (!['vanilla','paper','purpur','spigot'].includes(request.server.flavour)) return fail('unsupported','This generation runner supports vanilla and the verified Bukkit-family jar launch adapters.');
        let plan:CompiledGenerationPlan = {serverProperties:{},commands:[],datapackFiles:[],configurationChanges:[]};
        try {
            if (request.generationValues && !request.generationInventory && !this.deps.inventoryForServer) return fail('invalid-request','Generation values require their exact selected-target inventory.');
            if (request.generationInventory) plan = compileGenerationPlan({edition:'java',version:request.server.gameVersion ?? request.server.version,flavour:request.server.flavour},request.generationInventory,request.generationValues ?? {});
            if (plan.serverProperties['level-seed'] !== undefined && plan.serverProperties['level-seed'] !== request.seed) return fail('invalid-request','Conflicting generation seed inputs.');
        } catch (error) { return fail('invalid-request',error instanceof Error ? error.message : String(error)); }
        const requestHash = createHash("sha256").update(JSON.stringify({serverId:request.server.id,serversRoot:request.server.serversRoot,memoryMb:request.server.memoryMb,version:request.server.version,flavour:request.server.flavour,seed:request.seed,worldName:request.worldName,properties:request.serverProperties ?? {},pregeneration:request.pregeneration ?? null,values:request.generationValues??null,plan})).digest("hex");
        const previous = await this.read(request.id);
        if (previous && previous.requestHash !== requestHash) return fail("invalid-request", "This operation belongs to different generation settings. Use a new operation id.");
        if (previous?.stage === 'complete') {
            if (!previous.projectPath) return fail('failed','Completed operation has no project.');
            const read = await this.deps.readProject(previous.projectPath);
            return read.ok && read.value.worldFolder === previous.worldFolder ? ok(previous) : fail('failed','The completed project could not be verified.');
        }
        this.active.add(request.id);
        let state:GenerationState = previous ?? {version:1,requestHash,id:request.id,stage:'creating-server',server:null,worldFolder:null,projectPath:null,message:'Preparing generation.'};
        const save = async (patch:Partial<GenerationState>) => {
            state = {...state,...patch};
            await mkdir(this.deps.stateDirectory,{recursive:true});
            await atomicWriteTextFile(this.path(request.id),JSON.stringify(state,null,2)+'\n');
            this.deps.onState?.(state);
        };
        try {
            if (!state.server) {
                await save({stage:'creating-server',message:'Resolving and installing the selected server.'});
                const created = await (this.deps.createServer ?? createLocalServer)(request.server);
                if (!created.ok) { await save({stage:'failed',message:created.failure.message}); return created; }
                await save({server:created.value});
            }
            const server = state.server!;
            if (server.ref.kind !== 'local-process' || !server.localRuntime) throw new Error('Generation requires a resolved local process runtime.');
            if (request.generationValues && !request.generationInventory) {
                const inventory=await this.deps.inventoryForServer!(server);
                if (!inventory) throw new Error('The selected server generation inventory is unavailable.');
                plan=compileGenerationPlan({edition:'java',version:server.minecraftVersion??request.server.version,flavour:server.flavour},inventory,request.generationValues);
                if(plan.serverProperties['level-seed']!==undefined&&plan.serverProperties['level-seed']!==request.seed)throw new Error('Conflicting generation seed inputs.');
            }
            if (!state.worldFolder) {
                await save({stage:'generating',message:'Generating the world through the selected server.'});
                let progressWrites=Promise.resolve();
                const result = await (this.deps.generate ?? runVanillaGeneration)({
                    ...server.localRuntime,serverDir:server.ref.serverDir,worldName:request.worldName,acceptedEula:true,
                    flavour:server.flavour,pregenerationRadius:request.pregeneration?.pregenerationRadius ?? 0,
                    ...(request.pregeneration ?? {}), outputMode:'folder',outputDestination:server.ref.serverDir,
                    serverProperties:{...request.serverProperties,...plan.serverProperties,'level-seed':request.seed},
                    datapackFiles:plan.datapackFiles,postStartupCommands:plan.commands,
                    configurationChanges:plan.configurationChanges,
                },{isCancelled:()=>this.cancelled.has(request.id),onProgress:progress=>{progressWrites=progressWrites.then(()=>save({generationPhase:progress.phase,message:progress.message}));}});
                await progressWrites;
                if (!result.ok) { await save({stage:result.code,message:result.message}); return fail(result.code,result.message); }
                await save({worldFolder:result.value.worldFolder});
            }
            if (this.cancelled.has(request.id)) { await save({stage:'cancelled',message:'Cancelled; retained files are available for recovery.'}); return fail('cancelled',state.message); }
            await save({stage:'inspecting',message:'Reading the generated world.'});
            const listing = await (this.deps.inspect ?? inspectWorldFolder)(state.worldFolder!);
            if (!listing.entries.some(entry=>entry.path==='level.dat')) throw new Error('Generated world inspection did not find level.dat.');
            await save({stage:'creating-project',message:'Creating and reading back the project.'});
            const project = await this.deps.createProject({operationId:request.id,server,worldFolder:state.worldFolder!,listing});
            if (!project.ok) { await save({stage:'failed',message:project.failure.message}); return project; }
            const read = await this.deps.readProject(project.value.projectPath);
            if (!read.ok || read.value.worldFolder !== state.worldFolder) throw new Error('Project readback did not match the generated world.');
            await save({stage:'complete',projectPath:project.value.projectPath,message:'Generated world and project verified.'});
            return ok(state);
        } catch (error) { await save({stage:'failed',message:error instanceof Error?error.message:String(error)}); return fail('failed',state.message); }
        finally { this.active.delete(request.id); this.cancelled.delete(request.id); }
    }
}


