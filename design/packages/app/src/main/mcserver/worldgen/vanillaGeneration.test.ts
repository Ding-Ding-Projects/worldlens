import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { spawn } from "node:child_process";
import { runVanillaGeneration, type VanillaGenerationRequest } from "./vanillaGeneration.js";

async function fixture(test: (root: string) => Promise<void>) {
    const root = await mkdtemp(join(tmpdir(), "worldlens-generation-"));
    try {
        await test(root);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}
function request(root: string): VanillaGenerationRequest {
    return {
        javaPath: "java",
        jarPath: "server.jar",
        serverDir: root,
        worldName: "world",
        memoryMb: 1024,
        acceptedEula: true,
        pregenerationRadius: 0,
        outputDestination: root,
        outputMode: "folder",
        serverProperties: { "level-seed": "9223372036854775807" },
    };
}
function processFake(lines: string[], commands: string[]) {
    const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        stdin: {
            write: (line: string) => void;
            on: (name: string, listener: (error: Error) => void) => void;
        };
        kill: () => boolean;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = {
        on: () => {},
        write: (line) => {
            commands.push(line);
            if (line === "stop\n") setTimeout(() => child.emit("exit", 0), 1);
        },
    };
    child.kill = () => {
        child.emit("exit", 1);
        return true;
    };
    return (() => {
        setTimeout(() => lines.forEach((line) => child.stdout.write(line)), 1);
        return child;
    }) as unknown as typeof spawn;
}
describe("real server generation lifecycle", () => {
    it("waits for Done, saves and measures actual chunks without Chunky on vanilla", async () =>
        fixture(async (root) => {
            const commands: string[] = [];
            const phases: string[] = [];
            const result = await runVanillaGeneration(
                {
                    ...request(root),
                    datapackFiles: [
                        {
                            path: "terrain/pack.mcmeta",
                            content: '{"pack":{"description":"Terrain","pack_format":61}}',
                        },
                    ],
                },
                { onProgress: (p) => phases.push(p.phase) },
                {
                    spawnProcess: processFake(
                        ["Preparing spawn area\n", 'Done (2.0s)! For help, type "help"\n'],
                        commands,
                    ),
                    measureWorld: async () => ({ chunkCount: 9, bytes: 8192 }),
                    readLevel: async () => ({
                        levelName: null,
                        lastPlayed: null,
                        versionName: null,
                        snapshot: null,
                        dataVersion: null,
                        gameMode: null,
                        hardcore: null,
                        cheats: null,
                        seed: "9223372036854775807",
                        spawnX: null,
                        spawnZ: null,
                    }),
                    timeoutMs: 100,
                },
            );
            expect(result.ok).toBe(true);
            expect(commands).toEqual(["stop\n"]);
            expect(phases).toContain("inspection");
            expect(await readFile(join(root, "server.properties"), "utf8")).toContain(
                "level-seed=9223372036854775807",
            );
            expect(result.ok && result.value.chunkCount).toBe(9);
            expect(
                JSON.parse(
                    await readFile(
                        join(root, "world", "datapacks", "terrain", "pack.mcmeta"),
                        "utf8",
                    ),
                ).pack.pack_format,
            ).toBe(61);
        }));
    it("does not treat spawn preparation as readiness", async () =>
        fixture(async (root) => {
            const result = await runVanillaGeneration(
                request(root),
                {},
                { spawnProcess: processFake(["Preparing spawn area\n"], []), timeoutMs: 30 },
            );
            expect(result.ok).toBe(false);
            expect(!result.ok && result.message).toContain("server readiness");
        }));
    it("rejects unsupported pregeneration before writing or launching", async () =>
        fixture(async (root) => {
            const result = await runVanillaGeneration({
                ...request(root),
                pregenerationRadius: 100,
            });
            expect(!result.ok && result.message).toContain(
                "Vanilla generation supports spawn generation only",
            );
        }));
    it("retains existing world data and rejects path traversal", async () =>
        fixture(async (root) => {
            const result = await runVanillaGeneration({
                ...request(root),
                worldName: "../outside",
            });
            expect(!result.ok && result.message).toContain("simple world name");
        }));
    it("refuses commands without a verified execution consumer before launch", async () =>
        fixture(async (root) => {
            const result = await runVanillaGeneration({
                ...request(root),
                postStartupCommands: ["gamerule doDaylightCycle false"],
            });
            expect(!result.ok && result.message).toContain(
                "Verified post-start command execution is unavailable",
            );
        }));
    it("rejects escaping datapack files before launch", async () =>
        fixture(async (root) => {
            const result = await runVanillaGeneration({
                ...request(root),
                datapackFiles: [{ path: "../outside.json", content: "{}" }],
            });
            expect(!result.ok && result.message).toContain("Invalid or oversized datapack inputs");
        }));
});

describe("saved seed verification", () => {
    it("rejects a rounded Java long seed after successful shutdown", async () =>
        fixture(async (root) => {
            const result = await runVanillaGeneration(
                request(root),
                {},
                {
                    spawnProcess: processFake(["Done (1s)!\n"], []),
                    measureWorld: async () => ({ chunkCount: 1, bytes: 8192 }),
                    readLevel: async () => ({
                        levelName: null,
                        lastPlayed: null,
                        versionName: null,
                        snapshot: null,
                        dataVersion: null,
                        gameMode: null,
                        hardcore: null,
                        cheats: null,
                        seed: "9223372036854775806",
                        spawnX: null,
                        spawnZ: null,
                    }),
                    timeoutMs: 100,
                },
            );
            expect(result.ok).toBe(false);
            expect(!result.ok && result.message).toContain("Saved world seed does not match");
            expect(!result.ok && result.message).toContain("retained for recovery");
        }));
});
