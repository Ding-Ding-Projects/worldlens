/**
 * How a surface reaches the lock store, and how a build without one says so.
 *
 * Provide/inject rather than a module singleton, for the same reason the appearance and
 * project surfaces do it: a test mounts a component with a store it built itself, and two
 * stores never end up racing over one list because a module-level variable was reused.
 *
 * The default is deliberately a real store with no host rather than `null`. Every caller
 * then gets an object whose `canList` is false and whose list is honestly empty, instead of
 * having to null-check at nine call sites and getting one of them wrong.
 */

import { inject, provide, type InjectionKey } from "vue";

import { createLockStore, type LockHost, type LockStore } from "./lockStore.js";

/**
 * Exported so a test can hand a store straight to `global.provide` rather than wrapping
 * every mount in a provider component - which is the arrangement that hides emitted events
 * behind a wrapper and quietly turns half a suite into assertions about nothing.
 */
export const LOCK_STORE: InjectionKey<LockStore> = Symbol("worldlens.locks");

export function provideLockStore(store: LockStore): void {
    provide(LOCK_STORE, store);
}

/** The store this surface is under, or a hostless one that reports it cannot list. */
export function useLockStore(): LockStore {
    return inject(LOCK_STORE, undefined) ?? createLockStore({ host: null });
}

/**
 * The Electron shell's lock host, or null in a plain browser tab.
 *
 * Probed one method at a time and refused as a whole if any is missing, exactly as the
 * project host is: a released shell can load a newer renderer than it was built beside, and
 * a surface that assumed the namespace was complete would offer a Lock button that throws
 * when pressed - far worse than one that says this build cannot keep locks.
 *
 * The vault is probed separately and may legitimately be absent while the rest works: a
 * build that can list and store locks but has no credential store offers password locks and
 * says plainly why an authenticator is not on offer.
 */
export function resolveLockHost(bridge: unknown = globalThis): LockHost | null {
    const namespace = (bridge as { worldlens?: { locks?: unknown } }).worldlens?.locks;
    if (typeof namespace !== "object" || namespace === null) return null;

    const api = namespace as Record<string, unknown>;
    const isFunction = (value: unknown): value is (...args: never[]) => unknown =>
        typeof value === "function";
    if (!isFunction(api["load"]) || !isFunction(api["save"])) return null;

    const vaultApi = api["vault"] as Record<string, unknown> | undefined;
    const vaultReady =
        typeof vaultApi === "object" &&
        vaultApi !== null &&
        isFunction(vaultApi["put"]) &&
        isFunction(vaultApi["get"]) &&
        isFunction(vaultApi["remove"]);

    return {
        name: "Electron shell",
        dataFolder: typeof api["dataFolder"] === "string" ? api["dataFolder"] : null,
        load: api["load"] as LockHost["load"],
        save: api["save"] as LockHost["save"],
        vault: vaultReady ? (vaultApi as unknown as NonNullable<LockHost["vault"]>) : null,
    };
}
