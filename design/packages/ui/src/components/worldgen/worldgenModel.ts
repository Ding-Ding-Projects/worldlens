/**
 * Pure logic for the world-generation wizard: no Vue, no bridge, no clock.
 *
 * This is a structural mirror of `packages/app/src/main/worldgen/{settings,superflat,estimate}.ts`,
 * not an import of it - exactly the pattern `mcserver/serverModel.ts` already uses for the
 * server hosting screens (see that file's own header), because packages/ui/ must stay
 * buildable without depending on packages/app/'s main-process module graph (node:fs and
 * friends). Any rule changed on one side belongs on both; the two test suites are what
 * catch a drift, since both assert the same encoding/validation behaviour independently.
 */

export type WorldType = "default" | "flat" | "large_biomes" | "amplified" | "single_biome_surface";

export const WORLD_TYPES: readonly WorldType[] = ["default", "flat", "large_biomes", "amplified", "single_biome_surface"];

export type FlavourId = "vanilla" | "paper" | "velocity" | "purpur" | "fabric";

export const FLAVOUR_IDS: readonly FlavourId[] = ["vanilla", "paper", "velocity", "purpur", "fabric"];

export type SeedMode = "random" | "chosen";

export interface WorldSeed {
    readonly mode: SeedMode;
    readonly text: string;
}

export interface SuperflatLayer {
    readonly block: string;
    readonly depth: number;
}

export const MAX_SUPERFLAT_LAYERS = 64;
export const MAX_LAYER_DEPTH = 4064;
export const MAX_TOTAL_HEIGHT = 4064;

const BLOCK_ID_RE = /^[a-z0-9_.]+:[a-z0-9_./]+$/;

export type LayerFieldError = { readonly index: number; readonly field: "block" | "depth"; readonly message: string };

export function validateSuperflatLayers(layers: readonly SuperflatLayer[]): readonly LayerFieldError[] {
    const errors: LayerFieldError[] = [];
    if (layers.length === 0) {
        errors.push({ index: -1, field: "block", message: "Add at least one layer." });
    }
    if (layers.length > MAX_SUPERFLAT_LAYERS) {
        errors.push({ index: -1, field: "block", message: `No more than ${MAX_SUPERFLAT_LAYERS} layers.` });
    }
    let total = 0;
    layers.forEach((layer, index) => {
        if (!BLOCK_ID_RE.test(layer.block)) {
            errors.push({ index, field: "block", message: `"${layer.block}" is not a valid block id, e.g. minecraft:dirt.` });
        }
        if (!Number.isInteger(layer.depth) || layer.depth < 1) {
            errors.push({ index, field: "depth", message: "Depth must be a whole number of at least 1." });
        } else if (layer.depth > MAX_LAYER_DEPTH) {
            errors.push({ index, field: "depth", message: `Depth cannot exceed ${MAX_LAYER_DEPTH}.` });
        } else {
            total += layer.depth;
        }
    });
    if (total > MAX_TOTAL_HEIGHT) {
        errors.push({ index: -1, field: "depth", message: `Total layer height (${total}) exceeds the world height limit (${MAX_TOTAL_HEIGHT}).` });
    }
    return errors;
}

export function encodeSuperflatLayers(layers: readonly SuperflatLayer[]): string {
    const runs: SuperflatLayer[] = [];
    for (const layer of layers) {
        const prev = runs[runs.length - 1];
        if (prev !== undefined && prev.block === layer.block) {
            runs[runs.length - 1] = { block: prev.block, depth: prev.depth + layer.depth };
        } else {
            runs.push({ block: layer.block, depth: layer.depth });
        }
    }
    return runs.map((run) => (run.depth === 1 ? run.block : `${run.block}*${run.depth}`)).join(";");
}

export type DecodeSuperflatResult =
    | { readonly ok: true; readonly layers: readonly SuperflatLayer[] }
    | { readonly ok: false; readonly error: string };

export function decodeSuperflatPreset(preset: string): DecodeSuperflatResult {
    const trimmed = preset.trim();
    if (trimmed.length === 0) {
        return { ok: false, error: "The preset string is empty." };
    }
    const layers: SuperflatLayer[] = [];
    for (const rawSegment of trimmed.split(";")) {
        const segment = rawSegment.trim();
        if (segment.length === 0) {
            return { ok: false, error: "The preset string has an empty segment between two semicolons." };
        }
        const starIndex = segment.indexOf("*");
        const block = starIndex === -1 ? segment : segment.slice(0, starIndex);
        const depthText = starIndex === -1 ? "1" : segment.slice(starIndex + 1);
        const depth = Number(depthText);
        if (!BLOCK_ID_RE.test(block)) {
            return { ok: false, error: `"${block}" in "${segment}" is not a valid block id.` };
        }
        if (!Number.isInteger(depth) || depth < 1) {
            return { ok: false, error: `"${depthText}" in "${segment}" is not a valid depth.` };
        }
        layers.push({ block, depth });
    }
    return { ok: true, layers };
}

export interface WorldBorderSettings {
    readonly enabled: boolean;
    readonly diameterBlocks: number;
}

export interface PregenExtent {
    readonly kind: "radius" | "bounds";
    readonly radiusChunks: number;
    readonly minChunkX: number;
    readonly minChunkZ: number;
    readonly maxChunkX: number;
    readonly maxChunkZ: number;
}

export type OutputKind = "folder" | "zip";

export interface GenerationOutput {
    readonly kind: OutputKind;
    readonly destination: string;
}

export interface WorldGenerationSettings {
    readonly worldName: string;
    readonly seed: WorldSeed;
    readonly worldType: WorldType;
    readonly superflatLayers: readonly SuperflatLayer[];
    readonly singleBiome: string;
    readonly dimensions: { readonly overworld: boolean; readonly nether: boolean; readonly end: boolean };
    readonly generateStructures: boolean;
    readonly bonusChest: boolean;
    readonly worldBorder: WorldBorderSettings;
    readonly extent: PregenExtent;
    readonly flavour: FlavourId;
    readonly version: string;
    readonly gamerules: Readonly<Record<string, string>>;
    readonly output: GenerationOutput;
}

export function defaultWorldGenerationSettings(): WorldGenerationSettings {
    return {
        worldName: "New World",
        seed: { mode: "random", text: "" },
        worldType: "default",
        superflatLayers: [
            { block: "minecraft:bedrock", depth: 1 },
            { block: "minecraft:dirt", depth: 2 },
            { block: "minecraft:grass_block", depth: 1 },
        ],
        singleBiome: "minecraft:plains",
        dimensions: { overworld: true, nether: true, end: true },
        generateStructures: true,
        bonusChest: false,
        worldBorder: { enabled: false, diameterBlocks: 60_000_000 },
        extent: { kind: "radius", radiusChunks: 20, minChunkX: -20, minChunkZ: -20, maxChunkX: 20, maxChunkZ: 20 },
        flavour: "vanilla",
        version: "",
        gamerules: {},
        output: { kind: "folder", destination: "" },
    };
}

export type SettingsFieldError = { readonly field: string; readonly message: string };

const WORLD_NAME_RE = /^[^\\/:*?"<>|]+$/;
const NUMERIC_SEED_RE = /^-?\d+$/;

export function resolveNumericSeed(seed: WorldSeed): number | null {
    if (seed.mode === "random") return null;
    const text = seed.text.trim();
    if (text.length === 0) return null;
    if (NUMERIC_SEED_RE.test(text)) return Number(text);
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
    }
    return hash;
}

export function validateWorldGenerationSettings(settings: WorldGenerationSettings): readonly SettingsFieldError[] {
    const errors: SettingsFieldError[] = [];

    if (settings.worldName.trim().length === 0) {
        errors.push({ field: "worldName", message: "Name the world." });
    } else if (!WORLD_NAME_RE.test(settings.worldName)) {
        errors.push({ field: "worldName", message: 'World name cannot contain \\ / : * ? " < > |' });
    }

    if (settings.seed.mode === "chosen" && settings.seed.text.trim().length === 0) {
        errors.push({ field: "seed", message: "Type a seed, or switch to a random one." });
    }

    if (!settings.dimensions.overworld && !settings.dimensions.nether && !settings.dimensions.end) {
        errors.push({ field: "dimensions", message: "Generate at least one dimension." });
    }

    if (settings.worldType === "flat") {
        for (const layerError of validateSuperflatLayers(settings.superflatLayers)) {
            errors.push({ field: `superflatLayers[${layerError.index}].${layerError.field}`, message: layerError.message });
        }
    }

    if (settings.worldType === "single_biome_surface" && settings.singleBiome.trim().length === 0) {
        errors.push({ field: "singleBiome", message: "Choose a biome for a single-biome world." });
    }

    if (settings.worldBorder.enabled) {
        if (!Number.isFinite(settings.worldBorder.diameterBlocks) || settings.worldBorder.diameterBlocks < 1) {
            errors.push({ field: "worldBorder.diameterBlocks", message: "Border diameter must be at least 1 block." });
        }
    }

    if (settings.extent.kind === "radius") {
        if (!Number.isInteger(settings.extent.radiusChunks) || settings.extent.radiusChunks < 1) {
            errors.push({ field: "extent.radiusChunks", message: "Pre-generation radius must be a whole number of at least 1 chunk." });
        } else if (settings.extent.radiusChunks > 10_000) {
            errors.push({ field: "extent.radiusChunks", message: "Pre-generation radius cannot exceed 10,000 chunks." });
        }
    } else {
        const { minChunkX, minChunkZ, maxChunkX, maxChunkZ } = settings.extent;
        for (const [field, value] of [
            ["extent.minChunkX", minChunkX],
            ["extent.minChunkZ", minChunkZ],
            ["extent.maxChunkX", maxChunkX],
            ["extent.maxChunkZ", maxChunkZ],
        ] as const) {
            if (!Number.isInteger(value)) {
                errors.push({ field, message: "Chunk bounds must be whole numbers." });
            }
        }
        if (minChunkX >= maxChunkX) {
            errors.push({ field: "extent.maxChunkX", message: "Maximum chunk X must be greater than minimum chunk X." });
        }
        if (minChunkZ >= maxChunkZ) {
            errors.push({ field: "extent.maxChunkZ", message: "Maximum chunk Z must be greater than minimum chunk Z." });
        }
    }

    if (settings.version.trim().length === 0) {
        errors.push({ field: "version", message: "Choose a version from the catalogue before generating." });
    }

    if (settings.output.destination.trim().length === 0) {
        errors.push({ field: "output.destination", message: "Choose a destination folder or zip file." });
    } else if (settings.output.kind === "zip" && !/\.zip$/i.test(settings.output.destination)) {
        errors.push({ field: "output.destination", message: "A zip destination must end in .zip" });
    }

    return errors;
}

export function chunkCount(extent: PregenExtent): number {
    if (extent.kind === "radius") {
        const side = extent.radiusChunks * 2 + 1;
        return side * side;
    }
    const width = extent.maxChunkX - extent.minChunkX + 1;
    const depth = extent.maxChunkZ - extent.minChunkZ + 1;
    return Math.max(0, width) * Math.max(0, depth);
}

const BYTES_PER_CHUNK_ESTIMATE = 35_000;
const CHUNKS_PER_SECOND_ESTIMATE = 12;

export interface GenerationEstimate {
    readonly chunkCount: number;
    readonly estimatedBytes: number;
    readonly estimatedSeconds: number;
}

export function estimateGeneration(extent: PregenExtent, dimensionCount: number): GenerationEstimate {
    const chunks = chunkCount(extent) * Math.max(1, dimensionCount);
    return {
        chunkCount: chunks,
        estimatedBytes: chunks * BYTES_PER_CHUNK_ESTIMATE,
        estimatedSeconds: Math.ceil(chunks / CHUNKS_PER_SECOND_ESTIMATE),
    };
}

export function formatEstimatedBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"] as const;
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const rounded = unitIndex === 0 ? String(Math.round(value)) : value.toFixed(1);
    return `${rounded} ${units[unitIndex]}`;
}

export function formatEstimatedSeconds(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

export type RunnerChoice =
    | { readonly kind: "local" }
    | { readonly kind: "remote"; readonly label: string; readonly key: string }
    | { readonly kind: "github-actions"; readonly owner: string; readonly repo: string };

export function describeRunner(runner: RunnerChoice): string {
    if (runner.kind === "local") return "This computer";
    if (runner.kind === "remote") return runner.label;
    return `GitHub Actions (${runner.owner}/${runner.repo})`;
}

export function runnerKey(runner: RunnerChoice): string {
    if (runner.kind === "local") return "local";
    if (runner.kind === "remote") return `remote:${runner.key}`;
    return `github-actions:${runner.owner}/${runner.repo}`;
}
