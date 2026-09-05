/**
 * The wiring a component test cannot see: that the Chunker screen listens to the controls it
 * renders.
 *
 * `ChunkerRoutePicker` has always emitted a `fix` event for a route it cannot run, and its own
 * suite proves the emit happens. `ChunkerScreen` mounted the picker without `@fix`, so in the
 * shipped v1.0.2026 build pressing **Get Chunker** emitted an event into an empty room: no
 * handler, no console line, no error, and nothing at all on screen. Every test stayed green,
 * because each half was correct on its own.
 *
 * So this reads the real `.vue` source, the same way `main/bedrock/wiring.test.ts` reads the
 * real `main/index.ts`. It is a static check that the wiring exists, not a claim about it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCREEN = fileURLToPath(new URL("./ChunkerScreen.vue", import.meta.url));
const PICKER = fileURLToPath(new URL("./ChunkerRoutePicker.vue", import.meta.url));

describe("the Chunker screen is connected to the controls it shows", () => {
    const screen = readFileSync(SCREEN, "utf-8");
    const picker = readFileSync(PICKER, "utf-8");

    it("the route picker still emits a fix, so there is something to listen for", () => {
        expect(picker).toMatch(/emit\(\s*["']fix["']/);
    });

    it("listens for that fix rather than dropping it", () => {
        // Anchored to the element, not to the string "fix" anywhere in the file: a comment
        // mentioning the event would otherwise satisfy this for ever.
        const mount = screen.slice(screen.indexOf("<ChunkerRoutePicker"));
        const element = mount.slice(0, mount.indexOf("/>"));
        expect(element).toMatch(/@fix=/);
    });

    it("answers install-chunker by actually fetching one", () => {
        expect(screen).toMatch(/^\s*if \(fix === "install-chunker"\)/m);
        expect(screen).toMatch(/^\s*const result = await bridge\.fetchChunker\(\);/m);
    });

    it("shows the download running, failing and finishing, so the button is never a no-op", () => {
        for (const marker of [
            'data-test="chunker-fetch-progress"',
            'data-test="chunker-fetch-failure"',
            'data-test="chunker-fetch-retry"',
            'data-test="chunker-fetch-done"',
        ]) {
            expect(screen).toContain(marker);
        }
    });

    it("catches a rejected capabilities probe instead of leaving an unhandled rejection", () => {
        // A throw inside an async click handler is, from the user's side, a button that does
        // nothing - the same symptom, from a different cause, on the same screen.
        const probe = screen.slice(screen.indexOf("async function loadCapabilities"));
        expect(probe.slice(0, probe.indexOf("\n}\n"))).toMatch(/}\s*catch\s*\(error\)\s*\{/);
    });
});
