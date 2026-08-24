import { describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";

import { openSshRconTunnel, sshRconForwardArguments } from "./sshTunnel.js";
import type { SshOptionsInput } from "../../remote/ssh.js";

const ssh: SshOptionsInput = {
    target: {
        id: "fixture-host",
        label: "Fixture host",
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
};

describe("SSH RCON tunnel", () => {
    it("binds only to loopback and keeps the remote RCON socket loopback-only", () => {
        const args = sshRconForwardArguments(ssh, 43_211, 25_575);
        expect(args).toContain("127.0.0.1:43211:127.0.0.1:25575");
        expect(args.join(" ")).not.toContain("0.0.0.0");
        expect(args.join(" ")).not.toContain("PRIVATE KEY");
    });

    it("closes a child that exits before the bounded readiness window", async () => {
        const once = vi.fn((_event: string, callback: (...args: unknown[]) => void) => {
            if (_event === "exit") setTimeout(() => callback(1, null), 0);
            return fakeChild;
        });
        const fakeChild = {
            exitCode: null,
            signalCode: null,
            once,
            kill: vi.fn(),
        } as never;
        const result = await openSshRconTunnel({
            ssh,
            remotePort: 25_575,
            settleMs: 50,
            spawnProcess: () => fakeChild,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("unreachable");
    });

    it("releases the reservation before a real forwarding child binds and probes it", async () => {
        const child = await openSshRconTunnel({
            ssh,
            remotePort: 25_575,
            settleMs: 500,
            retries: 0,
            spawnProcess: (_command, args) => {
                const mapping = args.find((value) => value.startsWith("127.0.0.1:")) ?? "";
                const localPort = Number(mapping.split(":")[1]);
                return spawn(
                    process.execPath,
                    ["-e", `require('net').createServer().listen(${String(localPort)}, '127.0.0.1')`],
                    { stdio: "ignore", windowsHide: true },
                );
            },
        });
        expect(child.ok).toBe(true);
        if (!child.ok) return;
        expect(child.value.localPort).toBeGreaterThan(0);
        await child.value.close();
    });

    it("rejects an invalid remote port without spawning", async () => {
        const spawnProcess = vi.fn();
        const result = await openSshRconTunnel({ ssh, remotePort: 0, spawnProcess });
        expect(result.ok).toBe(false);
        expect(spawnProcess).not.toHaveBeenCalled();
    });
});
