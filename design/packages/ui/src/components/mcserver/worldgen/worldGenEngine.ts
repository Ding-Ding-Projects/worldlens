/**
 * Which engine actually generates the world, and - the part that earns this module its
 * own file - exactly which of the wizard's settings that engine will quietly ignore.
 *
 * There are two, and they are not interchangeable:
 *
 * - `"synthetic"` runs this repository's own `@worldlens/worldgen` package, which writes
 *   real Anvil region files and a real `level.dat` directly. It works today, offline,
 *   with no server jar and no Java. What it does NOT do is reproduce Minecraft's own
 *   world generation: its terrain comes from this app's value-noise generator, so a seed
 *   here has nothing whatsoever to do with the same number typed into Minecraft, and
 *   nearly every generator-shaped setting in the wizard has no effect on it.
 * - `"vanilla-server"` is the planned route that runs a real server jar and lets Mojang's
 *   own generator do the work. It honours every setting, and it is not wired up yet - see
 *   `UNWIRED_STEP_KINDS` in `worldGenPlan.ts`.
 *
 * The ignored-settings list below exists because the failure this feature could most
 * easily ship is a world that looks generated and does not match what the player expects.
 * Rendering an accurate "this engine will ignore these choices" list from real data is
 * cheaper than an apology, and unlike a code comment it cannot drift away from the truth
 * without a test noticing.
 */

import type { WorldGenSettings } from "./worldGenSettings.js";

export type WorldGenEngineId = "synthetic" | "vanilla-server";

export interface WorldGenEngine {
    readonly id: WorldGenEngineId;
    readonly label: string;
    /** One line, shown under the engine picker. */
    readonly summary: string;
    /** True when choosing this engine actually produces a world in this build. */
    readonly wired: boolean;
}

export const WORLD_GEN_ENGINES: readonly WorldGenEngine[] = [
    {
        id: "synthetic",
        label: "Built-in generator (synthetic terrain)",
        summary:
            "Writes a real, loadable world with no server jar and no Java. The terrain is this app's own, not Minecraft's.",
        wired: true,
    },
    {
        id: "vanilla-server",
        label: "Real Minecraft server + Chunky",
        summary:
            "Runs the downloaded server jar once, then Chunky pre-generates the requested radius with vanilla-accurate terrain.",
        // False, and it must stay false until the route can actually be invoked. The
        // implementation exists - `main/mcserver/worldgen/localGeneration.ts` launches the
        // jar and drives Chunky - but nothing imports it: there is no IPC channel and no
        // preload method reaching it, so the module is inert. `UNWIRED_STEP_KINDS` still
        // lists every step this engine needs, and the file header above still says the
        // route is not wired.
        //
        // Flipping this to true while the wiring is missing is the worst version of this
        // feature: the picker would tell somebody the vanilla-accurate engine works, and
        // choosing it would produce nothing. Flip it in the same change that registers the
        // channel, not before.
        wired: false,
    },
];

export function engineById(id: WorldGenEngineId): WorldGenEngine {
    const found = WORLD_GEN_ENGINES.find((engine) => engine.id === id);
    if (found === undefined) throw new Error(`Unknown world generation engine: ${id}`);
    return found;
}

/**
 * The warning that must appear wherever a user can start a synthetic generation.
 *
 * Kept as one exported constant so the dialog, any future command-palette entry, and the
 * tests all quote the identical words. A caveat that exists in three slightly different
 * wordings is a caveat that will be edited in two places and left stale in the third.
 */
export const SYNTHETIC_TERRAIN_NOTICE =
    "This generates synthetic terrain, not a Minecraft-accurate world. " +
    "The same seed typed into Minecraft will produce something completely different, " +
    "and the world-type, biome, structure, dimension and gamerule choices below do not affect it.";

/** A wizard setting the chosen engine will not act on, named the way the GUI labels it. */
export interface IgnoredSetting {
    /** Matches the field name in {@link WorldGenSettings}, so a test can pin it. */
    readonly field: string;
    readonly label: string;
    readonly reason: string;
}

const SYNTHETIC_ALWAYS_IGNORED: readonly IgnoredSetting[] = [
    { field: "worldType", label: "World type", reason: "The built-in generator has one terrain style." },
    { field: "generateStructures", label: "Generate structures", reason: "The built-in generator places no structures." },
    { field: "bonusChest", label: "Bonus chest", reason: "There is no server running to place one." },
    { field: "flavour", label: "Server flavour", reason: "No server jar is downloaded or run." },
    { field: "version", label: "Minecraft version", reason: "The world is written in this app's own fixed Anvil format." },
    { field: "gamerules", label: "Gamerules", reason: "Gamerules are set by console commands, which need a running server." },
    { field: "worldBorderEnabled", label: "World border", reason: "The border is set by a console command, which needs a running server." },
];

/**
 * Every setting the given engine will ignore, given what the user has actually chosen.
 *
 * Conditional on the settings rather than a fixed list, so the wizard does not warn about
 * superflat layers to somebody who never opened the superflat editor - a warning about a
 * choice you did not make is noise, and noise is how a real warning gets skimmed past.
 */
export function ignoredSettingsFor(engineId: WorldGenEngineId, settings: WorldGenSettings): readonly IgnoredSetting[] {
    if (engineId !== "synthetic") return [];

    const ignored = [...SYNTHETIC_ALWAYS_IGNORED];

    if (settings.worldType === "flat") {
        ignored.push({
            field: "superflatLayers",
            label: "Superflat layers",
            reason: "The built-in generator does not read a superflat preset.",
        });
    }
    if (settings.worldType === "single_biome_surface") {
        ignored.push({
            field: "singleBiome",
            label: "Single biome",
            reason: "The built-in generator chooses biomes from its own terrain.",
        });
    }
    if (settings.dimensions.nether || settings.dimensions.end) {
        ignored.push({
            field: "dimensions",
            label: "The Nether and The End",
            reason: "The built-in generator writes the overworld only.",
        });
    }

    return ignored;
}

/**
 * The square edge length, in blocks, the synthetic generator is asked for.
 *
 * The wizard collects a RADIUS because that is what a pre-generation setting means to a
 * player; `generateWorld` takes an edge length. Converting in one named, tested function
 * keeps the factor of two out of the call site, which is exactly the sort of arithmetic
 * that gets silently halved or doubled during a refactor.
 */
export function syntheticWorldSize(pregenerationRadius: number): number {
    const radius = Math.max(0, Math.trunc(pregenerationRadius));
    return Math.max(16, radius * 2);
}
