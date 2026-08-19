# Roadmap

## Issue #78 — per-project render-engine choice and no-JVM default (2026-08-19)

**State: source changes are present; current source/build evidence is unrun.** The project now
stores a canonical per-project render-engine id (`upstream-java` or `typescript`), keeps the
upstream-Java behavior for legacy projects, and lets the global new-project default choose Java
only when its live capability is available. The app-owned TypeScript engine is the no-JVM choice.

The package path stages the TypeScript engine bundle and assets, emits a versioned capability
manifest, and records the staged Java CLI jar's filename, size, and SHA-256 when the jar exists.
Packaged runtime resolution checks that manifest before accepting the Java artifact, and the
project editor receives live Java availability instead of a hardcoded unknown state.

No source/build evidence was run for the current Issue #78 edits in this roadmap update. The
packaged dual-engine proof is still pending: build the real installer, verify both engine assets
and the manifest from the packaged output, and render the same project once through each engine
without silently substituting one for the other.

## Current verified baseline

- Adult Mode and Kid Mode complete their first-run and round-trip journeys through the committed
  low-level hidden-desktop UI plan.
- Cloud-render terminal rows survive restart, expose local-only removal through the two-key/full-
  slider confirmation, and never delete GitHub data.
- Dispatched cloud renders resume from their recorded run id without uploading or dispatching a
  second run. Successful artifacts are downloaded, verified, registered and openable in the map
  viewer.

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
