/**
 * Where the Cloudflare API token lives, and everything it is not allowed to reach.
 *
 * ## Why this one is different from `gh` and `aws`
 *
 * The GitHub and AWS routes never hold a credential at all: their CLIs own it, and this
 * app asks those CLIs to act. Cloudflare has no such broker to lease from, so the token is
 * entered in the app - at the owner's explicit direction - and that makes this the one
 * credential this application is genuinely responsible for.
 *
 * Being responsible for it means the rules get stricter here, not looser:
 *
 * - It is written through the operating system's own credential store - DPAPI on Windows,
 *   the Keychain on macOS, libsecret on Linux - and **never** to a plain file. If the OS
 *   store is unavailable, this refuses and says why. Falling back to plaintext so that
 *   "it works everywhere" would put a token readable by every process running as that
 *   user into a predictable path, and look identical to a protected one from the outside.
 * - It never crosses IPC in the readable direction. The renderer sends it once on save
 *   and afterwards may ask only {@link CloudflareTokenPresence} - whether one is there.
 *   Not its value, not its length, not a prefix, not a fingerprint.
 * - It is never written to a project file, an export, a log, a capture, a diagnostic,
 *   local history, telemetry, or Git.
 * - Nothing here ever displays or characterises it, for the owner's own token as much as
 *   anyone else's.
 *
 * The one thing a person may read back is the **scopes it was created with**, which they
 * told us, and the account and zone names it can see - none of which is the secret.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SafeStorageLike } from "../worlddownloader/credentialStore.js";

/** Bumped only if the envelope's shape changes in a way an older reader would misread. */
const CLOUDFLARE_CREDENTIAL_VERSION = 1;

/**
 * The scopes this app actually needs, and no more.
 *
 * Named individually so the setup surface can say why each one is wanted. A global API key
 * would work for all of it and is deliberately not accepted: it carries every permission
 * on the account, including billing, for a job that needs two.
 */
export const REQUIRED_CLOUDFLARE_SCOPES = [
    {
        id: "zone-dns-edit",
        label: "Zone → DNS → Edit",
        why: "To create and update the DNS record that points your domain at the map.",
    },
    {
        id: "tunnel-edit",
        label: "Account → Cloudflare Tunnel → Edit",
        why: "To create the tunnel that publishes a map hosted on your own machine.",
    },
] as const;

/**
 * What the renderer is allowed to know about the stored token.
 *
 * Deliberately carries no derivative of the value. A length or a four-character prefix
 * feels harmless and is not: both narrow a search, and neither helps anybody do anything.
 */
export interface CloudflareTokenPresence {
    readonly stored: boolean;
    /** When it was saved, so a person can tell a stale one from a fresh one. */
    readonly savedAt: string | null;
    /** The account label the token resolved to when it was verified. Not a secret. */
    readonly accountName: string | null;
    /** True when the last verification succeeded. False after one that was refused. */
    readonly verified: boolean;
}

/** The encrypted half. Nothing outside this file ever sees it. */
interface StoredCloudflareSecret {
    readonly token: string;
}

/** The envelope on disk: ciphertext plus facts that are not secret. */
interface CloudflareEnvelope {
    readonly version: number;
    readonly savedAt: string;
    readonly accountName: string | null;
    readonly verified: boolean;
    /** Base64 of the OS-encrypted secret. Never readable without the OS store. */
    readonly ciphertext: string;
}

export type CloudflareSaveResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: "encryption-unavailable" | "write-failed" };

export const CLOUDFLARE_ENCRYPTION_UNAVAILABLE_MESSAGE =
    "This computer has no working credential store, so the Cloudflare token cannot be saved " +
    "safely. On Linux this usually means no secret service (GNOME Keyring or KWallet) is " +
    "running. The token can still be used for this session, but it will not be remembered.";

export interface CloudflareCredentialStoreOptions {
    /** Absolute path to the envelope file, under the app's own data directory. */
    readonly filePath: string;
    readonly safeStorage: SafeStorageLike;
}

/**
 * The token store.
 *
 * Note what this class does **not** have: any method returning the token to a caller
 * outside this process. {@link useToken} hands it to a callback that runs here, which is
 * what lets the API layer make a request without the value ever being returnable.
 */
export class CloudflareCredentialStore {
    readonly #filePath: string;
    readonly #safeStorage: SafeStorageLike;
    /** Held for this session only when the OS store refused to persist it. */
    #sessionOnlyToken: string | null = null;

    constructor(options: CloudflareCredentialStoreOptions) {
        this.#filePath = options.filePath;
        this.#safeStorage = options.safeStorage;
    }

    /** Whether this machine can protect a secret at all. */
    encryptionAvailable(): boolean {
        try {
            return this.#safeStorage.isEncryptionAvailable();
        } catch {
            return false;
        }
    }

    /**
     * Saves a token, or refuses.
     *
     * A refusal is not a failure to be worked around. The session keeps the token in
     * memory so the person can carry on, and the surface says it will not be remembered.
     */
    save(
        token: string,
        facts: { readonly accountName: string | null; readonly verified: boolean },
    ): CloudflareSaveResult {
        this.#sessionOnlyToken = token;

        if (!this.encryptionAvailable()) {
            return { ok: false, reason: "encryption-unavailable" };
        }

        const secret: StoredCloudflareSecret = { token };
        let ciphertext: Buffer;
        try {
            ciphertext = this.#safeStorage.encryptString(JSON.stringify(secret));
        } catch {
            return { ok: false, reason: "encryption-unavailable" };
        }

        const envelope: CloudflareEnvelope = {
            version: CLOUDFLARE_CREDENTIAL_VERSION,
            savedAt: new Date().toISOString(),
            accountName: facts.accountName,
            verified: facts.verified,
            ciphertext: ciphertext.toString("base64"),
        };

        try {
            mkdirSync(dirname(this.#filePath), { recursive: true });
            // Staged and renamed, so a crash halfway through cannot leave a truncated file
            // that decrypts to nothing - which would read as a corrupted token rather than
            // an interrupted write.
            const staging = `${this.#filePath}.${process.pid}.tmp`;
            writeFileSync(staging, JSON.stringify(envelope), { encoding: "utf8", mode: 0o600 });
            renameSync(staging, this.#filePath);
            return { ok: true };
        } catch {
            return { ok: false, reason: "write-failed" };
        }
    }

    /** Everything the renderer may know. Never the value. */
    presence(): CloudflareTokenPresence {
        const envelope = this.#readEnvelope();
        if (!envelope) {
            return {
                stored: this.#sessionOnlyToken !== null,
                savedAt: null,
                accountName: null,
                verified: false,
            };
        }
        return {
            stored: true,
            savedAt: envelope.savedAt,
            accountName: envelope.accountName,
            verified: envelope.verified,
        };
    }

    /**
     * Runs one operation with the token, inside this process.
     *
     * The only way to use it, and deliberately not `readToken(): string`. A getter would
     * be one refactor away from being awaited into an IPC reply, and this shape cannot be.
     * Returns null without calling when there is no token to use.
     */
    async useToken<T>(operation: (token: string) => Promise<T>): Promise<T | null> {
        const token = this.#resolveToken();
        if (token === null) {
            return null;
        }
        return operation(token);
    }

    /** Forgets the token entirely, on disk and in memory. */
    clear(): void {
        this.#sessionOnlyToken = null;
        try {
            rmSync(this.#filePath, { force: true });
        } catch {
            // Already gone is the desired state, so nothing to report.
        }
    }

    #resolveToken(): string | null {
        const envelope = this.#readEnvelope();
        if (envelope) {
            try {
                const decrypted = this.#safeStorage.decryptString(
                    Buffer.from(envelope.ciphertext, "base64"),
                );
                const parsed = JSON.parse(decrypted) as StoredCloudflareSecret;
                if (typeof parsed.token === "string" && parsed.token.length > 0) {
                    return parsed.token;
                }
            } catch {
                // A ciphertext this machine cannot decrypt - a copied profile, a changed
                // OS user - is not recoverable and is not an error worth crashing over.
                // Fall through to whatever this session holds.
            }
        }
        return this.#sessionOnlyToken;
    }

    #readEnvelope(): CloudflareEnvelope | null {
        try {
            const raw = readFileSync(this.#filePath, "utf8");
            const parsed = JSON.parse(raw) as CloudflareEnvelope;
            if (parsed.version !== CLOUDFLARE_CREDENTIAL_VERSION) {
                return null;
            }
            return typeof parsed.ciphertext === "string" ? parsed : null;
        } catch {
            return null;
        }
    }
}

export type { SafeStorageLike };
