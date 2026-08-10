// @vitest-environment jsdom

/**
 * The two-armed guard over settings explanations and provenance lines.
 *
 * The first arm walks the hand-written list and demands that each named setting really does
 * carry an explanation in both languages and really does render a provenance line that names
 * its value. The second arm walks the schema and demands that nothing in it is missing from
 * the list. Only the second arm can catch the failure this whole area exists to prevent - a
 * setting that arrives with no explanation at all - because a setting with nothing to check
 * passes every check that starts by looking at what is there.
 *
 * Both arms have been watched failing rather than assumed to work: removing `descriptionKey`
 * from `theme.density` turns the first red, and adding an extra stored setting to the schema
 * turns the second red. A guard nobody has seen fail is a guard nobody knows is wired up.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toggleRow } from "../appearance/editor/controls.js";
import { AppearanceController } from "../appearance/controller.js";
import { Preferences } from "../platform/Preferences.js";
import { coverageGaps, SETTINGS_REQUIRING_EXPLANATION } from "./explanationCoverage.js";
import { setI18nState, t } from "./i18n.js";
import { createSettingsPage } from "./page.js";
import { provenanceLine, settingValueText, type ProvenanceKind } from "./provenance.js";
import { SETTINGS } from "./schema.js";
import { isStoredSetting, type StoredSetting } from "./types.js";

const STORED = SETTINGS.filter(isStoredSetting);

function definitionFor(id: string): StoredSetting | undefined {
    return STORED.find((candidate) => candidate.id === id);
}

/**
 * Whether a key resolves to real copy in both languages, asked through the translator rather
 * than by reading a string table directly.
 *
 * Reading one table would only ever check the settings namespace, and settings copy is no
 * longer all in one place: the display-name and dialog-emoji rows keep theirs in their own
 * modules under their own namespaces. Asking the port is namespace-agnostic and is also what
 * the page itself does, so this cannot pass on copy the page could not render.
 *
 * Bilingual mode is what makes the Cantonese half checkable. In Cantonese mode a missing
 * translation falls back to English and reads as success; bilingual mode instead joins the two
 * halves with a middle dot and emits the English alone when there is no Cantonese, so the
 * separator's presence is the proof that a second language is really there.
 */
function missingCopy(key: string): string | null {
    setI18nState({ mode: "en" });
    const english = t(key);
    if (english === key || english.trim() === "") return `${key} has no English copy`;
    setI18nState({ mode: "bilingual" });
    const both = t(key);
    setI18nState({ mode: "en" });
    return both.includes(" · ") ? null : `${key} has no Cantonese copy`;
}

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length(): number {
        return this.values.size;
    }
    clear(): void {
        this.values.clear();
    }
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }
    removeItem(key: string): void {
        this.values.delete(key);
    }
    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

describe("settings explanation coverage", () => {
    it("names a setting that exists, and only settings that exist", () => {
        const gaps = coverageGaps(STORED.map((definition) => definition.id));
        expect(gaps.listedButAbsent).toEqual([]);
    });

    it("leaves no stored setting out of the hand-written list", () => {
        // The inverted arm. Without it, a setting added to the schema with no explanation and
        // no entry here would be checked by nothing at all, which is precisely the gap a
        // pattern-shaped guard leaves behind.
        const gaps = coverageGaps(STORED.map((definition) => definition.id));
        expect(gaps.presentButUnlisted).toEqual([]);
    });

    it("gives every listed setting an explanation with copy in both languages", () => {
        const missing: string[] = [];
        for (const id of SETTINGS_REQUIRING_EXPLANATION) {
            const definition = definitionFor(id);
            const key = definition?.descriptionKey;
            if (key === undefined) {
                missing.push(`${id}: no descriptionKey`);
                continue;
            }
            const problem = missingCopy(key);
            if (problem !== null) missing.push(`${id}: ${problem}`);
        }
        expect(missing).toEqual([]);
    });

    it("detects an explanation key that resolves to nothing", () => {
        // The detector returns null for every healthy key above, which is also exactly what a
        // detector that silently stopped looking would return. This is the inverted check for
        // the check itself: a key nothing registers has to come back as a problem.
        expect(missingCopy("settings.thereIsNoSuchKeyAnywhere")).toContain("no English copy");
    });

    afterEach(() => {
        // `setI18nState` is a module-level singleton, so a test that moves the language mode
        // puts it back rather than leaving every later test in this file reading Cantonese.
        setI18nState({ mode: "en" });
    });
});

describe("provenance lines name the value in force", () => {
    const KINDS: readonly ProvenanceKind[] = [
        "stored",
        "compiled-default",
        "responsive-default",
        "scheduled-override",
    ];

    it("renders a resolved sentence containing the value for every setting and every kind", () => {
        const problems: string[] = [];
        for (const id of SETTINGS_REQUIRING_EXPLANATION) {
            const definition = definitionFor(id);
            if (definition === undefined) continue;
            const valueText = settingValueText(definition, definition.defaultValue);
            for (const kind of KINDS) {
                const line = provenanceLine({ definition, kind, value: definition.defaultValue });
                if (line.trim() === "") problems.push(`${id} / ${kind}: empty line`);
                // A leftover placeholder means the key was renamed without its arguments, or
                // the phrase gained a placeholder nobody supplies. Both render as literal
                // braces on screen.
                if (/\{\w+\}/.test(line)) problems.push(`${id} / ${kind}: unresolved ${line}`);
                if (!line.includes(valueText)) {
                    problems.push(`${id} / ${kind}: does not name "${valueText}" - ${line}`);
                }
                // The old one-liner said "default" and stopped. Naming the category instead of
                // the value is the defect, so a line that never mentions the value is a
                // regression however well-formed it is.
                if (line === "settings.provenance." + kind) {
                    problems.push(`${id} / ${kind}: unresolved key`);
                }
            }
        }
        expect(problems).toEqual([]);
    });

    it("renders a select's option label rather than its stored id", () => {
        const density = definitionFor("theme.density");
        expect(density).toBeDefined();
        if (density === undefined) return;
        expect(settingValueText(density, "comfortable")).toBe("Comfortable");
        const line = provenanceLine({
            definition: density,
            kind: "compiled-default",
            value: "comfortable",
        });
        expect(line).toContain("Comfortable");
    });

    it("renders a toggle as a word and a number with its unit", () => {
        const elevation = definitionFor("shape.elevation");
        const target = definitionFor("a11y.minTarget");
        expect(elevation).toBeDefined();
        expect(target).toBeDefined();
        if (elevation === undefined || target === undefined) return;
        expect(provenanceLine({ definition: elevation, kind: "stored", value: true })).toContain(
            "On",
        );
        expect(provenanceLine({ definition: elevation, kind: "stored", value: false })).toContain(
            "Off",
        );
        expect(provenanceLine({ definition: target, kind: "stored", value: 44 })).toContain(
            "44 px",
        );
    });

    it("quotes the real breakpoint for a responsive default, and omits it when there is none", () => {
        const sidebar = definitionFor("tabs.sidebarCollapsed");
        const underline = definitionFor("a11y.underlineLinks");
        expect(sidebar).toBeDefined();
        expect(underline).toBeDefined();
        if (sidebar === undefined || underline === undefined) return;
        expect(
            provenanceLine({ definition: sidebar, kind: "responsive-default", value: true }),
        ).toContain("720");
        // No responsive default is declared for this one, so no width may be invented for it.
        expect(
            provenanceLine({ definition: underline, kind: "responsive-default", value: true }),
        ).not.toMatch(/\d+ CSS/);
    });

    it("says a scheduled override leaves the stored base value alone", () => {
        const mode = definitionFor("theme.mode");
        expect(mode).toBeDefined();
        if (mode === undefined) return;
        const line = provenanceLine({
            definition: mode,
            kind: "scheduled-override",
            value: "dark",
        });
        expect(line).toContain("Dark");
        expect(line).toContain("unchanged");
    });

    it("uses a caller-supplied name for a value it cannot resolve on its own", () => {
        const family = definitionFor("type.family");
        expect(family).toBeDefined();
        if (family === undefined) return;
        const line = provenanceLine({
            definition: family,
            kind: "stored",
            value: "system-ui",
            displayValue: "System interface",
        });
        expect(line).toContain("System interface");
        expect(line).not.toContain("system-ui");
    });
});

describe("the explanation sits behind a disclosure", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    function row(descriptionKey: string | undefined): HTMLElement {
        return toggleRow({
            labelKey: "set.elevation",
            descriptionKey,
            onReset: () => undefined,
            isDefault: () => true,
            read: () => false,
            write: () => undefined,
        }).element;
    }

    it("collapses the explanation behind a named, keyboard-operable trigger", () => {
        const element = row("set.elevation.desc");
        document.body.append(element);

        const trigger = element.querySelector<HTMLButtonElement>(".mb-explain");
        expect(trigger).not.toBeNull();
        if (trigger === null) return;
        // A <button> is keyboard-operable by construction: it takes focus in the tab order and
        // fires click on both Enter and Space without a keydown handler of its own.
        expect(trigger.tagName).toBe("BUTTON");
        expect(trigger.type).toBe("button");
        expect(trigger.getAttribute("aria-label")).toBe("Explain Show elevation shadows");
        // The glyph is aria-hidden, so no word text may leak into the fixed-size icon button.
        expect(trigger.textContent?.trim()).toBe("");

        const regionId = trigger.getAttribute("aria-controls") ?? "";
        expect(regionId).not.toBe("");
        const region = document.getElementById(regionId);
        expect(region).not.toBeNull();
        expect(region?.hidden).toBe(true);
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(region?.textContent ?? "").toContain("Off replaces shadows with outlines");

        trigger.click();
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(region?.hidden).toBe(false);

        trigger.click();
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(region?.hidden).toBe(true);
    });

    it("grows no affordance on a row that has nothing to explain", () => {
        const element = row(undefined);
        document.body.append(element);
        expect(element.querySelector(".mb-explain")).toBeNull();
        // And no orphan region either: a hidden paragraph with no trigger is unreachable copy.
        expect(element.querySelector("p[id^='mb-explanation']")).toBeNull();
    });
});

describe("search still indexes explanations that are no longer on screen", () => {
    beforeEach(() => {
        window.matchMedia = ((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => false,
        })) as typeof window.matchMedia;
        HTMLElement.prototype.scrollIntoView = (): void => {};
    });

    it("reads descriptions from the schema, not from the rendered DOM", () => {
        /*
         * The one way collapsing an explanation could have broken something real: if the
         * settings search had been reading the paragraph out of the page, hiding it would have
         * made every setting unfindable by its own description. It reads `descriptionKey`
         * through the schema instead, so this asserts both halves at once - the description is
         * in the index, and the same text is hidden in the DOM.
         */
        const prefs = new Preferences(new MemoryStorage());
        const page = createSettingsPage({ prefs, appearance: new AppearanceController(prefs) });

        const searchable = page.search.host
            .listSettings()
            .find((setting) => setting.id === "theme.density");
        expect(searchable?.description).toContain("How tightly rows, controls, and padding");

        const hidden = [...page.element.querySelectorAll<HTMLElement>("p.mb-help[hidden]")].some(
            (paragraph) =>
                (paragraph.textContent ?? "").includes("How tightly rows, controls, and padding"),
        );
        expect(hidden).toBe(true);

        page.destroy();
    });
});
