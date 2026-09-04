/**
 * Mostly about the properties an implementation gets wrong while looking correct: a master
 * switch wearing five labels, a mode that turns itself on, a dismissal that lasts seconds,
 * and copy that drifts from stating a fact into having an opinion about it.
 */

import { describe, expect, it } from "vitest";

import { Preferences } from "../platform/Preferences.js";
import {
    ADHD_MODES,
    ADHD_MODE_IDS,
    AdhdModes,
    MOMENTUM_QUIET_MS,
} from "./adhdModes.js";

/** Storage that behaves, so these tests are about the modes rather than about a browser. */
function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
        get length() {
            return map.size;
        },
        clear: () => map.clear(),
        getItem: (k) => map.get(k) ?? null,
        key: (i) => [...map.keys()][i] ?? null,
        removeItem: (k) => void map.delete(k),
        setItem: (k, v) => void map.set(k, v),
    } as Storage;
}

const modes = () => new AdhdModes(new Preferences(memoryStorage()));

describe("the ADHD modes", () => {
    it("starts with every mode off", () => {
        // Accommodations, not an opinion about how anybody should read. A mode that switched
        // itself on would have decided something about the visitor on the basis of nothing.
        const m = modes();
        for (const id of ADHD_MODE_IDS) expect(m.isOn(id)).toBe(false);
        expect(m.active).toEqual([]);
    });

    it("turns one on without turning on the others", () => {
        // The whole design. A master switch wearing five labels forces somebody to accept the
        // part that does not suit them, and they respond by turning all of it off.
        const m = modes();
        m.setOn("low-stimulation", true);
        expect(m.isOn("low-stimulation")).toBe(true);
        expect(m.isOn("focus")).toBe(false);
        expect(m.isOn("momentum")).toBe(false);
        expect(m.active).toEqual(["low-stimulation"]);
    });

    it("offers one off switch and no all-on", () => {
        // Somebody wanting their ordinary page back should not hunt five switches. There is
        // deliberately no opposite: switching all five on is not a thing anybody wants.
        const m = modes();
        for (const id of ADHD_MODE_IDS) m.setOn(id, true);
        m.reset();
        expect(m.active).toEqual([]);
        expect("setAllOn" in m).toBe(false);
    });

    it("describes every mode it offers, without naming a condition", () => {
        // A label naming a condition would make switching one on a disclosure to anybody
        // reading over the visitor's shoulder.
        for (const id of ADHD_MODE_IDS) {
            const described = ADHD_MODES[id];
            expect(described.id).toBe(id);
            expect(described.labelFallback.length).toBeGreaterThan(0);
            expect(described.summaryFallback.length).toBeGreaterThan(0);
            expect(`${described.labelFallback} ${described.summaryFallback}`.toLowerCase()).not.toMatch(
                /adhd|attention deficit|disorder|diagnos|symptom/,
            );
        }
    });

    it("promises that Focus hides nothing", () => {
        // The load-bearing half of that mode. A page that makes content disappear is a worse
        // problem than a busy page, and the copy has to say which one this is.
        expect(ADHD_MODES.focus.summaryFallback).toMatch(/Nothing is hidden/);
    });
});

describe("one thing at a time", () => {
    it("keeps the visitor's own words and survives coming back", () => {
        const m = modes();
        m.setNextAction("  finish reading the render page  ");
        expect(m.nextAction).toBe("finish reading the render page");
    });

    it("has none until the visitor sets one, and never guesses", () => {
        // A guess would be one more thing on screen that is subtly wrong. Its whole value is
        // that it is theirs.
        expect(modes().nextAction).toBe(null);
    });

    it("clears back to none", () => {
        const m = modes();
        m.setNextAction("something");
        m.setNextAction(null);
        expect(m.nextAction).toBe(null);
    });
});

describe("time awareness", () => {
    it("states the number and stops", () => {
        // No judgement, no comparison with other days, nothing that reads as a target missed.
        const m = modes();
        const now = 1_000_000_000;
        const sentence = m.elapsedSentence(now - 25 * 60_000, now);
        expect(sentence).toBe("Open for 25 minutes.");
        expect(sentence).not.toMatch(/should|try|still|only|already|great|well done/i);
    });

    it("says less than a minute rather than zero", () => {
        const now = 1_000_000_000;
        expect(modes().elapsedSentence(now - 5_000, now)).toBe("Open for less than a minute.");
    });

    it("counts hours without dropping the minutes", () => {
        const now = 1_000_000_000;
        expect(modes().elapsedSentence(now - 90 * 60_000, now)).toBe(
            "Open for 1 hour and 30 minutes.",
        );
        expect(modes().elapsedSentence(now - 120 * 60_000, now)).toBe("Open for 2 hours.");
    });

    it("never counts backwards", () => {
        // A clock that moved, a tab restored from a session. Negative minutes would be a
        // number nobody can act on.
        const now = 1_000_000_000;
        expect(modes().elapsedSentence(now + 60_000, now)).toBe("Open for less than a minute.");
    });
});

describe("momentum", () => {
    const now = 2_000_000_000;

    it("says nothing while its mode is off", () => {
        expect(modes().momentumDue(now - MOMENTUM_QUIET_MS * 2, now)).toBe(false);
    });

    it("waits for the page to actually be quiet", () => {
        const m = modes();
        m.setOn("momentum", true);
        expect(m.momentumDue(now - MOMENTUM_QUIET_MS + 1000, now)).toBe(false);
        expect(m.momentumDue(now - MOMENTUM_QUIET_MS, now)).toBe(true);
    });

    it("respects a dismissal for the rest of the visit, not for thirty seconds", () => {
        // A "not now" that comes back in half a minute is worse than never asking.
        const m = modes();
        m.setOn("momentum", true);
        m.dismissMomentum(now);
        expect(m.momentumDue(now - MOMENTUM_QUIET_MS * 3, now + 60 * 60 * 1000)).toBe(false);
    });
});

describe("what a surface is handed", () => {
    it("names a class per active mode and nothing for the inactive ones", () => {
        const m = modes();
        m.setOn("focus", true);
        m.setOn("time-awareness", true);
        expect(m.bodyClasses()).toEqual(["adhd-focus", "adhd-time-awareness"]);
    });

    it("tells a listener when anything changes", () => {
        const m = modes();
        let changes = 0;
        const stop = m.onChange(() => (changes += 1));
        m.setOn("focus", true);
        m.setNextAction("x");
        stop();
        m.setOn("momentum", true);
        expect(changes).toBe(2);
    });
});
