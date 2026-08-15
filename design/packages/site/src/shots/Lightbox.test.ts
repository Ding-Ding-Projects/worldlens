// @vitest-environment jsdom

/**
 * The screenshot lightbox: the dialog itself, independent of which gallery opened it (that
 * wiring is `openAffordance.test.ts`'s job).
 *
 * jsdom performs no layout, so every test that needs a real viewport or a real image size
 * overrides `getBoundingClientRect` on the stage and passes explicit `naturalWidth`/
 * `naturalHeight` through `LightboxItem` -- the same technique
 * `platform/PanelGeometry.test.ts`'s own `panel()` helper already uses for exactly the same
 * reason. `zoomMath.test.ts` beside this file is what actually proves the fit/clamp/pan
 * arithmetic is correct in the abstract; this file proves the DOM wiring around it -- what
 * opens it, what closes it, where focus goes, and what a visitor watching the screen sees.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { createLightbox, type Lightbox } from "./Lightbox.js";

const here = dirname(fileURLToPath(import.meta.url));
const cssSource = readFileSync(resolve(here, "shots.css"), "utf8");

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

function stubRect(element: Element, width: number, height: number): void {
    element.getBoundingClientRect = () =>
        ({
            x: 0,
            y: 0,
            width,
            height,
            top: 0,
            left: 0,
            right: width,
            bottom: height,
            toJSON: () => ({}),
        }) as DOMRect;
}

function newI18n(): I18n {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    return new I18n(new Preferences(new MemoryStorage()));
}

/** An 800x600 stage: every test that opens the lightbox sets this up first. */
function widePortrait(lightbox: Lightbox): void {
    const stage = lightbox.element.querySelector(".mb-lightbox__stage");
    if (stage !== null) stubRect(stage, 800, 600);
}

let lightbox: Lightbox | null = null;

beforeEach(() => {
    document.body.replaceChildren();
});

afterEach(() => {
    lightbox?.destroy();
    lightbox = null;
    document.body.replaceChildren();
    vi.useRealTimers();
});

describe("opening and closing", () => {
    it("is hidden until the first open() call", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        expect(lightbox.isOpen).toBe(false);
        expect(lightbox.element.hidden).toBe(true);
    });

    it("opens: becomes visible, unhidden, and reports isOpen true", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);

        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);

        expect(lightbox.isOpen).toBe(true);
        expect(lightbox.element.hidden).toBe(false);
    });

    it("Escape closes it", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);
        expect(lightbox.isOpen).toBe(true);

        lightbox.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(lightbox.isOpen).toBe(false);
        expect(lightbox.element.hidden).toBe(true);
    });

    it("the close button closes it", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);

        const close = lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Close"]');
        expect(close).not.toBeNull();
        close?.click();

        expect(lightbox.isOpen).toBe(false);
    });

    it("clicking the stage's own empty background closes it, but clicking the image itself does not", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);

        const stage = lightbox.element.querySelector(".mb-lightbox__stage") as HTMLElement;
        const image = lightbox.element.querySelector(".mb-lightbox__image") as HTMLElement;

        // A click that bubbles up from the image is not a backdrop click: closing on it would
        // make it impossible to double-click the image to toggle zoom, and impossible to
        // start a drag with a pointerdown that a browser also reports as part of a click.
        image.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(lightbox.isOpen).toBe(true);

        stage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(lightbox.isOpen).toBe(false);
    });

    it("returns focus to the exact figure that opened it, every time", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);

        const first = document.createElement("button");
        first.textContent = "first capture";
        const second = document.createElement("button");
        second.textContent = "second capture";
        document.body.append(first, second);

        first.focus();
        lightbox.open({ src: "a.png", alt: "A", name: "A", naturalWidth: 400, naturalHeight: 300 }, first);
        lightbox.close();
        expect(document.activeElement).toBe(first);

        second.focus();
        lightbox.open({ src: "b.png", alt: "B", name: "B", naturalWidth: 400, naturalHeight: 300 }, second);
        lightbox.close();
        expect(document.activeElement).toBe(second);
    });

    it("never calls .focus() on a trigger that left the document while the dialog was open", () => {
        // The same guard `search/anchoredPanelFocusReturn.test.ts` proves for `AnchoredPanel`
        // and `platform/Overlay.ts` already carries: a page re-render can remove the figure
        // that opened the lightbox while it is still open, and closing must not throw trying
        // to focus a node that is no longer part of the page.
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);

        trigger.remove();
        const focusSpy = vi.spyOn(trigger, "focus");

        expect(() => lightbox?.close()).not.toThrow();
        expect(focusSpy).not.toHaveBeenCalled();
    });

    it("re-opening for a different capture replaces the previous one rather than stacking", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);

        lightbox.open({ src: "a.png", alt: "A", name: "First capture", naturalWidth: 400, naturalHeight: 300 }, trigger);
        lightbox.open({ src: "b.png", alt: "B", name: "Second capture", naturalWidth: 400, naturalHeight: 300 }, trigger);

        const image = lightbox.element.querySelector<HTMLImageElement>(".mb-lightbox__image");
        expect(image?.src).toContain("b.png");
        expect(lightbox.element.getAttribute("aria-label")).toContain("Second capture");
    });
});

describe("accessibility contract", () => {
    it("carries role=dialog, aria-modal=true, and an accessible name naming the open capture", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);

        lightbox.open(
            { src: "shot-config.png", alt: "The configuration screen", name: "Configuration screen", naturalWidth: 1280, naturalHeight: 800 },
            trigger,
        );

        expect(lightbox.element.getAttribute("role")).toBe("dialog");
        expect(lightbox.element.getAttribute("aria-modal")).toBe("true");
        expect(lightbox.element.getAttribute("aria-label")).toContain("Configuration screen");
    });

    it("every button inside carries an accessible name", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);

        for (const button of lightbox.element.querySelectorAll("button")) {
            const label = button.getAttribute("aria-label");
            expect(label, `${button.className} has no aria-label`).toBeTruthy();
            expect(label?.trim().length).toBeGreaterThan(0);
        }
    });

    it("traps Tab inside the dialog: Tab from the last control wraps to the first, Shift+Tab from the first wraps to the last", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        // Zoomed to maximum, so zoom-in is disabled and excluded from the Tab cycle -- this
        // also proves the trap recomputes its target list rather than caching it once.
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 4000, naturalHeight: 3000 }, trigger);
        for (let i = 0; i < 20; i += 1) {
            lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click();
        }

        const buttons = [...lightbox.element.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
        expect(buttons.length).toBeGreaterThan(0);
        const first = buttons[0] as HTMLButtonElement;
        const last = buttons[buttons.length - 1] as HTMLButtonElement;

        last.focus();
        expect(document.activeElement).toBe(last);
        lightbox.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(first);

        first.focus();
        lightbox.element.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
        );
        expect(document.activeElement).toBe(last);
    });

    it("moves focus onto a real control inside the dialog when it opens", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);

        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);

        expect(document.activeElement).not.toBe(document.body);
        expect(lightbox.element.contains(document.activeElement)).toBe(true);
    });

    it("marks every other body child inert while open, and lifts it again on close", () => {
        const i18n = newI18n();
        const page = document.createElement("main");
        document.body.append(page);
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        page.append(trigger);

        expect(page.hasAttribute("inert")).toBe(false);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);
        expect(page.hasAttribute("inert")).toBe(true);

        lightbox.close();
        expect(page.hasAttribute("inert")).toBe(false);
    });
});

describe("zoom", () => {
    it("the zoom-in and zoom-out buttons change the reported scale and its visible readout", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);

        const startScale = lightbox.scale;
        lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click();
        expect(lightbox.scale).toBeGreaterThan(startScale);

        const afterIn = lightbox.scale;
        lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')?.click();
        expect(lightbox.scale).toBeLessThan(afterIn);

        const level = lightbox.element.querySelector(".mb-lightbox__level");
        expect(level?.textContent).toBe(`${Math.round(lightbox.scale * 100)}%`);
    });

    it("reaches at least four times the fit scale, so interface text is actually readable", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        // A capture natively smaller than the 800x600 stage: fit scale is > 1 here.
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 440, naturalHeight: 545 }, trigger);
        const fitScale = lightbox.scale;

        for (let i = 0; i < 40; i += 1) {
            lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click();
        }

        expect(lightbox.scale).toBeGreaterThanOrEqual(fitScale * 4 - 0.001);
    });

    it("the + and - keys zoom, and 0 resets to fit", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);
        const fitScale = lightbox.scale;

        lightbox.element.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true }));
        expect(lightbox.scale).toBeGreaterThan(fitScale);

        lightbox.element.dispatchEvent(new KeyboardEvent("keydown", { key: "0", bubbles: true, cancelable: true }));
        expect(lightbox.scale).toBeCloseTo(fitScale);
    });

    it("the mouse wheel zooms: scrolling up zooms in, scrolling down zooms out", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);
        const fitScale = lightbox.scale;

        const stage = lightbox.element.querySelector(".mb-lightbox__stage") as HTMLElement;
        stage.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
        expect(lightbox.scale).toBeGreaterThan(fitScale);

        const afterUp = lightbox.scale;
        stage.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
        expect(lightbox.scale).toBeLessThan(afterUp);
    });

    it("double-click toggles between fit-to-screen and natural (100%) size", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        // A capture natively smaller than the stage, so fit (> 100%) and natural (100%) genuinely differ.
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 440, naturalHeight: 545 }, trigger);
        const fitScale = lightbox.scale;
        expect(fitScale).toBeGreaterThan(1);

        const image = lightbox.element.querySelector(".mb-lightbox__image") as HTMLElement;
        image.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        expect(lightbox.scale).toBeCloseTo(1);

        image.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        expect(lightbox.scale).toBeCloseTo(fitScale);
    });

    it("disables zoom-out at the floor and zoom-in at the ceiling, rather than silently ignoring the click", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        // A capture natively larger than the 800x600 stage in both axes, so its fit scale is
        // below 1 and the floor of the zoom range is that same fit scale -- the disabled state
        // right after open is therefore unambiguous. (A capture natively *smaller* than the
        // stage has a fit scale above 1, and can legitimately zoom out further, down to its own
        // natural size -- see `computeMinScale`'s tests in `zoomMath.test.ts` for that case.)
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 4000, naturalHeight: 3000 }, trigger);

        const zoomOut = lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!;
        const zoomIn = lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!;

        expect(zoomOut.disabled).toBe(true);
        expect(zoomIn.disabled).toBe(false);

        for (let i = 0; i < 40; i += 1) zoomIn.click();
        expect(zoomIn.disabled).toBe(true);
        expect(zoomOut.disabled).toBe(false);
    });
});

describe("pinch (two simultaneous pointers)", () => {
    it("spreading two pointers apart zooms in, relative to their starting distance", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);
        const startScale = lightbox.scale;

        const image = lightbox.element.querySelector(".mb-lightbox__image") as HTMLElement;
        image.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 300, bubbles: true }));
        image.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, clientX: 200, clientY: 300, bubbles: true }));
        // Starting distance 100px; move to 300px apart -- a real spreading pinch.
        image.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 50, clientY: 300, bubbles: true }));
        image.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 350, clientY: 300, bubbles: true }));

        expect(lightbox.scale).toBeGreaterThan(startScale);
    });
});

describe("pan clamping", () => {
    it("dragging far past the image's own edge is clamped, never losing the picture off-screen", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        // Zoomed in on a capture natively larger than the stage so there is real slack to pan.
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 4000, naturalHeight: 3000 }, trigger);
        for (let i = 0; i < 5; i += 1) {
            lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click();
        }

        const image = lightbox.element.querySelector(".mb-lightbox__image") as HTMLElement;
        image.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 9, clientX: 0, clientY: 0, bubbles: true }));
        // A wildly large drag, the kind a fast real-world flick would produce.
        image.dispatchEvent(
            new PointerEvent("pointermove", { pointerId: 9, clientX: 1_000_000, clientY: 1_000_000, bubbles: true }),
        );

        const transform = image.style.transform;
        const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
        expect(match).not.toBeNull();
        const x = Number.parseFloat(match?.[1] ?? "NaN");
        const y = Number.parseFloat(match?.[2] ?? "NaN");
        // The displayed image is finite-sized even at 5x zoom-in clicks; a pan of a million
        // pixels must have been clamped down to something on that same order, not applied
        // verbatim (which would place the image far outside the viewport in both axes).
        expect(Math.abs(x)).toBeLessThan(100_000);
        expect(Math.abs(y)).toBeLessThan(100_000);
    });

    it("keeps arrow-key pan clamped the same way pointer-drag pan is", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 4000, naturalHeight: 3000 }, trigger);
        for (let i = 0; i < 5; i += 1) {
            lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click();
        }

        for (let i = 0; i < 500; i += 1) {
            lightbox.element.dispatchEvent(
                new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
            );
        }

        const image = lightbox.element.querySelector(".mb-lightbox__image") as HTMLElement;
        const match = /translate\(([-\d.]+)px/.exec(image.style.transform);
        expect(match).not.toBeNull();
        expect(Math.abs(Number.parseFloat(match?.[1] ?? "NaN"))).toBeLessThan(100_000);
    });

    it("at fit scale (nothing to pan into) an arrow key leaves the image exactly where it was", () => {
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);

        lightbox.element.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
        );

        const image = lightbox.element.querySelector(".mb-lightbox__image") as HTMLElement;
        expect(image.style.transform).toContain("translate(0px, 0px)");
    });
});

describe("the live-region announcement settles rather than spamming", () => {
    it("a rapid run of zoom changes produces exactly one announcement, after the run settles", () => {
        vi.useFakeTimers();
        const i18n = newI18n();
        lightbox = createLightbox(i18n);
        widePortrait(lightbox);
        const trigger = document.createElement("button");
        document.body.append(trigger);
        lightbox.open({ src: "shot.png", alt: "A capture", name: "Shot", naturalWidth: 400, naturalHeight: 300 }, trigger);

        const status = lightbox.element.querySelector(".mb-lightbox__status") as HTMLElement;
        const textAfterOpen = status.textContent;

        const zoomIn = lightbox.element.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!;
        for (let i = 0; i < 6; i += 1) {
            zoomIn.click();
            vi.advanceTimersByTime(50); // faster than the debounce window between each press
        }
        // Nothing has been announced yet: the run has not settled.
        expect(status.textContent).toBe(textAfterOpen);

        vi.advanceTimersByTime(500); // past the debounce window with no further presses
        expect(status.textContent).not.toBe(textAfterOpen);
        expect(status.textContent).toContain(`${Math.round(lightbox.scale * 100)}`);
    });
});

describe("reduced motion", () => {
    it("neutralises the image's zoom transition under prefers-reduced-motion", () => {
        const rule = /\.mb-lightbox__image\s*\{[^}]*transition:\s*([^;]+);/.exec(cssSource)?.[1] ?? "";
        expect(rule.trim().length).toBeGreaterThan(0); // there is a real transition to disable

        // `[^}]*` between the media query's own opening brace and the nested selector, rather
        // than a lazy `[\s\S]*?`: this file declares the reduced-motion query *twice* (once
        // for `.mb-shot-open__glyph`'s hover affordance, once for the image's zoom
        // transition), and a lazy any-character match anchored on `$` in multiline mode stops
        // at the *first* block's closing brace -- every line end satisfies `$` -- so it silently
        // reports the wrong block's contents instead of failing outright. `[^}]*` cannot cross
        // that first block's own closing brace, which is what makes it find the right one.
        expect(cssSource).toMatch(
            /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.mb-lightbox__image\s*\{[^}]*transition:\s*none/,
        );
    });

    it("never animates opening or closing at all -- there is nothing to disable in the first place", () => {
        // The simplest way to satisfy "no transition on open or close when reduced motion is
        // set" is to have no such transition regardless of the setting: [hidden] is toggled
        // straight to `display: none`, an instant state change rather than a fade this file
        // would then have to remember to neutralise under the media query too.
        const hiddenRule = /\.mb-lightbox\[hidden\]\s*\{([^}]*)\}/.exec(cssSource)?.[1] ?? "";
        expect(hiddenRule).toContain("display: none");
        const lightboxRule = /^\.mb-lightbox\s*\{([^}]*)\}/m.exec(cssSource)?.[1] ?? "";
        expect(lightboxRule).not.toMatch(/transition/);
    });
});

describe("the image is shown uncropped, never cover", () => {
    it("uses object-fit: contain, and never object-fit: cover, anywhere in this file", () => {
        expect(cssSource).toContain("object-fit: contain");
        expect(cssSource).not.toMatch(/object-fit:\s*cover/);
    });
});
