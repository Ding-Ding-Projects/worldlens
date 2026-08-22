/**
 * Plugin-config YAML parsing and editing, comment- and order-preserving.
 *
 * Built on the `yaml` package's `Document`/CST API (`parseDocument`), not `js-yaml`:
 * `js-yaml` produces a plain object and discards comments, key order, indentation style,
 * anchors and aliases on the way there, which is exactly the information a plugin
 * operator's hand-tuned `config.yml` lives or dies by. `yaml`'s CST keeps all of it, and
 * re-stringifying an untouched `Document` reproduces the source byte-for-byte (mod line
 * ending normalisation, which `document.ts` restores separately).
 *
 * Anchors and merge keys are marked read-only. A YAML anchor (`&name`) can be referenced by
 * any number of aliases (`*name`) or merge keys (`<<: *name`) elsewhere in the same file;
 * editing the anchor's own definition through this document model would silently change
 * every node that merges from it, which is worse than refusing the edit. `reconcile.ts`
 * surfaces the refusal as field state `"read-only"` with the reason attached, so the GUI
 * can show *why* a control is disabled instead of just disabling it.
 */

import { Document, isMap, isPair, isScalar, isSeq, parseDocument } from "yaml";
import type { Pair, YAMLMap, YAMLSeq } from "yaml";
import { type ConfigDocument, type EntryNode, detectEol, detectTrailingNewline, hashOf } from "./document.js";
import { type ConfigAnswer, fail, ok } from "./answer.js";

function flattenScalar(value: unknown): unknown {
    if (isScalar(value)) return value.value;
    return value;
}

function isMergeKeyPair(pair: Pair): boolean {
    if (!isScalar(pair.key)) return false;
    const keyValue = pair.key.value;
    if (typeof keyValue === "string" && keyValue === "<<") return true;
    // yaml's `merge: true` option represents `<<` as a Symbol("<<") key rather than the
    // literal string, so a plain `=== "<<"` check on the raw value never matches it.
    return typeof keyValue === "symbol" && keyValue.toString() === "Symbol(<<)";
}

function nodeIsAnchoredOrAliased(pair: Pair): { readonly readOnly: boolean; readonly reason?: string } {
    if (isMergeKeyPair(pair)) {
        return { readOnly: true, reason: "Merge key (<<:); edit the anchored source document instead." };
    }
    const value = pair.value;
    if (value !== null && typeof value === "object" && "anchor" in value && typeof (value as { anchor?: unknown }).anchor === "string") {
        return { readOnly: true, reason: `Anchored as &${(value as { anchor: string }).anchor}; edit through the anchor's own key so every alias stays consistent.` };
    }
    return { readOnly: false };
}

function walk(map: YAMLMap | YAMLSeq, prefix: readonly string[], out: EntryNode[]): void {
    if (isMap(map)) {
        for (const item of map.items) {
            if (!isPair(item)) continue;
            const key = isMergeKeyPair(item) ? "<<" : isScalar(item.key) ? String(item.key.value) : String(item.key);
            const path = [...prefix, key];
            const value = item.value;
            if (isMap(value) || isSeq(value)) {
                walk(value, path, out);
                continue;
            }
            const { readOnly, reason } = nodeIsAnchoredOrAliased(item);
            const entry: EntryNode = {
                kind: "entry",
                path,
                raw: isScalar(value) ? String(value.value) : "",
                value: flattenScalar(value),
                ...(readOnly ? { readOnly: true as const, ...(reason !== undefined ? { readOnlyReason: reason } : {}) } : {}),
            };
            out.push(entry);
        }
        return;
    }
    // A sequence encountered directly (rare at top level for plugin configs) is treated as
    // one opaque leaf keyed by its parent path - lists of scalars are handled by the list
    // control reading `value` as an array, not by walking each item as its own field.
    out.push({ kind: "entry", path: prefix, raw: "", value: map.toJSON() });
}

export function parseYaml(sourceText: string): ConfigAnswer<ConfigDocument> {
    const eol = detectEol(sourceText);
    const trailingNewline = detectTrailingNewline(sourceText);

    let doc: Document;
    try {
        doc = parseDocument(sourceText, { keepSourceTokens: true, merge: true });
    } catch (error) {
        return fail("parse-error", error instanceof Error ? error.message : String(error));
    }
    if (doc.errors.length > 0) {
        return fail("parse-error", doc.errors.map((e) => e.message).join("; "));
    }

    const nodes: EntryNode[] = [];
    const contents = doc.contents;
    if (contents !== null && (isMap(contents) || isSeq(contents))) {
        walk(contents, [], nodes);
    }

    return ok({
        format: "yaml",
        sourceText,
        encoding: "utf8",
        eol,
        trailingNewline,
        nodes,
        hash: hashOf(sourceText),
    });
}

/**
 * Re-parses the ORIGINAL source into a fresh `yaml` `Document`, sets one scalar leaf by
 * path, and re-stringifies - rather than mutating an already-flattened `ConfigDocument`,
 * so every comment, anchor, and untouched key the flattened node list does not carry
 * survives. Refuses on a stale hash, a missing path, or a read-only (anchored/merge-key)
 * target.
 */
export function setYamlValue(document: ConfigDocument, path: readonly string[], value: unknown, expectedHash: string): ConfigAnswer<ConfigDocument> {
    if (expectedHash !== document.hash) return fail("stale-document", `Document changed since it was read (expected ${expectedHash}, have ${document.hash}).`);

    const target = document.nodes.find(
        (node): node is EntryNode => node.kind === "entry" && node.path.length === path.length && node.path.every((segment, i) => segment === path[i]),
    );
    if (target === undefined) return fail("not-found", `No key "${path.join(".")}" in this file.`);
    if (target.readOnly === true) return fail("read-only", target.readOnlyReason ?? `"${path.join(".")}" is read-only.`);

    let doc: Document;
    try {
        doc = parseDocument(document.sourceText, { keepSourceTokens: true, merge: true });
    } catch (error) {
        return fail("parse-error", error instanceof Error ? error.message : String(error));
    }
    if (doc.get(path, true) === undefined && !doc.hasIn(path)) {
        return fail("not-found", `No key "${path.join(".")}" in this file.`);
    }

    doc.setIn(path, value);
    let sourceText = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
    if (document.eol === "\r\n") sourceText = sourceText.replace(/\n/g, "\r\n");
    if (!document.trailingNewline) sourceText = sourceText.replace(/(\r?\n)+$/, "");

    return parseYaml(sourceText);
}
