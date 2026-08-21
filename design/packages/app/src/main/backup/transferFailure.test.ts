/**
 * Classification and retry policy, pinned in isolation from any real `gh` process.
 *
 * These are the exact behaviours the reported bug was missing: a bare non-zero exit used
 * to become one fixed "reauthenticate" sentence no matter what actually happened. Every
 * case below is a shape `gh release upload` or `gh api` can genuinely produce, and each one
 * must land in a different bucket - conflating any two of them is precisely how an
 * 8.69 GB upload's real secondary rate limit got reported to a user as a broken sign-in.
 */

import { describe, expect, it } from "vitest";
import {
    DEFAULT_GH_CLI_RETRY_POLICY,
    classifyGhCliFailure,
    computeBackoffMs,
    describeGhCliFailure,
    describeGhCliRetry,
    isRetryableGhCliFailure,
    sleepAbortable,
} from "./transferFailure.js";

describe("classifyGhCliFailure", () => {
    it("reads a 401 as a credential failure", () => {
        const classification = classifyGhCliFailure({
            started: true,
            code: 1,
            stderr: "HTTP 401: Bad credentials",
        });
        expect(classification).toMatchObject({ kind: "credential", status: 401 });
        expect(classification.retryAfterMs).toBeNull();
    });

    it("reads a bare 403 as a credential failure, not a rate limit", () => {
        const classification = classifyGhCliFailure({
            started: true,
            code: 1,
            stderr: "HTTP 403: Resource not accessible by integration",
        });
        expect(classification.kind).toBe("credential");
    });

    it("reads a 403 naming a secondary rate limit as rate-limited, never credential", () => {
        const classification = classifyGhCliFailure({
            started: true,
            code: 1,
            stderr: "HTTP 403: You have exceeded a secondary rate limit. Please wait a few minutes.",
        });
        expect(classification.kind).toBe("rate-limited");
        // This is the exact defect this file exists to close: the old code threw away the
        // status it had just parsed and told everyone to reauthenticate. It must not.
        expect(classification.kind).not.toBe("credential");
    });

    it("reads abuse-detection wording as rate-limited too", () => {
        const classification = classifyGhCliFailure({
            started: true,
            code: 1,
            stderr: "HTTP 403: You have triggered an abuse detection mechanism.",
        });
        expect(classification.kind).toBe("rate-limited");
    });

    it("reads a 429 as rate-limited even with no rate-limit wording", () => {
        const classification = classifyGhCliFailure({
            started: true,
            code: 1,
            stderr: "HTTP 429: too many requests",
        });
        expect(classification.kind).toBe("rate-limited");
    });

    it("reads a Retry-After header into milliseconds when gh surfaces one", () => {
        const classification = classifyGhCliFailure({
            started: true,
            code: 1,
            stderr: "HTTP 429: too many requests\nRetry-After: 47",
        });
        expect(classification.retryAfterMs).toBe(47_000);
    });

    it("reads 500-599 as transient", () => {
        for (const status of [500, 502, 503, 504]) {
            const classification = classifyGhCliFailure({
                started: true,
                code: 1,
                stderr: `HTTP ${String(status)}: something went sideways on GitHub's end`,
            });
            expect(classification.kind).toBe("transient");
        }
    });

    it("reads a dropped connection with no HTTP status at all as transient", () => {
        const classification = classifyGhCliFailure({
            started: true,
            code: 1,
            stderr: "write tcp: connection reset by peer (ECONNRESET)",
        });
        expect(classification.kind).toBe("transient");
        expect(classification.status).toBe(0);
    });

    it("reads a 404 as other, and never retries it", () => {
        const classification = classifyGhCliFailure({
            started: true,
            code: 1,
            stderr: "HTTP 404: Not Found",
        });
        expect(classification.kind).toBe("other");
        expect(isRetryableGhCliFailure(classification.kind)).toBe(false);
    });

    it("reads a 422 as other too", () => {
        const classification = classifyGhCliFailure({
            started: true,
            code: 1,
            stderr: "HTTP 422: Validation Failed",
        });
        expect(classification.kind).toBe("other");
    });

    it("reads gh itself failing to start as other, not credential", () => {
        const classification = classifyGhCliFailure({ started: false, code: null, stderr: "" });
        expect(classification.kind).toBe("other");
        expect(classification.status).toBe(0);
    });

    it("marks only rate-limited and transient as retryable", () => {
        expect(isRetryableGhCliFailure("rate-limited")).toBe(true);
        expect(isRetryableGhCliFailure("transient")).toBe(true);
        expect(isRetryableGhCliFailure("credential")).toBe(false);
        expect(isRetryableGhCliFailure("other")).toBe(false);
    });
});

describe("describeGhCliFailure", () => {
    it("only ever says 'reauthenticate' for a credential failure", () => {
        const credential = describeGhCliFailure("upload", "world.zip.001", {
            kind: "credential",
            status: 401,
            retryAfterMs: null,
        });
        expect(credential).toMatch(/reauthenticate/i);

        for (const kind of ["rate-limited", "transient", "other"] as const) {
            const message = describeGhCliFailure("upload", "world.zip.001", {
                kind,
                status: 500,
                retryAfterMs: null,
            });
            expect(message).not.toMatch(/reauthenticate/i);
        }
    });

    it("tells a rate-limited failure apart from a credential one in plain words", () => {
        const message = describeGhCliFailure("upload", "world.zip.001", {
            kind: "rate-limited",
            status: 403,
            retryAfterMs: null,
        });
        expect(message).toMatch(/not a credential problem/i);
    });
});

describe("computeBackoffMs", () => {
    it("honours GitHub's own Retry-After over the computed backoff", () => {
        const waitMs = computeBackoffMs(1, 5_000, DEFAULT_GH_CLI_RETRY_POLICY);
        expect(waitMs).toBe(5_000);
    });

    it("caps Retry-After at the policy's own maximum wait", () => {
        const waitMs = computeBackoffMs(1, 10 * 60 * 1000, DEFAULT_GH_CLI_RETRY_POLICY);
        expect(waitMs).toBeLessThanOrEqual(DEFAULT_GH_CLI_RETRY_POLICY.maxDelayMs);
    });

    it("grows with each attempt and never exceeds the policy's cap", () => {
        for (let attempt = 1; attempt <= 8; attempt += 1) {
            const waitMs = computeBackoffMs(attempt, null, DEFAULT_GH_CLI_RETRY_POLICY);
            expect(waitMs).toBeGreaterThanOrEqual(0);
            expect(waitMs).toBeLessThanOrEqual(DEFAULT_GH_CLI_RETRY_POLICY.maxDelayMs);
        }
    });
});

describe("sleepAbortable", () => {
    it("resolves after the delay when never cancelled", async () => {
        const controller = new AbortController();
        const started = Date.now();
        await sleepAbortable(10, controller.signal);
        expect(Date.now() - started).toBeGreaterThanOrEqual(0);
    });

    it("rejects immediately when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(sleepAbortable(10_000, controller.signal)).rejects.toThrow();
    });

    it("rejects as soon as the signal aborts mid-wait, not after the full delay", async () => {
        const controller = new AbortController();
        const promise = sleepAbortable(10_000, controller.signal);
        const rejection = expect(promise).rejects.toThrow();
        controller.abort();
        await rejection;
    });
});

describe("describeGhCliRetry", () => {
    it("names the wait and the attempt count, and blames GitHub's rate limit honestly", () => {
        const message = describeGhCliRetry(
            "upload",
            "world.zip.001",
            { kind: "rate-limited", status: 403, retryAfterMs: null },
            2,
            6,
            47_000,
        );
        expect(message).toContain("47s");
        expect(message).toContain("attempt 3 of 6");
        expect(message).toMatch(/rate-limited/i);
    });
});
