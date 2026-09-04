/**
 * Every one of these is a way the gate could fail *open*, which is the only
 * direction that matters. Neutral wording in a private repository is a missed
 * nicety; private wording in a public one cannot be taken back.
 */

import { describe, expect, it } from "vitest";

import {
    VISIBILITY_FRESHNESS_MS,
    decideWording,
    describeDecision,
    type ConsentTarget,
    type PrivateWordingConsent,
    type VisibilityReading,
} from "./privateWordingConsent.js";

const NOW = 1_700_000_000_000;
const TARGET: ConsentTarget = { owner: "an-owner", repo: "a-repo" };

const consent = (over: Partial<PrivateWordingConsent> = {}): PrivateWordingConsent => ({
    target: TARGET,
    grantedAt: NOW - 1_000,
    holdsForMs: 600_000,
    ...over,
});

const visible = (over: Partial<VisibilityReading> = {}): VisibilityReading => ({
    target: TARGET,
    isPrivate: true,
    readAt: NOW - 1_000,
    ...over,
});

const decide = (
    c: PrivateWordingConsent | null,
    v: VisibilityReading | null,
    target: ConsentTarget = TARGET,
) => decideWording({ target, consent: c, visibility: v, now: NOW });

describe("private wording is only ever written on purpose", () => {
    it("writes it when the person agreed and the repository is private right now", () => {
        expect(decide(consent(), visible()).wording).toBe("private");
    });

    it("refuses by default, with nothing configured at all", () => {
        // The shipped state. A gate whose default was the permissive one would be a
        // gate nobody had to defeat.
        expect(decide(null, null).wording).toBe("neutral");
    });

    it("refuses when the repository is public, however clear the agreement was", () => {
        const decision = decide(consent(), visible({ isPrivate: false }));
        expect(decision.wording).toBe("neutral");
        expect(decision.wording === "neutral" && decision.because).toMatch(/public/);
    });

    it("refuses when nobody agreed, however private the repository is", () => {
        // Private is a property of the repository; consent is a decision by a person.
        // Reading one off the other decides on somebody's behalf what they wanted said.
        expect(decide(null, visible()).wording).toBe("neutral");
    });

    it("refuses when the visibility could not be read", () => {
        const decision = decide(consent(), null);
        expect(decision.wording).toBe("neutral");
        expect(decision.wording === "neutral" && decision.because).toMatch(/could not be read/);
    });

    it("refuses a stale visibility reading rather than trusting it", () => {
        // The case the whole freshness window exists for: agreed on Monday for a private
        // repository, flipped public on Tuesday, rendering on Wednesday.
        const decision = decide(consent(), visible({ readAt: NOW - VISIBILITY_FRESHNESS_MS - 1 }));
        expect(decision.wording).toBe("neutral");
        expect(decision.wording === "neutral" && decision.because).toMatch(/too old/);
    });

    it("refuses a reading from the future, because that is a broken clock", () => {
        expect(decide(consent(), visible({ readAt: NOW + 5_000 })).wording).toBe("neutral");
    });

    it("refuses once the agreement has expired", () => {
        const decision = decide(
            consent({ grantedAt: NOW - 10_000, holdsForMs: 5_000 }),
            visible(),
        );
        expect(decision.wording).toBe("neutral");
    });

    it("does not let an agreement for one repository cover another", () => {
        // The failure that would make this feature dangerous: one yes becoming standing
        // permission across an account.
        const other = { owner: "an-owner", repo: "a-different-repo" };
        const decision = decideWording({
            target: other,
            consent: consent(),
            visibility: visible({ target: other }),
            now: NOW,
        });
        expect(decision.wording).toBe("neutral");
        expect(decision.wording === "neutral" && decision.because).toMatch(/a-different-repo/);
    });

    it("does not let a reading of one repository vouch for another", () => {
        const decision = decideWording({
            target: TARGET,
            consent: consent(),
            visibility: visible({ target: { owner: "an-owner", repo: "somewhere-else" } }),
            now: NOW,
        });
        expect(decision.wording).toBe("neutral");
    });

    it("matches owner and repository case-insensitively, the way forges do", () => {
        // Otherwise an agreement for An-Owner/A-Repo silently stops covering
        // an-owner/a-repo, which fails open on the next call rather than closed.
        const decision = decideWording({
            target: { owner: "AN-OWNER", repo: "A-REPO" },
            consent: consent(),
            visibility: visible(),
            now: NOW,
        });
        expect(decision.wording).toBe("private");
    });

    it("says why it declined, rather than leaving an absence to be noticed", () => {
        const text = describeDecision(decide(consent(), visible({ isPrivate: false })));
        expect(text).toMatch(/neutral wording/);
        expect(text).toMatch(/public/);
    });
});
