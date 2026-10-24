import { copyFile, mkdir, writeFile, lstat } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, isAbsolute, join } from "node:path";
import { safeDatapackPath } from "../generation/capabilities.js";
import type { GenerationConfigChanges } from "../generation/capabilities.js";
import { parseJson } from "../config/parseJson.js";
import { readLevelDat } from "../../world/levelDat.js";
import { measureGeneratedWorld } from "./measure.js";

export interface VanillaGenerationRequest {
    readonly javaPath: string;
    readonly jarPath: string;
    readonly serverDir: string;
    readonly worldName: string;
    readonly memoryMb: number;
    readonly acceptedEula: boolean;
    readonly pregenerationRadius: number;
    readonly chunkyPluginJar?: string;
    /** Explicit compatible server adapter; vanilla cannot load Bukkit plugins. */
    readonly pregenerationAdapter?: "chunky-bukkit";
    readonly flavour?: string;
    readonly outputDestination: string;
    readonly outputMode: "folder" | "zip";
    readonly serverProperties: Readonly<Record<string, string>>;
    readonly datapackFiles?: readonly { readonly path: string; readonly content: string }[];
    readonly postStartupCommands?: readonly string[];
    readonly configurationChanges?: readonly GenerationConfigChanges[];
}
export interface VanillaGenerationProgress {
    readonly phase:
        | "server-startup"
        | "world-generation"
        | "chunky-pregen"
        | "saving"
        | "inspection"
        | "packaging";
    readonly message: string;
}
export interface VanillaGenerationDeps {
    readonly spawnProcess?: typeof spawn;
    readonly zipWorld?: (worldFolder: string, zipPath: string) => Promise<void>;
    readonly measureWorld?: typeof measureGeneratedWorld;
    readonly readLevel?: typeof readLevelDat;
    /** Must resolve only after the existing console service verifies every command result. */
    readonly executeCommands?: (
        commands: readonly string[],
        child: ChildProcess,
        options: { readonly isCancelled?: () => boolean },
    ) => Promise<void>;
    readonly applyConfiguration?: (changes: readonly GenerationConfigChanges[]) => Promise<void>;
    readonly timeoutMs?: number;
    /** Retained for source compatibility. Worlds are always retained on failure. */
    readonly removeDirectory?: (path: string) => Promise<void>;
}
export type VanillaGenerationOutcome =
    | {
          readonly ok: true;
          readonly value: {
              readonly worldFolder: string;
              readonly zipPath: string | null;
              readonly chunkCount: number;
              readonly bytes: number;
              readonly seed: string | null;
              readonly requestedSeed: string;
          };
      }
    | { readonly ok: false; readonly code: "cancelled" | "failed"; readonly message: string };

/** Java properties escapes preserve exact seed text across legacy byte-based loaders. */
export function escapeGenerationProperty(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/ /g, "\\ ")
        .replace(
            /[^\x20-\x7e]/g,
            (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
        );
}

export async function runVanillaGeneration(
    request: VanillaGenerationRequest,
    options: {
        readonly onProgress?: (progress: VanillaGenerationProgress) => void;
        readonly isCancelled?: () => boolean;
    } = {},
    deps: VanillaGenerationDeps = {},
): Promise<VanillaGenerationOutcome> {
    let child: ChildProcess | undefined;

    const worldFolder = join(request.serverDir, request.worldName);
    const emit = (phase: VanillaGenerationProgress["phase"], message: string) =>
        options.onProgress?.({ phase, message });
    let output = "";
    let exited = false;
    let exitCode: number | null = null;
    let processError: Error | undefined;
    const wait = async (predicate: () => boolean, label: string): Promise<void> => {
        const deadline = Date.now() + (deps.timeoutMs ?? 30 * 60_000);
        while (!predicate()) {
            if (options.isCancelled?.()) throw new Error("cancelled");
            if (processError) throw processError;
            if (exited) throw new Error(`Server exited before ${label} (exit ${exitCode}).`);
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    };
    try {
        if (request.acceptedEula !== true)
            throw new Error("Explicit Minecraft EULA acceptance is required.");
        if (!isAbsolute(request.serverDir) || !/^[a-zA-Z0-9_-]{1,128}$/.test(request.worldName))
            throw new Error("An absolute owned server folder and simple world name are required.");
        if (!Number.isSafeInteger(request.memoryMb) || request.memoryMb < 512)
            throw new Error("Invalid server memory limit.");
        if (!Number.isFinite(request.pregenerationRadius) || request.pregenerationRadius < 0)
            throw new Error("Invalid pregeneration radius.");
        if (
            request.pregenerationRadius > 0 &&
            (request.pregenerationAdapter !== "chunky-bukkit" ||
                !["paper", "purpur", "spigot"].includes(request.flavour ?? "") ||
                !request.chunkyPluginJar)
        )
            throw new Error(
                "Pregeneration requires an explicitly selected compatible Chunky Bukkit adapter and plugin. Vanilla generation supports spawn generation only.",
            );
        try {
            await lstat(worldFolder);
            throw new Error("The world destination already exists.");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (options.isCancelled?.()) throw new Error("cancelled");
        const properties: Record<string, string> = {
            ...request.serverProperties,
            "level-name": request.worldName,
        };
        if (request.postStartupCommands?.length && !deps.executeCommands)
            throw new Error("Verified post-start command execution is unavailable.");
        if (request.configurationChanges?.length && !deps.applyConfiguration)
            throw new Error("Revision-checked configuration application is unavailable.");
        let datapackBytes = 0;
        for (const file of request.datapackFiles ?? []) {
            datapackBytes += Buffer.byteLength(file.content, "utf8");
            if (
                !safeDatapackPath(file.path) ||
                !parseJson(file.content).ok ||
                datapackBytes > 16 * 1024 * 1024
            )
                throw new Error("Invalid or oversized datapack inputs.");
        }
        for (const [key, value] of Object.entries(properties))
            if (/[\r\n=:\\]/.test(key) || /[\r\n]/.test(value))
                throw new Error("Properties must contain one key/value per line.");
        await mkdir(request.serverDir, { recursive: true });
        if (request.configurationChanges?.length)
            await deps.applyConfiguration!(request.configurationChanges);
        await writeFile(
            join(request.serverDir, "server.properties"),
            Object.entries(properties)
                .map(([key, value]) => `${key}=${escapeGenerationProperty(value)}`)
                .join("\n") + "\n",
            "utf8",
        );
        await writeFile(join(request.serverDir, "eula.txt"), "eula=true\n", "utf8");
        for (const file of request.datapackFiles ?? []) {
            const destination = join(worldFolder, "datapacks", ...file.path.split("/"));
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, file.content, { encoding: "utf8", flag: "wx" });
        }
        if (request.pregenerationRadius > 0 && request.chunkyPluginJar) {
            await mkdir(join(request.serverDir, "plugins"), { recursive: true });
            await copyFile(
                request.chunkyPluginJar,
                join(request.serverDir, "plugins", "Chunky.jar"),
            );
        }
        emit("server-startup", "Starting the selected server.");
        child = (deps.spawnProcess ?? spawn)(
            request.javaPath,
            [
                `-Xmx${request.memoryMb}M`,
                `-Xms${Math.min(request.memoryMb, 1024)}M`,
                "-jar",
                request.jarPath,
                "nogui",
            ],
            { cwd: request.serverDir, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
        );
        const onData = (data: Buffer) => {
            output = (output + data.toString("utf8")).slice(-131072);
        };
        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);
        child.once("error", (error) => {
            processError = error;
        });
        child.stdin?.on("error", (error) => {
            processError = error;
        });
        child.once("exit", (code) => {
            exited = true;
            exitCode = code;
        });
        await wait(() => /Done \([^\r\n]*\)!/.test(output), "server readiness");
        emit("world-generation", "Server is ready; spawn generation completed.");
        if (request.postStartupCommands?.length)
            await deps.executeCommands!(
                request.postStartupCommands,
                child,
                options.isCancelled ? { isCancelled: options.isCancelled } : {},
            );
        if (request.pregenerationRadius > 0) {
            output = "";
            emit("chunky-pregen", "Running the selected Chunky task.");
            child.stdin?.write(
                `chunky world ${request.worldName}\nchunky radius ${request.pregenerationRadius}\nchunky start\n`,
            );
            await wait(
                () => /Task finished|Generation task complete/i.test(output),
                "pregeneration completion",
            );
        }
        emit("saving", "Saving the world and waiting for a successful server exit.");
        child.stdin?.write("stop\n");
        await wait(() => exited, "saved server exit");
        if (exitCode !== 0) throw new Error(`Server stopped with exit ${exitCode}.`);
        emit("inspection", "Reading the saved world and allocated chunks.");
        const measured = await (deps.measureWorld ?? measureGeneratedWorld)(worldFolder);
        const level = await (deps.readLevel ?? readLevelDat)(join(worldFolder, "level.dat"));
        const requestedSeed = properties["level-seed"] ?? "";
        // Java long seeds must survive without a Number round-trip. Zero and blank request randomness.
        if (/^[+-]?[0-9]+$/.test(requestedSeed)) {
            const numericSeed = BigInt(requestedSeed);
            if (
                numericSeed !== 0n &&
                numericSeed >= -(1n << 63n) &&
                numericSeed < 1n << 63n &&
                level.seed !== numericSeed.toString()
            )
                throw new Error("Saved world seed does not match the requested Java long seed.");
        }
        if (options.isCancelled?.()) throw new Error("cancelled");
        if (request.outputMode === "zip") {
            emit("packaging", "Packaging the saved world.");
            if (!deps.zipWorld) throw new Error("Zip packaging is unavailable.");
            await deps.zipWorld(worldFolder, request.outputDestination);
        }
        return {
            ok: true,
            value: {
                worldFolder,
                zipPath: request.outputMode === "zip" ? request.outputDestination : null,
                ...measured,
                seed: level.seed,
                requestedSeed,
            },
        };
    } catch (error) {
        if (child && !exited) {
            child.stdin?.write("stop\n");
            const deadline = Date.now() + 15000;
            while (!exited && Date.now() < deadline)
                await new Promise((resolve) => setTimeout(resolve, 25));
            if (!exited) child.kill();
        }
        const message = error instanceof Error ? error.message : String(error);
        return {
            ok: false,
            code: message === "cancelled" ? "cancelled" : "failed",
            message: `${message} Generated files were retained for recovery.`,
        };
    }
}
