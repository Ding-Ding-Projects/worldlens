/**
 * Pause and resume, against the whole `BackupRunner` - the promise this file exists to
 * hold the code to: "pause redoes the whole thing" being an actual bug report about this
 * feature's first cut, not a hypothetical.
 *
 * Deliberately a **separate** file from `runner.test.ts` rather than additions to it: the
 * existing suite is already large, and every scenario here is specifically about the
 * pause/resume behaviour this task added, not about the backup pipeline `runner.test.ts`
 * already covers end to end. Its fake GitHub is duplicated in miniature here rather than
 * imported, because `runner.test.ts` does not export its test-only helpers - see that
 * file for the richer original this one's `fakeGitHub` is modelled on.
 *
 * Written under the same workflow note as `pauseGate.test.ts` and
 * `split.resume.test.ts`: not run as part of this task, only written.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeGhAccountLease } from "../ghcli/testLease.js";
import { BackupRunner } from "./runner.js";
import type { BackupEvent } from "./runner.js";
import { readPauseState } from "./pauseState.js";
import { backupWorkspace } from "./workspace.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-backup-pause-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

async function makeWorld(name = "overworld"): Promise<string> {
    const root = join(workDir, "saves", name);
    await mkdir(join(root, "region"), { recursive: true });
    await writeFile(join(root, "level.dat"), "level-dat");
    // Several files, so packing has more than one file boundary to actually pause at.
    for (let i = 0; i < 6; i++) {
        await writeFile(join(root, "region", `r.${String(i)}.0.mca`), Buffer.alloc(2000, i + 1));
    }
    return root;
}

interface FakeAsset {
    id: number;
    name: string;
    size: number;
    bytes: Buffer;
}

/** A minimal fake GitHub: one repository, releases created on demand, assets kept. */
function fakeGitHub() {
    const releases = new Map<string, { id: number; tag: string; assets: FakeAsset[] }>();
    let nextId = 100;

    const impl = async (url: string, init?: RequestInit): Promise<Response> => {
        const method = init?.method ?? "GET";
        const answer = (status: number, body: unknown): Response =>
            ({
                ok: status >= 200 && status < 300,
                status,
                json: () => Promise.resolve(body),
            }) as unknown as Response;

        if (url.endsWith("/repos/o/r")) {
            // `name` and `owner.login` are not decoration: readRepositoryRecord refuses a
            // payload without them, and refuses it with "not a repository this build
            // understands" rather than naming the missing field. A fake that omits them
            // fails the very first call of the backup, so the run never reaches packing and
            // every pause assertion below times out waiting for a phase that was never
            // entered - which reads exactly like a broken pause and is nothing of the kind.
            return answer(200, {
                full_name: "o/r",
                name: "r",
                owner: { login: "o" },
                // Private, deliberately. A public repository makes the runner refuse with
                // public-not-acknowledged unless the request opts in, and this file is about
                // pausing rather than about the publish-consent gate - which has its own
                // tests. Left public, every assertion here fails on a refusal that fired
                // correctly, two guards before pausing was ever reached.
                private: true,
                permissions: { push: true },
                html_url: "https://github.test/o/r",
            });
        }
        if (method === "GET" && url.includes("/releases/tags/")) {
            const tag = decodeURIComponent(url.split("/releases/tags/")[1] as string);
            const release = releases.get(tag);
            return release === undefined
                ? answer(404, { message: "not found" })
                : answer(200, { id: release.id, tag_name: release.tag, html_url: `https://github.test/o/r/releases/${String(release.id)}`, assets: release.assets.map((a) => ({ name: a.name, size: a.size })) });
        }
        if (method === "POST" && url.endsWith("/repos/o/r/releases")) {
            const body: { tag_name: string } = init?.body === undefined ? { tag_name: "" } : (JSON.parse(String(init.body)) as { tag_name: string });
            const id = nextId++;
            releases.set(body.tag_name, { id, tag: body.tag_name, assets: [] });
            return answer(201, { id, tag_name: body.tag_name, html_url: `https://github.test/o/r/releases/${String(id)}`, assets: [] });
        }
        if (method === "POST" && url.includes("/assets?name=")) {
            const releaseId = Number(url.split("/releases/")[1]?.split("/")[0]);
            const name = decodeURIComponent(url.split("name=")[1] as string);
            const release = [...releases.values()].find((r) => r.id === releaseId);
            const bytes = init?.body instanceof ReadableStream
                ? Buffer.concat(await streamToChunks(init.body))
                : Buffer.alloc(0);
            release?.assets.push({ id: nextId++, name, size: bytes.length, bytes });
            return answer(201, { id: nextId, name, size: bytes.length });
        }
        return answer(404, { message: `unhandled: ${method} ${url}` });
    };

    return { fetch: impl as (url: string, init?: RequestInit) => Promise<Response>, releases };
}

async function streamToChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value !== undefined) chunks.push(value);
    }
    return chunks;
}

function makeRunner(github: ReturnType<typeof fakeGitHub>, events: BackupEvent[] = []): BackupRunner {
    return new BackupRunner({
        storageDir: () => join(workDir, "storage"),
        account: async (accountId) =>
            fakeGhAccountLease({
                accountId: accountId ?? "github.com:test",
                api: github.fetch,
                uploadReleaseAsset: async (_owner, _repo, tag, assetName, filePath, options) => {
                    const release = github.releases.get(tag);
                    if (release === undefined) return { started: true, code: 1, stdout: "", stderr: "release missing" };
                    const bytes = await readFile(filePath);
                    const body = new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(bytes);
                            controller.close();
                        },
                    });
                    const response = await github.fetch(
                        `https://uploads.test/repos/o/r/releases/${String(release.id)}/assets?name=${encodeURIComponent(assetName)}`,
                        { method: "POST", body: body as unknown as NonNullable<RequestInit["body"]>, ...(options?.signal === undefined ? {} : { signal: options.signal }) },
                    );
                    return { started: true, code: response.ok ? 0 : 1, stdout: "", stderr: response.ok ? "" : "upload failed" };
                },
            }),
        onEvent: (event) => events.push(event),
    });
}

/**
 * Polls until the condition holds, or gives up.
 *
 * The ceiling is 30s rather than 5s because this is a poll, not a hang detector: it returns
 * the instant the predicate is true, so a larger budget costs exactly nothing on a healthy
 * run and only stops a false failure on a loaded one. These cases drive a real BackupRunner
 * over real temporary files, and the full suite runs them beside thirty other workers - at
 * 5s the upload-phase case failed at 5066ms in company and passed alone, which is a
 * statement about the machine and not about pausing.
 */
async function waitUntil(predicate: () => boolean, limitMs = 30000): Promise<void> {
    const deadline = Date.now() + limitMs;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error("waited too long for a condition to hold");
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

async function waitFor<T>(events: readonly BackupEvent[], read: (event: BackupEvent) => T | null): Promise<T> {
    let found: T | null = null;
    await waitUntil(() => {
        for (const event of events) {
            const value = read(event);
            if (value !== null) {
                found = value;
                return true;
            }
        }
        return false;
    });
    return found as T;
}

describe("BackupRunner pause/resume", () => {
    it("pause requested mid-pack reaches a clean boundary, and only then reports paused", async () => {
        const github = fakeGitHub();
        const events: BackupEvent[] = [];
        const runner = makeRunner(github, events);
        const folder = await makeWorld();

        const running = runner.backup({ kind: "world", folder, owner: "o", repo: "r", partSize: 2048 });
        const backupId = await waitFor(events, (e) => (e.type === "started" ? e.backupId : null));

        // Requested the instant packing starts - the runner must not report "paused"
        // until packFolder's own onFileBoundary hook has actually fired between two
        // files, never immediately on request.
        await waitFor(events, (e) => (e.type === "phase" && e.phase === "packing" ? true : null));
        expect(runner.pause(backupId)).toBe(true);
        expect(events.some((e) => e.type === "paused")).toBe(false);

        await waitFor(events, (e) => (e.type === "paused" ? true : null));
        expect(runner.pauseGateState(backupId)).toBe("paused");

        // Live-resumed with nothing lost - the process never unwound.
        expect(runner.resume(backupId)).toBe(true);
        const result = await running;
        expect(result.ok).toBe(true);
    });

    it("paused state is durable: a fresh reader (simulating an app restart) can see it on disk", async () => {
        const github = fakeGitHub();
        const events: BackupEvent[] = [];
        const runner = makeRunner(github, events);
        const folder = await makeWorld();

        const running = runner.backup({ kind: "world", folder, owner: "o", repo: "r", partSize: 2048 });
        const backupId = await waitFor(events, (e) => (e.type === "started" ? e.backupId : null));
        runner.pause(backupId);
        await waitFor(events, (e) => (e.type === "paused" ? true : null));

        // Read the durable record the way a *different* `BackupRunner` (one built after
        // the app restarted, with an empty `#pauseGates` map) would have to - straight
        // off disk, not through this runner's in-memory state.
        const workspace = backupWorkspace(join(workDir, "storage"), backupId);
        const record = await readPauseState(workspace);
        expect(record).not.toBeNull();
        expect(record?.pausedAt).not.toBeNull();
        expect(record?.tag).not.toBe("");

        runner.resume(backupId);
        await running;

        // And cleared the instant it resumed - a durable record surviving a live resume
        // would tell a later restart there was still a pause to report on a backup that
        // has since finished.
        expect(await readPauseState(workspace)).toBeNull();
    });

    it("Stop still works while paused", async () => {
        const github = fakeGitHub();
        const events: BackupEvent[] = [];
        const runner = makeRunner(github, events);
        const folder = await makeWorld();

        const running = runner.backup({ kind: "world", folder, owner: "o", repo: "r", partSize: 2048 });
        const backupId = await waitFor(events, (e) => (e.type === "started" ? e.backupId : null));
        runner.pause(backupId);
        await waitFor(events, (e) => (e.type === "paused" ? true : null));

        expect(runner.cancel(backupId)).toBe(true);
        const result = await running;
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("cancelled");
        expect(events.some((e) => e.type === "cancelled")).toBe(true);
    });

    it("resuming after a pause during the upload phase skips assets already uploaded", async () => {
        const github = fakeGitHub();
        const events: BackupEvent[] = [];
        const runner = makeRunner(github, events);
        const folder = await makeWorld();

        const running = runner.backup({ kind: "world", folder, owner: "o", repo: "r", partSize: 2048 });
        const backupId = await waitFor(events, (e) => (e.type === "started" ? e.backupId : null));
        await waitFor(events, (e) => (e.type === "phase" && e.phase === "uploading" ? true : null));
        runner.pause(backupId);
        await waitFor(events, (e) => (e.type === "paused" && e.phase === "uploading" ? true : null));

        const uploadedBefore = [...github.releases.values()][0]?.assets.length ?? 0;
        expect(uploadedBefore).toBeGreaterThan(0);

        runner.resume(backupId);
        const result = await running;
        expect(result.ok).toBe(true);

        // Nothing already on the release was sent twice: an asset list with duplicate
        // names would mean the resume re-uploaded rather than skipped.
        const names = [...github.releases.values()][0]?.assets.map((a) => a.name) ?? [];
        expect(new Set(names).size).toBe(names.length);
    });
});
