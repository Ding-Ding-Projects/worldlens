# Feature parity with BlueMapGUI

BlueMapGUI is the other desktop wrapper around the BlueMap CLI. It solves the same problem
this project solves, it has solved parts of it for longer, and several of its choices are
worth taking. This document is the audit: everything it does, whether this repository does
it, and what closing each gap would actually cost here.

It is a research document, not a plan. It states what is true on both sides as of the
sources below and says plainly where this project is behind, where it is ahead, and where a
difference is deliberate rather than a gap.

## What was read, and how

| | |
|---|---|
| Repository | `TechnicJelle/BlueMapGUI` |
| Method | Full `git clone` into a temporary directory outside this repository, then read of every non-generated `.dart` file (6,675 lines across 49 files), both CI workflows, `USAGE.md`, `README.md`, `pubspec.yaml` and the bundled `assets/startup.conf`. Nothing here comes from the README alone. |
| Commit read | `1bbb487` (`Bump build_runner from 2.15.0 to 2.15.1`), tip of `main` |
| Released version | v2.0.2, *Updated for BlueMap 5.22* |
| Stack | Flutter/Dart, Riverpod, Freezed; Material Design **2** (`useMaterial3: false`) |
| Targets | Windows x64 and Linux x64 |
| BlueMap it drives | CLI **5.22**, downloaded as a release jar |

### Licence: there is none, so nothing may be copied

`gh api repos/TechnicJelle/BlueMapGUI` returns `"license": null`, and the working tree
contains no `LICENSE` file — the only licence texts in it belong to the bundled PixelCode
font. **No licence granted means all rights reserved.** Not permissive, not "probably fine
because it is on GitHub": the absence of a licence is the strictest state a public
repository can be in.

So: read it, learn from it, reimplement it. Do not copy a file, a function, a class, a
widget tree, or a distinctive block of prose from it into this repository. Behaviour and
ideas are not copyrightable; expression is. Where this audit quotes a string it is quoting
it as *evidence of behaviour*, and even those should be rewritten rather than pasted — this
project has its own voice and its own language modes, and a pasted English sentence has no
Cantonese counterpart anyway.

The one thing that is genuinely safe to take verbatim is what BlueMapGUI itself took from
elsewhere: BlueMap's own config keys, defaults and semantics, which this repository already
sources from the vendored upstream in `design/packages/config/src/templates/`.

## The shape of the two applications

They are not the same program with different paint. The difference that explains most of the
table below is what each one *is*:

- **BlueMapGUI drives a long-running BlueMap process.** Start spawns
  `java -jar bluemap.jar --render --watch --webserver`, which renders, then keeps running,
  watching the world for changes and serving the map on `localhost:8100` out of BlueMap's own
  web server. The app's main screen is a console watching that process. Stop sends SIGINT.
- **Worldlens runs a render to completion and then serves the result itself.**
  `design/packages/app/src/main/render/runner.ts` spawns `-c <configDir> -r -s`, no `--watch`
  and no `--webserver`; `render/config.ts` writes `enabled: false` into `webserver.conf` on
  purpose, and the rendered tiles are then served by this project's own
  auth-token-gated local server (`design/packages/server/src/http/HttpServer.ts`,
  `render/LocalMapHandler.ts`) and viewed inside the app rather than in a browser.

Neither is wrong. But "start BlueMap and leave it running" and "render, then look at what was
rendered" produce different screens, and several rows below are gaps only if this project
decides it wants the first behaviour as well as the second.

**Retired local WebServer decision.** The separate local WebServer lifecycle and port used to
host a completed render is retired. That decision does **not** retire the existing static local
route: `render/LocalMapHandler.ts` still serves `/local/{renderId}` through the app's
auth-token-gated local HTTP surface, and the completed map remains an in-app view. WebServer
configuration and remote-hosting web-server behaviour remain relevant for maps hosted by a
remote BlueMap server; they are not a reason to restore a second local listener here.

The second structural difference is **when Java is needed**. BlueMapGUI cannot show you a
project list until Java is configured, because it parses HOCON by shelling out to a bundled
`HOCONReader.jar`. This repository parses HOCON in TypeScript
(`design/packages/config/src/hocon/`), so the whole config editor works with no JVM present.
That is a real advantage and should not be traded away.

## The gap table

Status is one of **have**, **partial**, **missing**, or **deliberate** (this project does
something different on purpose). "Partial" rows name exactly what is absent.

### Getting a BlueMap to run at all

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Ship the BlueMap CLI | Downloads `bluemap-5.22-cli.jar` from the upstream GitHub release into the project folder on first open, with a progress bar, then verifies it against a SHA-256 hardcoded in `lib/versions.dart`. Re-hashes on every start and warns (not errors) if it no longer matches. | **deliberate** | `design/packages/app/src/main/java/jars.ts` resolves jars built from the `vendor/BlueMap` submodule by `tools/build-jars.mjs`; version comes off the filename (`cli-5.22-27-shadow.jar`). | Nothing to do, but see the version-selector row below. Adopting a release download would swap a build-from-source supply chain for a fetch-and-trust-a-constant one — a step backwards, not forwards. |
| Choose which BlueMap version to use | Implicitly one per app release; upgrading the app re-templates the project (see "project upgrade" below). | **missing** | The only pin is the submodule commit in `.gitmodules`. No selector, no channel, no list. | Real work. The jar layer would need to resolve more than one version, and the config schema is version-shaped. Worth an issue, not worth blocking on. |
| Detect system Java | Runs `java -fullversion`, parses both `1.8` and `25.x` numbering, requires **25 or newer**, reports the detected number in the UI. | **have** | `design/packages/app/src/main/java/discovery.ts`, `probe.ts`, `version.ts` (`REQUIRED_JAVA_FEATURE = 25`). This project actually *executes* each candidate and collects per-candidate rejection reasons, which BlueMapGUI does not. | — |
| Download a JRE automatically | "Managed" mode: Adoptium v3 API for the current ABI, hardcoded SHA-256 per platform, unpack into the app support directory, delete the archive, locate `bin/java`. Only linux-x64 and windows-x64; anything else is disabled with an explanation. | **have**, and better | `java/adoptium.ts` (refuses artefacts with no digest — the digest is fetched, not hardcoded), `download.ts` (resumable, verified), `extract.ts`, `installation.ts` (writes an auditable install record), `provision.ts` (opt-in, off by default). | — |
| Pick a Java executable manually | File picker, then version-check the chosen binary and show the result inline. | **partial** | `design/packages/ui/src/components/settings/JavaRuntimeRow.vue` exposes the runtime and provisioning. A **manual browse-to-a-`java`-binary** path is not there; discovery is `JAVA_HOME` → `PATH` → provisioned. | Small: a directory/file picker feeding one more candidate into `discovery.ts`, with the same probe and the same rejection reporting. Genuinely useful for anyone whose JDK is somewhere unusual. |
| Refuse to proceed without Java | The projects list is replaced entirely by "Please set up Java in the settings" and an arrow pointing at the sidebar. Three distinct messages depending on whether Java is unset, too old, or a stale managed install. | **partial** | Java state is a settings row here, and a render fails at the point of running. There is no equivalent up-front gate with a route to the fix. | Small, and worth doing at the render wizard's review step rather than app-wide — this app can do plenty without a JVM. |

### The Mojang download and the EULA

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| `accept-download` consent | A checkbox in the Core config with a long explanation and two links (Mojang's EULA, `piston-meta.mojang.com`). Unchecked by default; the first Start fails and the console is rewritten to say "Please check the Core config in the bar on the left!". | **have**, and better | `design/packages/app/src/main/consent.ts` records the decision once with the document URL, a terms version, an ISO-8601 timestamp and the app version, and never re-asks. Schema field at `design/packages/config/src/schema/core.ts` (`consentGated: true`). UI at `ui/src/components/setup/ConsentSettingsRow.vue`. | — |
| Failing usefully when consent is missing | Rewrites the CLI's own "Please check: .../core.conf" line into a sentence naming the UI location. | **partial** | `render/failure.ts` classifies failures, but there is no rule that maps a consent failure to "open the consent row". | Small: one more classified failure with an action that deep-links the settings anchor `mojang-download-consent`, which already exists in `settingsSections.ts`. |

### Projects

BlueMapGUI's "project" is **a folder on disk** containing `config/`, `web/`, the downloaded
jar and the rendered output — one BlueMap installation per project, so one modpack or one
Minecraft version per project. This project's `project.ts` means something else entirely: a
single `worldlens.project.json` file living **at the root of a Minecraft world**,
holding that world's maps and storages. They are different concepts wearing the same word,
and any implementing agent should be careful not to conflate them.

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| A named project folder | Create dialog with a name (validated `^[ a-zA-Z0-9_-]+$`), a location field with a folder picker, and a live "Project will be created in: `<path>`" preview. Rejects duplicates and reports permission failures by name. | **missing** | `design/packages/config/src/project.ts` defines a project *file*, and nothing outside `test/project.test.ts` imports it. There is no projects list, no create, no delete. | Medium. The bigger question is whether this project wants folder-projects at all, given it renders per-world into a configured storage directory. |
| A projects list | Rows of name + full path; each row watches its parent directory and shows "Error: Directory not found." live when the folder is moved or deleted. | **missing** | — | The live directory watch is the clever bit and is cheap: one watcher per row, not a poll. |
| Remove from list without deleting | Hover menu → confirmation dialog that says in as many words that the directory stays on disk. | **missing** | Compare `docs/finding-worlds.md`, which makes exactly this argument about unmount. The reasoning already exists here; the surface does not. | — |
| OneDrive protection | The default location is the OS Documents folder, but if Documents sits under `OneDrive`, it redirects to the real Documents path instead — with a guard for a user literally named `OneDrive`. | **missing** | No equivalent anywhere. | Tiny, and worth stealing the *idea* wholesale. A Windows user syncing a 40 GB tile tree to OneDrive by accident is a real support burden. Applies here to the **map storage directory**, not to projects. |
| Open the project folder in the file manager | Toolbar button and a per-row menu item. | **missing** | No `shell.showItemInFolder` or `shell.openPath` anywhere in `design/`; the only shell route is `github/external.ts`, which is https-only by design. | Small, and a real gap: this app writes tiles, configs and backups to disk and offers no way to get to them. Needs its own IPC channel with a path allowlist, not a general "open anything" hole. |
| Close the project | Toolbar button with a confirmation. | **n/a** | No project concept to close. | — |

### Opening a project (the first-run sequence)

This is BlueMapGUI's most interesting machinery and has no counterpart here, because this
project generates configs from vendored templates rather than by asking the CLI for them.

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Generate default configs | Runs the CLI once with **no arguments** and a 30-second timeout in the project directory, and treats the string `Generated default config files for you` in stdout as success. Tolerates config-parse problems and opens anyway, deliberately, so the user meets the error later where it is explicable. | **deliberate** | `design/packages/config/src/generate.ts` + `templates/sources.ts` emit configs from byte-copies of upstream's own defaults, with no JVM involved. | Do not adopt. Requiring Java before the config editor opens would be a straight regression. |
| Map templates | The generated `config/maps/` is renamed to `config/map-templates-<version>/` and an empty `config/maps/` is put back. "New map" then copies from the templates. | **have** in effect | `generate.ts` has `MapPreset` as a union of `"overworld"`, `"nether"` and `"end"`, with per-preset sky/void/ambient/cave/nether-ceiling values. | — |
| Project upgrade across BlueMap versions | If `config/maps/` exists but there is no templates directory for the current version, the user's maps are moved to `config/maps.temp`, the CLI regenerates fresh defaults, those become the new templates, and the user's maps are moved back. | **missing** | Config migration across upstream versions is not modelled here at all. | Medium, and only becomes urgent once the bundled BlueMap version moves. Worth an issue now so it is not discovered later. |
| A staged, honest progress dialog | Eight named steps — checking, downloading, hashing, running, mapping, copying, opening — each with its own sentence, plus a determinate bar during the download. Six distinct error states, each with its own copy and a scrollable monospace detail pane. | **partial** | `RenderRunPanel.vue` has real phases (`starting → downloading-resources → … → finished`) and `render/failure.ts` classifies failures. But there is no equivalent multi-step *setup* flow, because there is no setup. | The pattern is already this project's house style. Nothing to import; noted because it is the standard to match if a folder-project flow ever lands. |
| `startup.conf` | BlueMapGUI **invents a config file BlueMap does not have** and copies it into `config/`: `mods-path`, `minecraft-version`, `max-ram-limit`. At start it turns them into `--mods`, `--mc-version` and a JVM `-XX:MaxRAM=`. | **partial** | `mods-folder` and `mc-version` are modelled as CLI flags on the Run tab (`design/packages/config/src/cli/flags.ts`), so the values exist. **Max RAM is not a setting**: `jvmArgs` is plumbed from `orchestrator.ts` to `runner.ts` and is exercised only by `runner.test.ts` with `-Xmx4G`. No UI, no persistence, no caller. | Max RAM is the real gap and it is small: one setting, one persisted value, one `-Xmx`/`-XX:MaxRAM` argument into the existing `jvmArgs`. It matters — an unbounded JVM rendering a large world is the classic "my computer froze" report. Do **not** copy the invented file format; put it where this project puts settings. |

### Maps

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| New map from a template | Dialog: template dropdown (Overworld/Nether/End, sorted by each template's own `sorting`), name field, live **"Map ID: `<slug>`"** preview (`nameToID`: lowercase, everything outside `[a-z0-9_-]` collapsed to `-`), duplicate-ID rejection, adaptive placeholder. Copies the template then rewrites `name:`. | **have**, differently | The render wizard (`design/packages/ui/src/components/world/wizardSteps.ts`) is five steps: world → name and dimension → options → where it goes → review. | The **live slug preview** is worth taking: a user who types "My Cool Map" should see `my-cool-map` before committing, because the id is what ends up in a URL and a folder name. |
| Reorder maps | Drag handles in the sidebar; dropping rewrites every map's `sorting:` to `index * 100`. Disabled in advanced mode and when any config is broken, with the reason recorded in a comment. | **partial** | `sorting` is in the map schema and in `project.ts`, and the maps screen edits it as a number. There is no drag-reorder. | Small-to-medium, and pleasant. The `index * 100` trick — leaving gaps so a single insert does not rewrite every file — is worth copying as an idea. |
| Re-render one map | "Danger zone" button that deletes `web/maps/<sanitised-id>/` so the next run regenerates it. Disabled with a tooltip when the folder is absent, and the copy says plainly that nothing unrecoverable is lost. | **missing** | `--force-render` exists on the Run tab and `force`/`fixEdges` exist on the render request, and `configWorkspace.ts` warns which maps *will need* re-rendering after a config edit. But no code deletes a render's tiles. | Medium. It needs an IPC channel that deletes inside the app's own storage root and nowhere else, and it must go behind [super confirmation](./super-confirmation.md) — deleting rendered output is exactly the shape that gate exists for. The honest copy ("nothing unrecoverable is lost, it just takes time") is the right framing and this project should use it too. |
| Delete a map | Confirmation dialog, then deletes both the config file **and** the rendered data directory. | **partial** | `MapsScreen.vue` deletes the map config behind the super-confirm gate, and its own copy states that "already-rendered tiles in storage `{storage}` are NOT deleted." | Same channel as the row above. The current copy is honest, which is the right way to be incomplete — but a user who deletes a map and finds gigabytes of orphaned tiles has still been left with a chore. |
| Warn that a world folder is not a world | The World Path field validates live: directory must exist, and must contain `level.dat`, or `region/`, or a `dimensions/<ns>/<dim>/region/`. | **have** | `design/packages/app/src/main/world/inspect.ts` plus the whole discovery layer in `world/` — see [finding-worlds.md](./finding-worlds.md). This project is far ahead here: it finds worlds rather than asking you to browse to them. | — |
| Warn that a mods folder has no mods | The Mods Path field warns if the directory is missing or contains no `.jar`. | **missing** | `mods-folder` is a plain path flag on the Run tab. | Tiny, and a good example of the class of check this project should have on every path field. |

### The running process, and watching it

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Start / Stop | One button over a four-state machine (stopped / starting / running / stopping), label and icon following the state. Stop is SIGINT. | **have** | `render/runner.ts` (SIGINT then SIGKILL escalation, with the Windows behaviour documented), `render/ipc.ts`, `ui/.../world/renderRun.ts` state machine, cancel button in `RenderRunPanel.vue`. | — |
| Keep BlueMap running and watching | `--render --watch --webserver`: renders, then stays up watching the world and serving the map. | **deliberate**, with a caveat | `runner.ts` spawns `-r -s` only. `--watch` **is** modelled in `cli/flags.ts` but no local run uses it. | Flagged, not recommended blindly. A watch mode implies a long-lived process, a live web server and a very different main screen. If it is ever wanted, it should be a distinct explicit mode, not a flag quietly added to the existing render. |
| A console | Black panel, monospace, colour-coded by level (`ERR` red, `WARN` yellow, `INFO` white, `[TIP]` blue, `[Signal]` grey), selectable text, sticky auto-scroll that only sticks when already at the bottom, and a scroll-to-bottom button that fades in when you scroll away. | **partial** | `render/progress.ts` parses `[HH:MM:SS LEVEL] message` into typed lines; `renderRun.ts` keeps a **200-line ring**; `RenderRunPanel.vue` shows a collapsible `<pre>`. | Medium, and the most visible gap. What is missing: it is a bounded disclosure rather than a first-class console; only 200 lines are kept; there is no level colouring, no sticky-scroll behaviour, no scroll-to-bottom affordance, no per-level filter, and **no search** — which this project's own rules say every such surface must have, wired to the [regex builder](./regex-builder.md). It should also be exportable and copyable like every other record here. |
| Synthetic status lines in the log | Injects `[Signal] Starting… / Running! / Stopping… / Stopped. (exitcode)` so the console reads as a narrative. | **missing** | Phases exist as state, not as log lines. | Tiny once a real console exists. |
| Annotating the CLI's output | Six specific rewrites and injected tips: the `core.conf` pointer; a four-line explanation of a port conflict naming BlueMap-as-a-client-mod and orphaned processes; a one-shot "raise the render thread count" tip on the first `(ETA:` line; a warning when it says `Start updating 0 maps`; a "you can open the map now" tip when the web server starts. | **missing** | `render/progress.ts` parses levels and progress; `render/failure.ts` classifies terminal failures. Nothing annotates a *running* log with advice. | Small per rule, and this is the single best idea to take from BlueMapGUI. It is knowledge about BlueMap's own output encoded where a user meets it. It fits this project's tone rules cleanly: the fact is the CLI's line, the advice is this app's voice, and the [funny level](./language-and-tone.md) styles the advice without touching the quoted line. Build it as a table of (pattern → advice), tested, not as conditionals scattered through a stream handler. |
| Working around an upstream hang | On `Failed to load map config` the CLI is known to hang, so BlueMapGUI kills it after 5 seconds. | **missing** | No watchdog on the child process. | Small, and worth having as a general guard: a defined stall condition with a timeout beats a spinner that never resolves. Whether *this* particular hang still exists in 5.22-27 needs checking before the rule is copied. |
| Stopping cleanly on window close | Intercepts the window close, stops the process, waits for the stopped state, pauses one second so the user reads "Stopped.", then closes. | **partial** | Interrupted runs are detected by app-instance id and offered for resume (`render/resume.ts`, `InterruptedRenders.vue`) — arguably a better answer, because it survives a crash and not just a polite close. | Small: also stop the child on a clean quit, so the resume offer is for real crashes rather than for every exit. |
| Clear the console before each start | An app setting, on by default, with copy explaining that old errors otherwise stay on screen and confuse. | **missing** | — | Tiny, once there is a console. |

### Viewing the rendered map

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Open the map | An "Open" button that launches `http://localhost:<port>` in the system browser, enabled only while running. | **deliberate** | This project serves rendered tiles itself at `/local/{renderId}` (`render/LocalMapHandler.ts`) and views them in-app: `App.vue`'s `openRenderedMap()` turns a finished render into an entry in the same list a remote server uses (`ui/src/stores/profiles.ts`), and selecting it opens the map. | Nothing. The in-app route is better: no unauthenticated listener, no browser round trip. |
| Learn the port | Scrapes it out of the CLI's log line `WebServer bound to …:8100` with a regex, defaulting to 8100 if that fails. | **deliberate** | The separate local WebServer decision is retired: `webserver.conf` is written `enabled: false`, while `render/LocalMapHandler.ts` continues to serve the static `/local/{renderId}` route. Remote-hosting web-server settings remain separate. | — |
| Celebrate | The Open button scales and glows when the server comes up, damped as soon as the pointer touches it. | **missing** | — | Noted for delight, not for parity. Anything like it here must respect reduced-motion. |

### Editing configuration

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| A form editor over the configs | Five typed views: Core, Startup, Webapp, Webserver, Map. Roughly **21 settings in total** — Core has 2, Webapp has 1, Webserver has 1, Startup has 2, and a map has about 15. | **have**, far ahead | Seven screens (`ui/src/components/config/configSearch.ts`): Core, Maps, Storages, Web app, Web server, Server plugin, Run — plus a History tab. Schema field counts: core 10, map 32, mask 8, plugin 12, storage 10, webapp 20, webserver 8, plus the CLI flag set. | — |
| Rich per-option prose, with links and inline code | Every option carries a paragraph under its title; links open in a browser; code fragments (`minecraft:the_nether`) are styled. | **have** | Field descriptions and groups live in the schema (`design/packages/config/src/schema/*.ts`) and render on the screens. | — |
| Options a config file is too old to contain | Missing keys are **struck through and disabled**, the checkbox goes tri-state, and a tooltip explains the file is out of date. | **missing** | This project rewrites whole files from schema rather than editing keys in place, so the situation arises differently — but a *user-supplied* config folder with an old file hits exactly this case. | Small-to-medium, and a genuinely good pattern: it shows the setting exists, says why it cannot be used, and does not silently hide it. That matches this project's stated rule about never dropping a value it cannot represent. |
| Surgical writes that preserve comments | A regex replaces only the value on the matching `key:` line in the real file, so comments, ordering and formatting survive. Saves on editing-complete, on slider release and on dispose. | **partial** | `ConfigApplyDialog.vue` and `configWorkspace.ts` write a config set; `render/config.ts` writes files whose own header says edits there are overwritten. | Relevant only where this app edits a folder somebody else authored. If that is a supported case, comment preservation is close to mandatory — silently eating a user's comments is the kind of thing they discover a month later. |
| Friendlier names over unfriendly keys | "Render All Caves" over `remove-caves-below-y: -10000`; "Render Only Visited Chunks" over `min-inhabited-time: 0/1`; a three-way icon toggle over the perspective/flat/free-flight booleans. | **partial** | The schema exposes the real fields with real labels. | Small and worth doing where a numeric sentinel is really a boolean. The rule to keep: the friendly control must not hide the actual value, and switching to the raw view must show what was written. |
| Colour pickers for sky and void | An HSV wheel with a hex field, six-digit, no alpha. | **have**, far ahead | The [appearance editors](./appearance-editors.md) carry an infinite picker with a colour translator across many spaces. | Confirm the *map config* colour fields actually reach that picker rather than a plain text input. |
| Advanced/raw HOCON editor | A switch replaces the form with a full text editor over the raw file: **YAML syntax highlighting**, line numbers, light/dark code themes, green comments, no word wrap, autosave every five seconds plus a synchronous save on dispose. | **partial** | An `showAdvanced` toggle exists (`ConfigFileForm.vue`, `MapOptionsStep.vue`) but it reveals *advanced fields*, not raw text. Raw text is a read-only "show the file as it will be written" `<pre>` with a Copy button; an editable textarea exists **only** as the fallback for a file whose HOCON will not parse (`ConfigFileForm.vue`, gated in `configModel.ts`). **No syntax highlighting exists anywhere in this repository.** | Medium. Two distinct pieces: an editable raw view for every config (not just broken ones), and a highlighter. Note the naming collision — "advanced mode" means two different things in the two apps, and the docs here should not inherit the ambiguity. |
| Parse errors pointed at the line | The gutter prints `Error` in place of the line number on the offending line, and a red banner names the problem. A type-mismatch gets its own message: "There is likely a critical option renamed, removed, or commented out." | **missing** | Unparseable files fall back to a plain textarea with no position information. | Medium, and it depends on the parser reporting a position. Worth checking whether `config/src/hocon/` already carries one — if it does, this is mostly presentation. |
| A route out of a broken config | When the form cannot render, a red panel appears with a "Switch to Advanced Mode" button. | **partial** | The textarea fallback appears, but nothing explains why or offers the choice. | Small: name the problem, then offer the raw editor as a labelled action rather than as a silent substitution. |

### Application settings, chrome and updates

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Theme mode | System / Light / Dark radio group, persisted. | **have** | `ui/src/components/menu/SettingsMenu.vue` (default / dark / light / contrast) and, for the docs site, `site/src/theme/ThemeController.ts`. | — |
| Material Design | Material **2**, explicitly (`useMaterial3: false`), with a hand-rolled `TechApp` theme. | **deliberate** | This project is M3 throughout. | Nothing to take. Screenshots of BlueMapGUI are not a design reference here. |
| Window chrome | The ordinary OS title bar, with a Flutter `AppBar` under it. | **deliberate** | This project requires a frameless window with a custom Material title bar. | Nothing to take. |
| Update check | HEADs the `releases/latest` URL **without following the redirect** and reads the tag out of the `Location` header — clever, and it needs no API token and no rate limit. Only runs for release builds; disabled by an environment variable. Shows a yellow "Update" button whose tooltip reads `2.0.1 -> 2.0.2` and which opens the releases page in a browser. **No in-app download, no install.** | **missing** | No `autoUpdater`, no update check anywhere. `electron-builder.config.cjs` notes that Squirrel produces the `RELEASES`/`.nupkg` pair "that Electron's own autoUpdater consumes" — and nothing consumes it. | Medium, and this project's bar is higher than BlueMapGUI's: a Squirrel feed, background download, signature verification, and a persistent non-blocking "restart to install" banner rather than a link to a web page. The redirect trick is still worth remembering as a zero-dependency fallback. |
| A help link | Toolbar button opening the project's help page. | **partial** | There is a docs site and a [changelog viewer](./changelog-viewer.md), and `github/external.ts` opens https URLs. Whether a Help affordance exists in the app chrome should be confirmed. | Tiny if missing. |
| Version display | "Version: `<v>` / BlueMap: `<tag>`" printed permanently in the bottom-left corner. | **partial** | Version appears in the changelog viewer and About-shaped surfaces. The **BlueMap version being driven** is knowable (`jars.ts` parses it off the filename) but is not obviously surfaced. | Tiny, and worth it: "which BlueMap is this?" is the first question in any support thread. |
| Resource packs and data packs | Not managed. `USAGE.md` tells the user to click "Open in file manager", walk to `config/packs/`, and paste files in, and links upstream's wiki. Explicitly deferred. | **missing** | No `packs/` concept anywhere in `design/`. (`design/packages/engine` parses resource packs as a *renderer*; that is not a user-facing packs folder.) | Medium, and an opportunity: both applications are equally missing it, so building a real pack manager — list, add, reorder, enable/disable, with the load order made visible — is a place to be ahead rather than level. |

### Packaging and delivery

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Windows artefact | A **zip of the runner directory**. No installer. | **deliberate** | This project ships Squirrel.Windows: `Setup.exe`, `RELEASES`, full and delta `.nupkg`. | Nothing to take. |
| Linux artefact | Bundle zip plus an AppImage. | **deliberate** | This project is Windows-only by decision. | Nothing to take. |
| Release gating | A CI job asserts the release tag matches `pubspec.yaml`'s version before either platform builds. | Worth noting | — | A cheap, good idea. Whether this repository has an equivalent guard is outside this audit's scope. |
| Website | A Dart static-site generator with a home page and a help page mirroring `USAGE.md`. | **have**, far ahead | `design/packages/site/` carries an article per feature. | — |

## Things not to take

Recorded so nobody has to rediscover the reasoning:

1. **Downloading a prebuilt CLI jar against a hardcoded hash.** It works, and it keeps the
   app small. It also means the app can only ever run the one BlueMap build its constant
   names, and that a hash rotation is an app release. This repository builds from a pinned
   submodule, which is a stronger position.
2. **Generating configs by running the CLI.** Elegant — the defaults are always upstream's,
   by construction. But it makes a JVM a prerequisite for opening the settings screen, and
   it makes the first-open path a 30-second subprocess with a string-match success test.
   Vendored templates give the same guarantee without either.
3. **Parsing HOCON by shelling out to a bundled jar.** Same objection, larger. This project's
   TypeScript parser is testable, fast, and works with no Java at all.
4. **Material Design 2 and the OS title bar.** Both are settled the other way here.
5. **`startup.conf` as a file format.** The three settings it holds are worth having. A
   config file BlueMap does not read, sitting in BlueMap's config directory looking like one
   of BlueMap's own, is a trap for anyone who later opens that folder with the real CLI.
6. **A zip as the Windows install path.** Settled the other way here.
7. **Confirmation dialogs with a bare red text button.** This project has
   [super confirmation](./super-confirmation.md) for anything irreversible, and it exists
   precisely because a one-click red button is not a gate.

## Where this project is ahead

Stated so the implementing work is scoped to the gaps and does not accidentally regress
something:

- World discovery. BlueMapGUI asks you to browse to a folder; this project finds worlds,
  reads `level.dat`, lets you mount extra installations, and searches the lot
  ([finding-worlds.md](./finding-worlds.md)).
- Config coverage: roughly 99 schema fields across seven screens against about 21 settings.
- Storages beyond a plain directory, including SQL.
- Rendering in GitHub Actions, sharded and resumable
  ([render-in-actions.md](./render-in-actions.md), [resumable-renders.md](./resumable-renders.md)).
- Local git history over config folders ([config-history.md](./config-history.md)), the
  [notification centre](./notification-centre.md), the [command palette](./command-palette.md),
  [tabbed navigation](./tabbed-navigation.md), the [appearance editors](./appearance-editors.md),
  the [regex builder](./regex-builder.md) on every search surface, and
  [language modes and funny levels](./language-and-tone.md). BlueMapGUI has none of these; it
  is English-only, with no in-app search of any kind.
- Java provisioning that verifies a fetched digest rather than a compiled-in constant, and
  records what it installed.
- Consent recorded as an auditable decision rather than a checkbox in a file.

## Verification

Nothing in this document was verified by running either application. It is a source read on
both sides, and every claim above names the file it came from so it can be checked. Two
things in particular should be confirmed before anyone builds against them:

- that the `Failed to load map config` hang BlueMapGUI works around still exists in the
  BlueMap version this project vendors, before its five-second watchdog is copied;
- that `design/packages/config/src/hocon/` reports a position on a parse error, which decides
  whether "point at the broken line" is presentation work or parser work.

## Related

- [finding-worlds.md](./finding-worlds.md) - how this project finds worlds instead of asking
- [regex-builder.md](./regex-builder.md) - the search every new surface here has to carry
- [super-confirmation.md](./super-confirmation.md) - the gate a "delete rendered tiles" action belongs behind
- [language-and-tone.md](./language-and-tone.md) - why annotated log advice can be funny and the quoted line cannot

## 廣東話

### 呢份文件係乜嘢

BlueMapGUI 係另一個包住 BlueMap CLI 嘅桌面程式 (desktop wrapper)。佢解決緊同呢個專案一樣嘅問題，
有啲部分佢仲做咗更耐，而且佢有幾個決定係值得攞嚟用嘅。呢份文件係一次審計 (audit)：佢做到啲乜、
呢個 repository 有冇做到、以及喺呢邊補返每一個差距實際上要幾多功夫。

呢份係研究文件，唔係計劃書。佢淨係講清楚兩邊喺下面列出嘅來源時點嘅真實狀態，並且直接指出呢個專案
喺邊度落後、喺邊度領先、以及邊啲差異其實係刻意咁做而唔係缺陷。

### 讀咗啲乜、點樣讀 (What was read, and how)

來源係 `TechnicJelle/BlueMapGUI`。做法係喺呢個 repository 以外嘅暫存目錄 `git clone` 成個 repo，
然後讀晒每一個唔係自動生成嘅 `.dart` 檔（49 個檔、6,675 行）、兩個 CI workflow、`USAGE.md`、
`README.md`、`pubspec.yaml`，同埋佢隨程式附帶嘅 `assets/startup.conf`。冇任何一句係淨靠 README 得嚟。
讀嘅 commit 係 `1bbb487`（`Bump build_runner from 2.15.0 to 2.15.1`），即係 `main` 嘅頂端；
已發佈版本係 v2.0.2，*Updated for BlueMap 5.22*。技術棧係 Flutter/Dart、Riverpod、Freezed，
用 Material Design **2**（`useMaterial3: false`）。目標平台係 Windows x64 同 Linux x64，
佢驅動嘅係 BlueMap CLI **5.22**，以 release jar 形式下載返嚟。

### 授權：根本冇，所以乜都唔可以抄

`gh api repos/TechnicJelle/BlueMapGUI` 回傳 `"license": null`，而 working tree 入面亦都冇 `LICENSE`
檔——入面唯一嘅授權文字係屬於佢附帶嘅 PixelCode 字型。**冇授予授權即係保留一切權利。**
唔係寬鬆授權，亦都唔係「擺咗上 GitHub 就大概冇問題」：冇授權其實係一個公開 repository 可以處於嘅
最嚴格狀態。

所以：可以讀、可以學、可以重新實作。但係唔可以由佢嗰邊抄一個檔、一個 function、一個 class、
一棵 widget tree，或者一段有特色嘅文字入嚟呢個 repository。行為同諗法唔受版權保護，表達方式就受。
呢份審計引用字串嘅時候，係當佢做*行為嘅證據*，就算係嗰啲都應該重寫而唔係貼過嚟——呢個專案有自己嘅
語氣同語言模式，而一句貼過嚟嘅英文句子根本冇對應嘅廣東話版本。

唯一真係可以照攞嘅，係 BlueMapGUI 自己都係由第度攞返嚟嘅嘢：BlueMap 本身嘅 config key、預設值同語意，
而呢個 repository 其實已經由 `design/packages/config/src/templates/` 入面 vendor 咗嘅上游來源攞緊。

### 兩個程式嘅形態

佢哋唔係同一個程式髹咗唔同油。解釋到下面大部分差異嘅，係佢哋各自*係乜嘢*：

- **BlueMapGUI 驅動一個長期執行嘅 BlueMap process。** 撳 Start 會 spawn
  `java -jar bluemap.jar --render --watch --webserver`，render 完之後繼續行，一路 watch 世界有冇變，
  同時用 BlueMap 自己嘅 web server 喺 `localhost:8100` 出圖。個程式嘅主畫面就係一個睇住嗰個 process
  嘅 console。Stop 係送 SIGINT。
- **Worldlens 係行完一次 render 就自己出圖。** `design/packages/app/src/main/render/runner.ts`
  spawn 嘅係 `-c <configDir> -r -s`，冇 `--watch` 亦都冇 `--webserver`；`render/config.ts` 係刻意寫
  `enabled: false` 入 `webserver.conf`，render 出嚟嘅 tile 之後由呢個專案自己嗰個要 auth token 先入到
  嘅本機 server（`design/packages/server/src/http/HttpServer.ts`、`render/LocalMapHandler.ts`）供應，
  喺 app 入面睇而唔係喺瀏覽器度睇。

兩邊都冇錯。但係「開住 BlueMap 唔閂」同「render 完再睇 render 咗啲乜」會做出唔同嘅畫面，
下面有幾行只有喺呢個專案決定除咗第二種行為之外仲想要第一種嘅時候，先算得上係差距。

**本機 WebServer 嘅決定已經退休。** 用一個獨立嘅本機 WebServer 同埠去 host 完成咗嘅
render，呢個 lifecycle 已經唔再係支援方向。不過，呢個唔係刪走現有嘅 static local route：
`render/LocalMapHandler.ts` 仍然經過 app 自己要 auth token 先入到嘅本機 HTTP surface 提供
`/local/{renderId}`，完成咗嘅 map 仍然喺 app 入面睇。WebServer config 同 remote BlueMap
server 嘅 web-server 行為仍然有用；佢哋唔代表要喺呢度恢復第二個本機 listener。

第二個結構性差異係**幾時先要 Java**。BlueMapGUI 喺 Java 未設定好之前連專案清單都show 唔到，
因為佢係靠 shell out 去一個附帶嘅 `HOCONReader.jar` 嚟 parse HOCON。呢個 repository 用 TypeScript
parse HOCON（`design/packages/config/src/hocon/`），所以成個 config 編輯器喺完全冇 JVM 嘅情況下都用得。
呢個係實實在在嘅優勢，唔應該用嚟交換任何嘢。

### 差距表點樣讀

狀態分做 **have**（有）、**partial**（部分）、**missing**（冇），或者 **deliberate**（呢個專案刻意做另一套）。
標住 partial 嘅，會明確講清楚差咗乜。

### 令 BlueMap 行得起

- **附帶 BlueMap CLI**：BlueMapGUI 第一次開專案時，會由上游 GitHub release 下載 `bluemap-5.22-cli.jar`
  入專案資料夾，有進度條，然後對住寫死喺 `lib/versions.dart` 嘅 SHA-256 做校驗；每次啟動都會重新 hash，
  唔夾就出警告（唔係報錯）。呢邊係 **deliberate**：`design/packages/app/src/main/java/jars.ts`
  解析嘅係由 `vendor/BlueMap` submodule 經 `tools/build-jars.mjs` 起出嚟嘅 jar，版本由檔名讀出
  （`cli-5.22-27-shadow.jar`）。冇嘢要做。改用下載 release 等於用「由源碼建置」嘅供應鏈換做
  「攞返嚟再信一個常數」，係退步唔係進步。
- **揀用邊個 BlueMap 版本**：BlueMapGUI 每個 app 版本隱含綁一個版本，升級 app 就會重新 template 個專案。
  呢邊 **missing**：唯一嘅 pin 就係 `.gitmodules` 入面嗰個 submodule commit，冇選擇器、冇 channel、冇清單。
  要做係實工，因為 jar 層要識解析多過一個版本，而 config schema 本身就係跟版本嘅。值得開 issue，
  但唔值得為咗佢卡住。
- **偵測系統 Java**：BlueMapGUI 行 `java -fullversion`，`1.8` 同 `25.x` 兩種編號都 parse 得到，
  要求 **25 或以上**，並喺 UI show 出偵測到嘅版本號。呢邊 **have**：
  `design/packages/app/src/main/java/discovery.ts`、`probe.ts`、`version.ts`（`REQUIRED_JAVA_FEATURE = 25`）。
  呢個專案仲會真係*執行*每一個候選項並且逐個收集拒絕原因，BlueMapGUI 冇咁做。
- **自動下載 JRE**：BlueMapGUI 有「Managed」模式，用 Adoptium v3 API 攞當前 ABI 嘅檔，每個平台寫死一個
  SHA-256，解壓入 app support 目錄，刪走壓縮檔，再搵 `bin/java`；淨係支援 linux-x64 同 windows-x64，
  其他平台會停用兼附解釋。呢邊 **have，而且更好**：`java/adoptium.ts`（冇 digest 嘅 artefact 會被拒絕，
  而且 digest 係攞返嚟嘅，唔係寫死）、`download.ts`（可續傳、有校驗）、`extract.ts`、
  `installation.ts`（寫低可審計嘅安裝記錄）、`provision.ts`（opt-in，預設關）。
- **手動揀一個 Java 執行檔**：BlueMapGUI 有檔案選擇器，揀完會即刻驗版本並喺原地顯示結果。呢邊 **partial**：
  `design/packages/ui/src/components/settings/JavaRuntimeRow.vue` 露出咗 runtime 同 provisioning，
  但**冇一條可以自己 browse 去一個 `java` binary** 嘅路徑；discovery 順序係 `JAVA_HOME` → `PATH` → provisioned。
  要補好細：加個目錄／檔案選擇器，多餵一個候選項入 `discovery.ts`，用返同一套 probe 同同一套拒絕原因回報。
  對 JDK 擺喺奇怪位置嘅人真係好有用。
- **冇 Java 就唔畀行落去**：BlueMapGUI 會將成個專案清單換走，變成「Please set up Java in the settings」
  同一個指住 sidebar 嘅箭嘴，仲會按 Java 未設定／太舊／managed 安裝過期而畀三個唔同訊息。呢邊 **partial**：
  Java 狀態淨係設定入面一行，render 要行到嗰刻先失敗，冇一個前置關卡兼帶你去解決方法。
  要補好細，而且應該做喺 render wizard 嘅 review 步驟而唔係全 app 範圍——呢個 app 冇 JVM 都做到好多嘢。

### Mojang 下載同 EULA

- **`accept-download` 同意**：BlueMapGUI 喺 Core config 放一個 checkbox，附長篇解釋同兩條連結
  （Mojang 嘅 EULA、`piston-meta.mojang.com`），預設唔剔；第一次 Start 會失敗，個 console 會被改寫成
  「Please check the Core config in the bar on the left!」。呢邊 **have，而且更好**：
  `design/packages/app/src/main/consent.ts` 只記錄一次決定，連同文件 URL、條款版本、ISO-8601 時間戳同
  app 版本，之後唔會再問。Schema 欄位喺 `design/packages/config/src/schema/core.ts`（`consentGated: true`），
  UI 喺 `ui/src/components/setup/ConsentSettingsRow.vue`。
- **冇同意時要失敗得有用**：BlueMapGUI 會將 CLI 自己嗰句「Please check: .../core.conf」改寫成一句
  直接講出 UI 位置嘅說話。呢邊 **partial**：`render/failure.ts` 有做失敗分類，但冇規則將「consent 失敗」
  對應到「打開同意嗰一行」。要補好細：多加一條已分類嘅失敗，配一個 action 深連到設定 anchor
  `mojang-download-consent`，嗰個 anchor 喺 `settingsSections.ts` 已經存在。

### 專案 (Projects)

BlueMapGUI 嘅「project」係**磁碟上嘅一個資料夾**，入面有 `config/`、`web/`、下載返嚟嘅 jar 同 render 輸出
——即係一個專案一套 BlueMap 安裝，所以一個 modpack 或者一個 Minecraft 版本一個專案。呢個專案嘅 `project.ts`
講緊完全另一樣嘢：一個 `worldlens.project.json` 檔，**擺喺一個 Minecraft world 嘅 root**，
存住嗰個 world 嘅 map 同 storage。兩個係戴住同一個字嘅唔同概念，任何做實作嘅 agent 都要小心唔好撈亂。

- **有名嘅專案資料夾**：BlueMapGUI 有建立對話框，有名（用 `^[ a-zA-Z0-9_-]+$` 驗證）、有位置欄同資料夾
  選擇器，仲有即時嘅「Project will be created in: `<path>`」預覽；重複會拒絕，權限失敗會指名報出。
  呢邊 **missing**：`design/packages/config/src/project.ts` 定義嘅係一個專案*檔*，而且除咗
  `test/project.test.ts` 之外冇嘢 import 佢；冇專案清單、冇建立、冇刪除。工作量中等，
  但更大嘅問題係呢個專案究竟想唔想要資料夾式專案，因為佢係按 world render 入一個已設定嘅 storage 目錄。
- **專案清單**：BlueMapGUI 每行 show 名加完整路徑，每行都 watch 住自己嘅上層目錄，資料夾一被搬走或刪走
  就即時 show「Error: Directory not found.」。呢邊 **missing**。個即時目錄監看先係聰明嘅地方，
  而且好平：一行一個 watcher，唔係輪詢。
- **由清單移走但唔刪檔**：BlueMapGUI 有 hover 選單加確認對話框，白紙黑字講明目錄仍然留喺磁碟。
  呢邊 **missing**。可以對照 `docs/finding-worlds.md`，嗰度就 unmount 講緊一模一樣嘅道理——理由已經有，
  淨係差個介面。
- **OneDrive 保護**：預設位置係 OS 嘅 Documents 資料夾，但如果 Documents 喺 `OneDrive` 底下，
  就會改為指去真正嘅 Documents 路徑，仲有防呢個用戶真係叫做 `OneDrive` 嘅保護。呢邊 **missing**，
  冇任何等價物。呢個好細，而且個*諗法*值得整個抄過嚟。一個 Windows 用戶唔覺意將 40 GB tile 樹同步上
  OneDrive 係真實嘅支援負擔。喺呢邊適用嘅係**地圖 storage 目錄**，唔係專案。
- **喺檔案總管打開專案資料夾**：BlueMapGUI 有工具列按鈕同逐行選單。呢邊 **missing**：成個 `design/`
  入面都冇 `shell.showItemInFolder` 或者 `shell.openPath`，唯一嘅 shell 出口係 `github/external.ts`，
  而佢設計上淨係開 https。呢個要補唔難，但係真差距：呢個 app 寫 tile、config 同備份落磁碟，
  但完全冇途徑去到嗰度。要有自己嘅 IPC channel 加路徑白名單，唔可以係一個「乜都開得」嘅窿。
- **閂專案**：BlueMapGUI 有工具列按鈕加確認。呢邊 **n/a**，因為根本冇專案概念可以閂。

### 開專案：首次執行流程

呢個係 BlueMapGUI 最有趣嘅機制，而呢邊冇對應物，因為呢個專案係由 vendor 咗嘅 template 生成 config，
唔係問 CLI 攞。

- **生成預設 config**：BlueMapGUI 喺專案目錄用**冇任何參數**行一次 CLI，30 秒 timeout，
  並且將 stdout 出現 `Generated default config files for you` 當成成功。就算 config parse 有問題佢都容忍、
  照開，係刻意咁做，等用戶遲啲喺解釋得到嘅地方先撞到個錯。呢邊 **deliberate**：
  `design/packages/config/src/generate.ts` 加 `templates/sources.ts` 由上游預設值嘅逐位元組副本發出 config，
  完全唔使 JVM。**唔好抄**：要求開 config 編輯器之前先有 Java 係直接倒退。
- **地圖 template**：BlueMapGUI 會將生成出嚟嘅 `config/maps/` 改名做 `config/map-templates-<version>/`，
  再放返個空嘅 `config/maps/`；之後「New map」就由 template 複製。呢邊 **實際上 have**：`generate.ts`
  有 `MapPreset`，係 `"overworld"`、`"nether"`、`"end"` 嘅 union，每個 preset 有自己嘅 sky／void／ambient／
  cave／nether-ceiling 值。
- **跨 BlueMap 版本嘅專案升級**：如果 `config/maps/` 存在但當前版本冇對應嘅 template 目錄，
  BlueMapGUI 會將用戶啲 map 搬去 `config/maps.temp`，叫 CLI 重新生成一份新預設，將佢哋變成新 template，
  再將用戶啲 map 搬返入去。呢邊 **missing**：跨上游版本嘅 config 遷移喺呢度根本冇 model 過。
  工作量中等，而且要等到附帶嘅 BlueMap 版本郁咗先變得緊急。而家開個 issue 好過遲啲先發現。
- **分階段、老實嘅進度對話框**：BlueMapGUI 有八個有名嘅步驟——checking、downloading、hashing、running、
  mapping、copying、opening——每個有自己嘅句子，下載期間仲有一條有確定進度嘅 bar；仲有六種唔同嘅錯誤狀態，
  每種有自己嘅文案同一個可捲動嘅等寬詳情面板。呢邊 **partial**：`RenderRunPanel.vue` 有真實 phase
  （`starting → downloading-resources → … → finished`），`render/failure.ts` 亦有分類失敗，
  但冇對應嘅多步*安裝*流程，因為根本冇安裝。呢個模式本身已經係呢個專案嘅風格，冇嘢要引入；
  記低係因為如果將來真係有資料夾式專案流程，呢個就係要對齊嘅標準。
- **`startup.conf`**：BlueMapGUI **發明咗一個 BlueMap 本身冇嘅 config 檔**，再抄入 `config/`：
  `mods-path`、`minecraft-version`、`max-ram-limit`；啟動時將佢哋變成 `--mods`、`--mc-version`
  同一個 JVM `-XX:MaxRAM=`。呢邊 **partial**：`mods-folder` 同 `mc-version` 喺 Run tab 上做咗 CLI flag
  （`design/packages/config/src/cli/flags.ts`），所以啲值係有嘅。**但 Max RAM 唔係一個設定**：
  `jvmArgs` 由 `orchestrator.ts` 駁到 `runner.ts`，而唯一用到佢嘅係 `runner.test.ts` 度嘅 `-Xmx4G`；
  冇 UI、冇持久化、冇呼叫者。Max RAM 先係真差距，而且好細：一個設定、一個持久化嘅值、
  一個 `-Xmx`／`-XX:MaxRAM` 參數塞入現有嘅 `jvmArgs`。呢樣好緊要——一個冇上限嘅 JVM render 一個大 world
  就係經典嗰句「我部機吊咗」嘅來源。**唔好**抄嗰個自創檔案格式；設定要擺喺呢個專案放設定嘅地方。

### 地圖 (Maps)

- **由 template 新增地圖**：BlueMapGUI 個對話框有 template 下拉（Overworld／Nether／End，
  按每個 template 自己嘅 `sorting` 排）、名稱欄、即時嘅 **「Map ID: `<slug>`」** 預覽
  （`nameToID`：轉細楷，`[a-z0-9_-]` 以外全部收成 `-`）、重複 ID 拒絕，同埋會自適應嘅 placeholder；
  佢會複製 template 再改寫 `name:`。呢邊 **have，但做法唔同**：render wizard
  （`design/packages/ui/src/components/world/wizardSteps.ts`）分五步：world → 名同維度 → 選項 →
  去邊度 → 覆核。**即時 slug 預覽**值得攞：用戶打「My Cool Map」應該喺落實之前見到 `my-cool-map`，
  因為個 id 最尾會出現喺 URL 同資料夾名度。
- **重新排序地圖**：BlueMapGUI 喺 sidebar 有拖拉手柄，放低就將每個 map 嘅 `sorting:` 改寫成 `index * 100`；
  advanced mode 同任何 config 壞咗嘅時候會停用，原因記喺註解。呢邊 **partial**：`sorting` 喺 map schema
  同 `project.ts` 都有，地圖畫面亦可以當數字改，但冇拖拉排序。工作量細至中，而且做出嚟幾舒服。
  `index * 100` 嗰招——留低空位，令插入一個唔使改寫晒每個檔——個 idea 值得抄。
- **重 render 單一地圖**：BlueMapGUI 有個「Danger zone」按鈕，刪走 `web/maps/<sanitised-id>/`，
  等下次執行時重新生成；資料夾唔存在時會停用兼有 tooltip，而且文案直接講明冇嘢係救唔返嘅。
  呢邊 **missing**：Run tab 有 `--force-render`，render request 有 `force`／`fixEdges`，
  `configWorkspace.ts` 亦會喺改咗 config 之後警告邊啲 map *將會需要*重 render，但冇任何 code 刪 render 出嚟嘅 tile。
  工作量中等：需要一個只可以喺 app 自己 storage root 入面刪嘢、其他地方一律唔得嘅 IPC channel，
  而且必須擺喺 [super confirmation](./super-confirmation.md) 後面——刪走 render 輸出正正就係嗰道閘存在嘅原因。
  嗰句老實文案（「冇嘢救唔返，只不過要花時間」）先係啱嘅講法，呢個專案都應該咁講。
- **刪除地圖**：BlueMapGUI 確認之後會同時刪走 config 檔**同埋** render 出嚟嘅資料目錄。呢邊 **partial**：
  `MapsScreen.vue` 喺 super-confirm 閘後面刪 map config，而佢自己嘅文案明確講「already-rendered tiles in
  storage `{storage}` are NOT deleted.」。同上面一行用同一條 channel。而家嘅文案係老實嘅，
  呢個係「做唔齊」嘅正確方式——不過用戶刪咗個 map 之後發現幾 GB 孤兒 tile，始終係留咗份苦工畀佢。
- **警告某個資料夾唔係 world**：BlueMapGUI 個 World Path 欄即時驗證：目錄要存在，
  而且要有 `level.dat`、或者 `region/`、或者 `dimensions/<ns>/<dim>/region/`。呢邊 **have**：
  `design/packages/app/src/main/world/inspect.ts` 加成個 `world/` 嘅 discovery 層，
  見 [finding-worlds.md](./finding-worlds.md)。呢方面呢個專案領先好多：佢係幫你搵 world，
  而唔係叫你自己 browse。
- **警告 mods 資料夾冇 mod**：BlueMapGUI 喺 Mods Path 欄會喺目錄唔存在或者冇 `.jar` 嘅時候出警告。
  呢邊 **missing**：`mods-folder` 淨係 Run tab 上一個普通路徑 flag。呢個好細，
  而且係一個好例子，示範咗呢個專案每個路徑欄位都應該有嘅嗰類檢查。

### 執行中嘅程序，同點樣監看佢

- **Start / Stop**：BlueMapGUI 一粒掣管住四態機（stopped／starting／running／stopping），
  標籤同圖示跟住狀態變，Stop 送 SIGINT。呢邊 **have**：`render/runner.ts`（SIGINT 之後升級到 SIGKILL，
  Windows 行為有寫低）、`render/ipc.ts`、`ui/.../world/renderRun.ts` 嘅狀態機、
  `RenderRunPanel.vue` 嘅取消掣。
- **令 BlueMap 一路行住兼 watch**：`--render --watch --webserver`——render 完繼續行、繼續 watch world、
  繼續出圖。呢邊 **deliberate，但有保留**：`runner.ts` 淨係 spawn `-r -s`；`--watch` 其實喺 `cli/flags.ts`
  有 model，不過冇本機執行用到佢。呢樣係標記出嚟，唔係盲目推薦。watch 模式意味住一個長命 process、
  一個實時 web server，同一個完全唔同嘅主畫面。如果將來真係想要，就應該做成一個獨立、明示嘅模式，
  唔可以喺現有 render 上面靜靜雞加隻 flag。
- **一個 console**：BlueMapGUI 個 console 係黑底、等寬字，按等級上色（`ERR` 紅、`WARN` 黃、`INFO` 白、
  `[TIP]` 藍、`[Signal]` 灰），文字可以選取，有黐底自動捲動（只有已經喺底部先會黐），
  仲有一粒捲走之後就淡入嘅「捲返落底」掣。呢邊 **partial**：`render/progress.ts` 將
  `[HH:MM:SS LEVEL] message` parse 成有型別嘅行；`renderRun.ts` 保住一個 **200 行嘅環形緩衝**；
  `RenderRunPanel.vue` show 一個可摺疊嘅 `<pre>`。工作量中等，而且係最顯眼嘅差距。差咗嘅係：
  佢係一個有界嘅披露而唔係一等公民 console；淨係留 200 行；冇等級上色、冇黐底捲動、冇捲返落底嘅操作、
  冇逐等級篩選，而且**冇搜尋**——而呢個專案自己嘅規則講明每個咁樣嘅介面都一定要有搜尋，
  仲要接上 [regex builder](./regex-builder.md)。佢仲應該好似呢度其他記錄一樣可以匯出同複製。
- **log 入面嘅合成狀態行**：BlueMapGUI 會注入 `[Signal] Starting… / Running! / Stopping… / Stopped. (exitcode)`，
  令個 console 讀落似一段敘事。呢邊 **missing**：phase 係狀態，唔係 log 行。有咗真 console 之後呢個好易做。
- **為 CLI 輸出加註**：BlueMapGUI 有六條特定嘅改寫同注入提示：`core.conf` 指路；埠衝突嘅四行解釋，
  會指名講到 BlueMap 作為 client mod 同孤兒 process；第一次出現 `(ETA:` 時一次性提示「調高 render 執行緒數」；
  見到 `Start updating 0 maps` 時出警告；web server 起咗之後提示「而家可以開個地圖喇」。呢邊 **missing**：
  `render/progress.ts` parse 等級同進度，`render/failure.ts` 分類終止性失敗，但冇嘢會為一個*執行緊*嘅 log
  加建議。每條規則都好細，而呢個係由 BlueMapGUI 攞得返嚟最好嘅一個 idea：佢係將關於 BlueMap 自己輸出嘅知識，
  編碼喺用戶會撞到佢嘅地方。佢亦好夾呢個專案嘅語氣規則：事實係 CLI 嗰行，建議係呢個 app 嘅聲音，
  而 [funny level](./language-and-tone.md) 只會修飾建議、唔會掂引用嗰行。實作要做成一張
  （pattern → 建議）嘅表，有測試，唔好散落喺 stream handler 入面嘅一堆 if。
- **繞過上游嘅 hang**：BlueMapGUI 知道 CLI 一出 `Failed to load map config` 就會 hang，所以 5 秒之後殺咗佢。
  呢邊 **missing**：child process 冇 watchdog。呢樣好細，而且值得做成一條通用防護：
  一個有定義嘅停滯條件加 timeout，好過一個永遠唔完嘅轉圈。不過抄呢條規則之前，
  要先查下*呢個*特定 hang 喺 5.22-27 仲存唔存在。
- **閂窗時乾淨咁停低**：BlueMapGUI 攔截關窗、停 process、等到 stopped 狀態、停一秒畀用戶睇到「Stopped.」，
  然後先閂。呢邊 **partial**：被中斷嘅執行係靠 app-instance id 偵測出嚟，再提供續行
  （`render/resume.ts`、`InterruptedRenders.vue`）——可以話係更好嘅答案，因為佢連 crash 都應付到，
  唔止係禮貌地關窗。要補好細：乾淨退出時都應該停埋個 child，令續行提示係為真 crash 而設，
  而唔係每次退出都彈。
- **每次啟動前清空 console**：BlueMapGUI 有個 app 設定，預設開，文案解釋唔清嘅話舊錯誤會留喺畫面上令人混淆。
  呢邊 **missing**。有咗 console 之後呢個好易做。

### 睇 render 好嘅地圖

- **打開地圖**：BlueMapGUI 有粒「Open」掣，喺系統瀏覽器開 `http://localhost:<port>`，
  淨係執行緊嗰陣先啟用。呢邊 **deliberate**：呢個專案自己喺 `/local/{renderId}` 供應 render 好嘅 tile
  （`render/LocalMapHandler.ts`），喺 app 入面睇：`App.vue` 嘅 `openRenderedMap()` 會將一個完成咗嘅 render
  變成同遠端 server 共用嗰個清單入面嘅一項（`ui/src/stores/profiles.ts`），揀咗就會打開個地圖。
  乜都唔使做。App 內路線更好：冇未驗證嘅 listener，亦唔使繞去瀏覽器。
- **知道用邊個埠**：BlueMapGUI 用 regex 由 CLI 嗰句 `WebServer bound to …:8100` 度刮出個埠，失敗就當 8100。
  呢邊係 **deliberate**：獨立嘅本機 WebServer 決定已經退休，`webserver.conf` 寫住
  `enabled: false`，但 `render/LocalMapHandler.ts` 繼續提供 static `/local/{renderId}` route。
  Remote-hosting 嘅 web-server settings 仍然係另一回事。
- **慶祝**：BlueMapGUI 個 Open 掣喺 server 起身嗰陣會放大兼發光，指標一掂到就即刻收斂。呢邊 **missing**。
  記低係為咗趣味，唔係為咗對齊功能。如果呢邊要做類似嘢，就一定要尊重 reduced-motion。

### 改設定

- **表單式 config 編輯器**：BlueMapGUI 有五個有型別嘅檢視：Core、Startup、Webapp、Webserver、Map，
  總共大約 **21 個設定**（Core 2、Webapp 1、Webserver 1、Startup 2，一個 map 大約 15）。
  呢邊 **have，而且遠遠領先**：七個畫面（`ui/src/components/config/configSearch.ts`）——Core、Maps、
  Storages、Web app、Web server、Server plugin、Run——再加一個 History tab。Schema 欄位數目係
  core 10、map 32、mask 8、plugin 12、storage 10、webapp 20、webserver 8，仲有成套 CLI flag。
- **每個選項有豐富說明，有連結同 inline code**：BlueMapGUI 每個選項標題下面都有一段文字，
  連結會喺瀏覽器開，`minecraft:the_nether` 之類嘅 code 片段有樣式。呢邊 **have**：欄位描述同分組住喺 schema
  （`design/packages/config/src/schema/*.ts`），喺畫面上 render 出嚟。
- **config 檔太舊、冇嗰個選項嘅情況**：BlueMapGUI 會將缺失嘅 key **劃走兼停用**，checkbox 變成三態，
  tooltip 解釋個檔過時咗。呢邊 **missing**：呢個專案係由 schema 重寫成個檔，而唔係就地改 key，
  所以情況出現嘅方式唔同——但係一個**用戶自己提供**、入面有舊檔嘅 config 資料夾，就正正撞到呢種情況。
  工作量細至中，而且係一個真係好嘅模式：佢 show 出個設定存在、講明點解用唔到，而唔係靜靜雞收埋。
  呢個亦都夾返呢個專案自己講嘅規則：永遠唔好丟掉一個佢表達唔到嘅值。
- **精準寫入、保住註解**：BlueMapGUI 用 regex 只換走真實檔案入面對應 `key:` 嗰行嘅值，
  所以註解、次序同排版都保得住；喺編輯完成、放開 slider 同 dispose 時儲存。呢邊 **partial**：
  `ConfigApplyDialog.vue` 同 `configWorkspace.ts` 寫成套 config，`render/config.ts` 寫嘅檔自己 header
  就講明喺嗰度改嘢會被覆寫。呢樣淨係喺呢個 app 要改別人寫嘅資料夾時先有關。如果嗰個係支援嘅情況，
  保住註解基本上係必須——靜靜咁食咗用戶啲註解，就係嗰種佢一個月後先發現嘅嘢。
- **用友善名代替難明嘅 key**：BlueMapGUI 用「Render All Caves」代替 `remove-caves-below-y: -10000`、
  用「Render Only Visited Chunks」代替 `min-inhabited-time: 0/1`，又用一個三態圖示切換代替
  perspective／flat／free-flight 三個 boolean。呢邊 **partial**：schema 露出真實欄位同真實標籤。
  喺一個數值哨兵其實係 boolean 嘅地方，呢樣細而值得做。要守嘅規則：友善控制項唔可以隱藏實際值，
  切去 raw 檢視必須 show 到究竟寫咗乜。
- **天空同虛空嘅顏色選擇器**：BlueMapGUI 用 HSV 色輪加十六進位欄位，六位數，冇 alpha。
  呢邊 **have，而且遠遠領先**：[appearance editors](./appearance-editors.md) 帶住一個無限選擇器，
  仲有跨多個色彩空間嘅顏色轉換器。要確認嘅係*地圖 config* 嘅顏色欄位真係接到嗰個選擇器，
  而唔係一個普通文字輸入框。
- **Advanced／raw HOCON 編輯器**：BlueMapGUI 有個開關可以將表單換成一個對住原始檔嘅完整文字編輯器：
  **YAML 語法高亮**、行號、亮／暗 code 主題、綠色註解、唔自動換行、每五秒自動儲存加 dispose 時同步儲存。
  呢邊 **partial**：有個 `showAdvanced` 切換（`ConfigFileForm.vue`、`MapOptionsStep.vue`），
  但佢露出嘅係*進階欄位*，唔係原始文字。原始文字係一個唯讀嘅「show the file as it will be written」`<pre>`
  加一粒 Copy 掣；可編輯 textarea **只有**喺一個 HOCON parse 唔到嘅檔身上先出現，
  作為後備（`ConfigFileForm.vue`，喺 `configModel.ts` 度設閘）。**成個 repository 冇任何語法高亮。**
  工作量中等，分兩件事：每個 config 都有嘅可編輯 raw 檢視（唔止壞咗嗰啲），同一個高亮器。
  留意命名撞名——「advanced mode」喺兩個 app 度講緊兩樣嘢，呢邊嘅文件唔應該繼承呢個歧義。
- **Parse 錯誤指住出事嗰行**：BlueMapGUI 喺出事嗰行嘅行號位置印 `Error`，再用紅色橫幅講出問題；
  型別唔夾有自己嘅訊息：「There is likely a critical option renamed, removed, or commented out.」
  呢邊 **missing**：parse 唔到嘅檔會退回一個冇位置資訊嘅純 textarea。工作量中等，
  而且要睇 parser 有冇報位置。值得查下 `config/src/hocon/` 係咪已經帶住位置——如果有，
  咁「指住壞咗嗰行」就大部分係表現層嘅工。
- **由壞咗嘅 config 走出去嘅路**：BlueMapGUI 喺表單 render 唔到嗰陣會 show 一個紅色面板，
  上面有粒「Switch to Advanced Mode」掣。呢邊 **partial**：textarea 後備會出現，
  但冇解釋原因，亦冇畀選擇。要補好細：講出問題，再將 raw 編輯器做成一個有標籤嘅動作，
  而唔係靜靜雞替換咗。

### 應用程式設定、外框同更新

- **主題模式**：BlueMapGUI 有 System／Light／Dark 單選組，會持久化。呢邊 **have**：
  `ui/src/components/menu/SettingsMenu.vue`（default／dark／light／contrast），
  文件網站就用 `site/src/theme/ThemeController.ts`。
- **Material Design**：BlueMapGUI 明確用 M2（`useMaterial3: false`），加一個自己整嘅 `TechApp` 主題。
  呢邊 **deliberate**：呢個專案全程用 M3。冇嘢好攞。BlueMapGUI 嘅截圖唔係呢邊嘅設計參考。
- **視窗外框**：BlueMapGUI 用一般 OS 標題列，下面再放個 Flutter `AppBar`。呢邊 **deliberate**：
  呢個專案要求無邊框視窗加自訂嘅 Material 標題列。冇嘢好攞。
- **更新檢查**：BlueMapGUI 對 `releases/latest` 個 URL 發 HEAD 而**唔跟 redirect**，
  再由 `Location` header 讀出 tag——好聰明，唔使 API token 亦冇 rate limit。淨係喺 release build 行，
  可以用環境變數停用。之後 show 一粒黃色「Update」掣，tooltip 寫住 `2.0.1 -> 2.0.2`，
  撳落去喺瀏覽器開 releases 頁。**冇 app 內下載，亦冇安裝。** 呢邊 **missing**：
  冇 `autoUpdater`，任何地方都冇更新檢查。`electron-builder.config.cjs` 註明 Squirrel 會產生
  `RELEASES`／`.nupkg` 一對「that Electron's own autoUpdater consumes」——但冇嘢消費佢。工作量中等，
  而且呢個專案嘅標準高過 BlueMapGUI：要有 Squirrel feed、背景下載、簽章驗證，
  同一條常駐但唔阻擋操作嘅「重啟嚟安裝」橫幅，而唔係一條連去網頁嘅連結。
  嗰招 redirect 技倆仍然值得記住，做零依賴嘅後備方案。
- **說明連結**：BlueMapGUI 有粒工具列掣打開專案嘅說明頁。呢邊 **partial**：有文件網站同
  [changelog viewer](./changelog-viewer.md)，`github/external.ts` 亦開得 https URL，
  但 app 外框有冇一個 Help 入口就要確認。如果冇，補返都好細。
- **版本顯示**：BlueMapGUI 喺左下角長期印住「Version: `<v>` / BlueMap: `<tag>`」。呢邊 **partial**：
  版本喺 changelog viewer 同 About 類介面出現過，而**驅動緊嘅 BlueMap 版本**其實知道
  （`jars.ts` 由檔名 parse 到），但唔算有明顯露出。呢樣好細，而且值得做：
  「呢個係邊個 BlueMap？」係任何支援討論串嘅第一條問題。
- **資源包同資料包**：BlueMapGUI 冇管。`USAGE.md` 叫用戶撳「Open in file manager」，行去 `config/packs/`，
  再貼啲檔入去，仲連去上游 wiki；明言押後。呢邊 **missing**：`design/` 入面完全冇 `packs/` 概念。
  （`design/packages/engine` 係以*渲染器*身分 parse 資源包，嗰個唔係一個面向用戶嘅 packs 資料夾。）
  工作量中等，而且係機會：兩個程式都一樣冇，所以整一個真正嘅 pack 管理器——列出、加入、重新排序、
  啟用／停用，仲要將載入次序 show 出嚟——就係一個由打和變成領先嘅位。

### 打包同發佈

BlueMapGUI 嘅 Windows 產物係**runner 目錄嘅一個 zip**，冇安裝程式；Linux 就係 bundle zip 加一個 AppImage。
呢兩樣喺呢邊都係 **deliberate**：呢個專案出 Squirrel.Windows（`Setup.exe`、`RELEASES`、
完整同 delta `.nupkg`），而且決定咗淨係支援 Windows，所以冇嘢好攞。發佈把關方面，BlueMapGUI 有個 CI job
喺兩個平台建置之前先斷言 release tag 同 `pubspec.yaml` 嘅版本一致——呢個又平又好嘅諗法值得記低，
不過呢個 repository 有冇等價防護唔喺呢次審計範圍內。網站方面 BlueMapGUI 用 Dart 靜態網站生成器，
得一版首頁同一版對應 `USAGE.md` 嘅說明頁；呢邊 **have，而且遠遠領先**：`design/packages/site/`
每個功能一篇文章。

### 唔好攞嘅嘢

記低係為咗唔使人再推導一次：

1. **對住一個寫死嘅 hash 下載預建 CLI jar。** 得，而且令 app 細。但同時代表個 app 永遠只行得到常數指名嗰個
   BlueMap build，而換 hash 就等於出一次 app release。呢個 repository 由一個 pin 住嘅 submodule 建置，
   立場更穩。
2. **靠行 CLI 嚟生成 config。** 好優雅——預設值按構造一定係上游嘅。但佢令到 JVM 變成打開設定畫面嘅先決條件，
   亦令首次開啟嘅路徑變成一個 30 秒嘅子程序加一個字串比對式嘅成功判斷。Vendor 咗嘅 template 兩樣都唔使，
   一樣有相同保證。
3. **靠 shell out 去一個附帶 jar 嚟 parse HOCON。** 同樣嘅反對理由，而且更大。呢個專案嘅 TypeScript parser
   可測試、快，而且完全唔使 Java。
4. **Material Design 2 同 OS 標題列。** 呢邊兩樣都已經決定咗行另一邊。
5. **`startup.conf` 呢個檔案格式。** 佢入面嗰三個設定係值得有嘅。但一個 BlueMap 唔會讀嘅 config 檔，
   擺喺 BlueMap 嘅 config 目錄度扮到似 BlueMap 自己嘅檔，對於將來用真 CLI 開嗰個資料夾嘅人嚟講就係個陷阱。
6. **用 zip 做 Windows 安裝途徑。** 呢邊已經決定咗行另一邊。
7. **淨係一粒紅色文字掣嘅確認對話框。** 呢個專案對任何不可逆嘅嘢都有
   [super confirmation](./super-confirmation.md)，佢存在嘅原因正正就係：一粒撳一下嘅紅掣唔算係一道閘。

### 呢個專案領先嘅地方

寫出嚟，係為咗令實作工作只針對差距，唔會唔覺意搞爛咗現有嘅嘢：

- World discovery。BlueMapGUI 叫你自己 browse 去一個資料夾；呢個專案會搵 world、讀 `level.dat`、
  畀你掛載額外安裝，仲可以搜尋成堆（[finding-worlds.md](./finding-worlds.md)）。
- Config 覆蓋率：七個畫面大約 99 個 schema 欄位，對 21 個左右嘅設定。
- 除咗普通目錄之外仲有其他 storage，包括 SQL。
- 喺 GitHub Actions 度 render，可分片、可續行
  （[render-in-actions.md](./render-in-actions.md)、[resumable-renders.md](./resumable-renders.md)）。
- config 資料夾上嘅本機 git 歷史（[config-history.md](./config-history.md)）、
  [notification centre](./notification-centre.md)、[command palette](./command-palette.md)、
  [tabbed navigation](./tabbed-navigation.md)、[appearance editors](./appearance-editors.md)、
  每個搜尋介面都有嘅 [regex builder](./regex-builder.md)，同
  [language modes 同 funny levels](./language-and-tone.md)。BlueMapGUI 一樣都冇；佢淨係得英文，
  亦冇任何 app 內搜尋。
- Java provisioning 係驗證一個攞返嚟嘅 digest，而唔係一個編譯入去嘅常數，仲會記低裝咗乜。
- 同意係當作一個可審計嘅決定記錄，而唔係一個檔入面嘅 checkbox。

### 核實

呢份文件冇任何內容係靠行任何一個程式驗證過。佢係兩邊嘅源碼閱讀，而上面每一項聲稱都指名咗出處檔案，
方便人覆核。有兩樣嘢喺有人照住起嘢之前特別要確認：

- BlueMapGUI 繞開嗰個 `Failed to load map config` hang，喺呢個專案 vendor 嘅 BlueMap 版本入面仲存唔存在，
  然後先好抄佢嗰個五秒 watchdog；
- `design/packages/config/src/hocon/` 喺 parse 錯誤時會唔會報位置，呢樣決定咗「指住壞咗嗰行」
  係表現層嘅工定係 parser 嘅工。

### 相關文件

- [finding-worlds.md](./finding-worlds.md) - 呢個專案點樣搵 world 而唔係叫你自己搵
- [regex-builder.md](./regex-builder.md) - 呢邊每個新介面都要帶住嘅搜尋
- [super-confirmation.md](./super-confirmation.md) - 「刪走 render 好嘅 tile」呢類動作應該擺喺邊道閘後面
- [language-and-tone.md](./language-and-tone.md) - 點解加註嘅 log 建議可以搞笑，但引用嗰行唔可以
