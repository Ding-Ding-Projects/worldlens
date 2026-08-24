/**
 * How a surface reaches the server store, and how a build without one says so.
 *
 * Provide/inject, mirroring `locks/useLocks.ts` exactly and for the same reason: a test
 * mounts a component with a store it built itself, and two stores never race over one list
 * because a module-level singleton was reused.
 */

import { inject, provide, type InjectionKey } from "vue";

import { createServerStore, type McServerHost, type ServerStore } from "./serverStore.js";

export const SERVER_STORE: InjectionKey<ServerStore> = Symbol("worldlens.mcserver");

export function provideServerStore(store: ServerStore): void {
    provide(SERVER_STORE, store);
}

/** The store this surface is under, or a hostless one that reports it cannot list. */
export function useServerStore(): ServerStore {
    return inject(SERVER_STORE, undefined) ?? createServerStore({ host: null });
}

/**
 * The Electron shell's `mcserver` host, or null in a plain browser tab.
 *
 * Probed one method at a time and refused as a whole if any is missing, exactly as the lock
 * host is: a released shell can load a newer renderer than it was built beside, and a
 * surface that assumed the namespace was complete would offer a Start button that throws
 * when pressed - far worse than one that says this build cannot reach a server host.
 */
export function resolveServerHost(bridge: unknown = globalThis): McServerHost | null {
    const namespace = (bridge as { worldlens?: { mcserver?: unknown } }).worldlens?.mcserver;
    if (typeof namespace !== "object" || namespace === null) return null;

    const api = namespace as Record<string, unknown>;
    const isFunction = (value: unknown): value is (...args: never[]) => unknown =>
        typeof value === "function";

    const required = ["list", "get", "save", "forget", "probe", "status", "start", "stop", "logTail"];
    if (!required.every((name) => isFunction(api[name]))) return null;

    const filesApi = api["files"] as Record<string, unknown> | undefined;
    const filesReady =
        typeof filesApi === "object" &&
        filesApi !== null &&
        isFunction(filesApi["list"]) &&
        isFunction(filesApi["read"]) &&
        isFunction(filesApi["write"]);
    if (!filesReady) return null;

    const catalogueApi = api["catalogue"] as Record<string, unknown> | undefined;
    const catalogueReady =
        typeof catalogueApi === "object" &&
        catalogueApi !== null &&
        isFunction(catalogueApi["list"]) &&
        isFunction(catalogueApi["refresh"]);

    const javaApi = api["java"] as Record<string, unknown> | undefined;
    const javaReady = typeof javaApi === "object" && javaApi !== null && isFunction(javaApi["resolve"]);

    const pluginsApi = api["plugins"] as Record<string, unknown> | undefined;
    const pluginsReady =
        typeof pluginsApi === "object" &&
        pluginsApi !== null &&
        isFunction(pluginsApi["search"]) &&
        isFunction(pluginsApi["versions"]) &&
        isFunction(pluginsApi["install"]) &&
        isFunction(pluginsApi["list"]) &&
        isFunction(pluginsApi["toggle"]) &&
        isFunction(pluginsApi["remove"]);

    const playersApi = api["players"] as Record<string, unknown> | undefined;
    const playersReady =
        typeof playersApi === "object" &&
        playersApi !== null &&
        isFunction(playersApi["list"]) &&
        isFunction(playersApi["action"]);

    const adoptApi = api["adopt"] as Record<string, unknown> | undefined;
    const adoptReady =
        typeof adoptApi === "object" &&
        adoptApi !== null &&
        isFunction(adoptApi["discover"]) &&
        isFunction(adoptApi["confirm"]) &&
        isFunction(adoptApi["release"]);

    const worldsApi = api["worlds"] as Record<string, unknown> | undefined;
    const worldsReady = typeof worldsApi === "object" && worldsApi !== null && isFunction(worldsApi["list"]);

    const backupApi = api["backup"] as Record<string, unknown> | undefined;
    const backupReady =
        typeof backupApi === "object" &&
        backupApi !== null &&
        isFunction(backupApi["create"]) &&
        isFunction(backupApi["list"]) &&
        isFunction(backupApi["restore"]);

    const webConsoleApi = api["webConsole"] as Record<string, unknown> | undefined;
    const webConsoleReady =
        typeof webConsoleApi === "object" &&
        webConsoleApi !== null &&
        isFunction(webConsoleApi["status"]) &&
        isFunction(webConsoleApi["start"]) &&
        isFunction(webConsoleApi["stop"]) &&
        isFunction(webConsoleApi["setPassword"]) &&
        isFunction(webConsoleApi["bind"]);

    const createCapabilities = api["createCapabilities"] as Record<string, unknown> | undefined;
    const createCapabilitiesReady =
        typeof createCapabilities === "object" &&
        createCapabilities !== null &&
        typeof createCapabilities["localDocker"] === "boolean";

    return {
        name: "Electron shell",
        list: api["list"] as McServerHost["list"],
        get: api["get"] as McServerHost["get"],
        save: api["save"] as McServerHost["save"],
        forget: api["forget"] as McServerHost["forget"],
        probe: api["probe"] as McServerHost["probe"],
        status: api["status"] as McServerHost["status"],
        start: api["start"] as McServerHost["start"],
        stop: api["stop"] as McServerHost["stop"],
        files: filesApi as unknown as McServerHost["files"],
        logTail: api["logTail"] as McServerHost["logTail"],
        ...(catalogueReady ? { catalogue: catalogueApi as unknown as NonNullable<McServerHost["catalogue"]> } : {}),
        ...(javaReady
            ? {
                  java: {
                      resolve: javaApi!["resolve"] as NonNullable<McServerHost["java"]>["resolve"],
                      ...(isFunction(javaApi!["provision"])
                          ? { provision: javaApi!["provision"] as NonNullable<McServerHost["java"]>["provision"] }
                          : {}),
                      ...(isFunction(javaApi!["onProgress"])
                          ? { onProgress: javaApi!["onProgress"] as NonNullable<McServerHost["java"]>["onProgress"] }
                          : {}),
                  },
              }
            : {}),
        ...(isFunction(api["create"]) ? { create: api["create"] as NonNullable<McServerHost["create"]> } : {}),
        ...(createCapabilitiesReady
            ? {
                  createCapabilities: {
                      localDocker: createCapabilities["localDocker"] as boolean,
                  },
              }
            : {}),
        ...(pluginsReady ? { plugins: pluginsApi as unknown as NonNullable<McServerHost["plugins"]> } : {}),
        ...(playersReady ? { players: playersApi as unknown as NonNullable<McServerHost["players"]> } : {}),
        ...(adoptReady ? { adopt: adoptApi as unknown as NonNullable<McServerHost["adopt"]> } : {}),
        ...(worldsReady ? { worlds: worldsApi as unknown as NonNullable<McServerHost["worlds"]> } : {}),
        ...(backupReady ? { backup: backupApi as unknown as NonNullable<McServerHost["backup"]> } : {}),
        ...(webConsoleReady ? { webConsole: webConsoleApi as unknown as NonNullable<McServerHost["webConsole"]> } : {}),
    } as McServerHost;
}
