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
    };
}
