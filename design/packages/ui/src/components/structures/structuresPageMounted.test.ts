/**
 * That the structure list and the drop zone are actually reachable.
 *
 * Both were built, tested and committed before there was any page to put them on, which is
 * the specific failure this file exists to catch: a feature that is complete in a diff and
 * unreachable in the application. Every test in `StructureList.test.ts` passed against a
 * component nothing rendered.
 *
 * So this reads the shell's own source rather than mounting it. `App.vue` is a very large
 * component with a live viewer, a tab workspace and a dozen hosts behind it, and mounting
 * the whole thing to ask one structural question is slower and more fragile than asking the
 * question directly. What is asserted is exactly the wiring that was missing: the page is in
 * the registry, the panel renders the component, the component is imported, and its events
 * go somewhere real.
 *
 * The import assertion is the load-bearing one. An unresolved component in a Vue template is
 * NOT a type error - `vue-tsc` reported a clean pass on a template using `<StructureList>`
 * with no import anywhere in the file, and the only thing that surfaced it was passing a
 * required prop and watching the error change. Nothing else in this project would have
 * caught it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(
    fileURLToPath(new URL("../../App.vue", import.meta.url)),
    "utf8",
);

describe("the structures page is wired all the way through", () => {
    it("registers a page in the tab registry", () => {
        expect(appSource).toContain('const PAGE_STRUCTURES = "structures";');
        expect(appSource).toContain("id: PAGE_STRUCTURES,");
    });

    it("imports the component, which a template alone does not prove", () => {
        // The exact defect: the template referenced `<StructureList>` while no import
        // existed, and every check in this repository stayed green.
        expect(appSource).toMatch(
            /import StructureList from "\.\/components\/structures\/StructureList\.vue";/,
        );
    });

    it("renders it in the page's own panel", () => {
        expect(appSource).toContain("<template #structures>");
        expect(appSource).toContain("<StructureList");
    });

    it("gives it real data and an honest scan capability rather than a constant", () => {
        expect(appSource).toContain(':files="structureStore.discovered"');
        // `:can-scan="true"` would claim this build can look inside a world even when it
        // has no bridge to look with, which renders an empty list as "this world has none".
        expect(appSource).toContain(':can-scan="canScanStructures"');
        expect(appSource).not.toContain(':can-scan="true"');
    });

    it("sends its open event somewhere that actually opens a map", () => {
        expect(appSource).toContain('@open="onOpenRenderedStructure"');
        expect(appSource).toContain("function onOpenRenderedStructure(");
        // Routed through the one function every other render already opens through, so a
        // structure render cannot drift into having its own second way of being opened.
        expect(appSource).toMatch(/onOpenRenderedStructure[\s\S]{0,400}openRenderedMap\(/);
    });
});

describe("the drop zone is mounted too", () => {
    it("is imported and rendered by the shell", () => {
        expect(appSource).toMatch(
            /import DropRenderZone from "\.\/components\/dropRender\/DropRenderZone\.vue";/,
        );
        expect(appSource).toContain("<DropRenderZone");
    });

    it("has both of its events handled, not just the drop", () => {
        // A drop-only wiring leaves the keyboard route emitting into nothing, which is the
        // same unreachability this whole file is about, one level down.
        expect(appSource).toMatch(/@render=/);
        expect(appSource).toMatch(/@browse=/);
    });
});

/* -------------------------------------------------------------------------- */
/* The regression that 94 passing tests did not notice                         */
/* -------------------------------------------------------------------------- */

describe("nothing wraps the application layout", () => {
    /**
     * Vuetify's `<v-app>` computes its layout from its DIRECT children. Put any plain
     * element between it and `<v-main>` and the main region collapses to zero height: the
     * whole window renders as a black rectangle with only the interloper's own chrome
     * visible across the top.
     *
     * That shipped. The drop zone was wrapped around the app's children, every unit test
     * in this package stayed green, and the first thing that noticed was a person opening
     * the built application and seeing nothing. No assertion anywhere was about layout,
     * because layout is exactly what jsdom does not have.
     *
     * So the shape is asserted from the source instead. It is a blunt check and it is the
     * only one available: a wrapper here is invisible to every other guard in this project.
     */
    it("keeps v-main a direct child of v-app, with no element opened between them", () => {
        const open = appSource.indexOf("<v-app ");
        const main = appSource.indexOf("<v-main ");
        expect(open).toBeGreaterThan(-1);
        expect(main).toBeGreaterThan(open);

        const between = appSource.slice(appSource.indexOf(">", open) + 1, main);
        // Comments are fine; an opened element is not. Anything that opens a tag here and
        // does not close it before <v-main> is a wrapper around the layout.
        const withoutComments = between.replace(/<!--[\s\S]*?-->/g, "");
        const opened = [...withoutComments.matchAll(/<([A-Za-z][\w.-]*)(\s|>|\/)/g)].map(
            (match) => match[1],
        );
        const closed = [...withoutComments.matchAll(/<\/([A-Za-z][\w.-]*)>/g)].map(
            (match) => match[1],
        );
        const selfClosing = [...withoutComments.matchAll(/<([A-Za-z][\w.-]*)[^>]*\/>/g)].map(
            (match) => match[1],
        );

        const unclosed = opened.filter((tag) => {
            const opens = opened.filter((name) => name === tag).length;
            const closes = closed.filter((name) => name === tag).length;
            const selfs = selfClosing.filter((name) => name === tag).length;
            return opens - closes - selfs > 0;
        });

        expect(
            unclosed,
            "an element left open between <v-app> and <v-main> wraps Vuetify's layout, " +
                "which collapses the main region to zero height and renders the window as a " +
                "black rectangle. Nothing else in this project can see that.",
        ).toEqual([]);
    });
});
