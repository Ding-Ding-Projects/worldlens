/**
 * The one place this package reaches into `@worldlens/ui`'s SOURCE (not its published
 * `main`/`types`, which point at an empty `dist/index.js` - `packages/ui/src/index.ts` is a
 * literal `export {}`, since that package is built as an app, not consumed as a library by
 * anything else in this workspace). Every other file in this instrument imports from HERE,
 * never from `@worldlens/ui/src/...` directly, so this is the single audited seam.
 *
 * ## Why a deep import into another package's `src/` is the right call here, not a hack
 *
 * The whole brief for this instrument is that its "Worldlens" pane renders the REAL, shipped
 * component configuration - the actual `createVuetify()` call, the actual `COMPONENT_DEFAULTS`
 * shape overrides, the actual four theme colour scheme objects - not a hand-copied
 * approximation of them that could quietly drift out of date the next time someone edits
 * `vuetify.ts`. A deep import guarantees there is exactly one copy of that configuration in
 * existence; a reimplementation would prove nothing about the shipped app, which is precisely
 * the failure this whole harness exists to avoid (see the module header this repeats from, and
 * the app's own `HonestyBanner.vue`).
 *
 * This resolves via ordinary Node package resolution, not a bundler alias: `@worldlens/ui` is a
 * `workspace:*` dependency in this package's `package.json`, which makes pnpm create a real
 * `node_modules/@worldlens/ui` symlink here pointing at `packages/ui`. `@worldlens/ui`'s own
 * `package.json` carries no `"exports"` field, so Node's (and Vite's) resolver does not restrict
 * subpath access the way it would if one existed - `@worldlens/ui/src/vuetify.js` resolves
 * exactly the same way `@worldlens/ui/src/vuetify.js`-imported-from-inside-`ui/src/main.ts`
 * does, because after the workspace symlink is followed it IS the same file on disk. Vite (and
 * `vue-tsc`, and every other tool in this chain) already understands the `.js`-specifier-for-
 * `.ts`-source convention this whole workspace uses internally - `ui/src/main.ts` imports
 * `./vuetify.js` the identical way.
 *
 * ## What this deliberately does NOT reach for
 *
 * `@worldlens/ui/src/styles/markers.scss` (the raw-DOM map-marker token overlay - nothing here
 * renders a map or a marker) and `@worldlens/ui/src/styles/prototypeSurface.scss` (an opt-in
 * surface language for one specific "approved prototype" screen, not the default look any row
 * in this gallery renders). `md3.scss` and `global.scss` ARE imported, in `main.ts`, in the same
 * order `ui/src/main.ts` imports them, because without them Worldlens's `rounded="lg"`/`"xl"`/
 * `"md"` shape defaults silently fall back to Vuetify's OWN Material-2-era radius scale instead
 * of the M3 one - see `md3.scss`'s and `global.scss`'s own headers for exactly that failure
 * mode. Skipping them would make the "Worldlens" pane quietly wrong in a way indistinguishable
 * from a real shape bug, which is worse than not building this instrument at all.
 */
export { vuetify, THEME_SCHEMES } from "@worldlens/ui/src/vuetify.js";
