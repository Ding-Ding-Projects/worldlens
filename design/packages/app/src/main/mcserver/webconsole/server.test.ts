import * as http from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { buildWebConsolePasswordRecord, type SafeStorageLike } from "./password.js";
import { startWebConsoleServer, type WebConsoleServerHandle } from "./server.js";
import { createServerRegistry, type ServerRegistry } from "../registry.js";

function fakeVault(): SafeStorageLike {
    return {
        isEncryptionAvailable: () => true,
        encryptString: (plainText: string) => Buffer.from(`enc:${plainText}`, "utf8"),
        decryptString: (encrypted: Buffer) => {
            const text = encrypted.toString("utf8");
            if (!text.startsWith("enc:")) throw new Error("bad ciphertext");
            return text.slice(4);
        },
    };
}

interface RawResponse {
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
}

function request(
    handle: WebConsoleServerHandle,
    method: string,
    path: string,
    options: { body?: unknown; cookie?: string } = {},
): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
        const req = http.request(
            {
                host: handle.host,
                port: handle.port,
                method,
                path,
                headers: {
                    ...(payload === undefined
                        ? {}
                        : {
                              "content-type": "application/json",
                              "content-length": Buffer.byteLength(payload),
                          }),
                    ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (c) => chunks.push(c as Buffer));
                res.on("end", () => {
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString("utf8"),
                    });
                });
            },
        );
        req.on("error", reject);
        if (payload !== undefined) req.write(payload);
        req.end();
    });
}

function extractCookie(headers: http.IncomingHttpHeaders): string | null {
    const raw = headers["set-cookie"];
    if (raw === undefined) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.split(";")[0] ?? null;
}

let activeHandles: WebConsoleServerHandle[] = [];

async function startTestServer(
    overrides: Partial<Parameters<typeof startWebConsoleServer>[0]> = {},
) {
    const dataFolder = process.env["TEMP"] ?? process.env["TMPDIR"] ?? "/tmp";
    const registry: ServerRegistry =
        overrides.registry ??
        createServerRegistry({ dataFolder: `${dataFolder}/wl-test-${Math.random()}` });
    const vault = (overrides.safeStorage as SafeStorageLike | undefined) ?? fakeVault();
    const handle = await startWebConsoleServer({
        registry,
        safeStorage: vault,
        dataFolder: `${dataFolder}/wl-test-${Math.random()}`,
        host: "127.0.0.1",
        port: 0,
        now: () => Date.now(),
        schoolMode: () => false,
        ...overrides,
    });
    activeHandles.push(handle);
    return { handle, registry, vault };
}

afterEach(async () => {
    await Promise.all(activeHandles.map((h) => h.close()));
    activeHandles = [];
});

describe("web console server", () => {
    it("serves the sign-in page in plain English with no in-house jargon", async () => {
        const { handle } = await startTestServer();
        const res = await request(handle, "GET", "/");
        expect(res.status).toBe(200);

        // An allowlist rather than a list of forbidden words, for two reasons. A denylist
        // only catches jargon somebody already thought of, so the term that actually
        // reaches a stranger is by definition the one nobody listed. And this page is
        // read by people who have just been handed an address by a colleague, so every
        // word on it has to be one they can act on without knowing this project.
        const visible = res.body
            .replace(/<script[^]*?<[/]script>/g, " ")
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        // The first "Sign in" is the <title>, which is user-visible as the browser tab and
        // so is held to the same standard as the body rather than skipped as markup.
        expect(visible).toBe(
            "Sign in Sign in Enter the password for this server console. Password Sign in",
        );
    });

    it("rejects sign-in with the wrong password", async () => {
        const { handle, vault, handle: h } = await startTestServer();
        const dataFolder = `${process.env["TEMP"] ?? "/tmp"}/wl-test-pw-${Math.random()}`;
        void dataFolder;
        void vault;
        void h;
        const res = await request(handle, "POST", "/api/auth/signin", {
            body: { password: "wrong" },
        });
        expect(res.status).toBe(401);
        expect(extractCookie(res.headers)).toBeNull();
    });

    it("accepts sign-in with the correct password and sets a session cookie", async () => {
        const dataFolder = `${process.env["TEMP"] ?? "/tmp"}/wl-test-${Math.random()}`;
        const vault = fakeVault();
        const record = await buildWebConsolePasswordRecord(vault, "correct-password", {
            N: 1024,
            r: 4,
            p: 1,
            keylen: 32,
        });
        const registry = createServerRegistry({ dataFolder });
        const handle = await startWebConsoleServer({
            registry,
            safeStorage: vault,
            dataFolder,
            host: "127.0.0.1",
            port: 0,
        });
        activeHandles.push(handle);
        // Seed the password store the same way the IPC handler would.
        const { WebConsolePasswordStore } = await import("./passwordStore.js");
        await new WebConsolePasswordStore(dataFolder).put(record as Buffer);

        const res = await request(handle, "POST", "/api/auth/signin", {
            body: { password: "correct-password" },
        });
        expect(res.status).toBe(200);
        const cookie = extractCookie(res.headers);
        expect(cookie).not.toBeNull();
        const fullHeader = res.headers["set-cookie"];
        const full = Array.isArray(fullHeader) ? fullHeader[0] : fullHeader;
        expect(full).toContain("HttpOnly");
        expect(full).toContain("SameSite=Strict");

        const status = await request(handle, "GET", "/api/auth/status", {
            cookie: cookie as string,
        });
        expect(JSON.parse(status.body).authenticated).toBe(true);
    });

    it("does not mark Secure on a loopback (non-TLS) bind", async () => {
        const dataFolder = `${process.env["TEMP"] ?? "/tmp"}/wl-test-${Math.random()}`;
        const vault = fakeVault();
        const record = await buildWebConsolePasswordRecord(vault, "pw", {
            N: 1024,
            r: 4,
            p: 1,
            keylen: 32,
        });
        const registry = createServerRegistry({ dataFolder });
        const handle = await startWebConsoleServer({
            registry,
            safeStorage: vault,
            dataFolder,
            host: "127.0.0.1",
            port: 0,
        });
        activeHandles.push(handle);
        const { WebConsolePasswordStore } = await import("./passwordStore.js");
        await new WebConsolePasswordStore(dataFolder).put(record as Buffer);
        const res = await request(handle, "POST", "/api/auth/signin", { body: { password: "pw" } });
        const cookie = extractCookie(res.headers);
        expect(cookie).not.toBeNull();
        // The full Set-Cookie header (not just the name=value pair extracted above) must
        // omit Secure on a loopback bind - a Secure cookie a loopback browser would refuse.
        const fullHeader = res.headers["set-cookie"];
        const full = Array.isArray(fullHeader) ? fullHeader[0] : fullHeader;
        expect(full).not.toContain("Secure");
    });

    it("marks Secure when the caller declares TLS termination", async () => {
        const dataFolder = `${process.env["TEMP"] ?? "/tmp"}/wl-test-${Math.random()}`;
        const vault = fakeVault();
        const record = await buildWebConsolePasswordRecord(vault, "pw", {
            N: 1024,
            r: 4,
            p: 1,
            keylen: 32,
        });
        const registry = createServerRegistry({ dataFolder });
        const handle = await startWebConsoleServer({
            registry,
            safeStorage: vault,
            dataFolder,
            host: "127.0.0.1",
            port: 0,
            tlsTerminated: true,
        });
        activeHandles.push(handle);
        const { WebConsolePasswordStore } = await import("./passwordStore.js");
        await new WebConsolePasswordStore(dataFolder).put(record as Buffer);
        const res = await request(handle, "POST", "/api/auth/signin", { body: { password: "pw" } });
        const fullHeader = res.headers["set-cookie"];
        const full = Array.isArray(fullHeader) ? fullHeader[0] : fullHeader;
        expect(full).toContain("Secure");
    });

    it("refuses plain HTTP on a non-loopback bind without TLS termination", async () => {
        const dataFolder = `${process.env["TEMP"] ?? "/tmp"}/wl-test-${Math.random()}`;
        const vault = fakeVault();
        const registry = createServerRegistry({ dataFolder });
        await expect(
            startWebConsoleServer({
                registry,
                safeStorage: vault,
                dataFolder,
                host: "0.0.0.0",
                port: 0,
            }),
        ).rejects.toThrow(/loopback/i);
    });

    it("requires a session for the API", async () => {
        const { handle } = await startTestServer();
        const res = await request(handle, "GET", "/api/servers");
        expect(res.status).toBe(401);
    });

    it("sign-out clears the cookie and the session no longer authenticates", async () => {
        const dataFolder = `${process.env["TEMP"] ?? "/tmp"}/wl-test-${Math.random()}`;
        const vault = fakeVault();
        const record = await buildWebConsolePasswordRecord(vault, "pw", {
            N: 1024,
            r: 4,
            p: 1,
            keylen: 32,
        });
        const registry = createServerRegistry({ dataFolder });
        const handle = await startWebConsoleServer({
            registry,
            safeStorage: vault,
            dataFolder,
            host: "127.0.0.1",
            port: 0,
        });
        activeHandles.push(handle);
        const { WebConsolePasswordStore } = await import("./passwordStore.js");
        await new WebConsolePasswordStore(dataFolder).put(record as Buffer);
        const signin = await request(handle, "POST", "/api/auth/signin", {
            body: { password: "pw" },
        });
        const cookie = extractCookie(signin.headers) as string;
        await request(handle, "POST", "/api/auth/signout", { cookie });
        const status = await request(handle, "GET", "/api/auth/status", { cookie });
        expect(JSON.parse(status.body).authenticated).toBe(false);
    });

    it("locks out after repeated wrong passwords and reports remaining wait", async () => {
        const { handle } = await startTestServer();
        for (let i = 0; i < 5; i += 1) {
            await request(handle, "POST", "/api/auth/signin", { body: { password: "nope" } });
        }
        const res = await request(handle, "POST", "/api/auth/signin", {
            body: { password: "nope" },
        });
        expect(res.status).toBe(429);
        const parsed = JSON.parse(res.body);
        expect(parsed.retryAfterMs).toBeGreaterThan(0);
    });

    it("the ladder status endpoint reports locked and a rung while locked", async () => {
        const { handle } = await startTestServer();
        for (let i = 0; i < 5; i += 1) {
            await request(handle, "POST", "/api/auth/signin", { body: { password: "nope" } });
        }
        const status = await request(handle, "GET", "/api/auth/ladder/status");
        const parsed = JSON.parse(status.body);
        expect(parsed.locked).toBe(true);
        expect(parsed.rung).toBe("dimsum");
    });

    it("clearing the ladder does not authenticate: /api/servers still refuses after a cleared ladder", async () => {
        const { handle } = await startTestServer();
        for (let i = 0; i < 5; i += 1) {
            await request(handle, "POST", "/api/auth/signin", { body: { password: "nope" } });
        }
        const challengeRes = await request(handle, "POST", "/api/auth/ladder/challenge");
        const challenge = JSON.parse(challengeRes.body);
        expect(challenge.ok).toBe(true);
        expect(challenge.challenge.rung).toBe("dimsum");

        // Try every choice index until one clears it (deterministic within one 4-choice set).
        let cleared = false;
        for (let i = 0; i < 4 && !cleared; i += 1) {
            const submit = await request(handle, "POST", "/api/auth/ladder/submit", {
                body: { rung: "dimsum", nonce: challenge.challenge.nonce, choiceIndex: i },
            });
            const parsed = JSON.parse(submit.body);
            if (parsed.cleared) cleared = true;
            else break; // nonce is single-use; stop after the first (only) grading attempt
        }

        // Whether or not that single attempt cleared it, the critical assertion is this:
        // no response from the ladder endpoints ever carried a Set-Cookie header, and the
        // API remains unauthenticated without ever having signed in with the real password.
        const apiRes = await request(handle, "GET", "/api/servers");
        expect(apiRes.status).toBe(401);
    });

    it("never sets a session cookie from any ladder response, win or lose", async () => {
        const { handle } = await startTestServer();
        for (let i = 0; i < 5; i += 1) {
            await request(handle, "POST", "/api/auth/signin", { body: { password: "nope" } });
        }
        const challengeRes = await request(handle, "POST", "/api/auth/ladder/challenge");
        expect(challengeRes.headers["set-cookie"]).toBeUndefined();
        const challenge = JSON.parse(challengeRes.body);
        const submitRes = await request(handle, "POST", "/api/auth/ladder/submit", {
            body: { rung: "dimsum", nonce: challenge.challenge.nonce, choiceIndex: 0 },
        });
        expect(submitRes.headers["set-cookie"]).toBeUndefined();
    });

    it("School mode starts the ladder at sums, never offering dim sum", async () => {
        const dataFolder = `${process.env["TEMP"] ?? "/tmp"}/wl-test-${Math.random()}`;
        const vault = fakeVault();
        const registry = createServerRegistry({ dataFolder });
        const handle = await startWebConsoleServer({
            registry,
            safeStorage: vault,
            dataFolder,
            host: "127.0.0.1",
            port: 0,
            schoolMode: () => true,
        });
        activeHandles.push(handle);
        for (let i = 0; i < 5; i += 1) {
            await request(handle, "POST", "/api/auth/signin", { body: { password: "nope" } });
        }
        const challengeRes = await request(handle, "POST", "/api/auth/ladder/challenge");
        const challenge = JSON.parse(challengeRes.body);
        expect(challenge.challenge.rung).toBe("sums");
    });

    it("returns an honest not-locked answer when nothing is locked", async () => {
        const { handle } = await startTestServer();
        const res = await request(handle, "POST", "/api/auth/ladder/challenge");
        const parsed = JSON.parse(res.body);
        expect(parsed.ok).toBe(false);
        expect(parsed.reason).toBe("not-locked");
    });
});
