/**
 * Riding out the GitHub failures that go away on their own, on the path that watches a run.
 *
 * ## The failure this file exists to close
 *
 * A render that had already finished four waves died on this sentence:
 *
 * > Reading run 33666847877 failed: GitHub answered 502. GitHub said: GitHub CLI refused
 * > the request.
 *
 * Nothing about that was fatal. The Actions run was still going; what stopped was
 * Worldlens' willingness to keep watching it. Because artifacts are collected only at the
 * end of the watch, one bad answer threw away hours of completed render work that was
 * still sitting on GitHub, intact.
 *
 * Waves and shards share a single workflow run, so this was never a per-shard failure
 * either: one unlucky poll takes the whole sync down however many waves had succeeded.
 *
 * ## Why this is small
 *
 * `backup/transferFailure.ts` already decided what a transient GitHub failure is, already
 * honours `Retry-After`, and already computes jittered bounded backoff - the backup path
 * has ridden these out for a while. `cirender/transport.ts` even imports its classifier
 * for the upload path. The run-read path is simply the one place that never got it, so
 * this file borrows that policy rather than inventing a second one that could drift.
 *
 * ## What is deliberately not retried
 *
 * A retry only makes sense for a condition that improves without anybody doing anything.
 * A 401 credential, a 404 run, a 422 request and a `gh` that will not spawn are all
 * permanent until a person acts, and hammering them turns an instant, accurate error into
 * a two-minute wait ending in the same error.
 */
import { ActionsCallError } from "./actions.js";
import {
    DEFAULT_GH_CLI_RETRY_POLICY,
    computeBackoffMs,
    sleepAbortable,
    type GhCliRetryPolicy,
} from "../backup/transferFailure.js";
import { GH_CLI_UNAVAILABLE_STATUS } from "../ghcli/credentialBroker.js";

export type { GhCliRetryPolicy };
export { DEFAULT_GH_CLI_RETRY_POLICY };

/**
 * Whether asking GitHub the exact same question again could plausibly answer differently.
 *
 * Status `0` is the important one and the least obvious: it is what both routes report
 * when there was no HTTP answer at all - a dropped socket, a DNS failure, a killed child
 * process. Those are the most retryable failures there are, and reading them as "not a
 * 5xx, therefore permanent" is how a network blip became a dead render.
 */
export function isRetryableRunReadStatus(status: number): boolean {
    if (status === GH_CLI_UNAVAILABLE_STATUS) return false;
    if (status === 0) return true;
    if (status === 408 || status === 429) return true;
    return status >= 500 && status <= 599;
}

/** True for the errors this loop rides out; anything else is reported at once, unchanged. */
export function isRetryableRunReadError(error: unknown): boolean {
    return error instanceof ActionsCallError && isRetryableRunReadStatus(error.status);
}

export interface RunReadRetryContext {
    /**
     * Cancellation, honoured *during* a backoff as well as between attempts. A wait a user
     * cannot interrupt would be a worse failure than the one it is covering for.
     */
    readonly signal: AbortSignal;
    /** What to say while waiting, so a stalled-looking render explains itself in its log. */
    readonly onRetry: (message: string) => void;
    readonly policy?: GhCliRetryPolicy;
    /** Injected in tests so no suite waits on a real backoff. */
    readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

/** The sentence the render log shows while a retry is pending. */
export function describeRunReadRetry(
    what: string,
    error: ActionsCallError,
    attempt: number,
    maxAttempts: number,
    waitMs: number,
): string {
    const seconds = Math.max(1, Math.round(waitMs / 1000));
    const because =
        error.status === 0
            ? "GitHub did not answer at all"
            : `GitHub answered ${String(error.status)}`;
    return (
        `${because} while ${what}. The run itself is unaffected; retrying in ` +
        `${String(seconds)}s (attempt ${String(attempt + 1)} of ${String(maxAttempts)}).`
    );
}

/**
 * Runs `operation`, retrying only the failures that can improve, and re-throwing the
 * original error untouched once the budget is spent.
 *
 * The original error is re-thrown rather than wrapped so that `sync.ts`'s `fromError`
 * keeps classifying 401 and 403 into the sign-in recovery exactly as it does today.
 */
export async function withRunReadRetry<T>(
    what: string,
    operation: () => Promise<T>,
    context: RunReadRetryContext,
): Promise<T> {
    const policy = context.policy ?? DEFAULT_GH_CLI_RETRY_POLICY;
    const sleep = context.sleep ?? sleepAbortable;
    let waited = 0;

    for (let attempt = 1; ; attempt += 1) {
        context.signal.throwIfAborted();
        try {
            return await operation();
        } catch (error) {
            if (!isRetryableRunReadError(error)) throw error;
            // An abort surfaces as a thrown error from the call itself on some routes; a
            // cancel must never be mistaken for something worth retrying.
            if (context.signal.aborted) throw error;
            if (attempt >= policy.maxAttempts) throw error;

            const wait = computeBackoffMs(
                attempt,
                (error as ActionsCallError & { retryAfterMs?: number | null }).retryAfterMs ?? null,
                policy,
            );
            if (waited + wait > policy.maxTotalWaitMs) throw error;
            waited += wait;

            context.onRetry(
                describeRunReadRetry(
                    what,
                    error as ActionsCallError,
                    attempt,
                    policy.maxAttempts,
                    wait,
                ),
            );
            await sleep(wait, context.signal);
        }
    }
}
