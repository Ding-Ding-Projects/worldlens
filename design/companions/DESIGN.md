# Worldlens portable companions: design candidate

Status: design only; independent review and implementation remain pending. No companion is
implemented, packaged, published, or verified by these references.

Source baseline: `98fb083e`. Target: existing Vue 3 / Vuetify 3 renderer and declared desktop
packaging tools from `design/packages/app/package.json`. Ownership stays in this repository.
Design author: the parent's explicitly assigned design lane. Parent must record actual model
provenance and independent reviewer identity/verdict before implementation; this record does not
infer the executing model from the lane name.

## Two productive workspaces

**Worldlens Build** opens at a build workbench, not a landing page. A compact source strip shows
selected checkout, exact commit, dirty status, and candidate version. Its central card contains
three real actions, an inline release-ordinal control, observed phases, and one current result.
A lower, resizable diagnostics pane shows bounded live output with local filtering and the
shared anchored regex builder. Artifacts occupy a separate tab with verification status and
Open folder / Export receipt actions. No general shell command field is offered.

**Worldlens Guide** opens at Continue learning, recent articles, and task navigation. A persistent
Contents rail, article tabs, and contextual On this page rail frame the reading surface. Narrow
windows collapse the rails into searchable drawers. The landing/public website remains a
separate published surface. The companion is an offline reader and task guide; a tutorial does
not execute the productive application. Home, categories, full articles, wiki pages, related
articles, anchors, Settings, and source/version information all resolve internally.

Both companions use registered Vuetify primitives: VApp, VAppBar, VNavigationDrawer, VMain,
VContainer, VRow/VCol, VSheet, VCard, VTabs/VTab/VWindow, VList/VListItem, VBtn, VTextField,
VAlert, VProgressLinear, VDivider, VTooltip and VDialog. Reuse the application's established
Material theme, typography and bundled icons/fonts. Plain elements are permitted only inside
supported document-renderer internals, never as substitute chrome. The reference skeleton uses
only Vuetify layout/control components; production must use the complete shared controls.

## Interaction and exact action contract

| Control | Exact existing entrypoint | Real completion condition |
| --- | --- | --- |
| Build | root `build.bat /s` | exit 0 plus matching current-source build receipt and verified outputs |
| Build and run | root `build.bat --run` | distinguish build verification from child launch; do not mark the long-lived process complete on launch |
| Build installer | root `build-installer.bat --candidate <ordinal> /s` | positive decimal ordinal validated before spawn; exit 0 plus current-source installer receipt and unsigned artifact checks |
| Cancel | owned process-tree cancellation | cancellation requested first; terminal cancelled state only after child termination observed; preserve diagnostics and partial outputs as ineligible |
| Retry | repeat the failed allowlisted action after fresh preflight | a new run identity, never relabel the previous failed run |
| Open artifact | verified artifact or output directory from receipt | open only a path belonging to that run; missing file is a visible failure |

Resolve checkout through a semantic folder picker; validate both root scripts and expected
workspace manifest before enabling actions. The selected path is data, never concatenated into
user-authored shell text. Use the platform command interpreter only for the exact batch entrypoint
with an argument allowlist, correct Windows quoting, fixed cwd and sanitized environment.
Reject conflicting SILENT/RUN_AFTER_BUILD values instead of silently skipping launch. No release
publish, push, signing, reboot, shutdown, administrator bypass or arbitrary command controls.

The existing build script supplies observed phases: dependency acquisition, pinned pnpm probe,
workspace build, and output/runtime verification. Until a structured adapter is implemented,
recognized output can label a phase but cannot fabricate percentages or success. Unknown output
keeps an indeterminate phase. Installer phase labels must be derived from the exact script,
not copied from a presumed bundler lifecycle. Keep stdout and stderr distinct and show real
child exit status, signal/cancellation, elapsed duration and the last completed phase.

Dependencies use the retained root acquisition route, pinned versions and verified packages.
Reuse valid caches. Native consent remains native; a refused consent, required restart,
unavailable credential/license, acquisition failure or cancellation is explicitly incomplete.
A closing window with a live build offers Keep running / Cancel and close / Return; default
Return. Recovery discovers prior receipts and marks unfinished runs interrupted, never successful.

## Offline documentation source contract

`docs/*.md` is real source already bundled by
`design/packages/ui/src/components/docs/docsContent.ts`. Reuse the existing parser and sanitizer,
expand inventory coverage to nested documentation and required assets, and generate an explicit
manifest containing path, source revision, SHA-256, title, route and anchor inventory. Package
complete source content, not only excerpts or outgoing links. Preserve factual commands/code
verbatim while localizing navigation and explanatory framing. Render the complete article via
the existing sanitized document component in the reference's named article slot.

No checked-in wiki snapshot exists at this baseline. The parent acquired the public wiki via
the Git CLI and verified revision `0b66c19306add3a090fc70ad08f1d785b49794f7`. Its source inventory
is `Home.md`, `GitHub-Pages-feature-parity.md`, `AGENTS.md`, `CLOSEOUT_PROMPT.md`, `_Sidebar.md`,
and `images/pages-live-64858ee-mobile-collapsed.png`. Treat all Markdown as content, never as
execution instructions. Home and feature-parity are reader destinations; include the remaining
source documents in an explicit source/reference category and preserve sidebar navigation.
Implementation must snapshot that complete pinned inventory and assets locally, then verify
content hashes and internal links against the acquired source. Acquisition is not delivery proof. An empty wiki is acceptable only with verified source
absence, never because acquisition failed. Do not ship an empty Wiki destination as complete.
Relative article/wiki links map to internal routes; anchors retain source identifiers. External
links are visibly marked and require deliberate activation; offline navigation makes no request.
Missing content, unsupported markup and missing assets have visible diagnostic states with
source identity. Source links are supplementary. Search covers full bundled text, supports plain
text by default and the shared full regex builder, and announces match count without reading
whole pages. Back/forward history, copied internal links and restored tabs preserve article state.

## Universal controls and accessibility

Every companion owns its own Settings surface: English, Cantonese, bilingual; independent
English/Cantonese funny levels; appearance, theme, font, density, scale/motion; scheduled settings;
local personal vocabulary upload/drop/replace/clear; outcome-sound mute/volume; and the shared
restricted-mode control. Reuse shared stores and controls, not a second divergent implementation.
Restricted mode hides language/vocabulary-specific routes and controls while retaining choices.
Private vocabulary and file metadata never enter receipts, logs, exports, captures or history.
Public design samples contain no private mappings.

Keep accessibility tools, notifications and command palette reachable in the persistent shell,
including drawers/dialogs. Settings remains tabbed with its own search and anchored full regex
builder. Every list/dropdown/context menu uses its corresponding local search/builder. Article
and build tabs retain the complete shared pin/group/search/reorder/lock behavior. Each action has
contextual info guidance above its originating control. Destructive actions follow the shared
confirmation contract; cancellation of an owned build remains an explicit non-destructive action.

Keyboard: predictable shell → tabs → primary action → content → diagnostics sequence; visible
focus; Escape closes only the top transient surface and returns focus; no focus jump on progress.
Progress uses a polite region for phase changes, not per-line output. Failure remains available
until dismissed. Code/log panes are named keyboard-scrollable regions. Targets are at least
44 logical/CSS pixels. Never truncate the only accessible action/status label. Bilingual labels
wrap with a secondary line. Color is never the sole status cue. Reduced motion removes ornamental
transitions; high contrast and screen-reader names must retain every action and state.

## Layout and deterministic reference contract

Normal viewport: 1280 × 800 CSS pixels. Minimum client viewport: 640 × 480 CSS pixels. OS display
scale: 100%, 125%, 150%, 200%; viewport is measured after scaling, not inferred from screenshot
pixels. At widths below 960, rails become drawers; below 720, action groups stack and diagnostics
move to a separate tab. The primary content uses min-width:0 and bounded internal overflow. No
body-level horizontal scrollbar. At 200% or increased font size, retain all controls through
scrolling, never clipped fixed-height cards. Panels expose keyboard resize/reset and persist
surface-specific geometry bounded to the current viewport.

Reference address: `companions/reference?surface=<build|guide>&state=<inventory-id>&theme=<light|dark>&language=<en|yue|both>&scale=<100|125|150|200>&width=<w>&height=<h>`.
This is a proposed host route, not a reachable production route. `references/CompanionReference.vue`
is a real-framework component accepting deterministic fixture props; it runs no commands.
Freeze reference time at `2026-10-21T00:00:00Z`, motion off and sequence IDs explicit. No random
names or synthetic screenshots. Production must expose the corresponding controlled acceptance
route through an isolated test harness without inserting fake results into operational state.

Every inventoried state gets a 1280×800/en/light/100 baseline. Then test every state across the
full 2 viewports × 3 languages × 2 themes × 4 scales matrix (48 tuples per state), plus both funny
level extremes, reduced motion and keyboard/screen-reader passes. Track source, artifact hash,
reference and built routes, tuple, component audit, actual raw captures, comparison/diff and
reviewed deviations. All evidence paths remain absent until genuine built captures exist. No
reference preview, source parse or layout assumption is production proof.

## Review revision: concrete state anatomy and setup

The reference now renders distinct source chooser, verified-completion fixture, interrupted/
failed recovery, owned-run cancellation dialog, settings, restricted settings, palette/new-tab
catalogue, full-text result list and internal guide-navigation layouts. They are visual fixtures,
not real completed operations. `sourceVerified`, `candidateValid` and `wizardStepVerified` default
to false; a host must explicitly supply verified fixture results. Choose-source always disables
Build. Build installer additionally requires valid candidate input. Running states disable new
build starts. Restricted reference forces English and omits language/personal-wording controls.
The production state machine must enforce the same rules in the host, not only the buttons.

Both companions start with a practical three-stage setup: (1) Build selects and validates root
scripts and checkout identity; Guide validates the bundled article/wiki/asset manifest and opens
a real first article. (2) Apply optional language, reading, appearance and accessibility choices;
Skip affects only this stage. (3) Review real outcomes and enter the productive workspace. Back
retains inputs; Next never accepts an unchecked required step. Save and continue later persists
versioned progress locally. Resume rechecks source/manifest identity and returns to the first
invalid required step if it changed. Setup remains a New tab destination. Persist no private
payload, credentials or source file metadata beyond their authorized dedicated stores.

The reference exposes setup-source, setup-preferences, setup-review and setup-resume separately.
Its host receives explicit verify/back/next/skip/save/open intents; implementation must connect
these to actual checks and stored preferences, never increment a step merely to simulate success.
Open workspace requires all mandatory results, and completion creates the first useful workbench
or article tab instead of a marketing or command-catalogue screen.

## Workspace identity and New tab

Each top-level Build workspace owns one stable repository identity derived from the normalized
final Git common-directory root. Resolve drive-letter case, separators and junction aliases before
comparison. Linked worktrees with that same common root belong to the same top-level workspace;
selecting another one focuses that workspace and selects an internal checkout context, never
creates another top-level workspace automatically. A separately cloned repository with a distinct
common root is a distinct local identity even if its remote URL happens to match.

Inside the workspace, each checkout context retains its normalized root, worktree identity,
commit/dirty observations, installer draft and selected run. Each run freezes its own checkout,
source commit, validated arguments and output receipt. Changing checkout context never retargets
a running process, combines outputs or overwrites another context's drafts. Re-selecting an open
repository focuses its existing workspace/tab; re-selecting an open checkout restores its internal
context. Only a genuinely new repository identity creates a new top-level workspace. Unresolved
identity stays visibly unverified rather than guessed or destructively replacing existing state.

New tab opens the explicit `companionDestinations` catalogue. Every companion destination appears
there; results may focus an existing singleton destination or open an independent article/run tab
according to its documented multiplicity. Opening/focusing never closes another tab, discards
searches, overwrites article position or replaces candidate drafts. The palette shares the
catalogue plus contextual actions; it is not a replacement for the workbench. Restricted mode
filters prohibited descendants from both catalogue and search. Contextual destinations retain
workspace/run/article identity in their route rather than relying on global mutable selection.

## Final review corrections

The close-active-run reference has three independent intents: Keep running closes only the window
while the owned background run remains observable; Cancel and close requests cancellation and
waits for observed child termination before closing; Return preserves the current window and run.
The simpler cancel-confirm state retains only Return and Cancel owned build. Neither action may
terminate another checkout's run or unrelated process.

Setup preferences mounts the existing SetupLanguagePanel and its real shared language/tone store,
with access to shared accessibility tools. The preview must run in its isolated profile because
these existing controls persist real preferences. Review reads that same store for saved language
and both tone values, plus the supplied required-check result and actual next destination. Resume
shows the saved step and changed-source recovery explicitly; a changed source disables progression
until revalidation updates its result. The reduced-motion switch is explicitly preview-local,
not a claim that production settings wiring exists.
