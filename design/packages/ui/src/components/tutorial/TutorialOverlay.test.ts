// @vitest-environment jsdom

/**
 * The overlay itself: opening on request, the four controls, focus, persistence and the one
 * real auto-advance signal. `tutorialAnchors.test.ts` next door proves the step list's own
 * selectors resolve against the real shell; this file mounts the overlay in isolation against
 * stand-in anchors, because what is under test here is the overlay's own behaviour rather than
 * the rest of the application.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import TutorialOverlay from "./TutorialOverlay.vue";
import { requestTutorialLaunch, resetTutorialLaunchRequests } from "./tutorialLaunch.js";
import { emitTutorialSignal, resetTutorialSignals } from "./tutorialSignals.js";
import { tutorialCompleted } from "./tutorialController.js";
import { TUTORIAL_STEPS, TUTORIAL_TOURS } from "./tutorialSteps.js";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";

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

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        locale: "en",
        fallbackLocale: "en",
        missingWarn: false,
        fallbackWarn: false,
        messages: { en: {} },
    });
}

/** One stand-in element per real anchor selector `TUTORIAL_STEPS` names, plus a focusable
 * control outside the overlay so focus-restoration has somewhere real to return to. */
function anchorName(selector: string): string | null {
    return /\[data-tutorial-anchor="([^"]+)"\]/.exec(selector)?.[1] ?? null;
}

function addMarker(name: string): void {
    const marker = document.createElement("div");
    marker.setAttribute("data-tutorial-anchor", name);
    marker.style.position = "fixed";
    marker.tabIndex = -1;
    document.body.appendChild(marker);
}

/** Stand-ins for every anchor any tour names, optionally leaving one out. */
function installStandInAnchors(omit: string | null = null): HTMLButtonElement {
    const names = new Set<string>();
    for (const step of Object.values(TUTORIAL_TOURS).flat()) {
        const name = anchorName(step.anchor);
        if (name !== null && name !== omit) names.add(name);
    }
    for (const name of names) addMarker(name);
    const launcher = document.createElement("button");
    launcher.textContent = "open the tour";
    document.body.appendChild(launcher);
    return launcher;
}

let wrapper: VueWrapper | null = null;
let revealPage: ReturnType<typeof vi.fn>;

function open(reveal?: (pageId: string) => void): VueWrapper {
    revealPage = vi.fn(reveal);
    wrapper = mount(TutorialOverlay, {
        props: { revealPage },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
    return wrapper;
}

async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
        await nextTick();
        await Promise.resolve();
    }
}

function dialog(): HTMLElement | null {
    return document.querySelector('[role="dialog"].mb-tutorial__card');
}

function clickButton(label: string): void {
    const buttons = [...document.querySelectorAll("button")];
    const match = buttons.find((btn) => btn.textContent?.trim() === label);
    if (match === undefined) throw new Error(`no button labelled "${label}"`);
    match.click();
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
    resetTutorialLaunchRequests();
    resetTutorialSignals();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

describe("opening on request", () => {
    it("renders nothing until asked to open", () => {
        installStandInAnchors();
        open();

        expect(dialog()).toBeNull();
    });

    it("opens on requestTutorialLaunch(), on step one", async () => {
        installStandInAnchors();
        open();

        requestTutorialLaunch();
        await settle();

        expect(dialog()).not.toBeNull();
        expect(dialog()?.textContent).toContain("Step 1 of");
    });

    it("asks the shell to reveal the first step's page", async () => {
        installStandInAnchors();
        open();

        requestTutorialLaunch();
        await settle();

        expect(revealPage).toHaveBeenCalledWith(TUTORIAL_STEPS[0]?.pageId);
    });
});

describe("progress, and the four controls", () => {
    it("shows step N of M and it advances on Next", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        expect(dialog()?.textContent).toContain(`Step 1 of ${TUTORIAL_STEPS.length}`);

        clickButton("Next");
        await settle();

        expect(dialog()?.textContent).toContain(`Step 2 of ${TUTORIAL_STEPS.length}`);
        expect(revealPage).toHaveBeenCalledWith(TUTORIAL_STEPS[1]?.pageId);
    });

    it("Back is disabled on the first step and works after advancing", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        const backButtons = [...document.querySelectorAll("button")].filter(
            (btn) => btn.textContent?.trim() === "Back",
        );
        expect(backButtons[0]?.disabled).toBe(true);

        clickButton("Next");
        await settle();
        clickButton("Back");
        await settle();

        expect(dialog()?.textContent).toContain("Step 1 of");
    });

    it("Skip this step moves forward exactly like Next", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        clickButton("Skip this step");
        await settle();

        expect(dialog()?.textContent).toContain("Step 2 of");
    });

    it("the exit control is always present and closes the tour without completing it", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        const exitButton = document.querySelector<HTMLButtonElement>(".mb-tutorial__exit");
        expect(exitButton).not.toBeNull();
        exitButton?.click();
        await settle();

        expect(dialog()).toBeNull();
        expect(tutorialCompleted()).toBe(false);
    });

    it("the last step's button reads Finish and completes the tour", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) {
            clickButton("Next");
            await settle();
        }

        expect(dialog()?.textContent).toContain("Finish");
        clickButton("Finish");
        await settle();

        expect(dialog()).toBeNull();
        expect(tutorialCompleted()).toBe(true);
    });
});

describe("keyboard: Escape exits", () => {
    it("Escape on the card closes the tour", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        const card = dialog();
        expect(card).not.toBeNull();
        card?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        expect(dialog()).toBeNull();
    });
});

describe("focus management", () => {
    it("moves focus to the card when a step becomes active", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        expect(document.activeElement).toBe(dialog());
    });

    it("restores focus to the control that launched it, on exit", async () => {
        const launcher = installStandInAnchors();
        open();
        launcher.focus();
        expect(document.activeElement).toBe(launcher);

        requestTutorialLaunch();
        await settle();
        expect(document.activeElement).not.toBe(launcher);

        const exitButton = document.querySelector<HTMLButtonElement>(".mb-tutorial__exit");
        exitButton?.click();
        await settle();

        expect(document.activeElement).toBe(launcher);
    });

    it("restores focus on completion too, not only on explicit exit", async () => {
        const launcher = installStandInAnchors();
        open();
        launcher.focus();

        requestTutorialLaunch();
        await settle();
        for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) {
            clickButton("Next");
            await settle();
        }
        clickButton("Finish");
        await settle();

        expect(document.activeElement).toBe(launcher);
    });
});

describe("completion persists, and it does not reappear on its own", () => {
    it("a completed tour does not reopen itself on a later mount", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();
        for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) {
            clickButton("Next");
            await settle();
        }
        clickButton("Finish");
        await settle();
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = "";

        // A fresh mount - the app restarting - must not show the tour on its own. Nothing
        // calls requestTutorialLaunch() here at all.
        installStandInAnchors();
        open();
        await settle();

        expect(dialog()).toBeNull();
    });

    it("is relaunchable afterwards, restarting at step one", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();
        for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) {
            clickButton("Next");
            await settle();
        }
        clickButton("Finish");
        await settle();

        requestTutorialLaunch();
        await settle();

        expect(dialog()).not.toBeNull();
        expect(dialog()?.textContent).toContain("Step 1 of");
    });
});

describe("reduced motion", () => {
    const realMatchMedia = globalThis.matchMedia;

    afterEach(() => {
        globalThis.matchMedia = realMatchMedia;
    });

    it("scrolls the anchor into view instantly rather than smoothly when the platform asks for reduced motion", async () => {
        globalThis.matchMedia = ((query: string) => ({
            matches: query.includes("prefers-reduced-motion"),
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        })) as unknown as typeof globalThis.matchMedia;

        const scrolls: (ScrollIntoViewOptions | boolean | undefined)[] = [];
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function scrollIntoView(
            opts?: ScrollIntoViewOptions | boolean,
        ) {
            scrolls.push(opts);
        };

        try {
            installStandInAnchors();
            open();
            requestTutorialLaunch();
            await settle();

            expect(scrolls.length).toBeGreaterThan(0);
            for (const call of scrolls) {
                expect(typeof call === "object" ? call.behavior : call).not.toBe("smooth");
            }
        } finally {
            Element.prototype.scrollIntoView = original;
        }
    });

    it("scrolls smoothly when the platform has no reduced-motion preference", async () => {
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

        const scrolls: (ScrollIntoViewOptions | boolean | undefined)[] = [];
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function scrollIntoView(
            opts?: ScrollIntoViewOptions | boolean,
        ) {
            scrolls.push(opts);
        };

        try {
            installStandInAnchors();
            open();
            requestTutorialLaunch();
            await settle();

            expect(scrolls.length).toBeGreaterThan(0);
            expect(scrolls.some((call) => typeof call === "object" && call.behavior === "smooth")).toBe(
                true,
            );
        } finally {
            Element.prototype.scrollIntoView = original;
        }
    });
});

describe("a named destination tour", () => {
    it("opens the tour that was asked for, naming it, with its own step count", async () => {
        installStandInAnchors();
        open();

        requestTutorialLaunch("map");
        await settle();

        expect(dialog()?.getAttribute("data-tour")).toBe("map");
        expect(dialog()?.textContent).toContain(`Step 1 of ${TUTORIAL_TOURS.map.length}`);
        expect(dialog()?.textContent).toContain("Tour: Map");
        expect(revealPage).toHaveBeenCalledWith("map");
    });

    it("finishing a destination tour closes it without completing the overall tour", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch("pages");
        await settle();

        for (let i = 0; i < TUTORIAL_TOURS.pages.length - 1; i++) {
            clickButton("Next");
            await settle();
        }
        clickButton("Finish");
        await settle();

        expect(dialog()).toBeNull();
        expect(tutorialCompleted()).toBe(false);
    });

    it("asking for another tour while one is open swaps to the new one at its first step", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch("home");
        await settle();
        clickButton("Next");
        await settle();

        requestTutorialLaunch("settings");
        await settle();

        expect(dialog()?.getAttribute("data-tour")).toBe("settings");
        expect(dialog()?.textContent).toContain(`Step 1 of ${TUTORIAL_TOURS.settings.length}`);
        expect(revealPage).toHaveBeenLastCalledWith("settings");
    });

    it("resumes where it stopped after the whole overlay is remounted", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch("home");
        await settle();
        clickButton("Next");
        await settle();
        clickButton("Next");
        await settle();
        expect(dialog()?.textContent).toContain(`Step 3 of ${TUTORIAL_TOURS.home.length}`);

        // The app restarting: same storage, a brand new overlay.
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = "";
        installStandInAnchors();
        open();
        expect(dialog()).toBeNull();

        requestTutorialLaunch("home");
        await settle();

        expect(dialog()?.textContent).toContain(`Step 3 of ${TUTORIAL_TOURS.home.length}`);
    });
});

describe("keyboard", () => {
    function press(key: string, init: KeyboardEventInit = {}): void {
        dialog()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
    }

    it("Right moves to the next step and Left moves back", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        press("ArrowRight");
        await settle();
        expect(dialog()?.textContent).toContain("Step 2 of");

        press("ArrowLeft");
        await settle();
        expect(dialog()?.textContent).toContain("Step 1 of");
    });

    it("Left on the first step stays on the first step", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        press("ArrowLeft");
        await settle();

        expect(dialog()?.textContent).toContain("Step 1 of");
    });

    it("modified arrows are left to the browser and screen reader", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        press("ArrowRight", { altKey: true });
        press("ArrowRight", { ctrlKey: true });
        await settle();

        expect(dialog()?.textContent).toContain("Step 1 of");
    });

    it("Escape closes the tour even when focus has moved out of the card", async () => {
        const launcher = installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        launcher.focus();
        launcher.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        expect(dialog()).toBeNull();
    });
});

describe("announcing the step", () => {
    it("puts the counter, the tour name and the step title in one polite live region", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch("map");
        await settle();

        const live = dialog()?.querySelector('[aria-live="polite"]');
        expect(live).not.toBeNull();
        expect(live?.textContent).toContain("Step 1 of 2");
        expect(live?.textContent).toContain("Tour: Map");
        expect(live?.textContent).toContain("The Map button");
    });

    it("names its title, progress and body for assistive technology", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch("home");
        await settle();

        const card = dialog();
        expect(card?.getAttribute("aria-labelledby")).toBeTruthy();
        expect(card?.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
    });
});

describe("a step whose control is not on screen", () => {
    /** A page that only shows its control once the shell has been asked to reveal it. */
    function revealOnRequest(state: { works: boolean }) {
        return (pageId: string): void => {
            if (pageId === "toolkit" && state.works) {
                if (document.querySelector('[data-tutorial-anchor="tools-list"]') === null) {
                    addMarker("tools-list");
                }
            }
        };
    }

    async function toMissingStep(state: { works: boolean }): Promise<void> {
        installStandInAnchors("tools-list");
        open(revealOnRequest(state));
        requestTutorialLaunch("toolkit");
        await settle();
        clickButton("Next");
        await settle();
    }

    it("says so on the card and offers a button that reveals it", async () => {
        const state = { works: false };
        await toMissingStep(state);

        expect(dialog()?.textContent).toContain("not showing right now");
        expect(dialog()?.textContent).toContain("Show it");
        // The ring points at nothing rather than at a stale rectangle.
        const ring = document.querySelector<HTMLElement>(".mb-tutorial__highlight");
        expect(ring?.style.display).toBe("none");
    });

    it("the reveal button shows the control and the card drops the message", async () => {
        const state = { works: false };
        await toMissingStep(state);

        state.works = true;
        clickButton("Show it");
        await settle();

        expect(revealPage).toHaveBeenLastCalledWith("toolkit");
        expect(document.querySelector('[data-tutorial-anchor="tools-list"]')).not.toBeNull();
        expect(dialog()?.textContent).not.toContain("not showing right now");
        expect(dialog()?.textContent).not.toContain("Show it");
        const ring = document.querySelector<HTMLElement>(".mb-tutorial__highlight");
        expect(ring?.style.display).not.toBe("none");
    });

    it("says so plainly when revealing did not help", async () => {
        const state = { works: false };
        await toMissingStep(state);

        clickButton("Show it");
        await settle();

        expect(dialog()?.textContent).toContain("Still not showing");
        expect(dialog()?.textContent).toContain("Show it");
    });

    it("treats a control hidden with display none as missing", async () => {
        installStandInAnchors();
        const hiddenParent = document.createElement("div");
        hiddenParent.style.display = "none";
        const list = document.querySelector('[data-tutorial-anchor="tools-list"]');
        list?.remove();
        const hiddenList = document.createElement("div");
        hiddenList.setAttribute("data-tutorial-anchor", "tools-list");
        hiddenParent.appendChild(hiddenList);
        document.body.appendChild(hiddenParent);
        open();
        requestTutorialLaunch("toolkit");
        await settle();
        clickButton("Next");
        await settle();

        expect(dialog()?.textContent).toContain("not showing right now");
    });

    it("Back still works from a missing step", async () => {
        const state = { works: false };
        await toMissingStep(state);

        clickButton("Back");
        await settle();

        expect(dialog()?.textContent).toContain("Step 1 of 2");
        expect(dialog()?.textContent).not.toContain("not showing right now");
    });
});

describe("motion and contrast", () => {
    const source = readFileSync(resolve(__dirname, "TutorialOverlay.vue"), "utf8");

    it("stills the ring animation and the card transition under reduced motion", () => {
        const block = /@media \(prefers-reduced-motion: reduce\) \{[^}]*\{[^}]*\}[^}]*\}/.exec(source);
        expect(block?.[0]).toContain("animation: none");
        expect(block?.[0]).toContain("transition: none");
    });

    it("keeps the ring and the card edge visible in forced colours", () => {
        const start = source.indexOf("@media (forced-colors: active)");
        expect(start).toBeGreaterThan(-1);
        const block = source.slice(start);
        expect(block).toContain("outline: 3px solid Highlight");
        expect(block).toContain("border: 2px solid CanvasText");
    });
});

describe("advancing on the real signal, not only on Next", () => {
    it("the findWorld step advances itself when world-chosen fires", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();
        // Step 1: welcome. Step 2: makeAMap. Step 3: findWorld, the one with a signal.
        clickButton("Next");
        await settle();
        clickButton("Next");
        await settle();
        expect(TUTORIAL_STEPS[2]?.id).toBe("findWorld");
        expect(dialog()?.textContent).toContain("Step 3 of");

        emitTutorialSignal("world-chosen");
        await settle();

        expect(dialog()?.textContent).toContain("Step 4 of");
    });

    it("a signal is ignored while the tour is closed", async () => {
        installStandInAnchors();
        open();

        emitTutorialSignal("world-chosen");
        await settle();

        expect(dialog()).toBeNull();
    });

    it("a signal is ignored on a step that is not listening for it", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();
        // Step 1 (welcome) has no signal.
        emitTutorialSignal("world-chosen");
        await settle();

        expect(dialog()?.textContent).toContain("Step 1 of");
    });
});
