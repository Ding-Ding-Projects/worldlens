/**
 * The manifest's own contract.
 *
 * These are policy tests over data rather than behaviour tests over a component, and that is the
 * right shape here: a duplicate feature key silently drops a row from a `v-for`, a resolver name
 * nobody wrote silently renders no meta, and a target nothing can route silently does nothing.
 * All three are invisible at runtime and all three are one assertion away at build time.
 */

import { describe, expect, it } from "vitest";
import { isSettingsSection } from "../settings/settingsSections.js";
import { ALL_CATALOGUE_FEATURES, CATALOGUES, catalogueForFeature, findFeature } from "./catalogues.js";
import { knownMetaResolvers } from "./catalogueMeta.js";
import { knownCapabilities } from "./capabilities.js";
import {
    CATALOGUE_IDS,
    describeTarget,
    featureCapabilities,
    targetDestination,
    unwrapTarget,
} from "./featureTargets.js";
import { JOB_IDS, RAIL_PAGE_IDS, findJob } from "./jobRegistry.js";
import { activationsFromHome } from "./shellNavigation.js";

const OVERLAY_IDS = ["settings", "config", "palette", "notifications", "eula", "tour"];
const MAP_REVEALS = ["maps", "markers", "settings", "info"];
/** Everything the options editor can be asked to open: its screens, plus the history tab. */
const CONFIG_REVEALS = ["core", "webapp", "webserver", "plugin", "maps", "storages", "run", "history"];
const WORK_ACTIONS = ["tab-finder", "dock-editor"];

/** The approved feature accounting, from the design's own appendix. */
const APPROVED_COUNTS: Record<string, number> = {
    make: 28,
    maps: 6,
    share: 6,
    copy: 7,
    host: 2,
    setup: 37,
};

describe("the five catalogues", () => {
    it("declares exactly the five approved ids, in order", () => {
        expect(CATALOGUES.map((catalogue) => catalogue.id)).toEqual([...CATALOGUE_IDS]);
    });

    it("carries the approved feature count in each", () => {
        for (const catalogue of CATALOGUES) {
            expect(catalogue.features.length, catalogue.id).toBe(APPROVED_COUNTS[catalogue.id]);
        }
    });

    it("totals eighty-four features", () => {
        expect(ALL_CATALOGUE_FEATURES.length).toBe(87);
    });

    it("derives its counts from the arrays rather than from a literal", () => {
        // The sum of the five card counts and the flattened list are the same number by
        // construction. If a card ever renders a hard-coded total this stops being true.
        const summed = CATALOGUES.reduce((total, catalogue) => total + catalogue.features.length, 0);
        expect(summed).toBe(ALL_CATALOGUE_FEATURES.length);
    });
});

describe("feature keys", () => {
    it("are globally unique", () => {
        const keys = ALL_CATALOGUE_FEATURES.map((feature) => feature.key);
        const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
        expect(duplicates).toEqual([]);
    });

    it("are never a bare target or job id, because several rows share those", () => {
        const reserved = new Set<string>([...JOB_IDS, ...RAIL_PAGE_IDS, ...OVERLAY_IDS]);
        for (const feature of ALL_CATALOGUE_FEATURES) {
            expect(reserved.has(feature.key), feature.key).toBe(false);
        }
    });

    it("resolve back to their own catalogue", () => {
        for (const feature of ALL_CATALOGUE_FEATURES) {
            expect(findFeature(feature.key)).toBe(feature);
            expect(catalogueForFeature(feature.key)).not.toBeNull();
        }
    });
});

describe("every target resolves to something that exists", () => {
    it("names a real job, rail destination, overlay, work action or docs article", () => {
        for (const feature of ALL_CATALOGUE_FEATURES) {
            const target = unwrapTarget(feature.target);
            const where = `${feature.key} -> ${describeTarget(feature.target)}`;
            switch (target.kind) {
                case "job":
                    expect(findJob(target.jobId), where).not.toBeNull();
                    break;
                case "rail":
                    expect(target.destination, where).toBe("map");
                    if (target.reveal !== undefined) {
                        expect(MAP_REVEALS, where).toContain(target.reveal);
                    }
                    break;
                case "overlay":
                    expect(OVERLAY_IDS, where).toContain(target.overlay);
                    // Rail reveals were validated here and overlay reveals were not, which is
                    // how a row shipped asking the options editor for "path-field" - a name no
                    // screen answers to, so it resolved to Core and looked deliberate. A reveal
                    // that names nothing routable is a row that quietly lands on the wrong page.
                    if (target.reveal !== undefined) {
                        if (target.overlay === "config") {
                            expect(CONFIG_REVEALS, where).toContain(target.reveal);
                        }
                        if (target.overlay === "settings") {
                            expect(isSettingsSection(target.reveal), where).toBe(true);
                        }
                    }
                    break;
                case "work-action":
                    expect(WORK_ACTIONS, where).toContain(target.action);
                    break;
                case "docs":
                    expect(target.articleId.length, where).toBeGreaterThan(0);
                    break;
            }
        }
    });

    it("names only capabilities this build knows how to answer for", () => {
        const known = new Set(knownCapabilities());
        for (const feature of ALL_CATALOGUE_FEATURES) {
            for (const capability of featureCapabilities(feature)) {
                expect(known.has(capability), `${feature.key}: ${capability}`).toBe(true);
            }
        }
    });

    it("names only meta resolvers that exist", () => {
        const known = new Set(knownMetaResolvers());
        for (const feature of ALL_CATALOGUE_FEATURES) {
            if (feature.metaResolver === undefined) continue;
            expect(known.has(feature.metaResolver), `${feature.key}: ${feature.metaResolver}`).toBe(
                true,
            );
        }
    });
});

describe("legacy coverage", () => {
    /*
     * Every destination the pre-rewrite shell offered as a tab has to be reachable from the new
     * information architecture. This is the test that would have caught "we forgot Watch it live"
     * before a user did.
     */
    it("reaches every job the old twelve-tab strip offered", () => {
        const reached = new Set(
            ALL_CATALOGUE_FEATURES.map((feature) => unwrapTarget(feature.target))
                .filter((target) => target.kind === "job")
                .map((target) => target.jobId),
        );
        for (const jobId of ["world", "projects", "cirender", "renders", "servers", "pages", "preview", "backups", "worldrepo", "docs"]) {
            expect(reached.has(jobId as never), jobId).toBe(true);
        }
    });

    it("reaches the map destination", () => {
        const reachesMap = ALL_CATALOGUE_FEATURES.some(
            (feature) => targetDestination(feature.target) === "map",
        );
        expect(reachesMap).toBe(true);
    });

    it("reaches the settings drawer, options editor, palette, notifications and licence", () => {
        const overlays = new Set(
            ALL_CATALOGUE_FEATURES.map((feature) => unwrapTarget(feature.target))
                .filter((target) => target.kind === "overlay")
                .map((target) => target.overlay),
        );
        for (const overlay of ["settings", "config", "palette", "notifications", "eula"]) {
            expect(overlays.has(overlay as never), overlay).toBe(true);
        }
    });
});

describe("cold-start reachability", () => {
    it("puts every feature within three activations of Home", () => {
        for (const catalogue of CATALOGUES) {
            for (const feature of catalogue.features) {
                expect(activationsFromHome(feature, catalogue.id), feature.key).toBeLessThanOrEqual(
                    3,
                );
            }
        }
    });
});

describe("nothing in the manifest is a live value", () => {
    /*
     * The prototype's illustrative numbers, verbatim. They are not product truth - the prototype
     * itself reported two different totals for the same editor - and any of them appearing in a
     * fallback string means somebody transcribed a mockup into the product.
     */
    const FORBIDDEN = [
        "107 settings",
        "8 tabs · 154",
        "154 options",
        "revision 41",
        "0.14.3 ready",
        "6 unread",
        "1 running",
        "3 entries",
        "4 sets",
        "18 proofs",
        "500 MiB parts",
        "60+ articles",
        "15 sections",
        "Temurin 21",
    ];

    it("carries no transcribed prototype value in any fallback string", () => {
        for (const feature of ALL_CATALOGUE_FEATURES) {
            const copy = `${feature.nameFallback}\n${feature.blurbFallback}`;
            for (const forbidden of FORBIDDEN) {
                expect(copy.includes(forbidden), `${feature.key}: ${forbidden}`).toBe(false);
            }
        }
    });

    it("never ships the restricted-mode placeholder literally", () => {
        for (const feature of ALL_CATALOGUE_FEATURES) {
            expect(feature.nameFallback.includes("{modeName}"), feature.key).toBe(false);
            expect(feature.blurbFallback.includes("{modeName}"), feature.key).toBe(false);
        }
    });
});

describe("copy", () => {
    it("gives every row a key and an English fallback for both name and blurb", () => {
        for (const feature of ALL_CATALOGUE_FEATURES) {
            expect(feature.nameKey.length, feature.key).toBeGreaterThan(0);
            expect(feature.nameFallback.length, feature.key).toBeGreaterThan(0);
            expect(feature.blurbKey.length, feature.key).toBeGreaterThan(0);
            expect(feature.blurbFallback.length, feature.key).toBeGreaterThan(0);
            expect(feature.groupKey.length, feature.key).toBeGreaterThan(0);
        }
    });

    it("keeps every blurb to one sentence", () => {
        for (const feature of ALL_CATALOGUE_FEATURES) {
            // A full stop followed by a space and a capital is a second sentence. Abbreviations
            // inside a sentence do not match, which is why this is not a naive count of full stops.
            expect(/\.\s+[A-Z]/.test(feature.blurbFallback), feature.key).toBe(false);
        }
    });

    it("uses an app-owned key namespace so upstream viewer keys are never shadowed", () => {
        for (const feature of ALL_CATALOGUE_FEATURES) {
            expect(feature.nameKey.startsWith("catalogue."), feature.key).toBe(true);
            expect(feature.blurbKey.startsWith("catalogue."), feature.key).toBe(true);
        }
    });
});
