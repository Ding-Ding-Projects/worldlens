/**
 * Renderer-side seam for the Fabric Carpet world downloader.
 *
 * These structural types mirror `preload/index.ts`'s `WorldDownloaderBridge` rather than
 * importing Electron into the UI package, which is also bundled into the documentation site -
 * the same reason `dockerWorldSourceBridge.ts` beside `world/` does it this way.
 */

export interface DownloaderAccount {
    readonly mode: "microsoft" | "token" | "offline";
    readonly username: string;
}

export interface DownloaderSettings {
    readonly server: string;
    readonly outputFolder: string;
    readonly declaredVersion: string;
    readonly account: DownloaderAccount;
    readonly options: Readonly<Record<string, string | number | boolean>>;
}

export interface DownloaderProblem {
    readonly field: string;
    readonly message: string;
}

export interface DownloaderJavaStatus {
    readonly available: boolean;
    readonly executable: string | null;
}

export type DownloaderPhase =
    | "connecting"
    | "signing-in"
    | "downloading"
    | "finishing"
    | "done"
    | "failed";

export interface DownloaderSessionStatus {
    readonly sessionId: string | null;
    readonly phase: DownloaderPhase | null;
    readonly redactedArguments: readonly string[];
}

export interface DownloaderSecretStatus {
    readonly held: boolean;
    readonly savedAt: string | null;
}

export interface DownloaderJarRecord {
    readonly path: string;
    readonly tag: string;
    readonly sha256: string;
}

export interface DownloaderStatus {
    readonly jar: DownloaderJarRecord | null;
    readonly java: DownloaderJavaStatus;
    readonly session: DownloaderSessionStatus;
    readonly secret: DownloaderSecretStatus;
}

export interface DownloaderSettingsAnswer {
    readonly settings: DownloaderSettings;
    readonly stored: boolean;
}

export type DownloaderWriteSettingsAnswer =
    | { readonly ok: true; readonly savedAt: string; readonly problems: readonly DownloaderProblem[] }
    | { readonly ok: false; readonly message: string };

export interface PingResult {
    readonly ok: boolean;
    readonly code?: string;
    readonly message: string;
    readonly protocol?: number;
    readonly versionName?: string;
}

export interface DownloaderConnectionAnswer {
    readonly ping: PingResult;
    readonly matchesDeclared: boolean | null;
    readonly reportedAnchor: string | null;
    readonly message: string;
}

export type DownloaderStartAnswer =
    | { readonly ok: true; readonly sessionId: string }
    | { readonly ok: false; readonly message: string; readonly problems: readonly DownloaderProblem[] };

export type DownloaderChunkAnswer =
    | {
          readonly ok: true;
          readonly total: number;
          readonly bytes: number;
          readonly dimensions: readonly { readonly dimension: string; readonly chunks: number }[];
      }
    | { readonly ok: false; readonly message: string };

export interface DownloaderPortAnswer {
    readonly free: boolean;
    readonly message: string;
}

export type DownloaderTokenAnswer =
    | { readonly ok: true }
    | { readonly ok: false; readonly message: string };

export type EnsureJarResult =
    | { readonly ok: true; readonly record: DownloaderJarRecord }
    | { readonly ok: false; readonly code: string; readonly message: string };

export type DownloaderEvent =
    | { readonly type: "started"; readonly sessionId: string; readonly at: string; readonly redactedArguments: readonly string[] }
    | { readonly type: "log"; readonly sessionId: string; readonly stream: "stdout" | "stderr"; readonly line: string; readonly at: string }
    | { readonly type: "sign-in"; readonly sessionId: string; readonly message: string; readonly at: string }
    | { readonly type: "signed-in"; readonly sessionId: string; readonly at: string }
    | { readonly type: "phase"; readonly sessionId: string; readonly phase: DownloaderPhase; readonly at: string }
    | {
          readonly type: "finished";
          readonly sessionId: string;
          readonly code: number | null;
          readonly exitCode: number | null;
          readonly bytes: number;
          readonly chunks: number;
          readonly dimensions: readonly { readonly dimension: string; readonly chunks: number }[];
          readonly notes: readonly string[];
          readonly at: string;
      };

export interface WorldDownloaderBridge {
    status(): Promise<DownloaderStatus>;
    ensureJar(request?: { readonly tag?: string }): Promise<EnsureJarResult>;
    readSettings(): Promise<DownloaderSettingsAnswer>;
    writeSettings(settings: DownloaderSettings): Promise<DownloaderWriteSettingsAnswer>;
    testConnection(request: {
        readonly host: string;
        readonly port?: number;
        readonly declaredVersion?: string;
    }): Promise<DownloaderConnectionAnswer>;
    start(request: { readonly settings: DownloaderSettings }): Promise<DownloaderStartAnswer>;
    stop(sessionId: string): Promise<boolean>;
    saveToken(token: string): Promise<DownloaderTokenAnswer>;
    clearToken(): Promise<boolean>;
    countChunks(outputFolder: string): Promise<DownloaderChunkAnswer>;
    portFree(port: number): Promise<DownloaderPortAnswer>;
    onWorldDownloaderEvent(listener: (event: DownloaderEvent) => void): () => void;
}

type Host = Partial<{
    worldlens: Partial<{ worldDownloader: Partial<WorldDownloaderBridge> }>;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** Resolves only a complete capability; a picker missing its event path is not complete. */
export function resolveWorldDownloaderBridge(): WorldDownloaderBridge | null {
    const candidate = (globalThis as Host).worldlens?.worldDownloader;
    if (candidate === undefined) return null;
    const required: readonly (keyof WorldDownloaderBridge)[] = [
        "status",
        "ensureJar",
        "readSettings",
        "writeSettings",
        "testConnection",
        "start",
        "stop",
        "saveToken",
        "clearToken",
        "countChunks",
        "portFree",
        "onWorldDownloaderEvent",
    ];
    return required.every((name) => isFunction(candidate[name]))
        ? (candidate as WorldDownloaderBridge)
        : null;
}
