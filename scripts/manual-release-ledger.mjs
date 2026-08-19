#!/usr/bin/env node
/**
 * Validate the one-manual-release-per-phase evidence ledger.
 *
 * This is deliberately a data model, not a GitHub API client. A caller reads
 * release metadata with `gh`, records the exact response here, and this module
 * refuses to treat local build success as a cloud release verdict.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SHA = /^[0-9a-f]{40}$/;
// Keep the historical build tags in the ledger while accepting the current
// SemVer release shape. New releases should use the latter; old evidence is
// not rewritten merely to make the validator forget what actually shipped.
const TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-build\.(0|[1-9][0-9]*))?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DURATION = /^\d{2}:\d{2}:\d{2}$/;
const STATES = new Set(["running", "failed", "verified"]);
const EVIDENCE_KINDS = new Set(["manual", "workflow"]);
const MAX_BYTES = 1024 * 1024;
const MAX_INVENTORY_BYTES = 64 * 1024;
const MAX_INVENTORY_PHASES = 256;
const DEFAULT_INVENTORY_PATH = fileURLToPath(new URL("../docs/release-phase-inventory.json", import.meta.url));

function fail(message) {
  throw new Error(`manual release ledger failed: ${message}`);
}

function string(value, label, { pattern, max = 512, required = true } = {}) {
  if (value === undefined && !required) return;
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    fail(`${label} must be a non-empty string of at most ${max} characters`);
  }
  if (pattern && !pattern.test(value)) fail(`${label} has an invalid format`);
}

function bool(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
}

function integer(value, label, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) fail(`${label} must be an integer >= ${min}`);
}

function validateTiming(timing, label) {
  if (!timing || typeof timing !== "object" || Array.isArray(timing)) fail(`${label} must be an object`);
  for (const key of ["started", "completed"]) string(timing[key], `${label}.${key}`, { pattern: ISO });
  string(timing.duration, `${label}.duration`, { pattern: DURATION });
  const started = Date.parse(timing.started);
  const completed = Date.parse(timing.completed);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    fail(`${label} completion must not precede start`);
  }
}

function validateAsset(asset, index) {
  const label = `phase.assets[${index}]`;
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) fail(`${label} must be an object`);
  string(asset.name, `${label}.name`, { max: 240 });
  integer(asset.size, `${label}.size`, { min: 1 });
  string(asset.sha256, `${label}.sha256`, { pattern: SHA256, max: 64 });
  string(asset.kind, `${label}.kind`, { max: 80, required: false });
  return asset.name;
}

function validateEvidence(evidence, phase) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) fail(`phase ${phase} evidence must be an object`);
  if (!EVIDENCE_KINDS.has(evidence.kind)) fail(`phase ${phase} evidence.kind is not manual or workflow`);
  string(evidence.source, `phase ${phase} evidence.source`, { max: 200 });
  string(evidence.buildCommand, `phase ${phase} evidence.buildCommand`, { max: 500 });
  string(evidence.workflowRun, `phase ${phase} evidence.workflowRun`, { max: 300, required: false });
  string(evidence.workflowUrl, `phase ${phase} evidence.workflowUrl`, { max: 500, required: false });
  string(evidence.manualReceipt, `phase ${phase} evidence.manualReceipt`, { max: 500, required: false });
  if (evidence.kind === "workflow" && !evidence.workflowRun) fail(`phase ${phase} workflow evidence needs workflowRun`);
  if (evidence.kind === "manual" && !evidence.manualReceipt) fail(`phase ${phase} manual evidence needs manualReceipt`);
  bool(evidence.localBuildPassed, `phase ${phase} evidence.localBuildPassed`);
  bool(evidence.cloudVerdictVerified, `phase ${phase} evidence.cloudVerdictVerified`);
  if (evidence.localBuildPassed && !evidence.cloudVerdictVerified && phase.verificationState === "verified") {
    fail(`phase ${phase.phase} cannot be verified from local build evidence alone`);
  }
}

function validateCodeName(codeName, phase) {
  if (!codeName) return;
  if (typeof codeName !== "object" || Array.isArray(codeName)) fail(`phase ${phase} codeName must be an object`);
  string(codeName.en, `phase ${phase} codeName.en`, { max: 235 });
  string(codeName.zhHant, `phase ${phase} codeName.zhHant`, { max: 120 });
  string(codeName.photoUrl, `phase ${phase} codeName.photoUrl`, { max: 500 });
  if (!codeName.photoUrl.startsWith("https://")) fail(`phase ${phase} codeName.photoUrl must be HTTPS`);
  string(codeName.catalogUrl, `phase ${phase} codeName.catalogUrl`, { max: 500 });
}

function validatePhase(phase, index) {
  const label = `phase[${index}]`;
  if (!phase || typeof phase !== "object" || Array.isArray(phase)) fail(`${label} must be an object`);
  string(phase.phase, `${label}.phase`, { max: 160 });
  string(phase.integrationCommit, `${label}.integrationCommit`, { pattern: SHA, max: 40 });
  string(phase.releaseTag, `${label}.releaseTag`, { pattern: TAG, max: 64, required: false });
  string(phase.releaseId, `${label}.releaseId`, { max: 120, required: false });
  if (!["none", "shipped-nonconforming", "verified"].includes(phase.releaseDisposition)) {
    fail(`${label}.releaseDisposition is not none, shipped-nonconforming, or verified`);
  }
  if (!STATES.has(phase.verificationState)) fail(`${label}.verificationState is not running, failed, or verified`);
  string(phase.verificationNote, `${label}.verificationNote`, { max: 2000 });
  validateTiming(phase.timing, label);
  validateEvidence(phase.evidence, phase);
  validateCodeName(phase.codeName, phase.phase);
  if (!Array.isArray(phase.assets)) fail(`${label}.assets must be an array`);
  const names = new Set(phase.assets.map(validateAsset));
  if (names.size !== phase.assets.length) fail(`${label}.assets repeats an asset`);
  if (phase.verificationState === "verified") {
    if (!phase.releaseTag || !phase.releaseId) fail(`${label} verified state needs one published release identity`);
    if (phase.assets.length < 1) fail(`${label} verified state needs release assets`);
    if (!phase.lineCount || typeof phase.lineCount !== "object") fail(`${label} verified state needs lineCount evidence`);
    for (const key of ["source", "tests", "stylesMarkup", "total", "nonBlank"]) integer(phase.lineCount[key], `${label}.lineCount.${key}`, { min: 0 });
    string(phase.lineCount.command, `${label}.lineCount.command`, { max: 300 });
    string(phase.lineCount.attribution, `${label}.lineCount.attribution`, { max: 500 });
    if (!Array.isArray(phase.exclusions) || phase.exclusions.length < 1) fail(`${label} verified state needs explicit exclusions`);
  } else if (phase.releaseDisposition === "shipped-nonconforming") {
    if (!phase.releaseTag || !phase.releaseId) fail(`${label} shipped-nonconforming record needs the published release identity`);
    if (phase.verificationState !== "failed") fail(`${label} shipped-nonconforming record must be failed`);
  } else if (phase.releaseTag || phase.releaseId) {
    fail(`${label} record without a release disposition cannot claim a release identity`);
  }
  return phase.phase;
}

function validatePhaseInventory(inventory) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) fail("phase inventory must be an object");
  if (inventory.schemaVersion !== 1) fail("phase inventory schemaVersion must be 1");
  if (!Array.isArray(inventory.phases) || inventory.phases.length < 1 || inventory.phases.length > MAX_INVENTORY_PHASES) {
    fail(`phase inventory phases must contain 1-${MAX_INVENTORY_PHASES} entries`);
  }
  const names = new Set();
  inventory.phases.forEach((name, index) => {
    string(name, `phase inventory phases[${index}]`, { max: 160 });
    if (names.has(name)) fail(`phase inventory repeats ${name}`);
    names.add(name);
  });
  return inventory.phases;
}

function readPhaseInventory(path = DEFAULT_INVENTORY_PATH) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    fail(`phase inventory cannot be read at ${path}`);
  }
  if (Buffer.byteLength(text, "utf8") > MAX_INVENTORY_BYTES) fail("phase inventory exceeds the supported size");
  let inventory;
  try { inventory = JSON.parse(text); } catch { fail("phase inventory is not valid JSON"); }
  return validatePhaseInventory(inventory);
}

function validateLedgerStructure(ledger) {
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) fail("ledger must be an object");
  if (ledger.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (!Array.isArray(ledger.phases)) fail("phases must be an array");
  const phases = new Set();
  const tags = new Set();
  const commits = new Set();
  for (let index = 0; index < ledger.phases.length; index += 1) {
    const phase = ledger.phases[index];
    const name = validatePhase(phase, index);
    if (phases.has(name)) fail(`phase ${name} is recorded more than once`);
    phases.add(name);
    if (phase.releaseTag && tags.has(phase.releaseTag)) fail(`release ${phase.releaseTag} is recorded more than once`);
    if (phase.releaseTag) tags.add(phase.releaseTag);
    if (commits.has(phase.integrationCommit)) fail(`integration commit ${phase.integrationCommit} is recorded more than once`);
    commits.add(phase.integrationCommit);
  }
  return { phaseCount: phases.size, releaseCount: tags.size, phases };
}

function validateLedger(ledger, options = {}) {
  if (!Object.hasOwn(options, "integratedPhases")) fail("integratedPhases is required; use validateLedgerStructure for structural-only validation");
  const { integratedPhases } = options;
  const result = validateLedgerStructure(ledger);
  if (!Array.isArray(integratedPhases)) fail("integratedPhases must be an array");
  validatePhaseInventory({ schemaVersion: 1, phases: integratedPhases });
  const missing = integratedPhases.filter((name) => !result.phases.has(name));
  if (missing.length) fail(`integrated phases missing from ledger: ${missing.join(", ")}`);
  return { phaseCount: result.phaseCount, releaseCount: result.releaseCount, missing };
}

/** Build a record from the exact JSON returned by `gh api repos/.../releases/...`. */
function recordReleaseEvidence({ phase, integrationCommit, metadata, evidence, timing, lineCount, exclusions, codeName, verificationState = "verified", verificationNote }) {
  if (!metadata || typeof metadata !== "object") fail("release metadata must be an object");
  const release = {
    phase,
    integrationCommit,
    releaseTag: metadata.tag_name ?? metadata.tagName,
    releaseId: String(metadata.id ?? ""),
    releaseDisposition: verificationState === "verified" ? "verified" : "shipped-nonconforming",
    verificationState,
    verificationNote,
    timing,
    evidence,
    codeName,
    assets: (metadata.assets ?? []).map((asset) => ({ name: asset.name, size: asset.size, sha256: asset.sha256, kind: asset.kind })),
    lineCount,
    exclusions,
  };
  if (metadata.draft === true || metadata.isDraft === true) fail("draft releases cannot enter the phase ledger");
  if (metadata.prerelease === true || metadata.isPrerelease === true) fail("prereleases cannot enter the phase ledger");
  if (metadata.target_commitish && metadata.target_commitish !== integrationCommit) fail("release target does not equal integration commit");
  return release;
}

function readLedger(path, { inventoryPath = DEFAULT_INVENTORY_PATH } = {}) {
  const text = readFileSync(path, "utf8");
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) fail("ledger exceeds the supported size");
  let ledger;
  try { ledger = JSON.parse(text); } catch { fail("ledger is not valid JSON"); }
  validateLedger(ledger, { integratedPhases: readPhaseInventory(inventoryPath) });
  return ledger;
}

function writeLedger(path, ledger, { inventoryPath = DEFAULT_INVENTORY_PATH } = {}) {
  validateLedger(ledger, { integratedPhases: readPhaseInventory(inventoryPath) });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function main() {
  const [, , command, path] = process.argv;
  if (command === "verify") {
    if (!path) fail("verify requires a ledger path");
    const result = validateLedgerStructure(readLedger(path));
    process.stdout.write(`verified ${result.phaseCount} phases and ${result.releaseCount} unique releases\n`);
    return;
  }
  fail("command must be verify");
}

export { readLedger, readPhaseInventory, recordReleaseEvidence, validateLedger, validateLedgerStructure, validatePhase, validatePhaseInventory, writeLedger };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
