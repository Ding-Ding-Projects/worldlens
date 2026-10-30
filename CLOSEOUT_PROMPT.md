# Worldlens closeout prompt (2026-10-30)

Continue in `Ding-Ding-Projects/worldlens` on `main`. Read `AGENTS.md` and the
2026-10-30 entry at the top of `design/HANDOFF.md` first.

Goal: the shipped UI in `design/packages/ui` must match the approved prototype
`design/Worldlens.dc.html` (render its states by editing the `state = {...}`
defaults), using pure Vuetify Material 3 components and design-system tokens,
removing no feature, and every visible control must perform its action.

1. Start from `9c9988c`, an unverified checkpoint. Run the tabs, menu, config,
   runtimeSettings and settings suites one directory at a time with
   `NODE_OPTIONS=--max-old-space-size=3072` and fix what it broke.
2. Finish the appearance editor, regex builders, options editor and tab overlays
   restyle against the prototype.
3. Finish the runtime-settings wiring listed in the handoff (density, language,
   Focus, time awareness, next action, Momentum, display name, quiet hours) with
   tests that prove the visible effect.
4. Build the accessibility tools menu, then settings sub-pages, info-icon
   guidance, the external editor picker, a shared export chooser and
   collapsible filters.
5. Update `README.md`, the affected `docs/` articles with their Cantonese
   sections, and the site articles under `design/packages/site/src/content/`.
6. Verify with `pnpm lint`, `pnpm --filter @worldlens/ui typecheck`, chunked
   vitest, `pnpm design-tokens:check`, then commit and push to `main` after each
   coherent step, never force-pushing.
