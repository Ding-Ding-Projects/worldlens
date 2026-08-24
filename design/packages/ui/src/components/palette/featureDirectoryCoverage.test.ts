// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPaletteCatalog, type PaletteCatalogInput } from "./paletteCatalog.js";
import {
    assertPaletteRegistryBound,
    assertUniquePaletteIds,
    MAX_PALETTE_ITEMS,
    type PaletteDirectoryEntry,
    type PaletteItem,
} from "./paletteItems.js";
import {
    assertFeatureDirectoryInventory,
    assertFeatureDirectoryPages,
    assertFeatureDirectoryResultClasses,
    DISCOVERY_RESULT_CLASSES,
    FEATURE_DIRECTORY_REQUIRED_IDS,
} from "./featureDirectoryInventory.js";
import { assertProductionPageIds, PRODUCTION_APP_PAGE_IDS } from "./productionPageInventory.js";

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
                id: "tab.live",
                resultClass: "tab",
                group: "Tabs",
                title: "Live tab",
                description: "An open tab.",
                keywords: ["tab"],
                location: ["Tabs", "Live tab"],
                where: "Focuses the live tab.",
                go: () => {},
            },
            {
                id: "group.live",
                resultClass: "group",
                group: "Tab groups",
                title: "Live group",
                description: "An open tab group.",
                keywords: ["group"],
                location: ["Tab groups", "Live group"],
                where: "Focuses the group.",
                go: () => {},
            },
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
            {
                id: "appearance.live",
                resultClass: "appearance",
                group: "Appearance",
                title: "Appearance control",
                description: "A live appearance control.",
                keywords: ["appearance"],
                location: ["Appearance", "Appearance control"],
                where: "Opens appearance.",
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

    it("keeps all eight result classes explicit and fails one class at a time", () => {
        const items = buildPaletteCatalog(inputWithDirectoryEntries());
        assertFeatureDirectoryResultClasses(items);
        for (const resultClass of DISCOVERY_RESULT_CLASSES) {
            const removed = items.filter((item) => item.resultClass !== resultClass);
            expect(() => assertFeatureDirectoryResultClasses(removed)).toThrow(resultClass);
        }
    });

    it("enumerates every live page and turns red when any page row disappears", () => {
        const pages = [
            { id: "world", label: "World" },
            { id: "projects", label: "Projects" },
            { id: "docs", label: "Docs" },
        ];
        const items = buildPaletteCatalog({ ...input(), pages, actions: { ...input().actions, openPage: () => {} } });
        assertFeatureDirectoryPages(items, pages);
        for (const page of pages) {
            const removed = items.filter((item) => item.id !== `page.${page.id}`);
            expect(() => assertFeatureDirectoryPages(removed, pages)).toThrow(page.id);
        }
    });

    it("fails closed on built-in and supplied duplicate ids, naming both source classes", () => {
        const collision: PaletteDirectoryEntry = {
            id: "shell.settings",
            resultClass: "article",
            group: "Docs",
            title: "Collision",
            description: "Collision",
            keywords: [],
            where: "Collision",
            go: () => {},
        };
        expect(() => buildPaletteCatalog({ ...input(), directoryEntries: [collision] })).toThrow(
            /shell\.settings.*destination.*article/,
        );

        const suppliedA = { ...collision, id: "supplied.same", resultClass: "article" as const };
        const suppliedB = { ...collision, id: "supplied.same", resultClass: "recovery" as const };
        expect(() => assertUniquePaletteIds([
            { ...suppliedA, kind: "destination" },
            { ...suppliedB, kind: "destination" },
        ])).toThrow(/supplied\.same.*article.*recovery/);
    });

    it("asserts every hand-written production App page exists in App.vue and the palette", () => {
        const appSource = readFileSync(path.resolve(process.cwd(), "packages/ui/src/App.vue"), "utf8");
        const pages = PRODUCTION_APP_PAGE_IDS.map((id) => ({ id, label: id }));
        for (const id of PRODUCTION_APP_PAGE_IDS) {
            const constant = `PAGE_${id.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
            expect(appSource).toContain(`id: ${constant}`);
        }
        const items = buildPaletteCatalog({ ...input(), pages, actions: { ...input().actions, openPage: () => {} } });
        assertProductionPageIds(
            items.filter((item) => item.id.startsWith("page.")).map((item) => item.id.slice(5)),
        );
        for (const id of PRODUCTION_APP_PAGE_IDS) {
            const removed = items.filter((item) => item.id !== `page.${id}`);
            expect(() => assertProductionPageIds(removed.filter((item) => item.id.startsWith("page.")).map((item) => item.id.slice(5)))).toThrow(id);
        }
    });

    it("fails closed above the measured non-virtualized registry bound", () => {
        const synthetic: PaletteItem[] = Array.from({ length: MAX_PALETTE_ITEMS + 1 }, (_, index) => ({
            kind: "command" as const,
            resultClass: "command" as const,
            id: `synthetic.${index}`,
            group: "Synthetic",
            title: `Synthetic ${index}`,
            description: "A bounded performance probe.",
            keywords: [],
            run: () => {},
        }));
        const started = performance.now();
        expect(() => assertPaletteRegistryBound(synthetic)).toThrow(/measured bound/);
        expect(performance.now() - started).toBeLessThan(100);
    });
});
