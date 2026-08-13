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

import { SETTINGS_SECTIONS } from "./settings/settingsSections.js";

const appSource = readFileSync(fileURLToPath(new URL("../App.vue", import.meta.url)), "utf8");

/**
 * The settings surface, read as text for the same reason `App.vue` is.
 *
 * A settings section is declared in one file and rendered in another, and the two are joined
 * only by a slot name spelled the same way in both. Nothing in TypeScript relates them: the
 * section list is a tuple of strings and the template slot is markup, so a section added to
 * {@link SETTINGS_SECTIONS} with no `<template #name>` beside it compiles, typechecks, renders
 * its heading, and shows an empty body underneath. That is a section a person can search for,
 * scroll to and read nothing in, which is the settings-shaped version of the defect this whole
 * file exists for.
 */
const settingsSource = readFileSync(
    fileURLToPath(new URL("./settings/AppSettings.vue", import.meta.url)),
    "utf8",
);

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
        component: "ChunkerScreen",
        reachedBy: "PAGE_CHUNKER",
        why: "The only surface that converts a world between editions. Unreachable, Chunker is a jar nobody can run.",
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
    /*
     * The pages that were reachable and unwatched. Every one of them agreed across all three
     * files already, which is exactly why they were easy to leave off this list: nothing was
     * broken, so nobody added them, and deleting any one of their slots or registry rows
     * would have kept this suite green. A guard that only watches the surfaces that once
     * broke is a guard that watches the past.
     */
    {
        component: "WorldScreen",
        reachedBy: "PAGE_WORLD",
        why: "The map wizard, and the one job pinned on a fresh workspace. Unreachable, a new install has nothing to do.",
    },
    {
        component: "ProjectsScreen",
        reachedBy: "PAGE_PROJECTS",
        why: "Every setting the wizard did not ask about. Unreachable, a project written into a world can never be edited.",
    },
    {
        component: "CiRenderScreen",
        reachedBy: "PAGE_CIRENDER",
        why: "Rendering on GitHub's runners. Its id and its semantic name differ, so a rename is exactly what would break it quietly.",
    },
    {
        component: "RendersScreen",
        reachedBy: "PAGE_RENDERS",
        why: "Where the tab strip's own running-render counter points. Unreachable, that counter counts into nothing.",
    },
    {
        component: "ProfileManager",
        reachedBy: "PAGE_SERVERS",
        why: "The server profile list, and where the command palette's own profiles row lands.",
    },
    {
        component: "BackupScreen",
        reachedBy: "PAGE_BACKUPS",
        why: "Taking and restoring world backups, which is the one surface a mistake elsewhere is undone from.",
    },
    {
        component: "PagesScreen",
        reachedBy: "PAGE_PAGES",
        why: "Publishing a rendered map to GitHub Pages.",
    },
    {
        component: "WorldRepoScreen",
        reachedBy: "PAGE_WORLDREPO",
        why: "The world repository: where a world comes from and where it goes back to.",
    },
    {
        component: "PreviewScreen",
        reachedBy: "PAGE_PREVIEW",
        why: "Watching a render as it happens.",
    },
    {
        component: "DocsPage",
        reachedBy: "PAGE_DOCS",
        why: "Every in-app documentation link lands here. Unreachable, every one of them lands on an empty-page fallback.",
    },
    /*
     * The two rail destinations. They are deliberately not jobs and deliberately absent from
     * both the pages list and the registry, so they carry `AppRail` rather than a `PAGE_`
     * constant and the two page-id assertions below skip them the same way they skip the dim
     * sum surprise. What is still worth asserting is that they are rendered at all: the whole
     * rail exists to reach these two.
     */
    {
        component: "HomeScreen",
        reachedBy: "AppRail",
        why: "The landing surface. It was imported into App.vue and never rendered, which <script setup> drops in silence.",
    },
    {
        component: "HomeCatalogues",
        reachedBy: "AppRail",
        why: "The exhaustive index of every capability, underneath Home's own weighted list.",
    },
    {
        component: "CataloguePage",
        reachedBy: "AppRail",
        why: "One catalogue opened out of Home, which is a page of Home rather than a fourth destination.",
    },
    {
        component: "MapView",
        reachedBy: "AppRail",
        why: "The map itself, which is the whole point of everything else in this list.",
    },
];

/**
 * Surfaces that are reached through another surface rather than through `App.vue`.
 *
 * The list above can only ask questions of `App.vue`, so a panel or an editor that lives
 * inside a page is invisible to it. Two of those were genuinely unreachable in this sweep and
 * neither would have failed anything above: the remote hosting panel was never exported from
 * its own folder, so nothing outside that folder could even import it, and Marker Studio's
 * only entrance sat inside an empty-state block, so a map that actually published markers had
 * no way into the studio at all.
 *
 * `entrance` is the literal a person's route in is written with, usually the `data-test` on
 * the control that opens it. Asserting the tag alone would be satisfied by a component
 * rendered behind a condition nobody can reach, which is precisely how the studio shipped.
 */
const NESTED_SURFACES: readonly {
    readonly component: string;
    readonly hostFile: string;
    readonly entrance: string;
    readonly why: string;
}[] = [
    {
        component: "RemoteHostingPanel",
        hostFile: "world/WorldScreen.vue",
        entrance: "    RemoteHostingPanel,",
        why: "Hosting a finished render somewhere other than this machine. It was not even exported from components/remote/index.ts, so nothing outside that folder could import it, which is why the import through that barrel is the thing worth pinning.",
    },
    {
        component: "MarkerStudio",
        hostFile: "markers/MarkerMenu.vue",
        entrance: 'data-test="marker-open-studio"',
        why: "The marker editor. Its only button lived inside the empty-state block, so a map that published markers had no entrance to it whatsoever.",
    },
];

describe("a surface reached through another surface still has a way in", () => {
    it.each(NESTED_SURFACES)(
        "$hostFile renders $component and shows its entrance ($why)",
        ({ component, hostFile, entrance }) => {
            const host = readFileSync(
                fileURLToPath(new URL("./" + hostFile, import.meta.url)),
                "utf8",
            );
            // The tag has to end where the name ends. A bare `includes("<Name")` is satisfied
            // by `<NameX`, which is the renamed-symbol trap this project has already shipped
            // twice: the guard stays green while the thing it names no longer exists.
            const rendered = new RegExp("<" + component + "(\\s|>|/)").test(host);
            expect(rendered, component + " is not rendered by " + hostFile + " at all.").toBe(true);
            expect(
                host.includes(entrance),
                hostFile + " renders " + component + " but no longer contains the entrance " +
                    entrance + ", so nothing on screen opens it. A component with no entrance " +
                    "is a component nobody can reach, and its own tests still pass.",
            ).toBe(true);
        },
    );

    it("keeps Marker Studio's entrance outside the empty-state block", () => {
        // The exact shape the defect had: the button existed, and existed only on a map with
        // no markers. Reading the emptiness condition's own block and asserting the entrance
        // is not inside it is the only way to tell those two states apart from source.
        const menu = readFileSync(
            fileURLToPath(new URL("./markers/MarkerMenu.vue", import.meta.url)),
            "utf8",
        );
        const emptyBlock = menu.indexOf('v-if="isEmpty"');
        const entrance = menu.indexOf('data-test="marker-open-studio"');
        expect(entrance).toBeGreaterThan(-1);
        if (emptyBlock > -1) {
            expect(
                entrance < emptyBlock,
                "the Marker Studio button is inside the empty-state block again, so the studio " +
                    "has no entrance on any map that actually publishes markers.",
            ).toBe(true);
        }
    });
});

/**
 * The settings surface, whose sections go missing in a way that looks like a rendering bug.
 *
 * A section is a string in {@link SETTINGS_SECTIONS} and a `<template #name>` in
 * `AppSettings.vue`, and nothing joins the two but the spelling. Both directions matter and
 * they fail differently: a section with no slot renders a heading over an empty body, and a
 * slot with no section is markup Vue never asks for, so the control inside it simply does not
 * exist while its own tests keep passing.
 *
 * The list stays the product's own, deliberately, and this is the one place in this file where
 * that is safe: `SETTINGS_SECTIONS` is not derived from the template, it is the hand-written
 * declaration the template has to satisfy, so a section deleted from it also disappears from
 * the surface's search, its anchors and its palette rows. There is no state where the code
 * does nothing and this passes vacuously, which is what the sanity assertion below pins.
 */
describe("every settings section has somewhere to render", () => {
    const slots = [...settingsSource.matchAll(/<template #([\w-]+)>/g)].map((match) => match[1] ?? "");

    it("found the surface's slots at all", () => {
        // A parse that matched nothing would make the per-section assertion below pass for a
        // file with no template in it whatsoever.
        expect(slots.length).toBeGreaterThan(10);
    });

    it.each(SETTINGS_SECTIONS)("AppSettings.vue has a <template #%s>", (section) => {
        expect(
            slots.includes(section),
            "settingsSections.ts declares the section " + section + " and AppSettings.vue has " +
                "no <template #" + section + "> to fill it, so the section renders its heading " +
                "over an empty body. Somebody searches for the setting, is taken to it, and " +
                "finds nothing there.",
        ).toBe(true);
    });

    it("never renders a slot no section declares", () => {
        // `prepend` is Vuetify's own slot on an unrelated component in this file rather than a
        // settings section, so it is named here instead of loosening the rule.
        const VUETIFY_SLOTS = ["prepend"];
        const orphans = slots.filter(
            (slot) => !VUETIFY_SLOTS.includes(slot) && !(SETTINGS_SECTIONS as readonly string[]).includes(slot),
        );
        expect(
            orphans,
            "AppSettings.vue renders these slots and settingsSections.ts declares no section " +
                "for them, so Vue never asks for the markup and whatever is inside it does not " +
                "exist on screen: " + orphans.join(", "),
        ).toEqual([]);
    });
});

/**
 * The documentation half of this contract lives next door.
 *
 * `docs/README.md`'s tables and `docsModel.ts`'s ordering arrays are checked against each
 * other and against the real files on disk by `docs/docsIndexCoverage.test.ts`, in all three
 * directions, with a named-exemption list. Restating those assertions here would be a second
 * copy to keep in step rather than a second guard, so this only pins that the guard still
 * exists: deleting that file is the one edit that would remove the check without anything
 * going red.
 */
describe("the documentation index guard still exists", () => {
    it("still checks docs/README.md against docsModel.ts's ordering arrays", () => {
        const guard = readFileSync(
            fileURLToPath(new URL("./docs/docsIndexCoverage.test.ts", import.meta.url)),
            "utf8",
        );
        // Each name has to end where the name ends, because `includes("APPLICATION_ORDER")`
        // is satisfied by `APPLICATION_ORDERZ` and a renamed symbol would leave this green
        // over a guard that no longer reads anything. Watched failing on exactly that rename.
        for (const name of ["APPLICATION_ORDER", "RENDERING_ORDER", "categoryOfFile"]) {
            expect(
                new RegExp(name + "\\b").test(guard),
                "docsIndexCoverage.test.ts no longer mentions " + name + ", so the check that " +
                    "docs/README.md's tables and docsModel.ts's ordering arrays agree has been " +
                    "renamed out from under this or gutted.",
            ).toBe(true);
        }
        expect(guard.includes("docs/README.md")).toBe(true);
    });
});

describe("every shipped surface can actually be opened", () => {
    it.each(REACHABLE_SURFACES)("renders $component ($why)", ({ component }) => {
        // The tag as the template writes it. A bare import is not enough: a component that
        // is imported and never rendered is exactly the state all three of these shipped in.
        //
        // The tag has to end where the name ends, for the same reason the nested-surface
        // check above says so. `includes("<HomeScreen")` is satisfied by `<HomeScreenX`, so
        // renaming a component - the single likeliest way to unmount one by accident - leaves
        // this green. That trap was found and fixed in the newer check and left standing here,
        // which is worth stating plainly: a guard is only as good as its weakest needle, and
        // two checks in one file disagreeing about how to match a tag is how the weak one
        // survives review.
        expect(
            new RegExp("<" + component + "(\\s|>|/)").test(appSource),
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
            // The mapping is checked by its *value*, not by assuming the semantic name and
            // the page id are the same word. Two of them are not: `wizard` is stored as
            // `world` and `runners` as `cirender`, which are exactly the two entries a
            // rename would break quietly, so a check that only found the ones spelled the
            // same way would be blind to the pair most worth watching.
            // Plain string operations, for the reason the comment above already gives: a
            // regular expression written here has lost a backslash between the editor and
            // the file three times, and a pattern whose escape has become a literal letter
            // matches nothing while looking exactly right.
            const mapped = registrySource
                .split(/\r?\n/)
                .some((line) => line.trim().endsWith(': "' + pageId + '",'));
            for (const [form, hit] of [
                ["semantic-name mapping", mapped],
                ["job definition", registrySource.includes('id: "' + pageId + '",')],
            ] as const) {
                expect(
                    hit,
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

/**
 * The direction the list above cannot check.
 *
 * Everything above walks from a hand-written surface into the registry. Nothing walked the
 * other way, so a job the registry promises and `App.vue` has no slot for was invisible: the
 * tab appears in the strip, in the new-tab menu and in the palette, and opening it renders
 * the tab system's honest "this build has no content for that page" fallback, which reads as
 * a broken page rather than as a missing one. `memory` was in exactly that state, saved only
 * by a capability resolver that happens to return absent today.
 */
describe("every job the registry promises has somewhere to render", () => {
    const registeredIds = [...registrySource.matchAll(/^\s{8}id: "([A-Za-z]+)",$/gm)].map(
        (match) => match[1] ?? "",
    );

    it("found the registry's job ids at all", () => {
        // A parse that quietly matched nothing would make every assertion below pass without
        // ever looking at anything, which is the failure mode this whole file exists for.
        expect(registeredIds.length).toBeGreaterThan(10);
    });

    it.each(registeredIds)("App.vue has a slot for the %s job", (id) => {
        expect(
            appSource.includes("<template #" + id + ">"),
            "jobRegistry.ts defines the job " + id + " and App.vue has no <template #" + id +
                "> to render it. The tab exists and opening it shows the tab system's " +
                "no-content fallback.",
        ).toBe(true);
    });
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
