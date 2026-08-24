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
            hostId: "fixture-host",
            target: {
                id: "fixture-host",
                label: "Fow Shan",
                host: "fixture.example",
                port: 22,
                user: "docker",
                identityFile: "C:/fixture/id_ed25519",
                workDir: "/srv/fixture",
                image: "example/minecraft:fixture",
                docker: "docker",
                keepRemoteFiles: false,
            },
            knownHostsFile: "C:/fixture/known_hosts",
            containerRef: "fixture-container",
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
            hostId: "fixture-host",
            target: {
                id: "fixture-host",
                label: "Fow Shan",
                host: "fixture.example",
                port: 22,
                user: "docker",
                identityFile: null,
                workDir: "/srv/fixture",
                image: "example/minecraft:fixture",
                docker: "docker",
                keepRemoteFiles: false,
            },
            knownHostsFile: "C:/fixture/known_hosts",
            containerRef: "fixture-container",
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

    it("does not let config consent authorize plugin or world writes", async () => {
        const calls: string[] = [];
        const transport = createSshDockerTransport({
            hostId: "fixture-host",
            target: {
                id: "fixture-host",
                label: "Fixture host",
                host: "fixture.example",
                port: 22,
                user: "runner",
                identityFile: null,
                workDir: "/srv/fixture",
                image: "example/minecraft:fixture",
                docker: "docker",
                keepRemoteFiles: false,
            },
            knownHostsFile: "C:/fixture/known_hosts",
            containerRef: "fixture-container",
            serverDir: "/data",
            runner: async (command) => {
                calls.push(command);
                return output();
            },
            capabilities: {
                canCreate: false,
                canLifecycle: false,
                canWriteFiles: true,
                canWriteConfig: true,
                canWritePlugins: false,
                canWriteWorlds: false,
                canBackupRestore: false,
                canDestroy: false,
                console: "none",
            },
        });
        const config = await transport.fileWrite("server.properties", new Uint8Array([1]), { expectedHash: null, kind: "config" });
        const plugin = await transport.fileWrite("plugins/example.jar", new Uint8Array([1]), { expectedHash: null, kind: "plugin" });
        const world = await transport.fileWrite("world/level.dat", new Uint8Array([1]), { expectedHash: null, kind: "world" });
        expect(config.ok).toBe(true);
        expect(plugin.ok).toBe(false);
        expect(world.ok).toBe(false);
        expect(calls.filter((command) => command === "ssh")).toHaveLength(2);
    });
});
