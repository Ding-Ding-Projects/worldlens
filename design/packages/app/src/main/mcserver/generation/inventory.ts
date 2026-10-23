import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Control } from '@worldlens/config';
import type { ServerRecord } from '../registry.js';
import { execFileCommandRunner, type CommandRunner } from '../../runtime/command.js';
import { createTransport } from '../transport/factory.js';
import { describeConfigFile } from '../config/describe.js';
import type { DescribedFile } from '../config/describe.js';
import { discoverConfigFiles } from '../config/discover.js';
import { inferField } from '../config/inferSchema.js';
import { parseJson } from '../config/parseJson.js';
import type { DiscoveredGameRule, SelectedGenerationInventory, DatapackSchemaInput } from './capabilities.js';
import { atomicWriteTextFile } from '../../storage/atomicReplace.js';

const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
async function boundedText(path:string):Promise<string> {if((await stat(path)).size>16*1024*1024)throw new Error('Generation report exceeds its size bound.');return readFile(path,'utf8');}
export interface GenerationInventoryReceipt {readonly inventory:SelectedGenerationInventory;readonly unavailable:readonly string[];readonly jarSha256:string;readonly reportDirectory:string}
/** Acquires reports through Mojang's documented data-generator entry point, probing its real flags first. */
export async function acquireGenerationInventory(server:ServerRecord,reportsRoot:string,runner:CommandRunner=execFileCommandRunner):Promise<GenerationInventoryReceipt> {
    if(server.ref.kind!=='local-process'||!server.localRuntime||!server.minecraftVersion)throw new Error('Report discovery requires a resolved local server.');
    const runtime=server.localRuntime;
    const jarSha256=createHash('sha256').update(await readFile(runtime.jarPath)).digest('hex');
    const directory=join(reportsRoot,server.id,jarSha256);
    await mkdir(directory,{recursive:true});
    const unavailable:string[]=[];
    const prefix=[`-DbundlerRepoDir=${directory}`,'-DbundlerMainClass=net.minecraft.data.Main','-jar',runtime.jarPath];
    const receiptPath=join(directory,'worldlens-report-receipt.json');
    let cached=false;
    let outputDirectory=directory;
    try {
        const receipt=JSON.parse(await boundedText(receiptPath));
        if(receipt.jarSha256===jarSha256&&receipt.version===server.minecraftVersion&&typeof receipt.directory==='string'&&/^attempt-[a-zA-Z0-9]+$/.test(receipt.directory)&&record(receipt.files)&&Object.keys(receipt.files).length>0){
            outputDirectory=join(directory,receipt.directory);cached=true;
            for(const [file,expected] of Object.entries(receipt.files)){
                if(!['commands.json','registries.json'].includes(file)||typeof expected!=='string'||createHash('sha256').update(await boundedText(join(outputDirectory,'reports',file))).digest('hex')!==expected){cached=false;break;}
            }
        }
    }catch{cached=false;}
    if(server.flavour!=='vanilla')unavailable.push('The selected distribution has no verified data-generator launch adapter; observed configuration remains available.');
    if(!cached&&server.flavour==='vanilla'){
        const help=await runner(runtime.javaPath,[...prefix,'--help'],{timeoutMs:60000});
        if(help.ok&&/--reports\b/.test(help.stdout+help.stderr)&&/--output\b/.test(help.stdout+help.stderr)){
            outputDirectory=await mkdtemp(join(directory,'attempt-'));
            const result=await runner(runtime.javaPath,[...prefix,'--reports','--output',outputDirectory],{timeoutMs:120000});
            if(result.ok){
                const files:Record<string,string>={};
                for(const name of ['commands.json','registries.json'])try{files[name]=createHash('sha256').update(await boundedText(join(outputDirectory,'reports',name))).digest('hex');}catch{}
                await atomicWriteTextFile(receiptPath,JSON.stringify({version:server.minecraftVersion,jarSha256,directory:relative(directory,outputDirectory),files,source:'https://feedback.minecraft.net/hc/en-us/articles/4410294651405-Minecraft-Java-Edition-Snapshot-21w39a',arguments:['--reports','--output'],createdAt:new Date().toISOString()})+'\n');
            }
            else unavailable.push(`Selected server data reports could not be generated (exit ${result.exitCode ?? result.spawnError ?? 'unknown'}).`);
        }else unavailable.push('The selected server does not expose the documented report/output options through its actual data-generator help.');
    }
    const transport=createTransport(server.ref,{localRuntime:()=>runtime});if(!transport.ok)throw new Error(transport.failure.message);
    const described=await describeConfigFile({transport:transport.value,path:'server.properties',flavour:server.flavour,version:server.minecraftVersion});if(!described.ok)throw new Error(described.failure.message);
    const observed=described.value.fields.filter(field=>field.state!=='missing');
    let rules:DiscoveredGameRule[]|null=null;
    let types:string[]|null=null;
    let dimensions:string[]|null=null;
    const hashes:string[]=[jarSha256,described.value.hash];
    if(cached||!unavailable.length){
        try {
            const source=await boundedText(join(outputDirectory,'reports','commands.json'));hashes.push(createHash('sha256').update(source).digest('hex'));
            const graph:unknown=JSON.parse(source);
            const children=record(graph)&&record(graph.children)?graph.children:{};
            const gamerule=children.gamerule;
            if(record(gamerule)&&record(gamerule.children)){
                rules=[];
                for(const [name,node] of Object.entries(gamerule.children)){
                    if(!record(node)||!record(node.children)){unavailable.push(`No argument schema for generation rule ${name}.`);continue;}
                    const argument=Object.values(node.children).find(item=>record(item)&&item.type==='argument');
                    if(!record(argument)){unavailable.push(`No typed value for generation rule ${name}.`);continue;}
                    let control:Control|null=null;
                    if(argument.parser==='brigadier:bool')control={kind:'switch'};
                    if(argument.parser==='brigadier:integer'){
                        const properties=record(argument.properties)?argument.properties:{};
                        control={kind:'number',integer:true,...(typeof properties.min==='number'?{min:properties.min}:{}),...(typeof properties.max==='number'?{max:properties.max}:{})};
                    }
                    if(control)rules.push({name,control});else unavailable.push(`Unsupported generation rule parser for ${name}.`);
                }
            }
        }catch{unavailable.push('A complete commands.json report was not available for the selected server.');}
        try {
            const source=await boundedText(join(outputDirectory,'reports','registries.json'));hashes.push(createHash('sha256').update(source).digest('hex'));
            const registries:unknown=JSON.parse(source);
            if(record(registries)){
                const keys=(name:string):string[]|null=>{const registry=registries[name];return record(registry)&&record(registry.entries)?Object.keys(registry.entries):null;};
                types=keys('minecraft:worldgen/world_preset');dimensions=keys('minecraft:dimension');
            }
        }catch{unavailable.push('A complete registries.json report was not available for the selected server.');}
    }
    const datapacks:DatapackSchemaInput[]=[];
    // Only the created server's owned world datapacks are inspected. Links are never followed.
    const worldNames=(await readdir(server.ref.serverDir,{withFileTypes:true})).filter(entry=>entry.isDirectory()&&!entry.isSymbolicLink());
    let fileCount=0;
    for(const world of worldNames){
        const packRoot=join(server.ref.serverDir,world.name,'datapacks');
        const walk=async(path:string,depth:number):Promise<void>=>{
            if(depth>10){unavailable.push('Datapack schema discovery reached its depth bound.');return;}
            let entries;try{entries=await readdir(path,{withFileTypes:true});}catch{return;}
            for(const entry of entries){
                if(++fileCount>10000)throw new Error('Datapack schema discovery exceeded its file bound.');
                const child=join(path,entry.name);
                if(entry.isSymbolicLink())continue;
                if(entry.isDirectory())await walk(child,depth+1);
                else if(entry.isFile()&&(entry.name.endsWith('.json')||entry.name==='pack.mcmeta')){
                    const sourceText=await boundedText(child);const parsed=parseJson(sourceText);if(!parsed.ok){unavailable.push('An installed datapack JSON file could not be described without loss.');continue;}
                    const file=relative(packRoot,child).replace(/\\/g,'/');const id=file.split('/')[0]!;
                    const fields=parsed.value.nodes.filter(node=>node.kind==='entry').map(node=>({key:node.path.join('.'),path:node.path,control:inferField(node.path.at(-1)??'records',node.value).control}));
                    datapacks.push({id,file,sourceText,fields});hashes.push(parsed.value.hash);
                }
            }
        };
        await walk(packRoot,0);
    }
    const configurationFiles:DescribedFile[]=[];
    const configurations=await discoverConfigFiles(transport.value,['config','plugins','mods']);
    if(configurations.ok){
        for(const file of configurations.value.files){
            const described=await describeConfigFile({transport:transport.value,path:file,flavour:server.flavour,version:server.minecraftVersion});
            if(described.ok){configurationFiles.push(described.value);hashes.push(described.value.hash);}else unavailable.push(`Installed configuration ${file} could not be described.`);
        }
        if(configurations.value.truncated)unavailable.push('Installed configuration discovery reached its safety bound.');
        for(const gap of configurations.value.unavailable)unavailable.push(`${gap.path}: ${gap.message}`);
    }else unavailable.push(configurations.failure.message);
    const sha256=createHash('sha256').update(hashes.join('\n')).digest('hex');
    return {inventory:{source:{edition:'java',version:server.minecraftVersion,flavour:server.flavour,reference:`server:${server.id}/generated-reports`,sha256},serverPropertyKeys:observed.map(field=>field.key),serverPropertyValues:Object.fromEntries(observed.map(field=>[field.key,field.value])),gameRules:rules,generationTypes:types,dimensions,datapacks,configurationFiles},unavailable,jarSha256,reportDirectory:outputDirectory};
}
