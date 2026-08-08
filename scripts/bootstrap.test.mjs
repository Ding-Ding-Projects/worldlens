import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  hasShadowJar,
  resetDirectory,
  sha256File,
  verifyElectronArchive,
} from "./bootstrap-helpers.mjs";

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "worldlens-bootstrap-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a cached Electron archive must match the package checksum manifest", () => {
  const directory = temporaryDirectory();
  const archive = join(directory, "electron-v1.2.3-win32-x64.zip");
  const checksums = join(directory, "checksums.json");
  writeFileSync(archive, "verified archive bytes");
  writeFileSync(
    checksums,
    JSON.stringify({ ["electron-v1.2.3-win32-x64.zip"]: sha256File(archive) }),
  );

  assert.equal(verifyElectronArchive(archive, checksums), sha256File(archive));

  writeFileSync(archive, "tampered archive bytes");
  assert.throws(
    () => verifyElectronArchive(archive, checksums),
    /failed SHA-256 verification/,
  );
});

test("an archive missing from the package checksum manifest fails closed", () => {
  const directory = temporaryDirectory();
  const archive = join(directory, "electron-v1.2.3-win32-x64.zip");
  const checksums = join(directory, "checksums.json");
  writeFileSync(archive, "archive bytes");
  writeFileSync(checksums, "{}");

  assert.throws(
    () => verifyElectronArchive(archive, checksums),
    /no valid SHA-256/,
  );
});

test("fallback extraction starts from an empty directory", () => {
  const directory = temporaryDirectory();
  const packageRoot = join(directory, "package");
  mkdirSync(packageRoot);
  const dist = join(packageRoot, "dist");
  const locales = join(dist, "locales");
  mkdirSync(locales, { recursive: true });
  writeFileSync(join(locales, "ru.pak"), "partial installer output");

  resetDirectory(dist, packageRoot);

  assert.equal(existsSync(dist), true);
  assert.equal(existsSync(join(locales, "ru.pak")), false);
});

test("recursive cleanup rejects lexical escapes and reparse points", () => {
  const directory = temporaryDirectory();
  const packageRoot = join(directory, "package");
  const outside = join(directory, "outside");
  const linked = join(packageRoot, "dist");
  mkdirSync(packageRoot);
  mkdirSync(outside);
  const sentinel = join(outside, "do-not-delete.txt");
  writeFileSync(sentinel, "keep me");

  assert.throws(
    () => resetDirectory(join(packageRoot, "..", "outside"), packageRoot),
    /outside/,
  );

  symlinkSync(
    outside,
    linked,
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(() => resetDirectory(linked, packageRoot), /reparse point/);
  assert.equal(existsSync(sentinel), true);
  unlinkSync(linked);
});

test("shadow-jar detection rejects tiny or non-jar files and creates no shell scratch path", () => {
  const directory = temporaryDirectory();
  const jar = join(directory, "bluemap-cli-shadow.jar");
  writeFileSync(jar, Buffer.alloc(3));
  assert.equal(hasShadowJar(directory), false);

  const bytes = Buffer.alloc(4096);
  Buffer.from([0x50, 0x4b, 0x03, 0x04]).copy(bytes, 0);
  Buffer.from([0x50, 0x4b, 0x01, 0x02]).copy(bytes, 30);
  bytes.writeUInt16LE(1, bytes.length - 12);
  bytes.writeUInt32LE(46, bytes.length - 10);
  bytes.writeUInt32LE(30, bytes.length - 6);
  Buffer.from([0x50, 0x4b, 0x05, 0x06]).copy(bytes, bytes.length - 22);
  bytes.writeUInt16LE(1, bytes.length - 12);
  bytes.writeUInt32LE(46, bytes.length - 10);
  bytes.writeUInt32LE(30, bytes.length - 6);
  writeFileSync(jar, bytes);
  const scratch = join(directory, "n.endsWith('-shadow.jar')).join('')");

  assert.equal(hasShadowJar(directory), true);
  assert.equal(existsSync(scratch), false);
});
