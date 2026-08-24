import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { outputs, prepare, records, sourceState } from "./build-receipt.mjs";

function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("build receipt clears owned outputs and records current source identity", () => {
  const repo = mkdtempSync(join(tmpdir(), "worldlens-receipt-"));
  try {
    git(repo, ["init", "--quiet"]);
    git(repo, ["config", "user.name", "receipt-test"]);
    git(repo, ["config", "user.email", "receipt-test@example.invalid"]);
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
