# Glossary

The words this application uses for its own concepts, in one place, defined against what the
code actually does rather than against what the term means in general. Several of these are
BlueMap's own vocabulary (map, tile, storage); a few are this desktop app's own invention on
top of BlueMap (project, profile); one or two mean something narrower here than they might
suggest (world, engine). Every entry below was checked against the schema or the code it
describes before being written, and each cites where.

Every `GlossaryTerm` info button in the application links to this article at the matching
heading below, so "Read more in the glossary" always lands on the exact term rather than the
top of this page.

## Map

A map is one dimension of one world, rendered with its own settings - the thing BlueMap
actually renders and serves. A world can have several maps, one per dimension, and nothing
stops two maps pointing at the same dimension with different settings. A map is defined by a
`maps/<id>.conf` file (`packages/config/src/schema/map.ts`), and it is what a
[storage](#storage) holds [tiles](#tile) for.

## World

A world is the Minecraft save folder BlueMap reads from - the one holding `level.dat` and a
region folder. A world is never rendered directly; a [map](#map), pointed at one of its
[dimensions](#dimension), is. See [Finding worlds](./finding-worlds.md) for how the app locates
world folders already on this computer.

## Storage

Storage is where a map's rendered [tiles](#tile) are written: to files on disk (`file`
storage), or into a SQL database (`sql` storage, over JDBC). Every map names one storage, by
id, in a `storages/<id>.conf` file. File storage also has a "write tiles atomically" setting -
when it is on, a tile is written to a temporary file and moved into place, so a reader never
sees a half-written tile; turning it off skips that extra rename at the cost of an occasional
partial read (`packages/config/src/schema/storage.ts`).

## Render

Rendering is the process that reads a world's chunks and writes the [tiles](#tile) a viewer
displays. It can run on this computer, in a container, on a remote machine over SSH, or on
GitHub's own runners - see [Running the engine on this computer, or in a container](./docker-and-local.md)
and [Rendering a world in GitHub Actions](./render-in-actions.md) for the four routes in full.

## Tile

A tile is one square piece of a rendered map. **Hires** tiles are the close-up ones, carrying
full 3D detail - disabling them speeds up rendering and shrinks the map, but zooming in loses
the 3D models. **Lowres** tiles are flattened, zoomed-out ones used from a distance, built at
several **levels of detail** (how many, and how much coarser each level is than the last) so
far-away parts of the map load quickly. Hires tiles are sized in blocks (32 by default); lowres
tiles are sized in pixels (500 by default) (`packages/config/src/schema/map.ts`, the
`enable-hires`, `hires-tile-size`, `lowres-tile-size`, `lod-count` and `lod-factor` fields).

## Map ID

The map id is the short identifier a map is stored and referred to by - in file paths and the
viewer's own URL - distinct from its display name. The [wizard](./finding-worlds.md) suggests
one automatically from the display name, but it can be typed by hand.

## Project

A project is a JSON file this app writes at the root of a Minecraft world folder, holding every
[map](#map), [storage](#storage) and setting that world renders with. It is this app's own
invention, not something BlueMap itself reads - open one from the Projects tab to change
anything before a render runs, or render it again exactly as it was.

## Config Folder

A config folder holds BlueMap's own `.conf` files - `core.conf`, `maps/<id>.conf`,
`storages/<id>.conf`, `webapp.conf`, `webserver.conf` and `plugin.conf` - the files BlueMap's
own engine reads directly, independent of any [project](#project) file this app writes. It is
reached through the "Server configuration" button rather than through the Projects tab, and the
two are not the same thing: a project is this app's own record of what to render; a config
folder is BlueMap's native format, the kind you would hand to a Minecraft server plugin or a
`bluemap-cli.jar` invocation with no knowledge of this app at all.

## Marker

A marker is a labelled point or shape drawn on the rendered map - a waypoint, a warning, a
region outline. Markers are grouped into **marker sets**, which can be shown or hidden together
in the viewer and are toggled as a group, labelled and sorted as one unit
(`packages/config/src/schema/map.ts`'s `marker-sets` field).

## Dimension

A dimension is one of a world's Minecraft dimensions - the Overworld, the Nether or the End. A
world can hold more than one, and each gets its own [map](#map)
(`packages/config/src/schema/common.ts`'s `DIMENSION_OPTIONS`).

## Server Plugin

Server plugin settings (`plugin.conf`) apply only when BlueMap runs inside a Minecraft server
process, as a server platform mod. This desktop app never runs that way - it always drives
BlueMap's standalone engine - so the Server Plugin tab changes nothing for a render started
here. It exists because the same [config folder](#config-folder) can later be copied onto a
real Minecraft server, where a platform adapter does read it
(`packages/config/src/schema/plugin.ts`).

## Render Threads

Render threads are how many CPU threads render tiles at once (`render-thread-count`, default
1). Render thread priority (`render-thread-priority`, 1 to 10, default 5) sets how much CPU
time they get relative to everything else running on the machine. Both live in `core.conf`
(`packages/config/src/schema/core.ts`).

## Reaches This Render

"Reaches this render" is the wizard's own phrase for a setting the local engine actually reads
for a single render, right now. Only six settings do: **world**, **dimension**, **name**, sort
order, starting position and storage. Every other setting the wizard collects is written into
the map's config file for a future render to pick up, but does not affect the render that runs
immediately after the wizard (`packages/ui/src/components/world/wizardSteps.ts`'s
`REQUEST_BACKED_PATHS`).

## Engine

The engine is the program that walks a world and writes tiles. Locally, that is BlueMap's own
Java engine; a Java runtime is downloaded automatically into this app's own, git-ignored folder
the first time it is needed, so nothing has to be installed by hand. A from-scratch TypeScript
mesher is a separate, in-progress effort and not what runs today.

## Profile

A profile is this app's own name for one entry in "Maps and servers": either a map already
rendered on this computer, or the address of someone else's BlueMap web server (a
[BlueMap URL](#bluemap-url)). A locally rendered map is added to the list automatically once
its render finishes; a remote one is added by hand.

## BlueMap URL

A BlueMap URL is the web address of a BlueMap web server already running somewhere else -
someone else's computer, not this one - used to view its live map remotely. Nothing is rendered
here for it; adding one only tells the viewer where to look.

## Render Mask

A render mask limits which blocks of a world actually get rendered, by a list of shapes: a
**box** (an axis-aligned cuboid, given as a minimum and maximum on each axis - the default
shape) or a **circle** (on the X/Z plane, with an optional Y range). Each shape is additive or
subtractive, and BlueMap treats every block outside the combined mask as air
(`packages/config/src/schema/mask.ts`, `packages/config/src/schema/map.ts`'s `render-mask`
field). It replaces an older, flat `min-x`/`max-x`/`min-z`/`max-z`/`min-y`/`max-y` bounding box,
which BlueMap now refuses to start with.

## Config Files

The files a [config folder](#config-folder) can hold: `core.conf` (folders, render threads,
update timing, the debug log and the anonymous [metrics](#metrics) switch), `webapp.conf` (what
a visitor sees and where the web app is generated), `webserver.conf` (the built-in server's
port, bind address and access log), `plugin.conf` (see [Server Plugin](#server-plugin)), one
`storages/<id>.conf` per [storage](#storage), and one `maps/<id>.conf` per [map](#map).

## Compression

The compression BlueMap applies to the [tiles](#tile) it writes into a
[storage](#storage): `gzip`, `zstd`, `deflate`, or none. Every tile file carries the
compression it was written with in its name, so tiles written under one setting are not found
under another (`packages/config/src/schema/storage.ts`).

## SQL Storage (JDBC)

A SQL [storage](#storage) connects over a **JDBC connection URL** (for example
`jdbc:mysql://localhost:3306/bluemap`), an optional **SQL dialect** (which set of SQL
statements BlueMap uses - left unset, BlueMap picks the dialect matching the URL's own prefix
and refuses to start if none matches), and an optional **driver jar** plus **driver class** for
a database whose driver BlueMap does not bundle (`packages/config/src/schema/storage.ts`).

The standalone CLI uses the same `storages/<id>.conf` contract for SQLite, MySQL, MariaDB, and
PostgreSQL. Credentials belong in `connection-properties`, never in a travelling project file;
missing optional drivers, unsupported custom JDBC fields, unknown dialects, and connection failures
remain non-zero failures with credential-safe diagnostics. See
[Standalone CLI resource and SQL parity](./compatibility/cli-resource-sql-parity.md).

## GitHub Runners And Actions

[Rendering a world in GitHub Actions](./render-in-actions.md) hands the whole [render](#render)
to GitHub's own free build machines (its **runners**), inside a GitHub **Actions workflow**
made of one or more **jobs**. A large world can be split across several jobs at once (a
**matrix**, **sharding** the world by region) and merged back into one map afterwards. Useful
when the computer running this app cannot render the world itself.

## GitHub Pages And Publishing

[Publishing a rendered map to GitHub Pages](./pages-hosting.md) uploads a finished render to a
GitHub repository and turns on GitHub's own static-site hosting (**GitHub Pages**) for it, so
the map is reachable at a public URL with no server of your own to run.

## Atomic Write

See [Storage](#storage) - "write tiles atomically" is a per-file-storage setting, not a
separate concept.

## Viewer Camera Modes

The rendered map's viewer offers up to three camera modes, each independently switchable per
map: **free-flight** view (fly anywhere), **perspective** view (a first- or third-person
walkthrough), and **flat** view (an isometric, top-down view - the cheapest to render, since
disabling the other two while keeping only flat view speeds up rendering and shrinks the map)
(`packages/config/src/schema/map.ts`'s `enable-free-flight-view`, `enable-perspective-view` and
`enable-flat-view` fields).

## Webserver Bind Address And Access Log

The built-in web server's **listen address** (`ip` in `webserver.conf`) is which network
interface it binds to - `0.0.0.0` (the default) or an empty value binds every interface, making
it reachable from anywhere that can route to the machine. Its **access log** records every
request, in a configurable file and format, and is off (no logging) by default
(`packages/config/src/schema/webserver.ts`).

## Metrics

BlueMap's own anonymous usage report: a basic implementation-and-version line, sent to the
BlueMap project if the "send anonymous usage metrics" switch in `core.conf` is left on (the
default) (`packages/config/src/schema/core.ts`).

## Mojang EULA And Download Consent

Covered in full in [The Minecraft licence and the consent that refers to it](./eula-and-consent.md)
- the one part of this app's vocabulary that already had a dedicated, well-explained article
before this glossary existed.

## 廣東話

### 詞彙表 (Glossary)

呢度集中收晒呢個應用程式對自己概念所用嘅字眼，而每個定義都係對住程式碼實際做咩去寫，唔係對住個詞喺一般語境下嘅意思。當中有幾個係 BlueMap 自己嘅詞彙（map、tile、storage）；有幾個係呢個桌面 app 喺 BlueMap 之上自己發明嘅（project、profile）；仲有一兩個喺呢度嘅意思比表面窄好多（world、engine）。下面每一條，寫之前都對住佢所描述嘅 schema 或者程式碼查證過，亦有引用出處。

應用程式入面每一個 `GlossaryTerm` 資訊掣，都會連到呢篇文章對應嗰個標題，所以「Read more in the glossary」永遠落喺確切嗰個詞，唔會淨係跳到頁頂。

### 地圖 (Map)

一個 map 就係一個世界嘅其中一個維度，用佢自己嗰套設定 render 出嚟 —— 即係 BlueMap 真正會 render 同 serve 嗰樣嘢。一個世界可以有幾個 map，一個維度一個，而且冇嘢阻止兩個 map 指住同一個維度但用唔同設定。一個 map 由一個 `maps/<id>.conf` 檔案定義（`packages/config/src/schema/map.ts`），亦即係 [storage](#storage) 為佢存 [tile](#tile) 嗰樣嘢。

### 世界 (World)

一個 world 就係 BlueMap 讀取嘅 Minecraft 存檔資料夾 —— 即係入面有 `level.dat` 同 region 資料夾嗰個。World 永遠唔會被直接 render；被 render 嘅係一個指住佢其中一個[維度](#dimension)嘅 [map](#map)。想知 app 點樣搵到呢部電腦上面已經有嘅世界資料夾，睇 [Finding worlds](./finding-worlds.md)。

### 儲存 (Storage)

Storage 就係一個 map 嘅 [tile](#tile) render 完之後寫去邊：寫成磁碟上面嘅檔案（`file` storage），或者寫入 SQL 資料庫（`sql` storage，經 JDBC）。每個 map 喺 `storages/<id>.conf` 入面用 id 指名一個 storage。File storage 仲有一個「write tiles atomically」設定 —— 開咗嘅時候，tile 會先寫入暫存檔再搬到位，令讀取方唔會見到寫到一半嘅 tile；閂咗就慳返嗰次額外 rename，代價係偶然會讀到唔完整嘅內容（`packages/config/src/schema/storage.ts`）。

### 算繪 (Render)

Render 就係讀一個世界啲 chunk、再寫出 viewer 顯示嘅 [tile](#tile) 嗰個過程。佢可以喺呢部電腦行、喺 container 入面行、經 SSH 喺遠端機行、或者喺 GitHub 自己嘅 runner 上面行 —— 四條路徑嘅完整說明睇 [Running the engine on this computer, or in a container](./docker-and-local.md) 同 [Rendering a world in GitHub Actions](./render-in-actions.md)。

### 圖磚 (Tile)

一個 tile 就係已 render 地圖嘅其中一格方塊。**Hires** tile 係近距離嗰啲，帶住完整 3D 細節 —— 閂咗佢 render 快啲、地圖細啲，但放大之後就冇咗啲 3D 模型。**Lowres** tile 係壓平咗、遠距離用嘅，會建立幾個**細節層級 (levels of detail)**（有幾多層、每層比上一層粗幾多都可以調），令地圖遠處嘅部分載入得快。Hires tile 以方塊做單位計大細（預設 32）；lowres tile 以像素計（預設 500）（`packages/config/src/schema/map.ts` 入面嘅 `enable-hires`、`hires-tile-size`、`lowres-tile-size`、`lod-count` 同 `lod-factor` 欄位）。

### 地圖 ID (Map ID)

Map id 係一個 map 儲存同被引用時所用嘅短識別碼 —— 出現喺檔案路徑同 viewer 自己嘅 URL 入面 —— 同佢嘅顯示名唔同係兩樣嘢。[精靈](./finding-worlds.md)會由顯示名自動建議一個，但都可以自己打。

### 專案 (Project)

一個 project 係呢個 app 喺 Minecraft 世界資料夾根目錄寫低嘅一個 JSON 檔，入面裝住嗰個世界 render 時用嘅每一個 [map](#map)、[storage](#storage) 同設定。佢係呢個 app 自己發明嘅嘢，唔係 BlueMap 本身會讀嘅格式 —— 由 Projects 分頁開一個，就可以喺 render 開始之前改任何嘢，或者原封不動咁再 render 一次。

### 設定資料夾 (Config Folder)

一個 config folder 裝住 BlueMap 自己嘅 `.conf` 檔 —— `core.conf`、`maps/<id>.conf`、`storages/<id>.conf`、`webapp.conf`、`webserver.conf` 同 `plugin.conf` —— 即係 BlueMap 引擎直接讀嗰批檔案，同呢個 app 寫嘅 [project](#project) 檔案完全獨立。佢係經「Server configuration」掣入去，唔係經 Projects 分頁，而且兩樣嘢唔同：project 係呢個 app 自己記低要 render 咩；config folder 係 BlueMap 原生格式，即係你可以直接交畀一個 Minecraft server plugin 或者 `bluemap-cli.jar` 用，而佢哋完全唔需要知道呢個 app 嘅存在。

### 標記 (Marker)

一個 marker 就係畫喺已 render 地圖上面、帶標籤嘅一點或者一個形狀 —— 例如路標、警告、區域外框。Marker 會分組成**標記集 (marker sets)**，喺 viewer 入面可以成組顯示或者收埋，亦係成組咁切換、標示同排序（`packages/config/src/schema/map.ts` 嘅 `marker-sets` 欄位）。

### 維度 (Dimension)

一個 dimension 就係一個世界嘅其中一個 Minecraft 維度 —— Overworld、Nether 或者 End。一個世界可以有多過一個，每一個都有佢自己嘅 [map](#map)（`packages/config/src/schema/common.ts` 嘅 `DIMENSION_OPTIONS`）。

### 伺服器外掛 (Server Plugin)

Server plugin 設定（`plugin.conf`）淨係喺 BlueMap 以 server platform mod 嘅身分行喺 Minecraft server process 入面嗰陣先有作用。呢個桌面 app 永遠唔會咁行 —— 佢一路都係驅動 BlueMap 嘅獨立引擎 —— 所以 Server Plugin 分頁對喺呢度開始嘅 render 完全冇影響。佢仍然存在，係因為同一個 [config folder](#config-folder) 之後可以複製去一部真嘅 Minecraft server，喺嗰邊會有 platform adapter 真係讀佢（`packages/config/src/schema/plugin.ts`）。

### 算繪執行緒 (Render Threads)

Render threads 即係同時有幾多條 CPU 執行緒喺度 render tile（`render-thread-count`，預設 1）。Render thread priority（`render-thread-priority`，1 至 10，預設 5）決定佢哋相對機上其他嘢攞到幾多 CPU 時間。兩個都放喺 `core.conf`（`packages/config/src/schema/core.ts`）。

### 影響今次算繪 (Reaches This Render)

「Reaches this render」係精靈自己嘅講法，指嗰啲本機引擎真係會為緊接呢一次 render 讀取嘅設定。符合嘅只有六個：**world**、**dimension**、**name**、排序次序、起始位置同 storage。精靈收集嘅其他設定全部會寫入 map 嘅 config 檔，等將來嘅 render 攞嚟用，但唔會影響精靈行完即刻跑嗰次 render（`packages/ui/src/components/world/wizardSteps.ts` 嘅 `REQUEST_BACKED_PATHS`）。

### 引擎 (Engine)

Engine 就係行勻個世界再寫出 tile 嗰個程式。喺本機，佢就係 BlueMap 自己嘅 Java 引擎；第一次需要用嗰陣，Java runtime 會自動下載入呢個 app 自己嗰個被 git 忽略嘅資料夾，所以乜都唔使人手安裝。至於由零寫起嘅 TypeScript mesher，係另一件仲進行緊嘅嘢，唔係而家實際行緊嗰個。

### 設定檔組合 (Profile)

Profile 係呢個 app 自己畀「Maps and servers」入面一項嘢嘅叫法：可以係一個已經喺呢部電腦 render 咗嘅地圖，亦可以係人哋一個 BlueMap web server 嘅地址（即係一個 [BlueMap URL](#bluemap-url)）。本機 render 嘅地圖 render 完之後會自動加入清單；遠端嗰種就要人手加。

### BlueMap 網址 (BlueMap URL)

一個 BlueMap URL 就係一個已經喺第二度行緊嘅 BlueMap web server 嘅網址 —— 人哋部電腦，唔係呢部 —— 用嚟遠端睇佢個即時地圖。呢邊唔會為佢 render 任何嘢；加一個入去，淨係話畀 viewer 知去邊度睇。

### 算繪遮罩 (Render Mask)

Render mask 用一串形狀去限制一個世界入面實際會 render 邊啲方塊：可以係一個 **box**（軸對齊嘅長方體，喺每條軸畀最小同最大值 —— 預設形狀），或者一個 **circle**（喺 X/Z 平面上，Y 範圍可選）。每個形狀可以係加法或者減法，而 BlueMap 會將合併後遮罩以外嘅每一個方塊都當成空氣（`packages/config/src/schema/mask.ts`、`packages/config/src/schema/map.ts` 嘅 `render-mask` 欄位）。佢取代咗舊式嗰個扁平嘅 `min-x`/`max-x`/`min-z`/`max-z`/`min-y`/`max-y` 邊界盒，而 BlueMap 而家見到嗰種寫法會拒絕啟動。

### 設定檔 (Config Files)

一個 [config folder](#config-folder) 可以有嘅檔案：`core.conf`（資料夾、render 執行緒、更新時間、debug log 同匿名[統計](#metrics)開關）、`webapp.conf`（訪客見到咩、web app 產生喺邊）、`webserver.conf`（內建伺服器嘅 port、bind 地址同 access log）、`plugin.conf`（睇[伺服器外掛](#server-plugin)）、每個 [storage](#storage) 一個 `storages/<id>.conf`，同埋每個 [map](#map) 一個 `maps/<id>.conf`。

### 壓縮 (Compression)

即係 BlueMap 對佢寫入 [storage](#storage) 嘅 [tile](#tile) 所用嘅壓縮方式：`gzip`、`zstd`、`deflate`，或者唔壓。每個 tile 檔案嘅名都帶住佢寫出嗰陣用嘅壓縮方式，所以用一種設定寫出嘅 tile，換咗第二種設定就搵唔返（`packages/config/src/schema/storage.ts`）。

### SQL 儲存 (SQL Storage (JDBC))

一個 SQL [storage](#storage) 經 **JDBC connection URL** 連接（例如 `jdbc:mysql://localhost:3306/bluemap`），可選一個 **SQL dialect**（即係 BlueMap 用邊套 SQL 語句 —— 唔填嘅話，BlueMap 會按 URL 前綴自己揀對應嘅 dialect，如果一個都對唔上就拒絕啟動），另外對於 BlueMap 冇內附驅動嘅資料庫，仲可以指定 **driver jar** 同 **driver class**（`packages/config/src/schema/storage.ts`）。

### GitHub Runner 同 Actions (GitHub Runners And Actions)

[Rendering a world in GitHub Actions](./render-in-actions.md) 將成個 [render](#render) 交畀 GitHub 自己嘅免費建置機（即係佢嘅 **runners**），喺一個由一個或多個 **job** 組成嘅 GitHub **Actions workflow** 入面行。一個大世界可以同時拆去幾個 job（即係一個 **matrix**，按 region 將世界 **sharding**），之後再併返成一個地圖。當行緊呢個 app 嘅電腦自己 render 唔到嗰個世界嗰陣，就用得着。

### GitHub Pages 同發佈 (GitHub Pages And Publishing)

[Publishing a rendered map to GitHub Pages](./pages-hosting.md) 會將完成咗嘅 render 上載去一個 GitHub repository，再幫佢開啟 GitHub 自己嘅靜態網站寄存（**GitHub Pages**），噉個地圖就有一個公開 URL 可以睇到，你自己唔使行任何伺服器。

### 原子寫入 (Atomic Write)

睇 [Storage](#storage) —— 「write tiles atomically」係 file storage 逐個設定嘅一個選項，唔係一個獨立概念。

### Viewer 鏡頭模式 (Viewer Camera Modes)

已 render 地圖嘅 viewer 最多提供三種鏡頭模式，每個 map 都可以獨立開關：**free-flight** 視角（想飛去邊就去邊）、**perspective** 視角（第一或第三人稱行走）同 **flat** 視角（等角俯視 —— render 成本最平，因為閂晒其餘兩個、淨係留 flat 視角會令 render 快啲、地圖細啲）（`packages/config/src/schema/map.ts` 嘅 `enable-free-flight-view`、`enable-perspective-view` 同 `enable-flat-view` 欄位）。

### Webserver 綁定地址同存取記錄 (Webserver Bind Address And Access Log)

內建 web server 嘅**監聽地址**（`webserver.conf` 入面嘅 `ip`）決定佢綁去邊個網絡介面 —— `0.0.0.0`（預設）或者留空都係綁晒所有介面，即係任何路由得到呢部機嘅地方都連得到。佢嘅 **access log** 會記錄每一個請求，檔案同格式都可以設定，預設係閂咗（唔記錄）（`packages/config/src/schema/webserver.ts`）。

### 統計 (Metrics)

即係 BlueMap 自己嘅匿名使用回報：一行基本嘅實作同版本資料，如果 `core.conf` 入面「send anonymous usage metrics」開關維持開住（預設開），就會送去 BlueMap 專案（`packages/config/src/schema/core.ts`）。

### Mojang EULA 同下載同意 (Mojang EULA And Download Consent)

完整內容喺 [The Minecraft licence and the consent that refers to it](./eula-and-consent.md) —— 呢個係本 app 詞彙入面唯一一個喺呢份詞彙表出現之前，就已經有專文詳細解釋嘅部分。
