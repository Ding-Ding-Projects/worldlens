# Server-hosted Material 3 map UI

The browser-facing BlueMap viewer now mounts a Material 3 shell around the map canvas. The
shell is intentionally framework-neutral so the same built viewer can be served by the CLI's
static handler or embedded by the desktop application.

## Included controls

- Responsive M3 app bar with search, settings, and command-palette entry points.
- Persisted light/dark theme, density, and per-language funny-level controls. Funny styling only
  changes notification voice; map coordinates and errors remain factual.
- Keyboard-visible focus rings, touch-sized controls, contrast-safe surface tokens, and a compact
  mobile layout.
- Right-click on loaded terrain opens an anchored M3 context menu. **Add pinpoint here** stores a
  local coordinate record and renders a labelled pinpoint at the clicked screen location. Copying
  coordinates and cancelling are available from the same menu.

## Storage and security

Theme, density, message style, and pinpoints use the browser's local storage under `bluemap-*`
keys. No network request is made by the shell and no remote scripts, fonts, images, or analytics
are required. The server's existing static handler remains responsible for path confinement and
ETag handling.

## Verification

`packages/viewer/src/materialShell.test.ts` verifies shell mounting, theme persistence, anchored
context-menu behaviour, coordinate storage, and pinpoint rendering. Build the dependency order
with `pnpm --dir design --filter @worldlens/shared build` followed by
`pnpm --dir design --filter @worldlens/viewer build`.

### Suggested articles

- [Tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)
- [Appearance editors](appearance-editors.md)

## 廣東話

### 由伺服器 host 嘅 Material 3 地圖介面（Server-hosted Material 3 map UI）

畀瀏覽器用嗰個 BlueMap viewer 而家喺地圖 canvas 外面掛咗一個 Material 3 外殼。呢個外殼係刻意做到唔綁任何 framework 嘅，咁樣同一個 build 出嚟嘅 viewer 就可以由 CLI 嘅 static handler 伺服，或者畀桌面 application 內嵌。

### 包含嘅控制項

- 響應式 M3 app bar，帶搜尋、設定同 command palette 嘅入口。
- 會記住嘅光／暗主題、密度，同埋逐語言嘅 funny-level 控制項。Funny 風格淨係改變通知嘅語氣；地圖座標同錯誤訊息維持事實陳述。
- 鍵盤操作睇得見嘅 focus ring、觸控尺寸嘅控制項、對比安全嘅 surface token，同埋一個 compact 嘅手機版佈局。
- 喺已載入嘅地形上面撳右鍵會開一個定位喺該處嘅 M3 內容選單。**Add pinpoint here** 會存低一個本機座標紀錄，並喺撳嗰個螢幕位置畫一個有標籤嘅 pinpoint。複製座標同取消都喺同一個選單度。

### 儲存同保安

主題、密度、訊息風格同 pinpoint 都用瀏覽器嘅 local storage，key 喺 `bluemap-*` 底下。呢個外殼唔會發任何網絡請求，亦唔需要任何遠端 script、字型、圖片或者 analytics。伺服器現有嗰個 static handler 繼續負責路徑封閉（path confinement）同 ETag 處理。

### 驗證

`packages/viewer/src/materialShell.test.ts` 驗證外殼掛載、主題持久化、定位式內容選單行為、座標儲存同 pinpoint 繪製。要按依賴次序 build，就先行 `pnpm --dir design --filter @worldlens/shared build`，跟住行 `pnpm --dir design --filter @worldlens/viewer build`。

#### 建議文章

- [Tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)
- [Appearance editors](appearance-editors.md)
