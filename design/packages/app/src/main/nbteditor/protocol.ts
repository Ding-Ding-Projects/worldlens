/**
 * What crosses the channel between the editor service and the interface.
 *
 * Everything here is plain JSON: 64-bit values travel as decimal strings, because a
 * JavaScript number silently rounds past 2^53 and a seed that is nearly right is worse than
 * one that is refused.
 */

import type { Compression, Endianness, NbtChange, RegionChunk, TagKind } from "@worldlens/nbt";

export type { NbtChange, RegionChunk, TagKind };

export interface NodeView {
    readonly id: number;
    readonly kind: TagKind;
    /** `null` for a list element. */
    readonly name: string | null;
    /** What an inline editor shows: the plain value for a scalar, empty for containers. */
    readonly text: string;
    /** A one-line description: `3 x double`, `12 entries`, `[B; 4 values]`. */
    readonly summary: string;
    readonly childCount: number;
    /** For a list, its element type (`end` when empty and undeclared). */
    readonly listKind: TagKind | "end" | null;
    /** A byte that holds 0 or 1 and is shown as a switch. */
    readonly isBool: boolean;
    readonly valueLength: number;
}

export type DocumentLocation =
    | { readonly kind: "file" }
    | { readonly kind: "chunk"; readonly regionPath: string; readonly index: number; readonly x: number; readonly z: number }
    /** A record in a Bedrock world's LevelDB, opened read-only. */
    | { readonly kind: "bedrock"; readonly key: string; readonly label: string };

/** One record in a Bedrock world's database, as listed for opening. */
export interface BedrockRecord {
    readonly key: string;
    readonly label: string;
    readonly group: "chunk" | "player" | "world" | "entity" | "other";
    readonly nbt: boolean;
    readonly size: number;
}

export interface DocumentInfo {
    readonly docId: string;
    readonly title: string;
    readonly path: string;
    readonly projectDir: string;
    /** The key history is recorded under (a path, or a chunk's shadow path). */
    readonly historyPath: string;
    readonly compression: Compression;
    readonly endianness: Endianness;
    readonly bedrock: boolean;
    readonly location: DocumentLocation;
    readonly root: NodeView;
    readonly state: DocumentState;
}

export interface DocumentState {
    readonly dirty: boolean;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    /** How many tags differ from what is on disk. */
    readonly changeCount: number;
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

export type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export interface EditOutcome {
    /** Tags whose own fields or members changed; refresh these. */
    readonly changed: readonly number[];
    /** True when the whole tree should be reloaded (undo, redo, replacing the root). */
    readonly refreshAll: boolean;
    readonly select: number | null;
    readonly state: DocumentState;
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

export interface SaveRequest {
    /** Commit message; a default is generated from the changes when empty. */
    readonly message?: string;
    /** Copy the file aside before overwriting it. Defaults to true. */
    readonly backup?: boolean;
}

export interface SaveOutcome {
    readonly message: string;
    readonly commit: { readonly sha: string; readonly shortSha: string; readonly message: string } | null;
    readonly backupPath: string | null;
    readonly state: DocumentState;
}

export interface HistoryEntryView {
    readonly sha: string;
    readonly shortSha: string;
    readonly time: number;
    readonly message: string;
    readonly files: readonly string[];
}

export interface DiffOutcome {
    readonly changes: readonly NbtChange[];
    readonly truncated: boolean;
    /** True when this is the first recorded version of the file, so there is nothing before it. */
    readonly isFirst: boolean;
}

export interface ChunkListing {
    readonly path: string;
    readonly chunks: readonly RegionChunk[];
}
