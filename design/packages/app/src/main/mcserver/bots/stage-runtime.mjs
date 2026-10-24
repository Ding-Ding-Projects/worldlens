import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** Called by the root packaging entrypoint; missing requested Java outputs are fatal. */
export async function stageBotRuntimeAssets({ outputDirectory, bridgeDirectory }) {
    if (!outputDirectory) throw new Error("A bot runtime output directory is required.");
    const output = resolve(outputDirectory);
    const worker = join(root, "auth-worker.mjs");
    const workerBytes = await readFile(worker);
    let bridgeFiles = [];
    if (bridgeDirectory) {
        const receiptFile = join(bridgeDirectory, "baritone-build-receipt.json");
        const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
        if (
            receipt.schemaVersion !== 1 ||
            receipt.minecraftVersion !== "1.21.4" ||
            receipt.javaMajor !== 21 ||
            receipt.fabricLoader !== "0.16.9" ||
            receipt.bridgeVersion !== "1.0.0" ||
            receipt.baritoneVersion !== "1.13.1" ||
            receipt.baritoneSha256 !==
                "bfb79c3cdb8fe1f7697999b1f9c7f08ea29775f3b69d48ad90c387690ee67b05"
        )
            throw new Error("The staged client receipt does not match the reviewed profile.");
        bridgeFiles = [
            ["worldlens-baritone-client-1.0.0.jar", receipt.bridgeSha256],
            ["baritone-api-fabric-1.13.1.jar", receipt.baritoneSha256],
        ];
        for (const [name, expected] of bridgeFiles)
            if (digest(await readFile(join(bridgeDirectory, name))) !== expected)
                throw new Error("A staged client file does not match its build receipt.");
        bridgeFiles.push(["baritone-build-receipt.json", digest(await readFile(receiptFile))]);
    }
    await mkdir(output, { recursive: true });
    await copyFile(worker, join(output, "auth-worker.mjs"));
    if (digest(await readFile(join(output, "auth-worker.mjs"))) !== digest(workerBytes))
        throw new Error("The staged authentication worker differs from source.");
    for (const [name, expected] of bridgeFiles) {
        await copyFile(join(bridgeDirectory, name), join(output, name));
        if (digest(await readFile(join(output, name))) !== expected)
            throw new Error("A copied client file failed integrity verification.");
    }
    return {
        worker: "auth-worker.mjs",
        workerSha256: digest(workerBytes),
        baritoneStaged: bridgeFiles.length > 0,
    };
}
