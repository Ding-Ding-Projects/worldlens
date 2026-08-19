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

## Complete render history

The visible ring is only a rendering limit. Every render has a durable, versioned console record
outside the Vue component, keyed by render id and retained independently of tab navigation. Lines
are appended incrementally through a crash-safe staging path; a partial write is ignored on restore
and the last complete record remains readable. Reopening the render tab, reattaching to a completed
run, or restarting the app restores the retained stream rather than recreating it from the bounded
on-screen ring. An interrupted run keeps the lines written before interruption and records the
interruption as an annotation instead of pretending the run completed.

The UI may still show only the newest bounded lines. Its dropped-line indicator describes what is
outside the viewport, not what was deleted from history. Search runs over the complete retained
stream, with plain text as the default and the adjacent full regex builder as an explicit opt-in;
pattern, flags and evaluation size are bounded, and an invalid pattern produces an honest no-match
state. Search results retain render id, timestamp, level and annotation context.

Complete and filtered export preserve UTF-8, schema/version, render id, provenance, timestamps,
levels, annotations and filter metadata. The supported faithful forms are plain text, Markdown,
JSON, JSONL, CSV, TSV and HTML. Selection-aware copy/export acts on selected records; bulk export
reports exactly which records were included. Bulk deletion is separate from pruning and requires
the app's destructive-action super confirmation. Retention is explicit and inspectable: automatic
pruning removes only records outside the configured policy, reports what was pruned, and never
turns the visible ring's cap into a history-retention policy.

Secrets and path-sensitive values pass through the existing console redaction policy before they
enter durable history or an export. Redaction changes only the persisted/copyable representation;
the live source line remains available in the running console. History is local-only: no log line,
render path, credential, token, or private source is uploaded.

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
- A refused or full history store leaves the live console usable, reports the persistence failure,
  and marks the affected record unpersisted rather than claiming it was retained.
- A torn append, truncated file, invalid schema, or interrupted render is recovered as the last
  complete record plus an explicit recovery annotation; it is never parsed as a successful run.
- Pruning and bulk deletion show their scope and count before acting, and deletion cannot proceed
  without the destructive confirmation.

## Security considerations

Console text is rendered as text, never as HTML, so engine output cannot inject markup into the
app. Export is local and does not upload log lines. Search is bounded by the same local regex
limits as every other settings field.

## Verification

`RenderConsole.test.ts`, `annotations.test.ts` and `consoleModel.test.ts` cover line-level
selection, level labels, follow/detach behaviour, dropped-line accounting, advice navigation,
reduced motion, copy/export and invalid/regex search. Durable-history tests cover incremental
append/recovery, partial writes, storage refusal, Unicode, zero-width regex, large retained logs,
interrupted renders, restart/reattach restore, retention/pruning, selection-aware and bulk export,
redaction, and destructive deletion confirmation. The packaged acceptance proof reopens a completed
render after a real app restart and verifies that a line outside the visible ring is still searchable
and exportable. `RenderConsole.test.ts` (27 tests) adds
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

### 完整 render history

畫面個 ring 只係顯示上限,唔係歷史上限。每次 render 都會喺 Vue component 之外有一份有版本嘅 durable console record,用 render id 分開,唔會因為轉 tab 而消失。每行會 incremental 咁寫入 crash-safe staging path;如果寫到一半撞斷,重開只會採用最後一份完整 record。重開 render tab、reattach 已完成嘅 run,或者重啟 app,都會恢復完整保留嘅 stream; interrupted run 會保留已寫入嘅行,再加一個 interruption annotation,唔會扮成成功完成。

UI 仍然可以只顯示最近一截 bounded lines。dropped-line indicator 講緊畫面外面有幾多行,唔係話 history 被刪走。搜尋係對完整 retained stream 做,預設 plain text,旁邊有完整 regex builder 俾人 opt-in; pattern、flags 同 evaluation size 有上限,invalid pattern 會老實顯示 no-match。搜尋結果會保留 render id、timestamp、level 同 annotation context。

完整或 filtered export 會保留 UTF-8、schema/version、render id、provenance、timestamps、levels、annotations 同 filter metadata。支援嘅 faithful formats 係 plain text、Markdown、JSON、JSONL、CSV、TSV 同 HTML。Selection-aware copy/export 只處理揀咗嘅 records; bulk export 會講清楚包括咗邊啲。Bulk deletion 同 pruning 分開,而且要經 app 嘅 destructive-action super confirmation。Retention 係明確同可檢查嘅 policy: automatic pruning 只清走 policy 以外嘅 records,會報清楚清走咗乜,唔會將畫面 cap 偷換成 history retention policy。

Secrets 同 path-sensitive values 會喺落 durable history 或 export 前行現有 console redaction policy。Redaction 只改持久化/可 copy 嘅版本;live console 仍然保留使用者有權睇嘅 source line。History 只留本機,log line、render path、credential、token 同 private source 都唔會 upload。

### 設定 (Configuration)

console 由 render screen 接收 line stream、dropped-line count、cap 同 height。預設 cap 係 10,000 行,預設 height 係一個 responsive viewport clamp。搜尋用共用嘅 settings field 加旁邊嘅 regex builder;預設係 plain text,invalid pattern 乜都唔 match。component 對 follow-scroll 動畫同自己嘅 indeterminate progress 都尊重 `prefers-reduced-motion`,並且用當前嘅英文、廣東話或者雙語語言模式。auto-scroll 一樣跟讀者揀咗嘅 funny level 同語言模式 — checkbox 自己個 tooltip 五個 level 兩種語言都有配好。

### 失敗模式

- 超出 cap 嘅行唔會靜靜雞當存在;dropped count 一直可見。
- detached(暫停咗)嘅讀者唔會畀 progress tick 拉返落底。
- console 入面有 active 文字選取嘅讀者唔會被捲走。
- copy/export 失敗會報一個 non-blocking notice,console 照用得。
- 一個已經唔再 mount 嘅 setting target 會報 unavailable,唔會扮開到。
- history store 被拒絕或者爆滿時,live console 照樣用得,會報 persistence failure,而受影響 record 會標示 unpersisted,唔會扮話已經 retain。
- torn append、truncated file、invalid schema 或 interrupted render 只會恢復最後一份完整 record,再加明確 recovery annotation,唔會當成功 run 解析。
- pruning 同 bulk deletion 行之前會顯示 scope 同 count,冇 destructive confirmation 就唔會刪。

### 安全考量

console 文字永遠以 text render,唔會以 HTML,所以 engine 輸出注入唔到任何 markup 入 app。export 係本地嘅,唔會上傳 log。搜尋受同一套本地 regex 限制約束,同其他 settings field 一樣。

### 驗證

`RenderConsole.test.ts`、`annotations.test.ts` 同 `consoleModel.test.ts` 覆蓋 line-level selection、level label、follow/detach 行為、dropped-line 計數、advice navigation、reduced motion、copy/export 同 invalid/regex 搜尋。Durable-history tests 會覆蓋 incremental append/recovery、partial write、storage refusal、Unicode、zero-width regex、大 log、interrupted render、restart/reattach restore、retention/pruning、selection-aware 同 bulk export、redaction、同 destructive deletion confirmation。Packaged acceptance proof 會用真 app restart 重開完成咗嘅 render,再證明 ring 以外嘅一行仲可以搜尋同匯出。`RenderConsole.test.ts`(27 個測試)專為 auto-scroll checkbox 加覆蓋:預設開而且有真 accessible name、剔住嗰陣跟新輸出、除咗剔之後唔郁 view、手動捲動時暫停但唔除剔、捲返落底恢復、jump 控制只喺暫停時出現、唔會捲走一個 active 文字選取、永不郁鍵盤 focus、偏好捱得過一次 fresh mount。`components/scroll/` 自己嘅 `stickyScroll.test.ts`(16 個)同 `autoScrollPrefs.test.ts`(17 個)直接證共用機制,包括 reduced motion 同 storage-failure path。

### 建議文章

- [Rendering on a remote host](./remote-render.md) — engine 經 SSH 行嗰陣,同一套進度同取消模型。
- [The regex builder and the search bars it reaches](./regex-builder.md) — 共用嘅搜尋 contract。
- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) — 失敗旁邊出現嘅 advice action。
