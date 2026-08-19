#!/usr/bin/env node

/**
 * Validate a recorded installed-client update report without claiming to have run the client.
 * The real Windows/Squirrel exercise is intentionally operator-driven; this command is the
 * evidence boundary that keeps an incomplete report from being promoted as verified.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const contractPath = new URL("./contract.json", import.meta.url);

function fail(message) {
    throw new Error(`update-e2e evidence: ${message}`);
}

function isFullSha(value) {
    return typeof value === "string" && /^[0-9a-f]{40}$/iu.test(value);
}

function isImmutableRelease(value) {
    return (
        value &&
        typeof value === "object" &&
        typeof value.tag === "string" &&
        isFullSha(value.sha) &&
        value.immutable === true
    );
}

const reportPath = process.argv[2];
if (!reportPath || process.argv.length !== 3) {
    fail("usage: node tools/update-e2e/verify.mjs <evidence-report.json>");
}

const contract = JSON.parse(await readFile(contractPath, "utf8"));
const report = JSON.parse(await readFile(resolve(reportPath), "utf8"));

if (report.schema !== contract.schema) fail(`unsupported report schema ${String(report.schema)}`);
if (!["unrun", "failed", "verified"].includes(report.status)) {
    fail("status must be unrun, failed, or verified");
}
if (!isFullSha(report.sourceCommit)) fail("sourceCommit must be a full commit SHA");
if (!isImmutableRelease(report.releaseN) || !isImmutableRelease(report.releaseNPlusOne)) {
    fail("both release records must be immutable and name full source SHAs");
}
if (report.releaseN.sha === report.releaseNPlusOne.sha) {
    fail("release N and release N+1 must have different source SHAs");
}
if (!report.evidence || typeof report.evidence !== "object") fail("evidence object is missing");

for (const id of contract.requiredEvidence) {
    if (!Object.prototype.hasOwnProperty.call(report.evidence, id)) {
        fail(`missing required evidence record: ${id}`);
    }
}

const receipt = report.evidence["receipt-reconciliation"];
if (!receipt || !contract.allowedReceiptOutcomes.includes(receipt.status)) {
    fail("receipt-reconciliation has an unknown outcome");
}
if (receipt.status === "installed") {
    if (receipt.fromVersion !== report.evidence["installed-version-before"]?.version) {
        fail("installed receipt does not name the installed version before restart");
    }
    if (receipt.targetVersion !== report.evidence["installed-version-after"]?.version) {
        fail("installed receipt does not name the installed version after restart");
    }
}

if (!Array.isArray(report.unverified)) fail("unverified must be an array, even when empty");
if (report.status === "verified" && report.unverified.length > 0) {
    fail("a verified report cannot contain unverified cases");
}

process.stdout.write(`${report.status}: ${contract.name} evidence is structurally complete\n`);
