# The notification centre

A toast is a message that leaves. That is the point of it, and it is also the problem with it:
the one notice worth reading twice is reliably the one that scrolled past while somebody was
looking at the map. The centre is where it goes.

The code is `design/packages/ui/src/components/notifications/`. The queue, its levels, its
timings and its bounded history stay in `components/config/notifications.ts`; nothing in the
centre owns state.

## Behaviour

### The bell, and the panel behind it

`NotificationCentre` is the whole feature: a bell with a count, and the reviewable history
behind it. It is mounted inside the notification corner, which is where the bell already appeared
and where somebody looks when a toast has gone, so a shell that mounts that one corner gets this
without a second mount.

- **The badge is the unread count while there is one**, meaning notices raised since the panel
  was last opened. With nothing unread it falls back to the size of the history, so the control
  still says what it holds rather than reading as an empty button.
- **Opening it is what marks the history read.** Not a timer and not a hover: the badge means
  "raised since you last looked", and only looking can clear it.
- **It opens upward and inward from the corner**, so it never covers the button that opened it,
  and it closes on Escape and on a click outside, both of which return focus to the bell.
- **It is a panel, not a dialog.** Nothing in it is a decision, so nothing in it blocks; the map
  keeps working underneath. The only surfaces in this application that block are the ones that
  genuinely cannot continue without an answer, and a list of things that already happened is not
  one of them.

### What a notice keeps

Every notice raised this session, with its level, title, body, detail, timestamp and the actions
it offered. **Restoring one puts that same notice back in the corner with its actions attached**,
so a retry dismissed by a stray click is one press away rather than gone. A notice that is
already showing says so rather than offering a button that would do nothing.

### Finding one again

- **A search bar**, which is the settings editor's own `ConfigSearchField` with the regex builder
  anchored beside it, always visible above the rest of the filters because it is the control most
  people reach for first. Reusing it is not only less code: it is the only way a pattern built
  here is guaranteed to behave the way one built in the options search behaves, because it is the
  same field over the same engine.
- **A collapsible Filters row**, starting collapsed the same way `HistoryPanel.vue`'s own filter
  row does — it describes the history rather than changing it until somebody opens it, and a
  badge on the toggle names how many of the three filters (search, date range, level) are active,
  so a collapsed row never hides an active filter silently. Opening it reveals:
  - **A date range**, the same anchored `ChangelogDateFilter` calendar the changelog viewer and
    the config-folder history panel both use: month and year jump, range selection, named
    presets, and two typed fields that accept the locale's date format and a plain ISO date
    alongside it. An invalid or partial typed date is reported inline without discarding what was
    typed, and typing and the calendar stay in step.
  - **Filter chips, one per level**, in severity order: error, warning, success, information.
    Somebody opening the centre after something went wrong is looking for the failure, and a row
    that leads with information makes them read past three chips to reach it. Each chip carries
    its count, and **every level is present even at zero**, because a control that vanishes when
    its count reaches zero is a control the user cannot find again when it stops being zero.
    Nothing selected means every level, because a filter row with nothing pressed is a user who
    has not filtered rather than one who asked to see nothing.
  - **A Clear every filter button**, shown only once a filter is active, that resets the search,
    the levels and the date range together.
- **All three compose** rather than one overriding another - narrowing the date range never
  clears the search, pressing a level chip never clears the date range, and the reverse - and the
  count line above the list says how many of how many are showing. The empty state names all
  three: "No notification matches this search, these levels and this date range," never a bare
  "no results" that leaves a stale filter invisible.

A search is tested against the level name, the timestamp, the title, the body, the detail and
every action label, joined into one line per notice. The level name is in because "error" is what
somebody types before they notice the chips; the timestamp is in because `2026-08-04` is how a
session gets narrowed to an afternoon without a date picker in the way; the detail is in because
a stack trace is often the only place a file name appears. That same one-line-per-notice text is
what the regex builder previews against, so what the builder highlights is literally what the
filter tests. The date range reads a notice's own timestamp in the reader's local timezone
(`noticeCentre.ts`'s `noticeDay`), the same way `historyModel.ts`'s `revisionDay` does for the
version-history panels, and a notice whose timestamp cannot be read is kept rather than hidden by
a date filter that was never meant to be the only way to find it again.

### Copying it out

The copy action writes the filtered view as Markdown, carrying each notice's level and timestamp,
so a pasted extract still says what happened and when. It exports what the panel is showing,
filter and search included: an export that quietly widened to everything would be an export
nobody can use to report what they were looking at.

## Configuration

| Setting | Value | Where |
|---|---|---|
| Information dismisses itself after | 5 seconds | `INFO_TIMEOUT_MS` |
| Success dismisses itself after | 4 seconds | `SUCCESS_TIMEOUT_MS` |
| Warning and error | Never dismiss themselves | A failure that auto-dismisses is a failure nobody read |
| History kept | The most recent 50 notices of the session | `HISTORY_LIMIT` |

None of these is user-configurable, and the history is per session rather than persisted: it is a
record of what this run of the application reported, not a log.

## Failure modes

- **A message is raised while nothing is mounted.** It is still recorded in the history, which is
  the difference between a queue and a component.
- **An invalid pattern matches nothing** rather than falling back to everything, so a search
  nobody can see is never left showing results.
- **A history longer than the panel** scrolls inside the panel rather than off the screen. The
  bound is asserted from the stylesheet, because jsdom computes no layout.
- **Nothing has happened yet.** The panel says so, and that state is deliberately distinct from
  "your filter matched nothing" so a user can tell which of the two they are looking at.
- **A restore of a notice that is already on screen** is refused with a sentence rather than
  offered as a button that does nothing.

## Security considerations

Nothing here reaches the network, and nothing is persisted. The search runs on the local `RegExp`
engine under the bounds `components/config/regexEngine.ts` states (512-character pattern,
20000-character sample, 500 matches, 100 ms per preview run); no pattern, sample or export is
transmitted or written to storage.

A notice carries text the application composed. Where a message quotes a subsystem, the quoting
happens where that subsystem's errors are already turned into sentences, so nothing arrives at the
corner as a raw stack. The centre renders that text as text; it never interprets it as markup.

The copy action is a deliberate export of session diagnostics. It carries exactly what the panel
is showing, so the user can see what they are about to paste before they paste it, which matters
because a detail line can contain a local path.

## Accessibility

The panel is a named region rather than an unlabelled card. The level filters are a named group
of real buttons, each announcing whether it is pressed. Every control in the panel is a button
and is therefore keyboard reachable, the icon-only close control is labelled, and closing emits an
event so the surface that opened it returns focus to the bell. In the corner itself, arrivals are
announced politely rather than interrupting, a failure is an alert rather than a status, the
dismiss control has a 40 pixel target, the stack is a flow column so two notices cannot overlap,
pointer events pass through everywhere except the toasts themselves, and both surfaces respect a
reduced-motion preference.

## Verification

| Test | What it holds |
|---|---|
| `noticeCentre.test.ts` | What a search reads, that one notice stays one line, that an empty level selection means everything, that the filters compose rather than override, that an uncompilable pattern matches nothing, that every level is counted even at zero, that the export carries level and timestamp and honours the filter, and (new) that the date range narrows to the days inside it, composes with the search and the levels, keeps a notice whose timestamp cannot be read, and reads the same local day `noticeDay`/`daysWithNotices`/`noticeHistorySpan` mark on the calendar. |
| `NoticeCentrePanel.test.ts` | Mounted: the history newest first with its actions intact, search over body and detail with an honest count line, the shared search field rather than a rebuilt one, the builder previewing against real history, no-match distinguished from nothing-to-show, level chips with counts and pressed state, restoring a notice with its id and actions, the region/group/control labelling, and (new) the Filters row starting collapsed with an honest badge, the date calendar narrowing the list and composing with an active search without clearing it, the three-filter empty state, and one button clearing search, levels and dates together. |
| `notificationContract.test.ts` | Mounted: every level reaches the corner and none reaches a dialog, information and success take themselves away while warning and error do not, several stack as siblings, a dismissed notice stays in the history, and the bell is present with the history behind it. |
| `notificationPolicy.test.ts` | Source policy: every blocking surface in the package is declared with the decision it asks for, the notification path itself holds none of them, nothing in the package asks for payment, sponsorship, a rating, a subscription or an upgrade, and the corner's layout guarantees are read out of the stylesheet. |

Run them with `npx vitest run packages/ui/src/components/notifications` from `design/`.

## Suggested reading

- [The regex builder and the search bars it reaches](./regex-builder.md), which supplies this
  panel's search.
- [Changelog and the in-app changelog viewer](./changelog-viewer.md), which supplies this panel's
  date range - the same anchored calendar, reused rather than rebuilt.
- [Local version history for config folders](./config-history.md), whose own filter row -
  search, date range, action chips, all composing - this one was modelled on.
- [The command palette](./command-palette.md), the other route to something whose name you know.
- [Super confirmation](./super-confirmation.md), for the opposite rule: what does block, and why.

## 廣東話

### 通知中心 (The notification centre)

Toast 就係一個會走嘅訊息。呢個係佢嘅重點，同時亦係佢嘅問題：最值得睇兩次嗰個通知，例牌就係喺你望住個地圖嗰陣飄咗過去嗰個。通知中心就係佢去咗嘅地方。

程式碼喺 `design/packages/ui/src/components/notifications/`。個 queue、佢啲級別、時間設定同有上限嘅歷史紀錄，全部留喺 `components/config/notifications.ts`；通知中心入面冇任何嘢持有狀態。

### 行為

#### 個鈴，同埋佢後面塊面板

`NotificationCentre` 就係成個功能：一個帶計數嘅鈴，加上佢後面可以翻睇嘅歷史。佢掛喺 notification corner 入面，即係個鈴本來出現嗰個位、亦係 toast 走咗之後人會望嗰個位，所以只要 shell 掛咗嗰一個角落，就唔使再掛第二次都有呢樣嘢。

- **有未讀嗰陣，個 badge 就係未讀數**，即係塊面板上次打開之後先出現嘅通知。冇未讀嗰陣就退返去顯示歷史嘅數量，令個控制仍然講出佢裝住乜，唔會睇落似個空掣。
- **打開佢先算將歷史標記為已讀。** 唔係計時器，亦唔係 hover：個 badge 意思係「你上次望完之後出現嘅」，所以只有望先清得到。
- **佢由角落向上、向內展開**，所以永遠唔會遮住打開佢嗰個掣；撳 Escape 或者撳出面都會閂，兩者都會將焦點交返畀個鈴。
- **佢係一塊 panel，唔係 dialog。** 入面冇任何嘢係一個決定，所以入面冇任何嘢會阻塞；地圖喺底下照樣運作。本應用程式入面會阻塞嘅界面，只有嗰啲冇答案就真係繼續唔到嘅；一份已經發生咗嘅事嘅清單，唔屬於嗰類。

#### 一個通知會保留啲乜

呢個 session 出現過嘅每一個通知，連同佢嘅級別、標題、內文、細節、時間戳，以及佢曾經提供過嘅動作。**還原一個通知，會將同一個通知連埋佢啲動作擺返落個角落**，所以一個被誤撳關咗嘅重試，撳一下就返返嚟，唔係就此消失。已經喺度顯示緊嘅通知會直接講明，而唔係畀你一個撳咗都冇作用嘅掣。

#### 點樣再搵返佢

- **一條搜尋欄**，即係設定編輯器自己嗰個 `ConfigSearchField`，隔籬錨住個 regex builder，永遠顯示喺其他篩選之上，因為佢係大部分人第一時間會用嘅控制。重用佢唔只係少寫代碼：呢個係唯一方法保證喺呢度砌嘅 pattern，行為同喺選項搜尋度砌嘅完全一樣，因為根本係同一條欄、同一個引擎。
- **一行可摺疊嘅 Filters**，同 `HistoryPanel.vue` 自己嗰行篩選一樣預設摺埋 —— 佢係描述份歷史，而唔係喺有人打開佢之前就改變佢；切換掣上面有個 badge 講明三個篩選（搜尋、日期範圍、級別）之中有幾多個生效緊，所以摺埋咗嗰行永遠唔會靜靜雞藏住一個生效中嘅篩選。打開之後見到：
  - **一個日期範圍**，即係 changelog viewer 同 config-folder 歷史面板都用嘅同一個錨定 `ChangelogDateFilter` 日曆：可以跳月跳年、選範圍、有具名 preset，同兩個可以打字嘅欄位，接受本地語系嘅日期格式，亦同時接受純 ISO 日期。打錯或者打一半嘅日期會即場報出嚟，唔會將你打咗嘅嘢掉走，而打字同日曆兩邊會保持同步。
  - **每個級別一粒篩選 chip**，按嚴重程度排：error、warning、success、information。出咗事之後打開通知中心嘅人係搵緊嗰個失敗，如果一行 chip 由 information 打頭，佢就要讀過三粒先去到。每粒 chip 帶住自己嘅數量，而且**就算係零都會出齊每一個級別**，因為一個數量歸零就消失嘅控制，等於用家喺佢唔再係零嗰陣搵唔返。乜都冇揀就等於全部級別，因為一行乜都冇撳嘅篩選，代表個用家冇篩選過，而唔係佢要求乜都唔睇。
  - **一個 Clear every filter 掣**，淨係喺有篩選生效嗰陣先出現，一次過重設搜尋、級別同日期範圍。
- **三者係疊加而唔係互相覆蓋** —— 收窄日期範圍永遠唔會清走搜尋，撳級別 chip 永遠唔會清走日期範圍，反過來一樣 —— 而清單上面嗰行計數會講明總共幾多之中而家顯示緊幾多。空狀態會三樣都講埋：「No notification matches this search, these levels and this date range.」，唔會淨係一句「無結果」而令一個過期嘅篩選變咗隱形。

搜尋會對級別名、時間戳、標題、內文、細節同每一個動作標籤做測試，每個通知拼成一行。級別名要計入，係因為人未留意到啲 chip 之前，第一樣就會打「error」；時間戳要計入，係因為打 `2026-08-04` 就係唔使開日期選擇器都將一個 session 收窄到一個下晝嘅方法；細節要計入，係因為 stack trace 好多時係唯一有檔案名出現嘅地方。而 regex builder 預覽時對住嘅，都係同一份「每個通知一行」嘅文字，所以 builder 高亮嘅嘢，字面上就係篩選會測試嘅嘢。日期範圍係用讀者本地時區去讀通知自己嘅時間戳（`noticeCentre.ts` 嘅 `noticeDay`），同 `historyModel.ts` 嘅 `revisionDay` 為版本歷史面板做嘅一樣；而時間戳讀唔到嘅通知會保留，唔會畀一個本來就唔應該係唯一搵返佢嘅途徑嘅日期篩選收埋。

#### 抄出嚟

複製動作會將篩選後嘅檢視寫成 Markdown，每個通知都帶埋級別同時間戳，所以貼出去嘅摘錄仍然講得清發生咗乜同幾時發生。佢匯出嘅係面板而家顯示緊嘅嘢，連篩選同搜尋一齊計：一個靜靜雞擴闊成全部嘅匯出，冇人可以攞嚟講返自己當時望緊乜。

### 設定

Information 通知 5 秒之後自己消失（`INFO_TIMEOUT_MS`），success 4 秒（`SUCCESS_TIMEOUT_MS`），而 warning 同 error 永遠唔會自己消失 —— 一個會自動消失嘅失敗，就係冇人讀過嘅失敗。歷史保留呢個 session 最近 50 個通知（`HISTORY_LIMIT`）。

呢啲全部都唔畀用家設定，而歷史係逐 session 嘅、唔會持久化：佢係呢一次執行期間應用程式報告過乜嘅紀錄，唔係一份 log。

### 失效情況

- **喺乜都未掛載嗰陣出現咗一個訊息。** 佢一樣會記錄入歷史 —— 呢個就係 queue 同 component 嘅分別。
- **無效嘅 pattern 乜都對唔到**，而唔係退返去顯示全部，所以一個冇人睇得到嘅搜尋，永遠唔會留低一堆結果喺度。
- **歷史長過塊面板**嗰陣會喺面板入面捲動，唔會捲出畫面外。呢個上限係由樣式表度斷言，因為 jsdom 唔會計算 layout。
- **仲未發生過任何嘢。** 面板會講明，而呢個狀態特登同「你嘅篩選乜都對唔到」分開，令用家分得出自己而家望緊邊一種。
- **還原一個已經喺畫面上嘅通知**會用一句說話拒絕，而唔係畀你一個撳咗都冇作用嘅掣。

### 安全考量

呢度冇任何嘢會掂網絡，亦冇任何嘢會持久化。搜尋行本機 `RegExp` 引擎，喺 `components/config/regexEngine.ts` 訂明嘅界限之內（pattern 512 字、樣本 20000 字、500 個 match、每次預覽 100 ms）；冇任何 pattern、樣本或者匯出會被傳送或者寫入儲存。

一個通知帶住嘅係應用程式自己組成嘅文字。當一個訊息引述某個子系統，引述嘅動作發生喺嗰個子系統嘅錯誤本來就變成句子嘅地方，所以冇任何嘢會以裸 stack 嘅形式去到個角落。通知中心係將嗰啲文字當文字渲染；佢永遠唔會當佢係 markup 去解讀。

複製動作係一次刻意嘅 session 診斷匯出。佢帶嘅就係面板顯示緊嘅嘢，令用家喺貼出去之前睇得到自己就快貼乜 —— 呢點好重要，因為一行細節可能含有本機路徑。

### 無障礙

塊面板係一個具名區域，唔係一張冇標籤嘅卡。級別篩選係一組有名、由真掣組成嘅嘢，每一粒都會宣告自己係咪撳咗落去。面板入面每一個控制都係掣，所以鍵盤全部到得；純圖示嘅關閉控制有標籤；關閉時會 emit 一個事件，等打開佢嗰個界面將焦點交返畀個鈴。喺角落本身，新到嘅通知係禮貌噉宣告而唔會打斷人，失敗係 alert 而唔係 status，關閉控制有 40 像素嘅點擊目標，成疊嘢係 flow column 所以兩個通知唔會重疊，除咗 toast 本身之外所有位置嘅 pointer event 都會穿過去，而兩個界面都尊重 reduced-motion 偏好。

### 驗證

原文嗰個表逐個測試檔講咗守住乜，重點如下。`noticeCentre.test.ts` 守：搜尋讀啲乜、一個通知維持一行、級別揀空等於全部、篩選係疊加而唔係覆蓋、編譯唔到嘅 pattern 乜都對唔到、每個級別就算零都會計、匯出帶級別同時間戳並且遵從篩選；新加嘅仲有日期範圍收窄到範圍內嘅日子、同搜尋及級別疊加、保留時間戳讀唔到嘅通知，以及 `noticeDay`／`daysWithNotices`／`noticeHistorySpan` 喺日曆上標示嘅本地日子一致。

`NoticeCentrePanel.test.ts` 係掛住測：歷史最新排先而動作完好、搜尋涵蓋內文同細節並有老實嘅計數行、用共用嘅搜尋欄而唔係重砌一個、builder 對住真實歷史做預覽、「對唔到」同「乜都未有」分得開、級別 chip 帶計數同按下狀態、還原通知連 id 同動作、區域／群組／控制嘅標籤；新加嘅仲有 Filters 行預設摺埋兼有老實 badge、日期日曆收窄清單並同生效中嘅搜尋疊加而唔清走佢、三重篩選嘅空狀態，以及一個掣一次過清走搜尋、級別同日期。

`notificationContract.test.ts` 係掛住測：每個級別都去到角落、冇一個去咗 dialog，information 同 success 會自己走而 warning 同 error 唔會，多個通知會做兄弟節點疊起，關咗嘅通知仍然留喺歷史，而個鈴存在、後面有歷史。`notificationPolicy.test.ts` 守原始碼層面嘅政策：package 入面每一個會阻塞嘅界面都要宣告佢問緊咩決定、通知本身條路徑一個都冇、package 入面冇任何嘢要求付款／贊助／評分／訂閱／升級，而角落嘅版面保證係由樣式表讀返出嚟。

喺 `design/` 執行：`npx vitest run packages/ui/src/components/notifications`。

### 建議延伸閱讀

- [The regex builder and the search bars it reaches](./regex-builder.md) —— 佢供應呢塊面板嘅搜尋。
- [Changelog and the in-app changelog viewer](./changelog-viewer.md) —— 佢供應呢塊面板嘅日期範圍，同一個錨定日曆，重用而唔係重砌。
- [Local version history for config folders](./config-history.md) —— 佢自己嗰行篩選（搜尋、日期範圍、動作 chip，全部可疊加）就係呢一行嘅原型。
- [The command palette](./command-palette.md) —— 另一條通往你已經知道名嘅嘢嘅路。
- [Super confirmation](./super-confirmation.md) —— 相反嘅規矩：咩嘢真係會阻塞，同埋點解。
