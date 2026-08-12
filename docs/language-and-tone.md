# Language modes and funny levels

Three language modes, and an independent funny level per language. The level changes the voice of
every message the application produces, errors and warnings included. It never changes the facts,
and that is enforced by a test rather than by care.

The code is `design/packages/ui/src/copy/` for the words and the wiring, and
`design/packages/ui/src/components/setup/` for the controls and the persisted store.

## Behaviour

### The three modes and the two sliders

| Setting | Values | Default | Stored under |
|---|---|---|---|
| Language mode | `en`, `yue`, `bilingual` | `en` | `worldlens.language.mode` |
| English funny level | 1 to 5 | 3 | `worldlens.language.funny.en` |
| Cantonese funny level | 1 to 5 | 3 | `worldlens.language.funny.yue` |

Two sliders, not one. English can stay buttoned up while Cantonese lets loose, and neither moves
when the other does. All three persist immediately, so a choice survives closing the application
halfway through setup.

They are offered during first-run setup, so the rest of that flow can be read in whichever voice
somebody wants, and again on the settings surface. The settings surface **mounts the same panel**
rather than reproducing it: two copies of a control writing the same three keys is how a slider on
one surface stops agreeing with the slider on the other, and the failure is silent because both
screens look right and only the one opened second is telling the truth. Before that row existed
the three settings were reachable only during first-run setup, which is a setting being asked once
rather than a setting being configurable.

### Where the words live

`appCopy.ts` holds the catalogue in two tiers, and which tier a string is in is a decision rather
than a convenience.

- **VOICED** is prose the user reads: errors, warnings, the sentence saying what a delete will
  take with it, the line reporting what was saved and where. Five English strings and five
  Cantonese strings, index 0 being level 1 (fully professional) and index 4 being level 5 (maximum
  playfulness).
- **FIXED** is titles, buttons, column headings, the names of things. One string per language, no
  level. A funny level cannot usefully restyle "Cancel", and a button whose label moves under
  somebody is a button they re-read every time. These still change with the mode, which is the
  half that matters for them.

There is deliberately no third exact tier here. Out in the application the facts are the
interpolated values (the path, the count, the map id, the folder) and they are protected by a
stronger mechanism than a tier could give them, described below.

### How it reaches nine hundred call sites without editing any of them

Every call site in the application is shaped
`t("world.folder.noLevelDat", { folder }, "There is no level.dat in {folder}, ...")`. The English
string in the third argument is a *fallback*: vue-i18n uses it only when the key resolves nowhere.
The bundled locales under `public/lang/` are upstream BlueMap's viewer locales and carry none of
this project's keys, so every one of those keys rendered its English fallback in all thirty
languages at every funny level. Not a bug in any one of them: there was simply nothing on the
other side of the call.

`appVoice.ts` is the other side. It turns the catalogue into a vue-i18n message set for whichever
mode and levels are active and **merges** it into the locale the application is already using,
re-merging whenever a slider moves or the mode changes. An entry added to the catalogue starts
varying at every existing call site with no component edited at all, and a key the catalogue does
not carry still renders its English fallback exactly as before, which is what makes this safe to
grow one surface at a time.

Merging rather than selecting a synthetic locale is deliberate. `main.ts` hands the i18n locale to
the viewer's seam, and the viewer's settings menu compares that value against its own list of
thirty locales to decide which language is ticked; pointing the locale at a name that is not in
the list makes the tick disappear and the menu stop agreeing with itself. Merging leaves the
active locale alone and simply adds keys to it, and it is idempotent by construction, so no stale
string can survive a change of level.

### What the catalogue covers today

The mechanism reaches every call site; the catalogue does not yet carry every key. On the default
branch it carries the options editor and its apply and field surfaces, the map and storage
screens, the world wizard from folder through review to a running render, the settings surface
(consent, Java, storage, GitHub and the language section itself), the downloads list, the
notification centre and its level names, and the super-confirmation gate. Everything else, the
command palette and the tab strip among them, renders its English fallback in every mode until its
keys are added, which is the designed behaviour rather than a defect and is why this layer could
land without editing a single call site.

### Bilingual, in a string that can only be a string

The setup flow renders bilingual copy as two elements, English prominent and the Cantonese beneath
it at a smaller size. That is the right answer and it needs markup, which is exactly what a
vue-i18n message cannot be: `t()` returns a string, and the call sites out in the application put
that string wherever they put it.

So a bilingual message carries a newline between the two languages, and `bilingual.css` makes that
newline render as a line break in the containers Vuetify puts text in, gated behind
`html[data-language-mode="bilingual"]` so it cannot affect either single-language mode. Vue's
template compiler condenses whitespace in template text before it reaches the DOM, so the only
newlines the rule can act on are ones that arrived as data.

This is honestly weaker than what the setup flow does: the secondary line is a line rather than a
de-emphasised one, because a text node cannot be styled separately from its sibling text. What it
does guarantee is the part that matters at a narrow width, which is that the second language goes
downwards rather than sideways, and that the containers it lands in are allowed to grow to fit it
instead of clipping it.

### Voice, never facts

A level may be as silly as it likes about the *manner* of a failed delete. It may not stop naming
the file, stop saying the delete cannot be undone, or quietly lose the storage whose tiles are
being left behind.

`FACTS` names, per key and per language, the substrings that have to survive every level, and the
test checks all ten strings of every entry against them. A voiced key with no fact declared fails,
so nothing is quietly exempt. Placeholders are checked the same way: every level of an entry uses
the same set, the call site's fallback is the source of truth for which placeholders exist, and an
entry that invents one or drops one is rejected.

The Cantonese is natural and playful, and never at the user's expense. The house rule is narrow
and absolute: humour is aimed at the software's own behaviour, never at somebody's lost work,
their money, or their ability to use a computer. Where a sentence reports damage, the Cantonese
gets no funnier than the English does, at any level. Identifiers stay identical in both languages,
because translating a filename produces a sentence that reads well and sends the reader looking
for a file that does not exist.

### The disclosure is not optional

Under the sliders is a line saying that the level styles every message the application produces,
errors and warnings included, and that the facts do not move. It is rendered at the current level
like everything else, and every level of it still says both of those things. Somebody is entitled
to know that before they move a slider rather than after an error reads oddly.

## Configuration

The three settings above are the whole of it, and they are reachable from first-run setup and from
the settings surface. A reset puts all three back to their defaults from the settings surface.

The words this section can be found by live in `languageSearch.ts` rather than on the component,
exactly as the consent section's do, so a settings surface folds them into the search it already
owns instead of the row growing a second search bar to compete with it, and so they are readable
before the component has mounted.

## Failure modes

- **A key the catalogue does not carry** renders its English fallback with its arguments
  interpolated, exactly as it did before this layer existed. That is the designed behaviour, not a
  degradation.
- **A stored mode or level this build does not know** falls back to the default; levels are
  clamped into 1 to 5 on read.
- **Storage refuses.** The choice does not survive a restart, and nothing is reported, because a
  remembered preference is not worth a notification.
- **A catalogue entry that drops a placeholder its call site passes** fails the build rather than
  rendering a sentence with a hole in it.
- **A catalogue entry that stops carrying a required fact at some level** fails the build. This is
  the failure this layer exists to prevent, so it is the one checked hardest.
- **A bilingual string in a container the stylesheet does not name** would render as one run
  rather than two lines. The containers are enumerated and asserted for that reason.

## Security considerations

Nothing here reaches the network. The catalogue is compiled into the bundle, the three preferences
are written to local storage, and no text is transmitted or logged.

The safety-relevant consequence of this feature is the one the fact test exists for: a
destructive-action gate, a consent question and an error report all render through this layer, and
a user who cannot tell what a button will do has not consented to it. The consent facts in
first-run setup go further still and resolve from an exact catalogue with the level not consulted
at all, because a licence quotation is a fact in the shape of a whole paragraph.

## Accessibility

The accessible name of a Vuetify slider comes from its `name` prop, which is what the thumb (the
element carrying `role="slider"`) renders as `aria-label`; an `aria-label` passed to the component
lands on the wrapper and names nothing. `aria-valuetext` is not forwarded either, so each level's
name is announced through a polite live region beneath the track rather than being left visible
but unspoken. The two sliders are declared as a grid that collapses rather than as two fixed
columns, and rows of controls wrap below 480 pixels, where two languages stop fitting side by
side. The disclosure stays on screen at the funniest level, which is where the copy is longest.

## Verification

| Test | What it holds |
|---|---|
| `appCopy.test.ts` | Five levels in both languages for every voiced entry, no empty string, no em-dash, no key in both tiers, level 1 and level 5 genuinely differing in both languages, the two languages not being copies of each other, the same placeholders at every level, a real call site for every catalogue key carrying exactly the placeholders that call site passes, every required fact present at every level, and a declared fact for every voiced key. |
| `appVoice.test.ts` | The merge into the active locale, its idempotence, and the message set changing with mode and level. |
| `voiceNotFacts.test.ts` | The two sliders are independent, moving one moves only its own half, the path survives at every combination of the two levels, and a key the catalogue does not carry still renders its fallback with arguments interpolated. |
| `bilingualLayout.test.ts` | The surfaces that own their markup put Cantonese in its own block beneath the English and show no empty second element in a single mode; `bilingual.css` parses, gates every rule on the bilingual mode, changes nothing that is not about fitting a second line, honours the break in every container it names, wraps control rows below 480 pixels; and the language panel collapses its sliders, renders both languages with no unresolved placeholder, keeps the disclosure on screen at the funniest level, and offers a way back to the defaults. |
| `setupI18n.test.ts`, `setupStrings.test.ts`, `languageSearch.test.ts` | The persisted store, the setup catalogue's own tiers including the exact one, and the words the settings section is searchable by. |

Run them with `npx vitest run packages/ui/src/copy packages/ui/src/components/setup` from
`design/`.

## Suggested reading

- [Super confirmation](./super-confirmation.md), the surface where voice-not-facts matters most,
  and one of the surfaces the catalogue already covers.
- [The notification centre](./notification-centre.md), whose own copy is in the catalogue.
- [The command palette](./command-palette.md), whose copy is not in the catalogue yet and which
  therefore still renders its English fallbacks, the ordinary behaviour for a key the catalogue
  does not carry.

## 廣東話

### 概要

語言模式（language modes）有三個，另外每種語言有各自獨立嘅搞笑程度（funny level）。個 level 會改變應用程式產生嘅每一句訊息嘅語氣，錯誤同警告都包埋。但佢永遠唔會改變事實，而呢一點係靠測試強制執行，唔係靠小心。

代碼喺 `design/packages/ui/src/copy/`（文字同接駁）同 `design/packages/ui/src/components/setup/`（控制項同持久化 store）。

### 行為（Behaviour）

#### 三個模式，兩條滑桿

語言模式有 `en`、`yue`、`bilingual` 三個值，預設 `en`，儲喺 `worldlens.language.mode`；英文 funny level 係 1 至 5，預設 3，儲喺 `worldlens.language.funny.en`；廣東話 funny level 一樣係 1 至 5，預設 3，儲喺 `worldlens.language.funny.yue`。

係兩條滑桿，唔係一條。英文可以繼續正經，廣東話可以放開嚟玩，其中一條郁嘅時候另一條唔會跟住郁。三個設定即時持久化，所以就算 setup 行到一半熄咗個 app，個選擇都會留低。

呢啲設定喺 first-run setup 已經有得揀，咁 setup 之後嘅部分就可以用你想要嘅語氣睇；設定介面（settings surface）都有得改。設定介面係**直接 mount 同一個 panel**而唔係抄多一份：兩份控制項寫同一組三個 key，就係一個介面上嘅滑桿同另一個介面上嘅滑桿講唔埋一齊嘅成因，而且個失敗係無聲嘅，因為兩個畫面睇落都啱，只有後開嗰個先講真話。呢一行未存在之前，三個設定只可以喺 first-run setup 掂到，即係一個設定得問一次，而唔係一個真係可以配置嘅設定。

#### 啲字住喺邊

`appCopy.ts` 用兩層（tier）擺個 catalogue，一條 string 屬邊一層係一個決定，唔係求其方便。

- **VOICED** 係用戶會讀嘅文句：錯誤、警告、講明一個 delete 會連埋乜嘢一齊剷嗰句、報告儲咗乜去邊嗰行。每個 entry 五句英文加五句廣東話，index 0 係 level 1（完全專業），index 4 係 level 5（最盡嘅玩味）。
- **FIXED** 係標題、掣、欄目名、嘢嘅名。每種語言一句，冇 level。Funny level 冇辦法有意義咁重新造「Cancel」，而一個 label 會喺人手下面郁嘅掣，係一個每次都要重新讀過嘅掣。呢啲字仍然會跟模式轉語言，對佢哋嚟講重要嘅就係嗰一半。

呢度刻意冇第三個 exact tier。喺應用程式入面，事實係啲 interpolate 落去嘅值（path、count、map id、folder），佢哋有一個比 tier 更強嘅機制保護，下面會講。

#### 點樣唔改一個 call site 就掂到九百個 call site

應用程式入面每個 call site 都係 `t("world.folder.noLevelDat", { folder }, "There is no level.dat in {folder}, ...")` 呢個形狀。第三個 argument 嗰句英文係 *fallback*：vue-i18n 只會喺個 key 邊度都解析唔到嘅時候先用佢。`public/lang/` 入面 bundle 嗰啲 locale 係上游 BlueMap viewer 嘅 locale，完全冇呢個 project 嘅 key，所以以前每一個 key 喺三十種語言、每個 funny level 都係 render 佢嘅英文 fallback。唔係任何一個 call site 嘅 bug：只係另一邊根本冇嘢接。

`appVoice.ts` 就係另一邊。佢將個 catalogue 變成當前模式同 level 嘅 vue-i18n message set，然後 **merge** 入應用程式現用嗰個 locale，滑桿一郁或者模式一轉就重新 merge。加一個 entry 落 catalogue，每個現有 call site 即刻開始有語氣變化，一個 component 都唔使改；catalogue 冇嘅 key 就照舊 render 英文 fallback——正正係咁先可以安全咁一個介面一個介面咁慢慢加。

用 merge 而唔係揀一個合成 locale 係刻意嘅。`main.ts` 將 i18n locale 交畀 viewer 嘅接縫，而 viewer 嘅設定選單會攞呢個值同佢自己三十個 locale 嘅清單對，決定邊種語言剔咗；將 locale 指去一個唔喺清單入面嘅名，個剔就會消失，個選單就同自己講唔埋。Merge 唔郁現用 locale，淨係加 key 落去，而且構造上係 idempotent，所以轉 level 之後唔會有舊 string 留低。

#### Catalogue 而家覆蓋乜

個機制掂到每個 call site；但個 catalogue 未載齊每個 key。喺 default branch 上面佢覆蓋：options editor 連 apply 同 field 介面、map 同 storage 畫面、world wizard 由揀 folder 到 review 到 render 行緊、設定介面（consent、Java、storage、GitHub 同語言部分本身）、下載清單、notification centre 連佢啲 level 名，同 super-confirmation gate。其餘嘅嘢——command palette 同 tab strip 都喺內——喺每個模式都照 render 英文 fallback，直至佢哋嘅 key 加咗入去為止。呢個係設計行為而唔係缺陷，亦係呢一層可以一個 call site 都唔改就落地嘅原因。

#### Bilingual，喺一個只可以係 string 嘅 string 入面

Setup flow render bilingual 文字係用兩個 element：英文顯眼，廣東話喺下面細一個字號。嗰個係正確答案，但佢需要 markup，而 vue-i18n message 正正畀唔到：`t()` 回傳一個 string，應用程式啲 call site 攞住呢個 string 周圍擺。

所以一句 bilingual message 喺兩種語言之間帶一個 newline，`bilingual.css` 令呢個 newline 喺 Vuetify 擺文字嗰啲 container 入面 render 成換行，gate 喺 `html[data-language-mode="bilingual"]` 後面，所以唔會影響任何單語言模式。Vue 嘅 template compiler 會喺 template 文字到 DOM 之前壓縮空白，所以條 rule 郁到嘅 newline 只可能係當 data 到達嘅。

呢個老實講係弱過 setup flow 嗰套：第二行只係一行，唔係一行被 de-emphasise 嘅字，因為 text node 冇辦法同佢隔籬嘅 text 分開 style。佢保證到嘅係喺窄芒下最緊要嗰部分：第二種語言係向下行而唔係向橫谷，而佢落腳嗰啲 container 准許自己長高去裝佢，而唔係切咗佢。

#### 語氣，永遠唔係事實（Voice, never facts）

一個 level 對一次 delete 失敗嘅*講法*可以幾騎呢都得。但佢唔可以唔講個檔案名、唔可以唔講個 delete 冇得返轉頭、亦唔可以靜靜雞唔提啲 tiles 留低喺邊個 storage。

`FACTS` 逐個 key、逐種語言列明邊啲 substring 一定要喺每個 level 生存，測試會對住每個 entry 全部十句 string 檢查。Voiced key 冇聲明 fact 就 fail，所以冇嘢會被靜靜豁免。Placeholder 都係咁查：一個 entry 每個 level 都要用同一組 placeholder，call site 嘅 fallback 係「有邊啲 placeholder」嘅事實來源，發明多一個或者跌咗一個嘅 entry 會被拒絕。

廣東話係自然、有玩味，但永遠唔會攞用戶嚟開玩笑。屋企規矩窄而且絕對：幽默只可以指向軟件自己嘅行為，永遠唔可以指向人哋唔見咗嘅嘢、佢哋啲錢、或者佢哋用電腦嘅能力。一句嘢係報告損失嘅話，任何 level 下廣東話都唔會搞笑得過英文。Identifier 喺兩種語言保持一模一樣，因為譯咗個檔案名，句嘢係讀得順，但會令讀者去搵一個唔存在嘅檔案。

#### 個披露唔係可有可無

滑桿下面有一行講明：個 level 會改應用程式產生嘅每句訊息嘅語氣，錯誤警告都包，而事實唔會郁。呢行同其他嘢一樣用當前 level render，但每個 level 嘅版本都仲係講齊呢兩點。人哋有權喺郁滑桿*之前*知道呢樣嘢，而唔係等到一個錯誤讀落怪怪哋之後先知。

### 配置（Configuration）

上面三個設定就係全部，first-run setup 同設定介面都掂到。設定介面有 reset，一下將三個放返去預設值。

呢個部分搵得到嘅關鍵字住喺 `languageSearch.ts` 而唔係 component 上面，同 consent 部分一樣做法，咁設定介面就可以將佢哋摺入自己已有嘅搜尋，而唔係個行自己生多一條 search bar 出嚟鬥，而且 component 未 mount 都讀得到。

### 失敗情況（Failure modes）

- **Catalogue 冇嘅 key**：render 英文 fallback，arguments 照 interpolate，同呢層存在之前一模一樣。係設計行為，唔係退化。
- **儲低咗一個呢個 build 唔識嘅 mode 或者 level**：跌返去預設；level 讀入嗰陣 clamp 落 1 至 5。
- **Storage 唔肯寫**：個選擇捱唔過重啟，而且唔會報任何嘢，因為一個記住咗嘅偏好唔值一個通知。
- **Catalogue entry 跌咗 call site 傳嘅 placeholder**：build fail，而唔係 render 一句穿窿嘅嘢出嚟。
- **Catalogue entry 喺某個 level 唔再帶一個必需 fact**：build fail。呢個係呢層存在嘅意義所在嘅失敗，所以查得最狠。
- **Bilingual string 落咗一個 stylesheet 冇點名嘅 container**：會 render 成一條行而唔係兩行。就係因為咁，啲 container 係逐個列明同 assert 嘅。

### 保安考量（Security considerations）

呢度冇嘢掂網絡。Catalogue 編譯入 bundle，三個偏好寫落 local storage，冇文字會被傳送或者記 log。

呢個功能同安全有關嘅後果，就係 fact test 存在嘅原因：破壞性動作嘅 gate、consent 問題同錯誤報告全部經呢一層 render，一個睇唔明個掣會做乜嘅用戶，就唔算同意過佢。First-run setup 嘅 consent facts 行得更遠：由一個 exact catalogue 解析，完全唔理 level，因為一段 licence 引文係一個成段咁長嘅事實。

### 無障礙（Accessibility）

Vuetify 滑桿嘅 accessible name 嚟自佢個 `name` prop——即係個 thumb（帶 `role="slider"` 嗰個 element）render 做 `aria-label` 嘅嘢；傳畀 component 嘅 `aria-label` 會落咗喺 wrapper 度，乜都命名唔到。`aria-valuetext` 都唔會被轉發，所以每個 level 嘅名係經滑軌下面一個 polite live region 讀出嚟，而唔係得個樣冇得聽。兩條滑桿聲明做一個會收摺嘅 grid 而唔係兩個固定欄，控制項行喺 480 pixels 以下會摺行，因為嗰個闊度兩種語言已經排唔到隔籬。個披露喺最搞笑嗰個 level 都留喺畫面上——嗰個正正係文字最長嘅 level。

### 驗證（Verification）

- `appCopy.test.ts`——每個 voiced entry 兩種語言各五個 level、冇空 string、冇 em-dash、冇 key 同時喺兩個 tier、level 1 同 level 5 喺兩種語言都真係有分別、兩種語言唔係互相抄、每個 level 用同一組 placeholder、每個 catalogue key 有一個真 call site 而且 placeholder 啱數、每個必需 fact 喺每個 level 都在場、每個 voiced key 都有聲明 fact。
- `appVoice.test.ts`——merge 入現用 locale、idempotent，同 message set 跟 mode 同 level 變。
- `voiceNotFacts.test.ts`——兩條滑桿獨立、郁一條只郁自己嗰半、條 path 喺兩個 level 嘅任何組合都生存、catalogue 冇嘅 key 照 render fallback 連 arguments。
- `bilingualLayout.test.ts`——擁有自己 markup 嘅介面將廣東話放喺英文下面自己嘅 block、單語言模式冇空嘅第二個 element；`bilingual.css` parse 得到、每條 rule 都 gate 喺 bilingual 模式、唔改任何同「裝多一行」無關嘅嘢、喺佢點名嘅每個 container 兌現個換行、控制項行喺 480 pixels 以下摺行；語言 panel 收摺佢啲滑桿、兩種語言 render 出嚟冇未解析嘅 placeholder、最搞笑 level 個披露仍然喺畫面上、有路返去預設值。
- `setupI18n.test.ts`、`setupStrings.test.ts`、`languageSearch.test.ts`——持久化 store、setup catalogue 自己啲 tier（包括 exact 嗰個），同設定部分搵得到嘅字。

喺 `design/` 用 `npx vitest run packages/ui/src/copy packages/ui/src/components/setup` 執行。

### 建議閱讀

- [Super confirmation](./super-confirmation.md)——voice-not-facts 最重要嘅介面，亦係 catalogue 已覆蓋嘅介面之一。
- [The notification centre](./notification-centre.md)——佢自己啲文字已經喺 catalogue 入面。
- [The command palette](./command-palette.md)——佢啲文字未入 catalogue，所以仲係 render 英文 fallback，即係 catalogue 冇嘅 key 嘅正常行為。
