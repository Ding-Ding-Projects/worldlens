/**
 * Values `build.mjs` bakes into the main-process bundle with esbuild's `define`, rather than
 * anything read from `process.env` at runtime.
 *
 * The shipped binary never runs inside GitHub Actions, so anything the update feed needs to
 * know about *which* repository published it has to be decided once, at bundle time, and
 * frozen into the file esbuild writes. `resolveBuildRepositories` in `build.mjs` decides
 * the current and legacy bridge values; this file only tells TypeScript the identifiers exist, because a bare
 * `declare const` with no import or export makes this file ambient (script-scope, not a
 * module), and that is what leaves the identifier visible everywhere in this package without
 * an import - exactly like `packages/ui/src/bridge.d.ts` does for the preload bridge.
 *
 * `esbuild --define` is a textual substitution: every occurrence of these identifiers in
 * the bundled source is replaced with the JSON literals `resolveBuildRepositories`
 * returned, before the file is written. Nothing here or in `build.mjs` makes them optional -
 * every build passes a value or throws - so a missing `define` entry would fail with an
 * esbuild "could not resolve" error rather than silently leaving this `undefined` at runtime.
 */
declare const __WORLDLENS_REPOSITORY__: string;
/** Previous release repository retained as the bounded bridge feed during the rename. */
declare const __WORLDLENS_LEGACY_REPOSITORY__: string;
/**
 * When this exact artifact was built, as an ISO-8601 instant, or `null` when the build
 * genuinely could not establish it.
 *
 * `null` is a real, expected value and not a defect: a source export with no git history
 * has no provenance to read, and the About surface renders an honest "not recorded" line
 * rather than a time somebody made up. See `resolveBuildTimestamp` in `build.mjs` for why
 * there is deliberately no fallback to the current time.
 */
declare const __WORLDLENS_BUILT_AT__: string | null;
/** The commit this build came from, or null when the build could not establish one. */
declare const __WORLDLENS_SOURCE_COMMIT__: string | null;
