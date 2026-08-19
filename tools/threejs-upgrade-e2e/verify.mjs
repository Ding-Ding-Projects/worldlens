#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const fail = (message) => {
    throw new Error(`three.js parity receipt: ${message}`);
};
const sha256 = /^[0-9a-f]{64}$/u;
const fullSha = /^[0-9a-f]{40}$/u;
const semver = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const hashFile = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

const [reportArgument] = process.argv.slice(2);
if (!reportArgument || reportArgument.startsWith("-")) fail("usage: node verify.mjs <evidence-report.json>");
const root = resolve(import.meta.dirname, "../..");
const contract = await readJson(resolve(root, "tools/threejs-upgrade-e2e/contract.json"));
const reportPath = resolve(reportArgument);
const report = await readJson(reportPath);

if (report.schema !== contract.schema) fail(`report schema must be ${contract.schema}`);
if (!contract.allowedStatuses.includes(report.status)) fail(`unknown report status ${JSON.stringify(report.status)}`);
if (!fullSha.test(report.sourceCommit ?? "")) fail("sourceCommit must be a full 40-character SHA");
if (report.currentVersion !== contract.currentVersion) fail("currentVersion does not match the contract");
if (report.targetVersion !== contract.targetVersion || !semver.test(report.targetVersion ?? "")) {
    fail("targetVersion does not match the contract or is not a semantic version");
}
if (!report.artifact || typeof report.artifact.path !== "string" || !sha256.test(report.artifact.sha256 ?? "")) {
    fail("artifact must include a path and SHA-256 digest");
}
if (!report.evidence || typeof report.evidence !== "object" || Array.isArray(report.evidence)) {
    fail("evidence must be an object");
}

const missing = contract.requiredEvidence.filter((id) => !(id in report.evidence));
if (report.status === "verified" && missing.length > 0) fail(`verified report is missing: ${missing.join(", ")}`);
if (report.status === "unrun") {
    if (Object.keys(report.evidence).length > 0) fail("unrun report must not contain evidence claims");
    process.stdout.write("three.js parity receipt is unrun; no verification claim made\n");
    process.exit(0);
}

const evidenceBase = (id, entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail(`${id} must be an object`);
    if (entry.sourceCommit !== report.sourceCommit) fail(`${id} is bound to a different sourceCommit`);
    if (typeof entry.artifactPath !== "string" || entry.artifactPath !== report.artifact.path) {
        fail(`${id} must name the report artifact path`);
    }
    if (entry.artifactSha256 !== report.artifact.sha256) fail(`${id} is bound to a different artifact digest`);
    if (!contract.visualStates.includes(entry.state) && id.startsWith("visual-parity-")) {
        fail(`${id} has an unknown visual state`);
    }
};

for (const id of contract.requiredEvidence) evidenceBase(id, report.evidence[id]);
for (const id of contract.requiredEvidence.filter((value) => value.startsWith("visual-parity-"))) {
    const entry = report.evidence[id];
    for (const key of ["baselinePath", "candidatePath"]) {
        if (typeof entry[key] !== "string" || entry[key].trim() === "") fail(`${id} is missing ${key}`);
        await access(resolve(root, entry[key])).catch(() => fail(`${id} ${key} is not readable`));
    }
    if (!sha256.test(entry.baselineSha256 ?? "") || !sha256.test(entry.candidateSha256 ?? "")) {
        fail(`${id} must include both image SHA-256 digests`);
    }
    if (!Number.isInteger(entry.width) || !Number.isInteger(entry.height) || entry.width < 1 || entry.height < 1) {
        fail(`${id} must include positive image dimensions`);
    }
    if (await hashFile(resolve(root, entry.baselinePath)) !== entry.baselineSha256) fail(`${id} baseline digest mismatch`);
    if (await hashFile(resolve(root, entry.candidatePath)) !== entry.candidateSha256) fail(`${id} candidate digest mismatch`);
}

for (const id of contract.requiredEvidence.filter((value) => value.startsWith("interaction-"))) {
    const entry = report.evidence[id];
    if (entry.inputRoute !== "cheap-lowlevel-headless") fail(`${id} must use the cheap Lowlevel headless route`);
    if (!Array.isArray(entry.actions) || entry.actions.length === 0) fail(`${id} has no recorded actions`);
    if (entry.outcome !== "verified") fail(`${id} does not have a verified outcome`);
}

for (const id of ["performance-before", "performance-after"]) {
    const entry = report.evidence[id];
    for (const key of ["startupMs", "p95FrameTimeMs", "peakMemoryMb", "gpuResourceLeakCount"]) {
        if (typeof entry[key] !== "number" || !Number.isFinite(entry[key]) || entry[key] < 0) fail(`${id}.${key} is invalid`);
    }
    if (entry.startupMs > contract.performanceBudgets.startupMs || entry.p95FrameTimeMs > contract.performanceBudgets.p95FrameTimeMs || entry.peakMemoryMb > contract.performanceBudgets.peakMemoryMb || entry.gpuResourceLeakCount > contract.performanceBudgets.gpuResourceLeakCount) {
        fail(`${id} exceeds a performance budget`);
    }
}

if (report.evidence["resource-disposal"].gpuResourceLeakCount !== 0) fail("resource-disposal reports a GPU resource leak");
for (const id of ["context-loss-recovery", "unsupported-gpu-message", "blank-canvas-negative"]) {
    if (report.evidence[id].outcome !== "verified") fail(`${id} does not have a verified lifecycle outcome`);
}
if (report.evidence["packaged-viewer"].packaged !== true) fail("packaged-viewer is not bound to a packaged artifact");

process.stdout.write(`verified three.js parity receipt for ${report.sourceCommit}\n`);
