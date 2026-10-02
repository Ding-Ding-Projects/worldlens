# Worldlens bug audit and Codex repair handoff — 2026-09-04

## Status and scope

**Handoff only: no application fixes are included.** Keep the PR in draft until repairs and verification are complete. Do not merge this report as evidence that the product has been repaired.

Audited repository: `Ding-Ding-Projects/worldlens`.
Audited `main`: `b782521f7d059ec908fee79d316f664d7dfa3353`.
Root tree: `965cdb5760717e820c789accb613afee87ab38b9`.

This is a bounded audit and an executable continuation plan, **not a claim that every bug in the repository has been found**. The repository contains 20 workspace packages plus workflows, scripts and vendored code. Discovery covered that layout, the workspace commands, repository guidance and the open-issue backlog. Detailed source inspection covered the four server HTTP handlers and the existing live-endpoint tests. Local execution covered the unmodified `StaticHandler.ts` and `HttpServer.ts` modules. Other packages have not been exhaustively inspected.

Direct cloning failed in the audit container because `github.com` could not be resolved. Source was read through connected GitHub access. The two standalone modules used for execution were checked against their Git blob IDs before testing:

| File under `design/packages/server/src/http/` | Bytes | Git blob SHA |
| --- | ---: | --- |
| `StaticHandler.ts` | 3,375 | `107d51a6fb4ebb9f490a03f1d9b7a92f6ca495d6` |
| `HttpServer.ts` | 3,163 | `4b08a2c0673a33b2e3dd57e6fa06e0af1948fb96` |

Environment: Linux, Node `v22.16.0`, built-in type stripping, real loopback HTTP and disposable filesystem fixtures. No production server, user world, credential, deployment or release was touched. The full workspace suite, build, typecheck, Windows package and packaged UI were **not run** in this audit.

## Reproduce the confirmed failures

From a checkout containing this PR, using Node >=22.16:

```sh
node --experimental-strip-types --test scripts/audit-worldlens-http-2026-09-04.mjs
```

The script imports the actual repository modules, not rewritten implementations. `WORLDLENS_HTTP_AUDIT_SOURCE` is an optional directory override used only when testing the byte-verified standalone source copies. It is not needed in a checkout. The filename is intentionally opt-in rather than part of the ordinary `*.test.*` inventory while it records known failures.

Two consecutive runs against the audit baseline each returned exit code **1**:

```text
6 tests; 1 passed; 5 failed; 0 skipped; 0 cancelled
PASS  control: an ordinary in-root file is served
FAIL  F1a: encoded parent traversal cannot read a same-prefix sibling
FAIL  F1b: a symlink inside the web root cannot serve an outside file
FAIL  F2: a file disappearing between stat and open does not crash the process
FAIL  F3: disconnecting a download closes its source file
FAIL  F4: close() can terminate an active event-stream response
```

These are **four defects**, with two independent confinement cases for F1, not five separate bugs. The symlink test may explicitly skip on a host that refuses link creation; both link tests ran and failed on this Linux host. These are new audit assertions, not a claim that five existing workspace tests failed.

## F1 — P1: static requests can escape the configured web root

**Evidence:** [StaticHandler.ts:39–50](https://github.com/Ding-Ding-Projects/worldlens/blob/b782521f7d059ec908fee79d316f664d7dfa3353/design/packages/server/src/http/StaticHandler.ts#L39-L50).

The handler decodes a URL pathname, joins and normalizes it, then checks `filePath.startsWith(this.root)`. A string prefix is not a directory boundary. With owned fixture directories `web/` and `web-private/`, the raw path `/%2e%2e%2fweb-private/probe.txt` resolves outside `web/` while still passing the prefix check. Separately, `fsp.stat` follows links without checking the canonical target: `web/escape` pointing to `web-private/` allows `/escape/probe.txt` to escape even without parent segments.

**Observed for both cases:** HTTP 200 and the exact synthetic outside-root marker. This is not an authentication-bypass claim: exposure depends on who can reach the mounted handler, its authentication configuration, filesystem permissions and available outside files/links. No real private file was read.

**Repair acceptance:**

- [ ] Check containment by path components after normalization, not a bare string prefix; account for the root-directory case and Windows separators/drives.
- [ ] Apply containment to the canonical root and final file target, including directory `index.html` resolution and links/junctions. Decide and document link behavior; do not reintroduce an escape through a second lookup.
- [ ] Return a deliberate client error or not-found response without disclosing outside content.
- [ ] Cover encoded separators, sibling prefixes, in-root files, outside symlinks/junctions, normal directories, HEAD and Unicode paths. Preserve authenticated routing.
- [ ] Review the stat/open boundary as well as lexical validation. A canonical-path check alone is not proof against every concurrent link replacement.

## F2 — P2: a static-file read error can terminate the server process

**Evidence:** [StaticHandler.ts:47–52, 68–82](https://github.com/Ding-Ding-Projects/worldlens/blob/b782521f7d059ec908fee79d316f664d7dfa3353/design/packages/server/src/http/StaticHandler.ts#L47-L82).

`createReadStream(filePath)` has no error listener, and the handler awaits only the response's `close` event. A file that disappears after the successful stat produces an unhandled ReadStream `error`; the surrounding asynchronous HTTP dispatch catch does not catch that event.

**Observed:** the isolated child process exited **1**, with `Unhandled 'error' event` and `ENOENT`. The fixture deterministically removes its own file in a response `writeHead` wrapper, between the existing stat and stream open. This is an injected filesystem race, not a claim that a deployed app was crashed.

**Repair acceptance:**

- [ ] Handle open/read failures and settle the request without an uncaught event or process termination.
- [ ] Use lifecycle-aware stream handling; handle errors differently before and after headers are sent, without writing a second status line.
- [ ] Keep the server usable for a subsequent normal request, as the child test requires.
- [ ] Cover missing-after-stat, read refusal/error, client cancellation and partial transfers. Do not install a global exception-swallowing handler as a substitute.

## F3 — P2: cancelled static downloads leave their source file open

**Evidence:** [StaticHandler.ts:80–82](https://github.com/Ding-Ding-Projects/worldlens/blob/b782521f7d059ec908fee79d316f664d7dfa3353/design/packages/server/src/http/StaticHandler.ts#L80-L82).

The response closing resolves `handle`, but the source ReadStream is not destroyed. A client that disconnects after the first bytes can leave the source paused, with an open file descriptor.

**Observed:** after abandoning a transfer from a task-owned 64 MiB sparse file and waiting 200 ms after response close, the actual piped source still had `destroyed=false` and a live numeric file descriptor. The fixture explicitly destroyed it during cleanup. Repeated abandoned downloads can accumulate resources; an exhaustion threshold was not measured.

**Repair acceptance:**

- [ ] Ensure completion, response close, client abort and read errors release the source stream and its descriptor exactly once.
- [ ] Test repeated cancellations and normal full downloads; observe source close/resource release, not only resolution of the handler promise.
- [ ] Repair alongside F2 where sensible, but retain separate regression cases for crash containment and cancellation cleanup.

## F4 — P2: HTTP shutdown waits indefinitely for an active stream

**Evidence:** [HttpServer.ts:85–89](https://github.com/Ding-Ding-Projects/worldlens/blob/b782521f7d059ec908fee79d316f664d7dfa3353/design/packages/server/src/http/HttpServer.ts#L85-L89).

`close()` first awaits the callback from `server.close()` and only then calls `closeAllConnections()`. An active event-stream response prevents that callback from occurring, so the code intended to terminate active connections is unreachable while it is needed.

**Observed:** a connected loopback event stream kept `close()` pending throughout a one-second observation window. It completed only after the fixture explicitly ended/destroyed that stream. The code establishes the circular wait; this was not merely a slow test startup.

The existing [live-endpoint shutdown case](https://github.com/Ding-Ding-Projects/worldlens/blob/b782521f7d059ec908fee79d316f664d7dfa3353/design/packages/server/test/live-endpoints.test.ts#L168-L191) removes the map first. Other test cleanups abort the client before closing the server. Those sequences do not exercise `HttpServer.close()` with a still-active response. Callers that already drain all handlers are not asserted to hang.

**Repair acceptance:**

- [ ] Define bounded shutdown: stop accepting new connections, then terminate/drain active responses with an explicit policy before awaiting a callback they can indefinitely block.
- [ ] Verify active SSE and active static/proxy transfers, no-client shutdown and listener/timer cleanup.
- [ ] Inspect real app/CLI/hosted call order so resources owned by other handlers are also stopped.
- [ ] The harness uses one second as a diagnostic deadline. A deliberately documented graceful deadline may require adjusting the test, but not removing the active-stream assertion or accepting indefinite waiting.

## Additional source-review lead — validate before counting as reproduced

[RenderUpdateHandler.ts](https://github.com/Ding-Ding-Projects/worldlens/blob/b782521f7d059ec908fee79d316f664d7dfa3353/design/packages/server/src/http/RenderUpdateHandler.ts) validates `forceParam` using `forceParam in FORCE_STRATEGIES`, where the allowlist is a normal object. Inherited names such as `constructor`, `toString` and `__proto__` therefore pass this membership check even though only `force_all`, `force_edge` and `force_none` are configured. The value is subsequently passed to `triggerUpdate`.

Add a handler-level regression asserting HTTP 400 and **no driver call** for inherited names, then use an own-property/Map-based allowlist if confirmed. The downstream render effect was not executed here; this lead is not included in the four runtime-reproduced defects. Do not describe it as prototype pollution: the observed code reads an inherited property rather than mutating a prototype.

## Reported product defects to revalidate next

These existing issues were open when read. They were **not independently reproduced in this audit**. Read their latest comments and the current implementation before making a new diagnosis or duplicating a repair.

### Priority: #175 together with #171 — renderer crash and capture-session failure

[#175](https://github.com/Ding-Ding-Projects/worldlens/issues/175) reports a packaged renderer crash while clicking `.mb-config-screen__search [aria-label="Open the regex builder"]`. Its [later comment](https://github.com/Ding-Ding-Projects/worldlens/issues/175#issuecomment-5530488898) disputes the attribution to the builder and proposes cumulative session state as an alternative. Neither explanation is proven by this audit.

Run the action first in a fresh packaged app with tracing off, then repeat in the full accumulated capture sequence. Record renderer termination reason, memory and the first actual failure. Check the regex evaluator, overlay lifecycle and session cleanup only against evidence. A match-count or outer-loop time budget is not by itself proof that a single synchronous regex evaluation is interruptible. Do not fix the downstream CDP timeout while leaving an earlier crash untouched; equally, do not declare the builder guilty from the selector at the moment of failure.

### Priority: #176 — watcher liveness and silent stale maps

[#176](https://github.com/Ding-Ding-Projects/worldlens/issues/176) reports a polling watcher that produces no events despite repeated writes on Windows/Node 26.4.0. The issue distinguishes that failure from a normal missed poll and records that native watching can abort the process on affected Windows runtimes.

Reproduce with real region-file changes; prove initialization/liveness, expose failure, and implement bounded recovery where reliable. Do not infer failure from a genuinely quiet folder alone. Retain the platform polling safeguard and existing real-watcher coverage; sleeps and replacing all real watchers with scripted fakes are not repairs.

### Priority: #166 — completed renders missing from catalogue/notifications

[#166](https://github.com/Ding-Ding-Projects/worldlens/issues/166) and its [in-progress comment](https://github.com/Ding-Ding-Projects/worldlens/issues/166#issuecomment-5391364778) report successful durable render output that is not promoted into the app's finished-map surfaces. The comment names an earlier working branch; inspect current state and coordinate rather than overwrite unrelated work.

Trace terminal receipts through registration, notification and UI refresh. Require idempotent promotion and restart reconciliation, one map/notification per completed render, rejection of failed/cancelled/partial output, and a real Open map action. Test restart boundaries and verify a packaged render against a task-owned world copy.

## Backlog triage — not every open issue is an unfixed code bug

The open-issue search also exposed these groups. This classification is a starting point based on issue descriptions, not a current-source verdict for each feature:

| Group | Existing references | Codex treatment |
| --- | --- | --- |
| Capture/evidence integrity | #172, #160, #170, #144 | Revalidate command-to-target provenance and hosted harness coverage; repair crashes first, then recapture from a frozen built tree. Never advance evidence digests without new evidence. |
| User-flow gaps or partially repaired work | #57, #58, #84, #87, #52, #164 | Check current code and latest comments. In particular, #52's routing implementation checklist is already checked; its remaining item is packaged proof, not a reason to reapply the old fix. |
| Compatibility/model completeness | #59, #78, #89 | Separate implemented compatibility paths from missing fixtures, runtime proof or actual current defects. Preserve existing project data and unknown fields. |
| Runtime/scale verification | #67, #79, #82, #83, #85, #86 | These need real environments/artifacts. Missing proof is not proof of a bug; report blocked verification explicitly. |
| Feature programs | #69, #70, #71, #72, #73, #74, #75, #76, #77, #80, #148, #149 | Determine what already exists. Do not turn this repair PR into unbounded feature implementation merely because an old issue remains open. |
| Historical coordination/operations | #174, #62, #63 | #174's 96 failing tests belong to an older commit, not this baseline. #62 cleanup and #63 release publication are not authorization for branch deletion or releases in this task. |

All issue references above belong to this repository. The README explicitly documents that current release publication does not gate on the full local test suite. That is an acknowledged policy, not a new bug identified by this audit. Do not silently change release policy while repairing these findings.

## Continue the repository-wide audit

Record each area as reviewed/tested/blocked with commands, commit and findings. No unchecked area should be described as clean.

- [ ] `server`, `bridge`, `cli`: finish handler review, authentication/session boundaries, request validation, proxy cancellation, SSE lifecycle and real shutdown callers. Port the confirmed reproductions into the normal Vitest suite.
- [ ] `app`, `ui`, `design-system`, `viewer`: IPC authorization, renderer/navigation lifecycle, regex behavior, render completion/restart reconciliation, resource disposal and current reported crashes.
- [ ] `engine`, `nbt`, `config`, `shared`, `worldgen`: malformed/oversized world data, integer/coordinate boundaries, serialization/migration, resource-pack parsing and upstream fidelity. Read the pinned upstream before changing ported behavior; document intentional security deviations.
- [ ] `parts`, `chunker`, `render-actions`: archive path containment, manifest/hash checks, interrupted upload/rejoin, resume, shard gaps/overlaps, ordering and partial-output refusal.
- [ ] `dockhand`, `wharf`: subprocess/SSH boundaries, host trust, cancellation, ownership labels, adoption/cleanup and state after disconnect. Use isolated task-owned hosts only when actually available and authorized.
- [ ] `site`, `kid-check`, `md3-check`: hosted sign-in/navigation, accessibility/localization checks, evidence provenance and build/runtime asset consistency.
- [ ] Root `scripts`, `.github/workflows`, `tools`, `vendor`: bootstrap/archive failure paths, workflow input validation, cancellation/cleanup, build provenance and applicable vendor advisories. Do not infer that a package is safe from a passing static check alone.

## Codex execution and completion contract

Start with F1–F4, then validate the force-strategy lead and the three reported product defects. Add tests before repairs and keep changes scoped. Rebase or merge updated `main` normally if needed; do not force-push or touch unrelated branches, worktrees, worlds, accounts or deployments.

Use the pinned workspace package manager (`pnpm@10.33.0` at this baseline). Establish dependencies using the repository's documented bootstrap; initialize declared submodules when required for builds. Then record the actual result of each command rather than inheriting an earlier session's status:

```sh
# Repository root: targeted reproduction, red before fixes and green after fixes.
node --experimental-strip-types --test scripts/audit-worldlens-http-2026-09-04.mjs

# Workspace: dependency install once, followed by independent verification commands.
cd design
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm workflows:check
pnpm workflows:drift
pnpm webapp:parity
pnpm screenshots:check
pnpm published-text:check
```

Run commands independently so a first failure does not hide the remaining baseline. Preserve logs and distinguish pre-existing failures from regressions. UI fixes also require the documented Windows packaged/headless proof; do not fabricate screenshots or substitute a mock bridge for real runtime evidence. Where an external prerequisite is unavailable, name it and leave the associated acceptance item open.

- [ ] F1–F4 reproduced against the repair checkout, repaired, and verified with permanent regression coverage.
- [ ] Force-strategy lead validated or rejected with a concrete test.
- [ ] #175/#171, #176 and #166 revalidated with current evidence; fixes or explicit remaining blockers recorded.
- [ ] Remaining audit areas have an honest coverage/result ledger, not an unsupported “all bugs fixed” claim.
- [ ] Final diff contains no secrets, fixture leftovers, unrelated edits, test disabling or unauthorized policy changes.
- [ ] PR reports exact commit, commands/results, affected behavior, remaining risks and runtime evidence boundaries. Do not close existing issues before their own acceptance criteria are satisfied. Do not merge automatically.
