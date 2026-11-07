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
    textToBytes,
} from "./base64.js";

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
        for (const enc of ["utf-8", "utf-16le", "latin1"] as const) {
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
