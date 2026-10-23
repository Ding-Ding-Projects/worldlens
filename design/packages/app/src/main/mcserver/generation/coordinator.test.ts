import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
vi.mock('../create.js',()=>({createLocalServer:vi.fn()}));
import { GenerationCoordinator, type GenerateProjectRequest } from './coordinator.js';
import type { ServerRecord } from '../registry.js';
import { consumeGenerationOptions } from './descriptors.js';

describe('generation coordinator',()=>{
    it('creates real service records, reads the project back and persists completion',async()=>{
        const root=await mkdtemp(join(tmpdir(),'worldlens-coordinator-'));
        try {
            const server={id:'test',flavour:'vanilla',ref:{kind:'local-process',serverDir:root},localRuntime:{javaPath:'java',jarPath:'server.jar',memoryMb:1024}} as ServerRecord;
            const generation=vi.fn(async()=>({ok:true as const,value:{worldFolder:join(root,'world'),zipPath:null,chunkCount:3,bytes:9,seed:'9223372036854775807',requestedSeed:'9223372036854775807'}}));
            const coordinator=new GenerationCoordinator({stateDirectory:root,createServer:vi.fn(async()=>({ok:true as const,value:server})),generate:generation,inspect:vi.fn(async()=>({folder:join(root,'world'),entries:[{path:'level.dat',directory:false}],regionFiles:{region:1},regionExtents:{},spawn:null,spawnError:null,leveldbFiles:null,serverSiblings:{}})),createProject:vi.fn(async()=>({ok:true as const,value:{projectPath:join(root,'project.json')}})),readProject:vi.fn(async()=>({ok:true as const,value:{worldFolder:join(root,'world')}}))});
            const request={id:'test',server:{id:'test',flavour:'vanilla',version:'1.21.4',acceptedEula:true},seed:'9223372036854775807',worldName:'world',downloadConsent:true} as GenerateProjectRequest;
            const result=await coordinator.run(request);
            expect(result.ok&&result.value.stage).toBe('complete');
            expect((await coordinator.read('test'))?.projectPath).toBe(join(root,'project.json'));
            expect((await coordinator.run(request)).ok).toBe(true);
            expect(generation).toHaveBeenCalledTimes(1);
            expect((await coordinator.run({...request,seed:'other'})).ok).toBe(false);
        } finally {await rm(root,{recursive:true,force:true});}
    });
    it('requires consent before creating state',async()=>{
        const coordinator=new GenerationCoordinator({stateDirectory:tmpdir(),createProject:vi.fn(),readProject:vi.fn()});
        const result=await coordinator.run({id:'test',downloadConsent:false,server:{acceptedEula:false}} as GenerateProjectRequest);
        expect(result.ok).toBe(false);
    });
});
describe('generation property consumers',()=>{
    it('preserves full seed strings and validates structured generator settings',()=>{
        expect(consumeGenerationOptions({edition:'java',version:'1.21.4',flavour:'vanilla'},['1.21.4'],{seed:'9223372036854775807',structures:false})).toEqual({'level-seed':'9223372036854775807','generate-structures':'false'});
        expect(()=>consumeGenerationOptions({edition:'bedrock',version:'1',flavour:'vanilla'},['1'],{seed:'1'})).toThrow(/Unsupported/);
        expect(()=>consumeGenerationOptions({edition:'java',version:'1.21.4',flavour:'vanilla'},['1.21.4'],{generatorSettings:'x: 1'})).toThrow();
    });
});

