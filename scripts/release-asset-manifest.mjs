#!/usr/bin/env node
/** Create and verify the exact asset contract for a Worldlens release. */

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/;
const SAFE_TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-build\.\d+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const MAX_MANIFEST_BYTES = 1024 * 1024;

function fail(message) {
  throw new Error(`release asset contract failed: ${message}`);
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireChild(root, path, label) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  const fromRoot = relative(absoluteRoot, absolutePath);
  if (
    fromRoot === "" ||
    isAbsolute(fromRoot) ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`)
  ) {
    fail(`${label} must be a child of the repository root`);
  }
  return { absolutePath, relativePath: fromRoot.replaceAll("\\", "/") };
}

function requireRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    fail("manifest contains a non-object asset record");
  }
  if (!SAFE_NAME.test(record.name) || basename(record.path) !== record.name) {
    fail("manifest contains an unsafe or inconsistent asset name");
  }
  if (!Number.isSafeInteger(record.size) || record.size < 1) {
    fail(`manifest byte count is invalid for ${record.name}`);
  }
  if (!SHA256.test(record.sha256)) {
    fail(`manifest SHA-256 is invalid for ${record.name}`);
  }
  return record;
}

function createManifest(paths, { root = process.cwd() } = {}) {
  if (!Array.isArray(paths) || paths.length < 1) fail("at least one asset is required");
  const names = new Set();
  const assets = paths.map((path) => {
    const { absolutePath, relativePath } = requireChild(root, path, "asset path");
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      fail(`asset does not exist as a file: ${relativePath}`);
    }
    const name = basename(absolutePath);
    if (!SAFE_NAME.test(name)) fail(`asset name is unsafe: ${name}`);
    if (names.has(name)) fail(`asset basename is duplicated: ${name}`);
    names.add(name);
    const size = statSync(absolutePath).size;
    if (size < 1) fail(`asset is empty: ${name}`);
    return { name, path: relativePath, size, sha256: digest(absolutePath) };
  });
  assets.sort((left, right) => left.name.localeCompare(right.name));
  return { schemaVersion: 1, assets };
}

function readManifest(path) {
  const stats = statSync(path);
  if (stats.size < 1 || stats.size > MAX_MANIFEST_BYTES) {
    fail("manifest size is outside the supported boundary");
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("manifest is not valid JSON");
  }
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.assets)) {
    fail("manifest schema is not version 1");
  }
  const names = new Set();
  for (const raw of manifest.assets) {
    const record = requireRecord(raw);
    if (names.has(record.name)) fail(`manifest repeats ${record.name}`);
    names.add(record.name);
  }
  if (names.size < 1) fail("manifest contains no assets");
  return manifest;
}

function markdownForManifest(manifest) {
  const rows = manifest.assets.map(
    (asset) => `| \`${asset.name}\` | ${asset.size} | \`${asset.sha256}\` |`,
  );
  return [
    "## Release asset SHA-256",
    "",
    "| Asset | Bytes | SHA-256 |",
    "|---|---:|---|",
    ...rows,
    "",
  ].join("\n");
}

function verifyDirectory(manifest, directory) {
  const actualNames = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const expectedNames = manifest.assets.map((asset) => asset.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail(
      `downloaded asset set differs (expected ${expectedNames.join(", ")}; found ${actualNames.join(", ")})`,
    );
  }
  for (const record of manifest.assets) {
    const path = resolve(directory, record.name);
    if (statSync(path).size !== record.size) fail(`downloaded size differs for ${record.name}`);
    if (digest(path) !== record.sha256) fail(`downloaded SHA-256 differs for ${record.name}`);
  }
  return expectedNames.length;
}

function requireNomination(metadata, { commit, tag }) {
  if (!COMMIT.test(commit)) fail("expected commit is not a full SHA");
  if (!SAFE_TAG.test(tag)) fail("expected tag is outside the release schema");
  if (metadata?.isDraft !== false || metadata?.isPrerelease !== false) {
    fail("release is draft or prerelease");
  }
  if (metadata.tagName !== tag) fail("release tag differs from the nomination");
  if (metadata.targetCommitish !== commit) fail("release target differs from the nominated commit");
}

function verifyMetadata(metadata, manifest, { commit, tag, notes }) {
  requireNomination(metadata, { commit, tag });
  const expectedNotes = readFileSync(notes, "utf8");
  if (metadata.body !== expectedNotes) fail("published release notes differ from the verified file");
  for (const marker of [
    `Commit \`${commit}\``,
    `Changelog commit: \`${commit}\``,
    "Worldlens for Windows is intentionally and permanently unsigned",
    "## Release asset SHA-256",
    "## Workflow timing",
    "- Workflow started:",
    "- Workflow completed:",
    "- Workflow duration:",
  ]) {
    if (!expectedNotes.includes(marker)) fail(`release notes are missing ${marker}`);
  }

  const metadataAssets = new Map(
    (metadata.assets ?? []).map((asset) => [asset.name, asset]),
  );
  if (metadataAssets.size !== manifest.assets.length) {
    fail("published asset count differs from the verified manifest");
  }
  for (const record of manifest.assets) {
    const published = metadataAssets.get(record.name);
    if (!published || published.size !== record.size) {
      fail(`published metadata differs for ${record.name}`);
    }
  }
}

function parseOptions(argv) {
  const mode = argv[2];
  const values = {};
  const paths = [];
  let positional = false;
  for (let index = 3; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--") {
      positional = true;
      continue;
    }
    if (positional) {
      paths.push(value);
      continue;
    }
    if (!value.startsWith("--") || index + 1 >= argv.length) {
      fail("options must be --name value pairs followed by -- asset paths");
    }
    values[value.slice(2)] = argv[++index];
  }
  return { mode, values, paths };
}

function main() {
  const { mode, values, paths } = parseOptions(process.argv);
  if (mode === "create") {
    if (!values.manifest || !values.markdown) fail("create requires --manifest and --markdown");
    const manifest = createManifest(paths);
    writeFileSync(values.manifest, JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(values.markdown, markdownForManifest(manifest));
    process.stdout.write(`recorded ${manifest.assets.length} release assets\n`);
    return;
  }
  if (mode === "verify-nomination") {
    for (const required of ["metadata", "commit", "tag"]) {
      if (!values[required]) fail(`verify-nomination requires --${required}`);
    }
    requireNomination(JSON.parse(readFileSync(values.metadata, "utf8")), {
      commit: values.commit,
      tag: values.tag,
    });
    process.stdout.write("verified the existing nominated release target\n");
    return;
  }
  if (!values.manifest) fail(`${mode} requires --manifest`);
  const manifest = readManifest(values.manifest);
  if (mode === "list") {
    process.stdout.write(manifest.assets.map((asset) => asset.path).join("\n") + "\n");
  } else if (mode === "verify") {
    if (!values.directory) fail("verify requires --directory");
    process.stdout.write(`verified ${verifyDirectory(manifest, values.directory)} downloaded assets\n`);
  } else if (mode === "verify-metadata") {
    for (const required of ["metadata", "commit", "tag", "notes"]) {
      if (!values[required]) fail(`verify-metadata requires --${required}`);
    }
    const metadata = JSON.parse(readFileSync(values.metadata, "utf8"));
    verifyMetadata(metadata, manifest, {
      commit: values.commit,
      tag: values.tag,
      notes: values.notes,
    });
    process.stdout.write("verified release metadata, exact target, notes, and asset inventory\n");
  } else {
    fail("mode must be create, list, verify, verify-metadata, or verify-nomination");
  }
}

export {
  createManifest,
  markdownForManifest,
  readManifest,
  requireNomination,
  verifyDirectory,
  verifyMetadata,
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
