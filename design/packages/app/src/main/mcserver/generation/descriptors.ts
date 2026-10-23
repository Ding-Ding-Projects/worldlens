/** Capabilities bind each enabled field to the exact consumer written by this module. */
export interface GenerationDescriptor {
    readonly key:string;
    readonly type:'string'|'boolean'|'json';
    readonly consumer:{ readonly kind:'server-property'; readonly key:string };
    readonly supported:boolean;
    readonly reason:string|null;
}
export interface GenerationTarget { readonly edition:'java'|'bedrock'; readonly version:string; readonly flavour:string }
const properties = [
    ['seed','string','level-seed'],['preset','string','level-type'],['generatorSettings','json','generator-settings'],
    ['structures','boolean','generate-structures'],['initialEnabledPacks','string','initial-enabled-packs'],['initialDisabledPacks','string','initial-disabled-packs'],
] as const;
/** Version catalogue input is supplied by the existing distribution discovery service. */
export function generationDescriptors(target:GenerationTarget, availableVersions:readonly string[]):readonly GenerationDescriptor[] {
    const supported = target.edition==='java' && ['vanilla','paper','purpur','spigot'].includes(target.flavour) && availableVersions.includes(target.version);
    return properties.map(([key,type,property])=>({key,type,consumer:{kind:'server-property',key:property},supported,reason:supported?null:'This generation adapter requires a discovered Java server version and supported distribution.'}));
}
export function consumeGenerationOptions(target:GenerationTarget, availableVersions:readonly string[], values:Readonly<Record<string,unknown>>):Readonly<Record<string,string>> {
    const descriptors=generationDescriptors(target,availableVersions);
    const out:Record<string,string>={};
    for(const [key,value] of Object.entries(values)) {
        const descriptor=descriptors.find(item=>item.key===key);
        if(!descriptor?.supported) throw new Error(`Unsupported generation option: ${key}.`);
        if(descriptor.type==='boolean' && typeof value!=='boolean' || descriptor.type==='string' && typeof value!=='string') throw new Error(`Invalid generation option type: ${key}.`);
        if(descriptor.type==='json') {
            if(typeof value!=='string') throw new Error('Generator settings must be a strict JSON string.');
            const parsed:unknown=JSON.parse(value);
            if(parsed===null||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error('Generator settings must contain an object.');
        }
        out[descriptor.consumer.key]=String(value);
    }
    return out;
}
/** Unimplemented options stay explicitly unavailable rather than becoming ignored controls. */
export const UNAVAILABLE_GENERATION_OPTIONS = [
    {key:'biome',reason:'Requires a version-bound datapack/preset adapter.'},
    {key:'noise',reason:'Requires a version-bound datapack/preset adapter.'},
    {key:'dimensions',reason:'Requires a version-bound datapack/preset adapter.'},
    {key:'superflatLayers',reason:'Use strict version-specific generator settings until a verified layer adapter is available.'},
    {key:'gameRules',reason:'Requires discovered version-specific command execution after startup.'},
    {key:'worldBorder',reason:'Requires discovered version-specific command execution after startup.'},
    {key:'spawn',reason:'Requires discovered version-specific command execution after startup.'},
] as const;

export { describeGenerationCapabilities, compileGenerationPlan, type GenerationCapability, type SelectedGenerationInventory, type CapabilitySource, type CompiledGenerationPlan } from './capabilities.js';
