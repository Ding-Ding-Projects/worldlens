/**
 * The web console's sign-in password.
 *
 * Hashed with scrypt (node:crypto, no dependency to audit), a per-install random salt, and
 * cost parameters recorded alongside the hash so a future install can raise them without
 * breaking every existing password. Comparison is `timingSafeEqual`, so a wrong guess takes
 * the same time whether it differs in the first byte or the last.
 *
 * The password itself is never stored, logged, returned, or characterised - not its value,
 * not its length, not its composition. Only the hash+salt+params record is stored, and it
 * is stored in the OS credential vault via an injected `SafeStorageLike`, following the
 * exact pattern `locks/store.ts` uses for a TOTP secret: this is a live credential, so it
 * gets the vault, never the plain application-data file.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scryptAsync(
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
    options: ScryptOptions,
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
            if (error) reject(error);
            else resolve(derivedKey as Buffer);
        });
    });
}

/** The part of Electron's `safeStorage` this module uses, so a test can supply its own. */
export interface SafeStorageLike {
    isEncryptionAvailable(): boolean;
    encryptString(plainText: string): Buffer;
    decryptString(encrypted: Buffer): string;
}

export interface ScryptParams {
    readonly N: number;
    readonly r: number;
    readonly p: number;
    readonly keylen: number;
}

/**
 * scrypt's default cost, doubled once for a login form that is called rarely rather than
 * per-request. `N` must be a power of two; `maxmem` below is sized to allow it.
 */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 32768, r: 8, p: 1, keylen: 32 };

interface StoredPasswordRecord {
    readonly version: 1;
    readonly saltBase64: string;
    readonly hashBase64: string;
    readonly params: ScryptParams;
}

function isStoredPasswordRecord(value: unknown): value is StoredPasswordRecord {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    if (record.version !== 1) return false;
    if (typeof record.saltBase64 !== "string" || record.saltBase64.length === 0) return false;
    if (typeof record.hashBase64 !== "string" || record.hashBase64.length === 0) return false;
    const params = record.params;
    if (typeof params !== "object" || params === null) return false;
    const p = params as Record<string, unknown>;
    return (
        typeof p.N === "number" &&
        typeof p.r === "number" &&
        typeof p.p === "number" &&
        typeof p.keylen === "number"
    );
}

async function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
    // maxmem defaults to 32 MiB in Node; N=32768,r=8 needs roughly 128*N*r bytes (~32 MiB),
    // so pass an explicit ceiling generous enough for the recorded params rather than
    // letting a raised cost start refusing itself.
    const maxmem = Math.max(64 * 1024 * 1024, 256 * params.N * params.r);
    return scryptAsync(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem });
}

/**
 * Stores this machine's web-console password, replacing any previous one.
 *
 * Refuses outright, rather than degrading, when the vault has no usable keychain - writing
 * a password hash out in the clear because encryption was unavailable is not an acceptable
 * fallback for a credential that gates a live server console.
 */
export async function setWebConsolePassword(
    safeStorage: SafeStorageLike,
    password: string,
    params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<boolean> {
    if (typeof password !== "string" || password.length === 0 || password.length > 1024) return false;
    if (!safeStorage.isEncryptionAvailable()) return false;
    try {
        const salt = randomBytes(16);
        const key = await deriveKey(password, salt, params);
        const record: StoredPasswordRecord = {
            version: 1,
            saltBase64: salt.toString("base64"),
            hashBase64: key.toString("base64"),
            params,
        };
        safeStorage.encryptString(JSON.stringify(record));
        return true;
    } catch {
        return false;
    }
}

/** The encrypted bytes to persist after a successful `setWebConsolePassword`. */
export async function buildWebConsolePasswordRecord(
    safeStorage: SafeStorageLike,
    password: string,
    params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<Buffer | null> {
    if (typeof password !== "string" || password.length === 0 || password.length > 1024) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
        const salt = randomBytes(16);
        const key = await deriveKey(password, salt, params);
        const record: StoredPasswordRecord = {
            version: 1,
            saltBase64: salt.toString("base64"),
            hashBase64: key.toString("base64"),
            params,
        };
        return safeStorage.encryptString(JSON.stringify(record));
    } catch {
        return null;
    }
}

/**
 * True when `password` matches the encrypted record. False for anything malformed,
 * missing, undecryptable, or genuinely wrong - the caller cannot and must not distinguish
 * those cases.
 */
export async function verifyWebConsolePassword(
    safeStorage: SafeStorageLike,
    encryptedRecord: Buffer | null,
    password: string,
): Promise<boolean> {
    if (encryptedRecord === null) return false;
    if (typeof password !== "string" || password.length === 0 || password.length > 1024) return false;
    if (!safeStorage.isEncryptionAvailable()) return false;
    try {
        const json = safeStorage.decryptString(encryptedRecord);
        const parsed: unknown = JSON.parse(json);
        if (!isStoredPasswordRecord(parsed)) return false;
        const salt = Buffer.from(parsed.saltBase64, "base64");
        const expected = Buffer.from(parsed.hashBase64, "base64");
        const actual = await deriveKey(password, salt, parsed.params);
        if (actual.length !== expected.length) return false;
        return timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}
