/**
 * Turning a failed `gh` CLI call into an honest reason, and retrying the reasons that are
 * worth retrying.
 *
 * ## The trap this file exists to close
 *
 * `runner.ts` and `restore.ts` used to build ONE fixed sentence for every non-zero exit
 * from `gh release upload` / `gh api` - "Reauthenticate the selected account and try
 * again." - regardless of what actually went wrong. The HTTP status was parsed out of
 * `stderr` and then thrown away one line later, so a secondary rate limit, a 429, a
 * transient 502/503, or a dropped connection during an 8.69 GB upload were all reported to
 * the user as "your sign-in is broken", which sends them to fix the one thing that was
 * never the problem. This module is the one place that decides what a failure actually
 * was, so the two runners cannot each grow their own guess and drift apart.
 *
 * ## Why credential is the narrow case, not the default
 *
 * A 401 always means the credential is bad. A 403 sometimes does - and sometimes means
 * GitHub's abuse-detection layer asked for a slower pace, which reads identically at the
 * status-code level and completely differently in `stderr`. Treating every 403 as a
 * credential failure is the bug this module fixes; treating no 403 as one would just be
 * the opposite bug, so a 403 is only ever classified as `rate-limited` when `stderr`
 * actually names a rate limit, and falls back to `credential` otherwise - which is the
 * pre-existing behaviour this module preserves for every 403 that is not one.
 *
 * ## Retrying is bounded on purpose
 *
 * A rate limit and a transient server hiccup both go away on their own; a bad credential,
 * a 404, and a 422 never do, no matter how many times the exact same request is repeated.
 * Retrying the first two and refusing to retry the rest is the whole point of classifying
 * at all - a retry loop that does not know the difference either hammers a broken
 * credential forever or gives up on a rate limit that would have cleared in a minute.
 */

export type GhCliFailureKind = "credential" | "rate-limited" | "transient" | "other";

export interface GhCliFailureClassification {
    readonly kind: GhCliFailureKind;
    /** The HTTP status `gh` reported, or 0 when none could be read from `stderr`. */
    readonly status: number;
    /** Milliseconds GitHub itself asked for, when `stderr` named one. Null otherwise. */
    readonly retryAfterMs: number | null;
}

/** What a `gh` child process reports, whichever of `uploadReleaseAsset` or `downloadApi` ran it. */
export interface GhCliCallResult {
    readonly started: boolean;
    readonly code: number | null;
    readonly stderr: string;
}

/**
 * Real `gh` CLI wording, gathered from GitHub's own abuse-detection and secondary
 * rate-limit responses. Deliberately case-insensitive and permissive: missing one real
 * phrasing here means a rate limit gets misclassified as a hard failure again, which is
 * exactly the defect this module exists to close, so the list stays wide rather than
 * exact.
 */
const RATE_LIMIT_STDERR_PATTERN =
    /(secondary rate limit|abuse detection|rate limit exceeded|api rate limit|you have exceeded a rate limit)/i;

/** `gh`/curl do not always print this header verbatim, but when they do, it is exact. */
const RETRY_AFTER_PATTERN = /retry-after:?\s*(\d+)/i;

/**
 * Signals that the request never got an HTTP answer at all - the connection itself broke.
 * None of these are the user's credential; all of them are worth trying again.
 */
const TRANSIENT_STDERR_PATTERN =
    /(econnreset|etimedout|econnrefused|epipe|socket hang up|network is unreachable|eai_again|unexpected eof|timed out|connection reset)/i;

/** The same status-from-`stderr` parse `runner.ts` already used, kept in one place now. */
function statusFromStderr(stderr: string): number {
    const matched = /(?:\(HTTP |HTTP )(\d{3})/.exec(stderr)?.[1];
    return matched === undefined ? 0 : Number.parseInt(matched, 10);
}

/**
 * Decides what a failed `gh` call actually was, from the exit shape alone - never from
 * which caller is asking, so an upload and a download are classified identically.
 */
export function classifyGhCliFailure(result: GhCliCallResult): GhCliFailureClassification {
    // `gh` itself could not be started - missing from PATH, not a permission or network
    // problem at all, and retrying the exact same spawn will not change that.
    if (!result.started) return { kind: "other", status: 0, retryAfterMs: null };

    const status = statusFromStderr(result.stderr);
    const retryMatch = RETRY_AFTER_PATTERN.exec(result.stderr);
    const retryAfterMs = retryMatch === null ? null : Math.max(0, Number.parseInt(retryMatch[1]!, 10)) * 1000;

    if (status === 429 || RATE_LIMIT_STDERR_PATTERN.test(result.stderr)) {
        return { kind: "rate-limited", status: status === 0 ? 429 : status, retryAfterMs };
    }
    if (status === 401) return { kind: "credential", status, retryAfterMs: null };
    if (status === 403) return { kind: "credential", status, retryAfterMs: null };
    if (status >= 500 && status <= 599) return { kind: "transient", status, retryAfterMs };
    if (status === 0 && TRANSIENT_STDERR_PATTERN.test(result.stderr)) {
        return { kind: "transient", status, retryAfterMs };
    }
    return { kind: "other", status, retryAfterMs };
}

/** Only these two kinds are worth trying again; a bad credential or a 404 never improve. */
export function isRetryableGhCliFailure(kind: GhCliFailureKind): boolean {
    return kind === "rate-limited" || kind === "transient";
}

export interface GhCliRetryPolicy {
    /** Total attempts including the first, so `maxAttempts - 1` is the retry budget. */
    readonly maxAttempts: number;
    readonly baseDelayMs: number;
    /** A single wait is never longer than this, whatever the backoff or Retry-After says. */
    readonly maxDelayMs: number;
    /** The whole retry loop gives up once waits would exceed this, even with attempts left. */
    readonly maxTotalWaitMs: number;
}

/**
 * Six attempts (five retries), starting at two seconds and doubling, capped at a minute a
 * wait and ten minutes total. Long enough that a rate limit measured in tens of seconds
 * clears well inside the budget; bounded enough that a backup never quietly turns into an
 * unattended all-night retry loop with nothing to show for it but a spinner.
 */
export const DEFAULT_GH_CLI_RETRY_POLICY: GhCliRetryPolicy = {
    maxAttempts: 6,
    baseDelayMs: 2_000,
    maxDelayMs: 60_000,
    maxTotalWaitMs: 10 * 60 * 1000,
};

/**
 * How long to wait before the next attempt.
 *
 * GitHub's own `Retry-After` wins outright when it said one - it knows its own rate
 * limit's reset time better than a guess ever could. Otherwise: exponential backoff,
 * jittered to somewhere between half and the full exponential value so that several
 * concurrent uploads backing off from the same rate limit do not all wake up and retry on
 * the exact same tick and immediately re-trip it.
 */
export function computeBackoffMs(
    attempt: number,
    retryAfterMs: number | null,
    policy: GhCliRetryPolicy = DEFAULT_GH_CLI_RETRY_POLICY,
): number {
    if (retryAfterMs !== null) return Math.min(policy.maxDelayMs, retryAfterMs);
    const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
    const jittered = exponential * (0.5 + Math.random() * 0.5);
    return Math.min(policy.maxDelayMs, Math.round(jittered));
}

/**
 * An abortable sleep, so a retry wait is exactly as cancellable as the operation it is
 * waiting to retry - a backoff a user cannot stop would be worse than the failure it is
 * covering for, and this project's own standing rule says a cancel is a real cancel.
 */
export function sleepAbortable(delayMs: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new DOMException("Cancelled while waiting to retry.", "AbortError"));
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error?: DOMException): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            if (error === undefined) resolve();
            else reject(error);
        };
        const onAbort = (): void => finish(new DOMException("Cancelled while waiting to retry.", "AbortError"));
        const timer = setTimeout(() => finish(), delayMs);
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

/** One honest sentence per failure kind - never the fixed "reauthenticate" sentence for all four. */
export function describeGhCliFailure(
    action: "upload" | "download",
    name: string,
    classification: GhCliFailureClassification,
): string {
    const verb = action === "upload" ? "upload" : "download";
    switch (classification.kind) {
        case "credential":
            return `GitHub CLI could not ${verb} ${name}. Reauthenticate the selected account and try again.`;
        case "rate-limited":
            return (
                `GitHub rate-limited the ${verb} of ${name} and Worldlens already retried automatically` +
                " until the retry budget ran out. This was not a credential problem - GitHub was asking" +
                " for a slower pace. Try again in a few minutes; what already went up or came down is kept."
            );
        case "transient":
            return (
                `GitHub CLI could not ${verb} ${name} after several automatic retries, because of a` +
                " temporary network or server problem. This was not a credential problem. Try again;" +
                " what already went up or came down is kept."
            );
        case "other":
            return classification.status === 0
                ? `GitHub CLI could not ${verb} ${name}.`
                : `GitHub CLI could not ${verb} ${name} (GitHub answered HTTP ${String(classification.status)}).`;
    }
}

/** What a retry-in-progress log line says, so a stalled-looking wait explains itself. */
export function describeGhCliRetry(
    action: "upload" | "download",
    name: string,
    classification: GhCliFailureClassification,
    attempt: number,
    maxAttempts: number,
    waitMs: number,
): string {
    const verb = action === "upload" ? "upload" : "download";
    const reason =
        classification.kind === "rate-limited"
            ? "GitHub rate-limited this request"
            : "a temporary network or server problem interrupted this request";
    const seconds = Math.max(0, Math.round(waitMs / 1000));
    return (
        `${reason} while trying to ${verb} ${name}; retrying in ${String(seconds)}s` +
        ` (attempt ${String(attempt + 1)} of ${String(maxAttempts)}).`
    );
}
