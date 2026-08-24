# Documentation-site architecture

This category documents the Worldlens documentation site as a user-facing application rather than
as a bag of static pages.

| Article | What it covers |
|---|---|
| [Material Design 3 Expressive Pages rewrite](material-design-3-pages.md) | Ground-up shell architecture, M3 tokens and components, responsive navigation, accessibility, persistence, offline delivery and verification. |
| [Action walkthrough animations](action-walkthroughs.md) | The complete twelve-animation inventory, capture provenance, finite playback, reduced-motion stills, lazy loading, file budgets and regeneration. |
| [Pages feature parity](../pages-feature-parity.md) | The hand-written shared-feature inventory and the browser-platform boundaries that keep it honest. |
| [Scheduled settings and external sources](../scheduled-settings-and-external-sources.md) | Versioned language and appearance schedules driven by local time, bounded JSON APIs and Home Assistant boolean entities. |
| [Panel geometry](../panel-geometry.md) | Resize, drag, viewport bounds, persistence, reset and keyboard control for site panels. |

The site has no HTTP API of its own, so a Postman collection is not applicable. External schedule
sources are read-only browser requests documented in their own article; they do not turn this
static site into an API server.

## Committed capture gallery

The Screenshots page is a repository-backed verification gallery, separate from the app-owned
screenshot library. It joins `docs/screenshots/manifest.json` with
`docs/screenshots/evidence-inventory.json`; every resolved PNG is searchable by title,
description, category, state, theme, viewport and source commit. Missing or unavailable workflow
captures remain explicit evidence status rather than placeholder cards.

The page also renders the evidence-ledger summary beside the gallery: inventory target count,
screenshot-target count, resolved count, missing filenames, and whether capture provenance is
pinned to a candidate commit. This keeps “complete for the checked-in files” distinct from
“fresh release-smoke proof”; the former may be true while the latter is honestly still pending.

## Universal contracts

See [Universal contracts](universal-contracts.md) for the site-only appearance, search, lock,
authenticator, Support Tickets, waiting-ladder, privacy, and verification surface added in this
task.
