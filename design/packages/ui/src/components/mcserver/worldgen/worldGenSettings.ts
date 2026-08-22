/**
 * Pure settings model for the world generator: what a user can choose in the wizard
 * before generation starts, and the validation that decides whether those choices are
 * sendable to a real server. No Vue, no bridge - see `WorldGeneratorDialog.vue` for the
 * GUI that edits this, and `worldGenPlan.ts` for what the settings turn into.
 */

import type { CatalogueFlavourId } from "../serverStore.js";
import { encodeSuperflatLayers, type SuperflatLayer } from "./superflatLayers.js";

export type WorldType = "default" | "flat" | "large_biomes" | "amplified" | "single_biome_surface";

export const WORLD_TYPES: readonly { readonly id: WorldType; readonly label: string; readonly hint: string }[] = [
    { id: "default", label: "Default", hint: "Ordinary terrain: continents, oceans, caves." },
    { id: "flat", label: "Superflat", hint: "A stack of flat layers you choose, then air." },
    { id: "large_biomes", label: "Large biomes", hint: "Default terrain with each biome stretched wider." },
    { id: "amplified", label: "Amplified", hint: "Exaggerated height noise - tall spires, deep ravines." },
    {
        id: "single_biome_surface",
        label: "Single biome",
        hint: "Ordinary terrain, but only one biome everywhere.",
    },
];

export interface WorldGenDimensions {
    /** Always generated; kept as a field so the UI can render it as a disabled switch. */
    readonly overworld: true;
    readonly nether: boolean;
    readonly end: boolean;
}

export interface WorldGenGamerules {
    readonly doDaylightCycle: boolean;
    readonly doWeatherCycle: boolean;
    readonly doMobSpawning: boolean;
    readonly keepInventory: boolean;
    readonly mobGriefing: boolean;
    readonly randomTickSpeed: number;
}

export const DEFAULT_GAMERULES: WorldGenGamerules = {
    doDaylightCycle: true,
    doWeatherCycle: true,
    doMobSpawning: true,
    keepInventory: false,
    mobGriefing: true,
    randomTickSpeed: 3,
};

export type OutputMode = "folder" | "zip";

export interface WorldGenSettings {
    /** Exactly what the user typed: blank, a number, or arbitrary text. */
    readonly seedInput: string;
    readonly worldType: WorldType;
    readonly singleBiome: string;
    readonly superflatLayers: readonly SuperflatLayer[];
    readonly generateStructures: boolean;
    readonly bonusChest: boolean;
    readonly dimensions: WorldGenDimensions;
    readonly worldBorderEnabled: boolean;
    /** Diameter in blocks, applied with `/worldborder set` once the world exists. */
    readonly worldBorderDiameter: number;
    /** Radius, in blocks, of the square region to pre-generate before packaging. */
    readonly pregenerationRadius: number;
    readonly flavour: CatalogueFlavourId;
    /** The exact catalogue version id, e.g. `"1.21.4"`. Empty until chosen. */
    readonly version: string;
    readonly gamerules: WorldGenGamerules;
    readonly outputMode: OutputMode;
    /** Folder (for `"folder"`) or archive path (for `"zip"`); typed or browsed via PathField. */
    readonly outputDestination: string;
    readonly worldName: string;
}

export function defaultWorldGenSettings(): WorldGenSettings {
    return {
        seedInput: "",
        worldType: "default",
        singleBiome: "minecraft:plains",
        superflatLayers: [
            { block: "minecraft:bedrock", depth: 1 },
            { block: "minecraft:dirt", depth: 2 },
            { block: "minecraft:grass_block", depth: 1 },
        ],
        generateStructures: true,
        bonusChest: false,
        dimensions: { overworld: true, nether: false, end: false },
        worldBorderEnabled: false,
        worldBorderDiameter: 60_000_000,
        pregenerationRadius: 500,
        flavour: "vanilla",
        version: "",
        gamerules: DEFAULT_GAMERULES,
        outputMode: "zip",
        outputDestination: "",
        worldName: "generated-world",
    };
}

export interface WorldGenValidation {
    readonly ok: boolean;
    /** Field name -> human-readable problem. Empty when `ok`. */
    readonly errors: Readonly<Record<string, string>>;
}

const NAMESPACED_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const WORLD_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,62}$/;

export function validateWorldGenSettings(settings: WorldGenSettings): WorldGenValidation {
    const errors: Record<string, string> = {};

    if (settings.version.trim() === "") {
        errors.version = "Choose a Minecraft version to generate with.";
    }

    if (settings.worldType === "single_biome_surface" && !NAMESPACED_ID.test(settings.singleBiome.trim())) {
        errors.singleBiome = 'Biome must be a namespaced id, like "minecraft:plains".';
    }

    if (settings.worldType === "flat") {
        if (settings.superflatLayers.length === 0) {
            errors.superflatLayers = "Add at least one layer.";
        } else {
            const bad = settings.superflatLayers.find(
                (layer) => !NAMESPACED_ID.test(layer.block.trim()) || !Number.isInteger(layer.depth) || layer.depth < 1,
            );
            if (bad !== undefined) {
                errors.superflatLayers = `"${bad.block}" needs a namespaced block id and a depth of at least 1.`;
            }
            const totalDepth = settings.superflatLayers.reduce((sum, layer) => sum + layer.depth, 0);
            if (totalDepth > 384) {
                errors.superflatLayers = `Layers total ${totalDepth} blocks tall; the world is at most 384 blocks tall.`;
            }
        }
    }

    if (!settings.dimensions.overworld) {
        errors.dimensions = "The overworld is always generated.";
    }

    if (settings.worldBorderEnabled) {
        if (!Number.isFinite(settings.worldBorderDiameter) || settings.worldBorderDiameter < 1) {
            errors.worldBorderDiameter = "Border diameter must be at least 1 block.";
        } else if (settings.worldBorderDiameter > 60_000_000) {
            errors.worldBorderDiameter = "Border diameter cannot exceed 60,000,000 blocks.";
        }
    }

    if (!Number.isFinite(settings.pregenerationRadius) || settings.pregenerationRadius < 16) {
        errors.pregenerationRadius = "Pre-generation radius must be at least 16 blocks.";
    } else if (settings.pregenerationRadius > 20_000) {
        errors.pregenerationRadius = "Pre-generation radius above 20,000 blocks will not finish in reasonable time.";
    }

    if (settings.gamerules.randomTickSpeed < 0 || !Number.isInteger(settings.gamerules.randomTickSpeed)) {
        errors.randomTickSpeed = "Random tick speed must be a whole number, 0 or more.";
    }

    if (!WORLD_NAME.test(settings.worldName.trim())) {
        errors.worldName = "World name must be a short, plain folder-safe name.";
    }

    if (settings.outputDestination.trim() === "") {
        errors.outputDestination = "Choose where the generated world should be written.";
    }

    return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Resolves what the user typed into the seed field to the numeric seed a server would
 * actually use, for display only. Blank means "let the server choose randomly" and has
 * no resolved number until one is rolled; a value that parses as an integer is used
 * verbatim; anything else is hashed the way this app's preview treats a text seed - a
 * real server resolves its own seed string internally, so this is a preview, not a
 * guarantee of the exact number a running server will pick.
 */
export function resolveSeedPreview(seedInput: string): number | null {
    const trimmed = seedInput.trim();
    if (trimmed === "") return null;
    const asInt = Number(trimmed);
    if (Number.isInteger(asInt) && String(asInt) === trimmed.replace(/^\+/, "")) return asInt;
    // Not a plain integer (too long for a safe JS number, or genuine text): fold it with a
    // deterministic string hash instead. A real server resolves its own seed string
    // internally, so this is a stable preview, not a promise of the exact same number.
    return hashSeedString(trimmed);
}

/** Deterministic 32-bit string hash (FNV-1a), used only for the seed preview above. */
export function hashSeedString(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

export function rollRandomSeed(): number {
    return Math.floor(Math.random() * 2 ** 31);
}

/** The `generator-settings` value a `flat` or `single_biome_surface` world needs. */
export function buildGeneratorSettings(settings: WorldGenSettings): string | null {
    if (settings.worldType === "flat") {
        return encodeSuperflatLayers(settings.superflatLayers);
    }
    return null;
}
