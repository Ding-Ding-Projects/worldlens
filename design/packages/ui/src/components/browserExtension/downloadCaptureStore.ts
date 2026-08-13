/**
 * Reactive state for browser-extension download captures: pending decisions, active
 * transfers, and finished ones.
 *
 * Copies the fail-closed read pattern from `../markers/markerStudioStore.ts`. Persisted
 * history is a record of what this machine actually downloaded, so an unreadable store
 * reports itself with a `failure` string rather than quietly answering "nothing has ever
 * been downloaded" - the same wrong answer the markers store refuses to give, and for the
 * same reason: it invites somebody to re-run a transfer that already finished.
 *
 * Only finished transfers (`completed`, `cancelled`, `failed`) are persisted. A `pending`
 * or `downloading` entry describes a live process this session started; replaying it after
 * a restart would show a transfer that is not actually running and whose controls do
 * nothing, which is exactly the "decorative control" failure this project's own rules
 * forbid. A reload therefore always starts with an empty pending/active set and whatever
 * finished history could be read.
 */

import { computed, reactive, watch, type ComputedRef } from "vue";

import type { CapturedDownload, DownloadOutcome, DownloadProgress } from "./downloadCapture.js";

export const DOWNLOAD_STORAGE_KEY = "worldlens-download-captures";

/** One finished transfer, kept for the completion notice history and nothing else. */
export interface FinishedDownload {
    readonly download: CapturedDownload;
    readonly outcome: DownloadOutcome;
    readonly finishedAt: string;
}

interface DownloadState {
    /** Awaiting the Start download decision. Never began transferring. */
    pending: CapturedDownload[];
    /** Actively downloading or paused, keyed by download id. */
    active: Map<string, DownloadProgress>;
    /** What each active entry in `active` actually is, so the Downloading dialog can name it. */
    activeDownloads: Map<string, CapturedDownload>;
    finished: FinishedDownload[];
    /** Non-null when the persisted finished history could not be read. Never confused with "none". */
    failure: string | null;
}

function load(): { finished: FinishedDownload[]; failure: string | null } {
    try {
        const raw = localStorage.getItem(DOWNLOAD_STORAGE_KEY);
        if (raw === null) return { finished: [], failure: null };
        const parsed = JSON.parse(raw) as { finished?: unknown };
        if (!Array.isArray(parsed.finished)) {
            return {
                finished: [],
                failure: "The saved download history is not in a shape this build recognises.",
            };
        }
        return { finished: parsed.finished as FinishedDownload[], failure: null };
    } catch (error) {
        return { finished: [], failure: error instanceof Error ? error.message : String(error) };
    }
}

const initial = load();

const state = reactive<DownloadState>({
    pending: [],
    active: new Map(),
    activeDownloads: new Map(),
    finished: initial.finished,
    failure: initial.failure,
});

let persisting = true;

watch(
    () => JSON.stringify(state.finished),
    (serialised) => {
        // A store that failed to read must not write over what it could not read: that would
        // turn "I could not parse your download history" into "your history is gone", which
        // is the same failure one step further along and no longer recoverable.
        if (!persisting || state.failure !== null) return;
        try {
            localStorage.setItem(DOWNLOAD_STORAGE_KEY, JSON.stringify({ finished: JSON.parse(serialised) }));
        } catch {
            // A full or refused quota is not worth losing the in-memory history over; the
            // next successful write catches up.
        }
    },
);

/** Stops persistence while a test rearranges the store, so one test cannot write another's. */
export function setDownloadPersistence(on: boolean): void {
    persisting = on;
}

/** Re-reads storage. Used after a test replaces `localStorage`, and by a restore. */
export function reloadDownloadCaptures(): void {
    const fresh = load();
    state.finished.splice(0, state.finished.length, ...fresh.finished);
    state.failure = fresh.failure;
}

/** Queues a proposal for the Start download decision. Nothing transfers until confirmed. */
export function proposeDownload(download: CapturedDownload): void {
    if (state.pending.some((entry) => entry.id === download.id)) return;
    state.pending.push(download);
}

/** The Start dialog's confirm action: moves a proposal into the active transfer set. */
export function confirmDownload(id: string): CapturedDownload | null {
    const index = state.pending.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const [download] = state.pending.splice(index, 1);
    if (download === undefined) return null;
    state.activeDownloads.set(id, download);
    state.active.set(id, {
        bytesDone: 0,
        bytesTotal: download.sizeBytes,
        ratePerSecond: null,
        etaSeconds: null,
        state: "downloading",
        errorMessage: null,
    });
    return download;
}

/** The Start dialog's cancel action: the proposal is discarded and the queue is unchanged. */
export function declineDownload(id: string): void {
    const index = state.pending.findIndex((entry) => entry.id === id);
    if (index >= 0) state.pending.splice(index, 1);
}

/** Applies a real progress report from the transfer this dialog is driving. */
export function updateDownloadProgress(id: string, progress: DownloadProgress): void {
    if (!state.active.has(id)) return;
    state.active.set(id, progress);
    if (progress.state === "completed" || progress.state === "cancelled" || progress.state === "failed") {
        finishActive(id, progress);
    }
}

function finishActive(id: string, progress: DownloadProgress): void {
    const download = state.activeDownloads.get(id);
    if (download === undefined) return;
    const outcome: DownloadOutcome =
        progress.state === "completed"
            ? { kind: "completed", bytesDone: progress.bytesDone }
            : progress.state === "cancelled"
              ? { kind: "cancelled", bytesDone: progress.bytesDone }
              : { kind: "failed", reason: progress.errorMessage ?? "The transfer failed for an unrecorded reason." };
    state.finished.unshift({ download, outcome, finishedAt: new Date().toISOString() });
    state.active.delete(id);
    state.activeDownloads.delete(id);
}

/** Marks the completion notice for a finished transfer as read, dismissing it from the list. */
export function dismissFinished(id: string): void {
    const index = state.finished.findIndex((entry) => entry.download.id === id);
    if (index >= 0) state.finished.splice(index, 1);
}

export function pendingDownloads(): ComputedRef<readonly CapturedDownload[]> {
    return computed(() => state.pending.slice());
}

export function activeDownload(id: string): ComputedRef<DownloadProgress | null> {
    return computed(() => state.active.get(id) ?? null);
}

export function activeDownloadCaptures(): ComputedRef<
    readonly { readonly download: CapturedDownload; readonly progress: DownloadProgress }[]
> {
    return computed(() =>
        [...state.activeDownloads.entries()]
            .map(([id, download]) => {
                const progress = state.active.get(id);
                return progress === undefined ? null : { download, progress };
            })
            .filter((entry): entry is { download: CapturedDownload; progress: DownloadProgress } => entry !== null),
    );
}

export function finishedDownloads(): ComputedRef<readonly FinishedDownload[]> {
    return computed(() => state.finished.slice());
}

export const downloadCaptureStore = state;
