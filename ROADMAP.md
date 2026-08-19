# Roadmap

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
