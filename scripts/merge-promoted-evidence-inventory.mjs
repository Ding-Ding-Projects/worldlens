#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const values = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, value, index, all) => {
        if (index % 2 === 0) pairs.push([value.replace(/^--/u, ""), all[index + 1]]);
        return pairs;
    }, []),
);
if (!values["repo-root"] || !values["run-root"]) throw new Error("--repo-root and --run-root are required");
const repoRoot = resolve(values["repo-root"]);
const runRoot = resolve(values["run-root"]);
const target = resolve(repoRoot, "docs/screenshots/promoted-evidence.json");
const index = JSON.parse(await readFile(resolve(runRoot, "reviewed-receipt-index.json"), "utf8"));
let inventory = { version: 1, records: [] };
try {
    inventory = JSON.parse(await readFile(target, "utf8"));
} catch {}
if (inventory.version !== 1 || !Array.isArray(inventory.records)) throw new Error("invalid promoted evidence inventory");
const ids = new Set(index.receipts.map((entry) => entry.id));
const retained = inventory.records.filter((record) => !ids.has(record.id));
const added = [];
for (const entry of index.receipts) {
    const receipt = JSON.parse(await readFile(resolve(runRoot, entry.receipt), "utf8"));
    added.push({
        id: receipt.id,
        active: true,
        path: receipt.capture.promotedPath,
        sourceCommit: receipt.source.startCommit,
        artifactSha256: receipt.source.artifactSha256,
        captureSha256: receipt.capture.sha256,
        screen: receipt.state.screen,
        state: receipt.state.state,
        theme: receipt.state.theme,
        viewportWidth: receipt.state.viewport.width,
        viewportHeight: receipt.state.viewport.height,
        scale: receipt.state.viewport.scale,
        interactionProofId: receipt.runtime.interactionProofId,
        interactionReceiptSha256: receipt.runtime.interactionReceiptSha256,
        inspectionStatus: "inspected",
    });
}
inventory.records = [...retained, ...added].sort((left, right) => left.id.localeCompare(right.id));
await writeFile(target, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
process.stdout.write(`merged ${added.length} promoted evidence record(s)\n`);
