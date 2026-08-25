import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type * as http from "node:http";
import type { HttpHandler } from "../http/HttpServer.js";

/**
 * Who is allowed to talk to a hosted deployment.
 *
 * ## What the desktop does, and why none of it survives
 *
 * The Electron application already serves its own renderer over HTTP, and it is already
 * authenticated: a random token per launch, handed to the window in its URL, then re-attached
 * as a `Bearer` header to every subsequent request by the Electron session. That last part is
 * browser-chrome-level interception. A tab cannot do it for itself, so the mechanism does not
 * port. Neither does the CSP the same session injects.
 *
 * A cookie does port, and it is the only thing that works for both halves of this bridge.
 * `fetch` can set a header; `EventSource` cannot set one at all. Anything header-based would
 * therefore need a second mechanism for the event stream, and two mechanisms drift. One
 * `HttpOnly` cookie authenticates both by construction.
 *
 * ## What this is, said plainly
 *
 * A single-operator remote control surface with a password in front of it. It is not
 * multi-tenant, there are no accounts, and everyone who knows the password is the same person
 * as far as this server is concerned. The honest default that follows is the one enforced in
 * `refuseUnsafeExposure`: a deployment that binds anywhere but loopback must have a password,
 * or it must be told explicitly and in as many words that it is being opened without one.
 */
export interface HostedSessionOptions {
    /**
     * The shared secret, already hashed, or `null` for a deployment with no password.
     *
     * Hashed rather than plain so a configuration file, a process listing or a crash dump
     * does not carry the password itself.
     */
    readonly passwordHash: string | null;
    /** How long a signed-in browser stays signed in. */
    readonly sessionLifetimeMs?: number;
    /** Injected so tests need not wait out a real clock. */
    readonly now?: () => number;
}

const DEFAULT_LIFETIME_MS = 12 * 60 * 60 * 1000;
const COOKIE_NAME = "worldlens_session";

/** Hash a password the way `passwordHash` expects it. */
export function hashPassword(password: string): string {
    return createHash("sha256").update(password, "utf8").digest("hex");
}

/** Compare without leaking, through timing, how much of a guess was right. */
function equals(left: string, right: string): boolean {
    const a = Buffer.from(left, "utf8");
    const b = Buffer.from(right, "utf8");
    // `timingSafeEqual` throws on unequal lengths, which would itself be a length oracle.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

function readCookie(header: string | undefined, name: string): string | null {
    if (header === undefined) return null;
    for (const part of header.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) return rest.join("=");
    }
    return null;
}

export class HostedSession {
    readonly #options: HostedSessionOptions;
    readonly #tokens = new Map<string, number>();
    readonly #now: () => number;
    readonly #lifetime: number;

    constructor(options: HostedSessionOptions) {
        this.#options = options;
        this.#now = options.now ?? Date.now;
        this.#lifetime = options.sessionLifetimeMs ?? DEFAULT_LIFETIME_MS;
    }

    /** Whether this deployment asks for a password at all. */
    get required(): boolean {
        return this.#options.passwordHash !== null;
    }

    /** Whether this request carries a session that is still valid. */
    authorized(req: http.IncomingMessage): boolean {
        if (!this.required) return true;
        const token = readCookie(req.headers.cookie, COOKIE_NAME);
        if (token === null) return false;
        const expires = this.#tokens.get(token);
        if (expires === undefined) return false;
        if (expires <= this.#now()) {
            this.#tokens.delete(token);
            return false;
        }
        return true;
    }

    /** Exchange a password for a session, or `null` when it does not match. */
    signIn(password: string): string | null {
        const expected = this.#options.passwordHash;
        if (expected === null) return null;
        if (!equals(hashPassword(password), expected)) return null;
        this.#sweep();
        const token = randomBytes(32).toString("hex");
        this.#tokens.set(token, this.#now() + this.#lifetime);
        return token;
    }

    /** The `Set-Cookie` value for a freshly issued session. */
    cookieFor(token: string, secure: boolean): string {
        const attributes = [
            `${COOKIE_NAME}=${token}`,
            "Path=/",
            "HttpOnly",
            // Strict rather than Lax: nothing about this application is reached by following
            // a link from somewhere else, so there is no flow that Strict would break, and
            // Lax would leave top-level navigations carrying the session.
            "SameSite=Strict",
            `Max-Age=${String(Math.floor(this.#lifetime / 1000))}`,
        ];
        // Only over TLS: a `Secure` cookie is simply never sent over plain HTTP, so setting it
        // unconditionally would silently break every loopback deployment.
        if (secure) attributes.push("Secure");
        return attributes.join("; ");
    }

    #sweep(): void {
        const now = this.#now();
        for (const [token, expires] of this.#tokens) if (expires <= now) this.#tokens.delete(token);
    }
}

/**
 * Refuse to start a deployment that is open to a network with no password.
 *
 * The CLI's own webserver passes no auth token and is unauthenticated by design, because it
 * serves a public map. This must not inherit that: the same port would carry the whole
 * application, including whatever the operator mounted. So binding beyond loopback without a
 * password stops the process, and the only way past is an explicit flag whose name says what
 * it does. Returns the refusal, or `null` when the configuration is safe.
 */
export function refuseUnsafeExposure(options: {
    readonly host: string;
    readonly hasPassword: boolean;
    readonly acknowledgedInsecure: boolean;
}): string | null {
    const loopback =
        options.host === "127.0.0.1" || options.host === "::1" || options.host === "localhost";
    if (loopback || options.hasPassword || options.acknowledgedInsecure) return null;
    return (
        `Refusing to listen on ${options.host} without a password. ` +
        "Anyone who can reach that address would be able to read and write every mounted " +
        "folder. Set a password, bind to 127.0.0.1, or pass --insecure-no-password if this " +
        "network is genuinely trusted and you mean it."
    );
}

/** `POST /bridge/session` - exchange a password for a cookie. */
export class HostedSessionHandler implements HttpHandler {
    constructor(
        private readonly session: HostedSession,
        private readonly secureCookies: boolean,
    ) {}

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/bridge/session") return false;

        if (req.method === "GET") {
            // Lets the interface show a sign-in prompt or not, without guessing.
            const body = JSON.stringify({
                required: this.session.required,
                signedIn: this.session.authorized(req),
            });
            res.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
                "x-content-type-options": "nosniff",
            });
            res.end(body);
            return true;
        }

        if (req.method !== "POST") {
            res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
            res.end("Sign in with POST.");
            return true;
        }

        const body = await new Promise<string>((resolve) => {
            const chunks: Buffer[] = [];
            let total = 0;
            req.on("data", (chunk: Buffer) => {
                total += chunk.length;
                // A password is short. Anything larger is not a sign-in attempt.
                if (total > 4096) {
                    req.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
            req.on("error", () => resolve(""));
        });

        let password = "";
        try {
            const parsed: unknown = JSON.parse(body);
            if (parsed !== null && typeof parsed === "object")
                password = String((parsed as { password?: unknown }).password ?? "");
        } catch {
            password = "";
        }

        const token = this.session.signIn(password);
        if (token === null) {
            // No detail beyond "that did not match": whether the password was close, the
            // wrong length, or the right password for a deployment that has none are all
            // things a caller learns nothing useful from and an attacker learns plenty from.
            res.writeHead(401, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            });
            res.end(JSON.stringify({ error: { message: "That password did not match." } }));
            return true;
        }

        res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "set-cookie": this.session.cookieFor(token, this.secureCookies),
        });
        res.end(JSON.stringify({ ok: true }));
        return true;
    }
}

/**
 * Refuses every request that is not signed in, before any other handler sees it.
 *
 * Registered first, so a handler added later cannot accidentally sit in front of the gate.
 * The sign-in route and the static assets the sign-in page itself needs are the only things
 * that pass, because a login form nobody can load is a locked door with no handle.
 */
export class HostedAuthGate implements HttpHandler {
    constructor(private readonly session: HostedSession) {}

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        if (!this.session.required) return await Promise.resolve(false);
        if (this.session.authorized(req)) return await Promise.resolve(false);

        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === "/bridge/session") return await Promise.resolve(false);

        // Everything the sign-in page itself is built from. Narrow on purpose: the whole
        // point is that an unauthenticated visitor can render a password box and nothing else.
        const isPageAsset =
            url.pathname === "/" ||
            url.pathname === "/index.html" ||
            url.pathname.startsWith("/assets/") ||
            url.pathname.startsWith("/lang/");
        if (isPageAsset) return await Promise.resolve(false);

        res.writeHead(401, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        });
        res.end(JSON.stringify({ error: { message: "Sign in first." } }));
        return await Promise.resolve(true);
    }
}
