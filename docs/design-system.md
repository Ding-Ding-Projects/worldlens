# The design system: Material Design 3 tokens, and what spends them

Every visual decision in this application resolves to one of the tokens below. Nothing in a
component hard-codes a corner radius, a shadow, a type size, a state-layer opacity or an
animation curve; a component that needs one names the token, and the token is declared once.

The reusable contract is the publishable `@worldlens/design-system` package. Its
`design/packages/design-system/src/tokens.css` file owns the vocabulary,
`src/colors.ts` owns the framework-neutral colour roles, and `src/theme.ts` owns the
Vuetify themes, component defaults and plugin factory. The WorldLens application imports
that package from `design/packages/ui/src/main.ts` and `design/packages/ui/src/vuetify.ts`;
`design/packages/ui/src/styles/global.scss` remains the product-specific rule layer that
spends the shared tokens. `design/packages/ui/src/vuetify.test.ts` holds the integration to
those claims.

Consumers install `@worldlens/design-system` with compatible Vue and Vuetify peers, import
`@worldlens/design-system/tokens.css` once, and call `createWorldLensDesignSystem()`. A
framework-neutral surface can instead import only `@worldlens/design-system/colors`, while
a product-specific presentation mode can supply an additional theme to the factory without
moving that product behavior into the package.

## Why this exists

The application is built from Vuetify components, so for a long time "how it looks" was
whatever Vuetify's own defaults said. That produced two silent problems.

The first was colour. Each theme named five colours - primary, secondary, surface,
background, error - and every other Material role a component asked for was answered from
Vuetify's grey reference palette. So `outline`, `surface-variant` and the whole container
ladder were not this product's palette at all, and the marker layer, which needs real M3
roles, derived its own approximations with `color-mix` arithmetic.

The second was everything that is not colour. **Vuetify's `rounded` scale is Material 2
arithmetic wearing Material 3 names**: its `lg` is 8px where M3's is 16px, its `xl` is 24px
where M3's is 28px, and it has no `md` step at all. Its state-layer opacities are M2's
0.04/0.12/0.12/0.08 rather than M3's 0.08/0.1/0.1/0.16, and its elevation is M2's
umbra/penumbra/ambient triple rather than M3's key-plus-ambient pair. The md3 blueprint
already set cards to `rounded="lg"` - so the cards were *asking* for the large corner and
getting 8px. Setting component defaults alone would have changed nothing visible.

That is why `global.scss` re-points the utility classes themselves at the tokens. `.rounded-lg`
now resolves to the real 16px, `.rounded-xl` to 28px, `.rounded-md` exists at all, and
`.elevation-0` through `.elevation-5` draw M3's ladder. One edit, every screen.

## The tokens

### Colour

The full M3 role set, per theme, in `vuetify.ts`: primary, secondary and tertiary each with
their container and `on-` pairs; the error ramp; background and surface; the five-step
surface container ladder (`lowest`, `low`, default, `high`, `highest`) plus `dim`, `bright`
and `light`; `surface-variant`; `outline` and `outline-variant`; the inverse roles; `tint`,
`scrim` and `shadow`.

Dark and light are generated from the tonal palettes of the blue seed the app has always
used - `#00639B` is that family's tone 40 and `#8FCDFF` its tone 80, and both are pinned by
test so the scheme cannot be quietly regenerated from a different seed. Light schemes take
primary/secondary/tertiary at tone 40 on containers at 90, dark at tone 80 on containers at
30, per the spec.

The contrast theme is deliberately **not** tonal. It answers the same role names with the
highest-contrast values that keep their meaning: black at every surface tier, white text and
outlines, white primary, yellow secondary. Deriving it from a seed would defeat the one thing
it exists for.

`styles/markers.scss` maps these onto `--md-sys-color-*` for the viewer's raw-DOM marker
layer, which sits outside the Vue tree and so is reached by no component stylesheet.

### Shape

| Token | Value | Spent on |
|---|---|---|
| `--md-sys-shape-corner-none` | 0px | Window caption buttons |
| `--md-sys-shape-corner-xs` | 4px | `.rounded` |
| `--md-sys-shape-corner-sm` | 8px | `.rounded-sm` |
| `--md-sys-shape-corner-md` | 12px | Text fields and everything built from one |
| `--md-sys-shape-corner-lg` | 16px | Cards, sheets, alerts, banners, lists, snackbars |
| `--md-sys-shape-corner-xl` | 28px | Dialogs and menus, through the surfaces they contain |
| `--md-sys-shape-corner-full` | 9999px | Buttons, chips, button groups |

### Type

Fifteen ramps - display, headline, title, body and label, each large/medium/small - and each
with four axes: `-size`, `-line-height`, `-weight`, `-tracking`. Every value is in `rem` and
**no rule anywhere sets a root font size**, because interface scale belongs to the
interface-size dial (see [Display and ease of use](./display-and-ease-of-use.md)), which
works through page zoom. Headings map onto the scale at zero specificity with `:where()`, so
a component that has its own opinion still wins, and so does the appearance editor.

Prose is capped at a 68ch measure. The wizard was running roughly 150 characters to a line on
a wide window, which is about double what is readable. The cap applies to `<p>` only and is
released explicitly inside tables, `pre`, `code`, `kbd` and `samp`, where a paragraph is a
cell or a path rather than prose.

### Elevation, state and motion

Elevation is `--md-sys-elevation-shadow-level0` through `level5`, M3's key-plus-ambient
shadow pair. It is deliberately **not** named `--md-sys-elevation-levelN`: `markers.scss`
owns that name for a `drop-shadow()` filter chain and is imported later, so a `box-shadow`
under that name would be silently clobbered into an invalid declaration and every elevated
surface would go flat. A test pins the absence.

State layers are `--md-sys-state-hover-opacity` 8%, `-focus-` 10%, `-pressed-` 10%,
`-dragged-` 16%, and `global.scss` re-points Vuetify's own `--v-*-opacity` variables at them
so every state overlay in the framework retunes from one place.

Motion is the MD3 Expressive set: seven easings - `emphasized` and its decelerate/accelerate
variants, `standard` and its two, and `linear` - and a twelve-step duration ladder,
`short1..4` at 50/100/150/200ms, `medium1..4` at 250/300/350/400ms, `long1..4` at
450/500/550/600ms.

**Reduced motion is absolute.** The kill switch at the bottom of `global.scss` is last in the
file and uses `!important`, so it outranks any normal declaration regardless of which token
fed it. A surface that animates through a Vue `<Transition>` rather than a CSS rule has to
degrade itself as well, and is tested for it.

## Component defaults

`WORLDLENS_COMPONENT_DEFAULTS` in `design/packages/design-system/src/theme.ts` spends the corrected scale once, for the whole
application, rather than in forty component files that would each then own an opinion about
what a rounded card is: things a person presses are fully rounded, containers take the large
corner, overlays take the extra-large one through the surfaces they contain, and fields sit
one step tighter than their container.

Two details worth knowing before editing it. `VDialog` and `VMenu` take no `rounded` prop, so
their corner is set on what they contain through nested defaults - the same mechanism the
blueprint uses for `VBtnGroup: { VBtn }`, and provide/inject follows the component tree
through the overlay's teleport. And `VSelect`, `VAutocomplete`, `VCombobox` and `VFileInput`
all render a `VTextField` internally and pass `undefined` where nothing was set, which
Vuetify treats as "not provided" - so the single `VTextField` entry reaches all of them.

## What overrides what

From weakest to strongest:

1. The type and heading rules in `global.scss`, written with `:where()`, at zero specificity.
2. Vuetify's component styles and this application's own component stylesheets.
3. `WORLDLENS_COMPONENT_DEFAULTS`, which a prop on the component overrides directly - that is how the
   window's caption buttons stay square against a pill default.
4. The appearance editor, which lands its per-element overrides as inline styles.
5. The reduced-motion kill switch, for motion only.

The ordering is the point: **the appearance editor must always win**, because a theming
feature that cannot theme its own application is incomplete. No rule added by the token layer
is `!important` except the two Vuetify radius and elevation utilities that already were, and
neither of those ever appears on an appearance-target wrapper.

## Verification

`vuetify.test.ts` asserts every M3 role is present as a real hex colour in all three themes;
that every `on-X`/`X` reading pair reaches WCAG AA 4.5:1 by real contrast arithmetic, with the
contrast theme at 21:1; that the token sheet publishes the whole shape scale, all fifteen type
ramps with all four axes, elevation 0-5, all four state opacities and the complete motion set;
that every type value is in `rem` and no root font size is set; that the two sheets agree
value-for-value on every token both declare; that `global.scss` re-points the utilities rather
than hard-coding a second scale; that no `!important` was added outside the two that already
had one; that the reduced-motion kill switch is still last and still absolute; and that the
map layer's stacking and pointer-events contract is untouched.

## 廣東話

### 設計系統 (design system)：Material Design 3 tokens，同埋邊啲嘢使緊佢哋

呢個 application 入面每一個視覺決定都會落到下面其中一個 token 度。冇任何 component 會硬寫死 corner radius、陰影、字級、state-layer 透明度或者動畫曲線；要用嘅 component 就叫個 token 個名，而個 token 淨係宣告一次。

代碼方面：可發布嘅 `@worldlens/design-system` 套件係共用合約。`design/packages/design-system/src/tokens.css` 係詞彙表，`src/colors.ts` 係唔依賴 framework 嘅色彩角色，而 `src/theme.ts` 就放 Vuetify theme、component 預設同 plugin factory。WorldLens application 由 `design/packages/ui/src/main.ts` 同 `design/packages/ui/src/vuetify.ts` import 呢個套件；`design/packages/ui/src/styles/global.scss` 繼續淨係放產品自己使 token 嘅規則。`design/packages/ui/src/vuetify.test.ts` 就負責釘住個接駁位講過嘅嘢。

其他介面裝好 `@worldlens/design-system` 同相容嘅 Vue、Vuetify 之後，只要 import 一次 `@worldlens/design-system/tokens.css`，再 call `createWorldLensDesignSystem()`。唔用 framework 嘅表面可以淨係 import `@worldlens/design-system/colors`；產品自己額外嘅 presentation mode 就經 factory 加 theme，唔會塞返入共用套件度。

### 點解要有呢樣嘢

呢個 application 係用 Vuetify component 砌出嚟，所以好長一段時間「佢個樣點」其實就係 Vuetify 自己嘅預設話事。噉樣製造咗兩個靜靜雞嘅問題。

第一個係顏色。每個 theme 淨係命名咗五隻色 — primary、secondary、surface、background、error — 而 component 要嘅其他所有 Material role，都係由 Vuetify 嘅灰色參考 palette 嚟答。所以 `outline`、`surface-variant` 同成條 container 階梯根本就唔係呢個產品嘅 palette，而 marker 層（佢需要真正嘅 M3 role）就要自己用 `color-mix` 運算整返啲近似值出嚟。

第二個係除咗顏色以外嘅所有嘢。**Vuetify 個 `rounded` scale 其實係 Material 2 嘅數字著咗 Material 3 個名**：佢個 `lg` 係 8px，但 M3 嘅係 16px；佢個 `xl` 係 24px，M3 嘅係 28px；而佢根本冇 `md` 呢一級。佢嘅 state-layer 透明度係 M2 嘅 0.04/0.12/0.12/0.08，唔係 M3 嘅 0.08/0.1/0.1/0.16；佢嘅 elevation 係 M2 嗰套 umbra/penumbra/ambient 三重陰影，唔係 M3 嘅 key 加 ambient 一對。md3 藍圖本身已經將 card 設成 `rounded="lg"` — 即係啲 card *其實已經喺度要求*大 corner，但攞到嘅係 8px。淨係設 component 預設，畫面上根本唔會有任何改變。

所以 `global.scss` 直接將啲 utility class 本身重新指去啲 token。`.rounded-lg` 而家真係解到 16px、`.rounded-xl` 解到 28px、`.rounded-md` 而家先至存在，而 `.elevation-0` 去到 `.elevation-5` 畫嘅係 M3 嗰條階梯。改一次，全部畫面跟住變。

### Tokens：顏色

`vuetify.ts` 入面逐個 theme 都有完整嘅 M3 role 集：primary、secondary、tertiary 三個各自帶 container 同 `on-` 一對；error 系列；background 同 surface；五級 surface container 階梯（`lowest`、`low`、預設、`high`、`highest`）加埋 `dim`、`bright` 同 `light`；`surface-variant`；`outline` 同 `outline-variant`；inverse 系列；仲有 `tint`、`scrim` 同 `shadow`。

深色同淺色都係由呢個 app 一直用嗰隻藍色 seed 嘅 tonal palette 生成 — `#00639B` 係嗰家族嘅 tone 40，`#8FCDFF` 係 tone 80，兩隻都有測試釘住，所以個 scheme 唔可以靜靜雞用第二隻 seed 重新生成。跟 spec，淺色 scheme 嘅 primary/secondary/tertiary 用 tone 40，container 用 90；深色就用 tone 80，container 用 30。

contrast theme 就**故意唔係** tonal 嘅。佢用一啲仍然保住原意、對比最高嘅值去答同樣嘅 role 名：每一層 surface 都係黑、文字同 outline 白、primary 白、secondary 黃。如果由一隻 seed 推導出嚟，就會毀咗佢存在嘅唯一理由。

`styles/markers.scss` 將呢啲對應去 `--md-sys-color-*`，畀 viewer 嗰個 raw-DOM marker 層用；嗰層喺 Vue tree 外面，所以任何 component stylesheet 都掂佢唔到。

### Tokens：形狀

形狀 token 有七個。`--md-sys-shape-corner-none` 係 0px，用喺視窗 caption 掣；`-xs` 4px 對應 `.rounded`；`-sm` 8px 對應 `.rounded-sm`；`-md` 12px 用喺 text field 同所有由 text field 砌出嚟嘅嘢；`-lg` 16px 用喺 card、sheet、alert、banner、list、snackbar；`-xl` 28px 經 dialog 同 menu 入面裝住嗰啲 surface 落到佢哋度；`-full` 9999px 用喺掣、chip 同 button group。

### Tokens：字體

十五條 ramp — display、headline、title、body 同 label，每個都有 large/medium/small — 每條各有四條軸：`-size`、`-line-height`、`-weight`、`-tracking`。每個值都係用 `rem`，而且**冇任何規則喺任何地方設 root font size**，因為介面比例係屬於 interface-size 撥掣嗰邊嘅事（見 [Display and ease of use](./display-and-ease-of-use.md)），佢係經 page zoom 做嘢。標題係用 `:where()` 以零 specificity 對應落個 scale，所以有自己主張嘅 component 照樣贏，appearance editor 亦都一樣。

正文闊度封頂喺 68ch。之前 wizard 喺闊視窗度一行大約行到 150 個字符，差唔多係可讀範圍嘅兩倍。呢個上限淨係套用喺 `<p>`，而喺 table、`pre`、`code`、`kbd` 同 `samp` 入面會明確解除，因為喺嗰啲位一段嘢其實係個 cell 或者一條路徑，唔係正文。

### Tokens：elevation、state 同 motion

Elevation 係 `--md-sys-elevation-shadow-level0` 去到 `level5`，即 M3 嗰對 key 加 ambient 陰影。佢**故意唔**叫做 `--md-sys-elevation-levelN`：嗰個名畀 `markers.scss` 攞咗嚟做 `drop-shadow()` filter 鏈，而且 `markers.scss` 遲啲先 import，所以如果有個 `box-shadow` 用埋呢個名，就會靜靜雞被蓋成一句無效宣告，跟住每個有 elevation 嘅 surface 都會變平。有測試釘住呢個名唔可以出現。

State layer 係 `--md-sys-state-hover-opacity` 8%、`-focus-` 10%、`-pressed-` 10%、`-dragged-` 16%，而 `global.scss` 將 Vuetify 自己嘅 `--v-*-opacity` 變數重新指去佢哋，所以整個 framework 嘅 state overlay 都可以喺一個地方調校。

Motion 用嘅係 MD3 Expressive 嗰套：七條 easing — `emphasized` 同佢嘅 decelerate/accelerate 版本、`standard` 同佢嗰兩個，加埋 `linear` — 同埋十二級時長階梯，`short1..4` 係 50/100/150/200ms，`medium1..4` 係 250/300/350/400ms，`long1..4` 係 450/500/550/600ms。

**Reduced motion 係絕對嘅。** 個 kill switch 擺喺 `global.scss` 最底、係成個檔案最後嗰段，仲用埋 `!important`，所以唔理係邊個 token 餵落去，佢都越得過任何普通宣告。如果一個 surface 係經 Vue `<Transition>` 而唔係 CSS 規則做動畫，佢就要自己降級，而呢樣嘢有測試。

### Component 預設

`design/packages/design-system/src/theme.ts` 入面嘅 `WORLDLENS_COMPONENT_DEFAULTS` 為成個 application 一次過使咗嗰套改正咗嘅 scale，而唔係散喺四十個 component 檔案度、然後每個都對「一張 rounded card 到底係點」有自己一套主張：人會撳嘅嘢就全圓，container 攞大 corner，overlay 就經佢哋裝住嗰啲 surface 攞 extra-large，而 field 就企喺比佢個 container 緊一級嗰度。

改之前有兩件事要知。`VDialog` 同 `VMenu` 冇 `rounded` prop，所以佢哋個 corner 係經 nested defaults 設喺佢哋裝住嗰啲嘢度 — 同藍圖用喺 `VBtnGroup: { VBtn }` 嗰個機制一樣，而 provide/inject 會跟住 component tree 穿過 overlay 個 teleport。另外 `VSelect`、`VAutocomplete`、`VCombobox` 同 `VFileInput` 內部都係 render 一個 `VTextField`，而冇設過嘅位會傳 `undefined`，Vuetify 當佢係「冇提供」— 所以單單一條 `VTextField` entry 就掂得到佢哋全部。

### 邊個蓋過邊個

由最弱到最強：先係 `global.scss` 入面用 `:where()` 寫、specificity 為零嘅字體同標題規則；跟住係 Vuetify 嘅 component 樣式同呢個 application 自己嘅 component stylesheet；再上係 `WORLDLENS_COMPONENT_DEFAULTS`，而 component 上面嘅 prop 可以直接蓋過佢 — 視窗 caption 掣就係噉樣喺一個 pill 預設之下保持方形；再上係 appearance editor，佢啲逐元素覆寫係以 inline style 落地；最上面係 reduced-motion kill switch，不過淨係管 motion。

呢個次序本身就係重點：**appearance editor 一定要贏**，因為一個連自己個 application 都主題唔到嘅 theming 功能係唔完整嘅。token 層新加嘅規則入面冇一條係 `!important`，除咗本身已經係 `!important` 嗰兩個 Vuetify radius 同 elevation utility，而嗰兩個都永遠唔會出現喺 appearance-target wrapper 上面。

### 驗證

`vuetify.test.ts` 會 assert：三個 theme 入面每個 M3 role 都真係以 hex 色值存在；每對 `on-X`/`X` 閱讀組合經真實對比運算都到 WCAG AA 4.5:1，而 contrast theme 去到 21:1；token sheet 有出齊成個 shape scale、十五條字體 ramp 連四條軸、elevation 0-5、四個 state 透明度同完整嘅 motion 集；每個字體值都用 `rem` 而且冇設 root font size；兩份 sheet 對佢哋都有宣告嘅每個 token 值對值一致；`global.scss` 係重新指向啲 utility 而唔係硬寫多一套 scale；除咗本身已經有嗰兩個之外冇新加過 `!important`；reduced-motion kill switch 仍然喺最後而且仍然絕對；以及 map 層嘅 stacking 同 pointer-events 合約冇被改動。
