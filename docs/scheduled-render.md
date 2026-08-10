# Scheduled re-rendering: only when the world actually changed

**This is for a world that changes on its own** — a survival server people keep playing on,
a world a separate backup job refreshes on a timer — where somebody would otherwise have to
remember to press "Render on GitHub" again. `scheduled-render.yml` wakes up on a schedule,
checks cheaply whether the configured world has changed since the last render, and only
starts [`render-world.yml`](./render-in-actions.md) when it has. A world that has not
changed costs a few seconds of a check job and nothing more — it is never downloaded, let
alone rendered, just to learn that nothing happened.

<details>
<summary><b>Contents</b></summary>

- [What triggers a check, and what triggers a render](#what-triggers-a-check-and-what-triggers-a-render)
- [Configuring it](#configuring-it)
- [How "changed" is decided, per world-source](#how-changed-is-decided-per-world-source)
- [What it reports, and where](#what-it-reports-and-where)
- [Cost](#cost)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)

</details>

## What triggers a check, and what triggers a render

Two different things trigger here, and they are easy to conflate:

- **A check** runs whenever `scheduled-render.yml`'s job executes. GitHub's `schedule:`
  trigger cannot read a repository variable to decide its own cron — a cron expression is
  fixed the moment this file is written — so the workflow always wakes up **hourly**, the
  finest supported interval, and then asks a small pure function
  (`design/packages/render-actions/src/schedule/cadence.ts`'s `isCadenceDue`) whether the
  *configured* cadence says a check is actually due yet. Most hourly wake-ups, on a daily,
  weekly, or custom multi-hour configuration, do nothing beyond that question — no metadata is even
  fetched.
- **A render** — dispatching [`render-world.yml`](./render-in-actions.md), the workflow
  documented separately — only happens when a due check's comparison says the world
  **changed**. `workflow_dispatch` with `force-check: true` runs a check immediately,
  ignoring the cadence, for testing or for "I know it changed, check right now."

Nothing here replaces the desktop app's own CI-render sync
(`design/packages/app/src/main/cirender/sync.ts`), which uploads a world and drives a
render from a person pressing a button. This workflow is the unattended path: it never
uploads anything, and it dispatches a render exactly like a person would from the Actions
tab.

## Configuring it

The workflow reads its configuration from **repository variables**, not from editing this
file. Set them by hand with `gh variable set`, or from the desktop app's CI-render screen —
see [the app-side configuration surface](#the-app-side-configuration-surface) below.

| Variable | Meaning |
|---|---|
| `CIRENDER_SCHEDULE_ENABLED` | `"true"` to turn scheduled checking on at all. Anything else, including unset, means every hourly wake-up does nothing and says so in its run summary. |
| `CIRENDER_SCHEDULE_CADENCE` | A guided preset (`hourly`, `sixHourly`, `daily`, `weekly`) or a custom whole-hour interval encoded as `hours:N`, where `N` is 1–168. Never a cron expression — the app presents a bounded number field and both the main process and workflow validate it. |
| `CIRENDER_SCHEDULE_WORLD_SOURCE` | `repository`, `release-asset`, `url` or `git` — the same choices [`render-world.yml`](./render-in-actions.md) accepts. |
| `CIRENDER_SCHEDULE_WORLD` | Same meaning as `render-world.yml`'s `world` input, **with one narrowing**: for `release-asset`, this must be one exact asset name (optionally `tag/name`), never a glob. A cheap check has to name a single asset to watch for changes; a glob that could resolve to a different asset next time is not something "did it change" can answer. For `git`, this is a branch (optionally `branch:subpath`). |
| `CIRENDER_SCHEDULE_WORLD_REPOSITORY` | `release-asset` (blank means this repository) and `git` (always required — a git source always names one repository). |
| `CIRENDER_SCHEDULE_DIMENSION`, `_MAP_ID`, `_MAP_NAME`, `_OUTPUT`, `_BUDGET_MINUTES`, `_MAX_JOBS` | Carried straight through as the matching `render-world.yml` input when a render is actually dispatched. Each falls back to that workflow's own default when unset. |

### The app-side configuration surface

The desktop app's CI-render screen (`design/packages/ui/src/components/cirender/`) offers a
**Scheduled re-rendering** section once a sync's repository is known: a switch for
`CIRENDER_SCHEDULE_ENABLED`, a preset or a custom 1–168 hour interval — never a free-text
cron field — and a status line reading `CIRENDER_SCHEDULE_LAST_CHECK_AT`,
`_LAST_CHECK_RESULT` and `_LAST_RENDER_AT` back. It writes through the same two GitHub
credential routes (the application's own sign-in, or the `gh` command-line tool) the rest of
the CI-render feature already uses — see
`design/packages/app/src/main/cirender/schedule.ts` and its `readRepositoryVariable`/
`writeRepositoryVariable` additions to `CiTransport` in `transport.ts`. World-source and the
render inputs are derived from the sync's own project rather than typed a second time.

## How "changed" is decided, per world-source

Every comparison is pure and lives in
`design/packages/render-actions/src/schedule/changeCheck.ts`'s `evaluateScheduleChange`,
covered by its own unit tests. The workflow's job only *gathers* two snapshots — this
check's and the last recorded one — and hands them to that one function.

- **`repository`**: the world is already checked out by the time the job runs (the workflow
  begins with `actions/checkout@v4`), so this reuses **the exact same function**
  (`fingerprintWorld`, in `design/packages/render-actions/src/world/fingerprint.ts`) the
  desktop app already runs before every upload — not a second, hand-rolled comparison.
  Hashing an already-present tree costs one `readdir`/`stat` pass, not a download. See that
  file's own documentation for what the fingerprint can miss (a file restored to an
  identical size and modification time reads as unchanged; Minecraft does not do that in
  practice).
- **`release-asset`**: downloading the asset to hash its bytes would defeat the entire point
  of checking cheaply, so this trusts what GitHub already publishes about it **without
  fetching the asset itself** — its own `digest` field (`sha256:...`) when GitHub sent one,
  and its `size` plus `updated_at` otherwise. This is a real, stated narrowing: two uploads
  landing on the same byte count in the same second would be missed on the fallback path.
  Prefer a build that publishes a digest.
- **`url`**: a `HEAD` request's headers are all that is read — `ETag` first, then
  `Content-Length`/`Last-Modified` together as a fallback. A server that sends **none** of
  those three is reported as `unknown`, never guessed at in either direction: the workflow
  does not render (a false "nothing changed" every hour would be worse than admitting it
  cannot tell) and does not skip silently either — the reason says exactly why, every time,
  so it is visible rather than a check that quietly never triggers.
- **`git`**: a world kept in a git repository has the cheapest signal of the four — one
  `gh api` call for the target branch's current commit SHA, nothing cloned and nothing
  downloaded. Two SHAs either match or they do not; there is no fallback to reach for the
  way `release-asset` and `url` need one.

## What it reports, and where

Every check — due or not, changed or not — writes to its own run summary
(`$GITHUB_STEP_SUMMARY`). A due check additionally writes three repository variables so the
outcome survives past that one run and reaches the app:

- `CIRENDER_SCHEDULE_LAST_CHECK_AT` — set only when a check actually ran, never on an
  hourly wake-up that decided nothing was due yet.
- `CIRENDER_SCHEDULE_LAST_CHECK_RESULT` — `changed`, `unchanged`, `unknown` or `error`.
- `CIRENDER_SCHEDULE_LAST_CHECK_REASON` — the one sentence `evaluateScheduleChange` gave.
- `CIRENDER_SCHEDULE_LAST_BASELINE` — the snapshot just compared, kept as the baseline for
  next time. Left untouched on `error` (the world could not be found this time) and on
  `unknown`, so a transient failure never erases a working comparison point.
- `CIRENDER_SCHEDULE_LAST_RENDER_AT` — set only when a render was actually dispatched.

GitHub does not hand back a run id from a `workflow_dispatch` call, so this workflow cannot
link the render it started directly; the summary points at the Actions tab instead, the same
honest gap `main/cirender/sync.ts` already documents for a dispatch it cannot immediately
find.

## Cost

Checking is cheap **regardless of cadence** — every check reads a small amount of metadata
(or, for `repository`, hashes files already on disk) and nothing about that gets more
expensive the more often it runs. `describeCadenceCost` in
`design/packages/render-actions/src/schedule/cadence.ts` reports the one number this feature
can state honestly: exactly how many times a month a cadence wakes the check up (720 for
hourly, 120 for six-hourly, 30 for daily, 4 for weekly, or the computed count for a custom
whole-hour interval) — never a fabricated runner-minute
estimate, because a check job's real duration depends on the world's source and this project
does not invent numbers it has not measured.

What cadence actually controls is **staleness**, not runner-minute spend: how long a real
change can sit before it is noticed and rendered. The real cost lever is a **false**
"changed" — every detector above is built to avoid one, but the `release-asset` fallback and
the deliberately conservative `url` handling are exactly where a false positive (or a
missed one) could still occur, and both are documented above rather than hidden.

## Failure modes

- **`CIRENDER_SCHEDULE_ENABLED` unset or not `"true"`**: every hourly wake-up says so in its
  summary and does nothing else. Not a failure — the default state.
- **The configured world cannot be found** (a repository path that no longer exists, a
  deleted release asset, an unreachable URL): recorded as `error`, never as `changed`. A
  render dispatched against a world that is not there would just fail a few minutes later
  inside `render-world.yml`'s own fetch step; refusing here is cheaper and clearer.
- **A `url` source sends no comparable header**: recorded as `unknown` on every check,
  forever, until the world moves to a `release-asset` or `repository` source or the server
  starts sending `ETag`/`Content-Length`/`Last-Modified`. The summary and
  `CIRENDER_SCHEDULE_LAST_CHECK_REASON` say this plainly each time rather than only once.
- **Repository-variable writes fail** (a token without the needed permission — see below):
  the check step itself has already run and its result is visible in the run summary even
  when the follow-up `gh api` write is refused; only the *persisted* last-check state is
  affected, not the decision made this run.

## Security considerations

- Writing a repository variable needs more than the ephemeral `GITHUB_TOKEN` grants — GitHub
  does not expose a `variables:` permission to workflow tokens at all. This workflow resolves
  `secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN`, the same chain every
  other workflow in this project falls back through, and if none of the first two secrets is
  configured the variable-write calls fail (harmlessly — see Failure modes above) rather than
  the check itself failing.
- Nothing this workflow reads or writes is a secret. Repository variables are visible to
  anyone who can see the repository's settings, which is the right visibility for "when was
  this last checked" and "what does it compare" — no token, credential or private URL query
  string belongs in `CIRENDER_SCHEDULE_WORLD`.
- A `url` source's `HEAD` request follows the same `curl --retry` shape the rest of this
  project's fetches use; it is a plain unauthenticated request; nothing about the response is
  executed, only three headers are read as text.

## Verification

- `design/packages/render-actions/src/schedule/cadence.test.ts` — the cadence set, due/not-due
  at and around the boundary, and the cost description's exact arithmetic.
- `design/packages/render-actions/src/schedule/changeCheck.test.ts` — every comparison per
  world-source kind, including the `unknown` and `error` cases.
- `design/packages/render-actions/src/schedule/cli.test.ts` — the `fingerprint`,
  `schedule-due` and `schedule-check` CLI commands this workflow calls, including their
  `$GITHUB_OUTPUT` writes.
- `design/packages/render-actions/src/world/fingerprint.test.ts` — the reused fingerprint
  function itself, unchanged from what `main/cirender/sync.ts` already relied on.
- `.github/workflows/scheduled-render.yml` passes `actionlint` (including its `shellcheck`
  pass) locally as part of this feature's own checks.
- The app-side repository-variable read/write and the schedule configuration screen are
  covered in `design/packages/app/src/main/cirender/transport.test.ts`,
  `design/packages/app/src/main/cirender/schedule.test.ts` and
  `design/packages/ui/src/components/cirender/CiRenderScreen.test.ts`.

## 廣東話

排程重新渲染(Scheduled re-rendering):淨係喺個世界真係變咗嘅時候先郁。呢個功能係畀一個會自己變嘅世界用嘅——例如有人一直玩緊嘅生存伺服器,或者有另一個備份工序定時刷新嘅世界——否則就要有人記得再撳一次「Render on GitHub」。`scheduled-render.yml` 會按時間表醒返,平價噉檢查所配置嘅世界自上次渲染以嚟有冇變過,淨係喺有變嘅時候先啟動 `render-world.yml`(見 [render-in-actions.md](./render-in-actions.md))。一個冇變過嘅世界只係花幾秒鐘嘅檢查 job,冇其他成本——佢唔會被落載,更加唔會為咗知道「乜都冇發生」而被渲染。

### 咩嘢觸發檢查,咩嘢觸發渲染

兩樣嘢好容易撈亂:

- **檢查(check)**:每次 `scheduled-render.yml` 個 job 行嘅時候都會發生。GitHub 嘅 `schedule:` 觸發器冇辦法讀 repository variable 嚟決定自己嘅 cron——cron 表達式喺寫檔案嗰一刻已經固定——所以個 workflow 一定係**每小時**醒一次(支援嘅最細間隔),然後問一個細嘅純函數(`design/packages/render-actions/src/schedule/cadence.ts` 入面嘅 `isCadenceDue`)所*配置*嘅節奏係咪話而家真係到期要檢查。喺每日、每週或者自訂多個鐘頭嘅配置之下,大部分每小時嘅醒覺除咗問呢條問題之外乜都唔做——連 metadata 都唔會攞。
- **渲染(render)**——即係 dispatch `render-world.yml`——只會喺一次到期嘅檢查比較話個世界**變咗**先發生。用 `workflow_dispatch` 加 `force-check: true` 可以即刻行一次檢查,唔理節奏,用嚟測試,或者「我知佢變咗,而家即刻檢查」。

呢度冇任何嘢取代桌面應用程式自己嘅 CI-render sync(`design/packages/app/src/main/cirender/sync.ts`)——嗰個係有人撳掣上載世界、推動渲染。呢個 workflow 係無人值守嘅路徑:佢從來唔會上載任何嘢,而 dispatch 渲染嘅方式同一個人喺 Actions tab 做嘅一模一樣。

### 點樣配置

個 workflow 由 **repository variables** 讀配置,唔係靠改呢個檔案。可以用 `gh variable set` 手動設定,或者喺桌面應用程式嘅 CI-render 畫面設定(見下面)。各個變數嘅意思:

- `CIRENDER_SCHEDULE_ENABLED`——設做 `"true"` 先會開啟排程檢查。其他任何值(包括未設定)即係每次每小時醒覺都乜都唔做,並且會喺 run summary 講明。
- `CIRENDER_SCHEDULE_CADENCE`——一個引導式 preset(`hourly`、`sixHourly`、`daily`、`weekly`),或者用 `hours:N` 編碼嘅自訂整點間隔,`N` 係 1–168。永遠唔會係 cron 表達式——應用程式提供一個有界限嘅數字欄位,主進程同 workflow 兩邊都會驗證。
- `CIRENDER_SCHEDULE_WORLD_SOURCE`——`repository`、`release-asset`、`url` 或者 `git`,同 `render-world.yml` 接受嘅選擇一樣。
- `CIRENDER_SCHEDULE_WORLD`——意思同 `render-world.yml` 嘅 `world` input 一樣,**但有一個收窄**:`release-asset` 嘅話,呢度一定要係一個確切嘅 asset 名(可以係 `tag/name`),永遠唔可以係 glob。平價檢查一定要指名監察緊邊一個 asset;一個下次可能解析做另一個 asset 嘅 glob,「有冇變」係答唔到嘅。`git` 嘅話係一個 branch(可以係 `branch:subpath`)。
- `CIRENDER_SCHEDULE_WORLD_REPOSITORY`——`release-asset` 用(留空即係本 repository),`git` 一定要設(git 來源永遠指名一個 repository)。
- `CIRENDER_SCHEDULE_DIMENSION`、`_MAP_ID`、`_MAP_NAME`、`_OUTPUT`、`_BUDGET_MINUTES`、`_MAX_JOBS`——真係 dispatch 渲染嘅時候直接傳畀 `render-world.yml` 對應嘅 input。未設定嘅話,各自用返嗰個 workflow 自己嘅預設值。

#### 應用程式嗰邊嘅配置介面

桌面應用程式嘅 CI-render 畫面(`design/packages/ui/src/components/cirender/`)喺知道咗個 sync 嘅 repository 之後,會出一個 **Scheduled re-rendering** 區:一個開關對應 `CIRENDER_SCHEDULE_ENABLED`,一個 preset 或者 1–168 小時嘅自訂間隔——永遠冇自由文字 cron 欄位——仲有一行狀態,讀返 `CIRENDER_SCHEDULE_LAST_CHECK_AT`、`_LAST_CHECK_RESULT` 同 `_LAST_RENDER_AT`。佢經 CI-render 功能已經用開嗰兩條 GitHub 憑證路線(應用程式自己嘅登入,或者 `gh` 命令行工具)寫入——見 `design/packages/app/src/main/cirender/schedule.ts`,同埋 `transport.ts` 入面 `CiTransport` 加咗嘅 `readRepositoryVariable`/`writeRepositoryVariable`。World-source 同渲染 input 由個 sync 自己嘅 project 推導出嚟,唔使打多次。

### 每種 world-source 點樣判斷「變咗」

每個比較都係純函數,住喺 `design/packages/render-actions/src/schedule/changeCheck.ts` 嘅 `evaluateScheduleChange`,有自己嘅單元測試。個 workflow job 只係*收集*兩個快照——今次嘅同上次記錄嗰個——然後交畀嗰一個函數。

- **`repository`**:job 行嘅時候個世界已經 checkout 咗(workflow 一開始就係 `actions/checkout@v4`),所以呢度重用**一模一樣嘅函數**(`fingerprintWorld`,喺 `design/packages/render-actions/src/world/fingerprint.ts`)——即係桌面應用程式每次上載之前已經行嗰個,唔係第二套手寫嘅比較。Hash 一棵已經喺度嘅檔案樹只係一次 `readdir`/`stat`,唔使落載。個指紋會漏嘅情況見返嗰個檔案自己嘅文檔(一個檔案還原到一模一樣嘅大細同修改時間會讀做冇變;實際上 Minecraft 唔會噉做)。
- **`release-asset`**:落載個 asset 嚟 hash 佢啲 bytes 會完全違背平價檢查嘅目的,所以呢度信 GitHub 已經公佈嘅資料,**唔會攞個 asset 本身**——GitHub 有畀 `digest` 欄位(`sha256:...`)就用佢,冇就用 `size` 加 `updated_at` 做 fallback。呢個係一個真實、講明咗嘅收窄:兩次上載喺同一秒落喺同一個 byte 數,fallback 路徑會漏咗。最好用一個會發佈 digest 嘅 build。
- **`url`**:只讀一個 `HEAD` request 嘅 headers——先睇 `ETag`,再用 `Content-Length` 加 `Last-Modified` 一齊做 fallback。三樣都唔畀嘅伺服器會報做 `unknown`,永遠唔會兩邊亂估:個 workflow 唔會渲染(每個鐘一次假嘅「冇嘢變」比承認判斷唔到更差),亦唔會靜靜哋跳過——個 reason 每次都講明點解,等佢係睇得見嘅,而唔係一個靜靜哋永遠唔觸發嘅檢查。
- **`git`**:世界放喺 git repository 有四種來源入面最平嘅信號——一個 `gh api` call 攞目標 branch 而家嘅 commit SHA,唔使 clone,唔使落載。兩個 SHA 一係一樣一係唔一樣;唔使好似 `release-asset` 同 `url` 噉要 fallback。

### 佢報告啲乜,報喺邊度

每次檢查——無論到唔到期、有冇變——都會寫入自己嘅 run summary(`$GITHUB_STEP_SUMMARY`)。到期嘅檢查另外會寫幾個 repository variables,令個結果過咗嗰一次 run 都仲喺度,應用程式亦都讀到:

- `CIRENDER_SCHEDULE_LAST_CHECK_AT`——淨係真係行咗檢查先會設,每小時醒覺判定未到期嗰啲唔會設。
- `CIRENDER_SCHEDULE_LAST_CHECK_RESULT`——`changed`、`unchanged`、`unknown` 或者 `error`。
- `CIRENDER_SCHEDULE_LAST_CHECK_REASON`——`evaluateScheduleChange` 畀嗰一句。
- `CIRENDER_SCHEDULE_LAST_BASELINE`——啱啱比較完嘅快照,留做下次嘅基準。`error`(今次搵唔到個世界)同 `unknown` 嘅時候唔會掂佢,所以短暫故障永遠唔會抹走一個有效嘅比較點。
- `CIRENDER_SCHEDULE_LAST_RENDER_AT`——淨係真係 dispatch 咗渲染先會設。

GitHub 唔會由 `workflow_dispatch` call 交返個 run id,所以呢個 workflow 冇辦法直接連結佢啟動嗰個渲染;個 summary 會指去 Actions tab——同 `main/cirender/sync.ts` 已經記載、dispatch 完即刻搵唔返嗰個誠實缺口一樣。

### 成本

檢查係平嘅,**同節奏無關**——每次檢查讀少量 metadata(`repository` 就 hash 已經喺碟上面嘅檔案),行得密啲都唔會令佢貴啲。`design/packages/render-actions/src/schedule/cadence.ts` 嘅 `describeCadenceCost` 報告呢個功能唯一講得出口嘅數字:一個節奏一個月會叫醒個檢查幾多次(hourly 720、six-hourly 120、daily 30、weekly 4,自訂整點間隔就係計出嚟嗰個數)——永遠唔會作一個 runner-minute 估算,因為檢查 job 嘅真實時長取決於世界嘅來源,呢個 project 唔會發明未量度過嘅數字。

節奏真正控制嘅係**過時程度(staleness)**,唔係 runner-minute 開支:即係一個真實變化可以擺幾耐先被發現同渲染。真正嘅成本槓桿係一個**假**嘅「changed」——上面每個偵測器都係為咗避免佢而設,但 `release-asset` 嘅 fallback 同刻意保守嘅 `url` 處理,正正係假陽性(或者漏報)仲有可能出現嘅地方;兩者都寫明喺上面,冇收埋。

### 失敗模式

- **`CIRENDER_SCHEDULE_ENABLED` 未設定或者唔係 `"true"`**:每次每小時醒覺都會喺 summary 講明,然後乜都唔做。呢個唔係失敗——係預設狀態。
- **配置嘅世界搵唔到**(repository 路徑已經唔存在、release asset 剷咗、URL 連唔到):記錄做 `error`,永遠唔會係 `changed`。對住一個唔存在嘅世界 dispatch 渲染,只會幾分鐘之後喺 `render-world.yml` 自己嘅 fetch step 度衰;喺呢度拒絕又平又清楚。
- **`url` 來源冇任何可比較嘅 header**:每次檢查都記錄做 `unknown`,一路都係,直到個世界搬去 `release-asset` 或者 `repository` 來源,或者個伺服器開始畀 `ETag`/`Content-Length`/`Last-Modified`。Summary 同 `CIRENDER_SCHEDULE_LAST_CHECK_REASON` 每次都講到明,而唔係淨係講一次。
- **寫 repository variable 失敗**(token 冇所需權限——見下面):檢查 step 本身已經行完,個結果喺 run summary 度睇到,就算後續嘅 `gh api` 寫入被拒;受影響嘅只係*持久化*嘅 last-check 狀態,唔係今次 run 嘅決定。

### 安全考慮

- 寫 repository variable 需要嘅權限,多過短暫嘅 `GITHUB_TOKEN` 畀到嘅——GitHub 根本冇向 workflow token 開放 `variables:` 權限。呢個 workflow 解析 `secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN`,同呢個 project 其他 workflow 一樣嘅 fallback 鏈;如果頭兩個 secret 都冇配置,寫變數嘅 call 會失敗(無害——見上面失敗模式),而唔係個檢查本身失敗。
- 呢個 workflow 讀寫嘅嘢冇一樣係秘密。Repository variables 對睇到 repository settings 嘅人都可見,對「上次幾時檢查咗」同「比較緊乜」嚟講,呢個可見度啱啱好——token、憑證或者私人 URL query string 唔應該擺入 `CIRENDER_SCHEDULE_WORLD`。
- `url` 來源嘅 `HEAD` request 跟返呢個 project 其他 fetch 用開嘅 `curl --retry` 形狀;係一個普通嘅未認證 request;個 response 冇任何嘢會被執行,淨係三個 header 當文字讀。

### 驗證

- `design/packages/render-actions/src/schedule/cadence.test.ts`——節奏集合、界線前後嘅到期/未到期,同成本描述嘅精確算術。
- `design/packages/render-actions/src/schedule/changeCheck.test.ts`——每種 world-source 嘅比較,包括 `unknown` 同 `error` 情況。
- `design/packages/render-actions/src/schedule/cli.test.ts`——呢個 workflow 叫嘅 `fingerprint`、`schedule-due` 同 `schedule-check` CLI 命令,包括佢哋嘅 `$GITHUB_OUTPUT` 寫入。
- `design/packages/render-actions/src/world/fingerprint.test.ts`——被重用嘅指紋函數本身,同 `main/cirender/sync.ts` 一直依賴嗰個一模一樣,冇改過。
- `.github/workflows/scheduled-render.yml` 喺本地通過 `actionlint`(連埋佢嘅 `shellcheck` pass),係呢個功能自己嘅檢查一部分。
- 應用程式嗰邊嘅 repository-variable 讀寫同排程配置畫面,由 `design/packages/app/src/main/cirender/transport.test.ts`、`design/packages/app/src/main/cirender/schedule.test.ts` 同 `design/packages/ui/src/components/cirender/CiRenderScreen.test.ts` 覆蓋。
