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
        for (const [index, line] of text.split(/\r?\n/).entries()) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) hits.push({ file, line: index + 1 });
        }
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
