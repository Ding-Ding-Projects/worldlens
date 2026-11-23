/**
 * The management site's account routes: first-visitor owner setup, sign-in with any
 * combination of password, passkey and authenticator code, invitations, and the sign-in policy.
 *
 * Used instead of the single shared password when the console is given an `AccountBook` (the
 * Minecraft server appliance does this). Every route answers in plain English. A session is the
 * same token the rest of the console checks; which account it belongs to is kept against the
 * token's SHA-256, never the token itself.
 */
import { createHash } from "node:crypto";
import type * as http from "node:http";
import type { HttpHandler } from "@worldlens/server";
import {
    AccountBook,
    FACTORS,
    type Account,
    type AccountsSnapshot,
    type Factor,
    type Role,
} from "./accounts.js";
import type { SignInGate } from "./lockout.js";
import {
    newChallenge,
    verifyAssertion,
    verifyRegistration,
    type StoredPasskey,
} from "./passkey.js";
import type { SessionManager } from "./sessions.js";
import { newTotpSecret, otpauthUri } from "./totp.js";

export interface AccountsOptions {
    readonly book: AccountBook;
    readonly save: (snapshot: AccountsSnapshot) => Promise<void>;
    /** The site's host name, e.g. `mc-heapandyville.local`. Passkeys are bound to it. */
    readonly rpId: string;
    /** The exact origin browsers use, e.g. `https://mc-heapandyville.local`. */
    readonly origin: string;
    /** Shown in authenticator apps. */
    readonly siteName: string;
}

interface Deps {
    readonly accounts: AccountsOptions;
    readonly sessions: SessionManager;
    readonly gate: SignInGate;
    readonly now: () => number;
    readonly readCookie: (req: http.IncomingMessage) => string | null;
    readonly cookie: (token: string) => string;
    readonly clearCookie: () => string;
    readonly readJson: (req: http.IncomingMessage) => Promise<unknown>;
    readonly send: (
        res: http.ServerResponse,
        status: number,
        body: unknown,
        headers?: Record<string, string>,
    ) => void;
    readonly source: (req: http.IncomingMessage) => string;
}

const CHALLENGE_MS = 5 * 60_000;
const tokenKey = (token: string): string => createHash("sha256").update(token).digest("hex");
const obj = (v: unknown): Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function buildAccountsHandler(deps: Deps): {
    handler: HttpHandler;
    accountFor: (req: http.IncomingMessage) => Account | null;
} {
    const { accounts, sessions, gate, now, send } = deps;
    const book = accounts.book;
    const owners = new Map<string, string>(); // sha256(token) -> account id
    const challenges = new Map<string, { value: string; expires: number }>(); // source -> challenge

    function accountFor(req: http.IncomingMessage): Account | null {
        const token = deps.readCookie(req);
        if (token === null || !sessions.touch(token)) return null;
        const id = owners.get(tokenKey(token));
        return book.list().find((a) => a.id === id) ?? null;
    }

    function startSession(
        res: http.ServerResponse,
        account: Account,
        body: unknown = { ok: true },
    ): void {
        const token = sessions.create();
        owners.set(tokenKey(token), account.id);
        send(res, 200, body, { "set-cookie": deps.cookie(token) });
    }

    function takeChallenge(req: http.IncomingMessage): string | null {
        const key = deps.source(req);
        const found = challenges.get(key);
        challenges.delete(key);
        return found !== undefined && found.expires > now() ? found.value : null;
    }

    function registrationFrom(
        req: http.IncomingMessage,
        raw: unknown,
        name: string,
    ): StoredPasskey | null {
        const p = obj(raw);
        if (Object.keys(p).length === 0) return null;
        const challenge = takeChallenge(req);
        if (challenge === null) throw new Error("The passkey request expired; try again.");
        return verifyRegistration(
            {
                clientDataJSON: str(p.clientDataJSON) ?? "",
                attestationObject: str(p.attestationObject) ?? "",
                name,
                now: new Date(now()),
            },
            { challenge, origin: accounts.origin, rpId: accounts.rpId },
        );
    }

    function factorsFrom(req: http.IncomingMessage, b: Record<string, unknown>, name: string) {
        const totp = obj(b.totp);
        return {
            password: str(b.password) || null,
            totp:
                str(totp.secret) && str(totp.code)
                    ? { secret: totp.secret as string, code: totp.code as string }
                    : null,
            passkey: registrationFrom(req, b.passkey, str(b.passkeyName) ?? "Passkey"),
            now: new Date(now()),
            name,
        };
    }

    const handler: HttpHandler = {
        async handle(req, res): Promise<boolean> {
            const url = new URL(req.url ?? "/", "http://localhost");
            const path = url.pathname;
            const method = req.method ?? "GET";

            if (path === "/" && method === "GET" && accountFor(req) === null) {
                res.writeHead(200, {
                    "content-type": "text/html; charset=utf-8",
                    "cache-control": "no-store",
                    "x-content-type-options": "nosniff",
                });
                res.end(ACCOUNT_PAGE);
                return true;
            }
            if (path === "/account.js" && method === "GET") {
                res.writeHead(200, {
                    "content-type": "text/javascript; charset=utf-8",
                    "cache-control": "no-store",
                    "x-content-type-options": "nosniff",
                });
                res.end(ACCOUNT_SCRIPT);
                return true;
            }
            if (path === "/api/auth/status" && method === "GET") {
                const me = accountFor(req);
                send(res, 200, {
                    authenticated: me !== null,
                    mode: "accounts",
                    openForOwner: book.openForOwner,
                    policy: book.signInPolicy,
                    account: me === null ? null : { name: me.name, role: me.role },
                });
                return true;
            }
            if (path === "/api/auth/totp/new" && method === "POST") {
                const secret = newTotpSecret();
                send(res, 200, {
                    secret,
                    uri: otpauthUri(secret, "new account", accounts.siteName),
                });
                return true;
            }
            if (path === "/api/auth/passkey/challenge" && method === "POST") {
                const value = newChallenge();
                challenges.set(deps.source(req), { value, expires: now() + CHALLENGE_MS });
                const name = str(obj(await deps.readJson(req).catch(() => ({}))).name) ?? "";
                const allow = (book.find(name)?.passkeys ?? []).map((k) => k.id);
                send(res, 200, {
                    challenge: value,
                    rpId: accounts.rpId,
                    rpName: accounts.siteName,
                    allow,
                });
                return true;
            }
            const routes = [
                "/api/accounts/setup-owner",
                "/api/auth/signin",
                "/api/auth/signout",
                "/api/accounts/accept",
                "/api/accounts",
                "/api/accounts/invite",
                "/api/accounts/policy",
                "/api/accounts/remove",
            ];
            if (!routes.includes(path) || (method !== "POST" && method !== "GET")) return false;

            let body: Record<string, unknown> = {};
            if (method === "POST") {
                try {
                    body = obj(await deps.readJson(req));
                } catch {
                    send(res, 400, { ok: false, error: "The request could not be read." });
                    return true;
                }
            }

            try {
                if (path === "/api/accounts/setup-owner" && method === "POST") {
                    if (!book.openForOwner) {
                        send(res, 409, {
                            ok: false,
                            error: "This site already has an owner. Ask them for an invitation.",
                        });
                        return true;
                    }
                    const name = str(body.name) ?? "";
                    const policy = (Array.isArray(body.policy) ? body.policy : []).filter(
                        (f): f is Factor => FACTORS.includes(f as Factor),
                    );
                    const owner = book.registerOwner({ ...factorsFrom(req, body, name), policy });
                    await accounts.save(book.snapshot());
                    startSession(res, owner, { ok: true, role: owner.role });
                    return true;
                }

                if (path === "/api/auth/signin" && method === "POST") {
                    const source = deps.source(req);
                    if (gate.isLocked(source)) {
                        send(res, 429, {
                            ok: false,
                            error: "Too many attempts. Please wait before trying again.",
                            retryAfterMs: gate.remainingLockMs(source),
                        });
                        return true;
                    }
                    const name = str(body.name) ?? "";
                    let passkeyVerified: string | undefined;
                    const pk = obj(body.passkey);
                    if (Object.keys(pk).length > 0) {
                        const challenge = takeChallenge(req);
                        const stored = book
                            .find(name)
                            ?.passkeys.find((k) => k.id === str(pk.credentialId));
                        if (challenge !== null && stored !== undefined) {
                            try {
                                verifyAssertion(
                                    {
                                        credentialId: str(pk.credentialId) ?? "",
                                        clientDataJSON: str(pk.clientDataJSON) ?? "",
                                        authenticatorData: str(pk.authenticatorData) ?? "",
                                        signature: str(pk.signature) ?? "",
                                    },
                                    stored,
                                    { challenge, origin: accounts.origin, rpId: accounts.rpId },
                                );
                                passkeyVerified = stored.id;
                            } catch {
                                passkeyVerified = undefined;
                            }
                        }
                    }
                    const account = book.signIn(
                        name,
                        {
                            ...(str(body.password) ? { password: body.password as string } : {}),
                            ...(str(body.totpCode) ? { totpCode: body.totpCode as string } : {}),
                            ...(passkeyVerified ? { passkeyVerified } : {}),
                        },
                        new Date(now()),
                    );
                    if (account === null) {
                        gate.recordPasswordFailure(source);
                        send(res, 401, {
                            ok: false,
                            error: "Those details did not match. Check every field the sign-in asks for.",
                        });
                        return true;
                    }
                    gate.recordPasswordSuccess(source, false);
                    await accounts.save(book.snapshot()); // the TOTP step and passkey counter moved
                    startSession(res, account, { ok: true, role: account.role });
                    return true;
                }

                if (path === "/api/auth/signout" && method === "POST") {
                    const token = deps.readCookie(req);
                    if (token !== null) {
                        owners.delete(tokenKey(token));
                        sessions.revoke(token);
                    }
                    send(res, 200, { ok: true }, { "set-cookie": deps.clearCookie() });
                    return true;
                }

                if (path === "/api/accounts/accept" && method === "POST") {
                    const name = str(body.name) ?? "";
                    const account = book.acceptInvitation(
                        str(body.code) ?? "",
                        factorsFrom(req, body, name),
                    );
                    await accounts.save(book.snapshot());
                    startSession(res, account, { ok: true, role: account.role });
                    return true;
                }

                const me = accountFor(req);
                if (me === null) {
                    send(res, 401, { ok: false, error: "Sign in required." });
                    return true;
                }
                if (path === "/api/accounts" && method === "GET") {
                    send(res, 200, {
                        ok: true,
                        policy: book.signInPolicy,
                        accounts: book
                            .list()
                            .map((a) => ({
                                id: a.id,
                                name: a.name,
                                role: a.role,
                                password: a.passwordVerifier !== null,
                                totp: a.totpSecret !== null,
                                passkeys: a.passkeys.length,
                            })),
                    });
                    return true;
                }
                if (path === "/api/accounts/invite" && method === "POST") {
                    const role = str(body.role) as Exclude<Role, "owner"> | null;
                    if (role !== "admin" && role !== "operator" && role !== "viewer")
                        throw new Error("Choose a role for the invitation.");
                    const code = book.invite(me, role, new Date(now()));
                    await accounts.save(book.snapshot());
                    send(res, 200, { ok: true, code });
                    return true;
                }
                if (path === "/api/accounts/policy" && method === "POST") {
                    book.setPolicy(
                        me,
                        (Array.isArray(body.policy) ? body.policy : []).filter((f): f is Factor =>
                            FACTORS.includes(f as Factor),
                        ),
                    );
                    await accounts.save(book.snapshot());
                    send(res, 200, { ok: true, policy: book.signInPolicy });
                    return true;
                }
                if (path === "/api/accounts/remove" && method === "POST") {
                    book.remove(me, str(body.id) ?? "");
                    await accounts.save(book.snapshot());
                    send(res, 200, { ok: true });
                    return true;
                }
            } catch (error) {
                send(res, 400, {
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                });
                return true;
            }
            return false;
        },
    };
    return { handler, accountFor };
}

const ACCOUNT_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Server management</title>
<style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#101418;color:#e1e2e8;display:flex;justify-content:center}
main{width:min(440px,100% - 32px);margin:48px 0;display:flex;flex-direction:column;gap:12px}
h1{font-weight:400;font-size:28px;margin:0}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#c2c7cf}
input{height:44px;border-radius:8px;border:1px solid #8c9199;background:transparent;color:inherit;padding:0 12px;font:inherit}
button{min-height:44px;border-radius:22px;border:0;padding:0 20px;font:500 14px system-ui;background:#8fcdff;color:#003351;cursor:pointer}
button.alt{background:transparent;color:#8fcdff;border:1px solid #8c9199}
fieldset{border:1px solid #42474e;border-radius:16px;display:flex;flex-direction:column;gap:8px}
[hidden]{display:none!important}
:focus-visible{outline:3px solid #8fcdff;outline-offset:2px}
#status{min-height:1.5em}
</style>
</head>
<body>
<main>
<h1 id="title">Sign in</h1>
<p id="lead"></p>
<form id="form">
  <label>Your name<input id="name" autocomplete="username" required></label>
  <label id="pw-row">Password<input id="password" type="password" autocomplete="current-password"></label>
  <label id="code-row">Code from your authenticator app<input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>
  <fieldset id="setup" hidden>
    <legend>How people sign in (choose one or more)</legend>
    <label><span><input type="checkbox" id="use-password" checked> Password</span></label>
    <label><span><input type="checkbox" id="use-passkey"> Passkey</span></label>
    <label><span><input type="checkbox" id="use-totp"> Authenticator code</span></label>
    <p id="totp-secret" hidden></p>
  </fieldset>
  <label id="invite-row" hidden>Invitation code<input id="invite"></label>
  <button type="submit" id="go">Sign in</button>
  <button type="button" class="alt" id="toggle-invite">I have an invitation</button>
</form>
<p id="status" role="status" aria-live="polite"></p>
</main>
<script src="/account.js"></script>
</body>
</html>
`;

const ACCOUNT_SCRIPT = `"use strict";
const $ = (id) => document.getElementById(id);
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
let state = { openForOwner: false, policy: ["password"] };
let totpSecret = null;
let inviting = false;
async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
function wants(f) { return creating() ? $("use-" + f).checked : state.policy.includes(f); }
function creating() { return state.openForOwner || inviting; }
function render() {
  $("title").textContent = state.openForOwner ? "Set up this server" : inviting ? "Join this server" : "Sign in";
  $("lead").textContent = state.openForOwner ? "You are the first person here, so you become the owner with full control. Sign-up closes as soon as you finish." : inviting ? "Use the code you were given. You will need: " + state.policy.join(", ") + "." : "This server asks for: " + state.policy.join(", ") + ".";
  $("setup").hidden = !state.openForOwner;
  $("invite-row").hidden = !inviting;
  $("toggle-invite").hidden = state.openForOwner;
  $("pw-row").hidden = !wants("password");
  $("code-row").hidden = !wants("totp");
  $("go").textContent = state.openForOwner ? "Become the owner" : inviting ? "Join" : "Sign in";
  $("password").autocomplete = creating() ? "new-password" : "current-password";
  if (creating() && wants("totp") && !totpSecret) newSecret();
  $("totp-secret").hidden = !(creating() && wants("totp") && totpSecret);
}
async function newSecret() {
  const r = await post("/api/auth/totp/new");
  totpSecret = r.body.secret;
  $("totp-secret").textContent = "Add this key to your authenticator app, then type the code it shows: " + totpSecret;
  $("totp-secret").hidden = false;
}
async function passkeyCreate(name) {
  const c = (await post("/api/auth/passkey/challenge", { name })).body;
  const cred = await navigator.credentials.create({ publicKey: { challenge: unb64(c.challenge), rp: { id: c.rpId, name: c.rpName }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name, displayName: name }, pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -8 }], attestation: "none", authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" } } });
  return { clientDataJSON: b64(cred.response.clientDataJSON), attestationObject: b64(cred.response.attestationObject) };
}
async function passkeyGet(name) {
  const c = (await post("/api/auth/passkey/challenge", { name })).body;
  const cred = await navigator.credentials.get({ publicKey: { challenge: unb64(c.challenge), rpId: c.rpId, allowCredentials: c.allow.map((id) => ({ type: "public-key", id: unb64(id) })), userVerification: "preferred" } });
  return { credentialId: b64(cred.rawId), clientDataJSON: b64(cred.response.clientDataJSON), authenticatorData: b64(cred.response.authenticatorData), signature: b64(cred.response.signature) };
}
$("form").addEventListener("change", render);
$("toggle-invite").addEventListener("click", () => { inviting = !inviting; $("toggle-invite").textContent = inviting ? "Back to sign in" : "I have an invitation"; render(); });
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("go").disabled = true;
  $("status").textContent = "Working…";
  try {
    const name = $("name").value.trim();
    const body = { name };
    if (wants("password")) body.password = $("password").value;
    if (creating()) {
      if (wants("totp")) body.totp = { secret: totpSecret, code: $("code").value };
      if (wants("passkey")) body.passkey = await passkeyCreate(name);
      if (state.openForOwner) body.policy = ["password", "passkey", "totp"].filter((f) => $("use-" + f).checked);
      else body.code = $("invite").value.trim();
    } else {
      if (wants("totp")) body.totpCode = $("code").value;
      if (wants("passkey")) body.passkey = await passkeyGet(name);
    }
    const r = await post(state.openForOwner ? "/api/accounts/setup-owner" : inviting ? "/api/accounts/accept" : "/api/auth/signin", body);
    if (r.body.ok) { location.reload(); return; }
    $("status").textContent = r.body.error || "That did not work.";
  } catch (err) {
    $("status").textContent = "The passkey step was cancelled or failed: " + (err && err.message ? err.message : err);
  } finally {
    $("go").disabled = false;
  }
});
fetch("/api/auth/status").then((r) => r.json()).then((s) => { state = s; render(); });
`;
