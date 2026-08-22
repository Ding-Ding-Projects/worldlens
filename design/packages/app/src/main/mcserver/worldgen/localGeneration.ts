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

import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
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

export interface VanillaGenerationRequest {
    readonly javaPath: string;
    readonly jarPath: string;
    readonly serverDir: string;
    readonly worldName: string;
    readonly memoryMb: number;
    /** Explicit user consent; generation never accepts the EULA implicitly. */
    readonly acceptedEula: boolean;
    readonly pregenerationRadius: number;
    readonly chunkyPluginJar?: string;
    readonly outputDestination: string;
    readonly outputMode: "folder" | "zip";
    readonly serverProperties: Readonly<Record<string, string>>;
}

export interface VanillaGenerationProgress {
    readonly phase: "server-startup" | "world-generation" | "chunky-pregen" | "packaging";
    readonly message: string;
}

export interface VanillaGenerationDeps {
    readonly spawnProcess?: typeof spawn;
    readonly zipWorld?: (worldFolder: string, zipPath: string) => Promise<void>;
    readonly removeDirectory?: (path: string) => Promise<void>;
}

/** Run the downloaded vanilla jar once, then drive Chunky through the server console. */
export async function runVanillaGeneration(
    request: VanillaGenerationRequest,
    options: { readonly onProgress?: (progress: VanillaGenerationProgress) => void; readonly isCancelled?: () => boolean } = {},
    deps: VanillaGenerationDeps = {},
): Promise<LocalGenerationOutcome> {
    const spawnProcess = deps.spawnProcess ?? spawn;
    const removeDirectory = deps.removeDirectory ?? ((path: string) => rm(path, { recursive: true, force: true }));
    const worldFolder = join(request.serverDir, request.worldName);
    let child: ChildProcess | null = null;
    const emit = (phase: VanillaGenerationProgress["phase"], message: string) => options.onProgress?.({ phase, message });
    const waitFor = (needle: RegExp, phase: VanillaGenerationProgress["phase"], timeoutMs = 30 * 60_000): Promise<void> =>
        new Promise((resolve, reject) => {
            if (child === null) return reject(new Error("The Minecraft server did not start."));
            let buffer = "";
            const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for server output matching ${needle.source}.`)); }, timeoutMs);
            const onData = (data: Buffer) => { buffer += data.toString("utf8"); emit(phase, buffer.split(/\r?\n/).at(-2) ?? ""); if (needle.test(buffer)) { cleanup(); resolve(); } };
            const onExit = () => { cleanup(); reject(new Error("The Minecraft server exited before the requested stage completed.")); };
            const cleanup = () => { clearTimeout(timer); child?.stdout?.off("data", onData); child?.stderr?.off("data", onData); child?.off("exit", onExit); };
            child.stdout?.on("data", onData); child.stderr?.on("data", onData); child.once("exit", onExit);
        });
    try {
        if (request.acceptedEula !== true) return { ok: false, code: "failed", message: "The Minecraft EULA must be accepted before real generation can start." };
        if (options.isCancelled?.()) throw new Error("cancelled");
        await mkdir(request.serverDir, { recursive: true });
        const properties = Object.entries(request.serverProperties).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
        await writeFile(join(request.serverDir, "server.properties"), properties, "utf8");
        await writeFile(join(request.serverDir, "eula.txt"), "# Accepted through WorldLens\neula=true\n", "utf8");
        if (request.chunkyPluginJar !== undefined) {
            await mkdir(join(request.serverDir, "plugins"), { recursive: true });
            await copyFile(request.chunkyPluginJar, join(request.serverDir, "plugins", "Chunky.jar"));
        }
        emit("server-startup", "Launching the vanilla server and waiting for its world to load…");
        child = spawnProcess(request.javaPath, [`-Xmx${request.memoryMb}M`, `-Xms${Math.min(request.memoryMb, 1024)}M`, "-jar", request.jarPath, "nogui"], { cwd: request.serverDir, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        await waitFor(/Done \([^\n]*\)!|For help, type|Preparing spawn area/, "world-generation");
        emit("chunky-pregen", `Running Chunky pre-generation for ${request.pregenerationRadius} blocks…`);
        child.stdin?.write(`chunky world ${request.worldName}\n`);
        child.stdin?.write(`chunky radius ${Math.max(1, Math.ceil(request.pregenerationRadius / 16))}\n`);
        child.stdin?.write("chunky start\n");
        await waitFor(/Task finished|Generation task complete|Starting world generation/, "chunky-pregen");
        child.stdin?.write("stop\n");
        await new Promise<void>((resolve) => child?.once("exit", () => resolve()));
        if (request.outputMode === "zip") {
            emit("packaging", "Packaging the generated world…");
            if (deps.zipWorld === undefined) throw new Error("Zip packaging is not available for vanilla generation.");
            await deps.zipWorld(worldFolder, request.outputDestination);
            await removeDirectory(worldFolder);
        }
        return { ok: true, value: { worldFolder, zipPath: request.outputMode === "zip" ? request.outputDestination : null, chunkCount: 0, bytes: 0, seed: 0 } };
    } catch (error) {
        child?.kill();
        await removeDirectory(worldFolder).catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, code: message === "cancelled" ? "cancelled" : "failed", message };
    }
}

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
