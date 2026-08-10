# Automatic updates

The Windows installer has always been able to update this app, and until now the app never
asked it to. `design/packages/app/electron-builder.config.cjs` builds a Squirrel.Windows
target, and its own comment says why: Squirrel "also emits the RELEASES / .nupkg pair that
Electron's own autoUpdater consumes". Nothing consumed it. Every release shipped an update
mechanism that was never wired to anything, so the only way to move from one version to the
next was to notice a release existed and run the installer by hand.

This document covers the wiring, and three smaller closures that shipped in the same pass
and touch it: opening a folder the app wrote, keeping a tile tree out of OneDrive, and
putting a ceiling on the render JVM's memory. They share a page because they were built
together and because two of them are visible in the update flow — a render in progress is
what holds a restart, and the storage folder is one of the places a reveal is allowed to
open.

## Behaviour

### What happens, and when

| Moment                            | What the app does                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30 seconds after launch           | Checks the feed. Delayed on purpose: an update check is the least urgent thing happening while the window, the embedded server and the render restore are all starting. |
| Every 6 hours after that          | Checks again, unless an update is already staged.                                                                                                                       |
| After a failed check              | Backs off — doubling from six hours, capped at a day. A machine offline for a week does not spend it making one DNS query every six hours.                              |
| Once an update is staged          | Stops checking entirely. There is nothing left to discover; the installer is on disk and only the user's choice changes the situation.                                  |
| **Check for updates** in settings | Checks now, whatever the schedule says.                                                                                                                                 |

The download runs in the background and **the app never restarts itself**. Electron's
`autoUpdater` fetches and stages; installation happens only when the user presses **Restart
to install**.

### One version identity reaches the package, app, feed and release

`scripts/release-version.mjs` derives one monotonic semantic version from the checked-in
`major.minor.0` base and `GITHUB_RUN_NUMBER`. A run numbered 863 therefore packages and reports
`0.1.863`, publishes tag `v0.1.863`, writes that version into `RELEASES`, and supplies the same
value through `app.getVersion()` and the update-feed request. Packaging and publication both call
the committed resolver independently, and the workflow guard fingerprints both call sites.

This exact identity matters because `update.electronjs.org` compares the installed version with
the GitHub release **tag** as SemVer. The former split (`0.1.862` in the package beside
`v0.1.0-build.862`) ordered the release tag below an installed `0.1.828`, so the live service
correctly returned HTTP 204 even though a newer package was attached. The release manifest now
rejects that split tag shape and accepts only `v<major>.<minor>.<run>`.

### The banner

When an installer is downloaded, checked against the feed hash and staged, a persistent, non-blocking banner
appears (`design/packages/ui/src/components/update/UpdateBanner.vue`). It is modelled on
GitHub Desktop's: it sits in the layout rather than over it, never takes focus, never gates
anything, and stays until the user acts on it.

It names the exact version, links the release notes when the feed carried a link, and offers
**Restart to install** and **Later**. A downloaded feed entry whose release name is missing or
is not one exact semantic version is refused as `feed-mismatch`; the interface never turns an
ambiguous package name into an invented version.

That persistence is deliberate and is why this one message is a banner rather than a toast.
The project's rules put anything that merely _informs_ in the notification corner, where it
auto-dismisses — and an offer that has to survive an hour of rendering so it can be taken at
a moment of the user's choosing cannot auto-dismiss. "Nothing new" and "the check failed"
still go to the notification corner and the settings row; only "ready to install" persists.

**Later is per version, and never permanent.** Dismissing writes that one version to
`worldlens.update.dismissed`, so the banner does not come back for it after a restart
— and the _next_ release announces itself normally. The settings row carries **Show the
update banner again** so a dismissal is never a one-way door.

### Unsaved configuration, project edits and a render in progress protect themselves

The configuration editor reports its real `isWorkspaceDirty` state to the one update controller
mounted by `App.vue`. `ProjectsScreen.vue` independently reports the same serialized comparison
that drives its Save/autosave state. This remains true when `notifyAutosaveChange` rejects and the
visible edit exists only in renderer memory; an optimistic IPC call is not mistaken for a save.
While either source is dirty, **Restart to install** is disabled, the localized banner names
unsaved configuration or project work, and a second check at click time refuses before the renderer
can call the main-process restart channel. If the dirty-state probe throws, the safe answer is still
“unsaved”. When a restart does cross IPC, the renderer sends the same bounded boolean and the main
controller refuses `true`; a missing or malformed value from an older renderer is treated as
unsaved rather than free. Saving or explicitly discarding the work is the route back to Restart.

A BlueMap render of a large world runs for hours. Quitting into an installer half way through
throws that time away with no route back to it, so a render carries the same fail-closed rule:

- while a render is running, **Restart to install** is disabled and the banner's body text
  changes to say why. A control that looks live and silently does nothing is
  indistinguishable from a broken one, so the copy moves as well as the button;
- the main process re-reads the render guard at the moment the button is pressed, not from
  the state the banner was drawn with, because a render can start in between;
- if the activity probe itself throws, the answer is "busy". Unknown must never be the
  reason an update installs over a render.

The refusal is a **value**, not an exception: `{ ok: false, code: "render-in-progress",
message: … }`. The staged update is untouched, so nothing is lost by trying.

### The restart has a durable receipt

Calling `quitAndInstall()` only proves that Squirrel accepted the request; it cannot prove what
version the next process actually started. Immediately before that call, the main process writes
an atomic, permission-restricted receipt in the unchanged application-data directory. It contains
only the current version, target version, and request timestamp. If that receipt cannot be written,
the app does not quit and the update remains staged.

The next launch reads at most 4,096 bytes from one regular receipt before JSON parsing, validates
the exact version and timestamp fields, and compares the running package version with both ends of
the requested transition:

| Version that actually starts | Reported outcome |
| ---------------------------- | ---------------- |
| Requested target             | Installed; the receipt is consumed without a warning. |
| Previous version             | `rollback`; the target did not take over and the previous app is still running. |
| Any other version            | `feed-mismatch`; the transition is not described as a success. |
| Missing or malformed receipt | `feed-mismatch`; the app says it cannot prove the transition. |

The receipt is **not** deleted during that startup read. An automatic check may finish 30 seconds
after process start while the first renderer window is still loading; its result cannot clear the
rollback or mismatch finding. The main process pins that finding until the renderer has applied its
first updater state and sends the distinct acknowledgement IPC. Only then is the receipt removed.
If removal fails, the evidence remains pinned and is reconciled again on the next launch.

The updater never changes the application identity or its user-data path. Existing settings,
project history, cache, feed-handoff record, and update receipt therefore remain under the same
profile directory across Squirrel versions. Existing project autosave still flushes pending
project state during `before-quit`. This is a storage-boundary guarantee, not a substitute for the
packaged N→N+1 continuity exercise described under Verification.

### The visible states

The settings row (`UpdateStatusRow.vue`) always shows where things stand, and there is a
distinct state for each of: _nothing checked yet_, _checking_, _up to date_, _available_,
_downloading_, _ready_, _failed_, and _this build cannot update itself_.

`checking` is not a status — it is a flag laid over whatever is already known. The honest
thing to show while a check runs is "you are on 0.1.0, and I am looking", not a blank screen
that has forgotten what it knew a second ago. It also makes the next rule expressible:

**A staged update survives a later failure.** Once an installer is downloaded and its feed hash matches,
it installs whether or not the next scheduled check reaches the server. Letting a network
blip roll `ready` back to `failed` would take a working update away from somebody who was
about to restart into it. The failure is still recorded and still shown — hiding it would be
a lie in the other direction.

### Language and tone

Every sentence goes through the three language modes and both funny levels
(`updateCopy.ts`). The split that keeps that safe is structural rather than a convention:

- **version numbers travel as `{version}` placeholders** and are interpolated after the level
  has chosen the sentence, so no level can reach one. "0.2.0 has finished downloading and is
  tapping its foot" still says `0.2.0`, exactly;
- **every action label lives in a fixed catalogue** with one string per language, and the
  resolver never consults a level for it. There is no code path through which a funny level
  can reach the word "Restart".

Failure copy is styled like everything else — the rule is voice-not-facts, not a carve-out
for serious categories — and every level of it still says that nothing was installed and
nothing changed. A test walks all five levels in both languages and asserts both properties.

## Configuration

| Variable                    | Effect                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WORLDLENS_UPDATE_FEED`     | Points the updater at a different feed. Must be `https`, or `http` on loopback for a test server. An explicit override disables repository fallback. |
| `WORLDLENS_UPDATE_TOKEN`    | Sent as `Authorization: Bearer …` to a private feed. See the security section.                                                                       |
| `WORLDLENS_DISABLE_UPDATES` | Switches checking off entirely on a machine that manages its own installs.                                                                           |

The former `MATERIAL_BLUEMAP_UPDATE_FEED`, `MATERIAL_BLUEMAP_UPDATE_TOKEN`, and
`MATERIAL_BLUEMAP_DISABLE_UPDATES` names remain readable aliases during migration. When both
generations are set, the `WORLDLENS_` value wins. New configuration and diagnostics use only
the current names.

With no override, a packaged Windows build resolves
`https://update.electronjs.org/<owner>/<repo>/win32-<arch>/<version>`, which speaks
Squirrel.Windows natively and needs no API token and no rate limit.

### Repository-feed handoff

A packaged bridge build carries two explicit repositories: the Worldlens release repository and
the former repository as a bounded fallback. It checks Worldlens first. Until that profile has
actually downloaded an update from the Worldlens feed, a current-feed error or no-update answer
may cause one check against the legacy feed. After a current-feed download, the exact current and
legacy **repository-and-channel identity** pair is written atomically to
`%APPDATA%\Worldlens\.worldlens-update-feed-handoff.json`; later launches stop consulting the
legacy source. The versioned suffix of the feed URL is deliberately excluded, so installing a new
build does not forget an earlier confirmation. Changing repository, architecture, or channel
invalidates the confirmation and safely re-enters the bridge.

This is the installed-client route: an old installed build receives a bridge release from the
old feed, that bridge knows both repositories, and the following Worldlens release can arrive
directly from the Worldlens feed. A future repository redirect may help a request, but correctness
does not depend on that redirect existing or remaining assigned forever. An explicit
`WORLDLENS_UPDATE_FEED` is one operator-chosen feed and therefore has no automatic fallback.

Three states are **refusals with a reason**, not silence: not packaged, not Windows, and no
release repository configured. Each produces a sentence the settings row shows in place of a
check result, because "this build cannot update itself, and here is why" is actionable and a
button that spins forever is not.

## Failure modes

Every error the updater raises is classified once
(`design/packages/app/src/main/update/failure.ts`) into a code and a sentence written for a
person. `getaddrinfo ENOTFOUND` is accurate and useless; "the update server could not be
reached, the app will try again by itself" is not.

| Code               | What it means                                                                   | Retried automatically |
| ------------------ | ------------------------------------------------------------------------------- | --------------------- |
| `offline`          | No route to the update server.                                                  | Yes                   |
| `feed-unavailable` | The server answered with something that is not a release list.                  | Yes                   |
| `corrupt-asset`    | The bytes that arrived are not the bytes the feed described.                    | Yes                   |
| `not-installed`    | This copy was not installed by its installer, so there is no updater beside it. | No                    |
| `staging-failed`   | The disk is full, or the app's folder is not writable.                          | Yes                   |
| `rollback`         | The requested target did not become the version that started.                  | Yes                   |
| `feed-mismatch`    | Feed, receipt, and running-version metadata do not identify one transition.     | No                    |
| `unknown`          | Recognised as nothing in particular. The updater's own words travel as detail.  | Yes                   |

Worldlens packages are intentionally unsigned. The updater therefore makes no Authenticode
claim and does not classify the absence of a publisher signature as a defect. Integrity relies
on transport provenance, Squirrel feed metadata, and the package hash recorded in the feed. HTTPS
can authenticate the server named by the URL and protect bytes in transit; matching feed hashes
can prove the downloaded package is the package that server described. **Neither proves who
published or authored an intentionally unsigned package.** A compromised release account or feed
origin can publish a different unsigned package and matching hashes. A hash mismatch is a
`corrupt-asset` failure and nothing is installed from those bytes.

An `unknown` failure says so rather than guessing. A confident wrong diagnosis is worse than
an admission.

**Nothing is ever hidden behind a spinner.** A check that fails clears the checking flag in
the same step that records the failure, and a test asserts exactly that.

## Security considerations

- **The credential never leaves the main process.** The feed token is read from the
  environment, attached as a request header, and never placed in any value that crosses IPC.
  `describeFeed` exists for that reason: the interface is told the _address_ updates come
  from and whether one is authenticated, never the token. A test serialises the whole state
  object and asserts the token does not appear in it, because a header that leaks into a
  state object is invisible until somebody pastes a screenshot into an issue.
- **The feed must be `https`.** A plain-`http` override is refused with the reason, because
  an update fetched over plaintext can be replaced in transit. Loopback is the one exception,
  so a local test feed needs no certificate. HTTPS establishes transport protection and the
  identity of the contacted host under the certificate system; it does not authenticate the
  publisher of this unsigned application.
- **A release-notes link is only used when it is `https`.** Anything else is dropped rather
  than handed to the shell.
- **The artifacts are unsigned by permanent policy.** Packaging fixes
  `forceCodeSigning`, `signExecutable`, and `signAndEditExecutable` to `false` and clears
  signing environment inputs. It also sets `CSC_IDENTITY_AUTO_DISCOVERY=false`, so clearing an
  inherited certificate does not quietly restore electron-builder's automatic certificate search.
  The tracked icon and version resources are applied by a resource-only `rcedit` hook while the
  combined signer/editor route remains disabled. CI recursively checks every packaged executable
  and the collected installer with `Get-AuthenticodeSignature`; anything other than `NotSigned`
  blocks publication. There is no publisher-authenticity claim: HTTPS identifies the contacted
  host and protects transport, while Squirrel metadata and package hashes detect bytes that differ
  from what that host advertised. A hash mismatch is never installed.

## Opening a folder the app wrote

The app writes rendered tiles, config folders, downloaded worlds and backup staging
directories, and offered no route to any of them: the honest answer to "where did my map go"
was a path in a settings row somebody had to copy and paste.

`files:reveal` (`design/packages/app/src/main/files/reveal.ts`) closes that, and it is an
**allowlist** rather than a traversal check. Refusing `..` alone would still permit
`C:\Windows\System32\cmd.exe`, which contains no traversal at all. The rule is the other way
round: the path must resolve to somewhere inside a directory this application owns — its map
storage folder, its config folder, its own data directory — and everything else is refused by
name, with the reason naming what _can_ be opened.

Three properties are worth stating because each one is a real escape that does not look like
one:

- **Links are resolved before the comparison.** `<storage>\maps\evil` may be a junction to
  `C:\Windows`. Both the candidate and each root go through `realpath` first, so what is
  checked is the directory that will actually be opened.
- **Containment is by path segment, never by string prefix.** `C:\data\maps-evil` starts with
  every character of `C:\data\maps` and is a completely different directory.
- **A file is selected, never launched.** `showItemInFolder` opens the file manager with the
  item highlighted; `openPath` on a `.exe` would run it, and this channel must never be able
  to do that. Only directories are ever passed to `openPath`.

The roots are read fresh on every call, because the map storage directory moves while the app
is running and a captured list would keep allowing the folder somebody moved away from.

## Keeping a tile tree out of OneDrive

A render of a mature world is hundreds of thousands of small `.png` files totalling tens of
gigabytes. Written into a synced folder, every one of them is a file the sync client uploads,
versions and re-downloads elsewhere: the render crawls, the cloud quota disappears overnight,
and the first the person hears of it is a full-drive warning.

Windows makes this easy to walk into. "Back up your folders" moves the real `Documents` to
`%USERPROFILE%\OneDrive\Documents` and leaves the shell folder pointing at the moved copy, so
an app that politely asks the operating system for Documents is handed a synced folder without
either side mentioning it.

`resolveDocumentsDirectory` (`design/packages/app/src/main/files/documents.ts`) notices and
redirects to the real local `Documents` — and **explains**, rather than doing it silently. The
resolution carries a sentence naming what was found and where the maps will go instead, the
setting shows it, and the person can override it. An app that quietly writes somewhere other
than where the user was told is a worse problem than the one it was avoiding.

Two guards:

- **A user actually named `OneDrive`.** `C:\Users\OneDrive\Documents` is that person's real,
  local Documents folder; a naive "does the path contain OneDrive" check sends them out of it,
  into itself, forever. Only the path segments _below_ the home directory are considered, so
  the profile's own name is never one of them.
- **A local `Documents` that is not there.** The redirect is only made when the target
  directory exists. Otherwise the reported path is kept and the explanation says the app is
  writing into a synced folder, because moving somebody's maps into a directory that does not
  exist turns a performance problem into a failed render.

The idea comes from BlueMapGUI, which has the same guard. Nothing was copied from it — that
repository carries no licence, so all rights are reserved and only the observation travels.
See [the parity audit](./bluemapgui-parity.md).

## A memory ceiling for the render JVM

`render/orchestrator.ts` has always forwarded `jvmArgs` to `render/runner.ts`, which places
them before `-jar` exactly where a JVM wants them — and nothing ever passed any. The only
caller was a unit test asserting `-Xmx4G` reached the argument list. The plumbing shipped, the
setting did not, and every render this app has run used whatever heap the JVM picked for
itself.

That default is a quarter of physical memory on most machines and BlueMap will use all of it.
A render with an unbounded heap is the classic "my whole computer froze" report: the JVM takes
the memory, the operating system starts swapping, and everything else on the machine stops
responding while a background render finishes.

`RenderMemoryStore` (`design/packages/app/src/main/files/renderMemory.ts`) is the setting.

- **`-Xmx`, not `-XX:MaxRAM`.** They are not the same control. `-XX:MaxRAM` tells the JVM how
  much memory to _pretend_ the machine has when it derives its own defaults; the heap is then
  a fraction of that and may still grow past it. `-Xmx` is the hard ceiling, and a render that
  needs more fails with an `OutOfMemoryError` rather than taking the machine down with it. A
  failed render somebody can retry with a bigger number is a far better outcome than a frozen
  desktop.
- **The default is derived from the machine**: about half of physical memory, rounded to 256
  MB, never above 8 GB by the app's own choice, and never so much that less than 2 GB is left
  for everything else. The floor is 1 GB, below which BlueMap does not fail gracefully — it
  thrashes the collector for hours and then fails anyway.
- **Units are stated both ways** — `4096 MB (4.0 GB)` — so 4096 is never mistaken for 4, and
  the explanation beside the control says what the number does and what to do when a render
  runs out or the machine struggles.
- **A stored number the machine can no longer honour falls back to automatic.** A profile
  copied from a bigger machine, or memory removed, would otherwise hand a JVM a heap it
  refuses to start with — which looks exactly like a broken render.
- **A settings file that cannot be written never fails a render.** The choice applies for the
  session and the write failure is swallowed rather than raised into a render somebody
  started.

## Verification

Everything above is covered by unit tests that need **no update server, no Squirrel install,
no OneDrive and no particular amount of RAM**. Electron's `autoUpdater`, the shell, the file
system, the clock, the timers, the machine's memory and the render-activity probe are all
injected seams.

| Area                                                                                                                                         | Where                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Failure classification, every rule and the ordering between them                                                                             | `main/update/failure.test.ts`                                                                                     |
| Feed resolution, the three refusals, the https rule, the token redaction                                                                     | `main/update/feed.test.ts`                                                                                        |
| Current-first repository fallback, version-independent identity-pair confirmation, corruption handling                                       | `main/update/feedHandoff.test.ts`, `main/update/controller.test.ts`, `test/updateFeedRepositoryInjection.test.ts` |
| Exact transition receipt, acknowledgement-only consumption, rollback, mismatch, corruption, bounded fields and bounded bytes                 | `main/update/installJournal.test.ts`                                                                              |
| The state machine, including "ready survives a failure" and "unsupported is terminal"                                                        | `main/update/state.test.ts`                                                                                       |
| The schedule: interval, back-off, cap, floor, and stopping once staged                                                                       | `main/update/schedule.test.ts`                                                                                    |
| No update, available, downloading, ready, exact-version refusal, restart journal, early-check rollback retention, acknowledgement failure, offline, corrupt asset, disposal, render activity, and cross-version handoff | `main/update/controller.test.ts` |
| The channels, the push, and that no credential crosses them                                                                                  | `main/update/ipc.test.ts`                                                                                         |
| The OneDrive redirect and the user-called-OneDrive guard                                                                                     | `main/files/documents.test.ts`                                                                                    |
| The reveal allowlist: prefix siblings, links, relative paths, missing roots, files versus folders                                            | `main/files/reveal.test.ts`                                                                                       |
| The memory ceiling: recommendation, bounds, persistence, corruption, and the arguments produced                                              | `main/files/renderMemory.test.ts`                                                                                 |
| The banner and the settings row as pure models                                                                                               | `ui/components/update/updateModel.test.ts`                                                                        |
| Three language modes, five levels each, and that no level touches a version or a button                                                      | `ui/components/update/updateCopy.test.ts`                                                                         |
| The live controller and the bridge probe                                                                                                     | `ui/components/update/useUpdates.test.ts`                                                                         |
| The banner mounted: held Restart, dismissal, bilingual `lang`, exact version at level 5                                                      | `ui/components/update/UpdateBanner.test.ts`                                                                       |
| The mounted shell's real generated config workspace and project dirty signal disable Restart before the bridge call                          | `ui/App.test.ts`, `ui/components/project/ProjectsScreen.test.ts`                                                   |

### Packaged proof still required

**Not verified by running it.** No packaged N→N+1 pair containing this transition-receipt and
unsaved-work implementation exists yet. The two most recent inspected releases before this change,
`v0.1.0-build.828` and `v0.1.0-build.862`, both report `immutable: false` through the GitHub release
API and both predate this implementation. Their split tag/package version identity also makes the
configured service return HTTP 204 for the older installed package. They therefore cannot satisfy
issue #79's requirement for two consecutive immutable builds of the code under test.

The required runtime proof remains: clean-install immutable N in an isolated profile, let its real
HTTPS Squirrel feed detect/download/hash/stage immutable N+1, exercise Later and Restart, and verify
the exact release target, asset hashes, receipt outcome, settings/project/history/cache continuity,
and returned focus from the N+1 process. The cheap headless capture must come from those real
installed builds; a mock banner is not evidence.

Electron's Squirrel `autoUpdater` also exposes no supported API for aborting an in-flight download.
`dispose()` cancels this controller's timers and ignores late events during shutdown, but that is not
a user-driven package-download cancellation. That acceptance case remains open rather than being
renamed into a passing test. Until the immutable pair and that supported cancellation route exist,
the feature is locally implemented and regression-tested but the full installed-client claim is
blocked.

## Related

- [Feature parity with BlueMapGUI](./bluemapgui-parity.md) — the audit that named these four gaps
- [Language modes and funny levels](./language-and-tone.md) — the voice-not-facts rule the update copy follows
- [Notification centre](./notification-centre.md) — where everything that only informs goes instead of the banner
- [Renders that survive being interrupted](./resumable-renders.md) — the other place a render in flight is protected

## 廣東話

呢篇講自動更新 (Automatic updates)。

Windows installer 一直都有能力更新呢個 app，只不過直到而家個 app 都未曾叫過佢做。`design/packages/app/electron-builder.config.cjs` 會 build 一個 Squirrel.Windows target，佢自己嘅註解都講咗原因：Squirrel「亦都會 emit Electron 自己個 autoUpdater 食嘅 RELEASES / .nupkg 一對」。但係從來冇嘢食過佢。每個 release 都出咗一套完全冇接落去嘅更新機制，所以由一個版本行去下一個版本嘅唯一方法，就係自己留意到有 release，再手動行 installer。

呢份文件講嘅係接線工程，同埋同一批一齊出、又同佢有關嘅三個較細嘅收尾：打開 app 寫入過嘅資料夾、令 tile tree 唔好落 OneDrive，以及畀 render JVM 嘅記憶體加個上限。佢哋擺埋同一頁，係因為一齊起，亦因為其中兩樣喺更新流程入面睇得見 —— 行緊嘅 render 就係拖住重新啟動嗰樣嘢，而 storage 資料夾就係 reveal 容許打開嘅其中一個地方。

### 行為 (Behaviour)

#### 幾時做啲乜

啟動之後 30 秒會查一次 feed，刻意延遲：喺視窗、內嵌 server 同 render 還原全部開緊嗰陣，更新檢查係最唔緊急嗰樣嘢。之後每 6 個鐘再查，除非已經有更新 staged。查失敗之後會 back off，由六個鐘開始翻倍，上限一日 —— 一部離線咗一個禮拜嘅機唔應該成個禮拜每六個鐘做一次 DNS query。一旦有更新 staged，就完全停止檢查：已經冇嘢好發現，installer 已經喺 disk 上面，淨係用戶嘅選擇先會改變局面。設定入面嘅 **Check for updates** 就即刻查，唔理個時間表。

下載喺背景行，而**個 app 永遠唔會自己重新啟動**。Electron 嘅 `autoUpdater` 負責攞同 stage；安裝淨係喺用戶撳 **Restart to install** 嗰陣先會發生。

#### 一個版本身分同時去到 package、app、feed 同 release

`scripts/release-version.mjs` 由 check in 咗嘅 `major.minor.0` 基底同 `GITHUB_RUN_NUMBER` 推導出一個單調遞增嘅 semantic version。所以 run number 863 就會打包同報告 `0.1.863`、發佈 tag `v0.1.863`、將呢個版本寫入 `RELEASES`，並且透過 `app.getVersion()` 同更新 feed 請求提供同一個值。打包同發佈都各自獨立咁叫呢個已 commit 嘅 resolver，而 workflow guard 會對兩個呼叫點做 fingerprint。

呢個準確嘅身分好重要，因為 `update.electronjs.org` 係將已安裝版本同 GitHub release 嘅 **tag** 當 SemVer 咁比較。以前嗰種分裂（package 入面係 `0.1.862`，而 tag 係 `v0.1.0-build.862`）令 release tag 排喺一個已安裝嘅 `0.1.828` 之下，所以線上服務就算有更新嘅 package 附住，都正確咁回 HTTP 204。而家 release manifest 會拒絕嗰種分裂 tag 形狀，淨係接受 `v<major>.<minor>.<run>`。

#### 個 banner

當一個 installer 下載完、對過 feed hash、又 stage 好之後，會出現一條持續、唔阻塞嘅 banner（`design/packages/ui/src/components/update/UpdateBanner.vue`）。佢係參照 GitHub Desktop 嗰條做：坐喺 layout 入面而唔係浮喺上面，永遠唔攞 focus，永遠唔攔住任何嘢，一直留到用戶處理佢為止。

佢會講明確實嘅版本、當 feed 帶連結嗰陣會連去 release notes，並且提供 **Restart to install** 同 **Later**。一個下載咗嘅 feed entry 如果 release 名唔見咗，或者唔係一個準確嘅 semantic version，就會以 `feed-mismatch` 拒絕；介面永遠唔會將一個含糊嘅 package 名變成一個作出嚟嘅版本。

嗰種持續性係刻意嘅，亦係點解淨係呢一條訊息係 banner 而唔係 toast。專案嘅規則將所有淨係*通知*嘅嘢擺去通知角落，喺嗰度會自動消失 —— 而一個要捱得住一個鐘 render、等用戶揀自己嗰刻先接受嘅邀請，係唔可以自動消失。「冇新嘢」同「檢查失敗」照樣去通知角落同設定行；淨係「準備好安裝」先會持續留低。

**Later 係逐個版本計，而且永遠唔係永久。** 撳走佢會將嗰一個版本寫入 `worldlens.update.dismissed`，所以重新啟動之後嗰個版本嘅 banner 唔會返嚟 —— 但*下一個* release 會照樣宣告自己。設定行有 **Show the update banner again**，所以撳走咗永遠唔係一道單程門。

#### 未儲存嘅設定、專案編輯同行緊嘅 render 會自我保護

設定編輯器會將佢真實嘅 `isWorkspaceDirty` 狀態報告畀由 `App.vue` mount 嘅唯一一個更新控制器。`ProjectsScreen.vue` 亦獨立咁報告同一個驅動佢 Save/autosave 狀態嘅序列化比較。即使 `notifyAutosaveChange` 失敗、而睇得見嘅編輯淨係存在於 renderer 記憶體入面，呢點依然成立；一個樂觀嘅 IPC 呼叫唔會被當成一次儲存。只要任何一邊仲係 dirty，**Restart to install** 就會 disable，本地化嘅 banner 會講明係未儲存嘅設定定係專案工作，而撳落去嗰刻仲會再檢查一次，喺 renderer 有機會叫 main process 嘅重啟 channel 之前就拒絕。如果 dirty 狀態探測 throw，安全嘅答案仍然係「未儲存」。當重啟真係過 IPC，renderer 會傳同一個有界 boolean，而 main 控制器會拒絕 `true`；由舊 renderer 傳嚟嘅缺失或者畸形值會當成未儲存而唔係當成無牽掛。儲存或者明確放棄嗰啲工作，就係返返去可以 Restart 嘅路。

一個大世界嘅 BlueMap render 會行幾個鐘。做到一半退出去行 installer，就係將嗰段時間白白掉咗而且冇路攞返，所以 render 帶住同一條 fail-closed 規則：

- render 行緊嗰陣，**Restart to install** 會 disable，而 banner 嘅正文會改成講明點解。一個睇落生猛但撳落去乜都唔做嘅控件，同一個爛咗嘅控件係分唔到嘅，所以文案要同粒掣一齊郁；
- main process 係喺粒掣被撳嗰一刻重新讀 render guard，唔係用畫 banner 嗰陣嘅狀態，因為 render 可以喺中間開始；
- 如果活動探測本身 throw，答案就係「忙緊」。「唔知」永遠都唔可以成為一個更新蓋過一個 render 嘅理由。

呢個拒絕係一個**值**，唔係一個例外：`{ ok: false, code: "render-in-progress", message: … }`。已 stage 嘅更新完全冇郁過，所以試一次乜都唔會蝕。

#### 重新啟動有一張耐用嘅收據

叫 `quitAndInstall()` 淨係證明到 Squirrel 收咗個請求，證明唔到下一個 process 實際上以邊個版本起。所以喺嗰個呼叫之前一刻，main process 會喺冇改變過嘅 application-data 目錄入面，寫一張原子化、權限受限嘅收據。入面淨係得當前版本、目標版本同請求時間戳。如果嗰張收據寫唔到，個 app 唔會退出，更新繼續 staged。

下次啟動會喺 JSON 解析之前，由一個普通收據檔最多讀 4,096 bytes，驗證版本同時間戳欄位是否準確，再將行緊嘅 package 版本同所請求嘅轉換兩端做比較。如果實際起嘅係所請求嘅目標，就報告為已安裝，收據無聲咁消耗掉；如果起嘅係之前嗰個版本，就報 `rollback`，即係目標冇接手、舊 app 仲行緊；如果係其他任何版本，就報 `feed-mismatch`，唔會將呢次轉換講成成功；收據唔見咗或者畸形，一樣係 `feed-mismatch`，個 app 會講佢證明唔到呢次轉換。

嗰張收據喺啟動嗰次讀取之後**唔會**刪除。一個自動檢查可能喺 process 起咗 30 秒之後完成，而第一個 renderer 視窗仲載緊；佢個結果唔可以清走 rollback 或者 mismatch 嘅發現。Main process 會將呢個發現釘住，直到 renderer 套用咗第一個 updater 狀態、並且送出一個獨立嘅確認 IPC 為止。到嗰陣先會移除收據。如果移除失敗，證據會繼續釘住，下次啟動再對數。

Updater 永遠唔會改 application identity 或者佢嘅 user-data 路徑。所以現有嘅設定、專案歷史、cache、feed 交接記錄同更新收據，喺跨 Squirrel 版本之後都仲喺同一個 profile 目錄底下。現有嘅專案 autosave 仍然會喺 `before-quit` 期間 flush 未寫低嘅專案狀態。呢個係一個 storage 邊界保證，唔可以取代驗證章節講嗰個 packaged N→N+1 連續性演練。

#### 睇得見嘅狀態

設定行（`UpdateStatusRow.vue`）永遠顯示而家去到邊，而且以下每一個都有獨立狀態：*仲未查過*、*查緊*、*已係最新*、*有更新*、*下載緊*、*準備好*、*失敗*，同埋*呢個 build 更新唔到自己*。

`checking` 唔係一個 status —— 佢係鋪喺已知資訊上面嘅一個 flag。查緊嗰陣老實嘅顯示應該係「你而家係 0.1.0，我搵緊」，而唔係一塊一秒前知道嘅嘢都唔記得晒嘅白畫面。咁樣亦令下一條規則講得出：

**已 stage 嘅更新捱得住之後嘅失敗。** 一個 installer 一旦下載完而且 feed hash 對得上，佢就會安裝，唔理下一次排程檢查有冇連到 server。畀一次網絡打嗝將 `ready` 退返做 `failed`，即係將一個行得通嘅更新由一個就嚟重啟入去嘅人手上攞走。嗰次失敗仍然會記錄同顯示 —— 收埋佢就係另一個方向嘅講大話。

#### 語言同語氣 (Language and tone)

每一句都會行三種語言模式同兩個搞笑等級（`updateCopy.ts`）。令呢件事安全嘅拆分係結構性嘅，唔係一個慣例：

- **版本號用 `{version}` placeholder 走**，喺等級揀完句子之後先插值，所以冇任何等級掂到佢。「0.2.0 has finished downloading and is tapping its foot」照樣準確咁講 `0.2.0`；
- **每個動作 label 都住喺一個固定目錄**，每種語言一條字串，而 resolver 永遠唔會為佢查等級。冇任何程式路徑令一個搞笑等級可以掂到 "Restart" 呢個字。

失敗文案同其他嘢一樣有風格 —— 規則係語氣可變、事實不可變，唔會為嚴肅類別開特例 —— 而且每一個等級都仍然會講明乜都冇安裝、乜都冇改。有一個測試會行齊兩種語言嘅五個等級，並且斷言呢兩項性質。

### 設定 (Configuration)

`WORLDLENS_UPDATE_FEED` 令 updater 指向另一個 feed，必須係 `https`，或者 loopback 上面嘅 `http`（畀測試 server 用）；明確覆寫會停用 repository fallback。`WORLDLENS_UPDATE_TOKEN` 會以 `Authorization: Bearer …` 送去一個私有 feed，詳情睇保安章節。`WORLDLENS_DISABLE_UPDATES` 喺自己管理安裝嘅機上面完全熄咗檢查。

以前嗰三個帶前朝產品名 prefix 嘅環境變數名（feed、token、disable 三個）喺遷移期間仍然係可讀嘅別名。當兩代同時設定，`WORLDLENS_` 嗰個贏。新嘅設定同診斷淨係用而家嘅名。

冇覆寫嘅話，一個打包咗嘅 Windows build 會解析去 `https://update.electronjs.org/<owner>/<repo>/win32-<arch>/<version>`，佢原生講 Squirrel.Windows，唔需要 API token，亦冇 rate limit。

#### Repository feed 交接

一個打包咗嘅 bridge build 帶住兩個明確 repository：Worldlens 嘅 release repository，同前一個 repository 做有界 fallback。佢會先查 Worldlens。喺嗰個 profile 真係由 Worldlens feed 下載過一次更新之前，當前 feed 出錯或者答冇更新，可能會令佢向舊 feed 查一次。喺當前 feed 下載成功之後，準確嘅當前同舊 **repository-and-channel identity** 一對會原子化咁寫入 `%APPDATA%\Worldlens\.worldlens-update-feed-handoff.json`；之後嘅啟動就唔會再問舊來源。Feed URL 嘅版本後綴係刻意排除嘅，所以裝一個新 build 唔會令佢唔記得之前嘅確認。改 repository、架構或者 channel 會令個確認失效，安全咁重新入返 bridge。

呢條係已安裝客戶端嘅路線：一個舊嘅已安裝 build 由舊 feed 收到一個 bridge release，嗰個 bridge 識得兩個 repository，之後嘅 Worldlens release 就可以直接由 Worldlens feed 到達。將來嘅 repository redirect 可能幫到一個請求，但正確性唔會依賴嗰個 redirect 存在或者永遠保持指派。明確設定嘅 `WORLDLENS_UPDATE_FEED` 係一個由操作者揀嘅 feed，所以冇自動 fallback。

有三個狀態係**帶原因嘅拒絕**，唔係沉默：未打包、唔係 Windows、同埋冇設定 release repository。每一個都會出一句說話，喺設定行度取代檢查結果顯示，因為「呢個 build 更新唔到自己，原因係咁」係可以行動嘅，而一粒轉極都唔停嘅掣就唔係。

### 失敗情況 (Failure modes)

Updater 拋出嘅每個錯誤都會喺 `design/packages/app/src/main/update/failure.ts` 分類一次，變成一個 code 同一句寫畀人睇嘅說話。`getaddrinfo ENOTFOUND` 準確但冇用；「連唔到更新伺服器，個 app 會自己再試」就唔係。

`offline` 即係去唔到更新 server，會自動重試。`feed-unavailable` 即係 server 答咗啲唔係 release list 嘅嘢，會重試。`corrupt-asset` 即係到手嘅 bytes 唔係 feed 所描述嗰啲 bytes，會重試。`not-installed` 即係呢份副本唔係由佢個 installer 裝，所以隔籬冇 updater，唔會重試。`staging-failed` 即係 disk 爆咗或者 app 個資料夾寫唔到，會重試。`rollback` 即係所請求嘅目標冇成為實際起嗰個版本，會重試。`feed-mismatch` 即係 feed、收據同執行中版本嘅 metadata 識別唔到單一次轉換，唔會重試。`unknown` 即係認唔出係邊樣，updater 自己嘅字眼會當 detail 咁帶住，會重試。

Worldlens 嘅 package 係刻意唔簽名嘅。所以 updater 唔會作任何 Authenticode 聲稱，亦唔會將冇發行者簽名當成缺陷。完整性靠傳輸來源、Squirrel feed metadata 同 feed 入面記錄嘅 package hash。HTTPS 可以認證 URL 所指嗰部 server，並且保護傳輸中嘅 bytes；feed hash 對得上可以證明下載到嘅 package 就係嗰部 server 描述嗰個。**但呢兩樣都證明唔到一個刻意唔簽名嘅 package 係邊個發佈或者作者係邊個。** 一個被入侵嘅 release 帳戶或者 feed 來源，可以發佈一個唔同嘅未簽名 package 同對得上嘅 hash。Hash 對唔上就係 `corrupt-asset` 失敗，嗰啲 bytes 唔會裝到任何嘢。

一個 `unknown` 失敗會照直講，唔會靠估。一個好肯定但錯嘅診斷，仲衰過認低威。

**永遠唔會有嘢收埋喺一個 spinner 後面。** 一次失敗嘅檢查會喺記錄失敗嘅同一步清走 checking flag，而且有測試準確咁斷言呢點。

### 保安考慮 (Security considerations)

- **憑證永遠唔會離開 main process。** Feed token 由環境讀入、掛成 request header，永遠唔會擺入任何過 IPC 嘅值。`describeFeed` 就係為咗呢個而存在：介面知道嘅係更新嚟自邊個*地址*、同埋有冇認證，永遠唔知個 token。有測試會將成個 state object 序列化，斷言個 token 唔會出現喺入面，因為一個漏入 state object 嘅 header 係睇唔見嘅，直到有人將 screenshot 貼落 issue 為止。
- **Feed 必須係 `https`。** 純 `http` 覆寫會連原因一齊拒絕，因為經明文攞嘅更新可以喺傳輸途中被掉包。Loopback 係唯一例外，令本地測試 feed 唔需要憑證。HTTPS 建立傳輸保護同憑證系統下所連接主機嘅身分；佢唔會認證呢個未簽名 application 嘅發行者。
- **Release notes 連結淨係喺佢係 `https` 嗰陣先會用。** 其他一律掉咗，唔會交畀 shell。
- **產物按永久政策唔簽名。** 打包會將 `forceCodeSigning`、`signExecutable` 同 `signAndEditExecutable` 定死為 `false`，並清走簽名相關嘅環境輸入。仲會設 `CSC_IDENTITY_AUTO_DISCOVERY=false`，令清走一個繼承嚟嘅憑證唔會靜靜雞令 electron-builder 恢復自動搵憑證。被追蹤嘅 icon 同版本資源，係由一個 resource-only 嘅 `rcedit` hook 套用，而合併嘅 signer/editor 路線繼續停用。CI 會遞迴咁用 `Get-AuthenticodeSignature` 檢查每一個打包咗嘅可執行檔同收集到嘅 installer；任何唔係 `NotSigned` 嘅結果都會擋住發佈。呢度冇任何發行者真確性聲稱：HTTPS 識別所連接嘅主機同保護傳輸，而 Squirrel metadata 同 package hash 就偵測同該主機所宣告唔同嘅 bytes。Hash 對唔上就永遠唔會安裝。

### 打開 app 寫入過嘅資料夾

個 app 會寫 render 出嚟嘅 tile、config 資料夾、下載返嚟嘅世界同 backup staging 目錄，但一路以嚟都冇提供任何路徑去到佢哋：對住「我張地圖去咗邊」，老實答案就係設定行入面一條要人自己複製貼上嘅路徑。

`files:reveal`（`design/packages/app/src/main/files/reveal.ts`）補咗呢個窿，而且佢係一個**允許清單 (allowlist)**，唔係一個穿越檢查。淨係拒絕 `..` 仍然會放行 `C:\Windows\System32\cmd.exe`，而嗰條路徑根本冇任何穿越。規則係反過嚟：條路徑必須解析到呢個 application 擁有嘅其中一個目錄入面 —— 佢嘅 map storage 資料夾、佢嘅 config 資料夾、佢自己嘅 data 目錄 —— 其餘一律點名拒絕，並且喺原因入面講明*可以*打開嘅係乜。

有三項性質值得講明，因為每一項都係一個唔似逃逸嘅真逃逸：

- **連結會喺比較之前先解析。** `<storage>\maps\evil` 可能係一個指向 `C:\Windows` 嘅 junction。候選路徑同每一個 root 都會先過 `realpath`，所以被檢查嘅係實際會打開嗰個目錄。
- **包含關係係按路徑段判斷，永遠唔會按字串前綴。** `C:\data\maps-evil` 開頭一個字唔差咁包含 `C:\data\maps`，但佢係一個完全唔同嘅目錄。
- **檔案係被選取，永遠唔會被啟動。** `showItemInFolder` 會打開檔案管理員並且 highlight 嗰件嘢；對住一個 `.exe` 用 `openPath` 就會行佢，而呢條 channel 永遠唔可以做得到。只有目錄先會傳畀 `openPath`。

啲 root 每次呼叫都會重新讀，因為 map storage 目錄會喺 app 行緊嗰陣搬走，而一份影低咗嘅清單會繼續放行一個人已經搬離嘅資料夾。

### 令 tile tree 唔好落 OneDrive

一個成熟世界嘅 render 係幾十萬個細 `.png` 檔，總共幾十 GB。寫落一個同步資料夾入面，每一個都係 sync client 要上載、版本化、再喺第二部機下載嘅檔：render 慢到爬、雲端配額一夜蒸發，而當事人第一次聽到呢件事，就係一個磁碟爆滿警告。

Windows 好易令人踩落去。「Back up your folders」會將真正嘅 `Documents` 搬去 `%USERPROFILE%\OneDrive\Documents`，並且令 shell folder 指住搬咗嘅副本，所以一個有禮貌咁問作業系統攞 Documents 嘅 app，就會攞到一個同步資料夾，而兩邊都冇提過。

`resolveDocumentsDirectory`（`design/packages/app/src/main/files/documents.ts`）會察覺到，並且改指去真正嘅本地 `Documents` —— 而且會**解釋**，唔會靜靜雞做。個解析結果會帶一句說話講明搵到咗乜、啲地圖改為去邊，設定會顯示佢，用戶亦可以覆寫。一個靜靜雞寫去唔係佢話畀你聽嗰個位嘅 app，係一個比佢想避開嗰個問題更嚴重嘅問題。

兩道守衛：

- **真係叫做 `OneDrive` 嘅用戶。** `C:\Users\OneDrive\Documents` 就係嗰個人真正嘅本地 Documents 資料夾；一個天真嘅「條路徑有冇 OneDrive」檢查會將佢永遠踢出自己個資料夾、再踢返入自己。所以淨係考慮 home 目錄*以下*嘅路徑段，令 profile 自己個名永遠唔會被算入。
- **本地 `Documents` 唔喺度。** 只有當目標目錄存在嗰陣先會改指。否則會保留所報告嘅路徑，並且喺解釋度講明個 app 正寫入一個同步資料夾，因為將人哋啲地圖搬去一個唔存在嘅目錄，就會將一個效能問題變成一次失敗嘅 render。

呢個諗法嚟自 BlueMapGUI，佢有同樣嘅守衛。冇任何嘢由佢度抄過嚟 —— 嗰個 repository 冇 licence，即係保留一切權利，所以走過嚟嘅淨係一個觀察。詳見 [the parity audit](./bluemapgui-parity.md)。

### Render JVM 嘅記憶體上限

`render/orchestrator.ts` 一路以嚟都會將 `jvmArgs` 轉交畀 `render/runner.ts`，佢會將啲參數擺喺 `-jar` 之前，正正就係 JVM 想要嘅位置 —— 但從來冇人傳過任何嘢入去。唯一嘅呼叫者係一個斷言 `-Xmx4G` 有去到參數列表嘅單元測試。管道出咗街，設定冇出，而呢個 app 行過嘅每次 render 用嘅都係 JVM 自己揀嘅 heap。

嗰個預設值喺大部分機上面係實體記憶體嘅四分之一，而 BlueMap 會用晒佢。一個 heap 冇上限嘅 render 就係經典嗰句「我成部電腦死咗」：JVM 攞晒啲記憶體、作業系統開始 swap，而部機上面其他所有嘢都無反應，等一個背景 render 做完。

`RenderMemoryStore`（`design/packages/app/src/main/files/renderMemory.ts`）就係嗰個設定。

- **用 `-Xmx`，唔用 `-XX:MaxRAM`。** 佢哋唔係同一個控制。`-XX:MaxRAM` 係話畀 JVM 知，佢推導自己預設值嗰陣要*扮*部機有幾多記憶體；heap 之後係嗰個數嘅一個比例，而且仲可能超過佢。`-Xmx` 先係硬上限，一個需要更多嘅 render 會以 `OutOfMemoryError` 失敗，而唔係拉埋成部機落水。一個可以改大個數再試過嘅失敗 render，遠遠好過一個死咗嘅桌面。
- **預設值由部機推導**：大約實體記憶體嘅一半，取整到 256 MB，由 app 自己決定唔會高過 8 GB，亦唔會多到剩返畀其他嘢嘅少過 2 GB。下限係 1 GB，低過呢個數 BlueMap 唔會優雅咁失敗 —— 佢會 thrash 個 collector 幾個鐘，然後照樣失敗。
- **單位兩種寫法都列出** —— `4096 MB (4.0 GB)` —— 令 4096 唔會被誤讀成 4，而控件隔籬嘅解釋會講明個數字做乜，同埋 render 唔夠用或者部機捱唔住嗰陣應該點做。
- **一個部機已經滿足唔到嘅已儲存數值會退回自動。** 一個由大機複製過嚟嘅 profile，或者拆走咗記憶體，否則就會交畀 JVM 一個佢拒絕啟動嘅 heap —— 而咁樣睇落同一個爛咗嘅 render 一模一樣。
- **一個寫唔到嘅設定檔永遠唔會令一次 render 失敗。** 嗰個選擇會喺今次 session 生效，而寫入失敗會被吞咗，唔會拋入一次有人開咗嘅 render 度。

### 驗證 (Verification)

上面所有嘢都有單元測試覆蓋，而且**唔需要更新 server、唔需要裝 Squirrel、唔需要 OneDrive、亦唔需要特定數量嘅 RAM**。Electron 嘅 `autoUpdater`、shell、檔案系統、時鐘、timer、部機嘅記憶體同 render 活動探測，全部都係注入嘅接縫。

失敗分類（每條規則同佢哋之間嘅次序）喺 `main/update/failure.test.ts`。Feed 解析、三種拒絕、https 規則同 token 遮蔽喺 `main/update/feed.test.ts`。當前優先嘅 repository fallback、與版本無關嘅 identity-pair 確認同損壞處理喺 `main/update/feedHandoff.test.ts`、`main/update/controller.test.ts` 同 `test/updateFeedRepositoryInjection.test.ts`。準確嘅轉換收據、只認確認先消耗、rollback、mismatch、損壞、有界欄位同有界 bytes 喺 `main/update/installJournal.test.ts`。狀態機（包括「ready 捱得住失敗」同「unsupported 係終局」）喺 `main/update/state.test.ts`。排程（間隔、back-off、上限、下限，同 stage 咗之後停止）喺 `main/update/schedule.test.ts`。冇更新、有更新、下載緊、準備好、準確版本拒絕、重啟日誌、早期檢查保留 rollback、確認失敗、離線、損壞 asset、dispose、render 活動同跨版本交接，全部喺 `main/update/controller.test.ts`。Channel、推送同冇憑證跨過佢哋喺 `main/update/ipc.test.ts`。OneDrive 改指同「用戶叫做 OneDrive」守衛喺 `main/files/documents.test.ts`。Reveal 允許清單（前綴兄弟、連結、相對路徑、缺失 root、檔案對資料夾）喺 `main/files/reveal.test.ts`。記憶體上限（建議值、邊界、持久化、損壞同產生出嚟嘅參數）喺 `main/files/renderMemory.test.ts`。Banner 同設定行當純模型測喺 `ui/components/update/updateModel.test.ts`。三種語言模式、各五個等級，同埋冇任何等級掂到版本或者按鈕，喺 `ui/components/update/updateCopy.test.ts`。實時控制器同 bridge 探測喺 `ui/components/update/useUpdates.test.ts`。Banner mount 測試（被拖住嘅 Restart、撤銷、雙語 `lang`、等級 5 仍然準確版本）喺 `ui/components/update/UpdateBanner.test.ts`。Mount 咗嘅 shell 用真實產生嘅 config workspace 同專案 dirty 訊號喺 bridge 呼叫之前 disable Restart，喺 `ui/App.test.ts` 同 `ui/components/project/ProjectsScreen.test.ts`。

#### 仲要打包實證

**未曾靠實際行過去驗證。** 而家仲未存在一對包含呢套轉換收據同未儲存工作實作嘅 packaged N→N+1。呢個改動之前檢視過嘅兩個最新 release，`v0.1.0-build.828` 同 `v0.1.0-build.862`，兩者透過 GitHub release API 都報告 `immutable: false`，而且兩者都早過呢個實作。佢哋分裂嘅 tag/package 版本身分，亦令所設定嘅服務對較舊嘅已安裝 package 回 HTTP 204。所以佢哋滿足唔到 issue #79 對「兩個連續 immutable build 嘅受測程式碼」嘅要求。

仲需要嘅執行時證明係：喺一個隔離 profile 度乾淨安裝 immutable N，等佢真正嘅 HTTPS Squirrel feed 偵測、下載、hash、stage immutable N+1，行一次 Later 同 Restart，再驗證準確嘅 release 目標、asset hash、收據結果、設定/專案/歷史/cache 連續性，同 N+1 process 交返嘅 focus。嗰個平嘅 headless 截取必須嚟自嗰啲真實已安裝 build；一個 mock banner 唔算證據。

另外，Electron 嘅 Squirrel `autoUpdater` 亦冇提供任何受支援嘅 API 去中止下載緊嘅嘢。`dispose()` 會取消呢個控制器嘅 timer 同喺關機期間忽略遲到嘅事件，但嗰個唔係用戶主導嘅 package 下載取消。嗰個 acceptance case 維持開住，唔會改個名扮成一個通過嘅測試。喺嗰對 immutable build 同受支援嘅取消路線出現之前，呢個功能係本地已實作、亦有回歸測試，但完整嘅已安裝客戶端聲稱仍然被擋住。

### 相關 (Related)

英文版最後指向四篇：[Feature parity with BlueMapGUI](./bluemapgui-parity.md)，即係點名咗呢四個缺口嘅審核；[Language modes and funny levels](./language-and-tone.md)，即係更新文案跟嘅「語氣可變、事實不可變」規則；[Notification centre](./notification-centre.md)，即係所有淨係通知嘅嘢唔行 banner 而係去嘅地方；同埋 [Renders that survive being interrupted](./resumable-renders.md)，即係另一個保護行緊嘅 render 嘅地方。
