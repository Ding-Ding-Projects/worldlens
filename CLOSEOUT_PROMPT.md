# Closeout prompt

```text
WorldLens (Ding-Ding-Projects/worldlens), main at the commit that adds this file.
Built and tested (jsdom):
- Work strip is BlueMap-ordered (Worlds, Rendering, Finished maps, Keeping a copy); general tools live
  in one Built-in tools tab (toolHubs.ts, ToolHub.vue).
- NBT editor is readable: nbtFieldCatalogue.ts gives each field a readable name, a plain type and a
  tailored control (switch, select by name, bounded stepper, slider, time-of-day, duration, colour
  picker, resource name); NbtValueEditor renders them; "Game names" shows raw keys. 51 tests green.
- Research: docs/nbt-research.md (eras 1.20.5, 1.21.5, 1.21.9, 1.21.11, 26.1; region LZ4 and .mcc;
  map colours; structures; Bedrock LevelDB; field-to-control table).
Designed, not built yet (design/design-sources/):
- nbt-editor-full/: region canvas, chunk layers and entity editor, structure editor, map art canvas,
  inventory and item editors, world settings form, tailored controls.
- deploy-anywhere/: one-click container and virtual-appliance deploys of WorldLens; a Minecraft server
  appliance with a management site inside (first account is the owner; password, passkey, TOTP or any
  combination); Running copies.
Next, in order: World settings form (incl. 26.1 split files), region canvas, LZ4 and .mcc chunks,
map art canvas, inventory and item editors, structure editor, chunk views, Bedrock LevelDB; then the
container deploy, the WorldLens appliance, and the Minecraft server appliance with its site.
Still red, untouched: copy/catalogueCoverage.test.ts (20 keys from the sharing work).
```
