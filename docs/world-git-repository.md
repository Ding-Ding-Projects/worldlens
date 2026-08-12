# A world kept in a git repository

A world does not have to be zipped, split into parts, and republished as a release every
time it changes. It can live in a git repository instead, and be kept up to date the way
this project already keeps its own releases up to date: **incrementally**, with nothing
re-uploaded that has not changed.

**Contents**

- [The fact this rests on](#the-fact-this-rests-on)
- [Why this is not the Pages publisher's design, copied](#why-this-is-not-the-pages-publishers-design-copied)
- [Publishing and updating from the application](#publishing-and-updating-from-the-application)
- [Using one in GitHub Actions](#using-one-in-github-actions)
- [The cheap change check](#the-cheap-change-check)
- [Sharding and sparse checkout: evaluated, and rejected](#sharding-and-sparse-checkout-evaluated-and-rejected)
- [Honesty: limits, and what a rejected push does](#honesty-limits-and-what-a-rejected-push-does)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## The fact this rests on

git deduplicates by content hash. A Minecraft world is thousands of `.mca` region files;
when a world changes, only a handful of them do. git already knows this, and a push already
only sends the objects the remote does not have. Kept in a repository, a world updates the
same way — no repacking, no re-zipping, no re-uploading of unchanged regions, which is
exactly the cost the release-asset route (see [Worlds from somebody else's
release](./world-sources.md)) has when a world is republished whole every time.

Git LFS was considered and rejected here for the same reason it was rejected for the
project's own backups — see [Backing up a world or a rendered map](./backup.md). 1 GB of
free storage and bandwidth metered against every restore make it the wrong tool for
something that is meant to be synced often and cloned freely.

## Why this is not the Pages publisher's design, copied

[Publishing a rendered map to GitHub Pages](./pages-hosting.md) solved a structurally
identical problem first: a git directory kept outside the payload, a marker file that
proves ownership before a branch is ever touched, batched staging so a person watching
thousands of files sees a moving number, a push read back from GitHub rather than assumed,
and a durable resume record. `WorldRepoHost`
(`design/packages/app/src/main/worldrepo/repo.ts`) reuses every one of those, in the same
shape.

What is worth stating precisely is why a **bounded orphan commit chain** is correct for a
world, rather than one unbounded commit or an ever-growing history:

- **Every generated commit and push is bounded.** Paths are sorted by their UTF-8 bytes and
  planned below decimal 1.4 GB. Each commit's introduced objects and conservative no-delta
  pack bound are then measured and refused if either exceeds decimal 1.5 GB. The existing
  100 MiB per-file check remains an earlier hard refusal.
- **The target branch stays atomic.** The commits form one linear root chain on a unique
  temporary staging ref. Each commit advances that ref under an exact force-with-lease and is
  read back before the next starts. The target is replaced only after every batch is on the
  server and the final tree is complete.
- **The repository does not retain one extra chain per sync.** The staging ref is deleted
  after target readback, and replacing the target makes the previous snapshot unreachable.
  A shallow clone still receives only the final complete tree.
- **Each push still only sends what changed.** git's push negotiation excludes every object
  reachable from a ref the remote currently advertises, **independent of whether the new
  commit is a child of the old one**. All the client needs is to still know those old
  objects locally, and `WorldRepoHost` keeps the same git directory — the same object
  database — across every sync of the same target, deleting only the branch ref and the
  index before each one. That is what makes a new root chain still cost only the bytes
  that changed, and it is proven directly in `incremental.test.ts` (see
  [Verification](#verification) below), not merely argued.
- **The one gap that leaves** is a local git directory that has never seen the remote's
  current state — the first sync from a new computer, or a repository something else
  already published to. `WorldRepoHost` closes it with the one thing `pages/hosting.ts`
  does not need: before resetting the branch, it fetches the remote branch's objects into
  the local database first. This fetch is now mandatory: falling back to an unbounded
  transfer would break the per-push promise, so a failed fetch refuses before upload.

## Publishing and updating from the application

The **World repository** tab drives this end to end — `WorldRepoScreen.vue`
(`design/packages/ui/src/components/worldrepo/`), reached from the tab strip beside
**Publish to Pages**, the other direction the identical trick runs in. Nothing about the
main-process host below is exclusive to that screen: `WorldRepoHost` takes a world folder
path directly — the same folder a render already reads, which may be an actively-running
server's save folder — and a repository to keep it in:

1. **Preflight** (`WorldRepoHost.preflight`) reads the world folder, the target repository
   and branch, and reports what syncing would do without writing a byte: file count and
   total size, whether anything past GitHub's 100 MB per-file limit exists, whether the
   folder even looks like a Minecraft world (a `level.dat`, not required — a folder without
   one is still synced, just with a warning), and whether the target branch already carries
   this application's marker or somebody else's.
2. **Sync** (`WorldRepoHost.sync`) requires an explicit acknowledgement of that preflight —
   the same `acknowledgeSync`/`acknowledgePublish` pattern the Pages publisher uses — then
   fetches the current target when needed, constructs deterministic bounded commits, uploads
   them one at a time to a leased staging ref, reads every update back, and atomically updates
   the target only after the complete chain is verified.
3. **Resume** validates the world fingerprint, original target lease, exact staging tip and
   saved commit chain. A command whose response was lost is reconciled from the ref itself,
   so a batch the server accepted is never uploaded twice. The version-two state file is
   replaced atomically after every verified batch.
4. **Remove** deletes the target branch — but only after reading it back and confirming it
   still carries this application's marker, checked again independently of whatever the
   preflight said minutes earlier.

The current completion marker (`.worldlens-world.json`) and partial
`.worldlens-upload.json` marker are synthesized directly into Git's private index. Neither
is written into the live world folder. The final commit removes the partial marker and adds
the version-two completion marker with the snapshot ID, batch count and total source bytes.
The legacy `.material-bluemap-world.json` marker and version-one current marker remain
readable during migration.

On screen, those four steps read as: a world folder chosen through the native browse
affordance every path field in this application offers; an owner picked from a real list
(the signed-in account plus every organisation it can write to, via `WorldRepoHost.owners`)
rather than typed blind; **an explicit "Create this repository" button**, reusing the exact
capability `BackupScreen.vue` already offers for the same reason that screen has one — a
person presses a button that says it creates a repository, and never discovers that Sync did
it silently; a **Check before anything is pushed** button that runs the preflight and shows
its blockers and warnings before the acknowledgement checkbox can even be ticked; and a
searchable, bulk-selectable list of **worlds this computer is tracking**, each with its own
Open-on-GitHub, resume-if-interrupted and stop-tracking actions. Single and bulk stop-tracking
both open the shared anchored destructive-action gate. It names every affected repository and
branch, says that the local world folder and unrelated repository content stay untouched,
requires two independent keys plus full slider travel, and keeps Escape and **Emergency exit**
available before the branch-delete call can run. If GitHub refuses the deletion or the marker no
longer proves ownership, the row stays tracked and the exact failure remains visible.

## Using one in GitHub Actions

`Render world` (`.github/workflows/render-world.yml`) takes a fourth `world-source` choice,
`git`, alongside `repository`, `url` and `release-asset`:

| Input              | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| `world-source`     | `git`                                                                          |
| `world-repository` | `cafepromenade/Andyville-World`                                                |
| `world`            | `world` (a branch), or `world:worlds/main` (a branch, and a subpath inside it) |

The fetch step does a **shallow, single-branch clone** — `git clone --depth 1
--single-branch --branch <branch>` — which is the whole saving a plain clone misses: no
history beyond the requested depth, and the checked-out tip always carries the complete
world tree even when the snapshot required several bounded commits. `git-repository` reuses the existing
`world-source`/`world`/`world-repository` triad rather than adding an eleventh
`workflow_dispatch` input past [GitHub's documented cap of
ten](./world-sources.md#using-one-in-github-actions).

A branch name cannot contain a colon, so `branch:subpath` splits unambiguously on the first
one — unlike a slash, which real branch names (`release/1.4`) use routinely.

## The cheap change check

A world kept in a git repository has the single cheapest "did anything change" signal of
every world source this project supports: **the target branch's current commit SHA**. No
clone, no download, not even a `HEAD` request against the world itself — one `gh api
repos/<owner>/<repo>/branches/<branch>` call.

`WorldRepoHost.remoteTip(owner, repo, branch)` exposes exactly that on the desktop side, and
[Scheduled re-rendering](./scheduled-render.md)'s `evaluateScheduleChange` in
`design/packages/render-actions/src/schedule/changeCheck.ts` gained a matching `"git"` kind
that compares two branch-tip SHAs directly — no fallback needed the way `release-asset` and
`url` each need one, because a git branch either has a commit or the source could not be
found at all. `.github/workflows/scheduled-render.yml`'s own git snapshot step makes the
identical `gh api .../branches/<branch>` call in bash, so the desktop app and the scheduled
workflow read the same signal the same cheap way.

## Sharding and sparse checkout: evaluated, and rejected

A sharded render's shards are literal region-file bounding boxes (see [Rendering a world in
GitHub Actions](./render-in-actions.md)), which made a per-shard `git sparse-checkout` —
fetching only the region files one shard's bounds cover — look like a natural further
saving. It was evaluated and is **not** implemented, for a reason specific to how sharding
already works rather than a limitation of sparse checkout itself:

- The world is fetched **once**, by the `plan` job, from whichever source is configured —
  including `git`. It is then uploaded as a single GitHub Actions artifact and every shard
  job downloads that same artifact. That fan-out already solves the "does a thirty-way
  split re-fetch the same world thirty times" problem, and it solves it with GitHub's own
  internal artifact storage, which is faster and free of the world repository's own rate
  limits.
- A per-shard sparse clone would **replace** that one fast internal transfer with several
  slower external clones straight from the world's git host — worse, not better, under the
  architecture this project actually has.
- Separately, the `plan` job's own measurement (`design/packages/render-actions/src/world/measure.ts`)
  reads the real chunk-location table out of every region file's header to build the shard
  plan in the first place — real bytes, not just file names — so even the _first_ fetch
  cannot be narrowed by sparse-checkout without changing the plan step to run before the
  world is fully present, which is a materially larger change than this feature's scope.

If GitHub Actions artifact fan-out is ever removed in favour of every shard fetching
directly, this evaluation should be revisited — the answer changes with the architecture,
not with git's own capabilities.

## Honesty: limits, and what a rejected push does

- **GitHub blocks any single file over 100 MB outright.** `WorldRepoHost.preflight` and
  `WorldRepoHost.sync` both check every file's size before anything is staged, and a sync
  refuses cleanly with the exact file and its size rather than discovering the limit from a
  rejected push.
- **GitHub recommends repositories stay under roughly 1 GB**, and gets noticeably slower to
  clone and work with well past that. `preflight` warns past 1 GB and warns more strongly
  past 5 GB, and says plainly that a world that large may not belong in a repository at
  all — the release-asset route this application also offers has no such limit.
- **Worldlens permits at most decimal 1,500,000,000 bytes per generated commit and per Git
  pack.** Planning targets 1,400,000,000 bytes, exact introduced objects are measured after
  commit creation, and a conservative pack upper bound is checked before upload. A target
  update happens only after every bounded batch has been read back.
- **A push GitHub refuses** — a branch protection rule, an expired sign-in, an
  organization policy — is reported with GitHub's own stderr text attached, the same way
  the Pages publisher reports it, never guessed at or summarised into something vaguer.
- **A live server's world folder is being written to while a sync reads it.** A region file
  mid-save can be caught torn. `preflight` says so plainly and suggests turning
  auto-save off, or syncing between server stops, rather than silently syncing a
  possibly-inconsistent copy.

## Failure modes

| What happened                                                       | What is reported                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| the world folder does not exist                                     | `world-missing`, naming the path                              |
| a file is past GitHub's 100 MB limit                                | `file-too-large`, naming the file and its size                |
| the branch already carries a world this application did not publish | `not-ours`, refusing to touch it                              |
| `gh` is not installed or not signed in                              | `gh-missing` / `gh-signed-out`, with the exact command to run |
| `git` is not on this computer                                       | `git-missing`                                                 |
| the repository cannot be created                                    | `repo-refused`, with GitHub's own message                     |
| GitHub refuses the push                                             | `push-refused`, with GitHub's own stderr                      |
| a generated commit or pack exceeds decimal 1.5 GB                   | `commit-too-large` / `push-too-large`, before upload          |
| the target changes after preparation                                | `target-diverged`, leaving the newer commit untouched         |
| the temporary staging ref has an unexpected tip                     | `staging-diverged`, leaving the target untouched              |
| the saved version-two chain is incomplete, nonlinear or over limit  | `resume-state-invalid`, with no ref update attempted          |
| the world changes while commits are prepared                        | `world-changed`, before upload                                |
| syncing was stopped                                                 | `cancelled`, which is not an error                            |

## Security notes

- No token is read, held, logged or passed as an argument, anywhere in this feature.
  Authentication for both the API and the push is `gh`'s own credential store, reached
  through `gh api` and through git's `credential.helper` pointed at `gh auth
  git-credential` for the one command that needs it — exactly the Pages publisher's rule,
  restated because a second feature copying the shape without copying the discipline would
  be the failure worth naming.
- **A branch without this application's marker is never pushed to and never deleted.** That
  guard has no override, for the same reason the Pages publisher's does not: a mistyped
  repository or branch name must not be able to destroy something that was never this
  application's to touch.
- Owner, repository and branch names are validated against GitHub's own grammar before they
  are ever put in an API path or a push URL.

## Verification

The focused WorldRepo suite covers the bounded protocol directly:

| File                  | What it proves                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `batches.test.ts`     | decimal limit constants, synthetic 1.4/1.5 GB boundaries without allocating gigabyte fixtures, deterministic UTF-8 ordering, three-plus batches, pack overhead and an empty snapshot                                                                         |
| `repo.test.ts`        | preflight blockers and warnings; exact staging and target leases; response-loss readback; cancellation followed by resume without a duplicate batch; staging and target divergence; corrupted version-two state rejection; version-one and version-two markers; byte and batch progress |
| `ipc.test.ts`         | every channel registers and disposes exactly, and `acknowledgeSync` is read strictly — a truthy string is not an agreement                                                                                                                                   |
| `incremental.test.ts` | **real git**, against a real local bare repository: a three-plus-commit chain has a complete final tree, no marker in the live world, no leftover staging ref, and measured limits; incremental transfer still holds with both warm and lost local Git state |

`design/packages/render-actions/src/schedule/changeCheck.test.ts` covers the new `"git"`
comparator: unchanged when two branch-tip SHAs match, changed when they differ, and an
error — never a guess — when a SHA is missing from either side.

The interface has 40 tests of its own, in `design/packages/ui/src/components/worldrepo/`:
`worldRepoBridge.test.ts` (5) proves the preload bridge is genuinely all-or-nothing across
its eleven channels; `worldRepo.test.ts` (15) proves a sync row appears the instant Sync is
pressed rather than waiting on the first IPC round-trip, that `pushVerified: false` is never
silently upgraded to a plain success, and that removal is tracked through its own state
rather than the sync event stream, because `WorldRepoHost.remove` is a plain call rather than
a phased operation; `WorldRepoScreen.test.ts` (20) proves the explicit create-repository
button never calls `sync` and the Sync button never calls `createBackupRepository`, that the
acknowledgement genuinely gates the button and the disabled button names why, that single and
bulk stop-tracking cannot call `remove` through an untouched, one-key or partial-slider gate,
that full travel with both keys reaches the exact target, that a refused removal leaves the
tracked row and exact failure visible, and that every step of the adoption flow — the probe and
viewing a plan — never calls `sync` or `remove`.

Run them with `npx vitest run packages/app` and `npx vitest run packages/render-actions`
from `design/`, and `npx vitest run packages/ui/src/components/worldrepo` for the interface.
The two touched workflow files are checked with `actionlint` and `shellcheck` installed.

## Related reading

- [Adopting a repository this app already prepared](./repository-adoption.md) — the other
  half of the same tab: recognising, on a second computer, a repository this application
  already synced a world into on the first one.
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md) — the design this
  feature reuses, for the opposite direction: a rendered map going out, rather than a world
  coming in.
- [Worlds from somebody else's release](./world-sources.md) — the other way a world can live
  outside this computer, and when a repository is not the right choice.
- [Scheduled re-rendering](./scheduled-render.md) — what reads the cheap change check this
  feature exposes.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — the sharded render this
  feature's world feeds into, and why sparse checkout was rejected for it.
- [Backing up a world or a rendered map](./backup.md) — why Git LFS was rejected on cost,
  here and there.

## 廣東話

### 擺喺 git repository 入面嘅世界（A world kept in a git repository）

一個世界唔使每次改動都壓成 zip、切件、再當 release 重新發佈一次。佢可以住喺一個 git repository 入面，
用返呢個專案本身更新自己 release 嗰種方式保持最新：**增量式**，冇改過嘅嘢一律唔會重新上載。

### 佢建基於嘅事實

git 係用內容 hash 去去重。一個 Minecraft 世界係幾千個 `.mca` region 檔；當個世界改動，改嘅淨係其中幾
個。git 本身就知呢件事，而一次 push 本身就淨係送遠端未有嘅 object。擺喺 repository 入面，一個世界就係
噉更新 —— 唔使 repack、唔使重新 zip、冇改過嘅 region 亦唔使重新上載，而呢個正正就係 release asset 路線
（睇 [Worlds from somebody else's release](./world-sources.md)）每次整個世界重新發佈嗰陣要俾嘅代價。

Git LFS 考慮過，喺呢度亦係被否決咗，理由同專案自己嘅備份否決佢嗰個一樣 —— 睇
[Backing up a world or a rendered map](./backup.md)。得 1 GB 免費儲存，加上每次還原都計數嘅頻寬，令佢
對一樣本身應該經常同步、可以自由 clone 嘅嘢嚟講係揀錯咗工具。

### 點解呢個唔係將 Pages publisher 嘅設計照抄

[Publishing a rendered map to GitHub Pages](./pages-hosting.md) 更早解決咗一個結構上一模一樣嘅問題：
一個擺喺 payload 之外嘅 git 目錄、一個喺掂到任何 branch 之前就證明擁有權嘅 marker 檔、分批 staging 令
一個望住幾千個檔嘅人見到個數字喺度郁、一次由 GitHub 度讀返嚟而唔係假設成功嘅 push，同一份耐用嘅續傳
紀錄。`WorldRepoHost`（`design/packages/app/src/main/worldrepo/repo.ts`）將以上每一樣都以同一個形狀重用。

值得準確講清楚嘅，係點解對一個世界嚟講，**有界限嘅 orphan commit 鏈**先啱，而唔係一個無界限嘅 commit
或者一段不斷長大嘅歷史：

- **每個產生出嚟嘅 commit 同 push 都有界限。** 路徑按 UTF-8 bytes 排序，計劃喺十進制 1.4 GB 以下。跟住
  會量度每個 commit 引入嘅 object 同一個保守嘅 no-delta pack 上界，任何一個超過十進制 1.5 GB 就拒絕。
  原有每個檔 100 MiB 嘅檢查，仍然係更早嗰道硬拒絕。
- **目標 branch 保持原子性。** 啲 commit 喺一個獨有嘅暫存 ref 上面組成一條線性 root 鏈。每個 commit 用
  一次精確嘅 force-with-lease 推進嗰個 ref，並且喺下一個開始之前讀返嚟。目標要等到每一批都上到 server、
  而且最終 tree 完整之後，先會被取代。
- **Repository 唔會每次同步就多保留一條鏈。** 讀返目標之後個暫存 ref 就會被刪，而取代目標會令上一個
  快照變成到唔到。一次 shallow clone 一樣淨係收到最終嗰棵完整 tree。
- **每次 push 仍然淨係送改咗嘅嘢。** git 嘅 push 協商會排除任何由遠端而家公告嘅 ref 到得到嘅 object，
  **同新 commit 係咪舊 commit 嘅子代無關**。client 只需要本地仲識得嗰啲舊 object 就得，而
  `WorldRepoHost` 對同一個目標嘅每次同步都保住同一個 git 目錄 —— 即同一個 object database —— 每次之前
  淨係刪走 branch ref 同 index。呢個就係令一條新 root 鏈一樣淨係使改咗嗰啲 bytes 嘅原因，而且喺
  `incremental.test.ts` 度直接證咗（睇下面嘅 [Verification](#verification)），唔係淨係講。
- **淨低嘅唯一一個缺口**，係一個從未見過遠端當前狀態嘅本地 git 目錄 —— 由一部新電腦第一次同步，或者
  一個已經有第二樣嘢發佈過落去嘅 repository。`WorldRepoHost` 用一樣 `pages/hosting.ts` 唔需要嘅嘢去
  補呢個窿：喺 reset 個 branch 之前，佢會先將遠端 branch 嘅 object fetch 落本地 database。呢次 fetch
  而家係強制嘅：如果退返去做一次無界限傳送，就會破壞咗「每次 push 只送改動」呢個承諾，所以 fetch 失敗
  會喺上載之前就拒絕。

### 喺應用程式度發佈同更新

**World repository** 呢個 tab 由頭到尾驅動呢件事 —— `WorldRepoScreen.vue`
（`design/packages/ui/src/components/worldrepo/`），由 tab strip 度 **Publish to Pages** 隔籬入去，
而嗰個就係同一招跑嘅另一個方向。下面講嘅主行程 host 冇任何嘢係嗰個畫面獨有嘅：`WorldRepoHost` 直接收
一個世界資料夾路徑 —— 就係 render 已經讀嗰個資料夾，佢可以係一部行緊嘅 server 嘅存檔資料夾 —— 同一個
用嚟裝住佢嘅 repository：

1. **Preflight**（`WorldRepoHost.preflight`）讀個世界資料夾、目標 repository 同 branch，喺唔寫任何一個
   byte 嘅情況下報告同步會做乜：檔案數量同總大細、有冇嘢超過 GitHub 每檔 100 MB 嘅上限、個資料夾睇落
   究竟似唔似一個 Minecraft 世界（一個 `level.dat`，唔係必要 —— 冇嘅資料夾一樣照同步，不過會有警告），
   同埋目標 branch 上面已經有嘅係呢個應用程式嘅 marker 定係第二個人嘅。
2. **Sync**（`WorldRepoHost.sync`）要求明確確認過嗰次 preflight —— 同 Pages publisher 用嘅
   `acknowledgeSync`/`acknowledgePublish` 模式一樣 —— 然後喺需要嗰陣 fetch 當前目標、砌出決定性而有界限
   嘅 commit、逐個上載去一個 lease 住嘅暫存 ref、每次更新都讀返嚟，最後喺整條鏈驗證完之後先原子式更新
   目標。
3. **Resume** 會驗證世界指紋、原本嘅目標 lease、確切嘅暫存 tip 同儲存低嘅 commit 鏈。一個回應失咗嘅
   指令會由 ref 本身對數，所以 server 已經接受嘅一批永遠唔會上載兩次。第二版嘅狀態檔喺每一批驗證完之後
   會原子式取代。
4. **Remove** 會刪目標 branch —— 但只會喺讀返嚟、確認佢仲帶住呢個應用程式嘅 marker 之後先做，而且係
   獨立於幾分鐘之前 preflight 講過乜再檢查多次。

現行嘅完成 marker（`.worldlens-world.json`）同部分完成嘅 `.worldlens-upload.json` marker，係直接合成落
Git 私有嘅 index 度。兩者都唔會寫入實際嘅世界資料夾。最後嗰個 commit 會移除部分完成嘅 marker，加入第二版
完成 marker，入面有 snapshot ID、批次數同來源總 bytes。舊嗰個 marker 檔名（前身產品名嗰個）同第一版嘅
現行 marker，喺 migration 期間仍然讀得到。

畫面上，嗰四步睇落係噉：世界資料夾經呢個應用程式每個路徑欄位都提供嘅原生瀏覽方式揀；擁有者由一張真嘅
清單度揀（登入咗嗰個帳戶，加上佢寫得到嘅每個組織，經 `WorldRepoHost.owners`），唔係盲打；**一粒明確
嘅「Create this repository」掣**，重用返 `BackupScreen.vue` 已經提供嘅同一個能力，理由同嗰個畫面有粒掣
一樣 —— 一個人撳一粒寫住佢會開 repository 嘅掣，而唔會事後先發現 Sync 靜靜雞幫佢開咗；一粒 **Check
before anything is pushed** 掣，會行 preflight 並且喺確認 checkbox 仲未撳得之前就顯示佢啲阻塞同警告；
同埋一張可搜尋、可批量選取嘅 **worlds this computer is tracking** 清單，每一行都有自己嘅 Open-on-GitHub、
斷咗就續傳，同停止追蹤動作。單一同批量停止追蹤都會開共用嗰個貼住嚟擺嘅破壞性動作閘。佢會列出每一個受
影響嘅 repository 同 branch、講明本機嘅世界資料夾同無關嘅 repository 內容唔會被郁、要兩把獨立鎖匙加
slider 行足全程，而且喺 branch 刪除呼叫行得之前，Escape 同 **Emergency exit** 都一直可用。如果 GitHub
拒絕刪除，或者個 marker 已經證明唔到擁有權，嗰行就會繼續被追蹤，而確切嘅失敗訊息會保持可見。

### 喺 GitHub Actions 度用

`Render world`（`.github/workflows/render-world.yml`）除咗 `repository`、`url` 同 `release-asset`
之外，多咗第四個 `world-source` 選擇：`git`。原文嗰個表舉例：`world-source` 填 `git`；
`world-repository` 填好似 `cafepromenade/Andyville-World` 噉；`world` 可以係 `world`（一個 branch），
或者 `world:worlds/main`（一個 branch，加佢入面一條子路徑）。

Fetch 嗰步做一次**淺層、單 branch 嘅 clone** —— `git clone --depth 1 --single-branch --branch <branch>`
—— 而呢個正正就係普通 clone 慳唔到嗰筆：超出要求深度嘅歷史一律唔要，而 checkout 出嚟嘅 tip 就算個快照
用咗幾個有界限嘅 commit 先砌成，都一定帶住完整嘅世界 tree。`git-repository` 重用返現有嘅
`world-source`/`world`/`world-repository` 三件套，而唔係加多個第十一個 `workflow_dispatch` input 去超過
[GitHub 文件寫住十個嘅上限](./world-sources.md#using-one-in-github-actions)。

Branch 名唔可以有冒號，所以 `branch:subpath` 喺第一個冒號度切得毫無歧義 —— 唔似斜線噉，真實嘅 branch
名（好似 `release/1.4`）成日都用。

### 平價嘅改動檢查

一個擺喺 git repository 嘅世界，喺呢個專案支援嘅所有世界來源之中，有最平嗰個「有冇嘢改過」訊號：**目標
branch 當前嘅 commit SHA**。唔使 clone、唔使下載，連對個世界本身做個 `HEAD` request 都唔使 —— 一次
`gh api repos/<owner>/<repo>/branches/<branch>` 就得。

`WorldRepoHost.remoteTip(owner, repo, branch)` 喺桌面嗰邊就係開放呢樣嘢，而
[Scheduled re-rendering](./scheduled-render.md) 喺
`design/packages/render-actions/src/schedule/changeCheck.ts` 嘅 `evaluateScheduleChange` 亦加咗一個對應
嘅 `"git"` kind，直接比較兩個 branch tip SHA —— 唔似 `release-asset` 同 `url` 各自都要一個 fallback，
因為一條 git branch 要就有 commit，要就係根本搵唔到個來源。`.github/workflows/scheduled-render.yml`
自己嗰個 git 快照步驟，喺 bash 度做同一個 `gh api .../branches/<branch>` 呼叫，所以桌面 app 同排程
workflow 用同一種平價方式讀同一個訊號。

### Sharding 同 sparse checkout：評估過，否決咗

一次 sharded render 嘅 shard 係實實在在嘅 region 檔邊界框（睇
[Rendering a world in GitHub Actions](./render-in-actions.md)），噉就令逐個 shard 做 `git
sparse-checkout` —— 淨係攞嗰個 shard 邊界覆蓋到嘅 region 檔 —— 睇落好似係自然而然再慳多筆。呢樣嘢評估
過，但**冇**實作，理由係關乎 sharding 本身而家點運作，唔係 sparse checkout 自己有咩限制：

- 個世界係由 `plan` job **攞一次**，由設定咗嗰個來源攞 —— 包括 `git`。跟住佢會當成一個 GitHub Actions
  artifact 上載，而每個 shard job 都下載返同一個 artifact。呢個 fan-out 已經解決咗「三十路切分係咪要
  重複攞同一個世界三十次」呢個問題，而且係用 GitHub 自己內部嘅 artifact 儲存解決，快啲，亦唔會撞到世界
  嗰個 repository 自己嘅 rate limit。
- 逐個 shard 做 sparse clone，會將嗰一次快嘅內部傳送**換成**幾次慢啲、直接由世界嘅 git 主機做嘅外部
  clone —— 喺呢個專案實際嘅架構下，係更差而唔係更好。
- 另外，`plan` job 自己嗰個量度（`design/packages/render-actions/src/world/measure.ts`）一開始就要由
  每個 region 檔嘅 header 讀出真正嘅 chunk-location 表先砌到 shard plan —— 讀嘅係真 bytes，唔淨止檔名
  —— 所以就算係*第一次*攞，都冇得用 sparse checkout 收窄，除非將 plan 呢步改成喺個世界完全落齊之前就
  行，而噉係一個明顯大過呢個功能範圍嘅改動。

如果將來 GitHub Actions 嘅 artifact fan-out 被拿走、改成每個 shard 自己直接攞，噉就應該重新檢視呢個
評估 —— 答案係跟住架構變，唔係跟住 git 自己嘅能力變。

### 老實話：限制，同一次被拒 push 會點

- **GitHub 對任何單一檔案超過 100 MB 直接封殺。** `WorldRepoHost.preflight` 同 `WorldRepoHost.sync`
  兩者都會喺 staging 任何嘢之前檢查每個檔嘅大細，而一次同步會乾淨噉拒絕，並講出確切嗰個檔同佢大細，
  唔會等到 push 被拒先發現有呢個上限。
- **GitHub 建議 repository 保持喺大約 1 GB 以下**，超出好多之後 clone 同操作都會明顯慢。`preflight`
  過咗 1 GB 會警告，過咗 5 GB 會更強烈噉警告，並且直白噉講一個咁大嘅世界可能根本唔應該擺喺 repository
  —— 呢個應用程式同時提供嘅 release-asset 路線就冇噉嘅限制。
- **Worldlens 每個產生嘅 commit 同每個 Git pack 最多准十進制 1,500,000,000 bytes。** 計劃嗰陣以
  1,400,000,000 bytes 為目標，commit 建立之後會量準確引入咗嘅 object，上載之前會檢查一個保守嘅 pack
  上界。目標更新淨係喺每一批有界限嘅嘢都讀返嚟之後先發生。
- **一次畀 GitHub 拒絕嘅 push** —— branch protection 規則、登入過咗期、組織政策 —— 會連 GitHub 自己
  嗰段 stderr 文字一齊報，同 Pages publisher 報嗰種方式一樣，永遠唔會靠估或者濃縮成更含糊嘅嘢。
- **一部行緊嘅 server 嘅世界資料夾，喺同步讀佢嗰陣仲被寫緊。** 一個存檔存到一半嘅 region 檔可能被撈到
  半殘。`preflight` 會直白噉講明呢件事，並建議熄咗 auto-save，或者揀 server 停低之間先同步，而唔係
  靜靜雞同步一份可能唔一致嘅副本。

### 失敗情況（Failure modes）

原文嗰個表列出十三種情況同對應報告：世界資料夾唔存在 → `world-missing`，並講出條路徑；有檔案超過
GitHub 100 MB 上限 → `file-too-large`，並講出檔案同大細；個 branch 已經載住一個唔係呢個應用程式發佈嘅
世界 → `not-ours`，拒絕掂佢；`gh` 未裝或者未登入 → `gh-missing` / `gh-signed-out`，連要行嘅確切指令；
呢部電腦冇 `git` → `git-missing`；開唔到 repository → `repo-refused`，連 GitHub 自己嗰句訊息；GitHub
拒絕 push → `push-refused`，連 GitHub 自己嘅 stderr；產生嘅 commit 或者 pack 超過十進制 1.5 GB →
`commit-too-large` / `push-too-large`，喺上載之前；準備完之後目標變咗 → `target-diverged`，唔會郁到
新嗰個 commit；暫存 ref 嘅 tip 出乎意料 → `staging-diverged`，唔會郁到目標；儲存低嘅第二版鏈唔完整、
唔線性或者超限 → `resume-state-invalid`，唔會嘗試任何 ref 更新；準備 commit 期間個世界改咗 →
`world-changed`，喺上載之前；同步被停止 → `cancelled`，而呢個唔算錯誤。

### 保安注意（Security notes）

- 呢個功能任何地方都唔會讀、持有、記 log 或者當參數傳任何 token。API 同 push 嘅認證都係用 `gh` 自己
  嗰個憑證儲存，經 `gh api`，同埋為嗰條唯一需要嘅指令將 git 嘅 `credential.helper` 指去
  `gh auth git-credential` —— 就係 Pages publisher 嗰條規則，喺度再講一次，因為一個第二功能照抄形狀但
  唔照抄紀律，就正正係值得點名嘅失敗。
- **一個冇呢個應用程式 marker 嘅 branch，永遠唔會被 push，亦永遠唔會被刪。** 呢道守衛冇任何 override，
  理由同 Pages publisher 嗰個一樣：一個打錯咗嘅 repository 或者 branch 名，唔可以有能力毀滅一啲從來
  唔屬於呢個應用程式去掂嘅嘢。
- 擁有者、repository 同 branch 名，喺被放入任何 API 路徑或者 push URL 之前，都會對住 GitHub 自己嗰套
  grammar 驗證。

### 驗證（Verification）

聚焦嘅 WorldRepo 測試組直接覆蓋呢個有界限嘅協定。原文嗰個表講四個檔案證明咗乜：`batches.test.ts` 證
十進制限制常數、用合成方式行 1.4/1.5 GB 邊界（唔使真係整 GB 級 fixture）、決定性嘅 UTF-8 排序、三批
或以上、pack 額外開銷同一個空快照；`repo.test.ts` 證 preflight 嘅阻塞同警告、確切嘅 staging 同目標
lease、回應失咗之後嘅讀返、取消之後續傳唔會多做一批、staging 同目標分歧、拒絕損壞咗嘅第二版狀態、第一
版同第二版 marker，同 bytes 與批次進度；`ipc.test.ts` 證每條 channel 準確噉註冊同釋放，而
`acknowledgeSync` 讀得好嚴 —— 一個 truthy 字串唔算同意；`incremental.test.ts` 用**真 git**，對住一個真
嘅本地 bare repository 證：一條三個或以上 commit 嘅鏈有完整嘅最終 tree、實際世界資料夾冇 marker、冇
遺留嘅 staging ref、量度到嘅限制，同埋喺本地 Git 狀態係熱定係冧咗兩種情況下，增量傳送一樣成立。

`design/packages/render-actions/src/schedule/changeCheck.test.ts` 覆蓋新嗰個 `"git"` 比較器：兩個
branch tip SHA 一樣就係冇變、唔同就係變咗，而如果任何一邊冇 SHA，就出錯 —— 永遠唔會靠估。

介面自己有 40 個測試，喺 `design/packages/ui/src/components/worldrepo/`：`worldRepoBridge.test.ts`（5 個）
證 preload bridge 喺佢十一條 channel 上面真係全有或者全冇；`worldRepo.test.ts`（15 個）證撳 Sync 嗰一刻
就即刻出一行 sync，唔使等第一次 IPC 來回、證 `pushVerified: false` 永遠唔會靜靜雞升級成普通成功，同埋
證移除係用佢自己嘅狀態去追蹤而唔係用 sync 事件流，因為 `WorldRepoHost.remove` 係一個普通呼叫而唔係一個
分階段操作；`WorldRepoScreen.test.ts`（20 個）證明確嘅 create-repository 掣永遠唔會 call `sync`、Sync
掣亦永遠唔會 call `createBackupRepository`，證個確認真係守住粒掣、而 disable 咗嗰粒掣會講明原因，證單一
同批量停止追蹤都唔可以喺一道未掂過、得一把鎖匙或者 slider 只行一半嘅閘度 call `remove`，證兩把鎖匙加
行足全程就到得到確切嗰個目標，證一次被拒絕嘅移除會令嗰行繼續被追蹤同確切失敗保持可見，同埋證採用流程
嘅每一步 —— 探測同睇 plan —— 都永遠唔會 call `sync` 或者 `remove`。

喺 `design/` 度用 `npx vitest run packages/app` 同 `npx vitest run packages/render-actions` 行，介面就
用 `npx vitest run packages/ui/src/components/worldrepo`。兩個被改動嘅 workflow 檔，會喺裝咗
`actionlint` 同 `shellcheck` 嘅情況下檢查。

### 相關閱讀（Related reading）

- [Adopting a repository this app already prepared](./repository-adoption.md) —— 同一個 tab 嘅另一半：
  喺第二部電腦上面，認得返一個呢個應用程式喺第一部機同步過世界入去嘅 repository。
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md) —— 呢個功能重用嘅設計，方向相反：
  render 好嘅地圖出去，而唔係一個世界入嚟。
- [Worlds from somebody else's release](./world-sources.md) —— 世界住喺呢部電腦以外嘅另一個方法，同埋
  幾時 repository 唔係啱嘅選擇。
- [Scheduled re-rendering](./scheduled-render.md) —— 讀呢個功能提供嗰個平價改動檢查嘅嘢。
- [Rendering a world in GitHub Actions](./render-in-actions.md) —— 呢個功能嘅世界會餵入去嗰個 sharded
  render，同埋點解 sparse checkout 喺嗰度被否決。
- [Backing up a world or a rendered map](./backup.md) —— 點解 Git LFS 喺呢邊同嗰邊都因為成本被否決。
