#!/usr/bin/env node
/**
 * A pre-publication check for the maintainers' internal shorthand in text this repository
 * publishes: the generated changelog, CHANGELOG.md, the documentation site, the README,
 * and - the case that started this - a commit message, before it is written. It also reads
 * `scripts/changelog-overrides.json`, whose hand-written subjects and bodies are copied
 * verbatim into the changelog surfaces, so it is published text one step before publication.
 *
 * The point issue #168 makes is that the eleven files fixed in fa2f5abb were found by a
 * manual sweep, and a manual sweep is exactly what will not happen next time.
 *
 * WHY THE TERMS ARE NOT IN THIS FILE
 *
 * Because holding them is the leak. The previous sign-in guard listed seven of them in
 * source in order to assert their absence, which published the exact words it existed to
 * keep unpublished. So this reads them from a file OUTSIDE this repository and, when that
 * file is absent, skips with a printed reason and exits 0.
 *
 * Skipping is deliberate rather than a weakness. This repository is public and its CI runs
 * on machines that will never have the file; failing there would make a red run the normal
 * state, which teaches everyone to ignore it. The check is for the one machine that has
 * the terms - the maintainer's, before publishing - and it says plainly when it did not
 * run, so a skip is never mistaken for a pass.
 *
 * IT NEVER PRINTS A TERM BY DEFAULT
 *
 * A hit is reported as a file, a line and a column. Printing the matched word would put it
 * in a terminal, a CI log or a pasted bug report, which is the same publication this guard
 * exists to prevent. `--show` prints the terms, and it is only useful where the terms file
 * already is, which is to say locally, where they are not a secret from the person reading.
 *
 * WHERE THE TERMS COME FROM, in order:
 *   1. $WORLDLENS_VOCABULARY_TERMS - an explicit path, which wins.
 *   2. The private instruction repository beside this one, found by walking up from this
 *      script to the directory this repository sits in. Resolved dynamically: no username,
 *      no drive letter and no absolute path is written down here.
 *
 * The file is JSON. Two shapes are accepted, because the private repository's own
 * dictionary uses the first and a plain list is the obvious thing to hand it otherwise:
 *   { "terms": [ { "alias": "..." }, ... ] }   - alias may be "a / b" for variants
 *   [ "...", "..." ]                           - a plain array of strings
 *
 * USAGE
 *   node scripts/check-published-text.mjs                 the published surfaces
 *   node scripts/check-published-text.mjs --commit-msg F  one commit-message file
 *   node scripts/check-published-text.mjs --show          print the terms that matched
 *   node scripts/check-published-text.mjs PATH...         exactly these files
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The published surfaces, in the order somebody would think of them.
 *
 * A directory is walked for the extensions listed beside it. `changelogData.generated.ts`
 * is named explicitly rather than reached through a directory walk because it is the one
 * file issue #168 is specifically about: it is generated from commit history, so a term in
 * a published commit body reappears there on every regeneration.
 */
const PUBLISHED = Object.freeze([
  Object.freeze({ path: "CHANGELOG.md" }),
  Object.freeze({ path: "README.md" }),
  Object.freeze({
    path: "design/packages/ui/src/components/changelog/changelogData.generated.ts",
  }),
  Object.freeze({ path: "docs", extensions: Object.freeze([".md"]) }),
  Object.freeze({
    path: "design/packages/site/src",
    extensions: Object.freeze([".md", ".ts", ".vue", ".html"]),
  }),
]);

/**
 * Occurrences a human has already looked at and found to be the ordinary English or
 * technical word rather than the private sense: the memory heap, `git cat-file`, a mob
 * name. Positions and reasons only -- it never names a term, because naming one in this
 * repository is the leak this script exists to prevent.
 *
 * Keyed by exact position, so an edit that moves a line re-flags it. That is correct: the
 * review was of that occurrence, not of the word.
 */
function allowlist() {
  try {
    const parsed = JSON.parse(
      readFileSync(join(ROOT, "scripts", "published-text-allowlist.json"), "utf8"),
    );
    return new Set(
      (parsed.entries ?? []).map(
        (entry) => `${entry.file}:${entry.line}:${entry.column}`,
      ),
    );
  } catch {
    // Absent or unreadable means nothing is suppressed, which fails closed.
    return new Set();
  }
}

/**
 * The two files generated from commit history.
 *
 * Issue #168 is explicit that the residue in these cannot be fixed: editing the generated
 * file is not a fix, because the next regeneration restores it from history and the drift
 * then looks like a generator bug; and fixing it at the source means rewriting published
 * history and force-pushing, which invalidates every clone, every commit link in an issue
 * or release note, and every recorded SHA in docs/release-ledger.json.
 *
 * So a hit here is counted and named as accepted residue rather than failing the run. If it
 * failed, the steady state of this check would be red, and a check whose normal state is red
 * is a check everyone learns to scroll past -- which is how the workflow linter in #167 went
 * two weeks without anybody reading it.
 */
const GENERATED_FROM_HISTORY = Object.freeze([
  "CHANGELOG.md",
  "design/packages/ui/src/components/changelog/changelogData.generated.ts",
]);

/**
 * The hand-written replacement text that feeds those two generated files.
 *
 * `scripts/changelog-overrides.json` gives one historical commit a neutral subject and body,
 * and `publicText()` in `build-changelog.mjs` substitutes them before anything else, so an
 * override is copied byte-for-byte into CHANGELOG.md and into the in-app changelog data. That
 * makes it published text, and the accepted-residue reasoning above does not cover it: an
 * override body was authored by hand for the express purpose of being publishable, so a term
 * in one is a one-line edit rather than the history rewrite that reasoning exists to avoid.
 */
const OVERRIDES_PATH = "scripts/changelog-overrides.json";

/** Where the terms file might be, most explicit first. */
function termsCandidates() {
  const explicit = process.env.WORLDLENS_VOCABULARY_TERMS;
  // Explicit means explicit: when the variable is set, it is the only candidate. Falling
  // back to the sibling repository after a path the caller named turned out to be
  // unreadable would quietly check against a different file than the one they asked for,
  // and a typo would look like a pass.
  if (explicit) return [resolve(explicit)];
  const candidates = [];
  // The private repository is a sibling of this one. Walking up from this script rather
  // than from the working directory keeps the answer the same however the script is
  // invoked, and writing no absolute path keeps this file portable between machines.
  const parent = dirname(ROOT.endsWith(sep) ? ROOT.slice(0, -1) : ROOT);
  candidates.push(
    join(parent, "agent-global-memory", "memory", "vocabulary-dictionary.json"),
  );
  return candidates;
}

/** Every term in the file at `path`, or null when it cannot be read as either shape. */
function readTerms(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  const collected = new Set();
  const add = (value) => {
    if (typeof value !== "string") return;
    // An entry may carry variants separated by " / ". Each is its own term.
    for (const part of value.split(" / ")) {
      const term = part.trim();
      // One and two-character terms match far too much ordinary prose to be a useful
      // signal, and a guard whose hits are mostly noise is a guard nobody reads.
      if (term.length >= 3) collected.add(term);
    }
  };
  if (Array.isArray(parsed)) for (const entry of parsed) add(entry);
  else if (parsed && Array.isArray(parsed.terms))
    for (const entry of parsed.terms) add(entry?.alias);
  else return null;
  return collected.size > 0 ? [...collected] : null;
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A word-boundary, case-insensitive matcher.
 *
 * Lookaround rather than \b, because several terms contain a space and \b before a space
 * does not mean what it looks like it means. This also stops a term matching inside a
 * longer word, which is where a short term would otherwise produce nothing but noise.
 *
 * Longest first, so a term that contains another is reported as itself rather than as the
 * shorter one it happens to contain.
 */
function matcher(terms) {
  const alternation = [...terms]
    .sort((left, right) => right.length - left.length)
    .map(escape)
    .join("|");
  return new RegExp(
    `(?<![A-Za-z0-9])(?:${alternation})(?![A-Za-z0-9])`,
    "gi",
  );
}

function filesUnder(path, extensions) {
  // isAbsolute so an explicit argument off the command line works as well as the
  // repository-relative entries in PUBLISHED.
  const absolute = isAbsolute(path) ? path : join(ROOT, path);
  if (!existsSync(absolute)) return [];
  if (!statSync(absolute).isDirectory()) return [absolute];
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(child);
        continue;
      }
      if (
        !extensions ||
        extensions.some((extension) => entry.name.endsWith(extension))
      ) {
        found.push(child);
      }
    }
  };
  walk(absolute);
  return found;
}

/** Every hit in `files`, as { file, line, column, term }. */
function scan(files, terms) {
  const pattern = matcher(terms);
  const hits = [];
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file);
    } catch {
      continue;
    }
    // A NUL byte means this is not text, and a term "found" in a PNG is byte noise rather
    // than a leak. Issue #168 recorded exactly this: a random three-letter string matched
    // five committed PNGs during the manual sweep, and no term appeared in any PNG text
    // chunk. Checked on the bytes rather than by extension, so an unfamiliar binary
    // extension is skipped too.
    if (raw.includes(0)) continue;
    const text = raw.toString("utf8");
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        hits.push({
          file: relative(ROOT, file).split(sep).join("/"),
          line: index + 1,
          column: match.index + 1,
          term: match[0],
        });
      }
    }
  }
  return hits;
}

/**
 * Every hit in the decoded fields of an overrides file, as { file, where, line, column, term }.
 *
 * It needs its own scan rather than an entry in {@link PUBLISHED} because the file is JSON: a
 * multi-line body is one physical line holding `\n` as the two characters backslash and n. A
 * line scan of the raw bytes therefore sees that `n` as the character immediately before the
 * next word, and `matcher`'s word-boundary lookbehind refuses a hit that is genuinely there --
 * a false negative on exactly the text that is about to be published. Parsing first, and
 * scanning each `subject` and `body` as the reader will see it, is what closes that gap.
 *
 * `where` names the commit and the field, since a line number inside a JSON string is not
 * something a person can navigate to.
 */
function scanOverrides(path, terms) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // Absent or unparsable is not this script's failure to report: build-changelog.mjs owns
    // reading this file and fails loudly on malformed JSON.
    return [];
  }
  const pattern = matcher(terms);
  const file = relative(ROOT, path).split(sep).join("/");
  const hits = [];
  for (const [sha, entry] of Object.entries(parsed ?? {})) {
    for (const kind of ["subject", "body"]) {
      const text = entry?.[kind];
      if (typeof text !== "string") continue;
      for (const [index, line] of text.split("\n").entries()) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line)) !== null) {
          hits.push({
            file,
            where: `${sha} ${kind}`,
            line: index + 1,
            column: match.index + 1,
            term: match[0],
          });
        }
      }
    }
  }
  return hits;
}

function main() {
  const argv = process.argv.slice(2);
  const show = argv.includes("--show");
  const rest = argv.filter((value) => value !== "--show");
  const commitIndex = rest.indexOf("--commit-msg");
  const commitMessage = commitIndex >= 0 ? (rest[commitIndex + 1] ?? null) : null;
  // The `commitIndex >= 0 &&` matters: with no --commit-msg, commitIndex is -1, so
  // `index !== commitIndex + 1` is `index !== 0` and the first path argument is dropped
  // without a word. A file silently skipped by the checker that is supposed to find things
  // in it is the worst possible defect for this script to have.
  const explicitFiles = rest.filter(
    (value, index) =>
      !(commitIndex >= 0 && (index === commitIndex || index === commitIndex + 1)) &&
      !value.startsWith("--"),
  );

  let termsPath = null;
  let terms = null;
  for (const candidate of termsCandidates()) {
    const found = readTerms(candidate);
    if (found !== null) {
      termsPath = candidate;
      terms = found;
      break;
    }
  }

  if (terms === null) {
    // Skipped, loudly, with the reason and the exact way to make it run. Exit 0: this
    // repository is public and its machines will never have the file, and a check whose
    // normal state is red is a check everyone learns to scroll past.
    process.stdout.write(
      "check-published-text: SKIPPED - no terms file.\n" +
        "  The terms are deliberately not in this repository: holding them is the leak\n" +
        "  this check exists to prevent.\n" +
        "  Looked in:\n" +
        termsCandidates().map((candidate) => `    ${candidate}\n`).join("") +
        "  Set WORLDLENS_VOCABULARY_TERMS to a JSON file to run it.\n",
    );
    return;
  }

  const files =
    commitMessage !== null
      ? [resolve(commitMessage)]
      : explicitFiles.length > 0
        ? // Through filesUnder, so a directory argument is walked rather than read as a
          // file. Read as a file it throws, the catch in scan() swallows it, and the
          // directory contributes nothing while the run still reports "clean" -- a silent
          // skip in the one script whose whole job is to not miss anything.
          explicitFiles.flatMap((value) => filesUnder(value))
        : PUBLISHED.flatMap(({ path, extensions }) => filesUnder(path, extensions));

  const reviewed = allowlist();
  // Only on the default run: an explicit file list or a commit message is a question about
  // those exact paths, and answering it with an unrelated file's hits would be confusing.
  const scanTheOverrides = commitMessage === null && explicitFiles.length === 0;
  const overrideHits = scanTheOverrides
    ? scanOverrides(join(ROOT, OVERRIDES_PATH), terms)
    : [];
  const hits = scan(files, terms)
    .filter((hit) => !reviewed.has(`${hit.file}:${hit.line}:${hit.column}`))
    .concat(overrideHits);
  if (hits.length === 0) {
    process.stdout.write(
      `check-published-text: clean - ${files.length + (scanTheOverrides ? 1 : 0)} file(s) checked against ${terms.length} terms` +
        (reviewed.size > 0 ? `, ${reviewed.size} reviewed occurrence(s) allowed` : "") +
        "\n",
    );
    return;
  }
  const residue = hits.filter((hit) => GENERATED_FROM_HISTORY.includes(hit.file));
  const actionable = hits.filter(
    (hit) => !GENERATED_FROM_HISTORY.includes(hit.file),
  );
  for (const hit of actionable) {
    // The term itself is withheld unless --show. Printing it would put it in a terminal,
    // a CI log or a pasted bug report, which is the publication this exists to prevent.
    process.stderr.write(
      `${hit.file}:${hit.line}:${hit.column}: internal shorthand` +
        (hit.where ? ` in ${hit.where}` : "") +
        `${show ? ` (${hit.term})` : ""}\n`,
    );
  }
  if (residue.length > 0) {
    process.stdout.write(
      `check-published-text: ${residue.length} accepted hit(s) in text generated from commit ` +
        "history, which issue #168 records as unfixable without rewriting published history.\n",
    );
  }
  if (actionable.length === 0) {
    process.stdout.write("check-published-text: no actionable hit.\n");
    return;
  }
  const fileCount = new Set(actionable.map((hit) => hit.file)).size;
  process.stderr.write(
    `check-published-text: ${actionable.length} hit(s) in ${fileCount} file(s).\n` +
      (show
        ? ""
        : "  Re-run with --show to see the terms; they print only where the terms file already is.\n"),
  );
  process.exitCode = 1;
}

export {
  OVERRIDES_PATH,
  PUBLISHED,
  matcher,
  readTerms,
  scan,
  scanOverrides,
  termsCandidates,
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
