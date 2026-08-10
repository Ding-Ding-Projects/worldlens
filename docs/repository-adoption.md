# Adopting a repository this app already prepared

Move to a second computer, sign in to GitHub, and the account can still write to the same
repositories it always could - but the fresh install remembers none of them. Without this,
the repository picker is a bare list, and picking the wrong entry (or the right one, then
re-answering every question the wizard already answered once) is the ordinary outcome.
`worldrepo/adopt.ts` recognises the repositories this application has already prepared, and
reads back what can honestly be restored from one - reachable from the **World repository**
tab's own "Adopt a repository from another computer" section, alongside syncing a world
into a repository in the first place (see [A world kept in a git
repository](./world-git-repository.md)).

**Contents**

- [Reaching this from the application](#reaching-this-from-the-application)
- [The two markers, and what each one promises](#the-two-markers-and-what-each-one-promises)
- [Checking a list: a hedge, never a certainty](#checking-a-list-a-hedge-never-a-certainty)
- [Building a plan](#building-a-plan)
- [What crosses, and what is named instead of guessed](#what-crosses-and-what-is-named-instead-of-guessed)
- [Reverse compatibility: a marker or a project from the future](#reverse-compatibility-a-marker-or-a-project-from-the-future)
- [Never a duplicate, never a write](#never-a-duplicate-never-a-write)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## Reaching this from the application

`WorldRepoScreen.vue` (`design/packages/ui/src/components/worldrepo/`) drives all of this
from the **World repository** tab. Its own candidate list comes from the same "repositories
this GitHub sign-in can write to" call `BackupScreen.vue` already exposes
(`listBackupRepositories`) rather than a second implementation of it - searchable, and
multi-selectable so "check these 12" is one bulk action rather than 12 clicks. Checking
returns each candidate's `AdoptionSignal` verbatim: the status becomes a chip
("Looks like yours", "Not one of yours", "Not checked", and so on) and the hedged sentence
itself is shown exactly as `adopt.ts` composed it, never rewritten into something more
confident. A `"prepared"` or `"prepared-newer-version"` row offers **View what could be
restored**, which reads the plan and shows:

- the project's name, its maps, its storages and its non-default render settings, read
  straight from `AdoptionPlan.restoring`;
- **every item in `needsAttention`**, each with its own icon and, where a concrete
  destination exists, its own button: the dependencies item opens Settings at the Java
  runtime row, and the remote-host item opens Settings plain. The world-folder item does
  not get a button of its own next to the others - it *is* the next step, answered by the
  native folder-browse field immediately below the list;
- `alreadyLocal`, when this computer already has a local project synced from the same
  repository, so adopting a second time is a decision made with that fact in front of it
  rather than discovered afterward.

**Adopting** writes only the local project file - through `ProjectHost.writeProject`, the
same call `ProjectsScreen.vue` already uses to save any project - into the world folder just
chosen. Nothing about the repository is touched: the whole flow up to and including this
button is `GET` requests, and the write that finally happens lands on this computer's own
disk, never GitHub's. The finished write hands the shell straight to the Projects page, open
at that world, the same landing spot a finished guide run already uses.

## The two markers, and what each one promises

Two different things get prepared, and this module checks for both:

| Marker | File | Where | What it proves |
|---|---|---|---|
| World-repo marker | `.worldlens-world.json` (legacy `.material-bluemap-world.json` remains readable) | Root of the `world` branch (see [A world kept in a git repository](./world-git-repository.md)) | This branch carries an incrementally-synced copy of the world - and, because the project file lives at the root of that same world folder, a project's maps, storages and render settings travelled with it. |
| CI-bootstrap marker | `.worldlens-ci.json` (legacy `.material-bluemap-ci.json` remains readable) | Root of the repository's default branch | This application committed `.github/workflows/render-world.yml` (and whatever else its template set needs) so the ordinary "Render on GitHub" archive-upload flow can dispatch against it. Nothing about a project's settings is stored here - the render flow never persists them to the repository. |

A repository can carry either marker, both, or neither. `probeAdoptionCandidates` and
`buildAdoptionPlan` check both, and the difference between them decides what adoption can
honestly promise: only a repository carrying the world-repo marker has a project file to
restore. A repository bootstrapped only for CI rendering is genuinely recognisable as this
application's own, but there is nothing inside it to bring back beyond that recognition -
see [Building a plan](#building-a-plan).

## Checking a list: a hedge, never a certainty

`probeAdoptionCandidates(host, runner, candidates, options)` checks a bounded list of
`{ owner, repo }` pairs (`DEFAULT_MAX_ADOPTION_PROBES`, 24 by default) and answers one
`AdoptionSignal` per candidate:

- `"prepared"` - a marker was found, and this build understands its version.
- `"prepared-newer-version"` - a marker was found, written by a version of the app newer
  than this one (see [Reverse compatibility](#reverse-compatibility-a-marker-or-a-project-from-the-future)).
- `"not-prepared"` - checked, and neither marker exists.
- `"unknown"` - a network or permission failure meant the check could not tell either way.
- `"not-checked"` - past the bound; a longer list is never silently truncated without saying
  so.

Every `message` is worded with "looks like" rather than an assertion of certainty, mirroring
the same discipline `remote/browse.ts`'s Minecraft-world signal holds itself to for a folder
on an SSH host: a file matching this application's own tool string is real evidence, but it
is still a claim read out of a file's bytes, not proof that this is the repository the person
sitting at this computer means.

Candidates past the bound are answered `"not-checked"`, never silently dropped and never
folded into `"not-prepared"` - a person with hundreds of repositories should be able to tell
"we didn't look" apart from "we looked, and no."

## Building a plan

`buildAdoptionPlan(host, runner, { owner, repo, branch? })` reads a repository's markers and
its project file, and returns an `AdoptionPlan` a person can read *before* anything local
changes:

- **`ok: true`** - the world-repo marker and a readable project file were both found.
  `restoring` names the project's title, whether it was ever opened past the wizard, every
  map's id/name/dimension, every storage's id, and the render options that differ from
  BlueMap's defaults. `needsAttention` names what will not cross over (see below).
  `alreadyLocal` is populated when this computer has already synced the same repository, so
  adoption is never proposed as a second binding to something already local.
- **`ok: false`**, with a `reason`:
  - `"repository-unreadable"` - the repository itself could not be read.
  - `"not-prepared"` - neither marker was found.
  - `"ci-bootstrap-only"` - the CI-bootstrap marker was found but the world-repo marker was
    not: the repository is recognisably this application's, but has no project settings
    stored in it to restore. `bootstrapMarker` is populated so a caller can still say "this
    looks like yours" even though nothing can be restored automatically.
  - `"project-absent"` - the world-repo marker exists but no project file was ever written
    onto that branch.
  - `"project-unreadable"` - the project file exists but could not be parsed.
  - `"project-too-new"` - see [Reverse compatibility](#reverse-compatibility-a-marker-or-a-project-from-the-future).

Nothing in this function writes anything. Every network call it makes is a `GET` -
`repos/{owner}/{repo}`, a branch lookup, and a Contents API read, falling back to the Git
Blob API transparently for a project file past the Contents API's 1 MB inline limit
(`project/file.ts`'s own `MAX_PROJECT_BYTES` allows up to 4 MB, so this is a real, not
theoretical, path).

## What crosses, and what is named instead of guessed

`project.ts`'s own schema deliberately never carries the Minecraft world's path - "storing it
as well would create a second source of truth that goes wrong the moment somebody moves or
copies the folder." Adoption leans on exactly that design rather than working around it.
Every successful plan therefore names three gaps unconditionally, because none of them was
ever going to be in a project file to begin with:

1. **The world folder itself.** It will not be at the same path on the new computer, and may
   not exist there at all. The interface's job is to lead into the guided world-folder step
   once adoption reports this, not to guess a path.
2. **Local dependencies.** A Java runtime, Docker's availability, and anything else this
   build provisions or detects belong to the computer it runs on, never to a repository.
3. **Remote host or SSH configuration.** Tied to keys that belong to the old computer and are
   never written anywhere this module reads.

Two further gaps are reported only when a project's own settings would otherwise cross
silently as unusable paths from the old computer:

- **`output-folder`** - `render.outputFolder` is the one field in the schema that is
  genuinely allowed to be absolute (for a rendered map written outside the world). An
  absolute path from the old computer is named rather than quietly kept, because it will
  either fail to resolve here or, worse, resolve to an unrelated folder that happens to
  share a drive letter.
- **`linked-world`** - a map's `world` field may legitimately be an absolute path to a
  *different* world folder than the one this project lives in. The same old-computer-path
  problem applies, named per affected map by id.

## Reverse compatibility: a marker or a project from the future

A marker's own `version` field is compared against the constant this build was compiled
with (`WORLD_REPO_MARKER_VERSION`, `CI_BOOTSTRAP_MARKER_VERSION`). A marker from a newer
version is still recognised - "an unknown version is still *ours*", per `repo.ts`'s own
comment - and reported as `"prepared-newer-version"` with a sentence saying some of what it
holds may not be understood by this build.

A project file is held to a stricter rule, because it is the thing this module actually
promises to restore: `parseProjectFile` refuses outright when its `version` exceeds
`PROJECT_FORMAT_VERSION`, and `buildAdoptionPlan` turns that refusal into `reason:
"project-too-new"` with the found format version attached. Nothing is guessed at for fields
this build does not model; the honest answer is "update the app", not a partial restore that
silently drops whatever a newer format added.

## Never a duplicate, never a write

`alreadyLocal` cross-checks `WorldRepoHost.records()` - this computer's own memory of every
repository it has already synced - by owner and repository name, independent of branch. When
a match exists, the plan reports the existing local `worldPath`, `branch` and `syncedAt`
rather than proposing a second binding to the same remote target. Nothing here deletes,
merges, or otherwise resolves that collision on its own; it surfaces the fact so the
interface can ask.

Every call `buildAdoptionPlan` and `probeAdoptionCandidates` make is a `GET`. Adopting a
repository this way changes nothing about it - worth stating plainly, because `WorldRepoHost`
carries other methods on the same class (`sync`, `remove`) that very much do write.

## Failure modes

- **A network or permission failure mid-check** is reported as `"unknown"`, never folded into
  `"not-prepared"` - the same discipline `browse.ts`'s owner and repository-name-availability
  checks already hold themselves to elsewhere in this application.
- **A repository that does not exist, or that this account cannot see**, is reported as
  `"repository-unreadable"` for a plan, and `"not-prepared"` for a list signal - GitHub
  answers 404 identically for both, and this module does not pretend to tell them apart
  either.
- **A project file past the Contents API's 1 MB inline limit** falls back to the Git Blob
  API automatically; a failure at that stage is reported as `"project-unreadable"` with
  GitHub's own message.

## Security notes

Neither marker ever carries a path, a username, a hostname, or a credential -
`{ tool, version, branch, updatedAt }` for the world-repo marker,
`{ tool, version, templateVersion, files, preparedAt }` for the CI-bootstrap one. Both are
designed to sit in a **public** repository without leaking anything about the machine that
wrote them, the same discipline `pages/hosting.ts`'s identical marker already holds itself
to.

The project file that travels alongside the world-repo marker is not immune to this concern
by accident: `project.ts`'s schema deliberately excludes the world's own path and refuses a
storage block carrying `connection-properties`. The two fields the schema still permits to be
absolute (`render.outputFolder`, a map's `world` field) are exactly the ones
[named as needing attention](#what-crosses-and-what-is-named-instead-of-guessed) rather than
restored silently - an absolute path recorded on a since-reformatted machine is not a secret,
but it is still a detail about that machine's own layout that this module does not repeat
back as though it belonged here.

`fetchRepositoryFileText` never handles, prints, or logs a token; every call runs through
`gh api`, spawned with an argument array and never a shell, exactly like the rest of this
package.

## Verification

`worldrepo/adopt.test.ts` proves, against a fake `gh` (never a real network call): a
repository carrying either marker is told apart from one carrying neither; every signal's
wording hedges with "looks like" and never asserts certainty; the probe bound is honoured and
reported rather than silently truncated; a plan restores the exact maps, storages and render
notes a project holds; every unconditional attention item is present in every successful
plan; an absolute output folder and an absolute linked-world path are both flagged by name; a
marker and a project format from a newer app version both degrade to a plain sentence; a
repository already bound to a local `worldPath` is detected rather than duplicated; every
call this module makes is confirmed to carry no write flag; and a dedicated test runs a real
sync into a temp world folder under this OS's own profile-shaped path and reads the marker
back off disk to confirm it carries none of that path, no drive letter, no path separator,
and nothing token- or credential-shaped.

`worldrepo/ipc.test.ts` proves the two IPC channels this exposes -
`worldrepo:adoptionProbe` and `worldrepo:adoptionPlan` - refuse a malformed request and
report an unreachable repository honestly rather than inventing a plan for it.

`WorldRepoScreen.test.ts` (`design/packages/ui/src/components/worldrepo/`, part of that
screen's 37 tests - see [A world kept in a git repository](./world-git-repository.md)'s own
Verification section for the full breakdown) proves the interface side of the same
discipline: the rendered hedge text is never upgraded past what `adopt.ts` actually said;
checking and viewing a plan never call `sync` or `remove`, confirmed against a fake bridge
that records every call it receives; every `needsAttention` item renders, with the
dependencies and remote-host items routing to Settings at the anchor they name; and adopting
writes through `ProjectHost.writeProject` and nothing else, emitting the world path the shell
uses to land on the Projects page.

## Related reading

- [A world kept in a git repository](./world-git-repository.md) - the world-repo marker and
  the branch it lives on.
- [The project file](./config-history.md) - the local version history a restored project
  joins once it is saved into a world folder.
- [Finding worlds](./finding-worlds.md) - the guided world-folder step adoption's
  `"world-folder"` attention item leads into.
- [Rendering a world in GitHub Actions](./render-in-actions.md) - what a CI-bootstrap marker
  actually enables once a repository carries one.

## 廣東話

### 領養一個呢個 app 已經準備好嘅 repository（Adopting a repository this app already prepared）

換咗第二部電腦、登入返 GitHub，個帳戶一樣寫得到佢一直都寫得到嘅嗰啲 repository —— 但新裝嘅 app 一個都唔記得。冇咗呢樣嘢，repository 揀選器就係一條乾巴巴嘅清單，而揀錯一項（或者揀啱咗，然後又要將 wizard 問過一次嘅問題再答一次）就係最普通嘅結果。`worldrepo/adopt.ts` 認得出呢個 application 已經準備過嘅 repository，並且讀返啲可以誠實還原返嚟嘅嘢 —— 入口喺 **World repository** 分頁自己嗰個 "Adopt a repository from another computer" 區塊，同「一開始將一個世界同步入 repository」（見 [A world kept in a git repository](./world-git-repository.md)）並排。

### 喺 application 入面點去到呢度

`WorldRepoScreen.vue`（`design/packages/ui/src/components/worldrepo/`）由 **World repository** 分頁驅動晒呢一切。佢自己嗰條候選清單，嚟自 `BackupScreen.vue` 已經曝露緊嘅同一個「呢個 GitHub 登入寫得到嘅 repository」呼叫（`listBackupRepositories`），而唔係第二份實作 —— 搜尋得，亦揀得多項，所以「檢查呢 12 個」係一次批次動作而唔係撳 12 下。檢查會逐字返返每個候選嘅 `AdoptionSignal`：狀態變成一個 chip（"Looks like yours"、"Not one of yours"、"Not checked" 等等），而嗰句有保留餘地嘅句子就原原本本按 `adopt.ts` 砌出嚟嘅樣顯示，永遠唔會改寫成更肯定嘅講法。`"prepared"` 或者 `"prepared-newer-version"` 嗰行會提供 **View what could be restored**，佢會讀個 plan 然後顯示：

- project 嘅名、佢啲 map、佢啲 storage，同埋非預設嘅 render 設定，全部直接由 `AdoptionPlan.restoring` 讀出；
- **`needsAttention` 入面每一項**，各有自己嘅 icon，而喺有具體目的地嗰啲仲有自己嘅按鈕：dependencies 嗰項會開 Settings 並停喺 Java runtime 嗰行，remote-host 嗰項就淨係開 Settings。World-folder 嗰項唔會喺其他項旁邊有自己嘅按鈕 —— 佢*本身*就係下一步，由緊接住清單下面嗰個原生資料夾瀏覽欄位嚟回答；
- `alreadyLocal`：當呢部電腦已經有一個由同一個 repository 同步過嚟嘅本機 project 嗰陣，咁樣「領養第二次」呢個決定就係喺見到呢個事實之下先做，唔係做完先發現。

**領養** 只會寫本機嘅 project 檔案 —— 經 `ProjectHost.writeProject`，即係 `ProjectsScreen.vue` 儲存任何 project 已經用緊嗰個呼叫 —— 寫入啱啱揀嗰個世界資料夾。Repository 完全冇被郁過：由頭到呢粒掣為止成個流程都係 `GET` 請求，而最終發生嗰次寫入係落喺呢部電腦自己嘅磁碟，永遠唔會落 GitHub。寫完之後個 shell 會直接去到 Projects 頁、停喺嗰個世界度，同一次完成嘅導引流程一樣嘅落腳點。

### 兩個 marker，各自承諾啲乜

有兩樣唔同嘅嘢會被準備好，而呢個模組兩樣都會檢查。

**World-repo marker** 係 `world` 分支根目錄嘅 `.worldlens-world.json`（舊嘅 marker 檔名仍然讀得到）（見 [A world kept in a git repository](./world-git-repository.md)）。佢證明呢條分支載住一份用增量方式同步嘅世界副本 —— 而且因為 project 檔案就住喺同一個世界資料夾嘅根目錄，所以一個 project 嘅 map、storage 同 render 設定都一齊過咗嚟。

**CI-bootstrap marker** 係 repository 預設分支根目錄嘅 `.worldlens-ci.json`（舊嘅 marker 檔名仍然讀得到）。佢證明呢個 application commit 咗 `.github/workflows/render-world.yml`（同埋佢個 template set 需要嘅其他嘢），令普通嘅「Render on GitHub」archive 上傳流程可以對住佢派發。呢度冇儲存任何 project 設定 —— render 流程從來唔會將設定持久化去 repository。

一個 repository 可以帶其中一個 marker、兩個都帶、或者一個都冇。`probeAdoptionCandidates` 同 `buildAdoptionPlan` 兩個都會檢查，而兩者嘅分別決定咗領養可以誠實承諾啲乜：只有帶住 world-repo marker 嘅 repository 先至有 project 檔案還原得返。一個淨係為咗 CI render 而 bootstrap 嘅 repository，確實認得出係呢個 application 自己嘅，但除咗呢份「認得出」之外，入面冇任何嘢帶得返 —— 見下面「砌一個 plan」。

### 檢查一條清單：係一種保留講法，永遠唔係確定

`probeAdoptionCandidates(host, runner, candidates, options)` 檢查一條有界嘅 `{ owner, repo }` 清單（`DEFAULT_MAX_ADOPTION_PROBES`，預設 24），每個候選答一個 `AdoptionSignal`：

- `"prepared"` —— 搵到 marker，而呢個 build 識佢個版本。
- `"prepared-newer-version"` —— 搵到 marker，但係由一個新過呢個 app 嘅版本寫嘅（見下面「反向相容」）。
- `"not-prepared"` —— 檢查過，兩個 marker 都冇。
- `"unknown"` —— 網絡或者權限失敗，令個檢查兩邊都講唔到。
- `"not-checked"` —— 超出咗上限；長啲嘅清單永遠唔會唔出聲就被截短。

每一句 `message` 都係用「looks like」而唔係斷言確定，跟返 `remote/browse.ts` 對 SSH host 上一個資料夾嘅 Minecraft-world 訊號所守嘅同一套紀律：一個符合呢個 application 自己 tool 字串嘅檔案係真實證據，但佢始終只係由某個檔案嘅 byte 度讀出嚟嘅一個聲稱，唔係「呢個就係坐喺呢部電腦前面嗰個人所指嘅 repository」嘅證明。

超出上限嘅候選會答 `"not-checked"`，永遠唔會靜靜雞掉咗，亦永遠唔會摺埋入 `"not-prepared"` —— 一個有幾百個 repository 嘅人，應該分得清「我哋冇睇過」同「我哋睇過，冇」。

### 砌一個 plan

`buildAdoptionPlan(host, runner, { owner, repo, branch? })` 讀一個 repository 嘅 marker 同佢嘅 project 檔案，返一個 `AdoptionPlan`，畀人喺任何本機嘢改變*之前*就睇得到：

- **`ok: true`** —— world-repo marker 同一份讀得到嘅 project 檔案兩樣都搵到。`restoring` 會講出 project 個標題、佢有冇曾經行過 wizard 之後被打開過、每幅 map 嘅 id/名/dimension、每個 storage 嘅 id，以及同 BlueMap 預設值唔同嘅 render 選項。`needsAttention` 會講出邊啲嘢過唔到嚟（見下）。當呢部電腦已經同步過同一個 repository 嗰陣就會填 `alreadyLocal`，所以領養永遠唔會被當成「對一樣已經喺本機嘅嘢再綁多次」咁提出。
- **`ok: false`**，連一個 `reason`：`"repository-unreadable"`（個 repository 本身讀唔到）；`"not-prepared"`（兩個 marker 都冇搵到）；`"ci-bootstrap-only"`（搵到 CI-bootstrap marker 但冇 world-repo marker：個 repository 認得出係呢個 application 嘅，但入面冇 project 設定可以還原，`bootstrapMarker` 會被填好，令 caller 仍然可以講「呢個睇落係你嘅」，就算冇嘢自動還原到）；`"project-absent"`（world-repo marker 存在，但嗰條分支上從來冇寫過 project 檔案）；`"project-unreadable"`（project 檔案存在但 parse 唔到）；`"project-too-new"`（見下面「反向相容」）。

呢個 function 入面冇任何嘢會寫嘢。佢做嘅每一個網絡呼叫都係 `GET` —— `repos/{owner}/{repo}`、一次分支查詢，同一次 Contents API 讀取；如果 project 檔案超過 Contents API 嘅 1 MB inline 限制，就會透明咁退返用 Git Blob API（`project/file.ts` 自己嘅 `MAX_PROJECT_BYTES` 容許到 4 MB，所以呢條路係真實嘅，唔係理論上嘅）。

### 咩過得嚟，咩係講明而唔係靠估

`project.ts` 自己嗰個 schema 係刻意永遠唔會載住 Minecraft 世界嘅路徑 —— 「連佢都儲埋就會製造第二個 source of truth，一有人搬咗或者複製咗個資料夾就即刻錯」。領養係靠實呢個設計，而唔係繞過佢。所以每一個成功嘅 plan 都會無條件講出三個缺口，因為呢三樣本來就唔會出現喺 project 檔案入面：

1. **世界資料夾本身。** 喺新電腦上面唔會喺同一條路徑，甚至可能根本唔存在。介面嘅職責係喺領養報告咗呢點之後帶去嗰個導引式世界資料夾步驟，而唔係估一條路徑出嚟。
2. **本機依賴。** Java runtime、Docker 有冇裝，以及呢個 build 會配置或者偵測嘅任何嘢，都屬於佢行緊嗰部電腦，永遠唔屬於一個 repository。
3. **遠端主機或者 SSH 設定。** 綁咗喺屬於舊電腦嘅金鑰上面，而嗰啲金鑰永遠唔會寫入呢個模組讀得到嘅任何地方。

仲有兩個缺口，只喺一個 project 自己嘅設定會靜靜雞當成舊電腦嘅無效路徑咁過嚟嗰陣先報：

- **`output-folder`** —— `render.outputFolder` 係 schema 入面真係容許用絕對路徑嘅嗰個欄位（畀寫喺世界以外嘅 render 地圖用）。舊電腦嚟嘅絕對路徑會被講明，而唔會靜靜雞保留，因為佢喺呢度唔係解析唔到，就係更衰 —— 解析到一個啱啱共用同一個 drive letter 嘅無關資料夾。
- **`linked-world`** —— 一幅 map 嘅 `world` 欄位可以合法咁係一條指向*另一個*世界資料夾（唔係呢個 project 所在嗰個）嘅絕對路徑。同一個舊電腦路徑問題適用，會逐幅受影響嘅 map 按 id 講明。

### 反向相容：來自未來嘅 marker 或者 project

Marker 自己嗰個 `version` 欄位會同呢個 build 編譯嗰陣嘅常數（`WORLD_REPO_MARKER_VERSION`、`CI_BOOTSTRAP_MARKER_VERSION`）比較。來自新版本嘅 marker 一樣認得 —— 用 `repo.ts` 自己嗰句註解嚟講，「一個未知版本仍然係*我哋嘅*」 —— 並且會報做 `"prepared-newer-version"`，附一句話講明佢載住嘅部分內容呢個 build 可能唔明。

Project 檔案就守更嚴嘅規則，因為佢先係呢個模組真正承諾還原嘅嘢：當佢嘅 `version` 超過 `PROJECT_FORMAT_VERSION` 嗰陣，`parseProjectFile` 會直接拒絕，而 `buildAdoptionPlan` 會將呢個拒絕變成 `reason: "project-too-new"`，並附上搵到嘅格式版本。呢個 build 冇建模嘅欄位，一律唔會靠估；誠實嘅答案係「更新個 app」，而唔係一個會靜靜雞掉咗新格式新增嘢嘅局部還原。

### 永遠唔會整重複，永遠唔會寫

`alreadyLocal` 會按 owner 同 repository 名（唔理分支）交叉核對 `WorldRepoHost.records()` —— 即係呢部電腦自己記低嘅每一個已同步 repository。一有相符，個 plan 就會報返現有嘅本機 `worldPath`、`branch` 同 `syncedAt`，而唔係提議對同一個遠端目標再綁多次。呢度冇任何嘢會自己刪除、合併或者以其他方式解決嗰個衝突；佢淨係將事實擺出嚟，等介面去問。

`buildAdoptionPlan` 同 `probeAdoptionCandidates` 做嘅每一個呼叫都係 `GET`。用呢個方法領養一個 repository 唔會改變佢任何嘢 —— 值得白紙黑字講清楚，因為 `WorldRepoHost` 同一個 class 上面仲有其他方法（`sync`、`remove`）係真係會寫嘢嘅。

### 失敗模式

- **檢查途中嘅網絡或者權限失敗** 會報做 `"unknown"`，永遠唔會摺埋入 `"not-prepared"` —— 同 `browse.ts` 嘅 owner 同 repository 名可用性檢查喺呢個 application 其他地方所守嘅紀律一樣。
- **一個唔存在、或者呢個帳戶睇唔到嘅 repository**，喺 plan 度報做 `"repository-unreadable"`，喺清單訊號度報做 `"not-prepared"` —— GitHub 兩種情況都一樣答 404，而呢個模組亦唔會扮分得出。
- **超過 Contents API 1 MB inline 限制嘅 project 檔案** 會自動退返用 Git Blob API；喺嗰個階段失敗會報做 `"project-unreadable"`，連 GitHub 自己嘅訊息一齊。

### 保安注意事項

兩個 marker 都永遠唔會載住路徑、用戶名、主機名或者憑證 —— world-repo marker 係 `{ tool, version, branch, updatedAt }`，CI-bootstrap 嗰個係 `{ tool, version, templateVersion, files, preparedAt }`。兩者都係設計成可以放喺一個 **公開** repository 而唔會洩漏任何關於寫佢嗰部機嘅嘢，同 `pages/hosting.ts` 嗰個一模一樣嘅 marker 所守嘅紀律一致。

同 world-repo marker 一齊走嘅 project 檔案唔係僥倖先免疫呢個顧慮：`project.ts` 個 schema 刻意排除咗世界自己嘅路徑，亦拒絕載住 `connection-properties` 嘅 storage 區塊。Schema 仍然容許絕對路徑嘅嗰兩個欄位（`render.outputFolder`、一幅 map 嘅 `world` 欄位），正正就係上面「咩過得嚟，咩係講明而唔係靠估」入面被列作需要注意、而唔會靜靜雞還原嗰兩個 —— 一條記錄喺一部之後已經重灌咗嘅機上面嘅絕對路徑唔算秘密，但佢始終係關於嗰部機自身佈局嘅細節，而呢個模組唔會當佢屬於呢度咁照講返一次。

`fetchRepositoryFileText` 永遠唔會處理、印出或者記錄 token；每一個呼叫都經 `gh api`，用參數陣列 spawn，永遠唔經 shell，同呢個 package 其餘部分一樣。

### 驗證

`worldrepo/adopt.test.ts` 用一個假 `gh`（永遠唔會真係出網）證明：帶住任何一個 marker 嘅 repository 分得出同兩個都冇嘅唔同；每個訊號嘅措辭都用「looks like」保留餘地，永遠唔斷言確定；probe 上限有遵守而且會報出嚟，唔會靜靜雞截短；一個 plan 會還原一個 project 所載嘅準確 map、storage 同 render 註記；每個無條件嘅注意事項喺每個成功嘅 plan 都出現；一個絕對 output folder 同一條絕對 linked-world 路徑兩者都會被具名標示；來自更新版本 app 嘅 marker 同 project 格式都降級成一句普通句子；一個已經綁咗本機 `worldPath` 嘅 repository 會被偵測到而唔會重複；呢個模組做嘅每個呼叫都確認冇帶寫入 flag；仲有一個專門測試會真係 sync 入一個喺本 OS 自己 profile 形狀路徑底下嘅暫存世界資料夾，再由磁碟讀返個 marker，確認佢冇載住嗰條路徑嘅任何部分、冇 drive letter、冇路徑分隔符，亦冇任何似 token 或者憑證嘅嘢。

`worldrepo/ipc.test.ts` 證明佢曝露嘅兩條 IPC channel —— `worldrepo:adoptionProbe` 同 `worldrepo:adoptionPlan` —— 會拒絕格式錯嘅請求，並且誠實咁報告一個接觸唔到嘅 repository，而唔會為佢作一個 plan 出嚟。

`WorldRepoScreen.test.ts`（`design/packages/ui/src/components/worldrepo/`，屬於嗰個畫面嗰 37 個測試嘅一部分 —— 完整拆解見 [A world kept in a git repository](./world-git-repository.md) 自己嘅 Verification 一節）證明介面嗰邊守同一套紀律：render 出嚟嗰段保留餘地嘅文字永遠唔會被升級到超出 `adopt.ts` 實際講嘅程度；檢查同睇 plan 永遠唔會叫 `sync` 或者 `remove`，呢點對住一個會記錄佢收到嘅每個呼叫嘅假 bridge 核實過；每一項 `needsAttention` 都 render 得出，而 dependencies 同 remote-host 兩項會路由去 Settings 佢哋講明嗰個錨點；領養只會經 `ProjectHost.writeProject` 寫嘢、冇其他，並發出 shell 用嚟落腳去 Projects 頁嗰條世界路徑。

### 相關閱讀

- [A world kept in a git repository](./world-git-repository.md) —— world-repo marker 同佢住嗰條分支。
- [The project file](./config-history.md) —— 一個還原返嚟嘅 project 儲入世界資料夾之後就會加入嘅本機版本歷史。
- [Finding worlds](./finding-worlds.md) —— 領養嘅 `"world-folder"` 注意事項會帶去嘅導引式世界資料夾步驟。
- [Rendering a world in GitHub Actions](./render-in-actions.md) —— 一個 repository 帶咗 CI-bootstrap marker 之後實際上開通咗啲乜。
