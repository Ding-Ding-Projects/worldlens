import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireRenderWorkspaceLease, inspectRenderWorkspaceLease, reclaimRenderWorkspaceLease } from "./workspaceLease.js";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function crashedLease() {
    const root = await mkdtemp(join(tmpdir(), "workspace-lease-")); roots.push(root);
    const path = join(root, ".render-workspace-test.lock");
    const child = spawnSync(process.execPath, ["-e", `require('node:fs').writeFileSync(process.argv[1], JSON.stringify({version:1, leaseId:require('node:crypto').randomUUID(),ownerPid:process.pid,renderId:'test'})); process.exit(2)`, path]);
    expect(child.status).toBe(2);
    return { root, path, lease: await inspectRenderWorkspaceLease(root, "test") };
}
describe("explicit crashed workspace owner recovery", () => {
    it("reclaims only the inspected exited owner after engine inactivity proof and retains its lease", async () => {
        const { root, path, lease } = await crashedLease();
        const original = await readFile(path, "utf8");
        const result = await reclaimRenderWorkspaceLease(root, "test", { expectedLeaseId: lease.leaseId,
            probeEngine: async () => ({ state: "inactive", evidence: "Synthetic child exited; fixture created no engine or container." }) });
        expect(await readFile(result.archivedLease, "utf8")).toBe(original);
        const release = await acquireRenderWorkspaceLease(root, "test"); await release();
    });
    it("refuses a surviving engine and unavailable engine proof", async () => {
        const { root, lease } = await crashedLease();
        for (const state of ["active", "unavailable"] as const) {
            await expect(reclaimRenderWorkspaceLease(root, "test", { expectedLeaseId: lease.leaseId,
                probeEngine: async () => ({ state, evidence: "Synthetic engine status." }) })).rejects.toThrow(`engine state ${state}`);
        }
        expect((await inspectRenderWorkspaceLease(root, "test")).leaseId).toBe(lease.leaseId);
    });
    it("refuses a different lease identity and a live owner without probing engines", async () => {
        const { root, lease } = await crashedLease();
        const probeEngine = vi.fn(async () => ({ state: "inactive" as const, evidence: "No engine." }));
        await expect(reclaimRenderWorkspaceLease(root, "test", { expectedLeaseId: "wrong", probeEngine })).rejects.toThrow("changed since inspection");
        const recovered = await reclaimRenderWorkspaceLease(root, "test", { expectedLeaseId: lease.leaseId, probeEngine });
        expect(recovered.archivedLease).toContain(lease.leaseId);
        const release = await acquireRenderWorkspaceLease(root, "test");
        const current = await inspectRenderWorkspaceLease(root, "test");
        probeEngine.mockClear();
        await expect(reclaimRenderWorkspaceLease(root, "test", { expectedLeaseId: current.leaseId, probeEngine })).rejects.toThrow("still alive");
        expect(probeEngine).not.toHaveBeenCalled(); await release();
    });
});
