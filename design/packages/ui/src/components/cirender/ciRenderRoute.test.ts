/**
 * The render and hosting route pickers.
 *
 * The assertions worth reading twice are about coverage rather than behaviour, because
 * what actually breaks here is a route or a reason added without its copy - which renders
 * a raw id at somebody in the middle of a settings screen and looks like a crash.
 *
 * **Every reason has a literal catalogue key.** Written out one at a time in the source,
 * never interpolated from the id, because the catalogue's coverage test finds keys by
 * reading source text - a key that only exists as a runtime string is one it reports as
 * translating nothing.
 *
 * **Every route is describable.** A route id with no description is one the picker renders
 * blank.
 *
 * **Unmeasured is not unavailable.** `ready: null` and `ready: false` mean different
 * things, and collapsing them turns "we could not check" into a claim nobody verified.
 */

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
    CI_HOSTING_ROUTE_IDS,
    CI_RENDER_ROUTE_IDS,
    UNMEASURED,
    defaultRenderRoute,
    describeHostingRoute,
    describeRenderRoute,
    hostingReasonCopyKey,
    renderReasonCopyKey,
    renderRouteFix,
} from "./ciRenderRoute.js";
import type { CiHostingRouteReason, CiRenderRouteReason } from "./ciRenderRoute.js";

const RENDER_REASONS: readonly CiRenderRouteReason[] = [
    "gh-unsupported",
    "gh-signed-out",
    "aws-unsupported",
    "aws-cli-missing",
    "aws-signed-out",
    "aws-no-profile",
    "aws-no-region",
    "aws-not-provisioned",
];

const HOSTING_REASONS: readonly CiHostingRouteReason[] = [
    "pages-unsupported",
    "pages-signed-out",
    "cloudfront-unsupported",
    "cloudfront-not-provisioned",
    "local-unsupported",
    "local-not-running",
    "no-cloudflare-token",
    "cloudflared-missing",
    "zone-not-owned",
    "tunnel-disconnected",
];

describe("render routes", () => {
    it("describes every route it offers", () => {
        for (const id of CI_RENDER_ROUTE_IDS) {
            const description = describeRenderRoute(defaultRenderRoute(id));
            expect(description.id).toBe(id);
            expect(description.labelFallback.length).toBeGreaterThan(0);
            expect(description.summaryFallback.length).toBeGreaterThan(0);
        }
    });

    it("says a route points at nothing rather than inventing a placeholder", () => {
        // "not chosen yet" is the surface's job to say, in its own words and its own
        // language. A placeholder here would read as a real repository or a real profile.
        expect(describeRenderRoute(defaultRenderRoute("github-actions")).detail).toBeNull();
        expect(describeRenderRoute(defaultRenderRoute("aws-batch")).detail).toBeNull();
    });

    it("carries the concrete thing a route is pointed at once it is", () => {
        expect(
            describeRenderRoute({ kind: "github-actions", owner: "acme", repo: "maps" }).detail,
        ).toBe("acme/maps");
        expect(
            describeRenderRoute({
                kind: "aws-batch",
                profile: "render",
                region: "eu-west-2",
                bucket: "b",
            }).detail,
        ).toBe("render · eu-west-2");
    });

    it("gives every reason a catalogue key", () => {
        for (const reason of RENDER_REASONS) {
            expect(renderReasonCopyKey(reason)).toBe(`ciRenderRoute.reason.${reason}`);
        }
    });

    it("offers no fix where no button could help", () => {
        // A build compiled without a channel does not grow one because somebody pressed a
        // button, and an action that cannot work is worse than none.
        expect(renderRouteFix("gh-unsupported")).toBeNull();
        expect(renderRouteFix("aws-unsupported")).toBeNull();
        expect(renderRouteFix("aws-cli-missing")).toBe("install-aws-cli");
        expect(renderRouteFix("aws-not-provisioned")).toBe("provision-aws");
    });
});

describe("hosting routes", () => {
    it("describes every route it offers", () => {
        for (const id of CI_HOSTING_ROUTE_IDS) {
            const description = describeHostingRoute(id);
            expect(description.id).toBe(id);
            expect(description.labelFallback.length).toBeGreaterThan(0);
            expect(description.summaryFallback.length).toBeGreaterThan(0);
        }
    });

    it("gives every reason a catalogue key", () => {
        for (const reason of HOSTING_REASONS) {
            expect(hostingReasonCopyKey(reason)).toBe(`ciHostingRoute.reason.${reason}`);
        }
    });

    it("says plainly which routes cost money and which do not", () => {
        // Somebody choosing between these is choosing whether to be billed, so the one
        // sentence they read has to say so rather than describing speed or features.
        expect(describeHostingRoute("github-pages").summaryFallback).toMatch(/no bill/i);
        expect(describeHostingRoute("aws-cloudfront").summaryFallback).toMatch(/you pay/i);
    });
});

describe("copy keys in the source", () => {
    it("writes every key out literally, never interpolated from an id", async () => {
        const source = await readFile(new URL("./ciRenderRoute.ts", import.meta.url), "utf8");

        // The reason this matters: the catalogue coverage test finds keys by reading
        // source text. A key built as `ciRenderRoute.reason.${id}` would be invisible to
        // it, so the day somebody deletes one of those sentences nothing reports it and
        // the picker renders a raw id at a person.
        for (const reason of RENDER_REASONS) {
            expect(source).toContain(`"ciRenderRoute.reason.${reason}"`);
        }
        for (const reason of HOSTING_REASONS) {
            expect(source).toContain(`"ciHostingRoute.reason.${reason}"`);
        }

        // And no template ever builds one.
        expect(source).not.toMatch(/`ciRenderRoute\.[a-z]+\.\$\{/);
        expect(source).not.toMatch(/`ciHostingRoute\.[a-z]+\.\$\{/);
    });
});

describe("readiness", () => {
    it("keeps unmeasured distinct from unavailable", () => {
        // A probe that threw has told us nothing. Rendering that as "unavailable" is a
        // claim nobody checked, and it sends somebody off to fix a working setup.
        expect(UNMEASURED.ready).toBeNull();
        expect(UNMEASURED.ready).not.toBe(false);
    });
});
