# Worldlens UI rewrite — handoff

**Status:** design approved, not yet implemented. This file is the spec Codex works from.
**Prototype:** `Worldlens.dc.html` (open it in a browser; it is clickable).
**Rejected alternatives, kept for reference:** `ShellB-Atlas.dc.html`, `ShellC-Workbench.dc.html`.
**Target repo:** `design/packages/ui` (Vue 3 + Vuetify 3, `md3` blueprint). Electron shell unchanged.

---

## 1. What changed, and why

The current shell is twelve browser-style closable tabs docked left, in three seeded groups,
with four floating buttons over the content, toasts that cover what you are reading, and a
close button on every tab and every settings section. Every one of those twelve destinations
is somebody's whole reason for opening the app, so **nothing is being removed** — the rewrite
changes only how they are reached.

| Problem today | What the rewrite does |
| --- | --- |
| 12 equal-weight destinations in the strip | 3 destinations in a rail: **Home · Map · Work** |
| No answer to "where do I start" | Home is five catalogue cards, each opening a page that lists what is in it |
| Floating FABs over content | Rail footer: search, bell, settings. No FABs anywhere |
| Toasts over content | Bell + history only. Nothing appears unprompted |
| Close buttons everywhere | Close buttons only on **open jobs**, nowhere else |
| Errors inline, in toasts, and in a corner badge | Inline in the section that owns it, plus a status strip and a Problems panel |
| Nested scroll areas | One scroll region per pane |

**The prose stays.** Explanatory paragraphs are the product's voice and were explicitly kept.
They are restyled — 68ch measure, `on-surface-variant`, `text-wrap: pretty`, sitting under the
control they explain rather than beside it.

---

## 2. Navigation model

```
Rail (80px, always)          Content
├── Home  ─────────────────► Home  ──► Catalogue page ──► opens a Job in Work
├── Map   ─────────────────► Viewer (canvas + control bar + map menu side sheet)
└── Work  ─────────────────► Job strip + one job pane
    (badge = open job count)

Rail footer (not FABs):  search (Ctrl+Shift+F) · bell (count) · settings
```

- **Home** never holds content of its own beyond the five catalogue cards.
- **Catalogue page** = back link, header, and a list of features, one row each: icon, name,
  meta, one-line blurb, chevron. Clicking a row opens the corresponding job in Work.
- **Work** holds several jobs at once as chips along the top. This is the old tab strip,
  scoped to jobs the user actually started. `+` returns to Home to pick another.
  Closing a job with unsaved work asks first.
- **Map** is a destination, not a backdrop. Home and Work are opaque surfaces; the canvas is
  only visible on Map. (The canvas stays mounted at shell level as it does today — do not move
  it into the page slot.)

### The five catalogues, and every feature under each

| Catalogue | Features (all reachable, nothing dropped) |
| --- | --- |
| **Make a map** | The guide · Projects · GitHub runners · Renders in progress · Render console · Automatic repair · Render mask drawing · Where it runs (this machine / Docker / SSH / Actions) |
| **Your maps** | Maps and servers · The viewer and its controls · Markers and marker sets · Remote BlueMap servers |
| **Share a map** | Publish to Pages · Watch it live · Private worlds · Remote hosting |
| **Keep a copy** | Backups · World repository · Local version history · World sources |
| **Set up & help** | Settings · Options editor (8 tabs, 154) · Appearance editors · Language and tone · Scheduled language and appearance · Where the panels sit · Display and ease of use · Docs · Changelog · Licence and consent · Command palette · Notification centre · Automatic updates · Startup recovery · Migration |

Cross-cutting behaviours that are not destinations — super confirmation, panel geometry,
action-specific artwork, tabbed-navigation persistence, reduced motion — keep their current
implementations and are surfaced where they already appear.

---

## 3. Old page → new home

| Old tab (`App.vue` `PAGE_*`) | New location |
| --- | --- |
| `PAGE_HOME` | **Home** (rewritten: five catalogue cards, not a tile grid) |
| `PAGE_MAP` | **Map** rail destination |
| `PAGE_WORLD` ("Make a map") | Work job `wizard`, from **Make a map** catalogue |
| `PAGE_PROJECTS` | Work job `projects` — **now the default route for making a map**, see §5c |
| `PAGE_CIRENDER` | Work job `runners`, from **Make a map** |
| `PAGE_RENDERS` | Work job `renders`, from **Make a map**. **The count stays on the tab label** ("Renders (1)"), as it does today, *and* also appears in the status strip and the Work rail badge — all three read the same `createActiveRenders` aggregator |
| `PAGE_SERVERS` | Work job `servers`, from **Your maps** |
| `PAGE_BACKUPS` | Work job `backups`, from **Keep a copy** |
| `PAGE_PAGES` | Work job `pages`, from **Share a map** |
| `PAGE_WORLDREPO` | Work job `worldrepo`, from **Keep a copy** |
| `PAGE_PREVIEW` | Work job `preview`, from **Share a map** |
| `PAGE_DOCS` | Work job `docs`, from **Set up & help** |
| Options editor (full-bleed overlay) | **Unchanged — still a full-bleed overlay**, opened from the Set up & help catalogue or the palette. It is a surface you save or abandon, not a place you leave and come back to |
| Settings drawer | Unchanged as a right drawer, opened from the rail footer |
| Command palette | Unchanged, `Ctrl+Shift+F`, opened from the rail footer |
| Notification centre | Rail-footer bell → history panel anchored beside the rail. No corner FAB, no toasts |
| First-run setup, EULA, welcome, tutorial | Unchanged; `onFirstRunFinished()` still lands on Home |

---

## 3b. Tabbed navigation is preserved in full — it moves, it does not shrink

`TabbedNavigation.vue` is a cross-project product requirement (the global-memory
`docs/features/product/tab-navigation.md` contract), not a Worldlens convenience. **Every one of
its powers survives**, relocated from "twelve destinations you must navigate" to "the jobs you
actually opened":

| Capability | Where it lives in the rewrite |
| --- | --- |
| Docking left, right, top, bottom | The **Where the tabs sit** popover on the job strip. Default is now top-of-Work rather than left-of-app, because the rail owns the left edge |
| Groups, named, coloured, collapsible | Group labels render inline in the job strip before their first member; the three seeded groups (Rendering / Finished maps / Keeping a copy) are unchanged |
| Pinning | Pinned tabs show a pin and have no close button. **Make a map** is pinned on a fresh workspace |
| Reordering by drag | Unchanged |
| Overflow | `⋯ N` control at the right end of the strip, opening the tab finder scoped to hidden tabs |
| Four discovery searches | The tab finder's four scopes: Tabs · Groups · Documentation · Bulk close |
| Bulk close with preview | Tab finder footer: select, invert, and a Close N action that previews exactly what would go |
| Context menu | Right-click a chip: pin, skip, duplicate, move to group, new group, move left/right, close, close others |
| Persistence of the arranged workspace | Unchanged — the seed is a seed, never re-applied to an existing workspace |
| Panel geometry (viewport-bounded, resizable, keyboard-movable) | Unchanged, and the popover states it |

The one thing that genuinely changes: the strip no longer lists pages nobody opened. Those are
reached from Home's catalogues, which is what makes the strip short. `ensurePage()` still runs on
mount so an upgrading workspace gains the pinned entry exactly once.

---

## 3c. Cross-project (global-memory) requirements, and where each one is in the prototype

These are the shared product requirements every one of these desktop apps carries. All are
present; none is a new invention.

| Requirement | Prototype surface |
| --- | --- |
| Tabbed navigation | Job strip + tab finder + context menu + dock popover |
| Regex builder on every search bar | `.*` affordance on every search field; the anchored builder with flags, token palette and live matches |
| Appearance editors | **Edit appearance…** on the options editor's field rows; continuous colour picker + Word-depth typography panel |
| Super confirmation | Two key switches, full-travel slider, emergency exit, action artwork, consequences named first |
| Command palette | `Ctrl+Shift+F` from the rail footer |
| Localization | Language and tone, plus scheduled language/appearance, both in Settings |
| Automatic updates | Non-blocking banner under the title bar |
| Notification centre | Rail-footer bell → history panel; nothing unprompted |
| Action-specific artwork | Bundled image on the super-confirmation gate, with semantic alt text |
| Memory console / control plane | Listed under Set up & help → Keeping the app healthy |

---

## 4. Tokens

**No new tokens.** Everything below already exists in
`design/packages/ui/src/styles/md3.scss` and `src/vuetify.ts`. The rewrite spends them
differently; it does not extend the vocabulary.

Default theme on a fresh install changes from light to **dark**. Light and contrast ship
unchanged.

### Colour roles used by the new shell (dark scheme values, for reference only — reference the role, never the hex)

| Element | Role |
| --- | --- |
| Window background, rail | `surface` `#101418` on `background` `#0B0E11` |
| Cards, job pane chrome | `surface-container` `#1D2024`, border `outline-variant` `#42474E` |
| Hover on a card | `surface-container-high` `#272A2E` |
| Active rail pill, hero card, active wizard step | `primary-container` `#004B73` / `on-primary-container` `#CEE5FF` |
| Primary action, progress fill, badge | `primary` `#8FCDFF` / `on-primary` `#003351` |
| Secondary catalogue icons | `secondary-container` `#384956` / `on-secondary-container` `#D3E5F5` |
| Tertiary (share, unsaved-changes chip) | `tertiary-container` `#4E4161` / `on-tertiary-container` `#EDDCFF` |
| Problems, destructive | `error-container` `#93000A` / `on-error-container` `#FFDAD6` |
| Body prose | `on-surface-variant` `#C2C7CF` |
| Meta, disabled | `outline` `#8C9199` |

### Shape

| Element | Token |
| --- | --- |
| Window caption buttons | `corner-none` |
| Job chips (top corners), field chrome | `corner-sm` 8px / `corner-md` 12px |
| Catalogue cards, panels, notification panel | `corner-lg` 16px |
| Command palette | `corner-xl` 28px |
| Buttons, chips, rail pills, badges | `corner-full` |

The rail's active indicator is a 56×32 `corner-full` pill — MD3's navigation-rail spec, not a
filled square.

### Type

Roboto throughout; `Roboto Mono` for paths, values, keys, digests and shortcuts — anything the
user could be asked to retype. Sizes map onto the existing ramp:

| Use | Ramp |
| --- | --- |
| Home / catalogue page headline | `headline-medium` 32px/40 |
| Job pane title | `headline-small` 26px |
| Catalogue card title | `title-large` 22px (hero) / `title-medium` 17px |
| Feature row name, setting title | `title-small` 15px |
| Body prose | `body-medium` 14px/21, capped at 68ch |
| Row blurb, field explanation | `body-small` 13px/20 |
| Meta, status strip, monospace values | `label-medium` 12px |

### Density

Comfortable. 48px minimum hit target on every rail item and every row action; catalogue feature
rows are 18px vertical padding; settings sections 18px.

---

## 5. Components to build

All new components live in `src/components/shell/`. Everything else keeps its current file.

| Component | Replaces / relates to | Notes |
| --- | --- | --- |
| `AppRail.vue` | new; sits beside `TabbedNavigation.vue`, does not replace it | 80px, three `VBtn`-free custom items + footer actions. Badge on Work reads the open-job count |
| `HomeCatalogues.vue` | `components/home/HomeScreen.vue` | Five cards. Hero card emits `openJob('wizard')` from its own button and `openCatalogue('make')` from the card body |
| `CataloguePage.vue` | new | Driven by a catalogue manifest, see below |
| `WorkPane.vue` | hosts `TabbedNavigation.vue` | **Do not rewrite `TabbedNavigation.vue` — re-host it.** It keeps docking, groups, pinning, reordering, overflow, the four searches, bulk close and the context menu. `WorkPane` supplies it the open-job list instead of the twelve-page list, and renders the active job in its slot |
| `StatusStrip.vue` | the `PAGE_RENDERS` tab-label counter | One line under the title bar: what is running, progress, problem count, one action |
| `ProblemsPanel.vue` | inline orange warnings scattered per screen | Docked bottom panel. Inline warnings stay where they are; this aggregates them |
| `NotificationPanel.vue` | `notifications-corner` FAB + toasts | Anchored beside the rail. `raiseNotice()` API is unchanged — only the presentation moves |

`AppTitleBar.vue`, `AppSettings`, `CommandPalette`, `TabbedNavigation`, `ConfigScreen`, `WorldScreen`,
`ProjectsScreen`, `CiRenderScreen`, `RendersScreen`, `BackupScreen`, `PagesScreen`,
`WorldRepoScreen`, `PreviewScreen`, `DocsPage`, `MainMenu`, `ControlBar`, `MarkerMenu`,
`FirstRunSetup`, `EulaSurface`, `WelcomeSurface`, `TutorialOverlay`, `UpdateBanner`,
`StartupRecoveryBanner`, `AppearanceTarget` — **all unchanged**, re-hosted.

### The catalogue manifest

One declarative list, next to `pages` in `App.vue`, replacing `pages` + `initialGroups`:

```ts
interface CatalogueFeature {
  id: string;            // job id, or 'map' | 'settings' | 'palette' | 'notifications'
  icon: string;          // @mdi/js export
  name: string;          // t('catalogue.make.guide.name', 'The guide')
  meta?: string;         // '5 steps', '1 running', 'Ctrl+Shift+F'
  blurb: string;         // one sentence, the product's own voice
}
interface Catalogue {
  id: 'make' | 'maps' | 'share' | 'copy' | 'setup';
  title: string; icon: string; blurb: string;
  features: CatalogueFeature[];
}
```

Every string goes through `t()` with an English fallback, exactly as `pages` does today, so
Cantonese, bilingual and both funny-level sliders reach the new surfaces with no extra work.

---

## 5b. The BlueMap web server serves this same design

The rewrite is not a desktop-only skin. `packages/server` (embedded) and `@worldlens/cli`
(standalone, plus its Dockerfile) both serve the browser-facing viewer, and
`docs/server-hosted-material-ui.md` already commits to a Material 3 shell around the map canvas
that is *"intentionally framework-neutral so the same built viewer can be served by the CLI's
static handler or embedded by the desktop application."* That promise now has a second half:
**the served shell must be this shell.** A browser visitor and a desktop user should not be able
to tell they are looking at two different products.

### What the server has to serve

Build a custom static bundle rather than shipping upstream BlueMap's own viewer HTML:

| Piece | Desktop | Server |
| --- | --- | --- |
| Map canvas + three.js scene | `packages/viewer` | same package, same build |
| Control bar, map menu, markers | `ControlBar`, `MainMenu`, `MarkerMenu` | same components |
| **Rail (Home · Map · Work)** | `AppRail.vue` | **Map only** — a browser visitor has no Work and no Home; the rail collapses to the map-menu button |
| Title bar, window buttons | `AppTitleBar.vue` | not served (the browser draws its own chrome) |
| Tokens, shape, type, motion | `styles/md3.scss` + `vuetify.ts` | **byte-identical import**, not a second copy |
| Regex builder, appearance editor, command palette, notification centre, panel geometry, super confirmation | all | all — these are the cross-project product requirements and they apply to the served UI too |

### Rules for the served build

1. **One token source.** `md3.scss` and the three schemes in `vuetify.ts` are imported by the
   server bundle, never duplicated. A colour that changes in the desktop app changes in the
   served map in the same commit. `vuetify.test.ts` covers both because there is only one set.
2. **No network at all.** Fonts, icons and images are bundled. The shell today makes no network
   request and requires no remote scripts, fonts, images or analytics — keep that true. Roboto and
   the icon set ship as local `@font-face` assets, not a Google Fonts `<link>`.
3. **Local storage keys stay `bluemap-*`.** Theme, density, message style and pinpoints already
   persist under those keys; the new shell's own state (last map, camera, menu position) joins
   them rather than inventing a second namespace.
4. **The static handler keeps owning security.** Path confinement and ETag handling stay in the
   existing handler. The new shell adds no route and no server-side rendering.
5. **Client-side decompression on before publishing.** A compressed tile path returns 200 and the
   same path without the suffix returns 404 — the served shell must be built with
   `client-decompression` true or a published map serves nothing.
6. **Dark by default there too**, with light and contrast reachable, matching the desktop default
   this rewrite sets.
7. **Compact layout is the browser's normal case.** The desktop app's narrowest supported width is
   800px; a phone visiting a published map is 360–414. The map menu becomes a bottom sheet, the
   control bar wraps its coordinate fields, and every control keeps its 48px target.

### What a browser visitor gets that the desktop user does not

- The anchored M3 context menu on right-click over loaded terrain, with **Add pinpoint here**,
  copy coordinates, and cancel. Pinpoints are local to that browser.
- Nothing else. Every other difference is a subtraction (no Work, no Home, no title bar), never a
  divergent design.

### Where it is built and verified

- Shell components: `packages/viewer/src/materialShell.*` — extend rather than fork.
- Existing test: `packages/viewer/src/materialShell.test.ts` covers shell mounting, theme
  persistence, anchored context-menu behaviour, coordinate storage and pinpoint rendering. Add
  cases for the rail-collapsed layout, the compact breakpoints, and token identity with the
  desktop build.
- Build order: `pnpm --dir design --filter @worldlens/shared build` then
  `pnpm --dir design --filter @worldlens/viewer build`.
- Prove it end to end the way the project already does: publish to the two throwaway proof
  repositories rather than creating new ones, and check that a compressed tile path returns 200
  with valid gzip magic bytes while the same path without `.gz` returns 404.

---

## 5c. The project editor is the default way to make a map

The guide keeps existing — it is the five-question version for a first map — but it is no longer
the primary route. **Home's hero action is "New map", which opens the project editor**; "Or walk
me through it" is the secondary button beside it, and the guide's own footer offers
"Open the full editor instead" at every step. The guide writes a project, and that project is
then edited here like any other.

### What the editor holds

Three columns, one scroll each:

- **Left — the project tree.** Maps (one node per map), Storages, the four configuration files
  (Core, Web app, Web server, Server plugin), and Command line. Each node shows its own setting
  count.
- **Centre — every setting of the selected node**, grouped, each with its dotted path in
  monospace, its type, upstream's own documentation sentence, a control, and a
  **re-renders tiles** badge on every field whose `FieldMeta.invalidatesTiles` is true. A field
  the user changed turns primary and gains **Revert to default**.
- **Right — the consequences.** A notice that the project started from BlueMap's own generated
  defaults, the save plan naming each file that will be written plus the revision it commits, and
  a live `bluemap-cli` command line assembled from the CLI node.

### It starts from BlueMap's own defaults

A new project is not empty. It is BlueMap's generated configuration, so **every setting is
present and editable from the first second**, and a value nobody touches is written exactly as
BlueMap would have written it. This is what makes the editor safe to open before anything has
been rendered.

### Every setting, and where it came from

The inventory is transcribed, not remembered. Do not add, rename or drop a key without changing
the schema first.

| Node | File | Keys | Source of truth |
| --- | --- | --- | --- |
| Core | `core.conf` | 10 | `design/packages/config/src/schema/core.ts` |
| Map (per map) | `maps/<id>.conf` | 31 | `schema/map.ts` (+ `schema/mask.ts` for `render-mask`) |
| Storages | `storages/<id>.conf` | 10 | `schema/storage.ts` |
| Web app | `webapp.conf` | 19 | `schema/webapp.ts` |
| Web server | `webserver.conf` | 8 | `schema/webserver.ts` |
| Server plugin | `plugin.conf` | 12 | `schema/plugin.ts` |
| Command line | `bluemap-cli` | 17 flags | `config/src/cli/flags.ts` |

Render the centre column **from `FieldMeta` directly** — `path`, `label`, `doc`, `control`,
`default`, `group`, `invalidatesTiles`, `advanced`, `hidden` — never from a hand-written list.
A field added to a schema then reaches the editor with no change to the component, which is the
whole reason the schema carries that metadata. `marker-sets` renders from `MARKER_SET_FIELDS`
for the same reason.

The CLI node must model that **the flags are not independent**: `-r`, `-f`, `-u` and `-e` all
take the render branch, inside which `-g` stops meaning "generate the web app" and starts
meaning "force regeneration as part of the render", and `--markers` and `-s` are not reached at
all. Resolve through `ResolvedCliActions` and show the resolved command, not the checkboxes.

### The render mask is drawn in here

Every map node carries a **Render mask** card above its settings, and `render-mask` in the
settings list opens the same surface. The drawer has:

- the five shape tools — rectangle, circle, ellipse, polygon, region-aligned;
- **Render it / Cut it out**, because the mask is an ordered list of additions and subtractions,
  not a single region;
- a size stepper in blocks;
- a canvas showing the **measured region bounds** and the **real overworld spawn**, both
  toggleable — measured from the world, never assumed;
- an ordered shape list with reorder and delete, each row showing its real x/z and size;
- a live "N of 784 regions would render" estimate.

Its semantics must stay identical locally, in the standalone CLI and in GitHub Actions — that
equivalence is already tested and the drawer must not become a fourth interpretation.

---

## 5d. Surfaces found on the second codebase pass

The first pass under-read the tree. These exist in the repository and now exist in the design;
each names the file it came from.

### Settings rows that were missing

| Row | Source |
| --- | --- |
| **Theme** — dark / light / contrast | `components/settings/ThemeRow.vue` |
| **How long a notice stays** — brief / normal / patient / until dismissed | `NotificationDurationRow.vue` + `config/noticeDurationLevels.ts` |
| **Downloads at once** — 1–8 parallel | `DownloadConcurrencyRow.vue` |
| **What this application is called** | `ProductDisplayNameRow.vue` + `stores/productName.ts` |
| **Dependencies** — fetch and verify | `DependencyInstallerPanel.vue` |

The contrast theme must stay non-tonal — it answers the same role names with the
highest-contrast values that keep their meaning, and deriving it from the blue seed would
defeat the one thing it exists for.

### Render surfaces that were missing

**Live speed control** (`world/LiveSpeedControl.vue`) — the speed dial is changeable *while a
render runs*, not only in the guide. **Container offers** (`world/ContainerOffers.vue") — an
already-present image is offered rather than a fresh pull, with its digest named first.
**Interrupted renders** (`world/InterruptedRenders.vue`). **Render throughput**
(`progress/RenderThroughput.vue`, `RenderProgressDetail.vue`) — live tiles-per-minute and a
per-stage breakdown. **Repair panel** (`repair/RepairPanel.vue`) shows its evidence before it
proposes an edit.

### Starting a project

The editor opens on a **chooser** when no project is open, and the project name in its header is
a switcher back to it. The chooser is built from `world/MinecraftWorldList.vue` and
`project/`: worlds found automatically in the default Minecraft folder and every mounted
launcher instance, the projects already on this machine, and four "somewhere else" routes —
browse, a GitHub release, SSH (`SshWorldSourcePanel.vue`), and a container volume
(`DockerWorldSourcePanel.vue`). A folder that is currently unplugged stays in the list and says
so, rather than disappearing.

### Global-memory (cross-project) surfaces

These are shared requirements of every one of these desktop apps, from
`agent-global-memory/docs/features/`. They now have a **Memory Console** job and a
"Shared across these apps" group in Set up & help:

| Surface | Source |
| --- | --- |
| Memory Console | `features/product/memory-console.md` |
| Status Hub | `features/memory-sync/status-hub.md` |
| Control-plane runtime | `features/product/control-plane-runtime.md` |
| Sync attestation | `contracts/agent-memory-sync-attestation.schema.json` |
| Backup contract | `contracts/agent-memory-sync-backup.schema.json` |
| Secret intake | `features/security/secret-intake.md` |
| Lowlevel MCP · Docker host routing | `features/integrations/` |
| Shared localization contract | `memory/projects/material-bluemap.md` |

**The localization trap is a hard rule, not a note.** Roughly 80 keys look like keys this app
would own and actually belong to upstream BlueMap's viewer, and the thirty bundled
`public/lang/*.conf` files already translate them into thirty languages. Adding any of them to
the app's own catalogue replaces a real translation with English for every reader of that
language. Judge every key individually, never by prefix; `copy/catalogueCoverage.test.ts`
enforces it.

---

## 5e. School mode, tone, and the settings that must be editors

### School mode is a cross-project contract, not a toggle

Source: `agent-global-memory/memory/SHARED_INSTRUCTIONS.md`. Implement it exactly.

- **One universal mode and one universal unlock credential**, both living in the *shared local
  application-data record* used by the user's apps — not separately per app. Turning it on here
  turns it on everywhere.
- **The user may rename it.** After a rename every user-facing surface must use *only* that name.
  The shipped name `School mode` must not appear in any label, description, search result,
  notification, accessible name, or other copy.
- **While it is on**, apps force English presentation and make Cantonese, bilingual, funny
  levels, personal vocabulary and *all* dim-sum capabilities **behave as if they are not
  installed**: omit their controls, copy, labels, routes, palette and search results, previews,
  notifications, images, code names and references from every surface, and suppress the dim sum
  surprise. **Do not merely disable or visually conceal a discoverable control** — a greyed-out
  button is a failure of this requirement, which is why the prototype removes the tone block from
  the language panel entirely rather than dimming it.
- Prior choices stay stored and return only when the mode is turned off.
- **Turning it off requires the one shared, locally verified PIN, password or passkey.**
- **It is a user-experience lock, not a security boundary.** Users may reset it by deleting the
  shared record, and the app **must say so** rather than claiming protection. The prototype says
  it in an error-container panel, not a footnote.
- Credential material never enters the vocabulary file, the sync repository, exports, source,
  logs, telemetry, screenshots, or Git history.
- The mode control itself stays discoverable and accessible; its disabled-state explanation uses
  the chosen name and names the unlock route.

### Language and tone

Three modes, and **two independent funny-level sliders, 1–5** (`setupI18n.ts`, `FUNNY_LEVELS`).
Level 1 reads fully professional, level 5 is maximum playfulness, and destructive, financial,
security, accessibility and error copy stays clear and accurate at every level — `FACTS` names
the substrings that must survive, per key and per language, and `appCopy.test.ts` enforces it.

### The spoken narrator

Specified in `design/docs/contracts/localization.md`: optional, **off by default**, narrates app
events in English, Cantonese or Both (**strictly serialized, English then Cantonese**), Hong Kong
Cantonese voice for the Cantonese track, debounce plus a per-category cooldown, **one
non-overlapping utterance at a time from a serialized queue that replaces a superseded line
rather than stacking it**. Tone follows the funny level; **error narration stays plain and is
never suppressed by the rate limits**. It must **yield to or duck under an active screen reader**
and honour reduced-sound or quiet-hours settings.

### Settings rows are editors, not toggles

A row that only flips a boolean is under-built wherever the underlying feature has structure.
Three rows open real editors:

- **Scheduled language and appearance** — an ordered rule list. Per rule: what it sets, weekday
  chips, a from/to window, a timezone, and a gate (nothing / a bounded JSON API / a Home
  Assistant boolean with its entity id). Rules are versioned, reorderable, individually
  enabled, and each renders the plain sentence it means. First match wins; a gate answering
  `off` **falls through** to the next rule. Home Assistant tokens stay in page-session memory.
- **Display and ease of use** — interface size (page zoom, not a root font size), motion
  (full / reduced / follow the system), the contrast theme, focus-ring thickness, smallest touch
  target, and cursor affordance, with a live preview that honours all of them.
- **Where the panels sit** — one row per panel class (settings drawer, tab strip, anchored
  popovers, dialogs, menus), each with its placement, its size, and its own reset, plus a global
  reset. Every class stays viewport-bounded and keyboard movable.

### Personal vocabulary: supplied, never uploaded

Source: `SHARED_INSTRUCTIONS.md` line 305. **It exists only when the user supplies an explicit
private file.** Its canonical source is `PERSONAL_VOCABULARY.json` at the root of the private
`agent-global-memory` repository. Without that file, every app renders its original shipped
wording unchanged and **exposes no vocabulary feature at all** — the surface exists to explain
where the file comes from, not to collect one.

Build it with these rules, all of which the prototype states on the surface itself:

- **There is no upload and no share control**, and there never will be. The panel offers only
  "choose the file" and "read it from the private repository".
- Validate bounded JSON **before display**; a file that does not validate is refused whole
  rather than partly applied.
- Keep at most a **private local cache**. Never copy vocabulary data into a consumer
  repository, public documentation, an issue, a release, a log, an export, a prompt, an
  analytics payload, or the renderer bundle.
- Apply replacements at the **private user-facing text boundary, including accessible names**.
- Preserve **commands, URLs, identifiers, code, file paths and factual external records
  verbatim** — a vocabulary that rewrote a command or an error fact is a defect.
- Never commit vocabulary terms, mappings, templates, schemas, UI copy, implementation or
  documentation to a public repository or public record.
- Absent entirely while School mode is on, per §5e.

### Notification bulk actions

Level filters (All / Errors / Warnings / Info / Unread) with counts, per-row selection, a
tri-state select-all, and six bulk actions: mark read, mark unread, invert, copy, export as JSON,
dismiss. Disabled actions are visibly inert until something is selected.

---

## 6. Vuetify snippets

### Rail item

```vue
<button
  class="wl-rail-item"
  :aria-current="active ? 'page' : undefined"
  @click="$emit('select', id)"
>
  <span class="wl-rail-pill" :class="{ 'wl-rail-pill--active': active }">
    <v-icon :icon="icon" size="22" />
    <v-badge v-if="count" :content="count" color="primary" floating />
  </span>
  <span class="wl-rail-label">{{ label }}</span>
</button>
```

```scss
.wl-rail-item { display: flex; flex-direction: column; align-items: center; gap: 5px;
  width: 100%; padding: 4px 0; background: none; border: 0; cursor: pointer; }
.wl-rail-pill { display: grid; place-items: center; width: 56px; height: 32px;
  border-radius: var(--md-sys-shape-corner-full);
  color: rgb(var(--v-theme-on-surface-variant));
  transition: background var(--md-sys-motion-duration-short2) var(--md-sys-motion-easing-standard); }
.wl-rail-pill--active { background: rgb(var(--v-theme-primary-container));
  color: rgb(var(--v-theme-on-primary-container)); }
.wl-rail-item:hover .wl-rail-pill:not(.wl-rail-pill--active) {
  background: rgba(var(--v-theme-on-surface), var(--md-sys-state-hover-opacity)); }
.wl-rail-label { font: var(--md-sys-typescale-label-medium); }
```

### Catalogue card

```vue
<v-card
  :color="hero ? 'primary-container' : 'surface-container'"
  :variant="hero ? 'flat' : 'outlined'"
  rounded="lg"
  @click="$emit('open', catalogue.id)"
>
  <v-card-item>
    <template #prepend>
      <v-avatar :color="hero ? 'primary' : iconColor" rounded="md" size="40">
        <v-icon :icon="catalogue.icon" />
      </v-avatar>
    </template>
    <v-card-title>{{ catalogue.title }}</v-card-title>
    <template #append>
      <span class="text-label-medium text-medium-emphasis">{{ meta }}</span>
    </template>
  </v-card-item>
  <v-card-text class="wl-prose">{{ catalogue.blurb }}</v-card-text>
  <v-list density="comfortable" bg-color="transparent">
    <v-list-item v-for="f in catalogue.features.slice(0, 4)" :key="f.id"
                 :prepend-icon="mdiChevronRight" :title="f.name" />
  </v-list>
</v-card>
```

`rounded="lg"` resolves to the real 16px because `global.scss` already re-points the utility —
do not hard-code a radius.

### Job strip

```vue
<v-tabs v-model="activeJob" density="comfortable" bg-color="surface" slider-color="primary">
  <v-tab v-for="job in openJobs" :key="job.id" :value="job.id" :prepend-icon="job.icon">
    {{ job.label }}
    <v-btn :icon="mdiClose" variant="plain" size="x-small" density="compact"
           class="ms-2" @click.stop="closeJob(job)" />
  </v-tab>
  <v-btn :icon="mdiPlus" variant="text" @click="$emit('go-home')" />
</v-tabs>
```

`closeJob` runs the existing unsaved-work guard before removing the entry.

---

## 7. Screen-by-screen notes

**Home.** Hero card is `primary-container` and full width — it is the only card with a filled
button, because "make a map" is the one thing a newcomer is here for. The other four are
outlined `surface-container` and identical in weight to each other. Feature previews inside a
card are capped at four with the count in the header, so a card never becomes a list.

**Catalogue page.** No cards. A back link, a header block, and a divided list. The blurb per row
is one sentence and it is the *article's* first sentence, so the copy is already written in
`docs/*.md`.

**Map.** Control bar unchanged in content; restyled to a single `surface-container` pill with
`outline-variant` border, the mode group as a segmented run inside it, and x/z in monospace.
Menu button and map picker sit top-left as one row. Zoom buttons bottom-right. No FABs — the
settings, servers and config round buttons that used to float over the bottom-left corner are
gone, because all three are in the rail footer or a catalogue.

**Work → wizard.** Five numbered steps as a clickable progress row; done steps are
`primary-container`, the current one is `primary`. The Mojang-consent warning on the review step
is `error-container` with the remedy button inside it, not a toast.

**Work → options editor.** Eight `VTabs` with per-tab counts, one search over all of them, and a
**save plan** side panel that names every file `Save` will write plus the revision it will
commit. That panel is new and it is the point: the save is currently the least legible thing in
the app.

**Settings drawer.** Right drawer, 560px, search at the top, sections as rows with a state chip
(`Declined`, `Bundled 21`, `Signed out`). The current nested two-pane layout — a list on the left
and a detail column on the right, each scrolling separately, inside a drawer — becomes one list.

**Notifications.** Anchored bottom-left beside the rail. Level icon, text, monospace timestamp.
Nothing pops.

**Problems.** Docked bottom panel, full content width. Each problem names the path, the error and
what it means, with the action that fixes it on the right.

---

## 8. Acceptance

- [ ] The project editor lists every key in the six schema files plus all 17 CLI flags, rendered from `FieldMeta`, and opens on BlueMap's generated defaults.
- [ ] Every field whose `invalidatesTiles` is true is badged, and Save says how many tiles it throws away.
- [ ] The render mask drawer is reachable from each map node and from `render-mask`, and its output matches the CLI and Actions semantics.
- [ ] School mode matches the shared-instructions contract exactly: shared record, renamable with the shipped name never surfacing, credential to leave, hidden capabilities absent rather than disabled, and the "not a security boundary" statement present.
- [ ] All 85 documented features are named on a catalogue page, and every one of the 12 old pages is reachable in at most three clicks from a cold start.
- [ ] `TabbedNavigation.vue` keeps every capability it has today: docking, groups, pinning, reordering, overflow, four discovery searches, bulk close with preview, context menu, persistence. `script/test-tab-contract.mjs` passes unchanged.
- [ ] Every search bar still carries its anchored regex builder.
- [ ] Every destructive action still goes through the two-key super-confirmation gate with its artwork.
- [ ] No floating action button anywhere in the shell.
- [ ] Nothing appears over content unprompted; `raiseNotice()` lands in the bell only.
- [ ] Close affordances exist only on open job chips.
- [ ] No new colour, shape, type, elevation, state or motion token; `vuetify.test.ts` passes untouched.
- [ ] `t()` fallbacks on every new string; Cantonese, bilingual and both funny sliders reach the new surfaces.
- [ ] Reduced motion still kills every transition added here (the `global.scss` kill switch stays last).
- [ ] Contrast theme renders the rail, catalogue cards and job strip at 21:1.
- [ ] 800×600 narrow: the rail stays, catalogue grid collapses to one column, job strip overflows.
- [ ] The served map (embedded server and `@worldlens/cli`) renders the same Material shell, from the same token source, with no network request.
- [ ] Served shell passes at 360, 390 and 414 CSS pixels as well as desktop.
- [ ] Screenshot harness updated: `shell-*`, `menu-*`, `settings-*`, `config-*` captures re-taken.
