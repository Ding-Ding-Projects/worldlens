/**
 * The live state of every toy lock: which exist, which are open, and for how long.
 *
 * `lockModel.ts` next door is the arithmetic - what a lock is, what opens one, what a
 * record may hold. This is the part with a clock and a memory: the list a surface renders,
 * the unlock sessions that expire, and the failure counters that make a wrong answer slow
 * down. Split that way because the model is pure and exhaustively testable, and everything
 * temporal is here where it can be driven by an injected clock rather than by real time.
 *
 * ## Locked-on-launch is the default, and it is not a policy decision to make lightly
 *
 * Nothing survives a restart except the locks themselves. Unlock sessions are held in
 * memory and are gone the moment the application closes, which is what makes "until the
 * app closes" mean what it says. A store that persisted an open session would turn a
 * self-imposed speed bump into one that quietly stopped bumping.
 *
 * ## Failing open is never an option, but neither is failing silently
 *
 * A build with no host cannot list locks, so it reports that it cannot list them - see
 * {@link LockStore.canList}. It does not report zero locks, because "nothing is locked" and
 * "I cannot see what is locked" are different sentences and only one of them is true.
 */

import { computed, ref, shallowRef, type ComputedRef, type Ref } from "vue";

import {
    createLock,
    lockFor,
    verifyUnlock,
    type LockCreation,
    type LockDuration,
    type LockRecord,
    type LockTarget,
    type LockVault,
    type UnlockOutcome,
} from "./lockModel.js";

/**
 * Where the lock list is kept, and where a TOTP secret is kept.
 *
 * Two halves rather than one because they have different homes: the records are ordinary
 * local application data, and the secrets belong in the operating system credential vault.
 * A build can honestly have the first without the second - a browser tab, say - and the
 * surfaces then offer password locks and say plainly why an authenticator is not on offer,
 * rather than showing a choice that cannot work.
 */
export interface LockHost {
    /** Named in the interface when a capability is missing, e.g. `Electron shell`. */
    readonly name: string;
    load(): Promise<readonly LockRecord[]>;
    save(locks: readonly LockRecord[]): Promise<void>;
    /** Null on a build with no credential store. Password locks still work without it. */
    readonly vault: LockVault | null;
    /**
     * The exact folder a person deletes to reset every lock on this machine.
     *
     * Shown by the unlock prompt and by Support Tickets, so the recovery route names a real
     * path rather than gesturing at "app data". Null when this build genuinely cannot say,
     * and the surfaces then describe the route without inventing a location.
     */
    readonly dataFolder: string | null;
}

/** One open lock, and when it stops being open. */
interface UnlockSession {
    /** Epoch milliseconds, or null for "until something ends it". */
    readonly until: number | null;
    readonly kind: LockDuration["kind"];
}

export interface LockStore {
    /** False when this build cannot see the lock list at all. Never confused with "none". */
    readonly canList: boolean;
    /** True when a TOTP lock can be created on this build - the vault half of the host. */
    readonly canUseAuthenticator: boolean;
    readonly dataFolder: string | null;
    readonly locks: Readonly<Ref<readonly LockRecord[]>>;
    readonly loaded: Readonly<Ref<boolean>>;
    /** Why the list could not be read, in one sentence, or null. */
    readonly failure: Readonly<Ref<string | null>>;

    load(): Promise<void>;
    /** The lock on this exact element, or undefined. Surface and path, never the label. */
    at(surface: string, path: string): LockRecord | undefined;
    /** True when this element is locked AND not currently unlocked. */
    isLocked(surface: string, path: string): boolean;
    add(target: LockTarget, creation: LockCreation, duration?: LockDuration): Promise<AddResult>;
    /**
     * Replaces an existing lock's credential, keeping the element it guards.
     *
     * Separate from remove-then-add because those two are not the same operation from the
     * owner's side: an element that is briefly unlocked between the two is an element
     * anything can touch in the gap, and a failure halfway through leaves it unlocked
     * forever with nothing saying so. This swaps the credential in one step and leaves the
     * lock closed either way.
     */
    changeAuth(lockId: string, creation: LockCreation, duration?: LockDuration): Promise<AddResult>;
    remove(lockId: string): Promise<void>;
    /** Ends an open session without touching the lock. The explicit "Lock again". */
    relock(lockId: string): void;
    /** Ends every open session at once, which is what leaving a surface does. */
    relockAll(kind?: LockDuration["kind"]): void;
    attempt(lockId: string, answer: string): Promise<UnlockOutcome>;
    /** Failed attempts against this lock since the last success. For the prompt's wording. */
    failures(lockId: string): number;
    /** Every lock currently open, so a surface can show what it is holding open. */
    readonly open: ComputedRef<readonly string[]>;
}

export type AddResult =
    | { readonly ok: true; readonly record: LockRecord }
    | { readonly ok: false; readonly message: string };

export interface LockStoreOptions {
    readonly host?: LockHost | null;
    /** Injected in tests. Real callers leave it alone. */
    readonly now?: () => number;
}

export function createLockStore(options: LockStoreOptions = {}): LockStore {
    const host = options.host ?? null;
    const now = options.now ?? (() => Date.now());

    const locks = shallowRef<readonly LockRecord[]>([]);
    const loaded = ref(false);
    const failure = ref<string | null>(null);

    /** In memory only, deliberately - see the note at the top about locked-on-launch. */
    const sessions = ref(new Map<string, UnlockSession>());
    const failureCounts = new Map<string, number>();

    /**
     * Drops sessions that have run out, on read rather than on a timer.
     *
     * A timer would have to be cancelled on unmount, would keep the application awake, and
     * would still be checked on read for correctness. Checking on read is the whole job.
     */
    function live(lockId: string): boolean {
        const session = sessions.value.get(lockId);
        if (session === undefined) return false;
        if (session.until !== null && now() >= session.until) {
            sessions.value.delete(lockId);
            sessions.value = new Map(sessions.value);
            return false;
        }
        return true;
    }

    async function persist(next: readonly LockRecord[]): Promise<void> {
        locks.value = next;
        if (host === null) return;
        await host.save(next);
    }

    return {
        canList: host !== null,
        canUseAuthenticator: host?.vault != null,
        dataFolder: host?.dataFolder ?? null,
        locks,
        loaded,
        failure,

        async load(): Promise<void> {
            if (host === null) {
                loaded.value = true;
                return;
            }
            try {
                locks.value = await host.load();
                failure.value = null;
            } catch (error) {
                // Never an empty list on a failed read: that would render as "nothing is
                // locked", which is the one wrong answer this surface must not give.
                failure.value = error instanceof Error ? error.message : String(error);
            } finally {
                loaded.value = true;
            }
        },

        at(surface, path) {
            return lockFor(locks.value, surface, path);
        },

        isLocked(surface, path) {
            const lock = lockFor(locks.value, surface, path);
            return lock !== undefined && !live(lock.id);
        },

        async add(target, creation, duration): Promise<AddResult> {
            if (creation.method === "totp" && host?.vault == null) {
                return {
                    ok: false,
                    message:
                        "This build has nowhere safe to keep an authenticator secret, so this lock can only use a password.",
                };
            }
            const existing = lockFor(locks.value, target.surface, target.path);
            if (existing !== undefined) {
                return {
                    ok: false,
                    message: `${target.label} already has a lock. Remove that one first - an element carries one lock, with one credential.`,
                };
            }

            const made = await createLock(target, creation, {
                ...(duration === undefined ? {} : { duration }),
            });
            if (!made.ok) return made;

            // The secret goes to the vault BEFORE the record is saved. The other order
            // leaves a lock listed whose secret was never stored, which is a lock nothing
            // can open and which reads to its owner as the app having eaten their pairing.
            if (creation.method === "totp" && host?.vault != null) {
                try {
                    await host.vault.put(made.record.id, creation.secretBase32);
                } catch (error) {
                    return {
                        ok: false,
                        message: `The secret could not be stored, so no lock was made: ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                    };
                }
            }

            await persist([...locks.value, made.record]);
            return { ok: true, record: made.record };
        },

        async changeAuth(lockId, creation, duration): Promise<AddResult> {
            const existing = locks.value.find((lock) => lock.id === lockId);
            if (existing === undefined) {
                return { ok: false, message: "That lock is no longer in the list." };
            }
            if (creation.method === "totp" && host?.vault == null) {
                return {
                    ok: false,
                    message:
                        "This build has nowhere safe to keep an authenticator secret, so this lock can only use a password.",
                };
            }

            const made = await createLock(existing.target, creation, {
                ...(duration === undefined ? { duration: existing.duration } : { duration }),
            });
            if (!made.ok) return made;

            // The new record keeps the original id, so nothing that referenced this lock -
            // an open session, a failure count, a row the list is rendering - is looking at
            // an id that has just stopped existing.
            const record = { ...made.record, id: existing.id, createdAt: existing.createdAt };

            if (creation.method === "totp") {
                try {
                    await host?.vault?.put(record.id, creation.secretBase32);
                } catch (error) {
                    return {
                        ok: false,
                        message: `The new secret could not be stored, so the lock still uses its old credential: ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                    };
                }
            }

            await persist(locks.value.map((lock) => (lock.id === lockId ? record : lock)));

            // A credential change closes the lock. Leaving a session open across it would
            // mean the old password still had effect after being replaced, which is the
            // opposite of what somebody changing it has just asked for.
            sessions.value.delete(lockId);
            sessions.value = new Map(sessions.value);
            failureCounts.delete(lockId);

            // Only once the record no longer refers to it. A stale secret left behind by a
            // password change is inert, and clearing it before the save would have been the
            // failure that leaves a TOTP lock listed with nothing to check against.
            if (existing.method === "totp" && creation.method !== "totp" && host?.vault != null) {
                await host.vault.remove(lockId).catch(() => undefined);
            }

            return { ok: true, record };
        },

        async remove(lockId): Promise<void> {
            const record = locks.value.find((lock) => lock.id === lockId);
            await persist(locks.value.filter((lock) => lock.id !== lockId));
            sessions.value.delete(lockId);
            sessions.value = new Map(sessions.value);
            failureCounts.delete(lockId);
            // Vault last, so a failure to clear a secret cannot leave a listed lock whose
            // record is gone. An orphaned secret is inert; an orphaned record is not.
            if (record?.method === "totp" && host?.vault != null) {
                await host.vault.remove(lockId).catch(() => undefined);
            }
        },

        relock(lockId): void {
            sessions.value.delete(lockId);
            sessions.value = new Map(sessions.value);
        },

        relockAll(kind): void {
            if (kind === undefined) {
                sessions.value = new Map();
                return;
            }
            const next = new Map(sessions.value);
            for (const [id, session] of next) if (session.kind === kind) next.delete(id);
            sessions.value = next;
        },

        async attempt(lockId, answer): Promise<UnlockOutcome> {
            const record = locks.value.find((lock) => lock.id === lockId);
            if (record === undefined) return { ok: false, reason: "mismatch" };

            const outcome = await verifyUnlock(record, answer, {
                vault: host?.vault ?? null,
                atMs: now(),
                failures: failureCounts.get(lockId) ?? 0,
            });

            if (outcome.ok) {
                failureCounts.delete(lockId);
                const next = new Map(sessions.value);
                next.set(lockId, { until: outcome.until, kind: record.duration.kind });
                sessions.value = next;
            } else if (outcome.reason === "mismatch") {
                // A missing secret is not the person's mistake, so it never counts against
                // them - otherwise a broken vault would rate-limit somebody out of a lock
                // they were never given a chance to open.
                failureCounts.set(lockId, (failureCounts.get(lockId) ?? 0) + 1);
            }
            return outcome;
        },

        failures(lockId) {
            return failureCounts.get(lockId) ?? 0;
        },

        open: computed(() => [...sessions.value.keys()].filter((id) => live(id))),
    };
}

/**
 * Why this build cannot manage locks, in one sentence, for a surface to render.
 *
 * A stated fact rather than a disabled control that silently does nothing, which is the
 * rule every host-backed surface in this application follows.
 */
export function lockHostMissingReason(): string {
    return "This build cannot keep locks, so nothing here can be locked. The desktop application is what stores them.";
}
