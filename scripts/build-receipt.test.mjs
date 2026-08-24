import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { assertCleanSource, electronRecord, outputs, prepare, records, sourceState } from "./build-receipt.mjs";

function git(cwd, args) {
  const result = spawnSync("git", ["-c", "protocol.file.allow=always", "-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("build receipt clears owned outputs and records current source identity", () => {
  const repo = mkdtempSync(join(tmpdir(), "worldlens-receipt-"));
  try {
    git(repo, ["init", "--quiet"]);
    git(repo, ["config", "user.name", "receipt-test"]);
    git(repo, ["config", "user.email", "receipt-test@example.invalid"]);
    writeFileSync(join(repo, ".gitignore"), "design/packages/**/dist/\n");
    git(repo, ["add", ".gitignore"]);
    git(repo, ["commit", "--quiet", "-m", "ignore-build-output"]);
    writeFileSync(join(repo, "source.txt"), "one\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "--quiet", "-m", "fixture"]);
    for (const output of outputs) {
      const path = join(repo, output);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, "stale output");
    }
    const receipt = join(repo, "receipt.json");
    const startedAt = prepare(repo, receipt);
    assert.equal(JSON.parse(readFileSync(receipt, "utf8")).source.commit, sourceState(repo).commit);
    assert.throws(() => records(repo, startedAt), /missing build output/);

    for (const output of outputs) {
      const path = join(repo, output);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, "fresh output");
    }
    assert.equal(records(repo, startedAt).length, outputs.length);

    utimesSync(join(repo, outputs[0]), new Date(1), new Date(1));
    assert.throws(() => records(repo, startedAt), /stale build output/);
    writeFileSync(join(repo, outputs[0]), "fresh again");
    assert.equal(records(repo, startedAt).length, outputs.length);

    writeFileSync(join(repo, "source.txt"), "two\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "--quiet", "-m", "fixture-two"]);
    assert.notEqual(JSON.parse(readFileSync(receipt, "utf8")).source.commit, sourceState(repo).commit);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the warm Electron executable is checked against the committed manifest, not its timestamp", () => {
  const appDir = join(process.cwd(), "design", "packages", "app");
  const record = electronRecord(appDir);
  assert.equal(record.version, "v37.10.3");
  assert.equal(record.size, 204521984);
  assert.equal(record.manifest.version, "37.10.3");
});

test("prepare rejects tracked, staged, untracked, and recursive submodule dirt", () => {
  const repo = mkdtempSync(join(tmpdir(), "worldlens-dirty-receipt-"));
  const child = join(repo, "child");
  const parent = join(repo, "parent");
  try {
    mkdirSync(child, { recursive: true });
    mkdirSync(parent, { recursive: true });
    git(child, ["init", "--quiet"]);
    git(child, ["config", "user.name", "dirty-test"]);
    git(child, ["config", "user.email", "dirty-test@example.invalid"]);
    writeFileSync(join(child, "child.txt"), "one\n");
    git(child, ["add", "."]);
    git(child, ["commit", "--quiet", "-m", "child"]);
    git(parent, ["init", "--quiet"]);
    git(parent, ["config", "user.name", "dirty-test"]);
    git(parent, ["config", "user.email", "dirty-test@example.invalid"]);
    writeFileSync(join(parent, "parent.txt"), "one\n");
    git(parent, ["add", "."]);
    git(parent, ["commit", "--quiet", "-m", "parent"]);
    git(parent, ["submodule", "add", child, "vendor/fixture"]);
    git(parent, ["commit", "--quiet", "-m", "submodule"]);
    assertCleanSource(parent);

    writeFileSync(join(parent, "parent.txt"), "tracked change\n");
    assert.throws(() => assertCleanSource(parent), /not clean/);
    git(parent, ["checkout", "--", "parent.txt"]);

    writeFileSync(join(parent, "untracked.txt"), "untracked\n");
    assert.throws(() => assertCleanSource(parent), /not clean/);
    rmSync(join(parent, "untracked.txt"), { force: true });

    writeFileSync(join(parent, "parent.txt"), "staged change\n");
    git(parent, ["add", "parent.txt"]);
    assert.throws(() => assertCleanSource(parent), /not clean/);
    git(parent, ["reset", "--quiet", "HEAD", "--", "parent.txt"]);
    git(parent, ["checkout", "--", "parent.txt"]);

    writeFileSync(join(parent, "vendor", "fixture", "child.txt"), "submodule change\n");
    assert.throws(() => assertCleanSource(parent), /not clean/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
