/**
 * Where this machine's toy locks actually live.
 *
 * The renderer owns the whole lock *model* - verifiers, TOTP parameters, durations - and this
 * module owns nothing but the two places that model needs and a browser tab cannot provide: a
 * file under `userData` for the records, and the operating system's own credential vault for
 * the one field that is genuinely a secret.
 *
 * ## Why the split, again, down here
 *
 * A lock record carries a salted one-way verifier, which is safe to write to ordinary
 * application data - it is what a password is checked *against*, never the password. A TOTP
 * lock carries a base32 secret, which is a live credential: anyone holding it can generate
 * valid codes forever. So the record goes in the file and the secret goes in `safeStorage`,
 * and the file is never the thing that has to be protected.
 *
 * ## The vault refuses rather than degrades
 *
 * `safeStorage.isEncryptionAvailable()` is false on a machine with no usable keychain, and the
 * honest answer there is "this build cannot offer an authenticator lock" - which the renderer
 * already knows how to say. Writing the secret out in the clear because encryption was
 * unavailable would be the one failure that turns a for-fun lock into a real disclosure, so it
 * is refused outright instead.
 *
 * None of this makes a toy lock a security boundary. It is still a self-imposed speed bump
 * that anybody can clear by deleting the folder named below, exactly as the surfaces say.
 */

import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteTextFile } from "../storage/atomicReplace.js";

export const LOCKS_FILE = "toy-locks.v1.json";
export const LOCKS_VERSION = 1;

/**
 * A lock list is a handful of small records, so a file larger than this is not a big list -
 * it is a corrupt or hostile file, and parsing it would be the only expensive thing here.
 */
export const LOCKS_MAX_BYTES = 512 * 1024;

/** Bounds that exist so one malformed file cannot allocate an unbounded list. */
export const LOCKS_MAX_RECORDS = 2_000;
const MAX_STRING = 512;

/** The part of Electron's `safeStorage` this module uses, so a test can supply its own. */
export interface SafeStorageLike {
    isEncryptionAvailable(): boolean;
    encryptString(plainText: string): Buffer;
    decryptString(encrypted: Buffer): string;
}

/**
 * A lock record as it crosses the boundary.
 *
 * Deliberately structural rather than an import of the renderer's `LockRecord`: the main
 * process must not depend on the UI package, and a shape validated here is a shape that
 * cannot arrive malformed from a renderer built at a different time to this shell.
 */
export type StoredLock = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= MAX_STRING;
}

/**
 * True when a record carries the fields every lock has, whatever else it carries.
 *
 * Checked rather than trusted because this file is ordinary application data that a person
 * can edit, and a record with no `id` would make an unremovable row in the list - a lock that
 * cannot be managed is precisely the state the recovery route exists to prevent.
 */
export function isStoredLock(value: unknown): value is StoredLock {
    if (!isPlainObject(value)) return false;
    if (!isBoundedString(value["id"])) return false;
    if (value["method"] !== "password" && value["method"] !== "totp") return false;

    const target = value["target"];
    if (!isPlainObject(target)) return false;
    if (!isBoundedString(target["surface"]) || !isBoundedString(target["path"])) return false;

    return true;
}

/**
 * Every valid record in the file, with invalid ones dropped rather than the whole list.
 *
 * One unreadable record must not cost a person every other lock they made, so the parse is
 * per-record. Duplicate ids are collapsed to the first, because two rows with one id make
 * "remove" ambiguous and the list surface would show a row that reappears when removed.
 */
export function parseLocks(text: string): readonly StoredLock[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return [];
    }

    const list = isPlainObject(parsed) ? parsed["locks"] : undefined;
    if (!Array.isArray(list)) return [];

    const seen = new Set<string>();
    const records: StoredLock[] = [];
    for (const entry of list) {
        if (records.length >= LOCKS_MAX_RECORDS) break;
        if (!isStoredLock(entry)) continue;
        const id = entry["id"] as string;
        if (seen.has(id)) continue;
        seen.add(id);
        records.push(entry);
    }
    return records;
}

export interface LockStorageOptions {
    /** Electron's `app.getPath("userData")`, or a temporary directory in a test. */
    readonly dataFolder: string;
    readonly safeStorage: SafeStorageLike;
}

/** The shell half of the lock host: the record file, and the secrets beside it. */
export class LockStorage {
    readonly #file: string;
    readonly #dataFolder: string;
    readonly #safeStorage: SafeStorageLike;

    constructor(options: LockStorageOptions) {
        this.#dataFolder = options.dataFolder;
        this.#file = join(options.dataFolder, LOCKS_FILE);
        this.#safeStorage = options.safeStorage;
    }

    /** The exact folder a person deletes to reset every lock. Shown by the surfaces. */
    get dataFolder(): string {
        return this.#dataFolder;
    }

    /**
     * The saved locks, or an empty list.
     *
     * A missing file is the ordinary first-run state and is not a failure. An oversized one is
     * refused without parsing it, for the reason `LOCKS_MAX_BYTES` gives.
     */
    async load(): Promise<readonly StoredLock[]> {
        let text: string;
        try {
            const bytes = await readFile(this.#file);
            if (bytes.byteLength > LOCKS_MAX_BYTES) return [];
            text = bytes.toString("utf8");
        } catch {
            return [];
        }
        return parseLocks(text);
    }

    /**
     * Replaces the saved list.
     *
     * Written atomically because a half-written lock file read at the next launch is a list
     * that has silently lost locks - and losing a lock is losing the only record that an
     * element was ever locked at all.
     */
    async save(locks: readonly unknown[]): Promise<void> {
        const records = locks.filter(isStoredLock).slice(0, LOCKS_MAX_RECORDS);
        const text = JSON.stringify({ version: LOCKS_VERSION, locks: records }, null, 4);
        await mkdir(dirname(this.#file), { recursive: true });
        await atomicWriteTextFile(this.#file, text);
    }

    /** False when this machine has no usable keychain, so no TOTP lock may be offered. */
    vaultAvailable(): boolean {
        try {
            return this.#safeStorage.isEncryptionAvailable();
        } catch {
            return false;
        }
    }

    #secretFile(lockId: string): string {
        // The id is generated by the model and is already opaque, but it reaches here from a
        // renderer message, so it is encoded rather than trusted: an id containing a path
        // separator or `..` would otherwise choose the file it is written to.
        return join(this.#dataFolder, "lock-secrets", `${encodeURIComponent(lockId)}.bin`);
    }

    /** Stores a TOTP secret encrypted at rest. Refuses outright when it cannot encrypt. */
    async putSecret(lockId: string, secret: string): Promise<boolean> {
        if (!isBoundedString(lockId) || !isBoundedString(secret)) return false;
        if (!this.vaultAvailable()) return false;
        try {
            const ciphertext = this.#safeStorage.encryptString(secret);
            const file = this.#secretFile(lockId);
            await mkdir(dirname(file), { recursive: true });
            await atomicWriteTextFile(file, ciphertext.toString("base64"));
            return true;
        } catch {
            return false;
        }
    }

    /** The stored secret, or null when there is none or it cannot be decrypted. */
    async getSecret(lockId: string): Promise<string | null> {
        if (!isBoundedString(lockId)) return null;
        if (!this.vaultAvailable()) return null;
        try {
            const base64 = await readFile(this.#secretFile(lockId), "utf8");
            return this.#safeStorage.decryptString(Buffer.from(base64, "base64"));
        } catch {
            return null;
        }
    }

    /** Forgets a secret. Absent is success: the caller wanted it gone and it is gone. */
    async removeSecret(lockId: string): Promise<void> {
        if (!isBoundedString(lockId)) return;
        try {
            await rm(this.#secretFile(lockId), { force: true });
        } catch {
            /* Already gone, or unreadable - either way there is nothing left to remove. */
        }
    }
}
