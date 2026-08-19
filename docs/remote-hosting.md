# Hosting a rendered map on your own server

A finished render lives at `http://127.0.0.1:<port>/local/<renderId>/`, an address that answers
for exactly one person, on exactly one machine, only while that machine is on.
[Publishing to GitHub Pages](./pages-hosting.md) turns it into a real address somebody else hosts,
for free, as static files. This feature is the other answer: put the map on a Linux server *you*
own, keep it running as a real web server, and know honestly whether it is actually reachable.

It reuses [rendering on a remote host](./remote-render.md)'s whole SSH/Docker foundation rather
than inventing a parallel one: the same `ssh` wrapper, the same TOFU host-key trust store, the
same `scp`/`rsync` transfer with its automatic fallback, and the same four-stage preflight (ssh,
host key, Docker, disk). What is genuinely new is what happens after a render already exists on
this computer: the map is sent the other way, the container is started **detached** rather than
disposable, and a published port has to be **verified**, not merely started.

The main-process half is `design/packages/app/src/main/remote/hostplan.ts` (the plan: paths,
container name, the `docker run` itself) and `remote/hosting.ts` (the orchestrator: preflight,
upload, replace-and-start, verify, and the persisted record of what is running). The IPC seam is
`remote/hostingIpc.ts`. The renderer half is `design/packages/ui/src/components/remote/
RemoteHostingPanel.vue` and its bridge, `hostingBridge.ts`.

## Why the world is sent again, for a map that already rendered

This surprises people the first time, so it is worth stating plainly rather than discovering it
from a failed container. The engine builds a real `BmMap` on every start of the process -
`-w`/web-server mode included - and that construction opens the world's own region files whether
or not anything is going to be re-rendered (`packages/cli/src/maps.ts`, `buildMaps`). So hosting a
map that finished rendering an hour ago still uploads the **world**, read-only, alongside the
already-rendered tiles. Nothing about this application invented that requirement; it is how the
engine this project ports is built, and the honest fix was to say so rather than to pretend a
tiles-only upload would work.

## What actually moves, and where it lands

Reusing `remote/plan.ts`'s `remotePaths` layout (a hosting run's id is `host-<hostingId>`, so a
render and a hosted publication of it can never collide in the same work directory):

```
<workDir>/host-<hostingId>/
  config/    core.conf, webapp.conf, webserver.conf (enabled, 0.0.0.0), storages/, maps/*.conf
  data/      empty at the start; the engine's own logs land here
  web/       the render's ENTIRE web/ output - settings.json, maps/, and the static webapp
             files ANY render already wrote there (see below), not merely the tiles
  worlds/<mapId>/   the world, read-only - the engine needs it, see above
  cli.jar    the same engine jar a local run uses
```

`web/` is uploaded whole, not just `web/maps`. A render already leaves a complete static site
under its own `web/` root - the same fact
[publishing to Pages](./pages-hosting.md#the-fact-the-whole-feature-rests-on) relies on - so
reusing it here needed no extra step, and no `-g`/webapp-regeneration flag is passed on the remote
run.

## The container: detached, published, and a persistent name

The docker run this module builds (`remoteServeDockerRunArguments` in `hostplan.ts`) differs from
a render's own `remoteDockerRunArguments` in exactly three ways, and the doc comment on that
function says so directly:

- `-d --restart unless-stopped` in place of `--rm`. A render container is disposable on purpose;
  a hosted one is meant to keep answering after this application closes and after the remote host
  reboots, until somebody deliberately stops it.
- `-p <bind>:<port>:8100`, a port published on purpose, to an address the person chose.
- the engine runs `-w` rather than `-r -s`.

Every map's world is still mounted **read-only**. The already-rendered `web/` is mounted
read-write, because the upstream webapp writer touches files under it even when nothing is
re-rendered.

Publishing (and republishing - see below) always tears down any prior container of the same name
first (`docker rm -f`, one command, idempotent even when there is nothing to remove), so a second
publish never fails with "name already in use."

## Two bind modes, and neither is silently chosen for you

| Choice | What `docker run -p` binds to | Reachable from |
|---|---|---|
| **Loopback** (default) | `127.0.0.1:<port>` on the remote host | Only that server itself - open an SSH tunnel yourself (`ssh -L <port>:127.0.0.1:<port> user@host`) to reach it from elsewhere |
| **Public** | `0.0.0.0:<port>` on the remote host | The whole internet, at `http://<host>:<port>/`, over **plain HTTP** |

`docker-and-local.md`'s own local-server rule is "bound to loopback by default, never every
interface, because that is how a laptop in a café ends up putting somebody's world map on the
local network." Remote hosting exists specifically to invert that - the whole point is letting
somebody else reach the map - so the inversion is a real, informed choice rather than a changed
default: **loopback stays the default here too**, and choosing "public" shows the exact warning
this application will say at every funny level, in both languages: this server has **no TLS
anywhere in it**, publishing widely puts the map on the internet over plain HTTP, and fronting it
with a certificate is the person's own responsibility. The panel shows that sentence before
public is ever the selected value, not after.

The engine's own listen address inside the container is always `0.0.0.0` - a container's own
loopback is unreachable through `-p` forwarding from outside it, which is a completely different
fact from the *host-side* bind address above and is set unconditionally, matching
`runtime/config.ts`'s existing rule for a local containerised web server.

## "Live" is never claimed on Docker's word alone

`docker run -d` reports success the instant the container process starts. That is not the same
claim as "a browser can reach this," and the whole feature is built around not confusing the two -
the same honesty rule [`docker-and-local.md`](./docker-and-local.md) states for the local web
server: **a URL is reported only after it has actually been connected to.**

Remote hosting has one wrinkle a local server never has: two different networks can fail, and the
report has to say which one did.

- **Public bind**: this application makes a real TCP connection from *this* computer to
  `<host>:<port>`, the same way anybody else would reach it, using the same `tcpPortProbe` the
  shared TCP probe (`runtime/portProbe.ts`). Only once that connection
  succeeds does the record carry a URL and `verified: true`.
- **Loopback bind**: this computer cannot reach `127.0.0.1` on somebody else's server at all -
  that is the whole point of choosing it. So the check instead runs **on the remote host itself**,
  over the SSH connection already open for everything else: a small `bash`/`/dev/tcp` script asks
  that machine's own kernel whether anything is listening on its loopback port, and the answer
  travels home over the already-trusted channel. `verified: true` here never carries a public URL
  - only a note with the exact `ssh -L` command that would open a tunnel to it.

Either way, a hosted map that never answers is reported exactly that way - `verified: false`, no
URL, a note naming which check ran and that it did not get an answer - rather than assumed live
because a container happened to start.

## Publishing again is what "update" is

There is no separate resume/update code path. Calling the same publish operation a second time:
preflights again, re-syncs the config/world/tiles (`rsync` where both machines have it, so only
what actually changed moves), tears down whatever container currently answers to that name, starts
a fresh one, and verifies again. The cost is a few seconds of downtime while the old container
stops and the new one binds - stated here rather than hidden behind a promise of zero-downtime
updates this module does not keep.

## Stopping is destructive, and is gated as such

Stopping a hosted map (`RemoteHostingOrchestrator.stopHosting`) tears the container down
(`docker rm -f`) and - unless the target is set to `keepRemoteFiles` - removes the whole remote
staging directory too, **world included**. Republishing after that costs the entire upload again,
not a resume.

The interface puts this behind `ConfigSuperConfirm`, the same anchored two-key-and-slider gate
every other destructive control in this application uses
([`super-confirmation.md`](./super-confirmation.md)), naming exactly that cost before the action
ever runs. The IPC handler itself (`hosting:stop`) performs the action without asking again; the
decision belongs to the gate, before the channel is ever called.

## Security, said plainly

- **Host keys**: exactly `remote-render.md`'s TOFU-with-fingerprint trust store, reused unchanged.
  `StrictHostKeyChecking=yes` always; an unknown key is a refusal with fingerprints to compare, a
  *changed* key is a refusal with no button at all.
- **Credentials**: no password field anywhere, ever. Authentication is the SSH agent or a named
  key file this application never opens, copies, or logs - see `target.ts`'s own doc comment for
  why a `RemoteTarget` is safe to persist whole, which is what the on-disk hosting record does.
- **Exposed ports**: loopback by default; a public bind is an explicit, warned choice, never
  silently widened.
- **Transport**: plain HTTP, always. This server has no TLS anywhere in it. A certificate in front
  of a publicly-bound host is the person's own responsibility to add - this application does not
  claim to provide one.

## Behaviour that is proven, and behaviour that is not

Everything above the network boundary is proven by the module's own test suite
(`hostplan.test.ts`, `hosting.test.ts`, `hostingIpc.test.ts`, `RemoteHostingPanel.test.ts`) against
the same fake command runner, fake file transfer, and injected verification probes the rest of
`remote/` is tested with - no SSH client, no Docker daemon, and no server anywhere in the run. That
proves the *shape* of every path: preflight refusing before a byte moves, the upload sequence, the
idempotent tear-down-and-restart, both verification paths reporting honestly when the address
never answers, loopback verification never inventing a public URL, and both branches of stopping
(with and without `keepRemoteFiles`).

What has **not** been run: an actual `ssh` connection, an actual Docker daemon publishing an
actual port, or an actual browser opening a hosted map. Nothing here has been proven against a
real remote host. Treat the shape as proven and the wiring against a genuine Linux server as the
next thing to verify by hand.

## What is deliberately not built yet

### Issue #85 dependency and evidence boundary (2026-08-19)

Issue #85 cannot close the combined SSH flow while this surface remains outside the application’s
dedicated discoverable tab navigation. Issue #84 tracks that prerequisite: the saved-target and
completed-map pickers, a dedicated command-palette destination, inventories, persistence, and real
 packaged publish, refresh, and stop path still need to be wired and captured. The main/preload
 `hosting:*` seam is present, and the issue-84 checkout now contains an uncommitted candidate
 `RemoteHostingScreen.vue`/`remoteHosting` tab with saved-target and completed-render selection.
 That candidate has not been committed, tested, packaged, or captured, so it is not accepted
 application evidence. The existing catalogue entry named `share.publishing.remote-hosting` still
 targets the Pages job with `reveal: "remote-hosting"`, so a dedicated command-palette route is not
 yet proven. Until #84 is resolved, the panel evidence below is not end-to-end application evidence.

The ultra-speed records pass intentionally ran no tests and took no captures. This note records
the dependency only; it does not upgrade the existing fake-host evidence or claim a real Linux
host, public/loopback verification, or cleanup pass.

`RemoteHostingPanel.vue` is a complete, tested, standalone component, reachable through the main
 process's `hosting:*` IPC channels and the preload bridge end to end. In the issue-84 checkout, a
 candidate screen now composes saved targets and finished renders, but those source edits are
 uncommitted and unverified. The existing `WorldScreen.vue` nested mount remains conditional on a
 live render target, render id, and completed map. The candidate still needs proof of its dedicated
 command-palette route, complete search/menu/inventory coverage, focus/persistence behavior, and the
 genuine packaged publish/refresh/stop path. The panel bridge and its publish/refresh/stop behavior
 must be preserved when that candidate is integrated.

## 廣東話

### 概要:喺自己嘅伺服器 host 一幅 render 好嘅地圖 (Hosting a rendered map on your own server)

一幅 render 完嘅地圖本身住喺 `http://127.0.0.1:<port>/local/<renderId>/` — 呢個地址只答一個人、一部機,而且淨係部機開住先有。[發佈去 GitHub Pages](./pages-hosting.md) 係一條出路:交畀人哋免費 host,做靜態檔案。呢個功能係另一個答案:將幅地圖擺上一部*你自己*擁有嘅 Linux 伺服器,當一個真正嘅 web server 咁長開,而且要老老實實知道佢究竟接唔接觸到。

佢完全重用[喺遠端主機 render](./remote-render.md) 嗰成套 SSH/Docker 基礎,而唔係另起爐灶:同一個 `ssh` wrapper、同一個 TOFU host-key 信任儲存、同一套 `scp`/`rsync` 傳輸連自動 fallback、同一個四階段 preflight(ssh、host key、Docker、disk)。真正新嘅嘢係一個 render 已經喺呢部電腦存在之後發生嘅事:幅地圖反方向送上去、個 container 用 **detached** 模式起而唔係用完即棄、發佈咗嘅 port 一定要經過**驗證**,唔係開咗就算。

主進程嗰半係 `design/packages/app/src/main/remote/hostplan.ts`(個 plan:路徑、container 名、`docker run` 本身)同 `remote/hosting.ts`(orchestrator:preflight、上傳、replace-and-start、驗證,加埋「而家行緊乜」嘅持久化紀錄)。IPC 接口係 `remote/hostingIpc.ts`;renderer 嗰半係 `design/packages/ui/src/components/remote/RemoteHostingPanel.vue` 同佢個 bridge `hostingBridge.ts`。

### 點解一幅已經 render 完嘅地圖仲要再送個 world 上去

第一次見會出奇,所以直接講明,好過由一個 fail 咗嘅 container 度發現。個 engine 每次啟動都會起一個真嘅 `BmMap` — 包括 `-w`/web-server 模式 — 而呢個構建過程會開個 world 自己嘅 region 檔,唔理有冇嘢要重新 render(`packages/cli/src/maps.ts` 嘅 `buildMaps`)。所以就算 host 一幅一個鐘之前先 render 完嘅地圖,都仲係要將個 **world**(唯讀)連已經 render 咗嘅 tiles 一齊上傳。呢個要求唔係呢個 app 發明嘅,係上游 engine 嘅設計;誠實嘅做法係講到明,而唔係扮 tiles-only 上傳會 work。

### 實際搬啲乜,落喺邊度

重用 `remote/plan.ts` 嘅 `remotePaths` 佈局(hosting run 嘅 id 係 `host-<hostingId>`,所以一個 render 同佢嘅 hosted 發佈永遠唔會喺同一個工作目錄相撞)。`<workDir>/host-<hostingId>/` 下面:`config/` 放 core.conf、webapp.conf、webserver.conf(enabled,0.0.0.0)、storages/ 同 maps/*.conf;`data/` 開頭係空嘅,engine 自己啲 log 落呢度;`web/` 係個 render 嘅**成個** web/ 輸出 — settings.json、maps/,加埋任何 render 已經寫低咗嘅靜態 webapp 檔案,唔係淨係 tiles;`worlds/<mapId>/` 係個 world,唯讀(engine 需要,見上面);`cli.jar` 係本地 run 用嘅同一個 engine jar。

`web/` 係成個上傳,唔淨係 `web/maps`。一個 render 本身已經喺自己個 web/ root 留低一個完整靜態網站 — 同 [Pages 發佈](./pages-hosting.md#the-fact-the-whole-feature-rests-on)依賴嘅係同一個事實 — 所以呢度重用佢唔使加步驟,遠端 run 亦唔使傳 `-g`/webapp-regeneration flag。

### 個 container:detached、有 published port、有固定名

`hostplan.ts` 嘅 `remoteServeDockerRunArguments` 同 render 自己嘅 `remoteDockerRunArguments` 只差三處,個 function 嘅 doc comment 直接咁講:

- 用 `-d --restart unless-stopped` 取代 `--rm`。render container 係刻意即棄嘅;hosted container 係要喺 app 閂咗之後、遠端主機重啟之後照樣答,直到有人刻意停佢。
- `-p <bind>:<port>:8100` — 刻意發佈嘅 port,bind 落用戶揀嘅地址。
- engine 行 `-w` 而唔係 `-r -s`。

每個 map 嘅 world 照樣**唯讀** mount。已 render 嘅 `web/` 係 read-write mount,因為上游嘅 webapp writer 就算冇嘢重新 render 都會掂佢下面啲檔案。發佈(同重新發佈 — 見下面)一定會先拆咗同名嘅舊 container(`docker rm -f`,一條命令,冇嘢好拆都係 idempotent),所以第二次發佈永遠唔會撞「name already in use」。

### 兩種 bind 模式,冇一種係靜靜雞幫你揀咗

**Loopback**(預設):`docker run -p` bind 落遠端主機嘅 `127.0.0.1:<port>`,只有嗰部伺服器自己接觸到 — 想喺第二度去到,要自己開 SSH tunnel(`ssh -L <port>:127.0.0.1:<port> user@host`)。**Public**:bind 落 `0.0.0.0:<port>`,成個互聯網喺 `http://<host>:<port>/` 用**明文 HTTP** 都去到。

`docker-and-local.md` 本地伺服器嘅規矩係「預設 bind loopback,永遠唔會 bind 所有 interface,因為咁樣先會搞到一部喺 café 嘅手提電腦將人哋個 world map 放咗上 local network」。remote hosting 存在嘅意義正正係反轉呢樣嘢 — 成個重點就係畀其他人去到幅地圖 — 所以個反轉必須係一個真實、知情嘅選擇,而唔係一個改咗嘅預設:**呢度 loopback 照舊係預設**,而揀「public」會喺 public 成為選中值*之前*(唔係之後)、用兩種語言、喺每一個 funny level 都顯示同一個明確警告:呢個 server 由頭到尾**冇 TLS**,公開發佈即係將幅地圖用明文 HTTP 擺上互聯網,要喺前面加證書係用戶自己嘅責任。

container 入面 engine 自己嘅 listen 地址永遠係 `0.0.0.0` — container 自己嘅 loopback 經 `-p` forwarding 由外面係掂唔到嘅,呢樣同上面講嘅 *host-side* bind 地址係完全兩回事,而且係無條件咁 set,同 `runtime/config.ts` 對本地 container 化 web server 嘅現有規則一致。

### 「Live」永遠唔會淨係信 Docker 一句就 claim

`docker run -d` 喺 container process 一啟動嗰刻就報成功。呢個唔等於「一個瀏覽器接觸到佢」,成個功能就係圍繞唔好撈亂呢兩樣嘢而起 — 同 [`docker-and-local.md`](./docker-and-local.md) 對本地 web server 講嘅誠實規則一樣:**一個 URL 只會喺真係連過之後先報出嚟。**

remote hosting 有一個本地伺服器永遠冇嘅皺摺:兩個唔同嘅網絡都可以 fail,報告要講明係邊一個。

- **Public bind**:呢個 app 由*呢部*電腦向 `<host>:<port>` 開一條真 TCP 連線,同任何其他人接觸佢嘅方式一樣,用嘅係共用嘅 `tcpPortProbe`(`runtime/portProbe.ts`)。連線成功咗,個紀錄先會帶 URL 同 `verified: true`。
- **Loopback bind**:呢部電腦根本掂唔到人哋伺服器嘅 `127.0.0.1` — 揀佢就係為咗咁。所以個檢查改為**喺遠端主機自己度行**,行喺本身已經為其他嘢開咗嘅 SSH 連線上面:一段細細嘅 `bash`/`/dev/tcp` script 問嗰部機自己個 kernel,loopback port 有冇嘢聽緊,答案經已信任嘅通道傳返嚟。呢度嘅 `verified: true` 永遠唔會帶公開 URL — 只有一句 note,寫住可以開 tunnel 嘅確切 `ssh -L` 命令。

無論邊條路,一幅冇回應嘅 hosted 地圖就照直報成咁:`verified: false`、冇 URL、note 講明行咗邊個檢查同埋冇攞到答案 — 唔會因為個 container 啱好啟動咗就當佢係 live。

### 「更新」即係再發佈一次

冇獨立嘅 resume/update code path。第二次叫同一個 publish 操作會:再 preflight、re-sync config/world/tiles(兩邊都有 `rsync` 嘅話,只搬真係變咗嘅嘢)、拆咗而家答緊嗰個名嘅 container、開個新嘅、再驗證一次。代價係舊 container 停、新 container bind 嗰幾秒 downtime — 呢度直接講明,而唔係收埋喺一個呢個模組守唔到嘅 zero-downtime 承諾後面。

### 停止係破壞性嘅,所以有閘

停一幅 hosted 地圖(`RemoteHostingOrchestrator.stopHosting`)會拆咗個 container(`docker rm -f`),而且 — 除非個 target set 咗 `keepRemoteFiles` — 連成個遠端 staging 目錄都會剷埋,**包括個 world**。之後再發佈就要成個上傳重新嚟過,唔係 resume。

介面將呢一下擺喺 `ConfigSuperConfirm` 後面,即係全 app 其他破壞性操作用開嘅嗰個 anchored 兩鍵加 slider 嘅閘([`super-confirmation.md`](./super-confirmation.md)),喺行動之前講明呢個確切代價。IPC handler 本身(`hosting:stop`)唔會再問一次就執行 — 個決定屬於個閘,喺 channel 被叫之前。

### 安全,直接講

- **Host keys**:一字不改重用 `remote-render.md` 嗰個 TOFU-with-fingerprint 信任儲存。永遠 `StrictHostKeyChecking=yes`;未見過嘅 key 係拒絕加 fingerprint 畀你逐隻字對,*變咗*嘅 key 係拒絕而且完全冇掣可以撳。
- **憑證**:邊度都冇密碼欄,永遠冇。認證係 SSH agent 或者一個指名嘅 key 檔,呢個 app 從來唔開、唔抄、唔 log — 見 `target.ts` 自己嘅 doc comment 講點解成個 `RemoteTarget` 可以安全持久化,on-disk hosting record 正正係咁做。
- **開放 port**:預設 loopback;public bind 係一個明確、有警告嘅選擇,永遠唔會靜靜雞放寬。
- **傳輸**:永遠明文 HTTP。呢個 server 冇任何 TLS。公開 bind 前面加證書係用戶自己嘅責任 — 呢個 app 唔會 claim 提供到。

### 已經證咗嘅行為,同未證嘅

網絡邊界以上嘅嘢,全部由模組自己嘅測試(`hostplan.test.ts`、`hosting.test.ts`、`hostingIpc.test.ts`、`RemoteHostingPanel.test.ts`)證實,用嘅係 `remote/` 其他部分同一套 fake command runner、fake file transfer 同注入嘅 verification probe — 成個 run 冇 SSH client、冇 Docker daemon、冇任何伺服器。噉樣證咗每一條 path 嘅*形狀*:preflight 喺一個 byte 未郁之前就拒絕、上傳次序、idempotent 嘅拆完再開、兩條驗證路喺地址冇回應時都誠實報告、loopback 驗證永遠唔會發明一個公開 URL,仲有 stop 嘅兩個分支(有同冇 `keepRemoteFiles`)。

**未**行過嘅:真嘅 `ssh` 連線、真嘅 Docker daemon 發佈真嘅 port、真嘅瀏覽器開一幅 hosted 地圖。呢度冇任何嘢對住真遠端主機證過。形狀當已證,對住一部真 Linux 伺服器嘅接線就係下一樣要人手驗嘅嘢。

### 刻意仲未起嘅部分

`RemoteHostingPanel.vue` 係一個完整、有測試、獨立嘅 component,經主進程嘅 `hosting:*` IPC channel 同 preload bridge 頭尾駁通 — 但佢**仲未接入 app 自己嘅 tab navigation**。將佢 mount 落一個搵得到嘅 screen,畀返一個真 screen 會供應嘅 target-picker 同 map-list context,係下一步;過早接入 — 喺一個幾個 screen 同時起緊嘅 shared checkout 度 — 有風險令一個半完成嘅整合過唔到幾個 package-wide 嘅「every surface has X」invariant(command palette 覆蓋、tab search、menu 覆蓋),而一個真正新嘅 top-level screen 係要全數滿足嗰啲invariant嘅。
