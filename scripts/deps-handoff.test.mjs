import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { validateHandoff } from "./deps-handoff.mjs";

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
    const receipt = join(root, "handoff.json");
    const fakeCli = join(root, "fake-pnpm.cjs");
    writeFileSync(fakeCli, "process.stdout.write('10.33.0\\n')\n");
    const commit = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    writeFileSync(receipt, JSON.stringify({
      schemaVersion: 1,
      sourceCommit: commit,
      pnpmCli: fakeCli,
      pnpmVersion: "10.33.0",
      pnpmReceipt: join(root, "fake-pnpm-receipt.json"),
      installedTreeSha256: "0".repeat(64),
      nonce: "1".repeat(64),
      createdAt: Date.now(),
    }));
    assert.throws(() => validateHandoff(receipt, root), /receipt is outside|CLI is outside/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
