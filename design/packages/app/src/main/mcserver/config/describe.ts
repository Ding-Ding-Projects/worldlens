/**
 * Reading a server's configuration file and describing every key as a real control.
 *
 * The parsers, the schemas and the reconciler all existed and none of them could be
 * reached from the interface. The consequence was exactly what the missing seam always
 * causes: the editor grew its own partial copy of the `server.properties` schema, and every
 * other file fell back to a raw text box - the one thing this whole feature was built to
 * remove. A schema declared in two places drifts, and the copy that drifts is the one
 * somebody is actually looking at.
 *
 * So this is the joining piece. Given a server and a path it reads the file through that
 * server's transport, parses it into a document that keeps every byte, describes the keys
 * the shipped schema knows, infers a control for the keys nobody has ever described, and
 * hands back a list the renderer can draw without knowing any of that happened.
 *
 * The important consequence: a plugin config nobody has written a schema for still arrives
 * as switches, steppers and pickers, because `inferSchema` reads the values themselves.
 * There is no file for which the honest answer is a textarea.
 */

import { basename } from "node:path";

import type { Control, FieldMeta } from "@worldlens/config";
import { hashOf, type ConfigDocument, type EntryNode } from "./document.js";
import { inferField } from "./inferSchema.js";
import { parseProperties, serializeProperties, setPropertiesValue } from "./parseProperties.js";
import { parseYaml, setYamlValue } from "./parseYaml.js";
import { parseToml, serializeToml, setTomlValue } from "./parseToml.js";
import { reconcile, type ReconciledField } from "./reconcile.js";
import { resolveSchema } from "./schemas/index.js";
import { fail, ok, type Answer } from "../transport/types.js";
import type { ServerTransport } from "../transport/types.js";

/** How a file's bytes are read as structure. Chosen from the name, not guessed per line. */
export type ConfigFormat = "properties" | "yaml" | "json" | "toml" | "text";

/**
 * Which parser a file needs.
 *
 * By name rather than by sniffing the contents: `server.properties` and a plugin's
 * `config.yml` are both mostly `key: value` lines to a sniffer, and getting that wrong
 * rewrites one in the other's syntax on the first save.
 */
export function formatFor(path: string): ConfigFormat {
    const name = basename(path).toLowerCase();
    if (name.endsWith(".properties") || name === "eula.txt") return "properties";
    if (name.endsWith(".yml") || name.endsWith(".yaml")) return "yaml";
    if (name.endsWith(".json")) return "json";
    if (name.endsWith(".toml")) return "toml";
    return "text";
}

/** The file kind a schema is looked up by. */
export function fileKindFor(path: string): string {
    return basename(path).toLowerCase();
}

/** One key, as the renderer needs it: a control, a value, and why it is what it is. */
export interface DescribedField {
    readonly path: readonly string[];
    /** Dotted, for search and for addressing a change. */
    readonly key: string;
    readonly control: Control;
    readonly label: string;
    readonly help: string | null;
    readonly group: string;
    readonly value: unknown;
    readonly state: ReconciledField["state"];
    /** True when the control was worked out from the value rather than hand-authored. */
    readonly guessed: boolean;
    /** Set when the field must not be edited - an alias, a merge key. */
    readonly readOnlyReason: string | null;
}

export interface DescribedFile {
    readonly path: string;
    readonly fileKind: string;
    readonly format: ConfigFormat;
    /** The write precondition. A save quotes this back. */
    readonly hash: string;
    readonly fields: readonly DescribedField[];
    /** True when nothing could be parsed and the fields are therefore empty. */
    readonly unreadable: boolean;
}

function labelFor(path: readonly string[]): string {
    const leaf = path[path.length - 1] ?? "";
    return leaf
        .replace(/[_-]+/g, " ")
        .replace(/^./, (character) => character.toUpperCase());
}

function describeReconciled(field: ReconciledField): DescribedField {
    const key = field.path.join(".");
    const meta = field.meta;
    const control: Control = meta?.control ?? field.inferred?.control ?? { kind: "text" };

    return {
        path: field.path,
        key,
        control,
        label: meta?.label ?? labelFor(field.path),
        help: meta?.doc ?? null,
        group: meta?.group ?? "Other settings",
        value: field.currentValue,
        state: field.state,
        guessed: field.inferred?.guessed === true,
        readOnlyReason: field.readOnlyReason ?? null,
    };
}

/**
 * Describes every entry in a document that no schema covered.
 *
 * Used when there is no schema at all, which is the ordinary case for a plugin's own
 * configuration. Every entry is inferred, so the result is still a set of real controls.
 */
function describeWithoutSchema(document: ConfigDocument): readonly DescribedField[] {
    const entries = document.nodes.filter((node): node is EntryNode => node.kind === "entry");
    const siblings = entries.map((entry) => entry.value);

    return entries.map((entry) => {
        const key = entry.path.join(".");
        const inferred = inferField(entry.path[entry.path.length - 1] ?? key, entry.value, siblings);
        return {
            path: entry.path,
            key,
            control: inferred.control,
            label: labelFor(entry.path),
            help: null,
            // Nested keys group by their parent, which is what makes a deep Paper config
            // navigable rather than one list of four hundred rows.
            group: entry.path.length > 1 ? entry.path.slice(0, -1).join(".") : "Settings",
            value: entry.value,
            state: "unknown" as const,
            guessed: true,
            readOnlyReason: entry.readOnlyReason ?? null,
        };
    });
}

function parseFor(format: ConfigFormat, text: string): ConfigDocument | null {
    if (format === "properties") {
        const parsed = parseProperties(text);
        return parsed.ok ? parsed.value : null;
    }
    if (format === "yaml" || format === "json") {
        const parsed = parseYaml(text);
        return parsed.ok ? parsed.value : null;
    }
    if (format === "toml") {
        const parsed = parseToml(text);
        return parsed.ok ? parsed.value : null;
    }
    return null;
}

export interface DescribeOptions {
    readonly transport: ServerTransport;
    readonly path: string;
    readonly flavour: string;
    readonly version: string;
}

/** Reads one configuration file and describes every key in it. */
export async function describeConfigFile(options: DescribeOptions): Promise<Answer<DescribedFile>> {
    const read = await options.transport.fileRead(options.path);
    if (!read.ok) return read;

    const text = Buffer.from(read.value.bytes).toString("utf8");
    const format = formatFor(options.path);
    const fileKind = fileKindFor(options.path);
    const document = parseFor(format, text);

    if (document === null) {
        // A file that could not be parsed is reported as unreadable rather than rewritten
        // from an empty document, because rewriting is indistinguishable from deleting it.
        return ok({
            path: options.path,
            fileKind,
            format,
            hash: read.value.hash,
            fields: [],
            unreadable: true,
        });
    }

    const schema: readonly FieldMeta[] | undefined = resolveSchema(fileKind, options.flavour, options.version);
    const fields =
        schema === undefined
            ? describeWithoutSchema(document)
            : reconcile(document, schema).map(describeReconciled);

    return ok({
        path: options.path,
        fileKind,
        format,
        // The document's own hash, not the blob's: a save is checked against the text that
        // was parsed, which is the thing the caller actually edited.
        hash: document.hash,
        fields,
        unreadable: false,
    });
}

export interface ConfigChange {
    readonly path: readonly string[];
    readonly value: unknown;
}

export interface ApplyOptions {
    readonly transport: ServerTransport;
    readonly path: string;
    readonly changes: readonly ConfigChange[];
    /** The hash the caller last read. A save is refused if the file moved since. */
    readonly expectedHash: string;
}

/**
 * Applies changes to one file and writes it back.
 *
 * Every change is applied to the document in memory first, and the whole result is written
 * once. Writing per change would leave the file in a state that is half of what was asked
 * for if the third of five failed, and a half-applied configuration is worse than a
 * refused one because nothing reports it.
 */
export async function applyConfigChanges(options: ApplyOptions): Promise<Answer<{ hash: string }>> {
    const read = await options.transport.fileRead(options.path);
    if (!read.ok) return read;

    const text = Buffer.from(read.value.bytes).toString("utf8");
    const format = formatFor(options.path);
    const parsed = parseFor(format, text);
    if (parsed === null) {
        return fail("invalid-request", "That file could not be read as configuration, so it was not changed.");
    }
    let document: ConfigDocument = parsed;

    if (document.hash !== options.expectedHash) {
        return fail(
            "stale-document",
            "That file changed since it was opened here.",
            "Something else - the server itself, or a plugin - rewrote it. Saving now would discard whatever it wrote.",
        );
    }

    for (const change of options.changes) {
        const applied =
            format === "properties"
                ? setPropertiesValue(document, change.path.join("."), change.value, document.hash)
                : format === "toml"
                  ? setTomlValue(document, change.path, change.value, document.hash)
                  : setYamlValue(document, change.path, change.value, document.hash);
        if (!applied.ok) {
            return fail(
                "invalid-request",
                `That change to ${change.path.join(".")} could not be applied.`,
                applied.failure.message,
            );
        }
        document = applied.value;
    }

    const next = format === "properties" ? serializeProperties(document) : format === "toml" ? serializeToml(document) : document.sourceText;
    const written = await options.transport.fileWrite(options.path, new Uint8Array(Buffer.from(next, "utf8")), {
        expectedHash: read.value.hash,
    });
    if (!written.ok) return written;

    return ok({ hash: hashOf(next) });
}
