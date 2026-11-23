# Live 3D viewer and bot

A Minecraft bot joins a server and a web page shows what it sees, in 3D, live. The page is
hosted in a Docker container on this PC or on an SSH host, and hosting is one click: the
application returns a link it has already opened from this PC, with **Open** and **Copy link**.

**Contents**

- [What it is](#what-it-is)
- [Behaviour](#behaviour)
  - [The two viewers](#the-two-viewers)
  - [What one click does](#what-one-click-does)
  - [The instance manager](#the-instance-manager)
- [Configuration](#configuration)
- [Microsoft sign-in](#microsoft-sign-in)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Status](#status)
- [Related reading](#related-reading)
- [廣東話](#廣東話)

## What it is

Two parts, shipped together:

- **A container image** (`design/packages/liveviewer`): a Node program that runs a
  [mineflayer](https://github.com/PrismarineJS/mineflayer) bot and serves either Prismarine Viewer
  or Prismarine Web Client on port 3007 inside the container, with a `/health` route that reports
  whether the bot has joined.
- **A hosting module** (`design/packages/app/src/main/liveviewer`) and a dialog
  (`design/packages/ui/src/components/liveviewer/LiveViewerDialog.vue`) that configure it and put
  it on a machine.

The image is built by CI (`liveviewer-image` job) and pushed to
`ghcr.io/ding-ding-projects/worldlens-live-viewer` for `linux/amd64` and `linux/arm64`, and its
digest is recorded as a build artifact. At package time
`design/packages/app/scripts/build-liveviewer-image.mjs` puts the image **inside the application's
resources** as a docker-archive, so hosting never downloads anything when somebody clicks Host.

## Behaviour

### The two viewers

| Viewer | What a visitor gets | Applies |
| --- | --- | --- |
| **Prismarine Viewer** | A 3D view of what the bot sees, streamed from the bot. Follow camera or first person. | Camera, mouse look, other players, chat panel, view distance all apply. |
| **Prismarine Web Client** | Its own player in the visitor's browser, connecting to the server through a proxy inside the container that is locked to the one configured server. | Only the bot's behaviours apply. The viewer-only settings are disabled in the dialog and the dialog says so. |

The Web Client is the published `prismarine-web-client@1.6.0` (December 2023). It was written for
older game versions than the newest releases; whether a given server version works in it is shown
by trying it, not promised here.

### What one click does

In order, each step shown with its own state in the dialog and each able to fail on its own:

1. **Docker** is probed on the chosen machine (a distinct sentence for not installed, daemon not
   running, access refused).
2. **The bundled image** is loaded (`docker load`; over SSH it is copied with `scp` first and the
   copy is deleted afterwards). If the image is already present with the expected id, this is
   skipped. If the build has no image, hosting stops and says so. It never pulls.
3. **Storage**: two volumes labelled as this installation's.
4. **Settings** are written to the config volume from standard input.
5. **Secrets** (Microsoft only) are written to the secrets volume, from standard input.
6. **Start**: a read-only, no-capabilities container with memory, CPU and process limits, restart
   `unless-stopped`, port published on the chosen web port.
7. **Link check**: this PC fetches the viewer's `/health` at the hosting machine's LAN address,
   retrying for up to 90 seconds. A link this PC cannot open is a failure (and everything made is
   removed), with a note that a firewall may be blocking the port.
8. **Bot**: the result says whether the bot had joined when the link answered. A link that works
   with a bot that has not joined is reported as exactly that, with the bot's own reason.

A server on the hosting machine's own loopback (`localhost`, `127.x`) is reached through
`host.docker.internal`, which the run command maps to the host gateway. The machine's LAN address
is used for the link, not for the bot, because a container often cannot connect back to its host's
LAN address.

### The instance manager

Every hosted viewer is recorded in `live-viewers.v1.json` in the application's data folder (name,
target, port, link, bot, server, account reference; nothing secret). The dialog lists them with
their live state from Docker and, when running, whether the bot is in, and offers **Start**,
**Stop**, **Open** and **Remove**. Remove asks for the viewer's name, then deletes the container,
both volumes and the record. The manager only touches containers it created: every call checks the
registry first.

## Configuration

Everything is a control in the dialog; the stored document is `config.json` (schema 1).

| Setting | Control | Notes |
| --- | --- | --- |
| Server | picker of managed servers, or an address and port | Managed servers come from the server manager. |
| Version | detect, or a version chosen by hand | Detect lets the bot ask the server. |
| Bot name | text, 3 to 16 letters, digits, underscore | |
| Sign-in | offline name or Microsoft account | See below. |
| Host on | This PC or a saved SSH host | |
| Web port | 1024 to 65535 | The outside port. The container always listens on 3007. |
| View distance | slider, 2 to 16 chunks | Viewer only. |
| Camera | follow or first person | Viewer only. |
| Mouse look, other players, chat | switches | Viewer only. |
| Reconnect after a kick | switch, delay 1 to 3600 s, tries 1 to 1000 | |
| Follow a player | switch and a player name | Uses `mineflayer-pathfinder`. |
| Look at nearby players | switch | Turns the bot's head only. |
| Relay chat | switch | Chat and system lines reach the page. |
| Sleep at night | switch | Uses a bed within 16 blocks. |

Every attempt to join has a 45 second deadline, because a server that silently drops packets
produces no error at all.

When a personal vocabulary file is loaded in the application, only the entries that match the
container's own visible strings (the page title, the chat label, the join and reconnect
announcements) are copied into the container's `config.json`, matched as whole strings. The rest of
the mapping never leaves the application. Removing the file and hosting again restores the
original wording.

## Microsoft sign-in

Sign-in uses the device-code flow through the protected account store the bots feature already
uses (`mcserver/bots/accounts.ts`): the code and the microsoft.com address are shown in the dialog,
the cache is encrypted with the operating system's credential protection, and the store refuses to
run when only plain-text storage is available.

When a viewer is hosted, the decrypted cache is written **only** to the standard input of a
throwaway container that has no network, runs as the viewer's own unprivileged user with
`umask 077`, and stores it as `/secrets/auth.json` in the viewer's private volume. It is never an
argument, an environment variable, part of `config.json` or a log line. Refreshed tokens are
written back to the same file by the container.

## Failure modes

| What happened | What the dialog says |
| --- | --- |
| Docker missing, stopped or refused | The probe's sentence for that state, naming the next step. |
| The build has no image | The image is not part of this build. Nothing is downloaded. |
| Bundled archive altered | The archive does not match its recorded checksum. |
| Port already published | The port is in use on that machine. Choose another. |
| This PC cannot open the link | The viewer started but the link cannot be opened; a firewall may be blocking the port. Everything made is removed. |
| Bot cannot join | Link works, bot has not joined, with the bot's own reason (kicked, refused, timed out). |
| Microsoft account never signed in | Sign in, then host again. |
| No protected storage | A Microsoft account cannot be kept on this PC. |
| SSH host unknown | Choose a saved host. |
| Cancelled | The half-started viewer is removed. |

## Security considerations

- The container runs read-only, as a non-root user, with all capabilities dropped,
  `no-new-privileges`, a memory limit, a CPU limit and a process limit. Config is mounted read-only.
- The Web Client's connection proxy is configured with an allow-list of exactly one destination
  (the configured server). The stock server of that package lets any visitor open a connection to
  any host the container can reach.
- The viewer page text is built from escaped strings; the chat panel writes text, never markup.
- The link is a LAN link. Nothing here exposes the viewer to the Internet, and the viewer page has
  no sign-in of its own, so anyone on that network who has the link can watch.
- A Microsoft cache on a hosting machine is a file readable by that machine's Docker
  administrators. It is protected inside the application, not on the machine it is hosted on.

## Verification

Run on 23 November 2026 against a vanilla 1.20.4 server in offline mode on this machine's Docker:

- The image builds (`docker build -f design/packages/liveviewer/Dockerfile`), and the build now
  loads the server modules so a missing runtime module fails there.
- Real run of `LiveViewerService.host` (`service.realDocker.test.ts`, off by default; enable with
  `LIVEVIEWER_REAL_DOCKER=1 LIVEVIEWER_REAL_SERVER=host:port`): the bundled archive loaded, the
  container started, the bot joined, this PC fetched the link, the instance manager listed it as
  running with the bot in, and Remove deleted the container and both volumes.
- Prismarine Viewer's socket delivered the game version, 25 chunks, position packets with pitch
  (first person) and entities, and relayed chat lines to the page's chat channel.
- Prismarine Web Client mode served its page, `config.json` with the configured defaults, and its
  proxy answered 200 for the configured server and 403 for another destination.
- `build-liveviewer-image.mjs` produced the archive both ways: the Docker route (225 MB) and the
  registry route, which was exercised end to end against a small public image pinned by digest
  and loaded with `docker load`.

Not verified: a Microsoft sign-in (it needs a real account and a registered client id), hosting
over a real SSH host (the SSH path is tested against a fake runner only), the Web Client rendering
in a browser, the `linux/arm64` image, the GHCR digest route against GHCR itself (nothing has been
pushed yet), and the dialog in the running desktop application.

## Status

The container, hosting module, IPC handlers, accounts adapter, image script, CI job and dialog are
implemented and unit-tested. They are **not registered** yet: the main process has to call
`registerLiveViewerHandlers`, the preload has to expose `worldlens.liveViewer`, and the application
shell has to open `LiveViewerDialog`. Until then the dialog says that hosting needs the desktop
application and keeps Host disabled. `design/packages/app/liveviewer-image.pin.json` does not exist
yet either; once CI has pushed the image, commit `{ "image": "ghcr.io/...", "digest": "sha256:..." }`
there so a build host without Docker can fetch it.

## Related reading

- [Docker hosting instance manager](./docker-hosting-manager.md)
- [Bots and commands](./bots-and-commands.md)
- [The container image](./container-image.md)
- [SSH hosting](./remote-hosting.md)

## 廣東話

呢個功能會放一個 Minecraft 機械人入伺服器，再用網頁即時顯示佢睇到嘅 3D 畫面。網頁行喺 Docker
容器入面，可以放喺呢部電腦或者一部 SSH 主機，一撳就搞掂，之後畀你一條已經由呢部電腦打開過驗證嘅
區域網絡連結，有「打開」同「複製連結」。

- 兩種檢視器：Prismarine Viewer（睇機械人嘅視角，鏡頭、滑鼠、其他玩家、聊天、視距都有效）同
  Prismarine Web Client（訪客自己玩，只有機械人行為有效，代理只准連去設定嗰一個伺服器）。
- 一撳會做嘅步驟：檢查 Docker、載入內置映像（唔會下載）、建立儲存、寫入設定、（Microsoft）寫入登入、
  啟動容器、由呢部電腦開連結驗證、等機械人加入。連結打唔開就會全部清走並提示可能係防火牆。
- 機械人行為：被踢後重連（等候秒數同次數）、跟隨玩家、望向附近玩家、轉發聊天、夜晚瞓覺。每次加入有
  45 秒限時。
- 實例管理：記錄喺應用資料夾，列出狀態、開始、停止、打開同移除（要打返名先會刪）。
- Microsoft 登入用裝置代碼流程，登入資料受作業系統保護儲存；放上主機時只經標準輸入寫入無網絡嘅
  一次性容器，唔會出現喺參數、環境變數或日誌。
- 已驗證：喺 1.20.4 離線伺服器上真正跑過容器、機械人加入、連結可開、移除乾淨。未驗證：Microsoft
  登入、真實 SSH 主機、Web Client 喺瀏覽器嘅顯示、arm64 映像、GHCR 摘要路線、同桌面應用入面實際運行。
- 狀態：模組同對話框已寫好並有測試，但主程序、預載同應用外殼仲未接駁，所以暫時只會提示需要桌面應用。
