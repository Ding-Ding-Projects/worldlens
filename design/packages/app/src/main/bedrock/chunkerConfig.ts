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
    return Object.values(value.configs).every((rule) => isRecord(rule) && typeof rule.include === "boolean" && Array.isArray(rule.regions) &&
        rule.regions.every((box) => isRecord(box) && ["minChunkX", "minChunkZ", "maxChunkX", "maxChunkZ"].every((key) => Number.isSafeInteger(box[key])) &&
            Number(box.minChunkX) <= Number(box.maxChunkX) && Number(box.minChunkZ) <= Number(box.maxChunkZ)));
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
    return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
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
export function validateChunkerCliConfig(value: unknown): ChunkerCliConfig | null {
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
            : key === "pruning" ? isPruning(candidate) : isRecord(candidate);
        if (!valid) return null;
        Object.assign(config, { [key]: candidate });
    }
    if (value.keepOriginalNBT !== undefined) {
        if (typeof value.keepOriginalNBT !== "boolean") return null;
        Object.assign(config, { keepOriginalNBT: value.keepOriginalNBT });
    }
    return config;
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
