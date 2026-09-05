// The guard for check-workflow-drift.mjs's Chunker version check.
//
// The interesting part is not that the check notices a mismatch; it is what it *says* when it
// does. Every field of a drift record is printed straight to a terminal - `--list` prints
// `expected`, and the failure report prints `expected`, `found` and `why` for every problem -
// so those strings are user-facing output, not internal notes, and they have to read as plain
// technical English to somebody who has never seen this repository before.
//
// `chunkerVersionDrift` is exercised directly with a fixture repository, because the branch
// that emits the pinned-commit record only fires when the vendored submodule and the workflow
// tag genuinely disagree, which the committed tree never does.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

import { chunkerVersionDrift } from "./check-workflow-drift.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The tag the real workflow names, read rather than restated so the two cannot drift here. */
function workflowTag() {
    const workflow = readFileSync(join(REPO_ROOT, ".github/workflows/chunk-world.yml"), "utf8");
    const match = /CHUNKER_TAG:\s*(\S+)/.exec(workflow);
    assert.ok(match !== null, "chunk-world.yml no longer declares CHUNKER_TAG");
    return match[1];
}

function git(cwd, args) {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/**
 * A fixture repository root: a real `vendor/Chunker` git repository whose tag points at one
 * commit and whose HEAD points at a later one, plus an app source file declaring `version`.
 * Returns the fixture root and the commit the submodule is pinned to.
 */
function fixture({ tag, appVersion, commits = 2 }) {
    const root = mkdtempSync(join(tmpdir(), "workflow-drift-"));
    const vendor = join(root, "vendor", "Chunker");
    mkdirSync(vendor, { recursive: true });

    git(vendor, ["init", "--quiet"]);
    git(vendor, ["config", "user.name", "fixture"]);
    git(vendor, ["config", "user.email", "fixture@example.invalid"]);
    // Without this, a machine with autocrlf on prints a line-ending warning per commit.
    git(vendor, ["config", "core.autocrlf", "false"]);
    for (let index = 0; index < commits; index += 1) {
        writeFileSync(join(vendor, "file.txt"), `commit ${String(index)}\n`);
        git(vendor, ["add", "file.txt"]);
        git(vendor, ["commit", "--quiet", "-m", `commit ${String(index)}`]);
        if (index === 0) git(vendor, ["tag", tag]);
    }

    const appDir = join(root, "design/packages/app/src/main/bedrock");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, "chunker.ts"), `const PINNED = { version: "${appVersion}" };\n`);

    return { root, pinned: git(vendor, ["rev-parse", "HEAD"]) };
}

test("names the pinned commit in plain English when the submodule and the workflow tag differ", () => {
    const tag = workflowTag();
    // The app agrees with the workflow tag, so the earlier app-version branch cannot fire and
    // the record under test is the pinned-commit one.
    const { root, pinned } = fixture({ tag, appVersion: tag });
    try {
        const problems = chunkerVersionDrift(root);
        assert.equal(problems.length, 1);
        const [problem] = problems;
        assert.equal(problem.id, "chunker-version");
        assert.equal(problem.expected, `the pinned submodule (${pinned.slice(0, 8)})`);
        assert.ok(problem.found.includes(tag));
        assert.equal(problem.why, "the Chunker the app builds and the Chunker the workflow downloads");
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("every printed field of a drift record is plain technical English", () => {
    // These strings reach a developer's terminal and any log the check is wired into, so they
    // are held to the ordinary words the rest of the project's output uses. Anything outside
    // this vocabulary is either a typo or informal shorthand that should never have shipped.
    const allowed = new Set([
        "the",
        "a",
        "and",
        "is",
        "it",
        "pinned",
        "submodule",
        "app",
        "application",
        "repository",
        "workflow",
        "workflows",
        "version",
        "versions",
        "tag",
        "builds",
        "bundles",
        "downloads",
        "ships",
        "chunker",
        "commit",
        "formats",
        "list",
        "own",
        "decides",
        "which",
        "same",
    ]);

    const tag = workflowTag();
    const cases = [
        fixture({ tag, appVersion: tag }),
        // A different app version takes the other branch, whose wording is checked too.
        fixture({ tag, appVersion: `${tag}-different` }),
    ];
    try {
        for (const { root } of cases) {
            const problems = chunkerVersionDrift(root);
            assert.equal(problems.length, 1);
            for (const field of ["expected", "found", "why"]) {
                const words = problems[0][field]
                    .replace(/\([^)]*\)/g, " ")
                    .split(/[^A-Za-z]+/)
                    .filter((word) => word.length > 0);
                for (const word of words) {
                    assert.ok(
                        allowed.has(word.toLowerCase()),
                        `${field} contains "${word}", which is not plain technical English: ` +
                            problems[0][field],
                    );
                }
            }
        }
    } finally {
        for (const { root } of cases) rmSync(root, { recursive: true, force: true });
    }
});

test("an uninitialised submodule is skipped rather than reported", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-drift-"));
    try {
        mkdirSync(join(root, "vendor", "Chunker"), { recursive: true });
        assert.ok(!existsSync(join(root, "vendor", "Chunker", ".git")));
        assert.deepEqual(chunkerVersionDrift(root), []);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
