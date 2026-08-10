# Worlds from somebody else's release

A world does not have to live on this computer or in this repository. It can be a release
asset in **any public GitHub repository**, and it can be published in pieces because it is far too
large to be one file.

Both of those were true before and neither worked. `gh release download` without `--repo` can only
read a release in the repository the run is happening in, and the only split layout anything here
understood was this project's own `<name>.parts.json`. A 6.6 GB world published as four
`.zip.part.NNNN` files beside a `SHA256SUMS` — the ordinary output of a backup script — read as five
unrelated files, none of which is a world.

**Contents**

- [What a world source looks like](#what-a-world-source-looks-like)
- [The two split layouts](#the-two-split-layouts)
- [Using one in the desktop application](#using-one-in-the-desktop-application)
- [Using one in GitHub Actions](#using-one-in-github-actions)
- [What is verified, and what happens when a check fails](#what-is-verified-and-what-happens-when-a-check-fails)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## What a world source looks like

Any of these names the same repository, and the last one names a particular release in it:

```
cafepromenade/Andyville-World
github.com/cafepromenade/Andyville-World
https://github.com/cafepromenade/Andyville-World
https://github.com/cafepromenade/Andyville-World.git
https://github.com/cafepromenade/Andyville-World/releases/tag/andyville-backup-20260804-160001
```

The last one carries a tag, and carrying it through is the point: somebody who pasted a link to
_that_ release means that release, and quietly fetching `latest` instead would hand them a
different world with nothing on screen to say so.

Everything else is refused rather than encoded and hoped about. `owner` and `repo` end up in a
GitHub API path, so both are checked against GitHub's own name grammar — no `..`, no leading
hyphen, no forty-character login — and a link to another forge is refused rather than treated as
though it were GitHub, because its API is not this one.

## The two split layouts

A release asset is capped at 2 GB, so any large world arrives in pieces. There are two ways the
world publishes those pieces and this project reads both.

**A parts manifest**, which is what [large worlds](./large-worlds.md) describes and what this
project itself publishes:

```
test-world.zip.001          1.70 GB
test-world.zip.002          1.70 GB
test-world.zip.parts.json     684 B
```

**A checksum list**, which is what `sha256sum > SHA256SUMS` produces and what most of the world
actually does:

```
andyville-world-20260804-160001.zip.part.0000   1.70 GB
andyville-world-20260804-160001.zip.part.0001   1.70 GB
andyville-world-20260804-160001.zip.part.0002   1.70 GB
andyville-world-20260804-160001.zip.part.0003   1.52 GB
SHA256SUMS                                        448 B
```

`<name>.part.0000`, `<name>.part0000` and `<name>.001` are all read as the same thing, and the
numbering may start at 0 or at 1 — both are published and neither is wrong.

**The manifest wins wherever a release carries both**, because it publishes a digest for the whole
archive as well as one per part, and the checksum list only publishes the per-part ones. A release
that has both is read the stronger way.

A gap in the numbering is refused, by name, before anything is downloaded. That is not tidiness:
parts are concatenated in index order, so a missing middle part does not produce an error, it
produces a **shorter archive that still unzips** and a world that opens and corrupts later, three
layers away from anything that would point at the download.

## Using one in the desktop application

The map wizard's world step's release downloader (`ReleaseDownloads.vue`) reaches this
through the downloads bridge's `discoverRelease` and `startDownload`, which the preload
answers from `worldsource:discover` and `worldsource:fetch` rather than from
`download:discover`/`download:start`. That is the whole of the wiring: the panel's own
contract to the interface - `owner`, `repo`, an optional `tag`, and a `split`/`parts`/`bytes`
summary of what a release offers - never changed, so a manifest-shaped download from this
project's own releases keeps behaving exactly as it always did. What changed is what answers
it, and a checksum-list release from any public repository is understood the same way a
manifest-shaped one always was. `main/preload/worldSourceBridge.ts` is the seam that turns a
source's `kind` into the panel's `split` flag; see its own test for the mapping.

An optional field above the owner/repository/tag fields calls `worldsource:parse` on every
keystroke and writes what it resolves to into those three - the "paste a link" behaviour
described above. `worldsource:cancel` and `worldsource:active` are used for the same reason
`discoverRelease`/`startDownload` are: they are the union of what the checksum-list fetcher's
own in-flight map and the shared release downloader each have running, and asking only
`download:cancel`/`download:active` would silently fail to stop or list a checksum-list
download. `download:list` is untouched, because both paths write the same `DownloadRecord`
shape into the same on-disk workspace layout, so it already reads a checksum-list download
back with no change of its own.

Under the hood, `main/worldsource/` is deliberately thin. Everything already solved is reused:

| What                                                                  | Where it comes from        |
| --------------------------------------------------------------------- | -------------------------- |
| the release lookup, the token decision, the CDN-versus-API URL choice | `main/download/release.ts` |
| the resumable ranged transfer                                         | `main/download/http.ts`    |
| the safe unpack                                                       | `main/download/extract.ts` |
| the join, with its per-part re-check and its resume                   | `@worldlens/parts`         |
| the progress events, the failure codes, the on-disk workspace         | `main/download/`           |

A manifest-shaped or unsplit download is handed straight to the existing `ReleaseDownloader`, which
already does it and already does it better. The genuinely new path is the checksum-list one, and it
runs in this order:

1. read the release, from whichever repository was named;
2. fetch the checksum list first — a few hundred bytes, and the only thing that says what the parts
   are supposed to be;
3. fetch every part, several at a time, each with an HTTP `Range` request continuing from whatever
   is already on disk;
4. hash every part in join order, checking each against its published digest and deriving the
   whole-archive digest in the same pass;
5. join, which re-checks each part as it is appended and then checks the whole;
6. unpack.

Progress, cancellation and the download list are the **same ones a download from this repository
uses**. Events are broadcast on the download channel rather than on a channel of this feature's own,
so a world fetched from a stranger's repository appears in the same list, moves the same bar and is
stopped by the same button. A second event channel would mean a second list, and a download in one
of them would be a download the other could not see or cancel.

## Using one in GitHub Actions

`Render world` takes a `world-repository` input beside `world`. Leave it blank for this repository;
set it to `owner/name` for anybody else's:

| Input              | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| `world-source`     | `release-asset`                                                        |
| `world-repository` | `cafepromenade/Andyville-World`                                        |
| `world`            | `andyville-backup-20260804-160001/andyville-world-20260804-160001.zip` |

The `world` field is still `asset` or `tag/asset`; a release asset's name cannot contain a slash, so
splitting on the **last** one is unambiguous and keeps a tag with slashes in it (`release/1.4`)
working. For a split archive, name the **base** archive (`…zip`), not one of its parts — the run
downloads everything whose name begins with it, which is the whole file when it was published whole
and every part when it was not.

The run then does what the application does: prefers a `.parts.json`, otherwise verifies every part
against `SHA256SUMS` with coreutils' own `sha256sum --check --strict`, derives a manifest from the
verified parts, and joins with `scripts/join-parts.mjs` — the same joiner the application runs and
the same one a person runs by hand. There is exactly one joining implementation in this repository
and this feature did not add a second.

> [!NOTE]
> Disk, measured rather than assumed. An earlier version of this note said a hosted runner "does not
> have room for all three at once", meaning the parts, the joined archive and the unpacked tree. That
> was wrong, and it was wrong in the direction that discourages people from trying.
>
> A standard runner reports **145 GB total with 87 GB free before anything is cleaned up**. Rendering
> the 6.6 GB Andyville world peaked around 21 GB above baseline while holding all three copies, and
> finished with 104 GB still free. The parts and the archive are still deleted as soon as the world is
> unpacked, because there is no reason to carry them — but that is tidiness, not necessity.
>
> Where the ceiling actually is has **not** been established: no run has been pushed until it ran out.
> 6.6 GB is not close to it.

The workflow input cap is also a real limit: GitHub documents **ten** `workflow_dispatch` inputs and
`world-repository` is the tenth. An eleventh means folding two existing ones together first.

## What is verified, and what happens when a check fails

| Layout              | Per-part digest    | Whole-archive digest                          |
| ------------------- | ------------------ | --------------------------------------------- |
| `<name>.parts.json` | published, checked | published, checked                            |
| `SHA256SUMS`        | published, checked | **derived locally**, checked against the join |
| a single asset      | none published     | recorded, not checked                         |

The derived digest is worth stating precisely, because calling it "verification" would be a claim
the code cannot support. It is computed from the parts _after_ they have been checked against the
release's own list, and the join is then made to reproduce it. So it proves the join wrote what it
read — a truncated write, a full disk, a copy that stopped halfway — and proves nothing at all about
whether the publisher's file was right. **The per-part digests are the only external authority**, and
they are checked before anything is joined.

A part that fails its digest is named, with both digests, so one file can be fetched again instead
of all of them. It is deleted first and never resumed into: bytes that failed a check are the one
thing on disk that must not be appended to. It is then re-fetched once; if the second copy is wrong
too, the download fails.

A part the checksum list never mentions is a **failure**, not a pass. An absent expectation is not a
satisfied one, and a reader that treats it as one joins unverified bytes into somebody's world.

A **failure** deletes the joined archive and the unpacked tree — the two things that look finished to
whatever comes next — and keeps the parts, which are individually checksummed and safe to resume
from. A **cancellation** keeps everything, including the half-written part; that is the point of a
resumable download, and a cancellation is not a failure and is never shown as one.

## Failure modes

| What happened                                        | What is reported                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| the text is not a repository                         | the field simply stays invalid; nothing is requested                    |
| the repository or release does not exist             | `release-not-found`, with the URL that was asked for                    |
| the release has nothing by that name                 | `asset-not-found`, listing what it does have                            |
| the release offers several worlds and none was named | refused, listing them, rather than guessing                             |
| the split has a gap in it                            | `manifest-invalid`, naming the two parts it jumps between               |
| `SHA256SUMS` has a line that is not a digest         | `manifest-invalid`; the file is refused whole rather than partly parsed |
| a part does not match its digest                     | `integrity-failed`, naming the part and both digests                    |
| the download folder cannot be written                | `storage-unwritable`, pointing at the storage setting                   |
| the person cancelled                                 | `cancelled`, which is not an error                                      |

## Security notes

- **A public release needs no token and must never demand one.** The whole point of publishing a
  world is that anybody can fetch it. `GH_TOKEN` is used when it is there — a private repository and
  a rate-limited runner both need it — and when there is none the browser download URL is used
  instead, which needs no authentication and is not subject to the unauthenticated API's
  sixty-requests-an-hour limit. A twenty-part world would otherwise spend a third of that limit on
  one download.
- **A token never reaches a CDN.** With a token the API asset URL is used, and undici drops the
  `Authorization` header on the cross-origin redirect to storage.
- **Every name from a release is treated as hostile.** A `SHA256SUMS` line naming
  `../../../.ssh/authorized_keys`, or a part name with a separator in it, is refused rather than
  resolved: every one of those names is joined against the directory the parts were downloaded into.
- **Owner and repository are validated before they are put in an API path**, not escaped afterwards.
- **Archives are unpacked through the existing safe extractor**, which refuses an entry that would
  land outside the destination.
- The application never executes anything out of a downloaded world.

## Verification

`design/packages/app/src/main/worldsource/` has 51 tests, and not one of them needs the network, a
token or a GitHub account:

| File                 | What it proves                                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repository.test.ts` | every URL spelling reads to the same pair; a tag in a release link survives; names GitHub could not have are refused                                                                                                                                                             |
| `checksums.test.ts`  | the **real** Andyville `SHA256SUMS`, verbatim; GNU and BSD spellings; a partial parse is refused; a name that is not a plain file name is refused                                                                                                                                |
| `layout.test.ts`     | the real four-part Andyville release reads as one 6.6 GB world; a gap is refused by name; a manifest beats a checksum list                                                                                                                                                       |
| `fetcher.test.ts`    | the whole path end to end against a real zip, really split, really served: a cross-repository release, a part that fails its digest and is repaired, a part that stays wrong and leaves nothing behind, a part the list never mentions, the derived manifest, and a cancellation |
| `ipc.test.ts`        | the channels register and dispose exactly, and no handler rejects                                                                                                                                                                                                                |

The desktop UI's wiring to those channels - the part this section used to carry a warning
about - has its own coverage. `preload/worldSourceBridge.test.ts` has 8 tests proving the
mapping between what `worldsource:discover` answers and what the downloads panel has always
read (a checksum-list source becomes `split: true`, a `whole` one becomes `split: false`,
a failure carries its message through), free of every Electron import so a plain vitest run
exercises it directly rather than trusting the wiring. `ReleaseDownloads.test.ts` and
`downloads.test.ts` in `design/packages/ui/src/components/downloads/` cover the panel itself
end to end against a fake bridge: the "paste a link" field stays hidden without
`canParseLink`, a real release link fills the owner/repository/tag fields, and text that
resolves to nothing leaves them alone.

Run them with `npx vitest run packages/app` and `npx vitest run packages/ui` from `design/`.

The workflow is checked with `actionlint` **and** `shellcheck` installed. That pairing matters:
actionlint silently skips every shell check when shellcheck is absent and still exits 0, so a clean
run without it proves only that the YAML parsed.

Verified since, on a real dispatched run against the 6.6 GB Andyville release: the four parts and
`SHA256SUMS` downloaded cross-repo in 55 seconds, all four verified `OK`, a manifest derived from the
verified parts, the join checked against it, and the archive unpacked — 8.1 GB of world. The planner
then measured 1,461 region files and 929,898 chunks and produced a six-shard plan, and the first
shard rendered 3,462 hires tiles.

That run also exposed three defects this feature had been hiding rather than causing: the planner
looked for the overworld only at the world root while this save keeps every dimension under
`dimensions/`; every render job installed Java 21 to run a jar the build compiles with Java 25; and
the disk note above was simply false. All three are fixed.

Still not verified: the merge into a complete map, and where the disk ceiling actually is.

## Related reading

- [Large worlds and rendered maps](./large-worlds.md) — the parts manifest this reads first, and how
  this project publishes one.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — what happens to the world once it
  has arrived.
- [Rendering on a remote host](./remote-render.md) — the other way a world leaves this machine.
- [Worlds hosted on your own SSH server](./ssh-world-sources.md) — a world read from a machine
  you own, rather than published as a release.
- [Finding worlds](./finding-worlds.md) — the worlds already on this computer.

## 廣東話

### 概述：用其他人 release 嘅世界（Worlds from somebody else's release）

一個世界唔一定要擺喺呢部電腦或者呢個 repository 入面。佢可以係**任何一個公開 GitHub repository** 嘅 release asset，而且因為個檔案太大做唔到一個檔，可以分開幾份發佈。呢兩樣嘢以前都存在，但係以前兩樣都行唔通：`gh release download` 冇 `--repo` 嘅話，淨係讀到個 run 所在 repository 嘅 release；而分割格式方面，呢度以前只識得本 project 自己嘅 `<name>.parts.json`。一個 6.6 GB 嘅世界，以四個 `.zip.part.NNNN` 檔加一個 `SHA256SUMS` 發佈——即係普通 backup script 嘅正常輸出——以前會被當成五個冇關係嘅檔案，冇一個係世界。

### 一個 world source 係點樣（What a world source looks like）

以下呢啲寫法全部都指住同一個 repository，而最後嗰個仲指明咗入面一個特定 release：

```
cafepromenade/Andyville-World
github.com/cafepromenade/Andyville-World
https://github.com/cafepromenade/Andyville-World
https://github.com/cafepromenade/Andyville-World.git
https://github.com/cafepromenade/Andyville-World/releases/tag/andyville-backup-20260804-160001
```

最後嗰個帶住個 tag，而將個 tag 一路帶落去先係重點：有人貼一條指住*嗰個* release 嘅 link，佢嘅意思就係嗰個 release；如果靜靜雞改為攞 `latest`，就會畀咗個唔同嘅世界佢，而畫面上乜都冇提過。

其他嘢一律拒絕，唔會夾硬 encode 完希望冇事。`owner` 同 `repo` 最終會擺入 GitHub API path，所以兩個都會對住 GitHub 自己嘅名稱文法檢查——唔可以有 `..`、唔可以以 hyphen 開頭、唔可以係四十個字嘅 login——而指住第二個 forge 嘅 link 會直接拒絕，唔會當佢係 GitHub，因為人哋個 API 唔係呢個 API。

### 兩種分割格式（The two split layouts）

Release asset 上限係 2 GB，所以大世界一定係分幾份到埗。世界發佈呢啲 part 有兩種方式，呢個 project 兩種都識讀。

第一種係 **parts manifest**，即係 [large worlds](./large-worlds.md) 講嗰種，亦係本 project 自己發佈嘅格式：幾個 part 檔（例如 `test-world.zip.001`、`test-world.zip.002`）旁邊有一個細細嘅 `test-world.zip.parts.json`。

第二種係 **checksum list**，即係 `sha256sum > SHA256SUMS` 產生嗰種，亦係世界上大部分人實際用緊嘅：幾個 `.zip.part.NNNN` 檔旁邊擺一個幾百 byte 嘅 `SHA256SUMS`。

`<name>.part.0000`、`<name>.part0000` 同 `<name>.001` 全部讀成同一樣嘢，而編號可以由 0 或者由 1 開始——兩種都有人發佈，兩種都冇錯。

**一個 release 兩種都有嘅話，manifest 贏**，因為 manifest 除咗每個 part 嘅 digest 之外仲發佈埋成個 archive 嘅 digest，而 checksum list 淨係得每個 part 嗰啲。兩樣都有嘅 release，會用較強嗰個方式讀。

編號有窿嘅話，未下載任何嘢之前就會指名拒絕。呢樣唔係為咗企理：啲 part 係按 index 順序駁埋一齊嘅，所以中間漏咗一份唔會出 error，而係產生一個**短咗但係照樣解到壓縮嘅 archive**——個世界開得着，之後先至爛，爛嘅位置離個下載隔咗三層，冇任何嘢會指得返去下載嗰度。

### 喺桌面應用程式度用（Using one in the desktop application）

Map wizard 個 world step 嘅 release downloader（`ReleaseDownloads.vue`）透過 downloads bridge 嘅 `discoverRelease` 同 `startDownload` 接觸呢個功能，而 preload 係由 `worldsource:discover` 同 `worldsource:fetch` 回答，唔係由 `download:discover`/`download:start`。成個接線就係咁多：個 panel 自己對介面嘅 contract——`owner`、`repo`、可選嘅 `tag`，加一個 `split`/`parts`/`bytes` 概要講個 release 有乜——完全冇變，所以本 project 自己 release 嗰啲 manifest 形嘅下載，行為同一路以嚟一模一樣。變咗嘅係邊個回答佢，而任何公開 repository 嘅 checksum-list release，而家會用 manifest 形一直以嚟嘅方式同樣咁被理解。`main/preload/worldSourceBridge.ts` 係將 source 嘅 `kind` 轉成 panel 嘅 `split` flag 嘅接縫；個 mapping 睇返佢自己嘅 test。

Owner/repository/tag 三個欄位上面有個可選欄位，每打一個字就 call `worldsource:parse`，將解析結果寫返落嗰三個欄位——即係上面講嘅「貼 link」行為。`worldsource:cancel` 同 `worldsource:active` 存在嘅理由同 `discoverRelease`/`startDownload` 一樣：佢哋係 checksum-list fetcher 自己個 in-flight map 同共用 release downloader 兩邊 running 緊嘅嘢嘅並集，如果淨係問 `download:cancel`/`download:active`，一個 checksum-list 下載會靜靜雞停唔到、列唔到。`download:list` 冇郁過，因為兩條路徑都寫同一個 `DownloadRecord` 形狀落同一個 on-disk workspace layout，所以佢本身已經讀得返 checksum-list 下載，唔使自己改。

底層 `main/worldsource/` 刻意做得好薄，已經解決咗嘅嘢全部重用：release lookup、token 決定同 CDN 定 API URL 嘅選擇嚟自 `main/download/release.ts`；可續傳嘅 ranged transfer 嚟自 `main/download/http.ts`；安全解壓嚟自 `main/download/extract.ts`；join（連每個 part 嘅重檢同 resume）嚟自 `@worldlens/parts`；progress event、failure code 同 on-disk workspace 嚟自 `main/download/`。

Manifest 形或者冇分割嘅下載直接交畀現有嘅 `ReleaseDownloader`，佢本身已經做緊，仲做得更好。真正新嘅路徑係 checksum-list 嗰條，次序係咁：

1. 讀個 release，無論指名咗邊個 repository；
2. 先攞 checksum list——得幾百 byte，亦係唯一講得出啲 part 應該係乜嘅嘢；
3. 攞晒每個 part，幾個同時落，每個都用 HTTP `Range` request 由碟上已有嘅位置續落去；
4. 按 join 次序 hash 每個 part，逐個對返發佈咗嘅 digest，同一 pass 順便推導成個 archive 嘅 digest；
5. join，append 每個 part 嗰陣再檢查一次，最後檢查成個檔；
6. 解壓。

進度、取消同下載清單用嘅係**同本 repository 下載一模一樣嗰套**。Event 喺 download channel 廣播，唔係開個呢個功能自己嘅 channel，所以由陌生人 repository 攞返嚟嘅世界會出現喺同一個清單、郁同一條 bar、畀同一個掣停。開多一條 event channel 即係有第二個清單，一邊嘅下載就會係另一邊睇唔到、取消唔到嘅下載。

### 喺 GitHub Actions 度用（Using one in GitHub Actions）

`Render world` 喺 `world` 旁邊有個 `world-repository` input。留空即係本 repository；填 `owner/name` 就係其他人嘅。例如：`world-source` 填 `release-asset`，`world-repository` 填 `cafepromenade/Andyville-World`，`world` 填 `andyville-backup-20260804-160001/andyville-world-20260804-160001.zip`。

`world` 欄位依然係 `asset` 或者 `tag/asset`；release asset 個名唔可以有斜線，所以喺**最後一條**斜線度切係冇歧義嘅，帶斜線嘅 tag（`release/1.4`）照樣用得。分割 archive 嘅話，要填 **base** archive 個名（`…zip`），唔係其中一份 part——個 run 會下載晒所有名以佢開頭嘅嘢：整份發佈就係成個檔，分割發佈就係全部 part。

跟住個 run 做嘅嘢同個 application 一樣：優先用 `.parts.json`，冇嘅話就用 coreutils 自己嘅 `sha256sum --check --strict` 對住 `SHA256SUMS` 驗每個 part，由驗證咗嘅 part 推導一個 manifest，再用 `scripts/join-parts.mjs` join——同個 application 行嘅係同一個 joiner，同人手行嘅亦係同一個。成個 repository 得一個 join 實作，呢個功能冇加第二個。

磁碟方面係量度過，唔係靠估。早期版本嘅 note 話 hosted runner「冇位同時擺三份嘢」（即係啲 part、join 完嘅 archive 同解壓咗嘅 tree），嗰句係錯嘅，而且錯嘅方向係嚇窒人唔敢試。標準 runner 報 **145 GB 總量，未清理任何嘢之前有 87 GB 得閒**。render 6.6 GB 嘅 Andyville 世界，三份嘢齊揸嗰陣 baseline 之上最高用大約 21 GB，完成之後仲有 104 GB 得閒。世界一解壓，啲 part 同個 archive 依然會即刻刪，因為冇理由留住佢哋——但嗰個係企理，唔係必要。至於個上限實際喺邊，**未**確立過：未試過推到爆為止。6.6 GB 離上限好遠。

Workflow input 上限亦係真限制：GitHub 文件寫明 `workflow_dispatch` 最多**十個** input，而 `world-repository` 係第十個。想加第十一個，就要先將現有兩個摺埋做一個。

### 驗乜嘢，同埋檢查 fail 嗰陣會點（What is verified, and what happens when a check fails）

三種 layout 嘅驗證程度唔同：`<name>.parts.json` 每個 part 嘅 digest 同成個 archive 嘅 digest 都有發佈、都有檢查；`SHA256SUMS` 淨係每個 part 嘅 digest 有發佈同檢查，成個 archive 嘅 digest 係**本地推導**再對返個 join；單一 asset 就乜 digest 都冇發佈，會記錄低但唔會檢查。

推導出嚟嗰個 digest 值得講到明，因為叫佢做「verification」係 code 支持唔到嘅講法。佢係啲 part 對完 release 自己個 list *之後*先計出嚟嘅，然後要求個 join 重現佢。所以佢證明到 join 寫嘅就係佢讀嘅——寫到一半斷咗、碟滿咗、copy 中途停咗——但係對於發佈者個檔本身啱唔啱，乜都證明唔到。**每個 part 嘅 digest 先至係唯一嘅外部權威**，而佢哋喺任何嘢 join 之前已經檢查完。

一個 part fail 咗 digest，會指名，連兩個 digest 一齊報，咁樣就可以淨係重新攞嗰一個檔，唔使攞晒全部。佢會先被刪除，永遠唔會 resume 落去：fail 咗檢查嘅 byte 係碟上唯一一樣絕對唔可以 append 落去嘅嘢。之後會重攞一次；如果第二份都係錯，個下載就 fail。

Checksum list 冇提過嘅 part 係 **failure**，唔係 pass。冇期望唔等於滿足咗期望，當佢係 pass 嘅 reader 就會將未驗證嘅 byte join 入人哋個世界。

**Failure** 會刪除 join 完嘅 archive 同解壓咗嘅 tree——即係喺後面嘅嘢眼中好似「搞掂咗」嘅兩樣——但係保留啲 part，因為佢哋逐個有 checksum，resume 係安全嘅。**取消（cancellation）**就乜都保留，包括寫咗一半嘅 part；呢個正正係可續傳下載嘅意義，而取消唔係 failure，永遠唔會當 failure 咁顯示。

### Failure modes

每種情況報乜，逐個講：段文字根本唔係一個 repository → 個欄位淨係維持 invalid，乜嘢 request 都唔會發；repository 或者 release 唔存在 → `release-not-found`，連埋問過嘅 URL；個 release 冇嗰個名嘅嘢 → `asset-not-found`，列出佢實際有乜；個 release 有幾個世界但冇指明邊個 → 拒絕，列晒出嚟，唔會靠估；分割編號有窿 → `manifest-invalid`，指名跳過咗邊兩個 part 之間；`SHA256SUMS` 有一行唔係 digest → `manifest-invalid`，成個檔拒絕，唔會 parse 一半；一個 part 對唔上 digest → `integrity-failed`，指名個 part 同兩個 digest；下載資料夾寫唔到 → `storage-unwritable`，指向 storage 設定；用戶自己取消 → `cancelled`，呢個唔係 error。

### 保安要點（Security notes）

- **公開 release 唔需要 token，亦絕對唔可以強求一個。**發佈世界嘅重點就係任何人都攞到。有 `GH_TOKEN` 就會用——private repository 同被 rate-limit 嘅 runner 都需要——冇嘅話就改用 browser download URL，嗰條 URL 唔使認證，亦唔受未認證 API 每小時六十個 request 嘅限制。唔係咁嘅話，一個二十份 part 嘅世界單一個下載就會食咗嗰個限額三分之一。
- **Token 永遠唔會去到 CDN。**有 token 嗰陣用 API asset URL，而 undici 喺 cross-origin redirect 去 storage 嗰陣會除低個 `Authorization` header。
- **Release 嚟嘅每一個名都當係惡意。**`SHA256SUMS` 有一行寫 `../../../.ssh/authorized_keys`，或者 part 名入面有分隔符，一律拒絕而唔會 resolve：呢啲名全部都係 join 落下載啲 part 嗰個目錄度。
- **Owner 同 repository 喺擺入 API path 之前就驗證好**，唔係事後先 escape。
- **Archive 經現有嘅 safe extractor 解壓**，任何會落喺目的地以外嘅 entry 都會拒絕。
- 個 application 永遠唔會執行下載世界入面嘅任何嘢。

### 驗證（Verification）

`design/packages/app/src/main/worldsource/` 有 51 個 test，冇一個需要網絡、token 或者 GitHub account。逐個檔講佢證明乜：`repository.test.ts`——每種 URL 寫法讀成同一對名，release link 入面嘅 tag 會保留，GitHub 唔可能有嘅名會拒絕；`checksums.test.ts`——用**真**Andyville `SHA256SUMS` 原文，覆蓋 GNU 同 BSD 寫法，parse 一半會拒絕，唔係普通檔名嘅名會拒絕；`layout.test.ts`——真嘅四份 part Andyville release 讀成一個 6.6 GB 世界，有窿會指名拒絕，manifest 贏 checksum list；`fetcher.test.ts`——對住一個真 zip（真係切開、真係 serve）end to end 行成條路：cross-repository release、一個 part fail digest 然後修復、一個 part 一直錯最後乜都唔留低、一個 list 冇提過嘅 part、推導 manifest，同埋一次取消；`ipc.test.ts`——啲 channel register 同 dispose 啱啱好，冇 handler 會 reject。

桌面 UI 去嗰啲 channel 嘅接線——即係呢一節以前帶住警告嗰忽——而家有自己嘅 coverage。`preload/worldSourceBridge.test.ts` 有 8 個 test，證明 `worldsource:discover` 答乜同 downloads panel 一路讀開乜之間嘅 mapping（checksum-list source 變 `split: true`，`whole` 變 `split: false`，failure 個 message 帶得過去），完全冇任何 Electron import，所以普通 vitest run 直接測到佢，唔使靠信個接線。`ReleaseDownloads.test.ts` 同 `downloads.test.ts` 喺 `design/packages/ui/src/components/downloads/`，對住一個假 bridge end to end 測個 panel 本身：冇 `canParseLink` 嗰陣「貼 link」欄位會匿埋，真 release link 會填好 owner/repository/tag 三欄，解析唔到嘅文字唔會郁佢哋。

喺 `design/` 度用 `npx vitest run packages/app` 同 `npx vitest run packages/ui` 行呢啲 test。

Workflow 係裝住 `actionlint` **加** `shellcheck` 一齊檢查嘅。呢個配搭好緊要：shellcheck 唔喺度嗰陣，actionlint 會靜靜雞跳過所有 shell check 而照樣 exit 0，所以冇裝 shellcheck 嘅一次 clean run 只證明到 YAML parse 到。

之後喺一次真 dispatch、對住 6.6 GB Andyville release 嘅 run 度實測過：四份 part 同 `SHA256SUMS` 55 秒內 cross-repo 下載完，四份全部驗到 `OK`，由驗證咗嘅 part 推導 manifest，個 join 對過佢，個 archive 解壓完——8.1 GB 嘅世界。跟住 planner 量到 1,461 個 region file 同 929,898 個 chunk，出咗個六個 shard 嘅 plan，第一個 shard render 咗 3,462 塊 hires tile。

嗰次 run 仲揭發咗三個呢個功能一直遮住（而唔係造成）嘅 defect：planner 淨係喺 world root 度搵 overworld，但係呢個 save 將所有 dimension 擺喺 `dimensions/` 下面；每個 render job 裝 Java 21 去行一個 build 用 Java 25 compile 嘅 jar；仲有上面講嗰個磁碟 note 根本係錯。三個都修復咗。

仲未驗證嘅：merge 成一幅完整地圖，同埋磁碟上限實際喺邊。

### 延伸閱讀（Related reading）

- [Large worlds and rendered maps](./large-worlds.md)——呢度優先讀嗰個 parts manifest，同埋本 project 自己點樣發佈一個。
- [Rendering a world in GitHub Actions](./render-in-actions.md)——個世界到咗之後會發生乜。
- [Rendering on a remote host](./remote-render.md)——個世界離開呢部機嘅另一條路。
- [Worlds hosted on your own SSH server](./ssh-world-sources.md)——由你自己擁有嘅機讀世界，而唔係發佈成 release。
- [Finding worlds](./finding-worlds.md)——已經喺呢部電腦上面嘅世界。
