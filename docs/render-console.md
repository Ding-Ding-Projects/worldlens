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

## Complete render history: current source status

The current issue #58 source keeps a second render-id-keyed line array outside the bounded visible
ring and persists it through a version-2 index plus immutable revisioned segment generations in
`localStorage`. Render ids are encoded injectively in segment keys. Each segment holds at most 512
lines; `appendConsoleHistoryLine()` rewrites only the active partial segment or adds the next segment,
then commits the new index before removing superseded generations. A fresh render controller reads
the record through the index, and the console searches and exports the retained array instead of the
visible ring. This source wiring has not yet been proven by a real application restart or completed-
run reopening.

Index and segment writes use temporary keys, read-back comparison and monotonic revisions. Readers
choose the newer valid primary/temporary index or segment after an interrupted replacement. A
legacy version-1 monolithic envelope is converted into bounded version-2 segments; the new index is
committed before the legacy key is removed. Superseded, retention-evicted and cleared segment
generations are removed only after the authoritative index update.

Retention is bounded and loss is explicit rather than silent: the store keeps at most 24 render
records, 200,000 lines per record and an 8 MiB encoded envelope. When a line, record or byte limit
evicts data, the record becomes incomplete and the surface receives a retention/storage warning.
Storage refusal leaves the live stream running and produces an unsaved-history warning. These are
fixed implementation limits, not a user-configurable retention policy, and source presence is not
proof that recovery works after a process crash.

The surface supports plain-text-first complete-array search with the adjacent regex builder, line
selection, selected or filtered copy/export, and TXT, Markdown, JSON, JSONL, CSV, TSV and HTML
output. Export rows include schema version, render id, provenance, line id, timestamp, level,
origin, message and annotation kinds/tones. Selected retained lines can be deleted only through the
existing destructive super-confirmation surface. A second confirmed action prunes every retained
line for the current render while allowing a running render to continue appending new lines. The
current source does not expose multi-render bulk actions, retention configuration or a pruning
history/restore surface. It does surface and export the persisted completion state, last-saved time,
exact evicted-line count, exact evicted-render count and storage-warning reason. JSON/JSONL carry
that metadata structurally; CSV/TSV include dedicated columns; the plain-text/Markdown header and
visible details list state the same facts.

Credential-shaped tokens, bearer headers, URL credentials and selected connection-string secrets
are redacted before persistence and export. Common absolute local paths are redacted too: drive-
letter and UNC paths, plus paths rooted under `/Users`, `/home`, `/tmp`, `/var` and `/private`.
Comprehensive path-sensitive coverage remains open for relative paths, other roots, URI-shaped
paths and escaping/quoting edge cases. The source is local-only and does not add an upload route.

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
- An invalid envelope or schema is ignored rather than applied partially. A genuine process-crash
  and interrupted-write recovery result has not been run.
- Selected-line deletion and current-render prune-all each show their exact scope through
  destructive confirmation. Multi-render bulk deletion and configurable retention remain absent.

## Security considerations

Console text is rendered as text, never as HTML, so engine output cannot inject markup into the
app. Export is local and does not upload log lines. Search is bounded by the same local regex
limits as every other settings field.

## Verification

The source includes `RenderConsole.test.ts`, `annotations.test.ts`, `consoleModel.test.ts` and
`consoleHistory.test.ts` cases for the component, model and storage helpers. No test, typecheck,
build, packaged interaction or capture was run in this records lane, so their verdict is unverified.
Issue #58 remains open until focused verification proves incremental append/recovery, partial writes,
storage refusal, Unicode, zero-width regex, large retained logs, interruption, navigation, restart,
reattach, completed-run reopening, retention/eviction metadata, selection-aware export,
multi-render actions, version-1 migration, segmented generation/index recovery, orphan-generation
cleanup, redaction and destructive deletion. The packaged acceptance proof must
restart the real app, reopen a completed render, and search/export a line outside the visible ring.
`RenderConsole.test.ts` previously documented 27 auto-scroll tests that add
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

### 完整 render history：而家嘅 source 狀態

Issue #58 而家嘅 source 喺 bounded visible ring 之外保留第二份 render-id-keyed line array，並用 version-2 index 加 immutable revisioned segment generations 存入 `localStorage`。Render id 會 injective encode 入 segment key，每個 segment 最多 512 lines。`appendConsoleHistoryLine()` 只 rewrite active partial segment 或加下一個 segment，先 commit 新 index，之後先清 superseded generation。新 render controller 經 index 讀返 record，而 console 搜尋同 export 用 retained array，唔係淨係 visible ring。呢啲係 source wiring，未有真 app restart 或 completed-run reopening 證據。

Index 同 segment write 都用 temporary key、read-back comparison、monotonic revision；read 會揀較新嘅 valid primary/temporary index 或 segment。Legacy version-1 monolithic envelope 會轉成 bounded version-2 segments，先 commit 新 index，之後先移除 legacy key。Superseded、retention-evicted、cleared segment generation 都係 authoritative index update 後先清。

Retention 有硬上限，而且 loss 會講明：最多 24 個 render records、每個 record 200,000 行、encoded envelope 8 MiB。超出 line、record 或 byte limit 時，record 會變成 incomplete，surface 會收到 retention/storage warning。Storage refusal 唔會停 live stream，亦會顯示 history 未儲到。呢啲係固定 implementation limits，唔係 user-configurable retention policy；有 source 唔等於 process crash recovery 已證實。

Surface 有 plain-text-first retained-array search 加旁邊 regex builder、line selection、selected/filtered copy/export，同 TXT、Markdown、JSON、JSONL、CSV、TSV、HTML。Selected retained lines 要經 destructive super-confirmation 先刪得，另一個 confirmed action 可以 prune 當前 render 所有 retained lines。UI 同 export 已經有 persisted completion、last-saved time、exact evicted-line/render counts 同 storage-warning reason；JSON/JSONL 用 structured metadata，CSV/TSV 有 dedicated columns，plain-text/Markdown header 同 visible details list 講返同一批 facts。Multi-render bulk actions、retention configuration 同 pruning history/restore surface 仲係 open。

Credential-shaped token、bearer header、URL credential 同部分 connection-string secret 會喺 persistence/export 前 redaction。Common absolute local paths 都會 redaction，包括 drive-letter、UNC，同 `/Users`、`/home`、`/tmp`、`/var`、`/private` root。Relative paths、其他 roots、URI-shaped paths 同 escaping/quoting edge cases 仲未有 comprehensive coverage。Source 只留本機，冇新增 upload route。

### 設定 (Configuration)

console 由 render screen 接收 line stream、dropped-line count、cap 同 height。預設 cap 係 10,000 行,預設 height 係一個 responsive viewport clamp。搜尋用共用嘅 settings field 加旁邊嘅 regex builder;預設係 plain text,invalid pattern 乜都唔 match。component 對 follow-scroll 動畫同自己嘅 indeterminate progress 都尊重 `prefers-reduced-motion`,並且用當前嘅英文、廣東話或者雙語語言模式。auto-scroll 一樣跟讀者揀咗嘅 funny level 同語言模式 — checkbox 自己個 tooltip 五個 level 兩種語言都有配好。

### 失敗模式

- 超出 cap 嘅行唔會靜靜雞當存在;dropped count 一直可見。
- detached(暫停咗)嘅讀者唔會畀 progress tick 拉返落底。
- console 入面有 active 文字選取嘅讀者唔會被捲走。
- copy/export 失敗會報一個 non-blocking notice,console 照用得。
- 一個已經唔再 mount 嘅 setting target 會報 unavailable,唔會扮開到。
- history store 被拒絕或者爆滿時,live console 照樣用得,會報 persistence failure,而受影響 record 會標示 unpersisted,唔會扮話已經 retain。
- invalid envelope/schema 會被忽略，唔會 partial apply；但真 process-crash 同 interrupted-write recovery 未跑。
- selected-line delete 同 current-render prune-all 都有 destructive confirmation 同 exact scope；multi-render bulk delete 同 configurable retention 仲未做。

### 安全考量

console 文字永遠以 text render,唔會以 HTML,所以 engine 輸出注入唔到任何 markup 入 app。export 係本地嘅,唔會上傳 log。搜尋受同一套本地 regex 限制約束,同其他 settings field 一樣。

### 驗證

Source 有 `RenderConsole.test.ts`、`annotations.test.ts`、`consoleModel.test.ts` 同 `consoleHistory.test.ts` cases，但呢個 records lane 冇跑 test、typecheck、build、packaged interaction 或 capture，所以新 version-2 storage verdict 仍然未驗。Issue #58 要等 focused verification 證明 immutable 512-line segment generations、injective render keys、index-before-cleanup ordering、legacy v1 migration、orphan-generation cleanup、partial write、storage refusal、Unicode、zero-width regex、24-render/200,000-line/8 MiB bounds、interruption、restart/reattach/completed-run reopening、exact metadata/export、redaction 同 destructive deletion。Packaged acceptance 仲要用真 app restart，重開 completed render，再搜尋同 export visible ring 之外嘅 line。舊 auto-scroll verification evidence 原樣保留；今次冇重跑或改寫嗰份歷史結果。

### 建議文章

- [Rendering on a remote host](./remote-render.md) — engine 經 SSH 行嗰陣,同一套進度同取消模型。
- [The regex builder and the search bars it reaches](./regex-builder.md) — 共用嘅搜尋 contract。
- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) — 失敗旁邊出現嘅 advice action。
