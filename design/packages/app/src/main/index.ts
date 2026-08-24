import {
    app,
    autoUpdater,
    BrowserWindow,
    ipcMain,
    safeStorage,
    session,
    clipboard,
    dialog,
    shell,
} from "electron";
import {
    acceptDownload,
    completeFirstRun,
    hasAcceptedDownload,
    needsFirstRun,
    readConsent,
    revokeDownloadConsent,
} from "./consent.js";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
    HttpServer,
    StaticHandler,
    RemoteProxyHandler,
    type RemoteProfile,
} from "@worldlens/server";
import { LocalMapHandler, defaultStorageDirectory } from "./render/index.js";
import { typescriptEngine, upstreamJavaEngine } from "./render/engine.js";
import { installRenderIpc } from "./render/ipc.js";
import type { RenderIpc } from "./render/ipc.js";
import { installDownloadIpc } from "./download/ipc.js";
import type { DownloadIpc } from "./download/ipc.js";
import { registerStructureRenderHandlers } from "./structures/ipc.js";
import type { StructureRenderIpc } from "./structures/ipc.js";
import { release as osRelease, totalmem } from "node:os";
import {
    createFileUpdateFeedHandoff,
    createFileUpdateInstallJournal,
    engineFromAutoUpdater,
    installUpdateIpc,
    resolveFeed,
    UPDATE_EVENT_CHANNEL,
    type InstalledUpdates,
} from "./update/index.js";
import {
    DownloadConcurrencyStore,
    RenderMemoryStore,
    registerFileHandlers,
    windowsMapStorageDefault,
} from "./files/index.js";
import { registerEulaHandlers } from "./eula/index.js";
import {
    registerSchoolModeHandlers,
    SCHOOL_MODE_EVENT_CHANNEL,
    type SchoolModeIpc,
} from "./schoolMode/index.js";
import { registerLockHandlers, type LockIpc } from "./locks/ipc.js";
import { registerMcServerHandlers, type McServerIpc } from "./mcserver/ipc.js";
import { join } from "node:path";
import { homedir } from "node:os";
import {
    ContainerHandoffStore,
    ContainerReattacher,
    localContainerAccess,
    localContainerList,
} from "./runtime/index.js";
import { registerRuntimeHandlers } from "./runtime/ipc.js";
import { containerAccessFor } from "./remote/index.js";
import {
    registerWorldSourceHandlers,
    registerSshWorldSourceHandlers,
    WORLD_SOURCE_SSH_EVENT_CHANNEL,
} from "./worldsource/index.js";
import type { WorldSourceIpc, WorldSourceSshIpc } from "./worldsource/index.js";
import { RemoteRenderOrchestrator, registerRemoteHandlers } from "./remote/index.js";
import type { RemoteIpc } from "./remote/index.js";
import {
    RemoteHostingOrchestrator,
    REMOTE_HOSTING_EVENT_CHANNEL,
    registerRemoteHostingHandlers,
    registerDashboardHandlers,
} from "./remote/index.js";
import type { DashboardIpc, RemoteHostingIpc } from "./remote/index.js";
import {
    MAX_PROFILE_COUNT,
    MAX_PROFILE_ID_LENGTH,
    MAX_PROFILE_NAME_LENGTH,
    readProfilesState,
    sanitizeProfileUrl,
    writeProfilesState,
} from "./profiles/store.js";
import { DOWNLOAD_EVENT_CHANNEL } from "./download/ipc.js";
import { RENDER_EVENT_CHANNEL } from "./render/ipc.js";
import { installCiRenderIpc } from "./cirender/ipc.js";
import type { CiRenderIpc } from "./cirender/ipc.js";
import {
    installPagesIpc,
    PAGES_EVENT_CHANNEL,
    installStaticMapExportIpc,
    STATIC_EXPORT_EVENT_CHANNEL,
} from "./pages/index.js";
import type { PagesIpc } from "./pages/index.js";
import type { StaticMapExportIpc } from "./pages/index.js";
import { installPreviewIpc, PreviewNetworkStore, PREVIEW_EVENT_CHANNEL } from "./preview/index.js";
import type { PreviewIpc } from "./preview/index.js";
import { installWorldRepoIpc, WORLD_REPO_EVENT_CHANNEL } from "./worldrepo/index.js";
import type { WorldRepoIpc } from "./worldrepo/index.js";
import { DOCKERWORLD_EVENT_CHANNEL, registerDockerWorldHandlers } from "./dockerworld/index.js";
import type { DockerWorldIpc } from "./dockerworld/index.js";
import { DockerHostingManager, registerDockerHostingHandlers } from "./dockerhosting/index.js";
import type { DockerHostingIpc } from "./dockerhosting/index.js";
import {
    PROJECT_AUTOSAVE_EVENT_CHANNEL,
    registerProjectHandlers,
    wireAutosaveQuitFlush,
} from "./project/index.js";
import type { AutosaveOutcome, ProjectIpc } from "./project/index.js";
import { registerStructureHandlers } from "./structures/index.js";
import type { StructureIpc } from "./structures/index.js";
import { installBackupIpc } from "./backup/ipc.js";
import type { BackupIpc } from "./backup/ipc.js";
import { registerReleaseLedgerHandlers } from "./releaseLedger/index.js";
import { openExternalHttps } from "./security/external.js";
import { registerJavaHandlers, JAVA_PROVISION_EVENT_CHANNEL } from "./java/ipc.js";
import type { JavaIpc } from "./java/ipc.js";
import { registerConfigHandlers } from "./config/index.js";
import type { ConfigIpc } from "./config/index.js";
import { registerHistoryHandlers } from "./history/index.js";
import type { HistoryIpc } from "./history/index.js";
import { registerProfilesHistoryHandlers } from "./profiles/index.js";
import type { ProfilesHistoryIpc } from "./profiles/index.js";
import { registerAppSettingsHistoryHandlers } from "./settings/index.js";
import type { AppSettingsHistoryIpc } from "./settings/index.js";
import { registerGalleryHandlers } from "./gallery/index.js";
import type { GalleryIpc } from "./gallery/index.js";
import { registerBlueMapSourceHandlers } from "./bluemap/index.js";
import type { BlueMapSourceIpc } from "./bluemap/index.js";
import { registerWorldHandlers } from "./world/index.js";
import type { WorldIpc } from "./world/index.js";
import { registerDialogHandlers } from "./dialogs/ipc.js";
import type { DialogIpc } from "./dialogs/ipc.js";
import { registerBedrockHandlers, BEDROCK_EVENT_CHANNEL } from "./bedrock/index.js";
import type { BedrockIpc } from "./bedrock/index.js";
import { registerRepairHandlers } from "./repair/index.js";
import type { RepairIpc } from "./repair/index.js";
import { ensureJava } from "./java/index.js";
import { registerSysdepHandlers, SYSDEP_INSTALL_EVENT_CHANNEL } from "./sysdeps/ipc.js";
import type { SysdepIpc } from "./sysdeps/ipc.js";
import { spawnProcessRunner } from "./sysdeps/process.js";
import { registerGhCliHandlers } from "./ghcli/ipc.js";
import type { GhCliIpc } from "./ghcli/ipc.js";
import { GhCredentialBroker } from "./ghcli/credentialBroker.js";
import { nodeProcessRunner } from "./cirender/gh.js";
import { LEGACY_MATERIAL_BLUEMAP_IDENTITY, WORLDLENS_IDENTITY } from "@worldlens/shared";
import { migrateWorldlensProfile, profileMigrationPlan } from "./migration/index.js";
import { profileMigrationConsentCopy } from "./migration/copy.js";
import {
    attemptStartupStep,
    errorDetail,
    errorMessage,
    installStartupIpc,
    openRecoveryWindow,
    SingleFlight,
    StartupIssueStore,
    type StartupCategory,
    type StartupIpc,
    type StartupIssue,
} from "./startup/index.js";
import { handleSquirrelShortcutEvent } from "./squirrelShortcuts.js";
import { registerAddonHandlers } from "./addons/index.js";
import type { AddonIpc } from "./addons/index.js";
import { registerVocabularyHandlers } from "./vocabulary/index.js";
import { registerRuntimeSettingsHandlers } from "./runtimeSettings/ipc.js";
import type { RuntimeSettingsIpc } from "./runtimeSettings/ipc.js";
import { RuntimeSourceRegistry } from "./runtimeSettings/registry.js";
import { createRuntimeSettingsService } from "./runtimeSettings/service.js";
import { RuntimeHistoryService } from "./runtimeSettings/history.js";

const squirrelStartupHandled = handleSquirrelShortcutEvent({
    platform: process.platform,
    argv: process.argv,
    execPath: process.execPath,
    exists: fs.existsSync,
    spawn: (command, args) => {
        const child = spawn(command, args, {
            detached: true,
            stdio: "ignore",
        });
        child.unref();
    },
    quit: () => app.quit(),
    defer: (callback, milliseconds) => setTimeout(callback, milliseconds),
});

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Pin storage to the immutable product identity before Electron initializes a renderer.
 * A user-configurable display name is renderer state and never reaches either call.
 */
const applicationDataDirectory = app.getPath("appData");
app.setName(WORLDLENS_IDENTITY.shippedName);
const directLaunch = app.commandLine.hasSwitch("worldlens-direct-launch");
const directLaunchUserData = directLaunch
    ? app.commandLine.getSwitchValue("user-data-dir").trim()
    : "";
if (directLaunch && directLaunchUserData === "") {
    throw new Error("--worldlens-direct-launch requires an owned --user-data-dir profile.");
}
if (directLaunch && !path.isAbsolute(directLaunchUserData)) {
    throw new Error("--worldlens-direct-launch requires an absolute --user-data-dir profile.");
}
if (
    directLaunch &&
    path.resolve(directLaunchUserData) ===
        path.resolve(join(applicationDataDirectory, WORLDLENS_IDENTITY.dataDirectoryName))
) {
    throw new Error("--worldlens-direct-launch refuses the production application-data directory.");
}
const smokeMode = directLaunch || process.env.WORLDLENS_SCREENSHOTS === "1";
const screenshotUserData = smokeMode
    ? directLaunchUserData || app.commandLine.getSwitchValue("user-data-dir").trim()
    : "";
app.setPath(
    "userData",
    screenshotUserData || join(applicationDataDirectory, WORLDLENS_IDENTITY.dataDirectoryName),
);

// Kept beside, not inside, the profile being migrated. A collision or unreadable profile is
// exactly when diagnostics must not depend on writing into that profile.
const startupStore = new StartupIssueStore(join(applicationDataDirectory, "Worldlens Recovery"));
let startupIpc: StartupIpc | null = null;

// A deterministic packaged-smoke seam. It never enables a capability or bypasses a check;
// it only makes one named startup phase fail so the recovery path can be proven against the
// actual executable instead of an injected unit-test host.
const startupProbe = app.commandLine.getSwitchValue("worldlens-startup-probe").trim();

function injectStartupProbe(phase: string): void {
    if (startupProbe === phase) {
        throw new Error(`Intentional Worldlens startup probe failed the '${phase}' phase.`);
    }
}

function brandAsset(name: "worldlens.ico" | "worldlens-logo.png"): string | null {
    const candidates = app.isPackaged
        ? [join(process.resourcesPath, "brand", name)]
        : [
              name.endsWith(".ico")
                  ? path.resolve(dirname, "../../build/icon.ico")
                  : path.resolve(dirname, "../../../ui/public/assets/logoCircle512.png"),
          ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function ensureStartupIpc(): StartupIpc {
    startupIpc ??= installStartupIpc({
        ipcMain,
        app,
        dialog,
        clipboard,
        store: startupStore,
        flushAutosave: async () => {
            await projectIpc?.autosave.flushAll("quit");
        },
        resolveWindow: (sender) => BrowserWindow.fromWebContents(sender),
    });
    return startupIpc;
}

async function showRecovery(issues: readonly StartupIssue[]): Promise<void> {
    await startupStore.flush();
    await openRecoveryWindow({
        app,
        startup: ensureStartupIpc(),
        issues,
        iconPath: brandAsset("worldlens.ico"),
        logoPath: brandAsset("worldlens-logo.png"),
    });
}

async function requestProfileMigrationConsent(): Promise<"accept" | "deny"> {
    const copy = profileMigrationConsentCopy(
        "bilingual",
        profileMigrationPlan(applicationDataDirectory),
    );
    const answer = await dialog.showMessageBox({
        type: "question",
        title: copy.title,
        message: copy.message,
        detail: copy.detail,
        buttons: [...copy.buttons],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
    });
    return answer.response === 0 ? "accept" : "deny";
}

async function prepareWorldlensProfile(): Promise<StartupIssue | null> {
    if (startupProbe === "profile-migration") {
        return startupStore.record({
            category: "profile-migration",
            phase: "profile-migration",
            title: "The profile migration safety probe stopped startup",
            message:
                "An intentional packaged smoke probe activated before any profile was read or written.",
            detail: "--worldlens-startup-probe=profile-migration",
            recoverable: false,
            securityBoundary: true,
        });
    }
    let outcome: Awaited<ReturnType<typeof migrateWorldlensProfile>>;
    try {
        outcome = await migrateWorldlensProfile({
            appDataDirectory: applicationDataDirectory,
            requestConsent: requestProfileMigrationConsent,
        });
    } catch (error) {
        return startupStore.record({
            category: "profile-migration",
            phase: "profile-migration",
            title: "Worldlens could not prepare the profile",
            message: errorMessage(error),
            detail: errorDetail(error),
            recoverable: false,
            securityBoundary: true,
        });
    }
    if (
        outcome.kind === "no-legacy-profile" ||
        outcome.kind === "already-migrated" ||
        outcome.kind === "denied" ||
        outcome.kind === "migrated"
    ) {
        console.info(`[worldlens] profile migration: ${outcome.kind}`);
        return null;
    }

    const detail =
        outcome.kind === "collision"
            ? `Both profiles contain different versions of: ${outcome.paths.join(", ")}. Neither profile was changed. Review the named relative paths, then restart Worldlens to retry.`
            : outcome.message;
    console.error(`[worldlens] profile migration ${outcome.kind}: ${detail}`);
    return startupStore.record({
        category: "profile-migration",
        phase: "profile-migration",
        title: "Worldlens kept the existing profile safe / Worldlens 保住咗現有 profile",
        message:
            `${detail} The Material BlueMap profile remains intact. ` +
            "Correct the reported problem, then choose Restart and retry. No partial Worldlens profile is treated as usable. / " +
            "Material BlueMap profile 仍然完整。修正問題後，揀「Restart and retry」再試；半份 Worldlens profile 唔會當成可用。",
        detail,
        recoverable: outcome.kind !== "failed" || !detail.includes("Recovery also failed"),
        securityBoundary: true,
    });
}

/** Built UI bundle (packages/ui/dist), resolved relative to the app package. */
function resolveUiRoot(): string {
    const candidates = [
        path.resolve(dirname, "../../../ui/dist"),
        path.resolve(process.resourcesPath ?? "", "ui"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
    }
    throw new Error(`UI bundle not found; looked in: ${candidates.join(", ")}`);
}

const authToken = randomBytes(24).toString("hex");
const remoteProxy = new RemoteProxyHandler();

/**
 * Locally rendered maps, mounted at `/local/{renderId}/`.
 *
 * The local twin of `remoteProxy`: a render's output is a static web root, so pointing
 * the viewer at this path makes it open a map this machine rendered exactly as it opens
 * one on the internet. It is added before the static UI bundle for the same reason the
 * remote proxy is - both own a path prefix, and the static handler is the fallback.
 */
const localMaps = new LocalMapHandler();

let embeddedServer: Promise<string> | null = null;

async function startEmbeddedServer(): Promise<string> {
    embeddedServer ??= (async () => {
        const server = new HttpServer({ host: "127.0.0.1", port: 0, authToken });
        server.addHandler(remoteProxy);
        server.addHandler(localMaps);
        server.addHandler(new StaticHandler(resolveUiRoot()));
        const address = await server.listen();
        app.on("will-quit", () => void server.close());
        return `http://127.0.0.1:${address.port}`;
    })();
    return embeddedServer;
}

let sessionHardened = false;

/** Exact parsed-origin comparison; malformed and user-info lookalike URLs fail closed. */
function hasTrustedOrigin(candidate: string, trusted: string): boolean {
    try {
        return new URL(candidate).origin === new URL(trusted).origin;
    } catch {
        return false;
    }
}

function hardenSession(baseUrl: string): void {
    if (sessionHardened) return;
    sessionHardened = true;
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
        // pointer lock is needed by free-flight controls; fullscreen by the UI.
        //
        // clipboard-sanitized-write is what the viewer's copy actions use. Denying it
        // made every copy in the map silently do nothing: no error, no refusal, just a
        // click that appeared to work. It was also inconsistent, because the app
        // already grants exactly this capability through the `clipboard:writeText`
        // IPC channel, so the web API was the only door being held shut.
        //
        // "sanitized" is the narrow variant: it writes text and known-safe types on an
        // explicit user action. Reading the clipboard is a different permission and
        // stays denied, because nothing here has a reason to look at what the user
        // copied somewhere else.
        const allowed = ["pointerLock", "fullscreen", "clipboard-sanitized-write"];
        callback(allowed.includes(permission));
    });

    // The embedded server rejects every unauthenticated request with 403. Only the
    // main frame URL carries `?token=`, so without this the renderer's own bundle
    // requests (`/assets/*.js`, `/assets/*.css`, and every later fetch and
    // EventSource) are refused and the window stays blank. Attaching the token as a
    // Bearer header here covers every resource type at the network layer, and keeps
    // it out of the URLs that end up in the DOM.
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: [`${baseUrl}/*`] },
        (details, callback) => {
            callback({
                requestHeaders: {
                    ...details.requestHeaders,
                    Authorization: `Bearer ${authToken}`,
                },
            });
        },
    );
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        if (hasTrustedOrigin(details.url, baseUrl) && details.resourceType === "mainFrame") {
            headers["Content-Security-Policy"] = [
                "default-src 'self'; " +
                    "script-src 'self'; " +
                    "style-src 'self' 'unsafe-inline'; " + // Vuetify injects style tags
                    "img-src 'self' data: blob:; " +
                    "font-src 'self' data:; " +
                    "connect-src 'self'; " +
                    "worker-src 'self' blob:; " +
                    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            ];
        }
        callback({ responseHeaders: headers });
    });
}

/**
 * Guards the stateless handlers below against a second registration.
 *
 * `ipcMain.handle` throws on a channel that already has a handler, and `createWindow` is
 * not structurally once-only: the `activate` path calls it again whenever there are no
 * windows left. This product ships for Windows, where `activate` does not fire, so the
 * crash is unreachable today - but the guard costs a boolean, and the alternative is a
 * function whose safety depends on a platform detail held nowhere near it.
 *
 * The three stateful subsystems (`startRendering`, `startDownloads`,
 * `startWorldInspection`) each guard themselves the same way; this one did not.
 */
let ipcRegistered = false;
let schoolModeIpc: SchoolModeIpc | null = null;
let lockIpc: LockIpc | null = null;
let mcServerIpc: McServerIpc | null = null;
let runtimeSettingsIpc: RuntimeSettingsIpc | null = null;
let runtimeSourceRegistry: RuntimeSourceRegistry | null = null;
let runtimeHistoryService: RuntimeHistoryService | null = null;

function registerIpc(): void {
    if (ipcRegistered) return;
    ipcRegistered = true;

    ipcMain.handle("profiles:sync", async (_event, profiles: RemoteProfile[]) => {
        const saved: { id: string; name: string; url: string }[] = [];
        const known = new Set<string>();
        for (const profile of Array.isArray(profiles) ? profiles.slice(0, MAX_PROFILE_COUNT) : []) {
            if (
                typeof profile.id !== "string" ||
                profile.id.length === 0 ||
                profile.id.length > MAX_PROFILE_ID_LENGTH ||
                typeof profile.name !== "string" ||
                profile.name.length === 0 ||
                profile.name.length > MAX_PROFILE_NAME_LENGTH ||
                /[\u0000-\u001F\u007F]/.test(profile.id) ||
                /[\u0000-\u001F\u007F]/.test(profile.name)
            )
                continue;
            const url = sanitizeProfileUrl(profile.baseUrl);
            if (url === null) continue;
            remoteProxy.setProfile({
                id: profile.id,
                name: profile.name,
                baseUrl: url,
            });
            known.add(profile.id);
            saved.push({ id: profile.id, name: profile.name, url });
        }
        for (const existing of remoteProxy.getProfiles()) {
            if (!known.has(existing.id)) remoteProxy.removeProfile(existing.id);
        }
        const previous = await readProfilesState(app.getPath("userData"));
        await writeProfilesState(app.getPath("userData"), {
            version: 1,
            profiles: saved.map((profile) => ({ ...profile, trustCustomizations: false })),
            activeId:
                previous.activeId !== null && known.has(previous.activeId)
                    ? previous.activeId
                    : null,
        }).catch(() => {
            // Profile sync remains usable if persistence is temporarily unavailable.
        });
    });
    ipcMain.handle("clipboard:writeText", (_event, text: string) => {
        if (typeof text === "string") clipboard.writeText(text);
    });
    ipcMain.handle("app:version", () => app.getVersion());
    registerReleaseLedgerHandlers();

    // This record sits under the OS-wide app-data root rather than Worldlens's own userData
    // directory.  Register it before a renderer can load, so preload's initial read is the
    // shared state rather than a renderer-local guess.
    schoolModeIpc = registerSchoolModeHandlers(ipcMain, {
        applicationDataDirectory,
        onChanged: (result) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(SCHOOL_MODE_EVENT_CHANNEL, result);
            }
        },
    });
    app.on("will-quit", () => schoolModeIpc?.dispose());
    // Toy locks live under this app's own userData rather than the shared app-data root:
    // they are per-application by design, unlike School mode, which is deliberately one
    // switch across every sibling app. Registered here so the renderer's first `load` finds
    // a real host and offers "Lock this element..." rather than hiding it.
    lockIpc = registerLockHandlers(ipcMain, {
        dataFolder: app.getPath("userData"),
        safeStorage,
    });
    app.on("will-quit", () => lockIpc?.dispose());

    // Minecraft server hosting. Registered unconditionally, because the renderer decides
    // what to show from the capability probes rather than from whether a host answered -
    // a machine with no Docker still has a server list worth reading.
    mcServerIpc = registerMcServerHandlers(ipcMain, {
        dataFolder: app.getPath("userData"),
        // The runtime a Minecraft server is launched on is discovered in this module, and
        // this is what lets the copy inside the installer be one of the candidates. Omit it
        // and a clean install reports that no Java runtime has been chosen while carrying a
        // perfectly good one, which is the exact state bundling exists to remove.
        resourcesPath: app.isPackaged ? process.resourcesPath : null,
        safeStorage,
    });
    app.on("will-quit", () => mcServerIpc?.dispose());

    runtimeSourceRegistry = new RuntimeSourceRegistry({
        file: path.join(app.getPath("userData"), "runtime-settings-sources.json"),
        safeStorage,
    });
    runtimeHistoryService = new RuntimeHistoryService({
        file: path.join(app.getPath("userData"), "runtime-settings-history.json"),
        credentialFile: path.join(app.getPath("userData"), "runtime-settings-history-credential.json"),
        safeStorage,
    });
    const statusHubUrl = process.env.WORLDLENS_STATUS_HUB_URL?.trim() ?? "";
    const statusHubProject = process.env.WORLDLENS_STATUS_HUB_PROJECT?.trim() ?? "";
    const statusHubSession = process.env.WORLDLENS_STATUS_HUB_SESSION?.trim() ?? "";
    const statusHubToken = process.env.WORLDLENS_STATUS_HUB_TOKEN ?? "";
    const statusHub =
        statusHubUrl !== "" && statusHubProject !== "" && statusHubSession !== "" && statusHubToken !== ""
            ? {
                  baseUrl: statusHubUrl,
                  projectId: statusHubProject,
                  sessionId: statusHubSession,
                  credentialRef: "environment-status-hub",
              }
            : null;
    const runtimeServiceOptions = {
        readConfiguredSource: (id) => runtimeSourceRegistry?.get(id) ?? null,
        readCredential: (id) => runtimeSourceRegistry?.useCredential(id, async (value) => value) ?? Promise.resolve(null),
        statusHub,
        ...(statusHub === null ? {} : { readStatusHubCredential: async (_reference: string) => statusHubToken }),
    };
    const runtimeService = createRuntimeSettingsService(runtimeServiceOptions);
    runtimeSettingsIpc = registerRuntimeSettingsHandlers(ipcMain, runtimeService, runtimeSourceRegistry, runtimeHistoryService);
    app.on("will-quit", () => runtimeSettingsIpc?.dispose());

    registerVocabularyHandlers(ipcMain, { applicationDataDirectory });

    // Mojang's licence, fetched and cached so it can be read inside the app rather than
    // taken on trust. A reader only: the acceptance itself stays in `consent.ts`.
    registerEulaHandlers(ipcMain);

    // Window controls for the Material title bar. The window is frameless, so these are
    // the only way it can be moved through its states: without them the app cannot be
    // minimised or closed at all.
    const focused = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
        BrowserWindow.fromWebContents(event.sender);

    ipcMain.handle("window:minimize", (event) => {
        focused(event)?.minimize();
    });
    ipcMain.handle("window:toggleMaximize", (event) => {
        const target = focused(event);
        if (target === null) return false;
        if (target.isMaximized()) target.unmaximize();
        else target.maximize();
        return target.isMaximized();
    });
    ipcMain.handle("window:close", (event) => {
        focused(event)?.close();
    });
    ipcMain.handle("window:isMaximized", (event) => focused(event)?.isMaximized() ?? false);

    // Mojang download consent. Asked once during first-run setup and remembered
    // afterwards, so it never appears on top of a render somebody has started.
    ipcMain.handle("consent:read", () => readConsent());
    ipcMain.handle("consent:accept", () => acceptDownload());
    ipcMain.handle("consent:revoke", () => revokeDownloadConsent());
    ipcMain.handle("firstRun:needed", () => needsFirstRun());
    ipcMain.handle("firstRun:complete", () => completeFirstRun());
}

/**
 * Local rendering, wired to the same server the viewer already talks to.
 *
 * `installRenderIpc` reads consent through `consent.ts` and never asks: a render without
 * it fails with a typed reason the interface shows as "consent required", with a link to
 * the settings row. Provisioning is deliberately left off, so a missing JDK is reported
 * rather than answered with a two-hundred-megabyte download nobody asked for.
 */
let renderIpc: RenderIpc | null = null;

function startRendering(): RenderIpc {
    // `createWindow` runs again on macOS `activate`, and `ipcMain.handle` throws when a
    // channel already has a handler. Registering once is the difference between
    // reopening the window and crashing while reopening it.
    if (renderIpc !== null) return renderIpc;

    const userData = app.getPath("userData");
    // Documents rather than the app's own data folder, because a tile tree is the person's
    // output rather than this application's state - and redirected out of OneDrive when
    // Windows has moved Documents there, with the reason carried alongside so the move is
    // explained rather than discovered. Only a profile that has never chosen a folder is
    // affected, so an existing install keeps its maps exactly where they are.
    const screenshotStorage = smokeMode
        ? process.env.WORLDLENS_SCREENSHOT_STORAGE?.trim()
        : undefined;
    const windowsDefault =
        screenshotStorage === undefined || screenshotStorage === ""
            ? windowsMapStorageDefault({
                  reported: app.getPath("documents"),
                  home: app.getPath("home"),
              })
            : null;
    const storageDir =
        screenshotStorage === undefined || screenshotStorage === ""
            ? (windowsDefault?.directory ?? defaultStorageDirectory(userData))
            : screenshotStorage;
    const javaResolver = upstreamJavaEngine({
        dataDir: userData,
        resourcesPath: app.isPackaged ? process.resourcesPath : null,
    });
    const typescriptResolver = typescriptEngine({
        resourcesPath: app.isPackaged ? process.resourcesPath : null,
        repositoryRoot: process.cwd(),
    });
    const resolveEngine = (choice: "upstream-java" | "typescript") =>
        choice === "typescript" ? typescriptResolver(choice) : javaResolver(choice);

    const render = installRenderIpc({
        storageDir,
        defaultStorageDir: storageDir,
        environment: { home: app.getPath("home"), appData: process.env.APPDATA },
        mounts: localMaps,
        resolveEngine,
        appVersion: app.getVersion(),
        // A lazy call to the repair singleton rather than the singleton itself, so this
        // does not care whether `startRepairDiagnostics()` has run yet - it is idempotent
        // (see its own doc comment) and creates itself on first call, which this becomes
        // the moment a render genuinely fails rather than at `createWindow`'s own ordering.
        rememberFailure: (evidence) => startRepairDiagnostics().remember(evidence),
        // The heap ceiling somebody chose in Settings, read fresh for every render rather
        // than captured here - `files/renderMemory.ts`'s own store already re-reads the
        // machine's memory and the stored file on every call, so this is never stale.
        jvmArgs: () => getRenderMemoryStore().jvmArgs(),
    });
    // Maps rendered in an earlier session are served again without re-rendering.
    void render.restoreExisting().catch((error: unknown) => {
        startupStore.record({
            category: "configuration",
            phase: "restore-existing-renders",
            title: "Saved renders could not be restored",
            message: errorMessage(error),
            detail: errorDetail(error),
            recoverable: true,
            securityBoundary: false,
        });
    });
    renderIpc = render;
    return render;
}

/**
 * Downloading worlds and rendered maps that a release published in pieces.
 *
 * Registered once, for the same reason rendering is: `ipcMain.handle` throws on a
 * channel that already has a handler, and `createWindow` runs again on macOS `activate`.
 *
 * The storage directory is read through the render side rather than captured, so a
 * download follows the folder somebody chose in setup instead of filling the one they
 * moved away from.
 */
let downloadIpc: DownloadIpc | null = null;

function startDownloads(render: RenderIpc, github: GhCliIpc): DownloadIpc {
    if (downloadIpc !== null) return downloadIpc;
    downloadIpc = installDownloadIpc({
        storageDir: () => render.storageDirectory(),
        account: github.broker.account,
        // The worker count somebody chose in Settings, read fresh for every download
        // rather than captured here - `files/downloadConcurrency.ts`'s own store already
        // re-reads its file on every call, so this is never stale.
        concurrency: () => getDownloadConcurrencyStore().concurrency(),
    });
    return downloadIpc;
}

/**
 * Backing a world or a rendered map up to GitHub.
 *
 * Registered once, for the same reason rendering, downloading and sign-in are. It stages
 * into the same folder downloads use, so a backup follows the storage directory somebody
 * chose in setup, and it borrows the same `gh` account broker so a backup runs under the
 * selected GitHub CLI account. Worldlens never owns or reads a credential store.
 */
let backupIpc: BackupIpc | null = null;

function startBackups(render: RenderIpc, github: GhCliIpc): BackupIpc {
    if (backupIpc !== null) return backupIpc;
    backupIpc = installBackupIpc({
        ipcMain,
        storageDir: () => render.storageDirectory(),
        account: github.broker.account,
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send("backup:event", event);
            }
        },
        appVersion: app.getVersion(),
    });
    return backupIpc;
}

/**
 * Reading a folder well enough to tell a world from something that is not one.
 *
 * Registered once, for the same reason rendering, downloading and sign-in are:
 * `ipcMain.handle` throws on a channel that already has a handler, and `createWindow`
 * runs again on macOS `activate`.
 *
 * It holds nothing. The wizard asks about a folder, this reads that folder shallowly and
 * answers, and a folder it cannot read is refused by name rather than reported as an
 * empty one - which is the difference between sending somebody to look for a missing
 * `level.dat` and sending them to look at the path they typed.
 */
let worldIpc: WorldIpc | null = null;

function startWorldInspection(): WorldIpc {
    if (worldIpc !== null) return worldIpc;
    // `userData` is where the list of mounted Minecraft folders is kept, and the
    // executable's own directory is where a portable installation would put its
    // `.minecraft`. Both are passed in rather than read inside `world/`, so the whole
    // directory still runs, and is still tested, with no Electron and no real machine.
    const screenshotHome = smokeMode ? process.env.WORLDLENS_SCREENSHOT_HOME?.trim() : undefined;
    const screenshotEnvironment =
        screenshotHome === undefined || screenshotHome === ""
            ? undefined
            : {
                  ...process.env,
                  APPDATA: screenshotHome,
                  LOCALAPPDATA: screenshotHome,
                  USERPROFILE: screenshotHome,
                  HOME: screenshotHome,
              };
    worldIpc = registerWorldHandlers(ipcMain, {
        userDataDirectory: app.getPath("userData"),
        executableDirectory:
            screenshotHome === undefined || screenshotHome === ""
                ? path.dirname(process.execPath)
                : screenshotHome,
        ...(screenshotEnvironment === undefined ? {} : { env: screenshotEnvironment }),
        ...(screenshotHome === undefined || screenshotHome === "" ? {} : { home: screenshotHome }),
    });
    return worldIpc;
}

/**
 * Reporting the Java the app would render with.
 *
 * Registered once, for the same reason everything above it is. Discovery is the same
 * pass a render makes - `JAVA_HOME`, then `java` on `PATH`, then the copy the app
 * provisioned - and it *runs* each candidate rather than believing a path, so the
 * settings row can state a version somebody measured instead of one it inferred.
 * `java:runtime` never provisions on its own: asking what is installed must not
 * download two hundred megabytes as a side effect.
 *
 * `java:provision` is the separate, explicit action that does download one - gated on
 * consent already given (`java:acceptDownloadConsent`) and, like `bedrock:convert`,
 * reachable only from a button somebody pressed. `ensure: ensureJava` is passed in
 * directly: its return type carries more than `java/ipc.ts`'s own `JavaEnsureCallResult`
 * needs, which is fine, and its parameter type accepts everything that module ever
 * calls it with - see the doc comment on `JavaEnsureCallOptions` for why the two files
 * do not import each other's types to get there.
 */
let javaIpc: JavaIpc | null = null;

function startJavaDiscovery(): JavaIpc {
    if (javaIpc !== null) return javaIpc;
    javaIpc = registerJavaHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
        // The surface that answers "which Java is this app using". Without this it reports
        // no installation at all on a clean machine and offers a download, while the runtime
        // it should be naming sits in `resources/bundled/java`.
        resourcesPath: app.isPackaged ? process.resourcesPath : null,
        ensure: ensureJava,
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(JAVA_PROVISION_EVENT_CHANNEL, event);
            }
        },
    });
    return javaIpc;
}

/**
 * Installing git, the GitHub CLI, Docker Desktop and rsync through winget/Chocolatey,
 * one button, honest progress.
 *
 * Registered once, for the same reason everything above it is. `spawnProcessRunner` is
 * the one real child-process runner this whole layer uses - every dependency's presence
 * check, install and post-install verification goes through it, and every test in
 * `main/sysdeps/` drives a fake instead so nothing there ever launches a real `winget`
 * or `choco` on the machine running the suite.
 */
let sysdepIpc: SysdepIpc | null = null;

function startSysdepInstaller(): SysdepIpc {
    if (sysdepIpc !== null) return sysdepIpc;
    sysdepIpc = registerSysdepHandlers(ipcMain, {
        run: spawnProcessRunner,
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(SYSDEP_INSTALL_EVENT_CHANNEL, event);
            }
        },
    });
    return sysdepIpc;
}

/**
 * The `gh` command-line tool's OWN accounts - a completely separate credential store from
 * Registered once, for the same reason everything else here
 * is. `nodeProcessRunner()` is the one real child-process runner this reuses, exactly as
 * `cirender/`'s own CI-render `gh` fallback already does; every test in `main/ghcli/` drives
 * a fake instead so nothing there ever spawns a real `gh` or touches this machine's real
 * active account.
 */
let ghCliIpc: GhCliIpc | null = null;
let ghCredentialBroker: GhCredentialBroker | null = null;

function startGhCliAccounts(): GhCliIpc {
    if (ghCliIpc !== null) return ghCliIpc;
    const runner = nodeProcessRunner();
    const broker = new GhCredentialBroker({ runner });
    ghCredentialBroker = broker;
    ghCliIpc = registerGhCliHandlers(ipcMain, {
        broker,
        runner,
        userDataDirectory: app.getPath("userData"),
    });
    return ghCliIpc;
}

/**
 * Reading and writing a BlueMap config folder, for the options screen.
 *
 * Registered once, for the same reason everything above it is. It holds nothing and
 * caches nothing: every call reads or writes the folder it was handed, which is what lets
 * somebody edit a config in another program, come back, press Reload and see what is
 * really on disk.
 *
 * The folder is the capability, and the renderer does not get to widen it: a file name
 * that escapes the chosen folder, or that is not one of the config files BlueMap loads, is
 * refused rather than resolved. `dialog` is passed in rather than imported inside, so the
 * whole layer - native pickers included - is exercised by tests with no Electron runtime.
 */
let configIpc: ConfigIpc | null = null;

function startConfigEditing(): ConfigIpc {
    if (configIpc !== null) return configIpc;
    configIpc = registerConfigHandlers(ipcMain, { dataDir: app.getPath("userData"), dialog });
    return configIpc;
}

/**
 * The local version history of each config folder, for the history panel.
 *
 * Registered once, like everything above it. It holds nothing between calls: a repository
 * is derived from the folder it belongs to on every call, so installing Git, deleting a
 * history folder or opening a different project while the app is running all take effect
 * immediately rather than at the next restart.
 *
 * Every history lives in its own repository under `<userData>/config-history/`, never as a
 * `.git` inside the folder the person chose - see `main/history/store.ts` for why that
 * distinction is the whole design. Nothing is ever pushed anywhere: there is no remote and
 * no channel that could accept one.
 */
let historyIpc: HistoryIpc | null = null;

function startConfigHistory(): HistoryIpc {
    if (historyIpc !== null) return historyIpc;
    historyIpc = registerHistoryHandlers(ipcMain, { dataDir: app.getPath("userData") });
    return historyIpc;
}

/**
 * A world's project file, and the local history of it.
 *
 * Registered once and holding nothing between calls, like the config history beside it. The
 * repository is derived from the world folder on every call and lives under the app's own
 * data directory - never as a `.git` inside somebody's world, which would drop an object
 * store next to their region files and change what every backup tool sees.
 *
 * `wireAutosaveQuitFlush` is hooked in at the same moment the handlers are, so a project with
 * an autosave pending is written and recorded before the application is allowed to exit - see
 * `project/autosave.ts` for what "pending" means and why an ordinary quit with nothing pending
 * is never delayed by this.
 */
let projectIpc: ProjectIpc | null = null;

function startProjects(): ProjectIpc {
    if (projectIpc !== null) return projectIpc;
    projectIpc = registerProjectHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
        autosave: {
            // Every autosave attempt, quiet or flushed, successful or not, is pushed to
            // every open window rather than kept inside the main process. The renderer's
            // own listener decides what to do with it - stay quiet for a routine success
            // and only interrupt for a failure or a restore, per the non-blocking
            // notification rules - but that decision needs the fact first, and this is
            // the one place the fact exists before it crosses the bridge.
            onAutosave: (outcome: AutosaveOutcome) => {
                for (const window of BrowserWindow.getAllWindows()) {
                    if (!window.isDestroyed())
                        window.webContents.send(PROJECT_AUTOSAVE_EVENT_CHANNEL, outcome);
                }
            },
        },
    });
    wireAutosaveQuitFlush(app, projectIpc.autosave);
    return projectIpc;
}

/**
 * The structure files a world already has, for the Structures surface.
 *
 * Registered once, like `startProjects` beside it. It holds nothing between calls: a world
 * folder is scanned fresh on every `structures:discover`, so a structure block placed while
 * the app is open shows up the next time somebody looks rather than only after a restart.
 */
let structureIpc: StructureIpc | null = null;

function startStructures(): StructureIpc {
    if (structureIpc !== null) return structureIpc;
    structureIpc = registerStructureHandlers(ipcMain);
    return structureIpc;
}

/**
 * The local version history of the server-profile / maps-and-servers list and of the
 * application's own settings.
 *
 * Registered the same way the config and project histories above are: once, holding nothing
 * between calls, each repository derived on every call from a fixed location beside the
 * application's data. `packages/ui/src/stores/profiles.ts` and the settings surfaces under
 * `packages/ui/src/components/settings/` do not call these channels yet - see
 * `docs/config-history.md` for the migration this is the main-process half of.
 */
let profilesHistoryIpc: ProfilesHistoryIpc | null = null;
let appSettingsHistoryIpc: AppSettingsHistoryIpc | null = null;
let galleryIpc: GalleryIpc | null = null;

function startGallery(): GalleryIpc {
    if (galleryIpc !== null) return galleryIpc;
    galleryIpc = registerGalleryHandlers(ipcMain, app.getPath("userData"));
    return galleryIpc;
}

function startProfilesHistory(): ProfilesHistoryIpc {
    if (profilesHistoryIpc !== null) return profilesHistoryIpc;
    profilesHistoryIpc = registerProfilesHistoryHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
    });
    return profilesHistoryIpc;
}

/**
 * Where the vendored BlueMap engine in this installation came from.
 *
 * Registered beside the histories because it answers the same kind of question they do: what is
 * actually here, rather than what a render is about to do with it. `resourcesPath` is passed so
 * a packaged app finds its bundled jars, and omitting it in development lets the same resolver
 * fall back to the checkout, per `main/java/jars.ts`.
 */
let blueMapSourceIpc: BlueMapSourceIpc | null = null;

function startBlueMapSource(): BlueMapSourceIpc {
    if (blueMapSourceIpc !== null) return blueMapSourceIpc;
    blueMapSourceIpc = registerBlueMapSourceHandlers(ipcMain, {
        resourcesPath: app.isPackaged ? process.resourcesPath : null,
    });
    return blueMapSourceIpc;
}

function startAppSettingsHistory(): AppSettingsHistoryIpc {
    if (appSettingsHistoryIpc !== null) return appSettingsHistoryIpc;
    appSettingsHistoryIpc = registerAppSettingsHistoryHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
    });
    return appSettingsHistoryIpc;
}

/**
 * Keeping the application current, and reaching the folders it owns.
 *
 * The installer has emitted the pair Electron's updater reads since it was configured and
 * nothing consumed it, so every release so far was an update nobody was offered.
 *
 * `renderInProgress` is a function rather than a value for the same reason `roots` is: both
 * are asked at the moment they matter. A render that started after the check would be hours
 * of work thrown away by a restart, and the maps folder can be moved while the app runs, so
 * a captured list would keep allowing the folder somebody left.
 */
let updatesInstalled: InstalledUpdates | null = null;

function startUpdates(render: RenderIpc | null): void {
    if (updatesInstalled !== null) return;
    updatesInstalled = installUpdateIpc(ipcMain, {
        currentVersion: app.getVersion(),
        feed: resolveFeed({
            packaged: app.isPackaged,
            platform: process.platform,
            arch: process.arch,
            version: app.getVersion(),
            // Both repositories are baked in by build.mjs. The current feed is always tried
            // first; the previous host is a bounded bridge fallback until this profile has
            // actually downloaded from the Worldlens feed. That proof is persisted below,
            // so the handoff does not depend on a repository redirect remaining in place.
            repository: __WORLDLENS_REPOSITORY__,
            legacyRepository: __WORLDLENS_LEGACY_REPOSITORY__,
            environment: process.env,
        }),
        engine: process.platform === "win32" ? engineFromAutoUpdater(autoUpdater) : null,
        feedHandoff: createFileUpdateFeedHandoff(app.getPath("userData")),
        installJournal: createFileUpdateInstallJournal(app.getPath("userData")),
        renderInProgress: () => render !== null && render.orchestrator.activeRenderIds().length > 0,
        broadcast: (state) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(UPDATE_EVENT_CHANNEL, state);
            }
        },
    });
    app.on("will-quit", () => updatesInstalled?.dispose());
}

/**
 * The persisted `-Xmx` ceiling, shared between the render channel (which applies it to
 * every render that does not specify its own) and the files channel (which reads and
 * writes the setting itself). One instance, constructed on first use by whichever of the
 * two runs first - `createWindow` always calls `startRendering()` before
 * `startFileAccess()`, but neither should have to assume that ordering forever.
 */
let renderMemory: RenderMemoryStore | null = null;
let downloadConcurrency: DownloadConcurrencyStore | null = null;
let filesRegistered = false;

function getRenderMemoryStore(): RenderMemoryStore {
    renderMemory ??= new RenderMemoryStore({
        dataDir: app.getPath("userData"),
        totalMemoryBytes: totalmem(),
    });
    return renderMemory;
}

/**
 * The persisted "how many parts at once" setting, shared the same way
 * {@link getRenderMemoryStore} is: `startDownloads` reads it on every download,
 * `startFileAccess` registers the channel that reads and writes it, and neither call
 * order is assumed - both create the one instance on whichever of them runs first.
 */
function getDownloadConcurrencyStore(): DownloadConcurrencyStore {
    downloadConcurrency ??= new DownloadConcurrencyStore({ dataDir: app.getPath("userData") });
    return downloadConcurrency;
}

function startFileAccess(render: RenderIpc): RenderMemoryStore {
    const memory = getRenderMemoryStore();
    const concurrency = getDownloadConcurrencyStore();
    if (filesRegistered) return memory;
    filesRegistered = true;
    registerFileHandlers(ipcMain, {
        shell,
        documents: { reported: app.getPath("documents"), home: app.getPath("home") },
        memory,
        downloadConcurrency: concurrency,
        roots: () => [
            {
                id: "maps",
                label: "the folder rendered maps go in",
                path: render.storageDirectory(),
            },
            { id: "data", label: "this app's own data folder", path: app.getPath("userData") },
        ],
    });
    return memory;
}

/**
 * Rendering a structure or schematic somebody dropped onto the app, reusing the same
 * `RenderOrchestrator` every world render already goes through - see
 * `structures/renderStructure.ts` for the full adaptation.
 */
let structureRenderIpc: StructureRenderIpc | null = null;

function startStructureRendering(render: RenderIpc): StructureRenderIpc {
    if (structureRenderIpc !== null) return structureRenderIpc;
    structureRenderIpc = registerStructureRenderHandlers(ipcMain, {
        orchestrator: render.orchestrator,
        // Kept beside this app's own data rather than inside the map storage folder a
        // person chose in setup: a synthetic input world has no business showing up in a
        // "where are my rendered maps" listing of that folder.
        worldsDir: path.join(app.getPath("userData"), "structure-worlds"),
    });
    return structureRenderIpc;
}

/**
 * Handing a render to GitHub's runners.
 *
 * It borrows rather than duplicates: the backup runner uploads the world, the download side
 * fetches the result, and the selected `gh` account comes from the same broker. A second
 * uploader would be a second thing to keep correct about digests and resumption.
 *
 * `eulaAccepted` is a reader and nothing else. Mojang's acceptance is a real legal act that
 * lives in `consent.ts`; there is deliberately no channel here whose name could set it.
 */
let ciRenderIpc: CiRenderIpc | null = null;

function startCiRenders(render: RenderIpc, github: GhCliIpc): CiRenderIpc {
    if (ciRenderIpc !== null) return ciRenderIpc;
    ciRenderIpc = installCiRenderIpc({
        ipcMain,
        storageDir: () => render.storageDirectory(),
        // The broker returns one fresh, stable lease for the selected gh account. The
        // credential is consumed only in this main-process operation and never crosses IPC.
        account: github.broker.account,
        eulaAccepted: () => hasAcceptedDownload(),
        mounts: localMaps,
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send("cirender:event", event);
            }
        },
        broadcastBootstrap: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send("cirender:bootstrapEvent", event);
            }
        },
        appVersion: app.getVersion(),
        packaged: app.isPackaged,
        resourcesDir: process.resourcesPath,
    });
    return ciRenderIpc;
}

/**
 * Publishing a locally rendered map to GitHub Pages.
 *
 * Registered once, for the same reason everything above it is. The storage directory is read
 * through the render side rather than captured, so it publishes the render somebody is
 * actually looking at rather than one in a folder they moved away from.
 *
 * `workRoot` is under this application's own data directory and never inside a render or a
 * world. Publishing stages through a git directory there, with the render's web root as the
 * work tree, so a several-gigabyte tile tree is pushed without being copied first and there is
 * never a `.git` inside somebody's rendered map.
 */
let pagesIpc: PagesIpc | null = null;
let staticMapExportIpc: StaticMapExportIpc | null = null;

function startStaticMapExport(render: RenderIpc): StaticMapExportIpc {
    if (staticMapExportIpc !== null) return staticMapExportIpc;
    staticMapExportIpc = installStaticMapExportIpc({
        ipcMain,
        storageDir: () => render.storageDirectory(),
        ledgerDir: () => join(app.getPath("userData"), "static-map-exports"),
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(STATIC_EXPORT_EVENT_CHANNEL, event);
            }
        },
    });
    app.on("will-quit", () => staticMapExportIpc?.dispose());
    return staticMapExportIpc;
}

function startPagesHosting(render: RenderIpc, github: GhCliIpc): PagesIpc {
    if (pagesIpc !== null) return pagesIpc;
    pagesIpc = installPagesIpc({
        ipcMain,
        storageDir: () => render.storageDirectory(),
        workRoot: () => join(app.getPath("userData"), "pages-hosting"),
        account: github.broker.account,
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send(PAGES_EVENT_CHANNEL, event);
            }
        },
    });
    app.on("will-quit", () => pagesIpc?.dispose());
    return pagesIpc;
}

/**
 * Watching a render live, in a real browser tab, while it is still running - on this
 * machine by default, and on another device on this network only on an explicit opt-in
 * given fresh every time the render screen offers it. See `main/preview/` for the server,
 * the loopback-by-default binding, and the one persisted setting this feature has (which
 * default the opt-in checkbox starts at, never whether exposure happens at all).
 *
 * Registered once, for the same reason everything above it is. `activeRenderIds` is read
 * through the orchestrator on every call rather than captured, so a hosted page's live-
 * status banner keeps tracking a render that is still writing tiles. `githubActiveRenderIds`
 * is the CI-render subsystem's own answer to "is this actually on this machine yet", which
 * is what lets `preview:availability` refuse the one route that genuinely cannot work -
 * nothing a GitHub Actions render writes is on this computer until it has been downloaded -
 * rather than showing a control that would sit there doing nothing.
 */
let previewIpc: PreviewIpc | null = null;
let previewNetworkStore: PreviewNetworkStore | null = null;

function getPreviewNetworkStore(): PreviewNetworkStore {
    previewNetworkStore ??= new PreviewNetworkStore({ dataDir: app.getPath("userData") });
    return previewNetworkStore;
}

function startPreviewHosting(render: RenderIpc, ciRender: CiRenderIpc): PreviewIpc {
    if (previewIpc !== null) return previewIpc;
    previewIpc = installPreviewIpc({
        ipcMain,
        storageDir: () => render.storageDirectory(),
        activeRenderIds: () => render.orchestrator.activeRenderIds(),
        githubActiveRenderIds: () => ciRender.sync.activeSyncIds(),
        network: getPreviewNetworkStore(),
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(PREVIEW_EVENT_CHANNEL, event);
            }
        },
        // Deliberately not `openExternalHttps` from `github/external.ts` - that door is
        // https-only by design, and a loopback preview is `http://` on purpose. Safe here
        // regardless: see `preview/ipc.ts`'s own doc comment on `openExternal` for why this
        // channel never opens anything but its own server's own URL.
        openExternal: async (url) => {
            try {
                await shell.openExternal(url);
                return true;
            } catch {
                return false;
            }
        },
    });
    // Async, like every other dispose queued on `will-quit` here (see `startPagesHosting`
    // and `startEmbeddedServer` just above) - the point is that the listener is asked to
    // close rather than left orphaned holding its port, not that quitting waits for it.
    app.on("will-quit", () => void previewIpc?.dispose());
    return previewIpc;
}

/**
 * Keeping a Minecraft world in a git repository, so a render never has to re-zip it.
 *
 * Registered the same way `startPagesHosting` is, and for the same reason: `workRoot` is
 * under this application's own data directory, never inside a world, and a git directory
 * kept there stages against whatever folder the person points at directly - a several
 * -gigabyte world is synced without being copied first, and there is never a `.git`
 * inside somebody's actual world save.
 */
let worldRepoIpc: WorldRepoIpc | null = null;

function startWorldRepoHosting(github: GhCliIpc | null): WorldRepoIpc {
    if (worldRepoIpc !== null) return worldRepoIpc;
    worldRepoIpc = installWorldRepoIpc({
        ipcMain,
        workRoot: () => join(app.getPath("userData"), "world-repos"),
        account: github?.broker.account ?? (async () => null),
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send(WORLD_REPO_EVENT_CHANNEL, event);
            }
        },
    });
    app.on("will-quit", () => worldRepoIpc?.dispose());
    return worldRepoIpc;
}

/**
 * Worlds published as somebody else's release, including the split ones.
 *
 * Broadcast on the DOWNLOAD channel and handed the downloader the panel already lists,
 * both deliberately: a world fetched from another repository is a download like any other,
 * and a second instance or a second channel would mean a second list, with a transfer in
 * one of them that the other could neither show nor stop.
 */
let worldSourceIpc: WorldSourceIpc | null = null;

function startWorldSources(
    render: RenderIpc,
    downloads: DownloadIpc,
    github: GhCliIpc,
): WorldSourceIpc {
    if (worldSourceIpc !== null) return worldSourceIpc;
    worldSourceIpc = registerWorldSourceHandlers(ipcMain, {
        storageDir: () => render.storageDirectory(),
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(DOWNLOAD_EVENT_CHANNEL, event);
            }
        },
        account: github.broker.account,
        downloader: downloads.downloader,
    });
    return worldSourceIpc;
}

/**
 * A world that already lives on a machine the person owns, read over SSH rather than
 * zipped up and carried here first.
 *
 * The same `known_hosts` the remote-render side writes, so a host key trusted for one is
 * trusted for the other rather than asking twice for the same machine. Progress and the
 * final result are broadcast on `WORLD_SOURCE_SSH_EVENT_CHANNEL`, a channel of this
 * feature's own - see `worldsource/sshFetcher.ts` for why it does not share the download
 * channel the GitHub world source uses.
 */
let sshWorldSourceIpc: WorldSourceSshIpc | null = null;

function startSshWorldSources(): WorldSourceSshIpc {
    if (sshWorldSourceIpc !== null) return sshWorldSourceIpc;
    sshWorldSourceIpc = registerSshWorldSourceHandlers(ipcMain, {
        knownHostsFile: join(app.getPath("userData"), "known_hosts"),
        userKnownHostsFile: join(homedir(), ".ssh", "known_hosts"),
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(WORLD_SOURCE_SSH_EVENT_CHANNEL, event);
            }
        },
    });
    return sshWorldSourceIpc;
}

/**
 * Reading a world out of a Docker container or volume, without zipping it up first.
 *
 * Registered once, for the same reason everything above it is. The local daemon only -
 * see `dockerworld/ipc.ts`'s own doc comment for why a remote Docker host reached over SSH
 * is not wired to a button yet even though `DockerWorldFetcher` already supports one, and
 * Fetch results still resolve through invoke-and-await. The fetcher's actual phase and file
 * progress is also broadcast so the wizard never has to invent a percentage while waiting.
 */
let dockerWorldIpc: DockerWorldIpc | null = null;
let dockerHostingIpc: DockerHostingIpc | null = null;

function startDockerHosting(): DockerHostingIpc {
    if (dockerHostingIpc !== null) return dockerHostingIpc;
    dockerHostingIpc = registerDockerHostingHandlers(ipcMain, {
        manager: new DockerHostingManager({
            recordFile: join(app.getPath("userData"), "docker-hosting", "instances.json"),
            managedRoot: join(app.getPath("userData"), "docker-hosting", "data"),
            onEvent: (event) => {
                for (const window of BrowserWindow.getAllWindows())
                    if (!window.isDestroyed())
                        window.webContents.send("dockerhosting:event", event);
            },
        }),
    });
    app.on("will-quit", () => dockerHostingIpc?.dispose());
    return dockerHostingIpc;
}

function startDockerWorld(): DockerWorldIpc {
    if (dockerWorldIpc !== null) return dockerWorldIpc;
    dockerWorldIpc = registerDockerWorldHandlers(ipcMain, {
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(DOCKERWORLD_EVENT_CHANNEL, event);
            }
        },
    });
    return dockerWorldIpc;
}

/**
 * Handing a render to a Linux machine over SSH.
 *
 * Reports on the RENDER channel for the same reason: a remote render appears in the same
 * list, moves the same bar and is stopped by the same button as a local one.
 *
 * Two `known_hosts` are read - this application's own and the user's - and only the
 * application's is ever written, so trusting a host here never edits a file the rest of
 * their SSH depends on.
 */
let remoteIpc: RemoteIpc | null = null;

/**
 * Putting an already-rendered map on a Linux server the person owns, over SSH, in Docker,
 * and leaving it running.
 *
 * A sibling of `remoteIpc` above rather than a mode of it: a render finishes and stops on
 * its own, a hosted map is meant to keep answering after this application closes. See
 * `remote/hosting.ts`'s own top comment for the shape of that difference.
 */
let remoteHostingIpc: RemoteHostingIpc | null = null;
let dashboardIpc: DashboardIpc | null = null;

/**
 * The record that lets a container outlive the application that started it.
 *
 * Shared by the local Docker path and the remote one on purpose. A container is a
 * container: whichever daemon owns it, the app needs the same four facts to pick it back
 * up - its name, its host, what it was rendering and where the output belongs - and two
 * stores would mean a render that one half of the app could resume and the other could not.
 */
let containerHandoff: ContainerHandoffStore | null = null;

function handoffStore(render: RenderIpc): ContainerHandoffStore {
    // The render IPC builds one and uses it for container renders. Building a second here
    // would give the two halves different instance ids, and a container render currently in
    // flight would then appear in the "left behind by an earlier session" offer list -
    // inviting somebody to reattach to a render that is already running in front of them.
    containerHandoff ??= render.containers;
    return containerHandoff;
}

/**
 * Docker's state, the runnable modes, and containers left behind by an earlier session.
 *
 * Reattaching reports on the RENDER channel rather than one of its own, because a picked-up
 * render is a render: same list, same bar, same cancel button. A second channel would mean a
 * second list, and a render in one of them that the other could neither show nor stop.
 */
let runtimeIpc: { dispose(): void } | null = null;

function startRuntime(render: RenderIpc): void {
    if (runtimeIpc !== null) return;
    const knownHostsFile = join(app.getPath("userData"), "known_hosts");
    const reattacher = new ContainerReattacher({
        store: handoffStore(render),
        access: containerAccessFor({
            local: localContainerAccess(),
            remote: { knownHostsFile, userKnownHostsFile: join(homedir(), ".ssh", "known_hosts") },
        }),
        listContainers: localContainerList(),
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(RENDER_EVENT_CHANNEL, event);
            }
        },
    });
    runtimeIpc = registerRuntimeHandlers(ipcMain, { reattacher });
    app.on("will-quit", () => runtimeIpc?.dispose());
}

function startRemoteRendering(render: RenderIpc): RemoteIpc {
    if (remoteIpc !== null) return remoteIpc;
    const knownHostsFile = join(app.getPath("userData"), "known_hosts");
    const orchestrator = new RemoteRenderOrchestrator({
        storageDir: () => render.storageDirectory(),
        resolveEngine: upstreamJavaEngine({
            dataDir: app.getPath("userData"),
            resourcesPath: app.isPackaged ? process.resourcesPath : null,
        }),
        hasConsent: hasAcceptedDownload,
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(RENDER_EVENT_CHANNEL, event);
            }
        },
        knownHostsFile,
        userKnownHostsFile: join(homedir(), ".ssh", "known_hosts"),
        // Without this a remote render still works and simply cannot be picked up again.
        handoff: handoffStore(render),
    });
    remoteIpc = registerRemoteHandlers(ipcMain, { orchestrator, knownHostsFile });
    return remoteIpc;
}

/**
 * Hosting an already-rendered map on the person's own Linux server, over the same SSH
 * machinery a remote render uses.
 *
 * The engine is resolved the same way a remote render resolves it - the JRE and jar this
 * build ships - because hosting sends the same two things a render does: the world (the
 * engine builds a real map on every start, `-w` included) and the engine that reads it.
 */
function startRemoteHosting(render: RenderIpc): RemoteHostingIpc {
    if (remoteHostingIpc !== null) return remoteHostingIpc;
    const knownHostsFile = join(app.getPath("userData"), "known_hosts");
    const orchestrator = new RemoteHostingOrchestrator({
        storageDir: () => render.storageDirectory(),
        workRoot: () => join(app.getPath("userData"), "remote-hosting"),
        resolveEngine: upstreamJavaEngine({
            dataDir: app.getPath("userData"),
            resourcesPath: app.isPackaged ? process.resourcesPath : null,
        }),
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(REMOTE_HOSTING_EVENT_CHANNEL, event);
            }
        },
        knownHostsFile,
        userKnownHostsFile: join(homedir(), ".ssh", "known_hosts"),
    });
    remoteHostingIpc = registerRemoteHostingHandlers(ipcMain, { orchestrator });
    dashboardIpc = registerDashboardHandlers(ipcMain, {
        orchestrator,
        readProfiles: () => readProfilesState(app.getPath("userData")),
        probeProfile: (profileId, signal) => remoteProxy.probe(profileId, signal),
    });
    app.on("will-quit", () => remoteHostingIpc?.dispose());
    app.on("will-quit", () => dashboardIpc?.dispose());
    return remoteHostingIpc;
}

/**
 * The one native folder/file picker every path field in the app browses through.
 *
 * Registered once, for the same reason everything above it is. Screen-agnostic on purpose:
 * unlike `config:pickDirectory`/`config:pickFile`, this needs no `provideConfigHost()`
 * ancestor, so Settings, Backup and the remote target editor can browse for a path exactly as
 * the world and config screens already do. `BrowserWindow.fromWebContents` is resolved fresh
 * per request rather than captured, so the picker is always modal to the window that actually
 * asked for it.
 */
let dialogIpc: DialogIpc | null = null;

function startPathDialogs(): DialogIpc {
    if (dialogIpc !== null) return dialogIpc;
    dialogIpc = registerDialogHandlers(ipcMain, {
        dialog,
        resolveWindow: (event) => BrowserWindow.fromWebContents(event.sender),
    });
    return dialogIpc;
}

/**
 * Bedrock world conversion, via Chunker.
 *
 * Registered once, for the same reason everything above it is. `resolveJava` reuses this
 * app's existing Temurin discovery rather than growing a second Java story of its own:
 * Chunker needs Java 17 or newer, which this app's own render requirement already exceeds.
 * Provisioning is left off here, matching `ensureJava`'s own default - asking whether a
 * world can be converted must not be the reason two hundred megabytes leave the machine.
 */
let bedrockIpc: BedrockIpc | null = null;

function startBedrockConversion(): BedrockIpc {
    if (bedrockIpc !== null) return bedrockIpc;
    bedrockIpc = registerBedrockHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
        appVersion: app.getVersion(),
        resolveJava: async () => {
            try {
                // Bedrock conversion runs Chunker on a JVM, so it needs the bundled runtime
                // offered to it too. Passing `dataDir` alone would send a packaged install
                // hunting the machine for a Java it already ships.
                const java = await ensureJava({
                    dataDir: app.getPath("userData"),
                    resourcesPath: app.isPackaged ? process.resourcesPath : null,
                });
                return {
                    ok: true,
                    executable: java.installation.executable,
                    version: java.installation.version.version,
                };
            } catch (error) {
                return {
                    ok: false,
                    message: error instanceof Error ? error.message : String(error),
                };
            }
        },
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(BEDROCK_EVENT_CHANNEL, event);
            }
        },
    });
    return bedrockIpc;
}

/**
 * Diagnosing why a render or the web server would not start, and repairing what can be
 * repaired.
 *
 * Registered once, for the same reason everything above it is - see `repair/index.ts` for
 * the two-halves design this hands off to. `allowAgent` is left at its default (never) here
 * because Settings has no control for it yet: leaving the guardrailed agent pass unreachable
 * until something can actually turn it on is the safe default, not a gap.
 */
let repairIpc: RepairIpc | null = null;

let addonIpc: AddonIpc | null = null;

function startAddonManager(): AddonIpc {
    if (addonIpc !== null) return addonIpc;
    addonIpc = registerAddonHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
        dialog,
        resolveWindow: (event) => BrowserWindow.fromWebContents(event.sender),
    });
    app.on("will-quit", () => addonIpc?.dispose());
    return addonIpc;
}

function startRepairDiagnostics(): RepairIpc {
    if (repairIpc !== null) return repairIpc;
    repairIpc = registerRepairHandlers(ipcMain, {
        report: {
            broker: ghCredentialBroker,
            appName: () => app.getName(),
            buildVersion: () => app.getVersion(),
            platform: () => `${process.platform}/${process.arch} ${osRelease()}`,
            dialog,
            app,
            resolveWindow: (sender) => BrowserWindow.fromWebContents(sender),
        },
    });
    return repairIpc;
}

async function createWindow(): Promise<void> {
    const existing = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (existing !== undefined) {
        if (existing.isMinimized()) existing.restore();
        existing.show();
        return;
    }

    ensureStartupIpc();
    const attempt = <T>(
        category: StartupCategory,
        phase: string,
        title: string,
        run: () => T | Promise<T>,
    ): Promise<T | null> =>
        attemptStartupStep({
            category,
            phase,
            title,
            run: () => {
                injectStartupProbe(phase);
                return run();
            },
            report: (issue) => {
                startupStore.record(issue);
            },
        });

    const baseUrl = await attempt(
        "network",
        "embedded-server",
        "The local application server did not start",
        startEmbeddedServer,
    );
    if (baseUrl === null) {
        await showRecovery((await startupStore.snapshot()).current);
        return;
    }

    const hardened = await attempt(
        "initialization",
        "session-security",
        "The secure application session could not be prepared",
        () => {
            hardenSession(baseUrl);
            return true;
        },
    );
    const coreIpc = await attempt(
        "initialization",
        "core-ipc",
        "The core application controls could not be registered",
        () => {
            registerIpc();
            return true;
        },
    );
    if (hardened === null || coreIpc === null) {
        await showRecovery((await startupStore.snapshot()).current);
        return;
    }

    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        // 800x600 is the narrowest width the interface is validated at, so it is also
        // the smallest the window may become. Below it, controls start overlapping.
        minWidth: 800,
        minHeight: 600,
        show: false,
        // Frameless: the operating system's title bar is not this product's chrome. The
        // renderer draws a Material one instead, which is the only way the window
        // furniture can follow the app's own theme, density and language.
        frame: false,
        autoHideMenuBar: true,
        backgroundColor: "#0B0E11",
        ...(brandAsset("worldlens.ico") === null ? {} : { icon: brandAsset("worldlens.ico")! }),
        webPreferences: {
            preload:
                startupProbe === "preload"
                    ? path.resolve(dirname, "../preload/intentionally-missing.cjs")
                    : path.resolve(dirname, "../preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    const windowRecovery = new SingleFlight<void>();
    const recoverWindow = (
        category: StartupCategory,
        phase: string,
        title: string,
        error: unknown,
        securityBoundary = false,
    ): Promise<void> =>
        windowRecovery.run(async () => {
            startupStore.record({
                category,
                phase,
                title,
                message: errorMessage(error),
                detail: errorDetail(error),
                recoverable: !securityBoundary,
                securityBoundary,
            });
            if (!window.isDestroyed()) window.destroy();
            await showRecovery((await startupStore.snapshot()).current);
        });

    // The preload is the renderer's only route to privileged operations. A preload that
    // failed is not answered by turning isolation off or exposing Node; the ordinary window
    // is retired and a no-script, no-preload recovery window takes over.
    window.webContents.on("preload-error", (_event, preloadPath, error) => {
        void recoverWindow(
            "preload",
            "preload",
            "The secure application bridge did not load",
            new Error(`${errorMessage(error)} (${preloadPath})`),
            true,
        );
    });
    window.webContents.on(
        "did-fail-load",
        (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
            if (!isMainFrame) return;
            void recoverWindow(
                "renderer",
                "renderer-load",
                "The application interface did not load",
                new Error(`${errorDescription} (${errorCode}) while loading ${validatedUrl}`),
            );
        },
    );
    window.webContents.on("render-process-gone", (_event, details) => {
        void recoverWindow(
            "renderer",
            "renderer-process",
            "The application interface stopped unexpectedly",
            new Error(`Renderer process ended: ${details.reason} (${details.exitCode})`),
            true,
        );
    });

    // Maximised state can change without the app asking: the OS keyboard shortcut, a
    // drag to the top edge, a double click on the drag region. A title bar that only
    // updated when it was the one to act would sit there showing "maximise" on a
    // maximised window, so the state is pushed rather than polled.
    const sendMaximized = (): void => {
        if (!window.isDestroyed()) {
            window.webContents.send("window:maximizedChanged", window.isMaximized());
        }
    };
    window.on("maximize", sendMaximized);
    window.on("unmaximize", sendMaximized);
    window.on("enter-full-screen", sendMaximized);
    window.on("leave-full-screen", sendMaximized);

    // Every outward link, from here and from sign-in, goes through the same https-only
    // guard. One door means one place to get the scheme check right; see github/external.ts.
    window.webContents.setWindowOpenHandler(({ url }) => {
        void openExternalHttps(url);
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
        if (!hasTrustedOrigin(url, baseUrl)) event.preventDefault();
    });

    // Optional feature registration begins only after a real window exists. Every step owns
    // its failure, so a missing Java runtime, damaged config, unavailable network or update
    // service can remove that feature without removing the shell.
    const render = await attempt(
        "dependency",
        "rendering",
        "Rendering is unavailable in this launch",
        startRendering,
    );
    const github = await attempt(
        "network",
        "gh-cli",
        "GitHub features are unavailable in this launch",
        startGhCliAccounts,
    );
    const downloads =
        render !== null && github !== null
            ? await attempt(
                  "network",
                  "downloads",
                  "Release downloads are unavailable in this launch",
                  () => startDownloads(render, github),
              )
            : null;
    if (render !== null && github !== null) {
        await attempt("network", "backups", "Backups are unavailable in this launch", () =>
            startBackups(render, github),
        );
    }
    if (render !== null) {
        await attempt(
            "initialization",
            "static-map-export",
            "Static map export is unavailable in this launch",
            () => startStaticMapExport(render),
        );
    }
    const ciRender =
        render !== null && github !== null
            ? await attempt(
                  "network",
                  "ci-render",
                  "Cloud rendering is unavailable in this launch",
                  () => startCiRenders(render, github),
              )
            : null;

    if (render !== null && github !== null) {
        await attempt("network", "pages", "Pages hosting is unavailable in this launch", () =>
            startPagesHosting(render, github),
        );
    }
    if (render !== null) {
        await attempt(
            "initialization",
            "runtime",
            "Container runtime controls are unavailable",
            () => startRuntime(render),
        );
        await attempt("network", "remote-render", "Remote rendering is unavailable", () =>
            startRemoteRendering(render),
        );
        await attempt("network", "remote-hosting", "Remote hosting is unavailable", () =>
            startRemoteHosting(render),
        );
        await attempt("initialization", "file-access", "File actions are unavailable", () =>
            startFileAccess(render),
        );
        await attempt(
            "initialization",
            "structure-rendering",
            "Rendering dropped structures is unavailable",
            () => startStructureRendering(render),
        );
    }
    // Updates do not require the renderer or the render engine. Keep their IPC and install
    // receipt reconciliation alive even when rendering startup failed and recovery is the
    // only surface this launch can show.
    await attempt("update", "updates", "Automatic updates are unavailable in this launch", () =>
        startUpdates(render),
    );
    if (render !== null && downloads !== null && github !== null) {
        await attempt("network", "world-sources", "World-source downloads are unavailable", () =>
            startWorldSources(render, downloads, github),
        );
    }
    if (render !== null && ciRender !== null) {
        await attempt("network", "preview", "Live preview hosting is unavailable", () =>
            startPreviewHosting(render, ciRender),
        );
    }

    const independentSteps: readonly [StartupCategory, string, string, () => unknown][] = [
        [
            "initialization",
            "world-repository",
            "World repositories are unavailable",
            () => startWorldRepoHosting(github),
        ],
        ["network", "ssh-world-source", "SSH world sources are unavailable", startSshWorldSources],
        ["dependency", "docker-world", "Docker world import is unavailable", startDockerWorld],
        [
            "dependency",
            "docker-hosting",
            "Docker hosting manager is unavailable",
            startDockerHosting,
        ],
        [
            "configuration",
            "world-inspection",
            "World discovery is unavailable",
            startWorldInspection,
        ],
        ["dependency", "java-discovery", "Java discovery is unavailable", startJavaDiscovery],
        [
            "dependency",
            "dependency-installer",
            "Dependency installation is unavailable",
            startSysdepInstaller,
        ],
        [
            "configuration",
            "config-editor",
            "Configuration editing is unavailable",
            startConfigEditing,
        ],
        [
            "configuration",
            "config-history",
            "Configuration history is unavailable",
            startConfigHistory,
        ],
        ["configuration", "projects", "Project files are unavailable", startProjects],
        ["configuration", "structures", "Structure discovery is unavailable", startStructures],
        [
            "configuration",
            "profile-history",
            "Profile history is unavailable",
            startProfilesHistory,
        ],
        [
            "configuration",
            "settings-history",
            "Settings history is unavailable",
            startAppSettingsHistory,
        ],
        ["configuration", "screenshot-gallery", "Screenshot gallery is unavailable", startGallery],
        ["configuration", "addon-manager", "Add-on management is unavailable", startAddonManager],
        [
            "configuration",
            "bluemap-source",
            "The origin of the BlueMap engine is unavailable",
            startBlueMapSource,
        ],
        [
            "initialization",
            "path-dialogs",
            "Folder and file pickers are unavailable",
            startPathDialogs,
        ],
        [
            "dependency",
            "bedrock-conversion",
            "Bedrock conversion is unavailable",
            startBedrockConversion,
        ],
        ["initialization", "repair", "Repair diagnostics are unavailable", startRepairDiagnostics],
    ];
    for (const [category, phase, title, run] of independentSteps) {
        await attempt(category, phase, title, run);
    }

    window.once("ready-to-show", () => window.show());
    try {
        await window.loadURL(`${baseUrl}/?token=${authToken}`);
    } catch (error) {
        await recoverWindow(
            "renderer",
            "renderer-load",
            "The application interface did not load",
            error,
        );
    }
}

/**
 * Starts one window at a time. A second activation shares the in-flight launch rather than
 * registering IPC twice or opening two recovery shells.
 */
const launchFlight = new SingleFlight<void>();

async function launch(): Promise<void> {
    return launchFlight.run(async () => {
        try {
            await createWindow();
        } catch (error) {
            console.error("[worldlens] startup failed:", error);
            const issue = startupStore.record({
                category: "initialization",
                phase: "launch",
                title: "Worldlens opened recovery after startup failed",
                message: errorMessage(error),
                detail: errorDetail(error),
                recoverable: true,
                securityBoundary: false,
            });
            await showRecovery([issue]);
        }
    });
}

const terminalRecoveryFlight = new SingleFlight<void>();

function enterTerminalRecovery(origin: string, error: unknown): void {
    void terminalRecoveryFlight.run(async () => {
        const issue = startupStore.record({
            category: "initialization",
            phase: origin,
            title: "Worldlens stopped unsafe work and kept recovery available",
            message: errorMessage(error),
            detail: errorDetail(error),
            recoverable: false,
            securityBoundary: true,
        });
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed() && window.getTitle() !== "Worldlens recovery")
                window.destroy();
        }
        await app.whenReady();
        await showRecovery([issue]);
    });
}

const ownsSingleInstance = app.requestSingleInstanceLock();

if (squirrelStartupHandled) {
    // Squirrel owns this one-off lifecycle process; the deferred quit above ensures the normal
    // renderer, profile migration, and single-instance lock never start during installation.
} else if (!ownsSingleInstance) {
    // Profile migration happens before any window or writable app-owned store is opened.
    // A second process must therefore stop here, before it can stage or cut over the same
    // profile while the owning process is validating its exact current manifest.
    app.quit();
} else {
    app.on("second-instance", () => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window === undefined || window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
    });

    process.on("uncaughtException", (error) => enterTerminalRecovery("uncaught-exception", error));
    process.on("unhandledRejection", (reason) =>
        enterTerminalRecovery("unhandled-rejection", reason),
    );

    app.whenReady()
        .then(async () => {
            ensureStartupIpc();
            const migrationIssue = await prepareWorldlensProfile();
            if (migrationIssue === null) await launch();
            else await showRecovery([migrationIssue]);
            app.on("activate", () => {
                if (BrowserWindow.getAllWindows().length === 0) void launch();
            });
        })
        .catch((error: unknown) => enterTerminalRecovery("app-ready", error));

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });
}
