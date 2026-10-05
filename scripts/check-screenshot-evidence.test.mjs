import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import * as evidence from "./check-screenshot-evidence.mjs";

import {
  collectInterfaceSources,
  historicalRecaptureComplaints,
  interfaceSourceDigest,
  shipsInInterface,
  stalenessComplaints,
} from "./check-screenshot-evidence.mjs";

test("historical recapture mapping turns red when one target loses its exact source commit", () => {
  const group = {
    id: "historical",
    reproducibility: "historical-exact-commit-hidden-desktop",
    command:
      "Build the exact commit, then use cheap Lowlevel and one CDP target.",
    targets: ["before.png", "retired.png"],
    sourceCommits: {
      "before.png": "0123456789abcdef0123456789abcdef01234567",
      "retired.png": "89abcdef0123456789abcdef0123456789abcdef",
    },
  };
  assert.deepEqual(historicalRecaptureComplaints([group]), []);

  const broken = {
    ...group,
    sourceCommits: { "before.png": group.sourceCommits["before.png"] },
  };
  assert.deepEqual(historicalRecaptureComplaints([broken]), [
    "historical: retired.png has no exact historical source commit",
  ]);
});

/*
 * The failing direction of the staleness guard is otherwise reachable only by editing the
 * interface and regenerating a hundred-odd screenshots, which is exactly the situation where
 * a guard nobody has watched fail turns out to have been decorative all along. Both
 * directions are pinned here instead, on inputs small enough to read.
 */

const entry = (path, text) => ({ path, bytes: Buffer.from(text, "utf8") });

test("test files are not interface sources", () => {
  assert.equal(shipsInInterface("WorkPane.vue"), true);
  assert.equal(shipsInInterface("catalogues.ts"), true);
  assert.equal(shipsInInterface("homeCatalog.test.ts"), false);
  assert.equal(shipsInInterface("WelcomeSurface.test.tsx"), false);
  assert.equal(shipsInInterface("screenshots.spec.ts"), false);
});

test("the digest ignores the order files are collected in", () => {
  const one = [entry("a.ts", "alpha"), entry("b.vue", "beta")];
  const other = [entry("b.vue", "beta"), entry("a.ts", "alpha")];
  assert.equal(interfaceSourceDigest(one), interfaceSourceDigest(other));
});

test("the digest ignores the line endings a checkout materialised", () => {
  // `.gitattributes` declares `* text=auto`, so the same committed file arrives as CRLF on
  // Windows and LF on Linux. Hashing raw bytes would make this guard assert which platform
  // wrote the baseline rather than what the interface looks like.
  const windows = [
    entry("App.vue", "<template>\r\n  <div />\r\n</template>\r\n"),
  ];
  const linux = [entry("App.vue", "<template>\n  <div />\n</template>\n")];
  assert.equal(interfaceSourceDigest(windows), interfaceSourceDigest(linux));
});

test("the digest does not normalise the bytes of an image", () => {
  const carriageReturn = [
    { path: "logo.png", bytes: Buffer.from([0x0d, 0x0a]) },
  ];
  const newline = [{ path: "logo.png", bytes: Buffer.from([0x0a]) }];
  assert.notEqual(
    interfaceSourceDigest(carriageReturn),
    interfaceSourceDigest(newline),
  );
});

test("a path containing the separator cannot forge another file's line", () => {
  // The reason the path is quoted rather than joined to its hash by a bare separator: with
  // one, a file whose name contained that character could produce the identical line as a
  // differently-named file with a different hash, and the digest would report two different
  // trees as the same interface.
  const spaced = [entry("a b.ts", "one"), entry("c.ts", "two")];
  const split = [entry("a", "one"), entry("b.ts", "two"), entry("c.ts", "two")];
  assert.notEqual(interfaceSourceDigest(spaced), interfaceSourceDigest(split));
});

test("any change to a shipping file changes the digest", () => {
  const before = [entry("App.vue", "<template>a</template>")];
  const after = [entry("App.vue", "<template>b</template>")];
  assert.notEqual(interfaceSourceDigest(before), interfaceSourceDigest(after));
});

test("collecting sources walks nested directories and skips test files", () => {
  const root = mkdtempSync(join(tmpdir(), "wl-interface-"));
  mkdirSync(join(root, "components", "shell"), { recursive: true });
  writeFileSync(join(root, "App.vue"), "<template />");
  writeFileSync(
    join(root, "components", "shell", "WorkPane.vue"),
    "<template />",
  );
  writeFileSync(
    join(root, "components", "shell", "WorkPane.test.ts"),
    "assert(true)",
  );

  const collected = collectInterfaceSources(root)
    .map(({ path }) => path)
    .sort();
  assert.deepEqual(collected, ["App.vue", "components/shell/WorkPane.vue"]);
});

test("a group whose recorded digest matches the tree is not stale", () => {
  const groups = [
    {
      id: "app-playwright-manifest",
      command: "cd design && …",
      targets: ["a.png"],
      uiSourceDigest: "same",
    },
  ];
  assert.deepEqual(stalenessComplaints({ groups, actual: "same" }), []);
});

test("a group whose recorded digest does not match the tree is stale", () => {
  const groups = [
    {
      id: "app-playwright-manifest",
      command: "cd design && pnpm screenshots",
      targets: ["a.png", "b.png"],
      uiSourceDigest: "captured-from-this",
    },
  ];
  const complaints = stalenessComplaints({
    groups,
    actual: "but-we-ship-this",
  });
  assert.equal(complaints.length, 1);
  assert.match(complaints[0], /app-playwright-manifest/);
  assert.match(complaints[0], /its 2 images/);
  assert.match(complaints[0], /captured-from-this/);
  assert.match(complaints[0], /but-we-ship-this/);
  // The complaint has to carry the way out of it, or it is a red mark that teaches people to
  // stop reading red marks.
  assert.match(complaints[0], /pnpm screenshots/);
  assert.match(complaints[0], /--print-interface-digest/);
});

test("a group that recorded no digest at all is stale, and says so differently", () => {
  const groups = [
    {
      id: "built-shell-readme",
      command: "capture the built shell",
      targets: ["a.png"],
    },
  ];
  const complaints = stalenessComplaints({ groups, actual: "whatever" });
  assert.equal(complaints.length, 1);
  assert.match(complaints[0], /records no uiSourceDigest/);
});

test("each graded group is judged on its own recorded digest", () => {
  // Two groups can be captured through different routes at different commits, so one shared
  // value would have to be wrong about one of them. A group that is current stays quiet while
  // its neighbour complains.
  const groups = [
    { id: "current", command: "…", targets: ["a.png"], uiSourceDigest: "ship" },
    { id: "behind", command: "…", targets: ["b.png"], uiSourceDigest: "older" },
  ];
  const complaints = stalenessComplaints({ groups, actual: "ship" });
  assert.equal(complaints.length, 1);
  assert.match(complaints[0], /^behind:/);
});


const planGroup = {
  id: "planned",
  command: "run scripts/one.json and scripts/two.json",
  planFiles: ["scripts/one.json", "scripts/two.json"],
  targets: ["docs/screenshots/first.png", "docs/screenshots/second.png"],
};
const plans = {
  "scripts/one.json": [{ action: "click" }, { action: "screenshot", name: "first" }],
  "scripts/two.json": [{ action: "screenshot", name: "second" }],
};
const readPlan = (path) => plans[path];

test("plan provenance compares the union of named screenshot steps", () => {
  assert.deepEqual(evidence.planProvenanceComplaints([planGroup], readPlan), []);
});

test("plan provenance rejects both missing outputs and unexplained targets", () => {
  const group = { ...planGroup, targets: ["docs/screenshots/unrelated.png"] };
  const complaints = evidence.planProvenanceComplaints([group], readPlan);
  assert.equal(complaints.length, 3);
  assert.match(complaints.join("\n"), /first.png.*absent from targets/);
  assert.match(complaints.join("\n"), /second.png.*absent from targets/);
  assert.match(complaints.join("\n"), /unrelated.png.*not produced/);
});

test("plan provenance rejects a command that no longer names its plan", () => {
  const group = { ...planGroup, command: "run scripts/one.json" };
  assert.match(evidence.planProvenanceComplaints([group], readPlan).join("\n"),
    /scripts\/two.json.*not named by command/);
});

test("plan provenance reports unreadable, malformed, and invalid screenshot plans", () => {
  for (const plan of [{ steps: [] }, [{ action: "screenshot" }],
    [{ action: "screenshot", name: "../outside" }]]) {
    assert.ok(evidence.planProvenanceComplaints([planGroup], () => plan).length > 0);
  }
  assert.match(evidence.planProvenanceComplaints([planGroup], () => {
    throw new Error("missing file");
  }).join("\n"), /missing file/);
});

test("plan provenance rejects duplicate screenshot names before they overwrite output", () => {
  const plan = [{ action: "screenshot", name: "first" },
    { action: "screenshot", name: "first" }];
  assert.match(evidence.planProvenanceComplaints([planGroup], () => plan).join("\n"),
    /duplicate screenshot output/);
});

test("plan provenance cannot silently drop the lowlevel plan declarations", () => {
  for (const planFiles of [undefined, [], "scripts/one.json"]) {
    const group = { ...planGroup, id: "lowlevel-ui-e2e", planFiles };
    assert.match(evidence.planProvenanceComplaints([group], readPlan).join("\n"), /planFiles/);
  }
});

const proofGroup = {
  id: "site-compact-proof",
  targets: ["docs/screenshots/settings.png"],
  runtimeProofs: { "docs/screenshots/settings.png": "docs/runtime-proof/settings-english.json" },
  reportOnlyProofs: { "docs/runtime-proof/exports.json": "No PNG was committed for this report." },
};
const reportFiles = ["docs/runtime-proof/settings-english.json", "docs/runtime-proof/exports.json"];

test("compact reports support explicit filename aliases and report-only evidence", () => {
  assert.deepEqual(evidence.compactProofComplaints(proofGroup, reportFiles), []);
});

test("compact reports cannot omit a target mapping or an unpaired report", () => {
  assert.match(evidence.compactProofComplaints({ ...proofGroup, runtimeProofs: {} }, reportFiles)
    .join("\n"), /settings.png.*no runtime proof/);
  assert.match(evidence.compactProofComplaints({ ...proofGroup, reportOnlyProofs: {} }, reportFiles)
    .join("\n"), /exports.json.*unaccounted/);
});

test("compact reports reject absent files, extra targets, duplicate mappings, and blank reasons", () => {
  const broken = {
    ...proofGroup,
    runtimeProofs: { ...proofGroup.runtimeProofs,
      "docs/screenshots/other.png": reportFiles[0],
      "docs/screenshots/missing.png": "missing.json" },
    reportOnlyProofs: { [reportFiles[1]]: " " },
  };
  const complaints = evidence.compactProofComplaints(broken, reportFiles).join("\n");
  assert.match(complaints, /other.png.*unexpected target/);
  assert.match(complaints, /missing.json.*not tracked/);
  assert.match(complaints, /settings-english.json.*more than once/);
  assert.match(complaints, /exports.json.*reason/);
});

const inventory = () => JSON.parse(readFileSync(
  new URL("../docs/screenshots/evidence-inventory.json", import.meta.url),
  "utf8",
));

test("committed lowlevel groups match their three real plans without changing capture digests", () => {
  const groups = inventory().groups.filter((group) => group.planFiles !== undefined);
  assert.deepEqual(groups.map((group) => group.expectedCount).sort((a, b) => a - b), [1, 3, 14]);
  assert.deepEqual(evidence.planProvenanceComplaints(groups, (path) =>
    JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))), []);
  assert.equal(new Set(groups.map((group) => group.uiSourceDigest)).size, 1);
  assert.equal(
    groups[0].uiSourceDigest,
    "10e21e51523d90099ddf5f8d57761aa17510016d08ee2221a930edfd0492374c",
  );
});

test("committed compact images retain exact historical sources and account for every report", () => {
  const groups = inventory().groups.filter((group) =>
    ["site-compact-proof", "site-tabs-compact-proof"].includes(group.id),
  );
  assert.equal(groups.length, 2);
  for (const group of groups) {
    assert.equal(group.reproducibility, "historical-exact-commit-hidden-desktop");
  }
  assert.deepEqual(historicalRecaptureComplaints(groups), []);
  const reports = readdirSync(new URL("../docs/runtime-proof/", import.meta.url))
    .filter((file) => file.startsWith("pages-parity-") && file.endsWith(".json"))
    .map((file) => `docs/runtime-proof/${file}`);
  const group = groups.find((candidate) => candidate.id === "site-compact-proof");
  assert.deepEqual(evidence.compactProofComplaints(group, reports), []);
  assert.equal(Object.keys(group.runtimeProofs).length, 14);
  assert.equal(Object.keys(group.reportOnlyProofs).length, 4);
  assert.equal(group.runtimeProofs["docs/screenshots/pages-parity-settings-1024x768.png"],
    "docs/runtime-proof/pages-parity-settings-1024x768-english.json");
});

function runProvenanceFixture(t, group, extraFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), "wl-provenance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    "scripts/check-screenshot-evidence.mjs": readFileSync(
      new URL("./check-screenshot-evidence.mjs", import.meta.url),
      "utf8",
    ),
    "docs/screenshots/manifest.json": "{}",
    "docs/screenshots/evidence-inventory.json": JSON.stringify({
      version: 1,
      expectedTargetCount: 1,
      groups: [{
        authority: "test fixture",
        reproducibility: "test fixture",
        expectedCount: group.targets.length,
        capturedFromInterfaceSource: false,
        notGradedBecause: "test fixture",
        ...group,
      }],
    }),
    ...extraFiles,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  return spawnSync(process.execPath, ["scripts/check-screenshot-evidence.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
}

test("the command-line guard rejects plan-to-target drift before grading image freshness", (t) => {
  const result = runProvenanceFixture(t, {
    id: "planned",
    command: "run scripts/one.json",
    planFiles: ["scripts/one.json"],
    targets: ["docs/screenshots/unrelated.png"],
  }, { "scripts/one.json": JSON.stringify(plans["scripts/one.json"]) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /screenshot plan provenance is incomplete/);
  assert.match(result.stderr, /first.png.*absent from targets/);
  assert.match(result.stderr, /unrelated.png.*not produced/);
});

test("the command-line guard rejects an unaccounted compact report", (t) => {
  const result = runProvenanceFixture(t, {
    ...proofGroup,
    command: "historical fixture",
    reportOnlyProofs: {},
  }, {
    "docs/runtime-proof/settings-english.json": "{}",
    "docs/runtime-proof/pages-parity-orphan.json": "{}",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /compact proof report provenance is incomplete/);
  assert.match(result.stderr, /pages-parity-orphan.json.*unaccounted/);
});

test("prepared Lowlevel sessions document desktop and piped-plan lifecycle requirements", () => {
  const groups = inventory().groups;
  const history = groups.find((group) => group.id === "lowlevel-ci-render-history");
  const pages = groups.find((group) => group.id === "lowlevel-public-pages-render");
  assert.match(history.preconditions, /WORLDLENS_DRIVER_DESKTOP/);
  assert.match(history.preconditions, /WORLDLENS_PLAN_EXIT=1/);
  assert.match(pages.preconditions, /lowlevel-ci-render-history/);
  assert.match(pages.preconditions, /WORLDLENS_CI_WORLD/);
  assert.match(pages.preconditions, /WORLDLENS_TARGET_REPOSITORY_SEARCH/);
});
