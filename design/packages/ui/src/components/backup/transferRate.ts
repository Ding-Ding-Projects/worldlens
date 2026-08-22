/**
 * How fast a transfer is actually going, and how long is left at that rate.
 *
 * The main process reports how many bytes are done, not how quickly they arrived, so a
 * long upload showed a bar and a total and nothing at all about whether it was moving.
 * "It might be stuck" and "it has forty minutes left" look identical from a percentage
 * that has not visibly changed in a minute, and the second one is far less alarming.
 *
 * ## Why the rate is smoothed rather than measured between the last two samples
 *
 * A packing pass writes one file at a time, so consecutive samples swing between nothing
 * and a whole large region file. An instantaneous rate computed from two samples reads as
 * a number flickering between 0 and 300 MB/s, which is worse than no number: it looks
 * broken, and nobody can read a value that changes faster than they can focus on it.
 *
 * So this keeps a short window and reports the average across it. The window is in TIME
 * rather than in samples, because a stalled transfer stops producing samples entirely and
 * a sample-counted window would keep happily reporting the speed it had before it stalled.
 */

/** One observation of a transfer's progress. */
export interface RateSample {
    readonly at: number;
    readonly bytesDone: number;
}

export interface TransferRate {
    /** Bytes per second across the window, or null when there is not enough to say. */
    readonly bytesPerSecond: number | null;
    /** Seconds remaining at that rate, or null when it cannot be known. */
    readonly secondsRemaining: number | null;
}

/** How much history the average is taken over. */
export const RATE_WINDOW_MS = 20_000;

/**
 * A transfer must be observed for at least this long before any rate is reported.
 *
 * A rate computed from the first half-second of an upload is arithmetic on noise, and
 * showing "1.2 GB/s" for a moment teaches somebody that the number is not to be trusted.
 */
export const RATE_MIN_SPAN_MS = 3_000;

/**
 * Keeps the window and answers the two questions a progress line should be able to answer.
 *
 * Deliberately a plain object with no timers and no clock of its own: the caller supplies
 * every timestamp, so a test can drive an hour of transfer in a millisecond and there is
 * no interval to leak when a card unmounts.
 */
export function createRateMeter(windowMs: number = RATE_WINDOW_MS) {
    let samples: RateSample[] = [];

    return {
        /** Forgets everything. Used when a transfer restarts, so old speed cannot bleed in. */
        reset(): void {
            samples = [];
        },

        observe(at: number, bytesDone: number): void {
            const last = samples[samples.length - 1];

            // A count that went backwards means a different transfer, a retry, or a resume
            // from an earlier offset. Averaging across that produces a negative rate, so the
            // window starts again rather than reporting nonsense.
            if (last !== undefined && bytesDone < last.bytesDone) {
                samples = [{ at, bytesDone }];
                return;
            }

            samples.push({ at, bytesDone });
            const cutoff = at - windowMs;
            // Keep one sample from before the cutoff: it is the far end of the measurement,
            // and dropping it would shrink the window to whatever arrived most recently.
            const firstInside = samples.findIndex((sample) => sample.at >= cutoff);
            if (firstInside > 1) samples = samples.slice(firstInside - 1);
        },

        rate(bytesTotal: number): TransferRate {
            const first = samples[0];
            const last = samples[samples.length - 1];
            if (first === undefined || last === undefined) {
                return { bytesPerSecond: null, secondsRemaining: null };
            }

            const spanMs = last.at - first.at;
            const moved = last.bytesDone - first.bytesDone;
            if (spanMs < RATE_MIN_SPAN_MS || moved <= 0) {
                return { bytesPerSecond: null, secondsRemaining: null };
            }

            const bytesPerSecond = (moved * 1000) / spanMs;
            const remaining = bytesTotal - last.bytesDone;
            // A total of zero means nobody said how big this is, which is a real state - the
            // honest answer is a speed with no estimate, rather than an estimate of zero.
            const secondsRemaining =
                bytesTotal > 0 && remaining > 0 ? Math.round(remaining / bytesPerSecond) : null;

            return { bytesPerSecond, secondsRemaining };
        },
    };
}

/** `1.4 MB/s`, or empty when there is nothing honest to say yet. */
export function rateText(rate: TransferRate, formatBytes: (bytes: number) => string): string {
    if (rate.bytesPerSecond === null) return "";
    return `${formatBytes(Math.round(rate.bytesPerSecond))}/s`;
}

/**
 * `about 4 minutes left`, in units somebody can act on.
 *
 * Rounded deliberately coarsely. A remaining time that counts down second by second is the
 * jitter this whole change exists to remove, and nobody schedules their afternoon around
 * the difference between 7 and 8 minutes.
 */
export function remainingText(rate: TransferRate): string {
    const seconds = rate.secondsRemaining;
    if (seconds === null || seconds <= 0) return "";

    if (seconds < 60) return "less than a minute left";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"} left`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (rest === 0) return `about ${hours} hour${hours === 1 ? "" : "s"} left`;
    return `about ${hours}h ${rest}m left`;
}
