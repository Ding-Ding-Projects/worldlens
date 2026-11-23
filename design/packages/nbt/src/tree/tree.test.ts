import { describe, expect, it } from "vitest";
import {
    NbtError,
    TAG_KINDS,
    TreeEditor,
    createNode,
    describeChanges,
    detectCompression,
    diffTrees,
    indexTree,
    listRegionChunks,
    parseNbtPayload,
    parseScalarText,
    parseSnbt,
    pathOf,
    readNbtFile,
    readRegionChunk,
    replaceRegionChunk,
    searchTree,
    toSnbt,
    writeNbtFile,
    writeNbtPayload,
    type NbtDocument,
    type NbtNode,
    type TagKind,
} from "../index.js";

function emptyDoc(name = ""): NbtDocument {
    const doc: NbtDocument = {
        root: null as unknown as NbtNode,
        endianness: "big",
        compression: "none",
        bedrockHeader: null,
        trailing: new Uint8Array(),
        nextId: 1,
    };
    doc.root = createNode(doc, "compound", name);
    return doc;
}

function snbtDoc(text: string, over: Partial<NbtDocument> = {}): NbtDocument {
    const doc = emptyDoc("");
    const root = parseSnbt(text, doc, "");
    return { ...doc, ...over, root };
}

/** Every tag type once, including the awkward corners the editor has to preserve. */
const EVERYTHING =
    '{b:-5b,s:300s,i:-70000,l:-4172144997902289642L,f:1.5f,d:2.25d,str:"héllo \\"q\\"",ba:[B;1b,-2b],ia:[I;1,-2,3],la:[L;9007199254740993L,-1L],li:[1,2,3],lc:[{a:1},{a:2}],ls:["x","y"],empty:[],nest:{deep:{deeper:{v:1b}}}}';

describe("binary codec", () => {
    it("round-trips every tag type byte for byte", () => {
        const doc = snbtDoc(EVERYTHING);
        const bytes = writeNbtFile(doc);
        const reread = readNbtFile(bytes);
        expect(reread.compression).toBe("none");
        expect(Array.from(writeNbtFile(reread))).toEqual(Array.from(bytes));
        expect(toSnbt(reread.root)).toBe(toSnbt(doc.root));
    });

    it("parses a hand-assembled file (independent of the writer)", () => {
        // compound "" { byte "a" = 7, string "s" = "hi", int-list "l" = [1, 2] }
        const bytes = Uint8Array.from([
            0x0a, 0x00, 0x00,
            0x01, 0x00, 0x01, 0x61, 0x07,
            0x08, 0x00, 0x01, 0x73, 0x00, 0x02, 0x68, 0x69,
            0x09, 0x00, 0x01, 0x6c, 0x03, 0x00, 0x00, 0x00, 0x02, 0, 0, 0, 1, 0, 0, 0, 2,
            0x00,
        ]);
        const doc = readNbtFile(bytes);
        expect(toSnbt(doc.root)).toBe('{a:7b,s:"hi",l:[1,2]}');
        expect(Array.from(writeNbtFile(doc))).toEqual(Array.from(bytes));
    });

    it("preserves duplicate names, an empty list's declared type, and trailing bytes", () => {
        const bytes = Uint8Array.from([
            0x0a, 0x00, 0x00,
            0x01, 0x00, 0x01, 0x61, 0x01,
            0x01, 0x00, 0x01, 0x61, 0x02,
            0x09, 0x00, 0x01, 0x6c, 0x03, 0x00, 0x00, 0x00, 0x00, // empty list declared as ints
            0x00,
            0xde, 0xad,
        ]);
        const doc = readNbtFile(bytes);
        expect(doc.root.children!.map((c) => c.name)).toEqual(["a", "a", "l"]);
        expect(doc.root.children![2]!.listKind).toBe("int");
        expect(Array.from(writeNbtFile(doc))).toEqual(Array.from(bytes));
    });

    it("preserves a NaN payload and string bytes that are not valid text", () => {
        const payload = writeNbtPayload(snbtDoc('{n:0.0d,m:0.0f,s:"x"}').root);
        // patch the double to a NaN with a payload, the float to a NaN, and the string to bytes 0xff 0xfe.
        const view = new DataView(payload.buffer);
        const bytes = Uint8Array.from(payload);
        const text = new TextDecoder("latin1").decode(bytes);
        const dAt = text.indexOf("n") + 1;
        view.setBigUint64(dAt, 0x7ff8000000001234n, false);
        const fAt = text.indexOf("m") + 1;
        view.setUint32(fAt, 0x7fc01234, false);
        const patched = Uint8Array.from(payload);
        const sAt = text.indexOf("s", fAt) + 1 + 2;
        patched[sAt] = 0xff;
        const doc = parseNbtPayload(patched);
        expect(Array.from(writeNbtPayload(doc.root))).toEqual(Array.from(patched));
    });

    it("detects gzip, zlib and uncompressed files and keeps the wrapping on save", () => {
        for (const compression of ["gzip", "zlib", "none"] as const) {
            const doc = snbtDoc(EVERYTHING, { compression });
            const bytes = writeNbtFile(doc);
            expect(detectCompression(bytes)).toBe(compression);
            const reread = readNbtFile(bytes);
            expect(reread.compression).toBe(compression);
            expect(toSnbt(reread.root)).toBe(toSnbt(doc.root));
        }
    });

    it("reads and writes a Bedrock level.dat: little-endian with an eight-byte header", () => {
        const doc = snbtDoc('{LevelName:"Bedrock world",GameType:1,Seed:123456789012L}', {
            endianness: "little",
            bedrockHeader: { version: 10 },
        });
        const bytes = writeNbtFile(doc);
        expect(bytes[0]).toBe(10);
        expect(new DataView(bytes.buffer, bytes.byteOffset).getInt32(4, true)).toBe(bytes.length - 8);
        const reread = readNbtFile(bytes);
        expect(reread.endianness).toBe("little");
        expect(reread.bedrockHeader).toEqual({ version: 10 });
        expect(toSnbt(reread.root)).toBe(toSnbt(doc.root));
        expect(Array.from(writeNbtFile(reread))).toEqual(Array.from(bytes));
    });

    it("rejects damaged data with a plain message", () => {
        expect(() => readNbtFile(Uint8Array.from([0x0a, 0x00, 0x00, 0x01, 0x00]))).toThrow(NbtError);
        expect(() => readNbtFile(Uint8Array.from([0x01, 0x02, 0x03]))).toThrow(/compound/);
        expect(() => parseNbtPayload(Uint8Array.from([0x0a, 0, 0, 0x09, 0, 1, 0x6c, 0x03, 0xff, 0xff, 0xff, 0xff, 0]))).toThrow(/negative/);
    });
});

describe("SNBT", () => {
    it("prints and re-parses every tag type exactly", () => {
        const doc = snbtDoc(EVERYTHING);
        const printed = toSnbt(doc.root);
        const again = parseSnbt(printed, doc, "");
        expect(toSnbt(again)).toBe(printed);
        expect(printed).toContain("-4172144997902289642L");
        expect(printed).toContain("9007199254740993L");
        expect(printed).toContain("1.5f");
        expect(printed).toContain("2.25d");
    });

    it("prints floats as the shortest text that reads back identically", () => {
        const doc = emptyDoc();
        const node = parseSnbt("0.1f", doc);
        expect(node.value).toBe(Math.fround(0.1));
        expect(toSnbt(node)).toBe("0.1f");
        expect(toSnbt(parseSnbt("3.0d", doc))).toBe("3.0d");
        expect(toSnbt(parseSnbt("NaNd", doc))).toBe("NaNd");
    });

    it("accepts what people type: true/false, bare decimals, unquoted words, trailing commas", () => {
        const doc = emptyDoc();
        expect(toSnbt(parseSnbt("{a:true,b:false,c:1.5,d:word,e:[1,2,],}", doc))).toBe("{a:1b,b:0b,c:1.5d,d:\"word\",e:[1,2]}");
    });

    it("refuses mixed lists, out-of-range numbers and stray text with a position", () => {
        const doc = emptyDoc();
        expect(() => parseSnbt("[1,2L]", doc)).toThrow(/mixed/);
        expect(() => parseSnbt("200b", doc)).toThrow(/range of a byte/);
        expect(() => parseSnbt("{a:1} x", doc)).toThrow(/extra text/);
        expect(() => parseSnbt("{a:", doc)).toThrow(/Expected a value/);
        expect(() => parseSnbt('"open', doc)).toThrow(/closing quote/);
        expect(() => parseSnbt("[B;300]", doc)).toThrow(/range/);
    });

    it("quotes keys and strings that need it and escapes with the fewer quote", () => {
        const doc = emptyDoc();
        const node = parseSnbt('{"has space":"it\'s \\"x\\"","plain":"p"}', doc);
        const text = toSnbt(node);
        expect(text).toBe('{"has space":\'it\\\'s "x"\',plain:"p"}');
        expect(toSnbt(parseSnbt(text, doc))).toBe(text);
    });

    it("pretty prints with indentation", () => {
        const doc = emptyDoc();
        expect(toSnbt(parseSnbt("{a:{b:1},c:[1,2]}", doc), { indent: 2 })).toBe("{\n  a: {\n    b: 1\n  },\n  c: [\n    1,\n    2\n  ]\n}");
    });
});

describe("typed values", () => {
    it("range-checks each integer kind and accepts the SNBT suffix", () => {
        expect(parseScalarText("byte", "127")).toBe(127);
        expect(() => parseScalarText("byte", "128")).toThrow(/range of a byte/);
        expect(parseScalarText("byte", "true")).toBe(1);
        expect(parseScalarText("short", "-32768s")).toBe(-32768);
        expect(() => parseScalarText("short", "32768")).toThrow();
        expect(() => parseScalarText("int", "2147483648")).toThrow();
        expect(parseScalarText("long", "9223372036854775807L")).toBe(9223372036854775807n);
        expect(() => parseScalarText("long", "9223372036854775808")).toThrow();
        expect(() => parseScalarText("int", "1.5")).toThrow(/whole number/);
        expect(parseScalarText("float", "1e3")).toBe(1000);
        expect(() => parseScalarText("float", "1e39")).toThrow(/too large/);
        expect(parseScalarText("double", "-Infinity")).toBe(Number.NEGATIVE_INFINITY);
        expect(() => parseScalarText("double", "abc")).toThrow(/not a number/);
    });
});

describe("editing", () => {
    const fresh = () => new TreeEditor(snbtDoc('{a:1,b:{c:"x",d:[1,2,3]},e:[B;1b,2b],f:5b}'));
    const byPath = (editor: TreeEditor, path: string): NbtNode => {
        for (const [id] of editor.index) if (pathOf(editor.index, id) === path) return editor.index.get(id)!.node;
        throw new Error(`no node at ${path}`);
    };

    it("edits a value of every scalar kind", () => {
        const editor = new TreeEditor(snbtDoc('{b:1b,s:1s,i:1,l:1L,f:1f,d:1d,t:"x"}'));
        const cases: [string, string, string][] = [
            ["b", "9", "9b"],
            ["s", "-3", "-3s"],
            ["i", "42", "42"],
            ["l", "-9007199254740993", "-9007199254740993L"],
            ["f", "2.5", "2.5f"],
            ["d", "0.125", "0.125d"],
            ["t", 'say "hi"', "'say \"hi\"'"],
        ];
        for (const [path, text, printed] of cases) {
            const node = byPath(editor, path);
            editor.setValue(node.id, text);
            expect(toSnbt(node)).toBe(printed);
        }
        expect(() => editor.setValue(byPath(editor, "b").id, "300")).toThrow(/range/);
        expect(() => editor.setValue(editor.doc.root.id, "1")).toThrow();
    });

    it("flips a byte switch", () => {
        const editor = fresh();
        const node = byPath(editor, "f");
        editor.setBool(node.id, false);
        expect(node.value).toBe(0);
    });

    it("renames, refusing a name already used by a sibling", () => {
        const editor = fresh();
        editor.rename(byPath(editor, "a").id, "alpha");
        expect(byPath(editor, "alpha")).toBeTruthy();
        expect(() => editor.rename(byPath(editor, "alpha").id, "b")).toThrow(/already/);
        expect(() => editor.rename(byPath(editor, "b.d[0]").id, "z")).toThrow(/no names/);
    });

    it("adds into a compound and a list, locking the list's element type", () => {
        const editor = fresh();
        const b = byPath(editor, "b");
        editor.add(b.id, "int", "n", "7");
        expect(toSnbt(byPath(editor, "b.n"))).toBe("7");
        expect(() => editor.add(b.id, "int", "n")).toThrow(/already/);
        const list = byPath(editor, "b.d");
        expect(() => editor.add(list.id, "string", "")).toThrow(/holds int/);
        editor.add(list.id, "int", "", "4");
        expect(toSnbt(list)).toBe("[1,2,3,4]");
        const empty = new TreeEditor(snbtDoc("{x:[]}"));
        const x = byPath(empty, "x");
        empty.add(x.id, "string", "", "first");
        expect(x.listKind).toBe("string");
    });

    it("removes, duplicates and keeps ids stable and unique", () => {
        const editor = fresh();
        const before = new Set(editor.index.keys());
        editor.duplicate(byPath(editor, "b").id);
        const copy = byPath(editor, "b copy");
        expect(toSnbt(copy)).toBe(toSnbt(byPath(editor, "b")));
        expect(before.has(copy.id)).toBe(false);
        editor.remove(copy.id);
        expect(() => editor.remove(editor.doc.root.id)).toThrow(/root/);
        expect(editor.index.has(copy.id)).toBe(false);
    });

    it("moves between containers and reorders, refusing a cycle or a type clash", () => {
        const editor = fresh();
        const b = byPath(editor, "b");
        const a = byPath(editor, "a");
        editor.move(a.id, b.id);
        expect(pathOf(editor.index, a.id)).toBe("b.a");
        expect(() => editor.move(b.id, byPath(editor, "b.c").id)).toThrow();
        expect(() => editor.move(b.id, b.id)).toThrow(/inside itself/);
        expect(() => editor.move(byPath(editor, "f").id, byPath(editor, "b.d").id)).toThrow(/holds int/);
        const names = () => editor.doc.root.children!.map((c) => c.name);
        editor.nudge(byPath(editor, "f").id, -1);
        expect(names().indexOf("f")).toBe(names().indexOf("e") - 1);
    });

    it("replaces a subtree from SNBT and adds one from a paste", () => {
        const editor = fresh();
        editor.replaceFromSnbt(byPath(editor, "b").id, "{z:9}");
        expect(toSnbt(byPath(editor, "b"))).toBe("{z:9}");
        expect(byPath(editor, "b").name).toBe("b");
        expect(() => editor.replaceFromSnbt(editor.doc.root.id, "5")).toThrow(/compound/);
        expect(() => editor.replaceFromSnbt(byPath(editor, "b").id, "{oops")).toThrow(NbtError);
        editor.addFromSnbt(editor.doc.root.id, "pasted", "[1.5d]");
        expect(toSnbt(byPath(editor, "pasted"))).toBe("[1.5d]");
    });

    it("edits array elements", () => {
        const editor = fresh();
        const array = byPath(editor, "e");
        editor.arraySet(array.id, 0, "-7");
        editor.arrayInsert(array.id, 2, "3");
        editor.arrayRemove(array.id, 1);
        expect(toSnbt(array)).toBe("[B;-7b,3b]");
        expect(() => editor.arraySet(array.id, 0, "200")).toThrow(/range/);
        expect(() => editor.arraySet(array.id, 9, "1")).toThrow(/does not exist/);
    });

    it("every tag kind can be created", () => {
        const editor = new TreeEditor(emptyDoc());
        for (const kind of TAG_KINDS) editor.add(editor.doc.root.id, kind as TagKind, `k_${kind}`);
        const bytes = writeNbtFile(editor.doc);
        expect(readNbtFile(bytes).root.children).toHaveLength(TAG_KINDS.length);
    });
});

describe("search", () => {
    const root = snbtDoc('{Spawn:{x:1,y:"hello"},Name:"Spawn point",nums:[5,6]}').root;
    const base = { regex: false, flags: "i", names: true, values: true, limit: 50, budgetMs: 200 };

    it("finds names and values case-insensitively", () => {
        const found = searchTree(root, { ...base, query: "spawn" });
        expect(found.ids).toHaveLength(2);
        expect(searchTree(root, { ...base, query: "hello", names: false }).ids).toHaveLength(1);
        expect(searchTree(root, { ...base, query: "Spawn", values: false }).ids).toHaveLength(1);
    });

    it("supports regular expressions and reports a bad one instead of throwing", () => {
        expect(searchTree(root, { ...base, query: "^S.*n$", regex: true, values: false }).ids.length).toBe(1);
        expect(searchTree(root, { ...base, query: "(", regex: true }).error).toMatch(/./);
        expect(searchTree(root, { ...base, query: "x", regex: true, flags: "z" }).error).toMatch(/flags/);
    });

    it("stops at its time budget and at its limit", () => {
        let t = 0;
        const slow = searchTree(root, { ...base, query: "e", budgetMs: 5 }, () => (t += 10));
        expect(slow.timedOut).toBe(true);
        expect(searchTree(root, { ...base, query: "e", limit: 1 }).truncated).toBe(true);
    });
});

describe("semantic diff", () => {
    it("names what changed rather than which bytes moved", () => {
        const a = snbtDoc("{Data:{SpawnX:128,allowCommands:0b,gone:1,list:[1,2]},keep:1}").root;
        const b = snbtDoc("{Data:{SpawnX:256,allowCommands:1b,fresh:2,list:[1,3,4]},keep:1}").root;
        const diff = diffTrees(a, b);
        expect(diff.changes).toEqual(
            expect.arrayContaining([
                { path: "Data.SpawnX", change: "changed", before: "128", after: "256" },
                { path: "Data.allowCommands", change: "changed", before: "0b", after: "1b" },
                { path: "Data.gone", change: "removed", before: "1", after: null },
                { path: "Data.fresh", change: "added", before: null, after: "2" },
                { path: "Data.list[1]", change: "changed", before: "2", after: "3" },
                { path: "Data.list[2]", change: "added", before: null, after: "4" },
            ]),
        );
        expect(diff.changes.some((c) => c.path === "keep")).toBe(false);
        expect(describeChanges(diff, "level.dat")).toMatch(/^Edit .* in level\.dat$/);
    });

    it("is empty for identical trees and caps very large diffs", () => {
        const a = snbtDoc(EVERYTHING).root;
        expect(diffTrees(a, snbtDoc(EVERYTHING).root).changes).toEqual([]);
        const big = snbtDoc(`{${Array.from({ length: 50 }, (_, i) => `k${i}:${i}`).join(",")}}`).root;
        const other = snbtDoc(`{${Array.from({ length: 50 }, (_, i) => `k${i}:${i + 1}`).join(",")}}`).root;
        const capped = diffTrees(big, other, 10);
        expect(capped.changes).toHaveLength(10);
        expect(capped.truncated).toBe(true);
    });
});

describe("region files", () => {
    /** Builds a region with chunks at the given indices, each a tiny compound. */
    function buildRegion(chunks: Record<number, string>, compressionType = 2): Uint8Array {
        const sectors: Uint8Array[] = [];
        const header = new Uint8Array(8192);
        const dv = new DataView(header.buffer);
        let next = 2;
        for (const [index, snbt] of Object.entries(chunks)) {
            const payload = writeNbtPayload(snbtDoc(snbt).root);
            const doc = snbtDoc(snbt, { compression: compressionType === 1 ? "gzip" : compressionType === 2 ? "zlib" : "none" });
            const stored = writeNbtFile(doc);
            void payload;
            const total = 5 + stored.length;
            const count = Math.ceil(total / 4096);
            const sector = new Uint8Array(count * 4096);
            new DataView(sector.buffer).setUint32(0, stored.length + 1, false);
            sector[4] = compressionType;
            sector.set(stored, 5);
            sectors.push(sector);
            dv.setUint32(Number(index) * 4, ((next << 8) | count) >>> 0, false);
            dv.setUint32(4096 + Number(index) * 4, 1700000000 + Number(index), false);
            next += count;
        }
        const out = new Uint8Array(8192 + sectors.reduce((n, s) => n + s.length, 0));
        out.set(header);
        let at = 8192;
        for (const s of sectors) {
            out.set(s, at);
            at += s.length;
        }
        return out;
    }

    it("lists populated chunks with their coordinates, size and compression", () => {
        const region = buildRegion({ 0: "{DataVersion:1}", 33: "{DataVersion:2}" });
        const list = listRegionChunks(region);
        expect(list.map((c) => [c.x, c.z, c.compressionType, c.readable])).toEqual([
            [0, 0, 2, true],
            [1, 1, 2, true],
        ]);
        expect(list[1]!.timestamp).toBe(1700000033);
    });

    it("reads one chunk's NBT and writes it back, leaving every other chunk untouched", () => {
        const region = buildRegion({ 0: "{DataVersion:1}", 33: "{DataVersion:2}" });
        const { payload, compressionType } = readRegionChunk(region, 33);
        const doc = parseNbtPayload(payload);
        expect(toSnbt(doc.root)).toBe("{DataVersion:2}");
        const editor = new TreeEditor({ ...snbtDoc("{}"), root: doc.root, nextId: doc.nextId });
        editor.add(doc.root.id, "string", "added", "x");
        const updated = replaceRegionChunk(region, 33, writeNbtPayload(doc.root), compressionType, 1800000000);
        expect(toSnbt(parseNbtPayload(readRegionChunk(updated, 33).payload).root)).toBe('{DataVersion:2,added:"x"}');
        expect(Array.from(readRegionChunk(updated, 0).payload)).toEqual(Array.from(readRegionChunk(region, 0).payload));
        const before = listRegionChunks(region);
        const after = listRegionChunks(updated);
        expect(after.find((c) => c.index === 0)).toEqual(before.find((c) => c.index === 0));
        expect(after.find((c) => c.index === 33)!.timestamp).toBe(1800000000);
    });

    it("moves a chunk that outgrows its sectors to the end of the file", () => {
        const region = buildRegion({ 0: "{DataVersion:1}", 1: "{DataVersion:2}" }, 3);
        const big = snbtDoc(`{blob:[B;${Array.from({ length: 6000 }, () => "1b").join(",")}]}`);
        const updated = replaceRegionChunk(region, 0, writeNbtPayload(big.root), 3);
        const moved = listRegionChunks(updated).find((c) => c.index === 0)!;
        expect(moved.sector).toBeGreaterThanOrEqual(region.length / 4096);
        expect(moved.sectors).toBe(2);
        expect(updated.length % 4096).toBe(0);
        expect(toSnbt(parseNbtPayload(readRegionChunk(updated, 1).payload).root)).toBe("{DataVersion:2}");
        expect(parseNbtPayload(readRegionChunk(updated, 0).payload).root.children![0]!.value).toHaveLength(6000);
    });

    it("says why an unsupported chunk cannot be opened", () => {
        const region = buildRegion({ 0: "{a:1}" }, 3);
        region[8192 + 4] = 4; // LZ4
        expect(listRegionChunks(region)[0]!.unsupported).toMatch(/LZ4/);
        expect(() => readRegionChunk(region, 0)).toThrow(/LZ4/);
        expect(() => readRegionChunk(region, 5)).toThrow(/not stored/);
    });
});

describe("indexing", () => {
    it("addresses list elements by position", () => {
        const doc = snbtDoc("{a:{b:[{x:10},{c:1}]}}");
        const index = indexTree(doc.root);
        const c = [...index.values()].find((l) => l.node.name === "c")!;
        expect(pathOf(index, c.node.id)).toBe("a.b[1].c");
    });
});
