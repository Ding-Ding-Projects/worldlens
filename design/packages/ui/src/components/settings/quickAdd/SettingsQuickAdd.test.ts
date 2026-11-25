// @vitest-environment jsdom

/**
 * The quick entry beside a Settings pointer, mounted.
 *
 * What is proved here is the contract: the entry writes the same stored value the Settings
 * row writes, refuses bad input and saves nothing, keeps Save out of reach with the reason
 * written beside it, confirms without blocking, can be reached from the keyboard, and
 * renders nothing for a setting that has no quick entry.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { notices } from "../../../stores/notices.js";
import { consentAccepted } from "../../world/consentState.js";
import type { ConsentRecordLike, SetupBridge } from "../../setup/firstRunFlow.js";
import { MAP_STORAGE_DIR_KEY, readMapStorageDir } from "../../setup/mapStorage.js";
import { memoryStorage, setSetupStorage } from "../../setup/setupPrefs.js";
import { createMapStorageSetting, type MapStorageSetting } from "../mapStorageSetting.js";
import { lastQuickAddSave } from "./quickAddEvents.js";
import SettingsQuickAdd from "./SettingsQuickAdd.vue";

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
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
    setSetupStorage(memoryStorage());
    notices.history.length = 0;
    lastQuickAddSave.value = null;
    consentAccepted.value = null;
});

afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

const vuetify = createVuetify();
const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

function mountEntry(props: {
    anchor: string;
    folderSetting?: MapStorageSetting;
    consentBridge?: SetupBridge | null;
}) {
    return mount(SettingsQuickAdd, {
        props,
        global: { plugins: [vuetify, i18n], stubs: { EulaViewer: true } },
    });
}

function fakeConsentBridge(): SetupBridge & { accepted: boolean } {
    const record = (accepted: boolean): ConsentRecordLike => ({
        accepted,
        acceptedAt: accepted ? "2026-11-25T10:00:00.000Z" : null,
        documentUrl: "https://example.test/eula",
        termsVersion: 1,
        appVersion: "1.0.0",
    });
    const bridge = {
        accepted: false,
        readConsent: async () => record(bridge.accepted),
        acceptDownload: async () => {
            bridge.accepted = true;
            return record(true);
        },
        revokeDownloadConsent: async () => {
            bridge.accepted = false;
            return record(false);
        },
        needsFirstRun: async () => false,
        completeFirstRun: async () => ({ completed: true, completedAt: null }),
    };
    return bridge;
}

describe("the folder quick entry", () => {
    function folderSetting() {
        return createMapStorageSetting({ bridge: null, platform: "linux" });
    }

    it("keeps Save out of reach and says why until the folder changes", async () => {
        const setting = folderSetting();
        const wrapper = mountEntry({ anchor: "map-storage-directory", folderSetting: setting });
        await nextTick();

        const save = wrapper.get("[data-test='quick-add-save']");
        expect(save.attributes("disabled")).toBeDefined();
        expect(wrapper.get("[data-test='quick-add-reason']").text()).toBe(
            "Change the folder above to save it.",
        );
        wrapper.unmount();
    });

    it("saves the same stored value the Settings row reads, and confirms without a dialog", async () => {
        const setting = folderSetting();
        const wrapper = mountEntry({ anchor: "map-storage-directory", folderSetting: setting });
        setting.value.value = "/data/maps";
        await nextTick();

        const save = wrapper.get("[data-test='quick-add-save']");
        expect(save.attributes("disabled")).toBeUndefined();
        await wrapper.get("form").trigger("submit");
        await new Promise((resolve) => setTimeout(resolve, 0));

        // The key the Settings row stores under, read back through the row's own reader.
        expect(readMapStorageDir()).toBe("/data/maps");
        // A fresh Settings controller, as after a restart, sees the same answer.
        expect(createMapStorageSetting({ bridge: null, platform: "linux" }).saved.value).toBe(
            "/data/maps",
        );
        expect(notices.history[0]?.level).toBe("success");
        expect(notices.history[0]?.message).toContain("/data/maps");
        expect(lastQuickAddSave.value?.anchor).toBe("map-storage-directory");
        expect(wrapper.emitted("saved")).toEqual([["map-storage-directory"]]);
        expect(MAP_STORAGE_DIR_KEY).toBe("worldlens.maps.directory");
        wrapper.unmount();
    });

    it("refuses a relative path, says why beside the field and saves nothing", async () => {
        const setting = folderSetting();
        const wrapper = mountEntry({ anchor: "map-storage-directory", folderSetting: setting });
        setting.value.value = "relative/maps";
        await nextTick();

        expect(wrapper.get("[data-test='quick-add-save']").attributes("disabled")).toBeDefined();
        expect(wrapper.text()).toContain("That is not a full path.");

        // A keyboard submit walks past a disabled button; the handler refuses as well.
        await wrapper.get("form").trigger("submit");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(readMapStorageDir()).toBeNull();
        expect(notices.history).toHaveLength(0);
        expect(lastQuickAddSave.value).toBeNull();
        wrapper.unmount();
    });

    it("resets to the platform default with the Use the default button", async () => {
        const setting = folderSetting();
        setting.value.value = "/custom";
        const wrapper = mountEntry({ anchor: "map-storage-directory", folderSetting: setting });
        await nextTick();

        await wrapper.get("[data-test='quick-add-default']").trigger("click");
        expect(setting.isDefault.value).toBe(true);
        wrapper.unmount();
    });

    it("is operable from the keyboard: the field and both buttons are real, focusable controls", () => {
        const wrapper = mountEntry({
            anchor: "map-storage-directory",
            folderSetting: folderSetting(),
        });
        expect(wrapper.get("form").attributes("role")).toBe("group");
        expect(wrapper.get("form").attributes("aria-label")).toBe("Set the folder right here");
        expect(wrapper.find("input").exists()).toBe(true);
        for (const button of wrapper.findAll("button")) {
            expect(button.attributes("tabindex")).not.toBe("-1");
        }
        wrapper.unmount();
    });
});

describe("the consent quick entry", () => {
    it("shows the quotation before the button, then records the answer and clears the shared warning", async () => {
        const bridge = fakeConsentBridge();
        const wrapper = mountEntry({
            anchor: "mojang-download-consent",
            consentBridge: bridge,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        const html = wrapper.html();
        expect(html.indexOf("mb-setup-quote")).toBeGreaterThan(-1);
        expect(html.indexOf("mb-setup-quote")).toBeLessThan(html.indexOf("quick-add-accept"));

        await wrapper.get("[data-test='quick-add-accept']").trigger("click");
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(bridge.accepted).toBe(true);
        expect(consentAccepted.value).toBe(true);
        expect(notices.history[0]?.level).toBe("success");
        expect(lastQuickAddSave.value?.anchor).toBe("mojang-download-consent");
        expect(wrapper.emitted("saved")).toEqual([["mojang-download-consent"]]);
        wrapper.unmount();
    });

    it("names the reason beside a disabled Accept when this build cannot record the answer", async () => {
        const wrapper = mountEntry({ anchor: "mojang-download-consent", consentBridge: null });
        await nextTick();

        expect(wrapper.get("[data-test='quick-add-accept']").attributes("disabled")).toBeDefined();
        expect(wrapper.get("[data-test='quick-add-reason']").text()).toContain(
            "cannot record the answer",
        );
        wrapper.unmount();
    });

    it("says it is already accepted instead of offering the button again", async () => {
        const bridge = fakeConsentBridge();
        bridge.accepted = true;
        const wrapper = mountEntry({ anchor: "mojang-download-consent", consentBridge: bridge });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(wrapper.find("[data-test='quick-add-accept']").exists()).toBe(false);
        expect(wrapper.text()).toContain("Already accepted");
        wrapper.unmount();
    });
});

describe("a setting with no quick entry", () => {
    it.each(["world-folder", "java-runtime", "display", "not-a-section"])(
        "renders nothing for %s",
        (anchor) => {
            const wrapper = mountEntry({ anchor });
            expect(wrapper.find(".mb-quick-add").exists()).toBe(false);
            wrapper.unmount();
        },
    );
});
