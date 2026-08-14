/** Secret-free renderer IPC for GitHub CLI account metadata and GUI device login. */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { GhCliAccountsStatus, GhCliLogoutResult, GhCliSwitchResult } from "./accounts.js";
import type { GhCredentialBroker } from "./credentialBroker.js";
import type { FetchLike, SleepLike } from "./deviceFlow.js";
import {
    legacyCredentialStatus,
    removeLegacyCredentials,
    type LegacyCredentialRemoval,
    type LegacyCredentialStatus,
} from "./legacyCredentials.js";
import { loginGhCli, type GhCliLoginOptions, type GhCliLoginResult } from "./login.js";
import type { ProcessRunner } from "../cirender/gh.js";

export const GH_CLI_CHANNELS = [
    "ghCli:listAccounts",
    "ghCli:switchAccount",
    "ghCli:logoutAccount",
    "ghCli:startLogin",
    "ghCli:cancelLogin",
    "ghCli:legacyCredentialStatus",
    "ghCli:removeLegacyCredentials",
] as const;

export const GH_CLI_LOGIN_STATE_CHANNEL = "ghCli:loginState" as const;

export interface GhCliCancelLoginResult {
    readonly cancelled: boolean;
    readonly message: string;
}

export type GhCliLoginRunner = (options: GhCliLoginOptions) => Promise<GhCliLoginResult>;

export interface GhCliIpcOptions {
    readonly broker: GhCredentialBroker;
    readonly runner: ProcessRunner;
    readonly userDataDirectory: string;
    readonly fetch?: FetchLike | undefined;
    readonly sleep?: SleepLike | undefined;
    readonly login?: GhCliLoginRunner | undefined;
}

export interface GhCliIpc {
    readonly broker: GhCredentialBroker;
    dispose(): void;
}

function loginState(
    expectedLogin: string | null,
    failureCode: string,
    message: string,
): GhCliLoginResult {
    return {
        ok: false,
        state: {
            stage: "failed",
            host: "github.com",
            expectedLogin,
            userCode: null,
            verificationUri: null,
            verificationUriComplete: null,
            expiresAt: null,
            secondsRemaining: null,
            attempt: 0,
            account: null,
            failureCode,
            requestedScopes: [],
            message,
        },
    };
}

function expectedLoginFrom(request: { expectedLogin?: unknown } | undefined): string | null {
    if (typeof request?.expectedLogin !== "string") return null;
    const login = request.expectedLogin.trim();
    return login.length === 0 || login.length > 100 ? null : login;
}

export function registerGhCliHandlers(ipcMain: IpcMain, options: GhCliIpcOptions): GhCliIpc {
    let activeLogin: { readonly senderId: number; readonly controller: AbortController } | null =
        null;

    ipcMain.handle(
        "ghCli:listAccounts",
        async (): Promise<GhCliAccountsStatus> => await options.broker.listAccounts(),
    );
    ipcMain.handle(
        "ghCli:switchAccount",
        async (
            _event: IpcMainInvokeEvent,
            request: { host?: unknown; login?: unknown } | undefined,
        ): Promise<GhCliSwitchResult> => {
            const host = typeof request?.host === "string" ? request.host : "";
            const login = typeof request?.login === "string" ? request.login : "";
            if (host === "" || login === "") {
                return { ok: false, account: null, message: "Give a host and a login to switch to." };
            }
            return await options.broker.switchAccount(host, login);
        },
    );
    ipcMain.handle(
        "ghCli:logoutAccount",
        async (
            _event: IpcMainInvokeEvent,
            request: { host?: unknown; login?: unknown } | undefined,
        ): Promise<GhCliLogoutResult> => {
            const host = typeof request?.host === "string" ? request.host : "";
            const login = typeof request?.login === "string" ? request.login : "";
            return await options.broker.logoutAccount(host, login);
        },
    );
    ipcMain.handle(
        "ghCli:legacyCredentialStatus",
        async (): Promise<LegacyCredentialStatus> =>
            await legacyCredentialStatus(options.userDataDirectory),
    );
    ipcMain.handle(
        "ghCli:removeLegacyCredentials",
        async (): Promise<LegacyCredentialRemoval> =>
            await removeLegacyCredentials(options.userDataDirectory),
    );

    ipcMain.handle(
        "ghCli:startLogin",
        async (
            event: IpcMainInvokeEvent,
            request: { expectedLogin?: unknown } | undefined,
        ): Promise<GhCliLoginResult> => {
            const expectedLogin = expectedLoginFrom(request);
            if (activeLogin !== null) {
                return loginState(
                    expectedLogin,
                    "login-already-running",
                    "Another gh sign-in is already running. Finish or cancel it before starting another.",
                );
            }
            const executable = await options.broker.executable();
            if (executable === null) {
                return loginState(
                    expectedLogin,
                    "gh-not-installed",
                    "GitHub CLI is not installed in a trusted location. Install it from Dependencies, then try again.",
                );
            }

            const controller = new AbortController();
            activeLogin = { senderId: event.sender.id, controller };
            const cancelWhenSenderCloses = (): void => controller.abort();
            event.sender.once("destroyed", cancelWhenSenderCloses);
            const runLogin = options.login ?? loginGhCli;
            const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
            try {
                return await runLogin({
                    runner: options.runner,
                    executable,
                    fetch: fetchImpl,
                    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
                    ...(expectedLogin === null ? {} : { expectedLogin }),
                    signal: controller.signal,
                    withCredentialStoreLock: (operation) =>
                        options.broker.withCredentialStoreMutation(operation),
                    onState: (state) => {
                        if (!event.sender.isDestroyed()) {
                            event.sender.send(GH_CLI_LOGIN_STATE_CHANNEL, state);
                        }
                    },
                });
            } finally {
                event.sender.removeListener("destroyed", cancelWhenSenderCloses);
                if (activeLogin?.controller === controller) activeLogin = null;
            }
        },
    );

    ipcMain.handle(
        "ghCli:cancelLogin",
        async (event: IpcMainInvokeEvent): Promise<GhCliCancelLoginResult> => {
            if (activeLogin === null || activeLogin.senderId !== event.sender.id) {
                return {
                    cancelled: false,
                    message: "There is no gh sign-in from this window to cancel.",
                };
            }
            activeLogin.controller.abort();
            return { cancelled: true, message: "Cancelling gh sign-in." };
        },
    );

    return {
        broker: options.broker,
        dispose(): void {
            activeLogin?.controller.abort();
            activeLogin = null;
            for (const channel of GH_CLI_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
