/**
 * The retry that keeps a four-hour render alive across one bad answer.
 *
 * Every case here is really the same question asked twice: does this failure improve if
 * nobody does anything? A 502 and a dropped socket do; a 401 and a missing `gh` never do.
 * Retrying the second group is not merely wasteful - it turns an instant, accurate error
 * into a two-minute wait ending in the same error, which is a worse product than the bug
 * this file exists to fix.
 */
import { describe, expect, it } from "vitest";
import { ActionsCallError } from "./actions.js";
import {
    DEFAULT_GH_CLI_RETRY_POLICY,
    isRetryableRunReadError,
    isRetryableRunReadStatus,
    withRunReadRetry,
    type RunReadRetryContext,
} from "./runRetry.js";
import { GH_CLI_UNAVAILABLE_STATUS } from "../ghcli/credentialBroker.js";

const NEVER_ABORTED = new AbortController().signal;

/** A context whose backoff is instantaneous, so no suite waits on a real wall-clock delay. */
function context(overrides: Partial<RunReadRetryContext> = {}): RunReadRetryContext {
    return {
        signal: NEVER_ABORTED,
        onRetry: () => {},
        sleep: () => Promise.resolve(),
        ...overrides,
    };
}

function failWith(status: number): ActionsCallError {
    return new ActionsCallError(`GitHub answered ${String(status)}.`, status, "https://example");
}

describe("what is worth asking again", () => {
    it("retries the statuses that clear on their own", () => {
        for (const status of [0, 408, 429, 500, 502, 503, 504]) {
            expect(isRetryableRunReadStatus(status), `status ${String(status)}`).toBe(true);
        }
    });

    it("never retries a refusal that a second identical request cannot change", () => {
        for (const status of [400, 401, 403, 404, 422]) {
            expect(isRetryableRunReadStatus(status), `status ${String(status)}`).toBe(false);
        }
    });

    it("never retries a GitHub CLI that could not be started", () => {
        // The status this excludes is inside the 5xx range on purpose - it has to be, to
        // travel back through a synthesized Response - so excluding it by name rather than
        // by range is the whole point. A missing executable does not install itself.
        expect(GH_CLI_UNAVAILABLE_STATUS).toBeGreaterThanOrEqual(500);
        expect(isRetryableRunReadStatus(GH_CLI_UNAVAILABLE_STATUS)).toBe(false);
    });

    it("treats anything that is not an Actions failure as not worth retrying", () => {
        expect(isRetryableRunReadError(new Error("something else"))).toBe(false);
        expect(isRetryableRunReadError(failWith(502))).toBe(true);
    });
});

describe("riding one out", () => {
    it("returns the answer once GitHub gives one, without troubling the caller", async () => {
        let attempts = 0;
        const said: string[] = [];
        const value = await withRunReadRetry(
            "reading run 1",
            () => {
                attempts += 1;
                if (attempts < 3) throw failWith(502);
                return Promise.resolve("the run");
            },
            context({ onRetry: (message) => said.push(message) }),
        );

        expect(value).toBe("the run");
        expect(attempts).toBe(3);
        // Two waits, and each one says so: a render that goes quiet for a minute without
        // explaining itself reads as a hang, which is its own support burden.
        expect(said).toHaveLength(2);
        expect(said[0]).toContain("reading run 1");
        expect(said[0]).toContain("The run itself is unaffected");
    });

    it("reports a permanent refusal immediately, with no wait and no retry line", async () => {
        let attempts = 0;
        const said: string[] = [];
        await expect(
            withRunReadRetry(
                "reading run 1",
                () => {
                    attempts += 1;
                    return Promise.reject(failWith(401));
                },
                context({ onRetry: (message) => said.push(message) }),
            ),
        ).rejects.toMatchObject({ status: 401 });

        expect(attempts).toBe(1);
        expect(said).toEqual([]);
    });

    it("gives up after the policy's attempts and re-throws the original error untouched", async () => {
        let attempts = 0;
        const original = failWith(502);
        await expect(
            withRunReadRetry(
                "reading run 1",
                () => {
                    attempts += 1;
                    return Promise.reject(original);
                },
                context(),
            ),
        ).rejects.toBe(original);

        // Re-thrown by identity, not wrapped: `sync.ts` still has to be able to read the
        // status off it to decide between the sign-in recovery and everything else.
        expect(attempts).toBe(DEFAULT_GH_CLI_RETRY_POLICY.maxAttempts);
    });

    it("stops waiting the moment the render is cancelled", async () => {
        const controller = new AbortController();
        let attempts = 0;
        await expect(
            withRunReadRetry(
                "reading run 1",
                () => {
                    attempts += 1;
                    controller.abort();
                    return Promise.reject(failWith(502));
                },
                context({ signal: controller.signal }),
            ),
        ).rejects.toMatchObject({ status: 502 });

        // A cancel is a real cancel: it is not something to be retried through, and the
        // backoff is not a window in which the stop button stops working.
        expect(attempts).toBe(1);
    });

    it("honours a total-wait budget even when attempts remain", async () => {
        let attempts = 0;
        await expect(
            withRunReadRetry(
                "reading run 1",
                () => {
                    attempts += 1;
                    return Promise.reject(failWith(503));
                },
                context({
                    policy: {
                        maxAttempts: 50,
                        baseDelayMs: 1_000,
                        maxDelayMs: 1_000,
                        maxTotalWaitMs: 2_000,
                    },
                }),
            ),
        ).rejects.toMatchObject({ status: 503 });

        // Three attempts: two of them paid for by the 2s budget, then no budget left.
        expect(attempts).toBe(3);
    });
});
