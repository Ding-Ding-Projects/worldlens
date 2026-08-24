#!/usr/bin/env node

/**
 * Validate the built-artifact UI smoke contract without launching the app.
 *
 * The matrix is intentionally hand-written. A discovery-only registry can silently
 * lose a route when a control disappears, so every required destination and every
 * click that opens a new dialog or window is named in docs/ui-smoke/smoke-matrix.json.
 * The real driver consumes this same file after integration and writes a separate
 * capture manifest. This command validates the contract and can validate a completed
 * manifest, but it never invents captures or treats a dry plan as runtime evidence.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = resolve(root, "docs/ui-smoke/smoke-matrix.json");
const manifestPath = resolve(root, "docs/ui-smoke/capture-manifest.json");

const REQUIRED_FIELDS = [
  "id",
  "screen",
  "state",
  "theme",
  "viewport",
  "scale",
  "precondition",
  "selector",
  "action",
  "expectedSurface",
  "opensNewSurface",
  "capture",
  "issueId",
];

const REQUIRED_ROUTE_IDS = [
  "server-list-host-profile",
  "host-profile-adopt-server",
  "server-detail-back-to-list",
  "new-server-flavour",
  "new-server-version-family",
  "new-server-version-exact",
  "new-server-runtime",
  "new-server-java-autoprovision",
  "new-server-resources",
  "new-server-world-browse",
  "new-server-review",
  "java-autoprovision-progress",
  "java-autoprovision-retry",
  "direct-world-folder-browse",
  "mounted-world-installation",
  "project-create",
  "project-open",
  "project-import-local",
  "project-import-ssh",
  "render-split-arrow",
  "render-local",
  "render-docker",
  "render-ssh",
  "render-github-actions",
  "pages-toggle-disabled",
  "pages-toggle-enable",
  "pages-toggle-published",
  "pages-toggle-failed-retry",
  "render-finished-select",
  "render-failed-select",
  "appearance-core",
  "appearance-creative-studio",
  "command-palette-inline-control",
  "settings-runtime",
  "settings-file-converter",
  "settings-ollama",
  "site-documentation-route",
];

const REQUIRED_NEW_SURFACE_ROWS = new Set([
  "server-list-host-profile",
  "host-profile-adopt-server",
  "server-detail-back-to-list",
  "new-server-flavour",
  "new-server-version-family",
  "new-server-version-exact",
  "new-server-runtime",
  "new-server-java-autoprovision",
  "new-server-resources",
  "new-server-world-browse",
  "new-server-review",
  "java-autoprovision-progress",
  "java-autoprovision-retry",
  "direct-world-folder-browse",
  "mounted-world-installation",
  "project-create",
  "project-open",
  "project-import-local",
  "project-import-ssh",
  "render-split-arrow",
  "render-local",
  "render-docker",
  "render-ssh",
  "render-github-actions",
  "pages-toggle-disabled",
  "pages-toggle-enable",
  "pages-toggle-published",
  "pages-toggle-failed-retry",
  "render-finished-select",
  "render-failed-select",
  "appearance-core",
  "appearance-creative-studio",
  "command-palette-inline-control",
  "settings-runtime",
  "settings-file-converter",
  "settings-ollama",
  "site-documentation-route",
]);

function normalise(value) {
  return value.replaceAll("\\", "/");
}

function loadJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function validateViewport(value, id) {
  assert(value && Number.isInteger(value.width) && value.width >= 320, `${id}: viewport.width must be an integer >= 320`);
  assert(Number.isInteger(value.height) && value.height >= 480, `${id}: viewport.height must be an integer >= 480`);
}

export function validateMatrix(matrix) {
  assert(matrix && matrix.schemaVersion === 1, "smoke matrix schemaVersion must be 1");
  assert(matrix.execution?.platform === "windows", "smoke matrix must declare Windows-only execution");
  assert(matrix.execution?.driver === "cheap-lowlevel-cdp", "smoke matrix must use the cheap Lowlevel CDP driver");
  assert(matrix.execution?.finalSmoke !== "ready", "final smoke must remain pending until integration is ready");
  assert(Array.isArray(matrix.rows) && matrix.rows.length >= REQUIRED_ROUTE_IDS.length, "smoke matrix must contain the full hand-written route list, required smoke routes are missing");

  const ids = matrix.rows.map((row) => row?.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert(duplicateIds.length === 0, `duplicate smoke matrix row ids: ${[...new Set(duplicateIds)].join(", ")}`);

  for (const id of REQUIRED_ROUTE_IDS) {
    assert(ids.includes(id), `required smoke route is missing: ${id}`);
  }

  for (const row of matrix.rows) {
    for (const field of REQUIRED_FIELDS) {
      assert(Object.prototype.hasOwnProperty.call(row, field), `${row.id ?? "unnamed row"}: missing ${field}`);
    }
    assert(typeof row.id === "string" && row.id.length > 0, "row id must be a non-empty string");
    assert(typeof row.screen === "string" && row.screen.length > 0, `${row.id}: screen must be non-empty`);
    assert(typeof row.state === "string" && row.state.length > 0, `${row.id}: state must be non-empty`);
    assert(["light", "dark", "both"].includes(row.theme), `${row.id}: theme must be light, dark, or both`);
    validateViewport(row.viewport, row.id);
    assert(Number.isFinite(row.scale) && row.scale >= 1, `${row.id}: scale must be >= 1`);
    assert(typeof row.precondition === "string" && row.precondition.length > 0, `${row.id}: precondition must be non-empty`);
    assert(typeof row.selector === "string" && row.selector.length > 0, `${row.id}: selector must be non-empty`);
    assert(typeof row.action === "string" && row.action.length > 0, `${row.id}: action must be non-empty`);
    assert(typeof row.expectedSurface === "object" && row.expectedSurface !== null, `${row.id}: expectedSurface must be an object`);
    assert(typeof row.expectedSurface.kind === "string" && row.expectedSurface.kind.length > 0, `${row.id}: expectedSurface.kind is required`);
    assert(typeof row.expectedSurface.title === "string" && row.expectedSurface.title.length > 0, `${row.id}: expectedSurface.title is required`);
    assert(Number.isInteger(row.expectedSurface.count) && row.expectedSurface.count >= 1, `${row.id}: expectedSurface.count must be >= 1`);
    assert(typeof row.opensNewSurface === "boolean", `${row.id}: opensNewSurface must be boolean`);
    assert(typeof row.capture === "object" && row.capture !== null, `${row.id}: capture must be an object`);
    assert(typeof row.capture.path === "string" && row.capture.path.length > 0, `${row.id}: capture.path is required`);
    assert(row.capture.path.startsWith("docs/screenshots/ui-smoke/"), `${row.id}: capture must remain under docs/screenshots/ui-smoke/`);
    assert(typeof row.capture.afterAction === "boolean" && row.capture.afterAction === row.opensNewSurface, `${row.id}: capture.afterAction must match opensNewSurface`);
    assert(row.issueId === null || (Number.isInteger(row.issueId) && row.issueId > 0), `${row.id}: issueId must be null or a positive integer`);
    if (row.opensNewSurface) {
      assert(REQUIRED_NEW_SURFACE_ROWS.has(row.id), `${row.id}: unlisted new-surface row must be added to REQUIRED_NEW_SURFACE_ROWS`);
      assert(row.capture.afterAction, `${row.id}: new surface requires an immediate after-action capture`);
      assert(row.expectedSurface.focusOwner, `${row.id}: expectedSurface.focusOwner is required`);
    }
    if (row.issueId !== null) {
      assert(typeof row.issueEvidence === "string" && row.issueEvidence.length > 0, `${row.id}: issueEvidence is required when issueId is set`);
    }
  }

  const requiredSet = new Set(REQUIRED_ROUTE_IDS);
  const extraRequired = [...requiredSet].filter((id) => !ids.includes(id));
  assert(extraRequired.length === 0, `required route set drifted: ${extraRequired.join(", ")}`);
  return { rowCount: matrix.rows.length, routeCount: REQUIRED_ROUTE_IDS.length };
}

export function validateCaptureManifest(matrix, manifest, { requireFiles = true } = {}) {
  assert(manifest && manifest.schemaVersion === 1, "capture manifest schemaVersion must be 1");
  assert(typeof manifest.commit === "string" && /^[0-9a-f]{40}$/u.test(manifest.commit), "capture manifest commit must be a full SHA");
  assert(manifest.driver === matrix.execution.driver, "capture manifest driver does not match smoke matrix");
  assert(Array.isArray(manifest.captures), "capture manifest captures must be an array");
  const byId = new Map();
  for (const capture of manifest.captures) {
    assert(typeof capture.rowId === "string" && capture.rowId.length > 0, "capture rowId is required");
    assert(!byId.has(capture.rowId), `duplicate capture rowId: ${capture.rowId}`);
    byId.set(capture.rowId, capture);
    const row = matrix.rows.find((candidate) => candidate.id === capture.rowId);
    assert(row, `capture refers to unknown matrix row: ${capture.rowId}`);
    assert(normalise(capture.path) === normalise(row.capture.path), `${capture.rowId}: capture path does not match matrix`);
    assert(typeof capture.action === "string" && capture.action.length > 0, `${capture.rowId}: captured action is required`);
    assert(typeof capture.windowIdentity === "object" && capture.windowIdentity !== null, `${capture.rowId}: windowIdentity is required`);
    assert(capture.windowIdentity.targetCount === 1, `${capture.rowId}: CDP targetCount must be exactly 1`);
    assert(capture.windowIdentity.targetType === "page", `${capture.rowId}: CDP targetType must be page`);
    assert(typeof capture.windowIdentity.title === "string" && capture.windowIdentity.title.length > 0, `${capture.rowId}: window title is required`);
    assert(typeof capture.windowIdentity.hwnd === "number" && capture.windowIdentity.hwnd > 0, `${capture.rowId}: dynamically resolved HWND is required`);
    assert(typeof capture.focusOwner === "string" && capture.focusOwner.length > 0, `${capture.rowId}: focus owner is required`);
    assert(typeof capture.capturedAt === "string" && !Number.isNaN(Date.parse(capture.capturedAt)), `${capture.rowId}: capturedAt must be ISO-8601`);
    if (requireFiles) {
      const absolute = resolve(root, capture.path);
      assert(existsSync(absolute), `${capture.rowId}: screenshot file is missing: ${capture.path}`);
      const hash = createHash("sha256").update(readFileSync(absolute)).digest("hex");
      assert(capture.sha256 === hash, `${capture.rowId}: screenshot hash mismatch`);
    }
  }
  for (const row of matrix.rows) {
    if (row.opensNewSurface) assert(byId.has(row.id), `${row.id}: every new surface needs a capture manifest entry`);
  }
  return { captureCount: manifest.captures.length };
}

export function duplicateCaptureComplaints(manifest) {
  const hashes = new Map();
  const complaints = [];
  for (const capture of manifest.captures ?? []) {
    if (typeof capture.sha256 !== "string") continue;
    const prior = hashes.get(capture.sha256);
    if (prior) complaints.push(`${capture.rowId}: duplicate image hash with ${prior}`);
    else hashes.set(capture.sha256, capture.rowId);
  }
  return complaints;
}

function main(argv) {
  const matrix = loadJson(matrixPath);
  const result = validateMatrix(matrix);
  if (argv.includes("--validate-manifest")) {
    const manifest = loadJson(manifestPath);
    const manifestResult = validateCaptureManifest(matrix, manifest, { requireFiles: !argv.includes("--plan-only") });
    const duplicate = duplicateCaptureComplaints(manifest);
    assert(duplicate.length === 0, `duplicate screenshot hashes:\n${duplicate.join("\n")}`);
    console.log(`ui-smoke-matrix: matrix ${result.rowCount} rows, ${manifestResult.captureCount} captures, manifest verified`);
    return;
  }
  const missing = matrix.rows.filter((row) => row.opensNewSurface).map((row) => row.capture.path).filter((path) => !existsSync(resolve(root, path)));
  console.log(`ui-smoke-matrix: ${result.rowCount} rows, ${result.routeCount} required routes, ${missing.length} capture files pending final built-app smoke`);
  if (!argv.includes("--plan-only") && missing.length > 0) {
    fail(`final capture manifest is not ready; missing ${missing.length} immediate after-action screenshots`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
