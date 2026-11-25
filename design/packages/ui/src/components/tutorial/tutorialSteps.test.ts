import { describe, expect, it } from "vitest";
import {
    TUTORIAL_STEP_IDS,
    TUTORIAL_STEPS,
    TUTORIAL_TOUR_IDS,
    TUTORIAL_TOURS,
    isTutorialTourId,
    tutorialStepIndex,
} from "./tutorialSteps.js";

describe("the tour's itinerary", () => {
    it("has one step per declared id, in the same order", () => {
        expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual(TUTORIAL_STEP_IDS);
    });

    it("never repeats a step id", () => {
        const ids = TUTORIAL_STEPS.map((step) => step.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("gives every step a real page id and a non-empty CSS selector", () => {
        for (const step of TUTORIAL_STEPS) {
            expect(step.pageId.length, step.id).toBeGreaterThan(0);
            expect(step.anchor.length, step.id).toBeGreaterThan(0);
            // Every anchor here is a `data-tutorial-anchor` attribute selector - see the
            // module's own header for why an invented class or id is not used instead.
            expect(step.anchor, step.id).toContain("data-tutorial-anchor=");
        }
    });

    it("covers the genuine first-run path: welcome, the wizard, finding a world, rendering, opening the result, publishing, and where to find this again", () => {
        expect(TUTORIAL_STEP_IDS).toEqual([
            "welcome",
            "makeAMap",
            "findWorld",
            "rendering",
            "openMap",
            "publish",
            "wrapUp",
        ]);
    });

    it("declares every tour, each with a real, anchored step list", () => {
        expect(Object.keys(TUTORIAL_TOURS).sort()).toEqual([...TUTORIAL_TOUR_IDS].sort());
        for (const tour of TUTORIAL_TOUR_IDS) {
            const steps = TUTORIAL_TOURS[tour];
            for (const step of steps) {
                expect(step.pageId.length, `${tour}/${step.id}`).toBeGreaterThan(0);
                expect(step.anchor, `${tour}/${step.id}`).toContain("data-tutorial-anchor=");
            }
            expect(new Set(steps.map((step) => step.id)).size, tour).toBe(steps.length);
        }
    });

    it("gives every destination tour between two and four steps", () => {
        for (const tour of TUTORIAL_TOUR_IDS) {
            if (tour === "overall") continue;
            expect(TUTORIAL_TOURS[tour].length, tour).toBeGreaterThanOrEqual(2);
            expect(TUTORIAL_TOURS[tour].length, tour).toBeLessThanOrEqual(4);
        }
    });

    it("covers Home, Map, Work, Make a map, Projects, Publish, the general tools tab and Settings", () => {
        expect([...TUTORIAL_TOUR_IDS]).toEqual([
            "overall",
            "home",
            "map",
            "work",
            "world",
            "projects",
            "pages",
            "toolkit",
            "settings",
        ]);
    });

    it("isTutorialTourId accepts only declared tours", () => {
        expect(isTutorialTourId("map")).toBe(true);
        expect(isTutorialTourId("nope")).toBe(false);
        expect(isTutorialTourId(3)).toBe(false);
    });

    it("tutorialStepIndex finds each step at its real position", () => {
        TUTORIAL_STEPS.forEach((step, index) => {
            expect(tutorialStepIndex(step.id)).toBe(index);
        });
    });
});
