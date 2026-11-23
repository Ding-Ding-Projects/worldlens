import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, shell, type IpcMain } from "electron";
import { registerApplianceHandlers } from "../appliance/index.js";
import {
    createShareHostService,
    defaultBundledImageDir,
    registerShareHostHandlers,
    SHARE_HOST_EVENT_CHANNEL,
} from "../sharehost/index.js";
import { listSavedSshHosts, savedSshTarget } from "../sharehost/savedHosts.js";
import { VocabularyStore } from "../vocabulary/store.js";
import {
    hostChoices,
    InstanceRegistry as LiveViewerRegistry,
    LiveViewerService,
    readBundledImage as readLiveViewerImage,
    registerLiveViewerHandlers,
    serverChoices,
} from "../liveviewer/index.js";
import type { McServerIpc } from "../mcserver/ipc.js";
import { ProtectedBotAccounts } from "../mcserver/bots/accounts.js";
import { createLiveViewerAccounts, createPromptSource } from "../liveviewer/index.js";

/**
 * Everything that shares a finished render, registered in one place.
 *
 * Hosting the map in a container, building the appliance image, and (as they land) the
 * live viewer and the NBT editor each own their own IPC module; this file only supplies
 * the app-level facts they need - the render storage folder, the user-data folder, the
 * saved SSH hosts, the trusted host keys and the person's loaded wording - so the main
 * entry gains one call instead of four blocks.
 */
export interface SharingOptions {
    readonly userData: string;
    /** Where the person's loaded wording file lives (the same folder the upload control writes to). */
    readonly vocabularyDirectory: string;
    readonly storageDir: () => string;
    /** The packaged app's resources folder, or null in a checkout. */
    readonly resourcesDir: string | null;
    /** Opens an http or https link in the person's browser. */
    readonly openExternal: (url: string) => Promise<void>;
    /** The server manager, whose servers and saved SSH hosts the live viewer offers. */
    readonly mcServer: McServerIpc | null;
}

/**
 * A random id for this installation, kept in user data, so the live viewer only ever manages
 * containers this installation created even when two installs share one Docker host.
 */
function installationId(userData: string): string {
    const file = join(userData, "installation-id");
    try {
        const value = readFileSync(file, "utf8").trim();
        if (/^[a-f0-9-]{36}$/u.test(value)) return value;
    } catch {
        // Created below.
    }
    const value = randomUUID();
    mkdirSync(userData, { recursive: true });
    writeFileSync(file, value, { mode: 0o600 });
    return value;
}

export interface SharingIpc {
    dispose(): void;
}

function broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(channel, payload);
    }
}

/** The folder holding the bundled main process, where the sign-in worker is built beside it. */
function mainBundleDir(): string {
    return dirname(fileURLToPath(import.meta.url));
}

/** In a checkout the build scripts stage bundled parts under `packages/app/dist`. */
function devResourcesDir(): string {
    return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist");
}

export function registerSharing(ipcMain: IpcMain, options: SharingOptions): SharingIpc {
    const vocabulary = new VocabularyStore(options.vocabularyDirectory);
    const knownHostsFile = join(options.userData, "known_hosts");
    const userKnownHostsFile = join(homedir(), ".ssh", "known_hosts");

    const shareHost = registerShareHostHandlers(ipcMain, {
        service: createShareHostService({
            storageDir: options.storageDir,
            userDataDir: () => options.userData,
            sshTarget: (id) => savedSshTarget(options.userData, id),
            knownHostsFile: () => knownHostsFile,
            userKnownHostsFile: () => userKnownHostsFile,
            bundledImageDir: defaultBundledImageDir,
            vocabulary,
        }),
        onEvent: (operationId, event) => broadcast(SHARE_HOST_EVENT_CHANNEL, { operationId, event }),
    });

    ipcMain.handle("sharing:savedSshHosts", () => listSavedSshHosts(options.userData));
    ipcMain.handle("sharing:openExternal", async (_event, url: unknown) => {
        if (typeof url !== "string" || !/^https?:\/\/[^\s]+$/iu.test(url)) return false;
        await options.openExternal(url);
        return true;
    });
    // Health as checked right now, from this PC: a bounded GET of `<link>health`. Only
    // http(s) links on private or loopback addresses or `.local` names are checked, so the
    // renderer can never use this to reach an arbitrary host.
    ipcMain.handle("sharing:checkLink", async (_event, link: unknown) => {
        if (typeof link !== "string") return { ok: false, status: null, checkedAt: new Date().toISOString() };
        let url: URL;
        try {
            url = new URL("health", link.endsWith("/") ? link : `${link}/`);
        } catch {
            return { ok: false, status: null, checkedAt: new Date().toISOString() };
        }
        const host = url.hostname;
        const allowed =
            /^https?:$/u.test(url.protocol) &&
            (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/u.test(host) ||
                host === "localhost" ||
                host.endsWith(".local"));
        if (!allowed) return { ok: false, status: null, checkedAt: new Date().toISOString() };
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "manual" });
            return { ok: response.status === 200 || response.status === 401, status: response.status, checkedAt: new Date().toISOString() };
        } catch {
            return { ok: false, status: null, checkedAt: new Date().toISOString() };
        }
    });
    ipcMain.handle("sharing:reveal", (_event, target: unknown) => {
        if (typeof target !== "string" || target.length === 0) return false;
        shell.showItemInFolder(target);
        return true;
    });

    const appliance = registerApplianceHandlers(ipcMain, {
        dataDir: options.userData,
        resourcesDir: options.resourcesDir ?? devResourcesDir(),
        vocabulary: async () => (await vocabulary.read()).entries,
        reveal: (target) => shell.showItemInFolder(target),
    });

    // The live viewer and its bot. Offline names work everywhere; Microsoft accounts below.
    const mcServer = options.mcServer;
    // Microsoft sign-in for the bot: the same protected account store the server manager's
    // bots use, encrypted with the operating system's safe storage. The sign-in worker is
    // bundled beside the main process. When safe storage is unavailable the store refuses to
    // exist, and the dialog says so instead of keeping a token in the clear.
    const prompts = createPromptSource();
    const clientFile = join(options.userData, "bot-public-client.json");
    const readClientId = (): string => {
        try {
            const value = (JSON.parse(readFileSync(clientFile, "utf8")) as { clientId?: unknown }).clientId;
            return typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value) ? value : "";
        } catch {
            return "";
        }
    };
    let liveAccounts: ReturnType<typeof createLiveViewerAccounts> | null = null;
    try {
        const store = new ProtectedBotAccounts(
            (prompt) => prompts.emit(prompt),
            join(mainBundleDir(), "auth-worker.mjs"),
        );
        liveAccounts = createLiveViewerAccounts({ store, prompts, clientId: async () => readClientId() });
    } catch {
        liveAccounts = null;
    }
    ipcMain.handle("liveViewer:clientId", () => ({ configured: readClientId() !== "", clientId: readClientId() }));
    ipcMain.handle("liveViewer:configureClient", (_event, value: unknown) => {
        if (typeof value !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value.trim()))
            return { ok: false, message: "An application (client) ID looks like 00000000-0000-0000-0000-000000000000." };
        mkdirSync(options.userData, { recursive: true });
        writeFileSync(clientFile, JSON.stringify({ clientId: value.trim().toLowerCase() }), { mode: 0o600 });
        return { ok: true, message: "" };
    });
    const liveViewer = registerLiveViewerHandlers(ipcMain, {
        service: new LiveViewerService({
            registry: new LiveViewerRegistry(options.userData),
            owner: installationId(options.userData),
            resolveSsh: (hostId) => mcServer?.hostProfiles.sshHost(hostId) ?? null,
            accounts: liveAccounts,
            vocabulary: async () => (await vocabulary.read()).entries,
            bundledImage: () => readLiveViewerImage(join(options.resourcesDir ?? devResourcesDir(), "liveviewer")),
        }),
        accounts: liveAccounts,
        servers: async () => {
            if (mcServer === null) return [];
            const listed = await mcServer.registry.list();
            return listed.ok
                ? serverChoices(listed.value, (id) => mcServer.hostProfiles.sshHost(id)?.target.host ?? null)
                : [];
        },
        hosts: async () => {
            if (mcServer === null) return [];
            const listed = await mcServer.hostProfiles.list();
            return hostChoices(listed.ok ? listed.value : []);
        },
        onEvent: (event) => broadcast("liveViewer:event", event),
    });

    return {
        dispose() {
            shareHost.dispose();
            liveViewer.dispose();
            appliance.dispose();
            for (const channel of ["sharing:savedSshHosts", "sharing:openExternal", "sharing:reveal", "sharing:checkLink", "liveViewer:clientId", "liveViewer:configureClient"]) {
                ipcMain.removeHandler(channel);
            }
        },
    };
}
