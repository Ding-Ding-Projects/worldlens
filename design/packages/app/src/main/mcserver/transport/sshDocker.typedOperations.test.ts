import { describe, expect, it } from "vitest";

import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { createSshDockerTransport } from "./sshDocker.js";

function output(overrides: Partial<CommandOutput> = {}): CommandOutput {
    return { ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null, ...overrides };
}

describe("remote Docker typed operations", () => {
    it("uses the SSH host runner for health, lifecycle, logs, and scope refusals", async () => {
        const calls: { command: string; args: readonly string[] }[] = [];
        const runner: CommandRunner = async (command, args) => {
            calls.push({ command, args });
            const remote = String(args.at(-1));
            if (remote.includes("version")) return output({ stdout: JSON.stringify({ Server: { Version: "27.0" } }) });
            if (remote.includes("inspect")) return output({ stdout: JSON.stringify({ Status: "running", Running: true, ExitCode: 0 }) });
            if (remote.includes("logs")) return output({ stdout: "[12:00:00 INFO]: server ready" });
            return output();
        };
        const transport = createSshDockerTransport({
            hostId: "andyville",
            target: {
                id: "fowshan",
                label: "Fow Shan",
                host: "fowshan",
                port: 22,
                user: "docker",
                identityFile: "C:/Users/test/.ssh/id_ed25519",
                workDir: "/home/docker/WorldLens",
                image: "heapandyville-minecraft:26.1.2-72",
                docker: "docker",
                keepRemoteFiles: false,
            },
            knownHostsFile: "C:/Users/test/AppData/WorldLens/known_hosts",
            containerRef: "heapandyville-minecraft",
            serverDir: "/data",
            runner,
        });

        expect((await transport.probe()).ok).toBe(true);
        const status = await transport.status();
        expect(status.ok && status.value.running).toBe(true);
        expect((await transport.start()).ok).toBe(true);
        expect((await transport.stop({ graceful: true, timeoutMs: 30_000 })).ok).toBe(true);
        const attached = await transport.attach({ tail: 10 });
        expect(attached.ok).toBe(true);
        if (attached.ok) {
            const lines: string[] = [];
            for await (const line of attached.value.lines) lines.push(line.text);
            expect(lines).toContain("[12:00:00 INFO]: server ready");
        }
        const refused = await transport.fileRead("../../etc/passwd");
        expect(refused.ok).toBe(false);
        expect(calls.every((call) => call.command === "ssh")).toBe(true);
    });

    it("refuses remote writes before SSH or Docker when consent is absent", async () => {
        let calls = 0;
        const transport = createSshDockerTransport({
            hostId: "andyville",
            target: {
                id: "fowshan",
                label: "Fow Shan",
                host: "fowshan",
                port: 22,
                user: "docker",
                identityFile: null,
                workDir: "/home/docker/WorldLens",
                image: "heapandyville-minecraft:26.1.2-72",
                docker: "docker",
                keepRemoteFiles: false,
            },
            knownHostsFile: "C:/Users/test/AppData/WorldLens/known_hosts",
            containerRef: "heapandyville-minecraft",
            serverDir: "/data",
            runner: async () => {
                calls += 1;
                return output();
            },
            capabilities: { canWriteFiles: false, canLifecycle: false, canCreate: false, canDestroy: false, console: "none" },
        });
        const result = await transport.fileWrite("server.properties", new Uint8Array([1]), { expectedHash: null });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("unsupported");
        expect(calls).toBe(0);
    });
});
