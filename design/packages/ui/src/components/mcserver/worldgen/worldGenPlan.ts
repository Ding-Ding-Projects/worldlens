/**
 * Turns validated {@link WorldGenSettings} into a reviewable, honest plan: exactly what
 * would run, in what order, where, and with what inputs and outputs. No Vue, no bridge,
 * and - this is the important part - **no execution**. Building this plan never
 * generates a world; it only describes one.
 *
 * Reuses this app's real seams rather than inventing a fifth way to run something:
 *
 * - `"local"` maps onto the existing local server lifecycle
 *   (`mcserver/create.ts` + `mcserver/transport/localProcess.ts`): create a real server
 *   with the downloaded jar, launch it, let it generate, stop it, package the result.
 * - `"github-actions"` maps onto the existing CI-render seam
 *   (`app/src/main/cirender/`: `gh.ts`, `schedule.ts`, `state.ts`,
 *   `workflowTemplates.ts`), which already knows how to dispatch a workflow, persist
 *   run state across an app restart, poll honestly, and download an artifact - exactly
 *   the properties a long, remote generation job needs. World generation adds a new
 *   workflow *kind* to that seam; it does not need a new transport.
 *
 * What is genuinely wired end-to-end as of this module: nothing yet. The steps below are
 * the real plan for wiring it - each one names the existing module it would call. See
 * `UNWIRED_STEP_KINDS` for the exact list of steps that build the request but do not yet
 * invoke anything, so a caller can render that boundary honestly instead of pretending a
 * click on "Generate" produces a world.
 */

import type { WorldGenSettings } from "./worldGenSettings.js";
import { buildGeneratorSettings } from "./worldGenSettings.js";

export interface PregenerationEstimate {
    readonly chunkRadius: number;
    readonly chunkCount: number;
    /** Rough on-disk size, in bytes. Labelled an estimate everywhere it is shown. */
    readonly estimatedBytes: number;
    /** Rough wall-clock time to pre-generate every chunk once, in seconds. */
    readonly estimatedSeconds: number;
}

// Heuristics only, calibrated loosely against a modern vanilla server on ordinary
// hardware. Neither constant is measured by this app; both exist so the wizard can show
// a number instead of nothing, and both are labelled ESTIMATE at every call site.
const BYTES_PER_CHUNK_ESTIMATE = 6_500;
const CHUNKS_PER_SECOND_ESTIMATE = 40;

export function estimatePregeneration(pregenerationRadius: number): PregenerationEstimate {
    const chunkRadius = Math.ceil(Math.max(0, pregenerationRadius) / 16);
    const edge = chunkRadius * 2 + 1;
    const chunkCount = edge * edge;
    return {
        chunkRadius,
        chunkCount,
        estimatedBytes: chunkCount * BYTES_PER_CHUNK_ESTIMATE,
        estimatedSeconds: Math.ceil(chunkCount / CHUNKS_PER_SECOND_ESTIMATE),
    };
}

/** The exact `server.properties` this generation run would write. */
export function buildServerProperties(settings: WorldGenSettings): Readonly<Record<string, string>> {
    const properties: Record<string, string> = {
        "level-name": settings.worldName.trim(),
        "generate-structures": String(settings.generateStructures),
        "level-type":
            settings.worldType === "single_biome_surface"
                ? "minecraft:single_biome_surface"
                : `minecraft:${settings.worldType === "default" ? "normal" : settings.worldType}`,
    };
    if (settings.seedInput.trim() !== "") {
        properties["level-seed"] = settings.seedInput.trim();
    }
    const generatorSettings = buildGeneratorSettings(settings);
    if (generatorSettings !== null) {
        properties["generator-settings"] = generatorSettings;
    }
    if (settings.worldType === "single_biome_surface") {
        // Vanilla encodes the single biome inside generator-settings too; kept as its own
        // property here so the plan stays legible even though a real server only reads it
        // from generator-settings JSON at generation time.
        properties["generator-settings"] = JSON.stringify({ biome: settings.singleBiome.trim() });
    }
    return properties;
}

/** Console commands this run would send once the server reports the world is loaded. */
export function buildPostGenerationCommands(settings: WorldGenSettings): readonly string[] {
    const commands: string[] = [];
    if (settings.bonusChest) {
        // There is no server.properties key for a bonus chest on modern versions; the
        // honest route is the same command a player would type.
        commands.push("/give @s minecraft:chest 1");
    }
    if (settings.worldBorderEnabled) {
        commands.push(`/worldborder set ${Math.round(settings.worldBorderDiameter)}`);
    }
    const gr = settings.gamerules;
    commands.push(`/gamerule doDaylightCycle ${gr.doDaylightCycle}`);
    commands.push(`/gamerule doWeatherCycle ${gr.doWeatherCycle}`);
    commands.push(`/gamerule doMobSpawning ${gr.doMobSpawning}`);
    commands.push(`/gamerule keepInventory ${gr.keepInventory}`);
    commands.push(`/gamerule mobGriefing ${gr.mobGriefing}`);
    commands.push(`/gamerule randomTickSpeed ${gr.randomTickSpeed}`);
    return commands;
}

export type WorldGenRunner =
    | { readonly kind: "local" }
    | { readonly kind: "github-actions"; readonly repoSlug: string; readonly workflowFile: string };

export type GenerationStepKind =
    | "resolve-catalogue-version"
    | "create-server"
    | "write-server-properties"
    | "launch-server"
    | "dispatch-github-workflow"
    | "await-world-ready"
    | "run-console-commands"
    | "pregenerate-chunks"
    | "stop-server"
    | "await-workflow-completion"
    | "download-artifact"
    | "package-output";

export interface GenerationStep {
    readonly kind: GenerationStepKind;
    /** Plain-language description of what this step does, for the plan preview. */
    readonly description: string;
    /** The existing module this step would call once wired, or null for a new one. */
    readonly reuses: string | null;
}

export interface GenerationPlan {
    readonly runner: WorldGenRunner;
    readonly serverProperties: Readonly<Record<string, string>>;
    readonly postGenerationCommands: readonly string[];
    readonly pregeneration: PregenerationEstimate;
    readonly dimensionsToPackage: readonly string[];
    readonly outputPath: string;
    readonly steps: readonly GenerationStep[];
}

/**
 * Step kinds that build their request/inputs correctly but are not yet connected to a
 * running server, a real GitHub Actions dispatch, or a filesystem write in this build.
 * The wizard renders an honest boundary banner naming these rather than letting
 * "Generate" appear to do something it does not.
 */
export const UNWIRED_STEP_KINDS: readonly GenerationStepKind[] = [
    "launch-server",
    "dispatch-github-workflow",
    "await-world-ready",
    "run-console-commands",
    "pregenerate-chunks",
    "stop-server",
    "await-workflow-completion",
    "download-artifact",
    "package-output",
];

export function buildGenerationPlan(settings: WorldGenSettings, runner: WorldGenRunner): GenerationPlan {
    const serverProperties = buildServerProperties(settings);
    const postGenerationCommands = buildPostGenerationCommands(settings);
    const pregeneration = estimatePregeneration(settings.pregenerationRadius);
    const dimensionsToPackage = [
        "overworld",
        ...(settings.dimensions.nether ? ["nether"] : []),
        ...(settings.dimensions.end ? ["end"] : []),
    ];
    const outputPath = settings.outputDestination.trim();

    const steps: GenerationStep[] = [
        {
            kind: "resolve-catalogue-version",
            description: `Confirm ${settings.flavour} ${settings.version || "(no version chosen)"} against the live catalogue.`,
            reuses: "mcserver/flavours/catalogue.ts",
        },
        {
            kind: "create-server",
            description: "Download the server jar and write server.properties, exactly as creating an ordinary server does.",
            reuses: "mcserver/create.ts",
        },
        {
            kind: "write-server-properties",
            description: `Write ${Object.keys(serverProperties).length} server.properties keys for this world.`,
            reuses: "mcserver/create.ts",
        },
    ];

    if (runner.kind === "local") {
        steps.push(
            {
                kind: "launch-server",
                description: "Launch the server with --nogui and wait for it to accept console input.",
                reuses: "mcserver/transport/localProcess.ts",
            },
            {
                kind: "await-world-ready",
                description: 'Watch the console for "Done" - the world has finished its initial generation.',
                reuses: null,
            },
        );
    } else {
        steps.push({
            kind: "dispatch-github-workflow",
            description: `Dispatch a workflow in ${runner.repoSlug} (${runner.workflowFile}) that runs the same server-jar steps on a GitHub Actions runner.`,
            reuses: "cirender/gh.ts, cirender/schedule.ts, cirender/workflowTemplates.ts",
        });
    }

    steps.push({
        kind: "pregenerate-chunks",
        description: `Pre-generate a ${pregeneration.chunkRadius}-chunk radius (${pregeneration.chunkCount} chunks, ~${formatBytes(pregeneration.estimatedBytes)}, ESTIMATE) with /forceload or a pregeneration mod command.`,
        reuses: null,
    });

    if (postGenerationCommands.length > 0) {
        steps.push({
            kind: "run-console-commands",
            description: `Send ${postGenerationCommands.length} console commands (gamerules, world border, bonus chest).`,
            reuses: null,
        });
    }

    if (runner.kind === "local") {
        steps.push({
            kind: "stop-server",
            description: "Stop the server cleanly so every region file is flushed to disk.",
            reuses: "mcserver/transport/localProcess.ts",
        });
    } else {
        steps.push(
            {
                kind: "await-workflow-completion",
                description: "Poll the run, surviving an app restart, and never report success before the run is actually finished.",
                reuses: "cirender/state.ts, cirender/schedule.ts",
            },
            {
                kind: "download-artifact",
                description: "Download the generated world artifact the workflow uploaded.",
                reuses: "cirender/upload.ts",
            },
        );
    }

    steps.push({
        kind: "package-output",
        description:
            settings.outputMode === "zip"
                ? `Zip ${dimensionsToPackage.join(", ")} into ${outputPath || "(no destination chosen)"}.`
                : `Copy ${dimensionsToPackage.join(", ")} into the folder ${outputPath || "(no destination chosen)"}.`,
        reuses: null,
    });

    return {
        runner,
        serverProperties,
        postGenerationCommands,
        pregeneration,
        dimensionsToPackage,
        outputPath,
        steps,
    };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}
