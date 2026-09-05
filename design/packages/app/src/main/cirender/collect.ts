/**
 * Fetching the map a finished run produced, and registering it as a local render.
 *
 * This is the last third of the loop and the only part that writes a map onto this
 * computer, so everything it refuses, it refuses *before* anything is mounted. A CI render
 * that half-worked must never leave something in the map list that opens to an empty
 * world; the failure it would be mistaken for - "the render came out blank" - is one
 * nobody could diagnose without knowing this code exists.
 *
 * ## Reusing the download surface rather than writing a second one
 *
 * The transfer is `download/http.ts`'s {@link downloadToFile}, which resumes an
 * interrupted attempt from a `Range` request, and the unpack is `download/extract.ts`'s
 * {@link extractZip}, which already carries the path-traversal defences. An Actions
 * artifact is not a release asset, so `ReleaseDownloader` itself cannot be pointed at one
 * - but its two primitives can, and that is the difference between reusing the download
 * surface and building a second one beside it.
 *
 * ## Verified, or recorded, and the difference is stated
 *
 * GitHub publishes a `digest` on an artifact when the instance is new enough to have one.
 * When it is there the downloaded bytes are checked against it and a mismatch is a
 * refusal. An ordinary green run without one is recorded as `verified: false`, exactly as
 * `download/downloader.ts` distinguishes the two for a whole asset with no published
 * checksum. Recovery from a red run sets `requirePublishedDigest` and refuses before the
 * download when GitHub supplied none. Calling a recorded digest a verification would be a
 * claim this code cannot support.
 *
 * ## A map that shipped in parts is assembled, not just refused
 *
 * A world too large for one runner to assemble publishes `map-lowres` plus one
 * `partial-hires-N` per merge group (`.github/workflows/render-world.yml`'s "Say where the
 * map went" and "Publish the verified map artifact" steps), and the run summary explains
 * how to put them together by hand. This used to be exactly where the app stopped: it knew
 * only the single `rendered-map` shape, so a large world it had just finished rendering on
 * GitHub could never be fetched back onto this computer or any other - the run succeeded,
 * every job was green, and the app reported "no rendered-map artifact" as though nothing
 * had happened at all.
 *
 * The fix downloads every part GitHub actually published - `map-lowres` for the webapp,
 * metadata and lowres pyramid, then each `partial-hires-N` for its slice of the hires
 * tiles - verifies each one exactly as the single-artifact path already does, and unpacks
 * them into one tree: `map-lowres` first (it carries the whole webapp skeleton), then every
 * `partial-hires-N` into `maps/<id>/tiles/0/` inside it, precisely as the run summary's own
 * instructions say. A part that is missing, expired, or fails its digest is still refused
 * rather than guessed at - assembling from an incomplete set would produce exactly the
 * "loads, no detail anywhere" map this whole file exists to prevent.
 */

import { createHash } from "node:crypto";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { sha256File } from "@worldlens/parts";
import { sanitizeMapId } from "@worldlens/render-actions";
import { extractZip } from "../download/extract.js";
import { LocalMapHandler } from "../render/LocalMapHandler.js";
import { RENDER_RECORD_VERSION, writeRenderRecord } from "../render/provenance.js";
import type { RenderRecord } from "../render/provenance.js";
import { renderWorkspace } from "../render/workspace.js";
import { RENDERED_MAP_ARTIFACT } from "./actions.js";
import type { WorkflowArtifact } from "./actions.js";
import type { CiTransport } from "./transport.js";

/** The artifact a hierarchical merge publishes instead of a whole map. */
const LOWRES_ARTIFACT = "map-lowres";

/** The name prefix every hires-tile shard of a hierarchical merge publishes under. */
const HIRES_PART_PREFIX = "partial-hires-";

export interface CollectFailure {
    readonly code:
        | "no-map-artifact"
        | "ambiguous-map-artifact"
        | "map-parts-incomplete"
        | "artifact-expired"
        | "artifact-digest-missing"
        | "digest-mismatch"
        | "artifact-not-a-map"
        | "artifact-multiple-maps"
        | "collect-failed";
    readonly message: string;
    /**
     * Every map id the unpacked artifact actually held a valid `settings.json` under,
     * present only for {@link code} `"artifact-multiple-maps"` - so a caller can offer a
     * person the exact choice the message describes in words, rather than making them
     * retype an id off a screenshot.
     */
    readonly availableMapIds?: readonly string[];
}

export interface CollectSuccess {
    readonly ok: true;
    /** The id the map is filed under, and mounted at. */
    readonly renderId: string;
    readonly webRoot: string;
    /** What the viewer takes as its `dataRoot`. */
    readonly dataRoot: string;
    readonly bytes: number;
    readonly sha256: string;
    /** True only when GitHub published a digest and the bytes matched it, on every part. */
    readonly verified: boolean;
    /**
     * The artifact this render is keyed to for provenance. For a map shipped in parts,
     * this is `map-lowres`; every `partial-hires-N` that was assembled alongside it is
     * not separately represented here, because nothing downstream of this record reads
     * more than one artifact identity.
     */
    readonly artifact: WorkflowArtifact;
    /** BlueMap's storage id, which may differ from the raw project map id. */
    readonly mapId: string;
}

export type CollectResult =
    CollectSuccess | { readonly ok: false; readonly failure: CollectFailure };

export interface CollectOptions {
    /** Whichever credential route this sync chose. Never a second one. */
    readonly transport: CiTransport;
    readonly signal?: AbortSignal | undefined;
    /** Where maps live. The CI map is unpacked beside every local render, on purpose. */
    readonly storageDir: string;
    /**
     * Where the artifact zip is staged before it is unpacked.
     *
     * For a map shipped in parts, this path names the `map-lowres` download; each
     * `partial-hires-N` is staged beside it under a name derived from this one, so every
     * staged file lives in the same directory and a resumed download finds exactly the
     * bytes it already wrote.
     */
    readonly artifactFile: string;
    /** The render id to file it under. Always a `ci-` id; never a local render's. */
    readonly renderId: string;
    readonly mapId: string;
    readonly mapName: string;
    readonly dimension: string;
    /** The world this map is of, recorded so `render.json` explains itself. */
    readonly worldFolder: string;
    /** The commit the workflow ran from: what identifies the renderer exactly. */
    readonly headSha: string;
    readonly repository: string;
    readonly mounts?: LocalMapHandler | undefined;
    readonly appVersion?: string | null | undefined;
    readonly onBytes?: ((done: number, total: number) => void) | undefined;
    readonly startedAt?: string | undefined;
    readonly durationMs?: number | null | undefined;
    /** Recovery from a red run is allowed only with GitHub's own published digest. */
    readonly requirePublishedDigest?: boolean | undefined;
}

/**
 * Downloads, checks, unpacks and mounts the run's map.
 *
 * Answers rather than throws for every refusal a person could act on. A genuinely
 * unexpected error - a disk that filled, a zip reader that gave up - is caught by the
 * caller and reported as `collect-failed` rather than escaping into the channel.
 */
export async function collectRenderedMap(
    owner: string,
    repo: string,
    runId: number,
    options: CollectOptions,
): Promise<CollectResult> {
    const artifacts = await options.transport.listRunArtifacts(owner, repo, runId);
    const maps = artifacts.filter((artifact) => artifact.name === RENDERED_MAP_ARTIFACT);
    const map = maps[0];

    const workspace = renderWorkspace(options.storageDir, options.renderId);
    const storageMapId = sanitizeMapId(options.mapId);
    const stagedWebRoot = `${workspace.webRoot}.collecting-${String(runId)}`;
    const previousWebRoot = `${workspace.webRoot}.previous-${String(runId)}`;
    const stagedRecord = `${workspace.recordFile}.collecting-${String(runId)}`;
    const previousRecord = `${workspace.recordFile}.previous-${String(runId)}`;

    let primaryArtifact: WorkflowArtifact;
    let totalBytes: number;
    let combinedSha256: string;
    let anyUnverified: boolean;
    // Set early only for the lowres-plus-parts branch, which has to know where the hires
    // tiles belong *before* it can download them. The single-artifact branch resolves
    // this afterwards, alongside the branches converging below.
    let resolvedMapId: string | null = null;

    if (map === undefined) {
        const lowresCandidates = artifacts.filter((artifact) => artifact.name === LOWRES_ARTIFACT);
        if (lowresCandidates.length === 0) {
            return refuse(
                "no-map-artifact",
                `Run ${String(runId)} finished but published no ${RENDERED_MAP_ARTIFACT} artifact. It ` +
                    `has: ${artifacts.map((artifact) => artifact.name).join(", ") || "no artifacts at all"}.`,
            );
        }
        if (lowresCandidates.length > 1) {
            return refuse(
                "ambiguous-map-artifact",
                `Run ${String(runId)} published ${String(lowresCandidates.length)} artifacts named ` +
                    `${LOWRES_ARTIFACT}. Nothing was downloaded because there is no safe way to choose ` +
                    "which one is the finished map's lowres half.",
            );
        }
        const lowres = lowresCandidates[0];
        if (lowres === undefined) {
            return refuse(
                "no-map-artifact",
                `Run ${String(runId)} finished but published no ${RENDERED_MAP_ARTIFACT} artifact.`,
            );
        }

        const partsResult = resolveHiresParts(artifacts, runId);
        if (!partsResult.ok) return partsResult;
        const parts = partsResult.parts;

        await recoverInterruptedSwap(workspace.webRoot, previousWebRoot);
        await recoverInterruptedSwap(workspace.recordFile, previousRecord);
        await rm(stagedWebRoot, { recursive: true, force: true });
        await rm(stagedRecord, { force: true });

        const lowresFile = `${options.artifactFile}.map-lowres.zip`;
        const lowresFetch = await fetchAndVerify(owner, repo, runId, lowres, lowresFile, options);
        if (!lowresFetch.ok) return lowresFetch;

        await extractZip(lowresFile, stagedWebRoot, {
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });

        // The lowres artifact already carries the whole `maps/<id>` skeleton and its
        // `settings.json` - everything {@link resolveArtifactMapId} needs is here before
        // a single hires byte is fetched, which matters because the hires tiles have to
        // land under whichever id this resolves to, not blindly under the one requested.
        const lowresResolved = await resolveArtifactMapId(stagedWebRoot, storageMapId);
        if (!lowresResolved.ok) {
            const found = await describeUnpackedArtifact(stagedWebRoot, storageMapId);
            await rm(stagedWebRoot, { recursive: true, force: true }).catch(() => undefined);
            if (lowresResolved.candidates.length > 1) {
                return refuse(
                    "artifact-multiple-maps",
                    `The ${lowres.name} artifact holds ${String(lowresResolved.candidates.length)} ` +
                        `valid maps (${describeEntries(lowresResolved.candidates)}) and none of them is ` +
                        `maps/${storageMapId}, so there is no safe way to guess which one this render ` +
                        "is. Pick one explicitly and fetch again. Nothing was registered.",
                    lowresResolved.candidates,
                );
            }
            return refuse(
                "artifact-not-a-map",
                `The ${lowres.name} artifact unpacked without a maps/${storageMapId} folder ` +
                    "containing its settings.json and a root settings.json beside it, so it is not a " +
                    `map this application can serve. ${found} Nothing was registered.`,
            );
        }
        resolvedMapId = lowresResolved.mapId;

        let bytes = lowres.sizeInBytes;
        const digests: string[] = [lowresFetch.sha256];
        let unverified = !lowresFetch.verified;
        const hiresRoot = join(stagedWebRoot, "maps", resolvedMapId, "tiles", "0");

        for (const part of parts) {
            const partFile = `${options.artifactFile}.${part.name}.zip`;
            const partFetch = await fetchAndVerify(owner, repo, runId, part, partFile, options);
            if (!partFetch.ok) {
                await rm(stagedWebRoot, { recursive: true, force: true }).catch(() => undefined);
                return partFetch;
            }
            await extractZip(partFile, hiresRoot, {
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
            bytes += part.sizeInBytes;
            digests.push(partFetch.sha256);
            if (!partFetch.verified) unverified = true;
        }

        primaryArtifact = lowres;
        totalBytes = bytes;
        // A single sha256 identifying *this exact assembled set*: every part's own
        // verified-or-recorded digest, in the stable lowres-then-parts order, hashed
        // together. Reproducible from the same run's artifacts and honest that it names
        // a set rather than one file.
        combinedSha256 = createHash("sha256").update(digests.join(":")).digest("hex");
        anyUnverified = unverified;
    } else {
        if (maps.length !== 1) {
            return refuse(
                "ambiguous-map-artifact",
                `Run ${String(runId)} published ${String(maps.length)} artifacts named ` +
                    `${RENDERED_MAP_ARTIFACT}. Nothing was downloaded because there is no safe way ` +
                    "to choose which one is the finished map.",
            );
        }

        const single = await fetchAndVerify(owner, repo, runId, map, options.artifactFile, options);
        if (!single.ok) return single;

        await recoverInterruptedSwap(workspace.webRoot, previousWebRoot);
        await recoverInterruptedSwap(workspace.recordFile, previousRecord);
        await rm(stagedWebRoot, { recursive: true, force: true });
        await rm(stagedRecord, { force: true });
        await extractZip(options.artifactFile, stagedWebRoot, {
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });

        primaryArtifact = map;
        totalBytes = map.sizeInBytes;
        combinedSha256 = single.sha256;
        anyUnverified = !single.verified;
    }

    if (resolvedMapId === null) {
        // Diagnose *before* deleting the evidence. The refusal below used to say only
        // what it expected and never what it found, which is exactly why this bug shipped
        // undiagnosable from a screenshot: a user (and an agent looking at their bug
        // report) could see "expected maps/bayville_world_v10_1" and had no way to tell
        // whether the artifact had no maps/ folder at all, had one under a *different*
        // name (the classic app-vs-workflow sanitizeMapId drift - see bluemap.ts and issue
        // #47), or had the right folder but a truncated settings.json inside it. Read the
        // directory back while it still exists and say what is actually there.
        //
        // The requested id losing is no longer automatically fatal, though: a render made
        // elsewhere is free to carry a map id nobody here guessed correctly ahead of time.
        // When the artifact's own `maps/` folder holds exactly one other valid map,
        // {@link resolveArtifactMapId} already returned it as a match and this branch is
        // never reached for that case - it is reached only when there is genuinely none,
        // or genuinely more than one, to choose between.
        const resolved = await resolveArtifactMapId(stagedWebRoot, storageMapId);
        if (!resolved.ok) {
            const found = await describeUnpackedArtifact(stagedWebRoot, storageMapId);
            await rm(stagedWebRoot, { recursive: true, force: true }).catch(() => undefined);
            if (resolved.candidates.length > 1) {
                return refuse(
                    "artifact-multiple-maps",
                    `The ${primaryArtifact.name} artifact holds ${String(resolved.candidates.length)} ` +
                        `valid maps (${describeEntries(resolved.candidates)}) and none of them is ` +
                        `maps/${storageMapId}, so there is no safe way to guess which one this render ` +
                        "is. Pick one explicitly and fetch again. Nothing was registered.",
                    resolved.candidates,
                );
            }
            return refuse(
                "artifact-not-a-map",
                `The ${primaryArtifact.name} artifact unpacked without a maps/${storageMapId} folder ` +
                    "containing its settings.json and a root settings.json beside it, so it is not a " +
                    `map this application can serve. ${found} Nothing was registered.`,
            );
        }
        resolvedMapId = resolved.mapId;
    }

    const startedAt = options.startedAt ?? new Date().toISOString();
    const record: RenderRecord = {
        recordVersion: RENDER_RECORD_VERSION,
        renderId: options.renderId,
        engine: "upstream-java",
        // The commit, not a version number. The workflow builds the CLI from the vendored
        // BlueMap sources at this commit, so the commit *is* the exact identity of the
        // renderer that produced these tiles - and unlike a version string, it can be
        // looked up.
        engineVersion: `${options.repository}@${options.headSha.slice(0, 12) || "unknown"} (GitHub Actions)`,
        enginePath: null,
        javaVersion: "21 (temurin, GitHub Actions runner)",
        maps: [
            {
                id: resolvedMapId,
                name: options.mapName,
                world: options.worldFolder,
                dimension: options.dimension,
            },
        ],
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome: "finished",
        failureCode: null,
        durationMs: options.durationMs ?? null,
        appVersion: options.appVersion ?? null,
    };
    await writeRenderRecord(stagedRecord, record);
    await replaceCollectedRender({
        liveWebRoot: workspace.webRoot,
        stagedWebRoot,
        previousWebRoot,
        liveRecord: workspace.recordFile,
        stagedRecord,
        previousRecord,
    });

    options.mounts?.setMount({
        renderId: options.renderId,
        webRoot: workspace.webRoot,
        engineLabel: `BlueMap engine (Java), rendered on GitHub Actions`,
    });

    return {
        ok: true,
        renderId: options.renderId,
        webRoot: workspace.webRoot,
        dataRoot: LocalMapHandler.dataRoot(options.renderId),
        bytes: totalBytes,
        sha256: combinedSha256,
        verified: !anyUnverified,
        artifact: primaryArtifact,
        mapId: resolvedMapId,
    };
}

/**
 * Every `partial-hires-N` this run published, checked for a contiguous `0..count-1` run
 * with no gaps and no duplicates, in ascending order.
 *
 * A missing index is refused by name rather than silently assembled around: a merge
 * group's tiles are disjoint (see the workflow's own comment on `partial-hires-${matrix.group}`),
 * so a gap is not "slightly incomplete detail" - it is a rectangle of the world with no
 * hires tiles at all, which reads as a rendering bug in exactly the area that failed to
 * upload rather than as the missing download it actually is.
 */
function resolveHiresParts(
    artifacts: readonly WorkflowArtifact[],
    runId: number,
): { readonly ok: true; readonly parts: readonly WorkflowArtifact[] } | CollectFailureResult {
    const byIndex = new Map<number, WorkflowArtifact>();
    const unparsed: string[] = [];
    for (const artifact of artifacts) {
        if (!artifact.name.startsWith(HIRES_PART_PREFIX)) continue;
        const suffix = artifact.name.slice(HIRES_PART_PREFIX.length);
        const index = /^\d+$/.test(suffix) ? Number(suffix) : NaN;
        if (!Number.isInteger(index)) {
            unparsed.push(artifact.name);
            continue;
        }
        const existing = byIndex.get(index);
        if (existing === undefined || artifact.id > existing.id) byIndex.set(index, artifact);
    }

    if (byIndex.size === 0) {
        return refuse(
            "map-parts-incomplete",
            `This world was too large for one runner to assemble, so the run published ` +
                `${LOWRES_ARTIFACT} instead of ${RENDERED_MAP_ARTIFACT} - but it published no ` +
                `${HIRES_PART_PREFIX}N artifacts at all. Nothing was downloaded: a map with a ` +
                "lowres pyramid and no hires tiles anywhere would look like a broken render " +
                `rather than an incomplete run. Run ${String(runId)} on GitHub explains what it ` +
                "actually published.",
        );
    }

    const expectedCount = byIndex.size;
    const missing: number[] = [];
    for (let index = 0; index < expectedCount; index += 1) {
        if (!byIndex.has(index)) missing.push(index);
    }
    if (missing.length > 0 || unparsed.length > 0) {
        const missingText =
            missing.length > 0
                ? `missing part${missing.length === 1 ? "" : "s"} at index ` +
                  `${missing.map((index) => `${HIRES_PART_PREFIX}${String(index)}`).join(", ")}`
                : null;
        const unparsedText =
            unparsed.length > 0
                ? `${unparsed.length === 1 ? "an artifact" : "artifacts"} named like a hires part but ` +
                  `not numbered plainly (${unparsed.join(", ")})`
                : null;
        return refuse(
            "map-parts-incomplete",
            `This world was too large for one runner to assemble, so the run published ` +
                `${LOWRES_ARTIFACT} plus ${HIRES_PART_PREFIX}N hires parts, but the parts it ` +
                `published do not form a complete, contiguous 0..${String(expectedCount - 1)} set: ` +
                `${[missingText, unparsedText].filter((text): text is string => text !== null).join("; ")}. ` +
                "Nothing was downloaded, because assembling around a gap would produce a map that " +
                `loads with a hole in its detail rather than the missing download it actually is. ` +
                `Run ${String(runId)} on GitHub lists exactly what it published.`,
        );
    }

    const parts: WorkflowArtifact[] = [];
    for (let index = 0; index < expectedCount; index += 1) {
        const part = byIndex.get(index);
        if (part !== undefined) parts.push(part);
    }
    return { ok: true, parts };
}

type CollectFailureResult = { readonly ok: false; readonly failure: CollectFailure };
type FetchResult =
    | { readonly ok: true; readonly sha256: string; readonly verified: boolean }
    | CollectFailureResult;

/**
 * Downloads one artifact to `destinationFile`, then checks it against GitHub's published
 * digest exactly as the single-`rendered-map` path always has - shared here so a map
 * shipped in parts is held to the same standard, part by part, rather than a looser one.
 */
async function fetchAndVerify(
    owner: string,
    repo: string,
    runId: number,
    artifact: WorkflowArtifact,
    destinationFile: string,
    options: CollectOptions,
): Promise<FetchResult> {
    if (artifact.expired) {
        return refuse(
            "artifact-expired",
            `The ${artifact.name} artifact from run ${String(runId)} has passed its retention ` +
                "period and GitHub has deleted it. Start the render again; nothing on this " +
                "computer was changed.",
        );
    }

    const published = publishedSha256(artifact.digest);
    if (options.requirePublishedDigest === true && published === null) {
        return refuse(
            "artifact-digest-missing",
            `The ${artifact.name} artifact from run ${String(runId)} has no published SHA-256 ` +
                "digest. Nothing was downloaded because a map recovered from a failed run must be " +
                "verified against GitHub's own digest.",
        );
    }

    await options.transport.downloadArtifact(owner, repo, artifact, destinationFile, options.onBytes);

    const sha256 = await sha256File(destinationFile, options.signal);
    if (published !== null && published !== sha256) {
        // Deleted rather than kept. A file that failed its published digest is the one
        // file on disk that must never be reused, and a resumed download would otherwise
        // see the right length and skip the transfer for ever.
        await rm(destinationFile, { force: true }).catch(() => undefined);
        return refuse(
            "digest-mismatch",
            `The ${artifact.name} artifact arrived with SHA-256 ${sha256}, and GitHub published ` +
                `${published}. Nothing was unpacked and no map was registered.`,
        );
    }

    return { ok: true, sha256, verified: published !== null };
}

async function pathExists(path: string): Promise<boolean> {
    return (await stat(path).catch(() => null)) !== null;
}

/** Restores the known-good side of an interrupted prior swap before beginning another. */
async function recoverInterruptedSwap(live: string, previous: string): Promise<void> {
    const liveExists = await pathExists(live);
    const previousExists = await pathExists(previous);
    if (!liveExists && previousExists) {
        await rename(previous, live);
        return;
    }
    if (liveExists && previousExists) {
        await rm(previous, { recursive: true, force: true });
    }
}

async function replaceCollectedRender(paths: {
    readonly liveWebRoot: string;
    readonly stagedWebRoot: string;
    readonly previousWebRoot: string;
    readonly liveRecord: string;
    readonly stagedRecord: string;
    readonly previousRecord: string;
}): Promise<void> {
    let movedOldWeb = false;
    let movedOldRecord = false;
    let movedNewWeb = false;
    let movedNewRecord = false;
    try {
        if (await pathExists(paths.liveWebRoot)) {
            await rename(paths.liveWebRoot, paths.previousWebRoot);
            movedOldWeb = true;
        }
        if (await pathExists(paths.liveRecord)) {
            await rename(paths.liveRecord, paths.previousRecord);
            movedOldRecord = true;
        }
        await rename(paths.stagedWebRoot, paths.liveWebRoot);
        movedNewWeb = true;
        await rename(paths.stagedRecord, paths.liveRecord);
        movedNewRecord = true;
    } catch (error) {
        if (movedNewRecord) await rm(paths.liveRecord, { force: true }).catch(() => undefined);
        if (movedOldRecord) await rename(paths.previousRecord, paths.liveRecord);
        if (movedNewWeb) {
            await rm(paths.liveWebRoot, { recursive: true, force: true }).catch(() => undefined);
        }
        if (movedOldWeb) await rename(paths.previousWebRoot, paths.liveWebRoot);
        throw error;
    }

    await rm(paths.previousWebRoot, { recursive: true, force: true });
    await rm(paths.previousRecord, { force: true });
}

/** `sha256:<hex>` as GitHub writes it, or null for anything else. */
function publishedSha256(digest: string | null): string | null {
    if (digest === null) return null;
    const match = /^sha256:([0-9a-f]{64})$/i.exec(digest.trim());
    return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Whether what came out of the zip is really a servable map.
 *
 * Both files are checked because either one alone can be there for the wrong reason: an
 * artifact holding only the webapp has a `settings.json` and no tiles, and a truncated
 * merge can leave a `maps/<id>` directory with nothing useful in it. The pair is what the
 * viewer actually needs to open anything.
 */
async function isAMap(webRoot: string, mapId: string): Promise<boolean> {
    const settings = await stat(join(webRoot, "settings.json")).catch(() => null);
    const map = await stat(join(webRoot, "maps", mapId)).catch(() => null);
    const mapSettings = await stat(join(webRoot, "maps", mapId, "settings.json")).catch(() => null);
    return (
        settings !== null &&
        settings.isFile() &&
        map !== null &&
        map.isDirectory() &&
        mapSettings !== null &&
        mapSettings.isFile()
    );
}

function refuse(
    code: CollectFailure["code"],
    message: string,
    availableMapIds?: readonly string[],
): CollectFailureResult {
    return {
        ok: false,
        failure: {
            code,
            message,
            ...(availableMapIds === undefined ? {} : { availableMapIds }),
        },
    };
}

/**
 * Which map id the unpacked artifact should actually be registered under.
 *
 * The requested id (this project's own choice, or a run's parsed title) wins whenever the
 * artifact genuinely has a valid map by that name - the ordinary case, and the only one
 * that ever mattered before renders made on another device could be attached here. When
 * it does not, this looks at what the artifact's own `maps/` folder actually contains:
 * exactly one other valid map there is registered under *its* id instead of being refused
 * outright, because a render made elsewhere is free to carry a map id this project (or
 * the id parsed off the run's title) never heard of. More than one, or none at all, is a
 * real ambiguity this cannot guess through - the caller decides what to do with it.
 */
async function resolveArtifactMapId(
    webRoot: string,
    requestedMapId: string,
): Promise<
    | { readonly ok: true; readonly mapId: string }
    | { readonly ok: false; readonly candidates: readonly string[] }
> {
    if (await isAMap(webRoot, requestedMapId)) return { ok: true, mapId: requestedMapId };

    const mapsEntries = await listNames(join(webRoot, "maps"));
    const candidates: string[] = [];
    if (mapsEntries !== null) {
        for (const entry of mapsEntries) {
            if (await isAMap(webRoot, entry)) candidates.push(entry);
        }
    }
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only !== undefined) return { ok: true, mapId: only };
    return { ok: false, candidates };
}

/**
 * What was actually in the unpacked artifact, for the one message a person reading a bug
 * report can act on without also having a shell open on the machine that produced it.
 *
 * This exists because of a real, otherwise-invisible failure class: `storageMapId` here
 * and the workflow's own `sanitizeMapId(mapId)` (see `../../render-actions/bluemap.ts` and
 * `.github/workflows/render-world.yml`'s `plan` job) are two call sites computing what is
 * supposed to be the same value from the same shared function. They agree today - but
 * "they call the same function" is a fact about the source tree, not about any particular
 * installed build or any particular artifact sitting on disk. An app built before that
 * shared function existed (or a workflow template a bootstrapped repository never
 * re-synced to a newer `CI_WORKFLOW_TEMPLATE_VERSION`) would compute the *other* one's
 * answer, and the two sides would silently stop agreeing - one still looking for the raw,
 * hyphenated id, the other having written the sanitized one. Nothing throws when that
 * happens: every step upstream reports success, because every step upstream is only
 * checking its own work, never the other side's.
 *
 * The old refusal message named only the expected path and never what was actually on
 * disk, so *this exact drift* was the one thing it could never reveal - a user's bug
 * report showed "expected maps/bayville-world-v10-1" and nobody could tell whether the
 * real folder was named `bayville_world_v10_1` (drift), absent entirely (a genuinely
 * incomplete artifact), or present but gutted (a truncated merge). Reading the directory
 * back before it is deleted, and naming a same-but-for-sanitization sibling explicitly
 * when one exists, turns "not a map" into "here is exactly what differs and why".
 */
async function describeUnpackedArtifact(webRoot: string, expectedMapId: string): Promise<string> {
    const topLevel = await listNames(webRoot);
    if (topLevel === null) {
        return "The unpacked artifact directory itself could not be read back.";
    }
    if (topLevel.length === 0) {
        return "What was unpacked: nothing at all - the artifact extracted to an empty directory.";
    }

    const mapsEntries = topLevel.includes("maps") ? await listNames(join(webRoot, "maps")) : null;
    const parts: string[] = [
        `What was unpacked: ${describeEntries(topLevel)} at the archive root.`,
    ];

    if (mapsEntries === null) {
        parts.push(`Looked for a maps/ folder there and it was not present.`);
    } else if (mapsEntries.length === 0) {
        parts.push("The maps/ folder was present and empty.");
    } else {
        parts.push(`The maps/ folder held: ${describeEntries(mapsEntries)}.`);
        // The specific, diagnosable case this whole function exists for: the map is
        // there, just filed under the *other* sanitization of the same raw id. Naming
        // this explicitly turns a silent app-vs-workflow drift into a one-line diagnosis
        // instead of a coincidence the reader has to notice themselves.
        const sibling = mapsEntries.find(
            (entry) => entry !== expectedMapId && sanitizeMapId(entry) === sanitizeMapId(expectedMapId),
        );
        if (sibling !== undefined) {
            parts.push(
                `Note: "${sibling}" sanitizes to the same id as "${expectedMapId}" but is not an ` +
                    "exact match - this looks like the application and the render workflow computed " +
                    "the map's storage id differently. Rebuild the application and re-sync this " +
                    "repository's managed workflow files so both sides use the same rule.",
            );
        }
    }
    return parts.join(" ");
}

/** Every entry directly inside `dir`, or null when `dir` does not exist / is not a directory. */
async function listNames(dir: string): Promise<string[] | null> {
    try {
        return await readdir(dir);
    } catch {
        return null;
    }
}

/** A short, bounded, human-readable rendering of a directory listing for an error message. */
function describeEntries(names: readonly string[]): string {
    const MAX_NAMES = 12;
    const shown = names.slice(0, MAX_NAMES).map((name) => `"${name}"`);
    const remainder = names.length - shown.length;
    return shown.join(", ") + (remainder > 0 ? ` (+${String(remainder)} more)` : "");
}
