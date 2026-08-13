/**
 * The built-in authenticator's own entries: which accounts are registered, and where each
 * one's secret actually lives.
 *
 * This is a different feature from the toy locks next door in `locks/`, even though both
 * rest on the same `totp.ts`. A lock protects one element of this application from the
 * person using it, for fun; this authenticator holds arbitrary TOTP secrets for whatever
 * outside accounts somebody likes, the same job a phone authenticator app does. They must
 * never share storage, because clearing one must never touch the other.
 *
 * ## What is stored where
 *
 * An {@link AuthenticatorEntry} carries a `secretRef` - not the secret itself. The secret
 * goes through {@link AuthenticatorVault}, exactly the seam `LockVault` already uses in
 * `locks/lockModel.ts`, and for the same reason: this package runs in the Electron shell
 * where an operating-system credential vault exists, in a plain browser tab where it does
 * not, and in vitest where a fake makes the whole surface testable nowhere near a real
 * keychain. A build with no vault says so on the surface rather than offering a control that
 * throws when pressed.
 *
 * ## A read that fails is not an empty authenticator
 *
 * Corrupt or unreadable storage reports itself, the same fail-closed shape
 * `markers/markerStudioStore.ts` uses. Answering an unreadable store with an empty list would
 * render as "you have no accounts registered", which invites somebody to re-pair every one of
 * them on top of entries that are still sitting there unreadable underneath.
 */

import { computed, inject, provide, reactive, watch, type ComputedRef, type InjectionKey } from "vue";

import { decodeBase32, verifyTotp, TOTP_DEFAULTS, type TotpParameters } from "../locks/totp.js";

/** Exported so a test can point a stand-in `localStorage` at the same key this store writes. */
export const AUTHENTICATOR_STORAGE_KEY = "worldlens-authenticator";

/**
 * One registered account. Nothing in here is a credential - the secret lives behind
 * {@link AuthenticatorVault} under `secretRef`, which today is simply this entry's own id.
 */
export interface AuthenticatorEntry {
    readonly id: string;
    readonly issuer: string;
    readonly account: string;
    /** The vault key for this entry's secret. Never the secret itself. */
    readonly secretRef: string;
    readonly parameters: TotpParameters;
    /** Manual sort position, lowest first. Reordering only ever rewrites this field. */
    readonly order: number;
    /** ISO 8601. */
    readonly createdAt: string;
}

/**
 * Where a registered secret actually lives.
 *
 * The same shape as `LockVault` in `locks/lockModel.ts`, deliberately: two independent
 * seams rather than one shared one, because sharing would mean clearing one feature's
 * secrets could reach into the other's. A build wires each vault to its own storage.
 */
export interface AuthenticatorVault {
    /** Stores a base32 TOTP secret under this entry's `secretRef`. Never returns one. */
    put(secretRef: string, secretBase32: string): Promise<void>;
    /**
     * Reads a stored secret back, to compute the live code.
     *
     * The one call that ever touches a secret's actual bytes. Null when the vault holds
     * nothing for this ref - an entry whose secret has been cleared out from under it, which
     * callers report honestly rather than treating as a code that merely failed to verify.
     */
    get(secretRef: string): Promise<string | null>;
    remove(secretRef: string): Promise<void>;
}

interface AuthenticatorState {
    entries: AuthenticatorEntry[];
    /** Non-null when the stored entries could not be read. Never confused with "none". */
    failure: string | null;
}

function load(): AuthenticatorState {
    try {
        const raw = localStorage.getItem(AUTHENTICATOR_STORAGE_KEY);
        if (raw === null) return { entries: [], failure: null };
        const parsed = JSON.parse(raw) as { entries?: unknown };
        if (!Array.isArray(parsed.entries)) {
            return {
                entries: [],
                failure: "The saved authenticator entries are not in a shape this build recognises.",
            };
        }
        return { entries: parsed.entries as AuthenticatorEntry[], failure: null };
    } catch (error) {
        return {
            entries: [],
            failure: error instanceof Error ? error.message : String(error),
        };
    }
}

export const authenticatorStore = reactive<AuthenticatorState>(load());

let persisting = true;

watch(
    () => JSON.stringify(authenticatorStore.entries),
    (serialised) => {
        // A store that failed to read must never write over what it could not read - that
        // would turn "I could not parse your entries" into "your entries are gone", which is
        // the same failure one step further along and no longer recoverable.
        if (!persisting || authenticatorStore.failure !== null) return;
        try {
            localStorage.setItem(
                AUTHENTICATOR_STORAGE_KEY,
                JSON.stringify({ entries: JSON.parse(serialised) }),
            );
        } catch {
            // A full or refused quota is not worth taking the authenticator down for; the
            // entries stay in memory and the next successful write catches up.
        }
    },
);

/** Stops persistence while a test rearranges the store, so one test cannot write another's. */
export function setAuthenticatorPersistence(on: boolean): void {
    persisting = on;
}

/** Re-reads storage. Used after a test replaces `localStorage`, and by a restore. */
export function reloadAuthenticatorStore(): void {
    const fresh = load();
    authenticatorStore.entries.splice(0, authenticatorStore.entries.length, ...fresh.entries);
    authenticatorStore.failure = fresh.failure;
}

/** Every entry, in the order the person has chosen to see them. */
export const orderedEntries: ComputedRef<readonly AuthenticatorEntry[]> = computed(() =>
    authenticatorStore.entries.slice().sort((a, b) => a.order - b.order),
);

export type RegisterResult =
    | { readonly ok: true; readonly entry: AuthenticatorEntry }
    | { readonly ok: false; readonly message: string };

/**
 * Registers a new entry, proving the pairing with one current code before it is kept.
 *
 * The proof is what makes this safe to skip re-typing later: without it, a mistyped or
 * mis-scanned secret produces an entry that will never again show a code the real service
 * accepts, and the person only discovers that the one time they actually need it.
 */
export async function registerEntry(
    vault: AuthenticatorVault | null,
    draft: {
        readonly issuer: string;
        readonly account: string;
        readonly secretBase32: string;
        readonly parameters?: TotpParameters;
        readonly pairingCode: string;
    },
    options: { readonly id?: string; readonly now?: () => number; readonly nowIso?: string } = {},
): Promise<RegisterResult> {
    if (vault === null) {
        return {
            ok: false,
            message: "This build has nowhere safe to keep an authenticator secret, so nothing was registered.",
        };
    }
    const issuer = draft.issuer.trim();
    const account = draft.account.trim();
    if (account === "") {
        return { ok: false, message: "Name the account this entry is for." };
    }

    const decoded = decodeBase32(draft.secretBase32);
    if (!decoded.ok) return { ok: false, message: decoded.message };

    const parameters = draft.parameters ?? TOTP_DEFAULTS;
    const now = options.now ?? (() => Date.now());
    const paired = await verifyTotp(decoded.bytes, draft.pairingCode, now(), parameters);
    if (!paired) {
        return {
            ok: false,
            message:
                "That code does not match this secret, so nothing was registered. Check the authenticator paired this exact secret.",
        };
    }

    const id = options.id ?? crypto.randomUUID();
    const entry: AuthenticatorEntry = {
        id,
        issuer,
        account,
        secretRef: id,
        parameters,
        order: nextOrder(),
        createdAt: options.nowIso ?? new Date().toISOString(),
    };

    // The secret goes to the vault BEFORE the entry is kept. The other order leaves an entry
    // listed whose secret was never actually stored - an entry nothing can ever compute a
    // code for, which reads to its owner as the app having eaten their pairing.
    try {
        await vault.put(entry.secretRef, draft.secretBase32);
    } catch (error) {
        return {
            ok: false,
            message: `The secret could not be stored, so nothing was registered: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    authenticatorStore.entries.push(entry);
    return { ok: true, entry };
}

function nextOrder(): number {
    return authenticatorStore.entries.reduce((max, entry) => Math.max(max, entry.order), -1) + 1;
}

/** Removes one entry and its secret. Vault last, so an orphaned record never outlives its secret. */
export async function removeEntry(vault: AuthenticatorVault | null, id: string): Promise<void> {
    const index = authenticatorStore.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [removed] = authenticatorStore.entries.splice(index, 1);
    if (vault !== null && removed !== undefined) {
        await vault.remove(removed.secretRef).catch(() => undefined);
    }
}

/** Removes several at once, for the list's bulk action. Reports how many really went. */
export async function removeEntries(vault: AuthenticatorVault | null, ids: readonly string[]): Promise<number> {
    let removed = 0;
    for (const id of ids) {
        if (authenticatorStore.entries.some((entry) => entry.id === id)) {
            await removeEntry(vault, id);
            removed += 1;
        }
    }
    return removed;
}

/** Moves one entry to a new position among the others, renumbering everything after it. */
export function reorderEntry(id: string, toIndex: number): void {
    const ordered = orderedEntries.value.slice();
    const fromIndex = ordered.findIndex((entry) => entry.id === id);
    if (fromIndex < 0) return;
    const [moved] = ordered.splice(fromIndex, 1);
    if (moved === undefined) return;
    ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, moved);

    ordered.forEach((entry, index) => {
        const stored = authenticatorStore.entries.find((candidate) => candidate.id === entry.id);
        if (stored !== undefined) {
            authenticatorStore.entries.splice(authenticatorStore.entries.indexOf(stored), 1, {
                ...stored,
                order: index,
            });
        }
    });
}

/** The searchable text of one entry, for the list's own search bar. */
export function entrySearchText(entry: AuthenticatorEntry): string {
    return [entry.issuer, entry.account].join(" ");
}

/** The corpus a search field's regex builder previews against. */
export function authenticatorCorpus(): string {
    return orderedEntries.value.map(entrySearchText).join("\n");
}

/**
 * Resolves the Electron shell's authenticator vault, or null in a plain browser tab.
 *
 * Probed rather than assumed, exactly as `locks/useLocks.ts` probes its own host: a released
 * shell can load a newer renderer than it was built beside, and a surface that assumed the
 * namespace was complete would offer a Register button that throws when pressed - far worse
 * than one that plainly says this build cannot keep secrets.
 */
export function resolveAuthenticatorVault(bridge: unknown = globalThis): AuthenticatorVault | null {
    const namespace = (bridge as { worldlens?: { authenticator?: { vault?: unknown } } }).worldlens
        ?.authenticator?.vault;
    if (typeof namespace !== "object" || namespace === null) return null;
    const api = namespace as Record<string, unknown>;
    const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === "function";
    if (!isFunction(api["put"]) || !isFunction(api["get"]) || !isFunction(api["remove"])) return null;
    return api as unknown as AuthenticatorVault;
}

/** Why this build cannot register accounts, in one sentence, for a surface to render. */
export function authenticatorVaultMissingReason(): string {
    return "This build has nowhere safe to keep an authenticator secret, so nothing can be registered here. The desktop application is what stores them.";
}

/**
 * Provide/inject for the vault, exactly as `locks/useLocks.ts` does for the lock host.
 *
 * A test hands a fake vault straight to `global.provide` rather than resolving the real
 * bridge, and a real surface with nothing provided falls back to probing `globalThis` itself.
 */
export const AUTHENTICATOR_VAULT: InjectionKey<AuthenticatorVault | null> = Symbol(
    "worldlens.authenticator.vault",
);

export function provideAuthenticatorVault(vault: AuthenticatorVault | null): void {
    provide(AUTHENTICATOR_VAULT, vault);
}

export function useAuthenticatorVault(): AuthenticatorVault | null {
    const injected = inject(AUTHENTICATOR_VAULT, undefined);
    return injected !== undefined ? injected : resolveAuthenticatorVault();
}
