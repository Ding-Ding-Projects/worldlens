import { describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
    CLOSED_INTERVAL_MS,
    ComingSoonWatcher,
    LOW_RATE_REMAINING,
    MAX_COMMITS,
    MAX_SUBJECT_LENGTH,
    MIN_REFRESH_GAP_MS,
    OPEN_INTERVAL_MS,
    STALL_AFTER_MS,
    STARTUP_DELAY_MS,
    commitSubject,
    estimateFrom,
    readContents,
    stageStateFor,
    versionForRun,
    type ComingSoonState,
    type ComingSoonTimers,
    type FetchLike,
} from "./comingSoon.js";
import { COMING_SOON_CHANNELS, registerComingSoonHandlers } from "./comingSoonIpc.js";

/* -------------------------------------------------------------------------- */
/* A fake GitHub                                                              */
/* -------------------------------------------------------------------------- */

const NOW = Date.parse("2026-11-25T12:00:00Z");
const iso = (minutesAgo: number): string => new Date(NOW - minutesAgo * 60_000).toISOString();

interface RunSpec {
    readonly number: number;
    readonly status: string;
    readonly conclusion?: string | null;
    readonly createdMinutesAgo?: number;
    readonly startedMinutesAgo?: number;
    /** Minutes after `started` that the run last changed; sets `updated_at`. */
    readonly durationMinutes?: number;
    readonly sha?: string;
    readonly branch?: string;
}

function runJson(spec: RunSpec): Record<string, unknown> {
    const started = spec.startedMinutesAgo ?? 5;
    const created = spec.createdMinutesAgo ?? started + 1;
    const updated =
        spec.durationMinutes === undefined ? iso(0) : iso(started - spec.durationMinutes);
    return {
        id: 9000 + spec.number,
        run_number: spec.number,
        status: spec.status,
        conclusion: spec.conclusion ?? null,
        head_sha: spec.sha ?? `sha${spec.number}`,
        head_branch: spec.branch ?? "main",
        created_at: iso(created),
        run_started_at: iso(started),
        updated_at: updated,
    };
}

function jobJson(
    id: number,
    name: string,
    status: string,
    conclusion: string | null = null,
    startedMinutesAgo: number | null = null,
): Record<string, unknown> {
    return {
        id,
        name,
        status,
        conclusion,
        started_at: startedMinutesAgo === null ? null : iso(startedMinutesAgo),
        completed_at: status === "completed" ? iso((startedMinutesAgo ?? 1) - 1) : null,
        steps: [],
    };
}

function commitJson(sha: string, message: string): Record<string, unknown> {
    return { sha, commit: { message } };
}

interface Reply {
    readonly status?: number;
    readonly body?: unknown;
    readonly headers?: Record<string, string>;
    readonly throws?: boolean;
    readonly notJson?: boolean;
}

class FakeGitHub {
    runs: Record<string, unknown>[] = [];
    jobs: Record<string, unknown>[] = [];
    compare: Reply = { body: { total_commits: 0, commits: [] } };
    /** Overrides every answer, e.g. to model a rate limit or a dead network. */
    override: Reply | null = null;
    readonly requests: { url: string; headers: Record<string, string> }[] = [];
    etags = false;
    private readonly seenEtags = new Map<string, string>();

    readonly fetch: FetchLike = async (url, init) => {
        this.requests.push({ url, headers: { ...init.headers } });
        const reply = this.override ?? this.replyFor(url);
        if (reply.throws === true) throw new Error("network down");
        let status = reply.status ?? 200;
        const headers = new Map(Object.entries(reply.headers ?? {}));
        const body = reply.body;
        if (this.etags && status === 200) {
            const tag = `"${JSON.stringify(body).length}-${JSON.stringify(body).slice(0, 40)}"`;
            headers.set("etag", tag);
            if (init.headers["If-None-Match"] === tag) status = 304;
            this.seenEtags.set(url, tag);
        }
        return {
            status,
            headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
            json: async () => {
                if (reply.notJson === true) throw new SyntaxError("not json");
                return body;
            },
        };
    };

    private replyFor(url: string): Reply {
        if (url.includes("/actions/workflows/")) return { body: { workflow_runs: this.runs } };
        if (url.includes("/jobs")) return { body: { jobs: this.jobs } };
        if (url.includes("/compare/")) return this.compare;
        return { status: 404, body: {} };
    }

    count(fragment: string): number {
        return this.requests.filter((request) => request.url.includes(fragment)).length;
    }
}

class FakeTimers implements ComingSoonTimers {
    readonly pending: { handle: number; delay: number; run: () => void }[] = [];
    private next = 1;
    setTimeout(callback: () => void, ms: number): unknown {
        const handle = this.next++;
        this.pending.push({ handle, delay: ms, run: callback });
        return handle;
    }
    clearTimeout(handle: unknown): void {
        const index = this.pending.findIndex((entry) => entry.handle === handle);
        if (index >= 0) this.pending.splice(index, 1);
    }
    get delay(): number | null {
        return this.pending.at(-1)?.delay ?? null;
    }
}

function watcher(
    github: FakeGitHub,
    options: {
        currentVersion?: string;
        enabled?: () => boolean;
        timers?: FakeTimers;
        changes?: ComingSoonState[];
        now?: () => number;
    } = {},
): ComingSoonWatcher {
    return new ComingSoonWatcher({
        repository: "Ding-Ding-Projects/worldlens",
        currentVersion: options.currentVersion ?? "1.0.2400",
        fetch: github.fetch,
        now: options.now ?? (() => NOW),
        timers: options.timers ?? new FakeTimers(),
        ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
        onChange: (state) => options.changes?.push(state),
    });
}

/** Three earlier successful builds that each took 40 minutes. */
const history = (): Record<string, unknown>[] => [
    runJson({ number: 2390, status: "completed", conclusion: "success", startedMinutesAgo: 600, durationMinutes: 40 }),
    runJson({ number: 2391, status: "completed", conclusion: "success", startedMinutesAgo: 500, durationMinutes: 40 }),
    runJson({ number: 2392, status: "completed", conclusion: "success", startedMinutesAgo: 400, durationMinutes: 40 }),
];

function asBuilding(state: ComingSoonState): Extract<ComingSoonState, { kind: "building" }> {
    if (state.kind !== "building") throw new Error(`expected building, got ${state.kind}`);
    return state;
}

/* -------------------------------------------------------------------------- */
/* A build in flight                                                          */
/* -------------------------------------------------------------------------- */

describe("a build in flight", () => {
    it("maps the run's jobs to stages, in order, with the publishing job last", async () => {
        const github = new FakeGitHub();
        github.runs = [
            runJson({ number: 2401, status: "in_progress", startedMinutesAgo: 20 }),
            ...history(),
        ];
        github.jobs = [
            jobJson(3, "Publish release", "queued"),
            jobJson(1, "Build workspace", "completed", "success", 19),
            jobJson(2, "Windows installer", "in_progress", null, 10),
            jobJson(4, "BlueMap jars", "completed", "failure", 18),
            jobJson(5, "Container image", "completed", "skipped", 17),
        ];
        const state = asBuilding(await watcher(github).refresh());

        expect(state.runNumber).toBe(2401);
        expect(state.version).toBe("1.0.2401");
        expect(state.phase).toBe("running");
        expect(state.stages.map((stage) => [stage.kind, stage.label, stage.state])).toEqual([
            ["source", "", "done"],
            ["queue", "", "done"],
            ["part", "Build workspace", "done"],
            ["part", "Windows installer", "running"],
            ["part", "BlueMap jars", "failed"],
            ["part", "Container image", "skipped"],
            ["publish", "Publish release", "waiting"],
        ]);
        // Only rows that are really done count, so the bar can only move when a row does.
        expect(state.stagesDone).toBe(3);
        expect(state.stagesTotal).toBe(7);
    });

    it("says a queued run is waiting its turn, with every build part waiting", async () => {
        const github = new FakeGitHub();
        github.runs = [runJson({ number: 2401, status: "queued", startedMinutesAgo: 2 })];
        github.jobs = [
            jobJson(1, "Build workspace", "queued"),
            jobJson(2, "Publish release", "queued"),
        ];
        const state = asBuilding(await watcher(github).refresh());

        expect(state.phase).toBe("queued");
        expect(state.stages.map((stage) => stage.state)).toEqual([
            "done",
            "running",
            "waiting",
            "waiting",
        ]);
        expect(state.stagesDone).toBe(1);
    });

    it("reports a stalled build once no stage has changed for the stall window", async () => {
        const github = new FakeGitHub();
        const late = STALL_AFTER_MS / 60_000 + 5;
        github.runs = [runJson({ number: 2401, status: "in_progress", startedMinutesAgo: late + 1 })];
        github.jobs = [jobJson(1, "Windows installer", "in_progress", null, late)];
        expect(asBuilding(await watcher(github).refresh()).stalled).toBe(true);

        const fresh = new FakeGitHub();
        fresh.runs = [runJson({ number: 2401, status: "in_progress", startedMinutesAgo: 30 })];
        fresh.jobs = [jobJson(1, "Windows installer", "in_progress", null, 10)];
        expect(asBuilding(await watcher(fresh).refresh()).stalled).toBe(false);
    });

    it("lists what it will contain as commit subjects only, newest first", async () => {
        const github = new FakeGitHub();
        github.runs = [runJson({ number: 2401, status: "in_progress", sha: "headsha" })];
        github.compare = {
            body: {
                total_commits: 2,
                commits: [
                    commitJson("aaa", "Older change\n\nA long body that must not be shown."),
                    commitJson("bbb", "Newer change"),
                ],
            },
        };
        const state = asBuilding(await watcher(github).refresh());

        expect(state.contents?.commits.map((commit) => commit.subject)).toEqual([
            "Newer change",
            "Older change",
        ]);
        expect(JSON.stringify(state)).not.toContain("A long body");
        const compare = github.requests.find((request) => request.url.includes("/compare/"));
        expect(compare?.url).toContain("v1.0.2400...headsha");
    });

    it("says the contents are unavailable when the installed tag cannot be compared", async () => {
        const github = new FakeGitHub();
        github.runs = [runJson({ number: 2401, status: "in_progress" })];
        github.compare = { status: 404, body: {} };
        const state = asBuilding(await watcher(github).refresh());
        expect(state.contents).toBeNull();
        expect(state.contentsUnavailable).toBe("no-base");
        // The rest of the picture is still real.
        expect(state.stages.length).toBeGreaterThan(0);
    });

    it("carries the estimate from earlier successful builds and labels how many", async () => {
        const github = new FakeGitHub();
        github.runs = [runJson({ number: 2401, status: "in_progress" }), ...history()];
        const state = asBuilding(await watcher(github).refresh());
        expect(state.estimate).toEqual({ typicalMs: 40 * 60_000, sampleCount: 3 });
    });

    it("carries no estimate when there are too few earlier builds to base one on", async () => {
        const github = new FakeGitHub();
        github.runs = [runJson({ number: 2401, status: "in_progress" }), ...history().slice(0, 2)];
        expect(asBuilding(await watcher(github).refresh()).estimate).toBeNull();
    });

    it("ignores runs on other branches and runs that are not newer than the installed version", async () => {
        const github = new FakeGitHub();
        github.runs = [
            runJson({ number: 2409, status: "in_progress", branch: "feature/x" }),
            runJson({ number: 2399, status: "in_progress" }),
        ];
        const state = await watcher(github).refresh();
        expect(state.kind).toBe("none");
    });
});

/* -------------------------------------------------------------------------- */
/* Absence, and the end of a build                                            */
/* -------------------------------------------------------------------------- */

describe("when nothing is in flight", () => {
    it("has no card at all", async () => {
        const github = new FakeGitHub();
        github.runs = history();
        const state = await watcher(github).refresh();
        expect(state).toMatchObject({ kind: "none", lastOutcome: null });
    });

    it("lets a published release supersede the coming-soon state", async () => {
        const github = new FakeGitHub();
        const instance = watcher(github);
        github.runs = [runJson({ number: 2401, status: "in_progress" })];
        expect((await instance.refresh()).kind).toBe("building");

        github.runs = [
            runJson({ number: 2401, status: "completed", conclusion: "success", durationMinutes: 30 }),
        ];
        expect(await instance.refresh()).toMatchObject({ kind: "none", lastOutcome: "published" });

        // And the one after that has nothing left to say about it.
        expect(await instance.refresh()).toMatchObject({ kind: "none", lastOutcome: null });
    });

    it("says a watched build failed, naming the stage, and keeps saying it until a later build ships", async () => {
        const github = new FakeGitHub();
        const instance = watcher(github);
        github.runs = [runJson({ number: 2401, status: "in_progress" })];
        await instance.refresh();

        github.runs = [runJson({ number: 2401, status: "completed", conclusion: "failure" })];
        github.jobs = [
            jobJson(1, "Build workspace", "completed", "success", 5),
            jobJson(2, "Windows installer", "completed", "failure", 4),
        ];
        const failed = await instance.refresh();
        expect(failed).toMatchObject({
            kind: "failed",
            runNumber: 2401,
            version: "1.0.2401",
            conclusion: "failure",
            failedStage: "Windows installer",
        });
        expect((await instance.refresh()).kind).toBe("failed");

        github.runs = [
            runJson({ number: 2402, status: "completed", conclusion: "success", durationMinutes: 30 }),
            runJson({ number: 2401, status: "completed", conclusion: "failure" }),
        ];
        expect((await instance.refresh()).kind).toBe("none");
    });

    it("never says a build failed that it never saw in flight", async () => {
        const github = new FakeGitHub();
        github.runs = [runJson({ number: 2401, status: "completed", conclusion: "failure" })];
        expect((await watcher(github).refresh()).kind).toBe("none");
    });

    it("notes when a newer build replaced one that ended without shipping", async () => {
        const github = new FakeGitHub();
        const instance = watcher(github);
        github.runs = [runJson({ number: 2401, status: "in_progress" })];
        await instance.refresh();

        github.runs = [
            runJson({ number: 2402, status: "in_progress" }),
            runJson({ number: 2401, status: "completed", conclusion: "cancelled" }),
        ];
        const state = asBuilding(await instance.refresh());
        expect(state.runNumber).toBe(2402);
        expect(state.replacedRun).toBe(2401);
    });
});

/* -------------------------------------------------------------------------- */
/* Honest failure                                                             */
/* -------------------------------------------------------------------------- */

describe("when it cannot tell", () => {
    it("says it could not check, with no stages, when the network is down", async () => {
        const github = new FakeGitHub();
        github.override = { throws: true };
        const state = await watcher(github).refresh();
        expect(state).toMatchObject({ kind: "unknown", reason: "offline" });
        expect(state).not.toHaveProperty("stages");
    });

    it("does not carry the last good picture across a failed check as if it were current", async () => {
        const github = new FakeGitHub();
        const instance = watcher(github);
        github.runs = [runJson({ number: 2401, status: "in_progress" })];
        github.jobs = [jobJson(1, "Windows installer", "in_progress", null, 3)];
        expect((await instance.refresh()).kind).toBe("building");

        github.override = { throws: true };
        const state = await instance.refresh();
        expect(state.kind).toBe("unknown");
        expect(state).not.toHaveProperty("stages");
        expect(state).not.toHaveProperty("stagesDone");
        expect(instance.current()).toBe(state);
    });

    it("reports a spent rate limit with the time it will look again, and invents nothing", async () => {
        const github = new FakeGitHub();
        const reset = Math.floor(NOW / 1000) + 1800;
        github.override = {
            status: 403,
            body: { message: "rate limit exceeded" },
            headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
        };
        const timers = new FakeTimers();
        const state = await watcher(github, { timers }).refresh();
        expect(state).toMatchObject({
            kind: "unknown",
            reason: "rate-limited",
            retryAt: new Date(reset * 1000).toISOString(),
        });
        expect(state).not.toHaveProperty("stages");
        // It waits for the allowance to come back rather than hammering.
        expect(timers.delay).toBe(1800 * 1000);
    });

    it("treats an unreadable or unexpected answer as unavailable", async () => {
        const github = new FakeGitHub();
        github.override = { notJson: true };
        expect(await watcher(github).refresh()).toMatchObject({
            kind: "unknown",
            reason: "offline",
        });

        const odd = new FakeGitHub();
        odd.override = { body: { not: "runs" } };
        expect(await watcher(odd).refresh()).toMatchObject({
            kind: "unknown",
            reason: "unavailable",
        });

        const missing = new FakeGitHub();
        missing.override = { status: 404, body: {} };
        expect(await watcher(missing).refresh()).toMatchObject({
            kind: "unknown",
            reason: "unavailable",
        });
    });
});

/* -------------------------------------------------------------------------- */
/* Estimate, contents, small rules                                            */
/* -------------------------------------------------------------------------- */

describe("the estimate", () => {
    const completed = (number: number, minutes: number) =>
        asRun(runJson({ number, status: "completed", conclusion: "success", startedMinutesAgo: 900 - number, durationMinutes: minutes }));

    it("takes the median of recent successful builds", () => {
        const odd = estimateFrom([completed(1, 30), completed(2, 90), completed(3, 40)]);
        expect(odd).toEqual({ typicalMs: 40 * 60_000, sampleCount: 3 });
        const even = estimateFrom([completed(1, 30), completed(2, 50), completed(3, 40), completed(4, 100)]);
        expect(even).toEqual({ typicalMs: 45 * 60_000, sampleCount: 4 });
    });

    it("ignores failures, in-flight runs and runs with no usable duration", () => {
        const failed = asRun(runJson({ number: 9, status: "completed", conclusion: "failure", durationMinutes: 5 }));
        const flying = asRun(runJson({ number: 10, status: "in_progress" }));
        const backwards = asRun({
            ...runJson({ number: 11, status: "completed", conclusion: "success" }),
            updated_at: iso(600),
            run_started_at: iso(10),
        });
        expect(estimateFrom([failed, flying, backwards, completed(1, 30), completed(2, 40)])).toBeNull();
    });

    it("uses at most ten earlier builds", () => {
        const many = Array.from({ length: 14 }, (_, index) => completed(index + 1, 10 + index));
        expect(estimateFrom(many)?.sampleCount).toBe(10);
    });
});

function asRun(json: Record<string, unknown>) {
    return {
        id: json["id"] as number,
        runNumber: json["run_number"] as number,
        status: json["status"] as string,
        conclusion: (json["conclusion"] as string | null) ?? null,
        headSha: json["head_sha"] as string,
        headBranch: json["head_branch"] as string,
        createdAt: json["created_at"] as string,
        startedAt: json["run_started_at"] as string,
        updatedAt: json["updated_at"] as string,
    };
}

describe("commit subjects", () => {
    it("keeps the first line only and trims it", () => {
        expect(commitSubject("  Fix the thing  \n\nBody text\nmore")).toBe("Fix the thing");
        expect(commitSubject("Windows line\r\nsecond")).toBe("Windows line");
    });

    it("cuts a very long subject with an ellipsis, within the cap", () => {
        const cut = commitSubject("x".repeat(500));
        expect(cut.length).toBe(MAX_SUBJECT_LENGTH);
        expect(cut.endsWith("…")).toBe(true);
        expect(commitSubject("y".repeat(MAX_SUBJECT_LENGTH))).toBe("y".repeat(MAX_SUBJECT_LENGTH));
    });

    it("lists at most the cap, newest first, and says how many there are in all", () => {
        const commits = Array.from({ length: MAX_COMMITS + 12 }, (_, index) =>
            commitJson(`sha${index}`, `change ${index}`),
        );
        const contents = readContents({ total_commits: commits.length, commits });
        expect(contents?.commits).toHaveLength(MAX_COMMITS);
        expect(contents?.commits[0]?.subject).toBe(`change ${commits.length - 1}`);
        expect(contents?.total).toBe(MAX_COMMITS + 12);
        expect(contents?.truncated).toBe(true);
    });

    it("refuses an answer that is not a compare", () => {
        expect(readContents({ nope: true })).toBeNull();
        expect(readContents(null)).toBeNull();
    });
});

describe("version and stage rules", () => {
    it("derives the version a run will publish from the installed major and minor", () => {
        expect(versionForRun("1.0.2400", 2401)).toBe("1.0.2401");
        expect(versionForRun("v2.3.9", 12)).toBe("2.3.12");
        expect(versionForRun("not-a-version", 5)).toBeNull();
    });

    it("speaks job outcomes in the five stage words", () => {
        expect(stageStateFor("queued", null)).toBe("waiting");
        expect(stageStateFor("waiting", null)).toBe("waiting");
        expect(stageStateFor("in_progress", null)).toBe("running");
        expect(stageStateFor("completed", "success")).toBe("done");
        expect(stageStateFor("completed", "skipped")).toBe("skipped");
        expect(stageStateFor("completed", "cancelled")).toBe("skipped");
        expect(stageStateFor("completed", "failure")).toBe("failed");
        expect(stageStateFor("completed", "timed_out")).toBe("failed");
    });
});

/* -------------------------------------------------------------------------- */
/* What goes over the wire                                                    */
/* -------------------------------------------------------------------------- */

describe("the requests", () => {
    it("send no credential, account or user data", async () => {
        const github = new FakeGitHub();
        github.runs = [runJson({ number: 2401, status: "in_progress" })];
        await watcher(github).refresh();
        expect(github.requests.length).toBeGreaterThan(0);
        for (const request of github.requests) {
            expect(Object.keys(request.headers).map((name) => name.toLowerCase())).not.toContain(
                "authorization",
            );
            expect(request.url.startsWith("https://api.github.com/repos/Ding-Ding-Projects/worldlens/")).toBe(true);
            expect(JSON.stringify(request.headers)).not.toMatch(/token|bearer/i);
        }
    });

    it("reuse an unchanged answer through the conditional request", async () => {
        const github = new FakeGitHub();
        github.etags = true;
        github.runs = history();
        const instance = watcher(github);
        await instance.refresh();
        const second = await instance.refresh();

        const lists = github.requests.filter((request) => request.url.includes("/actions/workflows/"));
        expect(lists).toHaveLength(2);
        expect(lists[0]?.headers["If-None-Match"]).toBeUndefined();
        expect(lists[1]?.headers["If-None-Match"]).toBeDefined();
        // A "not modified" answer is an unchanged picture, not a failure.
        expect(second.kind).toBe("none");
    });

    it("compare a given pair of commits only once", async () => {
        const github = new FakeGitHub();
        github.runs = [runJson({ number: 2401, status: "in_progress", sha: "same" })];
        github.compare = { body: { total_commits: 1, commits: [commitJson("a", "One")] } };
        const instance = watcher(github);
        await instance.refresh();
        await instance.refresh();
        expect(github.count("/compare/")).toBe(1);
    });
});

/* -------------------------------------------------------------------------- */
/* Cadence                                                                    */
/* -------------------------------------------------------------------------- */

describe("polling cadence", () => {
    it("waits out the startup delay, then polls slowly when nobody is looking", async () => {
        const github = new FakeGitHub();
        github.runs = history();
        const timers = new FakeTimers();
        const instance = watcher(github, { timers });
        instance.start();
        expect(github.requests).toHaveLength(0);
        expect(timers.delay).toBe(STARTUP_DELAY_MS);

        timers.pending[0]?.run();
        await Promise.resolve();
        await instance.refresh();
        expect(timers.delay).toBe(CLOSED_INTERVAL_MS);
    });

    it("looks at once and speeds up while the Updates surface is open, then slows again", async () => {
        const github = new FakeGitHub();
        github.runs = history();
        const timers = new FakeTimers();
        let time = NOW;
        const instance = watcher(github, { timers, now: () => time });
        instance.start();

        time += STARTUP_DELAY_MS;
        instance.setWatching(true);
        await instance.refresh();
        expect(github.count("/actions/workflows/")).toBeGreaterThanOrEqual(1);
        expect(timers.delay).toBe(OPEN_INTERVAL_MS);

        instance.setWatching(false);
        expect(timers.delay).toBe(CLOSED_INTERVAL_MS);
    });

    it("does not refresh again inside the minimum gap when the surface is reopened", async () => {
        const github = new FakeGitHub();
        github.runs = history();
        let time = NOW;
        const instance = watcher(github, { now: () => time });
        instance.start();
        await instance.refresh();
        const before = github.count("/actions/workflows/");
        time += MIN_REFRESH_GAP_MS - 1;
        instance.setWatching(true);
        await Promise.resolve();
        expect(github.count("/actions/workflows/")).toBe(before);
    });

    it("never keeps the fast cadence when the hour's allowance is nearly spent", async () => {
        const github = new FakeGitHub();
        github.runs = history();
        github.override = {
            body: { workflow_runs: github.runs },
            headers: { "x-ratelimit-remaining": String(LOW_RATE_REMAINING - 1) },
        };
        const timers = new FakeTimers();
        const instance = watcher(github, { timers });
        instance.start();
        instance.setWatching(true);
        await instance.refresh();
        expect(timers.delay).toBe(CLOSED_INTERVAL_MS);
    });

    it("never polls in a build that cannot update itself", async () => {
        const github = new FakeGitHub();
        const timers = new FakeTimers();
        const changes: ComingSoonState[] = [];
        const instance = watcher(github, { enabled: () => false, timers, changes });
        instance.start();
        instance.setWatching(true);
        const state = await instance.refresh();
        expect(github.requests).toHaveLength(0);
        expect(timers.pending).toHaveLength(0);
        expect(state).toMatchObject({ kind: "unknown", reason: "disabled" });
    });

    it("pushes each new state to its listener, and a throwing listener does not stop it", async () => {
        const github = new FakeGitHub();
        github.runs = [runJson({ number: 2401, status: "in_progress" })];
        const changes: ComingSoonState[] = [];
        const instance = new ComingSoonWatcher({
            repository: "Ding-Ding-Projects/worldlens",
            currentVersion: "1.0.2400",
            fetch: github.fetch,
            now: () => NOW,
            timers: new FakeTimers(),
            onChange: (state) => {
                changes.push(state);
                throw new Error("listener broke");
            },
        });
        const state = await instance.refresh();
        expect(state.kind).toBe("building");
        expect(changes).toHaveLength(1);
    });
});

/* -------------------------------------------------------------------------- */
/* The channel                                                                */
/* -------------------------------------------------------------------------- */

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function fakeIpcMain(): IpcMain & { readonly handlers: Map<string, Handler> } {
    const handlers = new Map<string, Handler>();
    return {
        handlers,
        handle(channel: string, handler: Handler): void {
            handlers.set(channel, handler);
        },
        removeHandler(channel: string): void {
            handlers.delete(channel);
        },
    } as unknown as IpcMain & { readonly handlers: Map<string, Handler> };
}

describe("the coming-soon channel", () => {
    const event = {} as IpcMainInvokeEvent;
    const buildingState: ComingSoonState = { kind: "none", checkedAt: null, lastOutcome: null };

    function stub() {
        const calls: boolean[] = [];
        let refreshes = 0;
        return {
            calls,
            refreshes: () => refreshes,
            watcher: {
                current: () => buildingState,
                refresh: async () => {
                    refreshes += 1;
                    return buildingState;
                },
                setWatching: (open: boolean) => {
                    calls.push(open);
                },
            },
        };
    }

    it("answers the application's own interface and removes exactly its own channels", async () => {
        const ipcMain = fakeIpcMain();
        const fake = stub();
        const ipc = registerComingSoonHandlers(ipcMain, { watcher: fake.watcher, trusted: () => true });
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...COMING_SOON_CHANNELS].sort());

        expect(await ipcMain.handlers.get("update:comingSoon")?.(event)).toBe(buildingState);
        expect(await ipcMain.handlers.get("update:comingSoonRefresh")?.(event)).toBe(buildingState);
        await ipcMain.handlers.get("update:comingSoonWatching")?.(event, true);
        await ipcMain.handlers.get("update:comingSoonWatching")?.(event, "yes");
        // Only a real `true` speeds polling up.
        expect(fake.calls).toEqual([true, false]);

        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("refuses any sender that is not the application's own interface, with a value, not a rejection", async () => {
        const ipcMain = fakeIpcMain();
        const fake = stub();
        registerComingSoonHandlers(ipcMain, { watcher: fake.watcher, trusted: () => false });

        for (const channel of COMING_SOON_CHANNELS) {
            const answer = await ipcMain.handlers.get(channel)?.(event, true);
            expect(answer).toMatchObject({ kind: "unknown", reason: "refused" });
        }
        expect(fake.calls).toEqual([]);
        expect(fake.refreshes()).toBe(0);
    });

    it("refuses by default, since no renderer is trusted until the main window exists", async () => {
        const ipcMain = fakeIpcMain();
        const fake = stub();
        registerComingSoonHandlers(ipcMain, { watcher: fake.watcher });
        const answer = await ipcMain.handlers.get("update:comingSoon")?.(event);
        expect(answer).toMatchObject({ kind: "unknown", reason: "refused" });
    });
});
