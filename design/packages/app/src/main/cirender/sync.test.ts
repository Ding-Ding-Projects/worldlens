/**
 * The loop, against a recording fake of the GitHub API.
 *
 * Every assertion here is about one of the four promises this feature makes, and half of
 * them are **negative** - that something did *not* happen. Those are the ones a stub that
 * merely answered could never check, and they are the ones that matter: an unchanged world
 * that gets uploaded again costs an evening, and a failed run that registers a map costs
 * somebody's trust in every map in the list.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { ciSyncWorkspace, newCiSyncState, readCiSyncState, syncIdFor, writeCiSyncState } from "./state.js";
import { CiRenderSync } from "./sync.js";
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
            render: { threads: null, force: false, fixEdges: false, metrics: false, outputFolder: null },
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
    return github.countOf(/\/releases$/, "POST") === 0 && github.countOf("/assets?name=", "POST") === 0;
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
}): CiRenderSync {
    return new CiRenderSync({
        storageDir: () => join(workDir, "maps"),
        account: recordingGhAccountProvider(options.github),
        eulaAccepted: () => options.eulaAccepted ?? true,
        ...(options.mounts === undefined ? {} : { mounts: options.mounts }),
        ...(options.events === undefined ? {} : { onEvent: (event) => options.events?.push(event) }),
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

/** Routes every test needs: the repository (for the ref) and the dispatch itself. */
function baseRoutes(
    github: RecordingGitHub,
    isPrivate = true,
    canWrite = true,
): RecordingGitHub {
    return github
        .on("POST", "/dispatches", { status: 204 })
        // The capability probe: the cheapest call that proves a credential can see Actions
        // on this repository under the selected broker lease.
        .on("GET", /\/actions\/workflows\/render-world\.yml$/, {
            status: 200,
            json: { id: 1, name: "Render world", state: "active", path: ".github/workflows/render-world.yml" },
        })
        .on("GET", /\/repos\/o\/r$/, {
            status: 200,
            json: repositoryJson({ owner: OWNER, repo: REPO, isPrivate, canWrite }),
        });
}

/** Writes the record a previous successful upload would have left. */
async function seedUploadedState(options: { runId?: number; accountId?: string } = {}): Promise<string> {
    const syncId = syncIdFor(OWNER, REPO, world, MAP_ID);
    const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
    const fingerprint = await fingerprintWorld(world);
    await writeCiSyncState(workspace.stateFile, {
        ...newCiSyncState({
            syncId,
            owner: OWNER,
            repo: REPO,
            ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
            worldFolder: world,
            mapId: MAP_ID,
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
        runUrl: options.runId === undefined ? null : `https://github.test/runs/${String(options.runId)}`,
    });
    return syncId;
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
            assets: [{ id: 1, name: ASSET_NAME, size: 1024, state: "uploaded", browser_download_url: "" }],
        },
    });
}

/* -------------------------------------------------------------------------- */

describe("what leaves this computer is said first", () => {
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
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "in_progress" }) })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: { jobs: [jobJson({ id: 42, name: "Measure and plan", status: "in_progress" })] },
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
            .on("GET", `/releases/tags/${RELEASE_TAG}`, { status: 404, json: { message: "Not Found" } })
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
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
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
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
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
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
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        await writeFile(join(world, "region", "r.0.1.mca"), "a new region nobody had rendered");
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, events });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        const progress = events.filter(
            (event): event is Extract<CiSyncEvent, { type: "progress" }> => event.type === "progress",
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
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
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
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
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
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "in_progress" }) })
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
    it("says which wave a job belongs to, read from its own name", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "in_progress" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "in_progress" }) })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({ id: 41, name: "Build the BlueMap CLI", status: "completed", conclusion: "success" }),
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
        if (!result.ok || result.outcome !== "running") throw new Error("expected a running outcome");
        // A job with no wave in its own name is null, never a guessed 0.
        expect(result.run?.jobs.map((job) => job.wave)).toEqual([null, 1, 1, 2, null]);
    });

    it("answers with the real per-job states and no conclusion", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "in_progress" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "in_progress" }) })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({ id: 41, name: "Build the BlueMap CLI", status: "completed", conclusion: "success" }),
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
        if (!result.ok || result.outcome !== "running") throw new Error("expected a running outcome");
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
                { status: 200, json: runJson({ id: 7, status: "completed", conclusion: "failure" }) },
            )
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: { jobs: [jobJson({ id: 42, name: "Wave 1", status: "completed", conclusion: "failure" })] },
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
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "in_progress" }) })
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
                        jobJson({ id: 41, name: "Build the BlueMap CLI", status: "completed", conclusion: "success" }),
                        jobJson({ id: 42, name: "Merge group 0", status: "completed", conclusion: "failure" }),
                        jobJson({ id: 43, name: "Wave 2", status: "completed", conclusion: "cancelled" }),
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
        expect(result.failure.logExcerpt).toContain("did not finish");
        expect(result.failure.run?.conclusion).toBe("failure");
        // The three things a failed run must never produce.
        expect(github.never("/artifacts")).toBe(true);
        expect(mounts.getMounts()).toHaveLength(0);
        expect((await readCiSyncState(ciSyncWorkspace(join(workDir, "maps"), syncId).stateFile))?.renderId).toBeNull();
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
                        jobJson({ id: 40, name: "Wave 1", status: "completed", conclusion: "cancelled" }),
                        jobJson({ id: 42, name: "Wave 3", status: "completed", conclusion: "failure" }),
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
                json: { jobs: [jobJson({ id: 42, name: "Wave 1", status: "completed", conclusion: "timed_out" })] },
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

describe("a successful run comes back as a map in the list", () => {
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
                json: { jobs: [jobJson({ id: 42, name: "Merge group 0", status: "completed", conclusion: "success" })] },
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
        if (!result.ok || result.outcome !== "rendered") throw new Error("expected a rendered outcome");
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
                        artifactJson({ id: 9, name: "rendered-map", bytes: 4, digest: `sha256:${"b".repeat(64)}` }),
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

    it("refuses a map that shipped in parts rather than half-unpacking it", async () => {
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
                        artifactJson({ id: 11, name: "partial-hires-1", bytes: 10 }),
                    ],
                },
            });
        await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, mounts });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("map-shipped-in-parts");
        expect(result.failure.message).toContain("partial-hires-0");
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
        expect(result.failure.message).toContain("wizard");
    });

    it("does not follow a second run for the same world and map at once", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on(
                "GET",
                /\/actions\/runs\/7$/,
                { status: 200, json: runJson({ id: 7, status: "in_progress" }) },
                { status: 200, json: runJson({ id: 7, status: "completed", conclusion: "failure" }) },
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
