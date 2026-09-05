/**
 * The loop, against a recording fake of the GitHub API.
 *
 * Every assertion here is about one of the four promises this feature makes, and half of
 * them are **negative** - that something did *not* happen. Those are the ones a stub that
 * merely answered could never check, and they are the ones that matter: an unchanged world
 * that gets uploaded again costs an evening, and a failed run that registers a map costs
 * somebody's trust in every map in the list.
 */

import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { packFolder } from "../backup/archive.js";
import { LocalMapHandler } from "../render/LocalMapHandler.js";
import { fingerprintWorld } from "./fingerprint.js";
import {
    RecordingGitHub,
    artifactJson,
    jobJson,
    recordingGhAccountProvider,
    repositoryJson,
    runJson,
} from "./recordingGitHub.js";
import {
    ciSyncWorkspace,
    newCiSyncState,
    readCiSyncState,
    syncIdFor,
    writeCiSyncState,
} from "./state.js";
import type { CiSyncState } from "./state.js";
import { CiRenderSync, VERIFIED_MAP_UPLOAD_STEP } from "./sync.js";
import type { CiSyncEvent, CiSyncRequest } from "./sync.js";

const OWNER = "o";
const REPO = "r";
const MAP_ID = "world";
const NOW = Date.parse("2026-08-04T10:00:00Z");
const RELEASE_TAG = "mbm-backup-world-overworld-20260803T090000Z";
const ASSET_NAME = "world-overworld-20260803T090000Z.zip";

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("The expected asynchronous state did not arrive.");
}

let workDir = "";
let world = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-cirender-"));
    world = join(workDir, "saves", "overworld");
    await mkdir(join(world, "region"), { recursive: true });
    await writeFile(join(world, "level.dat"), "level");
    await writeFile(join(world, "region", "r.0.0.mca"), "region bytes");
    await writeFile(join(world, "worldlens.project.json"), projectFile(), "utf8");
});
afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

function projectFile(): string {
    return `${JSON.stringify(
        {
            version: 1,
            id: "project-1",
            name: "Overworld",
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
            appVersion: null,
            maps: [
                {
                    id: MAP_ID,
                    name: "World",
                    dimension: "minecraft:overworld",
                    config: 'ambient-light: 0.1\nsky-color: "#7dabff"\n',
                    storage: "file",
                    sorting: 0,
                    enabled: true,
                },
            ],
            storages: [],
            render: {
                threads: null,
                force: false,
                fixEdges: false,
                metrics: false,
                outputFolder: null,
            },
            core: null,
            webapp: null,
            webserver: null,
            plugin: null,
            fromWizard: false,
        },
        null,
        4,
    )}\n`;
}

/**
 * True when nothing was published: no release created and no asset put anywhere.
 *
 * Writes only. *Reading* a release is what the unchanged-world check does on every sync and
 * is not an upload, so counting every mention of `/releases` would make this assertion pass
 * or fail for the wrong reason.
 */
function nothingUploaded(github: RecordingGitHub): boolean {
    return (
        github.countOf(/\/releases$/, "POST") === 0 && github.countOf("/assets?name=", "POST") === 0
    );
}

/**
 * The routes an upload needs: create the release, then accept each asset.
 *
 * The upload host is a second base URL, which is why `uploadsBase` is set alongside
 * `apiBase` - an upload that quietly went to the real `uploads.github.com` would be a test
 * that touches the network.
 */
function uploadRoutes(github: RecordingGitHub, tag = RELEASE_TAG): RecordingGitHub {
    return github
        .on("POST", /\/repos\/o\/r\/releases$/, {
            status: 201,
            json: {
                id: 5,
                tag_name: tag,
                name: tag,
                html_url: `https://github.test/release/${tag}`,
                upload_url: "",
                created_at: "2026-08-04T10:00:00Z",
                assets: [],
            },
        })
        .on("POST", "/assets?name=", {
            status: 201,
            json: { id: 11, name: "asset", size: 1, state: "uploaded", browser_download_url: "" },
        });
}

function makeSync(options: {
    github: RecordingGitHub;
    mounts?: LocalMapHandler;
    eulaAccepted?: boolean;
    events?: CiSyncEvent[];
    writeState?: ((path: string, state: CiSyncState) => Promise<void>) | undefined;
}): CiRenderSync {
    return new CiRenderSync({
        storageDir: () => join(workDir, "maps"),
        account: recordingGhAccountProvider(options.github),
        eulaAccepted: () => options.eulaAccepted ?? true,
        ...(options.mounts === undefined ? {} : { mounts: options.mounts }),
        ...(options.events === undefined
            ? {}
            : { onEvent: (event) => options.events?.push(event) }),
        ...(options.writeState === undefined ? {} : { writeState: options.writeState }),
        now: () => NOW,
        sleep: () => Promise.resolve(),
        pollIntervalMs: 0,
        runLookupAttempts: 2,
    });
}

function request(extra: Partial<CiSyncRequest> = {}): CiSyncRequest {
    return {
        worldFolder: world,
        owner: OWNER,
        repo: REPO,
        mapId: MAP_ID,
        acknowledgeUpload: true,
        acknowledgePublic: true,
        ...extra,
    };
}

/** Reads the durable dispatch marker from a fresh process, not Vitest's memory. */
function readStateInFreshProcess(
    path: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const script = `
        const { readCiSyncState } = await import("./packages/app/src/main/cirender/state.ts");
        const state = await readCiSyncState(process.argv[1]);
        console.log(JSON.stringify({ stage: state?.stage ?? null, runId: state?.runId ?? null, dispatchedAt: state?.dispatchedAt ?? null }));
    `;
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            ["--experimental-strip-types", "--input-type=module", "-e", script, "--", path],
            {
                cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}

/** Routes every test needs: the repository (for the ref) and the dispatch itself. */
function baseRoutes(github: RecordingGitHub, isPrivate = true, canWrite = true): RecordingGitHub {
    return (
        github
            .on("POST", "/dispatches", { status: 204 })
            // The capability probe: the cheapest call that proves a credential can see Actions
            // on this repository under the selected broker lease.
            .on("GET", /\/actions\/workflows\/render-world\.yml$/, {
                status: 200,
                json: {
                    id: 1,
                    name: "Render world",
                    state: "active",
                    path: ".github/workflows/render-world.yml",
                },
            })
            .on("GET", /\/repos\/o\/r$/, {
                status: 200,
                json: repositoryJson({ owner: OWNER, repo: REPO, isPrivate, canWrite }),
            })
    );
}

/** Writes the record a previous successful upload would have left. */
async function seedUploadedState(
    options: { runId?: number; accountId?: string; mapId?: string } = {},
): Promise<string> {
    const mapId = options.mapId ?? MAP_ID;
    const syncId = syncIdFor(OWNER, REPO, world, mapId);
    const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
    const fingerprint = await fingerprintWorld(world);
    await writeCiSyncState(workspace.stateFile, {
        ...newCiSyncState({
            syncId,
            owner: OWNER,
            repo: REPO,
            ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
            worldFolder: world,
            mapId,
            mapName: "World",
            dimension: "minecraft:overworld",
            at: "2026-08-03T09:00:00Z",
        }),
        fingerprint: fingerprint.digest,
        releaseTag: RELEASE_TAG,
        assetName: ASSET_NAME,
        archiveBytes: 1024,
        archiveSha256: "a".repeat(64),
        stage: options.runId === undefined ? "uploaded" : "dispatched",
        runId: options.runId ?? null,
        runNumber: options.runId ?? null,
        runUrl:
            options.runId === undefined
                ? null
                : `https://github.test/runs/${String(options.runId)}`,
    });
    return syncId;
}

function stepJson(
    number: number,
    name: string,
    conclusion: string | null = "success",
): Record<string, unknown> {
    return {
        number,
        name,
        status: "completed",
        conclusion,
        started_at: `2026-08-04T10:${String(number).padStart(2, "0")}:00Z`,
        completed_at: `2026-08-04T10:${String(number).padStart(2, "0")}:01Z`,
    };
}

function mergeJobJson(
    options: {
        uploadName?: string;
        failureName?: string;
        earlierFailure?: boolean;
    } = {},
): Record<string, unknown> {
    return {
        ...(jobJson({
            id: 42,
            name: "Merge group 0",
            status: "completed",
            conclusion: "failure",
        }) as object),
        steps: [
            ...(options.earlierFailure === true
                ? [stepJson(13, "Merge this group's shards", "failure")]
                : [stepJson(13, "Merge this group's shards")]),
            stepJson(14, "Verify the merge"),
            stepJson(15, "Assemble the complete map"),
            stepJson(16, options.uploadName ?? VERIFIED_MAP_UPLOAD_STEP),
            stepJson(
                17,
                options.failureName ?? "Build the documentation site to publish alongside the map",
                "failure",
            ),
        ],
    };
}

async function renderedMapArtifact(mapId = MAP_ID): Promise<{
    readonly bytes: Uint8Array;
    readonly sha256: string;
}> {
    const site = join(workDir, `site-${mapId}`);
    await mkdir(join(site, "maps", mapId, "tiles"), { recursive: true });
    await writeFile(join(site, "settings.json"), JSON.stringify({ maps: [mapId] }), "utf8");
    await writeFile(join(site, "maps", mapId, "settings.json"), "{}", "utf8");
    await writeFile(join(site, "maps", mapId, "tiles", "0.prbm"), "tile", "utf8");
    const archive = join(workDir, `${mapId}-rendered-map.zip`);
    const packed = await packFolder(site, archive);
    return { bytes: new Uint8Array(await readFile(archive)), sha256: packed.sha256 };
}

/** The release the seeded record points at, still holding its asset. */
function releaseRoute(github: RecordingGitHub): RecordingGitHub {
    return github.on("GET", `/releases/tags/${RELEASE_TAG}`, {
        status: 200,
        json: {
            id: 5,
            tag_name: RELEASE_TAG,
            name: RELEASE_TAG,
            html_url: "https://github.test/release",
            upload_url: "",
            created_at: "2026-08-03T09:00:00Z",
            assets: [
                {
                    id: 1,
                    name: ASSET_NAME,
                    size: 1024,
                    state: "uploaded",
                    browser_download_url: "",
                },
            ],
        },
    });
}

/* -------------------------------------------------------------------------- */

describe("what leaves this computer is said first", () => {
    it("forgets one finished local record without touching GitHub", async () => {
        const syncId = await seedUploadedState();
        const github = new RecordingGitHub();
        const sync = makeSync({ github });

        await expect(sync.knownSyncIds()).resolves.toContain(syncId);
        await expect(sync.forget(syncId)).resolves.toBe(true);
        await expect(sync.knownSyncIds()).resolves.not.toContain(syncId);
        await expect(sync.forget(syncId)).resolves.toBe(false);
        expect(github.calls).toHaveLength(0);
    });

    it("reports the PUBLIC warning through preflight, in the backup surface's own words", async () => {
        const github = baseRoutes(new RecordingGitHub(), false);
        const sync = makeSync({ github });

        const result = await sync.preflight(request());

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.preflight.repository?.private).toBe(false);
        expect(result.preflight.repository?.warning?.level).toBe("warning");
        expect(result.preflight.repository?.warning?.message).toContain("PUBLIC");
        // Reading a repository is not starting anything.
        expect(github.never("/dispatches")).toBe(true);
    });

    it("refuses a public repository that was never acknowledged, before anything is packed", async () => {
        const github = baseRoutes(new RecordingGitHub(), false);
        const sync = makeSync({ github });

        const result = await sync.sync(request({ acknowledgePublic: false }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("public-not-acknowledged");
        expect(result.failure.message).toContain("PUBLIC");
        expect(nothingUploaded(github)).toBe(true);
        expect(github.never("/dispatches")).toBe(true);
    });

    it("refuses to upload a world nobody agreed to send", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const sync = makeSync({ github });

        const result = await sync.sync(request({ acknowledgeUpload: false }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("upload-not-acknowledged");
        expect(result.failure.message).toContain("upload the whole world");
        expect(nothingUploaded(github)).toBe(true);
    });

    it("never accepts Mojang's licence on somebody's behalf", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const sync = makeSync({ github, eulaAccepted: false });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("eula-not-accepted");
        expect(result.failure.needsEula).toBe(true);
        expect(result.failure.message).toContain("Settings");
        expect(nothingUploaded(github)).toBe(true);
        expect(github.never("/dispatches")).toBe(true);
    });

    it("refuses a repository the account cannot write to", async () => {
        const github = baseRoutes(new RecordingGitHub(), true, false);
        const sync = makeSync({ github });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("read-only");
        expect(nothingUploaded(github)).toBe(true);
    });
});
describe("preflight still describes the repository when no route can dispatch yet", () => {
    /**
     * `readWorkflow` 404s for two very different reasons that used to be reported
     * identically: a repository that does not have the render workflow committed yet -
     * an empty repository somebody just made by hand, or a name just confirmed free and
     * about to be created - and a repository this credential genuinely cannot reach.
     * `resolved.transport` is null in both cases, and the old code used that alone to
     * decide `repository: null`, which made an ordinary "not set up yet" indistinguishable
     * from a real permission refusal. This is the fix: the repository read no longer
     * depends on a dispatch route having been found.
     */
    it("reports the repository as readable and writable even though nothing can dispatch to it yet", async () => {
        // Deliberately no workflow route mocked, so the workflow capability probe 404s - exactly
        // what an existing, unprepared repository looks like from here.
        const github = new RecordingGitHub().on("GET", /\/repos\/o\/r$/, {
            status: 200,
            json: repositoryJson({ owner: OWNER, repo: REPO, isPrivate: false }),
        });
        const sync = makeSync({ github });

        const result = await sync.preflight(request());

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Not ready to dispatch a render...
        expect(result.preflight.routeReport.ready).toBe(false);
        // ...but the repository itself is not a mystery. This is what lets the surface
        // tell "exists, not set up yet" apart from "cannot be reached at all".
        expect(result.preflight.repository?.fullName).toBe(`${OWNER}/${REPO}`);
        expect(result.preflight.repository?.canWrite).toBe(true);
        expect(result.preflight.repositoryFailure).toBeNull();
    });

    it("still reports nothing when the repository itself cannot be read by any credential", async () => {
        // The genuine "cannot proceed" case: even the repository read fails, with no
        // transport to fall back to either. This must stay `repository: null`, because
        // inventing an answer here is exactly the mistake the fix above does not make.
        const github = new RecordingGitHub();
        const sync = makeSync({ github });

        const result = await sync.preflight(request());

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.preflight.routeReport.ready).toBe(false);
        expect(result.preflight.repository).toBeNull();
        expect(result.preflight.repositoryFailure).toContain("404");
    });
});

describe("an unchanged world is not uploaded again", () => {
    it("skips the upload when the fingerprint matches and the release still holds the asset", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "in_progress" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "in_progress" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [jobJson({ id: 42, name: "Measure and plan", status: "in_progress" })],
                },
            });
        await seedUploadedState();
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, events });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        // The whole point: nothing was packed and nothing was uploaded.
        expect(nothingUploaded(github)).toBe(true);
        expect(github.countOf("/dispatches", "POST")).toBe(1);
        const said = events.filter((event) => event.type === "log").map((event) => event.message);
        expect(said.join(" ")).toContain("has not changed");
    });

    it("uploads again when the release the record points at is gone", async () => {
        const github = uploadRoutes(baseRoutes(new RecordingGitHub()))
            // GitHub answers 404 for a release that was deleted, which is exactly what a
            // record pointing at nothing looks like from here.
            .on("GET", `/releases/tags/${RELEASE_TAG}`, {
                status: 404,
                json: { message: "Not Found" },
            })
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "queued" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        const sync = makeSync({ github });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        expect(github.countOf(/\/repos\/o\/r\/releases$/, "POST")).toBe(1);
    });

    it("uploads again when the world has actually changed", async () => {
        const github = uploadRoutes(releaseRoute(baseRoutes(new RecordingGitHub())))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "queued" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        await writeFile(join(world, "region", "r.0.1.mca"), "a new region nobody had rendered");
        const sync = makeSync({ github });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        expect(github.countOf(/\/repos\/o\/r\/releases$/, "POST")).toBe(1);
        // The archive, the sidecar and the pointer. The pointer goes last, because it is
        // what marks the release as a finished upload.
        const assets = github.calls
            .filter((call) => call.method === "POST" && call.url.includes("/assets?name="))
            .map((call) => decodeURIComponent(call.url.split("name=")[1] ?? ""));
        expect(assets).toHaveLength(3);
        expect(assets[1]).toBe("backup.json");
        expect(assets[2]).toContain(".cheaplfs");
    });

    it("reports through preflight whether an upload would happen at all", async () => {
        const github = baseRoutes(new RecordingGitHub());
        await seedUploadedState();
        const sync = makeSync({ github });

        const before = await sync.preflight(request());
        expect(before.ok && before.preflight.worldChanged).toBe(false);
        expect(before.ok && before.preflight.uploadNeeded).toBe(false);

        await writeFile(join(world, "region", "r.9.9.mca"), "changed");
        const after = await sync.preflight(request());
        expect(after.ok && after.preflight.worldChanged).toBe(true);
        expect(after.ok && after.preflight.uploadNeeded).toBe(true);
    });
});

describe("the live events carry the route and the upload's own item counts", () => {
    it("tags every phase with the credential actually driving it", async () => {
        const github = uploadRoutes(releaseRoute(baseRoutes(new RecordingGitHub())))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "queued" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        await writeFile(join(world, "region", "r.0.1.mca"), "a new region nobody had rendered");
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, events });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        const phases = events.filter(
            (event): event is Extract<CiSyncEvent, { type: "phase" }> => event.type === "phase",
        );
        // Every phase this sync reaches - checking, uploading, dispatching, waiting - is
        // tagged, not only the ones after the upload finishes.
        expect(phases.length).toBeGreaterThan(1);
        expect(phases.every((event) => event.route === "gh")).toBe(true);
    });

    it("forwards the upload's own count of its pieces, not just the bytes moved", async () => {
        const github = uploadRoutes(releaseRoute(baseRoutes(new RecordingGitHub())))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "queued" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        await writeFile(join(world, "region", "r.0.1.mca"), "a new region nobody had rendered");
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, events });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        const progress = events.filter(
            (event): event is Extract<CiSyncEvent, { type: "progress" }> =>
                event.type === "progress",
        );
        expect(progress.length).toBeGreaterThan(0);
        // Uploading the archive, the sidecar and the pointer is three pieces, and the count
        // this reports is `upload.ts`'s own - never re-derived from the byte totals, which
        // would say nothing about a part skipped because it was already on the release.
        expect(progress.some((event) => event.assetsTotal >= 3)).toBe(true);
        expect(progress.every((event) => event.assetsDone <= event.assetsTotal)).toBe(true);
        // The asset actually being moved is named, not left implicit in the description.
        expect(progress.some((event) => event.asset !== null)).toBe(true);
    });
});

/**
 * The setup card's account picker names a stored account by id, additively, so a sync run
 * with none of it named still resolves whichever account is active - exactly what every
 * caller before the picker existed already relied on. `token`/`account` both take that id
 * now; these tests prove it actually reaches both of them, on both `preflight()` and the
 * real dispatch inside `sync()`, rather than only decorating a message.
 */
describe("an account id a request names drives the credential, not only decorates a message", () => {
    it("resolves the token and the login for the chosen account through preflight, and the active account when none is named", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const credentialCalls: (string | undefined)[] = [];
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            account: recordingGhAccountProvider(github, { calls: credentialCalls }),
            eulaAccepted: () => true,
            now: () => NOW,
            sleep: () => Promise.resolve(),
        });

        // Nobody named an account: this is the exact call shape every caller before the
        // picker existed already made, and it must keep resolving to the active account.
        const active = await sync.preflight(request());
        expect(active.ok).toBe(true);
        if (active.ok) expect(active.preflight.routeReport.describe).toContain("octocat");

        // The setup card's picker named a specific stored account instead.
        const named = await sync.preflight(request({ accountId: "acct-2" }));
        expect(named.ok).toBe(true);
        if (named.ok) expect(named.preflight.routeReport.describe).toContain("monalisa");

        // The broker actually received the selected account id; this is routing evidence,
        // not merely matching text on screen.
        expect(credentialCalls).toEqual([undefined, "acct-2"]);
    });

    it("carries the chosen account through the real dispatch, not only the preflight read", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "queued" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();

        const credentialCalls: (string | undefined)[] = [];
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            account: recordingGhAccountProvider(github, { calls: credentialCalls }),
            eulaAccepted: () => true,
            now: () => NOW,
            sleep: () => Promise.resolve(),
            pollIntervalMs: 0,
            runLookupAttempts: 2,
        });

        const result = await sync.sync(request({ accountId: "acct-2", follow: false }));

        expect(result.ok).toBe(true);
        // The world was unchanged, so this proves the dispatch itself happened - the real
        // credential-using call, not merely a read - under the account the request named.
        expect(github.countOf("/dispatches", "POST")).toBe(1);
        expect(credentialCalls).toEqual(["acct-2"]);
    });

    it("persists the broker-resolved active account when an older caller omits accountId", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "queued" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            account: recordingGhAccountProvider(github),
            eulaAccepted: () => true,
            now: () => NOW,
            sleep: () => Promise.resolve(),
            pollIntervalMs: 0,
            runLookupAttempts: 2,
        });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        await expect(sync.readState(result.syncId)).resolves.toMatchObject({
            accountId: "active-account",
        });
    });

    it("persists the chosen account so a later check cannot fall back to another active account", async () => {
        const github = baseRoutes(new RecordingGitHub())
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "in_progress" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        const syncId = await seedUploadedState({ runId: 7, accountId: "acct-2" });
        const credentialCalls: (string | undefined)[] = [];
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            account: recordingGhAccountProvider(github, { calls: credentialCalls }),
            eulaAccepted: () => true,
            now: () => NOW,
            sleep: () => Promise.resolve(),
        });

        const result = await sync.check(syncId);

        expect(result.ok).toBe(true);
        expect(credentialCalls).toEqual(["acct-2"]);
    });

    it("falls back to the active account for every existing caller that never names one", async () => {
        // The same shape `makeSync()` builds for the whole rest of this file: a single-
        // argument-ignoring `token`, called the way it always was. Nothing here changed for
        // it - the parameter is additive, and this is the proof rather than an assumption.
        const github = baseRoutes(new RecordingGitHub());
        const sync = makeSync({ github });

        const result = await sync.preflight(request());

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.preflight.routeReport.ready).toBe(true);
    });
});

describe("a run that is still going is reported as still going", () => {
    it("persists Stop watching as cancelled and emits no later failed event", async () => {
        const github = baseRoutes(new RecordingGitHub())
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "in_progress" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        const syncId = await seedUploadedState({ runId: 7 });
        const events: CiSyncEvent[] = [];
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            account: recordingGhAccountProvider(github),
            eulaAccepted: () => true,
            onEvent: (event) => events.push(event),
            now: () => NOW,
            sleep: async (_milliseconds, signal) =>
                await new Promise<void>((_resolve, reject) => {
                    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
                }),
        });

        const resultPromise = sync.resume(syncId);
        await waitFor(() => events.some((event) => event.type === "run"));
        expect(sync.cancel(syncId)).toBe(true);
        const result = await resultPromise;

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("cancelled");
        expect((await sync.readState(syncId))?.stage).toBe("cancelled");
        expect(events.filter((event) => event.type === "cancelled")).toHaveLength(1);
        expect(events.filter((event) => event.type === "failed")).toHaveLength(0);
    });

    it("says which wave a job belongs to, read from its own name", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "in_progress" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "in_progress" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({
                            id: 41,
                            name: "Build the BlueMap CLI",
                            status: "completed",
                            conclusion: "success",
                        }),
                        jobJson({ id: 42, name: "Wave 1 shard 0", status: "in_progress" }),
                        // GitHub prefixes a job from a called reusable workflow with the
                        // calling job's own name, which is also `Wave <n>` here.
                        jobJson({ id: 43, name: "Wave 1 / Wave 1 shard 1", status: "queued" }),
                        jobJson({ id: 44, name: "Wave 2 shard 0", status: "queued" }),
                        jobJson({ id: 45, name: "Merge group 0", status: "queued" }),
                    ],
                },
            });
        await seedUploadedState();
        const sync = makeSync({ github });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        if (!result.ok || result.outcome !== "running")
            throw new Error("expected a running outcome");
        // A job with no wave in its own name is null, never a guessed 0.
        expect(result.run?.jobs.map((job) => job.wave)).toEqual([null, 1, 1, 2, null]);
    });

    it("answers with the real per-job states and no conclusion", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "in_progress" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "in_progress" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({
                            id: 41,
                            name: "Build the BlueMap CLI",
                            status: "completed",
                            conclusion: "success",
                        }),
                        jobJson({ id: 42, name: "Measure and plan", status: "in_progress" }),
                        jobJson({ id: 43, name: "Wave 1", status: "queued" }),
                    ],
                },
            });
        await seedUploadedState();
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, mounts });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        if (!result.ok || result.outcome !== "running")
            throw new Error("expected a running outcome");
        expect(result.run?.status).toBe("in_progress");
        expect(result.run?.conclusion).toBeNull();
        expect(result.run?.jobs.map((job) => `${job.name}:${job.status}`)).toEqual([
            "Build the BlueMap CLI:completed",
            "Measure and plan:in_progress",
            "Wave 1:queued",
        ]);
        // Nothing has finished, so nothing was fetched and nothing was registered.
        expect(github.never("/artifacts")).toBe(true);
        expect(mounts.getMounts()).toHaveLength(0);
    });

    it("polls until the run completes when it is asked to follow", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on(
                "GET",
                /\/actions\/runs\/7$/,
                { status: 200, json: runJson({ id: 7, status: "queued" }) },
                { status: 200, json: runJson({ id: 7, status: "in_progress" }) },
                {
                    status: 200,
                    json: runJson({ id: 7, status: "completed", conclusion: "failure" }),
                },
            )
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({
                            id: 42,
                            name: "Wave 1",
                            status: "completed",
                            conclusion: "failure",
                        }),
                    ],
                },
            })
            .on("GET", "/actions/jobs/42/logs", { status: 200, text: "boom\n" });
        await seedUploadedState();
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, events });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        // Three reads: queued, in progress, completed. Each one pushed to the interface.
        expect(events.filter((event) => event.type === "run")).toHaveLength(3);
    });

    it("check() polls a recorded run without downloading or registering anything", async () => {
        const github = baseRoutes(new RecordingGitHub())
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "in_progress" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: { jobs: [jobJson({ id: 42, name: "Wave 1", status: "in_progress" })] },
            });
        const syncId = await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, mounts });

        const result = await sync.check(syncId);

        expect(result.ok && result.outcome === "running").toBe(true);
        expect(github.never("/artifacts")).toBe(true);
        expect(mounts.getMounts()).toHaveLength(0);
    });
});

describe("a failed run registers nothing", () => {
    it("dispatches a fresh run when a failed record is retried", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/workflows\/render-world\.yml\/runs/, {
                status: 200,
                json: {
                    workflow_runs: [
                        runJson({
                            id: 8,
                            status: "queued",
                            createdAt: "2026-08-04T10:00:01Z",
                        }),
                    ],
                },
            })
            .on("GET", /\/actions\/runs\/8$/, {
                status: 200,
                json: runJson({ id: 8, status: "queued", createdAt: "2026-08-04T10:00:01Z" }),
            })
            .on("GET", "/actions/runs/8/jobs", { status: 200, json: { jobs: [] } });
        const syncId = await seedUploadedState({ runId: 7 });
        const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
        const failed = await readCiSyncState(workspace.stateFile);
        expect(failed).not.toBeNull();
        if (failed === null) return;
        await writeCiSyncState(workspace.stateFile, {
            ...failed,
            stage: "failed",
            failureCode: "run-failure",
            failureMessage: "Run 7 ended as failure.",
        });
        const sync = makeSync({ github });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok ? result.outcome : result.failure.code).toBe("running");
        expect(github.countOf("/dispatches", "POST")).toBe(1);
        expect(github.never(/\/actions\/runs\/7$/)).toBe(true);
        expect((await readCiSyncState(workspace.stateFile))?.runId).toBe(8);
    });

    it("names the failing job, carries its log, and mounts no map", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "failure" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({
                            id: 41,
                            name: "Build the BlueMap CLI",
                            status: "completed",
                            conclusion: "success",
                        }),
                        {
                            ...(jobJson({
                                id: 42,
                                name: "Merge group 0",
                                status: "completed",
                                conclusion: "failure",
                            }) as object),
                            steps: [stepJson(13, "Merge this group's shards", "failure")],
                        },
                        jobJson({
                            id: 43,
                            name: "Wave 2",
                            status: "completed",
                            conclusion: "cancelled",
                        }),
                    ],
                },
            })
            .on("GET", "/actions/jobs/42/logs", {
                status: 200,
                text: "Merging shards\n::error::these shards did not finish and were not merged: 3\n",
            });
        const syncId = await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, mounts });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("run-failure");
        expect(result.failure.failingJob).toBe("Merge group 0");
        expect(result.failure.failingStep).toBe("Merge this group's shards");
        expect(result.failure.logExcerpt).toContain("did not finish");
        expect(result.failure.run?.conclusion).toBe("failure");
        // The three things a failed run must never produce.
        expect(github.never("/artifacts")).toBe(true);
        expect(mounts.getMounts()).toHaveLength(0);
        expect(
            (await readCiSyncState(ciSyncWorkspace(join(workDir, "maps"), syncId).stateFile))
                ?.renderId,
        ).toBeNull();
    });

    it("prefers the job that failed over a sibling the failure cancelled", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "failure" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({
                            id: 40,
                            name: "Wave 1",
                            status: "completed",
                            conclusion: "cancelled",
                        }),
                        jobJson({
                            id: 42,
                            name: "Wave 3",
                            status: "completed",
                            conclusion: "failure",
                        }),
                    ],
                },
            })
            .on("GET", "/actions/jobs/42/logs", { status: 200, text: "the real problem\n" });
        await seedUploadedState({ runId: 7 });
        const sync = makeSync({ github });

        const result = await sync.sync(request());
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.failingJob).toBe("Wave 3");
    });

    it("still reports the failure when the log cannot be read", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "timed_out" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({
                            id: 42,
                            name: "Wave 1",
                            status: "completed",
                            conclusion: "timed_out",
                        }),
                    ],
                },
            })
            .on("GET", "/actions/jobs/42/logs", { status: 410, json: { message: "gone" } });
        await seedUploadedState({ runId: 7 });
        const sync = makeSync({ github });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("run-timed_out");
        expect(result.failure.logExcerpt).toBeNull();
        expect(result.failure.message).toContain("timed_out");
    });
});

describe("a red run whose first later failure is Pages-only", () => {
    async function runRecovery(
        options: {
            jobs?: unknown[];
            artifacts?: unknown[];
            bytes?: Uint8Array;
            mapId?: string;
            writeState?: ((path: string, state: CiSyncState) => Promise<void>) | undefined;
        } = {},
    ) {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "failure" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: { jobs: options.jobs ?? [mergeJobJson()] },
            })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: { artifacts: options.artifacts ?? [] },
            });
        if (options.bytes !== undefined) {
            github.on("GET", "/artifacts/9/zip", { status: 200, bytes: options.bytes });
        }
        const syncId = await seedUploadedState({
            runId: 7,
            ...(options.mapId === undefined ? {} : { mapId: options.mapId }),
        });
        const mounts = new LocalMapHandler();
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, mounts, events, writeState: options.writeState });
        const result = await sync.sync(request({ mapId: options.mapId ?? MAP_ID }));
        return { github, syncId, mounts, events, result, sync };
    }

    it.each([
        VERIFIED_MAP_UPLOAD_STEP,
        "Run actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    ])(
        "recovers the verified artifact after %s, while retaining the red run and warning",
        async (uploadName) => {
            const artifact = await renderedMapArtifact();
            const attempt = await runRecovery({
                jobs: [mergeJobJson({ uploadName })],
                artifacts: [
                    artifactJson({
                        id: 9,
                        name: "rendered-map",
                        bytes: artifact.bytes.byteLength,
                        digest: `sha256:${artifact.sha256}`,
                    }),
                ],
                bytes: artifact.bytes,
            });

            expect(attempt.result.ok).toBe(true);
            if (!attempt.result.ok || attempt.result.outcome !== "rendered") {
                throw new Error("expected a recovered render");
            }
            expect(attempt.result.summary.postRenderWarning).toEqual({
                code: "pages-not-published",
                runId: 7,
                failingJob: "Merge group 0",
                failingStep: "Build the documentation site to publish alongside the map",
            });
            expect(attempt.result.summary.verified).toBe(true);
            expect(attempt.events.find((event) => event.type === "run")?.run.conclusion).toBe(
                "failure",
            );
            expect(attempt.mounts.getMounts()).toHaveLength(1);
            expect(nothingUploaded(attempt.github)).toBe(true);

            const state = await readCiSyncState(
                ciSyncWorkspace(join(workDir, "maps"), attempt.syncId).stateFile,
            );
            expect(state?.stage).toBe("rendered");
            expect(state?.runId).toBe(7);
            expect(state?.recoveryAttemptedRunId).toBe(7);
            // The state was read back from disk, so it is a fresh object; only its
            // content, not its identity, can match what the in-memory summary carries.
            expect(state?.postRenderWarning).toEqual(attempt.result.summary.postRenderWarning);
        },
    );

    it("proves recovery from complete job and artifact inventories beyond page 1", async () => {
        const artifact = await renderedMapArtifact();
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "failure" }),
            })
            .on(
                "GET",
                "/actions/runs/7/jobs",
                {
                    status: 200,
                    json: {
                        total_count: 101,
                        jobs: Array.from({ length: 100 }, (_, index) => ({
                            ...(jobJson({
                                id: index + 1,
                                name: `Unused wave ${String(index + 1)}`,
                                status: "completed",
                                conclusion: "skipped",
                            }) as object),
                            steps: [],
                        })),
                    },
                },
                { status: 200, json: { total_count: 101, jobs: [mergeJobJson()] } },
            )
            .on(
                "GET",
                "/actions/runs/7/artifacts",
                {
                    status: 200,
                    json: {
                        total_count: 101,
                        artifacts: Array.from({ length: 100 }, (_, index) =>
                            artifactJson({
                                id: index + 1,
                                name: `diagnostic-${String(index)}`,
                                bytes: 1,
                            }),
                        ),
                    },
                },
                {
                    status: 200,
                    json: {
                        total_count: 101,
                        artifacts: [
                            artifactJson({
                                id: 1001,
                                name: "rendered-map",
                                bytes: artifact.bytes.byteLength,
                                digest: `sha256:${artifact.sha256}`,
                            }),
                        ],
                    },
                },
            )
            .on("GET", "/artifacts/1001/zip", { status: 200, bytes: artifact.bytes });
        await seedUploadedState({ runId: 7 });
        const sync = makeSync({ github, mounts: new LocalMapHandler() });

        const result = await sync.sync(request());

        expect(result.ok && result.outcome === "rendered").toBe(true);
        expect(github.countOf("/actions/runs/7/jobs", "GET")).toBe(2);
        expect(github.countOf("/actions/runs/7/artifacts", "GET")).toBe(2);
    });

    it("stays fail-closed when any render step failed before the proof sequence", async () => {
        const attempt = await runRecovery({ jobs: [mergeJobJson({ earlierFailure: true })] });
        expect(attempt.result.ok).toBe(false);
        if (attempt.result.ok) return;
        expect(attempt.result.failure.code).toBe("run-failure");
        expect(attempt.github.never("/artifacts")).toBe(true);
        expect(attempt.mounts.getMounts()).toHaveLength(0);
    });

    it("stays fail-closed when the first later failure is not explicitly Pages-only", async () => {
        const attempt = await runRecovery({
            jobs: [mergeJobJson({ failureName: "Validate the rendered map again" })],
        });
        expect(attempt.result.ok).toBe(false);
        if (attempt.result.ok) return;
        expect(attempt.result.failure.code).toBe("run-failure");
        expect(attempt.github.never("/artifacts")).toBe(true);
    });

    it("stays fail-closed when GitHub's step numbers are not strictly ordered", async () => {
        const job = mergeJobJson();
        const steps = job["steps"] as Record<string, unknown>[];
        steps[2] = { ...steps[2], number: 12 };
        const attempt = await runRecovery({ jobs: [job] });
        expect(attempt.result.ok).toBe(false);
        expect(attempt.github.never("/artifacts")).toBe(true);
    });

    it("stays fail-closed when a post-upload step has no conclusion", async () => {
        const job = mergeJobJson();
        const steps = job["steps"] as Record<string, unknown>[];
        steps.splice(4, 0, stepJson(17, "Validate the Pages bundle", null));
        steps[5] = { ...steps[5], number: 18 };
        const attempt = await runRecovery({ jobs: [job] });
        expect(attempt.result.ok).toBe(false);
        expect(attempt.github.never("/artifacts")).toBe(true);
    });

    it("stays fail-closed when any raw step entry is malformed", async () => {
        const job = mergeJobJson();
        const steps = job["steps"] as Record<string, unknown>[];
        steps.splice(4, 0, { number: "seventeen", name: "Unreadable step" });
        const attempt = await runRecovery({ jobs: [job] });
        expect(attempt.result.ok).toBe(false);
        expect(attempt.github.never("/artifacts")).toBe(true);
    });

    it("refuses a missing rendered-map artifact", async () => {
        const attempt = await runRecovery();
        expect(attempt.result.ok).toBe(false);
        if (attempt.result.ok) return;
        expect(attempt.result.failure.code).toBe("no-map-artifact");
        const state = await readCiSyncState(
            ciSyncWorkspace(join(workDir, "maps"), attempt.syncId).stateFile,
        );
        expect(state?.recoveryAttemptedRunId).toBe(7);

        const second = await attempt.sync.sync(request());
        expect(second.ok).toBe(false);
        if (second.ok) return;
        expect(second.failure.code).toBe("artifact-recovery-already-attempted");
        expect(attempt.github.countOf("/actions/runs/7/artifacts", "GET")).toBe(1);
    });

    it("does not touch artifacts when the one-attempt marker cannot be persisted", async () => {
        const attempt = await runRecovery({
            artifacts: [
                artifactJson({
                    id: 9,
                    name: "rendered-map",
                    bytes: 1,
                    digest: `sha256:${"a".repeat(64)}`,
                }),
            ],
            writeState: () => Promise.reject(new Error("state storage is unavailable")),
        });

        expect(attempt.result.ok).toBe(false);
        if (attempt.result.ok) return;
        expect(attempt.result.failure.message).toContain("state storage is unavailable");
        expect(attempt.github.never("/actions/runs/7/artifacts")).toBe(true);
        expect(attempt.mounts.getMounts()).toHaveLength(0);
    });

    it("refuses duplicate rendered-map artifacts instead of choosing one", async () => {
        const attempt = await runRecovery({
            artifacts: [
                artifactJson({
                    id: 9,
                    name: "rendered-map",
                    bytes: 1,
                    digest: `sha256:${"a".repeat(64)}`,
                }),
                artifactJson({
                    id: 10,
                    name: "rendered-map",
                    bytes: 1,
                    digest: `sha256:${"b".repeat(64)}`,
                }),
            ],
        });
        expect(attempt.result.ok).toBe(false);
        if (attempt.result.ok) return;
        expect(attempt.result.failure.code).toBe("ambiguous-map-artifact");
        expect(attempt.github.never("/zip")).toBe(true);
    });

    it("refuses an expired rendered-map artifact", async () => {
        const attempt = await runRecovery({
            artifacts: [
                artifactJson({
                    id: 9,
                    name: "rendered-map",
                    bytes: 1,
                    digest: `sha256:${"a".repeat(64)}`,
                    expired: true,
                }),
            ],
        });
        expect(attempt.result.ok).toBe(false);
        if (attempt.result.ok) return;
        expect(attempt.result.failure.code).toBe("artifact-expired");
    });

    it("requires GitHub's published SHA-256 before downloading from a red run", async () => {
        const attempt = await runRecovery({
            artifacts: [artifactJson({ id: 9, name: "rendered-map", bytes: 1 })],
        });
        expect(attempt.result.ok).toBe(false);
        if (attempt.result.ok) return;
        expect(attempt.result.failure.code).toBe("artifact-digest-missing");
        expect(attempt.github.never("/zip")).toBe(true);
    });

    it("refuses bytes that disagree with the published digest", async () => {
        const bytes = new Uint8Array([1, 2, 3, 4]);
        const attempt = await runRecovery({
            artifacts: [
                artifactJson({
                    id: 9,
                    name: "rendered-map",
                    bytes: bytes.byteLength,
                    digest: `sha256:${"b".repeat(64)}`,
                }),
            ],
            bytes,
        });
        expect(attempt.result.ok).toBe(false);
        if (attempt.result.ok) return;
        expect(attempt.result.failure.code).toBe("digest-mismatch");
    });

    it("refuses a digest-valid zip whose map shape is incomplete", async () => {
        const site = join(workDir, "malformed-site");
        await mkdir(join(site, "maps", MAP_ID), { recursive: true });
        await writeFile(join(site, "settings.json"), '{"maps":["world"]}', "utf8");
        const archive = join(workDir, "malformed.zip");
        const packed = await packFolder(site, archive);
        const bytes = new Uint8Array(await readFile(archive));
        const attempt = await runRecovery({
            artifacts: [
                artifactJson({
                    id: 9,
                    name: "rendered-map",
                    bytes: bytes.byteLength,
                    digest: `sha256:${packed.sha256}`,
                }),
            ],
            bytes,
        });
        expect(attempt.result.ok).toBe(false);
        if (attempt.result.ok) return;
        expect(attempt.result.failure.code).toBe("artifact-not-a-map");
        expect(attempt.mounts.getMounts()).toHaveLength(0);
    });

    it("uses BlueMap's sanitized storage id while keeping the raw id as the sync identity", async () => {
        const rawMapId = "bayville-world-v10-1";
        const storageMapId = "bayville_world_v10_1";
        await writeFile(
            join(world, "worldlens.project.json"),
            projectFile().replace(`"id": "${MAP_ID}"`, `"id": "${rawMapId}"`),
            "utf8",
        );
        const artifact = await renderedMapArtifact(storageMapId);
        const attempt = await runRecovery({
            mapId: rawMapId,
            artifacts: [
                artifactJson({
                    id: 9,
                    name: "rendered-map",
                    bytes: artifact.bytes.byteLength,
                    digest: `sha256:${artifact.sha256}`,
                }),
            ],
            bytes: artifact.bytes,
        });
        expect(attempt.result.ok).toBe(true);
        if (!attempt.result.ok || attempt.result.outcome !== "rendered") return;
        expect(attempt.result.summary.mapId).toBe(storageMapId);
        const state = await readCiSyncState(
            ciSyncWorkspace(join(workDir, "maps"), attempt.syncId).stateFile,
        );
        expect(state?.mapId).toBe(rawMapId);
        const record = JSON.parse(
            await readFile(join(workDir, "maps", `ci-${attempt.syncId}`, "render.json"), "utf8"),
        ) as { maps: { id: string }[] };
        expect(record.maps[0]?.id).toBe(storageMapId);
    });

    it("retries with the existing upload and preserves the recovered map and warning in flight", async () => {
        const artifact = await renderedMapArtifact();
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "failure" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [mergeJobJson()] } })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({
                            id: 9,
                            name: "rendered-map",
                            bytes: artifact.bytes.byteLength,
                            digest: `sha256:${artifact.sha256}`,
                        }),
                    ],
                },
            })
            .on("GET", "/artifacts/9/zip", { status: 200, bytes: artifact.bytes })
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 8, status: "in_progress" })] },
            })
            .on("GET", /\/actions\/runs\/8$/, {
                status: 200,
                json: runJson({ id: 8, status: "in_progress" }),
            })
            .on("GET", "/actions/runs/8/jobs", { status: 200, json: { jobs: [] } });
        const syncId = await seedUploadedState({ runId: 7 });
        const sync = makeSync({ github, mounts: new LocalMapHandler() });
        const recovered = await sync.sync(request());
        expect(recovered.ok && recovered.outcome === "rendered").toBe(true);
        const recoveredState = await readCiSyncState(
            ciSyncWorkspace(join(workDir, "maps"), syncId).stateFile,
        );

        const retried = await sync.sync(request({ output: "artifact-and-pages", follow: false }));

        expect(retried.ok && retried.outcome === "running").toBe(true);
        if (!retried.ok || retried.outcome !== "running") return;
        expect(retried.state.runId).toBe(8);
        expect(retried.state.releaseTag).toBe(RELEASE_TAG);
        expect(retried.state.assetName).toBe(ASSET_NAME);
        expect(retried.state.archiveSha256).toBe("a".repeat(64));
        expect(retried.state.renderId).toBe(recoveredState?.renderId);
        expect(retried.state.artifactSha256).toBe(recoveredState?.artifactSha256);
        // `recoveredState` was read back from disk, so it is a fresh object; only its
        // content, not its identity, can match what the retried sync carries in memory.
        expect(retried.state.postRenderWarning).toEqual(recoveredState?.postRenderWarning);
        expect(github.countOf("/dispatches", "POST")).toBe(1);
        expect(nothingUploaded(github)).toBe(true);
    });

    it("refuses the retry when the local world changed after the recovered snapshot", async () => {
        const artifact = await renderedMapArtifact();
        const recovered = await runRecovery({
            artifacts: [
                artifactJson({
                    id: 9,
                    name: "rendered-map",
                    bytes: artifact.bytes.byteLength,
                    digest: `sha256:${artifact.sha256}`,
                }),
            ],
            bytes: artifact.bytes,
        });
        expect(recovered.result.ok && recovered.result.outcome === "rendered").toBe(true);

        await writeFile(join(world, "region", "r.0.0.mca"), "changed after recovery", "utf8");
        const retry = await recovered.sync.sync(request({ output: "artifact-and-pages" }));

        expect(retry.ok).toBe(false);
        if (retry.ok) return;
        expect(retry.failure.code).toBe("retry-world-changed");
        expect(recovered.github.countOf("/dispatches", "POST")).toBe(0);
        expect(nothingUploaded(recovered.github)).toBe(true);
    });

    it("refuses the retry before dispatch when the recorded source asset is gone", async () => {
        const artifact = await renderedMapArtifact();
        const recovered = await runRecovery({
            artifacts: [
                artifactJson({
                    id: 9,
                    name: "rendered-map",
                    bytes: artifact.bytes.byteLength,
                    digest: `sha256:${artifact.sha256}`,
                }),
            ],
            bytes: artifact.bytes,
        });
        expect(recovered.result.ok && recovered.result.outcome === "rendered").toBe(true);

        const github = baseRoutes(new RecordingGitHub()).on(
            "GET",
            `/releases/tags/${RELEASE_TAG}`,
            {
                status: 200,
                json: {
                    id: 5,
                    tag_name: RELEASE_TAG,
                    name: RELEASE_TAG,
                    html_url: "https://github.test/release",
                    upload_url: "",
                    created_at: "2026-08-03T09:00:00Z",
                    assets: [],
                },
            },
        );
        const retrySync = makeSync({ github });
        const retry = await retrySync.sync(request({ output: "artifact-and-pages" }));

        expect(retry.ok).toBe(false);
        if (retry.ok) return;
        expect(retry.failure.code).toBe("retry-source-missing");
        expect(github.never("/dispatches")).toBe(true);
        expect(nothingUploaded(github)).toBe(true);
    });
});

describe("a bad answer from GitHub is not a failed render", () => {
    /*
     * The defect these three pin down, in the words of the render that hit it:
     *
     *   Reading run 33666847877 failed: GitHub answered 502.
     *
     * Four waves had already succeeded. The Actions run was still going. What stopped was
     * Worldlens' willingness to keep watching it - and because artifacts are collected only
     * at the end of the watch, one unlucky poll discarded hours of finished render work.
     */
    it("rides out a transient 502 mid-watch and still collects the finished render", async () => {
        const site = join(workDir, "flaky-site");
        await mkdir(join(site, "maps", MAP_ID, "tiles"), { recursive: true });
        await writeFile(join(site, "settings.json"), '{"maps":["world"]}', "utf8");
        await writeFile(join(site, "maps", MAP_ID, "settings.json"), "{}", "utf8");
        await writeFile(join(site, "maps", MAP_ID, "tiles", "0.prbm"), "tile", "utf8");
        const archive = join(workDir, "flaky-rendered-map.zip");
        const packed = await packFolder(site, archive);
        const bytes = new Uint8Array(await readFile(archive));

        const github = baseRoutes(new RecordingGitHub())
            // Two refusals, then the truth. The third reply repeats for ever, which is what
            // makes the rest of the collection path reachable at all.
            .on(
                "GET",
                /\/actions\/runs\/7$/,
                { status: 502, json: { message: "GitHub CLI refused the request." } },
                { status: 502, json: { message: "GitHub CLI refused the request." } },
                {
                    status: 200,
                    json: runJson({ id: 7, status: "completed", conclusion: "success" }),
                },
            )
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({
                            id: 9,
                            name: "rendered-map",
                            bytes: bytes.byteLength,
                            digest: `sha256:${packed.sha256}`,
                        }),
                    ],
                },
            })
            .on("GET", "/artifacts/9/zip", { status: 200, bytes });

        const syncId = await seedUploadedState({ runId: 7 });
        const events: CiSyncEvent[] = [];
        const mounts = new LocalMapHandler();
        const result = await makeSync({ github, mounts, events }).resume(syncId);

        expect(result.ok && result.outcome === "rendered").toBe(true);
        expect(events.some((event) => event.type === "failed")).toBe(false);
        expect(mounts.getMounts()).toHaveLength(1);
        // Three reads for one poll: the two that were refused and the one that answered.
        expect(github.countOf(/\/actions\/runs\/7$/, "GET")).toBe(3);
        // And the wait explained itself rather than looking like a hang.
        const retryLines = events.filter(
            (event) => event.type === "log" && event.message.includes("retrying in"),
        );
        expect(retryLines).toHaveLength(2);
    });

    it("keeps the run resumable, not failed, when the retry budget runs out", async () => {
        const github = baseRoutes(new RecordingGitHub()).on("GET", /\/actions\/runs\/7$/, {
            status: 502,
            json: { message: "GitHub CLI refused the request." },
        });
        const syncId = await seedUploadedState({ runId: 7 });
        const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
        const result = await makeSync({ github }).resume(syncId);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("watch-interrupted");
        expect(result.failure.message).toContain("still going on GitHub");
        // The whole point: the recorded dispatch survives, so a resume can finish the job
        // and collect the artifacts that are sitting there intact.
        const after = await readCiSyncState(workspace.stateFile);
        expect(after?.stage).toBe("dispatched");
        expect(after?.runId).toBe(7);
    });

    it("still reports a signed-out credential at once, without retrying it", async () => {
        const github = baseRoutes(new RecordingGitHub()).on("GET", /\/actions\/runs\/7$/, {
            status: 401,
            json: { message: "Bad credentials" },
        });
        const syncId = await seedUploadedState({ runId: 7 });
        const result = await makeSync({ github }).resume(syncId);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("signed-out");
        expect(result.failure.needsSignIn).toBe(true);
        // One attempt. Hammering a credential that is not accepted just delays the sentence
        // that tells somebody to sign in again.
        expect(github.countOf(/\/actions\/runs\/7$/, "GET")).toBe(1);
    });
});

describe("a successful run comes back as a map in the list", () => {
    it("adopts a durable pre-dispatch marker after a process crash without dispatching twice", async () => {
        const syncId = await seedUploadedState();
        const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
        const prior = await readCiSyncState(workspace.stateFile);
        expect(prior).not.toBeNull();
        if (prior === null) return;
        const dispatchedAt = "2026-08-04T10:00:00.000Z";
        await writeCiSyncState(workspace.stateFile, {
            ...prior,
            stage: "dispatched",
            dispatchedAt,
            runId: null,
            runNumber: null,
            runUrl: null,
            updatedAt: dispatchedAt,
        });

        // A separate process can read the marker left before the external dispatch. This
        // is the crash boundary: the next process must adopt the matching run, not issue
        // another workflow_dispatch request.
        const fresh = await readStateInFreshProcess(workspace.stateFile);
        expect(fresh.code, fresh.stderr).toBe(0);
        expect(JSON.parse(fresh.stdout.trim())).toEqual({
            stage: "dispatched",
            runId: null,
            dispatchedAt,
        });

        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: {
                    workflow_runs: [
                        runJson({
                            id: 17,
                            status: "completed",
                            conclusion: "failure",
                            createdAt: dispatchedAt,
                        }),
                    ],
                },
            })
            .on("GET", /\/actions\/runs\/17$/, {
                status: 200,
                json: runJson({
                    id: 17,
                    status: "completed",
                    conclusion: "failure",
                    createdAt: dispatchedAt,
                }),
            })
            .on("GET", "/actions/runs/17/jobs", { status: 200, json: { jobs: [] } });
        const sync = makeSync({ github });
        const result = await sync.resume(syncId);

        expect(result.ok).toBe(false);
        const adopted = await readCiSyncState(workspace.stateFile);
        expect(adopted?.runId).toBe(17);
        expect(github.countOf("/dispatches", "POST")).toBe(0);
        expect(github.countOf(/\/actions\/workflows\/render-world\.yml\/runs/, "GET")).toBe(1);
    });

    it("resumes a dispatched run after restart without uploading a changed world or dispatching again", async () => {
        const site = join(workDir, "resume-site");
        await mkdir(join(site, "maps", MAP_ID, "tiles"), { recursive: true });
        await writeFile(join(site, "settings.json"), '{"maps":["world"]}', "utf8");
        await writeFile(join(site, "maps", MAP_ID, "settings.json"), "{}", "utf8");
        await writeFile(join(site, "maps", MAP_ID, "tiles", "0.prbm"), "tile", "utf8");
        const archive = join(workDir, "resumed-rendered-map.zip");
        const packed = await packFolder(site, archive);
        const bytes = new Uint8Array(await readFile(archive));
        const github = baseRoutes(new RecordingGitHub())
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "success" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({
                            id: 9,
                            name: "rendered-map",
                            bytes: bytes.byteLength,
                            digest: `sha256:${packed.sha256}`,
                        }),
                    ],
                },
            })
            .on("GET", "/artifacts/9/zip", { status: 200, bytes });
        const syncId = await seedUploadedState({ runId: 7 });
        await writeFile(join(world, "region", "r.9.9.mca"), "changed after dispatch");
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, mounts });

        const [result, duplicate] = await Promise.all([sync.resume(syncId), sync.resume(syncId)]);

        expect(result.ok).toBe(true);
        expect(duplicate.ok).toBe(true);
        if (!result.ok || result.outcome !== "rendered")
            throw new Error("expected a rendered outcome");
        expect(result.summary.uploaded).toBe(false);
        expect(github.countOf("/dispatches", "POST")).toBe(0);
        expect(github.countOf(/\/actions\/runs\/7$/, "GET")).toBe(1);
        expect(nothingUploaded(github)).toBe(true);
        expect(mounts.getMounts()).toHaveLength(1);
    });

    it("downloads the artifact, verifies it against GitHub's digest, and mounts it", async () => {
        const site = join(workDir, "site");
        await mkdir(join(site, "maps", MAP_ID, "tiles"), { recursive: true });
        await writeFile(join(site, "settings.json"), '{"maps":["world"]}', "utf8");
        await writeFile(join(site, "maps", MAP_ID, "settings.json"), "{}", "utf8");
        await writeFile(join(site, "maps", MAP_ID, "tiles", "0.prbm"), "tile", "utf8");
        const archive = join(workDir, "rendered-map.zip");
        const packed = await packFolder(site, archive);
        const bytes = new Uint8Array(await readFile(archive));

        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "success" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({
                            id: 42,
                            name: "Merge group 0",
                            status: "completed",
                            conclusion: "success",
                        }),
                    ],
                },
            })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({
                            id: 9,
                            name: "rendered-map",
                            bytes: bytes.byteLength,
                            digest: `sha256:${packed.sha256}`,
                        }),
                    ],
                },
            })
            .on("GET", "/artifacts/9/zip", { status: 200, bytes });

        const syncId = await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, mounts });

        const result = await sync.sync(request());

        expect(result.ok).toBe(true);
        if (!result.ok || result.outcome !== "rendered")
            throw new Error("expected a rendered outcome");
        expect(result.summary.uploaded).toBe(false);
        expect(result.summary.verified).toBe(true);
        expect(result.summary.dataRoot).toBe(`/local/ci-${syncId}`);
        expect(mounts.getMounts()).toHaveLength(1);
        expect(mounts.getMount(`ci-${syncId}`)?.engineLabel).toContain("GitHub Actions");

        // A `render.json` beside the map is what puts it in the list of renders.
        const record = JSON.parse(
            await readFile(join(workDir, "maps", `ci-${syncId}`, "render.json"), "utf8"),
        ) as { outcome: string; maps: { id: string }[]; engineVersion: string };
        expect(record.outcome).toBe("finished");
        expect(record.maps[0]?.id).toBe(MAP_ID);
        // The commit, so "which renderer made these tiles" has a checkable answer.
        expect(record.engineVersion).toContain("abcdef012345");
    });

    it("refuses an artifact whose bytes do not match the digest GitHub published", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "success" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({
                            id: 9,
                            name: "rendered-map",
                            bytes: 4,
                            digest: `sha256:${"b".repeat(64)}`,
                        }),
                    ],
                },
            })
            .on("GET", "/artifacts/9/zip", { status: 200, bytes: new Uint8Array([1, 2, 3, 4]) });
        await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, mounts });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("digest-mismatch");
        expect(mounts.getMounts()).toHaveLength(0);
    });

    it("refuses a map shipped in parts with a gap, rather than assembling around it", async () => {
        // Was: unconditionally refused every multi-group render, even a complete one -
        // see collect.test.ts for the positive case this defect fix now makes possible.
        // What must still be refused is a genuinely incomplete part set: here
        // partial-hires-1 never got published, so index 1 is a real gap rather than a
        // reachable part this computer merely has not fetched yet.
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "success" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({ id: 9, name: "map-lowres", bytes: 10 }),
                        artifactJson({ id: 10, name: "partial-hires-0", bytes: 10 }),
                        artifactJson({ id: 11, name: "partial-hires-2", bytes: 10 }),
                    ],
                },
            });
        await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, mounts });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("map-parts-incomplete");
        expect(result.failure.message).toContain("partial-hires-1");
        expect(mounts.getMounts()).toHaveLength(0);
        expect(github.never("/zip")).toBe(true);
    });
});

describe("refusals are values, and none of them is a stack", () => {
    it("says so when nobody is signed in, rather than calling GitHub with no token", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            account: recordingGhAccountProvider(github, { signedIn: false }),
            eulaAccepted: () => true,
        });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        // The selected account cannot drive it, and recovery stays on that account.
        expect(result.failure.code).toBe("no-route");
        expect(result.failure.needsSignIn).toBe(true);
        expect(result.failure.message).toContain("gh");
        expect(github.calls).toHaveLength(0);
    });

    it("refuses a project whose map renders a dimension the workflow does not offer", async () => {
        await writeFile(
            join(world, "worldlens.project.json"),
            projectFile().replace("minecraft:overworld", "mystcraft:age_12"),
            "utf8",
        );
        const github = baseRoutes(new RecordingGitHub());
        const sync = makeSync({ github });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("unsupported-dimension");
        expect(github.never("/dispatches")).toBe(true);
    });

    it("refuses a world with no project file, and says where one comes from", async () => {
        await rm(join(world, "worldlens.project.json"));
        const github = baseRoutes(new RecordingGitHub());
        const sync = makeSync({ github });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-project");
        // A missing project is not a paragraph pointing at a wizard on another screen; it
        // names the direct remedy this failure code lets the surface offer instead.
        expect(result.failure.message).toContain("Create a cloud render configuration");
    });

    it("does not follow a second run for the same world and map at once", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on(
                "GET",
                /\/actions\/runs\/7$/,
                { status: 200, json: runJson({ id: 7, status: "in_progress" }) },
                {
                    status: 200,
                    json: runJson({ id: 7, status: "completed", conclusion: "failure" }),
                },
            )
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState({ runId: 7 });

        // A sleep the test holds open, so the first sync is provably still inside its
        // follow loop when the second one asks. A timing-based wait here would be a test
        // that passes on a fast machine and fails on a loaded runner.
        let release = (): void => {};
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const events: CiSyncEvent[] = [];
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            account: recordingGhAccountProvider(github),
            eulaAccepted: () => true,
            onEvent: (event) => events.push(event),
            now: () => NOW,
            sleep: () => held,
        });

        const first = sync.sync(request());
        await waitFor(() => events.some((event) => event.type === "run"));
        const second = await sync.sync(request({ follow: false }));
        release();
        await first;

        expect(second.ok).toBe(false);
        if (second.ok) return;
        expect(second.failure.code).toBe("already-running");
        expect(sync.activeSyncIds()).toHaveLength(0);
    });
});

describe("fetching a render made elsewhere", () => {
    /*
     * A second device, or a reinstall, has no `sync.json` for a run somebody else
     * dispatched - or that this same computer dispatched before it was wiped. `attach`
     * is the only path onto it: it writes the run's identity as a recorded "dispatched"
     * sync with no uploaded-world identity at all, then collects through the exact same
     * `#finishRecordedRun` path `resume` uses.
     */
    it("collects a run this computer never uploaded anything for, with no release identity recorded", async () => {
        const site = join(workDir, "attached-site");
        await mkdir(join(site, "maps", MAP_ID, "tiles"), { recursive: true });
        await writeFile(join(site, "settings.json"), '{"maps":["world"]}', "utf8");
        await writeFile(join(site, "maps", MAP_ID, "settings.json"), "{}", "utf8");
        await writeFile(join(site, "maps", MAP_ID, "tiles", "0.prbm"), "tile", "utf8");
        const archive = join(workDir, "attached-rendered-map.zip");
        const packed = await packFolder(site, archive);
        const bytes = new Uint8Array(await readFile(archive));

        const github = baseRoutes(new RecordingGitHub())
            .on("GET", /\/actions\/runs\/42$/, {
                status: 200,
                json: runJson({ id: 42, status: "completed", conclusion: "success" }),
            })
            .on("GET", "/actions/runs/42/jobs", { status: 200, json: { jobs: [] } })
            .on("GET", "/actions/runs/42/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({
                            id: 90,
                            name: "rendered-map",
                            bytes: bytes.byteLength,
                            digest: `sha256:${packed.sha256}`,
                        }),
                    ],
                },
            })
            .on("GET", "/artifacts/90/zip", { status: 200, bytes });

        const events: CiSyncEvent[] = [];
        const mounts = new LocalMapHandler();
        const result = await makeSync({ github, mounts, events }).attach({
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
            mapId: MAP_ID,
            runId: 42,
        });

        expect(result.ok && result.outcome === "rendered").toBe(true);
        if (!result.ok || result.outcome !== "rendered") return;
        expect(result.summary.releaseTag).toBeNull();
        expect(result.summary.assetName).toBeNull();
        expect(result.summary.uploaded).toBe(false);
        expect(mounts.getMounts()).toHaveLength(1);
        // Nothing was ever uploaded for a run this computer only attached to.
        expect(nothingUploaded(github)).toBe(true);
        expect(events.some((event) => event.type === "failed")).toBe(false);

        const syncId = syncIdFor(OWNER, REPO, world, MAP_ID);
        const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
        const saved = await readCiSyncState(workspace.stateFile);
        expect(saved?.stage).toBe("rendered");
        expect(saved?.runId).toBe(42);
        expect(saved?.releaseTag).toBeNull();
        expect(saved?.assetName).toBeNull();
    });

    /*
     * The bug this whole rewrite exists for: a run made elsewhere renders a completely
     * different world than the one open in this project. The local project here only
     * ever defines "world" - the artifact carries "fixture_10gb" instead, exactly the
     * shape a second device's huge test render would have. Attaching with no explicit
     * `mapId` used to force `chooseProjectMap`'s "only one enabled map, that must be it"
     * fallback onto this project's own "world", which the artifact never had a folder
     * for - refused as `artifact-not-a-map` for a reason that had nothing to do with the
     * artifact being broken. It must now read the run's own title first and register the
     * render under *that* identity instead.
     */
    it("registers under the run's own map id when it differs from the local project's map", async () => {
        const FOREIGN_MAP_ID = "fixture_10gb";
        const site = join(workDir, "foreign-site");
        await mkdir(join(site, "maps", FOREIGN_MAP_ID, "tiles"), { recursive: true });
        await writeFile(join(site, "settings.json"), '{"maps":["fixture_10gb"]}', "utf8");
        await writeFile(join(site, "maps", FOREIGN_MAP_ID, "settings.json"), "{}", "utf8");
        await writeFile(join(site, "maps", FOREIGN_MAP_ID, "tiles", "0.prbm"), "tile", "utf8");
        const archive = join(workDir, "foreign-rendered-map.zip");
        const packed = await packFolder(site, archive);
        const bytes = new Uint8Array(await readFile(archive));

        const github = baseRoutes(new RecordingGitHub())
            .on("GET", /\/actions\/runs\/77$/, {
                status: 200,
                json: {
                    ...(runJson({ id: 77, status: "completed", conclusion: "success" }) as Record<
                        string,
                        unknown
                    >),
                    display_title: `Render ${FOREIGN_MAP_ID} (minecraft:overworld)`,
                },
            })
            .on("GET", "/actions/runs/77/jobs", { status: 200, json: { jobs: [] } })
            .on("GET", "/actions/runs/77/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({
                            id: 91,
                            name: "rendered-map",
                            bytes: bytes.byteLength,
                            digest: `sha256:${packed.sha256}`,
                        }),
                    ],
                },
            })
            .on("GET", "/artifacts/91/zip", { status: 200, bytes });

        const mounts = new LocalMapHandler();
        // Deliberately no `mapId` here - this is the whole point of the fix. Only the
        // run's own title says what this render is.
        const result = await makeSync({ github, mounts }).attach({
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
            runId: 77,
        });

        expect(result.ok && result.outcome === "rendered").toBe(true);
        if (!result.ok || result.outcome !== "rendered") return;
        expect(result.summary.mapId).toBe(FOREIGN_MAP_ID);
        expect(mounts.getMounts()).toHaveLength(1);

        const syncId = syncIdFor(OWNER, REPO, world, FOREIGN_MAP_ID);
        const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
        const saved = await readCiSyncState(workspace.stateFile);
        expect(saved?.stage).toBe("rendered");
        expect(saved?.mapId).toBe(FOREIGN_MAP_ID);
        expect(saved?.runId).toBe(77);
    });

    it("refuses an invalid run id before touching GitHub", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const result = await makeSync({ github }).attach({
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
            mapId: MAP_ID,
            runId: 0,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("invalid-run");
        expect(github.never("/dispatches")).toBe(true);
    });

    it("lists a repository's completed runs and reads the map id back out of the run's own title", async () => {
        const github = baseRoutes(new RecordingGitHub()).on(
            "GET",
            /\/actions\/workflows\/render-world\.yml\/runs/,
            {
                status: 200,
                json: {
                    workflow_runs: [
                        {
                            ...(runJson({
                                id: 42,
                                status: "completed",
                                conclusion: "success",
                            }) as Record<string, unknown>),
                            display_title: "Render world (minecraft:overworld)",
                        },
                        {
                            ...(runJson({
                                id: 41,
                                status: "completed",
                                conclusion: "failure",
                            }) as Record<string, unknown>),
                            display_title: "Render world",
                        },
                    ],
                },
            },
        );

        const result = await makeSync({ github }).listAttachableRuns(OWNER, REPO);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.runs).toHaveLength(2);
        expect(result.runs[0]).toMatchObject({ id: 42, mapId: "world", conclusion: "success" });
        // A run whose title never named a map - dispatched from the Actions tab by hand, or
        // by a fork's own workflow - is still listed, just without a parsed map id.
        expect(result.runs[1]).toMatchObject({ id: 41, mapId: null });
    });

    it("reports the exact refusal when the selected credential cannot reach the repository", async () => {
        const github = new RecordingGitHub().on("GET", /\/actions\/workflows\/render-world\.yml$/, {
            status: 404,
            json: { message: "Not Found" },
        });

        const result = await makeSync({ github }).listAttachableRuns(OWNER, REPO);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-route");
    });
});
