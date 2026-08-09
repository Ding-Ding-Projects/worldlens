import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { releaseVersionIdentity } from "./release-version.mjs";

test("package, app, feed and release tag share one monotonic SemVer identity", () => {
  const build862 = releaseVersionIdentity("0.1.0", "862");
  const build863 = releaseVersionIdentity("0.1.0", "863");

  assert.deepEqual(build862, { version: "0.1.862", tag: "v0.1.862" });
  assert.deepEqual(build863, { version: "0.1.863", tag: "v0.1.863" });
  assert.equal(build862.tag.slice(1), build862.version);
  assert.equal(build863.tag.slice(1), build863.version);
  assert.ok(Number(build863.version.split(".")[2]) > Number(build862.version.split(".")[2]));
});

test("the old split identity is deliberately impossible", () => {
  const identity = releaseVersionIdentity("0.1.0", "862");
  assert.notEqual(identity.tag, "v0.1.0-build.862");
  assert.equal(identity.version, "0.1.862");
});

test("ambiguous bases and unsafe run numbers fail closed", () => {
  for (const base of ["0.1.2", "0.1.0-beta.1", "v0.1.0", "00.1.0", "0.01.0", ""]) {
    assert.throws(() => releaseVersionIdentity(base, "862"));
  }
  for (const run of ["0", "01", "-1", "1.5", "9007199254740992", "build.2", ""]) {
    assert.throws(() => releaseVersionIdentity("0.1.0", run));
  }
});

test("the CLI writes the same version it prints beside the tag", () => {
  const directory = mkdtempSync(join(tmpdir(), "worldlens-release-version-"));
  try {
    const manifestPath = join(directory, "package.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ name: "worldlens-test", version: "0.1.0", private: true }, null, 4)}\n`,
      "utf8",
    );
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./release-version.mjs", import.meta.url)),
        "--package",
        manifestPath,
        "--run-number",
        "863",
        "--write-package",
        "--format",
        "lines",
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), ["0.1.863", "v0.1.863"]);
    assert.equal(JSON.parse(readFileSync(manifestPath, "utf8")).version, "0.1.863");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
