/**
 * The JSON document behind the structured editor.
 *
 * Everything here is a pure function over an immutable value, so the editor can undo and redo
 * by keeping old roots, and tests can drive every operation without a screen. A path is the
 * list of keys and indexes from the root to a node; the empty path is the root itself.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type PathSegment = string | number;
export type Path = readonly PathSegment[];
export type JsonKind = "object" | "array" | "string" | "number" | "boolean" | "null";

export const JSON_KINDS: readonly JsonKind[] = ["object", "array", "string", "number", "boolean", "null"];

export function kindOf(value: Json): JsonKind {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value as JsonKind;
}

export const pathKey = (path: Path): string => JSON.stringify(path);

/** A JSON Pointer for display, such as `/items/0/name`. */
export function pointerOf(path: Path): string {
    return path.map((segment) => `/${String(segment).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

export function getAt(root: Json, path: Path): Json | undefined {
    let node: Json | undefined = root;
    for (const segment of path) {
        if (node === null || typeof node !== "object") return undefined;
        node = Array.isArray(node) ? node[segment as number] : (node as { [key: string]: Json })[segment as string];
        if (node === undefined) return undefined;
    }
    return node;
}

/** Replaces the node at `path`. A path that does not exist returns the root unchanged. */
export function setAt(root: Json, path: Path, value: Json): Json {
    if (path.length === 0) return value;
    const [head, ...rest] = path as [PathSegment, ...PathSegment[]];
    if (Array.isArray(root)) {
        const index = head as number;
        if (index < 0 || index >= root.length) return root;
        const copy = root.slice();
        copy[index] = setAt(copy[index] as Json, rest, value);
        return copy;
    }
    if (root !== null && typeof root === "object") {
        if (!Object.hasOwn(root, head as string)) return root;
        return { ...root, [head as string]: setAt(root[head as string] as Json, rest, value) };
    }
    return root;
}

/** Sets one property of the object at `path`, adding it when it is not there yet. */
export function setProperty(root: Json, path: Path, key: string, value: Json): Json {
    const container = getAt(root, path);
    if (container === undefined || container === null || typeof container !== "object" || Array.isArray(container)) return root;
    return setAt(root, path, { ...container, [key]: value });
}

export function removeAt(root: Json, path: Path): Json {
    if (path.length === 0) return root;
    const parentPath = path.slice(0, -1);
    const last = path[path.length - 1] as PathSegment;
    const parent = getAt(root, parentPath);
    if (Array.isArray(parent)) return setAt(root, parentPath, parent.filter((_, index) => index !== last));
    if (parent !== null && typeof parent === "object" && parent !== undefined) {
        const copy = { ...parent };
        delete copy[last as string];
        return setAt(root, parentPath, copy);
    }
    return root;
}

export type EditResult = { readonly ok: true; readonly root: Json; readonly path: Path } | { readonly ok: false; readonly reason: string };

/** Renames an object key in place, keeping the key order. A clash or an empty name is refused. */
export function renameKey(root: Json, path: Path, name: string): EditResult {
    const parentPath = path.slice(0, -1);
    const oldName = path[path.length - 1];
    const parent = getAt(root, parentPath);
    if (parent === undefined || parent === null || typeof parent !== "object" || Array.isArray(parent) || typeof oldName !== "string") {
        return { ok: false, reason: "Only object keys can be renamed." };
    }
    if (name === oldName) return { ok: true, root, path };
    if (name === "") return { ok: false, reason: "A key cannot be empty." };
    if (Object.hasOwn(parent, name)) return { ok: false, reason: `The key "${name}" already exists here.` };
    const renamed: { [key: string]: Json } = {};
    for (const [key, value] of Object.entries(parent)) renamed[key === oldName ? name : key] = value;
    return { ok: true, root: setAt(root, parentPath, renamed), path: [...parentPath, name] };
}

export function defaultFor(kind: JsonKind): Json {
    switch (kind) {
        case "object":
            return {};
        case "array":
            return [];
        case "string":
            return "";
        case "number":
            return 0;
        case "boolean":
            return false;
        default:
            return null;
    }
}

/** Converts a value to another kind, keeping as much of it as makes sense. */
export function retype(value: Json, kind: JsonKind): Json {
    if (kindOf(value) === kind) return value;
    switch (kind) {
        case "string":
            return value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
        case "number": {
            if (typeof value === "string") {
                const parsed = Number(value.trim());
                return value.trim() !== "" && Number.isFinite(parsed) ? parsed : 0;
            }
            return typeof value === "boolean" ? (value ? 1 : 0) : 0;
        }
        case "boolean":
            return typeof value === "string" ? value.trim().toLowerCase() === "true" : typeof value === "number" ? value !== 0 : false;
        case "array":
            return value === null ? [] : Array.isArray(value) ? value : typeof value === "object" ? Object.values(value) : [value];
        case "object":
            return Array.isArray(value) ? Object.fromEntries(value.map((entry, index) => [String(index), entry])) : {};
        default:
            return null;
    }
}

function uniqueKey(container: { [key: string]: Json }, wanted: string): string {
    if (!Object.hasOwn(container, wanted)) return wanted;
    for (let n = 2; ; n++) if (!Object.hasOwn(container, `${wanted}${n}`)) return `${wanted}${n}`;
}

/** Adds a new child to the object or array at `path`; for an object, `key` is made unique. */
export function addChild(root: Json, path: Path, kind: JsonKind, key = "key"): EditResult {
    const container = getAt(root, path);
    if (container === undefined || container === null || typeof container !== "object") {
        return { ok: false, reason: "Only an object or an array can hold children." };
    }
    if (Array.isArray(container)) {
        return { ok: true, root: setAt(root, path, [...container, defaultFor(kind)]), path: [...path, container.length] };
    }
    const name = uniqueKey(container, key === "" ? "key" : key);
    return { ok: true, root: setAt(root, path, { ...container, [name]: defaultFor(kind) }), path: [...path, name] };
}

/** Duplicates a node beside itself: after it in an array, under a fresh key in an object. */
export function duplicateAt(root: Json, path: Path): EditResult {
    const parentPath = path.slice(0, -1);
    const last = path[path.length - 1];
    const parent = getAt(root, parentPath);
    const node = getAt(root, path);
    if (node === undefined || parent === undefined || last === undefined) return { ok: false, reason: "The root cannot be duplicated." };
    const copy = structuredClone(node);
    if (Array.isArray(parent)) {
        const next = parent.slice();
        next.splice((last as number) + 1, 0, copy);
        return { ok: true, root: setAt(root, parentPath, next), path: [...parentPath, (last as number) + 1] };
    }
    if (parent !== null && typeof parent === "object") {
        const name = uniqueKey(parent, `${last as string} copy`);
        const next: { [key: string]: Json } = {};
        for (const [key, value] of Object.entries(parent)) {
            next[key] = value;
            if (key === last) next[name] = copy;
        }
        return { ok: true, root: setAt(root, parentPath, next), path: [...parentPath, name] };
    }
    return { ok: false, reason: "Nothing to duplicate." };
}

/** Moves a node one place earlier (`-1`) or later (`1`) among its siblings. */
export function moveAt(root: Json, path: Path, delta: -1 | 1): EditResult {
    const parentPath = path.slice(0, -1);
    const last = path[path.length - 1];
    const parent = getAt(root, parentPath);
    if (parent === undefined || last === undefined || parent === null || typeof parent !== "object") {
        return { ok: false, reason: "The root has no siblings to move among." };
    }
    if (Array.isArray(parent)) {
        const from = last as number;
        const to = from + delta;
        if (to < 0 || to >= parent.length) return { ok: false, reason: "Already at the edge." };
        const next = parent.slice();
        [next[from], next[to]] = [next[to] as Json, next[from] as Json];
        return { ok: true, root: setAt(root, parentPath, next), path: [...parentPath, to] };
    }
    const entries = Object.entries(parent);
    const from = entries.findIndex(([key]) => key === last);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= entries.length) return { ok: false, reason: "Already at the edge." };
    [entries[from], entries[to]] = [entries[to] as [string, Json], entries[from] as [string, Json]];
    return { ok: true, root: setAt(root, parentPath, Object.fromEntries(entries)), path: [...parentPath, last as string] };
}

/** Sorts every object's keys alphabetically, all the way down. */
export function sortKeysDeep(value: Json): Json {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value)
                .sort((a, b) => a.localeCompare(b))
                .map((key) => [key, sortKeysDeep(value[key] as Json)]),
        );
    }
    return value;
}

/** Removes every null from objects and arrays, all the way down. */
export function dropNullsDeep(value: Json): Json {
    if (Array.isArray(value)) return value.filter((entry) => entry !== null).map(dropNullsDeep);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, entry]) => entry !== null)
                .map(([key, entry]) => [key, dropNullsDeep(entry)]),
        );
    }
    return value;
}

/* -------------------------------------------------------------------------- */
/* Import                                                                      */
/* -------------------------------------------------------------------------- */

export type ParseResult =
    | { readonly ok: true; readonly value: Json; readonly repaired: boolean }
    | { readonly ok: false; readonly error: string };

/** Removes comments and trailing commas outside strings, which strict JSON forbids. */
export function stripLenient(text: string): string {
    let out = "";
    let i = 0;
    while (i < text.length) {
        const char = text.charAt(i);
        if (char === '"') {
            let j = i + 1;
            while (j < text.length && text.charAt(j) !== '"') j += text.charAt(j) === "\\" ? 2 : 1;
            out += text.slice(i, j + 1);
            i = j + 1;
        } else if (char === "/" && text.charAt(i + 1) === "/") {
            while (i < text.length && text.charAt(i) !== "\n") i++;
        } else if (char === "/" && text.charAt(i + 1) === "*") {
            const end = text.indexOf("*/", i + 2);
            i = end < 0 ? text.length : end + 2;
        } else {
            out += char;
            i++;
        }
    }
    return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Reads JSON strictly first, then tolerates a BOM, comments and trailing commas. */
export function parseLenient(text: string): ParseResult {
    const clean = text.replace(/^﻿/, "");
    try {
        return { ok: true, value: JSON.parse(clean) as Json, repaired: clean !== text };
    } catch (strict) {
        try {
            return { ok: true, value: JSON.parse(stripLenient(clean)) as Json, repaired: true };
        } catch {
            return { ok: false, error: strict instanceof Error ? strict.message : String(strict) };
        }
    }
}

export const stringify = (value: Json): string => JSON.stringify(value, null, 2);

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

export interface HistoryEntry {
    readonly label: string;
    readonly root: Json;
}

/** Labelled undo and redo with a jump-back list. Each step keeps a whole root, which is cheap
 * because edits share structure. */
export class JsonHistory {
    private entries: HistoryEntry[];
    private cursor = 0;

    constructor(
        initial: Json,
        private readonly limit = 200,
    ) {
        this.entries = [{ label: "Start", root: initial }];
    }

    get current(): Json {
        return (this.entries[this.cursor] as HistoryEntry).root;
    }
    get canUndo(): boolean {
        return this.cursor > 0;
    }
    get canRedo(): boolean {
        return this.cursor < this.entries.length - 1;
    }
    /** The label of the step an undo would take back. */
    get undoLabel(): string | null {
        return this.canUndo ? (this.entries[this.cursor] as HistoryEntry).label : null;
    }
    get redoLabel(): string | null {
        return this.canRedo ? (this.entries[this.cursor + 1] as HistoryEntry).label : null;
    }
    get list(): readonly (HistoryEntry & { readonly index: number; readonly active: boolean })[] {
        return this.entries.map((entry, index) => ({ ...entry, index, active: index === this.cursor }));
    }

    /** Records a new state and drops any redo steps. An unchanged root records nothing. */
    record(label: string, root: Json): void {
        if (root === this.current) return;
        this.entries = [...this.entries.slice(0, this.cursor + 1), { label, root }];
        if (this.entries.length > this.limit) this.entries = this.entries.slice(this.entries.length - this.limit);
        this.cursor = this.entries.length - 1;
    }
    undo(): Json {
        if (this.canUndo) this.cursor -= 1;
        return this.current;
    }
    redo(): Json {
        if (this.canRedo) this.cursor += 1;
        return this.current;
    }
    jump(index: number): Json {
        if (index >= 0 && index < this.entries.length) this.cursor = index;
        return this.current;
    }
    /** Starts over on a document that was replaced wholesale, such as an import. */
    reset(root: Json): void {
        this.entries = [{ label: "Start", root }];
        this.cursor = 0;
    }
}

/* -------------------------------------------------------------------------- */
/* Rows for the tree and the table                                             */
/* -------------------------------------------------------------------------- */

export interface TreeRow {
    readonly path: Path;
    readonly id: string;
    readonly key: PathSegment | null;
    readonly depth: number;
    readonly kind: JsonKind;
    readonly value: Json;
    readonly childCount: number;
    readonly expanded: boolean;
}

export const MAX_ROWS = 2000;

function childEntries(value: Json): [PathSegment, Json][] {
    if (Array.isArray(value)) return value.map((entry, index) => [index, entry]);
    if (value !== null && typeof value === "object") return Object.entries(value);
    return [];
}

/** A short single-line preview of a value, for search and for collapsed containers. */
export function previewOf(value: Json): string {
    if (Array.isArray(value)) return `[${value.length}]`;
    if (value !== null && typeof value === "object") return `{${Object.keys(value).length}}`;
    return JSON.stringify(value);
}

/**
 * Flattens the document into the rows the tree shows. With a `matches` function, only matching
 * rows and the ancestors that lead to them are kept and every ancestor is open; without it,
 * `expanded` decides what is open.
 */
export function flatten(
    root: Json,
    expanded: ReadonlySet<string>,
    matches: ((text: string) => boolean) | null = null,
    limit = MAX_ROWS,
): { rows: readonly TreeRow[]; truncated: boolean; matchCount: number } {
    const rows: TreeRow[] = [];
    let truncated = false;
    let matchCount = 0;

    const visit = (value: Json, path: Path, key: PathSegment | null, depth: number): boolean => {
        const id = pathKey(path);
        const children = childEntries(value);
        const own = matches === null ? true : matches(`${key ?? ""} ${typeof value === "object" && value !== null ? "" : String(value)}`);
        const slot = rows.length;
        const isOpen = matches !== null || expanded.has(id);
        const placeholder: TreeRow = { path, id, key, depth, kind: kindOf(value), value, childCount: children.length, expanded: isOpen };
        if (rows.length >= limit) {
            truncated = true;
            return false;
        }
        rows.push(placeholder);
        let anyChild = false;
        if (isOpen) {
            for (const [childKey, child] of children) {
                if (visit(child, [...path, childKey], childKey, depth + 1)) anyChild = true;
                if (truncated) break;
            }
        }
        const keep = matches === null || own || anyChild;
        if (matches !== null && own) matchCount += 1;
        if (!keep) rows.length = slot;
        return keep;
    };
    visit(root, [], null, 0);
    return { rows, truncated, matchCount };
}

export interface TableModel {
    readonly columns: readonly string[];
    readonly rows: readonly { readonly index: number; readonly cells: readonly (Json | undefined)[] }[];
}

/** An array of objects as columns and rows; anything else has no table. */
export function tableFor(value: Json | undefined): TableModel | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    if (!value.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry))) return null;
    const columns: string[] = [];
    for (const entry of value as { [key: string]: Json }[]) {
        for (const key of Object.keys(entry)) if (!columns.includes(key)) columns.push(key);
    }
    return {
        columns,
        rows: (value as { [key: string]: Json }[]).map((entry, index) => ({
            index,
            cells: columns.map((column) => (Object.hasOwn(entry, column) ? entry[column] : undefined)),
        })),
    };
}

/* -------------------------------------------------------------------------- */
/* Schema validation                                                           */
/* -------------------------------------------------------------------------- */

export interface SchemaIssue {
    readonly pointer: string;
    readonly message: string;
}

const MAX_ISSUES = 200;

function resolveRef(root: unknown, ref: string): unknown {
    if (!ref.startsWith("#")) return undefined;
    let node: unknown = root;
    for (const part of ref.slice(1).split("/").filter(Boolean)) {
        if (node === null || typeof node !== "object") return undefined;
        node = (node as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    return node;
}

function typeMatches(value: Json, type: string): boolean {
    switch (type) {
        case "integer":
            return typeof value === "number" && Number.isInteger(value);
        case "number":
            return typeof value === "number";
        case "null":
            return value === null;
        case "array":
            return Array.isArray(value);
        case "object":
            return value !== null && typeof value === "object" && !Array.isArray(value);
        default:
            return typeof value === type;
    }
}

const same = (a: Json, b: Json): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Checks a value against the common core of JSON Schema. Unknown keywords are ignored. */
export function validateAgainstSchema(value: Json, schema: unknown): readonly SchemaIssue[] {
    const issues: SchemaIssue[] = [];
    const check = (node: Json, rule: unknown, path: Path, depth: number): boolean => {
        if (issues.length >= MAX_ISSUES || depth > 64) return true;
        if (rule === true || rule === undefined) return true;
        if (rule === false) {
            issues.push({ pointer: pointerOf(path), message: "No value is allowed here." });
            return false;
        }
        if (rule === null || typeof rule !== "object") return true;
        const s = rule as Record<string, unknown>;
        let ok = true;
        const fail = (message: string): void => {
            ok = false;
            issues.push({ pointer: pointerOf(path), message });
        };
        if (typeof s.$ref === "string") {
            const target = resolveRef(schema, s.$ref);
            if (target === undefined) fail(`Unresolved reference ${s.$ref}.`);
            else if (!check(node, target, path, depth + 1)) ok = false;
        }
        if (s.type !== undefined) {
            const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
            if (!types.some((type) => typeMatches(node, type))) fail(`Expected ${types.join(" or ")}, found ${kindOf(node)}.`);
        }
        if (Array.isArray(s.enum) && !s.enum.some((option) => same(option as Json, node))) fail(`Must be one of ${s.enum.map((o) => JSON.stringify(o)).join(", ")}.`);
        if ("const" in s && !same(s.const as Json, node)) fail(`Must equal ${JSON.stringify(s.const)}.`);
        if (typeof node === "number") {
            if (typeof s.minimum === "number" && node < s.minimum) fail(`Must be at least ${s.minimum}.`);
            if (typeof s.maximum === "number" && node > s.maximum) fail(`Must be at most ${s.maximum}.`);
            if (typeof s.exclusiveMinimum === "number" && node <= s.exclusiveMinimum) fail(`Must be greater than ${s.exclusiveMinimum}.`);
            if (typeof s.exclusiveMaximum === "number" && node >= s.exclusiveMaximum) fail(`Must be less than ${s.exclusiveMaximum}.`);
            if (typeof s.multipleOf === "number" && s.multipleOf > 0 && node % s.multipleOf !== 0) fail(`Must be a multiple of ${s.multipleOf}.`);
        }
        if (typeof node === "string") {
            if (typeof s.minLength === "number" && node.length < s.minLength) fail(`Must be at least ${s.minLength} characters.`);
            if (typeof s.maxLength === "number" && node.length > s.maxLength) fail(`Must be at most ${s.maxLength} characters.`);
            if (typeof s.pattern === "string") {
                try {
                    if (!new RegExp(s.pattern, "u").test(node)) fail(`Must match ${s.pattern}.`);
                } catch {
                    // A pattern this engine cannot compile is not the document's fault.
                }
            }
        }
        if (Array.isArray(node)) {
            if (typeof s.minItems === "number" && node.length < s.minItems) fail(`Needs at least ${s.minItems} items.`);
            if (typeof s.maxItems === "number" && node.length > s.maxItems) fail(`Allows at most ${s.maxItems} items.`);
            if (s.uniqueItems === true && new Set(node.map((entry) => JSON.stringify(entry))).size !== node.length) fail("Items must be unique.");
            if (Array.isArray(s.items)) node.forEach((entry, index) => { if (index < (s.items as unknown[]).length && !check(entry, (s.items as unknown[])[index], [...path, index], depth + 1)) ok = false; });
            else if (s.items !== undefined) node.forEach((entry, index) => { if (!check(entry, s.items, [...path, index], depth + 1)) ok = false; });
        } else if (node !== null && typeof node === "object") {
            const object = node as { [key: string]: Json };
            const properties = (s.properties ?? {}) as Record<string, unknown>;
            if (Array.isArray(s.required)) {
                for (const name of s.required as string[]) if (!Object.hasOwn(object, name)) fail(`Missing required property "${name}".`);
            }
            for (const [name, entry] of Object.entries(object)) {
                if (Object.hasOwn(properties, name)) {
                    if (!check(entry, properties[name], [...path, name], depth + 1)) ok = false;
                } else if (s.additionalProperties === false) {
                    issues.push({ pointer: pointerOf([...path, name]), message: "This property is not allowed." });
                    ok = false;
                } else if (s.additionalProperties !== undefined && s.additionalProperties !== true) {
                    if (!check(entry, s.additionalProperties, [...path, name], depth + 1)) ok = false;
                }
            }
        }
        if (Array.isArray(s.allOf)) for (const part of s.allOf) if (!check(node, part, path, depth + 1)) ok = false;
        if (Array.isArray(s.anyOf) && !s.anyOf.some((part) => validateAgainstSchema(node, mergeRoot(schema, part)).length === 0)) fail("Matches none of the allowed alternatives.");
        if (Array.isArray(s.oneOf)) {
            const hits = s.oneOf.filter((part) => validateAgainstSchema(node, mergeRoot(schema, part)).length === 0).length;
            if (hits !== 1) fail(hits === 0 ? "Matches none of the allowed alternatives." : "Matches more than one alternative.");
        }
        if (s.not !== undefined && validateAgainstSchema(node, mergeRoot(schema, s.not)).length === 0) fail("Matches something it must not.");
        return ok;
    };
    check(value, schema, [], 0);
    return issues;
}

/** Lets a sub-schema keep resolving `$ref` against the whole document it came from. */
function mergeRoot(rootSchema: unknown, part: unknown): unknown {
    if (rootSchema === null || typeof rootSchema !== "object" || part === null || typeof part !== "object") return part;
    const root = rootSchema as Record<string, unknown>;
    return { ...(part as Record<string, unknown>), definitions: root.definitions, $defs: root.$defs };
}
