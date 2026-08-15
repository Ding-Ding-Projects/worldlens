import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROW_MANIFEST, implementedRows, plannedRows } from "./rows.js";

/**
 * The negative-regression half of the completeness manifest: a hand-written list that only
 * ever checks itself for internal consistency can go stale the moment `RowsGallery.vue` gains
 * or loses a row, silently, with nothing here noticing. So this reads the real gallery source
 * as text and checks the id sets match in BOTH directions - an id claimed `"implemented"` here
 * with no matching row in the gallery fails, and a row in the gallery with no matching manifest
 * entry fails too. Either direction going stale is exactly the failure this repository's own "a
 * checklist that inspects only what it already discovered is invalid" rule warns about.
 *
 * ## Why this scans for `<RowShell … id="…"`, not `data-md3-row="…"`
 *
 * `data-md3-row` is a DOM attribute `RowShell.vue`'s own template renders (`:data-md3-row="id"`
 * on its `<section>`) - it is never literal text in THIS file, which only ever passes `id` as a
 * plain prop on the `<RowShell>` tag. Scanning for `data-md3-row="…"` here would find nothing at
 * all, ever, regardless of how many rows actually exist - a guard that cannot pass is exactly as
 * useless as one that cannot fail, and this one silently was that until a manual review caught
 * it. Scanning for the real, present source text (`<RowShell` immediately followed by its `id=`
 * line) is what this test actually needs to check.
 */
const galleryPath = fileURLToPath(new URL("../components/RowsGallery.vue", import.meta.url));

function realRowIdsInGallery(): Set<string> {
    const source = readFileSync(galleryPath, "utf8");
    // Anchored to this file's own real, consistent formatting: every `<RowShell` opening tag in
    // this codebase is followed, on the very next line, by its `id="…"` attribute (verified by
    // reading the file - every one of the 15 rows follows this exact shape). The gap between
    // `<RowShell` and `id="` is deliberately just `\s*` (whitespace only), never `[\s\S]*?`: a
    // bridging pattern there could reach past an unrelated `id="…"` inside a DIFFERENT row's
    // markup (a nested component's own id, say) and silently attribute it to the wrong row -
    // exactly the over-reaching-regex failure mode this workspace's own shared notes warn about.
    const pattern = /<RowShell\s+id="([a-z0-9-]+)"/g;
    const ids = new Set<string>();
    for (const match of source.matchAll(pattern)) {
        ids.add(match[1]!);
    }
    return ids;
}

describe("ROW_MANIFEST vs. RowsGallery.vue", () => {
    it("has no manifest entry marked implemented without a matching gallery row", () => {
        const realIds = realRowIdsInGallery();
        for (const row of implementedRows()) {
            expect(realIds.has(row.id), `manifest says "${row.id}" is implemented, but RowsGallery.vue has no <RowShell id="${row.id}">`).toBe(true);
        }
    });

    it("has no gallery row without a matching manifest entry", () => {
        const realIds = realRowIdsInGallery();
        const manifestIds = new Set(ROW_MANIFEST.map((r) => r.id));
        for (const id of realIds) {
            expect(manifestIds.has(id), `RowsGallery.vue renders <RowShell id="${id}">, which ROW_MANIFEST does not know about`).toBe(true);
        }
    });

    it("never renders a row the manifest marks planned - a planned row has no markup yet by definition", () => {
        const realIds = realRowIdsInGallery();
        for (const row of plannedRows()) {
            expect(realIds.has(row.id), `"${row.id}" is marked planned but RowsGallery.vue already renders it - promote it to implemented`).toBe(false);
        }
    });

    it("gives every planned row a stated reason", () => {
        for (const row of plannedRows()) {
            expect(row.plannedReason, `"${row.id}" is marked planned with no plannedReason`).toBeTruthy();
        }
    });

    it("has at least one implemented row, so the instrument is not an empty shell", () => {
        expect(implementedRows().length).toBeGreaterThan(0);
    });
});
