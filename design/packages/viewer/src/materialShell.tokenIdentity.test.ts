/**
 * The desktop application and the served viewer render the same colours, and this is what keeps
 * that true.
 *
 * They did not. `materialShell.ts` carried twelve hex values of its own - six roles for light, six
 * for dark - and not one of them matched the schemes `ui/src/vuetify.ts` renders with. `#415f91`
 * against `#8FCDFF` for primary, `#f9f9ff` against `#101418` for surface. The same product looked
 * like two products depending on whether you opened it or visited it, and nothing could have
 * caught it, because there was nothing to compare against.
 *
 * There is now: `@worldlens/shared`'s `colorRoles.ts`, which is plain data with no framework import
 * at all, and which both consumers read. This file asserts the reading actually happens - that the
 * stylesheet the viewer emits carries the canonical values rather than a copy that has drifted.
 *
 * ### Why a source-level assertion as well as an emitted-value one
 *
 * Checking the emitted string proves today's output is right. Checking the source for stray hex
 * proves tomorrow's cannot quietly go wrong: the failure mode this replaces was not a wrong value,
 * it was a *second* set of values that nobody knew to look at. A rule that only reads the output
 * would pass the day somebody adds a seventh hard-coded colour for one new element.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    COLOR_ROLES,
    DARK_SCHEME,
    LIGHT_SCHEME,
    schemeToCustomProperties,
} from "@worldlens/shared";

const source = readFileSync(fileURLToPath(new URL("./materialShell.ts", import.meta.url)), "utf8");

describe("one canonical token source", () => {
    it("emits every canonical role as a custom property, in both schemes", () => {
        const light = schemeToCustomProperties(LIGHT_SCHEME);
        const dark = schemeToCustomProperties(DARK_SCHEME);

        for (const role of COLOR_ROLES) {
            expect(light, role).toContain(`--bm-${role}:${LIGHT_SCHEME[role]};`);
            expect(dark, role).toContain(`--bm-${role}:${DARK_SCHEME[role]};`);
        }
    });

    it("emits all thirty-eight roles, not the six the shell used to hand-pick", () => {
        // The old vocabulary was primary, on-primary, surface, surface-container and outline.
        // Anything less than the full set means a surface somewhere is falling back to a colour
        // nobody chose, which is how a shell ends up almost matching.
        const emitted = schemeToCustomProperties(DARK_SCHEME).split(";").filter(Boolean);
        expect(emitted).toHaveLength(COLOR_ROLES.length);
        expect(COLOR_ROLES.length).toBeGreaterThanOrEqual(38);
    });

    it("agrees with the desktop on the roles the rewrite spends most", () => {
        // Spot-checked against the approved prototype's own reference table rather than against
        // whatever the schemes happen to hold: these five are the ones the shell rewrite leans on,
        // and a silent change to any of them would repaint the whole application.
        expect(DARK_SCHEME.primary).toBe("#8FCDFF");
        expect(DARK_SCHEME["primary-container"]).toBe("#004B73");
        expect(DARK_SCHEME["on-primary-container"]).toBe("#CEE5FF");
        expect(DARK_SCHEME["surface-container"]).toBe("#1D2024");
        expect(DARK_SCHEME["outline-variant"]).toBe("#42474E");
    });
});

describe("the viewer shell owns no colour vocabulary of its own", () => {
    it("declares no literal hex colour in its stylesheet", () => {
        // The whole failure mode in one assertion. A hex literal here is a second source of truth
        // by definition, and the last time there was one it disagreed with the first about every
        // single value.
        const style = source.slice(
            source.indexOf("const SHELL_BASE"),
            source.indexOf("export class"),
        );
        const literals = [...style.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((match) => match[0]);
        expect(literals).toEqual([]);
    });

    it("reads the canonical schemes rather than importing a theme runtime", () => {
        expect(source).toContain('from "@worldlens/shared"');
        // The viewer is framework-neutral and stays that way. Importing Vuetify to reach a colour
        // would drag a UI runtime into a package the CLI serves to ordinary browsers.
        expect(source).not.toContain("vuetify");
        expect(source).not.toContain('from "vue"');
    });

    it("keeps the served shell self-contained instead of adding a network dependency", () => {
        // The static map host has no reason to contact a third party for chrome. Fonts, icons
        // and map data are supplied by the published bundle and the existing local handler;
        // this shell must not grow a remote URL, stylesheet import, or direct fetch around it.
        expect(source).not.toMatch(/https?:\/\//);
        expect(source).not.toContain("@import");
        expect(source).not.toContain("fetch(");
    });
});
