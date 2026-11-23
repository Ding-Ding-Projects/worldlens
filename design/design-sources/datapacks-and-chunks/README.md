# Data pack creator and "render only these chunks"

Design boards made on 2026-11-23.

| Board | What it shows |
| --- | --- |
| `DataPack.dc.html` | A data pack creator: the pack's version and pack format, a list of what it holds (recipes, functions, advancements, loot tables, predicates, item modifiers, tags, enchantments, world generation, pack icon and info), a visual crafting grid with a paint palette and result count, a function editor that checks each line against the version, and a check-and-export panel that saves to a world's `datapacks` folder, a server appliance or a .zip. |
| `ChunkPicker.dc.html` | Render only these chunks: a top view of the chunks the world has generated, coloured like the map or plain. Click a chunk, or drag a rectangle, circle or freehand shape, to select; Alt removes. Arrow keys, Space and Shift work too. Shows the count, a time estimate, quick picks (all, clear, around spawn), the dimension, a saved name and Render these. |
