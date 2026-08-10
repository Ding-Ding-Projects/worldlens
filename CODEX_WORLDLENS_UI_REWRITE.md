# Codex execution specification: Worldlens Material Design 3 shell rewrite

> **Target repository:** `https://github.com/Ding-Ding-Projects/worldlens`  
> **Design reference:** `Material Design 3 Electron Rewrite.zip`  
> **Approved target:** `Worldlens.dc.html` and the accompanying `HANDOFF.md` inside that archive  
> **Document purpose:** an implementation order for Codex, not a design proposal and not a request for a second plan

This specification is intentionally self-contained. Execute the rewrite end to end in the current checkout while preserving the repository's existing behavior, data formats, security boundaries, and tests. The uploaded prototype defines the new information architecture, shell geometry, and interaction presentation. The current repository defines what the product actually does.

---

## 0. Executor directive

You are Codex operating from the repository root. Complete the implementation, tests, documentation, and screenshot updates described here.

1. Read the repository's `AGENTS.md` in full before changing anything. Read every more-specific `AGENTS.md` that governs a directory you touch.
2. Read the current checked-out `design/HANDOFF.md`, package manifests, relevant tests, and existing components before editing. This file does not override repository safety or security rules.
3. Do not stop after producing a plan, a component inventory, mock markup, or screenshots. Make the production changes and run the gates.
4. Do not ask broad design questions whose answer is present in the checkout, the uploaded handoff, the approved prototype, or this file. Inspect first and make the safest compatible choice.
5. Preserve unrelated user changes. Record `git status --short` before work, never reset or clean the user's tree, and never overwrite unrelated files.
6. Do not weaken, skip, delete, or rewrite a test merely to make the branch green. Update expectations only when the target behavior genuinely changes, and add behavioral coverage for every new contract.
7. Do not claim a command passed unless its terminal output was observed. Report every unrun gate and the exact blocker.
8. Do not add dependencies unless the current stack cannot meet a requirement. Prefer existing Vue, Vuetify, Sass, shared utilities, stores, and test helpers.
9. Do not create a second application, a parallel shell, or a prototype-only route. The existing application becomes the new shell.
10. Follow the repository's required commit/push discipline. Never force-push, create a remote, publish a release, deploy a proof site, or consume credentials unless the current repository instructions and the user's existing environment explicitly authorize that side effect.

The task is complete only when the desktop shell, Work workspace, project editor entry path, and served viewer meet the acceptance gates in this file.

## 1. Mission and non-negotiable outcome

Rewrite the Worldlens UI so the approved Material Design 3 prototype becomes the product shell without replacing the product underneath it.

The resulting Electron application has three persistent top-level destinations in an 80 px application rail:

- **Home** — discovery through exactly five catalogues.
- **Map** — the live map canvas and viewer controls.
- **Work** — the existing tabbed-navigation system re-hosted as a workspace containing only jobs the user has opened.

The rail footer contains command search, notification history, and settings. These are rail actions, never floating action buttons.

The rewrite is successful only when all of the following are simultaneously true:

- Every current user capability remains available from the new information architecture.
- Existing domain logic, configuration schemas, render orchestration, persistence, security behavior, Electron integration, server behavior, and public contracts remain authoritative.
- `TabbedNavigation.vue` retains docking, groups, pinning, ordering, overflow, all four discovery scopes, bulk-close preview, context menus, persistence, and panel geometry.
- Home and Work are opaque surfaces. The map canvas stays mounted at shell level but is visible and interactive only on Map.
- A fresh installation starts in the dark scheme and lands on Home after onboarding. Existing stored theme and workspace choices survive.
- The browser-served map uses the same Material roles, shape, typography, motion, controls, and map-menu language without importing an unnecessary Electron or Vue runtime into a framework-neutral package.
- No feature is simulated with placeholder data, static screenshots, hard-coded counts, fake integrations, or inert controls presented as working.
- There are no shell FABs, no unprompted toast stack, and no surprise overlay covering content.

## 2. Sources, authority, and conflict handling

### 2.1 Required source order

Use this precedence whenever sources disagree:

1. Repository `AGENTS.md` files and explicit security/privacy requirements.
2. The current checked-out source, tests, schemas, storage migrations, and public documentation for behavior, data, API, and security semantics.
3. The current checked-out `design/HANDOFF.md` for established repository contracts and known issues.
4. The uploaded archive's `HANDOFF.md` and approved `Worldlens.dc.html` for target information architecture, layout, visual hierarchy, and interaction presentation.
5. The archive's `ref/*.png` files to identify before-state details and capabilities that must not disappear.
6. Static prototype values only as visual examples. They are never a business-data source.

When the target presentation conflicts with current behavior, preserve the current behavior and security boundary while changing how the user reaches and sees it. Do not delete functionality to make the mockup easier to reproduce.

### 2.2 Approved and non-approved archive material

Only `Worldlens.dc.html` is the approved target prototype. Treat all three `ShellA-Console.dc.html`, `ShellB-Atlas.dc.html`, and `ShellC-Workbench.dc.html` files as non-authoritative concept studies. Do not merge ideas from them unless the same requirement also appears in the approved handoff or current product.

The archive's `support.js` and inline prototype CSS/JavaScript are a custom demonstration runtime. Do not transplant them into production. Rebuild the design with the repository's Vue, Vuetify, Sass, stores, composables, and test conventions.

- `assets/map-render.png` is a visual fixture. It must never replace the live map canvas.
- `assets/action-artwork.png` is reference artwork. Reuse the repository's existing canonical action artwork when available; do not add a duplicate.
- `assets/worldlens-logo-256.png` is a reference logo. Keep the repository's canonical branding and product-name behavior unless the checked-in asset is demonstrably the approved replacement.
- `.thumbnail` is a preview only.
- `ref/*.png` documents the old/current surfaces and is not the new visual target.

### 2.3 Locate and inspect the design archive

Locate the archive by the exact basename `Material Design 3 Electron Rewrite.zip`. Extract it into a temporary ignored path such as `.codex/reference/worldlens-ui-rewrite/`. Do not commit the archive, extracted prototype HTML, `support.js`, or reference screenshots.

Verify the archive when the supplied file is identical to the upload used to author this specification:

| Item | SHA-256 |
| --- | --- |
| `Material Design 3 Electron Rewrite.zip` | `70837c2244a8fabac2ee7792951ee8ea694ec54ecfb9204a4247c8cac8b7cf79` |
| `HANDOFF.md` | `3a962129167a3973c1bfbc13938612896f4d6bf61282f9b211f5190251330164` |
| `Worldlens.dc.html` | `185ca341b631fd31e9c7af5853a11710be4f2986e232966ace03fccce8c63d8d` |

If the archive hash differs, inspect its own handoff and approved target rather than pretending it is the same version. Record the difference in the completion report.

### 2.4 Resolved ambiguities in the uploaded handoff

The uploaded handoff contains a few internal contradictions. Implement these resolutions:

| Ambiguity | Required resolution |
| --- | --- |
| The navigation diagram and `AppRail` contract say the Work badge is the open-job count, while one legacy-page row says it is the active-render count. | **Work rail badge = open-job count.** The active-render count appears on the Renders job chip and in `StatusStrip`, both reading the existing `createActiveRenders` source. Never conflate the two counts. |
| One component note implies the hero button opens the wizard, while the detailed project-editor section says New map opens Projects. | The hero card body opens the Make a map catalogue. **New map** opens `projects`. **Or walk me through it** opens `wizard`. Stop event propagation so each action has one result. |
| The catalogue-manifest note says it replaces `pages + initialGroups`, while the Work contract requires the seeded groups unchanged. | The catalogue manifest replaces destination discovery only. Keep a separate typed job registry and the existing seeded workspace groups for Work. |
| Prototype copy reports both `107 settings` and `154` options. | Neither number is production truth. Derive schema, field, tab, and node counts from the live descriptors. The archive parser happened to find 107 config keys; the prototype label says 154. Do not hard-code either. |
| “Components unchanged” appears alongside required restyling and layout changes. | Preserve component responsibilities, public behavior, stores, and safety contracts. Targeted template/style/API-compatible changes needed for re-hosting and responsiveness are allowed. Business-logic rewrites are not. |
| The served viewer is described as using the “same components,” but its current package is intentionally framework-neutral. | Share the canonical token output, behavior contracts, copy, icons/assets, and visual structure. Do not import the Vue/Electron runtime into the viewer merely to achieve literal component reuse. |
| “No network” appears in a product that necessarily loads same-origin map data. | No external/CDN dependency or third-party UI request is allowed. Same-origin map metadata and tile requests are expected. Test that the UI boot performs no non-local request. |
| “Close affordances only on jobs” could be read as removing safe dialog exits or native caption controls. | Only jobs receive tab-close affordances. Keep native window controls and semantic Back, Cancel, Done, Escape, and emergency-exit behavior required by dialogs and safety gates. Do not add decorative `X` controls to cards or panels. |

## 3. Privacy, security, and truthful capability boundaries

The uploaded handoff references cross-application and non-public contracts. This public repository must not acquire private implementation details by implication.

1. Never fetch, clone, copy, or name a private repository in production code, tests, comments, screenshots, fixtures, telemetry, or public documentation.
2. Never add credentials, hostnames, account data, vocabulary mappings, private schemas, tokens, secrets, or user-specific paths.
3. Implement a cross-application feature only when a corresponding sanitized public interface, implementation, or test already exists in the current checkout. Reuse that interface exactly.
4. If an uploaded feature depends solely on a private contract that is absent from the checkout, do not fabricate it. Keep its catalogue definition accounted for in the design manifest, resolve its availability through a capability gate, and follow the current public product contract for whether it is omitted or represented by a neutral documentation boundary.
5. Do not create a fake Memory Console, fake control plane, fake sync attestation, fake secret intake, or fake MCP connection. A status card with demo values is still a fake integration.
6. Personal vocabulary is conditional on an existing sanitized public integration contract and explicit private user input. Never add vocabulary terms, mappings, source data, upload/share controls, prompts, logs, exports, screenshots, or renderer-bundle content to this repository.
7. A restricted/shared mode is implemented only through the current sanitized public contract. When that contract exists, preserve its semantics: user-renamable display name, forced English while active, gated capabilities absent rather than merely disabled, prior settings restored after exit, locally verified exit credential, explicit statement that the UX lock is not a security boundary, and no credential leakage. Do not invent credential storage or cross-app transport.
8. Any JSON export from notifications or other panels must pass existing redaction/sanitization utilities and must never include secrets merely because an internal object contains them.
9. Preserve the static server's path confinement, ETag behavior, content-type rules, compression behavior, and existing security tests. The UI rewrite does not add server-side rendering or a permissive catch-all route.
10. Every destructive operation continues through the repository's real super-confirmation implementation. A catalogue entry may open documentation about that behavior; it must not arm a destructive action as a demonstration.

## 4. Baseline audit before editing

Run the following from the repository root, adapting only to commands actually declared by the current checkout:

```bash
git status --short
git rev-parse HEAD
git branch --show-current
node scripts/bootstrap.mjs --check
```

If bootstrap reports missing prerequisites, follow the repository's bootstrap instructions once. Do not run competing installs in parallel. At authoring time the public project is a Node 22+/pnpm workspace and the UI uses Vue 3, Vuetify 3, Vue I18n, local Roboto/Roboto Mono, and MDI assets; the checked-out package manifests remain authoritative.

Before making changes, create a scratch inventory that records at least:

- `design/packages/ui/src/App.vue`: page constants, page registry, active-render aggregation, overlay state, map mounting, onboarding transitions, and existing notice/settings wiring.
- `design/packages/ui/src/components/navigation/TabbedNavigation.vue` and all related composables/types/tests: props, exposed methods, persistence key, group seed, searches, close/pin/reorder behavior, context menu, and geometry.
- `design/packages/ui/src/components/shell/`: existing title bar and shell-adjacent components.
- Existing Home, World/wizard, Projects, runners/CI, Renders, servers, backups, Pages, repository, preview, docs, settings, options/config, notification, palette, map-menu, control-bar, marker, tutorial, EULA, recovery, update, appearance, and super-confirmation components.
- Stores and services that own product name, theme, notice duration, notifications, active renders, unsaved state, profiles/maps, panel geometry, localization/tone, dependency provisioning, updates, and recovery.
- Configuration schemas, `FieldMeta`, generated defaults, CLI flags, `ResolvedCliActions`, marker-set metadata, mask semantics, and save/revision services.
- `design/packages/viewer/src/materialShell.*`, the server static handler, CLI static-bundle path, compression tests, and viewer local-storage keys.
- `design/packages/ui/src/styles/md3.scss`, `src/vuetify.ts`, global reduced-motion handling, existing appearance-target descriptors, and token tests.
- Existing screenshot harnesses, fixture setup, supported viewports, and baseline naming.

Capture baseline screenshots of the current app surfaces named by `ref/*.png` using deterministic fixtures before replacing the shell. This gives regression evidence for capability preservation; it is not the target visual baseline.

Run the smallest meaningful baseline gates and record pre-existing failures. Do not attribute an existing failure to this rewrite, but do not hide it either.

## 5. Scope and out-of-scope work

### In scope

- New desktop shell composition, rail, Home, catalogue pages, Work host, status strip, Problems panel, and notification panel.
- Re-hosting the existing tabbed-navigation system as the Work workspace.
- Versioned migration from the old all-page workspace to the new destination/job model.
- New project-editor default entry route and any missing project-editor integration explicitly described below.
- Targeted responsive and visual updates to existing screens needed to fit the approved shell.
- Served-viewer visual parity, compact behavior, token identity, local assets, and existing static-serving semantics.
- Localization, accessibility, focus, keyboard, reduced-motion, contrast, and screenshot coverage for all new surfaces.
- Documentation and handoff updates that accurately describe the implemented result.

### Out of scope unless current code already requires it

- New render algorithms, new config keys, changed BlueMap file formats, changed backup/repository protocols, or changed remote-server authentication.
- A new router, state-management framework, UI library, CSS framework, icon font, web server, analytics SDK, or design-token vocabulary.
- Replacing the live map with a mock image or rebuilding working screens from prototype HTML.
- Rebranding, changing product-name persistence, or overriding user-supplied product names.
- Private cross-application implementations absent from the public checkout.
- External proof-repository creation, real publishing, or credentialed end-to-end deployment without explicit existing authorization.
- Unrelated refactors. Keep the diff centered on the shell and required integrations.

## 6. Target information architecture and typed navigation model

Do not add Vue Router solely for this rewrite if the application is currently state-driven. Introduce a typed shell-navigation controller/composable using the repository's existing state and persistence conventions.

Use equivalent types to these, adjusted to existing naming and strict TypeScript rules:

```ts
export type RailDestination = "home" | "map" | "work";

export type CoreJobId =
    | "wizard"
    | "projects"
    | "runners"
    | "renders"
    | "servers"
    | "pages"
    | "preview"
    | "backups"
    | "worldrepo"
    | "docs";

export type OptionalJobId = "memory";
export type JobId = CoreJobId | OptionalJobId;

export type FeatureTarget =
    | { kind: "job"; jobId: JobId; reveal?: string }
    | { kind: "rail"; destination: "map"; reveal?: "maps" | "markers" | "settings" | "info" }
    | {
          kind: "overlay";
          overlay: "settings" | "config" | "palette" | "notifications" | "eula" | "tour";
          reveal?: string;
      }
    | { kind: "work-action"; action: "tab-finder" | "dock-editor"; reveal?: string }
    | { kind: "docs"; articleId: string }
    | { kind: "conditional"; capability: string; target: FeatureTarget };

export interface CatalogueFeatureDefinition {
    readonly key: string; // globally unique; never reuse a target/job id as the feature key
    readonly icon: string;
    readonly nameKey: string;
    readonly nameFallback: string;
    readonly blurbKey: string;
    readonly blurbFallback: string;
    readonly target: FeatureTarget;
    readonly metaResolver?: string;
    readonly availability?: string;
    readonly hideInRestrictedMode?: boolean;
}
```

### 6.1 Required state ownership

There must be one source of truth for each concept:

| Concept | Owner |
| --- | --- |
| Current Home/Map/Work destination and current catalogue | New shell-navigation controller/store |
| Open job tabs, active job, groups, docking, pinning, order, collapsed groups | Existing `TabbedNavigation` workspace state/persistence |
| Job definitions, labels, icons, component mapping, seeded group | New typed job registry, not the catalogue manifest |
| Feature discovery, copy, capability, and target | New typed catalogue manifest |
| Active render count/progress | Existing `createActiveRenders` aggregation/store |
| Notices and read state | Existing notice/notification store; presentation moves |
| Validation/runtime problems | Existing source errors aggregated through a typed Problems adapter; do not duplicate domain state |
| Theme, appearance, panel geometry, language/tone | Existing stores/contracts |

Do not persist a second `openJobIds` array beside the tab workspace. If the host needs an open-job count, add a narrowly scoped, backwards-compatible readonly exposure or `workspace-change` event to `TabbedNavigation` and derive it from the real workspace.

### 6.2 Feature activation algorithm

All catalogue rows, Home search results, command-palette feature commands, and deep reveal actions must call the same activation function.

```ts
async function activateFeature(feature: CatalogueFeatureDefinition): Promise<void> {
    // 1. Resolve availability/restricted-mode behavior.
    // 2. For a job: ensure the page once, reveal/select it, switch to Work,
    //    then request the optional sub-surface only after the component is ready.
    // 3. For Map: switch destination without remounting the canvas, then open the requested viewer menu.
    // 4. For an overlay: preserve the underlying destination, open the existing overlay,
    //    route to its existing section/search request, and restore focus on close.
    // 5. For a work action: switch to Work if necessary and invoke the existing tab-finder/dock API.
    // 6. For docs: ensure/reveal the Docs job and route to the article through the existing docs API.
}
```

Do not use timeouts to guess when a destination mounted. Use exposed methods, reactive readiness, `nextTick`, or an existing reveal-request pattern. Unknown targets produce a development error and a user-visible Problem with a truthful remedy; they do not silently do nothing.

### 6.3 Destination behavior

- Fresh install and completion of first-run setup land on Home.
- Home can display a catalogue page without becoming a fourth rail destination.
- Selecting the already-active Home item returns from a catalogue page to the five-card Home root.
- Selecting Work restores the active open job. If no job can be restored, show a purposeful empty state with a Choose work action to Home; do not create a blank tab.
- Selecting Map reveals the already-mounted viewer and restores its live state.
- Normal restarts may restore the last safe destination only if that matches current persistence behavior. Never restore a transient overlay. If Map cannot be shown because no valid profile exists, route to Home or the existing map chooser with a truthful explanation.

## 7. Workspace persistence and migration

The current tab workspace uses the existing persistence contract, observed under the default key `worldlens-tabs`. Keep that key and its existing schema/migration machinery unless the checkout has already changed it. Do not wipe `localStorage` or seed over an existing workspace.

Implement an idempotent versioned migration from the old twelve-page model to the new shell/job model.

### 7.1 Fresh workspace

- Destination: Home.
- Work placement: top.
- Open jobs: `wizard` only.
- `wizard` is pinned and therefore has no job-close control.
- Seeded groups remain:
  - **Rendering** — `projects`, `runners`, `renders`.
  - **Finished maps** — `servers`, `pages`, `preview`.
  - **Keeping a copy** — `backups`, `worldrepo`.
- A group definition may exist before one of its jobs is open; no empty group heading should render.
- The seed runs only for a truly fresh workspace.

### 7.2 Upgrade algorithm

1. Parse the existing workspace through the current safe parser. Never assume stored JSON is valid.
2. Normalize and compare it to the exact pre-rewrite untouched default seed using semantic fields, not timestamps or object key order.
3. If it is untouched, migrate to the fresh workspace above: pinned wizard only, top placement.
4. If it is customized:
   - Remove structural `PAGE_HOME` and `PAGE_MAP` tabs from the Work workspace because they are rail destinations now.
   - Preserve every remaining job tab, duplicate, group, group color/name/collapse state, pin, order, skip state, active appearance, and deliberate docking placement.
   - Change a left placement to top only when it is provably the untouched default placement. Preserve a user's deliberate left/right/bottom choice.
   - Preserve unknown-but-still-supported extension pages. For truly unresolved page IDs, retain recoverable raw state and report a Problem rather than deleting data silently.
5. Map the old active page to the shell:
   - old Home → Home;
   - old Map → Map;
   - a recognized job page → Work with that job selected;
   - missing/unknown → Home while preserving recoverable workspace data.
6. Ensure the pinned wizard exactly once. `ensurePage()` must remain idempotent; do not duplicate the page on every mount.
7. Mark the migration version only after the transformed workspace is safely persisted.
8. A malformed workspace falls back to a safe fresh view while preserving or backing up the raw value according to existing recovery conventions. Do not clear unrelated storage.

### 7.3 Backwards-compatible `TabbedNavigation` extension

Re-host rather than rewrite. Add only the smallest API required to support a Work-specific fresh seed and count, for example:

- `seedPageIds?: readonly string[]` with the existing all-pages behavior as the default for other consumers.
- `defaultPlacement?: TabPlacement` with the existing default preserved for other consumers; Work passes `top`.
- A readonly exposed/open-pages signal or `workspace-change` event so `WorkPane` can derive the Work badge.
- Existing `ensurePage()` and `revealPage()` behavior retained.

Use the real current API names after inspection. Do not blindly create duplicate methods. Keep the existing tab-contract script at its actual path unchanged; the uploaded handoff may refer to `script/test-tab-contract.mjs` while the checkout may use `scripts/...`. Locate it rather than hard-coding the typo.

### 7.4 Persistence tests

Add fixtures/tests for:

- fresh install;
- exact untouched legacy seed;
- customized order and groups;
- each docking edge;
- pinned and duplicate jobs;
- old active Home, Map, and each legacy job;
- missing page IDs;
- malformed JSON;
- repeated migration/idempotence;
- stored light/contrast theme surviving while missing theme defaults dark;
- restricted-mode state and capability filtering without destroying prior choices.

## 8. Required file and module structure

Use current repository conventions. The following is the preferred shape under `design/packages/ui/src`; adjust only when an existing colocated convention is stronger.

```text
components/shell/
  AppRail.vue
  HomeCatalogues.vue
  CataloguePage.vue
  WorkPane.vue
  StatusStrip.vue
  ProblemsPanel.vue
  NotificationPanel.vue
  shellNavigation.test.ts
  AppRail.test.ts
  HomeCatalogues.test.ts
  CataloguePage.test.ts
  WorkPane.test.ts
  StatusStrip.test.ts
  ProblemsPanel.test.ts
  NotificationPanel.test.ts

shell/ or composables/ (choose the existing convention)
  catalogues.ts
  catalogueSearch.ts
  featureTargets.ts
  jobRegistry.ts
  shellNavigation.ts
  tabWorkspaceMigration.ts
  problemsAdapter.ts
  *.test.ts
```

Modify/re-host existing files rather than cloning them:

- `App.vue` — shell orchestration and layer composition only.
- `TabbedNavigation.vue` and related types/composables — minimal backwards-compatible host hooks, migration, top placement, no capability loss.
- Existing Home component — replaced by or delegated to `HomeCatalogues` rather than left as a second Home implementation.
- Existing title bar, settings, palette, config/options editor, notification store, map controls/menu/markers, wizard, project editor/screens, render screens, server/screens, backups/repository, Pages/preview, docs, onboarding, recovery, update, appearance, and safety components — re-host and style as required; do not duplicate.
- `styles/md3.scss`, `vuetify.ts`, and appearance-target definitions — spend existing roles; do not introduce new role names.
- `packages/viewer/src/materialShell.*` — extend the current framework-neutral shell, remove duplicated hard-coded token values, and add compact/parity behavior.
- Server/CLI bundle integration and tests — point to the updated viewer build without weakening static-handler behavior.
- `design/HANDOFF.md` and relevant public docs — update with the implemented state, migration, tests, and genuine deviations.

Keep `App.vue` readable. Extract static definitions, migration, target routing, problem aggregation, and feature search rather than creating a monolithic setup block. Do not move unrelated business logic merely to satisfy an aesthetic file-size target.

Follow the current strict TypeScript and formatting configuration, including type-only imports, explicit optional-property handling, relative `.js` import extensions where required, and the repository's established indentation/Prettier output. Avoid `any`, unsafe casts, module-level browser access, and non-null assertions without a proven invariant.

## 9. Shell composition and layering

Compose the desktop window in this logical order while preserving current Electron drag regions and native caption behavior:

```text
App root
├─ AppTitleBar (36 px, full width)
├─ existing reflowing update/recovery/first-run status surfaces, when applicable
├─ StatusStrip (only when there is useful render/problem status)
└─ shell body (remaining height; no document scroll)
   ├─ AppRail (80 px)
   └─ content host
      ├─ MapView / map canvas host (always mounted when current profile permits)
      ├─ Home or Catalogue opaque destination surface
      ├─ WorkPane opaque destination surface
      └─ ProblemsPanel docked to the content bottom when the user opens it

Existing top-level overlays
├─ Settings drawer
├─ Config/options full-bleed surface
├─ Command palette
├─ Notification panel (anchored beside rail, user-opened)
├─ existing dialogs/super-confirmation/EULA/tutorial
└─ other current guarded overlays
```

### 9.1 Map mounting contract

- Keep the map at shell level; do not move it into a `TabbedNavigation` slot.
- Do not use a destination change to destroy and recreate the WebGL scene, camera, selected map, marker state, or subscriptions.
- Hide non-active map interaction with the least disruptive combination supported by the current renderer: opaque Home/Work layers, `pointer-events: none`, `inert`, and `aria-hidden`. Avoid `display: none` if it breaks canvas sizing or WebGL lifecycle.
- On return to Map, invoke the existing resize/invalidation hook if the renderer needs it. Do not recreate the map as a workaround.
- Add a test that navigation Home → Map → Work → Map does not increase the map mount/initialization count and preserves a representative camera or selected-map state.

### 9.2 Scroll ownership

The document/root shell never scrolls. Every visible pane owns one intentional scroll region:

- Home/Catalogue: their main content container.
- Work: the active job's existing content scroller; do not add a second generic overflow wrapper around a job that already scrolls.
- Settings: one list scroller, not nested list/detail scrollers.
- Notifications: one notification-list scroller with non-scrolling controls/header as space allows.
- Problems: one problem-list scroller when expanded.
- Project editor: each of its three logical columns is a pane and owns one scroller.

Test wheel, keyboard Page Up/Down, focus scrolling, and 200% zoom so nested scroll traps do not return.

### 9.3 Overlay behavior

- Nothing covers content without an initiating user action except existing safety/onboarding/update/recovery surfaces that reflow layout rather than float over it.
- Every user-opened overlay traps or manages focus according to its existing contract, makes the underlying surface inert where modal, closes with Escape when safe, and restores focus to its opener.
- A notification arriving increments history/unread state; it does not open the panel or render a toast.
- An error remains inline at its source and contributes to the status/problems views. Do not replace source-local validation with a remote summary only.

## 10. New shell component contracts

### 10.1 `AppRail.vue`

Responsibilities:

- Render product mark/identity, Home, Map, Work, and footer actions for command search, notifications, and settings.
- Emit destination/action intents only. It must not own overlays, jobs, or product stores.
- Width: 80 px at every supported Electron width, including 800 px.
- Active destination indicator: 56 × 32 `corner-full` pill using `primary-container` / `on-primary-container`.
- Work badge: number of open jobs from the tab workspace. Use compact `99+` treatment if the existing badge utility supports it. Accessible label must state the full count.
- Notification badge: unread notice count from the existing store.
- Search action exposes `Ctrl+Shift+F` in tooltip/accessibility copy and invokes the existing palette.
- Footer has no FAB treatment and no corner-floating actions.
- Each rail item is a real button with at least a 48 px target, icon plus visible label, `aria-current="page"` when active, visible focus, and no dependence on color alone.
- Preserve Electron drag/no-drag behavior: interactive rail items must remain clickable and never inherit a draggable title-bar region.

Suggested API, adapted to conventions:

```ts
interface Props {
    destination: RailDestination;
    openJobCount: number;
    unreadCount: number;
    productName: string;
}

const emit = defineEmits<{
    select: [destination: RailDestination];
    openPalette: [];
    openNotifications: [];
    openSettings: [];
}>();
```

### 10.2 `HomeCatalogues.vue`

Responsibilities:

- Render the Home heading/lede, approved feature search interaction, and exactly five catalogue cards from the manifest.
- The **Make a map** hero spans the available width, uses `primary-container`, and is the only card with a filled primary action.
- Hero card body → Make a map catalogue.
- **New map** → `projects` job.
- **Or walk me through it** → `wizard` job.
- Other four cards are outlined `surface-container` cards with equal visual weight.
- Every card header displays a count derived from `features.length`, never a literal.
- Preview at most four feature names. The preview is explanatory, not four extra nested navigation controls unless the approved prototype makes them actionable.
- Card body is keyboard accessible. Avoid invalid nested button markup; separate body/action hit areas semantically and stop propagation.
- A search query uses the shared regex-builder-capable search field and the catalogue manifest. It must not create a permanent sixth card. Results may temporarily filter/group the five catalogues or present a divided feature-result state that calls the shared activation function.
- Copy is translated at render time, with English fallbacks, so locale/tone changes update live.

### 10.3 `CataloguePage.vue`

Responsibilities:

- Show a semantic Back action to Home root, a header block, optional shared search/filter, group headings, and a divided feature list. Do not render feature cards.
- Each row: icon, translated name, live/static meta, one-sentence blurb, chevron.
- Whole row is one button/link target with 18 px vertical padding and at least 48 px effective target.
- Blurb uses `body-small`, `on-surface-variant`, `text-wrap: pretty`, and a maximum readable measure of 68 characters where layout permits.
- Meta wraps below the name at narrow width and disappears only when its resolver returns no value.
- Disabled/unavailable behavior is capability-driven and truthful. Prefer opening a real prerequisite/remedy surface; do not leave a clickable no-op. Private-only absent capabilities follow the public contract and are not faked.
- Search uses the same regex builder and highlights safely without injecting HTML.
- Keyboard order is Back → search → rows. Enter/Space activates a row. Focus remains stable when filtering.

### 10.4 `WorkPane.vue`

Responsibilities:

- Host the existing `TabbedNavigation` and render the active job through its current slot contract.
- Supply the full available job registry for discovery/restore while seeding only wizard on a fresh workspace, or use the minimal compatible mechanism discovered in the component.
- `+` returns to Home; it never opens a blank tab.
- Opening a catalogue job calls `ensurePage()` then `revealPage()` and selects Work.
- The strip shows only opened jobs, not every possible destination.
- Default placement is top inside Work. Left/right/bottom docking remains available inside the Work content area; the app rail always owns the outer left edge.
- Group labels appear only when at least one member is open. Seed names and behavior remain unchanged.
- Pinned wizard has no close button. Other open jobs use the existing close affordance.
- Closing dirty work invokes the real unsaved-work guard. Never discard silently and never invent a global confirm that bypasses screen-specific save/abandon logic.
- If a job has a deep `reveal` request, deliver it through that screen's current reveal/search API after selection.
- Preserve tab finder, overflow, context menu, drag/reorder, keyboard alternatives, bulk-close preview, skip/duplicate behavior, and geometry.

### 10.5 `StatusStrip.vue`

Responsibilities:

- One reflowing line under the title bar/banners when there is useful status.
- Display active render summary/progress, unresolved problem count, and at most one highest-priority action.
- Renders data comes from the same existing `createActiveRenders` source used by the Renders chip. The Work badge remains an open-job count.
- Do not duplicate render subscriptions or poll separately.
- Use `role="status"` and polite live updates; throttle noisy progress announcements so screen readers are not flooded.
- Clicking the problem summary opens the Problems panel. The render action opens/reveals the Renders job.
- No toast, floating badge, or absolute overlay.

### 10.6 `ProblemsPanel.vue`

Responsibilities:

- Dock to the bottom of the content host, full content width excluding the rail. It reflows the active destination instead of covering controls.
- Each problem includes stable ID, severity, source/path, concise error, plain-language meaning, and a real remedy action when one exists.
- Preserve inline errors at their source. The panel is an aggregate view, not a replacement.
- Severity uses icon + text + role, not color alone.
- Unresolved state comes from source stores/validators; do not clone mutable error objects into a second truth.
- Dismissing a historical notice must not erase an unresolved problem. Resolving the source removes or updates the problem.
- Focus the requested source field/panel/job when a remedy is activated.
- At narrow widths actions wrap below text without horizontal page scrolling.

### 10.7 `NotificationPanel.vue`

Responsibilities:

- User-opened history panel anchored beside the rail. Desktop reference geometry: left about 88 px, bottom 16 px, width 420 px, max height 560 px; implement with existing panel geometry and viewport clamps rather than blind fixed positioning.
- No notification opens it automatically. Remove the corner FAB and visual toast stack while keeping the `raiseNotice()` API and history behavior.
- Filters with live counts: All, Errors, Warnings, Info, Unread.
- Per-row selection, tri-state select-all, and bulk actions: mark read, mark unread, invert selection, copy, export JSON, dismiss.
- Disabled bulk actions are visibly and semantically disabled until selection exists.
- Rows include severity icon/text, message, and monospace timestamp. Sensitive values are redacted through current utilities before copy/export.
- Panel uses a dialog/popover semantic appropriate to the current geometry system, Escape close, focus containment where needed, and focus return to the bell.
- Existing notice-duration settings and data compatibility remain even though the desktop shell no longer auto-presents a toast stack. Do not delete persisted settings or public APIs.

## 11. Screen-by-screen implementation requirements

### 11.1 Home

- Content max width about 1010 px; desktop horizontal padding about 48 px, reduced responsibly near 800 px.
- `headline-medium` title and concise lede.
- Approved search treatment over the manifest; every search includes the anchored regex builder.
- Hero full width, then the other four cards in a balanced grid. At 800 × 600 the grid is one column and the page scrolls in its one content region.
- Card previews cap at four; counts derive from manifest arrays.
- No old tile grid, recent-job dashboard, map canvas bleed-through, floating controls, or hidden destination content.

### 11.2 Catalogue pages

- Back action, header, divided grouped list; no cards.
- Preserve the five catalogue/group organizations and all 85 feature definitions in Appendix B.
- A cold-start path to any normal feature must take no more than three user activations: Home → catalogue → feature → destination, with direct search often shorter.
- Blurb should use the first sentence of the matching current public article when available. The appendix copy is intent/reference, not permission to overwrite more accurate current documentation.

### 11.3 Work

- Top job strip by default; dock controls live in the existing “Where the tabs sit” UI.
- Active job title uses `headline-small` where the screen does not already own a stronger header.
- Existing jobs are re-hosted, not replaced: wizard, Projects, CI/runners, Renders, maps/servers, Pages, preview, backups, world repository, docs, and any public optional job.
- `Renders (N)` uses the live active-render aggregator. Status strip uses the same source.
- The Work badge uses open-job count.
- Unsaved chips use current unsaved semantics and `tertiary-container` treatment where the design calls for it.
- No Home or Map tab remains in Work.

### 11.4 Map

- The live canvas is visible only in Map.
- Restyle the existing control bar as one `surface-container` pill with `outline-variant` border.
- Mode controls form a segmented run inside the pill.
- X/Z values use Roboto Mono and remain copyable/accessible as current behavior allows.
- Menu button and map picker sit top-left as one row. Zoom controls sit bottom-right.
- Remove shell-level settings/server/config FABs; their destinations are rail footer/catalogues.
- Preserve map selection, controls, markers, marker sets, profile/server behavior, and current capability/security boundaries.
- Do not convert map controls to decorative round FABs. A compact round icon control is allowed only when it is part of the map control system and not a floating destination shortcut.

### 11.5 Wizard

- Keep all five steps and current world/config/render behavior.
- Render numbered clickable progress steps. Completed steps use `primary-container`; current uses `primary` with sufficient contrast.
- Provide keyboard navigation and announce current/completed state.
- Mojang-consent failure appears inline in an `error-container` panel with the actual remedy. It is never a toast.
- Every step footer offers **Open the full editor instead**, opening the current project in Projects when available.

### 11.6 Project editor entry and chooser

- Home **New map** opens Projects, which opens its chooser when no project is active.
- Project name/header can return to the chooser.
- Chooser incorporates existing world/project components and routes:
  - auto-discovered default Minecraft worlds;
  - mounted launcher roots and instances;
  - existing projects;
  - Browse;
  - GitHub release source;
  - SSH source;
  - container-volume source.
- Previously known but unplugged/unreachable roots remain listed with an explicit state and remedy. Do not make them vanish.

### 11.7 Options/config editor

- Remains a full-bleed save-or-abandon surface, not a Work job.
- Preserve its existing eight-or-live-derived tabs, global search, appearance editing, validation, history, and save behavior.
- Add/retain the save-plan side panel naming every file that Save will write, the revision, and the tile-invalidating consequences.
- Tab counts and total fields come from live schema descriptors, never the prototype numbers.
- Open from Set up & help and the command palette through the same existing overlay state.

### 11.8 Settings drawer

- Right drawer, nominal 560 px, viewport-clamped.
- Search at top with anchored regex builder.
- One scrolling list of sections/rows; remove the nested two-pane list/detail scroll trap.
- Rows show concise current state chips such as consent/runtime/account status, using live stores.
- Complex rows open real editors/sheets/dialogs while making the underlying drawer inert as appropriate.
- Preserve all existing settings and add no fake status.

### 11.9 Existing overlays and onboarding

- `AppTitleBar`, settings, command palette, ConfigScreen, FirstRunSetup, EULA, Welcome, TutorialOverlay, UpdateBanner, StartupRecoveryBanner, and AppearanceTarget retain their real behavior.
- First-run completion lands on Home.
- Update/recovery surfaces reflow beneath the title bar; they do not float over content.
- Palette shortcut remains `Ctrl+Shift+F` and the rail action invokes the exact same command path.
- Overlay dismissal restores focus and never changes the underlying destination unexpectedly.

## 12. Legacy page-to-destination mapping

Use current constants after inspection; the following names describe the observed public baseline.

| Legacy page/surface | New destination | Required behavior |
| --- | --- | --- |
| `PAGE_HOME` | Rail **Home** | Five catalogues; not a Work tab. |
| `PAGE_MAP` | Rail **Map** | Live shell-mounted viewer; not a Work tab. |
| `PAGE_WORLD` | Work job `wizard` | Secondary first-map path; pinned in a fresh workspace. |
| `PAGE_PROJECTS` | Work job `projects` | Primary New map route and project chooser/editor. |
| `PAGE_CIRENDER` | Work job `runners` | Existing CI/Actions/runners screen and state. |
| `PAGE_RENDERS` | Work job `renders` | Live `Renders (N)` count and deep reveals for console/speed/interrupted/repair. |
| `PAGE_SERVERS` | Work job `servers` | Local and remote maps/servers. |
| `PAGE_BACKUPS` | Work job `backups` | Backup creation and source/restore surfaces. |
| `PAGE_PAGES` | Work job `pages` | Pages/remote/private publication flows. |
| `PAGE_WORLDREPO` | Work job `worldrepo` | Repository and adoption flows. |
| `PAGE_PREVIEW` | Work job `preview` | Live local/server-hosted viewer preview. |
| `PAGE_DOCS` | Work job `docs` | Docs, changelog, glossary, design-system articles. |
| Config/options screen | Existing full-bleed overlay | Save/abandon semantics unchanged. |
| Settings | Existing right drawer | Rail footer and feature targets open it. |
| Command palette | Existing overlay | Rail footer and `Ctrl+Shift+F`. |
| Notifications | New anchored panel over existing store | User opens via bell; no toast/FAB. |
| First run/EULA/welcome/tutorial | Existing guarded surfaces | Finish returns to Home. |

Do not retain the old page registry as a second navigation UI. It may remain temporarily as migration aliases, but production discovery must flow through rail destinations, catalogue features, and Work jobs.

## 13. Preserve the full tabbed-navigation contract

`TabbedNavigation.vue` is not a disposable shell detail. Preserve and regression-test every capability:

- Docking inside Work: left, right, top, bottom.
- Default top placement only for a fresh Work workspace.
- Named, colored, collapsible groups.
- Seeded groups exactly: Rendering; Finished maps; Keeping a copy.
- Pinning and pinned no-close behavior.
- Drag reordering and keyboard-equivalent move actions.
- Overflow control and hidden-tab finder.
- Four discovery scopes: Tabs, Groups, Documentation, Bulk close.
- Bulk close selection, invert, preview, and exact Close N result.
- Context menu: pin/unpin, skip, duplicate, group operations, move left/right, close, close others, subject to current rules.
- Persistence, migrations, duplicate semantics, active-page behavior, and panel geometry.
- Viewport-bounded/resizable/keyboard-movable popovers and panels.
- Existing regex builder in every tab search.
- Existing accessibility roles, focus roving, keyboard navigation, and context-menu access.

Add Work-host tests without replacing the existing contract suite. The existing contract script must pass unchanged. Any new prop/event must have a backwards-compatible default and focused tests showing other consumers retain old behavior.

When a job closes:

1. Run the job's existing dirty/unsaved guard.
2. If cancel, preserve tab and focus.
3. If save, await real save before close.
4. If abandon is allowed, use the real explicit path.
5. Select the deterministic adjacent/previous job according to current tab behavior.
6. If only pinned wizard remains, keep Work usable.
7. Never close Home, Map, a rail item, a catalogue, settings, or notifications through tab-close semantics.

## 14. Project editor: production data model and UI

The project editor is the default route for making a map. It must render real configuration metadata rather than a transcribed UI schema.

### 14.1 Three logical panes

At normal desktop widths:

1. **Project tree**
   - Maps, one node per map.
   - Storages.
   - Core, Web app, Web server, Server plugin.
   - Command line.
   - Each node displays a live setting count derived from descriptors.
   - Selection, expand/collapse, add/remove operations, dirty state, and keyboard tree behavior use existing services and safety gates.

2. **Selected node editor**
   - Grouped fields generated directly from `FieldMeta`.
   - Dotted path in Roboto Mono.
   - Type, upstream documentation sentence, real control, validation, default, advanced/hidden semantics.
   - `invalidatesTiles` fields show a **re-renders tiles** badge.
   - Changed fields use primary emphasis and offer **Revert to default**.
   - `marker-sets` is generated from `MARKER_SET_FIELDS` or the current equivalent.

3. **Consequences**
   - Explain that a new project began from BlueMap-generated defaults.
   - Live save plan naming files that will be written and the revision committed.
   - Accurate tile-invalidating consequence/count from existing planning logic.
   - Live resolved `bluemap-cli` command generated from the CLI node.

Each pane owns one scroll region. At widths where three useful columns cannot fit, use the repository's responsive panel/geometry pattern: keep tree/editor usable and expose Consequences through an explicit user-invoked pane selector or bounded sheet. Do not introduce horizontal document scrolling or silently drop the pane.

### 14.2 Generated defaults and schemas

- New projects start from the current BlueMap generated-default service. They are not sparse, empty, or populated from prototype values.
- Render fields directly from live descriptors. The uploaded inventory listed Core 10, Map 31 plus mask, Storage 10, Web app 19, Web server 8, Plugin 12, and CLI 17, but these figures are audit hints only. Tests should enumerate current live descriptors and ensure every field is represented exactly once.
- Do not add, rename, or drop a config key in UI code. Change the schema/metadata source first only when the product truly changes.
- Preserve exact dotted paths, commands, URLs, IDs, and external factual records through localization/vocabulary presentation.
- Use existing typed control components, validation, path chooser, enum/select, list/map editors, and appearance hooks. Do not create a generic string input for every type.

### 14.3 CLI semantics

The CLI flags are dependent. Render through the current resolver such as `ResolvedCliActions`:

- `-r`, `-f`, `-u`, and `-e` select the render branch.
- Inside that branch, `-g` changes meaning to force regeneration as part of rendering.
- `--markers` and `-s` are not reached when the render branch excludes them.
- The visible command line must be the resolved command, not a naive concatenation of checked boxes.
- Add branch-combination tests based on the resolver's current contract, not duplicated UI logic.

### 14.4 Render mask

Every map node has a Render mask card above settings. Selecting the `render-mask` field opens the same editor instance/state.

Required tools and semantics:

- Rectangle, circle, ellipse, polygon, region-aligned.
- Add (**Render it**) and subtract (**Cut it out**) operations in an ordered list.
- Size stepper in blocks.
- Canvas with measured region bounds and real overworld spawn, each toggleable.
- Ordered shape list with reorder and delete; rows show real X/Z and dimensions.
- Live “N of total regions would render” estimate from current world measurements.
- Drag/pointer editing plus complete keyboard/form alternatives.
- Output semantics identical to local rendering, standalone CLI, and Actions. Reuse one serializer/evaluator; do not create a fourth interpretation in Vue.
- Every destructive shape delete/reset uses the existing confirmation threshold appropriate to that action.

### 14.5 Save and close

- Dirty state feeds the Work job chip and close guard.
- Save validates all affected files, shows the exact plan, and uses the existing revision/write service.
- Partial writes follow current transactional/recovery semantics; do not simplify them for UI convenience.
- Revert-to-default changes the field to the generated default and remains a dirty change until saved or abandoned.
- Error focus routes from Problems to the exact node/group/field.

## 15. Existing settings and specialized surfaces that must remain reachable

### 15.1 Settings rows

Preserve and surface real implementations for:

- Theme: dark, light, contrast.
- Notice duration: current defined levels.
- Download concurrency: current 1–8 contract.
- Product display name.
- Dependency fetch/verification.
- Java runtime provisioning.
- Mojang download consent.
- GitHub CLI/account state.
- Updates, startup recovery, and migration.

State chips use live values; prototype examples such as “Declined,” “Bundled 21,” or “Signed out” are not defaults to hard-code.

### 15.2 Structured editors, not boolean toggles

Where the current public contract contains structure, the Settings row opens the real editor:

- **Scheduled language and appearance** — ordered, versioned rules with setting, weekday chips, time window, timezone, optional bounded gate, reorder, enable/disable, and plain-language summary. First match wins; an off gate falls through. Existing secret/session-memory rules remain.
- **Display and ease of use** — page zoom/interface size, motion selection, contrast scheme, focus-ring thickness, minimum target, cursor affordance, and live preview using current contracts.
- **Where the panels sit** — per panel-class placement/size/reset and global reset, all viewport-bounded and keyboard-movable.

Do not reduce these to toggles because the prototype row is compact.

### 15.3 Language, tone, narrator, and restricted mode

Use current checked-in contracts and tests. Where present:

- English, Hong Kong Cantonese, and bilingual modes.
- Two independent funny-level controls, each 1–5.
- Security, destructive, financial, accessibility, and error facts remain exact at every tone.
- Narrator off by default; English then Cantonese when Both; serialized queue; replacement/debounce/cooldown behavior; errors plain and not rate-suppressed; screen-reader/reduced-sound/quiet-hour cooperation.
- Restricted/shared mode uses its current sanitized shared-record and unlock interface. The current chosen name replaces shipped copy on every user-facing and accessible surface. Hidden capabilities are removed from catalogue search, palette, notifications, previews, and routes while active; prior settings are retained for restoration.

If these contracts are absent from the public checkout, do not invent their storage, credential, or cross-app implementation. Account for the catalogue definitions through capability metadata and document the boundary.

### 15.4 Render surfaces

Re-host and deep-link to the existing real components for:

- Live speed control while a render is running.
- Container offers with digest-first evidence.
- Interrupted renders and resume behavior.
- Render throughput and per-stage progress detail.
- Repair panel with evidence shown before a proposed edit.
- Render console.

All deep reveals must open the Renders job and focus the existing surface, not create parallel implementations.

### 15.5 Super confirmation and action artwork

- Every current destructive action still goes through the existing two-key/full-travel/emergency-exit safety contract where that contract applies.
- Name consequences before the final action and retain semantic artwork alt text.
- A Set up & help feature row opens safe documentation or an existing non-armed explanation. It must not stage a real deletion/publish stop merely to demonstrate the component.
- Preserve current exemptions for ordinary non-destructive close/back actions. Do not over-apply the destructive gate.

## 16. Served viewer parity

The embedded server and standalone CLI continue serving the same viewer package. Extend `design/packages/viewer/src/materialShell.*`; do not fork a separate Worldlens viewer.

### 16.1 Browser shell

A browser visitor receives:

- The same live map canvas/scene package.
- Same Material roles, shapes, type, motion, map control bar, map menu, markers, and appearance semantics.
- No Electron title bar.
- No Home or Work destination.
- The rail collapses to the map-menu/map-picker control appropriate to the compact browser shell.
- Map menu becomes a bottom sheet at phone widths.
- Coordinate fields/control bar wrap without clipping.
- Every target remains at least 48 px.
- Dark fresh default with light/contrast reachable; existing stored `bluemap-*` theme wins.

### 16.2 One canonical token output

The current viewer shell must stop owning a miniature hard-coded color vocabulary.

- Keep the existing roles in `ui/src/styles/md3.scss` and schemes in `ui/src/vuetify.ts` canonical.
- Produce or import a build artifact/SCSS partial generated from that canonical source so the framework-neutral viewer consumes the same role values without importing Vue/Vuetify runtime.
- Do not manually copy hex values into `materialShell.ts` or a second CSS file.
- Add a token-identity test that fails when desktop and viewer role outputs diverge.
- “Byte-identical” means the emitted canonical role definitions come from one source; do not create two synchronized-by-hand files.

### 16.3 Local assets and requests

- Roboto, Roboto Mono, icons, and images are bundled locally through the existing package asset pipeline.
- Remove/avoid Google Fonts links, CDN scripts, remote icons, analytics, and third-party boot requests.
- Same-origin map metadata/tile requests are expected. Add a browser test asserting no request leaves the local/test origin during shell boot and normal map interaction.
- Keep the `bluemap-*` local-storage namespace for theme, density/message style, pinpoints, and current viewer state. Do not invent `worldlens-viewer-*` duplicates unless a current migration contract requires it.

### 16.4 Static handler and compression

Preserve and test:

- Path confinement/traversal rejection.
- ETag and conditional response behavior.
- Correct MIME/content headers.
- No new server-side rendering route.
- `client-decompression` enabled for published output.
- A compressed tile path returns 200 and valid gzip bytes.
- The corresponding unsuffixed missing path returns 404.

Verify locally through the existing handler/test harness. Do not publish to an external proof repository unless the existing authorized workflow and credentials are explicitly available.

### 16.5 Browser-only terrain context menu

Where the current public viewer contract supports it:

- Right-click only over raycast-loaded terrain opens an anchored M3 context menu.
- Actions: Add pinpoint here; copy coordinates; cancel.
- Pinpoint coordinates match the hit point and persist locally under `bluemap-*` state.
- Escape/cancel closes and restores focus appropriately.
- Provide a keyboard-accessible alternative through the map menu or focused map interaction; do not make the feature pointer-only.
- No server write and no token exposure.

### 16.6 Viewer gates

Add/extend tests for shell mount, dark fresh default, stored theme, collapsed rail, 360/390/414 px layouts, bottom sheet, wrapping controls, context menu anchor/hit behavior, coordinate copy, pinpoint persistence, canonical token identity, local-only assets/requests, and static gzip behavior. Build shared/canonical assets before viewer as the workspace requires.

## 17. Material Design 3 visual contract

Do not introduce a new color, shape, typography, elevation, state, or motion token. Use existing role names and current helpers.

### 17.1 Color roles

| Use | Existing role(s) |
| --- | --- |
| Window/background/rail | `background`, `surface` |
| Cards and Work chrome | `surface-container`, border `outline-variant` |
| Card hover | `surface-container-high` |
| Active rail pill, hero, completed wizard step | `primary-container`, `on-primary-container` |
| Primary action/progress/badge | `primary`, `on-primary` |
| Secondary catalogue icon treatment | `secondary-container`, `on-secondary-container` |
| Share/unsaved emphasis | `tertiary-container`, `on-tertiary-container` |
| Problems/destructive | `error-container`, `on-error-container` |
| Prose | `on-surface-variant` |
| Meta/disabled | `outline` |

The prototype's hex values are reference only. No production component should copy them directly.

### 17.2 Shape

| Element | Existing token |
| --- | --- |
| Native window caption buttons | `corner-none` |
| Job chips/field chrome | `corner-sm` / `corner-md` |
| Catalogue cards/panels/notification panel | `corner-lg` (16 px) |
| Command palette | `corner-xl` (28 px) |
| Buttons/chips/rail pills/badges | `corner-full` |

### 17.3 Typography

- Roboto throughout.
- Roboto Mono for paths, values, keys, digests, commands, coordinates, timestamps, and shortcuts.
- Home/catalogue headline: `headline-medium` (reference 32/40).
- Job title: `headline-small` (reference 26).
- Hero title: `title-large`; other card titles `title-medium`.
- Feature/setting title: `title-small`.
- Body prose: `body-medium`, reference 14/21, readable measure 68ch.
- Row/field explanation: `body-small`, reference 13/20.
- Meta/status/mono values: `label-medium`, reference 12.

Use the existing type ramp classes/mixins. Do not set one-off pixel typography throughout components.

### 17.4 Density and geometry

- Comfortable density.
- Minimum target 48 px for every rail item and row action.
- Catalogue rows: 18 px vertical padding.
- Settings sections: 18 px spacing/padding according to current component structure.
- Title bar: 36 px.
- Rail: 80 px.
- Active rail pill: 56 × 32.
- Home/catalogue content: about 1010 px max width with about 48 px desktop side padding.
- Settings drawer: nominal 560 px, clamped.
- Notification panel: nominal 420 px wide, max 560 px high, anchored near rail/footer and geometry-controlled.
- Desktop minimum: 800 × 600. Rail remains; catalogue grid becomes one column; job strip overflows rather than crushing labels.
- Prototype authored at 1440 × 900. Use that as the primary visual-comparison viewport, not as a fixed application size.

### 17.5 Motion, contrast, and text

- The existing global reduced-motion kill switch remains last in cascade and disables every transition/animation added here.
- Respect system/repository motion preference and structured motion setting.
- Contrast theme remains non-tonal and preserves the current maximum-contrast contract; rail, cards, focus, and job strip must pass its role tests, including the handoff's 21:1 target where that contract applies.
- Never rely on color alone for state.
- Explanatory prose uses `text-wrap: pretty` where supported with safe fallback.
- No new elevation vocabulary. Use existing surface/border hierarchy.

## 18. Localization, copy, search, and dynamic metadata

### 18.1 Translation and tone

Every new user-visible string, tooltip, empty state, accessible name, problem message, button, heading, feature name, meta label, and fallback passes through the current `t()`/copy system with an English fallback. Do not call `t()` once at module import and freeze the result; resolve translated copy reactively.

Cantonese, bilingual rendering, independent tone/funny levels, restricted-mode filtering, product display name, and personal vocabulary hooks must reach the shell through existing contracts. Preserve factual tokens and commands verbatim.

### 18.2 Upstream BlueMap translation trap

Do not add upstream BlueMap viewer keys to the app-owned catalogue just because their prefixes look local. The bundled upstream language files remain authoritative for those keys. Keep and extend the existing copy/catalogue coverage test so new shell keys are app-owned and upstream viewer keys are not shadowed.

### 18.3 Catalogue copy

- The Appendix B names and grouping are the approved information architecture.
- Blurbs are intent/reference. Prefer the first sentence of the matching current public documentation article when it is more accurate.
- Keep one sentence per feature row.
- Do not expose private repository names, private schema names, credentials, hostnames, or internal vocabulary.
- `{modeName}` is a runtime placeholder and must render the current chosen name from the actual public contract. Do not ship literal braces.

### 18.4 Dynamic metadata

The prototype contains illustrative state. Build `metaResolver`s against live stores/descriptors and omit meta when unavailable. Never hard-code these examples as product truth:

- settings/key/tab/section/article/proof/image/shape/step counts;
- folder, project, server, map, marker-set, or entry counts;
- running render count/progress/throughput;
- revision numbers;
- unread count;
- account sign-in state;
- consent state;
- Java/runtime version;
- update version/readiness;
- EULA acceptance;
- paths, times, digests, sizes, and timestamps.

Static explanatory labels such as “token-gated,” “off by default,” “two keys,” or `Ctrl+Shift+F` may be translated copy when they accurately describe current behavior. UI card counts always use array lengths even when the design contract test also asserts the five catalogue totals.

### 18.5 Search

Every existing and new search bar keeps the shared anchored regex builder. Do not create raw ad hoc text filtering in Home/Catalogue while other screens use the common component.

- Search source: translated current copy plus stable keys and safe metadata.
- Invalid regex shows inline validation and never throws.
- Highlight without `v-html`/unsanitized HTML.
- Capability/restricted-mode filtering happens before indexing/results so hidden terms do not leak.
- Command palette feature entries, Home search, catalogue search, settings search, options search, and Work tab finder call shared target/reveal actions rather than implementing separate navigation logic.
- Keep search responsive with memoized/indexed definitions and debounce only where the existing component does so. Locale/tone changes invalidate the translated index safely.

## 19. Accessibility and keyboard acceptance

Meet current accessibility tests and add explicit coverage for the new shell.

- App rail is a labelled `<nav>` with visible labels and `aria-current`.
- Provide a skip/focus path from title/rail to main destination content.
- Icon-only footer/map controls have accurate accessible names and tooltips that are not the sole name source.
- Focus indicators use existing tokens and remain visible in all three themes.
- Home cards and catalogue rows are semantic buttons/links, not click-only `<div>` elements.
- Work tab keyboard behavior, roving focus, Home/End/arrows, context menu, and move alternatives remain intact.
- Drag operations in tabs, groups, panel geometry, and masks have keyboard-equivalent controls.
- Drawers/dialogs/sheets expose correct role/name, make underlying content inert when modal, close via Escape when safe, and return focus to opener.
- Status uses polite live semantics. New blocking errors may use assertive semantics only when current accessibility conventions allow it. Do not announce every progress tick.
- Problems actions focus the exact source surface/field and announce the transition.
- Notification selection exposes selected state, tri-state select-all, filter counts, and disabled actions.
- Severity and active/completed/dirty state use text/icon/ARIA in addition to color.
- 200% zoom and the repository's supported text scaling do not clip controls or force two-dimensional page scrolling.
- At 800 × 600, keyboard users can reach all rail, strip, pane, and footer controls without focus disappearing behind panels.
- Served viewer works with keyboard for menu, controls, map alternatives, context actions, and bottom sheet.
- Narrator yields to active screen-reader behavior according to the existing contract.

Use behavior-level accessibility assertions (roles, names, focus, keyboard, inert state) in addition to automated axe/static checks. Snapshots alone are insufficient.

## 20. Error, notice, and problem presentation

Adopt one consistent policy:

1. **Inline first.** Validation/runtime errors remain beside the field/action/surface that produced them.
2. **Status second.** The status strip summarizes active rendering and unresolved problem count without covering content.
3. **Problems on request.** The bottom Problems panel aggregates and routes to sources.
4. **History always.** Notices enter the bell/history store. They do not pop over content.
5. **Reflowing exceptional banners.** Existing update/recovery/consent/onboarding surfaces may appear when their real state requires them, but they occupy layout space and never masquerade as toasts.

Do not turn every informational notice into a Problem. Define adapters by severity/actionability and preserve existing audit/history semantics. Avoid duplicate user messages generated independently by inline, notice, and problem layers; derive views from one event/source where practical.

When a remedy exists, it must be real and specific: open settings section, reveal project field, open Renders repair evidence, retry through the existing service, or open docs. A generic “Fix” button that only dismisses the item is not a remedy.

## 21. Implementation phases and required intermediate gates

Implement in small coherent phases. Keep the branch buildable after each phase.

### Phase 0 — Baseline and contracts

- Read instructions/docs/tests.
- Inventory pages/jobs/stores/overlays/tokens/viewer.
- Extract archive to ignored temp and render/inspect approved target offline.
- Record baseline commands/screenshots/failures.
- Add no production behavior yet.

Gate: baseline tests relevant to tab navigation, app shell, viewer shell, themes, copy, and static handler.

### Phase 1 — Typed manifest, registry, shell state, migration

- Add catalogue definitions, feature targets, availability, job registry, target activation controller.
- Implement versioned workspace migration and fresh seed.
- Add unit tests for 85 unique features, five counts, all targets, legacy-page coverage, migration, and dynamic metadata contracts.
- Add only minimal backwards-compatible `TabbedNavigation` host APIs.

Gate: typecheck plus focused manifest/migration/tab contract tests.

### Phase 2 — Rail, Home, and catalogue pages

- Build `AppRail`, `HomeCatalogues`, `CataloguePage`.
- Wire palette/settings/notifications and feature activation.
- Implement responsive geometry, copy, search/regex, focus, and themes.
- Replace old Home discovery UI.

Gate: focused component/a11y tests and 1440/800 screenshots in dark/light/contrast.

### Phase 3 — Work re-host and job lifecycle

- Add `WorkPane` around the existing tab system.
- Map legacy screens to jobs, preserve groups/search/context/docking.
- Wire `+`, ensure/reveal, dirty close, pinned wizard, open-job badge.
- Remove Home/Map from production tab discovery.

Gate: unchanged tab contract script, Work tests, migration E2E, each job open/close/reveal.

### Phase 4 — Map shell, status, notifications, problems, overlays

- Keep canvas mounted and destination-gated.
- Restyle/reposition map controls without feature loss.
- Add status strip, Problems panel, notification presentation.
- Remove shell FABs/toasts; preserve stores/APIs.
- Re-host settings/config/palette/onboarding/banners with focus and geometry.

Gate: map mount persistence, notification/problem behavior, no-FAB/no-unprompted-overlay checks, screenshots.

### Phase 5 — Project editor and deep reveals

- Make Projects the primary New map path.
- Complete chooser, three-pane editor, generated defaults, FieldMeta rendering, save plan, CLI resolution, mask integration.
- Deep-link every relevant catalogue feature to existing project/render/settings surfaces.

Gate: schema enumeration, defaults, CLI branch tests, mask equivalence, save/dirty/reveal tests.

### Phase 6 — Served viewer parity

- Refactor viewer shell to canonical token output.
- Implement compact/browser behavior, local assets, context menu, storage, static bundle integration.
- Preserve handler security/compression.

Gate: viewer tests, shared then viewer build, local request audit, gzip/404 proof, 360/390/414 screenshots.

### Phase 7 — Localization, accessibility, responsive, motion, contrast

- Finish all `t()` fallbacks and copy coverage.
- Restricted/capability filtering.
- Keyboard/focus/inert/drag alternatives.
- 800 × 600, zoom, phone widths, reduced motion, all themes.

Gate: copy/localization facts, axe/behavior tests, contrast/token tests, reduced-motion assertions.

### Phase 8 — Full gates, screenshots, docs, cleanup

- Recapture required screenshot baselines.
- Run full lint/typecheck/build/test/CI/screenshot checks.
- Update `design/HANDOFF.md` with exact implementation state, migration, tests, and honest remaining blockers.
- Remove temporary extracted reference from tracked/untracked output.
- Review diff for prototype code, raw hex, external URLs, hard-coded demo values, accidental private data, and unrelated changes.

Gate: all completion commands and manual acceptance checklist.

When parallel agents are allowed by repository instructions, install/bootstrap once, use no more than 3–4 isolated agents per wave, allocate non-overlapping file domains, integrate each wave, and run its gate before the next. Do not let agents concurrently edit `App.vue`, tab persistence, token source, or lockfiles.

## 22. Test plan

Use the repository's current runner and helpers. Favor behavioral tests over source-string checks, but keep policy/contract tests where source analysis is the established approach.

### 22.1 Manifest/navigation tests

- Exactly five catalogue IDs: `make`, `maps`, `share`, `copy`, `setup`.
- Counts derive from arrays and equal 28/6/6/7/38 for the approved manifest; total 85.
- Every feature key globally unique even when several rows target the same job.
- Every target resolves to a real job, rail destination, existing overlay, work action, docs article, or explicit capability gate.
- No feature uses its repeated prototype target token as the stable feature key.
- All legacy pages/surfaces covered.
- Cold-start route to each normal feature no more than three activations.
- Restricted/capability filters remove names from Home, catalogue, palette, and search without destroying stored settings.
- Dynamic metas read live fixtures rather than constants.

### 22.2 Shell/component tests

- Rail active state, open-job badge, unread badge, footer emits, accessible labels, keyboard, 80 px contract.
- Hero body/primary/secondary actions do not cross-fire.
- Four-preview cap and live counts.
- Catalogue grouping, row activation, search, invalid regex, focus stability, narrow wrapping.
- Map remains mounted; opaque destinations block pointer/a11y interaction.
- Work `+` returns Home; no blank job.
- Pinned wizard no close; dirty job guard; deterministic focus after close.
- Status uses active-render source; Work badge does not.
- Notifications never auto-open; filters/counts/select-all/bulk actions/redaction.
- Problems aggregate source errors and route to exact remedies.
- Escape/focus return/inert behavior for all overlays.

### 22.3 Tabbed-navigation regression

Run the existing component tests and contract script unchanged. Add tests only for new seed/default placement/readonly workspace exposure and migration. Verify every capability listed in Section 13.

### 22.4 Project editor tests

- Enumerate every current schema `FieldMeta` and CLI flag; each appears exactly once in its node.
- No hand-written field inventory controls rendering.
- Generated defaults populate every field correctly.
- Changed/revert/dirty state and save plan.
- `invalidatesTiles` badges and accurate consequence computation.
- CLI resolver combinations and visible command.
- Render-mask entry from node and field; five shapes; add/subtract order; reorder/delete; measured bounds/spawn; estimate; serializer/evaluator equivalence with CLI/Actions.
- Chooser discovery, unplugged paths, remote source routes, focus and keyboard.

### 22.5 Theme/token/style tests

- Missing theme → dark; stored light/contrast unchanged.
- Existing `vuetify` token tests remain green.
- No new token role names.
- No raw prototype hex values in new components except approved test fixtures/comments that do not ship.
- Viewer/desktop emitted role identity.
- Local fonts/icons only; no Google Fonts/CDN URLs.
- Reduced-motion global rule remains last and covers added transitions.
- Contrast/focus role checks.
- No `VFab`/shell floating destination controls and no toast presentation.

### 22.6 Viewer/server tests

- Framework-neutral shell mount and no Vue/Electron runtime import.
- Compact breakpoints 360/390/414 and desktop.
- Bottom sheet/control wrapping/48 px targets.
- Context menu terrain hit, position, copy, pinpoint, persistence, cancel/keyboard alternative.
- No external requests.
- `bluemap-*` storage/migration.
- Path confinement, ETag, compression 200/gzip magic, unsuffixed 404.

### 22.7 Localization/a11y tests

- Every new copy key has fallback and catalogue coverage.
- Upstream BlueMap keys not shadowed.
- English/Cantonese/bilingual/tone fixtures render shell copy and preserve required facts.
- Runtime chosen restricted-mode name replaces shipped placeholder everywhere the public contract applies.
- Narrator behavior remains under existing tests.
- Roles/names/focus/keyboard/inert/selection/live-region behavior.
- 200% zoom and 800 × 600 reflow.

### 22.8 Performance/regression tests

- Map initialization count unchanged across navigation.
- One active-render aggregation/subscription.
- No unbounded watchers/listeners after repeated open/close.
- Heavy unopened jobs are not unnecessarily mounted if current architecture supports lazy/kept-alive behavior.
- Search index recomputes only on relevant manifest/locale/capability changes.
- No memory leak from panel geometry/ResizeObserver/event listeners.

## 23. Screenshot and visual verification matrix

Use deterministic local fixtures, stable clock/data, local assets, and the current screenshot harness. Compare the production app to `Worldlens.dc.html` for structure and hierarchy at 1440 × 900; do not chase text anti-aliasing by copying prototype CSS or hex.

Desktop captures required at minimum:

| Surface/state | Viewport/theme |
| --- | --- |
| Home root, empty search | 1440 × 900 dark; light; contrast |
| Home search results | 1440 × 900 dark |
| Make a map catalogue | 1440 × 900 dark |
| One catalogue with long metadata/blurb wrapping | 800 × 600 dark |
| Work fresh pinned wizard | 1440 × 900 dark |
| Work with grouped/overflowing jobs | 1440 × 900 dark; 800 × 600 dark |
| Tab strip docked left/right/bottom | representative desktop capture or focused geometry tests |
| Wizard step/progress and consent error | 1440 × 900 dark |
| Projects chooser | 1440 × 900 dark |
| Project editor with changed invalidating field and save plan | 1440 × 900 dark |
| Render mask | 1440 × 900 dark |
| Renders progress/console/speed/interrupted/repair | representative captures |
| Map with control bar/menu picker | 1440 × 900 dark; 800 × 600 dark |
| Settings drawer | 1440 × 900 dark; contrast |
| Config/options editor and save plan | 1440 × 900 dark |
| Command palette | 1440 × 900 dark |
| Notification panel with filters/selection | 1440 × 900 dark |
| Problems panel with multiple severities/actions | 1440 × 900 dark; 800 × 600 dark |
| Update/recovery/status strip stacking | 1440 × 900 dark |
| Reduced motion state | assertion plus representative capture if harness supports it |

Served viewer captures:

| Surface/state | Viewport |
| --- | --- |
| Default map shell | 1440 × 900 |
| Compact map shell | 414 × 896 |
| Compact bottom-sheet menu | 390 × 844 |
| Minimum phone/context menu | 360 × 640 |
| Light and contrast themes | representative desktop/phone |
| Marker/pinpoint/context menu | representative phone and desktop |

Recapture existing `shell-*`, `menu-*`, `settings-*`, and `config-*` baselines whose intentional shell geometry changes. Add explicit `home-*`, `catalogue-*`, `work-*`, `map-*`, `notifications-*`, and `problems-*` names. Keep old before-state screenshots only when the repository intentionally stores historical evidence; otherwise do not leave duplicate stale baselines.

## 24. Command gates

Use the exact commands declared in the current root/design package manifests. At authoring time the expected shape is:

```bash
# From repository root
node scripts/bootstrap.mjs --check

# From design/ when that is the workspace root
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
pnpm screenshots:check
```

Also run focused package gates during development, for example the current equivalents of:

```bash
pnpm --filter @worldlens/ui typecheck
pnpm --filter @worldlens/ui test
pnpm --filter @worldlens/shared build
pnpm --filter @worldlens/viewer test
pnpm --filter @worldlens/viewer build
```

Do not assume these exact script names if the checked-out manifest differs. Record the resolved commands and results in the final report. Run formatting/lint according to repository order and avoid formatting unrelated files.

Before declaring completion, run:

- full repository lint;
- full typecheck;
- full build;
- full tests/CI suite required by `AGENTS.md`;
- unchanged tab-contract script;
- screenshot verification;
- local served-viewer/static-handler proof;
- `git diff --check`;
- final `git status --short` and diff review.

## 25. Definition of done checklist

- [ ] Current repository instructions and baseline were read/recorded.
- [ ] Approved archive target inspected; rejected shell concepts not used.
- [ ] Home/Map/Work rail implemented with 80 px rail and footer search/bell/settings.
- [ ] Work badge derives from open jobs; Renders/status derive from active renders.
- [ ] Home contains the five catalogue cards and approved search behavior.
- [ ] Hero New map opens Projects; secondary opens wizard; body opens Make catalogue.
- [ ] All 85 feature definitions exist with unique keys and resolvable/capability-gated targets.
- [ ] Every 12-page legacy capability is reachable in no more than three activations from cold start.
- [ ] Home/Map removed from tab workspace; live map remains shell-mounted.
- [ ] Fresh Work seed is pinned wizard/top; customized legacy workspaces migrate without data loss.
- [ ] `TabbedNavigation` keeps docking, groups, pinning, reorder, overflow, four searches, bulk close, context menu, persistence, and geometry; existing contract script unchanged and green.
- [ ] Only open jobs show in Work; `+` goes Home; dirty close is guarded.
- [ ] No shell FABs and no unprompted toast/notification overlay.
- [ ] Settings/config/palette/onboarding/update/recovery/safety behavior preserved and re-hosted.
- [ ] Status strip, Problems panel, notification history panel use real sources and accessible behavior.
- [ ] Project editor is primary New map path and uses generated defaults plus live `FieldMeta`/CLI/mask sources.
- [ ] Every invalidating field is badged and save consequences are accurate.
- [ ] Render mask semantics match local, CLI, and Actions.
- [ ] All settings/render/deep-link surfaces in this specification remain reachable.
- [ ] New strings are localized with fallbacks; upstream viewer translations are not shadowed.
- [ ] Private/cross-app capabilities are implemented only through existing sanitized public contracts; no fake integrations or leaks.
- [ ] Fresh theme dark; stored light/contrast preserved; no new token vocabulary.
- [ ] Local Roboto/Mono/icons/assets; no external UI dependency.
- [ ] Reduced motion, contrast, 48 px targets, keyboard, focus, inert, and 800 × 600 behavior pass.
- [ ] Served viewer uses canonical token output, compact layouts, `bluemap-*` storage, no external requests, and unchanged static-handler security/compression.
- [ ] Screenshot matrix recaptured and approved against the target structure.
- [ ] Full lint/typecheck/build/test/CI/screenshot gates run and truthfully reported.
- [ ] `design/HANDOFF.md` documents implementation, migration, tests, and real deviations.
- [ ] No reference archive/prototype runtime, static map replacement, demo counts, credentials, private data, or unrelated refactor is committed.

## 26. Prohibited shortcuts and failure modes

Do not:

- paste `Worldlens.dc.html`, `support.js`, or its inline CSS into the Vue app;
- ship Google Fonts/Material Symbols network links;
- use the prototype's map screenshot instead of the viewer;
- create a second token file with copied hex values;
- add a new store containing the same open tabs, render count, notifications, or errors as an existing store;
- show all possible jobs as tabs to avoid implementing ensure/open behavior;
- seed over a user's customized workspace or clear `localStorage`;
- hard-code 107, 154, running counts, versions, revisions, unread counts, paths, account states, or timestamps;
- use raw prototype target IDs as feature keys, because repeated targets would collide;
- add unavailable private features as decorative cards or fake connected status;
- expose hidden/restricted terms in search, palette, accessible names, notifications, or screenshots;
- replace a structured settings editor with a switch;
- route every feature to the top of a generic page without implementing deep reveal where an existing surface is named;
- arm a destructive action from the Super confirmation catalogue row;
- remove safe Cancel/Escape behavior to satisfy the “close jobs only” visual rule;
- use arbitrary `setTimeout` calls for mounting/reveal coordination;
- add nested page scrolling or horizontal shell scrolling;
- introduce a FAB-shaped destination shortcut under another name;
- make notification arrivals open a panel or toast automatically;
- hide a failing test, lower coverage, update broad snapshots blindly, or claim a gate passed without output;
- publish/deploy/create repositories as part of validation without explicit existing authorization;
- commit the extracted ZIP or rejected concept shells.

## 27. Required completion report

At the end, provide a concise but evidence-based report in this exact structure:

```markdown
## Summary
- What changed in the shell, Work workspace, project entry/editor, and served viewer.

## Key files
- Grouped list of new and materially changed files with one-line purpose.

## Persistence and migration
- Old storage version/key, migration behavior, fresh seed, customized-workspace preservation, and tests.

## Feature accounting
- Catalogue totals and any optional/capability-gated definitions not exposed, with the exact public-contract reason.

## Visual evidence
- Screenshot names/viewports/themes and notable comparison results.

## Verification
- Exact command: PASS/FAIL/NOT RUN, with relevant output summary.

## Deviations or blockers
- Only genuine differences from this specification, why, and the source that required the difference.

## Working tree
- Final `git status --short`, commits made when required, and confirmation that no reference/private artifacts were added.
```

Do not use “should pass,” “likely,” or “appears green” in place of observed results.

# Appendix A — Uploaded archive inventory

The original uploaded ZIP contains 19 entries:

| Path | Role in this task |
| --- | --- |
| `.thumbnail` | Preview only. |
| `HANDOFF.md` | Detailed target behavior and design handoff. |
| `Worldlens.dc.html` | **Only approved interactive target prototype.** |
| `ShellA-Console.dc.html` | Non-authoritative concept study. |
| `ShellB-Atlas.dc.html` | Non-authoritative concept study. |
| `ShellC-Workbench.dc.html` | Non-authoritative concept study. |
| `support.js` | Prototype runtime; never production code. |
| `assets/action-artwork.png` | Visual/action-art reference; prefer existing canonical production asset. |
| `assets/map-render.png` | Static map visual fixture; never ship as live viewer replacement. |
| `assets/worldlens-logo-256.png` | Brand reference; current canonical repo branding wins. |
| `ref/chrome-titlebar.png` | Existing/before-state reference. |
| `ref/config-screen.png` | Existing/before-state reference. |
| `ref/menu-root.png` | Existing/before-state reference. |
| `ref/projects-screen.png` | Existing/before-state reference. |
| `ref/settings-drawer.png` | Existing/before-state reference. |
| `ref/shell.png` | Existing/before-state reference. |
| `ref/tab-strip.png` | Existing/before-state reference. |
| `ref/wizard-1-world.png` | Existing/before-state reference. |
| `uploads/pasted-1786236592157-0.png` | Supporting pasted visual; inspect only if the approved handoff references it. |

# Appendix B — Canonical five-catalogue feature manifest

This appendix is the approved feature-accounting contract. Production code should encode it as typed data, not scrape this Markdown or the prototype DOM. Counts displayed in UI come from arrays; dynamic metadata comes from live resolvers. The prototype target token is included only to trace the mockup. The semantic production route is the required intent and must be mapped to the actual current component/API identifiers.

| Catalogue | Approved feature count |
| --- | ---: |
| **Make a map** (`make`) | 28 |
| **Your maps** (`maps`) | 6 |
| **Share a map** (`share`) | 6 |
| **Keep a copy** (`copy`) | 7 |
| **Set up & help** (`setup`) | 38 |
| **Total** | **85** |

## B.1 Make a map (28)

**Catalogue intent:** Turn a Minecraft world into a browsable 3D map, and everything that decides how that render is set up, where it runs, what it needs from this machine, and what it is doing right now.

### Finding a world

1. **The project editor**
   - Stable feature key: `make.finding-a-world.the-project-editor`
   - Prototype target token: `projects`
   - Required semantic route: `job:projects/reveal=chooser`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `default · 107 settings`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Where a map is made and everything about it is set. It opens on BlueMap's own generated defaults, so every setting is present and editable from the first second, and the render mask is drawn right here.

2. **The guide**
   - Stable feature key: `make.finding-a-world.the-guide`
   - Prototype target token: `wizard`
   - Required semantic route: `job:wizard/reveal=step-1`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `5 steps`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The five-question version of the same thing, for a first map. It writes a project, which is then edited in the project editor like any other.

3. **Project world discovery**
   - Stable feature key: `make.finding-a-world.project-world-discovery`
   - Prototype target token: `projects`
   - Required semantic route: `job:projects/reveal=world-discovery`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `2 folders`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Finds worlds automatically in the default Minecraft folder and in any launcher root you mount, including every CurseForge instance inside one.

4. **Dimension detection**
   - Stable feature key: `make.finding-a-world.dimension-detection`
   - Prototype target token: `wizard`
   - Required semantic route: `job:wizard/reveal=world-selection`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The dimensions offered come from the world itself and its region counts, rather than from a list of vanilla defaults.

5. **Legacy 1.12.2 worlds**
   - Stable feature key: `make.finding-a-world.legacy-1-12-2-worlds`
   - Prototype target token: `wizard`
   - Required semantic route: `job:wizard/reveal=world-selection`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Worlds as old as 1.12.2 are read through their own chunk decoder and their legacy resource jar.

6. **Bedrock worlds**
   - Stable feature key: `make.finding-a-world.bedrock-worlds`
   - Prototype target token: `wizard`
   - Required semantic route: `job:wizard/reveal=world-selection`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Bedrock saves are read as well as Java ones, through the LevelDB container rather than region files.

### Setting up a render

7. **Projects on this machine**
   - Stable feature key: `make.setting-up-a-render.projects-on-this-machine`
   - Prototype target token: `projects`
   - Required semantic route: `job:projects/reveal=chooser.projects`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `1 project`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: A project is one file at the root of a Minecraft world, holding every map, storage and setting that world renders with. Open one to change anything before a render runs, or run it again exactly as it was.

8. **Render mask drawing**
   - Stable feature key: `make.setting-up-a-render.render-mask-drawing`
   - Prototype target token: `mask`
   - Required semantic route: `job:projects/reveal=map.render-mask`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `5 shapes`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Draws every BlueMap mask shape over measured region bounds and the real overworld spawn, with identical local, CLI and Actions semantics.

9. **Live render speed**
   - Stable feature key: `make.setting-up-a-render.live-render-speed`
   - Prototype target token: `wizard`
   - Required semantic route: `job:wizard/reveal=render-speed`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `5 levels`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: One dial for how hard BlueMap leans on this machine, over several raw settings at once — changeable while a render is running.

10. **The path field**
   - Stable feature key: `make.setting-up-a-render.the-path-field`
   - Prototype target token: `options`
   - Required semantic route: `overlay:config/reveal=path-field`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Every folder field checks what you gave it as you type, says what it found, and never silently accepts a path that is not there.

11. **Scheduled render**
   - Stable feature key: `make.setting-up-a-render.scheduled-render`
   - Prototype target token: `wizard`
   - Required semantic route: `job:projects/reveal=render-schedule`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Runs a project again on a timetable, by date, time, weekday and timezone.

### Where it runs

12. **Docker or this machine**
   - Stable feature key: `make.where-it-runs.docker-or-this-machine`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=runtime.local-container`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: One render plan that resolves to a container or to the local runtime, with the same semantics either way.

13. **Remote rendering over SSH**
   - Stable feature key: `make.where-it-runs.remote-rendering-over-ssh`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=runtime.ssh`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Runs the render on another machine, with host-key handling and a preflight that fails before anything is copied.

14. **Rendering in GitHub Actions**
   - Stable feature key: `make.where-it-runs.rendering-in-github-actions`
   - Prototype target token: `runners`
   - Required semantic route: `job:runners/reveal=actions`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `sharded`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Hands the whole render to GitHub's runners, sharded and resumable, then downloads and registers the result here.

15. **Disposable cloud CI**
   - Stable feature key: `make.where-it-runs.disposable-cloud-ci`
   - Prototype target token: `runners`
   - Required semantic route: `job:runners/reveal=runner-selection`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Builds, tests, packages, publishes and deploys on explicit standard GitHub-hosted Linux and Windows runners.

16. **CI repository setup**
   - Stable feature key: `make.where-it-runs.ci-repository-setup`
   - Prototype target token: `runners`
   - Required semantic route: `job:runners/reveal=repository-setup`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Creates and configures the repository a cloud render needs, with the secrets it needs and nothing more.

17. **Large worlds**
   - Stable feature key: `make.where-it-runs.large-worlds`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=large-world-strategy`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Sharding, region bounds and vertical slices, so a world too big for one run finishes across several.

### While it runs

18. **Renders in progress**
   - Stable feature key: `make.while-it-runs.renders-in-progress`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=active-renders`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `1 running`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Every render this application started — local, container, SSH or GitHub — in one list, with the console for each.

19. **The render console**
   - Stable feature key: `make.while-it-runs.the-render-console`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=console`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Annotated engine output rather than a raw log: what each line means and what it implies for the run.

20. **Resumable renders**
   - Stable feature key: `make.while-it-runs.resumable-renders`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=interrupted`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: An interrupted render keeps the tiles it already wrote and picks up where it stopped, on any of the four places it runs.

21. **Live speed control**
   - Stable feature key: `make.while-it-runs.live-speed-control`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=live-speed`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `while it runs`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The speed dial is changeable mid-render: the engine picks the new thread count and cache size up without the run restarting.

22. **Container offers**
   - Stable feature key: `make.while-it-runs.container-offers`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=container-offers`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `Docker`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: When a container image that can render this world is already on the machine, it is offered rather than a fresh pull — with the image digest named before anything runs.

23. **Interrupted renders**
   - Stable feature key: `make.while-it-runs.interrupted-renders`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=interrupted`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: A render the app did not finish is listed on next launch with what it had already written, and can be resumed or discarded.

24. **Render throughput**
   - Stable feature key: `make.while-it-runs.render-throughput`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=progress-detail`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `tiles/min`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Live tiles-per-minute and a per-stage breakdown, so a render that has slowed down says so rather than just taking longer.

25. **Automatic repair**
   - Stable feature key: `make.while-it-runs.automatic-repair`
   - Prototype target token: `renders`
   - Required semantic route: `job:renders/reveal=repair-evidence`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `guarded`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Diagnoses a failed render and proposes an edit, behind guardrails, showing its evidence before it changes anything.

### What it needs

26. **Java runtime provisioning**
   - Stable feature key: `make.what-it-needs.java-runtime-provisioning`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=java-runtime`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `Temurin 21`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Provisions a suitable Java for the engine if this machine has none, without installing anything system-wide.

27. **Dependency provisioning**
   - Stable feature key: `make.what-it-needs.dependency-provisioning`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=dependencies`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Fetches and verifies the engine jar and every other dependency a render needs, with digests checked before use.

28. **Mojang download consent**
   - Stable feature key: `make.what-it-needs.mojang-download-consent`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=download-consent`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `declined`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: One remembered answer about whether the app may download Minecraft's own client files, which BlueMap needs for textures and models.

## B.2 Your maps (6)

**Catalogue intent:** Maps rendered on this computer and BlueMap servers somebody else runs, in one list. Opening either is the same action, and the viewer never needs to know which it is looking at.

### The list

29. **Maps and servers**
   - Stable feature key: `maps.the-list.maps-and-servers`
   - Prototype target token: `servers`
   - Required semantic route: `job:servers/reveal=server-list`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `3 entries`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Every local render and every remote BlueMap server this application knows about, with fields for adding another.

30. **Remote BlueMap servers**
   - Stable feature key: `maps.the-list.remote-bluemap-servers`
   - Prototype target token: `servers`
   - Required semantic route: `job:servers/reveal=add-remote-server`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `token-gated`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Browses a map somebody else's server already rendered, through a token-gated embedded proxy that never exposes the token to the page.

### The viewer

31. **The viewer and its controls**
   - Stable feature key: `maps.the-viewer.the-viewer-and-its-controls`
   - Prototype target token: `map`
   - Required semantic route: `rail:map`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The three.js scene, the day and night switch, perspective, flat and free-flight modes, reset camera, live x and z position inputs, and a compass.

32. **Markers and marker sets**
   - Stable feature key: `maps.the-viewer.markers-and-marker-sets`
   - Prototype target token: `map`
   - Required semantic route: `rail:map/reveal=markers`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `4 sets`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The marker sets of the map that is loaded, and the live players set, in the map's own menu.

33. **Viewer settings**
   - Stable feature key: `maps.the-viewer.viewer-settings`
   - Prototype target token: `map`
   - Required semantic route: `rail:map/reveal=settings`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Resolution, render distance and free-flight sensitivity, remembered per visitor rather than per install.

34. **Server-hosted Material UI**
   - Stable feature key: `maps.the-viewer.server-hosted-material-ui`
   - Prototype target token: `preview`
   - Required semantic route: `job:preview/reveal=served-material-shell`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The same Material interface served to an ordinary browser by the standalone server, not only inside the desktop app.

## B.3 Share a map (6)

**Catalogue intent:** A finished render is a folder of static files. These are the places it can go, including one that never leaves this machine and one that never becomes public at all.

### Publishing

35. **Publish to GitHub Pages**
   - Stable feature key: `share.publishing.publish-to-github-pages`
   - Prototype target token: `pages`
   - Required semantic route: `job:pages/reveal=publish`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `verified`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Preflights the real render, publishes guarded static files, verifies the public address, and offers a two-key stop-hosting gate.

36. **Remote hosting**
   - Stable feature key: `share.publishing.remote-hosting`
   - Prototype target token: `pages`
   - Required semantic route: `job:pages/reveal=remote-hosting`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Any static host that can serve a folder, with client-side decompression enabled before publishing so compressed tiles resolve.

37. **Pages feature parity**
   - Stable feature key: `share.publishing.pages-feature-parity`
   - Prototype target token: `pages`
   - Required semantic route: `job:pages/reveal=parity-evidence`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `18 proofs`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The published site is the same Material application as the desktop one, and every applicable shared requirement names its evidence.

38. **Release workflow security**
   - Stable feature key: `share.publishing.release-workflow-security`
   - Prototype target token: `pages`
   - Required semantic route: `job:pages/reveal=workflow-security`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: What a publish workflow is allowed to touch, which secrets it sees, and why the release feed is unsigned but hash-checked.

### Without publishing

39. **Watch it live**
   - Stable feature key: `share.without-publishing.watch-it-live`
   - Prototype target token: `preview`
   - Required semantic route: `job:preview/reveal=live-preview`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `loopback`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Serves the render straight off this computer's own disk so it can be watched in a browser while it is still being rendered.

40. **Private worlds**
   - Stable feature key: `share.without-publishing.private-worlds`
   - Prototype target token: `pages`
   - Required semantic route: `job:pages/reveal=private-worlds`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `sealed`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Sealed before they leave the machine, rendered on public runners, published only privately.

## B.4 Keep a copy (7)

**Catalogue intent:** The ways a world or a render is put somewhere that is not this one machine — and the append-only history the app keeps beside itself, never inside your world folder.

### Sending a copy out

41. **Backups**
   - Stable feature key: `copy.sending-a-copy-out.backups`
   - Prototype target token: `backups`
   - Required semantic route: `job:backups/reveal=create-backup`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `500 MiB parts`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Packs a world or a rendered map, splits it into parts and publishes it as release assets, with digests a restore can check byte for byte.

42. **World git repository**
   - Stable feature key: `copy.sending-a-copy-out.world-git-repository`
   - Prototype target token: `worldrepo`
   - Required semantic route: `job:worldrepo/reveal=repository`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `incremental`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: A world kept in a git repository so it updates region by region instead of being re-zipped whole.

43. **Repository adoption**
   - Stable feature key: `copy.sending-a-copy-out.repository-adoption`
   - Prototype target token: `worldrepo`
   - Required semantic route: `job:worldrepo/reveal=adoption`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: A second computer that has never touched the world recognises it, its project and its maps without re-answering anything.

### Bringing a copy in

44. **World sources**
   - Stable feature key: `copy.bringing-a-copy-in.world-sources`
   - Prototype target token: `backups`
   - Required semantic route: `job:backups/reveal=world-sources`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Fetches a world from any GitHub release, including one split into parts in another repository, verifying each part's digest.

45. **SSH world sources**
   - Stable feature key: `copy.bringing-a-copy-in.ssh-world-sources`
   - Prototype target token: `backups`
   - Required semantic route: `job:backups/reveal=source.ssh`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Reads a world off another machine over SSH, with host-key handling and a preflight, rather than copying it by hand first.

46. **Docker world source**
   - Stable feature key: `copy.bringing-a-copy-in.docker-world-source`
   - Prototype target token: `backups`
   - Required semantic route: `job:backups/reveal=source.container`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Reads a world out of a running container's volume, so a server world does not have to be stopped and exported.

### History kept here

47. **Local version history**
   - Stable feature key: `copy.history-kept-here.local-version-history`
   - Prototype target token: `options`
   - Required semantic route: `overlay:config/reveal=history`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `revision 41`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: An append-only git history per config folder and per project, kept beside the app's data — never inside your folder.

## B.5 Set up & help (38)

**Catalogue intent:** Everything that is not making, viewing, sharing or copying a map: this application's own preferences, BlueMap's 154 configuration options, the interface's own behaviours, and every documentation article, offline.

### Configuration

48. **Settings**
   - Stable feature key: `setup.configuration.settings`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `15 sections`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Mojang download consent, Java runtime, where rendered maps go, world folder, GitHub account, render memory and more.

49. **Options editor**
   - Stable feature key: `setup.configuration.options-editor`
   - Prototype target token: `options`
   - Required semantic route: `overlay:config`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `8 tabs · 154`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Eight screens over every BlueMap configuration file, with one search across all of them and a save plan that states what it will write.

50. **GitHub CLI accounts**
   - Stable feature key: `setup.configuration.github-cli-accounts`
   - Prototype target token: `runners`
   - Required semantic route: `job:runners/reveal=account`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `signed out`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Which account the app acts as for Actions, Pages, backups and repositories, held in the OS keychain rather than a config file.

### How the interface behaves

51. **Tabbed navigation**
   - Stable feature key: `setup.how-the-interface-behaves.tabbed-navigation`
   - Prototype target token: `tabs`
   - Required semantic route: `work-action:tab-finder/reveal=tabs`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `dock · group · pin`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Browser-style tabs docked left, right, top or bottom, with overflow, reordering, pinning, grouping and four discovery searches including bulk close.

52. **Where the panels sit**
   - Stable feature key: `setup.how-the-interface-behaves.where-the-panels-sit`
   - Prototype target token: `tabdock`
   - Required semantic route: `overlay:settings/reveal=panel-geometry`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Every settings, tab, anchored, dialog and menu panel is viewport-bounded, persistent, resettable and keyboard movable or resizable.

53. **Appearance editors**
   - Stable feature key: `setup.how-the-interface-behaves.appearance-editors`
   - Prototype target token: `appearance`
   - Required semantic route: `overlay:settings/reveal=appearance`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `per element`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Per-element Edit appearance…, with a continuous colour picker and Word-depth typography. Its overrides always win, because a theming feature that cannot theme its own application is incomplete.

54. **The regex builder**
   - Stable feature key: `setup.how-the-interface-behaves.the-regex-builder`
   - Prototype target token: `regex`
   - Required semantic route: `docs:regex-builder`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `every search`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: On every search bar, anchored beside the field it belongs to, with the supported flags, a guided token palette and live matches.

55. **Command palette**
   - Stable feature key: `setup.how-the-interface-behaves.command-palette`
   - Prototype target token: `palette`
   - Required semantic route: `overlay:palette`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `Ctrl+Shift+F`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: One shortcut over every command, page and setting the application has.

56. **Notification centre**
   - Stable feature key: `setup.how-the-interface-behaves.notification-centre`
   - Prototype target token: `notifications`
   - Required semantic route: `overlay:notifications`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `6 unread`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Nothing that only informs is a dialog; messages never block, and dismissed ones stay reviewable in a history.

57. **Super confirmation**
   - Stable feature key: `setup.how-the-interface-behaves.super-confirmation`
   - Prototype target token: `superconfirm`
   - Required semantic route: `docs:super-confirmation`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `two keys`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Two key switches and a full-travel slider before anything destructive, with an emergency exit throughout and the exact consequence named first.

58. **Action-specific artwork**
   - Stable feature key: `setup.how-the-interface-behaves.action-specific-artwork`
   - Prototype target token: `settings`
   - Required semantic route: `docs:action-artwork`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `5 images`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Cloud setup, local speed, restart, repository publication and destructive config review each get their own bundled realistic image and semantic alt text.

59. **Display and ease of use**
   - Stable feature key: `setup.how-the-interface-behaves.display-and-ease-of-use`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=display-ease`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The interface-size dial, which works through page zoom rather than a root font size, plus reduced motion and the contrast theme.

60. **Theme**
   - Stable feature key: `setup.how-the-interface-behaves.theme`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=theme`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `3 schemes`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Dark, light and contrast. The contrast theme is deliberately not tonal — deriving it from a seed would defeat the one thing it exists for.

61. **How long a notice stays**
   - Stable feature key: `setup.how-the-interface-behaves.how-long-a-notice-stays`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=notice-duration`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `4 levels`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: How long a non-blocking notice waits before it leaves. Whichever you pick, it stays readable in the history.

62. **Downloads at once**
   - Stable feature key: `setup.how-the-interface-behaves.downloads-at-once`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=download-concurrency`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `1–8`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: How many parts of a world, backup or dependency are fetched in parallel. More is faster on a fat connection and worse on a thin one.

63. **What this application is called**
   - Stable feature key: `setup.how-the-interface-behaves.what-this-application-is-called`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=product-display-name`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The name in the title bar and in every sentence the app writes about itself. Changing it renames nothing on disk.

### Language

64. **Language and tone**
   - Stable feature key: `setup.language.language-and-tone`
   - Prototype target token: `language`
   - Required semantic route: `overlay:settings/reveal=language-tone`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `true`.
   - Prototype meta reference: `3 modes · 5 levels`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: English, Hong Kong Cantonese and bilingual, each with its own independent funny-level slider from 1 (fully professional) to 5 (maximum playfulness), over the app's own copy catalogue.

65. **{modeName}**
   - Stable feature key: `setup.language.modename`
   - Prototype target token: `school`
   - Required semantic route: `conditional:restricted-mode -> overlay:settings/reveal=restricted-mode`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `shared · renamable`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Render the user-chosen name from the existing sanitized restricted-mode contract and route to its real local settings surface; never ship the placeholder literally.

66. **Personal vocabulary**
   - Stable feature key: `setup.language.personal-vocabulary`
   - Prototype target token: `vocab`
   - Required semantic route: `conditional:personal-vocabulary -> overlay:settings/reveal=personal-vocabulary`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `true`.
   - Prototype meta reference: `private`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Expose only through an existing sanitized public integration and explicit private user input; never collect, upload, share, log, export, or bundle vocabulary data.

67. **Spoken narrator**
   - Stable feature key: `setup.language.spoken-narrator`
   - Prototype target token: `language`
   - Required semantic route: `overlay:settings/reveal=narrator`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `true`.
   - Prototype meta reference: `off by default`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Speaks app events in English, Cantonese or both — strictly serialized, one utterance at a time, superseded lines replaced rather than stacked. Errors are always spoken plainly and are never rate-limited, and it yields to a screen reader and to quiet hours.

68. **Scheduled language and appearance**
   - Stable feature key: `setup.language.scheduled-language-and-appearance`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=language-appearance-schedule`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Applies versioned rules by date, time, weekday and timezone, optionally gated by bounded JSON API or Home Assistant boolean sources. Tokens stay in session memory.

### Shared across these apps

69. **Memory Console**
   - Stable feature key: `setup.shared-across-these-apps.memory-console`
   - Prototype target token: `memory`
   - Required semantic route: `conditional:memory-console -> job:memory/reveal=console`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `control plane`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Expose the real public control-plane console only when the current checkout contains its sanitized implementation and tests; never build a demo connection.

70. **Status Hub**
   - Stable feature key: `setup.shared-across-these-apps.status-hub`
   - Prototype target token: `memory`
   - Required semantic route: `conditional:memory-console -> job:memory/reveal=status`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `live`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Show real public status/synchronization evidence only when supplied by an existing sanitized service; no simulated health values.

71. **Control-plane runtime**
   - Stable feature key: `setup.shared-across-these-apps.control-plane-runtime`
   - Prototype target token: `memory`
   - Required semantic route: `conditional:memory-console -> job:memory/reveal=runtime`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Route to the real public runtime controls only when present in the checkout; preserve its existing security and lifecycle contract.

72. **Sync attestation**
   - Stable feature key: `setup.shared-across-these-apps.sync-attestation`
   - Prototype target token: `memory`
   - Required semantic route: `conditional:memory-console -> job:memory/reveal=attestation`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `signed`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Display and verify only the existing public attestation contract; do not invent schemas, signatures, repositories, or sample identities.

73. **Secret intake**
   - Stable feature key: `setup.shared-across-these-apps.secret-intake`
   - Prototype target token: `memory`
   - Required semantic route: `conditional:memory-console -> job:memory/reveal=secret-intake`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `keychain`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Use only the existing guarded secret-intake implementation and keychain boundary; no secret enters renderer state, logs, screenshots, exports, or source.

74. **Lowlevel MCP**
   - Stable feature key: `setup.shared-across-these-apps.lowlevel-mcp`
   - Prototype target token: `memory`
   - Required semantic route: `conditional:memory-console -> job:memory/reveal=integrations`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Expose only an existing sanitized integration surface; do not add private host-routing details or fake connectivity.

75. **Shared localization contract**
   - Stable feature key: `setup.shared-across-these-apps.shared-localization-contract`
   - Prototype target token: `settings`
   - Required semantic route: `conditional:shared-localization-contract -> docs:localization-contract`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `true`.
   - Prototype meta reference: `80 upstream keys`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Document or expose the existing public localization contract without copying upstream BlueMap-owned keys into the app catalogue.

### Keeping the app healthy

76. **Automatic updates**
   - Stable feature key: `setup.keeping-the-app-healthy.automatic-updates`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=updates`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `0.14.3 ready`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Reads the unsigned Squirrel feed, checks its package hashes, and offers a restart in a banner that never blocks or interrupts a render.

77. **Startup recovery**
   - Stable feature key: `setup.keeping-the-app-healthy.startup-recovery`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=startup-recovery`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Keeps a usable shell open when recoverable startup work fails; hard boundaries open an isolated recovery window with cached, copyable and exportable diagnostics.

78. **Worldlens migration**
   - Stable feature key: `setup.keeping-the-app-healthy.worldlens-migration`
   - Prototype target token: `settings`
   - Required semantic route: `overlay:settings/reveal=migration`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Moves profiles and preferences without deleting the old copy; reads legacy project, marker and environment names and writes current identifiers.

79. **Memory console**
   - Stable feature key: `setup.keeping-the-app-healthy.memory-console`
   - Prototype target token: `settings`
   - Required semantic route: `conditional:memory-console -> overlay:settings/reveal=memory-console`
   - Availability: conditional on an existing sanitized public contract/capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `control plane`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Link to an existing public Memory Console setting/integration only when present; otherwise capability-gate the definition without a fake panel.

### Reading about it

80. **Docs**
   - Stable feature key: `setup.reading-about-it.docs`
   - Prototype target token: `docs`
   - Required semantic route: `job:docs/reveal=home`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `60+ articles`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Full-text, in-app documentation, bundled, with no network needed to read it. Every article states behaviour, configuration, failure modes, security and verification.

81. **Changelog viewer**
   - Stable feature key: `setup.reading-about-it.changelog-viewer`
   - Prototype target token: `docs`
   - Required semantic route: `job:docs/reveal=changelog`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Every released version, with an anchored calendar date filter taking typed ISO or slash dates, month jumps, presets and ranges, plus search and export.

82. **Glossary**
   - Stable feature key: `setup.reading-about-it.glossary`
   - Prototype target token: `docs`
   - Required semantic route: `job:docs/reveal=glossary`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `(none in prototype; resolve only when useful)`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Every project-specific term defined once, with a tell-me-more link from wherever the term appears.

83. **EULA and consent**
   - Stable feature key: `setup.reading-about-it.eula-and-consent`
   - Prototype target token: `docs`
   - Required semantic route: `overlay:eula`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `accepted`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: The licence at first run, a tabbed viewer with search and export afterwards, and one remembered answer about Mojang downloads.

84. **The interactive tour**
   - Stable feature key: `setup.reading-about-it.the-interactive-tour`
   - Prototype target token: `docs`
   - Required semantic route: `overlay:tour`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `3 minutes`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Walks through finding a world, rendering it and opening the result, on your own machine. Offered once, never twice.

85. **The design system**
   - Stable feature key: `setup.reading-about-it.the-design-system`
   - Prototype target token: `docs`
   - Required semantic route: `job:docs/reveal=design-system`
   - Availability: required current public capability.
   - Hide in restricted mode when the current public contract requires it: `false`.
   - Prototype meta reference: `MD3`. Treat every state/count/version/path value as non-authoritative; implement through a live resolver.
   - Copy intent: Every visual decision resolves to a token declared once: the full M3 role set, the shape scale, fifteen type ramps, elevation, state layers and the Expressive motion set.

# Appendix C — Job registry and group seed

The catalogue manifest and job registry are separate. Suggested semantic registry:

| Job ID | Existing screen | Fresh pin | Seed group | Notes |
| --- | --- | ---: | --- | --- |
| `wizard` | World/make-a-map guide | yes | none | Fresh Work seed; secondary Home path. |
| `projects` | Projects/project editor | no | Rendering | Primary New map path. |
| `runners` | CI render/GitHub runners | no | Rendering | Preserve current CI/account/repository behavior. |
| `renders` | Renders | no | Rendering | Label suffix and status use active-render aggregator. |
| `servers` | Maps and servers | no | Finished maps | Local/remote server and viewer entry. |
| `pages` | Pages/publishing | no | Finished maps | Pages, remote hosting, private-world flows. |
| `preview` | Live preview | no | Finished maps | Served-shell preview. |
| `backups` | Backups | no | Keeping a copy | Backup/source/restore. |
| `worldrepo` | World repository | no | Keeping a copy | Repository/adoption. |
| `docs` | Docs | no | none | Docs/changelog/glossary/design system. |
| `memory` | Existing sanitized optional console only | no | none | Capability-gated; never fabricate. |

Labels/icons are translated and use the existing MDI import strategy. Do not load the prototype's Material Symbols font. Empty groups do not render headings. A job can be available for restore/discovery without being open.

# Appendix D — Dynamic-meta resolver guide

Use typed resolver keys rather than embedding runtime values in the manifest. Suggested categories:

| Feature examples | Resolver source |
| --- | --- |
| Project editor/options/schema counts | Live `FieldMeta`/config descriptor inventory. |
| Guide steps/mask shapes/catalogue totals | Current arrays/registries, never duplicate literals in UI. |
| World folders/projects/maps/servers/marker sets | Current discovery/profile/project stores. |
| Renders running, progress, throughput | Existing active-render/progress aggregation. |
| Java/runtime/dependency/consent | Existing settings/provisioning stores. |
| Pages proofs/publish state/private state | Existing Pages verification model. |
| Backup part size/digests | Current backup configuration/result. |
| Local revision/history | Current revision/history service. |
| Settings sections/options tabs | Actual rendered section/tab registries. |
| GitHub account | Existing authenticated account service, with no token exposure. |
| Notifications unread/filter counts | Existing notice store. |
| Update version | Existing updater state. |
| Docs article count/changelog/EULA/tour | Current docs/acceptance/tutorial registries/state. |
| Optional cross-app features | Capability resolver backed only by existing sanitized public implementation. |

A resolver returns translated display text or `undefined`. It must not trigger network work merely because Home rendered, and it must not expose secrets or private capability names.

# Appendix E — Final self-review searches

Before completion, inspect the diff with repository-appropriate equivalents of these searches:

```bash
# Prototype/runtime leakage
git diff --name-only | grep -E 'Worldlens\.dc\.html|Shell[ABC]-|support\.js|map-render\.png' || true

# External UI assets
git diff | grep -Ei 'fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr|material-symbols' || true

# Raw prototype colors and fixed demo copy (review every hit, do not mechanically delete legitimate fixtures)
git diff | grep -Ei '#101418|#0B0E11|#1D2024|#004B73|107 settings|8 tabs · 154|revision 41|0\.14\.3 ready|6 unread|1 running' || true

# Potential shell FAB/toast regressions
git diff | grep -Ei 'VFab|floating.action|toast|snackbar' || true

# Private/credential leakage; extend with repository's own scanners
git diff | grep -Ei 'password|passkey|secret|token|private repository|credential' || true

git diff --check
git status --short
```

Hits are review prompts, not automatic failures: security documentation and existing real services may legitimately contain generic words such as “token.” The completion report must confirm each suspicious hit was understood.
