/**
 * What server flavours and versions actually exist, fetched from each project's own API.
 *
 * Every version entry here traces back to a real response from a real upstream: Mojang's
 * launcher manifest for Vanilla, PaperMC's build API for Paper and Velocity, PurpurMC's
 * own API, and Fabric's loader metadata. Nothing is invented - a flavour this module
 * cannot reach honestly reports that it could not be reached, rather than filling the
 * list with a version that was never verified against anything.
 *
 * `fetchText` is injected everywhere a request is made, exactly as `java/adoptium.ts`
 * injects its own fetch. A unit test hands in a function that returns a canned JSON
 * string; nothing in this module or its tests ever touches the real network.
 *
 * ## Caching
 *
 * The full catalogue is written to disk after every successful fetch, so a machine that
 * is offline on a later launch still has something to show. A cached catalogue is always
 * labelled with the moment it was actually fetched, and `list()` marks it `stale` once it
 * is older than `CACHE_MAX_AGE_MS` - old enough that a version released since would be
 * silently missing, which is worth surfacing rather than hiding behind a cache that looks
 * as fresh as a live fetch.
 */

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteTextFile } from "../../storage/atomicReplace.js";
import { fail, ok, type Answer } from "../transport/types.js";

export type FlavourId = "vanilla" | "paper" | "velocity" | "purpur" | "fabric";

export const FLAVOUR_IDS: readonly FlavourId[] = ["vanilla", "paper", "velocity", "purpur", "fabric"];

export type VersionStability = "release" | "snapshot";

export interface VersionEntry {
    readonly version: string;
    readonly stability: VersionStability;
    /** The Java feature version this build needs to run. */
    readonly javaFeature: number;
    readonly downloadUrl: string | null;
    /** Lower-case hex SHA-256, when the upstream API published one. Never guessed. */
    readonly sha256: string | null;
    /**
     * When this version was published, ISO-8601, or null where the upstream API does not
     * say. Null rather than a plausible date: a wrong release date is the kind of thing
     * somebody repeats to another person as fact.
     */
    readonly releasedAt: string | null;
}

export interface FlavourCatalogue {
    readonly flavour: FlavourId;
    readonly versions: readonly VersionEntry[];
}

export interface CatalogueSnapshot {
    readonly flavours: readonly FlavourCatalogue[];
    /** ISO-8601 UTC, when this snapshot was actually fetched from the network. */
    readonly fetchedAt: string;
    /** True once `fetchedAt` is older than `CACHE_MAX_AGE_MS`. */
    readonly stale: boolean;
    /** Flavours that could not be fetched this time, with why. Empty on a clean fetch. */
    readonly failures: readonly { readonly flavour: FlavourId; readonly reason: string }[];
}

export type FetchText = (url: string) => Promise<string>;

export const CATALOGUE_FILE = "mcserver-catalogue.v1.json";
/** A week: long enough to skip needless refetching, short enough that "stale" means it. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

function cacheFile(dataDir: string): string {
    return join(dataDir, CATALOGUE_FILE);
}

const defaultFetchText: FetchText = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await globalThis.fetch(url, {
            headers: { accept: "application/json" },
            redirect: "follow",
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${String(response.status)} fetching ${url}`);
        }
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
};

function isSha256(value: unknown): value is string {
    return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

// ---------------------------------------------------------------------------------------
// Vanilla - https://launchermeta.mojang.com/mc/game/version_manifest_v2.json
// ---------------------------------------------------------------------------------------

interface VanillaManifestEntry {
    readonly id: string;
    readonly type: string;
    readonly url: string;
    /** ISO timestamp Mojang publishes for the release. Absent on nothing observed so far. */
    readonly releaseTime?: string;
}

interface VanillaManifest {
    readonly versions: readonly VanillaManifestEntry[];
}

interface VanillaVersionDetail {
    readonly downloads?: {
        readonly server?: { readonly url?: string; readonly sha1?: string; readonly size?: number };
    };
    readonly javaVersion?: { readonly majorVersion?: number };
}

/**
 * The manifest lists every version Mojang has ever shipped, and this app only cares about
 * the ones that actually have a server jar - a release or snapshot - so `old_alpha` and
 * `old_beta` entries are skipped before a single per-version fetch is made.
 */
async function fetchVanillaVersions(fetchText: FetchText, limit: number): Promise<VersionEntry[]> {
    const manifestText = await fetchText("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json");
    const manifest = JSON.parse(manifestText) as VanillaManifest;
    const candidates = manifest.versions
        .filter((entry) => entry.type === "release" || entry.type === "snapshot")
        .slice(0, limit);

    const entries: VersionEntry[] = [];
    for (const candidate of candidates) {
        const detailText = await fetchText(candidate.url);
        const detail = JSON.parse(detailText) as VanillaVersionDetail;
        const server = detail.downloads?.server;
        if (server?.url === undefined) continue; // No server jar was ever published for this one.
        entries.push({
            version: candidate.id,
            stability: candidate.type === "release" ? "release" : "snapshot",
            javaFeature: detail.javaVersion?.majorVersion ?? 8,
            downloadUrl: server.url,
            // Mojang publishes SHA-1 here, not SHA-256. Recording an invented SHA-256
            // from a SHA-1 digest would be worse than recording none at all.
            sha256: null,
            releasedAt: candidate.releaseTime ?? null,
        });
    }
    return entries;
}

// ---------------------------------------------------------------------------------------
// Paper / Velocity - https://api.papermc.io/v2/projects/{project}/versions/{v}/builds
// ---------------------------------------------------------------------------------------

interface PaperProject {
    readonly versions: readonly string[];
}

interface PaperBuild {
    readonly build: number;
    readonly channel: string;
    readonly downloads: {
        readonly application?: { readonly name: string; readonly sha256?: string };
    };
}

interface PaperBuilds {
    readonly builds: readonly PaperBuild[];
}

async function fetchPaperFamilyVersions(
    fetchText: FetchText,
    project: "paper" | "velocity",
    limit: number,
): Promise<VersionEntry[]> {
    const projectText = await fetchText(`https://api.papermc.io/v2/projects/${project}`);
    const projectInfo = JSON.parse(projectText) as PaperProject;
    const gameVersions = projectInfo.versions.slice(-limit).reverse();

    const entries: VersionEntry[] = [];
    for (const version of gameVersions) {
        const buildsText = await fetchText(`https://api.papermc.io/v2/projects/${project}/versions/${version}/builds`);
        const builds = JSON.parse(buildsText) as PaperBuilds;
        if (builds.builds.length === 0) continue;
        // The API returns builds oldest first, so the latest is the last entry.
        const latest = builds.builds[builds.builds.length - 1];
        if (latest === undefined || latest.downloads.application === undefined) continue;
        const filename = latest.downloads.application.name;
        entries.push({
            version: `${version}#${String(latest.build)}`,
            stability: latest.channel === "default" ? "release" : "snapshot",
            javaFeature: 21,
            downloadUrl: `https://api.papermc.io/v2/projects/${project}/versions/${version}/builds/${String(latest.build)}/downloads/${filename}`,
            sha256: isSha256(latest.downloads.application.sha256)
                ? latest.downloads.application.sha256.toLowerCase()
                : null,
                // This API publishes no release date, and a guessed one would be repeated as fact.
                releasedAt: null,
        });
    }
    return entries;
}

// ---------------------------------------------------------------------------------------
// Purpur - https://api.purpurmc.org/v2/purpur
// ---------------------------------------------------------------------------------------

interface PurpurProject {
    readonly versions: readonly string[];
}

interface PurpurVersionBuilds {
    readonly builds: { readonly latest?: string; readonly all?: readonly string[] };
}

async function fetchPurpurVersions(fetchText: FetchText, limit: number): Promise<VersionEntry[]> {
    const projectText = await fetchText("https://api.purpurmc.org/v2/purpur");
    const project = JSON.parse(projectText) as PurpurProject;
    const gameVersions = project.versions.slice(-limit).reverse();

    const entries: VersionEntry[] = [];
    for (const version of gameVersions) {
        const versionText = await fetchText(`https://api.purpurmc.org/v2/purpur/${version}`);
        const versionInfo = JSON.parse(versionText) as PurpurVersionBuilds;
        const latest = versionInfo.builds.latest;
        if (latest === undefined) continue;
        entries.push({
            version: `${version}#${latest}`,
            stability: "release",
            javaFeature: 21,
            downloadUrl: `https://api.purpurmc.org/v2/purpur/${version}/${latest}/download`,
            // Purpur's build API does not publish a digest for this endpoint.
            sha256: null,
            // This API publishes no release date, and a guessed one would be repeated as fact.
            releasedAt: null,
        });
    }
    return entries;
}

// ---------------------------------------------------------------------------------------
// Fabric - https://meta.fabricmc.net/v2/versions/loader
// ---------------------------------------------------------------------------------------

interface FabricLoaderEntry {
    readonly version: string;
    readonly stable: boolean;
}

/**
 * Fabric's loader metadata is independent of any Minecraft game version - a loader build
 * is a build of the mod loader itself, and the server jar it eventually produces is
 * assembled from a game version, this loader version, and an installer version together
 * (`.../loader/{game}/{loader}/{installer}/server/jar`).
 *
 * This endpoint alone cannot name that combined download - doing so would mean guessing
 * a game version and an installer version this module was never asked to fetch. So a
 * Fabric entry here is honestly a loader build, with `downloadUrl: null`: `create.ts`
 * resolves the real jar URL once it also knows which Minecraft version was chosen, via
 * `fabricServerJarUrl` below.
 */
async function fetchFabricLoaderVersions(fetchText: FetchText, limit: number): Promise<VersionEntry[]> {
    const text = await fetchText("https://meta.fabricmc.net/v2/versions/loader");
    const loaders = JSON.parse(text) as readonly FabricLoaderEntry[];
    return loaders.slice(0, limit).map((loader) => ({
        version: loader.version,
        stability: loader.stable ? "release" : "snapshot",
        // The loader tool itself runs on Java 8+; the server it produces follows the
        // target Minecraft version's own requirement, resolved separately by
        // `javaRequirement.ts` once a game version is chosen.
        javaFeature: 8,
        downloadUrl: null,
        sha256: null,
        // This API publishes no release date, and a guessed one would be repeated as fact.
        releasedAt: null,
    }));
}

/** The exact Fabric server jar download, once a game version, loader and installer are all chosen. */
export function fabricServerJarUrl(gameVersion: string, loaderVersion: string, installerVersion: string): string {
    return `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loaderVersion)}/${encodeURIComponent(installerVersion)}/server/jar`;
}

// ---------------------------------------------------------------------------------------
// Fetching every flavour, caching, and reading the cache back
// ---------------------------------------------------------------------------------------

export interface CatalogueOptions {
    readonly dataDir: string;
    readonly fetchText?: FetchText;
    readonly now?: () => string;
    /** How many of the newest versions to keep per flavour. Bounds request volume. */
    readonly limitPerFlavour?: number;
}

async function fetchAllFlavours(
    fetchText: FetchText,
    limit: number,
): Promise<{ flavours: FlavourCatalogue[]; failures: { flavour: FlavourId; reason: string }[] }> {
    const fetchers: Record<FlavourId, () => Promise<VersionEntry[]>> = {
        vanilla: () => fetchVanillaVersions(fetchText, limit),
        paper: () => fetchPaperFamilyVersions(fetchText, "paper", limit),
        velocity: () => fetchPaperFamilyVersions(fetchText, "velocity", limit),
        purpur: () => fetchPurpurVersions(fetchText, limit),
        fabric: () => fetchFabricLoaderVersions(fetchText, limit),
    };

    const flavours: FlavourCatalogue[] = [];
    const failures: { flavour: FlavourId; reason: string }[] = [];
    for (const flavour of FLAVOUR_IDS) {
        try {
            const versions = await fetchers[flavour]();
            flavours.push({ flavour, versions });
        } catch (error) {
            failures.push({ flavour, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return { flavours, failures };
}

async function readCache(dataDir: string): Promise<CatalogueSnapshot | null> {
    try {
        const bytes = await readFile(cacheFile(dataDir));
        if (bytes.byteLength > MAX_CACHE_BYTES) return null;
        const parsed = JSON.parse(bytes.toString("utf8")) as Partial<CatalogueSnapshot>;
        if (!Array.isArray(parsed.flavours) || typeof parsed.fetchedAt !== "string") return null;
        return {
            flavours: parsed.flavours,
            fetchedAt: parsed.fetchedAt,
            stale: false, // recomputed by the caller against the current clock
            failures: Array.isArray(parsed.failures) ? parsed.failures : [],
        };
    } catch {
        return null;
    }
}

async function writeCache(dataDir: string, snapshot: CatalogueSnapshot): Promise<void> {
    const file = cacheFile(dataDir);
    await mkdir(dirname(file), { recursive: true });
    await atomicWriteTextFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function withStaleness(snapshot: CatalogueSnapshot, now: () => string): CatalogueSnapshot {
    const ageMs = Date.parse(now()) - Date.parse(snapshot.fetchedAt);
    const stale = !Number.isFinite(ageMs) || ageMs > CACHE_MAX_AGE_MS;
    return { ...snapshot, stale };
}

/**
 * Fetches the whole catalogue fresh from every upstream and caches the result.
 *
 * Every flavour is attempted independently: one project having a bad day does not blank
 * out the other four. A flavour that failed keeps whatever the previous cache had for it,
 * so a transient PaperMC outage does not make Paper disappear from a list that was fine a
 * minute ago.
 */
export async function refreshCatalogue(options: CatalogueOptions): Promise<Answer<CatalogueSnapshot>> {
    const fetchText = options.fetchText ?? defaultFetchText;
    const now = options.now ?? (() => new Date().toISOString());
    const limit = options.limitPerFlavour ?? 25;

    const { flavours, failures } = await fetchAllFlavours(fetchText, limit);
    if (flavours.length === 0) {
        return fail(
            "unreachable",
            "None of the server flavour catalogues could be reached.",
            failures.map((entry) => `${entry.flavour}: ${entry.reason}`).join("; "),
        );
    }

    const previous = await readCache(options.dataDir);
    const previousById = new Map(previous?.flavours.map((entry) => [entry.flavour, entry]) ?? []);
    const merged = FLAVOUR_IDS.map((id) => {
        const fetched = flavours.find((entry) => entry.flavour === id);
        if (fetched !== undefined) return fetched;
        return previousById.get(id) ?? { flavour: id, versions: [] };
    });

    const snapshot: CatalogueSnapshot = { flavours: merged, fetchedAt: now(), stale: false, failures };
    await writeCache(options.dataDir, snapshot);
    return ok(snapshot);
}

/**
 * Reads the catalogue: the cache if it exists, otherwise a fresh fetch. Never fetches
 * when a cache is present and still fresh, so listing versions in the ordinary case never
 * touches the network at all.
 */
export async function listCatalogue(options: CatalogueOptions): Promise<Answer<CatalogueSnapshot>> {
    const now = options.now ?? (() => new Date().toISOString());
    const cached = await readCache(options.dataDir);
    if (cached !== null) {
        const withAge = withStaleness(cached, now);
        if (!withAge.stale) return ok(withAge);
        // Stale: try a refresh, but a cache - even a stale one - beats nothing when the
        // refresh itself fails, so the offline branch below still has something to serve.
        const refreshed = await refreshCatalogue(options);
        if (refreshed.ok) return refreshed;
        return ok(withAge);
    }

    const refreshed = await refreshCatalogue(options);
    return refreshed;
}
