import type {
    Answer,
    ArrayPage,
    ChildrenPage,
    DocumentInfo,
    DocumentState,
    EditOperation,
    EditOutcome,
    HistoryEntry,
    NbtEditorBridge,
    NodeView,
    TagKind,
} from "../nbtEditorBridge.js";

/** A tiny in-memory stand-in for the main process: one document, a real little tree, and a call log. */

interface FakeNode {
    id: number;
    kind: TagKind;
    name: string | null;
    text: string;
    children: FakeNode[];
    values?: string[];
    listKind?: TagKind | "end";
}

const ok = <T>(value: T): Promise<Answer<T>> => Promise.resolve({ ok: true, value });
const refuse = (message: string): Promise<Answer<never>> => Promise.resolve({ ok: false, message });

export interface FakeBridge extends NbtEditorBridge {
    readonly calls: string[];
    readonly edits: EditOperation[];
    readonly saves: { message?: string | undefined; backup?: boolean | undefined }[];
    world: { writable: boolean; reason: string | null };
    historyEntries: HistoryEntry[];
}

function leaf(id: number, kind: TagKind, name: string | null, text: string): FakeNode {
    return { id, kind, name, text, children: [] };
}

export function makeTree(): FakeNode {
    return {
        id: 1,
        kind: "compound",
        name: "",
        text: "",
        children: [
            {
                id: 2,
                kind: "compound",
                name: "Data",
                text: "",
                children: [
                    leaf(3, "string", "LevelName", "Example survival"),
                    leaf(4, "int", "SpawnX", "128"),
                    leaf(5, "byte", "allowCommands", "0"),
                    {
                        id: 6,
                        kind: "compound",
                        name: "GameRules",
                        text: "",
                        children: [leaf(7, "byte", "doDaylightCycle", "1")],
                    },
                    { id: 8, kind: "longArray", name: "Heightmap", text: "", children: [], values: ["1", "2", "3"] },
                ],
            },
            leaf(9, "double", "Health", "20.0"),
        ],
    };
}

function view(node: FakeNode): NodeView {
    const isArray = node.kind.endsWith("Array");
    return {
        id: node.id,
        kind: node.kind,
        name: node.name,
        text: node.kind === "compound" || node.kind === "list" || isArray ? "" : node.text,
        summary: node.kind === "compound" ? `${node.children.length} entries` : isArray ? `${node.values?.length ?? 0} values` : "",
        childCount: node.children.length,
        listKind: node.kind === "list" ? (node.listKind ?? "end") : null,
        isBool: node.kind === "byte" && (node.text === "0" || node.text === "1"),
        valueLength: node.values?.length ?? 0,
    };
}

export function createFakeBridge(): FakeBridge {
    const root = makeTree();
    let dirty = false;
    let next = 100;
    const calls: string[] = [];
    const edits: EditOperation[] = [];
    const saves: { message?: string | undefined; backup?: boolean | undefined }[] = [];
    const find = (id: number, from: FakeNode = root, parent: FakeNode | null = null): { node: FakeNode; parent: FakeNode | null } | null => {
        if (from.id === id) return { node: from, parent };
        for (const child of from.children) {
            const hit = find(id, child, from);
            if (hit) return hit;
        }
        return null;
    };
    const state = (): DocumentState => ({ dirty, canUndo: dirty, canRedo: false, changeCount: dirty ? 1 : 0 });
    const info = (): DocumentInfo => ({
        docId: "doc-1",
        title: "level.dat",
        path: "C:/world/level.dat",
        projectDir: "C:/world",
        historyPath: "level.dat",
        compression: "gzip",
        endianness: "big",
        bedrock: false,
        location: { kind: "file" },
        root: view(root),
        state: state(),
    });

    const extras = {
        calls,
        edits,
        saves,
        world: { writable: true, reason: null } as { writable: boolean; reason: string | null },
        historyEntries: [{ sha: "a41c2e0aaaa", shortSha: "a41c2e0", time: 1_700_000_000, message: "Baseline: level.dat as first opened", files: ["level.dat"] }] as HistoryEntry[],
    };
    const methods: NbtEditorBridge = {
        listProject: async (dir) => (calls.push(`listProject ${dir}`), ok({ projectDir: dir, truncated: false, files: [{ relativePath: "level.dat", name: "level.dat", group: "(world folder)", kind: "dat" as const, size: 1200 }, { relativePath: "region/r.0.0.mca", name: "r.0.0.mca", group: "region", kind: "region" as const, size: 8192 }] })),
        inferProject: async () => ok("C:/world"),
        worldStatus: async () => ok(bridge.world),
        listChunks: async (file) => ok({ path: file, chunks: [{ index: 0, x: 0, z: 0, size: 100, compressionType: 2, timestamp: 1, readable: true, unsupported: null }] }),
        pickFile: async () => ok("C:/other/servers.dat"),
        openFile: async (file) => (calls.push(`openFile ${file}`), ok(info())),
        openChunk: async (file, index) => (calls.push(`openChunk ${file} ${index}`), ok({ ...info(), location: { kind: "chunk" as const, regionPath: "region/r.0.0.mca", index, x: 0, z: 0 } })),
        describe: async () => ok(info()),
        close: async (doc) => (calls.push(`close ${doc}`), ok(undefined)),
        node: async (_doc, id) => {
            const hit = find(id);
            return hit ? ok(view(hit.node)) : refuse("That tag no longer exists.");
        },
        children: async (_doc, id, offset, limit): Promise<Answer<ChildrenPage>> => {
            const hit = find(id);
            if (!hit) return refuse("That tag no longer exists.");
            return { ok: true, value: { total: hit.node.children.length, nodes: hit.node.children.slice(offset, offset + limit).map(view) } };
        },
        arrayPage: async (_doc, id, offset, limit): Promise<Answer<ArrayPage>> => {
            const hit = find(id);
            const values = hit?.node.values ?? [];
            return { ok: true, value: { total: values.length, offset, values: values.slice(offset, offset + limit), kind: hit?.node.kind ?? "intArray" } };
        },
        snbt: async (_doc, id) => ok({ text: `{fake:${id}}`, truncated: false }),
        ancestors: async (_doc, id) => {
            const path: number[] = [];
            const walk = (node: FakeNode, trail: number[]): boolean => {
                if (node.id === id) {
                    path.push(...trail);
                    return true;
                }
                return node.children.some((c) => walk(c, [...trail, node.id]));
            };
            walk(root, []);
            return ok(path);
        },
        search: async (_doc, request) => {
            calls.push(`search ${request.query} regex=${request.regex}`);
            const hits: { id: number; path: string; kind: TagKind; preview: string }[] = [];
            const needle = request.query.toLowerCase();
            const walk = (node: FakeNode, path: string): void => {
                if (node.name && node.name.toLowerCase().includes(needle)) hits.push({ id: node.id, path, kind: node.kind, preview: node.text });
                for (const c of node.children) walk(c, path === "" ? (c.name ?? "") : `${path}.${c.name ?? ""}`);
            };
            walk(root, "");
            return ok({ hits, error: null, truncated: false, timedOut: false });
        },
        pendingChanges: async () => ok({ changes: [{ path: "Data.SpawnX", change: "changed" as const, before: "128", after: "256" }], truncated: false }),
        defaultMessage: async () => ok("Edit Data.SpawnX in level.dat"),
        edit: async (_doc, operation): Promise<Answer<EditOutcome>> => {
            edits.push(operation);
            if (operation.op === "setValue") {
                const hit = find(operation.id);
                if (!hit) return refuse("That tag no longer exists.");
                if (hit.node.kind === "int" && !/^-?\d+$/.test(operation.text)) return refuse(`"${operation.text}" is not a whole number.`);
                hit.node.text = operation.text;
                dirty = true;
                return { ok: true, value: { changed: [operation.id], refreshAll: false, select: operation.id, state: state() } };
            }
            if (operation.op === "setBool") {
                const hit = find(operation.id);
                if (hit) hit.node.text = operation.on ? "1" : "0";
                dirty = true;
                return { ok: true, value: { changed: [operation.id], refreshAll: false, select: operation.id, state: state() } };
            }
            if (operation.op === "remove") {
                const hit = find(operation.id);
                if (!hit?.parent) return refuse("The root compound cannot be removed.");
                hit.parent.children = hit.parent.children.filter((c) => c.id !== operation.id);
                dirty = true;
                return { ok: true, value: { changed: [hit.parent.id], refreshAll: false, select: hit.parent.id, state: state() } };
            }
            if (operation.op === "add") {
                const parent = find(operation.parentId)?.node;
                if (!parent) return refuse("That tag no longer exists.");
                if (parent.children.some((c) => c.name === operation.name)) return refuse(`There is already a tag called "${operation.name}" here.`);
                const created = leaf(next++, operation.kind, operation.name, operation.text ?? "0");
                parent.children.push(created);
                dirty = true;
                return { ok: true, value: { changed: [operation.parentId], refreshAll: false, select: created.id, state: state() } };
            }
            if (operation.op === "arraySet") {
                const hit = find(operation.id);
                if (hit?.node.values) hit.node.values[operation.at] = operation.text;
                dirty = true;
                return { ok: true, value: { changed: [operation.id], refreshAll: false, select: operation.id, state: state() } };
            }
            return refuse("Not supported by the fake.");
        },
        undo: async () => ok({ changed: [], refreshAll: true, select: null, state: state() }),
        redo: async () => ok({ changed: [], refreshAll: true, select: null, state: state() }),
        save: async (_doc, request) => {
            saves.push({ message: request?.message, backup: request?.backup });
            if (!bridge.world.writable) return refuse(bridge.world.reason ?? "busy");
            dirty = false;
            bridge.historyEntries = [{ sha: "b52d3f1bbbb", shortSha: "b52d3f1", time: 1_700_000_100, message: request?.message || "Saved", files: ["level.dat"] }, ...bridge.historyEntries];
            return ok({ message: "Saved and recorded as b52d3f1.", commit: { sha: "b52d3f1bbbb", shortSha: "b52d3f1", message: request?.message ?? "" }, backupPath: null, state: state() });
        },
        history: async () => ok(bridge.historyEntries),
        diffCommit: async () => ok({ changes: [{ path: "Data.SpawnX", change: "changed" as const, before: "128", after: "256" }], truncated: false, isFirst: false }),
        diffCurrent: async () => ok({ changes: [], truncated: false, isFirst: false }),
        restore: async () => ok(info()),
    };
    const bridge = Object.assign(methods, extras) as FakeBridge;
    return bridge;
}
