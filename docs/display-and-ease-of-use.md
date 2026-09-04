# Display and ease of use

One settings tab for the two choices a person makes with their eyes rather than with their
workflow: how big the whole interface is drawn, and whether it is dark, light, high-contrast, or
follows the computer. Both controls exist for the person least equipped to go hunting for them -
a child, an older reader, anyone on a dense panel who finds 14px chrome too small to read or too
fiddly to click - so both are one tab into Settings, offered as labelled buttons rather than free
fields, and surfaced as their own card on Home.

The code is `design/packages/ui/src/components/settings/uiSizeSetting.ts` and `UiSizeRow.vue` for
the size dial, `themeSetting.ts` and `ThemeRow.vue` for the theme, and the section itself in
`AppSettings.vue` under the `display` anchor.

## Settings dialog layout

Every card in Settings, this one included, shares one M3 anatomy defined once in
`SettingsSection.vue` rather than each screen inventing its own spacing: 24px card padding, a
16px internal rhythm, a title drawn from the `title-medium` type role and a description from
`body-medium`, and a hairline divider between stacked cards drawn from the
`--md-sys-color-outline-variant` token so it survives every theme without a hand-mixed grey. The
same file exports an `.mb-setting__row` utility - a 56px-minimum M3 list-item grid with an
optional leading-icon column, a content column, an optional trailing-control column, and a state
layer drawn from the M3 hover/pressed opacity tokens - for any card whose body is a stack of
simple rows rather than one free-form control; the settings search-match list in `AppSettings.vue`
uses it today.

The dialog's own tab strip is the master pane of an M3 list-detail layout: docked to the left edge
by default (`TabbedNavigation`'s own `DEFAULT_TAB_PLACEMENT`), `aria-orientation="vertical"`, with
arrow keys moving along that axis. Only the active tab's section is ever mounted.

**Narrow windows.** At and below a 320px window, the strip's fixed minimum width used to leave the
detail pane so little room that a title with `overflow-wrap: anywhere` broke every character onto
its own line rather than wrapping at word boundaries - found and fixed by driving the real
packaged app through the cheap Lowlevel headless route at that exact width. Below a 22.5rem
viewport the strip's floor drops to 5.5rem so the detail pane keeps a legible width; both panes
still shrink and wrap rather than opening a second, horizontal scroll axis. Verified clean at
320px and at the dialog's normal desktop width, in English and in bilingual mode, and in both the
dark and light themes.

## Behaviour

### The interface size dial

| Setting | Values | Default | Stored under |
|---|---|---|---|
| Interface size | level 1 to 5 → 100 / 125 / 150 / 175 / 200% | 1 (100%) | `worldlens.display.uiSize` |

Five stops, deliberately the same scale points the project's own sizing rule already requires
every layout to hold at ("layouts that hold at 100/125/150/200% scale"), plus the 175 midpoint.
Nothing below 100%: a dial that can make the interface smaller is a dial that can only be escaped
by finding the now-tiny control that changes it back.

The change applies live - the buttons themselves grow the moment one is pressed, which is both
the honest preview and the reassurance that the control that undoes a choice grows along with
everything else - and it is applied again at every launch, before the first frame, by
`installUiSize()` in `main.ts`.

**How the scale is actually applied.** In the desktop shell, through the preload's `setUiZoom`,
which calls Chromium's own `webFrame.setZoomFactor` - the identical mechanism behind Ctrl+plus in
a browser. That route scales the map canvas's device pixel ratio along with the chrome, so the
three.js viewer re-renders crisp rather than being stretched. In a browser tab, where there is no
preload, the standard CSS `zoom` property on the document root is the fallback; the map is
upscaled rather than re-rendered there, the same trade every plain web page makes under browser
zoom. The bridge is feature-detected per call, so a released shell older than this renderer gets
the CSS fallback rather than a thrown error.

**Why this exists beside the appearance editor.** The appearance editor can already resize any
text the app renders, per element or globally, and that is the right tool for taste. It is the
wrong tool for "I cannot read this": it reaches only the elements wrapped in an appearance
target, it leaves icons, paddings and click targets at their designed size, and it asks somebody
who is struggling to see the interface to operate that same interface's most detailed editor
first. The dial scales everything at once - text, icons, buttons, the click targets themselves,
and the map.

### The theme, reachable without a map

| Setting | Values | Default | Stored under |
|---|---|---|---|
| Theme | follow the system, `dark`, `light`, `contrast` | follow the system | `bluemap-theme` |

The viewer has always offered this choice in its own settings menu, and that menu only exists
while a map is open - so the person who had not rendered anything yet, exactly the person setting
the app up to their eyes, had no theme control at all. The settings row is the same choice
against the same stored record: it writes the viewer's own `bluemap-theme` localStorage entry in
the viewer's own JSON encoding, so the two controls can never disagree about what was chosen.

**The stored record is the only authority, and it changes only when somebody chooses.** Every
control that offers a theme - the settings row, the in-map settings menu, the command palette's
viewer settings - calls `changeTheme()`, which writes the record. `themeSetting.ts`'s module watcher
then pushes that record into whatever viewer is live.

It used to be the other way around: while a viewer was live its `appState.theme` was authoritative,
and any change to it was mirrored back out into the record. That could not tell a person choosing a
theme from the viewer resolving one of its own, and the viewer does resolve one - a decorative shell
inside it falls back to `light` when no record exists, and writes it unencoded, so reading it back
throws and yields the bare string. A profile on which nobody had ever chosen anything therefore
ended up holding an explicit `light`, honoured forever after, with `null` - meaning *follow the
system* - destroyed silently.

- A viewer that has wandered off the record is pushed back onto it, every time rather than once when
  it first appears. That matters because the viewer loads its own persisted settings *after* it is
  in the store, so its startup arrives looking exactly like a change made inside the running app.
- A choice made in the in-map menu survives the app being torn down on a profile switch, because the
  record was written the moment the button was pressed rather than mirrored out afterwards.
- A change made inside the in-map menu is mirrored back out to the stored record, so it survives
  the viewer being torn down on a profile switch.

`useBlueMapTheme` - the bridge that maps the choice onto the Vuetify MD3 theme - reads the live
app first and the stored choice when there is no app, so a theme chosen before the first map is
ever rendered reaches the chrome it was chosen for.

### Search, palette, Home

The section is declared in `SETTINGS_SECTIONS`, so it arrives everywhere that list already
reaches with no further wiring: the settings surface's own search indexes the five stop labels,
the four theme names and the live values (the current percentage, the current theme), the command
palette lists the section with the same title and description the tab renders, and Home carries a
card for it in **Settings and tools** - directly after Settings itself, because it is the tile
for the person least equipped to go looking.

## Verification

`uiSizeSetting.test.ts` proves the stops, the persistence round-trip (including a corrupted
stored value falling back to the default rather than throwing), the bridge-first application and
the CSS fallback, and that the designed size removes the CSS zoom entirely rather than writing
`zoom: 1`. `themeSetting.test.ts` proves the stored record is byte-compatible with the viewer's
own, the push into a fresh app, the leave-alone when the app already agrees, and the mirror back
out. `UiSizeRow.test.ts` and `ThemeRow.test.ts` prove the buttons genuinely resize the document
and rewrite the shared record rather than merely looking pressed, and that the size row's own
toggle wraps instead of clipping - the control built to fix sizing failures must not ship one.
`AppSettings.test.ts` proves the section has its own tab, mounts the real controls, resizes the
interface from a mounted surface, and is found by the surface's search under a stop label and a
theme name.

## 廣東話

### 顯示同易用度(Display and ease of use)

一個設定分頁,淨係管兩樣用眼揀、而唔係用工作流程揀嘅嘢:成個介面畫幾大,同埋佢係深色、淺色、高對比,定係跟電腦。兩個控制都係為咗最冇能力周圍搵設定嘅人而設——細路、年紀大嘅讀者、或者喺高密度屏幕上覺得 14px 嘅介面太細、睇唔到又㩒唔中嘅人——所以兩個都係入 Settings 一個分頁就到,用有標籤嘅按鈕而唔係自由輸入欄,而且喺 Home 有自己嘅卡片。

代碼喺 `design/packages/ui/src/components/settings/uiSizeSetting.ts` 同 `UiSizeRow.vue`(大細轉盤)、`themeSetting.ts` 同 `ThemeRow.vue`(主題),個 section 本身喺 `AppSettings.vue` 嘅 `display` anchor 下面。

### 行為(Behaviour)

#### 介面大細轉盤(interface size dial)

「Interface size」設定有五級(level 1 至 5),對應 100 / 125 / 150 / 175 / 200%,預設係 1(100%),儲存喺 `worldlens.display.uiSize`。五個定點刻意同項目自己嘅 sizing 規則已經要求每個 layout 守住嘅刻度一致("layouts that hold at 100/125/150/200% scale"),再加 175 呢個中間點。冇低過 100% 嘅選項:一個可以將介面縮細嘅轉盤,只可以靠搵返嗰個而家已經變到好細嘅控制先救得返。

改動即時生效——㩒一下,啲按鈕自己即刻放大,呢個係最誠實嘅預覽,亦令人放心:用嚟改返轉頭嘅控制會同其他所有嘢一齊放大——而且每次啟動、喺第一個 frame 之前,`main.ts` 入面嘅 `installUiSize()` 會再套用一次。

**個 scale 實際點樣套用。** 喺 desktop shell,經 preload 嘅 `setUiZoom`,呼叫 Chromium 自己嘅 `webFrame.setZoomFactor`——同瀏覽器入面 Ctrl+plus 背後一模一樣嘅機制。呢條路會將地圖 canvas 嘅 device pixel ratio 同 chrome 一齊放大,所以 three.js viewer 係重新 render 得清晰,而唔係俾人拉大。喺瀏覽器分頁,冇 preload,就 fallback 用標準 CSS `zoom` property 落喺 document root;嗰度地圖係放大而唔係重新 render,同任何普通網頁喺瀏覽器 zoom 之下嘅取捨一樣。個 bridge 每次呼叫都會 feature-detect,所以一個舊過呢個 renderer 嘅已發佈 shell 會攞到 CSS fallback,而唔係一個掟出嚟嘅 error。

**點解喺 appearance editor 之外仲要有呢樣嘢。** appearance editor 本身已經可以逐個 element 或者全局噉改 app render 嘅任何文字大細,嗰個係啱品味用嘅工具。但佢唔啱「我睇唔到呢啲字」:佢只掂到包咗 appearance target 嘅 element,icon、padding 同 click target 全部維持設計大細,而且要求一個連介面都睇唔清嘅人先去操作呢個介面最複雜嘅編輯器。個轉盤一次過放大所有嘢——文字、icon、按鈕、click target 本身,連埋幅地圖。

#### 唔使開地圖都揀到嘅主題(theme)

「Theme」設定有四個選項:跟系統(預設)、`dark`、`light`、`contrast`,儲存喺 `bluemap-theme`。

Viewer 一直都喺自己嘅設定選單度提供呢個選擇,但嗰個選單只喺開咗地圖嗰陣先存在——所以仲未 render 過任何嘢嘅人,即係正正想校啱隻 app 畀自己對眼嘅人,以前完全冇主題控制。Settings 嗰行係同一個選擇、寫落同一個儲存紀錄:佢用 viewer 自己嘅 JSON 編碼寫 viewer 自己嘅 `bluemap-theme` localStorage 項,所以兩個控制永遠唔會對「揀咗乜」有分歧。

**儲存紀錄係唯一權威,而且只會喺有人揀嘅時候先改。** 每個提供主題嘅控制——settings 行、地圖入面嘅設定選單、command palette 嘅 viewer settings——都係呼叫 `changeTheme()` 去寫個紀錄。之後 `themeSetting.ts` 嘅 module watcher 將個紀錄推入當時活躍嘅 viewer。

以前係掉轉嘅:viewer 活躍嗰陣佢嘅 `appState.theme` 話事,任何改動都 mirror 返出去個紀錄。噉樣分唔到「有人揀主題」同「viewer 自己 resolve 咗一個」——而 viewer 真係會 resolve:佢入面一個裝飾性嘅 shell 喺冇紀錄嗰陣會 fallback 做 `light`,而且寫落去唔經編碼,讀返嚟會 throw,得返個淨字串。所以一個從來冇人揀過任何嘢嘅 profile,最後會揸住一個明確嘅 `light`,之後永遠照跟,而 `null`(即係*跟系統*)就俾人靜靜哋摧毀咗。

- 一個偏離咗紀錄嘅 viewer 會俾人推返上紀錄,每一次都推,唔係只喺佢初次出現嗰陣推一次。呢點重要,因為 viewer 係入咗 store *之後*先載入自己持久化嘅設定,所以佢啟動嗰下望落同 app 運行中嘅改動一模一樣。
- 喺地圖選單入面做嘅選擇,喺 profile 切換令成個 app 被拆走之後仲保得住,因為個紀錄係㩒掣嗰一刻就寫低,唔係事後先 mirror 出嚟。
- 喺地圖選單入面嘅改動會 mirror 返出去儲存紀錄,所以 viewer 喺 profile 切換被拆走之後都保得住。

`useBlueMapTheme`——將呢個選擇對應上 Vuetify MD3 主題嘅 bridge——先讀活躍嘅 app,冇 app 就讀儲存嘅選擇,所以喺第一幅地圖 render 之前揀嘅主題,都會到達佢本來想影響嘅 chrome。

#### 搜尋、palette、Home

個 section 喺 `SETTINGS_SECTIONS` 宣告,所以嗰個 list 已經到達嘅地方佢全部自動有,唔使再駁線:settings surface 自己嘅搜尋會索引五個檔位標籤、四個主題名同即時數值(而家嘅百分比、而家嘅主題),command palette 用同分頁一樣嘅標題同描述列出呢個 section,Home 喺 **Settings and tools** 度為佢擺咗一張卡——就喺 Settings 本身之後,因為呢張正係畀最冇能力去搵嘅人嘅 tile。

### 驗證(Verification)

`uiSizeSetting.test.ts` 證明五個檔位、持久化 round-trip(包括壞咗嘅儲存值 fallback 返預設而唔係 throw)、bridge 優先套用同 CSS fallback,仲有設計大細會將 CSS zoom 成個移除而唔係寫 `zoom: 1`。`themeSetting.test.ts` 證明儲存紀錄同 viewer 自己嗰份 byte 級兼容、推入一個新 app、app 已經一致嗰陣唔郁佢、同埋 mirror 返出去。`UiSizeRow.test.ts` 同 `ThemeRow.test.ts` 證明啲掣真係改到 document 大細、真係重寫共享紀錄,唔係淨係扮㩒咗,仲有 size row 自己嘅 toggle 會換行而唔係被切走——為咗修理 sizing 問題而設嘅控制,唔可以自己都有 sizing 問題。`AppSettings.test.ts` 證明個 section 有自己嘅分頁、mount 真嘅控制、可以由一個 mounted surface 度改介面大細,而且用檔位標籤同主題名喺 surface 嘅搜尋度都搵得到。
