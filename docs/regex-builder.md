# The regex builder, and the search bars it reaches

Every search bar in the application opens a guided pattern builder, anchored beside the field it
belongs to. Plain text is the default; regular expressions are something a user turns on
deliberately. The builder names the engine it is building for, states its own limits, and previews
against the text the search will actually scan.

The code is `design/packages/ui/src/components/config/` for the settings family, with sibling
adapters in `components/menu/` and `components/markers/`.

## Behaviour

### Three fields, three builders, one behaviour

There are three shared search fields, each rendering its own anchored builder:
`ConfigSearchField` with `ConfigRegexBuilder`, `MenuSearchField` and `MenuSearchBar` with
`MenuRegexBuilder`, and `MarkerSearchField` with the marker `RegexBuilder`. Three rather than one
because they belong to three surface families with different chrome, not because the behaviour
differs.

Each surface owns its own copy of the engine adapter, so one surface's limits cannot be changed
out from under another's. All three are plain text by default with regex as the explicit opt-in,
and all three run the host runtime's own `RegExp`.

### The builder is bound to the field, not parked beside it

The pattern and the flags are two-way: typing in the raw editor changes the search immediately,
and typing in the search bar changes the editor. There is no shared builder holding state for
whichever field was touched last. The builder opens from a field, is anchored beside it, writes
back into it, and returns focus to it when it closes. Turning regex off again leaves the literal
query exactly as typed rather than rewriting it.

### What the builder offers

- **Guided construction** by token group: character classes, anchors, groups (capturing,
  non-capturing, named, and a back-reference), alternation and quantifiers, plus a literals field
  that backslash-escapes every metacharacter so a typed string matches itself.
- **A raw pattern editor**, which is the same value the search bar holds.
- **Every supported flag** as a chip group: `g`, `i`, `m`, `s`, `u`, `y`.
- **Editable sample text**, seeded with the real corpus of the surface that opened it, one
  candidate per line. A builder previewing against an invented sample teaches a pattern that
  matches the sample and nothing the user has.
- **Live matches with their capture groups**, named groups listed by name, and syntax feedback on
  the pattern as it is typed.
- **Copy**, which writes the pattern exactly as built with no delimiters or escaping the user did
  not ask for.
- **The engine, stated in the interface** rather than only in a comment: ECMAScript `RegExp`,
  evaluated locally on this thread, which is the same engine the search itself filters with, so
  the preview cannot disagree with the search that consumes the pattern. `\d`, `\w`, `\s`, `\b`,
  named groups, back-references and lookaround all behave exactly as they do in the browser.

### Every search bar has one, and a test says so

The rule most likely to decay is this one, because nothing about writing a plain text field
labelled "Search" feels like a violation while you are doing it: a surface ships, the field looks
right, and the contract quietly covers one fewer place than it did last week.

`regexPolicy.test.ts` therefore walks every component in the package and asks two questions. Does
this file contain a search-shaped input, meaning one whose label, placeholder, name, model or
class says search, filter, find or query? And if so, does it get that search from one of the three
shared fields? A file that answers yes and no fails. A file that legitimately holds a
search-shaped input that is not a search has to be named in an exemption list with the reason, so
the exemption is a sentence somebody wrote rather than an absence nobody noticed.

**That exemption list is currently empty**, and the guard is what makes "every search bar" a
statement about the code rather than about somebody's memory. The detector is deliberately
generous about what counts as a search: it is better to make somebody write one exemption sentence
than to let a real search bar through because its label was "Find a map".

What the guard deliberately does not check is that a builder *works*. That is what the per-surface
mount tests are for, and duplicating it there would make the guard slow and fragile without making
it stricter.

## Configuration

| Limit | Value | Where |
|---|---|---|
| Pattern length | 512 characters | `MAX_PATTERN_LENGTH` |
| Sample length | 20000 characters | `MAX_SAMPLE_LENGTH` |
| Reported matches | 500 | `MAX_MATCHES` |
| Wall clock per preview run | 100 ms | `MAX_EVAL_MS` |
| Flags | `g`, `i`, `m`, `s`, `u`, `y` | `SUPPORTED_FLAGS` |

They are stated in the builder's own interface as well as here, because a limit the user cannot
see is a limit that reads as a bug when it bites. None of them is user-configurable.

Plain-text mode is a case-insensitive substring match, and it is the default everywhere.

## Failure modes

- **A pattern that will not compile.** The error is shown, and the matcher matches *nothing*
  rather than falling back to the last pattern that did compile, which would leave results on
  screen for a search nobody can see any more.
- **A pattern that would backtrack exponentially is refused before it is compiled.** This is the
  one failure the size and time limits cannot cover, and the arithmetic says why: a single
  `exec()` cannot be interrupted, the wall clock is checked *between* matches, and `(a+)+$`
  against twenty thousand characters never returns from the first one, so the budget is never
  reached. Capping the inputs bounds a polynomial pattern and does nothing at all to an
  exponential one. `regexRisk.ts` inspects the pattern's shape for a nested unbounded quantifier
  and for the other classic exponential form, and refuses with an explicit reason rather than
  freezing the window. Refusing is a real cost, a user who genuinely wanted `(\w+\s*)+` is told
  no, and it is the right trade against a frozen window with no way back, because the same intent
  is almost always expressible without the nesting.
- **A zero-width match** is handled rather than driving an infinite loop.
- **A sample longer than the limit** is truncated for the preview, and the limit is on screen.
- **More matches than the cap** are reported as capped rather than silently ending the list.
- **Turning regex mode off** leaves the literal query intact, so the meaning of what is typed does
  not change under the user.

## Security considerations

Evaluation is local and in memory. No pattern and no sample text is transmitted, logged or
persisted anywhere, including by the surfaces that persist other state: the tab strip explicitly
excludes queries and patterns from what it writes to storage, because they are not ordinary layout
preferences and can contain anything a person typed.

Catastrophic backtracking is the obvious denial-of-service route into any regex feature, and it is
the one this project treats as a real threat rather than a theoretical one, because the pattern
runs on the thread that draws the interface. The static refusal above is the mitigation; the four
bounds are the second line.

Tab titles, notification text and settings values are treated as potentially sensitive: a search
or a bulk close reads them to do its job and does not retain or transmit them afterwards.

Every entry point is keyboard reachable with an accessible name and state, validation and result
changes are announced without constant interruption, and match highlighting is never the only way
a result is conveyed.

## Verification

| Test | What it holds |
|---|---|
| `regexEngine.test.ts` | Valid and invalid patterns, every supported flag, escaping a literal, capture and named groups, zero-width matches, and each of the four bounds being enforced and reported. |
| `regexRisk.test.ts` | The exponential shapes that are refused, the realistic queries that are not, and the reason text that comes back with a refusal. |
| `regexPolicy.test.ts` | Every search-shaped input in the package uses a shared field or carries a written exemption, every exemption still points at a file that still looks like a search, the detector catches a plain search field and does not accuse an ordinary text field, and the sweep actually found the components it is watching. |
| Per-surface mount tests | Each search bar's own suite drives its builder: opening it, two-way synchronisation, validation, clearing, and returning to plain text. Examples are `NoticeCentrePanel.test.ts`, `CommandPalette.test.ts`, `ChangelogViewer.test.ts` and `TabbedNavigation.test.ts`. |

Run the engine and policy tests with `npx vitest run packages/ui/src/components/config` from
`design/`.

## Where the builder appears

Every search bar in the application, which today includes the options editor and each of its
screens, the application settings surface, the maps and viewer menus, the marker menu, the world
wizard's steps, the release download lists, the interrupted-render list, the server profile list,
the command palette, the notification centre, the changelog viewer, the appearance editor's
element search, the colour picker, the typography editor's font searches, all four tab searches
and both tab bulk-close fields. The authority for that list is the guard rather than this
paragraph: it enumerates the components on every run, and a new surface joins the list by passing
it or fails.

## Suggested reading

- [Tabbed navigation](./tabbed-navigation.md), whose four searches and two bulk-close fields are
  the heaviest consumer of the builder.
- [The command palette](./command-palette.md) and
  [the notification centre](./notification-centre.md), two surfaces built around one of these
  fields.
- [Appearance editors](./appearance-editors.md), where the builder reaches the pickers themselves.

## 廣東話

### Regex builder,同佢掂到嘅所有 search bar

應用程式入面每一個 search bar 都開得出一個引導式嘅 pattern builder,anchored 喺佢所屬嘅欄位旁邊。預設係 plain text;regular expression 係用戶主動開先有嘅嘢。builder 講明佢為邊個 engine 砌 pattern、講明自己嘅限制,並且用個 search 實際會掃嘅文本嚟 preview。

code 喺 `design/packages/ui/src/components/config/`(settings 一族),`components/menu/` 同 `components/markers/` 有姊妹 adapter。

### 行為

#### 三個欄位、三個 builder、一套行為

共用嘅 search field 有三個,各自 render 自己 anchored 嘅 builder:`ConfigSearchField` 配 `ConfigRegexBuilder`;`MenuSearchField` 同 `MenuSearchBar` 配 `MenuRegexBuilder`;`MarkerSearchField` 配 marker 嘅 `RegexBuilder`。三個而唔係一個,係因為佢哋屬於三個 chrome 唔同嘅 surface 家族,唔係因為行為有分別。每個 surface 有自己嗰份 engine adapter,所以一個 surface 嘅 limits 冇可能喺另一個 surface 唔知情下被改。三個都預設 plain text、regex 係明確 opt-in,三個都行 host runtime 自己嘅 `RegExp`。

#### builder 係綁住個欄位,唔係泊喺旁邊

pattern 同 flags 係雙向嘅:喺 raw editor 打字即時改個 search,喺 search bar 打字亦改 editor。冇一個共用 builder 揸住「最後掂過邊個欄位」嘅 state。builder 由欄位開出、anchored 喺欄位旁邊、寫返入欄位,關閉時將 focus 交返畀欄位。閂返 regex mode 嘅話,literal query 保持原文,唔會被改寫。

#### builder 提供啲乜

- **按 token group 嘅引導式構建**:character classes、anchors、groups(capturing、non-capturing、named,加 back-reference)、alternation 同 quantifiers,仲有一個 literals 欄位,會 backslash-escape 每個 metacharacter,令打嘅字串 match 返自己。
- **raw pattern editor**,同 search bar 揸住嘅係同一個值。
- **每個支援嘅 flag** 以 chip group 顯示:`g`、`i`、`m`、`s`、`u`、`y`。
- **可編輯嘅 sample text**,由打開佢嗰個 surface 嘅真實 corpus seed,每行一個候選。用作出嚟嘅 sample preview 嘅 builder,教出嚟嘅 pattern 只 match 個 sample,唔 match 用戶手上任何嘢。
- **即時顯示 matches 連 capture groups**,named group 逐個名列出,pattern 打緊嗰陣有 syntax feedback。
- **Copy**:照砌出嚟嘅 pattern 原文寫出,唔加 delimiter,唔加用戶冇要求嘅 escaping。
- **engine 寫明喺介面度**而唔係淨係 comment 入面:ECMAScript `RegExp`,喺本 thread 本地評估,即係 search 過濾用嗰個 engine,所以 preview 冇可能同食個 pattern 嗰個 search 唔一致。`\d`、`\w`、`\s`、`\b`、named groups、back-references 同 lookaround 全部同 browser 入面一模一樣。

#### 每個 search bar 都有一個,而且有測試作證

最容易decay嘅正正係呢條規則,因為寫一個 label 叫「Search」嘅 plain text field 嗰陣完全唔覺得自己犯緊規:surface 出咗貨,個欄位睇落啱,contract 靜靜哋又少 cover 一個位。

所以 `regexPolicy.test.ts` 行勻 package 入面每個 component 問兩條問題:呢個檔案有冇 search 形狀嘅 input——即係 label、placeholder、name、model 或者 class 寫住 search、filter、find 或者 query?有嘅話,佢係咪由三個共用欄位其中一個攞個 search?答「有」同「唔係」嘅檔案就 fail。真係有一個 search 形狀但唔係 search 嘅 input,就要連原因寫入一個 exemption list,令豁免係有人寫低嘅一句話,唔係冇人留意到嘅空缺。

**嗰個 exemption list 而家係空嘅**,而呢個 guard 正係令「每個 search bar」係一句關於 code 嘅陳述,唔係關於邊個記性嘅陳述。detector 對「乜嘢算 search」刻意從寬:寧願要人寫一句豁免,都好過因為 label 係「Find a map」而放走一個真 search bar。guard 刻意唔檢查 builder *work 唔 work*——嗰樣係每個 surface 自己嘅 mount test 負責,喺 guard 度重複只會令佢又慢又脆,但唔會更嚴。

### 設定

限制有五項,全部寫咗喺 builder 自己嘅介面度(因為用戶睇唔到嘅限制,一咬人就似 bug),而且冇一項係用戶set得嘅:pattern 長度 512 字符(`MAX_PATTERN_LENGTH`)、sample 長度 20000 字符(`MAX_SAMPLE_LENGTH`)、匯報 matches 上限 500(`MAX_MATCHES`)、每次 preview 嘅 wall clock 100 ms(`MAX_EVAL_MS`)、flags 係 `g`、`i`、`m`、`s`、`u`、`y`(`SUPPORTED_FLAGS`)。

plain-text mode 係 case-insensitive substring match,亦係所有地方嘅預設。

### 失敗情況

- **compile 唔到嘅 pattern。** 錯誤會顯示,matcher match *乜都唔 match*,而唔係退返上一個 compile 到嘅 pattern——嗰樣會令畫面留住一堆屬於一個已經冇人見到嘅 search 嘅結果。
- **會指數式 backtrack 嘅 pattern,compile 之前就拒絕。** 呢個係 size 同 time limit 都cover唔到嘅一種失敗,算術講明點解:一次 `exec()` 冇得中斷,wall clock 係喺 match *之間*先check,而 `(a+)+$` 對住兩萬字符連第一次都唔會返,所以個 budget 永遠去唔到。cap 住 input 可以bound一個多項式 pattern,對指數式嗰種一啲用都冇。`regexRisk.ts` 檢查 pattern 嘅形狀,搵 nested unbounded quantifier 同另一種經典指數形式,拒絕時附明確原因,而唔係凍死個 window。拒絕係有真實代價嘅——真心想用 `(\w+\s*)+` 嘅用戶會被話唔得——但對比一個凍結咗、冇路返嘅 window,呢個係啱嘅取捨,因為同一個意圖幾乎一定有唔使 nesting 嘅寫法。
- **zero-width match** 有處理,唔會變無限 loop。
- **sample 長過上限**:preview 用截短版,而個上限寫咗喺畫面。
- **matches 多過上限**:報「capped」,唔會靜靜咁cut咗個 list。
- **閂返 regex mode**:literal query 原封不動,打咗嘅嘢嘅意思唔會喺用戶腳下改變。

### 保安考慮

評估係本地、in memory 嘅。任何 pattern 同 sample text 都唔會傳送、log 或者 persist 去任何地方,包括嗰啲會 persist 其他 state 嘅 surface:tab strip 明確將 queries 同 patterns 排除喺佢寫入 storage 嘅嘢之外,因為佢哋唔係普通嘅 layout preference,可以載住用戶打嘅任何嘢。

catastrophic backtracking 係任何 regex 功能最明顯嘅 denial-of-service 入口,而呢個 project 將佢當真威脅而唔係理論嘢,因為 pattern 係喺畫介面嗰條 thread 上行。上面嘅 static refusal 係主要緩解;四項bound係第二道防線。

tab titles、notification text 同 settings values 都當潛在敏感處理:search 或者 bulk close 為咗做嘢會讀佢哋,但之後唔保留、唔傳送。每個入口都鍵盤可達、有 accessible name 同 state,validation 同結果變化會announce但唔會不停打斷,match highlight 永遠唔係傳達結果嘅唯一方式。

### 驗證

- `regexEngine.test.ts`:有效同無效嘅 pattern、每個支援嘅 flag、escape 一個 literal、capture 同 named groups、zero-width matches,同四項bound逐一有執行、有匯報。
- `regexRisk.test.ts`:會被拒絕嘅指數形狀、唔會被拒嘅現實 query,同拒絕時附返嚟嘅原因文字。
- `regexPolicy.test.ts`:package 入面每個 search 形狀嘅 input 都用共用欄位或者有書面豁免、每個豁免仍然指住一個仍然似 search 嘅檔案、detector 捉到 plain search field 但唔會屈一個普通 text field,同埋個 sweep 真係搵到佢睇緊嗰啲 component。
- 每個 surface 嘅 mount test:各 search bar 自己嘅 suite 驅動佢個 builder——打開、雙向同步、validation、清空、返回 plain text。例子有 `NoticeCentrePanel.test.ts`、`CommandPalette.test.ts`、`ChangelogViewer.test.ts` 同 `TabbedNavigation.test.ts`。

由 `design/` 用 `npx vitest run packages/ui/src/components/config` 行 engine 同 policy 測試。

### builder 出現喺邊

應用程式每一個 search bar,今日包括:options editor 同佢每個 screen、application settings surface、maps 同 viewer menus、marker menu、world wizard 嘅步驟、release download lists、interrupted-render list、server profile list、command palette、notification centre、changelog viewer、appearance editor 嘅 element search、colour picker、typography editor 嘅字型 search、四個 tab search 同兩個 tab bulk-close 欄位。呢個清單嘅權威係個 guard 而唔係呢段字:佢每次行都列舉 component,新 surface 要不通過佢加入清單,要不就 fail。

### 建議閱讀

- [Tabbed navigation](./tabbed-navigation.md)——四個 search 同兩個 bulk-close 欄位,係 builder 最大嘅消費者。
- [The command palette](./command-palette.md) 同 [the notification centre](./notification-centre.md)——兩個圍住其中一個欄位起嘅 surface。
- [Appearance editors](./appearance-editors.md)——builder 連 picker 本身都掂到嘅地方。
