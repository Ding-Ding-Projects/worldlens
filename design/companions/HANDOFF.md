# Companion implementation handoff

Design candidate only. Preserve the productive application, root scripts, existing Squirrel
installer, and public website. Independent review is required before implementation. This change
adds no package, runtime entrypoint, release asset, build configuration, or executable behavior.

## Proposed deliverables and build route

Two additional single portable Windows executables:

- `Worldlens-Build-<version>.exe`: dedicated build workspace.
- `Worldlens-Guide-<version>.exe`: offline documentation/wiki companion.

Reuse the declared Vue/Vuetify/Vite renderer toolchain, esbuild main/preload bundling, and pinned
`electron-builder` already in `design/packages/app/package.json`. A narrowly scoped separate
portable target/configuration for each companion is proposed; do not change the productive
application's Squirrel target. The portable executable may extract its embedded runtime to a
private temporary directory, but must launch from a folder containing only that downloaded EXE,
without a separate runtime or installer. This remains an unverified packaging proposal until
built and tested. Do not silently substitute an installer or adjacent unpacked runtime folder.

Keep build/version selection aligned with the existing release ordinal machinery. The two
companion receipts must identify their own source commit, semantic version, input hashes,
content-manifest hash, output SHA-256 and actual packaging command. Guide additionally records
wiki revision and complete content inventory. Attach both to the normal verified release only
after downloaded-byte verification; no release or workflow changes are authorized by this design.
Avoid importing the productive application's world-renderer runtimes into these companions.

## Proposed implementation ownership boundaries

1. A shared companion shell reuses existing language, appearance, accessibility, palette,
   notification, tabs, search/regex and privacy controls. Audit dependencies before extracting
   shared modules; do not duplicate or silently reduce the existing contracts.
2. The build host exposes an allowlisted `startBuild(action, checkout, candidate?)`, cancellation,
   subscription and recovery API. Renderer has no general shell access. Child tracking and
   receipts remain in the host; validated events drive the workbench. Root scripts retain their
   existing authority for acquisition, build, verification and launch.
3. The guide content adapter consumes current complete docs and the pinned wiki snapshot.
   Existing `docsContent.ts` only matches root-level `docs/*.md`; nested documentation must be
   included explicitly and completeness checked before delivery. Use the existing sanitized
   Markdown renderer; missing routes/assets fail the inventory gate. Retain real wiki prose,
   even where historical claims need separate current context; never rewrite it as new evidence.
4. Build adapters and reference host only after independent review approves `DESIGN.md`, the
   state inventory and action boundaries. The SFC is a component-level layout reference, not a
   complete app or runnable acceptance route. The article slot deliberately requires real source
   content; its warning is not a documentation implementation.

## Review checklist and unresolved work

- Parent records the actual author-model provenance and assigns a different reviewer; verdict
  is pending. Do not treat the author's checks as independent approval.
- Confirm portable packaging exception for both deliverables under the user's explicit request;
  the build companion exception does not replace the main application's delivery format.
- Reference states are explicit in `state-inventory.ts`; shared states apply to both companions,
  except `close-active-run`, which applies only to Build. Create real state-specific fixtures and
  a deterministic host route before capture. The current SFC establishes shell/layout/action
  anatomy, not final visual completeness for every state.
- Add actual localized text catalogues and shared-control content for every inventory state.
  Current reference chrome includes the three language modes, but its source-state identifiers
  remain diagnostic reference labels. They must not be production user-facing copy.
- Build/run/installer action results must be tested against real root script exits and receipts;
  hostile path quoting, invalid ordinal, missing scripts, source changes, cancelled acquisition,
  consent refusal, child launch failure and interrupted recovery are negative cases.
- Verify no process termination affects unrelated applications, no mutation of global PATH,
  no network outside approved acquisition, no release publishing action, and no private content
  in diagnostics/receipts/history/export. Source/content renderers never execute document code.
- Cover every state with the full capture tuple matrix in `DESIGN.md`. Record registered control
  provenance, geometric measurements, real raw captures, comparison and visual diff. None exists
  yet. Any missing tuple or production route remains an open acceptance gap.
- Run a one-file launch of each downloaded portable artifact on supported Windows, offline for
  Guide; exercise home/category/article/wiki/anchor/back/forward, full-text search, Settings,
  keyboard controls and source inventory. Verify source/version/hash readback from each artifact.
- Update product docs, site, wiki and root handoff only in the later implementation/integration
  task; this lane owns `design/companions/` only.

## Provenance and evidence status

Baseline: application `98fb083e`; wiki `0b66c19306add3a090fc70ad08f1d785b49794f7`.
Source inspection: root `build.bat`, root `build-installer.bat`, app package manifest, existing
packaging configuration, docs loader/model/viewer and acquired wiki sidebar/home inventory.
No screenshots, generated images or imported third-party design assets are used. Existing
bundled fonts/icons and genuine Vuetify components are proposed. No production build, runtime
verification, package proof, independent review or publication is claimed.

Source-only check: `node design/companions/check-reference.mjs` parses the Vue SFC and compiles
its template through the existing Vue compiler. Passed on 2026-10-21. This does not establish
runtime wiring, screen geometry, three-language completeness, portable packaging or parity.

Independent review revision: architecture/action boundaries were suitable, but the first visual
handoff lacked distinct state anatomy, setup and workspace/tab identity. The revised SFC and
inventory add these explicitly; re-review is pending. Source-only compilation does not resolve
that review gate. Fixtures default to unverified actions, and production must validate them again
at its host boundary. No implementation is authorized by this revision alone.
