import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The copy catalogue is uniformly ASCII-apostrophed: when this was written it carried 1,615
 * straight apostrophes and not one U+2019 anywhere under `copy/surfaces`. A component whose
 * inline `t()` fallback reaches for the typographic one therefore renders a *different
 * sentence* from its own catalogue entry, and the difference is one glyph nobody sees in a
 * review.
 *
 * That is not hypothetical. `GhCliAccountsList.vue` said "gh’s local store" while
 * `ghCliAccounts.ts` said "gh's local store", so the destructive sign-out confirmation showed
 * one wording with the catalogue loaded and another without it. The test asserting that
 * sentence failed in a way that read as missing copy rather than as a one-character mismatch,
 * and three further files carried the same glyph.
 */
const TYPOGRAPHIC_APOSTROPHE = "’";

const SELF = "apostropheConvention.test.ts";
const GENERATED_CHANGELOG = "changelogData.generated.ts";

function directoryOfThisFile(): string {
    const path = new URL("../", import.meta.url).pathname;
    return path.startsWith("/") && path[2] === ":" ? path.slice(1) : path;
}

async function sourceFiles(directory: string): Promise<readonly string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const found: string[] = [];
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules") continue;
            found.push(...(await sourceFiles(path)));
        } else if (entry.name === SELF) {
            // This file has to contain the glyph in order to search for it, the same way a
            // guard asserting the absence of a word cannot avoid naming it.
            continue;
        } else if (entry.name === GENERATED_CHANGELOG) {
            // Not source: every string in it is a commit subject or body copied verbatim
            // from git history. The convention this test enforces is that a catalogue entry
            // and the call site's own English fallback spell the same sentence the same way,
            // and a historical commit body is neither. One of those bodies is the commit that
            // fixed the original mismatch, and it quotes the glyph in order to describe it --
            // so enforcing the convention here would forbid the changelog from recording the
            // very defect this test exists to prevent.
            //
            // Excluded by exact filename rather than by a "generated" pattern, so a second
            // generated file has to be considered on its own merits rather than inheriting
            // this exemption silently.
            continue;
        } else if (
            entry.name.endsWith(".ts") ||
            entry.name.endsWith(".tsx") ||
            entry.name.endsWith(".vue")
        ) {
            found.push(path);
        }
    }
    return found;
}

describe("apostrophe convention", () => {
    it("keeps every source file on the ASCII apostrophe the copy catalogue uses", async () => {
        const files = await sourceFiles(directoryOfThisFile());
        // A walk that found nothing would pass this silently, which is the one way a guard
        // like this stops guarding without anybody noticing.
        expect(files.length).toBeGreaterThan(50);

        const offenders: string[] = [];
        for (const file of files) {
            const text = await readFile(file, "utf8");
            if (text.includes(TYPOGRAPHIC_APOSTROPHE)) {
                offenders.push(file.split(sep).join("/").split("/src/")[1] ?? file);
            }
        }

        expect(offenders).toEqual([]);
    });
});
