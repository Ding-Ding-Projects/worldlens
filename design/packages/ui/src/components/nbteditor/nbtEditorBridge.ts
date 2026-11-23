/**
 * The NBT editor bridge as the interface sees it; null outside the desktop app.
 *
 * These shapes mirror `packages/app/src/main/nbteditor/protocol.ts`. The interface does not
 * import from the main process, so the two are kept in step by the channel tests there and
 * the fake bridge tests here.
 */

export type TagKind =
    | "byte"
    | "short"
    | "int"
    | "long"
    | "float"
    | "double"
    | "byteArray"
    | "string"
    | "list"
    | "compound"
    | "intArray"
    | "longArray";

export interface NodeView {
    readonly id: number;
    readonly kind: TagKind;
    readonly name: string | null;
    readonly text: string;
    readonly summary: string;
    readonly childCount: number;
    readonly listKind: TagKind | "end" | null;
    readonly isBool: boolean;
    readonly valueLength: number;
}

export type DocumentLocation =
    | { readonly kind: "file" }
    | { readonly kind: "chunk"; readonly regionPath: string; readonly index: number; readonly x: number; readonly z: number }
    | { readonly kind: "bedrock"; readonly key: string; readonly label: string };

export interface DocumentState {
    readonly dirty: boolean;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly changeCount: number;
}

export interface DocumentInfo {
    readonly docId: string;
    readonly title: string;
    readonly path: string;
    readonly projectDir: string;
    readonly historyPath: string;
    readonly compression: "gzip" | "zlib" | "none";
    readonly endianness: "big" | "little";
    readonly bedrock: boolean;
    readonly location: DocumentLocation;
    readonly root: NodeView;
    readonly state: DocumentState;
}

export interface ProjectFile {
    readonly relativePath: string;
    readonly name: string;
    readonly group: string;
    readonly kind: "dat" | "nbt" | "region";
    readonly size: number;
}

export interface ProjectListing {
    readonly projectDir: string;
    readonly files: readonly ProjectFile[];
    readonly truncated: boolean;
}

export interface RegionChunk {
    readonly index: number;
    readonly x: number;
    readonly z: number;
    readonly size: number;
    readonly compressionType: number;
    readonly timestamp: number;
    readonly readable: boolean;
    readonly unsupported: string | null;
}

export interface BedrockRecord {
    readonly key: string;
    readonly label: string;
    readonly group: "chunk" | "player" | "world" | "entity" | "other";
    readonly nbt: boolean;
    readonly size: number;
}

export interface ChildrenPage {
    readonly total: number;
    readonly nodes: readonly NodeView[];
}

export interface ArrayPage {
    readonly total: number;
    readonly offset: number;
    readonly values: readonly string[];
    readonly kind: TagKind;
}

export interface EditOutcome {
    readonly changed: readonly number[];
    readonly refreshAll: boolean;
    readonly select: number | null;
    readonly state: DocumentState;
}

export type EditOperation =
    | { readonly op: "setValue"; readonly id: number; readonly text: string }
    | { readonly op: "setBool"; readonly id: number; readonly on: boolean }
    | { readonly op: "rename"; readonly id: number; readonly name: string }
    | { readonly op: "remove"; readonly id: number }
    | { readonly op: "add"; readonly parentId: number; readonly kind: TagKind; readonly name: string; readonly text?: string; readonly at?: number }
    | { readonly op: "duplicate"; readonly id: number }
    | { readonly op: "move"; readonly id: number; readonly parentId: number; readonly at?: number }
    | { readonly op: "nudge"; readonly id: number; readonly direction: -1 | 1 }
    | { readonly op: "replaceSnbt"; readonly id: number; readonly text: string }
    | { readonly op: "addSnbt"; readonly parentId: number; readonly name: string; readonly text: string; readonly at?: number }
    | { readonly op: "arraySet"; readonly id: number; readonly at: number; readonly text: string }
    | { readonly op: "arrayInsert"; readonly id: number; readonly at: number; readonly text: string }
    | { readonly op: "arrayRemove"; readonly id: number; readonly at: number };

/** The array edits, without the tag id the screen supplies. */
export type ArrayEdit =
    | { readonly op: "arraySet"; readonly at: number; readonly text: string }
    | { readonly op: "arrayInsert"; readonly at: number; readonly text: string }
    | { readonly op: "arrayRemove"; readonly at: number };

export interface SearchRequest {
    readonly query: string;
    readonly regex: boolean;
    readonly flags: string;
    readonly names: boolean;
    readonly values: boolean;
}

export interface SearchHit {
    readonly id: number;
    readonly path: string;
    readonly kind: TagKind;
    readonly preview: string;
}

export interface SearchOutcome {
    readonly hits: readonly SearchHit[];
    readonly error: string | null;
    readonly truncated: boolean;
    readonly timedOut: boolean;
}

export interface NbtChange {
    readonly path: string;
    readonly change: "added" | "removed" | "changed";
    readonly before: string | null;
    readonly after: string | null;
}

export interface DiffOutcome {
    readonly changes: readonly NbtChange[];
    readonly truncated: boolean;
    readonly isFirst: boolean;
}

export interface SaveOutcome {
    readonly message: string;
    readonly commit: { readonly sha: string; readonly shortSha: string; readonly message: string } | null;
    readonly backupPath: string | null;
    readonly state: DocumentState;
}

export interface HistoryEntry {
    readonly sha: string;
    readonly shortSha: string;
    readonly time: number;
    readonly message: string;
    readonly files: readonly string[];
}

export type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export interface NbtEditorBridge {
    listProject(projectDir: string): Promise<Answer<ProjectListing>>;
    inferProject(file: string): Promise<Answer<string>>;
    worldStatus(projectDir: string): Promise<Answer<{ writable: boolean; reason: string | null }>>;
    listChunks(file: string): Promise<Answer<{ path: string; chunks: readonly RegionChunk[] }>>;
    /** A Bedrock world's records, read from its LevelDB `db` folder. Absent in older builds. */
    listBedrock?(worldDir: string): Promise<Answer<{ records: readonly BedrockRecord[]; problems: readonly string[] }>>;
    openBedrockRecord?(worldDir: string, key: string): Promise<Answer<DocumentInfo>>;
    pickFile(): Promise<Answer<string | null>>;
    openFile(file: string, options?: { projectDir?: string; endianness?: "big" | "little" }): Promise<Answer<DocumentInfo>>;
    openChunk(file: string, index: number, options?: { projectDir?: string }): Promise<Answer<DocumentInfo>>;
    describe(docId: string): Promise<Answer<DocumentInfo>>;
    close(docId: string): Promise<Answer<void>>;
    node(docId: string, id: number): Promise<Answer<NodeView>>;
    children(docId: string, id: number, offset: number, limit: number): Promise<Answer<ChildrenPage>>;
    arrayPage(docId: string, id: number, offset: number, limit: number): Promise<Answer<ArrayPage>>;
    snbt(docId: string, id: number, pretty: boolean): Promise<Answer<{ text: string; truncated: boolean }>>;
    ancestors(docId: string, id: number): Promise<Answer<readonly number[]>>;
    search(docId: string, request: SearchRequest): Promise<Answer<SearchOutcome>>;
    pendingChanges(docId: string): Promise<Answer<{ changes: readonly NbtChange[]; truncated: boolean }>>;
    defaultMessage(docId: string): Promise<Answer<string>>;
    edit(docId: string, operation: EditOperation): Promise<Answer<EditOutcome>>;
    undo(docId: string): Promise<Answer<EditOutcome>>;
    redo(docId: string): Promise<Answer<EditOutcome>>;
    save(docId: string, request?: { message?: string; backup?: boolean }): Promise<Answer<SaveOutcome>>;
    history(projectDir: string, historyPath: string | null): Promise<Answer<readonly HistoryEntry[]>>;
    diffCommit(projectDir: string, historyPath: string, sha: string): Promise<Answer<DiffOutcome>>;
    diffCurrent(docId: string, sha: string): Promise<Answer<DiffOutcome>>;
    restore(docId: string, sha: string, backup?: boolean): Promise<Answer<DocumentInfo>>;
}

export function nbtEditorBridge(): NbtEditorBridge | null {
    return (globalThis.window as unknown as { worldlens?: { nbtEditor?: NbtEditorBridge } } | undefined)?.worldlens?.nbtEditor ?? null;
}
