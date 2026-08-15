/**
 * The capture record, written to disk as it happens rather than accumulated only in memory.
 *
 * `packages/app/test/screenshots.spec.ts` documents, at length, why an in-memory array is the wrong
 * home for this: Playwright restarts the worker process after a failing test and re-imports the spec
 * file for whatever tests are left, so any module-level array is empty again the moment that happens
 * - and a manifest built from "whatever survived the last restart" silently under-reports a run that
 * genuinely captured most of its set. `packages/app/test/captureLedger.ts` is the fix there; this is
 * the same fix, trimmed to what this harness actually needs.
 *
 * What is trimmed, and why it is safe to trim: the adult harness's own ledger also carries a
 * `RequiredSurface`/`CoverageVerdict` pair, because its capture set is *discovered* from the running
 * application (settings sections read off their own `data-anchor`, tabs read off the live tab strip),
 * so "did we get everything" is a real open question a fixed list cannot answer for it. This
 * harness's capture set is the opposite: a short, hand-enumerated list in `capture.spec.ts` itself,
 * decided in advance rather than discovered at run time. Its own closing step can therefore just
 * assert the manifest holds exactly the entries that list names, which is a stronger check than a
 * coverage verdict would be and needs none of that machinery.
 *
 * JSON Lines rather than one JSON document, for the identical reason the adult ledger uses it: one
 * `appendFileSync` per capture means a worker killed mid-run leaves a file that is still readable up
 * to its last complete line, where rewriting a whole array on every capture would instead risk a
 * truncated document that parses as nothing at all.
 */
import { appendFileSync, readFileSync, rmSync } from "node:fs";

export interface LedgerCapture {
    readonly file: string;
    readonly surface: string;
    readonly state: Readonly<Record<string, unknown>>;
    readonly alt: string;
    readonly capturedAt: string;
}

/** Empties the ledger for a fresh run. Call once, before the first capture. */
export function resetLedger(path: string): void {
    rmSync(path, { force: true });
}

export function appendLedger(path: string, entry: LedgerCapture): void {
    appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}

/**
 * Parses the ledger, last writer per file name winning - a capture that is retried after a worker
 * restart legitimately appears twice, and the later attempt is the one describing what is actually
 * on disk. A line that fails to parse is dropped rather than throwing: a partial final line from a
 * killed worker is expected debris, not a reason to lose every entry before it.
 */
export function readLedger(path: string): LedgerCapture[] {
    let text: string;
    try {
        text = readFileSync(path, "utf8");
    } catch {
        return [];
    }
    const byFile = new Map<string, LedgerCapture>();
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        try {
            const entry = JSON.parse(trimmed) as Partial<LedgerCapture>;
            if (typeof entry.file === "string") byFile.set(entry.file, entry as LedgerCapture);
        } catch {
            // A partial final line from a killed worker - see this module's own doc comment.
        }
    }
    return [...byFile.values()];
}
