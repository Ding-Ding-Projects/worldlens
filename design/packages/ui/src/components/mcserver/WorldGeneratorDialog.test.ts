/**
 * @vitest-environment jsdom
 *
 * WorldGeneratorDialog.vue mounted for real, against a real Vuetify + i18n instance -
 * not just its pure helper functions in worldgen/*.test.ts. Catches the kind of defect
 * pure-function tests cannot: a typo'd component name, a missing prop, a template that
 * throws on render.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import WorldGeneratorDialog from "./WorldGeneratorDialog.vue";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;

    // Vuetify's overlay location strategy reads `visualViewport` unguarded, and jsdom has
    // none. The same stub the cirender and changelog suites install, for the same reason:
    // without it a dialog that opens perfectly well in the app throws inside a watcher.
    globalThis.visualViewport = {
        addEventListener: () => {},
        removeEventListener: () => {},
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        scale: 1,
    } as unknown as typeof globalThis.visualViewport;
});

function mountDialog(open = true) {
    const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });
    const vuetify = createVuetify();
    return mount(WorldGeneratorDialog, {
        props: {
            modelValue: open,
            versions: [
                { version: "1.21.4", stability: "release", javaFeature: 21, downloadUrl: null, sha256: null, releasedAt: null },
                { version: "1.20.4", stability: "release", javaFeature: 17, downloadUrl: null, sha256: null, releasedAt: null },
            ],
        },
        global: { plugins: [i18n, vuetify] },
        attachTo: document.body,
    });
}

// Teleported dialogs outlive their wrapper when a test fails mid-assertion, and the next
// test then reads the previous test's card out of `document.body` and fails for a reason
// that has nothing to do with it. Clearing unconditionally keeps one real failure from
// manufacturing a second fake one.
afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
});

/**
 * `v-dialog` teleports its card straight to `document.body` (Vuetify's own `v-overlay`
 * plumbing), outside whatever element `mount()` tracks -- so `wrapper.text()` is empty
 * however well the dialog rendered. These read the live document instead, the same way
 * `config/ConfigApplyDialog.test.ts` reads its own teleported card.
 */
function dialogText(): string {
    return document.body.textContent ?? "";
}

function dialogButtons(): HTMLButtonElement[] {
    return [...document.querySelectorAll<HTMLButtonElement>(".v-overlay-container button")];
}

describe("WorldGeneratorDialog", () => {
    it("mounts without throwing when open", () => {
        const wrapper = mountDialog(true);
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });

    it("does not label the working synthetic path as unwired", () => {
        const wrapper = mountDialog(true);
        expect(dialogText()).not.toContain("not wired up yet");
        wrapper.unmount();
    });

    it("warns that the built-in generator is not Minecraft-accurate", () => {
        const wrapper = mountDialog(true);
        // The caveat must reach a person at the point of generation, not live only in a
        // constant: assert the rendered dialog actually carries it.
        expect(dialogText()).toContain("not a Minecraft-accurate world");
        expect(dialogText()).toContain("same seed typed into Minecraft");
        wrapper.unmount();
    });

    it("lists the settings the built-in generator will ignore", () => {
        const wrapper = mountDialog(true);
        const text = dialogText();
        expect(text).toContain("This engine ignores these choices:");
        expect(text).toContain("Minecraft version");
        wrapper.unmount();
    });

    it("emits update:modelValue false when the close button is used", async () => {
        const wrapper = mountDialog(true);
        const closeButton = dialogButtons().find((b) => b.getAttribute("aria-label") === "Cancel");
        expect(closeButton).toBeDefined();
        closeButton?.click();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
        wrapper.unmount();
    });

    it("disables the preview-plan button while the version is unchosen", () => {
        const wrapper = mountDialog(true);
        const previewButton = dialogButtons().find((b) => (b.textContent ?? "").includes("Preview plan"));
        expect(previewButton).toBeDefined();
        expect(previewButton?.disabled).toBe(true);
        wrapper.unmount();
    });

    it("sends exact decimal target bytes through Generate without an ignored server version", async () => {
        const synthetic = vi.fn(async () => ({ ok: true, value: { bytes: 1_000_003_000, chunkCount: 100, worldFolder: "generated/world", seed: 123, zipPath: null, targetBytes: 1_000_000_000, overshootBytes: 3000, cancelled: false } }));
        vi.stubGlobal("worldlens", { mcserver: { worldgen: { synthetic } } });
        const wrapper = mountDialog();
        try {
            const destination = wrapper.findAllComponents({ name: "VTextField" }).find((field) => field.props("label") === "Destination");
            expect(destination).toBeDefined();
            destination!.vm.$emit("update:modelValue", "generated");
            dialogButtons().find((button) => button.textContent?.includes("1 GB ("))!.click();
            await wrapper.vm.$nextTick();
            const generate = dialogButtons().find((button) => button.textContent?.trim() === "Generate")!;
            expect(generate.disabled).toBe(false);
            generate.click(); await flushPromises();
            expect(synthetic).toHaveBeenCalledWith(expect.objectContaining({ targetBytes: 1_000_000_000, resume: false, outputMode: "folder", destination: "generated" }));
            expect(dialogText()).toContain("overshoot 3000 bytes");
        } finally { wrapper.unmount(); }
    });

    it("selects the exact ten-billion-byte target and exposes resume", async () => {
        const wrapper = mountDialog();
        try {
            dialogButtons().find((button) => button.textContent?.includes("10 GB ("))!.click();
            await wrapper.vm.$nextTick();
            const target = wrapper.findAllComponents({ name: "VTextField" }).find((field) => field.props("label") === "Minimum world bytes (decimal)");
            expect(target!.props("modelValue")).toBe(10_000_000_000);
            expect(dialogText()).toContain("Resume the existing generated world");
        } finally { wrapper.unmount(); }
    });
});
