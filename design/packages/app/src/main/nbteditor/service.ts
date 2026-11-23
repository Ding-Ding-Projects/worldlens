import { randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { lz4BlockCompress, lz4BlockDecompress } from "@worldlens/engine";
import {
    MAX_INLINE_CHUNK_BYTES,
    compressPayload,
    decompressPayload,
    diffTrees,
    externalChunkName,
    describeBedrockKey,
    listRegionChunks,
    parseNbtPayload,
    readLevelDb,
    readNbtFile,
    regionCoordinates,
    storedRegionChunk,
    writeStoredRegionChunk,
    writeNbtFile,
    writeNbtPayload,
    type Endianness,
    type NbtDocument,
} from "@worldlens/nbt";
import { ProjectHistory, chunkHistoryPath, type HistoryCommit } from "./history.js";
import {
    inferProjectDir,
    listProjectFiles,
    relativeInside,
    type ProjectListing,
} from "./project.js";
import type {
    ArrayPage,
    ChildrenPage,
    ChunkListing,
    DiffOutcome,
    BedrockRecord,
    DocumentInfo,
    DocumentLocation,
    EditOperation,
    EditOutcome,
    HistoryEntryView,
    NbtChange,
    NodeView,
    SaveOutcome,
    SaveRequest,
    SearchOutcome,
    SearchRequest,
} from "./protocol.js";
import { EditorSession, viewOf } from "./session.js";
import {
    backUpFile,
    fileSignature,
    probeSessionLock,
    writeFileAtomically,
    type WorldInUseCheck,
} from "./safety.js";

/* ------------------------------------------------------------ region chunk codecs */

/** Region chunks this service can open: gzip, zlib, none, LZ4 and external `.mcc` chunks. */
const REGION_SUPPORT = { lz4: true, external: true } as const;

function chunkCompression(base: number): "gzip" | "zlib" | "none" {
    return base === 1 ? "gzip" : base === 2 ? "zlib" : "none";
}

/** Where an external chunk of this region lives, or null for a region file with an unusual name. */
function externalPath(regionPath: string, index: number): string | null {
    const coords = regionCoordinates(basename(regionPath));
    return coords === null
        ? null
        : join(dirname(regionPath), externalChunkName(coords.x, coords.z, index));
}

/** The uncompressed NBT payload of one chunk, following it into its `.mcc` file when needed. */
async function readChunkPayload(
    regionPath: string,
    bytes: Uint8Array,
    index: number,
): Promise<{ payload: Uint8Array; compressionType: number }> {
    const { compressionType, stored, external } = storedRegionChunk(bytes, index);
    let body = stored;
    if (external) {
        const path = externalPath(regionPath, index);
        if (path === null)
            throw new NbtEditorRefusal(
                "This chunk is stored in a separate .mcc file, but the region file's name does not say which.",
            );
        const info = await stat(path).catch(() => null);
        if (info === null || !info.isFile())
            throw new NbtEditorRefusal(
                `This chunk is stored in ${basename(path)}, which is missing.`,
            );
        body = new Uint8Array(await readFile(path));
    }
    const base = compressionType & 0x7f;
    const payload =
        base === 4
            ? new Uint8Array(await lz4BlockDecompress(body))
            : decompressPayload(body, chunkCompression(base));
    return { payload, compressionType };
}

/** Compresses a chunk the way it was stored (same method), moving it to or from a `.mcc` file by size. */
async function encodeChunk(
    payload: Uint8Array,
    compressionType: number,
): Promise<{ body: Uint8Array; type: number; external: boolean }> {
    const base = compressionType & 0x7f;
    const body =
        base === 4
            ? new Uint8Array(await lz4BlockCompress(payload))
            : compressPayload(payload, chunkCompression(base));
    const external = body.length > MAX_INLINE_CHUNK_BYTES;
    return { body, type: external ? base | 0x80 : base, external };
}

/** A refusal whose message is meant to be shown to the person as it is. */
export class NbtEditorRefusal extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NbtEditorRefusal";
    }
}

export interface NbtEditorServiceOptions {
    /** Directory under which every project's history repository lives. */
    readonly historyRoot: string;
    readonly history?: ProjectHistory;
    /** Returns a reason when writing to the world must be refused; null when it is free. */
    readonly worldInUse?: WorldInUseCheck;
}

const MAX_FILE_BYTES = 1024 * 1024 * 1024;

interface Entry {
    readonly docId: string;
    session: EditorSession;
    readonly path: string;
    readonly projectDir: string;
    readonly relativePath: string;
    readonly location: DocumentLocation;
    readonly historyPath: string;
    /** For a chunk: the region file's compression byte for this chunk. */
    compressionType: number;
    signature: string;
    readonly subject: string;
}

export class NbtEditorService {
    private readonly docs = new Map<string, Entry>();
    readonly history: ProjectHistory;
    private readonly worldInUse: WorldInUseCheck;

    constructor(options: NbtEditorServiceOptions) {
        this.history = options.history ?? new ProjectHistory({ root: options.historyRoot });
        this.worldInUse = options.worldInUse ?? probeSessionLock;
    }

    /* ------------------------------------------------------------ project and files */

    async listProject(projectDir: string): Promise<ProjectListing> {
        return listProjectFiles(projectDir);
    }

    async inferProject(file: string): Promise<string> {
        return inferProjectDir(file);
    }

    /** Whether saving to this world is allowed right now, with the reason when it is not. */
    async worldStatus(projectDir: string): Promise<{ writable: boolean; reason: string | null }> {
        const reason = await this.worldInUse(projectDir);
        return { writable: reason === null, reason };
    }

    async listChunks(path: string): Promise<ChunkListing> {
        const bytes = await this.readBounded(path);
        return { path, chunks: listRegionChunks(bytes, REGION_SUPPORT) };
    }

    /* ------------------------------------------------------------ Bedrock */

    /** Reads a Bedrock world's `db` folder (tables and logs) into memory, newest value per key. */
    private async bedrockEntries(
        worldDir: string,
    ): Promise<{ entries: { key: Uint8Array; value: Uint8Array }[]; problems: string[] }> {
        const db = join(resolve(worldDir), "db");
        const names = await readdir(db).catch(() => null);
        if (names === null)
            throw new NbtEditorRefusal(
                "That folder has no db folder, so it is not a Bedrock world.",
            );
        const files = new Map<string, Uint8Array>();
        let total = 0;
        for (const name of names) {
            if (!/\.(ldb|sst|log)$/i.test(name)) continue;
            const bytes = await this.readBounded(join(db, name));
            total += bytes.length;
            if (total > MAX_FILE_BYTES)
                throw new NbtEditorRefusal(
                    "That Bedrock world's database is larger than 1 GB, which this editor does not open.",
                );
            files.set(name, bytes);
        }
        return readLevelDb(files);
    }

    async listBedrock(worldDir: string): Promise<{ records: BedrockRecord[]; problems: string[] }> {
        const { entries, problems } = await this.bedrockEntries(worldDir);
        const records = entries.map((e) => {
            const d = describeBedrockKey(e.key);
            return {
                key: Buffer.from(e.key).toString("hex"),
                label: d.label,
                group: d.group,
                nbt: d.nbt,
                size: e.value.length,
            };
        });
        return { records, problems };
    }

    /** Opens one NBT record read-only. Several concatenated compounds open as a list. */
    async openBedrockRecord(worldDir: string, keyHex: string): Promise<DocumentInfo> {
        if (!/^([0-9a-f]{2}){1,512}$/.test(keyHex))
            throw new NbtEditorRefusal("That is not a Bedrock record key.");
        const { entries } = await this.bedrockEntries(worldDir);
        const found = entries.find((e) => Buffer.from(e.key).toString("hex") === keyHex);
        if (found === undefined)
            throw new NbtEditorRefusal("That record is no longer in the world.");
        const label = describeBedrockKey(found.key).label;
        const parsed = parseNbtPayload(found.value, "little");
        const doc: NbtDocument = {
            root: parsed.root,
            endianness: "little",
            compression: "none",
            bedrockHeader: null,
            trailing: parsed.trailing,
            nextId: parsed.nextId,
        };
        const projectDir = resolve(worldDir);
        return this.register({
            session: new EditorSession(doc),
            path: join(projectDir, "db"),
            projectDir,
            relativePath: "db",
            location: { kind: "bedrock", key: keyHex, label },
            historyPath: `db/${keyHex}`,
            compressionType: 0,
            signature: "",
            subject: label,
        });
    }

    private async readBounded(path: string): Promise<Uint8Array> {
        const info = await stat(path).catch(() => null);
        if (info === null || !info.isFile())
            throw new NbtEditorRefusal("That file does not exist.");
        if (info.size > MAX_FILE_BYTES)
            throw new NbtEditorRefusal(
                "That file is larger than 1 GB, which this editor does not open.",
            );
        return new Uint8Array(await readFile(path));
    }

    /* ------------------------------------------------------------ opening */

    async openFile(
        path: string,
        options: { projectDir?: string; endianness?: Endianness } = {},
    ): Promise<DocumentInfo> {
        const full = resolve(path);
        if (full.toLowerCase().endsWith(".mca"))
            throw new NbtEditorRefusal("That is a region file. Choose one of its chunks to edit.");
        const projectDir =
            options.projectDir === undefined
                ? await inferProjectDir(full)
                : resolve(options.projectDir);
        const relativePath = relativeInside(projectDir, full) ?? basename(full);
        const bytes = await this.readBounded(full);
        const doc = readNbtFile(
            bytes,
            options.endianness === undefined ? {} : { endianness: options.endianness },
        );
        return this.register({
            session: new EditorSession(doc),
            path: full,
            projectDir,
            relativePath,
            location: { kind: "file" },
            historyPath: relativePath,
            compressionType: 0,
            signature: await fileSignature(full),
            subject: basename(full),
        });
    }

    async openChunk(
        path: string,
        index: number,
        options: { projectDir?: string } = {},
    ): Promise<DocumentInfo> {
        const full = resolve(path);
        if (!regionCoordinates(basename(full)) && !full.toLowerCase().endsWith(".mca"))
            throw new NbtEditorRefusal("That is not a region file.");
        const projectDir =
            options.projectDir === undefined
                ? await inferProjectDir(full)
                : resolve(options.projectDir);
        const relativePath = relativeInside(projectDir, full) ?? basename(full);
        const bytes = await this.readBounded(full);
        const { payload, compressionType } = await readChunkPayload(full, bytes, index);
        const parsed = parseNbtPayload(payload, "big");
        const doc: NbtDocument = {
            root: parsed.root,
            endianness: "big",
            compression: "none",
            bedrockHeader: null,
            trailing: parsed.trailing,
            nextId: parsed.nextId,
        };
        const x = index % 32;
        const z = Math.floor(index / 32);
        return this.register({
            session: new EditorSession(doc),
            path: full,
            projectDir,
            relativePath,
            location: { kind: "chunk", regionPath: relativePath, index, x, z },
            historyPath: chunkHistoryPath(relativePath, x, z),
            compressionType,
            signature: await fileSignature(full),
            subject: `chunk ${x}, ${z} of ${basename(full)}`,
        });
    }

    private register(fields: Omit<Entry, "docId">): DocumentInfo {
        const entry: Entry = { docId: randomUUID(), ...fields };
        this.docs.set(entry.docId, entry);
        return this.info(entry);
    }

    private info(entry: Entry): DocumentInfo {
        const doc = entry.session.doc;
        return {
            docId: entry.docId,
            title: entry.subject,
            path: entry.path,
            projectDir: entry.projectDir,
            historyPath: entry.historyPath,
            compression: doc.compression,
            endianness: doc.endianness,
            bedrock: doc.bedrockHeader !== null,
            location: entry.location,
            root: viewOf(doc.root),
            state: entry.session.state(),
        };
    }

    private entry(docId: string): Entry {
        const entry = this.docs.get(docId);
        if (entry === undefined) throw new NbtEditorRefusal("That document is no longer open.");
        return entry;
    }

    describe(docId: string): DocumentInfo {
        return this.info(this.entry(docId));
    }

    close(docId: string): void {
        this.docs.delete(docId);
    }

    openDocuments(): readonly string[] {
        return [...this.docs.keys()];
    }

    /* ------------------------------------------------------------ reading the tree */

    node(docId: string, id: number): NodeView {
        return this.entry(docId).session.view(id);
    }

    children(docId: string, id: number, offset: number, limit: number): ChildrenPage {
        return this.entry(docId).session.children(id, offset, limit);
    }

    arrayPage(docId: string, id: number, offset: number, limit: number): ArrayPage {
        return this.entry(docId).session.arrayPage(id, offset, limit);
    }

    snbt(docId: string, id: number, pretty: boolean): { text: string; truncated: boolean } {
        return this.entry(docId).session.snbt(id, pretty);
    }

    ancestors(docId: string, id: number): number[] {
        return this.entry(docId).session.ancestors(id);
    }

    pathOf(docId: string, id: number): string {
        return this.entry(docId).session.pathOf(id);
    }

    search(docId: string, request: SearchRequest): SearchOutcome {
        return this.entry(docId).session.search(request);
    }

    pendingChanges(docId: string): { changes: readonly NbtChange[]; truncated: boolean } {
        return this.entry(docId).session.pendingChanges();
    }

    defaultMessage(docId: string): string {
        const entry = this.entry(docId);
        return entry.session.defaultMessage(entry.subject);
    }

    /* ------------------------------------------------------------ editing */

    edit(docId: string, operation: EditOperation): EditOutcome {
        return this.entry(docId).session.apply(operation);
    }

    undo(docId: string): EditOutcome {
        return this.entry(docId).session.undo();
    }

    redo(docId: string): EditOutcome {
        return this.entry(docId).session.redo();
    }

    /* ------------------------------------------------------------ saving */

    async save(docId: string, request: SaveRequest = {}): Promise<SaveOutcome> {
        const entry = this.entry(docId);
        const session = entry.session;
        if (!session.state().dirty) throw new NbtEditorRefusal("There are no changes to save.");
        const message = (request.message ?? "").trim() || session.defaultMessage(entry.subject);
        const outcome = await this.writeThrough(entry, message, request.backup !== false, () =>
            this.currentBytes(entry),
        );
        session.markSaved();
        return { ...outcome, state: session.state() };
    }

    private currentBytes(entry: Entry): { file: Uint8Array | null; chunk: Uint8Array | null } {
        const doc = entry.session.doc;
        return entry.location.kind === "chunk"
            ? { file: null, chunk: writeNbtPayload(doc.root, "big", doc.trailing) }
            : { file: writeNbtFile(doc), chunk: null };
    }

    /**
     * The shared write path for a save and a restore: refuse a live world and a file that
     * changed under the editor, back up, write atomically, then record the commit (recording
     * the file's previous content first when this is its first commit, so it can be restored).
     */
    private async writeThrough(
        entry: Entry,
        message: string,
        backup: boolean,
        produce: () => { file: Uint8Array | null; chunk: Uint8Array | null },
    ): Promise<Omit<SaveOutcome, "state">> {
        if (entry.location.kind === "bedrock")
            throw new NbtEditorRefusal(
                "Bedrock records open read-only for now: saving would mean writing LevelDB, which this editor does not do yet.",
            );
        const live = await this.worldInUse(entry.projectDir);
        if (live !== null) throw new NbtEditorRefusal(live);
        const signature = await fileSignature(entry.path).catch(() => null);
        if (signature !== entry.signature)
            throw new NbtEditorRefusal(
                "The file changed on disk after it was opened. Reopen it so its newer contents are not overwritten.",
            );
        const produced = produce();
        const onDisk = await this.readBounded(entry.path);
        let newFileBytes: Uint8Array;
        let previousRecorded: Uint8Array;
        let externalWrite: { path: string; bytes: Uint8Array } | null = null;
        if (entry.location.kind === "chunk") {
            if (produced.chunk === null) throw new NbtEditorRefusal("Nothing to write.");
            previousRecorded = (await readChunkPayload(entry.path, onDisk, entry.location.index))
                .payload;
            const encoded = await encodeChunk(produced.chunk, entry.compressionType);
            if (encoded.external) {
                // Too large for the region's own sectors: the game keeps such a chunk in c.<x>.<z>.mcc
                // and records only its compression byte (plus 128) in the region file.
                const target = externalPath(entry.path, entry.location.index);
                if (target === null)
                    throw new NbtEditorRefusal(
                        "This chunk is now too large for the region file, and the region file's name does not say where its .mcc file belongs.",
                    );
                externalWrite = { path: target, bytes: encoded.body };
                newFileBytes = writeStoredRegionChunk(
                    onDisk,
                    entry.location.index,
                    new Uint8Array(0),
                    encoded.type,
                );
            } else {
                newFileBytes = writeStoredRegionChunk(
                    onDisk,
                    entry.location.index,
                    encoded.body,
                    encoded.type,
                );
            }
        } else {
            if (produced.file === null) throw new NbtEditorRefusal("Nothing to write.");
            previousRecorded = onDisk;
            newFileBytes = produced.file;
        }
        const recordedNew = entry.location.kind === "chunk" ? produced.chunk! : produced.file!;

        let backupPath: string | null = null;
        if (backup)
            backupPath = await backUpFile(
                entry.path,
                this.history.backupDirectory(entry.projectDir),
                entry.relativePath.replace(/[\\/]/gu, "__"),
            );
        // Record the starting point before touching the world, so a failure here leaves the file alone.
        if (!(await this.history.hasHistory(entry.projectDir, entry.historyPath)))
            await this.history.record(
                entry.projectDir,
                entry.historyPath,
                previousRecorded,
                `Baseline: ${entry.subject} as first opened`,
            );
        // The .mcc file first: a region that points at an external chunk must never exist before it.
        if (externalWrite !== null)
            await writeFileAtomically(externalWrite.path, externalWrite.bytes);
        await writeFileAtomically(entry.path, newFileBytes);
        entry.signature = await fileSignature(entry.path);
        const commit = await this.history.record(
            entry.projectDir,
            entry.historyPath,
            recordedNew,
            message,
        );
        return {
            message:
                commit === null
                    ? "Saved. The content matched the last recorded version, so no history entry was added."
                    : `Saved and recorded as ${commit.shortSha}.`,
            commit:
                commit === null
                    ? null
                    : { sha: commit.sha, shortSha: commit.shortSha, message: commit.message },
            backupPath,
        };
    }

    /* ------------------------------------------------------------ history */

    async listHistory(projectDir: string, historyPath: string | null): Promise<HistoryEntryView[]> {
        return (await this.history.list(resolve(projectDir), historyPath)).map(toView);
    }

    /** A semantic comparison of one commit with the version recorded before it. */
    async diffCommit(projectDir: string, historyPath: string, sha: string): Promise<DiffOutcome> {
        const dir = resolve(projectDir);
        const after = await this.history.read(dir, sha, historyPath);
        const parent = await this.history.parentVersion(dir, sha, historyPath);
        const emptyRoot = readNbtFile(writeNbtFile(emptyDocument())).root;
        const before =
            parent === null
                ? emptyRoot
                : readNbtFile(await this.history.read(dir, parent.sha, historyPath)).root;
        const diff = diffTrees(before, readNbtFile(after).root);
        return { changes: diff.changes, truncated: diff.truncated, isFirst: parent === null };
    }

    /** Compares a recorded version with what the open document holds now. */
    async diffAgainstCurrent(docId: string, sha: string): Promise<DiffOutcome> {
        const entry = this.entry(docId);
        const recorded = readNbtFile(
            await this.history.read(entry.projectDir, sha, entry.historyPath),
        );
        const diff = diffTrees(recorded.root, entry.session.doc.root);
        return { changes: diff.changes, truncated: diff.truncated, isFirst: false };
    }

    /**
     * Writes an earlier version back as a new commit (history is never rewritten) and reloads
     * the open document from it.
     */
    async restore(docId: string, sha: string, backup = true): Promise<DocumentInfo> {
        const entry = this.entry(docId);
        const recorded = await this.history.read(entry.projectDir, sha, entry.historyPath);
        // Parse it first: a damaged blob must be refused before the world is touched.
        const doc = readNbtFile(recorded);
        const short = sha.slice(0, 7);
        const produced =
            entry.location.kind === "chunk"
                ? { file: null, chunk: recorded }
                : { file: recorded, chunk: null };
        await this.writeThrough(
            entry,
            `Restore ${entry.subject} to ${short}`,
            backup,
            () => produced,
        );
        if (entry.location.kind === "chunk") {
            const parsed = parseNbtPayload(recorded, "big");
            entry.session = new EditorSession({
                ...doc,
                root: parsed.root,
                trailing: parsed.trailing,
                nextId: parsed.nextId,
                endianness: "big",
                compression: "none",
                bedrockHeader: null,
            });
        } else {
            entry.session = new EditorSession(doc);
        }
        return this.info(entry);
    }
}

function toView(commit: HistoryCommit): HistoryEntryView {
    return {
        sha: commit.sha,
        shortSha: commit.shortSha,
        time: commit.time,
        message: commit.message,
        files: commit.files,
    };
}

function emptyDocument(): NbtDocument {
    return {
        root: {
            id: 1,
            kind: "compound",
            name: "",
            value: null,
            children: [],
            listKind: null,
            rawName: null,
            rawText: null,
            rawBits: null,
        },
        endianness: "big",
        compression: "none",
        bedrockHeader: null,
        trailing: new Uint8Array(),
        nextId: 2,
    };
}
