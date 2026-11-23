# Minecraft NBT: what the editor has to understand

Research notes behind the NBT editor's readable names and tailored controls, gathered 2026-11-23. Every rich control in the editor is chosen from these facts, so a field's control matches what the game actually stores there.

## The format

- NBT is a tree of typed tags. Each tag has a numeric type id, a name and a payload; SNBT is the text form used in commands.
- Types: byte (-128 to 127), short, int, long, float, double, string, list (one element type), compound, and byte, int and long arrays.
- Java Edition files are big-endian and usually gzip-compressed. Bedrock Edition NBT is little-endian.

## Version eras the editor must tell apart

| Era | What changed | What the editor does |
| --- | --- | --- |
| 1.20.5 | Item NBT `tag` replaced by structured item components (`minecraft:enchantments`, `minecraft:custom_name`, `minecraft:dyed_color`, `minecraft:damage`, `minecraft:unbreakable`, `minecraft:lore`, ...). | Reads and writes both layouts; picks the layout from `DataVersion`. |
| 1.21.5 | Text components are stored as NBT compounds, not strings holding JSON. Sign lines can be strings or compounds. | The rich text editor writes a compound on 1.21.5+ and a JSON string before it. |
| 1.21.9 | Each dimension's world border has its own `world_border.dat`. | World settings shows the border from that file when it exists. |
| 1.21.11 | Game rules renamed to snake_case (`keepInventory` became `keep_inventory`, `spawnRadius` became `respawn_radius`). | One rule catalogue with both names. |
| 26.1 | World storage reorganised (below). | Opens both layouts and labels which one a world uses. |

### 26.1 world layout

- Dimensions move to `dimensions/minecraft/overworld`, `the_nether` and `the_end`; the top-level `data` folder keeps only cross-dimension data and is namespaced (`data/minecraft/...`).
- Players: `playerdata` becomes `players/data`, with `players/advancements` and `players/stats`.
- Maps: `data/minecraft/maps/<n>.dat`; `idcounts.dat` becomes `last_id.dat`.
- `level.dat`: `Player` becomes `singleplayer_uuid`; `Difficulty` moves to `difficulty_settings.difficulty` and becomes a string (`peaceful`, `easy`, `normal`, `hard`); `DifficultyLocked` becomes `locked`.
- Moved out of `level.dat` into `data/minecraft/`: `game_rules.dat`, `weather.dat` (`clear_weather_time`, `rain_time`, `thunder_time`), `world_clocks.dat`, `world_gen_settings.dat`, `wandering_trader.dat`, `custom_boss_events.dat`, `scheduled_events.dat`, `chunk_tickets.dat`. The dragon fight moves to the End's own data folder.

## Region files

- 32 by 32 chunks per file. Each chunk has a compression byte: 1 gzip, 2 zlib, 3 none, 4 LZ4 (lz4-java block stream), 127 custom.
- Adding 128 to the compression byte means the chunk is too large and lives in `c.<x>.<z>.mcc` beside the region file.
- Chunks (1.18+): `sections` with `block_states` and `biomes` palettes and packed longs, `Heightmaps` (`MOTION_BLOCKING`, `WORLD_SURFACE`, ...), `Status`, `InhabitedTime`, block entities.

## Map items

- A map file holds a `colors` byte array of 16,384 entries (128 by 128), whatever the scale.
- Each byte is `base * 4 + shade`; shades multiply the base colour by 180, 220, 255 and 135 out of 255. About 61 base colours exist; base 0 is transparent.

## Structure files

- `size` (three ints), `palette` (each distinct block state once, `Name` and `Properties`), `blocks` (`pos`, `state` as a palette index, optional `nbt`), and `entities`.
- Bedrock `.mcstructure` files are uncompressed little-endian NBT with `block_indices` in two layers.

## Bedrock worlds

- World data lives in a Mojang variant of LevelDB; `level.dat` is uncompressed little-endian NBT with an eight-byte header.
- Chunk keys are the chunk X and Z (little-endian), an optional dimension, a record tag byte and, for sub-chunks, a Y index.

## Field to control

| Kind of value | Control |
| --- | --- |
| Byte that is 0 or 1 meaning yes or no (`hardcore`, `allowCommands`, rule switches) | Switch |
| Fixed set (`GameType`, difficulty, weather, `Status`, block-state properties) | Segmented buttons or select, by name |
| Bounded number (count 1 to 99, enchantment level, health, food 0 to 20) | Stepper with real limits |
| Range or proportion (durability, `players_sleeping_percentage`, light) | Slider with the number beside it |
| Ticks (`DayTime`, `Time`, weather durations) | Time-of-day dial or duration stepper in minutes and seconds |
| RGB int (`dyed_color`, firework and potion colours, map colours) | The infinite colour picker |
| Block position (spawn, `Pos`, structure `size`) | Coordinate triple with "pick on the map" |
| UUID int array | Read as one UUID, copy and regenerate |
| Resource id (`minecraft:diamond_pickaxe`, biome, block) | Searchable picker showing the readable name |
| Text component (`custom_name`, lore, sign lines) | Rich text editor with bold, italic, colour |
| Packed arrays (heightmaps, block states, map colours) | Canvas views |
| Anything unknown | Typed field with range check, and the raw tree |

## Sources

- Minecraft Wiki: NBT format, Region file format, Chunk format, Map item format, Bedrock Edition level format.
- Minecraft.net: Java Edition 1.20.5 and 26.1 changelogs.
- Mojang bug tracker MC-279252 (text components as NBT).

## 廣東話

呢份係 NBT 編輯器背後嘅研究筆記，2026-11-23 整理。編輯器每個專屬控制項都係跟呢度嘅事實揀，所以每個欄位用嘅控制項同遊戲真正儲存嘅嘢一致。

**格式。** NBT 係一棵有類型嘅標籤樹；Java 版大端序、通常用 gzip 壓縮，Bedrock 版係小端序。

**要分清楚嘅版本時期：** 1.20.5 物品由 `tag` 轉做物品組件；1.21.5 文字組件直接存做 NBT，唔再係 JSON 字串；1.21.9 每個維度嘅世界邊界有自己嘅 `world_border.dat`；1.21.11 遊戲規則改晒做 snake_case；26.1 成個世界資料夾重新排過（`dimensions/`、`players/data`、`data/minecraft/maps/<n>.dat`，遊戲規則、天氣、時鐘等等搬出 `level.dat`，難度變成字串）。

**Region 檔。** 每個 32×32 chunk；壓縮位元組 1 gzip、2 zlib、3 唔壓縮、4 LZ4、127 自訂；加 128 代表 chunk 太大，放咗喺隔籬嘅 `.mcc` 檔。

**地圖。** `colors` 有 16,384 個位元組；每個係 `底色 × 4 + 明暗`，四級明暗係 180、220、255、135（÷255）。

**結構檔。** `size`、`palette`、`blocks`、`entities`；Bedrock 嘅 `.mcstructure` 係冇壓縮嘅小端序 NBT。

**Bedrock 世界。** 資料喺 Mojang 改過嘅 LevelDB；`level.dat` 係冇壓縮小端序 NBT，前面有八位元組標頭。

**欄位對控制項：** 是否用開關；固定選項用分段按鈕或者下拉；有界數字用加減器；範圍用滑桿；tick 用時鐘轉盤；RGB 用無限顏色選擇器；座標用三格加「喺地圖揀」；UUID 合併顯示；資源 ID 用可搜尋選擇器顯示人睇得明嘅名；文字組件用富文字編輯器；壓縮陣列用畫布；唔識嘅欄位用有範圍檢查嘅欄位同原始樹。
