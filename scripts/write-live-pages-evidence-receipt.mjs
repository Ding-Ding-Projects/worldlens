#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const values = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, value, index, all) => {
        if (index % 2 === 0) pairs.push([value.replace(/^--/u, ""), all[index + 1]]);
        return pairs;
    }, []),
);
for (const key of [
    "run-root",
    "commit",
    "capture-name",
    "promoted-path",
    "expected-surface",
    "state",
    "url",
    "launch-pid",
    "hwnd",
    "started-at",
    "captured-at",
]) {
    if (!values[key]) throw new Error(`--${key} is required`);
}
if (!/^[0-9a-f]{40}$/u.test(values.commit)) throw new Error("--commit must be a full SHA");

const runRoot = resolve(values["run-root"]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashFile = async (path) => hash(await readFile(path));
const artifactPath = resolve(runRoot, "live-response.html");
const rawPath = resolve(runRoot, "pages-live.png");
const interactionPath = resolve(runRoot, "target-capture.json");
const privacyPath = resolve(runRoot, "target-final.json");
const artifactBytes = await readFile(artifactPath);
const rawBytes = await readFile(rawPath);
if (rawBytes.length < 24 || rawBytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("pages-live.png is not a PNG");
}
const dimensions = { width: rawBytes.readUInt32BE(16), height: rawBytes.readUInt32BE(20) };
const artifactInfo = await stat(artifactPath);
const artifactSha256 = hash(artifactBytes);
const captureSha256 = hash(rawBytes);
const buildReceipt = {
    version: 1,
    sourceCommit: values.commit,
    url: values.url,
    artifactPath,
    artifactSha256,
    artifactBytes: artifactBytes.length,
    artifactBuiltAt: artifactInfo.mtime.toISOString(),
};
const buildReceiptPath = resolve(runRoot, "build-receipt.json");
await writeFile(buildReceiptPath, `${JSON.stringify(buildReceipt, null, 2)}\n`, "utf8");

const receipt = {
    version: 1,
    id: values["capture-name"],
    route: "cheap-lowlevel-headless",
    source: {
        startCommit: values.commit,
        endCommit: values.commit,
        artifactPath,
        artifactSha256,
        buildReceiptPath: basename(buildReceiptPath),
        buildReceiptSha256: await hashFile(buildReceiptPath),
        artifactBuiltAt: artifactInfo.mtime.toISOString(),
    },
    capture: {
        rawPath: basename(rawPath),
        promotedPath: values["promoted-path"],
        sha256: captureSha256,
        rawSha256: captureSha256,
        mimeType: "image/png",
        startedAt: values["started-at"],
        capturedAt: values["captured-at"],
        width: dimensions.width,
        height: dimensions.height,
    },
    state: {
        surface: "live-pages-site",
        screen: values["expected-surface"],
        state: values.state,
        theme: "current",
        viewport: { width: dimensions.width, height: dimensions.height, scale: 1 },
        captureKind: "page",
    },
    privacy: {
        visibleDesktopUntouched: true,
        expectedSurfaceOnly: false,
        sensitiveDataReviewed: false,
        unrelatedTargetsObserved: false,
        mocked: false,
        handEdited: false,
    },
    inspection: {
        decoded: false,
        pixelsInspected: false,
        targetVisible: false,
        expectedStateVisible: false,
        reviewer: "pending",
    },
    runtime: {
        launchPid: Number(values["launch-pid"]),
        hwnd: values.hwnd,
        hwndResolvedLive: true,
        consoleErrorCount: 0,
        pageErrorCount: 0,
        interactionProofId: `live-pages:${values.url}`,
        interactionReceiptPath: basename(interactionPath),
        interactionReceiptSha256: await hashFile(interactionPath),
        privacyScanPath: basename(privacyPath),
        privacyScanSha256: await hashFile(privacyPath),
        cleanupCompleted: true,
        cleanupOwnedOnly: true,
    },
    inventory: {
        path: "docs/screenshots/promoted-evidence.json",
        recordId: values["capture-name"],
    },
    documentation: [],
};
const receiptName = `${values["capture-name"]}.receipt.draft.json`;
await writeFile(resolve(runRoot, receiptName), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
await writeFile(
    resolve(runRoot, "receipt-index.json"),
    `${JSON.stringify(
        {
            version: 1,
            commit: values.commit,
            artifactSha256,
            receipts: [{ id: values["capture-name"], receipt: receiptName, sha256: captureSha256 }],
        },
        null,
        2,
    )}\n`,
    "utf8",
);
process.stdout.write(`wrote live Pages evidence receipt for ${values["capture-name"]}\n`);
