import { describe, expect, it } from "vitest";
import { verifyJarBytes } from "../../../scripts/jar-verifier.mjs";

describe("shared JAR verifier", () => {
    it("rejects short and non-ZIP bytes", () => {
        expect(verifyJarBytes(Buffer.from("not a jar"))).toMatchObject({ ok: false });
        expect(verifyJarBytes(Buffer.alloc(4096))).toMatchObject({ ok: false });
    });

    it("rejects an archive with no bounded central directory", () => {
        const bytes = Buffer.alloc(4096);
        bytes.writeUInt32LE(0x04034b50, 0);
        bytes.writeUInt32LE(0x06054b50, bytes.length - 22);
        bytes.writeUInt16LE(1, bytes.length - 12);
        bytes.writeUInt32LE(1, bytes.length - 10);
        bytes.writeUInt32LE(4090, bytes.length - 6);
        expect(verifyJarBytes(bytes)).toMatchObject({ ok: false });
    });
});
