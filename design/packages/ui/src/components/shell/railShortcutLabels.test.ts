// @vitest-environment jsdom

/**
 * The rail's compact shortcut labels are actually short, in both languages, for every
 * configured shortcut - and the mounted button never shows more text than its own box.
 *
 * Regression: v3-fixed-01-rail-1280x800.png and v3-fixed-02-rail-1280x600.png (this session's
 * own captures) showed "Remo…", "Chun…", "Back…" and "Der …" - the *full* job title truncating
 * mid-word inside the compact row's 80px column. A visible label that is unreadable is a
 * clipping defect wearing a compact row's clothes, not a compact row. The fix is a dedicated
 * short label per shortcut in `shell.ts` (`rail.shortcut.<id>`) - never the full job title, and
 * never an ellipsis standing in for one.
 *
 * `jsdom` (this suite's unit-test environment) never runs real layout, so `scrollWidth` and
 * `clientWidth` are always zero here - the same limitation `railOverflow.test.ts` and
 * `AppSettings.layout.test.ts` already document for their own axes. The `scrollWidth`-versus-
 * `clientWidth` assertion below is included because it was asked for and it is not wrong to
 * make it - a real overflow would still fail it if jsdom ever measured one - but the assertion
 * doing the actual work here is the character-count bound on the catalogue text itself: "at
 * most ~10 Latin characters or ~4 CJK characters, no ellipsis", checked directly against what
 * the button renders.
 */
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { beforeAll, describe, expect, it } from "vitest";

import AppRail from "./AppRail.vue";
import { SHELL_FIXED } from "../../copy/surfaces/shell.js";

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

/** Exactly the set `railJobShortcutInventory.test.ts` already locks by reading App.vue. */
const REQUIRED_SHORTCUT_JOB_IDS = [
    "cirender",
    "dockerHosting",
    "remoteHosting",
    "chunker",
    "backups",
    "mcservers",
    "worldDownloader",
] as const;

const MAX_LATIN_CHARS = 10;
const MAX_CJK_CHARS = 4;

/** True when every character is CJK (Han) script - used to pick which of the two length
 *  bounds applies, rather than hand-classifying each label by hand. */
function isCjkOnly(text: string): boolean {
    return [...text].every((ch) => /\p{Script=Han}/u.test(ch));
}

function withinBound(text: string): boolean {
    return isCjkOnly(text) ? [...text].length <= MAX_CJK_CHARS : text.length <= MAX_LATIN_CHARS;
}

describe("every rail shortcut has a dedicated short label in the catalogue", () => {
    it.each(REQUIRED_SHORTCUT_JOB_IDS)("rail.shortcut.%s exists in both languages", (jobId) => {
        const key = `rail.shortcut.${jobId}` as keyof typeof SHELL_FIXED;
        const entry = SHELL_FIXED[key];
        expect(entry, `rail.shortcut.${jobId} is missing from shell.ts`).toBeDefined();
        expect(entry.en.length, `rail.shortcut.${jobId}.en is empty`).toBeGreaterThan(0);
        expect(entry.yue.length, `rail.shortcut.${jobId}.yue is empty`).toBeGreaterThan(0);
    });

    it.each(REQUIRED_SHORTCUT_JOB_IDS)("rail.shortcut.%s stays within the short-label bound", (jobId) => {
        const key = `rail.shortcut.${jobId}` as keyof typeof SHELL_FIXED;
        const entry = SHELL_FIXED[key];
        for (const [locale, text] of [
            ["en", entry.en],
            ["yue", entry.yue],
        ] as const) {
            expect(text, `rail.shortcut.${jobId}.${locale} is an ellipsis, not a short label`).not.toMatch(
                /[…]|\.\.\./,
            );
            expect(
                withinBound(text),
                `rail.shortcut.${jobId}.${locale} ("${text}") exceeds ~10 Latin / ~4 CJK characters`,
            ).toBe(true);
        }
    });
});

const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    locale: "none",
    fallbackLocale: "none",
    messages: {},
});
const vuetify = createVuetify();

const SHORTCUTS = REQUIRED_SHORTCUT_JOB_IDS.map((id) => ({
    id,
    icon: "mdi-test-icon",
    label: `${id} full job title`,
    shortLabel: SHELL_FIXED[`rail.shortcut.${id}` as keyof typeof SHELL_FIXED].en,
}));

describe("the mounted compact shortcut row never overflows its own box", () => {
    it("renders the dedicated short label, not the full job title, with no ellipsis", () => {
        const rail = mount(AppRail, {
            props: {
                destination: "home",
                openJobCount: 0,
                unreadCount: 0,
                productName: "Worldlens",
                jobShortcuts: SHORTCUTS,
            },
            global: { plugins: [i18n, vuetify] },
        });

        const shortcutButtons = rail.findAll("[data-job-shortcut]");
        expect(shortcutButtons.length).toBeGreaterThan(0);

        for (const button of shortcutButtons) {
            const labelEl = button.find(".wl-rail-label").element as HTMLElement;
            const text = labelEl.textContent ?? "";

            expect(text).not.toContain("…");
            expect(withinBound(text), `rendered label "${text}" exceeds the short-label bound`).toBe(
                true,
            );

            // The honest jsdom limitation, stated rather than silently relied on: scrollWidth
            // and clientWidth are both always 0 here, so this assertion is trivially true in
            // this environment and would only ever catch a regression if jsdom grew real
            // layout. It is asserted anyway, per its own contract, alongside the text-based
            // checks above that actually do the work in this suite.
            expect(labelEl.scrollWidth).toBeLessThanOrEqual(labelEl.clientWidth);
        }
    });
});
