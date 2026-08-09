#!/usr/bin/env node
/** Create and verify the exact asset contract for a Worldlens release. */

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/;
// The GitHub release tag is the exact packaged/app/feed SemVer with one leading `v`.
// Keeping a second `-build.<run>` sequence here would make update.electronjs.org compare
// a prerelease tag with a different installed package version and incorrectly return 204.
const SAFE_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
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
  let current = absoluteRoot;
  for (const component of fromRoot.split(/[\\/]+/)) {
    current = resolve(current, component);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      fail(`${label} crosses a symbolic link or junction at ${current}`);
    }
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

function verifyDirectory(manifest, directory, { root = process.cwd() } = {}) {
  const { absolutePath } = requireChild(root, directory, "download directory");
  const actualNames = readdirSync(absolutePath, { withFileTypes: true })
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
    const path = resolve(absolutePath, record.name);
    if (statSync(path).size !== record.size) fail(`downloaded size differs for ${record.name}`);
    if (digest(path) !== record.sha256) fail(`downloaded SHA-256 differs for ${record.name}`);
  }
  return expectedNames.length;
}

function requireReleaseIdentity(metadata, { commit, tag, draft }) {
  if (!COMMIT.test(commit)) fail("expected commit is not a full SHA");
  if (!SAFE_TAG.test(tag)) fail("expected tag is outside the release schema");
  if (metadata?.isDraft !== draft || metadata?.isPrerelease !== false) {
    fail(draft ? "release is not the expected draft" : "release is draft or prerelease");
  }
  if (metadata.tagName !== tag) fail("release tag differs from the nomination");
  if (metadata.targetCommitish !== commit) fail("release target differs from the nominated commit");
}

function requireNomination(metadata, { commit, tag }) {
  requireReleaseIdentity(metadata, { commit, tag, draft: false });
}

function verifyMetadataAssets(metadata, manifest) {
  if (!Array.isArray(metadata?.assets)) fail("published release has no asset inventory");
  const metadataAssets = new Map();
  for (const asset of metadata.assets) {
    if (!asset || typeof asset !== "object" || !SAFE_NAME.test(asset.name)) {
      fail("published release contains an unsafe asset record");
    }
    if (!Number.isSafeInteger(asset.size) || asset.size < 1) {
      fail(`published asset is empty or has an invalid size: ${asset.name}`);
    }
    if (metadataAssets.has(asset.name)) fail(`published release repeats ${asset.name}`);
    metadataAssets.set(asset.name, asset);
  }
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

function requireNoteMarkers(notes, commit) {
  if (typeof notes !== "string" || notes.length < 1 || notes.length > MAX_MANIFEST_BYTES) {
    fail("release notes are empty or outside the supported boundary");
  }
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
    if (!notes.includes(marker)) fail(`release notes are missing ${marker}`);
  }
}

function manifestFromReleaseNotes(notes) {
  const normalized = notes.replaceAll("\r\n", "\n");
  const heading = "## Release asset SHA-256";
  const start = normalized.indexOf(heading);
  if (start < 0 || normalized.indexOf(heading, start + heading.length) >= 0) {
    fail("release notes must contain exactly one asset SHA-256 section");
  }
  const afterHeading = start + heading.length;
  const nextHeading = normalized.indexOf("\n## ", afterHeading);
  const section = normalized.slice(
    afterHeading,
    nextHeading < 0 ? normalized.length : nextHeading,
  );
  const assets = [];
  const names = new Set();
  for (const line of section.split("\n")) {
    const match = /^\| `([A-Za-z0-9][A-Za-z0-9._-]{0,239})` \| ([1-9]\d*) \| `([0-9a-f]{64})` \|$/.exec(
      line,
    );
    if (!match) continue;
    const size = Number(match[2]);
    const record = requireRecord({
      name: match[1],
      path: match[1],
      size,
      sha256: match[3],
    });
    if (names.has(record.name)) fail(`release notes repeat ${record.name}`);
    names.add(record.name);
    assets.push(record);
  }
  if (assets.length < 1) fail("release notes contain no asset SHA-256 rows");
  assets.sort((left, right) => left.name.localeCompare(right.name));
  return { schemaVersion: 1, assets };
}

function verifyDraftMetadata(metadata, manifest, { commit, tag }) {
  requireReleaseIdentity(metadata, { commit, tag, draft: true });
  verifyMetadataAssets(metadata, manifest);
}

function verifyExistingNomination(metadata, { commit, tag, directory, root }) {
  requireNomination(metadata, { commit, tag });
  requireNoteMarkers(metadata.body, commit);
  const manifest = manifestFromReleaseNotes(metadata.body);
  verifyMetadataAssets(metadata, manifest);
  verifyDirectory(manifest, directory, { root });
  return manifest.assets.length;
}

function verifyMetadata(metadata, manifest, { commit, tag, notes }) {
  requireNomination(metadata, { commit, tag });
  const expectedNotes = readFileSync(notes, "utf8");
  if (metadata.body !== expectedNotes) fail("published release notes differ from the verified file");
  requireNoteMarkers(expectedNotes, commit);
  verifyMetadataAssets(metadata, manifest);
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
    for (const required of ["metadata", "commit", "tag", "directory"]) {
      if (!values[required]) fail(`verify-nomination requires --${required}`);
    }
    const count = verifyExistingNomination(
      JSON.parse(readFileSync(values.metadata, "utf8")),
      {
        commit: values.commit,
        tag: values.tag,
        directory: values.directory,
      },
    );
    process.stdout.write(
      `verified the existing nominated release target, notes, and ${count} downloaded assets\n`,
    );
    return;
  }
  if (!values.manifest) fail(`${mode} requires --manifest`);
  const manifest = readManifest(values.manifest);
  if (mode === "list") {
    process.stdout.write(manifest.assets.map((asset) => asset.path).join("\n") + "\n");
  } else if (mode === "verify") {
    if (!values.directory) fail("verify requires --directory");
    process.stdout.write(`verified ${verifyDirectory(manifest, values.directory)} downloaded assets\n`);
  } else if (mode === "verify-draft") {
    for (const required of ["metadata", "commit", "tag"]) {
      if (!values[required]) fail(`verify-draft requires --${required}`);
    }
    verifyDraftMetadata(JSON.parse(readFileSync(values.metadata, "utf8")), manifest, {
      commit: values.commit,
      tag: values.tag,
    });
    process.stdout.write("verified the draft target and exact asset inventory\n");
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
    fail("mode must be create, list, verify, verify-draft, verify-metadata, or verify-nomination");
  }
}

export {
  createManifest,
  markdownForManifest,
  manifestFromReleaseNotes,
  readManifest,
  requireNomination,
  verifyDirectory,
  verifyDraftMetadata,
  verifyExistingNomination,
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
