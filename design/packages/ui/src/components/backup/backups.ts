/**
 * The backup surface's state, kept out of the component so it can be tested without one.
 *
 * Built to the shape `components/downloads/downloads.ts` established, and for the same
 * reasons: rows keyed by id so an event for a backup started in another window lands in
 * the right place, a computed ordering so a running backup is always at the top, and a
 * bounded log so an hour of progress does not grow without limit.
 *
 * The number formatting is **imported** from the downloads surface rather than written
 * again. `1.7 GB` has to read identically whether a person is watching bytes leave this
 * machine or arrive at it, and two implementations of "round this to three significant
 * figures" are two chances to disagree about it.
 */

import { computed, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import {
    etaText as downloadEtaText,
    formatBytes,
    transferText as downloadTransferText,
} from "../downloads/downloads.js";
import type { DownloadTaskProgress } from "../downloads/downloadBridge.js";
import type {
    BackupBridge,
    BackupEvent,
    BackupFailure,
    BackupListing,
    BackupPhase,
    BackupRequest,
    BackupResult,
    BackupSourceKind,
    BackupSummary,
    BackupTaskProgress,
    CreateRepositoryFailureCode,
    CreateRepositoryRequest,
    RepositoryChoice,
    RepositoryReport,
} from "./backupBridge.js";

export { formatBytes };

/** How many log lines a row keeps. An hour of uploading is a lot of lines. */
export const LOG_LIMIT = 100;

type Translate = (key: string, named: Record<string, unknown>, fallback?: string) => string;

/** `t(key, fallback)` and `t(key, named, fallback)` both, as vue-i18n offers them. */
type T = ((key: string, fallback: string) => string) & Translate;

/**
 * A backup's progress in the shape the downloads formatters take.
 *
 * Those two functions read `bytesDone`, `bytesTotal`, `etaText` and `etaSeconds` and
 * nothing else; the `phase` on the object is a downloader's vocabulary and neither of
 * them consults it. The alternative to this adapter is a second implementation of "round
 * this to three significant figures" - and `1.7 GB` has to read identically whether
 * somebody is watching bytes leave this machine or arrive at it, which two
 * implementations are exactly two chances to get wrong.
 */
function inDownloadShape(task: BackupTaskProgress | null): DownloadTaskProgress | null {
    return task === null ? null : { ...task, phase: "downloading" };
}

/** How much has gone up, in exact bytes rendered as sizes. */
export function transferText(task: BackupTaskProgress | null, t: T): string {
    return downloadTransferText(inDownloadShape(task), t);
}

/** How long is left, in the main process's own words when it sent any. */
export function etaText(task: BackupTaskProgress | null, t: T): string {
    return downloadEtaText(inDownloadShape(task), t);
}

export type BackupRowState = "running" | "paused" | "finished" | "failed" | "cancelled";

export interface BackupLogLine {
    readonly id: number;
    readonly level: string;
    readonly message: string;
    readonly at: string;
}

export interface BackupRow {
    readonly backupId: string;
    /** `owner/repo`, once the main process has said which. */
    readonly repository: string;
    readonly tag: string;
    readonly kind: BackupSourceKind | null;
    readonly label: string;
    readonly state: BackupRowState;
    readonly phase: BackupPhase | null;
    readonly task: BackupTaskProgress | null;
    readonly summary: BackupSummary | null;
    readonly failure: BackupFailure | null;
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
    /** True once a real event has arrived, as opposed to an id adopted from a list. */
    readonly live: boolean;
    readonly stopping: boolean;
    /**
     * A pause was asked for and has not reached a clean boundary yet - still `running`
     * on screen (bytes are still moving), but the Pause control shows "Pausing..." so a
     * person is not left wondering whether their click landed. Distinct from `state ===
     * "paused"`, which means the boundary was actually reached.
     */
    readonly pausing: boolean;
    /**
     * True only for a `paused` row whose pause is **live** - this build's own process is
     * still holding the operation open, so Resume wakes it in place with nothing redone.
     * False for a row adopted from `pausedBackups()` (the app was restarted since it
     * paused): that row still shows `state === "paused"`, but resuming it has to be a
     * fresh `startBackup` call with `resumeTag`, exactly like a stopped backup, because
     * there is nothing left in this process to wake.
     */
    readonly liveResumable: boolean;
    readonly log: readonly BackupLogLine[];
}

/** Running first, then the endings. Newest first inside each rank. */
const RANK: Readonly<Record<BackupRowState, number>> = {
    running: 0,
    paused: 0,
    failed: 1,
    cancelled: 2,
    finished: 3,
};

function blankRow(backupId: string): BackupRow {
    return {
        backupId,
        repository: "",
        tag: "",
        kind: null,
        label: "",
        state: "running",
        phase: null,
        task: null,
        summary: null,
        failure: null,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        live: false,
        stopping: false,
        pausing: false,
        liveResumable: false,
        log: [],
    };
}

/** What each phase is called on screen. */
export function phaseLabel(phase: BackupPhase | null, t: T): string {
    switch (phase) {
        case "inspecting":
            return t("backup.phase.inspecting", "Reading the folder");
        case "packing":
            return t("backup.phase.packing", "Packing it into one archive");
        case "splitting":
            return t("backup.phase.splitting", "Cutting it into parts");
        case "publishing":
            return t("backup.phase.publishing", "Making the release");
        case "uploading":
            return t("backup.phase.uploading", "Uploading the parts");
        case "finished":
            return t("backup.phase.finished", "Finished");
        default:
            return t("backup.phase.starting", "Starting");
    }
}

/** Which part, when there really is more than one. Empty when the archive is one file. */
export function partsText(task: BackupTaskProgress | null, t: T): string {
    if (task === null || task.partsTotal <= 1) return "";
    return t(
        "backup.parts",
        { done: String(task.partsDone), total: String(task.partsTotal) },
        "part {done} of {total}",
    );
}

/**
 * Whether a stopped backup can be carried on with.
 *
 * Only a backup that got as far as making its release: before that there is no tag, so
 * there is nothing to resume *into*, and offering the button would produce a refusal that
 * reads like a fault. Everything already packed and already uploaded is kept either way.
 */
export function canResume(row: BackupRow): boolean {
    return (
        (row.state === "cancelled" || row.state === "failed") &&
        row.tag !== "" &&
        row.repository !== "" &&
        row.kind !== null
    );
}

/**
 * Whether *this build, right now* can wake a paused row in place, at zero cost - as
 * opposed to `canResume` above, which always means "restart with `resumeTag`" and is what
 * a paused-but-not-live row falls back to (see `liveResumable` on `BackupRow`).
 */
export function canLiveResume(row: BackupRow): boolean {
    return row.state === "paused" && row.liveResumable;
}

/**
 * A paused row that this process can no longer wake in place - it was left paused by an
 * earlier window/session and only exists here because `pausedBackups()` reported it.
 * Carrying it on is `canResume`'s ordinary restart-with-`resumeTag` path, so this reuses
 * exactly the same fields `canResume` checks and differs only in the state it accepts.
 */
export function canRestartPaused(row: BackupRow): boolean {
    return row.state === "paused" && !row.liveResumable && row.tag !== "" && row.repository !== "" && row.kind !== null;
}

/* -------------------------------------------------------------------------- */
/* Naming a new repository: GitHub's own grammar, checked in plain words      */
/* before a name is ever sent, exactly the way `ciRenders.ts`'s               */
/* `repoNameProblem` validates the same grammar for the CI-render screen -    */
/* restated here rather than imported, because that surface's own module is  */
/* not a dependency this one has any other reason to carry.                  */
/* -------------------------------------------------------------------------- */

/* `Translate` and `T` are declared once near the top of this file; this section uses
   those rather than restating them, which is what made the compiler count each name
   twice and fail the whole package's typecheck. */

const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Why `name` is not a repository name GitHub will accept, in the reader's own words - or
 * null when it is fine, or empty, since an empty field is a separate "this is required"
 * message rather than an invalid one.
 */
export function repositoryNameProblem(name: string, t: T): string | null {
    const trimmed = name.trim();
    if (trimmed === "") return null;
    if (trimmed === "." || trimmed === "..") {
        return t("backup.createRepo.invalid.dots", 'A repository name cannot be just "." or "..".');
    }
    if (/\.git$/i.test(trimmed)) {
        return t("backup.createRepo.invalid.gitSuffix", 'A repository name cannot end in ".git".');
    }
    if (trimmed.length > 100) {
        return t("backup.createRepo.invalid.long", "A repository name cannot be longer than 100 characters.");
    }
    if (!REPOSITORY_NAME_PATTERN.test(trimmed)) {
        return t(
            "backup.createRepo.invalid.chars",
            "Repository names may only use letters, digits, dots, hyphens and underscores.",
        );
    }
    return null;
}

/* -------------------------------------------------------------------------- */
/* The surface's state                                                        */
/* -------------------------------------------------------------------------- */

export interface Backups {
    /** True when this build can make a backup at all. */
    readonly available: boolean;
    readonly canCancel: boolean;
    /** True when this build can pause and live-resume a backup in flight. */
    readonly canPause: boolean;
    readonly canListRepositories: boolean;
    readonly canListBackups: boolean;
    /** True when a brand-new repository can be created from this screen. */
    readonly canCreateRepository: boolean;

    readonly rows: ComputedRef<readonly BackupRow[]>;
    readonly repositories: Ref<readonly RepositoryChoice[]>;
    readonly repositoriesFailure: Ref<string | null>;
    readonly loadingRepositories: Ref<boolean>;
    readonly creatingRepository: Ref<boolean>;
    readonly createRepositoryFailure: Ref<{
        readonly code: CreateRepositoryFailureCode;
        readonly message: string;
        readonly needsSignIn?: boolean | undefined;
    } | null>;

    /** The repository the interface has read, and what uploading to it would mean. */
    readonly report: Ref<RepositoryReport | null>;
    readonly reportFailure: Ref<string | null>;
    readonly checking: Ref<boolean>;

    readonly listings: Ref<readonly BackupListing[]>;
    readonly listingsFailure: Ref<string | null>;
    readonly listing: Ref<boolean>;

    /**
     * A backup refused before it had an id, so there is no row for it.
     *
     * Signing out, a folder that is not a world and an unacknowledged public repository
     * all fail before a workspace exists, and inventing a row for a backup that never
     * began would put a permanent failure into a list of real ones.
     */
    readonly startFailure: Ref<BackupFailure | null>;
    readonly starting: Ref<boolean>;

    check(owner: string, repo: string, accountId?: string): Promise<RepositoryReport | null>;
    loadRepositories(accountId?: string): Promise<void>;
    /**
     * Creates a brand-new repository and, on success, adds it to {@link Backups.repositories}
     * so it is immediately there to pick - the caller still has to set the owner/repo
     * fields and select it, exactly as choosing any other repository from that list already
     * works, so creating one lands at the same "next real decision" a chosen one does.
     */
    createRepository(request: CreateRepositoryRequest): Promise<RepositoryChoice | null>;
    loadListings(owner: string, repo: string, accountId?: string): Promise<void>;
    /** Invalidates account-bound report/listing reads when the selected account changes. */
    clearAccountState(): void;
    start(request: BackupRequest): Promise<BackupResult | null>;
    stop(backupId: string): Promise<boolean>;
    /** Asks a running backup to pause at its next boundary. */
    pause(backupId: string): Promise<boolean>;
    /** Wakes a **live** paused backup in place - see `canLiveResume`. */
    liveResume(backupId: string): Promise<boolean>;
    /**
     * Adopts anything already in flight, so a backup started elsewhere is on screen -
     * and now also anything left durably **paused** by a since-closed window, read from
     * disk through `pausedBackups()`. Both need adopting for the same reason: neither
     * has a row yet in this surface's own state, because neither event stream (this
     * window's `onBackupEvent`) has ever fired for them.
     */
    reconcile(): Promise<void>;
    dispose(): void;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createBackups(bridge: BackupBridge | null): Backups {
    const byId = ref<Readonly<Record<string, BackupRow>>>({});
    const repositories = ref<readonly RepositoryChoice[]>([]);
    const repositoriesFailure = ref<string | null>(null);
    const loadingRepositories = ref(false);
    const creatingRepository = ref(false);
    const createRepositoryFailure = ref<{
        readonly code: CreateRepositoryFailureCode;
        readonly message: string;
        readonly needsSignIn?: boolean | undefined;
    } | null>(
        null,
    );
    const report = ref<RepositoryReport | null>(null);
    const reportFailure = ref<string | null>(null);
    const checking = ref(false);
    const listings = ref<readonly BackupListing[]>([]);
    const listingsFailure = ref<string | null>(null);
    const listing = ref(false);
    const startFailure = ref<BackupFailure | null>(null);
    const starting = ref(false);

    let nextLogId = 1;
    // A slow list from the previous account must not overwrite the repository picker after
    // the person has already selected a different account.
    let repositoriesLoadToken = 0;
    let reportLoadToken = 0;
    let listingsLoadToken = 0;

    const rows = computed<readonly BackupRow[]>(() =>
        Object.values(byId.value).sort((left, right) => {
            const rank = RANK[left.state] - RANK[right.state];
            if (rank !== 0) return rank;
            // ISO-8601 sorts correctly as text. A row with no timestamp came from an id
            // alone and goes last rather than pretending to be the oldest on screen.
            const leftAt = left.startedAt ?? "";
            const rightAt = right.startedAt ?? "";
            if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
            return left.backupId.localeCompare(right.backupId);
        }),
    );

    function put(row: BackupRow): void {
        byId.value = { ...byId.value, [row.backupId]: row };
    }

    function rowFor(backupId: string): BackupRow {
        return byId.value[backupId] ?? blankRow(backupId);
    }

    function append(row: BackupRow, level: string, message: string, at: string): readonly BackupLogLine[] {
        const next = [...row.log, { id: nextLogId++, level, message, at }];
        return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
    }

    function handle(event: BackupEvent): void {
        // A failure that happened before a workspace existed carries a placeholder id and
        // is not a row of anything. It is reported beside the form instead.
        if (event.backupId === "" || event.backupId === "nowhere") {
            if (event.type === "failed") startFailure.value = event.failure;
            return;
        }

        const row = rowFor(event.backupId);

        switch (event.type) {
            case "started":
                put({
                    ...row,
                    repository: event.repository,
                    tag: event.tag,
                    kind: event.kind,
                    label: event.label,
                    state: "running",
                    phase: null,
                    task: null,
                    failure: null,
                    summary: null,
                    startedAt: event.at,
                    finishedAt: null,
                    durationMs: null,
                    stopping: false,
                    pausing: false,
                    liveResumable: false,
                    live: true,
                });
                break;
            case "phase":
                put({ ...row, phase: event.phase, live: true });
                break;
            case "pausing":
                // Still `running` on screen - bytes are still moving until the boundary
                // is actually reached. Only the flag the button reads from changes.
                put({ ...row, phase: event.phase, pausing: true, live: true });
                break;
            case "paused":
                put({
                    ...row,
                    state: "paused",
                    phase: event.phase,
                    pausing: false,
                    liveResumable: true,
                    live: true,
                });
                break;
            case "resuming":
                put({
                    ...row,
                    state: "running",
                    phase: event.phase,
                    pausing: false,
                    liveResumable: false,
                    live: true,
                });
                break;
            case "progress":
                put({ ...row, phase: event.phase, task: event.task, state: "running", live: true });
                break;
            case "log":
                put({ ...row, log: append(row, event.level, event.message, event.at), live: true });
                break;
            case "finished":
                put({
                    ...row,
                    state: "finished",
                    phase: "finished",
                    summary: event.summary,
                    tag: event.summary.tag,
                    repository: event.summary.repository,
                    kind: event.summary.kind,
                    label: event.summary.label,
                    durationMs: event.durationMs,
                    finishedAt: event.at,
                    failure: null,
                    stopping: false,
                    pausing: false,
                    liveResumable: false,
                    live: true,
                });
                break;
            case "failed":
                put({
                    ...row,
                    state: "failed",
                    failure: event.failure,
                    finishedAt: event.at,
                    stopping: false,
                    pausing: false,
                    liveResumable: false,
                    live: true,
                });
                break;
            case "cancelled":
                put({
                    ...row,
                    state: "cancelled",
                    finishedAt: event.at,
                    stopping: false,
                    pausing: false,
                    liveResumable: false,
                    live: true,
                });
                break;
        }
    }

    const unsubscribe = bridge === null ? null : bridge.onBackupEvent(handle);

    return {
        available: bridge !== null,
        canCancel: bridge?.canCancel ?? false,
        canPause: bridge?.canPause ?? false,
        canListRepositories: bridge?.canListRepositories ?? false,
        canListBackups: bridge?.canListBackups ?? false,
        canCreateRepository: bridge?.canCreateRepository ?? false,

        rows,
        repositories,
        repositoriesFailure,
        loadingRepositories,
        creatingRepository,
        createRepositoryFailure,
        report,
        reportFailure,
        checking,
        listings,
        listingsFailure,
        listing,
        startFailure,
        starting,

        async check(owner: string, repo: string, accountId?: string): Promise<RepositoryReport | null> {
            if (bridge === null) return null;
            const token = ++reportLoadToken;
            checking.value = true;
            reportFailure.value = null;
            // Cleared, not kept: a stale report beside a new repository name is how
            // somebody reads "private" about a repository they have just changed.
            report.value = null;
            try {
                const answer = await bridge.inspectBackupRepository({
                    ...(accountId === undefined ? {} : { accountId }),
                    owner,
                    repo,
                });
                if (token !== reportLoadToken) return null;
                if (!answer.ok) {
                    reportFailure.value = answer.message;
                    return null;
                }
                report.value = answer.value;
                return answer.value;
            } catch (error) {
                if (token === reportLoadToken) reportFailure.value = describe(error);
                return null;
            } finally {
                if (token === reportLoadToken) checking.value = false;
            }
        },

        async loadRepositories(accountId?: string): Promise<void> {
            if (bridge === null) return;
            const token = ++repositoriesLoadToken;
            loadingRepositories.value = true;
            repositories.value = [];
            repositoriesFailure.value = null;
            try {
                const answer = await bridge.listBackupRepositories(accountId);
                if (token === repositoriesLoadToken) {
                    if (answer.ok) repositories.value = answer.value;
                    else repositoriesFailure.value = answer.message;
                }
            } catch (error) {
                if (token === repositoriesLoadToken) repositoriesFailure.value = describe(error);
            } finally {
                if (token === repositoriesLoadToken) loadingRepositories.value = false;
            }
        },

        async createRepository(request: CreateRepositoryRequest): Promise<RepositoryChoice | null> {
            if (bridge?.createBackupRepository === undefined) return null;
            creatingRepository.value = true;
            createRepositoryFailure.value = null;
            try {
                const answer = await bridge.createBackupRepository(request);
                if (!answer.ok) {
                    createRepositoryFailure.value = {
                        code: answer.code,
                        message: answer.message,
                        ...(answer.needsSignIn === true ? { needsSignIn: true } : {}),
                    };
                    return null;
                }
                // Prepended rather than appended, and rather than requiring a re-fetch of
                // the whole list: the repository somebody just created for exactly this
                // purpose is the one they are about to want to see, not one three pages
                // into "most recently active".
                repositories.value = [answer.value, ...repositories.value.filter((r) => r.fullName !== answer.value.fullName)];
                return answer.value;
            } catch (error) {
                createRepositoryFailure.value = { code: "other", message: describe(error) };
                return null;
            } finally {
                creatingRepository.value = false;
            }
        },

        async loadListings(owner: string, repo: string, accountId?: string): Promise<void> {
            if (bridge === null) return;
            const token = ++listingsLoadToken;
            listing.value = true;
            listings.value = [];
            listingsFailure.value = null;
            try {
                const answer = await bridge.listBackups({
                    ...(accountId === undefined ? {} : { accountId }),
                    owner,
                    repo,
                });
                if (token !== listingsLoadToken) return;
                if (answer.ok) listings.value = answer.value;
                else listingsFailure.value = answer.message;
            } catch (error) {
                if (token === listingsLoadToken) listingsFailure.value = describe(error);
            } finally {
                if (token === listingsLoadToken) listing.value = false;
            }
        },

        clearAccountState(): void {
            reportLoadToken += 1;
            listingsLoadToken += 1;
            report.value = null;
            reportFailure.value = null;
            checking.value = false;
            listings.value = [];
            listingsFailure.value = null;
            listing.value = false;
        },

        async start(request: BackupRequest): Promise<BackupResult | null> {
            if (bridge === null) return null;
            starting.value = true;
            startFailure.value = null;
            try {
                const result = await bridge.startBackup(request);
                if (!result.ok && (result.backupId === "" || result.backupId === "nowhere")) {
                    startFailure.value = result.failure;
                }
                return result;
            } catch (error) {
                startFailure.value = {
                    code: "bridge",
                    message: describe(error),
                    detail: null,
                    status: null,
                    needsSignIn: false,
                    accountId: null,
                    accountLogin: null,
                    accountHost: null,
                };
                return null;
            } finally {
                starting.value = false;
            }
        },

        async stop(backupId: string): Promise<boolean> {
            if (bridge === null) return false;
            put({ ...rowFor(backupId), stopping: true });
            return await bridge.cancelBackup(backupId);
        },

        async pause(backupId: string): Promise<boolean> {
            if (bridge?.pauseBackup === undefined) return false;
            // `pausing: true` here is a hint, not the source of truth - the main
            // process's own `pausing` event (handled above) is what actually drives the
            // control, and arrives moments later. Setting it here too means the button
            // reflects the click immediately rather than waiting a round trip for an
            // event that is coming anyway.
            put({ ...rowFor(backupId), pausing: true });
            return await bridge.pauseBackup(backupId);
        },

        async liveResume(backupId: string): Promise<boolean> {
            if (bridge?.resumeBackup === undefined) return false;
            return await bridge.resumeBackup(backupId);
        },

        async reconcile(): Promise<void> {
            if (bridge === null) return;
            const active = await bridge.activeBackups();
            for (const backupId of active) {
                if (byId.value[backupId] === undefined) put(blankRow(backupId));
            }
            // Backups nobody's event stream will ever mention again in this window:
            // paused, and left that way by a session that has since closed. Adopted as
            // `paused`/not-live-resumable so the interface offers the restart-with-
            // `resumeTag` route rather than a Resume button that would find no live gate
            // to wake - see `canRestartPaused` and `liveResumable` on `BackupRow`.
            if (bridge.pausedBackups !== undefined) {
                const paused = await bridge.pausedBackups();
                for (const entry of paused) {
                    if (active.includes(entry.backupId)) continue;
                    const existing = byId.value[entry.backupId];
                    if (existing !== undefined && existing.live) continue;
                    put({
                        ...blankRow(entry.backupId),
                        state: "paused",
                        phase: entry.phase,
                        tag: entry.tag,
                        repository: entry.repository,
                        kind: entry.kind,
                        label: entry.label,
                        liveResumable: false,
                        live: true,
                    });
                }
            }
        },

        dispose(): void {
            unsubscribe?.();
        },
    };
}
