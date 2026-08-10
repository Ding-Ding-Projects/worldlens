/**
 * The one shared School-mode record used by participating desktop apps.
 *
 * The record deliberately lives below the operating system's application-data root instead of
 * this application's `userData` directory.  A per-app location would make "shared" a claim the
 * implementation could not keep.  Its only sensitive field is a salted one-way verifier: raw
 * PIN/password input exists only for the duration of an enable or disable call and is never
 * returned, logged, exported, or written to any renderer-owned store.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** A stable sibling of app-specific data directories below Electron's `app.getPath("appData")`. */
export const SHARED_SCHOOL_MODE_DIRECTORY = "Ding-Ding Shared";
export const SCHOOL_MODE_RECORD_FILE = "school-mode.v1.json";
export const SCHOOL_MODE_RECORD_VERSION = 1;
export const SCHOOL_MODE_NAME_MAX_LENGTH = 48;
export const SCHOOL_MODE_CREDENTIAL_MIN_LENGTH = 4;
export const SCHOOL_MODE_CREDENTIAL_MAX_LENGTH = 256;
/** The schema is deliberately tiny; never allocate an unbounded file just to reject it. */
export const SCHOOL_MODE_RECORD_MAX_BYTES = 4 * 1024;

const SALT_BYTES = 16;
const VERIFIER_BYTES = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export type SchoolModeFailureCode =
    | "invalid-name"
    | "credential-required"
    | "credential-invalid"
    | "credential-too-long"
    | "record-invalid"
    | "storage-unavailable";

/** The complete safe state that may cross the privileged boundary. */
export interface SchoolModeSnapshot {
    readonly version: typeof SCHOOL_MODE_RECORD_VERSION;
    readonly enabled: boolean;
    readonly name: string | null;
    readonly credentialConfigured: boolean;
}

export type SchoolModeResult =
    | { readonly ok: true; readonly state: SchoolModeSnapshot }
    | {
          readonly ok: false;
          readonly code: SchoolModeFailureCode;
          readonly message: string;
          readonly state: SchoolModeSnapshot | null;
      };

interface CredentialVerifier {
    readonly scheme: "scrypt-v1";
    readonly salt: string;
    readonly hash: string;
}

interface PersistedSchoolModeRecord {
    readonly version: typeof SCHOOL_MODE_RECORD_VERSION;
    readonly enabled: boolean;
    readonly name: string | null;
    readonly credential: CredentialVerifier | null;
}

export interface SchoolModeEnableRequest {
    readonly name: string | null;
    readonly credential: string;
}

function defaultRecord(): PersistedSchoolModeRecord {
    return {
        version: SCHOOL_MODE_RECORD_VERSION,
        enabled: false,
        name: null,
        credential: null,
    };
}

function snapshotOf(record: PersistedSchoolModeRecord): SchoolModeSnapshot {
    return {
        version: SCHOOL_MODE_RECORD_VERSION,
        enabled: record.enabled,
        name: record.name,
        credentialConfigured: record.credential !== null,
    };
}

function failure(
    code: SchoolModeFailureCode,
    message: string,
    state: SchoolModeSnapshot | null = null,
): SchoolModeResult {
    return { ok: false, code, message, state };
}

function normaliseName(value: unknown): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== "string") return { ok: false };
    const trimmed = value.trim();
    if (trimmed.length > SCHOOL_MODE_NAME_MAX_LENGTH || /[\u0000-\u001F\u007F-\u009F]/u.test(trimmed)) {
        return { ok: false };
    }
    return { ok: true, value: trimmed === "" ? null : trimmed };
}

function decodeExactBase64(value: unknown, bytes: number): Buffer | null {
    if (typeof value !== "string") return null;
    const decoded = Buffer.from(value, "base64");
    return decoded.byteLength === bytes && decoded.toString("base64") === value ? decoded : null;
}

function parseRecord(raw: string): PersistedSchoolModeRecord | null {
    try {
        const candidate: unknown = JSON.parse(raw);
        if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return null;
        const record = candidate as Record<string, unknown>;
        if (record.version !== SCHOOL_MODE_RECORD_VERSION || typeof record.enabled !== "boolean") return null;
        const name = normaliseName(record.name);
        if (!name.ok) return null;

        let credential: CredentialVerifier | null = null;
        if (record.credential !== null) {
            if (
                typeof record.credential !== "object" ||
                record.credential === null ||
                Array.isArray(record.credential)
            ) {
                return null;
            }
            const verifier = record.credential as Record<string, unknown>;
            if (
                verifier.scheme !== "scrypt-v1" ||
                decodeExactBase64(verifier.salt, SALT_BYTES) === null ||
                decodeExactBase64(verifier.hash, VERIFIER_BYTES) === null
            ) {
                return null;
            }
            credential = {
                scheme: "scrypt-v1",
                salt: verifier.salt as string,
                hash: verifier.hash as string,
            };
        }

        // An enabled record with no verifier would make the promised unlock route impossible.
        if (record.enabled && credential === null) return null;
        return {
            version: SCHOOL_MODE_RECORD_VERSION,
            enabled: record.enabled,
            name: name.value,
            credential,
        };
    } catch {
        return null;
    }
}

function isErrno(error: unknown, code: string): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { readonly code?: unknown }).code === code
    );
}

function deriveVerifier(credential: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(
            credential,
            salt,
            VERIFIER_BYTES,
            { N: 16_384, r: 8, p: 1, maxmem: SCRYPT_MAX_MEMORY },
            (error, derived) => {
                if (error !== null) reject(error);
                else resolve(Buffer.from(derived));
            },
        );
    });
}

/** Returns the fixed path without reading or creating it, which makes the location testable. */
export function schoolModeRecordPath(applicationDataDirectory: string): string {
    return join(applicationDataDirectory, SHARED_SCHOOL_MODE_DIRECTORY, SCHOOL_MODE_RECORD_FILE);
}

/**
 * Privileged owner for the versioned record.  It intentionally exposes only operations whose
 * result contains a safe snapshot; neither a raw credential nor its verifier can cross this API.
 */
export class SchoolModeStore {
    readonly recordPath: string;

    constructor(applicationDataDirectory: string) {
        this.recordPath = schoolModeRecordPath(applicationDataDirectory);
    }

    async read(): Promise<SchoolModeResult> {
        const loaded = await this.readRecord();
        return loaded.ok ? { ok: true, state: snapshotOf(loaded.record) } : loaded.result;
    }

    async enable(request: unknown): Promise<SchoolModeResult> {
        if (typeof request !== "object" || request === null || Array.isArray(request)) {
            return failure("credential-required", "Choose a PIN or password before turning this mode on.");
        }
        const input = request as Record<string, unknown>;
        const name = normaliseName(input.name);
        if (!name.ok) {
            return failure(
                "invalid-name",
                `Choose a name of at most ${SCHOOL_MODE_NAME_MAX_LENGTH} characters.`,
            );
        }
        const credential = typeof input.credential === "string" ? input.credential : "";
        if (credential.length > SCHOOL_MODE_CREDENTIAL_MAX_LENGTH) {
            return failure(
                "credential-too-long",
                `Use a PIN or password of at most ${SCHOOL_MODE_CREDENTIAL_MAX_LENGTH} characters.`,
            );
        }

        const loaded = await this.readRecord();
        if (!loaded.ok) return loaded.result;
        const record = loaded.record;

        if (record.credential === null && credential.length < SCHOOL_MODE_CREDENTIAL_MIN_LENGTH) {
            return failure(
                "credential-required",
                `Choose a PIN or password with at least ${SCHOOL_MODE_CREDENTIAL_MIN_LENGTH} characters.`,
            );
        }

        try {
            const verifier =
                record.credential ??
                ({
                    scheme: "scrypt-v1" as const,
                    salt: randomBytes(SALT_BYTES).toString("base64"),
                    hash: "",
                } satisfies CredentialVerifier);
            const salt = decodeExactBase64(verifier.salt, SALT_BYTES);
            if (salt === null) return failure("record-invalid", "The shared mode record could not be read safely.");
            const derived = record.credential === null ? await deriveVerifier(credential, salt) : null;
            const next: PersistedSchoolModeRecord = {
                version: SCHOOL_MODE_RECORD_VERSION,
                enabled: true,
                name: name.value,
                credential:
                    derived === null
                        ? verifier
                        : { scheme: "scrypt-v1", salt: verifier.salt, hash: derived.toString("base64") },
            };
            await this.writeRecord(next);
            return { ok: true, state: snapshotOf(next) };
        } catch {
            return failure("storage-unavailable", "The shared mode record could not be saved.");
        }
    }

    async rename(nameInput: unknown): Promise<SchoolModeResult> {
        const name = normaliseName(nameInput);
        if (!name.ok) {
            return failure(
                "invalid-name",
                `Choose a name of at most ${SCHOOL_MODE_NAME_MAX_LENGTH} characters.`,
            );
        }
        const loaded = await this.readRecord();
        if (!loaded.ok) return loaded.result;
        const next: PersistedSchoolModeRecord = { ...loaded.record, name: name.value };
        try {
            await this.writeRecord(next);
            return { ok: true, state: snapshotOf(next) };
        } catch {
            return failure("storage-unavailable", "The shared mode record could not be saved.");
        }
    }

    async disable(credential: unknown): Promise<SchoolModeResult> {
        if (typeof credential !== "string" || credential.length === 0) {
            return failure("credential-required", "Enter the PIN or password to turn this mode off.");
        }
        if (credential.length > SCHOOL_MODE_CREDENTIAL_MAX_LENGTH) {
            return failure(
                "credential-too-long",
                `Use a PIN or password of at most ${SCHOOL_MODE_CREDENTIAL_MAX_LENGTH} characters.`,
            );
        }
        const loaded = await this.readRecord();
        if (!loaded.ok) return loaded.result;
        const record = loaded.record;
        if (record.credential === null) {
            return failure("record-invalid", "The shared mode record has no unlock verifier.");
        }

        try {
            const salt = decodeExactBase64(record.credential.salt, SALT_BYTES);
            const stored = decodeExactBase64(record.credential.hash, VERIFIER_BYTES);
            if (salt === null || stored === null) {
                return failure("record-invalid", "The shared mode record could not be read safely.");
            }
            const supplied = await deriveVerifier(credential, salt);
            // Equal-sized values are required by `timingSafeEqual`; parse validation guarantees it.
            if (!timingSafeEqual(stored, supplied)) {
                return failure("credential-invalid", "That PIN or password did not unlock this mode.", snapshotOf(record));
            }
            const next: PersistedSchoolModeRecord = { ...record, enabled: false };
            await this.writeRecord(next);
            return { ok: true, state: snapshotOf(next) };
        } catch {
            return failure("storage-unavailable", "The shared mode record could not be updated.");
        }
    }

    /** Intentionally removes the shared record; this UX lock is not a security boundary. */
    async reset(): Promise<SchoolModeResult> {
        try {
            await rm(this.recordPath, { force: true });
            return { ok: true, state: snapshotOf(defaultRecord()) };
        } catch {
            return failure("storage-unavailable", "The shared mode record could not be reset.");
        }
    }

    private async readRecord(): Promise<
        | { readonly ok: true; readonly record: PersistedSchoolModeRecord }
        | { readonly ok: false; readonly result: SchoolModeResult }
    > {
        let raw: string;
        try {
            const handle = await open(this.recordPath, "r");
            try {
                const metadata = await handle.stat();
                if (metadata.size > SCHOOL_MODE_RECORD_MAX_BYTES) {
                    return {
                        ok: false,
                        result: failure(
                            "record-invalid",
                            "The shared mode record exceeds its safe size limit and was not used.",
                        ),
                    };
                }
                const bytes = Buffer.alloc(metadata.size);
                const { bytesRead } = await handle.read(bytes, 0, bytes.byteLength, 0);
                raw = bytes.subarray(0, bytesRead).toString("utf8");
            } finally {
                await handle.close();
            }
        } catch (error) {
            if (isErrno(error, "ENOENT")) return { ok: true, record: defaultRecord() };
            return {
                ok: false,
                result: failure("storage-unavailable", "The shared mode record could not be read."),
            };
        }
        const record = parseRecord(raw);
        if (record === null) {
            return {
                ok: false,
                result: failure("record-invalid", "The shared mode record is invalid and was not used."),
            };
        }
        return { ok: true, record };
    }

    private async writeRecord(record: PersistedSchoolModeRecord): Promise<void> {
        const directory = dirname(this.recordPath);
        await mkdir(directory, { recursive: true });
        const temporary = `${this.recordPath}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
        try {
            await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
            await rename(temporary, this.recordPath);
        } finally {
            // A failed write must not leave an ever-growing collection of credential verifiers.
            await rm(temporary, { force: true }).catch(() => undefined);
        }
    }
}
