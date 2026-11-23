/**
 * The Microsoft sign-in cache for the bot, read from one mounted secret file.
 *
 * The desktop application keeps the account in operating-system protected storage and,
 * only when a viewer is hosted, writes this one file onto the host's labelled secrets
 * volume with owner-only permissions. This module is the only reader inside the
 * container. It never prints a token, never puts one in an environment variable and
 * never returns one from a function that logs.
 *
 * `prismarine-auth` accepts a cache factory in place of a folder, which is how refreshed
 * tokens are written back to the same file instead of to a path nobody mounted.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const SECRET_FILE_VERSION = 1;
export const MAX_SECRET_BYTES = 1024 * 1024;

export interface SecretFile {
    readonly version: typeof SECRET_FILE_VERSION;
    /** The public-client application id the sign-in used. It is not a secret. */
    readonly clientId: string;
    readonly caches: Record<string, unknown>;
}

export interface AuthCache {
    readonly clientId: string;
    /** A cache factory in the shape `prismarine-auth` expects. */
    readonly factory: (options: { cacheName: string; username?: string }) => {
        getCached(): Promise<unknown>;
        setCached(value: unknown): Promise<void>;
        setCachedPartial(value: Record<string, unknown>): Promise<void>;
        reset(): Promise<void>;
    };
}

const CLIENT_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function parseSecretFile(text: string): SecretFile | null {
    if (text.length > MAX_SECRET_BYTES) return null;
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        return null;
    }
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== SECRET_FILE_VERSION) return null;
    if (typeof record.clientId !== "string" || !CLIENT_ID.test(record.clientId)) return null;
    const caches = record.caches;
    if (typeof caches !== "object" || caches === null || Array.isArray(caches)) return null;
    return { version: SECRET_FILE_VERSION, clientId: record.clientId, caches: { ...(caches as Record<string, unknown>) } };
}

export function loadAuthCache(path: string): AuthCache | null {
    let text: string;
    try {
        text = readFileSync(path, "utf8");
    } catch {
        return null;
    }
    const file = parseSecretFile(text);
    if (file === null) return null;
    const caches = file.caches;
    const persist = (): void => {
        const next: SecretFile = { version: SECRET_FILE_VERSION, clientId: file.clientId, caches };
        try {
            mkdirSync(dirname(path), { recursive: true });
            const temporary = `${path}.tmp`;
            writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
            renameSync(temporary, path);
        } catch {
            // A read-only volume is a legitimate way to run this. Refreshed tokens then live
            // only in memory for this run and the next start uses the file as it was given.
        }
    };
    return {
        clientId: file.clientId,
        factory: ({ cacheName }) => ({
            getCached: async () => caches[cacheName] ?? {},
            setCached: async (value) => {
                caches[cacheName] = value;
                persist();
            },
            setCachedPartial: async (value) => {
                const previous = caches[cacheName];
                caches[cacheName] = { ...(typeof previous === "object" && previous !== null ? previous : {}), ...value };
                persist();
            },
            reset: async () => {
                caches[cacheName] = {};
                persist();
            },
        }),
    };
}
