# Roadmap

## Issue #70 — first-class marker authoring editor

- **Status:** Marker-studio source work is present in the issue-owned checkout; Issue #70 remains
  open and unverified.
- **Record:** [`docs/marker-studio.md`](docs/marker-studio.md) states the current POI boundary and
  the broader acceptance contract.
- **Evidence still open:** marker-set CRUD and duplication, BlueMap POI/line/shape/extrude
  authoring, map-aware drawing, complete style/icon/label controls, unknown-field/order
  preservation, preview-before-save, import/export, local history and undo/restore, VS Code
  handoff, collision/concurrent-file handling, cross-dimension safeguards, and focused
  accessibility, localization, reduced-motion, packaged interaction, and per-type capture proof.
- **Records boundary:** this update ran no tests and took no captures. Do not close Issue #70 from
  source presence alone.

## Issue #72 static map export — open

- **Jer:** `codex/issue-72-static-map-export` in the task-owned checkout.
- **Contract:** self-contained static output with client-side decompression, configurable base
  paths, optional `.nojekyll`, and no external runtime dependency; folder, ZIP, and configurable 7z
  outputs; path safety; portable versioned manifest; checksums, provenance, engine/version and
  settings metadata; exact omissions; filtered and bulk export; progress, cancellation, resume,
  conflict handling, history, and file-manager/Visual Studio Code actions.
- **Evidence boundary:** no records delta is claimed at this checkpoint before the implementation
  lane changes. No tests or captures were run here. Packaged export remains unverified until every
  referenced file is validated, the result opens from a plain static server, and a genuine
  packaged export opens offline in a fresh browser profile. See
  [`docs/static-map-export.md`](docs/static-map-export.md) and Issue #72.

## Issue #74 — local live-player tracking

- **Status:** Source implementation is present in the issue-owned checkout; acceptance remains
  open and runtime is unverified.
- **Implementation boundary:** `localLiveProvider.ts` reads bounded local `playerdata` data and
  can use an explicitly configured RCON endpoint. `MapStorageHandler` and the CLI server expose it
  as an optional source; the BlueMap-compatible empty response remains the safe default when no
  source is configured.
- **Evidence still open:** no tests, real player-data reads, isolated RCON session, packaged
  interaction, or capture was run in this pass. See [`docs/local-live-player-tracking.md`](docs/local-live-player-tracking.md)
  and issue #74 for the acceptance boundary.

## Issue #75 measurement and waypoints — 2026-08-19

- **Status:** Implementation present in the task-owned checkout; acceptance remains open. The
  model covers distance, polyline, horizontal/vertical delta, area, coordinate validation and
  Nether conversion, plus waypoint and measurement persistence, search, import, and export.
- **Evidence boundary:** No tests, packaged interaction, or real capture were run in this records
  pass. The feature is not described as runtime-verified or shipped. See
  [`docs/measurement-and-waypoints.md`](docs/measurement-and-waypoints.md) and issue #75.

## Issue #77 multi-server operations dashboard — 2026-08-19

- **Status:** Implementation is present on the issue-owned checkout; the issue
  remains open pending verification. The dashboard combines local, Docker, and
  remote profiles with health, maps, players, render/update, and last-check data.
- **Contract:** bounded concurrent refresh with backoff/cancellation;
  stale/unknown/partial reporting; search and full regex, filters, grouping,
  pinning, reorder, multi-select, truthful bulk actions, exact-surface teleport,
  persistent layout/appearance, and credential-free local history.
- **Evidence boundary:** no tests, captures, or packaged multi-server interaction
  are claimed. Mixed-route, offline, auth-failure, version-skew, large-inventory,
  restart, accessibility, localization, and compact-width verification remain
  open. See [`docs/multi-server-dashboard.md`](docs/multi-server-dashboard.md) and
  issue #77.

## Issue #83 — BlueMap server-adapter smoke evidence (2026-08-19)

The pinned upstream source is `vendor/BlueMap` `v5.23` at
`4c4cbc291b361ceff6ee239448e9f988f9019dbb`. The exact supported Minecraft
versions and loader/API inputs for Fabric, Forge, NeoForge, Paper, Spigot, and
Sponge are recorded in [`docs/server-adapter-smoke.md`](docs/server-adapter-smoke.md).
Release `v1.0.1233` provides the published jar names and SHA-256 asset record. A
plan-first `tools/server-adapter-smoke/smoke.mjs` contract now enumerates the
required cases and its checked-in source-SHA/version matrix is populated, but no
`--execute` report exists. No server boot, plugin discovery, live
render/update, endpoint, shutdown/restart, negative-case, test, or capture evidence
was produced in this documentation-only update. Issue #83 remains open.

## Issue #84 — remote-hosting navigation and wiring boundary (2026-08-19)

- [x] Commit `8e78a95c` integrates the dedicated browser-style `remoteHosting` tab,
      `RemoteHostingScreen.vue`, corrected catalogue route, and command-palette destination.
- [ ] Supply real saved-target and completed-map pickers, then preserve publish, refresh, progress,
      verification, stop, persistence, search/menu/inventory coverage, and focus-return behavior.
- [ ] Verify publish/refresh/stop from the genuine packaged application against an isolated host
      through the approved headless route, with real host evidence and captures.

This records-only update ran no tests and took no captures. It records source navigation/wiring facts
only; issue #84 remains open until the implementation and packaged isolated-host proof exist.

## Issue #86 — Docker world import against a real daemon

The implementation and source documentation are present for daemon inventory, container and volume
inspection, bind-direct resolution, container-copy, read-only named-volume-copy, additive placement,
and fresh live-world acknowledgement. The 2026-08-19 update is documentation-only. Tests and captures
were unrun in this records-only pass, and no real daemon, throwaway Docker data, packaged application,
or headless capture was exercised. Real container/bind/volume copy, failure and cancellation paths,
ordinary wizard validation, source read-only and destination-safety proof, and packaged-flow capture
remain open. Do not close issue #86 from this record.

## Issue #52 release host and account routing — 2026-08-19

- [x] Route release commands with supported `--repo [HOST/]OWNER/REPO` syntax and never
      pass the unsupported release-level `--hostname` flag.
- [x] Re-read the selected account from the live `gh` inventory, switch it when inactive,
      and verify the effective login before every release mutation.
- [x] Fail closed for missing accounts, refused switches, and identity mismatches, with
      account recovery on the same release surface.
- [x] Record the computer-wide account-switch side effect and leave the selected account
      active after the operation.
- [x] Preserve regression evidence: focused transport, sync, CI-render screen, and
      backup-run-card suites passed **148/148**; app/UI typechecks, build, and lint passed
      in the implementation lane.
- [x] Carry the later central `gh` runner/`runToFile` fixes (`2a3684f6`, `eb2663e1`),
      child-process close handling (`4d511d6c`), and cloud-render restart/recovery
      integration (`f148a538`) in the current Worldlens baseline.
- [ ] Capture the repaired state from the genuine packaged application through the cheap
      headless route. The route is currently unavailable, so the issue stays open and no
      fake bridge capture is accepted as evidence.

## Issue #78 — per-project render engine choice

Implementation and focused verification are complete. Remaining before closure: package both
engines, render the same genuine project through each, and compare output/provenance.

## Issue #65 — standalone CLI mod/resource/SQL parity

Implementation, generated-config parsing, workspace build, SQLite initialization, Docker image,
and external PostgreSQL CLI/readback proof are complete. Docker image `worldlens-cli-issue65:proof`
retained the SQL adapters and verified the deployed resource-extension tree; the real marker run
against throwaway `postgres:17.6` exited `0`, registered `overworld`, and read back six tables, one
map, `bluemap:markers` at 2 bytes, `settings` at 339 bytes, and `textures` at 1,371,129 bytes.
The throwaway container and network were removed after verification.

## Issue #57 — cloud-first project configuration

Implementation and focused verification are complete and integrated. Remaining before closure:
exercise the packaged wizard against a real cloud dispatch and read the result back without a prior
local render.

## Issue #64 delivery boundary — 2026-08-19

- **Delivery inspection:** the issue-owned checkout at `d004f3ca15d7d7a9121df370e00c955072489098`
  contains no packaged executable or installer for the standalone CLI, and no runtime receipt for
  a process restart that reopens `<resolved core.data>/tasks.dat` and resumes queued work.
- **Honest state:** the 3-file, 29-test focused proof covers storage, schema/version refusal,
  malformed and unknown entries, terminal exclusion, atomic staging, coalescing, and CLI
  startup/shutdown wiring. Packaged reachability and real process-restart recovery remain open
  acceptance evidence; issue #64 is not ready to close.

## Issue #87 — GitHub sign-out super confirmation (2026-08-19)

- [ ] Route each app-managed GitHub account sign-out/revocation mutation through the shared native
      anchored two-key/full-slider state machine, with exact host/login, local credential removal,
      attempted remote revocation, active-work effects, Emergency exit/Escape, and focus return.
- [ ] Keep local removal and remote revocation as separate outcomes, with same-surface recovery and
      re-authentication when revocation is refused, unavailable, or times out. The `gh` CLI path
      removes only its local credential and does not attempt remote grant revocation.
- [ ] Run the focused contract cases and capture the genuine packaged gate through the cheap
      headless route. Tests and captures are unrun under ultra-speed mode; issue acceptance stays
      open until those proofs land.

## Current verified baseline

- Adult Mode and Kid Mode complete their first-run and round-trip journeys through the committed
  low-level hidden-desktop UI plan.
- Cloud-render terminal rows survive restart, expose local-only removal through the two-key/full-
  slider confirmation, and never delete GitHub data.
- Dispatched cloud renders resume from their recorded run id without uploading or dispatching a
  second run. Successful artifacts are downloaded, verified, registered and openable in the map
  viewer.

## SQL storage cross-engine proof — issue #66

The TypeScript SQL storages are independently proven against real MySQL, MariaDB, PostgreSQL,
and WASM SQLite. Issue #66's durable sanitized matrix report
[`docs/sql-cross-engine-compatibility.report.json`](docs/sql-cross-engine-compatibility.report.json)
exited `0` after comparing all four PostgreSQL/SQLite directions: each row reports 1 hires tile,
9/4/4 lowres tiles, 5 metadata records, 1003 map ids, 1251 grids, and 0 divergences. Direction 1
compares six render-state records through `diffRenderState`; direction 2 explicitly does not compare
render-state through Java's raw HTTP boundary. The report records tested commit, runtime versions,
relative paths, and `ok=true`, `state=removed`, `workRootRemoved=true` for every direction and
incompatible-schema probe. See [`docs/sql-cross-engine-compatibility.md`](docs/sql-cross-engine-compatibility.md)
for the exact evidence and the remaining factual direction-2 boundary.

## Public 1.0 compatibility contract — issue #60

- **Scope:** Windows-only public compatibility for the desktop application and the standalone
  `@worldlens/cli` delivery surfaces, including CLI names and exit codes, configuration/project/
  history schemas, HTTP/SSE and add-on APIs, workflow inputs/outputs, environment variables, file
  layouts, exports, backup pointers, update metadata, and accessibility-visible commands.
- **Policy:** stable, experimental, internal, and deprecated surfaces are named explicitly;
  stable changes follow semantic versioning; schema migration, rollback, support boundaries, and
  intentional 1.0 deferrals are documented rather than inferred.
- **Delivery facts:** the supported channel is versioned `1.0.<run>` Windows releases packaged
  with Squirrel.Windows. The intended artifacts are unsigned `Setup.exe`, `RELEASES`, a full
  `.nupkg`, and deltas where produced; an unknown-publisher warning is expected.
- **Current state:** `build.bat /s` completed successfully after `vendor/BlueMap` initialization;
  no installer package, release, or remote verification was performed.
- **Remaining evidence:** the public surface inventory, reference/migration examples, and site
  summary are present. Executable drift-proof and newcomer installation/first-render/cloud/offline
  acceptance remain separate follow-up evidence and were intentionally not run in this lane.

## Issue #85 — real SSH flow acceptance boundary (2026-08-19)

- [ ] Run the complete packaged SSH world-source and remote-render matrices against isolated
  disposable Linux and Windows OpenSSH hosts with independently checked fingerprints and
  key-only authentication.
- [ ] Record real command versions, bytes transferred and resumed, durations, hashes, failure
  states, cleanup results, and cheap-headless captures without exposing credentials, host secrets,
  or unrelated workloads.
- [ ] Resolve issue #84 first: remote hosting must be mounted in application navigation with real
  saved-target and completed-map context before the combined publish/refresh/stop path is accepted.

This entry was updated by an ultra-speed records pass that intentionally ran no tests and took no
captures. It records gaps only and does not claim any acceptance row is green.

## Open verification work

- Refresh the 117 broad application captures and 15 map-dependent captures against the current UI
  source digest. Their inventory remains intentionally red until their real harnesses are rerun;
  changing the recorded digest alone is not acceptable evidence.
- Extend the low-level capture producer with the stronger built-artifact, interaction, privacy and
  transaction receipts required by the promotion workflow before replacing published PNGs with new
  raw captures.
