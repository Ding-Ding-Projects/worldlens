/**
 * `splitFile`'s resume - the fix for "pause redoes the whole 8.69 GB split", tested at a
 * scale a CI runner can actually afford.
 *
 * These are written to be run with the project's own test runner (`vitest`) but are
 * **not run as part of this task** - per the workflow this file was produced under, only
 * written. Reviewer note: read `split.ts`'s module doc comment first; every scenario
 * below exists because that comment makes a specific, checkable promise.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { splitFile } from "./split.js";
import type { SplitPerformed } from "./split.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-split-resume-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

/** A source big enough to need three parts at a tiny part size, and never all-zero. */
function makeSource(partSize: number, parts: number): Buffer {
    // A whole number of parts plus a partial one, so the last-part-is-smaller path is
    // exercised the same way it would be on a real, non-part-size-aligned world archive.
    return randomBytes(partSize * (parts - 1) + Math.floor(partSize / 2));
}

describe("splitFile resume", () => {
    it("an interrupted split resumes from the last provable part, rather than from zero", async () => {
        const partSize = 4096;
        const source = join(workDir, "world.zip");
        const bytes = makeSource(partSize, 4);
        await writeFile(source, bytes);

        // First attempt: split, but abort partway through by using an AbortController
        // that fires after the first part's boundary callback - which is exactly the
        // clean boundary a real pause lands on. Nothing after that boundary should ever
        // be treated as "already done" by attempt two.
        const controller = new AbortController();
        let boundaries = 0;
        await expect(
            splitFile(source, {
                partSize,
                outDir: workDir,
                signal: controller.signal,
                onPartBoundary: () => {
                    boundaries += 1;
                    if (boundaries === 1) controller.abort();
                },
            }),
        ).rejects.toThrow();

        // Exactly one part should exist on disk - the one whose boundary fired before
        // the abort - and no manifest, because the split did not finish.
        const afterAbort = (await readdir(workDir)).sort();
        expect(afterAbort).toContain("world.zip.001");
        expect(afterAbort).not.toContain("world.zip.parts.json");
        expect(afterAbort.some((name) => name.endsWith(".parts.inprogress.json"))).toBe(true);

        // Second attempt, no abort this time: the digest recomputation and the write for
        // part one must be skipped entirely - `partsResumed` says so - and the result
        // must still be byte-for-byte correct, because a resume that produces the wrong
        // manifest is worse than one that is merely slow.
        const result = (await splitFile(source, { partSize, outDir: workDir })) as SplitPerformed;
        expect(result.split).toBe(true);
        expect(result.partsResumed).toBeGreaterThanOrEqual(1);
        expect(result.manifest.parts).toHaveLength(4);

        // Rejoin by hand (this package's own `joinParts` is the real consumer, but this
        // test only needs to prove the manifest and the bytes agree with each other).
        const rejoined = Buffer.concat(
            await Promise.all(result.partPaths.map(async (path) => await readFile(path))),
        );
        expect(rejoined.equals(bytes)).toBe(true);
        expect(await readdir(workDir)).not.toEqual(
            expect.arrayContaining([expect.stringMatching(/\.parts\.inprogress\.json$/)]),
        );
    });

    it("never mistakes a partial split for a complete one", async () => {
        const partSize = 4096;
        const source = join(workDir, "world.zip");
        const bytes = makeSource(partSize, 3);
        await writeFile(source, bytes);

        const controller = new AbortController();
        await expect(
            splitFile(source, {
                partSize,
                outDir: workDir,
                signal: controller.signal,
                onPartBoundary: () => controller.abort(),
            }),
        ).rejects.toThrow();

        // The manifest - the one file every other reader of this directory trusts as
        // "the split finished" - must not exist. A caller (`runner.ts`'s upload phase,
        // or an external tool) that only checks for the manifest must never be misled
        // into thinking this half-finished directory is ready to publish.
        const files = await readdir(workDir);
        expect(files).not.toContain("world.zip.parts.json");
    });

    it("re-cuts a corrupted part rather than trusting it", async () => {
        const partSize = 4096;
        const source = join(workDir, "world.zip");
        const bytes = makeSource(partSize, 3);
        await writeFile(source, bytes);

        const controller = new AbortController();
        let boundaries = 0;
        await expect(
            splitFile(source, {
                partSize,
                outDir: workDir,
                signal: controller.signal,
                onPartBoundary: () => {
                    boundaries += 1;
                    if (boundaries === 2) controller.abort();
                },
            }),
        ).rejects.toThrow();

        // Corrupt the first part in place - same size (so the cheap size check alone
        // would wrongly accept it), different bytes. Only a rehash catches this.
        const partOnePath = join(workDir, "world.zip.001");
        const corrupted = Buffer.alloc((await stat(partOnePath)).size, 0xff);
        await writeFile(partOnePath, corrupted);

        const result = (await splitFile(source, { partSize, outDir: workDir })) as SplitPerformed;
        expect(result.split).toBe(true);
        // The corrupted part must have been re-cut, not resumed from - so it is not
        // counted among what this attempt was able to skip.
        expect(result.partsResumed).toBe(0);

        const rejoined = Buffer.concat(
            await Promise.all(result.partPaths.map(async (path) => await readFile(path))),
        );
        expect(rejoined.equals(bytes)).toBe(true);
    });

    it("the in-progress marker is cleared once the split actually completes", async () => {
        const partSize = 4096;
        const source = join(workDir, "world.zip");
        await writeFile(source, makeSource(partSize, 2));

        await splitFile(source, { partSize, outDir: workDir });

        const files = await readdir(workDir);
        expect(files).toContain("world.zip.parts.json");
        expect(files.some((name) => name.endsWith(".parts.inprogress.json"))).toBe(false);
    });

    it("trusts nothing left over with no matching in-progress marker", async () => {
        const partSize = 4096;
        const source = join(workDir, "world.zip");
        const bytes = makeSource(partSize, 2);
        await writeFile(source, bytes);

        // Debris from something else entirely: a correctly-sized `.001` file with no
        // marker to vouch for it, and no relationship to this source's real bytes. A
        // resume that trusted bare existence would splice this straight into the split.
        const firstPartSize = Math.min(partSize, (await stat(source)).size);
        await writeFile(join(workDir, "world.zip.001"), randomBytes(firstPartSize));

        const result = (await splitFile(source, { partSize, outDir: workDir })) as SplitPerformed;
        expect(result.partsResumed).toBe(0);
        const rejoined = Buffer.concat(
            await Promise.all(result.partPaths.map(async (path) => await readFile(path))),
        );
        expect(rejoined.equals(bytes)).toBe(true);
    });
});
