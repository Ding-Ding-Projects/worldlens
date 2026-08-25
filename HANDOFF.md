# Handoff

## 2026-08-23: runtimes inside the installer, and the GUI defects that exposed them

### What the project is now, in one paragraph

Worldlens is a Windows desktop app (Electron shell, Vue renderer, pnpm workspace under
`design/`) that renders Minecraft worlds into BlueMap web maps and manages Minecraft servers.
As of this session its installer is **self-contained**: it carries its own Java runtime and the
Chunker jar rather than downloading them on first use, so a fresh install renders and converts
with the network unplugged. `Setup.exe` grew from 169 MB to 424 MB as a direct result, which is
the intended trade and is stated in `docs/dependency-provisioning.md`.

### Published baseline

| tag | target commit | verified how |
|---|---|---|
| `v1.0.1640` | `214f32f83d346b24b96358d0c4c47c0bf6eee1ff` | `gh release view`: non-draft, non-prerelease, 6 assets all nonzero, tag resolves to that exact commit via `git ls-remote` |
| `v1.0.1637` | `966590b4` | CI reported every run green; this is the first release carrying both the runtimes and the wiring that uses them |

`main` is `e27ddd9e`. Its CI run had not reached a terminal state when this handoff was
written; treat that verdict as unknown rather than green.

### The bundled runtime, and how to check it is real

`design/packages/app/scripts/stage-bundled-runtimes.mjs` downloads two pinned, digest-verified
artifacts at package time into `dist/bundled/`, which `electron-builder` copies to
`resources/bundled/`:

- Temurin **JRE** `25.0.4.1+1-LTS`, sha256 `4c95451c…`, 58,475,080 bytes compressed and
  **179.1 MB extracted across 320 files**. A JRE rather than a JDK because the app runs `java`
  and never compiles.
- `chunker-cli-1.19.1.jar`, sha256 `327662e8…`, 31,790,149 bytes, the same asset and digest as
  `PINNED_CHUNKER` in `src/main/bedrock/chunker.ts`.

A digest mismatch deletes the bytes and fails the build. Staging is wired into both the
`package` and `make` scripts, so a build cannot silently omit it.

**Verified end to end, not inferred.** This machine has no `JAVA_HOME`, no `java` on `PATH`,
and no provisioned copy, which is the clean-install case. Asked through the app's own IPC from
the packaged artifact, `worldlens.javaRuntime()` answered:

```
source:     bundled
executable: ...\resources\bundled\java\bin\java.exe
runtime:    OpenJDK Runtime Environment Temurin-25.0.4.1+1 (build 25.0.4.1+1-LTS)
```

Before the wiring the same call returned `installation: null`.

**The trap to know about.** Shipping the runtime and *using* it are separate. Four call sites
resolve a JVM and all four originally passed only `dataDir`: `render/engine.ts`,
`mcserver/ipc.ts` (twice), `java/ipc.ts`, and `index.ts`. With any JDK installed, every one of
them works anyway because `JAVA_HOME` or `PATH` answers, so the omission is invisible on a
developer machine and total on a clean install. `bundledRuntimeWiring.test.ts` pins it.

Direct runtime proof exists for **one** of the four (`java/ipc.ts`). The other three are wired
and guarded but were not exercised at runtime, because the render path needs BlueMap jars that
are not staged locally.

### Gate inventory, measured this session

Green: `shared` 210, `config` 234 (2 skipped), `nbt` 56, `parts` 38, `chunker` 50,
`worldgen` 32, `server` 53, `viewer` 131, `cli` 47 (2 skipped), `site` 828, `md3-check` 17.

Red, all pre-existing and tracked by **#162**: `render-actions` 4 failed of 258, `ui` 66 failed
of 5415, `app` 41 failed of 3547 (last measured before this session's fixes).

`engine` was measured at 1492 tests with 4 failures earlier in the session; three were repaired
and the fourth was a timeout under CPU contention. A fresh per-package sweep was still running
at `engine` when this handoff was written, so treat the engine and app rows as unconfirmed.

### Gates that run against the built artifact rather than source

The signing proof in `ci.yml` recurses the packaged tree, and this matters now that the tree
contains a vendored JRE: Adoptium signs its own binaries, so `jabswitch.exe` and friends report
`Valid`. The gate is scoped to **generated** executables, excluding exactly
`resources\bundled`, and it fails when that directory contains no executables at all. Verified
against the real package: 13 vendored binaries excluded, 1 (`Worldlens.exe`) checked, 0
violations.

CI itself runs **no tests** and says so in its own release notes. A green remote verdict is a
build verdict only.

### Fixed this session

- **Adoption** could open nothing: the shell discarded the discovery failure, returned silently
  on no candidates, and took `value?.[0]`. `AdoptionBrowser.vue` now answers for all four
  outcomes. Guard proven red four ways.
- **Flavour cards drew every option's prose on top of every other's.** `flex-direction: column`
  was set on the `VBtn` root; Vuetify lays out `.v-btn__content`. Fixing that exposed a second
  defect: `height: auto` plus the design system's `corner-full` button default rendered each
  card as an **ellipse**. Corner now spent through the `rounded` prop, confirmed 16px in the
  running app.
- **The server list had no page margins**, so "New server" sat flush against the window edge.
  Now `18px 48px 48px`, matching the catalogue, and the grid is two fixed columns at 14px,
  read back from the running app's stylesheet.
- **`engine` and `server` were aborting**, not failing: a libuv `fs-event.c` assertion killed
  the process. The guard read `major >= 26`; this machine runs Node 24.19.0. CI pins Node 22
  and runs no tests, so nothing caught it. The same abort kills the product while a map is
  watched.
- Three stale tests moved onto real behaviour, and the viewer's `localStorage` double was
  three methods deep so asking it what was stored returned a confident empty answer.

### Open boundaries

- **#162** pre-existing red gates. **#160** stale capture evidence: `docs/screenshots/manifest.json`
  still records `commit: "(local run)"` and `captureMode: "none"`, so no capture is pinned to a
  verified commit.
- `scripts/sync-screenshots.mjs` was retargeted at the local capture matrix because the CI
  `screenshots` job no longer exists; that refresh route has not been exercised.
- The design canvas in the zip publishes a type ramp differing from stock Material 3
  (headline-medium 32/40, title-medium 17/24, body-medium 14/21). The shell renders those
  numbers as hand-written rem literals rather than tokens. Deliberately untouched: moving the
  token ramp off spec is a decision, not a cleanup.

### 廣東話同步

今次將 runtime 塞咗入安裝檔：Temurin JRE 同釘死版本嘅 Chunker jar，兩個都對過 digest。
`Setup.exe` 由 169 MB 變 424 MB，係預期之內嘅代價，文件有寫明。

最重要嘅一課：**「帶咗個 runtime」同「真係用緊佢」係兩件事。** 四個解析 JVM 嘅 call site
原本全部淨係傳 `dataDir`，而只要部機裝過 JDK，四條路都行得好地地，所以喺開發機上面完全睇
唔出，喺乾淨新裝機就完全壞。已經接通，亦加咗守衛釘死。

GUI 方面：flavour 卡啲字疊晒，係因為 `flex-direction: column` 落錯咗喺 `VBtn` 個 root；
改完之後又踩到卡變橢圓形，因為設計系統本身將 button 預設做 `corner-full`。伺服器清單完全
冇頁邊距，粒「New server」貼住視窗邊。

`engine` 同 `server` 唔係肥佬，係直情 abort：libuv 喺 Windows 嘅 assertion。防護寫住
Node >= 26，但呢部機行 24。CI 釘死 22 而且根本唔行測試，所以一直冇人發現。

---


## 2026-08-22 — Reusable WorldLens design system package

Commit `d32e7a24be60fddfa6e95d2a4d84c080c19a37dc` introduces the publishable
`@worldlens/design-system` package at version 0.1.0. The package exports framework-neutral
colour roles, the token stylesheet, WorldLens themes and component defaults, and
`createWorldLensDesignSystem()`. The WorldLens UI imports the package from its real Vuetify
bootstrap and CSS entrypoint; its kid presentation scheme remains product-specific and is
supplied to the factory as an additional theme.

No dependency installation, lockfile update, build, test, type check, static analysis, UI run,
or capture was performed in this ultra-speed lane. The integration owner must reconcile the
workspace manifest changes, install once, and build the design-system, shared and UI packages in
topological order before treating the package as verified or publishable output.

### 廣東話同步

Commit `d32e7a24be60fddfa6e95d2a4d84c080c19a37dc` 加咗可發布嘅
`@worldlens/design-system` 0.1.0。套件有唔依賴 framework 嘅色彩角色、token stylesheet、
WorldLens theme、component 預設同 `createWorldLensDesignSystem()`；WorldLens UI 嘅真正
Vuetify bootstrap 同 CSS entrypoint 已經直接用佢。Kid presentation scheme 仍然留喺產品入面，
只係當額外 theme 傳畀 factory，冇硬塞入共用套件。

呢條超快 source lane 冇裝 dependency、冇改 lockfile、冇 build、冇跑 test、type check、
static analysis、UI 或 capture。Integration owner 要先對齊 workspace manifest、統一安裝一次，
再按拓撲次序 build design-system、shared 同 UI，先可以話產物驗證過或者真係可發布。

---

## 2026-08-22 — Minecraft server hosting manager

Written for the next owner. Assume no prior conversation. `main` is at the tip recorded by the
final commit of this session and every branch named below is pushed and verified against the
remote.

### The rule this work is built on

Every setting is configured through a real GUI control. No command line, no hand-edited config
file, and no bare text box standing in for a control. The full statement, with the value-kind to
control mapping table, is now in `AGENTS.md` under **Every setting is a real GUI control**. Read
it before writing any interface.

### Verified working

- **The Host Server destination.** It was mounted with no event listeners, so every button on it
  emitted into nothing: Manage, New server and each card action did nothing at all. Fixed, and
  guarded by `serverScreenWiring.test.ts`, which reads `App.vue` and fails when any mount ignores
  an event the list emits. An unhandled emit is not a type error, so nothing else could catch it.
- **The create-server wizard can be completed.** It previously could not be on its default
  transport: the server folder field lives on the runtime step while only the resources step
  required it, so a user reached a disabled Next with the fixing field on another screen and no
  explanation. The runtime step now gates on its own folder, the folder arrives pre-filled, and a
  disabled Next names its exact unmet condition.
- **Version is chosen, not typed** — a picker over the live catalogue, each entry carrying its
  release date and a link to its page on the Minecraft Wiki. Typing survives only behind an
  explicit switch, for a version published after the catalogue was fetched. The wiki address is
  constructed from the version name rather than looked up, so a very new version may not have an
  article yet; the wording promises a page for that version rather than claiming one exists.
- **PaperMC's v2 API was retired and answers 410.** Paper and Velocity were silently returning
  zero versions while the interface honestly reported none were catalogued. Both now read the v3
  API, which additionally supplies real release dates and verifiable SHA-256 digests. An opt-in
  test talks to the real APIs and fails when any flavour returns nothing:
  `WORLDLENS_CATALOGUE_NETWORK=1 npx vitest run catalogue.realNetwork` from `design/`.
- **Config round-trip is byte-for-byte**, verified rather than assumed: comments, blank lines,
  key order, indentation and CRLF all survive parse-then-write, across 58 tests.
- **A screen recording is committed** at `docs/recordings/worldlens-tour.mp4`, captured from the
  application's own renderer on an off-screen desktop. The machine's monitor is never recorded.

### Not done, and none of it optional

The records below were reconciled against `origin/main` at `a90f588f` on 2026-08-22. The server
wizard, live version picker, Paper/Velocity v3 catalogue, and byte-for-byte config document model
are landed; the following interface and evidence gaps remain open.

1. **Adoption remains unwired (Issue #150).** `ServerListScreen.vue` emits `adopt`, but all three
   `App.vue` mount sites still omit `@adopt`; `AdoptionReviewDialog.vue` is only referenced by its
   own tests. The read-only backend under `main/mcserver/adopt/` is real and tested, but no
   discovery browser or review flow is reachable from the app.
2. **The config editor is still disconnected (Issue #151).** `ServerConfigEditor.vue` contains no
   `configDescribe` or `configApply` call, so the typed schemas do not reach a user. The five
   server/proxy schemas already present are source-only; Fabric, Forge, NeoForge and the
   `ops.json`/`whitelist.json`/`banned-players.json`/`banned-ips.json` record tables remain missing
   (Issue #158). Defaults and bounds are still marked recall-derived and need upstream checking
   (Issue #159).
3. **AWS hosting is still unreachable from the wizard (Issue #152).** The tested
   `main/mcserver/aws/` backend exists, but `CreateServerWizard.vue` has no AWS route or controls;
   `creditBalanceRemaining` correctly remains `null` because AWS exposes applied credits, not a
   remaining-balance API.
4. **World generation is still unresolved (Issues #153 and #154).** `origin/main` does not wire
   either `lane/world-generator` implementation into IPC, preload or app boot. The Anvil writer
   remains deliberately synthetic; vanilla-accurate generation still requires running the
   downloaded server jar with Chunky and packaging its output.
5. **Screenshot evidence remains stale (Issue #160).** 150 of 229 targets are stale against the
   interface content digest. Recapture only on a frozen tree using the real built-artifact
   harness; see `docs/screenshot-evidence.md`.
6. **Requested client and interaction work remains open (Issues #155–#157, #161).** No fully
   interactive Fabric/Forge/NeoForge/Quilt profile creator has landed (#155); dropping a world
   folder/zip still has no useful inspect/action flow (#156); the remaining rows in
   `docs/search-coverage.md` still need their search and anchored regex builder (#157); and the
   command builder still lacks a second map-picked corner for `/fill` and `/clone` (#161).
7. **Pre-existing red gates remain (Issue #162).** The unrelated app typecheck errors, the
   interface-package baseline, five missing docs-index entries, and the Kid Mode language suite's
   sixth-tile mismatch are still recorded as pre-existing and are not claimed as fixed here.

### Issue reconciliation (2026-08-22)

Issues #150, #151, #152, #153, #154, #155, #156, #157, #158, #159, #160, #161 and #162 are all
still open against `origin/main` (`a90f588f`). Their source or evidence status is recorded above;
none has a verified packaged-runtime or capture result that justifies closure. The already-landed
server-manager work is limited to the verified items listed in **Verified working**.

### Traps that have already cost time

- Files are CRLF; a scripted multi-line replacement written with `
` matches nothing and
  silently changes nothing. Prefer line-based edits and assert the file actually changed.
- The renderer is not inside `app.asar`; it is at `release/win-unpacked/resources/ui/`. Packaging
  the app does not rebuild the interface workspace, so build from `design/` first or package a
  stale renderer.
- Packaging fails with a busy-resource error while the app is running.
- A wrapper's exit status lies: write the exit code into the log itself and read it back.
- `git stash` is shared across every linked worktree on one repository. Two agents stashing
  concurrently collided today and work briefly vanished. Commit instead of stashing.
- A guard nobody has watched fail proves nothing. Two guards written this session were toothless
  until deliberately broken; one truncated its match at the `>` inside an arrow function and
  reported every correct site as broken.

### Verification

Run from `design/`, not the repository root:
`npx vitest run packages/ui/src/components/mcserver packages/app/src/main/mcserver` and
`npx vitest run packages/site`. For interface work, verify against the built artifact rather than
the source: several defects this session were invisible in the code and obvious in the first
capture of the running application.

---

## Earlier sessions

Retained below and not re-verified in this pass, except that issue #89 was confirmed still open.

# Handoff

## Issue #89 — typed banner patterns: lenient malformed-layer boundary

The typed banner reader preserves ordered legacy/current and unknown pattern and
colour data. A malformed list element is consumed, recorded as one bounded
diagnostic, skipped without inventing a default, and later valid layers continue
in order. Diagnostic history retains at most 32 messages and reader-state errors
still propagate. The previously recorded focused acceptance result remains 5/5;
this records update ran no new tests, builds, packaged interaction, or captures.
Real NBT/oracle comparison and packaged same-world render, restart/reopen, and
diagnostic read-back evidence remain open, so Issue #89 stays open.

The acceptance audit also found a source-level renderer seam: `bannerRenderLayers` derives
pattern-specific resource paths, but `BlockStateModelRenderer.renderBanner` currently requests
the shared `minecraft:block/white_banner` material for every layer. `bannerLayerImage` is only a
deterministic fixture/test helper and is not connected to the packaged `TextureGallery` path. The
manifest's base resource path and the oracle README's banner count were corrected in the Issue #89
audit lane; no renderer repair is claimed without the prohibited build/runtime proof. The next
owner must correct that seam, then run the real oracle and packaged-viewer evidence against one
exact release before closure.

### 廣東話同步

Typed banner reader 會保留 legacy/current 同未知 pattern、colour 嘅次序同資料。
壞咗嘅 list element 會 consume 完、留一條 bounded diagnostic、跳過而唔亂估
default；後面啱嘅 layer 照次序行。Diagnostic 最多 32 條，reader state error
仍然會報。之前 focused acceptance 仍然係 5/5；今次 records update 冇加跑
tests、build、packaged interaction 或 captures。真 NBT/oracle、same-world
packaged render、restart/reopen 同 diagnostic read-back 仲未有，所以 Issue #89
繼續 open。

今次 acceptance audit 亦搵到 renderer seam：`bannerRenderLayers` 會計出每層
pattern-specific resource path，但 `BlockStateModelRenderer.renderBanner` 依家每層都攞
共用 `minecraft:block/white_banner` material。`bannerLayerImage` 只係 deterministic
fixture/test helper，未接去 packaged `TextureGallery` 路徑。Issue #89 audit lane 已修正
manifest base resource path 同 oracle README banner count；冇喺禁止嘅 build/runtime proof
之前聲稱 renderer repair。下一位 owner 要先修好呢條 seam，再用同一個 exact release 跑真 oracle
同 packaged-viewer evidence，先可以考慮關 issue。

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
dispatches, packaged runtime sessions, or captures. The workflow-policy change itself is already
represented by the verified `v1.0.1349` row in the six-phase ledger; the later records-only
reconciliation was published as `v1.0.1373` for commit `873eb0eae7c5b9208c3570a15cf81cf9704a29c7`.
Neither release supplies packaged-reader interaction, restart/reopen, or runtime proof.

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
dispatches、packaged runtime sessions 或 captures。Workflow policy change 本身已經由六行
ledger 入面 verified 嘅 `v1.0.1349` row 記錄；之後 records-only reconciliation 就用
`873eb0eae7c5b9208c3570a15cf81cf9704a29c7` 發布成 `v1.0.1373`。兩個 release 都唔代表
packaged-reader interaction、restart/reopen 或 runtime proof 已完成。

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

Issue #58 remains **open and unverified**. The current source retains a render-id-keyed version-1
`localStorage` envelope only for migration and uses a version-2 index plus immutable segments for
active persistence, with a retained line array separate from the 10,000-line visible ring,
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
encoded-storage budget. Eviction marks a record incomplete and reports a warning. Those fixed limits are
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

Issue #58 仲係 **open，未驗證**。而家 source 保留 render-id-keyed version-1 `localStorage`
envelope 只作 migration，active persistence 就用 version-2 index 加 immutable segments；另外有同
10,000-line visible ring 分開嘅 retained array、temporary-key/read-back/final-key
persistence、按 render id restore、完整 retained-array search、selection-aware
TXT/Markdown/JSON/JSONL/CSV/TSV/HTML export、token-shaped redaction、storage/retention warning，
同經 destructive confirmation 嘅 selected-line delete/current-render prune-all；文檔係
[`docs/render-console.md`](docs/render-console.md)。

Render path 每行會 call `appendConsoleHistoryLine()`。Version-2 用 injective encoded per-render
keys、immutable revisioned 512-line segment generations 同 revisioned index。Append 只 update
active partial segment 或加 next segment，先 commit index，再清 superseded generation。Legacy
version-1 envelope 會 migrate 做 bounded segments，新 index commit 後先移除舊 key；evicted 同
cleared segments 都係 authoritative index update 後先清。

Implementation 固定最多 24 renders、每個 record 200,000 lines、encoded-storage budget 8 MiB；
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
development-checkout fallbacks.

Release [`v1.0.1394`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1394)
targets integrated commit `ad07eb0aea6fd0e31aeb7ac59235eaf103860a39` and provides the completed
packaged-reader runtime proof. The complete profile loaded the visible Release Ledger UI with **6
of 6** inventory phases. The incomplete profile supplied a five-phase user-data
`release-ledger.json`, and the UI failed closed with the exact missing phase name **Release-ledger
completeness enforcement**.

The complete-profile and incomplete-profile captures are retained as **local-only, unposted
evidence**. Their absolute local paths are intentionally omitted from this public record. The
runtime proof is complete; capture upload remains unavailable, so Issue #63 stays open.

The populated task-owned ledger contains six inventory phases: four historical rows (releases
682, 704, 708, and 731), the verified build-and-release-only workflow policy row, and the failed
no-release completeness-enforcement row. Each historical row has complete release/target/workflow/timing/asset/hash
read-back but is intentionally `failed` with `shipped-nonconforming` disposition,
because the release copied and attached a dim-sum photo. Current policy requires
linking to the public catalog photo without copying or attaching it. The workflow-policy row is
verified from its remote release read-back, while no local packaging or runtime verdict is
claimed. The completeness-enforcement row remains failed with no release identity; issue #51's
`.613` evidence remains outside this ledger.

The records-only reconciliation commit `873eb0eae7c5b9208c3570a15cf81cf9704a29c7` was published
as [`v1.0.1373`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1373). That is
the publication of this documentation correction, not a seventh implementation phase and not a
replacement release identity for any of the six inventory rows. Packaged reader interaction and
restart/reopen proof remain unrun.

The later `4a7aad1e` phase attempt is recorded as failed with no release identity. CI run
`32295874519` (`2026-08-19T19:57:25Z` → `2026-08-19T20:09:48Z`) completed `jars` and the Windows
package, then cancelled `Generate and render a test world`; `Publish release` was skipped. A
companion run for the same SHA (`32295860490`) also skipped publication, so no release was created.
The workflow correction is explicit: `jars`, `package`, `test-world`, and `release` must not cancel
earlier commits; only build-only `check` may supersede stale work. `release` has no concurrency
group, uses `always()` to inspect upstream results, and publishes unique run-number tags only after
successful artifact-producing jobs; it does not gate on `check` alone. This records a
failed/no-release boundary, not a verified phase.

This update changes the packaged reader and its records. No tests, builds, installer runs, or
workflow dispatches were run in this documentation lane. The packaged-reader runtime proof is
complete on `v1.0.1394`; the two captures remain local-only and unposted. No phase is closed from
source presence or local packaging, and Issue #63 stays open because capture upload remains
unavailable.

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
`.613` evidence 亦唔放入呢份 ledger。今次只改 documentation，冇跑 tests、build、installer
或 workflow dispatch。`v1.0.1394` 嘅 packaged-reader runtime proof 已經完成：complete
profile 見到 Release Ledger UI 同 **6/6** phases；incomplete profile 只有五個 phase，UI
準確報 **Release-ledger completeness enforcement** missing。兩張 capture 只保留喺 local、未
post，absolute path 唔寫入 public record。因為 capture upload 仲未有，所以 Issue #63 繼續 open。

Records-only reconciliation commit `873eb0eae7c5b9208c3570a15cf81cf9704a29c7` 之後以
[`v1.0.1373`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1373)
發布；呢個係文件修正嘅 release，唔係第七個 phase，亦唔可以攞嚟冒認六行入面任何一行。
Packaged reader runtime proof 已完成；capture 仍然係 local-only、未 post，upload 仲未有。

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

Issue #69 remains **open and unverified**. The default branch at
`b5dd1fd332de7e0eee3e9b3a5b233fceae4e6170` (`v1.0.1380`) contains the local manager in
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

This records update ran no tests, builds, packaged interaction, or captures. A separate bounded
daemon-contract receipt did contact the local daemon using the non-BlueMap digest-pinned
`nodeterm-server@sha256:69778914f2b70964241d9600b46b37a6722e78c492a6ea9bea0466449b6fab6b` image:
owner `worldlens-8bd86805f61e2583f988`, instance `issue69-proof-20260819`, container
`worldlens-issue69-proof-20260819` (ID
`b9f2135cb2151f1b376ba1fc96ae88b2e661a7f0d38b965b0e938861db72bd13`), volume
`worldlens-issue69-proof-volume`, and loopback `127.0.0.1:18169 -> 8443`. Create/start/stop/
restart/remove/volume-remove all succeeded; owned inventories ended empty, the port was free, the
existing `nodeterm-server` remained healthy, and the unrelated workload was unchanged.

This is daemon-contract lifecycle evidence, not BlueMap workload or packaged UI evidence. BlueMap
server/map configuration, transactional update, refusal/rollback/cancellation beyond this receipt,
persistent logs/history, multi-bulk/export, VS Code, packaged interaction and headless capture
evidence remain open. Preserve this boundary; do not close Issue #69 from source presence alone.

### 廣東話 / Cantonese

Issue #69 仲係 **open，未驗證**。`main` 喺 `b5dd1fd332de7e0eee3e9b3a5b233fceae4e6170`
（`v1.0.1380`）已經有 manager、IPC/preload bridge、
`DockerHostingScreen.vue`、`dockerHosting` tab、command-palette entry 同 startup wiring；直接
feature record 係 [`docs/docker-hosting-manager.md`](docs/docker-hosting-manager.md)。

而家 source 會 probe daemon、淨係揀 app-owned labels、保存 instance records、驗 digest-pinned
create、檢查 port/volume ownership、做 create verification/rollback，仲有 start/stop/restart/
remove、progress/cancel、bounded logs、selection/export 同 native confirmation。Update 暫時
明確拒絕，等 transactional recreate plan；map/config、完整 persistent logs/history、multi-bulk
同 VS Code handoff 仲未齊。Daemon contract receipt 用過非 BlueMap 嘅 digest-pinned
`nodeterm-server@sha256:69778914f2b70964241d9600b46b37a6722e78c492a6ea9bea0466449b6fab6b`：
owner `worldlens-8bd86805f61e2583f988`、instance/container
`issue69-proof-20260819` / `worldlens-issue69-proof-20260819`、volume
`worldlens-issue69-proof-volume`、loopback `127.0.0.1:18169 -> 8443`，create/start/stop/
restart/remove/volume-remove 全部成功，最後 owned inventory 清空、port free、existing
`nodeterm-server` healthy，同 unrelated workload 冇郁。呢個只係 daemon-contract proof，唔係
BlueMap workload、packaged UI 或 capture proof；嗰啲仍然 open。

## Issue #80 — privacy-safe in-app issue reporting (2026-08-19)

The source implementation for the reviewed diagnostic report draft is now on the default branch:
commits `45de1686` and `85758d94` are ancestors of `36c1d4d7`, and both are included in released
`v1.0.1411` (target `36c1d4d7`). The main-process report builder is in
`design/packages/app/src/main/repair/report.ts`; the draft panel is under
`redesign/ui/src/components/repair/RepairPanel.vue`, with field assembly and Markdown/JSON export
in `redesign/ui/src/components/repair/issueReport.ts` and the panel in
`redesign/ui/src/components/repair/IssueReportPanel.vue`.

The current source behavior redacts recognised credential, user-path, private-address, and
private-host shapes; bounds selected console evidence; shows required and optional fields for
review; allows optional evidence to be edited or cleared; exports Markdown or JSON locally; and
opens a GitHub new-issue form only after copying a draft. It explicitly marks the draft as not
submitted automatically. This is source-level evidence only: the packaged UI remains
`design/packages/ui`, which does not contain `IssueReportPanel.vue` or a `Report a problem` entry.

Acceptance is not yet proven. The draft wiring is visible only in the redesign panel; the packaged
repair surface still needs the production integration. The required Help/About and every relevant
failure-surface discovery audit remains open. There is no verified production submission flow, no
disposable-target submission proof, and no packaged application interaction evidence. No tests,
checks, or screenshots were run in this records-only pass. The current release/CI evidence is
release `v1.0.1411`, targeting `36c1d4d7` and citing successful CI run `32324227069`; that is
build/release evidence, not Issue #80 acceptance. Do not close Issue #80 until the packaged
implementation, adversarial redaction and accessibility/localization checks, genuine packaged
capture, and disposable submission record are available.

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
corrected the catalogue route, and registered the command-palette destination. The source navigation
and wiring are landed; they are not packaged, captured, or accepted runtime evidence.

This records-only lane intentionally ran no tests and took no captures. No implementation, packaged
application interaction, isolated-host publish/refresh/stop, merge, push, or cleanup was performed.
Issue #84 remains open until genuine packaged isolated-host proof is available, including
publish/refresh/stop, port and tunnel verification, browser opening, and dedicated screen checks.

## Issue #85 — SSH world, remote render, and remote hosting records (2026-08-19)

This records-only pass preserves issue #85 as open and unverified. The three feature documents
now state the exact missing evidence: an isolated disposable Linux OpenSSH host and an isolated
disposable Windows OpenSSH host, independently verified fingerprints, key-only authentication,
world browse/survey/diff/fetch/cancel, `rsync` and `scp` fallback or resume behavior, remote
render upload/launch/progress/reattach/collect/cancel, remote hosting publish/refresh/stop, and
redacted logs and captures. No real-host command output, transfer measurements, hashes, or
packaged captures were produced in this pass.

Remote hosting now has its source navigation dependency on issue #84 landed by `8e78a95c`: the panel
is mounted in the application’s discoverable tab navigation with saved-target and completed-render
context. The combined issue must not be closed until that source wiring is exercised in the packaged
application and its isolated-host acceptance evidence is resolved.

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
necessary, and verified with `gh api --hostname HOST user --jq .login` for the operation.
The broker then restores the account that was active beforehand; a restore refusal is
surfaced as an operation failure. Missing accounts, refused switches, and identity
mismatches stop before release mutation and expose the same-surface account recovery action.

The focused transport, sync, CI-render screen, and backup-run-card suites passed **148/148**;
app and UI typechecks, workspace build, and lint passed in the original repair lane. The
tests use fake process boundaries and did not create a repository, upload release data, or
run the original multi-gigabyte backup again. A genuine fixed-state packaged-app capture
remains open because the required cheap headless route is unavailable; a bridge-injected
image would not prove the repaired runtime seam. Issue #52 therefore remains open until
that capture evidence exists.

The current Worldlens baseline also carries the central `gh` process runner and `runToFile`
boundary (`2a3684f6`, `eb2663e1`), child-process close handling (`4d511d6c`), and cloud-render
restart/recovery integration (`f148a538`). The current default-branch SHA is
`761d9c5be80475908093554da2174a6de13c2c6f`; GitHub Actions run
[`32320134150`](https://github.com/Ding-Ding-Projects/worldlens/actions/runs/32320134150)
completed successfully for that SHA and published non-draft release
[`v1.0.1398`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1398),
whose six required assets are non-empty. The later GitHub Actions run
[`32320651851`](https://github.com/Ding-Ding-Projects/worldlens/actions/runs/32320651851)
also completed successfully for the same SHA.

### 廣東話同步

而家 Worldlens default branch 係
`761d9c5be80475908093554da2174a6de13c2c6f`；GitHub Actions run `32320134150` 對住同一個
SHA 成功完成，發布咗 non-draft `v1.0.1398`，六件 required assets 全部有非零大小。後續
`32320651851` 亦對住同一個 SHA 成功完成。呢啲只係 release/build record，唔代表 Issue #52
嗰張 genuine packaged fixed-state capture 已經存在。

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

Projects persist canonical `typescript` or `upstream-java` intent. The global new-project choice is
now wired through both real creation routes, `ProjectsScreen` and `WorldScreen`, in main commit
[`e3cf7f30`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3cf7f30b40989d83a6b8833b1f42894efa55623);
legacy files preserve their explicit engine intent. The packaged TypeScript staging path carries
and validates its required production dependency closure in main commit
[`80eefd17`](https://github.com/Ding-Ding-Projects/worldlens/commit/80eefd172d35b9329f95b464e20b56d415826025).
The local staging record reported **TypeScript 0.1.0** and **Java 5.22-27**.

The decisive acceptance evidence is still open: no genuine packaged project has been rendered
through both engines with output and provenance compared, and no matching capture evidence is
verified. Runtime routing for local, Docker, CLI, and restart-with-speed requests remains an
explicit boundary where not independently proven. This records reconciliation ran no tests,
builds, packaging, packaged interaction, or captures.

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

The hosted dispatch `32292039976` completed the two-wave render work: Wave 1 completed
**256/256** shards, Wave 2 completed **105/105** shards, and all **12/12** merge groups
completed successfully. The hosted-runner receipt verifier then failed during job setup because
the configured `actions/setup-node` SHA was invalid. Consequently the final merge verification,
lowres pyramid rebuild, Pages publication, and cleanup steps were skipped. No final map, public
openable result, or hosted-runner disk-ceiling proof is claimed.

The source-only correction removes one stray `e` from that `actions/setup-node` SHA. That historical
run remains a failed receipt setup; the terminal rerun below supplies the receipt evidence. Issue #67
remains open for the still-unverified Pages publication and near-limit refusal boundary.

The corrected rerun `32299613336` completed **361/361** shard jobs and **12/12** merge groups, but
its receipt remained a failure: the downloader collected only the single `rendered-map` artifact.
This multi-group run emits `map-lowres` plus `partial-hires-*`, so the assembled receipt reported
`hiresTileCount=0` and `metadata=false`. The source repair conditionally collects `map-lowres` and
every `partial-hires-*` artifact. Its terminal rerun is [32309098236](https://github.com/Ding-Ding-Projects/worldlens/actions/runs/32309098236),
successful on commit [`82a723bba0fc671e9880334c669086f2e07dc8b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/82a723bba0fc671e9880334c669086f2e07dc8b2).
The receipt verifies **361/361** shards, **12/12** merge groups, `mergedMapVerified=true`,
`lowresRebuilt=true`, `publicResult=openable`, **91,809/91,809** hires tiles, matching metadata,
verified textures, and cleanup with resumable state preserved. Disk evidence records
`5,825,668,056` required bytes, `91,864,993,792` free before fetch, `90,347,483,136` after
join/unpack, `90,250,326,016` at merge peak, and `88,018,407,424` after cleanup/completion;
`enospcObserved=false` and `noReleaseOnFailure=true`. The artifact-only dispatch skipped Pages
publication, so Pages remains unverified. This proves positive fit and cleanup, not a near-limit
refusal test.

This remains a records-only handoff: no tests, captures, build, or packaged interaction was performed
in this lane. The terminal hosted receipt is independently linked above; Issue #67 remains open for
the still-unverified Pages publication and near-limit refusal boundary.

廣東話：Hosted run `32292039976` 完成兩波 render：Wave 1 係 **256/256** 個 shard，Wave 2 係
**105/105** 個，**12/12** 個 merge group 都成功；但 receipt verifier 喺 job setup 因為
`actions/setup-node` SHA 無效而失敗，所以 final merge verification、lowres rebuild、Pages
publication 同 cleanup 全部跳過。Source 只係改走 SHA 入面多咗嗰一個 `e`，要 rerun 真係讀到
receipt 先算 runtime proof；而家唔會扮成 final map、public result 或 disk ceiling proof。
