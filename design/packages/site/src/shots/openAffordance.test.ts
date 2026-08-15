// @vitest-environment jsdom

/**
 * The open-affordance button that every gallery on the site wraps its capture images in.
 *
 * This is where "opens on click, opens on Enter, opens on Space" is actually proven. It has
 * to be proven here rather than assumed from `<button>`'s native semantics: verified directly
 * against this project's own test runner, jsdom 30 does not synthesize a `click` event from a
 * keyboard `Enter`/`Space` press the way a real browser does (a `click` listener registered on
 * a fresh `<button>` sees zero calls after dispatching either `KeyboardEvent` at it). Without
 * the explicit `keydown` handler this file's subject carries -- and without a test that
 * actually dispatches those keys rather than calling `.click()` and assuming the keyboard
 * path is equivalent -- "opens on Enter" and "opens on Space" would be claims nothing here
 * ever checked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { wrapCaptureInOpenButton } from "./openAffordance.js";

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

function newI18n(): I18n {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    return new I18n(new Preferences(new MemoryStorage()));
}

beforeEach(() => {
    document.body.replaceChildren();
});

describe("wrapCaptureInOpenButton", () => {
    it("wraps the given content in a real, focusable <button type=button>", () => {
        const i18n = newI18n();
        const image = document.createElement("img");
        const button = wrapCaptureInOpenButton(image, {
            i18n,
            ariaLabelKey: "shots.enlargeNamed",
            name: "The rendered map",
            onActivate: vi.fn(),
        });

        expect(button.tagName).toBe("BUTTON");
        expect(button.type).toBe("button");
        expect(button.contains(image)).toBe(true);
    });

    it("carries an accessible name naming what it opens and which capture it is -- never a bare image with a click listener", () => {
        const i18n = newI18n();
        const image = document.createElement("img");
        image.alt = "";
        const button = wrapCaptureInOpenButton(image, {
            i18n,
            ariaLabelKey: "shots.enlargeNamed",
            name: "The regex builder",
            onActivate: vi.fn(),
        });

        const label = button.getAttribute("aria-label");
        expect(label).not.toBeNull();
        expect(label).toContain("The regex builder");
        // "Enlarge" is the fixed half of the English label -- see shots.enlargeNamed in
        // strings.ts -- so a reader hears what the control *does*, not only what it shows.
        expect(label).toContain("Enlarge");
    });

    it("opens on click", () => {
        const i18n = newI18n();
        const onActivate = vi.fn();
        const button = wrapCaptureInOpenButton(document.createElement("img"), {
            i18n,
            ariaLabelKey: "shots.enlargeNamed",
            name: "A capture",
            onActivate,
        });
        document.body.append(button);

        button.click();

        expect(onActivate).toHaveBeenCalledTimes(1);
        expect(onActivate).toHaveBeenCalledWith(button);
    });

    it("opens on Enter", () => {
        const i18n = newI18n();
        const onActivate = vi.fn();
        const button = wrapCaptureInOpenButton(document.createElement("img"), {
            i18n,
            ariaLabelKey: "shots.enlargeNamed",
            name: "A capture",
            onActivate,
        });
        document.body.append(button);
        button.focus();

        button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

        expect(onActivate).toHaveBeenCalledTimes(1);
        expect(onActivate).toHaveBeenCalledWith(button);
    });

    it("opens on Space", () => {
        const i18n = newI18n();
        const onActivate = vi.fn();
        const button = wrapCaptureInOpenButton(document.createElement("img"), {
            i18n,
            ariaLabelKey: "shots.enlargeNamed",
            name: "A capture",
            onActivate,
        });
        document.body.append(button);
        button.focus();

        const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
        const prevented = !button.dispatchEvent(event);

        expect(onActivate).toHaveBeenCalledTimes(1);
        // Space's default action is "scroll the page" on a focused element; letting that
        // through on a control that just opened a full-viewport dialog would scroll a page the
        // visitor can no longer see.
        expect(prevented).toBe(true);
    });

    it("does not open on an unrelated key", () => {
        const i18n = newI18n();
        const onActivate = vi.fn();
        const button = wrapCaptureInOpenButton(document.createElement("img"), {
            i18n,
            ariaLabelKey: "shots.enlargeNamed",
            name: "A capture",
            onActivate,
        });
        document.body.append(button);
        button.focus();

        button.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));

        expect(onActivate).not.toHaveBeenCalled();
    });

    it("carries a decorative, aria-hidden zoom glyph -- the visible affordance -- distinct from the accessible name", () => {
        const i18n = newI18n();
        const button = wrapCaptureInOpenButton(document.createElement("img"), {
            i18n,
            ariaLabelKey: "shots.enlargeNamed",
            name: "A capture",
            onActivate: vi.fn(),
        });

        const glyph = button.querySelector(".mb-shot-open__glyph");
        expect(glyph).not.toBeNull();
        const svg = glyph?.querySelector("svg");
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
    });
});
