import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const outputs = [
  "design/packages/app/dist/main/index.js",
  "design/packages/app/dist/preload/index.cjs",
  "design/packages/app/dist/render-engines/manifest.json",
  "design/packages/ui/dist/index.html",
];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolchainManifest = JSON.parse(readFileSync(join(repoRoot, "scripts/toolchain-manifest.json"), "utf8"));

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

export function assertCleanSource(repo) {
  const status = git(repo, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"]);
  assert.equal(status, "", `source checkout is not clean before build: ${status}`);
  const gitlinks = git(repo, ["ls-files", "-s"]).split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const match = /^160000 ([0-9a-f]{40}) 0\t(.+)$/.exec(line);
    return match ? [{ expected: match[1], path: match[2] }] : [];
  });
  for (const entry of gitlinks) {
    const submodule = resolve(repo, entry.path);
    let actual;
    try {
      actual = git(submodule, ["rev-parse", "HEAD"]);
    } catch (error) {
      throw new Error(`source submodule ${entry.path} is not initialized: ${error.message}`);
    }
    assert.equal(actual, entry.expected, `source submodule ${entry.path} is at ${actual}, expected ${entry.expected}`);
    const nestedStatus = git(submodule, ["status", "--porcelain=v1", "--untracked-files=all"]);
    assert.equal(nestedStatus, "", `source submodule ${entry.path} is not clean: ${nestedStatus}`);
  }
  return true;
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

function electronRecord(appDir) {
  const requireFromApp = createRequire(join(appDir, "package.json"));
  const executable = requireFromApp("electron");
  const stats = statSync(executable);
  const expected = toolchainManifest.electron;
  const expectedPath = resolve(appDir, "..", "..", expected.executableRelativePath);
  assert.equal(resolve(executable), expectedPath, "Electron executable path is not the committed manifest path");
  assert.ok(stats.isFile() && stats.size === expected.executableSize, "Electron executable size differs from the committed manifest");
  assert.equal(sha256(executable), expected.executableSha256, "Electron executable hash differs from the committed manifest");
  const probe = spawnSync(executable, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  assert.equal(probe.status, 0, `Electron provenance probe failed: ${probe.stderr}`);
  const version = `${probe.stdout}${probe.stderr}`.trim();
  assert.match(version, new RegExp(`^v?${expected.version.replaceAll(".", "\\.")}$`), "Electron version differs from the committed manifest");
  return { path: executable, sha256: sha256(executable), size: stats.size, version, manifest: { ...expected } };
}

export function prepare(repo, receipt) {
  assertCleanSource(repo);
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
  const next = { ...prior, state: "verified", finishedAt: Date.now(), source: sourceState(repo), outputs: records(repo, prior.startedAt), electron: electronRecord(appDir) };
  writeFileSync(receipt, JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function verify(repo, receipt) {
  const record = JSON.parse(readFileSync(receipt, "utf8"));
  assert.equal(record.state, "verified", "build receipt is not finalized");
  assertCleanSource(repo);
  assert.deepEqual(record.source, sourceState(repo), "build receipt is for a different source commit or index");
  assert.deepEqual(record.outputs, records(repo, record.startedAt), "build outputs changed after receipt finalization");
  const electron = electronRecord(resolve(repo, "design/packages/app"));
  assert.deepEqual(record.electron, electron, "Electron provenance changed after receipt finalization");
  return record;
}

export { electronRecord, outputs, records, sourceState };

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
