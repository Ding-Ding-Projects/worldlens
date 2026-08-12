# Rendering a world that lives in a private repository

Rendering a large Minecraft world takes hours of CPU. GitHub gives public repositories
unlimited standard-runner minutes and charges private ones by the minute, so the obvious
thing to want is to run the work on the public side while the world itself stays private.

This is how that is done here, what it actually protects, and — the part worth reading
before you decide — what it does not.

The public render path is documented separately in
[render-in-actions.md](./render-in-actions.md). Everything there about _how a world is
split and put back together_ applies here unchanged. This document is only about the
things that are different because the world is private.

---

## The short version

1. On the private side you tar the world, encrypt it, and attach the encrypted pieces to
   a release in your private repository.
2. You run **Encrypted render** on this public repository. It fetches those pieces with a
   token you gave it, verifies them, decrypts them onto the runner, renders, encrypts the
   result, and attaches it to a new release **on your private repository**.
3. Nothing rendered is kept here. No release is created here. No world or map data is
   ever uploaded as an Actions artifact.

Every name that appears in the public run — the payload files, the release tags — is a
keyed hash. Somebody reading the run learns that a render happened and roughly how large
the world was. They do not learn whose it is, what it is called, or where it lives.

---

## The trust boundary, stated honestly

This is the section to read twice.

### What the public runner can see while it works

**The decrypted world, in full, in memory and on its disk, for the duration of the job.**
There is no way around this. Rendering means reading every chunk and turning it into
tiles; a renderer cannot work on ciphertext. The encryption protects the world _in
transit_ and _at rest on the public side's storage_. It does not protect it from the
machine doing the rendering, because that machine has to be handed the key.

Concretely, during a run the runner holds:

- the encryption key, in the process environment;
- the decrypted world, unpacked on disk;
- the token that can read from and write to your private repository;
- the name of your private repository.

### A public runner is still someone else's machine

GitHub-hosted runners are ephemeral virtual machines, destroyed after the job. That is a
real property and it is why this arrangement is reasonable. It is not the same as a
machine you control:

- GitHub operates it. Their platform, their hypervisor, their storage.
- Anyone who can cause a workflow to run on this repository can run code on a runner. On
  a public repository that is a larger set of people than you might expect, which is why
  this workflow is `workflow_dispatch` only and never `pull_request`. **Do not add a
  `pull_request` trigger to it**, and do not add one to any workflow that can read these
  secrets.
- A fork's pull request cannot read these secrets. That is GitHub's behaviour, not
  something this file arranges, and it is worth verifying rather than assuming if the
  world matters to you.
- The workflow's logs are public. This is why identifiers are hashed and why the map id
  is fixed rather than taken as an input: an input appears in the log verbatim.

### What is never written down publicly

- The world, in any readable form.
- The rendered map.
- The name of the private repository, the world, or the release tags — all hashed or held
  in secrets.
- The shard plan, which describes the world's extent in blocks.

### What the public side does reveal

Being precise about this is the point of the section:

- **That a run happened, and when.** Public workflow runs are public.
- **Roughly how large the world is.** The number of shards is a job matrix, and a matrix
  is visible. Sixty-four jobs means a big world; one job means a small one. The exact
  block extents are sealed, but the order of magnitude is not.
- **How long it took**, which is the same information again from a different angle.
- **That the person running it has a private repository**, though not which one.

If the _existence_ of the world is itself the secret, this arrangement does not deliver
that, and no amount of encryption in it would.

### What would break it

- Putting a real name in a workflow input, a job name, or an `echo`. Inputs and job names
  are rendered into the public run's page.
- Adding an Actions artifact that carries world or map data. See below.
- A token with more access than it needs. Give the workflow a token scoped to the one
  private repository, with the minimum that lets it read a release and create one.
- Reusing the encryption key across worlds you would not want linked. Two payloads under
  one key are visibly related to anyone holding it.

---

## Why release assets and not Actions artifacts

The public path in `design/packages/render-actions/src/merge/` passes each shard's output
between jobs as an Actions artifact: the render jobs upload `shard-<n>`, and the merge job
downloads `shard-*` and combines them. That is the natural way to move data between jobs
and it is the right choice there, because a public world's tiles are not secret.

**Artifacts cannot be used here.** An artifact belongs to a workflow run, and on a public
repository a run's artifacts are downloadable by anyone who can see the repository — no
authentication, no permission. Uploading a private world's tiles as an artifact would
publish them as surely as committing them.

So the private path uses a different transport for the same data:

|                       | public path                            | private path                                                                              |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| world to render jobs  | one artifact, downloaded by each shard | encrypted release assets on the private repository, downloaded and verified by each shard |
| shard output to merge | artifact per shard                     | encrypted release assets on a temporary staging release                                   |
| shard plan            | artifact                               | encrypted, staged with everything else                                                    |
| renderer jar          | artifact                               | **artifact** — it is built from vendored public sources and holds no world data           |
| final map             | artifact on this repository, or Pages  | encrypted release on the private repository                                               |

The staging release is a prerelease created at the start of a run and deleted at the end,
including when the run fails. Its tag is derived from the run id as well as the label, so
two runs of the same world cannot collide and delete each other's assets halfway through.

This costs more than artifacts do: each shard downloads the world again from the private
repository rather than from GitHub's artifact store, so a thirty-way split fetches the
world thirty times. That is the price of the arrangement, and it is stated here rather
than hidden because on a very large world it is the dominant cost.

---

## The encryption

**AES-256-GCM.** The key is 32 bytes, lives only in an Actions secret, and is never
written into any file in either repository.

The authentication tag is the point rather than a detail. Unauthenticated encryption
would let a payload be altered in transit and still decrypt — into _different bytes_,
which would then be fed to a renderer as though they were a world. Every failure to
authenticate stops the run instead.

A payload is cut into parts of **50 MB**, each sealed on its own with:

- **its own random 96-bit IV**, never a counter derived from the index, because reusing an
  IV under one key is the single mistake that breaks GCM outright;
- **associated data binding it to its place** — the payload's opaque id, the part's index
  and its length — so swapping part 3 for part 7, or replaying part 3 of an older payload,
  breaks the tag rather than reassembling into something plausible;
- **its header stored alongside the ciphertext and authenticated**, so rewriting the
  header to match altered content fails too.

A sealed **manifest** accompanies the parts and records the count, each part's digest and
a digest of the whole. Per-part authentication proves each part is genuine; only the
manifest can prove that _all of them are here, in order, and belong to the same payload_.
That distinction is not academic — a dropped upload, a retry that leaves an older part
behind, and two runs writing to one place all produce sets of perfectly genuine parts that
do not belong together.

The manifest is written last, so a half-finished upload has no manifest and is refused
rather than mistaken for a complete payload.

New payload ids and associated-data bindings use the `worldlens/private-transport`
contexts. The reader also derives the former `material-bluemap/private-transport`
identifier and tries the former authenticated bindings when an existing directory holds
that generation's manifest. Sealing and workflow identifier output always use Worldlens;
the old contexts are read-only compatibility so an encrypted payload is not stranded by
the product rename.

> **50 MB is this transport's part size and nothing else.** It is not the release-asset
> size limit used when publishing a large _public_ world, which is a different problem
> with a much larger number. Raising this one to match that one would put gigabyte
> buffers in every job on this path for no benefit.

### Everything fails closed

There is no path in this code that carries on with something unencrypted. Each of the
following stops the run with a message saying what happened:

| what went wrong                                           | what happens                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| the key secret is not set                                 | refused before anything is fetched, naming the variable       |
| the key is not 32 bytes                                   | refused, without printing the key or its length               |
| a required secret is not set                              | refused in the first job, naming which                        |
| a part fails its authentication tag                       | refused; nothing is written                                   |
| a part decrypts but is not the one the manifest describes | refused                                                       |
| a part is missing                                         | refused, naming which of how many                             |
| the manifest is absent                                    | refused as an incomplete payload                              |
| the reassembled payload's digest does not match           | refused, and the partial output deleted                       |
| the input to seal is empty                                | refused, rather than producing a payload that renders nothing |

The partial-output deletion matters more than it looks. A three-quarters-written world
tar looks exactly like a world tar to every later step.

---

## Setting it up

### 1. Generate a key

```sh
openssl rand -hex 32
```

Keep it somewhere you will still have it in six months: it is the only thing that can open
the rendered map that comes back.

### 2. Add the secrets to this repository

| secret                     | what it is                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `PRIVATE_WORLD_KEY`        | the 32-byte key, as 64 hex characters or base64                                              |
| `PRIVATE_WORLD_REPO`       | `owner/name` of the private repository                                                       |
| `PRIVATE_WORLD_TOKEN`      | a token that can read releases from and create releases on that repository, and nothing else |
| `PRIVATE_WORLD_LABEL`      | any string. Every opaque identifier is derived from it. It never appears in a log            |
| `PRIVATE_WORLD_SOURCE_TAG` | the release tag in the private repository holding the sealed world                           |

Secrets are masked in logs, but do not rely on masking for the tag: derive an opaque one
with the CLI below and use that.

### 3. Seal the world on the private side

```sh
cd design
pnpm --filter "@worldlens/render-actions..." run build

export PRIVATE_WORLD_KEY=<the key>
export PRIVATE_WORLD_LABEL=<the label>

tar -cf world.tar -C /path/to/saves my-world
node packages/render-actions/dist/private/cli.js seal \
  --in world.tar \
  --out sealed \
  --label-env PRIVATE_WORLD_LABEL \
  --suffix source
```

That writes `sealed/<hash>.0000.bin`, `sealed/<hash>.0001.bin`, … and
`sealed/<hash>.manifest.bin`. Attach them to a release on the private repository:

```sh
tag=$(node packages/render-actions/dist/private/cli.js id \
  --label-env PRIVATE_WORLD_LABEL --suffix "source-release")
gh release create "$tag" --repo <owner/name> --title "World" --notes "Encrypted world."
gh release upload "$tag" --repo <owner/name> sealed/*
```

Set `PRIVATE_WORLD_SOURCE_TAG` to that `$tag`.

### 4. Run it

Actions → **Encrypted render** → Run workflow. The only inputs are the dimension and the
two sizing knobs; nothing that names anything.

### 5. Open the result

The run creates a release on your private repository whose tag begins `r-`. Download its
assets and open them with the same key:

```sh
gh release download <tag> --repo <owner/name> --dir sealed-map
node packages/render-actions/dist/private/cli.js open \
  --in sealed-map \
  --out map.tar \
  --label-env PRIVATE_WORLD_LABEL \
  --suffix "release|<the run id from the release notes>"
mkdir -p map && tar -xf map.tar -C map
```

Serve `map/` over HTTP. Opening `index.html` from the filesystem will not work, because
the webapp fetches its tiles.

---

## The CLI

`design/packages/render-actions/dist/private/cli.js`, kept deliberately separate from the
main `cli.js`: everything in it handles a key, and a separate entry point means the public
render path cannot grow a flag that takes one.

| command | what it does                                                                         |
| ------- | ------------------------------------------------------------------------------------ |
| `id`    | derives an opaque identifier from the label, without touching any data               |
| `seal`  | encrypts a file into parts plus a manifest                                           |
| `open`  | verifies and decrypts current or legacy-generation parts back into the original file |
| `check` | proves the key and the required secrets are present before anything runs             |

The label is passed as `--label-env <VAR>` rather than `--label <text>` so that it never
appears in a process list, which on a shared runner is readable. `--suffix` extends it
(`shard|3`, `release|<run id>`) so one secret label yields every identifier a run needs.

---

## Things this does not do

- **It does not hide that a render happened, or roughly how big the world is.** See the
  trust boundary above.
- **It does not protect the world from the machine rendering it.** It cannot.
- **It does not publish to Pages.** Publishing a private world's map to this repository's
  Pages site would make it public, which is the opposite of the point. If you want it on
  the web, serve the downloaded map yourself, behind whatever authentication you want.
- **It does not manage key rotation.** A world sealed with one key can only be opened with
  that key. If you rotate, re-seal.
- **It does not resume.** A failed run is a run to start again. The public path's resume
  machinery is not wired up here.

---

## Related

- [Rendering a world in GitHub Actions](./render-in-actions.md) — how the split, the merge
  and the verification work. All of it applies here.
- `design/packages/render-actions/src/private/` — the transport, with its tests.
- `.github/workflows/render-private-world.yml` — the workflow itself, commented.

## 廣東話

### 為住喺 private repository 嘅世界做 render (Encrypted render)

render 一個大嘅 Minecraft 世界要用幾個鐘 CPU。GitHub 畀 public repository 無限量嘅 standard-runner 分鐘,private 嘅就逐分鐘收費,所以自然會想:計算喺 public 嗰邊行,但世界本身keep住 private。呢份文講嘅就係呢度點做、實際保護到啲乜,同埋——決定用之前值得讀嘅一part——保護唔到啲乜。

public render 路徑另有文件 [render-in-actions.md](./render-in-actions.md);嗰度講嘅「世界點樣切開再砌返埋」喺呢度原封不動適用。呢份文只講因為世界係 private 而唔同咗嘅嘢。

### 簡短版

1. 喺 private 嗰邊,你將個世界 tar 起、加密,再將加密咗嘅 pieces attach 上你 private repository 嘅一個 release。
2. 喺呢個 public repository 行 **Encrypted render**。佢用你畀嘅 token 攞返啲 pieces、驗證、喺 runner 上解密、render、將結果加密,再 attach 上**你 private repository** 嘅一個新 release。
3. render 出嚟嘅嘢一啲都唔會留喺呢度,呢度唔會建立任何 release,世界或者地圖數據永遠唔會以 Actions artifact 形式上載。

public run 入面出現嘅每一個名——payload 檔案、release tags——都係 keyed hash。睇個 run 嘅人知道有一次 render 發生咗,同埋個世界大概幾大;佢哋唔知係邊個嘅、叫咩名、住喺邊。

### Trust boundary,老老實實咁講

呢一節值得讀兩次。

#### public runner 做嘢期間見到啲乜

**成個解密咗嘅世界,喺記憶體同磁碟上,job 行幾耐就有幾耐。** 呢一點冇得避:render 即係讀每一個 chunk 再變 tiles,renderer 冇可能對住 ciphertext 做嘢。加密保護嘅係世界喺 _in transit_ 同 _喺 public 嗰邊 storage 上 at rest_ 嘅狀態;佢保護唔到部做 render 嘅機,因為條 key 一定要交畀嗰部機。具體嚟講,run 期間 runner 手上有:process environment 入面嘅 encryption key;解壓咗喺磁碟上嘅世界;可以讀寫你 private repository 嘅 token;同埋你 private repository 嘅名。

#### public runner 始終係人哋部機

GitHub-hosted runners 係短命嘅 virtual machine,job 完就銷毀。呢個係真實嘅特性,亦係成個安排合理嘅原因,但佢同你自己控制嘅機唔係同一回事:

- 部機由 GitHub 營運:佢哋嘅 platform、hypervisor、storage。
- 任何有能力令呢個 repository 行 workflow 嘅人,都可以喺 runner 上行 code。喺 public repository 呢班人比你想像中多,所以呢條 workflow 只用 `workflow_dispatch`,永不用 `pull_request`。**唔好加 `pull_request` trigger 落去**,亦唔好加落任何讀得到呢啲 secrets 嘅 workflow。
- fork 嘅 pull request 讀唔到呢啲 secrets——嗰個係 GitHub 嘅行為,唔係呢份檔案安排嘅;個世界對你重要嘅話,值得自己驗證而唔係assume。
- workflow 嘅 log 係公開嘅。所以 identifiers 全部 hash 過,map id 亦係寫死而唔係當 input 攞——input 會原文出現喺 log。

#### 咩嘢永遠唔會公開寫低

以任何可讀形式存在嘅世界;render 咗嘅地圖;private repository、世界、release tags 嘅名(全部 hash 咗或者收埋喺 secrets);描述世界 block 範圍嘅 shard plan。

#### public 嗰邊會透露啲乜

講得精確就係呢節嘅重點:**有一次 run 發生咗,同埋幾時**——public workflow run 係公開嘅;**個世界大概幾大**——shard 數目係 job matrix,而 matrix 係見得到嘅:六十四個 job 即係大世界,一個 job 即係細;**行咗幾耐**,同一樣資訊嘅另一個角度;**行嘅人有一個 private repository**,但唔知係邊個。如果個世界嘅_存在_本身就係秘密,呢個安排交唔到貨,幾多加密都冇用。

#### 咩嘢會整穿佢

- 將真名放入 workflow input、job name 或者一句 `echo`——inputs 同 job names 會 render 上 public run 嘅頁面。
- 加一個載住世界或者地圖數據嘅 Actions artifact(見下面)。
- token 權限多過需要——畀 workflow 一個只 scope 到嗰一個 private repository、只夠讀 release 同建立 release 嘅 token。
- 喺你唔想被連繫嘅世界之間重用同一條 encryption key——一條 key 下兩個 payload,揸住條 key 嘅人一睇就知有關連。

### 點解用 release assets 而唔用 Actions artifacts

`design/packages/render-actions/src/merge/` 嘅 public 路徑用 Actions artifact 喺 job 之間傳每個 shard 嘅 output:render jobs 上載 `shard-<n>`,merge job 下載 `shard-*` 再合併。嗰度咁做係啱嘅,因為 public 世界嘅 tiles 唔係秘密。

**呢度用唔到 artifacts。** artifact 屬於一個 workflow run,而喺 public repository,任何見到個 repository 嘅人都下載得到 run 嘅 artifacts——唔使認證、唔使權限。將 private 世界嘅 tiles 上載做 artifact,同直接 commit 出去公開冇分別。

所以 private 路徑用另一種 transport 運同一批數據:世界去 render jobs——private repository 上加密嘅 release assets,每個 shard 自己下載同驗證;shard output 去 merge——臨時 staging release 上加密嘅 release assets;shard plan——加密,同其他嘢一齊 stage;renderer jar——照用 **artifact**,因為佢由 vendored public sources build 出嚟,唔載任何世界數據;最終地圖——private repository 上嘅加密 release。

staging release 係 run 開始時建立嘅 prerelease,run 結束時刪走,包括 run fail 嗰陣。佢個 tag 由 run id 加 label derive 出嚟,所以同一個世界嘅兩次 run 唔會相撞、唔會中途刪咗對方嘅 assets。

呢個做法貴過 artifacts:每個 shard 都要由 private repository 重新下載成個世界,切三十份即係攞三十次。呢個係成個安排嘅代價,寫喺度而唔係收埋,因為喺極大嘅世界上呢個係最大嘅成本。

### 加密

**AES-256-GCM。** 條 key 係 32 bytes,只住喺一個 Actions secret 入面,永遠唔會寫入兩邊任何 repository 嘅任何檔案。

authentication tag 係重點而唔係細節:冇認證嘅加密,payload 喺途中被改咗照樣解密得到——解出_唔同嘅 bytes_,然後被當成世界餵畀 renderer。任何一次認證失敗都會即刻停個 run。

payload 切成 **50 MB** 一份,每份獨立 seal:

- **每份有自己隨機嘅 96-bit IV**,永不用由 index derive 嘅 counter,因為同一條 key 下重用 IV 係唯一一個會直接玩完 GCM 嘅錯;
- **associated data 將每份綁定喺佢嘅位置**——payload 嘅 opaque id、份數 index 同長度——所以將第 3 份換成第 7 份,或者 replay 舊 payload 嘅第 3 份,只會整爛個 tag,唔會砌出貌似合理嘅嘢;
- **header 同 ciphertext 一齊儲存並且經過認證**,所以改寫 header 去遷就改咗嘅內容一樣 fail。

parts 旁邊有一個 seal 咗嘅 **manifest**,記低份數、每份嘅 digest 同整體嘅 digest。逐份認證證明每一份係真;只有 manifest 先證明到_全部都齊、次序啱、屬於同一個 payload_。呢個分別唔係學術嘢——upload 斷咗、retry 留低咗一份舊嘅、兩個 run 寫埋同一個位,三樣都會產生一批「每份都真但夾埋唔啱」嘅 parts。manifest 係最後先寫,所以寫到一半嘅 upload 冇 manifest,會被當成不完整 payload 拒絕,唔會被誤認做齊全。

新嘅 payload id 同 associated-data binding 用 `worldlens/private-transport` context。reader 亦會 derive 舊嘅 `material-bluemap/private-transport` identifier,遇到現存目錄載住嗰一代嘅 manifest 時會試舊嘅 authenticated bindings。seal 同 workflow identifier 輸出永遠用 Worldlens;舊 context 只係唯讀兼容,令已加密嘅 payload 唔會因為產品改名而變孤兒。

留意:**50 MB 係呢個 transport 嘅 part size,唔係其他嘢。** 佢唔係發佈大型 _public_ 世界時用嘅 release-asset size limit——嗰個係另一個問題,數字大好多。將呢個加大去夾嗰個,只會令呢條路上每個 job 都揸住 gigabyte 級嘅 buffer,冇任何好處。

#### 全部 fail closed

呢套 code 冇任何一條路會攞住未加密嘅嘢繼續行。以下每一樣都會停個 run 並講明發生咗咩事:key secret 未設(fetch 任何嘢之前就拒絕,講明變數名);key 唔係 32 bytes(拒絕,唔會印條 key 或者佢嘅長度);必要 secret 未設(第一個 job 就拒絕,講明邊個);某份 fail authentication tag(拒絕,乜都唔寫);某份解到密但唔係 manifest 描述嗰份(拒絕);缺咗一份(拒絕,講明幾多份中缺邊份);manifest 唔存在(當不完整 payload 拒絕);重組後 payload 嘅 digest 唔 match(拒絕,並刪走部分輸出);seal 嘅 input 係空(拒絕,唔會產出一個 render 唔到嘢嘅 payload)。

刪走部分輸出呢一步重要過佢個樣:寫咗四分三嘅 world tar,喺之後每一步眼中同完整嘅 world tar 一模一樣。

### 設置

#### 1. 生成一條 key

```sh
openssl rand -hex 32
```

放喺六個月後仲搵得返嘅地方:佢係唯一開得到 render 返嚟嗰個地圖嘅嘢。

#### 2. 喺呢個 repository 加 secrets

`PRIVATE_WORLD_KEY`——32-byte key,64 個 hex 字符或者 base64;`PRIVATE_WORLD_REPO`——private repository 嘅 `owner/name`;`PRIVATE_WORLD_TOKEN`——一個可以喺嗰個 repository 讀 release 同建立 release、除此之外乜都做唔到嘅 token;`PRIVATE_WORLD_LABEL`——任意字串,所有 opaque identifier 都由佢 derive,永不出現喺 log;`PRIVATE_WORLD_SOURCE_TAG`——private repository 上載住 seal 咗嘅世界嗰個 release tag。

secrets 喺 log 會被 mask,但 tag 唔好靠 masking:用下面個 CLI derive 一個 opaque tag 嚟用。

#### 3. 喺 private 嗰邊 seal 個世界

```sh
cd design
pnpm --filter "@worldlens/render-actions..." run build

export PRIVATE_WORLD_KEY=<the key>
export PRIVATE_WORLD_LABEL=<the label>

tar -cf world.tar -C /path/to/saves my-world
node packages/render-actions/dist/private/cli.js seal \
  --in world.tar \
  --out sealed \
  --label-env PRIVATE_WORLD_LABEL \
  --suffix source
```

會寫出 `sealed/<hash>.0000.bin`、`sealed/<hash>.0001.bin`……同 `sealed/<hash>.manifest.bin`。將佢哋 attach 上 private repository 嘅一個 release:

```sh
tag=$(node packages/render-actions/dist/private/cli.js id \
  --label-env PRIVATE_WORLD_LABEL --suffix "source-release")
gh release create "$tag" --repo <owner/name> --title "World" --notes "Encrypted world."
gh release upload "$tag" --repo <owner/name> sealed/*
```

將 `PRIVATE_WORLD_SOURCE_TAG` 設做嗰個 `$tag`。

#### 4. 行

Actions → **Encrypted render** → Run workflow。輸入只有 dimension 同兩個 sizing 掣,冇任何會講出名嘅嘢。

#### 5. 開結果

個 run 會喺你嘅 private repository 建立一個 tag 以 `r-` 開頭嘅 release。下載佢嘅 assets,用同一條 key 打開:

```sh
gh release download <tag> --repo <owner/name> --dir sealed-map
node packages/render-actions/dist/private/cli.js open \
  --in sealed-map \
  --out map.tar \
  --label-env PRIVATE_WORLD_LABEL \
  --suffix "release|<the run id from the release notes>"
mkdir -p map && tar -xf map.tar -C map
```

用 HTTP serve `map/`。直接由 filesystem 開 `index.html` 唔會 work,因為個 webapp 要 fetch 佢啲 tiles。

### 個 CLI

`design/packages/render-actions/dist/private/cli.js`,刻意同主 `cli.js` 分開:佢入面樣樣嘢都掂到條 key,分開 entry point 即係 public render 路徑冇可能生出一個收 key 嘅 flag。四個 command:`id` 由 label derive opaque identifier,唔掂任何數據;`seal` 將檔案加密成 parts 加 manifest;`open` 驗證同解密現行或者舊一代嘅 parts,還原原本檔案;`check` 喺任何嘢行之前證明條 key 同必要 secrets 都在場。

label 用 `--label-env <VAR>` 傳而唔係 `--label <text>`,咁佢就唔會出現喺 process list——喺 shared runner 上 process list 係讀得到嘅。`--suffix` 延伸個 label(`shard|3`、`release|<run id>`),一個 secret label 就 derive 到一次 run 需要嘅全部 identifier。

### 呢樣嘢唔做嘅事

- **唔會隱藏「有 render 發生過」或者世界大概幾大。** 見上面 trust boundary。
- **唔會保護個世界唔畀 render 佢嗰部機睇。** 冇可能做到。
- **唔會發佈上 Pages。** 將 private 世界嘅地圖發上呢個 repository 嘅 Pages site 即係公開咗,同成件事嘅目的相反。想放上網,自己 serve 下載返嚟嘅地圖,加你想要嘅認證。
- **唔會管理 key rotation。** 用一條 key seal 嘅世界只有嗰條 key 開到;rotate 就要 re-seal。
- **唔會 resume。** fail 咗嘅 run 就係要由頭再行嘅 run;public 路徑嘅 resume 機制冇接落嚟呢度。

### 相關

- [Rendering a world in GitHub Actions](./render-in-actions.md)——split、merge 同 verification 點做,全部喺度適用。
- `design/packages/render-actions/src/private/`——個 transport,連測試。
- `.github/workflows/render-private-world.yml`——workflow 本身,有註解。
