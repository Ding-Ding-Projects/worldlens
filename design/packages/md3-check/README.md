# @worldlens/md3-check

A plain Electron app, living beside Worldlens's other packages, whose entire job is rendering
canonical Material Design 3 reference markup next to this repository's own Worldlens (Vuetify)
components, measuring both directly off the rendered DOM, and capturing the comparison. It is
**not a product** - no title bar, no navigation, no Kid Mode, nothing from the real app's shell.
It is an instrument for looking at components, and its whole value depends on being honest about
what it can and cannot prove. Read [What this can and cannot prove](#what-this-can-and-cannot-prove)
before trusting a single number it prints.

## Package layout

```
design/packages/md3-check/
├── package.json
├── tsconfig.json                    typechecks src/renderer only - see its own comment on src/main
├── vite.config.ts                   renderer build (root: src/renderer, base: "./" for file://)
├── .gitignore                       dist/ and capture-output/, kept package-local
├── README.md                        this file
├── scripts/
│   └── capture.mjs                  the capture-mode CLI driver (Playwright + Electron)
└── src/
    ├── main/
    │   └── index.mjs                Electron main process - plain, un-typed, un-bundled JS
    └── renderer/
        ├── index.html               Vite entry HTML, with the instrument's own CSP
        ├── main.ts                  boots Vuetify + imports fonts/tokens in the real app's order
        ├── App.vue                  toolbar (theme/scale/jump-to-row) + window.__MD3_CHECK__ bridge
        ├── lib/
        │   ├── measure.ts           the measuring engine: DOM → ComponentMeasurement, diffing, WCAG contrast
        │   ├── measure.test.ts      unit tests for the DOM-independent arithmetic
        │   ├── rows.ts              the completeness manifest (implemented vs. planned rows, and why)
        │   ├── rows.test.ts         negative-regression test: manifest ⇄ RowsGallery.vue, both directions
        │   ├── harnessState.ts      shared theme/scale state, the row registry, RegisteredRow contract
        │   └── worldlensVuetify.ts  the ONE seam that deep-imports @worldlens/ui's real vuetify.ts
        ├── components/
        │   ├── HonestyBanner.vue    the on-screen disclosure - see below, or just run the app
        │   ├── CoverageNotice.vue   renders lib/rows.ts's "planned" half in the UI
        │   ├── RowShell.vue         one row's chrome: citations, two panes, measurement table
        │   └── RowsGallery.vue      all 15 implemented rows, with their hand-typed spec citations
        └── styles/
            ├── m3Reference.scss     the hand-transcribed M3 baseline values - every rule cited
            └── harnessChrome.scss   this instrument's own toolbar/layout (reuses real Worldlens tokens)
```

## Running it

From the `design/` workspace root (or with `pnpm --filter @worldlens/md3-check <script>` from
anywhere in the repo):

```sh
pnpm install                                          # once, at the workspace root
pnpm --filter @worldlens/md3-check run build           # builds the renderer (vite build)
pnpm --filter @worldlens/md3-check run start            # opens the app window
```

`start` depends on `build` having already run (`src/main/index.mjs` refuses to launch and names
the exact missing path otherwise, rather than opening a blank window). Electron itself is never
wired to a dev-server URL - it only ever `loadFile()`s the built `dist/renderer/index.html`, the
same "one fewer moving part, one fewer 'which build am I actually looking at' doubt" reasoning
`packages/app`'s own real-user launch uses. `pnpm --filter @worldlens/md3-check run dev` is still
available for fast iteration on the Vue UI in a plain browser tab (nothing in this renderer
touches an Electron-only API), which is a genuinely different, faster loop than rebuilding and
relaunching the Electron window on every change - just remember that the Electron window itself
never reflects it, only a rebuild does.

`typecheck` and `test` behave exactly like every sibling package's:

```sh
pnpm --filter @worldlens/md3-check run typecheck
pnpm --filter @worldlens/md3-check run test
```

## Running capture mode

```sh
pnpm --filter @worldlens/md3-check run capture
```

This builds the renderer, launches the app through Playwright's Electron driver (the same
mechanism `packages/app/test/screenshots.spec.ts` uses for the shipped product's own
screenshots), and for every theme Worldlens really ships (`dark`, `light`, `contrast`, `kid`):

1. Switches the app to that theme through `window.__MD3_CHECK__.setTheme(...)`.
2. Walks every implemented row and writes one side-by-side PNG - both panes, the headline delta
   column, all in one image - to `capture-output/<theme>/<row-id>.png`.
3. Reads every row's full measurement set (both panes, every field, every computed delta)
   through `window.__MD3_CHECK__.measureAll()`.

At the end it writes `capture-output/measurements.json`: one file, `schemaVersion`, one entry per
theme with every row's reference/worldlens/diff numbers, and a `plannedRows` array recording
every NOT-yet-implemented component and exactly why (see [Coverage](#coverage) below) - never a
silent gap. The JSON has sorted keys, stable formatting, and no timestamp field, so running it
twice against the same commit produces byte-identical output.

`capture-output/` and `dist/` are both package-local `.gitignore`d; nothing this script produces
is meant to be committed.

## What this can and cannot prove

**This repository has no independently-sourced copy of the Material Design 3 specification.**
No package anywhere in this workspace's dependency tree (`@material/web`,
`@material/material-color-utilities`, or otherwise) ships one, and nothing here reads a
machine-readable spec artifact of any kind - confirmed by direct inspection of the installed
dependency tree before this app was built (see the scout report this instrument was built from).

- **The LEFT-hand "M3 reference" pane** (`src/renderer/styles/m3Reference.scss`) is hand-
  transcribed, by a human/assistant reviewing this code, from the publicly published **baseline**
  Material Design 3 component specification (m3.material.io) - **not** the 2025 "Expressive"
  update, and not verified against any installed or machine-readable artifact in this
  environment. Every rule in that file carries its own citation comment stating the exact spec
  value it claims. **Treat every number on the reference side as a best-effort transcription, not
  a certified copy.**
- **The RIGHT-hand "Worldlens" pane** is the real, unmodified product: the exact
  `createVuetify()` configuration, `COMPONENT_DEFAULTS` shape overrides, and theme colour schemes
  `@worldlens/ui/src/vuetify.ts` ships, reached through one audited deep import
  (`src/renderer/lib/worldlensVuetify.ts`) rather than re-implemented. A reimplementation would
  prove nothing about the shipped app; this deep import is what makes the right-hand pane
  trustworthy as "the real thing".
- **Both panes render using Worldlens's own real colour role values** (`--v-theme-*`), not two
  independent colour systems. Material 3 does not mandate specific hex values, only which named
  role a component part should use - using one shared set of resolved colours isolates the axes
  this instrument can actually say something useful about (shape, elevation, type scale, spacing,
  correct-role-application) instead of showing two colour systems that could never have matched
  by construction.
- **A number marked with a Δ is a reported difference, never a verdict.** Some divergences this
  instrument surfaces are genuine, deliberate, documented Worldlens choices - its outlined text
  fields are pinned to a 12px corner by `vuetify.ts`'s `COMPONENT_DEFAULTS`, not the 4px baseline
  this reference cites; its list items are pinned to 16px, not the baseline's unrounded 0px. Both
  are named explicitly in their own row's citations. The measurement is real; whether a given
  difference is a bug or an intentional choice is for the reader to judge, using those citations.

### What this instrument is, in the scout report's own terms

The scout work behind this app identified two honest ways to build a "conformance" harness:
compare against something genuinely external and independently verifiable, or build an honestly-
labelled **self-consistency proof** - does the real, rendered Worldlens component actually equal
what this repository's own token files (and this instrument's best-effort spec transcription)
say it should be? Given the no-network constraint and the complete absence of any installed,
verifiable spec artifact anywhere in this workspace, this app is the second kind, and says so on
its own honesty banner every time it runs - never silently upgrading "self-consistent, against a
best-effort transcription" into "certified spec-conformant".

### Coverage

15 components are fully implemented with real measurements: both button styles (Filled,
Outlined, Text), the assist chip, the elevated card, the outlined text field, the switch, the
checkbox, the radio button, the one-line list item, both progress indicator styles, the divider,
a standalone icon, and (flagged, since Material 3 does not define this component at all) the
alert. `src/renderer/lib/rows.ts` is the authoritative, hand-written completeness manifest;
`rows.test.ts` proves it matches `RowsGallery.vue`'s real markup in both directions, so a row
cannot silently appear or disappear without the test noticing.

Seven more (`v-tooltip`, `v-select`, `v-menu`, `v-dialog`, `v-slider`, `v-btn-toggle`,
`v-textarea`) are explicitly listed as **not yet built**, each with its own stated reason (mostly:
they are transient/overlay surfaces this instrument's static-row measurement model does not yet
support, or were cut for time). The in-app coverage notice and every capture JSON's
`plannedRows` array both render this list directly from the same manifest - nowhere claims more
coverage than actually exists.

### Known per-row measurement limitations

A handful of rows have fields that are honestly not meaningful for that shape, and each row's own
citations say so explicitly rather than presenting a number that looks precise and is not:

- **Divider**: Vuetify renders it via `border-color`, not `background-color`, which this
  instrument's generic colour-resolution code does not read - its Background/Contrast columns
  reflect the surrounding pane, not the divider's own line colour.
- **Checkbox / Radio**: Vuetify draws these as SVG icon glyphs, not CSS-shaped boxes, so their
  Corner-radius column is not a meaningful comparison on the Worldlens side.
- **Card / List item**: these measure the component's own outer/container element (for
  shape/elevation/colour accuracy); their Font/Line-height columns reflect whatever cascades to
  that outer element, not a nested text slot's own explicit type style.

None of this is hidden in source comments only - every caveat above also appears in that row's
own citation text, rendered directly in the running app.
