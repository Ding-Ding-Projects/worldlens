import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { validateHandoff, writeHandoff } from "./deps-handoff.mjs";

function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("dependency handoff is scoped to the current source and verified pnpm CLI", () => {
  const root = mkdtempSync(join(tmpdir(), "worldlens-handoff-"));
  try {
    git(root, ["init", "--quiet"]);
    git(root, ["config", "user.name", "handoff-test"]);
    git(root, ["config", "user.email", "handoff-test@example.invalid"]);
    writeFileSync(join(root, "source.txt"), "source\n");
    git(root, ["add", "."]);
    git(root, ["commit", "--quiet", "-m", "source"]);
    const pnpm = join(root, "pnpm.cjs");
    writeFileSync(pnpm, "process.stdout.write('10.33.0\\n')\n");
    const receipt = join(root, "handoff.json");
    writeHandoff(receipt, root, pnpm);
    assert.equal(validateHandoff(receipt, root).pnpmVersion, "10.33.0");

    const forged = JSON.parse(readFileSync(receipt, "utf8"));
    forged.sourceCommit = "0".repeat(40);
    writeFileSync(receipt, JSON.stringify(forged));
    assert.throws(() => validateHandoff(receipt, root), /source commit differs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
