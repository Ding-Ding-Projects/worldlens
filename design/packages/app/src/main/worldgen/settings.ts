/**
 * Every world-generation setting a user chooses before generation starts, and how the
 * whole set is validated together.
 *
 * This is the load-bearing part of the world generator feature: a wrong or contradictory
 * setting caught here never reaches a runner, a real process, or a zip file. Nothing in
 * this module talks to a filesystem, a process, or a network - it is pure data plus pure
 * functions, so every rule can be proven with a plain unit test.
 */

import type { FlavourId } from "../mcserver/flavours/catalogue.js";
import { encodeSuperflatLayers, validateSuperflatLayers, type SuperflatLayer, type LayerFieldError } from "./superflat.js";

export type WorldType = "default" | "flat" | "large_biomes" | "amplified" | "single_biome_surface";

export const WORLD_TYPES: readonly WorldType[] = ["default", "flat", "large_biomes", "amplified", "single_biome_surface"];

export type SeedMode = "random" | "chosen";

export interface WorldSeed {
    readonly mode: SeedMode;
    /** The literal text the user typed, when {@link mode} is "chosen". Ignored otherwise. */
    readonly text: string;
}

export interface WorldBorderSettings {
    readonly enabled: boolean;
    /** Diameter in blocks. Only meaningful when {@link enabled} is true. */
    readonly diameterBlocks: number;
}

export interface PregenExtent {
    /** Radius from spawn, in chunks. Mutually exclusive with explicit bounds - see validation. */
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
    /** Absolute destination path: a folder to write the world into, or the .zip file to write. */
    readonly destination: string;
}

export interface WorldGenerationSettings {
    readonly worldName: string;
    readonly seed: WorldSeed;
    readonly worldType: WorldType;
    /** Only read when {@link worldType} is "flat". */
    readonly superflatLayers: readonly SuperflatLayer[];
    /** Only read when {@link worldType} is "single_biome_surface". A namespaced biome id. */
    readonly singleBiome: string;
    readonly dimensions: {
        readonly overworld: boolean;
        readonly nether: boolean;
        readonly end: boolean;
    };
    readonly generateStructures: boolean;
    readonly bonusChest: boolean;
    readonly worldBorder: WorldBorderSettings;
    readonly extent: PregenExtent;
    readonly flavour: FlavourId;
    /** Exact version string from the live catalogue, e.g. "1.21.4". Never invented here. */
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

/** Resolves the numeric seed the game will actually use, exactly as Minecraft does: a
 * chosen numeric string is used verbatim, a chosen non-numeric string is hashed into a
 * long the same way `java.lang.String.hashCode()` would feed it, and "random" resolves to
 * null (the caller must supply randomness; this module never calls a random source so its
 * output stays deterministic and testable). */
export function resolveNumericSeed(seed: WorldSeed): number | null {
    if (seed.mode === "random") {
        return null;
    }
    const text = seed.text.trim();
    if (text.length === 0) {
        return null;
    }
    if (NUMERIC_SEED_RE.test(text)) {
        // Fits Minecraft's own long-seed behaviour closely enough for display/validation
        // purposes; values outside safe-integer range still round-trip through Number for
        // this feature's arithmetic (estimates, equality checks), never through the JVM.
        return Number(text);
    }
    // Java String#hashCode: 31-multiplicative rolling hash over UTF-16 code units.
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
    }
    return hash;
}

/** Validates the full settings object together, so contradictions between two otherwise
 * valid fields (e.g. "bounds" extent with min > max) are caught, not just per-field shape. */
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

/** How many chunks {@link PregenExtent} actually covers, regardless of which shape it was
 * expressed in. Used by both validation-adjacent UI and the size/time estimate. */
export function chunkCount(extent: PregenExtent): number {
    if (extent.kind === "radius") {
        const side = extent.radiusChunks * 2 + 1;
        return side * side;
    }
    const width = extent.maxChunkX - extent.minChunkX + 1;
    const depth = extent.maxChunkZ - extent.minChunkZ + 1;
    return Math.max(0, width) * Math.max(0, depth);
}

/** The server.properties-shaped level-type string Minecraft expects for a given world type. */
export function levelTypeFor(worldType: WorldType): string {
    switch (worldType) {
        case "default":
            return "minecraft:normal";
        case "flat":
            return "minecraft:flat";
        case "large_biomes":
            return "minecraft:large_biomes";
        case "amplified":
            return "minecraft:amplified";
        case "single_biome_surface":
            return "minecraft:single_biome_surface";
    }
}

/** The generator-settings string for a given world type, when the game needs one. */
export function generatorSettingsFor(settings: WorldGenerationSettings): string | null {
    if (settings.worldType === "flat") {
        return encodeSuperflatLayers(settings.superflatLayers);
    }
    if (settings.worldType === "single_biome_surface") {
        return JSON.stringify({ biome: settings.singleBiome });
    }
    return null;
}

export type { SuperflatLayer, LayerFieldError };
