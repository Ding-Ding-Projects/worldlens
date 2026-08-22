import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installServerJar, jarAlreadyInstalled, type FetchBinary, type HttpBinaryResponse } from "./install.js";

const JAR_BYTES = Buffer.from("pretend-this-is-a-server-jar-full-of-bytecode");
const JAR_SHA256 = createHash("sha256").update(JAR_BYTES).digest("hex");

async function* asBody(bytes: Buffer, chunkSize = 8): AsyncIterable<Uint8Array> {
    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        yield bytes.subarray(offset, offset + chunkSize);
    }
}

function okResponse(bytes: Buffer): HttpBinaryResponse {
    return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === "content-length" ? String(bytes.byteLength) : null) },
        body: asBody(bytes),
    };
}

describe("installServerJar", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "mcserver-install-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("downloads real bytes to disk and verifies the digest", async () => {
        const target = join(dir, "server.jar");
        const progressEvents: { received: number; total: number | null }[] = [];
        const fetchBinary: FetchBinary = async () => okResponse(JAR_BYTES);

        const result = await installServerJar({
            url: "https://example.test/server.jar",
            targetPath: target,
            sha256: JAR_SHA256,
            fetchBinary,
            onProgress: (progress) => progressEvents.push(progress),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.bytes).toBe(JAR_BYTES.byteLength);
        expect(result.value.sha256).toBe(JAR_SHA256);

        const onDisk = await readFile(target);
        expect(onDisk.equals(JAR_BYTES)).toBe(true);
        expect(progressEvents.length).toBeGreaterThan(0);
        expect(progressEvents[progressEvents.length - 1]?.received).toBe(JAR_BYTES.byteLength);
    });

    it("succeeds without a digest to check when the upstream API published none", async () => {
        const target = join(dir, "server.jar");
        const result = await installServerJar({
            url: "https://example.test/server.jar",
            targetPath: target,
            sha256: null,
            fetchBinary: async () => okResponse(JAR_BYTES),
        });
        expect(result.ok).toBe(true);
        await expect(stat(target)).resolves.toBeDefined();
    });

    it("refuses and writes nothing on a checksum mismatch", async () => {
        const target = join(dir, "server.jar");
        const result = await installServerJar({
            url: "https://example.test/server.jar",
            targetPath: target,
            sha256: "0".repeat(64),
            fetchBinary: async () => okResponse(JAR_BYTES),
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("command-failed");
        await expect(stat(target)).rejects.toThrow();
    });

    it("reports an HTTP failure without writing anything", async () => {
        const target = join(dir, "server.jar");
        const result = await installServerJar({
            url: "https://example.test/server.jar",
            targetPath: target,
            sha256: JAR_SHA256,
            fetchBinary: async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                headers: { get: () => null },
                body: null,
            }),
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("command-failed");
        await expect(stat(target)).rejects.toThrow();
    });

    it("reports a network failure as unreachable, never throwing", async () => {
        const target = join(dir, "server.jar");
        const result = await installServerJar({
            url: "https://example.test/server.jar",
            targetPath: target,
            sha256: JAR_SHA256,
            fetchBinary: async () => {
                throw new Error("DNS resolution failed");
            },
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("unreachable");
    });
});

describe("jarAlreadyInstalled", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "mcserver-install-check-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("is false when nothing is there", async () => {
        expect(await jarAlreadyInstalled(join(dir, "missing.jar"), null)).toBe(false);
    });

    it("is true when the file exists and the size matches", async () => {
        const target = join(dir, "server.jar");
        await installServerJar({
            url: "https://example.test/server.jar",
            targetPath: target,
            sha256: null,
            fetchBinary: async () => okResponse(JAR_BYTES),
        });
        expect(await jarAlreadyInstalled(target, JAR_BYTES.byteLength)).toBe(true);
        expect(await jarAlreadyInstalled(target, 1)).toBe(false);
    });
});
