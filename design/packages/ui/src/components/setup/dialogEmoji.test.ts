// @vitest-environment jsdom

/**
 * The Show emojis in dialogs switch: its default, its persistence across a restart, its
 * settings-history mirror, School mode's effective override, and the row that changes it.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import { VApp, VSwitch } from "vuetify/components";
import { createI18n } from "vue-i18n";

import {
    DEFAULT_DIALOG_EMOJI,
    DIALOG_EMOJI_KEY,
    dialogEmojiChoice,
    dialogEmojiEnabled,
    dialogEmojiFor,
    reloadDialogEmoji,
    setDialogEmojiEnabled,
} from "./dialogEmoji.js";
import { memoryStorage, setSetupStorage, setupStorage } from "./setupPrefs.js";
import DialogEmojiRow from "./DialogEmojiRow.vue";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadDialogEmoji();
});

afterEach(() => {
    delete window.worldlens;
    document.body.innerHTML = "";
});

describe("the preference", () => {
    it("ships on", () => {
        expect(DEFAULT_DIALOG_EMOJI).toBe(true);
        expect(dialogEmojiChoice()).toBe(true);
        expect(dialogEmojiFor("destructive")).not.toBeNull();
    });

    it("persists the choice and reads it back after a restart", () => {
        setDialogEmojiEnabled(false);
        expect(setupStorage().read(DIALOG_EMOJI_KEY)).toBe("false");
        setSetupStorage(memoryStorage({ [DIALOG_EMOJI_KEY]: "false" }));
        reloadDialogEmoji();
        expect(dialogEmojiEnabled()).toBe(false);
        expect(dialogEmojiFor("destructive")).toBeNull();
    });

    it("falls back to the default for a stored value that is not a boolean", () => {
        setSetupStorage(memoryStorage({ [DIALOG_EMOJI_KEY]: "maybe" }));
        reloadDialogEmoji();
        expect(dialogEmojiChoice()).toBe(DEFAULT_DIALOG_EMOJI);
    });

    it("honours a caller's specific emoji, and a caller asking for none", () => {
        expect(dialogEmojiFor("info", "🗺️")).toBe("🗺️");
        expect(dialogEmojiFor("info", null)).toBeNull();
    });

    it("mirrors a change into the settings history", async () => {
        const save = vi.fn(async () => {});
        Object.defineProperty(window, "worldlens", {
            configurable: true,
            value: { appSettingsHistory: { read: async () => ({ values: {} }), save } },
        });
        setDialogEmojiEnabled(false);
        await vi.waitFor(() => expect(save).toHaveBeenCalled());
        expect(save).toHaveBeenCalledWith({ version: 1, values: { dialogEmoji: false } });
    });
});

describe("the settings row", () => {
    it("reflects the stored value and writes the switch back, with no emoji in its label", async () => {
        const Host = defineComponent({
            setup: () => () => h(VApp, null, { default: () => [h(DialogEmojiRow)] }),
        });
        const wrapper = mount(Host, {
            global: {
                plugins: [
                    createVuetify(),
                    createI18n({ legacy: false, locale: "en", missingWarn: false, messages: {} }),
                ],
            },
            attachTo: document.body,
        });
        const toggle = wrapper.findComponent(VSwitch);
        expect(toggle.props("modelValue")).toBe(true);
        expect(String(toggle.props("label"))).toBe("Show emojis in dialogs");

        await toggle.setValue(false);
        await nextTick();
        expect(dialogEmojiChoice()).toBe(false);
        expect(setupStorage().read(DIALOG_EMOJI_KEY)).toBe("false");
        wrapper.unmount();
    });
});
