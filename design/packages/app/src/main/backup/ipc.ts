/**
 * The backup channel between the main process and the interface.
 *
 * The twin of `download/ipc.ts` and `config/ipc.ts`, deliberately built to the same shape:
 * `IpcMain` arrives as a **parameter** and Electron only as a *type*, every channel is
 * named once in {@link BACKUP_CHANNELS} so `dispose` cannot drift from `install`, and
 * every progress event is **pushed** rather than polled. Nothing else under `backup/`
 * imports Electron, which is what lets the pack, the split, the pointer and the upload
 * all be tested with no Electron runtime anywhere near them.
 *
 * ## What crosses, and what never does
 *
 * Plain objects, built field by field, because Electron structured-clones what crosses
 * and refuses what it cannot. Errors cross as one sentence: a rejection is turned into a
 * failure object whose message says what could not be done and why, so a subsystem's
 * stack never becomes interface copy.
 *
 * **Authorization never crosses**. One main-process `gh` account lease is resolved per
 * operation. The renderer is told who is signed in and what that account may do, and never
 * receives credential material.
 *
 * ## Two channels that look alike and are not
 *
 * `backup:inspectRepository` reads a repository so the interface can warn about a public
 * one *before* anything is packed. `backup:start` reads it again and refuses to proceed
 * against a public repository without an explicit acknowledgement. The second check is not
 * redundant: the first is a courtesy to the person, the second is the guard, and a guard
 * that lives only in the renderer is not a guard.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { GhCredentialError, ghApiBaseForHost } from "../ghcli/credentialBroker.js";
import type {
    GhCliAccountProvider,
    GhCredentialAccess,
} from "../ghcli/credentialBroker.js";
import type { CiOwnerChoicesAnswer } from "../cirender/setup.js";
import {
    createGhRepository,
    listGhOwners,
    listGhRepositories,
} from "../ghcli/repositories.js";
import { listBackups } from "./catalog.js";
import type { BackupListing } from "./catalog.js";
import type { RepositoryChoice } from "./github.js";
import { BackupRunner } from "./runner.js";
import type {
    BackupEvent,
    BackupRequest,
    BackupResult,
    BackupRunnerOptions,
    RepositoryReport,
} from "./runner.js";
import { inspectBackupSource } from "./source.js";
import type { BackupSourceKind } from "./source.js";

/** The channel every progress, phase, log and outcome event arrives on. */
export const BACKUP_EVENT_CHANNEL = "backup:event";

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
export const BACKUP_CHANNELS = [
    "backup:owners",
    "backup:repositories",
    "backup:createRepository",
    "backup:inspectRepository",
    "backup:inspectSource",
    "backup:list",
    "backup:start",
    "backup:cancel",
    "backup:active",
] as const;

/** What creating a repository from this screen needs, and what it answers with. */
export interface CreateRepositoryRequest {
    readonly accountId?: string | undefined;
    readonly ownerLogin: string;
    readonly ownerKind: "user" | "organization";
    readonly name: string;
    readonly private: boolean;
}

export type CreateRepositoryFailureCode = "name-taken" | "not-signed-in" | "other";

export type CreateRepositoryAnswer =
    | { readonly ok: true; readonly value: RepositoryChoice }
    | {
          readonly ok: false;
          readonly code: CreateRepositoryFailureCode;
          readonly message: string;
          readonly needsSignIn?: boolean | undefined;
      };

export interface BackupIpcOptions {
    readonly ipcMain: IpcMain;
    /** Where backups are staged. A function, so a moved storage folder takes effect. */
    readonly storageDir: () => string;
    /** Secret-free gh command lease for account, owner and repository picker operations. */
    readonly account: GhCliAccountProvider;
    /** Overridable so a test can watch what was broadcast. */
    readonly broadcast: (event: BackupEvent) => void;
    readonly appVersion?: string | null | undefined;
}

export interface BackupIpc {
    readonly runner: BackupRunner;
    dispose(): void;
}

/** Everything a channel answers with, so a rejection never crosses as a raw stack. */
type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export function installBackupIpc(options: BackupIpcOptions): BackupIpc {
    const runnerOptions: BackupRunnerOptions = {
        storageDir: options.storageDir,
        account: options.account,
        onEvent: options.broadcast,
        ...(options.appVersion === undefined ? {} : { appVersion: options.appVersion }),
    };
    const runner = new BackupRunner(runnerOptions);

    const acquireAccount = async (accountId: string | null, access: GhCredentialAccess) =>
        await options.account(accountId ?? undefined, access);

    options.ipcMain.handle(
        "backup:owners",
        async (
            _event: IpcMainInvokeEvent,
            request: { accountId?: unknown } | undefined,
        ): Promise<CiOwnerChoicesAnswer> => {
            try {
                const lease = await acquireAccount(readText(request?.accountId), "read");
                if (lease === null) {
                    return { ok: false, signedIn: false, message: signedOutMessage() };
                }
                return {
                    ok: true,
                    login: lease.login,
                    owners: await listGhOwners(lease),
                };
            } catch (error) {
                return { ok: false, signedIn: true, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "backup:repositories",
        async (
            _event: IpcMainInvokeEvent,
            request: { accountId?: unknown } | undefined,
        ): Promise<Answer<readonly RepositoryChoice[]>> => {
            try {
                const lease = await acquireAccount(readText(request?.accountId), "read");
                if (lease === null) return { ok: false, message: signedOutMessage() };
                return { ok: true, value: await listGhRepositories(lease) };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    /**
     * Creates a brand-new repository, for somebody who has none suitable to pick from the
     * list `backup:repositories` already offers.
     *
     * This never overwrites anything: GitHub itself refuses a name that already exists
     * (see {@link isRepositoryNameTakenError}), so there is no "re-initialise" path here
     * to gate behind a confirmation - the destructive operation this feature could
     * plausibly need super-confirmation for simply does not exist in this module.
     */
    options.ipcMain.handle(
        "backup:createRepository",
        async (
            _event: IpcMainInvokeEvent,
            request: {
                accountId?: unknown;
                ownerLogin?: unknown;
                ownerKind?: unknown;
                name?: unknown;
                private?: unknown;
            },
        ): Promise<CreateRepositoryAnswer> => {
            const ownerLogin = readText(request?.ownerLogin);
            const ownerKind = request?.ownerKind === "organization" ? "organization" : "user";
            const name = readText(request?.name);
            if (ownerLogin === null || name === null) {
                return {
                    ok: false,
                    code: "other",
                    message: "A repository owner and a name are required to create one.",
                };
            }
            try {
                const lease = await acquireAccount(readText(request?.accountId), "write");
                if (lease === null) {
                    return {
                        ok: false,
                        code: "not-signed-in",
                        message: signedOutMessage(),
                        needsSignIn: true,
                    };
                }
                const created = await createGhRepository(lease, {
                    ownerLogin,
                    ownerKind,
                    name,
                    private: request?.private === true,
                });
                return created.ok
                    ? { ok: true, value: created.repository }
                    : {
                          ok: false,
                          code: created.code === "name-taken" ? "name-taken" : "other",
                          message: created.message,
                          ...(created.needsSignIn === true ? { needsSignIn: true } : {}),
                      };
            } catch (error) {
                const needsSignIn = error instanceof GhCredentialError && error.needsSignIn;
                return {
                    ok: false,
                    code: needsSignIn ? "not-signed-in" : "other",
                    message: sentence(error),
                    ...(needsSignIn ? { needsSignIn: true } : {}),
                };
            }
        },
    );

    options.ipcMain.handle(
        "backup:inspectRepository",
        async (
            _event: IpcMainInvokeEvent,
            request: { accountId?: unknown; owner?: unknown; repo?: unknown },
        ): Promise<Answer<RepositoryReport>> => {
            const owner = readText(request?.owner);
            const repo = readText(request?.repo);
            if (owner === null || repo === null) {
                return { ok: false, message: "A repository owner and name are required." };
            }
            try {
                return {
                    ok: true,
                    value: await runner.inspectRepository(
                        owner,
                        repo,
                        readText(request?.accountId) ?? undefined,
                    ),
                };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "backup:inspectSource",
        async (
            _event: IpcMainInvokeEvent,
            request: { kind?: unknown; folder?: unknown },
        ): Promise<Answer<{ kind: BackupSourceKind; folder: string; label: string; files: number; bytes: number; skipped: readonly { name: string; reason: string }[] }>> => {
            const kind = readKind(request?.kind);
            const folder = readText(request?.folder);
            if (kind === null || folder === null) {
                return { ok: false, message: "A folder and what kind of thing it is are required." };
            }
            const inspected = await inspectBackupSource(kind, folder);
            if (!inspected.ok) return { ok: false, message: inspected.failure.message };
            const source = inspected.source;
            return {
                ok: true,
                value: {
                    kind: source.kind,
                    folder: source.folder,
                    label: source.label,
                    files: source.files,
                    bytes: source.bytes,
                    skipped: source.skipped.map((entry) => ({ ...entry })),
                },
            };
        },
    );

    options.ipcMain.handle(
        "backup:list",
        async (
            _event: IpcMainInvokeEvent,
            request: { accountId?: unknown; owner?: unknown; repo?: unknown },
        ): Promise<Answer<readonly BackupListing[]>> => {
            const owner = readText(request?.owner);
            const repo = readText(request?.repo);
            if (owner === null || repo === null) {
                return { ok: false, message: "A repository owner and name are required." };
            }
            try {
                const lease = await acquireAccount(readText(request?.accountId), "read");
                if (lease === null) return { ok: false, message: signedOutMessage() };
                const listings = await listBackups(owner, repo, {
                    fetch: (url, init) => lease.api(url, init),
                    apiBase: ghApiBaseForHost(lease.host),
                });
                return { ok: true, value: listings };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "backup:start",
        async (_event: IpcMainInvokeEvent, request: BackupRequest): Promise<BackupResult> =>
            await runner.backup(request),
    );

    options.ipcMain.handle("backup:cancel", (_event: IpcMainInvokeEvent, backupId: unknown) => {
        return typeof backupId === "string" && runner.cancel(backupId);
    });

    options.ipcMain.handle("backup:active", () => runner.activeBackupIds());

    return {
        runner,
        dispose(): void {
            for (const channel of BACKUP_CHANNELS) options.ipcMain.removeHandler(channel);
        },
    };
}

function readText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function readKind(value: unknown): BackupSourceKind | null {
    return value === "render" || value === "world" ? value : null;
}

function signedOutMessage(): string {
    return (
        "Nobody is signed in through GitHub CLI on this computer. Sign in from GitHub Settings" +
        " to back up to a repository, or to see the backups one already holds."
    );
}

/** One sentence from whatever was thrown, never a stack and never an empty string. */
function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const text = String(error);
    return text.length > 0 ? text : "The backup could not be carried out, and said no more.";
}
