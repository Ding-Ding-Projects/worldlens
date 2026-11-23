import { parseSnbt } from "./snbt.js";
import {
    INTEGER_RANGES,
    NbtError,
    allocateId,
    createNode,
    isArrayKind,
    isContainerKind,
    type ArrayValue,
    type NbtDocument,
    type NbtNode,
    type ScalarValue,
    type TagKind,
} from "./types.js";

/** Where a node sits: the node itself and the container it belongs to (null for the root). */
export interface NodeLocation {
    node: NbtNode;
    parent: NbtNode | null;
}

export type NodeIndex = Map<number, NodeLocation>;

/** Indexes every node by id so an edit can find its target without walking the tree. */
export function indexTree(root: NbtNode): NodeIndex {
    const index: NodeIndex = new Map();
    const stack: { node: NbtNode; parent: NbtNode | null }[] = [{ node: root, parent: null }];
    while (stack.length > 0) {
        const entry = stack.pop()!;
        index.set(entry.node.id, entry);
        for (const child of entry.node.children ?? []) stack.push({ node: child, parent: entry.node });
    }
    return index;
}

export function locate(index: NodeIndex, id: number): NodeLocation {
    const found = index.get(id);
    if (found === undefined) throw new NbtError("That tag no longer exists.", "not-found");
    return found;
}

/** A readable path such as `Data.GameRules.doDaylightCycle` or `Player.Pos[1]`. */
export function pathOf(index: NodeIndex, id: number): string {
    const segments: { text: string; indexed: boolean }[] = [];
    let current: NodeLocation | undefined = index.get(id);
    while (current !== undefined && current.parent !== null) {
        if (current.parent.kind === "list") {
            segments.push({ text: `[${(current.parent.children ?? []).indexOf(current.node)}]`, indexed: true });
        } else {
            segments.push({ text: current.node.name ?? "", indexed: false });
        }
        current = index.get(current.parent.id);
    }
    let out = "";
    for (const segment of segments.reverse()) out += segment.indexed || out === "" ? segment.text : "." + segment.text;
    return out;
}

/* ------------------------------------------------------------------ scalar values */

const NUMBER_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Parses text typed into a scalar editor, refusing anything outside the kind's range. */
export function parseScalarText(kind: TagKind, text: string): ScalarValue {
    const trimmed = text.trim();
    switch (kind) {
        case "byte":
        case "short":
        case "int":
        case "long": {
            // Allow the SNBT suffix the printer writes, and true/false for bytes.
            let source = trimmed;
            if (kind === "byte" && (source === "true" || source === "false")) source = source === "true" ? "1" : "0";
            source = source.replace(kind === "byte" ? /[bB]$/ : kind === "short" ? /[sS]$/ : kind === "long" ? /[lL]$/ : /$^/, "");
            if (!/^[+-]?\d+$/.test(source)) throw new NbtError(`"${text}" is not a whole number.`, "invalid-value");
            const value = BigInt(source);
            const range = INTEGER_RANGES[kind];
            if (value < range.min || value > range.max)
                throw new NbtError(`${value} is outside the range of a ${kind} (${range.min} to ${range.max}).`, "invalid-value");
            return kind === "long" ? value : Number(value);
        }
        case "float":
        case "double": {
            const source = trimmed.replace(kind === "float" ? /[fF]$/ : /[dD]$/, "");
            let value: number;
            if (/^[+-]?NaN$/.test(source)) value = Number.NaN;
            else if (/^[+-]?Infinity$/.test(source)) value = source.startsWith("-") ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
            else if (NUMBER_TEXT.test(source)) value = Number(source);
            else throw new NbtError(`"${text}" is not a number.`, "invalid-value");
            if (kind === "float") {
                const rounded = Math.fround(value);
                if (Number.isFinite(value) && !Number.isFinite(rounded))
                    throw new NbtError(`${value} is too large for a float. Use a double, or a value below about 3.4e38.`, "invalid-value");
                return rounded;
            }
            return value;
        }
        case "string":
            return text;
        default:
            throw new NbtError(`A ${kind} has no single value to type.`, "invalid-operation");
    }
}

function scalarElement(kind: "byteArray" | "intArray" | "longArray", text: string): number | bigint {
    const element = kind === "byteArray" ? "byte" : kind === "intArray" ? "int" : "long";
    return parseScalarText(element, text) as number | bigint;
}

/* ------------------------------------------------------------------ cloning */

/** A deep copy with every id preserved, for undo snapshots. */
export function cloneKeepingIds(node: NbtNode): NbtNode {
    return {
        ...node,
        value: Array.isArray(node.value) ? [...(node.value as unknown[])] as ArrayValue : node.value,
        children: node.children === null ? null : node.children.map(cloneKeepingIds),
        rawName: node.rawName === null ? null : Uint8Array.from(node.rawName),
        rawText: node.rawText === null ? null : Uint8Array.from(node.rawText),
    };
}

/** A deep copy with fresh ids, for duplicate and paste. */
export function cloneWithNewIds(node: NbtNode, doc: { nextId: number }): NbtNode {
    const copy = cloneKeepingIds(node);
    const renumber = (n: NbtNode): void => {
        n.id = allocateId(doc);
        for (const child of n.children ?? []) renumber(child);
    };
    renumber(copy);
    return copy;
}

export function countNodes(node: NbtNode): number {
    let n = 1;
    for (const child of node.children ?? []) n += countNodes(child);
    return n;
}

/* ------------------------------------------------------------------ edit operations */

export interface EditResult {
    /** Node ids whose own fields or children changed, so a view knows what to refresh. */
    changed: number[];
    /** The node an interface should select afterwards, when there is an obvious one. */
    select: number | null;
}

function requireContainerForNames(parent: NbtNode): void {
    if (parent.kind !== "compound" && parent.kind !== "list")
        throw new NbtError("Only a compound or a list can hold other tags.", "invalid-operation");
}

function uniqueName(parent: NbtNode, wanted: string, ignore: NbtNode | null): string {
    const taken = new Set((parent.children ?? []).filter((c) => c !== ignore).map((c) => c.name));
    if (!taken.has(wanted)) return wanted;
    for (let n = 2; ; n++) {
        const candidate = `${wanted} ${n}`;
        if (!taken.has(candidate)) return candidate;
    }
}

function nameTaken(parent: NbtNode, name: string, ignore: NbtNode | null): boolean {
    return (parent.children ?? []).some((c) => c !== ignore && c.name === name);
}

export class TreeEditor {
    constructor(
        readonly doc: NbtDocument,
        public index: NodeIndex = indexTree(doc.root),
    ) {}

    reindex(): void {
        this.index = indexTree(this.doc.root);
    }

    get(id: number): NodeLocation {
        return locate(this.index, id);
    }

    /** Sets a scalar from text. */
    setValue(id: number, text: string): EditResult {
        const { node } = this.get(id);
        const value = parseScalarText(node.kind, text);
        node.value = value;
        node.rawBits = null;
        node.rawText = null;
        return { changed: [id], select: id };
    }

    /** Flips a byte between 0 and 1 for the boolean switch. */
    setBool(id: number, on: boolean): EditResult {
        const { node } = this.get(id);
        if (node.kind !== "byte") throw new NbtError("Only a byte can be a switch.", "invalid-operation");
        node.value = on ? 1 : 0;
        return { changed: [id], select: id };
    }

    rename(id: number, name: string): EditResult {
        const { node, parent } = this.get(id);
        if (parent !== null && parent.kind === "list") throw new NbtError("Tags inside a list have no names.", "invalid-operation");
        if (name.length > 0xffff) throw new NbtError("That name is too long.", "invalid-value");
        if (parent !== null && nameTaken(parent, name, node))
            throw new NbtError(`There is already a tag called "${name}" here.`, "invalid-value");
        node.name = name;
        node.rawName = null;
        return { changed: [id], select: id };
    }

    remove(id: number): EditResult {
        const { node, parent } = this.get(id);
        if (parent === null) throw new NbtError("The root compound cannot be removed.", "invalid-operation");
        const siblings = parent.children!;
        siblings.splice(siblings.indexOf(node), 1);
        this.reindex();
        return { changed: [parent.id], select: parent.id };
    }

    /**
     * Adds a new tag with the kind's default value (or `valueText` when given).
     * Into a list the kind must match the list's element type; an empty list adopts it.
     */
    add(parentId: number, kind: TagKind, name: string, valueText?: string, at?: number): EditResult {
        const { node: parent } = this.get(parentId);
        requireContainerForNames(parent);
        const node = createNode(this.doc, kind, parent.kind === "list" ? null : name);
        if (valueText !== undefined && valueText !== "") this.fill(node, valueText);
        if (parent.kind === "list") {
            if (parent.listKind !== "end" && parent.listKind !== kind)
                throw new NbtError(`This list holds ${parent.listKind} tags, so a ${kind} cannot be added.`, "invalid-operation");
        } else {
            if (name.length === 0) throw new NbtError("A tag needs a name.", "invalid-value");
            if (nameTaken(parent, name, null)) throw new NbtError(`There is already a tag called "${name}" here.`, "invalid-value");
        }
        this.insert(parent, node, at);
        this.reindex();
        return { changed: [parentId], select: node.id };
    }

    private fill(node: NbtNode, text: string): void {
        if (isContainerKind(node.kind) || isArrayKind(node.kind)) return;
        node.value = parseScalarText(node.kind, text);
    }

    private insert(parent: NbtNode, node: NbtNode, at?: number): void {
        const children = parent.children!;
        if (parent.kind === "list") {
            if (parent.listKind === "end") parent.listKind = node.kind;
            node.name = null;
            node.rawName = null;
        }
        const position = at === undefined ? children.length : Math.max(0, Math.min(at, children.length));
        children.splice(position, 0, node);
    }

    duplicate(id: number): EditResult {
        const { node, parent } = this.get(id);
        if (parent === null) throw new NbtError("The root compound cannot be duplicated.", "invalid-operation");
        const copy = cloneWithNewIds(node, this.doc);
        if (parent.kind === "compound") {
            copy.name = uniqueName(parent, `${node.name ?? "tag"} copy`, null);
            copy.rawName = null;
        }
        const siblings = parent.children!;
        siblings.splice(siblings.indexOf(node) + 1, 0, copy);
        this.reindex();
        return { changed: [parent.id], select: copy.id };
    }

    /** Moves a tag to another container (or another position in its own). */
    move(id: number, newParentId: number, at?: number): EditResult {
        const { node, parent } = this.get(id);
        if (parent === null) throw new NbtError("The root compound cannot be moved.", "invalid-operation");
        const { node: target } = this.get(newParentId);
        requireContainerForNames(target);
        // A tag cannot become its own descendant.
        for (let walk: NodeLocation | undefined = this.index.get(newParentId); walk !== undefined; ) {
            if (walk.node === node) throw new NbtError("A tag cannot be moved inside itself.", "invalid-operation");
            walk = walk.parent === null ? undefined : this.index.get(walk.parent.id);
        }
        if (target.kind === "list" && target.listKind !== "end" && target.listKind !== node.kind)
            throw new NbtError(`That list holds ${target.listKind} tags, so a ${node.kind} cannot move into it.`, "invalid-operation");
        if (target.kind === "compound" && target !== parent && nameTaken(target, node.name ?? "", node))
            throw new NbtError(`There is already a tag called "${node.name ?? ""}" in the destination.`, "invalid-value");
        const from = parent.children!;
        const fromIndex = from.indexOf(node);
        from.splice(fromIndex, 1);
        let position = at;
        if (target === parent && position !== undefined && position > fromIndex) position -= 1;
        if (target.kind === "compound" && node.name === null) node.name = uniqueName(target, "tag", node);
        this.insert(target, node, position);
        this.reindex();
        return { changed: target === parent ? [parent.id] : [parent.id, target.id], select: node.id };
    }

    /** Shifts a tag one place up or down among its siblings. */
    nudge(id: number, direction: -1 | 1): EditResult {
        const { node, parent } = this.get(id);
        if (parent === null) throw new NbtError("The root compound has no siblings.", "invalid-operation");
        const siblings = parent.children!;
        const from = siblings.indexOf(node);
        const to = from + direction;
        if (to < 0 || to >= siblings.length) return { changed: [], select: id };
        siblings.splice(from, 1);
        siblings.splice(to, 0, node);
        return { changed: [parent.id], select: id };
    }

    /** Replaces a tag (and everything under it) with the tag described by SNBT. */
    replaceFromSnbt(id: number, text: string): EditResult {
        const { node, parent } = this.get(id);
        const parsed = parseSnbt(text, this.doc, node.name);
        if (parent === null && parsed.kind !== "compound") throw new NbtError("The root must stay a compound.", "invalid-operation");
        if (parent !== null && parent.kind === "list" && parent.listKind !== "end" && parent.listKind !== parsed.kind && (parent.children?.length ?? 0) > 1)
            throw new NbtError(`This list holds ${parent.listKind} tags, so the text must be a ${parent.listKind}.`, "invalid-operation");
        parsed.rawName = node.rawName;
        if (parent === null) {
            this.doc.root = parsed;
            this.reindex();
            return { changed: [parsed.id], select: parsed.id };
        }
        const siblings = parent.children!;
        siblings[siblings.indexOf(node)] = parsed;
        if (parent.kind === "list" && (parent.children?.length ?? 0) === 1) parent.listKind = parsed.kind;
        this.reindex();
        return { changed: [parent.id], select: parsed.id };
    }

    /** Adds a tag described by SNBT, for paste. */
    addFromSnbt(parentId: number, name: string, text: string, at?: number): EditResult {
        const { node: parent } = this.get(parentId);
        requireContainerForNames(parent);
        const parsed = parseSnbt(text, this.doc, parent.kind === "list" ? null : name);
        if (parent.kind === "compound") {
            if (name.length === 0) throw new NbtError("A tag needs a name.", "invalid-value");
            parsed.name = uniqueName(parent, name, null);
        } else if (parent.listKind !== "end" && parent.listKind !== parsed.kind) {
            throw new NbtError(`This list holds ${parent.listKind} tags, so a ${parsed.kind} cannot be pasted into it.`, "invalid-operation");
        }
        this.insert(parent, parsed, at);
        this.reindex();
        return { changed: [parentId], select: parsed.id };
    }

    /* ---------------------------- arrays */

    arraySet(id: number, at: number, text: string): EditResult {
        const { node } = this.get(id);
        if (!isArrayKind(node.kind)) throw new NbtError("That tag is not an array.", "invalid-operation");
        const values = node.value as (number | bigint)[];
        if (!Number.isInteger(at) || at < 0 || at >= values.length) throw new NbtError("That element does not exist.", "not-found");
        values[at] = scalarElement(node.kind as "byteArray" | "intArray" | "longArray", text);
        return { changed: [id], select: id };
    }

    arrayInsert(id: number, at: number, text: string): EditResult {
        const { node } = this.get(id);
        if (!isArrayKind(node.kind)) throw new NbtError("That tag is not an array.", "invalid-operation");
        const values = node.value as (number | bigint)[];
        const element = scalarElement(node.kind as "byteArray" | "intArray" | "longArray", text === "" ? "0" : text);
        values.splice(Math.max(0, Math.min(at, values.length)), 0, element);
        return { changed: [id], select: id };
    }

    arrayRemove(id: number, at: number): EditResult {
        const { node } = this.get(id);
        if (!isArrayKind(node.kind)) throw new NbtError("That tag is not an array.", "invalid-operation");
        const values = node.value as (number | bigint)[];
        if (!Number.isInteger(at) || at < 0 || at >= values.length) throw new NbtError("That element does not exist.", "not-found");
        values.splice(at, 1);
        return { changed: [id], select: id };
    }
}

/* ------------------------------------------------------------------ search */

export interface SearchOptions {
    query: string;
    regex: boolean;
    flags: string;
    names: boolean;
    values: boolean;
    limit: number;
    /** Wall-clock budget so a pattern that backtracks badly cannot hang the editor. */
    budgetMs: number;
}

export interface SearchResult {
    ids: number[];
    error: string | null;
    truncated: boolean;
    timedOut: boolean;
}

const SAFE_FLAGS = /^[gimsuy]*$/;

export function searchTree(root: NbtNode, options: SearchOptions, now: () => number = Date.now): SearchResult {
    if (options.query === "") return { ids: [], error: null, truncated: false, timedOut: false };
    let test: (text: string) => boolean;
    if (options.regex) {
        if (!SAFE_FLAGS.test(options.flags)) return { ids: [], error: "Unsupported regular expression flags.", truncated: false, timedOut: false };
        if (options.query.length > 512) return { ids: [], error: "That pattern is too long.", truncated: false, timedOut: false };
        let re: RegExp;
        try {
            re = new RegExp(options.query, options.flags.replace(/[gy]/g, ""));
        } catch (error) {
            return { ids: [], error: error instanceof Error ? error.message : "Invalid pattern.", truncated: false, timedOut: false };
        }
        test = (text) => re.test(text.length > 4096 ? text.slice(0, 4096) : text);
    } else {
        const needle = options.query.toLowerCase();
        test = (text) => text.toLowerCase().includes(needle);
    }
    const ids: number[] = [];
    const started = now();
    let timedOut = false;
    let truncated = false;
    const stack: NbtNode[] = [root];
    while (stack.length > 0) {
        if (now() - started > options.budgetMs) {
            timedOut = true;
            break;
        }
        const node = stack.pop()!;
        const kids = node.children;
        if (kids !== null) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
        let hit = false;
        if (options.names && node.name !== null && test(node.name)) hit = true;
        if (!hit && options.values) hit = valueMatches(node, test);
        if (hit) {
            if (ids.length >= options.limit) {
                truncated = true;
                break;
            }
            ids.push(node.id);
        }
    }
    return { ids, error: null, truncated, timedOut };
}

function valueMatches(node: NbtNode, test: (text: string) => boolean): boolean {
    if (node.kind === "string") return test(node.value as string);
    if (isArrayKind(node.kind)) {
        const values = node.value as (number | bigint)[];
        return values.length <= 64 && values.some((v) => test(String(v)));
    }
    if (isContainerKind(node.kind)) return false;
    return test(String(node.value));
}
