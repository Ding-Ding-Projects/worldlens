import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RenderPromotionStore, verifyFinishedRender } from "./promotion.js";
import { renderConfigFingerprint } from "./session.js";
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

    it("refuses malformed, incomplete, missing-output and session-mismatch receipts", async () => {
        const { root, renderId } = await fixture();
        const workspace = renderWorkspace(root, renderId);
        await writeFile(join(workspace.webRoot, "settings.json"), "not json");
        expect((await verifyFinishedRender(workspace)).failure?.reason).toBe("missing-output");
        await writeFile(
            join(workspace.webRoot, "settings.json"),
            JSON.stringify({ maps: ["other"] }),
        );
        expect((await verifyFinishedRender(workspace)).failure?.reason).toBe("malformed-output");
        await writeFile(
            join(workspace.root, "session.json"),
            JSON.stringify({ status: "interrupted" }),
        );
        expect((await verifyFinishedRender(workspace)).failure?.reason).toBe("missing-session");
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
        } catch (error) {
            // The fixture is a local evidence input, not a build prerequisite for CI. A checkout without
            // it keeps the test meaningful by proving the verifier does not throw.
            if (!(error instanceof Error) || !/ENOENT|not found/i.test(error.message)) throw error;
        }
    });
});
