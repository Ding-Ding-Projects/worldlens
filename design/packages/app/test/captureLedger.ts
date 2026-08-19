/**
 * The capture record, written to disk as it happens rather than accumulated in memory.
 *
 * ## Why this file exists at all
 *
 * The harness used to keep two module-level arrays - one of captures, one of named gaps - and
 * the closing tests read those arrays to write `manifest.json` and to assert that every surface
 * needing nothing but the application had actually been photographed.
 *
 * Playwright discards a worker process after a test fails and starts a fresh one for whatever is
 * left. A fresh worker re-imports the spec file, so both arrays come back empty, and the closing
 * tests - which run last, and therefore always in the *final* worker - read arrays describing
 * only the handful of surfaces that happened to be visited after the last failure.
 *
 * That is not a theoretical hazard. On the run that prompted this module, thirty-four surfaces
 * failed to open, the manifest was written claiming five captures and zero skips, and the
 * assertion named "captured every surface that needs nothing but the application" passed
 * cheerfully against an empty list. It had been passing that way for the whole shell rewrite: a
 * guard that reports success because it lost its own evidence is worse than no guard, because a
 * green tick is what people actually read.
 *
 * A file on disk survives a worker restart, so the record is written where the next worker can
 * still find it. The file lives beside the images in the same output directory the artifact
 * upload already collects, so a failed run carries its own ledger out of CI for reading.
 *
 * ## Why JSON Lines rather than one JSON document
 *
 * An append is a single `appendFileSync` of one complete line, so a worker that is killed
 * mid-run leaves a ledger that is still parseable up to its last complete entry. Rewriting a
 * whole JSON array on every capture would instead give a killed worker a fair chance of leaving
 * behind a truncated document that parses as nothing at all - losing precisely the evidence this
 * exists to preserve, in precisely the situation it exists for.
 *
 * A line that does not parse is dropped rather than throwing, for the same reason: half a line
 * at the end of a killed run is expected debris, and refusing to read the other two hundred good
 * entries because of it would reintroduce the failure this module removes.
 */

import { appendFileSync, readFileSync, rmSync } from "node:fs";

/** One image, and everything a reader needs to publish it with an honest caption. */
export interface LedgerCapture {
    readonly kind: "capture";
    readonly name: string;
    readonly file: string;
    readonly surface: string;
    readonly caption: string;
    readonly alt: string;
    readonly category: string;
    readonly theme: string;
    readonly viewport: string;
    readonly state: string;
    readonly expectedSurface: string;
    readonly commit: string;
    /**
     * ISO-8601, recorded per capture rather than per run - see `shoot()`'s own doc comment on why
     * "how old is this picture" is answered per image instead of by one run-level timestamp that
     * would misdate everything captured a run's own tens of minutes away from it.
     *
     * Declared here because `shoot()` already writes it into every ledger entry and always has;
     * this field was simply missing from the type that describes what `shoot()` writes, which is
     * a real excess-property mismatch rather than a stylistic gap - `tsc` catches it the moment
     * anything actually type-checks this file (its home package's own `tsconfig.json` excludes
     * `test/`, which is exactly how it went unnoticed).
     */
    readonly capturedAt: string;
}

/** One surface this run did not photograph, and why. */
export interface LedgerSkip {
    readonly kind: "skip";
    readonly surface: string;
    readonly reason: string;
}

/**
 * One capture step that ran to completion without throwing.
 *
 * Separate from {@link LedgerCapture} because the two answer different questions and are keyed
 * differently. A capture is an image, named for the file it wrote; a step is a *surface* in the
 * harness's own vocabulary - "Options editor", "Tab finder" - which is the vocabulary the
 * required-surface list is written in and the vocabulary a gap is recorded in. Without this
 * entry the coverage assertion can only see failures, so a step that never ran at all - a worker
 * killed between two tests - is indistinguishable from one that ran perfectly, which is exactly
 * the blind spot that let a run report success while a third of the set was missing.
 */
export interface LedgerStep {
    readonly kind: "step";
    readonly surface: string;
}

export type LedgerEntry = LedgerCapture | LedgerSkip | LedgerStep;

export interface Ledger {
    readonly captures: LedgerCapture[];
    readonly skipped: LedgerSkip[];
    /** Surfaces whose capture step completed without throwing. */
    readonly completed: LedgerStep[];
}

/**
 * Parses a ledger's text into its two lists, last writer winning per key.
 *
 * Deduplication is not tidiness. `beforeAll` runs once per worker, so a worker restart re-drives
 * the first-run flow and re-photographs its steps - and the same surface therefore legitimately
 * appears twice, with the second attempt being the one that describes the file now on disk.
 * Captures are keyed by image name and gaps by surface name, both keeping the later entry, so
 * the ledger describes the run's final state rather than every attempt at reaching it.
 *
 * A surface that was skipped by one worker and captured by another is left in both lists. That
 * is deliberate: this function reports what happened, and it is the caller's business - see the
 * coverage assertion in the spec - to decide what a contradiction means. Silently dropping the
 * skip here would let a surface that failed twice and succeeded once read as a clean capture.
 *
 * Kept pure and given the file's text rather than its path so both of its directions can be
 * exercised without a filesystem, which is what makes the failing direction of the coverage
 * guard testable at all.
 */
export function parseLedger(text: string): Ledger {
    const captures = new Map<string, LedgerCapture>();
    const skipped = new Map<string, LedgerSkip>();
    const completed = new Map<string, LedgerStep>();

    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "") continue;

        let entry: unknown;
        try {
            entry = JSON.parse(trimmed);
        } catch {
            // A partial final line from a killed worker. See this module's own doc comment.
            continue;
        }
        if (typeof entry !== "object" || entry === null) continue;

        const candidate = entry as Partial<LedgerEntry>;
        if (candidate.kind === "capture") {
            const capture = candidate as LedgerCapture;
            if (typeof capture.name !== "string") continue;
            captures.set(capture.name, capture);
            continue;
        }
        if (candidate.kind === "skip") {
            const skip = candidate as LedgerSkip;
            if (typeof skip.surface !== "string") continue;
            skipped.set(skip.surface, skip);
            continue;
        }
        if (candidate.kind === "step") {
            const step = candidate as LedgerStep;
            if (typeof step.surface !== "string") continue;
            completed.set(step.surface, step);
        }
    }

    return {
        captures: [...captures.values()],
        skipped: [...skipped.values()],
        completed: [...completed.values()],
    };
}

/**
 * Empties the ledger for a new run.
 *
 * Called by exactly one worker - the first one - because a restarted worker calling this would
 * erase everything the run had recorded before it crashed, which is the failure this whole
 * module exists to remove, reintroduced through the back door.
 */
export function resetLedger(path: string): void {
    rmSync(path, { force: true });
}

/**
 * Appends one entry.
 *
 * Synchronous on purpose. The alternative is an awaited write inside every capture, and an
 * `await` that is forgotten in one place gives a ledger that is missing exactly the entry
 * somebody forgot - a silent, per-surface gap in the one record whose completeness the closing
 * assertion depends on. These writes are a few hundred bytes each, a few dozen times per run,
 * against a harness that spends most of its life waiting for an Electron window to settle.
 */
export function appendLedger(path: string, entry: LedgerEntry): void {
    appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}

/** Reads the ledger, treating an absent file as an empty one. */
export function readLedger(path: string): Ledger {
    let text: string;
    try {
        text = readFileSync(path, "utf8");
    } catch {
        return { captures: [], skipped: [], completed: [] };
    }
    return parseLedger(text);
}

/**
 * A surface whose absence is a defect rather than a gap, and what it needs to be reachable.
 *
 * `needsLoadedMap` is not an escape hatch, it is a precondition being stated out loud. The
 * viewer's side sheet - and therefore the menu pages, the reset-settings gate and the changelog
 * fold folded inside the Info page - is opened by the map's own control bar, and that bar is
 * rendered only while a BlueMap instance exists (`ControlBar.vue`'s `v-if="app"`). A run with no
 * rendered map to serve has no such instance, so those surfaces are genuinely not on screen for
 * anybody, harness or human. Recording that as "the harness could not open it" would be a false
 * statement about a working screen; recording it as unconditionally required would make the
 * guard permanently red on every run that has no map, and a guard that is always red is a guard
 * that gets deleted.
 */
export interface RequiredSurface {
    readonly surface: string;
    /** True where the surface cannot exist at all until a map is loaded. */
    readonly needsLoadedMap?: boolean;
}

export interface CoverageVerdict {
    /** One line per required surface this run failed to reach, ready to print. */
    readonly missing: string[];
    /**
     * Surfaces held to a lower standard because this run had no map, named rather than dropped.
     *
     * Printed by the assertion whether it passes or fails, so "the run was green" can never
     * quietly mean "twelve surfaces were excused and nobody was told".
     */
    readonly excusedForNoMap: string[];
}

/**
 * Which required surfaces this run failed to reach.
 *
 * A required surface counts as missing when the ledger records a gap for it. A gap that another
 * worker later filled with a real capture is *still* counted, because the ledger cannot tell
 * whether the capture on disk came from the successful attempt or the failed one, and a guard
 * that resolves that ambiguity in favour of "probably fine" is how the previous version of this
 * came to pass while thirty-four surfaces were missing.
 *
 * Pure, and given the ledger rather than a path, so both of its directions can be exercised
 * directly. The failing direction of a coverage guard is otherwise reachable only by breaking
 * the application on purpose and waiting twenty minutes to watch it go red.
 */
export function coverageVerdict(input: {
    readonly ledger: Ledger;
    readonly required: readonly RequiredSurface[];
    /** Whether this run had a rendered map to serve, from the capture target's own mode. */
    readonly hasLoadedMap: boolean;
}): CoverageVerdict {
    const duplicateRequired = input.required
        .map((entry) => entry.surface)
        .filter((surface, index, surfaces) => surfaces.indexOf(surface) !== index);
    if (duplicateRequired.length > 0) {
        throw new Error(
            "capture coverage contract repeats required surfaces: " +
                [...new Set(duplicateRequired)].join(", "),
        );
    }

    const required = new Map(input.required.map((entry) => [entry.surface, entry]));
    const missing: string[] = [];
    const excusedForNoMap: string[] = [];

    const skipped = new Set(input.ledger.skipped.map((gap) => gap.surface));
    const completed = new Set(input.ledger.completed.map((step) => step.surface));
    const contradictory = [...skipped].filter((surface) => completed.has(surface));
    if (contradictory.length > 0) {
        missing.push(
            ...contradictory.map(
                (surface) =>
                    `${surface} - the ledger records both a completed capture step and a skip; ` +
                    "the run must resolve that contradiction before it can claim coverage",
            ),
        );
    }

    for (const gap of input.ledger.skipped) {
        const entry = required.get(gap.surface);
        if (entry === undefined) continue;
        if (entry.needsLoadedMap === true && !input.hasLoadedMap) {
            excusedForNoMap.push(`${gap.surface} - ${gap.reason}`);
            continue;
        }
        missing.push(`${gap.surface} - ${gap.reason}`);
    }

    /*
     * A required surface that recorded neither a completed step nor a gap never ran at all,
     * which is what a worker killed between two tests looks like from here - and what an
     * accidentally deleted capture step looks like too. Reported as missing rather than ignored:
     * "nothing was recorded about it" is the precise state the in-memory arrays used to report
     * as success, and the reason a rule about well-formed records is not a rule about coverage.
     */
    const recorded = new Set([...skipped, ...completed]);
    for (const entry of input.required) {
        if (recorded.has(entry.surface)) continue;
        if (entry.needsLoadedMap === true && !input.hasLoadedMap) {
            excusedForNoMap.push(
                `${entry.surface} - this run had no map, and nothing was recorded about it`,
            );
            continue;
        }
        missing.push(
            `${entry.surface} - nothing at all was recorded about it, so the step that opens it ` +
                "never ran to either outcome",
        );
    }

    return { missing, excusedForNoMap };
}
