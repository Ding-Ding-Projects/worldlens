import { describe, expect, it } from "vitest";
import {
    JsonHistory,
    addChild,
    dropNullsDeep,
    duplicateAt,
    flatten,
    getAt,
    moveAt,
    parseLenient,
    pathKey,
    removeAt,
    renameKey,
    retype,
    setAt,
    sortKeysDeep,
    tableFor,
    validateAgainstSchema,
    type Json,
} from "./jsonDocModel.js";

const doc: Json = { b: 1, a: { x: [1, 2] }, list: [{ n: "one" }, { n: "two", extra: true }] };

describe("edits", () => {
    it("sets and removes without touching the original", () => {
        const changed = setAt(doc, ["a", "x", 0], 9);
        expect(getAt(changed, ["a", "x", 0])).toBe(9);
        expect(getAt(doc, ["a", "x", 0])).toBe(1);
        expect(getAt(removeAt(doc, ["b"]), ["b"])).toBeUndefined();
        expect(getAt(removeAt(doc, ["a", "x", 0]), ["a", "x"])).toEqual([2]);
    });

    it("renames a key in place and refuses a clash or empty name", () => {
        const result = renameKey(doc, ["b"], "c");
        expect(result.ok && Object.keys(result.root as object)).toEqual(["c", "a", "list"]);
        expect(renameKey(doc, ["b"], "a")).toMatchObject({ ok: false });
        expect(renameKey(doc, ["b"], "")).toMatchObject({ ok: false });
        expect(renameKey(doc, ["a", "x", 0], "q")).toMatchObject({ ok: false });
    });

    it("converts between types", () => {
        expect(retype("42", "number")).toBe(42);
        expect(retype("abc", "number")).toBe(0);
        expect(retype(1, "boolean")).toBe(true);
        expect(retype({ a: 1 }, "array")).toEqual([1]);
        expect(retype(5, "string")).toBe("5");
        expect(retype(5, "null")).toBeNull();
    });

    it("adds, duplicates and moves", () => {
        const added = addChild(doc, ["a"], "string", "x");
        expect(added.ok && added.path).toEqual(["a", "x2"]);
        const duplicated = duplicateAt(doc, ["list", 0]);
        expect(duplicated.ok && getAt(duplicated.root, ["list", 1])).toEqual({ n: "one" });
        const moved = moveAt(doc, ["b"], 1);
        expect(moved.ok && Object.keys(moved.root as object)).toEqual(["a", "b", "list"]);
        expect(moveAt(doc, ["b"], -1)).toMatchObject({ ok: false });
        expect(addChild(doc, ["b"], "string")).toMatchObject({ ok: false });
    });

    it("sorts keys and drops nulls", () => {
        expect(Object.keys(sortKeysDeep(doc) as object)).toEqual(["a", "b", "list"]);
        expect(dropNullsDeep({ a: null, b: [null, 1] })).toEqual({ b: [1] });
    });
});

describe("import", () => {
    it("reads strict JSON and tolerates comments and trailing commas", () => {
        expect(parseLenient('{"a":1}')).toEqual({ ok: true, value: { a: 1 }, repaired: false });
        const lenient = parseLenient('{\n // note\n "a": [1, 2,], /* x */\n}');
        expect(lenient).toEqual({ ok: true, value: { a: [1, 2] }, repaired: true });
        expect(parseLenient("{").ok).toBe(false);
        expect(parseLenient('{"url": "http://x//y"}')).toMatchObject({ ok: true, value: { url: "http://x//y" } });
    });
});

describe("history", () => {
    it("undoes, redoes, jumps and labels", () => {
        const history = new JsonHistory({ n: 0 });
        history.record("one", { n: 1 });
        history.record("two", { n: 2 });
        expect(history.undoLabel).toBe("two");
        expect(history.undo()).toEqual({ n: 1 });
        expect(history.redoLabel).toBe("two");
        expect(history.redo()).toEqual({ n: 2 });
        expect(history.jump(0)).toEqual({ n: 0 });
        history.record("branch", { n: 9 });
        expect(history.canRedo).toBe(false);
        expect(history.list.map((entry) => entry.label)).toEqual(["Start", "branch"]);
    });

    it("records nothing for an unchanged root", () => {
        const root = { a: 1 };
        const history = new JsonHistory(root);
        history.record("same", root);
        expect(history.canUndo).toBe(false);
    });
});

describe("rows and tables", () => {
    it("shows only expanded children", () => {
        const closed = flatten(doc, new Set([pathKey([])]));
        expect(closed.rows.map((row) => row.key)).toEqual([null, "b", "a", "list"]);
        const open = flatten(doc, new Set([pathKey([]), pathKey(["a"])]));
        expect(open.rows.some((row) => row.key === "x")).toBe(true);
    });

    it("filters to matches and their ancestors", () => {
        const found = flatten(doc, new Set(), (text) => text.includes("two"));
        expect(found.rows.map((row) => row.key)).toEqual([null, "list", 1, "n"]);
        expect(found.matchCount).toBe(1);
    });

    it("limits rows and says so", () => {
        const big = Array.from({ length: 50 }, (_, i) => i);
        const result = flatten(big, new Set([pathKey([])]), null, 10);
        expect(result.rows).toHaveLength(10);
        expect(result.truncated).toBe(true);
    });

    it("builds a table for an array of objects only", () => {
        const table = tableFor(getAt(doc, ["list"]));
        expect(table?.columns).toEqual(["n", "extra"]);
        expect(table?.rows[0]?.cells).toEqual(["one", undefined]);
        expect(tableFor([1, 2])).toBeNull();
    });
});

describe("schema validation", () => {
    const schema = {
        type: "object",
        required: ["id"],
        properties: {
            id: { type: "integer", minimum: 1 },
            tags: { type: "array", items: { type: "string" } },
            kind: { enum: ["a", "b"] },
            ref: { $ref: "#/definitions/Name" },
        },
        additionalProperties: false,
        definitions: { Name: { type: "string", minLength: 2 } },
    };

    it("accepts a conforming document", () => {
        expect(validateAgainstSchema({ id: 3, tags: ["x"], kind: "a", ref: "ok" }, schema)).toEqual([]);
    });

    it("reports each problem with a pointer", () => {
        const issues = validateAgainstSchema({ id: 0, tags: [1], kind: "z", ref: "x", extra: true }, schema);
        expect(issues.map((issue) => issue.pointer).sort()).toEqual(["/extra", "/id", "/kind", "/ref", "/tags/0"]);
        expect(validateAgainstSchema({}, schema).map((issue) => issue.message)).toEqual(['Missing required property "id".']);
    });

    it("handles alternatives", () => {
        const anyOf = { anyOf: [{ type: "string" }, { type: "number" }] };
        expect(validateAgainstSchema(1, anyOf)).toEqual([]);
        expect(validateAgainstSchema(true, anyOf)).toHaveLength(1);
    });
});
