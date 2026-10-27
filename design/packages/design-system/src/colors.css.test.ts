/**
 * `colors.css` is generated from `colors.ts` and committed, so the one way it can be wrong is
 * by being stale. This pins the committed file to what the module emits now, and pins the
 * shape of what it emits: every role, every scheme, the selectors each scheme answers to.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
    COLOR_ROLES,
    COLOR_SCHEMES,
    SCHEME_SELECTORS,
    colorSchemesToStylesheet,
} from "./colors.js";

const committed = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "colors.css"), "utf8");

describe("colors.css", () => {
    it("is exactly what colors.ts emits", () => {
        expect(committed).toBe(colorSchemesToStylesheet());
    });

    it("publishes every role for every scheme, at the scheme's own value", () => {
        for (const [name, scheme] of Object.entries(COLOR_SCHEMES)) {
            const selector = SCHEME_SELECTORS[name as keyof typeof SCHEME_SELECTORS].join(",\n");
            const start = committed.indexOf(`${selector} {`);
            expect(start, `scheme block for ${name}`).toBeGreaterThan(-1);
            const block = committed.slice(start, committed.indexOf("}", start));
            for (const role of COLOR_ROLES) {
                expect(block).toContain(`--md-sys-color-${role}: ${scheme[role].toLowerCase()};`);
            }
        }
    });

    it("answers to the Vuetify theme class, the data-theme attribute, and nothing at all", () => {
        expect(SCHEME_SELECTORS.dark).toContain(":root");
        for (const name of Object.keys(COLOR_SCHEMES)) {
            expect(SCHEME_SELECTORS[name as keyof typeof SCHEME_SELECTORS]).toContain(
                `.v-theme--${name}`,
            );
            expect(SCHEME_SELECTORS[name as keyof typeof SCHEME_SELECTORS]).toContain(
                `[data-theme="${name}"]`,
            );
        }
    });
});
