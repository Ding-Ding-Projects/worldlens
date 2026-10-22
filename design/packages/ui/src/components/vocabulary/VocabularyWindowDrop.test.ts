// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import VocabularyWindowDrop from "./VocabularyWindowDrop.vue";
import { clearVocabulary, vocabularyStore } from "./vocabularyStore.js";

const globalStyles = readFileSync(
    fileURLToPath(new NodeURL("../../styles/global.scss", import.meta.url)),
    "utf8",
);

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

it("keeps the window feedback click-through under the application chrome rule, before and after a drop", async () => {
    vi.useFakeTimers();
    // jsdom does not hit-test, so exercise the computed pointer policy at the actual
    // shell boundary and cover physical hit targets separately in Chrome.
    const style = document.createElement("style");
    const chromeRules = globalStyles.match(
        /#app \.v-application__wrap > (?:\*|\.mb-vocabulary-feedback)\s*\{[^}]*\}/g,
    );
    expect(chromeRules?.length).toBeGreaterThan(0);
    style.textContent = chromeRules!.join("\n");
    document.head.append(style);
    const shell = document.createElement("div");
    shell.id = "app";
    const wrap = document.createElement("div");
    wrap.className = "v-application__wrap";
    shell.append(wrap);
    document.body.append(shell);
    const wrapper = mount(VocabularyWindowDrop, {
        props: { restricted: false },
        attachTo: wrap,
        global: { plugins: [createI18n({ legacy: false, locale: "en", messages: {} })] },
    });
    wrappers.push(wrapper);
    const feedback = () => wrapper.get(".mb-vocabulary-feedback").element;
    try {
        expect(getComputedStyle(feedback()).pointerEvents).toBe("none");
        drop(JSON.stringify({ schemaVersion: 1, entries: { Open: "Launch" } }));
        await flushPromises();
        expect(wrapper.find(".mb-vocabulary-feedback__headline").exists()).toBe(true);
        expect(getComputedStyle(feedback()).pointerEvents).toBe("none");
        expect(
            getComputedStyle(wrapper.get(".mb-vocabulary-feedback__headline").element)
                .pointerEvents,
        ).toBe("none");
        await vi.advanceTimersByTimeAsync(3400);
        expect(wrapper.text()).toBe("");
        expect(getComputedStyle(feedback()).pointerEvents).toBe("none");
    } finally {
        shell.remove();
        style.remove();
    }
});
