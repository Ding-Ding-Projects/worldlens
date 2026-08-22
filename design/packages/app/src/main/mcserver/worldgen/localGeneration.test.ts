import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runLocalSyntheticGeneration, type GenerationDeps, type GenerationProgress } from "./localGeneration.js";

const REQUEST = {
    seed: 1234,
    size: 256,
    worldName: "generated-world",
    outputMode: "folder" as const,
    destination: "/out",
};

function fakeDeps(overrides: Partial<GenerationDeps> = {}): GenerationDeps & { removed: string[]; zipped: string[] } {
    const removed: string[] = [];
    const zipped: string[] = [];
    return {
        removed,
        zipped,
        generateWorld: async (options) => {
            options.onProgress?.(1, 4);
            options.onProgress?.(4, 4);
            return { worldFolder: `${options.outDir}/${options.name}`, chunkCount: 4, bytes: 4096, seed: options.seed };
        },
        zipWorld: async (_world, zipPath) => {
            zipped.push(zipPath);
            return 2048;
        },
        removeDirectory: async (path) => {
            removed.push(path);
        },
        ...overrides,
    };
}

describe("runLocalSyntheticGeneration", () => {
    it("writes a world folder and reports where it landed", async () => {
        const deps = fakeDeps();
        const outcome = await runLocalSyntheticGeneration(REQUEST, deps);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.value.worldFolder).toBe("/out/generated-world");
        expect(outcome.value.zipPath).toBeNull();
        expect(outcome.value.chunkCount).toBe(4);
        expect(deps.removed).toEqual([]);
    });

    it("reports real per-chunk progress rather than a bare spinner", async () => {
        const seen: GenerationProgress[] = [];
        await runLocalSyntheticGeneration(REQUEST, fakeDeps(), { onProgress: (p) => seen.push(p) });
        expect(seen).toEqual([
            { phase: "generating", chunksDone: 1, chunksTotal: 4 },
            { phase: "generating", chunksDone: 4, chunksTotal: 4 },
        ]);
    });

    it("zips into the chosen archive and clears the staging folder afterwards", async () => {
        const deps = fakeDeps();
        const outcome = await runLocalSyntheticGeneration(
            { ...REQUEST, outputMode: "zip", destination: "/out/world.zip" },
            { ...deps, stagingDirFor: () => "/staging" },
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.value.zipPath).toBe("/out/world.zip");
        expect(deps.zipped).toEqual(["/out/world.zip"]);
        expect(deps.removed).toEqual(["/staging/generated-world"]);
    });

    it("emits a packaging phase before zipping, so the last stage is not silent", async () => {
        const seen: GenerationProgress[] = [];
        await runLocalSyntheticGeneration(
            { ...REQUEST, outputMode: "zip", destination: "/out/world.zip" },
            { ...fakeDeps(), stagingDirFor: () => "/staging" },
            { onProgress: (p) => seen.push(p) },
        );
        expect(seen.at(-1)).toEqual({ phase: "packaging", chunksDone: 4, chunksTotal: 4 });
    });

    it("stops on cancellation at a chunk boundary and deletes the partial world", async () => {
        const deps = fakeDeps({
            generateWorld: async (options) => {
                options.onProgress?.(1, 100);
                options.onProgress?.(2, 100);
                return { worldFolder: `${options.outDir}/${options.name}`, chunkCount: 100, bytes: 1, seed: options.seed };
            },
        });
        let calls = 0;
        const outcome = await runLocalSyntheticGeneration(REQUEST, deps, {
            isCancelled: () => {
                calls += 1;
                return calls > 1;
            },
        });
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.code).toBe("cancelled");
        expect(outcome.message).toMatch(/partial world was removed/);
        // The claim in that message must be true: assert the folder was actually deleted,
        // not merely that the sentence says so. A cancelled run throws out of
        // `generateWorld`, so this only passes if cleanup uses the path computed up front.
        expect(deps.removed).toEqual([join("/out", "generated-world")]);
    });

    it("reports a failure with the real reason and does not claim success", async () => {
        const deps = fakeDeps({
            generateWorld: async () => {
                throw new Error("disk full");
            },
        });
        const outcome = await runLocalSyntheticGeneration(REQUEST, deps);
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.code).toBe("failed");
        expect(outcome.message).toBe("disk full");
        expect(deps.removed).toEqual([join("/out", "generated-world")]);
    });

    it("keeps the original failure when the cleanup itself also fails", async () => {
        const deps = fakeDeps({
            generateWorld: async (options) => {
                options.onProgress?.(1, 2);
                return { worldFolder: `${options.outDir}/${options.name}`, chunkCount: 2, bytes: 1, seed: options.seed };
            },
            zipWorld: async () => {
                throw new Error("archive refused");
            },
            removeDirectory: async () => {
                throw new Error("cleanup also broke");
            },
        });
        const outcome = await runLocalSyntheticGeneration(
            { ...REQUEST, outputMode: "zip", destination: "/out/world.zip" },
            deps,
        );
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.message).toBe("archive refused");
    });
});
