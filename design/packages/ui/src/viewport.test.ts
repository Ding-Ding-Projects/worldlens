/**
 * The viewport declaration, which is one line and decides whether somebody with low vision
 * can use this at all.
 *
 * `user-scalable=no` was in here. It is the standard incantation for making a web surface feel
 * like an application, it is one token long, and it silently removes the only accommodation a
 * person with low vision has that needs no cooperation from the software: pinch to zoom. WCAG
 * 1.4.4 exists for exactly this.
 *
 * It is guarded rather than merely removed because it is the kind of thing that comes back.
 * Somebody notices a double-tap zooming when they meant to tap, reaches for the one-token fix,
 * and nothing objects - the interface looks better afterwards, to everyone who can read it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

/** The tag itself, so a rename or a second one cannot slip past a substring match. */
const viewportTag = /<meta\s+name="viewport"\s+content="([^"]*)"/i.exec(html);

describe("the viewport declaration", () => {
    it("exists exactly once", () => {
        expect(viewportTag).not.toBeNull();
        expect(html.match(/<meta\s+name="viewport"/gi)).toHaveLength(1);
    });

    it("never disables zoom", () => {
        // The assertion this file is for.
        expect(viewportTag?.[1]).not.toContain("user-scalable=no");
        expect(viewportTag?.[1]).not.toContain("user-scalable=0");
    });

    it("never caps how far somebody may zoom in", () => {
        // The subtler version of the same removal: `maximum-scale=1` is not "no zoom" but it
        // is close enough to be useless to whoever needed it, and it reads as a harmless
        // rendering hint.
        expect(viewportTag?.[1]).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/);
    });

    it("still sizes to the device, which is what the tag is actually for", () => {
        expect(viewportTag?.[1]).toContain("width=device-width");
        expect(viewportTag?.[1]).toContain("initial-scale=1");
    });
});
