/**
 * The seam between the data folders settings and the main process.
 *
 * Every type here is a structural mirror of what the Electron preload exposes on
 * `window.worldlens`, restated rather than imported, for the same reason the other bridges
 * restate theirs: this package compiles and runs in three places (the desktop app, a browser
 * tab and under Vitest) and only the first of them has a preload.
 *
 * Nothing here invents a capability. {@link resolveDataFoldersBridge} answers null when the
 * methods a folder change cannot happen without are missing, and the settings say so in words
 * instead of showing controls that do nothing.
 */

export type DataFolderKind = "profile" | "save";
export type DataFolderMoveMode = "move" | "copy" | "fresh";

export interface DataFolderStatusReadout {
    readonly current: string;
    readonly default: string;
    /** A profile folder that has been chosen and will be used after a restart. */
    readonly pendingFolder: string | null;
    /** A chosen profile folder that could not be reached at start. */
    readonly unreachable: string | null;
    /** The folder a move left behind, whose removal can be offered. */
    readonly removableOldFolder: string | null;
}

export interface DataFolderRemoteReadout {
    readonly enabled: boolean;
    readonly url: string | null;
    readonly includeCredentials: boolean;
    readonly accountId: string | null;
    readonly lastPush: {
        readonly at: string;
        readonly sha: string;
        readonly verified: boolean;
    } | null;
    readonly lastError: string | null;
    readonly isLocalNetwork: boolean;
    readonly credentialFilesPresent: boolean;
    readonly excluded: readonly string[];
}

export interface DataFoldersStatusReadout {
    readonly profile: DataFolderStatusReadout;
    readonly save: DataFolderStatusReadout;
    readonly pointerProblem: string | null;
    readonly history: {
        readonly available: boolean;
        readonly gitVersion: string | null;
        readonly unavailableReason: string | null;
        readonly initialised: boolean;
        readonly last: { readonly sha: string; readonly at: string; readonly subject: string } | null;
        readonly lastFailure: string | null;
    };
    readonly remote: DataFolderRemoteReadout;
}

export type DataFolderValidationReadout =
    | { readonly ok: true; readonly folder: string; readonly exists: boolean; readonly freeBytes: number | null }
    | { readonly ok: false; readonly code: string; readonly message: string };

export interface DataFolderProgressReadout {
    readonly kind: DataFolderKind;
    readonly phase: "measuring" | "copying" | "verifying" | "finished";
    readonly filesDone: number;
    readonly filesTotal: number;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly current: string | null;
}

export type DataFolderMoveReadout =
    | {
          readonly ok: true;
          readonly kind: DataFolderKind;
          readonly mode: DataFolderMoveMode;
          readonly folder: string;
          readonly needsRestart: boolean;
          readonly copiedFiles: number;
          readonly copiedBytes: number;
          readonly skipped: readonly { readonly path: string; readonly reason: string }[];
          readonly historyIntact: boolean | null;
          readonly oldFolderRemovable: string | null;
          readonly message: string;
      }
    | { readonly ok: false; readonly cancelled?: boolean; readonly code: string; readonly message: string };

export interface DataFolderPushReadout {
    readonly status: "pushed" | "up-to-date" | "rejected" | "refused" | "failed";
    readonly message: string;
    readonly sha: string | null;
    readonly verified: boolean;
    readonly excluded: readonly string[];
}

export interface DataFolderHistoryEventReadout {
    readonly kind: "committed" | "failed";
    readonly message: string;
    readonly sha: string | null;
}

/** The slice of `window.worldlens` this feature uses. Every member is optional on purpose. */
export interface DataFoldersBridge {
    dataFoldersStatus?: () => Promise<DataFoldersStatusReadout>;
    dataFoldersValidate?: (request: {
        kind: DataFolderKind;
        folder: string;
        mode: DataFolderMoveMode;
    }) => Promise<DataFolderValidationReadout>;
    dataFoldersMove?: (request: {
        kind: DataFolderKind;
        folder: string;
        mode: DataFolderMoveMode;
    }) => Promise<DataFolderMoveReadout>;
    dataFoldersCancel?: () => Promise<{ cancelled: boolean }>;
    dataFoldersRemoveOld?: (request: {
        kind: DataFolderKind;
        confirm: boolean;
    }) => Promise<{ ok: boolean; message: string }>;
    dataFoldersCommitNow?: () => Promise<{ ok: boolean; committed: boolean; message: string }>;
    dataFoldersChangeRemote?: (request: {
        enabled?: boolean;
        url?: string | null;
        includeCredentials?: boolean;
        accountId?: string | null;
    }) => Promise<{ ok: boolean; message: string }>;
    dataFoldersPushNow?: () => Promise<DataFolderPushReadout>;
    dataFoldersRestart?: () => Promise<{ ok: boolean }>;
    dataFoldersForgetUnreachable?: () => Promise<{ ok: boolean; message: string }>;
    setMapStorageDirectory?: (value: string) => Promise<{ ok: boolean; message?: string }>;
    onDataFoldersProgress?: (listener: (progress: DataFolderProgressReadout) => void) => () => void;
    onDataFoldersHistory?: (listener: (event: DataFolderHistoryEventReadout) => void) => () => void;

    /** Used only to list owners and create a private repository for the remote. */
    ghCliListAccounts?: () => Promise<{
        readonly accounts: readonly { readonly id: string; readonly login: string; readonly host: string }[];
    }>;
    listBackupOwners?: (
        accountId?: string,
    ) => Promise<
        | { readonly ok: true; readonly value: readonly { readonly login: string; readonly kind: "user" | "organization" }[] }
        | { readonly ok: false; readonly message: string }
    >;
    createBackupRepository?: (request: {
        accountId?: string;
        ownerLogin: string;
        ownerKind: "user" | "organization";
        name: string;
        private: boolean;
    }) => Promise<
        | { readonly ok: true; readonly value: { readonly fullName: string; readonly htmlUrl: string; readonly private: boolean } }
        | { readonly ok: false; readonly message: string; readonly needsSignIn?: boolean | undefined }
    >;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The preload's bridge when it can move folders at all, otherwise null. */
export function resolveDataFoldersBridge(): DataFoldersBridge | null {
    if (typeof window === "undefined") return null;
    const bridge = (window as unknown as { worldlens?: DataFoldersBridge }).worldlens;
    if (bridge === undefined || !isFunction(bridge.dataFoldersStatus) || !isFunction(bridge.dataFoldersMove)) {
        return null;
    }
    return bridge;
}

/** The repository address to store for a GitHub repository chosen or created in the app. */
export function cloneUrlFor(htmlUrl: string, fullName: string): string {
    const base = htmlUrl.trim() !== "" ? htmlUrl.trim().replace(/\/+$/, "") : `https://github.com/${fullName}`;
    return base.endsWith(".git") ? base : `${base}.git`;
}
