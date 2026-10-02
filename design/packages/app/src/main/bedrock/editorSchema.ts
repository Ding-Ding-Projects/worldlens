/** Fixed CLI object shapes from the pinned Chunker mapping/pruning deserializers. */
export interface EditorSchema {kind:string;properties?:Record<string,EditorSchema>;additional?:EditorSchema;keyPattern?:string;item?:EditorSchema;variants?:EditorSchema[];default?:unknown;description?:string}
const text:EditorSchema={kind:'string',default:''};
const integer:EditorSchema={kind:'integer',default:0};
const identifier:EditorSchema={kind:'identifier',default:'minecraft:stone'};
const namespace='^[a-z0-9_.-]+:[a-z0-9_./-]+$';
const array=(item:EditorSchema):EditorSchema=>({kind:'array',item,default:[]});
const object=(properties:Record<string,EditorSchema>):EditorSchema=>({kind:'object',properties,default:{}});
const dictionary=(additional:EditorSchema,keyPattern?:string):EditorSchema=>({kind:'object',additional,...(keyPattern?{keyPattern}:{}),default:{}});
const state:EditorSchema={kind:'union',variants:[text,integer,{kind:'boolean',default:false}],default:''};
const stateList:EditorSchema={kind:'union',variants:[...state.variants!,array(state)],default:''};
const names:EditorSchema={kind:'union',variants:[text,array(text)],default:''};
const mapping=object({old_identifier:identifier,new_identifier:identifier,old_state_values:dictionary(state),new_state_values:dictionary(state),state_list:{...text,description:'Choose a defined state_lists name, * to preserve all states, or empty to clear states.'}});
mapping.default={old_identifier:'minecraft:stone',new_identifier:'minecraft:stone'};
const region=object({minChunkX:integer,minChunkZ:integer,maxChunkX:integer,maxChunkZ:integer});
region.default={minChunkX:0,minChunkZ:0,maxChunkX:31,maxChunkZ:31};
const rule=object({include:{kind:'boolean',default:true},regions:array(region)});rule.default={include:true,regions:[]};
const dimension=object({identifier:{kind:'identifier',default:'custom:dimension'},biomeHeight:{...integer,default:64},fallbackBiome:{kind:'identifier',default:'minecraft:plains'}});
dimension.default={identifier:'custom:dimension',biomeHeight:64,fallbackBiome:'minecraft:plains'};
export const CHUNKER_EDITOR_SCHEMAS:Record<string,EditorSchema>={
    blockMappings:object({identifiers:array(mapping),items:array(mapping),state_lists:dictionary(array(object({old_state:names,new_state:names,type:text}))),types:dictionary(array(object({input:stateList,output:stateList})))}),
    pruning:object({configs:dictionary(rule,namespace)}),
    converterSettings:object(Object.fromEntries(['mapConversion','lootTableConversion','itemConversion','blockConnections','enableCompact','discardEmptyChunks','preventYBiomeBlending','customIdentifiers'].map(key=>[key,{kind:'boolean',default:!['discardEmptyChunks','preventYBiomeBlending'].includes(key)}]))),
    dimensionRegistry:object({mappings:array(dimension)}),
    dimensionMappings:dictionary(identifier,namespace),biomeMappings:dictionary({...identifier,default:'minecraft:plains'},namespace),
};
export function worldSettingsEditorSchema(schema:Readonly<Record<string,string>>,values:Readonly<Record<string,unknown>>={}):EditorSchema{
    return object(Object.fromEntries(Object.entries(schema).map(([name,type])=>[name,{kind:type==='Boolean'?'boolean':type==='String'?'string':type==='Int64'?'int64':['Single','Double'].includes(type)?'number':'integer',default:values[name]??(type==='Boolean'?false:type==='String'?'':0),description:`${name} (${type}), reported by the selected converter.`}])));
}
