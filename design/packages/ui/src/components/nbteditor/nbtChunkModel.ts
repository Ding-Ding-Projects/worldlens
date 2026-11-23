/**
 * Reading a chunk's packed arrays: heightmaps, block states, biomes and light.
 *
 * From 1.16 packed long arrays do not span values across longs: each long holds
 * `floor(64 / bits)` values from its low bits up. Heightmaps hold 256 values (x fastest, then z)
 * of `ceil(log2(height + 1))` bits, counted from the world's bottom. A section's block states are
 * 4,096 palette indices (x, then z, then y) of at least 4 bits; its biomes are 64 indices
 * (4 by 4 by 4) of `ceil(log2(palette))` bits, absent when the palette has one entry. Light is a
 * 2,048-byte array of 4-bit values, low nibble first. See `docs/nbt-research.md`.
 *
 * Design: `design/design-sources/nbt-editor-full/Chunk.dc.html`. Pure.
 */

export function bitsFor(count: number): number {
    return count <= 1 ? 0 : Math.ceil(Math.log2(count));
}

/** Unpacks `count` values of `bits` bits from 64-bit longs given as decimal strings or bigints. */
export function unpack(longs: readonly (string | bigint)[], bits: number, count: number): number[] {
    const out: number[] = [];
    if (bits <= 0) return new Array<number>(count).fill(0);
    const perLong = Math.floor(64 / bits);
    const mask = (1n << BigInt(bits)) - 1n;
    for (const raw of longs) {
        let v = BigInt.asUintN(64, typeof raw === "bigint" ? raw : BigInt(raw));
        for (let i = 0; i < perLong && out.length < count; i++) {
            out.push(Number(v & mask));
            v >>= BigInt(bits);
        }
        if (out.length >= count) break;
    }
    while (out.length < count) out.push(0);
    return out;
}

/** Heights from a heightmap long array, as world Y of the first free block above the surface. */
export function heightsFrom(
    longs: readonly (string | bigint)[],
    worldHeight: number,
    minY: number,
): number[] {
    return unpack(longs, bitsFor(worldHeight + 1), 256).map((v) => v + minY);
}

/** Block palette indices of one section; a one-entry palette has no data array. */
export function blockIndices(longs: readonly (string | bigint)[], paletteSize: number): number[] {
    if (paletteSize <= 1 || longs.length === 0) return new Array<number>(4096).fill(0);
    return unpack(longs, Math.max(4, bitsFor(paletteSize)), 4096);
}

export function biomeIndices(longs: readonly (string | bigint)[], paletteSize: number): number[] {
    if (paletteSize <= 1 || longs.length === 0) return new Array<number>(64).fill(0);
    return unpack(longs, bitsFor(paletteSize), 64);
}

/** One 4-bit light value at (x, y, z) inside a section, from bytes given as signed numbers. */
export function lightAt(bytes: readonly number[], x: number, y: number, z: number): number {
    const i = (y * 16 + z) * 16 + x;
    const b = (bytes[i >> 1] ?? 0) & 0xff;
    return (i & 1) === 0 ? b & 0x0f : (b >> 4) & 0x0f;
}

export function blockAt(indices: readonly number[], x: number, y: number, z: number): number {
    return indices[(y * 16 + z) * 16 + x] ?? 0;
}

export function biomeAt(indices: readonly number[], x: number, y: number, z: number): number {
    return indices[((y >> 2) * 4 + (z >> 2)) * 4 + (x >> 2)] ?? 0;
}
