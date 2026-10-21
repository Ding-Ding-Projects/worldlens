import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VocabularyStore } from "./store.js";

const roots: string[] = [];
const payload = (value: string): string => JSON.stringify({ schemaVersion: 1, entries: { Open: value } });
async function createStore(): Promise<VocabularyStore> {
    const root = await fs.mkdtemp(join(tmpdir(), "worldlens-vocabulary-order-"));
    roots.push(root);
    return new VocabularyStore(root);
}
afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
describe("durable vocabulary operation ordering", () => {
    it("does not resurrect an import when Clear arrives during its atomic write", async () => {
        const store = await createStore();
        const rename = fs.rename.bind(fs);
        let finish!: () => void;
        const paused = new Promise<void>((resolve) => { finish = resolve; });
        const spy = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
            await paused;
            await rename(from, to);
        });
        const load = store.load(payload("Launch"));
        await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce());
        let cleared = false;
        const clear = store.clear().then((result) => { cleared = true; return result; });
        await Promise.resolve();
        expect(cleared).toBe(false);
        finish();
        expect((await load).ok).toBe(true);
        expect((await clear).ok).toBe(true);
        expect((await store.read()).status).toBe("no-file");
    });
    it("persists overlapping loads in invocation order with increasing revisions", async () => {
        const store = await createStore();
        const first = store.load(payload("Launch"));
        const second = store.load(payload("Start"));
        expect((await first).metadata?.revision).toBe(1);
        expect((await second).metadata?.revision).toBe(2);
        expect((await store.read()).entries).toEqual({ Open: "Start" });
    });
    it("returns the actual durable snapshot when removal fails after an import", async () => {
        const store = await createStore();
        const remove = fs.rm.bind(fs);
        vi.spyOn(fs, "rm").mockImplementation(async (file, options) => {
            if (String(file).endsWith("personal-vocabulary.json")) throw new Error("removal unavailable");
            await remove(file, options);
        });
        const load = store.load(payload("Launch"));
        const clear = store.clear();
        expect((await load).ok).toBe(true);
        const result = await clear;
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("clear-failed");
        expect(result.status).toBe("loaded");
        expect(result.entries).toEqual({ Open: "Launch" });
        expect((await store.read()).entries).toEqual(result.entries);
    });
});
