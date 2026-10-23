import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { HostedSession } from "./HostedSession.js";

export interface HostedAdministrator { username: string; verifier: { algorithm: "scrypt-v1"; salt: string; digest: string } }
export type ManagedAccessState = "unprovisioned" | "provisioned" | "verified";
/** Account persistence is supplied by the host's protected storage, outside exported assets. */
export class ManagedHostedAccess {
    private administrator: HostedAdministrator | null;
    private state: ManagedAccessState;
    private readonly sessions = new Map<string, number>();
    private readonly attempts = new Map<string, { count: number; until: number }>();
    private activeSignIns = 0;
    private readonly cookie = new HostedSession({ passwordHash: "unused" });
    constructor(initial: HostedAdministrator | null, private readonly persist: (account: HostedAdministrator) => Promise<void>, private readonly now: () => number = Date.now) {
        this.administrator = initial;
        this.state = initial ? "provisioned" : "unprovisioned";
    }
    get status(): ManagedAccessState { return this.state; }
    /** Call only through a protected local bootstrap channel, never an unauthenticated HTTP route. */
    async provision(account: HostedAdministrator): Promise<void> {
        if (this.administrator) throw new Error("This destination already has an administrator.");
        if (!/^[\p{L}\p{N}_.@-]{1,80}$/u.test(account.username) || account.verifier.algorithm !== "scrypt-v1" || !/^[a-f0-9]{64}$/u.test(account.verifier.salt) || !/^[a-f0-9]{128}$/u.test(account.verifier.digest)) throw new Error("Invalid protected account preparation.");
        // Reserve synchronously to prevent two concurrent bootstraps.
        this.administrator = structuredClone(account);
        try { await this.persist(this.administrator); this.state = "provisioned"; }
        catch { this.administrator = null; throw new Error("Administrator provisioning did not complete."); }
    }
    async signIn(username: string, password: string, clientAddress: string): Promise<string | null> {
        const account = this.administrator;
        const now = this.now();
        for (const [key, value] of this.attempts) if (value.until <= now) this.attempts.delete(key);
        const attempts = this.attempts.get(clientAddress) ?? { count: 0, until: now + 60000 };
        if (!account || this.state === "unprovisioned" || attempts.count >= 5 || password.length > 1024 || this.attempts.size > 10000 || this.activeSignIns >= 4) return null;
        attempts.count++; this.attempts.set(clientAddress, attempts);
        this.activeSignIns++;
        let actual: Buffer;
        try { actual = await new Promise<Buffer>((resolve, reject) => scrypt(password, account.verifier.salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key))); }
        finally { this.activeSignIns--; }
        if (!timingSafeEqual(actual, Buffer.from(account.verifier.digest, "hex")) || username !== account.username) return null;
        for (const [key, expires] of this.sessions) if (expires <= now) this.sessions.delete(key);
        if (this.sessions.size >= 1000) return null;
        const token = randomBytes(32).toString("hex");
        this.sessions.set(token, now + 12 * 60 * 60 * 1000);
        this.state = "verified";
        return token;
    }
    principal(req: IncomingMessage): { subject: string; canRead: true; canWrite: true } | null {
        const token = (req.headers.cookie ?? "").split(";").map(part => part.trim()).find(part => part.startsWith("worldlens_session="))?.slice("worldlens_session=".length);
        if (!token || (this.sessions.get(token) ?? 0) <= this.now() || !this.administrator) return null;
        return { subject: this.administrator.username, canRead: true, canWrite: true };
    }
    cookieFor(token: string, secure: boolean): string { return this.cookie.cookieFor(token, secure); }
}
