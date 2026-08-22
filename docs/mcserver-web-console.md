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
