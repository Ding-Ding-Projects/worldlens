import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { materializeRemoteFolder } from "./backups.js";
import type { ServerTransport } from "../transport/types.js";
import { ok } from "../transport/types.js";

function transport(): ServerTransport {
    const entries: Record<string, readonly { name: string; kind: "file" | "directory" | "symlink"; size: number | null; modifiedAt: string | null }[]> = {
        "/data": [{ name: "world", kind: "directory", size: null, modifiedAt: null }],
        "/data/world": [{ name: "level.dat", kind: "file", size: 4, modifiedAt: null }],
    };
    return {
        ref: { kind: "ssh-docker", hostId: "fixture-host", containerRef: "fixture-container", serverDir: "/data" },
        capabilities: { canCreate: false, canLifecycle: false, canWriteFiles: false, canDestroy: false, console: "none" },
        probe: async () => ok({ reachable: true, runtimeVersion: "fixture", message: "", checkedAt: "now" }),
        create: async () => ok({ ref: { kind: "ssh-docker", hostId: "fixture-host", containerRef: "fixture-container", serverDir: "/data" }, createdAt: "now" }),
        start: async () => ok(undefined),
        stop: async () => ok(undefined),
        status: async () => ok({ state: "running", running: true, startedAt: null, exitCode: null, checkedAt: "now" }),
        attach: async () => ok({ id: "fixture-session", lines: { async *[Symbol.asyncIterator]() {} }, closed: Promise.resolve({ reason: "detached", followerExitCode: null }), send: async () => ok(undefined), detach() {} }),
        fileList: async (path) => ok(entries[path] ?? []),
        fileRead: async (path) => ok({ bytes: new Uint8Array(path.endsWith("level.dat") ? [1, 2, 3, 4] : []), hash: "fixture", size: 4, truncated: false }),
        fileWrite: async () => ({ ok: false, failure: { code: "unsupported", message: "fixture", detail: null } }),
        fileDelete: async () => ({ ok: false, failure: { code: "unsupported", message: "fixture", detail: null } }),
        dirEnsure: async () => ({ ok: false, failure: { code: "unsupported", message: "fixture", detail: null } }),
    };
}

describe("remote server backup staging", () => {
    it("copies bytes through the transport without interpreting them as text", async () => {
        const root = await mkdtemp(join(tmpdir(), "fixture-backup-"));
        try {
            const result = await materializeRemoteFolder(transport(), "/data", root);
            expect(result.ok).toBe(true);
            expect([...await readFile(join(root, "world", "level.dat"))]).toEqual([1, 2, 3, 4]);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("stops before another remote read when cancellation is already requested", async () => {
        const root = await mkdtemp(join(tmpdir(), "fixture-backup-cancel-"));
        try {
            const controller = new AbortController();
            controller.abort();
            const result = await materializeRemoteFolder(transport(), "/data", root, controller.signal);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.failure.code).toBe("timeout");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
