import { describe, expect, it } from "vitest";
import {
    biomeAt,
    biomeIndices,
    bitsFor,
    blockAt,
    blockIndices,
    heightsFrom,
    lightAt,
    unpack,
} from "./nbtChunkModel.js";

/** Packs values the way the game does since 1.16: no value spans two longs. */
function pack(values: number[], bits: number): bigint[] {
    const per = Math.floor(64 / bits);
    const out: bigint[] = [];
    for (let i = 0; i < values.length; i += per) {
        let v = 0n;
        for (let j = per - 1; j >= 0; j--) v = (v << BigInt(bits)) | BigInt(values[i + j] ?? 0);
        out.push(BigInt.asIntN(64, v));
    }
    return out;
}

describe("chunk arrays", () => {
    it("unpacks values that do not span longs, signed longs included", () => {
        const values = Array.from({ length: 20 }, (_, i) => i * 3);
        expect(unpack(pack(values, 9), 9, 20)).toEqual(values);
        expect(unpack(["-1"], 4, 3)).toEqual([15, 15, 15]);
    });

    it("reads heightmaps from the world's bottom", () => {
        const raw = new Array<number>(256).fill(0).map((_, i) => 128 + (i % 5));
        const h = heightsFrom(pack(raw, 9), 384, -64);
        expect(h[0]).toBe(64);
        expect(h[3]).toBe(67);
        expect(bitsFor(385)).toBe(9);
    });

    it("reads block states with at least 4 bits, and biomes by 4-block cell", () => {
        const idx = new Array<number>(4096).fill(0);
        idx[(5 * 16 + 2) * 16 + 7] = 3;
        expect(blockAt(blockIndices(pack(idx, 4), 4), 7, 5, 2)).toBe(3);
        expect(blockIndices([], 1).every((v) => v === 0)).toBe(true);
        const b = new Array<number>(64).fill(0);
        b[(1 * 4 + 2) * 4 + 3] = 1;
        expect(biomeAt(biomeIndices(pack(b, 1), 2), 13, 5, 9)).toBe(1);
    });

    it("reads 4-bit light, low nibble first", () => {
        const bytes = new Array<number>(2048).fill(0);
        bytes[0] = -15; // 0xF1: x0 = 1, x1 = 15
        expect(lightAt(bytes, 0, 0, 0)).toBe(1);
        expect(lightAt(bytes, 1, 0, 0)).toBe(15);
    });
});
