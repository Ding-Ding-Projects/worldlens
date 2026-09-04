/** Schema-aware composition: advanced fields override matching fields, not whole option groups. */
type ObjectValue = Record<string, any>;
type Box = {minChunkX:number;minChunkZ:number;maxChunkX:number;maxChunkZ:number};
type Rule = {include:boolean;regions:Box[]};
export interface ConfigurationCollision { path:string; previous:unknown; replacement:unknown }
const all:Box={minChunkX:-2147483648,minChunkZ:-2147483648,maxChunkX:2147483647,maxChunkZ:2147483647};
const intersection=(a:Box,b:Box):Box|null=>{
    const r={minChunkX:Math.max(a.minChunkX,b.minChunkX),minChunkZ:Math.max(a.minChunkZ,b.minChunkZ),maxChunkX:Math.min(a.maxChunkX,b.maxChunkX),maxChunkZ:Math.min(a.maxChunkZ,b.maxChunkZ)};
    return r.minChunkX<=r.maxChunkX&&r.minChunkZ<=r.maxChunkZ?r:null;
};
function subtract(a:Box,b:Box):Box[]{
    const c=intersection(a,b);if(!c)return[a];
    return [{...a,maxChunkX:c.minChunkX-1},{...a,minChunkX:c.maxChunkX+1},{minChunkX:c.minChunkX,maxChunkX:c.maxChunkX,minChunkZ:a.minChunkZ,maxChunkZ:c.minChunkZ-1},{minChunkX:c.minChunkX,maxChunkX:c.maxChunkX,minChunkZ:c.maxChunkZ+1,maxChunkZ:a.maxChunkZ}].filter(r=>r.minChunkX<=r.maxChunkX&&r.minChunkZ<=r.maxChunkZ);
}
export function intersectPruningRules(a:Rule,b:Rule):Rule{
    if(!a.regions.length)return b;if(!b.regions.length)return a;
    if(!a.include&&!b.include)return{include:false,regions:[...a.regions,...b.regions]};
    let regions:Box[];
    if(a.include&&b.include)regions=a.regions.flatMap(x=>b.regions.map(y=>intersection(x,y)).filter((r):r is Box=>r!==null));
    else{
        const include=a.include?a:b,exclude=a.include?b:a;regions=[...include.regions];
        for(const cut of exclude.regions){regions=regions.flatMap(r=>subtract(r,cut));if(regions.length>10000)throw Error('The combined trim exceeds 10,000 rectangles. Simplify the exclusions.');}
    }
    return regions.length?{include:true,regions}:{include:false,regions:[all]};
}
export function composeChunkerConfiguration(guided:ObjectValue,advanced:ObjectValue):{config:ObjectValue;collisions:ConfigurationCollision[]}{
    const config={...guided};const collisions:ConfigurationCollision[]=[];
    const fields=(base:ObjectValue={},extra:ObjectValue={},prefix:string)=>{
        const merged={...base};for(const [key,value]of Object.entries(extra)){
            if(Object.hasOwn(base,key)&&JSON.stringify(base[key])!==JSON.stringify(value))collisions.push({path:`${prefix}.${key}`,previous:base[key],replacement:value});
            merged[key]=value;
        }return merged;
    };
    const entries=(base:ObjectValue[]=[],extra:ObjectValue[]=[],identity:(entry:ObjectValue)=>string,prefix:string)=>{
        const result=base.map(entry=>({...entry}));for(const entry of extra){const key=identity(entry),index=result.findIndex(old=>identity(old)===key);
            if(index<0)result.push({...entry});else result[index]=fields(result[index],entry,`${prefix}[${key}]`);
        }return result;
    };
    for(const [option,value]of Object.entries(advanced)){
        if(option==='keepOriginalNBT'){config[option]=value;continue;}
        if(option==='pruning'){
            const merged={...(guided.pruning?.configs??{})};
            for(const[dimension,rule]of Object.entries(value.configs??{}))merged[dimension]=merged[dimension]?intersectPruningRules(merged[dimension],rule as Rule):rule;
            config.pruning={configs:merged};continue;
        }
        if(option==='blockMappings'){
            const base=guided.blockMappings??{},merged={...base};
            for(const name of ['identifiers','items'])if(value[name])merged[name]=entries(base[name],value[name],entry=>JSON.stringify([entry.old_identifier,entry.old_state_values??{}]),`blockMappings.${name}`);
            for(const name of ['state_lists','types'])if(value[name]){
                merged[name]={...(base[name]??{})};
                for(const[key,list]of Object.entries(value[name]))merged[name][key]=entries(base[name]?.[key],list as ObjectValue[],entry=>JSON.stringify(name==='types'?entry.input:entry.old_state),`blockMappings.${name}.${key}`);
            }
            config.blockMappings=merged;continue;
        }
        if(option==='dimensionRegistry'){config.dimensionRegistry={mappings:entries(guided.dimensionRegistry?.mappings,value.mappings,entry=>entry.identifier,'dimensionRegistry.mappings')};continue;}
        config[option]=fields(guided[option],value,option);
    }
    return{config,collisions};
}
