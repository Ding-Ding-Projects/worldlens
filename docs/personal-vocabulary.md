# Personal vocabulary

Your own words, substituted throughout the interface, from a file only you have.

## The control is always there

The settings surface always shows the upload control, even before any file exists. It is a
semantic file picker, keyboard and screen-reader operable, with honest states: no file,
loaded with a count, invalid with the reason, replace, and clear.

## The data only ever comes from you

Until you supply a valid file, every surface renders its original shipped wording,
unchanged. **No built-in mappings ship.** No samples, no templates, no defaults, no guesses.
Clearing purges the cache and restores the original wording immediately.

## What a file has to satisfy

The complete payload is validated before anything is displayed or cached, and a rejected
file **never applies partially**. Its only accepted top-level fields are `schemaVersion`, fixed
at `1`, and `entries`, a flat string-to-string object. Any extra top-level field is rejected.
If a private vocabulary service or another local tool uses a different internal representation,
it must normalize the file before the person chooses it here; WorldLens does not guess at legacy
or undocumented shapes.

- a hard byte ceiling
- a supported schema version, with an unknown version refused rather than guessed at
- maximum nesting depth
- bounded key and value lengths
- string-only replacement values
- no duplicate keys, no unsafe object keys, no control characters, and no unexpected fields

The current bounds are 256 KiB of UTF-8 input, depth 8, no separate entry-count ceiling, 160 Unicode code points per key,
and 1,000 Unicode code points per replacement. These limits apply before the candidate replaces an
existing valid cache, so an over-limit or malformed file cannot partially change active wording.

The desktop renderer, privileged persistence service and documentation settings share the pure
`@worldlens/shared/vocabulary` validator. Raw nesting is bounded before duplicate-key scanning,
including nested data hidden by a later duplicate property. Empty mappings are valid; total
UTF-8 bytes, rather than a separate entry-count ceiling, bound the number of entries.
The documentation surface translates rejection codes into its existing localized messages.

The cache is revalidated on every load and fails closed to the original wording when it is
missing, corrupt, stale or unsupported.

## It never leaves this computer

Parsing, validation, replacement and caching make **no network request**. Vocabulary terms,
mappings, payloads, the source filename and its path never reach logs, telemetry, exports,
history snapshots, crash reports, prompts or any public record. Exports state plainly that
they omitted the vocabulary rather than silently dropping it.

Replacements apply at the user-facing text boundary, including accessible names, and leave
commands, URLs, identifiers, code, file paths and factual external records verbatim.

The application's central localization catalogue applies replacements to the static parts of
its message templates before interpolation. Values supplied at runtime — including template
placeholders such as `{folder}`, paths, URLs, flags, counts, and identifiers — are kept
verbatim. Loading, replacing, or clearing a valid local file refreshes that catalogue in the
open application without sending the data anywhere.

## Verification

Bounds, malformed input, duplicate keys, partial-application refusal, persistence, replace,
clear, no-network behaviour, and absence from every export and log path.

## Issue #141 acceptance boundary

This article is the public compatibility record for the local upload contract. It does not
constitute packaged-runtime evidence. The implementation still needs focused verification in
the built application for the empty control, valid load, invalid and over-limit refusal,
replace, clear/reset, restart persistence, cache corruption, no-network behavior, and private
accessible-name handling. The evidence must come from the real packaged artifact and must not
contain vocabulary values, source paths, or payloads.

Issue #141 remains open until that implementation evidence is recorded. This records-only lane
does not claim tests, builds, runtime interaction, screenshots, captures, or release
verification.

### 廣東話 / Cantonese

呢篇係 Issue #141 本地 upload contract 嘅 public compatibility record，唔係 packaged runtime
evidence。Implementation 仲要喺真正 built app 驗 empty control、valid load、invalid/over-limit
拒絕、replace、clear/reset、restart persistence、cache corruption、no-network 同 private
accessible-name；evidence 唔可以帶 vocabulary value、source path 或 payload。

Issue #141 要等 implementation evidence 齊先可以 close。今次 records-only lane 冇聲稱 tests、
builds、runtime interaction、screenshots、captures 或 release verification 已完成。

## Suggested articles

- [Language modes and funny levels](language-and-tone.md) - the layer this sits on top of

## Drop a file anywhere in the application

Drop one personal-vocabulary JSON file anywhere in the application window, including over
nested panels. The window claims JSON before the world and schematic drop handlers. The
Settings upload remains available for keyboard and screen-reader users. Both routes validate
the complete file through the same validator and wait for local persistence before reporting
success. A refused file or failed write preserves the previously active wording.

A successful drop displays a non-blocking full-window headline for about three seconds. The
headline comes only from the imported entry for `private vocabulary`, or the localized neutral
“Personal wording applied” fallback. It is announced politely, never receives focus, never
blocks pointer input, and stays static when reduced motion is requested. Clearing the cache
removes the celebration too. Restricted mode suppresses this feature and its sounds.

The Settings row includes persisted mute and volume controls for vocabulary outcome sounds.
When supported by the desktop host, successful persistence plays the local operating-system
success sound and rejection plays its error sound. Quiet hours suppress playback. Hosts without
those sounds keep the visible result; playback failure never blocks loading or claims that a
sound played. Sound preferences contain no vocabulary content or source metadata.

### 廣東話：拖入檔案

可以喺程式視窗任何位置拖入一個個人詞彙 JSON 檔案，包括面板上面。視窗會先處理 JSON，
唔會交畀世界或者結構拖放處理器。設定入面嘅上載仍然可以用鍵盤同螢幕閱讀器操作。
兩條路線都用同一個完整驗證程序，等本機儲存成功先報告成功。拒絕檔案或者寫入失敗都保留原有字眼。

拖入成功會顯示約三秒嘅全視窗標題，唔會阻擋操作。標題只取自輸入檔案嘅
`private vocabulary` 項目，冇就用本地化嘅「已套用個人字眼」。螢幕閱讀器會禮貌讀出，
唔會搶焦點或者阻擋指標；減少動態效果時保持靜態。清除快取會同時清除提示。限制模式會停用呢個功能同音效。

設定列提供會記住選擇嘅詞彙結果音效靜音同音量控制。桌面主機支援時，儲存成功會播放本機
作業系統成功音效，拒絕會播放錯誤音效。安靜時段唔會播放。冇音效嘅主機仍然顯示結果；
播放失敗唔會阻止載入，亦唔會聲稱已播放。音效設定唔包含詞彙內容或者來源資料。

Clear waits for confirmed local removal. If removal fails, the previous wording remains active
and Settings explains the failure. Clear also cancels pending file reads and imports; an older
drop cannot restore wording after Clear or overwrite a newer Settings upload. Drop errors remain
in the application notification centre until dismissed.

清除會等本機確認刪除成功。如果失敗，原有字眼仍然生效，設定會解釋失敗原因。
清除亦會取消未完成嘅檔案讀取同匯入；舊拖放唔會喺清除之後還原字眼，亦唔會蓋過較新嘅設定上載。
拖放錯誤會留喺程式通知中心，直到使用者關閉。
