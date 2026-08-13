import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
    classifyLevelDat,
    compareVersions,
    detectWorldFormat,
    formatVersion,
    parseVersion,
    versionInRange,
} from "./formats.js";

/** an uncompressed NBT document holding an empty root compound, as both editions start one */
function emptyRootCompound(): Uint8Array {
    return new Uint8Array([0x0a, 0x00, 0x00, 0x00]);
}

/** a Bedrock level.dat: little-endian storage version, payload length, then the NBT */
function bedrockLevelDat(): Uint8Array {
    const payload = emptyRootCompound();
    const bytes = new Uint8Array(8 + payload.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 10, true);
    view.setUint32(4, payload.length, true);
    bytes.set(payload, 8);
    return bytes;
}

describe("classifyLevelDat", () => {
    it("reads Java's gzip magic", () => {
        expect(classifyLevelDat(gzipSync(emptyRootCompound()))).toBe("java-gzip");
    });

    it("reads Bedrock's length-prefixed header", () => {
        expect(classifyLevelDat(bedrockLevelDat())).toBe("bedrock-header");
    });

    it("reads an uncompressed Java document", () => {
        expect(classifyLevelDat(emptyRootCompound())).toBe("java-raw");
    });

    it("refuses bytes that are neither", () => {
        expect(classifyLevelDat(new Uint8Array([1, 2, 3, 4]))).toBe("unrecognised");
        expect(classifyLevelDat(new Uint8Array())).toBe("unrecognised");
    });
});

describe("detectWorldFormat", () => {
    it("identifies a Java world from its bytes, not its folder name", async () => {
        const root = await mkdtemp(join(tmpdir(), "chunker-java-"));
        // Named as though it were a Bedrock world, to prove the name is not consulted.
        const folder = join(root, "bedrock world db");
        await mkdir(join(folder, "region"), { recursive: true });
        await writeFile(join(folder, "level.dat"), gzipSync(emptyRootCompound()));

        const detected = await detectWorldFormat(folder);
        expect(detected.kind).toBe("detected");
        if (detected.kind !== "detected") return;
        expect(detected.edition).toBe("java");
        expect(detected.evidence).toContain("region/");
    });

    it("identifies a Bedrock world from its bytes", async () => {
        const folder = await mkdtemp(join(tmpdir(), "chunker-bedrock-"));
        await mkdir(join(folder, "db"), { recursive: true });
        await writeFile(join(folder, "level.dat"), bedrockLevelDat());

        const detected = await detectWorldFormat(folder);
        expect(detected.kind).toBe("detected");
        if (detected.kind !== "detected") return;
        expect(detected.edition).toBe("bedrock");
        expect(detected.evidence).toContain("db/");
    });

    it("reports a folder without level data as a value rather than throwing", async () => {
        const folder = await mkdtemp(join(tmpdir(), "chunker-empty-"));
        const detected = await detectWorldFormat(folder);
        expect(detected.kind).toBe("unknown");
    });

    it("reports a path that is not a folder at all", async () => {
        const detected = await detectWorldFormat(join(tmpdir(), "chunker-nothing-here-at-all"));
        expect(detected.kind).toBe("unknown");
    });
});

describe("versions", () => {
    it("treats a missing patch as zero", () => {
        const parsed = parseVersion("1.21");
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(formatVersion(parsed.version)).toBe("1.21.0");
    });

    it("orders releases", () => {
        const a = parseVersion("1.20.4");
        const b = parseVersion("1.21.1");
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(compareVersions(a.version, b.version)).toBeLessThan(0);
        expect(compareVersions(b.version, a.version)).toBeGreaterThan(0);
        expect(compareVersions(a.version, a.version)).toBe(0);
        expect(versionInRange(a.version, { from: a.version, to: b.version })).toBe(true);
        expect(versionInRange(b.version, { from: a.version, to: a.version })).toBe(false);
    });

    it("refuses a snapshot rather than guessing where it sorts", () => {
        expect(parseVersion("24w14a").ok).toBe(false);
        expect(parseVersion("1.21-pre1").ok).toBe(false);
    });
});
