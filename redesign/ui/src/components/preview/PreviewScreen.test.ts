/**
 * The live-preview screen's heading.
 *
 * The heading is a flex row so the eye icon can stand beside the words, and that turn is the
 * whole subject of this file. It began life inside a `<v-card-title>`, which Vuetify builds
 * for a single-line block title and ships `overflow: hidden; text-overflow: ellipsis;
 * white-space: nowrap` to keep one; `display: flex` clears none of the three, because
 * `text-overflow` only applies to block containers, which leaves a box that still clips at
 * its edge and still refuses to wrap - so a heading that overran was cut off mid-character
 * with no ellipsis and nothing to say that anything was missing. The heading is now the
 * page's own `<h1>` rather than a card title, and the three declarations are kept because
 * what made them necessary has not changed: it is still a flex row, and how long the line
 * is still depends on the locale rather than on the English in the source.
 *
 * The assertion reads the shipped rule out of the component source. This workspace's
 * `vitest.config.ts` does not enable `test.css`, so no stylesheet is attached to a mounted
 * component and a real cascade is not observable from a test here at all; `PagesScreen.test.ts`
 * and the nine components fixed alongside it check their own CSS fixes the same way.
 */

import { describe, expect, it } from "vitest";

import previewScreenSource from "./PreviewScreen.vue?raw";

describe("the heading, which is a flex row so the icon can sit beside the words", () => {
    it("clears the inherited overflow, text-overflow and white-space so the heading can wrap", () => {
        const rule = /\.mb-preview__title\s*\{[^}]*\}/s.exec(previewScreenSource)?.[0] ?? "";
        expect(rule).not.toBe("");
        expect(rule).toContain("overflow: visible");
        expect(rule).toContain("text-overflow: clip");
        expect(rule).toContain("white-space: normal");
    });
});
