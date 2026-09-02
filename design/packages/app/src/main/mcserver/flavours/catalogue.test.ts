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
        {
            id: "1.21.4",
            type: "release",
            url: "https://example.test/1.21.4.json",
            releaseTime: "2024-12-03T10:12:57+00:00",
        },
        {
            id: "24w45a",
            type: "snapshot",
            url: "https://example.test/24w45a.json",
            releaseTime: "2024-11-06T09:00:00+00:00",
        },
        { id: "b1.7.3", type: "old_beta", url: "https://example.test/b1.7.3.json" },
    ],
});

const VANILLA_DETAIL = JSON.stringify({
    downloads: {
        server: { url: "https://example.test/server-1.21.4.jar", sha1: "deadbeef", size: 123 },
    },
    javaVersion: { majorVersion: 21 },
});

const VANILLA_SNAPSHOT_DETAIL = JSON.stringify({
    downloads: {
        server: { url: "https://example.test/server-24w45a.jar", sha1: "cafef00d", size: 456 },
    },
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

// Forge publishes a promotions map rather than a version list: each Minecraft version
// points at the Forge build promoted for it, and recommended beats latest for the same one.
const FORGE_PROMOTIONS = JSON.stringify({
    promos: {
        "1.21.3-latest": "53.0.10",
        "1.21.4-latest": "54.1.2",
        "1.21.4-recommended": "54.1.0",
    },
});

// NeoForge publishes Maven metadata, oldest first.
const NEOFORGE_METADATA = [
    "<metadata><versioning><versions>",
    "<version>21.4.10-beta</version>",
    "<version>21.4.11</version>",
    "</versions></versioning></metadata>",
].join("");

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
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json": FORGE_PROMOTIONS,
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml": NEOFORGE_METADATA,
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
        expect(result.value.sourceRevision).toMatch(/^[0-9a-f]{64}$/);
        expect(result.value.stale).toBe(false);
        expect(result.value.failures).toEqual([]);
        expect(result.value.flavours.map((f) => f.flavour)).toEqual(FLAVOUR_IDS);

        const vanilla = result.value.flavours.find((f) => f.flavour === "vanilla");
        expect(vanilla?.versions).toEqual([
            {
                version: "1.21.4",
                stability: "release",
                javaFeature: 21,
                downloadUrl: "https://example.test/server-1.21.4.jar",
                sha256: null,
                releasedAt: "2024-12-03T10:12:57+00:00",
            },
            {
                version: "24w45a",
                stability: "snapshot",
                javaFeature: 21,
                downloadUrl: "https://example.test/server-24w45a.jar",
                sha256: null,
                releasedAt: "2024-11-06T09:00:00+00:00",
            },
        ]);

        const paper = result.value.flavours.find((f) => f.flavour === "paper");
        // Every published build is retained, not only the newest build per game version.
        expect(paper?.versions).toHaveLength(4);
        expect(paper?.versions[0]?.sha256).toBe("b".repeat(64));
        expect(paper?.versions.some((entry) => entry.version === "1.21.4#10")).toBe(true);

        const fabric = result.value.flavours.find((f) => f.flavour === "fabric");
        expect(fabric?.versions).toEqual([
            {
                version: "0.16.9",
                stability: "release",
                javaFeature: 8,
                downloadUrl: null,
                sha256: null,
                releasedAt: null,
            },
            {
                version: "0.16.10-beta.1",
                stability: "snapshot",
                javaFeature: 8,
                downloadUrl: null,
                sha256: null,
                releasedAt: null,
            },
        ]);
    });

    it("follows a paginated Paper build response instead of silently dropping later builds", async () => {
        const firstPage = JSON.stringify({
            builds: [JSON.parse(PAPER_BUILDS)[0]],
            next: "https://example.test/paper-builds-page-2",
        });
        const secondPage = JSON.stringify({ builds: [JSON.parse(PAPER_BUILDS)[1]] });
        const base = fakeFetch(ALL_ROUTES);
        const paginated: FetchText = async (url) => {
            if (url.endsWith("/paper/versions/1.21.4/builds")) return firstPage;
            if (url === "https://example.test/paper-builds-page-2") return secondPage;
            return base(url);
        };
        const result = await refreshCatalogue({ dataDir: dir, fetchText: paginated });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const paper = result.value.flavours.find((entry) => entry.flavour === "paper");
        expect(paper?.versions.some((entry) => entry.version === "1.21.4#10")).toBe(true);
        expect(paper?.complete).toBe(true);
        expect(result.value.completeness).toBe("complete");
    });

    it("writes the cache file to disk", async () => {
        await refreshCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES) });
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(join(dir, CATALOGUE_FILE), "utf8");
        const parsed = JSON.parse(text) as { flavours: unknown[] };
        expect(parsed.flavours).toHaveLength(FLAVOUR_IDS.length);
    });

    it("keeps a flavour's previous cached entries when that flavour's fetch fails", async () => {
        await refreshCatalogue({
            dataDir: dir,
            fetchText: fakeFetch(ALL_ROUTES),
            now: () => "2026-08-14T00:00:00.000Z",
        });

        const brokenRoutes = { ...ALL_ROUTES };
        delete brokenRoutes["https://fill.papermc.io/v3/projects/paper"];
        const secondFetch: FetchText = async (url) => {
            if (
                url.startsWith("https://fill.papermc.io/v3/projects/paper") &&
                !url.includes("velocity")
            ) {
                throw new Error("PaperMC is down");
            }
            return fakeFetch(ALL_ROUTES)(url);
        };

        const result = await refreshCatalogue({
            dataDir: dir,
            fetchText: secondFetch,
            now: () => "2026-08-21T00:00:00.000Z",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.failures.some((f) => f.flavour === "paper")).toBe(true);
        const paper = result.value.flavours.find((f) => f.flavour === "paper");
        // The previous run's Paper entries survive rather than being wiped to nothing.
        expect(paper?.versions.length).toBeGreaterThan(0);
        expect(paper?.stale).toBe(true);
        expect(paper?.failure).toContain("PaperMC is down");
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

    it("keeps a large Mojang release and snapshot manifest complete", async () => {
        const versions = Array.from({ length: 40 }, (_, index) => ({
            id:
                index % 2 === 0
                    ? `1.${30 - Math.floor(index / 2)}.${index % 10}`
                    : `30w${String(index).padStart(2, "0")}a`,
            type: index % 2 === 0 ? "release" : "snapshot",
            url: `https://example.test/large-${index}.json`,
            releaseTime: "2026-01-01T00:00:00Z",
        }));
        const largeManifest = JSON.stringify({ versions });
        const result = await refreshCatalogue({
            dataDir: dir,
            fetchText: async (url) => {
                if (url === "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
                    return largeManifest;
                if (url.startsWith("https://example.test/large-")) return VANILLA_DETAIL;
                return fakeFetch(ALL_ROUTES)(url);
            },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(
            result.value.flavours.find((entry) => entry.flavour === "vanilla")?.versions,
        ).toHaveLength(40);
    });

    it("refuses a malformed or oversized Mojang manifest instead of guessing", async () => {
        const malformed = await refreshCatalogue({
            dataDir: dir,
            fetchText: async (url) => {
                if (url === "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
                    return JSON.stringify({ versions: "not-an-array" });
                throw new Error("offline");
            },
        });
        expect(malformed.ok).toBe(false);
        if (!malformed.ok) expect(malformed.failure.detail ?? "").toContain("versions array");

        const oversized = await refreshCatalogue({
            dataDir: dir,
            fetchText: async (url) => {
                if (url === "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
                    return "{" + "x".repeat(16 * 1024 * 1024) + "}";
                throw new Error("offline");
            },
        });
        expect(oversized.ok).toBe(false);
        if (!oversized.ok) expect(oversized.failure.detail ?? "").toContain("byte limit");
    });

    it("does not silently truncate a manifest with more than five thousand exact entries", async () => {
        const versions = Array.from({ length: 5001 }, (_, index) => ({
            id: `1.${Math.floor(index / 10)}.${index % 10}`,
            type: "release",
            url: `https://example.test/large-${index}.json`,
            releaseTime: "2026-01-01T00:00:00Z",
        }));
        const result = await refreshCatalogue({
            dataDir: dir,
            fetchText: async (url) => {
                if (url === "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
                    return JSON.stringify({ versions });
                if (url.startsWith("https://example.test/large-")) return VANILLA_DETAIL;
                return fakeFetch(ALL_ROUTES)(url);
            },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(
            result.value.flavours.find((entry) => entry.flavour === "vanilla")?.versions,
        ).toHaveLength(5001);
    });

    it("rejects duplicate versions, invalid timestamps, and non-HTTPS cached URLs", async () => {
        const invalid = {
            shape: 3,
            fetchedAt: "not-a-time",
            sourceRevision: "not-a-digest",
            failures: [],
            flavours: [{ flavour: "vanilla", versions: [] }],
        };
        await writeFile(join(dir, CATALOGUE_FILE), JSON.stringify(invalid), "utf8");
        let fetches = 0;
        const answer = await listCatalogue({
            dataDir: dir,
            fetchText: async (url) => {
                fetches += 1;
                return fakeFetch(ALL_ROUTES)(url);
            },
        });
        expect(fetches).toBeGreaterThan(0);
        expect(answer.ok).toBe(true);

        const duplicate = {
            shape: 3,
            fetchedAt: "2026-08-21T00:00:00Z",
            sourceRevision: "a".repeat(64),
            failures: [],
            flavours: [
                {
                    flavour: "vanilla",
                    versions: [
                        {
                            version: "1.21.4",
                            stability: "release",
                            javaFeature: 21,
                            downloadUrl: "http://bad",
                            sha256: null,
                            releasedAt: null,
                        },
                        {
                            version: "1.21.4",
                            stability: "release",
                            javaFeature: 21,
                            downloadUrl: null,
                            sha256: null,
                            releasedAt: null,
                        },
                    ],
                },
            ],
        };
        await writeFile(join(dir, CATALOGUE_FILE), JSON.stringify(duplicate), "utf8");
        const reread = await listCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES) });
        expect(reread.ok).toBe(true);
        if (reread.ok) expect(reread.value.sourceRevision).not.toBe("a".repeat(64));
    });

    it("rejects malformed Mojang Java metadata instead of quietly choosing Java 8", async () => {
        const manifest = JSON.stringify({
            versions: [
                {
                    id: "1.21.5",
                    type: "release",
                    url: "https://example.test/bad-java.json",
                    releaseTime: "2026-01-01T00:00:00Z",
                },
            ],
        });
        const result = await refreshCatalogue({
            dataDir: dir,
            fetchText: async (url) => {
                if (url === "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
                    return manifest;
                if (url === "https://example.test/bad-java.json")
                    return JSON.stringify({
                        downloads: { server: { url: "https://example.test/server.jar" } },
                        javaVersion: { majorVersion: "21" },
                    });
                return fakeFetch(ALL_ROUTES)(url);
            },
        });
        expect(result.ok).toBe(true);
        if (result.ok)
            expect(
                result.value.failures.find((failure) => failure.flavour === "vanilla")?.reason,
            ).toContain("malformed Java");
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
        await refreshCatalogue({
            dataDir: dir,
            fetchText: fakeFetch(ALL_ROUTES),
            now: () => "2026-08-21T00:00:00.000Z",
        });
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
        await refreshCatalogue({
            dataDir: dir,
            fetchText: fakeFetch(ALL_ROUTES),
            now: () => "2026-01-01T00:00:00.000Z",
        });
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
                        {
                            version: "1.21.4",
                            stability: "release",
                            javaFeature: 21,
                            downloadUrl: null,
                            sha256: null,
                        },
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

describe("the mod-loader catalogues", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "mcserver-loaders-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("offers one Forge row per Minecraft version, taking the promoted build over the latest", async () => {
        const result = await refreshCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const forge = result.value.flavours.find((entry) => entry.flavour === "forge");
        const versions = (forge?.versions ?? []).map((entry) => entry.version);

        // 1.21.4 published both a latest (54.1.2) and a recommended (54.1.0). Recommended is
        // the build Forge itself points people at, and offering both would be two rows that
        // mean one choice.
        expect(versions).toContain("1.21.4-54.1.0");
        expect(versions).not.toContain("1.21.4-54.1.2");
        expect(versions.filter((v) => v.startsWith("1.21.4-"))).toHaveLength(1);
    });

    it("points Forge at the installer, because no ready-made server jar is published", async () => {
        const result = await refreshCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const forge = result.value.flavours.find((entry) => entry.flavour === "forge");
        const entry = forge?.versions.find((v) => v.version === "1.21.4-54.1.0");
        expect(entry?.downloadUrl).toContain("forge-1.21.4-54.1.0-installer.jar");
        // Forge publishes no digest beside it. Null rather than an invented one, which would
        // fail verification much later and read as a corrupt download.
        expect(entry?.sha256).toBeNull();
    });

    it("reads NeoForge newest first and marks a beta as a snapshot", async () => {
        const result = await refreshCatalogue({ dataDir: dir, fetchText: fakeFetch(ALL_ROUTES) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const neo = result.value.flavours.find((entry) => entry.flavour === "neoforge");

        // Maven lists oldest first; every other flavour here offers newest first, and a
        // picker whose top row is the oldest build is one people choose wrongly.
        expect(neo?.versions[0]?.version).toBe("21.4.11");
        expect(neo?.versions.find((v) => v.version === "21.4.10-beta")?.stability).toBe("snapshot");
        expect(neo?.versions.find((v) => v.version === "21.4.11")?.stability).toBe("release");
    });
});
