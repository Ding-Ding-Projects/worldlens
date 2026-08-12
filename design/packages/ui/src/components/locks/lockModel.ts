/**
 * Toy locks: a self-imposed speed bump in front of any element the interface renders.
 *
 * ## It is for fun, and every surface built on this says so
 *
 * This is a user-experience lock in exactly the sense School mode is. It is not encryption,
 * it is not protection from anybody else who has the machine, and it never guards anything
 * a person cannot afford to be locked out of. Nothing here should ever be described as
 * securing or protecting: forgetting a password is a *normal* outcome for a toy lock, which
 * is why {@link LOCK_RECOVERY} exists and why every prompt has to name it.
 *
 * ## Every lock carries its own credential, and that is the whole design
 *
 * There is no master credential and no inheritance. A tab may be behind a password while
 * the font size beside it is behind an authenticator; unlocking one never unlocks another;
 * locking a group does not relock its members under the group's credential. A person who
 * wants one credential everywhere gets there by deliberately reusing it, never by this
 * module assuming it. So locks are a real enumerable list rather than a flag hanging off
 * each element, and the list is what makes them searchable, individually removable, and
 * manageable in bulk like every other list in the application.
 *
 * ## What is stored, and what is not
 *
 * A password is kept as a PBKDF2 verifier - salt, iterations, and the derived bytes - never
 * as the password. A TOTP lock keeps no secret here at all: the secret belongs in the
 * operating system credential vault behind {@link LockVault}, and this module holds only
 * the fact that the lock is a TOTP one. Nothing in a {@link LockRecord} is a credential, so
 * a record can go into settings, history and an export without carrying anything usable -
 * which is exactly what those surfaces need, and exactly what a naive design gets wrong.
 *
 * The refusal rules apply on top of all of it: neither this application nor an agent
 * working on it ever displays, hints at, or characterises a stored secret's value, its
 * length, or its composition.
 */

import { decodeBase32, verifyTotp, type TotpParameters, TOTP_DEFAULTS } from "./totp.js";

/** How a particular lock is opened. Chosen per lock, never inherited from another. */
export type LockMethod = "password" | "totp";

/**
 * How long an unlock lasts, chosen when the lock is made and changeable afterwards.
 *
 * `surface` is the tightest and the default: the unlock covers this one surface and is gone
 * the moment attention leaves it. `session` lasts until the application closes. `minutes`
 * is a bounded stretch for somebody who is going to be in and out of the same thing.
 */
export type LockDuration =
    | { readonly kind: "surface" }
    | { readonly kind: "session" }
    | { readonly kind: "minutes"; readonly minutes: number };

export const DEFAULT_LOCK_DURATION: LockDuration = { kind: "surface" };
export const MAX_LOCK_MINUTES = 24 * 60;

/**
 * A PBKDF2 verifier: enough to check a password, never enough to learn one.
 *
 * The iteration count is stored per record rather than read from a constant, so a record
 * written by an older build keeps verifying at the count it was written with. A verifier
 * that silently changed its own cost would stop matching every password ever set.
 */
export interface PasswordVerifier {
    readonly kind: "pbkdf2";
    readonly hash: "SHA-256";
    readonly iterations: number;
    /** Base64. Random per lock, so two locks with the same password do not look alike. */
    readonly salt: string;
    /** Base64 of the derived bytes. */
    readonly derived: string;
}

/** Today's cost. Deliberately not applied retroactively - see {@link PasswordVerifier}. */
export const PBKDF2_ITERATIONS = 210_000;

/**
 * What a lock is attached to.
 *
 * A stable identity for one rendered thing: a surface and a path within it, rather than a
 * DOM node, an index or a label. A label moves with a rename and an index moves when
 * anything is reordered, and a lock that quietly attached itself to the neighbouring
 * element after a reorder would be worse than no lock at all.
 */
export interface LockTarget {
    /** Which surface owns the element, e.g. `settings`, `project`, `tabs`. */
    readonly surface: string;
    /** The element within it, e.g. `appearance.fontSize` or `tab:overworld`. */
    readonly path: string;
    /** What to call it in a list, a prompt and a search result. Never the credential. */
    readonly label: string;
}

/** One lock. Nothing in here is a credential; see the note at the top of this file. */
export interface LockRecord {
    readonly id: string;
    readonly target: LockTarget;
    readonly method: LockMethod;
    readonly duration: LockDuration;
    /** ISO 8601. */
    readonly createdAt: string;
    /** Present only for a password lock. A TOTP lock's secret lives in the vault. */
    readonly verifier: PasswordVerifier | null;
    /** Present only for a TOTP lock, and carries no secret - only its shape. */
    readonly totp: TotpParameters | null;
}

/**
 * Where a TOTP lock's secret actually lives.
 *
 * Kept behind a seam for the same reason the project host is: this package runs in the
 * Electron shell where an OS credential vault exists, in a plain browser tab where it does
 * not, and in vitest where a fake makes the whole surface testable with nothing near a real
 * keychain. A missing vault is a stated fact on the surface, never a lock that silently
 * fails open or a button that throws when pressed.
 */
export interface LockVault {
    /** Stores a base32 TOTP secret under this lock's id. Never returns one. */
    put(lockId: string, secretBase32: string): Promise<void>;
    /**
     * Reads a stored secret back, for verification only.
     *
     * The one call that handles a secret, which is why it is on the vault rather than in a
     * store somewhere: nothing above this line ever holds the value, and no surface ever
     * renders it. Null when the vault has nothing for this lock - a lock whose secret has
     * been cleared out from under it, which {@link verifyUnlock} reports honestly rather
     * than treating as a refusal.
     */
    get(lockId: string): Promise<string | null>;
    remove(lockId: string): Promise<void>;
}

/**
 * Where a person goes when they have forgotten the password to a for-fun lock.
 *
 * Named here, once, so every prompt and every setting quotes the same route rather than
 * inventing its own wording. The route is deliberately self-service: no reset ticket, no
 * account, no support channel, because a toy lock must never be the only thing standing
 * between somebody and their own content.
 */
export const LOCK_RECOVERY = {
    /** What the person does. The exact folder is named by the surface, which knows it. */
    action: "delete this application's local data folder",
    /** The joke desk that walks them through it. See `SupportTickets`. */
    route: "Support Tickets",
} as const;

/* -------------------------------------------------------------------------- */
/* Making one                                                                 */
/* -------------------------------------------------------------------------- */

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

async function derive(
    password: string,
    salt: Uint8Array,
    iterations: number,
): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password) as unknown as ArrayBuffer,
        "PBKDF2",
        false,
        ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: salt as unknown as ArrayBuffer, iterations, hash: "SHA-256" },
        key,
        256,
    );
    return new Uint8Array(bits);
}

/** Builds the verifier for a password. The password itself never leaves this call. */
export async function makePasswordVerifier(
    password: string,
    iterations = PBKDF2_ITERATIONS,
): Promise<PasswordVerifier> {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const derived = await derive(password, salt, iterations);
    return {
        kind: "pbkdf2",
        hash: "SHA-256",
        iterations,
        salt: toBase64(salt),
        derived: toBase64(derived),
    };
}

export type LockCreation =
    | { readonly method: "password"; readonly password: string }
    | { readonly method: "totp"; readonly secretBase32: string; readonly parameters?: TotpParameters };

export type LockCreateResult =
    | { readonly ok: true; readonly record: LockRecord }
    | { readonly ok: false; readonly message: string };

/**
 * A new lock for one element, with its own credential and nobody else's.
 *
 * Refuses an empty password and an unreadable secret rather than creating a lock nothing
 * can ever open - the one failure mode a for-fun lock genuinely cannot recover from
 * gracefully, because the person would be sent to delete their data folder for a lock they
 * never successfully made.
 */
export async function createLock(
    target: LockTarget,
    creation: LockCreation,
    options: {
        readonly id?: string;
        readonly duration?: LockDuration;
        readonly now?: string;
        readonly iterations?: number;
    } = {},
): Promise<LockCreateResult> {
    const id = options.id ?? crypto.randomUUID();
    const createdAt = options.now ?? new Date().toISOString();
    const duration = options.duration ?? DEFAULT_LOCK_DURATION;

    if (duration.kind === "minutes") {
        if (!Number.isInteger(duration.minutes) || duration.minutes < 1) {
            return { ok: false, message: "An unlock has to last at least a whole minute." };
        }
        if (duration.minutes > MAX_LOCK_MINUTES) {
            return { ok: false, message: `An unlock cannot last longer than ${MAX_LOCK_MINUTES} minutes.` };
        }
    }

    if (creation.method === "password") {
        if (creation.password === "") {
            return { ok: false, message: "A lock with an empty password is a lock nothing opens." };
        }
        return {
            ok: true,
            record: {
                id,
                target,
                method: "password",
                duration,
                createdAt,
                verifier: await makePasswordVerifier(creation.password, options.iterations),
                totp: null,
            },
        };
    }

    const decoded = decodeBase32(creation.secretBase32);
    if (!decoded.ok) return { ok: false, message: decoded.message };
    return {
        ok: true,
        record: {
            id,
            target,
            method: "totp",
            duration,
            createdAt,
            verifier: null,
            totp: creation.parameters ?? TOTP_DEFAULTS,
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Opening one                                                                */
/* -------------------------------------------------------------------------- */

export type UnlockOutcome =
    | { readonly ok: true; readonly until: number | null }
    /** The answer was wrong. Says so and nothing more - no hint, no partial match. */
    | { readonly ok: false; readonly reason: "mismatch" }
    /** The lock is a TOTP one and its secret is not in the vault. Not the person's fault. */
    | { readonly ok: false; readonly reason: "no-secret" }
    /** Too many attempts too quickly. Never an escalation, never a wipe. */
    | { readonly ok: false; readonly reason: "rate-limited"; readonly retryInMs: number };

/** When an unlock of this duration expires, or null for "until something ends it". */
export function unlockExpiry(duration: LockDuration, atMs: number): number | null {
    return duration.kind === "minutes" ? atMs + duration.minutes * 60_000 : null;
}

/**
 * Checks one attempt against one lock.
 *
 * Rate limiting is by attempt count rather than by a lockout: a for-fun lock that locked
 * somebody out harder the more they tried would be punishing exactly the person it exists
 * to gently slow down. The delay grows, it is reported in words, and it never destroys
 * anything.
 */
export async function verifyUnlock(
    record: LockRecord,
    answer: string,
    context: {
        readonly vault: LockVault | null;
        readonly atMs: number;
        /** Failed attempts so far for this lock, from the caller's own counter. */
        readonly failures?: number;
        /** Injected in tests. Real callers leave it alone. */
        readonly minDelayMs?: number;
    },
): Promise<UnlockOutcome> {
    const failures = context.failures ?? 0;
    const delay = attemptDelayMs(failures, context.minDelayMs ?? 500);
    if (delay > 0 && failures >= 3) {
        return { ok: false, reason: "rate-limited", retryInMs: delay };
    }

    if (record.method === "password") {
        const verifier = record.verifier;
        if (verifier === null) return { ok: false, reason: "mismatch" };
        const derived = await derive(answer, fromBase64(verifier.salt), verifier.iterations);
        const expected = fromBase64(verifier.derived);
        return equalBytes(derived, expected)
            ? { ok: true, until: unlockExpiry(record.duration, context.atMs) }
            : { ok: false, reason: "mismatch" };
    }

    if (context.vault === null) return { ok: false, reason: "no-secret" };
    const secret = await context.vault.get(record.id);
    if (secret === null) return { ok: false, reason: "no-secret" };
    const decoded = decodeBase32(secret);
    if (!decoded.ok) return { ok: false, reason: "no-secret" };

    const matched = await verifyTotp(
        decoded.bytes,
        answer,
        context.atMs,
        record.totp ?? TOTP_DEFAULTS,
    );
    return matched
        ? { ok: true, until: unlockExpiry(record.duration, context.atMs) }
        : { ok: false, reason: "mismatch" };
}

/** Three free attempts, then a delay that grows and stops growing at half a minute. */
export function attemptDelayMs(failures: number, base: number): number {
    if (failures < 3) return 0;
    return Math.min(base * 2 ** (failures - 3), 30_000);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!;
    return difference === 0;
}

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

/** Whether this exact element carries a lock. Surface and path both, never the label. */
export function lockFor(
    locks: readonly LockRecord[],
    surface: string,
    path: string,
): LockRecord | undefined {
    return locks.find((lock) => lock.target.surface === surface && lock.target.path === path);
}

/**
 * The searchable text of one lock, for the list's own search bar.
 *
 * Method and surface are in it because "show me everything behind an authenticator" and
 * "show me everything locked on the settings screen" are both real questions. The
 * credential is not in it, and could not be: a record never holds one.
 */
export function lockSearchText(lock: LockRecord): string {
    return [lock.target.label, lock.target.surface, lock.target.path, lock.method].join(" ");
}

/**
 * Every lock this element and its descendants carry, for a bulk action's preview.
 *
 * Prefix matching on the path, so locking `appearance` and then asking what is locked under
 * it answers with the whole subtree rather than only the exact node. The `.` guard is what
 * stops `appearance` claiming `appearanceEditor`, which is the sort of near-miss that makes
 * a bulk preview quietly wrong.
 */
export function locksUnder(
    locks: readonly LockRecord[],
    surface: string,
    path: string,
): readonly LockRecord[] {
    return locks.filter(
        (lock) =>
            lock.target.surface === surface &&
            (lock.target.path === path || lock.target.path.startsWith(`${path}.`)),
    );
}
