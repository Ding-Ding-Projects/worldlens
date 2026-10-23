# Worldlens managed workflow integration continuation

Authorized scope: integrate the preserved 2026-10-22/23 implementation branches into one integration branch, finish the wiring the parent checkpoint left open, repair the open navigation and watcher defects, update records and documentation, and deliver the proven result to the default branch. Native Windows acceptance stays a separately recorded gap.

## Integrated source

The integration branch `ai/feature/20261023-managed-workflow-integration` starts at `49d009b5` and merges, in order: managed hosting (`e07fcb4d`), typed configuration and generation coordinator (`68a3b481`), discovered commands and bots (`6d75a45e`), render identity and workspace leases (`28db442d`), map drawing and discovered command controls (`f5da0081`), reviewed managed workflow design references (`1cafc54d`), productive generation configuration and hosting UI (`d3e07691`), and the parent wiring checkpoint (`b7644a5e`). The only merge conflict was this file, which now replaces the seven per-branch checkpoints.

The parent checkpoint failed its continuous integration run (2115) because the managed-host bundle entry `../server/src/annotations/hostEntry.ts` lived only on the hosting branch. After the merge that entry resolves.

## Verification

Recorded in HANDOFF.md under the dated section for this integration. Focused per-branch results remain as recorded in each branch's own checkpoint commit; they do not prove the integrated tree. Only checks actually run on the integrated tree count here.

## Remaining work by area

- Managed hosting: root runtime bundling and acquisition, trusted TLS and host resolution, central registration, actual native/WSL/container deployment, registry sign-in and upload, LAN proof.
- Generation and configuration: downloaded-jar generation, historical and non-vanilla inventory adapters, Bedrock generation and runtime, unknown protected descriptor review, project `serverId` readback review.
- Commands and bots: complex parser families, Java 21/Gradle bootstrap and actual Java compilation, runtime dependency and worker staging, Microsoft public-client configuration, real bot navigation.
- Map workspace: served viewer shell conversion, remaining maintained viewer controls, advanced parser editors, complete localization, conflict-resolution and migration UX, geometry precision, actual terrain and interaction evidence.
- Workflow UI and design references: mounted reference parity, real product behaviour, layout, accessibility and current screenshots.
- Maintained BlueMap source: the viewer checkpoint on `codex/managed-map-chrome-20261022` and its parent gitlink still require preservation review.

## Blocked on the physical Windows host

Exact root `build.bat /s`, native WSL render acceptance, hidden-desktop captures (the twelve planned configuration scenes, the remaining language/theme/size/zoom tuples, the seven stale older image groups), management exit/restart native proof, and the installed-update application. None of these can be produced from a Linux container; the continuous integration Windows installer job supplies packaging proof only.

## Resume

Read HANDOFF.md first. Never claim spawn alone is server readiness, change a custom Java selection, accept another EULA, terminate a WSL distribution, alter host power or login state, or replace historical screenshot digests. Retain every incomplete or ownership-uncertain branch and worktree.
