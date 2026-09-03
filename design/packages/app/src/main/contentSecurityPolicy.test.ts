import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * One Content-Security-Policy header, not two.
 *
 * `hardenSession` spreads the response headers and then assigns
 * `headers["Content-Security-Policy"]`. If the original arrived under any other casing, that
 * assignment ADDS a second entry instead of replacing the first, and repeated CSP headers are
 * not last-one-wins: the browser enforces all of them, so the narrowest survives.
 *
 * Measured in a packaged build before the fix: twenty
 * "Refused to load the font 'data:font/woff;base64,...' because it violates the following
 * Content Security Policy directive: font-src 'self'" violations in one capture run - while
 * the policy this file sets says `font-src 'self' data:`. Nothing threw, every element kept
 * its correct styles, and the typeface silently fell back, which is the deceptive shape of
 * this defect. packages/kid-check/src/main/index.ts hit it first and documented it.
 *
 * A source-level check, because hardenSession is not exported and a test that supplied its
 * own session would prove something about the double rather than about the wiring.
 */
const SOURCE = new URL("./index.ts", import.meta.url);

describe("the renderer session sends exactly one Content-Security-Policy header", () => {
    it("deletes every existing casing before it assigns the policy", async () => {
        const source = await readFile(SOURCE, "utf8");

        const deleteAt = source.indexOf(
            'if (key.toLowerCase() === "content-security-policy") delete headers[key];',
        );
        const assignAt = source.indexOf('headers["Content-Security-Policy"] = [');

        expect(assignAt, "hardenSession no longer assigns a policy at all").toBeGreaterThan(-1);
        expect(
            deleteAt,
            "the policy is assigned over a spread of the response headers with no case-insensitive " +
                "delete first, so a header that arrives as content-security-policy stays in force " +
                "beside it and the narrower of the two wins",
        ).toBeGreaterThan(-1);
        expect(
            deleteAt,
            "the delete has to run before the assignment; after it, both headers are already set",
        ).toBeLessThan(assignAt);
    });

    it("still allows the data: URI fonts the interface actually embeds", async () => {
        const source = await readFile(SOURCE, "utf8");
        expect(source).toContain("font-src 'self' data:;");
    });
});
