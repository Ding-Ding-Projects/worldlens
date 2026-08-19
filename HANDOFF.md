# Handoff

## Issue #66 — SQL cross-engine evidence record (2026-08-19)

The durable sanitized matrix report is
[`docs/sql-cross-engine-compatibility.report.json`](docs/sql-cross-engine-compatibility.report.json).
It started at `2026-08-19T12:28:28.726Z`, finished at `2026-08-19T12:30:20.049Z`, used seed `1`,
fixture size `64`, `postgres:17.6`, ran for `111323 ms`, exited `0`, and records tested commit
`f3c94d2ff74d007249996850e32b16b96b268ce5`, Node `v24.19.0`, and Java `25.0.4`.

All four direction rows report 1 hires tile, 9/4/4 lowres tiles, 5 metadata records, 1003 map
ids, 1251 grids, and 0 divergences. Direction 1 compares render-state through `diffRenderState`;
direction 2 records the Java HTTP boundary that exposes tiles and metadata only. Every SQLite and
PostgreSQL direction and incompatible-schema probe records target removal and work-root removal.
The report contains relative paths and no credentials.

## Issue #64 restart recovery acceptance — 2026-08-19

Queue persistence now has a genuine two-process proof: one Node process writes a queued task,
exits, and a fresh process restores the same task from `tasks.dat`. Cloud dispatch now persists
its dispatch timestamp and `dispatched` stage before `workflow_dispatch`; after a crash, a fresh
process adopts the matching GitHub run instead of dispatching a duplicate. Recovery surfaces
separately report restored records, offers safe to resume, already-running exclusions, refusals,
dismissals, and an unknown active-state check.

Focused verification passed **5 files / 122 tests**, including 36 CI-sync cases, 4 server queue
persistence cases, and the recovery UI contracts. Packaged standalone-CLI execution remains a
separate delivery boundary; the process-restart and crash-order contracts themselves are now
exercised rather than inferred.

## Issue #60 — public 1.0 compatibility contract

This lane prepares the public delivery records for a Windows-only 1.0 compatibility contract. The
intended boundary covers the desktop application and `@worldlens/cli` public surfaces: CLI names
and exit codes, configuration/project/history schemas, HTTP/SSE and add-on APIs, workflow
inputs/outputs, environment variables, file layouts, exports, backup pointers, update metadata,
and accessibility-visible commands. Public surfaces must be labelled stable, experimental,
internal, or deprecated; stable changes use semantic versioning, and migrations, rollback,
support boundaries, and intentional 1.0 deferrals must be stated plainly.

The delivery channel remains the versioned `1.0.<run>` Windows release channel. The package shape
is Squirrel.Windows with unsigned `Setup.exe`, `RELEASES`, a full `.nupkg`, and deltas where
produced. SmartScreen or the operating system may show an unknown-publisher warning; that is an
expected consequence of the permanent no-signing policy.

The committed build path `build.bat /s` completed successfully after the initial bootstrap blocker
was resolved: `vendor/BlueMap` was not checked out, so the declared vendor/BlueMap submodule was
initialized before the build could complete. The build used Electron runtime `v37.10.3`.

No installer package, release, or remote verification was performed. Tests, lint, reviews, audits,
accessibility checks, and screenshots remained unrun in this lane. The compatibility contract,
public-surface inventory, reference/migration examples, and directly related site/roadmap records
are now present; executable drift-proof and newcomer/runtime acceptance remain separate follow-up
evidence and are not claimed.

## Cloud-render restart and UI verification — 2026-08-19

The desktop app now restores persisted terminal cloud-render states, removes terminal rows only
after the complete confirmation flow, and automatically resumes a persisted dispatched run. Resume
is deduplicated in the main process and cannot upload or dispatch again; thrown failures are written
back as terminal records.

End-to-end evidence is GitHub Actions run
[`32229964127`](https://github.com/Ding-Ding-Projects/worldlens-bayville-example/actions/runs/32229964127),
started through the real app UI against generated disposable world data. It completed successfully,
published `rendered-map` (1,865,207 bytes), and the app verified SHA-256
`354d391bc59bcb428c99a92201d2aca1fdff28c38e2829a0fc695b1c8bf9cdc6`. The stored row is
`rendered`; the map record is under the configured map-storage directory and opened in the real
viewer through the low-level hidden-desktop plan.

Focused verification: 210 cloud-render/UI tests passed, the later narrowed reruns passed 119, 45,
38 and 5 tests respectively, both app and UI typechecks passed, both app and UI builds passed, the
36-action Adult/Kid plan passed, the 27-action terminal-row removal plan passed, the real dispatch
plan created the workflow run, and the final 44-action collection/viewer plan passed.

Open evidence boundaries:

- `scripts/check-screenshot-evidence.mjs` remains red because the 117 broad application captures,
  15 map-dependent captures, and committed 17-image low-level group predate the current UI digest.
  Fresh low-level raw captures exist but were not promoted because the stronger receipt contract is
  not yet emitted by the producer.
- The complete workspace build initially found a missing local `vite` link in
  `@worldlens/md3-check`. `pnpm install --frozen-lockfile` restored the declared workspace link
  without lockfile churn, and the subsequent complete build passed all 16 package builds.
