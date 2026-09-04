/**
 * The route model, and mostly the Amazon one.
 *
 * Every other route here is free at rest. This one is not, which changes what the model
 * owes a person: it has to be offered last, it has to say the cost where the choice is
 * made, and its two not-ready states have to stay apart, because signing in is free and
 * provisioning is not and offering the wrong one costs real money.
 */

import { describe, expect, it } from "vitest";

import {
    CHUNKER_ROUTE_IDS,
    checkAllRoutes,
    checkRoute,
    defaultRouteFor,
    describeRoute,
    fixFor,
    unprobedFacts,
    type ChunkerRouteFacts,
} from "./chunkerRoute.js";

const facts = (over: Partial<ChunkerRouteFacts["aws"]> = {}): ChunkerRouteFacts => ({
    ...unprobedFacts(),
    aws: { supported: true, signedIn: true, provisioned: true, region: "eu-west-2", ...over },
});

describe("the route list", () => {
    it("offers Amazon last", () => {
        // Cheapest and nearest first, and the one that bills is furthest from the top. A
        // person reaching for the first radio should not be reaching for a bill.
        expect(CHUNKER_ROUTE_IDS[CHUNKER_ROUTE_IDS.length - 1]).toBe("aws");
    });

    it("has a default for every route it offers", () => {
        // A route in the list with no default is a picker that throws when somebody picks
        // it, which is a state only a click finds.
        for (const id of CHUNKER_ROUTE_IDS) {
            expect(defaultRouteFor(id).kind).toBe(id);
        }
    });

    it("describes every route it offers", () => {
        for (const id of CHUNKER_ROUTE_IDS) {
            const described = describeRoute(defaultRouteFor(id));
            expect(described.id).toBe(id);
            expect(described.labelFallback.length).toBeGreaterThan(0);
        }
    });

    it("judges every route it offers", () => {
        expect(checkAllRoutes(unprobedFacts()).map((r) => r.id)).toEqual([...CHUNKER_ROUTE_IDS]);
    });
});

describe("the Amazon route", () => {
    it("says the cost where the choice is made", () => {
        // Not on a later screen and not on the bill. Someone weighing this against a free
        // route cannot weigh it unless the difference is written here.
        const described = describeRoute({ kind: "aws", region: "eu-west-2" });
        expect(described.summaryFallback).toMatch(/costs money/);
    });

    it("reports the region, because that is what the bill will say", () => {
        expect(describeRoute({ kind: "aws", region: "eu-west-2" }).detail).toBe("eu-west-2");
        expect(describeRoute({ kind: "aws", region: null }).detail).toBe(null);
    });

    it("is ready only when signed in and provisioned", () => {
        expect(checkRoute("aws", facts()).ready).toBe(true);
    });

    it("keeps signed-out and unprovisioned apart", () => {
        // The whole reason they are two states. Offering "set up AWS resources" to somebody
        // who is merely signed out would create billable resources to solve a free problem.
        const out = checkRoute("aws", facts({ signedIn: false }));
        const bare = checkRoute("aws", facts({ provisioned: false }));
        expect(out.ready === false && out.reason).toBe("aws-signed-out");
        expect(bare.ready === false && bare.reason).toBe("aws-not-provisioned");
        expect(fixFor("aws-signed-out")).toBe("sign-in-aws");
        expect(fixFor("aws-not-provisioned")).toBe("provision-aws");
    });

    it("treats an unanswerable question as not ready, never as ready", () => {
        // Null is "could not ask", and the safe reading of that is not-ready. Reading it as
        // ready would start a conversion that refuses several gigabytes later.
        expect(checkRoute("aws", facts({ signedIn: null })).ready).toBe(false);
        expect(checkRoute("aws", facts({ provisioned: null })).ready).toBe(false);
    });

    it("offers no button when the build has no AWS at all", () => {
        // Nothing in the app fixes a missing surface, and a button that cannot work is
        // worse than a sentence explaining why there is none.
        const none = checkRoute("aws", facts({ supported: false }));
        expect(none.ready === false && none.reason).toBe("aws-unsupported");
        expect(none.ready === false && none.fix).toBe(null);
    });

    it("is not ready in a build that has probed nothing", () => {
        expect(checkRoute("aws", unprobedFacts()).ready).toBe(false);
    });
});
