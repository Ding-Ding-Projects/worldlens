# Closeout prompt

```text
WorldLens (Ding-Ding-Projects/worldlens), main at the commit that adds this file.
Done and verified by jsdom tests (shell/, tabs/, kid/, App.test.ts, site; CI green at 26bf7bb):
- Work strip is BlueMap-ordered: Worlds (Get a world, Convert, NBT editor, Structures, CoreProtect),
  Rendering, Finished maps (now with Screenshots), Keeping a copy. Every Minecraft tool stays visible.
- General tools live in one "Built-in tools" tab (toolHubs.ts, ToolHub.vue). The short-lived
  "Other tools" tab folds back into NBT editor and Convert.
Designed, not built (boards in design/design-sources/):
- nbt-editor-full/: tree+SNBT+diff+find/replace, region canvas, chunk layers and entity editor,
  structure layer editor, map art canvas, inventory and item editors, level.dat form.
- deploy-anywhere/: one-click deploy of the whole app as a container (Docker host) or a virtual
  appliance (Hyper-V, VirtualBox, VMware, QEMU, USB, image), and a Running copies list.
Next: build the NBT rich editors one board at a time (level.dat form and region canvas first),
then the container deploy over the existing hosted image and Docker manager, then the appliance.
Still red, untouched: copy/catalogueCoverage.test.ts (20 keys from the sharing work).
```
