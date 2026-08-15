# The Material 3 conformance harness

An instrument, not a product: a plain Electron app with no title bar, no navigation, no shell,
and no product chrome, that renders a hand-transcribed Material Design 3 reference next to this
application's own real Vuetify components, and a script that drives it headlessly to capture a
side-by-side photograph and a set of measured facts for every row.

**Read this before trusting a clean report.** The reference pane is not a certified copy of the
Material 3 specification and is not sourced from an installed reference implementation -
`@material/web` is not a dependency anywhere in this workspace. It is a hand transcription,
typed by a human or an assistant reviewing the published spec at one point in time, and it says
so in its own file header and in the app's own on-screen honesty banner. This harness can show
you that two things measured the same way came out different (or the same); it cannot certify
that either side is what Google's specification actually requires, because nobody has checked
the reference pane against the spec by any means other than reading it. Treat every clean row as
"nothing this harness could tell was wrong," never as "verified conformant."

The code is `scripts/md3-compare.mjs` (this repository's root, the file that does the driving)
and `design/packages/md3-check/` (a separate package, built independently, that this script
consumes but never edits - the app itself, its rows, and its reference styling all belong to
that package's own commit history). `design/packages/md3-check/src/renderer/styles/
m3Reference.scss` is the reference pane's own source, with a long header explaining exactly what
it cites and what it deliberately does not.

## Behaviour

### What gets compared

The app presents a **gallery**: every implemented comparison sits in its own row, discovered live
from the DOM rather than requested by name (`[data-md3-row="<id>"]`, the same attribute
`design/packages/md3-check/src/renderer/lib/rows.test.ts` already enforces exists for every row
its manifest marks implemented). Each row has two panes side by side - `.md3check-pane--reference`
(the hand-typed M3 baseline, always the visually left pane) and `.md3check-pane--worldlens` (this
application's real, unmodified `@worldlens/ui` component, imported through
`design/packages/md3-check/src/renderer/lib/worldlensVuetify.ts` from the exact same
`createVuetify()` call, `COMPONENT_DEFAULTS`, and theme scheme objects the shipped product uses -
not a hand-copied approximation of them).

As of this writing, fifteen rows are implemented: the three button variants (filled, outlined,
text), an assist chip, an elevated card, an outlined text field, a selected switch, a selected
checkbox, a selected radio button, a one-line list item, linear and circular progress indicators,
a divider, an icon, and an alert. Seven more are named and tracked as **planned, not built**:
tooltip, select, menu, dialog, slider, button-toggle group, and text area - every one of them
because it needs a transient or teleported overlay (`RowsGallery.vue`'s current machinery only
supports an always-present element), a genuinely different shape/interaction model that was cut
for time, or both. `--list` (see below) prints this repository's own held copy of that manifest,
transcribed by hand from `design/packages/md3-check/src/renderer/lib/rows.ts` and liable to drift
from it - the live discovery this script actually captures with is always the DOM, never that
copy.

**One state per row, not every state.** Each row measures one specific configuration - "Switch,
selected," "Checkbox, selected," an alert with no particular severity chosen for it - not the
unselected, disabled, hover, focus, or error variants of the same component. A clean report for
"Checkbox, selected" says nothing about the checkbox's unselected or disabled rendering.

**The alert row has no spec to cite against.** Material 3 does not define an "Alert" component at
all; `design/packages/md3-check/src/renderer/lib/rows.ts` records this explicitly and its
reference pane is a documented nearest-analogue, not a transcription of anything Google
published. Treat that row's differences as design commentary, not spec deviation.

**Checkbox and radio measure a glyph, not a shape.** Vuetify renders its selection controls as an
SVG icon glyph rather than a CSS-shaped box with its own border-radius, so those two rows' corner-
radius field is not meaningful on the Worldlens side (it reads whatever the icon wrapper itself
declares, not a real shape decision) - `RowsGallery.vue`'s own citation for each row says so.
Height, width, and colour are the fields worth reading there.

**Colour is deliberately not an independent check.** `m3Reference.scss`'s own header explains why:
every reference-pane rule reads `--v-theme-*` custom properties - Worldlens's own resolved role
colours - rather than literal hex values, because Material 3 mandates a *role* a component part
should use (a filled button's container is "primary," whichever hex primary happens to resolve
to), not a specific hex value. Comparing two independently-chosen colour systems would only ever
prove they are different, which nobody needed a harness to discover. A colour-role mismatch this
harness could still catch is a component reading the *wrong role* - `on-primary` instead of
`on-primary-container`, say - not a hue.

**Baseline spec, not "M3 Expressive."** `design/packages/ui/src/styles/md3.scss` names "MD3
Expressive" repeatedly for its motion vocabulary while shipping the pre-Expressive seven-step
shape scale (see that file's own comments, and [The design system](./design-system.md)). The
reference pane cites the *original* baseline Material 3 component specification throughout, not
the 2025 Expressive update. This is a real, unresolved tension this harness does not paper over: a
component that reads "wrong" against the reference might instead be a deliberate Expressive
choice, and a genuine difference should be weighed against that possibility, not assumed to be a
defect.

### How a pair is measured

Every field comes from `getBoundingClientRect()` and `getComputedStyle()` - what the browser
actually painted, never a value re-derived from a source file or a prop. Corner radius is reported
both as declared (`border-radius: 9999px` on a pill reads back as 9999) and as the browser would
actually clamp it at paint time (`min(width, height) / 2`), because the declared value alone would
make every pill of a different size measure identically. Effective background colour walks up the
DOM from the measured element looking for the first non-transparent `background-color`, because a
text button's own background is transparent by design and the container behind it is what a real
reader compares its label against. Contrast is the WCAG 2.x relative-luminance ratio between that
background and the resolved text colour.

**Where the numbers come from.** Preferred, when the app exposes it and returns something usable:
`window.__MD3_CHECK__.measureAll()`, the same code path
`design/packages/md3-check/src/renderer/components/RowShell.vue`'s own on-screen table reads -
"one measuring function, two callers," as that package's own `measure.ts` puts it. **As of this
writing that bridge is not yet reliable** - two real, live failures were found running this
harness against the app while it was still under active construction: `measureAll()` threw
`TypeError: u.getSnapshot is not a function` in one build, and returned present-but-empty
`{ reference: {}, worldlens: {}, diff: {} }` objects in a later one (most likely a Vue-reactivity/
CDP-serialisation gap on the app's own side, not something this script controls). This script
checks for a real numeric field before trusting the bridge's data at all, and falls back per row
to its own hand port of `measure.ts`'s `measureComponent`/`diffMeasurements` when the bridge is
absent, throws, or comes back empty. Every captured row records which source it actually used in
`measurementSource` (`"bridge"` or `"harness-port"`) - see "Reading the report" below. The fallback
is kept in sync **by hand**, because `scripts/` has no TypeScript toolchain to import the real file
directly; if `measure.ts` changes, the port in `scripts/md3-compare.mjs` needs updating too, and
nothing currently checks that they agree beyond a human comparing them.

**The one element that is actually compared** inside each pane matches `[data-measure]` by
default - `RowShell.vue` itself throws during normal use if a pane ever has more than one match,
so this script trusts "the one match" the same way. Three rows (switch, checkbox, radio) override
this: Vuetify wraps their visible shape in a much larger invisible hit-target, so
`RowsGallery.vue` points `worldlens-selector` at `.v-switch__track` or `.v-selection-control__input
.v-icon` instead. This script knows those three exact overrides (transcribed from the real
markup, not guessed) and tries them when a plain `[data-measure]` match is not found; a future row
with an override this script does not know about reports an honest gap
(`worldlensUnmeasuredReason`) rather than a wrong measurement.

### Themes

Discovered from `window.__MD3_CHECK__.listThemes()` when it is present (falling back to `dark`,
`light`, `contrast` - the three theme schemes `design/packages/ui/src/vuetify.ts` ships as part of
the served application; see [The design system](./design-system.md)). If the app's own list
includes `kid` - Kid Mode's presentation layer, not a Material 3 theme with its own conformance
claim - this harness captures it like any other, because deciding which of the app's real,
running themes count is a judgement for whoever reads the report, not something this script
should silently pre-filter.

Theme switching has no confirmed UI path from outside the renderer as of this writing (capture
mode hides the app's own interactive theme picker on purpose, so every captured image shows only
the comparison, never this harness's own chrome). This script tries, in priority order:
`window.__MD3_CHECK__.setTheme(id)` (confirmed real - `App.vue` installs exactly this), then a
couple of other plausible bridge shapes, then falls back to setting `location.hash` to the bare
theme id. Confirmation never depends on any of that working: it watches for Vuetify's own real
`.v-theme--<name>` class, which `<v-theme-provider>` applies automatically and which is confirmed
present throughout this exact codebase's stylesheets independent of anything this script invented.
If a theme is never confirmed, later themes in the request are skipped rather than silently
re-capturing an identical pass under a different label - see "Failure modes."

### The gallery does not scroll, and this script does not try to make it

Confirmed directly against a real build: `document.documentElement.scrollHeight` reports exactly
`window.innerHeight` regardless of how tall the gallery's actual content is, so a row past the
first is genuinely unreachable by scrolling - there is no document-level scroll mechanism to
reach it with, and `scrollIntoView()` is a measured no-op there. This script instead grows the
CDP-emulated viewport itself to the real required height (read from every row's own
`getBoundingClientRect()`, which reports accurate layout geometry regardless of what currently
paints) before capturing each theme pass. Confirmed separately that this resize does not move any
row's position. The first sixty real captures this harness ever took came back as uniform,
zero-variance solid-colour PNGs before this was found and fixed; if that regresses, it is the
single most likely cause to check first.

## Running it

```
node scripts/md3-compare.mjs                              # full run, default paths
node scripts/md3-compare.mjs --list                        # print the fallback row/theme list, no launch
node scripts/md3-compare.mjs --row button-filled --theme dark
node scripts/md3-compare.mjs --out design/packages/md3-check/screenshots --keep-open
node scripts/md3-compare.mjs --strict                      # exit 1 on a skipped theme or zero captures
node scripts/md3-compare.mjs --help                        # every flag, with its default
```

Output defaults to `<app-dir>/screenshots/` - `design/packages/md3-check/screenshots/` -
which is already git-ignored (`design/.gitignore`'s bare `screenshots/` rule, the same one that
keeps the shipped product's own raw captures out of version control; see
`design/packages/app/test/screenshots.spec.ts`). Nothing this script produces is committed by
default. One `<row>--<theme>.png` per captured pair, plus one `report.json` covering the whole
run.

The script builds the app itself when its built renderer is missing (`npm run build` in
`design/packages/md3-check`, with `WORLDLENS_MD3_CHECK_CAPTURE=1` set in the environment first -
that app's own main process comment explains why this has to happen *before* the build, not only
before Electron launches: Vite inlines it into the bundle, so setting it only at launch would
leave the interactive theme/scale/row pickers in the built output and contaminate every capture).
Pass `--skip-build` to use an existing build as-is, or `--force-build` to always rebuild first.

Electron is launched headlessly with `--no-sandbox --disable-gpu --force-prefers-reduced-motion`
and a throwaway `--user-data-dir` - the same flags this repository's own capture harness
(`design/packages/app/test/screenshots.spec.ts`) already uses for the same reasons. This script
does not itself keep the launch off the machine's visible desktop; run it inside a Windows
headless desktop or under `xvfb-run` on Linux (the way this repository's CI already runs the
shipped product's own screenshot job) if that matters for where it runs.

### Reading the report

`report.json`'s shape:

| Field | What it holds |
|---|---|
| `source.appDir`, `source.commit` | Where the app was found, and this repository's commit at the time of the run (best-effort; `null` if `git` was unavailable). |
| `requestedThemes`, `themeOrigin` | The themes actually requested, and whether that list came from `"bridge"` (live discovery), `"cli"` (`--theme` flags), or `"fallback"` (this script's own built-in guess). |
| `themePasses[]` | One entry per requested theme. `confirmed` is whether the `.v-theme--<name>` class was actually seen; `status` is `"captured"` or `"skipped"`, with `reason` set for a skip. |
| `themePasses[].rows[]` | One entry per row captured in that pass: `image` (the PNG filename), `clipSource` (`"panes"` or `"row"` - whether `.md3check-row__panes` was found), `measurementSource` (`"bridge"` or `"harness-port"` - see above), `reference`/`worldlens` (the full measured fact set, or `null` with an `...UnmeasuredReason`), and `diff` (field-by-field, each with `reference`, `worldlens`, `deltaNumeric`, and `differs`). |
| `summary` | Counts: theme passes requested/captured/skipped, rows captured, rows with both sides measured, rows with at least one difference. |

Every `diff` field is `{ reference, worldlens, deltaNumeric, differs }`. Geometry fields (`widthPx`,
`heightPx`, `minVisibleTargetPx`, `cornerRadiusPx`) allow a small tolerance (0.5px) before
`differs` is set, because two independently-built implementations agreeing to the sub-pixel is not
a meaningful bar; every other field (colour, font family, font weight, line height, letter
spacing, contrast ratio) is compared exactly. `differs: true` is a reported fact, never a verdict -
whether a difference is a real defect or a deliberate, documented choice (Worldlens's text fields
are 12px-cornered by design, not the reference's 4px - see
[The design system](./design-system.md)) is a judgement only a reader with the row's own citations
in view can make, exactly the same rule `RowShell.vue`'s own on-screen table states for a human
looking at the app directly.

## Failure modes

| What happens | What this script does |
|---|---|
| `design/packages/md3-check` does not exist yet, or has no `package.json` | Fails immediately with the exact expected path and a pointer to this document's contract. |
| The built renderer (`dist/renderer/index.html`) is missing and there is a `build` script | Builds it automatically (with the capture-mode env var set), unless `--skip-build`. |
| The build fails | The real `npm run build` output is shown in full (piped through, not swallowed), then this script fails with its own wrapping error. |
| The `electron` package cannot be resolved, or its binary was never extracted | `design/scripts/ensure-electron-binary.mjs` is run first to self-heal; if that cannot recover it, the exact resolution paths tried are named. |
| Electron starts but never exposes a CDP port | Fails after `--launch-timeout` (default 45s) naming the exact profile path checked, or reports Electron's own early exit code/signal if it quit first. |
| No `"page"` CDP target ever appears | Fails naming how many targets of what type were found. |
| A theme is never confirmed via its `.v-theme--<name>` class | The first requested theme still captures with whatever is actually live, labelled honestly; every theme *after* the first is skipped (with the reason recorded) rather than silently repeating an identical capture under the wrong label - unless an earlier theme in the same run *did* confirm, in which case only that specific later theme is skipped. |
| A row's list never stops changing within `--settle-timeout` | Captured anyway, with a warning; nothing is silently retried forever. |
| A pane has no `[data-measure]` match and no known selector override | That side's measurement is `null` with a stated `...UnmeasuredReason`, not a fabricated number. |
| `window.__MD3_CHECK__.measureAll()` throws, or returns data with no real numeric field | Caught; every row in that theme pass falls back to this script's own `measure.ts` port, with a warning naming which happened. |
| A row's screenshot region is taller than fits on screen after the per-pass viewport resize | Captured at whatever size resulted; the report's own `rootRect`/measured dimensions still show the true numbers even if the PNG were ever cropped. |
| Ctrl+C, or any thrown error mid-run | The `finally` block still runs: the CDP socket closes, and (unless `--keep-open`) the Electron process tree is force-terminated (`taskkill /T /F` on Windows) and its temporary profile directory removed. |

## Security considerations

The app makes zero network requests by policy, not merely by omission -
`design/packages/md3-check/src/renderer/index.html`'s own Content-Security-Policy sets
`connect-src 'none'`, so a stray `fetch()` a future edit adds would be refused by Chromium itself.
This script adds nothing to that surface: it only spawns a local Electron process, speaks the
Chrome DevTools Protocol to it over a loopback WebSocket, and writes PNGs and JSON to a local,
git-ignored directory.

`--no-sandbox` is passed to the spawned Electron process, matching this repository's own existing
capture harness. This is a throwaway, single-purpose developer instrument launched against a
fresh temporary profile with no user data, no credentials, and no network access of its own; the
same trade-off already accepted for `design/packages/app/test/screenshots.spec.ts` applies here
for the same reason.

No secret, credential, or personal data is ever read, written, or transmitted by this script or
the app it drives.

## Verification

There is no automated test suite for this script as of this writing - it was not requested, and
`scripts/` at the repository root has no test runner wired for it beyond the handful of sibling
scripts that ship their own `node --test` file. What exists instead is a real, repeated,
end-to-end run against a genuine (and, at the time of writing, still actively evolving) build of
`design/packages/md3-check`, at repository commit `90484d6b` with the app package in an
uncommitted, in-progress state:

```
$ node scripts/md3-compare.mjs --settle-timeout 4000 --launch-timeout 40000
...
md3-compare: discovered 4 theme(s) from window.__MD3_CHECK__.listThemes(): dark, light, contrast, kid
md3-compare: requesting theme "dark"...
md3-compare: requesting theme "light"...
md3-compare: requesting theme "contrast"...
md3-compare: requesting theme "kid"...
md3-compare: 4/4 theme pass(es), 60 row capture(s), 60 fully measured, 60 with at least one difference.
md3-compare: report written to .../design/packages/md3-check/screenshots/report.json
```

Every one of the sixty resulting PNGs was independently checked (via `sharp`'s pixel-channel
statistics, outside this script entirely) to have genuine, non-uniform pixel content rather than a
uniform solid colour - the exact failure this document's "gallery does not scroll" section
describes finding and fixing mid-development, where 56 of the first 60 real captures this harness
ever took were blank. A sample of the resulting images was read back and inspected directly: real
Material 3 buttons, chips, cards, and form controls, genuinely distinct between the reference and
Worldlens panes, with plausible measured deltas (a filled button's corner radius reading 20px on
the reference pane and 18px on Worldlens's real `<v-btn>`, for one concrete example actually
captured this way).

Two real defects in the app's own `window.__MD3_CHECK__.measureAll()` bridge were found this same
way, live, rather than assumed: a thrown `TypeError`, and later a present-but-empty response. Both
are handled by this script (see "How a pair is measured" above) rather than only reported, because
an empty object read as "zero differences" would have been the single most dangerous wrong answer
this harness could give - exactly the "flatters the app" failure this whole instrument exists to
refuse.

## What this can, and cannot, prove

**Can prove:** that a specific, real, unmodified Worldlens component - the exact one this
application ships - measures a specific way, next to a specific hand-transcribed reference value,
at a specific commit, with the actual numbers and a photograph to check them against. That the two
sides' shape, size, typography, and contrast for the fifteen captured rows either match within a
stated tolerance or do not, with every difference named rather than summarised into a pass/fail
verdict.

**Cannot prove:** that the reference pane is itself correct against Google's published
specification (nobody has machine-checked it against one; see the banner at the top of this
document). That any of the fifteen captured rows' *other* states - unselected, disabled, hover,
focus, error - conform, only the one state each row happens to capture. That any of the seven
*planned* rows (tooltip, select, menu, dialog, slider, button-toggle, text area) conform to
anything at all - they are not measured because they do not yet exist in the gallery. That colour
is correct in any independent sense - it is deliberately borrowed from Worldlens on both sides, by
design (see "How a pair is measured"). That the application is Material 3 Expressive-conformant
rather than baseline-conformant, or the reverse - the reference pane cites baseline throughout
while this application's own token file invokes Expressive language, and this harness does not
adjudicate which is intended. That anything holds true on a machine with different installed
fonts, a different Chromium build, or a different display scale than the one that produced a given
report - this is a single-machine, single-run measurement, not a cross-environment guarantee.

## Suggested reading

- [The design system](./design-system.md), the token vocabulary this harness is checking
  Worldlens's real rendering against, and the exact shape/elevation/type/state numbers a reader
  needs to judge whether a reported difference is a bug or a documented, intentional choice.
- [BlueMapGUI parity](./bluemapgui-parity.md), this repository's other from-scratch conformance
  audit against an external reference, for the same "state the verdict and the evidence, feature by
  feature" shape applied to a different comparison.
- `design/packages/app/test/screenshots.spec.ts`, the shipped product's own real-build capture
  harness, whose proven Electron launch flags and "record a gap, not a substitute" philosophy this
  script borrows directly.
- `design/packages/site/scripts/compact-proof.mjs`, the other root-level script in this repository
  that drives a real Chromium target over raw CDP for the same reason this one does: nothing under
  `scripts/` has a `node_modules` of its own to hold a Playwright dependency.

## 廣東話

### Material 3 conformance harness（Material 3 一致性驗證工具）

呢個係一件儀器，唔係一件產品：一個淨係得個 Electron app，冇 title bar、冇 navigation、冇任何 product
chrome 嘅細細個 app，將人手抄低嘅 Material Design 3 參考版樣，同呢個 application 自己真正嘅 Vuetify
component 擺埋一齊畫；再加一個 script，headless 噉去揸住呢個 app，逐行影低 side-by-side 相片，同埋量返
每一行嘅真實數值。

**信之前，請先睇呢段。** 個「reference」pane 唔係 Material 3 spec 嘅認證副本，亦都唔係由已安裝嘅
reference implementation 抄嚟 —— 成個 workspace 入面根本冇裝 `@material/web`。佢係人手抄嘅：由一個人
（或者一個 assistant）喺某一個時間點睇住官方公開嘅 spec 打出嚟，呢件事佢自己個檔案標頭同 app 自己畫面上嘅
honesty banner 都講到明。呢個 harness 可以話俾你聽「兩樣嘢用同一套方法量，量出嚟唔一樣（或者一樣）」；
但佢冇辦法認證邊一邊真係符合 Google 個 spec 嘅要求，因為除咗閱讀之外，冇人用過任何其他方法去核對過個
reference pane 同 spec 啱唔啱。每一行冇報差異，都應該理解成「呢個 harness 睇唔出邊度錯」，唔應該理解成
「已經驗證符合規格」。

代碼係 `scripts/md3-compare.mjs`（喺呢個 repository 嘅 root，負責揸住個 app 嘅嗰個檔案），同埋
`design/packages/md3-check/`（一個獨立、自己單獨起嘅 package，呢個 script 淨係會用佢，永遠唔會改佢 ——
個 app 本身、佢啲 row、同佢嘅 reference styling 全部都屬於嗰個 package 自己嘅 commit history）。
`design/packages/md3-check/src/renderer/styles/m3Reference.scss` 就係 reference pane 自己嘅原始碼，
檔案標頭好長，講清楚佢引用緊乜嘢、同埋佢刻意冇引用乜嘢。

### 行為（Behaviour）

#### 比較緊乜嘢

呢個 app 展示緊一個「gallery」：每一個已經整好嘅比較都自成一行，係由 DOM 現場搵出嚟，唔係靠個名去請求
（`[data-md3-row="<id>"]`，同一個 attribute，`design/packages/md3-check/src/renderer/lib/rows.test.ts`
已經有守住，確保 manifest 話已實現嘅每一行都真係有）。每一行有兩個 pane 並排 ——
`.md3check-pane--reference`（人手打嘅 M3 基準，永遠喺視覺上嘅左邊）同
`.md3check-pane--worldlens`（呢個 application 真正、冇改過嘅 `@worldlens/ui` component，經
`design/packages/md3-check/src/renderer/lib/worldlensVuetify.ts` 由嗰一個一模一樣嘅 `createVuetify()`
call、`COMPONENT_DEFAULTS`、同 theme scheme object 引入嚟 —— 唔係人手抄嘅近似版）。

截至寫呢份文件嗰陣，有十五行已經整好：三種 button 變體（filled、outlined、text）、一個 assist chip、
一張 elevated card、一個 outlined text field、一個已揀嘅 switch、一個已揀嘅 checkbox、一個已揀嘅 radio
button、一個 one-line list item、linear 同 circular progress indicator、一條 divider、一個 icon、同一個
alert。仲有七行係「planned，未整」：tooltip、select、menu、dialog、slider、button-toggle group、同
text area —— 全部都係因為需要一個 transient 或者 teleport 出去嘅 overlay（`RowsGallery.vue` 而家嘅機制
淨係支援一個成日都喺度嘅 element）、或者一個真係唔同嘅形狀/互動模式而因為時間關係冇整，或者兩個原因都有。
`--list`（下面有講）印嘅係呢個 repository 自己手抄嗰份 manifest，抄自
`design/packages/md3-check/src/renderer/lib/rows.ts`，有可能同真嘢唔同步 —— 呢個 script 真正用嚟捕獲嘅
現場探索，永遠係 DOM，而唔係嗰份抄本。

**每一行淨係一個 state，唔係全部 state。** 每一行淨係量一個特定嘅設定 ——「Switch，已揀」、「Checkbox，
已揀」、一個冇揀特定嚴重程度嘅 alert —— 唔係同一個 component 嘅未揀、停用、hover、focus 或者 error 版本。
「Checkbox，已揀」呢一行乾淨，唔代表 checkbox 未揀或者停用嗰陣嘅畫法冇問題。

**Alert 呢一行冇 spec 可以引用。** Material 3 根本冇定義過「Alert」呢個 component；
`design/packages/md3-check/src/renderer/lib/rows.ts` 明文噉樣記低，而佢個 reference pane 係一個有記錄嘅
「最接近類比」，唔係抄 Google published 過嘅任何嘢。呢一行嘅差異，應該當係設計評論嚟睇，唔係 spec 偏離。

**Checkbox 同 radio 量緊嘅係個 glyph，唔係個形狀。** Vuetify 將佢啲 selection control 畫成一個 SVG icon
glyph，唔係一個有自己 border-radius 嘅 CSS 形狀，所以呢兩行嘅 corner-radius 欄喺 Worldlens 嗰邊唔係好有
意義（佢讀到嘅係個 icon wrapper 自己宣告嘅嘢，唔係一個真正嘅形狀決定）——
`RowsGallery.vue` 每一行自己嘅 citation 都係噉講。喺呢兩行度，高度、闊度同顏色先係值得睇嘅欄。

**顏色刻意唔係一個獨立嘅檢查。** `m3Reference.scss` 自己個標頭解釋咗點解：每一條 reference-pane 規則
讀嘅都係 `--v-theme-*` 呢啲 custom property —— 即係 Worldlens 自己解出嚟嘅 role 顏色 —— 而唔係字面上嘅
hex 值，因為 Material 3 規定嘅係一個 component 部件應該用邊一個「role」（一個 filled button 個 container
係「primary」，唔理個 hex primary 實際解到乜色），而唔係一個特定嘅 hex 值。攞兩套獨立揀嘅顏色系統嚟比較，
永遠都只會證明佢哋唔同色，冇人需要一個 harness 嚟講呢個顯而易見嘅事實。呢個 harness 仍然可以捉到嘅顏色
問題，係一個 component 用錯咗個 role —— 譬如用咗 `on-primary` 而唔係 `on-primary-container` —— 而唔係
色調本身。

**基準 spec，唔係「M3 Expressive」。** `design/packages/ui/src/styles/md3.scss` 喺 motion 詞彙嗰度不斷
提「MD3 Expressive」，但其實出嘅係 Expressive 之前嗰個七級 shape scale（見嗰個檔案自己嘅 comment，同埋
[The design system](./design-system.md)）。Reference pane 全程引用嘅係*原本*嘅 baseline Material 3
component spec，唔係 2025 年嗰個 Expressive 更新。呢個係一個真實、未解決嘅張力，呢個 harness 冇試過蓋住
佢：一個對住 reference 睇落「錯咗」嘅 component，可能其實係刻意嘅 Expressive 選擇，一個真正嘅差異應該衡量
呢個可能性，而唔係當佢一定係個缺陷。

#### 一對嘢點樣量

每一個欄都係嚟自 `getBoundingClientRect()` 同 `getComputedStyle()` —— 即係瀏覽器實際畫咗乜嘢，永遠唔係
由原始碼或者 prop 重新推導出嚟嘅值。Corner radius 會報兩個數：宣告值（一粒 pill 嘅
`border-radius: 9999px` 讀返嚟就係 9999）同瀏覽器喺畫嗰刻真正會夾嘅值（`min(width, height) / 2`），因為
淨係睇宣告值嘅話，唔同大細嘅 pill 會全部量到一模一樣。有效背景色係由被量嗰個 element 開始沿住 DOM 一路
向上搵，搵第一個唔透明嘅 `background-color`，因為一個 text button 自己個背景本身就係設計成透明，而真正
讀者比較個 label 嘅對象係佢後面嗰個 container。對比度就係背景色同解出嚟嘅文字色之間嘅 WCAG 2.x relative
luminance ratio。

**數值嚟源。** 優先用嘅，係喺個 app 有提供而且返返嚟嘅嘢真係用得嘅情況下：
`window.__MD3_CHECK__.measureAll()`，同
`design/packages/md3-check/src/renderer/components/RowShell.vue` 自己畫面上張表讀嘅係同一條 code
path —— 用嗰個 package 自己 `measure.ts` 嘅講法：「一個量度 function，兩個叫用者」。**截至寫呢份文件
嗰陣，呢條 bridge 仲未夠穩陣**：喺個 app 仍然主動開發緊嗰陣，行呢個 harness 就真真正正搵到兩個 live 嘅
問題：`measureAll()` 喺一個 build 度掟咗個
`TypeError: u.getSnapshot is not a function`，跟住喺遲啲一個 build 度就返返嚟一個存在但係全空嘅
`{ reference: {}, worldlens: {}, diff: {} }`（最有可能係 app 自己嗰邊嘅 Vue-reactivity/CDP
returnByValue 序列化缺口，唔係呢個 script 控制得到嘅嘢）。呢個 script 會先檢查有冇一個真正嘅數字欄位，
先至會信 bridge 嘅資料；如果 bridge 唔存在、掟錯、或者返空嘢，就逐行 fallback 去用自己手抄嘅
`measure.ts` 版 `measureComponent`/`diffMeasurements`。每一行擷取到嘅資料都會記低實際用咗邊個嚟源，
喺 `measurementSource`（`"bridge"` 或者 `"harness-port"`）——見下面「點樣讀個 report」。呢個 fallback 係
**人手**同步嘅，因為 `scripts/` 冇 TypeScript 工具鏈可以直接 import 個真檔案；如果 `measure.ts` 改咗，
`scripts/md3-compare.mjs` 入面嗰個 port 都要跟住改，而而家除咗有人手動逐句對比之外，冇任何嘢會守住兩邊
一致。

**每個 pane 入面真正被比較嗰個 element**，預設係啱 `[data-measure]` 嗰個 ——
`RowShell.vue` 自己喺正常使用嘅時候，如果一個 pane 有多過一個匹配就會直接掟錯，所以呢個 script 都同樣
信「就係嗰一個匹配」。有三行（switch、checkbox、radio）覆寫咗呢個規則：Vuetify 將佢哋睇得見嘅形狀包咗喺
一個大好多、睇唔見嘅 hit-target 入面，所以 `RowsGallery.vue` 將 `worldlens-selector` 指去
`.v-switch__track` 或者 `.v-selection-control__input .v-icon`。呢個 script 知道呢三個確實嘅覆寫（係抄
自真實 markup，唔係估嘅），喺一個普通嘅 `[data-measure]` 匹配唔到嘅時候就會試呢啲。將來有第四行用咗呢個
script 唔知嘅覆寫，佢會誠實噉報一個缺口（`worldlensUnmeasuredReason`），而唔係報一個錯嘅量度值。

#### Theme

有 `window.__MD3_CHECK__.listThemes()` 嗰陣就由佢探索出嚟（冇嘅話就 fallback 去
`dark`、`light`、`contrast` —— 呢三個係 `design/packages/ui/src/vuetify.ts` 隨被served application
一齊出嘅 theme scheme；見 [The design system](./design-system.md)）。如果 app 自己個列表入面有
`kid` —— Kid Mode 個表現層，唔係一個有自己 Material 3 一致性主張嘅 theme —— 呢個 harness 都會照樣捕獲
佢，因為決定 app 現正運行緊嗰啲 theme 邊個算數，係讀 report 嗰個人自己嘅判斷，唔應該由呢個 script 靜靜雞
幫佢揀走。

截至寫呢份文件嗰陣，theme 切換仲未有一條由 renderer 外面確認過嘅 UI 路徑（capture mode 刻意隱藏咗 app
自己嗰個互動式 theme picker，噉樣捕獲到嘅每張相先至淨係顯示緊比較本身，永遠唔會有呢個 harness 自己嘅
chrome）。呢個 script 會按優先次序試：`window.__MD3_CHECK__.setTheme(id)`（已經確認係真嘅 ——
`App.vue` 真係裝咗呢個方法），然後幾個其他有可能嘅 bridge 形態，最後 fallback 去將 `location.hash` 設做
純粹嘅 theme id。確認方式完全唔靠以上任何一樣真係得，佢係睇緊 Vuetify 自己真正嘅
`.v-theme--<name>` class，呢個 class 係 `<v-theme-provider>` 自動加落去嘅，而且已經喺呢個確實嘅
codebase 全套 stylesheet 入面確認存在，同呢個 script 自己發明嘅嘢完全冇關係。如果一個 theme 從來冇被
確認過，request 入面之後嘅 theme 就會被跳過，而唔係靜靜雞用另一個標籤重複捕獲同一個畫面 —— 見「失敗
模式」。

#### 個 gallery 唔捲得，呢個 script 都冇試過去逼佢捲

直接對住一個真 build 確認過：`document.documentElement.scrollHeight`
不論個 gallery 實際內容有幾高，都準確噉報返同 `window.innerHeight` 一模一樣，所以第一行之後嘅任何一行都
真係捲唔到 —— 根本冇一個 document-level 嘅捲動機制可以攞嚟用，而 `scrollIntoView()` 喺嗰度實測係完全
冇作用嘅。呢個 script 改為喺每個 theme pass 捕獲之前，將 CDP 模擬嘅 viewport 本身撐到真正需要嘅高度
（由每一行自己嘅 `getBoundingClientRect()` 讀返嚟 —— 呢個無論而家畫緊乜都會準確噉報返真正嘅 layout
幾何）。另外都分開確認咗，呢個 resize 唔會郁到任何一行嘅位置。呢個 harness 第一次做嘅六十張真實捕獲入面，
喺呢件事被搵到同修好之前，返返嚟嘅係一色一樣、零變化嘅 solid-colour PNG；如果將來又出返同一個現象，呢個
係第一個應該去查嘅可疑對象。

### 點樣行（Running it）

```
node scripts/md3-compare.mjs                              # 完整跑一次，用預設路徑
node scripts/md3-compare.mjs --list                        # 印出 fallback 嘅 row/theme 列表，唔會開 app
node scripts/md3-compare.mjs --row button-filled --theme dark
node scripts/md3-compare.mjs --out design/packages/md3-check/screenshots --keep-open
node scripts/md3-compare.mjs --strict                      # 有 theme 被跳過或者一張都冇捕獲到就 exit 1
node scripts/md3-compare.mjs --help                        # 每一個 flag，連埋佢嘅預設值
```

輸出預設去 `<app-dir>/screenshots/`，即係 `design/packages/md3-check/screenshots/` ——
呢個已經被 `design/.gitignore` 嗰條冇加路徑嘅 `screenshots/` 規則擋住咗（同一條規則都擋住咗被 served
產品自己嘅原始捕獲；見 `design/packages/app/test/screenshots.spec.ts`）。呢個 script 出嘅任何嘢，預設都
唔會被 commit。每一對成功捕獲嘅嘢有一張 `<row>--<theme>.png`，加埋一份涵蓋成次執行嘅 `report.json`。

如果個 built renderer 唔喺度，呢個 script 會自己 build（喺 `design/packages/md3-check` 度行
`npm run build`，事先喺環境入面設咗 `WORLDLENS_MD3_CHECK_CAPTURE=1` —— 個 app 自己 main process 嘅
comment 解釋咗點解呢個一定要喺 build *之前*設好，唔係淨係喺 Electron 啟動之前：Vite 會將佢喺 build
嗰陣就一併打入個 bundle，如果淨係喺啟動嗰陣先至設，個互動式 theme/scale/row picker 就會留咗喺 built
output 度，污染晒每一張捕獲）。用 `--skip-build` 可以照用現成嘅 build，`--force-build`
就會逼佢每次都重新 build。

Electron 係用 `--no-sandbox --disable-gpu --force-prefers-reduced-motion` 加一個即棄嘅
`--user-data-dir` headless 噉開嘅 —— 同呢個 repository 自己嗰個捕獲 harness
（`design/packages/app/test/screenshots.spec.ts`）出於同一啲理由用緊嘅一樣。呢個 script 自己唔會將
啟動過程擋喺部機嘅可見桌面之外；如果呢件事對你有影響，就喺 Windows 嘅 headless desktop 入面行，或者
喺 Linux 度用 `xvfb-run`（同呢個 repository 個 CI 而家行被 served 產品自己嘅 screenshot job 果套一樣）。

#### 點樣讀個 report

`report.json` 嘅形狀：

| 欄位 | 記緊乜嘢 |
|---|---|
| `source.appDir`、`source.commit` | 個 app 喺邊度搵到，同呢個 repository 執行嗰陣嘅 commit（盡力而為；如果 `git` 用唔到就係 `null`）。 |
| `requestedThemes`、`themeOrigin` | 實際請求咗嘅 theme，同埋呢份列表嚟自邊度：`"bridge"`（現場探索）、`"cli"`（`--theme` flag）、定係 `"fallback"`（呢個 script 自己內建嘅估計）。 |
| `themePasses[]` | 每個請求咗嘅 theme 一項。`confirmed` 係咪真係見過 `.v-theme--<name>` 個 class；`status` 係 `"captured"` 或者 `"skipped"`，skip 嗰陣有 `reason`。 |
| `themePasses[].rows[]` | 嗰個 pass 入面捕獲到嘅每一行一項：`image`（PNG 檔名）、`clipSource`（`"panes"` 或者 `"row"` —— 有冇搵到 `.md3check-row__panes`）、`measurementSource`（`"bridge"` 或者 `"harness-port"` —— 見上面）、`reference`/`worldlens`（完整量度出嚟嘅事實，或者 `null` 加一個 `...UnmeasuredReason`）、同 `diff`（逐個欄位比較，每個都有 `reference`、`worldlens`、`deltaNumeric`、`differs`）。 |
| `summary` | 各種計數：請求/捕獲/跳過嘅 theme pass 數量、捕獲到嘅 row 數量、兩邊都量到嘅 row 數量、至少有一個差異嘅 row 數量。 |

每一個 `diff` 欄位都係 `{ reference, worldlens, deltaNumeric, differs }`。幾何欄位
（`widthPx`、`heightPx`、`minVisibleTargetPx`、`cornerRadiusPx`）容許少少誤差先至會標 `differs`
（0.5px），因為兩個各自獨立砌出嚟嘅 implementation 準確到 sub-pixel 一致並唔係一個有意義嘅門檻；其他
所有欄位（顏色、字型、字重、行高、字距、對比度）都係精確比較。`differs: true`
係一個記錄咗嘅事實，永遠唔係一個判決 —— 一個差異究竟係真正嘅缺陷，定係一個有記錄、刻意嘅選擇（Worldlens
嘅 text field 設計成 12px 圓角，唔係 reference 嗰 4px —— 見 [The design system](./design-system.md)），
只有一個睇住嗰一行自己 citation 嘅讀者先判斷得到 —— 呢個同 `RowShell.vue` 自己畫面上張表對住睇個 app
嘅人講嘅一模一樣。

### 失敗模式（Failure modes）

| 發生咗乜嘢 | 呢個 script 點做 |
|---|---|
| `design/packages/md3-check` 仲未存在，或者冇 `package.json` | 即刻報錯，講清楚預期路徑，同指去呢份文件嘅 contract。 |
| Built renderer（`dist/renderer/index.html`）唔喺度，而且有 `build` script | 自動 build（有設好 capture-mode 環境變數），除非有 `--skip-build`。 |
| Build 失敗 | 真正嘅 `npm run build` output 會全部顯示出嚟（直接傳送出去，唔會吞咗佢），跟住呢個 script 先至報自己嗰個包裝錯誤。 |
| `electron` 呢個 package resolve 唔到，或者佢個 binary 從來冇被解壓過 | 會先行 `design/scripts/ensure-electron-binary.mjs` 自我修復；如果都救唔返，會講清楚試過邊啲 resolution path。 |
| Electron 開咗，但從來冇曝露過 CDP port | 過咗 `--launch-timeout`（預設 45 秒）就報失敗，講清楚查過邊個 profile 路徑，或者如果 Electron 自己先死咗，就報返佢自己嘅 exit code/signal。 |
| 冇任何 `"page"` CDP target 出現過 | 報失敗，講清楚搵到幾多個乜嘢類型嘅 target。 |
| 一個 theme 從來冇經 `.v-theme--<name>` class 確認過 | 第一個請求嘅 theme 仍然會照樣捕獲、老實噉標低實際係咩狀態；第一個之後嘅每一個 theme 都會被跳過（連原因記低），而唔係靜靜雞用錯嘅標籤重複捕獲一次一樣嘅嘢 —— 除非同一次執行入面較早嗰個 theme 曾經真正確認過，噉就淨係跳過嗰一個之後未能確認嘅 theme。 |
| 一行嘅列表喺 `--settle-timeout` 之內從來冇停過變 | 都照樣捕獲，加個警告；唔會靜靜雞永遠重試落去。 |
| 一個 pane 冇 `[data-measure]` 匹配，亦冇已知嘅覆寫 selector | 嗰一邊嘅量度值係 `null`，加一句講明嘅 `...UnmeasuredReason`，唔會作一個假數出嚟。 |
| `window.__MD3_CHECK__.measureAll()` 掟錯，或者返返嚟嘅嘢冇一個真正嘅數字欄位 | 捉住咗；嗰個 theme pass 入面每一行都 fallback 去呢個 script 自己嗰個 `measure.ts` port，加個警告講清楚發生咗邊種情況。 |
| 一行嘅 screenshot 範圍，喺呢個 pass 嘅 viewport resize 之後仍然容唔落 | 照樣用最後量到嘅大細捕獲；report 入面嘅 `rootRect`/量度出嚟嘅尺寸，就算 PNG 真係被裁走咗，都仍然顯示緊真正嘅數字。 |
| Ctrl+C，或者執行過程中掟出任何錯誤 | `finally` 區塊照樣會行：CDP socket 會關閉，而（除非有 `--keep-open`）Electron 個 process tree 會被強制終止（Windows 用 `taskkill /T /F`），佢嘅臨時 profile 目錄都會被刪走。 |

### 安全考量（Security considerations）

呢個 app 政策上完全唔會發任何網絡請求，唔淨係碰巧冇發 ——
`design/packages/md3-check/src/renderer/index.html` 自己嗰條 Content-Security-Policy 設咗
`connect-src 'none'`，所以將來就算有人手多加一句意外嘅 `fetch()`，都會直接俾 Chromium 本身拒絕。呢個
script 冇喺呢個表面加多任何嘢：佢淨係開一個本機 Electron process，經一條 loopback WebSocket 同佢講
Chrome DevTools Protocol，將 PNG 同 JSON 寫落一個本機、已被 git 忽略嘅目錄。

派俾被 spawn 嗰個 Electron process 嘅 flag 入面有 `--no-sandbox`，同呢個 repository 現有嗰個捕獲
harness 一致。呢個係一個即棄、單一用途嘅開發者工具，用一個全新嘅臨時 profile 開，冇任何用戶資料、冇任何
憑證、亦都冇佢自己嘅網絡存取；`design/packages/app/test/screenshots.spec.ts` 已經接受咗嘅同一個取捨，
喺呢度出於同一個理由都適用。

呢個 script，同佢揸住嘅個 app，都從來唔會讀取、寫入、或者傳送任何機密、憑證、或者個人資料。

### 驗證（Verification）

截至寫呢份文件嗰陣，呢個 script 仲未有自動化測試套件 —— 冇人要求過，而 repository root 嗰個
`scripts/` 除咗少數自己帶咗 `node --test` 檔案嘅 sibling script 之外，都冇裝任何 test runner 去跑佢。
取而代之嘅係一次又一次真實、由頭到尾嘅執行，對住一個真正（而且喺寫呢份文件嗰陣，仍然主動進化緊）嘅
`design/packages/md3-check` build，喺 repository commit `90484d6b`、app package 仲喺一個未 commit、
進行緊嘅狀態：

```
$ node scripts/md3-compare.mjs --settle-timeout 4000 --launch-timeout 40000
...
md3-compare: discovered 4 theme(s) from window.__MD3_CHECK__.listThemes(): dark, light, contrast, kid
md3-compare: requesting theme "dark"...
md3-compare: requesting theme "light"...
md3-compare: requesting theme "contrast"...
md3-compare: requesting theme "kid"...
md3-compare: 4/4 theme pass(es), 60 row capture(s), 60 fully measured, 60 with at least one difference.
md3-compare: report written to .../design/packages/md3-check/screenshots/report.json
```

六十張出嚟嘅 PNG 每一張都獨立檢查過（用 `sharp` 嘅 pixel-channel 統計，喺呢個 script 完全之外）確認真係
有唔一樣、非均一嘅 pixel 內容，而唔係一色一樣嘅實心色 —— 呢個正正就係呢份文件「個 gallery 唔捲得」嗰段
講過、喺開發中途搵到同修好嗰個問題，當時六十張入面有五十六張係空白嘅。仲抽咗一部分出嚟嘅圖直接讀返出嚟
睇過：真正嘅 Material 3 button、chip、card、同表單控制項，reference 同 Worldlens 兩個 pane 之間真係
有分別，仲有合理嘅量度差異（舉一個實際真係捕獲到嘅具體例子：一個 filled button 個 corner radius，喺
reference pane 讀到 20px，喺 Worldlens 真正嘅 `<v-btn>` 度讀到 18px）。

同樣係用呢個方法 —— 現場實測，唔係靠估 —— 搵到咗個 app 自己 `window.__MD3_CHECK__.measureAll()`
bridge 兩個真實嘅缺陷：一個係掟出嘅 `TypeError`，跟住有一個係存在但係全空嘅 response。呢兩樣呢個
script 都有處理（唔淨係報告），因為一個全空嘅 object 如果被讀成「零差異」，會係呢個 harness 有可能俾出
最危險嘅一個錯誤答案 —— 正正就係「哄住個 app」呢種失敗，係成件儀器由頭到尾存在嘅原因，就係要拒絕呢種
失敗。

### 呢個 harness 證明得到乜嘢，同證明唔到乜嘢

**證明得到：** 一個具體、真實、冇改過嘅 Worldlens component —— 即係呢個 application 實際出貨嗰個 ——
喺一個具體嘅 commit 度，同一個具體、人手抄嘅 reference 值相比，量度出嚟係點樣，有真實數字，亦有相片可以
核對。針對已捕獲嘅十五行，兩邊嘅形狀、大細、字體、同對比度，係咪喺一個講明咗嘅誤差範圍之內脗合，每一個
差異都會被指名道姓報出嚟，而唔係總結成一個簡單嘅過/唔過判決。

**證明唔到：** Reference pane 本身係咪真係符合 Google 公開發表嘅 spec（冇人用機器核對過佢對唔對得住個
spec；見呢份文件最頂嗰個 banner）。十五行已捕獲嘅 row 入面，*其他*嘅 state ——未揀、停用、hover、
focus、error —— 係咪都符合，呢個只證明咗每一行捕獲緊嗰一個 state。七行 *planned*
嘅 row（tooltip、select、menu、dialog、slider、button-toggle、text area）係咪符合任何嘢 ——
根本冇量度過，因為佢哋喺個 gallery 入面根本仲未存在。顏色喺任何獨立意義上係咪啱 —— 佢係刻意設計成兩邊
都借用 Worldlens 自己嗰套（見「一對嘢點樣量」）。呢個 application 係符合 Material 3 Expressive，定係
符合 baseline —— reference pane 全程引用嘅係 baseline，而呢個 application 自己嘅 token 檔就成日提
Expressive 呢個字眼，呢個 harness 冇裁決邊個先係原意。任何嘢喺一部裝住唔同字型、唔同 Chromium build、
或者唔同 display scale 嘅機器上係咪一樣成立 —— 呢個係單一機器、單一次執行嘅量度，唔係一個跨環境嘅保證。

### 建議閱讀（Suggested reading）

- [The design system](./design-system.md)，呢個 harness 用嚟對照 Worldlens 真實畫面嘅 token
  詞彙表，同埋一個讀者要判斷一個報告出嚟嘅差異係唔係缺陷、定係一個有記錄嘅刻意選擇時，需要用到嗰啲確實
  嘅 shape/elevation/type/state 數字。
- [BlueMapGUI parity](./bluemapgui-parity.md)，呢個 repository 另一個由零開始、對住外部 reference
  做嘅一致性審查，同樣係「逐個功能講清楚判決同證據」呢種形狀，用喺一個唔同嘅比較上面。
- `design/packages/app/test/screenshots.spec.ts`，被 served 產品自己真 build 嘅捕獲 harness，呢個
  script 直接借用咗佢已經驗證過嘅 Electron 啟動 flag，同埋「記低一個缺口，而唔係用嘢頂替」呢個哲學。
- `design/packages/site/scripts/compact-proof.mjs`，呢個 repository 另一個喺 root 層直接經 raw CDP
  揸住真實 Chromium target 嘅 script，同呢個 script 出於一模一樣嘅理由：`scripts/` 底下冇任何嘢有自己嘅
  `node_modules` 可以擺低一個 Playwright dependency。
