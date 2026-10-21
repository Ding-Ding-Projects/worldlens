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
        await store.clearVocabulary();
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

it("retains previous wording when desktop clear resolves as a refusal", async () => {
    Object.defineProperty(window, "worldlens", {
        configurable: true,
        value: {
            vocabulary: {
                read: async () => ({ status: "loaded", entries: { Open: "Launch" } }),
                clear: async () => ({
                    ok: false,
                    status: "loaded",
                    entries: { Open: "Launch" },
                    reason: "clear-failed",
                }),
            },
        },
    });
    const store = await import("./vocabularyStore.js");
    await vi.waitFor(() => expect(store.vocabularyStore.status).toBe("loaded"));
    expect(await store.clearVocabulary()).toEqual({ ok: false, reason: "clear-failed" });
    expect(store.vocabularyStore.entries).toEqual({ Open: "Launch" });
});

it("does not restore a completed desktop load after Clear", async () => {
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
                clear: async () => ({ ok: true, status: "no-file", entries: {} }),
            },
        },
    });
    const store = await import("./vocabularyStore.js");
    const pending = store.loadVocabularyFile(payload);
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    await store.clearVocabulary();
    finish({ ok: true, status: "loaded", entries: { Open: "Launch" } });
    expect(await pending).toEqual({ ok: false, reason: "superseded" });
    expect(store.vocabularyStore.status).toBe("no-file");
});

it("cancels a claimed file read on Clear or another import", async () => {
    const store = await import("./vocabularyStore.js");
    const first = store.beginVocabularyImport();
    await store.clearVocabulary();
    expect((await store.loadVocabularyFile(payload, first)).reason).toBe("superseded");
    const second = store.beginVocabularyImport();
    const third = store.beginVocabularyImport();
    expect((await store.loadVocabularyFile(payload, third)).ok).toBe(true);
    expect(
        (await store.loadVocabularyFile('{"schemaVersion":1,"entries":{}}', second)).reason,
    ).toBe("superseded");
    expect(store.vocabularyStore.entries).toEqual({ Open: "Launch" });
});

it("retains previous wording when browser storage refuses removal", async () => {
    const store = await import("./vocabularyStore.js");
    await store.loadVocabularyFile(payload);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("refused");
    });
    expect((await store.clearVocabulary()).ok).toBe(false);
    expect(store.vocabularyStore.entries).toEqual({ Open: "Launch" });
});
