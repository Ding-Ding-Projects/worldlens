import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    CI_SYNC_STATE_VERSION,
    newCiSyncState,
    readCiSyncState,
    writeCiSyncState,
} from "./state.js";

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "worldlens-ci-state-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("CI sync state migration", () => {
    it("reads a version-1 record as version 2 without inventing a recovery", async () => {
        const path = join(root, "sync.json");
        await writeFile(
            path,
            JSON.stringify({
                version: 1,
                syncId: "bayville-1",
                owner: "Ding-Ding-Projects",
                repo: "Bayville-World-v10.1",
                worldFolder: "C:/worlds/Bayville",
                mapId: "bayville-world-v10-1",
                mapName: "Bayville World v10.1",
                dimension: "minecraft:overworld",
                fingerprint: "fingerprint",
                releaseTag: "world-v1",
                assetName: "world.zip",
                archiveBytes: 42,
                archiveSha256: "a".repeat(64),
                runId: 32204720034,
                runNumber: 1,
                runUrl: "https://github.example/run/32204720034",
                dispatchedAt: "2026-08-19T01:00:00Z",
                stage: "dispatched",
                renderId: null,
                artifactSha256: null,
                failureCode: null,
                failureMessage: null,
                updatedAt: "2026-08-19T01:35:45Z",
            }),
            "utf8",
        );

        const state = await readCiSyncState(path);

        expect(state?.version).toBe(CI_SYNC_STATE_VERSION);
        expect(state?.runId).toBe(32204720034);
        expect(state?.releaseTag).toBe("world-v1");
        expect(state?.archiveSha256).toBe("a".repeat(64));
        expect(state?.recoveryAttemptedRunId).toBeNull();
        expect(state?.postRenderWarning).toBeNull();
    });

    it("writes the recovery attempt and warning as explicit version-2 fields", async () => {
        const path = join(root, "nested", "sync.json");
        const base = newCiSyncState({
            syncId: "bayville-1",
            owner: "o",
            repo: "r",
            worldFolder: root,
            mapId: "bayville-world-v10-1",
            mapName: "Bayville",
            dimension: "minecraft:overworld",
            at: "2026-08-19T01:00:00Z",
        });
        await writeCiSyncState(path, {
            ...base,
            recoveryAttemptedRunId: 32204720034,
            postRenderWarning: {
                code: "pages-not-published",
                runId: 32204720034,
                failingJob: "Merge group 0",
                failingStep: "Build the documentation site to publish alongside the map",
            },
        });

        const written = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        expect(written["version"]).toBe(2);
        expect(written["recoveryAttemptedRunId"]).toBe(32204720034);
        expect(written["postRenderWarning"]).toEqual({
            code: "pages-not-published",
            runId: 32204720034,
            failingJob: "Merge group 0",
            failingStep: "Build the documentation site to publish alongside the map",
        });
    });
});
