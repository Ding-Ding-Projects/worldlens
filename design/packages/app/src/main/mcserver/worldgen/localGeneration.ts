/**
 * The local runner, actually wired: this is the one path where pressing Generate produces
 * a world instead of a plan.
 *
 * It drives `@worldlens/worldgen` - this repository's own Anvil writer, already used by
 * `structures/buildStructureWorld.ts` and by CI's reference fixtures - rather than
 * launching a server jar. That choice is what makes it real today, and it is also exactly
 * what makes it limited: the terrain is this app's value-noise generation, not Mojang's,
 * so the settings describing Minecraft's own generator (world type, structures, biome,
 * extra dimensions, gamerules, version) have no effect here. The renderer states that at
 * the point of generation; see `worldGenEngine.ts`'s `SYNTHETIC_TERRAIN_NOTICE` and
 * `ignoredSettingsFor`. Nothing in this module is allowed to imply otherwise.
 *
 * Everything with an outside effect is injected, so the whole state machine - progress,
 * cancellation, zip-vs-folder, cleanup after a failure - is exercised in unit tests
 * without writing a world to disk.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";

export interface LocalGenerationRequest {
    /** Resolved numeric seed. The caller rolls a random one; this module never invents it. */
    readonly seed: number;
    /** Square edge length in blocks, from `syntheticWorldSize(pregenerationRadius)`. */
    readonly size: number;
    /** Folder name for the world, and its `LevelName`. */
    readonly worldName: string;
    readonly outputMode: "folder" | "zip";
    /**
     * For `"folder"`, the directory the world folder is created inside. For `"zip"`, the
     * path of the archive to write.
     */
    readonly destination: string;
}

export interface GenerationProgress {
    readonly phase: "generating" | "packaging";
    readonly chunksDone: number;
    readonly chunksTotal: number;
}

/** A generated world, described in the few facts a caller reports back to the user. */
export interface LocalGenerationSuccess {
    readonly worldFolder: string;
    /** Set only for `outputMode: "zip"`. */
    readonly zipPath: string | null;
    readonly chunkCount: number;
    readonly bytes: number;
    readonly seed: number;
}

export type LocalGenerationOutcome =
    | { readonly ok: true; readonly value: LocalGenerationSuccess }
    | { readonly ok: false; readonly code: "cancelled" | "failed"; readonly message: string };

/** The two `@worldlens/worldgen` entry points this module uses, injectable for tests. */
export interface GenerationDeps {
    readonly generateWorld: (options: {
        seed: number;
        size: number;
        outDir: string;
        name?: string;
        onProgress?: (chunksDone: number, chunksTotal: number) => void;
    }) => Promise<{ worldFolder: string; chunkCount: number; bytes: number; seed: number }>;
    readonly zipWorld: (world: { worldFolder: string; chunkCount: number; bytes: number; seed: number }, zipPath: string) => Promise<number>;
    /** Removes a partial world folder after a cancel or failure. */
    readonly removeDirectory?: (path: string) => Promise<void>;
    /** Where a zip's world folder is staged before being packed. Defaults beside the zip. */
    readonly stagingDirFor?: (zipPath: string) => string;
}

/** Raised inside `onProgress` to stop generation; never escapes this module. */
class GenerationCancelled extends Error {
    constructor() {
        super("cancelled");
        this.name = "GenerationCancelled";
    }
}

/**
 * Runs one generation to completion, cancellation, or failure.
 *
 * Cancellation is checked on every chunk boundary, which is the only place this module
 * gets control back during a long run. A cancelled or failed run deletes the partial
 * world folder it created: a half-written world that loads and is quietly missing its
 * far half is worse than no world, because nothing about it looks wrong until somebody
 * walks to the edge.
 */
export async function runLocalSyntheticGeneration(
    request: LocalGenerationRequest,
    deps: GenerationDeps,
    options: {
        readonly onProgress?: (progress: GenerationProgress) => void;
        readonly isCancelled?: () => boolean;
    } = {},
): Promise<LocalGenerationOutcome> {
    const removeDirectory = deps.removeDirectory ?? ((path: string) => rm(path, { recursive: true, force: true }));
    const stagingDirFor = deps.stagingDirFor ?? ((zipPath: string) => join(zipPath, "..", ".worldlens-staging"));

    const zipPath = request.outputMode === "zip" ? request.destination : null;
    const outDir = zipPath === null ? request.destination : stagingDirFor(zipPath);

    // Computed before the call, not read back from it: `generateWorld` names the folder
    // `join(outDir, name)`, and a run cancelled mid-chunk throws instead of returning, so a
    // cleanup that waited for the return value would leave every cancelled world on disk.
    const plannedWorldFolder = join(outDir, request.worldName);

    try {
        const world = await deps.generateWorld({
            seed: request.seed,
            size: request.size,
            outDir,
            name: request.worldName,
            onProgress: (chunksDone, chunksTotal) => {
                if (options.isCancelled?.() === true) throw new GenerationCancelled();
                options.onProgress?.({ phase: "generating", chunksDone, chunksTotal });
            },
        });
        if (options.isCancelled?.() === true) throw new GenerationCancelled();

        if (zipPath !== null) {
            options.onProgress?.({ phase: "packaging", chunksDone: world.chunkCount, chunksTotal: world.chunkCount });
            await deps.zipWorld(world, zipPath);
            // The staged folder has served its purpose; the archive is the deliverable.
            await removeDirectory(world.worldFolder);
        }

        return {
            ok: true,
            value: {
                worldFolder: world.worldFolder,
                zipPath,
                chunkCount: world.chunkCount,
                bytes: world.bytes,
                seed: world.seed,
            },
        };
    } catch (error) {
        // Best effort: a cleanup that itself fails must not replace the real reason.
        await removeDirectory(plannedWorldFolder).catch(() => undefined);
        if (error instanceof GenerationCancelled) {
            return { ok: false, code: "cancelled", message: "Generation was cancelled; the partial world was removed." };
        }
        return { ok: false, code: "failed", message: error instanceof Error ? error.message : String(error) };
    }
}
