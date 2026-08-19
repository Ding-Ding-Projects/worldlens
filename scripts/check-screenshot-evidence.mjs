#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const inventoryPath = resolve(
  repoRoot,
  "docs/screenshots/evidence-inventory.json",
);
const manifestPath = resolve(repoRoot, "docs/screenshots/manifest.json");
const interfaceSourceRoot = resolve(repoRoot, "design/packages/ui/src");

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".gif",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
]);
const normalise = (value) => value.replaceAll("\\", "/");
const sort = (values) =>
  [...values].sort((left, right) => left.localeCompare(right, "en"));

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)
    .map(normalise);
}

function isEvidencePath(inventory, file) {
  return (
    IMAGE_EXTENSIONS.has(extname(file).toLowerCase()) &&
    inventory.evidenceRoots.some((root) =>
      file.startsWith(`${normalise(root)}/`),
    )
  );
}

function difference(left, right) {
  const rightSet = new Set(right);
  return sort(left.filter((value) => !rightSet.has(value)));
}

function assertEmpty(values, message) {
  if (values.length === 0) return;
  throw new Error(
    `${message}:\n${values.map((value) => `  - ${value}`).join("\n")}`,
  );
}

function dimensions(file, bytes) {
  if (file.endsWith(".png")) {
    const signature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    if (!bytes.subarray(0, 8).equals(signature))
      throw new Error(`${file}: invalid PNG signature`);
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (file.endsWith(".gif")) {
    if (!/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"))) {
      throw new Error(`${file}: invalid GIF signature`);
    }
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  return { width: 1, height: 1 };
}

/* -------------------------------------------------------------------------- */
/* Staleness: are these captures pictures of the interface we ship today?      */
/* -------------------------------------------------------------------------- */

/**
 * Why this is a digest of the source rather than a comparison of ages.
 *
 * The thing worth catching is a committed capture that is older than the interface it
 * claims to illustrate, and the obvious two ways to measure that age are both dead ends
 * here. They are written down because each looks correct until it is running:
 *
 *   - **File modification times.** Git does not record them. Every file in a fresh clone
 *     carries the moment of checkout, so on the one machine this most needs to work - a
 *     CI runner, which clones - every capture is exactly as new as every source file and
 *     the comparison is uniformly meaningless. It would pass forever while saying nothing.
 *
 *   - **Commit times.** They survive a clone, but the job that runs this check does not
 *     have them: `.github/workflows/ci.yml` checks out at `fetch-depth: 1`, deliberately,
 *     because that same depth is applied to a submodule whose tree is 500+ MB. There is no
 *     history there to ask.
 *
 * A digest of the interface source needs neither. It also answers a better question than
 * either age comparison does - not "which of these two is newer" but "were these captures
 * taken from this exact interface" - and that is the question a reader of the gallery is
 * really asking when they wonder whether the picture matches the product.
 */

/**
 * Files whose bytes decide what the interface looks like.
 *
 * The exclusions match `design/packages/app/test/freshBundle.ts` exactly, and for the same
 * reason it gives: a test file changing does not change what the application renders, and
 * treating it as if it did would make this cry wolf on every unit-test edit until somebody
 * deleted it. Keeping the two rules identical also means a file can never be shipping
 * source to one guard and test scaffolding to the other.
 *
 * `changelogData.generated.ts` is excluded for a different reason: its bytes are built
 * from the repository's own commit history, so the content that finally ships is only
 * knowable *after* the commit that ships it exists. No capture can ever be taken from a
 * tree that already contains that file's final form - demanding it would mark every
 * capture stale the moment the routine changelog refresh lands, forever. The pictures
 * are of the interface; the changelog data is the one source file the interface derives
 * from history rather than from anything a person drew.
 */
export function shipsInInterface(name) {
  return (
    !name.endsWith(".test.ts") &&
    !name.endsWith(".test.tsx") &&
    !name.endsWith(".spec.ts") &&
    name !== "changelogData.generated.ts"
  );
}

/**
 * Extensions hashed byte-for-byte instead of being newline-normalised below.
 *
 * Normalising a PNG's bytes would be deterministic and would in fact still work, but it
 * would also mean the digest of an image depended on a text rule, which is the kind of
 * quiet coincidence that stops being true the day somebody adds a file format.
 */
const BINARY_SOURCE_EXTENSIONS = new Set([
  ".png",
  ".gif",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
]);

/**
 * One stable fingerprint for a set of source files.
 *
 * `entries` are `{ path, bytes }` with `path` relative and slash-separated, in any order.
 *
 * Text is newline-normalised before hashing because `.gitattributes` declares `* text=auto`:
 * the repository stores LF and a Windows checkout materialises CRLF, so hashing raw bytes
 * would produce one digest on a developer's machine and a different one on the Linux runner
 * for identical content. That is the recorded-fixture trap - a check that silently asserts
 * which platform it is running on - and it would make this guard permanently red on
 * whichever platform did not write the baseline.
 *
 * The path is quoted with `JSON.stringify` rather than joined to its hash by a bare
 * separator, so that a path containing whatever character was chosen as the separator
 * cannot produce the same line as a different path with a different hash.
 */
export function interfaceSourceDigest(entries) {
  const lines = [...entries]
    .map(({ path, bytes }) => {
      const binary = BINARY_SOURCE_EXTENSIONS.has(extname(path).toLowerCase());
      const content = binary
        ? bytes
        : Buffer.from(
            bytes
              .toString("utf8")
              .replaceAll("\r\n", "\n")
              .replaceAll("\r", "\n"),
            "utf8",
          );
      return `${JSON.stringify(path)} ${createHash("sha256").update(content).digest("hex")}`;
    })
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** Every shipping interface source under `root`, ready for `interfaceSourceDigest`. */
export function collectInterfaceSources(root) {
  const entries = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile() || !shipsInInterface(entry.name)) continue;
      entries.push({
        path: normalise(relative(root, path)),
        bytes: readFileSync(path),
      });
    }
  };
  walk(root);
  return entries;
}

/**
 * Every graded group whose images are pictures of an interface this tree no longer builds.
 *
 * The digest is recorded per group rather than once for the whole inventory, and that is not
 * bookkeeping fussiness: the two graded groups here were captured through different routes at
 * different commits, so a single shared value would have to be wrong about one of them. A
 * group refreshes, and records, its own.
 *
 * Kept pure and separate from the filesystem so both of its directions can be exercised
 * directly. A guard nobody has watched fail proves nothing, and the failing direction of this
 * one is otherwise reachable only by editing the interface and regenerating a hundred-odd
 * screenshots.
 */
export function stalenessComplaints({ groups, actual }) {
  const complaints = [];
  for (const group of groups) {
    const recorded = group.uiSourceDigest;
    if (recorded === actual) continue;

    const how =
      `    refresh them:  ${group.command}\n` +
      "    then record:   node scripts/check-screenshot-evidence.mjs --print-interface-digest\n" +
      `                   into this group's uiSourceDigest in ${normalise(relative(repoRoot, inventoryPath))}`;

    if (typeof recorded !== "string" || recorded === "") {
      complaints.push(
        `${group.id} records no uiSourceDigest, so nothing says which interface its ` +
          `${String(group.targets.length)} images are pictures of.\n` +
          `    the interface now digests to: ${actual}\n` +
          how,
      );
      continue;
    }

    complaints.push(
      `${group.id}: its ${String(group.targets.length)} images are pictures of an older ` +
        "interface than this tree builds.\n" +
        `    recorded when captured:       ${recorded}\n` +
        `    the interface now digests to: ${actual}\n` +
        how,
    );
  }
  return complaints;
}

/**
 * Historical images are refreshed from their exact old source, never exempted from refresh.
 *
 * Kept pure so removing one target mapping can be watched turning the guard red without creating
 * twenty historical checkouts. The main path additionally proves every recorded commit exists.
 */
export function historicalRecaptureComplaints(groups) {
  const complaints = [];
  for (const group of groups.filter(
    (candidate) =>
      candidate.reproducibility === "historical-exact-commit-hidden-desktop",
  )) {
    const commits = group.sourceCommits;
    if (
      typeof commits !== "object" ||
      commits === null ||
      Array.isArray(commits)
    ) {
      complaints.push(`${group.id}: sourceCommits is missing`);
      continue;
    }
    for (const target of group.targets) {
      const commit = commits[target];
      if (typeof commit !== "string" || !/^[0-9a-f]{40}$/u.test(commit)) {
        complaints.push(
          `${group.id}: ${target} has no exact historical source commit`,
        );
      }
    }
    for (const target of Object.keys(commits)) {
      if (!group.targets.includes(target)) {
        complaints.push(
          `${group.id}: sourceCommits names unexpected target ${target}`,
        );
      }
    }
    if (
      !group.command.includes("cheap Lowlevel") ||
      !group.command.includes("CDP")
    ) {
      complaints.push(
        `${group.id}: historical recapture command is not the hidden Lowlevel/CDP route`,
      );
    }
  }
  return complaints;
}

function main() {
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const tracked = trackedFiles();

  if (process.argv.includes("--print-interface-digest")) {
    process.stdout.write(
      `${interfaceSourceDigest(collectInterfaceSources(interfaceSourceRoot))}\n`,
    );
    return;
  }

  if (inventory.version !== 1)
    throw new Error(
      `unsupported evidence inventory version ${inventory.version}`,
    );
  if (
    !Number.isInteger(inventory.expectedTargetCount) ||
    inventory.expectedTargetCount < 1
  ) {
    throw new Error("expectedTargetCount must be a positive integer");
  }

  const groupIds = inventory.groups.map((group) => group.id);
  assertEmpty(
    groupIds.filter((id, index) => groupIds.indexOf(id) !== index),
    "duplicate inventory group ids",
  );

  for (const group of inventory.groups) {
    for (const field of ["id", "authority", "command", "reproducibility"]) {
      if (typeof group[field] !== "string" || group[field].trim() === "") {
        throw new Error(
          `${group.id ?? "unnamed group"}: ${field} must be a non-empty string`,
        );
      }
    }
    if (group.targets.length !== group.expectedCount) {
      throw new Error(
        `${group.id}: expectedCount=${group.expectedCount}, but ${group.targets.length} targets are listed`,
      );
    }
    /*
     * Every group has to say out loud whether the interface source decides what its images
     * look like, because the answer is genuinely different per group and guessing it wrong
     * fails in both directions: grading `historical-site-baseline` would demand that a
     * deliberately preserved picture of the pre-rewrite site be re-taken from a site that no
     * longer exists, and not grading `app-playwright-manifest` would leave the eighty-odd
     * captures this check exists for ungraded. Declared rather than inferred, so a group
     * added later cannot dodge the question by being unrecognised.
     */
    if (typeof group.capturedFromInterfaceSource !== "boolean") {
      throw new Error(
        `${group.id}: capturedFromInterfaceSource must be true or false - say whether ` +
          "design/packages/ui/src decides what these images look like",
      );
    }
    if (
      !group.capturedFromInterfaceSource &&
      (typeof group.notGradedBecause !== "string" ||
        group.notGradedBecause.trim() === "")
    ) {
      throw new Error(
        `${group.id}: an ungraded group must say why in notGradedBecause`,
      );
    }
  }

  const historicalComplaints = historicalRecaptureComplaints(inventory.groups);
  for (const group of inventory.groups.filter(
    (candidate) =>
      candidate.reproducibility === "historical-exact-commit-hidden-desktop",
  )) {
    for (const commit of Object.values(group.sourceCommits ?? {})) {
      try {
        execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
          cwd: repoRoot,
          stdio: "ignore",
        });
      } catch {
        historicalComplaints.push(
          `${group.id}: historical commit ${String(commit)} is unavailable`,
        );
      }
    }
  }
  assertEmpty(
    historicalComplaints,
    "historical capture recapture contracts are incomplete",
  );

  const listed = inventory.groups.flatMap((group) =>
    group.targets.map(normalise),
  );
  const duplicateTargets = listed.filter(
    (file, index) => listed.indexOf(file) !== index,
  );
  assertEmpty(
    sort(new Set(duplicateTargets)),
    "targets listed in more than one evidence group",
  );

  if (listed.length !== inventory.expectedTargetCount) {
    throw new Error(
      `inventory expected ${inventory.expectedTargetCount} targets, but lists ${listed.length}`,
    );
  }

  const actual = tracked.filter((file) => isEvidencePath(inventory, file));
  assertEmpty(
    difference(actual, listed),
    "tracked evidence images missing from the hand-written inventory",
  );
  assertEmpty(
    difference(listed, actual),
    "inventory targets that are not tracked evidence images",
  );

  for (const file of listed) {
    const bytes = readFileSync(resolve(repoRoot, file));
    const { width, height } = dimensions(file, bytes);
    if (width < 1 || height < 1)
      throw new Error(`${file}: invalid ${width}x${height} dimensions`);
  }

  const manifestGroup = inventory.groups.find(
    (group) => group.id === "app-playwright-manifest",
  );
  if (manifestGroup === undefined)
    throw new Error("app-playwright-manifest group is required");
  const manifestFiles = manifest.captures.map(
    (capture) => `docs/screenshots/${capture.file}`,
  );
  assertEmpty(
    difference(manifestFiles, manifestGroup.targets),
    "Playwright manifest captures absent from its evidence group",
  );
  assertEmpty(
    difference(manifestGroup.targets, manifestFiles),
    "Playwright evidence targets absent from docs/screenshots/manifest.json",
  );

  const walkthrough = inventory.groups.find(
    (group) => group.id === "site-walkthrough-media",
  );
  if (walkthrough === undefined)
    throw new Error("site-walkthrough-media group is required");
  const walkthroughIds = new Set(
    walkthrough.targets.map((file) =>
      file.replace(/^.*\//, "").replace(/\.(?:gif|png)$/, ""),
    ),
  );
  for (const id of walkthroughIds) {
    for (const extension of ["gif", "png"]) {
      const file = `design/packages/site/src/assets/walkthroughs/${id}.${extension}`;
      if (!walkthrough.targets.includes(file))
        throw new Error(`${id}: missing ${extension} walkthrough pair`);
    }
  }
  if (walkthroughIds.size * 2 !== walkthrough.targets.length) {
    throw new Error(
      "walkthrough inventory must contain exactly one GIF and one PNG per action id",
    );
  }
  if (walkthrough.minimumFramesPerId !== 2) {
    throw new Error(
      "site-walkthrough-media must require at least two real frames per id",
    );
  }
  const framePlanIds = Object.keys(walkthrough.framePlan ?? {});
  assertEmpty(
    difference([...walkthroughIds], framePlanIds),
    "walkthrough outputs with no hidden-desktop frame plan",
  );
  assertEmpty(
    difference(framePlanIds, [...walkthroughIds]),
    "walkthrough frame plans with no output pair",
  );
  for (const [id, frames] of Object.entries(walkthrough.framePlan ?? {})) {
    if (
      !Array.isArray(frames) ||
      frames.length < walkthrough.minimumFramesPerId ||
      frames.some((frame) => typeof frame !== "string" || frame.trim() === "")
    ) {
      throw new Error(
        `${id}: walkthrough frame plan needs at least two named real states`,
      );
    }
  }

  /*
   * Which groups are graded is asserted by name, not by counting how many said yes.
   *
   * A tally is satisfied by the wrong set of the right size: two graded groups passes just as
   * happily when the two are `live-pages` and `site-compact-proof` and the eighty-one captures
   * of the application itself have quietly been marked ungraded. So the group that carries the
   * bulk of the gallery is named here and required to be graded, and a group that genuinely
   * cannot be has to argue its way onto the exempt side one entry at a time.
   */
  // "built-shell-readme" left this list when the README switched to the Playwright
  // harness's own captures of the same surfaces: a Windows-only PrintWindow route meant
  // those three images went stale on every interface change with no runner able to
  // refresh them, which is exactly the rot this check exists to catch.
  const MUST_BE_GRADED = ["app-playwright-manifest"];
  const graded = inventory.groups.filter(
    (group) => group.capturedFromInterfaceSource,
  );
  assertEmpty(
    MUST_BE_GRADED.filter((id) => !graded.some((group) => group.id === id)),
    "evidence groups that must be graded against design/packages/ui/src but are not, so " +
      "nothing here would notice a gallery of an application that no longer exists",
  );

  const digest = interfaceSourceDigest(
    collectInterfaceSources(interfaceSourceRoot),
  );
  assertEmpty(
    stalenessComplaints({ groups: graded, actual: digest }),
    "committed captures that are pictures of an interface this tree no longer builds - a " +
      "stale capture is worse than none, because a reader cannot tell which version they are\n" +
      "looking at and the caption underneath confidently describes the wrong thing",
  );

  process.stdout.write(
    [
      `Screenshot evidence inventory: ${listed.length}/${inventory.expectedTargetCount} tracked targets covered`,
      ...inventory.groups.map(
        (group) =>
          `  ${group.id}: ${group.targets.length}${group.capturedFromInterfaceSource ? "" : " (not graded for staleness)"}`,
      ),
      `  Playwright manifest: ${manifestFiles.length} captures, ${manifest.skipped.length} named skips`,
      `  Interface source digest: ${digest} - the captures are pictures of this tree`,
    ].join("\n") + "\n",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
