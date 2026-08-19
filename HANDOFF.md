# Handoff

## CI artifact-only workflow update (2026-08-19)

The visible workflow diff reduces `.github/workflows/ci.yml` to five retained jobs: `check` is a
separate workspace build that uploads no release artifact; `jars` builds the seven BlueMap jars;
`package` produces the Windows installer; `test-world` produces the generated world and
rendered-map artifacts; and `release` publishes from the three artifact-producing inputs. The
release dependency graph is exactly `[package, jars, test-world]`; `check` is not a release gate.

The workflow-lint/static-analysis job (`workflows`), the real-Java configuration round-trip test
job (`config-java-roundtrip`), the screenshot capture job (`screenshots`), and the Windows Lowlevel
UI end-to-end job (`lowlevel-ui-e2e`) were removed. The screenshot-evidence step was also removed
from `check`. The workflow now runs no tests, lint, typecheck, static analysis, accessibility
checks, or screenshot/capture checks. This is an accepted delivery tradeoff: a release may ship
from code whose tests would fail, and those checks are separate local work rather than release
conditions.

This records update ran no tests, lint, typechecks, builds, installer sessions, workflow
dispatches, packaged runtime sessions, or captures. No new release has been verified for this
workflow change. Pending evidence is a real remote workflow run plus release read-back proving the
target commit, unique non-draft release, installer and jar/world assets, timing, line-count
record, unsigned-artifact state, and the public dim-sum code-name link.

### 廣東話 / Cantonese

今次見到嘅 workflow diff 將 `.github/workflows/ci.yml` 收窄到五個保留 jobs：`check` 係獨立
workspace build，唔會 upload release artifact；`jars` build 七個 BlueMap jars；`package` 產生
Windows installer；`test-world` 產生 generated world 同 rendered-map artifacts；`release` 就
由三個產物 inputs 發布 release。Release dependency graph 準確係
`[package, jars, test-world]`；`check` 唔係 release gate。

Workflow lint/static-analysis job（`workflows`）、real-Java config round-trip test job
（`config-java-roundtrip`）、screenshot capture job（`screenshots`）同 Windows Lowlevel UI
end-to-end job（`lowlevel-ui-e2e`）已移除，`check` 入面嘅 screenshot-evidence step 都移走。依家
workflow 唔跑 tests、lint、typecheck、static analysis、accessibility checks 或
screenshot/capture checks。呢個係已接受嘅 delivery tradeoff：release 有機會由一份 tests 會
fail 嘅 code 出發，而呢啲 checks 係 workflow 之外嘅 local work，唔再係 release 條件。

今次 records update 冇跑 tests、lint、typechecks、builds、installer sessions、workflow
dispatches、packaged runtime sessions 或 captures。仲未有新 release 俾呢個 workflow change
驗證。仲欠嘅 evidence 係真 remote workflow run 同 release read-back：target commit、唯一
non-draft release、installer 同 jar/world assets、timing、line-count record、unsigned-artifact
state，同 public dim-sum code-name link 都要逐樣證實。

## Issue #59 — safe product migration source and evidence boundary (2026-08-19)

Issue #59 remains **open and unverified**. The current source contains two focused compatibility
fixes: profile-migration JSON writes use the shared bounded retrying atomic replacement helper and
clean up their unique temporary file, while UI and documentation-site storage migration accepts
the exact legacy `material-bluemap` namespace key plus its hyphen and dot forms without accepting
longer names. The implementation records are in
[`design/packages/app/src/main/migration/profileMigration.ts`](design/packages/app/src/main/migration/profileMigration.ts),
[`design/packages/ui/src/legacyStorageMigration.ts`](design/packages/ui/src/legacyStorageMigration.ts),
and [`design/packages/site/src/legacyStorageMigration.ts`](design/packages/site/src/legacyStorageMigration.ts).

This records update ran no tests, typechecks, builds, installer sessions, packaged runtime
sessions, or captures. It therefore claims source implementation only, not migration acceptance.
The broader evidence still required is an installed old identity → bridging release → Worldlens →
next Worldlens update with retained settings, projects, histories, caches, credential references,
and update state; interrupted migration, collision, downgrade/rollback, and uninstall/reinstall
against real installed builds; and final repository, Pages, wiki, documentation, release,
installer, redirect, base-path, and other public-URL read-back. A redirect alone is not proof.

### 廣東話 / Cantonese

Issue #59 仲係 **open，未驗證**。而家 source 有兩個針對性兼容修正：profile migration 嘅
JSON 寫入用共用、有界重試嘅 atomic replacement helper，並且清走每次獨有嘅 temporary file；
UI 同 documentation-site storage migration 就接受準確嘅 legacy `material-bluemap` namespace
key，同埋 hyphen、dot 形式，但唔接受更長嘅名稱。Implementation record 喺
[`design/packages/app/src/main/migration/profileMigration.ts`](design/packages/app/src/main/migration/profileMigration.ts)、
[`design/packages/ui/src/legacyStorageMigration.ts`](design/packages/ui/src/legacyStorageMigration.ts)
同 [`design/packages/site/src/legacyStorageMigration.ts`](design/packages/site/src/legacyStorageMigration.ts)。

今次 records update 冇跑 tests、typechecks、build、installer session、packaged runtime session
或 captures，所以只記 source implementation，唔係 migration acceptance。仲要補嘅 evidence 係：
舊 identity installed build → bridging release → Worldlens → 下一個 Worldlens update，同時
保留 settings、projects、histories、caches、credential references 同 update state；喺真
installed builds 度行 interrupted migration、collision、downgrade/rollback 同
uninstall/reinstall；以及喺真正 public URL 度 read back repository、Pages、wiki、documentation、
release、installer、redirect、base-path 同其他 public-link continuity。淨係 redirect 唔算 proof。

## Issue #58 — render-console history source boundary (2026-08-19)

Issue #58 remains **open and unverified**. The current source adds a render-id-keyed version-1
`localStorage` envelope, a retained line array separate from the 10,000-line visible ring,
temporary-key/read-back/final-key persistence, restore-by-render-id wiring, retained-array search,
selection-aware copy/export in TXT/Markdown/JSON/JSONL/CSV/TSV/HTML, token-shaped redaction,
explicit storage/retention warnings, selected-line deletion, and current-render prune-all through
destructive confirmation.
The direct feature record is [`docs/render-console.md`](docs/render-console.md).

The render path now calls `appendConsoleHistoryLine()` for each line. Version-2 uses injectively
encoded per-render keys, immutable revisioned generations of 512-line segments and a revisioned
index. An append updates only the active partial segment or adds the next segment, commits the index,
then removes superseded generations. Legacy version-1 envelopes migrate to bounded segments with the
new index committed before the old key is removed. Evicted and cleared segments are also removed only
after the authoritative index update.

The implementation is deliberately bounded: 24 renders, 200,000 lines per record and an 8 MiB
encoded envelope. Eviction marks a record incomplete and reports a warning. Those fixed limits are
not a user retention surface. Multi-render bulk export/delete, retention configuration, pruning
history/restore remain open. Completion, last-saved time, exact evicted-line/render counts and the
storage-warning reason reach the mounted console and every export family; structured exports carry
fields and CSV/TSV use dedicated columns. The source
redacts drive-letter and UNC absolute paths plus `/Users`, `/home`, `/tmp`, `/var` and `/private`
roots; relative paths, other roots, URI-shaped paths and edge cases still need comprehensive
path-sensitive coverage. The source has not been exercised through a real
process restart, completed-run reopening or interrupted-write recovery.

This records lane ran no tests, typechecks, builds, packaged interaction, runtime sessions or
captures. Do not treat source presence, existing test files or the branch being aligned with main
as verification. Closure requires focused storage/surface verification plus a genuine packaged
restart that reopens a completed render and searches/exports a line outside the visible ring.

### 廣東話 / Cantonese

Issue #58 仲係 **open，未驗證**。而家 source 有 render-id-keyed version-1 `localStorage`
envelope、同 10,000-line visible ring 分開嘅 retained array、temporary-key/read-back/final-key
persistence、按 render id restore、完整 retained-array search、selection-aware
TXT/Markdown/JSON/JSONL/CSV/TSV/HTML export、token-shaped redaction、storage/retention warning，
同經 destructive confirmation 嘅 selected-line delete/current-render prune-all；文檔係
[`docs/render-console.md`](docs/render-console.md)。

Render path 每行會 call `appendConsoleHistoryLine()`。Version-2 用 injective encoded per-render
keys、immutable revisioned 512-line segment generations 同 revisioned index。Append 只 update
active partial segment 或加 next segment，先 commit index，再清 superseded generation。Legacy
version-1 envelope 會 migrate 做 bounded segments，新 index commit 後先移除舊 key；evicted 同
cleared segments 都係 authoritative index update 後先清。

Implementation 固定最多 24 renders、每個 record 200,000 lines、encoded envelope 8 MiB；
eviction 會標 incomplete 同出 warning，但呢個唔係 user retention surface。Multi-render
bulk export/delete、retention config、pruning history/restore 仲係 open。Completion、last-saved
time、exact evicted-line/render counts 同 storage-warning reason 已經去到 mounted console 同每種
export；structured formats 有 fields，CSV/TSV 有 dedicated columns。Source 會 redact drive-letter、UNC，同
`/Users`、`/home`、`/tmp`、`/var`、`/private` absolute paths；relative paths、其他 roots、
URI-shaped paths 同 edge cases 仲欠 comprehensive path-sensitive coverage。真 process restart、
completed-run reopening、interrupted-write recovery 都仲係 open。今次冇跑 tests、typecheck、
build、packaged interaction、runtime 或 captures，唔可以由 source presence 當驗證完成。

## Issue #141 — personal vocabulary upload compatibility records (2026-08-19)

Issue #141 remains **open and unverified**. The public feature record is
[`docs/personal-vocabulary.md`](docs/personal-vocabulary.md). It defines the local JSON upload,
the versioned neutral contract, fail-closed validation, replacement boundary, persistence and
privacy rules without copying any private vocabulary values into the product.

This is a documentation-only handoff on `codex/issue-141-vocabulary-upload`. It records the
acceptance boundary but does not claim implementation or packaged-runtime proof. No tests,
builds, installer runs, runtime sessions, screenshots, or captures were performed in this lane;
no commit or push is claimed here. Before Issue #141 can close, the next owner must verify the
real built artifact for empty, valid, invalid, over-limit, replace, clear/reset, persistence,
cache-corruption, no-network, export/log redaction, and accessible-name states, while retaining
the evidence boundary that excludes vocabulary values, source paths, and payloads.

### 廣東話 / Cantonese

Issue #141 仲係 **open，未驗證**。Public feature record 係
[`docs/personal-vocabulary.md`](docs/personal-vocabulary.md)，入面寫清楚 local JSON upload、
versioned neutral contract、fail-closed validation、replacement、persistence 同 privacy，亦
唔會將任何私人詞彙 value 放入 product。

呢次係 `codex/issue-141-vocabulary-upload` 嘅 documentation-only handoff，只記 acceptance
boundary，唔係 implementation 或 packaged runtime proof。今次冇 tests、builds、installer、
runtime sessions、screenshots 或 captures，亦冇 commit 或 push。下一位 owner 要喺真正 built
artifact 驗 empty、valid、invalid、over-limit、replace、clear/reset、persistence、cache
corruption、no-network、export/log redaction 同 accessible-name states，同時保留唔記錄
vocabulary values、source paths、payloads 嘅 evidence boundary。

## Issue #63 manual release ledger — records-only documentation boundary (2026-08-19)

Issue #63 remains **open**. The feature record is
[`docs/manual-release-ledger.md`](docs/manual-release-ledger.md), backed by the
versioned `docs/release-ledger.json` schema and its validator
[`scripts/manual-release-ledger.mjs`](scripts/manual-release-ledger.mjs).

The article documents the one-row-per-phase contract: exact integrated
default-branch SHA, unique non-draft release identity, workflow or manual build
receipt, UTC timing, asset names and SHA-256 values, Squirrel/archive evidence,
line-count and attribution provenance, public bilingual code name, and factual
`running`/`failed`/`verified` state. A local build never becomes a cloud verdict,
and a failed phase records no release identity. The ledger's hand-written integrated-phase
inventory is the completeness boundary. The packaged reader and command-line validator read the
same bounded hand-written `docs/release-phase-inventory.json`; the reader rejects a schema-shaped
user-data ledger that omits an inventoried phase, reporting the missing names instead of returning
a partial readout. A malformed or missing read-only inventory is an error; user-data may override
the ledger but never the completeness list. Adding a completed phase requires updating the
inventory and ledger together.

The packaging configuration copies both records into the stable
`resources/release-ledger/` location, and the reader checks that packaged location before its
development-checkout fallbacks. Packaged interaction, restart/reopen, and installer proof remain
unrun in this lane.

The populated task-owned ledger contains four historical rows (releases 682,
704, 708, and 731) plus the verified build-and-release-only workflow policy row. Each historical row has complete release/target/workflow/timing/asset/hash
read-back but is intentionally `failed` with `shipped-nonconforming` disposition,
because the release copied and attached a dim-sum photo. Current policy requires
linking to the public catalog photo without copying or attaching it. The workflow-policy row is
verified from its remote release read-back, while no local packaging or runtime verdict is
claimed; issue #51's `.613` evidence remains outside this ledger.

The later `4a7aad1e` phase attempt is recorded as failed with no release identity. CI run
`32295874519` (`2026-08-19T19:57:25Z` → `2026-08-19T20:09:48Z`) completed `jars` and the Windows
package, then cancelled `Generate and render a test world`; `Publish release` was skipped. A
companion run for the same SHA (`32295860490`) also skipped publication, so no release was created.
The workflow correction is explicit: `jars`, `package`, `test-world`, and `release` must not cancel
earlier commits; only build-only `check` may supersede stale work. `release` has no concurrency
group, uses `always()` to inspect upstream results, and publishes unique run-number tags only after
successful artifact-producing jobs; it does not gate on `check` alone. This records a
failed/no-release boundary, not a verified phase.

This update changes the packaged reader and its records. No tests, builds, installer runs, runtime
sessions, workflow dispatches, or captures were run. No phase is closed from
source presence or local packaging. Issue #63 stays open until the populated
ledger has one durable row for every completed phase and the remote release evidence is complete.

### 廣東話 / Cantonese

Issue #63 仲係 **open**。功能文檔係
[`docs/manual-release-ledger.md`](docs/manual-release-ledger.md)，由
`docs/release-ledger.json` 同 `scripts/manual-release-ledger.mjs` 個 schema/validator
托住。每個 completed phase 都要有 exact integrated SHA、唯一 non-draft release、
workflow/manual receipt、UTC timing、asset/hash、Squirrel/archive、line-count、
public bilingual code name 同真實 `running`/`failed`/`verified` state；local build
唔可以冒充 cloud verdict，failed phase 亦唔可以硬塞 release identity。

而家 task-owned ledger 已經有四行 historical records：682、704、708 同 731。四行都有
release/target/workflow/timing/asset/hash read-back，但全部係 `failed` 加
`shipped-nonconforming`，因為舊 release copy 同 attach 咗 dim-sum 相；現行 policy 要求
淨係 link public catalog photo，唔可以 copy 或 attach。四行都唔係 `verified`，#51 嘅
`.613` evidence 亦唔放入呢份 ledger。今次只改 documentation，冇跑 tests、build、
installer、runtime、workflow dispatch 或 captures。Issue #63 要等每個 completed phase
都有 row，同 integrated-phase completeness check 齊先可以 close。

## Issue #70 marker authoring — records-only update, 2026-08-19

Issue #70 remains **open and unverified**. The issue-owned checkout contains source for four
local marker kinds (POI, line, shape, and extrude), bounded geometry validation, map-scoped
create/edit/duplicate/delete, versioned JSON import/export, unknown-field and ordering retention,
local persistence, mutation-history records, regex search, and a shell-lifetime viewer-layer host.
The durable feature record is [`docs/marker-studio.md`](docs/marker-studio.md).

The remaining boundary is marker-set CRUD beyond the fixed studio set, direct map drawing rather
than JSON geometry entry, complete BlueMap style/icon/label controls, user-facing history
browsing and undo/restore, VS Code handoff, concurrent-file/collision handling, stronger
cross-dimension safeguards, and the full accessibility/localization/reduced-motion/destructive-
action matrix. The source wires live unsaved preview and clears it on cancel/save/map change,
but that behavior is unverified in the packaged viewer. Packaged interaction and captures for
every edited marker type are still open.

This pass corrects the public issue timestamp and recreates the issue records in the exact
issue-owned checkout. No tests, package builds, viewer launches, screenshots, or runtime claims
are made here. Keep Issue #70 open until the implementation and the focused packaged evidence
for every edited marker type are complete.

### 廣東話 / Cantonese

Issue #70 仲係 **open，未驗證**。issue-owned checkout 有四種 local marker kind（POI、line、
shape、extrude）、bounded geometry validation、map-scoped create/edit/duplicate/delete、
versioned JSON import/export、保留 unknown field 同 ordering、local persistence、mutation
history records、regex search 同 shell-lifetime viewer layer host；直接 feature record 係
[`docs/marker-studio.md`](docs/marker-studio.md)。

仲欠 marker-set CRUD（唔係淨係固定 studio set）、直接喺地圖畫 geometry（而家係 JSON geometry
field）、完整 BlueMap style/icon/label、history browse 同 user-facing undo/restore、VS Code
handoff、concurrent file/collision、強啲嘅 cross-dimension safeguard，同完整
accessibility/localization/reduced-motion/destructive-action matrix。Source 已經接好 live
unsaved preview，cancel/save/map change 會清走，但 packaged viewer 仲未驗證。每種 edited marker
type 嘅 packaged interaction 同 captures 都仲係 open。

今次修正 public issue timestamp，並喺正確 issue-owned checkout 重建 records。冇跑 tests、冇
build package、冇開 viewer、冇影 screenshots，亦冇聲稱 runtime 已經證實。要等每種 edited
marker type 嘅 packaged evidence 齊晒先可以 close Issue #70。

## Issue #72 static map export — records-only boundary (2026-08-19)

Issue #72 remains **open** on the task-owned branch `codex/issue-72-static-map-export`.
The transferred feature record is [`docs/static-map-export.md`](docs/static-map-export.md).
This handoff records the acceptance boundary only; it does not claim that the implementation or
packaged export is verified.

The required surface covers a self-contained static site with client-side decompression and
base-path handling; folder, ZIP, and configurable 7z outputs; path-traversal protection; a
versioned manifest with checksums, provenance, renderer/engine versions, settings metadata, and an
exact omissions statement; filtered and bulk export; progress, cancellation, resume, conflict
handling, history, and file-manager/Visual Studio Code actions.

At this checkpoint there is no records delta to claim before the implementation lane changes.
The implementation files and transferred article are present in this task-owned checkout. No
tests, captures, installer runs, or browser sessions were performed here. Packaged proof remains
open: validate every referenced file, reopen the result from a plain static server, and open a
genuine packaged export offline in a fresh browser profile before closing Issue #72.

### 廣東話 / Cantonese

Issue #72 仲係 **open**，屬於 task-owned branch `codex/issue-72-static-map-export`。Transferred
feature record 係 [`docs/static-map-export.md`](docs/static-map-export.md)。呢份 handoff 只記
acceptance boundary，唔係話 implementation 或 packaged export 已經驗證。

今個 checkpoint 冇 records delta 可以喺 implementation lane 改之前聲稱。Implementation files
同 transferred article 已經喺 task-owned checkout。冇行 tests、captures、installer runs 或
browser sessions；packaged proof 仲要逐個 referenced file 驗、普通 static server reopen，同
fresh browser profile offline reopen genuine packaged export，先可以 close Issue #72。

## Issue #74 local live-player tracking — 2026-08-19

Issue #74 remains **open and unverified**. This issue-owned checkout contains the local live-player
source implementation in `design/packages/server/src/live/localLiveProvider.ts`, with optional
mount wiring in `MapStorageHandler` and the CLI server entry point. The direct feature record is
[`docs/local-live-player-tracking.md`](docs/local-live-player-tracking.md).

The safe empty response remains the default when no local provider is configured; the source path
does not yet have packaged runtime proof. No tests, real player-data reads, isolated RCON session,
packaged interaction, or capture were run in this records lane. Acceptance remains open until the
next owner proves valid and malformed NBT, locked/truncated files, multiple dimensions,
RCON refusal/timeout/reconnect, credential-store isolation, stale cleanup, and live marker updates
in the packaged viewer.

### 廣東話 / Cantonese

Issue #74 仲係 **open，未驗證**。呢個 issue-owned checkout 已經有
`localLiveProvider.ts` source implementation，同 `MapStorageHandler`／CLI server 嘅 optional
mount wiring；直接 feature record 係 [`docs/local-live-player-tracking.md`](docs/local-live-player-tracking.md)。

冇 configure local provider 時，safe empty response 仍然係 default；但 packaged runtime 仲未
有 proof。今次 records lane 冇跑 tests、冇讀真 player data、冇開 isolated RCON、冇 packaged
interaction、冇 capture。要補齊 NBT、RCON、credential-store、stale cleanup 同 packaged marker
update 證據，先可以收 issue。

## Issue #73 three.js upgrade and parity — records-only update, 2026-08-19

Issue #73 remains **open**. The durable feature record is
[`docs/threejs-upgrade.md`](docs/threejs-upgrade.md), and the detailed parity article is
[`docs/compatibility/threejs-upgrade-parity.md`](docs/compatibility/threejs-upgrade-parity.md).

The records define the pending upgrade boundary: inventory changed three.js APIs used by loaders,
shaders/materials, camera and controls, CSS2D, textures, caches, markers, picking, screenshots,
and WebGL lifecycle; preserve geometry, transparency, LOD, marker placement, navigation, and
measured performance; and prove context-loss recovery, unsupported hardware/browser handling, and
non-silent blank-canvas failure.

This lane is records-only. No runtime code, tests, package builds, viewer launches, screenshots,
rendered-image comparisons, interaction checks, performance measurements, or packaged-artifact
proof are claimed here. The implementation changes already present in this task checkout still
require the focused evidence listed in the issue before Issue #73 can close.

### 廣東話 / Cantonese

Issue #73 仲係 **open**。`docs/threejs-upgrade.md` 同
`docs/compatibility/threejs-upgrade-parity.md` 已經寫低 API inventory、畫面/操作/performance
保留、WebGL failure boundary 同 packaged evidence 要求。今次只係 records-only，冇聲稱
runtime、tests、package、viewer launch、screenshots 或 parity 已經驗證；implementation 仲要
補齊真 evidence 先可以 close。

## Issue #75 measurement and waypoints — 2026-08-19

Issue #75 remains **open**. The task-owned checkout contains the bounded measurement and waypoint
model changes, but this lane has not run tests, packaged interaction, or a real capture, so no
runtime or release claim is made. The direct feature record is
[`docs/measurement-and-waypoints.md`](docs/measurement-and-waypoints.md).

The record covers point-to-point and polyline distance, horizontal/vertical deltas, area,
coordinates, Nether scaling, editable/grouped/tagged/searchable waypoints, local persistence,
complete import validation, export, and the failure boundary. Remaining acceptance work is to
exercise the implementation in the packaged viewer and add the issue's focused proof before
calling the feature complete.

This is a documentation-only records pass. The implementation files already present in this
checkout were not edited here.

## Issue #77 multi-server operations dashboard — 2026-08-19

Issue #77 remains **open and pending implementation**. The current application has
individual saved profiles in Maps and servers, while this issue's dashboard work
aggregates local, Docker, and remote sources with reachability, version, maps,
players, render/update state, and last-check time.

The direct feature record is [`docs/multi-server-dashboard.md`](docs/multi-server-dashboard.md).
It records bounded refresh, backoff, cancellation, stale/unknown/partial states,
search and full regex, filters, grouping/pinning/reorder, multi-select and truthful
bulk actions, exact-surface teleport, persistence/history, and the credential
boundary.

The implementation files are present on this issue-owned checkout, but no tests,
captures, or packaged multi-server interaction are claimed in this handoff. Mixed
local/Docker/remote, offline, authentication-failure, version-skew, large-
inventory, restart, accessibility, localization, and compact-width evidence
remains outstanding. A future pass must prove the feature against multiple
isolated real servers or containers in the packaged application before issue #77
can close.

### 廣東話 / Cantonese

Issue #77 仲係 **open，等緊驗證完成**。而家 app 有 Maps and servers 入面一部部
profile；今次 dashboard implementation 就係要將 local、Docker、remote 來源，
可達性、版本、maps、players、render/update 狀態同最後檢查時間擺埋一齊。

Implementation files 已經喺 issue-owned checkout，但今次 handoff 冇聲稱 test、
capture 或 packaged multi-server interaction 已完成。混合路徑、離線、auth failure、
version skew、大 inventory、restart、accessibility、localization 同窄闊度證據都仲欠住。

## Issue #69 — Docker hosting instance manager — 2026-08-19

Issue #69 remains **open and unverified**. The issue-owned checkout contains the local manager in
`design/packages/app/src/main/dockerhosting/manager.ts`, `ipc.ts` and `index.ts`, the preload
bridge in `design/packages/app/src/preload/index.ts`, the `DockerHostingScreen.vue` surface and
`dockerHostingBridge.ts`, plus `main/index.ts` startup wiring, the `dockerHosting` tab, the
command-palette catalogue entry and feature registration. The direct feature record is
[`docs/docker-hosting-manager.md`](docs/docker-hosting-manager.md).

The current source discovers daemon state, filters containers/volumes by app-owned labels, inventories
exact digest-pinned image references,
persists instance records, validates digest-pinned create requests, checks port conflicts and named
volume ownership, preserves the selected image's own `ENTRYPOINT`/`CMD`, verifies create results
with rollback, and exposes separate explicit Create and Start operations plus stop/restart/remove,
progress, cancellation, bounded logs, selection/export and native confirmation surfaces. Update is
explicitly refused until a transactional recreate plan can preserve mounts, ports and ownership;
actual server/map configuration management, persistent full logs/history, complete multi-row bulk actions and
Visual Studio Code handoff are not yet complete.

This records update ran no tests, contacted no Docker daemon, created no throwaway container, built
no package and took no capture. Real daemon state/refusal/ownership/rollback, lifecycle recovery,
reattachment, update/map/configuration, persistent logs/history, multi-bulk/export, VS Code,
packaged interaction and headless capture evidence remain open. Preserve this evidence boundary;
do not close Issue #69 from source presence alone.

### 廣東話 / Cantonese

Issue #69 仲係 **open，未驗證**。Issue-owned checkout 有 manager、IPC/preload bridge、
`DockerHostingScreen.vue`、`dockerHosting` tab、command-palette entry 同 startup wiring；直接
feature record 係 [`docs/docker-hosting-manager.md`](docs/docker-hosting-manager.md)。

而家 source 會 probe daemon、淨係揀 app-owned labels、保存 instance records、驗 digest-pinned
create、檢查 port/volume ownership、做 create verification/rollback，仲有 start/stop/restart/
remove、progress/cancel、bounded logs、selection/export 同 native confirmation。Update 暫時
明確拒絕，等 transactional recreate plan；map/config、完整 persistent logs/history、multi-bulk
同 VS Code handoff 仲未齊。今次只寫 records，冇 tests、真 daemon、throwaway container、package
或者 capture；真 runtime 同 packaged evidence 仍然 open。

## Issue #80 — privacy-safe in-app issue reporting (2026-08-19)

The isolated Issue #80 checkout contains an in-progress implementation for a reviewed diagnostic
report draft. The main-process report builder is in
`design/packages/app/src/main/repair/report.ts`; the repair surface wires a `Report a problem`
panel through `redesign/ui/src/components/repair/RepairPanel.vue`, with field assembly and
Markdown/JSON export in `redesign/ui/src/components/repair/issueReport.ts` and the panel in
`redesign/ui/src/components/repair/IssueReportPanel.vue`.

The current source behavior redacts recognised credential, user-path, private-address, and
private-host shapes; bounds selected console evidence; shows required and optional fields for
review; allows optional evidence to be edited or cleared; exports Markdown or JSON locally; and
opens a GitHub new-issue form only after copying a draft. It explicitly marks the draft as not
submitted automatically. The source implementation is committed in this issue lane.

Acceptance is not yet proven. The current wiring is visible from the repair panel, while the
required Help/About and every relevant failure-surface discovery audit remains open. There is no
verified production submission flow, no disposable-target submission proof, and no packaged
application interaction evidence. No tests, checks, or screenshots were run in this records-only
pass. Do not close Issue #80 until the implementation is committed, the adversarial redaction and
accessibility/localization checks run, and a genuine packaged capture and disposable submission
record are available.

## Issue #79 automatic updater evidence — records-only update, 2026-08-19

The public issue thread records the start of a documentation-only lane. The updater
documentation continues to separate injected-seam and local test evidence from the missing
packaged runtime proof. Issue #79 remains open: two consecutive immutable Squirrel releases,
clean-profile N → N+1 installation/update read-back, preserved settings/projects/history/cache
and focus, explicit Later/Restart behaviour, supported cancellation, rollback, and genuine
cheap-headless captures are still required.

No tests, captures, installer runs, or runtime verification were performed in this lane. No
completion claim is made; the next owner must attach evidence from the real installed flow before
updater acceptance can be closed.

## Issue #83 — BlueMap server-adapter smoke evidence (2026-08-19)

This documentation-only lane records the exact adapter matrix from upstream
BlueMap `v5.23`, pinned at `4c4cbc291b361ceff6ee239448e9f988f9019dbb`, and links
the published jar/hash record in [Worldlens v1.0.1233](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1233).
The durable record is [`docs/server-adapter-smoke.md`](docs/server-adapter-smoke.md).

The existing `tools/build-jars.mjs`, `tools/describe-jars.mjs`, and
`.github/workflows/build-jars.yml` prove build/package structure and release
traceability. The plan-first `tools/server-adapter-smoke/smoke.mjs` contract
enumerates the six adapters and required positive/negative cases. Its checked-in
source-SHA/version matrix is populated, but no `--execute` report exists.

No real server, plugin discovery/startup, config generation, live render/update,
HTTP endpoint, clean shutdown, restart persistence, negative fixture, test, or
capture was run in this lane. No private server data was accessed or recorded.
Issue #83 therefore remains open. The next owner must run the exact published jar
bytes in isolated disposable server environments, record the release asset hash
and source SHA beside each result, and retain redacted logs, durations, resource
measurements, endpoint/render results, restart receipts, and negative-case outcomes.

## Issue #84 — remote-hosting navigation and wiring records (2026-08-19)

The main/preload `hosting:*` bridge is present, and the panel retains publish, refresh, verification,
progress, and super-confirmed stop behavior. Commit `8e78a95c` added the dedicated
`RemoteHostingScreen.vue`/`remoteHosting` tab with saved-target and completed-render selection,
corrected the catalogue route, and registered the command-palette destination. It is not yet
packaged, captured, or accepted runtime evidence.

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

## Issue #71 — JavaScript and ESM add-ons (open, 2026-08-19)

The current product has Java adapter JARs that load Java add-ons, but it does not yet expose an
equivalent JavaScript/ESM add-on runtime for the TypeScript application. This gap is carried from
the imported `material-bluemap` history and its recovered continuation plan; that provenance is
context, not evidence of a shipped runtime. `README.md`, `packages/cli/src/config.ts`, and the
issue #60 compatibility records describe this surface as planned, internal, or otherwise not yet
a 1.0 promise. Issue #60 itself is already closed with its compatibility records and existing
evidence; issue #71 is the separate implementation lane. The public documentation record is
[`docs/compatibility/javascript-esm-add-ons.md`](docs/compatibility/javascript-esm-add-ons.md).

The implementation remains open. Required work includes a versioned public API and types,
lifecycle and compatibility/deprecation rules, searchable add-on management, exact package
provenance, isolated least-privilege execution, explicit capability consent, deterministic load
order, dependency/conflict handling, failure isolation, safe mode, rollback, diagnostics, stable
typed hooks, developer documentation, examples, packaging guidance, and genuine packaged-runtime
evidence. No packaged runtime, capability-consent flow, sandbox, rollback proof, malicious-package
verification, tests, or captures are claimed by this handoff entry.

The issue remains open until the implementation and the evidence matrix are complete.

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

## Issue #67 — exact two-wave dispatch record (open, 2026-08-19)

The hosted dispatch record is exact and intentionally narrow: Wave 1 completed **256/256** shards.
Wave 2 completed **7/105** shards, with **98** cancelled in flight. The two-wave **merge was not
reached**. No final map, lowres rebuild, merged metadata, public/openable result, or disk-ceiling
proof is claimed from those counts.

This is a records-only handoff. No new workflow run, test, capture, merge, disk measurement,
cleanup observation, or release action was performed. Issue #67 remains open until a fresh run
reaches merge and records the required integrity, ordering, resumability, disk, cleanup, and
publication evidence.

The issue-owned implementation source is present but unrun: the receipt and two-wave helpers under
`design/packages/render-actions/src/`, the merge/lowres wiring, and the `.github/workflows/render-
world.yml` / `render-shard-wave.yml` changes are source evidence only. No workflow execution has
read back a receipt, exercised the merge, or established that the new path works in the built
artifact.

廣東話：Wave 1 完成 **256/256** 個 shard；Wave 2 完成 **7/105** 個，剩低 **98** 個喺途中取消；兩波 **merge 未到達**。呢段只係 records-only handoff，冇新 run、tests、captures、merge、disk measurement、cleanup 或 release，唔會由幾個數字扮成 final map 或 disk ceiling proof。
