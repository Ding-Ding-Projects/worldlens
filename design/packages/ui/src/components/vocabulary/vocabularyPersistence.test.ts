// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
});
afterEach(() => {
    vi.restoreAllMocks();
    delete window.worldlens;
});
const payload = JSON.stringify({ schemaVersion: 1, entries: { Open: "Launch" } });

describe("vocabulary persistence acknowledgement", () => {
    it("keeps the previous wording when browser storage refuses the write", async () => {
        const store = await import("./vocabularyStore.js");
        await store.loadVocabularyFile(payload);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota");
        });
        expect(
            await store.loadVocabularyFile(JSON.stringify({ schemaVersion: 1, entries: {} })),
        ).toEqual({ ok: false, reason: "write-failed" });
        expect(store.vocabularyStore.entries).toEqual({ Open: "Launch" });
    });
    it("rejects the whole invalid file and preserves restart persistence", async () => {
        const store = await import("./vocabularyStore.js");
        expect(await store.loadVocabularyFile(payload)).toEqual({ ok: true });
        expect(
            (await store.loadVocabularyFile('{"schemaVersion":1,"entries":{"Open":7}}')).ok,
        ).toBe(false);
        store.reloadVocabularyStore();
        expect(store.vocabularyStore.entries).toEqual({ Open: "Launch" });
        store.clearVocabulary();
        store.reloadVocabularyStore();
        expect(store.vocabularyStore.status).toBe("no-file");
    });
    it("waits for desktop persistence and never publishes a failed candidate", async () => {
        let finish!: (value: unknown) => void;
        const load = vi.fn(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        Object.defineProperty(window, "worldlens", {
            configurable: true,
            value: {
                vocabulary: {
                    read: async () => ({ status: "no-file", entries: {} }),
                    load,
                },
            },
        });
        const store = await import("./vocabularyStore.js");
        const result = store.loadVocabularyFile(payload);
        await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
        expect(store.vocabularyStore.status).toBe("no-file");
        finish({ ok: false, status: "no-file", entries: {}, reason: "write-failed" });
        expect(await result).toEqual({ ok: false, reason: "write-failed" });
        expect(store.vocabularyStore.entries).toEqual({});
    });
});
