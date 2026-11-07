# Feature surfaces design, 2026-11-07

Design canvas for the feature surfaces Worldlens still owed against its feature delivery inventory. These are design references, not shipped behaviour: each surface is implemented separately in `design/packages/ui` and recorded in `docs/` and the feature inventory.

## Artboards

| File | Surface | Inventory id |
| --- | --- | --- |
| `Main.dc.html` | Extensions manager with search, filters, enable switches and a permission-change consent card | `extension-support` |
| `Base64.dc.html` | Base64 encoder and decoder with alphabet, text encoding, padding and strict options, plus the same-folder file drop with progress, pause and cancel | `base64-tools` |
| `VirtualDisks.dc.html` | Virtual disk library: route detection (VirtDisk API, Storage module, DiskPart, Hyper-V module), searchable and filterable list with differencing chains as a tree, and a detail pane with partition map, identity, sizes, sectors, alignment, fragmentation, parent chain and every action | `virtual-disk-manager` |
| `VirtualDiskOperations.dc.html` | Operations: grow and shrink with limits and partition extension, compact with every mode, convert, chain merge with the list of disks it invalidates, VHD Set checkpoints, identity, metadata, mirror and change tracking, Dev Drive and native boot checks; a route chooser and the equivalent script for each | `virtual-disk-manager` |
| `VirtualDiskCreate.dc.html` | Create: presets, format and type, size with live format limits, block and sector sizes, parent or copy source, access filter, preflight and the DiskPart script | `virtual-disk-manager` |
| `VirtualDiskQuickPack.dc.html` | Quick pack: phases, live counts, automatic growth, pause and cancel, numbered name on a clash, partial result with skipped files | `virtual-disk-manager` |
| `RenderIntoVhd.dc.html` | Render step option to store the whole BlueMap output inside one VHDX: sizing estimate, file system, automatic growth, detach, checkpoints per render, compact and verify | `virtual-disk-manager`, rendering |
| `Drawing.dc.html` | Annotation board: seven pens and an eraser with shortcuts in each tooltip, colour swatches, undo, redo, SVG and PNG export | `drawesome-drawing` |
| `LiveAndNotes.dc.html` | Live ticks-per-second chart with a pulsing live dot, gradient fill and keyboard scrub; rendered release notes; a per-control info button; external editor and VS Code hand-off | `live-charts`, `rendered-provider-text`, `info-icon-guidance`, `external-editor` |

`canvas.json` is the canvas index; the artboards open in any Design Component viewer.

## Look

The Worldlens design system: the dark scheme from `design/tokens.css` (primary `#8FCDFF`, surfaces `#101418` to `#323539`), Roboto and Roboto Mono, the 80 px application rail and browser-style job tabs. Pills use the full radius, cards 20 to 28 px. Every animated element has a reduced-motion path (the live dot stops pulsing).

## Process notes

- Stageshow guidance: the fresh install could not run in this environment, so the pinned cache at commit `299140fafd08df55a9c234e610c3f64af3f45531` was used. Read: `SKILL.md`, `references/craft.md`, `references/review.md`.
- Applied: restraint (three to seven real strings per surface), one large number per chart, real controls with labels, one focal surface per artboard.
- Not applicable: cursor walkthroughs, marketing crops, plates and satellites. These are real application screens, not marketing illustrations, so they are drawn at full screen size with the application chrome.
- Frames: the artboards were not filmed to stills in this pass. The implemented screens are checked in the built interface instead.

## Review findings and fixes

- First virtual disk design was a list plus one panel and did not show the full manager; replaced with four artboards covering every operation in the contract, plus the render-into-VHDX option.
- Scripts show only real commands: DiskPart and Storage module commands where they exist, the virtdisk.dll function name where only the API can do it, and the Hyper-V cmdlet as a commented equivalent.

- The extension row needed a visible cue for a permission change before the switch; added a tertiary "Asks for 1 new permission" chip.
- The Base64 decoder needed an exact error position for strict mode; the output now names the first invalid character and its offset.
- Open: none in the design. Native-only behaviour (Windows permission prompts for virtual disks) can only be shown in the real build.
