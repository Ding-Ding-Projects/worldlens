# Implementation handoff

## Ownership and boundary

Reference source: `49d009b5ad685022abbb47dcff00b43305589ba8`. This directory owns design specifications, fixtures and reference components only. No production source, backend, package manifest or release configuration was changed. Independent design review is required before production incorporation. Runtime and visual evidence remain pending.

## Integration seams

| Owner area | Existing seam | Required implementation |
| --- | --- | --- |
| Workspace GUI | `design/packages/ui/src/components/project/ProjectsScreen.vue`, `App.vue`, Home/World actions | All Generate and start project entrypoints invoke one generation coordinator; project readback opens the workspace. |
| Generation GUI | `components/mcserver/WorldGeneratorDialog.vue` | Replace fixed catalogues with capability descriptors; preserve full seed precision; consume real operation phases and durable result. |
| Configuration GUI | `components/mcserver/ServerConfigEditor.vue`, `components/config/ConfigField.vue` | Describe/apply all supported files; recursive typed controls, explicit four account/ban record tables, revision conflict handling. |
| Map lifecycle | `App.vue` `openRenderedMap`, `components/MapView.vue`, `world/livePreview.js` | Internal open/focus, real partial-to-retained transition, independent render picker, diagnostic recovery. |
| Shared viewer chrome | `packages/viewer` `materialShell` and maintained BlueMap `common/webapp` | Vue/Vuetify component composition with framework-neutral controller; preserve canvas engine and geometry. Add actual Vuetify setup to maintained viewer. |
| Annotation GUI | `components/markers/MarkerStudio.vue` | Direct drawing, keyboard coordinate alternative, undo/redo draft, revisioned local/hosted save. |
| Command GUI | `components/mcserver/CommandBuilder.vue` and data/model | Complete server-discovered graph, parser registry, map operands, exact target review and authorized execution. |
| Hosting and bots GUI | Existing hosting/server navigation | Pre-render Access; separate export/build/save/login/upload operations; independent Mineflayer and Baritone profiles. |

Paths in the table are relative to the UI source unless a package root is named. Do not implement against the separate historical `redesign/ui` copy.

## Shared contracts to agree before wiring

1. `GenerationOperation`: stable operation/project identifiers, request capability revision, ordered actual phases, cancel-requested state, completed effects, recoverable verified output, durable project readback. GUI closing never kills the process. Retry resumes the failed phase only when its verified prerequisites remain valid.
2. `ConfigDescriptor`: file/revision, nested path, actual value type, choices/bounds/default/help, selected edition/version/flavour, writable reason, live/restart behavior and consumer. `apply` accepts expected revision and typed changes; it returns changed revision or conflict with latest source. Credentials are excluded from ordinary value history.
3. `RenderSelection`: stable project/run IDs, requested and effective map IDs, source binding, engine status, verification status, retained record identity and resource diagnostics. Only verified retained results unlock completed export.
4. `AccessReference`: opaque reference and prepared/provisioned/verified states. Protected service owns verifier, bootstrap and session values. GUI receives safe state and retry reason only. A portable export cannot contain usable administrator material.
5. `AnnotationDocument`: project/map/dimension identity, schema version, revision, author authorization and stable geometry IDs. Writes require expected revision; conflict retains both latest record and local draft. Server enforces read/edit permissions independently of UI.
6. `SpatialOperand`: dimension, coordinate reference, point/path/region, explicit height/range, target world and server identity. Drawing and numeric controls write the same value. Selection never executes an operation.
7. `CommandGraph`: target/server/version/source/completeness, permission-scoped nodes, redirects and parser descriptors. Preview and execute bind graph revision plus current server identity. Unsupported nodes remain listed, unavailable with reasons.
8. `HostingOperation`: independent build/save/sign-in/upload/deploy/check operations and separate receipts. Save returns real archive/hash, upload real immutable digest, deploy actual health/LAN result. No implicit upload transition.
9. `BotProfile`: engine/distribution/version compatibility evidence, protected account reference, owned runtime identity and lifecycle/navigation states. Mineflayer and Baritone never share an inferred compatibility verdict.

These are semantic interfaces, not permission to invent new bridge method names without checking existing backend exports. The backend owner supplies exact transport schemas and error codes; GUI maps them without string-parsing logs.

## Reference use

Import `WorkflowReference.vue` directly from this directory into a dedicated reference host using the existing workspace Vue/Vuetify/i18n setup. Props select screen, state and language. It never starts a server, renders terrain, provisions accounts or uploads. Interactive fixture actions explicitly report a sample result. Configuration and render search use the real existing search composition; broader backend controls remain specified in DESIGN.md and the inventory.

The reference is intentionally finite: one shared scaffold and representative entrypoint, config, render, access, map, hosting and bot states. Production must implement the complete listed transitions, not copy fixture output as proof. The reference requires compilation and visual inspection after dependency setup. Its existence is not a passing build.

## Completion checks for implementers

- Independent review of this handoff and inventory, with defects resolved before adoption.
- Focused integration tests for true generation/project persistence, typed nested configuration and record round-trips, revision conflicts, late server exits, map normalization collisions and exact output provenance.
- Actual visible internal terrain, resource loading and camera recovery. Empty or blank canvas is never accepted as successful map display.
- Two authenticated viewers observe a shared marker change; unauthorized edit and stale revision fail while preserving the draft.
- Discovered commands cover permissions, redirects, plugin nodes and spatial arguments, with actual target/action proof for the agreed examples.
- Access preparation, one-time deployment bootstrap, signed-in default reading and explicit owner public-read setting have separate evidence. No authentication material appears in export/history/logging.
- Both bot profiles execute at separately supported versions; incompatible versions remain unavailable. Native/WSL/container routes, saved-image restoration and reviewed registry upload each have real receipts.
- Exact root build and installer entrypoints, source-bound layout matrix and genuine component audit. Full regex parity remains unfinished until topic-level engine-bound proof exists.

## Outstanding evidence

Reference compilation, reference host route, production route parity, runtime behavior, localization completeness, guidance inventory, screenshots, measured layout and all hosting/bot external acceptance are unverified here. No production-completion claim follows from this design handoff.

## Reference validation record

The inventory parses as JSON, all four deliverables exist under the owned directory, and whitespace inspection found no patch errors. The reference imports match the current ConfigSearchField props and createSettingMatcher `test` API. The selected checkout has no installed Vue compiler package, so SFC compilation has not run. No reference host was created or executed, no screenshots were taken, and no production route or backend operation was exercised. These remain explicit follow-up requirements, not passing checks.

## Review revision: attempt lifecycle and stateful reference

The shared server lifecycle is now specified in DESIGN.md under Shared server attempt, hosting status and console. The semantic `ServerObservation` contains stable server ID, current attempt ID, owned process identity, lifecycle, observation connection state, timestamp, exit identity/result, console transport and cursor. One store drives hosting/status/console. A current-attempt refresh precedes reconnect; a late previous-attempt exit is historical only. An owned local stdin console remains usable when RCON is unavailable, and each submission verifies current attempt identity without replay.

`TaskStateReference.vue`, imported directly by `WorkflowReference.vue`, replaces the generic list for generation, configuration, map and hosting. Its selected state changes the rendered controls, diagnostics and available next actions. Generation includes review/progress/reconnect/late-exit/stdin/persistence-retry; configuration includes typed operator draft/conflict/comparison/save; map includes partial/resource-failure/geometry/offline/conflict; hosting keeps build/save/sign-in/review/upload receipts distinct. Each uses deterministic synthetic values and explicitly labels fixture actions. No real map terrain, server, authentication or upload is simulated as production success. Other screen references retain the earlier scaffold.

The initial compiler-unavailable note above is superseded by the accompanying checker receipt after this revision. Compilation proves SFC parse/script/template generation only; it does not prove TypeScript integration, mounted interactions, layout or production behavior. Independent re-review remains required before incorporation.

## Final review revision: complete state fixtures

Access, Renders and Bots now use TaskStateReference rather than the generic scaffold. Access moves from unprepared through prepared, provisioned and verified with separate truthful badge values. Renders distinguishes empty, partial, engine-finished, verifying, retained and verification-failed, with different internal-open and verification actions. Bots distinguishes profile selection, incompatibility, deployment, connection, navigation, observation loss and stop; canceling navigation preserves the connection.

Reset restores the selected deterministic initial state, the example administrator name and signed-in-viewing default. Bilingual strings use a line break and the component text anatomy preserves that break, rather than joining languages with a slash. Hosting maintains independent build, archive, sign-in, upload and deployment receipt booleans; moving to a subsequent action does not erase earlier receipts. The fixture state selector intentionally loads a deterministic receipt scenario, while action transitions preserve the current scenario's receipts.

Both SFCs passed parse, script and template compilation again with @vue/compiler-sfc 3.5.40 after these revisions. reference-check.json binds the revised files by SHA-256. Mounted interaction, TypeScript project checking and visual parity remain unverified and are not implied by compilation.
