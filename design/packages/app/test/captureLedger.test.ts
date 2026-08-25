import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
    appendLedger,
    coverageVerdict,
    parseLedger,
    readLedger,
    resetLedger,
    type RequiredSurface,
} from "./captureLedger.js";

/**
 * The ledger, and the coverage verdict read off it.
 *
 * These exist because the thing they replace was decorative for the whole of a shell rewrite: an
 * assertion reading two module-level arrays, in a harness whose runner discards its worker after
 * every failure and starts a fresh one with both arrays empty. Thirty-four surfaces went
 * uncaptured, the manifest recorded five, and the assertion passed.
 *
 * So the first thing proved here is the failing direction. A guard nobody has watched fail
 * proves nothing, and the failing direction of this one is otherwise reachable only by breaking
 * the application on purpose and waiting out a twenty-minute capture run to watch it go red.
 */

const temporaries: string[] = [];

function ledgerPath(): string {
    const directory = mkdtempSync(join(tmpdir(), "worldlens-ledger-"));
    temporaries.push(directory);
    return join(directory, "capture-ledger.jsonl");
}

afterEach(() => {
    while (temporaries.length > 0) {
        rmSync(temporaries.pop() as string, { recursive: true, force: true });
    }
});

const REQUIRED: readonly RequiredSurface[] = [
    { surface: "Options editor" },
    { surface: "Tab finder" },
    { surface: "Changelog viewer", needsLoadedMap: true },
];

describe("the capture ledger", () => {
    it("survives being read by a process that never wrote to it", () => {
        const path = ledgerPath();
        appendLedger(path, { kind: "step", surface: "Options editor" });
        appendLedger(path, {
            kind: "capture",
            name: "config-screen",
            file: "config-screen.png",
            surface: "The options editor as it opens",
            caption: "The options editor as it opens.",
            alt: "The options editor as it opens",
            category: "settings-customization",
            theme: "light",
            viewport: "1280x800@100%",
            state: "open",
            expectedSurface: "Options editor",
            commit: "0123456789abcdef0123456789abcdef01234567",
            capturedAt: "2026-01-01T00:00:00.000Z",
        });

        // A different reader entirely, which is what a restarted Playwright worker is.
        const ledger = readLedger(path);
        expect(ledger.completed.map((step) => step.surface)).toEqual(["Options editor"]);
        expect(ledger.captures.map((capture) => capture.file)).toEqual(["config-screen.png"]);
    });

    it("keeps the later entry when a worker restart repeats one", () => {
        const ledger = parseLedger(
            [
                JSON.stringify({ kind: "skip", surface: "First-run setup", reason: "first try" }),
                JSON.stringify({ kind: "skip", surface: "First-run setup", reason: "second try" }),
            ].join("\n"),
        );
        expect(ledger.skipped).toEqual([
            { kind: "skip", surface: "First-run setup", reason: "second try" },
        ]);
    });

    it("reads every complete entry either side of a line a killed worker left half-written", () => {
        const ledger = parseLedger(
            [
                JSON.stringify({ kind: "step", surface: "Options editor" }),
                '{"kind":"step","surf',
                JSON.stringify({ kind: "step", surface: "Tab finder" }),
            ].join("\n"),
        );
        expect(ledger.completed.map((step) => step.surface)).toEqual([
            "Options editor",
            "Tab finder",
        ]);
    });

    it("empties the ledger for a new run without failing on a first run that has none", () => {
        const path = ledgerPath();
        resetLedger(path);
        appendLedger(path, { kind: "step", surface: "Tab finder" });
        resetLedger(path);
        expect(readLedger(path).completed).toEqual([]);
    });
});

describe("the coverage verdict", () => {
    it("fails when a required surface was skipped", () => {
        const verdict = coverageVerdict({
            ledger: parseLedger(
                [
                    JSON.stringify({ kind: "step", surface: "Tab finder" }),
                    JSON.stringify({
                        kind: "skip",
                        surface: "Options editor",
                        reason: "the harness could not open it in this run: locator timeout",
                    }),
                    JSON.stringify({ kind: "step", surface: "Changelog viewer" }),
                ].join("\n"),
            ),
            required: REQUIRED,
            hasLoadedMap: true,
        });

        expect(verdict.missing).toEqual([
            "Options editor - the harness could not open it in this run: locator timeout",
        ]);
    });

    /**
     * The exact defect. An empty ledger is what the previous implementation always saw in its
     * final worker, and it read that emptiness as "nothing was skipped, so everything was
     * captured" rather than as "this record knows nothing".
     */
    it("fails on the empty record a lost worker leaves behind, rather than passing", () => {
        const verdict = coverageVerdict({
            ledger: parseLedger(""),
            required: REQUIRED,
            hasLoadedMap: true,
        });

        expect(verdict.missing).toHaveLength(REQUIRED.length);
        for (const line of verdict.missing) {
            expect(line).toMatch(/nothing at all was recorded about it/);
        }
    });

    it("passes when every required surface completed its step", () => {
        const verdict = coverageVerdict({
            ledger: parseLedger(
                REQUIRED.map((entry) =>
                    JSON.stringify({ kind: "step", surface: entry.surface }),
                ).join("\n"),
            ),
            required: REQUIRED,
            hasLoadedMap: true,
        });

        expect(verdict.missing).toEqual([]);
        expect(verdict.excusedForNoMap).toEqual([]);
    });

    /**
     * A single-process run has exactly one attempt at each surface, so a skip and a completed
     * step for the same surface describe one contradictory record rather than two independent
     * attempts. `chunked` defaults to false, so this is the behaviour every existing call site -
     * and every existing single-process run - gets without having to say anything at all.
     */
    it("flags a completed-and-skipped surface as a contradiction in a single-process run", () => {
        const verdict = coverageVerdict({
            ledger: parseLedger(
                [
                    JSON.stringify({ kind: "step", surface: "Options editor" }),
                    JSON.stringify({ kind: "step", surface: "Tab finder" }),
                    JSON.stringify({ kind: "step", surface: "Changelog viewer" }),
                    JSON.stringify({
                        kind: "skip",
                        surface: "Tab finder",
                        reason: "it did not open on the second attempt",
                    }),
                ].join("\n"),
            ),
            required: REQUIRED,
            hasLoadedMap: true,
        });

        expect(verdict.missing).toContain(
            "Tab finder - the ledger records both a completed capture step and a skip; the run " +
                "must resolve that contradiction before it can claim coverage",
        );
    });

    /**
     * A chunked run reaches the identical ledger shape legitimately: one chunk's fresh
     * application skipped "Tab finder" and a different chunk's fresh application, launched
     * later, captured it. The PNG that later attempt wrote is a real file on disk; the earlier
     * skip does not unmake it, so `chunked: true` must let the completed step win rather than
     * reporting either a contradiction or a gap.
     */
    it("lets a completed step win over a skip of the same surface when chunked", () => {
        const verdict = coverageVerdict({
            ledger: parseLedger(
                [
                    JSON.stringify({ kind: "step", surface: "Options editor" }),
                    JSON.stringify({ kind: "step", surface: "Changelog viewer" }),
                    JSON.stringify({
                        kind: "skip",
                        surface: "Tab finder",
                        reason: "the renderer had already crashed by the time this chunk ran",
                    }),
                    JSON.stringify({ kind: "step", surface: "Tab finder" }),
                ].join("\n"),
            ),
            required: REQUIRED,
            hasLoadedMap: true,
            chunked: true,
        });

        expect(verdict.missing).toEqual([]);
        expect(verdict.excusedForNoMap).toEqual([]);
    });

    it("names, rather than hides, the surfaces a run with no map cannot reach", () => {
        const verdict = coverageVerdict({
            ledger: parseLedger(
                [
                    JSON.stringify({ kind: "step", surface: "Options editor" }),
                    JSON.stringify({ kind: "step", surface: "Tab finder" }),
                    JSON.stringify({
                        kind: "skip",
                        surface: "Changelog viewer",
                        reason: "this run served no map, so the viewer's side sheet does not exist",
                    }),
                ].join("\n"),
            ),
            required: REQUIRED,
            hasLoadedMap: false,
        });

        expect(verdict.missing).toEqual([]);
        expect(verdict.excusedForNoMap).toEqual([
            "Changelog viewer - this run served no map, so the viewer's side sheet does not exist",
        ]);
    });

    it("holds a map-dependent surface to the full standard once a map is loaded", () => {
        const verdict = coverageVerdict({
            ledger: parseLedger(
                [
                    JSON.stringify({ kind: "step", surface: "Options editor" }),
                    JSON.stringify({ kind: "step", surface: "Tab finder" }),
                    JSON.stringify({
                        kind: "skip",
                        surface: "Changelog viewer",
                        reason: "the fold did not expand",
                    }),
                ].join("\n"),
            ),
            required: REQUIRED,
            hasLoadedMap: true,
        });

        expect(verdict.missing).toEqual(["Changelog viewer - the fold did not expand"]);
        expect(verdict.excusedForNoMap).toEqual([]);
    });

    it("writes to a file a fresh process can read back, which is the whole point", () => {
        const path = ledgerPath();
        writeFileSync(path, "", "utf8");
        appendLedger(path, { kind: "step", surface: "Options editor" });
        appendLedger(path, { kind: "step", surface: "Tab finder" });
        appendLedger(path, { kind: "step", surface: "Changelog viewer" });

        expect(
            coverageVerdict({ ledger: readLedger(path), required: REQUIRED, hasLoadedMap: true })
                .missing,
        ).toEqual([]);
    });
});
