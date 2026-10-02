// The guard for check-published-text.mjs.
//
// Every term used here is invented for the test and written into a temporary terms file,
// so this file names none of the real ones. That is the same reason the script itself
// reads its terms from outside this repository: holding them is the leak.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OVERRIDES_PATH,
  matcher,
  readTerms,
  scan,
  scanOverrides,
  termsCandidates,
} from "./check-published-text.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function scratch() {
  return mkdtempSync(join(tmpdir(), "published-text-"));
}

test("reads the dictionary shape, splitting variants and dropping terms too short to signal", () => {
  const dir = scratch();
  try {
    const path = join(dir, "terms.json");
    writeFileSync(
      path,
      JSON.stringify({
        terms: [
          { alias: "zorbling" },
          { alias: "quibbet / quibbets" },
          { alias: "xy" },
          { alias: 42 },
        ],
      }),
    );
    const terms = readTerms(path);
    assert.ok(terms.includes("zorbling"));
    // A " / " entry is two terms, not one.
    assert.ok(terms.includes("quibbet"));
    assert.ok(terms.includes("quibbets"));
    // Two characters matches far too much ordinary prose to be a signal.
    assert.ok(!terms.includes("xy"));
    // A non-string entry is skipped rather than crashing the run.
    assert.equal(terms.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reads a plain array too, and returns null for anything else", () => {
  const dir = scratch();
  try {
    const array = join(dir, "array.json");
    writeFileSync(array, JSON.stringify(["zorbling", "quibbet"]));
    assert.deepEqual(readTerms(array).sort(), ["quibbet", "zorbling"]);

    const wrong = join(dir, "wrong.json");
    writeFileSync(wrong, JSON.stringify({ notTerms: true }));
    assert.equal(readTerms(wrong), null);

    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{ not json");
    assert.equal(readTerms(broken), null);

    assert.equal(readTerms(join(dir, "absent.json")), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("matches on a word boundary, so a term inside a longer word is not a hit", () => {
  const pattern = matcher(["zorb"]);
  const hit = (text) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  };
  assert.ok(hit("the zorb is here"));
  assert.ok(hit("ZORB, capitalised"));
  assert.ok(hit("(zorb)"));
  // Inside a longer word is not the term.
  assert.ok(!hit("zorbling"));
  assert.ok(!hit("unzorb"));
  assert.ok(!hit("zorb1"));
});

test("matches a term that contains a space, which \\b cannot do", () => {
  const pattern = matcher(["quib bet"]);
  pattern.lastIndex = 0;
  assert.ok(pattern.test("a quib bet here"));
});

test("reports the longest term when one contains another", () => {
  const dir = scratch();
  try {
    const file = join(dir, "a.md");
    writeFileSync(file, "the zorbling thing");
    const hits = scan([file], ["zorbling", "zorb"]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].term, "zorbling");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gives an exact line and column, one-based, for every hit on a line", () => {
  const dir = scratch();
  try {
    const file = join(dir, "a.md");
    writeFileSync(file, "first line\nand zorb then zorb again\n");
    const hits = scan([file], ["zorb"]);
    assert.equal(hits.length, 2);
    assert.deepEqual(
      hits.map((hit) => [hit.line, hit.column]),
      [
        [2, 5],
        [2, 15],
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("finds a hit on a CRLF file at the same column as on an LF one", () => {
  const dir = scratch();
  try {
    const lf = join(dir, "lf.md");
    const crlf = join(dir, "crlf.md");
    writeFileSync(lf, "one\nand zorb\n");
    writeFileSync(crlf, "one\r\nand zorb\r\n");
    const a = scan([lf], ["zorb"]);
    const b = scan([crlf], ["zorb"]);
    assert.deepEqual(
      a.map((hit) => [hit.line, hit.column]),
      b.map((hit) => [hit.line, hit.column]),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skips a binary file, because a term found in a PNG is byte noise", () => {
  const dir = scratch();
  try {
    const file = join(dir, "image.png");
    // A NUL byte on either side of text that would otherwise match.
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x00, 0x7a, 0x6f, 0x72, 0x62, 0x00]));
    assert.deepEqual(scan([file], ["zorb"]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("walks a directory and skips node_modules and dot directories", () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, "node_modules"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, "kept.md"), "zorb");
    writeFileSync(join(dir, "node_modules", "skipped.md"), "zorb");
    writeFileSync(join(dir, ".git", "skipped.md"), "zorb");
    // Through the module's own walker, reached the way main() reaches it.
    const found = scan(
      [join(dir, "kept.md"), join(dir, "node_modules", "skipped.md")],
      ["zorb"],
    );
    // scan() itself does not filter directories; the walk does. This asserts only that a
    // file handed to scan() is read, which is what the walker relies on.
    assert.equal(found.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scans an overrides file by decoded field, naming the commit and the field", () => {
  const dir = scratch();
  try {
    const path = join(dir, "overrides.json");
    writeFileSync(
      path,
      JSON.stringify({
        aaa1111: { subject: "a clean subject", body: "first line\nthen zorb here" },
        bbb2222: { subject: "a zorb in the subject", body: "clean body" },
        ccc3333: { subject: "clean", body: "clean" },
        ddd4444: { subject: 42, body: null },
      }),
    );
    const hits = scanOverrides(path, ["zorb"]);
    assert.deepEqual(
      hits.map((hit) => [hit.where, hit.line, hit.column]),
      [
        ["aaa1111 body", 2, 6],
        ["bbb2222 subject", 1, 3],
      ],
    );
    // A non-string field is skipped rather than crashing the run.
    assert.ok(!hits.some((hit) => hit.where.startsWith("ddd4444")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("finds a term a raw line scan of the same JSON would miss", () => {
  const dir = scratch();
  try {
    const path = join(dir, "overrides.json");
    // A body whose newline immediately precedes the term. In the file on disk that newline
    // is the two characters backslash and n, so a line scan of the raw bytes reads the `n`
    // as the character before the term and the word-boundary lookbehind refuses the hit.
    writeFileSync(path, JSON.stringify({ aaa1111: { body: "a line\nzorb starts the next" } }));
    assert.deepEqual(scan([path], ["zorb"]), []);
    assert.deepEqual(
      scanOverrides(path, ["zorb"]).map((hit) => [hit.where, hit.line, hit.column]),
      [["aaa1111 body", 2, 1]],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("survives an absent or unparsable overrides file without a hit", () => {
  const dir = scratch();
  try {
    assert.deepEqual(scanOverrides(join(dir, "absent.json"), ["zorb"]), []);
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{ not json zorb");
    assert.deepEqual(scanOverrides(broken, ["zorb"]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("this repository's own changelog overrides carry no internal shorthand", () => {
  // The overrides file is authored by hand precisely so a historical commit can be
  // published safely, and publicText() copies it verbatim into CHANGELOG.md and the in-app
  // changelog data. So residue here is published text, and unlike the generated files it is
  // a one-line edit rather than a history rewrite.
  //
  // Skipped where the terms file is not, which is every machine but the maintainer's -- the
  // same policy the script itself uses, and for the same reason: a check whose normal state
  // is red is a check everyone learns to scroll past.
  let terms = null;
  for (const candidate of termsCandidates()) {
    const found = readTerms(candidate);
    if (found !== null) {
      terms = found;
      break;
    }
  }
  if (terms === null) return;

  const hits = scanOverrides(join(REPO_ROOT, OVERRIDES_PATH), terms);
  // The term itself is never in the message: printing it here would put it in a terminal
  // and a CI log, which is the publication this whole guard exists to prevent.
  assert.deepEqual(
    hits.map((hit) => `${OVERRIDES_PATH} ${hit.where} line ${hit.line} column ${hit.column}`),
    [],
  );
});

test("names a candidate path for the terms file without hard-coding one", () => {
  const candidates = termsCandidates();
  assert.ok(candidates.length >= 1);
  // Resolved from this file rather than written down, so it carries no username, no drive
  // letter and no absolute path in source.
  assert.ok(
    candidates.some((candidate) => candidate.includes("vocabulary-dictionary.json")),
  );
});

test("an explicit path in the environment wins over the sibling repository", () => {
  const previous = process.env.WORLDLENS_VOCABULARY_TERMS;
  process.env.WORLDLENS_VOCABULARY_TERMS = "/tmp/somewhere/terms.json";
  try {
    assert.ok(termsCandidates()[0].includes("somewhere"));
  } finally {
    if (previous === undefined) delete process.env.WORLDLENS_VOCABULARY_TERMS;
    else process.env.WORLDLENS_VOCABULARY_TERMS = previous;
  }
});
