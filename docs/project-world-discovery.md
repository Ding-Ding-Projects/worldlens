# Worlds ready to use on the Projects tab

The Projects tab no longer starts empty just because nobody has made a project yet. It
reads the same world catalogue [Finding worlds](finding-worlds.md) documents and shows
what it found - the default Minecraft folder, Bedrock's worlds folder, CurseForge's
instances, and anything the person has mounted - as a second, distinctly styled panel
above the established projects list, each row one click away from becoming a project.

Nothing here is a second discovery system. `DiscoveredWorldsPanel.vue` calls the exact
bridge methods `MinecraftWorldList.vue` (the wizard's own world picker) calls -
`listMinecraftFolders`, `scanMinecraftFolder`, `mountMinecraftFolder`,
`unmountMinecraftFolder`, `labelMinecraftFolder` - and formats every fact about a world
with the same pure functions from `worldCatalog.ts`. The two panels differ in their
template and interaction model, not in what they know: a project is started, potentially
several at once, which the wizard's single-choice listbox has no equivalent of.

---

## Behaviour

### Automatic, from the moment the tab opens

The panel loads the folder list and starts scanning every folder in parallel the instant
it mounts (`onMounted`), the same as the wizard's own list. Nobody has to click anything
first for the default Minecraft folder's worlds to appear - which is the whole point: a
user who obviously has worlds on this machine sees them without being asked to go find
them.

### Discovered, not automatically a project

A world found on disk and a project somebody has configured are different things, and the
panel keeps them visually and behaviourally apart:

- A discovered row carries a **"not yet a project"** chip and its own dashed-border card
  (`.mb-discovered`), distinct from the solid-cornered `.mb-projects` card below it.
- Nothing writes a project file just because a world was found. Clicking a row, or its
  **Use** button, or pressing <kbd>Enter</kbd> on it, opens the project editor **pre-filled
  and unsaved** - the same state `New project` already produces, just without having to
  type or browse for the world path. Saving is still a deliberate act.
- Once a project exists for a world - saved from the editor, or written by the bulk action
  below - that world stops appearing here on the next read, because `discoveredWorlds.ts`
  filters it out.

`discoveredWorlds.ts` is the one piece of logic genuinely new to this feature:

```ts
discoveredWorlds(allWorlds, projectWorlds) // -> worlds with no project, deduplicated
```

`projectWorlds` is compared with the same `samePath` every other identity check in the
world-handling code uses - separator-folded, case-folded - so a project whose `world`
field disagrees with the catalogue only in case or trailing separator still correctly
hides its own world rather than offering to start a second project over it.

### De-duplication

The same world can be reachable two ways - a Minecraft folder and its own `saves` folder
both mounted, or (new in this pass) a launcher root and one of its instances mounted
separately. Two layers keep it to one row:

1. **Folder-level, on the main-process side.** `mounts.ts`'s `folderIdFor` hashes the
   resolved `savesPath`, so mounting the same resolved folder twice is recognised as
   already-mounted before a second folder row - and therefore a second copy of every
   world in it - can exist at all.
2. **World-level, defensively, in the UI.** `worldCatalog.ts`'s `dedupeWorldsByPath` folds
   every discovered world down to one row per normalised path (again via `samePath`)
   before anything is shown or filtered. This is the belt to the first layer's braces: it
   catches a stale cache or a symlinked folder that folder-level dedup does not reach, and
   it is independently unit-tested rather than trusted to fall out of the first layer.

### Bulk actions

Every row carries a checkbox (roving tabindex, `aria-selected`, focus kept separate from
selection exactly as the wizard's listbox and `ProjectList.vue` both already do), plus
**Select the N shown**, **Invert** and **Clear the selection**. Choosing several and
pressing **Start projects for N chosen** writes a default project for each one
immediately, through the same `host.writeProject` the editor's own Save button calls,
and reports per-world failures rather than one opaque "something went wrong" - a batch
where three of five started has to say which three.

A single click stays a pre-filled, unsaved editor rather than an immediate write:
reviewing one world before committing to it is normal; reviewing ten one at a time before
a "bulk" action finishes is not what bulk means.

### Honest empty states

Four are distinguished, not one generic "nothing here":

| State | What it means | What is said |
|---|---|---|
| Still scanning | folders or worlds are being read right now | a progress indicator and "Reading your Minecraft folders..." |
| No folders added | the catalogue has nothing to look in, not even a default | "No Minecraft folder was found on this computer..." |
| Folders added, no worlds found | real folders exist and were read; they hold nothing | "No worlds were found. It looked in: \<the real paths\>." |
| Every world already has a project | discovery found worlds, but none is without one | "Every world this computer can find already has a project below." |

A fifth, for the panel's own search, reads "No world matches that search" - distinct from
all four above, so clearing a query is understood to bring worlds back rather than to fix
a folder problem.

### Right-click and the keyboard

Each row is wrapped in `AppearanceTarget`, the same per-element appearance wrapper
`ProjectList.vue` uses for its own rows. That gets this panel, for free and without a
second implementation: a context menu anchored to the row, carrying **its own search
field** wired to the full regex builder; **Shift+right-click** straight to the
per-row appearance editor; and every command's keyboard shortcut shown beside it
(`<kbd>Enter</kbd>` for "Start a project for this world", `<kbd>Space</kbd>` for
"Add it to the selection").

### Mounting more folders

The panel carries its own copy of the mount-management block `MinecraftWorldList.vue`
shows in the wizard - the folder list, **Mount another Minecraft folder** with a native
browse button beside the path (never a bare text field), and per-folder rename and
unmount - because it calls the exact same bridge methods. Unmounting a folder only takes
it out of this list; it is said in as many words beside the button, and nothing here ever
opens, reads or deletes a world file. A folder that has gone missing or become unreadable
keeps its row and says so rather than silently disappearing.

### Not blocking

Folder listing and per-folder scanning both run asynchronously from `onMounted`, exactly
as the wizard's own list does: a slow network-mounted folder shows its own "reading..."
state while every folder that answered quickly is already on screen, and the tab itself
is interactive throughout - nothing here freezes the interface while a scan runs.

---

## Configuration

Nothing to configure. The panel reads whatever `worldCatalogBridge` resolves to (probed
automatically in a real build, injectable in a test) and whatever `projectWorlds` the
Projects tab hands it from its own already-loaded project list - both wired once in
`ProjectsScreen.vue` and requiring no setting anywhere.

---

## Failure modes

- **No bridge at all** (a browser tab with no desktop shell behind it): the panel renders
  nothing rather than a broken card, exactly as `MinecraftWorldList.vue` does.
- **A folder listing fails outright**: reported as an alert on the panel, the rest of the
  tab - the projects list itself - keeps working.
- **One folder's scan fails**: reported on that folder's own row; every other folder's
  worlds stay on screen.
- **The bulk write fails for some but not all worlds**: reported per world by path, and
  the ones that did start are still reported as a success count.
- **A world already open, unsaved, in the editor**: clicking a discovered world while an
  unsaved project is open does not replace it. A warning names the situation instead of
  silently discarding the edit in progress.

## Security considerations

Identical to [Finding worlds](finding-worlds.md#failure-modes-and-security): scanning is
read-only, nothing beyond what identifies a world is read, and the only file this feature
writes on its own is a project file - only when a person explicitly chooses **Use** or the
bulk action, never as a side effect of the tab opening or a folder being scanned.

---

## Verification

```sh
cd design && npx vitest run packages/app/src/main/world                          # discovery, incl. launcher roots
cd design && npx vitest run packages/ui/src/components/world/worldCatalog.test.ts # dedupeWorldsByPath
cd design && npx vitest run packages/ui/src/components/project                   # discoveredWorlds, the panel, the wired tab
```

`discoveredWorlds.test.ts` proves the discovered/project filtering rule with no DOM.
`DiscoveredWorldsPanel.test.ts` mounts the real component against a fake bridge and
proves automatic discovery, the discovered/project distinction on screen, the honest
empty states, the one-click route, and the bulk action emitting every chosen path.
`ProjectsScreen.test.ts` proves the wiring itself: that the screen threads its own
project list into the panel, that a click really opens the editor pre-filled, and that
the bulk action really reaches the project host and the newly created projects really
stop appearing as discovered afterwards.

## Related

- [Finding worlds](finding-worlds.md) - the catalogue and mount handling this panel
  reuses in full: default locations (including Bedrock and CurseForge), mounting,
  honest states, and the pure functions that describe a world
- [regex-builder.md](regex-builder.md) - the builder this panel's search and its
  per-row context menu search both use
- [path-field.md](path-field.md) - the browse button beside the mount field
- [super-confirmation.md](super-confirmation.md) - why starting a project needs no gate
  here (nothing irreversible happens without a save) while removing one, in
  `ProjectList.vue`, still does

## 廣東話

### Projects tab 上面即刻用得嘅世界 (Discovered worlds)

Projects tab 唔會再因為未有人開過 project 就開頭空白一片。佢讀 [Finding worlds](finding-worlds.md) 所講嗰個世界目錄,將搵到嘅嘢——預設 Minecraft 資料夾、Bedrock 嘅 worlds 資料夾、CurseForge 嘅 instances,同用戶自己 mount 咗嘅任何嘢——以第二個、風格明顯唔同嘅 panel 顯示喺現有 projects list 上面,每一行都係一 click 就變到 project。

呢度冇第二套 discovery 系統。`DiscoveredWorldsPanel.vue` call 嘅正正係 `MinecraftWorldList.vue`(wizard 自己嘅 world picker)call 嗰啲 bridge method——`listMinecraftFolders`、`scanMinecraftFolder`、`mountMinecraftFolder`、`unmountMinecraftFolder`、`labelMinecraftFolder`——而且用 `worldCatalog.ts` 同一批 pure function 格式化世界嘅每一項資料。兩個 panel 分別在於 template 同互動模型,唔在於佢哋知道啲乜:呢度係開 project,可能一次開幾個,wizard 嗰個單選 listbox 冇呢樣嘢。

### 行為

#### 一開 tab 就自動行

panel 一 mount(`onMounted`)就載入資料夾清單,並且平行掃描每個資料夾,同 wizard 自己嘅 list 一樣。唔使 click 任何嘢,預設 Minecraft 資料夾嘅世界就會出現——呢個正係重點:明明部機有世界嘅用戶,唔使被叫去自己搵。

#### 係「發現咗」,唔係自動變 project

磁碟上搵到嘅世界同有人設定咗嘅 project 係兩樣嘢,panel 喺視覺同行為上都分開佢哋:

- 發現咗嘅行帶一個 **"not yet a project"** chip,同自己嘅虛線邊框卡(`.mb-discovered`),同下面實角嘅 `.mb-projects` 卡有明顯分別。
- 搵到世界唔會令任何 project 檔案被寫。click 一行、按佢個 **Use** 掣,或者喺行上按 <kbd>Enter</kbd>,會打開一個**預先填好但未儲存**嘅 project editor——同 `New project` 產生嘅狀態一樣,只係唔使自己打或者 browse 世界路徑。save 依然係一個要人主動做嘅動作。
- 一旦某個世界有咗 project——由 editor save,或者由下面嘅 bulk action 寫——下次讀取嗰個世界就唔會再喺度出現,因為 `discoveredWorlds.ts` 會過濾走佢。

`discoveredWorlds.ts` 係呢個功能真正新增嘅唯一一嚿邏輯:

```ts
discoveredWorlds(allWorlds, projectWorlds) // -> worlds with no project, deduplicated
```

`projectWorlds` 用 world-handling code 其他所有 identity check 都用嗰個 `samePath` 比較——separator-folded、case-folded——所以 project 個 `world` 欄位同目錄只差大小寫或者尾部分隔符嘅話,仍然會正確隱藏自己嘅世界,唔會邀請你喺上面開第二個 project。

#### 去重

同一個世界可以有兩條路去到——Minecraft 資料夾同佢自己嘅 `saves` 資料夾都 mount 咗,或者(今次新加嘅)launcher root 同佢其中一個 instance 分開 mount 咗。兩層機制keep住一行:

1. **資料夾層,喺 main-process 嗰邊。** `mounts.ts` 嘅 `folderIdFor` hash resolved 咗嘅 `savesPath`,所以 mount 同一個 resolved 資料夾兩次會被認出係已經 mount 咗,唔會出現第二個資料夾行,更加唔會出現入面每個世界嘅第二份 copy。
2. **世界層,防禦性,喺 UI。** `worldCatalog.ts` 嘅 `dedupeWorldsByPath` 喺任何嘢顯示或者過濾之前,將每個發現咗嘅世界摺到每個 normalised path 一行(都係經 `samePath`)。呢個係第一層孭帶之外嘅皮帶:接得住資料夾層 dedup 掂唔到嘅 stale cache 或者 symlink 咗嘅資料夾,而且有獨立 unit test,唔係靠信第一層。

#### Bulk actions

每行有一個 checkbox(roving tabindex、`aria-selected`、focus 同 selection 分開,同 wizard 嘅 listbox 同 `ProjectList.vue` 一樣),加 **Select the N shown**、**Invert** 同 **Clear the selection**。揀幾個再按 **Start projects for N chosen**,就會即時為每一個寫一個預設 project,行嘅係 editor 自己 Save 掣 call 嗰個 `host.writeProject`,而且逐個世界報失敗,唔係一句唔清唔楚嘅「something went wrong」——五個入面得三個成功嘅 batch,一定要講明係邊三個。

單一 click 依然係開一個預先填好、未儲存嘅 editor,而唔係即時寫入:committing 之前 review 一個世界係正常;bulk 完咗先叫你逐個 review 十個就唔係 bulk。

#### 老實嘅 empty states

分開四種,唔係一句「nothing here」:仲掃描緊(資料夾或者世界讀緊)就顯示進度同「Reading your Minecraft folders...」;冇資料夾(目錄冇任何嘢可以睇,連預設都冇)就話「No Minecraft folder was found on this computer...」;有資料夾但冇世界(真資料夾讀過晒,入面冇嘢)就話「No worlds were found. It looked in: <真實路徑>.」;每個世界都已經有 project 就話「Every world this computer can find already has a project below.」。第五種係 panel 自己嘅 search:「No world matches that search」——同上面四種都唔同,所以清走 query 就明係會令世界返返嚟,唔係要去搞資料夾問題。

#### 右 click 同鍵盤

每一行都包咗喺 `AppearanceTarget` 入面,即係 `ProjectList.vue` 自己啲行用緊嗰個 per-element appearance wrapper。咁樣呢個 panel 唔使第二套實現就免費有齊:anchored 喺行上嘅 context menu,入面**有自己嘅 search field** 接住完整嘅 regex builder;**Shift+右click** 直接去 per-row appearance editor;同埋每個 command 旁邊顯示佢嘅鍵盤 shortcut(<kbd>Enter</kbd> 係「Start a project for this world」,<kbd>Space</kbd> 係「Add it to the selection」)。

#### Mount 多啲資料夾

panel 有自己一份 `MinecraftWorldList.vue` 喺 wizard 顯示嗰個 mount 管理區——資料夾清單、**Mount another Minecraft folder** 連路徑旁邊嘅原生 browse 掣(永不係淨一個 text field),同每個資料夾嘅改名同 unmount——因為佢 call 嘅係一模一樣嘅 bridge method。unmount 一個資料夾只係將佢由呢個清單度攞走;掣旁邊白紙黑字咁講,而且呢度任何嘢都永遠唔會開啟、讀取或者刪除世界檔案。唔見咗或者讀唔到嘅資料夾會keep住佢嗰行並講明情況,唔會靜靜消失。

#### 唔會 block

資料夾列舉同逐個資料夾嘅掃描都由 `onMounted` 異步行,同 wizard 自己嘅 list 一樣:一個慢嘅 network-mounted 資料夾顯示自己嘅「reading...」狀態,答得快嘅資料夾已經上晒畫面,成個 tab 全程可以互動——冇任何嘢會喺掃描期間凍結介面。

### 設定

冇嘢要設定。panel 讀 `worldCatalogBridge` resolve 到嘅嘢(真 build 自動 probe,測試可以 inject),同 Projects tab 由佢自己已載入嘅 project list 交過嚟嘅 `projectWorlds`——兩樣都喺 `ProjectsScreen.vue` 接一次,唔需要任何 setting。

### 失敗情況

- **完全冇 bridge**(browser tab,後面冇 desktop shell):panel 乜都唔 render,唔會出一張爛卡,同 `MinecraftWorldList.vue` 一樣。
- **資料夾列舉整個 fail**:喺 panel 以 alert 報告,tab 其他部分——projects list 本身——照常運作。
- **一個資料夾嘅掃描 fail**:喺嗰個資料夾自己嗰行報告;其他資料夾嘅世界keep住喺畫面。
- **bulk write 部分成功部分失敗**:按世界逐個以 path 報告,成功開到嗰啲照報成功數目。
- **editor 入面已有一個未儲存嘅 project 開緊**:click 一個發現咗嘅世界唔會取代佢。會有警告講明情況,唔會靜靜咁丟棄進行中嘅編輯。

### 保安考慮

同 [Finding worlds](finding-worlds.md#failure-modes-and-security) 完全一樣:掃描係唯讀,除咗識別一個世界需要嘅嘢之外咩都唔讀,而呢個功能自己會寫嘅唯一檔案係 project 檔——只喺用戶明確揀 **Use** 或者 bulk action 時先寫,永不因為開 tab 或者掃描資料夾而順手寫咗。

### 驗證

```sh
cd design && npx vitest run packages/app/src/main/world                          # discovery, incl. launcher roots
cd design && npx vitest run packages/ui/src/components/world/worldCatalog.test.ts # dedupeWorldsByPath
cd design && npx vitest run packages/ui/src/components/project                   # discoveredWorlds, the panel, the wired tab
```

`discoveredWorlds.test.ts` 唔使 DOM 就證明 discovered/project 嘅過濾規則。`DiscoveredWorldsPanel.test.ts` 對住假 bridge mount 真 component,證明自動 discovery、畫面上 discovered 同 project 嘅分別、老實嘅 empty states、一 click 嗰條路,同 bulk action emit 齊每個揀咗嘅 path。`ProjectsScreen.test.ts` 證明接線本身:screen 真係將自己嘅 project list 穿入 panel、click 真係開到預先填好嘅 editor、bulk action 真係去到 project host,而新建嘅 project 之後真係唔再以 discovered 出現。

### 相關

- [Finding worlds](finding-worlds.md)——呢個 panel 全套重用嘅目錄同 mount 處理:預設位置(包括 Bedrock 同 CurseForge)、mounting、老實嘅狀態,同描述世界嘅 pure functions
- [regex-builder.md](regex-builder.md)——panel 嘅 search 同每行 context menu 嘅 search 都用嘅 builder
- [path-field.md](path-field.md)——mount 欄位旁邊個 browse 掣
- [super-confirmation.md](super-confirmation.md)——點解喺度開 project 唔使閘(未 save 之前冇任何不可逆嘅嘢發生),而喺 `ProjectList.vue` 移除一個就仍然要
