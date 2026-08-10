# Home

Eight unexplained tabs used to be the first thing a brand-new install showed a person, the
instant the tab strip mounted and before the first-run dialog even finished asking its own
questions. "Opening new tabs, people won't know where to go at first" is the exact complaint that
produced this page: one landing tab that names every capability this application has, weighted so
a newcomer sees the single obvious next step and a returning user sees what they were doing last.

The code is `design/packages/ui/src/components/home/`. `HomeScreen.vue` is the whole surface;
`homeCatalog.ts` is the pure logic behind one capability card (matching a search, building its
searchable text); `homeState.ts` is the one preference Home remembers about itself.

## Behaviour

### A tab, not a dialog and not a wizard step

Home is `App.vue`'s `PAGE_HOME`, first in the declared page list and pinned from the moment its
tab exists - at seed time on a genuinely fresh install, and through `TabbedNavigation.vue`'s
`ensurePage` for a workspace an earlier build already saved, so an upgrading install gets it too,
without moving whichever tab that person was already looking at. Being a tab rather than a modal
is deliberate: every other page, the whole tab strip's own mechanics - overflow, reordering,
pinning, grouping, its four discovery searches, and its persistence across restarts - keep working
exactly as they did before this page existed. Home is additive; nothing about "opening a new tab"
changed to make room for it.

### Where first-run setup actually lands

Finishing first-run setup - "Finish setup" on the last step, whichever way consent was
answered - is what actually puts Home in front of a brand-new install. `App.vue`'s
`onFirstRunFinished` used to call `revealPage("world")` directly the instant setup completed,
which switched straight past Home to the wizard every single time; Home existed, was fully
built, and a genuine first-time user never saw it unless they happened to notice and click its
own pinned, icon-only tab first. `onFirstRunFinished` now calls `revealPage("home")` instead, so
the moment setup finishes a newcomer lands on the page built to answer "where do I start" -
Home's own hero card is "Make a map", weighted `primary`, so the wizard stays exactly one click
away rather than being taken from anyone. This only ever fires once, the instant a first-time
user's own setup completes, so a returning user with a saved workspace is untouched: they come
back to whatever tab they last left active, exactly as before.

Pressing "Start here" inside the standalone "what is this?" panel (`WelcomeSurface.vue`) is a
different, deliberate case and still goes straight to the wizard, unchanged: it is an explicit
click from someone already reading that panel's own description of what the wizard does, not the
first moment a new install shows anybody anything.

### Openers, not links

The failure this page exists to fix is not "the destinations are hidden", it is "arriving
somewhere and being left to work out what to click". So a capability card's action is the same
verb the command palette already uses for the same destination: `emit("reveal-page", "world")`
switches to the guide's own tab exactly as clicking that tab would; `emit("open-settings",
"github-account")` opens the Settings sheet scrolled to, focused on and outlined at that exact
row; the viewer's own Maps/Settings/Info/Markers/Players tiles call `app.appState.menu.openPage`
directly, the same call the in-viewer menu makes. Every one of these handlers already existed in
`App.vue`, written for the command palette; Home reuses them verbatim rather than inventing a
second, inevitably drifting way to open the same surface.

### One deliberate order, not a wall of equal cards

The first version of this page named every capability and then showed all twenty-five of them at
once, in one grid of identically weighted cards. That answers "what can this do" and not "what do
I do now", which is the question a newcomer actually arrives with - so the same cards are now
weighted and disclosed rather than poured out. Rendered top to bottom:

1. **The one-sentence explanation** - what BlueMap actually makes - shown by default and
   collapsible, remembering that choice (`homeState.ts`) so a newcomer reads it once and a
   returning user never has to scroll past it again. "Tell me more" opens the standalone "what is
   this?" panel (`WelcomeSurface.vue`) rather than repeating its prose here a second time.
2. **The search field**, which replaces everything below it the moment it has a query.
3. **Continue** - only for a returning user with something to continue: every profile except the
   seeded demo server, each opened by making it the active map. It keeps its precedence above the
   hero: somebody who already has a map wants that map, not the guide that would make another.
4. **The hero** - the single `primary` capability, "Make a map", full width, on
   `primary-container`, carrying the page's only large button. Not one tile among equals: a grid
   of identically weighted cards has no answer in it to "where do I start", which is the exact
   complaint this page exists to fix. There is deliberately only one, because a page with two
   primary actions has none. It is never a disabled card either - "Make a map" is the remedy every
   gated capability below points at, so there is nothing for it to be waiting on.
5. **The rest of "Get started"** - the explanation panel and the interactive tour - as two
   supporting cards beneath the hero, on `surface-container-high`.
6. **Everything else**, in the same five sections as before, each one a collapsed disclosure:
   making and managing maps, sharing and backing up, learning (docs, the licence), settings and
   tools, and - only while a map is actually open - that map's own menu. A "Show every section"
   control opens all five at once for anyone who would rather see the whole inventory.

### Collapsed is not hidden

Every section keeps every card it had. What changed is that a newcomer sees the headings first:

- A section heading is a real `<button>` inside a real heading element, labelled with what the
  section holds **and how many** - "Share and back up (2)", "Settings and tools (9)". A section
  that folded its cards away without saying how many it took with it would be hiding them rather
  than tidying them, so the count is part of the visible label rather than a badge or a tooltip.
- The five sections default to collapsed and the choice is remembered per section, for good
  (`homeState.ts`, key `worldlens.home.expandedSections`). The default is never re-applied over a
  choice somebody made.
- An empty section is dropped rather than headed with "(0)" - "The open map" with no map open is
  a control wired to nothing, which is the same rule the command palette holds that group to.
- **Search bypasses the disclosure entirely.** The flat result grid is built from the full
  capability list, collapsed sections included, so a card being folded away never makes it
  unfindable. `HomeScreen.test.ts` holds that directly: with every section in its newcomer
  default, searching for "point of interest" - a keyword only the collapsed viewer section's
  Markers card carries - returns that card.

### Surfaces rather than outlines

The hierarchy is carried by Material's own surface roles, which `vuetify.ts` now defines in full:
`primary-container` for the hero, `surface-container-high` for the two orientation cards,
`surface-container` for a section's own heading button, and `surface-container-low` for the
capability cards. Nothing on this page draws a border to say "this is a thing", and no colour
here is a hex literal - every one is a `--v-theme-*` role, so the page follows the light, dark
and high-contrast themes without a second copy of the palette to keep in step.

### Honest about what is not ready yet

Backups and Publish to Pages both need a map already rendered on this computer, and both say so in
the same sentence (`home.tile.needsRenderedMap`) rather than presenting a control that would fail
the moment it was pressed. Per the project's guided-forms rule, the disabled state names the exact
remedy and offers it as a real button - "Make a map" - not merely a reason. The moment a map exists
the sentence and the disabled state both disappear and the real action becomes pressable; nothing
here is a static illustration of a control.

### Search

`ConfigSearchField` with its anchored regex builder, the same component every other search bar in
this application uses, searching each card's group, title, description, keywords and (when
present) its disabled reason - so "render a map first" is itself a findable phrase. Plain text is
the default; regex is an explicit opt-in. Searching replaces the guided layout with one flat,
honest result list (mirroring the in-app documentation browser's own search results), and an empty
result says so in words with a one-click way back to the full page.

### Everything a card can carry

`HomeCapability` (`homeCatalog.ts`) is deliberately small: an id, a group, a title, a description,
an icon, search keywords, an optional disabled reason with its remedy, and the action itself. A
card whose action is unavailable is never merely greyed out with no explanation - it either shows
the remedy button in its place or names the unmet condition beside a disabled one, which is the
same honesty rule the rest of the application already holds every guided form to.

### Bulk actions do not apply here

The project's shared rule is that every list, table, grid and collection supports bulk actions,
because repeating an action forty times over one item at a time is the app failing to do its job.
The capability grid is deliberately exempt, and this is that exemption written down rather than a
silent gap:

- Every card is a fixed navigation entry to a destination this build already has - "Make a map",
  Settings, Docs, the config editor and the rest - not a record a user created, owns, or can
  meaningfully act on in a batch. There is nothing to select forty of: the grid does not grow or
  shrink with what the user does, it is the same catalogue of destinations for everyone.
- Each card's single action is heterogeneous, not the one operation the bulk-actions rule assumes
  (delete, export, move, tag, retry, enable/disable). "Open the guide", "open Settings at the
  GitHub row", and "open the config editor's history screen" cannot sensibly be selected together
  and run as one batched verb, because they are not the same verb wearing different data.
- The actual collections a card's destination leads to already carry their own bulk-actions story
  on their own surface, which is where the rule properly applies: the maps-and-servers list
  (`ProfileManager.vue`) owns the profiles, the notification centre owns the notices, and the docs
  browser owns the articles. Home is the door to each of those rooms, not a second copy of the
  room.

The one place Home comes close to a "collection" is the Continue row - every rendered profile
except the seeded demo server, each opened by making it the active map. It is still a launcher
list rather than a record collection for the same reason: "continue" is a single per-profile
action with no batched equivalent, and managing those profiles (renaming, removing, bulk-closing)
is `ProfileManager.vue`'s job, reached through its own tab.

## Reuse over duplication

Descriptions are pulled from the catalogue entries other surfaces already voice -
`palette.page.world`, `palette.shell.settings`, `docsViewer.lede` and the rest - rather than
rewritten here. Two surfaces describing one destination in two different sentences is how they
drift out of agreement about what a button actually does; reusing the key is what keeps Home and
the command palette saying the same thing about "Make a map" for as long as both files exist, at
the cost of zero new copy for the dozen cards that map onto an existing page or shell surface. Only
what is genuinely new to Home - its own heading, its search chrome, its section headings, its four
disclosure labels (`home.section.everythingElse`, `home.section.count`, `home.sections.showAll`,
`home.sections.hideAll`), and the one "render a map first" sentence Backups and Publish to Pages
share - lives in `copy/surfaces/home.ts`.

The hero's own eyebrow is the same rule applied once more: it renders
`setupI18n.t("action.startHere")`, the words the standalone "what is this?" panel already puts on
its own button, rather than a fifth new key that would eventually disagree with it.

`palette.page.map`, `.world`, `.projects`, `.ciRender`, `.servers`, `.backups` and `.pages` used to
render their English fallback in every language, at every funny level, despite `components/palette`
already appearing on the catalogue's covered list: `paletteCatalog.ts`'s own `PAGE_NOTES` reads
them through a variable (`t(note.description[0], note.description[1])`), which is invisible to
`catalogueCoverage.test.ts`'s literal-string scanner. Home calls the same seven keys with a literal
string - the ordinary and correct way to call `t()` - which is what actually surfaced the gap.
They are voiced in `copy/surfaces/home.ts` rather than `palette.ts` - that module's own
`palette.test.ts` requires every key it carries to have a literal call site under
`components/palette/`, and Home's is the only one that exists - but the fix reaches both call
sites regardless, since the catalogue is one merged set keyed by string.

## Configuration

| Setting | Where it lives | Default |
|---|---|---|
| Whether the introduction is collapsed | `homeState.ts`, key `worldlens.home.introCollapsed`, through `setupStorage()` | Expanded |
| Which secondary sections are open | `homeState.ts`, key `worldlens.home.expandedSections`, through `setupStorage()` | All collapsed |
| Whether Home's tab is pinned | `TabbedNavigation.vue`'s `pinnedPageIds` prop, applied once at the moment Home's tab first exists | Pinned; unpinning it by hand is never re-applied |

Both preferences are mirrored into the shared application-settings history under the single key
`home`, registered in `stores/appSettingsHistorySync.ts`'s `APP_SETTINGS_HISTORY_KEYS` and held to
its real call site by `appSettingsHistoryManifest.test.ts`. `localStorage` stays the source of
truth, exactly as `docs/config-history.md`'s staged plan says; the mirror is fire-and-forget and a
failed history write never turns a fold into an error.

The record stores the sections a person has **opened**, not the ones they have closed. An install
nobody has touched therefore stores nothing at all, and a section a later build adds starts
collapsed like every other one rather than inheriting "not in the closed list, so open it" from a
record written before it existed.

Nothing else about Home persists on its own. The tab's position, its pinned state after that first
moment, and its membership in any group all live in the ordinary tab-workspace record every other
tab already uses (`tabbed-navigation.md`).

## Failure modes

- **A capability is inside a collapsed section.** It is one press from the heading that names it
  and its count, and it is found by the search regardless, because the search runs over the whole
  capability list rather than over what is currently drawn. Nothing on this page can be reached
  only by having already opened the right section.
- **A card's destination cannot be reached.** Every action here is a shell action `App.vue` already
  performs for a button of its own; there is no case where Home offers a card whose action silently
  does nothing, because the card would not exist without a real handler wired up for it.
- **No map is open.** The viewer's own menu group (Maps, Settings, Info, Markers, Players, camera
  reset) is entirely absent rather than present and disabled, matching the command palette's own
  rule: a theme select or a camera-reset row wired to nothing would be exactly the decorative
  control this project refuses to ship.
- **Nothing has been rendered yet.** The Continue section does not render at all - not an empty
  list - and Backups/Publish to Pages both name the missing prerequisite with a working remedy
  beside it.
- **A search pattern fails to compile.** The result list shows nothing rather than the last good
  result, exactly as every other regex-builder-backed search in this application behaves.
- **An upgrading install's saved tab layout predates Home.** `ensurePage` adds a pinned tab for it
  on the next launch, without disturbing the tab that person was already on; a fresh install needs
  no such repair because Home is seeded (and pinned) like any other declared page.

## Security considerations

Nothing here reaches the network on its own. The search runs on the local `RegExp` engine under
the bounds `components/config/regexEngine.ts` states; no pattern or query is transmitted, logged or
persisted beyond the one collapsed/expanded boolean noted above. Every destination this page opens
is a surface the application already draws from local state; Home introduces no second, less
validated route to any of them.

## Accessibility

Home is a labelled `<section>`; its regions - the introduction, the continue row, "Get started"
with its hero, and "Everything else" - are each real headings, so a screen reader can move between
them the way it moves through any other document. The outline is a genuine hierarchy rather than a
flat run of same-level headings: `h2` for the page, `h3` per region, `h4` for the hero's own title
and for each collapsible section, `h5` for a card inside one.

Each collapsible section is a real `<button type="button">` inside its `h4`, carrying
`aria-expanded` and an `aria-controls` pointing at the panel it actually opens, so the heading
carries the level and the button carries the state. Being a native button is what makes Enter,
Space, tabbing and every assistive technology's own "activate" gesture work without this file
implementing any of them. It is not a `.v-btn`, so `global.scss`'s app-wide `:focus-visible`
outline does not reach it and it states its own - focus has to stay visible on the only control
into a collapsed section. The reveal is a 160ms fade that a `prefers-reduced-motion: reduce` block
in this component turns off outright, on top of the app-wide rule `global.scss` already applies.

Every capability card is a `role="list"`
item carrying a real button per available action, each with an accessible name that states which
capability it opens ("Open {title}") rather than a bare "Open". A disabled action's button is
disabled in the DOM, named the same way, and paired with the remedy button that actually resolves
it. The search field, the regex-builder toggle and the "clear the search" recovery button are all
ordinary keyboard-reachable controls with visible focus, and the whole page is wrapped in
`AppearanceTarget`, so it carries the same right-click "Edit appearance..." context menu, its own
search field, and the Shift+right-click editor shortcut as every other appearance target in this
application.

## Verification

| Test | What it holds |
|---|---|
| `homeCatalog.test.ts` | The pure logic: what a card's searchable text contains (including its disabled reason and its keywords), the one-line-per-card search sample, `filterCapabilities` against an inactive matcher, a plain-text match, a keyword-only match, an invalid pattern and catalogue-order preservation, and `groupCapabilities` filing each card under its declared section, in declared order, dropping an empty section rather than heading one, and leaving a card no section claims out of all of them. |
| `homeState.test.ts` | Both persisted preferences: the introduction defaults to expanded, round-trips a collapse and an expand, treats a junk stored value as expanded, and removes its record on expand rather than writing a second falsy value; the sections default to none open, round-trip one being opened without disturbing its neighbours, record an id once however often it is opened, read a record with stray whitespace as the ids it names, treat a section the record has never heard of as closed, remove the record once the last section closes again, and stay independent of the introduction's own flag. |
| `HomeScreen.test.ts` | Mounted. **The inventory**: the full set of capability ids is written out by hand and asserted exactly, with no map open and again with a live one carrying markers and players, so a future edit that drops a card fails here rather than passing quietly - and every rendered card is checked to carry a real button, so "present" means "reachable". **The hero**: exactly one, carrying the `primary` capability, outside every collapsible panel, opening the guide from its own action, and below "Continue" for a returning user. **The disclosure**: every section starts collapsed, states what it holds and how many ("Share and back up (2)"), expands and collapses on press without disturbing its neighbours, remembers the choice across a remount, reads a choice made before the mount out of storage, and opens and closes all five from one control. **Its semantics**: a real `<button type="button">` inside an `h4`, whose `aria-controls` names the panel that actually exists, under one `h2` with the regions as `h3`. **Search**: finds a card inside a still-collapsed section, searches the whole inventory rather than what is on screen (a keyword only the collapsed viewer section carries), counts against the full total, and puts the hero and every card back when cleared. Alongside those, everything the page held before: the viewer's own menu group is entirely absent with no map open and appears once one is; Backups and Publish to Pages name the missing prerequisite and offer the real remedy, then drop both the moment a map is rendered; the introduction shows by default and its collapse persists across a remount; the continue row is absent on a first launch and offers every rendered map by name once one exists; and every shell-owned action (Settings at an anchor, the options editor at a screen, the EULA panel, "what is this?", the command palette) emits rather than acting on its own, from a section a person has actually opened. |
| `appSettingsHistoryManifest.test.ts` | The `home` key in `APP_SETTINGS_HISTORY_KEYS` names `components/home/homeState.ts`, and that file really does call `recordAppSetting("home", ...)`. |
| `App.test.ts` | Mounted, from the shell: the strip now separates into nine pages with Home first, Home is reachable through its own pinned tab, and a freshly seeded workspace with no persisted layout starts on Home - the Map tab's own state message is reached by choosing it explicitly. Separately, and driving the real path rather than a pre-seeded workspace: a fresh install lands on Home the moment `FirstRunSetup` genuinely emits `finished` (not a pre-seeded workspace that would pass regardless of what the handler does), a returning user with a saved workspace stays on their last active tab rather than being forced back to Home, and pressing "Start here" inside the standalone "what is this?" panel still goes straight to the wizard, which is the one first-run-adjacent route this page's landing fix deliberately left unchanged. |
| `TabbedNavigation.test.ts` | `pinnedPageIds` pins a page's tab from the moment it is first seeded; `ensurePage` adds a tab for a page a saved workspace predates, pins it, and never disturbs the tab a returning user was already looking at; and neither ever re-pins a tab the user has since unpinned by hand. |
| `catalogueCoverage.test.ts` | `components/home` joins the list of surfaces every one of whose rendered keys has a real catalogue entry, in every language, at every funny level. |
| `overlayDismissalPolicy.test.ts`, `menuCoverage.test.ts` | Home's four `AppearanceTarget` regions are declared in both surfaces' inventories, so a future edit to `AppearanceTarget.vue` itself is the one place that keeps all four correct, and neither guard's own "did you forget to register a new one" check can silently pass this page by. |

Run them with `npx vitest run packages/ui/src/components/home packages/ui/src/App.test.ts
packages/ui/src/components/tabs/TabbedNavigation.test.ts` from `design/`.

## Suggested reading

- [The command palette](./command-palette.md), whose catalogue every capability card's copy and
  every opener's handler is drawn from.
- [Tabbed navigation](./tabbed-navigation.md), for the pinning, seeding and persistence mechanics
  Home's own tab relies on rather than reinventing.
- [The regex builder and the search bars it reaches](./regex-builder.md), which backs Home's own
  search field exactly as it backs every other one in this application.
- [Language modes and funny levels](./language-and-tone.md), for how Home's own prose - and every
  card's borrowed description - varies with the active mode and funny level.

## 廣東話

### 主頁 (Home)

以前一個全新安裝畀人見到嘅第一樣嘢，就係八個冇任何解釋嘅分頁 —— 喺 tab strip 一 mount 就出現，仲要係首次執行對話框啲問題都未問完。「Opening new tabs, people won't know where to go at first」呢句投訴，就係整出呢一版嘅原因：一個落腳嘅分頁，列出呢個應用程式所有能力，並且經過加權，令新手見到唯一顯而易見嘅下一步，而回頭用家見到自己上次做緊乜。

程式碼喺 `design/packages/ui/src/components/home/`。`HomeScreen.vue` 就係成個界面；`homeCatalog.ts` 係一張能力卡背後嘅純邏輯（配對搜尋、砌佢可搜尋嘅文字）；`homeState.ts` 就係 Home 記住關於自己嘅唯一一項偏好。

### 行為

#### 佢係一個分頁，唔係對話框，亦唔係精靈其中一步

Home 就係 `App.vue` 嘅 `PAGE_HOME`，喺宣告嘅頁面清單排第一，而且由佢個 tab 一存在嗰刻就釘住 —— 全新安裝喺 seed 嗰陣釘，而如果係之前嘅 build 已經儲低咗 workspace，就經 `TabbedNavigation.vue` 嘅 `ensurePage` 釘，所以升級上嚟嘅安裝一樣有，而且唔會郁到嗰個人本來睇緊嘅分頁。做分頁而唔做 modal 係特登嘅：其他每一版，以及成條 tab strip 自己嘅機制 —— overflow、重新排序、釘住、分組、佢四個探索式搜尋、以及重開之後嘅持久化 —— 全部同呢一版出現之前一模一樣噉繼續運作。Home 係加上去嘅嘢；「開新分頁」呢件事冇為咗佢改過任何嘢。

#### 首次執行設定完之後究竟落喺邊

真正令全新安裝見到 Home 嘅，係完成首次執行設定 —— 即係最後一步撳「Finish setup」，唔理同意選項點答。以前 `App.vue` 嘅 `onFirstRunFinished` 一設定完就直接叫 `revealPage("world")`，每次都跳過 Home 直落精靈；Home 明明存在、明明整好晒，但一個真正嘅初次用家除非啱啱好留意到再撳嗰個釘住嘅純圖示分頁，否則永遠見唔到。而家 `onFirstRunFinished` 改為叫 `revealPage("home")`，所以設定一完，新手就落喺專門回答「我由邊度開始」嗰一版 —— Home 自己嘅 hero card 就係 "Make a map"，加權為 `primary`，所以精靈仍然係一撳就到，冇人被剝奪過。呢件事一世只會觸發一次，即係初次用家自己設定完成嗰一刻，所以有儲存 workspace 嘅回頭用家完全唔受影響：佢哋照樣返到上次離開時 active 嗰個分頁。

喺獨立嘅「what is this?」面板（`WelcomeSurface.vue`）入面撳 "Start here" 就係另一種、特登保留嘅情況，仍然直入精靈、冇變：嗰個係一個已經喺度睇緊該面板講解精靈做乜嘅人所作出嘅明確點擊，唔係新安裝第一刻向人展示嘅嘢。

#### 佢哋係「開啟器」，唔係連結

呢一版要修嘅失敗，唔係「目的地被收埋咗」，而係「去到一個地方之後，被丟低喺度自己諗撳咩」。所以一張能力卡嘅動作，同 command palette 對同一個目的地所用嘅係同一個動詞：`emit("reveal-page", "world")` 切去指南自己嗰個分頁，同你撳嗰個 tab 一模一樣；`emit("open-settings", "github-account")` 打開 Settings sheet，捲到、聚焦到並且框住確切嗰一行；viewer 自己嘅 Maps/Settings/Info/Markers/Players 圖磚就直接叫 `app.appState.menu.openPage`，同 viewer 內部選單所叫嘅完全一樣。呢啲 handler 全部本來就已經喺 `App.vue` 度，當初係為 command palette 而寫；Home 原封不動噉重用佢哋，唔會另外發明第二套遲早會走樣嘅開啟方式。

#### 一個特登定嘅次序，唔係一幅同等份量嘅卡牆

呢一版第一個版本列晒每一項能力，然後將二十五張卡一次過用同一個權重排成一格網。噉樣答咗「呢個 app 做到啲乜」，但冇答「我而家做乜」，而後者先係新手真正帶住嚟嘅問題 —— 所以同一批卡而家係經加權同逐層展開，唔係一次過倒晒出嚟。由上到下渲染次序係：

1. **一句話解釋** —— BlueMap 實際整出啲乜 —— 預設顯示、可以摺埋，而且會記住呢個選擇（`homeState.ts`），令新手睇一次就夠，回頭用家唔使再次次捲過佢。「Tell me more」會打開獨立嘅「what is this?」面板（`WelcomeSurface.vue`），而唔係喺呢度將佢啲文字再抄一次。
2. **搜尋欄**，一有查詢內容就會取代佢下面所有嘢。
3. **Continue** —— 淨係有嘢可以繼續嘅回頭用家先會見到：除咗 seed 出嚟嗰個 demo server 之外嘅每一個 profile，撳落去就將佢設為 active map。佢刻意排喺 hero 之上：已經有地圖嘅人想要嗰個地圖，唔係想要一個教你再整多個嘅指南。
4. **Hero** —— 唯一嗰個 `primary` 能力 "Make a map"，佔滿闊度、用 `primary-container`，帶住成版唯一一個大掣。佢唔係眾多圖磚之一：一格權重相同嘅卡，本身答唔到「我由邊度開始」，而嗰個正正就係呢版要修嘅投訴。特登只得一個，因為有兩個主要動作嘅頁面，等於一個都冇。佢亦永遠唔會係 disabled 卡 —— 下面每一個被鎖住嘅能力，指向嘅補救方法都係 "Make a map"，所以佢冇嘢好等。
5. **「Get started」嘅其餘部分** —— 解釋面板同互動導覽 —— 做兩張輔助卡擺喺 hero 下面，用 `surface-container-high`。
6. **其餘全部**，仍然係之前嗰五節，不過每一節都變成摺埋咗嘅 disclosure：製作同管理地圖、分享同備份、學習（文件、授權）、設定同工具，以及 —— 淨係喺真係有地圖打開嗰陣 —— 嗰個地圖自己嘅選單。另外有個「Show every section」控制，畀想一次過睇晒成個清單嘅人一次過打開五節。

#### 摺埋唔等於收埋

每一節原本有嘅卡一張都冇少。改變嘅係新手先見到啲標題：

- 節標題係一個真嘅 `<button>`，包喺一個真嘅 heading 元素入面，標籤講明呢節裝住乜**同埋有幾多張** —— 例如「Share and back up (2)」、「Settings and tools (9)」。一節如果摺埋咗啲卡但唔講埋帶走咗幾多張，就係喺度收埋而唔係執靚，所以個數字係可見標籤嘅一部分，唔係一個 badge 或者 tooltip。
- 五節預設摺埋，而且每節嘅選擇會永久記住（`homeState.ts`，key 係 `worldlens.home.expandedSections`）。預設值永遠唔會覆蓋人做過嘅選擇。
- 空嘅一節會直接唔出，唔會頂住個「(0)」標題 —— 冇地圖打開嗰陣嘅「The open map」就係一個接住乜都冇嘅控制，而 command palette 對同一組嘅規矩都係噉。
- **搜尋完全繞過 disclosure。** 嗰個扁平嘅結果格係由完整能力清單砌出嚟，包括摺埋嗰啲節，所以一張卡摺咗埋永遠唔會令佢搵唔到。`HomeScreen.test.ts` 直接守住呢點：喺每一節都係新手預設狀態之下，搜尋 "point of interest"（呢個關鍵字淨係摺埋咗嗰個 viewer 節嘅 Markers 卡先有）一樣會攞返嗰張卡。

#### 用 surface 而唔係外框

層次感係靠 Material 自己嗰套 surface role 表達，而 `vuetify.ts` 而家完整噉定義晒：hero 用 `primary-container`，兩張導向卡用 `surface-container-high`，節標題掣用 `surface-container`，能力卡用 `surface-container-low`。呢版冇任何嘢係靠畫條邊去話「呢度有嘢」，而且冇一個顏色係 hex 字面值 —— 全部都係 `--v-theme-*` role，所以呢版會跟住淺色、深色同高對比主題走，唔使多維護一份色盤。

#### 對仲未 ready 嘅嘢老實

Backups 同 Publish to Pages 兩樣都要呢部電腦上面已經有一個 render 咗嘅地圖，而兩者都用同一句說話講明（`home.tile.needsRenderedMap`），唔會擺一個一撳就會失敗嘅控制出嚟。按本專案嘅 guided-forms 規矩，disabled 狀態要講明確切嘅補救方法，並且將佢做成一個真掣 —— "Make a map" —— 唔止畀個理由。一旦有地圖，嗰句說話同 disabled 狀態都會同時消失，真正嘅動作變成撳得；呢度冇任何嘢係一個控制嘅靜態示意圖。

#### 搜尋

用 `ConfigSearchField` 配佢個 anchored regex builder，即係本應用程式其他每條搜尋欄都用嘅同一個元件，搜尋範圍包括每張卡嘅 group、標題、描述、關鍵字，以及（如果有）佢嘅 disabled 理由 —— 所以連 "render a map first" 呢句都搵得到。預設純文字；regex 要明確 opt-in。一搜尋就會用一張扁平、老實嘅結果清單取代整個引導式版面（同 app 內文件瀏覽器嘅搜尋結果一致），而冇結果嗰陣會用文字講明，並提供一撳返返去完整頁面嘅方法。

#### 一張卡可以帶啲乜

`HomeCapability`（`homeCatalog.ts`）特登整得好細：一個 id、一個 group、一個標題、一段描述、一個圖示、搜尋關鍵字、一個可選嘅 disabled 理由連補救方法，同埋動作本身。動作唔可用嘅卡永遠唔會淨係灰咗但冇解釋 —— 佢要就喺原位顯示補救掣，要就喺 disabled 掣隔籬講明未滿足嘅條件；呢個同應用程式其餘部分對每一個引導式表單所守嘅老實規矩一樣。

#### 批量操作喺呢度唔適用

本專案嘅共用規矩係每一個 list、table、grid 同 collection 都要支援批量操作，因為要人一件一件重複做四十次，係 app 冇做好自己份工。能力格特登豁免，而呢段就係將呢個豁免白紙黑字寫低，唔係一個靜靜嘅缺口：

- 每張卡都係通往呢個 build 已經有嘅目的地嘅固定導覽入口 —— "Make a map"、Settings、Docs、config editor 等等 —— 唔係用家建立、擁有、或者可以有意義噉批量處理嘅記錄。根本冇嘢畀你揀四十個：呢格嘢唔會因為用家做過乜而變多變少，佢對每個人嚟講都係同一份目的地目錄。
- 每張卡嘅單一動作都係異質嘅，唔係批量規矩所假設嗰種單一操作（刪除、匯出、移動、加標籤、重試、啟用／停用）。「打開指南」、「打開 Settings 並定位到 GitHub 嗰行」同「打開 config editor 嘅歷史畫面」根本冇辦法一齊揀，再當成一個批次動詞去執行，因為佢哋唔係同一個動詞換咗資料。
- 卡片目的地所通往嘅真正集合，喺佢哋自己嘅界面已經各自有批量操作嘅一套做法，而規矩就係應該喺嗰度生效：maps-and-servers 清單（`ProfileManager.vue`）擁有啲 profile，通知中心擁有啲通知，docs 瀏覽器擁有啲文章。Home 係去每個房間嘅門，唔係房間嘅第二份複製品。

Home 最接近「集合」嘅一處係 Continue 嗰一行 —— 除咗 seed 嘅 demo server 之外每一個 render 咗嘅 profile，撳落去就將佢設為 active map。佢仍然係一張啟動器清單而唔係記錄集合，原因一樣：「continue」係逐個 profile 嘅單一動作，冇對應嘅批量版本，而管理嗰啲 profile（改名、移除、批量關閉）係 `ProfileManager.vue` 嘅工作，經佢自己嘅分頁去做。

### 重用而唔重複

啲描述係由其他界面已經配音好嘅目錄項目攞返嚟 —— `palette.page.world`、`palette.shell.settings`、`docsViewer.lede` 等等 —— 唔係喺呢度重寫。兩個界面用兩句唔同嘅說話去描述同一個目的地，就係佢哋對「一個掣實際做乜」開始講唔埋一齊嘅起點；重用同一個 key，就係令 Home 同 command palette 只要兩個檔案仲喺度就一直對 "Make a map" 講同一番話，而代價係嗰十幾張對應現有頁面或者 shell 界面嘅卡，一句新文案都唔使寫。淨係真正屬於 Home 自己嘅嘢 —— 佢自己嘅標題、搜尋 chrome、節標題、四個 disclosure 標籤（`home.section.everythingElse`、`home.section.count`、`home.sections.showAll`、`home.sections.hideAll`），同埋 Backups 與 Publish to Pages 共用嗰句 "render a map first" —— 先會放喺 `copy/surfaces/home.ts`。

Hero 上面嗰句 eyebrow 就係同一條規矩再用多次：佢渲染 `setupI18n.t("action.startHere")`，即係獨立「what is this?」面板已經印喺自己個掣上面嗰啲字，而唔係再開第五個遲早會同佢唔一致嘅新 key。

`palette.page.map`、`.world`、`.projects`、`.ciRender`、`.servers`、`.backups` 同 `.pages` 以前喺每種語言、每個 funny level 都渲染英文 fallback，即使 `components/palette` 早就喺目錄嘅覆蓋清單上面：原因係 `paletteCatalog.ts` 自己嘅 `PAGE_NOTES` 係經一個變數去讀佢哋（`t(note.description[0], note.description[1])`），而 `catalogueCoverage.test.ts` 嗰個字面字串掃描器根本睇唔到。Home 用字面字串去叫同樣嗰七個 key —— 即係叫 `t()` 嘅正常又正確做法 —— 咁先真正令個缺口浮現。佢哋配音喺 `copy/surfaces/home.ts` 而唔係 `palette.ts`，因為 `palette.test.ts` 要求佢帶嘅每個 key 都要喺 `components/palette/` 底下有一個字面呼叫點，而 Home 嗰個係唯一存在嘅；不過個目錄係一個以字串做 key 嘅合併集合，所以呢個修正兩邊呼叫點都受惠。

### 設定

Home 自己記住嘅偏好只有兩項：簡介係咪摺咗埋（`homeState.ts`，key `worldlens.home.introCollapsed`，經 `setupStorage()`，預設係展開），同埋邊幾節次要內容係打開咗（`homeState.ts`，key `worldlens.home.expandedSections`，經 `setupStorage()`，預設全部摺埋）。另外 Home 個分頁係咪釘住，係由 `TabbedNavigation.vue` 嘅 `pinnedPageIds` prop 喺佢個分頁第一次存在嗰刻套用一次；預設釘住，而人手解除釘住之後永遠唔會再自動釘返。

兩項偏好都會鏡射入共用嘅應用程式設定歷史，用單一 key `home`，喺 `stores/appSettingsHistorySync.ts` 嘅 `APP_SETTINGS_HISTORY_KEYS` 註冊，並由 `appSettingsHistoryManifest.test.ts` 守住佢真實嘅呼叫點。`localStorage` 仍然係真相來源，同 `docs/config-history.md` 分階段計劃講嘅一樣；個鏡射係 fire-and-forget，歷史寫入失敗永遠唔會令一次摺疊變成錯誤。

嗰份記錄存嘅係人**打開咗**邊幾節，唔係佢閂咗邊幾節。所以冇人掂過嘅安裝根本乜都唔會存，而之後嘅 build 新加嘅一節，會同其他節一樣預設摺埋，唔會因為「佢唔喺已閂清單度所以打開佢」而繼承咗一份喺佢出現之前就寫低嘅記錄。

Home 除此之外冇任何嘢會自己持久化。個分頁嘅位置、佢過咗第一刻之後嘅釘住狀態、以及佢屬於邊個 group，全部都存喺其他分頁都用緊嗰份普通 tab-workspace 記錄（`tabbed-navigation.md`）。

### 失效情況

- **某項能力喺一節摺埋咗嘅內容入面。** 由講明佢名同數量嗰個標題撳一下就到，而且無論如何都搵得返，因為搜尋係行勻成份能力清單，唔係行而家畫咗出嚟嗰啲。呢版冇任何嘢係一定要先打開啱嗰節先去到。
- **一張卡嘅目的地去唔到。** 呢度每一個動作都係 `App.vue` 本來就會為佢自己某個掣執行嘅 shell 動作；唔會出現 Home 提供一張撳咗靜靜雞乜都唔做嘅卡，因為冇一個真正接好嘅 handler，張卡根本唔會存在。
- **冇地圖打開。** Viewer 自己嗰組選單（Maps、Settings、Info、Markers、Players、鏡頭重設）會完全唔出現，而唔係出現但 disabled，跟返 command palette 自己嘅規矩：一個接住乜都冇嘅主題選擇或者鏡頭重設列，正正就係本專案拒絕出貨嘅裝飾性控制。
- **仲未 render 過任何嘢。** Continue 嗰一節完全唔會渲染（唔係一張空清單），而 Backups／Publish to Pages 兩者都會講明缺咗嘅前置條件，隔籬擺住一個真正可用嘅補救。
- **搜尋 pattern 編譯唔到。** 結果清單會顯示乜都冇，而唔係顯示上一次成功嘅結果，同本應用程式其他每一個由 regex builder 支撐嘅搜尋行為一致。
- **升級上嚟嘅安裝，佢儲低嘅分頁佈局早過 Home。** `ensurePage` 會喺下次啟動幫佢加一個釘住嘅分頁，唔會騷擾嗰個人本來喺緊嘅分頁；全新安裝就唔使咁修，因為 Home 同其他宣告過嘅頁面一樣係 seed（同釘住）出嚟。

### 安全考量

呢度冇任何嘢會自己去掂網絡。搜尋係行本機嘅 `RegExp` 引擎，喺 `components/config/regexEngine.ts` 所訂明嘅界限之內；冇任何 pattern 或者查詢會被傳送、記錄或者持久化，除咗上面講嗰個摺疊／展開嘅布林值。呢版打開嘅每一個目的地，都係應用程式本來就會由本地狀態畫出嚟嘅界面；Home 冇為佢哋引入第二條驗證較少嘅路。

### 無障礙

Home 係一個有標籤嘅 `<section>`；佢啲區域 —— 簡介、continue 嗰一行、帶 hero 嘅 "Get started"、同埋 "Everything else" —— 每個都係真嘅標題，所以螢幕閱讀器可以好似讀任何其他文件噉喺佢哋之間移動。個大綱係真正嘅階層，唔係一串同級標題排落去：頁面用 `h2`，每個區域用 `h3`，hero 自己嘅標題同每個可摺疊節用 `h4`，節入面每張卡用 `h5`。

每個可摺疊節都係一個真嘅 `<button type="button">`，包喺佢個 `h4` 入面，帶住 `aria-expanded` 同一個指住佢真正會打開嗰塊 panel 嘅 `aria-controls`，即係標題負責層級、掣負責狀態。用原生 button 就係令 Enter、Space、tab 同每種輔助科技自己嗰個「啟動」手勢唔使呢個檔案實作都用得。佢唔係 `.v-btn`，所以 `global.scss` 全 app 嘅 `:focus-visible` 外框去唔到佢，佢自己聲明咗一個 —— 通往一節摺埋內容嘅唯一控制，焦點一定要睇得見。展開動畫係 160ms 淡入，而呢個元件入面一個 `prefers-reduced-motion: reduce` 區塊會直接將佢閂晒，疊喺 `global.scss` 已有嘅全 app 規則之上。

每張能力卡都係一個 `role="list"` 項目，每個可用動作都帶一個真掣，而每個掣嘅 accessible name 都講明佢打開邊項能力（"Open {title}"），唔係光禿禿一個 "Open"。Disabled 動作嘅掣喺 DOM 入面真係 disabled，命名方式一樣，並且配埋一個真正解決得到問題嘅補救掣。搜尋欄、regex builder 切換掣，同「清除搜尋」嘅回復掣，全部都係鍵盤到得、焦點睇得見嘅普通控制；而成版嘢包喺 `AppearanceTarget` 入面，所以佢同本應用程式其他每一個 appearance target 一樣，有同樣嘅右擊「Edit appearance...」內容選單、自己嘅搜尋欄，同埋 Shift+右擊嘅編輯器捷徑。

### 驗證

原文嗰個表逐個測試檔講咗守住乜，重點如下。`homeCatalog.test.ts` 守純邏輯：一張卡可搜尋文字包含乜（連 disabled 理由同關鍵字）、每卡一行嘅搜尋樣本、`filterCapabilities` 對住一個未啟用嘅 matcher、純文字配對、淨係關鍵字配對、無效 pattern、以及目錄次序保持不變；仲有 `groupCapabilities` 會將每張卡歸入佢宣告嗰節、按宣告次序排、空嘅一節直接掉唔會加標題、冇任何節認領嘅卡就全部唔出。

`homeState.test.ts` 守兩項持久化偏好：簡介預設展開、摺埋同展開都可以來回、儲存值係垃圾就當展開、展開嗰陣係移除記錄而唔係寫多一個 falsy 值；至於各節，預設一個都冇打開、打開一節唔會騷擾隔籬、同一個 id 打開幾多次都只記一次、記錄入面有多餘空白都讀得返啲 id、記錄從未見過嘅節當閂、最後一節閂返之後就移除記錄，而且同簡介嗰個旗標互相獨立。

`HomeScreen.test.ts` 係掛住真元件測：**清單**方面，完整嘅能力 id 集合係人手寫出嚟再逐字斷言，冇地圖打開同有一個帶 marker 同 player 嘅實時地圖兩種情況都測，所以將來有人改到掉咗一張卡會喺呢度爆而唔係靜靜雞過骨；而且每張渲染出嚟嘅卡都會檢查佢帶一個真掣，即係「存在」等於「去到」。**Hero** 方面：只有一個、帶 `primary` 能力、喺所有可摺疊 panel 之外、由自己嘅動作打開指南，而且對回頭用家嚟講排喺 "Continue" 之下。**Disclosure** 方面：每節開始時摺埋、講明裝住乜同幾多（「Share and back up (2)」）、撳一下會展開同摺埋而唔騷擾隔籬、重新 mount 之後仲記得個選擇、mount 之前做嘅選擇會由儲存讀返、以及一個控制一次過開閂五節。**語義**方面：`h4` 入面一個真 `<button type="button">`，佢個 `aria-controls` 指住真係存在嗰塊 panel，全部喺一個 `h2` 之下、各區域係 `h3`。**搜尋**方面：搵到一張仲摺埋緊嗰節入面嘅卡、搜嘅係成份清單而唔係畫面上有嘅嘢（用一個淨係摺埋咗嗰個 viewer 節先有嘅關鍵字）、計數以總數為準、清空之後 hero 同每張卡都返返嚟。除此之外，呢版之前有嘅嘢照守：冇地圖打開嗰陣 viewer 選單組完全唔出、有地圖就出現；Backups 同 Publish to Pages 會講明缺咗嘅前置條件並提供真補救，一 render 咗地圖兩樣就消失；簡介預設顯示而佢嘅摺疊狀態跨 remount 都保住；首次啟動冇 continue 嗰一行，一有 render 咗嘅地圖就逐個列名；而每一個屬於 shell 嘅動作（定位到某個 anchor 嘅 Settings、定位到某畫面嘅 options editor、EULA 面板、"what is this?"、command palette）都係 emit 出去而唔係自己動手，並且係由一節人真係打開咗嘅內容度觸發。

`appSettingsHistoryManifest.test.ts` 守 `APP_SETTINGS_HISTORY_KEYS` 入面嘅 `home` key 指住 `components/home/homeState.ts`，而嗰個檔案真係有叫 `recordAppSetting("home", ...)`。`App.test.ts` 由 shell 掛住測：條 strip 而家分成九版、Home 排第一，Home 經佢自己嘅釘住分頁去到，而一個啱啱 seed、冇持久化佈局嘅 workspace 會開喺 Home —— Map 分頁自己嗰句狀態訊息要明確揀佢先見到。另外，係行真路徑而唔係預先 seed 好嘅 workspace：全新安裝喺 `FirstRunSetup` 真正 emit `finished` 嗰刻就落喺 Home（唔係一個無論 handler 做乜都會過骨嘅預 seed workspace）、有儲存 workspace 嘅回頭用家會留喺佢上次 active 嗰個分頁而唔會被拉返 Home，而喺獨立「what is this?」面板撳 "Start here" 仍然直入精靈 —— 呢個係呢版落腳修正特登唔郁嗰條與首次執行相鄰嘅路徑。

`TabbedNavigation.test.ts` 守 `pinnedPageIds` 由一個頁面第一次 seed 嗰刻就釘住佢個分頁；`ensurePage` 會為一個早過儲存 workspace 嘅頁面加分頁、釘住佢，並且永遠唔騷擾回頭用家本來睇緊嗰個分頁；而兩者都唔會將用家親手解除釘住嘅分頁再釘返。`catalogueCoverage.test.ts` 守 `components/home` 加入咗「所渲染嘅每個 key 喺每種語言、每個 funny level 都有真目錄項目」嗰批界面。`overlayDismissalPolicy.test.ts` 同 `menuCoverage.test.ts` 守 Home 四個 `AppearanceTarget` 區域都喺兩邊嘅清單度宣告咗，所以將來改 `AppearanceTarget.vue` 本身就係唯一一個要令四個都保持正確嘅地方，而兩個守衛自己嗰個「係咪唔記得註冊新嘅」檢查都唔會靜靜雞放過呢一版。

喺 `design/` 執行：`npx vitest run packages/ui/src/components/home packages/ui/src/App.test.ts packages/ui/src/components/tabs/TabbedNavigation.test.ts`。

### 建議延伸閱讀

- [The command palette](./command-palette.md) —— 每張能力卡嘅文案同每個開啟器嘅 handler 都由佢個目錄嚟。
- [Tabbed navigation](./tabbed-navigation.md) —— Home 自己個分頁所依賴（而唔係重新發明）嘅釘住、seed 同持久化機制。
- [The regex builder and the search bars it reaches](./regex-builder.md) —— 佢撐起 Home 嘅搜尋欄，同佢撐起本應用程式其他每一條搜尋欄嘅方式一模一樣。
- [Language modes and funny levels](./language-and-tone.md) —— Home 自己嘅文字同每張卡借返嚟嘅描述，點樣隨住現行語言模式同 funny level 變化。
