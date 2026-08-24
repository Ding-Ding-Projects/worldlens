import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCliJar } from "../java/jars.js";
import {
    ensureManagedUpstreamJava,
    managedUpstreamJavaJar,
    packagedUpstreamJavaIsUsable,
    type EngineRelease,
} from "./engineProvisioning.js";

function zipFixture(): Buffer {
    const names = ["META-INF/MANIFEST.MF", "com/bluemap/BlueMap.class"];
    const records: { name: Buffer; offset: number; length: number }[] = [];
    const chunks: Buffer[] = [];
    let offset = 0;
    for (const name of names) {
        const data = Buffer.from(name === names[0] ? "Manifest-Version: 1.0\n" : "class bytes\n");
        const nameBytes = Buffer.from(name);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0, 6);
        header.writeUInt16LE(0, 8);
        header.writeUInt16LE(0, 10);
        header.writeUInt16LE(0, 12);
        header.writeUInt32LE(0, 14);
        header.writeUInt32LE(data.length, 18);
        header.writeUInt32LE(data.length, 22);
        header.writeUInt16LE(nameBytes.length, 26);
        header.writeUInt16LE(0, 28);
        chunks.push(header, nameBytes, data);
        records.push({ name: nameBytes, offset, length: data.length });
        offset += header.length + nameBytes.length + data.length;
    }
    const centralOffset = offset;
    for (const record of records) {
        const header = Buffer.alloc(46);
        header.writeUInt32LE(0x02014b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(20, 6);
        header.writeUInt16LE(0, 8);
        header.writeUInt16LE(0, 10);
        header.writeUInt16LE(0, 12);
        header.writeUInt16LE(0, 14);
        header.writeUInt32LE(0, 16);
        header.writeUInt32LE(record.length, 20);
        header.writeUInt32LE(record.length, 24);
        header.writeUInt16LE(record.name.length, 28);
        header.writeUInt16LE(0, 30);
        header.writeUInt16LE(0, 32);
        header.writeUInt16LE(0, 34);
        header.writeUInt16LE(0, 36);
        header.writeUInt32LE(0, 38);
        header.writeUInt32LE(record.offset, 42);
        chunks.push(header, record.name);
        offset += header.length + record.name.length;
    }
    const centralSize = offset - centralOffset;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(records.length, 8);
    end.writeUInt16LE(records.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralOffset, 16);
    chunks.push(end);
    const result = Buffer.concat(chunks);
    return Buffer.concat([result, Buffer.alloc(Math.max(0, 4096 - result.length))]);
}

const FIXTURE = zipFixture();
const RELEASE: EngineRelease = {
    version: "5.23",
    asset: "bluemap-fixture-cli.jar",
    sizeBytes: FIXTURE.length,
    sha256: createHash("sha256").update(FIXTURE).digest("hex"),
    url: "https://example.test/fixture-cli.jar",
};

function fetchFixture(bytes: Buffer = FIXTURE, delayMs = 0) {
    let calls = 0;
    const fetchBinary = async () => {
        calls += 1;
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        return {
            ok: true,
            status: 200,
            headers: {
                get: (name: string) => (name === "content-length" ? String(bytes.length) : null),
            },
            body: (async function* () {
                yield bytes;
            })(),
        };
    };
    return { fetchBinary, calls: () => calls };
}

describe("managed upstream Java engine repair", () => {
    it("repairs a missing packaged asset, reports progress, and resolves the same managed jar", async () => {
        const dataDir = await mkdtemp(join(tmpdir(), "worldlens-engine-repair-"));
        const progress: string[] = [];
        const fixture = fetchFixture();
        const result = await ensureManagedUpstreamJava({
            dataDir,
            resourcesPath: join(dataDir, "missing-resources"),
            release: RELEASE,
            fetchBinary: fixture.fetchBinary,
            onProgress: (event) => progress.push(event.stage),
        });

        expect(result?.source).toBe("managed");
        expect(result?.reused).toBe(false);
        expect(await readFile(managedUpstreamJavaJar(dataDir, RELEASE))).toEqual(FIXTURE);
        expect(progress).toEqual(
            expect.arrayContaining(["checking", "downloading", "verifying", "installed"]),
        );
        expect(
            resolveCliJar({
                resourcesPath: join(dataDir, "missing-resources"),
                repoRoot: null,
                dataDir,
            }).source,
        ).toBe("managed");
    });

    it("removes corrupt managed bytes before downloading a replacement", async () => {
        const dataDir = await mkdtemp(join(tmpdir(), "worldlens-engine-corrupt-"));
        const target = managedUpstreamJavaJar(dataDir, RELEASE);
        await mkdir(join(dataDir, "render-engines", "upstream-java"), { recursive: true });
        await writeFile(target, Buffer.from("corrupt"));
        const fixture = fetchFixture();
        await ensureManagedUpstreamJava({
            dataDir,
            release: RELEASE,
            fetchBinary: fixture.fetchBinary,
        });
        expect(await readFile(target)).toEqual(FIXTURE);
    });

    it("refuses digest-mismatched bytes and leaves no installed target", async () => {
        const dataDir = await mkdtemp(join(tmpdir(), "worldlens-engine-digest-"));
        const fixture = fetchFixture(Buffer.from("not the pinned jar"));
        await expect(
            ensureManagedUpstreamJava({
                dataDir,
                release: RELEASE,
                fetchBinary: fixture.fetchBinary,
            }),
        ).rejects.toThrow(/Checksum mismatch/);
        await expect(stat(managedUpstreamJavaJar(dataDir, RELEASE))).rejects.toThrow();
    });

    it("single-flights concurrent repair calls", async () => {
        const dataDir = await mkdtemp(join(tmpdir(), "worldlens-engine-flight-"));
        const fixture = fetchFixture(FIXTURE, 20);
        const [first, second] = await Promise.all([
            ensureManagedUpstreamJava({
                dataDir,
                release: RELEASE,
                fetchBinary: fixture.fetchBinary,
            }),
            ensureManagedUpstreamJava({
                dataDir,
                release: RELEASE,
                fetchBinary: fixture.fetchBinary,
            }),
        ]);
        expect(first).toEqual(second);
        expect(fixture.calls()).toBe(1);
    });

    it("cancels without publishing a temporary or final jar", async () => {
        const dataDir = await mkdtemp(join(tmpdir(), "worldlens-engine-cancel-"));
        const controller = new AbortController();
        const fetchBinary = async () => ({
            ok: true,
            status: 200,
            headers: {
                get: (name: string) => (name === "content-length" ? String(FIXTURE.length) : null),
            },
            body: (async function* () {
                controller.abort();
                yield FIXTURE;
            })(),
        });
        await expect(
            ensureManagedUpstreamJava({
                dataDir,
                release: RELEASE,
                fetchBinary,
                signal: controller.signal,
            }),
        ).rejects.toThrow(/aborted/i);
        await expect(stat(managedUpstreamJavaJar(dataDir, RELEASE))).rejects.toThrow();
    });

    it("accepts a complete packaged manifest and does not download", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-engine-packaged-"));
        await mkdir(join(root, "jars"), { recursive: true });
        await writeFile(join(root, "jars", RELEASE.asset), FIXTURE);
        await mkdir(join(root, "render-engines"), { recursive: true });
        await writeFile(
            join(root, "render-engines", "manifest.json"),
            JSON.stringify({
                manifestVersion: 1,
                engines: {
                    "upstream-java": {
                        available: true,
                        version: RELEASE.version,
                        jar: {
                            fileName: RELEASE.asset,
                            size: RELEASE.sizeBytes,
                            sha256: RELEASE.sha256,
                        },
                    },
                },
            }),
        );
        expect(await packagedUpstreamJavaIsUsable(root, RELEASE)).toBe(true);
        const fixtureFetch = fetchFixture();
        const result = await ensureManagedUpstreamJava({
            dataDir: root,
            resourcesPath: root,
            release: RELEASE,
            fetchBinary: fixtureFetch.fetchBinary,
        });
        expect(result?.source).toBe("bundled");
        expect(fixtureFetch.calls()).toBe(0);
    });

    it("keeps a valid local Gradle jar even when it differs from the official fallback asset", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-engine-gradle-bundle-"));
        const localAsset = "cli-5.23-shadow.jar";
        await mkdir(join(root, "jars"), { recursive: true });
        await writeFile(join(root, "jars", localAsset), FIXTURE);
        await mkdir(join(root, "render-engines"), { recursive: true });
        await writeFile(
            join(root, "render-engines", "manifest.json"),
            JSON.stringify({
                manifestVersion: 1,
                engines: {
                    "upstream-java": {
                        available: true,
                        version: "5.23",
                        jar: {
                            fileName: localAsset,
                            size: FIXTURE.length,
                            sha256: RELEASE.sha256,
                            source: "gradle",
                        },
                    },
                },
            }),
        );
        expect(await packagedUpstreamJavaIsUsable(root, RELEASE)).toBe(true);
        const fixtureFetch = fetchFixture(Buffer.from("must not download"));
        const result = await ensureManagedUpstreamJava({
            dataDir: root,
            resourcesPath: root,
            release: RELEASE,
            fetchBinary: fixtureFetch.fetchBinary,
        });
        expect(result).toMatchObject({
            source: "bundled",
            jarPath: null,
            version: "5.23",
            reused: true,
        });
        expect(fixtureFetch.calls()).toBe(0);
    });

    it("repairs when the bundled manifest points at malformed bytes", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-engine-invalid-bundle-"));
        await mkdir(join(root, "jars"), { recursive: true });
        await writeFile(join(root, "jars", "cli-5.23-shadow.jar"), Buffer.from("not a jar"));
        await mkdir(join(root, "render-engines"), { recursive: true });
        await writeFile(
            join(root, "render-engines", "manifest.json"),
            JSON.stringify({
                manifestVersion: 1,
                engines: {
                    "upstream-java": {
                        available: true,
                        version: "5.23",
                        jar: {
                            fileName: "cli-5.23-shadow.jar",
                            size: 9,
                            sha256: RELEASE.sha256,
                            source: "gradle",
                        },
                    },
                },
            }),
        );
        const fixtureFetch = fetchFixture();
        const result = await ensureManagedUpstreamJava({
            dataDir: root,
            resourcesPath: root,
            release: RELEASE,
            fetchBinary: fixtureFetch.fetchBinary,
        });
        expect(result?.source).toBe("managed");
        expect(fixtureFetch.calls()).toBe(1);
    });
});
