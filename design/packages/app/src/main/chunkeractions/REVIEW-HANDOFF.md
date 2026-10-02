# Partial review-fix preservation, 2026-09-04 (finished 2026-09-04 by a follow-up lane)

The section below this line is the original stop-point checkpoint, preserved verbatim. The
follow-up work that closed the seven type errors, the localized copy gap and the accessibility
pass is recorded first.

## What the follow-up lane finished

- Fixed all seven UI type-check errors named below: `ChunkerSchemaEditor.vue`'s three optional-
  `depth` arithmetic sites now read a non-optional `nestingLevel` computed (`props.depth ?? 0`);
  `ChunkerScreen.vue`'s `inputFormat` is now conditionally spread into the request object rather
  than assigned `undefined`, satisfying `exactOptionalPropertyTypes`. `ChunkerValueEditor.vue` was
  confirmed unused (no import anywhere in the tree) and deleted.
- `npx vue-tsc --noEmit -p packages/ui/tsconfig.json` and `npx tsc --noEmit -p packages/app/tsconfig.json`
  were both run clean-slate (deleting `tsconfig.tsbuildinfo` first, since `tsc` is incremental and a
  stale build-info cache can hide a rebuild). The `ui` package reports **0 errors**. The `app`
  package still reports 6 errors, but every one of them is in `src/main/mcserver/ipc.ts`
  (`TransportFailureCode` union mismatches unrelated to Bedrock/Chunker), that file is byte-identical
  to `origin/main` (confirmed with `git diff origin/main -- ...`, zero lines of diff), and mcserver is
  explicitly out of this lane's scope. This is a pre-existing defect on `main`, not something this
  branch introduced or is meant to fix.
- Localized copy: `ChunkerSchemaEditor.vue` had **zero** `t()` calls before this pass -- every label,
  hint, alert and picker string was a raw English literal. It now routes through `useI18n()`, and 21
  new `FixedString` entries were added to `copy/surfaces/chunker.ts` under `chunker.schema.*`
  (interpolated with `{label}`/`{key}`/`{n}` where the string needs the field name, matching the
  existing `t(key, params, fallback)` pattern used elsewhere in the app, e.g. `backup.account.active`).
  The recovery controls in `ChunkerActionsPanel.vue` ("Find saved conversions from before restart",
  "Recover this saved conversion in this window", the recovery picker's search/select/empty/no-match
  labels, the account/repository pickers' `selected-label`/`empty-message`/`no-match-message` that had
  never been wired despite the surrounding `search-label`/`select-label` already using `t()`, the
  history picker, the `pending` job-status fallback, and the prepare/discovery/operation-failed
  message strings) are now fully localized under `chunker.actions.*`.
- Seven pre-existing, wholly unused `chunker.editor.*` catalogue entries were deleted. They predated
  `ChunkerSchemaEditor.vue`, were never wired to any component (confirmed by `git log -S` and a grep
  across every `.vue`/`.ts` file), and were failing
  `appCopy.test.ts > finds a call site for every key in the catalogue` before this lane touched
  anything -- an orphan, not a regression this lane caused.
- `npx vitest run packages/ui/src/copy` is green except for one pre-existing failure in
  `catalogueCoverage.test.ts` naming `world.screen.generateTestWorld` / `world.screen.generator` in
  `components/world/WorldScreen.vue`. That file and `copy/surfaces/world.ts` are byte-identical to
  `origin/main` (confirmed the same way), and `worldgen`/world-generator UI is explicitly off-limits
  to this lane. Not fixed, and not this lane's to fix.
- Accessibility/layout pass on `ChunkerSchemaEditor.vue` and the recovery controls: the schema
  editor's own scoped style already used `min-width:0;max-width:100%;overflow-wrap:anywhere` (the
  house pattern for avoiding clipping at 320px) and a theme token (`rgb(var(--v-theme-outline))`)
  rather than a hardcoded hex, so no changes were needed there. `node scripts/check-webapp-parity.mjs`
  stays green (it inspects the BlueMap-vendored webapp, not this surface, and reports "the BlueMap Tow
  Fat is not checked out" in this worktree -- expected, not a false pass this lane manufactured). The
  new/renamed labels are exposed as visible button text or `aria-label` (the per-key "Remove override
  {key}" and per-item "Remove item {n}" now carry the dynamic value in both the visible text and, for
  the override row, the `aria-label`), and the `size="small"` `VBtn` usage matches the pre-existing
  house convention used throughout `ChunkerRoutePicker.vue`, `ChunkerScreen.vue` and
  `BackupRunCard.vue` rather than introducing a new one.
- All eleven focused suites the checkpoint named (spread across `bedrock/*.test.ts` and
  `chunkeractions/*.test.ts`) plus `packages/ui/src/components/chunker` and
  `packages/app/src/main/chunkeractions` were re-run together: **19 files, 167 tests passed, 2
  skipped** (the e2e suite, which is designed to skip outside a real conversion environment). Nothing
  reported "no tests found" and nothing exited 0 with empty output.

## Still outstanding (unchanged from the original checkpoint, and not attempted by this lane)

Real packaged UI acceptance is still outstanding for configuration editing/composition, workflow
preparation and dispatch, source transfer, progress, cancellation, restart adoption, collection,
Docker and SSH execution, and registry resolution against a real registry through the built UI. The
output fixtures prove structural checks, not complete LevelDB logical integrity or an end-to-end
converted world. Bedrock output, dimension remapping and container conversions still use a
whole-world JVM and retain their documented memory and duration limits.

---

# Original checkpoint (preserved verbatim below)

Implementation stopped at the owner's explicit preservation request. This is an unfinished checkpoint, not an integration or acceptance claim.

## Changes preserved

- Schema-aware guided/advanced configuration composition, including block/state/type mapping merges, pruning intersection/subtraction and explicit field-collision review.
- Sender-object ownership for container and GitHub Actions operations. Cross-sender reads, cancellation and collection are refused. Container work is cancelled when its owner is destroyed, including source-inspection cancellation. Saved Actions operations require explicit adoption after an application restart.
- Canonical official Eclipse Temurin runtime resolution before world transfer or mounting. Container execution records and uses the resolved immutable digest instead of an arbitrary installed tag.
- Trusted SETTINGS-derived source format checks for original-NBT preservation in the workflow and container routes.
- A generated 103-field pinned world-settings schema, exact nested schemas for mapping/pruning/dimension options, and actual selected-jar SETTINGS metadata validation for world settings.
- A schema-driven editor with supported-field choices, replacing the arbitrary-key editor on the active advanced configuration surface.
- Edition-aware output checks before collection, and a workflow-carried validator for shard and merged output. These validate structure, not complete world semantics or playability.

## Verification already completed

- Six focused files: 42 tests passed. Subjects: configuration composition, sender ownership, approved runtime resolution, output structure, CLI configuration and local IPC.
- Three channel/metadata files: 5 tests passed after repairing background-job disposal to wait for pending persistence.
- The actual workflow planner: 3 tests passed, covering matching/mismatching/unknown NBT source format and actual world-setting metadata.
- Five active Vue components compiled, and the workflow YAML parsed.
- The latest main-process type-check report contained no errors in the conversion modules, but the full application result remained unsuccessful because unrelated workspace declarations were unbuilt. Later cancellation changes have not received another type-check verdict.

These are separate runs against evolving source. They are not one final pinned-suite result and do not replace packaged interaction evidence.

## Known blockers

The UI type checker reported seven conversion-area errors:

- `ChunkerSchemaEditor.vue`: three template uses of optional `depth` in arithmetic.
- `ChunkerScreen.vue`: the local request explicitly supplies `inputFormat: undefined`, conflicting with exact optional property types.
- The now-unused `ChunkerValueEditor.vue`: three optional `depth` template errors. Its source file remains present and has not been deleted.

The likely repairs are a non-optional computed nesting level and omission of the optional input-format property when unavailable. No repair was started after the stop request.

Real packaged UI acceptance is still outstanding for configuration editing/composition, workflow preparation and dispatch, source transfer, progress, cancellation, restart adoption, collection, Docker and SSH execution. The approved-image resolver has mocked command coverage but has not been exercised against a real registry through the built UI. The new schema editor and recovery controls also still need complete localized ancillary copy and accessibility/layout interaction review.

The output fixtures prove structural checks, not complete LevelDB logical integrity or an end-to-end converted world. Bedrock output, dimension remapping and container conversions still use a whole-world JVM and retain their documented memory and duration limits.

## Ownership and processes

All changes belong to `task/chunker-complete-20260904` in its existing isolated checkout. Root documentation and other checkouts were not edited. No Git push, merge, reset, amend or deletion was performed. The parent owns preservation publication and must not integrate this unfinished checkpoint as accepted work.

No child-owned build, test, capture, conversion or external workflow remains running. The last UI type-check command completed with exit status 2. No new tests or runtime operations were started after the preservation request.
