import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createManifest,
  markdownForManifest,
  requireNomination,
  verifyDirectory,
  verifyDraftMetadata,
  verifyExistingNomination,
  verifyMetadata,
} from "./release-asset-manifest.mjs";

const COMMIT = "a".repeat(40);
const TAG = "v0.1.0-build.42";

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "worldlens-release-assets-"));
  const produced = resolve(root, "produced");
  const downloaded = resolve(root, "downloaded");
  mkdirSync(produced);
  mkdirSync(downloaded);
  const paths = [
    ["Worldlens-0.1.42-Setup.exe", "setup"],
    ["Worldlens-0.1.42-full.nupkg", "package"],
    ["RELEASES", "index"],
    ["worldlens-v0.1.0-build.42-extras.zip", "extras"],
    ["bluemap-server-plugins-5.7.zip", "jars"],
  ].map(([name, body]) => {
    const path = resolve(produced, name);
    writeFileSync(path, body);
    writeFileSync(resolve(downloaded, name), body);
    return path;
  });
  const manifest = createManifest(paths, { root });
  const notes = resolve(root, "release-notes.md");
  writeFileSync(
    notes,
    `Commit \`${COMMIT}\`\nChangelog commit: \`${COMMIT}\`\n` +
      "Worldlens for Windows is intentionally and permanently unsigned\n" +
      markdownForManifest(manifest) +
      "## Workflow timing\n- Workflow started: 2026-01-01T00:00:00Z\n" +
      "- Workflow completed: 2026-01-01T00:01:00Z\n- Workflow duration: 00:01:00\n",
  );
  const metadata = {
    isDraft: false,
    isPrerelease: false,
    tagName: TAG,
    targetCommitish: COMMIT,
    body: readFileSync(notes, "utf8"),
    assets: manifest.assets.map(({ name, size }) => ({ name, size })),
  };
  return { root, downloaded, manifest, notes, metadata };
}

test("manifest records unique non-empty assets and renders explicit size/hash rows", () => {
  const item = fixture();
  assert.equal(item.manifest.assets.length, 5);
  const markdown = markdownForManifest(item.manifest);
  assert.match(markdown, /Worldlens-0\.1\.42-Setup\.exe/);
  assert.match(markdown, /[0-9a-f]{64}/);
});

test("downloaded read-back must match every byte and no extra asset may appear", () => {
  const item = fixture();
  assert.equal(verifyDirectory(item.manifest, item.downloaded, { root: item.root }), 5);
  writeFileSync(resolve(item.downloaded, "Worldlens-0.1.42-Setup.exe"), "changed");
  assert.throws(
    () => verifyDirectory(item.manifest, item.downloaded, { root: item.root }),
    /size differs|SHA-256 differs/,
  );

  const extra = fixture();
  writeFileSync(resolve(extra.downloaded, "surprise.zip"), "unexpected");
  assert.throws(
    () => verifyDirectory(extra.manifest, extra.downloaded, { root: extra.root }),
    /asset set differs/,
  );
});

test("metadata requires exact immutable target, final notes, and the same asset inventory", () => {
  const item = fixture();
  verifyMetadata(item.metadata, item.manifest, {
    commit: COMMIT,
    tag: TAG,
    notes: item.notes,
  });
  assert.throws(
    () => requireNomination({ ...item.metadata, targetCommitish: "b".repeat(40) }, { commit: COMMIT, tag: TAG }),
    /target differs/,
  );
  assert.throws(
    () =>
      verifyMetadata(
        { ...item.metadata, body: "short notes" },
        item.manifest,
        { commit: COMMIT, tag: TAG, notes: item.notes },
      ),
    /notes differ/,
  );
  assert.throws(
    () =>
      verifyMetadata(
        { ...item.metadata, assets: item.metadata.assets.slice(1) },
        item.manifest,
        { commit: COMMIT, tag: TAG, notes: item.notes },
      ),
    /asset count differs/,
  );

  verifyDraftMetadata(
    { ...item.metadata, isDraft: true },
    item.manifest,
    { commit: COMMIT, tag: TAG },
  );
  assert.throws(
    () =>
      verifyDraftMetadata(
        { ...item.metadata, isDraft: true, assets: [] },
        item.manifest,
        { commit: COMMIT, tag: TAG },
      ),
    /asset count differs/,
  );
});

test("an existing nomination must carry complete notes and matching downloaded bytes", () => {
  const item = fixture();
  assert.equal(
    verifyExistingNomination(item.metadata, {
      commit: COMMIT,
      tag: TAG,
      directory: item.downloaded,
      root: item.root,
    }),
    5,
  );

  for (const metadata of [
    { ...item.metadata, body: "", assets: [] },
    { ...item.metadata, body: item.metadata.body, assets: [] },
    { ...item.metadata, body: item.metadata.body.replace("## Workflow timing", "## Missing") },
  ]) {
    assert.throws(
      () =>
        verifyExistingNomination(metadata, {
          commit: COMMIT,
          tag: TAG,
          directory: item.downloaded,
          root: item.root,
        }),
      /notes|asset/,
    );
  }
});

test("deliberately red duplicate basenames, empty files, and paths outside root fail", () => {
  const root = mkdtempSync(resolve(tmpdir(), "worldlens-release-red-"));
  const left = resolve(root, "a", "same.zip");
  const right = resolve(root, "b", "same.zip");
  mkdirSync(resolve(root, "a"));
  mkdirSync(resolve(root, "b"));
  writeFileSync(left, "left");
  writeFileSync(right, "right");
  assert.throws(() => createManifest([left, right], { root }), /duplicated/);
  writeFileSync(right, "");
  assert.throws(() => createManifest([right], { root }), /empty/);
  const outside = resolve(tmpdir(), "outside-release-asset.zip");
  writeFileSync(outside, "outside");
  assert.throws(() => createManifest([outside], { root }), /child/);
});

test("asset and download paths reject ancestor symbolic links or junctions", () => {
  const root = mkdtempSync(resolve(tmpdir(), "worldlens-release-link-root-"));
  const outside = mkdtempSync(resolve(tmpdir(), "worldlens-release-link-outside-"));
  const outsideAsset = resolve(outside, "outside.zip");
  writeFileSync(outsideAsset, "outside bytes");
  const link = resolve(root, "linked");
  symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");

  assert.throws(
    () => createManifest([resolve(link, "outside.zip")], { root }),
    /symbolic link or junction/,
  );
  const manifest = {
    schemaVersion: 1,
    assets: [
      {
        name: "outside.zip",
        path: "outside.zip",
        size: 13,
        sha256: "a".repeat(64),
      },
    ],
  };
  assert.throws(
    () => verifyDirectory(manifest, link, { root }),
    /symbolic link or junction/,
  );
});
