# Setting a repository up for CI rendering

**This is the piece that stops a repository without render workflows from being a dead end.** [Rendering a
world in GitHub Actions](./render-in-actions.md) needs `render-world.yml` committed to a
repository's default branch before anything can start — and before this existed, nothing in
this application ever put it there. A freshly created repository, or an existing project
that has never had the render workflow added to it, hit a permanently disabled render
button with a message that read like a permissions problem even when the real cause was
simply that nothing had been set up yet. This is the app doing that setup itself.

<details>
<summary><b>Contents</b></summary>

- [What "set up" means](#what-set-up-means)
- [The four states this handles](#the-four-states-this-handles)
- [What it never does](#what-it-never-does)
- [The marker, and why a foreign file is refused rather than replaced](#the-marker-and-why-a-foreign-file-is-refused-rather-than-replaced)
- [Token scopes, checked before anything is written](#token-scopes-checked-before-anything-is-written)
- [Actions enabled is a different question from the workflow existing](#actions-enabled-is-a-different-question-from-the-workflow-existing)
- [Runner minutes: public is free, private is not](#runner-minutes-public-is-free-private-is-not)
- [Running it twice](#running-it-twice)
- [Failure modes](#failure-modes)

</details>

## What "set up" means

Three files, committed together to the repository's default branch:

- `.github/workflows/render-world.yml` — the workflow a sync dispatches.
- `.github/workflows/render-shard-wave.yml` — the reusable workflow every sharded wave calls
  by local path (`uses: ./.github/workflows/render-shard-wave.yml`), so it has to be on the
  repository too, not only referenced from this project's own copy.
- `.github/workflows/scheduled-render.yml` — the scheduled check that decides whether a
  recorded world has changed and should be rendered again.

All three are written verbatim. A packaged installer must contain the complete set under its
own resources; if even one file is missing, setup fails closed and never borrows a file from a
developer checkout. Development runs may read the checkout's `.github/workflows/` directory.
See `cirender/workflowTemplates.ts`.

## The four states this handles

1. **Truly empty — no commits at all.** GitHub's Git Data API cannot create the first branch
   ref in an empty repository. Setup therefore fails closed before creating candidate objects
   and asks for one starter commit. Repositories created in this application already receive
   that starter commit automatically; an externally created empty repository needs one before
   retrying.
2. **Has content, no workflow.** One new tree is based on the current default-branch tree and
   adds the workflow set alongside it. Nothing else on the repository is changed — see
   [What it never does](#what-it-never-does) for why that is a guarantee rather than a
   promise.
3. **This application prepared it before, and the shipped workflow has moved on.** An update
   is allowed only when the current UTF-8 bytes still have the exact SHA-256 recorded when
   that file was installed. A hand edit, including a deletion, becomes a typed conflict and
   is never overwritten. A marker or template version newer than this build is never
   downgraded.
4. **Looks prepared, cannot run.** The workflow files can be present and current and GitHub
   Actions can still be off for the repository, or restricted by an organisation policy. That
   is reported honestly rather than smoothed into a ready state — see
   [Actions enabled is a different question](#actions-enabled-is-a-different-question-from-the-workflow-existing).

## What it never does

Every candidate blob, the complete tree, and the commit are built out of sight through the
Git Data API. The only repository-visible mutation is the final default-branch ref update,
made with `force: false` and guarded by the exact head SHA read before planning. Marker and
workflow ownership reads are pinned to that same SHA rather than to a moving branch name. If
another writer advances the branch, the update is a typed concurrent-update conflict and none
of the candidate bytes become visible. There is no force-push, branch replacement, sequential
single-file commit, or rollback that has to guess what another writer did.

## The marker, and why a foreign file is refused rather than replaced

Every file this writes is recorded in `.worldlens-ci.json`, at the repository root. Schema 2
records the marker schema version, a monotonic numeric template-set version, every managed
path, and the exact SHA-256 of the UTF-8 bytes installed at each path — the same pattern
[publishing to GitHub Pages](./pages-hosting.md) already uses for its own marker. Before a
file that already exists is touched, its content is compared to the template:

- **Identical and recorded by the marker** → left alone; nothing is written.
- **Different, recorded by the marker, and still equal to the marker's installed hash** →
  this is an unchanged older template, so it may be updated safely.
- **Different from the installed hash, or deleted after installation** → refused as a
  managed-file conflict. The application never treats its marker as permission to erase a
  later user edit.
- **Not recorded by the marker** → refused outright. Somebody's own
  file happens to share this exact path, and nothing here overwrites it without being told
  to. The whole run refuses, even when only one of several managed files conflicts — a
  half-prepared repository is worse than an unprepared one, because it looks finished.

## Token scopes, checked before anything is written

Writing under `.github/workflows/` needs the `workflow` OAuth scope; an ordinary repository
write only needs `repo`. A token carrying `repo` but not `workflow` would otherwise create
everything else and then fail specifically on the workflow file, leaving a repository half
set up with an error that does not explain why. Both scopes are checked — where the
credential can report them at all — **before the first byte is written**, so that failure
mode cannot happen: either both scopes are there and the whole run proceeds, or neither
scope check passes and nothing was touched. A credential that cannot report its scopes at
all (most fine-grained tokens, and every OAuth App or GitHub App installation token) is not
treated as missing anything — the run proceeds, with a note that a scope refusal, if it
happens, will show up as the workflow file specifically failing.

## Actions enabled is a different question from the workflow existing

`GET .../actions/permissions` is read once the files are in place, and its answer is
reported plainly:

- `enabled: true` → ready.
- `enabled: false` → **not** a green tick, however current the files are. The repository or
  an organisation policy has Actions switched off, and the message says exactly that, with
  the setting to change (Settings → Actions → General).
- **Could not be read at all** → this endpoint needs administrator access to the repository,
  which a token with ordinary write access may not have. Reported as "could not be
  determined" rather than either extreme — this is not evidence of a problem, and treating
  it as one would tell people to fix a policy that is not actually broken.

## Runner minutes: public is free, private is not

A public repository gets unlimited standard-runner minutes. A private one spends from the
account's own monthly allowance, and a sharded render spends one runner-minute per runner
per minute — a thirty-way split burns thirty times the wall-clock time. Preparing a private
repository carries a note saying exactly this, in as many words, before the first render is
started there.

## Running it twice

Idempotent by construction: a second run validates all three workflow hashes and the marker,
then performs no Git mutation at all. The CI-render screen runs this check immediately before
every dispatch, so a safe managed update lands first while a user-edit, downgrade, or
concurrent-update conflict stops before a workflow run is started. The detailed conflict is
shown at the control that initiated the render.

## Failure modes

Every refusal names the exact cause rather than a generic failure:

- **No credential can drive it at all** — nobody signed in to the application, and `gh` is
  either not installed or not signed in.
- **A scope is missing** — names the exact scope (`repo`, `workflow`, or both) and that
  signing in again is what would fix it.
- **The repository does not exist, or this credential cannot see it** — GitHub answers a
  private repository nobody has access to and a genuinely missing one the same way, which
  the message says plainly rather than guessing.
- **The credential can see the repository but cannot write to it.**
- **The repository has no first commit** — asks for one starter commit and changes nothing;
  the in-app repository creator already supplies it.
- **A foreign file is in the way** — see [the marker section](#the-marker-and-why-a-foreign-file-is-refused-rather-than-replaced)
  above.
- **A managed file was edited or deleted** — names the conflicting path; none of the three
  workflows or the marker are changed.
- **A newer marker schema or template version is present** — the older application refuses
  to downgrade it.
- **The default branch moved concurrently** — the expected-head check refuses the final ref
  update without force.
- **A network or GitHub-side failure partway through object creation** — the branch still
  points at its original tree. Candidate Git objects may be unreachable, but no partial
  workflow set or marker is visible and a later retry starts from the actual branch head.
- **A packaged resource is missing** — no checkout fallback is attempted and the repository
  is not contacted for a write.

None of these is a spinner that hides what happened. Every one names its cause and, where
there is one, the exact fix.

## Suggested articles

- [Rendering a world in GitHub Actions](./render-in-actions.md) — what the workflow this
  prepares actually does, once it can run.
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md) — the marker-file pattern
  this reuses, and the other place this project force-replaces a branch on purpose.
- [Scheduled re-rendering](./scheduled-render.md) — configuring the repository once a render
  has run at least once.

## 廣東話

### 點解要有呢樣嘢

**呢個就係令一個冇 render workflow 嘅 repository 唔再變死胡同嘅嗰一塊。**
[喺 GitHub Actions 度 render 一個 world](./render-in-actions.md) 要求 `render-world.yml`
已經 commit 咗上 repository 嘅預設分支先行得，而喺呢樣嘢出現之前，呢個應用程式從來冇任何地方會幫你放上去。
一個啱啱建立嘅 repository，或者一個從來未加過 render workflow 嘅現有專案，就會撞到一粒永遠停用嘅 render 掣，
配一段睇落好似權限問題嘅訊息——但其實真正原因只不過係乜都未設定過。呢個功能就係 app 自己做埋呢個設定。

### 「設定好」即係點

三個檔，一齊 commit 上 repository 嘅預設分支：

- `.github/workflows/render-world.yml` — sync 會 dispatch 嘅嗰個 workflow。
- `.github/workflows/render-shard-wave.yml` — 每個 sharded wave 都用本機路徑呼叫嘅可重用 workflow
  （`uses: ./.github/workflows/render-shard-wave.yml`），所以佢一定要喺個 repository 度，
  唔可以淨係喺呢個專案自己嗰份副本度被引用。
- `.github/workflows/scheduled-render.yml` — 排程檢查，決定一個記錄咗嘅 world 有冇變過、
  應唔應該再 render 一次。

三個檔都係一字不改咁寫入。一個打包好嘅安裝程式必須喺自己嘅 resources 入面帶齊成套；
就算淨係少一個檔，setup 都會 fail closed，永遠唔會由開發者嘅 checkout 度借個檔嚟用。
開發時執行就容許讀 checkout 嘅 `.github/workflows/` 目錄。詳見 `cirender/workflowTemplates.ts`。

### 佢處理嘅四種狀態

1. **真係空——一個 commit 都冇。** GitHub 嘅 Git Data API 喺一個空 repository 度建立唔到第一個分支 ref。
   所以 setup 會喺建立任何候選 object 之前就 fail closed，並要求你先做一個起始 commit。
   喺呢個應用程式入面建立嘅 repository 已經會自動收到嗰個起始 commit；
   喺外面建立嘅空 repository 就要先有一個，然後再重試。
2. **有內容，但冇 workflow。** 會以當前預設分支嘅 tree 為基礎整一個新 tree，喺旁邊加入整套 workflow。
   Repository 上面其他嘢乜都唔會改——點解呢個係保證而唔係口頭承諾，
   見[佢永遠唔會做嘅嘢](#佢永遠唔會做嘅嘢)。
3. **呢個應用程式之前準備過，而隨程式發佈嘅 workflow 已經更新咗。** 只有喺當前 UTF-8 位元組
   仍然係當初安裝嗰陣記錄嘅嗰個 SHA-256 嘅時候，先容許更新。人手改過（包括刪咗）就會變成一個有型別嘅衝突，
   永遠唔會被覆寫。比呢個 build 更新嘅 marker 或者 template 版本，永遠唔會被降級。
4. **睇落準備好，但行唔到。** Workflow 檔可以齊全兼最新，但 GitHub Actions 喺嗰個 repository 度仍然可以係關咗，
   或者被組織政策限制住。呢樣會老實咁報出嚟，唔會磨平做「已就緒」——
   見[Actions 有冇開，同 workflow 存唔存在係兩回事](#actions-有冇開同-workflow-存唔存在係兩回事)。

### 佢永遠唔會做嘅嘢

每一個候選 blob、成棵 tree、同埋個 commit，全部都經 Git Data API 喺睇唔到嘅地方整好。
唯一一個喺 repository 度睇得見嘅變動，就係最後嗰下預設分支 ref 更新，
用 `force: false` 做，並且由規劃之前讀到嘅確實 head SHA 把關。Marker 同 workflow 嘅擁有權讀取，
都係釘死喺同一個 SHA，而唔係釘喺一個會郁嘅分支名。如果另一個寫入者推進咗個分支，
呢次更新就會變成一個有型別嘅 concurrent-update 衝突，而所有候選位元組一個都唔會現形。
冇 force-push、冇換分支、冇逐個檔順序 commit、亦冇要靠估另一個寫入者做過乜嘅回滾。

### Marker，同點解外來檔係被拒絕而唔係被取代

佢寫嘅每一個檔都記錄喺 repository 根目錄嘅 `.worldlens-ci.json` 入面。Schema 2 記錄 marker schema 版本、
一個單調遞增嘅數字 template-set 版本、每一條受管路徑，以及每條路徑上安裝嗰陣 UTF-8 位元組嘅確實 SHA-256
——同 [發佈上 GitHub Pages](./pages-hosting.md) 為佢自己嘅 marker 用緊嗰套模式一樣。
喺郁一個已經存在嘅檔之前，會將佢嘅內容同 template 比較：

- **一模一樣而且 marker 有記錄** → 唔郁佢，乜都唔寫。
- **唔同、marker 有記錄、而且仍然等於 marker 記低嘅安裝 hash** → 咁即係一個未被改過嘅舊 template，
  可以安全更新。
- **同安裝 hash 唔同，或者安裝之後被刪咗** → 當受管檔衝突拒絕。
  呢個應用程式永遠唔會將自己嘅 marker 當成係抹走用戶之後嘅改動嘅許可證。
- **marker 冇記錄** → 直接拒絕。即係有人自己嘅檔啱啱佔咗呢條路徑，而呢度冇經同意唔會覆寫佢。
  就算幾個受管檔入面淨係一個有衝突，成個 run 都會拒絕——一個準備到一半嘅 repository 差過一個未準備嘅，
  因為佢睇落好似做完咗。

### Token scope，喺寫任何嘢之前就檢查

喺 `.github/workflows/` 底下寫嘢要 `workflow` 呢個 OAuth scope；普通 repository 寫入淨係要 `repo`。
一個有 `repo` 但冇 `workflow` 嘅 token，如果唔檢查，就會將其他嘢全部整晒，然後專登喺 workflow 檔嗰度失敗，
留低一個設定咗一半嘅 repository，配一個解釋唔到原因嘅錯誤。所以兩個 scope 都會檢查——
喺個憑證報得到嘅前提下——而且係**喺寫第一個位元組之前**，令嗰種失敗模式根本冇得發生：
要麼兩個 scope 都有、成個 run 行落去，要麼有 scope 檢查唔過、乜都冇郁過。
至於一啲完全報唔到自己 scope 嘅憑證（大部分 fine-grained token，以及每一個 OAuth App
或者 GitHub App installation token），唔會當佢缺咗嘢——個 run 照行，
只係附一句：如果真係被 scope 拒絕，佢會以「workflow 檔特定地失敗」嘅形式出現。

### Actions 有冇開，同 workflow 存唔存在係兩回事

啲檔就位之後會讀一次 `GET .../actions/permissions`，答案照直報：

- `enabled: true` → 就緒。
- `enabled: false` → **唔會**畀綠剔，啲檔幾新都好。即係個 repository 或者組織政策熄咗 Actions，
  而段訊息會照直咁講，並指出要改邊個設定（Settings → Actions → General）。
- **完全讀唔到** → 呢個 endpoint 要 repository 嘅管理員權限，而一個淨係有普通寫入權嘅 token 可能冇。
  會報做「無法判定」，唔會偏向任何一邊——呢個唔算係問題嘅證據，
  當佢係問題嘅話，就會叫人去修一條其實冇壞嘅政策。

### Runner 分鐘數：公開免費，私有唔免費

公開 repository 有無限嘅標準 runner 分鐘數。私有嘅就會用緊個帳戶自己每月嘅額度，
而一次 sharded render 每個 runner 每分鐘就用一個 runner-minute——分三十路就係燒三十倍嘅實際時間。
準備一個私有 repository 嗰陣，會喺嗰度開始第一次 render 之前，白紙黑字咁附上呢一段說明。

### 行兩次會點

按構造就係冪等 (idempotent)：第二次執行會驗證三個 workflow 嘅 hash 同個 marker，
然後完全唔做任何 Git 變動。CI-render 畫面喺每次 dispatch 之前都即刻行呢個檢查，
所以一個安全嘅受管更新會先落地，而用戶改動、降級或者 concurrent-update 衝突就會喺 workflow run
開始之前停低。詳細衝突會喺發起 render 嗰個控制項嗰度顯示。

### 失敗模式

每一次拒絕都會指名確實原因，唔會淨係報一個籠統失敗：

- **完全冇憑證可以驅動佢** — 冇人喺應用程式度登入過，而 `gh` 又冇裝或者冇登入。
- **缺咗某個 scope** — 會指名確實嘅 scope（`repo`、`workflow`，或者兩個都係），
  並講明重新登入就係解決方法。
- **Repository 唔存在，或者呢個憑證睇唔到佢** — GitHub 對「一個冇權限入嘅私有 repository」
  同「一個真係唔存在嘅」係同一個答覆，段訊息會照直講明，唔會靠估。
- **憑證睇到個 repository，但寫唔到入去。**
- **Repository 冇第一個 commit** — 會要求做一個起始 commit，同時乜都唔改；
  app 入面嗰個 repository 建立工具本身已經會提供。
- **有外來檔擋住** — 見上面 [marker 嗰節](#marker同點解外來檔係被拒絕而唔係被取代)。
- **有受管檔被改咗或者刪咗** — 會指名衝突嗰條路徑；三個 workflow 同個 marker 一個都唔會改。
- **出現咗更新嘅 marker schema 或者 template 版本** — 舊嘅應用程式會拒絕降級佢。
- **預設分支同時被人推進咗** — expected-head 檢查會拒絕唔用 force 就做最後嗰下 ref 更新。
- **建立 object 途中出現網絡或者 GitHub 側嘅失敗** — 個分支仍然指住佢原本嘅 tree。
  可能會有一啲到唔到嘅候選 Git object，但唔會有半套 workflow 或者 marker 現形，
  而之後重試會由真正嘅分支 head 開始。
- **打包資源缺失** — 唔會退回去試 checkout，亦唔會為咗寫入而聯絡個 repository。

呢啲全部都唔係一個遮住真相嘅轉圈動畫。每一個都會指名原因，有解決方法嘅就講埋確實嘅解決方法。

### 建議閱讀

- [Rendering a world in GitHub Actions](./render-in-actions.md) — 呢度準備嘅 workflow，
  行得到之後實際上做啲乜。
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md) — 呢度重用嗰個 marker 檔模式，
  以及呢個專案另一個刻意 force-replace 分支嘅地方。
- [Scheduled re-rendering](./scheduled-render.md) — render 至少行過一次之後點樣設定個 repository。
