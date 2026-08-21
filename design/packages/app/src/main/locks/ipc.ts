/**
 * The narrow privileged surface behind `window.worldlens.locks`.
 *
 * Five calls and nothing more: read the list, replace the list, and the three vault
 * operations. Everything that decides *whether* a password matches, how long an unlock lasts
 * or what a TOTP code should be stays in the renderer's lock model, because none of it needs
 * privilege and all of it needs testing without an Electron around it.
 *
 * `get` is the one call that hands a secret back across the boundary, and it exists because
 * the renderer's `verifyUnlock` has to compare a typed code against the stored secret. It is
 * never rendered, never logged and never persisted above this line.
 */

import type { IpcMain } from "electron";

import { LockStorage, type SafeStorageLike, type StoredLock } from "./store.js";

export const LOCK_CHANNELS = {
    load: "locks:load",
    save: "locks:save",
    vaultPut: "locks:vault:put",
    vaultGet: "locks:vault:get",
    vaultRemove: "locks:vault:remove",
    /** Synchronous: the preload needs the folder while it is building the bridge object. */
    dataFolder: "locks:dataFolder",
} as const;

export interface LockIpc {
    readonly storage: LockStorage;
    dispose(): void;
}

export function registerLockHandlers(
    ipcMain: Pick<IpcMain, "handle" | "removeHandler" | "on" | "removeAllListeners">,
    options: { readonly dataFolder: string; readonly safeStorage: SafeStorageLike },
): LockIpc {
    const storage = new LockStorage(options);

    ipcMain.handle(LOCK_CHANNELS.load, (): Promise<readonly StoredLock[]> => storage.load());

    ipcMain.handle(LOCK_CHANNELS.save, async (_event, locks: unknown): Promise<void> => {
        // A renderer that sends something other than an array gets its save refused rather
        // than the file emptied. Writing `[]` here would delete every lock on the machine in
        // response to one malformed message, which is the worst available answer.
        if (!Array.isArray(locks)) return;
        await storage.save(locks);
    });

    ipcMain.handle(
        LOCK_CHANNELS.vaultPut,
        (_event, lockId: unknown, secret: unknown): Promise<boolean> =>
            typeof lockId === "string" && typeof secret === "string"
                ? storage.putSecret(lockId, secret)
                : Promise.resolve(false),
    );

    ipcMain.handle(LOCK_CHANNELS.vaultGet, (_event, lockId: unknown): Promise<string | null> =>
        typeof lockId === "string" ? storage.getSecret(lockId) : Promise.resolve(null),
    );

    ipcMain.handle(LOCK_CHANNELS.vaultRemove, (_event, lockId: unknown): Promise<void> =>
        typeof lockId === "string" ? storage.removeSecret(lockId) : Promise.resolve(),
    );

    // Synchronous on purpose. The preload builds one plain object and hands it to the
    // renderer; there is no point in that construction at which it can await, and the
    // recovery route has to name a real folder rather than "app data" - see LOCK_RECOVERY.
    ipcMain.on(LOCK_CHANNELS.dataFolder, (event) => {
        event.returnValue = storage.dataFolder;
    });

    return {
        storage,
        dispose: () => {
            ipcMain.removeAllListeners(LOCK_CHANNELS.dataFolder);
            for (const channel of Object.values(LOCK_CHANNELS)) ipcMain.removeHandler(channel);
        },
    };
}
