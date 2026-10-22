# Configuration editor usability handoff

Design date: 2026-10-22. Baseline supplied by the coordinating task: `b089355c`, with concurrent task changes pending. This is a source-inspected design specification, not evidence of a built or deployed interface. Scope is the existing Vue/Vuetify configuration editor only.

## Intended result

Help someone answer three questions immediately: which configuration they are editing, where to find the setting they need, and whether their edits have been saved. Preserve every existing setting, advanced option, structured editor, search tool and confirmation. Improve orientation and hierarchy without replacing the editor with a setup wizard or a simplified subset.

## Implementation boundary and source references

- Entry point: `design/packages/ui/src/components/config/ConfigScreen.vue`.
- File editor: `ConfigFileForm.vue`; individual settings: `ConfigField.vue`; primitive widgets: `ConfigControl.vue`, in the same directory.
- Specialized screens: `MapsScreen.vue`, `StoragesScreen.vue`, `RunScreen.vue` and the imported `HistoryPanel`.
- Navigation/search contract: `configSearch.ts`, `TabbedNavigation`, `ConfigSearchField` and `ConfigRegexBuilder`.
- Save contract: `ConfigApplyDialog.vue`, `ConfigSuperConfirm.vue`, `configWorkspace.ts` and `configModel.ts`.

Keep `initialScreen`, `initialFieldPath`, `goTo`, `revealPage`, selected map/storage keys and `worldlens-config-editor-tabs` unchanged. Keep synchronous generated defaults on initial display and the later real-folder load. Keep all event signatures, schema metadata, serializers and host capabilities. Do not change renderer values or file semantics as part of this layout work.

## Recommended layout

1. Add a compact workspace heading above the existing actions: **Configuration**, followed by the actual folder path or a truthful **Unsaved defaults** / **Browser preview** state. Add one short sentence: changes remain in the editor until saved. Use the existing host/workspace state, never infer that a generated configuration exists on disk.
2. Visually group Open/import, New and Re-read as folder actions. Keep Save visually primary, alongside unsaved and validation status. Preserve every current disabled condition and tooltip. Show a persistent short explanation when saving is unavailable so keyboard users do not depend on hovering a disabled control. Do not make the toolbar sticky until its behavior has been verified inside the real shell.
3. Retain the global search with its independent regex builder. Give it a clear scope label, **Search all configuration**, and retain grouped results with file, group and field identity. Keep the current per-file search separately labelled **Search this file**. Do not merge their state or remove either builder.
4. Preserve the eight existing tabs and their persisted navigation behavior. Add a small heading and task-oriented description for the active tab using existing screen metadata and localized messages. Avoid a second grid of navigation cards competing with the tabs.
5. Keep generated forms and every group open on first display. Give group headers clearer spacing and count alignment. Add optional **Expand all** and **Collapse all** controls if useful, but keep them explicit user actions and keep search/palette navigation able to reopen a target group. Never default advanced settings to hidden.
6. Preserve the visible field label and editable control as the strongest elements. Move technical type, documentation provenance and exact key into a secondary wrapping row. Keep errors, credentials notices, re-render warnings and consent state visible beside the affected field. Keep explanatory text and its existing expansion control, default/current distinction, advisory notes and reset action. A cosmetic change must not remove or hide any of these.
7. Keep the source disclosure and Copy action at the end of each file. Preserve raw-text recovery whenever parsing fails; it is an essential repair route, not an advanced decoration.

Use existing theme roles, typography and rounded surface components. Prefer a single modest header surface with whitespace over several nested cards. Reuse existing icons from the installed icon set; no new remote assets or image generation is required.

## Preserved capability inventory

| Surface | Controls and behavior that remain reachable |
| --- | --- |
| Workspace | Open/import folder, new folder/world selection, re-read, busy progress, unsaved state, validation count, Save, browser capability explanation, generated-default state |
| Core | Speed control and its exact underlying fields; all schema groups including advanced options; consent status and route to the existing consent setting |
| Maps | Search/select, create, duplicate, delete confirmation, complete per-map form, render-mask editing and its existing launcher, world/orientation context |
| Storages | Search/select, create, file/SQL type selection, database connection test and result, used-by information, delete confirmation, complete selected storage form |
| Web app | Every descriptor field, visitor presentation and generated-output settings |
| Web server | Every descriptor field, built-in server settings including address, port and access logging |
| Server plugin | Every descriptor field; truthful absence explanation when no plugin file exists |
| Run | Every CLI flag, independent search/builder, action summary, consent warning/remedy, exact generated command and Copy; do not imply that copying executes it |
| History | Existing folder-bound history and truthful no-folder state |
| Every file | Local search/builder, advanced switch, all schema groups/counts, read-only reason, file-wide/legacy/unknown-key diagnostics, source disclosure, Copy result, raw parse recovery |
| Every field | Switch, slider with numeric input, number, fixed/custom select, path picker, color, vector, single/multiline text, ordered list, key/value, record table, marker sets and masks; explanatory/default/provenance/advisory metadata and reset |
| Save review | Written/created/deleted files, exact before/after changes, affected re-renders, validation, deletion confirmation, cancel, saving state and actual failure message |

The schema remains the authoritative field inventory. Do not copy a fixed list of fields into the new layout or derive control availability from a hand-maintained shortlist.

## Addressable state inventory

Use stable evidence identifiers when verifying the implementation:

| Identifier | Required state |
| --- | --- |
| `config-defaults` | Host available, generated defaults, no folder yet, advanced fields visible |
| `config-preview` | No host, editable preview, clearly unavailable opening/saving |
| `config-folder` | Loaded real folder, exact identity, saved state |
| `config-dirty` | One changed field, unsaved state and reset |
| `config-search` | Global and per-file queries independent; cross-tab result opens the correct field |
| `config-regex` | Builder open; valid pattern, invalid pattern and no matches remain distinguishable |
| `config-advanced` | Explicit user hides/restores advanced fields; counts stay honest |
| `config-groups` | User collapse/expand; search jump reopens and reveals target |
| `config-parse` | Invalid file, diagnostics and working raw recovery |
| `config-readonly` | Controls disabled with the actual reason |
| `config-maps` | Existing selection, create, duplicate, mask and delete review |
| `config-storages` | File/SQL selection, connection in progress/result, referenced deletion review |
| `config-run` | Flags edited, summary/command updated and consent remedy |
| `config-history` | Folder history and no-folder explanation |
| `config-save` | Review open, cancel, saving, success and failure; separate delete confirmation |

## Accessibility, localization and narrow layouts

Use semantic headings inside the existing labelled editor region. Keep native button semantics and the shared tab keyboard behavior. New expand/collapse actions need clear names and disabled states; a disclosure needs `aria-expanded` and a real target. Preserve visible focus, polite copy/save results, error announcements and reduced-motion behavior. Do not communicate saved/error state by color alone.

Add new strings to the established copy/localization registry for English, Cantonese and bilingual modes. Do not insert English-only titles or concatenate translated fragments around a path. Preserve exact technical keys as secondary reference text. Long labels and paths wrap; use `min-width: 0`, `overflow-wrap: anywhere` and logical spacing. Scope style changes to these configuration components.

At narrow widths, stack workspace identity above folder actions and save status; make search full width; keep the existing tab overflow surface usable. Keep form controls full width and allow badge/default/reset rows to wrap. Preserve map/storage list-to-detail stacking. Do not introduce a fixed-width side navigation or two-column field layout. Source text may scroll within its own container, but the page must not scroll sideways.

## Verification and acceptance

An independent design review is required before implementation. This handoff contains no rendered reference, screenshot or runtime verdict. The implementation owner must bind actual evidence to the final source commit and built artifact, not this preliminary baseline.

Verify the changed screen at normal desktop size and the actual documented minimum client area, plus a 320 CSS-pixel stress check where the shell supports it. Check English, Cantonese and bilingual, light/dark, and 100%, 125%, 150% and 200% display scales. Inspect real bounds and computed styles for text/control clipping, keyboard focus and dialog overflow. Record unsupported tuples explicitly.

Acceptance requires every tab and control family above to remain reachable, search navigation to select the correct entity and reveal its target, editing/reset to preserve serialization, save review to retain its existing protections, and the real folder save to remain unchanged. Verify representative source disclosure, copy, invalid-file recovery, masks, SQL probing and history routes. Existing focused component tests may protect wiring; they do not replace built-interface inspection. This document authorizes no new feature sweep or unrelated redesign.

## Implementation record

The coordinating reviewer approved the bounded design. Implemented the compact configuration identity, visible save-disabled explanation, localized active-tab guidance and explicit expand/collapse group actions. All schema-generated fields remain expanded and advanced settings visible initially. Existing tab routing, search builders, serialization, save conditions and raw-file recovery are unchanged.

Focused verification: `pnpm exec vitest run packages/ui/src/components/config/ConfigFileForm.test.ts packages/ui/src/components/config/ConfigScreen.consentEpoch.test.ts` passed 2 files and 7 tests on 2026-10-22. Added interactions cover collapse/reopen without removing advanced fields, browser-preview identity, visible save explanation and guidance following tab navigation. The test fixture intentionally has an empty locale catalogue and emits fallback warnings; production strings were added to the existing fixed English/Cantonese registry, which supplies bilingual composition. Built layout, full localization rendering and real-folder save verification remain pending with the coordinating task.
