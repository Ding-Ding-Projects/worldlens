/**
 * The site's token sheet is its own file, because it carries tokens the desktop interface
 * does not need (spacing, density, page measure) and gates motion behind a media query. It
 * is still the same design system, so every token both sheets declare has to carry the same
 * value. Two of them had drifted: the pill corner was 999px here and 9999px there, and the
 * title-large weight was 500 here against the spec's 400. A documentation site one step off
 * the application is the two-products problem again, with the marketing surface as the party
 * that disagrees.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const siteSheet = readFileSync(join(here, "tokens.css"), "utf8");
const systemSheet = readFileSync(
    join(here, "..", "..", "..", "design-system", "src", "tokens.css"),
    "utf8",
);

/**
 * Every declaration of every token, in source order. The site declares each duration twice -
 * the real value, and a 1ms stand-in under the reduced-motion media query - so a token has
 * several values and agreement means one of them is the design system's.
 */
function declarations(sheet: string): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const match of sheet.matchAll(/^\s*(--md-(?:sys|ref)-[a-z0-9-]+):\s*([^;]+);/gm)) {
        const [, name, value] = match;
        if (name === undefined || value === undefined) continue;
        out.set(name, [...(out.get(name) ?? []), value.replace(/\s+/g, " ").trim()]);
    }
    return out;
}

/** `0`, `0px` and `0rem` are one value. */
function normalise(value: string): string {
    return /^0(?:px|rem|ms)?$/.test(value) ? "0" : value;
}

/**
 * The typefaces are the one deliberate difference: the site uses system stacks with the
 * Hong Kong CJK families first and fetches nothing, while the application bundles Roboto.
 */
const DELIBERATELY_DIFFERENT = new Set(["--md-ref-typeface-plain"]);

describe("site tokens agree with the design system", () => {
    const site = declarations(siteSheet);
    const system = declarations(systemSheet);

    it("declares the same value for every token both sheets carry", () => {
        const disagreements: string[] = [];
        for (const [name, values] of system) {
            const value = values[0] ?? "";
            const siteValues = site.get(name);
            if (siteValues === undefined || DELIBERATELY_DIFFERENT.has(name)) continue;
            if (value.startsWith("var(")) continue; // the short shape aliases resolve, not compare
            if (!siteValues.some((candidate) => normalise(candidate) === normalise(value))) {
                disagreements.push(
                    `${name}: site ${siteValues.join(" / ")} vs design system ${value}`,
                );
            }
        }
        expect(disagreements).toEqual([]);
    });

    it("spends the spec spellings of the shape scale, which the design system now publishes", () => {
        for (const step of ["extra-small", "small", "medium", "large", "extra-large", "full"]) {
            expect(system.has(`--md-sys-shape-corner-${step}`), step).toBe(true);
            expect(site.has(`--md-sys-shape-corner-${step}`), step).toBe(true);
        }
    });
});
