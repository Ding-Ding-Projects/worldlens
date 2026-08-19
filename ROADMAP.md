# Roadmap

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

## Open verification work

- Refresh the 117 broad application captures and 15 map-dependent captures against the current UI
  source digest. Their inventory remains intentionally red until their real harnesses are rerun;
  changing the recorded digest alone is not acceptable evidence.
- Extend the low-level capture producer with the stronger built-artifact, interaction, privacy and
  transaction receipts required by the promotion workflow before replacing published PNGs with new
  raw captures.
