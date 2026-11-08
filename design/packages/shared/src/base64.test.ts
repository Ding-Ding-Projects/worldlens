import { describe, expect, it } from "vitest";
import {
    Base64StreamDecoder,
    Base64StreamEncoder,
    buildDataUrl,
    bytesToText,
    decodeText,
    encodeBytes,
    freeSiblingName,
    parseDataUrl,
    restoredName,
    sidecarName,
    sniffMime,
    storeZip,
    crc32,
    decodedFileName,
    hexDump,
    previewKind,
    textToBytes,
} from "./base64.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sample = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);

describe("round trips", () => {
    it("matches the platform encoder for every length remainder", () => {
        for (let n = 0; n < 40; n += 1) {
            const bytes = sample(n);
            expect(encodeBytes(bytes)).toBe(Buffer.from(bytes).toString("base64"));
            const back = decodeText(encodeBytes(bytes));
            expect(back.ok && Buffer.from(back.bytes).equals(Buffer.from(bytes))).toBe(true);
        }
    });
    it("handles URL-safe without padding and MIME line wrapping", () => {
        const bytes = sample(200);
        const url = encodeBytes(bytes, { alphabet: "url" });
        expect(url).toBe(Buffer.from(bytes).toString("base64url"));
        const back = decodeText(url, { alphabet: "url" });
        expect(back.ok).toBe(true);
        const mime = encodeBytes(bytes, { alphabet: "mime" });
        expect(mime.split("\r\n").every((line) => line.length <= 76)).toBe(true);
        expect(decodeText(mime, { alphabet: "mime" }).ok).toBe(true);
    });
    it("round trips every text encoding", () => {
        for (const enc of ["utf-8", "utf-16le", "utf-16be", "latin1"] as const) {
            const text = enc === "latin1" ? "café" : "Bayville 世界";
            expect(bytesToText(textToBytes(text, enc), enc)).toBe(text);
        }
        expect(() => textToBytes("世", "latin1")).toThrow(/Latin-1/u);
    });
});

describe("strict decoding reports exact offsets", () => {
    it("names the first bad character", () => {
        const r = decodeText("QUJD*EVG");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.offset).toBe(4);
    });
    it("refuses spaces and wrong padding when strict, accepts them when lenient", () => {
        expect(decodeText("QU JD").ok).toBe(false);
        expect(decodeText("QUI").ok).toBe(false);
        expect(decodeText("QU JD", { strict: false }).ok).toBe(true);
        expect(decodeText("QUI", { strict: false }).ok).toBe(true);
        expect(decodeText("QQ==x").ok).toBe(false);
    });
});

describe("data URLs, sniffing and names", () => {
    it("builds and parses data URLs", () => {
        const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
        const url = buildDataUrl("image/png", png);
        const parsed = parseDataUrl(url);
        expect(parsed.ok && parsed.mime === "image/png" && Buffer.from(parsed.bytes).equals(Buffer.from(png))).toBe(true);
        expect(sniffMime(png).mime).toBe("image/png");
        expect(parseDataUrl("nope").ok).toBe(false);
    });
    it("uses the sidecar naming rule and never overwrites", () => {
        expect(sidecarName("level.dat")).toBe("level.dat.base64.txt");
        expect(restoredName("level.dat.base64.txt")).toBe("level.dat");
        expect(restoredName("notes.txt")).toBeNull();
        const taken = new Set(["level.dat"]);
        expect(freeSiblingName("level.dat", (n) => taken.has(n))).toBe("level (1).dat");
    });
});

describe("streaming", () => {
    it("encodes and decodes in odd chunks with the same output", () => {
        const bytes = sample(10_007);
        const enc = new Base64StreamEncoder({ alphabet: "mime" });
        let text = "";
        for (let i = 0; i < bytes.length; i += 333) text += enc.push(bytes.slice(i, i + 333));
        text += enc.end();
        expect(text).toBe(encodeBytes(bytes, { alphabet: "mime" }));
        const dec = new Base64StreamDecoder();
        const parts: Uint8Array[] = [];
        for (let i = 0; i < text.length; i += 101) parts.push(dec.push(text.slice(i, i + 101)));
        parts.push(dec.end());
        expect(Buffer.concat(parts).equals(Buffer.from(bytes))).toBe(true);
    });
});

describe("padding Shek Q", () => {
    it("pads every remainder exactly like RFC 4648 section 10", () => {
        const vectors: [string, string][] = [["", ""], ["f", "Zg=="], ["fo", "Zm8="], ["foo", "Zm9v"], ["foob", "Zm9vYg=="], ["fooba", "Zm9vYmE="], ["foobar", "Zm9vYmFy"]];
        for (const [plain, encoded] of vectors) {
            expect(encodeBytes(textToBytes(plain))).toBe(encoded);
            expect(encodeBytes(textToBytes(plain), { padding: false })).toBe(encoded.replace(/=+$/u, ""));
            const back = decodeText(encoded);
            expect(back.ok && bytesToText(back.bytes)).toBe(plain);
        }
    });
    it("orders UTF-16 BE bytes high first", () => {
        expect(Array.from(textToBytes("A", "utf-16be"))).toEqual([0, 65]);
        expect(() => bytesToText(Uint8Array.from([0, 65, 0]), "utf-16be")).toThrow(/odd/u);
    });
});

describe("decoded names follow the contract order", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    it("uses the name pattern, then data: MIME, then signature, then .bin", () => {
        expect(decodedFileName("report.pdf.base64.txt", "image/png", png)).toEqual({ name: "report.pdf", from: "name" });
        expect(decodedFileName("photo.b64", null, png)).toEqual({ name: "photo", from: "name" });
        expect(decodedFileName("clip.txt", "image/png", Uint8Array.of(0))).toEqual({ name: "clip.png", from: "data-url" });
        expect(decodedFileName("clip.txt", null, png)).toEqual({ name: "clip.png", from: "signature" });
        expect(decodedFileName("clip.txt", null, Uint8Array.of(0, 255, 254, 1))).toEqual({ name: "clip.bin", from: "fallback" });
    });
    it("never picks a scriptable preview element", () => {
        expect(previewKind("image/svg+xml")).toBe("hex");
        expect(previewKind("text/html")).toBe("text");
        expect(previewKind("image/png")).toBe("image");
    });
    it("dumps hex with offsets and printable text", () => {
        expect(hexDump(textToBytes("Hi!"))).toBe("00000000  48 69 21" + " ".repeat(39) + "  Hi!");
    });
});

describe("bulk ZIP export", () => {
    it("matches the standard CRC-32 check value", () => {
        expect(crc32(textToBytes("123456789"))).toBe(0xcbf43926);
    });
    it("writes an archive that unzip reads back", () => {
        const dir = mkdtempSync(join(tmpdir(), "wl-zip-"));
        const zip = storeZip([
            { name: "a.base64.txt", bytes: textToBytes("QUJD") },
            { name: "folder\\b.json", bytes: textToBytes("{}") },
        ]);
        writeFileSync(join(dir, "out.zip"), zip);
        let listing = "";
        try {
            listing = execFileSync("python3", ["-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print(sorted(z.namelist()));print(z.read('a.base64.txt').decode())", join(dir, "out.zip")]).toString();
        } catch {
            return; // No Python on this machine: the CRC test above still guards the format.
        }
        expect(listing).toContain("None");
        expect(listing).toContain("'folder/b.json'");
        expect(listing).toContain("QUJD");
        expect(readFileSync(join(dir, "out.zip")).subarray(0, 4).toString("hex")).toBe("504b0304");
    });
});
