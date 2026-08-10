# Super confirmation for destructive actions

Two independently operated keys, and then a slider that has to travel its whole range, before
anything irreversible happens. The gate lives in the application's own interface, names the exact
thing it is about to destroy, and always offers a way out.

The code is `design/packages/ui/src/components/confirm/` for the rule, with two presentations of
it: `components/config/ConfigSuperConfirm.vue` (anchored beside the control it guards) and
`components/menu/MenuSuperConfirm.vue` (modal, for a narrow sheet with nowhere to anchor a second
surface).

## Behaviour

### One state machine, two cards

The contract is a list of things that must be true at the moment a destructive action fires, and
those are properties of a small state machine rather than of a card layout. So the rule lives in
`createSuperConfirmGate` once and the two components are two skins over it. Two presentations of
one rule is the shape that goes wrong: when the rule lives in each component, the first fix lands
in one of them, the other keeps the bug, and there is nothing to look at that says which is right.

What the factory is responsible for, each of which is a test next door:

- **Untouched, the gate is locked** and the slider cannot move at all.
- **One key alone does not arm it.** Neither does the same key twice, because they are two
  separate booleans rather than a counter.
- **A slider let go before the end springs back to the start**, so a slip cannot destroy anything
  and a half-finished drag cannot be resumed by a second, smaller one.
- **Turning a key back off mid-travel disarms and resets**, rather than leaving a gate that is
  visually locked and internally most of the way to firing. That happens in the setter rather than
  in a watcher: a watcher runs on the next flush, and in that window there is a gate that reads as
  locked and is one nudge from completing.
- **Authorisation happens exactly once.** A slider that keeps reporting values after it hits the
  end must not fire a second delete, and Vuetify emits on both drag and keyboard, so that is
  reachable.

`travel` is read-only from outside and everything that moves it goes through `travelTo`, which is
where the arming is checked, so there is no second route by which a slider could arrive at the end
without passing the two keys.

The four phases are `locked`, `armed`, `moving` and `authorized`, deliberately four states rather
than a pair of booleans: "armed but not moving" and "armed and moving" need different copy, one
saying what to do next and the other reporting progress, and a component asking
`armed && travel > 0` in three places is a component where the three answers eventually disagree.

### After it fires

The completed gate holds for `GATE_COMPLETION_HOLD_MS` and then closes itself. The contract asks
for a distinct completion animation *and* for focus to return to the control that opened the gate,
and those pull in opposite directions: a surface that closes the instant the slider lands shows no
completion at all, and one that waits for a click leaves a keyboard user stranded in a card whose
only remaining control is an exit that no longer exits anything.

`returnFocusTo` puts focus back on the originating control whether the gate completed or was
escaped. It is the part that is easy to leave out because nothing looks wrong without it: a
sighted mouse user never notices, while somebody driving the keyboard finds that cancelling drops
focus onto the document body and the next Tab starts again from the top of the page, several
screens away from the button they were standing on.

### The inventory, which is how a new delete cannot slip past

"Every destructive action is behind the gate" is a claim about the next delete button as much as
about the ones that exist, so it is enforced as an inventory rather than by remembering.
`superConfirmPolicy.test.ts` walks every source file in the package looking for destructive call
sites: anything shaped `deleteSomething(`, `removeSomething(`, `purgeSomething(` and so on, caught
by naming convention rather than by a list of known primitives, plus the handful whose names do
not follow the convention (signing out, resetting every setting, forgetting a stored directory,
running a bulk close, stopping work in flight, emptying web storage).

Every file that contains one is declared with how many it holds, what it destroys in the words a
user would recognise, and where it stands. The standings are a closed set, so the justification is
checkable rather than a sentence somebody wrote to make a test pass:

| Standing | Means |
|---|---|
| `gated` | The gate stands in front of it. The declaration names the file holding that gate, which is not always the file making the call. |
| `type-only` | A declaration of a host method rather than a call to one. |
| `buffer` | Mutates the unsaved in-memory workspace. Nothing has left the disk and the apply dialog names every file that would actually be deleted, before anything is. |
| `reversible` | The user can put the state straight back through the same control. |
| `resumable` | Survivable rather than destructive: what was already produced is kept and the work resumes from it. |
| `unwired` | Model code with no user-facing caller yet. The gate is owed by whoever wires it. |
| `gap` | Shipped, reachable, and not behind the gate. A defect, named as one. |

Inventing a sixth excuse means editing the union type, which shows up in the diff. The counts are
declared per file too, so a second delete cannot hide beside an already-declared one. Gaps are
listed a second time in a short list a reviewer reads in full: a gap nobody wrote there fails, and
a gap that was fixed and left there fails too.

### What is gated today

| Destructive action | Gate |
|---|---|
| Removing a saved map or server profile | `components/ProfileManager.vue` |
| Deleting a user-saved appearance preset | `components/appearance/AppearanceEditor.vue` |
| Deleting a map config | `components/config/MapsScreen.vue` |
| Deleting a storage config | `components/config/StoragesScreen.vue` |
| A save whose plan takes config files off the disk | `components/config/ConfigApplyDialog.vue` |
| Clearing every saved viewer setting | `components/menu/SettingsMenu.vue` |
| Closing many tabs at once | `components/tabs/TabClosePanel.vue` |

### The gaps, stated rather than hidden

Signing out of GitHub revokes the stored token and, when GitHub honours the revocation, the grant
on the account. It is confirmed inline in two steps with focus return, and it is **not** behind the
two-key gate. Both the row and the primitive behind it are declared as `gap` and are tracked under
the project's issue for this contract. This document says so because an inventory whose defects are
invisible is an inventory that has stopped being useful.

## Configuration

| Constant | Value | Why |
|---|---|---|
| `GATE_TRAVEL_START` | 0 | Where the slider starts and what it springs back to |
| `GATE_TRAVEL_END` | 100 | A gate that fires at 90% is a gate whose last tenth is decoration |
| `GATE_COMPLETION_HOLD_MS` | 900 | Long enough to show completion, short enough not to strand a keyboard user |

None of these is user-configurable. The facts the gate shows are not configurable copy either: the
exact action, the exact affected data, and what is irreversible about it are the reason the gate
exists. Tone follows the language mode and both funny levels like everything else, and the
[voice-not-facts rule](./language-and-tone.md) is what keeps the naming intact at every level.

Each gate is required, in source, to still contain every part the contract lists: a first key, a
second independent key, a full-range slider, that slider disabled until both keys are turned, a
progress animation while it travels, a distinct completion animation, an Emergency exit, an Escape
path, focus returned on close, a live status region, an accessible name on the surface, on the
slider and a spoken position for it, a reduced-motion block, and a 40 pixel Emergency exit target.
Each of those is a thing that can be deleted without breaking anything that *looks* broken, which
is why they are asserted by name.

## Failure modes

- **A partial slider, or one key.** Nothing fires. The slider is disabled while unarmed and
  `travelTo` refuses regardless, so the disabled attribute is the visible guard rather than the
  real one.
- **A key turned back off mid-travel.** The travel resets synchronously, in the same statement, so
  no caller can observe a locked gate that is nearly complete.
- **A slider that keeps reporting after the end.** The second report is refused; the action runs
  once.
- **A reopened gate.** `reset()` is called on open, so a gate is never found part-way through.
- **Escape, or the emergency exit.** Nothing is changed and focus goes back to the control the
  user started from.
- **An authorised gate whose keys are then flipped.** It is left alone: the full bar is the
  completion state, and flipping a switch afterwards should not rewind the record of something
  that has already happened.
- **A destructive call site nobody declared.** The policy test fails with the file, the count and
  an explanation of what to do about it.

## Security considerations

The gate is a defence against a mistaken click, not against an attacker who already controls the
process. It is a usability safety control and is not an authorisation boundary; nothing about it
should be read as access control.

Two independent controls plus a full-range slider exist so that no single accidental input can
complete it, which is exactly the failure a single confirm button has. The keys, the slider, the
progress state, the completion state and the emergency exit all have accessible names and visible
focus, so the gate is not weaker for a keyboard or screen-reader user.

The gate never performs part of the destructive action in order to preview it. A preview describes
what would happen; it does not do any of it. The one place a preview is large, the bulk close, is
a plan computed without touching a tab, and the same plan object is what runs.

It lives in the application's own framework and renderer. No external CAPTCHA, hosted helper page,
separate confirmation application or new window is involved, because a confirmation the user has
to leave the application to complete is a confirmation that teaches them to trust a second window.

## Accessibility

Both cards are operable by keyboard alone: the keys are switches, the slider takes arrow keys, and
the Emergency exit and Escape both cancel. The surface carries an accessible name, the slider
carries its own name and a spoken position through `aria-valuetext`, and a live status region
reports the phase. Motion is decorative: a reduced-motion preference disables the animation
without disabling the control it was decorating. The Emergency exit has a 40 pixel minimum target.
Focus returns to the originating control on every exit path.

## Verification

| Test | What it holds |
|---|---|
| `superConfirmGate.test.ts` | The state machine: untouched, one key, both keys, a partial slider, a key turned back off, reset, the values a screen reader is given, the completion hold, and focus returning to where it came from. |
| `superConfirm.test.ts` | Both cards, mounted, through every state: untouched, one key only, both keys, a partial slider, a full slider, cancelling, Escape, reduced motion, keyboard only, and what assistive technology is told. Then the real operations: that the facts shown are the caller's rather than the gate's, that removing a saved map or server actually removes it and only then, that deleting a map config does, and that a save which takes files off the disk is gated. |
| `superConfirmPolicy.test.ts` | The inventory: no undeclared destructive call site, per-file counts that cannot drift, every declaration naming what it destroys, every gated entry pointing at a file that really holds a gate, every ungated entry justifying its standing at length, the known-gap list exactly as long as the gaps themselves, exactly two gate components, both running the shared state machine, and every contract part still present in each card. |

Run them with `npx vitest run packages/ui/src/components/confirm` from `design/`.

## Suggested reading

- [Tabbed navigation](./tabbed-navigation.md), whose bulk closes are the largest thing behind this
  gate.
- [Language modes and funny levels](./language-and-tone.md), for why a level 5 gate still names
  the file.
- [Notification centre](./notification-centre.md), for the opposite rule: what must never block.

## 廣東話

### 破壞性動作嘅 super confirmation

要兩把獨立操作嘅鎖匙，跟住仲要有個 slider 行足全程，先至會發生任何不可逆嘅嘢。呢道閘（gate）住喺應用
程式自己嘅介面入面，會講明佢即將毀滅緊嘅究竟係咩，而且永遠都留一條後路畀你走。

規則嘅程式碼喺 `design/packages/ui/src/components/confirm/`，佢有兩個呈現方式：
`components/config/ConfigSuperConfirm.vue`（貼住佢守住嗰個控制項嚟擺）同
`components/menu/MenuSuperConfirm.vue`（modal，畀啲窄嘅 sheet 用，因為嗰度冇位錨第二個面）。

### 一部狀態機，兩張卡

份合約其實係一張清單，列出破壞性動作觸發嗰一刻必須成立嘅嘢，而嗰啲係一部細狀態機嘅屬性，唔係卡片版面
嘅屬性。所以規則淨係住喺 `createSuperConfirmGate` 一次，兩個 component 係佢上面兩層皮。一條規則兩個
呈現方式，正正係最容易出事嗰種形狀：如果規則寫喺每個 component 入面，第一次修正淨係落咗其中一個，另一
個繼續帶住個 bug，而你亦冇任何嘢可以睇得出邊個先啱。

個 factory 負責嘅嘢，每一樣隔籬都有對應嘅測試：

- **完全冇掂過嗰陣，道閘係鎖住嘅**，個 slider 郁都郁唔到。
- **一把鎖匙唔會 arm 到佢。** 同一把鎖匙開兩次都唔得，因為佢哋係兩個分開嘅 boolean，唔係一個計數器。
- **未行到尾就放手，個 slider 會彈返去起點**，所以撳滑咗手毀滅唔到嘢，做咗一半嘅拖曳亦唔可以靠第二次
  細細力嘅拖曳續落去。
- **行到一半將鎖匙扳返落去會即刻 disarm 同 reset**，而唔係留低一道視覺上鎖住、內部其實差少少就發射嘅
  閘。呢樣係喺 setter 入面做，唔係喺 watcher 度做：watcher 要等下一次 flush 先行，喺嗰個空窗期就會有
  一道睇落鎖住、但係推多一下就完成嘅閘。
- **授權淨係發生一次。** 一個行到尾之後仲繼續回報數值嘅 slider，唔可以觸發第二次刪除；Vuetify 喺拖曳
  同鍵盤兩種情況都會 emit，所以呢個情況真係去到。

`travel` 由外面睇係唯讀，所有令佢郁嘅嘢都要行過 `travelTo`，而 arming 就係喺嗰度檢查，所以冇第二條路
可以令個 slider 唔經兩把鎖匙就到終點。

四個階段係 `locked`、`armed`、`moving` 同 `authorized`，刻意用四個狀態而唔係一對 boolean：「armed 但
未郁」同「armed 而且郁緊」需要唔同文案，一個講下一步要做乜、一個報告進度；而一個喺三個地方問
`armed && travel > 0` 嘅 component，就係一個三個答案終有一日會唔一致嘅 component。

### 發射之後

完成咗嘅閘會維持 `GATE_COMPLETION_HOLD_MS` 咁耐，然後自己閂。份合約要求有一個明顯嘅完成動畫，*同時*
要求焦點返返去打開道閘嗰個控制項度，而呢兩樣係拉緊反方向嘅：slider 一到位就即刻閂嘅介面，根本見唔到
完成；而要等人撳一下先閂嘅，就會令用鍵盤嘅人被困喺一張卡度，卡入面淨返嘅控制項係一個已經冇嘢好退嘅
退出掣。

`returnFocusTo` 會將焦點擺返去原本嗰個控制項，無論道閘係完成咗定係被中途走甩。呢部分好易漏，因為冇咗
佢都睇唔出有咩問題：用滑鼠又睇得見嘅人永遠唔會為意，但係用鍵盤嗰個人，一取消就會發現焦點跌咗落
document body，之後撳 Tab 又由成版嘢嘅最頂開始，離佢原本企嗰個掣幾個畫面咁遠。

### 清單制度，令新加嘅刪除溜唔甩

「每個破壞性動作都喺道閘後面」呢句聲稱，講緊嘅唔淨止係現有嘅刪除掣，仲有下一個先加嘅，所以呢樣係用
一份清單（inventory）去強制執行，唔係靠記性。`superConfirmPolicy.test.ts` 會行勻個 package 每一個
source 檔，搵破壞性嘅呼叫點：任何 `deleteSomething(`、`removeSomething(`、`purgeSomething(` 等等形狀
嘅嘢，係靠命名慣例捉，唔係靠一張已知原始操作嘅清單，再加埋嗰幾個名唔跟慣例嘅（登出、重設所有設定、
忘記一個儲存咗嘅目錄、做批量關閉、停低做緊嘅工作、清空 web storage）。

每個含有呼叫點嘅檔案都要申報：佢有幾多個、佢用用戶認得出嘅講法毀滅緊乜、同埋佢處於咩身分（standing）。
啲 standing 係一個封閉集合，所以個理由係可以核對，唔係求其寫句嘢畀測試過。原文嗰個表列出七種身分：
`gated` 表示道閘企喺佢前面，而申報要指名住住住嗰道閘嘅檔案（未必係做呼叫嗰個檔）；`type-only` 表示
淨係宿主方法嘅宣告，唔係去 call 佢；`buffer` 表示佢改嘅係未儲存、喺記憶體入面嘅 workspace，未有任何
嘢離開過磁碟，而 apply 對話框喺郁手之前會列晒真係會刪嘅每個檔；`reversible` 表示用戶用返同一個控制項
就可以將狀態擺返；`resumable` 表示佢係捱得住而唔係破壞性 —— 已經產出嘅嘢會保留，工作由嗰度續落去；
`unwired` 表示係 model 程式碼，仲未有面向用戶嘅呼叫者，接線嗰個人欠住道閘；`gap` 表示已經出咗街、去到
到、而且冇喺道閘後面 —— 呢個係缺陷，並且直接叫佢做缺陷。

想發明第六個藉口，就要改個 union type，噉喺 diff 度就會見到。數量都係逐個檔申報，所以第二個刪除唔可以
匿埋喺一個已申報嘅隔籬。啲 gap 仲會喺一張短清單度再列一次，畀 reviewer 由頭睇到尾：一個冇人寫落去嘅
gap 會令測試失敗，而一個已經修好但仲留喺度嘅 gap 一樣會令測試失敗。

### 今日有咩喺道閘後面

原文嗰個表列出七個已加閘嘅破壞性動作同對應嘅閘：移除已儲存嘅地圖或者 server profile，用
`components/ProfileManager.vue`；刪除用戶自己儲存嘅 appearance preset，用
`components/appearance/AppearanceEditor.vue`；刪除一個 map config，用
`components/config/MapsScreen.vue`；刪除一個 storage config，用
`components/config/StoragesScreen.vue`；一次計劃會由磁碟拎走 config 檔嘅儲存，用
`components/config/ConfigApplyDialog.vue`；清走所有已儲存嘅 viewer 設定，用
`components/menu/SettingsMenu.vue`；一次過閂好多個 tab，用 `components/tabs/TabClosePanel.vue`。

### 啲 gap，講出嚟而唔係收埋

由 GitHub 登出會撤銷儲存咗嘅 token，而當 GitHub 認嗰個撤銷嗰陣，連帳戶上面嗰個 grant 都撤埋。佢係
inline 分兩步確認、亦有焦點返回，但佢**唔係**喺兩把鎖匙嘅閘後面。嗰一行同埋佢後面嗰個原始操作，兩樣都
申報咗做 `gap`，並且喺專案為呢份合約開嘅 issue 度追蹤緊。呢份文件講明呢件事，係因為一份見唔到自己缺陷
嘅清單，已經係一份冇用嘅清單。

### 設定（Configuration）

三個常數：`GATE_TRAVEL_START` 係 0，即係 slider 嘅起點，亦係佢彈返去嗰個位；`GATE_TRAVEL_END` 係 100，
因為一道去到 90% 就發射嘅閘，即係最後嗰一成係裝飾；`GATE_COMPLETION_HOLD_MS` 係 900，長到夠顯示完成，
又短到唔會困死用鍵盤嘅人。

呢啲全部都唔畀用戶調。道閘展示嘅事實亦唔係可設定嘅文案：確切嘅動作、確切受影響嘅資料、同埋佢邊度不可
逆，正正就係道閘存在嘅理由。語氣就同其他嘢一樣跟語言模式同兩個 funny level 走，而
[voice-not-facts 規則](./language-and-tone.md) 就係喺每一個 level 都保住啲名稱唔走樣嗰樣嘢。

每道閘喺 source 層面都被要求仍然含住合約列出嘅每一件部件：第一把鎖匙、第二把獨立鎖匙、一個全程 slider、
兩把鎖匙未扳之前個 slider 要 disabled、行緊嗰陣嘅進度動畫、一個明顯嘅完成動畫、一個 Emergency exit、
一條 Escape 路、閂嗰陣焦點返回、一個 live status region、介面本身要有 accessible name、slider 亦要有
名同埋讀得出嘅位置、一個 reduced-motion 區塊，同埋一個 40 pixel 嘅 Emergency exit 觸控目標。呢啲每一
樣都係就算刪咗都唔會有嘢*睇落*壞咗，所以先要逐個名咁 assert。

### 失敗情況（Failure modes）

- **slider 淨係行咗一半，或者淨係一把鎖匙。** 乜都唔會發生。未 arm 嗰陣個 slider 係 disabled，而
  `travelTo` 無論點都拒絕，所以 disabled 呢個屬性係睇得見嗰重守衛，唔係真正嗰重。
- **行到一半扳返一把鎖匙落去。** travel 會同步、喺同一句 statement 入面 reset，所以冇呼叫者可以觀察到
  一道鎖住但差少少就完成嘅閘。
- **slider 過咗終點仲繼續回報。** 第二次回報會被拒絕；個動作淨係行一次。
- **重新打開嘅閘。** 打開嗰陣會 call `reset()`，所以永遠唔會撞到一道做咗一半嘅閘。
- **Escape，或者 emergency exit。** 冇任何嘢改變，焦點返返去用戶原本嗰個控制項。
- **已授權嘅閘之後有人扳返啲鎖匙。** 唔理佢：成條 bar 係完成狀態，之後扳個掣唔應該倒帶已經發生咗嘅嘢
  嘅紀錄。
- **冇人申報過嘅破壞性呼叫點。** policy 測試會失敗，並且列出檔案、數量，同埋要點處理。

### 保安考慮（Security considerations）

道閘係防撳錯，唔係防一個已經控制咗個 process 嘅攻擊者。佢係一個可用性上嘅安全控制，唔係授權邊界；
唔應該將佢任何部分當成存取控制。

兩個獨立控制項加一個全程 slider 存在嘅原因，就係要令任何單一次意外輸入都完成唔到佢 —— 而單一粒
confirm 掣正正就係會噉樣衰。啲鎖匙、slider、進度狀態、完成狀態同 emergency exit 全部有 accessible
name 同睇得見嘅焦點，所以對用鍵盤或者 screen reader 嘅人嚟講，道閘唔會弱啲。

道閘永遠唔會為咗預覽而先做咗破壞性動作嘅一部分。預覽係描述會發生咩事；佢唔會做入面任何一件。唯一一個
預覽好大嘅地方，即批量關閉，係一個唔掂任何 tab 就計出嚟嘅 plan，而真正執行嘅就係同一個 plan 物件。

佢住喺應用程式自己嘅 framework 同 renderer 入面。冇涉及任何外部 CAPTCHA、寄存嘅輔助頁面、獨立嘅確認
應用程式或者新視窗，因為一個要用戶離開應用程式先完成到嘅確認，就係一個教識佢哋去信第二個視窗嘅確認。

### 無障礙（Accessibility）

兩張卡淨用鍵盤都操作到：啲鎖匙係 switch、slider 食方向鍵，而 Emergency exit 同 Escape 都可以取消。個
介面帶住 accessible name，slider 有自己嘅名同埋經 `aria-valuetext` 讀出位置，仲有一個 live status
region 報告階段。動態效果係裝飾性：reduced-motion 偏好會停咗動畫，但唔會停佢裝飾緊嗰個控制項。
Emergency exit 有 40 pixel 最細觸控目標。每一條退出路徑焦點都會返返去原本嗰個控制項。

### 驗證（Verification）

原文嗰個表講三個測試檔守住乜。`superConfirmGate.test.ts` 守住部狀態機：冇掂過、一把鎖匙、兩把鎖匙、
slider 行咗一半、扳返一把鎖匙落去、reset、畀 screen reader 嘅數值、完成保持時間，同埋焦點返返去原本
嗰度。`superConfirm.test.ts` 將兩張卡 mount 起身行勻每個狀態：冇掂過、淨係一把鎖匙、兩把鎖匙、slider
一半、slider 全程、取消、Escape、reduced motion、淨用鍵盤，同埋輔助科技收到啲乜；跟住係真嘅操作 ——
顯示嘅事實係呼叫者嘅而唔係道閘嘅、移除一個已儲存嘅地圖或者 server 真係會移除到而且到嗰刻先移除、刪
map config 真係刪到，同埋一次會由磁碟拎走檔案嘅儲存確實有加閘。`superConfirmPolicy.test.ts` 守住份
清單：冇未申報嘅破壞性呼叫點、逐檔數量唔會飄移、每個申報都講明佢毀滅緊乜、每個 `gated` 條目都指住一個
真係住住道閘嘅檔、每個未加閘嘅條目都詳細講清楚佢個 standing、已知 gap 清單嘅長度同 gap 本身一樣、
剛好兩個閘 component、兩個都行緊共用嗰部狀態機，同埋每張卡都仲有齊合約嘅每一件部件。

喺 `design/` 度用 `npx vitest run packages/ui/src/components/confirm` 行呢啲測試。

### 建議閱讀（Suggested reading）

- [Tabbed navigation](./tabbed-navigation.md)，佢嘅批量關閉係呢道閘後面最大件嗰樣嘢。
- [Language modes and funny levels](./language-and-tone.md)，講點解 level 5 嘅閘一樣要講出個檔名。
- [Notification centre](./notification-centre.md)，講相反嘅規則：咩嘢永遠都唔可以阻住人。
