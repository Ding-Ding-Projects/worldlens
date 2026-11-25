# Update coming soon

Between a push to `main` and the moment the CI workflow publishes its release there is a window
of tens of minutes in which a newer build is on its way and the Updates section says nothing, or
says "up to date". **Update coming soon** fills that window. While a newer build is being made
but is not published yet, the Updates section of Settings shows the build number, every stage
with its own state, when it started and how long it has run (24-hour time), a labelled estimate
of what is left, and what the build will contain.

It is a description and nothing more. It never downloads, installs or restarts anything, and it
never changes the automatic-update choice. When the build is published the card steps aside and
the ordinary update offer takes over.

## Behaviour

### What the card shows

| Part | What it says | Where it comes from |
| --- | --- | --- |
| Build number | The version the build will publish as, such as `1.0.2401`. | The installed major and minor plus the workflow run number, which is exactly how the release version is made (`scripts/release-version.mjs`). |
| Stages | One row per stage with its state spelled as a word: waiting, running, done, failed or skipped. | The workflow's own jobs, in the order GitHub lists them, with the publishing job last. The first two rows, "Source received" and "Waiting for a build machine", are fixed and derived from the run itself. |
| Progress bar | "N of M stages done". | The count of stage rows that really are done. It moves only when a row does, never with the clock. |
| Started and running for | A 24-hour start time and a minutes-level elapsed time. | The run's own start time; the elapsed time is refreshed every twenty seconds as plain text. |
| Estimate | "About 20 min left", labelled as an estimate with the number of earlier builds it came from. | The median duration of up to ten recent successful runs, needing at least three. Past the usual time the card says it is taking longer, and shows no countdown. With too few earlier builds it says there is no estimate. |
| What it will contain | The first line of each commit message, newest first, up to thirty, then "and N more changes". | The compare of the installed version's release tag against the run's head commit. |

### Honest states

Each of these has its own wording and none of them shows invented progress.

- **Waiting its turn.** The run exists but no build machine has picked it up.
- **Stalled.** No stage has changed for over an hour. The card says the build looks stalled and may still finish.
- **Replaced.** A newer build took over from one that ended without publishing; the card names the older one.
- **Failed.** A build the app saw in flight ended without publishing. The card names the conclusion and the first failed stage, and says nothing was installed. It stays until a later build ships. A failed build the app never saw in flight is not announced.
- **Could not check.** Offline, rate limit used up (with the time it will look again), or an unexpected answer. These show no stage list and no counts. The card never carries the last good picture across a failed check as if it were current.
- **Absent.** With no build in flight there is no card at all, and a build that cannot update itself (a development build) never polls.

### Published

The moment the ordinary updater offers a version at least as new as the coming build, or the
installed version has caught up, the card is hidden. It does not trigger a check or a download;
the updater's own schedule finds the release and offers it through the normal banner and status
row.

### Reaching it

The card sits at the top of the Updates section in Settings. The command palette has an
**Update coming soon** row that opens Settings at that section. The card has one control, **Check
again**, which asks for a fresh look.

## Where the data comes from, and what it costs

The main process reads the repository's public workflow runs, unauthenticated, with no
credential, account or user data in any request:

1. `GET /repos/{repo}/actions/workflows/ci.yml/runs?branch=main&per_page=20`: one call that yields
   the run in flight, the recent successful runs for the estimate, and the verdict of a run that
   just finished.
2. `GET /repos/{repo}/actions/runs/{id}/jobs`: only while a run is in flight, for the stages.
3. `GET /repos/{repo}/compare/v{installed}...{head}`: once per pair, cached.

Every request has an eight second timeout and sends `If-None-Match`, so an unchanged answer is a
`304` that does not count against GitHub's hourly allowance. Polling is every 90 seconds after
launch at the earliest, then every 15 minutes, and every minute only while the Updates section is
open. When fewer than ten requests remain in the hour the fast cadence is dropped, and when the
allowance is spent the next look waits for the time GitHub gave. The hosted (container) build
refuses these channels along with the rest of the update channels.

## Security considerations

- Handlers answer only the application's own window (`isAppRendererSender`); any other sender gets an `unknown` state with the reason `refused`, never a rejection.
- Commit subjects are rendered as text, never as markup.
- Nothing reachable from the card can install, download or restart. The bridge exposes a read, a refresh and an "is the section open" flag.

## Verification

Local seams only. The main process watcher is tested with a fake fetch (stage mapping, queued,
none, published, failed, replaced, stalled, rate limit, offline, conditional requests, cadence,
the channel's sender check) in `main/update/comingSoon.test.ts`. The renderer model, the card, the
shared controller and the palette row are tested in `ui/components/update/comingSoonModel.test.ts`,
`ComingSoonCard.test.ts`, `useUpdatesComingSoon.test.ts` and
`ui/components/palette/paletteUpdateComingSoon.test.ts`.

Not yet verified: a real in-flight build watched in a packaged app from waiting through each
stage to published, and captures of the card in the built interface. The seams above are not that
evidence.

## 廣東話

**更新即將推出（Update coming soon）**：由推送到 `main` 到 CI 發佈 release 之間，通常有幾十分鐘，新版本其實製作緊，但「更新」部份乜都冇講，甚至講「已經係最新」。呢個功能就係填返呢個空檔。當有新版本製作緊但未發佈，設定入面嘅「更新」部份會顯示版本號、每個階段各自嘅狀態、幾點開始同已經行咗幾耐（24 小時制）、一個清楚標明係「估計」嘅剩餘時間，以及呢個版本會包含啲乜。

佢淨係描述，唔會下載、安裝或者重新開機，亦唔會改你揀嘅自動更新設定。版本發佈之後，呢張卡會自動讓位，由一般嘅更新提示接手。

### 顯示啲乜

- **版本號**：已安裝版本嘅主、次版本加上 workflow 嘅 run 編號，同 release 版本嘅計法一樣。
- **階段**：每個階段一行，狀態用文字寫出嚟（等緊、進行緊、完成、失敗、跳過），唔淨靠顏色。階段就係 workflow 真正有嘅 job。
- **進度條**：「N / M 個階段完成」，只數真正完成咗嘅階段，唔會跟時間自己郁。
- **開始同已行時間**：24 小時制，每二十秒更新一次。
- **估計**：用最近最多十次成功 build 嘅中位數，至少要三次先有；超過平時時間就講明「比平時長」，唔會顯示倒數。
- **會包含啲乜**：每個 commit 訊息嘅第一行，最新喺前，最多三十項，之後寫「仲有 N 項」。

### 老實嘅狀態

等緊輪到佢、似乎停咗（超過一個鐘冇階段變化）、被新版本取代、失敗（會寫明結果同第一個失敗嘅階段，並講明冇安裝任何嘢）、查唔到（離線、每小時次數用晒、或者回應唔似預期）。查唔到嘅時候唔會顯示階段或者數字，亦唔會將上一次嘅畫面當成而家嘅情況。冇版本製作緊嘅時候，成張卡都唔會出現。

### 資料嚟源同成本

主程序讀取呢個 repository 嘅公開 workflow 記錄，唔使登入，請求入面冇任何憑證、帳戶或者用戶資料。每個請求有八秒逾時，並用 `If-None-Match`，所以冇變嘅回應係 `304`，唔會食 GitHub 每小時嘅額度。啟動後最早九十秒先睇，之後每十五分鐘一次，淨係喺「更新」部份開住嘅時候先會每分鐘一次；剩返少過十次額度就會慢返落嚟，額度用晒就等到 GitHub 話嘅時間先再睇。

### 驗證

而家淨係有本地接縫嘅測試（假 fetch、元件、控制器、palette 行）。仲未驗證嘅係：喺打包好嘅 app 入面睇住一個真正製作緊嘅版本，由等緊一路行到發佈；以及喺已建成介面嘅真實截圖。以上測試唔可以當成嗰啲證據。

### 相關 (Related)

[Automatic updates](./automatic-updates.md) 係呢張卡退位之後接手嘅更新流程；[Command palette](./command-palette.md) 係「更新即將推出」嗰行所屬嘅地方；[Notification centre](./notification-centre.md) 係淨係通知嘅嘢該去嘅地方。
