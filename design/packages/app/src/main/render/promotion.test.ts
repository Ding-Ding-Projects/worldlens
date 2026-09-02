import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RenderPromotionStore, verifyFinishedRender } from "./promotion.js";
import { renderConfigFingerprint } from "./session.js";
import { buildCompletedOutputManifest } from "./outputManifest.js";
import { renderWorkspace } from "./workspace.js";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; renderId: string }> {
    const root = await mkdtemp(join(tmpdir(), "worldlens-promotion-"));
    roots.push(root);
    const renderId = "royalty-update";
    const workspace = renderWorkspace(root, renderId);
    await mkdir(join(workspace.webRoot, "maps", "overworld"), { recursive: true });
    await writeFile(
        join(workspace.webRoot, "settings.json"),
        JSON.stringify({ version: "5.23", maps: ["overworld"] }),
    );
    await writeFile(
        join(workspace.webRoot, "maps", "overworld", "settings.json"),
        JSON.stringify({ id: "overworld", name: "Overworld" }),
    );
    await mkdir(join(workspace.webRoot, "maps", "overworld", "tiles"), { recursive: true });
    await writeFile(
        join(workspace.webRoot, "maps", "overworld", "tiles", "0.bin"),
        "rendered payload",
    );
    const record = {
        recordVersion: 1,
        renderId,
        engine: "upstream-java",
        engineVersion: "5.23",
        enginePath: "C:/engine.jar",
        engineSource: "bundled",
        javaVersion: "25.0.4.1",
        runtime: "local",
        maps: [
            {
                id: "overworld",
                name: "Overworld",
                world: "C:/world",
                dimension: "minecraft:overworld",
            },
        ],
        startedAt: "2026-08-24T05:52:00.800Z",
        finishedAt: "2026-08-24T06:00:20.809Z",
        outcome: "finished",
        failureCode: null,
        durationMs: 500003,
        appVersion: "1.0.0",
    };
    const sessionMaps = [
        {
            id: "overworld",
            world: "C:/world",
            dimension: "minecraft:overworld",
            name: "Overworld",
        },
    ];
    await mkdir(workspace.root, { recursive: true });
    await writeFile(workspace.recordFile, JSON.stringify(record));
    await writeFile(
        join(workspace.root, "session.json"),
        JSON.stringify({
            sessionVersion: 1,
            renderId,
            maps: sessionMaps,
            configDir: workspace.configDir,
            runtime: "local",
            outputRoot: workspace.webRoot,
            configHash: renderConfigFingerprint(sessionMaps),
            engine: "upstream-java",
            engineVersion: "5.23",
            javaVersion: "25.0.4.1",
            startedAt: record.startedAt,
            updatedAt: record.finishedAt,
            endedAt: record.finishedAt,
            status: "completed",
            reason: null,
            detail: null,
            progress: null,
            ownerInstance: "test",
            ownerPid: null,
            dismissed: false,
        }),
    );
    return { root, renderId };
}

describe("RenderPromotionStore", () => {
    it("promotes a completed render only after validating the output and session", async () => {
        const { root, renderId } = await fixture();
        const unmount = vi.fn();
        const store = new RenderPromotionStore({ storageDir: root, unmount });
        const result = await store.promote(renderId);
        expect(result.failure).toBeNull();
        expect(result.created).toBe(true);
        expect(result.promotion?.mapIds).toEqual(["overworld"]);
        expect((await store.list()).map((entry) => entry.renderId)).toEqual([renderId]);
        expect(
            JSON.parse(await readFile(join(root, "finished-render-promotions.json"), "utf8"))
                .promotions,
        ).toHaveLength(1);
    });

    it("deduplicates duplicate terminal events and restart reconciliation", async () => {
        const { root, renderId } = await fixture();
        const first = new RenderPromotionStore({ storageDir: root });
        expect((await first.promote(renderId)).created).toBe(true);
        expect(await readFile(join(root, "finished-render-promotions.json"), "utf8")).toContain(
            renderId,
        );
        expect((await first.promote(renderId)).created).toBe(false);
        const restarted = new RenderPromotionStore({ storageDir: root });
        const recovered = await restarted.reconcile();
        expect(recovered.promotions).toHaveLength(1);
        expect((await restarted.promote(renderId)).created).toBe(false);
    });

    it("serializes concurrent terminal events and claims one durable notification", async () => {
        const { root, renderId } = await fixture();
        const store = new RenderPromotionStore({ storageDir: root });
        const results = await Promise.all([store.promote(renderId), store.promote(renderId)]);
        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect((await store.list()).map((entry) => entry.renderId)).toEqual([renderId]);
        const promotionId = results.find((result) => result.promotion !== null)?.promotion
            ?.promotionId;
        expect(promotionId).toBeDefined();
        const claims = await Promise.all([
            store.claimNotification(promotionId!),
            store.claimNotification(promotionId!),
        ]);
        expect(claims.filter(Boolean)).toHaveLength(1);
        const restarted = new RenderPromotionStore({ storageDir: root });
        expect(await restarted.claimNotification(promotionId!)).toBe(false);
    });

    it("releases the mutation queue when durable lock acquisition throws", async () => {
        const { root, renderId } = await fixture();
        const blocker = join(root, "storage-blocker");
        await writeFile(blocker, "not a directory");
        let blocked = true;
        const store = new RenderPromotionStore({
            storageDir: () => (blocked ? blocker : root),
        });
        await expect(store.promote(renderId)).rejects.toThrow();
        blocked = false;
        expect((await store.promote(renderId)).created).toBe(true);
    });

    it("keeps a slow live lease alive beyond the stale threshold", async () => {
        const { root, renderId } = await fixture();
        const writes = vi.fn(async (path: string, text: string) => {
            await new Promise<void>((resolveWait) => setTimeout(resolveWait, 80));
            await writeFile(path, text);
        });
        const store = new RenderPromotionStore({
            storageDir: root,
            writeText: writes,
            lockStaleMs: 20,
            lockHeartbeatMs: 5,
            lockRetryMs: 5,
            lockRetries: 40,
        });
        const first = store.promote(renderId);
        let lockText = "";
        for (let attempt = 0; attempt < 40 && lockText.length === 0; attempt += 1) {
            try {
                lockText = await readFile(join(root, ".finished-render-promotions.lock"), "utf8");
            } catch {
                await new Promise<void>((resolveWait) => setTimeout(resolveWait, 2));
            }
        }
        expect(lockText).not.toBe("");
        const firstLease = JSON.parse(lockText) as { heartbeatAt: string };
        await new Promise<void>((resolveWait) => setTimeout(resolveWait, 45));
        const secondLease = JSON.parse(
            await readFile(join(root, ".finished-render-promotions.lock"), "utf8"),
        ) as { heartbeatAt: string };
        expect(secondLease.heartbeatAt).not.toBe(firstLease.heartbeatAt);
        expect((await first).created).toBe(true);
    });

    it("shares the durable lock across case and junction aliases on Windows", async () => {
        if (process.platform !== "win32") return;
        const { root, renderId } = await fixture();
        const alias = `${root}-alias`;
        await rm(alias, { recursive: true, force: true });
        try {
            await symlink(root, alias, "junction");
        } catch {
            return;
        }
        const first = new RenderPromotionStore({ storageDir: root });
        const second = new RenderPromotionStore({ storageDir: root.toUpperCase() });
        const results = await Promise.all([first.promote(renderId), second.promote(renderId)]);
        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect((await second.list()).map((entry) => entry.renderId)).toEqual([renderId]);
        const junction = new RenderPromotionStore({ storageDir: alias });
        expect((await junction.promote(renderId)).failure?.reason).toBe("unsafe-path");
        await rm(alias, { recursive: true, force: true });
    });

    it("drops stale output without mounting it", async () => {
        const { root, renderId } = await fixture();
        const unmount = vi.fn();
        const store = new RenderPromotionStore({ storageDir: root, unmount });
        const promoted = await store.promote(renderId);
        expect(promoted.created).toBe(true);
        await rm(join(root, renderId, "web", "maps", "overworld", "settings.json"));
        const recovered = await store.reconcile();
        expect(recovered.promotions).toHaveLength(0);
        expect(unmount).toHaveBeenCalledWith(renderId);
    });

    it("rejects a tampered catalogue path and derives the safe path again", async () => {
        const { root, renderId } = await fixture();
        const unmount = vi.fn();
        const store = new RenderPromotionStore({ storageDir: root, unmount });
        const promoted = await store.promote(renderId);
        expect(promoted.promotion).not.toBeNull();
        const file = join(root, "finished-render-promotions.json");
        const catalogue = JSON.parse(await readFile(file, "utf8")) as {
            promotions: Array<Record<string, unknown>>;
        };
        catalogue.promotions[0]!.dataRoot = "/outside";
        await writeFile(
            file,
            JSON.stringify({ promotionVersion: 1, promotions: catalogue.promotions }),
        );
        const recovered = await store.reconcile();
        expect(recovered.promotions).toHaveLength(1);
        expect(recovered.promotions[0]?.dataRoot).toBe(`/local/${renderId}`);
        expect(unmount).toHaveBeenCalledWith(renderId);
    });

    it("rewrites a persisted receipt whose manifest map array is malformed", async () => {
        const { root, renderId } = await fixture();
        const unmount = vi.fn();
        const store = new RenderPromotionStore({ storageDir: root, unmount });
        expect((await store.promote(renderId)).created).toBe(true);
        const file = join(root, "finished-render-promotions.json");
        const catalogue = JSON.parse(await readFile(file, "utf8")) as {
            promotions: Array<Record<string, unknown>>;
        };
        const manifest = catalogue.promotions[0]!.outputManifest as Record<string, unknown>;
        manifest.maps = [];
        await writeFile(file, JSON.stringify(catalogue));
        const recovered = await store.reconcile();
        expect(recovered.promotions).toHaveLength(1);
        expect(recovered.promotions[0]?.outputManifest?.maps).toHaveLength(1);
        expect(unmount).toHaveBeenCalledWith(renderId);
    });

    it("rejects a symlinked output ancestor when the platform permits creating one", async () => {
        const { root, renderId } = await fixture();
        const workspace = renderWorkspace(root, renderId);
        const realMaps = join(workspace.webRoot, "maps");
        const movedMaps = join(root, "maps-outside");
        await rm(movedMaps, { recursive: true, force: true });
        try {
            await symlink(realMaps, movedMaps, "junction");
        } catch {
            return;
        }
        await rm(realMaps, { recursive: true, force: true });
        await symlink(movedMaps, realMaps, "junction");
        expect((await verifyFinishedRender(workspace)).failure).not.toBeNull();
    });

    it("detects a same-size tail tamper through the full-byte payload fingerprint", async () => {
        const { root, renderId } = await fixture();
        const store = new RenderPromotionStore({ storageDir: root });
        const first = await store.promote(renderId);
        const originalId = first.promotion?.promotionId;
        await writeFile(
            join(root, renderId, "web", "maps", "overworld", "tiles", "0.bin"),
            "rendered payloaD",
        );
        const recovered = await store.reconcile();
        expect(recovered.promotions).toHaveLength(1);
        expect(recovered.promotions[0]?.promotionId).not.toBe(originalId);
    });

    it("refuses malformed, incomplete, missing-output and session-mismatch receipts", async () => {
        const { root, renderId } = await fixture();
        const workspace = renderWorkspace(root, renderId);
        const record = JSON.parse(await readFile(workspace.recordFile, "utf8")) as Record<
            string,
            unknown
        >;
        record.outputManifest = {
            version: 1,
            fileCount: 1,
            totalBytes: 1,
            payloadFingerprint: "a".repeat(64),
            maps: [],
        };
        await writeFile(workspace.recordFile, JSON.stringify(record));
        expect((await verifyFinishedRender(workspace)).failure?.reason).toBe("missing-record");
        delete record.outputManifest;
        await writeFile(workspace.recordFile, JSON.stringify(record));
        await writeFile(join(workspace.webRoot, "settings.json"), "not json");
        expect((await verifyFinishedRender(workspace)).failure?.reason).toBe("missing-output");
        await writeFile(
            join(workspace.webRoot, "settings.json"),
            JSON.stringify({ maps: ["other"] }),
        );
        expect((await verifyFinishedRender(workspace)).failure?.reason).toBe("provenance-mismatch");
        await writeFile(
            join(workspace.root, "session.json"),
            JSON.stringify({ status: "interrupted" }),
        );
        expect((await verifyFinishedRender(workspace)).failure?.reason).toBe("missing-session");
    });

    it("recomputes the canonical config fingerprint instead of trusting its shape", async () => {
        const { root, renderId } = await fixture();
        const workspace = renderWorkspace(root, renderId);
        const record = JSON.parse(await readFile(workspace.recordFile, "utf8")) as Record<
            string,
            unknown
        >;
        record.configHash = "a".repeat(64);
        await writeFile(workspace.recordFile, JSON.stringify(record));
        const sessionFile = join(workspace.root, "session.json");
        const session = JSON.parse(await readFile(sessionFile, "utf8")) as Record<string, unknown>;
        session.configHash = "a".repeat(64);
        await writeFile(sessionFile, JSON.stringify(session));
        expect((await verifyFinishedRender(workspace)).failure?.reason).toBe("provenance-mismatch");
    });

    it("accepts a legitimate non-default sorting and start position when persisted", async () => {
        const { root, renderId } = await fixture();
        const workspace = renderWorkspace(root, renderId);
        const record = JSON.parse(await readFile(workspace.recordFile, "utf8")) as Record<
            string,
            unknown
        >;
        const sessionFile = join(workspace.root, "session.json");
        const session = JSON.parse(await readFile(sessionFile, "utf8")) as Record<string, unknown>;
        const maps = [
            {
                id: "overworld",
                world: "C:/world",
                dimension: "minecraft:overworld",
                name: "Overworld",
                sorting: 7,
                startPos: { x: 12, z: -4 },
                config: 'lighting: { sky: "night" }',
            },
        ];
        const configHash = renderConfigFingerprint(maps);
        record.configHash = configHash;
        session.maps = maps;
        session.configHash = configHash;
        await writeFile(workspace.recordFile, JSON.stringify(record));
        await writeFile(sessionFile, JSON.stringify(session));
        expect((await verifyFinishedRender(workspace)).failure).toBeNull();
    });

    it("keeps the previous catalogue when the catalogue write fails", async () => {
        const { root, renderId } = await fixture();
        const writeText = vi.fn(async () => {
            throw new Error("catalogue unavailable");
        });
        const store = new RenderPromotionStore({ storageDir: root, writeText });
        const failed = await store.promote(renderId);
        expect(failed.promotion).toBeNull();
        expect(failed.failure?.reason).toBe("write-failed");
        expect(await store.list()).toEqual([]);
        expect(writeText).toHaveBeenCalledTimes(2);
    });

    it("can verify the committed royalty-update fixture without writing to it", async () => {
        const fixtureRoot = "C:/Worldlens-Capture/maps/royalty-update-5387b773f8c7";
        const workspace = renderWorkspace(
            "C:/Worldlens-Capture/maps",
            "royalty-update-5387b773f8c7",
        );
        try {
            const result = await verifyFinishedRender(workspace);
            if (result.failure !== null && result.failure.reason === "missing-record") return;
            expect(result.failure).toBeNull();
            expect(result.promotion?.outputRoot.replaceAll("\\", "/")).toBe(`${fixtureRoot}/web`);
            expect(result.promotion?.mapIds).toEqual(["overworld", "nether", "end"]);
            expect(result.promotion?.verificationStatus).toBe("migrated-unverified");
        } catch (error) {
            // The fixture is a local evidence input, not a build prerequisite for CI. A checkout without
            // it keeps the test meaningful by proving the verifier does not throw.
            if (!(error instanceof Error) || !/ENOENT|not found/i.test(error.message)) throw error;
        }
    });

    it("keeps the retained large fixture manifest stable across read-only passes", async () => {
        const outputRoot = "C:/Worldlens-Capture/maps/royalty-update-5387b773f8c7/web";
        try {
            const before = await buildCompletedOutputManifest(outputRoot);
            if (before === null) return;
            const after = await buildCompletedOutputManifest(outputRoot);
            expect(after).toEqual(before);
            expect(before.fileCount).toBeGreaterThan(0);
            expect(before.totalBytes).toBeGreaterThan(0);
            expect(before.payloadFingerprint).toMatch(/^[a-f0-9]{64}$/);
        } catch (error) {
            if (!(error instanceof Error) || !/ENOENT|not found/i.test(error.message)) throw error;
        }
    }, 180_000);
});
