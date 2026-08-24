import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createHostProfileStore } from "./hostProfiles.js";
import { MCSERVER_CHANNELS, registerMcServerHandlers } from "./ipc.js";
import type { IpcMainLike } from "./ipc.js";
import type { CommandOutput, CommandRunner } from "../runtime/command.js";
import type { SafeStorageLike } from "./rcon/secret.js";

function safeStorage(): SafeStorageLike {
    return {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString(),
    };
}

function output(stdout = ""): CommandOutput {
    return { ok: true, exitCode: 0, stdout, stderr: "", spawnError: null };
}

function ipc(): IpcMainLike & { handlers: Map<string, (...args: never[]) => Promise<unknown>> } {
    const handlers = new Map<string, (...args: never[]) => Promise<unknown>>();
    return {
        handlers,
        handle(channel, handler) { handlers.set(channel, handler as (...args: never[]) => Promise<unknown>); },
        removeHandler(channel) { handlers.delete(channel); },
    };
}

describe("remote profile adoption", () => {
    it("discovers and records an existing remote container as ssh-docker", async () => {
        const dataDir = await mkdtemp(join(tmpdir(), "wl-ssh-adopt-"));
        try {
            const hostProfiles = createHostProfileStore({ dataFolder: dataDir, knownHostsFile: join(dataDir, "known_hosts") });
            await hostProfiles.save({
                hostId: "fowshan",
                target: { host: "fowshan", user: "docker", port: 22, workDir: "/home/docker/WorldLens", identityFile: null },
            });
            const runner: CommandRunner = async (_command, args) => {
                const remote = String(args.at(-1));
                if (remote.includes("ps")) return output(JSON.stringify({ ID: "abc123", Names: "heapandyville-minecraft", Image: "heapandyville-minecraft:26.1.2-72", State: "running" }));
                if (remote.includes("inspect")) return output(JSON.stringify([{
                    Id: "abc123",
                    Name: "/heapandyville-minecraft",
                    Created: "2026-08-24T00:00:00Z",
                    Config: { Image: "heapandyville-minecraft:26.1.2-72", Env: ["TYPE=paper", "VERSION=1.21.8", "EULA=TRUE"], Labels: {} },
                    State: { Status: "running" },
                    Mounts: [{ Source: "/home/docker/HeapAndyville/server-data", Destination: "/data" }],
                    NetworkSettings: { Ports: { "25565/tcp": [{ HostPort: "25565" }] } },
                }]));
                if (remote.includes("logs")) return output("[12:00:00 INFO]: Starting Minecraft server version 1.21.8");
                return output();
            };
            const targetIpc = ipc();
            const registered = registerMcServerHandlers(targetIpc, {
                dataFolder: dataDir,
                hostProfiles,
                factory: { runner },
                safeStorage: safeStorage(),
            });
            const discover = targetIpc.handlers.get(MCSERVER_CHANNELS.adoptDiscover)!;
            const found = await discover({} as never, { hostId: "fowshan" } as never) as { ok: boolean; value: readonly { containerId: string }[] };
            expect(found.ok).toBe(true);
            expect(found.value[0]?.containerId).toBe("abc123");
            const adopt = targetIpc.handlers.get(MCSERVER_CHANNELS.adopt)!;
            const answer = await adopt({} as never, { id: "andyville", hostId: "fowshan", containerId: "abc123", consent: { lifecycle: true, configWrite: true, consoleWrite: true } } as never) as { ok: boolean; value?: { server: { ref: { kind: string; hostId?: string } } } };
            expect(answer.ok).toBe(true);
            expect(answer.value?.server.ref).toMatchObject({ kind: "ssh-docker", hostId: "fowshan" });
            registered.dispose();
        } finally {
            await rm(dataDir, { recursive: true, force: true });
        }
    });
});
