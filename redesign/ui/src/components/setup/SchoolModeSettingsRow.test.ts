// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";

import LanguageSettingsRow from "./LanguageSettingsRow.vue";
import { i18nModule } from "../../i18n.js";
import {
    resetSchoolModeRecordAdapter,
    setSchoolModeRecordAdapter,
    type SchoolModeRecordAdapter,
    type SchoolModeSnapshot,
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
    for (let index = 0; index < 8; index++) {
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

function textInputs(): HTMLInputElement[] {
    return [...schoolControl().querySelectorAll<HTMLInputElement>("input")];
}

async function setInput(input: HTMLInputElement, value: string): Promise<void> {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
}

const disabled: SchoolModeSnapshot = {
    version: 1,
    enabled: false,
    name: null,
    credentialConfigured: false,
};

beforeEach(async () => {
    setSetupStorage(memoryStorage());
    await resetSchoolModeRecordAdapter();
    reloadSetupLanguage();
    setLanguageMode("bilingual");
    setFunnyLevel("en", 5);
    setFunnyLevel("yue", 4);
});

afterEach(async () => {
    wrapper?.unmount();
    wrapper = null;
    await resetSchoolModeRecordAdapter();
    document.body.innerHTML = "";
});

describe("the shared School-mode settings control", () => {
    it("collects and clears the enable/disable credential while rendering only a safe shared snapshot", async () => {
        let snapshot: SchoolModeSnapshot = disabled;
        const enable = vi.fn(async (request: { name: string | null; credential: string }) => {
            snapshot = { version: 1, enabled: true, name: request.name, credentialConfigured: true };
            return { ok: true as const, state: snapshot };
        });
        const disable = vi.fn(async (credential: string) => {
            if (credential !== "test-only-unlock") {
                return {
                    ok: false as const,
                    code: "credential-invalid",
                    message: "That PIN or password did not unlock this mode.",
                    state: snapshot,
                };
            }
            snapshot = { ...snapshot, enabled: false };
            return { ok: true as const, state: snapshot };
        });
        const adapter: SchoolModeRecordAdapter = {
            source: "shared",
            read: async () => ({ ok: true as const, state: snapshot }),
            enable,
            rename: async (name) => {
                snapshot = { ...snapshot, name };
                return { ok: true as const, state: snapshot };
            },
            disable,
            reset: async () => ({ ok: true as const, state: disabled }),
        };
        await setSchoolModeRecordAdapter(adapter);
        wrapper = mount(Host, { global: { plugins: [vuetify, i18nModule] }, attachTo: document.body });
        await settle();

        const [nameInput, enableInput] = textInputs();
        if (nameInput === undefined || enableInput === undefined) throw new Error("shared fields did not render");
        await setInput(nameInput, "Focus room");
        await setInput(enableInput, "test-only-unlock");
        schoolButton("Turn on").click();
        await settle();

        expect(enable).toHaveBeenCalledWith({ name: "Focus room", credential: "test-only-unlock" });
        expect(textInputs().filter((input) => input.type === "password")[0]?.value).toBe("");
        expect(schoolControl().textContent).not.toContain("test-only-unlock");
        expect(document.querySelector(".mb-setup-language")).toBeNull();
        expect(schoolControl().getAttribute("aria-label")).toBe("Focus room");
        expect(schoolControl().querySelector('[role="status"]')?.textContent).toContain(
            "Focus room is on across participating apps",
        );
        expect(schoolControl().querySelector('[role="note"]')?.textContent).toContain(
            "not a security boundary",
        );
        expect(languageMode()).toBe("en");
        expect(funnyLevel("en")).toBe(1);

        const disableInput = textInputs().find((input) => input.type === "password");
        if (disableInput === undefined) throw new Error("the shared unlock field did not render");
        await setInput(disableInput, "wrong-unlock");
        schoolButton("Turn off Focus room").click();
        await settle();

        expect(disable).toHaveBeenCalledWith("wrong-unlock");
        const retryInput = textInputs().find((input) => input.type === "password");
        if (retryInput === undefined) throw new Error("the unlock field did not remain available after refusal");
        expect(retryInput.value).toBe("");
        expect(schoolControl().textContent).not.toContain("wrong-unlock");

        await setInput(retryInput, "test-only-unlock");
        schoolButton("Turn off Focus room").click();
        await settle();

        expect(disable).toHaveBeenCalledWith("test-only-unlock");
        expect(schoolControl().textContent).not.toContain("test-only-unlock");
        expect(document.querySelector(".mb-setup-language")).not.toBeNull();
        expect(languageMode()).toBe("bilingual");
        expect(funnyLevel("en")).toBe(5);
        expect(setupStorage().read("worldlens.language.mode")).toBe("bilingual");
    });

    it("renders an honest unavailable state when the packaged host read fails instead of showing local fallback controls", async () => {
        const failedHost: SchoolModeRecordAdapter = {
            source: "shared",
            read: async () => ({
                ok: false as const,
                code: "storage-unavailable",
                message: "The shared mode record could not be read.",
                state: null,
            }),
            enable: async () => ({ ok: true as const, state: disabled }),
            rename: async () => ({ ok: true as const, state: disabled }),
            disable: async () => ({ ok: true as const, state: disabled }),
            reset: async () => ({ ok: true as const, state: disabled }),
        };
        await setSchoolModeRecordAdapter(failedHost);
        wrapper = mount(Host, { global: { plugins: [vuetify, i18nModule] }, attachTo: document.body });
        await settle();

        expect(schoolControl().textContent).toContain("The shared mode record could not be read.");
        expect(schoolControl().textContent).toContain("Retry shared record");
        expect(schoolControl().textContent).not.toContain("Local browser fallback only");
        expect(schoolControl().textContent).not.toContain("Turn on");
        expect(textInputs()).toHaveLength(0);
    });

    it("labels the no-preload route as browser-local only and does not render credential fields", async () => {
        await resetSchoolModeRecordAdapter();
        wrapper = mount(Host, { global: { plugins: [vuetify, i18nModule] }, attachTo: document.body });
        await settle();

        expect(schoolControl().textContent).toContain("Local browser fallback only");
        expect(() => schoolButton("Turn on School mode")).not.toThrow();
        expect(textInputs().filter((input) => input.type === "password")).toHaveLength(0);
    });
});
