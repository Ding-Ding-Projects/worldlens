// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { buildPaletteCatalog, type PaletteCatalogInput } from "./paletteCatalog.js";
import {
    assertFeatureDirectoryInventory,
    FEATURE_DIRECTORY_REQUIRED_IDS,
} from "./featureDirectoryInventory.js";

const t = (_key: string, ...rest: unknown[]): string => {
    const fallback = rest[rest.length - 1];
    return typeof fallback === "string" ? fallback : String(rest[0] ?? "");
};

function input(): PaletteCatalogInput {
    return {
        t,
        app: null,
        locale: "en",
        pages: [],
        canRouteConfigScreens: false,
        size: "card",
        setSize: () => {},
        actions: {
            revealSetting: () => {},
            openSettings: () => {},
            openConfig: () => {},
            openProfiles: () => {},
            openNoticeCentre: () => {},
            openTabFinder: () => {},
            openTutorial: () => {},
            openEula: () => {},
            openWelcome: () => {},
        },
    };
}

function inputWithDirectoryEntries(): PaletteCatalogInput {
    return {
        ...input(),
        directoryEntries: [
            {
                id: "docs.article.regex",
                resultClass: "article",
                group: "Documentation",
                title: "Regex builder article",
                description: "How to search with the local regex builder.",
                keywords: ["regex", "search"],
                location: ["Documentation", "Search", "Regex builder"],
                where: "Opens the exact article.",
                go: () => {},
            },
            {
                id: "recovery.support",
                resultClass: "recovery",
                group: "Recovery",
                title: "Recovery actions",
                description: "What to do when a feature cannot continue.",
                keywords: ["recovery", "retry"],
                location: ["Help", "Recovery"],
                where: "Opens recovery actions.",
                go: () => {},
            },
        ],
    };
}

describe("feature directory inventory", () => {
    it("covers each hand-written canonical route with a breadcrumb and deep-link promise", () => {
        assertFeatureDirectoryInventory(buildPaletteCatalog(input()));
    });

    it("turns red when one declared feature disappears, then remains green when restored", () => {
        const items = buildPaletteCatalog(input());
        const removed = items.filter((item) => item.id !== FEATURE_DIRECTORY_REQUIRED_IDS[0]);
        expect(() => assertFeatureDirectoryInventory(removed)).toThrow(/shell\.settings/);
        expect(() => assertFeatureDirectoryInventory(items)).not.toThrow();
    });

    it("keeps suggested related actions on every result tied to real catalogue ids", () => {
        const items = buildPaletteCatalog(input());
        const ids = new Set(items.map((item) => item.id));
        for (const item of items) {
            expect(item.location?.length).toBeGreaterThan(0);
            for (const related of item.related ?? []) expect(ids.has(related)).toBe(true);
        }
    });

    it("accepts live article and recovery registries without duplicating their state", () => {
        const items = buildPaletteCatalog(inputWithDirectoryEntries());
        const article = items.find((item) => item.id === "docs.article.regex");
        const recovery = items.find((item) => item.id === "recovery.support");
        expect(article?.resultClass).toBe("article");
        expect(recovery?.resultClass).toBe("recovery");
        expect(items.filter((item) => item.id === "docs.article.regex")).toHaveLength(1);
    });
});
