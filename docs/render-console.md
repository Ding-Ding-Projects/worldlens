# Render console

## Behaviour

The render screen keeps a bounded console instead of a last-lines `<pre>`. Each line carries
its level as text as well as a theme-aware colour, so warnings and errors remain distinguishable
without colour vision.

**Following new output is a checkbox, "Follow new lines", on by default.** While it is on and the
view is already at the bottom, every new line pulls the view down with it. The moment a reader
scrolls up - a wheel notch, a keyboard press, a dragged scrollbar - following *pauses*
automatically, without touching the checkbox: the reader did not say "stop following forever",
they scrolled up to read something. A `Newest lines` control appears only while paused, and either
scrolling back to the bottom by hand or clicking it resumes following. Turning the checkbox off
stops new output from moving the view at all, and `Newest lines` never appears while it is off -
there is nothing to "get back to following" when following was never asked for.

A reader's own text selection inside the console is never fought: an append that would otherwise
scroll checks for an active, non-collapsed selection first and, if it finds one, leaves the view
exactly where it is rather than yanking a half-copied sentence out from under the reader. Scrolling
never moves keyboard focus, either.

The `<ol>` carries `role="log"` for assistive technology but sets `aria-live="off"` deliberately:
`role="log"` has an implicit `aria-live="polite"`, and a render prints lines by the thousand, which
would otherwise mean a screen reader narrating every single one as it arrives. The region stays
reachable and readable line by line with the keyboard; a reader chooses when to read it rather than
having it read at them.

The preference is persisted per surface (`localStorage`, mirrored into the app settings history)
and restored on the next launch. `components/scroll/stickyScroll.ts` and
`components/scroll/autoScrollPrefs.ts` hold the shared mechanism; `BackupRunCard.vue`'s and
`DownloadRowCard.vue`'s own logs use the same two modules for the identical behaviour, see
[Backing up a world or a rendered map](./backup.md) and
[Large worlds and rendered maps](./large-worlds.md).

The cap is explicit: the UI reports how many earlier lines were dropped rather than implying the
visible slice is the whole log. Advice rows can point to the exact settings target that needs
attention. Copy and Markdown export use the current selection and preserve the level, timestamp
and rendered text.

## Configuration

The console accepts the line stream, a dropped-line count, a cap and a height from the render
screen. The default cap is 10,000 lines and the default height is a responsive viewport clamp.
Search uses the shared settings field and its adjacent regex builder; plain text is the default,
and invalid patterns match nothing. The component honours `prefers-reduced-motion` for both the
follow-scroll animation and its own indeterminate progress, and uses the active English, Cantonese
or bilingual language mode. Auto-scroll follows the reader's chosen funny level and language mode
too - the checkbox's own tooltip is voiced at all five levels in both languages.

## Failure modes

- A line outside the cap is not silently counted as present; the dropped count remains visible.
- A detached (paused) reader is not pulled to the bottom by progress ticks.
- A reader with an active text selection inside the console is not scrolled away from it.
- A failed copy/export action reports a non-blocking notice and leaves the console usable.
- A setting target that is no longer mounted is reported as unavailable instead of pretending it
  opened.

## Security considerations

Console text is rendered as text, never as HTML, so engine output cannot inject markup into the
app. Export is local and does not upload log lines. Search is bounded by the same local regex
limits as every other settings field.

## Verification

`RenderConsole.test.ts`, `annotations.test.ts` and `consoleModel.test.ts` cover line-level
selection, level labels, follow/detach behaviour, dropped-line accounting, advice navigation,
reduced motion, copy/export and invalid/regex search. `RenderConsole.test.ts` (27 tests) adds
coverage for the auto-scroll checkbox specifically: on by default with a real accessible name,
following new output while checked, not moving the view once unchecked, pausing without
unticking the checkbox on a manual scroll, resuming on scrolling back to the bottom, the jump
control appearing only while paused, not scrolling away from an active text selection, never
moving keyboard focus, and the preference surviving a fresh mount. `components/scroll/`'s own
`stickyScroll.test.ts` (16 tests) and `autoScrollPrefs.test.ts` (17 tests) prove the shared
mechanism directly, including reduced motion and storage-failure paths.

## Suggested articles

- [Rendering on a remote host](./remote-render.md) for the same progress and cancellation model
  when the engine runs over SSH.
- [The regex builder and the search bars it reaches](./regex-builder.md) for the shared search
  contract.
- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) for
  the advice actions that appear beside failures.

## 廣東話

### 行為 (Render console)

render screen 用一個有上限嘅 console(render console),而唔係一個淨係顯示最後幾行嘅 `<pre>`。每一行嘅 level 同時以文字同 theme-aware 顏色標示,所以就算冇色覺,warning 同 error 都仲分得開。

**跟住新輸出係一個 checkbox,「Follow new lines」,預設開。**開住而且 view 已經喺底部嘅時候,每一行新輸出都會將 view 拉埋落去。讀者一捲上去 — 滾輪一格、鍵盤一下、拖一下 scrollbar — following 就自動*暫停*,唔會掂個 checkbox:讀者唔係話「永遠唔好跟」,佢只係捲上去讀啲嘢。一個 `Newest lines` 控制只會喺暫停期間出現,手動捲返落底或者撳佢都會恢復 following。將個 checkbox 閂咗,新輸出就完全唔會郁個 view,而且閂住嘅時候 `Newest lines` 永遠唔會出現 — 從來冇要求過 follow,就冇「返去 follow」呢回事。

讀者喺 console 入面自己嘅文字選取永遠唔會被搶:一個本來會捲動嘅 append 會先檢查有冇 active、non-collapsed 嘅 selection,搵到嘅話 view 原封不動,唔會將一句抄咗一半嘅嘢由讀者手指下面扯走。捲動亦永遠唔會郁鍵盤 focus。

個 `<ol>` 為輔助技術帶 `role="log"`,但刻意 set `aria-live="off"`:`role="log"` 隱含 `aria-live="polite"`,而一個 render 一印就係幾千行,否則即係 screen reader 每一行到達都讀一次。個 region 照樣用鍵盤逐行讀得到 — 讀者揀幾時讀,而唔係畀佢讀住你。

呢個偏好逐個 surface 持久化(`localStorage`,mirror 埋入 app settings history),下次啟動恢復。`components/scroll/stickyScroll.ts` 同 `components/scroll/autoScrollPrefs.ts` 係共用機制;`BackupRunCard.vue` 同 `DownloadRowCard.vue` 自己嘅 log 用同一兩個模組做一模一樣嘅行為,見 [Backing up a world or a rendered map](./backup.md) 同 [Large worlds and rendered maps](./large-worlds.md)。

個上限係講明嘅:UI 會報告 drop 咗幾多早期行,而唔係暗示見到嗰截就係成份 log。advice row 可以指去需要注意嘅確切 settings target。Copy 同 Markdown export 用當前 selection,保留 level、timestamp 同 rendered text。

### 設定 (Configuration)

console 由 render screen 接收 line stream、dropped-line count、cap 同 height。預設 cap 係 10,000 行,預設 height 係一個 responsive viewport clamp。搜尋用共用嘅 settings field 加旁邊嘅 regex builder;預設係 plain text,invalid pattern 乜都唔 match。component 對 follow-scroll 動畫同自己嘅 indeterminate progress 都尊重 `prefers-reduced-motion`,並且用當前嘅英文、廣東話或者雙語語言模式。auto-scroll 一樣跟讀者揀咗嘅 funny level 同語言模式 — checkbox 自己個 tooltip 五個 level 兩種語言都有配好。

### 失敗模式

- 超出 cap 嘅行唔會靜靜雞當存在;dropped count 一直可見。
- detached(暫停咗)嘅讀者唔會畀 progress tick 拉返落底。
- console 入面有 active 文字選取嘅讀者唔會被捲走。
- copy/export 失敗會報一個 non-blocking notice,console 照用得。
- 一個已經唔再 mount 嘅 setting target 會報 unavailable,唔會扮開到。

### 安全考量

console 文字永遠以 text render,唔會以 HTML,所以 engine 輸出注入唔到任何 markup 入 app。export 係本地嘅,唔會上傳 log。搜尋受同一套本地 regex 限制約束,同其他 settings field 一樣。

### 驗證

`RenderConsole.test.ts`、`annotations.test.ts` 同 `consoleModel.test.ts` 覆蓋 line-level selection、level label、follow/detach 行為、dropped-line 計數、advice navigation、reduced motion、copy/export 同 invalid/regex 搜尋。`RenderConsole.test.ts`(27 個測試)專為 auto-scroll checkbox 加覆蓋:預設開而且有真 accessible name、剔住嗰陣跟新輸出、除咗剔之後唔郁 view、手動捲動時暫停但唔除剔、捲返落底恢復、jump 控制只喺暫停時出現、唔會捲走一個 active 文字選取、永不郁鍵盤 focus、偏好捱得過一次 fresh mount。`components/scroll/` 自己嘅 `stickyScroll.test.ts`(16 個)同 `autoScrollPrefs.test.ts`(17 個)直接證共用機制,包括 reduced motion 同 storage-failure path。

### 建議文章

- [Rendering on a remote host](./remote-render.md) — engine 經 SSH 行嗰陣,同一套進度同取消模型。
- [The regex builder and the search bars it reaches](./regex-builder.md) — 共用嘅搜尋 contract。
- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) — 失敗旁邊出現嘅 advice action。
