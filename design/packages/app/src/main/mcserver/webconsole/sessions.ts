/**
 * Server-side sessions for the web console.
 *
 * A session token is 32 random bytes, handed to the browser as a cookie. Only the SHA-256
 * of the token is kept in memory - never the token itself - so a leaked in-process dump (a
 * heap snapshot, a crash report) does not hand out a working credential. Every check is a
 * hash comparison, exactly as a password is checked against its hash and never itself.
 *
 * Idle timeout and absolute expiry are two different clocks. Idle timeout forgives a
 * session that is still being used; absolute expiry does not, because a session that has
 * been silently renewed by activity for a week is a session nobody ever re-authenticated.
 *
 * The clock is injected so expiry is provable without a real timer ever running.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_TOKEN_BYTES = 32;
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

interface SessionRecord {
    readonly tokenHash: string;
    readonly createdAt: number;
    lastSeenAt: number;
}

export interface SessionManagerOptions {
    readonly now?: () => number;
    readonly randomToken?: () => Buffer;
    readonly idleTimeoutMs?: number;
    readonly absoluteTimeoutMs?: number;
}

function hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

export class SessionManager {
    readonly #now: () => number;
    readonly #randomToken: () => Buffer;
    readonly #idleTimeoutMs: number;
    readonly #absoluteTimeoutMs: number;
    readonly #sessions = new Map<string, SessionRecord>();

    constructor(options: SessionManagerOptions = {}) {
        this.#now = options.now ?? (() => Date.now());
        this.#randomToken = options.randomToken ?? (() => randomBytes(SESSION_TOKEN_BYTES));
        this.#idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
        this.#absoluteTimeoutMs = options.absoluteTimeoutMs ?? DEFAULT_ABSOLUTE_TIMEOUT_MS;
    }

    /** Mints a fresh session and returns the opaque token to hand to the browser. */
    create(): string {
        const token = this.#randomToken().toString("base64url");
        const now = this.#now();
        this.#sessions.set(hashToken(token), { tokenHash: hashToken(token), createdAt: now, lastSeenAt: now });
        return token;
    }

    /**
     * True when `token` is a live session, and touches its idle clock. False for a missing,
     * revoked, idle-expired, or absolutely-expired token - the caller cannot and must not
     * distinguish those cases from each other.
     */
    touch(token: unknown): boolean {
        if (typeof token !== "string" || token.length === 0 || token.length > 512) return false;
        const key = hashToken(token);
        const record = this.#sessions.get(key);
        if (record === undefined) return false;
        // Constant-time compare against the stored hash even though the map lookup already
        // matched: defends the comparison itself, not the lookup, against a timing probe on
        // the underlying token bytes.
        if (!safeEqualHex(key, record.tokenHash)) return false;

        const now = this.#now();
        if (now - record.createdAt > this.#absoluteTimeoutMs) {
            this.#sessions.delete(key);
            return false;
        }
        if (now - record.lastSeenAt > this.#idleTimeoutMs) {
            this.#sessions.delete(key);
            return false;
        }
        record.lastSeenAt = now;
        return true;
    }

    /** Revokes exactly one session. Missing is success: the caller wanted it gone. */
    revoke(token: string): void {
        this.#sessions.delete(hashToken(token));
    }

    /** Revokes every live session - used on password change. */
    revokeAll(): void {
        this.#sessions.clear();
    }

    /** For tests and diagnostics only; never exposed to a renderer or the web console. */
    get activeCount(): number {
        return this.#sessions.size;
    }
}
