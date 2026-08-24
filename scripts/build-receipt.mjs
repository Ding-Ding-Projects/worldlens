import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";

const outputs = [
  "design/packages/app/dist/main/index.js",
  "design/packages/app/dist/preload/index.cjs",
  "design/packages/app/dist/render-engines/manifest.json",
  "design/packages/ui/dist/index.html",
];

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function sourceState(repo) {
  const commit = git(repo, ["rev-parse", "HEAD"]);
  const tracked = git(repo, ["ls-files", "-s"]);
  const digest = createHash("sha256").update(tracked).digest("hex");
  return { commit, digest };
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function records(repo, startedAt) {
  return outputs.map((path) => {
    const absolute = resolve(repo, path);
    let stats;
    try {
      stats = statSync(absolute);
    } catch (error) {
      throw new Error(`missing build output: ${path} (${error.message})`);
    }
    assert.ok(stats.isFile() && stats.size > 0, `missing build output: ${path}`);
    assert.ok(stats.mtimeMs >= startedAt, `stale build output: ${path}`);
    return { path, sha256: sha256(absolute), size: stats.size, mtimeMs: stats.mtimeMs };
  });
}

function electronRecord(appDir, startedAt) {
  const requireFromApp = createRequire(join(appDir, "package.json"));
  const executable = requireFromApp("electron");
  const stats = statSync(executable);
  assert.ok(stats.isFile() && stats.size > 1_000_000, "Electron executable is missing or incomplete");
  assert.ok(stats.mtimeMs >= startedAt, "Electron executable is stale");
  const probe = spawnSync(executable, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  assert.equal(probe.status, 0, `Electron provenance probe failed: ${probe.stderr}`);
  return { path: executable, sha256: sha256(executable), size: stats.size, mtimeMs: stats.mtimeMs, version: `${probe.stdout}${probe.stderr}`.trim() };
}

export function prepare(repo, receipt) {
  const startedAt = Date.now();
  const design = resolve(repo, "design", "packages");
  for (const packageName of readdirSync(design)) {
    const dist = join(design, packageName, "dist");
    rmSync(dist, { recursive: true, force: true });
    if (packageName === "app") rmSync(join(design, packageName, "release", "win-unpacked"), { recursive: true, force: true });
  }
  writeFileSync(receipt, JSON.stringify({ schemaVersion: 1, state: "prepared", startedAt, source: sourceState(repo), outputs }, null, 2) + "\n");
  return startedAt;
}

export function finalize(repo, receipt) {
  const prior = JSON.parse(readFileSync(receipt, "utf8"));
  const appDir = resolve(repo, "design/packages/app");
  const next = { ...prior, state: "verified", finishedAt: Date.now(), source: sourceState(repo), outputs: records(repo, prior.startedAt), electron: electronRecord(appDir, prior.startedAt) };
  writeFileSync(receipt, JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function verify(repo, receipt) {
  const record = JSON.parse(readFileSync(receipt, "utf8"));
  assert.equal(record.state, "verified", "build receipt is not finalized");
  assert.deepEqual(record.source, sourceState(repo), "build receipt is for a different source commit or index");
  assert.deepEqual(record.outputs, records(repo, record.startedAt), "build outputs changed after receipt finalization");
  const electron = electronRecord(resolve(repo, "design/packages/app"), record.startedAt);
  assert.deepEqual(record.electron, electron, "Electron provenance changed after receipt finalization");
  return record;
}

export { outputs, records, sourceState };

const command = process.argv[2];
const repoFlag = process.argv.indexOf("--repo");
const receiptFlag = process.argv.indexOf("--receipt");
if (command) {
  const repo = resolve(process.argv[repoFlag + 1] ?? process.cwd());
  const receipt = resolve(process.argv[receiptFlag + 1] ?? join(repo, ".worldlens-build-receipt.json"));
  if (command === "prepare") prepare(repo, receipt);
  else if (command === "finalize") finalize(repo, receipt);
  else if (command === "verify") verify(repo, receipt);
  else throw new Error(`unknown build receipt command: ${command}`);
  process.stdout.write(`build receipt ${command} verified\n`);
}
