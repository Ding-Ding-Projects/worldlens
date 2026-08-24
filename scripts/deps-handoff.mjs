import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  assert.equal(result.status, 0, `git failed: ${result.stderr}`);
  return result.stdout.trim();
}

function nonce() {
  return createHash("sha256").update(`${process.pid}:${Date.now()}:${Math.random()}`).digest("hex");
}

export function writeHandoff(file, repo, pnpmCli) {
  const sourceCommit = git(repo, ["rev-parse", "HEAD"]);
  assert.ok(existsSync(pnpmCli), `pnpm CLI does not exist: ${pnpmCli}`);
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, sourceCommit, pnpmCli: resolve(pnpmCli), pnpmVersion: "10.33.0", nonce: nonce(), createdAt: Date.now() }, null, 2) + "\n");
}

export function validateHandoff(file, repo) {
  const value = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(value.schemaVersion, 1, "dependency handoff schema is unsupported");
  assert.equal(value.sourceCommit, git(repo, ["rev-parse", "HEAD"]), "dependency handoff source commit differs");
  assert.equal(value.pnpmVersion, "10.33.0", "dependency handoff pnpm version differs");
  assert.ok(typeof value.nonce === "string" && /^[0-9a-f]{64}$/.test(value.nonce), "dependency handoff nonce is invalid");
  assert.ok(Number.isSafeInteger(value.createdAt) && Date.now() - value.createdAt < 5 * 60 * 1000, "dependency handoff is stale");
  assert.ok(existsSync(value.pnpmCli), "dependency handoff pnpm CLI is missing");
  const probe = spawnSync(process.execPath, [value.pnpmCli, "--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  assert.equal(probe.status, 0, `dependency handoff pnpm probe failed: ${probe.stderr}`);
  assert.equal(probe.stdout.trim(), value.pnpmVersion, "dependency handoff pnpm probe differs");
  return value;
}

const command = process.argv[2];
if (command === "write" || command === "validate") {
  const file = resolve(process.argv[process.argv.indexOf("--file") + 1]);
  const repo = resolve(process.argv[process.argv.indexOf("--repo") + 1]);
  if (command === "write") writeHandoff(file, repo, resolve(process.argv[process.argv.indexOf("--pnpm-cli") + 1]));
  else validateHandoff(file, repo);
}
