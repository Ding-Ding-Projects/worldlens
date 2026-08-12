# Watching a render live, in a real browser tab

A render that runs for hours gives you a log. This feature gives you the map: a real
`http://` address, opened in an ordinary browser, that shows exactly the tiles this
computer has written so far — and keeps showing more of them as the render keeps going.

The screen is the **Watch it live** tab. Its main-process half is
`design/packages/app/src/main/preview/`, and its renderer half is
`design/packages/ui/src/components/preview/`.

## Why this is a new server rather than reusing the one already running

Every launch of this application already starts an embedded HTTP server
(`main/index.ts`'s `startEmbeddedServer`) that serves the app's own UI bundle and, via
`LocalMapHandler`, the two subtrees a **local render's** own viewer needs
(`settings.json` and `maps/`). That server is intentionally private: it binds to
loopback, and every request has to carry a random per-launch bearer token the renderer
injects on its own requests. It was never meant to be handed to somebody else, and
`main/pages/hosting.ts`'s own doc comment says as much — a finished render served that
way is "a URL nobody else can open." That gap is what Pages hosting was built to close by
publishing to somebody else's server; this feature closes the other half, hosting it
*from* this computer instead.

So `main/preview/server.ts` stands up a second, separate `HttpServer` — the same
chain-of-responsibility class the embedded server and the CLI's own `-w` webserver both
use — with no token, no session coupling, and no dependency on the Electron window. It
serves exactly one render's output directory (`renderWorkspace(storageDir,
renderId).webRoot`), and because a render's `webapp.enabled` setting defaults to `true`,
that directory already contains upstream's own generated `index.html` and viewer bundle.
Serving it as-is means a real, standalone map viewer answers on the address, with nothing
of this application's own UI in the way.

## Live, because it reads the workspace directly rather than waiting for a mount

`RenderOrchestrator.mount()` — the call that lets the embedded server's `LocalMapHandler`
serve a render at all — only runs once a render **finishes**. This feature does not go
through that mount at all: it points `RenderPreviewHandler` straight at the render's
workspace directory, which exists on disk from the moment the render starts. Requesting a
tile that has not been written yet answers `204`, exactly as it does for genuinely empty
terrain; requesting one that has lands the real bytes the instant the engine has written
them, container or no container, because a Docker render's `webRoot` mount is a real bind
mount to this same host path (`runtime/plan.ts`'s `hostWebRoot`), not a named volume
hidden inside the daemon.

## The one thing this cannot make un-stale on its own

The viewer keeps every tile it has already fetched in an in-memory cache
(`viewer/src/util/RevalidatingFileLoader.ts`) for the life of the browser tab, and only
re-fetches a URL once something explicitly marks it for revalidation. So a spot already
looked at will not pick up newer detail on its own — the HTTP layer here answers with a
fresh `ETag` and `Cache-Control: no-cache` on every request, which is necessary and not
sufficient, because the browser never asks again for a URL it is already holding in
memory. A silently stale "live" view would be worse than no live view at all, so the page
served at `index.html` carries a small injected banner (`injectLiveBanner` in
`server.ts`) that polls the server's own `/__worldlens-preview/status` endpoint,
names this plainly while the render is active, and offers a one-click reload. It never
force-reloads without saying so.

## Security

- **Binds to loopback (`127.0.0.1`) by default, always.** The network-exposure checkbox
  on the screen starts unticked on every open, regardless of what was saved last time;
  the full consequence sentence — every other device on this network, no sign-in — sits
  beside it every time, at every language mode and funny level.
- **Serves only the render's own output directory.** `RenderPreviewHandler` resolves
  every request against that one root and refuses anything that normalises outside its
  prefix — path traversal, encoded dot-dot segments, embedded null bytes — the same
  defence `LocalMapHandler` uses, tested with real traversal requests against a real
  temporary directory in `server.test.ts`.
- **No authentication, and no claim of any.** A loopback server needs none; when the
  network checkbox is on, anyone who can reach this computer on that network can open the
  map with no sign-in, which is exactly what the on-screen warning states.
- **Read-only.** Every response is an ordinary `createReadStream`/`readFile` open, which
  takes no exclusive lock on Windows or anywhere else — the same access `LocalMapHandler`
  already makes in production against files the engine is concurrently writing.

## The three render routes

- **Local** and **Docker/container**: both hostable, during the render and after it,
  because both write straight onto this machine's disk (see above).
- **GitHub's own runners**: nothing is on this computer while that render is in flight —
  the whole point of `cirender/`. `preview:availability` reports that honestly, by name,
  and the screen disables the control with the reason rather than showing one that could
  never work. Once that render's output has been downloaded here, it is an ordinary local
  workspace and hosts exactly like one.

## Ports

`startPreviewServer` tries a fixed, memorable default port first
(`DEFAULT_PREVIEW_PORT`, `48100`) so the address tends to stay the same across a session.
If that port is already taken — by an earlier run of this app, or by anything else on the
machine — it falls back to a port the operating system assigns, and reports which port it
actually landed on rather than failing with a raw `EADDRINUSE`.

## Stopping

One render is hosted at a time. Stopping releases the port immediately; quitting the
application does the same automatically (`main/index.ts` wires `PreviewIpc.dispose()`
into `app.on("will-quit", ...)`), so no listener is ever left orphaned holding a port
after the app has closed.

## What is deliberately not here

There is no authentication story to build out, because the one this feature offers —
"nobody outside this loopback address, or a warned network" — is the whole story. There
is no separate viewer to maintain: the page served is upstream BlueMap's own generated
webapp, unmodified except for the small injected status banner, which never touches the
file on disk.

## Suggested articles

- [Publishing a rendered map to GitHub Pages](./pages-hosting.md) — the address that
  keeps working after this computer is switched off.
- [Hosting a rendered map on your own server](./remote-hosting.md) — the same
  loopback-by-default, warned-public-choice shape, for a render kept running on a Linux
  server you own rather than on this desktop.
- [Running the engine on this computer, or in a container](./docker-and-local.md) — why a
  Docker render's output is exactly as reachable from this feature as a local render's.
- [Renders that survive being interrupted](./resumable-renders.md) — what "still writing
  to this workspace" actually means, which is the same fact this feature's live status
  reads.

## 廣東話

### 概要

一個行幾粒鐘嘅 render，畀到你嘅係一個 log。呢個功能畀你嘅係幅 map：一個真嘅 `http://` 地址，用普通瀏覽器打開，顯示部電腦到目前為止寫咗嘅 tiles——而且 render 繼續行，佢就繼續顯示更多。

個畫面係 **Watch it live** 呢個 tab。Main-process 嗰半喺 `design/packages/app/src/main/preview/`，renderer 嗰半喺 `design/packages/ui/src/components/preview/`。

### 點解係一個新 server，而唔係重用行緊嗰個

呢個應用程式每次啟動已經開一個 embedded HTTP server（`main/index.ts` 嘅 `startEmbeddedServer`），serve 個 app 自己嘅 UI bundle，同埋經 `LocalMapHandler` serve **本機 render** 自己個 viewer 需要嘅兩棵 subtree（`settings.json` 同 `maps/`）。嗰個 server 係刻意私有嘅：佢 bind 落 loopback，而且每個 request 都要帶一個每次啟動隨機生成嘅 bearer token，renderer 自己啲 request 會注入佢。佢從來唔係設計嚟交畀第二個人用，`main/pages/hosting.ts` 自己個 doc comment 都係咁講——一個 render 完嘅嘢咁樣 serve 係「a URL nobody else can open」。Pages hosting 起出嚟係為咗填呢個窿嘅一半，即係發佈去人哋嘅 server；呢個功能填另一半——由呢部電腦*自己* host。

所以 `main/preview/server.ts` 另起一個獨立嘅 `HttpServer`——同 embedded server 同 CLI 自己個 `-w` webserver 用嘅同一個 chain-of-responsibility class——冇 token、冇 session 耦合、唔依賴 Electron window。佢淨係 serve 一個 render 嘅 output directory（`renderWorkspace(storageDir, renderId).webRoot`），而因為 render 嘅 `webapp.enabled` 設定預設係 `true`，個 directory 本身已經有上游自己生成嘅 `index.html` 同 viewer bundle。原封不動咁 serve，個地址上答嘅就係一個真嘅、獨立嘅 map viewer，中間冇任何呢個應用程式自己嘅 UI 阻住。

### Live，因為佢直接讀 workspace，唔等 mount

`RenderOrchestrator.mount()`——即係令 embedded server 個 `LocalMapHandler` serve 到一個 render 嘅嗰個 call——只會喺 render **完成**之後先行。呢個功能完全唔行嗰個 mount：佢將 `RenderPreviewHandler` 直接指住個 render 嘅 workspace directory，而嗰個 directory 由 render 開始嗰一刻已經喺碟上存在。Request 一個未寫嘅 tile 會答 `204`，同真正冇嘢嘅地形一模一樣；request 一個寫咗嘅，engine 一寫完真 bytes 就到手——有冇 container 都一樣，因為 Docker render 個 `webRoot` mount 係一個真 bind mount 去同一條 host path（`runtime/plan.ts` 嘅 `hostWebRoot`），唔係收埋喺 daemon 入面嘅 named volume。

### 有一樣嘢佢自己搞唔返新

個 viewer 將每個 fetch 過嘅 tile 放喺 in-memory cache（`viewer/src/util/RevalidatingFileLoader.ts`），生存期係成個瀏覽器 tab，只有有嘢明確標記要 revalidate 先會再 fetch。所以睇過嘅位唔會自己執到新細節——HTTP 層呢邊每個 request 都答新 `ETag` 加 `Cache-Control: no-cache`，呢啲係必要但唔充分，因為瀏覽器對一個佢已經揸喺 memory 嘅 URL 根本唔會再問。一個靜靜過期嘅「live」view 衰過完全冇 live view，所以 `index.html` serve 出嚟嗰頁帶一個細細嘅注入 banner（`server.ts` 入面嘅 `injectLiveBanner`），佢 poll 個 server 自己嘅 `/__worldlens-preview/status` endpoint，render 行緊嗰陣就白紙黑字咁講，仲畀一個一撳嘅 reload。佢永遠唔會唔聲唔聲就強制 reload。

### 保安（Security）

- **預設永遠 bind 落 loopback（`127.0.0.1`）。**畫面上個 network-exposure checkbox 每次打開都由未剔開始，唔理上次儲咗乜；完整後果嗰句——呢個網絡上每一部其他裝置、唔使登入——每一次都放喺佢隔籬，每個 language mode 同 funny level 都係。
- **只 serve 個 render 自己嘅 output directory。**`RenderPreviewHandler` 每個 request 對住嗰一個 root 解析，任何 normalise 完走出 prefix 之外嘅嘢都拒絕——path traversal、encode 咗嘅 dot-dot、內嵌 null bytes——同 `LocalMapHandler` 用同一套防禦，`server.test.ts` 用真 traversal request 對住真臨時目錄測試過。
- **冇認證，亦冇聲稱有。**Loopback server 唔需要；個 network checkbox 開咗嘅話，任何喺嗰個網絡掂到呢部電腦嘅人都可以唔使登入就開幅 map——畫面上個警告講嘅正正就係咁。
- **Read-only。**每個 response 都係普通 `createReadStream`/`readFile`，喺 Windows 同任何地方都唔攞 exclusive lock——同 `LocalMapHandler` 喺 production 對住 engine 同時寫緊嘅檔一直做開嘅存取一樣。

### 三條 render 路線

- **Local** 同 **Docker/container**：兩條都 host 得，render 途中同之後都得，因為兩條都直接寫落呢部機嘅碟（見上面）。
- **GitHub 自己嘅 runners**：嗰個 render 飛緊嗰陣呢部電腦上乜都冇——`cirender/` 嘅全部意義就係咁。`preview:availability` 誠實咁、點名咁報告呢一點，畫面會將個控制項停用並寫明原因，而唔係擺一個永遠行唔通嘅掣出嚟。嗰個 render 嘅 output 下載返嚟之後，佢就係一個普通本機 workspace，host 起上嚟一模一樣。

### Ports

`startPreviewServer` 會先試一個固定、易記嘅預設 port（`DEFAULT_PREVIEW_PORT`，`48100`），咁個地址喺一個 session 入面傾向唔變。個 port 已經被佔——早一次行呢個 app，或者部機上任何其他嘢——就跌返去一個由操作系統派嘅 port，並報告實際落咗喺邊個 port，而唔係一句 raw `EADDRINUSE` fail 咗算。

### 停止

一次 host 一個 render。停止即刻釋放個 port；close 個應用程式會自動做同一件事（`main/index.ts` 將 `PreviewIpc.dispose()` 駁咗入 `app.on("will-quit", ...)`），所以個 app 閂咗之後永遠唔會有 listener 留低霸住個 port。

### 刻意冇嘅嘢

冇認證故事需要起，因為呢個功能提供嗰個——「loopback 地址以外冇人，或者一個有警告嘅網絡」——已經係成個故事。冇一個要維護嘅獨立 viewer：serve 出嚟嗰頁係上游 BlueMap 自己生成嘅 webapp，除咗個細細嘅注入狀態 banner 之外原封不動，而個 banner 永遠唔掂碟上個檔。

### 建議文章

- [Publishing a rendered map to GitHub Pages](./pages-hosting.md)——部電腦熄咗之後仲行得嘅地址。
- [Hosting a rendered map on your own server](./remote-hosting.md)——同一套 loopback-by-default、有警告先公開嘅形狀，用喺一個你自己擁有、長開嘅 Linux server 而唔係呢部 desktop。
- [Running the engine on this computer, or in a container](./docker-and-local.md)——點解 Docker render 嘅 output 喺呢個功能眼中同 local render 一樣掂得到。
- [Renders that survive being interrupted](./resumable-renders.md)——「仲寫緊呢個 workspace」實際係乜意思，即係呢個功能個 live status 讀嘅同一個事實。
