/**
 * The reported bug, pinned end to end through the real `BackupRunner.backup()` call.
 *
 * `runner.test.ts` already proves the pack/split/upload/resume/cancel machinery against a
 * fake GitHub; this file is narrower and newer - it proves the one thing that was wrong
 * about how an upload FAILURE was reported and handled:
 *
 *  1. a rate-limited upload is retried automatically and the backup still finishes,
 *     logging the wait honestly rather than sitting there looking hung;
 *  2. a genuine credential failure carries the exact refused account as data
 *     (`accountId`/`accountLogin`/`accountHost`), not only as a sentence in `message`;
 *  3. a 404 - the kind of failure that repeating can never fix - is never retried, and
 *     never told to "reauthenticate" either.
 *
 * The fake lease below skips the HTTP layer for `uploadReleaseAsset` entirely and answers
 * deterministically by call count, which is what makes "fails twice, then succeeds" a
 * three-line fixture instead of a timing-dependent one.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessResult } from "../cirender/gh.js";
import { fakeGhAccountLease } from "../ghcli/testLease.js";
import { BackupRunner } from "./runner.js";
import type { BackupEvent } from "./runner.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-backup-reauth-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

async function makeWorld(): Promise<string> {
    const root = join(workDir, "saves", "overworld");
    await mkdir(join(root, "region"), { recursive: true });
    await writeFile(join(root, "level.dat"), "level-dat");
    await writeFile(join(root, "region", "r.0.0.mca"), "small-region-file");
    return root;
}

/** The minimum fake GitHub REST surface `backup()` touches before it ever uploads a byte. */
function fakeRepositoryApi() {
    const releases = new Map<string, { id: number; tag: string }>();
    let nextId = 100;

    return async (url: string, init?: RequestInit): Promise<Response> => {
        const method = init?.method ?? "GET";
        const answer = (status: number, body: unknown): Response =>
            ({
                ok: status >= 200 && status < 300,
                status,
                json: () => Promise.resolve(body),
            }) as unknown as Response;

        if (method === "GET" && /\/repos\/[^/]+\/[^/]+$/.test(url)) {
            return answer(200, {
                full_name: "o/r",
                name: "r",
                owner: { login: "o" },
                private: true,
                permissions: { push: true },
                html_url: "https://github.test/o/r",
            });
        }
        if (method === "GET" && url.includes("/releases/tags/")) {
            const tag = decodeURIComponent(url.split("/releases/tags/")[1] as string);
            const release = releases.get(tag);
            return release === undefined
                ? answer(404, { message: "Not Found" })
                : answer(200, {
                      id: release.id,
                      tag_name: release.tag,
                      name: `Backup ${release.tag}`,
                      html_url: `https://github.test/o/r/releases/tag/${release.tag}`,
                      upload_url: "https://uploads.test/",
                      created_at: "2026-08-21T00:00:00Z",
                      assets: [],
                  });
        }
        if (method === "POST" && url.endsWith("/releases")) {
            const body = JSON.parse(init?.body as string) as { tag_name: string };
            const release = { id: (nextId += 1), tag: body.tag_name };
            releases.set(body.tag_name, release);
            return answer(201, {
                id: release.id,
                tag_name: release.tag,
                name: `Backup ${release.tag}`,
                html_url: `https://github.test/o/r/releases/tag/${release.tag}`,
                upload_url: "https://uploads.test/",
                created_at: "2026-08-21T00:00:00Z",
                assets: [],
            });
        }
        throw new Error(`fakeRepositoryApi: unexpected request ${method} ${url}`);
    };
}

interface UploadScript {
    /** One answer consumed per call; the last entry repeats once the script runs out. */
    readonly answers: readonly ProcessResult[];
}

function makeRunner(uploads: UploadScript, events: BackupEvent[]) {
    let call = 0;
    return {
        callCount: () => call,
        runner: new BackupRunner({
            storageDir: () => join(workDir, "storage"),
            account: async (accountId) =>
                fakeGhAccountLease({
                    accountId: accountId ?? "github.com:octocat",
                    login: "octocat",
                    host: "github.com",
                    api: fakeRepositoryApi(),
                    uploadReleaseAsset: async () => {
                        const answer = uploads.answers[Math.min(call, uploads.answers.length - 1)];
                        call += 1;
                        return answer ?? { started: true, code: 0, stdout: "", stderr: "" };
                    },
                }),
            onEvent: (event) => events.push(event),
        }),
    };
}

describe("BackupRunner - honest failure classification and retry", () => {
    it("retries a rate-limited upload automatically and still finishes the backup", async () => {
        const events: BackupEvent[] = [];
        const { runner } = makeRunner(
            {
                answers: [
                    {
                        started: true,
                        code: 1,
                        stdout: "",
                        stderr: "HTTP 403: You have exceeded a secondary rate limit for the API.",
                    },
                    { started: true, code: 0, stdout: "", stderr: "" },
                ],
            },
            events,
        );

        const folder = await makeWorld();
        const result = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 1024 * 1024,
        });

        expect(result.ok).toBe(true);
        // The wait must be reported as a log line, not left silent - a user watching an
        // upload sit still for tens of seconds must see why, not guess "is this hung?".
        const retryLog = events.find(
            (event) => event.type === "log" && /rate-limited|rate limit/i.test(event.message),
        );
        expect(retryLog).toBeDefined();
        expect((retryLog as { level: string }).level).toBe("warning");
    });

    it("carries the exact refused account on a genuine credential failure", async () => {
        const events: BackupEvent[] = [];
        const { runner } = makeRunner(
            {
                answers: [{ started: true, code: 1, stdout: "", stderr: "HTTP 401: Bad credentials" }],
            },
            events,
        );

        const folder = await makeWorld();
        const result = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 1024 * 1024,
        });

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected a failure");
        expect(result.failure.needsSignIn).toBe(true);
        // The whole point of the fix: an identity a UI can act on, not only a sentence.
        expect(result.failure.accountId).toBe("github.com:octocat");
        expect(result.failure.accountLogin).toBe("octocat");
        expect(result.failure.accountHost).toBe("github.com");
        expect(result.failure.message).toMatch(/reauthenticate/i);
    });

    it("never retries and never says 'reauthenticate' for a 404", async () => {
        const events: BackupEvent[] = [];
        const { runner, callCount } = makeRunner(
            {
                answers: [{ started: true, code: 1, stdout: "", stderr: "HTTP 404: Not Found" }],
            },
            events,
        );

        const folder = await makeWorld();
        const result = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 1024 * 1024,
        });

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected a failure");
        expect(result.failure.needsSignIn).toBe(false);
        expect(result.failure.accountId).toBeNull();
        expect(result.failure.message).not.toMatch(/reauthenticate/i);
        // A 404 never improves by asking again - this is the whole reason it must not retry.
        expect(callCount()).toBe(1);
    });

    /*
     * A rate limit that outlasts the whole retry budget is deliberately NOT exercised
     * end to end here: `DEFAULT_GH_CLI_RETRY_POLICY`'s real backoff (2s, 4s, 8s, ...)
     * would make that a slow, wall-clock-dependent test for very little extra proof.
     * `transferFailure.test.ts` already pins the bounded-attempts and bounded-total-wait
     * behaviour directly against `computeBackoffMs` and `DEFAULT_GH_CLI_RETRY_POLICY`,
     * which is the part of this that actually needs pinning.
     */
});
