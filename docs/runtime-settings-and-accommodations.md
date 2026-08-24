# Runtime settings and accommodations

This article documents the desktop runtime settings surface added in the universal runtime-settings wave.

## Status Hub

The Settings panel includes a factual Status Hub tab. It reports the persisted settings format version, schedule count, speech-synthesis availability and voice count, configured external sources, and whether authenticated Status Hub delivery is available. When that delivery route is absent, the panel says so and does not render a send action. Local records remain useful without pretending that a message reached another service.

## Narrator

Narration is off by default. When enabled, the user chooses English, Cantonese, or Both. Both is serialized as English followed by Cantonese. The voice list is enumerated from the current computer, including late `voiceschanged` updates. The persisted choice uses a stable voice URI when the platform provides one and keeps an unavailable choice rather than silently replacing it. The panel reports fallback, local, or network-backed status, and exposes rate and pitch. A bounded per-category queue replaces stale queued messages, and quiet mode yields to reduced-sound or assistive-technology ownership.

## Scheduled settings

Rules are versioned, bounded and validated before persistence. They can target language, theme, density, accent, font family, font size, motion, or display name. Every rule has a stable id, priority, local-time start and end, optional dates, optional weekday selection, and a source. Local rules apply deterministically by priority and then id. Cross-midnight windows are supported. External sources accept only HTTPS, with loopback HTTP reserved for development, and have a five-second timeout, a 512 KiB response cap, redirect rejection, and an allowlist of appearance fields. Home Assistant rules require a boolean entity id and a credential-vault reference. A validated external value is temporary and never overwrites the recoverable local base.

The settings surface states that times use the computer's local timezone. Daylight-saving transitions follow the platform's local clock. An invalid or incomplete date, time, source URL, entity id, or vault reference is rejected beside the editor rather than guessed.

## Attention modes

Focus, Low stimulation, Time awareness, One thing at a time, and Momentum are five separate switches. They are all off by default, persist independently, and use factual, non-medical copy. Focus does not hide content, Low stimulation reduces non-essential motion and notices, Time awareness shows elapsed time, One thing at a time keeps one user-chosen next action visible, and Momentum supplies a dismissible idle prompt. These modes do not diagnose or assess a person.

## Search, history and verification

The panel has its own plain-text-first search field and an adjacent anchored full regex builder. Search results open the owning tab, and accommodation results expose a live checkbox directly in the result. Every saved change records changed field names in the local runtime history store without credentials or external values. The hand-written inventory is `design/packages/ui/src/components/runtimeSettings/completeness.ts`; focused tests cover bounded parsing, cross-midnight matching, deterministic precedence, local history and external-source failure states.

Built-artifact capture evidence is intentionally marked pending in the inventory until the final Windows headless smoke wave records the real runtime-settings tab at the exact integrated commit.

## Suggested articles

- [Scheduled settings and external sources](scheduled-settings-and-external-sources.md)
- [Command palette](command-palette.md)
- [Language and tone](language-and-tone.md)

## 廣東話

### Status Hub

設定面板有一個實事求是嘅 Status Hub 分頁，顯示設定格式版本、排程數量、語音合成可用性同語音數量、外部來源數量，以及認證 Status Hub 傳送路徑係咪存在。傳送路徑不存在，就清楚講明，唔會畫一粒假裝送出嘅掣。

### 旁白

旁白預設關閉。開啟之後可以揀英文、廣東話，或者 Both。Both 會先講英文，再順序講廣東話。語音由本機即時列出，遲到嘅 `voiceschanged` 更新都會跟進。保存嘅係穩定語音識別，語音唔喺本機時會保留選擇並講明後備狀態。速率、音調、安靜模式、佇列取代同輔助科技讓路都係實際設定。

### 排程設定

排程有版本、有上限，儲存之前會完整驗證。可以安排語言、主題、密度、主色、字體、字體大小、動態效果或者顯示名稱。每條規則有穩定識別碼、優先次序、本地時間、日期、星期同來源。跨午夜時間窗可用，規則撞車時先比優先次序，再用識別碼穩定決定。外部來源只准 HTTPS，開發用 HTTP 只限本機，回應有時間、大小、重新導向同欄位限制。Home Assistant 要有布林實體同憑證庫參照，外部值只係暫時套用，唔會覆蓋本地底稿。

### 注意力模式

Focus、Low stimulation、Time awareness、One thing at a time、Momentum 係五個獨立掣，預設全部關閉。佢哋係介面方便功能，唔係醫療判斷，亦唔會將內容收埋到搵唔返。

### 搜尋、歷史同驗證

面板有自己嘅普通文字搜尋，同一個貼住搜尋框嘅完整 regex builder。結果可以直接開返所屬分頁，注意力模式結果仲可以即場調校。每次保存會將改動欄位寫入本地歷史，唔會寫憑證或者外部內容。真正整合版本嘅 Windows headless capture 會喺最後 smoke wave 補入 inventory，未有之前唔扮完成。

### 建議文章

- [排程設定與外部來源](scheduled-settings-and-external-sources.md)
- [Command palette](command-palette.md)
- [語言與語氣](language-and-tone.md)
