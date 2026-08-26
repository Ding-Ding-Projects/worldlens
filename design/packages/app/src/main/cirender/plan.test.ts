/**
 * The project file turned into workflow inputs.
 *
 * Pure, so every refusal is reachable without a disk or a network. The two assertions
 * worth reading twice are that the `world` input carries the asset's **exact** name rather
 * than a glob - a backup release holds three assets and a glob could take the wrong one -
 * and that a dimension the workflow does not offer is refused here rather than by GitHub's
 * generic 422.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectFile, ProjectMap } from "@worldlens/config";
import { LEGACY_PROJECT_FILE_NAME } from "@worldlens/config";
import {
    DEFAULT_BUDGET_MINUTES,
    DEFAULT_MAX_JOBS,
    PROJECT_FILE_NAME,
    chooseProjectMap,
    planCiRender,
    readProjectAt,
} from "./plan.js";

function map(overrides: Partial<ProjectMap> = {}): ProjectMap {
    return {
        id: "world",
        name: "World",
        dimension: "minecraft:overworld",
        world: null,
        config: "",
        storage: "file",
        sorting: 0,
        enabled: true,
        ...overrides,
    };
}

function project(maps: ProjectMap[]): ProjectFile {
    return {
        version: 1,
        id: "project-1",
        name: "Overworld",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        appVersion: null,
        maps,
        storages: [],
        render: {
            engine: "upstream-java",
            threads: null,
            force: false,
            fixEdges: false,
            metrics: false,
            outputFolder: null,
        },
        core: null,
        webapp: null,
        webserver: null,
        plugin: null,
        fromWizard: false,
    };
}

describe("the inputs", () => {
    it("builds every input the workflow declares, with the asset named exactly", () => {
        const result = planCiRender({
            project: project([map()]),
            releaseTag: "mbm-backup-world-overworld-20260804T101500Z",
            assetName: "world-overworld-20260804T101500Z.zip",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.inputs).toEqual({
            "world-source": "release-asset",
            world: "mbm-backup-world-overworld-20260804T101500Z/world-overworld-20260804T101500Z.zip",
            dimension: "minecraft:overworld",
            "map-id": "world",
            "map-name": "World",
            output: "artifact",
            "budget-minutes": String(DEFAULT_BUDGET_MINUTES),
            "max-jobs": String(DEFAULT_MAX_JOBS),
            "force-shards": "",
        });
        // A glob would let a backup release's pointer or sidecar be picked instead.
        expect(result.plan.inputs["world"]).not.toContain("*");
    });

    it("stays inside GitHub's ten-input cap", () => {
        const result = planCiRender({
            project: project([map()]),
            releaseTag: "t",
            assetName: "a.zip",
        });
        expect(result.ok && Object.keys(result.plan.inputs).length).toBeLessThanOrEqual(10);
    });

    it("passes a budget, a job cap and the Pages choice through as strings", () => {
        const result = planCiRender({
            project: project([map()]),
            releaseTag: "t",
            assetName: "a.zip",
            budgetMinutes: 90,
            maxJobs: 12,
            output: "artifact-and-pages",
        });
        expect(result.ok && result.plan.inputs["budget-minutes"]).toBe("90");
        expect(result.ok && result.plan.inputs["max-jobs"]).toBe("12");
        expect(result.ok && result.plan.inputs["output"]).toBe("artifact-and-pages");
    });

    it("falls back to the workflow's own defaults for a nonsense budget", () => {
        const result = planCiRender({
            project: project([map()]),
            releaseTag: "t",
            assetName: "a.zip",
            budgetMinutes: 0,
            maxJobs: -4,
        });
        expect(result.ok && result.plan.inputs["budget-minutes"]).toBe(
            String(DEFAULT_BUDGET_MINUTES),
        );
        expect(result.ok && result.plan.inputs["max-jobs"]).toBe(String(DEFAULT_MAX_JOBS));
    });
});

describe("choosing the map", () => {
    it("takes the first enabled map when none is named", () => {
        const chosen = chooseProjectMap(
            project([map({ id: "nether", enabled: false }), map({ id: "overworld" })]),
        );
        expect(chosen.ok && chosen.map.id).toBe("overworld");
    });

    it("refuses a project with nothing enabled", () => {
        const chosen = chooseProjectMap(project([map({ enabled: false })]));
        expect(chosen.ok).toBe(false);
        expect(!chosen.ok && chosen.failure.code).toBe("no-maps");
    });

    /*
     * Two enabled maps and neither is what was asked for, so there is genuinely nothing to
     * resolve to. That is the case this refusal is for.
     *
     * It used to use a single-map project, which now resolves instead: with exactly one enabled
     * map there is no other thing the request could have meant. The refusal has not been
     * weakened, its fixture has been made ambiguous, which is what it was always describing.
     */
    it("names what the project does have when the map asked for is not there", () => {
        const chosen = chooseProjectMap(
            project([map({ id: "overworld" }), map({ id: "second", dimension: "minecraft:the_end" })]),
            "nether",
        );
        expect(chosen.ok).toBe(false);
        expect(!chosen.ok && chosen.failure.message).toContain("overworld");
    });

    /*
     * The reported failure, exactly: "Underground-BUNKER has no enabled map called overworld. It
     * has: world." Nothing was wrong with that project. `overworld` is a dimension, the cloud
     * defaults pass it as a map id, and so every project whose map is named anything but its
     * dimension could not start a cloud render.
     */
    it("resolves a dimension name handed over as a map id", () => {
        const chosen = chooseProjectMap(
            project([map({ id: "world", dimension: "minecraft:overworld" })]),
            "overworld",
        );
        expect(chosen.ok).toBe(true);
        expect(chosen.ok && chosen.map.id).toBe("world");
        // Reported, never silent: a caller must be able to say which map it really rendered.
        expect(chosen.ok && chosen.resolvedFrom).toBe("overworld");
    });

    it("resolves to the only enabled map when the id matches nothing else", () => {
        const chosen = chooseProjectMap(project([map({ id: "world" })]), "some-old-name");
        expect(chosen.ok).toBe(true);
        expect(chosen.ok && chosen.map.id).toBe("world");
        expect(chosen.ok && chosen.resolvedFrom).toBe("some-old-name");
    });

    /*
     * Ambiguity refuses rather than picking. Two maps of the requested dimension means guessing,
     * and guessing here hands somebody a different world after a cloud render they waited for.
     */
    it("refuses rather than choosing between two maps of the requested dimension", () => {
        const chosen = chooseProjectMap(
            project([
                map({ id: "a", dimension: "minecraft:overworld" }),
                map({ id: "b", dimension: "minecraft:overworld" }),
            ]),
            "overworld",
        );
        expect(chosen.ok).toBe(false);
    });

    /** An exact id still wins, and still carries no `resolvedFrom`, because nothing was resolved. */
    it("prefers an exact map id over any resolution", () => {
        const chosen = chooseProjectMap(
            project([map({ id: "overworld", dimension: "minecraft:the_end" }), map({ id: "world" })]),
            "overworld",
        );
        expect(chosen.ok).toBe(true);
        expect(chosen.ok && chosen.map.id).toBe("overworld");
        expect(chosen.ok && chosen.resolvedFrom).toBeUndefined();
    });

    it("refuses a dimension the workflow's choice input does not offer", () => {
        const chosen = chooseProjectMap(project([map({ dimension: "mystcraft:age_12" })]));
        expect(chosen.ok).toBe(false);
        if (chosen.ok) return;
        expect(chosen.failure.code).toBe("unsupported-dimension");
        expect(chosen.failure.message).toContain("minecraft:the_nether");
    });

    it("accepts all three dimensions the workflow does offer", () => {
        for (const dimension of [
            "minecraft:overworld",
            "minecraft:the_nether",
            "minecraft:the_end",
        ]) {
            expect(chooseProjectMap(project([map({ dimension })])).ok, dimension).toBe(true);
        }
    });
});

describe("the complete configuration transport contract", () => {
    it("routes every map setting through the project inside the uploaded world archive", () => {
        const result = planCiRender({
            project: project([
                map({
                    config: 'ambient-light: 0.1\nrender-mask: [{ type: "bluemap:ellipse", radius-x: 80, radius-z: 30 }]',
                }),
            ]),
            releaseTag: "world-1",
            assetName: "world.zip",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.configuration).toEqual({
            route: "project-archive",
            complete: true,
            file: PROJECT_FILE_NAME,
        });
        expect(result.plan.notCarried).toEqual([]);
    });
});

describe("reading the project off a world", () => {
    let workDir = "";

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), "mbm-plan-"));
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it("points at the wizard when a world has never been set up", async () => {
        const result = await readProjectAt(workDir);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-project");
        expect(result.failure.message).toContain(PROJECT_FILE_NAME);
    });

    it("says a project is from a newer app rather than failing at its schema", async () => {
        await writeFile(join(workDir, PROJECT_FILE_NAME), JSON.stringify({ version: 99 }), "utf8");
        const result = await readProjectAt(workDir);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("unreadable-project");
        expect(result.failure.message).toContain("newer version");
    });

    it("reads a real one", async () => {
        await writeFile(
            join(workDir, PROJECT_FILE_NAME),
            JSON.stringify(project([map()]), null, 4),
            "utf8",
        );
        const result = await readProjectAt(workDir);
        expect(result.ok).toBe(true);
        expect(result.ok && result.project.maps[0]?.id).toBe("world");
    });

    it("reads the legacy project filename when the Worldlens filename is absent", async () => {
        await writeFile(
            join(workDir, LEGACY_PROJECT_FILE_NAME),
            JSON.stringify(project([map({ id: "legacy" })]), null, 4),
            "utf8",
        );
        const result = await readProjectAt(workDir);
        expect(result.ok).toBe(true);
        expect(result.ok && result.project.maps[0]?.id).toBe("legacy");
    });
});
