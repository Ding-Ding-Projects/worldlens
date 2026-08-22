import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every place `ServerListScreen` is mounted must listen to the events it emits.
 *
 * This exists because the same defect has now shipped three times, and it is invisible
 * from every angle that normally catches things: the component renders, its buttons are
 * enabled, they hit-test correctly, nothing throws, no test fails, and the type checker is
 * perfectly happy — because an unhandled emit is not a type error. The only symptom is a
 * button that does nothing when a person presses it, which is exactly the failure the
 * decorative-UI rule exists to forbid.
 *
 * It reads the source rather than mounting anything, because the bug is in the wiring
 * between the component and its host, and a mounted test supplies that wiring itself.
 */
const APP = fileURLToPath(new URL("../../App.vue", import.meta.url));

/** The events the list emits that a host must answer. */
const REQUIRED = ["@open", "@create"] as const;

/**
 * Every `<ServerListScreen` tag in the file, with the text of that one tag.
 *
 * Brace-free scanning to the tag's own `>` rather than a lazy `[\s\S]*?`, which the repo
 * has recorded reaching past the construct it was written for and matching something in a
 * different one entirely.
 */
/** Line number of an offset, counted without a regex so no escape can be mangled. */
function countLines(prefix: string): number {
    const LF = String.fromCharCode(10);
    return prefix.split(LF).length;
}

function mountSites(source: string): { line: number; tag: string }[] {
    const sites: { line: number; tag: string }[] = [];
    const needle = "<ServerListScreen";
    let at = source.indexOf(needle);
    while (at !== -1) {
        // Scan to the tag's own closing `>`, skipping any `>` inside a quoted attribute
        // value. That is not hypothetical fussiness: the handlers here are arrow
        // functions, so `@open="(id) => (...)"` puts a `>` inside the value and a naive
        // scan truncates the tag mid-attribute - which made this guard report every
        // correctly-wired site as broken.
        let index = at + needle.length;
        let quote: string | null = null;
        while (index < source.length) {
            const char = source[index];
            if (quote !== null) {
                if (char === quote) quote = null;
            } else if (char === '"' || char === "'") {
                quote = char;
            } else if (char === ">") {
                break;
            }
            index += 1;
        }
        sites.push({
            line: countLines(source.slice(0, at)),
            tag: source.slice(at, Math.min(index + 1, source.length)),
        });
        at = source.indexOf(needle, at + needle.length);
    }
    return sites;
}

describe("the server list is wired wherever it is mounted", () => {
    const source = readFileSync(APP, "utf8");
    const sites = mountSites(source);

    it("is mounted somewhere at all", () => {
        // Without this the loop below passes on a file that no longer mounts the screen,
        // which is a guard that has quietly stopped guarding.
        expect(sites.length).toBeGreaterThanOrEqual(1);
    });

    it.each(sites.map((site) => [site.line, site.tag] as const))(
        "the mount at line %i listens to every event the list emits",
        (_line, tag) => {
            for (const event of REQUIRED) {
                // A mount that ignores `@open` gives the user a Manage button that
                // silently does nothing.
                expect(tag).toContain(event);
            }
        },
    );
});
