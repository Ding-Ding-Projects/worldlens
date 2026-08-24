import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { initializeAndVerify, verifyGitlinks } from "./verify-submodules.mjs";

function git(cwd, args) {
  const result = spawnSync("git", ["-c", "protocol.file.allow=always", "-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function init(repo) {
  git(repo, ["init", "--quiet"]);
  git(repo, ["config", "user.name", "submodule-test"]);
  git(repo, ["config", "user.email", "submodule-test@example.invalid"]);
}

test("a real submodule fixture detects missing checkout, then initializes and verifies the gitlink", () => {
  const root = mkdtempSync(join(tmpdir(), "worldlens-submodule-"));
  const child = join(root, "child-source");
  const parent = join(root, "parent");
  try {
    mkdirSync(child, { recursive: true });
    mkdirSync(parent, { recursive: true });
    init(child);
    writeFileSync(join(child, "fixture.txt"), "fixture\n");
    git(child, ["add", "."]);
    git(child, ["commit", "--quiet", "-m", "fixture"]);
    init(parent);
    git(parent, ["submodule", "add", child, "vendor/fixture"]);
    git(parent, ["commit", "--quiet", "-m", "fixture parent"]);
    assert.equal(verifyGitlinks(parent), 1);

    rmSync(join(parent, "vendor", "fixture"), { recursive: true, force: true });
    assert.throws(() => verifyGitlinks(parent), /not initialized/);

    assert.equal(initializeAndVerify(parent), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
