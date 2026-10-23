import { describe,expect,it,vi } from 'vitest';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
vi.mock('../transport/factory.js',()=>({createTransport:()=>({ok:true,value:{fileList:async()=>({ok:true,value:[]})}})}));
vi.mock('../config/describe.js',()=>({describeConfigFile:async()=>({ok:true,value:{hash:'b'.repeat(64),fields:[{key:'level-seed',state:'known',value:'9223372036854775807'}]}})}));
vi.mock('../../runtime/command.js',()=>({execFileCommandRunner:vi.fn()}));
import { acquireGenerationInventory } from './inventory.js';
import type { ServerRecord } from '../registry.js';
import type { CommandRunner } from '../../runtime/command.js';
describe('source-bound generation report acquisition',()=>{
    it('probes real flags, parses the complete discovered rule list and verifies cache content',async()=>{
        const root=await mkdtemp(join(tmpdir(),'worldlens-inventory-'));
        try{
            const jar=join(root,'server.jar');await writeFile(jar,'verified-fixture-payload');
            const server={id:'test',flavour:'vanilla',minecraftVersion:'1.21.4',ref:{kind:'local-process',serverDir:root},localRuntime:{javaPath:'java',jarPath:jar,memoryMb:1024}} as ServerRecord;
            const runner=vi.fn<CommandRunner>(async(_command:string,args:readonly string[])=>{
                if(args.includes('--help'))return{ok:true,exitCode:0,stdout:'--reports --output',stderr:'',spawnError:null};
                const directory=args[args.indexOf('--output')+1]!;await mkdir(join(directory,'reports'),{recursive:true});
                const rules=Object.fromEntries(Array.from({length:100},(_,i)=>[`rule${i}`,{type:'literal',children:{value:{type:'argument',parser:'brigadier:bool'}}}]));
                await writeFile(join(directory,'reports','commands.json'),JSON.stringify({children:{gamerule:{children:rules}}}));
                await writeFile(join(directory,'reports','registries.json'),JSON.stringify({'minecraft:worldgen/world_preset':{entries:{'minecraft:flat':{}}},'minecraft:dimension':{entries:{'minecraft:overworld':{}}}}));
                return{ok:true,exitCode:0,stdout:'done',stderr:'',spawnError:null};
            });
            const result=await acquireGenerationInventory(server,join(root,'reports-cache'),runner);
            expect(result.inventory.gameRules).toHaveLength(100);
            expect(result.inventory.generationTypes).toEqual(['minecraft:flat']);
            expect(result.inventory.source.sha256).toMatch(/^[a-f0-9]{64}$/);
            expect(result.inventory.gameRules![0]).not.toHaveProperty('value');
            await acquireGenerationInventory(server,join(root,'reports-cache'),runner);expect(runner).toHaveBeenCalledTimes(2);
            await writeFile(join(result.reportDirectory,'reports','commands.json'),'{}');
            const refreshed=await acquireGenerationInventory(server,join(root,'reports-cache'),runner);expect(runner).toHaveBeenCalledTimes(4);expect(refreshed.reportDirectory).not.toBe(result.reportDirectory);
        }finally{await rm(root,{recursive:true,force:true});}
    });
});
