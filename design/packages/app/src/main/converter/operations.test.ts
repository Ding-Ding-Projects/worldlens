import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPdfOperation } from "./operations.js";

describe("bundled offline PDF operations", () => {
    it("inspects and performs split, merge, extract, reorder, rotate and metadata with reopen validation", async () => {
        const dir = await mkdtemp(join(tmpdir(), "worldlens-pdf-"));
        try {
            const source = join(dir, "source.pdf"); const second = join(dir, "second.pdf");
            for (const [path, count] of [[source, 2], [second, 1]] as const) { const doc = await PDFDocument.create(); for (let i = 0; i < count; i++) doc.addPage(); await writeFile(path, await doc.save()); }
            expect((await runPdfOperation({ operation: "inspect", inputs: [source], output: join(dir, "unused.pdf"), overwrite: false })).pages).toBe(2);
            for (const operation of ["split", "extract", "reorder", "rotate", "metadata"] as const) { const output = join(dir, `${operation}.pdf`); const answer = await runPdfOperation({ operation, inputs: [source], output, overwrite: false, pages: [1], rotation: 90, metadata: { title: "Worldlens" } }); expect(answer.ok, answer.message).toBe(true); expect((await PDFDocument.load(await readFile(output))).getPageCount()).toBe(1); }
            const merged = join(dir, "merged.pdf"); const merge = await runPdfOperation({ operation: "merge", inputs: [source, second], output: merged, overwrite: false }); expect(merge.ok).toBe(true); expect(merge.pages).toBe(3);
            const overwrite = await runPdfOperation({ operation: "split", inputs: [source], output: merged, overwrite: false, pages: [0] }); expect(overwrite.ok).toBe(false); expect(overwrite.message).toContain("already exists");
        } finally { await rm(dir, { recursive: true, force: true }); }
    });
});
