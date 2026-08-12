# Adjusting a render's speed while it runs

## Behaviour

Every render already carries a novice 1-5 "Speed" dial, set before a render starts (see
[Running the engine on this computer, or in a container](./docker-and-local.md) for the raw
`core.conf` fields it writes). This feature adds a second dial, drawn beside a render that is
**already running**, on `RenderRunPanel.vue`. It is a different control answering a different
question, and it does not pretend otherwise.

**The one fact that decides everything here: a JVM's thread pool is sized once, at startup, and
nothing this application or upstream exposes can resize it afterwards.** `render-thread-count`
and `render-thread-priority` — the two raw values the pre-render dial writes — are read by
BlueMap's engine exactly once, to build a fixed pool of worker threads. There is no reload hook,
no signal, no config-watch. So the live control never touches either value. What it changes
instead is coarser and sits outside the JVM entirely: **this machine's own opinion of how much of
itself the render gets.**

### Local route: OS process priority

A local render is one process — the JVM itself, spawned with no shell and no launcher script in
between (`main/render/runner.ts`). The live dial calls `os.setPriority(pid, priority)` against
that exact process id, using Node's own cross-platform priority constants
(`main/runtime/speedControl.ts`):

| Level | `os.constants.priority` | Label |
|---|---|---|
| 1 | `PRIORITY_LOW` (19) | Low (background) |
| 2 | `PRIORITY_BELOW_NORMAL` (10) | Below normal |
| 3 | `PRIORITY_NORMAL` (0) | Normal — the render's ordinary, unprioritised behaviour |
| 4 | `PRIORITY_ABOVE_NORMAL` (-7) | Above normal |
| 5 | `PRIORITY_HIGH` (-14) | High |

This is real and immediate: `os.setPriority` reaches the live process the moment it is called,
and every level from 1 to 5 genuinely differs. **Level 5 deliberately never reaches
`PRIORITY_HIGHEST`** (Windows' `REALTIME_PRIORITY_CLASS`). Node's own documentation warns that an
unprivileged process asking for it is silently downgraded, and this application never asks for
administrator rights to raise it further — so the dial's own top rung is named after the level an
unprivileged process can actually hold, rather than a request that would quietly become a
different one while claiming to have landed. `applyLocalPriority` reads the priority back after
setting it and reports a `priority-refused` outcome, with the level the OS actually granted, when
Windows held the process at something lower than what was asked for.

### Docker route: the container's own CPU quota

A container render is different in one specific way (`main/runtime/process.ts`'s own header
comment): the process this application spawned is the `docker run` **client**, not the JVM inside
the container. The client's own OS priority is irrelevant — cancelling already asks the *daemon*,
by container name, for exactly this reason. So the live dial does the same thing: it asks the
daemon to change the running container's CPU quota, by name, with `docker update --cpus`.

| Level | `docker update --cpus` | Why |
|---|---|---|
| 1 | 25% of this machine's logical cores (never below half a core) | Genuine throttle |
| 2 | 50% of this machine's logical cores | Genuine throttle |
| 3, 4, 5 | `0` — Docker's own spelling for "no limit" | See below |

**Levels 3 through 5 all resolve to the same, unthrottled quota**, and this is not a limitation
this feature works around quietly — it is stated on the control itself. A container has never had
`--cpus` set on it before this feature existed, so its real starting condition already is "every
core the host has." Docker's CPU quota can only throttle a container **down** from that; there is
no equivalent of asking a container to run *above* its ordinary, unthrottled share — `--cpu-shares`
only matters when something else is contending for the same cores, and nothing else is, because
this application runs one render per container. Inventing a number past the host's own core count
to make level 5 look different from level 3 would be exactly the "control that moves and changes
nothing real" defect this feature exists to avoid. The dial says this in as many words rather than
leaving it a silent gap: *"Docker cannot give a container more than that, so levels 3 through 5 all
mean the same thing here."*

### GitHub Actions and remote-over-SSH: not adjustable from here

A render on GitHub's own runners has no lever this application can reach — the machine belongs to
GitHub, not to this app, full stop. The control shows **disabled**, with that exact reason named
beside it, rather than hidden or left clickable and inert (the project's guided-forms rule: a
disabled control always names its unmet condition). A render over SSH to a Docker host is a fourth
route this application has (`main/remote/orchestrator.ts`); `docker update --cpus` would work
there too in principle, one hop further away over the same SSH tunnel, but it is not wired yet.
The control says exactly that — not implemented for this route yet — rather than silently doing
nothing while looking active.

### What always stays deferred

No matter which route or which level, **the thread count and thread priority baked into this
render's own launch never move**. The panel says so beside every single outcome, in the same
breath as reporting what genuinely did change. A "Restart at this level" button is offered next to
that fact — never triggered automatically — which stops the current render, waits for it to
genuinely end, and starts a fresh one with the same maps and the chosen level's own
`render-thread-count` **and** `render-thread-priority` (`speedLevels.ts`'s own table, the same one
the pre-render dial writes). BlueMap's storage is incremental, so a restart loses no tile already
drawn; it only re-launches the JVM with both deferred values actually in the config this time.

### Live throughput

Dragging a level is worthless if nothing on screen shows it did anything. Beside the dial,
`RenderThroughput.vue` shows a live, real rate: percent of the whole render completed per minute,
over a short recent window (two minutes by default). This is deliberately **not** a tile, chunk or
region count — upstream's own progress line for a map or a region is a percentage only, and this
port has never had a count to show beside it (see `progress/progressModel.ts`'s own `notes`). The
rate is real and it is exactly as precise as the engine's own reporting allows, no more.

## Configuration

The live click is not a persisted setting. It is a one-off request against the render in flight,
answered by `main/render/orchestrator.ts`'s `adjustSpeed(renderId, level)` and reported back as a
structured fact — which route, whether it applied now, whether a restart is still needed, and the
main process's own sentence explaining why. The interface never guesses at that sentence; it reads
the structured fields and builds its own translated line from them, with the backend's exact words
shown alongside as a quote, the same way an engine failure's own message is always shown verbatim
elsewhere in this application.

The explicit restart is different because it creates a new render request. That request carries
both `renderThreadCount` and `renderThreadPriority` through the UI bridge, preload contract and main
orchestrator. Local and Docker config generation write those values as `render-thread-count` and
`render-thread-priority`; priority must be an integer from 1 through 10. The request/session shape
retains the values needed by that replacement render rather than trying to mutate the already
running JVM.

## Failure modes

- **The process already exited** between the click and the priority change reaching it (local
  route): reported as `process-exited`, applied nothing, and a restart is still the only way to
  change the deferred half.
- **The container already stopped** (Docker route): `docker update` refuses, reported as
  `container-stopped`, and nothing was applied.
- **Windows refused the raise** without administrator privileges: reported as `priority-refused`
  with the level actually granted, never silently accepted as though the higher level landed.
- **No render is running under that id**: reported as `not-running`, whether the id is stale or
  the render already ended.
- **An unsupported route** (GitHub Actions, remote-over-SSH today): the control is disabled before
  a click is even possible, naming the exact reason.
- **A broken bridge promise**: `renderRun.ts`'s `adjustSpeed` never lets a rejected promise become
  an unhandled rejection — it is turned into the same refusal shape any other outcome uses.
- **A stale packaged preload**: the UI's world-bridge resolver requires `adjustRenderSpeed`. A
  preload exposing the older shape is rejected as unavailable instead of presenting a live-speed
  button whose call can only fail later.
- **An invalid deferred priority**: config generation rejects non-integers and values outside
  1-10 before it writes a partial render configuration.

## Security considerations

The live adjustment reads or writes no config or session record. The local route changes only this
OS's bookkeeping about a live process id; the Docker route changes only the daemon's cgroup quota
for a live container name, addressed by the exact name this application itself gave it. Neither
can reach a process or container this application did not start. Only the explicit restart writes
a replacement render configuration, using the same bounded config path and request validation as
an ordinary pre-render launch.

## Verification

- `main/runtime/speedControl.test.ts` (22 tests): the priority table's own values against Node's
  real `os.constants.priority`, the monotonic climb from level 1 to 5, the deliberate stop short of
  `PRIORITY_HIGHEST`, the Docker CPU-quota fractions and their floor, the `docker update --cpus`
  command built exactly, and a refused priority raise reported honestly rather than silently
  accepted.
- `components/config/speedLevels.test.ts`: `matchThreadCount`'s coarser, thread-count-only
  question, distinguishing "automatic" (nobody set one), a matched level, and "custom" (an explicit
  count matching none of the five).
- `components/world/renderRun.test.ts`: `renderThreads` reflecting exactly what a request named
  (or `null` when it named nothing), `adjustSpeed` reaching the bridge with this render's real id
  and reporting the bridge's exact outcome unedited, a broken bridge promise turned into a refusal,
  and `restartWithLevel` genuinely cancelling first, waiting for the real end, then relaunching
  with the chosen level's thread count and thread priority.
- `packages/app/src/preload/liveSpeedBridge.test.ts`: loads the real preload entry, captures the
  object exposed through `contextBridge`, gives that exact object to the real UI resolver, and
  proves `adjustRenderSpeed` crosses the packaged preload seam rather than only an injected unit
  stub.
- `main/render/config.test.ts`: local and Docker config output contains both deferred fields, and
  an invalid `renderThreadPriority` is refused before output is accepted.
- `components/world/LiveSpeedControl.test.ts` (10 tests): every disabled route naming its own exact
  reason and refusing every click, an enabled route offering every level, the extremes stated in
  words, a click reaching the bridge with the right id and level, the live-versus-deferred outcome
  shown honestly for both an applied and a blocked result, and the restart offer appearing only
  after a click — never on its own.
- `components/progress/throughputModel.test.ts` (8 tests) and `RenderThroughput.test.ts` (3 tests):
  the windowed rate never reports before two samples exist far enough apart, never reports a
  negative rate when percent briefly moves backwards, drops samples that age out of the window, and
  the component's own reading genuinely re-renders as new samples arrive.

## Suggested articles

- [Running the engine on this computer, or in a container](./docker-and-local.md) for the
  pre-render novice dial this feature deliberately does not touch, and the raw `core.conf` fields
  it writes.
- [Render console](./render-console.md) for the live log this panel sits beside.
- [Renders that survive being interrupted](./resumable-renders.md) for why a restart loses no tile
  already drawn.
- [Rendering a world in GitHub Actions](./render-in-actions.md) for why that route has no lever
  this control can reach.
- [Rendering on a remote host](./remote-render.md) for the SSH-over-Docker route this control does
  not adjust yet, and why.

## 廣東話

### 行為（Behaviour）

每個 render 本身已經有一個新手向、1 至 5 嘅「Speed」dial，喺 render 開始之前set（佢寫嘅 raw `core.conf` 欄位見 [Running the engine on this computer, or in a container](./docker-and-local.md)）。呢個功能加多一個 dial，畫喺一個**行緊**嘅 render 隔籬，喺 `RenderRunPanel.vue` 上面。佢係一個唔同嘅控制項，答一條唔同嘅問題，而且冇扮唔係。

**決定晒成件事嘅一個事實：JVM 個 thread pool 係啟動嗰陣 size 一次，之後呢個應用程式同上游 expose 嘅任何嘢都改唔到佢。**`render-thread-count` 同 `render-thread-priority`——pre-render dial 寫嗰兩個 raw 值——BlueMap engine 只會讀一次，用嚟起一個固定嘅 worker thread pool。冇 reload hook、冇 signal、冇 config-watch。所以個 live 控制項永遠唔掂呢兩個值。佢改嘅嘢粗糙啲，而且完全喺 JVM 之外：**呢部機自己對「個 render 分到幾多」嘅取態。**

#### Local 路線：OS process priority

一個 local render 係一個 process——JVM 本身，中間冇 shell 冇 launcher script（`main/render/runner.ts`）。個 live dial 對住嗰個確切嘅 process id 叫 `os.setPriority(pid, priority)`，用 Node 自己嘅跨平台 priority 常數（`main/runtime/speedControl.ts`）。五級對應係：level 1 係 `PRIORITY_LOW`（19，「Low (background)」）；level 2 係 `PRIORITY_BELOW_NORMAL`（10）；level 3 係 `PRIORITY_NORMAL`（0）——即 render 平時冇加冇減嘅行為；level 4 係 `PRIORITY_ABOVE_NORMAL`（-7）；level 5 係 `PRIORITY_HIGH`（-14）。

呢下係真嘅、即時嘅：`os.setPriority` 一叫就到個活 process，而 1 至 5 每一級都真係有分別。**Level 5 刻意永遠唔去 `PRIORITY_HIGHEST`**（Windows 嘅 `REALTIME_PRIORITY_CLASS`）。Node 自己嘅文檔警告：一個冇特權嘅 process 要求佢會被靜靜降級，而呢個應用程式永遠唔會為咗再推高而問攞管理員權限——所以個 dial 嘅頂級係用「一個冇特權嘅 process 真係揸得住嘅級數」命名，而唔係一個會靜靜變成另一樣嘢、但聲稱成功咗嘅要求。`applyLocalPriority` set 完會讀返個 priority，Windows 將個 process 壓喺低過要求嘅級數嗰陣，會報一個 `priority-refused` 結果，連埋 OS 實際批咗邊一級。

#### Docker 路線：container 自己嘅 CPU quota

Container render 有一樣嘢明確唔同（`main/runtime/process.ts` 自己個 header comment）：呢個應用程式 spawn 嗰個 process 係 `docker run` 個 **client**，唔係 container 入面個 JVM。個 client 自己嘅 OS priority 無關痛癢——cancel 都係因為呢個原因先會用 container 名去問 *daemon*。所以個 live dial 照辦：佢用 `docker update --cpus`，以名叫 daemon 改個行緊嘅 container 嘅 CPU quota。

級數對應：level 1 係呢部機 logical cores 嘅 25%（永遠唔低過半個 core）——真嘅節流；level 2 係 50%——真嘅節流；level 3、4、5 全部係 `0`——Docker 對「冇限制」嘅串法。

**Level 3 至 5 全部解析做同一個、冇節流嘅 quota**，而呢樣嘢唔係呢個功能靜靜遮住嘅限制——係寫咗喺控制項上面嘅。呢個功能存在之前，container 從來冇被 set 過 `--cpus`，所以佢真正嘅起點已經係「host 有幾多個 core 就幾多個」。Docker 嘅 CPU quota 只可以由嗰度**向下**節流；冇任何等價方法叫一個 container 行*高過*佢平常冇節流嘅份額——`--cpu-shares` 只有喺有其他嘢爭同一批 core 嗰陣先有意義，而呢度冇其他嘢爭，因為呢個應用程式一個 container 行一個 render。為咗令 level 5 睇落同 level 3 唔同而作一個大過 host core 數嘅數字出嚟，正正就係呢個功能存在嚟避免嗰種「郁得但咩都冇改變」嘅缺陷。個 dial 直接咁講而唔係留一個無聲缺口：*「Docker cannot give a container more than that, so levels 3 through 5 all mean the same thing here.」*

#### GitHub Actions 同 remote-over-SSH：呢度較唔到

GitHub 自己嘅 runner 上嘅 render，呢個應用程式冇任何掂得到嘅槓桿——部機係 GitHub 嘅，唔係呢個 app 嘅，講完。個控制項會顯示**停用**，隔籬寫明正正呢個原因，而唔係收埋或者留返一個撳得但冇反應嘅嘢（project 嘅 guided-forms 規則：停用嘅控制項永遠要點名佢未滿足嘅條件）。經 SSH 去一個 Docker host 嘅 render 係呢個應用程式嘅第四條路線（`main/remote/orchestrator.ts`）；`docker update --cpus` 原則上喺嗰度都行得通，只係遠一跳、行同一條 SSH tunnel，但暫時未駁。個控制項就係咁講——呢條路線未實作——而唔係扮活躍但靜靜乜都唔做。

#### 永遠 defer 嘅嗰半

無論邊條路線邊一級，**呢個 render 啟動嗰陣焗入去嘅 thread count 同 thread priority 永遠唔郁**。個 panel 喺每一個結果隔籬都咁講，同報告「真係改咗乜」同一啖氣。嗰句事實隔籬有一個 **Restart at this level** 掣——永遠唔會自動觸發——佢停低現時個 render，等佢真正結束，再用同一批 maps 加所揀級數自己嘅 `render-thread-count` **同** `render-thread-priority`（`speedLevels.ts` 自己嗰張表，即 pre-render dial 寫嗰張）開一個新嘅。BlueMap 嘅 storage 係 incremental，所以 restart 唔會蝕任何已畫嘅 tile；佢只係重新啟動個 JVM，今次兩個 defer 咗嘅值真係喺 config 入面。

#### 即時吞吐量（Live throughput）

拉咗一級但畫面上乜都睇唔到佢做咗嘢，就等於白拉。個 dial 隔籬，`RenderThroughput.vue` 顯示一個活嘅、真嘅速率：最近一段短窗口（預設兩分鐘）入面，成個 render 每分鐘完成嘅百分比。呢個刻意**唔係** tile、chunk 或者 region count——上游自己對一幅 map 或者一個 region 嘅進度行純粹係百分比，呢個 port 由頭到尾都冇一個 count 可以擺喺隔籬（見 `progress/progressModel.ts` 自己嘅 `notes`）。個速率係真嘅，精確度同 engine 自己嘅匯報一樣，唔會多。

### 配置（Configuration）

Live 嗰下撳唔係一個持久化設定。佢係對飛行中嗰個 render 嘅一次性請求，由 `main/render/orchestrator.ts` 嘅 `adjustSpeed(renderId, level)` 應答，回報做一個結構化事實——邊條路線、有冇即時生效、係咪仲需要 restart，加 main process 自己解釋點解嗰句。介面永遠唔會估嗰句嘢：佢讀啲結構化欄位自己砌一句翻譯咗嘅嘢，backend 嘅原話用引文形式並排顯示，同呢個應用程式其他地方永遠原封顯示 engine 失敗訊息嘅做法一樣。

明確嘅 restart 唔同，因為佢建立一個新嘅 render request。嗰個 request 帶住 `renderThreadCount` 同 `renderThreadPriority` 行過 UI bridge、preload contract 同 main orchestrator。Local 同 Docker 嘅 config 生成會將呢啲值寫做 `render-thread-count` 同 `render-thread-priority`；priority 必須係 1 至 10 嘅整數。Request/session 個形狀係保留住替代 render 需要嘅值，而唔係嘗試去改一個行緊嘅 JVM。

### 失敗情況（Failure modes）

- **個 process 喺撳掣同 priority 改動到達之間已經退出**（local 路線）：報 `process-exited`，乜都冇 apply 到，而 restart 仍然係改 defer 嗰半嘅唯一方法。
- **個 container 已經停咗**（Docker 路線）：`docker update` 拒絕，報 `container-stopped`，乜都冇 apply 到。
- **Windows 冇管理員權限下拒絕調高**：報 `priority-refused`，連實際批出嗰級，永遠唔會靜靜當高嗰級成功咗。
- **嗰個 id 下面冇 render 行緊**：報 `not-running`，唔理個 id 係 stale 定個 render 已經完咗。
- **未支援嘅路線**（GitHub Actions、今日嘅 remote-over-SSH）：撳都未撳得到之前個控制項已經停用，寫明確切原因。
- **Bridge promise 爆咗**：`renderRun.ts` 嘅 `adjustSpeed` 永遠唔會畀一個 rejected promise 變成 unhandled rejection——佢會變成其他結果用嘅同一個拒絕形狀。
- **Stale 嘅 packaged preload**：UI 嘅 world-bridge resolver 要求有 `adjustRenderSpeed`。一個 expose 舊形狀嘅 preload 會被當成 unavailable 拒絕，而唔係擺一個遲早 call 失敗嘅 live-speed 掣出嚟。
- **無效嘅 deferred priority**：config 生成喺寫出半份 render 配置之前，就拒絕非整數同 1 至 10 以外嘅值。

### 保安考量（Security considerations）

Live 調整唔讀唔寫任何 config 或者 session 紀錄。Local 路線只改呢個 OS 對一個活 process id 嘅記帳；Docker 路線只改 daemon 對一個活 container 名嘅 cgroup quota，而個名係呢個應用程式自己改嘅嗰個。兩條路都掂唔到一個唔係呢個應用程式開嘅 process 或者 container。只有明確嘅 restart 先會寫一份替代 render 配置，用嘅係同普通 pre-render 啟動一樣嘅有界 config 路徑同 request 驗證。

### 驗證（Verification）

- `main/runtime/speedControl.test.ts`（22 個測試）：priority 表嘅值對住 Node 真嘅 `os.constants.priority`、由 level 1 到 5 單調上升、刻意停喺 `PRIORITY_HIGHEST` 之前、Docker CPU-quota 嘅分數同佢個下限、`docker update --cpus` 條命令砌到一絲不差，同一個被拒絕嘅調高係誠實咁報而唔係靜靜當接受咗。
- `components/config/speedLevels.test.ts`：`matchThreadCount` 嗰條粗啲、齋睇 thread-count 嘅問題，分清「automatic」（冇人set過）、match 到某一級，同「custom」（一個五級都唔 match 嘅明確數）。
- `components/world/renderRun.test.ts`：`renderThreads` 準確反映 request 講咗乜（乜都冇講就係 `null`）、`adjustSpeed` 帶住呢個 render 嘅真 id 去到 bridge 並且一字不改咁報 bridge 嘅結果、爆咗嘅 bridge promise 變成拒絕、`restartWithLevel` 真係先 cancel、等真正結束、再用所揀級數嘅 thread count 加 thread priority 重新啟動。
- `packages/app/src/preload/liveSpeedBridge.test.ts`：load 真嘅 preload entry，捕捉經 `contextBridge` expose 嗰個 object，將嗰個 object 原件交畀真嘅 UI resolver，證明 `adjustRenderSpeed` 係跨過 packaged preload 嗰條接縫，唔係齋靠 inject 落去嘅 unit stub。
- `main/render/config.test.ts`：local 同 Docker 嘅 config 輸出載齊兩個 deferred 欄位，無效嘅 `renderThreadPriority` 喺輸出被接受之前拒絕。
- `components/world/LiveSpeedControl.test.ts`（10 個測試）：每條停用路線寫明自己確切原因並拒絕每一下撳、啟用路線提供每一級、兩極用文字講明、一下撳帶住啱嘅 id 同 level 去到 bridge、applied 同 blocked 兩種結果嘅 live-對-deferred 都誠實顯示、restart 邀請只喺撳完之後出現——永遠唔會自己出。
- `components/progress/throughputModel.test.ts`（8 個測試）同 `RenderThroughput.test.ts`（3 個測試）：窗口化速率喺未有兩個相隔夠遠嘅樣本之前永遠唔報、百分比短暫倒退時永遠唔報負速率、樣本老出窗口就丟、component 自己個讀數隨新樣本真係 re-render。

### 建議文章

- [Running the engine on this computer, or in a container](./docker-and-local.md)——呢個功能刻意唔掂嗰個 pre-render 新手 dial，同佢寫嘅 raw `core.conf` 欄位。
- [Render console](./render-console.md)——呢個 panel 隔籬個 live log。
- [Renders that survive being interrupted](./resumable-renders.md)——點解 restart 唔會蝕任何已畫嘅 tile。
- [Rendering a world in GitHub Actions](./render-in-actions.md)——點解嗰條路線冇槓桿畀呢個控制項掂。
- [Rendering on a remote host](./remote-render.md)——呢個控制項暫時未調整嘅 SSH-over-Docker 路線，同點解。
