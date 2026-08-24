// @vitest-environment jsdom

import { nextTick } from "vue";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import TypographyEditor from "./TypographyEditor.vue";
import { type FontFamily } from "./fontCatalog.js";
import {
    detectTypographyCapabilities,
    DEFAULT_TYPOGRAPHY,
    type TypographySpec,
} from "./typographySpec.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

const vuetify = createVuetify();
const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: {
        en: {
            "appearance.type.fontIdentity.activeInstalled": "ACTIVE {family} {identity}",
            "appearance.type.fontIdentity.missing": "MISSING {identity}, USING {family}",
            "appearance.type.fontIdentity.incompatible":
                "INCOMPATIBLE {identity} {resolved} {family}",
            "appearance.type.fontIdentity.familyMissing": "FAMILY MISSING {family}",
        },
        yue: {
            "appearance.type.fontIdentity.activeInstalled": "啱啱用緊 {family} {identity}",
            "appearance.type.fontIdentity.missing": "搵唔到 {identity}，而家用 {family}",
            "appearance.type.fontIdentity.incompatible": "身份 {identity} 同 {family} 唔夾",
            "appearance.type.fontIdentity.familyMissing": "搵唔到字體 {family}",
        },
        bilingual: {
            "appearance.type.fontIdentity.missing":
                "MISSING {identity}, USING {family} / 搵唔到 {identity}，而家用 {family}",
        },
    },
});

const installed: FontFamily = {
    family: "Active Face",
    stableId: "active-id",
    source: "installed",
    sample: "Sample",
    cjk: false,
};
const other: FontFamily = {
    family: "Other Face",
    stableId: "other-id",
    source: "installed",
    sample: "Sample",
    cjk: false,
};

let wrapper: VueWrapper | null = null;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    i18n.global.locale.value = "en";
});

function spec(patch: Partial<TypographySpec>): TypographySpec {
    return { ...DEFAULT_TYPOGRAPHY, ...patch };
}

function mountEditor(fonts: readonly FontFamily[], value: TypographySpec): VueWrapper {
    wrapper = mount(TypographyEditor, {
        global: { plugins: [vuetify, i18n] },
        props: {
            spec: value,
            overrides: { fontFamily: value.fontFamily, fontIdentity: value.fontIdentity },
            capabilities: detectTypographyCapabilities(null),
            fonts,
            notes: [],
        },
    });
    return wrapper;
}

describe("visible font identity status", () => {
    it("updates across catalog changes and preserves a missing identity", async () => {
        const view = mountEditor(
            [installed, other],
            spec({ fontFamily: "Active Face", fontIdentity: "active-id" }),
        );
        expect(view.find(".mb-type-editor__fontIdentityStatus").text()).toContain("ACTIVE");

        await view.setProps({
            spec: spec({ fontFamily: "Active Face", fontIdentity: "missing-id" }),
            fonts: [installed, other],
        });
        await nextTick();
        expect(view.find(".mb-type-editor__fontIdentityStatus").text()).toContain("MISSING");
        expect((view.vm.$props as { spec: TypographySpec }).spec.fontIdentity).toBe("missing-id");

        await view.setProps({
            spec: spec({ fontFamily: "Active Face", fontIdentity: "other-id" }),
            fonts: [installed, other],
        });
        await nextTick();
        expect(view.find(".mb-type-editor__fontIdentityStatus").text()).toContain("INCOMPATIBLE");

        await view.setProps({
            spec: spec({ fontFamily: "Gone Face", fontIdentity: "missing-id" }),
            fonts: [other],
        });
        await nextTick();
        expect(view.find(".mb-type-editor__fontIdentityStatus").text()).toContain("FAMILY MISSING");
    });

    it("keeps the status visible after a remount and localizes the factual copy", async () => {
        const saved = spec({ fontFamily: "Active Face", fontIdentity: "missing-id" });
        mountEditor([installed], saved);
        i18n.global.locale.value = "yue";
        await nextTick();
        expect(wrapper?.find(".mb-type-editor__fontIdentityStatus").text()).toContain("搵唔到");
        wrapper?.unmount();
        wrapper = mountEditor([installed], saved);
        expect(wrapper.find(".mb-type-editor__fontIdentityStatus").text()).toContain("搵唔到");
        i18n.global.locale.value = "bilingual";
        await nextTick();
        expect(wrapper.find(".mb-type-editor__fontIdentityStatus").text()).toContain("/");
    });
});
