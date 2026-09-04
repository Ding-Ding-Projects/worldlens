/**
 * The complete public CLI contract for the pinned Chunker 1.19.1 jar.
 *
 * This is deliberately an inventory, not a loose bag of `extraArgs`.  Every
 * JSON-bearing option in `CLI.java` has one named member here and one argv
 * spelling below.  A renderer can build rich editors for these values without
 * ever constructing a shell command, while the main process retains the only
 * serialization route to the JVM.
 */

/** Any non-array JSON object. Concrete schemas may use declared members. */
export type JsonObject = object;
import {PINNED_WORLD_SETTINGS} from './pinnedSettingsSchema.js';

export interface ChunkerCliConfig {
    readonly blockMappings?: JsonObject;
    readonly worldSettings?: JsonObject;
    readonly pruning?: JsonObject;
    readonly converterSettings?: JsonObject;
    readonly dimensionRegistry?: JsonObject;
    readonly dimensionMappings?: Readonly<Record<string, string>>;
    readonly biomeMappings?: Readonly<Record<string, string>>;
    /** Only valid when the source and requested output formats are identical. */
    readonly keepOriginalNBT?: boolean;
}

export const CHUNKER_CLI_OPTION_INVENTORY = [
    "inputDirectory",
    "outputFormat",
    "outputDirectory",
    "blockMappings",
    "worldSettings",
    "pruning",
    "converterSettings",
    "dimensionRegistry",
    "dimensionMappings",
    "biomeMappings",
    "keepOriginalNBT",
] as const;

const JSON_OPTIONS: ReadonlyArray<readonly [keyof Omit<ChunkerCliConfig, "keepOriginalNBT">, string]> = [
    ["blockMappings", "--blockMappings"],
    ["worldSettings", "--worldSettings"],
    ["pruning", "--pruning"],
    ["converterSettings", "--converterSettings"],
    ["dimensionRegistry", "--dimensionRegistry"],
    ["dimensionMappings", "--dimensionMappings"],
    ["biomeMappings", "--biomeMappings"],
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
const IDENTIFIER=/^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const exactKeys=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).every(key=>keys.includes(key));
const int32=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;
const stateValue=(value:unknown)=>typeof value==='string'||typeof value==='boolean'||int32(value);
const stateValues=(value:unknown)=>stateValue(value)||(Array.isArray(value)&&value.every(stateValue));
const stateRecord=(value:unknown)=>isRecord(value)&&Object.values(value).every(stateValue);
const strings=(value:unknown)=>typeof value==='string'||(Array.isArray(value)&&value.every(entry=>typeof entry==='string'));
export function validateWorldSettings(value:unknown,schema:Readonly<Record<string,string>>=PINNED_WORLD_SETTINGS):boolean{
    if(!isRecord(value))return false;
    return Object.entries(value).every(([key,entry])=>{
        if(!Object.hasOwn(schema,key))return false;
        switch(schema[key]){
            case 'Boolean':return typeof entry==='boolean';
            case 'String':return typeof entry==='string';
            case 'Byte':return int32(entry)&&Number(entry)>=-128&&Number(entry)<=127;
            case 'Int16':return int32(entry)&&Number(entry)>=-32768&&Number(entry)<=32767;
            case 'Int32':return int32(entry);
            case 'Int64':{
                if(typeof entry==='number')return Number.isSafeInteger(entry);
                if(typeof entry!=='string'||! /^-?[0-9]+$/.test(entry))return false;
                try{const n=BigInt(entry);return n>=-9223372036854775808n&&n<=9223372036854775807n;}catch{return false;}
            }
            case 'Single':case 'Double':return typeof entry==='number'&&Number.isFinite(entry);
            default:return false;
        }
    });
}
function isDimensionRegistry(value:unknown):boolean{
    return isRecord(value)&&exactKeys(value,['mappings'])&&Array.isArray(value.mappings)&&value.mappings.every(entry=>isRecord(entry)&&exactKeys(entry,['identifier','biomeHeight','fallbackBiome'])&&typeof entry.identifier==='string'&&IDENTIFIER.test(entry.identifier)&&int32(entry.biomeHeight)&&(entry.fallbackBiome===undefined||(typeof entry.fallbackBiome==='string'&&IDENTIFIER.test(entry.fallbackBiome))));
}
function isBlockMappings(value:unknown):boolean{
    if(!isRecord(value)||!exactKeys(value,['identifiers','items','state_lists','types']))return false;
    const lists=value.state_lists??{},types=value.types??{};
    if(!isRecord(lists)||!isRecord(types))return false;
    if(!Object.values(types).every(list=>Array.isArray(list)&&list.every(entry=>isRecord(entry)&&exactKeys(entry,['input','output'])&&stateValues(entry.input)&&stateValues(entry.output))))return false;
    if(!Object.values(lists).every(list=>Array.isArray(list)&&list.every(entry=>isRecord(entry)&&exactKeys(entry,['old_state','new_state','type'])&&strings(entry.old_state)&&strings(entry.new_state)&&(entry.type===undefined||(typeof entry.type==='string'&&(entry.type===''||Object.hasOwn(types,entry.type)))))))return false;
    return ['identifiers','items'].every(key=>value[key]===undefined||(Array.isArray(value[key])&&(value[key] as unknown[]).every(entry=>{
        if(!isRecord(entry)||!exactKeys(entry,['old_identifier','new_identifier','old_state_values','new_state_values','state_list']))return false;
        if(typeof entry.old_identifier!=='string'||!IDENTIFIER.test(entry.old_identifier))return false;
        if(entry.new_identifier!==undefined&&(typeof entry.new_identifier!=='string'||(!IDENTIFIER.test(entry.new_identifier)&&entry.new_identifier!=='$custom_block')))return false;
        if(entry.old_state_values!==undefined&&!stateRecord(entry.old_state_values))return false;
        if(entry.new_state_values!==undefined&&!stateRecord(entry.new_state_values))return false;
        return entry.state_list===undefined||(typeof entry.state_list==='string'&&(['','*'].includes(entry.state_list)||Object.hasOwn(lists,entry.state_list)));
    })));
}

function boundedJson(value: unknown, depth = 0): boolean {
    if (depth > 16) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "string") return value.length <= 8192;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.length <= 10000 && value.every((item) => boundedJson(item, depth + 1));
    return isRecord(value) && Object.keys(value).length <= 10000 && Object.entries(value).every(([key, item]) =>
        key.length <= 256 && !["__proto__", "prototype", "constructor"].includes(key) && boundedJson(item, depth + 1));
}
function isPruning(value: unknown): boolean {
    if (!isRecord(value) || !isRecord(value.configs) || Object.keys(value).some((key) => key !== "configs")) return false;
    return Object.entries(value.configs).every(([dimension,rule]) => IDENTIFIER.test(dimension)&&isRecord(rule)&&exactKeys(rule,['include','regions']) && typeof rule.include === "boolean" && Array.isArray(rule.regions) &&
        rule.regions.every((box) => isRecord(box)&&exactKeys(box,['minChunkX','minChunkZ','maxChunkX','maxChunkZ']) && ["minChunkX", "minChunkZ", "maxChunkX", "maxChunkZ"].every((key) => Number.isSafeInteger(box[key]) && Number(box[key]) >= -2147483648 && Number(box[key]) <= 2147483647) &&
            Number(box.minChunkX) <= Number(box.maxChunkX) && Number(box.minChunkZ) <= Number(box.maxChunkZ)));
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
    return isRecord(value) && Object.entries(value).every(([key,entry]) => IDENTIFIER.test(key)&&typeof entry === "string"&&IDENTIFIER.test(entry));
}

const CONVERTER_SETTING_KEYS = new Set([
    "mapConversion", "lootTableConversion", "itemConversion", "blockConnections",
    "enableCompact", "discardEmptyChunks", "preventYBiomeBlending", "customIdentifiers",
]);

function isConverterSettings(value: unknown): value is JsonObject {
    return isRecord(value) && Object.entries(value).every(([key, entry]) =>
        CONVERTER_SETTING_KEYS.has(key) && typeof entry === "boolean",
    );
}

/**
 * Rejects malformed IPC data before it reaches picocli.  JSON configuration is
 * data, never a raw command-line escape hatch: arrays, null and scalar values
 * do not satisfy any of Chunker's object-taking options.
 */
export function validateChunkerCliConfig(value: unknown, worldSchema:Readonly<Record<string,string>>=PINNED_WORLD_SETTINGS): ChunkerCliConfig | null {
    if (value === undefined) return {};
    if (!isRecord(value)) return null;
    if (!boundedJson(value) || JSON.stringify(value).length > 48_000) return null;
    const allowed = new Set(CHUNKER_CLI_OPTION_INVENTORY.slice(3));
    if (Object.keys(value).some((key) => !allowed.has(key as (typeof CHUNKER_CLI_OPTION_INVENTORY)[number]))) return null;
    const config: ChunkerCliConfig = {};
    for (const [key] of JSON_OPTIONS) {
        const candidate = value[key];
        if (candidate === undefined) continue;
        const valid = key === "dimensionMappings" || key === "biomeMappings"
            ? isStringRecord(candidate)
            : key === "converterSettings" ? isConverterSettings(candidate)
            : key === "pruning" ? isPruning(candidate)
            : key === 'worldSettings' ? validateWorldSettings(candidate,worldSchema)
            : key === 'dimensionRegistry' ? isDimensionRegistry(candidate)
            : key === 'blockMappings' ? isBlockMappings(candidate) : false;
        if (!valid) return null;
        Object.assign(config, { [key]: candidate });
    }
    if (value.keepOriginalNBT !== undefined) {
        if (typeof value.keepOriginalNBT !== "boolean") return null;
        Object.assign(config, { keepOriginalNBT: value.keepOriginalNBT });
    }
    return config;
}

/** Preflight only. Execution additionally validates worldSettings against trusted jar metadata. */
export function validateChunkerConfigStructure(value:unknown):boolean{
    if(value===undefined)return true;
    if(!isRecord(value)||!boundedJson(value)||JSON.stringify(value).length>48000)return false;
    if(value.worldSettings!==undefined&&!isRecord(value.worldSettings))return false;
    return validateChunkerCliConfig({...value,worldSettings:{}})!==null;
}

/** Serializes every supported optional CLI value in the exact `CLI.java` spelling. */
export function chunkerConfigArguments(
    config: ChunkerCliConfig | undefined,
    inputFormat: string | null,
    outputFormat: string,
): readonly string[] {
    if (config === undefined) return [];
    const args: string[] = [];
    for (const [key, option] of JSON_OPTIONS) {
        const value = config[key];
        if (value !== undefined) args.push(option, JSON.stringify(value));
    }
    // Chunker itself exits zero after refusing this invalid combination.  Fail
    // before spawn, where the UI can tell the person why it is unavailable.
    if (config.keepOriginalNBT === true && inputFormat !== outputFormat) {
        throw new Error("keepOriginalNBT is only available when the output format matches the detected input format.");
    }
    if (config.keepOriginalNBT === true) args.push("--keepOriginalNBT");
    return args;
}
