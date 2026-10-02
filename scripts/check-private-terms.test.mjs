/**
 * The guard for check-private-terms.mjs.
 *
 * Every term used here is invented for the test and written into a temporary terms file,
 * so this file names none of the real ones. That is the same reason the script itself
 * reads its terms from outside this repository: holding them is the leak.
 *
 * The load-bearing case is the wrapped line. The script's terms are mostly two or three
 * words, and the prose this repository actually carries lives in wrapped comment blocks,
 * so a term whose words land on either side of a line break is the ordinary shape rather
 * than a corner. A scan that tested each line on its own would report "clean" over every
 * one of those, which is the exact failure a fail-closed check exists to prevent.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { matcher, readTerms, scanFiles } from "./check-private-terms.mjs";

const TERMS = ["zorbling quibbet", "flimwaddle"];

function scratch() {
    return mkdtempSync(join(tmpdir(), "private-terms-"));
}

/** Writes `content` into a throwaway file and returns every hit the scan reports for it. */
function scanText(content, terms = TERMS) {
    const dir = scratch();
    try {
        const file = join(dir, "sample.mjs");
        writeFileSync(file, content);
        return scanFiles([file], matcher(terms)).map((hit) => hit.line);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test("reads one term per line, ignoring blanks and comments", () => {
    const dir = scratch();
    try {
        const path = join(dir, "terms.txt");
        writeFileSync(path, "# a note\nzorbling quibbet\n\n  flimwaddle  \n");
        const previous = process.env.WORLDLENS_PRIVATE_TERMS_FILE;
        process.env.WORLDLENS_PRIVATE_TERMS_FILE = path;
        try {
            assert.deepEqual(readTerms(), ["zorbling quibbet", "flimwaddle"]);
        } finally {
            if (previous === undefined) delete process.env.WORLDLENS_PRIVATE_TERMS_FILE;
            else process.env.WORLDLENS_PRIVATE_TERMS_FILE = previous;
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("finds a term that sits whole on one line", () => {
    assert.deepEqual(scanText("const a = 1;\n// a zorbling quibbet here\n"), [2]);
});

test("finds a term wrapped across a block-comment continuation", () => {
    // The shape this repository's prose actually takes: a sentence wrapped inside a
    // comment block, so the second word arrives behind a leading asterisk.
    const text = ["/**", " * This paragraph mentions a zorbling", " * quibbet in passing.", " */", ""].join(
        "\n",
    );
    assert.deepEqual(scanText(text), [2]);
});

test("finds a term wrapped across a line-comment continuation", () => {
    const text = ["// a wrapped zorbling", "// quibbet in a line comment", ""].join("\n");
    assert.deepEqual(scanText(text), [1]);
});

test("finds a term wrapped with no comment marker at all", () => {
    assert.deepEqual(scanText("plain prose about a zorbling\nquibbet and nothing else\n"), [1]);
});

test("finds a term wrapped across a hash comment and a Markdown quote", () => {
    assert.deepEqual(scanText("# a zorbling\n# quibbet\n"), [1]);
    assert.deepEqual(scanText("> a zorbling\n> quibbet\n"), [1]);
});

test("reports a wrapped hit once, at the line the term starts on", () => {
    const text = ["/**", " * one zorbling", " * quibbet only", " */", ""].join("\n");
    assert.deepEqual(scanText(text), [2]);
});

test("reports a single-line hit once rather than twice", () => {
    assert.deepEqual(scanText("// zorbling quibbet\n"), [1]);
});

test("keeps the whole-word rule across a wrap", () => {
    // "zorblings" is a longer word, so neither the joined view nor the per-line pass
    // may count it, and a wrap must not manufacture a boundary that is not there.
    assert.deepEqual(scanText("a zorblings\nquibbet appears\n"), []);
    assert.deepEqual(scanText("a zorbling\nquibbets appear\n"), []);
});

test("does not join across the end of a comment block", () => {
    // `*/` closes the comment; the words on either side of it are not one phrase.
    const text = ["/** trailing zorbling", " */", "quibbet();", ""].join("\n");
    assert.deepEqual(scanText(text), []);
});

test("finds every wrapped hit in a file, in line order", () => {
    const text = [
        "/**",
        " * first zorbling",
        " * quibbet, then a flimwaddle",
        " * and a second zorbling",
        " * quibbet.",
        " */",
        "",
    ].join("\n");
    assert.deepEqual(scanText(text), [2, 3, 4]);
});

test("skips a file that reads as binary", () => {
    const dir = scratch();
    try {
        const file = join(dir, "blob.bin");
        writeFileSync(file, Buffer.concat([Buffer.from([0]), Buffer.from("zorbling quibbet", "utf8")]));
        assert.deepEqual(scanFiles([file], matcher(TERMS)), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
