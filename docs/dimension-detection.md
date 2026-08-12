# Detecting a world's dimensions

Choosing a world used to hand back exactly three dimensions - Overworld, Nether, End -
whether or not the world actually had them, and there was no way to tell the wizard
"also render the Nether" without leaving the guided flow and hand-editing a project
afterwards. This is the part that fixes both: every dimension a chosen world folder
really has is found automatically, shown with its real facts, and can be ticked to
render alongside the primary map with no configuration of its own.

## Behaviour

`main/world/inspect.ts` reads the chosen folder once, shallowly, and reports back the
four layouts Minecraft and its server forks actually use:

| Layout | Where the region files are | Who writes it |
|---|---|---|
| Single-player / vanilla | `<world>/region`, `<world>/DIM-1/region`, `<world>/DIM1/region` | The game itself |
| Custom or modded | `<world>/dimensions/<namespace>/<path>/region`, any number of them | A datapack or a mod |
| Spigot/Paper server split | `<world>/region`, plus `<world>_nether/DIM-1/region` and `<world>_the_end/DIM1/region` as **sibling folders** next to the chosen one | Bukkit-family servers, which never nest the nether or the end inside the overworld's own folder |
| Bedrock Edition | a single `db/` LevelDB chunk database, no `region/` anywhere | Bedrock, both single-player and server |

The first two were already detected before this change; the sibling-folder layout is
new, and is exactly what `de.bluecolored.bluemap.core.world.mca.MCAWorld
.resolveDimensionFolder` in vendored upstream (`core/src/main/java/.../world/mca/
MCAWorld.java`) expects to be handed as `world` for the nether or the end when a server
has split them out - upstream never searches for the sibling itself, because a running
Bukkit server already knows each world's real folder from its own API. This reader has
no server to ask, so it looks for the two conventional sibling names, `<world>_nether`
and `<world>_the_end`, beside the chosen folder: by exact name first, and only then,
case-insensitively, from one bounded listing of the parent. A sibling only counts once
it has both its own `level.dat` **and** real region files under `DIM-1/region` or
`DIM1/region` - either missing and it is not reported, which is what keeps an unrelated
`worldedit_nether` scratch folder from being read as a real dimension. A dimension
found genuinely inside the chosen folder always wins over a same-named sibling.

Once the folder is read, `ui/components/world/worldFolder.ts`'s `dimensionsIn()`
turns the raw counts into a `WorldDimension` per dimension that actually has terrain:
its BlueMap dimension key, whether it is vanilla or custom, its region-file count, and
- for a split-server dimension - the sibling's own absolute folder, since that is what
BlueMap has to be told `world` is for that dimension specifically.

### Where it shows up

`MapIdentityStep.vue`, the wizard's naming step, still asks for exactly one primary
dimension - the map being named and tuned in the rest of the wizard has not changed.
Beneath it, `DimensionSelection.vue` lists **every** dimension the world has, including
the primary one (shown disabled, with a note explaining why it is always included), each
row carrying:

- its real key (`minecraft:the_nether`, or a custom dimension's real namespaced
  identifier such as `aether:skyland` - never omitted for being unrecognised);
- whether it is vanilla or added by a mod or datapack;
- its region-file count, as the cheap proxy for "how much is here";
- for a split-server dimension, the sibling folder its data actually lives in.

Ticking a row adds it to the render as its own map, built from BlueMap's own template
for its own dimension (sky colour, void colour, ambient light and cave removal all set
correctly), with an id and name derived from the primary map's - `survival`,
`survival-the-nether`, `survival-the-end`. None of the primary map's own option edits
are replayed onto it, because a setting tuned for the overworld does not necessarily
suit the nether; the extra map stays reachable and editable afterwards through the
project editor like any other map. The review step lists every extra map that will be
created, by id and by the folder it renders from, so nothing about the render is a
surprise.

### Defaults

The Overworld is whichever dimension `setWorld()` picks as primary (the overworld when
the world has one, otherwise whatever does), and is always included by definition. Every
other dimension - the Nether, the End, and anything a mod or datapack added - **starts
unticked**. Two separate reasons land on the same default:

- rendering the Nether or the End is genuinely not always wanted, and a wizard that
  rendered them by default would be one that surprises somebody with three maps when
  they asked for one;
- an unrecognised custom dimension's size is unknown until it is measured, and defaulting
  it to included would mean the first render somebody runs after picking a heavily
  modded world could quietly be far larger than the one they meant to start.

### Bulk actions and search

The dimension list is a list, so it gets the same treatment as every other list in this
application: a search bar wired to the project's full [regex builder](./regex-builder.md)
(`ConfigSearchField`/`regexEngine.ts`, plain text by default), and bulk **include
shown**, **exclude shown** and **invert shown** actions that only ever touch whatever
the current search is showing - never the dimensions a filter has hidden. The primary
dimension is silently skipped by every bulk action, so "include everything" never adds a
redundant second copy of the map already being built above it.

### A world with nothing to add

A world whose only dimension is the Overworld says so in plain words rather than showing
an empty, apparently-broken list. A folder that could not be read at all still offers
the three vanilla dimensions as an honest guess, and says plainly that they are a guess
rather than a reading (`world.identity.guessedDimensions`) - the existing behaviour for
an unreadable folder, unchanged by this feature.

## Bedrock Edition

Bedrock stores every dimension inside one LevelDB chunk database rather than as
separate region-file folders, so none of the four layouts above apply to a raw Bedrock
world - `inspect.ts` recognises the `db/` directory and reports it as `leveldbFiles`,
which is what lets a Bedrock world be *named* as Bedrock rather than reported as a
corrupt Java world (see [Bedrock Edition worlds](./bedrock-worlds.md)). Dimension
selection, as this article describes it, only applies **after** a Bedrock world has been
converted to Java with Chunker: the converted copy is an ordinary Java world folder,
laid out in whichever of the four layouts Chunker wrote it in, and is detected exactly
like any other.

## Configuration

Nothing here is a setting. Detection runs automatically every time the wizard reads a
world folder; the only "configuration" is which dimensions somebody ticks for a
particular render, which is not persisted beyond the project file the wizard writes at
the end.

## Failure modes and security

- **Read-only, always.** Every check is `lstat`/`opendir` against the chosen folder and,
  for the sibling probe, its immediate parent - nothing here is ever written into a
  world folder, and a symbolic link is never followed out of the folder that was chosen.
- **Cheap by construction.** Region files are counted from directory entries as they are
  read, never opened or stat-ed individually; a chosen sibling is confirmed with two
  `lstat` calls (`level.dat`, then the dimension's own region directory) rather than a
  tree walk. The parent directory is listed at most once, only when neither sibling name
  matches exactly, and only when the chosen folder is itself a world.
- **Nothing is guessed as present.** A dimension folder that exists but holds no region
  files - which Minecraft creates the moment anybody steps through a portal - is left
  out, the same rule that already applied to the vanilla nether and end. A sibling
  folder missing either its own `level.dat` or real region data is not reported.
- **A world with an unreadable folder is never silently treated as having no
  dimensions**: it falls back to the three vanilla dimensions and says so, rather than
  claiming a clean read that never happened.

## Verification

```sh
cd design && npx vitest run packages/app/src/main/world/inspect.test.ts        # every layout, read-only, on a real filesystem
cd design && npx vitest run packages/ui/src/components/world/worldFolder.test.ts   # dimensionsIn merging siblings, custom dimensions
cd design && npx vitest run packages/ui/src/components/world/wizardModel.test.ts   # extra maps built and requested correctly
cd design && npx vitest run packages/ui/src/components/world/DimensionSelection.test.ts  # the list itself: search, bulk actions, states
```

`inspect.test.ts` builds real single-player, custom-dimension and Spigot/Paper-style
fixture trees under a temporary directory for every case, including one proving the
sibling probe never fires for a folder that is not itself a world, and one proving
nothing on disk changes across a full inspection.

## Related

- [Finding worlds](./finding-worlds.md) - the step before this one: choosing which world
  folder to inspect in the first place.
- [The regex builder and the search bars it reaches](./regex-builder.md) - the builder
  this list's search bar uses.
- [Bedrock Edition worlds](./bedrock-worlds.md) - what a Bedrock world reports instead,
  and converting one to a Java world this feature can then read.
- [1.12.2 worlds](./legacy-1-12-worlds.md) - a world old enough to predate the modern
  `dimensions/` folder still gets the vanilla three from its `DIM-1`/`DIM1` folders.

## 廣東話

### 偵測一個世界有咩維度 (dimension detection)

以前揀一個世界，唔理個世界實際上有冇，都硬係交返三個維度出嚟 — Overworld、Nether、End — 而且冇任何方法可以喺個 wizard 度話畀佢知「順便render埋 Nether」，除非離開個引導流程、之後自己手改個 project。呢部分兩樣都修好咗：你揀嗰個世界資料夾真係有嘅每一個維度都會被自動搵到、連真實資料一齊顯示，而且可以剔一剔就同主地圖一齊 render，唔使自己再設定任何嘢。

### 行為

`main/world/inspect.ts` 會將揀咗嗰個資料夾淺層噉讀一次，然後報返 Minecraft 同佢啲 server fork 實際會用嘅四種佈局。第一種係單人／原版：region 檔喺 `<world>/region`、`<world>/DIM-1/region`、`<world>/DIM1/region`，由遊戲本身寫。第二種係自訂或者 mod：region 檔喺 `<world>/dimensions/<namespace>/<path>/region`，可以有任意咁多個，由 datapack 或者 mod 寫。第三種係 Spigot/Paper 嘅 server 拆分佈局：`<world>/region` 之外，仲有 `<world>_nether/DIM-1/region` 同 `<world>_the_end/DIM1/region`，佢哋係揀咗嗰個資料夾**隔籬嘅 sibling 資料夾**，由 Bukkit 系 server 寫 — 嗰啲 server 從來唔會將 nether 或者 end 塞入 overworld 自己個資料夾入面。第四種係 Bedrock Edition：得一個 `db/` LevelDB chunk 資料庫，成個世界都冇 `region/`，單人同 server 都係噉。

頭兩種喺呢個改動之前已經偵測到；sibling 資料夾嗰種係新加，而佢正正就係 vendored upstream 入面 `de.bluecolored.bluemap.core.world.mca.MCAWorld.resolveDimensionFolder`（`core/src/main/java/.../world/mca/MCAWorld.java`）預期當 server 拆咗 nether 或者 end 出嚟嗰陣，你要交畀佢做 `world` 嗰個嘢 — upstream 自己從來唔會去搵嗰個 sibling，因為一部行緊嘅 Bukkit server 已經可以由自己個 API 知道每個世界嘅真實資料夾。呢個 reader 冇 server 可以問，所以佢會喺揀咗嗰個資料夾隔籬搵兩個慣用嘅 sibling 名 `<world>_nether` 同 `<world>_the_end`：先試完全同名，唔得先至用一次有界限嘅 parent 目錄列表做大小寫不敏感比對。一個 sibling 要同時有自己嘅 `level.dat` **同埋**喺 `DIM-1/region` 或者 `DIM1/region` 底下有真嘅 region 檔先算數 — 少咗任何一樣都唔會報出嚟，就係噉樣先至唔會將一個唔相干嘅 `worldedit_nether` 臨時資料夾當成真維度嚟讀。喺揀咗嗰個資料夾入面真係搵到嘅維度，永遠贏過同名嘅 sibling。

讀完個資料夾之後，`ui/components/world/worldFolder.ts` 嘅 `dimensionsIn()` 會將啲原始計數轉成一個 `WorldDimension`，只限真係有地形嘅維度：包括佢嘅 BlueMap dimension key、佢係原版定係自訂、佢嘅 region 檔數目，而如果係拆分 server 嘅維度，仲有嗰個 sibling 自己嘅絕對資料夾路徑，因為嗰個先係要話畀 BlueMap 知呢個維度嘅 `world` 係邊個。

### 喺邊度見到

`MapIdentityStep.vue`，即係 wizard 嘅命名步驟，仍然淨係問一個主維度 — 之後 wizard 其餘部分幫你命名同調校嗰張地圖冇變過。喺佢下面，`DimensionSelection.vue` 會列出個世界**所有**維度，連主維度都包埋（顯示成 disabled，加一句解釋點解佢永遠都會計入去）。每行帶住：真正嘅 key（例如 `minecraft:the_nether`，或者自訂維度真實嘅 namespaced identifier 好似 `aether:skyland` — 唔會因為認唔到就唔顯示）；佢係原版定係由 mod／datapack 加嘅；佢嘅 region 檔數目，當做「呢度有幾多嘢」嘅平價指標；如果係拆分 server 嘅維度，仲有佢啲資料實際住喺邊個 sibling 資料夾。

剔一行就會將佢當成自己一張地圖加入 render，用 BlueMap 自己為嗰個維度預備嘅 template 砌（天空色、虛空色、環境光同 cave removal 全部設啱），id 同名由主地圖嗰個推導出嚟 — `survival`、`survival-the-nether`、`survival-the-end`。主地圖自己改過嘅選項唔會重播落去，因為為 overworld 調嘅設定唔一定啱 nether；嗰啲額外地圖之後照樣可以喺 project editor 度好似其他地圖噉開返出嚟改。Review 步驟會列出每一張將會建立嘅額外地圖，連 id 同佢由邊個資料夾 render，所以個 render 唔會有任何意外。

### 預設

Overworld 就係 `setWorld()` 揀做主嗰個維度（個世界有 overworld 就係 overworld，冇就邊個做得就邊個），佢按定義永遠計入去。其他每個維度 — Nether、End，同埋任何 mod 或者 datapack 加嘅 — **預設都係唔剔**。兩個獨立理由指向同一個預設：第一，render Nether 或者 End 真係唔一定係人想要嘅，一個預設就 render 埋佢哋嘅 wizard，會令有啲人明明淨係要一張地圖但攞到三張；第二，一個認唔到嘅自訂維度有幾大，量度之前根本唔知，如果預設計入去，噉某個人揀咗一個重度 mod 世界之後行嘅第一次 render，就可能靜靜雞大過佢原本打算開嗰個好多。

### 大量操作同搜尋

維度清單都係一個清單，所以佢享有同呢個 application 其他清單一樣嘅待遇：一條搜尋列接住個 project 完整嘅 [regex builder](./regex-builder.md)（`ConfigSearchField`/`regexEngine.ts`，預設係純文字），同埋 **include shown**、**exclude shown**、**invert shown** 三個大量操作，佢哋永遠淨係郁目前搜尋顯示緊嗰啲 — 唔會掂 filter 收埋咗嘅維度。每個大量操作都會靜靜噉跳過主維度，所以「全部包含」永遠唔會為上面已經喺度砌緊嗰張地圖再加一份多餘副本。

### 冇嘢好加嘅世界

一個淨係得 Overworld 嘅世界會直接用文字講明，唔會擺一個空白、望落好似壞咗嘅清單出嚟。至於完全讀唔到嘅資料夾，仍然會用三個原版維度做一個老實嘅估計，而且會明講嗰個係估計唔係讀返嚟嘅（`world.identity.guessedDimensions`）— 呢個係讀唔到資料夾原本就有嘅行為，呢個功能冇改過佢。

### Bedrock Edition

Bedrock 將所有維度收埋喺一個 LevelDB chunk 資料庫入面，唔係分開嘅 region 檔資料夾，所以上面四種佈局冇一種適用於一個原始 Bedrock 世界 — `inspect.ts` 認得個 `db/` 目錄，報做 `leveldbFiles`，就係噉先至可以將一個 Bedrock 世界*叫做* Bedrock，而唔係報成一個壞咗嘅 Java 世界（見 [Bedrock Edition worlds](./bedrock-worlds.md)）。本文講嘅維度選擇，淨係喺 Bedrock 世界用 Chunker 轉成 Java **之後**先適用：轉換出嚟嗰份係普通 Java 世界資料夾，Chunker 寫成四種佈局入面邊種就係邊種，偵測方式同其他世界一模一樣。

### 設定

呢度冇任何嘢係設定項。每次 wizard 讀一個世界資料夾，偵測都會自動行；唯一算得上「配置」嘅就係某人為某次 render 剔咗邊啲維度，而呢個唔會保存喺 wizard 最後寫出嗰個 project 檔以外嘅地方。

### 失敗情況同安全

- **永遠唯讀。** 每項檢查都係對住揀咗嗰個資料夾（sibling 探測就係佢直屬 parent）做 `lstat`/`opendir` — 呢度冇任何嘢會寫入世界資料夾，而 symbolic link 永遠唔會被跟出揀咗嗰個資料夾之外。
- **設計上就平。** Region 檔係一路讀目錄項目一路數，唔會逐個開或者逐個 stat；確認一個 sibling 淨係用兩次 `lstat`（`level.dat`，跟住嗰個維度自己嘅 region 目錄），唔會行成棵樹。Parent 目錄最多列一次，而且淨係喺兩個 sibling 名都唔完全 match 嗰陣先列，仲要係揀咗嗰個資料夾本身係一個世界先會做。
- **唔會估估下當佢存在。** 一個存在但入面冇 region 檔嘅維度資料夾 — Minecraft 一有人行過個傳送門就會即刻整一個 — 唔會計入去，同原本已經套用喺原版 nether 同 end 嘅規則一樣。一個 sibling 資料夾如果少咗自己嘅 `level.dat` 或者少咗真 region 資料，都唔會報出嚟。
- **一個讀唔到資料夾嘅世界永遠唔會被靜靜雞當成冇維度**：佢會退返去三個原版維度，並且講明呢件事，唔會扮咗有次乾淨嘅讀取而其實根本冇發生過。

### 驗證

```sh
cd design && npx vitest run packages/app/src/main/world/inspect.test.ts        # every layout, read-only, on a real filesystem
cd design && npx vitest run packages/ui/src/components/world/worldFolder.test.ts   # dimensionsIn merging siblings, custom dimensions
cd design && npx vitest run packages/ui/src/components/world/wizardModel.test.ts   # extra maps built and requested correctly
cd design && npx vitest run packages/ui/src/components/world/DimensionSelection.test.ts  # the list itself: search, bulk actions, states
```

`inspect.test.ts` 會喺一個臨時目錄底下為每個 case 砌真嘅單人、自訂維度同 Spigot/Paper 式 fixture 樹，包括一個證明 sibling 探測對住一個本身唔係世界嘅資料夾永遠唔會觸發，仲有一個證明成次 inspection 行完之後磁碟上面乜都冇變過。

### 相關

- [Finding worlds](./finding-worlds.md) — 前一步：一開始點揀邊個世界資料夾去 inspect。
- [The regex builder and the search bars it reaches](./regex-builder.md) — 呢個清單條搜尋列用緊嗰個 builder。
- [Bedrock Edition worlds](./bedrock-worlds.md) — 一個 Bedrock 世界會報返啲乜，同埋點將佢轉成呢個功能讀得到嘅 Java 世界。
- [1.12.2 worlds](./legacy-1-12-worlds.md) — 一個老到早過現代 `dimensions/` 資料夾嘅世界，仍然可以由佢啲 `DIM-1`/`DIM1` 資料夾攞到原版嗰三個。
