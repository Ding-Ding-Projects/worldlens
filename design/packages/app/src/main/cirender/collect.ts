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
 * ## A map that shipped in parts is refused, not guessed at
 *
 * A world too large for one runner to assemble publishes `map-lowres` plus one
 * `partial-hires-N` per merge group, and the run summary explains how to put them
 * together. Unpacking `map-lowres` on its own would produce a map that loads, shows the
 * overview, and has no detail at any zoom - which looks like a rendering bug rather than
 * a missing download. So it is refused with the reason and the artifacts named.
 */

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

export interface CollectFailure {
    readonly code:
        | "no-map-artifact"
        | "ambiguous-map-artifact"
        | "map-shipped-in-parts"
        | "artifact-expired"
        | "artifact-digest-missing"
        | "digest-mismatch"
        | "artifact-not-a-map"
        | "collect-failed";
    readonly message: string;
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
    /** True only when GitHub published a digest and the bytes matched it. */
    readonly verified: boolean;
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
    /** Where the artifact zip is staged before it is unpacked. */
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

    if (map === undefined) {
        const lowres = artifacts.find((artifact) => artifact.name === LOWRES_ARTIFACT);
        if (lowres !== undefined) {
            const parts = artifacts
                .filter((artifact) => artifact.name.startsWith("partial-hires-"))
                .map((artifact) => artifact.name);
            return refuse(
                "map-shipped-in-parts",
                `This world was too large for one runner to assemble, so the run published ` +
                    `${LOWRES_ARTIFACT} and ${String(parts.length)} hires part` +
                    `${parts.length === 1 ? "" : "s"} (${parts.join(", ") || "none listed"}) instead of ` +
                    `one ${RENDERED_MAP_ARTIFACT}. Nothing was downloaded: unpacking the lowres ` +
                    "artifact on its own would give a map that loads and has no detail at any zoom, " +
                    "which looks like a broken render rather than a missing download. The run " +
                    "summary on GitHub says how to assemble the parts by hand.",
            );
        }
        return refuse(
            "no-map-artifact",
            `Run ${String(runId)} finished but published no ${RENDERED_MAP_ARTIFACT} artifact. It ` +
                `has: ${artifacts.map((artifact) => artifact.name).join(", ") || "no artifacts at all"}.`,
        );
    }

    if (maps.length !== 1) {
        return refuse(
            "ambiguous-map-artifact",
            `Run ${String(runId)} published ${String(maps.length)} artifacts named ` +
                `${RENDERED_MAP_ARTIFACT}. Nothing was downloaded because there is no safe way ` +
                "to choose which one is the finished map.",
        );
    }

    if (map.expired) {
        return refuse(
            "artifact-expired",
            `The ${RENDERED_MAP_ARTIFACT} artifact from run ${String(runId)} has passed its ` +
                "retention period and GitHub has deleted it. Start the render again; nothing on " +
                "this computer was changed.",
        );
    }

    const published = publishedSha256(map.digest);
    if (options.requirePublishedDigest === true && published === null) {
        return refuse(
            "artifact-digest-missing",
            `The ${RENDERED_MAP_ARTIFACT} artifact from run ${String(runId)} has no published ` +
                "SHA-256 digest. Nothing was downloaded because a map recovered from a failed run " +
                "must be verified against GitHub's own digest.",
        );
    }

    await options.transport.downloadArtifact(
        owner,
        repo,
        map,
        options.artifactFile,
        options.onBytes,
    );

    const sha256 = await sha256File(options.artifactFile, options.signal);
    if (published !== null && published !== sha256) {
        // Deleted rather than kept. A file that failed its published digest is the one
        // file on disk that must never be reused, and a resumed download would otherwise
        // see the right length and skip the transfer for ever.
        await rm(options.artifactFile, { force: true }).catch(() => undefined);
        return refuse(
            "digest-mismatch",
            `The ${RENDERED_MAP_ARTIFACT} artifact arrived with SHA-256 ${sha256}, and GitHub ` +
                `published ${published}. Nothing was unpacked and no map was registered.`,
        );
    }

    const workspace = renderWorkspace(options.storageDir, options.renderId);
    const storageMapId = sanitizeMapId(options.mapId);
    const stagedWebRoot = `${workspace.webRoot}.collecting-${String(runId)}`;
    const previousWebRoot = `${workspace.webRoot}.previous-${String(runId)}`;
    const stagedRecord = `${workspace.recordFile}.collecting-${String(runId)}`;
    const previousRecord = `${workspace.recordFile}.previous-${String(runId)}`;

    await recoverInterruptedSwap(workspace.webRoot, previousWebRoot);
    await recoverInterruptedSwap(workspace.recordFile, previousRecord);
    await rm(stagedWebRoot, { recursive: true, force: true });
    await rm(stagedRecord, { force: true });
    await extractZip(options.artifactFile, stagedWebRoot, {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    const looksLikeAMap = await isAMap(stagedWebRoot, storageMapId);
    if (!looksLikeAMap) {
        // Diagnose *before* deleting the evidence. The refusal below used to say only
        // what it expected and never what it found, which is exactly why this bug shipped
        // undiagnosable from a screenshot: a user (and an agent looking at their bug
        // report) could see "expected maps/bayville_world_v10_1" and had no way to tell
        // whether the artifact had no maps/ folder at all, had one under a *different*
        // name (the classic app-vs-workflow sanitizeMapId drift - see bluemap.ts and issue
        // #47), or had the right folder but a truncated settings.json inside it. Read the
        // directory back while it still exists and say what is actually there.
        const found = await describeUnpackedArtifact(stagedWebRoot, storageMapId);
        await rm(stagedWebRoot, { recursive: true, force: true }).catch(() => undefined);
        return refuse(
            "artifact-not-a-map",
            `The ${RENDERED_MAP_ARTIFACT} artifact unpacked without a maps/${storageMapId} folder ` +
                "containing its settings.json and a root settings.json beside it, so it is not a " +
                `map this application can serve. ${found} Nothing was registered.`,
        );
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
                id: storageMapId,
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
        bytes: map.sizeInBytes,
        sha256,
        verified: published !== null,
        artifact: map,
        mapId: storageMapId,
    };
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
): { readonly ok: false; readonly failure: CollectFailure } {
    return { ok: false, failure: { code, message } };
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
function describeEntries(names: string[]): string {
    const MAX_NAMES = 12;
    const shown = names.slice(0, MAX_NAMES).map((name) => `"${name}"`);
    const remainder = names.length - shown.length;
    return shown.join(", ") + (remainder > 0 ? ` (+${String(remainder)} more)` : "");
}
