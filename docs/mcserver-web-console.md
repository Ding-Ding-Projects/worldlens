# Minecraft server web console

Reaching a server's console, config, plugins and players from an ordinary web browser, not
only from the desktop shell.

## Behaviour

Each Minecraft server can start a small, self-contained HTTP server — built entirely on this
project's own `HttpServer` from `@worldlens/server`, no second HTTP stack — that serves an
authenticated web version of the same four screens the desktop app shows: console, config,
plugins and players. It is started, stopped, bound and password-protected from the panel's
own controls (`webConsoleStart`, `webConsoleStop`, `webConsoleBind`,
`webConsoleSetPassword`, `webConsoleStatus`), which call straight through to
`startWebConsoleServer` in the main process.

Signing in uses a password, checked with scrypt and a `timingSafeEqual` comparison so a
wrong guess takes the same time whether it differs in the first byte or the last. Every
route before authentication renders in ordinary professional English — no project jargon, no
in-house vocabulary — because a stranger opening the sign-in page has no context for either.

### Owner-first accounts, passkeys and authenticator codes

The management site that runs inside the Minecraft server appliance needs more than one shared password, so the sign-in core now has three pieces in `design/packages/app/src/main/mcserver/webconsole/`:

- `accounts.ts`: the first person to register while there are no accounts becomes the **owner** with full administrator rights, and open registration closes in the same step. Everyone else joins with a single-use, expiring invitation (only the owner can invite an admin). The owner chooses whether sign-in needs a password, a passkey, an authenticator code, or any combination; the first owner must set up every factor they choose, and a policy change that would lock anyone out is refused, naming who. Passwords are scrypt verifiers (at least 10 characters); unknown names cost the same work as known ones.
- `totp.ts`: authenticator-app codes (RFC 6238: SHA-1, 30 s, 6 digits), one step of drift, each step accepted once, and the `otpauth://` link for the QR code.
- `passkey.ts`: WebAuthn registration (`none` attestation) and sign-in for ES256 and Ed25519 keys, with node:crypto and a small CBOR reader: checks the ceremony type, one-time challenge, origin, relying party, user presence (and verification when asked), the signature, and that the counter moves forward.

These are tested against the RFC 6238 vectors and real P-256 signatures. They are **not yet wired into the HTTP routes or a sign-in page**, and the appliance that would run this site is not built yet.

### Sessions

A signed-in session is a 32-byte random token handed to the browser as a cookie. Only the
SHA-256 of that token is kept in memory server-side, never the token itself, so a leaked
in-process dump (a heap snapshot, a crash report) cannot hand out a working credential.
Idle timeout (30 minutes by default) and absolute expiry (12 hours by default) are tracked as
two separate clocks: idle timeout forgives a session that is still being used, while absolute
expiry does not, because a session silently renewed by activity for half a day is a session
nobody ever re-authenticated.

### Lockout and the unlock ladder

Repeated wrong passwords are rate-limited by a `LockoutTracker`, and — outside School mode —
a locked-out visitor is offered the same unlock ladder described in the shared house rules:
a dim-sum question, then arithmetic, then whack-a-mole, then simply the clock, each rung
clearing only the wait and never the credential, budgeted so it cannot be used to make brute
force cheaper. Every challenge is generated and graded server-side against a single-use
nonce.

## Configuration

- **Bind address**: loopback (`127.0.0.1`) by default. A non-loopback bind is refused unless
  the caller explicitly says the origin is trusted — the one rule that cannot be relaxed,
  because that is a password crossing a network in the clear.
- **Port**: chosen when the server is started.
- **Password**: set and changed from the panel; never displayed, logged or returned once
  set. Only the hash, salt and scrypt cost parameters are stored, in the operating-system
  credential vault via the same `SafeStorageLike` pattern the toy-lock TOTP secret uses —
  never in a plain application-data file.

## Failure modes

Every route answers with an explicit status and body rather than throwing; a malformed
request, an expired session and a locked-out sign-in attempt are each reported as their own
distinct outcome instead of a generic failure. A bind to a non-loopback host without an
explicit trusted-origin flag is refused before the server ever starts listening, not caught
after the fact.

## Security considerations

- No plain-HTTP password ever crosses a network boundary: the loopback default plus the
  explicit non-loopback refusal is the whole mechanism, and there is no override that
  silently accepts a public bind.
- The password itself is never displayed, hinted at, or characterised by length or
  composition anywhere in the application, matching the project's general secret-handling
  rule.
- The unlock ladder never authenticates a locked-out visitor by itself — winning a round
  clears the wait, never the password — and its per-hour skip budget is what stops it from
  being used to make guessing cheaper.
- Session tokens are never logged, and only their hash is held in memory.

## Verification

- `packages/app/src/main/mcserver/webconsole/password.test.ts`,
  `sessions.test.ts` and `lockout.test.ts` cover hashing and comparison, session creation,
  idle/absolute expiry, and the lockout tracker plus every rung of the unlock ladder,
  including its per-hour skip budget and nonce replay protection.
- `packages/app/src/main/mcserver/webconsole/server.test.ts` covers the HTTP server itself:
  routing, the loopback/non-loopback bind refusal, and the authenticated surface end to end
  against an in-memory transport.
- `packages/ui/src/components/mcserver/WebConsolePanel.vue`'s start/stop/bind/set-password
  controls are covered by the shared mount and bridge contract tests.
- Not yet run: a real browser, on a different machine, signing in to a real running instance
  of this server over a real network connection.

### 擁有者先到先得、passkey 同驗證碼

伺服器 appliance 入面嘅管理網站唔夠一個共用密碼，所以登入核心而家有三部分：`accounts.ts`（冇帳戶時第一個登記嘅人做**擁有者**，有齊管理員權限，開放登記即刻關閉；其他人要用一次性、會過期嘅邀請碼加入，只有擁有者可以邀請 admin；擁有者揀登入要密碼、passkey、驗證碼定任何組合，第一位擁有者要將揀咗嘅全部設定好，改政策會鎖死人就拒絕並講出係邊個）、`totp.ts`（RFC 6238 驗證碼，容許一格時差，每格只收一次，附 QR 用嘅 `otpauth://` 連結）同 `passkey.ts`（WebAuthn 登記同登入，ES256 同 Ed25519，檢查挑戰、來源、網站、有人在場、簽名同計數器向前）。已經用 RFC 測試向量同真 P-256 簽名測過，但**未接上 HTTP 路由同登入頁**，跑呢個網站嘅 appliance 亦未整。
