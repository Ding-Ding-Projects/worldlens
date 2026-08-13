/**
 * @vitest-environment jsdom
 *
 * The zone driven the way a person, and a keyboard-only person, actually drives it.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import DropRenderZone from "./DropRenderZone.vue";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;

    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        addEventListener: () => {},
        removeEventListener: () => {},
    } as unknown as typeof globalThis.visualViewport;

    document.elementsFromPoint = () => [];
});

function mountZone(props: Record<string, unknown> = {}) {
    return mount(DropRenderZone, {
        props: props as never,
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
        },
        slots: { default: "<div>content</div>" },
    });
}

/** Builds a fake file the way jsdom's own `File` would, without needing a real filesystem. */
function fakeFile(name: string, size: number): { name: string; size: number } {
    return { name, size };
}

/** Fires `drop` with a fake `dataTransfer`, since jsdom cannot construct a real `DataTransfer`. */
async function fireDrop(wrapper: ReturnType<typeof mountZone>, files: { name: string; size: number }[]) {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
        value: { files, types: ["Files"], dropEffect: "none" },
        configurable: true,
    });
    wrapper.find('[data-test="drop-render-zone"]').element.dispatchEvent(event);
    await wrapper.vm.$nextTick();
}

function fireDragEvent(
    wrapper: ReturnType<typeof mountZone>,
    type: "dragenter" | "dragover" | "dragleave",
    withFiles = true,
) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
        value: { types: withFiles ? ["Files"] : ["text/plain"], dropEffect: "none" },
        configurable: true,
    });
    wrapper.find('[data-test="drop-render-zone"]').element.dispatchEvent(event);
    return event;
}

describe("dragging over the zone", () => {
    it("shows the overlay only while a file drag is actually over it, and clears on leave", async () => {
        const wrapper = mountZone();
        expect(wrapper.find('[data-test="drop-render-overlay"]').exists()).toBe(false);

        fireDragEvent(wrapper, "dragenter");
        await wrapper.vm.$nextTick();
        expect(wrapper.find('[data-test="drop-render-overlay"]').exists()).toBe(true);

        fireDragEvent(wrapper, "dragleave");
        await wrapper.vm.$nextTick();
        expect(wrapper.find('[data-test="drop-render-overlay"]').exists()).toBe(false);
    });

    it("ignores a drag that is not carrying files", async () => {
        const wrapper = mountZone();
        fireDragEvent(wrapper, "dragenter", false);
        await wrapper.vm.$nextTick();
        expect(wrapper.find('[data-test="drop-render-overlay"]').exists()).toBe(false);
    });
});

describe("dropping files", () => {
    it("emits render with only the accepted files, and clears the drag overlay", async () => {
        const wrapper = mountZone();
        fireDragEvent(wrapper, "dragenter");
        await wrapper.vm.$nextTick();

        await fireDrop(wrapper, [fakeFile("castle.nbt", 1024), fakeFile("photo.png", 2048)]);

        expect(wrapper.find('[data-test="drop-render-overlay"]').exists()).toBe(false);
        const emitted = wrapper.emitted("render");
        expect(emitted).toHaveLength(1);
        // The payload now carries the resolved disk path as well as the name and kind,
        // because the main process renders from a path and a browser File object has none.
        // Asserted field by field rather than with a whole-object match, so adding a field
        // the renderer needs does not fail a test about which files were accepted.
        const payload = emitted?.[0]?.[0] as { name: string; kind: string }[];
        expect(payload).toHaveLength(1);
        expect(payload[0]?.name).toBe("castle.nbt");
        expect(payload[0]?.kind).toBe("structure");
    });

    it("previews accepted and rejected counts without silently dropping either", async () => {
        const wrapper = mountZone();
        await fireDrop(wrapper, [
            fakeFile("castle.nbt", 1024),
            fakeFile("wall.schem", 2048),
            fakeFile("notes.txt", 10),
        ]);

        expect(wrapper.find('[data-test="drop-render-accepted-count"]').text()).toContain("2");
        const rejectedItems = wrapper.findAll('[data-test="drop-render-rejected-list"] li');
        expect(rejectedItems).toHaveLength(1);
        expect(rejectedItems[0]?.text()).toContain(".txt");
    });

    it("never emits render when every dropped file was rejected", async () => {
        const wrapper = mountZone();
        await fireDrop(wrapper, [fakeFile("notes.txt", 10)]);
        expect(wrapper.emitted("render")).toBeUndefined();
    });

    it("does nothing while disabled", async () => {
        const wrapper = mountZone({ disabled: true });
        await fireDrop(wrapper, [fakeFile("castle.nbt", 1024)]);
        expect(wrapper.emitted("render")).toBeUndefined();
    });
});

describe("the keyboard and pointer alternative", () => {
    it("has a real focusable button that emits browse when pressed", async () => {
        const wrapper = mountZone();
        const button = wrapper.find('[data-test="drop-render-browse"]');
        expect(button.exists()).toBe(true);
        expect(button.element.tagName.toLowerCase()).toBe("button");

        await button.trigger("click");
        expect(wrapper.emitted("browse")).toHaveLength(1);
    });

    it("does not emit browse while disabled", async () => {
        const wrapper = mountZone({ disabled: true });
        const button = wrapper.find('[data-test="drop-render-browse"]');
        expect(button.attributes("disabled")).toBeDefined();
    });
});

describe("accessibility", () => {
    it("exposes a region role with an accessible name", () => {
        const wrapper = mountZone();
        const zone = wrapper.find('[data-test="drop-render-zone"]');
        expect(zone.attributes("role")).toBe("region");
        expect(zone.attributes("aria-label")).toBeTruthy();
    });

    it("announces the drop outcome in a polite live region", async () => {
        const wrapper = mountZone();
        await fireDrop(wrapper, [fakeFile("castle.nbt", 1024)]);
        expect(wrapper.find(".drop-render-zone__status").attributes("aria-live")).toBe("polite");
    });
});
