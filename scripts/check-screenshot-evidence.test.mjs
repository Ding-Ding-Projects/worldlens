import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  collectInterfaceSources,
  interfaceSourceDigest,
  shipsInInterface,
  stalenessComplaints,
} from "./check-screenshot-evidence.mjs";

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
