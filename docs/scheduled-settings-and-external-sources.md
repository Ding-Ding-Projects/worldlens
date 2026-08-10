# Scheduled settings and external sources

The documentation site can temporarily apply its real language and appearance settings from a
versioned schedule. A rule never rewrites the visitor's underlying preference: when it stops
matching, the next lower-priority match is evaluated, and the stored base returns only when no
candidate applies or an external lookup fails closed.

## Behaviour

Each rule has a stable ID, visible label, enabled state, priority, optional date range, start and end
time, timezone, and either every day or selected weekdays. Equal start and end times mean the full
selected day. A cross-midnight window belongs to the day on which it starts. Higher priority wins;
the later rule wins a priority tie.

The target picker is populated from the site's live settings declaration. Toggle, choice, number,
colour, font, and text values use the same bounds and options as the ordinary Settings surface.
Search and the command palette index both schedule destinations and teleport to the exact editor.

## Configuration

Open **Settings → Schedules**. Add a rule, choose its dates, times, timezone and weekdays, then add
one or more real settings. Choose one source per rule:

- **Values in this rule** applies the selected values directly.
- **Versioned JSON API** expects `{ "version": 1, "values": { ... } }` from an HTTPS URL (loopback
  HTTP is allowed for local development). Unknown or invalid setting IDs are not applied.
- **Home Assistant boolean entity** reads an `input_boolean.*` or `binary_sensor.*`. `on` applies
  the rule's values. `off` means that rule does not match, so evaluation falls through to the next
  lower-priority matching rule. Enter the token in the password field for the current page session;
  it lives only in memory and can be cleared per rule or all at once.

Rules export as UTF-8 JSON, import through the same validator, and retain a bounded 100-entry local
history. Restoring creates another history entry rather than rewriting the previous record.

## Failure modes

- Invalid IDs, dates, timezones, times, weekday sets, priorities, values, URLs, refresh intervals,
  entity IDs, and credential keys are named inline and the rule is not saved.
- External requests refuse non-loopback cleartext HTTP, URL credentials, fragments, redirects,
  responses above 64 KiB, authentication failures, rate limiting, malformed JSON, and timeouts over
  eight seconds.
- A newer refresh aborts and supersedes an older generation, so a slow response cannot overwrite a
  newer rule result.
- External failures restore the base layer, show a persistent non-blocking error notification, and
  leave **Refresh and apply now** beside the failing configuration.
- A reload, page close, **Clear this token**, or **Clear all session tokens** removes the in-memory
  token. The rule then reports `missing-token` until the visitor enters it again.

## Security considerations

Tokens are held only in a page-lifetime JavaScript map. They are absent from local storage, session
storage, the rule schema, browser exports, history, logs, URLs, and user-facing error text. Requests
omit ambient credentials, use manual redirect handling and a bounded body, and accept only
allowlisted setting IDs validated against the site's real schema. Schedule data remains in the
site's namespaced browser storage and is not transmitted unless the visitor configures an external
source.

## Verification

- `schedule.test.ts` covers dates, timezones, weekdays, cross-midnight and full-day windows,
  precedence, versioning, rule-count bounds, history/restore, API and Home Assistant validation,
  response bounds, cancellation, and base-value recovery.
- `scheduleHomeAssistant.integration.test.ts` drives a real loopback HTTP server for `on`, `off`
  fallthrough, unavailable and authentication responses, and proves the token is absent from
  persistence, export data and console output.
- `schedulePanel.test.ts` covers the real Schedules tab, guided controls, save/history, search and
  teleport destinations, rendered scheduled theme, the password input, clearing, and the
  session-only disclosure.
- `compact-proof.mjs` opens the built schedule editor at `390×844` bilingual, adds a rule, and fails
  on accidental overflow, clipped controls, undersized targets, a missing surface, or incorrect
  compact navigation state.
- Genuine headless capture: `docs/screenshots/pages-parity-schedule-390x844-bilingual.png` with its
  machine-readable record in `docs/runtime-proof/pages-parity-schedule-390x844-bilingual.json`.

## Suggested articles

- [Pages feature parity](pages-feature-parity.md)
- [Language and tone](language-and-tone.md)
- [Appearance editors](appearance-editors.md)
- [Notification centre](notification-centre.md)

## 廣東話

### 排程設定同外部來源（Scheduled settings and external sources）

文件網站可以按一份有版本嘅排程，暫時套用佢真實嘅語言同外觀設定。一條規則永遠唔會改寫訪客底層嘅偏好：當佢唔再符合嗰陣，就會評估下一條優先級較低嘅相符規則，而只有喺完全冇候選適用、或者外部查詢 fail closed 嗰陣，先會回到已儲存嘅基底值。

### 行為

每條規則都有一個穩定 ID、睇得見嘅標籤、啟用狀態、優先級、可選嘅日期範圍、開始同結束時間、時區，以及「每日」或者「指定星期幾」。開始同結束時間相同即係代表所選嘅整日。跨午夜嘅時段屬於佢開始嗰一日。優先級高嘅贏；優先級打和就後面嗰條規則贏。

目標揀選器係由網站即時嘅設定聲明填出嚟。Toggle、choice、number、colour、font 同 text 值用嘅界限同選項，同普通 Settings 介面一模一樣。搜尋同 command palette 兩者都會索引排程目的地，並且直接 teleport 去準確嗰個編輯器。

### 設定方法

開 **Settings → Schedules**。加一條規則，揀佢嘅日期、時間、時區同星期幾，再加一個或者多個真實設定。每條規則揀一個來源：

- **Values in this rule** 直接套用所選嘅值。
- **Versioned JSON API** 預期由一條 HTTPS URL 收到 `{ "version": 1, "values": { ... } }`（本機開發容許 loopback HTTP）。未知或者無效嘅設定 ID 唔會被套用。
- **Home Assistant boolean entity** 讀一個 `input_boolean.*` 或者 `binary_sensor.*`。`on` 就套用嗰條規則嘅值。`off` 即係嗰條規則唔符合，於是評估會落去下一條優先級較低嘅相符規則。個 token 喺密碼欄位輸入，只限當前頁面 session；佢淨係活喺記憶體，可以逐條規則清除或者一次過全部清除。

規則可以匯出成 UTF-8 JSON、經同一個驗證器匯入，並保留一份有上限嘅 100 項本機歷史。還原會另外開一個歷史項目，而唔會改寫之前嗰個紀錄。

### 失敗模式

- 無效嘅 ID、日期、時區、時間、星期集合、優先級、值、URL、refresh interval、entity ID 同憑證 key，都會就地具名指出，而嗰條規則唔會被儲存。
- 外部請求會拒絕：非 loopback 嘅明文 HTTP、URL 入面帶憑證、fragment、redirect、超過 64 KiB 嘅回應、認證失敗、rate limiting、格式錯嘅 JSON，以及超過八秒嘅逾時。
- 較新嘅 refresh 會中止並取代較舊嗰一代，所以一個慢回應唔可能覆蓋一個更新嘅規則結果。
- 外部失敗會還原基底層、顯示一個持續但唔阻擋操作嘅錯誤通知，並喺失敗嗰份設定隔籬留低 **Refresh and apply now**。
- 重新載入、閂咗個頁、**Clear this token** 或者 **Clear all session tokens** 都會移除記憶體入面嗰個 token。之後嗰條規則會報 `missing-token`，直到訪客再輸入一次。

### 保安考量

Token 淨係揸喺一個頁面生命週期嘅 JavaScript map 入面。佢唔會出現喺 local storage、session storage、規則 schema、瀏覽器匯出、歷史、log、URL，或者畀用戶睇嘅錯誤文字度。請求唔會帶 ambient credentials、用手動 redirect 處理同有上限嘅 body，而且只接受喺網站真實 schema 度驗證過嘅允許清單設定 ID。排程資料留喺網站有命名空間嘅瀏覽器儲存度，除非訪客自己設定咗外部來源，否則唔會傳送出去。

### 驗證

- `schedule.test.ts` 覆蓋日期、時區、星期幾、跨午夜同整日時段、優先次序、版本控制、規則數量上限、歷史／還原、API 同 Home Assistant 驗證、回應上限、取消，以及基底值回復。
- `scheduleHomeAssistant.integration.test.ts` 行一個真實 loopback HTTP server，測試 `on`、`off` 落到下一條、unavailable 同認證回應，並且證明個 token 唔會出現喺持久化資料、匯出資料同 console 輸出度。
- `schedulePanel.test.ts` 覆蓋真實嘅 Schedules 分頁、導引式控制項、儲存／歷史、搜尋同 teleport 目的地、render 出嚟嘅排程主題、密碼輸入框、清除，以及「只限 session」嘅披露文字。
- `compact-proof.mjs` 喺 `390×844` 雙語之下開已 build 嘅排程編輯器、加一條規則，並且喺意外溢出、控制項被裁切、目標太細、介面缺失或者 compact 導覽狀態唔啱嗰陣令測試失敗。
- 真實 headless 截圖：`docs/screenshots/pages-parity-schedule-390x844-bilingual.png`，連埋佢喺 `docs/runtime-proof/pages-parity-schedule-390x844-bilingual.json` 嘅機器可讀紀錄。

### 建議文章

- [Pages feature parity](pages-feature-parity.md)
- [Language and tone](language-and-tone.md)
- [Appearance editors](appearance-editors.md)
- [Notification centre](notification-centre.md)
