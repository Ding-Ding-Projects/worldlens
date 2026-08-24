import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { createSshDockerTransport } from "./sshDocker.js";
import type { CommandOutput } from "../../runtime/command.js";

function output(overrides: Partial<CommandOutput> = {}): CommandOutput {
    return { ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null, ...overrides };
}

function makeTransport(mode: "success" | "first-failure" | "second-failure" | "rollback-failure" | "cross-filesystem" | "hash-failure" | "enospc" = "success", backup = true) {
    const calls: string[] = [];
    const digest = createHash("sha256").update(Buffer.from([1, 2, 3, 4])).digest("hex");
    let renameCount = 0;
    const runner = async (command: string, args: readonly string[]): Promise<CommandOutput> => {
        if (command === "scp") return mode === "enospc" ? output({ ok: false, exitCode: 28, stderr: "ENOSPC" }) : output();
        const remote = String(args.at(-1));
        calls.push(remote);
        if (remote.includes("stat") && remote.includes("%d")) return output({ stdout: mode === "cross-filesystem" && remote.includes("stage") ? "8\n" : "7\n" });
        if (remote.includes("stat") && remote.includes("%s")) return output({ stdout: "4\n" });
        if (remote.includes("find") && remote.includes("'-type' 'l'")) return output();
        if (remote.includes("find") && remote.includes("'-type' 'f'")) {
            const stage = remote.match(/\/data\.worldlens-stage-[a-f0-9-]+/)?.[0] ?? "/data.worldlens-stage-id";
            return output({ stdout: `${stage}/level.dat\n` });
        }
        if (remote.includes("sha256sum")) return output({ stdout: `${mode === "hash-failure" ? "bad" : digest}  /data/stage-id/level.dat\n` });
        if (remote.includes("'mv'")) {
            renameCount += 1;
            if (mode === "first-failure" && renameCount === 1) return output({ ok: false, exitCode: 1, stderr: "rename refused" });
            if (mode === "second-failure" && renameCount === 2) return output({ ok: false, exitCode: 1, stderr: "rename refused" });
            if (mode === "rollback-failure" && renameCount >= 2) return output({ ok: false, exitCode: 1, stderr: "rename refused" });
        }
        if (remote.includes("inspect")) return output({ stdout: JSON.stringify({ Status: "running", Running: true, ExitCode: 0 }) });
        return output();
    };
    return {
        calls,
        transport: createSshDockerTransport({
            hostId: "fixture-host",
            target: { id: "fixture-host", label: "Fixture host", host: "fixture.example", port: 22, user: "runner", identityFile: null, workDir: "/srv/fixture", image: "example/minecraft@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", docker: "docker", keepRemoteFiles: false },
            knownHostsFile: "C:/fixture/known_hosts",
            containerRef: "fixture-container",
            serverDir: "/data",
            runner,
            capabilities: { canCreate: false, canLifecycle: true, canWriteFiles: false, canBackupRestore: backup, canDestroy: false, console: "none" },
        }),
    };
}

describe("SSH Docker atomic restore", () => {
    it("stages, validates, swaps and restarts a previously running server", async () => {
        const root = await mkdtemp(join(tmpdir(), "fixture-restore-"));
        try {
            await writeFile(join(root, "level.dat"), new Uint8Array([1, 2, 3, 4]));
            const fake = makeTransport();
            const result = await fake.transport.atomicRestoreDirectory!(root, "/data");
            expect(result.ok).toBe(true);
            expect(fake.calls.some((call) => call.includes("'mv'"))).toBe(true);
            expect(fake.calls.some((call) => call.includes("'start'"))).toBe(true);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("refuses cross-filesystem staging and rolls back after a second rename refusal", async () => {
        const root = await mkdtemp(join(tmpdir(), "fixture-restore-fail-"));
        try {
            await writeFile(join(root, "level.dat"), new Uint8Array([1, 2, 3, 4]));
            const cross = await makeTransport("cross-filesystem").transport.atomicRestoreDirectory!(root, "/data");
            expect(cross.ok).toBe(false);
            const second = await makeTransport("second-failure").transport.atomicRestoreDirectory!(root, "/data");
            expect(second.ok).toBe(false);
            if (!second.ok) expect(second.failure.message).toContain("original world was restored");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("refuses hash mismatch, ENOSPC, cancellation and rollback uncertainty", async () => {
        const root = await mkdtemp(join(tmpdir(), "fixture-restore-guards-"));
        try {
            await writeFile(join(root, "level.dat"), new Uint8Array([1, 2, 3, 4]));
            const hash = await makeTransport("hash-failure").transport.atomicRestoreDirectory!(root, "/data");
            expect(hash.ok).toBe(false);
            const space = await makeTransport("enospc").transport.atomicRestoreDirectory!(root, "/data");
            expect(space.ok).toBe(false);
            if (!space.ok) expect(space.failure.detail).toContain("ENOSPC");
            const controller = new AbortController();
            controller.abort();
            const cancelled = await makeTransport().transport.atomicRestoreDirectory!(root, "/data", { signal: controller.signal });
            expect(cancelled.ok).toBe(false);
            if (!cancelled.ok) expect(cancelled.failure.code).toBe("timeout");
            const rollback = await makeTransport("rollback-failure").transport.atomicRestoreDirectory!(root, "/data");
            expect(rollback.ok).toBe(false);
            if (!rollback.ok) expect(rollback.failure.message).toContain("rollback could not be proven");
            const consent = await makeTransport("success", false).transport.atomicRestoreDirectory!(root, "/data");
            expect(consent.ok).toBe(false);
            if (!consent.ok) expect(consent.failure.code).toBe("unsupported");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
