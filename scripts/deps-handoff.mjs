import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "scripts", "toolchain-manifest.json"), "utf8"));
const pnpmPin = manifest.pnpm;

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  assert.equal(result.status, 0, `git failed: ${result.stderr}`);
  return result.stdout.trim();
}

function nonce() {
  return createHash("sha256").update(`${process.pid}:${Date.now()}:${Math.random()}`).digest("hex");
}

function inside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !/^[A-Za-z]:/.test(rel));
}

function treeDigest(root) {
  const entries = [];
  function walk(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute, rel);
      else if (entry.isFile()) entries.push(`file:${rel}:${createHash("sha256").update(readFileSync(absolute)).digest("hex")}:${statSync(absolute).size}`);
      else throw new Error(`unsupported handoff tree entry: ${rel}`);
    }
  }
  walk(root);
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

function managedPaths() {
  const local = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Local");
  const root = resolve(local, "worldlens-toolchain", "pnpm", pnpmPin.version);
  return { root, receipt: resolve(local, "worldlens-toolchain", "pnpm", `pnpm-${pnpmPin.version}.receipt.json`) };
}

export function writeHandoff(file, repo, pnpmCli) {
  const sourceCommit = git(repo, ["rev-parse", "HEAD"]);
  assert.ok(existsSync(pnpmCli), `pnpm CLI does not exist: ${pnpmCli}`);
  const managed = managedPaths();
  const cli = resolve(pnpmCli);
  assert.ok(inside(managed.root, cli), "pnpm CLI is outside the managed toolchain root");
  assert.ok(existsSync(managed.receipt), "verified pnpm install receipt is missing");
  const receipt = JSON.parse(readFileSync(managed.receipt, "utf8"));
  assert.equal(receipt.package?.sha256, pnpmPin.sha256);
  assert.equal(receipt.package?.integrity, pnpmPin.integrity);
  assert.equal(receipt.package?.size, pnpmPin.size);
  assert.equal(resolve(receipt.installRoot), managed.root);
  assert.equal(resolve(receipt.installed), cli);
  assert.equal(receipt.installedTreeSha256, treeDigest(managed.root));
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, sourceCommit, pnpmCli: cli, pnpmVersion: pnpmPin.version, pnpmReceipt: managed.receipt, installedTreeSha256: receipt.installedTreeSha256, nonce: nonce(), createdAt: Date.now() }, null, 2) + "\n");
}

export function validateHandoff(file, repo) {
  const value = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(value.schemaVersion, 1, "dependency handoff schema is unsupported");
  assert.equal(value.sourceCommit, git(repo, ["rev-parse", "HEAD"]), "dependency handoff source commit differs");
  assert.equal(value.pnpmVersion, "10.33.0", "dependency handoff pnpm version differs");
  assert.ok(typeof value.nonce === "string" && /^[0-9a-f]{64}$/.test(value.nonce), "dependency handoff nonce is invalid");
  assert.ok(Number.isSafeInteger(value.createdAt) && Date.now() - value.createdAt < 5 * 60 * 1000, "dependency handoff is stale");
  const managed = managedPaths();
  assert.equal(resolve(value.pnpmReceipt), managed.receipt, "dependency handoff receipt is outside the managed receipt path");
  const managedCliPaths = [
    resolve(managed.root, "node_modules", "pnpm", "bin", "pnpm.cjs"),
    resolve(managed.root, "node_modules", "pnpm", "bin", "pnpm.js"),
  ];
  assert.ok(managedCliPaths.includes(resolve(value.pnpmCli)), "dependency handoff CLI is outside the managed pnpm path");
  assert.ok(existsSync(value.pnpmCli), "dependency handoff pnpm CLI is missing");
  const receipt = JSON.parse(readFileSync(managed.receipt, "utf8"));
  assert.equal(receipt.package?.sha256, pnpmPin.sha256, "dependency handoff receipt SHA-256 differs");
  assert.equal(receipt.package?.integrity, pnpmPin.integrity, "dependency handoff receipt integrity differs");
  assert.equal(receipt.package?.size, pnpmPin.size, "dependency handoff receipt size differs");
  assert.equal(receipt.installedTreeSha256, value.installedTreeSha256, "dependency handoff installed tree differs");
  assert.equal(treeDigest(managed.root), value.installedTreeSha256, "managed pnpm tree is tampered");
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
