/**
 * The world downloader's channel between the main process and the renderer.
 *
 * Built like `../dockerworld/ipc.ts`: Electron arrives as a *type*, `IpcMain` is a parameter, and
 * the import is erased at build time, so every channel here is exercised in tests with no Electron
 * runtime, no JVM, no network and no credential store anywhere near them.
 *
 * **No handler here rejects.** Every possible answer, including "there is no Java on this
 * machine", "that port is already taken" and "the settings you sent are not valid", is a sentence
 * the interface has to show. A rejection arrives at the renderer as a bare `Error` with a stack in
 * it, which is unusable as copy and indistinguishable from a bug in the bridge itself.
 *
 * ## The renderer is not trusted, twice
 *
 * Every argument is re-read field by field on the way in, and `worlddownloader:start` runs the
 * shared `validateDownloaderSettings` again before anything is spawned. That is not belt and
 * braces about a bug: a released shell and a released main process are two artefacts that can be
 * different versions of each other, and the renderer's validation decides whether a *button* is
 * enabled while this one decides whether a *JVM* is handed an argument vector. Only one of those
 * is a security boundary.
 *
 * ## What never crosses this bridge
 *
 * The access token. `worlddownloader:saveToken` takes one in and `worlddownloader:clearToken`
 * removes it; nothing here ever sends one back out. `worlddownloader:status` carries the secret
 * *status* - held or not, and since when - and `worlddownloader:start` fetches the token from the
 * credential store inside this process and hands it straight to the spawn. A renderer that wanted
 * to display the token would have nowhere to ask for it.
 */

import { createServer } from "node:net";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
    validateDownloaderSettings,
    versionAnchorForProtocol,
} from "@worldlens/shared/dist/downloaderOptions.js";
import type {
    DownloaderProblem,
    DownloaderSettings,
} from "@worldlens/shared/dist/downloaderOptions.js";
import { ensureDownloaderJar, readJarRecord } from "./jar.js";
import type { DownloaderJarRecord, EnsureJarOptions, EnsureJarResult } from "./jar.js";
import { DEFAULT_MINECRAFT_PORT, pingMinecraftServer } from "./ping.js";
import type { PingOptions, PingResult } from "./ping.js";
import { countWorldChunks } from "./chunks.js";
import { DownloaderRunner } from "./session.js";
import type { CountDownloaderChunks, DownloaderEvent, DownloaderPhase } from "./session.js";
import { DownloaderSecretStore } from "./secret.js";
import type { DownloaderSecretStatus } from "./secret.js";
import {
    defaultDownloaderSettings,
    readDownloaderSettings,
    writeDownloaderSettings,
} from "./settingsStore.js";
import type { SafeStorageLike } from "./credentialStore.js";

/** Renderer broadcast carrying a running session's real events. */
export const DOWNLOADER_EVENT_CHANNEL = "worlddownloader:event" as const;

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const DOWNLOADER_CHANNELS = [
    "worlddownloader:status",
    "worlddownloader:ensureJar",
    "worlddownloader:readSettings",
    "worlddownloader:writeSettings",
    "worlddownloader:testConnection",
    "worlddownloader:start",
    "worlddownloader:stop",
    "worlddownloader:saveToken",
    "worlddownloader:clearToken",
    "worlddownloader:countChunks",
    "worlddownloader:portFree",
] as const;

/**
 * The smallest part of `node:net`'s server this module uses.
 *
 * A narrow structural type for the same reason `ping.ts`'s `SocketLike` is one: it makes a test
 * fake a few lines long instead of a subclass, and it documents exactly how much of a server's
 * behaviour the port probe is allowed to depend on.
 */
export interface PortProbeServer {
    listen(port: number, host: string, listener: () => void): unknown;
    once(event: "error", listener: (error: NodeJS.ErrnoException) => void): unknown;
    close(callback?: () => void): unknown;
}

export type PortProbeFactory = () => PortProbeServer;

export interface DownloaderJavaStatus {
    readonly available: boolean;
    /** Absolute path, or null when there is no usable Java to name. */
    readonly executable: string | null;
}

export interface DownloaderSessionStatus {
    readonly sessionId: string | null;
    readonly phase: DownloaderPhase | null;
    /** Safe to render: the token is masked by the shared argument builder, by index. */
    readonly redactedArguments: readonly string[];
}

export interface DownloaderStatus {
    readonly jar: DownloaderJarRecord | null;
    readonly java: DownloaderJavaStatus;
    readonly session: DownloaderSessionStatus;
    readonly secret: DownloaderSecretStatus;
}

export interface DownloaderSettingsAnswer {
    readonly settings: DownloaderSettings;
    /**
     * False when the answer is the shipped defaults rather than anything anybody chose.
     *
     * This is the provenance line the settings surface renders: "these are the application's own
     * defaults" and "this is what you saved on Tuesday" look identical without it, and the
     * difference decides whether an empty server address is a mistake or an untouched form.
     */
    readonly stored: boolean;
}

export type DownloaderWriteSettingsAnswer =
    | {
          readonly ok: true;
          readonly savedAt: string;
          /** Everything still wrong with what was saved. Saving a half-filled form is allowed. */
          readonly problems: readonly DownloaderProblem[];
      }
    | { readonly ok: false; readonly message: string };

export interface DownloaderConnectionAnswer {
    readonly ping: PingResult;
    /**
     * Whether the server's protocol resolves to the version the person said they would connect
     * with, or null when there is nothing to compare: the ping failed, or the protocol number is
     * older than every anchor the tool carries.
     */
    readonly matchesDeclared: boolean | null;
    /** The version anchor the tool would use for the reported protocol, by name. */
    readonly reportedAnchor: string | null;
    /** What actually happened, in one sentence, whichever way it went. */
    readonly message: string;
}

export type DownloaderStartAnswer =
    | { readonly ok: true; readonly sessionId: string }
    | {
          readonly ok: false;
          readonly message: string;
          readonly problems: readonly DownloaderProblem[];
      };

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

export interface DownloaderIpcOptions {
    readonly dataDir: string;
    readonly safeStorage: SafeStorageLike;
    /**
     * Resolves the Java this application would run the tool with.
     *
     * Named for what the toolchain layer calls it. The wiring is expected to pass a resolver that
     * reports an installation that already exists rather than one that provisions a 200 MB JDK,
     * because `worlddownloader:status` is a call a status surface makes repeatedly and a status
     * poll must never be the thing that starts a download nobody asked for.
     */
    readonly ensureJava?: () => Promise<{ readonly executable: string } | null>;
    readonly onEvent?: (event: DownloaderEvent) => void;
    readonly runner?: DownloaderRunner;
    /** Injected so a test never reaches GitHub for a release. */
    readonly ensureJar?: (options: EnsureJarOptions) => Promise<EnsureJarResult>;
    /** Injected so a test never opens a TCP connection to anything. */
    readonly ping?: (options: PingOptions) => Promise<PingResult>;
    /** Injected so a test never binds a real port on the machine running it. */
    readonly createProbeServer?: PortProbeFactory;
    /** Injected so a test never walks a real world folder. */
    readonly countChunks?: CountDownloaderChunks;
}

export interface DownloaderIpc {
    readonly runner: DownloaderRunner;
    dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * A `DownloaderSettings` out of whatever the renderer sent, or null.
 *
 * Deliberately strict about shape and deliberately silent about *content*: a server address that
 * is empty, or an option value that is out of range, is not a malformed message. It is a form
 * somebody has not finished filling in, and the answer to it is the problems list from
 * `validateDownloaderSettings`, which names the field and says what to do. Null is reserved for a
 * message that is not a settings record at all, which is the only case where there is no field to
 * point at.
 */
function readSettings(value: unknown): DownloaderSettings | null {
    if (!isRecord(value)) return null;
    const server = value["server"];
    const outputFolder = value["outputFolder"];
    const declaredVersion = value["declaredVersion"];
    const account = value["account"];
    if (typeof server !== "string") return null;
    if (typeof outputFolder !== "string") return null;
    if (typeof declaredVersion !== "string") return null;
    if (!isRecord(account)) return null;

    const mode = account["mode"];
    const username = account["username"];
    if (mode !== "microsoft" && mode !== "token" && mode !== "offline") return null;
    if (typeof username !== "string") return null;

    const rawOptions = value["options"];
    const options: Record<string, string | number | boolean> = {};
    if (isRecord(rawOptions)) {
        for (const [key, entry] of Object.entries(rawOptions)) {
            if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
                options[key] = entry;
            }
        }
    }

    return { server, outputFolder, declaredVersion, account: { mode, username }, options };
}

/**
 * Binds the port, closes it again, and reports what happened in words.
 *
 * A bind is the only honest test. Reading a table of listening sockets tells you what is listening
 * now on the interfaces the table covers, whereas the question actually being asked is "will the
 * downloader be allowed to hold this port in a moment", and the answer to that includes permission
 * rules, exclusions reserved by the operating system, and a socket in a lingering close state that
 * no inventory shows.
 *
 * The bind is on `0.0.0.0` rather than loopback because that is where the proxy will listen, and a
 * port that is free on `127.0.0.1` and taken on another interface would produce a cheerful "free"
 * here and a refusal from the tool a second later.
 */
async function probePort(port: number, factory: PortProbeFactory): Promise<DownloaderPortAnswer> {
    return await new Promise<DownloaderPortAnswer>((resolve) => {
        let settled = false;
        const finish = (answer: DownloaderPortAnswer): void => {
            if (settled) return;
            settled = true;
            resolve(answer);
        };

        let server: PortProbeServer;
        try {
            server = factory();
        } catch (error) {
            finish({
                free: false,
                message: `Port ${String(port)} could not be checked on this computer: ${describe(error)}`,
            });
            return;
        }

        server.once("error", (error) => {
            const code = error.code ?? "";
            finish({
                free: false,
                message:
                    code === "EADDRINUSE"
                        ? `Port ${String(port)} is already being used by something else on this computer. Close whatever is holding it, or choose a different proxy port and use that one in Minecraft's server list.`
                        : code === "EACCES"
                          ? `This computer will not let this application listen on port ${String(port)}. Ports below 1024 usually need administrator rights; a port above 1024 will work without them.`
                          : `Port ${String(port)} could not be opened: ${error.message}`,
            });
        });

        try {
            server.listen(port, "0.0.0.0", () => {
                // Closed immediately: the point was to find out whether the bind succeeds, and
                // holding it any longer would mean this check is the thing occupying the port when
                // the download tries to start.
                server.close(() => {
                    finish({
                        free: true,
                        message: `Port ${String(port)} is free on this computer.`,
                    });
                });
            });
        } catch (error) {
            finish({
                free: false,
                message: `Port ${String(port)} could not be opened: ${describe(error)}`,
            });
        }
    });
}

export function registerDownloaderHandlers(
    ipcMain: IpcMain,
    options: DownloaderIpcOptions,
): DownloaderIpc {
    const runner = options.runner ?? new DownloaderRunner();
    const secrets = new DownloaderSecretStore({
        dataDir: options.dataDir,
        safeStorage: options.safeStorage,
    });
    const ensureJar = options.ensureJar ?? ensureDownloaderJar;
    const ping = options.ping ?? pingMinecraftServer;
    const createProbeServer = options.createProbeServer ?? (() => createServer() as PortProbeServer);
    const countChunks = options.countChunks ?? countWorldChunks;

    const resolveJava = async (): Promise<{ executable: string } | null> => {
        if (options.ensureJava === undefined) return null;
        try {
            const resolved = await options.ensureJava();
            return resolved === null ? null : { executable: resolved.executable };
        } catch {
            // A toolchain layer that cannot answer is the same, from here, as one that answers no:
            // there is no Java to run the tool with, and the interface says so rather than showing
            // a stack trace from inside a provisioning routine.
            return null;
        }
    };

    ipcMain.handle("worlddownloader:status", async (): Promise<DownloaderStatus> => {
        const sessionId = runner.activeSessionIds()[0] ?? null;
        const session = sessionId === null ? null : runner.sessionOf(sessionId);
        const java = await resolveJava();

        let jar: DownloaderJarRecord | null = null;
        try {
            jar = readJarRecord(options.dataDir);
        } catch {
            // The record reader already treats missing and malformed as "nothing installed"; this
            // covers a data directory that cannot be read at all, which is the same answer.
            jar = null;
        }

        let secret: DownloaderSecretStatus;
        try {
            secret = secrets.status();
        } catch {
            secret = { held: false, storedAt: null, encryptionAvailable: false };
        }

        return {
            jar,
            java: { available: java !== null, executable: java?.executable ?? null },
            session: {
                sessionId,
                phase: sessionId === null ? null : runner.phaseOf(sessionId),
                redactedArguments: session?.redactedArguments() ?? [],
            },
            secret,
        };
    });

    ipcMain.handle(
        "worlddownloader:ensureJar",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<EnsureJarResult> => {
            // `null` means "not a request for a particular release", which is the ordinary case:
            // get whatever `latest` is. A pinned tag is the exception, so it is the thing that has
            // to be spelled out rather than the default.
            const tag = isRecord(request) && typeof request["tag"] === "string" ? request["tag"] : null;
            try {
                return await ensureJar({
                    dataDir: options.dataDir,
                    ...(tag === null || tag === "" ? {} : { tag }),
                });
            } catch (error) {
                return {
                    ok: false,
                    code: "download-failed",
                    message: `Getting the world downloader failed: ${describe(error)}`,
                };
            }
        },
    );

    ipcMain.handle("worlddownloader:readSettings", (): DownloaderSettingsAnswer => {
        try {
            const stored = readDownloaderSettings(options.dataDir);
            return stored === null
                ? { settings: defaultDownloaderSettings(), stored: false }
                : { settings: stored, stored: true };
        } catch {
            return { settings: defaultDownloaderSettings(), stored: false };
        }
    });

    ipcMain.handle(
        "worlddownloader:writeSettings",
        (_event: IpcMainInvokeEvent, request: unknown): DownloaderWriteSettingsAnswer => {
            const settings = readSettings(request);
            if (settings === null) {
                return {
                    ok: false,
                    message:
                        "The settings could not be saved because the message did not describe a settings record. Nothing on disk was changed.",
                };
            }
            try {
                const written = writeDownloaderSettings(options.dataDir, settings);
                // Saved first and validated second, on purpose. A half-filled form is a perfectly
                // ordinary thing to want to keep, and refusing to save it would lose somebody's
                // work because they had not chosen an output folder yet. The problems come back
                // alongside so the surface can show what is still outstanding.
                return {
                    ok: true,
                    savedAt: written.savedAt,
                    problems: validateDownloaderSettings(settings),
                };
            } catch (error) {
                return {
                    ok: false,
                    message: `The settings could not be written to disk: ${describe(error)}`,
                };
            }
        },
    );

    ipcMain.handle(
        "worlddownloader:testConnection",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<DownloaderConnectionAnswer> => {
            if (!isRecord(request) || typeof request["host"] !== "string" || request["host"].trim() === "") {
                return {
                    ping: {
                        ok: false,
                        code: "dns",
                        message: "Type the address of the server you want to test.",
                    },
                    matchesDeclared: null,
                    reportedAnchor: null,
                    message: "Type the address of the server you want to test.",
                };
            }

            const host = request["host"].trim();
            const rawPort = request["port"];
            const port =
                typeof rawPort === "number" && Number.isInteger(rawPort) && rawPort > 0
                    ? rawPort
                    : DEFAULT_MINECRAFT_PORT;
            const declaredVersion =
                typeof request["declaredVersion"] === "string" ? request["declaredVersion"] : "";

            let result: PingResult;
            try {
                result = await ping({ host, port });
            } catch (error) {
                const message = `The server could not be reached: ${describe(error)}`;
                return {
                    ping: { ok: false, code: "closed", message },
                    matchesDeclared: null,
                    reportedAnchor: null,
                    message,
                };
            }

            if (!result.ok) {
                // The failure reason is carried through rather than flattened into a boolean,
                // because "no such name" and "the connection was refused" send somebody to two
                // completely different places: one is a typo, the other is a server that is off.
                return {
                    ping: result,
                    matchesDeclared: null,
                    reportedAnchor: null,
                    message: result.message,
                };
            }

            const anchor = versionAnchorForProtocol(result.protocol);
            const reportedAnchor = anchor === null ? null : anchor.name;
            const matchesDeclared =
                reportedAnchor === null || declaredVersion === ""
                    ? null
                    : reportedAnchor === declaredVersion;

            return {
                ping: result,
                matchesDeclared,
                reportedAnchor,
                message:
                    reportedAnchor === null
                        ? `${host} answered as ${result.versionName} on protocol ${String(result.protocol)}, which is older than every version the downloader carries. It will very likely refuse the connection.`
                        : matchesDeclared === false
                          ? `${host} answered as ${result.versionName}, which the downloader handles as ${reportedAnchor}. You chose ${declaredVersion}, so connect with a ${reportedAnchor} client or change the version you chose.`
                          : `${host} answered as ${result.versionName}, which the downloader handles as ${reportedAnchor}.`,
            };
        },
    );

    ipcMain.handle(
        "worlddownloader:start",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<DownloaderStartAnswer> => {
            const settings = readSettings(isRecord(request) ? request["settings"] : null);
            if (settings === null) {
                return {
                    ok: false,
                    message: "The message did not describe a settings record, so nothing was started.",
                    problems: [],
                };
            }

            // Run again here rather than trusting that the renderer's Start button was only enabled
            // when it should have been. See this file's header for why that is not paranoia.
            const problems = validateDownloaderSettings(settings);
            if (problems.length > 0) {
                return {
                    ok: false,
                    message:
                        problems.length === 1
                            ? "The download cannot start yet: one setting still needs attention."
                            : `The download cannot start yet: ${String(problems.length)} settings still need attention.`,
                    problems,
                };
            }

            const jar = readJarRecord(options.dataDir);
            if (jar === null) {
                return {
                    ok: false,
                    message:
                        "The world downloader itself has not been downloaded to this computer yet. Get it first, then start the download.",
                    problems: [],
                };
            }

            const java = await resolveJava();
            if (java === null) {
                return {
                    ok: false,
                    message:
                        "There is no Java on this computer for the world downloader to run in. Install the bundled Java from the toolchain screen, then start the download.",
                    problems: [],
                };
            }

            // Fetched here, one line before it is handed over, and never held anywhere else.
            const accessToken = settings.account.mode === "token" ? secrets.take() : null;
            if (settings.account.mode === "token" && accessToken === null) {
                return {
                    ok: false,
                    message:
                        "The account mode is set to an access token but none is stored on this computer. Save a token first, or switch to Microsoft sign-in.",
                    problems: [
                        {
                            field: "account.mode",
                            message: "No access token is stored. Save one, or switch account mode.",
                        },
                    ],
                };
            }

            try {
                const started = runner.start({
                    javaExecutable: java.executable,
                    jarPath: jar.jar,
                    settings,
                    accessToken,
                    // The application's own data directory, which always exists. Every path the
                    // tool receives is absolute, so this is only ever the root a relative path
                    // would resolve against, and a working directory that does not exist is a
                    // spawn failure with an error that names nothing useful.
                    workingDirectory: options.dataDir,
                    onEvent: (event) => options.onEvent?.(event),
                    ...(options.countChunks === undefined ? {} : { countChunks: options.countChunks }),
                });
                return started.ok
                    ? { ok: true, sessionId: started.sessionId }
                    : { ok: false, message: started.message, problems: [] };
            } catch (error) {
                return {
                    ok: false,
                    message: `The download could not be started: ${describe(error)}`,
                    problems: [],
                };
            }
        },
    );

    ipcMain.handle("worlddownloader:stop", (_event: IpcMainInvokeEvent, sessionId: unknown): boolean => {
        if (typeof sessionId !== "string" || sessionId === "") return false;
        try {
            return runner.stop(sessionId);
        } catch {
            return false;
        }
    });

    ipcMain.handle(
        "worlddownloader:saveToken",
        (_event: IpcMainInvokeEvent, token: unknown): DownloaderTokenAnswer => {
            if (typeof token !== "string") {
                return {
                    ok: false,
                    message: "No token was received, so nothing was saved.",
                };
            }
            try {
                return secrets.save(token);
            } catch {
                // Deliberately not the underlying error text: this is the one call in this module
                // whose failure happened with the plaintext in scope.
                return {
                    ok: false,
                    message: "The token could not be saved on this computer, and nothing was written.",
                };
            }
        },
    );

    ipcMain.handle("worlddownloader:clearToken", (): boolean => {
        try {
            return secrets.clear();
        } catch {
            return false;
        }
    });

    ipcMain.handle(
        "worlddownloader:countChunks",
        async (_event: IpcMainInvokeEvent, folder: unknown): Promise<DownloaderChunkAnswer> => {
            if (typeof folder !== "string" || folder.trim() === "") {
                return { ok: false, message: "Choose a folder before asking what is in it." };
            }
            try {
                const counted = await countChunks(folder.trim());
                return {
                    ok: true,
                    total: counted.total,
                    bytes: counted.bytes,
                    dimensions: counted.dimensions.map((entry) => ({
                        dimension: entry.dimension,
                        chunks: entry.chunks,
                    })),
                };
            } catch (error) {
                return { ok: false, message: `That folder could not be read: ${describe(error)}` };
            }
        },
    );

    ipcMain.handle(
        "worlddownloader:portFree",
        async (_event: IpcMainInvokeEvent, port: unknown): Promise<DownloaderPortAnswer> => {
            if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
                return {
                    free: false,
                    message: "A port has to be a whole number between 1 and 65535.",
                };
            }
            try {
                return await probePort(port, createProbeServer);
            } catch (error) {
                return {
                    free: false,
                    message: `Port ${String(port)} could not be checked: ${describe(error)}`,
                };
            }
        },
    );

    return {
        runner,
        dispose(): void {
            for (const channel of DOWNLOADER_CHANNELS) ipcMain.removeHandler(channel);
            // A session outliving the window that started it would keep a port bound on this
            // machine with nothing watching its output and no way for anybody to stop it short of
            // ending the process by hand. Removing the handlers takes away the only route to the
            // stop button, so the stop has to happen here.
            runner.stopAll();
        },
    };
}
