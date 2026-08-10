# Browser-style tabbed navigation

The application's content is a persistent tab strip rather than one scrolling surface: tabs that
overflow into a surface of their own, reorder, pin, group and come back the way they were left.
Four separate searches find a tab, and five bulk closes remove many at once, each of them showing
exactly what it will do before it does it. The strip itself can occupy the physical left, right,
top or bottom edge, and that choice comes back with the rest of the layout.

The code is `design/packages/ui/src/components/tabs/`. A host mounts `TabbedNavigation`, declares
its pages and renders one named slot per page id; nothing else needs to know that tabs exist.

## Where it is mounted

Every settings-style surface in the desktop app now carries its own `TabbedNavigation` rather than
a bespoke `v-tabs`/`v-window` pair, each under its own `storageKey` so one surface's layout can
never overwrite another's:

| Surface                                  | `storageKey`                    | What each tab is                                                                                                              |
| ---------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The application shell (`App.vue`)        | `worldlens-tabs` (the default)  | Twelve destinations, seeded into four loose tabs and three named groups - see [What a fresh workspace opens as](#what-a-fresh-workspace-opens-as) |
| Settings (`AppSettings.vue`)             | `worldlens-settings-tabs`       | One tab per setting section - consent, Java, storage folder, world folder, GitHub account, language and tone, panel placement |
| The options editor (`ConfigScreen.vue`)  | `worldlens-config-editor-tabs`  | One tab per config screen, plus history                                                                                       |
| The project editor (`ProjectEditor.vue`) | `worldlens-project-editor-tabs` | Maps, storages, how it renders, and the four whole-file singletons                                                            |

`renamePage(pageId, label)` is what a host uses to keep a tab's label current after the fact - a
page's own `label` is read only once, when a tab for it is first seeded or opened, so a live count
like "Maps (3)" needs the host to push a rename through explicitly whenever that count changes.

**`AppearanceEditor.vue` is the one settings-style surface that keeps a plain `v-tabs` on
purpose**, documented in its own file rather than left as a silent gap: it is a small, anchored,
non-modal popover editing one element at a time, with exactly three permanent tabs that are never
opened, closed, reordered or searched for, so the strip's whole apparatus - overflow, a new-tab
control, per-tab menus, four searchable-tab surfaces, bulk closes - has no referent there. Its
Surface and Presets tabs still each carry their own `ConfigSearchField` with the full regex
builder, because the regex-builder rule has no such size exemption.

## Behaviour

### One authority per ordering

`tabModel.ts` is pure data and pure functions: no DOM, no clock, no storage, no Vue. The awkward
parts of browser-style tabs are ordering rules rather than rendering, and each order has exactly
one field that owns it, with nothing else allowed to imply it.

| Field             | The order it owns                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabs`            | The set of tabs, keyed by id. Its array order carries no meaning.                                                                                                       |
| `pinnedOrder`     | The pinned region, left to right.                                                                                                                                       |
| `slots`           | The ordinary region, where a slot is either one ungrouped tab or one whole group. One list, so the ordinary tab order and the group order cannot contradict each other. |
| `TabGroup.tabIds` | The order inside that group.                                                                                                                                            |

Every id therefore appears in exactly one place, and `normalizeStrip` enforces that on anything
read back from disk. The alternative, one array of tabs with the rest derived by filtering, reads
well until a tab is pinned, at which point its position means two things at once and every later
operation has to guess which one the user meant.

**Pinning takes a tab out of its group.** A pinned tab lives in the pinned region and a grouped
tab lives inside its group's run; those are two places on screen and a tab cannot be in both.
Keeping the membership and merely hiding the tab from the group's run would make the per-group
search report a tab that is demonstrably not in the group, which is worse than losing the
membership because it is a lie rather than a loss.

### What a fresh workspace opens as

The shell has twelve destinations and every one of them is somebody's whole reason for opening
the application, so none of them is removed. Seeded as twelve flat, equal-weight tabs, though,
they are the single biggest source of "cluttered" a newcomer meets: the two things they need on
the first day sit in a list with nine they need later and one they need when stuck, all in the
same typeface, none of them explaining the others.

So `App.vue` passes `initial-groups`, and a workspace with nothing saved yet opens as four loose
rows and three named groups instead:

| Where it sits              | What is in it                                    | Why those belong together                                                                                                                        |
| -------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinned                     | Home                                             | The landing page, first in the strip and outside every group, because the pinned region is what keeps it there. `pinned-page-ids` names it.       |
| Loose                      | Map, Make a map, Docs                            | The two things a newcomer actually does, and the one they reach for when the rest has stopped making sense. Docs is one tab, and a group holding one tab is a header that hides exactly one row. |
| **Rendering**              | Projects, GitHub runners, Renders                | How a render is set up and what it is doing: the settings a project carries, the fourth answer to "where does this render run", and the count in flight. |
| **Finished maps**          | Maps and servers, Publish to Pages, Watch it live | A map that already exists, and the three places it can be looked at: this application's own list, somebody else's static host, and this computer serving it off its own disk. |
| **Keeping a copy**         | Backups, World repository                     | The two ways a world or a render is put somewhere that is not this one machine: a versioned upload to GitHub, and a git repository a second computer can adopt. |

Three things this deliberately is not:

- **It is not a fixed structure.** A seeded group is an ordinary group from the moment it is
  drawn: rename it, recolour it, drag a tab out of it, reorder it, ungroup it keeping every tab,
  delete it. The result is what gets persisted, and nothing re-applies the seed afterwards.
- **It is not applied to a workspace that already exists.** `seedStrip` runs only where
  `readTabWorkspace` returned null, which is the same condition it has always run under. A
  returning user's order, pins, groups and collapsed states are restored exactly as they left
  them; a strip somebody arranged by hand is never re-shaped to match a default they never saw.
  `ensurePage`, the upgrade path below, adds its tab **outside** every group for the same
  reason.
- **It is not hiding anything.** The groups are seeded **open**, so all twelve destinations are
  on screen from the first launch with no disclosure to press first. That is deliberate, and it
  is the half of this that is easy to get backwards: a shorter strip is not the goal, a legible
  one is, and the names over the groups are what stop twelve destinations reading as one
  undifferentiated list - which they do whether or not the members are showing. Collapsing on
  top of that removes destinations rather than clutter, and it makes reaching them depend on a
  control being pressable, which is strictly weaker than not needing one. The first version of
  this did seed them shut, and the capture harness measured the cost: five destinations became
  unreachable to it on a strip whose own diagnostics reported every group present, named and
  correct.

  Collapsing stays exactly where it belongs - something the reader does to the sections they
  have decided they do not need - and a collapsed group still hides nothing: its members remain
  in the strip's model, in every search, counted by a bulk close, and one click from the header.
  `revealPage` - the route the command palette, a finished render and a glossary link all take -
  reveals a collapsed group holding the tab it activates, through the runtime `revealed` set, so
  the strip never shows a panel whose tab is nowhere on screen and the group's saved preference
  is still not rewritten.

The mechanics are two pure functions in `tabModel.ts`, both proven in `tabModel.test.ts`:
`seedTabOrder` decides the order the tabs are created in (ungrouped pages first, in declared
order, then each group's pages), which is what makes the groups land after the loose tabs in
declared order rather than at the arithmetically-correct-but-unpredictable positions
`createGroup`'s "position of its first member" rule produces out of an interleaved list; and
`applyGroupSeeds` creates one group per seed, skipping a pinned tab (pinning wins - the pinned
region is the promise that the landing tab stays at the front), skipping a page with no tab, and
creating nothing at all for a seed left with no members.

### Reaching a page a saved workspace predates

`seedStrip` only ever runs once, the moment a workspace file cannot be read at all - a genuinely
fresh install, or a file this build cannot parse. Restoring an existing one only ever repairs what
is already there; it never invents a tab for a page the saved record does not know about, because
"half-restore the layout and improvise the rest" is indistinguishable from a bug. That is fine
right up until a page ships that every install, upgrading or fresh, needs to actually find - [the
Home tab](./home.md) is exactly that case.

Two small, narrowly scoped pieces of `TabbedNavigation.vue` exist for a host to lean on rather than
reinvent:

- **`pinnedPageIds`**, a prop naming the page ids pinned the moment a tab for them first exists -
  at seed time on a fresh install, or later, through `ensurePage` below. It is applied once, at
  creation; unpinning one of these tabs by hand afterwards is never reversed on a later mount,
  because "hard to lose by accident" is a promise about the first time a page appears, not a
  standing rule this component re-enforces against a choice the user already made.
- **`ensurePage(pageId)`**, the exposed method that adds a tab for a page with none, pinning it
  when `pinnedPageIds` names it, without moving whichever tab is currently active. A no-op once the
  tab exists, so it is safe - and cheap enough - to call on every mount rather than behind a
  one-time flag of the host's own. This is the third and narrowest of the three host-writable
  actions this component exposes, alongside `revealPage` and `renamePage`: it can only add a tab
  for a page that has none, never move, close or rename one that already exists.

### Nothing is silently clipped

When the ordinary region cannot hold every segment, the ones that do not fit move into an overflow
menu and the button says how many. `fitCount` pays for the overflow button out of the same budget,
because otherwise the button lands on top of the tab that only just fitted, and a tab hidden under
a button is the exact failure this is meant to prevent. Widths are measured once per segment and
cached: a hidden element measures zero, and recomputing from zeroes would flap between states.

The pinned region is measured out of the budget first and never overflows, so a pinned tab stays
reachable however many ordinary tabs are open. Pinned tabs render compact when the strip is tight
and keep their full accessible name, so what a screen reader announces does not shrink with the
button.

### Four physical edges, with one axis at a time

The strip's placement picker offers **left**, **right**, **top** and **bottom**. Left and right
are physical edges even in a right-to-left language: changing the reading direction does not move
a strip the user explicitly docked against a side of the window. A fresh strip starts on the left.

Placement changes the real layout rather than rotating labels inside the old one. Left and right
use a vertical strip beside the panel; top and bottom use a horizontal strip above or below it.
Overflow measurement, drag-and-drop ordering, the placement sheet and the tab list all follow that
axis. Keyboard navigation follows it too: Up/Down move through a vertical strip, Left/Right move
through a horizontal strip, and horizontal movement follows the document's RTL direction. Home
and End still reach the first and last visible tab on either axis.

`setTabPlacement` writes the choice into the strip state. Storage schema v2 adds only that field;
loading a version-1 record preserves its tabs, pins, groups, order, collapsed state, membership and
appearance and supplies `left` for the missing placement. An invalid placement is repaired to the
same safe default instead of discarding the rest of a readable layout.

### Groups

Groups can be created, named, renamed, coloured from seven Material roles, reordered, collapsed,
expanded and removed. A group takes the position of the first tab it was made from, so a group
made out of tabs somebody was already looking at appears where they were looking rather than at
the end of the strip. **Removing a group closes no tab**: its members become lone tabs in the slot
the group held.

A collapsed group is a display state, not a claim that its tabs have gone. Its members are still
searched, still counted and still closed by a close-to-the-right. What must not happen is a search
result writing that preference back, so a group revealed to show a hit is expanded on screen and
unchanged on disk. The same runtime reveal is what `revealPage` uses when a host navigates to a
page whose tab is inside a collapsed group.

A host may also hand `TabbedNavigation` a list of groups to seed a **fresh** workspace into - see
[What a fresh workspace opens as](#what-a-fresh-workspace-opens-as). Those are defaults, not
structure: they are ordinary groups the moment they exist, and nothing re-applies them.

### The four searches

Each is a separate function over the scope it searches and a matcher the caller built from its own
query, mode and flags. Nothing in `tabSearch.ts` holds state, so four fields means four matchers
and there is no shared thing left for them to leak through.

| Search            | Scope                                                                                     | Where it renders |
| ----------------- | ----------------------------------------------------------------------------------------- | ---------------- |
| `searchStripTabs` | The current strip, including tabs in the overflow surface and members of collapsed groups | `TabFinder`      |
| `searchGroupTabs` | One named group and nothing outside it                                                    | `TabGroupMenu`   |
| `searchGroups`    | Group names, across every strip                                                           | `TabFinder`      |
| `searchAllTabs`   | Every tab in every strip in every window                                                  | `TabFinder`      |

What is searched is the visible label and only the visible label: not the page behind the tab, not
an id, not anything the tab is holding. A person searching a tab strip is looking for a word they
can see, and a search that quietly matched hidden text would close tabs whose labels do not
contain the query at all. A result row states its window, strip, group, pinned state and position,
because two tabs called "Settings" in different windows are otherwise indistinguishable.

### The five bulk closes, and the plan in front of them

`planTextClose` covers "close tabs containing text" and "close tabs not containing text";
`planCloseOthers` and `planCloseToEdge` cover close-others and close-to-start or close-to-end.

**Containing and not-containing are one predicate and its negation, literally.** One
`SettingMatcher`, one `direction`, the same `matcher.test` over the same eligible set, only the
sign flipped. Two implementations drift on case, on Unicode and on which flags are honoured, and
the day they disagree a pair of actions a user reasonably believes are exhaustive quietly leaves
tabs untouched by both. The unit test proves the partition rather than trusting the shape: for any
query, in either mode, the two sets are disjoint and together cover every eligible tab.

**Every function returns a plan and closes nothing.** The plan states the matching mode, which
tabs are in scope, which will close, which were protected for being pinned and which hold unsaved
work, before a single tab goes. The reviewable preview _is_ the plan rather than a second
calculation of it, so the preview and the close cannot disagree about the count. The plan carries
its own scope, so the sentence on screen and the set being closed come from the same place and a
scoped action cannot quietly cross a group boundary.

Pinned tabs are out of scope unless the user says otherwise and are listed by name so the preview
shows what the protection saved. Tabs holding unsaved work are listed separately: they matched,
they are not protected, and closing them is a decision rather than a side effect of a text query.
`applyClosePlan` reports what it actually closed and what it kept, so a partial result is never
reported as a whole one. Running a plan goes through the
[super-confirmation gate](./super-confirmation.md).

## Configuration

| Setting              | Value                                                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage key          | `worldlens-tabs` in `localStorage` by default; every host passes its own `storageKey` prop instead - see [Where it is mounted](#where-it-is-mounted). Former `material-bluemap-*` keys are copied only when the corresponding current key is absent. |
| Stored shape version | `TAB_STORAGE_VERSION`, currently 2, shared across every `storageKey`; version 1 migrates without losing its existing layout                                                                                                                          |
| Group colours        | `primary`, `secondary`, `tertiary`, `success`, `warning`, `error`, `info`; default `primary`                                                                                                                                                         |

Persisted: strip placement, tab order, pinned order, groups, group order, collapsed state,
membership, and each tab's and group's opaque appearance record.

Not persisted, deliberately:

- **`dirty`.** A tab holding unsaved work when the application closed is not holding it on the
  next launch: either the work was saved or it is gone, and a restored `dirty: true` would be a
  lie that then protects the tab from a bulk close for no reason.
- **Search queries and regex patterns.** They are not ordinary layout preferences, they can
  contain anything a person typed, and storing them without a reason is the opposite of what is
  wanted. Every field starts empty on launch.

`appearance` **is** round-tripped verbatim without being inspected. Nothing in this folder reads
inside those records, so a record written by a newer build survives a round trip through an older
one instead of being silently emptied.

## Failure modes

- **Storage refuses or is full.** Both directions swallow it. The consequence is a layout that
  does not survive a restart, which is annoying and nowhere near a notification.
- **A stored file this build cannot read.** The defaults are seeded rather than half-restoring it.
  The version field is how a future change that `normalizeStrip` cannot repair refuses an old file
  instead of partly reading it.
- **A file that is the right shape but internally inconsistent**, for example a tab id in both a
  group and the pinned order. `normalizeStrip` repairs it, because the file is editable by hand
  and is written by other versions of this application.
- **An empty query or a pattern that will not compile.** The plan closes nothing at all. It is not
  merely disabled in the interface: `selected` is empty, so even a caller that ignored `runnable`
  would close nothing.
- **The last tab closes.** The strip leaves an honest empty state rather than a blank frame.
- **A tab that could not be closed** is reported as kept rather than counted as closed.

## Security considerations

Nothing here reaches the network and nothing leaves the machine. Only layout is persisted;
queries, patterns and tab contents are not.

Searching and bulk closing read the visible label only, so neither can be used to match on
something the user cannot see. All matching runs on the local `RegExp` engine under the bounds
`components/config/regexEngine.ts` states (512-character pattern, 20000-character sample, 500
matches, 100 ms per preview run), which is what keeps a pathological pattern from freezing the
strip.

A bulk close is destructive and is treated as one: a reviewable preview naming every affected tab,
pinned tabs excluded unless deliberately included, unsaved work called out separately, and the
two-key gate before anything runs.

## Accessibility

One `role="tablist"`, one `role="tab"` per tab, and `aria-controls` only on the selected tab,
because the other panels are not rendered and pointing at an element that does not exist is worse
than pointing at nothing. Exactly one tab carries `tabindex="0"`, so Tab reaches the strip once and
the axis-appropriate arrow keys move within it, with Home and End reaching the ends. Enter and
Space activate the focused tab without opening an overlay. A group header is a button
inside the tablist rather than a tab: it is skipped by the arrow keys and announces its own name,
count and expanded state. Tabs inside a collapsed group are out of the focus order, because focus
landing on something not drawn looks like the key did nothing, while remaining in the strip and in
every search. Compact pinned tabs keep their full accessible name. A context-menu item
that has a keyboard shortcut displays it beside the label, taken from the same handler that binds
it so the two cannot drift apart; an item with no shortcut carries an explicit null and shows
nothing rather than a placeholder. The menu carries its own filter field, because a person
filtering a menu is typing what they can read on it.

## Verification

| Test                           | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabModel.test.ts`             | Every ordering rule: where an unpinned tab lands, what happens to a removed group's members, which tab becomes active when the active one closes, that pinning clears membership, that every id lives in exactly one place after `normalizeStrip`, the four valid placements, the overflow arithmetic including paying for the overflow button, and the seeding arithmetic - creation order, groups landing after the loose tabs in declared order, collapsed by default, a pinned tab left pinned, a page with no tab skipped, and a seeded group answering every ordinary group command. |
| `tabSearch.test.ts`            | Four scopes searched independently, collapsed group members found, hits carrying window, strip, group, pinned state and index, and only the visible label matched.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `closePlans.test.ts`           | The partition property for any query in either mode, plans that close nothing on an empty or uncompilable query, pinned and unsaved tabs held back and named, scope carried on the plan, and `applyClosePlan` reporting kept tabs honestly.                                                                                                                                                                                                                                                                                                                                                                            |
| `tabStorage.test.ts`           | Placement and the six persisted orderings round-tripping, schema-v1 migration defaulting only the missing edge to left, `dirty` dropped, queries and patterns never written, appearance records preserved verbatim, a blocked storage staying silent, and a file this build cannot read seeding defaults instead.                                                                                                                                                                                                                                                                                                      |
| `tabMenus.test.ts`             | The menu's own search filters its items without changing what they do.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `TabbedNavigation.test.ts`     | Mounted: roles and roving focus, selection moving panel and tab order together, axis-aware arrows on all four edges including RTL, Enter/Space activation, Home and End, the advertised keyboard commands, the placement picker and persisted restoration, a compact pinned tab keeping its name, a collapsed group drawn as a header with name, count and state and its members out of the focus order, expanding writing the preference, `revealPage` activating an existing tab, reopening a closed one or revealing a collapsed group's tab without rewriting its preference, and `renamePage` relabelling every open tab for a page without touching one that shows a different page. Seeding: a fresh workspace opening as loose tabs plus named collapsed groups with the pinned landing tab first and outside them, every declared page still present, expanding a header revealing that group's members and writing only that group's preference, the whole structure surviving a save and reload, a saved workspace left exactly as it was, `ensurePage` adding a later page outside every group, and a host that declares no groups seeding one loose tab per page as it always did. |
| `projectSurfaceSizing.test.ts` | The project editor, tab strip, search controls and live-speed controls keep 44px targets, wrapping text, responsive stacking and viewport-bounded scrollable overlays rather than clipping at narrow widths.                                                                                                                                                                                                                                                                                                                                                                                                           |

Run them with `npx vitest run packages/ui/src/components/tabs` from `design/`.

## Suggested reading

- [Home](./home.md), the one page every install - fresh or upgrading - is guaranteed a pinned tab
  for, and the reason `pinnedPageIds`/`ensurePage` exist at all.
- [Super confirmation](./super-confirmation.md), which stands in front of every bulk close.
- [The regex builder and the search bars it reaches](./regex-builder.md), which supplies all four
  tab searches and both bulk-close fields.
- [Appearance editors](./appearance-editors.md), which owns the records the tab model carries but
  never reads.

## 廣東話

### 瀏覽器風格嘅分頁導覽（Browser-style tabbed navigation）

應用程式嘅內容係一條常駐嘅 tab strip，唔係一版一直捲落去嘅嘢：啲 tab 滿咗會湧入自己嗰個 overflow 介面，
可以重新排序、釘住、分組，亦會照返你離開嗰陣嘅樣返嚟。有四種唔同嘅搜尋幫你搵返一個 tab，仲有五種批量
關閉一次過閂走好多個，每一種喺做之前都會清楚展示佢會做乜。條 strip 本身可以放喺實體嘅左、右、上或者下
邊，而呢個選擇亦會同其餘 layout 一齊返嚟。

程式碼喺 `design/packages/ui/src/components/tabs/`。宿主 mount 一個 `TabbedNavigation`、宣告佢啲頁面，
再逐個 page id render 一個具名 slot；其他嘢完全唔使知有 tab 呢樣嘢存在。

### 佢 mount 咗喺邊

桌面 app 入面每個設定類介面而家都自己帶一個 `TabbedNavigation`，唔再係自己砌一對
`v-tabs`/`v-window`，而且各自有自己嘅 `storageKey`，所以一個介面嘅 layout 永遠唔會蓋過另一個嘅。原文
嗰個表列出四個：應用程式外殼（`App.vue`）用預設嘅 `worldlens-tabs`，有十二個目的地，種成四個散 tab 加
三個具名群組；Settings（`AppSettings.vue`）用 `worldlens-settings-tabs`，每個設定區段一個 tab ——
consent、Java、storage folder、world folder、GitHub account、language and tone、panel placement；選項
編輯器（`ConfigScreen.vue`）用 `worldlens-config-editor-tabs`，每個 config 畫面一個 tab，再加 history；
專案編輯器（`ProjectEditor.vue`）用 `worldlens-project-editor-tabs`，包括 Maps、storages、點樣 render，
同四個 whole-file singleton。

`renamePage(pageId, label)` 就係宿主事後用嚟令一個 tab 嘅標籤保持最新嘅方法 —— 一個頁面自己嘅 `label`
淨係讀一次，即係第一次為佢種 tab 或者開 tab 嗰陣，所以好似 "Maps (3)" 呢種即時計數，就要宿主喺個數字
變嗰陣明確噉推一次 rename 入去。

**`AppearanceEditor.vue` 係唯一一個刻意保留普通 `v-tabs` 嘅設定類介面**，而且喺自己嗰個檔記低咗，唔係
留個靜默缺口：佢係一個細細、貼住嚟擺、非 modal 嘅 popover，一次淨係編輯一個元素，得三個永久 tab，永遠
唔會被開、閂、重排或者搵，所以條 strip 成套嘢 —— overflow、開新 tab 嘅控制項、每個 tab 嘅選單、四個可
搜尋嘅 tab 介面、批量關閉 —— 喺嗰度根本冇對象。不過佢嘅 Surface 同 Presets 兩個 tab 一樣各自帶住自己
嘅 `ConfigSearchField` 同完整 regex builder，因為 regex-builder 呢條規則冇噉嘅尺寸豁免。

### 每種排序只有一個權威

`tabModel.ts` 係純資料同純函數：冇 DOM、冇時鐘、冇 storage、冇 Vue。瀏覽器式 tab 最麻煩嗰啲部分係排序
規則而唔係 render，而每一種次序都剛好有一個欄位擁有佢，其他嘢一律唔准去暗示佢。原文嗰個表講四個欄位：
`tabs` 擁有 tab 嘅集合，用 id 做 key，佢個 array 次序本身冇意思；`pinnedOrder` 擁有釘住區由左到右嘅
次序；`slots` 擁有普通區，入面一個 slot 要就係一個未分組嘅 tab，要就係一整個群組 —— 得一張清單，所以
普通 tab 次序同群組次序唔會互相矛盾；`TabGroup.tabIds` 擁有群組入面嘅次序。

所以每個 id 都剛好出現喺一個地方，而 `normalizeStrip` 會對任何由磁碟讀返嚟嘅嘢強制執行呢點。另一種做法
—— 一個 tab array，其餘靠 filter 推導 —— 睇落幾順，直到有人釘住一個 tab：嗰刻佢個位置同時代表兩樣嘢，
之後每個操作都要估用戶想講邊樣。

**釘住會將一個 tab 由佢個群組度攞走。** 一個釘住嘅 tab 住喺釘住區，一個分咗組嘅 tab 住喺佢群組嗰段
入面；呢個係畫面上兩個位置，一個 tab 唔可以同時喺兩邊。如果保留住成員身分而淨係喺群組嗰段度收埋佢，
噉每個群組嘅搜尋就會報一個明顯唔喺個群組入面嘅 tab —— 噉衰過失去成員身分，因為嗰個係講大話，唔係損失。

### 一個全新 workspace 開出嚟係點

外殼有十二個目的地，每一個都係某啲人開呢個應用程式嘅全部理由，所以一個都唔會刪。但如果種成十二個平面、
權重一樣嘅 tab，佢哋就係新手撞到「好雜亂」嘅最大來源：佢頭一日需要嗰兩樣，同九樣遲啲先需要、加一樣卡住
先需要嘅嘢排埋一齊，同一種字體，冇一個解釋到另一個。

所以 `App.vue` 傳 `initial-groups` 落去，一個未有任何儲存紀錄嘅 workspace 會改為開成四行散 tab 加三個
具名群組。原文嗰個表講清楚點分：Home 釘住喺最前、喺所有群組之外，因為釘住區就係令佢留喺嗰度嘅嘢，由
`pinned-page-ids` 指名；散住嘅有 Map、Make a map、Docs —— 前兩樣係新手真係會做嘅嘢，Docs 就係其餘一切
開始講唔通嗰陣佢會伸手去攞嗰樣，而 Docs 得一個 tab，一個淨係裝住一個 tab 嘅群組只係一個收埋一行嘅標題；
**Rendering** 群組裝住 Projects、GitHub runners、Renders，即係一個 render 點設定同佢做緊乜 —— 專案帶住
嘅設定、「render 喺邊度行」嘅第四個答案，同進行中嘅數量；**Finished maps** 群組裝住 Maps and servers、
Publish to Pages、Watch it live，即係一張已經存在嘅地圖，同睇得到佢嘅三個地方：本應用程式自己嘅清單、
第二個人嘅靜態寄存，同呢部電腦由自己磁碟供應；**Keeping a copy** 群組裝住 Backups 同 World repository，
即係將一個世界或者一次 render 擺到唔止呢一部機嘅兩種方法：一次有版本嘅 GitHub 上載，同一個第二部電腦
可以接手嘅 git repository。

有三樣嘢佢刻意唔係：

- **佢唔係一個固定結構。** 一個種出嚟嘅群組，由畫出嚟嗰一刻起就係普通群組：改名、換色、拖個 tab 出去、
  重排、保住所有 tab 噉解散佢、刪咗佢，都得。結果就係會被持久化嘅嘢，之後亦冇任何嘢會再套返個 seed。
- **佢唔會套落一個已經存在嘅 workspace。** `seedStrip` 淨係喺 `readTabWorkspace` 回傳 null 嗰陣先行，
  同佢一路以嚟嘅條件一樣。返返嚟嘅用戶嘅次序、釘住、群組同收埋狀態會原封不動噉還原；一條有人親手排過
  嘅 strip，永遠唔會被重新塑造去夾一個佢從未見過嘅預設。下面講嘅升級路徑 `ensurePage` 亦係同一個理由，
  會將佢加嘅 tab 擺喺**所有群組之外**。
- **佢冇收埋任何嘢。** 啲群組係種成**開住**嘅，所以第一次開機十二個目的地全部喺畫面上，唔使先撳開任何
  披露控制。呢個係刻意嘅，亦係呢件事最容易搞反嗰一半：目標唔係一條短啲嘅 strip，而係一條睇得明嘅
  strip，而群組上面嗰啲名，就係阻止十二個目的地讀落好似一張冇分別嘅清單嗰樣嘢 —— 無論成員有冇顯示都
  一樣。喺呢個之上再收埋，就係攞走咗目的地而唔係攞走雜亂，仲會令去到嗰啲目的地變成要靠撳到一個控制項，
  而噉嚴格嚟講弱過根本唔使控制項。呢樣嘢第一個版本真係種成閂咗嘅，而 capture harness 量到個代價：喺
  一條自己嘅診斷報告話每個群組都齊、有名、正確嘅 strip 上面，有五個目的地佢去唔到。

  收埋呢個功能就留返喺佢應該喺嘅位置 —— 讀者對佢自己決定唔需要嗰啲區段做嘅嘢 —— 而一個收埋咗嘅群組
  一樣冇收埋任何嘢：佢啲成員仍然喺 strip 嘅 model 入面、仍然出現喺每個搜尋、仍然會被批量關閉數埋、亦
  淨係差標題嗰一撳。`revealPage` —— command palette、一次完成咗嘅 render，同一條 glossary 連結全部行
  呢條路 —— 會經 runtime 嘅 `revealed` 集合，去揭開裝住佢啟用嗰個 tab 嘅收埋群組，所以條 strip 永遠
  唔會顯示一個 tab 唔喺畫面上嘅 panel，而個群組儲存低嘅偏好一樣冇被改寫。

機制係 `tabModel.ts` 入面兩個純函數，兩個都喺 `tabModel.test.ts` 度證咗：`seedTabOrder` 決定啲 tab
建立嘅次序（先係未分組嘅頁面，按宣告次序，然後每個群組嘅頁面），呢個就係令啲群組跟住散 tab 之後、按
宣告次序落位嘅原因，而唔係落喺 `createGroup` 嗰條「以佢第一個成員嘅位置為準」規則喺一張交錯清單上面
計出嚟嗰種算術上啱但估唔到嘅位置；`applyGroupSeeds` 就每個 seed 開一個群組，會跳過已釘住嘅 tab（釘住
贏 —— 釘住區就係「落地嗰個 tab 會留喺最前」呢個承諾）、跳過冇 tab 嘅頁面，而一個最後一個成員都冇嘅
seed 就乜都唔會開。

### 去到一個比已儲存 workspace 更後出現嘅頁面

`seedStrip` 一世淨係行一次，就係喺一個 workspace 檔完全讀唔到嗰一刻 —— 真係全新安裝，或者一個呢個
build 解析唔到嘅檔。還原一個現有嘅，永遠淨係修補已經喺度嘅嘢；佢唔會為一個儲存紀錄唔識嘅頁面憑空整個
tab 出嚟，因為「還原一半 layout，其餘即興發揮」同一個 bug 分唔出。呢樣嘢一路都冇問題，直到有一個頁面
出咗街，而所有安裝（升級定全新）都真係要搵得到佢 —— [the Home tab](./home.md) 正正就係呢個情況。

`TabbedNavigation.vue` 有兩件細細、範圍好窄嘅嘢畀宿主用，唔使自己重新發明：

- **`pinnedPageIds`**，一個 prop，指名邊啲 page id 喺佢哋第一次有 tab 嗰一刻就被釘住 —— 全新安裝嘅種
  tab 時，或者後來經下面嗰個 `ensurePage`。佢淨係喺建立嗰陣套用一次；之後有人親手取消釘住其中一個
  tab，唔會喺下次 mount 被反轉，因為「唔易失手整走」係關於一個頁面第一次出現嗰陣嘅承諾，唔係一條呢個
  component 會不斷對住用戶已經做咗嘅選擇再執行嘅常設規則。
- **`ensurePage(pageId)`**，一個對外方法，會為一個冇 tab 嘅頁面加個 tab，如果 `pinnedPageIds` 有指名
  就順手釘住，而且唔會郁到而家 active 嗰個 tab。個 tab 一存在佢就係 no-op，所以喺每次 mount 都 call
  佢係安全（亦夠平），唔使宿主自己整個一次性 flag。呢個係呢個 component 對外開放嘅三個可寫動作入面第三
  個、亦係最窄嗰個，同 `revealPage` 同 `renamePage` 並列：佢淨係做到為一個冇 tab 嘅頁面加 tab，永遠
  唔會郁、閂或者改名一個已經存在嘅。

### 唔會靜靜雞剪走任何嘢

當普通區裝唔晒所有 segment，裝唔落嗰啲會入 overflow 選單，粒掣會講明有幾多個。`fitCount` 會喺同一份
預算入面預埋 overflow 掣嘅位，因為唔係嘅話粒掣就會壓喺啱啱好裝到嗰個 tab 上面，而一個匿喺掣下面嘅
tab，正正就係呢樣嘢想防止嘅失敗。闊度每個 segment 量一次然後 cache：一個收埋咗嘅元素量出嚟係零，而
由零重新計就會喺幾個狀態之間跳來跳去。

釘住區會最先由預算度量走，而且永遠唔會 overflow，所以無論開咗幾多個普通 tab，一個釘住嘅 tab 都仲去到
到。條 strip 迫嗰陣釘住嘅 tab 會 render 成 compact 樣，但保留完整嘅 accessible name，所以 screen
reader 讀出嚟嘅嘢唔會跟住粒掣一齊縮水。

### 四個實體邊，一次一條軸

Strip 嘅位置揀選器提供 **left**、**right**、**top** 同 **bottom**。就算喺由右至左嘅語言，left 同 right
都係實體邊：改閱讀方向唔會郁走一條用戶明確噉泊咗喺視窗某一邊嘅 strip。全新嘅 strip 由左邊開始。

改位置係改真嘅 layout，唔係喺舊嗰個入面轉啲標籤。left 同 right 用一條直 strip 貼住個 panel；top 同
bottom 用一條橫 strip 喺佢上面或者下面。Overflow 量度、拖放排序、位置 sheet 同 tab 清單全部跟嗰條軸。
鍵盤導覽都跟：直 strip 用 Up/Down、橫 strip 用 Left/Right，而橫向移動跟文件嘅 RTL 方向。Home 同 End
喺兩條軸都仍然去到第一同最後一個睇得見嘅 tab。

`setTabPlacement` 將呢個選擇寫入 strip 狀態。儲存 schema v2 淨係加咗嗰個欄位；載入一個 version-1 紀錄
會保住佢啲 tab、釘住、群組、次序、收埋狀態、成員身分同 appearance，並且為缺咗嗰個位置補 `left`。一個
無效嘅位置會修返做同一個安全預設，而唔係掉咗成個仲讀得到嘅 layout。

### 群組（Groups）

群組可以建立、命名、改名、由七個 Material role 揀顏色、重排、收埋、展開同移除。一個群組會攞佢由第一個
tab 嗰個位置，所以用人哋正望住嗰啲 tab 整出嚟嘅群組，會出現喺佢望緊嗰度，而唔係去咗 strip 尾。**移除
一個群組唔會閂到任何 tab**：佢啲成員會變成孤零零嘅 tab，留喺原本個群組佔嘅 slot 度。

一個收埋咗嘅群組係一個顯示狀態，唔係話佢啲 tab 冇咗。佢啲成員一樣被搵、一樣被數，亦一樣會被 close-to-
the-right 閂到。絕對唔可以發生嘅係一個搜尋結果將嗰個偏好寫返落去，所以一個為咗顯示命中而被揭開嘅群組，
係畫面上展開咗，但磁碟上冇變。宿主導覽去一個 tab 喺收埋群組入面嘅頁面嗰陣，`revealPage` 用嘅就係同一個
runtime reveal。

宿主亦可以畀一張群組清單去 `TabbedNavigation`，用嚟種一個**全新**嘅 workspace —— 睇
[What a fresh workspace opens as](#what-a-fresh-workspace-opens-as)。嗰啲係預設，唔係結構：佢哋一存在
就係普通群組，之後亦冇任何嘢會再套返。

### 四種搜尋

每一種都係一個獨立函數，行喺佢自己嘅範圍上面，加一個由呼叫者用自己嘅查詢、模式同 flag 砌出嚟嘅
matcher。`tabSearch.ts` 入面冇嘢持有狀態，所以四個欄位就係四個 matcher，冇任何共用嘢好畀佢哋漏過去。
原文嗰個表列出四種：`searchStripTabs` 搜尋當前 strip，包括 overflow 介面入面嘅 tab 同收埋群組嘅成員，
render 喺 `TabFinder`；`searchGroupTabs` 淨係搜尋一個指名群組、群組以外嘅一律唔搵，render 喺
`TabGroupMenu`；`searchGroups` 搜尋跨所有 strip 嘅群組名，render 喺 `TabFinder`；`searchAllTabs`
搜尋所有視窗、所有 strip 入面嘅每一個 tab，同樣 render 喺 `TabFinder`。

被搜尋嘅係睇得見嘅標籤，而且淨係佢：唔係 tab 後面嗰個頁面、唔係 id、亦唔係 tab 裝住嘅任何嘢。一個人
搜一條 tab strip 嗰陣，係想搵一個佢見到嘅字，而一個靜靜雞夾到隱藏文字嘅搜尋，會閂咗啲標籤根本冇包住個
查詢嘅 tab。一行結果會講明佢嘅視窗、strip、群組、釘住狀態同位置，因為兩個喺唔同視窗都叫 "Settings" 嘅
tab 否則分唔出。

### 五種批量關閉，同佢哋前面嗰個 plan

`planTextClose` 涵蓋「閂含有某段文字嘅 tab」同「閂唔含有某段文字嘅 tab」；`planCloseOthers` 同
`planCloseToEdge` 涵蓋 close-others 同 close-to-start / close-to-end。

**含有同唔含有，字面上就係一個 predicate 同佢嘅否定。** 一個 `SettingMatcher`、一個 `direction`、同一個
`matcher.test` 行喺同一個合資格集合上面，淨係反咗個符號。兩份實作會喺大小寫、Unicode 同認邊啲 flag
上面漂移，而佢哋唔一致嗰日，一對用戶合理噉相信係窮盡嘅動作，就會靜靜雞留低兩邊都掂唔到嘅 tab。單元測試
係去證明個分割，唔係信個形狀：對任何查詢、任何一個模式，兩個集合都互不相交，而且合埋覆蓋每一個合資格
嘅 tab。

**每個函數都回傳一個 plan，唔會閂任何嘢。** 個 plan 會喺任何一個 tab 消失之前，講明匹配模式、邊啲 tab
喺範圍內、邊啲會被閂、邊啲因為釘住而受保護，同邊啲裝住未儲存嘅工作。可覆檢嘅預覽*就係*嗰個 plan，唔係
再計多次，所以預覽同真正關閉唔可能對唔到數。個 plan 自己帶住佢嘅範圍，所以畫面上嗰句嘢同真正被閂嗰堆
係同一個來源，一個有範圍嘅動作亦唔可以靜靜雞跨越群組邊界。

釘住嘅 tab 除非用戶另外話事，否則唔喺範圍內，而且會逐個名列出，令預覽顯示到個保護救咗啲乜。裝住未儲存
工作嘅 tab 另外列一批：佢哋係夾中咗、佢哋唔受保護，而閂佢哋係一個決定，唔係一個文字查詢嘅副作用。
`applyClosePlan` 會報告佢實際閂咗乜同留低咗乜，所以一個部分完成嘅結果永遠唔會當成完整。執行一個 plan
要行過 [super-confirmation gate](./super-confirmation.md)。

### 設定（Configuration）

原文嗰個表講三樣。儲存 key：預設係 `localStorage` 入面嘅 `worldlens-tabs`，不過每個宿主都會改為傳自己
嘅 `storageKey` prop —— 睇 [Where it is mounted](#where-it-is-mounted)；舊嗰套 key 前綴（即係舊產品名
嗰個帶星號嘅 key 樣式）淨係喺對應嘅現行 key 唔存在嗰陣先會被複製過嚟。儲存形狀版本：`TAB_STORAGE_VERSION`，
而家係 2，所有 `storageKey` 共用；version 1 會 migrate 而唔會失去佢現有嘅 layout。群組顏色：`primary`、
`secondary`、`tertiary`、`success`、`warning`、`error`、`info`，預設 `primary`。

會持久化嘅有：strip 位置、tab 次序、釘住次序、群組、群組次序、收埋狀態、成員身分，同每個 tab 同群組
嗰份不透明嘅 appearance 紀錄。

刻意唔持久化嘅有：

- **`dirty`。** 一個喺應用程式閂嗰陣裝住未儲存工作嘅 tab，下次開機唔會仲裝住：件工作要就儲咗，要就冇
  咗，而還原一個 `dirty: true` 就係講大話，跟住仲會無端端保護咗嗰個 tab 唔畀批量關閉閂到。
- **搜尋查詢同 regex pattern。** 佢哋唔係普通嘅 layout 偏好，佢哋可以載住一個人打過嘅任何嘢，而冇理由
  噉儲低佢哋，係同想要嘅嘢完全相反。每個欄位開機都係空。

`appearance` **就係**會原封不動噉來回儲存，而且唔會被檢視。呢個資料夾入面冇任何嘢會讀嗰啲紀錄嘅內部，
所以一份由新啲嘅 build 寫嘅紀錄，經舊啲嘅 build 來回一次都仲生存到，唔會靜靜雞被清空。

### 失敗情況（Failure modes）

- **儲存被拒或者滿咗。** 兩個方向都會食咗佢。後果係一個捱唔過重啟嘅 layout，煩係煩，但完全去唔到要
  通知嘅程度。
- **一個呢個 build 讀唔到嘅已儲存檔案。** 會種預設值出嚟，而唔係還原一半。個 version 欄位就係將來有
  改動令 `normalizeStrip` 修唔到嗰陣，拒絕一個舊檔而唔係讀一半嘅方法。
- **形狀啱但內部自相矛盾嘅檔案**，例如一個 tab id 同時喺一個群組同釘住次序入面。`normalizeStrip` 會
  修返，因為呢個檔案可以人手改，亦會畀呢個應用程式其他版本寫。
- **空查詢或者編譯唔到嘅 pattern。** 個 plan 乜都唔會閂。唔係淨係喺介面上 disable 咗：`selected` 係
  空，所以就算一個呼叫者無視 `runnable`，一樣閂唔到嘢。
- **最後一個 tab 閂咗。** 條 strip 會留低一個老實嘅空狀態，唔係一個白框。
- **閂唔到嘅 tab** 會報做保留咗，唔會當成閂咗噉數。

### 保安考慮（Security considerations）

呢度冇任何嘢掂網絡，亦冇任何嘢離開部機。淨係 layout 會被持久化；查詢、pattern 同 tab 內容都唔會。

搜尋同批量關閉淨係讀睇得見嘅標籤，所以兩者都唔可以攞嚟夾用戶睇唔到嘅嘢。所有匹配都行喺本機嘅 `RegExp`
引擎上面，並受 `components/config/regexEngine.ts` 訂明嘅界限約束（pattern 512 字元、樣本 20000 字元、
500 個匹配、每次預覽行 100 ms），呢個就係阻止一個病態 pattern 凍死條 strip 嘅嘢。

批量關閉係破壞性，亦當成破壞性去處理：一個可覆檢、逐個列出受影響 tab 嘅預覽、釘住嘅 tab 除非刻意加入
否則排除、未儲存嘅工作另外點名，同埋任何嘢執行之前嗰道兩把鎖匙嘅閘。

### 無障礙（Accessibility）

一個 `role="tablist"`、每個 tab 一個 `role="tab"`，而 `aria-controls` 淨係擺喺選中嗰個 tab 度，因為其他
panel 冇 render，而指住一個唔存在嘅元素衰過乜都唔指。剛剛好一個 tab 帶 `tabindex="0"`，所以 Tab 鍵去到
條 strip 一次，之後就用啱嗰條軸嘅方向鍵喺入面郁，Home 同 End 去兩頭。Enter 同 Space 啟用有焦點嗰個
tab，唔會開任何 overlay。群組標題係 tablist 入面嘅一粒掣而唔係一個 tab：方向鍵會跳過佢，佢會報自己個
名、數量同展開狀態。收埋群組入面嘅 tab 唔喺焦點次序入面，因為焦點落咗喺一件冇畫出嚟嘅嘢度，睇落好似
撳咗個掣乜都冇發生噉 —— 但佢哋仍然留喺條 strip 同每個搜尋入面。Compact 嘅釘住 tab 保留完整 accessible
name。右鍵選單入面有鍵盤捷徑嘅項目會喺標籤隔籬顯示個捷徑，而且係由綁定佢嗰個 handler 攞返嚟，所以兩者
唔會漂移；冇捷徑嘅項目帶一個明確嘅 null，乜都唔顯示，唔會擺個佔位符。個選單自己帶住 filter 欄位，因為
一個人 filter 一個選單嗰陣，佢打緊嘅係佢喺上面讀到嘅嘢。

### 驗證（Verification）

原文嗰個表講七個測試檔守住乜。`tabModel.test.ts` 守住每條排序規則：一個取消釘住嘅 tab 落喺邊、一個被
移除嘅群組啲成員會點、active 嗰個閂咗之後邊個變 active、釘住會清走成員身分、經 `normalizeStrip` 之後
每個 id 都剛好住喺一個地方、四個有效位置、overflow 算術（包括為 overflow 掣預位），同埋種 tab 嘅算術
—— 建立次序、群組跟住散 tab 之後按宣告次序落位、預設收埋、已釘住嘅 tab 保持釘住、冇 tab 嘅頁面跳過、
同一個種出嚟嘅群組一樣應到所有普通群組指令。`tabSearch.test.ts` 守住四個範圍各自獨立搜尋、搵到收埋
群組嘅成員、命中帶住視窗/strip/群組/釘住狀態/索引，同埋淨係夾睇得見嘅標籤。`closePlans.test.ts` 守住
任何查詢喺任何模式下嘅分割性質、空查詢或者編譯唔到嘅查詢會出一個乜都唔閂嘅 plan、釘住同未儲存嘅 tab
被留低同點名、plan 帶住範圍，同 `applyClosePlan` 老實噉報告保留咗嘅 tab。`tabStorage.test.ts` 守住位置
同六種持久化次序嘅來回、schema-v1 migration 淨係為缺咗嗰條邊補 left、`dirty` 被掉走、查詢同 pattern
永遠唔寫低、appearance 紀錄原封保留、被封鎖嘅 storage 保持沉默，同一個呢個 build 讀唔到嘅檔改為種預設。
`tabMenus.test.ts` 守住選單自己嘅搜尋只會 filter 項目，唔會改佢哋做嘅嘢。`TabbedNavigation.test.ts`
mount 起身守住：roles 同 roving focus、選取會令 panel 同 tab 次序一齊郁、四條邊上識軸嘅方向鍵（包括
RTL）、Enter/Space 啟用、Home 同 End、公告咗嘅鍵盤指令、位置揀選器同持久化還原、compact 釘住 tab 保住
個名、收埋群組畫成一個有名、數量同狀態嘅標題而佢啲成員唔喺焦點次序、展開會寫低偏好、`revealPage` 會
啟用一個已存在嘅 tab、重開一個閂咗嘅或者揭開收埋群組嘅 tab 而唔改寫偏好，同 `renamePage` 會為一個頁面
重貼所有開住嘅 tab 標籤而唔會掂到顯示緊另一個頁面嗰個；種 tab 方面：全新 workspace 開出嚟係散 tab 加
具名收埋群組、釘住嘅落地 tab 排最前而且喺群組之外、每個宣告咗嘅頁面都仲喺度、展開一個標題會顯示嗰個
群組嘅成員而且淨係寫嗰個群組嘅偏好、成個結構經一次儲存同重載都生存到、一個已儲存嘅 workspace 原封不動、
`ensurePage` 會將後加嘅頁面加喺所有群組之外，同埋一個唔宣告群組嘅宿主一樣好似以前噉每頁種一個散 tab。
`projectSurfaceSizing.test.ts` 守住專案編輯器、tab strip、搜尋控制項同即時速度控制項保持 44px 觸控目標、
文字會換行、響應式堆疊，同受 viewport 限制、可捲動嘅 overlay，而唔係喺窄闊度下被切走。

喺 `design/` 度用 `npx vitest run packages/ui/src/components/tabs` 行呢啲測試。

### 建議閱讀（Suggested reading）

- [Home](./home.md)，唯一一個所有安裝（全新定升級）都保證有釘住 tab 嘅頁面，亦係
  `pinnedPageIds`/`ensurePage` 存在嘅理由。
- [Super confirmation](./super-confirmation.md)，佢企喺每次批量關閉前面。
- [The regex builder and the search bars it reaches](./regex-builder.md)，佢供應四個 tab 搜尋同兩個
  批量關閉欄位。
- [Appearance editors](./appearance-editors.md)，佢擁有 tab model 帶住但從來唔讀嗰啲紀錄。
