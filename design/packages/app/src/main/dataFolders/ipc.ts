/**
 * The interface's door to the data folder feature.
 *
 * Every handler checks that the sender is the application's own renderer, validates its
 * request by hand (the renderer is not trusted to send well-formed data), and answers with a
 * value. Nothing here rejects: a refusal is `{ ok: false, message }`.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { MoveProgress } from "./move.js";
import type { DataFoldersService, FolderKind, MoveMode } from "./service.js";

export const DATA_FOLDERS_CHANNELS = [
    "dataFolders:status",
    "dataFolders:validate",
    "dataFolders:move",
    "dataFolders:cancel",
    "dataFolders:removeOld",
    "dataFolders:commitNow",
    "dataFolders:changeRemote",
    "dataFolders:pushNow",
    "dataFolders:restart",
    "dataFolders:forgetUnreachable",
] as const;

export const DATA_FOLDERS_PROGRESS_CHANNEL = "dataFolders:progress" as const;
export const DATA_FOLDERS_HISTORY_CHANNEL = "dataFolders:historyEvent" as const;

export interface DataFoldersIpcOptions {
    readonly ipcMain: Pick<IpcMain, "handle" | "removeHandler">;
    readonly service: DataFoldersService;
    readonly authorizeSender: (event: IpcMainInvokeEvent) => boolean;
    readonly sendProgress: (event: IpcMainInvokeEvent, progress: MoveProgress & { readonly kind: FolderKind }) => void;
    /** Records pending history, then restarts the application. Resolves when it is under way. */
    readonly restart: () => Promise<void>;
}

export interface DataFoldersIpc {
    dispose(): void;
}

const REFUSED = { ok: false as const, code: "not-allowed", message: "This request did not come from the application's own window." };

function asKind(value: unknown): FolderKind | null {
    return value === "profile" || value === "save" ? value : null;
}

function asMode(value: unknown): MoveMode | null {
    return value === "move" || value === "copy" || value === "fresh" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function registerDataFoldersHandlers(options: DataFoldersIpcOptions): DataFoldersIpc {
    const { ipcMain, service } = options;

    function guarded<T>(
        channel: (typeof DATA_FOLDERS_CHANNELS)[number],
        handler: (event: IpcMainInvokeEvent, request: Record<string, unknown>) => Promise<T> | T,
    ): void {
        ipcMain.handle(channel, async (event: IpcMainInvokeEvent, request?: unknown) => {
            if (!options.authorizeSender(event)) return REFUSED;
            try {
                return await handler(event, asRecord(request));
            } catch (error) {
                return {
                    ok: false as const,
                    code: "unexpected",
                    message: `That did not work (${(error as NodeJS.ErrnoException).code ?? "unknown"}).`,
                };
            }
        });
    }

    guarded("dataFolders:status", () => service.status());

    guarded("dataFolders:validate", async (_event, request) => {
        const kind = asKind(request["kind"]);
        const mode = asMode(request["mode"]) ?? "move";
        if (kind === null || typeof request["folder"] !== "string") {
            return { ok: false as const, code: "bad-request", message: "Choose a folder first." };
        }
        return await service.validate({ kind, folder: request["folder"], mode });
    });

    guarded("dataFolders:move", async (event, request) => {
        const kind = asKind(request["kind"]);
        const mode = asMode(request["mode"]);
        if (kind === null || mode === null || typeof request["folder"] !== "string") {
            return { ok: false as const, cancelled: false, code: "bad-request", message: "Choose a folder and how to change it." };
        }
        return await service.move({ kind, folder: request["folder"], mode }, (progress) =>
            options.sendProgress(event, { ...progress, kind }),
        );
    });

    guarded("dataFolders:cancel", () => ({ cancelled: service.cancelMove() }));

    guarded("dataFolders:removeOld", async (_event, request) => {
        const kind = asKind(request["kind"]);
        if (kind === null) return { ok: false, message: "Say which folder to remove." };
        return await service.removeOld(kind, request["confirm"] === true);
    });

    guarded("dataFolders:commitNow", async () => {
        const outcome = await service.commitNow();
        return { ok: !outcome.failed, committed: outcome.committed, message: outcome.reason ?? outcome.subject ?? "Saved." };
    });

    guarded("dataFolders:changeRemote", async (_event, request) => {
        const change: {
            enabled?: boolean;
            url?: string | null;
            includeCredentials?: boolean;
            accountId?: string | null;
        } = {};
        if (typeof request["enabled"] === "boolean") change.enabled = request["enabled"];
        if (typeof request["includeCredentials"] === "boolean") change.includeCredentials = request["includeCredentials"];
        if (request["url"] === null || typeof request["url"] === "string") change.url = request["url"] as string | null;
        if (request["accountId"] === null || typeof request["accountId"] === "string") {
            change.accountId = request["accountId"] as string | null;
        }
        return await service.changeRemote(change);
    });

    guarded("dataFolders:pushNow", () => service.pushNow());

    guarded("dataFolders:forgetUnreachable", () => service.forgetUnreachable());

    guarded("dataFolders:restart", async () => {
        await options.restart();
        return { ok: true as const };
    });

    return {
        dispose(): void {
            for (const channel of DATA_FOLDERS_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
