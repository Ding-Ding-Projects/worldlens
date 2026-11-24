# Data pack creator

The **Data packs** tab (Work strip, Worlds group) makes a Java Edition data pack with typed controls instead of hand-written JSON. Design: `design/design-sources/datapacks-and-chunks/DataPack.dc.html`. Code: `design/packages/ui/src/components/datapack/`.

## Behaviour

- **Works with** picks the game version. It decides the pack format, the folder names and the JSON shapes:

  | Version | Data pack format | `pack.mcmeta` | Folders | Ingredients |
  | --- | --- | --- | --- | --- |
  | 26.1 | 101.1 | `min_format` / `max_format` | singular | plain ids |
  | 1.21.11 | 94.1 | `min_format` / `max_format` | singular | plain ids |
  | 1.21.9 – 1.21.10 | 88.0 | `min_format` / `max_format` | singular | plain ids |
  | 1.21.7 – 1.21.8 | 81 | `pack_format` | singular | plain ids |
  | 1.21.6 | 80 | `pack_format` | singular | plain ids |
  | 1.21.5 | 71 | `pack_format` | singular | plain ids |
  | 1.21.4 | 61 | `pack_format` | singular | plain ids |
  | 1.21.2 – 1.21.3 | 57 | `pack_format` | singular | plain ids |
  | 1.21 – 1.21.1 | 48 | `pack_format` | singular | `{item}` / `{tag}` objects |
  | 1.20.5 – 1.20.6 | 41 | `pack_format` | plural | `{item}` / `{tag}` objects |

- **Recipes:** shaped and shapeless crafting on a 3 by 3 grid painted with a brush item (right-click or Delete empties a slot); the shaped pattern is trimmed to the used rows and columns and each item gets one key symbol. Furnace, blast furnace, smoker and campfire have cooking time and experience sliders. Stonecutter and smithing table (template, base, addition) are supported. Results are item stacks (`id`, `count`).
- **Functions:** one command per line, each checked as you type (no leading slash, a known command name). **Build a command…** opens the command builder and adds its result as a line. **Run when the pack loads** and **Run every tick** write `minecraft:load` and `minecraft:tick` function tags.
- **Tags:** item or block tags with chips; values may be ids or other `#tags`; **Replace** sets `replace: true`.
- **Advancements:** title, description, icon, frame (task, goal, challenge), the item that grants it (or straight away), the advancement it comes after, an experience reward, a reward function, announce and hidden.
- **Loot tables:** chest, block or mob drops; picks per open as a range; each drop has an item, a weight and a count range (`set_count`).
- **Predicates** are snapped together as blocks (all of, any of, not, weather, biome, random chance and more). **Biomes** set climate, colours and spawn weights, with a climate graph of every biome in the pack.
- **More parts** covers every other registry a pack can add to, each started from a small file the game reads: item modifiers, enchantments and enchantment providers, damage types, armour trim materials and patterns, banner patterns, paintings, chat types, jukebox songs, goat horn sounds, dimensions and dimension types, noise settings, density functions, configured and placed features, structures, structure sets, jigsaw template pools, processor lists and cave carvers. These are edited as JSON, checked as you type, with **Tidy the layout** and **Start again from the template**. Folders follow the version (`item_modifier` from 1.21, `item_modifiers` before).
- **Item modifiers** also get a step editor above their JSON: set how many (range, or add to the stack), durability, enchant as if with levels, enchant at random, rename, lore lines, smelt, and explosion decay. Steps move up and down and are removed in place. A function with no editor yet (or a `set_count` with a binomial count) is named and kept exactly as written, and conditions on a step are kept.
- **World generation parts** get typed editors above their JSON (design: `design/design-sources/datapacks-and-chunks/WorldgenParts.dc.html`). A **placed feature** shows its placement steps as cards (tries per chunk, 1 in N chunks, spread across the chunk, height range with even or middle-heavy spread, biome filter), moved, removed and added in place, beside a depth gauge of the Y band it can land in. An **ore** configured feature sets its ore block, vein size and the chance to skip blocks touching air. A **structure set** with a random spread sets spacing and separation over a grid preview of start cells, and a separation that is not smaller than the spacing is reported as a problem. **Noise settings** set sea level, bottom and height, the fill block and fluid, aquifers, ore veins and mob placement. Every control patches the file in place, so fields with no control are kept, and an unknown placement step is named and kept.
- **Version overlays** add `overlays.entries` to `pack.mcmeta`: a folder name and the oldest and newest version it applies to, written as `min_format` / `max_format` from format 82 and as a `formats` range before.
- **Open a pack (.zip)** reads an existing pack. Functions and item and block tags open in their visual editors; every other registry file, including a recipe, advancement or loot table the visual editors cannot read back, opens under **More parts**. A file under another namespace (an override of `minecraft`, say) keeps that namespace. Anything that is not a registry file is kept exactly as it was and written back.
- **Advancements** are drawn as a tree. Drag one onto another to make that its parent; a drop that would make a loop is refused and says why.
- **Save into a world** (desktop app) lists the Minecraft worlds this computer has, or takes a folder from the browse button, and writes `<namespace>.zip` into that world's `datapacks` folder. The folder must hold `level.dat`, the file is written beside its final name and renamed over it, and a pack of the same name is replaced and reported as replaced.
- **Save onto a server** (desktop app) lists the Minecraft servers WorldLens manages (local, Docker or SSH) and writes `<namespace>.zip` into that server's world `datapacks` folder through the server's own transport (`mcserver:datapack:install`). The world folder comes from `level-name` in `server.properties`, `world` when it is not set. A pack of the same name is backed up, replaced and reported as replaced. The Minecraft server appliance's management site has the same upload as `POST /api/servers/<id>/datapacks`, but no page that calls it yet.
- **Find a part or file** searches section names and every entry's name, plain text by default with the regex builder beside it.
- **Check and export** lists every problem by place, previews any file, and **Save as .zip** (enabled once there are no problems) downloads `<namespace>.zip`. Put it in the world's `datapacks` folder and run `/reload`.

## Configuration

Pack info holds the namespace and description. Everything else is a typed control. The draft is kept in browser storage under `worldlens-datapack-draft` until **Start over**.

## Failure modes

- Blocked storage: the editor works but the draft is not kept between visits.
- The command check knows command names, not their arguments; the game may still reject a line.
- A part's JSON is checked for being JSON, not against the game's schema for that registry; the game may still reject a field.
- Not built yet: typed editors for the parts under **More parts** other than item modifiers and the four world generation kinds above, and a page on the server appliance's management site that uploads a pack (its API route exists). In a hosted deployment the save-into-world channel is refused with the rest of the NBT editor's channels, because they do not yet confine paths to the mounted folders.

## Security considerations

Files are built in memory and written as a stored (uncompressed) ZIP with relative paths only; a path with `..` is refused. Nothing is sent anywhere. Functions run with operator rights once enabled, so only enable packs you have read.

## Verification

`npx vitest run packages/ui/src/components/datapack` covers registry parts (templates, singular and plural folders, opening them back, overrides of another namespace), overlays in both styles, `pack.mcmeta` in both styles, pattern trimming, ingredient shapes, folder names, checks, CRC-32 and archive layout, and the screen's grid painting, problem list, draft keeping and functions. Exported packs have not yet been loaded in a running game.

## 廣東話

**Data packs** 分頁（Work 列、Worlds 組）用有類型嘅控制項整 Java 版 data pack，唔使手寫 JSON。

- **Works with** 揀遊戲版本，決定 pack format、資料夾名同 JSON 形狀：26.1 係 101.1，1.21.11 係 94.1，1.21.9–1.21.10 係 88.0，之後用 `min_format` / `max_format`；1.21.8 或之前用 `pack_format`。1.21 起資料夾係單數（`recipe`、`function`），1.21.2 起材料直接寫 id，之前寫 `{item}` / `{tag}`。
- **配方：** 3 乘 3 合成格用筆刷物品畫（右鍵或 Delete 清空），有形配方會自動剪走空行空列；熔爐、高爐、煙燻爐、營火有烹煮時間同經驗值滑桿；切石機同鍛造台都有。
- **函數：** 一行一個指令，打字時逐行檢查（唔好加斜線、要係識得嘅指令）；**Build a command…** 用指令建構器加一行；**Run when the pack loads** 同 **Run every tick** 會寫 `load` 同 `tick` 函數標籤。
- **標籤、進度、戰利品表**全部用揀嘅：圖示、框、觸發物品、上一個進度、經驗獎勵、獎勵函數、每次開抽幾次、權重同數量範圍。
- **Check and export** 按位置列出每個問題，可以預覽任何檔案；冇問題先可以 **Save as .zip**，放入世界嘅 `datapacks` 資料夾再打 `/reload`。

- **Predicate** 用積木砌（all of、any of、not、天氣、生物群系、隨機機率等）；**生物群系**設氣候、顏色同生成權重，仲有成個 pack 嘅氣候圖。
- **More parts** 包晒其他 registry：item modifier、附魔、傷害類型、盔甲紋飾材料同圖案、旗幟圖案、畫、聊天類型、唱片、山羊角、維度、噪聲設定、地物、結構、結構組、拼圖池、處理器列表、洞穴雕刻器等等。每樣由一個遊戲讀得嘅細檔案開始，用 JSON 改，打字時檢查係咪有效 JSON。
- **Version overlays** 喺 `pack.mcmeta` 加 `overlays.entries`：資料夾名同適用嘅最舊同最新版本；format 82 起寫 `min_format` / `max_format`，之前寫 `formats` 範圍。
- **Open a pack (.zip)** 打開現有 pack：函數同物品方塊標籤入視覺編輯器，其他 registry 檔案（包括視覺編輯器讀唔返嘅配方、進度、戰利品表）喺 **More parts** 打開；其他 namespace（例如覆寫 `minecraft`）嘅檔案保留原本 namespace。
- **Find a part or file** 搜尋分類名同每個項目名，預設純文字，旁邊有 regex 建構器。

草稿存喺瀏覽器儲存，撳 **Start over** 先清。ZIP 只用相對路徑，有 `..` 會拒絕，乜都唔會傳出去。函數啟用後有管理員權限，所以只開你睇過嘅 pack。世界生成部件都有編輯器：placed feature 嘅放置步驟逐張卡（每區塊試幾次、幾多個區塊先一次、散落成個區塊、高度範圍、生物群系過濾），旁邊有深度計；礦脈設礦石方塊、大細同掂到空氣嘅略過機率；結構組設間距同分隔，有格仔預覽，分隔唔細過間距會報錯；noise settings 設海平面、底部同高度、填充方塊同液體、含水層、礦脈同生成時唔放生物。所有控制項只改嗰個欄位，其他照留。Item modifier 喺 JSON 上面仲有步驟編輯器：數量（範圍或者加落去）、耐久、用等級附魔、隨機附魔、改名、lore、燒熔、爆炸損耗；冇編輯器嘅 function 會保留原樣，步驟嘅 conditions 都保留。part 嘅 JSON 只檢查係咪 JSON，唔係對住遊戲 schema，遊戲都可能拒絕某啲欄位。進度樹可以拖一個去另一個度，令後者做佢嘅上一個進度，會整成循環嘅就拒絕兼講原因。**Save into a world**（桌面版）列出呢部電腦嘅世界或者用瀏覽掣揀資料夾，將 `<namespace>.zip` 寫入嗰個世界嘅 `datapacks`；資料夾一定要有 `level.dat`，先寫暫存檔再改名，同名嘅會取代兼講明。未做：item modifier 同上面四款世界生成以外 More parts 嘅視覺編輯器、伺服器專用機管理網站上傳 pack 嘅頁面（API 已經有）；**Save onto a server**（桌面版）可以將 pack 經伺服器自己嘅傳輸寫入 WorldLens 管理緊嘅伺服器（本機、Docker 或 SSH），世界資料夾跟 `server.properties` 嘅 `level-name`，同名嘅會先備份再取代；託管模式下呢個存檔通道同 NBT 編輯器其他通道一樣拒絕。匯出嘅 pack 未喺真遊戲度載入過。
