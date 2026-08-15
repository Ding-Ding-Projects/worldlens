/**
 * A real, minimal implementation of the shared School-mode record, for `window.worldlens.schoolMode`.
 *
 * `KidGrownUpGate.vue` (`design/packages/ui/src/kid/KidGrownUpGate.vue`) reads
 * `credentialConfigured` to decide which of its two branches to draw - "no grown-up code is set,
 * press through" versus "type the shared code" - and its `isHostBridge()` check
 * (`design/packages/ui/src/components/setup/schoolMode.ts`) requires all five methods
 * (`read`/`enable`/`rename`/`disable`/`reset`) to exist as real functions before it will trust this
 * as the *shared* record rather than fall back to the browser/test local-only adapter. So this harness
 * cannot get away with three of the five as stubs: a partially-wired bridge is exactly the "convenient
 * lie" the brief forbids, and `isHostBridge` would in any case refuse it and silently downgrade to a
 * different code path than the one this harness exists to exercise.
 *
 * What is real here: the credential is never stored in the clear. A submitted PIN/password is run
 * through the same `scrypt` KDF the shipped app's own `main/schoolMode/record.ts` uses, with a random
 * salt, and `disable()` compares the derived hash with `timingSafeEqual` rather than a plain `===`.
 * Copying that algorithm (not importing it - `packages/app/src/main/schoolMode/` is app-internal
 * source with no package boundary this workspace exposes across, and this package owns nothing
 * outside `design/packages/kid-check/`) is what keeps "answers honestly" true rather than aspirational.
 *
 * What is deliberately simpler than the shipped app's `SchoolModeStore`: no file on disk. The real
 * store persists to a location shared across every Ding-Ding desktop app on the machine, because the
 * whole point of that feature is one code across several installed products. A screenshot harness has
 * no sibling apps to share a record with and no reason to survive a restart - every capture run starts
 * from a state the drive script sets on purpose, seeded through `seedConfiguredCredential`, and a file
 * that outlived the process would just be one more thing a re-run has to remember to clear. In-memory
 * state that resets with the process is the honest reflection of that: nothing here is pretending to
 * be more durable than it is.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const SCHOOL_MODE_RECORD_VERSION = 1 as const;
export const SCHOOL_MODE_NAME_MAX_LENGTH = 48;
export const SCHOOL_MODE_CREDENTIAL_MIN_LENGTH = 4;
export const SCHOOL_MODE_CREDENTIAL_MAX_LENGTH = 256;

const SALT_BYTES = 16;
const VERIFIER_BYTES = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export type SchoolModeFailureCode =
    | "invalid-name"
    | "credential-required"
    | "credential-invalid"
    | "credential-too-long";

/** Mirrors the renderer's own `SchoolModeSnapshot` (`components/setup/schoolMode.ts`) field for field. */
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

export interface SchoolModeEnableRequest {
    readonly name?: string | null;
    readonly credential?: string;
}

interface CredentialVerifier {
    readonly salt: Buffer;
    readonly hash: Buffer;
}

interface StoredRecord {
    enabled: boolean;
    name: string | null;
    credential: CredentialVerifier | null;
}

function snapshotOf(record: StoredRecord): SchoolModeSnapshot {
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

/**
 * True for a C0 control character, DEL, or a C1 control character, by code point rather than by a
 * regular-expression escape range - a plain numeric comparison has no encoding to get wrong on the
 * way from source text to disk, which a backslash-u-escaped character class embedded in a regex
 * literal does not get for free.
 */
function hasControlCharacter(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
    }
    return false;
}

function normaliseName(
    value: unknown,
): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
    if (value === null || value === undefined) return { ok: true, value: null };
    if (typeof value !== "string") return { ok: false };
    const trimmed = value.trim();
    if (trimmed.length > SCHOOL_MODE_NAME_MAX_LENGTH || hasControlCharacter(trimmed)) {
        return { ok: false };
    }
    return { ok: true, value: trimmed === "" ? null : trimmed };
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

/**
 * Backs `window.worldlens.schoolMode` for the harness. One instance per running app, held on
 * `globalThis` (see `main/index.ts`) so the Node-side drive script can reach it through
 * `electronApp.evaluate()` - the same instrumentation-on-`globalThis` pattern the shipped app's own
 * `packages/app/test/networkGuard.ts` uses for its capture-time network guard.
 */
export class KidCheckSchoolModeStore {
    private record: StoredRecord = { enabled: false, name: null, credential: null };

    read(): SchoolModeResult {
        return { ok: true, state: snapshotOf(this.record) };
    }

    async enable(request: unknown): Promise<SchoolModeResult> {
        const input = (typeof request === "object" && request !== null ? request : {}) as SchoolModeEnableRequest;
        const name = normaliseName(input.name);
        if (!name.ok) {
            return failure("invalid-name", `Choose a name of at most ${SCHOOL_MODE_NAME_MAX_LENGTH} characters.`);
        }
        const credential = typeof input.credential === "string" ? input.credential : "";
        if (credential.length > SCHOOL_MODE_CREDENTIAL_MAX_LENGTH) {
            return failure(
                "credential-too-long",
                `Use a PIN or password of at most ${SCHOOL_MODE_CREDENTIAL_MAX_LENGTH} characters.`,
            );
        }
        if (this.record.credential === null && credential.length < SCHOOL_MODE_CREDENTIAL_MIN_LENGTH) {
            return failure(
                "credential-required",
                `Choose a PIN or password with at least ${SCHOOL_MODE_CREDENTIAL_MIN_LENGTH} characters.`,
            );
        }

        const salt = this.record.credential?.salt ?? randomBytes(SALT_BYTES);
        const hash =
            this.record.credential === null ? await deriveVerifier(credential, salt) : this.record.credential.hash;
        this.record = { enabled: true, name: name.value, credential: { salt, hash } };
        return { ok: true, state: snapshotOf(this.record) };
    }

    rename(nameInput: unknown): SchoolModeResult {
        const name = normaliseName(nameInput);
        if (!name.ok) {
            return failure("invalid-name", `Choose a name of at most ${SCHOOL_MODE_NAME_MAX_LENGTH} characters.`);
        }
        this.record = { ...this.record, name: name.value };
        return { ok: true, state: snapshotOf(this.record) };
    }

    async disable(credential: unknown): Promise<SchoolModeResult> {
        if (typeof credential !== "string" || credential.length === 0) {
            return failure("credential-required", "Enter the PIN or password to turn this mode off.");
        }
        if (this.record.credential === null) {
            // No verifier at all: nothing to check against, so there is nothing to refuse - the
            // mode simply was not on. This mirrors what a fresh, never-configured record does.
            this.record = { ...this.record, enabled: false };
            return { ok: true, state: snapshotOf(this.record) };
        }
        const supplied = await deriveVerifier(credential, this.record.credential.salt);
        if (!timingSafeEqual(this.record.credential.hash, supplied)) {
            return failure(
                "credential-invalid",
                "That PIN or password did not unlock this mode.",
                snapshotOf(this.record),
            );
        }
        this.record = { ...this.record, enabled: false };
        return { ok: true, state: snapshotOf(this.record) };
    }

    reset(): SchoolModeResult {
        this.record = { enabled: false, name: null, credential: null };
        return { ok: true, state: snapshotOf(this.record) };
    }

    /**
     * Test-only shortcut for the drive script: leaves the store exactly where a grown-up who set a
     * shared code and then turned the mode back off would leave it - `credentialConfigured: true`,
     * `enabled: false` - without needing a UI path to "enable school mode" that Kid Mode itself has
     * no reason to expose (setting one up lives in Adult Mode's own Settings, which this harness does
     * not drive). Going through the real `enable()` then `disable()` sequence rather than writing the
     * record's fields directly means this is exercising the actual verifier, not inventing a shortcut
     * state the real store could never reach.
     */
    async seedConfiguredCredential(credential: string): Promise<void> {
        await this.enable({ name: null, credential });
        await this.disable(credential);
    }
}
