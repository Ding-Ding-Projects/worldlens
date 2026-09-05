# Roadmap

## Evidence refresh (2026-09-05)

- [x] Chunker Actions screen exposes all ten `chunk-world.yml` dispatch inputs, guarded by `scripts/check-chunker-ui-inventory.mjs` (`28294f9d`).
- [x] App downloads and assembles multi-group renders (`map-lowres` + `partial-hires-N`) instead of refusing them (`545b74e3`).
- [x] Exercise the multi-group fetch from the built app against a live multi-group run (v1.0.2012, run 33941015721, 17.5 GB, verified: true).
- [x] Cloud Render screen: fetch a finished render from a run this device did not dispatch (`ef213554`).
- [ ] Drive the "fetch a render made elsewhere" card in the built app against a live run.
- [x] Add the chunker copy surface to the copy coverage gate (`c50be6fc`).

- [ ] Refresh the four stale capture-evidence groups (`app-playwright-manifest`, `app-playwright-map-dependent`, `lowlevel-ui-e2e`, `hosted-deployment`) against the current interface digest and record the new `uiSourceDigest` values; `node scripts/check-screenshot-evidence.mjs` has been red on `main` since before 2026-09-05.
- [ ] Finish the 10 GB Java to Bedrock to Java round trip with the byte-scaled timeout and record its semantic comparison.
- [x] Record the 10 GB GitHub Actions render verdict and inspected artifact (run 33941015721 attempt 2, success, six merge groups; HANDOFF.md 2026-09-05).

## Large-world UI verification (2026-09-04)

- [x] Redact temporary renderer access URLs from smoke diagnostics and receipts; verify focused tests.
- [x] Repair portable archive verification without optional PowerShell cmdlets; verify real archive extraction and digest rejection.
- [ ] Complete measured 1 GB and 10 GB world generation through the built UI, including resume receipts.
- [ ] Complete all guided Chunker CLI/config controls and real non-AWS destination dispatch.
- [ ] Verify Java to Bedrock to Java conversion at both sizes and report supported-content parity and losses.
- [x] Verify GitHub Actions rendering first, with task-owned builders-home targets and complete downloads (1 GB run 33929016654 and 10 GB run 33941015721 verified from their artifacts; Pages preview not exercised because both runs used `output=artifact`).
- [ ] Verify the remaining local and SSH rendering and server-creation matrix through the built UI.
- [ ] Preserve, integrate and publish verified increments; archive and clean only eligible task-owned resources.

## World backups, legacy worlds, and a render dashboard (2026-09-04)

Three requests, and the first thing worth recording is what already exists, because
two of them are smaller than they look.

**The backup half is already built.** The CI render path *is* the backup path: it reuses
`main/backup/`, and the world already lands as a permanent GitHub release asset in the
user's own repository, with a `.cheaplfs` pointer and a `backup.json` sidecar. Release
assets do not expire; nothing in the codebase deletes or overwrites them
(`backup/runner.ts:24-29` says so, and there is no `deleteRelease`/`deleteAsset` anywhere).

- [x] Commit the pointers into the Oak Kay. This is the actual gap: `catalog.ts` rebuilds
      the backup list by walking releases over the network every time, and *nothing
      committed in the repository* records which worlds were uploaded. Writing each
      `.cheaplfs` pointer into the repo gives a durable, offline-readable, restorable
      record - and the pointer format is already the canonical
      `desktop-material/cheap-lfs/v1` grammar, so it must be restated exactly rather than
      re-invented as a near-miss dialect.
- [x] An index beside them for humans, following the sidecar's conventions: versioned
      integer first field, ISO-8601 `createdAt`, lowercase-hex `sha256`, byte counts as
      numbers, `kind: "render" | "world"`, bounded max read.
- [x] A dashboard on each render's Day Teet Hui, covering the render and the world
      backups it produced. It carries every universal contract like any other page.

**1.12.2 silently fails today, and the docs promise otherwise.** `docs/compatibility/README.md`
states "the renderer accepts Minecraft 1.12.2 through 26.x" and the marketing copy says the
same. The shipping Java engine does not keep that. Its lowest decoder is `Chunk_1_13` with a
floor of **0** (`MCAChunkLoader.java:51-56`), so a DataVersion-1343 chunk is handed to the
1.13-assuming decoder, which reads pre-flattening `Blocks`/`Data` byte arrays as though they
were block-state palettes. It does not refuse - it misparses, which is what black chunks are.

Nothing catches it earlier either: `render-actions/src/world/validate.ts` checks only that
`level.dat` and `.mca` files exist, and `levelDat.ts` reads `dataVersion` correctly and then
both of its callers throw it away.

A whole-branch merge is not the route, and this is the measurement rather than an opinion:
`v0.10.3-mc1.12` was last committed 2020-08-21, the 5.23 line has 1,361 commits since, and the
two share **zero Java file paths** - 170 files against 427, reorganised wholesale.

- [x] Port `Chunk_1_12` into the fork's Java. This is tractable because 5.23 already has a
      versioned chunk architecture (`Chunk_1_13/1_15/1_16/1_18` behind `ChunkVersionLoader`),
      so a 1.12 decoder is the intended extension point rather than a rewrite. Two references
      exist: upstream's own `ChunkAnvil112.java` and `mapping/BlockIdMapper.java` at
      `v0.10.3-mc1.12` for the bit-level decoding, and *this project's own TypeScript port* of
      exactly that into the modern architecture (`engine/src/world/mca/chunk/Chunk_1_12.ts`,
      credited in `NOTICE`). `LegacyBiomes.java` is already present in 5.23.
- [x] Raise the `Chunk_1_13` floor from 0 to 1344 so anything older dispatches to the new
      decoder - the same one-line change the TypeScript loader already documents as a
      deliberate deviation from upstream.
- [x] Detect a legacy world and say so before somebody waits for a render, the way
      `BedrockConversionNote.vue` already does for Bedrock worlds. There is no Java equivalent.

## Queued, not started (2026-09-04)

- [ ] Universal feature parity on the two non-app surfaces. Every contract the Yern Geen
      carries has to be carried by the Day Teet Hui and by the Material Design 3 BlueMap
      webapp independently: the three language modes, both funny-level sliders, the emoji
      switch, School mode, narration, tabbed navigation with its four tab searches, a
      search bar and anchored regex builder on every field and every menu, per-element
      appearance editing with the infinite colour picker, the command palette on
      Ctrl+Shift+F, toy locks and the unlock ladder, non-blocking notifications, exports,
      bulk actions, local history, and the dim sum surprise.
      Neither surface is exempt for being "only docs" or "only the map viewer", and where
      a contract genuinely cannot apply, the rule and the reason get written down rather
      than left as a silent gap. Guarded by a hand-written per-surface inventory, because
      a rule-shaped check passes cleanly on a surface that has none of them.

- [x] A dashboard on each render's Day Teet Hui, covering that render and the world backups
      it produced.
- [x] Chunker as a Tow Fat, with its code ported into the app so no See Fut has to be
      installed by hand.
- [ ] Full Chunker GUI controls in the app.
- [x] Batched rendering, recombined afterwards, to work
      around the memory leak that makes a single large render fail. The batch aims at
      100 MB rather than the 500 MB originally asked for: that number came from where
      conversions were actually observed to fail, and raising it to a rounder one would
      move the batch toward the failure it exists to avoid. Region counts per batch are
      derived from the world's measured size, bounded at 64 so a huge world does not
      become thousands of batches that spend their time starting JVMs.
- [x] Universal feature parity. Correcting what an earlier version of this entry said:
      the Day Teet Hui is not thinly covered. It carries a hand-written fail-closed
      inventory of 52 contracts in `globalFeatureCoverage.ts`, plus a second universal
      inventory of 13 in `siteUniversalInventory.ts`, including toy locks, the built-in
      authenticator, the unlock ladder at the same budget the rules specify, the
      appearance editor and School mode. The earlier claim came from a grep whose
      patterns did not match the site's own naming, and it was wrong.
      What is genuinely open, measured rather than assumed:
      - [x] School mode was implemented and had no inventory row. Added; the guard was
            watched failing on a bad path and passing on the real one.
      - [x] ADHD modes: five, independently toggleable, every one off by default.
      - [x] The site could not say which version of itself you were reading. It states
            its version, that build's updated-at time to the second with the zone named,
            and its commit - or an honest 'not recorded' where the build carried none.
            Nothing falls back to the current time.
      - [x] App-logo customization, validated by the file's bytes rather than its name,
            with SVG deliberately refused and the reason stated.
      - [x] File conversion: what a page can genuinely do, plus every category it cannot,
            listed by name with its reason rather than hidden.
      - [x] A local model runtime read over loopback only, with the four things a page
            cannot do stated where somebody would go looking for them.
      - [x] The Lang gui BlueMap webapp had no inventory of its own. It has one now:
            eight hand-written contracts in `scripts/check-webapp-parity.mjs`, run as
            `pnpm webapp:parity`. Correcting the sentence that used to be here as well:
            I called it the surface furthest from parity before measuring it, and its
            Material Design 3 layer turned out thorough - the state-layer opacities are
            the spec values exactly, a 48px touch target is used in eleven files, and
            there is a full seven-step shape scale. What was missing was not the work
            but anything watching it, which is a different problem with a different fix.
            That is now the third measurement I got wrong in this session by grepping
            for a literal that did not match the code's own naming.

## Local servers, and a Material Design 3 map (2026-09-03)

Four screenshots of the new-server wizard turned into three P0 defects and a whole UI rewrite.

- [x] Server creation accepts the request shape the renderer actually sends. It compared a
      `TransportRef` *object* against string literals, so every local runtime was refused.
- [x] Local-process servers can start: `localRuntime` is supplied by the module that owns the
      registry, and the java path is persisted on the record instead of being computed at
      creation and thrown away.
- [x] Creation sees the JRE inside its own installer (`resourcesPath`), and the guard that
      exists to catch that now also finds a resolver missing from its inventory entirely and
      follows an options variable to where it is built.
- [x] The wizard stops persisting a stale identity (a vanilla server saved as `paper-26-2`) and
      clears a failed create when the inputs change.
- [x] The published map's homepage points at `/map/`, and the render config asks the webapp to
      decompress tiles itself since every consumer of that render is a file host.
- [x] `Ding-Ding-Projects/BlueMap` forked, and its whole webapp UI layer rewritten to Material
      Design 3 on branch `lang-gui` at upstream `v5.23`.
- [x] The build reads the fork: `tools/build-jars.mjs`, `build-jars.yml`, `render-world.yml`,
      `render-private-world.yml`, with the path and repository as shared constants the
      packager's validator consumes.
- [ ] Fix the provisioning test that hangs. `CreateServerWizard.test.ts` > "shows real
      provisioning progress, failure, retry, and post-install re-resolution" times out at 30s
      awaiting `Promise.all([provisioning, duplicateProvisioning])`, so a deduplicated second
      `provisionJava()` appears never to settle. It hangs with `main`'s own component as well
      as this branch's, so it is not caused by the wizard changes here - it was simply masked
      until now by the `captured is not defined` crash that killed the test earlier.
- [ ] `apostropheConvention.test.ts` fails in any checkout whose path contains a space: it
      builds a directory path from `import.meta.url` without decoding, so it scans
      `gerk%20tong%20hui`. Not a product defect, but it makes a linked Gerk Tong Hui under the
      default path unable to run the suite clean.
- [ ] Photograph the Material Design 3 interface in a real published map. The local jar build
      is the furthest this went; nothing has been captured from a deployed `/map/`.
- [ ] Decide whether `vendor/BlueMap` stays. Two full BlueMap checkouts is real disk and real
      CI clone time now that only the fork is built from.
- [ ] Repair or retire `mcserverWiring.test.ts`. It looks for literal
      `ipcRenderer.invoke("mcserver:…")` strings that the `@worldlens/bridge` refactor removed,
      so it fails permanently while guarding nothing. Red on `main` already.
- [ ] Reconcile `scripts/lint-workflows.mjs`. It reports 12 release-boundary problems on `main`
      already - drifted action-count inventories and step fingerprints. A permanently red guard
      teaches people to ignore red.
- [ ] Bring the CLI-jar download paths onto the fork, or say plainly that they are upstream.
      `installCliJar.ts` and `engineProvisioning.ts` still fetch upstream release jars, which
      carry the stock webapp rather than this one.

## Container provenance (2026-09-03)
## Documentation and integrated feature contract refresh (2026-09-02)

- [x] Correct the catalogue prose to the verified 88-row inventory split `29/6/7/7/2/37`,
      and keep the README and Kid Mode descriptions aligned with the source registry.
- [x] Add the converter, local model tooling, runtime settings, SSH host profiles, complete
      version catalogue, creative studio and built-app smoke records to the documentation indexes.
- [x] Register the corresponding public documentation articles, each with the five required
      sections, source links and suggested next articles. Every article records source and focused
      proof as separate from packaged evidence.
- [x] Correct the stale Minecraft server adoption article so source wiring is described as present,
      while packaged interaction and isolated-host proof remain explicitly pending.
- [ ] Merge the source-complete feature branches into `main` and produce one integrated Windows package.
- [ ] Run the full packaged smoke matrix and refresh only captures proven against that package and
      commit. The current screenshot evidence check remains red until that work is complete.
- [ ] Publish a new release only after package provenance, installer contents and remote checks are
      verified. The current documentation candidate is not a release.

Source-complete does not mean fully verified. The first four rows above describe records and source
contracts that can be reviewed now. The final three rows are the separate packaged and full-surface
proof required before this candidate can be called released.

## Project canvas documentation (2026-08-25)

The node-graph canvas (`design/packages/ui/src/components/canvas/`) already shipped as an
alternative presentation of map-project creation, driving the identical `createMapWizard()`
model the linear wizard uses. This entry covers writing it up, not building it.

- [x] Documentation site article `project-canvas` added and registered in
      `design/packages/site/src/content/articles/index.ts`, verified against
      `design/packages/site/scripts/assert-article-bundle.mjs`.
- [x] `docs/project-canvas.md` written and linked from `docs/README.md`'s application table.
- [x] Six node kinds, the shared-model wiring rules, mark-not-hide search, and keyboard node
      movement documented against the real source and its existing tests
      (`canvasModel.test.ts`, `CanvasNode.shape.test.ts`), not invented.
- [x] The canvas has been driven in the packaged application on a hidden desktop and captured:
      the tab renders its nodes with no "no content for this page" placeholder, and
      `project-canvas.png` / `project-canvas-search.png` were produced by the real matrix.
      Two defects were found only by doing this, and both are fixed: a parent `data-test`
      falling through and replacing the component's own (`18d95ef6`), and the job being
      registered with no page slot in `App.vue` at all (`472ea8e5`).
- [ ] Those captures are **not published**. `docs/screenshots/` still holds the previous set
      and no digest has been refreshed, because the harness's required-surfaces list still
      demands nine screens that `8f417d73` retired, so no run can honestly be called complete.
      Correcting that list is the blocking work. See issue #171.
- [ ] Wire dragging between ports is not implemented. Every wire the canvas draws is derived
      from `ALLOWED_EDGES` against the current node positions; there is no gesture that
      creates or removes one by hand. This is a real gap in the feature, not only in its
      documentation, and is left open for a future implementation task.
## BlueMap CI installer manifest seam (2026-08-24)

- [x] Emit one versioned manifest from the reusable BlueMap build with source provenance,
      exact filename, byte count, and SHA-256, then upload it with the jar index.
- [x] Stage the downloaded CLI through `scripts/stage-packaged-jars.mjs`, sharing the same
      staging directory and strict JAR verifier used by local packaging.
- [x] Refuse missing, stale, tampered, path-traversal, wrong-version, wrong-digest, and
      physically absent CLI artifacts before electron-builder starts.
- [x] Preserve safe build and package evidence with `always()` uploads that cannot mask the
      original build or package result.
- [x] Add workflow-shaped cold-fixture negatives and focused package wiring coverage.
- [x] Validate version, source commit, workflow run ID, and run attempt before touching the
      artifact, then perform bounded streaming digest verification after JAR safety checks.
- [x] Keep mutation coverage red when the canonical identity preflight or digest comparison
      is removed.

## Reusable design system package — 2026-08-22

- [x] Publish the shared WorldLens colour roles, Material Design 3 tokens, Vuetify themes,
      component defaults and factory as `@worldlens/design-system` version 0.1.0.
- [x] Keep product-specific presentation modes and behavior in `@worldlens/ui`, while the
      actual WorldLens bootstrap and CSS entrypoint consume the reusable package.
- [ ] Install the reconciled workspace manifests and build the package and its consumers.
      Deliberately deferred to the integration lane; this ultra-speed source lane ran no tests,
      type checks, builds, or captures.

## Documentation refresh — 2026-08-22

- [x] The documentation index now includes all five previously unindexed root feature records;
      nested audit and compatibility records remain intentionally grouped with their own indexes.
- [x] The Pages hero and README agree on the current **54** bundled production articles, as proved
      by `design/packages/site/scripts/assert-article-bundle.mjs`.
- [x] README links the current committed [Worldlens tour recording](docs/recordings/worldlens-tour.mp4)
      at `f02370eb`; the recording is already an ancestor of `origin/main` and remains current.

## Minecraft server hosting manager (2026-08-21)

Create, run and fully administer any Minecraft server - vanilla, Paper, Purpur, Spigot,
Fabric, Forge, NeoForge and proxies - on three hosting targets, with every setting exposed
as a real typed control. The binding constraint, set by the owner: nothing in this feature
is ever configured by typing a command or editing a file by hand.

### Phase 1 - the transport seam

- [x] One `ServerTransport` interface over three targets: a local process, a container on
      the local Docker daemon, and a container on a daemon reached over SSH. The SSH case is
      not a second implementation - `remote/ssh.ts` already returns a `sshCommandRunner` that
      *is* a `CommandRunner`, so it is the Docker transport handed a different runner.
- [x] `transport/scope.ts` as the single path chokepoint every file call passes through.
      Refuses rather than clamps, compares segment by segment so `/srv/minecraft-other`
      cannot enter `/srv/minecraft`, and stays deliberately lexical - resolving symlinks
      first would follow the very link it exists to catch.
- [x] Files move via `docker cp` and a staging file, never through the command runner:
      `CommandOutput.stdout` is a string, and a jar piped through one loses every invalid
      UTF-8 byte to U+FFFD, silently and one way.
- [x] Console reads the log and writes over RCON. No `--follow`, and never `docker attach` -
      an attached TTY forwards a stray Ctrl-C into a live JVM full of players.
- [x] `unreachable` kept strictly distinct from `not-running`, with five tests on that one
      distinction. A dropped SSH connection must never render as "stopped" and offer a
      restart button for a healthy server.
- [x] Server registry storing what a server *is* and never a cached running state. RCON
      passwords go to the OS credential vault; the record keeps only that one exists.
- [x] IPC and preload bridge, with a wiring guard that reads the real shell and the real
      bridge, anchored to whole lines so a commented-out call cannot satisfy it. Verified by
      commenting the registration out and watching exactly that test go red.
- [x] 115 tests, no Docker, SSH or Java required by any of them.

### Phases 2-9 - mostly built, one wiring gap and one whole phase unreachable

- [x] Flavour and version catalogue (`flavours/catalogue.ts`, `javaRequirement.ts`), Java
      provisioning, and the "New server" wizard with a real picker at every step.
- [ ] Complete Mojang Java release and snapshot catalogue with cached source revision, family
      grouping, per-version Wiki states, and bounded wizard rendering. Focused source and UI
      tests are green on this lane; packaged-artifact capture and full workspace gates remain
      open.
- [x] RCON client and protocol, the console session, and players/ops/whitelist/bans as real
      tables with row actions and an add-player dialog.
- [x] The configuration editor: Minecraft's config keys described and rendered through a
      twelve-kind control renderer over a document model that preserves comments, key order
      and unknown keys. Guarded by `noTextBox.test.ts` and a byte-for-byte round-trip
      property test (`roundTrip.test.ts`).
- [x] Plugins from Modrinth and Hangar with install/manage/compatibility, and SpigotMC
      browse-and-link only, exactly as scoped - it has no sanctioned download API.
- [x] Adoption's read-only discovery, scoring and four-switch consent review dialog are
      built and tested (`adopt/`, `AdoptionReviewDialog.vue`).
- [ ] **Adoption is not reachable from the interface.** `ServerListScreen.vue`'s "Adopt an
      existing server" button emits an `adopt` event that nothing listens for at any of its
      three mount sites in `App.vue`, `AdoptionReviewDialog.vue` is not mounted anywhere
      outside its own tests, and there is no screen that browses candidate containers to
      adopt in the first place. This is the one genuinely broken surface in the whole
      feature, not merely an unverified one.
- [x] A locally hosted, password-protected web management console (`webconsole/`), reachable
      from the same panel that hosts the desktop console, with scrypt password hashing,
      hashed sessions, lockout and the unlock ladder.
- [x] The Vue screens and a real "Minecraft servers" destination in the left rail
      (`mcservers` job), wired end to end and guarded by `mcserverShellWiring.test.ts`.
- [ ] Real captures from the built artifact. Not done: nothing here has run in a packaged
      build, and no screenshot exists of any of these screens.
- [ ] A fourth hosting target, added after this roadmap section was first written: an EC2
      instance the app provisions on AWS (`aws/plan.ts`, `provision.ts`, `teardown.ts`,
      `accounts.ts`, `credits.ts`). The planning, provisioning, rollback and teardown backend
      is built and tested against a fake `aws` CLI - **no wizard step or screen reaches it**,
      so it is exercised only by its own tests, never by a person.

### Evidence boundary

The transport, registry, config editor, console, players, plugins and web console are
implemented, tested and pushed. All of it is exercised against fakes and in-memory
transports: nothing in this feature has been exercised against a real Docker daemon, a real
SSH host, a real `java -jar` process or a real AWS account, and no capture exists from a
packaged build. The tests prove the modules; they do not prove the feature runs. Two things
are not merely unproven but genuinely unreachable today: the adoption button opens no dialog,
and the AWS hosting target has no interface at all.

### Records reconciliation (2026-08-22)

Against `origin/main` at `a90f588f`, Issues #150–#162 remain open: adoption wiring, config IPC and
remaining schemas, AWS wizard controls, world-generator reconciliation/vanilla generation,
mod-loader profiles, world-drop actions, search coverage, two-corner command picking, stale
captures, and the pre-existing red gates all lack a verified closure record. The landed version
picker and Paper/Velocity v3 catalogue are the only items in this block promoted from the older
handoff's open list; no unchecked roadmap item was silently removed.

### 廣東話

一個介面打通三個地方：本機、Docker container、SSH 上面嘅 container。SSH 嗰個唔使另外寫
過 - 換個 runner 就得。

`scope.ts` 係唯一一個檢查路徑嘅地方，出界即刻拒絕，唔會偷偷幫你改去第二度。特登唔行
symlink，因為 realpath 會跟埋條 link 走，跟完就見唔到原本要捉嗰條。

檔案唔行 command runner - stdout 係 string，個 jar 一過就變晒亂碼，仲要靜雞雞噉壞。
Console 淨係讀 log，寫就行 RCON，死都唔用 docker attach - 撳錯個掣連埋成班人一齊拉閘。

「連唔到」同「停咗」係兩件事，分開咗五個測試去守。斷咗條線就當人哋死咗，然後彈個掣叫你
重開一部行緊嘅 server，呢個先係最衰。

Wiring test 特登 comment 咗成行去睇佢紅先信 - 綠色但從未紅過嘅測試等於冇。

## Toy locks reach the shell, and a locked element is actually disabled (2026-08-21)

- [x] Register the lock host in the Electron shell: `locks:load`/`locks:save` over a
      bounded, atomically written `toy-locks.v1.json` under `userData`, and a `safeStorage`
      vault for TOTP secrets that refuses outright rather than writing a secret in the clear.
- [x] Expose `worldlens.locks` from the preload, including the folder the recovery route
      names, so `resolveLockHost`'s probe finds a complete namespace.
- [x] Call `provideLockStore` in `App.vue`. This was the whole defect: the store was built
      correctly, the wizard and prompt worked, and nothing was ever connected - so every
      `useLockStore()` fell through to the hostless default, `canList` was false, and every
      element's context menu correctly hid "Lock this element..." because the build honestly
      could not keep a lock.
- [x] Make a closed lock actually disable its element - `inert` on the guarded content, with
      the unlock badge deliberately outside that subtree and `aria-disabled` on the wrapper.
- [x] Add `changeAuth`, so a credential can be replaced in one step from the element's own
      menu and from the lock list, without the element being briefly unguarded in between.
- [x] Guard the seam itself: an anchored source check that `provideLockStore` is called and
      that the preload exposes every member the probe requires. Verified red by commenting
      the call out, and green again on restore.
- [ ] Capture the locked state, the change wizard and the lock list from the real built
      artifact and post them on the issue. Not yet done: the captures must come from a
      packaged build, not the source tree.

## Issue #89 — typed banner patterns

- **Status:** Typed ordered layers and focused 5/5 acceptance remain recorded;
  Issue #89 is open pending real-world and packaged proof.
- **Malformed-layer boundary:** The lenient list adapter skips only the malformed
  element after recording one parser diagnostic; later valid layers retain order,
  reader-state failures propagate, and diagnostic history is bounded at 32.
- **Evidence boundary:** This records-only update ran no new tests, builds,
  packaged interactions, or captures. Real NBT worlds, oracle comparison,
  packaged same-world render, restart/reopen, and diagnostic read-back remain open.
- **Renderer seam found by the acceptance audit:** `bannerRenderLayers` derives the
  pattern-specific resource path, but `BlockStateModelRenderer.renderBanner` currently
  requests the shared `minecraft:block/white_banner` material for every layer; the
  deterministic `bannerLayerImage` helper is not wired into `TextureGallery`. The fixture
  manifest's base path and oracle README's banner count were corrected in the audit lane.
  No renderer repair or runtime claim is made without the missing packaged proof.

### 廣東話同步

Issue #89 嘅 typed ordered layers 同 focused 5/5 acceptance 仍然有 records，
但 real-world 同 packaged proof 未齊，issue 仲係 open。Lenient adapter 只會跳過
壞嗰一層，留一條 parser diagnostic，後面 valid layer 保持次序；reader state
error 繼續 propagate，diagnostics 最多 32 條。今次 records-only update 冇加跑
tests、build、packaged interaction 或 captures；真 NBT、oracle、packaged
same-world render、restart/reopen 同 diagnostic read-back 仲未有。

**Acceptance audit 搵到嘅 renderer seam：** `bannerRenderLayers` 會計出
pattern-specific resource path，但 `BlockStateModelRenderer.renderBanner` 依家每層都攞
共用 `minecraft:block/white_banner` material；deterministic `bannerLayerImage` helper
未接入 `TextureGallery`。Audit lane 已修正 fixture manifest base path 同 oracle README
banner count；冇喺缺少 packaged proof 時聲稱 renderer repair 或 runtime 結果。

## Issue #80 — privacy-safe in-app issue reporting (source boundary, 2026-08-20)

- **Status:** Issue #80 remains open and unverified. Source commits `45de1686` and `85758d94`
  are ancestors of default commit `36c1d4d7` and are included in released `v1.0.1411`.
- **Source record:** The main-process draft builder is
  `design/packages/app/src/main/repair/report.ts`; the draft panel and local Markdown/JSON export
  are under `redesign/ui/src/components/repair/`.
- **Packaging boundary:** The visible `Report a problem` wiring is in `redesign/ui`, while the
  packaged UI is `design/packages/ui`; the packaged tree has no `IssueReportPanel.vue` or report
  action. Source presence and a released commit therefore do not prove packaged acceptance.
- **Evidence boundary:** No Help/About or complete failure-surface discovery audit, production
  submission flow, disposable-target submission proof, packaged interaction, focused test result,
  or capture is recorded. Release `v1.0.1411` targets `36c1d4d7` and cites CI run `32324227069`,
  which is build/release evidence only.

### 廣東話同步

- **Status:** Issue #80 仲係 open，未驗證。`45de1686` 同 `85758d94` 已經係 default
  commit `36c1d4d7` 嘅 ancestor，亦包括喺已發布嘅 `v1.0.1411` 入面。
- **Source record:** main-process draft builder 係
  `design/packages/app/src/main/repair/report.ts`；draft panel 同本地 Markdown/JSON export
  喺 `redesign/ui/src/components/repair/`。
- **Packaging boundary:** 可見嘅 `Report a problem` wiring 只喺 `redesign/ui`；packaged UI 係
  `design/packages/ui`，入面冇 `IssueReportPanel.vue` 或 report action。所以 source 存在同
  release commit 都唔等於 packaged acceptance。
- **Evidence boundary:** Help/About、完整 failure-surface discovery audit、production
  submission flow、disposable-target proof、packaged interaction、focused test result 同
  capture 都未有記錄。`v1.0.1411` target `36c1d4d7`，release body 引用 CI run `32324227069`；
  呢啲只係 build/release evidence，唔係 Issue #80 acceptance。

## CI artifact-only workflow update (2026-08-19)

- **Workflow shape:** `.github/workflows/ci.yml` now retains exactly five jobs: `check` (a separate
  workspace build that uploads no release artifact), `jars` (seven BlueMap jars), `package` (Windows
  installer), `test-world` (generated world and rendered-map artifacts), and `release` (publication).
  `release` depends exactly on `[package, jars, test-world]`; `check` is not a release gate.
- **Removed from this workflow:** the `workflows` lint/static-analysis job, the
  `config-java-roundtrip` test job, the `screenshots` capture job, the `lowlevel-ui-e2e` Windows UI
  job, and the screenshot-evidence step inside `check`.
- **Accepted risk:** this workflow runs no tests, lint, typecheck, static analysis, accessibility,
  or screenshot/capture checks. Those checks remain outside the release graph; a release may ship
  from code whose tests would fail.
- **Evidence boundary:** this records-only pass ran no local validation, build, installer,
  dispatch, packaged-runtime, or capture work. A new remote workflow run and its published release
  remain pending exact read-back of the target commit, assets, timing, line count, unsigned state,
  and public dim-sum code-name link.

### 廣東話 / Cantonese

- **Workflow shape:** `.github/workflows/ci.yml` 而家淨係保留五個 jobs：`check`（獨立 workspace
  build，唔會 upload release artifact）、`jars`（七個 BlueMap jars）、`package`（Windows
  installer）、`test-world`（generated world 同 rendered-map artifacts），同 `release`
  （publication）。`release` 準確依賴 `[package, jars, test-world]`；`check` 唔係 release gate。
- **移走嘅嘢：** `workflows` lint/static-analysis job、`config-java-roundtrip` test job、
  `screenshots` capture job、`lowlevel-ui-e2e` Windows UI job，同 `check` 入面 screenshot-evidence
  step。
- **接受咗嘅風險：** 呢個 workflow 唔跑 tests、lint、typecheck、static analysis、accessibility
  或 screenshot/capture checks。呢啲 checks 留喺 release graph 之外，所以 release 有機會由
  tests 會 fail 嘅 code 發出。
- **Evidence boundary:** 今次 records-only pass 冇做 local validation、build、installer、
  dispatch、packaged-runtime 或 capture。新 remote workflow run 同 published release 仲要逐樣
  read back：target commit、assets、timing、line count、unsigned state 同 public dim-sum
  code-name link。

## Issue #59 — safe product migration source and evidence boundary (2026-08-19)

- **Status:** Source implementation is present; Issue #59 remains open and unverified.
- **Implemented source:** profile-migration JSON writes now use the shared bounded retrying atomic
  replacement helper and clean up their unique temporary file. UI and documentation-site storage
  migration now recognizes the exact legacy `material-bluemap` namespace key plus its hyphen and
  dot forms, without treating longer names as legacy. See
  [`docs/worldlens-migration.md`](docs/worldlens-migration.md).
- **Evidence boundary:** This records update ran no tests, typechecks, builds, installer sessions,
  packaged runtime sessions, or captures. Source presence is not migration acceptance.
- **Still open:** prove old installed identity → bridging release → Worldlens → subsequent Worldlens
  update with retained user state; exercise interrupted migration, collision, downgrade/rollback,
  and uninstall/reinstall on real installed builds; and verify final repository, Pages, wiki,
  documentation, release, installer, redirect, base-path, and public URL continuity from their
  actual public addresses. A redirect alone is not proof.

## Issue #58 — complete render-console history

- **Status:** Source implementation is present; Issue #58 remains open and unverified.
- **Implemented source:** separate retained and visible arrays; injectively encoded per-render
  version-2 segment keys; immutable revisioned 512-line generations; revisioned index;
  temporary-key/read-back/final-key writes; index commit before old-generation cleanup;
  restore-by-render-id; per-line `appendConsoleHistoryLine()` calls; legacy version-1 migration;
  plain-text-first retained-history search with adjacent regex builder; selected/filtered
  TXT/Markdown/JSON/JSONL/CSV/TSV/HTML export; credential-shaped redaction; explicit
  storage/retention warnings; selected-line deletion and current-render prune-all behind
  destructive confirmation.
- **Bounded retention:** 24 renders, 200,000 lines per render and 8 MiB encoded storage. Eviction
  is marked incomplete and warned about; these fixed limits are not user-configurable retention.
- **Metadata surface:** completion, last-saved time, exact evicted-line/render counts and warning
  reason are visible and exported; structured formats carry fields and CSV/TSV use columns.
- **Still open:** multi-render bulk actions, retention configuration, pruning history/restore,
  comprehensive path-sensitive coverage for
  relative paths, other roots, URI-shaped paths and edge cases (common drive/UNC and
  `/Users`/`/home`/`/tmp`/`/var`/`/private` absolute paths are redacted), real interrupted-write
  recovery, navigation/reattach/completed-run reopening, process
  restart, packaged interaction and a genuine capture.
- **Evidence boundary:** this records lane ran no tests, typechecks, builds, packaged interaction or
  captures. Focused proof remains required for v1 migration, segment/index interruption, orphan
  cleanup, bounds, metadata/export, redaction and deletion; packaged proof must restart and reopen a
  completed render. See [`docs/render-console.md`](docs/render-console.md).

## Issue #63 — one verified release row per completed phase

- **Status:** Documentation contract is recorded; Issue #63 remains open.
- **Record:** [`docs/manual-release-ledger.md`](docs/manual-release-ledger.md) describes the
  schema-backed, append-only ledger in `docs/release-ledger.json` and the validator in
  `scripts/manual-release-ledger.mjs`.
- **Evidence boundary:** The task-owned ledger now has six inventory phases: four historical rows
  (releases 682, 704, 708, and 731), the verified build-and-release-only workflow policy row, and
  the failed/no-release completeness-enforcement row. The four historical rows are `failed` with
  `shipped-nonconforming` disposition because those releases copied and attached catalog photos,
  which current policy forbids. The workflow-policy row is verified from remote release read-back
  and does not claim local packaging or runtime evidence. This lane ran
  no tests, builds, installer sessions, workflow dispatches, runtime checks, or captures.
- **Publication note:** The records-only reconciliation commit
  `873eb0eae7c5b9208c3570a15cf81cf9704a29c7` was published as
  [`v1.0.1373`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1373). This
  is the release of the documentation correction, not a seventh implementation phase or a
  replacement release identity for one of the six inventory rows.
- **Remaining:** Keep one row for every completed phase and update the single bundled hand-written
  `docs/release-phase-inventory.json` with each new phase. The packaged reader now rejects an
  incomplete schema-shaped ledger with the missing phase names instead of returning a partial
  readout; missing or malformed inventory is an error, and local-build facts remain separate from
  cloud verdicts. Issue #51's `.613` evidence remains outside this ledger; only the workflow-policy
  row is `verified`; the completeness-enforcement row is not.
- **Packaging/runtime boundary:** `electron-builder.config.cjs` copies the ledger and its inventory
  to `resources/release-ledger/`. Release [`v1.0.1394`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1394),
  targeting `ad07eb0aea6fd0e31aeb7ac59235eaf103860a39`, proves the built packaged reader: the
  complete profile showed the visible Release Ledger UI with **6 of 6** phases; the incomplete
  profile used a five-phase user-data `release-ledger.json` and the UI named the missing
  **Release-ledger completeness enforcement** phase. The corresponding captures are local-only,
  unposted evidence with absolute paths omitted from this public record. Runtime proof is complete,
  but capture upload remains unavailable, so Issue #63 remains open.
- **Failed/no-release boundary:** Commit `4a7aad1eda64b24337de2e50d4dd50fb625167ff` has no
  release. Run `32295874519` completed `jars` and `package`, then cancelled `test-world`, so
  `release` was skipped; companion run `32295860490` also skipped publication. The correction is
  recorded explicitly: only `check` may supersede stale work, while `jars`, `package`,
  `test-world`, and `release` must not cancel earlier commits. `release` has no concurrency group,
  uses `always()`, and publishes unique run-number tags only after successful artifact-producing
  jobs; it does not gate on `check` alone.

## Issue #70 — first-class marker authoring editor

- **Status:** Marker-studio source work is present in the issue-owned checkout; Issue #70 remains
  open and unverified.
- **Record:** [`docs/marker-studio.md`](docs/marker-studio.md) records the four source-supported
  kinds (POI, line, shape, and extrude), bounded geometry, map-scoped CRUD/duplicate, versioned
  import/export, unknown-field/order retention, local persistence, mutation records, and viewer
  layer host.
- **Evidence still open:** marker-set CRUD beyond the fixed studio set, direct map drawing,
  complete style/icon/label controls, user-facing history browsing and undo/restore, VS Code
  handoff, collision/concurrent-file handling,
  cross-dimension safeguards, and focused accessibility, localization, reduced-motion, packaged
  interaction, and per-type capture proof. Live unsaved preview is wired in source and clears on
  cancel/save/map change, but remains unverified in the packaged viewer.
- **Records boundary:** this update ran no tests and took no captures. Do not close Issue #70 from
  source presence alone.

## Issue #72 static map export — open

- **Branch:** `codex/issue-72-static-map-export` in the task-owned checkout.
- **Contract:** self-contained static output with client-side decompression, configurable base
  paths, optional `.nojekyll`, and no external runtime dependency; folder, ZIP, and configurable 7z
  outputs; path safety; portable versioned manifest; checksums, provenance, engine/version and
  settings metadata; exact omissions; filtered and bulk export; progress, cancellation, resume,
  conflict handling, history, and file-manager/Visual Studio Code actions.
- **Evidence boundary:** no records delta is claimed at this checkpoint before the implementation
  lane changes. No tests or captures were run here. Packaged export remains unverified until every
  referenced file is validated, the result opens from a plain static server, and a genuine
  packaged export opens offline in a fresh browser profile. See
  [`docs/static-map-export.md`](docs/static-map-export.md) and Issue #72.

## Issue #74 — local live-player tracking

- **Status:** Source implementation is present in the issue-owned checkout; acceptance remains
  open and runtime is unverified.
- **Implementation boundary:** `localLiveProvider.ts` reads bounded local `playerdata` data and
  can use an explicitly configured RCON endpoint. `MapStorageHandler` and the CLI server expose it
  as an optional source; the BlueMap-compatible empty response remains the safe default when no
  source is configured.
- **Evidence still open:** no tests, real player-data reads, isolated RCON session, packaged
  interaction, or capture was run in this pass. See [`docs/local-live-player-tracking.md`](docs/local-live-player-tracking.md)
  and issue #74 for the acceptance boundary.

## Issue #75 measurement and waypoints — 2026-08-19

- **Status:** Implementation present in the task-owned checkout; acceptance remains open. The
  model covers distance, polyline, horizontal/vertical delta, area, coordinate validation and
  Nether conversion, plus waypoint and measurement persistence, search, import, and export.
- **Evidence boundary:** No tests, packaged interaction, or real capture were run in this records
  pass. The feature is not described as runtime-verified or shipped. See
  [`docs/measurement-and-waypoints.md`](docs/measurement-and-waypoints.md) and issue #75.

## Issue #77 multi-server operations dashboard — 2026-08-19

- **Status:** Implementation is present on the issue-owned checkout; the issue
  remains open pending verification. The dashboard combines local, Docker, and
  remote profiles with health, maps, players, render/update, and last-check data.
- **Contract:** bounded concurrent refresh with backoff/cancellation;
  stale/unknown/partial reporting; search and full regex, filters, grouping,
  pinning, reorder, multi-select, truthful bulk actions, exact-surface teleport,
  persistent layout/appearance, and credential-free local history.
- **Evidence boundary:** no tests, captures, or packaged multi-server interaction
  are claimed. Mixed-route, offline, auth-failure, version-skew, large-inventory,
  restart, accessibility, localization, and compact-width verification remain
  open. See [`docs/multi-server-dashboard.md`](docs/multi-server-dashboard.md) and
  issue #77.

## Issue #69 — Docker hosting instance manager — 2026-08-19

- **Status:** The default branch contains the Phase G manager, bridge and navigation source as of
  `b5dd1fd332de7e0eee3e9b3a5b233fceae4e6170` (`v1.0.1380`); Issue #69 remains open pending
  verification.
- **Current source:** `design/packages/app/src/main/dockerhosting/{manager.ts,ipc.ts,index.ts}`
  owns daemon probing, app-label filtering, exact digest-pinned image inventory, persistent records, digest-pinned create validation,
  named-volume ownership checks, image `ENTRYPOINT`/`CMD` preservation, create verification/rollback,
  separate Create and Start operations, stop/restart, cancellation,
  bounded logs and authorization tokens. The preload bridge, `DockerHostingScreen.vue`,
  `dockerHosting` tab, command-palette catalogue entry and app startup wiring are present.
- **Daemon-contract evidence:** A bounded local receipt used the non-BlueMap digest-pinned
  `nodeterm-server@sha256:69778914f2b70964241d9600b46b37a6722e78c492a6ea9bea0466449b6fab6b`
  image with owner `worldlens-8bd86805f61e2583f988`, instance/container
  `issue69-proof-20260819` / `worldlens-issue69-proof-20260819`, owned volume
  `worldlens-issue69-proof-volume`, and loopback `127.0.0.1:18169 -> 8443`. Create, start, stop,
  restart, remove and volume removal succeeded; final owned inventories were empty, the port was
  free, the existing `nodeterm-server` stayed healthy, and the unrelated workload was unchanged.
- **Still required:** prove missing/stopped/refused/unusable/ready daemon states; prove BlueMap
  server/map configuration and create conflict/rollback; retain the explicit
  transactional-update refusal until a safe recreate plan exists; implement
  persistent logs/history,
  persistent logs/history, complete
  multi-row bulk actions, export and Visual Studio Code handoff; then run packaged interaction and
  headless capture evidence. No tests, builds, packaged interaction, or captures were run in this
  records update; the daemon receipt above is the only lifecycle evidence.
  See [`docs/docker-hosting-manager.md`](docs/docker-hosting-manager.md) and issue #69.

## Issue #83 — BlueMap server-adapter smoke evidence (2026-08-19)

The pinned upstream source is `vendor/BlueMap` `v5.23` at
`4c4cbc291b361ceff6ee239448e9f988f9019dbb`. The exact supported Minecraft
versions and loader/API inputs for Fabric, Forge, NeoForge, Paper, Spigot, and
Sponge are recorded in [`docs/server-adapter-smoke.md`](docs/server-adapter-smoke.md).
Release `v1.0.1233` provides the published jar names and SHA-256 asset record. A
plan-first `tools/server-adapter-smoke/smoke.mjs` contract now enumerates the
required cases and its checked-in source-SHA/version matrix is populated, but no
`--execute` report exists. No server boot, plugin discovery, live
render/update, endpoint, shutdown/restart, negative-case, test, or capture evidence
was produced in this documentation-only update. Issue #83 remains open.

## Issue #84 — remote-hosting navigation and wiring boundary (2026-08-19)

- [x] Commit `8e78a95c` integrates the dedicated browser-style `remoteHosting` tab,
      `RemoteHostingScreen.vue`, corrected catalogue route, and command-palette destination.
- [ ] Supply real saved-target and completed-map pickers, then preserve publish, refresh, progress,
      verification, stop, persistence, search/menu/inventory coverage, and focus-return behavior.
- [ ] Verify publish/refresh/stop from the genuine packaged application against an isolated host
      through the approved headless route, with real host evidence and captures.

This records-only update ran no tests and took no captures. It records the source navigation/wiring
fact only; issue #84 remains open until the packaged application and isolated-host proof exist.

## Issue #86 — Docker world import against a real daemon

The implementation and source documentation are present for daemon inventory, container and volume
inspection, bind-direct resolution, container-copy, read-only named-volume-copy, additive placement,
and fresh live-world acknowledgement. The 2026-08-19 update is documentation-only. Tests and captures
were unrun in this records-only pass, and no real daemon, throwaway Docker data, packaged application,
or headless capture was exercised. Real container/bind/volume copy, failure and cancellation paths,
ordinary wizard validation, source read-only and destination-safety proof, and packaged-flow capture
remain open. Do not close issue #86 from this record.

## Issue #52 release host and account routing — 2026-08-19

- [x] Route release commands with supported `--repo [HOST/]OWNER/REPO` syntax and never
      pass the unsupported release-level `--hostname` flag.
- [x] Re-read the selected account from the live `gh` inventory, switch it when inactive,
      and verify the effective login before every release mutation.
- [x] Fail closed for missing accounts, refused switches, and identity mismatches, with
      account recovery on the same release surface.
- [x] Record the computer-wide account-switch side effect: the selected account is active
      for the operation, then the previously active account is restored; restore failure is
      surfaced instead of being hidden.
- [x] Preserve regression evidence: focused transport, sync, CI-render screen, and
      backup-run-card suites passed **148/148**; app/UI typechecks, build, and lint passed
      in the implementation lane.
- [x] Carry the later central `gh` runner/`runToFile` fixes (`2a3684f6`, `eb2663e1`),
      child-process close handling (`4d511d6c`), and cloud-render restart/recovery
      integration (`f148a538`) in the current Worldlens baseline.
- [x] Reconcile the acceptance record with current Worldlens state: default-branch SHA
      `761d9c5be80475908093554da2174a6de13c2c6f` is present on the pushed default branch;
      GitHub Actions run `32320134150` completed successfully for that SHA, and non-draft release
      [`v1.0.1398`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1398)
      targets it with six non-empty assets.
- [ ] Capture the repaired state from the genuine packaged application through the cheap
      headless route. The route is currently unavailable, so the issue stays open and no
      fake bridge capture is accepted as evidence.

## Issue #78 — per-project render engine choice

The global new-project engine choice is wired through both real creation routes, `ProjectsScreen`
and `WorldScreen`, in main commit
[`e3cf7f30`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3cf7f30b40989d83a6b8833b1f42894efa55623).
The packaged TypeScript staging path carries and validates the required production dependency
closure in main commit
[`80eefd17`](https://github.com/Ding-Ding-Projects/worldlens/commit/80eefd172d35b9329f95b464e20b56d415826025),
and the local staging record reported **TypeScript 0.1.0** and **Java 5.22-27**.

Remaining before closure: render one genuine packaged project through both engines, compare the
outputs and provenance, and retain the corresponding capture evidence. Local, Docker, CLI, and
restart-with-speed runtime routing remains open where not independently proven. This records-only
reconciliation ran no tests, builds, packaging, packaged interaction, or captures.

## Issue #65 — standalone CLI mod/resource/SQL parity

Implementation, generated-config parsing, workspace build, SQLite initialization, Docker image,
and external PostgreSQL CLI/readback proof are complete. Docker image `worldlens-cli-issue65:proof`
retained the SQL adapters and verified the deployed resource-extension tree; the real marker run
against throwaway `postgres:17.6` exited `0`, registered `overworld`, and read back six tables, one
map, `bluemap:markers` at 2 bytes, `settings` at 339 bytes, and `textures` at 1,371,129 bytes.
The throwaway container and network were removed after verification.

## Issue #57 — cloud-first project configuration

Implementation and focused verification are complete and integrated. Remaining before closure:
exercise the packaged wizard against a real cloud dispatch and read the result back without a prior
local render.

## Issue #64 delivery boundary — 2026-08-19

- **Delivery inspection:** the issue-owned checkout at `d004f3ca15d7d7a9121df370e00c955072489098`
  contains no packaged executable or installer for the standalone CLI, and no runtime receipt for
  a process restart that reopens `<resolved core.data>/tasks.dat` and resumes queued work.
- **Honest state:** the 3-file, 29-test focused proof covers storage, schema/version refusal,
  malformed and unknown entries, terminal exclusion, atomic staging, coalescing, and CLI
  startup/shutdown wiring. Packaged reachability and real process-restart recovery remain open
  acceptance evidence; issue #64 is not ready to close.

## Issue #87 — GitHub sign-out super confirmation (2026-08-19)

- [ ] Route each app-managed GitHub account sign-out/revocation mutation through the shared native
      anchored two-key/full-slider state machine, with exact host/login, local credential removal,
      attempted remote revocation, active-work effects, Emergency exit/Escape, and focus return.
- [ ] Keep local removal and remote revocation as separate outcomes, with same-surface recovery and
      re-authentication when revocation is refused, unavailable, or times out. The `gh` CLI path
      removes only its local credential and does not attempt remote grant revocation.
- [ ] Run the focused contract cases and capture the genuine packaged gate through the cheap
      headless route. Tests and captures are unrun under ultra-speed mode; issue acceptance stays
      open until those proofs land.

## Current verified baseline

- Adult Mode and Kid Mode complete their first-run and round-trip journeys through the committed
  low-level hidden-desktop UI plan.
- Cloud-render terminal rows survive restart, expose local-only removal through the two-key/full-
  slider confirmation, and never delete GitHub data.
- Dispatched cloud renders resume from their recorded run id without uploading or dispatching a
  second run. Successful artifacts are downloaded, verified, registered and openable in the map
  viewer.

## SQL storage cross-engine proof — issue #66

The TypeScript SQL storages are independently proven against real MySQL, MariaDB, PostgreSQL,
and WASM SQLite. Issue #66's durable sanitized matrix report
[`docs/sql-cross-engine-compatibility.report.json`](docs/sql-cross-engine-compatibility.report.json)
exited `0` after comparing all four PostgreSQL/SQLite directions: each row reports 1 hires tile,
9/4/4 lowres tiles, 5 metadata records, 1003 map ids, 1251 grids, and 0 divergences. Direction 1
compares six render-state records through `diffRenderState`; direction 2 explicitly does not compare
render-state through Java's raw HTTP boundary. The report records tested commit, runtime versions,
relative paths, and `ok=true`, `state=removed`, `workRootRemoved=true` for every direction and
incompatible-schema probe. See [`docs/sql-cross-engine-compatibility.md`](docs/sql-cross-engine-compatibility.md)
for the exact evidence and the remaining factual direction-2 boundary.

## Public 1.0 compatibility contract — issue #60

- **Scope:** Windows-only public compatibility for the desktop application and the standalone
  `@worldlens/cli` delivery surfaces, including CLI names and exit codes, configuration/project/
  history schemas, HTTP/SSE and add-on APIs, workflow inputs/outputs, environment variables, file
  layouts, exports, backup pointers, update metadata, and accessibility-visible commands.
- **Policy:** stable, experimental, internal, and deprecated surfaces are named explicitly;
  stable changes follow semantic versioning; schema migration, rollback, support boundaries, and
  intentional 1.0 deferrals are documented rather than inferred.
- **Delivery facts:** the supported channel is versioned `1.0.<run>` Windows releases packaged
  with Squirrel.Windows. The intended artifacts are unsigned `Setup.exe`, `RELEASES`, a full
  `.nupkg`, and deltas where produced; an unknown-publisher warning is expected.
- **Current state:** `build.bat /s` completed successfully after `vendor/BlueMap` initialization;
  no installer package, release, or remote verification was performed.
- **Remaining evidence:** the public surface inventory, reference/migration examples, and site
  summary are present. Executable drift-proof and newcomer installation/first-render/cloud/offline
  acceptance remain separate follow-up evidence and were intentionally not run in this lane.

## Issue #85 — real SSH flow acceptance boundary (2026-08-19)

- [ ] Run the complete packaged SSH world-source and remote-render matrices against isolated
  disposable Linux and Windows OpenSSH hosts with independently checked fingerprints and
  key-only authentication.
- [ ] Record real command versions, bytes transferred and resumed, durations, hashes, failure
  states, cleanup results, and cheap-headless captures without exposing credentials, host secrets,
  or unrelated workloads.
- [ ] Resolve issue #84 first: remote hosting must be mounted in application navigation with real
  saved-target and completed-map context before the combined publish/refresh/stop path is accepted.

This entry was updated by an ultra-speed records pass that intentionally ran no tests and took no
captures. It records gaps only and does not claim any acceptance row is green.

## Open verification work

- Refresh the 117 broad application captures and 15 map-dependent captures against the current UI
  source digest. Their inventory remains intentionally red until their real harnesses are rerun;
  changing the recorded digest alone is not acceptable evidence.
- Extend the low-level capture producer with the stronger built-artifact, interaction, privacy and
  transaction receipts required by the promotion workflow before replacing published PNGs with new
  raw captures.

## Issue #67 — exact two-wave dispatch record (open, 2026-08-19)

- **Run:** `32292039976` completed Wave 1 and Wave 2 shard work.
- **Wave 1:** **256/256** shards completed.
- **Wave 2:** **105/105** shards completed.
- **Merge groups:** **12/12** completed successfully.
- **Receipt:** setup failed because the configured `actions/setup-node` SHA was invalid.
- **Skipped:** final merge verification, lowres rebuild, Pages publication, and cleanup.

The exact source correction removes one stray `e` from that SHA. That historical run remains a
failed receipt setup and does not provide terminal proof. Issue #67 remains open for the still-
unverified Pages publication and near-limit refusal boundary. This lane ran no tests, captures, build,
or packaged interaction.

The corrected rerun `32299613336` did reach **361/361** shards and **12/12** merge groups, then
failed receipt validation because the downloader fetched only `rendered-map`. A multi-group render
publishes `map-lowres` plus `partial-hires-*`, so the assembled receipt recorded `hiresTileCount=0`
and `metadata=false`. The source repair conditionally downloads `map-lowres` and the partial-hires
artifacts. Its terminal rerun is now [32309098236](https://github.com/Ding-Ding-Projects/worldlens/actions/runs/32309098236):
**361/361** shards, **12/12** merge groups, a successful hosted receipt, `91,809/91,809` hires
tiles, matching metadata, verified textures, `publicResult=openable`, and cleanup with resumable state
preserved. The artifact-only dispatch skipped Pages publication; the receipt proves positive disk fit
and cleanup, not a near-limit refusal test.

廣東話：`32292039976` 完成 Wave 1 **256/256**、Wave 2 **105/105**，同埋 **12/12** 個 merge
groups；receipt setup 因為 `actions/setup-node` SHA 無效而失敗，final merge verification、
lowres、Pages 同 cleanup 跳過。Source 改動只係刪走 SHA 多咗嗰一個 `e`，要 rerun 讀到 receipt
先有 runtime proof；所以而家未算 final map、public result 或 disk boundary。

## AWS rendering, AWS hosting, and Cloudflare domains

A second cloud render route, a third hosting route, and custom domains for all of them.
Ticked items are implemented, unit-tested and pushed; the unticked ones are honestly
unticked, and the wiring items are what stands between this and a person being able to use
it from the interface.

### Landed

- [x] `CiRunTransport`: the provider-neutral job seam, extracted without rewriting the
      GitHub route, plus the adapter that lets the existing transport satisfy it.
- [x] AWS credential lease over the `aws` CLI, structurally unable to return a credential,
      with an ambient-key boundary so a shell environment cannot outrank the chosen profile.
- [x] S3 upload as one object, with a guard that fails if the Actions route's 1.5 GB part
      splitting is ever wired in, and digest-matched reuse.
- [x] AWS Batch on Fargate: submit, poll, array jobs for shards, CloudWatch log tail,
      cancel that works before and after a job starts.
- [x] Provisioning plan that states every billable resource's real cost before creating
      anything, and reconciliation that reports orphans rather than repairing them.
- [x] Cloudflare token store in the OS credential vault, refusing rather than downgrading
      when no store exists, with presence-only reads.
- [x] Cloudflare DNS with an honest `pending` state and a conflict that is never silently
      overwritten.
- [x] Cloudflare tunnels across three runtimes (host binary, local container, SSH
      container), publishing no port, digest-pinned, with the token redacted from anything
      shown.
- [x] `route`, `hosting` and `domain` on the project schema, with every mirror widened.
- [x] Render and hosting route pickers following `chunkerRoute.ts`, with coded reasons,
      full five-level bilingual copy, and fact guards on the money words.
- [x] Documentation: AWS render, AWS hosting, the CLI requirement, custom domains,
      tunnels; and the stale 2 GiB ceiling claim in `cirender/index.ts` corrected.

### Not done yet

- [ ] Wire the AWS route into `CiRenderSync`: persist `route` in `CiSyncState`, bump the
      state version to 3 reading absent as `gh`, and branch `#resolveRoute`.
- [ ] Provisioning **execution**. The plan and the cost preflight exist; the create calls
      and the committed CloudFormation-shaped templates do not.
- [ ] IPC channels for the AWS and Cloudflare surfaces, added to the single
      `CIRENDER_CHANNELS` array so the existing drift guard covers them.
- [ ] Mount the route pickers in `CiRenderScreen.vue` and `CloudRenderConfigWizard.vue`,
      replacing the read-only `github-actions` field.
- [ ] Cloudflare domain and tunnel panels, surfaced from `RemoteHostingPanel.vue` and
      `PagesScreen.vue`.
- [ ] A `DashboardSource` for a running tunnel, so it appears in the reachability dashboard.
- [ ] Real built-artifact captures of the picker, the costed preflight, a running AWS job
      and the teardown gate.
- [ ] One end-to-end render on a live AWS account, and one tunnel serving a real map.
