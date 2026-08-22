/**
 * The config document model: a VIEW-independent record of a real config file.
 *
 * The schema (`schemas/*.ts`) describes what a config file SHOULD contain. This module
 * describes what one ACTUALLY contains, node for node, including every comment, blank
 * line, and key the schema has never heard of. The schema is projected onto the document
 * by `reconcile.ts`; it is never the other way around. That ordering is the whole point:
 * an unknown key is a node like any other, so a save that edits one field cannot possibly
 * drop a sibling key the schema does not model - a plugin config a server operator hand
 * edited last week, a datapack-provided key, a field that only exists in a newer Paper
 * build than the one this app happens to ship metadata for.
 *
 * `hash` is a SHA-256 of `sourceText`, kept as the write precondition: every mutating call
 * in this module and in `parseProperties.ts` / `parseYaml.ts` takes an `expectedHash` and
 * refuses to write when it does not match the document's current hash, exactly as
 * `transport/types.ts#WriteReceipt`'s callers already expect from a file write. Two GUIs
 * open on the same file, or a GUI open while an operator hand-edits over SFTP, cannot
 * silently clobber one another's changes.
 */

import { createHash } from "node:crypto";

/** One line of the original file that produced no entry - a comment. */
export interface CommentNode {
    readonly kind: "comment";
    /** The raw line, including its comment marker, without the line ending. */
    readonly raw: string;
}

/** An empty line between entries. */
export interface BlankNode {
    readonly kind: "blank";
}

/**
 * A hint for how to re-serialize a value that round-trips through more than one legal
 * spelling - `true` vs `TRUE` in a `.properties` file, or a YAML block vs flow scalar.
 * Absent means "write it the plain way this format normally would."
 */
export type StyleHint = "properties-case-preserving" | "yaml-block-scalar" | "yaml-flow-scalar" | "yaml-quoted";

/** A real key/value pair. */
export interface EntryNode {
    readonly kind: "entry";
    /** Dotted path for a nested key (YAML); a single segment for `.properties`. */
    readonly path: readonly string[];
    /** The value's exact source text for this entry, before any edit. */
    readonly raw: string;
    /** The parsed value: string | number | boolean | null | array | record. */
    readonly value: unknown;
    readonly styleHint?: StyleHint;
    /**
     * True when this node cannot be edited in place - a YAML anchor's own definition
     * reached through an alias, or a `<<:` merge-key target. Editing the alias site would
     * silently change every node that merges from it, so `reconcile.ts` marks the field
     * `state: "read-only"` and this module refuses the write.
     */
    readonly readOnly?: boolean;
    readonly readOnlyReason?: string;
}

/** A line the parser could not classify as comment, blank, or entry, but must preserve. */
export interface OpaqueNode {
    readonly kind: "opaque";
    readonly raw: string;
}

export type DocumentNode = CommentNode | BlankNode | EntryNode | OpaqueNode;

export type ConfigFileFormat = "properties" | "yaml" | "toml";

export interface ConfigDocument {
    readonly format: ConfigFileFormat;
    /** The exact bytes read from disk, decoded. Never mutated; every edit re-derives it. */
    readonly sourceText: string;
    readonly encoding: "utf8";
    readonly eol: "\n" | "\r\n";
    /** True when the source text's last line was terminated. */
    readonly trailingNewline: boolean;
    /** Every line of the file, in order, including comments and blanks. */
    readonly nodes: readonly DocumentNode[];
    /** SHA-256 of `sourceText`, hex. The write precondition every mutation checks. */
    readonly hash: string;
}

export function hashOf(sourceText: string): string {
    return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

/** Detects the source file's line ending from its first occurrence of `\n`. */
export function detectEol(sourceText: string): "\n" | "\r\n" {
    const index = sourceText.indexOf("\n");
    if (index > 0 && sourceText[index - 1] === "\r") return "\r\n";
    return "\n";
}

export function detectTrailingNewline(sourceText: string): boolean {
    return sourceText.length > 0 && sourceText.endsWith("\n");
}

/** Finds the entry node at `path`, or `undefined` when no such key exists. */
export function findEntry(document: ConfigDocument, path: readonly string[]): EntryNode | undefined {
    for (const node of document.nodes) {
        if (node.kind === "entry" && node.path.length === path.length && node.path.every((segment, i) => segment === path[i])) {
            return node;
        }
    }
    return undefined;
}

/** Every entry node in document order. */
export function listEntries(document: ConfigDocument): readonly EntryNode[] {
    return document.nodes.filter((node): node is EntryNode => node.kind === "entry");
}
