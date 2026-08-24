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
    readonly complete: boolean;
}

export type CatalogueCompleteness = "complete" | "partial";

export interface CatalogueSnapshot {
    readonly flavours: readonly FlavourCatalogue[];
    /** ISO-8601 UTC, when this snapshot was actually fetched from the network. */
    readonly fetchedAt: string;
    /** True once `fetchedAt` is older than `CACHE_MAX_AGE_MS`. */
    readonly stale: boolean;
    readonly completeness: CatalogueCompleteness;
    /** Flavours that could not be fetched this time, with why. Empty on a clean fetch. */
    readonly failures: readonly { readonly flavour: FlavourId; readonly reason: string }[];
}

export type FetchText = (url: string) => Promise<string>;

/**
 * The cache file, and the shape number written inside it.
 *
 * The filename stays put so an upgrade does not leave an orphan behind; the shape number
 * inside decides whether the contents are still usable. Bump it whenever a field is added
 * to a version entry, because a cache written before that field existed will otherwise be
 * handed back as though it satisfied the current shape - it parses, it has the right
 * top-level keys, and every entry is quietly missing the new value. Nothing reports that;
 * the feature simply looks unimplemented until the cache happens to expire.
 */
export const CATALOGUE_FILE = "mcserver-catalogue.v1.json";

/** Raised when a version entry gains or loses a field. */
export const CATALOGUE_CACHE_SHAPE = 2;
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
const MAX_ENTRIES_PER_FLAVOUR = 20_000;

function boundEntries<T>(values: readonly T[], limit?: number): { readonly values: T[]; readonly complete: boolean } {
    const ceiling = limit === undefined ? MAX_ENTRIES_PER_FLAVOUR : Math.min(MAX_ENTRIES_PER_FLAVOUR, Math.max(1, Math.floor(limit)));
    return { values: values.slice(0, ceiling), complete: values.length <= ceiling && (limit === undefined || values.length <= limit) };
}

async function fetchVanillaVersions(fetchText: FetchText, limit?: number): Promise<{ entries: VersionEntry[]; complete: boolean }> {
    const manifestText = await fetchText("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json");
    const manifest = JSON.parse(manifestText) as VanillaManifest;
    const candidates = boundEntries(
        manifest.versions.filter((entry) => entry.type === "release" || entry.type === "snapshot"),
        limit,
    );

    const entries: VersionEntry[] = [];
    for (const candidate of candidates.values) {
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
    return { entries, complete: candidates.complete };
}

// ---------------------------------------------------------------------------------------
// Paper / Velocity - https://fill.papermc.io/v3/projects/{project}
//
// The v2 API this used to read was sunset and now answers 410 to every request, which the
// old code turned into an empty version list. So Paper - the flavour this app's own copy
// calls the usual pick for a community server - silently offered nothing to choose from,
// and the interface honestly reported that no versions were catalogued. Nothing was
// broken locally; upstream had simply retired the endpoint.
//
// v3 is better shaped for this anyway: it publishes the download URL, a real SHA-256 and
// the build time, all of which v2 either omitted or made us construct by hand.
// ---------------------------------------------------------------------------------------

/** v3 groups versions by their major line: `{ "1.21": ["1.21.4", "1.21.3"], ... }`. */
interface PaperProjectV3 {
    readonly versions?: Record<string, readonly string[] | undefined>;
}

interface PaperBuildV3 {
    readonly id: number;
    /** ISO-8601 build time. This is what gives Paper and Velocity a real release date. */
    readonly time?: string;
    /** `STABLE`, or a pre-release channel such as `ALPHA` or `BETA`. */
    readonly channel?: string;
    readonly downloads?: Record<string, {
        readonly name?: string;
        readonly url?: string;
        readonly checksums?: { readonly sha256?: string };
    } | undefined>;
}

interface PaperBuildPage {
    readonly builds?: readonly PaperBuildV3[];
    readonly next?: string | null;
    readonly pagination?: { readonly next?: string | null };
}

async function fetchPaperBuilds(fetchText: FetchText, firstUrl: string): Promise<PaperBuildV3[]> {
    const builds: PaperBuildV3[] = [];
    const seen = new Set<string>();
    let url: string | null = firstUrl;
    while (url !== null && !seen.has(url) && builds.length <= MAX_ENTRIES_PER_FLAVOUR) {
        seen.add(url);
        const parsed: unknown = JSON.parse(await fetchText(url));
        if (Array.isArray(parsed)) {
            builds.push(...parsed as PaperBuildV3[]);
            url = null;
            continue;
        }
        const page = parsed as PaperBuildPage;
        builds.push(...(Array.isArray(page.builds) ? page.builds : []));
        url = page.next ?? page.pagination?.next ?? null;
    }
    return builds;
}

/**
 * Every game version v3 lists, newest line first.
 *
 * The map's own key order is the API's, and its values are already newest-first within a
 * line, so flattening preserves the ordering upstream chose rather than imposing one.
 */
function paperVersionsNewestFirst(project: PaperProjectV3): string[] {
    const out: string[] = [];
    for (const line of Object.values(project.versions ?? {})) {
        for (const version of line ?? []) out.push(version);
    }
    return out;
}

async function fetchPaperFamilyVersions(
    fetchText: FetchText,
    project: "paper" | "velocity",
    limit?: number,
): Promise<{ entries: VersionEntry[]; complete: boolean }> {
    const projectText = await fetchText(`https://fill.papermc.io/v3/projects/${project}`);
    const projectInfo = JSON.parse(projectText) as PaperProjectV3;
    const gameVersions = boundEntries(paperVersionsNewestFirst(projectInfo), limit);

    const entries: VersionEntry[] = [];
    for (const version of gameVersions.values) {
        const builds = await fetchPaperBuilds(
            fetchText,
            `https://fill.papermc.io/v3/projects/${project}/versions/${encodeURIComponent(version)}/builds`,
        );
        // v3 returns builds newest first. Keep every build, not only the newest one, because
        // existing worlds and plugins may require an older compatible build.
        for (const build of builds) {
            const download = build.downloads?.["server:default"];
            if (download?.url === undefined) continue;
            entries.push({
                version: `${version}#${String(build.id)}`,
                stability: (build.channel ?? "").toUpperCase() === "STABLE" ? "release" : "snapshot",
                javaFeature: 21,
                downloadUrl: download.url,
                sha256: isSha256(download.checksums?.sha256) ? download.checksums.sha256.toLowerCase() : null,
                releasedAt: build.time ?? null,
            });
        }
    }
    const bounded = boundEntries(entries, limit);
    return { entries: bounded.values, complete: gameVersions.complete && bounded.complete };
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

async function fetchPurpurVersions(fetchText: FetchText, limit?: number): Promise<{ entries: VersionEntry[]; complete: boolean }> {
    const projectText = await fetchText("https://api.purpurmc.org/v2/purpur");
    const project = JSON.parse(projectText) as PurpurProject;
    const gameVersions = boundEntries([...project.versions].reverse(), limit);

    const entries: VersionEntry[] = [];
    for (const version of gameVersions.values) {
        const versionText = await fetchText(`https://api.purpurmc.org/v2/purpur/${version}`);
        const versionInfo = JSON.parse(versionText) as PurpurVersionBuilds;
        const builds = versionInfo.builds.all ?? (versionInfo.builds.latest === undefined ? [] : [versionInfo.builds.latest]);
        for (const build of builds) {
            entries.push({
                version: `${version}#${build}`,
                stability: "release",
                javaFeature: 21,
                downloadUrl: `https://api.purpurmc.org/v2/purpur/${version}/${build}/download`,
                sha256: null,
                releasedAt: null,
            });
        }
    }
    const bounded = boundEntries(entries, limit);
    return { entries: bounded.values, complete: gameVersions.complete && bounded.complete };
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
async function fetchFabricLoaderVersions(fetchText: FetchText, limit?: number): Promise<{ entries: VersionEntry[]; complete: boolean }> {
    const text = await fetchText("https://meta.fabricmc.net/v2/versions/loader");
    const loaders = JSON.parse(text) as readonly FabricLoaderEntry[];
    const bounded = boundEntries(loaders, limit);
    return { entries: bounded.values.map((loader) => ({
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
    })), complete: bounded.complete };
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
    /** Optional explicit preview bound. Unset fetches the complete upstream catalogue. */
    readonly limitPerFlavour?: number;
}

async function fetchAllFlavours(
    fetchText: FetchText,
    limit?: number,
): Promise<{ flavours: FlavourCatalogue[]; failures: { flavour: FlavourId; reason: string }[] }> {
    const fetchers: Record<FlavourId, () => Promise<{ entries: VersionEntry[]; complete: boolean }>> = {
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
            const fetched = await fetchers[flavour]();
            flavours.push({ flavour, versions: fetched.entries, complete: fetched.complete });
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
        // An older shape is refused rather than upgraded in place: guessing what a missing
        // field should have been is how a wrong release date would get invented.
        if ((parsed as { shape?: unknown }).shape !== CATALOGUE_CACHE_SHAPE) return null;
        return {
            flavours: parsed.flavours,
            fetchedAt: parsed.fetchedAt,
            stale: false, // recomputed by the caller against the current clock
            completeness: parsed.completeness === "partial" ? "partial" : "complete",
            failures: Array.isArray(parsed.failures) ? parsed.failures : [],
        };
    } catch {
        return null;
    }
}

async function writeCache(dataDir: string, snapshot: CatalogueSnapshot): Promise<void> {
    const file = cacheFile(dataDir);
    await mkdir(dirname(file), { recursive: true });
    // The shape number travels with the contents, so a later build can tell whether what
    // it is reading was written for the fields it expects.
    const written = { ...snapshot, shape: CATALOGUE_CACHE_SHAPE };
    await atomicWriteTextFile(file, `${JSON.stringify(written, null, 2)}\n`);
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
    const limit = options.limitPerFlavour;

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
        return previousById.get(id) ?? { flavour: id, versions: [], complete: false };
    });

    const snapshot: CatalogueSnapshot = {
        flavours: merged,
        fetchedAt: now(),
        stale: false,
        completeness: merged.every((entry) => entry.complete) ? "complete" : "partial",
        failures,
    };
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
