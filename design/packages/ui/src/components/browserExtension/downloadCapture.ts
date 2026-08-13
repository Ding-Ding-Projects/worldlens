/**
 * The three-state shape a browser-extension download capture moves through.
 *
 * A capture starts as a proposal a person has not agreed to yet, becomes a transfer this
 * application is actually running, and ends as one of three honest outcomes. Nothing here
 * talks to a browser or to disk; this file only names the shape and does the arithmetic
 * that turns raw byte counts into words a person can read at a glance. The seam that
 * actually receives a capture from an installed extension is `browserExtensionHost.ts`.
 *
 * ## Why rate and ETA can be null, and why that matters
 *
 * A transfer whose total size is unknown - a server that never sent a `Content-Length`,
 * for instance - cannot honestly report an ETA, and pretending otherwise is exactly the
 * "simulated progress value" the contract for this surface forbids. `formatEta` and
 * `formatRate` return null in that case, and the surface that renders them says "unknown"
 * in words rather than leaving a blank the way a broken progress bar would.
 */

/** One captured download, before or after it starts transferring. */
export interface CapturedDownload {
    readonly id: string;
    readonly filename: string;
    /** Where the extension found it. Shown so the Start dialog names a real source. */
    readonly sourceUrl: string;
    /** The local path this file will land at, or has landed at. */
    readonly destination: string;
    /** Null when the server never reported a size; every surface must say so honestly. */
    readonly sizeBytes: number | null;
}

export type DownloadState = "pending" | "downloading" | "paused" | "completed" | "cancelled" | "failed";

/** The Downloading dialog's live readout. Every field here is a fact about the real transfer. */
export interface DownloadProgress {
    readonly bytesDone: number;
    /** Null exactly when {@link CapturedDownload.sizeBytes} is null: no total, no percentage. */
    readonly bytesTotal: number | null;
    /** Bytes per second, averaged over a short recent window. Null before the first sample. */
    readonly ratePerSecond: number | null;
    /** Seconds remaining at the current rate. Null whenever the total or the rate is null. */
    readonly etaSeconds: number | null;
    readonly state: DownloadState;
    /** Set only in the `failed` state, and always a real reason rather than a generic label. */
    readonly errorMessage: string | null;
}

/** A finished transfer's honest outcome, for the completion notice. */
export type DownloadOutcome =
    | { readonly kind: "completed"; readonly bytesDone: number }
    | { readonly kind: "cancelled"; readonly bytesDone: number }
    | { readonly kind: "failed"; readonly reason: string };

/**
 * Human-scale byte formatting, base 1024, one decimal place past the first unit.
 *
 * Kept local rather than pulled from a shared formatter elsewhere in the package, because
 * every other byte formatter in this codebase is tuned for render output sizes in the
 * gigabyte range; a download in progress is just as often a few hundred kilobytes; and
 * duplicating six lines of arithmetic here is cheaper than a cross-package dependency for
 * a function this small.
 */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const formatted = unitIndex === 0 ? String(Math.round(value)) : value.toFixed(1);
    return `${formatted} ${units[unitIndex]}`;
}

/** `"1.2 MB/s"`, or null when no rate has been sampled yet. Never a guessed placeholder. */
export function formatRate(ratePerSecond: number | null): string | null {
    if (ratePerSecond === null || !Number.isFinite(ratePerSecond) || ratePerSecond < 0) return null;
    return `${formatBytes(ratePerSecond)}/s`;
}

/**
 * `"2m 14s"`-shaped, or null when the total size or the current rate makes an ETA
 * unknowable. A zero rate with bytes still remaining is exactly that case: dividing by
 * zero would print `Infinity`, which reads as a bug rather than as "no answer yet".
 */
export function formatEta(etaSeconds: number | null): string | null {
    if (etaSeconds === null || !Number.isFinite(etaSeconds) || etaSeconds < 0) return null;
    const total = Math.round(etaSeconds);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

/** Computes the ETA a progress snapshot should carry, honouring every null case above. */
export function computeEtaSeconds(progress: {
    readonly bytesDone: number;
    readonly bytesTotal: number | null;
    readonly ratePerSecond: number | null;
}): number | null {
    if (progress.bytesTotal === null || progress.ratePerSecond === null) return null;
    if (progress.ratePerSecond <= 0) return null;
    const remaining = progress.bytesTotal - progress.bytesDone;
    if (remaining <= 0) return 0;
    return remaining / progress.ratePerSecond;
}

/** The completion notice's outcome, from the last progress snapshot a transfer produced. */
export function describeOutcome(progress: DownloadProgress): DownloadOutcome | null {
    switch (progress.state) {
        case "completed":
            return { kind: "completed", bytesDone: progress.bytesDone };
        case "cancelled":
            return { kind: "cancelled", bytesDone: progress.bytesDone };
        case "failed":
            return {
                kind: "failed",
                reason: progress.errorMessage ?? "The transfer failed for an unrecorded reason.",
            };
        default:
            // Still running or still pending: there is no outcome to describe yet, and the
            // completion notice must never claim one before the transfer actually finishes.
            return null;
    }
}

/** A whole percentage 0-100, or null exactly when there is no total to measure against. */
export function percentDone(progress: { bytesDone: number; bytesTotal: number | null }): number | null {
    if (progress.bytesTotal === null || progress.bytesTotal <= 0) return null;
    return Math.min(100, Math.max(0, Math.round((progress.bytesDone / progress.bytesTotal) * 100)));
}
