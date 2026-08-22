import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every overlay and panel spends the elevation token, and none of them types a shadow by hand.
 *
 * ## What went wrong that this exists to stop
 *
 * `tokens.css` has published `--md-sys-elevation-shadow-level0..5` for a while, and the design
 * system's opening sentence is that nothing in a component hard-codes a shadow. Fifteen surfaces
 * were doing exactly that anyway, and the tell was that most of them had the *right* numbers:
 * `0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3)` is level 3 spelled out, typed
 * into four different files. Somebody built an overlay, copied a neighbour's shadow rather than
 * the neighbour's token, and the copy stopped tracking the system the moment it was made. The
 * four that had drifted to values the ladder does not contain (`0 8px 24px rgba(0,0,0,.28)` and
 * friends) are the same mistake one generation further along.
 *
 * A rule of the shape "a shadow that is present must be a token" is not enough on its own: it
 * passes perfectly on a surface that paints no shadow at all, which is the other way an overlay
 * stops looking like the rest of the application. So the inventory below is hand-written, every
 * entry is required to exist and to name at least one elevation token, and a file that disappears
 * or stops carrying elevation fails rather than quietly leaving the check with nothing to do.
 *
 * ## Why the allowlist is per-file and spelled out
 *
 * Not every `box-shadow` is elevation. A focus ring, a scrim painted with a 9999px spread, an
 * inset hairline and a pulse keyframe all use the same property to mean something the elevation
 * ladder has no step for, and forcing those onto a token would be worse than the drift. Each one
 * is named here with the surface it belongs to, so a *new* raw shadow cannot hide behind a
 * category that was opened for a different declaration.
 */

const componentsRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Every overlay, popover, menu, dialog and floating panel that paints its own surface.
 *
 * Written out rather than discovered. A globbed list would grow silently, and the regression this
 * catches arrives as a new file, not as an edit to an old one.
 */
const OVERLAY_SURFACES = [
    "appearance/AppearanceEditor.vue",
    "appearance/AppearanceTarget.vue",
    "appearance/ColorField.vue",
    "appearance/TypographyEditor.vue",
    "config/ConfigNotifications.vue",
    "controlbar/ControlBar.vue",
    "eula/EulaViewer.vue",
    "gallery/ScreenshotGalleryScreen.vue",
    "menu/MenuRegexBuilder.vue",
    "menu/MenuSideSheet.vue",
    "settings/DockedSurface.vue",
    "tabs/TabGroupPicker.vue",
    "tabs/TabStrip.vue",
    "tutorial/TutorialOverlay.vue",
] as const;

/**
 * The shadows in those files that are deliberately not elevation, each with its reason.
 *
 * A declaration is matched in full, so widening one of these to a real drop shadow fails the
 * check rather than inheriting the exemption its neighbour was granted.
 */
const NOT_ELEVATION: Readonly<Record<string, readonly string[]>> = {
    // The highlight ring plus the 9999px-spread scrim that dims everything outside it. Neither is
    // a surface lifting off the page; the ladder has no step that means "cut a hole in the world".
    "tutorial/TutorialOverlay.vue": [
        "0 0 0 3px rgb(var(--v-theme-primary)),\n        0 0 0 9999px rgba(var(--v-theme-on-surface), 0.35)",
    ],
    // A one-pixel ring around the swatch so a pale colour still reads as a chip against a pale
    // surface. It is a border drawn with `box-shadow` because a real border would change the box.
    "appearance/InfiniteColorPicker.vue": ["0 0 0 1px rgba(0, 0, 0, 0.6)"],
};

/**
 * A file's source with its line endings normalised.
 *
 * The repository is checked out with CRLF on Windows, and two of the allowlisted declarations
 * below span lines. Matching them against the raw bytes would make this test pass or fail on the
 * checkout's line-ending setting rather than on the stylesheet, which is not a property worth
 * asserting.
 */
const sourceOf = (file: string): string =>
    readFileSync(resolve(componentsRoot, file), "utf8").replace(/\r/g, "");

/** Every `box-shadow: ...;` declaration in a file, with the property name and semicolon stripped. */
const shadowsIn = (source: string): string[] =>
    [...source.matchAll(/box-shadow:\s*([^;]+);/g)].map((match) => match[1]!.trim());

describe("overlays and panels spend the elevation token", () => {
    it("has an inventory whose every entry still exists", () => {
        // The fail-closed half. A renamed or deleted overlay must break this test rather than
        // shrink the coverage of the two below without anybody noticing.
        for (const file of OVERLAY_SURFACES) {
            expect(() => sourceOf(file), file).not.toThrow();
        }
    });

    it("gives every inventoried surface a real elevation, not an absent one", () => {
        for (const file of OVERLAY_SURFACES) {
            expect(sourceOf(file), `${file} paints no elevation at all`).toMatch(
                /var\(--md-sys-elevation-shadow-level[1-5]\)/,
            );
        }
    });

    it("lets no inventoried surface type a shadow by hand", () => {
        for (const file of OVERLAY_SURFACES) {
            const allowed = NOT_ELEVATION[file] ?? [];
            for (const shadow of shadowsIn(sourceOf(file))) {
                if (shadow === "none" || shadow.startsWith("inset ")) continue;
                if (shadow.includes("var(--md-sys-elevation-shadow-level")) continue;
                if (allowed.includes(shadow)) continue;
                expect.fail(
                    `${file} paints a hand-written shadow: ${shadow}\n` +
                        "Spend --md-sys-elevation-shadow-levelN, or name it in NOT_ELEVATION with its reason.",
                );
            }
        }
    });
});
