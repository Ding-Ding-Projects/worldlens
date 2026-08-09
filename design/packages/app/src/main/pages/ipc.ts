/**
 * The Pages-hosting channel between the main process and the interface.
 *
 * Built to the shape `cirender/ipc.ts` established, for the same reasons: `IpcMain` arrives
 * as a **parameter** and Electron only as a *type*, every channel is named once in
 * {@link PAGES_CHANNELS} so `dispose` cannot drift from `install`, and every progress event is
 * **pushed** rather than polled. Nothing else under `pages/` imports Electron, which is what
 * lets the whole feature - the preflight, the marker guard, the staging, the push, the build
 * poll and the verification - be tested with no Electron runtime anywhere near it.
 *
 * ## Requests are built field by field, never cast
 *
 * Everything on these objects decides which repository gets force-replaced, so
 * `acknowledgePublish` is checked for `true` exactly and a renderer that sends the string
 * `"yes"` has sent no acknowledgement at all. `readTarget` returns null rather than a
 * half-filled object, because a publish to `undefined/undefined` is not a publish this should
 * be having an opinion about at the far end of the pipeline.
 *
 * ## Two checks that look alike and are not
 *
 * `pages:preflight` reads the render and the repository so the interface can show what would
 * happen *before* anything is written. `pages:publish` reads the branch again and refuses if
 * its marker is missing. The second is not redundant: the first is a courtesy, the second is
 * the guard, and a guard that lives only in the renderer is not a guard.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { nodeProcessRunner } from "../cirender/gh.js";
import {
    GhCredentialError,
    type GhCliAccountProvider,
    type GhCredentialAccess,
} from "../ghcli/credentialBroker.js";
import { listGhOwners } from "../ghcli/repositories.js";
import { createScopedProcessRunner } from "../ghcli/scopedRunner.js";
import { PagesHost } from "./hosting.js";
import type {
    PagesCandidate,
    PagesEvent,
    PagesHostOptions,
    PagesOwner,
    PagesPreflight,
    PagesPublishRequest,
    PagesRecord,
    PagesResult,
    PagesStopResult,
    PagesTarget,
} from "./hosting.js";

/** The channel every phase, log, progress and outcome event arrives on. */
export const PAGES_EVENT_CHANNEL = "pages:event";

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
export const PAGES_CHANNELS = [
    "pages:renders",
    "pages:owners",
    "pages:preflight",
    "pages:publish",
    "pages:stop",
    "pages:cancel",
    "pages:active",
    "pages:published",
    "pages:resume",
    "pages:status",
] as const;

/** Everything a channel answers with, so a rejection never crosses as a raw stack. */
export type Answer<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly message: string };

export interface PagesIpcOptions extends PagesHostOptions {
    readonly ipcMain: IpcMain;
    /** Main-process-only gh account broker; credentials never cross IPC. */
    readonly account?: GhCliAccountProvider | undefined;
    /** Overridable so a test can watch what was broadcast. */
    readonly broadcast: (event: PagesEvent) => void;
}

export interface PagesIpc {
    readonly host: PagesHost;
    dispose(): void;
}

export function installPagesIpc(options: PagesIpcOptions): PagesIpc {
    const runner = createScopedProcessRunner(options.runner ?? nodeProcessRunner());
    const host = new PagesHost({
        storageDir: options.storageDir,
        workRoot: options.workRoot,
        onEvent: options.broadcast,
        runner,
        ...(options.probe === undefined ? {} : { probe: options.probe }),
        ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
        ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
        ...(options.pollAttempts === undefined ? {} : { pollAttempts: options.pollAttempts }),
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.committer === undefined ? {} : { committer: options.committer }),
    });

    const withAccount = async <T>(
        request: unknown,
        access: GhCredentialAccess,
        operation: (resolvedAccountId?: string) => Promise<T>,
        durableAccountId?: string | null,
    ): Promise<T> => {
        if (options.account === undefined) {
            return await operation(durableAccountId ?? readAccountId(request) ?? undefined);
        }
        const lease = await options.account(
            durableAccountId ?? readAccountId(request) ?? undefined,
            access,
        );
        if (lease === null) {
            throw new GhCredentialError(
                "account-not-found",
                "No GitHub CLI account is signed in. Add an account from GitHub Settings.",
            );
        }
        return await lease.withAccount(
            async (accountRunner) =>
                await runner.withRunner(accountRunner, async () => await operation(lease.accountId)),
        );
    };

    options.ipcMain.handle("pages:renders", async (): Promise<Answer<readonly PagesCandidate[]>> => {
        try {
            return { ok: true, value: await host.candidates() };
        } catch (error) {
            return { ok: false, message: sentence(error) };
        }
    });

    options.ipcMain.handle("pages:owners", async (_event, request): Promise<Answer<readonly PagesOwner[]>> => {
        try {
            if (options.account === undefined) return { ok: true, value: await host.owners() };
            const lease = await options.account(readAccountId(request) ?? undefined, "read");
            if (lease === null) return { ok: false, message: "No GitHub CLI account is signed in." };
            return { ok: true, value: await listGhOwners(lease) };
        } catch (error) {
            return { ok: false, message: sentence(error) };
        }
    });

    options.ipcMain.handle(
        "pages:preflight",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<Answer<PagesPreflight>> => {
            const parsed = readTarget(request);
            if (parsed === null) {
                return { ok: false, message: "A render, a repository owner and a name are required." };
            }
            try {
                return {
                    ok: true,
                    value: await withAccount(request, "read", async () => await host.preflight(parsed)),
                };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "pages:publish",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<PagesResult> => {
            const parsed = readPublish(request);
            if (parsed === null) {
                return {
                    ok: false,
                    failure: {
                        code: "invalid-request",
                        message: "A render, a repository owner and a name are required.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }
            try {
                return await withAccount(
                    request,
                    "write",
                    async (accountId) =>
                        await host.publish({
                            ...parsed,
                            ...(accountId === undefined ? {} : { accountId }),
                        }),
                );
            } catch (error) {
                return accountFailure(error);
            }
        },
    );

    options.ipcMain.handle(
        "pages:stop",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<PagesStopResult> => {
            const parsed = readTarget(request);
            if (parsed === null) {
                return {
                    ok: false,
                    failure: {
                        code: "invalid-request",
                        message: "A render, a repository owner and a name are required.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }
            try {
                const saved = await host.readRecord(parsed.renderId);
                return await withAccount(
                    request,
                    "write",
                    async () => await host.stopHosting(parsed),
                    saved?.accountId,
                );
            } catch (error) {
                return accountFailure(error);
            }
        },
    );

    options.ipcMain.handle("pages:cancel", (_event: IpcMainInvokeEvent, renderId: unknown) => {
        const id = readText(renderId);
        return id !== null && host.cancel(id);
    });

    options.ipcMain.handle("pages:active", () => host.activeRenderIds());

    options.ipcMain.handle("pages:published", async (): Promise<Answer<readonly PagesRecord[]>> => {
        try {
            return { ok: true, value: await host.records() };
        } catch (error) {
            return { ok: false, message: sentence(error) };
        }
    });

    options.ipcMain.handle(
        "pages:resume",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<PagesResult> => {
            const id = readRenderId(request);
            if (id === null) {
                return {
                    ok: false,
                    failure: {
                        code: "invalid-request",
                        message: "A render id is required to resume a Pages publish.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }
            try {
                const saved = await host.readRecord(id);
                return await withAccount(
                    request,
                    "write",
                    async (accountId) => await host.resume(id, accountId),
                    saved?.accountId,
                );
            } catch (error) {
                return accountFailure(error);
            }
        },
    );

    options.ipcMain.handle(
        "pages:status",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<Answer<PagesRecord>> => {
            const id = readRenderId(request);
            if (id === null) return { ok: false, message: "A render id is required." };
            try {
                const saved = await host.readRecord(id);
                const value = await withAccount(
                    request,
                    "read",
                    async () => await host.refreshStatus(id),
                    saved?.accountId,
                );
                return value === null
                    ? { ok: false, message: "This computer has no recorded Pages site for that render." }
                    : { ok: true, value };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    return {
        host,
        dispose(): void {
            for (const channel of PAGES_CHANNELS) options.ipcMain.removeHandler(channel);
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Reading a request                                                          */
/* -------------------------------------------------------------------------- */

function readTarget(value: unknown): PagesTarget | null {
    if (typeof value !== "object" || value === null) return null;
    const row = value as Record<string, unknown>;
    const renderId = readText(row["renderId"]);
    const owner = readText(row["owner"]);
    const repo = readText(row["repo"]);
    if (renderId === null || owner === null || repo === null) return null;
    const branch = readText(row["branch"]);
    const accountId = readAccountId(value);
    return {
        renderId,
        owner,
        repo,
        ...(accountId === null ? {} : { accountId }),
        ...(branch === null ? {} : { branch }),
    };
}

/**
 * The publish request, with the one field that is a decision read strictly.
 *
 * `acknowledgePublish` is compared to `true` rather than coerced. A renderer that is out of
 * date, or wrong, must not be able to send something truthy and have this read it as somebody
 * having looked at the preflight and agreed.
 */
function readPublish(value: unknown): PagesPublishRequest | null {
    const target = readTarget(value);
    if (target === null) return null;
    const row = value as Record<string, unknown>;
    const visibility = row["visibility"];
    return {
        ...target,
        acknowledgePublish: row["acknowledgePublish"] === true,
        ...(visibility === "public" || visibility === "private" ? { visibility } : {}),
    };
}

function readText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function readAccountId(value: unknown): string | null {
    return typeof value === "object" && value !== null
        ? readText((value as Record<string, unknown>)["accountId"])
        : null;
}

function readRenderId(value: unknown): string | null {
    return readText(value) ??
        (typeof value === "object" && value !== null
            ? readText((value as Record<string, unknown>)["renderId"])
            : null);
}

function accountFailure(error: unknown): { ok: false; failure: {
    code: string;
    message: string;
    detail: null;
    needsGhSignIn: boolean;
} } {
    return {
        ok: false,
        failure: {
            code: error instanceof GhCredentialError ? error.code : "account-failed",
            message: sentence(error),
            detail: null,
            needsGhSignIn: error instanceof GhCredentialError ? error.needsSignIn : false,
        },
    };
}

/** One sentence from whatever was thrown, never a stack and never an empty string. */
function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const value = String(error);
    return value.length > 0 ? value : "The map could not be published, and nothing said why.";
}
