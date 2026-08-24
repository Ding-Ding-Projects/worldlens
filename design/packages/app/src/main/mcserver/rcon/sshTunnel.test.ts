import { describe, expect, it, vi } from "vitest";

import { openSshRconTunnel, sshRconForwardArguments } from "./sshTunnel.js";
import type { SshOptionsInput } from "../../remote/ssh.js";

const ssh: SshOptionsInput = {
    target: {
        id: "andyville",
        label: "Andyville",
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

    it("rejects an invalid remote port without spawning", async () => {
        const spawnProcess = vi.fn();
        const result = await openSshRconTunnel({ ssh, remotePort: 0, spawnProcess });
        expect(result.ok).toBe(false);
        expect(spawnProcess).not.toHaveBeenCalled();
    });
});
