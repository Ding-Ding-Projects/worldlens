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

import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteTextFile } from "../../storage/atomicReplace.js";
import { fail, ok, type Answer } from "../transport/types.js";

export type FlavourId = "vanilla" | "paper" | "velocity" | "purpur" | "fabric";

export const FLAVOUR_IDS: readonly FlavourId[] = [
    "vanilla",
    "paper",
    "velocity",
    "purpur",
    "fabric",
];

export type VersionStability = "release" | "snapshot";
export type WikiArticleState = "verified" | "unavailable" | "offline-unverified";

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
    /** The UI can show a safe action even when the article has not been checked online. */
    readonly wikiState?: WikiArticleState;
    readonly availability?: "available" | "missing-server-artifact";
    readonly availabilityReason?: string;
}

export interface FlavourCatalogue {
    readonly flavour: FlavourId;
    readonly versions: readonly VersionEntry[];
    /** Present when this flavour was reused after its own refresh failed. */
    readonly stale?: boolean;
    readonly lastFetchedAt?: string;
    readonly failure?: string;
}

export interface CatalogueSnapshot {
    readonly flavours: readonly FlavourCatalogue[];
    /** ISO-8601 UTC, when this snapshot was actually fetched from the network. */
    readonly fetchedAt: string;
    /** True once `fetchedAt` is older than `CACHE_MAX_AGE_MS`. */
    readonly stale: boolean;
    /** Flavours that could not be fetched this time, with why. Empty on a clean fetch. */
    readonly failures: readonly { readonly flavour: FlavourId; readonly reason: string }[];
    /** SHA-256 of Mojang's canonical manifest, or null when the refresh had no manifest. */
    readonly sourceRevision?: string | null;
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
export const CATALOGUE_CACHE_SHAPE = 3;
/** A week: long enough to skip needless refetching, short enough that "stale" means it. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_VERSION_DETAIL_BYTES = 512 * 1024;
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
            redirect: "error",
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${String(response.status)} fetching ${url}`);
        }
        const advertisedLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(advertisedLength) && advertisedLength > MAX_RESPONSE_BYTES) {
            throw new Error(
                `Response from ${url} is larger than the ${MAX_RESPONSE_BYTES} byte limit.`,
            );
        }
        if (response.body === null) return await response.text();
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            total += next.value.byteLength;
            if (total > MAX_RESPONSE_BYTES) {
                await reader.cancel();
                throw new Error(
                    `Response from ${url} is larger than the ${MAX_RESPONSE_BYTES} byte limit.`,
                );
            }
            chunks.push(next.value);
        }
        return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
    } finally {
        clearTimeout(timer);
    }
};

function boundedJson(text: string, url: string, limit = MAX_RESPONSE_BYTES): unknown {
    if (Buffer.byteLength(text, "utf8") > limit) {
        throw new Error(`Response from ${url} is larger than the ${limit} byte limit.`);
    }
    try {
        return JSON.parse(text) as unknown;
    } catch (error) {
        throw new Error(
            `Response from ${url} was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpsUrl(value: unknown, label: string): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
        throw new Error(`${label} is missing or too long.`);
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${label} is not a valid URL.`);
    }
    if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
    return parsed.toString();
}

function isoTimestamp(value: unknown): value is string {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateCachedFlavours(value: unknown): FlavourCatalogue[] | null {
    if (!Array.isArray(value)) return null;
    const seenFlavours = new Set<string>();
    const output: FlavourCatalogue[] = [];
    for (const rawFlavour of value) {
        if (!isRecord(rawFlavour) || typeof rawFlavour.flavour !== "string") return null;
        if (!(FLAVOUR_IDS as readonly string[]).includes(rawFlavour.flavour)) return null;
        if (seenFlavours.has(rawFlavour.flavour)) return null;
        seenFlavours.add(rawFlavour.flavour);
        if (!Array.isArray(rawFlavour.versions)) return null;
        const seenVersions = new Set<string>();
        const versions: VersionEntry[] = [];
        for (const rawVersion of rawFlavour.versions) {
            if (!isRecord(rawVersion)) return null;
            if (
                !("downloadUrl" in rawVersion) ||
                !("sha256" in rawVersion) ||
                !("releasedAt" in rawVersion)
            )
                return null;
            if (
                typeof rawVersion.version !== "string" ||
                rawVersion.version.length === 0 ||
                rawVersion.version.length > 128
            )
                return null;
            if (seenVersions.has(rawVersion.version)) return null;
            seenVersions.add(rawVersion.version);
            if (rawVersion.stability !== "release" && rawVersion.stability !== "snapshot")
                return null;
            if (
                typeof rawVersion.javaFeature !== "number" ||
                !Number.isInteger(rawVersion.javaFeature) ||
                rawVersion.javaFeature < 1 ||
                rawVersion.javaFeature > 100
            )
                return null;
            if (rawVersion.downloadUrl !== null && typeof rawVersion.downloadUrl !== "string")
                return null;
            if (rawVersion.downloadUrl !== null) {
                try {
                    httpsUrl(
                        rawVersion.downloadUrl,
                        `Cached download URL for ${rawVersion.version}`,
                    );
                } catch {
                    return null;
                }
            }
            if (
                rawVersion.sha256 !== null &&
                rawVersion.sha256 !== undefined &&
                !isSha256(rawVersion.sha256)
            )
                return null;
            if (
                rawVersion.releasedAt !== null &&
                rawVersion.releasedAt !== undefined &&
                !isoTimestamp(rawVersion.releasedAt)
            )
                return null;
            if (
                rawVersion.wikiState !== undefined &&
                !["verified", "unavailable", "offline-unverified"].includes(
                    String(rawVersion.wikiState),
                )
            )
                return null;
            if (
                rawVersion.availability !== undefined &&
                rawVersion.availability !== "available" &&
                rawVersion.availability !== "missing-server-artifact"
            )
                return null;
            if (
                rawVersion.availability === "missing-server-artifact" &&
                (typeof rawVersion.availabilityReason !== "string" ||
                    rawVersion.availabilityReason.length === 0)
            )
                return null;
            if (
                rawVersion.availabilityReason !== undefined &&
                typeof rawVersion.availabilityReason !== "string"
            )
                return null;
            versions.push(rawVersion as unknown as VersionEntry);
        }
        if (rawFlavour.stale !== undefined && typeof rawFlavour.stale !== "boolean") return null;
        if (rawFlavour.lastFetchedAt !== undefined && !isoTimestamp(rawFlavour.lastFetchedAt))
            return null;
        if (rawFlavour.failure !== undefined && typeof rawFlavour.failure !== "string") return null;
        const stale = rawFlavour.stale;
        const lastFetchedAt = rawFlavour.lastFetchedAt;
        const failure = rawFlavour.failure;
        output.push({
            flavour: rawFlavour.flavour as FlavourId,
            versions,
            ...(typeof stale === "boolean" ? { stale } : {}),
            ...(typeof lastFetchedAt === "string" ? { lastFetchedAt } : {}),
            ...(typeof failure === "string" ? { failure } : {}),
        });
    }
    if (seenFlavours.size !== FLAVOUR_IDS.length) return null;
    return output;
}

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

interface FetchFlavourResult {
    readonly versions: readonly VersionEntry[];
    readonly sourceRevision?: string;
}

/**
 * The manifest lists every version Mojang has ever shipped, and this app only cares about
 * the ones that actually have a server jar - a release or snapshot - so `old_alpha` and
 * `old_beta` entries are skipped before a single per-version fetch is made.
 */
async function fetchVanillaVersions(
    fetchText: FetchText,
    limit: number,
): Promise<FetchFlavourResult> {
    void limit;
    const manifestUrl = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
    const manifestText = await fetchText(manifestUrl);
    const rawManifest = boundedJson(manifestText, manifestUrl);
    if (!isRecord(rawManifest) || !Array.isArray(rawManifest.versions)) {
        throw new Error("Mojang's version manifest did not contain a versions array.");
    }
    const manifest = rawManifest as unknown as VanillaManifest;
    const candidates = manifest.versions.filter((entry) => {
        if (!isRecord(entry)) return false;
        return (
            (entry.type === "release" || entry.type === "snapshot") &&
            typeof entry.id === "string" &&
            entry.id.length > 0 &&
            entry.id.length <= 64
        );
    });

    const entries: VersionEntry[] = [];
    for (const candidate of candidates) {
        const detailUrl = httpsUrl(candidate.url, `Mojang detail URL for ${candidate.id}`);
        const detailText = await fetchText(detailUrl);
        const detailValue = boundedJson(detailText, detailUrl, MAX_VERSION_DETAIL_BYTES);
        if (!isRecord(detailValue))
            throw new Error(`Mojang detail for ${candidate.id} was not an object.`);
        if (detailValue.downloads !== undefined && !isRecord(detailValue.downloads))
            throw new Error(`Mojang detail for ${candidate.id} had malformed downloads metadata.`);
        const downloads = detailValue.downloads as Record<string, unknown> | undefined;
        if (downloads?.server !== undefined && !isRecord(downloads.server))
            throw new Error(`Mojang detail for ${candidate.id} had malformed server metadata.`);
        const server = downloads?.server as Record<string, unknown> | undefined;
        if (server?.url !== undefined && typeof server.url !== "string")
            throw new Error(`Mojang detail for ${candidate.id} had malformed server URL.`);
        const javaMetadata = detailValue.javaVersion;
        if (javaMetadata !== undefined && !isRecord(javaMetadata))
            throw new Error(`Mojang detail for ${candidate.id} had malformed Java metadata.`);
        if (
            isRecord(javaMetadata) &&
            javaMetadata.majorVersion !== undefined &&
            (!Number.isInteger(javaMetadata.majorVersion) ||
                javaMetadata.majorVersion < 1 ||
                javaMetadata.majorVersion > 100)
        )
            throw new Error(
                `Mojang detail for ${candidate.id} had malformed Java feature metadata.`,
            );
        const javaFeature =
            isRecord(javaMetadata) && typeof javaMetadata.majorVersion === "number"
                ? javaMetadata.majorVersion
                : 8;
        const downloadUrl =
            server?.url === undefined
                ? null
                : httpsUrl(server.url, `Server download URL for ${candidate.id}`);
        entries.push({
            version: candidate.id,
            stability: candidate.type === "release" ? "release" : "snapshot",
            javaFeature,
            downloadUrl,
            // Mojang publishes SHA-1 here, not SHA-256. Recording an invented SHA-256
            // from a SHA-1 digest would be worse than recording none at all.
            sha256: null,
            releasedAt:
                candidate.releaseTime === undefined
                    ? null
                    : isoTimestamp(candidate.releaseTime)
                      ? candidate.releaseTime
                      : (() => {
                            throw new Error(
                                `Mojang manifest release time for ${candidate.id} was malformed.`,
                            );
                        })(),
            ...(downloadUrl === null
                ? {
                      availability: "missing-server-artifact" as const,
                      availabilityReason:
                          "Mojang published no server download for this exact version.",
                  }
                : {}),
        });
    }
    return {
        versions: entries,
        sourceRevision: createHash("sha256").update(manifestText, "utf8").digest("hex"),
    };
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
    readonly downloads?: Record<
        string,
        | {
              readonly name?: string;
              readonly url?: string;
              readonly checksums?: { readonly sha256?: string };
          }
        | undefined
    >;
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
    limit: number,
): Promise<VersionEntry[]> {
    const projectUrl = `https://fill.papermc.io/v3/projects/${project}`;
    const projectText = await fetchText(projectUrl);
    const rawProject = boundedJson(projectText, projectUrl);
    if (!isRecord(rawProject) || !isRecord(rawProject.versions)) {
        throw new Error(`PaperMC ${project} response did not contain a versions object.`);
    }
    const projectInfo = rawProject as unknown as PaperProjectV3;
    const gameVersions = paperVersionsNewestFirst(projectInfo).slice(0, limit);

    const entries: VersionEntry[] = [];
    for (const version of gameVersions) {
        const buildsUrl = `https://fill.papermc.io/v3/projects/${project}/versions/${encodeURIComponent(version)}/builds`;
        const buildsText = await fetchText(buildsUrl);
        const rawBuilds = boundedJson(buildsText, buildsUrl);
        if (!Array.isArray(rawBuilds))
            throw new Error(`PaperMC ${project} builds response was not an array.`);
        if (
            rawBuilds.some(
                (build) =>
                    !isRecord(build) || typeof build.id !== "number" || !Number.isInteger(build.id),
            )
        ) {
            throw new Error(
                `PaperMC ${project} builds response contained an invalid build record.`,
            );
        }
        const builds = rawBuilds as readonly PaperBuildV3[];
        // v3 returns builds newest first, the opposite of v2. Reading the last entry here
        // would quietly offer the oldest build of every version.
        const latest = Array.isArray(builds) ? builds[0] : undefined;
        if (latest === undefined) continue;

        // The server jar is published under this key; anything else is a different artifact.
        const download = latest.downloads?.["server:default"];
        if (download?.url === undefined) continue;
        const downloadUrl = httpsUrl(
            download.url,
            `PaperMC ${project} download URL for ${version}`,
        );

        entries.push({
            version: `${version}#${String(latest.id)}`,
            // Upstream says STABLE for a finished build and names a channel otherwise.
            stability: (latest.channel ?? "").toUpperCase() === "STABLE" ? "release" : "snapshot",
            javaFeature: 21,
            downloadUrl,
            sha256: isSha256(download.checksums?.sha256)
                ? download.checksums.sha256.toLowerCase()
                : null,
            releasedAt: latest.time ?? null,
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
    const projectUrl = "https://api.purpurmc.org/v2/purpur";
    const projectText = await fetchText(projectUrl);
    const rawProject = boundedJson(projectText, projectUrl);
    if (
        !isRecord(rawProject) ||
        !Array.isArray(rawProject.versions) ||
        rawProject.versions.some((version) => typeof version !== "string")
    ) {
        throw new Error("Purpur response did not contain a versions array of strings.");
    }
    const project = rawProject as unknown as PurpurProject;
    const gameVersions = project.versions.slice(-limit).reverse();

    const entries: VersionEntry[] = [];
    for (const version of gameVersions) {
        const versionUrl = `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}`;
        const versionText = await fetchText(versionUrl);
        const rawVersion = boundedJson(versionText, versionUrl);
        if (
            !isRecord(rawVersion) ||
            !isRecord(rawVersion.builds) ||
            (rawVersion.builds.latest !== undefined && typeof rawVersion.builds.latest !== "string")
        )
            throw new Error(`Purpur response for ${version} did not contain builds.`);
        const versionInfo = rawVersion as unknown as PurpurVersionBuilds;
        const latest = versionInfo.builds.latest;
        if (latest === undefined) continue;
        entries.push({
            version: `${version}#${latest}`,
            stability: "release",
            javaFeature: 21,
            downloadUrl: httpsUrl(
                `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}/${encodeURIComponent(latest)}/download`,
                `Purpur download URL for ${version}`,
            ),
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
async function fetchFabricLoaderVersions(
    fetchText: FetchText,
    limit: number,
): Promise<VersionEntry[]> {
    const url = "https://meta.fabricmc.net/v2/versions/loader";
    const text = await fetchText(url);
    const rawLoaders = boundedJson(text, url);
    if (
        !Array.isArray(rawLoaders) ||
        rawLoaders.some(
            (loader) =>
                !isRecord(loader) ||
                typeof loader.version !== "string" ||
                typeof loader.stable !== "boolean",
        )
    ) {
        throw new Error("Fabric response was not an array of loader records.");
    }
    const loaders = rawLoaders as readonly FabricLoaderEntry[];
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
export function fabricServerJarUrl(
    gameVersion: string,
    loaderVersion: string,
    installerVersion: string,
): string {
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
): Promise<{
    flavours: FlavourCatalogue[];
    failures: { flavour: FlavourId; reason: string }[];
    sourceRevision: string | null;
}> {
    const fetchers: Record<FlavourId, () => Promise<FetchFlavourResult>> = {
        vanilla: () => fetchVanillaVersions(fetchText, limit),
        paper: async () => ({
            versions: await fetchPaperFamilyVersions(fetchText, "paper", limit),
        }),
        velocity: async () => ({
            versions: await fetchPaperFamilyVersions(fetchText, "velocity", limit),
        }),
        purpur: async () => ({ versions: await fetchPurpurVersions(fetchText, limit) }),
        fabric: async () => ({ versions: await fetchFabricLoaderVersions(fetchText, limit) }),
    };

    const flavours: FlavourCatalogue[] = [];
    const failures: { flavour: FlavourId; reason: string }[] = [];
    let sourceRevision: string | null = null;
    for (const flavour of FLAVOUR_IDS) {
        try {
            const result = await fetchers[flavour]();
            flavours.push({ flavour, versions: result.versions });
            if (flavour === "vanilla") sourceRevision = result.sourceRevision ?? null;
        } catch (error) {
            failures.push({
                flavour,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return { flavours, failures, sourceRevision };
}

async function readCache(dataDir: string): Promise<CatalogueSnapshot | null> {
    try {
        const bytes = await readFile(cacheFile(dataDir));
        if (bytes.byteLength > MAX_CACHE_BYTES) return null;
        const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
        if (!isRecord(parsed) || !isoTimestamp(parsed.fetchedAt)) return null;
        // An older shape is refused rather than upgraded in place: guessing what a missing
        // field should have been is how a wrong release date would get invented.
        if (parsed.shape !== CATALOGUE_CACHE_SHAPE) return null;
        const flavours = validateCachedFlavours(parsed.flavours);
        if (flavours === null) return null;
        if (!Array.isArray(parsed.failures)) return null;
        const failures = parsed.failures.filter(
            (entry): entry is { flavour: FlavourId; reason: string } =>
                isRecord(entry) &&
                typeof entry.flavour === "string" &&
                (FLAVOUR_IDS as readonly string[]).includes(entry.flavour) &&
                typeof entry.reason === "string",
        );
        if (failures.length !== parsed.failures.length) return null;
        if (typeof parsed.sourceRevision !== "string" && parsed.sourceRevision !== null)
            return null;
        if (typeof parsed.sourceRevision === "string" && !isSha256(parsed.sourceRevision))
            return null;
        return {
            flavours,
            fetchedAt: parsed.fetchedAt,
            stale: false, // recomputed by the caller against the current clock
            failures,
            sourceRevision:
                typeof parsed.sourceRevision === "string" ? parsed.sourceRevision : null,
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
export async function refreshCatalogue(
    options: CatalogueOptions,
): Promise<Answer<CatalogueSnapshot>> {
    const sourceFetchText = options.fetchText ?? defaultFetchText;
    const fetchText: FetchText = async (url) => {
        const text = await sourceFetchText(url);
        if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
            throw new Error(
                `Response from ${url} is larger than the ${MAX_RESPONSE_BYTES} byte limit.`,
            );
        }
        return text;
    };
    const now = options.now ?? (() => new Date().toISOString());
    const limit = options.limitPerFlavour ?? 25;

    const { flavours, failures, sourceRevision } = await fetchAllFlavours(fetchText, limit);
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
        const previousEntry = previousById.get(id);
        const failure = failures.find((entry) => entry.flavour === id)?.reason;
        if (previousEntry !== undefined) {
            return {
                ...previousEntry,
                stale: true,
                ...(previous?.fetchedAt === undefined ? {} : { lastFetchedAt: previous.fetchedAt }),
                ...(failure === undefined ? {} : { failure }),
            };
        }
        return {
            flavour: id,
            versions: [],
            stale: true,
            ...(failure === undefined ? {} : { failure }),
        };
    });

    const snapshot: CatalogueSnapshot = {
        flavours: merged,
        fetchedAt: now(),
        stale: false,
        failures,
        sourceRevision,
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
