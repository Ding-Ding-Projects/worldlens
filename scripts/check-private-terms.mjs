#!/usr/bin/env node
/**
 * A fail-closed check for informal internal shorthand leaking into this public repository.
 *
 * This is a second, narrower guard alongside `check-published-text.mjs`. That one scans the
 * surfaces this repository actually publishes (the changelog, the docs, the site) against a
 * terms file resolved from a sibling repository. This one scans every tracked file in the
 * whole working tree against a terms file named by one environment variable, with no
 * fallback location - a deliberately dumb, exhaustive sweep that is cheap to reason about
 * and cheap to point at from CI or from a local pre-commit check.
 *
 * WHY THE TERMS ARE NOT IN THIS FILE
 *
 * Holding them here is the leak this check exists to prevent. The list lives in a file
 * outside this repository, named by `WORLDLENS_PRIVATE_TERMS_FILE`, one term per line
 * (blank lines and lines starting with `#` are ignored). When that variable is unset or the
 * file cannot be read, the check prints a one-line reason and exits 0 - a repository clone
 * with no access to the private list can still build and test cleanly, and a check whose
 * normal state on most machines is red is a check everyone learns to scroll past.
 *
 * WHAT IT SCANS
 *
 * Every path `git ls-files` reports, skipping anything that reads as binary (a NUL byte in
 * the first chunk). A term is matched case-insensitively as a whole word or phrase, so a
 * substring inside an unrelated longer word never counts.
 *
 * Matching runs over the whole file rather than one line at a time, against a copy in which
 * every run of whitespace has been collapsed to a single space and a comment continuation
 * marker that begins a wrapped line (` * `, `// `, `# `, `-- `, `> `) has been dropped. Most
 * of the terms are multi-word phrases and this repository hard-wraps prose comments, so a
 * line-by-line scan cannot see a phrase whose words land on opposite sides of a wrap, and a
 * clean verdict from such a scan would not be evidence of absence. A hit is reported at the
 * line the match begins on.
 *
 * It also inspects the subject line of the last 200 commits, but Git history is immutable
 * here (this repository's remote is public and its history is never rewritten to satisfy a
 * local check), so a hit there is reported for visibility only and never fails the run. The
 * project's separate `scripts/changelog-overrides.json` mechanism is how a historical commit
 * message is kept out of the generated changelog without rewriting history; this scan exists
 * so a maintainer can see, at a glance, which commits still carry the old wording.
 *
 * A term is never printed. A hit is reported as a file and a line number (or a commit SHA
 * for the history scan), because printing the matched word would put it in a terminal, a CI
 * log, or a pasted bug report - the same publication this check exists to prevent.
 *
 * USAGE
 *   WORLDLENS_PRIVATE_TERMS_FILE=/path/to/terms.txt node scripts/check-private-terms.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function git(args) {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The term list, or null when the environment variable is unset or the file cannot be read. */
function readTerms() {
    const envPath = process.env.WORLDLENS_PRIVATE_TERMS_FILE;
    if (!envPath) return null;
    let raw;
    try {
        raw = readFileSync(resolve(envPath), "utf8");
    } catch {
        return null;
    }
    const terms = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
    return terms.length > 0 ? terms : null;
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A case-insensitive, whole-word/whole-phrase matcher, longest term first. */
function matcher(terms) {
    const alternation = [...terms]
        .sort((left, right) => right.length - left.length)
        .map(escape)
        .join("|");
    return new RegExp(`(?<![A-Za-z0-9])(?:${alternation})(?![A-Za-z0-9])`, "gi");
}

function trackedFiles() {
    return git(["ls-files"])
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

const WHITESPACE_RUN = /\s+/g;
/** A comment continuation marker at the head of a wrapped line, plus the space after it. */
const CONTINUATION_MARKER = /^(?:\*|\/\/|#|--|>)(?=[ \t]|$)[ \t]*/;

/**
 * The text with every whitespace run collapsed to a single space and a comment continuation
 * marker dropped, alongside the segments needed to map an offset in the collapsed copy back
 * to an offset in the original.
 */
function collapseWhitespace(text) {
    const segments = [];
    const pieces = [];
    let collapsedLength = 0;
    let cursor = 0;

    const keep = (start, end) => {
        if (end <= start) return;
        segments.push({ collapsedStart: collapsedLength, originalStart: start, length: end - start });
        pieces.push(text.slice(start, end));
        collapsedLength += end - start;
    };
    const separate = () => {
        if (collapsedLength === 0) return; // nothing to separate from yet
        if (pieces[pieces.length - 1] === " ") return; // never two spaces in a row
        pieces.push(" ");
        collapsedLength += 1;
    };

    WHITESPACE_RUN.lastIndex = 0;
    let run;
    while ((run = WHITESPACE_RUN.exec(text)) !== null) {
        keep(cursor, run.index);
        let next = run.index + run[0].length;
        if (run[0].includes("\n")) {
            const marker = CONTINUATION_MARKER.exec(text.slice(next, next + 8));
            if (marker) next += marker[0].length;
        }
        separate();
        cursor = next;
        WHITESPACE_RUN.lastIndex = next;
    }
    keep(cursor, text.length);

    return { collapsed: pieces.join(""), segments };
}

/** The offset in the original text that a collapsed-text offset came from. */
function originalOffset(segments, collapsedIndex) {
    let low = 0;
    let high = segments.length - 1;
    let fallback = 0;
    while (low <= high) {
        const middle = (low + high) >> 1;
        const segment = segments[middle];
        if (collapsedIndex < segment.collapsedStart) {
            fallback = segment.originalStart;
            high = middle - 1;
        } else if (collapsedIndex >= segment.collapsedStart + segment.length) {
            fallback = segment.originalStart + segment.length;
            low = middle + 1;
        } else {
            return segment.originalStart + (collapsedIndex - segment.collapsedStart);
        }
    }
    return fallback;
}

/** The 1-based line number that an offset in the original text falls on. */
function lineNumberAt(lineStarts, offset) {
    let low = 0;
    let high = lineStarts.length - 1;
    let line = 0;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (lineStarts[middle] <= offset) {
            line = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return line + 1;
}

function lineStartsOf(text) {
    const starts = [0];
    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === "\n") starts.push(index + 1);
    }
    return starts;
}

/** Every hit in the tracked files, as { file, line }. Binary files are skipped. */
function scanFiles(files, pattern) {
    const hits = [];
    for (const file of files) {
        let raw;
        try {
            raw = readFileSync(resolve(REPO_ROOT, file));
        } catch {
            continue;
        }
        if (raw.subarray(0, 8000).includes(0)) continue; // binary, not a leak of text
        const text = raw.toString("utf8");
        const { collapsed, segments } = collapseWhitespace(text);

        const offsets = new Set();
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(collapsed)) !== null) {
            offsets.add(originalOffset(segments, match.index));
            if (match[0].length === 0) pattern.lastIndex += 1; // no term is empty, but do not hang if one is
        }
        if (offsets.size === 0) continue;

        const lineStarts = lineStartsOf(text);
        const lines = new Set([...offsets].map((offset) => lineNumberAt(lineStarts, offset)));
        for (const line of [...lines].sort((left, right) => left - right)) hits.push({ file, line });
    }
    return hits;
}

/** Commits whose subject line matches, for the report-only history scan. Never fails the run. */
function scanCommitSubjects(pattern, limit = 200) {
    const RECORD = "\x1e";
    const raw = git(["log", `-n${limit}`, `--format=%H${RECORD}%s`]);
    const hits = [];
    for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const [sha, subject] = line.split(RECORD);
        pattern.lastIndex = 0;
        if (subject && pattern.test(subject ?? "")) hits.push(sha);
    }
    return hits;
}

function main() {
    const terms = readTerms();
    if (terms === null) {
        process.stdout.write("private-terms check skipped: no term file\n");
        return;
    }

    const files = trackedFiles();
    const fileHits = scanFiles(files, matcher(terms));

    const historyPattern = matcher(terms);
    const commitHits = scanCommitSubjects(historyPattern);
    if (commitHits.length > 0) {
        process.stdout.write(
            `check-private-terms: ${commitHits.length} of the last 200 commit subject(s) still carry ` +
                "informal wording. History is immutable here, so this is report-only and does not fail " +
                "the run; see scripts/changelog-overrides.json to keep the generated changelog clean:\n" +
                commitHits.map((sha) => `  ${sha}\n`).join(""),
        );
    }

    if (fileHits.length === 0) {
        process.stdout.write(
            `check-private-terms: clean - ${files.length} tracked file(s) checked against ${terms.length} term(s)\n`,
        );
        return;
    }

    for (const hit of fileHits) {
        process.stderr.write(`${hit.file}:${hit.line}: internal shorthand\n`);
    }
    process.stderr.write(
        `check-private-terms: ${fileHits.length} hit(s) in ${new Set(fileHits.map((hit) => hit.file)).size} file(s).\n`,
    );
    process.exitCode = 1;
}

export { matcher, readTerms, scanCommitSubjects, scanFiles, trackedFiles };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
