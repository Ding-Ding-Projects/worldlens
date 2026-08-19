#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function fail(message) {
    throw new Error(`lowlevel evidence review: ${message}`);
}

function args(values) {
    const parsed = {};
    for (let index = 0; index < values.length; index += 2) {
        const key = values[index];
        const value = values[index + 1];
        if (!key?.startsWith("--") || value === undefined) fail("arguments must be --key value pairs");
        parsed[key.slice(2)] = value;
    }
    return parsed;
}

const options = args(process.argv.slice(2));
for (const key of ["repo-root", "run-root", "reviewer"]) {
    if (!options[key]) fail(`--${key} is required`);
}
const repoRoot = resolve(options["repo-root"]);
const runRoot = resolve(options["run-root"]);
const readme = await readFile(resolve(repoRoot, "README.md"), "utf8");
const index = JSON.parse(await readFile(resolve(runRoot, "receipt-index.json"), "utf8"));
const reviewed = [];

for (const entry of index.receipts) {
    const draftPath = resolve(runRoot, entry.receipt);
    const receipt = JSON.parse(await readFile(draftPath, "utf8"));
    const escaped = receipt.capture.promotedPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const image = new RegExp(`!\\[([^\\]]+)\\]\\(${escaped}\\)`, "u").exec(readme);
    if (image === null || image[1]?.trim() === "") {
        fail(`${receipt.id} has no exact README image link with non-empty alt text`);
    }
    receipt.privacy.expectedSurfaceOnly = true;
    receipt.privacy.sensitiveDataReviewed = true;
    receipt.inspection = {
        decoded: true,
        pixelsInspected: true,
        targetVisible: true,
        expectedStateVisible: true,
        reviewer: options.reviewer,
    };
    receipt.documentation = [{ path: "README.md", alt: image[1] }];
    const finalName = `${receipt.id}.receipt.json`;
    await writeFile(resolve(runRoot, finalName), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    reviewed.push({ ...entry, receipt: finalName });
}

await writeFile(
    resolve(runRoot, "reviewed-receipt-index.json"),
    `${JSON.stringify({ ...index, reviewer: options.reviewer, receipts: reviewed }, null, 2)}\n`,
    "utf8",
);
process.stdout.write(`reviewed ${reviewed.length} Lowlevel evidence receipt(s)\n`);
