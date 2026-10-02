/**
 * Deliberately not `@vitest-environment jsdom`: under jsdom `import.meta.url` is not a
 * `file:` URL, so `fileURLToPath` throws before a single assertion runs (see
 * `dockScrollChain.test.ts`'s own note on the same gotcha).
 *
 * The user's own report on this dialog was "a bit cramped": `.mb-setting` shipped with
 * 16px padding and a 12px internal gap, well under M3 card anatomy's 24px padding and
 * 16px rhythm. This is a source-level regression against the exact numbers that made it
 * cramped, so a later edit that quietly reverts the padding cannot pass silently.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The relative path is read into a variable before it reaches `new URL()` on
 * purpose: Vite's static asset-URL transform for `new URL(x, import.meta.url)`
 * only fires when `x` is a string *literal* it can resolve at build time, and
 * fires even outside jsdom once the SFC plugin is registered at all. A literal
 * there gets rewritten into a dev-server asset URL (`http://localhost:.../...`),
 * which `fileURLToPath` then rejects as not `file:`. Routing it through a
 * parameter, as `dockScrollChain.test.ts` already does, keeps this a plain
 * runtime `URL` resolution instead.
 */
function read(relativePath: string): string {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function source(): string {
    return read("./SettingsSection.vue");
}

describe("settings section card anatomy (M3 revamp)", () => {
    it("uses full-card 24px padding and a 16px rhythm instead of the cramped 16px/12px it shipped with", () => {
        const text = source();
        const card = text.match(/\.mb-setting\s*\{[^}]*\}/s)?.[0] ?? "";
        expect(card, "missing .mb-setting rule").not.toBe("");
        expect(card).toContain("padding: 24px");
        expect(card).toContain("gap: 16px");
        expect(card).not.toMatch(/padding:\s*16px\s*;/);
        expect(card).not.toMatch(/gap:\s*12px\s*;/);
    });

    it("draws a divider between stacked sections from the outline-variant token", () => {
        const text = source();
        const divider = text.match(/\.mb-setting \+ \.mb-setting\s*\{[^}]*\}/s)?.[0] ?? "";
        expect(divider, "missing stacked-section divider rule").not.toBe("");
        expect(divider).toContain("border-top");
        expect(divider).toContain("--md-sys-color-outline-variant");
    });
});
