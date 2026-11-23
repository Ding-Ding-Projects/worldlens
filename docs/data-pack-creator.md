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
- **Check and export** lists every problem by place, previews any file, and **Save as .zip** (enabled once there are no problems) downloads `<namespace>.zip`. Put it in the world's `datapacks` folder and run `/reload`.

## Configuration

Pack info holds the namespace and description. Everything else is a typed control. The draft is kept in browser storage under `worldlens-datapack-draft` until **Start over**.

## Failure modes

- Blocked storage: the editor works but the draft is not kept between visits.
- The command check knows command names, not their arguments; the game may still reject a line.
- Not built yet: opening an existing pack, world generation, predicates and item modifiers.

## Security considerations

Files are built in memory and written as a stored (uncompressed) ZIP with relative paths only; a path with `..` is refused. Nothing is sent anywhere. Functions run with operator rights once enabled, so only enable packs you have read.

## Verification

`npx vitest run packages/ui/src/components/datapack` covers `pack.mcmeta` in both styles, pattern trimming, ingredient shapes, folder names, checks, CRC-32 and archive layout, and the screen's grid painting, problem list, draft keeping and functions. Exported packs have not yet been loaded in a running game.

## 廣東話

**Data packs** 分頁（Work 列、Worlds 組）用有類型嘅控制項整 Java 版 data pack，唔使手寫 JSON。

- **Works with** 揀遊戲版本，決定 pack format、資料夾名同 JSON 形狀：26.1 係 101.1，1.21.11 係 94.1，1.21.9–1.21.10 係 88.0，之後用 `min_format` / `max_format`；1.21.8 或之前用 `pack_format`。1.21 起資料夾係單數（`recipe`、`function`），1.21.2 起材料直接寫 id，之前寫 `{item}` / `{tag}`。
- **配方：** 3 乘 3 合成格用筆刷物品畫（右鍵或 Delete 清空），有形配方會自動剪走空行空列；熔爐、高爐、煙燻爐、營火有烹煮時間同經驗值滑桿；切石機同鍛造台都有。
- **函數：** 一行一個指令，打字時逐行檢查（唔好加斜線、要係識得嘅指令）；**Build a command…** 用指令建構器加一行；**Run when the pack loads** 同 **Run every tick** 會寫 `load` 同 `tick` 函數標籤。
- **標籤、進度、戰利品表**全部用揀嘅：圖示、框、觸發物品、上一個進度、經驗獎勵、獎勵函數、每次開抽幾次、權重同數量範圍。
- **Check and export** 按位置列出每個問題，可以預覽任何檔案；冇問題先可以 **Save as .zip**，放入世界嘅 `datapacks` 資料夾再打 `/reload`。

草稿存喺瀏覽器儲存，撳 **Start over** 先清。ZIP 只用相對路徑，有 `..` 會拒絕，乜都唔會傳出去。函數啟用後有管理員權限，所以只開你睇過嘅 pack。未做：打開現有 pack、世界生成、predicate 同 item modifier。匯出嘅 pack 未喺真遊戲度載入過。
