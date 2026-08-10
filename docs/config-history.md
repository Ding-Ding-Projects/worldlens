# Local version history for config folders

Every BlueMap config folder the app edits gets its own local git history. The history lives in an
isolated repository beside the app's data directory — never as a `.git` inside the folder the user
chose — and every save records a complete snapshot of the folder as it actually is, deletions
included. Nothing is synced, pushed or shared: the history is local, and there is no channel
through which a remote could even be configured.

The same machinery — `design/packages/app/src/main/history/` — also backs a world's project file
(`design/packages/app/src/main/project/history.ts`), and, as of this document, the server-profile /
maps-and-servers list and the application's own settings. Everything below through "Failure modes"
describes the config-folder history specifically; [Beyond config folders](#beyond-config-folders-profiles-and-application-settings)
below describes the other three and, for the profile list and the settings, what still has to
change before saving one of them in the running app actually produces a revision.

## Behaviour

- **Where it lives.** `<Electron userData>/config-history/<folder-slug>-<hash16>/`, one real git
  repository per config folder, holding a *mirror* of the folder's files on a branch named
  `history`. The folder-to-repository mapping sits in `projects.json` next to them, written
  atomically; because the repository name is derived from a hash of the folder path, a lost index
  file only loses labels for the mapping, not the history itself.
- **When it records.** After every successful save from the options editor, fire-and-forget. An
  unchanged folder records nothing, so the panel stays a list of real events.
- **What a revision says.** Labels name what changed — "Deleted the nether map", "Added the nether
  map, changed the core settings" — never a bare "Updated".
- **Restore is append-only.** Restoring first snapshots whatever is on disk (so edits made outside
  the editor are caught and kept), then writes the old files back through the same guarded write
  path the editor uses, then records the restore itself as a new revision with a `Restored-From`
  trailer. There is no `reset`, no `amend`, no `rebase`; an undo can be undone, and that undo
  undone in turn.
- **A restore can be the whole folder, one file, or one setting.** All three take the same route
  and get the same guarantees. The panel's own label says which happened: "Restored the config as
  it was at …" for the whole folder, "Put the nether map back as it was at …" for one file, "Put
  the setting sky-color back as it was at …" for one setting. That distinction is load-bearing,
  because the two rows imply completely different things about every file the row does not name.
- **The panel.** A **History** tab in the config screen: browse, compare, diff, restore, label,
  trim and export. The date filter is the same advanced calendar picker the changelog viewer uses;
  the action chips are derived from the revisions actually present, with counts; the search field
  carries the full regex builder like every other search surface. All three filters compose.
  Export writes Markdown, JSON, CSV or plain text, states which slice it holds, and also reaches
  the clipboard.

## Comparing any two revisions

Choosing **A** on one row and **B** on another compares those two moments however far apart they
are. The panel had only revision-against-parent before, which could not answer the question people
actually arrive with: *what has changed since the config last worked?* Four saves ago meant four
patches to read and merge in your head, and the usual outcome was restoring the whole folder and
losing every good change made since.

The comparison is a surface above the list rather than a dialog, so the rows it was built from are
still there, still filterable, still selectable. The header names both ends with their dates and
always puts the older one at A; **Swap** reverses it rather than making somebody unpick their
choices. The comparison exports and copies in the same four formats the history does, stating which
two revisions it holds.

## A readable diff, with the raw patch behind it

A unified patch is a diff of *lines*, and these files are not lines, they are settings. The two
coincide often enough to look acceptable and then stop exactly when it matters:

- `-sky-color: "#7dabff"` / `+sky-color: "#ffffff"` is two lines to compare character by character
  to learn one fact. `sky-color: #7dabff to #ffffff` is the fact.
- A setting that moved in the file with the same value is a five-line patch describing a change
  that did not happen.
- A comment somebody added is a hunk with no setting change in it, sitting between the reader and
  the change they were looking for.

So the main process sends both sides of each file whole (capped, and stating when a side was
withheld for being too large or not text), and the panel reads them with the same
`@worldlens/config` HOCON model the editor writes files with, flattens each to
`dotted.key -> value`, and reports the difference between those two maps. `.json` files are read
the same way.

**The raw patch never goes away.** Every file keeps it behind a `<details>` disclosure: closed
because the settings above answer the question nine times in ten, one keystroke away because the
tenth time nothing else will do. A file that cannot be parsed - one this editor does not model,
one too large, one that is not text - falls back to the patch **and says which and why**, rather
than rendering an empty list that would read as "nothing happened". An empty list and a fallback
are different states and the panel words them differently: empty means the file changed but no
setting did, which is a real thing to be told.

## Selective restore

Every readable diff offers **Put this file back** beside each file and a restore control beside
each setting.

- **One file** is put back by the main process from the revision's own bytes. A named file that
  did not exist at that revision is taken off the disk, because that is the honest meaning of "put
  it back as it was". Files that are not named are not touched in either direction.
- **One setting** is a merge rather than a copy: the file keeps every other setting, every comment
  and its formatting, and only the chosen key takes its old value. The merge happens in the
  renderer because the round-tripping HOCON reader and writer are `@worldlens/config`, and
  a second copy of them in the main process would be a second HOCON implementation to disagree
  with the one that writes every save. What the main process still checks, rather than assumes:
  the revision exists in this folder's history; every path is one this editor would write
  (`checkConfigPath`); every path is one that revision or the folder currently holds; the total
  text is within a stated cap. It then snapshots the folder first and records the write as a new
  revision with the `Restored-From` trailer.
  A `.json` file is re-serialised in the editor's own layout, because JSON keeps no comments to
  preserve, and the panel says so before it happens rather than letting it arrive as a surprise in
  the next diff.

A merge that would come to nothing - the setting already holds that value, the file is gone, the
file cannot be parsed - is refused with a sentence naming the key and the reason. A partial merge
that quietly did three of four settings would leave somebody believing a setting was restored when
it was not, which is worse than a refusal, because a refusal is visible.

## The timeline

Revisions are grouped by the local day they fall on, with a sticky day heading carrying the number
of revisions, the number of *distinct* files touched (two edits to one file count once) and the
added / changed / taken-away split. Grouping never re-sorts, in either dimension: the timeline
shows the order the list is in, because a timeline that imposed its own would disagree with the
list it is drawn from and the reader would have no way to tell which was lying.

The revision that is on disk right now is marked from the **unfiltered** history, never from the
first row of the view. The newest row of a filtered view is merely the newest thing that matched,
and calling it live would be a confident lie in exactly the situation - somebody hunting through a
filtered history for something to restore - where being wrong about it matters most. When a filter
hides the live revision, nothing is marked at all.

A revision whose timestamp cannot be read goes into a final group of its own rather than being
dropped: it is still a revision somebody may need to restore.

## Keyboard and screen reader

- The list uses a **roving tabindex**: one row is a tab stop and the rest are not, so a
  two-hundred-revision history is not two hundred tab stops between the search field and the
  retention control. Tab still reaches every control inside the focused row.
- <kbd>&uarr;</kbd> / <kbd>&darr;</kbd> move between revisions and stop at the ends rather than
  wrapping, <kbd>Home</kbd> / <kbd>End</kbd> jump to them, <kbd>Enter</kbd> or <kbd>Space</kbd>
  opens a revision, <kbd>A</kbd> and <kbd>B</kbd> choose the two comparison ends, <kbd>Esc</kbd>
  closes the comparison. Every one of those is stated on screen beneath the list.
- Keystrokes are handled only when they came from a row itself. Without that check, typing the
  letter `a` into a row's label field would silently choose that row as a comparison end.
- Each row carries **one** accessible name covering its label, time, action, note, live state and
  comparison role, rather than leaving four chips to be read in whatever order the markup puts
  them. The live revision also carries `aria-current`.
- One polite live region announces what the keyboard just did - "2 of 12. Deleted the nether map",
  which end a revision became, that a comparison was swapped or closed. It is positioned off
  screen rather than hidden, because `display: none` would take it out of the accessibility tree
  and it would announce nothing while looking like a working implementation.
- Every diff block is focusable and scrolls rather than clipping; the smooth scroll on the
  timeline is inside a `prefers-reduced-motion: no-preference` block, so reduced motion is
  respected by default rather than by an override.

## Degrading to an older shell

The three newer channels - `history:compare`, `history:restoreFiles`, `history:restoreSettings` -
are probed on the bridge **one at a time**, unlike the original eight, which remain all-or-nothing.
A desktop shell built before them still keeps a perfectly good history, and refusing the whole
panel would take away the eight things it can do to punish it for the three it cannot. Where
`compare` is absent the panel falls back to `history:diff` and shows the raw patch, which is what
it always showed; where the selective restores are absent, the A/B and per-setting controls are not
rendered at all, rather than being rendered and failing when pressed.

## Configuration

Retention is the one knob: **trim to the newest N revisions** from the panel. Trimming is the only
operation that deletes anything, so it sits behind the super-confirmation gate (two keys and the
slider) and refuses to discard everything — a retention setting cannot empty a history.

## Beyond config folders: profiles and application settings

Issue #35 asked for the same append-only history to cover three more things: the server-profile /
maps-and-servers list, the application's own settings, and — per the issue's own reading of its
third item — the maps-and-servers list is the profile list seen from the interface, not a second
store. So this is two new histories, not three, each with its own repository family beside the
existing `config-history/` and `project-history/` ones:

| Covered by this change | Where the main-process module lives | Repository family |
|---|---|---|
| Server profiles / the maps-and-servers list | `design/packages/app/src/main/profiles/` | `<userData>/profiles-history/` |
| Application settings | `design/packages/app/src/main/settings/` | `<userData>/app-settings-history/` |

Both are built on exactly the machinery above — `snapshotProject`, `restoreRevision`,
`HistorySource`, the isolated git configuration, `rememberProject` — the same way
`project/history.ts` binds a world's project file to it. Nothing about the append-only contract is
weaker here: a restore snapshots what is on disk first, writes the old file back, and records the
restore itself as a new revision; a failed history write never fails the save that triggered it,
because the git runner returns failures as values and the IPC handlers resolve rather than reject.

### Why this needed a decision before any code, and which one was made

The existing history is a **main-process** feature: it runs git against files on disk. The server
profile list and the application's settings are **renderer** state today, persisted straight to the
browser's `localStorage` by `design/packages/ui/src/stores/profiles.ts` and by several independent
stores under `design/packages/ui/src/components/settings/` and `design/packages/ui/src/components/`
(`appearanceStore.ts`, `dockPlacement.ts`, `palettePrefs.ts`, `menuPrefs.ts`, `setupPrefs.ts`,
`tabStorage.ts`, `eulaStorage.ts`, `remoteTargets.ts` among them) — none of which the main process
can see, and therefore none of which it could keep a history of without a decision.

The issue named two options: move the data into the main process (a JSON file the existing history
machinery can snapshot, with a one-way migration for what is already in `localStorage`), or have the
renderer hand every new state to the main process to be snapshotted while `localStorage` stays the
live copy. The second option means two sources of truth that can drift; the first is the better fit
with everything else this feature already does, so **Option A** is what was built: a real JSON file
per store, in a real directory beside the application's data, read and written by the main process
and mirrored into its own history repository exactly the way a config folder is.

- `profiles/store.ts` — `<userData>/profiles-store/profiles.json` is the live copy of the profile
  list (id, name, url, whether remote customisations are trusted, and a locally rendered map's data
  root). Reading a missing or malformed file degrades to the empty state, the same tolerance
  `history/store.ts`'s own mapping file gets; writing goes through a temporary file and a rename, so
  a crash mid-write cannot leave a half-written list.
- `settings/store.ts` — `<userData>/app-settings-store/settings.json` holds a `values` bag keyed by
  whatever name a settings surface gives its own preferences. This layer deliberately does not know
  what any individual setting means: typing every one of today's dozen `localStorage`-backed
  preferences here, in one pass, would make this file the thing every settings surface has to agree
  with before any of them could migrate, and there are more of those surfaces than there was time to
  move in this change. A changed key is named by its key in the revision label — "Changed appearance,
  dockPlacement" — which is less pretty than a hand-written sentence and honest about what this layer
  actually knows, the same restraint `history/describe.ts` shows a config file it does not model.

Each gets its own describer (`profiles/describe.ts`, `settings/describe.ts`) so a revision names what
changed rather than saying "Updated": a profile added, edited or deleted by name, which profile
became active, or which setting keys were added, changed or removed — never a bare "Changed
profiles.json", which is what diffing the raw file would produce for every single edit.

### What is genuinely wired, and what still needs the renderer's half

**The main-process side is complete and tested**: `profilesHistory:read` / `:save` / `:list` /
`:restore` and `settingsHistory:read` / `:save` / `:list` / `:restore` are registered on every
launch (`packages/app/src/main/index.ts`), backed by real git repositories, with the full
append-only contract proven the same way `history/ipc.test.ts` proves it for config folders — a save
records exactly one revision, an unchanged save records nothing, a restore is itself a new revision,
undoing a restore is another restore, a machine with no git is an honest state rather than a lost
save, and a git that fails mid-commit leaves the file on disk exactly as it was written.

**What is genuinely wired today, past the four steps below:**

1. **Done.** Both bridges are exposed on the preload
   (`design/packages/app/src/preload/index.ts`), the same way `history:*` and `project:*` are —
   `profilesHistory` and `appSettingsHistory`, each with `read`/`save`/`list`/`restore`.
2. **Done.** `design/packages/ui/src/stores/profiles.ts`'s persistence watcher calls
   `profilesHistory.save` with the current `ProfilesState` after every mutation — fire-and-forget,
   in addition to writing `localStorage`, which stays the real source of truth (see step 3). The
   maps-and-servers list is this same store read from the interface, so wiring it wires both at
   once. Every other `localStorage`-backed settings surface goes through
   `design/packages/ui/src/stores/appSettingsHistorySync.ts`'s `recordAppSetting(key, value)`
   instead, because `settings.json` holds one flat `values` bag shared by every wired surface and a
   surface that saved only its own key would silently erase every other surface's already-recorded
   value the next time it ran — `recordAppSetting` reads the bag that is there now, merges in the
   calling surface's own key, and saves the merge. Every `localStorage`-backed store this package
   has is now either wired this way or named as a deliberate exclusion, and the pair of lists in
   `appSettingsHistorySync.ts` — `APP_SETTINGS_HISTORY_KEYS` and `EXCLUDED_APP_SETTINGS` — is the
   audit trail, each entry checked against the real source by
   `appSettingsHistoryManifest.test.ts` rather than trusted on its word:

   | Key | Store | What it holds |
   |---|---|---|
   | `menuSearch` | `components/menu/menuPrefs.ts` | whether a menu search bar is open, per surface |
   | `appearance` | `components/appearance/appearanceStore.ts` | the whole appearance/theme record |
   | `dockPlacement` | `components/settings/dockPlacement.ts` | which edge (or floating) each docked surface uses |
   | `palette` | `components/palette/palettePrefs.ts` | the command palette's card/full-window size |
   | `remoteTargets` | `components/remote/remoteTargets.ts` | the saved remote render targets (no secret field — see that file's own doc comment) |
   | `eulaTabs` | `components/eula/eulaStorage.ts` | the EULA viewer's own tab arrangement |
   | `markerFiltersOpen` | `components/markers/MarkerMenu.vue` | whether the marker filters panel is open |
   | `mapStorageDir` | `components/setup/mapStorage.ts` | the chosen folder for rendered maps |
   | `languageMode` | `components/setup/setupI18n.ts` | English / Cantonese / bilingual |
   | `funnyLevelEn`, `funnyLevelYue` | `components/setup/setupI18n.ts` | the two independent funny-level sliders |
   | `updateDismissed` | `components/update/updateModel.ts` | the last update version whose banner was put away |
   | `tabs.<storage key>` | `components/tabs/tabStorage.ts` | one entry per tab strip this module backs (the main shell, Settings, the config editor, a project editor), namespaced by the strip's own `localStorage` key so the four cannot collide |

   Two keys are named instead as deliberate exclusions, both inside `dockPlacement.ts`:
   `dockSize` and `dockFloating` are written on **every pointermove frame** while a panel is
   resized or dragged (`DockedSurface.vue`'s splitter and header handlers call `setDockThickness`
   / `setDockFloatingRect` continuously, never only at drag-end), so mirroring either would turn
   one drag gesture into dozens of history revisions of pure noise. The *discrete* choice this
   geometry serves — which edge a panel docks to — is the `dockPlacement` key above.
3. **Not yet done.** Reading `profilesHistory:read` / `appSettingsHistory:read` at startup as the
   source of truth, with the existing `localStorage` value kept as a fallback and a one-time,
   idempotent copy into the new store — safe to run twice, because writing the same state twice
   records nothing the second time. `localStorage` remains authoritative until this step lands.
4. **Done, on `AppSettings.vue`'s own History tab.** Both histories are searchable and
   date-filterable now, through `SimpleHistoryPanel.vue`
   (`design/packages/ui/src/components/history/`) rather than `HistoryPanel.vue` itself: they
   reuse `historyModel.ts`'s filter functions (the same search-plus-date-range-plus-action
   composition `HistoryPanel.vue` uses) and `ChangelogDateFilter.vue` (the same calendar the
   changelog viewer uses), but not `HistoryPanel.vue`'s further extras — comparing two
   revisions, restoring one file or one setting, discarding older revisions — none of which
   exist on the other side of `SimpleHistoryHost` (`list` and `restore`, nothing else). Export
   is not offered here either, for the same reason: `HistoryPanel.vue`'s export writes the
   folder and repository path this host does not carry.
   `SimpleHistoryList.vue` — the plain, unfiltered list this panel supersedes for these two
   histories — stays exactly as it was and stays mounted exactly where it was:
   `ProjectEditor.vue`'s own History tab, which a separate, concurrent piece of work is
   extending into a project-autosave history with its own search-and-date requirements already
   in its brief. `SimpleHistoryPanel.vue` is a sibling component, not a rewrite of
   `SimpleHistoryList.vue`, precisely so that project history is untouched by this change.

None of this changes the promise the main-process half already keeps: once a caller does hand it a
state to save, the history it keeps is real, local, append-only, and never blocks or fails the save
it is recording. And none of the renderer-side wiring above changes it either: a rejected or missing
`save` call is swallowed at the call site, exactly as `docs/config-history.md`'s own failure-mode
rule requires, so a history mirror that cannot be written never turns a settings or profile change
into an error.

## Failure modes

- **A failed history write never fails the save.** This is structural, not conventional: the git
  runner returns failures as values rather than throwing, every IPC handler resolves, and the
  snapshot call after a save is fire-and-forget. A history that cannot be kept must not turn a
  save that worked into one that failed.
- **No git on the machine.** The panel says plainly what is lost and that everything else still
  works; it offers no control it cannot honour. Nothing else in the app changes.
- **A restore that cannot put a file back** reports which files failed rather than pretending it
  succeeded; the pre-restore snapshot it took first still holds what was on disk.
- **A file the readable diff cannot parse** falls back to the raw unified patch and names the file
  and the reason. It never shows an empty settings list for a file that definitely changed.
- **A setting that cannot be merged** is refused by name with the reason, and nothing is written.
  The three cases are: the file is not in the folder now (put the whole file back instead), the
  file cannot be parsed at one end or the other, and the setting already holds the value it had.
- **A machine's global gitconfig cannot reshape a history.** Every git invocation pins its own
  configuration (no global or system config, forced identity, signing off, `autocrlf` off,
  hooks bypassed), so a template, hook or signing requirement elsewhere on the machine cannot
  break or alter what gets recorded.

## Security considerations

The history is a second copy of the config folder's contents, with the same sensitivity as the
folder itself — config files can hold database connection strings. It is kept under the app's own
data directory with the same protections as the rest of the app's data, and never leaves the
machine. Restores write only through the config editor's existing guarded write path, inheriting
its path refusals, so a crafted revision cannot direct a write outside the config folder.

## Verification

`design/packages/app/src/main/history/ipc.test.ts` runs the append-only contract against real git
repositories in real temporary directories (62 tests), including: one revision per change with an
honest label, nothing recorded when nothing changed, no `.git` ever created in the user's folder,
no remote ever, restore recorded as a new revision, undo-of-undo-of-undo, the pre-restore disk
snapshot, partial-restore honesty, trim keeping the newest and refusing to empty, and a save
surviving a history that fails. The comparison and selective-restore work adds: two revisions
several apart compared in one call, both sides sent whole, `null` rather than `""` for a side a
file did not exist on, the first revision opening against the empty tree, one file put back while
another file's later edit survives, a named file taken off the disk when it was not there then, a
partial restore itself being undone, a merged setting write refused for a path this editor would
not write, for a file neither the revision nor the folder holds, and for a revision that is not in
this history, plus the pre-merge snapshot catching an edit made outside the editor. The no-git
block runs everywhere and now covers the three newer channels too; the real-git block skips itself
only where git is absent — the same situation those no-git tests cover.

The interface carries 121 further tests across five files: the filtering model and both exports
(`historyModel.test.ts`), the readable diff against real HOCON including the moved-setting and
added-comment cases a line diff gets wrong (`historyDiff.test.ts`), the setting merge proving
comments and neighbouring settings survive (`historyRestore.test.ts`), the day grouping and the
live-state marking (`historyTimeline.test.ts`), and the mounted panel covering A/B comparison
through the real buttons, keyboard navigation, the live region, selective restore, and the
fallback for a shell that predates the newer channels (`HistoryPanel.test.ts`).

The trim gate is declared in the super-confirmation inventory (`superConfirmPolicy.test.ts`), so a
new destructive call cannot slip past unnoticed; the setting merge's in-memory key removal is
declared there too, as a `buffer` transform that never reaches the disk by itself.

`design/packages/app/src/main/profiles/ipc.test.ts` and
`design/packages/app/src/main/settings/ipc.test.ts` run the same append-only contract against the
two new histories, mirrored from `project/ipc.test.ts`'s structure: exactly one revision per save,
each with an honest label naming the profile or setting that moved; nothing recorded when a save
changed nothing; no `.git` inside either live store, with the repository kept in its own family
beside `config-history/` and `project-history/`; a save on a machine with no git still writes the
file and reports the history failure separately; a git that fails mid-commit leaves the save intact;
and a restore recorded as a new revision, provably undoable in turn.

## Pruning and export reach every history, not only a config folder's

`discardOlderRevisions` was originally a config-folder-only extra. It no longer is: `project:discardOlder`,
`profilesHistory:discardOlder` and `settingsHistory:discardOlder` all wrap the same generic
`discardOlderRevisions(git, keep)` in `history/repository.ts` — no new git logic, three more thin IPC
wrappers with the same "keep a whole number of at least one" refusal `history:discardOlder` already
enforces. `SimpleHistoryHost.discardOlderRevisions` is optional, probed the same one-at-a-time way
`HistoryHost`'s own extras are: a shell that predates it still offers a perfectly good browse-and-restore
list, just without a trim control that would otherwise throw. Where the bridge has it,
`SimpleHistoryList.vue` (the project History tab) and `SimpleHistoryPanel.vue` (the profile and
application-settings sections in Settings) both grow a "Revisions to keep" field and a trim button
behind `ConfigSuperConfirm` — the same two-key gate, the same "cannot be restored afterwards" wording,
as the config-folder panel's own retention control. Export needs no new backend at all: it formats
whatever `list()` already returned, through the same `exportRevisions` used by `HistoryPanel.vue`, so a
project's, a profile list's or the application settings' history can leave as Markdown, JSON, CSV or
plain text exactly like a config folder's can.

## What the user is told when a save's history could not be kept

`ProjectSaveResult.historyOk`/`historyMessage`/`revision` existed on the bridge from the start but were
silently dropped by `preload/index.ts`'s `writeProject` convenience wrapper before the interface ever saw
them — the exact "built and unreachable" pattern this project keeps finding, one layer deeper: the type
was declared and even exported, but nothing on the other side of the call ever read it. `writeProject` now
passes all three through, and `ProjectsScreen.vue`'s manual save raises a second, persistent warning notice
- separate from the "Saved" success toast - whenever `historyOk` is `false`, naming what the history layer
could not do. The autosave scheduler's own outcomes reach the same policy through
`stores/projectAutosaveNotices.ts`: a routine, successful autosave (`reason: "quiet"`, or a flushed
`"boundary"`/`"destructive"`/`"quit"` that still succeeded) raises nothing at all - the project's own
History tab is the ambient "your work is being kept" indicator - and only a failed write or a failed
history record ever interrupts, at every reason, because a broken safety net is exactly what the
non-blocking-notification rules call out as deserving attention. Repeat autosave failures inside one
minute share a `notify()` category and cooldown (new to `components/config/notifications.ts`, alongside
this work) so a repository that starts failing every autosave interrupts once and then stops interrupting,
while every occurrence still lands in the notification centre's reviewable history.

`SimpleHistoryPanel.test.ts` mounts the search-and-date-filterable panel directly, over a fake
`SimpleHistoryHost` (13 tests): the plain list still restores through the host and reloads; the
search bar really is `ConfigSearchField` with the regex builder reachable from it and plain text
the default; the date range and the action chips narrow the same result set the search already
narrowed rather than replacing it; the filter row starts collapsed with an honest badge count; the
two empty states — nothing recorded, and nothing matching — stay distinct, with one button to clear
every filter; and two panels mounted side by side, exactly as `AppSettings.vue` mounts the profile
and application-settings histories together, never share a `aria-controls` id.

## Suggested next

- [Super confirmation](./super-confirmation.md) — the gate in front of trim.
- [Changelog and the in-app changelog viewer](./changelog-viewer.md) — the date picker the
  history panel reuses.
- [The regex builder and the search bars it reaches](./regex-builder.md) — the search field on
  the panel.

## 廣東話

### 概覽

呢個 app 編輯嘅每一個 BlueMap config 資料夾，都有自己嘅本機 git 歷史 (local version history)。
歷史住喺 app 資料目錄隔籬一個獨立 repository 入面——永遠唔會喺用戶揀嗰個資料夾入面整個 `.git`——
而每一次儲存都會記低成個資料夾當刻嘅完整快照，連刪除都計埋。冇任何嘢會同步、push 或者分享：
歷史係本機嘅，而且根本冇一條 channel 可以設定得到 remote。

同一套機制——`design/packages/app/src/main/history/`——亦都撐住一個 world 嘅專案檔
（`design/packages/app/src/main/project/history.ts`），而截至呢份文件為止，
仲撐住 server-profile／maps-and-servers 清單，同埋應用程式自己嘅設定。
由呢度去到「失敗模式」為止，講嘅係 config 資料夾嘅歷史；
下面「超越 config 資料夾」嗰節就講其餘三個，以及對 profile 清單同設定嚟講，
仲要改乜先至令喺執行緊嘅 app 度儲存佢哋真係會產生一個修訂。

### 行為

- **佢住喺邊。** `<Electron userData>/config-history/<folder-slug>-<hash16>/`，
  一個 config 資料夾一個真 git repository，喺一條叫 `history` 嘅分支上面放住嗰個資料夾檔案嘅*鏡像*。
  資料夾對 repository 嘅對應表就擺喺佢哋隔籬嘅 `projects.json`，以原子方式寫入；
  因為 repository 個名係由資料夾路徑嘅 hash 推導出嚟，就算索引檔唔見咗，
  失去嘅只係對應表嘅標籤，唔係歷史本身。
- **幾時會記錄。** 每次由選項編輯器成功儲存之後，fire-and-forget。冇改變嘅資料夾唔會記錄任何嘢，
  所以個面板維持係一張真實事件嘅清單。
- **一個修訂講乜。** 標籤會講明改咗乜——「刪咗 nether map」、「加咗 nether map，改咗 core 設定」——
  永遠唔會淨係一句「Updated」。
- **還原係 append-only。** 還原會先將磁碟上而家嗰個狀態影快照（所以喺編輯器外面做嘅改動都會捕捉兼保留），
  再經編輯器用緊嗰條有防護嘅寫入路徑將舊檔寫返，然後將呢次還原本身記錄成一個新修訂，
  帶一個 `Restored-From` trailer。冇 `reset`、冇 `amend`、冇 `rebase`；
  一次 undo 可以再 undo，而嗰次 undo 又可以再 undo。
- **還原可以係成個資料夾、一個檔，或者一個設定。** 三者行同一條路、得到同樣嘅保證。
  面板自己嘅標籤會講明係邊種：成個資料夾係「將 config 還原成 … 嗰陣嘅樣」，
  一個檔係「將 nether map 放返 … 嗰陣嘅樣」，一個設定係「將設定 sky-color 放返 … 嗰陣嘅樣」。
  呢個分別好緊要，因為兩種列對於佢哋冇指名嗰啲檔，含意完全唔同。
- **個面板。** Config 畫面入面一個 **History** 分頁：瀏覽、比較、diff、還原、加標籤、修剪同匯出。
  日期篩選就係 changelog viewer 用嗰個進階日曆選擇器；動作 chip 係由實際存在嘅修訂推導出嚟，仲帶計數；
  搜尋欄位同其他每一個搜尋介面一樣帶住完整 regex builder。三個篩選可以組合。
  匯出寫得出 Markdown、JSON、CSV 或者純文字，會講明佢載住邊一截，亦去得到剪貼簿。

### 比較任何兩個修訂

喺一列揀 **A**、另一列揀 **B**，就可以比較嗰兩個時刻，隔幾遠都得。以前個面板淨係有「修訂對父修訂」，
答唔到人哋真正帶住嚟嗰條問題：*由 config 上次仲行得嗰陣開始，究竟變咗啲乜？*
四次儲存之前，即係要喺腦入面讀同合併四個 patch，而通常結果就係還原成個資料夾，
連之後做過嘅好改動都一併蝕晒。

比較係一個喺清單上面嘅介面，唔係一個 dialog，所以起佢嗰啲列仲喺度、仲篩得、仲揀得。
標題會連日期咁指名兩端，而且永遠將舊嗰個擺喺 A；撳 **Swap** 就掉轉，
唔使人哋拆返自己啲選擇。比較同歷史一樣支援四種格式嘅匯出同複製，並講明佢載住邊兩個修訂。

### 讀得明嘅 diff，後面仲有原始 patch

一個 unified patch 係*行*嘅 diff，但呢啲檔唔係行，係設定。兩者夾得夠密，
密到睇落可以接受，然後就啱啱喺最緊要嗰刻唔夾：

- `-sky-color: "#7dabff"` / `+sky-color: "#ffffff"` 係兩行要逐個字元比較先知一件事。
  `sky-color: #7dabff to #ffffff` 本身就係嗰件事。
- 一個喺檔入面搬咗位但值一樣嘅設定，會變成一個五行 patch，描述一個根本冇發生過嘅改動。
- 有人加咗個註解，會變成一個入面完全冇設定改動嘅 hunk，橫喺讀者同佢想搵嗰個改動之間。

所以 main process 會將每個檔兩邊嘅完整內容都送過去（有上限，
並會講明某一邊係咪因為太大或者唔係文字而被扣起），而個面板就用編輯器寫檔嗰個同一個
`@worldlens/config` HOCON model 讀佢哋，將每邊壓平做 `dotted.key -> value`，
再報告兩張 map 之間嘅差異。`.json` 檔都係同樣咁讀。

**原始 patch 永遠唔會消失。** 每個檔都用一個 `<details>` 摺疊住佢：預設閂埋，
因為上面啲設定十次有九次已經答到條問題；但一撳就開，因為第十次淨係佢先幫到手。
一個 parse 唔到嘅檔——編輯器冇 model 嘅、太大嘅、唔係文字嘅——會退回去顯示 patch，
**並講明係邊種同點解**，而唔係 render 一張空清單、令人讀成「乜都冇發生過」。
空清單同退回 patch 係兩種唔同狀態，面板用唔同字眼講：空即係個檔變咗但冇設定變過，
而呢個係真係值得話畀人知嘅事。

### 選擇性還原

每一個讀得明嘅 diff 都會喺每個檔隔籬提供 **Put this file back**，喺每個設定隔籬提供一個還原控制項。

- **一個檔**由 main process 用嗰個修訂自己嘅位元組放返。如果一個被指名嘅檔喺嗰個修訂根本唔存在，
  咁佢就會由磁碟上攞走，因為「放返做嗰陣嘅樣」老實嘅意思就係咁。冇被指名嘅檔兩個方向都唔會郁。
- **一個設定**係合併而唔係複製：個檔保住其他所有設定、所有註解同排版，
  淨係揀中嗰個 key 攞返舊值。合併喺 renderer 入面做，因為可以來回轉換嘅 HOCON reader 同 writer
  係 `@worldlens/config`，喺 main process 度再放一份就等於多咗一個 HOCON 實作，
  可以同寫每次儲存嗰個唔夾。而 main process 仍然會真係檢查、唔會假設嘅係：
  嗰個修訂真係喺呢個資料夾嘅歷史入面；每條路徑都係呢個編輯器會寫嘅路徑（`checkConfigPath`）；
  每條路徑都係嗰個修訂或者當前資料夾真係有嘅；總文字量喺訂明嘅上限之內。
  跟住佢會先影資料夾快照，再將嗰次寫入記錄成一個帶 `Restored-From` trailer 嘅新修訂。
  一個 `.json` 檔會用編輯器自己嘅排版重新序列化，因為 JSON 冇註解要保留，
  而面板會喺做之前講清楚，唔會等佢喺下一個 diff 度變成一個驚喜。

一次會得個吉嘅合併——設定本身已經係嗰個值、個檔冇咗、個檔 parse 唔到——
會被拒絕，並用一句嘢指名嗰個 key 同原因。一次靜靜雞做咗四個設定入面三個嘅部分合併，
會令人以為某個設定還原咗但其實冇，咁樣差過拒絕，因為拒絕係睇得見嘅。

### 時間軸

修訂按佢哋落喺邊個本地日子分組，有黐頂嘅日子標題，帶住嗰日嘅修訂數目、
被郁過嘅*不重複*檔案數目（同一個檔改兩次計一次），同埋新增／改動／攞走嘅分佈。
分組喺任何一個維度都唔會重新排序：時間軸顯示嘅就係清單本身嘅次序，
因為一個強加自己次序嘅時間軸，會同佢畫出嚟嗰張清單唔一致，而讀者亦冇辦法分邊個講大話。

而家真係喺磁碟上嘅嗰個修訂，係由**未篩選**嘅歷史度標出嚟，永遠唔會用當前檢視嘅第一列。
一個已篩選檢視嘅最新一列，只不過係最新一個符合條件嘅嘢，
叫佢做 live 就係喺「有人喺一段已篩選嘅歷史入面搵嘢還原」——即係講錯咗最大鑊嗰個情況——
自信咁講大話。當篩選遮住咗 live 修訂嗰陣，就乜都唔標。

一個讀唔到時間戳嘅修訂，會自成一個最後嘅分組，而唔係被丟棄：佢始終都係一個可能有人要還原嘅修訂。

### 鍵盤同螢幕閱讀器

- 清單用 **roving tabindex**：得一列係 tab 停留點，其餘唔係，
  所以一段二百個修訂嘅歷史，唔會喺搜尋欄同保留設定之間夾住二百個 tab 停留點。
  Tab 仍然去到聚焦嗰列入面每一個控制項。
- <kbd>&uarr;</kbd> / <kbd>&darr;</kbd> 喺修訂之間移動，去到頭尾就停，唔會 wrap；
  <kbd>Home</kbd> / <kbd>End</kbd> 直接跳去頭尾；<kbd>Enter</kbd> 或者 <kbd>Space</kbd> 打開一個修訂；
  <kbd>A</kbd> 同 <kbd>B</kbd> 揀比較嘅兩端；<kbd>Esc</kbd> 閂埋比較。
  呢啲全部都喺清單下面寫喺畫面上。
- 只有由列本身發出嘅按鍵先會處理。冇咗呢個檢查，喺一列嘅標籤欄位度打個 `a` 字，
  就會靜靜雞將嗰列揀做比較嘅一端。
- 每一列帶住**一個**無障礙名稱，涵蓋佢嘅標籤、時間、動作、備註、live 狀態同比較角色，
  而唔係留低四個 chip 畀人按 markup 嘅次序亂咁讀。Live 修訂仲會帶 `aria-current`。
- 一個 polite live region 宣告鍵盤啱啱做咗乜——「2 of 12. 刪咗 nether map」、
  某個修訂變成咗邊一端、一次比較被掉轉或者閂咗。佢係擺出畫面外而唔係隱藏，
  因為 `display: none` 會將佢由無障礙樹度攞走，變成乜都唔宣告但睇落好似做咗嘢。
- 每個 diff 區塊都聚焦得到而且會捲動、唔會剪走內容；時間軸嘅平滑捲動包喺一個
  `prefers-reduced-motion: no-preference` 區塊入面，所以減少動態係預設就尊重，
  唔使靠覆寫。

### 對住舊 shell 嘅降級

三條較新嘅 channel——`history:compare`、`history:restoreFiles`、`history:restoreSettings`——
係喺 bridge 上面**逐條**探測，同原本嗰八條全有全冇嘅做法唔同。
一個喺佢哋出現之前起嘅桌面 shell，一樣有一段好好嘅歷史，
而為咗佢做唔到嗰三樣就拒絕成個面板、連佢做得到嘅八樣都攞走，係懲罰。
冇 `compare` 嘅時候，面板退回用 `history:diff` 顯示原始 patch，即係佢一路以嚟顯示嘅嘢；
冇選擇性還原嘅時候，A/B 同逐設定嘅控制項根本唔會 render，
而唔係 render 咗但撳落去就失敗。

### 設定

保留策略係唯一一個掣：喺面板度**修剪到最新 N 個修訂**。修剪係唯一一個會刪嘢嘅操作，
所以佢擺喺 super-confirmation 閘後面（兩粒掣加一條 slider），
而且拒絕丟晒全部——一個保留設定唔可以清空一段歷史。

### 超越 config 資料夾：profile 同應用程式設定

Issue #35 要求同一套 append-only 歷史再涵蓋三樣嘢：server-profile／maps-and-servers 清單、
應用程式自己嘅設定，而按 issue 自己對第三項嘅理解——maps-and-servers 清單其實就係
由介面睇嘅 profile 清單，唔係第二個 store。所以呢個係兩段新歷史，唔係三段，
每段喺現有嘅 `config-history/` 同 `project-history/` 隔籬有自己嘅 repository 家族：
server profile／maps-and-servers 清單嘅 main-process 模組喺 `design/packages/app/src/main/profiles/`，
repository 家族係 `<userData>/profiles-history/`；應用程式設定嘅模組喺
`design/packages/app/src/main/settings/`，家族係 `<userData>/app-settings-history/`。

兩者都係起喺上面講嗰套機制上面——`snapshotProject`、`restoreRevision`、`HistorySource`、
隔離嘅 git 設定、`rememberProject`——同 `project/history.ts` 將一個 world 嘅專案檔綁上去嘅方式一模一樣。
Append-only 契約喺呢度冇任何削弱：還原會先影磁碟現狀嘅快照，再寫返舊檔，
再將呢次還原本身記錄成一個新修訂；一次失敗嘅歷史寫入永遠唔會令觸發佢嗰次儲存失敗，
因為 git runner 係將失敗當值回傳，而啲 IPC handler 係 resolve 而唔係 reject。

#### 點解寫任何 code 之前要先做決定，同埋做咗邊個決定

現有嘅歷史係一個 **main-process** 功能：佢對住磁碟上啲檔行 git。
但 server profile 清單同應用程式設定，今日係 **renderer** 狀態，
由 `design/packages/ui/src/stores/profiles.ts`，同埋 `design/packages/ui/src/components/settings/`
及 `design/packages/ui/src/components/` 底下幾個獨立 store（其中有 `appearanceStore.ts`、
`dockPlacement.ts`、`palettePrefs.ts`、`menuPrefs.ts`、`setupPrefs.ts`、`tabStorage.ts`、
`eulaStorage.ts`、`remoteTargets.ts`）直接持久化落瀏覽器嘅 `localStorage`——
呢啲 main process 一樣都睇唔到，所以唔做個決定就一段歷史都保唔到。

Issue 提出咗兩個選項：將啲資料搬入 main process（一個現有歷史機制影得到快照嘅 JSON 檔，
再為已經喺 `localStorage` 嗰啲做一次單向遷移），或者由 renderer 每次將新狀態交畀 main process 影快照，
而 `localStorage` 繼續做實時副本。第二個選項即係兩個會漂移嘅事實來源；
第一個同呢個功能其他所有做法都夾得好啲，所以起咗嘅係 **Option A**：
每個 store 一個真 JSON 檔，擺喺應用程式資料隔籬一個真目錄入面，由 main process 讀寫，
再好似一個 config 資料夾咁鏡像入佢自己嗰個歷史 repository。

- `profiles/store.ts`——`<userData>/profiles-store/profiles.json` 係 profile 清單嘅實時副本
  （id、名、url、遠端自訂係咪信得過，同埋一個本機 render 好嘅地圖嘅資料根目錄）。
  讀到一個唔存在或者格式壞咗嘅檔，會降級成空狀態，同 `history/store.ts` 自己嗰個對應檔一樣咁寬容；
  寫入行臨時檔加改名，所以寫到一半 crash 都唔會留低一張寫咗一半嘅清單。
- `settings/store.ts`——`<userData>/app-settings-store/settings.json` 載住一個 `values` 袋，
  以每個設定介面自己畀嘅名做 key。呢一層係刻意唔知道任何一個設定嘅意思：
  一次過將今日十幾個 `localStorage` 支撐嘅偏好全部打型別入去，
  就會令呢個檔變成每個設定介面喺遷移之前都要先夾嘅嘢，
  而嗰啲介面嘅數目多過今次改動有時間搬嘅。改咗嘅 key 會喺修訂標籤度用佢個 key 指名——
  「Changed appearance, dockPlacement」——冇一句人手寫嘅句子咁靚，
  但對呢一層真正知道啲乜係老實嘅，同 `history/describe.ts` 面對一個佢冇 model 嘅 config 檔時
  展示嘅克制一樣。

兩者各有自己嘅描述器（`profiles/describe.ts`、`settings/describe.ts`），
令一個修訂講得出改咗乜而唔係話「Updated」：邊個 profile 被加、改或者刪（連名）、
邊個 profile 變成 active，或者邊啲設定 key 被加、改或者移除——
永遠唔會淨係一句「Changed profiles.json」，而後者正正就係對住原始檔做 diff 每次都會出嘅嘢。

#### 真係駁通咗嘅部分，同仲要 renderer 嗰半嘅部分

**Main-process 嗰邊已經完成兼有測試**：`profilesHistory:read` / `:save` / `:list` / `:restore`
同 `settingsHistory:read` / `:save` / `:list` / `:restore` 每次啟動都會註冊
（`packages/app/src/main/index.ts`），背後係真 git repository，
而完整 append-only 契約嘅證明方式，同 `history/ipc.test.ts` 為 config 資料夾證明嗰套一樣——
一次儲存記剛好一個修訂、冇改變嘅儲存乜都唔記、還原本身係新修訂、
還原一次還原又係再一次還原、一部冇 git 嘅機係一個老實狀態而唔係一次失落嘅儲存，
而一個 commit 中途失敗嘅 git 會令磁碟上嗰個檔維持喺啱啱寫落去嗰個樣。

四個步驟入面：**第一步已完成**——兩條 bridge 都喺 preload 度露出咗
（`design/packages/app/src/preload/index.ts`），同 `history:*` 同 `project:*` 一樣，
分別叫 `profilesHistory` 同 `appSettingsHistory`，各有 `read`/`save`/`list`/`restore`。
**第二步已完成**——`design/packages/ui/src/stores/profiles.ts` 嘅持久化 watcher
喺每次變動之後都會用當前 `ProfilesState` 呼叫 `profilesHistory.save`，fire-and-forget，
同時照樣寫 `localStorage`，而後者仍然係真正嘅事實來源（見第三步）。
Maps-and-servers 清單就係由介面睇嘅同一個 store，所以駁通一個就等於兩個一齊駁通。
其他每一個由 `localStorage` 支撐嘅設定介面，就改為經
`design/packages/ui/src/stores/appSettingsHistorySync.ts` 嘅 `recordAppSetting(key, value)`，
因為 `settings.json` 淨係得一個由所有已駁通介面共用嘅扁平 `values` 袋，
一個淨係儲存自己 key 嘅介面下次執行嗰陣就會靜靜雞抹走其他介面已經記低嘅值——
`recordAppSetting` 會讀返而家嗰個袋、將呼叫方自己嘅 key 併埋，再儲存合併結果。
呢個 package 入面每一個 `localStorage` 支撐嘅 store，而家要麼已經咁樣駁通，
要麼被指名做刻意排除，而 `appSettingsHistorySync.ts` 入面嗰兩張清單——
`APP_SETTINGS_HISTORY_KEYS` 同 `EXCLUDED_APP_SETTINGS`——就係審計軌跡，
每一項都由 `appSettingsHistoryManifest.test.ts` 對住真實來源核對，唔會齋信。

已駁通嗰批 key 涵蓋嘅嘢包括：每個介面嘅選單搜尋列開唔開（`menuSearch`）、
成份外觀／主題記錄（`appearance`）、每個停靠介面用邊條邊（或者浮動）（`dockPlacement`）、
command palette 嘅 card／全視窗尺寸（`palette`）、已儲存嘅遠端 render 目標
（`remoteTargets`，冇 secret 欄位，見嗰個檔自己嘅 doc comment）、EULA viewer 自己嘅分頁佈局
（`eulaTabs`）、marker 篩選面板開唔開（`markerFiltersOpen`）、
render 好嘅地圖揀咗邊個資料夾（`mapStorageDir`）、語言模式（`languageMode`，英文／廣東話／雙語）、
兩條獨立嘅 funny-level 滑桿（`funnyLevelEn`、`funnyLevelYue`）、
最後一個被收起 banner 嘅更新版本（`updateDismissed`），
以及每條由 `tabStorage.ts` 支撐嘅分頁列各一項（`tabs.<storage key>`——主 shell、Settings、
config 編輯器、專案編輯器，用每條列自己嘅 `localStorage` key 做命名空間，令四者唔會撞）。

有兩個 key 反而被指名做刻意排除，兩個都喺 `dockPlacement.ts` 入面：
`dockSize` 同 `dockFloating` 喺一個面板被拉大細或者拖動嗰陣，**每一個 pointermove frame 都會寫**
（`DockedSurface.vue` 嘅分隔條同標題 handler 係持續咁叫 `setDockThickness` / `setDockFloatingRect`，
唔係淨係喺拖完先叫），所以鏡像任何一個都會將一次拖動變成幾十個純噪音嘅歷史修訂。
呢啲幾何服務嗰個*離散*選擇——即係一個面板停靠喺邊條邊——就係上面提到嘅 `dockPlacement`。

**第三步仲未做**：喺啟動嗰陣將 `profilesHistory:read` / `appSettingsHistory:read` 當事實來源嚟讀，
同時保留現有 `localStorage` 值做後備，再做一次冪等嘅單次複製入新 store——
行兩次都安全，因為同一個狀態寫兩次，第二次乜都唔會記錄。
喺呢步落地之前，`localStorage` 仍然係權威。

**第四步已完成，喺 `AppSettings.vue` 自己嗰個 History 分頁度。** 兩段歷史而家都搜尋得到、
日期篩選得到，靠嘅係 `SimpleHistoryPanel.vue`（`design/packages/ui/src/components/history/`）
而唔係 `HistoryPanel.vue` 本身：佢哋重用 `historyModel.ts` 嘅篩選函數
（即係 `HistoryPanel.vue` 用嗰套「搜尋 + 日期範圍 + 動作」組合）同 `ChangelogDateFilter.vue`
（即係 changelog viewer 用嗰個日曆），但唔包 `HistoryPanel.vue` 其餘嗰啲額外功能——
比較兩個修訂、還原一個檔或者一個設定、丟棄較舊修訂——因為喺 `SimpleHistoryHost` 另一邊
根本冇呢啲嘢（淨係得 `list` 同 `restore`）。匯出喺呢度都冇提供，原因一樣：
`HistoryPanel.vue` 嘅匯出會寫出呢個 host 冇帶住嘅資料夾同 repository 路徑。
`SimpleHistoryList.vue`——即係呢個面板為呢兩段歷史所取代嗰張普通、未篩選嘅清單——
原封不動，亦掛喺原本嗰個位：`ProjectEditor.vue` 自己嗰個 History 分頁，
而嗰邊有另一件並行進行嘅工作，正將佢擴展成一段有自己搜尋同日期要求嘅專案自動儲存歷史。
`SimpleHistoryPanel.vue` 係一個兄弟元件，唔係 `SimpleHistoryList.vue` 嘅重寫，
正正就係為咗令專案歷史唔會被今次改動掂到。

以上全部都冇改變 main-process 嗰半本身已經守住嘅承諾：一旦有呼叫方真係交一個狀態畀佢儲存，
佢保住嘅歷史係真實、本機、append-only，而且永遠唔會阻塞或者搞跌佢記錄緊嗰次儲存。
上面 renderer 側嘅駁線亦冇改變呢點：一次被拒絕或者唔存在嘅 `save` 呼叫會喺呼叫點被吞掉，
正如 `docs/config-history.md` 自己嗰條失敗模式規則要求，
所以一個寫唔到嘅歷史鏡像，永遠唔會將一次設定或者 profile 改動變成一個錯誤。

### 失敗模式

- **一次失敗嘅歷史寫入永遠唔會搞跌儲存。** 呢個係結構性嘅，唔係約定俗成：
  git runner 將失敗當值回傳而唔係掟出嚟、每個 IPC handler 都 resolve，
  而儲存之後嗰個快照呼叫係 fire-and-forget。一段保唔到嘅歷史，
  唔可以將一次成功嘅儲存變成失敗。
- **部機冇 git。** 面板會照直講失去咗乜、其餘一切照常運作；佢唔會提供佢兌現唔到嘅控制項。
  App 入面其他嘢一律唔變。
- **一次放唔返個檔嘅還原**會報出邊啲檔失敗，唔會扮成功；
  而佢事前影嗰個還原前快照，仍然保住當時磁碟上嘅內容。
- **一個讀得明嘅 diff parse 唔到嘅檔**會退回原始 unified patch，並指名個檔同原因。
  佢永遠唔會為一個肯定變咗嘅檔顯示一張空嘅設定清單。
- **一個合併唔到嘅設定**會被指名拒絕兼講原因，而且乜都唔寫。三種情況係：
  個檔而家唔喺個資料夾入面（改為將成個檔放返）、個檔喺其中一端 parse 唔到、
  以及個設定本身已經係嗰個值。
- **部機嘅全域 gitconfig 改變唔到一段歷史。** 每次呼叫 git 都釘死自己嘅設定
  （唔用 global 或者 system config、強制身分、關掉簽署、`autocrlf` 關、繞過 hook），
  所以部機其他地方嘅 template、hook 或者簽署要求，都搞唔壞亦改唔到記錄落嚟嘅嘢。

### 保安考慮

歷史係 config 資料夾內容嘅第二份副本，敏感度同個資料夾本身一樣——
config 檔可以載住資料庫連線字串。佢住喺 app 自己嘅資料目錄，
受同 app 其他資料一樣嘅保護，而且永遠唔離開部機。
還原只會經 config 編輯器現有嗰條有防護嘅寫入路徑寫，繼承佢嘅路徑拒絕規則，
所以一個做過手腳嘅修訂，指揮唔到一次寫去 config 資料夾以外。

### 核實

`design/packages/app/src/main/history/ipc.test.ts` 喺真臨時目錄入面用真 git repository
行 append-only 契約（62 個測試），包括：一次改動一個修訂兼有老實標籤、冇改變就乜都唔記、
永遠唔會喺用戶資料夾入面整 `.git`、永遠冇 remote、還原記錄成新修訂、
undo 嘅 undo 嘅 undo、還原前嘅磁碟快照、部分還原嘅老實度、
修剪保住最新兼拒絕清空，以及歷史失敗時儲存仍然生還。
比較同選擇性還原嘅工作再加上：隔幾個修訂嘅兩個修訂喺一次呼叫入面比較、兩邊完整送出、
某一邊個檔唔存在嗰陣回傳 `null` 而唔係 `""`、第一個修訂對住空 tree 打開、
放返一個檔而另一個檔之後嘅改動仍然生還、一個當時唔存在嘅被指名檔會由磁碟攞走、
一次部分還原本身可以被 undo、一次合併設定寫入喺路徑唔係呢個編輯器會寫嘅時候被拒、
喺修訂同資料夾都冇嗰個檔嘅時候被拒、喺修訂唔屬於呢段歷史嘅時候被拒，
再加合併前快照捕捉到喺編輯器外面做嘅改動。無 git 嗰組測試喺所有環境都行，
而家亦涵蓋埋三條較新嘅 channel；真 git 嗰組只有喺冇 git 嘅時候先自己跳過——
即係無 git 嗰批測試涵蓋緊嘅同一個情況。

介面側仲有橫跨五個檔嘅 121 個測試：篩選模型同兩種匯出（`historyModel.test.ts`）、
對住真 HOCON 嘅可讀 diff，包括行 diff 會搞錯嘅「設定搬咗位」同「加咗註解」兩種情況
（`historyDiff.test.ts`）、證明註解同鄰近設定生還嘅設定合併（`historyRestore.test.ts`）、
日子分組同 live 狀態標記（`historyTimeline.test.ts`），
以及掛住 mount 嘅面板，涵蓋經真掣做嘅 A/B 比較、鍵盤導航、live region、選擇性還原，
同一個早過新 channel 嘅 shell 嘅後備（`HistoryPanel.test.ts`）。

修剪嗰道閘喺 super-confirmation 清單（`superConfirmPolicy.test.ts`）度有宣告，
所以一個新嘅破壞性呼叫溜唔過去；設定合併喺記憶體入面移除 key 嗰下都有宣告喺嗰度，
當一個永遠唔會自己去到磁碟嘅 `buffer` 轉換。

`design/packages/app/src/main/profiles/ipc.test.ts` 同
`design/packages/app/src/main/settings/ipc.test.ts` 對住兩段新歷史行同一套 append-only 契約，
結構係照 `project/ipc.test.ts` 鏡像過嚟：一次儲存剛好一個修訂，每個都有老實標籤指名郁咗嘅
profile 或者設定；一次乜都冇改嘅儲存乜都唔記；兩個實時 store 入面都冇 `.git`，
repository 放喺 `config-history/` 同 `project-history/` 隔籬佢自己嗰個家族；
喺一部冇 git 嘅機上面，儲存照樣寫檔，並將歷史失敗分開報告；
一個 commit 中途失敗嘅 git 唔會影響儲存本身；還原記錄成新修訂，而且證明到可以再 undo。

### 修剪同匯出覆蓋每一段歷史，唔止 config 資料夾嗰段

`discardOlderRevisions` 本來淨係 config 資料夾先有嘅額外功能。而家唔係喇：
`project:discardOlder`、`profilesHistory:discardOlder` 同 `settingsHistory:discardOlder`
全部包住 `history/repository.ts` 入面同一個通用嘅 `discardOlderRevisions(git, keep)`——
冇新 git 邏輯，得三個薄 IPC 包裝，用返 `history:discardOlder` 本身已經強制嘅
「保留一個至少為一嘅整數」拒絕規則。`SimpleHistoryHost.discardOlderRevisions` 係可選，
探測方式同 `HistoryHost` 自己嗰啲額外功能一樣係逐個嚟：
一個早過佢嘅 shell 一樣有一張好好嘅瀏覽兼還原清單，只不過冇一粒撳落去會掟錯嘅修剪掣。
Bridge 有嗰陣，`SimpleHistoryList.vue`（專案 History 分頁）同 `SimpleHistoryPanel.vue`
（Settings 入面 profile 同應用程式設定嗰兩節）都會多咗一個「Revisions to keep」欄位
同一粒擺喺 `ConfigSuperConfirm` 後面嘅修剪掣——同 config 資料夾面板自己嗰個保留控制項一樣，
同一道兩鍵閘、同一句「之後還原唔到」嘅字眼。匯出完全唔使新後端：
佢淨係將 `list()` 已經回傳嗰啲格式化，經 `HistoryPanel.vue` 用嗰個同一個 `exportRevisions`，
所以一個專案、一張 profile 清單或者應用程式設定嘅歷史，
一樣可以好似 config 資料夾咁以 Markdown、JSON、CSV 或者純文字離開。

### 儲存嘅歷史保唔到嗰陣，用戶會知咩

`ProjectSaveResult.historyOk`／`historyMessage`／`revision` 由一開始就喺 bridge 上面存在，
但一直被 `preload/index.ts` 嘅 `writeProject` 便利包裝靜靜雞掉咗，介面根本冇見過——
正正就係呢個專案不斷喺深一層搵返出嚟嗰個「起咗但去唔到」嘅模式：
個型別宣告咗、仲 export 埋，但呼叫另一邊冇人讀過佢。而家 `writeProject` 會將三個都傳過去，
而 `ProjectsScreen.vue` 嘅手動儲存喺 `historyOk` 係 `false` 嗰陣，
會除咗「Saved」成功 toast 之外，再彈一個獨立、持續嘅警告通知，指名歷史層做唔到啲乜。
自動儲存排程器自己嘅結果亦經 `stores/projectAutosaveNotices.ts` 走同一套政策：
一次例行、成功嘅自動儲存（`reason: "quiet"`，或者一個 flush 咗但仍然成功嘅
`"boundary"`／`"destructive"`／`"quit"`）乜都唔會彈——專案自己嗰個 History 分頁就係
「你啲嘢有保住緊」嗰個環境指示——只有寫入失敗或者歷史記錄失敗先會打擾，
而且係每一個 reason 都會打擾，因為一張爛咗嘅安全網，正正就係非阻擋式通知規則點名話值得注意嗰種。
一分鐘之內重複嘅自動儲存失敗共用一個 `notify()` 類別同冷卻期
（`components/config/notifications.ts` 隨呢件工作新加），
所以一個開始每次自動儲存都失敗嘅 repository 會打擾一次然後停手，
而每一次發生仍然會落入通知中心可覆核嘅歷史。

`SimpleHistoryPanel.test.ts` 直接對住一個假 `SimpleHistoryHost` 掛住 mount 嗰個
可搜尋兼可日期篩選嘅面板（13 個測試）：普通清單仍然經 host 還原兼重新載入；
搜尋列真係 `ConfigSearchField`，由佢去到 regex builder，而且純文字係預設；
日期範圍同動作 chip 係收窄搜尋已經收窄咗嗰個結果集，而唔係取代佢；
篩選列一開始係摺埋兼有老實嘅徽章計數；兩種空狀態——乜都冇記錄過、同乜都唔符合——
維持分得開，仲有一粒掣清晒所有篩選；而兩個並排掛住嘅面板
（正正就係 `AppSettings.vue` 將 profile 同應用程式設定歷史一齊掛嗰個做法）
永遠唔會共用同一個 `aria-controls` id。

### 建議下一步

- [Super confirmation](./super-confirmation.md) — 修剪前面嗰道閘。
- [Changelog and the in-app changelog viewer](./changelog-viewer.md) — 歷史面板重用嗰個日期選擇器。
- [The regex builder and the search bars it reaches](./regex-builder.md) — 面板上面嗰個搜尋欄位。
