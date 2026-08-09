// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";

import LanguageSettingsRow from "./LanguageSettingsRow.vue";
import {
    deleteSchoolModeLocalRecord,
    resetSchoolModeRecordAdapter,
    schoolModeEnabled,
} from "./schoolMode.js";
import {
    funnyLevel,
    languageMode,
    reloadSetupLanguage,
    setFunnyLevel,
    setLanguageMode,
} from "./setupI18n.js";
import { memoryStorage, setSetupStorage, setupStorage } from "./setupPrefs.js";

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
});

const vuetify = createVuetify();
const Host = defineComponent({
    setup() {
        return () => h(VApp, null, { default: () => [h(LanguageSettingsRow)] });
    },
});

let wrapper: VueWrapper | null = null;

async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

function schoolControl(): HTMLElement {
    const element = document.querySelector<HTMLElement>(".mb-school-mode");
    if (element === null) throw new Error("the School mode control never mounted");
    return element;
}

function schoolButton(label: string): HTMLButtonElement {
    const button = [...schoolControl().querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => (candidate.textContent ?? "").includes(label),
    );
    if (button === undefined) throw new Error(`no School mode button includes ${label}`);
    return button;
}

async function renameThroughTheField(value: string): Promise<void> {
    const input = schoolControl().querySelector<HTMLInputElement>("input");
    if (input === null) throw new Error("the School mode name field never mounted");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
    resetSchoolModeRecordAdapter();
    reloadSetupLanguage();
    setLanguageMode("bilingual");
    setFunnyLevel("en", 5);
    setFunnyLevel("yue", 4);
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    deleteSchoolModeLocalRecord();
    resetSchoolModeRecordAdapter();
    document.body.innerHTML = "";
});

describe("the School mode settings control", () => {
    it("renames, activates, removes the real language controls, and restores saved choices by deleting its local record", async () => {
        wrapper = mount(Host, { global: { plugins: [vuetify] }, attachTo: document.body });
        await settle();

        expect(document.querySelector(".mb-setup-language")).not.toBeNull();
        await renameThroughTheField("Focus room");
        schoolButton("Turn on Focus room in this app").click();
        await settle();

        expect(schoolModeEnabled()).toBe(true);
        expect(document.querySelector(".mb-setup-language")).toBeNull();
        expect(schoolControl().getAttribute("aria-label")).toBe("Focus room");
        expect(schoolControl().querySelector('[role="status"]')?.textContent).toContain(
            "Focus room is on in this app",
        );
        expect(schoolControl().textContent).not.toContain("School mode");
        expect(schoolControl().querySelector('[role="note"]')?.textContent).toContain(
            "not a security boundary",
        );
        expect(languageMode()).toBe("en");
        expect(funnyLevel("en")).toBe(1);

        // The field stays active, so a rename is an actual operation in the active state rather
        // than a setting stranded behind the only button that enabled it.
        await renameThroughTheField("Quiet study");
        expect(schoolControl().getAttribute("aria-label")).toBe("Quiet study");
        expect(schoolControl().textContent).not.toContain("Focus room");

        schoolButton("Delete this app's local Quiet study record").click();
        await settle();

        expect(schoolModeEnabled()).toBe(false);
        expect(document.querySelector(".mb-setup-language")).not.toBeNull();
        expect(languageMode()).toBe("bilingual");
        expect(funnyLevel("en")).toBe(5);
        expect(funnyLevel("yue")).toBe(4);
        expect(setupStorage().read("worldlens.language.mode")).toBe("bilingual");
    });
});
