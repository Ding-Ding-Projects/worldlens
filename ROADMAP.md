# Roadmap

## Issue #89 — typed banner patterns

- **Status:** Typed ordered layers and focused 5/5 acceptance remain recorded;
  Issue #89 is open pending real-world and packaged proof.
- **Malformed-layer boundary:** The lenient list adapter skips only the malformed
  element after recording one parser diagnostic; later valid layers retain order,
  reader-state failures propagate, and diagnostic history is bounded at 32.
- **Evidence boundary:** This records-only update ran no new tests, builds,
  packaged interactions, or captures. Real NBT worlds, oracle comparison,
  packaged same-world render, restart/reopen, and diagnostic read-back remain open.

### 廣東話同步

Issue #89 嘅 typed ordered layers 同 focused 5/5 acceptance 仍然有 records，
但 real-world 同 packaged proof 未齊，issue 仲係 open。Lenient adapter 只會跳過
壞嗰一層，留一條 parser diagnostic，後面 valid layer 保持次序；reader state
error 繼續 propagate，diagnostics 最多 32 條。今次 records-only update 冇加跑
tests、build、packaged interaction 或 captures；真 NBT、oracle、packaged
same-world render、restart/reopen 同 diagnostic read-back 仲未有。

## CI artifact-only workflow update (2026-08-19)

- **Workflow shape:** `.github/workflows/ci.yml` now retains exactly five jobs: `check` (a separate
  workspace build that uploads no release artifact), `jars` (seven BlueMap jars), `package` (Windows
  installer), `test-world` (generated world and rendered-map artifacts), and `release` (publication).
  `release` depends exactly on `[package, jars, test-world]`; `check` is not a release gate.
- **Removed from this workflow:** the `workflows` lint/static-analysis job, the
  `config-java-roundtrip` test job, the `screenshots` capture job, the `lowlevel-ui-e2e` Windows UI
  job, and the screenshot-evidence step inside `check`.
- **Accepted risk:** this workflow runs no tests, lint, typecheck, static analysis, accessibility,
  or screenshot/capture checks. Those checks remain outside the release graph; a release may ship
  from code whose tests would fail.
- **Evidence boundary:** this records-only pass ran no local validation, build, installer,
  dispatch, packaged-runtime, or capture work. A new remote workflow run and its published release
  remain pending exact read-back of the target commit, assets, timing, line count, unsigned state,
  and public dim-sum code-name link.

### 廣東話 / Cantonese

- **Workflow shape:** `.github/workflows/ci.yml` 而家淨係保留五個 jobs：`check`（獨立 workspace
  build，唔會 upload release artifact）、`jars`（七個 BlueMap jars）、`package`（Windows
  installer）、`test-world`（generated world 同 rendered-map artifacts），同 `release`
  （publication）。`release` 準確依賴 `[package, jars, test-world]`；`check` 唔係 release gate。
- **移走嘅嘢：** `workflows` lint/static-analysis job、`config-java-roundtrip` test job、
  `screenshots` capture job、`lowlevel-ui-e2e` Windows UI job，同 `check` 入面 screenshot-evidence
  step。
- **接受咗嘅風險：** 呢個 workflow 唔跑 tests、lint、typecheck、static analysis、accessibility
  或 screenshot/capture checks。呢啲 checks 留喺 release graph 之外，所以 release 有機會由
  tests 會 fail 嘅 code 發出。
- **Evidence boundary:** 今次 records-only pass 冇做 local validation、build、installer、
  dispatch、packaged-runtime 或 capture。新 remote workflow run 同 published release 仲要逐樣
  read back：target commit、assets、timing、line count、unsigned state 同 public dim-sum
  code-name link。

## Issue #59 — safe product migration source and evidence boundary (2026-08-19)

- **Status:** Source implementation is present; Issue #59 remains open and unverified.
- **Implemented source:** profile-migration JSON writes now use the shared bounded retrying atomic
  replacement helper and clean up their unique temporary file. UI and documentation-site storage
  migration now recognizes the exact legacy `material-bluemap` namespace key plus its hyphen and
  dot forms, without treating longer names as legacy. See
  [`docs/worldlens-migration.md`](docs/worldlens-migration.md).
- **Evidence boundary:** This records update ran no tests, typechecks, builds, installer sessions,
  packaged runtime sessions, or captures. Source presence is not migration acceptance.
- **Still open:** prove old installed identity → bridging release → Worldlens → subsequent Worldlens
  update with retained user state; exercise interrupted migration, collision, downgrade/rollback,
  and uninstall/reinstall on real installed builds; and verify final repository, Pages, wiki,
  documentation, release, installer, redirect, base-path, and public URL continuity from their
  actual public addresses. A redirect alone is not proof.

## Issue #58 — complete render-console history

- **Status:** Source implementation is present; Issue #58 remains open and unverified.
- **Implemented source:** separate retained and visible arrays; injectively encoded per-render
  version-2 segment keys; immutable revisioned 512-line generations; revisioned index;
  temporary-key/read-back/final-key writes; index commit before old-generation cleanup;
  restore-by-render-id; per-line `appendConsoleHistoryLine()` calls; legacy version-1 migration;
  plain-text-first retained-history search with adjacent regex builder; selected/filtered
  TXT/Markdown/JSON/JSONL/CSV/TSV/HTML export; credential-shaped redaction; explicit
  storage/retention warnings; selected-line deletion and current-render prune-all behind
  destructive confirmation.
- **Bounded retention:** 24 renders, 200,000 lines per render and 8 MiB encoded storage. Eviction
  is marked incomplete and warned about; these fixed limits are not user-configurable retention.
- **Metadata surface:** completion, last-saved time, exact evicted-line/render counts and warning
  reason are visible and exported; structured formats carry fields and CSV/TSV use columns.
- **Still open:** multi-render bulk actions, retention configuration, pruning history/restore,
  comprehensive path-sensitive coverage for
  relative paths, other roots, URI-shaped paths and edge cases (common drive/UNC and
  `/Users`/`/home`/`/tmp`/`/var`/`/private` absolute paths are redacted), real interrupted-write
  recovery, navigation/reattach/completed-run reopening, process
  restart, packaged interaction and a genuine capture.
- **Evidence boundary:** this records lane ran no tests, typechecks, builds, packaged interaction or
  captures. Focused proof remains required for v1 migration, segment/index interruption, orphan
  cleanup, bounds, metadata/export, redaction and deletion; packaged proof must restart and reopen a
  completed render. See [`docs/render-console.md`](docs/render-console.md).

## Issue #63 — one verified release row per completed phase

- **Status:** Documentation contract is recorded; Issue #63 remains open.
- **Record:** [`docs/manual-release-ledger.md`](docs/manual-release-ledger.md) describes the
  schema-backed, append-only ledger in `docs/release-ledger.json` and the validator in
  `scripts/manual-release-ledger.mjs`.
- **Evidence boundary:** The task-owned ledger now has six inventory phases: four historical rows
  (releases 682, 704, 708, and 731), the verified build-and-release-only workflow policy row, and
  the failed/no-release completeness-enforcement row. The four historical rows are `failed` with
  `shipped-nonconforming` disposition because those releases copied and attached catalog photos,
  which current policy forbids. The workflow-policy row is verified from remote release read-back
  and does not claim local packaging or runtime evidence. This lane ran
  no tests, builds, installer sessions, workflow dispatches, runtime checks, or captures.
- **Publication note:** The records-only reconciliation commit
  `873eb0eae7c5b9208c3570a15cf81cf9704a29c7` was published as
  [`v1.0.1373`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1373). This
  is the release of the documentation correction, not a seventh implementation phase or a
  replacement release identity for one of the six inventory rows.
- **Remaining:** Keep one row for every completed phase and update the single bundled hand-written
  `docs/release-phase-inventory.json` with each new phase. The packaged reader now rejects an
  incomplete schema-shaped ledger with the missing phase names instead of returning a partial
  readout; missing or malformed inventory is an error, and local-build facts remain separate from
  cloud verdicts. Issue #51's `.613` evidence remains outside this ledger; only the workflow-policy
  row is `verified`; the completeness-enforcement row is not.
- **Packaging boundary:** `electron-builder.config.cjs` copies the ledger and its inventory to
  `resources/release-ledger/`; packaged interaction and restart/reopen proof remain unrun.
- **Failed/no-release boundary:** Commit `4a7aad1eda64b24337de2e50d4dd50fb625167ff` has no
  release. Run `32295874519` completed `jars` and `package`, then cancelled `test-world`, so
  `release` was skipped; companion run `32295860490` also skipped publication. The correction is
  recorded explicitly: only `check` may supersede stale work, while `jars`, `package`,
  `test-world`, and `release` must not cancel earlier commits. `release` has no concurrency group,
  uses `always()`, and publishes unique run-number tags only after successful artifact-producing
  jobs; it does not gate on `check` alone.

## Issue #70 — first-class marker authoring editor

- **Status:** Marker-studio source work is present in the issue-owned checkout; Issue #70 remains
  open and unverified.
- **Record:** [`docs/marker-studio.md`](docs/marker-studio.md) records the four source-supported
  kinds (POI, line, shape, and extrude), bounded geometry, map-scoped CRUD/duplicate, versioned
  import/export, unknown-field/order retention, local persistence, mutation records, and viewer
  layer host.
- **Evidence still open:** marker-set CRUD beyond the fixed studio set, direct map drawing,
  complete style/icon/label controls, user-facing history browsing and undo/restore, VS Code
  handoff, collision/concurrent-file handling,
  cross-dimension safeguards, and focused accessibility, localization, reduced-motion, packaged
  interaction, and per-type capture proof. Live unsaved preview is wired in source and clears on
  cancel/save/map change, but remains unverified in the packaged viewer.
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

## Issue #69 — Docker hosting instance manager — 2026-08-19

- **Status:** The issue-owned checkout contains the Phase G manager, bridge and navigation source;
  Issue #69 remains open pending verification.
- **Current source:** `design/packages/app/src/main/dockerhosting/{manager.ts,ipc.ts,index.ts}`
  owns daemon probing, app-label filtering, exact digest-pinned image inventory, persistent records, digest-pinned create validation,
  named-volume ownership checks, image `ENTRYPOINT`/`CMD` preservation, create verification/rollback,
  separate Create and Start operations, stop/restart, cancellation,
  bounded logs and authorization tokens. The preload bridge, `DockerHostingScreen.vue`,
  `dockerHosting` tab, command-palette catalogue entry and app startup wiring are present.
- **Still required:** prove missing/stopped/refused/unusable/ready daemon states and ownership
  isolation against a real disposable daemon; verify create conflict/rollback, retain the explicit
  transactional-update refusal until a safe recreate plan exists, implement server/map configuration,
  persistent logs/history, complete
  multi-row bulk actions, export and Visual Studio Code handoff; then run packaged interaction and
  headless capture evidence. No tests, daemon, package or captures were run in this records update.
  See [`docs/docker-hosting-manager.md`](docs/docker-hosting-manager.md) and issue #69.

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

## Issue #67 — exact two-wave dispatch record (open, 2026-08-19)

- **Run:** `32292039976` completed Wave 1 and Wave 2 shard work.
- **Wave 1:** **256/256** shards completed.
- **Wave 2:** **105/105** shards completed.
- **Merge groups:** **12/12** completed successfully.
- **Receipt:** setup failed because the configured `actions/setup-node` SHA was invalid.
- **Skipped:** final merge verification, lowres rebuild, Pages publication, and cleanup.

The exact source correction removes one stray `e` from that SHA. That historical run remains a
failed receipt setup and does not provide terminal proof. Issue #67 remains open for the still-
unverified Pages publication and near-limit refusal boundary. This lane ran no tests, captures, build,
or packaged interaction.

The corrected rerun `32299613336` did reach **361/361** shards and **12/12** merge groups, then
failed receipt validation because the downloader fetched only `rendered-map`. A multi-group render
publishes `map-lowres` plus `partial-hires-*`, so the assembled receipt recorded `hiresTileCount=0`
and `metadata=false`. The source repair conditionally downloads `map-lowres` and the partial-hires
artifacts. Its terminal rerun is now [32309098236](https://github.com/Ding-Ding-Projects/worldlens/actions/runs/32309098236):
**361/361** shards, **12/12** merge groups, a successful hosted receipt, `91,809/91,809` hires
tiles, matching metadata, verified textures, `publicResult=openable`, and cleanup with resumable state
preserved. The artifact-only dispatch skipped Pages publication; the receipt proves positive disk fit
and cleanup, not a near-limit refusal test.

廣東話：`32292039976` 完成 Wave 1 **256/256**、Wave 2 **105/105**，同埋 **12/12** 個 merge
groups；receipt setup 因為 `actions/setup-node` SHA 無效而失敗，final merge verification、
lowres、Pages 同 cleanup 跳過。Source 改動只係刪走 SHA 多咗嗰一個 `e`，要 rerun 讀到 receipt
先有 runtime proof；所以而家未算 final map、public result 或 disk boundary。
