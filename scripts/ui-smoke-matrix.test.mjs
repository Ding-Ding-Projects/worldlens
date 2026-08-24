import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { duplicateCaptureComplaints, validateCaptureManifest, validateMatrix } from "./ui-smoke-matrix.mjs";

const base = {
  schemaVersion: 1,
  execution: { platform: "windows", driver: "cheap-lowlevel-cdp", finalSmoke: "pending-integration" },
  rows: [
    {
      id: "server-list-host-profile", screen: "Server list", state: "empty", theme: "dark", viewport: { width: 1280, height: 800 }, scale: 1,
      precondition: "fresh profile", selector: "[data-testid=server-list-host-profile]", action: "click host profile", expectedSurface: { kind: "dialog", title: "Host profile", count: 1, focusOwner: "host-name" }, opensNewSurface: true,
      capture: { path: "docs/screenshots/ui-smoke/server-list-host-profile.png", afterAction: true }, issueId: null,
    },
  ],
};

test("matrix validates complete row shape", () => {
  const matrix = JSON.parse(readFileSync(new URL("../docs/ui-smoke/smoke-matrix.json", import.meta.url), "utf8"));
  const result = validateMatrix(matrix);
  assert.equal(result.rowCount, 117);
  assert.equal(result.routeCount, 117);
});

test("matrix fails closed when a required route is removed", () => {
  assert.throws(() => validateMatrix(base), /required smoke routes are missing/);
});

test("manifest fails closed when a new surface lacks a capture", () => {
  const matrix = structuredClone(base);
  for (const id of [
    "host-profile-adopt-server", "server-detail-back-to-list", "new-server-flavour", "new-server-version-family", "new-server-version-exact",
    "new-server-runtime", "new-server-java-autoprovision", "new-server-resources", "new-server-world-browse", "new-server-review",
    "java-autoprovision-progress", "java-autoprovision-retry", "direct-world-folder-browse", "mounted-world-installation", "project-create",
    "project-open", "project-import-local", "project-import-ssh", "render-split-arrow", "render-local", "render-docker", "render-ssh",
    "render-github-actions", "pages-toggle-disabled", "pages-toggle-enable", "pages-toggle-published", "pages-toggle-failed-retry",
    "render-finished-select", "render-failed-select", "appearance-core", "appearance-creative-studio", "command-palette-inline-control",
    "settings-runtime", "settings-file-converter", "settings-ollama", "site-documentation-route",
  ]) matrix.rows.push({ ...matrix.rows[0], id, capture: { ...matrix.rows[0].capture, path: `docs/screenshots/ui-smoke/${id}.png` } });
  assert.throws(() => validateCaptureManifest(matrix, { schemaVersion: 1, commit: "1".repeat(40), driver: "cheap-lowlevel-cdp", captures: [] }, { requireFiles: false }), /every new surface needs a primary capture/);
});

test("duplicate capture hashes fail closed", () => {
  assert.deepEqual(duplicateCaptureComplaints({ captures: [{ rowId: "a", sha256: "same" }, { rowId: "b", sha256: "same" }] }), ["b: duplicate image hash with a"]);
});
