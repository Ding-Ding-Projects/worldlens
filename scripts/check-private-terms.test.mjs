// The guard for check-private-terms.mjs.
//
// Every term used here is invented for the test and written into a temporary terms file, so
// this file names none of the real ones. That is the same reason the script itself reads its
// terms from outside this repository: holding them is the leak.
//
// The behaviour these tests exist for is the wrapped phrase. Every real term is a phrase and
// this repository hard-wraps its prose comments, so a phrase whose two halves land either side
// of a line break is the ordinary shape rather than an edge case. A sweep that tested one line
// at a time could never match one, and reported the file clean.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { collapseWrappedLines, matcher, readTerms, scanFiles } from "./check-private-terms.mjs";

const TERMS = ["zorbling quibbet", "flimsen"];

function scratch() {
    return mkdtempSync(join(tmpdir(), "private-terms-"));
}

/** Writes one file into a fresh temporary directory and returns its absolute path. */
function fixture(dir, name, contents) {
    const path = join(dir, name);
    writeFileSync(path, contents);
    return path;
}

test("finds a phrase wrapped across a line break in a block comment, at the line it starts on", () => {
    const dir = scratch();
    try {
        const path = fixture(
            dir,
            "wrapped.mjs",
            ["/**", " * A sentence that runs on past the zorbling", " * quibbet and keeps going.", " */", ""].join(
                "\n",
            ),
        );
        assert.deepEqual(scanFiles([path], matcher(TERMS)), [{ file: path, line: 2 }]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("finds the same phrase wrapped after a // marker and after a # marker", () => {
    const dir = scratch();
    try {
        const slashes = fixture(dir, "slashes.mjs", ["// leading zorbling", "// quibbet trailing", ""].join("\n"));
        const hashes = fixture(dir, "hashes.yml", ["# leading zorbling", "#   quibbet trailing", ""].join("\n"));
        assert.deepEqual(scanFiles([slashes], matcher(TERMS)), [{ file: slashes, line: 1 }]);
        assert.deepEqual(scanFiles([hashes], matcher(TERMS)), [{ file: hashes, line: 1 }]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("finds a phrase wrapped across a CRLF break", () => {
    const dir = scratch();
    try {
        const path = fixture(dir, "crlf.md", ["Prose that ends in zorbling", "quibbet and continues.", ""].join("\r\n"));
        assert.deepEqual(scanFiles([path], matcher(TERMS)), [{ file: path, line: 1 }]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("still finds a phrase inside one line, and reports each matching line once", () => {
    const dir = scratch();
    try {
        const path = fixture(
            dir,
            "inline.md",
            ["nothing here", "a zorbling quibbet and another zorbling quibbet", "nothing here either", "flimsen", ""].join(
                "\n",
            ),
        );
        assert.deepEqual(scanFiles([path], matcher(TERMS)), [
            { file: path, line: 2 },
            { file: path, line: 4 },
        ]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("does not join two paragraphs across a blank line into a phrase neither contains", () => {
    const dir = scratch();
    try {
        const path = fixture(dir, "paragraphs.md", ["A paragraph ending in zorbling", "", "quibbet opens the next.", ""].join("\n"));
        assert.deepEqual(scanFiles([path], matcher(TERMS)), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("leaves an unrelated file clean, and skips a file that reads as binary", () => {
    const dir = scratch();
    try {
        const clean = fixture(dir, "clean.md", "Ordinary prose with no term in it.\n");
        assert.deepEqual(scanFiles([clean], matcher(TERMS)), []);

        const binary = join(dir, "binary.bin");
        writeFileSync(binary, Buffer.concat([Buffer.from("zorbling quibbet"), Buffer.from([0])]));
        assert.deepEqual(scanFiles([binary], matcher(TERMS)), []);

        // A path that cannot be read is skipped rather than crashing the sweep.
        assert.deepEqual(scanFiles([join(dir, "absent.md")], matcher(TERMS)), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a substring inside a longer word is still not a match after folding", () => {
    const dir = scratch();
    try {
        const path = fixture(dir, "substring.md", ["prezorbling", "quibbetish", ""].join("\n"));
        assert.deepEqual(scanFiles([path], matcher(TERMS)), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("collapseWrappedLines folds one break to one space and a blank line to two", () => {
    assert.equal(collapseWrappedLines("one\ntwo").normalized, "one two");
    assert.equal(collapseWrappedLines(" * one\n * two").normalized, " * one two");
    assert.equal(collapseWrappedLines("one\n\ntwo").normalized, "one  two");
    assert.equal(collapseWrappedLines("one two").normalized, "one two");
});

test("reads a term file, ignoring blanks and comments, and returns null without one", () => {
    const dir = scratch();
    try {
        const path = join(dir, "terms.txt");
        writeFileSync(path, ["# a comment", "", "  zorbling quibbet  ", "flimsen", ""].join("\n"));

        const previous = process.env.WORLDLENS_PRIVATE_TERMS_FILE;
        try {
            process.env.WORLDLENS_PRIVATE_TERMS_FILE = path;
            assert.deepEqual(readTerms(), TERMS);

            process.env.WORLDLENS_PRIVATE_TERMS_FILE = join(dir, "absent.txt");
            assert.equal(readTerms(), null);

            delete process.env.WORLDLENS_PRIVATE_TERMS_FILE;
            assert.equal(readTerms(), null);
        } finally {
            if (previous === undefined) delete process.env.WORLDLENS_PRIVATE_TERMS_FILE;
            else process.env.WORLDLENS_PRIVATE_TERMS_FILE = previous;
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
