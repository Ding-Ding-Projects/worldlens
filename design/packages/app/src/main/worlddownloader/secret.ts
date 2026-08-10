/**
 * Where the Minecraft access token lives between launches, and the one place it comes back out.
 *
 * ## Why there is no encryption code in this file
 *
 * There is exactly one correct answer to "where does a desktop application keep a secret", and
 * `../github/storage.ts` already implements it: Electron's `safeStorage`, which is DPAPI on
 * Windows, the Keychain on macOS and libsecret on Linux, with the ciphertext staged and renamed
 * onto disk so a crash halfway through cannot leave a truncated blob that decrypts to nothing.
 * More importantly it already implements the *refusal*: when the platform has no working
 * credential store it declines to write anything rather than quietly falling back to a plaintext
 * file, because a plaintext token under the user profile is readable by every process running as
 * that user and is indistinguishable, to the person, from one that is actually protected.
 *
 * A second implementation of that would be a second place for the refusal to be got wrong, and
 * the two would drift the first time somebody fixed a bug in one of them. So this module is a
 * thin translation layer: it decides the filename, the wording of the messages a person reads,
 * and the extremely narrow surface a caller is allowed to reach the secret through.
 *
 * ## The surface is narrow on purpose
 *
 * {@link DownloaderSecretStore.take} is the only method that yields the token, and its name says
 * so. Everything a status display, a settings export or a diagnostic report could possibly want
 * is on {@link DownloaderSecretStore.status}, which carries whether a token is held and when it
 * was stored and nothing else. That split is what makes "the token never reaches the interface"
 * a property of the type rather than a rule somebody has to remember: a caller that only has a
 * status object cannot leak a token, because it does not have one.
 *
 * ## Why the record on disk describes a GitHub credential
 *
 * `TokenStore`'s envelope carries a `kind` and a `login`, because it was written for a signed-in
 * GitHub account. Neither field means anything here, and neither is ever read back by this
 * module: the values below are constants chosen so that the file is self-describing if somebody
 * opens it, and `take()` reaches straight past them for the ciphertext. Reusing a store whose
 * metadata has two fields too many is a much smaller cost than owning a second cryptographic
 * write path.
 */

import { join } from "node:path";
import { TokenStore } from "./credentialStore.js";
import type { SafeStorageLike } from "./credentialStore.js";

/** Sits directly under the app's data directory, beside `github-credential.json`. */
export const DOWNLOADER_CREDENTIAL_FILE = "world-downloader-credential.json";

export interface DownloaderSecretStoreOptions {
    readonly dataDir: string;
    readonly safeStorage: SafeStorageLike;
}

/**
 * Everything about the stored token that is safe to render, log, export or send to a renderer.
 *
 * There is deliberately no length, no prefix, no masked preview and no hash. All four are
 * routinely offered as "harmless" and none of them are: a length narrows an attack, a prefix
 * identifies the issuer, and a masked preview is a slice of the secret with the honest parts
 * removed. "A token is held, since this time" is the whole of what an interface needs to draw a
 * signed-in state.
 */
export interface DownloaderSecretStatus {
    readonly held: boolean;
    /** ISO-8601 with offset, or null when nothing is stored. */
    readonly storedAt: string | null;
    /** False on a machine with no working credential store, where saving one is refused. */
    readonly encryptionAvailable: boolean;
}

export type DownloaderSecretSaveResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly message: string };

/**
 * The two constants that fill `TokenStore`'s GitHub-shaped metadata fields.
 *
 * `login` has to be a non-empty string or the envelope is rejected as malformed on the way back
 * in, so it is a description of what the file holds rather than a person's name.
 */
const CREDENTIAL_KIND = "personal-access-token" as const;
const CREDENTIAL_LOGIN = "minecraft-access-token";

export const EMPTY_TOKEN_MESSAGE =
    "No token was entered. Paste the Minecraft access token itself, which is a long string of" +
    " letters and digits, not your Microsoft email address and not your Minecraft username. If" +
    " you do not have one, choose the Microsoft sign-in account mode instead and the downloader" +
    " will walk you through a device code.";

export const NO_CREDENTIAL_STORE_MESSAGE =
    "This computer has no working credential store, so there is nowhere safe to keep a Minecraft" +
    " access token and nothing was written. The token was not saved anywhere else: this" +
    " application will not put one in a plain file, because anything else running as you could" +
    " then read it. On Linux this usually means no secret service is running, and installing" +
    " gnome-keyring or kwallet fixes it. In the meantime you can still start a download by" +
    " choosing the Microsoft sign-in account mode, which needs no stored token at all.";

export const WRITE_FAILED_MESSAGE =
    "The token could not be written to disk, so nothing was saved and you will be asked for it" +
    " again. This usually means the application's data folder is not writable, which is worth" +
    " checking before trying again.";

export class DownloaderSecretStore {
    readonly #store: TokenStore;

    constructor(options: DownloaderSecretStoreOptions) {
        this.#store = new TokenStore({
            file: join(options.dataDir, DOWNLOADER_CREDENTIAL_FILE),
            safeStorage: options.safeStorage,
        });
    }

    /**
     * Whether a token is held, and when it was stored.
     *
     * Reads only the clear half of the envelope, so on macOS this does not provoke a Keychain
     * prompt. That matters because this is the call a status poll makes: a status surface that
     * asks the operating system to authorise a decryption every few seconds would train the
     * person to click through those prompts without reading them.
     */
    status(): DownloaderSecretStatus {
        const record = this.#store.metadata();
        return {
            held: record !== null,
            storedAt: record === null ? null : record.storedAt,
            encryptionAvailable: this.#store.encryptionAvailable(),
        };
    }

    /**
     * Stores the token, or refuses and says what to do instead.
     *
     * The value is trimmed because the overwhelmingly common way a token arrives is a paste, and
     * a paste carries whatever whitespace was around it in the window it came from. A token with
     * a trailing newline is rejected by the server with an authentication error that says nothing
     * about whitespace, which is a genuinely miserable thing to debug.
     *
     * There is no `force` parameter and there will not be one. A caller that can ask for the
     * token to be written in the clear is a caller that eventually does, on the day somebody is
     * in a hurry and a Linux machine has no secret service running.
     */
    save(token: string): DownloaderSecretSaveResult {
        const trimmed = token.trim();
        if (trimmed === "") return { ok: false, message: EMPTY_TOKEN_MESSAGE };

        const result = this.#store.save(
            { token: trimmed, refreshToken: null },
            {
                kind: CREDENTIAL_KIND,
                login: CREDENTIAL_LOGIN,
                userId: null,
                scopes: [],
                scopesReported: false,
                clientId: null,
                expiresAt: null,
                refreshTokenExpiresAt: null,
            },
        );
        if (result.ok) return { ok: true };

        // The underlying store's own copy talks about GitHub, because that is what it was written
        // for. Passing it through would put the wrong product's name in front of somebody who has
        // never signed in to GitHub in this application, so the code is translated rather than the
        // sentence forwarded.
        return {
            ok: false,
            message:
                result.code === "encryption-unavailable"
                    ? NO_CREDENTIAL_STORE_MESSAGE
                    : WRITE_FAILED_MESSAGE,
        };
    }

    /**
     * The token itself, or null when there is none to be had.
     *
     * Null covers every reason equally: nothing stored, the credential store has gone away, the
     * file was copied from another machine and no longer decrypts. The caller's response to all
     * of those is identical, which is to start without a token and let the tool say what it makes
     * of that, so distinguishing them here would only invite a caller to branch on a difference
     * that does not change what it does.
     *
     * Callers hand the result straight to the spawn and drop it. It is never stored in a field,
     * never put in an event, and never returned across the bridge.
     */
    take(): string | null {
        const result = this.#store.read();
        return result.ok ? result.secret.token : null;
    }

    /** Forgets the stored token. True when there was one to forget. */
    clear(): boolean {
        return this.#store.clear();
    }
}
