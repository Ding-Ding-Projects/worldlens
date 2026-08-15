# Kid Mode: a presentation layer, not a fork

A fresh install opens in Kid Mode. Bigger buttons, picture-first labels, a bobbing mascot, an XP
bar and a sticker book for real things a child actually did. Every one of those rows is drawn from
the same catalogues, job registry and settings sections the grown-up shell already computes; Kid
Mode relabels and resizes them, and never adds, removes, renames or gates a single capability.
Adult Mode is the thing a grown-up switches *to* - reachable in two places, neither of which asks
for anything unless somebody has actually set up something to ask for.

The code is `design/packages/ui/src/kid/`: sixteen files that wrap the existing shell rather than
duplicate it. Three things outside that folder are what actually put Kid Mode on screen - `App.vue`
mounts `KidShell` in place of the ordinary shell while `kid.enabled` is true, `vuetify.ts` registers
Kid Mode's own colours as a fourth Vuetify theme alongside dark, light and contrast, and
`settingsSections.ts` adds the one settings row that turns it off. None of the sixteen files inside
`kid/` invent a second copy of anything they touch.

## Behaviour

### A skin, and a test that stops it becoming a fork

The single fact every other paragraph in this article depends on: Kid Mode does not know what a
feature *is*. `KidHome.vue` and `KidCataloguePage.vue` render whatever `ResolvedCatalogue[]` the
adult shell hands them as a prop - the same eighty-four catalogue features, in the same five
catalogues, that `catalogues.ts` already declares and `capabilities.ts` has already filtered down
to what this checkout can actually do. `KidJobStrip.vue` re-hosts `WorkPane.vue` rather than
reimplementing a job list. `KidGrownUpGate.vue` mounts the real `AppSettings.vue` and the real
options editor, with their real props. Activation, everywhere, still goes through
`shellNavigation.ts`'s `activateTarget`, exactly as a click on the adult Home's own cards does.

`kidMode.contract.test.ts` is what keeps that true rather than merely intended. It asserts, from
the source registries themselves rather than from a number written down in the test: every one of
the eighty-four catalogue features has a kid label, every one of the eighteen jobs and eighteen
settings sections does too, every one of the five catalogues does, the kid colour scheme answers
exactly the roles the dark scheme declares and no others, and every sticker names a feature that
genuinely exists in the catalogue. A kid label going missing, a feature quietly becoming
unreachable, a second credential, or a new colour token invented for Kid Mode alone all fail this
one file. (`kidLabels.ts`'s own doc comment notes that its source registry briefly disagreed with
itself about whether there were eighty-four or eighty-five features; the count in the test is
derived from `ALL_CATALOGUE_FEATURES.length` rather than typed in, which is exactly what let that
stale "eighty-five" be caught rather than quietly trusted.)

### On by default, and where Adult Mode actually lives

`kid.enabled` is the one flag `App.vue` checks to decide which shell to mount, and it ships `true`.
A newly installed copy of the application - nobody has touched a setting yet - opens straight into
the rail, the GO card and the five lands described below, not into the ordinary tab strip. That
makes the way back the first thing worth knowing, not an afterthought:

- The **grown-up padlock** on the kid rail's own footer, beside Find and Messages, opens the gate
  described below right there inside the kid shell.
- Once past the gate, the settings surface it reveals carries a **Kid mode** row
  (`KidModeRow.vue`) whose "Use kid mode" checkbox is the actual switch. Unticking it is what swaps
  the whole shell back to the ordinary one; ticking it again puts a child straight back where they
  left off, because nothing about their progress or their preferences lived inside the shell that
  was swapped out.

Both "Kid mode" and the shared restricted mode's own row are ordinary rows on an ordinary settings
surface, so both are findable the same way every other setting is: through that surface's own
search field and through the command palette, by either name.

### The five lands, and the same catalogue that draws them

`KidHome.vue` is Kid Mode's Home: a hero card for the project editor (exactly the same
`findFeature("make.finding-a-world.the-project-editor")` the adult Home's own hero resolves to),
five buttons for the five catalogues rendered as "lands" (`Make a map`, `Your maps`, `Show people`,
`Keep it safe`, `Buttons & help`), a panel for what the app is doing right now built from the same
render rows, backup and CI activity the adult shell already computes, and a panel listing the maps
and servers this machine knows about. Pressing a land opens `KidCataloguePage.vue`, which groups
that catalogue's features exactly as they are grouped everywhere else and offers the same
`filterCatalogues`/`buildMatcher` search, with `ConfigRegexBuilder` behind the same anchored `.*`
toggle every other search bar in this application already carries. Nothing here keeps a list of its
own; everything is what the catalogue already says, laid out bigger.

### Kid labels never replace the real name

`kidLabels.ts` maps the shipped English name of a feature, job or settings section to a label a
four-to-six-year-old can read - "Build room" for the project editor, "Robot helpers" for rendering
in GitHub Actions, "Grown-up lock" for the shared restricted mode. `kidLabel()` returns a
`{ primary, secondary }` pair whose order depends on the label style a grown-up chose (kid words
first, real name first, or real names only), and a shipped name with no entry in the table simply
renders as itself with no secondary line at all - a missing label is never a missing feature,
because `kidLabel()` falls back to the argument it was given rather than to nothing.

`kidAccessibleName()` is the part that makes this safe to ship on the same build a grown-up uses:
whatever the label style is set to, the accessible name of every kid-labelled control still carries
the shipped feature name, as `"{kid label} — {shipped name}"`. A screen reader, the tab finder, the
command palette's own search, and every screenshot this project's harness takes therefore still
identify a feature by the name its documentation uses, even on a screen where the visible text says
"Robot helpers." `kidMode.contract.test.ts` checks this at all three label styles for all
eighty-four features, not just the default one.

### The job strip: `WorkPane` re-hosted, never re-implemented

`KidJobStrip.vue`'s own doc comment states the constraint plainly: it wraps `WorkPane.vue`, which
already builds the page list, the three seeded groups and the pinned set from `jobRegistry.ts`,
filters out anything `capabilities.ts` has already gated off, and forwards every named slot it is
given straight through to the tab system. Kid Mode adds exactly two things on top. First, kid
labels applied through `WorkPane`'s own exposed `renamePage(pageId, label)` - the same mechanism
the tab system already offers for a label that changes - run once when the strip mounts and again
whenever the label style or the enabled flag changes, over the whole job registry rather than only
the jobs currently open, so a job opened later still picks up the current label. Because a rename
persists exactly the way a user's own tab rename does, kid labels survive a restart, and turning
Kid Mode off puts the shipped labels straight back. Second, kid-sized chips: a 64px minimum chip
height and a two-line chip, as scoped CSS reaching into the tab strip's own class names - the one
place Kid Mode does that, and done because there is no chip slot to hand a size to instead.
Everything else about the tab system - docking to any edge, groups, pinning, drag reorder,
overflow, its four discovery searches, bulk close with a preview, and workspace persistence across
restarts - keeps working exactly as it does in Adult Mode, because `KidJobStrip` is not a second
implementation of any of it.

### The grown-up gate

Pressing the rail's padlock opens `KidGrownUpGate.vue`, and what it shows next depends on one fact
about this machine rather than on Kid Mode itself: whether the application's shared restricted-mode
record (`components/setup/schoolMode.ts`, the same record and the same renamable "School mode" the
rest of this application already shares one credential for) actually has a credential configured
yet.

- **Nothing has been set up.** This is the state of a fresh install, because nobody has visited the
  shared restricted mode's own setting to give it a PIN, password or passkey. The gate reads
  exactly that - `credentialConfigured` is false - and lets the grown-up straight through to the
  real `AppSettings.vue` and the real options editor with no prompt at all, and says so in its own
  copy rather than pretending a credential exists. This is also, in practice, how the first
  credential ever gets set: a grown-up walks straight through the very first time, finds the shared
  restricted mode's own row inside the settings it can now see, and sets one there if they want the
  gate to actually ask next time.
- **A credential exists.** Once one has been configured - by this route or from anywhere else in
  the application, because it is one shared record - the gate asks for it before showing settings,
  clears the field on every attempt, and reports a wrong entry as "that code did not match, nothing
  was changed" with no further detail and no escalation.

Either way, the surfaces behind the gate are the real ones with their real props: `AppSettings.vue`
takes the same `open`/`anchor`/`anchor-missing`/`updates` it always takes, and the options editor is
the same full-bleed overlay it always was. A grown-up who arrives here because a problem needs
fixing sees that problem's own remedy button ahead of the settings surface itself, because that is
usually why the gate got opened in the first place.

### XP, levels and stickers, each bound to something that actually happened

`useKidProgress.ts` keeps an append-only ledger of stickers won and the XP that came with each one,
persisted locally under `bluemap-kid-progress`. A level is `floor(xp / 500) + 1`; the level readout
and the XP bar in `KidShell.vue`'s status header both read straight from it. `award(id)` is called
from the completion event of a real action - rendering a first map, finding a world, adjusting
render speed, dropping a marker, backing up, publishing, running the automatic repair, restoring a
version from history - and it is a deliberate no-op for a sticker already won, so nothing here can
double-award or, more importantly, congratulate a child for something the application did not
actually do. `kidMode.contract.test.ts` checks every one of the eight stickers names a feature that
genuinely exists in the catalogue. `KidStickerBook.vue` shows every sticker, won or not, plainly
labelled either way - nothing is hidden or teased - and pressing one opens the feature it was
earned from, so the book doubles as a second route into the catalogue rather than a dead trophy
shelf.

### Celebration, sound, and reduced motion

`KidCelebration.vue` is fired only from `award()`'s return value, so it can never celebrate
something that did not happen. It is a notice rather than a dialog - it never blocks, and it
dismisses on its own. `useMayAnimate()` is the single gate for whether anything in Kid Mode
animates at all: celebrations have to be turned on *and* the OS must not be asking for reduced
motion, and the same gate covers the mascot's bob on Home and the celebration's own pop-in, both
wrapped in `@media (prefers-reduced-motion: no-preference)` on top of that JavaScript check. With
reduced motion active, a celebration still appears; it simply does not animate in.

The "Play a sound with a celebration" checkbox (`kid.sound`) is off by default and persists
independently of celebrations themselves. Its own type comment states the intent plainly - silent
whenever reduced sound or quiet hours apply, the same convention the application's own (not yet
shipped) spoken narrator is specified to follow - but as of these sixteen files, `KidCelebration.vue`
plays no audio at all: the preference is stored and offered, and nothing in Kid Mode yet reads it to
actually make a sound. Turning the checkbox on changes nothing audible today. That is stated here
rather than left for a reader to discover by trying it, because an unread preference is exactly the
kind of gap this project's own documentation convention asks to be named rather than implied.

### Colour and shape, borrowed roles

`kidTheme.ts`'s `KID_SCHEME` answers the same Material Design 3 role names `colorRoles.ts` already
declares - `primary`, `primary-container`, `surface-container-high`, and the rest - rather than
inventing a new token. It keeps the product's existing seed blue and moves the surfaces to a light,
high-chroma treatment with the sunshine yellow as `tertiary`. `kidMode.contract.test.ts` asserts the
kid scheme's key set is identical to the dark scheme's, sorted, so nothing here can silently add a
role no other theme has to answer for. Shape and density are CSS custom properties on the shell
root (`KID_SHELL_VARS`) rather than new tokens: rounded corners from 16px to a full pill, a
Baloo-2-led font stack, and a 64px minimum target - the adult shell's floor is 48px, and Kid Mode
only ever raises it.

### Kid Mode's own copy, and the upstream trap it deliberately avoids

`kidCopy.ts` carries Kid Mode's translation keys in the same `VOICED`/`FIXED` shape every other
surface's copy file uses, described in full in
[Language modes and funny levels](./language-and-tone.md): each `VOICED` entry carries five English
and five Cantonese strings, one per funny level, and every `FIXED` entry - the grown-up gate's
honesty line and its credential label among them - carries one string per language with no level.
Registered the same way every other surface's catalogue is, Kid Mode's strings reach all three
language modes and both funny-level sliders with no component edited.

What `kidCopy.ts` deliberately does *not* carry is any of the roughly eighty keys this project's own
copy catalogue has learned not to answer: the bundled locale files under `public/lang/` are upstream
BlueMap's own viewer locale strings, and voicing one of them here would substitute this project's
English for a real translation in front of every reader of that language rather than adding a
funny-level voice to a string this project actually owns.
[`copy/catalogueCoverage.test.ts`](./language-and-tone.md) enforces the boundary generally; Kid Mode
simply never gives it anything to catch. Destructive-action, security, accessibility and error copy
is likewise absent from `kidCopy.ts` on purpose: Kid Mode never rewords any of it, so the existing
`FACTS` assertions that pin those sentences to their required substrings at every funny level keep
passing untouched, and a locked-out grown-up or a failed render reads the same honest sentence
whichever mode drew the screen around it.

## Configuration

| Setting | Storage key | Default |
|---|---|---|
| Kid Mode on/off | `bluemap-kid-mode` | `true` |
| Child's name | `bluemap-kid-name` | `"Explorer"` |
| Label style (`kid-first` / `name-first` / `name-only`) | `bluemap-kid-label-style` | `"kid-first"` |
| Celebrate finished jobs | `bluemap-kid-celebrations` | `true` |
| Play a sound with a celebration | `bluemap-kid-sound` | `false` |
| XP and sticker ledger | `bluemap-kid-progress` | `{ "xp": 0, "won": [] }` |

Every one of those keys is read once at startup and written back on every change through a single
`persisted()` helper in `kidMode.ts`; there is no separate migration path because there is no older
key to migrate from. Reduced motion is the one field on `KidModeState` that is never persisted at
all - it is read live from `matchMedia("(prefers-reduced-motion: reduce)")` and kept current through
that query's own `change` event, so a preference changed at the operating system level while the
application is open takes effect immediately rather than waiting for a restart.

Switching shells is also a theme switch, and a deliberate one. Kid Mode's colours are registered as
their own named Vuetify theme (`kid`) rather than painted over whichever adult theme was active, so
turning Kid Mode off does not leave the application looking like Kid Mode with the rail hidden -
Adult Mode's own `bluemap-theme` record, the one [Display and ease of use](./display-and-ease-of-use.md)
describes, is untouched by any of this and is exactly what reappears, defaulting to "follow the
system" on a machine that has never chosen one and to whatever a grown-up chose the last time they
were in Adult Mode otherwise.

## Failure modes

- **A feature, job or settings section has no kid label.** `kidLabel()` returns the shipped name as
  `primary` and `null` as `secondary`; the row still renders, still routes through the same
  activation path, and is still reachable by its shipped name in every search. A missing label is
  never a missing feature.
- **A capability this checkout lacks.** `capabilities.ts` resolves it as absent before Kid Mode ever
  sees the catalogue, so it is simply not in the `ResolvedCatalogue[]` prop `KidHome.vue` and
  `KidCataloguePage.vue` render from - never a card drawn as a demo with invented status.
- **Reduced motion is on.** The mascot's bob, the celebration's pop-in, and every other
  `@media (prefers-reduced-motion: no-preference)` block in these files stop animating; content that
  would have animated still appears, just without the motion.
- **The XP ledger fails to parse.** `useKidProgress.ts`'s `read()` catches the failure and starts
  from `{ xp: 0, won: [] }` rather than applying part of a corrupt record - a ledger that half-loads
  is worse than one that resets, because a partially applied ledger can hand out a sticker for
  nothing.
- **A grown-up has never set a shared restricted-mode credential.** The gate lets them straight
  through with no prompt and says so; this is the fresh-install state, not an error path.
- **A grown-up's credential attempt does not match.** The field clears, a plain "that code did not
  match, nothing was changed" is shown, and nothing about the attempt is recorded, escalated or rate
  limited by Kid Mode's own gate.
- **"Play a sound" is turned on.** Nothing audible happens yet; see the note above.

## Security considerations

Kid Mode invents no credential of its own. The grown-up gate reads the application's one shared
restricted-mode record - the same record and the same renamable "School mode" name every surface
that uses it already shares - through `useSchoolMode()`'s `credentialConfigured` and `enabled`
state, rather than storing a second password, PIN or secret anywhere under the `bluemap-kid-*` keys
above. Nothing about the credential itself - its value, its length, or whether one is even set -
ever appears in Kid Mode's own storage, in the sticker ledger, in an export, or in a screenshot.

**It is a user-experience lock, not a security boundary**, and the gate's own copy says exactly
that: it keeps a child out of settings; it does not protect the machine from anyone who can delete
files on it. Deleting the shared restricted-mode record clears the credential the same way it does
everywhere else that record is used, which is the honest recovery route rather than a support
ticket or an account reset - a toy lock, in this project's own vocabulary for that idea, must never
be the only thing between somebody and their own settings.

The wording a fresh install actually needs is worth restating here rather than only in Behaviour:
until a grown-up has visited the shared restricted mode's own setting, there is nothing configured
to protect the gate with, so the gate does not pretend otherwise - it opens straight through, and
whether to configure a credential at all is a choice the application leaves to whoever is holding
it, not one Kid Mode makes on their behalf.

Nothing in these sixteen files reaches the network. The sticker ledger, the label style, the child's
name and every other Kid Mode preference stay in local storage under the keys listed above.

## Accessibility

Kid Mode's minimum interactive target is 64px, raised from the adult shell's 48px floor - every rail
button, every land, every catalogue row, every sticker and every job chip in these files is sized to
at least that, and nothing in Kid Mode is allowed to go below it. `kidAccessibleName()` is what
keeps the accessible name of a kid-labelled control naming the shipped feature at all three label
styles, so a screen reader identifies a control the same way this project's own documentation and
its command palette do, even where the visible label reads "Robot helpers" instead of "Rendering in
GitHub Actions." Reduced motion is respected everywhere an animation exists in these files, per the
Behaviour section above, and every icon that carries meaning rather than decoration is marked
`aria-hidden` beside a real text label rather than standing in for one. Because every string in Kid
Mode goes through the same `t()` call the rest of the application uses, Kid Mode reaches all three
language modes and both per-language funny-level sliders with no separate accessibility work: a
screen reader in bilingual mode reads Kid Mode's own English and Cantonese exactly as it reads
anything else this application says.

## Verification

| Test | What it holds |
|---|---|
| `kidMode.contract.test.ts` | Every one of the eighty-four catalogue features, eighteen jobs, eighteen settings sections and five catalogues has a kid label, derived from the source registries rather than a count written into the test; the accessible name keeps the shipped feature name at all three label styles, for every feature; the kid colour scheme answers exactly the roles the dark scheme declares, sorted, and no others; every sticker names a feature that genuinely exists in the catalogue. |

As of these sixteen files, that one test file is the whole of Kid Mode's own test coverage - it is a
coverage-and-non-divergence contract rather than a mounted-component suite, which is a deliberate
choice for a feature whose entire promise is "nothing here diverges from the real thing" rather than
"this pixel is in this place." The three edits that actually put Kid Mode on screen - mounting
`KidShell` from `App.vue`, registering the `kid` Vuetify theme, and adding the settings row that
turns it off - live outside `kid/` and are proven by that surrounding code's own tests, not by this
one.

Run it with `npx vitest run packages/ui/src/kid` from `design/`.

## Suggested articles

- [Home](./home.md) - the pinned landing tab whose hero, catalogue cards and activation handlers
  `KidHome.vue` reuses rather than reinvents.
- [The design system](./design-system.md) - the Material Design 3 role vocabulary `kidTheme.ts`
  answers rather than replaces.
- [Language modes and funny levels](./language-and-tone.md) - the `VOICED`/`FIXED` shape
  `kidCopy.ts` follows, and the upstream-locale trap its catalogue deliberately stays clear of.
- [Browser-style tabbed navigation](./tabbed-navigation.md) - every tab power `KidJobStrip.vue`
  keeps by re-hosting `WorkPane` instead of rebuilding it.
- [The regex builder and the search bars it reaches](./regex-builder.md) - the same anchored builder
  behind `KidCataloguePage.vue`'s own search field.

## 廣東話

### Kid Mode：一層外皮，唔係一個分叉版本

全新安裝一開機就係 Kid Mode：大啲嘅掣、圖像行先嘅標籤、一隻會擰吓擰吓嘅吉祥物、一條 XP 條，同埋一本貼紙簿記低小朋友真係做過嘅嘢。呢啲列全部都係由應用程式本來就有嘅目錄、job registry 同 settings section 畫出嚟；Kid Mode 淨係改標籤同尺碼，永遠唔會加、唔會拎走、唔會改名、亦唔會鎖住任何一個能力。Adult Mode 係大人*轉去*嗰個模式——有兩個入口去到，而且除非機度真係已經設定咗嘢，唔係一入去就問你嘢。

代碼喺 `design/packages/ui/src/kid/`：十六個檔案，包住現有 shell 而唔係另起一份。真正令 Kid Mode 出現喺畫面上嘅係呢個資料夾以外三樣嘢——`App.vue` 喺 `kid.enabled` 係 true 嗰陣掛住 `KidShell` 代替原本個 shell，`vuetify.ts` 將 Kid Mode 自己嘅顏色註冊成 Vuetify 第四套主題（同 dark、light、contrast 並列），`settingsSections.ts` 加多一行設定，畀你閂返佢。`kid/` 入面十六個檔案，冇一個為佢哋掂過嘅嘢另外整多一份。

### 行為

#### 一層外皮，同一個唔畀佢變成分叉版嘅測試

呢篇文其他每一段都靠住一個事實：Kid Mode 唔知一個功能係「乜」。`KidHome.vue` 同 `KidCataloguePage.vue` render 嘅，就係成人 shell 傳落嚟嘅 `ResolvedCatalogue[]` prop——即係 `catalogues.ts` 早就宣告、`capabilities.ts` 早就篩選過呢個 checkout 真係做得到嗰八十四個目錄功能，分喺五個目錄入面。`KidJobStrip.vue` 係將 `WorkPane.vue` 重新掛出嚟，唔係重寫一份 job 清單。`KidGrownUpGate.vue` 掛嘅係真正嘅 `AppSettings.vue` 同真正嘅選項編輯器，用返真嘅 props。任何地方嘅啟動，都仲係經 `shellNavigation.ts` 嘅 `activateTarget`，同成人 Home 自己啲卡撳落去一模一樣。

`kidMode.contract.test.ts` 就係令呢樣嘢係真嘅、而唔係得個講字。佢係由源頭嗰啲登記表本身去斷言，唔係由測試入面寫低嘅一個數字：八十四個目錄功能、十八個 job、十八個 settings section 每一個都有 kid label，五個目錄每一個都有，kid 色彩配置答嘅正正就係 dark scheme 宣告嘅嗰批 role，一個都唔多唔少，而每一個貼紙都指名一個目錄入面真係存在嘅功能。一個 kid label 唔見咗、一個功能靜靜雞去唔到、多咗一條第二憑證、或者為 Kid Mode 專登整多一隻色彩 token，呢啲全部都會喺呢一個檔案度 fail。（`kidLabels.ts` 自己嗰段文件註解都提過，佢個源頭登記表一度自相矛盾——究竟係八十四定八十五個功能；測試入面嗰個數字係由 `ALL_CATALOGUE_FEATURES.length` 推導出嚟,而唔係打死喺度嘅，正正就係咁先可以捉到嗰個舊嘅「八十五」,而唔係靜靜雞信咗佢。）

#### 預設開，同埋 Adult Mode 真係喺邊

`App.vue` 就係靠 `kid.enabled` 呢個旗標去決定掛邊個 shell，而佢預設就係 `true`。一個啱啱裝好嘅程式——冇人掂過任何設定——一開就直接落喺條 rail、GO card,同下面講嗰五個「地方」，唔係落喺原本嗰條 tab strip。所以「點樣返去」先係第一件要知嘅事,唔係諗埋一邊嘅嘢：

- Kid rail 自己個底部有個**大人掣**（padlock），同 Find、Messages 排埋一齊，撳落去就喺 kid shell 入面即刻打開下面講嗰個閘口。
- 過咗閘之後，見到嗰個設定介面會有一行 **Kid mode**（`KidModeRow.vue`），佢個 "Use kid mode" 剔掣先係真正嘅開關。剔走佢就會將成個 shell 換返做原本嗰個；再剔返佢，小朋友就即刻返去佢離開嗰陣嘅樣，因為佢啲進度同偏好從來冇存喺俾換走嗰個 shell 入面。

「Kid mode」同共用嘅 restricted mode 自己嗰行,一樣係普通設定行,所以都用同一個方法搵得到：喺嗰個介面自己嘅搜尋欄,同喺 command palette 度,兩個名都搵得到。

#### 五個地方，同畫佢哋嗰個一模一樣嘅目錄

`KidHome.vue` 就係 Kid Mode 嘅 Home：一張 project editor 嘅 hero card（同成人 Home 個 hero 解算出嚟嗰個 `findFeature("make.finding-a-world.the-project-editor")` 一模一樣）、五粒掣代表五個目錄，做成五個「地方」（`Make a map`、`Your maps`、`Show people`、`Keep it safe`、`Buttons & help`）、一格顯示 app 而家做緊乜嘅面板（用返成人 shell 早就計好嘅 render 行、backup 同 CI 活動），同一格列住呢部機識嘅地圖同伺服器。撳一個地方就打開 `KidCataloguePage.vue`，佢會按嗰個目錄本身嘅分組去分，用返同一個 `filterCatalogues`/`buildMatcher` 搜尋，`ConfigRegexBuilder` 就喺本應用程式其他每一條搜尋欄都用嘅嗰個 anchored `.*` 掣後面。呢度冇任何嘢自己維護一張清單；一切都係目錄講咩就係咩，淨係畫大啲。

#### Kid label 永遠唔會取代真名

`kidLabels.ts` 將一個功能、job 或者 settings section 出貨嗰個英文名，對應去一個四至六歲小朋友睇得明嘅標籤——project editor 係「Build room」，喺 GitHub Actions render 係「Robot helpers」，共用 restricted mode 係「Grown-up lock」。`kidLabel()` 回傳一個 `{ primary, secondary }` 對，次序視乎大人揀咗邊種標籤風格（kid 詞行先、真名行先，定係淨顯示真名），一個喺表入面冇 entry 嘅出貨名就照舊 render 做自己，冇第二行——一個標籤唔見咗永遠唔等於一個功能唔見咗，因為 `kidLabel()` 冇對應就跌返去用嗰個傳落嚟嘅參數本身，而唔係跌去乜都冇。

`kidAccessibleName()` 就係令呢個安全到可以喺同一個 build 度畀成人用嘅嗰部分：無論標籤風格點揀，每一個掛咗 kid label 嘅控制項嘅 accessible name 都仍然帶住出貨嗰個功能名，格式係 `"{kid 標籤} — {出貨名}"`。所以螢幕閱讀器、分頁搜尋器、command palette 自己嗰個搜尋，同呢個專案 harness 影嘅每一張截圖，都仍然可以用文件用緊嗰個名認得返個功能——就算螢幕上寫住嘅係「Robot helpers」都好。`kidMode.contract.test.ts` 會喺三種標籤風格、全部八十四個功能都逐一查證，唔止查預設嗰種。

#### Job strip：`WorkPane` 重新掛出嚟，唔係重寫一次

`KidJobStrip.vue` 自己嘅文件註解講得好白：佢包住 `WorkPane.vue`，而 `WorkPane.vue` 本身已經由 `jobRegistry.ts` 砌好個頁面清單、三個 seed 好嘅分組同釘住嘅一批，過濾走 `capabilities.ts` 早就鎖起嗰啲，並將自己收到嘅每一個具名 slot 直接轉發去 tab 系統。Kid Mode 淨係喺上面加多兩樣。第一，經 `WorkPane` 自己已經公開嘅 `renamePage(pageId, label)`——即係 tab 系統本身已經有嘅「一個標籤可以變」機制——套用 kid label：條 strip 一 mount 就跑一次，標籤風格或者 enabled 旗標一變又跑多次，係行成個 job registry 而唔係淨係行而家開住嘅 job，所以遲啲先開嘅 job 一樣攞到當時嘅標籤。因為改名嘅方式同用戶自己改個 tab 名一模一樣，kid label 捱得過重啟，Kid Mode 一閂返個標籤即刻打返出貨版。第二，kid 尺碼嘅 chip：64px 嘅最低 chip 高度，加兩行嘅 chip，用嘅係伸入 tab strip 自己 class 名嘅 scoped CSS——呢個係 Kid Mode 淨一次咁做嘅位置，原因係冇 chip slot 可以掛個尺碼落去。至於其餘所有嘢——docking 去任何一邊、分組、釘住、拖曳重排、overflow、佢四個探索式搜尋、有預覽嘅批量關閉，同重啟後嘅 workspace 持久化——同 Adult Mode 一模一樣咁繼續行，因為 `KidJobStrip` 唔係將呢啲嘢重寫多一份。

#### 大人閘口

撳條 rail 嘅 padlock 就會打開 `KidGrownUpGate.vue`，而佢接落嚟顯示乜，睇嘅唔係 Kid Mode 本身，而係呢部機一個事實：應用程式共用嘅 restricted-mode 紀錄（`components/setup/schoolMode.ts`，同呢個 application 其他地方共用緊嗰個、可以改名嘅 "School mode" 紀錄同信物）究竟有冇設定咗憑證。

- **仲未設定過任何嘢。** 呢個就係一個全新安裝嘅狀態，因為冇人去過共用 restricted mode 自己嗰項設定畀佢一個 PIN、密碼或者 passkey。閘口讀到嘅正正就係咁——`credentialConfigured` 係 false——所以會讓大人直落去真正嘅 `AppSettings.vue` 同真正嘅選項編輯器，乜都唔問，而且會喺自己嘅文案度講明,唔會扮成好似有憑證噉。喺實際情況入面，呢個亦都係第一個憑證究竟點樣設定出嚟嘅方法：大人第一次一定係咁直落過去,喺而家見得到嘅設定入面搵到共用 restricted mode 自己嗰行,如果想閘口下次真係會問就喺嗰度設定一個。
- **已經有憑證。** 一旦設定咗——由呢條路，定係由呢個應用程式任何其他地方，都得，因為佢係同一份共用紀錄——閘口就會喺顯示設定之前先問，每次輸入之後都清空個欄位，輸錯就報「個碼啱唔到，冇嘢改咗」，唔會講多，亦唔會升級。

無論邊種情況，閘口後面嘅介面都係真嘅，帶住真 props：`AppSettings.vue` 收嘅仍然係 `open`/`anchor`/`anchor-missing`/`updates`，選項編輯器仍然係一直以嚟嗰個全版 overlay。一個因為有問題要解決先嚟到呢度嘅大人，會喺設定介面本身之前先見到嗰個問題自己嘅補救掣，因為通常呢個先係佢哋撳開個閘口嘅原因。

#### XP、等級同貼紙，每一個都繫住真正發生過嘅嘢

`useKidProgress.ts` 用一本只加不減嘅紀錄簿記低攞咗邊啲貼紙、同每個貼紙帶嚟嘅 XP，本地儲喺 `bluemap-kid-progress`。等級係 `floor(xp / 500) + 1`；`KidShell.vue` 狀態列度嗰個等級讀數同 XP 條都直接讀呢度。`award(id)` 係由一個真正動作嘅完成事件觸發——render 第一張地圖、搵到一個 world、調校 render 速度、擺一個 pin、備份、發佈、跑自動修復、由歷史還原一個版本——而且對一個已經攞過嘅貼紙係刻意乜都唔做，所以呢度冇可能重複頒獎，更加唔可能為應用程式冇做過嘅嘢恭喜緊小朋友。`kidMode.contract.test.ts` 會查證全部八個貼紙每一個都指名一個目錄入面真係存在嘅功能。`KidStickerBook.vue` 會將每一個貼紙都展示出嚟，無論攞咗未攞都清清楚楚標明——冇任何嘢係收埋或者吊人胃口——撳一個就打開佢係由邊個功能攞返嚟嘅，所以本簿都變咗做多一條入去目錄嘅路，而唔係一個死嘅獎座架。

#### 慶祝、聲音，同減少動畫

`KidCelebration.vue` 淨係由 `award()` 嘅回傳值觸發，所以永遠唔會慶祝一件冇發生過嘅事。佢係一個通知，唔係一個對話框——永遠唔會阻住你，會自己收埋。`useMayAnimate()` 係 Kid Mode 入面任何動畫要唔要行嘅唯一開關：要慶祝功能開咗*同時* OS 冇要求減少動畫，而 Home 隻吉祥物擰吓擰吓,同慶祝彈出嗰下,都係用埋呢個開關,再包多層 `@media (prefers-reduced-motion: no-preference)`。減少動畫開咗嘅時候，慶祝仍然會出現，淨係唔會用動畫彈出嚟。

「Play a sound with a celebration」呢個剔掣（`kid.sound`）預設係關嘅，同「慶祝」呢個設定本身各自獨立持久化。佢自己嘅型別註解講得好白——喺減少聲音或者靜音時段生效嗰陣就應該靜聲，同呢個應用程式自己（仲未出貨嘅）語音旁述所訂明嘅習慣一樣——但截至呢十六個檔案，`KidCelebration.vue` 完全冇播任何聲：呢個偏好只係儲低咗、俾人揀，但 Kid Mode 入面冇任何嘢會讀佢去真係出聲。而家剔開呢粒掣，聽落去乜都唔會變。呢一點喺呢度講明,好過留返俾讀者自己試先發現——一個冇人讀過嘅偏好,正正就係呢個專案自己嘅文件慣例要求要講出嚟、而唔係暗示過去嘅缺口。

#### 顏色同形狀，借返嚟嘅 role

`kidTheme.ts` 嘅 `KID_SCHEME` 答嘅係 `colorRoles.ts` 已經宣告嗰批 Material Design 3 role 名——`primary`、`primary-container`、`surface-container-high` 等等——而唔係發明一個新 token。佢保留住產品本來嗰隻 seed 藍色，將啲 surface 移去淺色、高彩度嘅處理，用返太陽黃做 `tertiary`。`kidMode.contract.test.ts` 會斷言 kid scheme 嘅 key 集合，排序之後同 dark scheme 一模一樣，所以呢度唔會靜靜雞加多一個第二個 theme 唔使答嘅 role。形狀同密度就係 shell root 上面嘅 CSS 自訂屬性（`KID_SHELL_VARS`），唔係新 token：圓角由 16px 一路去到全圓，一套以 Baloo 2 帶頭嘅字型堆疊，同一個 64px 嘅最低目標——成人 shell 嘅下限係 48px，Kid Mode 淨係會加，唔會減。

#### Kid Mode 自己嘅文案，同佢刻意避開嘅上游陷阱

`kidCopy.ts` 用嘅係同其他每一個介面文案檔一樣嘅 `VOICED`/`FIXED` 形狀，[Language modes and funny levels](./language-and-tone.md) 有完整講解：每一個 `VOICED` entry 帶五句英文加五句廣東話，一 level 一句；每一個 `FIXED` entry——包括大人閘口嗰句坦白同佢個憑證標籤——每種語言一句，冇 level 之分。用返同其他介面目錄一樣嘅方式登記，Kid Mode 嘅文字就掂到全部三個語言模式同兩條逐語言 funny level 滑桿，冇一個 component 使改。

`kidCopy.ts` 刻意冇帶入去嘅，係呢個專案自己嘅文案目錄已經識得唔去答嘅嗰大約八十個 key：`public/lang/` 底下 bundle 嗰啲 locale 檔案係上游 BlueMap 自己 viewer 嘅 locale 字串，喺呢度幫佢哋配聲，就等於用呢個專案嘅英文換走一個對每一個讀嗰種語言嘅人嚟講都真嘅翻譯，而唔係為一句呢個專案真正擁有嘅字加一把 funny-level 聲。[`copy/catalogueCoverage.test.ts`](./language-and-tone.md) 整體上守住呢條界線；Kid Mode 淨係從來冇畀過嘢佢捉。破壞性動作、保安、無障礙同錯誤文案，一樣刻意冇喺 `kidCopy.ts` 出現：Kid Mode 從來唔會為呢啲重新措辭，所以現有嘅 `FACTS` 斷言——喺每個 funny level 都釘住呢啲句子一定要帶住嘅字眼——照樣過關，一個俾閘口鎖住嘅大人，或者一個失敗咗嘅 render，無論邊個模式畫緊個畫面，讀到嘅都係同一句老實說話。

### 設定

Kid Mode on/off 儲喺 `bluemap-kid-mode`，預設 `true`。小朋友嘅名儲喺 `bluemap-kid-name`，預設 `"Explorer"`。標籤風格（`kid-first`／`name-first`／`name-only`）儲喺 `bluemap-kid-label-style`，預設 `"kid-first"`。慶祝完成咗嘅工作儲喺 `bluemap-kid-celebrations`，預設 `true`。慶祝時播聲儲喺 `bluemap-kid-sound`，預設 `false`。XP 同貼紙紀錄簿儲喺 `bluemap-kid-progress`，預設 `{ "xp": 0, "won": [] }`。

以上每一個 key 都係開機讀一次、每次改動就寫返去，經 `kidMode.ts` 入面單一個 `persisted()` helper 處理；冇一條獨立嘅遷移路徑，因為冇一個更舊嘅 key 需要遷。減少動畫係 `KidModeState` 上面唯一一個從來唔會持久化嘅欄位——佢係即場由 `matchMedia("(prefers-reduced-motion: reduce)")` 讀出嚟，並靠嗰個 query 自己嘅 `change` 事件保持最新，所以喺應用程式開住嗰陣，作業系統層面改咗個偏好會即時生效，唔使等重啟。

換 shell 同時亦係換 theme，而且係刻意噉做嘅。Kid Mode 嘅顏色係註冊做佢自己一個具名嘅 Vuetify theme（`kid`），而唔係塗喺原本活躍緊嗰個成人 theme 上面，所以閂咗 Kid Mode 唔會令個 app 睇落去仲係 Kid Mode、淨係冇咗條 rail——[Display and ease of use](./display-and-ease-of-use.md) 講嗰個 Adult Mode 自己嘅 `bluemap-theme` 紀錄完全冇俾呢一切掂過，佢先係真正會返返嚟嗰樣嘢：一部從未揀過 theme 嘅機就預設「跟系統」，否則就係大人上次喺 Adult Mode 揀嘅嗰個。

### 失敗情況

- **一個功能、job 或者 settings section 冇 kid label。** `kidLabel()` 回傳出貨名做 `primary`、`null` 做 `secondary`；嗰列照樣 render、照樣經同一條啟動路徑，並且喺任何搜尋都仲係用出貨名搵得到。一個標籤唔見咗永遠唔等於一個功能唔見咗。
- **呢個 checkout 冇嘅能力。** `capabilities.ts` 喺 Kid Mode 見到個目錄之前就已經解算佢做「唔存在」，所以佢根本唔會喺 `KidHome.vue` 同 `KidCataloguePage.vue` render 嗰個 `ResolvedCatalogue[]` prop 入面——永遠唔會有張卡用假狀態畫出嚟扮示範。
- **減少動畫開咗。** 隻吉祥物嘅擰動、慶祝嘅彈出，同呢啲檔案入面其餘每一個 `@media (prefers-reduced-motion: no-preference)` 區塊都會停止有動畫；本來會有動畫嘅內容仍然會出現，淨係冇咗嗰下郁動。
- **XP 紀錄簿 parse 唔到。** `useKidProgress.ts` 嘅 `read()` 會接住呢個失敗，跌返去 `{ xp: 0, won: [] }`，而唔係套用一份壞紀錄嘅一部分——一本半載入嘅紀錄簿，比一本重設咗嘅仲差，因為一本俾套用咗一半嘅紀錄簿，隨時可以喺乜都冇做過嗰陣照樣派出一個貼紙。
- **一個大人從未設定過共用 restricted-mode 憑證。** 閘口會直接讓佢過，乜都唔問，並且講明——呢個係全新安裝嘅狀態，唔係一條錯誤路徑。
- **一個大人打嘅憑證啱唔到。** 個欄位會清空，出返一句白話「個碼啱唔到，冇嘢改咗」，而呢次嘗試 Kid Mode 自己個閘口唔會記錄、唔會升級，亦都唔會限速。
- **「Play a sound」開咗。** 而家仲乜都聽唔到；見返上面嗰段。

### 保安考量

Kid Mode 冇發明自己嘅憑證。大人閘口讀嘅係應用程式*一份*共用嘅 restricted-mode 紀錄——同任何用緊呢份紀錄嘅介面共用嗰個、可以改名嘅 "School mode"——經 `useSchoolMode()` 嘅 `credentialConfigured` 同 `enabled` 狀態去讀，而唔係喺上面成堆 `bluemap-kid-*` key 入面另外存多一個密碼、PIN 或者秘密。憑證本身——佢嘅值、長度，甚至有冇設定過——永遠唔會出現喺 Kid Mode 自己嘅儲存、貼紙紀錄簿、匯出檔或者截圖入面。

**呢個係一個體驗上嘅鎖，唔係一條保安邊界**，閘口自己嘅文案就係咁講：佢阻小朋友入去設定；佢唔會保護到部機唔畀任何一個識刪佢啲檔案嘅人碰。刪咗個共用 restricted-mode 紀錄，就會同其他用呢份紀錄嘅地方一樣清埋佢個憑證，呢個先係老實嘅復原方法，而唔係一張支援票或者一個帳戶重設——用返呢個專案自己嗰套詞彙，一個玩具鎖，永遠唔應該係某個人同自己設定之間唯一嘅嘢。

有一句話值得喺呢度講多次，唔止喺行為果段：喺一個大人未去過共用 restricted mode 自己嗰項設定之前，冇任何嘢設定咗嚟保護閘口，所以閘口都唔會扮成有——佢會直接讓你過，究竟駛唔駛設定憑證，係俾拎住部機嗰個人自己揀，唔係 Kid Mode 幫佢揀。

呢十六個檔案入面，冇任何嘢會掂網絡。貼紙紀錄簿、標籤風格、小朋友嘅名同其他每一個 Kid Mode 偏好，全部都留喺上面列出嗰啲 key 底下嘅本地儲存入面。

### 無障礙

Kid Mode 嘅最低互動目標係 64px，由成人 shell 嘅 48px 下限加上去——呢啲檔案入面每一粒 rail 掣、每一個地方、每一行目錄、每一個貼紙同每一個 job chip 至少都係咁大，Kid Mode 冇任何嘢准跌落呢個之下。`kidAccessibleName()` 就係令一個掛咗 kid label 嘅控制項嘅 accessible name，喺三種標籤風格都照樣講出嗰個出貨功能名，所以螢幕閱讀器認得返一個控制項嘅方式，同呢個專案自己嘅文件同佢個 command palette一致——就算畫面上顯示緊「Robot helpers」都好。減少動畫喺呢啲檔案入面每一處有動畫嘅位都受尊重，同上面行為果段講嘅一樣，而每一個帶意思、唔係裝飾嘅圖示都標咗 `aria-hidden`，隔籬有一句真文字標籤，唔係靠佢自己代替。因為 Kid Mode 入面每一句字都經同一個 `t()` 呼叫，同其他嘅應用程式一樣，Kid Mode 唔使做多一份無障礙功夫就掂到全部三個語言模式同兩條逐語言 funny level 滑桿：喺雙語模式，螢幕閱讀器讀 Kid Mode 自己嘅英文同廣東話，同讀呢個應用程式其他任何一句嘢一模一樣。

### 驗證

`kidMode.contract.test.ts` 由源頭登記表本身去斷言：八十四個目錄功能、十八個 job、十八個 settings section 同五個目錄，每一個都有 kid label，數字係推導出嚟而唔係寫死喺測試度；accessible name 喺三種標籤風格、全部功能都仍然帶住出貨嗰個功能名；kid 色彩配置排序之後同 dark scheme 一模一樣，一個 role 都唔多唔少；每一個貼紙都指名一個目錄入面真係存在嘅功能。

截至呢十六個檔案，呢一個測試檔就係 Kid Mode 自己嘅全部測試——佢係一份「覆蓋同唔會走樣」嘅合約測試，唔係一套掛住元件嘅測試，而呢個係刻意嘅：一個成個承諾就係「呢度冇任何嘢同真正嘅嘢有分歧」而唔係「呢粒 pixel 喺呢個位」嘅功能，就應該咁測。真正令 Kid Mode 出現喺畫面上嗰三個修改——由 `App.vue` 掛 `KidShell`、註冊 `kid` 呢個 Vuetify theme，同加多一行閂佢嘅設定——全部住喺 `kid/` 之外，靠嗰啲周邊代碼自己嘅測試去證明，唔係靠呢一個檔案。

喺 `design/` 用 `npx vitest run packages/ui/src/kid` 執行。

### 建議閱讀

- [Home](./home.md)——`KidHome.vue` 重用而唔係重新發明嘅落地分頁、hero、目錄卡同啟動 handler。
- [The design system](./design-system.md)——`kidTheme.ts` 回應而唔係取代嘅 Material Design 3 role 詞彙。
- [Language modes and funny levels](./language-and-tone.md)——`kidCopy.ts` 跟緊嘅 `VOICED`/`FIXED` 形狀，同佢個目錄刻意避開嘅上游 locale 陷阱。
- [Browser-style tabbed navigation](./tabbed-navigation.md)——`KidJobStrip.vue` 靠重新掛 `WorkPane` 而唔係重寫佢，保住嘅每一項 tab 能力。
- [The regex builder and the search bars it reaches](./regex-builder.md)——`KidCataloguePage.vue` 自己個搜尋欄背後,同一個 anchored builder。
