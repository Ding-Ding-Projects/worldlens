import type { NbtChange, NodeView, TagKind } from "./nbtEditorBridge.js";

/** Every tag type in wire order, for the add-tag picker. */
export const KIND_ORDER: readonly TagKind[] = [
    "byte",
    "short",
    "int",
    "long",
    "float",
    "double",
    "byteArray",
    "string",
    "list",
    "compound",
    "intArray",
    "longArray",
];

/** The name the game uses for each type, as shown on its chip. */
export const KIND_CHIP: Readonly<Record<TagKind, string>> = {
    byte: "BYTE",
    short: "SHORT",
    int: "INT",
    long: "LONG",
    float: "FLOAT",
    double: "DOUBLE",
    byteArray: "BYTE[]",
    string: "STRING",
    list: "LIST",
    compound: "COMPOUND",
    intArray: "INT[]",
    longArray: "LONG[]",
};

/**
 * One hue per type family. Chip colours are mixed from the hue and the theme's own surface and
 * text colours in the stylesheet, so they read in light and dark and keep their contrast; the
 * hue only decides which family a tag belongs to. The label is always printed too, so colour is
 * never the only carrier of the type.
 */
export const KIND_HUE: Readonly<Record<TagKind, string>> = {
    byte: "#FFB68A",
    short: "#8FCDFF",
    int: "#8FCDFF",
    long: "#8FCDFF",
    float: "#FFDF9E",
    double: "#FFDF9E",
    byteArray: "#C7B8F0",
    string: "#7FD19A",
    list: "#D1BFE7",
    compound: "#A9C4DB",
    intArray: "#C7B8F0",
    longArray: "#C7B8F0",
};

const RANGES: Partial<Record<TagKind, { min: bigint; max: bigint }>> = {
    byte: { min: -128n, max: 127n },
    short: { min: -32768n, max: 32767n },
    int: { min: -2147483648n, max: 2147483647n },
    long: { min: -(2n ** 63n), max: 2n ** 63n - 1n },
};

export function isContainer(kind: TagKind): boolean {
    return kind === "list" || kind === "compound";
}

export function isArray(kind: TagKind): boolean {
    return kind === "byteArray" || kind === "intArray" || kind === "longArray";
}

/** Short guidance printed under an editor, such as `-128 to 127`. */
export function rangeHint(kind: TagKind): string {
    const r = RANGES[kind];
    if (r !== undefined) return `${r.min} to ${r.max}`;
    if (kind === "float") return "up to about 3.4e38";
    if (kind === "double") return "any decimal";
    return "";
}

/**
 * Checks typed text before it is sent, so the person sees the mistake as they type. The main
 * process makes the same check again and its answer is the one that counts.
 */
export function validateScalar(kind: TagKind, text: string): string | null {
    const trimmed = text.trim();
    if (kind === "string") return null;
    if (kind === "byte" || kind === "short" || kind === "int" || kind === "long") {
        let source = trimmed;
        if (kind === "byte" && (source === "true" || source === "false")) return null;
        source = source.replace(kind === "byte" ? /[bB]$/u : kind === "short" ? /[sS]$/u : kind === "long" ? /[lL]$/u : /$^/u, "");
        if (!/^[+-]?\d+$/u.test(source)) return "Enter a whole number.";
        const v = BigInt(source);
        const r = RANGES[kind]!;
        return v < r.min || v > r.max ? `Must be between ${r.min} and ${r.max}.` : null;
    }
    if (kind === "float" || kind === "double") {
        const source = trimmed.replace(kind === "float" ? /[fF]$/u : /[dD]$/u, "");
        if (/^[+-]?(NaN|Infinity)$/u.test(source)) return null;
        if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/u.test(source)) return "Enter a number.";
        if (kind === "float" && Math.abs(Number(source)) > 3.4028235e38) return "Too large for a float.";
        return null;
    }
    return null;
}

/* ------------------------------------------------------------------ the loaded tree */

/** How many children are fetched at a time; a compound with more shows a "show more" row. */
export const PAGE_SIZE = 500;

export interface TreeCache {
    nodes: Map<number, NodeView>;
    /** Children loaded so far, in order, by parent id. */
    children: Map<number, number[]>;
    parent: Map<number, number | null>;
    expanded: Set<number>;
}

export function emptyCache(): TreeCache {
    return { nodes: new Map(), children: new Map(), parent: new Map(), expanded: new Set() };
}

export type Row =
    | { readonly type: "node"; readonly id: number; readonly level: number; readonly hasChildren: boolean; readonly expanded: boolean; readonly position: number; readonly setSize: number }
    | { readonly type: "more"; readonly parentId: number; readonly level: number; readonly remaining: number };

/** Flattens the expanded part of the tree into the rows the list renders. */
export function flattenRows(rootId: number, cache: TreeCache): Row[] {
    const rows: Row[] = [];
    const walk = (id: number, level: number, position: number, setSize: number): void => {
        const node = cache.nodes.get(id);
        if (node === undefined) return;
        const open = cache.expanded.has(id);
        rows.push({ type: "node", id, level, hasChildren: node.childCount > 0, expanded: open && node.childCount > 0, position, setSize });
        if (!open) return;
        const loaded = cache.children.get(id) ?? [];
        loaded.forEach((child, i) => walk(child, level + 1, i + 1, node.childCount));
        if (loaded.length < node.childCount) rows.push({ type: "more", parentId: id, level: level + 1, remaining: node.childCount - loaded.length });
    };
    walk(rootId, 1, 1, 1);
    return rows;
}

/** Which rows to render for a scrolled list of fixed-height rows, and the padding that stands in for the rest. */
export function visibleWindow(
    total: number,
    scrollTop: number,
    viewportHeight: number,
    rowHeight: number,
    overscan = 8,
): { start: number; end: number; padTop: number; padBottom: number } {
    if (total === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const last = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
    return { start: first, end: last, padTop: first * rowHeight, padBottom: (total - last) * rowHeight };
}

/* ------------------------------------------------------------------ keyboard */

/** What the row menu and the keyboard can ask the screen to do with a tag. */
export type TagAction = "add" | "rename" | "duplicate" | "up" | "down" | "snbt" | "copy" | "paste" | "remove";

export type TreeKeyAction =
    | { readonly type: "focus"; readonly index: number }
    | { readonly type: "expand"; readonly id: number }
    | { readonly type: "collapse"; readonly id: number }
    | { readonly type: "edit"; readonly id: number }
    | { readonly type: "remove"; readonly id: number }
    | { readonly type: "copy"; readonly id: number }
    | { readonly type: "paste"; readonly id: number }
    | { readonly type: "more"; readonly parentId: number }
    | null;

/**
 * The tree's keyboard contract, as in the ARIA tree pattern: Up and Down move, Right opens a
 * closed branch or steps into it, Left closes an open branch or steps to its parent, Home and
 * End jump, Enter edits, Delete removes, and Ctrl+C / Ctrl+V copy and paste a tag as SNBT.
 */
export function treeKeyAction(
    rows: readonly Row[],
    index: number,
    key: string,
    modifier: boolean,
    parentOf: (id: number) => number | null,
): TreeKeyAction {
    const row = rows[index];
    if (row === undefined) return null;
    const lastIndex = rows.length - 1;
    switch (key) {
        case "ArrowDown":
            return { type: "focus", index: Math.min(lastIndex, index + 1) };
        case "ArrowUp":
            return { type: "focus", index: Math.max(0, index - 1) };
        case "Home":
            return { type: "focus", index: 0 };
        case "End":
            return { type: "focus", index: lastIndex };
        case "ArrowRight":
            if (row.type === "more") return { type: "more", parentId: row.parentId };
            if (row.hasChildren && !row.expanded) return { type: "expand", id: row.id };
            if (row.hasChildren && row.expanded) return { type: "focus", index: Math.min(lastIndex, index + 1) };
            return null;
        case "ArrowLeft": {
            if (row.type === "more") return null;
            if (row.hasChildren && row.expanded) return { type: "collapse", id: row.id };
            const parent = parentOf(row.id);
            if (parent === null) return null;
            const at = rows.findIndex((r) => r.type === "node" && r.id === parent);
            return at >= 0 ? { type: "focus", index: at } : null;
        }
        case "Enter":
        case "F2":
            if (row.type === "more") return { type: "more", parentId: row.parentId };
            return { type: "edit", id: row.id };
        case "Delete":
            return row.type === "node" ? { type: "remove", id: row.id } : null;
        case "c":
        case "C":
            return modifier && row.type === "node" ? { type: "copy", id: row.id } : null;
        case "v":
        case "V":
            return modifier && row.type === "node" ? { type: "paste", id: row.id } : null;
        default:
            return null;
    }
}

/* ------------------------------------------------------------------ misc */

/** `Data.SpawnX: 128 -> 256` style text for one change. */
export function describeChange(change: NbtChange): string {
    const path = change.path === "" ? "(root)" : change.path;
    if (change.change === "added") return `${path}: + ${change.after ?? ""}`;
    if (change.change === "removed") return `${path}: - ${change.before ?? ""}`;
    return `${path}: ${change.before ?? ""} → ${change.after ?? ""}`;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The label of a tag in a row: its name, or its position inside a list. */
export function rowLabel(node: NodeView, position: number): string {
    return node.name !== null ? (node.name === "" ? "(unnamed)" : node.name) : `[${position - 1}]`;
}
