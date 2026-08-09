#!/usr/bin/env node
/**
 * Resolve the one version identity shared by Squirrel, Electron and the GitHub release.
 *
 * update.electronjs.org compares the installed version with the GitHub release tag as
 * SemVer. A tag such as `v0.1.0-build.862` is older than an installed `0.1.828`, even
 * when the attached package is actually `0.1.862`. This helper makes that split
 * impossible: the package version is `major.minor.<run>` and the tag is exactly that
 * same version with a leading `v`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BASE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.0$/;
const RUN_NUMBER = /^(0|[1-9][0-9]*)$/;

export function releaseVersionIdentity(baseVersion, runNumber) {
  const base = BASE_VERSION.exec(String(baseVersion));
  if (base === null) {
    throw new Error(
      "application package version must be major.minor.0 with no prerelease or build suffix",
    );
  }

  const run = String(runNumber);
  if (!RUN_NUMBER.test(run) || run === "0") {
    throw new Error("workflow run number must be a positive integer with no leading zero");
  }
  const numericRun = Number(run);
  if (!Number.isSafeInteger(numericRun)) {
    throw new Error("workflow run number is outside JavaScript's exact integer range");
  }

  const version = `${base[1]}.${base[2]}.${run}`;
  return Object.freeze({ version, tag: `v${version}` });
}

function parseArguments(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write-package") {
      flags.add(argument);
      continue;
    }
    if (!["--package", "--run-number", "--format"].includes(argument)) {
      throw new Error(`unknown argument ${argument}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${argument} needs a value`);
    }
    values.set(argument, value);
    index += 1;
  }

  const packagePath = values.get("--package");
  const runNumber = values.get("--run-number");
  const format = values.get("--format") ?? "json";
  if (packagePath === undefined || runNumber === undefined) {
    throw new Error("--package and --run-number are required");
  }
  if (format !== "json" && format !== "lines") {
    throw new Error("--format must be json or lines");
  }
  return { packagePath: resolve(packagePath), runNumber, format, writePackage: flags.has("--write-package") };
}

function readPackage(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("package manifest must contain one JSON object");
  }
  if (typeof parsed.version !== "string") {
    throw new Error("package manifest must contain a string version");
  }
  return parsed;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = readPackage(options.packagePath);
  const identity = releaseVersionIdentity(manifest.version, options.runNumber);

  if (options.writePackage) {
    writeFileSync(
      options.packagePath,
      `${JSON.stringify({ ...manifest, version: identity.version }, null, 4)}\n`,
      "utf8",
    );
  }

  if (options.format === "lines") {
    process.stdout.write(`${identity.version}\n${identity.tag}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(identity)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`release-version: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
