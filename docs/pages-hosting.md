# Publishing a rendered map to GitHub Pages

A finished render is served by this application at `http://127.0.0.1:<port>/local/<renderId>/`.
That address works for exactly one person, on exactly one machine, for exactly as long as the
machine is switched on. This feature turns it into a GitHub Pages site: a real address anybody
can open, hosted by somebody else, free, and still nothing but files.

The screen is the **Publish to Pages** tab. Its main-process half is
`design/packages/app/src/main/pages/`, its renderer half is
`design/packages/ui/src/components/pages/`, and the piece both of them stand on is
`prepareStaticHost` in `design/packages/render-actions/src/pages/staticHost.ts`.

## The fact the whole feature rests on

BlueMap's engine stores hires tiles gzip-compressed: the file on disk is `0.prbm.gz`, and the
map's texture data is `textures.json.gz`. The viewer, by default, asks for `0.prbm` and
`textures.json` without the suffix, because BlueMap's own web server answers the uncompressed
name out of the compressed file. So does this application's embedded server, which is why a map
looks perfect locally and then 404s on every tile the moment it is copied anywhere else.

GitHub Pages does not rewrite anything. It serves the files that exist, under their real names,
and 404s the rest. There is no configuration and no `.htaccess`, which is the entire point of it.

The fix is one flag: `clientDecompression: true` in the web app's own `settings.json`. With it
set, the viewer appends `.gz` to both names and inflates the bytes itself with
`DecompressionStream("gzip")`. `prepareStaticHost` sets that flag, and then **verifies it against
the files that are actually on disk**, because a flag that points the viewer at files nobody
wrote is exactly as broken as the problem it fixes.

The same module also writes an empty `.nojekyll`, without which Pages runs the site through
Jekyll and drops every path whose name starts with an underscore.

`docs/render-in-actions.md` covers the same trap from the CI side, where the render workflow
prepares a Pages copy of the merged map. Both routes call the same function.

## Behaviour

### Preflight, which changes nothing

`pages:preflight` runs `prepareStaticHost` with `write: false` and reads the target repository.
It writes nothing at all: the flag is not flipped, `.nojekyll` is not created, and the marker
described below is not written. It reports:

- the site's total size and file count, which is what the decision actually turns on;
- whether the site is over the **1 GB** GitHub asks Pages sites to stay under (a warning);
- any single file over the **100 MB** GitHub refuses outright (a blocker);
- any map missing the files the viewer will ask for once the flag is on (a blocker);
- what `gh` is on this machine, as three separate situations rather than one dead end;
- whether `git` is on `PATH` at all;
- whether the repository exists, whether this account can write to it, whether it is private,
  and **whether the publishing branch already exists and carries this application's marker**.

Publishing is refused when `blockers` is non-empty. The screen disables the button and shows the
reason; the main process refuses again on its own, because a guard that lives only in the
renderer is not a guard.

### Publishing

1. **Prepare.** `prepareStaticHost` with `write: true`. A map that is not servable stops here.
2. **Check.** `gh` and `git` are probed again, the repository is created if it does not exist,
   and the publishing branch is read for the marker.
3. **Stage.** Files are added to the index in batches of 2,000, handed to `git add` on stdin,
   NUL-separated, so progress is reported as files staged out of files total. Tens of thousands
   of small files is the ordinary case, and a bare spinner over it is indistinguishable from a
   hang for several minutes.
4. **Push.** An orphan commit is force-pushed to the publishing branch, then the branch is read
   back from GitHub and its head compared to the commit that was just made. `pushVerified` is
   false when they do not match, and the report says so rather than claiming the push landed.
5. **Enable.** `POST /repos/{owner}/{repo}/pages` with the branch as the source, or `PUT` when a
   site already exists and points somewhere else.
6. **Wait.** `GET /repos/{owner}/{repo}/pages` is polled until GitHub reports `built`.
7. **Verify.** The published URL is fetched. **`status` becomes `live` only when that request
   answered `200`.** "GitHub says built" and "a browser can open it" are two different claims,
   and a first build routinely reports built a minute before the address resolves.

### Interruptions and status refresh

The application writes `publish.json` under `<userData>/pages-hosting/<renderId>/` before each
durable boundary. Its `stage` is one of `preparing`, `checking`, `staging`, `pushing`,
`enabling`, `waiting`, `verifying` or `finished`. A crash after the orphan commit has been
created keeps the commit and stage, and **Continue publishing** reuses that local repository:
it checks whether the recorded commit already landed, skips a second staging/push when it did,
then resumes Pages enablement, build polling and URL verification. Earlier stages are safely
replayed because their preparation is idempotent.

Recorded sites also carry a **Refresh status** action. It calls `GET /repos/{owner}/{repo}/pages`
again and probes the saved URL, writing the new GitHub status and the new `200` verification
result back to `publish.json`. A snapshot from last week is never presented as current without
the timestamped refresh that produced it.

### Why the publishing branch is replaced rather than added to

Every publish is an orphan commit and a force-push. A republished map is a replacement, not a
revision of the last one, and keeping the history of a million tiles would grow the repository
without bound for no benefit anybody would ever use.

That makes the feature capable of destroying a website, so it is guarded:

> Every publish writes `.worldlens-map.json` at the site root; the legacy
> `.material-bluemap-map.json` remains readable. The marker names this tool, the render and the map
> ids. Before anything is pushed, **and again before anything is deleted**,
> the target branch is read. If the branch exists and does not carry that marker, the operation
> is refused.

This is the one guard in the feature with no fallback and no override. One mistyped repository
name would otherwise replace somebody else's site.

### Where the git directory lives

There is never a `.git` inside a render's output. The repository lives under the application's
own data directory, at `<userData>/pages-hosting/<renderId>/.git`, and every git command names it
explicitly:

```
git -C <webRoot> --git-dir=<workDir>/.git --work-tree=<webRoot> ...
```

Copying the tile tree into a staging directory first was rejected on arithmetic rather than
taste: a rendered map is routinely several gigabytes across tens of thousands of files, and
copying it doubles both the disk it needs and the time before anything is pushed, to produce a
byte-for-byte duplicate of a directory that is already there. Git never writes into a work tree
during `add`, `commit` or `push`, so the only things this puts into the render output are the
marker file and the two additive changes `prepareStaticHost` makes.

### Stopping

Taking a site down disables Pages and deletes the publishing branch. That is the map gone from
the internet, so it sits behind the application's super-confirmation gate: two independently
operated keys and a full-range slider, exactly as every other destructive action does. See
[Super confirmation](./super-confirmation.md).

The marker is re-read at the moment of deletion rather than trusted from a preflight that ran
minutes earlier, because the interesting failure is somebody typing a different repository name
in between.

## Configuration

| Setting | Where | Default |
|---|---|---|
| Publishing branch | On the screen | `gh-pages` |
| Repository visibility | On the screen | `public`, and only used if the repository has to be created |
| Owner | On the screen | The `gh` account, or an organisation it can write to |
| Work directory | Fixed | `<userData>/pages-hosting/` |
| Build poll | Fixed | Every 5 s, up to 60 attempts |

A branch name that is not `[A-Za-z0-9][A-Za-z0-9._-]{0,99}`, or that contains `..`, falls back to
`gh-pages` rather than becoming part of a URL path or a ref it was not meant to be.

## Failure modes

| What happens | What is reported |
|---|---|
| A map is missing `textures.json.gz` or its `tiles/` | Blocked before anything is pushed, naming the map and the files |
| A file is over 100 MB | Blocked; GitHub cannot accept it at all |
| The site is over 1 GB | A warning, not a refusal; GitHub may throttle or refuse |
| The branch exists with no marker | **Refused**, with the branch named. Nothing is pushed and nothing is deleted |
| `gh` is not installed | Blocked, pointing at cli.github.com |
| `gh` is signed out | Blocked, naming `gh auth login` and saying it has to be run in a terminal |
| `git` is not on `PATH` | Blocked; publishing is a push |
| Pages refused on a private repository | Reported as needing a paid plan, which is what a free account's 403 actually means |
| GitHub's Pages build errors | Reported as `errored`; the repository's Pages settings page carries the reason |
| The build finishes but the URL does not answer | Reported as `built` and **not** as live, with the HTTP status |
| The push exits zero but GitHub does not show the commit | `pushVerified: false`, said out loud |
| The app closes during a publish | `publish.json` keeps the last stage; the recorded-site row offers **Continue publishing** |
| A recorded site's old status may have changed | **Refresh status** re-reads Pages and probes the URL before replacing the record |

## Security considerations

- **No token is read, held, logged or passed as an argument.** `--show-token` is never passed and
  no `GH_TOKEN` is set. Authentication for the API is `gh api`; authentication for the push is
  git's own `credential.helper` mechanism pointed at `gh auth git-credential` for that one
  command, passed with `-c` so the person's global git config is never modified.
- **`gh auth login` is never driven from the application.** It suppresses its device-code prompt
  when stdin is not a terminal, so a spawned copy prints nothing and hangs for ever. The feature
  names the command and re-probes afterwards.
- **Every command is spawned with an argument array and never through a shell**, so nothing in a
  repository or branch name can become part of a command line.
- **Publishing is publication.** A public repository means every tile, marker and coordinate in
  the map can be downloaded by anybody who finds the address. The screen says so as a warning
  before the button, and the acknowledgement tick box is never pre-ticked.
- **Pages on a private repository needs a paid GitHub plan.** That is said plainly at preflight
  rather than discovered as a 403 after several gigabytes have been pushed.

## Verification

What has been proved, and by what:

- `prepareStaticHost` is proved against a **real** map on a **real** Pages site. A map rendered in
  CI was published to `DingDingChae/bluemap-pages-proof`; the tile
  `maps/tiny/tiles/0/x0/z0.prbm.gz` returned `200` with `content-type: application/gzip`, no
  `Content-Encoding`, and first bytes `1f8b`. The same tile without `.gz` returned `404`. The
  BlueMap web app loaded from Pages, read `settings.json`, entered the map and rendered geometry
  in a headless browser. The flag is genuinely load-bearing.
- The main-process feature is covered by 37 tests in
  `design/packages/app/src/main/pages/hosting.test.ts` and `ipc.test.ts`, against a fake process
  runner. **No test spawns a real `git`, a real `gh`, or a network call**, deliberately: the
  cases worth testing are `gh` missing, `gh` signed out, a branch somebody else wrote, a push
  GitHub does not show, a build that errors and a URL that answers 404, and none of those can be
  produced on a machine where the whole thing works.
- The renderer half is covered by 32 tests in
  `design/packages/ui/src/components/pages/`, including the mounted screen: the disabled button
  and its stated reason, the refusal on a foreign branch surviving a ticked acknowledgement, the
  render list filtered through the shared search field, and the super-confirmation gate really
  standing between the button and the deletion.
- The screen is in the screenshot harness as a **required** surface, so a run that cannot open it
  fails rather than recording a gap.

What has **not** been proved:

> The desktop publish path has never been run end to end against a real GitHub account from the
> application. Every step is unit-tested against a fake process runner, and the static-host
> preparation it depends on is verified against a real published site, but the sequence
> `gh repo create` → orphan push → `POST /pages` → poll → fetch has not been executed against
> github.com from this application on a real machine. Until it has, treat the feature as
> implemented and unproven rather than as verified, and see `HANDOFF.md` for what that would take.

```
pnpm exec vitest run packages/app/src/main/pages packages/ui/src/components/pages
```

## Related

- [Rendering a world in GitHub Actions](./render-in-actions.md) - the other route to a Pages
  copy, where the runners render and the merge job prepares the site.
- [Super confirmation](./super-confirmation.md) - the gate in front of taking a site down.
- [Large worlds and rendered maps](./large-worlds.md) - what to do when a map is past a limit.

## 廣東話

### 將 render 好嘅地圖發佈上 GitHub Pages (Publish to Pages)

一個 render 完嘅地圖,本來只係由本應用程式喺 `http://127.0.0.1:<port>/local/<renderId>/` serve——即係得一個人、一部機、開住機先睇到。呢個功能將佢變成一個 GitHub Pages 網站:一個任何人都開得到嘅真地址,由第三方免費 host,而且仍然純粹係靜態檔案。

相關畫面係 **Publish to Pages** 分頁。main process 嗰半喺 `design/packages/app/src/main/pages/`,renderer 嗰半喺 `design/packages/ui/src/components/pages/`,兩邊共同依賴嘅係 `design/packages/render-actions/src/pages/staticHost.ts` 入面嘅 `prepareStaticHost`。

### 成個功能建基於嘅一個事實

BlueMap 引擎將 hires tiles 以 gzip 壓縮儲存:磁碟上嘅檔案係 `0.prbm.gz`,材質資料係 `textures.json.gz`。但 viewer 預設會請求冇後綴嘅 `0.prbm` 同 `textures.json`,因為 BlueMap 自己嘅 web server 會用壓縮檔回應無壓縮嘅名,本應用程式內置嘅 server 亦一樣。所以地圖喺本機睇落完美,一 copy 去第二度就每塊 tile 都 404。

GitHub Pages 唔會 rewrite 任何嘢:有咩檔案就照真名 serve,冇嘅就 404,冇設定亦冇 `.htaccess`——呢個正正係佢嘅賣點。解法係一個 flag:喺 web app 自己嘅 `settings.json` 度設 `clientDecompression: true`。設咗之後 viewer 會自動喺兩個名後面加 `.gz`,再自己用 `DecompressionStream("gzip")` 解壓。`prepareStaticHost` 負責設呢個 flag,而且會**對照磁碟上實際存在嘅檔案去驗證**——一個指住冇人寫過嘅檔案嘅 flag,同佢想修正嘅問題一樣咁壞。

同一個 module 亦會寫一個空嘅 `.nojekyll`,唔寫嘅話 Pages 會將個 site 交畀 Jekyll 處理,凡係下劃線開頭嘅路徑會被剷走。`docs/render-in-actions.md` 由 CI 嗰邊講同一個陷阱;兩條路都係 call 同一個 function。

### 行為

#### Preflight——乜都唔會改

`pages:preflight` 以 `write: false` 行 `prepareStaticHost`,再讀目標 repository,完全唔寫任何嘢:flag 唔會設、`.nojekyll` 唔會建立、marker 亦唔會寫。佢報告:site 總大小同檔案數(決定其實靠呢個);有冇超過 GitHub 建議 Pages site 唔好超過嘅 **1 GB**(警告);有冇單一檔案超過 GitHub 直接拒收嘅 **100 MB**(blocker);有冇地圖缺少 flag 開咗之後 viewer 會問嘅檔案(blocker);呢部機上 `gh` 嘅狀態,分三種情況講而唔係一句死路;`git` 有冇喺 `PATH`;repository 存唔存在、呢個帳號寫唔寫得入、係唔係 private,以及**發佈 branch 係咪已經存在同帶住本應用程式嘅 marker**。

`blockers` 唔係空嘅話,發佈會被拒:畫面 disable 個掣同講明原因,而 main process 自己亦會再拒一次,因為只放喺 renderer 嘅 guard 唔算 guard。

#### 發佈流程

1. **Prepare。** 以 `write: true` 行 `prepareStaticHost`;serve 唔到嘅地圖喺呢度就停。
2. **Check。** 再 probe 一次 `gh` 同 `git`,repository 唔存在就建立,然後讀發佈 branch 搵 marker。
3. **Stage。** 檔案以每批 2,000 個、NUL 分隔、經 stdin 交畀 `git add`,所以進度可以報「stage 咗幾多/總共幾多」。幾萬個細檔案係常態,淨係一個 spinner 轉幾分鐘同 hang 機根本冇分別。
4. **Push。** 一個 orphan commit force-push 上發佈 branch,之後由 GitHub 讀返個 branch,對比 head 同啱啱嗰個 commit。唔 match 嘅話 `pushVerified` 係 false,報告會照直講,唔會當 push 成功咗。
5. **Enable。** `POST /repos/{owner}/{repo}/pages`,以個 branch 做 source;已有 site 但指住第二度就用 `PUT`。
6. **Wait。** poll `GET /repos/{owner}/{repo}/pages` 直到 GitHub 報 `built`。
7. **Verify。** fetch 已發佈嘅 URL。**只有嗰個請求回咗 `200`,`status` 先會變 `live`。**「GitHub 話 built」同「browser 開得到」係兩個唔同嘅講法,第一次 build 好平常會早過地址生效成一分鐘就報 built。

#### 中斷同狀態刷新

應用程式喺每個 durable boundary 之前將 `publish.json` 寫喺 `<userData>/pages-hosting/<renderId>/` 下面,`stage` 係 `preparing`、`checking`、`staging`、`pushing`、`enabling`、`waiting`、`verifying` 或 `finished` 其中一個。orphan commit 起咗之後先至 crash 嘅話,commit 同 stage 都仲喺度,**Continue publishing** 會重用嗰個本地 repository:先檢查記錄咗嘅 commit 係咪已經上咗,上咗就跳過第二次 staging/push,然後繼續 Pages enablement、build polling 同 URL verification。較早嘅 stage 可以安全重播,因為佢哋嘅準備工夫係 idempotent。

已記錄嘅 site 亦有 **Refresh status** 動作:再 call `GET /repos/{owner}/{repo}/pages` 同 probe 儲存咗嘅 URL,將新嘅 GitHub status 同新嘅 `200` 驗證結果寫返入 `publish.json`。上星期嘅 snapshot 永遠唔會未經帶 timestamp 嘅 refresh 就當係現況。

#### 點解發佈 branch 係整條換走而唔係疊上去

每次發佈都係一個 orphan commit 加 force-push。重新發佈嘅地圖係替換,唔係上一版嘅修訂;保留一百萬塊 tile 嘅歷史只會令 repository 無止境膨脹,冇人會用得着。

咁即係話呢個功能有能力毀掉一個網站,所以有 guard:每次發佈都會喺 site root 寫 `.worldlens-map.json`(舊嘅 `.material-bluemap-map.json` 仍然讀得)。個 marker 記低係邊個工具、邊個 render 同邊個地圖 id。push 任何嘢之前,**以及刪任何嘢之前**,都會先讀目標 branch;branch 存在但冇呢個 marker 嘅話,操作直接被拒。呢個係成個功能入面唯一冇 fallback、冇 override 嘅 guard——唔係咁嘅話,打錯一個 repository 名就會換走人哋成個網站。

#### git directory 擺喺邊

render output 入面永遠唔會有 `.git`。repository 放喺應用程式自己嘅資料目錄 `<userData>/pages-hosting/<renderId>/.git`,每條 git command 都明文指定:

```
git -C <webRoot> --git-dir=<workDir>/.git --work-tree=<webRoot> ...
```

「先 copy 個 tile tree 去 staging directory」呢個做法係基於算術而唔係口味被否決:一個 render 完嘅地圖動輒幾 GB、幾萬個檔案,copy 一次會令磁碟需求同開始 push 前嘅等候時間都翻倍,結果只係複製一個本來就喺度嘅目錄。git 喺 `add`、`commit`、`push` 期間唔會寫入 work tree,所以呢個功能放入 render output 嘅,只有 marker 檔案同 `prepareStaticHost` 嗰兩個 additive 改動。

#### 落架

將 site 下架會 disable Pages 同刪走發佈 branch——即係個地圖由互聯網上消失,所以放喺應用程式嘅 super-confirmation gate 後面:兩條要分開操作嘅 key 加一條要拉盡嘅 slider,同其他毀滅性動作一樣。詳見 [Super confirmation](./super-confirmation.md)。marker 係喺刪嘅一刻重新讀,而唔係信幾分鐘前 preflight 嘅結果,因為值得擔心嘅失敗正正係中間有人打咗第二個 repository 名。

### 設定

發佈 branch 喺畫面上揀,預設 `gh-pages`;repository visibility 亦喺畫面上揀,預設 `public`,而且只喺要新建 repository 時先用到;owner 預設係 `gh` 帳號,或者佢寫得入嘅 organisation;work directory 固定係 `<userData>/pages-hosting/`;build poll 固定每 5 秒一次,最多 60 次。branch 名唔符合 `[A-Za-z0-9][A-Za-z0-9._-]{0,99}`,或者包含 `..` 嘅話,會退回用 `gh-pages`,唔會變成 URL path 或者 ref 嘅一部分。

### 失敗情況

- 地圖缺少 `textures.json.gz` 或者佢嘅 `tiles/`:push 之前就 block,講明邊個地圖缺邊啲檔案。
- 單一檔案過 100 MB:block,GitHub 根本收唔到。
- site 過 1 GB:警告而唔係拒絕;GitHub 可能 throttle 或者拒收。
- branch 存在但冇 marker:**直接拒絕**,講明邊條 branch;乜都唔 push,乜都唔刪。
- `gh` 未裝:block,指向 cli.github.com。
- `gh` 未登入:block,講明要喺 terminal 自己行 `gh auth login`。
- `git` 唔喺 `PATH`:block,因為發佈本身就係一次 push。
- private repository 開 Pages 被拒:報告話需要付費 plan——free 帳號收到嘅 403 實際就係咁解。
- GitHub 嘅 Pages build 出錯:報 `errored`,原因喺 repository 嘅 Pages settings 頁。
- build 完成但 URL 冇回應:報 `built` 而**唔係** live,並附 HTTP status。
- push exit code 係零但 GitHub 見唔到個 commit:`pushVerified: false`,照直講出嚟。
- 發佈中途 close app:`publish.json` 保留最後嘅 stage,已記錄嘅 site 行會提供 **Continue publishing**。
- 已記錄 site 嘅舊 status 可能已經變咗:**Refresh status** 會先重讀 Pages 同 probe URL 先至更新記錄。

### 保安要點

- **唔會讀取、持有、log 或者以 argument 傳遞任何 token。** 永遠唔會傳 `--show-token`,亦唔會設 `GH_TOKEN`。API 認證用 `gh api`;push 認證用 git 自己嘅 `credential.helper` 機制,指住 `gh auth git-credential`,只以 `-c` 對嗰一條 command 生效,所以用戶嘅 global git config 永不被改動。
- **應用程式永遠唔會代行 `gh auth login`。** stdin 唔係 terminal 嘅話,佢會收起 device-code prompt,即係 spawn 出嚟嘅副本乜都唔印然後永遠 hang。功能只會講明條 command,之後再 probe 一次。
- **每條 command 都用 argument array spawn,永不經 shell**,所以 repository 或者 branch 名入面嘅任何嘢都變唔成 command line 嘅一部分。
- **發佈即係公開。** public repository 意味住地圖入面每塊 tile、每個 marker、每個座標,任何搵到個地址嘅人都下載得到。畫面喺個掣之前有警告講明,而且 acknowledgement tick box 永遠唔會預先剔咗。
- **private repository 開 Pages 需要 GitHub 付費 plan。** 呢點喺 preflight 直接講明,而唔係 push 咗幾 GB 之後先由一個 403 度發現。

### 驗證

已經證明咗嘅:

- `prepareStaticHost` 係對住一個**真**地圖、一個**真** Pages site 驗證嘅。CI render 出嚟嘅地圖發佈咗去 `DingDingChae/bluemap-pages-proof`:tile `maps/tiny/tiles/0/x0/z0.prbm.gz` 回 `200`、`content-type: application/gzip`、冇 `Content-Encoding`、頭兩個 byte 係 `1f8b`;冇 `.gz` 嘅同一塊 tile 回 `404`。BlueMap web app 喺 headless browser 由 Pages 載入、讀到 `settings.json`、入到地圖並且 render 到幾何。個 flag 係真正 load-bearing。
- main-process 功能有 37 個測試,喺 `design/packages/app/src/main/pages/hosting.test.ts` 同 `ipc.test.ts`,對住一個假嘅 process runner。**冇測試會 spawn 真嘅 `git`、真嘅 `gh`,或者行網絡**——係刻意嘅:值得測嘅 case(`gh` 唔存在、`gh` 未登入、branch 係人哋寫嘅、push 咗但 GitHub 唔認、build 出錯、URL 回 404)喺一部一切正常嘅機上根本整唔出嚟。
- renderer 嗰半有 32 個測試,喺 `design/packages/ui/src/components/pages/`,包括 mount 起成個畫面:disabled 嘅掣同佢寫明嘅原因、foreign branch 嘅拒絕就算剔咗 acknowledgement 都企得住、render list 經 shared search field 過濾,同埋 super-confirmation gate 真係企喺個掣同刪除之間。
- 個畫面喺 screenshot harness 係 **required** surface,開唔到就直接 fail,唔會靜靜記低一個空白。

**未**證明嘅:desktop 發佈路徑從未由本應用程式對住真 GitHub 帳號 end-to-end 行過。每一步都有 unit test(假 process runner),佢依賴嘅 static-host 準備亦對住真發佈 site 驗證過,但 `gh repo create` → orphan push → `POST /pages` → poll → fetch 呢條 sequence 未曾由本應用程式喺真機對住 github.com 執行過。行過之前,請當呢個功能係「實現咗但未驗證」,要做啲乜見 `HANDOFF.md`。

```
pnpm exec vitest run packages/app/src/main/pages packages/ui/src/components/pages
```

### 相關文章

- [Rendering a world in GitHub Actions](./render-in-actions.md)——另一條通往 Pages copy 嘅路,由 runner render、merge job 準備個 site。
- [Super confirmation](./super-confirmation.md)——落架前嗰道閘。
- [Large worlds and rendered maps](./large-worlds.md)——地圖超過限制時點算。
