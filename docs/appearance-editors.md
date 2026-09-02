# Appearance: per-element editing, the infinite colour picker and the typography editor

An element is wrapped once and gains the whole feature: its resolved appearance applied live, a
context menu with **Edit appearance...**, a keyboard path to the same command, a non-modal editor
anchored beside it, and focus back on the element when that editor closes.

The code is `design/packages/ui/src/components/appearance/`. A host writes
`<AppearanceTarget id="app.tabBar" label="The tab bar">` around whatever it renders.

## Behaviour

### A record of opinions, not of values

An appearance record is deliberately a record of _opinions_. A key that is absent means "I have no
view on this, follow whatever is above me"; a key that is present means "this one, regardless".
Keeping those distinguishable is what makes per-property reset work at all: resetting a tab's
weight has to remove the opinion so the tab goes back to following the theme, rather than write
today's theme weight into the tab and pin it there until somebody notices, six months later, that
restyling the application changed everything except that one element.

Records resolve in layers. `GLOBAL_TARGET` is a reserved element id rather than a separate field,
so the global layer is edited, reset and exported through exactly the same code paths as any
single element's; a global layer with its own parallel implementation would be a feature with two
reset bugs instead of one.

Two halves are kept apart rather than folded into one flat bag, because they are edited in
different tabs, reset independently and, for a group header or a strip, inherited from different
places:

| Half       | Properties                                                                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface    | `backgroundColor`, `borderColor`, `borderWidth`, `borderStyle`, `borderRadius`, `paddingInline`, `paddingBlock`, `elevation`, `opacity`                                                                                                                                                                                                  |
| Typography | Family, size and unit, weight, bold, italic or oblique with an angle, variable-font axes, underline style and colour, single or double strikethrough, overline, capitalisation, small caps, baseline shift and offset, text colour, highlight, outline, shadow, glow, letter spacing, word spacing, line height, direction and alignment |

An element with no overrides renders Material Design 3 `body-medium`: Roboto at 14px with a 400
weight. Every colour defaults to the empty string, meaning inherit, because an element whose
default background were a real colour would paint over whatever it sits on the moment it acquired
any override at all.

### The wrapper is invisible until it has something to paint

`AppearanceTarget` is `display: contents` by default, so adding it to an existing surface changes
nothing about that surface's layout. Typography passes straight through a contents box by
inheritance; a background, border, padding, shadow or opacity does not, and would render nothing
at all, silently, which would look exactly like the feature being broken. The wrapper therefore
becomes a real box the moment one of those declarations is present and goes back to being
invisible when the user resets them.

### Colours are stored as the user wrote them

Every colour is a string, and it is the string the user authored: `oklch(0.7 0.1 250)` stays
`oklch(0.7 0.1 250)` in the record even though what is painted is an `rgb()` the browser is certain
to understand. Storing the resolved value would destroy the gamut the user chose in, the precision
they typed and the notation they think in, and the record is the thing that gets exported, shared
and imported into a build with a different engine.

The corollary is that a colour can fail to parse, and this feature never answers a failed colour
with black. It leaves the declaration off, keeps the authored text exactly as it was, and reports
it so the editor can say which value it could not use and offer it back for correction.

### The infinite colour picker

"Infinite" is the word for the thing it is not allowed to be: a grid of swatches. Everything is
layered on a continuous two-dimensional field plus a continuous hue and alpha, and the swatches,
the recent list and the eyedropper write into that field rather than replacing it. There is no
colour expressible in sRGB that cannot be reached by dragging, and none expressible in a supported
space that cannot be reached by typing. The recent list is shared by every picker in the session
and is not persisted, and the eyedropper appears only where the platform provides one rather than
as a button that would do nothing.

The translator reads and writes eleven notations: named colours, hexadecimal (including the
eight-digit form), `rgb`/`rgba`, `hsl`, `hsv`, `hwb`, `lab`, `lch`, `oklab`, `oklch` and `cmyk`.
Alpha is preserved, the active space is named, and a contrast report is shown against the relevant
foreground or background. Any representation can be copied.

The canonical value is **unclamped** sRGB. Lab, LCH, OKLab and OKLCH can all describe colours no
sRGB display can show, and clamping on entry would quietly delete them: somebody typing
`oklch(0.7 0.35 30)` would watch it snap to something duller with no explanation. Keeping the
out-of-range numbers is what lets the picker say "this is outside sRGB, and here is what will be
shown instead", which is a true statement about a real situation. So the split runs through the
whole module: the spaces defined as re-parameterisations of sRGB (HSL, HSV, HWB, hex, CMYK) work
on the clipped colour and the caller is told whether clipping actually changed anything, while the
device-independent spaces (Lab, LCH, OKLab, OKLCH, XYZ) work on the raw value and never clip.

CIELAB and LCH use the D50 white point and OKLab and OKLCH use D65, because that is what CSS Color
4 specifies and therefore what a value pasted out of a browser's developer tools means. The
Bradford adaptation matrices are the ones the specification publishes, transcribed rather than
re-derived.

### The typography editor, and what the engine will actually draw

The offered shape is deliberately wider than CSS, because somebody who has used a word processor's
font dialog expects to find small caps, an oblique angle, a double strikethrough, an outline and a
glow. Capability detection and style generation are therefore two separate steps:
`detectTypographyCapabilities` asks the engine what it can do, and `typographyCss` emits only what
the engine accepted and returns the list it had to leave out. **The value stays in the spec either
way**, so turning the control back on, or opening the same profile on a machine with a newer
engine, brings it back untouched.

The second honesty problem has no capability flag to hang off. CSS draws underline, strikethrough
and overline through one `text-decoration-line` declaration with _one_ style and _one_ colour
between them, so a wavy underline beside a double strikethrough is not a thing CSS can express.
Picking one silently would leave somebody staring at a control whose value the preview ignores, so
the module picks a documented winner and returns a note naming the property that lost, for the
editor to show beside it.

The font picker offers what the application ships plus what it can reasonably assume is installed,
and can ask Chromium for the rest through `queryLocalFonts()`, which the user may refuse. Every
stack it builds ends in a generic, and CJK-capable faces are appended, because the moment text
contains a Chinese, Japanese or Korean character a Latin-only face has nothing to draw with and
the browser falls back to whatever it likes.

When the platform reports a stable font identity, the record stores it beside the display family
and uses it to resolve the actual rendered face. If that identity is missing on a later machine,
resolution falls back to the saved display family and then the documented generic and CJK fallback
stack.

### The editor edits itself

The editor's root carries the resolved appearance of the `appearance.editor` target, so pointing
the editor at its own chrome restyles it while it is open. A theming feature that cannot theme its
own dialog is incomplete, and this is also the cheapest possible test of the whole thing: if the
editor cannot restyle itself, it cannot restyle anything.

The editor is not a page, deliberately. Appearance is judged by looking at the element, not at a
form, so it is a non-modal surface anchored beside the thing being edited and everything in it
changes the live element as it is touched.

### Presets, export and import

Named presets can be saved, applied and deleted; deleting one goes through the
[super-confirmation gate](./super-confirmation.md), because it takes the settings every element
following that preset was inheriting with it. A whole theme exports as JSON carrying a format
marker so a stray JSON file is not read as a theme, and imports report what it could and could not
use.

**Unknown keys survive the round trip.** A theme exported by a later build carries sections this
one has never heard of. Dropping them is the obvious implementation and it means a user who opens
their theme in an older version, changes one font and saves has silently deleted everything the
newer version added. Anything unrecognised is parked in the record's `preserved` bag and written
straight back out. This build cannot render those values and never claims to; it declines to be
the reason they vanish. A value of the wrong type is treated the same way and named in the import
report, rather than deleted.

## Configuration

| Setting                           | Value                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Storage key                       | `worldlens-appearance` in `localStorage`; the legacy key is copied once when current state is absent |
| Export format marker              | `worldlens-appearance`; legacy `material-bluemap-appearance` imports remain accepted                 |
| Export version                    | `APPEARANCE_VERSION`, currently 2                                                                    |
| Global layer id                   | `GLOBAL_TARGET`, the reserved element id `global`                                                    |
| Context menu                      | **Edit appearance...** under the host's own menu items                                               |
| Straight to the editor            | Shift and right-click, or `Ctrl+Shift+F10`                                                           |
| Open the context menu by keyboard | `Shift+F10` or the Menu key                                                                          |

The keyboard path is not a courtesy: `Shift+F10` and the Menu key are what a Windows user presses
to open a context menu, so they open this one. `Ctrl+Shift+F10` mirrors Shift and right-click, the
menu item displays that shortcut beside its label from the same handler that binds it, and the
wrapper advertises both through `aria-keyshortcuts`, which is how assistive technology learns
about a binding it cannot see.

The `menu` slot renders above the appearance commands, so an element that already has a management
menu keeps it and gains **Edit appearance...** underneath rather than having its menu replaced.

### Which elements are editable today

`AppearanceTarget` is a wrapper, so the set of editable elements is the set of places it is
wrapped around. On the default branch that is the window title bar, the tab bar, each server
profile row, and the editor's own chrome. Every other rendered element in the application is not
yet a target; the surrounding contract asks for all of them, and that gap is stated on the
project's contract page rather than papered over here.

## Failure modes

- **A colour that will not parse** is kept verbatim, not painted, and named back to the user. It
  is never replaced with black.
- **A colour outside sRGB** is kept, painted as its clipped equivalent, and reported as clipped
  rather than silently changed.
- **A property this engine cannot draw** stays visible with an explanation and keeps its stored
  value.
- **Two decoration controls that CSS cannot honour at once**: a documented winner is applied and
  the losing property is named beside its control.
- **A theme file from a newer build** imports, renders what this build understands, and writes the
  rest back out untouched on the next export.
- **A value of the wrong type in an imported theme** is preserved and reported rather than
  dropped, so the user is told which of their settings did not survive and can fix it.
- **Storage refuses or holds a shape this build does not expect.** Both directions are guarded and
  silent, and a bad blob is repaired rather than trusted, because the file is editable by hand and
  by an older version of this application.
- **The browser refuses font enumeration.** The picker offers the bundled and assumed-installed
  families and says nothing alarming; `queryLocalFonts` is reached for defensively and never
  throws.

## Security considerations

Nothing here reaches the network: the two bundled families ship inside the application, no font,
stylesheet or colour is fetched, and nothing is transmitted or logged. That is also what lets the
shell keep `font-src 'self'` in its Content-Security-Policy.

Appearance is written to `localStorage` and exported only when the user asks. An exported theme is
JSON containing colours, sizes and family names; it carries no path, no token and no content from
the application's data.

Font enumeration is a permissioned browser capability and is treated as one. It is asked for, it
can be refused, and a refusal is an ordinary outcome rather than an error.

An imported theme is data, never code. It is parsed as JSON, every recognised value is validated
against the property it claims to set, and anything unrecognised is preserved as opaque data that
this build never interprets. The colour strings it carries are parsed by this project's own parser
and turned into declarations by this project's own formatter, so an imported string cannot become
arbitrary CSS.

## Accessibility

The editor is reachable by pointer and by keyboard through equal paths, both advertised. It is
non-modal and anchored, tracks its anchor, flips at a viewport edge, and returns focus to the
element it was editing when it closes. Its own search field carries the regex builder like every
other search bar. The colour picker states the active space and reports contrast against the
relevant foreground or background, so a colour choice can be checked rather than guessed at. Every
property that the engine cannot support stays visible with an explanation instead of disappearing,
which keeps the control set stable for somebody navigating it by keyboard.

## Chrome properties, state layers, and locks

The surface record also carries chrome metadata that ordinary text CSS cannot describe on its
own: icon name, colour, size and opacity; badge text, colour, background and shape; separator
visibility, colour, thickness and line style; shape variant; density; motion preference; gap; and
inline and block margins. A host consumes these values through the `--appearance-*` custom
properties while keeping its own Material primitives responsible for the actual icon and badge
rendering. Unknown metadata is preserved on import and export.

Every record can carry independent state layers for `hover`, `focus`, `selected`, `expanded`,
`collapsed`, `disabled`, `pressed`, and `active`. A state layer may override typography, surface,
effects, icon, badge, separator, shape, elevation, or spacing. Resolving a state never mutates the
base record, and a missing state means that the base appearance remains in effect.

The editor's **Editing state** picker authorises a state before any typography or surface control
is changed. New state values are written through the same setters as base values, and reset removes
only that state property's opinion. The host wrapper passes pointer, focus, and explicit host states
through the same resolver, so a saved hover or focus appearance is applied to the real target and
not only shown in a preview.

Each base property and each declared state property has an independent appearance lock target.
The target path is stable and contains only the element and property identity. Credentials are
owned by the lock store and are never written into appearance records, presets, exports, or
history. Unlocking one property therefore cannot unlock a different property.

The editor exposes a lock or unlock action beside each base and state property. The action opens
the real lock wizard, uses the stable property path, and routes a locked edit through the real
unlock prompt. Setters enforce the same lock, so keyboard events, palette actions, imported state,
and direct component calls cannot change a locked property behind the editor's back. Active-preset
changes, preset removal, an element's inherited-preset change, theme import, and every reset route
reconcile against the current lock list. A locked effective value is materialized into the element
record before the old source disappears, so a preset cannot silently change a locked property.

The editor's own chrome registers dynamically while mounted, so it appears in the target list only
when it exists and its own **Edit appearance...** route can return focus to the originating
control. Every choice picker, including typography choices, surface choices, preset choices, and
colour notation, opens its own plain-text-first search with an adjacent anchored regex builder,
keyboard listbox navigation, an honest no-match state, and focus return.

## Rainbow sentinel and unsupported chrome operations

The animated rainbow is stored as the sentinel `__worldlens_rainbow__`, never as a changing colour
string and never as a recent swatch. One persisted global speed level maps to one CSS duration for
every target, and the hue wheel is animated in CSS. Reduced motion disables the animation and
settles on one deliberate hue. Appearance targets mark themselves with the rainbow state, so the
actual host surface animates rather than only the picker swatch.

Crop, masks, document layers, and blend modes are not applicable to ordinary chrome appearance
targets. They belong to document or render content rather than a tab, toolbar, badge, or dialog
chrome. This editor therefore does not expose fake controls for them. A future content editor must
document and implement those operations in its own record instead of adding them to this chrome
schema.

## Verification

| Test                             | What it holds                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `appearanceRecord.test.ts`       | Absent means inherit and present means override, per-property reset removes the opinion rather than freezing a value, and an unparseable colour is reported rather than painted.                                                     |
| `appearanceStore.test.ts`        | Layer resolution including the global target, persistence guarded in both directions, a repaired blob rather than a trusted one, unknown keys and wrong-typed values preserved and reported, and presets applied, saved and removed. |
| `colorSpaces.test.ts`            | The conversions, both directions, with the D50 and D65 white points the specification names, and out-of-gamut values carried rather than clamped.                                                                                    |
| `colorParse.test.ts`             | Every notation the translator accepts, alpha preserved, and each parse failure distinguished by reason.                                                                                                                              |
| `colorFormat.test.ts`            | Every notation it writes, the clip report, and the contrast report.                                                                                                                                                                  |
| `typographySpec.test.ts`         | Capability detection per property, values kept when a capability is absent, and the documented decoration winner with a note naming the property that lost.                                                                          |
| `fontCatalog.test.ts`            | Stacks that always end in a generic, CJK fallbacks appended, and enumeration that neither throws nor requires a browser at import time.                                                                                              |
| `InfiniteColorPicker.test.ts`    | Mounted: the continuous field, typing in each notation, copying a representation, and the gamut warning.                                                                                                                             |
| `AppearanceChoiceField.vue`      | Every dropdown has its own anchored search, regex mode, keyboard listbox path, focus return, and no-match state.                                                                                                                     |
| `appearanceLocks.test.ts`        | Every base and declared state property has an independent stable lock target, with no credential material in the appearance data.                                                                                                    |
| `rainbow.test.ts`                | The sentinel, global speed mapping, CSS hue rotation, and reduced-motion fixed hue.                                                                                                                                                  |
| `appearanceCompleteness.test.ts` | Hand-written chrome, spacing, state, lock, rainbow, self-registration, and picker inventory, including a deliberate red then green negative regression.                                                                              |
| `useAppearance.lock.test.ts`     | Mounted real lock-store wiring: a locked property setter is refused while the independent target identity remains available.                                                                                                         |
| `AppearanceTarget.test.ts`       | Mounted: the context menu with the host's own items above the appearance ones, both keyboard paths, the editor anchored and returning focus, and the wrapper becoming a box only when a box declaration is present.                  |

Run them with `npx vitest run packages/ui/src/components/appearance` from `design/`.

## Suggested reading

- [Tabbed navigation](./tabbed-navigation.md), which carries an opaque appearance record on every
  tab and group and never reads inside it.
- [Super confirmation](./super-confirmation.md), which stands in front of deleting a preset.
- [The regex builder and the search bars it reaches](./regex-builder.md), which supplies the
  editor's and the picker's search fields.

## 廣東話

外觀 (Appearance)：逐個元素編輯、無限色彩選擇器同字體排印編輯器

一個元素只要包一次就攞到成套功能：即時套用佢解算出嚟嘅外觀、一個帶 **Edit appearance...** 嘅右鍵選單、一條去到同一個指令嘅鍵盤路徑、一個貼喺佢隔籬嘅非 modal 編輯器，以及編輯器閂咗之後個 focus 會返返去嗰個元素度。

程式碼喺 `design/packages/ui/src/components/appearance/`。宿主淨係要喺佢 render 嘅嘢外面寫 `<AppearanceTarget id="app.tabBar" label="The tab bar">`。

### 行為 (Behaviour)

#### 記錄嘅係主張，唔係數值

外觀記錄刻意只記錄「主張 (opinions)」。一個 key 冇出現即係話「我對呢樣冇意見，跟上層」；出現咗即係話「就要呢個，唔理上面點」。分得清呢兩樣，逐個屬性 reset 先至有意義：reset 一個 tab 嘅 weight 要係移走嗰個主張，等個 tab 返去跟 theme，而唔係將今日 theme 嘅 weight 寫死入個 tab，然後釘住佢，等到六個月後有人發現改咗成個 application 嘅風格，就淨係嗰粒元素冇跟。

記錄係分層解算嘅。`GLOBAL_TARGET` 係一個保留嘅 element id，而唔係另外開一個欄位，所以全域層嘅編輯、reset 同匯出行嘅係同單一元素完全一樣嘅程式路徑；如果全域層自己另起爐灶做多套實作，咁就係一個功能有兩個 reset bug，而唔係一個。

兩半嘢係分開放，唔會攤成一個扁平大袋，因為佢哋喺唔同 tab 度編輯、可以獨立 reset，而且對於 group header 或者一條 strip 嚟講，佢哋係由唔同地方繼承落嚟。Surface 嗰半包括 `backgroundColor`、`borderColor`、`borderWidth`、`borderStyle`、`borderRadius`、`paddingInline`、`paddingBlock`、`elevation` 同 `opacity`。Typography 嗰半就闊好多，包括字體家族、大小同單位、weight、粗體、italic 或者帶角度嘅 oblique、variable-font 軸、底線樣式同顏色、單或雙刪除線、上劃線、大小寫轉換、small caps、baseline shift 同 offset、文字顏色、highlight、outline、陰影、光暈、字距、詞距、行高、方向同對齊。

冇任何覆寫嘅元素會 render 成 Material Design 3 嘅 `body-medium`：Roboto、14px、weight 400。每隻顏色嘅預設值都係空字串，即係「繼承」，因為如果預設背景係一隻真顏色，咁一旦嗰個元素有任何覆寫，佢就會即刻蓋住佢下面嗰樣嘢。

#### 個 wrapper 喺冇嘢要畫之前係隱形嘅

`AppearanceTarget` 預設係 `display: contents`，所以將佢加落現有介面上面，唔會改變嗰個介面嘅 layout。Typography 靠繼承可以直接穿過 contents box；但背景、邊框、padding、陰影或者 opacity 就唔得，佢哋會靜靜雞乜都唔畫，睇落就好似成個功能爛咗咁。所以一有呢類宣告出現，個 wrapper 就會變成真嘅 box，用戶 reset 咗之後就返返去隱形。

#### 顏色照用戶所寫嘅樣去儲

每隻顏色都係字串，而且就係用戶自己打嗰個字串：`oklch(0.7 0.1 250)` 喺記錄入面仍然係 `oklch(0.7 0.1 250)`，雖然實際畫出嚟嘅係瀏覽器一定識嘅 `rgb()`。如果儲解算後嘅值，就會摧毀咗用戶所揀嘅色域、佢打嘅精度同佢腦入面嗰套記法，而呢個記錄正正就係會匯出、分享、再匯入去另一個引擎嘅 build 嘅嘢。

推論就係：一隻顏色係有機會 parse 唔到嘅，而呢個功能永遠唔會用黑色去回應一隻失敗嘅顏色。佢會唔出嗰句宣告，原原本本保留用戶寫嘅文字，再報告出嚟，等編輯器可以講清楚邊個值用唔到，並且交返畀用戶改。

#### 無限色彩選擇器 (infinite colour picker)

「無限」呢個字講嘅係佢唔准變成嘅嘢：一格格嘅 swatch 網。所有嘢都疊喺一塊連續嘅二維場加連續嘅色相同 alpha 上面，而 swatch、最近用過清單同 eyedropper 都係寫入嗰塊場，唔係取代佢。sRGB 表達得到嘅顏色，冇一隻係拖唔到；支援空間表達得到嘅顏色，冇一隻係打唔到。最近用過清單係成個 session 所有 picker 共用，唔會持久化；eyedropper 淨係喺平台真係提供嗰陣先出現，唔會擺個撳咗乜都唔做嘅掣。

翻譯器讀寫十一種記法：具名顏色、十六進位（包括八位數形式）、`rgb`/`rgba`、`hsl`、`hsv`、`hwb`、`lab`、`lch`、`oklab`、`oklch` 同 `cmyk`。Alpha 會保留，會標明當前色彩空間，亦會對相關前景或者背景顯示對比度報告。任何一種表示法都可以複製。

正規值係**未 clamp** 嘅 sRGB。Lab、LCH、OKLab 同 OKLCH 全部都可以描述 sRGB 顯示器顯示唔到嘅顏色，喺輸入嗰陣 clamp 就會靜靜雞刪咗佢哋：有人打 `oklch(0.7 0.35 30)`，就會眼白白見住佢無緣無故彈去一隻暗啲嘅色。保住超範圍嘅數字，先至可以令個 picker 講到「呢個喺 sRGB 之外，而以下係實際會顯示嘅嘢」，呢句係對真實情況嘅真話。所以呢條分界貫穿成個 module：定義為 sRGB 重新參數化嘅空間（HSL、HSV、HWB、hex、CMYK）係喺 clip 咗嘅顏色上面運算，並且會話返畀呼叫者知 clip 有冇真係改到嘢；而裝置無關嘅空間（Lab、LCH、OKLab、OKLCH、XYZ）就喺原始值上面運算，永遠唔 clip。

CIELAB 同 LCH 用 D50 白點，OKLab 同 OKLCH 用 D65，因為 CSS Color 4 就係咁訂，所以由瀏覽器 developer tools 貼出嚟嘅值就係呢個意思。Bradford adaptation 矩陣係規格公佈嗰套，直接抄錄，唔係自己重新推導。

#### 字體排印編輯器，同引擎實際會畫到啲乜

提供嘅範圍刻意闊過 CSS，因為用開文書處理器字型對話框嘅人，會預期搵到 small caps、oblique 角度、雙刪除線、outline 同光暈。所以能力偵測同樣式產生係兩個分開嘅步驟：`detectTypographyCapabilities` 問引擎佢做到啲乜，而 `typographyCss` 淨係 emit 引擎接受嘅嘢，同時回傳佢被迫略過嗰批。**無論點樣，個值都仲留喺 spec 入面**，所以將個控件開返，或者喺一部引擎新啲嘅機開返同一個 profile，佢就會原封不動咁返嚟。

第二個誠實問題係冇 capability flag 可以掛。CSS 用一句 `text-decoration-line` 去畫底線、刪除線同上劃線，而三者之間就只有*一種*樣式同*一隻*顏色，所以「波浪底線加雙刪除線」係 CSS 表達唔到嘅嘢。靜靜雞揀一個，會令用戶對住一個控件，但個預覽根本唔理佢個值，所以個 module 會揀一個有文件記載嘅贏家，再回傳一個 note 講明邊個屬性輸咗，畀編輯器擺喺個控件隔籬顯示。

字型選擇器提供 application 自己帶嘅字型，加上佢可以合理假設已安裝嗰啲，仲可以透過 `queryLocalFonts()` 問 Chromium 攞其餘嘅，而用戶係可以拒絕嘅。佢砌出嚟嘅每條 stack 最後都會有一個 generic，而且會 append 支援 CJK 嘅字型，因為文字一有中日韓字元，淨係得拉丁字母嘅字型就冇嘢可以畫，瀏覽器就會亂咁 fallback。

#### 編輯器編輯緊佢自己

編輯器嘅 root 帶住 `appearance.editor` target 解算出嚟嘅外觀，所以將編輯器指住自己個 chrome，就會喺佢開住嗰陣改自己個樣。一個連自己對話框都 theme 唔到嘅 theming 功能係唔完整嘅，而呢個亦都係最平嘅整體測試：編輯器如果連自己都改唔到，佢就乜都改唔到。

編輯器刻意唔做成一版 page。外觀係要望住個元素去判斷，唔係望住一張表格，所以佢係一個貼喺被編輯物件隔籬嘅非 modal 介面，入面郁任何嘢都會即刻改到實時嘅元素。

#### 預設集、匯出同匯入 (Presets, export and import)

具名 preset 可以儲存、套用同刪除；刪除會經 [super-confirmation gate](./super-confirmation.md)，因為佢會連埋所有跟緊嗰個 preset 嘅元素所繼承嘅設定一齊帶走。成套 theme 會匯出成 JSON，帶住一個格式標記，令一個唔相干嘅 JSON 檔唔會被當成 theme；匯入會報告佢用到同用唔到啲乜。

**唔認得嘅 key 會喺來回轉換之後生還。** 由較新 build 匯出嘅 theme 會帶住呢個 build 從未聽過嘅區段。最順手嘅實作就係掉咗佢哋，但咁樣即係話用戶用舊版本打開自己個 theme、改一隻字型、儲存，就已經靜靜雞刪咗新版本加嘅所有嘢。所以任何認唔到嘅嘢都會泊喺記錄嘅 `preserved` 袋入面，原樣寫返出去。呢個 build 畫唔到嗰啲值，亦都從來冇話自己畫到；佢淨係唔想做令佢哋消失嘅元兇。型別錯咗嘅值一樣咁處理，並且喺匯入報告入面點名，而唔係刪咗佢。

### 設定 (Configuration)

儲存 key 係 `localStorage` 入面嘅 `worldlens-appearance`；當冇當前狀態嗰陣，舊嘅 key 會被複製一次過嚟。匯出格式標記係 `worldlens-appearance`，而舊嗰個帶前朝產品名嘅 appearance 格式標記匯入仍然接受。匯出版本係 `APPEARANCE_VERSION`，而家係 2。全域層 id 係 `GLOBAL_TARGET`，即係保留嘅 element id `global`。右鍵選單入面 **Edit appearance...** 排喺宿主自己啲選單項目下面。想直接開編輯器可以 Shift 加右鍵，或者撳 `Ctrl+Shift+F10`。用鍵盤開右鍵選單就撳 `Shift+F10` 或者 Menu 掣。

鍵盤路徑唔係客氣嘢：`Shift+F10` 同 Menu 掣就係 Windows 用戶開右鍵選單會撳嘅嘢，所以佢哋就要開得到呢個。`Ctrl+Shift+F10` 對應 Shift 加右鍵；個選單項目會喺 label 隔籬顯示嗰個快捷鍵，而且係由同一個綁定佢嘅 handler 出嘅；wrapper 亦都透過 `aria-keyshortcuts` 宣告兩者，輔助科技就係靠呢樣去知道一啲佢睇唔見嘅綁定。

`menu` slot 會 render 喺外觀指令上面，所以一個本身已經有管理選單嘅元素會保留佢，再喺下面多咗 **Edit appearance...**，而唔係成個選單畀人換咗。

#### 而家有邊啲元素可以編輯

`AppearanceTarget` 係一個 wrapper，所以可編輯元素嘅集合，就等於佢實際包住嘅地方嘅集合。喺 default branch 上面，即係視窗標題列、tab bar、每一行 server profile，同埋編輯器自己個 chrome。application 入面其他所有已 render 嘅元素而家都仲未係 target；周邊嘅 contract 要求全部都要做到，而呢個缺口係寫喺專案嘅 contract 頁度，唔會喺呢度含混過去。

### 失敗情況 (Failure modes)

- **parse 唔到嘅顏色**會原文保留、唔畫出嚟、並且點名話返畀用戶知，永遠唔會換成黑色。
- **sRGB 以外嘅顏色**會保留，畫成佢 clip 後嘅等價色，並且報告為已 clip，而唔係靜靜雞改咗。
- **呢個引擎畫唔到嘅屬性**會照樣顯示，附帶解釋，同埋保住佢儲存嘅值。
- **兩個 CSS 唔可以同時兌現嘅裝飾控件**：會套用有文件記載嘅贏家，輸咗嗰個屬性會喺自己控件隔籬點名。
- **由較新 build 出嘅 theme 檔**可以匯入，render 呢個 build 識嘅部分，其餘嘅喺下次匯出時原封不動咁寫返出去。
- **匯入 theme 入面型別錯咗嘅值**會保留同報告，唔會掉咗，等用戶知道自己邊項設定冇生還，可以自己修返。
- **儲存拒絕寫入，或者存住呢個 build 唔預期嘅形狀**：兩個方向都有守衛而且係靜靜地處理，爛嘅 blob 會修復而唔係信佢，因為個檔案係可以用手改、亦可以畀舊版本嘅 application 改。
- **瀏覽器拒絕字型列舉**：picker 會提供內置同假設已安裝嘅字型家族，唔會講啲嚇親人嘅嘢；`queryLocalFonts` 係防禦性咁去攞，永遠唔會 throw。

### 保安考慮 (Security considerations)

呢度冇任何嘢會掂到網絡：兩套內置字型家族係跟 application 出嘅，冇字型、樣式表或者顏色會經網絡攞，亦都冇任何嘢會傳送或者記錄。正因為咁，shell 先可以喺 Content-Security-Policy 入面保持 `font-src 'self'`。

外觀係寫入 `localStorage`，而且淨係喺用戶要求嗰陣先匯出。匯出嘅 theme 係一份載住顏色、尺寸同字型家族名嘅 JSON；佢唔帶任何路徑、token，亦唔帶 application 資料嘅任何內容。

字型列舉係一項需要權限嘅瀏覽器能力，亦都當佢係咁去處理：要問准、可以被拒絕，而被拒絕係一個普通結果，唔係一個錯誤。

匯入嘅 theme 係資料，唔係程式碼。佢會用 JSON parse，每個認得嘅值都會對佢聲稱要設定嘅屬性做驗證，任何認唔到嘅嘢都會當成不透明資料保留，而呢個 build 永遠唔會去解讀佢。佢帶住嘅顏色字串係由本專案自己嘅 parser 去 parse，再由本專案自己嘅 formatter 變成宣告，所以一個匯入嘅字串冇可能變成任意 CSS。

### 無障礙 (Accessibility)

編輯器用指標同用鍵盤都到得，兩條路徑對等而且都有宣告。佢係非 modal 而且有錨定，會跟住個 anchor 郁，去到 viewport 邊緣會翻邊，閂嘅時候會將 focus 交返畀佢啱啱編輯緊嗰個元素。佢自己個搜尋欄同其他搜尋列一樣帶住 regex builder。色彩選擇器會講明當前色彩空間，亦會對相關前景或者背景報告對比度，令一個配色決定可以驗證而唔係靠估。凡係引擎唔支援嘅屬性都會照樣顯示並附解釋，唔會消失，咁用鍵盤導航嘅人所面對嘅控件集合就會保持穩定。

### 驗證 (Verification)

測試檔各自守住以下嘢。`appearanceRecord.test.ts`：缺席即繼承、出現即覆寫，逐屬性 reset 係移走主張而唔係凍結一個值，parse 唔到嘅顏色係報告而唔係畫出嚟。`appearanceStore.test.ts`：包括全域 target 嘅分層解算、兩個方向都有守衛嘅持久化、爛 blob 係修復而唔係信任、未知 key 同型別錯嘅值會保留同報告，以及 preset 嘅套用、儲存同移除。`colorSpaces.test.ts`：雙向轉換、規格指定嘅 D50 同 D65 白點，以及超色域值係帶住而唔係 clamp。`colorParse.test.ts`：翻譯器接受嘅每種記法、alpha 保留，同埋每種 parse 失敗都按原因區分。`colorFormat.test.ts`：佢寫得出嘅每種記法、clip 報告同對比度報告。`typographySpec.test.ts`：逐屬性嘅能力偵測、能力缺席時個值仍然保留，以及有文件記載嘅裝飾贏家連同點名輸家嗰個 note。`fontCatalog.test.ts`：stack 一定以 generic 結尾、有 append CJK fallback，同埋列舉唔會 throw 亦唔需要喺 import 時有瀏覽器。`InfiniteColorPicker.test.ts` 係 mount 測試：連續場、用每種記法打字、複製表示法同色域警告。`AppearanceTarget.test.ts` 亦係 mount 測試：右鍵選單入面宿主自己啲項目喺外觀項目上面、兩條鍵盤路徑、編輯器有錨定同交返 focus，以及 wrapper 淨係喺有 box 宣告嗰陣先變成 box。

喺 `design/` 目錄用 `npx vitest run packages/ui/src/components/appearance` 執行佢哋。

### 建議閱讀 (Suggested reading)

英文版最後指向三篇文：[Tabbed navigation](./tabbed-navigation.md)，佢喺每個 tab 同 group 上面帶住一份不透明嘅外觀記錄而永遠唔會讀入面；[Super confirmation](./super-confirmation.md)，佢擋喺刪除 preset 前面；同埋 [The regex builder and the search bars it reaches](./regex-builder.md)，佢供應編輯器同 picker 嘅搜尋欄。
