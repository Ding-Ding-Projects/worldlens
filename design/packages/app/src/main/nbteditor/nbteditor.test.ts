import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    createNode,
    listRegionChunks,
    parseNbtPayload,
    parseSnbt,
    readNbtFile,
    readRegionChunk,
    toSnbt,
    writeNbtFile,
    type NbtDocument,
} from "@worldlens/nbt";
import { NBT_EDITOR_CHANNELS, registerNbtEditorHandlers } from "./ipc.js";
import { chunkHistoryPath, projectKey } from "./history.js";
import { combineWorldChecks, probeSessionLock } from "./safety.js";
import { NbtEditorRefusal, NbtEditorService } from "./service.js";
import type { Answer, DocumentInfo } from "./protocol.js";

function documentFrom(snbt: string, extra: Partial<NbtDocument> = {}): NbtDocument {
    const doc: NbtDocument = {
        root: null as never,
        endianness: "big",
        compression: "gzip",
        bedrockHeader: null,
        trailing: new Uint8Array(),
        nextId: 1,
        ...extra,
    };
    doc.root = createNode(doc, "compound", "");
    doc.root = parseSnbt(snbt, doc, "");
    return doc;
}

function regionWith(chunks: Record<number, string>): Uint8Array {
    const header = new Uint8Array(8192);
    const dv = new DataView(header.buffer);
    const bodies: Uint8Array[] = [];
    let next = 2;
    for (const [index, snbt] of Object.entries(chunks)) {
        const stored = writeNbtFile(documentFrom(snbt, { compression: "zlib" }));
        const count = Math.ceil((5 + stored.length) / 4096);
        const body = new Uint8Array(count * 4096);
        new DataView(body.buffer).setUint32(0, stored.length + 1, false);
        body[4] = 2;
        body.set(stored, 5);
        bodies.push(body);
        dv.setUint32(Number(index) * 4, ((next << 8) | count) >>> 0, false);
        dv.setUint32(4096 + Number(index) * 4, 1700000000, false);
        next += count;
    }
    const out = new Uint8Array(8192 + bodies.reduce((n, b) => n + b.length, 0));
    out.set(header);
    let at = 8192;
    for (const b of bodies) {
        out.set(b, at);
        at += b.length;
    }
    return out;
}

let scratch: string;
let world: string;
let historyRoot: string;
let inUse: string | null;
let service: NbtEditorService;

const LEVEL = "{Data:{LevelName:\"Example survival\",SpawnX:128,SpawnY:71,SpawnZ:-112,allowCommands:0b,GameRules:{doDaylightCycle:1b},Pos:[1.0d,2.0d,3.0d]}}";

beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "worldlens-nbt-"));
    world = join(scratch, "world");
    historyRoot = join(scratch, "history");
    inUse = null;
    await mkdir(join(world, "playerdata"), { recursive: true });
    await mkdir(join(world, "region"), { recursive: true });
    await writeFile(join(world, "level.dat"), writeNbtFile(documentFrom(LEVEL)));
    await writeFile(join(world, "playerdata", "abc.dat"), writeNbtFile(documentFrom("{Health:20.0f}")));
    await writeFile(join(world, "region", "r.0.0.mca"), regionWith({ 0: "{DataVersion:1,Status:\"full\"}", 33: "{DataVersion:2}" }));
    service = new NbtEditorService({ historyRoot, worldInUse: () => inUse });
});

afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
});

async function onDisk(relative: string) {
    return readNbtFile(new Uint8Array(await readFile(join(world, relative))));
}

function nodeNamed(info: DocumentInfo, service_: NbtEditorService, path: string[]): number {
    let id = info.root.id;
    for (const name of path) {
        const page = service_.children(info.docId, id, 0, 2000);
        const found = page.nodes.find((n) => n.name === name);
        if (found === undefined) throw new Error(`no ${name}`);
        id = found.id;
    }
    return id;
}

describe("opening", () => {
    it("lists the world's NBT files and region files", async () => {
        const listing = await service.listProject(world);
        expect(listing.files.map((f) => f.relativePath)).toEqual(["level.dat", "playerdata/abc.dat", "region/r.0.0.mca"]);
        expect(listing.files[2]!.kind).toBe("region");
    });

    it("opens a file with its project inferred from level.dat and reports its wrapping", async () => {
        const info = await service.openFile(join(world, "playerdata", "abc.dat"));
        expect(info.projectDir.toLowerCase()).toBe(world.toLowerCase());
        expect(info.compression).toBe("gzip");
        expect(info.endianness).toBe("big");
        expect(info.historyPath).toBe("playerdata/abc.dat");
        expect(info.state).toEqual({ dirty: false, canUndo: false, canRedo: false, changeCount: 0 });
    });

    it("refuses to open a region file as a whole and lists its chunks instead", async () => {
        await expect(service.openFile(join(world, "region", "r.0.0.mca"))).rejects.toThrow(/Choose one of its chunks/);
        const listing = await service.listChunks(join(world, "region", "r.0.0.mca"));
        expect(listing.chunks.map((c) => [c.x, c.z])).toEqual([
            [0, 0],
            [1, 1],
        ]);
    });
});

describe("saving with history", () => {
    it("records a baseline and the edit, writes the file, and keeps a backup", async () => {
        const info = await service.openFile(join(world, "level.dat"));
        const spawnX = nodeNamed(info, service, ["Data", "SpawnX"]);
        const edited = service.edit(info.docId, { op: "setValue", id: spawnX, text: "256" });
        expect(edited.state.dirty).toBe(true);
        expect(edited.state.changeCount).toBe(1);
        expect(service.defaultMessage(info.docId)).toBe("Edit Data.SpawnX in level.dat");

        const saved = await service.save(info.docId, { message: "Move spawn to the village square" });
        expect(saved.commit?.message).toBe("Move spawn to the village square");
        expect(saved.state.dirty).toBe(false);
        expect(saved.backupPath).not.toBeNull();
        expect(toSnbt((await onDisk("level.dat")).root)).toContain("SpawnX:256");

        const history = await service.listHistory(world, "level.dat");
        expect(history.map((h) => h.message)).toEqual(["Move spawn to the village square", "Baseline: level.dat as first opened"]);
        expect(history[0]!.files).toEqual(["level.dat"]);
        expect(await readdir(join(historyRoot, projectKey(world), "backups"))).toHaveLength(1);
    });

    it("never touches a file that was opened and not changed", async () => {
        const before = await readFile(join(world, "level.dat"));
        const info = await service.openFile(join(world, "level.dat"));
        await expect(service.save(info.docId)).rejects.toThrow(/no changes/);
        expect(Buffer.compare(await readFile(join(world, "level.dat")), before)).toBe(0);
        expect(await service.listHistory(world, null)).toEqual([]);
    });

    it("generates a message when none is given", async () => {
        const info = await service.openFile(join(world, "level.dat"));
        service.edit(info.docId, { op: "setBool", id: nodeNamed(info, service, ["Data", "allowCommands"]), on: true });
        const saved = await service.save(info.docId);
        expect(saved.commit?.message).toBe("Edit Data.allowCommands in level.dat");
    });

    it("skips the backup when asked", async () => {
        const info = await service.openFile(join(world, "level.dat"));
        service.edit(info.docId, { op: "setValue", id: nodeNamed(info, service, ["Data", "SpawnY"]), text: "80" });
        const saved = await service.save(info.docId, { backup: false });
        expect(saved.backupPath).toBeNull();
    });

    it("refuses to write while a server has the world open, and changes nothing", async () => {
        const info = await service.openFile(join(world, "level.dat"));
        service.edit(info.docId, { op: "setValue", id: nodeNamed(info, service, ["Data", "SpawnY"]), text: "80" });
        inUse = "A managed server is running this world.";
        const before = await readFile(join(world, "level.dat"));
        await expect(service.save(info.docId, { message: "x" })).rejects.toThrow(/managed server is running/);
        expect(Buffer.compare(await readFile(join(world, "level.dat")), before)).toBe(0);
        expect(await service.listHistory(world, null)).toEqual([]);
        expect(await service.worldStatus(world)).toEqual({ writable: false, reason: "A managed server is running this world." });
        // The edit is still there, ready to save when the server stops.
        inUse = null;
        await service.save(info.docId, { message: "later" });
        expect(toSnbt((await onDisk("level.dat")).root)).toContain("SpawnY:80");
    });

    it("refuses to overwrite a file that changed after it was opened", async () => {
        const info = await service.openFile(join(world, "level.dat"));
        service.edit(info.docId, { op: "setValue", id: nodeNamed(info, service, ["Data", "SpawnY"]), text: "80" });
        await writeFile(join(world, "level.dat"), writeNbtFile(documentFrom("{Data:{SpawnY:1,extra:\"newer\"}}")));
        await expect(service.save(info.docId, { message: "x" })).rejects.toThrow(/changed on disk/);
        expect(toSnbt((await onDisk("level.dat")).root)).toContain("newer");
    });
});

describe("history", () => {
    async function twoSaves() {
        const info = await service.openFile(join(world, "level.dat"));
        const spawnX = nodeNamed(info, service, ["Data", "SpawnX"]);
        const allow = nodeNamed(info, service, ["Data", "allowCommands"]);
        service.edit(info.docId, { op: "setValue", id: spawnX, text: "256" });
        service.edit(info.docId, { op: "setBool", id: allow, on: true });
        await service.save(info.docId, { message: "first" });
        service.edit(info.docId, { op: "setValue", id: spawnX, text: "999" });
        await service.save(info.docId, { message: "second" });
        return info;
    }

    it("shows a semantic diff, not a binary one", async () => {
        const info = await twoSaves();
        const history = await service.listHistory(world, "level.dat");
        const first = history.find((h) => h.message === "first")!;
        const diff = await service.diffCommit(world, "level.dat", first.sha);
        expect(diff.isFirst).toBe(false);
        expect(diff.changes).toEqual(
            expect.arrayContaining([
                { path: "Data.SpawnX", change: "changed", before: "128", after: "256" },
                { path: "Data.allowCommands", change: "changed", before: "0b", after: "1b" },
            ]),
        );
        expect(diff.changes).toHaveLength(2);
        const against = await service.diffAgainstCurrent(info.docId, first.sha);
        expect(against.changes).toEqual([{ path: "Data.SpawnX", change: "changed", before: "256", after: "999" }]);
    });

    it("restores an earlier version as a new commit and reloads the document", async () => {
        const info = await twoSaves();
        const history = await service.listHistory(world, "level.dat");
        const baseline = history.find((h) => h.message.startsWith("Baseline"))!;
        const restored = await service.restore(info.docId, baseline.sha);
        expect(restored.state.dirty).toBe(false);
        const text = toSnbt((await onDisk("level.dat")).root);
        expect(text).toContain("SpawnX:128");
        expect(text).toContain("allowCommands:0b");
        const after = await service.listHistory(world, "level.dat");
        expect(after).toHaveLength(history.length + 1);
        expect(after[0]!.message).toMatch(/^Restore level\.dat to /);
        // Earlier commits are all still there: nothing was rewritten.
        expect(after.slice(1).map((h) => h.sha)).toEqual(history.map((h) => h.sha));
        const reopened = service.node(info.docId, nodeNamed(info, service, ["Data", "SpawnX"]));
        expect(reopened.text).toBe("128");
    });

    it("refuses to restore while the world is in use", async () => {
        const info = await twoSaves();
        const history = await service.listHistory(world, "level.dat");
        inUse = "busy";
        await expect(service.restore(info.docId, history[history.length - 1]!.sha)).rejects.toThrow(NbtEditorRefusal);
    });

    it("lists project-wide history across files", async () => {
        await twoSaves();
        const player = await service.openFile(join(world, "playerdata", "abc.dat"));
        service.edit(player.docId, { op: "setValue", id: nodeNamed(player, service, ["Health"]), text: "10" });
        await service.save(player.docId, { message: "wound" });
        const all = await service.listHistory(world, null);
        expect(all.map((h) => h.message)).toContain("wound");
        expect(new Set(all.flatMap((h) => h.files))).toEqual(new Set(["level.dat", "playerdata/abc.dat"]));
    });
});

describe("region chunks", () => {
    it("edits one chunk, leaves the others, and records the chunk's own history", async () => {
        const file = join(world, "region", "r.0.0.mca");
        const otherBefore = readRegionChunk(new Uint8Array(await readFile(file)), 0).payload;
        const info = await service.openChunk(file, 33);
        expect(info.location).toMatchObject({ kind: "chunk", index: 33, x: 1, z: 1 });
        expect(info.historyPath).toBe(chunkHistoryPath("region/r.0.0.mca", 1, 1));
        service.edit(info.docId, { op: "add", parentId: info.root.id, kind: "string", name: "Marker", text: "edited" });
        const saved = await service.save(info.docId, { message: "Mark the chunk" });
        expect(saved.commit).not.toBeNull();

        const bytes = new Uint8Array(await readFile(file));
        expect(toSnbt(parseNbtPayload(readRegionChunk(bytes, 33).payload).root)).toBe('{DataVersion:2,Marker:"edited"}');
        expect(Array.from(readRegionChunk(bytes, 0).payload)).toEqual(Array.from(otherBefore));
        expect(listRegionChunks(bytes)).toHaveLength(2);

        const history = await service.listHistory(world, info.historyPath);
        expect(history.map((h) => h.message)).toEqual(["Mark the chunk", "Baseline: chunk 1, 1 of r.0.0.mca as first opened"]);
        const diff = await service.diffCommit(world, info.historyPath, history[0]!.sha);
        expect(diff.changes).toEqual([{ path: "Marker", change: "added", before: null, after: '"edited"' }]);
    });

    it("restores a chunk to an earlier version inside the region file", async () => {
        const file = join(world, "region", "r.0.0.mca");
        const info = await service.openChunk(file, 33);
        service.edit(info.docId, { op: "setValue", id: nodeNamed(info, service, ["DataVersion"]), text: "77" });
        await service.save(info.docId, { message: "bump" });
        const history = await service.listHistory(world, info.historyPath);
        await service.restore(info.docId, history[history.length - 1]!.sha);
        const bytes = new Uint8Array(await readFile(file));
        expect(toSnbt(parseNbtPayload(readRegionChunk(bytes, 33).payload).root)).toBe("{DataVersion:2}");
    });

    it("refuses a chunk save while the world is in use", async () => {
        const info = await service.openChunk(join(world, "region", "r.0.0.mca"), 0);
        service.edit(info.docId, { op: "setValue", id: nodeNamed(info, service, ["DataVersion"]), text: "5" });
        inUse = "busy";
        await expect(service.save(info.docId)).rejects.toThrow(/busy/);
    });
});

describe("undo and redo", () => {
    it("tracks cleanliness by revision, so undoing back to disk reads as clean", async () => {
        const info = await service.openFile(join(world, "level.dat"));
        const spawnX = nodeNamed(info, service, ["Data", "SpawnX"]);
        expect(service.edit(info.docId, { op: "setValue", id: spawnX, text: "1" }).state.dirty).toBe(true);
        const undone = service.undo(info.docId);
        expect(undone.state).toMatchObject({ dirty: false, canUndo: false, canRedo: true });
        expect(undone.refreshAll).toBe(true);
        expect(service.node(info.docId, spawnX).text).toBe("128");
        expect(service.redo(info.docId).state.dirty).toBe(true);
        expect(service.node(info.docId, spawnX).text).toBe("1");
        // A new edit after an undo discards the redo branch.
        service.undo(info.docId);
        service.edit(info.docId, { op: "setValue", id: spawnX, text: "2" });
        expect(service.redo(info.docId).state.canRedo).toBe(false);
    });

    it("a refused edit leaves the tree and the undo stack exactly as they were", async () => {
        const info = await service.openFile(join(world, "level.dat"));
        const spawnX = nodeNamed(info, service, ["Data", "SpawnX"]);
        expect(() => service.edit(info.docId, { op: "setValue", id: spawnX, text: "99999999999" })).toThrow(/range of a int/);
        expect(() => service.edit(info.docId, { op: "rename", id: spawnX, name: "SpawnY" })).toThrow(/already/);
        expect(() => service.edit(info.docId, { op: "replaceSnbt", id: spawnX, text: "{" })).toThrow();
        const state = service.describe(info.docId).state;
        expect(state).toEqual({ dirty: false, canUndo: false, canRedo: false, changeCount: 0 });
        expect(service.node(info.docId, spawnX).text).toBe("128");
    });
});

describe("reading the tree", () => {
    it("pages children, arrays and SNBT, and finds tags with their ancestors", async () => {
        const info = await service.openFile(join(world, "level.dat"));
        const data = nodeNamed(info, service, ["Data"]);
        const page = service.children(info.docId, data, 0, 2);
        expect(page.total).toBe(7);
        expect(page.nodes).toHaveLength(2);
        const pos = nodeNamed(info, service, ["Data", "Pos"]);
        expect(service.node(info.docId, pos)).toMatchObject({ kind: "list", summary: "3 × double", listKind: "double" });
        expect(service.snbt(info.docId, pos, false).text).toBe("[1.0d,2.0d,3.0d]");
        const hits = service.search(info.docId, { query: "spawn", regex: false, flags: "i", names: true, values: false });
        expect(hits.hits.map((h) => h.path)).toEqual(["Data.SpawnX", "Data.SpawnY", "Data.SpawnZ"]);
        expect(service.ancestors(info.docId, hits.hits[0]!.id)).toEqual([info.root.id, data]);
        const regexHits = service.search(info.docId, { query: "^Spawn[XZ]$", regex: true, flags: "", names: true, values: false });
        expect(regexHits.hits).toHaveLength(2);
        expect(service.node(info.docId, nodeNamed(info, service, ["Data", "allowCommands"])).isBool).toBe(true);
    });

    it("keeps 64-bit values exact across the boundary", async () => {
        await writeFile(join(world, "big.dat"), writeNbtFile(documentFrom("{Seed:-4172144997902289642L}")));
        const info = await service.openFile(join(world, "big.dat"));
        expect(service.node(info.docId, nodeNamed(info, service, ["Seed"])).text).toBe("-4172144997902289642");
    });
});

describe("the live-world check", () => {
    it("finds no lock when there is no session.lock, and honours the application's running servers", async () => {
        expect(await probeSessionLock(world)).toBeNull();
        await writeFile(join(world, "session.lock"), "");
        expect(await probeSessionLock(world)).toBeNull();
        const check = combineWorldChecks(() => [join(scratch, "elsewhere"), world]);
        expect(await check(world)).toMatch(/managed server/);
        expect(await check(join(world, "region"))).toMatch(/managed server/);
        expect(await combineWorldChecks(() => [join(scratch, "elsewhere")])(world)).toBeNull();
    });
});

describe("channels", () => {
    function fakeIpc() {
        const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
        return {
            handlers,
            ipc: {
                handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => void handlers.set(channel, fn),
                removeHandler: (channel: string) => void handlers.delete(channel),
            },
        };
    }

    it("registers every channel once and removes them again", () => {
        const { handlers, ipc } = fakeIpc();
        const registered = registerNbtEditorHandlers(ipc as never, { service, pickFile: async () => null });
        expect([...handlers.keys()].sort()).toEqual([...NBT_EDITOR_CHANNELS].sort());
        registered.dispose();
        expect(handlers.size).toBe(0);
    });

    it("answers refusals as values and never throws across the boundary", async () => {
        const { handlers, ipc } = fakeIpc();
        registerNbtEditorHandlers(ipc as never, { service, pickFile: async () => null });
        const call = async <T>(channel: string, ...args: unknown[]): Promise<Answer<T>> => (await handlers.get(channel)!({}, ...args)) as Answer<T>;
        const opened = await call<DocumentInfo>("nbtEditor:openFile", join(world, "level.dat"));
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        const spawnX = nodeNamed(opened.value, service, ["Data", "SpawnX"]);
        const bad = await call("nbtEditor:edit", opened.value.docId, { op: "setValue", id: spawnX, text: "banana" });
        expect(bad).toEqual({ ok: false, message: '"banana" is not a whole number.' });
        expect(await call("nbtEditor:edit", opened.value.docId, { op: "launchMissiles" })).toMatchObject({ ok: false });
        expect(await call("nbtEditor:openFile", 42)).toMatchObject({ ok: false });
        expect(await call("nbtEditor:openChunk", join(world, "region", "r.0.0.mca"), 99999)).toMatchObject({ ok: false });
        const good = await call("nbtEditor:edit", opened.value.docId, { op: "setValue", id: spawnX, text: "5" });
        expect(good.ok).toBe(true);
        inUse = "busy";
        expect(await call("nbtEditor:save", opened.value.docId, { message: "m" })).toEqual({ ok: false, message: "busy" });
    });
});
