/**
 * Turning validated settings plus a chosen runner into a `GenerationPlan`: the exact
 * `server.properties` overrides, gamerules, dimensions to keep, and output packaging step
 * that carrying out generation means, on whichever runner was chosen.
 *
 * This is pure and produces a plan, never carries it out - `worldgen/ipc.ts` (not yet
 * wired to a live process in this change; see the module header there) is the seam where
 * a plan would actually be handed to a transport or dispatched to a workflow.
 */

import {
    generatorSettingsFor,
    levelTypeFor,
    resolveNumericSeed,
    validateWorldGenerationSettings,
    type SettingsFieldError,
    type WorldGenerationSettings,
} from "./settings.js";
import { estimateGeneration, type GenerationEstimate } from "./estimate.js";
import { describeRunner, runnerKey, type RunnerChoice } from "./runner.js";

export interface GenerationPlan {
    readonly settings: WorldGenerationSettings;
    readonly runner: RunnerChoice;
    readonly runnerLabel: string;
    readonly runnerKey: string;
    /** Exactly the `server.properties` keys generation needs to set, as strings, the same
     * shape every other server.properties writer in this app already uses. */
    readonly serverProperties: Readonly<Record<string, string>>;
    readonly dimensionsToKeep: readonly ("overworld" | "the_nether" | "the_end")[];
    readonly estimate: GenerationEstimate;
}

export type PlanResult =
    | { readonly ok: true; readonly plan: GenerationPlan }
    | { readonly ok: false; readonly errors: readonly SettingsFieldError[] };

export function buildGenerationPlan(settings: WorldGenerationSettings, runner: RunnerChoice): PlanResult {
    const errors = validateWorldGenerationSettings(settings);
    if (errors.length > 0) {
        return { ok: false, errors };
    }

    const numericSeed = resolveNumericSeed(settings.seed);
    const generatorSettings = generatorSettingsFor(settings);

    const serverProperties: Record<string, string> = {
        "level-name": settings.worldName,
        "level-type": levelTypeFor(settings.worldType),
        "generate-structures": String(settings.generateStructures),
        "allow-nether": String(settings.dimensions.nether),
        "spawn-monsters": "true",
    };
    if (numericSeed !== null) {
        serverProperties["level-seed"] = String(numericSeed);
    }
    if (generatorSettings !== null) {
        serverProperties["generator-settings"] = generatorSettings;
    }
    if (settings.bonusChest) {
        serverProperties["bonus-chest"] = "true";
    }
    if (settings.worldBorder.enabled) {
        serverProperties["max-world-size"] = String(Math.ceil(settings.worldBorder.diameterBlocks / 2));
    }

    const dimensionsToKeep: ("overworld" | "the_nether" | "the_end")[] = [];
    if (settings.dimensions.overworld) dimensionsToKeep.push("overworld");
    if (settings.dimensions.nether) dimensionsToKeep.push("the_nether");
    if (settings.dimensions.end) dimensionsToKeep.push("the_end");

    const estimate = estimateGeneration(settings.extent, dimensionsToKeep.length);

    return {
        ok: true,
        plan: {
            settings,
            runner,
            runnerLabel: describeRunner(runner),
            runnerKey: runnerKey(runner),
            serverProperties,
            dimensionsToKeep,
            estimate,
        },
    };
}
