# NBT editor

The **NBT editor** opens a world's NBT files (`level.dat`, player data, `data/*.dat`, structure files, `servers.dat`), the chunks inside region files, and any other NBT file, and shows them as a tree of typed tags you can edit directly. Every save is also recorded in a local Git history of that project, so any change can be compared and put back.

It reads and writes files on the computer it runs on, so it is part of the desktop app. Opened without the desktop app it says so instead of showing a dead editor.

## What it opens

| Source         | How                                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A world folder | Type or paste the folder in **World folder**. The list shows `level.dat`, `playerdata/*.dat`, `data/*.dat`, `structures/*.nbt`, `servers.dat` and every region file under `region`, `entities`, `poi` and the dimension folders. |
| A region chunk | Choose a region file in the list, then a chunk by its coordinates. The chunk's own NBT opens; the rest of the region file is left alone.                                                                                         |
| Any NBT file   | **Open any NBT file...** from anywhere. If it sits inside a world the project is that world; otherwise it is its own project.                                                                                                    |

Gzip, zlib and uncompressed files are detected. Java files are big-endian; Bedrock files are little-endian, and a Bedrock `level.dat` keeps its eight-byte header (the version and the payload length, which is rewritten to match on save). The top bar shows what was found.

## Editing

- **Tree.** Every tag has a coloured type chip with the type printed on it (BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, BYTE[], STRING, LIST, COMPOUND, INT[], LONG[]), so colour is never the only signal. Only the rows in view are drawn, so a chunk with a hundred thousand tags scrolls as smoothly as a small file. Branches with more than 500 members load 500 at a time.
- **Values.** Each type has its own editor. A number is checked against its range as you type and the message says what the range is. A byte that holds 0 or 1 is shown as a switch. Enter or leaving the field commits, Escape puts the old value back. Longs keep all 64 bits: values cross the process boundary as text, never as a JavaScript number.
- **Arrays.** Byte, int and long arrays open in a grid of numbered cells, one page at a time, with add and remove.
- **Lists** keep one element type. Adding to a list is locked to that type; an empty list takes the type of its first element.
- **Structure.** Add, rename, duplicate, move up or down, and remove from the row menu. A compound will not take two tags with the same name through the editor, and a tag cannot be moved inside itself.
- **SNBT.** Any subtree can be viewed and edited as SNBT, the text form the game's commands use. Nothing changes if the text is not valid, and the error says where. **Copy as SNBT** and **Paste SNBT here** move a tag between files.
- **Undo and redo** cover every edit. Undoing back to what is on disk reads as clean again.

### Readable names and tailored controls

The tree reads in plain language by default. A known field shows its meaning (**Spawn X**, **Game mode**, **Keep inventory on death**) with the game's key in its tooltip, the chip says what kind of value it is (**Whole number**, **Yes or no**, **Time of day**, **Colour**), and the value is shown the way a person reads it (**Creative**, **Yes**, **12:00, day 2**, **6 min 2 s**, **Diamond Pickaxe**). An unknown key is split into words.

Each value gets the control that fits it, chosen from `nbtFieldCatalogue.ts` and the facts in [nbt-research.md](nbt-research.md):

| Kind of field                                                                              | Control                                                     |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Yes or no (a 0/1 byte, or a `"true"`/`"false"` game rule)                                  | Switch                                                      |
| Fixed set (game mode, difficulty as a number or, from 26.1, a word; chunk generation step) | Select by name                                              |
| Bounded number (spawn, item count 1 to 99, health, experience, border, game-rule numbers)  | Stepper with real limits and a unit                         |
| Range (food, saturation, held slot, air, sleeping percentage, chances)                     | Slider                                                      |
| Time of day (`DayTime`)                                                                    | Slider within the day with the clock; the day count is kept |
| Durations in ticks (weather, fire, cooldowns, world age, time players spent)               | Minutes and seconds with ±1 s and ±1 min                    |
| RGB colours (dye colour in both item layouts, potion and map colours)                      | Colour picker with hex                                      |
| Resource ids (`minecraft:…`)                                                               | Readable name beside the id                                 |
| Free text and anything unknown                                                             | Typed field with the type's range check                     |

Keys are matched without case or underscores, so names from before and after the 1.21.11 game rule rename land on the same control. Every control sends the same edit the text field would, so undo, history, backups and the running-server refusal are unchanged, and integers step with 64-bit arithmetic.

**Game names** in the top bar shows the keys and types exactly as stored, with a typed field for every value. The choice is remembered on this computer.

### Settings form

**Tree** and **Settings form** above the tags switch between the two views of the same file; the choice is remembered. The form lays a world settings file out the way the World settings design does: **World**, **Spawn**, **Time and weather**, **World border**, **Other values**, one section per group inside it (such as **Game rules** or `difficulty_settings`), and **About this file** last. Every value uses its tailored control and the same edit, undo and history as the tree. Lists, arrays and deeper groups are counted with a link to the tree.

It reads a classic `level.dat` from its `Data` group, and any other file from its root, so the files Minecraft 26.1 split out of `level.dat` (`data/minecraft/game_rules.dat`, `weather.dat`, `world_clocks.dat`) open as forms too. A 26.1 `level.dat` offers buttons to open those files when the world has them. A search field with the regex builder narrows the form by readable name, game key or readable value.

### Region canvas

Showing a region file's chunks also switches the centre to **Region**: the region's 32 by 32 chunk slots as a picture, shaded by **Stored size**, **Last saved** or **Compression**. Empty slots are outlined and chunks the editor cannot open are hatched, so colour is never the only signal. Picking a chunk shows its block range, size, last save and compression (an external `.mcc` chunk says so); **Open this chunk**, or a double-click, opens it in the tree or form. The grid is one tab stop: the arrow keys move, Home and End jump along a row, and Enter picks.

### LZ4 and external chunks

Region chunks compressed with LZ4 (compression byte 4, the lz4-java block stream) open and save as LZ4. A chunk too large for its region file lives in `c.<x>.<z>.mcc` beside it, with 128 added to its compression byte; it opens from that file, and a save that makes a chunk too large moves it there the way the game does (the `.mcc` file is written before the region that points at it). A chunk that shrinks back under the limit is written inline again; the old `.mcc` file is left in place, unread. A missing `.mcc` file is named in the refusal.

### Map art canvas

A map item file (`data/map_<n>.dat`, or `data/minecraft/maps/<n>.dat` from 26.1) opens on **Map art**: its 128 by 128 pixels drawn with the game's own map colours (61 base colours, each in four shades), with **Pen**, **Line**, **Fill** and **Pick colour**. **Import picture** scales a picture to 128 by 128 and matches every pixel to the nearest map colour (transparent where the picture is); **Export PNG** saves what is shown. Each stroke or import is one edit and one undo step, sent as the whole colour array, so history and diffs work as for any other change. The map's settings (scale 1:1 to 1:16, centre, dimension, locked, show players) sit beside the canvas with their own controls.

The canvas can be painted without a mouse: it takes focus, the arrow keys move a cursor pixel, Space paints or fills there, and P picks the colour under it.

### Inventory and item editor

Player data (`playerdata/<uuid>.dat`, `players/data/<uuid>.dat` from 26.1, and the single-player player inside an older `level.dat`) adds an **Inventory** view: armour and off hand, the 27 main slots and the hotbar, or the ender chest, each stack shown with a short code, a colour of its own and its count, and named in full for screen readers ("Hotbar 1: Diamond Pickaxe"). Picking a stack lists every value it holds with its tailored control, nested the way the item stores them: the id, the count, and each component or legacy tag value, so enchantment levels in `minecraft:enchantments` are steppers from 1 to 255 named after the enchantment. Picking an empty slot offers **Put it here** with an item id and a count, written in the file's own layout (components and `count` from 1.20.5, `Count` as a byte before; armour into `equipment` from 1.21.5).

### Structure editor

A structure template (`.nbt`) opens on **Structure**: one layer at a time as a grid, west to east and north to south, with an isometric preview of the whole build where layers above the current one are faint. **Paint** puts the chosen palette entry in every cell you drag over and **Pick** takes a cell's entry; the arrows beside the layer number (or Page Up and Page Down) change the height. The palette lists every block state with a readable name, its properties and how many blocks use it. A stroke sends the whole block list as one edit, one undo step, and each block's own data (a chest's items, a sign's text) is carried through unchanged. Structures wider than 96 blocks, or too large to read as text, stay in the tree.

Keyboard: the grid is one tab stop; arrows move, Space paints, P picks.

### Keyboard

The tree follows the ARIA tree pattern: <kbd>Up</kbd> and <kbd>Down</kbd> move, <kbd>Right</kbd> opens a branch or steps into it, <kbd>Left</kbd> closes it or steps to the parent, <kbd>Home</kbd> and <kbd>End</kbd> jump, <kbd>Enter</kbd> or <kbd>F2</kbd> edits (a branch opens or closes, an array opens its grid), <kbd>Delete</kbd> removes, <kbd>Ctrl</kbd>+<kbd>C</kbd> and <kbd>Ctrl</kbd>+<kbd>V</kbd> copy and paste a tag as SNBT. <kbd>Ctrl</kbd>+<kbd>Z</kbd>, <kbd>Ctrl</kbd>+<kbd>Y</kbd> and <kbd>Ctrl</kbd>+<kbd>S</kbd> undo, redo and save.

## Search

The search bar looks through tag names, values, or both. Plain text is the default and ignores case. The regex toggle turns the pattern on, and the full regex builder opens beside the bar with the same pattern and flags. Matching rows are highlighted, the arrows step through matches (expanding the way to each one), and the count says when the list was cut at 500 or the search stopped early because it ran past its time budget. A pattern that cannot compile is reported, not ignored. Patterns are limited to 512 characters and only the first 4,096 characters of a value are tested.

### Chunk view

A chunk opened from the region canvas lands on **Chunk**: a 16 by 16 picture, west to east and north to south, with four layers. **Height** reads the chosen heightmap (motion blocking, world surface, ocean floor and the rest) and shades each column by its surface Y. **Biome**, **Blocks** and **Light** read the section at the height on the slider: biomes by 4-block cell, the block palette by colour, and block light from 0 to 15. Every cell has a spoken name ("x 7, z 2: Stone"). The side panel lists the chunk's block entities (chests, signs, spawners) with their positions and the generation step. Since 1.17 mobs and items live in the entities folder's region files; open that region to edit them. Values are still edited in the tree and form, and the picture reads again after every edit and undo.

### Bedrock worlds

Choosing a Bedrock world folder lists its LevelDB records beside the files (**Bedrock world records**): the local player, other players, world records (portals, scoreboard, map data, villages) and each chunk's records (block entities, entities, pending ticks, sub-chunks and so on), named by dimension, chunk and kind, and searchable. NBT records open in the editor with every view and control, read as little-endian NBT. Saving appends one write batch to the world's newest LevelDB log with the next sequence number, fragmented and CRC-32C checksummed the way LevelDB's own writer does, after copying that log to `bedrock-backups` under the editor's history folder; the game then reads the new value. Close Minecraft first: it holds the database while running. The reader (`design/packages/nbt/src/leveldb/`) reads both the write-ahead logs and the sorted tables (plain, Snappy, zlib or raw deflate blocks), keeps the newest value per key and drops deleted ones, and reports any file it cannot read.

## History

Each project has its own small Git repository, kept under the application's data directory and never inside the world folder, so a world gains no `.git` and nothing that scans it changes.

- **Save and record** asks for an optional message (a default such as `Edit Data.SpawnX in level.dat` is suggested from the real changes) and lists what will be written.
- The first save of a file also records the file **as it was first opened**, so even the very first change can be compared and undone.
- **Diff** shows what changed by name, `Data.SpawnX: 128 -> 256`, not which bytes moved. Compound members are matched by name, list members by position. **Compare with now** compares a recorded version with the open document.
- **Restore** writes an earlier version back as a _new_ entry. History is never rewritten, so a restore can itself be restored.
- A whole `.dat` or `.nbt` file is stored as it is on disk. A region chunk is stored as its own uncompressed NBT, so its history and diffs are about that chunk and do not drag the rest of the region along.
- **This file** or **Whole project** switches the list between the open file's history and every file recorded for the project.

## Safety

- **Open worlds are never written.** Saving and restoring are refused while a managed server is running the world, and when the world's `session.lock` is held (which Windows enforces and other systems only advise, so the application also passes the folders its own servers are running in). The reason is shown, the edit stays in the editor, and saving works once the server has stopped.
- **Backup before saving** is on by default and is a switch in the save dialog. The previous file is copied under the history folder with a timestamp, keeping the last ten per file.
- **Atomic writes.** The file is written to a temporary file in the same folder, flushed, and renamed over the original, so a crash never leaves half a file.
- **A file that changed on disk after it was opened is not overwritten.** Reopen it to see the newer contents.
- **Unsaved edits are protected.** Opening something else asks before discarding them.
- **Unmodified files are never rewritten.** Save is disabled until something changed. Opening a file and saving it unchanged is not possible, so the bytes on disk are never touched without an edit.
- **Round trips are exact at the tag level.** Reading and writing without a change reproduces the same NBT payload byte for byte, including duplicate names, the declared type of an empty list, NaN payloads, string bytes that are not valid text, and bytes after the root. Compression is re-applied with the file's original wrapping; because a compressor may choose different bytes, the _compressed_ bytes of a file you did edit can differ from the original while the data inside is identical.

## Layout and accessibility

Wide windows show files, tags and history side by side. At 720 px and below the same three panes become tabs, so nothing is removed on a phone. Rows grow to 48 px and the value fields and switches grow to touch size. Motion respects the reduced-motion setting. Every control has a name, a focus ring and a keyboard route, and the interface text goes through the same language modes as the rest of the app.

## Not yet

- Bedrock records holding several NBT compounds show the first; the rest is kept as trailing bytes and written back unchanged. Bedrock saves are not recorded in the per-project Git history yet; each keeps a copy of the log instead.
- Undo keeps whole-tree snapshots: at most 100 steps, fewer for a very large chunk (about 1.5 million tags in total across the stack).
- Running servers on another machine are not detected; only this computer's `session.lock` and its managed servers are.

## Verification

- `design/packages/nbt/src/tree/tree.test.ts` (33 tests): byte-exact round trips of every tag type, a hand-assembled file independent of the writer, duplicate names and empty-list types, NaN and invalid-text preservation, gzip, zlib and none, a Bedrock `level.dat`, damaged data, SNBT printing and parsing, range checks, every edit operation, search, semantic diff, and region files (list, read, replace in place, move on growth, unsupported chunks).
- `design/packages/app/src/main/nbteditor/nbteditor.test.ts` (23 tests) uses a real temporary world and the real Git command: baseline plus edit commits, the generated message, unmodified files never written, the live-world refusal changing nothing, a file changed on disk, semantic diffs from history, restore as a new commit, chunk history and restore, undo and redo accounting, refused edits rolling back, paging, 64-bit exactness, and the channel layer answering refusals as values.
- `design/packages/ui/src/components/nbteditor/` has 27 tests: the model (validation, flattening, the virtualised window, the keyboard contract) and the mounted screen against a fake bridge (opening, tab layout at narrow width, arrow-key navigation, Delete, typed editing with range errors, the switch, an array cell, adding a tag, search with the regex toggle and builder, the save dialog, and the blocked-while-running state).
- Not yet exercised: the editor in the built desktop app. The main-process wiring and the preload bridge are separate steps, and no screenshot of the built surface exists yet.

## 廣東話

**NBT 編輯器** 打開世界入面啲 NBT 檔案(`level.dat`、玩家資料、`data/*.dat`、結構檔、`servers.dat`)、region 檔案入面嘅 chunk,同任何其他 NBT 檔案,畫成一棵有類型嘅標籤樹,直接改。每次儲存都會記入呢個專案自己嘅本機 Git 歷史,所以任何改動都比較得、還原得。

佢讀寫呢部電腦上面嘅檔案,所以屬於桌面程式。唔係喺桌面程式開,佢會講明,唔會畀你睇個死嘅編輯器。

- **開啟:** 輸入世界資料夾,列表會顯示 `level.dat`、`playerdata`、`data`、`structures`、`servers.dat` 同所有 region 檔案;揀 region 檔案再揀 chunk 座標就開到嗰個 chunk;亦可以 **開任何 NBT 檔案**。自動認 gzip、zlib 同冇壓縮;Java 係 big-endian,Bedrock 係 little-endian,Bedrock `level.dat` 嘅八 byte 檔頭會保留,儲存時重算長度。
- **編輯:** 每個標籤有色彩類型晶片,類型都有字寫明,唔會淨靠顏色。淨係畫睇得見嗰啲行,幾十萬個標籤嘅 chunk 都順。數字輸入時即時按類型範圍檢查,講明範圍;0 或 1 嘅 byte 顯示做開關;Enter 或者離開欄位就確認,Escape 還原。long 全部 64 位都準,因為係用文字傳,唔經 JavaScript 數字。陣列用格仔編輯,一頁一頁;列表鎖死一種元素類型;可以新增、改名、複製、上落移動、移除;同一個 compound 唔會有兩個同名標籤。任何子樹都可以用 SNBT 睇同改,SNBT 唔啱就乜都唔改,錯誤會講喺邊度;亦可以複製或者貼上 SNBT 喺檔案之間搬。復原同重做涵蓋每個改動,復原返去同磁碟一樣就當冇改過。
- **鍵盤:** 上下移動,右鍵開分支或者入去,左鍵關或者返上一層,Home、End 跳,Enter 或 F2 編輯,Delete 移除,Ctrl+C、Ctrl+V 複製貼上 SNBT,Ctrl+Z、Ctrl+Y、Ctrl+S 復原、重做、儲存。
- **搜尋:** 搜標籤名、值或者兩樣,預設純文字唔分大細寫;撳 regex 開關就用正規表示式,旁邊有完整嘅 regex 建構器,模式同旗標同步。符合嘅行會標出,箭咀逐個跳(自動展開條路);超過 500 個或者搜太耐停咗都會講。唔啱嘅模式會報錯。
- **歷史:** 每個專案有自己細細個 Git 倉庫,擺喺程式資料夾入面,唔會喺世界資料夾入面生 `.git`。**儲存並記錄** 可以寫訊息(會按真實改動建議預設訊息,例如 `Edit Data.SpawnX in level.dat`),並列出會寫乜。一個檔案第一次儲存會連同「第一次打開時嘅原狀」一齊記,所以第一個改動都還原得。**比較** 係語義比較,`Data.SpawnX: 128 -> 256`,唔係邊啲 byte 郁咗;**同而家比較** 就拎某個版本同開住嘅文件比。**還原** 係將舊版本當新一條記錄寫返,歷史永遠唔會被改寫,所以還原都可以再還原。整個 `.dat` 或 `.nbt` 照磁碟原樣存;chunk 就存佢自己未壓縮嘅 NBT,咁歷史同比較淨係關呢個 chunk 事,唔會拖埋成個 region。
- **安全:** 受管伺服器行緊個世界,或者 `session.lock` 鎖住(Windows 真係鎖,其他系統只係建議,所以程式亦會傳入自己伺服器嘅資料夾),就唔准儲存同還原,會講原因,改動留喺編輯器,伺服器停咗再存。儲存前預設備份(可以關),保留每個檔案最近十個。寫檔先寫臨時檔再改名,當機都唔會得半個檔。開咗之後磁碟上面嘅檔案變咗,唔會蓋過去,要重新開。未儲存嘅改動,開第二樣之前會問。冇改過嘅檔案永遠唔會被重寫,儲存掣要有改動先用得。沒改嘅讀寫喺 NBT 內容層面逐 byte 一樣,包括重複名、空列表宣告嘅類型、NaN、唔係有效文字嘅字串同根後面多出嘅 byte;壓縮會按原本包裝重做,但壓縮器可能揀唔同 byte,所以改過嘅檔案壓縮後 byte 可能唔同,入面資料就一樣。
- **版面:** 闊嘅視窗並排顯示檔案、標籤、歷史;720 px 或以下三格變成分頁,手機唔會少咗功能;行高同欄位、開關變大啲方便撳;尊重減少動態設定;每個控制項有名、焦點框同鍵盤路徑。
- **未做:** Bedrock 世界用 LevelDB,所以淨係開到 Bedrock `level.dat` 同獨立 NBT 檔;復原最多 100 步,好大嘅 chunk 少啲;唔會偵測其他電腦上面行緊嘅伺服器。
- **驗證:** `tree.test.ts` 33 個測試、`nbteditor.test.ts` 23 個測試(用真嘅暫存世界同真嘅 Git)、介面 27 個測試。未做:喺建好嘅桌面程式入面行過,主程序接線同 preload 橋仲係另一步,亦未有建好介面嘅截圖。

### 設定表格

標籤上面嘅 **Tree**（樹）同 **Settings form**（設定表格）可以喺同一個檔案嘅兩種睇法之間轉，揀咗會記住。表格跟世界設定設計排：**世界**、**出生點**、**時間同天氣**、**世界邊界**、**其他值**，入面每個群組（例如 **遊戲規則**、`difficulty_settings`）各自一節，最尾係 **關於呢個檔案**。每個值都用專屬控制項，同棵樹一樣嘅編輯、還原同歷史。列表、陣列同更深嘅群組會數出嚟，附連結去棵樹。

傳統 `level.dat` 由 `Data` 群組讀起，其他檔案由根讀起，所以 26.1 由 `level.dat` 分出嚟嘅檔案（`data/minecraft/game_rules.dat`、`weather.dat`、`world_clocks.dat`）都會變成表格。26.1 嘅 `level.dat` 會喺世界有呢啲檔案時畀掣去開佢哋。搜尋欄（連 regex 建構器）可以用易明名、遊戲鍵或者易明數值收窄表格。

### Region 畫布

列出 region 檔案嘅 chunk 時，中間會轉去 **Region**：成個 region 32×32 個 chunk 位畫成一幅圖，可以按 **儲存大小**、**最後儲存** 或者 **壓縮** 上色。空位用框，開唔到嘅 chunk 用斜線，所以唔止靠顏色。揀一個 chunk 會顯示方塊範圍、大小、最後儲存同壓縮（放喺 `.mcc` 外部檔會講明）；**Open this chunk** 或者雙擊就喺樹或者表格打開。成個格仔係一個 tab 位：方向鍵移動，Home、End 跳去行頭行尾，Enter 揀。

### LZ4 同外部 chunk

用 LZ4 壓縮嘅 region chunk（壓縮位元組 4，lz4-java 區塊串流）開得、存返都係 LZ4。太大放唔入 region 檔嘅 chunk 會放喺隔籬嘅 `c.<x>.<z>.mcc`，壓縮位元組加 128；會由嗰個檔開，存檔時變得太大就好似遊戲咁搬過去（先寫 `.mcc`，再寫指住佢嘅 region）。縮返細過上限就寫返入 region，舊 `.mcc` 留低唔讀。`.mcc` 唔見咗會講明係邊個檔。

### 地圖畫布

地圖物品檔（`data/map_<n>.dat`，26.1 之後係 `data/minecraft/maps/<n>.dat`）會用 **Map art** 打開：128×128 個像素用遊戲自己嘅地圖顏色（61 個底色，每個四級明暗）畫出嚟，有 **筆**、**直線**、**填色** 同 **吸色**。**匯入圖片** 會將圖縮做 128×128，每個像素配最接近嘅地圖顏色（透明位保持透明）；**匯出 PNG** 存低而家見到嘅樣。每一筆或者每次匯入都係一個編輯、一步還原，成個顏色陣列一齊送，所以歷史同比較照常用。地圖設定（比例 1:1 至 1:16、中心、維度、鎖定、顯示玩家）喺畫布隔籬，用專屬控制項。

唔使滑鼠都畫得：畫布可以攞焦點，方向鍵移動游標像素，Space 喺嗰度畫或者填色，P 吸嗰格嘅顏色。

### 背包同物品編輯器

玩家資料（`playerdata/<uuid>.dat`，26.1 之後係 `players/data/<uuid>.dat`，仲有舊 `level.dat` 入面嘅單人玩家）會多一個 **Inventory** 檢視：盔甲同副手、27 格主背包同快捷欄，或者終界箱；每疊物品有短碼、自己嘅顏色同數量，螢幕閱讀器會讀出全名（「快捷欄 1：鑽石鎬」）。揀一疊會列出佢所有值，每個用專屬控制項，跟物品本身嘅層次排：ID、數量、每個組件或者舊式 tag 值，所以 `minecraft:enchantments` 入面嘅附魔等級係 1 至 255 嘅加減器，用附魔名做標籤。揀空格會有 **Put it here**（放喺度），填物品 ID 同數量，用返檔案本身嘅格式寫（1.20.5 之後用組件同 `count`，之前用 byte 嘅 `Count`；1.21.5 之後盔甲放入 `equipment`）。

### 結構編輯器

結構模板（`.nbt`）會用 **Structure** 打開：一次一層畫成格仔，西至東、北至南，隔籬有成個建築嘅等角預覽，而家呢層以上會淡啲。**Paint**（畫）會將揀咗嘅調色盤項目畫落拖過嘅每一格，**Pick**（吸）攞返嗰格嘅項目；層數隔籬嘅箭咀（或者 Page Up、Page Down）轉高度。調色盤列出每個方塊狀態嘅易明名、屬性同用咗幾多個。每一筆將成個方塊列表當一個編輯送出，一步還原，每個方塊自己嘅資料（箱嘅物品、告示牌文字）原封不動。闊過 96 格或者大到讀唔晒做文字嘅結構留喺樹度改。

鍵盤：成個格仔係一個 tab 位；方向鍵移動，Space 畫，P 吸。

### 講人話嘅名同專屬控制項

標籤樹預設講人話：識得嘅欄位會顯示意思（**出生點 X**、**遊戲模式**、**死咗保留物品**），遊戲原本嘅鍵放喺提示；類型晶片講明係乜嘢值（**整數**、**是否**、**一日入面嘅時間**、**顏色**）；數值用人睇得明嘅方式顯示（**創造**、**是**、**12:00，第 2 日**、**6 分 2 秒**、**鑽石鎬**）。唔識嘅鍵會拆開做字。

每個值都用啱佢嘅控制項：是否用開關；固定選項用名揀；有界數字用加減器，有真正上下限同單位；範圍用滑桿；`DayTime` 用一日之內嘅滑桿加時鐘，日數保留；tick 時長用分秒，±1 秒、±1 分；RGB 顏色（兩種物品格式嘅染色、藥水同地圖顏色）用顏色選擇器；資源 ID 旁邊顯示易明嘅名；自由文字同唔識嘅嘢用有範圍檢查嘅欄位。鍵比對唔分大細楷同底線，1.21.11 改名前後都對得上。每個控制項送出嘅編輯同文字欄一樣，所以還原、歷史、備份同「伺服器運行緊唔准寫」全部照舊，整數用 64 位元計。

頂欄嘅 **Game names**（遊戲名）會顯示原本嘅鍵同類型，每個值用文字欄；呢個選擇會喺呢部電腦記住。

### Chunk 檢視

由 region 畫布打開嘅 chunk 會直接去 **Chunk**：16 乘 16 嘅圖，西至東、北至南，有四層。**Height**（高度）讀揀咗嘅 heightmap，按每條柱嘅地面 Y 上色。**Biome**（生態域）、**Blocks**（方塊）同 **Light**（光）讀滑桿嗰個高度嘅 section：生態域每 4 格一格、方塊按調色盤上色、方塊光由 0 到 15。每格都有讀得出嘅名（「x 7, z 2: Stone」）。側邊列出呢個 chunk 嘅方塊實體（箱、告示牌、生怪籠）同佢哋嘅位置，仲有生成步驟。1.17 之後生物同物品喺 entities 資料夾嘅 region 檔，打開嗰個 region 先改得。數值照舊喺樹同表格度改，每次編輯同還原之後幅圖都會重新讀。

### Bedrock 世界

揀一個 Bedrock 世界資料夾，檔案隔籬會列出佢 LevelDB 入面嘅紀錄（**Bedrock world records**）：本機玩家、其他玩家、世界紀錄（傳送門、計分板、地圖、村莊）同每個 chunk 嘅紀錄，按維度、chunk 同種類命名，可以搜尋。NBT 紀錄會用 little-endian 打開，所有檢視同控制項都用得。儲存會喺世界最新嘅 LevelDB log 加一個寫入批次（下一個序號、照 LevelDB 自己嘅分塊同 CRC-32C），之前先將個 log 抄一份去編輯器歷史資料夾嘅 `bedrock-backups`；遊戲之後會讀到新值。記得先閂 Minecraft。讀取器讀 log 同排序表（無壓縮、Snappy、zlib 或 raw deflate），每個鍵取最新值、刪咗嘅唔顯示，讀唔到嘅檔案會講出嚟。
