# Bug audit

Written alongside the auto-retry work on `claude/auto-retry-reliability-gpnxrj`. The
starting point was one render that died on this:

> Reading run 33666847877 failed: GitHub answered 502. GitHub said: GitHub CLI refused the
> request.

Four waves had already succeeded and the Actions run was still going. That defect is fixed
on this branch. This document is the wider hunt that followed, and **nothing in it is
fixed** - it exists so the fixes can be chosen rather than assumed.

## How much of the app this actually covers

Being precise about this matters more than sounding thorough:

- **Read in full and reasoned about**: `design/packages/app/src/main/cirender/`
  (`sync.ts`, `actions.ts`, `transport.ts`, `gh.ts`, `runTransportGitHub.ts`),
  `design/packages/app/src/main/ghcli/credentialBroker.ts`,
  `design/packages/app/src/main/backup/transferFailure.ts`, and
  `design/packages/ui/src/components/cirender/ciRenders.ts`.
- **Swept mechanically across the whole app and UI**, then sampled by hand to confirm the
  sweep meant what it looked like: duplicated HTTP-status parsers, unbounded and polling
  loops, event listeners and timers without cleanup, keyless `v-for`, and async functions
  that write to a `ref` after an `await` with no generation guard.
- **Not examined**: most of the 76 component directories under
  `design/packages/ui/src/components/`, and most main-process domains
  (`mcserver/`, `awsrender/`, `runtime/`, `worldsource/`, `bluemap/`, `update/` and the
  rest) beyond what the sweeps touched.

So: the confirmed list below is real, and its absence of findings in an area is not
evidence that the area is clean.

## Confirmed - read, understood, and reproducible from the code

### 1. Four surviving copies of the same HTTP-status parser

| File | Line |
|---|---|
| `design/packages/app/src/main/backup/transferFailure.ts` | 74 |
| `design/packages/app/src/main/cirender/transport.ts` | 871 |
| `design/packages/app/src/main/cirender/gh.ts` | 504 |
| `design/packages/app/src/main/ghcli/repositories.ts` | 54 |

All four pull `(HTTP nnn)` out of `gh` stderr, and they have already drifted: `gh.ts` only
matches the parenthesised form, `repositories.ts` also accepts a trailing colon, and the
`transferFailure.ts` copy is the only one paired with a classifier that knows a 403 can be
a rate limit rather than a bad credential. A fifth copy in `credentialBroker.ts` was the
proximate cause of the 502 in the title and is deleted on this branch; these four are the
same defect waiting in four other places.

**Fix**: export the `transferFailure.ts` parser and delete the rest. Low risk, and each
call site already has tests.

**Severity**: medium - it does not break anything today, but it is how the original bug
got written, and it will be how the next one does.

### 2. `runTransportOverGitHub` has no production caller

`design/packages/app/src/main/cirender/runTransportGitHub.ts` adapts the GitHub transport
to the neutral `CiRunTransport` shape, and `awsrender/awsTransport.ts` implements the same
shape - but nothing in the main process drives either through a shared loop. The real
GitHub watch loop is still `sync.ts`'s own. The consequence is that the reliability work on
this branch had to be done in `sync.ts`, and an AWS render does **not** inherit it.

**Fix**: decide whether the neutral shape is the future. If it is, move the watch loop onto
it so both routes get one retry policy; if it is not, delete the adapter rather than leave
a second, subtly different way to read a run.

**Severity**: medium - an architectural fork that quietly doubles the cost of every fix on
this path.

### 3. `ghCliAccountsStore.load()` has no generation guard

`design/packages/ui/src/components/github/ghCliAccountsStore.ts:174`

`load()` writes six refs after its `await` with nothing to say whether it is still the
newest call. Two overlapping loads - a mount-time one and the one `switchAccount()` fires
at line 206 - can settle in either order, so a stale account list can overwrite the fresh
one; and whichever settles first clears `loading.value` in its `finally` while the other is
still in flight, so the spinner disappears early. `switchAccount()`'s `busyKey` guard does
not cover this, because it only stops a second *switch*.

**Fix**: the pattern `ciRenders.ts` already uses - a module-level counter captured at entry
and compared before every write. Perhaps 10 lines.

**Severity**: medium - a wrong account list on screen, in the surface that decides which
credential publishes somebody's world.

### 4. Tests were already failing on `main` before this branch

Established by checking the previous commit's version of the same files out and re-running
the affected suites: **9 failures, none of them caused by this branch** (this branch has 8,
because one of the nine is a flake - see below - and 15 tests were added).

- `cirender/sync.test.ts` - "refuses a world with no project file, and says where one comes
  from". Asserts the message contains "wizard"; the message now says "Create a cloud render
  configuration". A test that was not updated when its message was rewritten - the clearest
  of the set, and a one-line fix.
- `cirender/sync.test.ts` - four cases under "a red run whose first later failure is
  Pages-only".
- `cirender/cloudConfig.test.ts` - "persists the upstream Java engine explicitly for the
  GitHub Actions route".
- `ghcli/accounts.test.ts` - "signs out one exact host/login and proves the account
  disappeared".
- `ui/.../GhCliAccountsList.test.ts` - "puts per-account sign-out behind the destructive
  confirmation".
- `backup/runner.pause.test.ts` - "resuming after a pause during the upload phase skips
  assets already uploaded". **Flaky**: it failed on the baseline run and passed on the
  branch run, from identical code paths. A time-dependent test is worth fixing on its own
  terms, because an intermittent red is worse for trust than a steady one.

Beyond these areas the picture is worse: a full `packages/app packages/ui` run finishes
with **101 failing tests across 32 files** (8990 passing), plus one worker timing out on
`snapshotSaved`. None of that was investigated here.

**Severity**: high - not because each failure is necessarily a real bug, but because a
suite this red stops being a signal, and a suite that is not a signal is how the retry gap
sat unnoticed until it cost somebody a render.

## Fixed on this branch, recorded here for completeness

- `ghcli/credentialBroker.ts` discarded `gh`'s stderr and reported a fabricated 502 for
  every failure it could not classify - the sentence in the title.
- `cirender/sync.ts` had three unprotected `#readRunReport` calls in its follow and resume
  loops; one bad answer failed the whole sync, including waves that had already succeeded.
- Budget exhaustion now leaves the state `dispatched` with its run id rather than `failed`,
  so the run can be picked up again.
- `ui/.../ciRenders.ts` left a stale transfer progress bar on a failed row, and let a
  late-arriving `run` event drag an already-finished or cancelled row back to "running".

## Candidates - flagged by a sweep, NOT confirmed

These are pattern matches that need a person to read before any of them is called a bug.
Listed so the reading has a starting point, not as findings.

Seventeen further stores under `design/packages/ui/src/components/` write to a `ref` after
an `await` with no generation guard, the same shape as finding 3. Most are probably
harmless because their loader is only ever called once; the ones worth reading first are
those with both a `load()` and a mutation that re-loads, since that is the pair that
actually overlaps:

`settings/mapStorageSetting.ts`, `settings/javaSetting.ts`,
`settings/awsAccountsSetting.ts`, `settings/dependencyInstaller.ts`,
`mcserver/serverStore.ts`, `renders/activeRenders.ts`, `world/renderRun.ts`,
`world/containerOffers.ts`, `world/resumeOffers.ts`, `downloads/downloads.ts`,
`locks/lockStore.ts`, `setup/firstRunFlow.ts`.

## Swept and clean

Stated because a negative result is worth as much as a positive one here, and it narrows
where anybody has to look next.

- **Keyless `v-for`**: none. Every `v-for` across every `.vue` file in
  `design/packages/ui/src` carries a `:key` (a line-based grep suggests ~150 violations;
  all are the key sitting on the following line).
- **Listeners and timers**: no component adds an event listener or an interval it fails to
  release. The only two unbalanced `addEventListener` calls are
  `hostedSignIn.ts:164` (a form that lives as long as the page) and `main.ts:112`
  (`beforeunload`, registered `{ once: true }`).
- **Other polling loops**: `pages/hosting.ts:1638` already reads through
  `ghJsonOrNull`, so a transient failure there costs one poll rather than the publication.
  It does not share `cirender`'s defect.

## An open question, not a finding

`design/packages/ui` and `redesign/ui` are two parallel copies of the UI and they have
diverged - `ciRenders.ts` differs between them. Findings 3 and the candidate list were
taken from `design/`. Which copy is canonical, and whether a fix has to be applied twice,
is a decision rather than a bug, and it belongs to whoever owns the rewrite.
