import { describe, expect, it, vi } from "vitest";

import { createServerStore, type Answer, type McServerHost } from "./serverStore.js";
import type { ServerRecord } from "./serverModel.js";
import { resolveServerHost } from "./useServers.js";

function record(id = "survival"): ServerRecord {
    return {
        id,
        name: "Survival",
        flavour: "paper",
        minecraftVersion: "1.21",
        ref: { kind: "local-process", serverDir: "/srv/survival" },
        origin: "created",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        hasRconSecret: false,
        rconPort: null,
        writeScope: [],
    };
}

function ok<T>(value: T): Answer<T> {
    return { ok: true, value };
}

function fakeHost(overrides: Partial<McServerHost> = {}): McServerHost {
    return {
        name: "fake",
        list: vi.fn(async () => ok([record()])),
        get: vi.fn(async () => ok(record())),
        save: vi.fn(async () => ok(record())),
        forget: vi.fn(async () => ok(undefined)),
        probe: vi.fn(async () =>
            ok({
                reachable: true,
                runtimeVersion: "21",
                message: "ok",
                checkedAt: "now",
                capabilities: {
                    canCreate: true,
                    canLifecycle: true,
                    canWriteFiles: true,
                    canDestroy: true,
                    console: "rcon" as const,
                },
            }),
        ),
        status: vi.fn(async () => ok({ state: "running" as const, running: true, startedAt: "now", exitCode: null, checkedAt: "now" })),
        start: vi.fn(async () => ok(undefined)),
        stop: vi.fn(async () => ok(undefined)),
        files: {
            list: vi.fn(async () => ok([])),
            read: vi.fn(async () => ok({ bytes: new Uint8Array(), hash: "h", size: 0, truncated: false })),
            write: vi.fn(async () => ok({ hash: "h", size: 0, writtenAt: "now", backupPath: null })),
        },
        logTail: vi.fn(async () => ok([])),
        ...overrides,
    };
}

describe("createServerStore with no host", () => {
    it("reports canList: false rather than an empty list", async () => {
        const store = createServerStore({ host: null });
        expect(store.canList).toBe(false);
        await store.load();
        expect(store.loaded.value).toBe(true);
        expect(store.servers.value).toEqual([]);
    });

    it("every mutating call fails with a stated reason instead of throwing", async () => {
        const store = createServerStore({ host: null });
        const result = await store.start("x");
        expect(result.ok).toBe(false);
        expect(result.failure?.message).toMatch(/cannot reach/);
    });
});

describe("createServerStore with a host", () => {
    it("loads the list", async () => {
        const store = createServerStore({ host: fakeHost() });
        expect(store.canList).toBe(true);
        await store.load();
        expect(store.servers.value).toHaveLength(1);
        expect(store.servers.value[0]?.id).toBe("survival");
    });

    it("keeps the last failure message on a failed load rather than emptying the list", async () => {
        const host = fakeHost({ list: vi.fn(async () => ({ ok: false, failure: { code: "unreachable", message: "no daemon", detail: null } })) });
        const store = createServerStore({ host });
        await store.load();
        expect(store.failure.value).toBe("no daemon");
        expect(store.servers.value).toEqual([]);
    });

    it("save adds a new record and updates an existing one", async () => {
        const host = fakeHost();
        const store = createServerStore({ host });
        await store.load();
        const renamed = { ...record(), name: "Renamed" };
        host.save = vi.fn(async () => ok(renamed));
        await store.save(renamed);
        expect(store.get("survival")?.name).toBe("Renamed");
    });

    it("forget removes the record and its cached status", async () => {
        const host = fakeHost();
        const store = createServerStore({ host });
        await store.load();
        await store.refreshStatus("survival");
        expect(store.statuses["survival"]).toBeDefined();
        await store.forget("survival");
        expect(store.get("survival")).toBeUndefined();
        expect(store.statuses["survival"]).toBeUndefined();
    });

    it("probe caches capabilities, readable via capabilitiesFor", async () => {
        const store = createServerStore({ host: fakeHost() });
        await store.probe("survival");
        expect(store.capabilitiesFor("survival")?.canLifecycle).toBe(true);
    });

    it("runningCount reflects cached statuses", async () => {
        const store = createServerStore({ host: fakeHost() });
        await store.load();
        await store.refreshStatus("survival");
        expect(store.runningCount.value).toBe(1);
    });
});

describe("resolveServerHost", () => {
    it("returns null when the bridge namespace is absent", () => {
        expect(resolveServerHost({})).toBeNull();
    });

    it("returns null when the namespace is missing a required method", () => {
        expect(
            resolveServerHost({ worldlens: { mcserver: { list: () => {}, get: () => {} } } }),
        ).toBeNull();
    });

    it("resolves a fully-shaped namespace", () => {
        const host = fakeHost();
        const resolved = resolveServerHost({ worldlens: { mcserver: host } });
        expect(resolved).not.toBeNull();
        expect(resolved?.name).toBe("Electron shell");
    });
});
