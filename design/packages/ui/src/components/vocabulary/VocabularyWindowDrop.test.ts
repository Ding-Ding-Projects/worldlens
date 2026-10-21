// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { afterEach, expect, it, vi } from "vitest";
import VocabularyWindowDrop from "./VocabularyWindowDrop.vue";
import { clearVocabulary, vocabularyStore } from "./vocabularyStore.js";

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(async () => {
    wrappers.forEach((wrapper) => wrapper.unmount());
    wrappers.length = 0;
    await clearVocabulary();
    vi.useRealTimers();
});
function setup(restricted = false) {
    const wrapper = mount(VocabularyWindowDrop, {
        props: { restricted },
        global: { plugins: [createI18n({ legacy: false, locale: "en", messages: {} })] },
    });
    wrappers.push(wrapper);
    return wrapper;
}
function drop(bytes: string, name = "words.json") {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
        value: {
            files: [
                { name, size: bytes.length, type: "application/json", text: async () => bytes },
            ],
        },
    });
    window.dispatchEvent(event);
    return event;
}
it("claims JSON before world handlers, applies locally, and announces only the supplied headline", async () => {
    vi.useFakeTimers();
    const wrapper = setup();
    const competing = vi.fn();
    window.addEventListener("drop", competing);
    const event = drop(
        JSON.stringify({
            schemaVersion: 1,
            entries: { "private vocabulary": "Custom words", Open: "Launch" },
        }),
    );
    await flushPromises();
    expect(event.defaultPrevented).toBe(true);
    expect(competing).not.toHaveBeenCalled();
    window.removeEventListener("drop", competing);
    expect(wrapper.text()).toBe("Custom words");
    expect(wrapper.attributes("aria-live")).toBe("polite");
    expect(wrapper.emitted("outcome")).toEqual([[true]]);
    expect(vocabularyStore.entries.Open).toBe("Launch");
    await vi.advanceTimersByTimeAsync(3400);
    expect(wrapper.text()).toBe("");
});
it("refuses invalid input without changing wording or announcing a success", async () => {
    const wrapper = setup();
    drop("not JSON");
    await flushPromises();
    expect(wrapper.text()).toBe(""); // Persistent app notification receives the failed outcome.
    expect(wrapper.emitted("outcome")).toEqual([[false]]);
    expect(vocabularyStore.status).toBe("no-file");
});
it("suppresses personal wording while restricted", async () => {
    const wrapper = setup(true);
    drop(JSON.stringify({ schemaVersion: 1, entries: { Open: "Launch" } }));
    await flushPromises();
    expect(wrapper.emitted("outcome")).toBeUndefined();
    expect(vocabularyStore.status).toBe("no-file");
});

it("Clear cancels a dropped file whose text is still being read", async () => {
    const wrapper = setup();
    let finish!: (value: string) => void;
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
        value: {
            files: [
                {
                    name: "words.json",
                    size: 100,
                    type: "application/json",
                    text: () =>
                        new Promise<string>((resolve) => {
                            finish = resolve;
                        }),
                },
            ],
        },
    });
    window.dispatchEvent(event);
    await clearVocabulary();
    finish(JSON.stringify({ schemaVersion: 1, entries: { Open: "Launch" } }));
    await flushPromises();
    expect(vocabularyStore.status).toBe("no-file");
    expect(wrapper.emitted("outcome")).toBeUndefined();
});

it("a Settings import supersedes an earlier delayed drop", async () => {
    const wrapper = setup();
    const { beginVocabularyImport, loadVocabularyFile } = await import("./vocabularyStore.js");
    let finish!: (value: string) => void;
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
        value: {
            files: [
                {
                    name: "words.json",
                    size: 100,
                    type: "application/json",
                    text: () =>
                        new Promise<string>((resolve) => {
                            finish = resolve;
                        }),
                },
            ],
        },
    });
    window.dispatchEvent(event);
    const settingsImport = beginVocabularyImport();
    await loadVocabularyFile(
        JSON.stringify({ schemaVersion: 1, entries: { Open: "Launch" } }),
        settingsImport,
    );
    finish(JSON.stringify({ schemaVersion: 1, entries: { Open: "Start" } }));
    await flushPromises();
    expect(vocabularyStore.entries).toEqual({ Open: "Launch" });
    expect(wrapper.emitted("outcome")).toBeUndefined();
});
