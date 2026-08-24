import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "scripts", "toolchain-manifest.json"), "utf8"));
const pin = manifest.pnpm;
const toolchainRoot = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Local"), "worldlens-toolchain", "pnpm");
const tarball = join(toolchainRoot, `pnpm-${pin.version}.tgz`);
const receipt = join(toolchainRoot, `pnpm-${pin.version}.receipt.json`);
const installRoot = join(toolchainRoot, pin.version);

function digest(bytes, algorithm, encoding = "hex") {
  return createHash(algorithm).update(bytes).digest(encoding);
}

function npmCli() {
  const d = dirname(process.execPath);
  const candidates = [
    join(d, "node_modules", "npm", "bin", "npm-cli.js"),
    join(d, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    join(d, "..", "share", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const found = candidates.find(existsSync);
  assert.ok(found, "npm CLI is missing beside the active Node runtime");
  return found;
}

function verifyTarball(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.length, pin.size, `pnpm tarball size mismatch: expected ${pin.size}, got ${bytes.length}`);
  assert.equal(digest(bytes, "sha256"), pin.sha256, "pnpm tarball SHA-256 mismatch");
  assert.equal(digest(bytes, "sha1"), pin.shasum, "pnpm tarball SHA-1 mismatch");
  assert.equal(`sha512-${digest(bytes, "sha512", "base64")}`, pin.integrity, "pnpm tarball integrity mismatch");
  return bytes;
}

async function ensureTarball() {
  mkdirSync(toolchainRoot, { recursive: true });
  if (!existsSync(tarball)) {
    const response = await fetch(pin.tarball);
    assert.ok(response.ok, `pnpm tarball download returned HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const temporary = `${tarball}.${process.pid}.part`;
    writeFileSync(temporary, bytes);
    verifyTarball(temporary);
    renameSync(temporary, tarball);
  }
  verifyTarball(tarball);
}

function installedCli() {
  const candidates = [
    join(installRoot, "node_modules", "pnpm", "bin", "pnpm.cjs"),
    join(installRoot, "node_modules", "pnpm", "bin", "pnpm.js"),
  ];
  const cli = candidates.find(existsSync);
  if (!cli) return null;
  const packageJson = JSON.parse(readFileSync(join(installRoot, "node_modules", "pnpm", "package.json"), "utf8"));
  if (packageJson.version !== pin.version) return null;
  return cli;
}

function install() {
  const cli = installedCli();
  if (cli) return cli;
  rmSync(installRoot, { recursive: true, force: true });
  mkdirSync(installRoot, { recursive: true });
  const result = spawnSync(process.execPath, [npmCli(), "install", "--prefix", installRoot, "--no-save", "--no-package-lock", "--ignore-scripts", tarball], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "inherit"],
    shell: false,
  });
  assert.equal(result.status, 0, `npm could not install the verified pnpm package, exit ${result.status}`);
  const installed = installedCli();
  assert.ok(installed, "verified pnpm package did not install its expected CLI");
  writeFileSync(receipt, JSON.stringify({ schemaVersion: 1, package: pin, tarball, installed, verifiedAt: new Date().toISOString() }, null, 2) + "\n");
  return installed;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    process.stdout.write(`pnpm ${pin.version} uses committed SHA-256 and integrity metadata\n`);
    return;
  }
  if (checkOnly) {
    assert.ok(existsSync(tarball), "verified pnpm tarball is missing");
    verifyTarball(tarball);
    assert.ok(installedCli(), "verified pnpm CLI is missing");
    process.stdout.write(`${installedCli()}\n`);
    return;
  }
  await ensureTarball();
  process.stdout.write(`${install()}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();

export { pin, verifyTarball };
