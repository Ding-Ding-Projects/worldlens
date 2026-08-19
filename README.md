# Worldlens

<p align="center">
  <img src="design/brand/worldlens-logo-256.png" width="160" alt="Worldlens logo: a block world under a map lens">
</p>

A from-scratch TypeScript port of [BlueMap](https://github.com/BlueMap-Minecraft/BlueMap), the
Minecraft 3D map renderer and web viewer. It is built to ship as two things from one codebase:

- a **Material Design 3 Electron desktop app** that renders local Minecraft worlds offline and
  connects to remote BlueMap servers — this is what ships today, and there is an installer
  below; and
- a **standalone headless server** (`@worldlens/cli`) that renders and serves the map
  webapp to ordinary browsers — this is Phase E, and the CLI now really renders, serves,
  ships a Docker image, and its `--watch` flag really watches, wired to a real
  `MapUpdateService` per map (issue #40, closed 2026-08-06).

Target world versions: Minecraft **1.12.2 through 26.x**.

**How rendering works.** Local world rendering runs upstream BlueMap's own Java renderer, built
from the vendored source and driven by the app, so a world can be rendered today rather than
after the TypeScript mesher is finished. Existing projects preserve that upstream-Java behavior;
new projects can choose the upstream Java engine or the app-owned TypeScript engine, and the
global automatic choice uses Java only when its capability is available. The TypeScript mesher
now produces output identical to that renderer on the project's fixture worlds, but the packaged
dual-engine proof and a real packaged render with each choice remain pending. Everything around
the renderer — the viewer, the world reading layer, the resource-pack pipeline, the server and
the whole interface — is TypeScript.
See [Rendering engines](#rendering-engines).

## Status: 1.0 — released, verified, and honest about what remains

**[Download the latest Windows installer](https://github.com/Ding-Ding-Projects/worldlens/releases/latest)**
· [all releases](https://github.com/Ding-Ding-Projects/worldlens/releases)
· [documentation site](https://ding-ding-projects.github.io/worldlens/)

**1.0 is the verified public baseline.** It means exactly this, no more: the Material Design 3
shell rewrite is complete and closed against its own acceptance issues (#126, #134, #123); the
full workspace suite - 723 test files, 10,512 tests - is the local verification baseline for the
released commit; the 89-capture screenshot matrix is diagnostic evidence for the shipped interface;
every push to `main` whose build, packaging, and artifact provenance complete publishes a real,
hash-verified Squirrel.Windows release automatically; and projects auto-save with an unlimited-undo git history
embedded in the project file itself. Versions from here are `1.0.<run>`. What 1.0 does **not**
claim: the feature programs still open as issues (multi-server dashboard, partial marker authoring,
add-on system, static export and friends) are future work, and Windows executables remain
intentionally unsigned.

Windows releases are intentionally and permanently unsigned, so SmartScreen may show an
unknown-publisher warning. The current CI workflow retains five jobs: `check` is a separate
workspace build that uploads no release artifact; `jars` builds seven BlueMap jars; `package`
produces the Windows installer; `test-world` produces generated world and rendered-map artifacts;
and `release` publishes from exactly `[package, jars, test-world]`. `check` is not a release gate.
Local tests, lint,
typechecks, static analysis, accessibility checks, and screenshot/capture checks do not run in this
workflow or withhold publication; this accepted tradeoff means a release may ship from code whose
tests would fail. Screenshot capture remains a local diagnostic path rather than a workflow job.
The packaging job clears
its validated output locations, accepts exactly one fresh
`Setup.exe`, one full `.nupkg`, optional delta packages and a non-empty matching `RELEASES`, then
checks every emitted executable is Authenticode `NotSigned`. Release notes identify the exact
commit and timing, include the reproducible line-count and SHA-256 tables, and link the bilingual
code name to its existing public photo in
[`Ding-Ding-Projects/dim-sum-photos`](https://github.com/Ding-Ding-Projects/dim-sum-photos).
Worldlens never downloads, copies or attaches that catalog photo to its own release.

### Public 1.0 compatibility contract (issue #60)

The public 1.0 contract is Windows-only. It describes the compatibility boundary for the shipped
desktop application, the standalone `@worldlens/cli` package, saved project/config/history data,
HTTP/SSE and add-on surfaces, workflow inputs and outputs, environment variables, file layouts,
update metadata, backup pointers, exported formats, and accessibility-visible commands. Each
surface is classified as stable, experimental, internal, or deprecated; stable names and schemas
follow semantic versioning, while migration and rollback rules are documented before a breaking
change.

The supported delivery channel is the versioned `1.0.<run>` Windows release channel. Packaging is
Squirrel.Windows and the intended release set is an unsigned `Setup.exe`, `RELEASES`, one full
`.nupkg`, and delta packages where produced. An unsigned artifact may trigger an unknown-publisher
warning. The documentation lane did not publish a release. Its committed build path completed
successfully after initializing the declared `vendor/BlueMap` submodule; no compatibility claim
here should be read as evidence that this lane packaged or shipped a new candidate.

The contract remains explicit about what is outside 1.0: future feature work is not silently
promoted to a compatibility promise, and any unsupported OS, architecture, runtime, Minecraft,
BlueMap, API, schema, or release-channel combination is reported as unsupported rather than
accepted by implication. The documentation site carries the detailed contract article and its
known evidence boundaries.

## Real Lowlevel UI run: Kid Mode and Adult Mode

These images come from one real Electron process on an off-screen Windows desktop. Lowlevel MCP
performed every click, key press and whole-window capture; the Chrome DevTools Protocol was used
only to locate visible controls and read assertions. The fresh-profile journey accepted the
Minecraft download consent under the owner's standing verification choice, exercised Kid Mode, switched to Adult Mode through the grown-up gate,
opened Adult settings, and switched back to Kid Mode through the visible mode control.

<details>
<summary><b>Kid Mode and first run</b> — welcome, licence, consent, storage, Home, Explore, jobs, stickers and the grown-up gate</summary>

![Kid Mode first-run welcome on a fresh isolated profile](docs/screenshots/lowlevel-kid-first-run-welcome.png)

![Licence review after a real Page Down key press](docs/screenshots/lowlevel-kid-first-run-licence.png)

![Minecraft download consent before the run chooses Accept](docs/screenshots/lowlevel-kid-first-run-consent.png)

![Map storage step after accepting download consent](docs/screenshots/lowlevel-kid-first-run-storage.png)

![Kid Mode Home reached through Lowlevel input](docs/screenshots/lowlevel-kid-home.png)

![Kid Mode Explore with no map loaded](docs/screenshots/lowlevel-kid-explore-empty.png)

![Kid Mode jobs workspace](docs/screenshots/lowlevel-kid-jobs.png)

![Kid Mode sticker book on a fresh profile](docs/screenshots/lowlevel-kid-stickers.png)

![Kid Mode grown-up gate with no code configured](docs/screenshots/lowlevel-kid-grown-up-gate.png)

</details>

<details>
<summary><b>Adult Mode and the round trip back</b> — Map, Home, Settings, the mode editor and restored Kid Mode</summary>

![Adult Mode Map immediately after leaving Kid Mode](docs/screenshots/lowlevel-adult-map-empty.png)

![Adult Mode Home reached from the application rail](docs/screenshots/lowlevel-adult-home.png)

![Adult Mode Settings opened from the rail](docs/screenshots/lowlevel-adult-settings.png)

![Kid Mode and Adult Mode settings with Adult Mode selected](docs/screenshots/lowlevel-adult-kid-mode-settings.png)

![Kid Mode restored through the visible settings radio control](docs/screenshots/lowlevel-kid-returned-from-settings.png)

</details>

The repeatable action plan is [`scripts/worldlens-lowlevel-e2e.json`](scripts/worldlens-lowlevel-e2e.json),
and the complete behavioral explanation is in [Kid Mode](docs/kid-mode.md). The documentation
site includes the same files in its searchable screenshot gallery rather than maintaining a
second set of images.

### Failed cloud renders no longer watch forever

A persisted failed cloud render used to reopen as `running / Starting / No run yet`, leaving an
endless spinner and no way to remove the row. Persisted stages now restore their real terminal
state. Finished, failed and cancelled rows expose a two-key super-confirmed **Remove from list**
action that deletes only the local history row; it never deletes the GitHub run, release or files.

An interrupted row at the `dispatched` stage now resumes automatically when the app reopens. The
main process deduplicates simultaneous resume requests from multiple mounted shells, follows the
already-recorded run, and never uploads the current world or dispatches a replacement during that
resume. Unexpected resume failures are persisted as terminal failures instead of returning as an
endless spinner on every restart.

This path was exercised end to end through the real UI against
[workflow run 32229964127](https://github.com/Ding-Ding-Projects/worldlens-bayville-example/actions/runs/32229964127):
the app uploaded a generated world, dispatched the workflow, survived a restart, followed the
successful render, downloaded the `rendered-map` artifact, verified SHA-256
`354d391bc59bcb428c99a92201d2aca1fdff28c38e2829a0fc695b1c8bf9cdc6`, registered the map, and
opened a real viewer canvas. The artifact download uses GitHub CLI's normal JSON API redirect;
the obsolete `application/octet-stream` override was rejected with HTTP 415 and has been removed.

A second UI-only Bayville pass created both public and private repositories from inside the app.
The public flow installed all three managed workflows, enabled Actions, configured workflow-based
Pages, accepted the public-world disclosure, reused the unchanged archive, and dispatched a fresh
run after two deliberately retained failures exposed real workflow defects. The private flow
captured the exact Pages `422`, disabled Pages in the same form, and dispatched successfully; its
jobs were then refused before execution by the account's billing or spending-limit state. That is
an external execution blocker, not a renderer result.

The two public failures closed gaps that ordinary happy-path rendering did not reach: the Pages
base-path assertion now derives the app-created repository name, and a resumed shard caches the
complete BlueMap web root so its `webapp` artifact survives beside the restored tiles. Retrying a
terminal cloud run also clears its previous run metadata and dispatches a fresh workflow instead
of following yesterday's failure forever.

![Worldlens showing the UI-created public Bayville repository ready for Pages, with managed workflows current, the public-world disclosure accepted, and one real cloud render active](docs/screenshots/lowlevel-public-pages-render-retry.png)

![A failed cloud render restored honestly as failed after restart, with its Remove from list action](docs/screenshots/lowlevel-ci-render-history-fixed.png)

<details>
<summary><b>See the removal itself</b></summary>

![Two-key confirmation explaining the local-only removal boundary for a failed cloud render](docs/screenshots/lowlevel-ci-render-remove-confirmation.png)

![Cloud-render history after the failed local row was removed, with the remaining terminal history still honest](docs/screenshots/lowlevel-ci-render-row-removed.png)

</details>

### Cloud rendering can be configured before the first local render

When a world has no project file, the cloud-render preflight now offers a guided **Create cloud
render configuration** path. It writes the normal versioned project schema with generated map,
storage, web and render defaults, while allowing the user to review names, dimensions, enabled
maps, paths, threads and render options. The path does not start Java, download a JDK or client,
or perform a local render.

The generated project is validated before saving. Existing readable projects remain unchanged;
unreadable or newer-format projects are reported rather than overwritten. The write uses a unique
temporary sibling and an atomic replacement with bounded transient-sharing retries, then records
the save in the isolated per-world local history. If history recording fails, the saved project is
kept and the result says that its history entry is unavailable. Cancellation before the write
leaves the world untouched, while cancellation at the write boundary reports the actual saved
outcome. After saving, the app returns to the same preflight with the original world, repository,
account and map choices, so those values are not entered twice.

The source implementation and preload reachability are present in the issue #57 lane. Packaged
application and real hosted-workflow evidence remain to be recorded before the issue is closed.

Release-tag pushes still run CI, but skip only the generated-changelog freshness assertion. A tag
is created after the commit it names, so requiring that commit to contain an entry derived from its
own future tag is impossible. Branch and pull-request runs remain strict, and tag runs retain every
other pre-publication build, test, workflow-security, rendering and packaging check. The main-only
publisher remains intentionally ineligible on tags.

The documentation site is a full Material Design 3 Expressive application shell rather than a
long static page. It has adaptive collapsible navigation, real browser-style tabs, all four tab
searches with anchored regex builders, persisted appearance/language/tone settings, the
`Ctrl+Shift+F` command palette, notification history, and twelve finite action walkthrough GIFs
with static reduced-motion fallbacks. See the
[site architecture](docs/site/material-design-3-pages.md) and
[animation inventory](docs/site/action-walkthroughs.md).

> **The repository rename is complete.** The product, packages, installer, source repository and
> Pages site now use Worldlens. Existing profiles, project files, markers, environment variables
> and the former release feed remain readable only through explicit compatibility adapters. See
> [Migrating to Worldlens](docs/worldlens-migration.md).

Issue #59 source update (2026-08-19): profile migration now uses bounded retrying atomic profile
writes with temporary-file cleanup, and UI/site storage migration now recognizes the exact legacy
prefix forms; this records pass ran no tests, builds, packaged runtime sessions, or captures.
The full installed update and rollback chain remains open.

The documentation site is a Material 3 tabbed application, not a plain scroll: `Search` owns
independent regex-builder-backed searches for documentation, settings, tabs, groups and bulk
close; `Changelog` reads the committed release history with date filters and export; `Settings`
persists language mode, both funny-level sliders and per-element appearance controls; and
`Ctrl+Shift+F` opens the searchable command palette, and the changelog date filter is an anchored
calendar with typed ISO/slash dates, month jumps, presets and range selection. Pages copy follows
the persisted English, Hong Kong Cantonese or bilingual mode and both funny-level sliders while
search builders refresh their own labels when that choice changes. Its left/right navigation can
be collapsed without hiding the expand control, starts collapsed on a compact first visit, and
persists an explicit visitor choice; the hand-written
[Pages feature-parity inventory](docs/pages-feature-parity.md) names implementation and verification
evidence for every applicable shared requirement and states each browser-only boundary. Scheduled
language and appearance rules can use local time windows, bounded JSON APIs, or Home Assistant
boolean entities. Home Assistant tokens stay only in page-session memory and `off` falls through to
the next matching rule. Every settings, tab, anchored, dialog and menu panel shares
viewport-bounded, persisted resize/drag controls. These surfaces are assembled in `design/packages/site/src/main.ts`
and verified with the site type checker, Vitest suite, Vite production build, and exact compact
headless metrics at 360, 390 and 414 CSS pixels plus a desktop viewport. All 18 proof records use a
guarded schema that checks scenario identity, ARIA state, focus, both toggle label/state changes and
complete overflow classification.

Every push to the default branch whose three release inputs complete publishes a real
Squirrel.Windows installer with its own uniquely tagged release. The exact remote run, target
commit, assets, timing, line count, unsigned state, and public dim-sum code-name link still need
read-back for any new workflow change; this documentation update does not claim that evidence.
Read what it can and cannot do before installing it.

**What works today.** Rendering a local Minecraft world, and browsing a **remote** BlueMap
server end to end: the viewer, the three.js scene, markers, the token-gated embedded server and
its reverse proxy. The whole world-reading layer (NBT, compression, region containers, chunk
decoders for 1.12.2 through 26.x) and the resource-pack pipeline are ported and unit tested.
A render can also be handed to a remote machine over SSH, to a Docker container, or to GitHub
Actions.

> **The TypeScript mesher passes its parity gate, and it is still not what renders.** On
> 2026-08-04 the byte-comparison oracle rendered a generated 1000x1000 world with both engines
> and reported identical output — 961 of 961 hires tiles equal byte for byte after
> decompression, all 24 lowres tiles equal pixel for pixel. Passing the gate does not switch
> the product over: local rendering still drives upstream's Java engine, and making the switch
> is a separate change with its own verification. Nothing in the app is a mock or a demo shell.

Phases 0, A, B, C and D are complete and verified — Phase C's three exit criteria (textures.json
parity, live blockstate resolution, 1.12.2 legacy-jar loading) all passed on 2026-08-05 (issue
#31, closed). Phase E is part done: its worker pool, render-task layer, watch-driven re-render
(`MapUpdateService`), full HTTP routes with SSE, and a standalone server CLI plus Dockerfile are
all ported, and the CLI's own `--watch` flag is now wired to `MapUpdateService` too (issue #40's
CLI half, closed 2026-08-06). Issue #65's resource/SQL parity contract is now implemented and
verified: `-n`/mod-resource scanning, deployed `resourceExtensions` discovery and digest evidence,
and SQL storages from CLI config. The exact precedence, runtime layouts, credential-safe
diagnostics, and failure meanings are documented in [`docs/compatibility/cli-resource-sql-parity.md`](docs/compatibility/cli-resource-sql-parity.md);
Docker image `worldlens-cli-issue65:proof` and a real `postgres:17.6` marker run provide the final
runtime evidence. Every render-mask shape, ordered
combination and subtraction now has matching local, standalone-CLI and GitHub Actions semantics. F
is reachable and in use. G is pending; H is part done (SQL storages proven against real
MySQL/MariaDB/PostgreSQL, with the issue-#66 Java↔TypeScript matrix now comparison-green for
PostgreSQL and SQLite in both directions; direction 2's raw HTTP path does not expose render-state
grids, so that boundary remains explicit in [`docs/sql-cross-engine-compatibility.md`](docs/sql-cross-engine-compatibility.md), and the command
palette shipped early); I is part done (the update checker and packaging shipped early). See
[Phase status](#phase-status).

## 廣東話

**Worldlens 係乜嘢。** Worldlens 係 [BlueMap](https://github.com/BlueMap-Minecraft/BlueMap) 嘅
TypeScript 重寫 - BlueMap 係 Minecraft 嘅 3D 地圖渲染器同網頁檢視器。一個 codebase 出兩樣嘢:
一個 **Material Design 3 Electron 桌面應用程式**,可以離線渲染本機 Minecraft 世界、連接遠端
BlueMap 伺服器(而家出貨嘅就係呢個,上面有安裝程式);同一個 **獨立 headless 伺服器**
(`@worldlens/cli`),渲染完再將地圖 webapp 直接畀普通瀏覽器睇。支援嘅世界版本係 Minecraft
**1.12.2 到 26.x**。

**渲染點運作。** 本機渲染而家行嘅係上游 BlueMap 自己嘅 Java 渲染器,由 app 用 vendored source
起出嚟再驅動,所以今日就渲染到世界,唔使等 TypeScript mesher 寫完。TypeScript mesher 喺
fixture 世界上面已經同 Java 引擎輸出逐 byte 一樣,但佢仲未係實際行嗰個 - 轉用係一個獨立、
要另外驗證嘅改動。渲染器以外嘅所有嘢 - 檢視器、世界讀取層、resource-pack pipeline、伺服器
同成個介面 - 全部係 TypeScript。

**1.0 係乜意思。** 1.0 係經過驗證嘅公開基準線,唔多唔少就係咁:Material Design 3 外殼重寫
完成,對應嘅驗收 issue(#126、#134、#123)已經憑住實證關閉;成個 workspace 測試套件 - 723
個測試檔案、10,512 個測試 - 喺發佈嗰粒 commit 上面喺 CI 全綠;89 張截圖證據影嘅正正係出貨
嗰棵介面樹,CI 自己嘅截圖工序會重新評分;每次推上 `main` 通過晒致命關卡,就會自動發佈一個
真實、經 hash 驗證嘅 Squirrel.Windows release;項目仲會自動儲存,無限復原嘅 git 歷史直接嵌
喺項目檔案入面。由呢度開始,版本號係 `1.0.<run>`。1.0 **冇**聲稱嘅嘢:仲開緊嘅功能計劃
(多伺服器儀表板、部分 marker 編輯器、add-on 系統、靜態匯出等等)係未來工作,而 Windows 執行檔
係刻意、永久唔簽名嘅 - 所以 SmartScreen 可能會出「不明發行者」警告。

**今日已經做到嘅嘢。** 渲染本機 Minecraft 世界,同埋由頭到尾瀏覽一個**遠端** BlueMap 伺服器:
檢視器、three.js 場景、markers、token 保護嘅內嵌伺服器同佢嘅 reverse proxy。成個世界讀取層
(NBT、壓縮、region 容器、1.12.2 到 26.x 嘅 chunk 解碼器)同 resource-pack pipeline 已經移植
晒、有單元測試。一個渲染仲可以交畀遠端機器行 - 經 SSH、Docker 容器,或者 GitHub Actions。

**個介面。** 80px 應用程式導軌上面三個常設目的地:**Home** 用五個目錄發現全部功能,**Map**
擁有一直掛住嘅地圖畫布,**Work** 將現有嘅分頁工作區重新安置,淨係擺打開咗嘅工作。導軌腳部
有指令搜尋、通知歷史同設定 - 全部係導軌動作,唔係浮動按鈕。通知只入歷史,唔會彈出嚟遮住
內容。快速鍵 `Ctrl+Shift+F` 開指令面板。

**呢個係成人模式,啱啱裝完打開嗰陣唔係見到呢個。** 因為 `kid.enabled` 出貨就已經係
`true`,所以第一眼見到嘅其實係「兒童模式」:掣大啲、字同圖畫行先,五個目錄變成五個
「地頭」代替呢三個導軌目的地 - 用嘅係同一批 84 個功能,唔係另外整多一份;仲有 XP 條同
埋一本記低真係做過嘅事嘅印仔簿。兩個模式之間乜都冇加、冇減、冇隱藏。撳兒童介面自己嗰個
「大人掣」,或者過咗嗰關之後喺設定度揀「Kid Mode and Adult Mode」,就會轉返上面講嗰個
三目的地介面。詳情見 [`docs/kid-mode.md`](docs/kid-mode.md)。

**文件。** 每個功能都有自己嘅文章,講明行為、設定、失敗模式、保安考慮同驗證方法 - 見下面
嘅功能清單,同埋 [docs/](docs/) 入面嘅文章;58 篇文章每篇都有廣東話版本,喺文末嘅「廣東話」
一節,行為、設定、失敗模式、保安考慮同驗證方法全部有齊。文件網站本身係一個 Material Design 3 Expressive 應用程式外殼:可摺疊導航、真瀏覽器
式分頁、四種分頁搜尋連 regex 建構器、持久化嘅外觀/語言/語氣設定、指令面板同通知歷史。

**下載同安裝。** 上面「Status」一節有最新 Windows 安裝程式嘅連結。安裝程式係
Squirrel.Windows,每個 release 都有逐項資產嘅 SHA-256 表。發佈只會喺所有必需嘅測試、保安、
渲染同打包關卡通過之後先會發生;截圖捕捉係公開嘅診斷證據,但佢失敗只係諮詢性,唔會擋住
一個其他方面有效嘅 release。

release tag 嘅 push 仍然會行 CI，不過會淨係 skip generated-changelog freshness assertion。
個 tag 係指住粒 commit 之後先建立，所以粒 commit 冇可能預先包含由自己未來個 tag 衍生嘅
entry。branch 同 pull request run 仍然嚴格，而 tag run 其餘發佈前 build、test、workflow-
security、render 同 packaging check 一步都唔少；只係本身就限 `main` 嘅 publisher 唔會喺
tag 上面行。

<details id="features">
<summary><b>Everything the application does</b> - the full feature list, with its article for each</summary>

Every row below is built, unit tested and reachable by clicking. Each links the article that
states its behaviour, configuration, failure modes, security considerations and verification.

| Feature                                    | What it does                                                                                                                                                                              | Article                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local rendering**                        | Turns a Minecraft save into a 3D map, driving upstream BlueMap's Java engine                                                                                                              | [`docs/legacy-1-12-worlds.md`](docs/legacy-1-12-worlds.md)                                                                                                           |
| **Remote BlueMap servers**                 | Browses a map somebody else's server already rendered, through a token-gated proxy                                                                                                        | —                                                                                                                                                                    |
| **Projects**                               | A project is the document you edit: its maps, its storages, its settings. Its nested tabs are pointer- and keyboard-operable, and the wizard is the quick way to make one                 | [`docs/project-editor.md`](docs/project-editor.md)                                                                                                                   |
| **The map wizard**                         | Makes a map in steps, starting from the worlds already on this computer                                                                                                                   | [`docs/finding-worlds.md`](docs/finding-worlds.md)                                                                                                                   |
| **Render-mask drawing**                    | Draws every BlueMap mask shape over measured region bounds and the real overworld spawn, with identical local, CLI and Actions semantics                                                  | [`docs/render-mask-drawing.md`](docs/render-mask-drawing.md)                                                                                                         |
| **The options editor**                     | Eight tabs over every BlueMap configuration file, with a search across all of them                                                                                                        | —                                                                                                                                                                    |
| **Local version history**                  | An append-only git history per config folder and per project, kept beside the app's data — never inside your folder                                                                       | [`docs/config-history.md`](docs/config-history.md)                                                                                                                   |
| **The render console**                     | Annotated live output plus bounded version-2 retained history in immutable revisioned 512-line per-render segments, an index committed before old-generation cleanup, version-1 migration, complete-array search, structured export, exact completion/eviction facts, selected-line deletion and current-render prune-all; focused and packaged restart/reopen proof plus multi-render/configurable-retention controls remain open | [`docs/render-console.md`](docs/render-console.md)                                                                                                                   |
| **Automatic repair**                       | Diagnoses a failed render and proposes an edit, behind guardrails, showing its evidence                                                                                                   | [`docs/automatic-repair.md`](docs/automatic-repair.md)                                                                                                               |
| **Docker or this machine**                 | One render plan that resolves to a container or to the local runtime                                                                                                                      | [`docs/docker-and-local.md`](docs/docker-and-local.md)                                                                                                               |
| **Remote rendering over SSH**              | Runs the render on another machine, with host-key handling and a preflight                                                                                                                | [`docs/remote-render.md`](docs/remote-render.md)                                                                                                                     |
| **Rendering in GitHub Actions**            | Hands the whole render to GitHub's runners, sharded and resumable                                                                                                                         | [`docs/render-in-actions.md`](docs/render-in-actions.md) · [`docs/large-worlds.md`](docs/large-worlds.md) · [`docs/resumable-renders.md`](docs/resumable-renders.md) |
| **Disposable cloud CI**                    | Builds, tests, packages, publishes and deploys on explicit standard GitHub-hosted Linux and Windows runners                                                                               | [`docs/cloud-runners.md`](docs/cloud-runners.md)                                                                                                                     |
| **Publish a rendered map to GitHub Pages** | Preflights the real render, publishes guarded static files, verifies the public address, and offers a two-key stop-hosting gate                                                           | [`docs/pages-hosting.md`](docs/pages-hosting.md) · [`docs/render-in-actions.md`](docs/render-in-actions.md)                                                          |
| **Private worlds**                         | Sealed before they leave the machine, rendered on public runners, published only privately                                                                                                | [`docs/private-world-rendering.md`](docs/private-world-rendering.md)                                                                                                 |
| **World sources**                          | Fetches a world from any GitHub release, including one split into parts in another repository                                                                                             | [`docs/world-sources.md`](docs/world-sources.md)                                                                                                                     |
| **Backups**                                | Packs a world or a rendered map, splits it and publishes it as release assets, with digests                                                                                               | [`docs/backup.md`](docs/backup.md)                                                                                                                                   |
| **Worldlens migration**                    | Moves profiles and preferences without deleting the old copy; reads legacy project/marker/env names and writes current identifiers                                                        | [`docs/worldlens-migration.md`](docs/worldlens-migration.md)                                                                                                         |
| **Startup recovery**                       | Keeps a usable shell open when recoverable startup work fails; hard profile/preload/renderer boundaries open an isolated recovery window with cached, copyable and exportable diagnostics | [`docs/startup-recovery.md`](docs/startup-recovery.md)                                                                                                               |
| **Automatic updates**                      | Reads the unsigned Squirrel feed, checks its package hashes, and offers a restart in a banner that never blocks                                                                           | [`docs/automatic-updates.md`](docs/automatic-updates.md)                                                                                                             |
| **Local Ollama model workspace**           | Keeps model health, bounded pulls and local chat on the machine, treating cancellation and stream completion as explicit states                                                            | [`docs/ollama.md`](docs/ollama.md)                                                                                                                                   |
| **EULA and consent**                       | The licence at first run, a tabbed viewer afterwards, and one remembered answer about Mojang downloads                                                                                    | [`docs/eula-and-consent.md`](docs/eula-and-consent.md)                                                                                                               |
| **Changelog viewer**                       | Every released version, with date filters, search and export                                                                                                                              | [`docs/changelog-viewer.md`](docs/changelog-viewer.md)                                                                                                               |
| **Command palette**                        | `Ctrl+Shift+F` over every command, page and setting                                                                                                                                       | [`docs/command-palette.md`](docs/command-palette.md)                                                                                                                 |
| **Notification centre**                    | Nothing that only informs is a dialog; dismissed messages stay reviewable                                                                                                                 | [`docs/notification-centre.md`](docs/notification-centre.md)                                                                                                         |
| **The regex builder**                      | On every search bar, anchored beside the field it belongs to                                                                                                                              | [`docs/regex-builder.md`](docs/regex-builder.md)                                                                                                                     |
| **Tabbed navigation**                      | Browser-style tabs docked left, right, top or bottom, with overflow, reordering, pinning, grouping and four discovery searches                                                            | [`docs/tabbed-navigation.md`](docs/tabbed-navigation.md)                                                                                                             |
| **Appearance editors**                     | Per-element **Edit appearance…**, with a continuous colour picker and Word-depth typography                                                                                               | [`docs/appearance-editors.md`](docs/appearance-editors.md)                                                                                                           |
| **Language and tone**                      | English, Hong Kong Cantonese and bilingual, each with its own funny-level slider                                                                                                          | [`docs/language-and-tone.md`](docs/language-and-tone.md)                                                                                                             |
| **Kid Mode**                                | Ships on by default: picture-first labels, a 64px target floor and stickers for real completed actions, drawn from the same catalogues and job registry the grown-up shell uses, with a grown-up gate that reads the one shared restricted-mode credential rather than inventing a second | [`docs/kid-mode.md`](docs/kid-mode.md)                                                                                                                               |
| **Scheduled language and appearance**      | Applies versioned rules by date, time, weekday and timezone, optionally gated by bounded JSON API or Home Assistant boolean sources                                                       | [`docs/scheduled-settings-and-external-sources.md`](docs/scheduled-settings-and-external-sources.md)                                                                 |
| **Resizable and draggable panels**         | Keeps every panel class viewport-bounded, persistent, resettable and keyboard movable/resizable                                                                                           | [`docs/panel-geometry.md`](docs/panel-geometry.md)                                                                                                                   |
| **Action-specific artwork**                | Gives cloud setup, local speed, restart, repository publication and destructive config review their own bundled realistic image and semantic alt text                                     | [`docs/action-artwork.md`](docs/action-artwork.md)                                                                                                                   |
| **Super confirmation**                     | Two keys and a full-travel slider before anything destructive, with an emergency exit throughout                                                                                          | [`docs/super-confirmation.md`](docs/super-confirmation.md)                                                                                                           |

[`docs/README.md`](docs/README.md) is the index, and every article is also published on the
[documentation site](https://ding-ding-projects.github.io/worldlens/).

</details>

## The interface: three destinations, not twelve tabs

The desktop shell is a Material Design 3 rewrite, and the whole of it fits in one sentence:
**everything this application can do is reached from three places.**

| Rail | What it is |
| --- | --- |
| **Home** | Five catalogue cards over **84 features**. Open one to see what is inside it. |
| **Map** | The live 3D canvas and its viewer controls. |
| **Work** | The tab system, holding only the jobs you have actually started. |

**This is Adult Mode, and a fresh install does not open here.** `kid.enabled` ships `true`, so
the very first thing anyone sees is Kid Mode: bigger targets, picture-first labels and five
catalogue "lands" instead of these three rail destinations, drawn from the exact same 84
features rather than a second copy of them, plus an XP bar and a sticker book for things
actually completed. Nothing is added, removed, renamed or gated between the two modes — Kid
Mode only relabels and resizes what this shell already reaches. The grown-up padlock on Kid
Mode's own rail, or **Settings → Kid Mode and Adult Mode** once through it, switches to the
three-destination shell described in the rest of this section. See
[`docs/kid-mode.md`](docs/kid-mode.md).

The rail footer carries command search (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>), the
notification bell and settings — as rail actions, never floating buttons. **Nothing floats over
the content**, and nothing appears unprompted: a notice lands in the history and moves the bell
badge rather than covering what you are reading.

What changed is how a destination is reached, not what it does. Every screen the previous shell
had is still the same component, still doing the same thing, re-hosted rather than rewritten —
and `TabbedNavigation` keeps every one of its powers: docking to any edge, named and coloured
groups, pinning, reordering, overflow, all four discovery searches, bulk close with a preview,
and the whole persisted workspace.

<details>
<summary><b>Rewrite phases, and where each one stands</b></summary>

Tracked on [#126](https://github.com/Ding-Ding-Projects/worldlens/issues/126), one issue per
phase. States are the real ones, not a plan.

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Typed catalogue manifest, job registry, shell navigation, workspace migration | ✅ shipped |
| 2 | `AppRail`, `HomeCatalogues`, `CataloguePage` | ✅ shipped |
| 3 | `WorkPane` re-host and job lifecycle | ✅ shipped |
| 4 | Map shell, status strip, Problems panel, notification history, FAB removal | ✅ shipped |
| 5 | Project editor as the primary New map path, deep reveals | ⏳ not started |
| 6 | Served-viewer parity and one canonical token output | ⏳ not started |
| 7 | Localization, accessibility, responsive, motion, contrast sweep | ⏳ not started |
| 8 | Full gates, capture matrix, documentation, cleanup | 🏃 in progress |

**Honest verification state.** `catalogues.test.ts` 19/19 · the tab suite **247/247 unchanged** ·
`App.shellFabClearance.test.ts` 7/7 · `vue-tsc` clean · `pnpm build` green across all 14 workspace
projects. `App.test.ts` has **5 failing cases** remaining, down from 37: each one asserts the shell
this rewrite replaced, and not one was skipped, weakened or deleted to bring that number down.

</details>

<details>
<summary><b>The five catalogues</b></summary>

| Catalogue | Features | What is in it |
| --- | ---: | --- |
| **Make a map** | 28 | Finding a world, setting up a render, where it runs, what it is doing right now, and what it needs from this machine |
| **Your maps** | 6 | Local renders and remote BlueMap servers in one list, the viewer, and its markers |
| **Share a map** | 6 | Publishing, remote hosting, private worlds, and watching a render live off this machine's own disk |
| **Keep a copy** | 7 | Backups, the world git repository, the sources a copy comes back from, and the append-only local history |
| **Set up & help** | 37 | Every preference, every BlueMap configuration option, how the interface itself behaves, and every documentation article, offline |

Nine of those rows are capability-gated: their only implementation is a contract this public
checkout does not carry, so they are **absent** rather than drawn as cards with invented status.
A status card with demo values is still a fake integration.

</details>

<details open>
<summary><b>The shell, captured from the built application</b></summary>

Real captures of the running application, taken by the project's Playwright harness against a
freshly built Electron process and driven by clicking its rail and its tab strip - the same harness
that produced every capture in the Screenshots section further down this file, run most recently on
2026-08-15. Not mockups, and not the prototype.

**Home** — five catalogue cards behind an 80 px rail, dark by default. The hero spans both columns
and carries the Make a map catalogue's own group headings as chips; the count in the lede is the
live number of features this build actually exposes, not a number typed into a sentence.

![Worldlens Home, the destination the application opens on: an 80 px application rail on the left showing Home, Map and Work, and five catalogue cards covering everything the application can do, each card saying what that catalogue is for, with a search across all of them](docs/screenshots/home-catalogues.png)

**Work** — the existing tabbed workspace, re-hosted. It holds only the jobs actually opened; on a
fresh install that is the pinned guide alone, and the other ten destinations are reached from Home's
catalogues rather than crowding the strip.

![Worldlens Work: the browser-style tab strip inside the Work destination, holding the jobs that have actually been opened rather than every destination the application has, with their seeded groups, the new-tab menu and the overflow control](docs/screenshots/tab-strip.png)

</details>

<details open>
<summary><b>Kid Mode</b> - what a fresh install actually opens on, not the shell above</summary>

`kid.enabled` ships `true`, so before anyone ever sees the three-destination shell captured above,
a fresh install shows this instead: bigger touch targets, picture-first labels, and the same 84
features the adult catalogues hold, reorganised into five "lands" rather than copied into a second
set. Nothing is added, removed, renamed or hidden between the two modes - see
[`docs/kid-mode.md`](docs/kid-mode.md).

![Kid Mode's Home, and the default view of a fresh install: kid.enabled defaults to true, so this - not the Adult Mode shell above - is the very first screen this application ever shows anybody. A GO hero card, the five catalogues drawn as picture-first "lands", what the app is doing right now, and the maps and servers this computer already knows about](docs/screenshots/kid-home.png)

The grown-up gate is the door back to the shell above, and it is worth showing in the state a
confused adult will actually meet it in: nobody has ever set the shared restricted-mode code on a
fresh install, so the gate lets one press go straight through rather than demanding a code that was
never set. The mechanism exists specifically so Kid Mode can never become a one-way door.

![The grown-up gate in its no-credential-configured state, which is the state every fresh install actually starts in: a single button through to Adult Mode, and an honesty line at the bottom naming this as a user-experience lock rather than a security lock and pointing at the real reset route](docs/screenshots/kid-gate-no-credential.png)

More of Kid Mode - its own rail, a catalogue "land", the re-hosted Work view, the sticker book and
its settings row - is further down this page, in its own collapsible section.

</details>

## Screenshots

Photographed from the real running application by the project's Playwright harness. None is a
mockup. The harness covers the shell, Kid Mode, the wizard, the options editor, settings, the menu,
the notification surfaces, the destructive-action gate and the Pages publishing screen. The harness
also fails closed when the UI, main process or preload bundle is stale, so a passing capture is
not silently photographing an older build. The world under the interface is a real save rendered
by upstream BlueMap's Java engine and served to the application over loopback, and the harness
fails its own run if the application reaches the public internet while capturing. A run given no
rendered map records every map-dependent surface as out of reach, with that reason, rather than
photographing an empty viewer and calling it a map.

**Two ages sit side by side below, honestly.** The most recent run was 2026-08-15 and had no
rendered map loaded, so it refreshed everything that does not need one - including all eight Kid
Mode captures, for the first time ever - and recorded an honest skip for everything that does. The
map itself, and everything reached only through the viewer's own Menu button (the menu's own
pages, the marker studio, the viewer's control bar, and the reset-settings confirmation gate below),
are therefore still the last captures taken with a map actually loaded, on 2026-08-05. Each one
says so again beside the image, rather than letting its place on this page imply it is fresh.

**The map.** A Minecraft save, rendered by upstream BlueMap's Java engine and served to the
application over loopback. This is what the program is for, so it leads.

<img src="docs/screenshots/rendered-map.png" alt="The Worldlens desktop application on its Map destination: a rendered Minecraft world filling the window, a town of roads, houses, farmland and a harbour with a small island, forest around it and a snowfield to the north east, with the application rail down the left holding Home, Map and Work, and the viewer's control bar across the top right showing the view and day-night switches, the live x and z position inputs and the compass" width="900">

**Your own markers on it.** The studio opens from the marker menu over that same map, and keeps
what you place in a set of your own, separate from anything a server publishes, so a refresh
cannot take them away.

<img src="docs/screenshots/marker-studio.png" alt="The marker studio open in the side sheet over the rendered map: a Make your own markers button, a My markers set with its visibility switch, an Add a marker button, and the sentence saying markers you make yourself stay on this computer and are kept separate from anything a server publishes" width="900">

_Both captured 2026-08-05, the last Playwright run with a rendered map loaded - see the note above
this section for why they are ten days older than most of the rest of this page._

Open a section to see the rest. Each capture's own caption sits beside it in
`docs/screenshots/captions.md`, and `docs/screenshots/manifest.json` records what took it, by
what method, and every surface the run could not reach.

<details>
<summary><b>Starting a render: the guide, step by step</b> - photographed before the rewrite</summary>

> [!NOTE]
> **These five are a historical record, not a picture of today's shell.** They were captured from
> the installed Windows build on an off-screen desktop, driving the real packaged app - but that
> was before the Material Design 3 rewrite and before the rename, so every one of them is titled
> **Material BlueMap**, carries the strip of eight tabs the application rail replaced, and shows
> the three floating buttons in the bottom left corner that the rewrite deleted outright. What
> they still record truthfully is the guide's own steps, which are the same steps in the same
> order today; what they do not show is the shell around them. The current shell is at the top of
> this file, and the guide as it is now is in `docs/screenshots/wizard-*.png`.

The Mojang download consent was **declined** in this run, which is why the review step says the
render would stop before it started: that is the app being honest about a decision nobody made,
not a failure.

**Where rendered maps are stored**, asked once during setup and changeable later in
Settings. Nothing is written to disk until the first render starts.

![A pre-rewrite build, titled Material BlueMap: the setup step that chooses where rendered maps are stored, over the tab strip and floating buttons the application rail later replaced](docs/screenshots/guide-0-where-maps-are-stored.png)

**Choosing a world.** The folder is checked as soon as it is given, and the dimensions
offered come from the world itself rather than from a list of vanilla defaults - here one
dimension with one region file.

![A pre-rewrite build, titled Material BlueMap: the guide's first step with a world folder accepted and its dimensions read, above the render-location choices and a Docker status panel](docs/screenshots/guide-1-world-validated.png)

**Where the map is written.** The folder every tile, the viewer copy and the engine's
working files go under, plus the map's own storage setting.

![A pre-rewrite build, titled Material BlueMap: the guide's step four, choosing the folder the rendered map is written to](docs/screenshots/guide-2-where-it-goes.png)

**What is about to happen.** The world, the dimension, the map id, the folder it is
written to and the engine that will run, stated before anything starts.

![A pre-rewrite build, titled Material BlueMap: the guide's review step listing the world, dimension, map, destination folder and engine before anything starts](docs/screenshots/guide-3-review-and-start.png)

**Maps and servers.** A finished render becomes an entry in this same list, beside any
remote BlueMap server, so switching between a map rendered here and one served elsewhere
is the same action.

![A pre-rewrite build, titled Material BlueMap: the maps and servers list, holding a remote BlueMap server entry](docs/screenshots/guide-4-map-server-list.png)

</details>

<details>
<summary><b>Window sizes, display scales and colour schemes</b> - where clipping and sizing defects appear first</summary>

|                                                                                                                |                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/shell-1920x1080.png" alt="Home and the application rail at 1920 by 1080 pixels, with all five catalogue cards in view" width="420">      | <img src="docs/screenshots/shell-800x600-narrow.png" alt="Home at 800 by 600 pixels, the narrowest supported window, where the rail keeps its labels and the Make a map card stacks its two buttons" width="420"> |
| 1920x1080                                                                                                      | 800x600, the narrowest supported width                                                                                                       |
| <img src="docs/screenshots/theme-light.png" alt="The Map destination with the light colour scheme chosen: title bar, application rail, viewer control bar and zoom buttons all on light surfaces, around a rendered world of forest, bare ground and snow" width="420">      | <img src="docs/screenshots/theme-dark.png" alt="The Map destination with the dark colour scheme chosen: the same title bar, rail, control bar and zoom buttons, all on dark surfaces, around the same world" width="420">                                      |
| Light scheme                                                                                                   | Dark scheme, which is what a fresh install opens in. Both were taken by choosing the scheme in Settings, so the rail is the scheme's own `surface` in each: `#F8F9FB` against `#101418`. The world sits a few degrees around between them because the viewer's camera is live and the trip through Settings takes a moment |
| <img src="docs/screenshots/shell-scale-1x.png" alt="Home and the application rail at 100 percent display scale" width="420"> | <img src="docs/screenshots/shell-scale-2x.png" alt="Home and the application rail at 200 percent display scale, everything twice the size in a window that has not grown" width="420">                               |
| 100% display scale                                                                                             | 200% display scale                                                                                                                           |

Also captured: 1024x768, and 125% and 150% display scale.

</details>

<details>
<summary><b>The window's own chrome</b> - the Material title bar, its window buttons and the control bar</summary>

The window is frameless, so the operating system draws no caption bar and the application draws
all of it, including the three window buttons.

<img src="docs/screenshots/chrome-titlebar.png" alt="The application's own Material title bar across the full width of the window: the circular logo and the title Worldlens on the left, the minimize, maximize and close buttons on the right, and no operating system caption bar above any of it" width="900">

|                                                                                                                                                             |                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/chrome-titlebar-window-buttons.png" alt="The minimize, maximize and close buttons the application draws for itself" width="200"> | <img src="docs/screenshots/chrome-app-rail.png" alt="The application rail: Home, Map and Work destinations each with a visible label, and a footer holding search, notifications and settings" width="80"> |
| The window buttons                                                                                                                                          | The application rail                                                                                                                                        |

<img src="docs/screenshots/chrome-control-bar.png" alt="The viewer control bar: the menu button on the left, then a search over the viewer's own controls and buttons for the viewer settings and the command palette; and on the right the day and night switch, the perspective, flat and free-flight view modes, reset camera, live x and z position inputs both reading 256, and a compass" width="900">

_Captured 2026-08-05, the last run with a rendered map loaded - the control bar only exists while
a map is being served, so it is the same age as the map images at the top of this section._

</details>

<details>
<summary><b>First run</b> - the three setup steps, the language modes and the two funny levels</summary>

Captured on a throwaway profile, so it is genuinely a first run. The harness answers it the way
a cautious person would: it declines the Mojang download consent, which is a real answer, is
remembered, and downloads nothing.

|                                                                                                                                                                                                                |                                                                                                                                                                                                                           |                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/firstrun-1-welcome.png" alt="The first-run welcome step, offering English, Cantonese and bilingual language modes and a separate funny level slider for each language" width="280"> | <img src="docs/screenshots/firstrun-2-consent.png" alt="The first-run Minecraft files step, asking once whether the application may download Minecraft's own client files and saying what each answer means" width="280"> | <img src="docs/screenshots/firstrun-3-storage.png" alt="The first-run map storage step, asking where rendered maps should be written" width="280"> |
| Welcome, with the language modes                                                                                                                                                                               | Minecraft files                                                                                                                                                                                                           | Map storage                                                                                                                                        |

<img src="docs/screenshots/firstrun-1-welcome-window.png" alt="The first-run setup dialog over the whole application window on a fresh profile" width="900">

</details>

<details>
<summary><b>Kid Mode</b> - the rail, a catalogue, the re-hosted Work view, the sticker book and its settings row</summary>

The two headline Kid Mode captures - Kid Home and the grown-up gate - are shown further up this
page, open by default, because Kid Mode is what a fresh install actually shows. The rest of Kid
Mode's eight captures are here.

|                                                                                                                                                                                                                                                                                        |                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/kid-rail.png" alt="Kid Mode's own rail, cropped from the Home capture: Home, Explore, My jobs and Stickers as big picture-first destinations under a level badge and XP bar, with Find, Messages and the grown-up gate as small footer actions - the same three-destination-plus-footer shape the adult rail has" width="140"> | <img src="docs/screenshots/kid-catalogue.png" alt="One of Kid Mode's five catalogues, opened as a picture-first land from Kid Home: every feature it holds as its own row with a real shipped blurb underneath, grouped under headings, with the same search field and anchored regex builder every other catalogue page in this application carries" width="420"> |
| Kid Mode's own rail                                                                                                                                                                                                                                                                     | A catalogue "land" opened                                                                                                                                                                                                                                           |
| <img src="docs/screenshots/kid-job-strip.png" alt="Kid Mode's Work view: the same tab strip, seeded groups, pinning, drag reorder and overflow as Adult Mode's own Work destination, re-hosted with Kid Mode's own labels and a 64px-minimum chip floor rather than the adult shell's 44px one" width="420"> | <img src="docs/screenshots/kid-stickers.png" alt="The sticker book on a fresh capture profile: every sticker this build knows about, each naming the real feature it is earned from, none of them won yet - a sticker that has not been won says so plainly, nothing is hidden or teased" width="420"> |
| Work, re-hosted with Kid Mode's own labels                                                                                                                                                                                                                                              | The sticker book, honestly empty on a fresh profile                                                                                                                                                                                                                 |
| <img src="docs/screenshots/kid-mode-settings-row.png" alt="The Kid Mode settings row, reached from inside Adult Mode: the Kid Mode / Adult Mode choice, the child's name, the celebration and sound switches, and the label-style choice" width="420"> | <img src="docs/screenshots/kid-home-390.png" alt="Kid Home at 390 by 844 CSS pixels, the phone width the redesigned adult shell proves itself at: the rail narrowed to 88 pixels with its four destinations still labelled, the hero stacked into a column so the headline wraps whole rather than clipping, the walkthrough and GO buttons full width and clear of each other, the catalogue lands reflowed to two readable columns keeping their icons, kid labels, shipped names and counts, the child's name intact, and no horizontal scrollbar. This capture is the fix: the same frame a day earlier had the headline cut off mid-word and the lands crushed to a character each" width="240"> |
| The Kid Mode / Adult Mode settings row                                                                                                                                                                                                                                                  | Kid Home at phone width                                                                                                                                                                                                                                             |

Not captured, and honestly recorded as skipped rather than faked: the grown-up gate with a
credential actually set (the shared restricted-mode code is deliberately not scoped to this run's
disposable profile - see below), the celebration overlay (it only ever fires from a real completion
event, never a planted value), and any light, dark or contrast variant of a Kid Mode surface - Kid
Mode always paints from its own fixed theme regardless of the scheme chosen in Adult Mode's
Settings, so there is genuinely nothing else to capture here.

</details>

<details>
<summary><b>The menu</b> - its root page, the maps, markers, settings and info pages, and the regex builder</summary>

_All seven images below were captured 2026-08-05, the last Playwright run with a rendered map
loaded - the menu only exists once a map is being served. See the note near the top of the
Screenshots section._

|                                                                                                                                                                                                   |                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/menu-root.png" alt="The main menu side sheet, listing maps, markers, settings and info, then go fullscreen, reset camera, take screenshot and update map" width="420"> | <img src="docs/screenshots/menu-maps.png" alt="The maps page of the menu, listing the maps the active profile serves with a search bar above them" width="420"> |
| The root page                                                                                                                                                                                     | Maps                                                                                                                                                            |
| <img src="docs/screenshots/menu-settings.png" alt="The viewer settings page of the menu, with view, resolution, render distance and free-flight controls" width="420">                            | <img src="docs/screenshots/menu-info.png" alt="The info page of the menu, with the application version at the foot of it" width="420">                          |
| Viewer settings                                                                                                                                                                                   | Info                                                                                                                                                            |
| <img src="docs/screenshots/menu-markers.png" alt="The marker page of the menu, showing the marker sets of the map that is loaded" width="420">                                                    | <img src="docs/screenshots/menu-search.png" alt="The settings menu filtered by its own search bar, showing how many settings match" width="420">                |
| Markers                                                                                                                                                                                           | The menu's search bar                                                                                                                                           |

<img src="docs/screenshots/menu-regex-builder.png" alt="The regex builder anchored to the menu's search bar, with a pattern box, the supported flags, and buttons for character classes, anchors, groups, alternation, quantifiers and literals above the live matches" width="420">

</details>

<details>
<summary><b>Settings</b> - the panel, every section in it, its search and its regex builder</summary>

<img src="docs/screenshots/settings-drawer.png" alt="The application settings panel, opened from the rail footer, with a search field at the top, its sections as browser-style tabs, and the Mojang download consent section showing" width="900">

|                                                                                                                                                                                                              |                                                                                                                                                |                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/settings-section-mojang-download-consent.png" alt="The Mojang download consent settings section, showing the answer given during setup and the text being agreed to" width="280"> | <img src="docs/screenshots/settings-section-java-runtime.png" alt="The Java runtime settings section, on its own browser-style tab inside the settings panel, reporting which Java the application would use to run upstream BlueMap's renderer" width="280">                             | <img src="docs/screenshots/settings-section-map-storage-directory.png" alt="The Where rendered maps go settings section, on its own tab inside the settings panel, showing the folder every render is written into" width="280"> |
| Mojang download consent                                                                                                                                                                                      | Java runtime                                                                                                                                   | Where rendered maps go                                                                                                                 |
| <img src="docs/screenshots/settings-section-world-folder.png" alt="The World folder settings section, on its own tab inside the settings panel, recording the Minecraft save the application reads from" width="280">                                                                                           | <img src="docs/screenshots/settings-section-github-account.png" alt="The GitHub account settings section in its signed-out state" width="280"> | <img src="docs/screenshots/settings-search.png" alt="The settings panel filtered by its search field, each result saying which tab it lives on" width="280">                    |
| World folder                                                                                                                                                                                                 | GitHub account, signed out                                                                                                                     | The settings search                                                                                                                    |

<img src="docs/screenshots/settings-regex-builder.png" alt="The regex builder anchored to the settings search, showing the pattern, the supported flags, the guided token palette and the live matches against the text on screen" width="420">

</details>

<details>
<summary><b>The options editor</b> - all eight tabs of BlueMap's own configuration</summary>

<img src="docs/screenshots/config-screen.png" alt="The options editor as it opens: eight tabs down the side, BlueMap's own generated defaults filling the page because the throwaway capture profile has no config folder on disk, and a search across every setting" width="900">

Captured 2026-08-15 against the current build, so this is not a historical image: the generated
options inventory it shows carries all **155 settings**, including `client-decompression`.

|                                                                                                                                                                        |                                                                                                                                                      |                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/config-tab-core.png" alt="The options editor on its Core tab, holding the settings that apply to every map rather than to one of them" width="280">                                                                  | <img src="docs/screenshots/config-tab-maps.png" alt="The options editor on its Maps tab, with the map configurations listed down the side and the selected map's own settings beside them" width="280">                                                | <img src="docs/screenshots/config-tab-storages.png" alt="The options editor on its Storages tab, which decides where rendered tiles are written, on disk or into a database" width="280">                         |
| Core                                                                                                                                                                   | Maps                                                                                                                                                 | Storages                                                                                                                              |
| <img src="docs/screenshots/config-tab-web-app.png" alt="The options editor on its Web app tab, holding what a visitor to the finished map sees and where the web app is generated" width="280">                                                            | <img src="docs/screenshots/config-tab-web-server.png" alt="The options editor on its Web server tab, holding the built-in server's port, bind address and access log" width="280">                                    | <img src="docs/screenshots/config-tab-server-plugin.png" alt="The options editor on its Server plugin tab, holding live player markers and the settings only a server plugin ever uses" width="280">               |
| Web app                                                                                                                                                                | Web server                                                                                                                                           | Server plugin                                                                                                                         |
| <img src="docs/screenshots/config-tab-run.png" alt="The Run tab of the options editor, showing the command-line flags a render is started with" width="280">           | <img src="docs/screenshots/config-search.png" alt="The options editor's search, which reaches every setting on all of the tabs at once" width="280"> | <img src="docs/screenshots/config-regex-builder.png" alt="The regex builder anchored to the options editor's search bar" width="280"> |
| Run                                                                                                                                                                    | The search across every tab                                                                                                                          | Its regex builder                                                                                                                     |
| <img src="docs/screenshots/config-tab-history.png" alt="The History tab of the options editor, which lists the saved revisions of the open config folder" width="280"> |                                                                                                                                                      |                                                                                                                                       |
| History                                                                                                                                                                |                                                                                                                                                      |                                                                                                                                       |

Deleting a map's configuration is guarded the same way any destructive action is, and the gate
names what would actually go before it asks.

<img src="docs/screenshots/config-delete-gate.png" alt="The confirmation that guards deleting a map's configuration, naming the file that would go, the map id whose tiles stop being served, and that already-rendered tiles are not deleted, above two key switches, a slider and an emergency exit" width="420">

These captures show the editor holding BlueMap's own generated defaults, which is what it opens
on when this machine has no config folder to carry on from - it says so in a notice across the
top. Every setting, tab and control in them is real, live and savable; what is absent is a folder
read off the machine, not the ability to write one.

</details>

<details>
<summary><b>Making a map</b> - the wizard, step by step, after reading a real world off disk</summary>

|                                                                                                                                                                                 |                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/wizard-1-world.png" alt="The make-a-map wizard on its first step, asking for a world folder, with its five steps listed across the top" width="420"> | <img src="docs/screenshots/wizard-1-world-read.png" alt="The wizard's first step after the world folder has been read, naming the dimensions it found and how many region files each holds" width="420"> |
| Choose a world                                                                                                                                                                  | The same step, after the folder is read                                                                                                                                                                  |
| <img src="docs/screenshots/wizard-2-name-and-dimension.png" alt="The make-a-map wizard on its Name and dimension step, which names the map and picks which dimension of the save it renders" width="420">                                                             | <img src="docs/screenshots/wizard-3-options.png" alt="The make-a-map wizard on its Options step, holding the map's own render settings with a search across them and each group collapsible" width="420">                                                                                                            |
| Name and dimension                                                                                                                                                              | Options                                                                                                                                                                                                  |
| <img src="docs/screenshots/wizard-4-where-it-goes.png" alt="The wizard's step for choosing where the rendered map is written" width="420">                                      | <img src="docs/screenshots/wizard-5-review.png" alt="The wizard's review step, showing every decision the earlier steps collected before a render is started" width="420">                               |
| Where it goes                                                                                                                                                                   | Review                                                                                                                                                                                                   |

<img src="docs/screenshots/wizard-release-downloads.png" alt="The release downloads panel, which offers to fetch a world from a GitHub release for somebody with no Minecraft save on this machine" width="600">

The wizard's first step also opens two remote world sources without leaving it: a saved SSH host,
and a local Docker installation.

|                                                                                                                                                                                                           |                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/wizard-ssh-world-source.png" alt="The SSH world-source checklist inside the wizard's first step: saved key-only machines, explicit host-key review, remote-world inspection, and a local fetch destination" width="420"> | <img src="docs/screenshots/wizard-docker-world-source-390x844-200pct.png" alt="The local Docker world-source checklist at a 390 by 844 CSS-pixel viewport and 200 percent device scale: Docker's real state, actual containers and volumes, a browsed local destination, live-copy risk acknowledgement, and honest progress" width="280"> |
| SSH world source                                                                                                                                                                                          | Docker world source, at a phone viewport and 200% scale                                                                                                                                                                              |

</details>

<details>
<summary><b>Dialogs, notifications and the destructive-action gate</b></summary>

Nothing that only informs is a dialog. Messages appear in a corner, never block, and stay
readable afterwards in a history.

|                                                                                                                                                                                                                                         |                                                                                                                                                                                   |                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/profiles-manager.png" alt="The maps and servers manager, listing the maps rendered on this computer and the remote BlueMap servers the application knows about, with fields for adding another" width="300"> | <img src="docs/screenshots/notifications-rail-bell.png" alt="The live notification bell in the application rail, carrying its unread badge, before it opens the history anchored beside it" width="70"> | <img src="docs/screenshots/notifications-history.png" alt="The notification centre that bell opens: its own search field, a line reading it is showing 4 of the 4 notifications recorded, filters, the bulk select and invert actions, and each message with its level, its exact time and a Show again action" width="300"> |
| Maps and servers                                                                                                                                                                                                                        | The rail's notification bell                                                                                                                                                      | The history it opens                                                                                                                                                              |

A destructive action takes two keys and a full-travel slider, and an emergency exit is available
throughout.

|                                                                                                                                                                  |                                                                                                                                                             |                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/super-confirm-untouched.png" alt="The reset-settings gate before either key is turned, with the slider refusing to move" width="280"> | <img src="docs/screenshots/super-confirm-one-key.png" alt="The reset-settings gate with one key turned, which is not enough to arm the slider" width="280"> | <img src="docs/screenshots/super-confirm-armed.png" alt="The reset-settings gate with both keys turned and the slider armed" width="280"> |
| Untouched                                                                                                                                                        | One key                                                                                                                                                     | Both keys, armed                                                                                                                          |

_All three captured 2026-08-05, the last run with a rendered map loaded - this gate is reached only
through the viewer's own Menu button, so it is the same age as the menu pages above, even though the
reset it guards has nothing to do with the map itself._

</details>

<details>
<summary><b>Projects, the EULA viewer and rendering in GitHub Actions</b> - three screens with their own capture steps, not shown in the sections above</summary>

|                                                                                                                                                                 |                                                                                                                                                                                                |                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/projects-screen.png" alt="The Projects screen, showing the real empty state and the path into a new render project" width="260"> | <img src="docs/screenshots/eula-viewer.png" alt="The EULA viewer embedded in Settings, with the bundled or cached licence copy, its provenance and its searchable section tabs" width="260"> | <img src="docs/screenshots/ci-render-screen.png" alt="The CI-render screen, with its honest repository fields and the preflight route that refuses before uploading anything" width="260"> |
| Projects                                                                                                                                                       | The EULA viewer                                                                                                                                                                                | Rendering in GitHub Actions                                                                                                                                             |

</details>

<details>
<summary><b>What is not captured, and why</b></summary>

The harness records the surfaces it could not reach rather than substituting something that
looks similar. As of the committed set:

- **A signed-in GitHub account.** Signing in needs a real account and a real device-flow round
  trip to github.com, and the capture guard refuses every request that is not loopback. The
  signed-out state of the account section is real, and it is the one shown above.
- **A release's asset list, and a download in progress.** Both need real traffic to github.com.
  The panel is shown in the state it is in before anything has been asked for.
- **The render progress panel, and the render console.** Both only exist while a render is
  actually running, which needs a Java runtime, an accepted Mojang download consent and minutes
  of work. The capture run declines that consent.
- **Interrupted renders.** That surface only appears when a previous render was interrupted and
  left a session behind, and the throwaway profile the harness uses has never started one.
- **The marker search and sort controls.** The map the run captured carries no markers, so the
  marker menu has no marker section and those controls are not on screen to photograph.
- **The options editor's save plan.** That dialog lists the files a save would write, and its
  Save control is disabled while the editor has no folder attached, so there is no door to open
  it through in the state the captures were taken in.
- **The notification centre opened from the rail's bell.** The panel itself is captured, through
  the command palette's row for it, which works every time. What has no honest capture is the
  bell working: pressing it on a fresh profile leaves its own `aria-expanded` at `false` and puts
  the panel in the document not at all. A capture of the panel would not have shown that, which
  is exactly why the skip is recorded separately from the capture.
- **The grown-up gate with a credential actually set.** The shared restricted-mode code is
  deliberately not scoped to this run's disposable capture profile: it lives in a location shared
  on purpose across every Kid-Mode-capable app on the host, so setting one just to capture this
  state would write to this machine's real, persistent application data rather than the throwaway
  profile the rest of this harness confines itself to. The no-credential state shown above is the
  one every fresh install genuinely starts in, and it is the one captured.
- **Kid Mode's celebration overlay.** It only ever fires from a real completion event - a rendered
  map opened, a page published to GitHub Pages, a local render finished - never from a value
  planted to make the screen look populated.
- **Any light, dark or contrast variant of a Kid Mode surface.** Kid Mode always paints from its
  own fixed theme, regardless of the scheme chosen in Adult Mode's Settings, so there is genuinely
  nothing else here to capture.
- **A remote-hosting panel, in one run.** The most recent run timed out opening it; the failure is
  written out in full beside the images rather than the panel being silently dropped from the set.
- **A map popup at the viewport edge.** That needs a rendered map with a marker near the window's
  edge to click, which this run's map-free capture profile does not have.

The exact list for the committed set, with reasons, is the `skipped` array in
`docs/screenshots/manifest.json` - 23 entries in the run this page's newest captures come from.
Most of that count is the map-dependent surfaces already explained above (the menu and everything
reached only through it), honestly skipped rather than faked because this particular run had no
map fixture; the rest are surfaces this build genuinely cannot reach without a real render, a real
GitHub sign-in, or - for Kid Mode's credential-configured gate - writing to this machine's real,
shared application data. The **History** tab of the options editor, the **projects** screen, the
**EULA viewer** and the **rendering-in-Actions** screen were once in that second category too; they
have their own capture steps now - History is in **The options editor** section above, and
Projects, the EULA viewer and rendering in GitHub Actions are in their own section immediately
above this one.

</details>

## Build it

Requires **Node 22+** and **pnpm 10**. The upstream Java reference is a git submodule; the port
reads it directly.

```sh
git clone https://github.com/Ding-Ding-Projects/worldlens.git
cd worldlens
git submodule update --init --recursive

node scripts/bootstrap.mjs
```

That one command installs and **verifies** everything: workspace dependencies, the
Electron binary, a JDK matching upstream's toolchain, Gradle, the BlueMap jars built from the
vendored source, and the Playwright tooling the Electron screenshot harness drives. It asks nothing and
needs no administrator rights, and every install is repository-local or user-scoped so no
machine-wide toolchain is touched.

It verifies rather than assumes, which is not pedantry: Electron once shipped a `dist/` folder
containing only `locales/`, with no binary at all, and its own installer kept exiting 0 because
the folder existed. A presence check passes that; running the binary does not. Where a
dependency's own installer is the thing that is broken, bootstrap verifies the cached archive
against Electron's package checksum manifest, clears partial output again, and extracts it from
scratch. The command also invokes the exact `pnpm` version pinned by `design/package.json`, so a
different global package-manager version cannot quietly decide the dependency graph.

```sh
node scripts/bootstrap.mjs --check       # verify only, install nothing
node scripts/bootstrap.mjs --skip-jars   # skip the slow first Gradle build

cd design
pnpm build
pnpm test
pnpm lint
```

`--check` is read-only even on a fresh npm cache: it verifies the installed workspace and runs the
local Playwright CLI directly, so it never asks `npm exec` to download pnpm. Electron recovery
validates the cached archive before extraction, refuses recursive deletion through a path escape or
reparse point, and accepts a BlueMap shadow JAR only when it is a real, non-trivial ZIP/JAR rather
than a zero-byte or stale filename.

Everything except `plan.md` and repository metadata lives in `design/`, a pnpm workspace of
thirteen packages.

Generate a test world without needing Minecraft, a server jar or a network connection:

```sh
node design/packages/worldgen/dist/cli.js --seed 1 --size 1000 --out ./test-world
```

That writes anvil format byte by byte: 3969 chunks across four region files, about 16 MB on disk
and 8 MB zipped, in a few seconds. The same seed always produces byte-identical output.

At release `v0.1.0-build.196`, measured at commit `0008dd4d`, the project is **288,533 lines**
hand written across 1,258 files, or 309,624 lines across 1,738 files counting bundled data and
binary assets. Of those hand-written lines, 284,498 are agent-written and 4,035 are
human-written. Every release publishes the full breakdown — by category, by package and by
authorship — generated at the tagged commit by `scripts/count-lines.mjs`. Run that script
rather than counting by hand; it is the same command CI runs.

## Rendering on GitHub Actions, for computers that cannot render locally

Rendering a big Minecraft world is hours of CPU and gigabytes of disk. On a thin laptop
that is an afternoon of the fan at full speed and, on some machines, a render that never
finishes at all. **The point of this feature is that your computer does not do the work:**
a GitHub standard runner has 4 vCPU, around 14 GB of free disk and nothing else to do, and
the `Render world` workflow will use as many of them in parallel as the world needs. Your
machine uploads the world and then waits.

The desktop app drives the whole loop as one action — upload the world as release assets,
start the workflow, follow the run and report its real per-job states, download the
finished map, and register it so it opens exactly like a local render. It reuses the backup
subsystem for the upload, the download subsystem for the transfer, and the render subsystem
for the mount; there is no second uploader, downloader or credential anywhere in it. It is
resumable, so closing the app during a four-hour render and reopening it afterwards picks
the run back up, and it will not upload a world it can see has not changed. It can drive
GitHub through the app's own sign-in or through an authenticated `gh` CLI, and it says
which credential is in play.

**Proven, on a real run rather than in principle.** A 96-block world committed to a
throwaway probe repository rendered end to end on GitHub's runners on 2026-08-04:
[run 30953146107](https://github.com/DingDingChae/bluemap-tiny-render-probe/actions/runs/30953146107)
— plan, jar build, one shard and the merge all green, producing 21 hires `.prbm.gz` tiles,
`settings.json` and `textures.json.gz`, in a 1.9 MB `rendered-map` artifact.

Getting there found two real defects, both now fixed and both worth knowing about:

- The jar is compiled with **Java 25** and the render jobs set up **Java 21**, so every
  shard died with `UnsupportedClassVersionError` before drawing a tile.
- That failure was then **swallowed**. `continue-on-error` is right for a shard that ran
  out of time with hours of real tiles to hand over, but it also let a render that produced
  _nothing_ report success, upload no artifact, and break three jobs later with
  `Artifact not found for name: webapp` — pointing at the merge and saying nothing about
  the engine refusing to start. A render that drew nothing now fails next to its reason.

A third trap is worth recording for anyone using `world-source: repository`: this
repository's `.gitignore` contains `*.mca`, so a world committed into a clone of it
silently loses every region file, and the render then correctly reports a world with
nothing in it.

**The trade-offs, because advertising without them wastes an afternoon:**

- uploading a multi-gigabyte world takes real time and bandwidth — that is the slow part now;
- GitHub's free Actions minutes are finite for **private** repositories, while **public**
  repositories get unlimited standard-runner minutes;
- a very large world can still exceed a job's six-hour budget, and a world whose archive
  would pass a release asset's 2 GiB limit is refused before anything is packed;
- uploading a world sends it to GitHub, and a **public** repository makes it downloadable
  by anybody. The app says both plainly and refuses without an explicit acknowledgement.

Mojang's EULA is a real legal acceptance the workflow makes on the repository owner's
behalf. The app never accepts it for you: it checks the consent given at first run and
refuses when it is missing.

[`docs/render-in-actions.md`](docs/render-in-actions.md) has the whole design, including
how the shard merge is kept correct.

### Hosting the finished map on GitHub Pages

A rendered map is a static web app, so it can be hosted on GitHub Pages and shared as a
link. The CI render screen offers it as a tick box (off by default — rendering a world is
private until you say otherwise, and Pages is public whether or not the repository is), and
the map is published **underneath** the documentation site at `/map/` so publishing a map
never takes the docs down.

![A render served from GitHub Pages, in a browser: BlueMap's own viewer chrome across the top with the menu button, the day and night, perspective, flat and free-flight controls, live x and z readouts both at zero and a compass, and below it the rendered tiles. This is a tiny test world, so most of the frame is the empty space beyond it and the rendered ground is a sand-coloured patch in the lower right](docs/screenshots/map-hosted-on-github-pages.png)

_The tiny probe world, rendered by GitHub's runners and served from
`dingdingchae.github.io`, loaded in a browser with no BlueMap server anywhere._

<details>
<summary><b>See the UI-created Bayville repository live on GitHub Pages</b></summary>

![The live Worldlens documentation home published by the UI-created Bayville repository, showing its searchable Material Design documentation shell, tab list, settings destination, and Windows download action](docs/screenshots/bayville-pages-home.png)

![The live Bayville World v10.1 BlueMap published at the repository's map route, showing the complete rendered region with its towns, roads, rivers, forests, snowy eastern district, and southern lake](docs/screenshots/bayville-pages-map.png)

These are anonymous guest-Edge captures of the same deployment produced by
[workflow run 32246619712](https://github.com/Ding-Ding-Projects/worldlens-bayville-ui-public-20260819-01/actions/runs/32246619712).
The documentation root and `/map/` both returned HTTP 200 before capture.

</details>

**One detail decides whether this works at all,** and it is invisible until every tile
returns 404. The engine stores hires tiles gzipped — the file on disk is `0.prbm.gz` — and
the viewer asks for `0.prbm` unless its `settings.json` says `clientDecompression: true`.
BlueMap's own web server bridges that gap, and so does this app's; **Pages does not.** It
serves the files that exist, under the names they have, and 404s the rest.

So the map is prepared before it is published, and the preparation is _verified against the
files really on disk_ rather than assumed — flipping that flag on a map rendered without
compression would point the viewer at files nobody wrote, which is exactly as broken and far
harder to diagnose. The step also writes `.nojekyll`, measures the site against GitHub's
limits, and fails the run rather than publishing a site nobody can use.

**Proven on a real published map**, not in principle. The tile URL the viewer requests
returns `200` with gzip magic bytes and no `Content-Encoding`, which is precisely what the
browser's `DecompressionStream` needs:

```
200  maps/tiny/tiles/0/x0/z0.prbm.gz     application/gzip   first bytes 1f 8b
404  maps/tiny/tiles/0/x0/z0.prbm        ← the URL the viewer asks for without the flag
```

What Pages will not host: a map delivered in **parts** (more than one merge group — no single
runner ever holds it whole, which is the point of the split), a site over GitHub's 1 GB soft
limit, or any single file over its 100 MB hard limit. Each is reported before anything is
uploaded rather than discovered halfway through.

## Documentation

**[ding-ding-projects.github.io/worldlens](https://ding-ding-projects.github.io/worldlens/)**
carries an article for every feature, each stating its behaviour, configuration, failure modes,
security considerations and verification, with a visible badge saying whether the subject is
shipped, ported but unverified, or only specified.

The source of truth lives in the repository:

| Document                                                                                                                                | What it covers                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`plan.md`](plan.md)                                                                                                                    | The approved full port plan. Read this first.                                                                       |
| [`docs/README.md`](docs/README.md)                                                                                                      | The index of the per-feature articles, one file per feature                                                         |
| [`design/README.md`](design/README.md)                                                                                                  | The workspace: packages, development, port notes                                                                    |
| [`design/ROADMAP.md`](design/ROADMAP.md)                                                                                                | Phase table and status, and what is proven versus merely built                                                      |
| [`design/HANDOFF.md`](design/HANDOFF.md)                                                                                                | Current state. Its opening plain-language summary is written to be readable with no prior knowledge of the codebase |
| [`design/docs/`](design/docs/)                                                                                                          | Porting conventions, design decisions, deviations log                                                               |
| [`design/docs/contracts/`](design/docs/contracts/README.md)                                                                             | The five product contracts and their status                                                                         |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · [`LICENSE`](LICENSE) | Repository policy, rendered as their own tabs above                                                                 |
| [`AGENTS.md`](AGENTS.md)                                                                                                                | Instructions for automated agents working in this repository                                                        |

## Contents

- [Everything the application does](#features)
- [Screenshots](#screenshots)
- [Rendering engines](#rendering-engines)
- [Phase status](#phase-status)
- [Packages](#packages)
- [Repository layout](#repository-layout)
- [Minecraft version support](#minecraft-version-support)
- [Differences from upstream BlueMap](#differences-from-upstream-bluemap)
- [Product contracts](#product-contracts)
- [Porting rules in one screen](#porting-rules-in-one-screen)
- [Attribution](#attribution)

---

<details id="rendering-engines">
<summary><b>Rendering engines</b> (why there are two, and which one runs)</summary>

Turning a Minecraft save into map tiles is the single largest and highest-risk part of this port.
The project ships two paths to it.

|             | Java engine                                   | TypeScript mesher                                                                                                                                                                     |
| ----------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status      | **primary today**                             | passes its parity gate; not yet switched on                                                                                                                                           |
| Source      | upstream BlueMap, built from `vendor/BlueMap` | `design/packages/engine`                                                                                                                                                              |
| Needs a JDK | yes                                           | no                                                                                                                                                                                    |
| Correctness | upstream's own output, by definition          | **measured identical** to the Java engine on a 1000x1000 world and a 200x200 fixture: 961 of 961 hires tiles byte for byte after decompression, 24 of 24 lowres tiles pixel for pixel |

**Why the Java engine is primary.** It renders correctly today. Writing a mesher that produces
byte-identical geometry is months of work, and until it is finished a pure TypeScript app cannot
render anything at all. Driving upstream's renderer means a user can render a world now, and it
gives the TypeScript mesher an exact oracle to be checked against rather than a plausible-looking
approximation.

**Why the TypeScript mesher still exists.** The Java path needs a JDK and carries a JVM's memory
profile. The mesher's gate — decompressed PRBM bytes identical to the Java engine's and lowres
PNGs identical pixel for pixel across every fixture world — **closed on 2026-08-04**. Passing it
is not the same as switching over: making the mesher the default is its own change, with its own
verification, and it has not been made. Until it is, the JDK requirement stands.

The app tells you which engine rendered a map. It does not silently switch.

**Issue #78 delivery status (2026-08-19).** The source now carries a per-project engine choice,
a global default for new projects, canonical engine ids (`upstream-java` and `typescript`), and
packaging metadata for both engines. The package path stages the TypeScript engine assets and a
manifest that records capability flags and the staged Java CLI artifact's size and SHA-256 when
present. Source/build evidence for the current Issue #78 state was not run in this documentation
pass, and the packaged dual-engine proof remains pending: the next owner must build the real
installer, verify both artifacts from the packaged output, and render one project through each
engine without silent fallback.

</details>

<details id="phase-status">
<summary><b>Phase status</b> (0/A/B/C/D done, E/H/I part done, G pending)</summary>

Mirrored from [`design/ROADMAP.md`](design/ROADMAP.md), which is the source of truth and
carries the reasoning behind every "part done" below.

| Phase     | Scope                                                                                                                                                               | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0         | `plan.md`, submodules (plus the `v0.10.3-mc1.12` legacy tag), monorepo scaffold, CI                                                                                 | **Done**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A         | Viewer port (65 files to TS), MD3 shell, Electron shell, embedded server plus remote proxy, live-demo verification                                                  | **Done**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| B         | shared utils, NBT, compression, MCA parsing 1.12.2 to 26.x including legacy `Chunk_1_12`, e2e synthetic-world proofs                                                | **Done**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C         | Resource-pack pipeline (VFS, blockstates/models/atlases, textures, legacy compat, Mojang downloader, `textures.json`)                                               | **Done.** Exit criteria run 2026-08-05 (issue #31, closed): textures.json parity, live blockstate resolution and 1.12.2 legacy-jar loading all pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| J         | Java render path (toolchain discovery and provisioning, jar resolution, config writer, CLI runner, progress parser, provenance record, local map serving)           | Built; driven by hand on one Windows machine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D         | Hires mesher, byte-exact PRBM writer, lowres LOD cascade, renderstate, file storage, masks                                                                          | **Done, and the gate is closed** — both engines produced identical output on a 1000x1000 world                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| E         | RenderManager worker pool, watch re-render, full HTTP routes plus SSE, config schema, standalone server CLI and Dockerfile                                          | **Part done, issue #65 parity verified.** The worker pool, render-task hierarchy and config schema (all issued earlier), watch-driven re-render (`MapUpdateService`, issue #40), full HTTP routes with SSE (issue #41), standalone CLI plus Dockerfile (issue #42), and the issue #65 mod-resource/resource-extension/SQL parity contract are implemented. Docker image `worldlens-cli-issue65:proof` and the throwaway `postgres:17.6` marker run provide runtime proof; see [`docs/compatibility/cli-resource-sql-parity.md`](docs/compatibility/cli-resource-sql-parity.md) |
| F         | Full options GUI (all settings, map wizard, storage editors, config import)                                                                                         | Reachable and in use; eight tabs over BlueMap's own configuration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| G         | Docker hosting GUI (local app-owned instance manager)                                                                                                               | **Source present; acceptance open.** The manager discovers Docker state, filters by app ownership labels, inventories exact digest-pinned image refs, persists records, validates guided digest-pinned create requests while preserving the image's own `ENTRYPOINT`/`CMD`, and keeps Create separate from Start. It exposes lifecycle IPC, progress/cancellation, bounded logs, selection/export, a tab and command-palette destination, and native stop/remove confirmations. Actual server/map configuration is not implemented; transactional image update remains refused. Real daemon ownership/refusal/rollback, persistent history, complete bulk actions, VS Code handoff, packaged interaction and headless captures remain open; rendering _in_ a container is separate — see [`docs/docker-hosting-manager.md`](docs/docker-hosting-manager.md) and [`docs/docker-and-local.md`](docs/docker-and-local.md) |
| H         | SQL storages, command palette, marker editor, JS addon system, static export, three.js upgrade                                                                      | **Part done.** SQL storages are proven against real MySQL/MariaDB/PostgreSQL and, over a shared MariaDB database, cross-compatible with upstream's own Java engine in both directions (issue #32, closed). Issue #66's PostgreSQL and SQLite matrix is comparison-green in both directions with cleanup evidence; direction 2's raw HTTP path does not expose render-state grids, so that boundary remains explicitly documented in [`docs/sql-cross-engine-compatibility.md`](docs/sql-cross-engine-compatibility.md). The command palette shipped early. Issue #70's source now covers POI/line/shape/extrude records, bounded geometry, duplicate/import/export, and a viewer layer host; marker-set CRUD beyond the fixed set, direct map drawing, full controls, history UI, and packaged proof remain open. JS addon system, static export and the three.js upgrade remain pending                                                                                                                                                                                                                                                                                                                                   |
| I         | Local live players (playerdata/RCON), measurement/waypoints/gallery/scheduler/dashboard/update checker, packaging                                                   | **Part done, landed early, out of order.** The update checker is built and wired into the main process, and packaging shipped early too. Local live players and measurement/waypoints/gallery/scheduler/dashboard remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Contracts | The five product contracts in [`design/docs/contracts/`](design/docs/contracts/README.md)                                                                           | **Shipped.** Issues #6 to #13 are closed, each with its evidence on the issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Delivery  | Sign-in, private worlds, split archives, resumable renders, Actions rendering, remote and container rendering, world sources, updates, projects, packaging pipeline | **Landed.** Not a plan phase; see `design/ROADMAP.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Issue #89 — typed banner pattern compatibility

The typed banner reader preserves ordered legacy/current and unknown values.
Malformed list elements are skipped individually after one bounded diagnostic,
later valid layers keep their order, and diagnostic history is capped at 32;
reader-state failures still propagate. The focused acceptance record remains
5/5. This records update ran no new tests, builds, packaged interactions, or
captures. Real NBT/oracle comparison and packaged same-world render,
restart/reopen, and diagnostic read-back remain open, so the issue is not closed.

### 廣東話同步

Typed banner reader 會保留有次序嘅 legacy/current 同未知值；壞 list element
逐層跳過、留一條 bounded diagnostic，後面 valid layer 唔會亂次序，diagnostics
最多 32 條，reader state error 繼續報。Focused acceptance 仍然係 5/5。今次
records update 冇加跑 tests、build、packaged interaction 或 captures；真 NBT/
oracle、packaged same-world render、restart/reopen 同 diagnostic read-back 仲未
齊，所以 issue 未關。

Deferred verification flag: the lz4-java block-framing constants get oracle validation against
upstream's own CLI, which now happens on every local render rather than only when someone runs
the harness. That is recorded in
[`design/docs/deviations.md`](design/docs/deviations.md) and tracked as
[#3](https://github.com/Ding-Ding-Projects/material-bluemap/issues/3).

</details>

<details id="packages">
<summary><b>Packages</b> (what the thirteen workspace packages are for)</summary>

| Package                          | Purpose                                                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design/packages/shared`         | Wire formats (settings/textures/markers/players), config schema, math, path codecs                                                                                               |
| `design/packages/nbt`            | Binary NBT reader/writer with schema mapping (a BlueNBT-subset port)                                                                                                             |
| `design/packages/engine`         | Render engine: MCA world parsing, resource packs, hires/lowres tile rendering, storage, render manager and its task hierarchy                                                    |
| `design/packages/server`         | Service facade, full HTTP routes with server-sent events, watch-driven re-render (`MapUpdateService`) and the remote proxy                                                       |
| `design/packages/cli`            | Standalone server CLI and Docker image: real rendering, serving, container packaging and a real `--watch`, wired to `MapUpdateService` (issue #40's CLI half, closed 2026-08-06) |
| `design/packages/viewer`         | three.js viewer library, a port of the BlueMap webapp core                                                                                                                       |
| `design/packages/ui`             | Material Design 3 Vue UI                                                                                                                                                         |
| `design/packages/app`            | Electron desktop app: main process, render orchestration, projects, backups, remote and container rendering, updates                                                             |
| `design/packages/config`         | The schema and control policy behind the eight-tab options editor                                                                                                                |
| `design/packages/parts`          | Splitting and rejoining large files into release-asset-sized parts, with digests                                                                                                 |
| `design/packages/render-actions` | The sharding, merging and resumption logic for rendering on GitHub Actions                                                                                                       |
| `design/packages/worldgen`       | Generates a Minecraft world from a seed, in the modern format or the 1.12.2 one, with no Minecraft and no network                                                                |
| `design/packages/site`           | The Material 3 documentation site published to GitHub Pages                                                                                                                      |

</details>

<details id="repository-layout">
<summary><b>Repository layout</b> (where things live and why)</summary>

```
plan.md                  the approved full port plan
docs/                    an article for every feature, indexed by docs/README.md
design/                  the pnpm workspace (all code)
  packages/              the thirteen packages above
  docs/                  porting conventions, decisions, deviations, contracts
  tools/                 the worker-isolated reference regex builder
  LICENSE, NOTICE        licence and upstream attribution for the ported code
vendor/BlueMap           upstream Java/JS reference, git submodule @ e664c1a
.github/workflows/ci.yml artifact builds on push and pull request; release publication only on a main push or nominated workflow_dispatch
```

`vendor/BlueMap` is a read-only reference. The port reads it file by file; nothing in it is
edited, and nothing from it is copied without attribution in `design/NOTICE`.

</details>

<details id="minecraft-version-support">
<summary><b>Minecraft version support</b> (1.12.2 through 26.x, and where legacy support came from)</summary>

Current upstream BlueMap decodes 1.13 and newer. Support for 1.12.2 is combined back in from
upstream tag `v0.10.3-mc1.12`, the last release that carried it: the `Chunk_1_12` decoder, the
legacy block-id mapper, and the 15 neighbour-derived block-state extensions (fence connections,
snowy grass, and the rest).

`design/packages/engine/test/world-e2e.test.ts` is the acceptance proof for this. It builds a
synthetic 1.18 world and a synthetic 1.12.2 world byte by byte, then asserts exact block state,
biome and light decoding through `MCAWorld`, including the legacy extension reconstruction.

</details>

<details id="differences-from-upstream-bluemap">
<summary><b>Differences from upstream BlueMap</b> (what a port cannot carry over, and the security fixes)</summary>

Structural differences, because a TypeScript port cannot reproduce them one for one:

- The six Minecraft-server **platform adapters** (paper, spigot, fabric, forge, neoforge,
  sponge) embed BlueMap inside a server JVM, so they have no place inside the desktop
  application itself. Because decision D17 put a JVM in the product, they are no longer inert:
  **all six, plus the CLI, are built from the vendored source and attached to every release** as
  `bluemap-*.jar` (decision D18). They are a separate download and are not needed to install the
  desktop app. Inside the app, live data comes from remote BlueMap servers, or from local
  `playerdata` and RCON polling are being developed as an optional capability beyond upstream;
  the source implementation is present in the issue-owned checkout, but packaged runtime
  verification remains open.
- Java jar **addons** are loaded by those adapter jars, not by the desktop application. An
  equivalent JS/ESM addon system against the ported TypeScript API is planned for the app
  itself and has not been built yet.
- The Java **BlueMapAPI artifact** is not shipped. Its wire formats and API surface are ported
  to TypeScript.
- **Metrics** are opt-in here. Upstream defaults to opt-out.

Deliberate security deviations, mandated by the porting conventions:

- Marker and popup HTML is passed through DOMPurify before it reaches `innerHTML`. Upstream
  injects it raw.
- `PopupMarker` uses event listeners instead of inline `onclick`, so the viewer works under a
  strict Content-Security-Policy.

Every intentional difference, including the ones above, is recorded with its upstream file and
line in [`design/docs/deviations.md`](design/docs/deviations.md). That log is a hard rule, not a
convention: a port that diverges silently is a port nobody can check.

</details>

<details id="product-contracts">
<summary><b>Product contracts</b> (five cross-cutting UI requirements, all shipped)</summary>

Five contracts apply to every user-facing surface this project ships: a regex builder on every
search bar, full browser-style tabbed navigation, per-element appearance editors with an
infinite colour picker, English / Hong Kong Cantonese / bilingual language modes with
per-language funny-level sliders, and super confirmation for destructive actions.

**All five are implemented, in the desktop application and on the documentation site.** They
were tracked as GitHub issues #6 to #13, all of which are closed with their evidence on the
issue. Two of them are enforced by tests rather than by remembering:
`components/config/regexPolicy.test.ts` fails if a search bar appears without its builder, and
`components/confirm/superConfirmPolicy.test.ts` fails if a destructive call site is not
declared with the gate that guards it.

What is named as remaining sits inside the closed issues rather than being hidden: the
appearance wrapper is proven end to end on the shell chrome with each further surface a
one-line wrap; most of the localization keys still render their English fallback until a
catalogue entry is added for them; and GitHub sign-out is the one destructive action still
behind an inline two-step confirm, listed in that guard's own `KNOWN_GAPS` so it is a stated
fact rather than an oversight.

Each contract has its own document, and
[`design/docs/contracts/README.md`](design/docs/contracts/README.md) is the index with the
per-contract status.

</details>

<details id="porting-rules-in-one-screen">
<summary><b>Porting rules in one screen</b> (the short version of the conventions)</summary>

The full text is [`design/docs/porting-conventions.md`](design/docs/porting-conventions.md).
The short version:

1. Fidelity first. Port file by file and preserve class, method, field and constant names and
   the control flow. The upstream file is the spec.
2. Same relative path and file name as upstream, with a `.ts` extension.
3. TypeScript strict. Avoid `any`; use `unknown` plus narrowing where upstream is dynamic.
4. Keep upstream logic comments. Drop upstream licence headers, since attribution lives in
   `design/NOTICE`.
5. No behavioural improvements during the port. Bug-for-bug compatibility unless the plan calls
   out a change, and every intentional deviation goes in `design/docs/deviations.md`.
6. Node packages are ESM with explicit `.js` extensions on relative imports (NodeNext).
   Browser-bundled packages use bundler resolution.
7. Preserve integer semantics where Java int/long maths matters.
8. Every ported module with non-trivial logic gets a colocated vitest.
9. Prettier with 4-space indent, to stay visually close to the upstream Java and JS.

</details>

<details id="attribution">
<summary><b>Attribution</b> (upstream copyright and the Minecraft asset position)</summary>

This project is derived from BlueMap, MIT licensed, Copyright (c) Blue
(<https://bluecolored.de>) and contributors. Full attribution, including the exact upstream
commit and the BlueMapAPI commit the wire formats come from, is in
[`design/NOTICE`](design/NOTICE). This repository is MIT licensed; see [`LICENSE`](LICENSE).

Minecraft assets (block models, textures) are the property of Mojang AB and are **not**
distributed with this project. The application downloads the Minecraft client jar from Mojang's
servers at runtime, only after explicit user consent, mirroring upstream BlueMap's
accept-download flow. BlueMap's own `resourceExtensions` JSONs are MIT and are bundled.

</details>
## Issue #67 terminal receipt

Terminal run `32292039976` completed Wave 1 at **256/256**, Wave 2 at **105/105**, and all **12/12 merge groups** successfully. Receipt setup failed because the configured `actions/setup-node` SHA was invalid; final merge, low-resolution rendering, Pages, and cleanup steps were therefore skipped. The exact one-character workflow correction remains source-only until the workflow is rerun.

Issue #67 終端收據：Wave 1 **256/256**、Wave 2 **105/105**，以及 **12/12 merge groups** 全部成功。收據 setup 因為設定嘅 `actions/setup-node` SHA 無效而失敗；最後 merge、low-res、Pages 同 cleanup 步驟因此跳過。嗰個一字元 workflow 修正暫時只留喺 source，等 workflow 重跑先至落地。
