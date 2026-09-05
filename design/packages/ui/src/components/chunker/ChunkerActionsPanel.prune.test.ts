/**
 * @vitest-environment jsdom
 *
 * The trim-to-a-boundary controls, mounted.
 *
 * The dispatched `prune-bounds` input carries an empty string when no boundary was chosen,
 * and the workflow reads that empty string as "convert the whole world". The guided fields
 * and the text field both collapse to that same empty string while they are unfinished, so a
 * boundary that is half filled in is indistinguishable, at the dispatch, from a deliberate
 * whole-world conversion. That is the one state the panel must refuse: pressing the button
 * would start an expensive run that does the opposite of what the controls say.
 *
 * These properties are only true of the rendered component. The gate lives in `canStart`,
 * which is not exported, and the messages live on the fields themselves, so a test against a
 * stand-in would prove nothing about what ships.
 */

import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VRadioGroup } from "vuetify/components";
import ChunkerActionsPanel from "./ChunkerActionsPanel.vue";
import GhEntityPicker from "../github/GhEntityPicker.vue";

beforeAll(() => {
    // jsdom has no layout engine and Vuetify's fields observe their own size. The same
    // stubs the sibling suites install, for the same reason.
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
});

/** The one repository the picker is allowed to offer, so the destination is never the blocker. */
const REPOSITORY = { fullName: "octocat/worlds", private: true, canWrite: true };

/**
 * Only the preload members this panel actually reaches for: the dispatch actions it calls,
 * the three CI methods `resolveCiRenderBridge` refuses to return a bridge without, and the
 * repository list the destination picker is filled from.
 */
function installHost(): void {
    (globalThis as Record<string, unknown>).worldlens = {
        chunkerActions: {
            prepare: () => Promise.resolve({ ok: true, value: { changed: false } }),
            start: () => Promise.resolve({ ok: true, value: { message: "started" } }),
            list: () => Promise.resolve({ ok: true, value: [] }),
            recoverable: () => Promise.resolve({ ok: true, value: [] }),
            adopt: () => Promise.resolve({ ok: true, value: { message: "" } }),
            check: () => Promise.resolve({ ok: true, value: { message: "" } }),
            collect: () => Promise.resolve({ ok: true, value: { message: "" } }),
            cancel: () => Promise.resolve({ ok: true, value: { message: "" } }),
        },
        startCiRender: () => Promise.resolve({ ok: false }),
        onCiRenderEvent: () => () => {},
        ciRenderPreflight: () => Promise.resolve({ ok: false }),
        listExistingRepositories: () => Promise.resolve({ ok: true, value: [REPOSITORY] }),
    };
}

beforeEach(installHost);
afterEach(() => {
    delete (globalThis as Record<string, unknown>).worldlens;
});

function mountPanel() {
    return mount(ChunkerActionsPanel, {
        props: {
            worldFolder: "C:/worlds/overworld",
            outputDirectory: "C:/worlds/converted",
            targetFormat: "JAVA_1_21",
            config: {},
        },
        global: {
            plugins: [
                createVuetify(),
                createI18n({
                    legacy: false,
                    locale: "en",
                    missingWarn: false,
                    fallbackWarn: false,
                }),
            ],
        },
    });
}

/**
 * Everything except the boundary, so a disabled button in these tests can only be the
 * boundary. Naming an existing release asset rather than uploading keeps the upload consent
 * switch out of the picture.
 */
async function fillEverythingButTheBoundary(wrapper: VueWrapper): Promise<void> {
    await flushPromises();
    wrapper.findAllComponents(GhEntityPicker)[1]!.vm.$emit("update:modelValue", REPOSITORY.fullName);
    await wrapper.find('[data-test="chunker-actions-world"] input').setValue("v1/world.zip");
    await flushPromises();
}

/** The dispatch button, found by its own label rather than by position. */
function startButton(wrapper: VueWrapper): HTMLButtonElement {
    const button = wrapper
        .findAll("button")
        .find((candidate) => candidate.text().includes("Upload and convert"));
    expect(button, "the Upload and convert button is on screen").toBeDefined();
    return button!.element as HTMLButtonElement;
}

async function chooseMode(wrapper: VueWrapper, mode: string): Promise<void> {
    // The panel has three radio groups: the world source, the prune mode, and the output
    // mode. The prune one is the second, and it is addressed through its own component so a
    // reordered template cannot silently point this at another group.
    const groups = wrapper.findAllComponents(VRadioGroup);
    const prune = groups.find((candidate) =>
        candidate.element.querySelector('[data-test="chunker-actions-prune-none"]') !== null,
    );
    expect(prune, "the prune mode radio group is on screen").toBeDefined();
    prune!.vm.$emit("update:modelValue", mode);
    await flushPromises();
}

async function typeCorner(wrapper: VueWrapper, corner: string, value: string): Promise<void> {
    await wrapper.find(`[data-test="chunker-actions-prune-${corner}"] input`).setValue(value);
    await flushPromises();
}

describe("the trim-to-a-boundary controls refuse a boundary they cannot express", () => {
    it("starts a whole-world conversion only when the whole world is what was chosen", async () => {
        const wrapper = mountPanel();
        await fillEverythingButTheBoundary(wrapper);

        expect(startButton(wrapper).disabled).toBe(false);
        wrapper.unmount();
    });

    it("refuses a guided boundary with a corner still empty, and says which corner", async () => {
        const wrapper = mountPanel();
        await fillEverythingButTheBoundary(wrapper);
        await chooseMode(wrapper, "guided");
        await typeCorner(wrapper, "min-x", "-8");
        await typeCorner(wrapper, "min-z", "-8");
        await typeCorner(wrapper, "max-x", "8");

        expect(startButton(wrapper).disabled).toBe(true);
        expect(wrapper.find('[data-test="chunker-actions-prune-max-z"]').text()).toContain(
            "Give a whole number here",
        );
        // The three that are filled in are not accused of anything.
        expect(wrapper.find('[data-test="chunker-actions-prune-min-x"]').text()).not.toContain(
            "Give a whole number here",
        );
        wrapper.unmount();
    });

    it("refuses a corner that was typed and then cleared, which stores a string rather than null", async () => {
        const wrapper = mountPanel();
        await fillEverythingButTheBoundary(wrapper);
        await chooseMode(wrapper, "guided");
        await typeCorner(wrapper, "min-x", "-8");
        await typeCorner(wrapper, "min-z", "-8");
        await typeCorner(wrapper, "max-x", "8");
        await typeCorner(wrapper, "max-z", "8");
        expect(startButton(wrapper).disabled).toBe(false);

        await typeCorner(wrapper, "max-z", "");
        expect(startButton(wrapper).disabled).toBe(true);
        wrapper.unmount();
    });

    it("accepts a guided boundary once all four corners are whole numbers", async () => {
        const wrapper = mountPanel();
        await fillEverythingButTheBoundary(wrapper);
        await chooseMode(wrapper, "guided");
        await typeCorner(wrapper, "min-x", "-8");
        await typeCorner(wrapper, "min-z", "-8");
        await typeCorner(wrapper, "max-x", "8");
        await typeCorner(wrapper, "max-z", "8");

        expect(startButton(wrapper).disabled).toBe(false);
        expect(wrapper.find('[data-test="chunker-actions-prune-guided-fields"]').text()).not.toContain(
            "Give a whole number here",
        );
        wrapper.unmount();
    });

    it("refuses a blank text boundary, and says what the field is waiting for", async () => {
        const wrapper = mountPanel();
        await fillEverythingButTheBoundary(wrapper);
        await chooseMode(wrapper, "text");

        expect(startButton(wrapper).disabled).toBe(true);
        expect(wrapper.find('[data-test="chunker-actions-prune-text-field"]').text()).toContain(
            "Enter the four bounds",
        );
        wrapper.unmount();
    });

    it("refuses whitespace as a text boundary", async () => {
        const wrapper = mountPanel();
        await fillEverythingButTheBoundary(wrapper);
        await chooseMode(wrapper, "text");
        await wrapper.find('[data-test="chunker-actions-prune-text-field"] input').setValue("   ");
        await flushPromises();

        expect(startButton(wrapper).disabled).toBe(true);
        wrapper.unmount();
    });

    it("keeps the malformed-text message for text that is present but wrong", async () => {
        const wrapper = mountPanel();
        await fillEverythingButTheBoundary(wrapper);
        await chooseMode(wrapper, "text");
        await wrapper.find('[data-test="chunker-actions-prune-text-field"] input').setValue("-8,-8");
        await flushPromises();

        expect(startButton(wrapper).disabled).toBe(true);
        expect(wrapper.find('[data-test="chunker-actions-prune-text-field"]').text()).toContain(
            "Must be four whole numbers",
        );
        wrapper.unmount();
    });

    it("accepts a complete text boundary", async () => {
        const wrapper = mountPanel();
        await fillEverythingButTheBoundary(wrapper);
        await chooseMode(wrapper, "text");
        await wrapper
            .find('[data-test="chunker-actions-prune-text-field"] input')
            .setValue("-8,-8,8,8");
        await flushPromises();

        expect(startButton(wrapper).disabled).toBe(false);
        wrapper.unmount();
    });
});
