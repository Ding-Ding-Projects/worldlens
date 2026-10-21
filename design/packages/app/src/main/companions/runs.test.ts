import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CompanionBuildHost } from "./runs.js";
import type { BuildEvent, BuildRecord } from "./runs.js";
import { FileBuildJournal } from "./journal.js";
import type { BuildPlan } from "./source.js";
import type { ProcessExit } from "./process.js";

const plan: BuildPlan = {
    action: "build", script: "build.bat", args: ["/s"],
    source: { checkout: "C:\\source", checkoutId: "checkout-1", repositoryId: "repo-1", commit: "a".repeat(40), indexTree: "b".repeat(40), inputsDigest: "c".repeat(64) },
};
const request = { checkout: "C:\\source", action: "build" as const };
function setup(cancelOutcome: "requested" | "unavailable" = "requested") {
    let finish!: (exit: ProcessExit) => void;
    const completion = new Promise<ProcessExit>((resolve) => { finish = resolve; });
    const records: BuildRecord[] = [];
    const events: BuildEvent[] = [];
    const cancel = vi.fn(async () => cancelOutcome);
    const start = vi.fn((_plan, output) => { output("stderr", "observed diagnostics"); return { completion, cancel }; });
    const revalidate = vi.fn(async () => {});
    const host = new CompanionBuildHost({ journal: { save: async (record) => { records.push(record); } }, prepare: async () => plan, revalidate, start, onEvent: (event) => { events.push(event); } });
    return { host, records, events, finish, cancel, start, revalidate };
}
describe("companion run ownership", () => {
    it("never persists arbitrary phase labels even when supplied directly to the journal", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "companion-phase-journal-"));
        try {
            const journal = new FileBuildJournal(directory);
            const record: BuildRecord = { id: "00000000-0000-4000-8000-000000000000", startedAt: new Date().toISOString(), state: "running", plan,
                lastPhase: { stage: 1, stages: 4, label: "SYNTHETIC_PRIVATE_MARKER" } };
            await journal.save(record);
            expect(await readFile(path.join(directory, `${record.id}.json`), "utf8")).not.toContain("SYNTHETIC_PRIVATE_MARKER");
            expect((await journal.read(record.id)).lastPhase).toBeUndefined();
            await journal.save({ ...record, lastPhase: { stage: 1, stages: 4, label: "Install and verify all build dependencies" } });
            expect((await journal.read(record.id)).lastPhase?.label).toBe("Install and verify all build dependencies");
        } finally { await rm(directory, { recursive: true, force: true }); }
    });
    it("holds one checkout and never upgrades exit zero to verified delivery", async () => {
        const test = setup();
        const handle = await test.host.start(request);
        await expect(test.host.start(request)).rejects.toThrow("already owns");
        expect(test.events.some((event) => event.kind === "output" && event.stream === "stderr")).toBe(true);
        expect(Object.isFrozen(handle.snapshot().plan.source)).toBe(true);
        test.finish({ code: 0, signal: null });
        expect((await handle.completion).state).toBe("completed-unverified");
        expect(test.revalidate).toHaveBeenCalledTimes(2);
        expect(await handle.cancel()).toBe("finished");
        expect(test.cancel).not.toHaveBeenCalled();
    });
    it("does not claim cancellation before observed exit and requests it only once", async () => {
        const test = setup();
        const handle = await test.host.start(request);
        expect(await handle.cancel()).toBe("requested");
        expect(await handle.cancel()).toBe("requested");
        expect(test.cancel).toHaveBeenCalledOnce();
        expect(handle.snapshot().state).toBe("cancelling");
        test.finish({ code: null, signal: "SIGTERM" });
        expect((await handle.completion).state).toBe("cancelled");
    });
    it("retains an active run when safe tree cancellation is unavailable", async () => {
        const test = setup("unavailable");
        const handle = await test.host.start(request);
        expect(await handle.cancel()).toBe("unavailable");
        expect(handle.snapshot().state).toBe("running");
        test.finish({ code: 2, signal: null });
        expect((await handle.completion).state).toBe("failed");
    });
    it("marks changed-source outputs ineligible and isolates throwing observers", async () => {
        const test = setup();
        const handle = await test.host.start(request);
        test.revalidate.mockRejectedValueOnce(new Error("changed"));
        test.finish({ code: 0, signal: null });
        expect((await handle.completion).detail).toContain("Source changed");
        expect(handle.snapshot().state).toBe("failed");
    });
    it("does not spawn when initial history persistence fails", async () => {
        const start = vi.fn();
        const host = new CompanionBuildHost({ journal: { save: async () => { throw new Error("disk"); } }, prepare: async () => plan, start });
        await expect(host.start(request)).rejects.toThrow();
        expect(start).not.toHaveBeenCalled();
    });
    it("records launch errors and releases ownership for a later retry", async () => {
        const start = vi.fn(() => { throw new Error("spawn"); });
        const records: BuildRecord[] = [];
        const host = new CompanionBuildHost({ journal: { save: async (record) => { records.push(record); } }, prepare: async () => plan, revalidate: async () => {}, start });
        await expect(host.start(request)).rejects.toThrow("launch failed");
        await expect(host.start(request)).rejects.toThrow("launch failed");
        expect(start).toHaveBeenCalledTimes(2);
        expect(records.at(-1)?.state).toBe("failed");
    });
    it("retains the actual terminal outcome when final journal persistence fails", async () => {
        const host = new CompanionBuildHost({
            journal: { save: async (record) => { if (record.endedAt) throw new Error("full"); } },
            prepare: async () => plan, revalidate: async () => {},
            start: () => ({ completion: Promise.resolve({ code: 4, signal: null }), cancel: async () => "finished" }),
            onEvent: () => { throw new Error("observer"); },
        });
        const handle = await host.start(request);
        const result = await handle.completion;
        expect(result.exit?.code).toBe(4);
        expect(result.state).toBe("failed");
        expect(result.detail).toContain("persistence failed");
    });
    it("recovers an unfinished journal as interrupted without a process identifier", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "companion-journal-"));
        try {
            const journal = new FileBuildJournal(directory);
            const record: BuildRecord = { id: "00000000-0000-4000-8000-000000000000", startedAt: new Date().toISOString(), state: "running", plan };
            await journal.save(record);
            expect((await journal.read(record.id)).state).toBe("interrupted");
            await expect(journal.read("../outside")).rejects.toThrow();
        } finally { await rm(directory, { recursive: true, force: true }); }
    });
});
