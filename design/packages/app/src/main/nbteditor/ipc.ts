/**
 * The NBT editor channel between the main process and the interface.
 *
 * Same shape as the other feature channels: `IpcMain` arrives as a parameter and Electron
 * only as a type, every channel is named once in {@link NBT_EDITOR_CHANNELS} so `dispose`
 * cannot drift from registration, and every handler answers `{ ok, value }` or
 * `{ ok: false, message }` instead of throwing across the process boundary - a refusal such
 * as "a server has this world open" is an ordinary answer the interface shows, not an error.
 */

import type { IpcMain } from "electron";
import { NbtError, type Endianness } from "@worldlens/nbt";
import type { Answer, EditOperation, SaveRequest, SearchRequest } from "./protocol.js";
import { NbtEditorRefusal, type NbtEditorService } from "./service.js";

export const NBT_EDITOR_CHANNELS = [
    "nbtEditor:listProject",
    "nbtEditor:inferProject",
    "nbtEditor:worldStatus",
    "nbtEditor:listChunks",
    "nbtEditor:listBedrock",
    "nbtEditor:openBedrockRecord",
    "nbtEditor:pickFile",
    "nbtEditor:openFile",
    "nbtEditor:openChunk",
    "nbtEditor:describe",
    "nbtEditor:close",
    "nbtEditor:node",
    "nbtEditor:children",
    "nbtEditor:arrayPage",
    "nbtEditor:snbt",
    "nbtEditor:ancestors",
    "nbtEditor:search",
    "nbtEditor:pendingChanges",
    "nbtEditor:defaultMessage",
    "nbtEditor:edit",
    "nbtEditor:undo",
    "nbtEditor:redo",
    "nbtEditor:save",
    "nbtEditor:history",
    "nbtEditor:diffCommit",
    "nbtEditor:diffCurrent",
    "nbtEditor:restore",
] as const;

export interface NbtEditorIpc {
    readonly service: NbtEditorService;
    dispose(): void;
}

export interface NbtEditorIpcOptions {
    readonly service: NbtEditorService;
    /** Opens the system file picker; null when cancelled. */
    readonly pickFile: () => Promise<string | null>;
}

function text(value: unknown, what: string): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 4096) throw new NbtEditorRefusal(`${what} is missing.`);
    return value;
}

function integer(value: unknown, what: string): number {
    if (typeof value !== "number" || !Number.isInteger(value)) throw new NbtEditorRefusal(`${what} is not a whole number.`);
    return value;
}

function record(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new NbtEditorRefusal("The request was not understood.");
    return value as Record<string, unknown>;
}

function boolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

const OPERATIONS = new Set([
    "setValue",
    "setBool",
    "rename",
    "remove",
    "add",
    "duplicate",
    "move",
    "nudge",
    "replaceSnbt",
    "addSnbt",
    "arraySet",
    "arrayInsert",
    "arrayRemove",
]);

function operation(value: unknown): EditOperation {
    const o = record(value);
    if (typeof o.op !== "string" || !OPERATIONS.has(o.op)) throw new NbtEditorRefusal("That edit is not supported.");
    return o as unknown as EditOperation;
}

async function answer<T>(work: () => T | Promise<T>): Promise<Answer<T>> {
    try {
        return { ok: true, value: await work() };
    } catch (error) {
        if (error instanceof NbtEditorRefusal || error instanceof NbtError) return { ok: false, message: error.message };
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, message: message.length > 400 ? `${message.slice(0, 400)}...` : message };
    }
}

export function registerNbtEditorHandlers(
    ipcMain: Pick<IpcMain, "handle" | "removeHandler">,
    options: NbtEditorIpcOptions,
): NbtEditorIpc {
    const { service } = options;
    const handle = (channel: (typeof NBT_EDITOR_CHANNELS)[number], handler: (...args: unknown[]) => unknown): void => {
        ipcMain.handle(channel, (_event, ...args: unknown[]) => answer(() => handler(...args)));
    };

    handle("nbtEditor:listProject", (dir) => service.listProject(text(dir, "The project folder")));
    handle("nbtEditor:inferProject", (file) => service.inferProject(text(file, "The file")));
    handle("nbtEditor:worldStatus", (dir) => service.worldStatus(text(dir, "The project folder")));
    handle("nbtEditor:listChunks", (file) => service.listChunks(text(file, "The region file")));
    handle("nbtEditor:listBedrock", (dir) => service.listBedrock(text(dir, "The Bedrock world folder")));
    handle("nbtEditor:openBedrockRecord", (dir, key) => service.openBedrockRecord(text(dir, "The Bedrock world folder"), text(key, "The record key")));
    handle("nbtEditor:pickFile", () => options.pickFile());
    handle("nbtEditor:openFile", (file, extra) => {
        const o = extra === undefined ? {} : record(extra);
        const endianness = o.endianness === "big" || o.endianness === "little" ? (o.endianness as Endianness) : undefined;
        return service.openFile(text(file, "The file"), {
            ...(typeof o.projectDir === "string" ? { projectDir: o.projectDir } : {}),
            ...(endianness === undefined ? {} : { endianness }),
        });
    });
    handle("nbtEditor:openChunk", (file, index, extra) => {
        const o = extra === undefined ? {} : record(extra);
        const chunk = integer(index, "The chunk");
        if (chunk < 0 || chunk > 1023) throw new NbtEditorRefusal("That chunk number is outside a region.");
        return service.openChunk(text(file, "The region file"), chunk, typeof o.projectDir === "string" ? { projectDir: o.projectDir } : {});
    });
    handle("nbtEditor:describe", (doc) => service.describe(text(doc, "The document")));
    handle("nbtEditor:close", (doc) => service.close(text(doc, "The document")));
    handle("nbtEditor:node", (doc, id) => service.node(text(doc, "The document"), integer(id, "The tag")));
    handle("nbtEditor:children", (doc, id, offset, limit) =>
        service.children(text(doc, "The document"), integer(id, "The tag"), integer(offset, "The offset"), integer(limit, "The limit")),
    );
    handle("nbtEditor:arrayPage", (doc, id, offset, limit) =>
        service.arrayPage(text(doc, "The document"), integer(id, "The tag"), integer(offset, "The offset"), integer(limit, "The limit")),
    );
    handle("nbtEditor:snbt", (doc, id, pretty) => service.snbt(text(doc, "The document"), integer(id, "The tag"), boolean(pretty, true)));
    handle("nbtEditor:ancestors", (doc, id) => service.ancestors(text(doc, "The document"), integer(id, "The tag")));
    handle("nbtEditor:search", (doc, request) => {
        const r = record(request);
        const search: SearchRequest = {
            query: typeof r.query === "string" ? r.query : "",
            regex: boolean(r.regex, false),
            flags: typeof r.flags === "string" ? r.flags : "i",
            names: boolean(r.names, true),
            values: boolean(r.values, true),
        };
        return service.search(text(doc, "The document"), search);
    });
    handle("nbtEditor:pendingChanges", (doc) => service.pendingChanges(text(doc, "The document")));
    handle("nbtEditor:defaultMessage", (doc) => service.defaultMessage(text(doc, "The document")));
    handle("nbtEditor:edit", (doc, op) => service.edit(text(doc, "The document"), operation(op)));
    handle("nbtEditor:undo", (doc) => service.undo(text(doc, "The document")));
    handle("nbtEditor:redo", (doc) => service.redo(text(doc, "The document")));
    handle("nbtEditor:save", (doc, request) => {
        const r = request === undefined ? {} : record(request);
        const save: SaveRequest = {
            ...(typeof r.message === "string" ? { message: r.message.slice(0, 500) } : {}),
            backup: boolean(r.backup, true),
        };
        return service.save(text(doc, "The document"), save);
    });
    handle("nbtEditor:history", (dir, historyPath) =>
        service.listHistory(text(dir, "The project folder"), typeof historyPath === "string" && historyPath.length > 0 ? historyPath : null),
    );
    handle("nbtEditor:diffCommit", (dir, historyPath, sha) =>
        service.diffCommit(text(dir, "The project folder"), text(historyPath, "The file"), text(sha, "The version")),
    );
    handle("nbtEditor:diffCurrent", (doc, sha) => service.diffAgainstCurrent(text(doc, "The document"), text(sha, "The version")));
    handle("nbtEditor:restore", (doc, sha, backup) => service.restore(text(doc, "The document"), text(sha, "The version"), boolean(backup, true)));

    return {
        service,
        dispose(): void {
            for (const channel of NBT_EDITOR_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
