import { afterEach, describe, expect, it } from "vitest";
import { HttpServer } from "../src/http/HttpServer.js";
import {
    HostedAuthGate,
    HostedSession,
    HostedSessionHandler,
    hashPassword,
    refuseUnsafeExposure,
} from "../src/bridge/HostedSession.js";
import type { HttpHandler } from "../src/http/HttpServer.js";

const servers: HttpServer[] = [];
afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
});

/** Stands in for the rest of the application, so the gate can be seen to stop things. */
class Reached implements HttpHandler {
    hits = 0;
    async handle(_req: unknown, res: import("node:http").ServerResponse): Promise<boolean> {
        this.hits++;
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("reached");
        return await Promise.resolve(true);
    }
}

async function start(password: string | null): Promise<{
    base: string;
    reached: Reached;
    session: HostedSession;
}> {
    const session = new HostedSession({
        passwordHash: password === null ? null : hashPassword(password),
    });
    const server = new HttpServer({ host: "127.0.0.1", port: 0 });
    servers.push(server);
    const reached = new Reached();
    server.addHandler(new HostedAuthGate(session));
    server.addHandler(new HostedSessionHandler(session, false));
    server.addHandler(reached);
    const address = await server.listen();
    return { base: `http://127.0.0.1:${String(address.port)}`, reached, session };
}

const signIn = async (base: string, password: string): Promise<Response> =>
    await fetch(`${base}/bridge/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
    });

const cookieFrom = (response: Response): string =>
    (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

describe("a deployment with a password", () => {
    it("refuses the bridge before anyone signs in, without reaching the application", async () => {
        const { base, reached } = await start("open sesame");

        const response = await fetch(`${base}/bridge/invoke`, { method: "POST" });

        expect(response.status).toBe(401);
        // The gate has to stop it, not merely answer alongside it.
        expect(reached.hits).toBe(0);
    });

    it("lets the sign-in page load, because a locked door needs a handle", async () => {
        const { base, reached } = await start("open sesame");

        expect((await fetch(`${base}/`)).status).toBe(200);
        expect((await fetch(`${base}/assets/index.js`)).status).toBe(200);
        expect(reached.hits).toBe(2);
    });

    it("exchanges the right password for a session and then lets the bridge through", async () => {
        const { base } = await start("open sesame");

        const signedIn = await signIn(base, "open sesame");
        expect(signedIn.status).toBe(200);

        const response = await fetch(`${base}/bridge/invoke`, {
            method: "POST",
            headers: { cookie: cookieFrom(signedIn) },
        });
        expect(response.status).toBe(200);
    });

    it("refuses the wrong password without saying anything about it", async () => {
        const { base } = await start("open sesame");

        const response = await signIn(base, "open sesamd");

        expect(response.status).toBe(401);
        const body = (await response.json()) as { error: { message: string } };
        // Nothing about length, closeness, or whether a password is set at all.
        expect(body.error.message).toBe("That password did not match.");
        expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("refuses a forged cookie", async () => {
        const { base } = await start("open sesame");

        const response = await fetch(`${base}/bridge/invoke`, {
            method: "POST",
            headers: { cookie: "worldlens_session=deadbeef" },
        });

        expect(response.status).toBe(401);
    });

    it("marks the cookie HttpOnly and SameSite=Strict", async () => {
        const { base } = await start("open sesame");

        const header = (await signIn(base, "open sesame")).headers.get("set-cookie") ?? "";

        expect(header).toContain("HttpOnly");
        expect(header).toContain("SameSite=Strict");
    });

    it("omits Secure over plain HTTP, because a Secure cookie is simply never sent", async () => {
        // Setting it unconditionally looks safer and silently breaks every loopback
        // deployment: the browser accepts the cookie and then never sends it back.
        const { base } = await start("open sesame");

        expect((await signIn(base, "open sesame")).headers.get("set-cookie")).not.toContain(
            "Secure",
        );
    });

    it("expires a session rather than honouring it forever", async () => {
        let clock = 1_000;
        const session = new HostedSession({
            passwordHash: hashPassword("open sesame"),
            sessionLifetimeMs: 1_000,
            now: () => clock,
        });
        const token = session.signIn("open sesame");
        expect(token).not.toBeNull();

        const request = { headers: { cookie: `worldlens_session=${token ?? ""}` } };
        expect(session.authorized(request as never)).toBe(true);
        clock += 2_000;
        expect(session.authorized(request as never)).toBe(false);
    });

    it("reports whether a password is needed, so the interface need not guess", async () => {
        const { base } = await start("open sesame");

        const body = (await (await fetch(`${base}/bridge/session`)).json()) as {
            required: boolean;
            signedIn: boolean;
        };

        expect(body).toEqual({ required: true, signedIn: false });
    });
});

describe("a deployment with no password", () => {
    it("lets everything through, because there is nothing to check", async () => {
        const { base } = await start(null);

        expect((await fetch(`${base}/bridge/invoke`, { method: "POST" })).status).toBe(200);
    });

    it("never issues a session, so no cookie can be mistaken for authority", async () => {
        const session = new HostedSession({ passwordHash: null });

        expect(session.signIn("anything")).toBeNull();
    });
});

describe("refusing to open a deployment nobody protected", () => {
    it("allows loopback with no password, which is the ordinary local case", () => {
        expect(
            refuseUnsafeExposure({
                host: "127.0.0.1",
                hasPassword: false,
                acknowledgedInsecure: false,
            }),
        ).toBeNull();
    });

    it("refuses a network bind with no password, and says what it would expose", () => {
        // The CLI's own webserver is unauthenticated by design because it serves a public
        // map. This carries the whole application and everything mounted into it, so it must
        // not inherit that default.
        const refusal = refuseUnsafeExposure({
            host: "0.0.0.0",
            hasPassword: false,
            acknowledgedInsecure: false,
        });

        expect(refusal).not.toBeNull();
        expect(refusal).toContain("mounted");
    });

    it("allows a network bind once there is a password", () => {
        expect(
            refuseUnsafeExposure({ host: "0.0.0.0", hasPassword: true, acknowledgedInsecure: false }),
        ).toBeNull();
    });

    it("allows a network bind when the operator said so in as many words", () => {
        expect(
            refuseUnsafeExposure({
                host: "0.0.0.0",
                hasPassword: false,
                acknowledgedInsecure: true,
            }),
        ).toBeNull();
    });
});
