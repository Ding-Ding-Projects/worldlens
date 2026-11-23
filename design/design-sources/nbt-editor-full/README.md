# NBT editor, full

Design boards for taking the NBT editor from a typed tree to a full visual editor, made on 2026-11-23. Each board is one category, on its own canvas page, and each has a theme tweak.

| Board | What it shows |
| --- | --- |
| `Tree.dc.html` | The typed tree (kept), with Find and replace, Check, Export, and an inspector that switches between the value editor, SNBT and a semantic diff. Each tag that has a rich editor links to it. |
| `Region.dc.html` | A 32 × 32 canvas of a region file, coloured by stored size, last saved, time players spent, entities or status, with damaged and missing chunks marked. Picking a chunk shows its facts and actions (open views, open NBT, copy, export, regenerate, delete behind the two-key confirmation). |
| `Chunk.dc.html` | One chunk as layers: heightmap, biomes, blocks per section and light, with a section slider. Beside it, the chunk's entities and block entities and an entity editor (position, health, name, flags). |
| `Structure.dc.html` | A structure file as an editable layer grid plus an isometric preview, with select, paint, fill, pick, line and box tools, the palette with counts, a block-state editor, replace all, rotate and mirror. |
| `MapArt.dc.html` | A `map_*.dat` file as a pixel canvas with the map colour palette and its four shades, pen, fill, pick, line and rectangle, picture import with nearest-colour matching, PNG export, and the map's centre, scale, dimension, lock and tracking settings. |
| `Inventory.dc.html` | A player's inventory, ender chest and equipment as slots, and an item editor: id, count, rich-text custom name, enchantments with levels, durability and unbreakable. |
| `LevelDat.dc.html` | `level.dat` as a form: name, seed, game mode, difficulty, hardcore, spawn (with pick on the map), time of day with a sun dial, weather, world border, data packs and every game rule as a switch or a stepper. |

## What the build must do beyond the boards

- Every rich editor writes the same NBT the tree shows, through the same undo stack, history and safety rules (no writes to a running world, atomic save, backup).
- Item data is read and written in both layouts: item components (1.20.5 and later) and the older `tag` compound.
- The gaps listed under "Not yet" in `docs/nbt-editor.md` (LZ4 chunks, `.mcc` external chunks, Bedrock LevelDB) are part of "every NBT file", and are built rather than only explained.
