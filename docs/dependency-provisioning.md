# Automatic dependency provisioning

Local rendering runs on BlueMap's own Java engine, which means the app needs a JVM. Converting
a Bedrock Edition world needs Chunker, a separate open-source jar. Several optional routes —
publishing to GitHub, remote rendering over SSH, the app's own config-history — lean on `git`,
`gh`, `ssh` and `rsync` being present. None of that is something a person should have to go and
install by hand before the app will work: this document covers what the app fetches for itself,
how it tells you before it does, and what it does honestly instead when a dependency genuinely
cannot be installed this way.

## Contents

- [The rule this follows](#the-rule-this-follows)
- [The Java runtime](#the-java-runtime)
- [Chunker, for Bedrock world conversion](#chunker-for-bedrock-world-conversion)
- [System dependencies via winget/Chocolatey](#system-dependencies-via-wingetchocolatey)
- [The one-button settings screen](#the-one-button-settings-screen)
- [What is not auto-installed, and why](#what-is-not-auto-installed-and-why)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Related reading](#related-reading)

## The rule this follows

Every provisioning path in this app follows the same four rules, and every section below is an
instance of them rather than an exception to them:

1. **User-scoped, never system-wide**, where that is possible at all. The JDK and Chunker land
   under Electron's own `userData` directory — no registry key, no `PATH` edit, no installer, no
   elevation. Uninstalling the app takes them with it.
2. **Told plainly, then it happens.** Nothing downloads as a side effect of asking a question.
   Every button that starts a real transfer states what will be fetched, roughly how big it is,
   and where it is going, before a single byte moves — the same shape the
   [Mojang download consent](./eula-and-consent.md) already uses, extended to every other tool
   the app can fetch for itself.
3. **Verified before it is trusted.** Every archive is checked against a digest before
   extraction; a mismatch deletes the bad bytes and refuses to install anything. A download that
   is interrupted resumes from where it stopped rather than restarting, and nothing partially
   written is ever executed.
4. **Some things genuinely cannot be auto-installed this way**, and the app says so rather than
   pretending: it names what is missing, why it cannot fetch it itself, points at the real
   installer, and offers a re-check — while everything that does not need that dependency keeps
   working.

## The Java runtime

Local rendering discovers a JVM in a fixed order — `JAVA_HOME`, then `java` on `PATH`, then a
copy the app provisioned for itself — and **runs each candidate before trusting it**, because a
path is not evidence: `JAVA_HOME` can outlive the JDK it once pointed at, and a folder named
`jdk-25` has contained a JDK 17 before now. When nothing suitable is found, the Java runtime
settings row shows a **Download Java (~140 MB)** button — the figure is a real measured number,
not a guess — that states the source, records agreement on the click itself, downloads with a
resumable and digest-verified transfer, extracts only after a real `bin/java` is confirmed
inside the archive, and then **runs the JDK it just installed** before reporting success, the
same discipline discovery already applies to a candidate it merely found.

[Fetching a Java runtime for itself](./java-runtime-provisioning.md) is the full account: the
consent shape, every IPC channel involved, the real-network proof against Adoptium's own
servers, and the complete failure-mode table. What follows in this document is the shape every
other tool below repeats.

## Chunker, for Bedrock world conversion

Converting a Bedrock Edition world needs Chunker, Hive Games' open-source converter
(MIT-licensed) — see [Bedrock Edition worlds](./bedrock-worlds.md) for what conversion does and
does not preserve. The app does not bundle it: about 30 MB in every installer for a feature most
people never use is a poor trade, and a bundled copy pins a converter version to an app release.

When a Bedrock world is detected and Chunker is not on the machine, the wizard's Bedrock note
shows a **Download Chunker (~30 MB)** button in the exact spot **Convert** would otherwise be —
never both, because a Convert button that is certain to fail is worse than one that is not
offered. Pressing it fetches the pinned release, verified against a SHA-256 committed in this
app's own source — the strongest check honestly available, since Hive Games publish no
detached signature or checksum file for the CLI jar — and reports progress the same way the Java
download does. See [Bedrock Edition worlds § Obtaining it, and what "verified" honestly
means](./bedrock-worlds.md#obtaining-it-and-what-verified-honestly-means) for the full account of
that verification story, including the weaker `digestTrust: "api"` path a newer release resolves
through.

## System dependencies via winget/Chocolatey

A handful of optional features lean on command-line tools that a Windows machine may or may not
already have: `git` (this app's own config-history), the GitHub CLI (an alternative sign-in
route), Docker Desktop (the container render path) and `rsync` (resumable remote-world uploads).
Where Windows' own package managers can install one of these for real, the app offers to run that
install directly rather than only linking to a download page.

`main/sysdeps/` detects whether `winget` and/or Chocolatey are present, resolves each dependency's
preferred manager and package id from a small reviewed table (`registry.ts`), and — before
anything installs — previews every row: which manager would be used, whether the package manager
already lists it as installed, and **exactly what administrator-permission prompt to expect**,
worded per dependency rather than as a generic warning. Git's and the GitHub CLI's official
Windows installers default to a machine-wide install and will trigger Windows' own elevation
prompt; Docker Desktop's WSL2/Hyper-V integration unavoidably needs it on every current Windows
setup. None of that is hidden behind a generic "this may require permission" — the exact reason
is stated before the button is pressed, and the app never suppresses, bypasses or auto-accepts the
elevation prompt itself.

The preview's presence check is cheap and read-only — it asks the package manager's own record
(`winget list`/`choco list`), which is fast enough to run for every row before anything is
decided. The install pass itself is stricter: before skipping a dependency it believes is already
present, it **actually runs the tool** and checks its output against a pattern (`git --version`
matching `/git version/i`, and so on) — the same discipline `java/probe.ts` applies to a
discovered JVM, because a package manager reporting success is not proof the tool works. Every
fresh install gets the identical check before it is reported as installed.

## The one-button settings screen

Everything in the section above is the engine room; **Settings → System dependencies** is
where a person actually presses a button. `DependencyInstallerPanel.vue` calls
`sysdeps:preview` the moment it mounts and renders the whole table it gets back — route,
elevation and current-install state — *before* a single dependency is selected, so the
disclosure the previous section describes is not a promise kept only in source comments: it
is the first thing on screen. Rows already installed are excluded from the default
selection automatically, because installing something again is not a change the button
should claim credit for.

Pressing **Install {n} selected** calls `sysdeps:install` once for the whole batch and
subscribes to `sysdeps:installEvent` for the rest of the run. Progress is rendered exactly
as truthfully as the engine reports it — a determinate bar for Chocolatey's real
percentages, an indeterminate one for winget's phase-only stdout, and no bar at all for a
phase with no percentage concept (`resolving`, `checking-existing`, the elevation notice
itself). Nothing here ever interpolates a percentage the package manager did not print.
**Cancel** aborts the real child process through `sysdeps:cancel`; whatever was mid-install
at that moment comes back `"cancelled"`, not folded into a generic failure, and whatever had
already finished stays reported as finished — the button's own summary states the honest
split rather than a single pass/fail verdict for the whole batch.

The rest of the panel is the same shared contract every collection surface in this app
carries, reused rather than reinvented: `ConfigSearchField` gives the row list its own
anchored regex-builder search; bulk select-all/invert/none report an honest count of rows
that would actually change (excluding anything already installed); each row is wrapped in
`AppearanceTarget`, which is what supplies the per-row context menu with its own search,
displayed keyboard shortcuts, and Shift+right-click straight to the appearance editor;
outcomes and the batch summary are raised through the shared notification queue
(`raiseNotice`), so they show up as non-blocking toasts and stay in the notification
centre's history afterward; and the full event log — every stage, every manager, every real
percentage, every outcome — exports as JSON, Markdown or plain text.

## What is not auto-installed, and why

Some dependencies stay in the honest-degradation bucket, either because installing them this way
would need elevation this app has no route to grant, or because auto-installing the binary alone
would not remove the remaining manual step:

| Dependency | Why it stays manual | What the app does instead |
|---|---|---|
| Windows' OpenSSH client | Enabling the optional feature needs administrator rights via DISM; there is no user-scoped install. | Names exactly what is missing (`ssh` is not on `PATH`) and that Windows ships it as an optional feature. |
| `gh` sign-in | Installing the binary would still leave it signed out — `gh`'s own device-code login cannot be driven headlessly from a spawned process. | Names the missing binary and points at the app's own in-app GitHub sign-in, which needs nothing installed. |
| Docker on a remote host | Reached only over SSH, with no privilege to install anything there even in principle. | Reports which of five distinct states applies (not installed, daemon unreachable, permission refused, and so on) with the next step named for each. |
| `opencode` (the local coding agent used for automatic repair) | Even a provisioned binary would still need the user's own model credentials configured before it could run anything. | Reports the fact plainly, not as an error — automatic repair still runs everything it can without it. |

## Configuration

| Thing | Where it lives | Default |
|---|---|---|
| Provisioned JDK | `<userData>/java/<feature>/` | absent until a download is agreed to |
| Java download agreement | `<userData>/java/download-consent.json` | not agreed |
| Downloaded Chunker jar | `<userData>/chunker/chunker-cli-<version>.jar` | absent until fetched |
| Chunker jar override | `CHUNKER_CLI_JAR` environment variable, or a path set in settings | unset |
| Pinned Chunker release and digest | `PINNED_CHUNKER` in `main/bedrock/chunker.ts` | reviewed source constant |
| System-dependency route table | `SYSDEP_DEPENDENCIES` in `main/sysdeps/registry.ts` | reviewed source constant |

## Failure modes

| What happens | What the app does |
|---|---|
| No network during a JDK or Chunker download | The stage reports the failure as an alert; nothing partial is left at the final path, and the button stays ready to retry. |
| Digest mismatch | The downloaded bytes are deleted; nothing is extracted or installed. Reported as a refusal, never a silent substitution. |
| Download interrupted mid-transfer | Resumes from the `.part` file already on disk on the next attempt, rather than restarting from zero. |
| A freshly extracted JDK will not run | The broken install record is withdrawn so a later launch does not keep offering it; the failure names the archive URL and install path so it can be inspected. |
| Consent not yet given | `java:provision`/`bedrock:fetchChunker` refuse server-side even if a caller skipped the button, and say so rather than downloading anyway. |
| winget/Chocolatey both absent | The preview reports the dependency as unavailable through either manager, naming both, rather than a single generic failure. |
| Elevation prompt declined | Reported as its own outcome, distinct from "not found" or "network failure", so the row can say plainly that the person said no rather than that something broke. |

## Security considerations

- **Nothing here ever runs as a side effect of looking at something.** Discovery, detection and
  preview are read-only; every download and every install is reachable only from an explicit
  button press.
- **Every archive is verified before extraction**, and every extracted binary is verified again by
  running it, not by trusting the archive's own claim about what it contains.
- **No credential ever crosses these paths.** Adoptium, GitHub's release CDN and the winget/
  Chocolatey manifests are all public, unauthenticated fetches.
- **The elevation prompt is never suppressed, bypassed or auto-accepted.** The app calls
  `winget`/`choco` the ordinary way and reports what they report; a declined prompt is a normal,
  reported outcome, not a retried one.
- **A digest is pinned in source for the one dependency (Chunker) with no publisher signature**,
  so the strongest check does not depend entirely on whichever answer the network gives that
  session.

## Verification

```
cd design
npx vitest run packages/app/src/main/java packages/app/src/main/bedrock packages/app/src/main/sysdeps
npx vitest run packages/ui/src/components/settings packages/ui/src/components/world
npx vitest run packages/ui/src/copy/surfaces/dependencies.test.ts packages/ui/src/copy/appCopy.test.ts packages/ui/src/copy/catalogueCoverage.test.ts
npx tsc -p packages/app --noEmit
(cd packages/ui && npx vue-tsc -p tsconfig.json --noEmit)
```

What the tests assert, specifically — the Java runtime's own suite is covered in full by
[Fetching a Java runtime for itself § Verification](./java-runtime-provisioning.md#verification);
this is the rest:

- **`packages/app/src/main/bedrock/ipc.test.ts`** and **`chunker.test.ts`** — the digest-verified
  fetch, and every state `findChunker` can report.
- **`packages/ui/src/components/world/BedrockConversionNote.test.ts`** — offers the download button
  instead of Convert when Chunker is missing; downloads, reports progress, and reveals Convert only
  once Chunker is actually there; reports a failed fetch as an alert with the button ready to retry.
- **`packages/app/src/main/sysdeps/`** — the preview's package-manager presence check; the install
  pass re-verifying a believed-present tool by actually running it before skipping; elevation
  disclosure per dependency; a declined elevation prompt; both package managers absent; and a
  fresh install verified by running it, the same as an already-present one. `ipc.ts`'s own suite
  additionally covers the three-channel contract: `sysdeps:preview` never touches the install
  path, `sysdeps:install` broadcasts real progress on `sysdeps:installEvent` and folds a second
  concurrent call into the first rather than racing it, and `sysdeps:cancel` reports honestly
  whether anything was actually running to cancel.
- **`packages/ui/src/components/settings/dependencyInstaller.test.ts`** — the state machine behind
  the button: the preview pre-selects only what would actually change, bulk selection stays
  scoped to installable rows, a real Chocolatey percentage and a real winget indeterminate state
  both render without either one inventing a number, a failed row carries its real exit code, and
  a cancelled batch reports exactly what finished and what did not.
- **`packages/ui/src/components/settings/DependencyInstallerPanel.test.ts`** — the same claims,
  against the mounted component: the elevation disclosure names the real dependencies before the
  button is pressed, an unsupported build says so instead of showing a dead button, the Cancel
  button replaces Install while a batch is running, and the search bar actually filters the rows
  on screen.
- **`packages/ui/src/copy/surfaces/dependencies.test.ts`** — every voiced outcome message keeps
  its pinned fact (the real exit code, "administrator permission", "cannot be undone"-equivalent
  language for a cancellation) at all five funny levels, in both languages, and no level invents
  or drops a placeholder.

## Related reading

- [The Minecraft licence and the consent that refers to it](./eula-and-consent.md) — the
  asked-once-remembered-forever shape every download consent in this app follows.
- [Bedrock Edition worlds](./bedrock-worlds.md) — what Chunker converts, what it loses, and the
  full account of what "verified" means for a jar with no publisher signature.
- [Running the engine on this computer, or in a container](./docker-and-local.md) — the honest,
  five-state account of what happens when Docker itself cannot be used, local or remote.
- [Language modes and funny levels](./language-and-tone.md) — why every download's explanation
  keeps the size, the source and the no-PATH/no-admin promise exact at every funny level.

## 廣東話

### 自動安裝依賴 (automatic dependency provisioning) 係做乜

本機算圖係行 BlueMap 自己嘅 Java 引擎，所以個 app 需要有 JVM。要轉換 Bedrock Edition 世界就需要 Chunker，係另一個開源 jar。仲有幾條可選路線 — 發佈上 GitHub、經 SSH 遠端算圖、app 自己嘅 config-history — 都要靠部機有 `git`、`gh`、`ssh` 同 `rsync`。呢啲嘢唔應該要用家自己手動裝好先用得個 app。呢份文件講嘅係：app 會自己攞乜、事前點樣話畀你知、以及當某個依賴真係唔可以用呢個方法裝嗰陣，佢會老實噉做啲乜。

### 四條規則

呢個 app 每一條 provisioning 路線都跟同樣四條規則，下面每一節都係呢四條規則嘅實例，唔係例外：

1. **只限 user 範圍，永遠唔會 system-wide**（喺做得到嘅情況下）。JDK 同 Chunker 會落喺 Electron 自己嘅 `userData` 目錄入面 — 冇 registry key、唔會改 `PATH`、冇 installer、唔使提權。你反安裝個 app 嗰陣佢哋會一齊冇埋。
2. **講清楚咗先做。** 冇任何嘢會因為你問咗個問題而順手落載。每一粒真係會啟動傳輸嘅掣，喺郁到第一個 byte 之前都會講明會攞乜、大約幾大、擺去邊 — 同 [Mojang download consent](./eula-and-consent.md) 已經用緊嗰個形狀一樣，只係擴展到 app 可以自己攞嘅每一件工具。
3. **驗證咗先信。** 每個壓縮檔喺解壓之前都會同 digest 對一對；唔夾就會刪走啲壞 bytes，乜都唔裝。落載途中斷咗會由停低嗰度續傳，唔會由頭嚟過，而寫咗一半嘅嘢永遠唔會execute。
4. **有啲嘢真係冇辦法用呢個方法自動裝**，個 app 會直接講明而唔係扮冇事：佢會講出缺咗乜、點解自己攞唔到、指去真正嘅 installer，並且畀個重新檢查嘅選項 — 同時所有唔需要嗰個依賴嘅功能照樣行得。

### Java runtime

本機算圖搵 JVM 嘅次序係固定嘅 — 先 `JAVA_HOME`，之後 `PATH` 上面嘅 `java`，最後係 app 自己 provision 嗰份 — 而且**每個候選都會真係行過先信**，因為一條路徑唔算證據：`JAVA_HOME` 可以比佢當初指嗰個 JDK 活得仲耐，而一個叫 `jdk-25` 嘅資料夾以前試過裝住個 JDK 17。搵唔到啱用嘅嗰陣，Java runtime 設定嗰行會出一粒 **Download Java (~140 MB)** 掣 — 嗰個數字係真係量度返嚟嘅，唔係估 — 佢會講明來源、喺撳嗰下記低同意、用可續傳兼 digest 驗證嘅方式落載、確認咗個壓縮檔入面真係有 `bin/java` 先解壓，跟住**行一行啱啱裝好嗰個 JDK** 先報成功，同發現階段對住一個「淨係搵到」嘅候選一樣嚴格。

[Fetching a Java runtime for itself](./java-runtime-provisioning.md) 係完整版：同意嘅形狀、涉及嘅每條 IPC channel、對住 Adoptium 自己 server 嘅真實網絡驗證，同埋完整嘅 failure-mode 表。呢份文件之後講嘅，就係其他每件工具都重複緊嘅同一個形狀。

### Chunker：轉換 Bedrock 世界

轉換 Bedrock Edition 世界要用 Chunker，即係 Hive Games 嘅開源轉換器（MIT 授權）— 轉換會保留同唔會保留啲乜，睇 [Bedrock Edition worlds](./bedrock-worlds.md)。個 app 唔會 bundle 佢：為咗一個大部分人都唔會用嘅功能，喺每個 installer 度加大約 30 MB 唔抵，而且 bundle 咗就等於將轉換器版本釘死喺某個 app release 上面。

當偵測到 Bedrock 世界而部機又冇 Chunker 嗰陣，wizard 嘅 Bedrock 提示會喺原本應該係 **Convert** 嗰個位出一粒 **Download Chunker (~30 MB)** 掣 — 兩粒唔會同時出現，因為一粒實會失敗嘅 Convert 掣，仲衰過根本唔畀。撳落去就會攞釘死咗嗰個 release，用一個 commit 咗喺呢個 app 自己 source 入面嘅 SHA-256 嚟驗證 — 呢個係老實講攞得到嘅最強檢查，因為 Hive Games 冇為個 CLI jar 出過 detached signature 或者 checksum 檔 — 進度回報方式同 Java 落載一樣。完整嘅驗證故事，包括新 release 會行到嗰條較弱嘅 `digestTrust: "api"` 路徑，睇 [Bedrock Edition worlds § Obtaining it, and what "verified" honestly means](./bedrock-worlds.md#obtaining-it-and-what-verified-honestly-means)。

### 用 winget/Chocolatey 裝系統依賴

有幾個可選功能靠住啲 command-line 工具，而部 Windows 機可能有可能冇：`git`（呢個 app 自己嘅 config-history）、GitHub CLI（另一條登入路線）、Docker Desktop（container 算圖路線）同 `rsync`（可續傳嘅遠端世界上載）。凡係 Windows 自己嘅 package manager 真係裝得到嘅，個 app 就會直接提出幫你行嗰個安裝，而唔係淨係畀條落載連結你。

`main/sysdeps/` 會偵測有冇 `winget` 同／或 Chocolatey，再由一張細細嘅、經人審過嘅表（`registry.ts`）解析出每個依賴偏好用邊個 manager、package id 係乜，跟住 — 喺裝任何嘢之前 — 預覽每一行：會用邊個 manager、package manager 自己有冇記住佢已經裝咗、以及**確切會彈出邊個管理員權限提示**，係逐個依賴寫，唔係一句通用警告。Git 同 GitHub CLI 嘅官方 Windows installer 預設係全機安裝，實會觸發 Windows 自己嘅提權提示；Docker Desktop 嘅 WSL2/Hyper-V 整合喺而家所有 Windows 設定上面都無可避免需要提權。呢啲嘢冇一樣係收埋喺一句籠統嘅「可能需要權限」後面 — 撳掣之前就會講明確切原因，而且個 app 永遠唔會壓抑、繞過或者自動接受嗰個提權提示。

預覽嘅存在檢查係平嘢又唯讀 — 佢淨係問 package manager 自己嘅紀錄（`winget list`/`choco list`），快到可以喺決定任何嘢之前為每一行都行一次。安裝嗰一 pass 就嚴格啲：喺跳過一個佢認為已經裝咗嘅依賴之前，佢會**真係行一行嗰個工具**，再用 pattern 對返個輸出（例如 `git --version` 要 match `/git version/i`，如此類推）— 同 `java/probe.ts` 對住搵返嚟嘅 JVM 用嘅係同一套紀律，因為 package manager 報成功唔等於支工具行得。每一次全新安裝喺報「已裝」之前都要過同一個檢查。

### 一粒掣嘅設定畫面

上面成節講嘅係機房；**Settings → System dependencies** 先係人真正撳掣嗰度。`DependencyInstallerPanel.vue` 一 mount 就會叫 `sysdeps:preview`，再喺*未揀任何一個依賴之前*就 render 攞返嚟嗰張完整表 — 路線、提權、目前安裝狀態 — 所以上一節講嘅披露唔係淨係寫喺 source comment 入面嘅承諾：佢係畫面上第一樣嘢。已經裝咗嘅行會自動唔計入預設選擇，因為再裝多次唔算係一個掣抵攞功勞嘅改動。

撳 **Install {n} selected** 會為成批嘢叫一次 `sysdeps:install`，之後訂閱 `sysdeps:installEvent` 睇餘下嘅過程。進度顯示同引擎報返嚟嘅一樣老實 — Chocolatey 有真百分比就用 determinate bar，winget 淨係有 phase 嘅 stdout 就用 indeterminate，至於根本冇百分比概念嘅階段（`resolving`、`checking-existing`、提權提示本身）就乜 bar 都冇。呢度永遠唔會插一個 package manager 冇印過嘅百分比出嚟。**Cancel** 會經 `sysdeps:cancel` 中止真正嘅 child process；嗰刻裝到一半嘅會回報 `"cancelled"`，唔會撈埋落一個籠統嘅失敗入面，而已經做完嘅照樣報做完 — 粒掣自己嘅總結會老實講出邊啲成邊啲唔成，唔會為成批嘢畀一個單一嘅 pass/fail 判斷。

面板其餘部分係呢個 app 每個集合介面都帶住嘅同一份共用合約，係重用而唔係重新發明：`ConfigSearchField` 畀行列表一個自己嘅 anchored regex-builder 搜尋；bulk 全選／反選／唔揀會老實報出真係會改變嘅行數（已裝嘅唔計）；每一行都包住 `AppearanceTarget`，即係逐行 context menu 嘅來源，帶自己嘅搜尋、顯示出嚟嘅鍵盤快捷鍵，同埋 Shift+右擊直入 appearance editor；結果同批次總結經共用通知佇列（`raiseNotice`）發出，所以會以唔阻塞嘅 toast 出現，之後仲會留喺通知中心嘅歷史入面；完整嘅 event log — 每個階段、每個 manager、每個真百分比、每個結果 — 可以匯出做 JSON、Markdown 或者純文字。

### 有啲嘢唔會自動裝，點解

有啲依賴留喺「老實降級」嗰個桶入面，唔係因為用呢個方法裝要提權而呢個 app 冇途徑批出，就係因為淨係自動裝個 binary 都消除唔到剩低嗰個手動步驟。文件嗰張表列咗四項：Windows 嘅 OpenSSH client 要用 DISM 加管理員權限先開到嗰個 optional feature，冇 user 範圍嘅裝法，所以個 app 淨係講明缺咗乜（`ssh` 唔喺 `PATH` 上面）同埋 Windows 係當佢做 optional feature 出貨；`gh` 登入方面，裝咗個 binary 都仲係未登入 — `gh` 自己嘅 device-code 登入冇辦法喺 spawn 出嚟嘅 process 度 headless 噉行，所以個 app 講明缺咗個 binary，再指去 app 自己嗰個 in-app GitHub 登入，嗰個乜都唔使裝；遠端主機上面嘅 Docker 淨係經 SSH 掂到，原則上都冇權喺嗰邊裝任何嘢，所以個 app 會報出五個唔同狀態入面邊個成立（未安裝、daemon 掂唔到、權限被拒等等），每個都講明下一步；至於 `opencode`（自動修復用嘅本機 coding agent），就算 provision 咗個 binary，都仲要用家自己配置好 model credentials 先行得郁，所以個 app 淨係平實噉報出呢件事，唔當佢係錯誤 — 自動修復冇咗佢照樣行晒其他做得到嘅嘢。

### 設定

設定表列出六樣嘢同佢哋嘅預設：provision 返嚟嘅 JDK 放喺 `<userData>/java/<feature>/`，未同意落載之前唔存在；Java 落載同意記喺 `<userData>/java/download-consent.json`，預設係未同意；落載返嚟嘅 Chunker jar 放喺 `<userData>/chunker/chunker-cli-<version>.jar`，未攞之前唔存在；Chunker jar 可以用 `CHUNKER_CLI_JAR` 環境變數或者設定入面一條路徑覆寫，預設冇設；釘死咗嘅 Chunker release 同 digest 喺 `main/bedrock/chunker.ts` 嘅 `PINNED_CHUNKER`，係經審核嘅 source constant；系統依賴嘅路線表喺 `main/sysdeps/registry.ts` 嘅 `SYSDEP_DEPENDENCIES`，同樣係經審核嘅 source constant。

### 失敗情況

落載 JDK 或者 Chunker 嗰陣冇網絡：嗰個階段會用 alert 報失敗，最終路徑度唔會留低任何半製成品，粒掣照樣可以再試。Digest 唔夾：落載返嚟嘅 bytes 會刪走，乜都唔會解壓或者安裝，會當成一次拒絕嚟報，永遠唔會靜靜雞用第二樣嘢頂替。傳輸中途斷咗：下次會由磁碟上面已經有嘅 `.part` 檔續傳，唔會由零開始。啱啱解壓出嚟嘅 JDK 行唔到：嗰個壞咗嘅安裝紀錄會被撤回，令之後啟動唔會再拎佢出嚟用，而失敗訊息會講明 archive URL 同安裝路徑方便檢查。未畀同意：就算有 caller 跳過咗粒掣，`java:provision`/`bedrock:fetchChunker` 都會喺 server 端拒絕並且講明，唔會照落載。winget 同 Chocolatey 兩個都冇：預覽會報明呢個依賴喺兩個 manager 都攞唔到，並且兩個都點名，唔會淨係畀一個籠統失敗。提權提示被拒絕：當成一個獨立結果嚟報，同「搵唔到」或者「網絡失敗」分開，噉樣嗰行先可以直接講係個人話咗唔好，而唔係有嘢壞咗。

### 安全考慮

- **呢度冇任何嘢會因為你望一望就順手行。** 發現、偵測同預覽全部係唯讀；每次落載同每次安裝都淨係經明確撳掣先到得。
- **每個壓縮檔喺解壓之前都會驗證**，而每個解壓出嚟嘅 binary 會再用「行一行佢」嚟驗多次，唔會淨係信個壓縮檔自稱裝住乜。
- **呢啲路徑上面永遠唔會經過任何 credential。** Adoptium、GitHub 嘅 release CDN 同 winget/Chocolatey manifest 全部係公開、免認證嘅 fetch。
- **提權提示永遠唔會被壓抑、繞過或者自動接受。** 個 app 用平常方式叫 `winget`/`choco`，佢哋報乜就講乜；被拒絕嘅提示係一個正常兼會被報出嚟嘅結果，唔會攞去重試。
- **唯一一個冇發行方簽名嘅依賴（Chunker），佢個 digest 釘死喺 source 入面**，令最強嗰個檢查唔會完全靠網絡嗰次 session 畀返乜答案。

### 驗證

```
cd design
npx vitest run packages/app/src/main/java packages/app/src/main/bedrock packages/app/src/main/sysdeps
npx vitest run packages/ui/src/components/settings packages/ui/src/components/world
npx vitest run packages/ui/src/copy/surfaces/dependencies.test.ts packages/ui/src/copy/appCopy.test.ts packages/ui/src/copy/catalogueCoverage.test.ts
npx tsc -p packages/app --noEmit
(cd packages/ui && npx vue-tsc -p tsconfig.json --noEmit)
```

啲測試具體 assert 乜 — Java runtime 自己嗰套完整覆蓋喺 [Fetching a Java runtime for itself § Verification](./java-runtime-provisioning.md#verification)，以下係其餘部分：

- **`packages/app/src/main/bedrock/ipc.test.ts`** 同 **`chunker.test.ts`** — digest 驗證嘅 fetch，同埋 `findChunker` 報得出嘅每一個狀態。
- **`packages/ui/src/components/world/BedrockConversionNote.test.ts`** — Chunker 唔見咗嗰陣出落載掣代替 Convert；落載、報進度，而且要真係有咗 Chunker 之後先顯示 Convert；fetch 失敗會當 alert 報，粒掣可以再試。
- **`packages/app/src/main/sysdeps/`** — 預覽嘅 package-manager 存在檢查；安裝 pass 喺跳過之前真係行一行嗰個「以為已經有」嘅工具嚟再驗證；逐個依賴嘅提權披露；被拒絕嘅提權提示；兩個 package manager 都冇；同埋全新安裝一樣要行一行嚟驗證，同已經存在嗰個一樣。`ipc.ts` 自己嗰套仲覆蓋咗三條 channel 嘅合約：`sysdeps:preview` 永遠唔會掂安裝路徑，`sysdeps:install` 會喺 `sysdeps:installEvent` 廣播真進度並且將第二個並行呼叫摺埋入第一個而唔係同佢爭，而 `sysdeps:cancel` 會老實報返究竟有冇嘢真係喺度行緊可以取消。
- **`packages/ui/src/components/settings/dependencyInstaller.test.ts`** — 粒掣背後嘅狀態機：預覽只會預先揀真係會有改動嘅嘢，bulk 選擇只限可裝嘅行，真嘅 Chocolatey 百分比同真嘅 winget indeterminate 狀態兩者都 render 得到而冇一個會作個數字出嚟，失敗嘅行帶住佢真正嘅 exit code，而被取消嘅批次會準確報出邊啲做完咗、邊啲冇。
- **`packages/ui/src/components/settings/DependencyInstallerPanel.test.ts`** — 同樣嘅主張，但係對住已 mount 嘅 component：提權披露喺撳掣之前就點名真實嘅依賴，唔支援嘅 build 會直接講明而唔係擺粒死掣，批次行緊嗰陣 Cancel 掣會頂走 Install，而搜尋列真係會過濾畫面上嘅行。
- **`packages/ui/src/copy/surfaces/dependencies.test.ts`** — 每一句有語氣嘅結果訊息，喺全部五個 funny level、兩種語言之下都保住佢釘死嘅事實（真 exit code、「administrator permission」、取消時等同「cannot be undone」嘅講法），而且冇任何一個 level 會作多個或者漏咗個 placeholder。

### 相關閱讀

- [The Minecraft licence and the consent that refers to it](./eula-and-consent.md) — 呢個 app 每個落載同意都跟嘅「問一次、記一世」形狀。
- [Bedrock Edition worlds](./bedrock-worlds.md) — Chunker 轉乜、蝕咗乜，同埋對一個冇發行方簽名嘅 jar 嚟講「verified」到底解乜嘅完整說明。
- [Running the engine on this computer, or in a container](./docker-and-local.md) — 當 Docker 本身用唔到（本機或者遠端）嗰陣，嗰個老實嘅五狀態說明。
- [Language modes and funny levels](./language-and-tone.md) — 點解每個落載嘅解釋喺任何 funny level 都要將大細、來源同「唔改 PATH／唔使 admin」嘅承諾講到一模一樣準。
