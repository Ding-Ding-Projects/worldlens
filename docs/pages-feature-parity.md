# GitHub Pages feature parity and responsive navigation

The current implementation now sits inside a ground-up Material Design 3 Expressive application
shell rather than the former append-ordered topbar. The shell has an explicit top app bar, adaptive
navigation surface, bounded content canvas and footer; its quick actions open Search, Notifications,
Settings and the `Ctrl+Shift+F` command palette. The Home page also includes twelve finite,
action-specific GIF walkthroughs with local reduced-motion stills. See
[the architecture](site/material-design-3-pages.md) and
[the animation inventory](site/action-walkthroughs.md).

The documentation site is a user-facing application, not a passive brochure. It ships the same
discoverability, customization, localization, accessibility, search, safety, and export contracts
that apply to the desktop interface wherever the browser platform can truthfully provide them.

## Behaviour

The default tab placement is the left edge. On a first visit at `720` CSS pixels or narrower, the
side navigation starts collapsed so it cannot consume nearly half of the content width. The brand
button and a minimum-size expand button remain visible. Activating the button expands the complete
tab rail; activating it again collapses the rail without moving keyboard focus away from the
control.

The control exposes `aria-controls`, `aria-expanded`, and a localized accessible name that changes
between **Collapse the side navigation** and **Expand the side navigation**. It is shown only for
left and right placements. Top and bottom placements stay fully visible because they are horizontal
tab strips, not side navigation.

The site keeps a hand-written global-feature inventory in
`design/packages/site/src/policy/globalFeatureCoverage.ts`. Every applicable requirement names its
implementation and verification files. Browser-platform exclusions remain in that list with a
specific public reason; they cannot silently disappear merely because no matching source file was
found.

## Configuration

Open **Settings → General → Navigation** and use:

- **Tab strip edge** to choose left, right, top, or bottom.
- **Collapse side navigation** to store an explicit collapsed or expanded choice.

A new compact visitor receives the responsive collapsed default. Once the visitor makes an explicit
choice, that choice persists across reloads and viewport sizes. Resetting the setting removes the
stored choice and returns to the responsive default. Moving the strip to the top or bottom temporarily
hides the collapse button without deleting the saved side-navigation state.

On a phone, expand the rail to reach tab management, search, grouping, pinning, bulk-close actions,
and page destinations, then collapse it to give the current page the maximum available width. The
command palette remains available through <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> whether the
rail is open or closed.

Settings can also be scheduled instead of being changed by hand every time. **Settings →
Schedules** creates versioned, bounded rules for language and appearance values. A rule can use a
local date/time/weekday window, a bounded JSON API, or a Home Assistant boolean entity. Cross-midnight
windows, equal start/end times, timezone selection, priority, later-rule precedence, base-value
recovery, import/export and append-only rule history are explicit rather than hidden heuristics.
See [Scheduled settings and external sources](scheduled-settings-and-external-sources.md).

Every panel class in the site inventory uses the same geometry controller. Settings and ordinary
tab panels resize; floating anchored panels and interactive overlays also drag by their header.
Geometry stays inside the viewport, persists per surface, resets visibly, and supports keyboard
move/resize controls. See [Resizable and draggable panel geometry](panel-geometry.md).

## Failure modes

- If browser storage is blocked or full, collapse and expand still work for the current page load,
  but the choice cannot survive a reload. The Settings page already reports that storage condition.
- A malformed stored value is ignored and the responsive default is used.
- Changing to a horizontal tab placement while the rail is collapsed never hides the horizontal
  strip. Returning to a side placement restores the prior side-navigation choice.
- JavaScript failing before the shell mounts leaves the ordinary startup failure surface; it never
  leaves an invisible navigation region intercepting input.
- At compact widths the main page is allowed to shrink (`min-width: 0`) while cards, controls, and
  overlays wrap or scroll internally. The layout must not create document-level horizontal overflow.
- A scheduled external source that times out, redirects outside its allowed boundary, exceeds the
  response limit, returns malformed JSON, or has no session token fails closed. The
  last safe base value remains active and a reviewable notification names the failed rule.
- Corrupt or out-of-range stored panel geometry is clamped to the current viewport instead of
  restoring an unreachable handle or off-screen body.

## Security considerations

The collapse choice is one boolean in the site's namespaced browser preferences. It is not sent over
the network, placed in a URL, or included in analytics. The site ships no analytics. Collapsing the
rail changes presentation only: it does not close pages, change tab order, modify groups, or discard
queries.

The feature-parity inventory contains source paths and public reasons only. It contains no host,
credential, account, or private-infrastructure details.

External schedule rules store only a stable non-secret lookup key. A Home Assistant token is entered
through a password field, held only in memory for that page session, and cleared on reload, page
close, or either clear action; it never enters storage, exports, URLs or logs. API sources are
restricted to HTTPS or loopback, validate redirects and response size, apply an eight-second timeout,
and bound their polling interval. Home Assistant sources accept only `input_boolean` and
`binary_sensor` entities. An `off` entity falls through to the next matching rule; unavailable or
authentication failures restore the base layer instead of silently granting fallback authority.

## Verification

- `SidebarNavigation.test.ts` covers compact and wide defaults, persistence, reset, notification,
  left/right collapse and expansion, horizontal placement, accessible state, and focus retention.
- `globalFeatureCoverage.test.ts` checks the exact hand-written requirement list, the existence of
  every implementation and verification file, and a substantial reason for each explicit browser
  exclusion.
- Site typecheck and production build run before compact runtime proof. The committed driver is
  `design/packages/site/scripts/compact-proof.mjs`; it talks to the isolated browser target through
  Chrome DevTools Protocol without using the visitor's browser profile, foreground window, pointer,
  or keyboard.
- Compact proof covers Home, Settings, Schedules/external sources, Search/regex, command-palette
  teleport, appearance, notification history, changelog/date filtering, tab/group menus, and
  exports/bulk actions. It uses `360×640@1`, `390×844@1`, `414×896@1`, desktop `1024×768@1`, and
  bilingual `390×844@2` states.
- The driver records every candidate overflow element instead of truncating the list. Each one is
  classified as an accidental clip or a deliberate internal scroller; an accidental result fails
  the run. Schema version 2 also verifies both toggle inversions, both localized label changes, the
  exact final collapse state, toggle visibility, hidden navigation state, `aria-controls`, focus
  retention, minimum 44 CSS-pixel targets, scenario identity and the requested viewport.
- Eighteen machine-readable records are under `docs/runtime-proof/pages-parity-*.json`; fourteen
  matching real rendered captures are under `docs/screenshots/pages-parity-*.png`. Every record
  reports zero accidental clipping and zero undersized targets. The two appearance records also
  prove zero horizontal overflow and zero out-of-bounds descendants inside the editor itself.
- `compactProofSchema.test.ts` validates all 18 committed records and proves that a legacy or
  incomplete record is rejected.
- `schedule.test.ts`, `scheduleHomeAssistant.integration.test.ts`, and `schedulePanel.test.ts`
  cover the engine, real loopback Home Assistant states, secret non-persistence, and guided editor.
  `PanelGeometry.test.ts` constructs every declared transient owner—including the `menu` role—and
  rejects a null controller or non-floating geometry.
- Publication is not proven by a local build. The integration owner records the exact default-branch
  commit, Pages workflow run, and live URL after deployment.

## Suggested articles

- [Browser-style tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)
- [Appearance editors](appearance-editors.md)
- [Language and tone](language-and-tone.md)
- [Notification centre](notification-centre.md)
- [Scheduled settings and external sources](scheduled-settings-and-external-sources.md)
- [Resizable and draggable panel geometry](panel-geometry.md)

## 廣東話

### GitHub Pages 功能對等同響應式導覽 (GitHub Pages feature parity and responsive navigation)

而家嘅實作已經放喺一個由零起嘅 Material Design 3 Expressive 應用程式外殼入面，唔再係以前嗰個按 append 次序排嘅 topbar。個外殼有明確嘅 top app bar、適應式導覽界面、有邊界嘅內容畫布同 footer；佢啲快速動作可以開 Search、Notifications、Settings 同埋 `Ctrl+Shift+F` 嘅 command palette。Home 版仲有十二段有限長度、針對個別動作嘅 GIF 示範，並附本機嘅 reduced-motion 靜態圖。睇 [the architecture](site/material-design-3-pages.md) 同 [the animation inventory](site/action-walkthroughs.md)。

份文件網站係一個面向用家嘅應用程式，唔係一份被動嘅宣傳單張。只要瀏覽器平台真係做得到，佢就會同桌面介面一樣，遵守同一套可發現性、自訂、本地化、無障礙、搜尋、安全同匯出嘅承諾。

### 行為

分頁條預設擺喺左邊。喺 `720` CSS 像素或者更窄嘅畫面第一次到訪時，側邊導覽會一開始就摺埋，唔會食咗差唔多一半內容闊度。品牌掣同一個最細尺寸嘅展開掣仍然睇得見。撳個掣會展開完整嘅 tab rail；再撳一次就摺返，而且唔會將鍵盤焦點由嗰個控制度移走。

嗰個控制帶住 `aria-controls`、`aria-expanded`，同埋一個會喺 **Collapse the side navigation** 同 **Expand the side navigation** 之間變嘅本地化 accessible name。佢淨係喺左邊同右邊擺位嗰陣先會出現。頂同底嘅擺位就一路完全顯示，因為嗰啲係橫向分頁條，唔係側邊導覽。

網站喺 `design/packages/site/src/policy/globalFeatureCoverage.ts` 保留一份人手寫嘅全域功能清單。每一項適用要求都要指名佢嘅實作同驗證檔案。因瀏覽器平台限制而排除嘅項目，仍然要留喺清單入面並附一個具體嘅公開理由；佢哋唔可以淨係因為搵唔到對應原始碼檔案就靜靜雞消失。

### 設定

打開 **Settings → General → Navigation**，可以用：

- **Tab strip edge** 揀左、右、上或者下。
- **Collapse side navigation** 儲低一個明確嘅摺埋或者展開選擇。

一個新嘅窄畫面訪客會攞到響應式嘅預設摺埋狀態。一旦訪客做咗明確選擇，嗰個選擇就會跨 reload 同跨畫面尺寸保留住。重設呢個設定會移除已儲存嘅選擇，返去響應式預設。將分頁條搬到上面或者下面，會暫時收起摺疊掣，但唔會刪走已儲存嘅側邊導覽狀態。

喺手機上面，展開 rail 就可以用到分頁管理、搜尋、分組、釘住、批量關閉動作同各版面目的地，然後摺返佢，畀當前頁面攞到最大可用闊度。無論 rail 開定閂，command palette 都一直用 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> 去到。

設定亦可以排程，唔使每次都人手改。**Settings → Schedules** 可以為語言同外觀嘅值建立有版本、有邊界嘅規則。一條規則可以用本地日期／時間／星期嘅時段、一個有邊界嘅 JSON API，或者一個 Home Assistant 布林 entity。跨午夜嘅時段、起訖時間相同、時區選擇、優先次序、後定規則優先、回復基礎值、匯入／匯出，以及只增不改嘅規則歷史，全部都係明文規定，唔係暗藏嘅啟發式判斷。詳情睇 [Scheduled settings and external sources](scheduled-settings-and-external-sources.md)。

網站清單入面每一類 panel 都用同一個 geometry controller。Settings 同普通分頁 panel 可以改大細；浮動錨定 panel 同互動式 overlay 仲可以拉住 header 拖。幾何位置一定留喺 viewport 之內、逐個界面持久化、重設時睇得見，並且支援鍵盤移動／改大細嘅控制。睇 [Resizable and draggable panel geometry](panel-geometry.md)。

### 失效情況

- 如果瀏覽器儲存被封鎖或者滿咗，摺埋同展開喺當前呢次頁面載入仍然用得，不過個選擇捱唔過一次 reload。Settings 版已經會報告嗰個儲存狀況。
- 格式錯嘅已存值會被忽略，改用響應式預設。
- 喺 rail 摺埋緊嗰陣轉去橫向分頁擺位，永遠唔會令橫向分頁條消失。轉返側邊擺位就會還原之前嘅側邊導覽選擇。
- 如果 JavaScript 喺外殼掛載之前就掛咗，出嘅係普通嘅啟動失敗界面；佢永遠唔會留低一個隱形嘅導覽區域喺度截住輸入。
- 喺窄闊度之下，主頁面容許縮細（`min-width: 0`），而啲卡、控制同 overlay 會自己換行或者內部捲動。版面唔可以造成文件層級嘅橫向 overflow。
- 一個排程用嘅外部來源如果逾時、重新導向去咗容許邊界以外、超出回應大細上限、回傳畸形 JSON，或者根本冇 session token，就會 fail closed。最後一個安全嘅基礎值繼續生效，並且會有一個可翻查嘅通知指名邊條規則失敗。
- 損壞或者超出範圍嘅已存 panel 幾何值，會夾返入當前 viewport，唔會還原成一個掂唔到嘅拉手或者一個喺畫面外嘅主體。

### 安全考量

摺疊選擇淨係網站命名空間瀏覽器偏好入面嘅一個布林值。佢唔會經網絡送出、唔會擺入 URL、亦唔會放入分析。呢個網站根本冇任何分析。摺埋 rail 只影響呈現：佢唔會關閉頁面、唔會改分頁次序、唔會改動群組，亦唔會掉走查詢。

功能對等清單淨係包含原始碼路徑同公開理由。入面冇任何 host、憑證、帳戶或者私有基建嘅資料。

外部排程規則淨係儲存一個穩定、非秘密嘅查找 key。Home Assistant token 係經密碼欄位輸入，只喺該次頁面 session 嘅記憶體入面持有，喺 reload、關頁或者任何一個清除動作之後就清走；佢永遠唔會入儲存、匯出、URL 或者 log。API 來源只限 HTTPS 或者 loopback，會驗證重新導向同回應大細，套用八秒逾時，並且限制輪詢間隔。Home Assistant 來源只接受 `input_boolean` 同 `binary_sensor` entity。Entity 係 `off` 就會跌落去下一條符合嘅規則；至於不可用或者認證失敗，就會還原基礎層，唔會靜靜雞畀咗 fallback 權限出去。

### 驗證

- `SidebarNavigation.test.ts` 覆蓋窄同闊嘅預設、持久化、重設、通知、左右兩邊嘅摺埋同展開、橫向擺位、無障礙狀態同焦點保持。
- `globalFeatureCoverage.test.ts` 檢查嗰份人手寫嘅要求清單完全一致、每個實作同驗證檔案真係存在，以及每個明確嘅瀏覽器排除項都有一個實質理由。
- 喺做窄畫面 runtime 證明之前，會先行網站 typecheck 同 production build。已提交嘅 driver 係 `design/packages/site/scripts/compact-proof.mjs`；佢經 Chrome DevTools Protocol 同一個隔離嘅瀏覽器目標溝通，唔會用到訪客嘅瀏覽器 profile、前景視窗、指標或者鍵盤。
- 窄畫面證明覆蓋 Home、Settings、Schedules／外部來源、Search／regex、command palette teleport、外觀、通知歷史、changelog／日期篩選、分頁與群組選單，以及匯出／批量動作。用嘅狀態係 `360×640@1`、`390×844@1`、`414×896@1`、桌面 `1024×768@1`，同雙語嘅 `390×844@2`。
- 個 driver 會記錄每一個候選 overflow 元素，唔會截短張清單。每一個都會歸類為意外裁切定係刻意嘅內部捲動器；一有意外結果就當該次執行失敗。Schema version 2 仲會驗證兩個方向嘅切換反轉、兩種語言嘅標籤變化、最終摺疊狀態係咪完全正確、切換掣可見性、導覽隱藏狀態、`aria-controls`、焦點保持、最少 44 CSS 像素嘅點擊目標、情境身分同所要求嘅 viewport。
- 十八份機器可讀嘅紀錄放喺 `docs/runtime-proof/pages-parity-*.json`；十四張對應嘅真實渲染截圖放喺 `docs/screenshots/pages-parity-*.png`。每一份紀錄都報告零意外裁切、零過細嘅點擊目標。兩份外觀紀錄仲證明咗編輯器本身入面零橫向 overflow、零超出邊界嘅子元素。
- `compactProofSchema.test.ts` 驗證全部 18 份已提交紀錄，並且證明一份舊式或者唔完整嘅紀錄會被拒。
- `schedule.test.ts`、`scheduleHomeAssistant.integration.test.ts` 同 `schedulePanel.test.ts` 覆蓋引擎、真實 loopback 嘅 Home Assistant 狀態、秘密唔會持久化，同引導式編輯器。`PanelGeometry.test.ts` 會建構每一個宣告過嘅 transient owner（包括 `menu` role），並且拒絕 null controller 或者非浮動嘅幾何。
- 發佈唔可以靠本機 build 去證明。整合負責人要喺部署之後記錄確切嘅 default-branch commit、Pages workflow run 同實際線上 URL。

### 建議文章

- [Browser-style tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)
- [Appearance editors](appearance-editors.md)
- [Language and tone](language-and-tone.md)
- [Notification centre](notification-centre.md)
- [Scheduled settings and external sources](scheduled-settings-and-external-sources.md)
- [Resizable and draggable panel geometry](panel-geometry.md)
