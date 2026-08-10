# The Minecraft licence, and the consent that refers to it

BlueMap textures a map from the real Minecraft client file, so nothing renders on this computer
until the person running the app has accepted Mojang's EULA. The app has always recorded that
answer. What it did not do until now was **show the document the answer is about**: the consent
step quoted four lines of BlueMap's own summary and offered a link that opened a browser, and a
person who reached the question from the render wizard was told the render had stopped, sent to
Settings, and left to scroll.

This document covers what the app does now: the licence step at first run, the in-app viewer that
fetches and categorises Mojang's document, and the placement mechanism the viewer shares with every
other docked panel.

## Contents

- [The licence at first run](#the-licence-at-first-run)
- [A real render, from the wizard's consent gate to a finished map](#a-real-render-from-the-wizards-consent-gate-to-a-finished-map)
- [Fetching and caching the document](#fetching-and-caching-the-document)
- [The tabbed viewer](#the-tabbed-viewer)
- [Categorisation is navigation, never editing](#categorisation-is-navigation-never-editing)
- [Search, export and copy](#search-export-and-copy)
- [Appearance](#appearance)
- [Where a docked panel sits](#where-a-docked-panel-sits)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Related reading](#related-reading)

## The licence at first run

First-run setup is four steps: **Welcome**, **The licence**, **Minecraft files** (the question),
and **Map storage**. The licence has its own step and its own progress number, and it comes before
the question, because a document offered after the buttons is a document nobody opens and one
offered as a link beside them is one people click past.

Nothing on the licence step answers anything. Its only forward control is `Next`, and the step says
in as many words that reading it agrees to nothing.

The consent step itself is unchanged in the ways that matter:

- **Accepting is never pre-selected.** There is no checkbox, no radio button and no switch anywhere
  on it; the only way to accept is to press `Accept`.
- **`Accept` and `Decline` are the same button rendered twice** — same variant, same size, same
  row, neither one the dialog's default and neither one focused first.
- **Declining is a real answer** and is remembered. Remote BlueMap servers keep working exactly as
  they did; only local rendering is switched off, and the step says so before the buttons.
- The verbatim BlueMap quotation is still on screen above the buttons that act on it.

The existing settings row still works and is still where a failed render points. It gains a
collapsed **Read the licence in the app** disclosure that expands the same viewer in place, so
somebody about to press `Accept` months later can read what they are accepting without leaving the
settings surface.

The viewer also exists as a standalone docked panel (`EulaSurface.vue`), mounted once by the shell,
for reading the document outside either of those flows. Its two routes are the licence card on the
Home screen and the command palette's own row (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>, then
"licence"), which is what keeps it reachable from any screen; it deliberately has no permanent
button of its own in the application rail, whose footer holds only search, notifications and
settings. (This used to say the shell's floating corner stack, which held Settings and the options
editor. That stack no longer exists: the Material Design 3 rewrite deleted it rather than moving
it, and its destinations went into the rail's footer.)

## A real render, from the wizard's consent gate to a finished map

The paragraph above is not a description of intended behaviour; it is what the following six
images show happening, in one real run of the packaged Electron app driven headless on an
off-screen desktop through Playwright's Electron driver — the same mechanism the rest of this
project's screenshot sweep uses — against commit `56b12939f844f713f52dbde397324fc10c3c073a`. A
world was typed into the make-a-map wizard and validated; the wizard's review step showed the
exact download-has-not-been-accepted warning described above; consent was given through the
Settings row this document describes, not through any shortcut; and BlueMap's own Java engine
then downloaded the Minecraft client file from Mojang and rendered the world into tiles that
opened in the viewer. Nothing here is staged, mocked or hand-edited.

That commit is older than the Material Design 3 rewrite and older than the rename, and the six
images say so plainly once you look at them: the window is titled **Material BlueMap**, a strip of
eight tabs runs across the top where the application rail now goes, and three floating buttons
stack in the bottom left corner where nothing floats any more. They are kept because what they are
evidence for is the consent gate and a real Java render, and neither of those changed - but they
are a record of a run that happened, not a picture of today's shell, and a reader deserves to be
told which before they start matching them against the application in front of them.

![A pre-rewrite build, titled Material BlueMap: the make-a-map wizard's World step, with a real Minecraft world folder typed in, validated, and reporting one dimension and one region file](screenshots/render-1-wizard-world.png)

![A pre-rewrite build: the wizard's Review step before consent, showing the same download-has-not-been-accepted warning and "Open the setting" link described above](screenshots/render-2-review.png)

![A pre-rewrite build: the Mojang download consent settings row, reached from that warning, with consent just accepted](screenshots/render-3-consent.png)

![A pre-rewrite build: the render starting, with BlueMap's own Java engine (5.22-27, on this run's Java 25.0.3) beginning against the world from the step above](screenshots/render-4-start.png)

![A pre-rewrite build: the render panel with the render under way. It is headed Rendering and tagged with the world (test-world-seed-1) and the engine (BlueMap engine (Java) 5.22-27 on Java 25.0.3), reports Starting the engine at 0 of 1 maps done, carries a Stop the render button that says stopping keeps every tile already drawn, offers to show the two console lines so far, and notes underneath that the answers given are now a project at the root of that world so the render can be repeated without setting anything up again](screenshots/render-5-running.png)

![A pre-rewrite build: the viewer, opened directly from the render panel's "Open the map" button. Almost the whole frame is the empty background beyond the rendered area, with the finished tiles a small patch at the centre - the world this run rendered is a tiny test world, and the camera opens zoomed out from it](screenshots/render-6-map.png)

## Fetching and caching the document

The main process fetches `MOJANG_EULA_URL` — the constant `main/consent.ts` already stores in every
consent record and refuses a stored answer that does not match. There is deliberately no second
copy of that address anywhere in this feature.

The page arrives as HTML. `main/eula/text.ts` extracts the readable text: it drops `script`,
`style`, `noscript`, `template`, `svg` and `head`, turns block-level tags into line breaks, strips
what is left, decodes the entities a legal document actually contains, and normalises whitespace so
that two fetches of an unchanged page produce byte-identical text.

Extraction is then **checked rather than trusted**. `looksLikeTheEula` refuses a result shorter than
1500 characters, and refuses one that does not mention Minecraft, Mojang and the reader. A page that
fails those checks is not cached and is not shown; the app reports the refusal instead. The failure
mode this prevents is the quiet one: a redirect to a notice page, extracted successfully, rendered
in a viewer, read as a licence.

A successful fetch is written to `mojang-eula.json` in the app's data directory, atomically (staging
file, then rename), with the text, the document URL, the fetch time and the character count. A
cached copy younger than seven days is served without a network request. The viewer's
**Fetch it again** control ignores the age entirely.

The cache is validated on the way back in and discarded rather than repaired: a wrong schema
version, a different document URL, an unparseable timestamp, or a character count that disagrees
with the text all mean "no cache". Discarding costs one request; repairing would cost showing
somebody a licence assembled out of a half-valid file.

## The tabbed viewer

The viewer shows the document as a browser-style tab strip, using this project's own tab system
(`components/tabs/`), so it has the overflow surface, reordering, pinning, grouping, the four tab
searches and the bulk closes without a second implementation of any of them.

It does **not** share the application's tab storage. `tabStorage.ts` writes one fixed key and reads
`strips[0]` back, so persisting through it would replace the user's real tab layout with a licence.
`components/eula/eulaStorage.ts` is the same shape of module under its own key, plus one thing the
app's strip does not need: **reconciliation**. If Mojang revises the document the sections change,
so a stored arrangement keeps every tab whose section survived — in the order, pinning and grouping
the user gave it — drops the ones whose section is gone, and appends the new ones at the end. A
stored layout with nothing left in common with the document is discarded and the defaults are
seeded.

Every panel states its own position in Mojang's order (`Section 3 of 9`), so reordering or pinning
tabs never leaves a reader unsure where in the document they are.

The header above the strip always says which of three things is on screen:

| State | What the header says |
|---|---|
| `live` | This is Mojang's document, fetched from Mojang, at *this* time. |
| `cache` | This is a copy the application fetched earlier and kept, at *this* time. It may not be the current wording. |
| `fallback` | This is **not** Mojang's document. It could not be fetched, so the wording BlueMap itself quotes is shown instead. |

A failure that leaves a cached copy showing says both things at once: here is the copy, from this
date, and here is why it is not newer. A stale or substituted copy is never labelled live.

## Categorisation is navigation, never editing

The tabs sort the document into `Overview`, `What you may do`, `What you may not do`, `Ownership`,
`Updates and changes`, `Termination`, `Warranties and liability` and `Other terms`.

Categorising a legal document is allowed to be *wrong* — a clause under the wrong tab costs a click.
It is never allowed to be *editing*, and every plausible implementation of it edits: by summarising,
by reordering paragraphs so a category reads coherently, by dropping a sentence that fits two
categories, or by rendering a translated heading instead of the heading.

So `components/eula/eulaSections.ts` never handles text. It handles **offsets**. A section is a
half-open range `[start, end)` into the source string; the ranges are contiguous, produced in
ascending order, and cover the document from index 0 to `text.length`. That makes the guarantee
structural rather than a promise:

- nothing can be omitted, because every index belongs to exactly one range;
- nothing can be reordered, because the ranges are produced and rendered in ascending order;
- nothing can be reworded, because no text is ever copied or transformed.

`sectionsCoverText` states it as a checkable condition, and the test asserts the concatenated
section text is byte-identical to the source across five differently shaped documents. The only
interpretation applied anywhere is "a blank line ends a paragraph", and the test checks that the
words of a rendered section equal the words of its range.

The viewer says all of this on screen, in the EXACT string catalogue so no funny level can restyle
it: the categories are this application's navigation over Mojang's document, and if the app's copy
and Mojang's published document ever differ, Mojang's document is the one that counts.

The quoted text is never translated. In Cantonese and bilingual modes the surrounding copy is
Cantonese and the document stays in its own language, exactly as the consent quotation always has.

## Search, export and copy

The search bar is the shared `ConfigSearchField`, so it carries the anchored regex builder like
every other search surface in the app. Plain text is the default and regex is an explicit opt-in.

Two rules are specific to a legal document:

- **The search hides nothing.** It marks which sections contain a hit and says how many, and every
  section stays in the strip. A licence with three of its nine sections filtered out of the
  navigation is a licence somebody could reasonably believe they had finished reading.
- **Highlighting cannot change a word.** The search returns *runs* of plain text — `{ text, hit }`
  pairs whose text fields concatenate back to exactly the paragraph — and the component wraps a
  `<mark>` around the ones that matched. Nothing is ever handed to `v-html`. Zero-width matches are
  dropped rather than rendered as an invisible mark in every gap.

Export offers the current section or the whole document, as Markdown or plain text, plus copy to
the clipboard. Every export opens with a header naming the document address, whether this is the
live document or a cached copy or BlueMap's wording, when it was fetched, and **which section this
file holds out of how many**. The body is the range's own characters; `Markdown` means a header and
then the text, not clauses reformatted into headings and bullets.

## Appearance

The viewer, its tab strip and each section panel are per-element appearance targets. Right-click for
**Edit appearance…**, <kbd>Shift</kbd>+<kbd>F10</kbd> for the same menu from the keyboard, or
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F10</kbd> straight to the editor — with the full Word-depth
typography controls and the infinite colour picker and its translator. Reading a licence at 24 point
in high contrast is an accessibility need, not a novelty. Match highlighting uses a theme-aware
colour rather than the browser's yellow, which fails contrast on a dark surface.

## Where a docked panel sits

The settings surface was a right-hand drawer because somebody had to pick one. That is fine on a
wide display and wrong for anyone whose map is on the right. Its presentation is now a persisted
choice, and the mechanism is a wrapper (`components/settings/DockedSurface.vue`) rather than
something bolted onto that one surface.

Five placements: **floating**, or docked **left**, **right**, **top** or **bottom**. Each surface
remembers its own — the settings sheet defaults to the right, the licence viewer to the bottom,
because a legal document reads better in wide short lines.

The choice is reachable from the panel's own title bar (a chooser button, a menu of five
`menuitemradio` rows, and both resets) and from the **Where the panels sit** section in Settings,
which lists every panel that is open, offers the same five choices as a radio group, and carries the
global reset. The global reset clears the *stored* record rather than only the open panels, because
the panel you cannot see is exactly the one you want reset. The panels' names and the five placement
labels are in the settings search, so typing "docked to the bottom" finds the row.

### Never covering the control that opened it

A panel that covers its own opener is the specific failure this has to avoid: the button is still
there, still focusable, still announced, and completely invisible, so pressing it again to close the
panel presses the panel. `resolveDockLayout` takes the opener's rectangle and:

- **shrinks a docked panel along its docking axis** so its edge stops short of the opener. A right
  dock beside a button 300px from the right edge is 300px wide, not 520px overlapping;
- **falls back to floating** when even the 240px minimum would not clear it, keeps the user's choice
  so the panel returns to that edge when the window can hold it, and says so on screen rather than
  quietly appearing somewhere else;
- **picks a floating corner that does not intersect the opener at all**, deterministically, so the
  panel lands in the same place every time for the same window.

The opener is the element the host passes, or — when it passes none — whatever had focus at the
moment the panel opened. Focus returns to it on close.

Every placement is keyboard-operable with visible focus, the panel is `role="dialog"` **without**
`aria-modal` (it is genuinely non-modal: no scrim, the application behind stays usable, Escape
closes), and every placement is capped at the viewport so a 520px panel becomes the whole edge at
800×600 and at 200% display scale rather than overflowing it.

## Configuration

| Thing | Where it lives | Default |
|---|---|---|
| Cached document | `mojang-eula.json` in the app's data directory | absent until first fetch |
| Cache maximum age | `CACHE_MAX_AGE_MS` in `main/eula/document.ts` | 7 days |
| Fetch timeout | `FETCH_TIMEOUT_MS` | 15 seconds |
| Response cap | `MAX_RESPONSE_BYTES` | 2,000,000 bytes |
| Viewer tab layout | `worldlens-eula-tabs` in local storage | one tab per section |
| Panel placements | `worldlens-dock-placement` in local storage | per-surface default |

The document address is not configurable. It comes from `MOJANG_EULA_URL` in `main/consent.ts`, so
the document a person reads and the document their recorded acceptance names cannot drift apart.

## Failure modes

| What happens | What the app does |
|---|---|
| No network, DNS failure, timeout | Reports the reason. Shows the cached copy if there is one, labelled with its own fetch date; otherwise BlueMap's wording, labelled as BlueMap's. |
| Non-200 answer | Same, naming the status code. |
| The page is not the licence | Refused, not cached, reason shown. |
| Response larger than the cap | Refused while reading, before the memory is spent. |
| Cache file corrupt, hand-edited or from a future build | Discarded; the app fetches again. |
| Data directory read-only | The fetched document is still shown; only the write is skipped, so the next launch fetches again. |
| No preload bridge (a browser build) | The controller starts in the fallback state and says this build has no way to fetch. Nothing throws. |
| Local storage blocked or full | Tab arrangement and panel placement do not survive a restart. Nothing is reported; a remembered layout is not worth a notification. |
| Every section tab closed | An honest empty state saying the document is unchanged and how to open a tab again. |

## Security considerations

- **Nothing is ever passed to `v-html`.** The document comes from a third party and the search puts
  highlights inside it, which is exactly the shape of bug that ends with someone else's markup
  running with the app's privileges. Highlighting is done with text runs and `<mark>` elements the
  component creates itself.
- **No credentials are sent.** A public legal document needs none, and the request carries no
  authentication header of any kind.
- **The response is bounded** while it is read, not after, and the request carries an explicit
  timeout.
- **The IPC handler never rejects.** Every failure crosses as a value with a plain-language reason,
  because a rejected `invoke` becomes an unhandled promise in a component and the user sees a blank
  panel with no explanation.
- **Patterns and document text stay local.** Evaluation goes through the shared bounded regex engine
  with its refusal of catastrophically backtracking patterns; nothing is transmitted or persisted.
- **The consent record is not weakened.** `main/consent.ts` is unchanged. `MinecraftVersion.load`
  still takes `allowDownload` as a required parameter with no default, so no code path can download
  a Mojang jar without an explicit answer.

## Verification

```
cd design
npx vitest run packages/ui packages/app
npx tsc -p packages/app --noEmit
(cd packages/ui && npx vue-tsc -p tsconfig.json --noEmit)
npx eslint packages/app packages/ui
```

What the tests assert, specifically:

- **`packages/app/src/main/eula/document.test.ts`** — extraction keeps the prose and drops the
  machinery; a fresh cache is served without a request and is still reported as a cache; a failed
  fetch with a cached copy returns it labelled `cache` and never `live`; a failed fetch with no
  copy returns nothing at all rather than an empty document; a page that is not the licence is
  refused and not cached; a timeout is reported as a timeout; every corrupt-cache shape is refused.
- **`packages/ui/src/components/eula/eulaSections.test.ts`** — for five differently shaped documents,
  the concatenated section text is byte-identical to the source and the ranges tile it; a set of
  ranges with a gap is rejected, so the guard is not vacuous; classification is deterministic; a
  section's rendered words equal its range's words.
- **`packages/ui/src/components/eula/eulaBridge.test.ts`** — the three states and their sentences;
  a result the build cannot read becomes a stated failure rather than a rendered `undefined`; a
  failed refresh keeps the document already on screen; highlighting preserves the paragraph exactly
  across ten queries including zero-width, anchored, unmatched and invalid patterns; exports name
  which section they hold.
- **`packages/ui/src/components/setup/FirstRunSetup.test.ts`** — the licence is step 2 of 4 and
  carries no accept or decline control; the fallback is labelled as BlueMap's wording; the
  navigation notice is on screen; the consent step has no checkbox or radio of any kind, nothing
  pre-focused, and `Accept` and `Decline` carry identical classes.
- **`packages/ui/src/components/settings/dockPlacement.test.ts`** — a docked panel shrinks so its
  edge touches but never overlaps the opener; it falls back to floating when the edge cannot hold a
  usable panel and keeps the requested placement; a floating panel clears the opener from every
  corner and stays inside the window; no placement exceeds the viewport at 800×600 or 640×400;
  placements persist per surface, reset per surface, and the global reset survives a reload.

## Related reading

- [Language modes and funny levels](./language-and-tone.md) — why the consent and licence statements
  live in the EXACT catalogue and are the same text at level 1 and level 5.
- [Tabbed navigation](./tabbed-navigation.md) — the tab system the viewer reuses, and what its four
  searches and bulk closes do.
- [Appearance editors](./appearance-editors.md) — the per-element editor, the infinite colour picker
  and the typography controls the viewer exposes.
- [The regex builder and the search bars it reaches](./regex-builder.md) — the engine the licence
  search runs on and the bounds it evaluates under.
- [Command palette](./command-palette.md) — the other route to every setting, including a panel's
  placement.

## 廣東話

### Minecraft 授權，同埋指住佢嗰個同意 (EULA and consent)

BlueMap 係用真嘅 Minecraft client 檔案嚟為地圖上材質，所以喺行呢個 app 嗰個人接受咗 Mojang 嘅 EULA 之前，呢部電腦乜都 render 唔到。個 app 一直都有記低嗰個答案。佢之前冇做嘅，就係**將嗰份答案所指嘅文件擺出嚟**：以前個同意步驟淨係引咗 BlueMap 自己嗰段摘要嘅四行字，再畀條連結你開瀏覽器；而由 render wizard 走到呢條問題嘅人，就會畀人話個 render 停咗、叫佢去 Settings，跟住自己撳落去搵。

呢份文件講嘅係個 app 而家點做：首次啟動嗰個授權步驟、會攞返同分類 Mojang 份文件嘅內置檢視器，以及呢個檢視器同其他所有 docked 面板共用嗰套擺位機制。

### 首次啟動嘅授權步驟

首次設定有四步：**Welcome**、**The licence**、**Minecraft files**（即係嗰條問題）同 **Map storage**。授權有自己一步、自己一個進度號碼，而且排喺條問題之前，因為擺喺啲掣後面嘅文件係冇人會開嘅文件，而擺喺啲掣隔籬做連結嘅，就係人哋一撳就過咗嘅嘢。

授權步驟上面冇任何嘢會答到任何問題。佢唯一嘅前進控制係 `Next`，而嗰步亦都白紙黑字講明睇咗唔等於同意咗任何嘢。

同意步驟本身喺重要嘅地方冇變過：

- **接受永遠唔會預先揀好。** 成塊嘢冇 checkbox、冇 radio button、冇 switch；唯一接受嘅方法就係撳 `Accept`。
- **`Accept` 同 `Decline` 係同一粒掣畫兩次** — 同 variant、同大細、同一行，兩粒都唔係 dialog 嘅預設，兩粒都唔係第一個攞 focus。
- **拒絕係一個真實答案**，而且會記住。遠端 BlueMap server 照樣行得，同以前一樣；淨係本機算圖會關掉，而呢步喺啲掣之前就講咗。
- BlueMap 嗰段逐字引文仍然喺畫面上，就喺處理佢嗰啲掣上面。

原本嗰行設定照樣用得，亦仍然係一次失敗嘅 render 會指去嘅地方。佢多咗一個收埋咗嘅 **Read the licence in the app** 披露，可以原地展開同一個檢視器，所以幾個月之後打算撳 `Accept` 嘅人，可以唔使離開設定介面就睇到自己接受緊乜。

呢個檢視器亦以獨立 docked 面板形式存在（`EulaSurface.vue`），由 shell mount 一次，方便喺上面兩個流程以外閱讀份文件。佢有兩條路入：Home 畫面嘅授權卡，同埋 command palette 自己嗰行（<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> 之後打 "licence"），噉樣先至喺任何畫面都掂得到；佢刻意冇喺 application rail 度佔一粒常駐掣，因為 rail 個 footer 淨係擺搜尋、通知同設定。（呢度以前寫嘅係 shell 嗰個浮動角落堆疊，入面擺住 Settings 同選項編輯器。嗰個堆疊已經冇咗：Material Design 3 重寫係刪咗佢而唔係搬咗佢，佢啲目的地入咗 rail 個 footer。）

### 一次真實嘅 render：由 wizard 嘅同意閘去到一張完成嘅地圖

上面嗰段唔係講「打算點做」，而係文件入面六張圖真係影住發生緊嘅嘢：一次真實嘅 run，用打包好嘅 Electron app，經 Playwright 嘅 Electron driver 喺一個 off-screen desktop 上面 headless 噉行 — 同呢個 project 其餘截圖掃描用嘅係同一套機制 — 對住 commit `56b12939f844f713f52dbde397324fc10c3c073a`。當時喺 make-a-map wizard 度打咗一個世界入去並且驗證咗；wizard 個 review 步驟顯示咗上面講嗰個「落載未被接受」嘅確切警告；同意係經本文講嗰行 Settings 畀嘅，唔係經任何捷徑；跟住 BlueMap 自己嘅 Java 引擎由 Mojang 落載咗 Minecraft client 檔案，再將個世界 render 成喺檢視器度開得到嘅 tile。呢度冇任何嘢係擺拍、mock 或者手改。

嗰個 commit 早過 Material Design 3 重寫，亦早過改名，而六張圖一望就見到：個視窗標題係舊產品名，頂部橫住一條八個 tab 嘅帶（而家嗰度係 application rail），左下角有三粒浮動掣疊住（而家嗰度已經冇嘢浮）。留住佢哋，係因為佢哋要證明嘅係嗰個同意閘同一次真實嘅 Java render，而呢兩樣都冇變過 — 不過佢哋係一次發生過嘅 run 嘅紀錄，唔係今日個 shell 嘅樣，讀者喺攞佢哋同眼前個 application 對照之前，抵知呢件事。

六張圖依次係：wizard 嘅 World 步驟，打咗一個真實 Minecraft 世界資料夾入去、驗證咗、報住一個維度一個 region 檔；wizard 未同意之前嘅 Review 步驟，顯示上面講嗰個落載未被接受警告同「Open the setting」連結；由嗰個警告去到嘅 Mojang download consent 設定行，同意啱啱畀咗；render 開始，BlueMap 自己嘅 Java 引擎（5.22-27，呢次 run 行喺 Java 25.0.3）對住上一步嗰個世界起動；render 進行中嘅面板，標題係 Rendering，標住個世界（test-world-seed-1）同引擎（BlueMap engine (Java) 5.22-27 on Java 25.0.3），報住 Starting the engine、0 of 1 maps done，有粒 Stop the render 掣講明停咗都會保住已經畫好嘅每一塊 tile，可以展開目前兩行 console，下面仲註明畀過嘅答案而家已經係嗰個世界根目錄下嘅一個 project，所以唔使再設定一次都可以重複呢次 render；最後係由 render 面板嘅「Open the map」掣直接開嘅檢視器，成個畫面幾乎都係已 render 範圍以外嘅空背景，完成嘅 tile 淨係中間細細一忽 — 呢次 run render 嘅係一個好細嘅測試世界，而個鏡頭一開就已經拉得好遠。

### 攞返同快取份文件

主程序會 fetch `MOJANG_EULA_URL` — 呢個常數 `main/consent.ts` 一直都寫入每一份同意紀錄，而且會拒絕一份對唔到佢嘅已存答案。呢個功能入面刻意冇第二份呢個地址嘅副本。

份頁面係以 HTML 到手。`main/eula/text.ts` 會抽出可讀文字：佢會掉走 `script`、`style`、`noscript`、`template`、`svg` 同 `head`，將 block 級標籤變成換行，剝走剩低嘅嘢，解碼一份法律文件真係會有嘅 entity，再正規化空白，令到同一頁冇變過嘅兩次 fetch 產生 byte 完全一樣嘅文字。

抽取之後係**檢查，唔係信**。`looksLikeTheEula` 會拒絕短過 1500 字符嘅結果，亦會拒絕冇提到 Minecraft、Mojang 同讀者嘅結果。過唔到呢啲檢查嘅頁面唔會快取亦唔會顯示；個 app 會報返嗰個拒絕。呢個防嘅係最靜嗰種失敗：轉向去一個通告頁、成功抽咗文字出嚟、render 咗喺檢視器度、然後畀人當授權嚟讀。

一次成功嘅 fetch 會原子性噉寫入 app 資料目錄嘅 `mojang-eula.json`（先寫 staging 檔再改名），連文字、文件 URL、fetch 時間同字符數。一份細過七日嘅快取副本會直接奉上，唔會發網絡請求。檢視器嘅 **Fetch it again** 控制完全唔理年齡。

快取喺讀返入嚟嗰陣會驗證，而且係丟棄唔係修補：schema 版本唔啱、文件 URL 唔同、時間戳解析唔到，或者字符數同段文字對唔上，全部一律當「冇快取」。丟棄嘅代價係一次請求；修補嘅代價就係畀人睇一份由半有效檔案砌返出嚟嘅授權。

### 分 tab 嘅檢視器

檢視器用瀏覽器式嘅 tab 帶嚟顯示份文件，用嘅係呢個 project 自己嗰套 tab 系統（`components/tabs/`），所以佢自然有 overflow 介面、重新排序、釘住、分組、四種 tab 搜尋同大量關閉，全部都唔使再實作多次。

佢**唔會**共用 application 嘅 tab 儲存。`tabStorage.ts` 寫一個固定 key、讀返 `strips[0]`，所以如果經佢保存，就會用一份授權取代咗用家真正嘅 tab 佈局。`components/eula/eulaStorage.ts` 係同一形狀嘅 module，用自己嘅 key，再加一樣 app 個 strip 唔需要嘅嘢：**調和（reconciliation）**。如果 Mojang 改咗份文件，啲章節就會變，所以一份已存嘅安排會保住每個章節仲喺嘅 tab — 連用家畀佢嘅次序、釘住同分組一齊保住 — 掉走章節已經冇咗嘅，再喺尾加返新嘅。一份同份文件完全冇交集嘅已存佈局會被丟棄，然後重新種返預設。

每一塊面板都會講出自己喺 Mojang 原本次序入面嘅位置（`Section 3 of 9`），所以就算重新排序或者釘 tab，讀者都唔會唔知自己喺份文件邊度。

Tab 帶上面嗰個 header 永遠會講明畫面上嗰樣係三樣嘢入面邊樣：`live` 即係呢份係 Mojang 嘅文件、由 Mojang 攞返嚟、時間係*呢個*時間；`cache` 即係呢份係 application 之前攞咗留低嘅副本、時間係*呢個*時間，可能唔係現行措辭；`fallback` 即係呢份**唔係** Mojang 嘅文件，攞唔到，所以改為顯示 BlueMap 自己引嗰段措辭。一次失敗但仲有快取副本睇嘅情況，會兩件事一齊講：呢份係副本、日期係幾時，同埋點解佢唔係更新嘅。一份過期或者替代嘅副本永遠唔會標做 live。

### 分類係導航，永遠唔係編輯

啲 tab 將份文件分成 `Overview`、`What you may do`、`What you may not do`、`Ownership`、`Updates and changes`、`Termination`、`Warranties and liability` 同 `Other terms`。

將一份法律文件分類，係容許*分錯*嘅 — 一條條款擺錯 tab 嘅代價係多撳一下。但佢永遠唔容許變成*編輯*，而每一個聽落合理嘅實作方式其實都係編輯：靠摘要、靠重新排段落令一個分類讀落順、靠掉走一句同時屬於兩個分類嘅嘢，或者靠 render 一個翻譯咗嘅標題去代替原標題。

所以 `components/eula/eulaSections.ts` 從來唔處理文字。佢處理嘅係**offset**。一個章節係對住原始字串嘅半開區間 `[start, end)`；啲區間係連續嘅、按升序產生、由 index 0 覆蓋到 `text.length`。噉個保證就係結構性嘅，唔係一句承諾：

- 冇嘢可以被遺漏，因為每個 index 都剛好屬於一個區間；
- 冇嘢可以被重新排序，因為啲區間係按升序產生同 render；
- 冇嘢可以被改寫，因為根本冇任何文字被複製或者轉換過。

`sectionsCoverText` 將呢件事寫成一個可檢查嘅條件，而測試會 assert 五份唔同形狀嘅文件之下，串埋一齊嘅章節文字同原文 byte 完全一樣。喺任何地方唯一套用過嘅詮釋就係「空行代表一段完」，而測試會檢查一個 render 出嚟嘅章節嘅字詞等同佢個區間嘅字詞。

檢視器會將呢一切講喺畫面上面，而且擺喺 EXACT 字串目錄入面，所以冇任何 funny level 改得到佢嘅風格：啲分類係呢個 application 加喺 Mojang 文件之上嘅導航，而萬一個 app 嘅文案同 Mojang 已發佈嘅文件有出入，作準嘅係 Mojang 份文件。

引用嘅文字永遠唔會被翻譯。喺廣東話同雙語模式之下，周圍嘅文案係廣東話，而份文件維持佢自己嘅語言，同同意引文一直以嚟嘅做法一樣。

### 搜尋、匯出同複製

搜尋列係共用嘅 `ConfigSearchField`，所以佢同 app 其他搜尋介面一樣帶住 anchored regex builder。預設係純文字，regex 要明確 opt-in。

有兩條規則係專為法律文件而設：

- **搜尋唔會收埋任何嘢。** 佢會標示邊啲章節有命中同有幾多個，而每個章節都留喺 tab 帶入面。一份九個章節有三個被 filter 出咗導航之外嘅授權，會令人合理噉以為自己已經讀完。
- **高亮改唔到一隻字。** 搜尋回傳嘅係一段段純文字 *run* — `{ text, hit }` 對，佢哋啲 text 串返埋就係一模一樣嗰段 — 而 component 就喺命中嗰啲外面包個 `<mark>`。永遠冇任何嘢交畀 `v-html`。零闊度嘅 match 會被丟棄，唔會喺每個罅隙度 render 一個睇唔到嘅 mark。

匯出可以揀目前章節或者成份文件，格式係 Markdown 或者純文字，另外仲可以複製去剪貼簿。每份匯出開頭都有個 header，講明文件地址、呢份係 live 文件定係快取副本定係 BlueMap 嘅措辭、幾時攞返嚟，同埋**呢個檔案裝住第幾個章節、總共幾多個**。內文就係嗰個區間本身嘅字符；`Markdown` 意思係一個 header 加段文字，唔係將啲條款重新排版成標題同 bullet。

### 外觀

檢視器、佢個 tab 帶同每塊章節面板都係逐元素嘅 appearance target。右擊揀 **Edit appearance…**、用鍵盤撳 <kbd>Shift</kbd>+<kbd>F10</kbd> 開同一個 menu，或者 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F10</kbd> 直入編輯器 — 有齊 Word 級深度嘅排版控制同無限色彩選擇器連佢個翻譯器。用 24 點字加高對比嚟讀一份授權係無障礙需要，唔係新奇玩意。命中高亮用嘅係識得跟主題嘅顏色，唔係瀏覽器嗰隻黃，因為嗰隻黃喺深色表面上面對比唔合格。

### Docked 面板擺喺邊

設定介面以前係右邊抽屜，因為總要揀一邊。喺闊螢幕上面冇問題，但對住張地圖喺右邊嘅人就係錯。佢嘅呈現方式而家係一個會保存嘅選擇，而個機制係一個 wrapper（`components/settings/DockedSurface.vue`），唔係焊死喺嗰一個介面上面嘅嘢。

五種擺位：**floating**，或者 dock 喺 **left**、**right**、**top**、**bottom**。每個介面記住自己嗰個 — 設定 sheet 預設右邊，授權檢視器預設底部，因為法律文件用又闊又矮嘅行嚟讀會好啲。

呢個選擇喺面板自己個標題列度掂到（一粒選擇掣、一個五行 `menuitemradio` 嘅 menu，同兩個 reset），亦喺 Settings 嘅 **Where the panels sit** 一節度掂到；嗰節會列出每個開住嘅面板、以 radio group 提供同樣五個選擇，仲帶埋全域 reset。全域 reset 清嘅係*已存*紀錄而唔係淨係開住嗰啲面板，因為你睇唔到嗰塊面板正正就係你想 reset 嗰塊。啲面板名同五個擺位標籤都喺設定搜尋入面，所以打 "docked to the bottom" 搵得返嗰行。

#### 永遠唔會遮住開佢嗰粒控制

一塊面板遮住自己個 opener，就係呢度一定要避免嗰個失敗：粒掣仲喺度、仲 focus 得到、仲讀得出，但完全睇唔見，於是你想再撳佢閂咗塊面板，其實撳咗塊面板。`resolveDockLayout` 會攞 opener 個矩形，然後：

- **沿住 docking 軸縮細塊 docked 面板**，令佢條邊喺 opener 之前收手。一個右 dock 喺一粒距離右邊 300px 嘅掣隔籬，就係 300px 闊，唔係 520px 蓋住佢；
- **當連 240px 最細值都避唔開，就退返做 floating**，同時保住用家嘅選擇，等視窗夠位嗰陣塊面板返返去嗰邊，並且喺畫面上講明，唔會靜靜雞喺第二度出現；
- **揀一個完全唔會同 opener 相交嘅浮動角落**，而且係確定性嘅，所以同一個視窗每次塊面板都落喺同一位。

Opener 就係 host 傳入嗰個元素，如果佢乜都冇傳，就係塊面板打開嗰刻攞住 focus 嗰個。閂嗰陣 focus 會返返去佢度。

每種擺位都可以用鍵盤操作兼有可見 focus，塊面板係 `role="dialog"` 但**冇** `aria-modal`（佢真係非模態：冇 scrim、後面個 application 照用得、Escape 閂到），而每種擺位都封頂喺 viewport 之內，所以一塊 520px 嘅面板喺 800×600 同 200% 顯示比例之下會變成成條邊，唔會滿瀉。

### 設定

快取文件放喺 app 資料目錄嘅 `mojang-eula.json`，第一次 fetch 之前唔存在；快取最大年齡係 `main/eula/document.ts` 嘅 `CACHE_MAX_AGE_MS`，預設 7 日；fetch 逾時係 `FETCH_TIMEOUT_MS`，預設 15 秒；回應上限係 `MAX_RESPONSE_BYTES`，預設 2,000,000 bytes；檢視器嘅 tab 佈局存喺 local storage 嘅 `worldlens-eula-tabs`，預設每個章節一個 tab；面板擺位存喺 local storage 嘅 `worldlens-dock-placement`，預設係逐個介面自己嗰個。

文件地址唔可以配置。佢嚟自 `main/consent.ts` 嘅 `MOJANG_EULA_URL`，所以人讀嗰份文件同佢記錄低嘅接受所指嗰份文件，唔會各自飄開。

### 失敗情況

冇網絡、DNS 失敗、逾時：報明原因，有快取副本就顯示副本並標明佢自己嗰個 fetch 日期，冇就顯示 BlueMap 嘅措辭並標明係 BlueMap 嘅。非 200 回應：一樣做法，兼點明 status code。份頁面唔係授權：拒絕、唔快取、顯示原因。回應大過上限：喺讀嘅過程中就拒絕，唔會等記憶體先使晒。快取檔壞咗、畀人手改過或者嚟自未來嘅 build：丟棄，個 app 再 fetch。資料目錄唯讀：攞返嚟嗰份文件照顯示，淨係跳過寫入，所以下次啟動會再 fetch。冇 preload bridge（瀏覽器 build）：controller 由 fallback 狀態開始，並講明呢個 build 冇辦法 fetch，唔會 throw。Local storage 被封鎖或者滿咗：tab 安排同面板擺位過唔到重啟，唔會有任何報告，因為一個記住咗嘅佈局唔值得一個通知。所有章節 tab 都關晒：出一個老實嘅空狀態，講明份文件冇變過同點樣再開返一個 tab。

### 安全考慮

- **永遠冇任何嘢交畀 `v-html`。** 份文件嚟自第三方，而搜尋仲要喺入面加高亮，呢個形狀嘅 bug 最尾就係人哋嘅 markup 攞住個 app 嘅權限行。高亮係用文字 run 加 component 自己整嘅 `<mark>` 元素做。
- **唔會送任何 credential。** 一份公開法律文件唔需要，而個請求唔帶任何形式嘅認證 header。
- **回應係邊讀邊封頂**，唔係讀完先，而個請求帶住明確逾時。
- **IPC handler 永遠唔會 reject。** 每個失敗都以一個值加一句人話原因過嚟，因為一個 reject 咗嘅 `invoke` 喺 component 入面會變成 unhandled promise，而用家就會見到一塊冇任何解釋嘅空白面板。
- **Pattern 同文件文字全部留喺本機。** 求值行經共用嘅有界 regex 引擎，佢會拒絕災難性回溯嘅 pattern；冇任何嘢會被傳送或者保存。
- **同意紀錄冇被削弱。** `main/consent.ts` 冇改過。`MinecraftVersion.load` 仍然要求 `allowDownload` 做一個冇預設值嘅必填參數，所以冇任何代碼路徑可以喺冇明確答案之下落載 Mojang 個 jar。

### 驗證

```
cd design
npx vitest run packages/ui packages/app
npx tsc -p packages/app --noEmit
(cd packages/ui && npx vue-tsc -p tsconfig.json --noEmit)
npx eslint packages/app packages/ui
```

啲測試具體 assert 乜：

- **`packages/app/src/main/eula/document.test.ts`** — 抽取保住正文、掉走機械部分；新鮮嘅快取唔使發請求就奉上，而且仍然報做 cache；fetch 失敗但有快取副本會回傳佢並標做 `cache`，永遠唔會標 `live`；fetch 失敗又冇副本就乜都唔回，唔會回一份空文件；唔係授權嘅頁面會被拒絕兼唔快取；逾時會報做逾時；每一種壞快取形狀都會被拒絕。
- **`packages/ui/src/components/eula/eulaSections.test.ts`** — 對住五份唔同形狀嘅文件，串埋嘅章節文字同原文 byte 完全一樣，而啲區間鋪滿佢；一組有罅隙嘅區間會被拒絕，所以個守衛唔係空口講；分類係確定性嘅；一個章節 render 出嚟嘅字詞等同佢個區間嘅字詞。
- **`packages/ui/src/components/eula/eulaBridge.test.ts`** — 三個狀態同佢哋嘅句子；一個 build 讀唔到嘅結果會變成一個講明咗嘅失敗，而唔係 render 出個 `undefined`；一次失敗嘅重新整理會保住畫面上已經有嗰份文件；高亮喺十條查詢（包括零闊度、anchored、無命中同無效 pattern）之下都完整保住段落；匯出會講明自己裝住邊個章節。
- **`packages/ui/src/components/setup/FirstRunSetup.test.ts`** — 授權係四步之中嘅第二步，而且唔帶任何 accept 或者 decline 控制；fallback 會標明係 BlueMap 嘅措辭；導航提示喺畫面上；同意步驟冇任何 checkbox 或者 radio、冇嘢預先 focus，而 `Accept` 同 `Decline` 帶住一模一樣嘅 class。
- **`packages/ui/src/components/settings/dockPlacement.test.ts`** — 一塊 docked 面板會縮到條邊掂住但永遠唔會蓋住 opener；當嗰邊容唔落一塊用得嘅面板佢會退返做 floating，同時保住所要求嘅擺位；一塊浮動面板喺每個角落都避得開 opener 而且留喺視窗之內；喺 800×600 或者 640×400 之下冇任何擺位超出 viewport；擺位逐個介面保存、逐個介面 reset，而全域 reset 捱得過一次 reload。

### 相關閱讀

- [Language modes and funny levels](./language-and-tone.md) — 點解同意同授權嗰啲聲明擺喺 EXACT 目錄入面，而且喺 level 1 同 level 5 都係同一段文字。
- [Tabbed navigation](./tabbed-navigation.md) — 檢視器重用嗰套 tab 系統，同埋佢四種搜尋同大量關閉做啲乜。
- [Appearance editors](./appearance-editors.md) — 檢視器 expose 嘅逐元素編輯器、無限色彩選擇器同排版控制。
- [The regex builder and the search bars it reaches](./regex-builder.md) — 授權搜尋行喺上面嗰個引擎，同埋佢求值時嘅界限。
- [Command palette](./command-palette.md) — 通往每一個設定（包括面板擺位）嘅另一條路。
