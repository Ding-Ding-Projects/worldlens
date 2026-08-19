# Handoff

## Issue #84 — remote-hosting navigation and wiring records (2026-08-19)

The main/preload `hosting:*` bridge is present, and the panel retains publish, refresh, verification,
progress, and super-confirmed stop behavior. During this records pass, a sibling lane added an
uncommitted candidate `RemoteHostingScreen.vue`/`remoteHosting` tab with saved-target and
completed-render selection. That candidate is not tested, packaged, captured, or accepted evidence.
The catalogue entry `share.publishing.remote-hosting` still targets the Pages job with
`reveal: "remote-hosting"`, so a dedicated command-palette destination is not yet proven.

This records-only lane intentionally ran no tests and took no captures. No implementation, packaged
application interaction, isolated-host publish/refresh/stop, merge, push, or cleanup was performed.
Issue #84 remains open until the navigation/wiring work and genuine packaged isolated-host proof are
available.

## Issue #85 — SSH world, remote render, and remote hosting records (2026-08-19)

This records-only pass preserves issue #85 as open and unverified. The three feature documents
now state the exact missing evidence: an isolated disposable Linux OpenSSH host and an isolated
disposable Windows OpenSSH host, independently verified fingerprints, key-only authentication,
world browse/survey/diff/fetch/cancel, `rsync` and `scp` fallback or resume behavior, remote
render upload/launch/progress/reattach/collect/cancel, remote hosting publish/refresh/stop, and
redacted logs and captures. No real-host command output, transfer measurements, hashes, or
packaged captures were produced in this pass.

Remote hosting has an explicit dependency on issue #84: its panel is not yet mounted in the
application’s discoverable tab navigation with real saved-target and completed-map context. The
combined issue must not be closed until that dependency and its packaged acceptance evidence are
resolved.

The records-only pass deliberately skipped tests and captures. That is a process boundary, not a
verification result; the existing fake-host tests and built-panel evidence retain their prior
status. No implementation, test, capture, merge, push, or cleanup was performed in this lane.

## Issue #86 Docker world import — 2026-08-19 records-only update

The current checkout contains the Docker world-import implementation and its documented local IPC
surface: daemon state, container/volume listing and inspection, bind-direct resolution,
container-copy, read-only named-volume-copy, additive placement, cancellation plumbing, and the
fresh per-fetch live-world acknowledgement. The implementation documentation is
[`docs/docker-world-source.md`](docs/docker-world-source.md).

This pass changed records only. Tests and captures were unrun in this records-only pass; no real
Docker daemon, throwaway container, bind mount, named volume, packaged application, or headless
capture was exercised. Consequently there is no new runtime/package evidence and issue #86 remains
open. The next owner must obtain real daemon and packaged-flow receipts before claiming acceptance
or closure.

## Issue #52 release host and account routing — 2026-08-19

The release transport repair is present on the current default branch through
`f4a3b6c9`, with the handoff and roadmap records from `c6093b39` and the generated
changelog refresh from `215307ac`. `gh release create` and `gh release upload` now receive
the supported `[HOST/]OWNER/REPO` target through `--repo`; they never receive the
unsupported release-level `--hostname` flag. Before each release read, create, or upload,
the selected signed-in account is re-read from the live `gh` inventory, switched when
necessary, and verified with `gh api --hostname HOST user --jq .login`. Missing accounts,
refused switches, and identity mismatches stop before release mutation and expose the
same-surface account recovery action.

The focused transport, sync, CI-render screen, and backup-run-card suites passed **148/148**;
app and UI typechecks, workspace build, and lint passed in the original repair lane. The
tests use fake process boundaries and did not create a repository, upload release data, or
run the original multi-gigabyte backup again. A genuine fixed-state packaged-app capture
remains open because the required cheap headless route is unavailable; a bridge-injected
image would not prove the repaired runtime seam. Issue #52 therefore remains open until
that capture evidence exists.

The current Worldlens baseline also carries the central `gh` process runner and `runToFile`
boundary (`2a3684f6`, `eb2663e1`), child-process close handling (`4d511d6c`), and cloud-render
restart/recovery integration (`f148a538`). The current CI run for `ac46de28` is
`32257677190` and remains in progress; it is not a completed verdict.

## Issue #87 — GitHub sign-out and token revocation record (2026-08-19)

The records lane updated [`docs/super-confirmation.md`](docs/super-confirmation.md) with the
acceptance contract for putting GitHub sign-out and attempted grant revocation behind the shared
native two-key/full-slider gate. The record distinguishes local credential removal from remote
revocation refusal, timeout, or unsupported-host outcomes and limits the inventory to mutations the
app actually performs. The `gh` CLI path is local-only: it removes the credential from the CLI
store and does not attempt remote grant revocation.

This is documentation-only evidence. Tests and captures were unrun under ultra-speed mode, and no
packaged-artifact interaction proof exists in this lane. Acceptance remains open until the
implementation supplies the runtime behavior and genuine packaged capture required by issue #87.

## Issue #78 per-project render engine choice — 2026-08-19

Projects persist canonical `typescript` or `upstream-java` intent. New projects default to the
no-JVM TypeScript route; legacy files migrate to Java behavior. Local desktop rendering has a real
TypeScript launch adapter, resume/provenance carry the engine, and explicit choices never silently
fall back. The relevant workspace build and focused render/project/settings suites pass. Packaged
same-project comparison across both engines remains the final issue-specific acceptance step.

## Issue #65 standalone CLI parity — 2026-08-19

The standalone CLI now uses upstream resource precedence, scans direct mod jars, resolves
`resourceExtensions` in checkout/package/Docker layouts, and selects SQLite, MySQL/MariaDB, or
PostgreSQL without silent file-storage fallback. Generated SQL config parses with zero provisional
warnings. Focused config/storage verification passed 17 tests and the CLI workspace build passed.

Final acceptance evidence is recorded: Docker image `worldlens-cli-issue65:proof` built with
`mysql2`, `pg`, and `sql.js`; a real sql.js WASM query ran; the deployed resource-extension tree
was verified; and the no-action Docker CLI bootstrap exited `1` with zero SQL-field warnings. A
real CLI marker run against throwaway `postgres:17.6` exited `0`, loaded client resources, selected
the packaged resource-extension asset with SHA-256 prefix `e6069b…`, and registered `overworld`.
Readback found six tables, one map, and item payloads of 2 bytes for `bluemap:markers`, 339 bytes
for `settings`, and 1,371,129 bytes for `textures`. The throwaway database container and network
were removed after verification.

## Issue #57 cloud-first configuration — 2026-08-19

The desktop now creates a complete `worldlens.project.json` for cloud rendering before any local
render. The guided UI uses the main-process validation, atomic save and local history path, exposes
bounded cancellation, and returns to the existing preflight with the account/repository/world
request preserved. The app workspace build passed and the focused contract passed 4 files / 134
tests. A real hosted dispatch from this new wizard remains the final issue-specific acceptance step.

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
