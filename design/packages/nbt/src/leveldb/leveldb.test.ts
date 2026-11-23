import { deflateRawSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { describeBedrockKey } from "./bedrockKeys.js";
import { readLevelDb, readLog, readTable, snappyDecompress } from "./leveldb.js";

const enc = new TextEncoder();
function varint(n: number): number[] {
    const out: number[] = [];
    while (n >= 0x80) {
        out.push((n & 0x7f) | 0x80);
        n = Math.floor(n / 128);
    }
    out.push(n);
    return out;
}
const bytes = (...parts: (number[] | Uint8Array)[]): Uint8Array =>
    Uint8Array.from(parts.flatMap((p) => Array.from(p)));

/** A block with every key unshared and one restart point. */
function block(entries: [Uint8Array, Uint8Array][]): Uint8Array {
    const body = entries.flatMap(([k, v]) => [
        ...varint(0),
        ...varint(k.length),
        ...varint(v.length),
        ...k,
        ...v,
    ]);
    return bytes(body, [0, 0, 0, 0], [1, 0, 0, 0]);
}
function internal(key: string, seq: number, type: number): Uint8Array {
    const t = Buffer.alloc(8);
    t.writeBigUInt64LE((BigInt(seq) << 8n) | BigInt(type));
    return bytes(enc.encode(key), t);
}
/** A table with one data block, stored with the given compression. */
function table(entries: [Uint8Array, Uint8Array][], compression: 0 | 2 | 4): Uint8Array {
    const plain = block(entries);
    const stored =
        compression === 0
            ? plain
            : compression === 2
              ? new Uint8Array(deflateSync(plain))
              : new Uint8Array(deflateRawSync(plain));
    const data = bytes(stored, [compression, 0, 0, 0, 0]);
    const lastKey = entries[entries.length - 1]![0];
    const index = block([[lastKey, Uint8Array.from([...varint(0), ...varint(stored.length)])]]);
    const indexAt = data.length;
    const meta = block([]);
    const metaAt = indexAt + index.length + 5;
    const footer = new Uint8Array(48);
    footer.set([
        ...varint(metaAt),
        ...varint(meta.length),
        ...varint(indexAt),
        ...varint(index.length),
    ]);
    new DataView(footer.buffer).setBigUint64(40, 0xdb4775248b80fb57n, true);
    return bytes(data, index, [0, 0, 0, 0, 0], meta, [0, 0, 0, 0, 0], footer);
}
/** One log record holding a write batch. */
function log(seq: number, ops: [string, string | null][]): Uint8Array {
    const head = Buffer.alloc(12);
    head.writeBigUInt64LE(BigInt(seq));
    head.writeUInt32LE(ops.length, 8);
    const batch = bytes(
        head,
        ops.flatMap(([k, v]) =>
            v === null
                ? [0, ...varint(k.length), ...enc.encode(k)]
                : [1, ...varint(k.length), ...enc.encode(k), ...varint(v.length), ...enc.encode(v)],
        ),
    );
    const header = Buffer.alloc(7);
    header.writeUInt16LE(batch.length, 4);
    header[6] = 1;
    return bytes(header, batch);
}

describe("LevelDB reader", () => {
    it("reads tables stored plain, zlib and raw deflate, with sequences and deletions", () => {
        for (const c of [0, 2, 4] as const) {
            const t = readTable(
                table(
                    [
                        [internal("a", 5, 1), enc.encode("one")],
                        [internal("b", 6, 0), new Uint8Array()],
                    ],
                    c,
                ),
            );
            expect(
                t.map((e) => [
                    new TextDecoder().decode(e.key),
                    e.value === null ? null : new TextDecoder().decode(e.value),
                    e.sequence,
                ]),
            ).toEqual([
                ["a", "one", 5n],
                ["b", null, 6n],
            ]);
        }
        expect(() => readTable(new Uint8Array(48))).toThrow(/Not a LevelDB table/);
    });

    it("reads log batches and lets the newest sequence win across files", () => {
        expect(
            readLog(
                log(10, [
                    ["a", "two"],
                    ["c", "three"],
                ]),
            ).map((e) => e.sequence),
        ).toEqual([10n, 11n]);
        const files = new Map<string, Uint8Array>([
            [
                "000005.ldb",
                table(
                    [
                        [internal("a", 5, 1), enc.encode("one")],
                        [internal("b", 6, 1), enc.encode("bee")],
                    ],
                    4,
                ),
            ],
            [
                "000007.log",
                log(10, [
                    ["a", "two"],
                    ["b", null],
                ]),
            ],
            ["MANIFEST-000001", Uint8Array.from([1, 2, 3])],
        ]);
        const { entries, problems } = readLevelDb(files);
        expect(problems).toEqual([]);
        expect(
            entries.map(
                (e) => `${new TextDecoder().decode(e.key)}=${new TextDecoder().decode(e.value)}`,
            ),
        ).toEqual(["a=two"]);
        expect(readLevelDb(new Map([["bad.ldb", new Uint8Array(10)]])).problems[0]).toMatch(
            /bad\.ldb/,
        );
    });

    it("decompresses Snappy literals and copies", () => {
        // "abcabcabc": literal "abc" then a copy of 6 bytes from offset 3.
        expect(
            new TextDecoder().decode(
                snappyDecompress(Uint8Array.from([9, 0x08, 97, 98, 99, 0x09, 3])),
            ),
        ).toBe("abcabcabc");
    });
});

describe("Bedrock keys", () => {
    const chunkKey = (x: number, z: number, tag: number, dim?: number, sub?: number) => {
        const b = Buffer.alloc(dim === undefined ? 9 : 13);
        b.writeInt32LE(x, 0);
        b.writeInt32LE(z, 4);
        if (dim !== undefined) b.writeInt32LE(dim, 8);
        b[dim === undefined ? 8 : 12] = tag;
        return sub === undefined ? new Uint8Array(b) : bytes(b, [sub & 0xff]);
    };
    it("names chunk records, players and world records, and marks NBT values", () => {
        expect(describeBedrockKey(chunkKey(-3, 7, 49))).toMatchObject({
            label: "Overworld chunk -3, 7: Block entities",
            nbt: true,
            group: "chunk",
        });
        expect(describeBedrockKey(chunkKey(1, 2, 47, 1, -4)).label).toBe(
            "Nether chunk 1, 2: Sub-chunk blocks (y -64)",
        );
        expect(describeBedrockKey(enc.encode("~local_player"))).toMatchObject({
            label: "Local player",
            group: "player",
            nbt: true,
        });
        expect(describeBedrockKey(enc.encode("scoreboard"))).toMatchObject({
            group: "world",
            nbt: true,
        });
        expect(describeBedrockKey(enc.encode("portals"))).toMatchObject({ nbt: true });
        expect(describeBedrockKey(Uint8Array.from([0xff, 0x00])).label).toBe("0xff00");
    });
});
