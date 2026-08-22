import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    CATALOGUE_FILE,
    FLAVOUR_IDS,
    fabricServerJarUrl,
    listCatalogue,
    refreshCatalogue,
    type FetchText,
} from "./catalogue.js";

const VANILLA_MANIFEST = JSON.stringify({
    versions: [
        { id: "1.21.4", type: "release", url: "https://example.test/1.21.4.json", releaseTime: "2024-12-03T10:12:57+00:00" },
        { id: "24w45a", type: "snapshot", url: "https://example.test/24w45a.json", releaseTime: "2024-11-06T09:00:00+00:00" },
        { id: "b1.7.3", type: "old_beta", url: "https://example.test/b1.7.3.json" },
    ],
});

const VANILLA_DETAIL = JSON.stringify({
    downloads: { server: { url: "https://example.test/server-1.21.4.jar", sha1: "deadbeef", size: 123 } },
    javaVersion: { majorVersion: 21 },
});

const VANILLA_SNAPSHOT_DETAIL = JSON.stringify({
    downloads: { server: { url: "https://example.test/server-24w45a.jar", sha1: "cafef00d", size: 456 } },
    javaVersion: { majorVersion: 21 },
});

const PAPER_PROJECT = JSON.stringify({ versions: { "1.21": ["1.21.4", "1.21.3"] } });
// v3 returns builds NEWEST FIRST, the opposite of the v2 API this used to read.
const PAPER_BUILDS = JSON.stringify([
    {
        id: 11,
        time: "2024-12-04T09:00:00Z",
        channel: "STABLE",
        downloads: {
            "server:default": {
                name: "paper-1.21.4-11.jar",
                url: "https://fill-data.papermc.io/v1/objects/bbb/paper-1.21.4-11.jar",
                checksums: { sha256: "b".repeat(64) },
            },
        },
    },
    {
        id: 10,
        time: "2024-12-03T09:00:00Z",
        channel: "STABLE",
        downloads: {
            "server:default": {
                name: "paper-1.21.4-10.jar",
                url: "https://fill-data.papermc.io/v1/objects/aaa/paper-1.21.4-10.jar",
                checksums: { sha256: "a".repeat(64) },
            },
        },
    },
]);

const VELOCITY_PROJECT = JSON.stringify({ versions: { "3.4": ["3.4.0"] } });
const VELOCITY_BUILDS = JSON.stringify([
    {
        id: 5,
        time: "2024-11-01T09:00:00Z",
        channel: "STABLE",
        downloads: {
            "server:default": {
                name: "velocity-3.4.0-5.jar",
                url: "https://fill-data.papermc.io/v1/objects/ccc/velocity-3.4.0-5.jar",
                checksums: { sha256: "c".repeat(64) },
            },
        },
    },
]);

const PURPUR_PROJECT = JSON.stringify({ versions: ["1.21.4"] });
const PURPUR_VERSION = JSON.stringify({ builds: { latest: "2350", all: ["2349", "2350"] } });

const FABRIC_LOADERS = JSON.stringify([
    { version: "0.16.9", stable: true },
    { version: "0.16.10-beta.1", stable: false },
]);

function fakeFetch(routes: Record<string, string>): FetchText {
    return async (url: string) => {
        for (const [prefix, body] of Object.entries(routes)) {
            if (url.startsWith(prefix)) return body;
        }
        throw new Error(`unexpected fetch: ${url}`);
    };
}

const ALL_ROUTES: Record<string, string> = {
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json": VANILLA_MANIFEST,
    "https://example.test/1.21.4.json": VANILLA_DETAIL,
    "https://example.test/24w45a.json": VANILLA_SNAPSHOT_DETAIL,
    "https://fill.papermc.io/v3/projects/paper/versions/1.21.3/builds": PAPER_BUILDS,
    "https://fill.papermc.io/v3/projects/paper/versions/1.21.4/builds": PAPER_BUILDS,
    "https://fill.papermc.io/v3/projects/paper": PAPER_PROJECT,
    "https://fill.papermc.io/v3/projects/velocity/versions/3.4.0/builds": VELOCITY_BUILDS,
    "https://fill.papermc.io/v3/projects/velocity": VELOCITY_PROJECT,
    "https://api.purpurmc.org/v2/purpur/1.21.4": PURPUR_VERSION,
    "https://api.purpurmc.org/v2/purpur": PURPUR_PROJECT,
    "https://meta.fabricmc.net/v2/versions/loader": FABRIC_LOADERS,
};

describe("refreshCatalogue", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "mcserver-catalogue-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("fetches every flavour from its real API shape and caches the result", async () => {
        const result = await refreshCatalogue({
            dataDir: dir,
            fetchText: fakeFetch(ALL_ROUTES),
            now: () => "2026-08-21T00:00:00.000Z",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.value.fetchedAt).toBe("2026-08-21T00:00:00.000Z");
        expect(result.value.stale).toBe(false);
        expect(result.value.failures).toEqual([]);
        expect(result.value.flavours.map((f) => f.flavour)).toEqual(FLAVOUR_IDS);

        const vanilla = result.value.flavours.find((f) => f.flavour === "vanilla");
        expect(vanilla?.versions).toEqual([
            { version: "1.21.4", stability: "release", javaFeature: 21, downloadUrl: "https://example.test/server-1.21.4.jar", sha256: null, releasedAt: "2024-12-03T10:12:57+00:00" },
            { version: "24w45a", stability: "snapshot", javaFeature: 21, downloadUrl: "https://example.test/server-24w45a.jar", sha256: null, releasedAt: "2024-11-06T09:00:00+00:00" },
        ]);

        const paper = result.value.flavours.find((f) => f.flavour === "paper");
        expect(paper?.versions).toHaveLength(2);
        expect(paper?.versions[0]?.sha256).toBe("b".repeat(64));

        const fabric = result.value.flavours.find((f) => f.flavour === "fabric");
        expect(fabric?.versions).toEqual([
            { version: "0.16.9", stability: "release", javaFeature: 8, downloadUrl: null, sha256: null, releasedAt: null },
            { version: "0.16.10-beta.1", stability: "snapshot", javaFeature: 8, downloadUrl: null, sha256: null, releasedAt: null },
        ]);
    });

    it("writes the cache file to disk", async () => {
        await refreshCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES) });
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(join(dir, CATALOGUE_FILE), "utf8");
        const parsed = JSON.parse(text) as { flavours: unknown[] };
        expect(parsed.flavours).toHaveLength(FLAVOUR_IDS.length);
    });

    it("keeps a flavour's previous cached entries when that flavour's fetch fails", async () => {
        await refreshCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES), now: () => "2026-08-14T00:00:00.000Z" });

        const brokenRoutes = { ...ALL_ROUTES };
        delete brokenRoutes["https://fill.papermc.io/v3/projects/paper"];
        const secondFetch: FetchText = async (url) => {
            if (url.startsWith("https://fill.papermc.io/v3/projects/paper") && !url.includes("velocity")) {
                throw new Error("PaperMC is down");
            }
            return fakeFetch(ALL_ROUTES)(url);
        };

        const result = await refreshCatalogue({ dataDir: dir, fetchText: secondFetch, now: () => "2026-08-21T00:00:00.000Z" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.failures.some((f) => f.flavour === "paper")).toBe(true);
        const paper = result.value.flavours.find((f) => f.flavour === "paper");
        // The previous run's Paper entries survive rather than being wiped to nothing.
        expect(paper?.versions.length).toBeGreaterThan(0);
    });

    it("fails when every flavour is unreachable", async () => {
        const result = await refreshCatalogue({
            dataDir: dir,
            fetchText: async () => {
                throw new Error("offline");
            },
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("unreachable");
    });
});

describe("listCatalogue", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "mcserver-catalogue-list-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("fetches fresh when there is no cache yet", async () => {
        const result = await listCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES) });
        expect(result.ok).toBe(true);
    });

    it("serves the cache without touching the network when it is fresh", async () => {
        await refreshCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES), now: () => "2026-08-21T00:00:00.000Z" });
        const result = await listCatalogue({
            dataDir: dir,
            now: () => "2026-08-21T01:00:00.000Z",
            fetchText: async (url) => {
                throw new Error(`should not have fetched ${url}`);
            },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.stale).toBe(false);
    });

    /**
     * The offline guard: a cache older than `CACHE_MAX_AGE_MS` whose refresh attempt
     * fails (no network) must still be served, marked stale, rather than reporting an
     * error to a caller who simply wants to see whatever was last known.
     */
    it("serves a stale cache marked as stale when offline and the cache has expired", async () => {
        await refreshCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES), now: () => "2026-01-01T00:00:00.000Z" });
        const result = await listCatalogue({
            dataDir: dir,
            now: () => "2026-08-21T00:00:00.000Z", // far more than a week later
            fetchText: async () => {
                throw new Error("offline");
            },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.stale).toBe(true);
        expect(result.value.flavours.length).toBeGreaterThan(0);
    });
});

describe("fabricServerJarUrl", () => {
    it("builds the documented Fabric server jar download URL", () => {
        expect(fabricServerJarUrl("1.21.4", "0.16.9", "1.0.1")).toBe(
            "https://meta.fabricmc.net/v2/versions/loader/1.21.4/0.16.9/1.0.1/server/jar",
        );
    });
});

describe("a cache written by an older build", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "mcserver-catalogue-shape-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("is refused rather than handed back missing the fields this build expects", async () => {
        // The exact defect this guards. A cache written before `releasedAt` existed still
        // parses, still carries the right top-level keys, and every version inside it is
        // quietly missing the date - so the feature looks unimplemented rather than stale,
        // and nothing anywhere reports why.
        const older = {
            flavours: [
                {
                    flavour: "vanilla",
                    versions: [
                        { version: "1.21.4", stability: "release", javaFeature: 21, downloadUrl: null, sha256: null },
                    ],
                },
            ],
            fetchedAt: "2026-08-21T00:00:00.000Z",
            failures: [],
            // No `shape` key at all, exactly as an older build wrote it.
        };
        await writeFile(join(dir, CATALOGUE_FILE), JSON.stringify(older), "utf8");

        let fetches = 0;
        const counting = fakeFetch(ALL_ROUTES);
        const answer = await listCatalogue({
            dataDir: dir,
            fetchText: async (url: string) => {
                fetches += 1;
                return counting(url);
            },
            now: () => "2026-08-21T00:00:01.000Z",
        });

        // Refusing it means going back to the network, which is the whole point: what comes
        // back carries the field, rather than a cached entry silently lacking it.
        expect(fetches).toBeGreaterThan(0);
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        const vanilla = answer.value.flavours.find((entry) => entry.flavour === "vanilla");
        expect(vanilla?.versions[0]?.releasedAt).toBe("2024-12-03T10:12:57+00:00");
    });
});
