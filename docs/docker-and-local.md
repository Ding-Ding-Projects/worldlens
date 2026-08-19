# Running the engine on this computer, or in a container

Rendering can run on this machine or in Docker, and the choice is the user's. The app's embedded
HTTP server serves completed maps; it does not promise a separate local `-w` web server.

- **Local** — the BlueMap engine runs as a program on this computer, on the Java runtime the
  app found or installed. This is the default and nothing needs to be installed for it beyond
  what the app already manages.
- **Docker** — the same engine, the same jar and the same arguments, inside a container.
  Opt-in, and only offered when Docker is genuinely usable.

Everything the local path reports, the Docker path reports identically: phases, per-map
progress with an estimate, every log line, every warning banner, the outcome, and
cancellation. That is not a promise kept by writing the same code twice — both modes produce
the same `EngineLaunch` and are run by the same `EngineProcess`, which reads output through
the same parser, so there is no second path for the reporting to differ on.

## What Docker changes, and what it does not

| | Local | Docker |
|---|---|---|
| Isolation from the rest of the computer | none beyond the account's own | the container sees the world (read-only), the output folder, the config and the jar, and nothing else |
| Java version | whatever the app found or installed | whatever the image ships, independent of this computer |
| Needs a JDK on this machine | yes | no |
| Speed | the machine's | the same machine, usually **slower** |
| Needs a daemon running | no | yes |

**Docker does not give a render more CPU, more memory or a faster disk.** It runs on the same
hardware. On Windows and macOS it runs inside a Linux virtual machine and reaches the world
folder through a file-sharing layer, which for a large world is measurably slower than reading
it directly. Anyone choosing Docker for speed has chosen it for the one thing it cannot do.

What it is genuinely good for: rendering on a machine with no Java, rendering on a Java version
this computer does not have, and keeping the engine away from everything on the disk that is
not a map.

## Detecting Docker, and saying which state it is in

"Docker is not available" is the sentence that sends somebody to download software they already
have. So the probe — `docker version --format {{json .}}`, which answers for the client and the
daemon at once — resolves to one of five states, each with its own sentence:

| State | What it means | What the app says |
|---|---|---|
| `available` | a container can be started now | *Docker 27.4.0 is installed and its daemon (27.4.0) is running.* |
| `daemon-unreachable` | the command is there, the engine behind it is not | *Docker 27.4.0 is installed, but its daemon is not running. Start Docker and try again.* |
| `refused` | the daemon is there, this account may not talk to it | *Docker 27.4.0 is installed, but this account is not allowed to talk to its daemon.* |
| `not-installed` | there is no `docker` on this account's `PATH` | *There is no 'docker' command on this account's PATH… Rendering locally does not need it.* |
| `unusable` | it ran and said something unrecognised | Docker's own words, quoted, rather than a guess |

Both Windows and Linux wordings for an unreachable daemon are recognised
(`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` and
`Cannot connect to the Docker daemon at unix:///var/run/docker.sock`), because matching only
one of them tells half of all users their installation is broken.

Nothing is cached. Docker Desktop is started and stopped while an app is open, and an answer
kept from launch is wrong exactly when somebody has just started Docker and pressed the button
again.

## What gets mounted

Only what a run needs:

```
<workspace>/config-container  ->  /bluemap/config   read-write
<workspace>/data             ->  /bluemap/data     read-write
<workspace>/web              ->  /bluemap/web      read-write
<the engine jar>             ->  /bluemap/cli.jar  read-only
<each world>                 ->  /worlds/<mapId>   read-only
```

**The world is always read-only.** A render reads chunks and writes tiles; nothing about it
should be able to write into somebody's save. Read-only is the difference between an engine bug
corrupting a region file and an engine bug producing an error message.

**A home directory is never mounted, and neither is anything containing one.** A folder picker
is one click away from `C:\Users\you` instead of `C:\Users\you\…\saves\world`, and mounting the
first would hand a container the whole profile — documents, browser data, keys. Drive roots,
filesystem roots, bare file-server shares and the well-known system folders are refused the same
way. A refusal is reported, not silently dropped: a quietly missing mount produces a container
that starts, renders nothing, and reports a missing world.

The jar is mounted rather than baked into an image, so "which engine rendered this map" stays a
question about the jar's own version rather than about a container tag, and the image is
interchangeable. The default image is a stock `eclipse-temurin:25-jre`.

### Paths inside the file are not paths on this computer

A container cannot use the config a local run uses: `C:\Users\me\saves\world` does not exist
inside it. So a containerised run writes a **second config folder**, on this machine, whose
contents name container paths (`/worlds/overworld`, `/bluemap/web`), and mounts that at
`/bluemap/config`. Directories are created only for a local run, where the engine's paths really
are this machine's — creating `/bluemap/web/maps` on a Windows host silently produces
`C:\bluemap\web\maps`, and a render then reports an empty output folder nobody can find.

## Serving a rendered map (and the local web server that does not run)

The completed render is served through `LocalMapHandler` on the app's embedded HTTP server at
`/local/{renderId}/...` for both local and Docker execution. The old local `WebServer` class
started upstream with `-w` and waited for a TCP connection before reporting a URL, but no
production path ever called it. It is removed with its tests and runtime export; see D21 in
`design/docs/decisions.md`.

The launch-planning types for `RuntimeRole: "web-server"` remain because remote hosting over SSH
still uses that separate plan. They do not create a local promise or a local reachable route.
If a future feature genuinely needs upstream's live web server, it must add a real owner,
lifetime, UI/IPC route, restart/repair contract and port-readiness evidence first.

The separate remote-hosting plan binds `0.0.0.0:<containerPort>` inside its container and
publishes it with `-p 127.0.0.1:<hostPort>:<containerPort>`. That plan is not a local serving
route and does not change the embedded static-map path described above.

Binding `0.0.0.0` inside a container is not a wider exposure than binding loopback locally,
because the publish rule is what decides who can reach it, and it publishes to this machine's
loopback only. Binding `127.0.0.1` *inside* the container would be the container's own loopback
— unreachable from the host even with the port published, which is the most common way a
containerised server "starts fine" and answers nothing.

**For that separate remote plan, a URL is only reported after it has been connected to.** Upstream logs `Starting webserver …`
before it binds and reports a bind failure afterwards, so neither the log line nor a
still-running process is evidence. The app opens a TCP connection to the address a person would
type, from this machine, and reports the URL only once that succeeds. The three other outcomes —
the process exited first, the port never answered, there was no port to publish — are reported
as themselves, with the engine's own exit code and last words.

## Cancelling

Locally, cancellation is SIGINT to the JVM with an escalation to SIGKILL, exactly as a render
has always been cancelled.

In a container it is different in a way that matters: **killing the `docker run` client does not
stop the container.** The daemon owns the container's lifetime and the client is a viewer
attached to it, so a killed client leaves a detached JVM rendering into somebody's disk with
nothing holding a handle to it. Cancellation therefore asks the daemon — `docker stop --time 8
<name>` — and the container is started with `--init` so that the daemon's SIGTERM actually
reaches the JVM rather than being ignored by a process that happens to be PID 1. The client is
then given the same polite signal and the same escalation, so an unresponsive daemon still ends
with this process letting go rather than waiting forever.

Every container is named, because a name is what `docker stop` and a person reading `docker ps`
both use, and an unnamed container can only be stopped by finding the id of a process the app has
already lost track of. `--rm` removes it when it ends.

## Picking a container back up after the app closes

The same fact as cancellation, taken one step further. If killing the client does not stop the
container, then **closing the app does not stop it either** — and unlike a cancel, nobody asked for
it to stop. The render carries on: tiles keep landing in the bind-mounted output folder, progress
lines keep being written to a log nobody is reading, and the app that comes back has no idea any of
it is happening. `render/runner.ts` refuses to put a shell between itself and the JVM precisely to
avoid an orphan like this; Docker re-creates it by a different route, and there is no way to refuse.

What is missing is never the work — the work is fine, it is still running — it is the **name**. So
the name is written down before the container starts, beside the render it belongs to:

```
<storageDir>/<renderId>/
  render.json      which engine rendered this, and how it ended
  session.json     what is running right now, and how far it got
  container.json   which container is doing it, and where its output goes
```

`container.json` is written *before* `docker run`, because the window between the two is exactly the
window in which the app being killed leaves a container nothing can name. It is removed on every way
out of a run, so a note left behind never offers to reattach to something that has already ended,
and it carries which app instance owns it — a fresh value on every launch, so a note owned by any
other value is by construction one whose app is gone. That is the same test `session.json` uses and
for the same reason: process ids are reused, and a stale one that happens to match something
unrelated would make a dead render look alive forever.

On launch, and whenever asked, each name is put to the daemon. Three answers, three things to do:

| The daemon says | What happens | What you are told |
|---|---|---|
| `running` (or `paused`, `restarting`, `created`) | **reattach**: `docker logs --follow --tail all` is streamed and reported as a live render | *…is still going in container 'x' on this computer: the app closed, the daemon carried on. Picking it up rather than starting a second one beside it.* |
| `exited` | **collect**: the output is a bind mount, so it is already on disk. The exit code is named | *…finished while the app was closed (exit code 137). The tiles it wrote are still where it wrote them…* |
| no such object | **collect**, honestly. `--rm` removed it the moment it ended | *…it is removed the moment it ends, which is what `--rm` does, and its exit status went with it… run the render again if you need that confirmed. It will only redo what is missing.* |
| nothing — the daemon is down, or there is no `docker` | **neither.** Nothing collected, nothing discarded, the note kept | *…could not say what became of container 'x'… may well still be going… Try again once that machine answers.* |

**A daemon that is down is never read as a container that is gone.** "The container has ended" means
collect the output and finish; "the machine that knows about the container did not answer" means the
render may well still be going. Reporting the second as the first writes off a running render, so an
unrecognised failure is `unknown` and says so.

Three things worth being exact about:

- **Reattaching is a launch, not a second reporting path.** `docker logs --follow` becomes an
  ordinary `EngineLaunch`, so the same `EngineProcess`, the same `RenderOutputTracker`, the same
  phase and progress parsing and the same cancellation apply. A reattached render emits the same
  `RenderEvent` union as any other: same list, same bar, same cancel button. A second reporting path
  would mean a render one half of the interface could see and the other could not stop.
- **`--tail all` replays the log from its first line**, so a render the app missed two hours of
  arrives at the real percentage rather than resuming with a bar at zero and no map names.
- **`docker logs` cannot say whether the render succeeded.** Its exit code is the *client's*, and it
  returns 0 both when a render finished and when it died. So a reattached run is judged by whether
  the engine printed `Your maps are now all up-to-date!`, and a log that ended without it is a
  failure rather than a success.

The cost of `--rm` is paid exactly here, and it is a real cost: a container that finished while the
app was closed has been removed, taking its logs and its exit status with it. Its **output** is
safe, because the output folder is a bind mount rather than anything inside the container. What is
not recoverable is the answer to "did it finish?", and the app says that in a sentence rather than
showing a green tick it cannot justify.

**Offered, never done.** Silently restarting hours of rendering because somebody reopened an app is
not a favour, and silently discarding the record throws away the only evidence the work exists. The
interface asks, and a declined offer is recorded so it is made once rather than on every launch.

### What genuinely cannot be picked up

| Situation | What the app says |
|---|---|
| the output folder was deleted, or the map storage directory changed | *…is not there, so there is nothing of this render left to pick up… Rendering it again is the only way forward, and it will start from nothing.* |
| the container was removed | its output is collected; its exit status is stated as unknowable |
| the daemon did not answer | nothing is collected and **nothing is discarded**; the note is kept, because it is the only evidence a still-running render exists |
| a container named like this app's, with no record beside it | reported and never stopped automatically: without the record there is no way to know which render it belongs to or where its output was going |

A collection that finds nothing is reported as a **failure**, not a quiet success. The one thing
worse than losing a render is telling somebody it is on their disk when it is not.

## Failure modes

| What happens | What the app does |
|---|---|
| Docker is not installed | Docker is offered as unavailable with that reason; local still works |
| Docker's daemon is not running | the same, with the *different* sentence, and no suggestion to install anything |
| This account may not use the daemon | reported as a permission problem, not as a missing daemon |
| A world folder may not be mounted | the launch is refused with the reason, before anything starts |
| The image cannot be pulled | the run fails with Docker's own words; the automatic repair recognises it |
| The container is killed for using too much memory | exit 137, which the repair pass reads as an out-of-memory kill even though the JVM printed nothing |
| The web server never answers | the URL is not reported, and the reason says whether it exited or simply stayed quiet |
| `docker stop` fails during a cancel | the cancel still completes; this process never waits on a daemon that has gone |
| The app is closed while a container renders | the container carries on, and the next launch offers to pick it up by name rather than starting a second one |
| The container ended while the app was closed | its output is collected; its exit status is stated as gone, never guessed at |
| The daemon is down when the app looks for containers | nothing is collected and nothing is discarded; the note is kept and the offer is made again later |

## Security considerations

- Container mounts are the enumerated five and nothing else. There is no way to add one from the
  interface, and the refusals in `checkMountSource` are applied to every source, including the
  config and output folders.
- The world is read-only in every run.
- A published port is bound to a host address (loopback by default), never to every interface.
  `-p 8100:8100` on a laptop in a café would put somebody's world map on the local network.
- No shell is used anywhere on the launch path. Every argument is passed as its own argv element,
  so a world folder called `my world & something` is a folder name rather than a second command.
- Containers run with `--rm`, and with `--user` where the caller supplies one — on Linux a
  container writing as root leaves root-owned tiles in a folder the person's own account then
  cannot delete.

## Verification

`design/packages/app/src/main/runtime/` carries focused runtime coverage, none of which needs Docker installed:

- `docker.test.ts` — every state of the probe, including both platforms' wordings for an
  unreachable daemon, a permission refusal, output that is not the JSON it asked for, and a
  binary that is not there.
- `mounts.test.ts` — the home folder, a folder containing home, drive and filesystem roots,
  system folders, a bare UNC server, a relative path, a colon that would truncate a mount
  argument, and the ordinary world folder that must still be allowed.
- `plan.test.ts` — the exact mount list, which mounts are read-only, the arguments inside the
  container, `--init`, the publish rule, and the refusal to plan a launch that would mount a home
  folder.
- `process.test.ts` — that a local run and a containerised one produce **identical** signal
  streams from the same output, that cancellation asks the daemon for a container and does not
  for a local run, and that a failed stop never leaves the caller waiting.
- `config.test.ts` — container paths written into the files while the files are written here, and
  that the engine's own directories are never created on this machine.
- `handoff.test.ts` — a record round-trips everything a reattach needs; a truncated, version-bumped
  or name-less one reads as **absent** rather than as a guess; a remote record whose host will not
  parse is refused rather than degraded to a local one, so `docker stop` is never sent to this
  computer with a name only another machine has; ownership is taken when a record is picked up, so a
  second reattach cannot claim it; and a note that cannot be written never fails the render.
- `attach.test.ts` — the status and the exit code are asked for in **one** call, so they describe
  one moment; `--tail all`; every state of the inspection, including a daemon that is down never
  reading as a container that is gone; and the sentence each decision produces.
- `reattach.test.ts` — **a container still running when the app starts**, reported on the same
  events with the same percentage; **one that finished while it was away**, whose output is
  collected rather than thrown away; **one the daemon no longer has**, said plainly; **a cancel that
  reaches a reattached container**, asking the daemon and reporting cancellation rather than a
  failure; a log that ended without the engine finishing reported as a failure; a collection that
  found nothing reported as a failure; a daemon that went quiet leaving the record intact; and a
  container with no record named rather than stopped.
- `ipc.test.ts` — the channels, the honest per-mode availability, that no handler rejects, and that
  a build with no reattacher still answers the container channels rather than not having them.

## Suggested articles

- [Automatic dependency provisioning](./dependency-provisioning.md) — the Download Java button that
  gets a machine with no JVM ready for the local route this article describes, without needing
  Docker at all.
- [Automatic repair when a render or hosting operation fails](./automatic-repair.md) — what
  happens next when one of these runs does not start.
- [Renders that survive being interrupted](./resumable-renders.md) — what a cancelled or crashed
  render leaves behind, and how the next one resumes.
- [Rendering on a remote host](./remote-render.md) — the same container problem over SSH, plus a
  world upload that can be interrupted and carried on.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — the other place the engine runs
  somewhere that is not this computer.

## 廣東話

### 喺呢部電腦行引擎，定係喺 container 入面行

算圖同地圖 web server 各自有兩種行法，揀邊種係用家決定：

- **Local** — BlueMap 引擎當一個普通程式喺呢部電腦度行，用 app 搵到或者裝咗嗰個 Java runtime。呢個係預設，除咗 app 本身已經管住嗰啲之外乜都唔使裝。
- **Docker** — 一模一樣嘅引擎、一模一樣嘅 jar、一模一樣嘅參數，不過喺 container 入面行。要自己 opt-in，而且淨係喺 Docker 真係用得嗰陣先會提供。

Local 路線報乜，Docker 路線就一模一樣噉報乜：階段、逐張地圖嘅進度連估算、每一行 log、每一個警告 banner、結果，同埋取消。呢個唔係靠寫兩次同樣嘅碼嚟兌現嘅承諾 — 兩種模式都係產生同一個 `EngineLaunch`，由同一個 `EngineProcess` 行，經同一個 parser 讀輸出，所以根本冇第二條路畀個回報去行差。

### Docker 改變咗乜，冇改變乜

對比落嚟：隔離方面，local 除咗個帳戶本身之外冇任何隔離，Docker 就淨係見到世界（唯讀）、輸出資料夾、config 同個 jar，其他乜都見唔到。Java 版本方面，local 係 app 搵到或者裝咗嗰個，Docker 就係個 image 出貨嗰個，同呢部電腦無關。本機要唔要有 JDK：local 要，Docker 唔使。速度：兩者都係同一部機，而 Docker 通常仲**慢啲**。要唔要有 daemon 行緊：local 唔使，Docker 要。

**Docker 唔會令一次 render 攞多啲 CPU、多啲記憶體或者快啲嘅磁碟。** 佢行喺同一套硬件上面。喺 Windows 同 macOS 佢係喺一個 Linux 虛擬機入面行，經一層檔案分享去掂個世界資料夾，對住一個大世界嚟講，明顯慢過直接讀。邊個為咗速度而揀 Docker，就係為咗佢唯一做唔到嗰樣嘢而揀咗佢。

佢真正好用嘅地方：喺冇 Java 嘅機上面 render、用一個呢部電腦冇嘅 Java 版本 render，同埋將引擎隔離開磁碟上面所有唔係地圖嘅嘢。

### 偵測 Docker，並且講清楚佢處於邊個狀態

「Docker is not available」呢句嘢會令人走去下載一啲佢已經有嘅軟件。所以個探測 — `docker version --format {{json .}}`，一次過答埋 client 同 daemon — 會解析成五個狀態之一，每個有自己一句說話。`available` 即係而家可以開 container，會講 Docker 版本已裝而 daemon 亦行緊。`daemon-unreachable` 即係個指令喺度但後面個引擎唔喺度，會叫你開返 Docker 再試。`refused` 即係 daemon 喺度但呢個帳戶冇資格同佢傾偈。`not-installed` 即係呢個帳戶嘅 `PATH` 上面根本冇 `docker`，同時會講明本機 render 唔需要佢。`unusable` 即係佢行到但講咗啲認唔到嘅嘢，呢個情況會照引 Docker 自己講嗰句，唔會亂估。

Windows 同 Linux 兩邊講「daemon 掂唔到」嘅寫法都認得（`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` 同 `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`），因為淨係認一邊，就等於話畀一半用家聽佢個安裝壞咗。

乜都唔會 cache。Docker Desktop 喺個 app 開住嗰陣可以開開停停，而由啟動時留低嘅答案，恰恰喺有人啱啱開咗 Docker 再撳粒掣嗰刻係錯嘅。

### 會 mount 啲乜

淨係 mount 一次 run 需要嘅嘢：

```
<workspace>/config-container  ->  /bluemap/config   read-write
<workspace>/data             ->  /bluemap/data     read-write
<workspace>/web              ->  /bluemap/web      read-write
<the engine jar>             ->  /bluemap/cli.jar  read-only
<each world>                 ->  /worlds/<mapId>   read-only
```

**個世界永遠都係唯讀。** 一次 render 讀 chunk、寫 tile；佢任何部分都唔應該有能力寫入人哋個存檔。唯讀就係「引擎 bug 整爛咗一個 region 檔」同「引擎 bug 出咗個錯誤訊息」之間嘅分別。

**永遠唔會 mount 家目錄，亦唔會 mount 任何包住家目錄嘅嘢。** 一個資料夾選擇器，撳錯一下就由 `C:\Users\you\…\saves\world` 變成 `C:\Users\you`，而 mount 咗前者就等於將成個 profile — 文件、瀏覽器資料、金鑰 — 交畀個 container。磁碟根目錄、檔案系統根目錄、淨係一個檔案伺服器分享，同埋啲眾所周知嘅系統資料夾，一律照樣拒絕。拒絕會報出嚟，唔會靜靜雞丟咗佢：一個靜靜雞唔見咗嘅 mount，會整出一個開得到、乜都 render 唔到、然後報世界唔見咗嘅 container。

個 jar 係 mount 入去而唔係焗入 image 入面，噉「呢張地圖係邊個引擎 render」就仍然係一個關於個 jar 自己版本嘅問題，而唔係關於一個 container tag，而個 image 亦可以互換。預設 image 係現成嘅 `eclipse-temurin:25-jre`。

#### 檔案入面嘅路徑唔係呢部電腦嘅路徑

Container 用唔到本機 run 嗰份 config：`C:\Users\me\saves\world` 喺入面根本唔存在。所以 containerised 嘅 run 會喺呢部機度寫**第二個 config 資料夾**，入面啲內容寫嘅係 container 路徑（`/worlds/overworld`、`/bluemap/web`），然後將佢 mount 去 `/bluemap/config`。目錄淨係喺本機 run 嗰陣先會建立，因為嗰陣引擎啲路徑真係呢部機嘅路徑 — 喺 Windows 主機上面整 `/bluemap/web/maps` 會靜靜雞整咗個 `C:\bluemap\web\maps` 出嚟，然後次 render 就會報一個冇人搵得返嘅空輸出資料夾。

### Serving a rendered map（同埋唔會行嘅本機 web server）

完成咗嘅 render 由 app 自己個 embedded HTTP server 經 `LocalMapHandler` 喺
`/local/{renderId}/...` 提供，local 同 Docker 都係同一條路。本機嗰個 `WebServer` class
以前用 `-w` 開多次 upstream engine，等 TCP 連線成功先報 URL，但由頭到尾冇 production
path 真係叫過佢；而家連 class、test 同 runtime export 都移除，詳情見
`design/docs/decisions.md` 嘅 D21。Remote hosting 嘅 `role: "web-server"` 係另一條 SSH
計劃，唔係本機 route，亦唔會製造本機 promise。將來真係要 live web server，就要先有
真正 owner、lifetime、UI/IPC、restart/repair 同 port-ready 證據。

喺 container 入面綁 `0.0.0.0` 唔會比本機綁 loopback 暴露得更廣，因為決定邊個掂到佢嘅係嗰條 publish 規則，而佢淨係發佈去呢部機嘅 loopback。反而喺 container *入面*綁 `127.0.0.1` 係綁咗 container 自己嗰個 loopback — 就算個 port 發佈咗，喺 host 都掂唔到，而呢個正正係一個 containerised server 「明明開得好地地」但乜都唔應嘅最常見原因。

Remote hosting 先會有 web-server URL；本機 static serving 唔會起第二個 JVM、唔會守第二個
port，亦冇 local URL readiness promise。Remote 路線仍然要等真正 TCP 連線成功先報 URL，
唔可以淨係信 `Starting webserver …` 嗰行 log 或者一個仲行緊嘅 process。

### 取消

喺本機，取消就係向個 JVM 送 SIGINT，唔應就升級去 SIGKILL，同一直以嚟取消 render 嘅做法一樣。

喺 container 入面就有個好緊要嘅分別：**殺咗 `docker run` 個 client 唔會停到個 container。** Container 嘅生命週期係 daemon 話事，個 client 淨係一個 attach 上去嘅觀眾，所以殺咗 client 之後，會剩返一個脫咗鈎嘅 JVM 繼續 render 落人哋個磁碟，而冇任何嘢揸住佢個 handle。所以取消係要拜託個 daemon — `docker stop --time 8 <name>` — 而個 container 開嗰陣加咗 `--init`，等 daemon 個 SIGTERM 真係去到個 JVM，而唔係畀一個啱啱做咗 PID 1 嘅 process 無視咗。跟住個 client 亦會收到同樣嘅禮貌訊號同同樣嘅升級，所以就算個 daemon 唔應，最後都係呢個 process 放手，唔會等到天荒地老。

每個 container 都有名，因為 `docker stop` 同一個睇緊 `docker ps` 嘅人用嘅都係個名，而一個冇名嘅 container 就淨係可以靠搵返一個 app 已經跟丟咗嘅 process id 先停到。`--rm` 會喺佢完結嗰陣移除佢。

### App 閂咗之後點樣接返個 container

同取消嗰件事一樣，再推多一步。如果殺咗 client 都停唔到 container，噉**閂咗個 app 一樣停唔到佢** — 而且同取消唔同，根本冇人要求佢停。次 render 會繼續行：tile 繼續落喺 bind-mount 嘅輸出資料夾，進度行繼續寫入一個冇人睇嘅 log，而返嚟嗰個 app 完全唔知有呢件事發生緊。`render/runner.ts` 拒絕喺自己同個 JVM 之間夾隻 shell，正正就係為咗避免呢種孤兒；Docker 用另一條路徑製造返出嚟，而你冇辦法拒絕。

唔見咗嘅從來唔係啲工作 — 啲工作好地地，仲行緊 — 唔見咗嘅係個**名**。所以個名會喺 container 開之前就寫低，擺喺佢所屬嗰次 render 隔籬：

```
<storageDir>/<renderId>/
  render.json      which engine rendered this, and how it ended
  session.json     what is running right now, and how far it got
  container.json   which container is doing it, and where its output goes
```

`container.json` 係喺 `docker run` *之前*寫，因為兩者之間嗰個窗口，正正就係「app 畀人殺咗，於是剩返一個冇嘢叫得出名嘅 container」嗰個窗口。一次 run 無論點樣完結，佢都會被移除，所以留低嘅紀錄唔會走去提議你 reattach 返一啲已經完咗嘅嘢；佢仲帶住係邊個 app instance 擁有佢 — 每次啟動都係一個新值，所以任何屬於第二個值嘅紀錄，按構造講就一定係個 app 已經冇咗。呢個同 `session.json` 用嘅測試一樣，理由都一樣：process id 會被重用，而一個啱啱撞啱咗某個唔相干嘢嘅過期 id，會令一次死咗嘅 render 永遠望落好似仲生。

啟動時，同埋任何時候有人問，每個名都會攞去問個 daemon。三種答案，三種做法。答 `running`（或者 `paused`、`restarting`、`created`）就**reattach**：串流 `docker logs --follow --tail all` 並且當佢做一次 live render 嚟報，訊息會講明個 app 閂咗但 daemon 繼續做，而家係接返佢而唔係喺隔籬再開多次。答 `exited` 就**收集**：輸出係 bind mount，已經喺磁碟度，而 exit code 會講明（例如 exit code 137）。答冇呢個 object 就照樣**收集**，但要老實：`--rm` 喺佢一完就移除咗佢，連 exit status 都一齊冇咗，如果你真係要確認，就再行一次 render，而佢淨係會補返缺咗嘅嘢。至於乜都答唔到 — daemon 冧咗，或者根本冇 `docker` — 就**兩樣都唔做**：唔收集、唔丟棄、留住個紀錄，並且講明講唔出嗰個 container 點咗，佢好可能仲行緊，等嗰部機應返你先再試。

**Daemon 冧咗永遠唔會被解讀成 container 冇咗。** 「個 container 完咗」意思係收集輸出然後收工；「知道呢個 container 嘅嗰部機冇應」意思係次 render 好可能仲行緊。將第二種當成第一種嚟報，就等於一筆勾銷咗一次行緊嘅 render，所以認唔到嘅失敗一律當 `unknown` 並且講明。

有三件事要講到好準：

- **Reattach 係一次 launch，唔係第二條回報路徑。** `docker logs --follow` 會變成一個普通嘅 `EngineLaunch`，所以同一個 `EngineProcess`、同一個 `RenderOutputTracker`、同一套階段同進度解析、同一套取消，全部照用。一個 reattach 返嚟嘅 render 發出嘅 `RenderEvent` union 同其他 render 一模一樣：同一個清單、同一條 bar、同一粒取消掣。如果有第二條回報路徑，就會出現一個介面一半睇得到、另一半停佢唔到嘅 render。
- **`--tail all` 會由 log 第一行重播**，所以一次 app 錯過咗兩個鐘嘅 render，接返嗰陣會去到真正嘅百分比，唔會由一條零嘅 bar 兼冇地圖名噉續。
- **`docker logs` 講唔到次 render 成唔成功。** 佢個 exit code 係 *client* 嘅，render 完成同 render 死咗佢都係回 0。所以一次 reattach 嘅 run 係睇引擎有冇印過 `Your maps are now all up-to-date!` 嚟判斷，而一個冇印過就完咗嘅 log，係算失敗唔算成功。

`--rm` 嘅代價正正喺呢度找數，而且係真代價：一個喺 app 閂咗期間完咗嘅 container 已經被移除，連 log 同 exit status 一齊冇埋。佢嘅**輸出**係安全嘅，因為輸出資料夾係 bind mount，唔係 container 入面嘅嘢。追唔返嘅係「佢究竟完成咗未？」嘅答案，而個 app 會用一句說話講明，唔會擺個佢自己都證明唔到嘅綠剔出嚟。

**只會提議，唔會自己做。** 因為有人重開咗個 app 就靜靜雞重跑幾個鐘嘅算圖，唔算幫忙；而靜靜雞掉咗個紀錄，就係丟咗證明呢啲工作存在嘅唯一證據。介面會問，而你拒絕咗嘅提議會被記低，所以佢只會問一次，唔會每次啟動都問。

#### 真係接唔返嘅情況

輸出資料夾畀人刪咗，或者地圖儲存目錄改咗：訊息會講明嗰度乜都冇，呢次 render 冇嘢剩返可以接，唯一出路係再 render 一次，而且會由零開始。Container 畀人移除咗：輸出會收集返，但 exit status 會明講係無從得知。Daemon 冇應：乜都唔收集，而且**乜都唔丟棄**，個紀錄會留住，因為佢係「有一次 render 仲行緊」嘅唯一證據。見到一個名似係呢個 app 開嘅 container，但隔籬冇紀錄：會報出嚟，但永遠唔會自動停佢 — 冇咗個紀錄就冇辦法知佢屬於邊次 render，或者佢啲輸出本來去邊。

一次乜都搵唔到嘅收集會報做**失敗**，唔會扮靜靜雞成功。比起蝕咗一次 render，仲衰嘅係話畀人聽啲嘢喺佢磁碟度，但其實冇。

### 失敗情況

Docker 冇裝：Docker 會標示為不可用兼講明原因，本機路線照樣行得。Docker daemon 冇行：一樣做法，但用*另一句*說話，而且唔會叫你去裝任何嘢。呢個帳戶冇權用 daemon：報做權限問題，唔會報做 daemon 唔見咗。某個世界資料夾唔准 mount：喺任何嘢開始之前就拒絕 launch 並講明原因。個 image pull 唔到：次 run 失敗，照用 Docker 自己啲字，而自動修復認得呢個情況。Container 因為食太多記憶體而被殺：exit 137，修復 pass 會讀成 out-of-memory kill，就算個 JVM 咩都冇印過。Web server 一直唔應：唔會報 URL，而理由會講明佢係退出咗定係淨係唔出聲。取消期間 `docker stop` 失敗：個取消仍然會完成；呢個 process 永遠唔會喺一個已經冇咗嘅 daemon 度乾等。Container render 緊嗰陣 app 畀人閂咗：container 繼續行，而下次啟動會提議按個名接返佢，唔會喺隔籬再開多個。Container 喺 app 閂咗期間完咗：輸出會收集，exit status 會講明係冇咗，唔會亂估。App 搵 container 嗰陣 daemon 冧咗：乜都唔收集、乜都唔丟棄，紀錄留住，遲啲再提議一次。

### 安全考慮

- Container 嘅 mount 就係列明嗰五個，冇其他。介面上面冇任何方法加多個，而 `checkMountSource` 嗰啲拒絕規則係套用喺每一個 source 上面，包括 config 同輸出資料夾。
- 每一次 run 個世界都係唯讀。
- 發佈出嚟嘅 port 一定綁去一個 host 地址（預設 loopback），永遠唔會綁去所有介面。喺咖啡店部手提電腦上面用 `-p 8100:8100`，就等於將人哋個世界地圖擺咗上局域網。
- Launch 路徑上面任何地方都唔用 shell。每個參數都係當自己一個 argv 元素傳，所以一個叫 `my world & something` 嘅世界資料夾就係個資料夾名，唔會變成第二條指令。
- Container 用 `--rm` 行，而 caller 有畀 `--user` 就用埋 — 喺 Linux，一個以 root 身分寫嘢嘅 container 會留低一堆 root 擁有嘅 tile，喺一個人自己個帳戶之後刪都刪唔到嘅資料夾入面。

### 驗證

`design/packages/app/src/main/runtime/` 有 126 個測試，冇一個需要裝咗 Docker：

- `docker.test.ts` — 探測嘅每個狀態，包括兩個平台講「daemon 掂唔到」嘅寫法、權限被拒、輸出唔係佢要求嗰個 JSON，同埋根本冇個 binary。
- `mounts.test.ts` — 家目錄、包住家目錄嘅資料夾、磁碟同檔案系統根目錄、系統資料夾、淨係一個 UNC server、相對路徑、一個會截斷 mount 參數嘅冒號，同埋一定要照樣准許嘅普通世界資料夾。
- `plan.test.ts` — 確切嘅 mount 清單、邊啲 mount 係唯讀、container 入面嘅參數、`--init`、publish 規則，同埋拒絕規劃一次會 mount 家目錄嘅 launch。
- `process.test.ts` — 同一份輸出之下，本機 run 同 containerised run 產生**完全一樣**嘅訊號流；取消嗰陣 containerised 會問 daemon 攞 container 而本機 run 唔會；以及一次失敗嘅 stop 永遠唔會令 caller 等埋一世。
- `config.test.ts` — 檔案喺呢邊寫嘅同時，入面寫嘅係 container 路徑；以及引擎自己啲目錄永遠唔會喺呢部機建立。
- `handoff.test.ts` — 一份紀錄 round-trip 得返 reattach 需要嘅所有嘢；一份被截斷、version 升咗或者冇名嘅紀錄會讀成**唔存在**而唔係當估計；一份 host 解析唔到嘅遠端紀錄會被拒絕而唔係降級當本機處理，所以 `docker stop` 永遠唔會帶住一個淨係另一部機先有嘅名發去呢部電腦；紀錄畀人接手嗰陣會取得擁有權，所以第二次 reattach 攞唔到佢；以及一份寫唔到嘅紀錄永遠唔會令次 render 失敗。
- `attach.test.ts` — 狀態同 exit code 係喺**同一次**呼叫入面問，所以佢哋描述同一刻；`--tail all`；檢查嘅每個狀態，包括一個冧咗嘅 daemon 永遠唔會讀成一個冇咗嘅 container；以及每個決定產生嗰句說話。
- `reattach.test.ts` — **app 啟動時仲行緊嘅 container**，會用同樣嘅事件同同樣嘅百分比報返；**喺 app 離開期間完咗嗰個**，佢嘅輸出會收集而唔會掉；**daemon 已經冇咗嗰個**，會直接講明；**一次去到 reattach container 嘅取消**，會問 daemon 並且報做取消而唔係失敗；一個引擎未完成就結束嘅 log 會報做失敗；一次乜都搵唔到嘅收集會報做失敗；一個突然唔出聲嘅 daemon 會令紀錄原封不動；以及一個冇紀錄嘅 container 會被點名而唔會被停。
- `ipc.test.ts` — 啲 channel、逐個模式老實嘅可用性、冇任何 handler 會 reject，以及一個冇 reattacher 嘅 build 仍然答得到 container channel，而唔係根本冇咗佢哋。

### 推薦文章

- [Automatic dependency provisioning](./dependency-provisioning.md) — 嗰粒 Download Java 掣，令一部冇 JVM 嘅機準備好行本文講嘅本機路線，完全唔使 Docker。
- [Automatic repair when a render or hosting operation fails](./automatic-repair.md) — 呢啲 run 或 hosting 開唔到嗰陣，之後會點。
- [Renders that survive being interrupted](./resumable-renders.md) — 一次被取消或者 crash 咗嘅 render 留低啲乜，下次點續。
- [Rendering on a remote host](./remote-render.md) — 同一個 container 問題，不過經 SSH，仲加埋一個可以中斷再續嘅世界上載。
- [Rendering a world in GitHub Actions](./render-in-actions.md) — 引擎喺呢部電腦以外行嘅另一個地方。
