# Partial review-fix preservation, 2026-09-04

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
