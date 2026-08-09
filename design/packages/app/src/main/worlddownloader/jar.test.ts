import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FetchBinary, HttpBinaryResponse } from "../java/download.js";
import type { FetchText, JarEvent } from "./jar.js";
import {
    DOWNLOADER_JAR_ASSET,
    DOWNLOADER_SUMS_ASSET,
    JAR_RECORD_VERSION,
    clearJarRecord,
    digestFromSums,
    downloaderJarPath,
    downloaderRoot,
    ensureDownloaderJar,
    jarRecordFile,
    readJarRecord,
    writeJarRecord,
} from "./jar.js";

const directories: string[] = [];
afterEach(() => {
    while (directories.length > 0) {
        const directory = directories.pop();
        if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
    }
});

function dataDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "bluemap-worlddownloader-jar-"));
    directories.push(directory);
    return directory;
}

/** Stand-in for the real 14 MB jar: identical code path, four orders of magnitude less disk. */
const JAR = Buffer.from("PK a pretend world-downloader jar ".repeat(4));
const JAR_SHA256 = createHash("sha256").update(JAR).digest("hex");

const TAG = "build-61";

function releaseJson(tag: string): string {
    return JSON.stringify({
        tag_name: tag,
        assets: [
            {
                name: DOWNLOADER_JAR_ASSET,
                browser_download_url: `https://example.invalid/${tag}/${DOWNLOADER_JAR_ASSET}`,
                size: JAR.length,
            },
            {
                name: DOWNLOADER_SUMS_ASSET,
                browser_download_url: `https://example.invalid/${tag}/${DOWNLOADER_SUMS_ASSET}`,
                size: 266,
            },
        ],
    });
}

function textResponse(body: string): { ok: boolean; status: number; text(): Promise<string> } {
    return { ok: true, status: 200, text: () => Promise.resolve(body) };
}

/** Answers the release listing and the checksum file, and records every URL it was asked for. */
function textServer(sums: string): { fetchText: FetchText; urls: string[] } {
    const urls: string[] = [];
    const fetchText: FetchText = (url) => {
        urls.push(url);
        if (url.endsWith(DOWNLOADER_SUMS_ASSET)) return Promise.resolve(textResponse(sums));
        if (url.includes("api.github.com")) return Promise.resolve(textResponse(releaseJson(TAG)));
        return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") });
    };
    return { fetchText, urls };
}

async function* chunks(body: Buffer, size = 16): AsyncGenerator<Uint8Array> {
    for (let offset = 0; offset < body.length; offset += size) {
        yield Uint8Array.prototype.slice.call(body, offset, offset + size);
    }
}

function binaryServer(body: Buffer): { fetchBinary: FetchBinary; urls: string[] } {
    const urls: string[] = [];
    const fetchBinary: FetchBinary = (url) => {
        urls.push(url);
        return Promise.resolve<HttpBinaryResponse>({
            ok: true,
            status: 200,
            statusText: "OK",
            headers: {
                get: (name) =>
                    name.toLowerCase() === "content-length" ? String(body.length) : null,
            },
            body: chunks(body),
        });
    };
    return { fetchBinary, urls };
}

/** Fetchers that prove a code path never reached the network, by making it impossible to. */
const refusingText: FetchText = () => {
    throw new Error("the network was consulted when it should not have been");
};
const refusingBinary: FetchBinary = () => {
    throw new Error("the network was consulted when it should not have been");
};

/** Puts a verified jar and a matching record on disk, as a previous successful run would have. */
function installJar(dataDir: string, tag = TAG): string {
    const jar = downloaderJarPath(dataDir, tag);
    mkdirSync(dirname(jar), { recursive: true });
    writeFileSync(jar, JAR);
    writeJarRecord(dataDir, {
        version: JAR_RECORD_VERSION,
        tag,
        jar,
        sha256: JAR_SHA256,
        bytes: JAR.length,
        installedAt: new Date().toISOString(),
    });
    return jar;
}

describe("paths", () => {
    it("keys the jar by release tag under a root of its own", () => {
        const dataDir = dataDirectory();
        expect(downloaderRoot(dataDir)).toBe(join(dataDir, "world-downloader"));
        expect(downloaderJarPath(dataDir, TAG)).toBe(
            join(dataDir, "world-downloader", TAG, DOWNLOADER_JAR_ASSET),
        );
        expect(jarRecordFile(dataDir)).toBe(join(dataDir, "world-downloader", "installed.json"));
    });
});

describe("digestFromSums", () => {
    it("reads a plain sha256sum line", () => {
        expect(
            digestFromSums(`${JAR_SHA256}  ${DOWNLOADER_JAR_ASSET}\n`, DOWNLOADER_JAR_ASSET),
        ).toBe(JAR_SHA256);
    });

    it("tolerates the binary-mode asterisk and a directory prefix", () => {
        expect(
            digestFromSums(`${JAR_SHA256} *dist/${DOWNLOADER_JAR_ASSET}\n`, DOWNLOADER_JAR_ASSET),
        ).toBe(JAR_SHA256);
    });

    it("returns null when the file does not name the asset", () => {
        expect(
            digestFromSums(`${JAR_SHA256}  something-else.jar\n`, DOWNLOADER_JAR_ASSET),
        ).toBeNull();
    });
});

describe("readJarRecord", () => {
    it("round-trips a written record", () => {
        const dataDir = dataDirectory();
        installJar(dataDir);
        const record = readJarRecord(dataDir);
        expect(record?.tag).toBe(TAG);
        expect(record?.sha256).toBe(JAR_SHA256);
        expect(record?.bytes).toBe(JAR.length);
    });

    it("returns null for a malformed record file", () => {
        const dataDir = dataDirectory();
        installJar(dataDir);
        writeFileSync(jarRecordFile(dataDir), "{ this is not json", "utf8");
        expect(readJarRecord(dataDir)).toBeNull();
    });

    it("returns null for a record written by a different schema version", () => {
        const dataDir = dataDirectory();
        const jar = installJar(dataDir);
        writeFileSync(
            jarRecordFile(dataDir),
            JSON.stringify({
                version: JAR_RECORD_VERSION + 1,
                tag: TAG,
                jar,
                sha256: JAR_SHA256,
                bytes: JAR.length,
                installedAt: "2026-01-01T00:00:00.000Z",
            }),
            "utf8",
        );
        expect(readJarRecord(dataDir)).toBeNull();
    });

    it("returns null when the recorded jar has gone missing", () => {
        const dataDir = dataDirectory();
        const jar = installJar(dataDir);
        rmSync(jar);
        expect(readJarRecord(dataDir)).toBeNull();
    });

    it("forgets a record on request", () => {
        const dataDir = dataDirectory();
        installJar(dataDir);
        clearJarRecord(dataDir);
        expect(readJarRecord(dataDir)).toBeNull();
    });
});

describe("ensureDownloaderJar", () => {
    it("reuses a verified jar without touching the network at all", async () => {
        const dataDir = dataDirectory();
        installJar(dataDir);

        const result = await ensureDownloaderJar({
            dataDir,
            fetchText: refusingText,
            fetchBinary: refusingBinary,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.reused).toBe(true);
        expect(result.record.tag).toBe(TAG);
        expect(result.record.sha256).toBe(JAR_SHA256);
    });

    it("refuses to reuse a recorded jar whose bytes no longer match its digest", async () => {
        const dataDir = dataDirectory();
        const jar = installJar(dataDir);
        writeFileSync(jar, Buffer.from("a truncated copy from an interrupted run"));

        const { fetchText } = textServer(`${JAR_SHA256}  ${DOWNLOADER_JAR_ASSET}\n`);
        const { fetchBinary } = binaryServer(JAR);
        const result = await ensureDownloaderJar({ dataDir, fetchText, fetchBinary });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Not reused: the record was a claim, the bytes were the evidence, and they
        // disagreed, so the jar was fetched again rather than run.
        expect(result.reused).toBe(false);
    });

    it("downloads, verifies and records a release through injected fetchers", async () => {
        const dataDir = dataDirectory();
        const { fetchText, urls: textUrls } = textServer(
            `${JAR_SHA256}  ${DOWNLOADER_JAR_ASSET}\n${"0".repeat(64)}  README.md\n`,
        );
        const { fetchBinary, urls: binaryUrls } = binaryServer(JAR);
        const events: JarEvent[] = [];

        const result = await ensureDownloaderJar({
            dataDir,
            fetchText,
            fetchBinary,
            onEvent: (event) => events.push(event),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.reused).toBe(false);
        expect(result.record.tag).toBe(TAG);
        expect(result.record.jar).toBe(downloaderJarPath(dataDir, TAG));
        expect(result.record.sha256).toBe(JAR_SHA256);
        expect(result.record.bytes).toBe(JAR.length);

        expect(textUrls[0]).toContain("api.github.com");
        expect(textUrls[1]).toContain(DOWNLOADER_SUMS_ASSET);
        expect(binaryUrls).toEqual([`https://example.invalid/${TAG}/${DOWNLOADER_JAR_ASSET}`]);

        // The stages arrive in the order a progress surface would render them, with the
        // transfer contributing however many progress events the chunking produced.
        const stages = events.map((event) => event.stage);
        expect(stages[0]).toBe("resolving");
        expect(stages[1]).toBe("checksums");
        expect(stages).toContain("downloading");
        expect(stages.at(-2)).toBe("verifying");
        expect(stages.at(-1)).toBe("done");
        expect(events.at(-3)?.received).toBe(JAR.length);

        // The record survives the process that wrote it.
        expect(readJarRecord(dataDir)?.sha256).toBe(JAR_SHA256);
    });

    it("refuses to download when the checksum file names only a different file", async () => {
        const dataDir = dataDirectory();
        const { fetchText } = textServer(`${"a".repeat(64)}  some-other-artifact.zip\n`);
        const { fetchBinary, urls: binaryUrls } = binaryServer(JAR);

        const result = await ensureDownloaderJar({ dataDir, fetchText, fetchBinary });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("checksum-missing");
        expect(result.message).toContain(DOWNLOADER_JAR_ASSET);
        // The point of the whole module: an unverifiable jar is never fetched.
        expect(binaryUrls).toEqual([]);
        expect(readJarRecord(dataDir)).toBeNull();
    });

    it("reports a release that publishes no jar as no-asset", async () => {
        const dataDir = dataDirectory();
        const fetchText: FetchText = (url) =>
            url.includes("api.github.com")
                ? Promise.resolve(
                      textResponse(
                          JSON.stringify({
                              tag_name: TAG,
                              assets: [
                                  {
                                      name: DOWNLOADER_SUMS_ASSET,
                                      browser_download_url: "https://example.invalid/sums",
                                  },
                              ],
                          }),
                      ),
                  )
                : Promise.resolve(textResponse(""));

        const result = await ensureDownloaderJar({
            dataDir,
            fetchText,
            fetchBinary: refusingBinary,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("no-asset");
    });

    it("reports a refused release listing as resolve-failed", async () => {
        const dataDir = dataDirectory();
        const fetchText: FetchText = () =>
            Promise.resolve({
                ok: false,
                status: 403,
                text: () => Promise.resolve("rate limited"),
            });

        const result = await ensureDownloaderJar({
            dataDir,
            fetchText,
            fetchBinary: refusingBinary,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("resolve-failed");
        expect(result.message).toContain("403");
    });

    it("skips the release listing entirely when a tag is pinned", async () => {
        const dataDir = dataDirectory();
        const { fetchText, urls } = textServer(`${JAR_SHA256}  ${DOWNLOADER_JAR_ASSET}\n`);
        const { fetchBinary, urls: binaryUrls } = binaryServer(JAR);

        const result = await ensureDownloaderJar({
            dataDir,
            tag: "build-60",
            fetchText,
            fetchBinary,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.record.tag).toBe("build-60");
        expect(urls.some((url) => url.includes("api.github.com"))).toBe(false);
        expect(binaryUrls[0]).toContain("/releases/download/build-60/");
    });

    it("does not hand back an installed jar when a different tag was pinned", async () => {
        const dataDir = dataDirectory();
        installJar(dataDir, "build-61");
        const { fetchText } = textServer(`${JAR_SHA256}  ${DOWNLOADER_JAR_ASSET}\n`);
        const { fetchBinary } = binaryServer(JAR);

        const result = await ensureDownloaderJar({
            dataDir,
            tag: "build-59",
            fetchText,
            fetchBinary,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.reused).toBe(false);
        expect(result.record.tag).toBe("build-59");
    });

    it("reports a transfer failure as download-failed without recording anything", async () => {
        const dataDir = dataDirectory();
        const { fetchText } = textServer(`${JAR_SHA256}  ${DOWNLOADER_JAR_ASSET}\n`);
        const fetchBinary: FetchBinary = () =>
            Promise.resolve<HttpBinaryResponse>({
                ok: false,
                status: 502,
                statusText: "Bad Gateway",
                headers: { get: () => null },
                body: null,
            });

        const result = await ensureDownloaderJar({ dataDir, fetchText, fetchBinary });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("download-failed");
        expect(result.message).toContain("502");
        expect(readJarRecord(dataDir)).toBeNull();
    });

    it("reports an already-aborted signal as cancelled before doing anything", async () => {
        const dataDir = dataDirectory();
        const controller = new AbortController();
        controller.abort();

        const result = await ensureDownloaderJar({
            dataDir,
            fetchText: refusingText,
            fetchBinary: refusingBinary,
            signal: controller.signal,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("cancelled");
    });
});
