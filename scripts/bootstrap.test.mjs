import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  JAR_STAMP_NAME,
  hasShadowJar,
  jarBuildState,
  parseHeadCommit,
  readJarStamp,
  selectJavaCandidate,
  resetDirectory,
  sha256File,
  shadowJarVersion,
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

// The jar-freshness cases below inject the jar predicate rather than fabricating a
// real shadow jar, because what is under test is the freshness decision and not the
// zip validation that hasShadowJar already covers in its own tests above.
function stampState(directory, { jarPresent, sourceCommit }) {
  return jarBuildState({
    jarDirectory: directory,
    stampFile: join(directory, JAR_STAMP_NAME),
    sourceCommit,
    hasJar: () => jarPresent,
  });
}

function writeStamp(directory, contents) {
  writeFileSync(join(directory, JAR_STAMP_NAME), contents);
}

test("jars with no provenance stamp are rebuilt", () => {
  const directory = temporaryDirectory();
  const state = stampState(directory, {
    jarPresent: true,
    sourceCommit: "aaa",
  });
  assert.equal(state.fresh, false);
  assert.equal(state.reason, "missing-stamp");
});

test("jars stamped with the checked-out commit are kept", () => {
  const directory = temporaryDirectory();
  writeStamp(directory, JSON.stringify({ commit: "aaa", builtAt: "now" }));
  const state = stampState(directory, {
    jarPresent: true,
    sourceCommit: "aaa",
  });
  assert.equal(state.fresh, true);
  assert.equal(state.reason, "fresh");
  assert.equal(state.stampCommit, "aaa");
});

test("jars stamped with a different commit are stale, and name that commit", () => {
  const directory = temporaryDirectory();
  writeStamp(directory, JSON.stringify({ commit: "old", builtAt: "then" }));
  const state = stampState(directory, {
    jarPresent: true,
    sourceCommit: "new",
  });
  assert.equal(state.fresh, false);
  assert.equal(state.reason, "stale");
  assert.equal(state.stampCommit, "old");
});

test("a matching stamp never outvotes a missing jar", () => {
  const directory = temporaryDirectory();
  writeStamp(directory, JSON.stringify({ commit: "aaa", builtAt: "now" }));
  const state = stampState(directory, {
    jarPresent: false,
    sourceCommit: "aaa",
  });
  assert.equal(state.fresh, false);
  assert.equal(state.reason, "missing-jar");
});

test("an unreadable stamp is treated as absent rather than throwing", () => {
  const directory = temporaryDirectory();
  writeStamp(directory, "{ this is not json");
  assert.equal(readJarStamp(join(directory, JAR_STAMP_NAME)), null);
  const state = stampState(directory, {
    jarPresent: true,
    sourceCommit: "aaa",
  });
  assert.equal(state.fresh, false);
  assert.equal(state.reason, "missing-stamp");
});

test("a stamp whose commit field is the wrong type is unreadable too", () => {
  const directory = temporaryDirectory();
  writeStamp(directory, JSON.stringify({ commit: 42 }));
  assert.equal(readJarStamp(join(directory, JAR_STAMP_NAME)), null);
});

test("the recorded version is the jar that was just built, not the one that sorts first", () => {
  // The exact defect, from the first real upgrade this feature handled. Gradle leaves the
  // previous version's jar in place, so after moving the submodule from 5.22-27 to 5.23 the
  // directory held both, and reading the first name alphabetically stamped a jar built from
  // 5.23 with `"version": "5.22-27"`. The commit field decides rebuilds so nothing behaved
  // wrongly, but a provenance record whose one human-readable field is wrong is worse than one
  // that omits it, because a reader believes it and stops looking.
  const directory = temporaryDirectory();
  const older = join(directory, "cli-5.22-27-shadow.jar");
  const newer = join(directory, "cli-5.23-shadow.jar");
  writeFileSync(older, "x".repeat(4096));
  writeFileSync(newer, "x".repeat(4096));

  // Ages set explicitly rather than relying on write order: two files written in the same
  // millisecond would make this pass or fail by luck, which is not a test.
  const old = new Date(Date.now() - 86_400_000);
  utimesSync(older, old, old);

  assert.equal(shadowJarVersion(directory), "5.23");
});

test("the recorded version still reads a lone jar, and is absent rather than wrong", () => {
  const only = temporaryDirectory();
  writeFileSync(join(only, "cli-5.23-shadow.jar"), "x".repeat(4096));
  assert.equal(shadowJarVersion(only), "5.23");

  // Nothing parseable, and a directory that is not there at all. Both omit the field rather
  // than guessing, because this is decoration on the stamp and must never fail a build.
  const unparseable = temporaryDirectory();
  writeFileSync(join(unparseable, "cli-shadow.jar"), "x".repeat(4096));
  assert.equal(shadowJarVersion(unparseable), null);
  assert.equal(shadowJarVersion(join(unparseable, "no-such-directory")), null);
});

test("the java probe keeps looking past an old java on PATH", () => {
  // The exact configuration the candidate list was written for: an older java on PATH, which
  // almost every developer machine and every hosted CI image has, and a new enough JDK behind
  // it. Stopping at the first java that answers reported this machine as unable to build.
  const probed = [];
  const best = selectJavaCandidate({
    candidates: [
      { command: "java", from: "PATH", major: 21 },
      { command: "/jdk25/bin/java", from: "JAVA_HOME", major: 25 },
      { command: "/provisioned/bin/java", from: "the provisioned JDK", major: 25 },
    ],
    requiredMajor: 25,
    readMajor: (candidate) => {
      probed.push(candidate.from);
      return candidate.major;
    },
  });

  assert.equal(best?.major, 25);
  assert.equal(best?.candidate.from, "JAVA_HOME");
  // And it stops as soon as one satisfies, rather than probing every remaining candidate.
  assert.deepEqual(probed, ["PATH", "JAVA_HOME"]);
});

test("a machine with nothing new enough is told which java it does have", () => {
  const best = selectJavaCandidate({
    candidates: [{ command: "java", from: "PATH", major: 17 }, { command: "/jdk21/bin/java", from: "JAVA_HOME", major: 21 }],
    requiredMajor: 25,
    readMajor: (candidate) => candidate.major,
  });

  assert.equal(best?.major, 21);

  // Nothing that answers at all is null, which is a different message: install one.
  assert.equal(
    selectJavaCandidate({
      candidates: [{ command: "java" }],
      requiredMajor: 25,
      readMajor: () => null,
    }),
    null,
  );
});

test("git's own error text is never mistaken for a commit", () => {
  const real = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(parseHeadCommit({ status: 0, stdout: `${real}\n` }), real);

  // What a source archive with no .git beside it produces. The first word of git's complaint is
  // "fatal:", which is what used to be stamped into the provenance file as the source commit.
  assert.equal(
    parseHeadCommit({
      status: 128,
      stdout: "",
      stderr:
        "fatal: not a git repository (or any of the parent directories): .git\n",
    }),
    null,
  );
  // A zero exit with something that is not an object name is refused on shape alone.
  assert.equal(parseHeadCommit({ status: 0, stdout: "HEAD\n" }), null);
  assert.equal(parseHeadCommit(null), null);
});
