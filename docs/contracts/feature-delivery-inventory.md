# Feature delivery inventory draft

Baseline: `11cd248f9a13c6547474a0cfe168b2958751be60`. This is an independent-review draft, not current runtime acceptance.

All 105 canonical identifiers are present. Each row carries five surface assessments in the companion JSON. Unknown implementation coverage remains pending review.

| Identifier | Requirement | Source mapping | Review state |
| --- | --- | --- | --- |
| `language` | Language modes | `design/packages/ui/src/components/setup/LanguageSettingsRow.vue` | partial-source-mapping |
| `funny-emoji` | Funny-level sliders and the dialog emoji switch | Not yet mapped | pending-review |
| `personal-vocabulary` | Local personal-vocabulary JSON upload | `design/packages/site/src/settings/personalVocabulary.ts` | partial-source-mapping |
| `school-mode` | Universal School mode | `design/packages/ui/src/components/setup/SchoolModeSettingsRow.vue`, `design/packages/site/src/settings/schoolMode.ts` | partial-source-mapping |
| `narration` | Spoken narrator and voice pickers | `design/packages/ui/src/components/runtimeSettings/narrator.ts` | partial-source-mapping |
| `scheduled-settings` | Scheduled and external settings sources | `design/packages/ui/src/components/runtimeSettings/schedule.ts` | partial-source-mapping |
| `display-name` | Renaming the application | `design/packages/ui/src/components/settings/ProductDisplayNameRow.vue` | partial-source-mapping |
| `adhd-modes` | ADHD modes | `design/packages/ui/src/components/runtimeSettings/completeness.ts` | partial-source-mapping |
| `dim-sum` | Dim sum surprise | Not yet mapped | pending-review |
| `dim-sum-photo-source` | Public dim-sum photo source | Not yet mapped | pending-review |
| `material-design` | Material Design 3 conformance | Not yet mapped | pending-review |
| `workflow-navigation` | Workflow navigation and window chrome | Not yet mapped | pending-review |
| `motion` | Material Design 3 motion with a complete reduced-motion path | Not yet mapped | pending-review |
| `appearance-editor` | Per-element appearance editor | Not yet mapped | pending-review |
| `color-picker` | Infinite colour picker and translator | Not yet mapped | pending-review |
| `logo-customization` | application logo customization | Not yet mapped | pending-review |
| `overlay-panels` | Overlays and panels | Not yet mapped | pending-review |
| `collapse-filters` | Collapsible filters and statistics | Not yet mapped | pending-review |
| `accessibility-sizing` | Accessibility, sizing, and layout without layout clipping defect | Not yet mapped | pending-review |
| `functional-ui` | Functional UI and truthful empty states | Not yet mapped | pending-review |
| `tabs` | Browser-style tabbed navigation | `design/packages/ui/src/components/tabs/TabbedNavigation.vue`, `design/packages/ui/src/components/tabs/TabStrip.vue` | partial-source-mapping |
| `regex-search` | Regex builder on every search surface | `design/packages/ui/src/components/config/regexPolicy.test.ts` | partial-source-mapping |
| `command-palette` | `Ctrl+Shift+F` command palette | Not yet mapped | pending-review |
| `context-menus` | A context menu on every element | Not yet mapped | pending-review |
| `menu-shortcuts` | Context menus show working shortcuts | Not yet mapped | pending-review |
| `rich-controls` | Rich controls wherever a value is shown | Not yet mapped | pending-review |
| `guided-forms` | Guided forms | Not yet mapped | pending-review |
| `settings-explanations` | Settings that explain themselves | Not yet mapped | pending-review |
| `blank-editors` | Presets for blank-slate editors | Not yet mapped | pending-review |
| `super-confirmation` | Two-key super confirmation | Not yet mapped | pending-review |
| `element-locks` | Toy locks on every element | Not yet mapped | pending-review |
| `support-tickets` | Support Tickets recovery desk | Not yet mapped | pending-review |
| `unlock-ladder` | The unlock ladder | Not yet mapped | pending-review |
| `authenticator` | Built-in authenticator | Not yet mapped | pending-review |
| `qr-pairing` | QR pairing for OTP registration | Not yet mapped | pending-review |
| `honest-monetization` | Free by default, honest when paid, never nagging | Not yet mapped | pending-review |
| `local-history` | Local version history | `design/packages/ui/src/components/history/HistoryPanel.vue`, `design/packages/ui/src/components/history/historyRestore.ts` | partial-source-mapping |
| `exports` | Export everything, in every format | Not yet mapped | pending-review |
| `bulk-actions` | Bulk actions everywhere | Not yet mapped | pending-review |
| `changelog` | Changelog viewer | Not yet mapped | pending-review |
| `offline-docs` | Offline documentation browser in every application | `design/packages/ui/src/components/docs/DocsPage.vue` | partial-source-mapping |
| `rendered-provider-text` | Provider-authored text is rendered | Not yet mapped | pending-review |
| `notifications` | Non-blocking notifications and their centre | `design/packages/ui/src/components/notifications/noticeBulk.ts` | partial-source-mapping |
| `file-converter` | Universal local file converter | `design/packages/ui/src/components/converter/ConverterScreen.vue`, `docs/contracts/file-converter-ollama-completeness.md` | partial-source-mapping |
| `minecraft-server-manager` | Full Minecraft server creator and manager | `design/packages/ui/src/components/mcserver/ServerListScreen.vue`, `design/packages/ui/src/components/mcserver/serverModel.ts`, `design/packages/ui/src/components/mcserver/serverPropertiesFields.ts` | partial-source-mapping |
| `ollama-suite` | Universal local Ollama suite manager | `design/packages/ui/src/components/ollama/OllamaScreen.vue`, `docs/contracts/file-converter-ollama-completeness.md` | partial-source-mapping |
| `external-editor` | External editor and VS Code hand-off | Not yet mapped | pending-review |
| `download-handoff` | Browser-extension download hand-off surfaces | Not yet mapped | pending-review |
| `forge-publishing` | Publishing to a forge | Not yet mapped | pending-review |
| `progress-recovery` | Progress where it started, recovery where it broke | Not yet mapped | pending-review |
| `completeness-parity` | Per-surface completeness inventory and parity | `design/packages/ui/src/components/runtimeSettings/completeness.ts`, `docs/contracts/file-converter-ollama-completeness.md` | partial-source-mapping |
| `front-provenance` | Front-screen version and updated-at provenance | Not yet mapped | pending-review |
| `product-evidence` | Real screenshots wherever a surface is described | `docs/screenshots/evidence-inventory.json` | partial-source-mapping |
| `screen-recording` | committed screen recording | Not yet mapped | pending-review |
| `design-reference-parity` | Checked-in design-reference parity | Not yet mapped | pending-review |
| `design-folder` | Design surfaces live in the repository | `design/HANDOFF.md`, `redesign/HANDOFF.md` | partial-source-mapping |
| `cheap-jor-matrix` | layout clipping defect matrix for every built surface | Not yet mapped | pending-review |
| `public-huishot-gallery` | Public screenshot gallery at usage limit reached | Not yet mapped | pending-review |
| `landing-site` | A Material Design 3 GitHub Pages carrying every feature | Not yet mapped | pending-review |
| `deen-wah-site` | A mobile-friendly GitHub Pages | Not yet mapped | pending-review |
| `installer-download-button` | Verified installer download on Home | Not yet mapped | pending-review |
| `feature-articles` | One detailed article per feature on the GitHub Pages | Not yet mapped | pending-review |
| `vendored-fonts` | Complete, scripted font vendoring | Not yet mapped | pending-review |
| `shared-link-embed` | A real picture when a link is pasted into Discord | Not yet mapped | pending-review |
| `homepage-link` | The GitHub Pages linked from the repository | Not yet mapped | pending-review |
| `vocabulary-unlock-boundary` | private vocabulary only after authentication | Not yet mapped | pending-review |
| `status-hub` | Status Hub registration and status surface | `design/packages/ui/src/components/runtimeSettings/completeness.ts` | partial-source-mapping |
| `discord-status-bridge` | Discord status bridge | Not yet mapped | pending-review |
| `panic-webhooks` | Verified panic dispatch | Not yet mapped | pending-review |
| `tidbyt-displays` | Tidbyt status frames | Not yet mapped | pending-review |
| `build-entrypoints` | Root `build.bat` and `build-installer.bat` | `build.bat`, `build-installer.bat` | partial-source-mapping |
| `fresh-build-run-command` | One fresh Microsoft Windows build-and-run command | Not yet mapped | pending-review |
| `dependency-fetcher` | One-click dependency or prerequisite fetcher | Not yet mapped | pending-review |
| `bundled-dependencies` | Every application bundles its dependencies and prerequisites | Not yet mapped | pending-review |
| `squirrel-installer` | Genuine Squirrel.Windows installers | Not yet mapped | pending-review |
| `self-signing` | Required-format self-signing only | Not yet mapped | pending-review |
| `auto-updates` | Chrome-style automatic updates | Not yet mapped | pending-review |
| `app-icon` | Original logo and packaged icon | Not yet mapped | pending-review |
| `release-workflow` | A real release on every push | Not yet mapped | pending-review |
| `release-timing` | End-to-end workflow timing in release notes | Not yet mapped | pending-review |
| `release-line-counts` | Line counts counted by GitHub Actions | Not yet mapped | pending-review |
| `release-dim-sum-photo` | A dim-sum photo on every release | Not yet mapped | pending-review |
| `dim-sum-code-names` | Dim sum release code names | Not yet mapped | pending-review |
| `ci-bootstrap` | GitHub Actions dependency or prerequisite bootstrap and safe outputs | Not yet mapped | pending-review |
| `runner-selection` | Live GitHub Actions runner selection | Not yet mapped | pending-review |
| `encrypted-public-builder` | Encrypted public builder for private repositories | Not yet mapped | excluded-with-reason |
| `tabbed-readme` | A tabbed README, not a scroll | Not yet mapped | pending-review |
| `human-time-estimate` | How long a human would have taken | Not yet mapped | pending-review |
| `sanitized-instruction-copy` | Sanitized instruction mirror | Not yet mapped | pending-review |
| `agents-md-vocabulary-block` | Sanitized vocabulary-discipline block in `AGENTS.md` | `AGENTS.md` | partial-source-mapping |
| `vocabulary-hash-lock` | Vocabulary hash lock | Not yet mapped | pending-review |
| `roadmap-checklist` | `ROADMAP.md` checklist | `ROADMAP.md` | partial-source-mapping |
| `feature-docs` | One Markdown file per feature | `docs/site/universal-contracts.md` | partial-source-mapping |
| `postman-collections` | Postman collections for HTTP APIs | Not yet mapped | pending-review |
| `wiki-day-teet-hui-sync` | Wiki and GitHub Pages source kept current | Not yet mapped | pending-review |
| `handoff-record` | `HANDOFF.md` and the GitHub handoff section | `HANDOFF.md` | partial-source-mapping |
| `closeout-prompt` | pushed `CLOSEOUT_PROMPT.md` | Not yet mapped | pending-review |
| `discussion-records` | Discussions as the running record | Not yet mapped | pending-review |
| `project-board` | GitHub Project linked to the repository | Not yet mapped | pending-review |
| `operational-skill` | repository operational skill | Not yet mapped | pending-review |
| `readme-prompt-banner` | README opens with the prompt banner | Not yet mapped | excluded-with-reason |
| `uh-single-file-editions` | Single-file editions of the global-memory repository | Not yet mapped | excluded-with-reason |
| `project-profile` | Project memory folders | Not yet mapped | excluded-with-reason |
| `roblox-model-catalogue` | Every shared Roblox model, meaningfully used | Not yet mapped | excluded-with-reason |
| `roblox-visual-realism` | Roblox visual realism | Not yet mapped | excluded-with-reason |

## Explicit exclusions

- `readme-prompt-banner`: Applies only to the maintainer instruction repository.
- `uh-single-file-editions`: Applies only to the maintainer instruction repository.
- `project-profile`: Maintainer project profiles belong to the instruction repository, not this public product.
- `roblox-model-catalogue`: Worldlens is not a Roblox game or Studio project.
- `roblox-visual-realism`: Worldlens is not a Roblox game or Studio project.
- `encrypted-public-builder`: Worldlens is already public; this requirement concerns encrypted builds of private repositories.

## Acceptance boundaries

Run `node scripts/check-feature-delivery-inventory.mjs` to validate the required 105 IDs, all five scopes and repository evidence paths. Its structural success does not establish delivery. Run it with `--require-complete` for the completion gate; pending requirements must fail. The independent required-ID list and negative fixtures reject omitted rows, duplicate IDs, missing scopes, unsupported completion labels and verification claims without source-bound evidence.

No builds, tests, captures, deployments or live-server operations were performed to create this draft. Existing documentation and test files establish source presence only. Each surface needs its own implementation, localization, persistence, focused checks, interaction and current capture evidence before acceptance. Browser surfaces require a supported authenticated local mediation route for capabilities unavailable to the browser itself.
