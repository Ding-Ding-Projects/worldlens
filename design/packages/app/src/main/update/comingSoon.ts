/**
 * "Update coming soon": the build that is being made but is not published yet.
 *
 * The updater only knows about releases that exist. Between a push to `main` and the moment
 * the CI workflow publishes its release there is a window of tens of minutes in which a newer
 * build is on its way and the Updates surface says nothing, or says "up to date". This module
 * reads that window from the one place that really knows about it: the repository's own
 * public workflow runs.
 *
 * ## What it never does
 *
 *  - It never installs, downloads or restarts anything and never touches an automatic-update
 *    choice. It produces a description, and the renderer draws it.
 *  - It never invents progress. Every stage row is a job the workflow really has, with the
 *    state GitHub reported for it; the count of finished stages is a count of those rows. A
 *    request that fails produces an `unknown` state with a reason, not the last good picture
 *    dressed up as current.
 *  - It sends no credential, account or user data. Requests are unauthenticated reads of a
 *    public repository, with a bounded timeout, conditional (ETag) so an unchanged answer
 *    does not spend rate limit, and spaced out so the unauthenticated hourly allowance is
 *    not what the Updates surface runs on.
 *
 * ## How the pieces are chosen
 *
 * The release identity is `major.minor.<run number>` (see `scripts/release-version.mjs`), so
 * the version a run will publish is known from the run number alone, before anything is built.
 * "What it will contain" is the compare of the installed version's tag against the run's head
 * commit, shown as commit subjects only.
 *
 * Every seam (fetch, clock, timers) is injected, so the whole thing is tested with a fake
 * fetch and no network.
 */

import { isStrictlyNewerVersion } from "./version.js";

/* -------------------------------------------------------------------------- */
/* Public shapes                                                              */
/* -------------------------------------------------------------------------- */

export type ComingSoonStageState = "waiting" | "running" | "done" | "failed" | "skipped";

export type ComingSoonStageKind = "source" | "queue" | "part" | "publish";

export interface ComingSoonStage {
    readonly id: string;
    readonly kind: ComingSoonStageKind;
    /** A job's own name for a `part` or `publish` stage; empty for the two fixed stages. */
    readonly label: string;
    readonly state: ComingSoonStageState;
    readonly startedAt: string | null;
    readonly completedAt: string | null;
}

export interface ComingSoonEstimate {
    /** The median duration of recent successful builds, in milliseconds. */
    readonly typicalMs: number;
    /** How many earlier builds the median came from. Always at least {@link MIN_SAMPLES}. */
    readonly sampleCount: number;
}

export interface ComingSoonCommit {
    readonly sha: string;
    /** First line of the message only. */
    readonly subject: string;
}

export interface ComingSoonContents {
    readonly commits: readonly ComingSoonCommit[];
    /** How many commits the build holds in all, which may exceed what is listed. */
    readonly total: number;
    readonly truncated: boolean;
}

export type ComingSoonUnknownReason =
    | "offline"
    | "rate-limited"
    | "unavailable"
    | "refused"
    | "disabled";

export type ComingSoonState =
    | {
          readonly kind: "none";
          readonly checkedAt: string | null;
          /** "published" when a build this session watched has just finished and shipped. */
          readonly lastOutcome: "published" | null;
      }
    | {
          readonly kind: "building";
          readonly runNumber: number;
          /** The version this build will publish as. */
          readonly version: string;
          /** "queued" until a runner picks the run up. */
          readonly phase: "queued" | "running";
          readonly createdAt: string | null;
          readonly startedAt: string | null;
          /** True when no stage has changed for {@link STALL_AFTER_MS}. */
          readonly stalled: boolean;
          /** When the newest stage change happened; the clock the stall is measured from. */
          readonly lastActivityAt: string | null;
          readonly stages: readonly ComingSoonStage[];
          readonly stagesDone: number;
          readonly stagesTotal: number;
          readonly estimate: ComingSoonEstimate | null;
          /** Null when the commit list could not be read; `contentsUnavailable` says why. */
          readonly contents: ComingSoonContents | null;
          readonly contentsUnavailable: "no-base" | "failed" | null;
          /** The older build this one replaced, when that build ended without publishing. */
          readonly replacedRun: number | null;
          readonly checkedAt: string;
      }
    | {
          readonly kind: "failed";
          readonly runNumber: number;
          readonly version: string;
          readonly conclusion: string;
          /** The first job that failed, when it could be read. */
          readonly failedStage: string | null;
          readonly endedAt: string | null;
          readonly checkedAt: string;
      }
    | {
          readonly kind: "unknown";
          readonly reason: ComingSoonUnknownReason;
          /** When the next attempt will be made, for a rate limit. */
          readonly retryAt: string | null;
          readonly checkedAt: string | null;
      };

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const COMING_SOON_EVENT_CHANNEL = "update:comingSoonEvent";

/** How long one request may take before it counts as a failure. */
export const REQUEST_TIMEOUT_MS = 8_000;
/** The spacing while the Updates surface is open. */
export const OPEN_INTERVAL_MS = 60_000;
/** The spacing otherwise. Much slower on purpose: nobody is looking. */
export const CLOSED_INTERVAL_MS = 15 * 60_000;
/** Wait after launch before the first look, so startup is not made busier. */
export const STARTUP_DELAY_MS = 90_000;
/** A second refresh requested inside this window reuses the first. */
export const MIN_REFRESH_GAP_MS = 30_000;
/** Below this many requests left in the hour, polling backs right off. */
export const LOW_RATE_REMAINING = 10;
/** A build with no stage change for this long says it is stalled. */
export const STALL_AFTER_MS = 60 * 60_000;
/** An estimate needs at least this many earlier successful builds behind it. */
export const MIN_SAMPLES = 3;
/** At most this many earlier builds are used for the estimate. */
export const MAX_SAMPLES = 10;
/** At most this many commit subjects are listed. */
export const MAX_COMMITS = 30;
/** A commit subject longer than this is cut, with an ellipsis. */
export const MAX_SUBJECT_LENGTH = 120;

const API_ROOT = "https://api.github.com";
const ETAG_CACHE_LIMIT = 16;

/* -------------------------------------------------------------------------- */
/* GitHub client                                                              */
/* -------------------------------------------------------------------------- */

export type FetchLike = (
    url: string,
    init: { readonly headers: Record<string, string>; readonly signal: AbortSignal },
) => Promise<{
    readonly status: number;
    readonly headers: { get(name: string): string | null };
    json(): Promise<unknown>;
}>;

export type ClientFailure =
    | { readonly ok: false; readonly reason: "offline" | "unavailable" }
    | { readonly ok: false; readonly reason: "rate-limited"; readonly retryAtMs: number | null };

export type ClientResult = { readonly ok: true; readonly json: unknown } | ClientFailure;

interface ClientOptions {
    readonly fetch: FetchLike;
    readonly now: () => number;
}

/**
 * Unauthenticated, conditional, bounded reads. Remembers the last answer per address so a
 * `304 Not Modified` (which does not count against the rate limit) is a cheap way to learn
 * that nothing changed.
 */
export class GitHubReader {
    private readonly cache = new Map<string, { readonly etag: string; readonly json: unknown }>();
    /** Requests left in the hour as of the last answer, or null before any. */
    remaining: number | null = null;
    /** When the allowance resets, as epoch milliseconds, or null before any answer. */
    resetAtMs: number | null = null;

    constructor(private readonly options: ClientOptions) {}

    async get(path: string): Promise<ClientResult> {
        const headers: Record<string, string> = {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "worldlens-update-check",
        };
        const cached = this.cache.get(path);
        if (cached !== undefined) headers["If-None-Match"] = cached.etag;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await this.options.fetch(`${API_ROOT}${path}`, {
                headers,
                signal: controller.signal,
            });
            this.noteRateLimit(response.headers);

            if (response.status === 304 && cached !== undefined) {
                return { ok: true, json: cached.json };
            }
            if (response.status === 403 || response.status === 429) {
                const exhausted =
                    this.remaining === 0 ||
                    response.status === 429 ||
                    response.headers.get("retry-after") !== null;
                if (exhausted) return { ok: false, reason: "rate-limited", retryAtMs: this.retryAt(response.headers) };
                return { ok: false, reason: "unavailable" };
            }
            if (response.status < 200 || response.status >= 300) {
                return { ok: false, reason: "unavailable" };
            }
            const json: unknown = await response.json();
            const etag = response.headers.get("etag");
            if (etag !== null) this.remember(path, etag, json);
            return { ok: true, json };
        } catch {
            // Aborted, refused, unreachable, or an unparsable body: all the same to the
            // person, who is told only that the check could not be made.
            return { ok: false, reason: "offline" };
        } finally {
            clearTimeout(timer);
        }
    }

    private remember(path: string, etag: string, json: unknown): void {
        this.cache.delete(path);
        this.cache.set(path, { etag, json });
        while (this.cache.size > ETAG_CACHE_LIMIT) {
            const oldest = this.cache.keys().next();
            if (oldest.done === true) break;
            this.cache.delete(oldest.value);
        }
    }

    private noteRateLimit(headers: { get(name: string): string | null }): void {
        const remaining = Number(headers.get("x-ratelimit-remaining"));
        if (headers.get("x-ratelimit-remaining") !== null && Number.isFinite(remaining)) {
            this.remaining = remaining;
        }
        const reset = Number(headers.get("x-ratelimit-reset"));
        if (headers.get("x-ratelimit-reset") !== null && Number.isFinite(reset)) {
            this.resetAtMs = reset * 1000;
        }
    }

    private retryAt(headers: { get(name: string): string | null }): number | null {
        const after = Number(headers.get("retry-after"));
        if (headers.get("retry-after") !== null && Number.isFinite(after)) {
            return this.options.now() + after * 1000;
        }
        return this.resetAtMs;
    }
}

/* -------------------------------------------------------------------------- */
/* Reading GitHub's answers, defensively                                      */
/* -------------------------------------------------------------------------- */

interface Run {
    readonly id: number;
    readonly runNumber: number;
    readonly status: string;
    readonly conclusion: string | null;
    readonly headSha: string;
    readonly headBranch: string;
    readonly createdAt: string | null;
    readonly startedAt: string | null;
    readonly updatedAt: string | null;
}

interface Job {
    readonly id: number;
    readonly name: string;
    readonly status: string;
    readonly conclusion: string | null;
    readonly startedAt: string | null;
    readonly completedAt: string | null;
    readonly stepTimes: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const count = (value: unknown): number | null =>
    typeof value === "number" && Number.isSafeInteger(value) ? value : null;

function readRuns(json: unknown): Run[] | null {
    if (!isRecord(json) || !Array.isArray(json["workflow_runs"])) return null;
    const runs: Run[] = [];
    for (const entry of json["workflow_runs"] as unknown[]) {
        if (!isRecord(entry)) continue;
        const id = count(entry["id"]);
        const runNumber = count(entry["run_number"]);
        const status = text(entry["status"]);
        const headSha = text(entry["head_sha"]);
        if (id === null || runNumber === null || status === null || headSha === null) continue;
        runs.push({
            id,
            runNumber,
            status,
            conclusion: text(entry["conclusion"]),
            headSha,
            headBranch: text(entry["head_branch"]) ?? "",
            createdAt: text(entry["created_at"]),
            startedAt: text(entry["run_started_at"]),
            updatedAt: text(entry["updated_at"]),
        });
    }
    return runs;
}

function readJobs(json: unknown): Job[] | null {
    if (!isRecord(json) || !Array.isArray(json["jobs"])) return null;
    const jobs: Job[] = [];
    for (const entry of json["jobs"] as unknown[]) {
        if (!isRecord(entry)) continue;
        const id = count(entry["id"]);
        const name = text(entry["name"]);
        const status = text(entry["status"]);
        if (id === null || name === null || status === null) continue;
        const stepTimes: string[] = [];
        if (Array.isArray(entry["steps"])) {
            for (const step of entry["steps"] as unknown[]) {
                if (!isRecord(step)) continue;
                for (const key of ["started_at", "completed_at"] as const) {
                    const value = text(step[key]);
                    if (value !== null) stepTimes.push(value);
                }
            }
        }
        jobs.push({
            id,
            name,
            status,
            conclusion: text(entry["conclusion"]),
            startedAt: text(entry["started_at"]),
            completedAt: text(entry["completed_at"]),
            stepTimes,
        });
    }
    return jobs;
}

/* -------------------------------------------------------------------------- */
/* Pure rules                                                                 */
/* -------------------------------------------------------------------------- */

const IN_FLIGHT = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

export function isInFlight(status: string): boolean {
    return IN_FLIGHT.has(status);
}

/** `major.minor.<run number>` from the installed version, or null when it has no such shape. */
export function versionForRun(currentVersion: string, runNumber: number): string | null {
    const match = /^v?(\d+)\.(\d+)\.\d+/.exec(currentVersion.trim());
    if (match === null || match[1] === undefined || match[2] === undefined) return null;
    return `${match[1]}.${match[2]}.${runNumber}`;
}

/** A job's state in the five words the surface speaks. */
export function stageStateFor(status: string, conclusion: string | null): ComingSoonStageState {
    if (status === "in_progress") return "running";
    if (status !== "completed") return "waiting";
    switch (conclusion) {
        case "success":
        case "neutral":
            return "done";
        case "skipped":
        case "cancelled":
            return "skipped";
        default:
            return "failed";
    }
}

const PUBLISH_JOB = /publish/i;

/**
 * The stage rows for one run.
 *
 * The first two are fixed and truthful by construction: the source was received because the
 * run exists, and the run is "waiting its turn" until any job has started. The rest are the
 * workflow's own jobs, in the order GitHub lists them, with the publishing job moved last.
 */
export function stagesFor(run: Run, jobs: readonly Job[]): ComingSoonStage[] {
    const started = jobs.some((job) => job.status !== "queued" && job.status !== "waiting");
    const stages: ComingSoonStage[] = [
        {
            id: "source",
            kind: "source",
            label: "",
            state: "done",
            startedAt: run.createdAt,
            completedAt: run.createdAt,
        },
        {
            id: "queue",
            kind: "queue",
            label: "",
            state: started ? "done" : "running",
            startedAt: run.createdAt,
            completedAt: started ? (run.startedAt ?? null) : null,
        },
    ];
    const parts: ComingSoonStage[] = [];
    const publish: ComingSoonStage[] = [];
    for (const job of jobs) {
        const isPublish = PUBLISH_JOB.test(job.name);
        const stage: ComingSoonStage = {
            id: `job-${job.id}`,
            kind: isPublish ? "publish" : "part",
            label: job.name,
            state: stageStateFor(job.status, job.conclusion),
            startedAt: job.startedAt,
            completedAt: job.completedAt,
        };
        (isPublish ? publish : parts).push(stage);
    }
    return [...stages, ...parts, ...publish];
}

/** The newest moment any stage or step changed, as epoch milliseconds, or null. */
export function lastActivityMs(run: Run, jobs: readonly Job[]): number | null {
    const candidates: (string | null)[] = [run.createdAt, run.startedAt];
    for (const job of jobs) {
        candidates.push(job.startedAt, job.completedAt, ...job.stepTimes);
    }
    let newest: number | null = null;
    for (const value of candidates) {
        if (value === null) continue;
        const time = Date.parse(value);
        if (Number.isNaN(time)) continue;
        if (newest === null || time > newest) newest = time;
    }
    return newest;
}

/** The median of recent successful runs' durations, or null when there are too few. */
export function estimateFrom(runs: readonly Run[]): ComingSoonEstimate | null {
    const durations: number[] = [];
    for (const run of runs) {
        if (run.status !== "completed" || run.conclusion !== "success") continue;
        if (run.startedAt === null || run.updatedAt === null) continue;
        const span = Date.parse(run.updatedAt) - Date.parse(run.startedAt);
        if (!Number.isFinite(span) || span <= 0) continue;
        durations.push(span);
        if (durations.length === MAX_SAMPLES) break;
    }
    if (durations.length < MIN_SAMPLES) return null;
    const sorted = [...durations].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median =
        sorted.length % 2 === 1
            ? (sorted[middle] ?? 0)
            : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
    return { typicalMs: Math.round(median), sampleCount: sorted.length };
}

/** The first line of a commit message, trimmed and capped. */
export function commitSubject(message: string): string {
    const line = (message.split(/\r?\n/, 1)[0] ?? "").trim();
    if (line.length <= MAX_SUBJECT_LENGTH) return line;
    return `${line.slice(0, MAX_SUBJECT_LENGTH - 1).trimEnd()}…`;
}

/** The commits of a compare answer, newest first, capped. Null when the answer is not one. */
export function readContents(json: unknown): ComingSoonContents | null {
    if (!isRecord(json) || !Array.isArray(json["commits"])) return null;
    const all: ComingSoonCommit[] = [];
    for (const entry of json["commits"] as unknown[]) {
        if (!isRecord(entry)) continue;
        const sha = text(entry["sha"]);
        const commit = entry["commit"];
        const message = isRecord(commit) ? text(commit["message"]) : null;
        if (sha === null || message === null) continue;
        all.push({ sha, subject: commitSubject(message) });
    }
    all.reverse();
    const total = Math.max(count(json["total_commits"]) ?? all.length, all.length);
    return {
        commits: all.slice(0, MAX_COMMITS),
        total,
        truncated: total > Math.min(all.length, MAX_COMMITS),
    };
}

/* -------------------------------------------------------------------------- */
/* The watcher                                                                */
/* -------------------------------------------------------------------------- */

export interface ComingSoonTimers {
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}

export interface ComingSoonWatcherOptions {
    /** `owner/name`. */
    readonly repository: string;
    readonly currentVersion: string;
    readonly fetch: FetchLike;
    readonly now?: () => number;
    readonly timers?: ComingSoonTimers;
    /** False in a build that cannot update itself; the watcher then never polls. */
    readonly enabled?: () => boolean;
    readonly onChange?: (state: ComingSoonState) => void;
    readonly workflowFile?: string;
    readonly branch?: string;
}

interface Tracked {
    readonly runNumber: number;
    readonly version: string;
}

export class ComingSoonWatcher {
    private readonly reader: GitHubReader;
    private readonly now: () => number;
    private readonly timers: ComingSoonTimers;
    private readonly workflowFile: string;
    private readonly branch: string;
    private state: ComingSoonState = {
        kind: "unknown",
        reason: "unavailable",
        retryAt: null,
        checkedAt: null,
    };
    private tracked: Tracked | null = null;
    private failed: Extract<ComingSoonState, { kind: "failed" }> | null = null;
    private readonly contents = new Map<string, ComingSoonContents | null>();
    private timer: unknown = null;
    private watching = false;
    private started = false;
    private disposed = false;
    private lastRefreshAt = 0;
    private inFlight: Promise<ComingSoonState> | null = null;

    constructor(private readonly options: ComingSoonWatcherOptions) {
        this.now = options.now ?? Date.now;
        this.timers = options.timers ?? {
            setTimeout: (callback, ms) => setTimeout(callback, ms),
            clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
        };
        this.workflowFile = options.workflowFile ?? "ci.yml";
        this.branch = options.branch ?? "main";
        this.reader = new GitHubReader({ fetch: options.fetch, now: this.now });
    }

    current(): ComingSoonState {
        return this.state;
    }

    /** Begins polling after the startup delay. A build that cannot update never polls. */
    start(): void {
        if (this.started || this.disposed) return;
        this.started = true;
        if (!this.isEnabled()) {
            this.publish(this.disabledState());
            return;
        }
        this.schedule(STARTUP_DELAY_MS);
    }

    /**
     * Tells the watcher whether anyone is looking. Opening the surface refreshes at once
     * (unless a refresh just happened) and speeds polling up; closing it slows it down.
     */
    setWatching(open: boolean): void {
        if (this.disposed) return;
        this.watching = open;
        if (!this.started || !this.isEnabled()) return;
        if (open && this.now() - this.lastRefreshAt >= MIN_REFRESH_GAP_MS) {
            void this.refresh();
        } else {
            this.schedule(this.nextDelay());
        }
    }

    /** One look, now. Concurrent callers share the one in flight. */
    refresh(): Promise<ComingSoonState> {
        if (this.disposed) return Promise.resolve(this.state);
        if (!this.isEnabled()) {
            this.publish(this.disabledState());
            return Promise.resolve(this.state);
        }
        if (this.inFlight !== null) return this.inFlight;
        const run = this.look().then(
            (state) => state,
            () => this.unknown("unavailable", null),
        );
        this.inFlight = run.finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    dispose(): void {
        this.disposed = true;
        if (this.timer !== null) this.timers.clearTimeout(this.timer);
        this.timer = null;
    }

    /* ---- internals ----------------------------------------------------- */

    private isEnabled(): boolean {
        try {
            return this.options.enabled?.() ?? true;
        } catch {
            return false;
        }
    }

    private disabledState(): ComingSoonState {
        return { kind: "unknown", reason: "disabled", retryAt: null, checkedAt: null };
    }

    private publish(next: ComingSoonState): ComingSoonState {
        this.state = next;
        try {
            this.options.onChange?.(next);
        } catch {
            // A listener that throws must not stop the watcher.
        }
        return next;
    }

    private checkedAt(): string {
        return new Date(this.now()).toISOString();
    }

    private unknown(reason: ComingSoonUnknownReason, retryAtMs: number | null): ComingSoonState {
        return this.publish({
            kind: "unknown",
            reason,
            retryAt: retryAtMs === null ? null : new Date(retryAtMs).toISOString(),
            checkedAt: this.checkedAt(),
        });
    }

    private nextDelay(): number {
        const rateLimited = this.state.kind === "unknown" && this.state.reason === "rate-limited";
        if (rateLimited && this.reader.resetAtMs !== null) {
            return Math.max(MIN_REFRESH_GAP_MS, this.reader.resetAtMs - this.now());
        }
        const base = this.watching ? OPEN_INTERVAL_MS : CLOSED_INTERVAL_MS;
        // Running low on the hour's allowance: never keep the fast cadence.
        if (this.reader.remaining !== null && this.reader.remaining < LOW_RATE_REMAINING) {
            return Math.max(base, CLOSED_INTERVAL_MS);
        }
        return base;
    }

    private schedule(delay: number): void {
        if (this.disposed) return;
        if (this.timer !== null) this.timers.clearTimeout(this.timer);
        this.timer = this.timers.setTimeout(() => {
            this.timer = null;
            void this.refresh();
        }, delay);
    }

    private async look(): Promise<ComingSoonState> {
        this.lastRefreshAt = this.now();
        try {
            return await this.lookInner();
        } finally {
            this.schedule(this.nextDelay());
        }
    }

    private failure(result: ClientFailure): ComingSoonState {
        return this.unknown(
            result.reason,
            result.reason === "rate-limited" ? result.retryAtMs : null,
        );
    }

    private async lookInner(): Promise<ComingSoonState> {
        const repo = this.options.repository;
        const listed = await this.reader.get(
            `/repos/${repo}/actions/workflows/${this.workflowFile}/runs?branch=${encodeURIComponent(this.branch)}&per_page=20`,
        );
        if (!listed.ok) return this.failure(listed);
        const runs = readRuns(listed.json);
        if (runs === null) return this.unknown("unavailable", null);

        const onBranch = runs.filter((run) => run.headBranch === this.branch);
        const flying = onBranch
            .filter((run) => isInFlight(run.status))
            .sort((a, b) => b.runNumber - a.runNumber);

        const newest = flying[0];
        if (newest !== undefined) return this.building(newest, onBranch);
        return this.settled(onBranch);
    }

    private async building(run: Run, onBranch: readonly Run[]): Promise<ComingSoonState> {
        const version = versionForRun(this.options.currentVersion, run.runNumber);
        if (version === null || !isStrictlyNewerVersion(version, this.options.currentVersion)) {
            this.tracked = null;
            return this.publish({ kind: "none", checkedAt: this.checkedAt(), lastOutcome: null });
        }

        const jobsResult = await this.reader.get(`/repos/${this.options.repository}/actions/runs/${run.id}/jobs?per_page=100`);
        if (!jobsResult.ok) return this.failure(jobsResult);
        const jobs = readJobs(jobsResult.json);
        if (jobs === null) return this.unknown("unavailable", null);

        let replacedRun: number | null = null;
        const previous = this.tracked;
        if (previous !== null && previous.runNumber < run.runNumber) {
            const ended = onBranch.find((entry) => entry.runNumber === previous.runNumber);
            if (ended !== undefined && ended.status === "completed" && ended.conclusion !== "success") {
                replacedRun = previous.runNumber;
            }
        }
        this.tracked = { runNumber: run.runNumber, version };
        this.failed = null;

        const stages = stagesFor(run, jobs);
        const stagesDone = stages.filter((stage) => stage.state === "done").length;
        const activity = lastActivityMs(run, jobs);
        const stalled = activity !== null && this.now() - activity > STALL_AFTER_MS;

        // A compare that cannot be read leaves the rest of the picture true; the contents say
        // plainly that they could not be read instead of listing nothing as if nothing changed.
        const { contents, unavailable } = await this.contentsFor(run.headSha);

        return this.publish({
            kind: "building",
            runNumber: run.runNumber,
            version,
            phase: run.status === "queued" ? "queued" : "running",
            createdAt: run.createdAt,
            startedAt: run.startedAt,
            stalled,
            lastActivityAt: activity === null ? null : new Date(activity).toISOString(),
            stages,
            stagesDone,
            stagesTotal: stages.length,
            estimate: estimateFrom(onBranch),
            contents,
            contentsUnavailable: unavailable,
            replacedRun,
            checkedAt: this.checkedAt(),
        });
    }

    private async contentsFor(
        headSha: string,
    ): Promise<{ contents: ComingSoonContents | null; unavailable: "no-base" | "failed" | null }> {
        const key = `${this.options.currentVersion}...${headSha}`;
        if (this.contents.has(key)) {
            const known = this.contents.get(key) ?? null;
            return { contents: known, unavailable: known === null ? "failed" : null };
        }
        const base = `v${this.options.currentVersion.replace(/^v/, "")}`;
        const result = await this.reader.get(
            `/repos/${this.options.repository}/compare/${encodeURIComponent(base)}...${encodeURIComponent(headSha)}`,
        );
        if (!result.ok) {
            // A missing tag is a permanent answer for this pair; a transient failure is not,
            // so only the former is remembered.
            return { contents: null, unavailable: result.reason === "unavailable" ? "no-base" : "failed" };
        }
        const contents = readContents(result.json);
        this.contents.set(key, contents);
        if (this.contents.size > 8) {
            const oldest = this.contents.keys().next();
            if (oldest.done !== true) this.contents.delete(oldest.value);
        }
        return { contents, unavailable: contents === null ? "failed" : null };
    }

    private async settled(onBranch: readonly Run[]): Promise<ComingSoonState> {
        const tracked = this.tracked;
        if (tracked !== null) {
            const ended = onBranch.find((entry) => entry.runNumber === tracked.runNumber);
            if (ended !== undefined && ended.status === "completed") {
                this.tracked = null;
                if (ended.conclusion === "success") {
                    this.failed = null;
                    return this.publish({
                        kind: "none",
                        checkedAt: this.checkedAt(),
                        lastOutcome: "published",
                    });
                }
                const failedStage = await this.firstFailedStage(ended.id);
                this.failed = {
                    kind: "failed",
                    runNumber: tracked.runNumber,
                    version: tracked.version,
                    conclusion: ended.conclusion ?? "failure",
                    failedStage,
                    endedAt: ended.updatedAt,
                    checkedAt: this.checkedAt(),
                };
            } else if (ended === undefined) {
                // It fell out of the window without a verdict being read: say nothing rather
                // than guess which way it went.
                this.tracked = null;
            }
        }

        const failed = this.failed;
        if (failed !== null) {
            const supersededBySuccess = onBranch.some(
                (entry) =>
                    entry.runNumber > failed.runNumber &&
                    entry.status === "completed" &&
                    entry.conclusion === "success",
            );
            if (supersededBySuccess) {
                this.failed = null;
            } else {
                return this.publish({ ...failed, checkedAt: this.checkedAt() });
            }
        }

        return this.publish({ kind: "none", checkedAt: this.checkedAt(), lastOutcome: null });
    }

    private async firstFailedStage(runId: number): Promise<string | null> {
        const result = await this.reader.get(`/repos/${this.options.repository}/actions/runs/${runId}/jobs?per_page=100`);
        if (!result.ok) return null;
        const jobs = readJobs(result.json);
        if (jobs === null) return null;
        const failed = jobs.find((job) => stageStateFor(job.status, job.conclusion) === "failed");
        return failed === undefined ? null : failed.name;
    }
}
