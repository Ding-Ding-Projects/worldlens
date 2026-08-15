/**
 * A real packaged-app screenshot (`docs/screenshots/kid-home.png`, kid-mode home-screen audit)
 * showed most of Home's bold labels and icons - the catalogue tile names, the panel headings, the
 * "what is being drawn" row's own label, the child's own name in the status header - rendering
 * near-invisible: white or near-white text on kid mode's light surfaces.
 *
 * The cause is Vuetify's own `.v-application` wrapper, which sets the whole app's *default* text
 * colour to `on-background` - white in kid mode's scheme, because `background` is the dark navy the
 * rail sits on. Nothing inside `.wl-kid__pane` (the light content area) had its own explicit
 * `color`, so every un-coloured piece of text or icon there was inheriting that ambient white
 * straight through onto a light background. Not a loading skeleton, and not deliberate styling -
 * genuinely unreadable, on every un-coloured element the pane contains.
 *
 * This is checked against the component's own source, in a plain Node environment with no jsdom,
 * rather than against a mounted component's computed style: jsdom does not implement real CSS
 * custom-property cascade and inheritance the way a browser paints one, so a `getComputedStyle`
 * assertion here would prove nothing about the actual defect - which is exactly why an unit suite
 * with thousands of component tests never caught it, and a real screenshot did.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function kidShellSource(): string {
    return readFileSync(fileURLToPath(new URL("./KidShell.vue", import.meta.url)), "utf8");
}

describe("KidShell.vue's .wl-kid__pane rule", () => {
    it("declares an explicit on-surface colour, so nothing inside it silently inherits the app-wide ambient white", () => {
        const source = kidShellSource();
        const paneRule = source.match(/\.wl-kid__pane\s*\{([^}]*)\}/);

        expect(paneRule, "the .wl-kid__pane rule must exist").not.toBeNull();
        expect(paneRule![1]).toMatch(/color:\s*rgb\(var\(--v-theme-on-surface\)\)/);
    });

    it("still keeps the pane's own light background - the colour fix rides beside it, not instead of it", () => {
        const source = kidShellSource();
        const paneRule = source.match(/\.wl-kid__pane\s*\{([^}]*)\}/);

        expect(paneRule).not.toBeNull();
        expect(paneRule![1]).toMatch(/background:\s*rgb\(var\(--v-theme-surface\)\)/);
    });
});
