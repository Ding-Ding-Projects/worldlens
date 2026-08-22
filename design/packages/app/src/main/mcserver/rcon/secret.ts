/**
 * Where an RCON password actually lives.
 *
 * `registry.ts` keeps only `hasRconSecret: boolean` on a server record - the fact that a
 * password exists, never the password. The password itself is a live credential: anyone
 * holding it can run any command on that server, including `stop`, `ban`, `op`, and
 * arbitrary world-affecting commands. It goes in the operating system's credential vault
 * through Electron's `safeStorage`, exactly the way `locks/store.ts` puts a TOTP secret
 * there and for the same reason.
 *
 * Three rules, none of them optional:
 *
 *   1. Generated, not chosen. A person typing "minecraft123" into a settings field is
 *      the RCON port sitting open to anyone on the LAN who can guess it.
 *   2. Refuses to store rather than falling back to plaintext. A machine with no usable
 *      keychain gets an honest "this build cannot secure an RCON password yet", never a
 *      password written to disk in the clear because encryption happened to be
 *      unavailable - that is the one failure that turns a real credential into a leak.
 *   3. Never logged, never returned to the renderer, never placed in a failure message.
 *      A `TransportFailure.detail` that quoted a wrong password back to whoever is
 *      reading logs would be exactly the kind of leak rule (2) exists to prevent.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteTextFile } from "../../storage/atomicReplace.js";

/** The part of Electron's `safeStorage` this module uses, so a test needs no Electron. */
export interface SafeStorageLike {
    isEncryptionAvailable(): boolean;
    encryptString(plainText: string): Buffer;
    decryptString(encrypted: Buffer): string;
}

/** Bytes of entropy in a generated password. 24 bytes of base64url is >128 bits. */
export const RCON_SECRET_ENTROPY_BYTES = 24;

/**
 * A fresh, strong, random RCON password.
 *
 * base64url so the result is safe to hand to `docker run -e RCON_PASSWORD=...` and to
 * write into `server.properties` without quoting concerns - no `+`, `/`, `=`, spaces or
 * control characters, which the ASCII-only RCON wire format in `protocol.ts` also wants.
 */
export function generateRconPassword(bytes = RCON_SECRET_ENTROPY_BYTES): string {
    return randomBytes(bytes).toString("base64url");
}

function isBoundedId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export interface RconSecretStoreOptions {
    /** Electron's `app.getPath("userData")`, or a temporary directory in a test. */
    readonly dataFolder: string;
    readonly safeStorage: SafeStorageLike;
}

/**
 * The vault half of RCON secret handling: generate, store, retrieve, remove. Keyed by
 * server id, one file per server, exactly parallel to `locks/store.ts`'s per-lock files.
 */
export class RconSecretStore {
    readonly #dataFolder: string;
    readonly #safeStorage: SafeStorageLike;

    constructor(options: RconSecretStoreOptions) {
        this.#dataFolder = options.dataFolder;
        this.#safeStorage = options.safeStorage;
    }

    /** False when this machine has no usable keychain, so no RCON secret may be stored. */
    vaultAvailable(): boolean {
        try {
            return this.#safeStorage.isEncryptionAvailable();
        } catch {
            return false;
        }
    }

    #secretFile(serverId: string): string {
        // `serverId` reaches here from IPC, so it is encoded rather than trusted: an id
        // containing a path separator or `..` would otherwise choose the file it is
        // written to. `registry.ts`'s own `ID` pattern already excludes this in
        // practice, but this file must not depend on that holding true elsewhere.
        return join(this.#dataFolder, "rcon-secrets", `${encodeURIComponent(serverId)}.bin`);
    }

    /**
     * Generates a fresh password, stores it, and returns it - the ONE moment this module
     * hands a caller the plaintext, because the caller (the IPC handler) needs it to send
     * to the server on creation. It is never logged, never written anywhere but the
     * encrypted file, and the caller must not persist it anywhere else either.
     */
    async generateAndStore(serverId: string): Promise<{ ok: true; password: string } | { ok: false }> {
        if (!isBoundedId(serverId)) return { ok: false };
        const password = generateRconPassword();
        const stored = await this.put(serverId, password);
        return stored ? { ok: true, password } : { ok: false };
    }

    /** Stores a given password. Refuses outright when the vault cannot encrypt. */
    async put(serverId: string, password: string): Promise<boolean> {
        if (!isBoundedId(serverId) || typeof password !== "string" || password.length === 0) return false;
        if (!this.vaultAvailable()) return false;
        try {
            const ciphertext = this.#safeStorage.encryptString(password);
            const file = this.#secretFile(serverId);
            await mkdir(dirname(file), { recursive: true });
            await atomicWriteTextFile(file, ciphertext.toString("base64"));
            return true;
        } catch {
            return false;
        }
    }

    /** The stored password, or null when there is none or it cannot be decrypted. */
    async get(serverId: string): Promise<string | null> {
        if (!isBoundedId(serverId)) return null;
        if (!this.vaultAvailable()) return null;
        try {
            const base64 = await readFile(this.#secretFile(serverId), "utf8");
            return this.#safeStorage.decryptString(Buffer.from(base64, "base64"));
        } catch {
            return null;
        }
    }

    /** True when a password has been stored for this server, without revealing it. */
    async has(serverId: string): Promise<boolean> {
        const value = await this.get(serverId);
        return value !== null;
    }

    /** Forgets the password. Absent is success: the caller wanted it gone and it is gone. */
    async remove(serverId: string): Promise<void> {
        if (!isBoundedId(serverId)) return;
        try {
            await rm(this.#secretFile(serverId), { force: true });
        } catch {
            /* Already gone, or unreadable - either way there is nothing left to remove. */
        }
    }
}
