import { toSnbt } from "./snbt.js";
import { isContainerKind, type NbtNode } from "./types.js";

/** One difference between two trees, addressed by path so it reads as `Data.SpawnX: 128 -> 256`. */
export interface NbtChange {
    path: string;
    change: "added" | "removed" | "changed";
    before: string | null;
    after: string | null;
}

export interface NbtDiff {
    changes: NbtChange[];
    /** True when there were more differences than `maxChanges`. */
    truncated: boolean;
}

const MAX_VALUE_TEXT = 160;

function show(node: NbtNode): string {
    return toSnbt(node, { maxLength: MAX_VALUE_TEXT });
}

function sameLeaf(a: NbtNode, b: NbtNode): boolean {
    if (a.kind !== b.kind) return false;
    if (Array.isArray(a.value) && Array.isArray(b.value)) {
        const x = a.value as unknown[];
        const y = b.value as unknown[];
        return x.length === y.length && x.every((v, i) => v === y[i]);
    }
    if (typeof a.value === "number" && typeof b.value === "number" && Number.isNaN(a.value) && Number.isNaN(b.value)) return true;
    return a.value === b.value;
}

function join(base: string, name: string): string {
    return base === "" ? name : `${base}.${name}`;
}

/** Keys children by `name#n`, n counting repeats, so a duplicate name is still comparable. */
function occurrences(children: readonly NbtNode[]): Map<string, NbtNode> {
    const seen = new Map<string, number>();
    const out = new Map<string, NbtNode>();
    for (const child of children) {
        const name = child.name ?? "";
        const n = (seen.get(name) ?? 0) + 1;
        seen.set(name, n);
        out.set(`${name}#${n}`, child);
    }
    return out;
}

function label(path: string, key: string): string {
    const bare = key.replace(/#1$/, "");
    return join(path, bare);
}

/**
 * A semantic comparison: what changed in the data, by name, rather than which bytes moved.
 * Compound members are matched by name (repeated names by occurrence), list members by position.
 */
export function diffTrees(before: NbtNode, after: NbtNode, maxChanges = 2000): NbtDiff {
    const changes: NbtChange[] = [];
    let truncated = false;
    const push = (change: NbtChange): void => {
        if (changes.length >= maxChanges) truncated = true;
        else changes.push(change);
    };
    const walk = (a: NbtNode, b: NbtNode, path: string): void => {
        if (truncated) return;
        if (a.kind !== b.kind) {
            push({ path, change: "changed", before: show(a), after: show(b) });
            return;
        }
        if (!isContainerKind(a.kind)) {
            if (!sameLeaf(a, b)) push({ path, change: "changed", before: show(a), after: show(b) });
            return;
        }
        if (a.kind === "list") {
            const x = a.children ?? [];
            const y = b.children ?? [];
            const shared = Math.min(x.length, y.length);
            for (let i = 0; i < shared; i++) walk(x[i]!, y[i]!, `${path}[${i}]`);
            for (let i = shared; i < x.length; i++) push({ path: `${path}[${i}]`, change: "removed", before: show(x[i]!), after: null });
            for (let i = shared; i < y.length; i++) push({ path: `${path}[${i}]`, change: "added", before: null, after: show(y[i]!) });
            return;
        }
        const left = occurrences(a.children ?? []);
        const right = occurrences(b.children ?? []);
        for (const [key, node] of left) {
            const other = right.get(key);
            if (other === undefined) push({ path: label(path, key), change: "removed", before: show(node), after: null });
            else walk(node, other, label(path, key));
        }
        for (const [key, node] of right) {
            if (!left.has(key)) push({ path: label(path, key), change: "added", before: null, after: show(node) });
        }
    };
    walk(before, after, "");
    return { changes, truncated };
}

/** A short default commit message such as `Edit Data.SpawnX, Data.allowCommands in level.dat`. */
export function describeChanges(diff: NbtDiff, subject: string): string {
    if (diff.changes.length === 0) return `Save ${subject}`;
    const names = diff.changes.slice(0, 3).map((c) => (c.path === "" ? "(root)" : c.path));
    const rest = diff.changes.length - names.length;
    const more = rest > 0 ? ` and ${rest}${diff.truncated ? "+" : ""} more` : "";
    const verb = diff.changes.every((c) => c.change === "added") ? "Add" : diff.changes.every((c) => c.change === "removed") ? "Remove" : "Edit";
    return `${verb} ${names.join(", ")}${more} in ${subject}`;
}
