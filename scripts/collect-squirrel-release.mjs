#!/usr/bin/env node
/**
 * Prepare and collect one fresh Squirrel.Windows release set.
 *
 * `prepare` removes only the validated package-output candidates and collection
 * directory, then records the expected version and start time. `collect` accepts
 * exactly one fresh Setup.exe, one fresh full nupkg, optional fresh delta nupkgs,
 * and one non-empty RELEASES file whose SHA-1 and byte counts match every package.
 */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_CANDIDATES = Object.freeze([
  "release/squirrel-windows",
  "dist/squirrel-windows",
  "../../release/squirrel-windows",
]);
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const SHA1 = /^[0-9A-Fa-f]{40}$/;
const FRESHNESS_TOLERANCE_MS = 2_000;

function fail(message) {
  throw new Error(`Squirrel release contract failed: ${message}`);
}

function requireVersion(value) {
  if (typeof value !== "string" || !VERSION.test(value)) {
    fail("version must be a bounded semantic version");
  }
  return value;
}

function requireInside(root, candidate, label) {
  const absoluteRoot = resolve(root);
  const absoluteCandidate = resolve(candidate);
  const pathFromRoot = relative(absoluteRoot, absoluteCandidate);
  if (
    pathFromRoot === "" ||
    isAbsolute(pathFromRoot) ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    fail(`${label} must resolve to a child of the repository root`);
  }
  return absoluteCandidate;
}

function candidateDirectories(root, packageDirectory) {
  const packagePath = requireInside(root, packageDirectory, "package directory");
  return OUTPUT_CANDIDATES.map((candidate) =>
    requireInside(root, resolve(packagePath, candidate), "package output"),
  );
}

function sha(path, algorithm) {
  return createHash(algorithm).update(readFileSync(path)).digest("hex");
}

function relevantArtifact(name) {
  return (
    /Setup\.exe$/i.test(name) ||
    /\.nupkg$/i.test(name) ||
    name === "RELEASES" ||
    name === "Squirrel.exe"
  );
}

function readState(stateFile) {
  let state;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8"));
  } catch (error) {
    fail(`build-state file cannot be read (${error.code ?? error.message})`);
  }
  requireVersion(state.version);
  if (!Number.isSafeInteger(state.startedAtMs) || state.startedAtMs < 1) {
    fail("build-state start time is invalid");
  }
  return state;
}

function prepareOutputs({
  root = process.cwd(),
  packageDirectory,
  outputDirectory,
  stateFile,
  version,
  now = Date.now(),
}) {
  requireVersion(version);
  const candidates = candidateDirectories(root, packageDirectory);
  const output = requireInside(root, outputDirectory, "collection output");
  if (!Number.isSafeInteger(now) || now < 1) fail("build start time is invalid");

  for (const path of [...candidates, output]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
      fail(`refusing to clear symbolic-link output ${path}`);
    }
    rmSync(path, { recursive: true, force: true });
  }

  mkdirSync(dirname(resolve(stateFile)), { recursive: true });
  writeFileSync(
    stateFile,
    JSON.stringify({ schemaVersion: 1, version, startedAtMs: now }, null, 2) +
      "\n",
    "utf8",
  );
  return { candidates, output, startedAtMs: now };
}

function parseReleases(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    fail("RELEASES is empty");
  }
  const records = new Map();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === "") continue;
    const match = /^([0-9A-Fa-f]{40})\s+([^\s]+)\s+([1-9]\d*)$/.exec(
      line.trim(),
    );
    if (!match || !SHA1.test(match[1]) || !SAFE_FILE.test(match[2])) {
      fail(`RELEASES line ${index + 1} is malformed`);
    }
    const size = Number(match[3]);
    if (!Number.isSafeInteger(size) || size < 1) {
      fail(`RELEASES line ${index + 1} has an invalid byte count`);
    }
    if (records.has(match[2])) fail(`RELEASES repeats ${match[2]}`);
    records.set(match[2], { sha1: match[1].toLowerCase(), size });
  }
  if (records.size === 0) fail("RELEASES has no package records");
  return records;
}

function validateSquirrelDirectory(directory, { version, startedAtMs }) {
  requireVersion(version);
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && relevantArtifact(entry.name))
    .map((entry) => resolve(directory, entry.name));
  const setup = files.filter((path) => /Setup\.exe$/i.test(basename(path)));
  const packages = files.filter((path) => /\.nupkg$/i.test(basename(path)));
  const full = packages.filter((path) => /-full\.nupkg$/i.test(basename(path)));
  const deltas = packages.filter((path) => /-delta\.nupkg$/i.test(basename(path)));
  const releases = files.filter((path) => basename(path) === "RELEASES");

  if (setup.length !== 1)
    fail(`expected exactly one Setup.exe; found ${setup.length}`);
  if (full.length !== 1)
    fail(`expected exactly one full nupkg; found ${full.length}`);
  if (packages.length !== full.length + deltas.length) {
    fail("every nupkg must be explicitly full or delta");
  }
  if (releases.length !== 1)
    fail(`expected exactly one RELEASES; found ${releases.length}`);

  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const versionPattern = new RegExp(`(?:^|[-.])${escapedVersion}(?:[-.]|$)`, "i");
  for (const path of [...setup, ...packages]) {
    if (!versionPattern.test(basename(path))) {
      fail(`${basename(path)} does not carry expected version ${version}`);
    }
  }

  for (const path of [...setup, ...packages, ...releases]) {
    const stats = statSync(path);
    if (stats.size < 1) fail(`${basename(path)} is empty`);
    if (stats.mtimeMs + FRESHNESS_TOLERANCE_MS < startedAtMs) {
      fail(`${basename(path)} predates this packaging run`);
    }
  }

  const index = parseReleases(readFileSync(releases[0], "utf8"));
  const packageNames = new Set(packages.map((path) => basename(path)));
  if (index.size !== packageNames.size) {
    fail(`RELEASES lists ${index.size} packages but ${packageNames.size} were emitted`);
  }
  for (const path of packages) {
    const name = basename(path);
    const record = index.get(name);
    if (!record) fail(`RELEASES does not list ${name}`);
    if (record.size !== statSync(path).size)
      fail(`RELEASES byte count disagrees for ${name}`);
    if (record.sha1 !== sha(path, "sha1"))
      fail(`RELEASES SHA-1 disagrees for ${name}`);
  }

  const squirrel = files.filter((path) => basename(path) === "Squirrel.exe");
  return [...setup, ...full, ...deltas, ...releases, ...squirrel];
}

function collectOutputs({
  root = process.cwd(),
  packageDirectory,
  outputDirectory,
  stateFile,
  version,
}) {
  const state = readState(stateFile);
  if (state.version !== requireVersion(version)) {
    fail(`build-state version ${state.version} does not match ${version}`);
  }
  const candidates = candidateDirectories(root, packageDirectory);
  const active = candidates.filter(
    (directory) =>
      existsSync(directory) &&
      statSync(directory).isDirectory() &&
      readdirSync(directory).some(relevantArtifact),
  );
  if (active.length !== 1) {
    fail(`expected exactly one populated Squirrel output directory; found ${active.length}`);
  }

  const artifacts = validateSquirrelDirectory(active[0], state);
  const output = requireInside(root, outputDirectory, "collection output");
  if (existsSync(output)) fail("collection output was not clean before collection");
  mkdirSync(output, { recursive: true });
  for (const source of artifacts)
    copyFileSync(source, resolve(output, basename(source)));

  const digestLines = artifacts
    .map((source) => basename(source))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `${sha(resolve(output, name), "sha256")}  ${name}`);
  writeFileSync(
    resolve(output, "installer-out.sha256.txt"),
    digestLines.join("\n") + "\n",
  );

  return {
    source: active[0],
    output,
    artifacts: artifacts.map((path) => basename(path)),
  };
}

function parseArgs(argv) {
  const mode = argv[2];
  if (mode !== "prepare" && mode !== "collect")
    fail("mode must be prepare or collect");
  const values = {};
  for (let index = 3; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined)
      fail("arguments must be --name value pairs");
    values[name.slice(2)] = value;
  }
  for (const required of ["package-dir", "output", "state", "version"]) {
    if (!values[required]) fail(`--${required} is required`);
  }
  return {
    mode,
    packageDirectory: values["package-dir"],
    outputDirectory: values.output,
    stateFile: values.state,
    version: values.version,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const result =
    args.mode === "prepare" ? prepareOutputs(args) : collectOutputs(args);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

export {
  OUTPUT_CANDIDATES,
  collectOutputs,
  parseReleases,
  prepareOutputs,
  validateSquirrelDirectory,
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
