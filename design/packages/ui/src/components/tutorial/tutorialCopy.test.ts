import { describe, expect, it } from "vitest";
import { TUTORIAL_STEPS, TUTORIAL_TOUR_IDS, TUTORIAL_TOURS } from "./tutorialSteps.js";
import {
    tutorialLaunchTourLabel,
    tutorialMissingText,
    tutorialProgressText,
    tutorialRevealLabel,
    tutorialStepBody,
    tutorialStepTitle,
    tutorialTourHeading,
    tutorialTourName,
    type Translate,
} from "./tutorialCopy.js";

/** A `t` that behaves exactly like vue-i18n's fallback path: no catalogue, so the English
 * fallback wins, with named placeholders substituted the way `voiceMessages` would. */
const passthrough: Translate = ((key: string, second: unknown, third?: string) => {
    if (typeof second === "string") return second;
    const fallback = third ?? "";
    const named = (second ?? {}) as Record<string, unknown>;
    return fallback.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in named ? String(named[name]) : match,
    );
}) as Translate;

describe("tutorialStepTitle", () => {
    it("returns real, distinct, non-empty prose for every declared step", () => {
        const titles = TUTORIAL_STEPS.map((step) => tutorialStepTitle(step.id, passthrough));
        for (const title of titles) expect(title.length).toBeGreaterThan(0);
        expect(new Set(titles).size).toBe(titles.length);
    });
});

describe("tutorialStepBody", () => {
    it("returns real, distinct, non-empty prose for every declared step", () => {
        const bodies = TUTORIAL_STEPS.map((step) => tutorialStepBody(step.id, passthrough));
        for (const body of bodies) expect(body.length).toBeGreaterThan(0);
        expect(new Set(bodies).size).toBe(bodies.length);
    });
});

/** Every step id any tour uses, each once. */
const EVERY_STEP_ID = [
    ...new Set(Object.values(TUTORIAL_TOURS).flatMap((steps) => steps.map((step) => step.id))),
];

describe("every tour's copy", () => {
    it("has a distinct non-empty title and body for every step any tour uses", () => {
        const titles = EVERY_STEP_ID.map((id) => tutorialStepTitle(id, passthrough));
        const bodies = EVERY_STEP_ID.map((id) => tutorialStepBody(id, passthrough));
        for (const text of [...titles, ...bodies]) expect(text.length).toBeGreaterThan(0);
        expect(new Set(titles).size).toBe(titles.length);
        expect(new Set(bodies).size).toBe(bodies.length);
    });

    it("names every tour, distinctly", () => {
        const names = TUTORIAL_TOUR_IDS.map((id) => tutorialTourName(id, passthrough));
        for (const name of names) expect(name.length).toBeGreaterThan(0);
        expect(new Set(names).size).toBe(names.length);
    });

    it("builds the card heading and the launch label around the tour name", () => {
        expect(tutorialTourHeading("Map", passthrough)).toBe("Tour: Map");
        expect(tutorialLaunchTourLabel("Map", passthrough)).toBe("Take a tour: Map");
    });

    it("words the missing-control message differently after a reveal attempt", () => {
        const first = tutorialMissingText(false, passthrough);
        const second = tutorialMissingText(true, passthrough);
        expect(first.length).toBeGreaterThan(0);
        expect(second).not.toBe(first);
        expect(tutorialRevealLabel(passthrough)).toBe("Show it");
    });
});

describe("tutorialProgressText", () => {
    it("interpolates the step number and the step count", () => {
        expect(tutorialProgressText(3, 7, passthrough)).toBe("Step 3 of 7.");
    });
});
