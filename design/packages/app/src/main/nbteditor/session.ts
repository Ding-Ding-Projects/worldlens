import {
    NbtError,
    TreeEditor,
    cloneKeepingIds,
    countNodes,
    describeChanges,
    diffTrees,
    isArrayKind,
    isContainerKind,
    pathOf,
    scalarSnbt,
    searchTree,
    toSnbt,
    type NbtDiff,
    type NbtDocument,
    type NbtNode,
} from "@worldlens/nbt";
import type {
    ArrayPage,
    ChildrenPage,
    DocumentState,
    EditOperation,
    EditOutcome,
    NodeView,
    SearchOutcome,
    SearchRequest,
} from "./protocol.js";

/** Undo keeps whole-tree snapshots; this caps how many and how large, so a huge chunk cannot eat memory. */
const MAX_UNDO_STEPS = 100;
const MAX_UNDO_NODES = 1_500_000;
const SEARCH_LIMIT = 500;
const SEARCH_BUDGET_MS = 200;

/** The value text an inline editor shows. */
export function plainText(node: NbtNode): string {
    switch (node.kind) {
        case "string":
            return node.value as string;
        case "byte":
        case "short":
        case "long":
        case "float":
        case "double":
            return scalarSnbt(node).replace(/[bsLfd]$/u, "");
        case "int":
            return String(node.value as number);
        default:
            return "";
    }
}

function valueLength(node: NbtNode): number {
    return isArrayKind(node.kind) ? (node.value as unknown[]).length : 0;
}

export function summarise(node: NbtNode): string {
    switch (node.kind) {
        case "compound": {
            const n = node.children?.length ?? 0;
            return n === 1 ? "1 entry" : `${n} entries`;
        }
        case "list": {
            const n = node.children?.length ?? 0;
            return n === 0 ? "empty list" : `${n} × ${node.listKind}`;
        }
        case "byteArray":
        case "intArray":
        case "longArray": {
            const n = valueLength(node);
            return n === 1 ? "1 value" : `${n} values`;
        }
        default:
            return "";
    }
}

export function viewOf(node: NbtNode): NodeView {
    return {
        id: node.id,
        kind: node.kind,
        name: node.name,
        text: plainText(node),
        summary: summarise(node),
        childCount: node.children?.length ?? 0,
        listKind: node.kind === "list" ? (node.listKind ?? "end") : null,
        isBool: node.kind === "byte" && (node.value === 0 || node.value === 1),
        valueLength: valueLength(node),
    };
}

interface Snapshot {
    root: NbtNode;
    nodes: number;
    /** The revision this tree was at, so undoing back to the saved one reads as clean. */
    revision: number;
}

/**
 * One open file or chunk: its tree, what is on disk, and the undo history of this editing session.
 */
export class EditorSession {
    private editor: TreeEditor;
    private baseline: NbtNode;
    private undoStack: Snapshot[] = [];
    private redoStack: Snapshot[] = [];
    private undoNodes = 0;
    private savedRevision = 0;
    private revision = 0;
    private revisionCounter = 0;

    constructor(readonly doc: NbtDocument) {
        this.editor = new TreeEditor(doc);
        this.baseline = cloneKeepingIds(doc.root);
    }

    get root(): NbtNode {
        return this.doc.root;
    }

    state(): DocumentState {
        const dirty = this.revision !== this.savedRevision;
        return {
            dirty,
            canUndo: this.undoStack.length > 0,
            canRedo: this.redoStack.length > 0,
            changeCount: dirty ? diffTrees(this.baseline, this.doc.root, 10_000).changes.length : 0,
        };
    }

    view(id: number): NodeView {
        return viewOf(this.editor.get(id).node);
    }

    children(id: number, offset: number, limit: number): ChildrenPage {
        const node = this.editor.get(id).node;
        const kids = node.children ?? [];
        const start = Math.max(0, offset);
        return { total: kids.length, nodes: kids.slice(start, start + Math.max(1, Math.min(limit, 2000))).map(viewOf) };
    }

    arrayPage(id: number, offset: number, limit: number): ArrayPage {
        const node = this.editor.get(id).node;
        if (!isArrayKind(node.kind)) throw new NbtError("That tag is not an array.", "invalid-operation");
        const values = node.value as (number | bigint)[];
        const start = Math.max(0, offset);
        return {
            total: values.length,
            offset: start,
            kind: node.kind,
            values: values.slice(start, start + Math.max(1, Math.min(limit, 2048))).map(String),
        };
    }

    /** The SNBT text of a subtree; a very large one is cut and flagged by a trailing ellipsis. */
    snbt(id: number, pretty: boolean): { text: string; truncated: boolean } {
        const node = this.editor.get(id).node;
        const max = 2 * 1024 * 1024;
        const text = toSnbt(node, { indent: pretty ? 2 : 0, maxLength: max });
        return { text, truncated: text.endsWith("…") && text.length > max };
    }

    /** Ids from the root down to `id`, so an interface can expand the way to a search hit. */
    ancestors(id: number): number[] {
        const out: number[] = [];
        let current = this.editor.index.get(id);
        while (current?.parent) {
            out.push(current.parent.id);
            current = this.editor.index.get(current.parent.id);
        }
        return out.reverse();
    }

    search(request: SearchRequest): SearchOutcome {
        const result = searchTree(this.doc.root, { ...request, limit: SEARCH_LIMIT, budgetMs: SEARCH_BUDGET_MS });
        return {
            hits: result.ids.map((id) => {
                const node = this.editor.get(id).node;
                const text = plainText(node);
                return { id, path: pathOf(this.editor.index, id), kind: node.kind, preview: text.length > 80 ? `${text.slice(0, 80)}…` : text || summarise(node) };
            }),
            error: result.error,
            truncated: result.truncated,
            timedOut: result.timedOut,
        };
    }

    pathOf(id: number): string {
        return pathOf(this.editor.index, id);
    }

    private snapshot(): Snapshot {
        return { root: cloneKeepingIds(this.doc.root), nodes: countNodes(this.doc.root), revision: this.revision };
    }

    private push(snapshot: Snapshot): void {
        this.undoStack.push(snapshot);
        this.undoNodes += snapshot.nodes;
        while (this.undoStack.length > MAX_UNDO_STEPS || (this.undoNodes > MAX_UNDO_NODES && this.undoStack.length > 1)) {
            const dropped = this.undoStack.shift()!;
            this.undoNodes -= dropped.nodes;
        }
    }

    private restore(snapshot: Snapshot): void {
        this.doc.root = snapshot.root;
        this.editor = new TreeEditor(this.doc);
    }

    /** Applies one operation. On any refusal the tree is exactly as it was. */
    apply(operation: EditOperation): EditOutcome {
        const before = this.snapshot();
        const nextId = this.doc.nextId;
        let result;
        try {
            result = this.dispatch(operation);
        } catch (error) {
            this.restore(before);
            this.doc.nextId = Math.max(nextId, this.doc.nextId);
            throw error;
        }
        if (result.changed.length === 0 && operation.op === "nudge") return { changed: [], refreshAll: false, select: result.select, state: this.state() };
        this.push(before);
        this.redoStack = [];
        this.revision = ++this.revisionCounter;
        const rootReplaced = result.changed.includes(this.doc.root.id) && operation.op === "replaceSnbt";
        return { changed: result.changed, refreshAll: rootReplaced, select: result.select, state: this.state() };
    }

    private dispatch(op: EditOperation): { changed: number[]; select: number | null } {
        const e = this.editor;
        switch (op.op) {
            case "setValue":
                return e.setValue(op.id, op.text);
            case "setBool":
                return e.setBool(op.id, op.on);
            case "rename":
                return e.rename(op.id, op.name);
            case "remove":
                return e.remove(op.id);
            case "add":
                return e.add(op.parentId, op.kind, op.name, op.text, op.at);
            case "duplicate":
                return e.duplicate(op.id);
            case "move":
                return e.move(op.id, op.parentId, op.at);
            case "nudge":
                return e.nudge(op.id, op.direction);
            case "replaceSnbt":
                return e.replaceFromSnbt(op.id, op.text);
            case "addSnbt":
                return e.addFromSnbt(op.parentId, op.name, op.text, op.at);
            case "arraySet":
                return e.arraySet(op.id, op.at, op.text);
            case "arrayInsert":
                return e.arrayInsert(op.id, op.at, op.text);
            case "arrayRemove":
                return e.arrayRemove(op.id, op.at);
        }
    }

    undo(): EditOutcome {
        const snapshot = this.undoStack.pop();
        if (snapshot === undefined) return { changed: [], refreshAll: false, select: null, state: this.state() };
        this.undoNodes -= snapshot.nodes;
        this.redoStack.push(this.snapshot());
        this.restore(snapshot);
        this.revision = snapshot.revision;
        return { changed: [], refreshAll: true, select: null, state: this.state() };
    }

    redo(): EditOutcome {
        const snapshot = this.redoStack.pop();
        if (snapshot === undefined) return { changed: [], refreshAll: false, select: null, state: this.state() };
        this.push(this.snapshot());
        this.restore(snapshot);
        this.revision = snapshot.revision;
        return { changed: [], refreshAll: true, select: null, state: this.state() };
    }

    /** What would be saved, compared with what is on disk. */
    pendingChanges(max = 2000): NbtDiff {
        return diffTrees(this.baseline, this.doc.root, max);
    }

    defaultMessage(subject: string): string {
        return describeChanges(this.pendingChanges(50), subject);
    }

    /** Marks the current tree as what is on disk. */
    markSaved(): void {
        this.baseline = cloneKeepingIds(this.doc.root);
        this.savedRevision = this.revision;
    }

    isContainer(id: number): boolean {
        return isContainerKind(this.editor.get(id).node.kind);
    }
}
