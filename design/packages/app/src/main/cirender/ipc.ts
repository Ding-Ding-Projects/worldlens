/**
 * The CI-render channel between the main process and the interface.
 *
 * The fourth of its kind, built to the shape `backup/ipc.ts`, `download/ipc.ts` and
 * `config/ipc.ts` established: `IpcMain` arrives as a **parameter** and Electron only as a
 * *type*, every channel is named once in {@link CIRENDER_CHANNELS} so `dispose` cannot
 * drift from `install`, and every progress event is **pushed** rather than polled. Nothing
 * else under `cirender/` imports Electron, which is what lets the whole loop - the
 * fingerprint, the plan, the dispatch, the polling, the collector - be tested with no
 * Electron runtime anywhere near it.
 *
 * ## Authorization never crosses, and neither does the EULA decision
 *
 * One credential lease is acquired here, per operation, from the main-process `gh` account
 * broker. The renderer learns whether somebody is signed in only from a refusal that says
 * so; credential material never crosses this boundary.
 *
 * `eulaAccepted` is a **reader** the application supplies, and there is deliberately no
 * channel that sets it. Mojang's licence is accepted in the one place that already asks,
 * and a second door onto that decision - especially one a render screen could push
 * somebody through - is how a legal acceptance becomes a button people click to get on
 * with what they were doing.
 *
 * ## Two checks that look alike and are not
 *
 * `cirender:preflight` reads the repository so the interface can warn about a public one,
 * and say what would be uploaded, *before* anything is packed. `cirender:start` reads it
 * again and refuses to proceed without the acknowledgements. The second is not redundant:
 * the first is a courtesy, the second is the guard, and a guard that lives only in the
 * renderer is not a guard.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { RepositoryReport } from "../backup/index.js";
import type { GhCliAccountProvider, GhCredentialAccess } from "../ghcli/credentialBroker.js";
import { GhCredentialError } from "../ghcli/credentialBroker.js";
import {
    createGhRepository,
    listGhOwners,
    listGhRepositories,
    viewGhRepository,
    type GhRepositoryCreateResult,
    type GhRepositoryChoice,
} from "../ghcli/repositories.js";
import type { LocalMapHandler } from "../render/LocalMapHandler.js";
import { RENDER_WORKFLOW_FILE } from "./actions.js";
import { bootstrapCiRepository } from "./bootstrap.js";
import type { CiBootstrapEvent, CiBootstrapResult } from "./bootstrap.js";
import { isCiScheduleCadence, readCiSchedule, writeCiSchedule } from "./schedule.js";
import type { CiScheduleStatus, CiScheduleWriteResult } from "./schedule.js";
import { CiRenderSync } from "./sync.js";
import type {
    CiPreflight,
    CiSyncFailure,
    CiSyncEvent,
    CiSyncRequest,
    CiSyncResult,
    CiRenderSyncOptions,
} from "./sync.js";
import type { CiSyncState } from "./state.js";
import { resolveTransport } from "./transport.js";
import type { CiTransport, RouteReport } from "./transport.js";
import { suggestCiRepositoryName } from "./setup.js";
import type { CiOwnerChoicesAnswer, CiRepositoryNameAvailability } from "./setup.js";
import { CiWorkflowTemplateError, loadCiWorkflowTemplates } from "./workflowTemplates.js";
import { saveCloudRenderConfig } from "./cloudConfig.js";
import type { CloudRenderConfigInput, CloudRenderConfigSaveResult } from "./cloudConfig.js";

/** The channel every phase, log, run-state and outcome event arrives on. */
export const CIRENDER_EVENT_CHANNEL = "cirender:event";

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
export const CIRENDER_CHANNELS = [
    "cirender:preflight",
    "cirender:start",
    "cirender:resume",
    "cirender:check",
    "cirender:list",
    "cirender:cancel",
    "cirender:forget",
    "cirender:active",
    // The "What, and where" setup card's own data: who could own the repository, a name
    // worth trying, and whether GitHub already has it. Pure additions beside the sync
    // loop above - none of the three touches `sync`, `state.js` or a running job.
    "cirender:owners",
    "cirender:repositories",
    "cirender:suggestRepoName",
    "cirender:checkRepoName",
    "cirender:createRepository",
    // Scheduled re-rendering's own configuration screen: reading
    // .github/workflows/scheduled-render.yml's last report, and turning it on or off.
    "cirender:scheduleRead",
    "cirender:scheduleWrite",
    // Preparing a repository that has never had the render workflow committed to it. A
    // truly empty repository gets an actionable starter-commit refusal - see `bootstrap.ts`.
    "cirender:bootstrap",
    "cirender:createCloudConfig",
    "cirender:cancelCloudConfig",
] as const;

/** Every `CiBootstrapEvent` a bootstrap in progress emits arrives on this channel. */
export const CIRENDER_BOOTSTRAP_EVENT_CHANNEL = "cirender:bootstrapEvent";

export interface CiRenderIpcOptions {
    readonly ipcMain: IpcMain;
    /** Where maps and sync records live. A function, so a moved storage folder takes effect. */
    readonly storageDir: () => string;
    /** The application's own data root for project history; old callers fall back to storageDir. */
    readonly historyDataDir?: (() => string) | undefined;
    /** Secret-free gh command lease for account, owner and repository routing. */
    readonly account: GhCliAccountProvider;
    /** Whether Mojang's EULA has been accepted here. Read only; never set from a channel. */
    readonly eulaAccepted: () => boolean | Promise<boolean>;
    /** Overridable so a test can watch what was broadcast. */
    readonly broadcast: (event: CiSyncEvent) => void;
    /** Every `CiBootstrapEvent` a repository preparation in progress emits. */
    readonly broadcastBootstrap?: ((event: CiBootstrapEvent) => void) | undefined;
    readonly mounts?: LocalMapHandler | undefined;
    readonly appVersion?: string | null | undefined;
    /** Installed builds must use only their own complete packaged workflow resources. */
    readonly packaged?: boolean | undefined;
    readonly resourcesDir?: string | undefined;
    readonly pollIntervalMs?: number | undefined;
    readonly runLookupAttempts?: number | undefined;
    readonly sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
}

export interface CiRenderIpc {
    readonly sync: CiRenderSync;
    dispose(): void;
}

/** Everything a channel answers with, so a rejection never crosses as a raw stack. */
type Answer<T> =
    { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export function installCiRenderIpc(options: CiRenderIpcOptions): CiRenderIpc {
    const syncOptions: CiRenderSyncOptions = {
        storageDir: options.storageDir,
        eulaAccepted: options.eulaAccepted,
        onEvent: options.broadcast,
        account: options.account,
        ...(options.mounts === undefined ? {} : { mounts: options.mounts }),
        ...(options.appVersion === undefined ? {} : { appVersion: options.appVersion }),
        ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
        ...(options.runLookupAttempts === undefined
            ? {}
            : { runLookupAttempts: options.runLookupAttempts }),
        ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    };
    const sync = new CiRenderSync(syncOptions);
    const scheduleWrites = new Set<string>();
    const cloudConfigCancels = new Map<string, AbortController>();

    const acquireAccount = async (
        accountId: string | undefined,
        access: GhCredentialAccess,
        signal?: AbortSignal,
    ) => await options.account(accountId, access, signal);

    options.ipcMain.handle(
        "cirender:preflight",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<Answer<CiPreflight>> => {
            const parsed = readRequest(request);
            if (parsed === null) {
                return {
                    ok: false,
                    message: "A world folder, a repository owner and a name are required.",
                };
            }
            try {
                const result = await sync.preflight(parsed);
                return result.ok
                    ? { ok: true, value: result.preflight }
                    : { ok: false, message: result.failure.message };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "cirender:start",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<CiSyncResult> => {
            const parsed = readRequest(request);
            if (parsed === null) {
                return {
                    ok: false,
                    syncId: "nowhere",
                    failure: {
                        code: "invalid-request",
                        message: "A world folder, a repository owner and a name are required.",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                        needsEula: false,
                        route: null,
                        run: null,
                        failingJob: null,
                        logExcerpt: null,
                    },
                };
            }
            return await sync.sync(parsed);
        },
    );

    options.ipcMain.handle(
        "cirender:check",
        async (_event: IpcMainInvokeEvent, syncId: unknown): Promise<CiSyncResult> => {
            const id = readText(syncId);
            if (id === null) {
                return {
                    ok: false,
                    syncId: "nowhere",
                    failure: {
                        code: "invalid-request",
                        message: "A sync id is required.",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                        needsEula: false,
                        route: null,
                        run: null,
                        failingJob: null,
                        logExcerpt: null,
                    },
                };
            }
            return await sync.check(id);
        },
    );

    options.ipcMain.handle(
        "cirender:resume",
        async (_event: IpcMainInvokeEvent, syncId: unknown): Promise<CiSyncResult> => {
            const id = readText(syncId);
            if (id === null) {
                return {
                    ok: false,
                    syncId: "nowhere",
                    failure: {
                        code: "invalid-request",
                        message: "A sync id is required to resume a recorded render.",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                        needsEula: false,
                        route: null,
                        run: null,
                        failingJob: null,
                        logExcerpt: null,
                    },
                };
            }
            return await sync.resume(id);
        },
    );

    options.ipcMain.handle("cirender:list", async (): Promise<Answer<readonly CiSyncState[]>> => {
        try {
            const ids = await sync.knownSyncIds();
            const states: CiSyncState[] = [];
            for (const id of ids) {
                const state = await sync.readState(id);
                // A record this build cannot read is left out rather than represented by a
                // half-filled row. `readCiSyncState` already refuses to guess; showing an
                // invented entry here would undo that.
                if (state !== null) states.push(state);
            }
            return { ok: true, value: states };
        } catch (error) {
            return { ok: false, message: sentence(error) };
        }
    });

    options.ipcMain.handle("cirender:cancel", (_event: IpcMainInvokeEvent, syncId: unknown) => {
        const id = readText(syncId);
        return id !== null && sync.cancel(id);
    });

    options.ipcMain.handle(
        "cirender:forget",
        async (_event: IpcMainInvokeEvent, syncId: unknown) => {
            const id = readText(syncId);
            return id !== null && (await sync.forget(id));
        },
    );

    // What this process is actively driving right now, independent of what has been
    // persisted to disk. `cirender:list` answers "every sync this computer has a record
    // of" by reading `storageDir()`, and a sync writes its first record only partway
    // through `sync()` - after the repository is read, the world is fingerprinted, and
    // (when reusable) GitHub is asked whether the previous asset is still there. A window
    // that opens in that gap would see nothing for a render already running elsewhere,
    // exactly the failure `backup/ipc.ts`'s own `backup:active` exists to close for
    // backups. The bridge (`ciRenderBridge.ts`) wires this to `CiRenders.reconcile()`.
    options.ipcMain.handle("cirender:active", () => sync.activeSyncIds());

    // The setup card's account, owner and repository answers are all produced by gh itself.
    // No credential is requested from gh and none exists in these renderer-visible shapes.
    //
    // `cirender:owners` takes an optional account id so the account picker can re-resolve
    // this list for whichever stored account was chosen rather than always the active one.
    // Omitted, this behaves exactly as it did before the picker existed.
    options.ipcMain.handle(
        "cirender:owners",
        async (
            _event: IpcMainInvokeEvent,
            request: { accountId?: unknown } | undefined,
        ): Promise<CiOwnerChoicesAnswer> => {
            const accountId = readText(request?.accountId);
            try {
                const lease = await acquireAccount(accountId ?? undefined, "read");
                if (lease === null) {
                    return {
                        ok: false,
                        signedIn: false,
                        message:
                            "No GitHub CLI account is signed in. Add an account from GitHub Settings.",
                    };
                }
                return {
                    ok: true,
                    login: lease.login,
                    owners: await listGhOwners(lease),
                };
            } catch (error) {
                // listCiOwnerChoices already turns its own failures into a result rather
                // than a throw; this is a last resort for anything that got past that.
                return { ok: false, signedIn: true, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "cirender:repositories",
        async (
            _event: IpcMainInvokeEvent,
            request: { accountId?: unknown } | undefined,
        ): Promise<Answer<readonly GhRepositoryChoice[]>> => {
            try {
                const lease = await acquireAccount(
                    readText(request?.accountId) ?? undefined,
                    "read",
                );
                if (lease === null) {
                    return {
                        ok: false,
                        message:
                            "No GitHub CLI account is signed in. Add an account from GitHub Settings.",
                    };
                }
                return { ok: true, value: await listGhRepositories(lease) };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "cirender:suggestRepoName",
        (_event: IpcMainInvokeEvent, sourceName: unknown): string =>
            suggestCiRepositoryName(typeof sourceName === "string" ? sourceName : ""),
    );

    options.ipcMain.handle(
        "cirender:checkRepoName",
        async (
            _event: IpcMainInvokeEvent,
            request: unknown,
        ): Promise<CiRepositoryNameAvailability> => {
            const record =
                typeof request === "object" && request !== null
                    ? (request as Record<string, unknown>)
                    : {};
            const accountId = readText(record["accountId"]);
            const owner = readText(record["owner"]) ?? "";
            const repo = readText(record["repo"]) ?? "";
            try {
                const lease = await acquireAccount(accountId ?? undefined, "read");
                if (lease === null) {
                    return {
                        status: "unknown",
                        owner,
                        repo,
                        message:
                            "No GitHub CLI account is signed in. Add an account from GitHub Settings.",
                    };
                }
                const viewed = await viewGhRepository(lease, owner, repo);
                if (viewed.status === "missing") return { status: "available", owner, repo };
                if (viewed.status === "failed") {
                    return { status: "unknown", owner, repo, message: viewed.message };
                }
                return {
                    status: "taken",
                    owner,
                    repo,
                    private: viewed.repository.private,
                    htmlUrl: viewed.repository.htmlUrl,
                };
            } catch (error) {
                return { status: "unknown", owner, repo, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "cirender:createRepository",
        async (
            _event: IpcMainInvokeEvent,
            request:
                | {
                      accountId?: unknown;
                      ownerLogin?: unknown;
                      ownerKind?: unknown;
                      name?: unknown;
                      private?: unknown;
                  }
                | undefined,
        ): Promise<GhRepositoryCreateResult> => {
            const ownerLogin = readText(request?.ownerLogin);
            const name = readText(request?.name);
            if (ownerLogin === null || name === null) {
                return {
                    ok: false,
                    code: "invalid-request",
                    message: "A repository owner and name are required.",
                };
            }
            try {
                const lease = await acquireAccount(
                    readText(request?.accountId) ?? undefined,
                    "write",
                );
                if (lease === null) {
                    return {
                        ok: false,
                        code: "cli-failed",
                        message:
                            "No GitHub CLI account is signed in. Add an account from GitHub Settings.",
                        needsSignIn: true,
                    };
                }
                return await createGhRepository(lease, {
                    ownerLogin,
                    ownerKind: request?.ownerKind === "organization" ? "organization" : "user",
                    name,
                    private: request?.private !== false,
                });
            } catch (error) {
                const needsSignIn = error instanceof GhCredentialError && error.needsSignIn;
                return {
                    ok: false,
                    code: "cli-failed",
                    message: sentence(error),
                    ...(needsSignIn ? { needsSignIn: true } : {}),
                };
            }
        },
    );

    // Resolves a credential the same way `sync.ts`'s `#resolveRoute` does, for the two
    // schedule channels below - a separate small resolution rather than reaching into
    // `CiRenderSync`'s private method, since neither channel drives a sync loop.
    const resolveScheduleTransport = async (
        owner: string,
        repo: string,
        accountId: string | null,
        access: GhCredentialAccess,
    ): Promise<{ transport: CiTransport | null; report: RouteReport }> => {
        const lease = await acquireAccount(accountId ?? undefined, access);
        return await resolveTransport({
            owner,
            repo,
            workflowFile: RENDER_WORKFLOW_FILE,
            lease,
        });
    };

    options.ipcMain.handle(
        "cirender:scheduleRead",
        async (
            _event: IpcMainInvokeEvent,
            request: { owner?: unknown; repo?: unknown; accountId?: unknown } | undefined,
        ): Promise<Answer<CiScheduleStatus>> => {
            const owner = readText(request?.owner);
            const repo = readText(request?.repo);
            if (owner === null || repo === null) {
                return { ok: false, message: "A repository owner and name are required." };
            }
            try {
                const routed = await resolveScheduleTransport(
                    owner,
                    repo,
                    readText(request?.accountId),
                    "read",
                );
                if (routed.transport === null)
                    return { ok: false, message: routed.report.describe };
                return { ok: true, value: await readCiSchedule(routed.transport, owner, repo) };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "cirender:scheduleWrite",
        async (
            _event: IpcMainInvokeEvent,
            request: unknown,
        ): Promise<Answer<CiScheduleWriteResult>> => {
            const record =
                typeof request === "object" && request !== null
                    ? (request as Record<string, unknown>)
                    : {};
            const syncId = readText(record["syncId"]);
            const cadence = readText(record["cadence"]);
            const enabled = record["enabled"] === true;
            if (syncId === null || cadence === null || !isCiScheduleCadence(cadence)) {
                return {
                    ok: false,
                    message:
                        "A sync id and a cadence - hourly, sixHourly, daily, weekly or hours:N from 1 to 168 - are required.",
                };
            }
            const state = await sync.readState(syncId);
            if (state === null) {
                return { ok: false, message: `There is no CI render recorded under ${syncId}.` };
            }
            const operationKey = `${state.owner.toLowerCase()}/${state.repo.toLowerCase()}/${syncId}`;
            if (scheduleWrites.has(operationKey)) {
                return {
                    ok: false,
                    message:
                        "This schedule is already being saved. Wait for that save to finish before trying again.",
                };
            }
            scheduleWrites.add(operationKey);
            try {
                const routed = await resolveScheduleTransport(
                    state.owner,
                    state.repo,
                    // A renderer may have changed pickers since this sync began. The durable
                    // account that created the sync owns its later schedule writes; only a
                    // legacy state with no saved account may fall back to the request.
                    state.accountId ?? readText(record["accountId"]),
                    "write",
                );
                if (routed.transport === null)
                    return { ok: false, message: routed.report.describe };
                const result = await writeCiSchedule(routed.transport, state, { enabled, cadence });
                return { ok: true, value: result };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            } finally {
                scheduleWrites.delete(operationKey);
            }
        },
    );

    // Prepares a repository that does not yet have the render workflow on it - an empty
    // repository needing a starter commit, an existing project that never had it added, or
    // a stale copy this application wrote earlier. See `bootstrap.ts` for the four states this tells apart
    // and why nothing here can clobber a file it did not itself place there.
    options.ipcMain.handle(
        "cirender:bootstrap",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<CiBootstrapResult> => {
            const parsed = readCiBootstrapIpcRequest(request);
            if (parsed === null) {
                return {
                    ok: false,
                    failure: {
                        code: "invalid-request",
                        message:
                            "A repository owner and name are required to prepare a repository.",
                        missingScopes: null,
                    },
                };
            }
            const { owner, repo, accountId, publishToPages } = parsed;

            let loaded: Awaited<ReturnType<typeof loadCiWorkflowTemplates>>;
            try {
                // Installed builds accept only their own complete resources. Development
                // runs deliberately use checkout discovery instead.
                loaded = await loadCiWorkflowTemplates({
                    packaged: options.packaged === true,
                    ...(options.resourcesDir === undefined
                        ? {}
                        : { resourcesDir: options.resourcesDir }),
                });
            } catch (error) {
                return {
                    ok: false,
                    failure: {
                        code: "http-error",
                        message:
                            error instanceof CiWorkflowTemplateError || error instanceof Error
                                ? error.message
                                : String(error),
                        missingScopes: null,
                    },
                };
            }

            const lease = await acquireAccount(accountId ?? undefined, "write");
            return await bootstrapCiRepository(
                { owner, repo, publishToPages },
                {
                    lease,
                    templates: loaded.templates,
                    templateVersion: loaded.version,
                    onEvent: (event) => options.broadcastBootstrap?.(event),
                },
            );
        },
    );

    // A missing project is a guided creation opportunity, not a request to render once
    // locally. The unchanged CI request is handed back to preflight after the atomic save,
    // retaining the chosen account, owner, repository, map and world without a second form.
    options.ipcMain.handle(
        "cirender:createCloudConfig",
        async (_event: IpcMainInvokeEvent, value: unknown): Promise<CloudRenderConfigIpcResult> => {
            const outer = objectRecord(value);
            const operationId = readText(outer?.operationId);
            if (operationId === null) {
                return {
                    ok: false,
                    failure: { code: "invalid-request", message: "A cloud configuration operation id is required." },
                };
            }
            if (cloudConfigCancels.has(operationId)) {
                return {
                    ok: false,
                    failure: { code: "invalid-request", message: "That cloud configuration operation is already running." },
                };
            }
            const request = readRequest(outer?.request);
            if (request === null) {
                return {
                    ok: false,
                    failure: {
                        code: "invalid-request",
                        message: "A world folder, repository owner and name are required.",
                    },
                };
            }
            const source = objectRecord(outer?.config) ?? {};
            const config: CloudRenderConfigInput = {
                worldFolder: request.worldFolder,
                ...optionalText(source, "projectName"),
                ...optionalText(source, "mapId"),
                ...optionalText(source, "mapName"),
                ...optionalText(source, "dimension"),
                ...optionalText(source, "dataFolder"),
                ...optionalText(source, "webroot"),
                ...(typeof source["sorting"] === "number" ? { sorting: source["sorting"] } : {}),
                ...optionalStringArray(source, "enabledMapIds"),
                ...(source["outputFolder"] === null
                    ? { outputFolder: null }
                    : optionalText(source, "outputFolder")),
                ...(source["threads"] === null || typeof source["threads"] === "number"
                    ? { threads: source["threads"] as number | null | undefined }
                    : {}),
                ...(typeof source["force"] === "boolean" ? { force: source["force"] } : {}),
                ...(typeof source["fixEdges"] === "boolean" ? { fixEdges: source["fixEdges"] } : {}),
                ...(typeof source["metrics"] === "boolean" ? { metrics: source["metrics"] } : {}),
            };
            const controller = new AbortController();
            cloudConfigCancels.set(operationId, controller);
            try {
                const saved = await saveCloudRenderConfig(
                    {
                        dataDir: options.historyDataDir?.() ?? options.storageDir(),
                        appVersion: options.appVersion,
                        signal: controller.signal,
                    },
                    config,
                );
                if (!saved.ok) return saved;
                const preflight = await sync.preflight(request);
                return preflight.ok
                    ? { ok: true, saved, preflight: preflight.preflight, preflightFailure: null }
                    : { ok: true, saved, preflight: null, preflightFailure: preflight.failure };
            } catch (error) {
                return { ok: false, failure: { code: "write-failed", message: sentence(error) } };
            } finally {
                cloudConfigCancels.delete(operationId);
            }
        },
    );

    options.ipcMain.handle("cirender:cancelCloudConfig", (_event: IpcMainInvokeEvent, value: unknown) => {
        const operationId = readText(value);
        if (operationId === null) return false;
        const controller = cloudConfigCancels.get(operationId);
        if (controller === undefined) return false;
        controller.abort();
        return true;
    });

    return {
        sync,
        dispose(): void {
            for (const controller of cloudConfigCancels.values()) controller.abort();
            for (const channel of CIRENDER_CHANNELS) options.ipcMain.removeHandler(channel);
        },
    };
}

export interface CiBootstrapIpcRequest {
    readonly owner: string;
    readonly repo: string;
    readonly accountId: string | null;
    readonly publishToPages: boolean;
}

export type CloudRenderConfigIpcResult =
    | {
          readonly ok: true;
          readonly saved: Extract<CloudRenderConfigSaveResult, { readonly ok: true }>;
          readonly preflight: CiPreflight | null;
          readonly preflightFailure: CiSyncFailure | null;
      }
    | { readonly ok: false; readonly failure: { readonly code: string; readonly message: string } };

function objectRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function optionalText(record: Record<string, unknown>, key: string): Record<string, string> {
    const value = readText(record[key]);
    return value === null ? {} : { [key]: value };
}

function optionalStringArray(record: Record<string, unknown>, key: string): { enabledMapIds?: readonly string[] } {
    const value = record[key];
    if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string")) return {};
    return { enabledMapIds: value };
}

/** Renderer input widened field by field; strings such as `"true"` never become consent. */
export function readCiBootstrapIpcRequest(value: unknown): CiBootstrapIpcRequest | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const owner = readText(record["owner"]);
    const repo = readText(record["repo"]);
    if (owner === null || repo === null) return null;
    return {
        owner,
        repo,
        accountId: readText(record["accountId"]),
        publishToPages: record["publishToPages"] === true,
    };
}

/**
 * The request, field by field, or null.
 *
 * Built rather than cast, because everything on this object decides where gigabytes go.
 * A renderer that sent `acknowledgePublic: "yes"` must not have that read as truthy: the
 * two acknowledgements are checked for `true` exactly, so anything else is an absent
 * acknowledgement and the main process refuses.
 */
function readRequest(value: unknown): CiSyncRequest | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const worldFolder = readText(record["worldFolder"]);
    const owner = readText(record["owner"]);
    const repo = readText(record["repo"]);
    if (worldFolder === null || owner === null || repo === null) return null;

    const mapId = readText(record["mapId"]);
    const output = record["output"];
    const accountId = readText(record["accountId"]);
    return {
        worldFolder,
        owner,
        repo,
        ...(mapId === null ? {} : { mapId }),
        ...(accountId === null ? {} : { accountId }),
        acknowledgeUpload: record["acknowledgeUpload"] === true,
        acknowledgePublic: record["acknowledgePublic"] === true,
        forceUpload: record["forceUpload"] === true,
        follow: record["follow"] !== false,
        ...(typeof record["budgetMinutes"] === "number"
            ? { budgetMinutes: record["budgetMinutes"] }
            : {}),
        ...(typeof record["maxJobs"] === "number" ? { maxJobs: record["maxJobs"] } : {}),
        ...(output === "artifact" || output === "artifact-and-pages" ? { output } : {}),
    };
}

function readText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/** One sentence from whatever was thrown, never a stack and never an empty string. */
function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const text = String(error);
    return text.length > 0 ? text : "The CI render could not be carried out, and said no more.";
}

export type { RepositoryReport };
