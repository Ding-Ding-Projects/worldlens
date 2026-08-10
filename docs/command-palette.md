# The command palette

One keystroke opens a list of everything the application can do, and typing the name of a thing
is enough to reach it. The rows that are settings carry the setting's real control, so changing
one in the palette is the same act, through the same write path and the same persistence, as
changing it on the surface it lives on.

The code is `design/packages/ui/src/components/palette/`. The shell mounts exactly one
`CommandPalette` and binds the shortcut to the same ref.

## Behaviour

### Three kinds of row, and the difference is a type rather than a convention

`paletteItems.ts` defines `PaletteItem` as a union of three shapes, which is what keeps the
project's rule against decorative controls checkable here rather than aspirational.

| Kind | What it is | What it must carry |
|---|---|---|
| `command` | Does its one thing and the palette closes. | `run()` |
| `setting` | Holds the live control: a switch, a bounded number box, or a pick from a list. | `control`, whose `set` performs the write *and* its persistence |
| `destination` | Opens a surface. | `where`, a plain sentence naming what will appear, and `go()` |

A builder that cannot produce a working control for something cannot dress it up as one: it has
to demote the row to a `destination` and say where that goes, in the type. There is deliberately
no free-text control. Every free-text setting in this application (the map storage folder, a
world path) is validated against the filesystem and offers a browse button, which a single row
cannot honestly reproduce, so those are destinations.

### Nothing here keeps its own list

Every row is derived from the registry that already describes the thing, so a list cannot fall
behind the surface it describes:

- the application settings surface publishes `SETTINGS_SECTIONS` and `sectionCopy()`, so its
  sections arrive with the titles and explanations they render with, in the current language;
- the options editor publishes `SCREENS`, so its seven settings tabs arrive with their own labels.
  Its eighth tab, History, holds revisions rather than settings and is therefore not in that
  list; it is published as a destination of its own, because the tab somebody is most likely to
  hunt for by name must be findable by typing it;
- the running viewer publishes its settings on `BlueMapApp`, which is where `viewerSettings.ts`
  reads and writes them.

The one thing that is *not* derived from a registry in this package is the shell's tab strip,
because the strip belongs to the shell. It is handed down instead, as `pages`, so the palette
still cannot keep a list of its own. A page the catalogue has never heard of still gets a row and
still teleports; `PAGE_NOTES` only supplies the better sentence and the extra search words where
one is known, so a page added to the strip is reachable on the same commit rather than on the
commit somebody remembers to describe it.

Groups are listed in catalogue order rather than sorted: the shell's own overlays, then the pages
of the tab strip, then the chrome around those pages, then the application's settings and the
look of them, then the server configuration screens, then the viewer's menu pages, then the
viewer settings that are live controls here, and the palette's own size last. Sorting would
replace that judgement with the accident of what the groups happen to be called in the active
language.

### What it reaches, and what it does not

Stated as a list rather than as "everything", because the rule the palette is measured against
asks for every command, page, destination, setting and appearance control, and the honest answer
has two columns.

| Reachable, and teleported to | How it lands |
|---|---|
| Every page of the shell's tab strip | The strip's own `revealPage`, exactly as clicking the tab does |
| The application settings surface, per section | Emits the render-failure flow's `SettingsTarget`; the surface scrolls to the row, focuses it and outlines it |
| All seven options-editor tabs, and its History tab | `ConfigScreen`'s `initialScreen` |
| The viewer's menu pages: maps, settings, info, markers, players | `menu.openPage`, the menu's own call |
| The notification centre, the tab finder | A reveal request; the owning component opens itself, with its own focus handling |
| The changelog viewer | Opens the viewer's Info page, then expands and scrolls to the fold |
| The licence panel and "what is this?" | The shell opens the docked panel it already mounts (`EulaSurface` / `WelcomeSurface`) - the same panels Home's own cards open. These rows are what keeps each panel reachable from any screen now that neither has a permanent corner button. |
| The server list, on a shell with no tab strip | `openProfiles` |

| Listed and searchable, but not teleported into | Why |
|---|---|
| The per-element appearance editors | Each one is anchored to the element it edits and opened from that element's own context menu, so there is no such thing as opening the typography editor without an element to anchor it to. The row is a `destination` that names the route — right-click, or Shift+right-click — rather than a command that would have to invent a target. |
| The render console, the release downloads, the project editor, the backup and Pages panels | Each lives inside a page, and the page is the reachable unit. The page rows carry their words as keywords, so "console", "download" and "publish" all find the page that holds them, and the row says which page rather than implying it lands on the panel. |

The second table is the part worth keeping honest as this grows. A row that opened "the
appearance editor" in the abstract would land nowhere in particular, which is the decorative
control this project keeps finding one layer in; naming the gesture is worth more than a button
that shrugs.

### Surfaces that answer a doorbell rather than a prop

Three of those destinations are panels anchored to a control two or three components below the
shell: the notification centre behind the bell in the corner, the tab finder at the end of the
strip, and the changelog inside the viewer's Info page. The state deciding whether each is open
is local to the component that draws it, and correctly so — it is anchored to a control that
component owns and closes back onto it.

`components/shell/revealRequests.ts` is how the shell asks without owning that state: a counter
per surface, incremented by `requestReveal` and watched by `onRevealRequested`. A counter rather
than a boolean, because a boolean set to true is stuck true — the user closes the panel, asks
again, and nothing happens. The number is never read for its value.

The alternative, a template ref threaded down through every intervening component so the shell
can call a method, is worse in two ways: every layer's public surface grows a method it does not
use, and it breaks the moment an intervening component is conditionally rendered, which two of
these three are. Requests raised while nobody is listening are dropped, which is why the changelog
row is not built at all without a viewer running.

### Arriving somewhere means arriving at the control

A render that stops for a fixable reason already names the setting that would fix it; the shell
already opens the settings surface at that anchor, and that surface already scrolls the row into
view, focuses it and outlines it briefly. Destination rows emit exactly the `SettingsTarget` that
flow emits, so the shell hands it to the same `revealSetting` handler. This is a second entrance
to one reveal path, not a second path.

### Search

`ConfigSearchField` with its anchored regex builder, the same component every other search bar in
the application uses, bound to this surface's own query, pattern, flags and mode. Plain text is
the default and regex is an explicit opt-in. What is searched is what the row actually renders:
its title, its group, its explanation, the words somebody would plausibly type instead, and, for
a `choice`, the labels of every option including the ones not currently selected, because "how do
I make it dark" is a search for an option that is by definition not chosen yet. A `toggle`
contributes no value text at all, because "true" and "false" are not words anybody types and
adding them would make every switch match a search for "false".

The builder previews against `paletteSample()`, which is the same text `filterItems()` tests with
newlines flattened so one row stays one candidate line. A builder that previewed against
something else would teach a pattern that matches the sample and nothing on screen.

## Configuration

| Setting | Where it lives | Default |
|---|---|---|
| Shortcut | `isPaletteShortcut()` in `palettePrefs.ts`. Control or Command with Shift and `f`, and not Alt. | Not user-configurable |
| Size | `localStorage`, key `worldlens-palette`, as `{"size":"card"}` or `{"size":"full"}`; the old key migrates when current state is absent | `card` |

This was Ctrl+K until the documentation site next door was found to be answering Ctrl+Shift+F,
which meant the product shipped two shortcuts for one feature and whichever one a person had
learned was wrong half the time. Both are Ctrl+Shift+F now.

The shortcut matches on `event.key` rather than `event.code`, so the key labelled F on the user's
own layout is the one that works; `code` would hard-code the position of F on a US keyboard, which
is a different key on Dvorak or AZERTY. Both cases of the letter are accepted, because layouts
disagree about whether Shift+F reports `F` or `f`. Alt is excluded rather than ignored, so a
future Ctrl+Alt+Shift+F belongs to whoever wants it instead of silently opening this. The listener
sits on `window` in the capture phase, because a palette is meant to be reachable from anywhere
including from inside a text field, and a bubbling listener can be beaten by anything that stops
propagation on the way up. `preventDefault` is called only when the shortcut actually matched.

Size is a user choice and it is remembered. The bounded card is the default because a search box
that swallows the whole window is overwhelming on a large display and alarming when it was opened
by accident; the full-window view is something somebody asks for, from the header or from a row
in the list itself.

`canRouteConfigScreens` is the shell's promise that it can open the options editor at a named
tab. It defaults to false, and while it is false the settings tabs are one row carrying all seven
tabs' words in its searchable text rather than seven rows that would all open the same first tab.
The History row is present either way: it routes to the History tab where the shell can route,
and names the tab to pick where it cannot, rather than pretending to land there. The desktop
shell passes `true` — `ConfigScreen` takes an `initialScreen`, so all eight rows land on their
own tab.

Every action after `openProfiles` on `PaletteShellActions` is optional, and its absence removes
rows rather than producing rows that do nothing. That is what a smaller host, or a test, gets.

## Failure modes

- **Storage refuses.** A private-mode browser and a full quota both throw on write. The
  consequence is that the size does not survive a restart, which is annoying and nowhere near a
  notification, so both the read and the write are guarded and silent.
- **A stored size this build does not know** is discarded rather than trusted, because the file
  is editable by hand and by an older version of this application.
- **No map is open.** `blueMapApp` is null until a profile is active, so no viewer settings are
  listed and the palette says so in a line of its own. A theme select wired to nothing would be
  exactly the decorative control this project forbids.
- **An invalid pattern** matches nothing rather than quietly falling back to the last pattern
  that compiled, which would leave results on screen for a search nobody can see any more. An
  inactive matcher matches everything, which is what an empty box means.
- **A setting whose current value the application cannot determine** renders as a `choice` with a
  null value rather than guessing at one.
- **The shell cannot perform an action.** Every shell action the palette needs is something the
  shell already does from a button of its own. A shell without one simply has no such button, and
  the corresponding row is not built.

## Security considerations

Nothing here reaches the network. The catalogue is built from registries already in the bundle,
the search runs on the local `RegExp` engine under the bounds `components/config/regexEngine.ts`
states (512-character pattern, 20000-character sample, 500 matches, 100 ms per preview run), and
no pattern or sample is transmitted, logged or persisted. The only thing written to storage is
the size, which is one of two known strings.

Rows write through the same methods and the same storage keys the owning surface writes through,
so the palette adds no second, less validated route to a setting. A row that cannot reach a
setting's real write path is a destination that opens the surface instead.

## Accessibility

The palette is a labelled dialog with its search field focused on open, closed by Escape, and
returning focus to whatever opened it. Rows are reachable by keyboard in the order they render,
each control is named with the setting it changes rather than with a bare value, the result count
is a polite live region, and the group headings are real headings so a screen reader can move by
them. The size control is a row like any other, so a keyboard user changes it without reaching
for the header.

## Verification

| Test | What it holds |
|---|---|
| `paletteItems.test.ts` | The haystack covers title, group, description, keywords, the value text and a destination's `where`; a toggle contributes no value text and a choice contributes every option label; an inactive matcher keeps everything and an invalid one keeps nothing; grouping preserves first-seen order; the sample is one row per line. |
| `paletteCatalog.test.ts` | Every settings anchor and every options-editor screen is represented; rows derived from a registry carry that registry's own copy; the editor collapses to one row until the shell promises it can route, and expands to seven when it does; a setting row's `set` reaches the same write path the owning surface uses. Then: a row per page of the strip, each going to that page; a page the catalogue has never heard of still listed and still navigating; no page rows for a shell that will not navigate; the Servers row dropped once the strip carries that page and restored when there is no strip; History routing for real; the notification centre, tab finder and changelog opening, with the changelog absent without a viewer; the appearance preset applied and cleared through `commitAppearance`, and the global reset emptying every element. |
| `palettePrefs.test.ts` | The shortcut matches Control and Command with Shift and either case of F, refuses Alt, refuses a bare F and a plain Ctrl+F, and refuses the Ctrl+K this used to be; a blocked storage returns the default rather than throwing; a stored value that is not a known size is discarded. |
| `CommandPalette.test.ts` | Mounted: nothing renders until it opens, the search box takes focus and gives it back to the opener on close, the search narrows the list, a broken pattern is reported rather than showing the last good result, the down arrow moves from the box onto the first row, a destination emits the reveal handler's own target, a setting row writes and persists, and the palette opens as a card and remembers being made full-window. Plus the binding itself, on a host arranged as `App.vue` is: Ctrl+Shift+F opens the palette and toggles it shut, it swallows only the keystroke it acted on while leaving plain Ctrl+F and the old Ctrl+K alone, and it still works from inside a text field that stops propagation, which is what the capture phase is for. |

Run them with `npx vitest run packages/ui/src/components/palette` from `design/`.

## Suggested reading

- [Home](./home.md), the pinned landing tab whose capability cards reuse this same catalogue's
  copy and the same shell handlers this file's own destination rows already open.
- [The regex builder and the search bars it reaches](./regex-builder.md), which the palette's own
  search bar is one of.
- [Language modes and funny levels](./language-and-tone.md), whose catalogue does not carry the
  palette's keys yet, so its copy still renders the English fallbacks at every setting.
- [Notification centre](./notification-centre.md), the other surface built around finding
  something that has scrolled past.

## 廣東話

### 概覽

撳一個組合鍵就開到一張列住呢個應用程式做得到嘅所有嘢嘅清單，
而打個名出嚟就已經夠去到嗰樣嘢。屬於設定嘅列會直接載住嗰個設定嘅真控制項，
所以喺 palette 度改一個設定，同喺佢原本嗰個介面度改，係同一個動作、行同一條寫入路徑、
用同一套持久化。

Code 喺 `design/packages/ui/src/components/palette/`。Shell 只掛載一個 `CommandPalette`，
並將個快速鍵綁去同一個 ref。

### 三種列，而佢哋嘅分別係型別，唔係慣例

`paletteItems.ts` 將 `PaletteItem` 定義成三種形狀嘅 union，
而正正係咁先令到呢個專案「唔准有裝飾性控制項」嗰條規則喺呢度係驗得到，而唔係得個講字。

`command` 做佢嗰件事然後 palette 閂埋，必須帶 `run()`。
`setting` 載住實時控制項——一個開關、一個有界限嘅數字框，或者由清單揀一個——
必須帶 `control`，而佢個 `set` 要同時完成寫入*同埋*持久化。
`destination` 打開一個介面，必須帶 `where`（一句白話講清楚會出現乜）同 `go()`。

一個 builder 如果整唔出一個真係用得嘅控制項，就唔可以扮到似有：佢喺型別層面就要將嗰列降級做
`destination`，並講明去邊。呢度係刻意冇自由文字控制項。呢個應用程式入面每一個自由文字設定
（地圖 storage 資料夾、一條 world 路徑）都要對住檔案系統驗證，仲要提供瀏覽按鈕，
呢啲嘢一列做唔到得老老實實，所以佢哋全部都係 destination。

### 呢度冇任何嘢自己維護一張清單

每一列都係由早就描述緊嗰樣嘢嘅登記表 (registry) 推導出嚟，等一張清單唔會落後於佢描述緊嗰個介面：

- 應用程式設定介面發佈 `SETTINGS_SECTIONS` 同 `sectionCopy()`，
  所以佢啲區段係連住佢哋自己 render 用嘅標題同解釋、用當前語言送過嚟；
- 選項編輯器發佈 `SCREENS`，所以佢七個設定分頁係帶住自己嘅標籤送過嚟。佢第八個分頁 History
  載嘅係修訂而唔係設定，所以唔喺嗰張清單度；佢係作為一個獨立 destination 發佈，
  因為最多人會照個名去搵嘅嗰個分頁，一定要打得個名出嚟就搵到；
- 執行緊嗰個 viewer 喺 `BlueMapApp` 上面發佈佢嘅設定，而 `viewerSettings.ts` 就係喺嗰度讀同寫。

喺呢個 package 入面唯一*唔係*由登記表推導出嚟嘅，就係 shell 嗰條分頁列，因為條列屬於 shell。
佢係以 `pages` 嘅形式傳落嚟，所以 palette 一樣冇自己維護清單。一個目錄從來未聽過嘅頁，
一樣有佢嗰列、一樣傳送得到；`PAGE_NOTES` 淨係喺已知嘅情況下補一句更好嘅描述同額外嘅搜尋字眼，
所以一個加咗入條列嘅頁，喺同一個 commit 就已經去得到，唔使等到有人記得幫佢寫描述嗰個 commit。

分組係按目錄次序排，唔係排序：先係 shell 自己嘅 overlay，跟住係分頁列嗰啲頁，
再係圍住嗰啲頁嘅 chrome，然後係應用程式嘅設定同佢哋嘅外觀，再係伺服器設定畫面，
再係 viewer 嘅選單頁，再係喺呢度做實時控制項嘅 viewer 設定，最後先係 palette 自己嘅尺寸。
排序會將呢個判斷換成「啲組喺當前語言啱啱叫咩名」呢個偶然因素。

### 佢去到啲乜，同去唔到啲乜

呢度用清單講而唔係講「乜都得」，因為量度 palette 嗰條規則要求涵蓋每一個 command、頁、destination、
設定同外觀控制項，而老實答案有兩欄。

**去得到、而且會直接傳送過去嘅**：shell 分頁列嘅每一頁（行條列自己嘅 `revealPage`，同撳個分頁一模一樣）；
應用程式設定介面，逐個區段（發出 render 失敗流程嗰個 `SettingsTarget`，個介面會捲到嗰列、聚焦、加外框）；
選項編輯器全部七個分頁同佢個 History 分頁（經 `ConfigScreen` 嘅 `initialScreen`）；
viewer 嘅選單頁——maps、settings、info、markers、players（行 `menu.openPage`，即係選單自己嗰個呼叫）；
通知中心同分頁搜尋器（發一個 reveal 請求，擁有嗰個元件自己打開自己，自己處理聚焦）；
changelog viewer（打開 viewer 嘅 Info 頁，再展開兼捲到嗰個摺疊位）；
授權面板同「呢個係乜嚟？」（shell 打開佢本身已經掛載嘅停靠面板 `EulaSurface` / `WelcomeSurface`
——同 Home 自己啲卡打開嘅係同一批面板；而家兩者都冇咗常駐角落掣，就係靠呢兩列先令每個面板喺任何畫面都去到）；
以及喺一個冇分頁列嘅 shell 上面嘅伺服器清單（`openProfiles`）。

**列得出、搵得到，但唔會傳送入去嘅**：逐個元素嘅外觀編輯器，
因為每一個都錨定喺佢編輯緊嗰個元素度、由嗰個元素自己嘅右鍵選單打開，
所以根本冇「冇元素可以錨定但又打開排版編輯器」呢回事；嗰列係一個 `destination`，
講明路線（右擊，或者 Shift+右擊），而唔係一個要憑空發明目標嘅 command。
另外仲有 render console、release 下載、專案編輯器、備份同 Pages 面板：
每一個都住喺一版頁入面，而「頁」先係去得到嘅單位。啲頁嘅列將呢啲字當關鍵字帶住，
所以打「console」、「download」、「publish」都搵到載住佢哋嗰版頁，
而嗰列會講明係邊版頁，唔會暗示佢會落喺嗰個面板度。

第二張表先係隨住規模增長最值得保持老實嗰部分。一列抽象咁打開「外觀編輯器」嘅，
其實邊度都去唔到，正正就係呢個專案不斷喺深一層搵返出嚟嗰種裝飾性控制項；
講清楚個手勢，價值高過一粒聳膊頭嘅掣。

### 應門鐘而唔係遞道具嘅介面

嗰啲 destination 入面有三個，係錨定喺 shell 之下兩三層嘅控制項上面嘅面板：
角落個鐘後面嘅通知中心、分頁列尾嘅分頁搜尋器，同 viewer Info 頁入面嘅 changelog。
決定佢哋開唔開嘅狀態，係屬於畫佢哋嗰個元件本地嘅，而且咁樣係啱嘅——
因為佢錨定喺嗰個元件自己擁有嘅控制項，閂返嗰陣亦係閂返落去嗰度。

`components/shell/revealRequests.ts` 就係 shell 喺唔擁有嗰個狀態嘅情況下發問嘅方法：
每個介面一個計數器，用 `requestReveal` 加一，用 `onRevealRequested` 監看。
用計數器而唔用 boolean，係因為一個設咗 true 嘅 boolean 就會卡死喺 true——
用戶閂咗個面板，再問一次，就乜都唔會發生。嗰個數字嘅數值本身永遠唔會被讀。

另一個做法——將一個 template ref 穿過每一層中間元件傳落去，等 shell 可以叫個 method——
有兩個更差嘅地方：每一層嘅公開介面都要多一個佢自己唔用嘅 method，
而且一旦有中間元件係條件式 render 就即刻爆，而呢三個入面有兩個正正就係咁。
喺冇人聽嘅時候發出嘅請求會被丟棄，所以冇 viewer 執行緊嗰陣，changelog 嗰列根本唔會起。

### 到咗某度，即係到咗嗰個控制項

一個因為可修復嘅原因而停低嘅 render，本身已經會指名可以修復佢嗰個設定；
shell 本身已經會喺嗰個 anchor 打開設定介面，而嗰個介面本身已經會將嗰列捲入視野、聚焦、
短暫加個外框。Destination 列發出嘅正正就係嗰條流程發出嗰個 `SettingsTarget`，
所以 shell 會交畀同一個 `revealSetting` handler。呢個係同一條 reveal 路徑嘅第二個入口，
唔係第二條路徑。

### 搜尋

用 `ConfigSearchField` 加佢錨定嘅 regex builder，即係應用程式入面每一條搜尋列都用緊嗰個元件，
綁去呢個介面自己嘅 query、pattern、flag 同模式。純文字係預設，regex 要明確 opt-in。
搜尋嘅內容就係嗰列實際 render 出嚟嘅嘢：標題、分組、解釋、人哋可能會改為打嘅字眼，
而如果係 `choice`，仲包埋每個選項嘅標籤——包括而家未揀嗰啲，
因為「點樣先變到暗色」本身就係喺搵一個按定義仲未揀嘅選項。`toggle` 就完全唔貢獻任何值文字，
因為「true」同「false」根本冇人會打，加咗仲會令每一個開關都符合「false」呢個搜尋。

Builder 嘅預覽係對住 `paletteSample()` 做，而佢就係 `filterItems()` 測試嗰段同樣嘅文字，
只不過將換行壓平，令一列維持一行候選。如果 builder 對住第二樣嘢預覽，
就會教出一啲符合樣本但畫面上乜都唔中嘅 pattern。

### 設定

快速鍵由 `palettePrefs.ts` 入面嘅 `isPaletteShortcut()` 決定：Control 或者 Command，
加 Shift 加 `f`，而且唔可以撳住 Alt；呢個係用戶改唔到嘅。
尺寸存喺 `localStorage`，key 係 `worldlens-palette`，值係 `{"size":"card"}` 或者 `{"size":"full"}`，
預設 `card`；喺當前狀態唔存在嘅時候，先會由舊嗰個 key 遷移過嚟。

呢個本來係 Ctrl+K，直至發現隔籬嗰個文件網站係應 Ctrl+Shift+F 嘅，
即係同一個功能出咗兩個快速鍵，而無論你學咗邊個，都有一半時間係錯。而家兩邊都係 Ctrl+Shift+F。

個快速鍵係比對 `event.key` 而唔係 `event.code`，
所以用戶自己嗰個鍵盤配置上面標住 F 嗰粒掣先係有效嗰粒；用 `code` 就會將 F 喺美式鍵盤上嘅位置寫死，
而嗰個位置喺 Dvorak 或者 AZERTY 係另一粒掣。大細楷兩種都收，
因為唔同配置對 Shift+F 究竟報 `F` 定 `f` 有分歧。Alt 係明確排除而唔係忽略，
咁樣將來一個 Ctrl+Alt+Shift+F 就屬於想要佢嘅人，唔會靜靜雞開咗呢個。
個 listener 係擺喺 `window` 嘅 capture 階段，因為 palette 本意就係喺任何地方都去到，
包括喺一個文字欄位入面，而一個 bubbling listener 可以被途中任何 stop propagation 嘅嘢打敗。
`preventDefault` 只有喺快速鍵真係命中嗰陣先會叫。

尺寸係用戶選擇，而且會記住。有界限嘅 card 係預設，因為一個吞晒成個視窗嘅搜尋框，
喺大螢幕上好壓迫，唔覺意撳開咗仲會嚇親人；全視窗檢視係要人主動要求嘅，
喺標題列或者清單入面其中一列都要求得到。

`canRouteConfigScreens` 係 shell 嘅承諾，表示佢可以喺一個指名分頁打開選項編輯器。
佢預設係 false，而喺 false 嘅時候，啲設定分頁會壓縮成一列，
喺可搜尋文字入面帶住全部七個分頁嘅字眼，而唔係做七列但七列都開返同一個第一分頁。
History 嗰列兩種情況都喺度：shell 路由得到就直接去 History 分頁，路由唔到就講明要揀邊個分頁，
而唔係扮到好似真係落到去。桌面 shell 傳 `true`——`ConfigScreen` 收 `initialScreen`，
所以八列全部落到自己嗰個分頁。

`PaletteShellActions` 上面喺 `openProfiles` 之後嘅每一個動作都係可選，
而佢唔存在會令對應嘅列消失，而唔係整出一啲乜都唔做嘅列。一個細啲嘅 host、或者一個測試，
攞到嘅就係咁。

### 失敗模式

- **儲存被拒。** 私密模式瀏覽器同配額爆滿都會喺寫入時掟錯。後果只不過係尺寸捱唔過重啟，
  呢樣煩人但遠遠去唔到要出通知嘅程度，所以讀同寫都有防護，而且係靜靜咁做。
- **存住嘅尺寸係呢個 build 唔識嗰啲**，會掉咗佢唔會信，因為個檔人手改得，
  舊版本嘅應用程式亦寫得。
- **冇地圖開住。** 未有 profile 生效之前 `blueMapApp` 係 null，所以唔會列出任何 viewer 設定，
  而 palette 會用自己一行講明。一個駁緊空氣嘅主題選擇器，
  正正就係呢個專案禁止嗰種裝飾性控制項。
- **無效 pattern** 係乜都唔中，而唔係靜靜雞退返去上一個編譯得到嘅 pattern——
  嗰樣會令畫面留住一啲屬於一個已經睇唔到嘅搜尋嘅結果。一個未啟用嘅 matcher 就中晒全部，
  而嗰個就係一個空搜尋框應有嘅意思。
- **一個應用程式判斷唔到當前值嘅設定**，會 render 成一個值為 null 嘅 `choice`，而唔係靠估。
- **Shell 做唔到某個動作。** Palette 需要嘅每一個 shell 動作，都係 shell 本身已經有粒掣做緊嘅嘢。
  一個冇嗰粒掣嘅 shell，就係冇嗰樣嘢，而對應嗰列亦唔會起。

### 保安考慮

呢度冇任何嘢會出網絡。個目錄係由已經喺 bundle 入面嘅登記表建立，
搜尋喺本機 `RegExp` engine 度行，受 `components/config/regexEngine.ts` 訂明嘅界限限制
（pattern 512 字元、樣本 20000 字元、500 個 match、每次預覽 100 ms），
而且冇任何 pattern 或者樣本會被傳送、記錄或者持久化。唯一寫入儲存嘅就係尺寸，
而佢係兩個已知字串之一。

啲列係經擁有嗰個介面本身用嘅同一批 method、同一批儲存 key 嚟寫，
所以 palette 冇為一個設定加多一條驗證較鬆嘅路徑。一列如果去唔到一個設定嘅真正寫入路徑，
佢就係一個打開嗰個介面嘅 destination。

### 無障礙

Palette 係一個有標籤嘅 dialog，開嗰陣搜尋欄位會攞到焦點，撳 Escape 會閂，
閂完會將焦點還返畀打開佢嗰樣嘢。啲列可以按 render 次序用鍵盤到達，
每個控制項都用佢改緊嗰個設定嚟命名，唔係淨用一個裸值；結果計數係一個 polite live region，
而啲分組標題係真標題，所以螢幕閱讀器可以按標題移動。尺寸控制項同其他列一樣係一列，
所以鍵盤用戶唔使伸手去標題列都改到。

### 核實

`paletteItems.test.ts` 保住：搜尋 haystack 涵蓋標題、分組、描述、關鍵字、值文字，
同一個 destination 嘅 `where`；toggle 唔貢獻值文字，choice 貢獻每一個選項標籤；
未啟用嘅 matcher 保留全部、無效嘅乜都唔保留；分組保住先見先排嘅次序；樣本一列一行。
`paletteCatalog.test.ts` 保住：每一個設定 anchor 同每一個選項編輯器畫面都有代表；
由登記表推導出嚟嘅列帶住嗰個登記表自己嘅文案；喺 shell 未承諾路由得到之前編輯器壓縮成一列、
承諾得到就展開成七列；一個設定列嘅 `set` 去到擁有嗰個介面用緊嗰條寫入路徑。跟住仲有：
分頁列每一頁一列、每列去返嗰一頁；一版目錄從來未聽過嘅頁一樣列得出兼導航得到；
一個唔會導航嘅 shell 就冇任何頁列；一旦條列已經載住嗰版頁，Servers 嗰列就會拿走，
冇條列嘅時候就會回復；History 係真路由；通知中心、分頁搜尋器同 changelog 打得開，
而冇 viewer 嗰陣 changelog 唔會出現；外觀 preset 經 `commitAppearance` 套用同清除，
而全域重設會清空每一個元素。
`palettePrefs.test.ts` 保住：快速鍵接受 Control 同 Command 配 Shift 加大細楷任何一個 F、
拒絕 Alt、拒絕淨係一個 F 同淨係 Ctrl+F，亦拒絕以前嗰個 Ctrl+K；
儲存被封鎖嗰陣回傳預設而唔係掟錯；存住嘅值唔係已知尺寸就掉咗。
`CommandPalette.test.ts` 係掛住 mount 嚟測：未開之前乜都唔 render、
搜尋框攞到焦點兼喺閂嗰陣還返畀打開者、搜尋會收窄清單、壞 pattern 會報出嚟而唔係 show 返上一個好結果、
向下鍵由搜尋框移去第一列、destination 發出 reveal handler 自己嗰個 target、
設定列會寫入兼持久化、palette 開嗰陣係 card 而且記得住被改成全視窗。
再加埋綁定本身，喺一個好似 `App.vue` 咁佈置嘅 host 上面：Ctrl+Shift+F 開到 palette 亦切換得閂，
佢只吞佢處理咗嗰下按鍵、放過普通 Ctrl+F 同舊嗰個 Ctrl+K，
而且喺一個會 stop propagation 嘅文字欄位入面一樣得——呢個就係 capture 階段存在嘅原因。

喺 `design/` 底下用 `npx vitest run packages/ui/src/components/palette` 行佢哋。

### 建議閱讀

- [Home](./home.md)：釘住嘅落地分頁，佢啲能力卡重用緊呢個目錄嘅文案，
  同呢份文件嗰啲 destination 列本身已經打開緊嘅同一批 shell handler。
- [The regex builder and the search bars it reaches](./regex-builder.md)：
  palette 自己條搜尋列就係其中一條。
- [Language modes and funny levels](./language-and-tone.md)：佢個目錄仲未帶住 palette 嘅 key，
  所以佢啲文案喺每一個設定度仍然 render 英文後備。
- [Notification centre](./notification-centre.md)：另一個圍住「搵返啲已經捲走咗嘅嘢」而起嘅介面。
