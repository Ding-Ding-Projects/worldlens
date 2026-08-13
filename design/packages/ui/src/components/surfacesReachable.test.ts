/**
 * Every surface this application ships is reachable from it.
 *
 * ## Why this file exists, stated bluntly
 *
 * In one day, three separate features shipped fully implemented, fully tested, and with
 * nothing anywhere that rendered them: the built-in authenticator, the lock list, and the
 * Support Tickets desk. Each had a component, a store, a model and a green suite. None of
 * them could be opened. A fourth, the structures page, was caught only because somebody
 * looked; a fifth, the drop zone, was mounted in a way that collapsed the whole window.
 *
 * A component test proves the component. It says nothing whatsoever about whether a person
 * can get to it, because a test mounts it directly and a person cannot. That gap is
 * invisible to typecheck, to lint, and to every other guard in this package, and it is
 * invisible in exactly the same way each time: everything passes and the feature does not
 * exist as far as anybody using the application is concerned.
 *
 * ## Why the list is hand-written
 *
 * A rule like "every component under `components/` is mounted somewhere" would be checking
 * the components it already found. It cannot fail for a surface that was never built, and
 * it would have to carry a long tail of exceptions for the components that are deliberately
 * only used by other components. So the list below is written by hand and names the
 * surfaces that must be reachable. Adding a surface to the application without adding it
 * here is the one thing this cannot catch, which is why the list is short, explicit, and
 * sits next to a comment saying what it is for.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("../App.vue", import.meta.url)), "utf8");

/**
 * The tab system's own list of page ids.
 *
 * Read because this guard already missed one variation of the defect it exists for. It
 * checked that `App.vue` renders the component and declares the page id, and both were
 * true for four pages that were still completely unreachable: `jobRegistry.ts` never
 * listed them, so `TabbedNavigation` did not know they existed and there was no new-tab
 * entry, no palette row, and no way in. The capture harness found it by trying to open
 * them and timing out; nothing in this file could see it.
 *
 * So a page is reachable when three separate files agree it exists, and this reads the
 * third.
 */
const registrySource = readFileSync(
    fileURLToPath(new URL("./shell/jobRegistry.ts", import.meta.url)),
    "utf8",
);

/**
 * The surfaces a person must be able to open, and the page or row that opens each.
 *
 * `mountedAs` is the component tag as `App.vue` renders it. `reachedBy` is the thing that
 * makes it appear: a page id in the tab list, or the name of the surface that hosts it.
 */
const REACHABLE_SURFACES: readonly {
    readonly component: string;
    readonly reachedBy: string;
    readonly why: string;
}[] = [
    {
        component: "AuthenticatorScreen",
        reachedBy: "PAGE_AUTHENTICATOR",
        why: "Holds the TOTP secrets somebody registered. Unreachable, it is a store nobody can read.",
    },
    {
        component: "LockList",
        reachedBy: "PAGE_LOCKS",
        why: "The only place fifteen separate lock credentials are enumerable at once.",
    },
    {
        component: "SupportTickets",
        reachedBy: "PAGE_SUPPORT",
        why: "The recovery route out of a forgotten lock. Unreachable, a for-fun lock becomes permanent.",
    },
    {
        component: "StructureList",
        reachedBy: "PAGE_STRUCTURES",
        why: "The structures a world holds, and the renders made from them.",
    },
    {
        component: "DropRenderZone",
        reachedBy: "PAGE_STRUCTURES",
        why: "Drag a structure or schematic in. Lives on the structures page rather than wrapping the app.",
    },
    {
        component: "DimSumSurprise",
        reachedBy: "v-app sibling",
        why: "The startup surprise, which has no opt-out and therefore has to be mounted.",
    },
    {
        component: "OllamaScreen",
        reachedBy: "PAGE_OLLAMA",
        why: "The local Ollama suite manager: runtime health, the Model Store, the pull cart and chat all live here.",
    },
    {
        component: "BrowserExtensionScreen",
        reachedBy: "PAGE_BROWSER_EXTENSION",
        why: "The whole browser-extension capture flow: Start download, Downloading, and the completion notice.",
    },
];

describe("every shipped surface can actually be opened", () => {
    it.each(REACHABLE_SURFACES)("renders $component ($why)", ({ component }) => {
        // The tag as the template writes it. A bare import is not enough: a component that
        // is imported and never rendered is exactly the state all three of these shipped in.
        expect(
            appSource.includes(`<${component}`),
            `${component} is imported or defined but never rendered. A person cannot open it, ` +
                "and no component test can tell you that.",
        ).toBe(true);
    });

    it.each(REACHABLE_SURFACES.filter((surface) => surface.reachedBy.startsWith("PAGE_")))(
        "registers $component's page with the tab system so it can be opened",
        ({ reachedBy }) => {
            // The id as `App.vue` defines it, then the same id in the registry the tab
            // strip reads. A page missing here renders perfectly and cannot be reached.
            // Parsed with plain string operations rather than a regular expression. Three
            // attempts at the regex form each lost a backslash somewhere between the
            // editor and the file, and a pattern whose escape has quietly become a literal
            // letter matches nothing while looking exactly right.
            const marker = "const " + reachedBy + " = ";
            const at = appSource.indexOf(marker);
            expect(at, reachedBy + " is not declared in App.vue").toBeGreaterThan(-1);
            const pageId = appSource.slice(at + marker.length).split('"')[1] ?? "";
            expect(pageId, "no page id parsed for " + reachedBy).not.toBe("");
            // Three structural places, not merely "the string appears somewhere". The id is
            // in the type union whether or not the page is wired, so an `includes` check
            // stays green when the mapping and the definition are both deleted. Confirmed
            // by deleting the mapping and watching this pass, which is how the check earned
            // its current shape.
            for (const [form, needle] of [
                ["semantic-name mapping", pageId + ': "' + pageId + '"'],
                ["job definition", 'id: "' + pageId + '"'],
            ] as const) {
                expect(
                    registrySource.includes(needle),
                    "jobRegistry.ts has no " + form + " for the page id " + pageId + ", so the " +
                        "tab system does not know it exists: no new-tab entry, no palette row, " +
                        "no way in. The component renders correctly and is unreachable.",
                ).toBe(true);
            }
        },
    );

    it.each(REACHABLE_SURFACES.filter((surface) => surface.reachedBy.startsWith("PAGE_")))(
        "gives $component a page in the tab list via $reachedBy",
        ({ reachedBy }) => {
            // Declared as a constant, and listed in the pages array. A page id that exists
            // as a constant and never appears in the list is a panel with no tab.
            expect(appSource).toMatch(new RegExp(`const ${reachedBy}\\s*=`));
            expect(appSource).toMatch(new RegExp(`id:\\s*${reachedBy}\\b`));
        },
    );
});

describe("nothing wraps the application layout", () => {
    /**
     * The other half of the same lesson. A surface can be unreachable by being absent, and
     * it can be unreachable by being mounted somewhere that destroys the layout: wrapping
     * `<v-app>`'s children put a plain element between it and `<v-main>`, the main region
     * collapsed to zero height, and the built application rendered as a black rectangle
     * while ninety-four tests passed.
     */
    it("keeps v-main a direct child of v-app", () => {
        const open = appSource.indexOf("<v-app ");
        const main = appSource.indexOf("<v-main ");
        expect(open).toBeGreaterThan(-1);
        expect(main).toBeGreaterThan(open);

        const between = appSource
            .slice(appSource.indexOf(">", open) + 1, main)
            .replace(/<!--[\s\S]*?-->/g, "");
        const opened = [...between.matchAll(/<([A-Za-z][\w.-]*)(\s|>|\/)/g)].map((m) => m[1]);
        const closed = [...between.matchAll(/<\/([A-Za-z][\w.-]*)>/g)].map((m) => m[1]);
        const selfClosed = [...between.matchAll(/<([A-Za-z][\w.-]*)[^>]*\/>/g)].map((m) => m[1]);

        const unclosed = opened.filter((tag) => {
            const opens = opened.filter((name) => name === tag).length;
            const closes = closed.filter((name) => name === tag).length;
            const selfs = selfClosed.filter((name) => name === tag).length;
            return opens - closes - selfs > 0;
        });

        expect(
            unclosed,
            "an element left open between <v-app> and <v-main> wraps Vuetify's layout, which " +
                "collapses the main region to zero height. Nothing else in this project sees it.",
        ).toEqual([]);
    });
});
