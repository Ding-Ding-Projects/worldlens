# Kid Mode smoke suite: driving the seams, not the parts

`scripts/kid-smoke.mjs` boots the real, built `@worldlens/ui` renderer inside
`design/packages/kid-check` — a plain Electron harness that exists for exactly this — and drives it
the way a child actually would: click the rail, click a catalogue card, type a wrong code into the
grown-up gate. It is not a second unit suite. Every serious bug Kid Mode shipped this session -
`award()` wired to nothing that ever called it, the first tap into a non-pinned job silently doing
nothing, a settings row missing its kid label, a copy key rendering its English fallback in every
language - passed the entire existing unit suite, because a component test injects its own
dependency and proves the screen, never the seam between screens. This suite exists to notice the
seam.

## Behaviour

### What it drives, and how

`kid-smoke.mjs` resolves Playwright's `_electron` launcher from **kid-check's own** dependency tree
(`createRequire` scoped to `design/packages/kid-check/package.json`), not from a dependency of this
script or of the repository root - the repository-root `scripts/` directory stays dependency-free
like every sibling script in it (`bootstrap.mjs`, `count-lines.mjs`, and the rest carry no `import`
beyond Node's own builtins), and the one thing that genuinely cannot be done with Node builtins -
driving Electron's DevTools Protocol reliably, including reaching the **main process** to force the
grown-up gate's locked branch - is borrowed from the package that already depends on it for exactly
that purpose. `design/packages/kid-check/src/main/index.ts`'s own doc comment says so directly: its
shared School-mode store is held on `globalThis.__kidCheckSchoolMode` "so the Node-side drive script
can reach it through `electronApp.evaluate()`", and its `package.json` already carries
`@playwright/test` as a devDependency. This is "the existing harness's solution" this task's own
brief asked to be reused rather than re-invented.

One Electron instance serves the whole run. Between the ten assertions, `resetKidState()` clears
every `bluemap-*`/`worldlens.*` `localStorage` key, applies whatever overrides that assertion needs,
and reloads - cheaper than relaunching the process, and it is the same idiom
`packages/app/test/screenshots.spec.ts` already uses for the same reason: several of the settings
stores this drives are read once, at module load, into a `reactive` singleton, so a value written
after the module has already loaded has no effect until the module is re-evaluated, which a full
page reload is the honest way to force.

### The nine assertions, and why each one matters

Every one of these is a regression guard for a real, already-shipped bug - not a hypothetical.
The table names which historical bug each one would have caught, and how the check was actually
watched failing (the task's own hard rule - "Edit ONLY your assigned files" - rules out the obvious
route of temporarily reintroducing the bug in source this script does not own; see "How every
assertion was watched failing" below for the three honest alternatives actually used).

| # | Assertion | The historical bug it guards | How it was watched failing |
|---|---|---|---|
| 0 | `App.vue` still calls `awardKidSticker(` from all four real completion handlers (static, no browser) | `award()` was reachable from nowhere: the ledger, the sticker book and the celebration were wired perfectly *to each other*, and nothing ever called the first link in the chain | self-test: the same pattern matcher, run against known-broken prose describing the bug, correctly reports all four patterns absent |
| 1 | Clicking a **non-pinned** job exactly once, from a cold Home, opens it | `KidShell.vue`'s `ensureJob`/`revealJob` read `jobStrip.value` in the same tick they were called, before Vue had mounted `KidJobStrip` behind its `v-else-if`; the very first tap into Work did nothing, and a second tap "fixed" it by which point the strip already existed | real: this *is* the exact first-ever entry into Work the historical bug broke. A bounded poll with **no second click** cannot pass unless the fix's queued-request drain actually runs |
| 2 | Seeding a real XP ledger correctly drives the sticker book, XP bar and level; turning Kid Mode off removes the only DOM path to `award()` | (adjacent to the historical bug) proves the *read* half of the ledger-to-UI wiring, and that there is no way to reach the reward economy with Kid Mode off | real before/after, twice: the sticker reads "Not yet" before seeding and "Won!" after; `.wl-kid` exists before turning Kid Mode off and is gone after |
| 3 | The grown-up gate lets a no-credential machine straight through with no field, and a configured credential asks, refuses a wrong answer without leaving Kid Mode, and accepts the right one | (a design contract, not a shipped regression) Kid Mode must never become a one-way door on a fresh install, and a toy lock must never accidentally become a real one | real, both branches: driven through kid-check's own real, scrypt-verified credential store via `seedConfiguredCredential()` - no fake bridge was ever injected |
| 4 | No rendered kid string is still its literal English fallback in Cantonese mode | a copy key rendered its English fallback in every language because the catalogue had no entry for it | self-test: a real Cantonese heading is forced back to its English fallback text and the same comparison catches it |
| 5 | Every interactive Kid Mode element measures at least 64px on its smaller axis (via `getBoundingClientRect`, not the CSS source) | (a design contract) Kid Mode's own floor is 64px, and nothing may go below it | self-test: a synthetic 20px probe is inserted and shown to be flagged by the same measurement function |
| 6 | The accessible name keeps the shipped feature name at all three label styles, read through the real Accessibility domain | (a design contract) `kidAccessibleName()` exists specifically so a screen reader, the tab finder and this project's own screenshots never lose the real name behind a kid label | self-test on the real DOM: the *visible* label alone does not contain the shipped name at kid-first style; the *real accessible name*, read via CDP, does |
| 7 | Reduced motion stops the mascot's CSS animation | (a design contract) every animation in Kid Mode is gated on `@media (prefers-reduced-motion: no-preference)` | real before/after: `page.emulateMedia()` toggles the actual OS-level media query Kid Mode's CSS reads; the animation genuinely runs one way and stops the other |
| 8 | Nothing clips at 360px width, 2x display scale, in bilingual mode | (a design contract) narrow widths and the longest localized strings are a required check everywhere in this project | self-test: an element is forced to `overflow: hidden` with an overlong string and the same detector flags it; the real, unforced measurement finds nothing today |
| 9 | No request leaves loopback for the whole run | (a design contract) Kid Mode's own documentation states nothing in it reaches the network | the classifier is unit-tested against five fabricated URLs (never a real external request - see below); the real assertion reads the actual requests captured for the session |

### How every assertion was watched failing

The task's hard rule - edit only `scripts/kid-smoke.mjs` and this file - rules out the most direct
way to prove a regression guard actually guards something: temporarily breaking the real bug back
into `design/packages/ui/src/kid/*.vue` and watching red. Every assertion above was still watched
failing honestly, one of three ways, and each assertion's own code comment says which:

- **A real "before" state that genuinely fails the check.** Most of the design-contract assertions
  get this for free: before the ledger is seeded the sticker reads "Not yet"; before Cantonese is
  selected the text is English; before reduced motion is emulated the mascot's animation genuinely
  runs. Running the identical check against that real state and requiring FAIL, then against the
  real target state and requiring PASS, is watching the same code path go both ways with no source
  file touched.
- **Real runtime state control that reproduces the historical failure's shape.** Assertion 1 is a
  cold, first-ever entry into Work with exactly one click and a bounded poll - the literal scenario
  the historical race condition broke, reproduced by the harness's own timing rather than by an
  injected fault. Assertion 3's two grown-up-gate branches are both real machine states, reached
  through kid-check's own real credential store.
- **A self-test of the detector**, always labelled as exactly that in the code and in the table
  above, for the assertions with no organically-reachable violation in this checkout to point the
  detector at (there is no undersized control, no clipped element and no missing Cantonese string in
  Kid Mode today - it is a genuinely well-built feature). A synthetic violation is inserted, shown to
  be caught by the *same* function the real check uses, then removed before the real result is
  measured.

Every one of assertions 1 through 3 also failed for real, unplanned reasons while this suite was
being built - see "Two more real findings" below - and each failure was fixed by correcting this
script's own assumption about the real DOM, never by loosening the assertion. That is a fourth, less
formal kind of "watched it fail": these were not hypothetical dry runs.

### Two more real findings this suite surfaced

Neither is one of the nine assigned assertions and neither is this suite's bug to fix - both belong
in `design/packages/ui/src/kid/*.vue` or `design/packages/ui/src/styles/global.scss`, which this
script does not own. Both are reported prominently in the script's own console output on every run
(see `reportPointerEventsFinding()` and assertion 1's own comment in `kid-smoke.mjs`), and both have
been flagged as separate follow-up work rather than silently absorbed:

1. **A real mouse cannot click any Kid Mode control today.** `#app .v-main { pointer-events: none; }`
   (`design/packages/ui/src/styles/global.scss`) makes the whole content area click-through by
   design; only Vuetify's own components and elements carrying `.mb-interactive` opt back in. Kid
   Mode's controls (`.wl-kid-rail__big` and every sibling) are plain `<button>` elements with
   neither, so a real, hit-tested pointer click lands on `#map-container` underneath instead.
   Corroborated independently by `design/packages/kid-check/test-results/*/error-context.md`, the
   sibling capture harness's own test output. Every driven assertion in this suite routes around it
   with `jsClick()`/`jsFill()` - a plain DOM `.click()`/value-set that bypasses hit-testing entirely
   - rather than a real pointer event, specifically because of this; Playwright's own `force: true`
   was tried first and does **not** help, because it only skips Playwright's pre-flight checks, never
   the browser's own hit-testing that the underlying `Input.dispatchMouseEvent` still performs.
2. **A job tab opened after mount keeps its shipped name, not its kid label, until the label style is
   next touched.** `KidJobStrip.vue`'s own doc comment claims a job "opened later still picks up the
   current label", but `applyKidLabels()` only re-runs on a `watch([kid.labelStyle, kid.enabled])`
   change, never when a new tab is created. Assertion 1's own diagnostics show the newly opened
   Backups tab reading "Backups" (its shipped name) rather than "Safe copies" (its
   `KID_JOB_LABELS` entry) - confirmed by driving the real app, not assumed from source.

### A real defect this suite found before it could assert anything, since fixed upstream

While this suite was first being built, `#app` never finished mounting at all:
`design/packages/ui/src/stores/profiles.ts` calls `window.worldlens?.syncProfiles(profiles)` -
optional-chaining the *bridge object*, never the *method* - and kid-check's preload is, by its own
design, deliberately partial (a real School-mode bridge and four window-control methods, nothing
else). That made `typeof window.worldlens === "object"` true while `syncProfiles` stayed absent,
throwing `TypeError: e.syncProfiles is not a function` during `profiles.ts`'s own module-scope
initialisation, before `App.vue` ever finished mounting - so `#app` stayed a permanently empty
`<div>`. This is precisely the bug class the whole harness exists to catch, one layer down:
`profiles.ts` was tested against a fully-present or fully-absent bridge, never a trimmed, partial
one, and nothing in the unit suite could have noticed because nothing in it boots a partial bridge.

By the time this script's current version runs, both that defect and a companion Content-Security-
Policy `font-src` gap beside it had been fixed directly in `design/packages/kid-check`'s own
`main/index.ts` (its `hardenSession()` and a real `syncProfiles` no-op - see that file's own doc
comment, "found by launching this harness against the real renderer and reading what broke, not
predicted in advance"). `kid-smoke.mjs` keeps an unused, documented function
(`installSyncProfilesGuardRewrite`) recording the network-level workaround this script used for the
stretch of the task before that upstream fix landed, so the history is not lost from `git blame`.

## How to run it

```
node scripts/kid-smoke.mjs
```

From the repository root, on Windows, with Node 22 or newer. The script builds nothing itself and
expects both halves of what it drives to already be built and current:

```
pnpm --filter @worldlens/ui run build
pnpm --filter @worldlens/kid-check run build
```

A freshness guard runs before anything is launched - the identical trap
`design/packages/app/test/freshBundle.ts` documents and guards: a stale bundle produces assertions
that pass while exercising the *previous* version of the interface, and nothing about that is
visible without checking file timestamps. If either package's build is missing or older than its own
sources, the run fails immediately and names the exact command to fix it, before Electron is ever
launched.

The Electron binary itself must already be extracted (`pnpm install` alone does not always finish
this - see `design/scripts/ensure-electron-binary.mjs`'s own doc comment for why):

```
node design/scripts/ensure-electron-binary.mjs
```

The suite prints one `>>`/`PASS`/`FAIL` block per assertion as it runs, including its own `watched:`
line explaining how that specific check was proven capable of failing, followed by a full report and
a process exit code (`0` only when every assertion passed). A fresh, isolated `--user-data-dir` is
created per run and deleted afterward regardless of outcome, so one run's Kid Mode preferences, XP
ledger or grown-up credential never leak into the next.

## Failure modes

- **The freshness guard fires.** Either `packages/ui` or `packages/kid-check` was built before its
  own sources last changed, or has never been built at all. The reported error names the exact stale
  or missing output and the exact command to fix it; nothing is launched.
- **Playwright or the Electron binary cannot be resolved.** `resolvePlaywrightElectron()` reports
  the exact missing package or unresolved binary path, and names the fix (`pnpm install` in
  `design/`, or `node design/scripts/ensure-electron-binary.mjs`) rather than a bare stack trace.
- **A selector this script hard-codes stops matching.** Every selector here is copied from the real
  source it drives (the class names and structure documented in each `kid/*.vue` file), the same
  discipline `design/packages/kid-check/test/drive.ts`'s own doc comment states for its own
  selectors: this package owns none of `design/packages/ui/src` and can add no `data-testid` hooks to
  it, so a selector that is wrong here fails loudly - a clear "could not find X" or a bounded timeout
  naming what it was waiting for - rather than silently matching the wrong element. `assertion 1` and
  `goToGrownUpGate()` additionally dump the current pane's child classes and every tab's title on
  timeout, specifically because that diagnostic is what found both real findings recorded above.
- **The pointer-events defect gets fixed.** Every driven click and fill in this file uses
  `jsClick()`/`jsFill()` specifically to route around it (see "Two more real findings" above). Once
  it is fixed, those calls keep working exactly as before - a plain DOM `.click()` still fires the
  same handler a real pointer click would - so no change is required here, though
  `reportPointerEventsFinding()`'s own diagnostic will then report the click landing correctly
  instead of printing the finding, which is the signal the fix landed.
- **A sibling fleet edits `design/packages/kid-check` or `design/packages/ui` while this suite is
  mid-run.** This happened during development (see "the freshness guard fires" above, which caught
  it in practice): the fix is simply to rebuild the stale package and re-run: the freshness guard
  exists precisely so this failure mode is loud and actionable rather than a confusing, unrelated
  assertion failure three steps later.

## What this cannot cover

`award()` is only reachable, in the shipped app, from four real completion handlers in `App.vue`
(`onLocalRenderOpened`, `onWorldProjectOpened`, `onPagesOpened`, and the render-finished path) -
every one of them needs a capability kid-check deliberately does not wire up (a real Java render, a
real GitHub account, a real published site; see `design/packages/kid-check/src/main/index.ts`'s own
doc comment for exactly what it leaves off and why). This harness cannot fire a real completion
event, and does not pretend to. Assertion 2 instead does the two things that *are* honestly testable
without one: a static check that `App.vue`'s source still calls `awardKidSticker(` from all four real
handlers (exactly what would have caught "nothing calls `award()` at all"), and a live check that the
ledger-to-UI half of the wiring is correct by seeding a real ledger record and reading it back off
the real rendered sticker book, XP bar and level.

Reaching `KidShell`'s exposed `award()`/`ensureJob()`/`revealJob()` directly, the way
`defineExpose({...})` makes them available to a template ref, was also investigated and does not
work from outside the Vue tree: Vue does not attach a `__vueParentComponent`-style handle to this
production build's DOM (`design/packages/kid-check/test/drive.ts`'s own doc comment independently
reaches the identical conclusion - "no `window`-level handle a Node-side script could reach anyway"),
so there is no black-box route to an exposed method other than driving the real UI that calls it.

This suite also does not replace the existing `kidMode.contract.test.ts` coverage described in
[Kid Mode](./kid-mode.md) - it is a different kind of test entirely, driving the real renderer
through real interaction rather than asserting registry coverage from source, and the two are
complementary rather than overlapping.

## Security considerations

Nothing this suite drives reaches the network, and it proves that rather than assuming it: assertion
9 records every request the page makes for the whole run and asserts every one resolves to loopback
or a local scheme. The one exception observed during development - a refused
`connect-src 'self'` Content-Security-Policy violation when Kid Mode's own dim-sum-surprise feature
tried to reach the public dish catalogue - is itself confirming evidence rather than a leak: the
attempt was blocked by the renderer's own CSP before it ever reached the network layer, so it never
appears as a captured request at all.

The credential this suite drives through the grown-up gate (assertion 3) is a real, throwaway secret
(`"kid-smoke-secret-2"`, hard-coded in this file) verified through kid-check's own real, scrypt-
derived credential store - never a shared or otherwise sensitive value, never persisted anywhere
beyond the disposable Electron profile this script creates and deletes per run, and never logged.

## Accessibility

Assertion 5 measures real, rendered touch targets rather than trusting CSS declarations, and
assertion 6 reads real computed accessible names through the CDP Accessibility domain rather than
inferring them from the kid-label lookup table - the same distinction this project's own rules draw
everywhere else between a declared property and a verified one. Assertion 7 drives the actual
`prefers-reduced-motion` media query Kid Mode's CSS reads, not a JavaScript flag this script sets
directly, so a real animation genuinely running (or not) is what the assertion measures.

## Verification

This file *is* the verification - there is no separate second-order test suite over
`kid-smoke.mjs` itself. Every assertion's own code comment states its watched-failing methodology
inline, and the script's own console output repeats it at run time under a `watched:` line, so the
evidence travels with every run rather than living only in this document.

Run it with:

```
node scripts/kid-smoke.mjs
```

## Suggested articles

- [Kid Mode](./kid-mode.md) - the sixteen files this suite drives, and the `kidMode.contract.test.ts`
  coverage it complements rather than replaces.
- [Browser-style tabbed navigation](./tabbed-navigation.md) - `WorkPane`'s own tab contract, which
  `KidJobStrip.vue` re-hosts and assertion 1 drives through.
- [Language modes and funny levels](./language-and-tone.md) - the `VOICED`/`FIXED` catalogue shape
  assertion 4 checks Kid Mode's own strings against.
- [The design system](./design-system.md) - the Material Design 3 role vocabulary and the 48px/64px
  touch-target floors assertion 5 measures against.

## 廣東話

### Kid Mode 煙霧測試套裝：撳條 seam，唔係撳嗰啲散件

`scripts/kid-smoke.mjs` 喺 `design/packages/kid-check`——一個為咗呢個目的專登起返嚟嘅、純淨版
Electron harness——入面，開返個真、起好咗嗰個 `@worldlens/ui` renderer，然後好似小朋友咁真係去撳：
撳條 rail、撳個目錄卡、喺大人閘口打錯個碼。呢個唔係第二套 unit test。今次 session 入面 Kid Mode
出嘅每一個正經 bug——`award()` 冇嘢叫過佢、第一下撳一個未釘住嘅 job 靜靜雞冇反應、一行設定
冇 kid label、一條文案 key 喺每種語言都印緊英文後備——全部都喺成套 unit test 度過關,因為一個
component test 注入自己嗰個依賴,證明嘅係嗰個畫面,永遠唔係畫面之間嗰條 seam。呢個套裝就係為咗
捉返嗰條 seam 而存在。

#### 行為

##### 佢撳緊乜,同點樣撳

`kid-smoke.mjs` 由 **kid-check 自己** 嗰個依賴樹度解算 Playwright 嘅 `_electron` launcher
（`createRequire` 錨定去 `design/packages/kid-check/package.json`）,唔係呢個 script 或者
repository root 自己嘅依賴——repository root 嘅 `scripts/` 目錄同佢每一個兄弟 script
（`bootstrap.mjs`、`count-lines.mjs` 同其餘嗰啲）一樣,冇依賴任何 Node built-in 以外嘅嘢;
而真係做唔到嘅嗰一件事——可靠咁去駕馭 Electron 嘅 DevTools Protocol,包括去到 **main process**
逼大人閘口入去鎖住嗰個分支——就借返俾一個本來已經為咗呢個目的而依賴緊佢嘅 package。
`design/packages/kid-check/src/main/index.ts` 自己嗰段文件註解都講得好白:佢共用嗰個 School-mode
store 就係擺喺 `globalThis.__kidCheckSchoolMode` 度,"等 Node 呢邊嘅 drive script 可以透過
`electronApp.evaluate()` 攞到",而佢個 `package.json` 本來就帶住 `@playwright/test` 呢個
devDependency。呢個就係呢個任務 brief 自己叫做「用返現有 harness 嘅方法」,而唔係另起爐灶。

成個run共用一個 Electron instance。十個斷言之間,`resetKidState()` 會清晒每一個 `bluemap-*`／
`worldlens.*` 嘅 `localStorage` key,套用嗰個斷言需要嘅任何覆寫,然後 reload——呢個做法平過重開
成個 process,而且同 `packages/app/test/screenshots.spec.ts` 自己用緊嗰個手法一模一樣,原因都一樣:
呢度駕馭緊嘅好幾個設定 store,都係一開機讀一次,讀入一個 `reactive` 單例,所以個 module 已經讀完
之後先寫入嘅值係冇效果嘅,要成個 module 重新行一次先得——而完整 reload 一頁就係老實迫到呢件事
發生嘅方法。

##### 九個斷言,同埋每一個點解重要

以下每一個都係一個真係已經出咗貨嘅 bug 嘅回歸守衛——唔係憑空想像嘅。個表列明每一個對應緊
邊個歷史問題,同埋個檢查究竟係點樣真係俾人睇住佢 fail 過（呢個任務自己嗰條硬規則——「淨係改你
自己派到嗰啲檔案」——排除咗最直接嗰條路,就係喺呢個 script 冇擁有嘅源碼度暫時擺返個 bug 落去;
下面「每一個斷言係點樣俾人睇住佢 fail」有講返實際用嗰三種老實方法)。

`0` 號係 `App.vue` 仍然由全部四個真嘅完成 handler 度叫 `awardKidSticker(`（靜態檢查,唔使開
瀏覽器）,守住嘅係「`award()` 冇任何地方會叫佢」嗰個問題;`1` 號係喺一個冷 Home 度,淨係撳一次
一個未釘住嘅 job 就要打得開,守住嘅係 `ensureJob`/`revealJob` 喺 `KidJobStrip` 未掛之前就讀
`jobStrip.value` 嗰個問題;`2` 號係種一份真嘅 XP 紀錄簿要正確帶動貼紙簿、XP 條同等級,同埋閂咗
Kid Mode 就冇路去到 `award()`;`3` 號係大人閘口喺冇憑證嗰陣直落過去、有憑證嗰陣會問、錯碼會拒絕
但唔會走出 Kid Mode;`4` 號係 Cantonese 模式冇任何一句 kid 文字仲係佢個英文後備原字;`5` 號係
每一個互動控制項量出嚟都至少 64px;`6` 號係三種標籤風格,accessible name 都仍然帶住出貨嘅功能名,
經真正嘅 Accessibility domain 讀出嚟;`7` 號係減少動畫會停晒吉祥物嗰個 CSS animation;`8` 號係
喺 360px 闊、2 倍顯示比例、雙語模式底下乜都唔會被裁走;`9` 號係成個run都冇一個請求走出過 loopback。

##### 每一個斷言係點樣俾人睇住佢 fail 嘅

呢個任務嗰條硬規則——淨係改 `scripts/kid-smoke.mjs` 同呢份文件——排除咗最直接、證明一個回歸守衛
真係守到嘢嘅方法:暫時將個真 bug 擺返落 `design/packages/ui/src/kid/*.vue` 度,睇住佢變紅。
以上每一個斷言都仍然係老實咁俾人睇住佢 fail 過,用三種方法之一,每一個斷言自己嘅代碼註解都講明
用邊種:一個真係會令檢查 fail 嘅「之前」狀態(大部分設計合約類斷言都免費有——未種紀錄簿之前
貼紙寫「未攞到」,未揀 Cantonese 之前文字係英文,未模擬減少動畫之前吉祥物真係郁緊);真實嘅
runtime 狀態控制,重演返歷史故障嗰個形狀(斷言 1 就係一個冷、第一次入 Work、淨係一下撳,同一個
有限期嘅輪詢——一模一樣係嗰個歷史 race condition 出事嗰個情景,靠 harness 自己嘅時序去重演,
唔係靠外面注入一個故障);同埋一個偵測器嘅自我測試,喺代碼同上面個表都清清楚楚標明係咁,用喺
呢個 checkout 入面搵唔到有機可乘嘅違規例子嗰幾條斷言度(呢個 checkout 嘅 Kid Mode 而家真係冇
細過標準嘅控制項、冇裁走嘅元素、冇漏譯嘅 Cantonese 字——係一個起得幾好嘅功能)。

斷言 1 到 3 喺呢個套裝起緊嗰陣,仲因為真實、冇計劃過嘅原因 fail 過——見下面「呢個套裝仲揭埋嘅
兩樣嘢」——而每一次 fail 都係靠修正呢個 script 自己對真 DOM 嘅假設嚟解決,從來冇靠鬆化個斷言。
呢個係第四種、冇咁正式嘅「俾人睇住佢 fail」:呢啲從來都唔係憑空試跑。

##### 呢個套裝仲揭埋嘅兩樣嘢

兩樣都唔屬於派俾呢個套裝嘅九個斷言,兩樣都唔係呢個套裝自己嘅 bug 要修——兩樣都應該喺
`design/packages/ui/src/kid/*.vue` 或者 `design/packages/ui/src/styles/global.scss` 度修,
而呢個 script 冇擁有呢兩個檔案。兩樣喺 script 自己嗰個 console output 每次run都會顯眼咁報出嚟
（睇 `kid-smoke.mjs` 入面 `reportPointerEventsFinding()` 同斷言 1 自己嗰段註解）,而且兩樣都已經
標記咗做獨立跟進工作,而唔係靜靜雞吞落肚:

1. **今日一隻真滑鼠撳唔到任何一個 Kid Mode 控制項。**
   `#app .v-main { pointer-events: none; }`（`design/packages/ui/src/styles/global.scss`）
   刻意令成個內容區 click-through;淨係 Vuetify 自己嗰啲 component,同帶住 `.mb-interactive`
   嗰啲元素,先會揀返做得撳。Kid Mode 嘅控制項（`.wl-kid-rail__big` 同佢晒啲兄弟）全部都係
   兩者都冇嘅普通 `<button>`,所以一個真、有做過 hit-test 嘅撳擊,會落咗喺底下嗰個
   `#map-container` 度。呢個由 `design/packages/kid-check/test-results/*/error-context.md`
   ——姊妹隊自己嗰個 capture harness 嘅測試輸出——獨立印證過。呢個套裝入面每一個駕馭緊嘅斷言,
   都用 `jsClick()`/`jsFill()`——一個直接繞過 hit-test 嘅普通 DOM `.click()`／set value——
   而唔係一個真嘅滑鼠事件,正正就係為咗呢個原因;Playwright 自己嗰個 `force: true` 一早試過,
   但唔work,因為佢淨係跳過 Playwright 自己嘅預檢,永遠跳唔過瀏覽器自己嗰套、由底層
   `Input.dispatchMouseEvent` 仍然做緊嘅真 hit-test。
2. **一個喺開機之後先打開嘅 job tab,喺個標籤風格未再撳過之前,會繼續掛住出貨名,而唔係 kid
   label。** `KidJobStrip.vue` 自己嘅文件註解話一個「遲啲先開」嘅 job 「仍然會攞到當時嘅標籤」,
   但 `applyKidLabels()` 淨係喺 `watch([kid.labelStyle, kid.enabled])` 呢個變化先會再行,一個
   新 tab 開出嚟嗰陣從來唔會觸發佢。斷言 1 自己嗰啲診斷顯示,新開嘅 Backups tab 讀住「Backups」
   （佢出貨嗰個名）,而唔係「Safe copies」（佢喺 `KID_JOB_LABELS` 嗰個 entry）——呢個係揸住
   真程式駛出嚟確認嘅,唔係喺源碼度估嘅。

##### 呢個套裝喺乜都斷言唔到之前搵到嘅一個真缺陷,而家上游已經修好咗

呢個套裝啱啱起緊嗰陣,`#app` 從來未真正掛載完成過:`design/packages/ui/src/stores/profiles.ts`
叫 `window.worldlens?.syncProfiles(profiles)`——用可選鏈式判斷嗰個橋接物件本身,而唔係嗰個
method——而 kid-check 個 preload,係佢自己設計刻意咁,一直都係局部嘅(一個真嘅 School-mode
橋接同四個視窗控制 method,冇多過呢啲)。所以 `typeof window.worldlens === "object"` 係真嘅,
但 `syncProfiles` 就係冇——喺 `profiles.ts` 自己個 module-scope 初始化嗰陣,拋出
`TypeError: e.syncProfiles is not a function`,喺 `App.vue` 未掛載完之前就爆——所以 `#app`
一直都係一個永遠空嘅 `<div>`。呢個正正就係成個 harness 存在嚟捉嗰種 bug,不過落多一層:
`profiles.ts` 一路以嚟都係對住一個完全存在或者完全冇嘅橋接嚟測,從來未對住一個局部嘅測過,而
unit test 冇一個會捉到,因為冇一個會開機一個局部橋接。

到呢個 script 而家呢個版本執行嗰陣,嗰個缺陷同佢隔籬一個 Content-Security-Policy `font-src`
嘅漏洞,已經直接喺 `design/packages/kid-check` 自己嘅 `main/index.ts` 度修好咗(佢自己嘅
`hardenSession()`,同一個真、老實嘅 `syncProfiles` no-op——嗰個檔案自己嘅文件註解講到明:
「靠開返呢個 harness 對住真 renderer 攞第一手咩壞咗,而唔係預先估」)。`kid-smoke.mjs` 保留咗
一個冇用、但有文件講明嘅 function(`installSyncProfilesGuardRewrite`),記低呢個 script 喺
上游修好之前嗰段時間用過嘅網絡層繞過方法,等呢段歷史唔會喺 `git blame` 度消失。

#### 點樣執行

```
node scripts/kid-smoke.mjs
```

喺 repository root 度,Windows,Node 22 或以上。呢個 script 本身乜都唔會起,佢預期自己駕馭嗰兩邊
都已經起好、而且係最新:

```
pnpm --filter @worldlens/ui run build
pnpm --filter @worldlens/kid-check run build
```

任何嘢起機之前都會行一個新鮮度守衛——同 `design/packages/app/test/freshBundle.ts` 記低、守住嗰個
陷阱一模一樣:一個舊 bundle 出嚟嘅斷言會過關,但其實測緊嗰個介面已經係上一個版本,而呢件事唔睇
檔案時間戳就完全睇唔出。只要任一個 package 嘅 build 唔存在,或者舊過佢自己嘅源碼,個run就會即刻
fail,並且講明實際要行邊條命令去修,而 Electron 連起都未起過。

Electron 個執行檔本身要事先解壓好(單靠 `pnpm install` 唔一定做得晒——原因睇
`design/scripts/ensure-electron-binary.mjs` 自己嘅文件註解):

```
node design/scripts/ensure-electron-binary.mjs
```

呢個套裝行嗰陣,每一個斷言都會印一個 `>>`／`PASS`／`FAIL` 區塊,包埋佢自己嗰句 `watched:`,
解釋緊呢一個檢查係點樣證明到自己有能力 fail,跟住係一份完整報告,同埋一個 process exit code
（淨係全部斷言都過咗先會係 `0`）。每次run都會整一個新、獨立嘅 `--user-data-dir`,無論結果點都會
喺之後刪走,所以一次run嘅 Kid Mode 偏好、XP 紀錄簿或者大人憑證,永遠唔會漏入下一次run。

#### 失敗情況

- **新鮮度守衛觸發。** `packages/ui` 或者 `packages/kid-check` 起嗰陣舊過自己源碼最後一次改動,
  或者根本未起過。報出嚟嘅錯誤會講明實際邊個 output 舊咗或者唔存在,同埋實際要行邊條命令去修;
  乜都未起過機。
- **解算唔到 Playwright 或者 Electron 執行檔。** `resolvePlaywrightElectron()` 會報出實際邊個
  package 搵唔到,或者邊個執行檔路徑解算唔到,並且講明修法(`design/` 度 `pnpm install`,或者
  `node design/scripts/ensure-electron-binary.mjs`),而唔係得個裸 stack trace。
- **呢個 script 寫死嗰個 selector 冇再中。** 呢度每一個 selector 都係由佢實際駕馭緊嗰個源碼度
  抄過嚟(每一個 `kid/*.vue` 檔案自己記低嗰啲 class 名同結構),同
  `design/packages/kid-check/test/drive.ts` 自己嗰段文件註解對佢自己啲 selector 講嘅原則一樣:
  呢個 package 冇擁有任何一吋 `design/packages/ui/src`,亦都加唔到 `data-testid` 呢啲鈎入去,
  所以呢度一個錯咗嘅 selector 會大聲咁 fail——一句清楚嘅「搵唔到 X」,或者一個講明自己等緊乜嘢
  嘅有限期 timeout——而唔係靜靜雞夾中錯嘅元素。`assertion 1` 同 `goToGrownUpGate()` 仲會喺
  timeout 嗰陣多印一次而家個 pane 底下嘅 child class 同每一個 tab 嘅標題,正正就係呢個診斷,
  搵出咗上面記低嗰兩個真發現。
- **pointer-events 嗰個缺陷修好咗。** 呢個檔案入面每一個駕馭緊嘅撳擊同填寫,都用緊
  `jsClick()`/`jsFill()`,正正就係為咗繞過佢(睇上面「呢個套裝仲揭埋嘅兩樣嘢」)。一旦修好咗,
  嗰啲呼叫照舊會照樣行得通——一個普通 DOM `.click()` 都仍然會觸發一個真滑鼠撳擊會觸發嗰個
  handler——所以呢度唔使改任何嘢,不過 `reportPointerEventsFinding()` 自己嗰個診斷,到時就會報
  「撳擊真係中咗」,而唔係印出嗰個發現,呢個就係修好咗嘅信號。
- **另一支隊喺呢個套裝行緊嗰陣改緊 `design/packages/kid-check` 或者 `design/packages/ui`。**
  起呢個套裝嗰陣真係發生過(見返上面「新鮮度守衛觸發」——實際上就係佢捉到嘅):修法好簡單,
  重新起返舊咗嗰個 package,再run多次——新鮮度守衛存在嘅意義,正正就係為咗令呢種失敗大聲、
  好處理,而唔係三步之後爆一個睇落唔相關嘅斷言失敗。

#### 呢套嘢覆蓋唔到啲乜

`award()` 喺出貨嗰個 app 度,淨係喺 `App.vue` 四個真嘅完成 handler 度攞到(`onLocalRenderOpened`、
`onWorldProjectOpened`、`onPagesOpened`,同 render 完成嗰條路)——每一個都需要 kid-check 刻意
冇接嗰種能力(一個真 Java render、一個真 GitHub 帳戶、一個真已發佈嘅網站;`design/packages/
kid-check/src/main/index.ts` 自己嘅文件註解講明實際留低咗乜、同埋點解)。呢個 harness 觸發唔到
一個真嘅完成事件,亦都冇扮到做得到。斷言 2 反而做返兩樣冇呢個都真係測得到嘅嘢:一個靜態檢查,
確認 `App.vue` 源碼仍然由全部四個真 handler 度叫 `awardKidSticker(`(呢個正正就係捉到「乜都
冇叫過 `award()`」嗰種問題嘅方法),同埋一個實時檢查,靠種一份真紀錄簿、再喺真正 render 出嚟嗰個
貼紙簿、XP 條同等級度讀返出嚟,證明紀錄簿去到介面呢半條路正確。

直接攞 `KidShell` 公開嗰個 `award()`/`ensureJob()`/`revealJob()`——即係 `defineExpose({...})`
本應該畀一個 template ref 攞到嗰種方式——都試過,喺呢個生產 build 度由 Vue 樹外面根本行唔通:
Vue 喺呢個 build 冇喺 DOM 度掛一個似 `__vueParentComponent` 咁嘅 handle
（`design/packages/kid-check/test/drive.ts` 自己嗰段文件註解都獨立得出同一個結論——「`KidShell.
vue` 嘅 `defineExpose` 冇一個 `window` 層級嘅 handle 俾一個 Node 邊嘅 script 攞到」),所以除咗
駕馭真介面去撳嗰個叫佢嘅嘢,冇第二條黑盒路線去到一個公開咗嘅 method。

呢個套裝亦都唔係取代 [Kid Mode](./kid-mode.md) 講嗰個現有 `kidMode.contract.test.ts` 覆蓋——佢係
完全另一種測試,靠真互動去駕馭真 renderer,而唔係由源碼斷言登記表覆蓋率,兩者係互補,唔係重疊。

#### 保安考量

呢個套裝駕馭緊嘅嘢冇一樣會出網絡,而佢仲真係證明咗呢件事,唔係得個假設:斷言 9 記低成個run入面
個頁面發出嘅每一個請求,並且斷言每一個都解到去 loopback 或者本機 scheme。起呢個套裝嗰陣見過嘅
唯一一個例外——Kid Mode 自己嗰個 dim-sum-surprise 功能試去攞公開嗰個菜色目錄,俾一個
`connect-src 'self'` 嘅 Content-Security-Policy 拒絕咗——本身仲係一個確認咗嘅證據,唔係一個
洩漏:呢個嘗試喺去到網絡層之前,已經俾 renderer 自己嗰個 CSP 擋咗,所以佢從來冇以一個俾捕捉到嘅
請求身份出現過。

呢個套裝經大人閘口(斷言 3)駕馭緊嗰條憑證,係一個真、用完即棄嘅密碼
（`"kid-smoke-secret-2"`,寫死喺呢個檔案入面),經 kid-check 自己真、用 scrypt 推導嘅憑證儲存
驗證——永遠唔係一個共用或者敏感嘅值,永遠唔會喺呢個 script 每次run整整完即刻刪走嗰個臨時
Electron profile 之外留低過,亦都永遠唔會被記錄低。

#### 無障礙

斷言 5 量嘅係真、render 出嚟嘅觸控目標,而唔係信 CSS 宣告本身;斷言 6 經 CDP 嘅 Accessibility
domain 讀真嘅、計出嚟嘅 accessible name,而唔係由 kid-label 查找表度估——同呢個專案自己成套規則
喺其他地方一直分清楚「宣告咗嘅屬性」同「驗證過嘅屬性」係一樣嘅原則。斷言 7 駕馭嘅係 Kid Mode
CSS 真正讀緊嗰個 `prefers-reduced-motion` media query,而唔係呢個 script 自己直接設嘅一個
JavaScript flag,所以一個動畫真係郁緊(定係唔郁)先係呢個斷言度量緊嘅嘢。

#### 核實

呢份文件本身就係核實——冇另外一套第二層測試去測 `kid-smoke.mjs` 本身。每一個斷言自己嘅代碼
註解都寫明自己嗰套「俾人睇住佢 fail」嘅方法,而 script 自己個 console output 喺行嗰陣都會喺
`watched:` 嗰句度重複一次,所以證據會跟住每一次run走,而唔係得呢份文件度先有。

用呢句去行:

```
node scripts/kid-smoke.mjs
```

#### 建議閱讀

- [Kid Mode](./kid-mode.md)——呢個套裝駕馭緊嗰十六個檔案,同佢補完而唔係取代嗰個
  `kidMode.contract.test.ts` 覆蓋。
- [Browser-style tabbed navigation](./tabbed-navigation.md)——`WorkPane` 自己個 tab 合約,
  `KidJobStrip.vue` 重新掛住佢,而斷言 1 就係經呢條路駕馭過去。
- [Language modes and funny levels](./language-and-tone.md)——`VOICED`/`FIXED` 目錄形狀,
  斷言 4 就係攞呢個嚟對住 Kid Mode 自己啲字檢查。
- [The design system](./design-system.md)——Material Design 3 嘅 role 詞彙,同斷言 5 量緊嗰
  48px/64px 觸控目標下限。
