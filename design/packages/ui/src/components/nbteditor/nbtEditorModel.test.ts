import { describe, expect, it } from "vitest";
import {
    KIND_CHIP,
    KIND_ORDER,
    PAGE_SIZE,
    emptyCache,
    flattenRows,
    rangeHint,
    treeKeyAction,
    validateScalar,
    visibleWindow,
    type Row,
} from "./nbtEditorModel.js";
import type { NodeView, TagKind } from "./nbtEditorBridge.js";

function node(id: number, kind: TagKind, name: string | null, childCount = 0): NodeView {
    return { id, kind, name, text: "", summary: "", childCount, listKind: null, isBool: false, valueLength: 0 };
}

function cacheOf() {
    const cache = emptyCache();
    const add = (n: NodeView, parent: number | null, kids: number[] = []) => {
        cache.nodes.set(n.id, n);
        cache.parent.set(n.id, parent);
        if (kids.length > 0) cache.children.set(n.id, kids);
    };
    add(node(1, "compound", "", 2), null, [2, 5]);
    add(node(2, "compound", "Data", 2), 1, [3, 4]);
    add(node(3, "int", "SpawnX"), 2);
    add(node(4, "string", "Name"), 2);
    add(node(5, "double", "Health"), 1);
    return cache;
}

describe("type metadata", () => {
    it("labels every tag type exactly once", () => {
        expect(KIND_ORDER).toHaveLength(12);
        expect(new Set(KIND_ORDER.map((k) => KIND_CHIP[k])).size).toBe(12);
    });
});

describe("value validation", () => {
    it("checks each integer type against its range and says what the range is", () => {
        expect(validateScalar("byte", "127")).toBeNull();
        expect(validateScalar("byte", "128")).toMatch(/-128 and 127/);
        expect(validateScalar("byte", "true")).toBeNull();
        expect(validateScalar("short", "-32769")).toMatch(/Must be between/);
        expect(validateScalar("int", "2147483647")).toBeNull();
        expect(validateScalar("int", "2147483648")).not.toBeNull();
        expect(validateScalar("long", "9223372036854775807")).toBeNull();
        expect(validateScalar("long", "9223372036854775808")).not.toBeNull();
        expect(validateScalar("int", "1.5")).toBe("Enter a whole number.");
        expect(rangeHint("short")).toBe("-32768 to 32767");
    });

    it("accepts decimals, exponents and the special values for floats", () => {
        expect(validateScalar("float", "1.5e3")).toBeNull();
        expect(validateScalar("double", "NaN")).toBeNull();
        expect(validateScalar("double", "-Infinity")).toBeNull();
        expect(validateScalar("float", "1e39")).toBe("Too large for a float.");
        expect(validateScalar("double", "abc")).toBe("Enter a number.");
        expect(validateScalar("string", "anything at all")).toBeNull();
    });
});

describe("flattening the tree", () => {
    it("lists only the expanded branches, with ARIA positions", () => {
        const cache = cacheOf();
        cache.expanded.add(1);
        let rows = flattenRows(1, cache);
        expect(rows.map((r) => (r.type === "node" ? r.id : -1))).toEqual([1, 2, 5]);
        expect(rows[1]).toMatchObject({ level: 2, position: 1, setSize: 2, hasChildren: true, expanded: false });
        cache.expanded.add(2);
        rows = flattenRows(1, cache);
        expect(rows.map((r) => (r.type === "node" ? r.id : -1))).toEqual([1, 2, 3, 4, 5]);
        expect(rows[2]).toMatchObject({ level: 3, position: 1, setSize: 2 });
    });

    it("adds a show-more row when a branch has unloaded children", () => {
        const cache = cacheOf();
        cache.nodes.set(2, node(2, "compound", "Data", PAGE_SIZE + 3));
        cache.expanded.add(1);
        cache.expanded.add(2);
        const rows = flattenRows(1, cache);
        const more = rows.find((r) => r.type === "more");
        expect(more).toMatchObject({ parentId: 2, remaining: PAGE_SIZE + 1 });
    });
});

describe("virtualisation window", () => {
    it("renders only the visible rows plus a margin, and pads for the rest", () => {
        const w = visibleWindow(100000, 38 * 5000, 600, 38, 8);
        expect(w.end - w.start).toBeLessThan(40);
        expect(w.padTop).toBe(w.start * 38);
        expect(w.padBottom).toBe((100000 - w.end) * 38);
        expect(w.padTop + (w.end - w.start) * 38 + w.padBottom).toBe(100000 * 38);
    });

    it("handles an empty list and the very top and bottom", () => {
        expect(visibleWindow(0, 0, 600, 38)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
        expect(visibleWindow(10, 0, 600, 38).start).toBe(0);
        expect(visibleWindow(10, 99999, 600, 38).end).toBe(10);
    });
});

describe("tree keyboard", () => {
    const cache = cacheOf();
    cache.expanded.add(1);
    cache.expanded.add(2);
    const rows = flattenRows(1, cache);
    const parentOf = (id: number) => cache.parent.get(id) ?? null;
    const key = (index: number, k: string, mod = false) => treeKeyAction(rows, index, k, mod, parentOf);

    it("moves with the arrows, Home and End", () => {
        expect(key(0, "ArrowDown")).toEqual({ type: "focus", index: 1 });
        expect(key(1, "ArrowUp")).toEqual({ type: "focus", index: 0 });
        expect(key(0, "ArrowUp")).toEqual({ type: "focus", index: 0 });
        expect(key(2, "Home")).toEqual({ type: "focus", index: 0 });
        expect(key(2, "End")).toEqual({ type: "focus", index: rows.length - 1 });
        expect(key(rows.length - 1, "ArrowDown")).toEqual({ type: "focus", index: rows.length - 1 });
    });

    it("opens, closes and steps through branches like the ARIA tree pattern", () => {
        const collapsed = emptyCache();
        for (const [k, v] of cache.nodes) collapsed.nodes.set(k, v);
        for (const [k, v] of cache.parent) collapsed.parent.set(k, v);
        for (const [k, v] of cache.children) collapsed.children.set(k, v);
        collapsed.expanded.add(1);
        const closedRows = flattenRows(1, collapsed);
        expect(treeKeyAction(closedRows, 1, "ArrowRight", false, parentOf)).toEqual({ type: "expand", id: 2 });
        expect(key(1, "ArrowRight")).toEqual({ type: "focus", index: 2 });
        expect(key(1, "ArrowLeft")).toEqual({ type: "collapse", id: 2 });
        expect(key(2, "ArrowLeft")).toEqual({ type: "focus", index: 1 });
        expect(key(2, "ArrowRight")).toBeNull();
        expect(key(0, "ArrowLeft")).toEqual({ type: "collapse", id: 1 });
    });

    it("edits, removes, copies and pastes", () => {
        expect(key(2, "Enter")).toEqual({ type: "edit", id: 3 });
        expect(key(2, "F2")).toEqual({ type: "edit", id: 3 });
        expect(key(2, "Delete")).toEqual({ type: "remove", id: 3 });
        expect(key(2, "c", true)).toEqual({ type: "copy", id: 3 });
        expect(key(2, "v", true)).toEqual({ type: "paste", id: 3 });
        expect(key(2, "c", false)).toBeNull();
        expect(key(2, "x")).toBeNull();
    });

    it("loads more from the show-more row", () => {
        const more: Row[] = [{ type: "more", parentId: 2, level: 3, remaining: 5 }];
        expect(treeKeyAction(more, 0, "Enter", false, parentOf)).toEqual({ type: "more", parentId: 2 });
        expect(treeKeyAction(more, 0, "ArrowRight", false, parentOf)).toEqual({ type: "more", parentId: 2 });
        expect(treeKeyAction(more, 0, "Delete", false, parentOf)).toBeNull();
    });
});
