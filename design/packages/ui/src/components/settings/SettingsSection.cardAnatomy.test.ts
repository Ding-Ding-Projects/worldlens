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

describe("settings section list anatomy (approved design)", () => {
    it("is one entry in a flat list: vertical rhythm on the 4/8 grid, no container of its own", () => {
        const text = source();
        const card = text.match(/\.mb-setting\s*\{[^}]*\}/s)?.[0] ?? "";
        expect(card, "missing .mb-setting rule").not.toBe("");
        expect(card).toContain("padding: 16px 0");
        expect(card).toContain("gap: 12px");
        expect(card).not.toContain("background:");
    });

    it("separates stacked sections with an outline-variant divider", () => {
        const text = source();
        const card = text.match(/\.mb-setting\s*\{[^}]*\}/s)?.[0] ?? "";
        expect(card).toContain("border-block-end");
        expect(card).toContain("--v-theme-outline-variant");
    });

    it("leads the header with a decorative icon, the heading, then a trailing status slot", () => {
        const text = source();
        expect(text).toMatch(/class="mb-setting__icon"[\s\S]*aria-hidden="true"/);
        expect(text).toMatch(/mb-setting__title[\s\S]*mb-setting__status/);
    });
});
