// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { afterEach, expect, it, vi } from "vitest";
import VocabularyWindowDrop from "./VocabularyWindowDrop.vue";
import { clearVocabulary, vocabularyStore } from "./vocabularyStore.js";

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount());
    wrappers.length = 0;
    clearVocabulary();
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
    expect(wrapper.text()).toContain("not applied");
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
