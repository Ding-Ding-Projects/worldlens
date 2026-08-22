# Search-bar coverage inventory

Hand-written inventory of every `.vue` file under `design/packages/ui/src/components/**` that renders a list, a table, a dropdown/select, a context menu, or a settings/properties surface. This is the list a rule-shaped guard can never give you: a guard that only checks the search fields already present passes cleanly on a surface that has none, so this file is the hand-written record of what must exist.

**Method:** every non-test `.vue` file in the package was grepped for list/table/select/menu markers (`v-for=`, `VList`, `VDataTable`, `VSelect`/`v-select`, `VMenu`/`v-menu`) and for the presence of this app's established search-plus-anchored-regex-builder components (`ConfigSearchField`, `MenuSearchList`, `MarkerSearchField`, `TabMenuList`). Every file the sweep flagged as having list/menu/select content but no search component was then reviewed by hand (not by pattern alone) and is recorded below with a reason. Context-menu coverage is also cross-checked against the existing `menuSearch/menuCoverage.test.ts` registry, which is the authoritative, guarded inventory for `<v-menu>`/`AppearanceTarget` context menus specifically; this document covers the broader set (lists, tables, dropdowns, settings surfaces) that guard does not.

## Fixed in this task

| File | What it lists | Had search? | Has anchored regex builder now? |
|---|---|---|---|
| `mcserver/PluginManager.vue` | Installed plugins (name/source/version/path) | No | Yes — `ConfigSearchField`, local filter, honest no-match state |
| `mcserver/AdoptionReviewDialog.vue` | Discovery evidence lines, mounted paths, published ports | No | Yes — one combined `ConfigSearchField` filtering all three lists, per-section no-match states |
| `mcserver/CreateServerWizard.vue` | Minecraft version catalogue in the version step | No | Yes — `ConfigSearchField`, local version filtering, plain-text default with anchored regex opt-in |
| `mcserver/ServerConsole.vue` | Live console transcript lines | No | Yes — `ConfigSearchField`, local transcript filtering composed with stream filter |

`mcserver/WebConsolePanel.vue` was reviewed as a named gap candidate. Its `VTabs` strip holds exactly five fixed items (Console/Configuration/Plugins/Players/Web console) — a local window tab set, not the application's primary browser-style navigation tab strip that the tabbed-navigation rules govern. A filter field over five never-changing labels would be decoration rather than a feature, so it was deliberately left as-is; if this tab set ever grows past a handful of dynamic entries it should get the same `MenuSearchList`-style filter the app's real tab strips use.

## Full sweep

| File | List/menu/select markers found | Search present | Notes |
|---|---|---|---|
| `DashboardScreen.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `MapView.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `NoticeBulkToolbar.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `NoticeSelectCheckbox.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `PathField.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `ProfileManager.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `actionArtwork/ActionArtwork.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `appLogo/AppLogoRow.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `appearance/AppearanceEditor.vue` | 7 | yes | Already uses the established search-plus-regex-builder component. |
| `appearance/AppearanceTarget.vue` | 13 | yes | Already uses the established search-plus-regex-builder component. |
| `appearance/ColorField.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `appearance/InfiniteColorPicker.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `appearance/TypographyEditor.vue` | 17 | yes | Already uses the established search-plus-regex-builder component. |
| `authenticator/AuthenticatorScreen.vue` | 7 | yes | Already uses the established search-plus-regex-builder component. |
| `backup/BackupRunCard.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `backup/BackupScreen.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `browserExtension/BrowserExtensionScreen.vue` | 9 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `browserExtension/DownloadCompleteNotice.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `browserExtension/DownloadingDialog.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `browserExtension/StartDownloadDialog.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `changelog/ChangelogDateFilter.vue` | 10 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `changelog/ChangelogEntryRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `changelog/ChangelogViewer.vue` | 10 | yes | Already uses the established search-plus-regex-builder component. |
| `chunker/ChunkerRoutePicker.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `chunker/ChunkerScreen.vue` | 16 | yes | Already uses the established search-plus-regex-builder component. |
| `cirender/CiRenderRoutePicker.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `cirender/CiRenderScreen.vue` | 7 | yes | Already uses the established search-plus-regex-builder component. |
| `cirender/CloudRenderConfigWizard.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `config/ConfigApplyDialog.vue` | 11 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `config/ConfigControl.vue` | 4 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `config/ConfigField.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `config/ConfigFileForm.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `config/ConfigKeyValueField.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `config/ConfigListField.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `config/ConfigMarkerSetsField.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `config/ConfigMaskField.vue` | 5 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `config/ConfigNotifications.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `config/ConfigRegexBuilder.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `config/ConfigScreen.vue` | 6 | yes | Already uses the established search-plus-regex-builder component. |
| `config/ConfigSearchField.vue` | 3 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `config/ConfigSuperConfirm.vue` | 4 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `config/MapsScreen.vue` | 7 | yes | Already uses the established search-plus-regex-builder component. |
| `config/MaskDrawingCanvas.vue` | 3 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `config/RenderMaskEditorCard.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `config/RenderMaskFieldLauncher.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `config/RunScreen.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `config/SpeedControl.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `config/StoragesScreen.vue` | 4 | yes | Already uses the established search-plus-regex-builder component. |
| `console/RenderConsole.vue` | 6 | yes | Already uses the established search-plus-regex-builder component. |
| `controlbar/CompassButton.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `controlbar/ControlBar.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `controlbar/ControlsSwitch.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `controlbar/DayNightSwitch.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `controlbar/IconButton.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `controlbar/MenuButton.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `controlbar/NumberInput.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `controlbar/PositionInput.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `controls/FreeFlightMobileControls.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `controls/ZoomButtons.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `dimsum/DimSumSurprise.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `docs/DocsPage.vue` | 12 | yes | Already uses the established search-plus-regex-builder component. |
| `downloads/DownloadRowCard.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `downloads/ReleaseAssetList.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `downloads/ReleaseDownloads.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `dropRender/DropRenderZone.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `eula/EulaSectionPanel.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `eula/EulaSurface.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `eula/EulaViewer.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `gallery/ScreenshotGalleryScreen.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `github/GhCliAccountsList.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `github/GhEntityPicker.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `github/LegacyCredentialCleanup.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `glossary/GlossaryTerm.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `history/HistoryComparison.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `history/HistoryPanel.vue` | 6 | yes | Already uses the established search-plus-regex-builder component. |
| `history/HistoryReadableDiff.vue` | 3 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `history/HistoryRevisionRow.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `history/SimpleHistoryList.vue` | 4 | yes | Already uses the established search-plus-regex-builder component. |
| `history/SimpleHistoryPanel.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `home/HomeScreen.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `locks/LockList.vue` | 8 | yes | Already uses the established search-plus-regex-builder component. |
| `locks/LockWizard.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `locks/SupportTickets.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `locks/UnlockPrompt.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `markers/MarkerMenu.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `markers/MarkerRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `markers/MarkerSearchField.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `markers/MarkerSetRow.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `markers/MarkerStudio.vue` | 9 | yes | Already uses the established search-plus-regex-builder component. |
| `markers/RegexBuilder.vue` | 6 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `markers/StudioMarkerLayerHost.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `mcserver/AdoptionReviewDialog.vue` | 16 | yes (fixed here) | FIXED this task: evidence/mounts/ports lists had no filter; added a combined ConfigSearchField with per-section no-match states. |
| `mcserver/CreateServerWizard.vue` | 11 | yes | Version catalogue step uses `ConfigSearchField` with a per-wizard query, plain-text default, anchored regex builder, and local filtered version options. |
| `mcserver/PlayerManager.vue` | 19 | yes | Already uses the established search-plus-regex-builder component. |
| `mcserver/PluginManager.vue` | 23 | yes (fixed here) | FIXED this task: installed-plugins list had no local filter; added ConfigSearchField over name/source/version/path with no-match state. |
| `mcserver/ServerConfigEditor.vue` | 4 | yes | Already uses the established search-plus-regex-builder component. |
| `mcserver/ServerConsole.vue` | 8 | yes | Live transcript uses `ConfigSearchField` with its own query, stream-filter composition, plain-text default, anchored regex builder, and local no-match behavior. |
| `mcserver/ServerListScreen.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `mcserver/WebConsolePanel.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `menu/InfoPage.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `menu/MainMenu.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `menu/MapsMenu.vue` | 3 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `menu/MenuChoice.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `menu/MenuGroup.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `menu/MenuOption.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `menu/MenuOptionList.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `menu/MenuRegexBuilder.vue` | 4 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `menu/MenuSearchBar.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `menu/MenuSearchField.vue` | 3 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `menu/MenuSideSheet.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `menu/MenuSlider.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `menu/MenuSuperConfirm.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `menu/MenuSwitch.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `menu/SettingsMenu.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `menuSearch/MenuSearchList.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `notifications/NoticeCentrePanel.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `notifications/NotificationCentre.vue` | 3 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `ollama/OllamaScreen.vue` | 25 | yes | Already uses the established search-plus-regex-builder component. |
| `pages/PagesScreen.vue` | 7 | yes | Already uses the established search-plus-regex-builder component. |
| `pages/StaticExportCard.vue` | 5 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `palette/CommandPalette.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `palette/PaletteRow.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `preview/PreviewScreen.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `progress/RenderProgressDetail.vue` | 5 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `progress/RenderThroughput.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `project/DiscoveredWorldsPanel.vue` | 4 | yes | Already uses the established search-plus-regex-builder component. |
| `project/ProjectEditor.vue` | 9 | yes | Already uses the established search-plus-regex-builder component. |
| `project/ProjectList.vue` | 6 | yes | Already uses the established search-plus-regex-builder component. |
| `project/ProjectMapsPanel.vue` | 8 | yes | Already uses the established search-plus-regex-builder component. |
| `project/ProjectRenderOption.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `project/ProjectStoragesPanel.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `project/ProjectsScreen.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `releaseLedger/ReleaseLedgerViewer.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `remote/DockerHostingScreen.vue` | 4 | yes | Already uses the established search-plus-regex-builder component. |
| `remote/DockerStateNote.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `remote/RemoteFileBrowser.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `remote/RemoteHostingPanel.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `remote/RemoteHostingScreen.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `remote/RemotePreflightPanel.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `remote/RemoteTargetEditor.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `remote/RunLocationCard.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `renders/RendersScreen.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `repair/IssueReportPanel.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `repair/RepairPanel.vue` | 3 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `settings/AddonManagerPanel.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `settings/AppSettings.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `settings/BlueMapSourceRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `settings/DependencyInstallerPanel.vue` | 6 | yes | Already uses the established search-plus-regex-builder component. |
| `settings/DockedSurface.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `settings/DownloadConcurrencyRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `settings/EngineChoicePanel.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `settings/JavaRuntimeRow.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `settings/NotificationDurationRow.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `settings/ProductDisplayNameRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `settings/RenderMemoryRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `settings/SettingsSection.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `settings/StorageSettingRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `settings/SurfacePlacementRow.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `settings/ThemeRow.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `settings/UiSizeRow.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `settings/WorldFolderRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/ConsentQuote.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `setup/ConsentSettingsRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/FirstRunSetup.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `setup/LanguageSettingsRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/SchoolModeSettingsRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/SetupConsentStep.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/SetupEulaStep.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/SetupLanguagePanel.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `setup/SetupStorageStep.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/SetupText.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/SetupWelcomeStep.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/WelcomeIntro.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `setup/WelcomeSurface.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `shell/AppRail.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `shell/AppTitleBar.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `shell/CataloguePage.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `shell/HomeCatalogues.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `shell/NotificationPanel.vue` | 3 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `shell/ProblemsPanel.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `shell/StatusStrip.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `shell/WorkPane.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `startup/StartupRecoveryBanner.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `structures/StructureList.vue` | 12 | yes | Already uses the established search-plus-regex-builder component. |
| `tabs/TabBulkClose.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `tabs/TabButton.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `tabs/TabClosePanel.vue` | 0 | yes | Already uses the established search-plus-regex-builder component. |
| `tabs/TabFinder.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `tabs/TabGroupMenu.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `tabs/TabGroupPicker.vue` | 9 | yes | Already uses the established search-plus-regex-builder component. |
| `tabs/TabMenuList.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `tabs/TabPlanConfirm.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `tabs/TabPlanPreview.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `tabs/TabResultList.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `tabs/TabStrip.vue` | 30 | yes | Already uses the established search-plus-regex-builder component. |
| `tabs/TabbedNavigation.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `tutorial/TutorialOverlay.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `update/UpdateBanner.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `update/UpdateStatusRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `vocabulary/VocabularyUploadRow.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `world/BedrockConversionNote.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `world/ContainerOffers.vue` | 3 | yes | Already uses the established search-plus-regex-builder component. |
| `world/DimensionSelection.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `world/DockerWorldSourcePanel.vue` | 5 | yes | Already uses the established search-plus-regex-builder component. |
| `world/InterruptedRenders.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `world/LiveSpeedControl.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `world/MapIdentityStep.vue` | 3 | no — reviewed | Reviewed: transient/small live-progress or wizard-step content, not a persistent browsable collection. No search required. (spot-checked individually; see report) |
| `world/MapOptionsStep.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `world/MapStorageStep.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `world/MinecraftWorldList.vue` | 2 | yes | Already uses the established search-plus-regex-builder component. |
| `world/RenderRunPanel.vue` | 0 | n/a | No list/table/select/menu markers found; not a candidate surface. |
| `world/SshWorldSourcePanel.vue` | 1 | yes | Already uses the established search-plus-regex-builder component. |
| `world/WizardReviewStep.vue` | 7 | yes | Already uses the established search-plus-regex-builder component. |
| `world/WorldFolderStep.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `world/WorldScreen.vue` | 1 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `world/WorldWizard.vue` | 2 | no — reviewed | Reviewed: a single fixed-size control (VSelect with a handful of items, or one VMenu that is a value editor), not a growing user collection. No search required. |
| `worldrepo/WorldRepoScreen.vue` | 14 | yes | Already uses the established search-plus-regex-builder component. |
