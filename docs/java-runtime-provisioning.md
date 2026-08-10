# Fetching a Java runtime for itself

Local rendering runs on BlueMap's own Java engine (decision D17), so the app needs a JVM. Until
now, "the app needs a JVM" meant a person had to go and install one themselves: the download,
verify, extract and install pipeline for a Temurin JDK existed in full, was unit-tested, and was
reachable from nothing a person could click. The settings row even said, in as many words, "the
app can fetch one for you" — and then offered a single button, **Look again**, that only re-ran
discovery. This document covers what closes that gap: an explicit **Download Java** button, the
one-time consent it is gated behind, and the real-network proof that the pipeline it calls
actually works against Adoptium's own servers rather than only against test fakes.

## Contents

- [Behaviour](#behaviour)
- [Consent, in the Mojang download's own shape](#consent-in-the-mojang-downloads-own-shape)
- [The pipeline the button calls](#the-pipeline-the-button-calls)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Suggested articles](#suggested-articles)

## Behaviour

The Java settings row (`packages/ui/src/components/settings/JavaRuntimeRow.vue`) always shows what
`java:runtime` actually found — `JAVA_HOME`, then `java` on `PATH`, then a copy the app installed
for itself, each one **run** before being believed, never merely assumed from a path. When none of
those is suitable, the row's `missing` state now offers a real action instead of only naming
`JAVA_HOME` as the fix:

1. **The explanation comes first.** Before any button does anything, the row states what will be
   fetched (Eclipse Temurin), from where (Adoptium's own servers), roughly how big the transfer is,
   and the three promises that make it safe to press: nothing is installed system-wide, `PATH` is
   never touched, and no administrator rights are asked for.
2. **Download Java** starts the transfer. The button is disabled and replaced by a progress bar for
   the whole run; the bar is indeterminate until Adoptium's response has named a real byte count,
   and becomes determinate once it has. A stage message underneath tracks the same
   `ProvisionEvent` stream the pipeline always emitted (`resolving`, `downloading`, `verifying`,
   `extracting`, `installing`, `done`) — this was already built and tested; what was missing was
   something in the interface reading it.
3. **On success the row reloads discovery itself.** Nobody has to press a second, unrelated "Look
   again" after watching a download finish; the row moves straight from `missing` to `found`.
4. **On failure the main process's own sentence is shown**, verbatim, in an alert beside the
   button, which stays ready to retry.

A build whose preload has not grown the three provisioning channels (an older desktop build, or a
browser tab with no main process at all) shows none of this: `canProvision` is feature-detected,
and the row falls back to the discovery-only behaviour it always had rather than a button that
would throw. This is the same "nothing here invents a capability" rule every other row in this
settings surface already follows.

## Consent, in the Mojang download's own shape

Principle: downloading and installing software is not a neutral act, and the app already has the
right precedent for how to ask about one — the Mojang download consent, asked once at first
launch, remembered forever, never asked again. The Java download follows that shape, adapted to
where it is actually decided:

- `main/java/consent.ts` records the decision as a small JSON file under
  `<userData>/java/download-consent.json`, written through a staging file and a rename so a crash
  mid-write cannot leave a half-written answer — the identical pattern `main/consent.ts` uses for
  the Mojang EULA, restated for this file rather than shared with it, because agreeing to fetch a
  JVM is not agreeing to Mojang's licence and the two records should never be able to answer for
  each other.
- Rather than a separate first-run screen, the *button itself* is where the explanation and the
  decision meet: pressing **Download Java** is what the row treats as consent, because the row has
  already shown the size and the source immediately above it. The first click records the
  acceptance (`java:acceptDownloadConsent`) and starts the download in the same action; every click
  after that skips straight to downloading, because the answer is already on record.
- **The main process is the actual gate, not merely the UI.** `java:provision` reads
  `readJavaDownloadConsent()` itself and refuses — with an honest message, never a thrown error —
  when no acceptance is on file, regardless of what called it or how. A caller that skipped the
  explanation still cannot start an unannounced download; the row's own bookkeeping only keeps its
  displayed state honest about what is about to happen.

## The pipeline the button calls

Nothing about the download-verify-extract-install pipeline itself is new; it predates this task and
was already unit-tested. What changed is that it is now reachable:

- `main/java/adoptium.ts` resolves the current Temurin release for the required feature version
  (`REQUIRED_JAVA_FEATURE`, currently 25) and the running platform/architecture from Adoptium's own
  API.
- `main/java/download.ts`'s `downloadVerified()` streams the archive to a `.part` file, resumes a
  partial one rather than restarting, and checks the finished file's SHA-256 against the digest
  Adoptium's own response carried — before a single byte is extracted.
- `main/java/extract.ts` unpacks into a staging directory and renames it into place only after a
  real `bin/java` has been found inside it, so a half-extracted archive is never mistaken for an
  install.
- `main/java/installation.ts` writes a record of exactly what was installed — version, vendor, OS,
  architecture, archive URL, the verified SHA-256, and the timestamp — so a settings row can state
  "Java 25.0.4+7, provisioned by the app" rather than a guess.
- `main/java/index.ts`'s `ensureJava()` ties it together: discovery first, and the download only
  runs when discovery found nothing suitable *and* `allowProvisioning` was explicitly set. The
  freshly installed JVM is then **probed like any other candidate** — run, not trusted — because an
  archive can unpack into something that does not launch, a disk can be full, or an antivirus can
  quarantine a binary between the rename and the first launch.

Three IPC channels put this behind the button (`main/java/ipc.ts`):

| Channel | What it does |
|---|---|
| `java:downloadConsent` | Reads the stored decision. |
| `java:acceptDownloadConsent` | Records agreement. Idempotent — calling it again keeps the original timestamp. |
| `java:provision` | Refuses without consent; otherwise calls `ensureJava({ allowProvisioning: true })` and streams every `ProvisionEvent` to `java:provisionEvent` on every open window, the same broadcast shape `bedrock:convert` already uses for a Chunker conversion's progress. |

Concurrent calls to `java:provision` are folded into one in-flight promise, the same rule
`java:runtime` already followed — a screen that mounts and immediately re-renders must not start a
second, redundant download racing the first.

## Configuration

There is nothing to configure. The install lands at `<userData>/java/temurin-25/` (keyed by
feature version rather than by exact patch release, so an update replaces the install instead of
accumulating a new folder per patch), and a machine that already has a suitable `JAVA_HOME` or
`java` on `PATH` is used ahead of anything provisioned — the button never appears unless discovery
already found nothing usable.

## Failure modes

| What happens | What the row does |
|---|---|
| The download button is pressed with no consent on record | Never actually reachable: pressing it *is* the first consent, recorded before the transfer starts. |
| `java:provision` is called with consent withdrawn or never given (a stale UI, a replayed call) | The main process refuses with an explanatory message; nothing is downloaded. |
| The digest does not match | `downloadVerified()` deletes the bad bytes and throws; the row shows the main process's own sentence and stays ready to retry. |
| The network drops mid-transfer | The partial `.part` file is kept; pressing the button again resumes rather than restarting. |
| The archive extracts but the resulting `java` will not run, or reports a version too old | The install record is withdrawn (`clearInstallRecord`) so a later launch does not offer a known-broken install as a candidate, and the failure names the exact executable and reason. |
| A build has no `ensure` wired into `java:provision` at all | `java:provision` answers "This build cannot download a Java runtime from here" rather than throwing. |
| A browser tab, or an older desktop build with no provisioning channels | `canProvision` is false; the row shows its pre-existing discovery-only text and no dead button. |

## Security considerations

- **User-scoped only.** Everything lands under Electron's `userData`; nothing is written to the
  registry, nothing is added to `PATH`, no installer runs, and no elevation is ever requested.
  Uninstalling the app takes the provisioned JDK with it.
- **Verified before use, every time.** The SHA-256 comes from the same Adoptium API response that
  carried the download link, checked against the finished file before extraction — never trusted
  from the URL or the response headers alone.
- **A crash cannot half-install.** The download writes to a `.part` file; extraction stages into a
  temporary directory and is renamed into place only once a real `java` binary is confirmed inside
  it.
- **Never a side effect.** `java:runtime` (the discovery a settings row loads on every visit, and
  every render checks before starting) never provisions anything on its own — only the explicit
  `java:provision` channel, reachable only from the button, ever downloads.

## Verification

`design/packages/app/src/main/java/` carries a large passing suite across the layer this document
describes, plus three real-network proofs gated behind `MBM_REAL_JDK_DOWNLOAD=1` (skipped by
default so ordinary CI runs do not depend on Adoptium's availability, and never download ~140 MB on
every push):

- `consent.test.ts` — every unhappy path for the download-consent record resolves to
  "not accepted": a missing file, malformed JSON, the wrong shape, a stale terms version. Only a
  well-formed record this module itself wrote reads as agreement.
- `ipc.test.ts` — the two consent channels, and `java:provision` refusing without consent,
  refusing honestly with no `ensure` wired in, provisioning and streaming progress through
  `broadcast` once consent is given, folding concurrent calls into one `ensure()` run, and cleaning
  a thrown failure's message the same way every other rejection on this channel is cleaned.
- `download.test.ts`, `extract.test.ts`, `installation.test.ts`, `adoptium.test.ts`, `jars.test.ts`,
  `discovery.test.ts`, `version.test.ts`, `packaging.test.ts`, `index.test.ts` — the pre-existing
  suite for the pipeline itself, unchanged by this task.
- **`download.realNetwork.test.ts`, `provision.realNetwork.test.ts`, `ensureJava.realNetwork.test.ts`**
  — opt-in proofs against Adoptium's real servers rather than fakes. The most recent run resolved a
  real release (`jdk-25.0.4+7`, Windows x64), downloaded **141,164,204 bytes** from GitHub's real
  release CDN, verified its real SHA-256, extracted it with the real bundled `tar.exe`, and ran the
  extracted `java` to confirm it reports `25.0.4`. The "roughly 140 MB" figure quoted in the
  settings row's own explanation, and pinned in the copy catalogue's `FACTS`, is that measured
  number rounded — not a guess.

On the interface side:

- `packages/ui/src/components/settings/javaSetting.test.ts` — `canProvision` feature
  detection, reading and treating a failed consent read as "not known" rather than "accepted",
  recording consent as part of the first download click and never re-recording it on a second,
  streaming and unsubscribing from progress events, refusing a second concurrent download while one
  is in flight, and reporting both a main-process refusal and a thrown error as `provisionFailure`
  rather than swallowing either.
- `packages/ui/src/components/settings/JavaRuntimeRow.test.ts` — the button, its explanation, the
  progress bar, and the "found" state the row lands on after a successful download.
- `packages/ui/src/copy/` — the catalogue-coverage guard that fails when a rendered `t(...)` key has
  no catalogue entry, and the FACTS guard that fails when a voiced entry drops a pinned fact (the
  size, the "Adoptium" source, "system-wide", "administrator") at any of its five funny levels.

Run locally with:

```sh
cd design
npx vitest run packages/app/src/main/java/ packages/ui/src/components/settings/javaSetting.test.ts packages/ui/src/components/settings/JavaRuntimeRow.test.ts

# Opt-in real-network proof against Adoptium's actual servers (~140 MB download):
MBM_REAL_JDK_DOWNLOAD=1 npx vitest run packages/app/src/main/java/provision.realNetwork.test.ts packages/app/src/main/java/ensureJava.realNetwork.test.ts packages/app/src/main/java/download.realNetwork.test.ts
```

## Suggested articles

- [Automatic dependency provisioning](./dependency-provisioning.md) — the shape this Java download
  follows, applied to Chunker and to `git`/`gh`/Docker Desktop/`rsync` through winget/Chocolatey,
  plus the dependencies that genuinely stay a manual install.
- [Bedrock Edition worlds](./bedrock-worlds.md) — Chunker follows the identical shape: a fully
  built, digest-verified download handler that had no button calling it, closed the same way.
- [The Minecraft licence and the consent that refers to it](./eula-and-consent.md) — the
  asked-once-remembered-forever consent shape this document's own consent record is built from.
- [Running the engine on this computer, or in a container](./docker-and-local.md) — the other route
  to a working JVM for a machine that would rather not provision one at all.
- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) — what
  happens when a render still fails after this.

## 廣東話

### 概要

本機渲染係行 BlueMap 自己嘅 Java 引擎（決定 D17），所以個 app 需要一個 JVM。以前「個 app 需要 JVM」即係要有人自己落手裝：下載、驗證、解壓、安裝一條完整嘅 Temurin JDK pipeline 其實一早寫好晒、有齊 unit test，但界面上冇任何嘢撳得到去觸發佢。設定行仲白紙黑字寫住「the app can fetch one for you」，然後就得一個 **Look again** 掣，淨係重跑 discovery。呢份文件講嘅就係點樣填咗呢個窿：一個明確嘅 **Download Java** 掣、佢背後把關嗰個一次性同意，仲有真網絡證明，證實個掣呼叫嗰條 pipeline 對住 Adoptium 真正嘅伺服器都行得通，而唔係淨係對住 test fakes。

### 行為（Behaviour）

Java 設定行（`packages/ui/src/components/settings/JavaRuntimeRow.vue`）永遠顯示 `java:runtime` 真正搵到嘅嘢——先係 `JAVA_HOME`，跟住係 `PATH` 上面嘅 `java`，最後先係 app 自己裝嘅副本，每一個都會**真係行過**先信，唔會齋靠條 path 就假設得到。冇一個啱用嘅時候，個行嘅 `missing` 狀態而家會畀一個真動作，唔再係淨係叫你去搞 `JAVA_HOME`：

1. **解釋行先。**未有任何掣做任何嘢之前，個行已經講明會攞乜（Eclipse Temurin）、由邊度攞（Adoptium 自己嘅伺服器）、大約要傳幾大，仲有三個令佢撳得落手嘅承諾：唔會裝落系統層面、`PATH` 唔會掂、亦唔會問你攞管理員權限。
2. **Download Java** 開始傳輸。成個過程個掣會停用，換成一條進度條；Adoptium 個 response 未報到真正嘅 byte 數之前，條進度條係 indeterminate，報到之後就變 determinate。下面一行 stage message 跟住條 pipeline 一直以嚟發出嘅 `ProvisionEvent` stream（`resolving`、`downloading`、`verifying`、`extracting`、`installing`、`done`）——呢啲一早起好又測試好，欠嘅只係界面上有嘢去讀佢。
3. **成功之後個行自己重新行一次 discovery。**冇人需要睇完個下載完成之後再撳多個無關嘅「Look again」；個行直接由 `missing` 行到 `found`。
4. **失敗嘅話，main process 自己嗰句說話會原封不動咁顯示**，喺個掣旁邊用 alert 出，而個掣隨時準備好重試。

如果一個 build 嘅 preload 未加到嗰三條 provisioning channels（舊版 desktop build，或者根本冇 main process 嘅瀏覽器 tab），就完全唔會見到呢啲嘢：`canProvision` 係 feature-detected，個行會退返去佢一直有嘅 discovery-only 行為，而唔係擺一個一撳就 throw 嘅掣出嚟。呢個同呢個設定介面其他行一直跟開嘅「呢度冇嘢會無中生有一個能力」規則係同一條。

### 同意機制，跟 Mojang 下載嗰套嘅形狀

原則：下載同安裝軟件唔係一件中性嘅事，而個 app 一早有一個啱樣嘅先例——Mojang 下載嗰個同意：第一次啟動問一次，永遠記住，之後唔再問。Java 下載跟返呢個形狀，再按實際做決定嘅位置調整：

- `main/java/consent.ts` 將個決定寫做一個細細嘅 JSON 檔，放喺 `<userData>/java/download-consent.json`，經一個 staging file 再 rename 咁寫，等寫到一半 crash 都唔會留低一個寫咗一半嘅答案——同 `main/consent.ts` 處理 Mojang EULA 嗰個模式一模一樣，但係為呢個檔案重寫一次而唔係同佢共用，因為同意攞一個 JVM 唔等於同意 Mojang 個 licence，兩個紀錄永遠唔應該可以互相代答。
- 冇獨立嘅 first-run 畫面：解釋同決定就喺*個掣本身*相遇——撳 **Download Java** 就係個行當做嘅同意，因為個行已經喺正上方講咗大小同來源。第一下撳落去會記錄接受（`java:acceptDownloadConsent`）並且同一個動作開始下載；之後每一下都直接跳去下載，因為答案已經記錄在案。
- **真正把關嘅係 main process，唔係淨係 UI。**`java:provision` 自己讀 `readJavaDownloadConsent()`，冇同意在案就拒絕——用一句誠實嘅說話，永遠唔係 throw error——無論係邊個、點樣呼叫都一樣。一個跳過咗解釋嘅 caller 一樣冇辦法開始一個未宣佈嘅下載；個行自己嘅記帳只係令佢顯示嘅狀態對將會發生嘅事誠實。

### 個掣呼叫嘅 pipeline

下載-驗證-解壓-安裝嗰條 pipeline 本身冇任何新嘢；佢早過呢個任務存在而且一早有 unit test。變咗嘅係佢而家有路可達：

- `main/java/adoptium.ts` 由 Adoptium 自己嘅 API 解析出所需 feature version（`REQUIRED_JAVA_FEATURE`，而家係 25）加當前平台／架構嘅最新 Temurin release。
- `main/java/download.ts` 嘅 `downloadVerified()` 將個 archive stream 落一個 `.part` 檔，已有一半嘅會續傳而唔係重新開始，完成之後會用 Adoptium 自己個 response 帶嚟嘅 SHA-256 對一次個完成檔——一個 byte 都未解壓之前。
- `main/java/extract.ts` 解壓落一個 staging directory，要入面真係搵到 `bin/java` 先會 rename 入正位，所以解壓咗一半嘅 archive 永遠唔會被錯當成一個安裝。
- `main/java/installation.ts` 寫低確實裝咗乜——version、vendor、OS、architecture、archive URL、驗證過嘅 SHA-256 同 timestamp——咁設定行就可以講「Java 25.0.4+7, provisioned by the app」而唔係靠估。
- `main/java/index.ts` 嘅 `ensureJava()` 將成件事綁埋：discovery 先行，只有 discovery 咩都搵唔到*而且*明確設定咗 `allowProvisioning`，先會落手下載。啱啱裝完嘅 JVM 之後會**當普通候選一樣試行**——行過，唔係信——因為一個 archive 可以解壓出一個開唔到嘅嘢、隻碟可以爆滿，防毒亦可以喺 rename 同第一次啟動之間隔離咗個 binary。

三條 IPC channels 將呢啲嘢放喺個掣後面（`main/java/ipc.ts`）：`java:downloadConsent` 讀已儲存嘅決定；`java:acceptDownloadConsent` 記錄同意，而且係 idempotent——再叫一次會保留原本個 timestamp；`java:provision` 冇同意就拒絕，否則呼叫 `ensureJava({ allowProvisioning: true })`，並將每個 `ProvisionEvent` stream 去每個開緊嘅 window 嘅 `java:provisionEvent`，同 `bedrock:convert` 廣播 Chunker 轉換進度用嘅形狀一樣。

同時嚟多過一個 `java:provision` 呼叫會摺埋做一個 in-flight promise，同 `java:runtime` 一直跟開嗰條規則一樣——一個 mount 完即刻 re-render 嘅畫面，唔可以開一個多餘嘅第二個下載去同第一個鬥快。

### 配置（Configuration）

冇嘢需要配置。個安裝會落喺 `<userData>/java/temurin-25/`（用 feature version 做 key 而唔係確切嘅 patch release，所以更新會取代個安裝而唔係每個 patch 積一個新 folder）；一部本身已經有啱用嘅 `JAVA_HOME` 或者 `PATH` 上有 `java` 嘅機，永遠優先用返嗰啲——discovery 搵到嘢嘅話，個掣根本唔會出現。

### 失敗情況（Failure modes）

- 冇同意在案就撳下載掣：實際上冇可能發生——撳落去*就係*第一次同意，喺傳輸開始之前已經記錄。
- `java:provision` 喺同意被撤回或者從未畀過嘅情況下被呼叫（stale UI、replay 咗嘅 call）：main process 用解釋性訊息拒絕；乜都唔會下載。
- Digest 對唔上：`downloadVerified()` 剷咗啲壞 bytes 然後 throw；個行顯示 main process 自己嗰句，個掣隨時可以重試。
- 網絡中途斷咗：個 `.part` 檔會保留；再撳掣係續傳而唔係重新開始。
- Archive 解壓到但出嚟個 `java` 行唔起，或者報一個太舊嘅版本：安裝紀錄會被撤回（`clearInstallRecord`），咁之後啟動就唔會拎一個已知壞咗嘅安裝做候選，而個失敗會講明確實係邊個 executable、乜嘢原因。
- 一個 build 嘅 `java:provision` 根本冇接 `ensure`：`java:provision` 會答「This build cannot download a Java runtime from here」而唔係 throw。
- 瀏覽器 tab，或者冇 provisioning channels 嘅舊 desktop build：`canProvision` 係 false；個行顯示佢原有嘅 discovery-only 文字，冇死掣。

### 保安考量（Security considerations）

- **只係 user-scoped。**所有嘢落喺 Electron 嘅 `userData` 下面；唔寫 registry、唔加嘢入 `PATH`、唔行 installer、永遠唔會要求提權。移除個 app 會連 provision 咗嘅 JDK 一齊帶走。
- **每次用之前都驗證過。**個 SHA-256 嚟自帶住下載連結嗰個同一個 Adoptium API response，喺解壓之前對住完成咗嘅檔案檢查——永遠唔會齋信條 URL 或者 response headers。
- **Crash 冇可能裝一半。**下載寫落 `.part` 檔；解壓 stage 落臨時目錄，確認入面有真嘅 `java` binary 先 rename 入正位。
- **永遠唔係副作用。**`java:runtime`（設定行每次打開都 load、每次 render 開始前都 check 嗰個 discovery）自己永遠唔會 provision 任何嘢——只有明確嘅 `java:provision` channel，即係得個掣先掂得到嗰條，先會下載。

### 驗證（Verification）

`design/packages/app/src/main/java/` 有一大套 pass 晒嘅測試覆蓋呢份文件講嘅層面，另外有三個真網絡證明，鎖喺 `MBM_REAL_JDK_DOWNLOAD=1` 後面（預設 skip，咁平時 CI 唔會依賴 Adoptium 嘅可用性，亦唔會每次 push 都下載約 140 MB）：

- `consent.test.ts`——下載同意紀錄嘅每個 unhappy path 都解析做「未接受」：檔案唔存在、JSON 壞咗、形狀唔啱、terms version 過期。只有呢個 module 自己寫嘅完好紀錄先讀得出係同意。
- `ipc.test.ts`——兩條 consent channels，加 `java:provision` 冇同意時拒絕、冇接 `ensure` 時誠實咁拒絕、有同意時 provision 並經 `broadcast` stream 進度、將同時嘅呼叫摺做一次 `ensure()`、同用呢條 channel 其他 rejection 一樣嘅方式清理 throw 出嚟嘅錯誤訊息。
- `download.test.ts`、`extract.test.ts`、`installation.test.ts`、`adoptium.test.ts`、`jars.test.ts`、`discovery.test.ts`、`version.test.ts`、`packaging.test.ts`、`index.test.ts`——pipeline 本身原有嗰套測試，呢個任務冇改過。
- **`download.realNetwork.test.ts`、`provision.realNetwork.test.ts`、`ensureJava.realNetwork.test.ts`**——opt-in、對住 Adoptium 真伺服器而唔係 fakes 嘅證明。最近一次 run 解析到一個真 release（`jdk-25.0.4+7`，Windows x64），由 GitHub 真正嘅 release CDN 下載咗 **141,164,204 bytes**，驗證咗真嘅 SHA-256，用真嘅內置 `tar.exe` 解壓，再行個解壓出嚟嘅 `java` 確認佢報 `25.0.4`。設定行解釋入面引嗰個「大約 140 MB」，加埋 copy catalogue 嘅 `FACTS` pin 住嗰個數，就係呢個實測數字四捨五入——唔係靠估。

界面嗰邊：

- `packages/ui/src/components/settings/javaSetting.test.ts`——`canProvision` feature detection、consent 讀失敗當「未知」而唔係「已接受」、第一次撳下載時記錄 consent 而第二次唔會重覆記錄、訂閱同退訂 progress events、有一個下載在飛時拒絕開第二個、將 main process 嘅拒絕同 throw 出嚟嘅錯誤都報做 `provisionFailure` 而唔會吞咗任何一邊。
- `packages/ui/src/components/settings/JavaRuntimeRow.test.ts`——個掣、佢嘅解釋、進度條，同下載成功之後個行落到嘅「found」狀態。
- `packages/ui/src/copy/`——catalogue-coverage guard（render 咗嘅 `t(...)` key 冇 catalogue entry 就 fail），加 FACTS guard（voiced entry 喺五個 funny level 任何一個跌咗 pinned fact——個大小、「Adoptium」來源、「system-wide」、「administrator」——就 fail）。

本機執行嘅命令，見上面英文〈Verification〉尾嗰個 code block（`npx vitest run ...`，加 opt-in 嘅 `MBM_REAL_JDK_DOWNLOAD=1` 真網絡版本），兩邊完全一樣。

### 建議文章

- [Automatic dependency provisioning](./dependency-provisioning.md)——呢個 Java 下載跟嘅形狀，套用喺 Chunker 同經 winget/Chocolatey 裝嘅 `git`/`gh`/Docker Desktop/`rsync`，加埋嗰啲真係要手動裝嘅依賴。
- [Bedrock Edition worlds](./bedrock-worlds.md)——Chunker 跟一模一樣嘅形狀：一個起好晒、digest 驗證嘅下載 handler，本來冇掣叫佢，用同一方式收口。
- [The Minecraft licence and the consent that refers to it](./eula-and-consent.md)——「問一次、永遠記住」嗰個同意形狀，呢份文件自己個 consent 紀錄就係由佢起出嚟。
- [Running the engine on this computer, or in a container](./docker-and-local.md)——部機情願完全唔 provision 嘅話，攞到一個行得嘅 JVM 嘅另一條路。
- [Automatic repair when a render or the web server fails to start](./automatic-repair.md)——經過晒呢啲之後 render 仲係 fail 嘅話會發生嘅事。
