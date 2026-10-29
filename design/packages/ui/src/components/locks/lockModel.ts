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

/** One credential a lock can ask for. A lock asks for one, two or all three at once. */
export type LockFactor = "pin" | "password" | "totp";

/**
 * How a particular lock is opened. Chosen per lock, never inherited from another.
 *
 * A combined method needs every one of its parts in the same attempt. The parts are checked
 * together by {@link verifyUnlock} and refused together, so a wrong answer never says which
 * part was wrong, and the whole lock shares one attempt budget.
 *
 * `totp` on its own is kept so that locks made before the combined methods existed keep
 * opening exactly as they did. It is no longer offered for a new lock - see
 * {@link OFFERED_LOCK_METHODS}.
 */
export type LockMethod =
    | "pin"
    | "password"
    | "pin+password"
    | "password+totp"
    | "pin+totp"
    | "password+pin+totp"
    | "totp";

/** The parts each method asks for, in the order a form presents them. */
const METHOD_FACTORS: Readonly<Record<LockMethod, readonly LockFactor[]>> = {
    pin: ["pin"],
    password: ["password"],
    "pin+password": ["password", "pin"],
    "password+totp": ["password", "totp"],
    "pin+totp": ["pin", "totp"],
    "password+pin+totp": ["password", "pin", "totp"],
    totp: ["totp"],
};

/** Every method a stored record may carry, including the older authenticator-only one. */
export const LOCK_METHODS: readonly LockMethod[] = Object.keys(METHOD_FACTORS) as LockMethod[];

/** The six methods a new lock, or a changed one, may choose from. */
export const OFFERED_LOCK_METHODS = [
    "pin",
    "password",
    "pin+password",
    "password+totp",
    "pin+totp",
    "password+pin+totp",
] as const satisfies readonly LockMethod[];

export function isLockMethod(value: unknown): value is LockMethod {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(METHOD_FACTORS, value);
}

/** The parts a method asks for. */
export function lockFactors(method: LockMethod): readonly LockFactor[] {
    return METHOD_FACTORS[method];
}

/** True when the method needs an authenticator secret in the vault. */
export function methodUsesTotp(method: LockMethod): boolean {
    return METHOD_FACTORS[method].includes("totp");
}

/** A PIN is digits only, between these lengths inclusive. */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 12;

export type PinProblem = "empty" | "not-digits" | "too-short" | "too-long";

/**
 * What is wrong with a PIN, or null when it is acceptable.
 *
 * The one PIN rule, used by the wizard, the model and the unlock prompt alike, so typed and
 * keypad entry can never disagree about what a PIN is.
 */
export function pinProblem(pin: string): PinProblem | null {
    if (pin === "") return "empty";
    if (!/^[0-9]+$/.test(pin)) return "not-digits";
    if (pin.length < PIN_MIN_LENGTH) return "too-short";
    if (pin.length > PIN_MAX_LENGTH) return "too-long";
    return null;
}

/** Keeps the ASCII digits of some typed text, up to the longest PIN allowed. */
export function pinDigits(text: string): string {
    return text.replace(/[^0-9]/g, "").slice(0, PIN_MAX_LENGTH);
}

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
    /** Present when the method includes a password. A TOTP secret lives in the vault. */
    readonly verifier: PasswordVerifier | null;
    /**
     * Present when the method includes a PIN: the same salted PBKDF2 verifier a password
     * gets, never the digits. Absent from records written before PINs existed, which
     * {@link migrateLockRecord} reads as null.
     */
    readonly pinVerifier: PasswordVerifier | null;
    /** Present when the method includes an authenticator, and carries no secret - only its shape. */
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

/**
 * What a new lock is made from: the method, and one value for each part it asks for.
 *
 * Values for parts the method does not ask for are ignored and never stored.
 */
export interface LockCreation {
    readonly method: LockMethod;
    readonly password?: string;
    readonly pin?: string;
    readonly secretBase32?: string;
    readonly parameters?: TotpParameters;
}

export type LockCreateResult =
    | { readonly ok: true; readonly record: LockRecord }
    | { readonly ok: false; readonly message: string };

/** Why a PIN was refused, in one sentence. */
export function pinProblemMessage(problem: PinProblem): string {
    switch (problem) {
        case "empty":
            return "A lock with an empty PIN is a lock nothing opens.";
        case "not-digits":
            return "A PIN is digits only.";
        case "too-short":
            return `A PIN needs at least ${PIN_MIN_LENGTH} digits.`;
        case "too-long":
            return `A PIN can be at most ${PIN_MAX_LENGTH} digits.`;
    }
}

/**
 * A new lock for one element, with its own credential and nobody else's.
 *
 * Refuses an empty password, an unusable PIN and an unreadable secret rather than creating
 * a lock nothing can ever open - the one failure mode a for-fun lock genuinely cannot
 * recover from gracefully, because the person would be sent to delete their data folder for
 * a lock they never successfully made. Every part is checked before any hashing starts.
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

    if (!isLockMethod(creation.method)) {
        return { ok: false, message: "That is not a way this application can open a lock." };
    }
    if (duration.kind === "minutes") {
        if (!Number.isInteger(duration.minutes) || duration.minutes < 1) {
            return { ok: false, message: "An unlock has to last at least a whole minute." };
        }
        if (duration.minutes > MAX_LOCK_MINUTES) {
            return { ok: false, message: `An unlock cannot last longer than ${MAX_LOCK_MINUTES} minutes.` };
        }
    }

    const factors = lockFactors(creation.method);
    const password = creation.password ?? "";
    const pin = creation.pin ?? "";

    if (factors.includes("password") && password === "") {
        return { ok: false, message: "A lock with an empty password is a lock nothing opens." };
    }
    if (factors.includes("pin")) {
        const problem = pinProblem(pin);
        if (problem !== null) return { ok: false, message: pinProblemMessage(problem) };
    }
    if (factors.includes("totp")) {
        const decoded = decodeBase32(creation.secretBase32 ?? "");
        if (!decoded.ok) return { ok: false, message: decoded.message };
    }

    return {
        ok: true,
        record: {
            id,
            target,
            method: creation.method,
            duration,
            createdAt,
            verifier: factors.includes("password")
                ? await makePasswordVerifier(password, options.iterations)
                : null,
            pinVerifier: factors.includes("pin")
                ? await makePasswordVerifier(pin, options.iterations)
                : null,
            totp: factors.includes("totp") ? (creation.parameters ?? TOTP_DEFAULTS) : null,
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Reading one written by an older build                                      */
/* -------------------------------------------------------------------------- */

function isRecordObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A stored record as this build reads it, or null when it is not a lock at all.
 *
 * Records written before PINs existed have no `pinVerifier`; they are read with it set to
 * null and every other field exactly as stored, so a password or authenticator lock made by
 * an older build opens with the same credential it always did. Nothing is re-hashed and
 * nothing is rewritten until the list is next saved for some other reason.
 */
export function migrateLockRecord(value: unknown): LockRecord | null {
    if (!isRecordObject(value)) return null;
    if (typeof value["id"] !== "string" || value["id"] === "") return null;
    if (!isLockMethod(value["method"])) return null;
    const target = value["target"];
    if (
        !isRecordObject(target) ||
        typeof target["surface"] !== "string" ||
        typeof target["path"] !== "string"
    ) {
        return null;
    }
    const record = value as unknown as LockRecord;
    return {
        ...record,
        target: {
            ...record.target,
            label: typeof target["label"] === "string" ? target["label"] : target["path"],
        },
        duration: isRecordObject(value["duration"]) ? record.duration : DEFAULT_LOCK_DURATION,
        verifier: isRecordObject(value["verifier"]) ? record.verifier : null,
        pinVerifier: isRecordObject(value["pinVerifier"]) ? record.pinVerifier : null,
        totp: isRecordObject(value["totp"]) ? record.totp : null,
    };
}

/* -------------------------------------------------------------------------- */
/* Opening one                                                                */
/* -------------------------------------------------------------------------- */

export type UnlockOutcome =
    | { readonly ok: true; readonly until: number | null }
    /** The answer was wrong. Says so and nothing more - no hint, no partial match, no part. */
    | { readonly ok: false; readonly reason: "mismatch" }
    /** The lock uses an authenticator and its secret is not in the vault. Not the person's fault. */
    | { readonly ok: false; readonly reason: "no-secret" }
    /** Too many attempts too quickly. The answer was not checked and the try was not spent. */
    | { readonly ok: false; readonly reason: "rate-limited"; readonly retryInMs: number };

/**
 * One attempt's answers, one per part of the lock.
 *
 * PIN digits arrive here the same way whether they were typed or pressed on the on-screen
 * keypad: both edit one value, and this is the only shape the validator accepts.
 */
export interface UnlockAnswer {
    readonly password?: string;
    readonly pin?: string;
    readonly code?: string;
}

/**
 * Maps a single typed answer onto a one-part lock. A lock with several parts gets nothing
 * from a single string, so it can only be opened with every part supplied.
 */
export function singleAnswer(method: LockMethod, text: string): UnlockAnswer {
    const factors = lockFactors(method);
    if (factors.length !== 1) return {};
    const factor = factors[0]!;
    return factor === "totp" ? { code: text } : { [factor]: text };
}

/** When an unlock of this duration expires, or null for "until something ends it". */
export function unlockExpiry(duration: LockDuration, atMs: number): number | null {
    return duration.kind === "minutes" ? atMs + duration.minutes * 60_000 : null;
}

/* -------------------------------------------------------------------------- */
/* The attempt budget                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One lock's attempt budget: how many answers have failed since the last success, and when
 * the next answer may be checked.
 *
 * Exactly one of these exists per lock, whatever the method and however the answer was
 * entered, so a combined lock cannot be probed one part at a time and a PIN typed on the
 * keyboard spends the same budget as one pressed on the keypad.
 */
export interface AttemptBudget {
    readonly failures: number;
    /** Epoch milliseconds before which no answer is checked. Zero when there is no wait. */
    readonly blockedUntil: number;
}

export const FRESH_BUDGET: AttemptBudget = { failures: 0, blockedUntil: 0 };
export const ATTEMPT_BASE_DELAY_MS = 500;

/** Three free attempts, then a delay that doubles and stops growing at half a minute. */
export function attemptDelayMs(failures: number, base: number): number {
    if (failures < 3) return 0;
    return Math.min(base * 2 ** (failures - 3), 30_000);
}

/** How long is left before the next answer is checked, or zero. */
export function budgetWait(budget: AttemptBudget, atMs: number): number {
    return Math.max(0, budget.blockedUntil - atMs);
}

/** The budget after one more wrong answer: the count goes up and the wait grows with it. */
export function budgetAfterFailure(
    budget: AttemptBudget,
    atMs: number,
    base = ATTEMPT_BASE_DELAY_MS,
): AttemptBudget {
    const failures = budget.failures + 1;
    const delay = attemptDelayMs(failures, base);
    return { failures, blockedUntil: delay > 0 ? atMs + delay : 0 };
}

/**
 * The budget once a wait has been skipped: the wait is gone and the count is untouched.
 *
 * Keeping the count is the whole point. The next wrong answer is checked against the same
 * count it would have been after serving the wait in full, so its wait is just as long and
 * no attempt has been handed back.
 */
export function budgetAfterSkip(budget: AttemptBudget): AttemptBudget {
    return { failures: budget.failures, blockedUntil: 0 };
}

async function matchesVerifier(verifier: PasswordVerifier | null, answer: string): Promise<boolean> {
    if (verifier === null) return false;
    const derived = await derive(answer, fromBase64(verifier.salt), verifier.iterations);
    return equalBytes(derived, fromBase64(verifier.derived));
}

/**
 * Checks one attempt against one lock. The only validator any lock has.
 *
 * Every part the method asks for is checked, all of them every time, and the result is a
 * single yes or no. While the budget says to wait, nothing is checked at all, so a wait can
 * never be used to learn whether an answer was right.
 */
export async function verifyUnlock(
    record: LockRecord,
    answer: UnlockAnswer | string,
    context: {
        readonly vault: LockVault | null;
        readonly atMs: number;
        /** This lock's budget, from the caller's own record of it. */
        readonly budget?: AttemptBudget;
    },
): Promise<UnlockOutcome> {
    const wait = budgetWait(context.budget ?? FRESH_BUDGET, context.atMs);
    if (wait > 0) return { ok: false, reason: "rate-limited", retryInMs: wait };

    if (!isLockMethod(record.method)) return { ok: false, reason: "mismatch" };
    const given = typeof answer === "string" ? singleAnswer(record.method, answer) : answer;
    const factors = lockFactors(record.method);

    // The vault is read before anything is compared, so a missing secret is reported the
    // same way whatever else was typed and never says whether the other parts were right.
    let secret: Uint8Array | null = null;
    if (factors.includes("totp")) {
        if (context.vault === null) return { ok: false, reason: "no-secret" };
        const stored = await context.vault.get(record.id);
        if (stored === null) return { ok: false, reason: "no-secret" };
        const decoded = decodeBase32(stored);
        if (!decoded.ok) return { ok: false, reason: "no-secret" };
        secret = decoded.bytes;
    }

    let matched = true;
    for (const factor of factors) {
        let part: boolean;
        if (factor === "password") {
            part = await matchesVerifier(record.verifier, given.password ?? "");
        } else if (factor === "pin") {
            const pin = given.pin ?? "";
            part = (await matchesVerifier(record.pinVerifier, pin)) && pinProblem(pin) === null;
        } else {
            part =
                secret !== null &&
                (await verifyTotp(secret, given.code ?? "", context.atMs, record.totp ?? TOTP_DEFAULTS));
        }
        // No early exit: every part is evaluated whatever the earlier ones said.
        matched = part && matched;
    }

    return matched
        ? { ok: true, until: unlockExpiry(record.duration, context.atMs) }
        : { ok: false, reason: "mismatch" };
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
