/**
 * Adapts the protected Microsoft account store to what hosting needs.
 *
 * The store itself (`mcserver/bots/accounts.ts`) keeps every account encrypted with the
 * operating system's credential protection and refuses to run when only plain-text storage
 * is available. This adapter adds nothing to that: it never reads or writes a token, it
 * only forwards the device code to whoever is listening and hands the encrypted record's
 * cache to hosting at the moment a viewer is started.
 */

import type { DeviceCode, LiveViewerAccounts } from "./types.js";

/** The subset of the protected store used here, so tests need no Electron. */
export interface ProtectedAccountsLike {
    list(): Promise<{ accountRef: string; label: string }[]>;
    createMicrosoftAccount(label: string, clientId: string): Promise<{ accountRef: string; label: string }>;
    authenticate(reference: string): Promise<unknown>;
    cancelAuthentication(reference: string): void;
    exportForHosting(reference: string): Promise<{ clientId: string; caches: Record<string, unknown> }>;
}

export interface PromptSource {
    /** Registers a listener for device codes; returns a function that removes it. */
    subscribe(listener: (code: DeviceCode) => void): () => void;
}

export interface AdapterOptions {
    readonly store: ProtectedAccountsLike;
    readonly prompts: PromptSource;
    /** The application's registered public client id; empty until it has been configured. */
    readonly clientId: () => Promise<string>;
}

export function createLiveViewerAccounts(options: AdapterOptions): LiveViewerAccounts {
    return {
        list: () => options.store.list(),
        async createMicrosoftAccount(label) {
            const clientId = await options.clientId();
            if (clientId === "") throw new Error("Microsoft sign-in is not configured in this build.");
            return options.store.createMicrosoftAccount(label, clientId);
        },
        async authenticate(accountRef, onCode) {
            const unsubscribe = options.prompts.subscribe((code) => {
                if (code.accountRef === accountRef) onCode(code);
            });
            try {
                await options.store.authenticate(accountRef);
            } finally {
                unsubscribe();
            }
        },
        cancel: (accountRef) => options.store.cancelAuthentication(accountRef),
        exportForHosting: (accountRef) => options.store.exportForHosting(accountRef),
    };
}

/** A small fan-out the application's existing prompt callback can feed. */
export function createPromptSource(): PromptSource & { emit(code: DeviceCode): void } {
    const listeners = new Set<(code: DeviceCode) => void>();
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        emit(code) {
            for (const listener of [...listeners]) listener(code);
        },
    };
}
