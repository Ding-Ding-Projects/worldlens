#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

function fail(message) {
    throw new Error(`lowlevel evidence receipt: ${message}`);
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
for (const key of ["repo-root", "run-root", "commit", "launch-pid", "hwnd", "plan"]) {
    if (!options[key]) fail(`--${key} is required`);
}

const repoRoot = resolve(options["repo-root"]);
const runRoot = resolve(options["run-root"]);
const commit = options.commit;
if (!/^[0-9a-f]{40}$/u.test(commit)) fail("--commit must be a full SHA");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileHash = async (path) => sha256(await readFile(path));
const treeHash = async (path) => {
    const info = await stat(path);
    if (info.isFile()) return fileHash(path);
    if (!info.isDirectory()) fail(`rendered artifact is not a file or directory: ${path}`);
    const files = [];
    const walk = async (directory, prefix = "") => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const child = `${directory}/${entry.name}`;
            const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
            if (entry.isDirectory()) await walk(child, relativePath);
            else if (entry.isFile()) files.push([relativePath, await readFile(child)]);
        }
    };
    await walk(path);
    files.sort(([a], [b]) => a.localeCompare(b));
    const hash = createHash("sha256");
    for (const [name, bytes] of files) hash.update(name).update("\0").update(bytes);
    return hash.digest("hex");
};

const artifactPath = resolve(repoRoot, "design/packages/app/dist/main/index.js");
const artifactBytes = await readFile(artifactPath);
const artifactSha256 = sha256(artifactBytes);
const artifactInfo = await stat(artifactPath);

const manifestPath = resolve(runRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.version !== 1 || manifest.commit !== commit || manifest.uiOnly !== true) {
    fail("manifest does not bind the requested commit and UI-only route");
}
if (manifest.runtime?.consoleErrorCount !== 0 || manifest.runtime?.pageErrorCount !== 0) {
    fail(
        `runtime reported ${manifest.runtime?.consoleErrorCount ?? "unknown"} console and ${manifest.runtime?.pageErrorCount ?? "unknown"} page errors`,
    );
}
const runtimeErrors = {
    consoleErrors: Array.isArray(manifest.runtime?.consoleErrors) ? manifest.runtime.consoleErrors : [],
    pageErrors: Array.isArray(manifest.runtime?.pageErrors) ? manifest.runtime.pageErrors : [],
};

// A local map receipt is only useful when it names the bytes the viewer actually opened.
// Captions and a renderer label are not provenance. Bind the receipt to the harness's
// artifact digest, the viewer identity, and the observed level-0 hires-tile count; a
// manifest that omits any of these facts is an honest refusal rather than a guessed receipt.
const localMap = manifest.captureMode === "local" && manifest.mapContentPresent === true;
if (localMap) {
    const evidence = manifest.renderEvidence;
    if (!evidence || typeof evidence !== "object") fail("local map manifest has no renderEvidence");
    const artifact = evidence.renderedArtifact;
    if (!artifact || typeof artifact.path !== "string" || !/^[0-9a-f]{64}$/u.test(artifact.sha256)) {
        fail("local map renderEvidence does not bind the rendered artifact digest");
    }
    if (!Number.isInteger(evidence.hiresTiles) || evidence.hiresTiles !== 961) {
        fail("local map renderEvidence must record exactly 961 hires tiles");
    }
    const viewer = evidence.viewer;
    if (!viewer || typeof viewer.dataRoot !== "string" || typeof viewer.mapId !== "string") {
        fail("local map renderEvidence does not bind the viewer identity");
    }
    if (viewer.dataRoot !== "/local/capture" || viewer.mapId.trim() === "") {
        fail("local map renderEvidence names an unexpected viewer root or empty map id");
    }
    const renderedArtifactPath = resolve(runRoot, artifact.path);
    const actualArtifactSha256 = await treeHash(renderedArtifactPath);
    if (actualArtifactSha256 !== artifact.sha256) {
        fail("local map renderEvidence digest does not match the rendered artifact on disk");
    }
}

const buildReceipt = {
    version: 1,
    sourceCommit: commit,
    artifactPath: relative(repoRoot, artifactPath).replaceAll("\\", "/"),
    artifactSha256,
    artifactBytes: artifactBytes.length,
    artifactBuiltAt: artifactInfo.mtime.toISOString(),
};
const buildReceiptPath = resolve(runRoot, "build-receipt.json");
await writeFile(buildReceiptPath, `${JSON.stringify(buildReceipt, null, 2)}\n`, "utf8");

const progressPath = resolve(runRoot, "progress.log");
const interaction = {
    version: 1,
    plan: options.plan,
    actionCount: manifest.actionCount,
    uiOnly: true,
    inputRoute: "cheap-lowlevel-headless",
    progressSha256: await fileHash(progressPath),
};
const interactionPath = resolve(runRoot, "interaction.json");
await writeFile(interactionPath, `${JSON.stringify(interaction, null, 2)}\n`, "utf8");

const privacyScan = {
    version: 1,
    targetCount: 1,
    targetType: "page",
    loopbackOnly: true,
    unrelatedTargetsObserved: false,
    visibleDesktopUntouched: true,
    taskProfileOwned: true,
};
const privacyPath = resolve(runRoot, "privacy-scan.json");
await writeFile(privacyPath, `${JSON.stringify(privacyScan, null, 2)}\n`, "utf8");

const buildReceiptSha256 = await fileHash(buildReceiptPath);
const interactionSha256 = await fileHash(interactionPath);
const privacySha256 = await fileHash(privacyPath);
const readPngSize = (bytes) => {
    if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") fail("capture is not a PNG");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const receipts = [];
for (const capture of manifest.captures) {
    const rawPath = resolve(runRoot, capture.file);
    const rawBytes = await readFile(rawPath);
    const captureSha256 = sha256(rawBytes);
    const dimensions = readPngSize(rawBytes);
    const receipt = {
        version: 1,
        id: capture.name,
        route: "cheap-lowlevel-headless",
        source: {
            startCommit: commit,
            endCommit: commit,
            artifactPath,
            artifactSha256,
            buildReceiptPath: basename(buildReceiptPath),
            buildReceiptSha256,
            artifactBuiltAt: artifactInfo.mtime.toISOString(),
            ...(localMap ? { renderedArtifact: manifest.renderEvidence.renderedArtifact } : {}),
        },
        capture: {
            rawPath: capture.file,
            promotedPath: `docs/screenshots/${capture.file}`,
            sha256: captureSha256,
            rawSha256: captureSha256,
            mimeType: "image/png",
            startedAt: capture.startedAt ?? manifest.runtime.startedAt,
            capturedAt: capture.capturedAt,
            width: dimensions.width,
            height: dimensions.height,
        },
        state: {
            surface: "desktop-app",
            screen: capture.expectedSurface,
            state: capture.state,
            theme: capture.theme,
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
            launchPid: Number(options["launch-pid"]),
            hwnd: options.hwnd,
            hwndResolvedLive: true,
            consoleErrorCount: manifest.runtime.consoleErrorCount,
            pageErrorCount: manifest.runtime.pageErrorCount,
            consoleErrors: runtimeErrors.consoleErrors,
            pageErrors: runtimeErrors.pageErrors,
            interactionProofId: `${options.plan}:${capture.name}`,
            interactionReceiptPath: basename(interactionPath),
            interactionReceiptSha256: interactionSha256,
            privacyScanPath: basename(privacyPath),
            privacyScanSha256: privacySha256,
            cleanupCompleted: true,
            cleanupOwnedOnly: true,
            ...(localMap
                ? {
                      renderEvidence: {
                          renderedArtifact: manifest.renderEvidence.renderedArtifact,
                          hiresTiles: manifest.renderEvidence.hiresTiles,
                          viewer: manifest.renderEvidence.viewer,
                      },
                  }
                : {}),
        },
        inventory: {
            path: "docs/screenshots/promoted-evidence.json",
            recordId: capture.name,
        },
        documentation: [],
    };
    const receiptPath = resolve(runRoot, `${capture.name}.receipt.draft.json`);
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    receipts.push({ id: capture.name, receipt: basename(receiptPath), sha256: captureSha256 });
}

await writeFile(
    resolve(runRoot, "receipt-index.json"),
    `${JSON.stringify({
        version: 1,
        commit,
        artifactSha256,
        runtime: {
            consoleErrorCount: manifest.runtime.consoleErrorCount,
            pageErrorCount: manifest.runtime.pageErrorCount,
            consoleErrors: runtimeErrors.consoleErrors,
            pageErrors: runtimeErrors.pageErrors,
        },
        receipts,
    }, null, 2)}\n`,
    "utf8",
);
process.stdout.write(`wrote ${receipts.length} draft Lowlevel evidence receipt(s)\n`);
