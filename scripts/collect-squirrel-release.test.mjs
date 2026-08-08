import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

import {
  collectOutputs,
  parseReleases,
  prepareOutputs,
  validateSquirrelDirectory,
} from "./collect-squirrel-release.mjs";

const hash = (buffer, algorithm = "sha1") =>
  createHash(algorithm).update(buffer).digest("hex");

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "worldlens-squirrel-"));
  const packageDirectory = resolve(root, "design", "packages", "app");
  const source = resolve(packageDirectory, "release", "squirrel-windows");
  const outputDirectory = resolve(root, "installer-out");
  const stateFile = resolve(root, "state", "build.json");
  mkdirSync(source, { recursive: true });
  const setup = Buffer.from("fresh setup");
  const full = Buffer.from("fresh full package");
  writeFileSync(resolve(source, "Worldlens-0.1.42-Setup.exe"), setup);
  writeFileSync(resolve(source, "Worldlens-0.1.42-full.nupkg"), full);
  writeFileSync(
    resolve(source, "RELEASES"),
    `${hash(full).toUpperCase()} Worldlens-0.1.42-full.nupkg ${full.length}\n`,
  );
  return {
    root,
    packageDirectory,
    source,
    outputDirectory,
    stateFile,
    setup,
    full,
  };
}

test("one fresh setup, full package, and matching RELEASES set is accepted", () => {
  const item = fixture();
  const files = validateSquirrelDirectory(item.source, {
    version: "0.1.42",
    startedAtMs: Date.now() - 1_000,
  });
  assert.deepEqual(
    files.map((path) => path.split(/[\\/]/).at(-1)),
    ["Worldlens-0.1.42-Setup.exe", "Worldlens-0.1.42-full.nupkg", "RELEASES"],
  );
});

test("deliberately red partial, duplicate, zero-byte, stale, and wrong-version sets fail closed", () => {
  for (const mutate of [
    (item) => writeFileSync(resolve(item.source, "RELEASES"), ""),
    (item) =>
      writeFileSync(
        resolve(item.source, "Other-0.1.42-Setup.exe"),
        "duplicate",
      ),
    (item) => writeFileSync(resolve(item.source, "Worldlens-0.1.42-full.nupkg"), ""),
    (item) => {
      const old = new Date(Date.now() - 60_000);
      utimesSync(resolve(item.source, "Worldlens-0.1.42-Setup.exe"), old, old);
    },
    (item) => {
      const oldName = resolve(item.source, "Worldlens-0.1.42-full.nupkg");
      const wrongName = resolve(item.source, "Worldlens-9.9.9-full.nupkg");
      writeFileSync(wrongName, readFileSync(oldName));
      writeFileSync(
        resolve(item.source, "RELEASES"),
        `${hash(readFileSync(wrongName))} Worldlens-9.9.9-full.nupkg ${statSync(wrongName).size}\n`,
      );
      writeFileSync(oldName, "not indexed");
    },
  ]) {
    const item = fixture();
    mutate(item);
    assert.throws(() =>
      validateSquirrelDirectory(item.source, {
        version: "0.1.42",
        startedAtMs: Date.now() - 5_000,
      }),
    );
  }
});

test("RELEASES rejects malformed lines, duplicate names, wrong sizes, and wrong hashes", () => {
  assert.throws(() => parseReleases(""), /empty/);
  assert.throws(() => parseReleases("not a release line\n"), /malformed/);
  const valid = `${"a".repeat(40)} Worldlens-0.1.42-full.nupkg 12`;
  assert.throws(() => parseReleases(`${valid}\n${valid}\n`), /repeats/);

  const wrongSize = fixture();
  writeFileSync(
    resolve(wrongSize.source, "RELEASES"),
    `${hash(wrongSize.full)} Worldlens-0.1.42-full.nupkg 999\n`,
  );
  assert.throws(
    () =>
      validateSquirrelDirectory(wrongSize.source, {
        version: "0.1.42",
        startedAtMs: 1,
      }),
    /byte count disagrees/,
  );

  const wrongHash = fixture();
  writeFileSync(
    resolve(wrongHash.source, "RELEASES"),
    `${"b".repeat(40)} Worldlens-0.1.42-full.nupkg ${wrongHash.full.length}\n`,
  );
  assert.throws(
    () =>
      validateSquirrelDirectory(wrongHash.source, {
        version: "0.1.42",
        startedAtMs: 1,
      }),
    /SHA-1 disagrees/,
  );
});

test("prepare clears only validated outputs and collect copies one proven set", () => {
  const item = fixture();
  const sibling = resolve(item.root, "keep-me.txt");
  writeFileSync(sibling, "safe");
  prepareOutputs({
    root: item.root,
    packageDirectory: item.packageDirectory,
    outputDirectory: item.outputDirectory,
    stateFile: item.stateFile,
    version: "0.1.42",
    now: Date.now() - 1_000,
  });
  assert.equal(readFileSync(sibling, "utf8"), "safe");

  mkdirSync(item.source, { recursive: true });
  writeFileSync(resolve(item.source, "Worldlens-0.1.42-Setup.exe"), item.setup);
  writeFileSync(resolve(item.source, "Worldlens-0.1.42-full.nupkg"), item.full);
  writeFileSync(
    resolve(item.source, "RELEASES"),
    `${hash(item.full)} Worldlens-0.1.42-full.nupkg ${item.full.length}\n`,
  );
  const result = collectOutputs({
    root: item.root,
    packageDirectory: item.packageDirectory,
    outputDirectory: item.outputDirectory,
    stateFile: item.stateFile,
    version: "0.1.42",
  });
  assert.deepEqual(result.artifacts, [
    "Worldlens-0.1.42-Setup.exe",
    "Worldlens-0.1.42-full.nupkg",
    "RELEASES",
  ]);
  assert.match(
    readFileSync(resolve(item.outputDirectory, "installer-out.sha256.txt"), "utf8"),
    /^[0-9a-f]{64}  RELEASES$/m,
  );
});

test("collection rejects two populated candidate directories and a pre-existing output", () => {
  const item = fixture();
  mkdirSync(dirname(item.stateFile), { recursive: true });
  writeFileSync(
    item.stateFile,
    JSON.stringify({ schemaVersion: 1, version: "0.1.42", startedAtMs: 1 }),
  );
  const second = resolve(item.packageDirectory, "dist", "squirrel-windows");
  mkdirSync(second, { recursive: true });
  writeFileSync(resolve(second, "Other-0.1.42-Setup.exe"), "second");
  assert.throws(
    () =>
      collectOutputs({
        root: item.root,
        packageDirectory: item.packageDirectory,
        outputDirectory: item.outputDirectory,
        stateFile: item.stateFile,
        version: "0.1.42",
      }),
    /exactly one populated/,
  );
});

test("prepare rejects an ancestor symbolic link or junction before recursive cleanup", () => {
  const root = mkdtempSync(resolve(tmpdir(), "worldlens-squirrel-link-root-"));
  const outside = mkdtempSync(resolve(tmpdir(), "worldlens-squirrel-link-outside-"));
  const packageDirectory = resolve(root, "design", "packages", "app");
  const sentinel = resolve(outside, "squirrel-windows", "keep-me.txt");
  mkdirSync(dirname(sentinel), { recursive: true });
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(sentinel, "outside must survive");
  symlinkSync(
    outside,
    resolve(packageDirectory, "release"),
    process.platform === "win32" ? "junction" : "dir",
  );

  assert.throws(
    () =>
      prepareOutputs({
        root,
        packageDirectory,
        outputDirectory: resolve(root, "installer-out"),
        stateFile: resolve(root, "state", "build.json"),
        version: "0.1.42",
      }),
    /symbolic link or junction/,
  );
  assert.equal(readFileSync(sentinel, "utf8"), "outside must survive");
});
