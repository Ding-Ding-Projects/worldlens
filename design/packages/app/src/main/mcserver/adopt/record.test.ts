import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NO_CONSENT, capabilitiesForConsent, createAdoptionStore, parseAdoptionRecord, type AdoptionRecord } from "./record.js";

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wl-adopt-record-"));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

function record(overrides: Partial<AdoptionRecord> = {}): AdoptionRecord {
    return {
        id: "survival",
        transport: { kind: "local-docker", containerRef: "mc-survival", serverDir: "/data" },
        containerId: "abc123",
        containerName: "survival",
        fingerprint: "deadbeef",
        adoptedAt: "2026-01-01T00:00:00Z",
        mode: "record-only",
        detected: { flavour: "paper", minecraftVersion: "1.21.4" },
        serverDir: "/data",
        writeScope: [],
        consent: NO_CONSENT,
        preAdoptionBackup: null,
        releasedAt: null,
        ...overrides,
    };
}

describe("createAdoptionStore", () => {
    it("defaults to record-only and no granted consent", async () => {
        const store = createAdoptionStore({ dataFolder: dir });
        const saved = await store.put(record());
        expect(saved.ok).toBe(true);
        if (!saved.ok) return;
        expect(saved.value.mode).toBe("record-only");
        expect(saved.value.consent).toEqual(NO_CONSENT);
    });

    it("round-trips a record with independently granted consent", async () => {
        const store = createAdoptionStore({ dataFolder: dir });
        await store.put(record({ consent: { configWrite: true, lifecycle: false, pluginInstall: false, consoleWrite: true } }));
        const fetched = await store.get("survival");
        expect(fetched.ok).toBe(true);
        if (!fetched.ok) return;
        expect(fetched.value.consent).toEqual({ configWrite: true, lifecycle: false, pluginInstall: false, consoleWrite: true });
    });

    it("rejects a malformed stored record rather than repairing it", () => {
        expect(parseAdoptionRecord({ id: "x" })).toBeNull();
        expect(parseAdoptionRecord(null)).toBeNull();
        expect(parseAdoptionRecord({ ...record(), mode: "something-else" })).toBeNull();
    });

    it("removes a record on request", async () => {
        const store = createAdoptionStore({ dataFolder: dir });
        await store.put(record());
        const removed = await store.remove("survival");
        expect(removed.ok).toBe(true);
        const fetched = await store.get("survival");
        expect(fetched.ok).toBe(false);
    });
});

describe("capabilitiesForConsent", () => {
    it("never grants canCreate or canDestroy, regardless of consent", () => {
        const caps = capabilitiesForConsent({ configWrite: true, lifecycle: true, pluginInstall: true, consoleWrite: true });
        expect(caps.canCreate).toBe(false);
        expect(caps.canDestroy).toBe(false);
    });

    it("maps each consent switch independently", () => {
        expect(capabilitiesForConsent(NO_CONSENT).canLifecycle).toBe(false);
        expect(capabilitiesForConsent(NO_CONSENT).canWriteFiles).toBe(false);
        expect(capabilitiesForConsent(NO_CONSENT).console).toBe("none");

        const lifecycleOnly = capabilitiesForConsent({ ...NO_CONSENT, lifecycle: true });
        expect(lifecycleOnly.canLifecycle).toBe(true);
        expect(lifecycleOnly.canWriteFiles).toBe(false);

        const configOnly = capabilitiesForConsent({ ...NO_CONSENT, configWrite: true });
        expect(configOnly.canWriteFiles).toBe(true);
        expect(configOnly.canLifecycle).toBe(false);

        const pluginsOnly = capabilitiesForConsent({ ...NO_CONSENT, pluginInstall: true });
        expect(pluginsOnly.canWriteFiles).toBe(true);

        const consoleOnly = capabilitiesForConsent({ ...NO_CONSENT, consoleWrite: true });
        expect(consoleOnly.console).toBeUndefined();
    });

    it("keeps all four consent dimensions independent across the full matrix", () => {
        for (const configWrite of [false, true]) {
            for (const lifecycle of [false, true]) {
                for (const pluginInstall of [false, true]) {
                    for (const consoleWrite of [false, true]) {
                        const caps = capabilitiesForConsent({ configWrite, lifecycle, pluginInstall, consoleWrite });
                        expect(caps.canWriteConfig).toBe(configWrite);
                        expect(caps.canWritePlugins).toBe(pluginInstall);
                        expect(caps.canWriteWorlds).toBe(false);
                        expect(caps.canBackupRestore).toBe(false);
                        expect(caps.canLifecycle).toBe(lifecycle);
                        expect(caps.console).toBe(consoleWrite ? undefined : "none");
                        expect(caps.canCreate).toBe(false);
                        expect(caps.canDestroy).toBe(false);
                    }
                }
            }
        }
    });
});
