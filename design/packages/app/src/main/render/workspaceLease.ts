import { randomUUID } from "node:crypto";
import { mkdir, open, realpath, readFile, rename, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isValidRenderId } from "./workspace.js";

export interface RenderWorkspaceLease {
    readonly version: 1;
    readonly leaseId: string;
    readonly ownerPid: number;
    readonly renderId: string;
}
async function leasePath(storageDir: string, renderId: string): Promise<string> {
    if (!isValidRenderId(renderId)) throw new Error("Invalid workspace lease identity.");
    const root = await realpath(resolve(storageDir));
    return join(root, `.render-workspace-${renderId}.lock`);
}
export async function inspectRenderWorkspaceLease(storageDir: string, renderId: string): Promise<RenderWorkspaceLease> {
    const path = await leasePath(storageDir, renderId);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) throw new Error("Workspace lease identity unavailable: unsafe lease file.");
    const lease = JSON.parse(await readFile(path, "utf8")) as RenderWorkspaceLease;
    if (lease.version !== 1 || typeof lease.leaseId !== "string" || !/^[a-f0-9-]{36}$/.test(lease.leaseId) ||
        !Number.isSafeInteger(lease.ownerPid) || lease.ownerPid <= 0 || lease.renderId !== renderId)
        throw new Error("Workspace lease identity unavailable: malformed or older lease requires manual diagnosis.");
    return lease;
}
async function unlinkOwned(path: string, leaseId: string): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    const text = JSON.parse(await readFile(path, "utf8"));
    if (text.leaseId !== leaseId) throw new Error("Workspace lease identity changed during release.");
    await unlink(path);
}

/** Cross-process exclusion shared by render and metadata recovery. */
export async function acquireRenderWorkspaceLease(storageDir: string, renderId: string): Promise<() => Promise<void>> {
    if (!isValidRenderId(renderId)) throw new Error("Invalid workspace lease identity.");
    await mkdir(resolve(storageDir), { recursive: true });
    const path = await leasePath(storageDir, renderId);
    const handle = await open(path, "wx");
    const lease: RenderWorkspaceLease = { version: 1, leaseId: randomUUID(), ownerPid: process.pid, renderId };
    try { await handle.writeFile(JSON.stringify(lease)); }
    catch (error) { await handle.close(); throw error; }
    let released = false;
    return async () => {
        if (released) return;
        released = true;
        await handle.close();
        await unlinkOwned(path, lease.leaseId);
    };
}

/**
 * Explicit recovery only. The runtime owner must probe native/WSL processes or container
 * identity and provide fresh quiescence evidence, including descendants of a crashed owner.
 * Unavailable process/container proof fails closed. Original lease is retained as evidence.
 */
export async function reclaimRenderWorkspaceLease(storageDir: string, renderId: string, options: {
    readonly expectedLeaseId: string;
    readonly probeEngine: (lease: RenderWorkspaceLease) => Promise<{
        readonly state: "inactive" | "active" | "unavailable";
        readonly evidence: string;
    }>;
}): Promise<{ readonly archivedLease: string; readonly engineEvidence: string }> {
    const path = await leasePath(storageDir, renderId);
    // Serialize reclaimers. Normal acquisition still cannot pass the original lock.
    const reclaim = await open(`${path}.reclaim`, "wx");
    try {
        const lease = await inspectRenderWorkspaceLease(storageDir, renderId);
        if (lease.leaseId !== options.expectedLeaseId) throw new Error("Workspace lease changed since inspection.");
        try { process.kill(lease.ownerPid, 0); throw new Error("Workspace lease owner is still alive."); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
        const engine = await options.probeEngine(lease);
        if (engine.state !== "inactive" || engine.evidence.trim().length === 0)
            throw new Error(`Workspace lease cannot be reclaimed: engine state ${engine.state}; ${engine.evidence || "evidence unavailable"}`);
        const current = await inspectRenderWorkspaceLease(storageDir, renderId);
        if (JSON.stringify(current) !== JSON.stringify(lease)) throw new Error("Workspace lease changed during engine verification.");
        const archivedLease = `${path}.recovered-${lease.leaseId}`;
        await rename(path, archivedLease);
        return { archivedLease, engineEvidence: engine.evidence };
    } finally {
        await reclaim.close();
        const { unlink } = await import("node:fs/promises");
        await unlink(`${path}.reclaim`);
    }
}
