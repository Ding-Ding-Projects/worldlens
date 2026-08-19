# Large worlds and rendered maps

A GitHub release asset is capped at **2 GB per file**. A rendered 20 GB world is tens of gigabytes
of tiles, and even a modest world archive goes past that cap, so nothing large can be published as
a single download. Anything over the cap is therefore split into **1.7 GB parts** with a manifest
beside them, and put back together by whatever consumes it: the desktop application does it
automatically, and one command does it by hand.

**Contents**

- [What a split asset looks like](#what-a-split-asset-looks-like)
- [Getting one with the desktop application](#getting-one-with-the-desktop-application)
  - [Where it is](#where-it-is)
  - [What it does](#what-it-does)
- [Getting one from a command line](#getting-one-from-a-command-line)
- [Publishing one](#publishing-one)
- [The manifest format](#the-manifest-format)
- [What is verified, and what happens when a check fails](#what-is-verified-and-what-happens-when-a-check-fails)
- [Resuming](#resuming)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## What a split asset looks like

A release that carries a 4 GB world shows this instead of one file:

```
test-world-seed-1739.zip.001          1.70 GB
test-world-seed-1739.zip.002          1.70 GB
test-world-seed-1739.zip.003          0.63 GB
test-world-seed-1739.zip.parts.json     684 B
```

The numbered files are the archive cut into pieces at fixed offsets. Nothing clever happens at the
boundaries: concatenating them in order gives back the original file, byte for byte. The
`.parts.json` is what makes that safe rather than merely likely, because it carries a SHA-256 for
every part and one for the whole file.

Why 1.7 GB and not 2 GB: the cap is enforced on the uploaded object, and a part sized right at the
limit leaves no room for a boundary counted in binary rather than decimal gigabytes, or for
whatever the upload path adds. The margin costs one extra part every six, once, at publish time.

## Getting one with the desktop application

### Where it is

There is a surface for this now, and it is where the question is actually asked. The map wizard's
first step, the one that wants to know which world folder to render, carries a disclosure reading
**No world on this machine? Download one from a release**. Opening it puts the downloads panel in
place, inside the step. A download that finishes is offered back to the wizard as the world to
render, so "I have no world" and "render this world" are one flow rather than two.

Two behaviours there are deliberate and read as omissions if they are not stated:

- **Opening the panel fetches nothing.** It reconciles with what is already on disk and already in
  flight, which touches no network. Reading a release is a network request and waits for the
  button, because a panel that called GitHub every time a wizard step was opened would spend
  somebody's rate limit on a question they never asked.
- **Every download in the application appears here, whoever started it.** Progress is broadcast to
  every window, so a download started elsewhere, or before this panel was opened, is shown too.
  Nothing is filtered to "mine": an invisible download is a download somebody starts twice.

A build with no Electron bridge, which is what a plain browser tab is, says so and offers no
button. There is no fallback that could work: a browser tab has nowhere to write a twenty gigabyte
world, no way to resume a ranged request into a file, and no zip reader that streams.

### What it does

Nothing has to be done about the split. The application reads the release, sees the manifest,
presents it as the one download it really is (`test-world-seed-1739.zip`) with a chip saying how
many parts it arrives in, and then:

1. fetches the manifest first, because it is a few kilobytes and it is the only thing that says how
   large the real download is;
2. fetches every part, several at a time, each with an HTTP `Range` request that continues from
   whatever is already on disk;
3. checks each part against its own SHA-256 as it arrives, and re-fetches one that came back wrong;
4. rejoins them, re-checking each part as it is appended and then the whole file;
5. unpacks the archive into the application's storage directory.

Progress is pushed to the interface as it happens: bytes transferred, parts done, the part being
worked on right now, an overall percentage and an estimate. The byte counts are exact; the overall
percentage is a weighted estimate across the transfer, the rejoin and the unpack, and says that it
is one. A download can be cancelled at any point, and cancelling keeps everything already
transferred, so starting it again continues rather than begins.

Each row also carries a **Show what it reported** log disclosure. Opened, it shows a **Follow new
lines** checkbox, on by default: a multi-part download can run for a long time, and opening the log
while it is still going is opening it to watch it happen. Scrolling up to read an earlier line
pauses following automatically, without unticking the checkbox; scrolling back down, or the
**Newest lines** control that appears only while paused, resumes it. The `<pre>` carries
`role="log"` with `aria-live="off"` rather than letting every line be announced as it arrives, and
an active text selection inside it is never scrolled away from. The preference is remembered
across restarts and is the same shared mechanism (`components/scroll/`) the render console and the
backup log use — see [Render console](./render-console.md) for the full reasoning.

Each row is in one of five states, and they are kept apart because they mean different things:

| State       | What it means                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Running     | In flight now                                                                                                              |
| Interrupted | The record says running, and nothing is. The application or the machine stopped before an ending could be written          |
| Finished    | Verified and unpacked                                                                                                      |
| Failed      | Sorted into one of ten kinds, each with its own explanation, and a button to the setting that would fix it where one would |
| Cancelled   | Somebody pressed stop. **Not** a failure, and resumable                                                                    |

A **public** release needs no token and is never asked for one. `GH_TOKEN` is used when the
environment has it, which is what makes a private release and a rate-limited runner work. Note that
signing in to GitHub inside the application does **not** feed this path: the sign-in session and
the downloader's token are not wired together, so a private asset still needs the environment
variable. That is a gap rather than a design, and it is stated here rather than left for somebody
to discover by signing in and finding nothing changed.

Everything lives under the storage directory, one folder per download:

```
<storage>/downloads/<downloadId>/
  parts/          the .001, .002, ... and the .parts.json exactly as published
  <name>.zip      the rejoined archive, written only after every part verified
  content/        what the archive unpacked into
  download.json   what was fetched, from where, and how it ended
```

The parts are kept after a successful download, so re-extracting never means re-downloading.

## Getting one from a command line

Download every numbered part and the `.parts.json` into one directory, then:

```sh
node scripts/join-parts.mjs test-world-seed-1739.zip.parts.json
```

Options:

| Option        | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| `--out <dir>` | Write the rejoined file somewhere other than beside the parts |
| `--json`      | Machine-readable result instead of the human report           |

It prints the verified SHA-256 on success. On failure it names the exact part that is wrong, with
its index, so one file can be fetched again instead of all of them, and exits 1.

The script is a thin command line over the `@worldlens/parts` package, which must be built
first:

```sh
cd design && pnpm install && pnpm --filter @worldlens/parts run build
```

## Measured: a real two-wave hosted dispatch

Everything above was arithmetic until [issue #39](https://github.com/Ding-Ding-Projects/material-bluemap/issues/39)
was closed out against a real run rather than an estimate. A 9728×9728 block world was generated
with `@worldlens/worldgen` (seed `20260805`; regenerate with
`node packages/worldgen/dist/cli.js --seed 20260805 --size 9728 --out ./out`), published as a
single 717 MB release asset (`test-world-issue39-20260805`, under the 2 GB cap so it needed no
splitting), and dispatched through `Render world` with `budget-minutes: 1` and `max-jobs: 400` so
the planner's own, non-forced arithmetic — not `--force-shards` — would need more shards than one
matrix can hold.

**The world:** 361 region files (19×19), 369,664 chunks.

**What the plan step measured and decided**, from
[run 30998777252](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30998777252)'s
own log:

```
Measured 361 region files holding 369664 chunks, spanning blocks x 0..9727 and z 0..9727.
Estimated 4h 8m of rendering, 6h 12m with the safety margin, against a per-job budget of 1m 0s.
Needs roughly 5.4 GiB of free disk on a job's runner...
Shard plan written (361 jobs) — shardCount: 361, waveCount: 2, groupCount: 12
```

**The disk check, real `df` against the estimate, before any wave was dispatched:**

```
REQUIRED_BYTES: 5825668056
Required (estimate, with safety margin): ~6 GiB free
Free on this runner right now:            ~84 GiB free
```

6 GiB required against 84 GiB actually free on a standard `ubuntu-latest` runner — the same gap
this project had already documented on the 6.6 GB Andyville world, now reproduced on a second,
independently generated world that pushed the _shard count_, not just the world's own size, past a
boundary the plan had never hit before.

**Wave dispatch, watched directly rather than assumed:** Wave 1 fanned out to all 256 shards and
every one completed successfully. Only then did Wave 2 appear — `render-world.yml` declares
`wave2: needs: [cli, plan, wave1]`, so it structurally cannot exist earlier — carrying exactly the
remaining 105 shards (`Wave 2 shard 256` through `Wave 2 shard 360`). Wave 2 began executing (7 of
its shards finished successfully) before the run was cancelled once this evidence was captured, to
avoid an hours-long full render this proof did not need; 98 of Wave 2's shards were cancelled
in-flight rather than run to completion.

**What this settles:** the plan-driven wave count (raised from a hardcoded 6 to `RENDER_WAVE_SLOTS`
= 12 shortly before this measurement), the disk-estimate-vs-real-`df` check, and — the part no
amount of code reading could confirm — that a second wave genuinely dispatches, in order, once the
first finishes, against a plan the estimate produced rather than one forced with `--force-shards`.

**What this does not settle:** the full run was not carried to completion, so the merge across two
waves' worth of shards (12 merge groups, per `groupCount` above) and the final map this world would
have produced are unverified by this pass. Where the disk ceiling actually sits also remains open —
84 GiB free comfortably covered a 5.4 GiB estimate, so this run says nothing about a world close to
that boundary.

**Issue #67 exact dispatch record:** Wave 1 completed **256/256** shards. Wave 2 completed
**7/105** shards; the remaining **98** were cancelled in flight. The two-wave **merge was not
reached**. These counts are the complete observed result of that run, not an estimate and not a
claim that the final map exists.

**Issue #67 exact dispatch record — 廣東話：** Wave 1 完成 **256/256** 個 shard。Wave 2 完成
**7/105** 個 shard，剩低 **98** 個喺途中取消；兩波 **merge 未到達**。呢幾個數係嗰次 run
完整睇到嘅結果，唔係估算，亦唔代表 final map 已經存在。

### Issue #67 terminal hosted proof: run 32309098236

[Issue #67](https://github.com/Ding-Ding-Projects/worldlens/issues/67) retains the earlier dispatch as
historical evidence rather than conflating it with the terminal proof below. That baseline planned two
waves (256 + 105 shards), measured about 6 GiB required against about 84 GiB free, and stopped before
the merge. The issue record also points to baseline `e13777927876a3d7898778f18193e9465bc97cc2` for
the imported evidence.

The terminal hosted receipt is [run `32309098236`](https://github.com/Ding-Ding-Projects/worldlens/actions/runs/32309098236),
successful on commit [`82a723bba0fc671e9880334c669086f2e07dc8b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/82a723bba0fc671e9880334c669086f2e07dc8b2).
It reports two waves (**256/256** and **105/105** shards), all shard markers and artifacts present
with matching fingerprints, no missing or duplicate shard ids, and **12/12** merge groups complete.
`mergedMapVerified`, `lowresRebuilt`, and `publicResult=openable` are true; the merged result has
**91,809/91,809** expected hires tiles, matching metadata, and verified textures. Cleanup removed
intermediate archives and shard staging while preserving resumable state.

Disk evidence is retained in the receipt: **5,825,668,056 bytes** required; **91,864,993,792** free
before fetch; **90,347,483,136** after join/unpack; **90,250,326,016** at render-merge peak; and
**88,018,407,424** after cleanup/completion. `enospcObserved=false` and `noReleaseOnFailure=true`.
This proves positive fit and cleanup, not a near-limit refusal test. The artifact-only dispatch skipped
Pages publication, so no Pages publication is claimed.

### Issue #67 終局 hosted proof：run 32309098236

[Issue #67](https://github.com/Ding-Ding-Projects/worldlens/issues/67) 保留之前嗰次 dispatch 做 historical evidence，唔會同下面 terminal proof 撈亂。嗰次 baseline plan 出兩波（256 + 105 shards），量到大約需要 6 GiB、當時約有 84 GiB 空位，但喺 merge 之前停咗。Issue record 亦指向 imported evidence 嘅 baseline `e13777927876a3d7898778f18193e9465bc97cc2`。

Run `32309098236` 已經 terminal success：兩個 wave 全部完成，**12/12** 個 merge group 成功，
final result openable，**91,809/91,809** hires tiles、metadata 同 textures 都 verified。Receipt
保留咗 fetch 前、join/unpack、merge peak、cleanup/completion 嘅 disk 量度，cleanup 清走 staging
但保留 resumable state；`enospcObserved=false` 同 `noReleaseOnFailure=true`。呢個係 positive fit
同 cleanup evidence，唔係 near-limit refusal test。Artifact-only dispatch 令 Pages publication
skipped，唔會當 Pages 已 publish。

## Publishing one

CI does this on every release, and only when it is actually needed. Before the release is
composed, every asset is measured; anything over 2 GB is split, its parts and manifest are attached
**instead of** the oversized file, and a section is added to the release notes explaining how to
rejoin it. Assets under the cap are attached unchanged and the notes say nothing about splitting,
because a release that did not split anything should not carry instructions for a case that did not
occur.

By hand:

```sh
node scripts/split-parts.mjs big-world.zip                  # 1.7 GB parts, beside the source
node scripts/split-parts.mjs big-world.zip --out release/   # parts somewhere else
node scripts/split-parts.mjs big-world.zip --part-size 500000000
node scripts/split-parts.mjs --check big-world.zip          # would this be split? exits 0 either way
```

A file no larger than the part size is **left alone**: nothing is written and the report says so.
Producing a one-part manifest for a 40 MB installer would make every consumer of every release learn
the join format to open an asset that was never split.

## The manifest format

```json
{
  "version": 1,
  "file": "test-world-seed-1739.zip",
  "bytes": 4030000000,
  "sha256": "6640a521a88283195b790c8bdf6ca176e480c2f9399a8163153d02a2c5b72083",
  "partSize": 1700000000,
  "parts": [
    {
      "index": 1,
      "name": "test-world-seed-1739.zip.001",
      "bytes": 1700000000,
      "sha256": "967c..."
    },
    {
      "index": 2,
      "name": "test-world-seed-1739.zip.002",
      "bytes": 1700000000,
      "sha256": "52e6..."
    },
    {
      "index": 3,
      "name": "test-world-seed-1739.zip.003",
      "bytes": 630000000,
      "sha256": "c77c..."
    }
  ]
}
```

`file` and every `name` must be plain file names. A manifest is downloaded from the internet and
every part name in it is resolved against the directory the manifest sits in, so a name carrying a
path separator, a `..`, a drive letter or a NUL is refused outright rather than resolved.

The reader also proves that the parts are listed in order from 1, that no part is larger than the
stated part size, that every digest is 64 hex characters, and that the parts' lengths add up to the
stated total. A manifest whose two numbers disagree is rejected rather than half-believed, because
neither of them can be trusted once they contradict each other.

## What is verified, and what happens when a check fails

Two checks, both load-bearing:

- **every part** is hashed as it is appended. A bad file is named: "Part 3 of 19
  (`world.zip.003`) does not match the manifest" is a sentence somebody can act on by
  re-downloading one file. "The archive is corrupt" is not;
- **the whole file** is hashed at the end, because nineteen correct parts assembled in the wrong
  order, or with one written twice, produce nineteen passing digests and a broken archive.

A rejoin that skipped these would produce a corrupt world that unzips cleanly and then surfaces as
a _rendering_ bug three layers away, in a file nobody would think to look in. The checks are the
reason the format exists, not a safety net bolted onto it.

When a check fails:

| Failure                                                   | What is left on disk                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A part's digest is wrong during a rejoin                  | The output is rolled back to the end of the last good part, so a retry redoes only that part                               |
| A part is missing or the wrong length                     | Nothing is written; the part is named                                                                                      |
| The whole-file digest is wrong although every part passed | The rejoined file is **deleted**, and the message says so                                                                  |
| A download's part arrives corrupt                         | That part file is deleted and re-fetched once; if it fails again the rejoined archive and the unpacked content are deleted |
| A download is cancelled                                   | Everything is kept, including the half-written part                                                                        |

The deletions are deliberate. This project has already been bitten by a file that existed, held
nothing usable, and was treated as complete by everything downstream: a packaged `dist/` with no
binary in it, whose installer kept exiting 0. A failed download must not leave anything that looks
finished. A **cancellation** is not a failure, and keeping what it transferred is the whole point of
a resumable download.

## Resuming

Both halves resume.

**Downloading** continues with an HTTP `Range` request from the byte the last attempt reached. All
three possible answers are handled, because the one that is not handled is the one that silently
corrupts a file:

- `206 Partial Content` is what was asked for, and the bytes are appended;
- `200 OK` means the server ignored the range and is sending the whole file again, so the local file
  is truncated first. Appending a second copy of the first megabyte onto a file that already has it
  produces a file of exactly the wrong length with no error anywhere;
- `416 Range Not Satisfiable` means the local file is at least as long as the remote one, which is
  either a finished download or a corrupt one. It is thrown away and fetched again rather than
  guessed at.

**Rejoining** reads the output file's own length to find out how far the last attempt got, re-reads
that prefix once, and verifies every part it already contains as it goes. That read costs a fraction
of a re-copy and doubles as proof that the bytes already on disk are the right ones, which a naive
"seek to the end and carry on" can never establish. Anything past the last complete part is
discarded rather than trusted, because the bytes at the end of an interrupted write are exactly the
bytes most likely to be short. A prefix whose bytes do not match the parts that claim them is
re-copied from the first part that disagreed.

## Security notes

- **Nothing is loaded into memory.** Every operation streams at one mebibyte at a time. The files
  this exists for do not fit in memory, and `readFile` on a 20 GB archive is not slow, it is a
  crash.
- **Part names cannot escape their directory.** See [the manifest format](#the-manifest-format).
- **Zip entries cannot escape the destination.** Every entry name is resolved against the
  destination and compared after normalisation; absolute names, drive letters, backslash climbs,
  embedded NULs and symbolic links are all refused, and an archive containing one hostile entry is
  refused **before** any of its innocent entries are written.
- **Every entry's CRC-32 is checked as it is read**, and an entry that unpacks to a different
  length than the archive claims is refused. This is the second of two independent checks: the
  archive as a whole has already been proved against its published SHA-256 by the time anything is
  unpacked, so the CRC catches a decompressor that went wrong rather than a transfer that did.
- **The zip reader is written against `node:zlib` alone, with no native dependency.** The
  packaging configuration states the contract in three places: esbuild inlines every runtime
  dependency, no `node_modules` tree reaches the asar, and no native module reaches the packaged
  application. The obvious zip libraries break it - `yauzl-promise` pulls in `@node-rs/crc32`,
  which is a `.node` addon esbuild refuses to bundle, and the Electron build fails outright.
  Store and deflate are supported; an entry compressed any other way is refused **by name**
  rather than written out as garbage, and an encrypted entry is refused too.
- **Zip64 is supported, and is not optional here.** Past 4 GB, or past 65,535 entries, a zip
  keeps its real sizes and offsets in Zip64 records and leaves `0xFFFFFFFF` sentinels in the
  classic fields. A reader that takes those at face value seeks to offset 4294967295 and reports
  a perfectly good 20 GB world as corrupt.
- **A token is never required for a public release.** Without one, the CDN download URL is used,
  which needs no authentication and is not subject to the unauthenticated API's sixty-requests-an-hour
  limit; a twenty-part world would otherwise spend a third of that limit on one download. With one,
  the API asset URL is used, and the `Authorization` header is dropped by the HTTP layer on the
  cross-origin redirect to storage, so the token never reaches the CDN.

## Verification

### Hosted-runner receipt contract (issue #67)

Every large-world workflow leaves one `hosted-render-receipt.json` beside its final artifact.
The receipt is evidence, not a status flag: it is uploaded even when the run fails and is
accepted only after `receipt-verify` reads it back. A missing, malformed, truncated, or partial
receipt keeps the run failed and never permits publication.

The schema is version `1` and records the immutable run id/attempt, sanitized map id, plan
fingerprint, required free-disk estimate, and these five runner samples in chronological order:

| Phase | What is measured |
| --- | --- |
| `before-fetch` | free and available bytes before the world is fetched |
| `after-join-unpack` | the peak-prone point after split parts are joined and unpacked |
| `render-merge-peak` | the lowest free space observed while rendering or merging |
| `after-cleanup` | free space after intermediate archives and shard staging are removed |
| `completion` | the final free-space reading and timestamp |

For a plan with two or more waves, the receipt has one entry per wave. Each entry lists the
planned and completed shard ids, marker count, start/end timestamps, and outcome. Wave N is not
complete unless every planned shard has a matching completion marker, and wave N+1's start must
be after wave N's completion. The merge section separately records merge verification, lowres
rebuilding, and whether the public result is `openable` or honestly `not-published`.

The repository's verifier is the `@worldlens/render-actions` `receipt-verify` command:

```sh
node packages/render-actions/dist/cli.js receipt-verify \
  --receipt hosted-render-receipt.json \
  --summary receipt-summary.md
```

It fails closed on a missing phase, a disk estimate not covered by measured preflight, an
incomplete or out-of-order wave, a merge without lowres verification, or a successful outcome
that still has a failed stage. The verifier does not contact GitHub or invent a result from a
workflow conclusion; the workflow must attach its JSON receipt and run link separately.

The receipt is the durable answer to the disk-boundary question. A run that stays comfortably
below the estimate is useful two-wave evidence, but it does **not** establish the hosted runner's
exhaustion boundary. To establish that boundary, record a measured refusal (free bytes, required
bytes, and the exact safe refusal) before ENOSPC; never deliberately exhaust the runner or delete
resumable state to manufacture a red run.

廣東話：大型 render 要留低一張真收據，唔係淨係話「workflow green」。要逐階段記 `df`，兩浪
要逐浪對 completion marker 同時間順序，merge 同 lowres 都要驗完；缺一格就當未證明。6 GiB
估算對 84 GiB 空位只證明仲有好多位，唔係磁碟天花板。要量到安全拒絕，唔好等 ENOSPC 幫你
做產品經理。

| What                                                                                                                                                                                                                                                                                                                                                                        | Where                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Split, rejoin, corruption, resume, boundaries, manifest validation                                                                                                                                                                                                                                                                                                          | `design/packages/parts/src/parts.test.ts`                              |
| Release reading and part discovery                                                                                                                                                                                                                                                                                                                                          | `design/packages/app/src/main/download/release.test.ts`                |
| `Range` resume, and the three answers a ranged request can get                                                                                                                                                                                                                                                                                                              | `design/packages/app/src/main/download/http.test.ts`                   |
| Zip extraction and every path-escape case                                                                                                                                                                                                                                                                                                                                   | `design/packages/app/src/main/download/extract.test.ts`                |
| The zip reader itself: store, deflate, Zip64, CRC failure, truncation                                                                                                                                                                                                                                                                                                       | `design/packages/app/src/main/download/zip.test.ts`                    |
| The whole download path, end to end, against a real split archive                                                                                                                                                                                                                                                                                                           | `design/packages/app/src/main/download/downloader.test.ts`             |
| The rows, the failure classification, and events winning over the on-disk record                                                                                                                                                                                                                                                                                            | `design/packages/ui/src/components/downloads/downloads.test.ts`        |
| The panel: reconciling a download already in flight, and reading back a finished one                                                                                                                                                                                                                                                                                        | `design/packages/ui/src/components/downloads/ReleaseDownloads.test.ts` |
| The row's own log disclosure and its auto-scroll checkbox: on by default, `role="log"` with `aria-live="off"`, follows while checked and does not once unchecked, pauses on a manual scroll without unticking the checkbox, resumes on scrolling back down, never scrolls away from a text selection, never moves keyboard focus, and the preference survives a fresh mount | `design/packages/ui/src/components/downloads/DownloadRowCard.test.ts`  |

Run them with:

```sh
cd design && npx vitest run packages/parts packages/app packages/ui/src/components/downloads
```

**What none of them prove.** Every test above drives a stand-in for GitHub's endpoints. No asset
has been fetched from github.com through the application's own panel, so the parts that depend on
GitHub's behaviour rather than on this code, the redirect to storage and the rate limits in
particular, are unproven against the service. There is no capture of the panel either.

The package was also exercised at a size that is genuinely inconvenient: a 400 MB file split into
three 150 MB parts and rejoined, with the SHA-256 compared on both sides, and a rejoin deliberately
interrupted mid-part and resumed. Both matched the source digest.

## Related reading

- [`docs/render-in-actions.md`](render-in-actions.md) - rendering a world in CI, which is what
  produces the large maps this page exists to ship.
- [`scripts/README.md`](../scripts/README.md) - the release-time scripts, including
  `split-parts.mjs` and `join-parts.mjs`.
- `design/packages/parts/src/manifest.ts` - the format, with the reasoning for each field beside it.
- `design/packages/app/src/main/download/downloader.ts` - the order the download steps run in, and
  why that order is the design.
- `design/packages/app/src/main/download/zip.ts` - the zip reader, including why it is written by
  hand and what Zip64 changes.
- `design/packages/ui/src/components/downloads/` - the panel itself, the rows it keeps, and how a
  failure is turned into an explanation and a route to the setting that would fix it.

## 廣東話

### 概要

GitHub release asset 上限係**每個檔 2 GB**。一個 render 完嘅 20 GB 世界係幾十 GB 嘅 tiles，就算一個唔算大嘅世界 archive 都會爆呢個上限，所以大嘢冇可能用單一下載發佈。於是所有超過上限嘅嘢會斬做 **1.7 GB 一份嘅 parts**，隔籬放一個 manifest，由消費嗰方砌返埋：desktop 應用程式會自動做，command line 一條命令都做到。

### 一個斬開咗嘅 asset 係咩樣

一個載住 4 GB 世界嘅 release 唔會顯示一個檔，而係例如 `test-world-seed-1739.zip.001`／`.002`（各 1.70 GB）、`.003`（0.63 GB），加一個幾百 byte 嘅 `test-world-seed-1739.zip.parts.json`。

啲有編號嘅檔就係個 archive 喺固定 offset 切開嘅碎件。邊界上冇任何巧妙嘢：順序 concatenate 返就攞返原檔，一個 byte 都唔差。個 `.parts.json` 係令呢件事「安全」而唔只係「大概得」嘅嘢，因為佢帶住每份 part 嘅 SHA-256 加成個檔嘅一個。

點解係 1.7 GB 唔係 2 GB：個上限係查上載嗰個 object，一份切到啱啱好貼住上限嘅 part，冇位容納 binary GB 對 decimal GB 嘅邊界差，亦冇位容納上載路徑加嘅嘢。個 margin 嘅代價係每六份多一份，一次過，喺發佈嗰陣付。

### 用 desktop 應用程式攞一個

#### 喺邊度

而家有一個介面，而且擺喺個問題實際被問嘅地方。Map wizard 第一步——問你 render 邊個 world folder 嗰步——有一個 disclosure 寫住 **No world on this machine? Download one from a release**。打開佢，downloads panel 就會放埋入嗰一步入面。下載完成嘅嘢會交返畀 wizard 做要 render 嘅世界，所以「我冇世界」同「render 呢個世界」係一條 flow 而唔係兩條。

有兩個行為係刻意嘅，唔講明就會被當成漏咗：

- **打開個 panel 唔會 fetch 任何嘢。**佢只係同碟上已有嘅嘢同進行緊嘅嘢對數，完全唔掂網絡。讀一個 release 係一個網絡請求，要等你撳掣先做，因為一個每次打開 wizard 步驟就 call GitHub 嘅 panel，會將人哋嘅 rate limit 使咗喺一條佢從來冇問過嘅問題上。
- **應用程式入面每個下載都會喺度出現，唔理係邊個開始嘅。**進度廣播去每個 window，所以喺第二度、或者喺個 panel 打開之前開始嘅下載都會顯示。冇嘢會 filter 做「淨係我嘅」：一個睇唔見嘅下載，就係一個會畀人開兩次嘅下載。

冇 Electron bridge 嘅 build——即係一個普通瀏覽器 tab——會直接講明，唔會擺個掣出嚟。冇 fallback 可以行得通：瀏覽器 tab 冇地方寫一個二十 GB 嘅世界、冇辦法將 ranged request 續傳入一個檔、亦冇一個識 stream 嘅 zip reader。

#### 佢做啲乜

個斬件完全唔使你理。應用程式讀個 release，見到 manifest，就將佢當返一個下載咁顯示（`test-world-seed-1739.zip`），加一個 chip 講佢分幾多份到，然後：

1. 先 fetch 個 manifest，因為佢得幾 KB，而且係唯一講到個真下載有幾大嘅嘢；
2. 逐份 fetch，一次幾份，每份用 HTTP `Range` request 由碟上已有嘅位繼續；
3. 每份到手就對佢自己嘅 SHA-256，錯咗嗰份重新 fetch；
4. 砌返埋，append 嗰陣每份再驗一次，最後成個檔再驗一次；
5. 將個 archive 解壓入應用程式嘅 storage directory。

進度即時推去介面：傳咗幾多 bytes、完成咗幾多份、而家做緊邊份、一個整體百分比同一個估算。Byte 數係準確嘅；整體百分比係橫跨傳輸、砌件同解壓嘅加權估算，而且會講明自己係估算。下載任何時候都可以取消，取消會保留已傳嘅所有嘢，再開始係繼續而唔係由頭嚟。

每行仲有一個 **Show what it reported** log disclosure。打開會見到一個 **Follow new lines** checkbox，預設剔咗：一個多份下載可以行好耐，行緊嗰陣打開個 log，就係打開嚟睇佢發生。碌上去讀返早啲嘅行會自動暫停跟隨，唔會 untick 個 checkbox；碌返落底，或者用只有暫停時先出現嘅 **Newest lines** 掣，就恢復。個 `<pre>` 帶 `role="log"` 加 `aria-live="off"`，唔會逐行讀出嚟；入面有揀住嘅文字永遠唔會被碌走。呢個偏好跨重啟記住，同 render console 同 backup log 用同一套共用機制（`components/scroll/`）——完整理由見 [Render console](./render-console.md)。

每行處於五個狀態之一，分開係因為佢哋意思唔同：Running（而家行緊）；Interrupted（紀錄話行緊但實際冇嘢行——應用程式或者部機喺寫到結尾之前停咗）；Finished（驗證完、解壓完）；Failed（分做十種之一，各有自己嘅解釋，有得撳嘅話仲有一個掣去可以修正嘅設定）；Cancelled（有人撳咗停。**唔係**失敗，而且可以續傳）。

**Public** release 唔需要 token，亦永遠唔會被問攞。環境有 `GH_TOKEN` 就會用，private release 同 rate-limited runner 就係靠佢先行得通。留意喺應用程式入面登入 GitHub 係**唔會**餵到呢條路：登入 session 同 downloader 個 token 冇駁埋一齊，所以 private asset 仍然需要個環境變數。呢個係一個缺口而唔係設計，喺度講明，好過等人登入完發現咩都冇變先自己發現。

所有嘢住喺 storage directory 下面，每個下載一個 folder：`<storage>/downloads/<downloadId>/` 入面有 `parts/`（`.001`、`.002`…… 同 `.parts.json`，同發佈時一模一樣）、`<name>.zip`（砌返嘅 archive，每份都驗證完先寫）、`content/`（archive 解壓出嚟嘅嘢）同 `download.json`（fetch 咗乜、由邊度、點樣收尾）。

成功下載之後啲 parts 會保留，所以重新解壓永遠唔使重新下載。

### 用 command line 攞一個

將所有有編號嘅 parts 同個 `.parts.json` 下載落同一個 directory，然後：

```sh
node scripts/join-parts.mjs test-world-seed-1739.zip.parts.json
```

`--out <dir>` 將砌返嘅檔寫去 parts 以外嘅地方；`--json` 出機讀結果代替人讀報告。成功會印出驗證咗嘅 SHA-256。失敗會連 index 點名邊一份 part 錯咗，咁就可以淨係重新攞一個檔而唔係全部，然後 exit 1。

個 script 係 `@worldlens/parts` package 上面一層薄薄嘅 command line，個 package 要先 build：

```sh
cd design && pnpm install && pnpm --filter @worldlens/parts run build
```

### 實測：一次真嘅兩波 hosted dispatch

上面所有嘢喺 [issue #39](https://github.com/Ding-Ding-Projects/material-bluemap/issues/39) 對住一次真 run（而唔係估算）收數之前都只係算術。用 `@worldlens/worldgen` 生成咗一個 9728×9728 block 嘅世界（seed `20260805`；用 `node packages/worldgen/dist/cli.js --seed 20260805 --size 9728 --out ./out` 可以重生），發佈做一個 717 MB 嘅單一 release asset（`test-world-issue39-20260805`，未過 2 GB 上限所以唔使斬），再用 `Render world` 帶 `budget-minutes: 1` 同 `max-jobs: 400` dispatch，令 planner 自己嘅、非強制嘅算術——唔係 `--force-shards`——需要多過一個 matrix 裝得落嘅 shards。

**個世界：**361 個 region 檔（19×19），369,664 個 chunks。

**Plan 步驟量度同決定咗乜**（出自 [run 30998777252](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30998777252) 自己個 log）：量到 361 個 region 檔載住 369,664 個 chunks，橫跨 blocks x 0..9727 同 z 0..9727；估算 4h 8m render 時間，連 safety margin 係 6h 12m，對住每 job 1 分鐘嘅 budget；估算 job runner 需要大約 5.4 GiB 空碟位；寫出咗 shard plan（361 jobs）——shardCount: 361、waveCount: 2、groupCount: 12。

**磁碟檢查，真 `df` 對估算，喺任何 wave dispatch 之前：**`REQUIRED_BYTES: 5825668056`，即估算連 margin 約 6 GiB，而個 runner 當時實際有約 84 GiB 空位。6 GiB 需求對一個標準 `ubuntu-latest` runner 實際 84 GiB 空位——同呢個 project 喺 6.6 GB Andyville 世界上已記錄嘅差距一樣，而家喺第二個獨立生成嘅世界上重現，而呢個世界推爆嘅係 *shard 數*，唔淨係世界本身嘅大小。

**Wave dispatch，係直接睇住而唔係假設：**Wave 1 開晒全部 256 個 shards，每一個都成功完成。之後 Wave 2 先出現——`render-world.yml` 聲明咗 `wave2: needs: [cli, plan, wave1]`，所以佢結構上冇可能早啲存在——載住剩返嗰 105 個 shards（`Wave 2 shard 256` 到 `Wave 2 shard 360`）。Wave 2 開始執行咗（7 個 shards 成功完成）之後，證據攞到手個 run 就 cancel 咗，慳返一次呢個證明唔需要嘅幾粒鐘完整 render；Wave 2 有 98 個 shards 係飛行中被 cancel 而唔係行到尾。

**呢次搞掂咗乜：**plan 主導嘅 wave 數（喺呢次量度前不久由 hardcode 嘅 6 改做 `RENDER_WAVE_SLOTS` = 12）、disk-estimate 對真 `df` 嘅檢查，仲有——齋讀 code 點都確認唔到嗰部分——第二波真係會喺第一波完成之後、按次序 dispatch，而且係對住估算產生嘅 plan，唔係 `--force-shards` 焗出嚟嘅。

**呢次未搞掂嘅：**個 run 冇行到底，所以橫跨兩波 shards 嘅 merge（12 個 merge groups，見上面 `groupCount`）同呢個世界最終會出嘅 map，呢一輪未驗證。磁碟上限實際喺邊都仍然未知——84 GiB 空位輕鬆冚住 5.4 GiB 估算，所以呢次 run 對一個貼近上限嘅世界乜都講唔到。

### 發佈一個

CI 每個 release 都會做，而且只喺真係需要嗰陣做。Release 組合之前，每個 asset 都會量一次；超過 2 GB 嘅會被斬，佢啲 parts 同 manifest 會**取代**個超大檔附上，release notes 會加一段解釋點樣砌返。上限以下嘅 asset 原封不動附上，notes 隻字唔提斬件，因為一個冇斬過嘢嘅 release 唔應該帶住一個冇發生過嘅情況嘅說明。

手動嘅話用 `scripts/split-parts.mjs`：

```sh
node scripts/split-parts.mjs big-world.zip                  # 1.7 GB parts，放喺源檔隔籬
node scripts/split-parts.mjs big-world.zip --out release/   # parts 放第二度
node scripts/split-parts.mjs big-world.zip --part-size 500000000
node scripts/split-parts.mjs --check big-world.zip          # 會唔會被斬？兩種答案都 exit 0
```

一個唔大過 part size 嘅檔會**原封不動**：乜都唔寫，報告會講明。為一個 40 MB installer 整一個單 part manifest，即係迫每個 release 嘅每個消費者學識個 join 格式先開到一個根本冇斬過嘅 asset。

### Manifest 格式

格式本身見上面英文部分嗰個 JSON 例子：`version`、`file`（原檔名）、`bytes`（總大小）、`sha256`（成個檔嘅 digest）、`partSize`，加一個 `parts` array，每個 entry 有 `index`、`name`、`bytes`、`sha256`。

`file` 同每個 `name` 必須係淨檔名。Manifest 係由互聯網下載返嚟嘅，入面每個 part 名會對住 manifest 所在嘅 directory 解析，所以帶 path separator、`..`、drive letter 或者 NUL 嘅名會直接拒絕而唔係解析。

Reader 仲會證明啲 parts 係由 1 開始順序列、冇一份大過聲明嘅 part size、每個 digest 係 64 個 hex 字元、啲 parts 嘅長度加埋等於聲明嘅總數。兩個數字自相矛盾嘅 manifest 會被整份拒絕而唔係信一半，因為兩個數一旦打交，邊個都信唔過。

### 驗證啲乜，check fail 嗰陣點

兩個檢查，兩個都係受力嘅：

- **每一份 part** 喺 append 嗰陣 hash 一次。壞檔會被點名：「Part 3 of 19（`world.zip.003`）does not match the manifest」係一句人做得到嘢嘅說話——重新下載一個檔就得。「The archive is corrupt」就唔係。
- **成個檔**最後再 hash 一次，因為十九份正確嘅 parts 砌錯次序，或者有一份寫咗兩次，會產生十九個 pass 嘅 digest 加一個爛 archive。

一個跳過呢啲檢查嘅 rejoin，會產生一個解壓得好地地嘅爛世界，然後喺三層之外、一個冇人會諗到去睇嘅檔度以 *rendering* bug 嘅樣浮現。呢啲檢查係個格式存在嘅原因，唔係後加嘅安全網。

Check fail 嗰陣碟上留低乜：rejoin 途中一份 part digest 錯——output roll back 去上一份好 part 嘅結尾，retry 淨係重做嗰一份；part 唔見咗或者長度唔啱——乜都唔寫，點名嗰份 part；每份都 pass 但成個檔 digest 錯——砌返嗰個檔**剷咗**，訊息會講明；下載嘅一份 part 到手係爛嘅——嗰個 part 檔剷咗再 fetch 一次，再爛嘅話砌返嘅 archive 同解壓咗嘅內容一齊剷；下載被取消——所有嘢保留，包括寫咗一半嗰份 part。

啲刪除係刻意嘅。呢個 project 已經畀「一個存在、但入面冇嘢用得着、而下游全部當佢完成」嘅檔害過一次：一個冇 binary 嘅 packaged `dist/`，個 installer 照樣 exit 0。失敗嘅下載唔可以留低任何睇落似完成嘅嘢。**取消**唔係失敗，保留已傳嘅嘢正正係可續傳下載嘅意義。

### 續傳（Resuming）

兩半都識續傳。

**下載**用 HTTP `Range` request 由上次去到嘅 byte 繼續。三個可能答案全部有處理，因為冇處理嗰個就係靜靜整爛個檔嗰個：

- `206 Partial Content` 係要求嗰樣嘢，啲 bytes append 落去；
- `200 OK` 即係 server 無視個 range、重新send成個檔，所以本地檔會先 truncate。將第一 MB 嘅第二份 append 落一個已經有佢嘅檔，會產生一個長度啱啱好錯、但邊度都冇 error 嘅檔；
- `416 Range Not Satisfiable` 即係本地檔至少同遠端一樣長——要麼下載完咗，要麼爛咗。剷咗重新攞，唔係靠估。

**砌件**讀 output 檔自己嘅長度睇上次去到邊，將嗰段 prefix 重讀一次，一路驗證入面已有嘅每一份 part。呢下讀嘅成本係 re-copy 嘅一個零頭，同時證明咗碟上已有嘅 bytes 係啱嘅——天真嘅「seek 去尾繼續寫」永遠證明唔到呢樣嘢。最後一份完整 part 之後嘅嘢會被丟棄而唔係信任，因為一次中斷寫入結尾嗰啲 bytes 正正係最有可能唔齊嘅 bytes。Prefix 嘅 bytes 同聲稱擁有佢哋嘅 parts 對唔上嘅話，由第一份唔對嘅 part 開始重新 copy。

### 保安筆記（Security notes）

- **冇嘢會成個 load 入 memory。**每個操作都係一 MiB 一 MiB 咁 stream。呢個格式服務嘅檔本身裝唔入 memory，對一個 20 GB archive 做 `readFile` 唔係慢，係 crash。
- **Part 名走唔出自己個 directory。**見上面 manifest 格式嗰段。
- **Zip entry 走唔出目的地。**每個 entry 名對住目的地解析、normalise 之後再比較；絕對路徑、drive letter、backslash 爬升、內嵌 NUL 同 symbolic link 全部拒絕，而且一個載住一個惡意 entry 嘅 archive，會喺佢任何無辜 entry 寫出之**前**被整個拒絕。
- **每個 entry 嘅 CRC-32 讀嗰陣都會查**，解壓出嚟長度同 archive 聲稱唔一樣嘅 entry 會被拒絕。呢個係兩個獨立檢查嘅第二個：解壓任何嘢之前，成個 archive 已經對住發佈嘅 SHA-256 證明過，所以 CRC 捉嘅係 decompressor 出錯，唔係傳輸出錯。
- **個 zip reader 係淨用 `node:zlib` 寫嘅，冇 native dependency。**Packaging 配置喺三個地方講明呢份合約：esbuild inline 晒每個 runtime dependency、冇 `node_modules` tree 入到 asar、冇 native module 入到 packaged application。啲現成 zip library 會打破佢——`yauzl-promise` 拖埋 `@node-rs/crc32` 入嚟，嗰個係 esbuild 唔肯 bundle 嘅 `.node` addon，Electron build 直接 fail。支援 store 同 deflate；用其他方式壓縮嘅 entry 會**點名**拒絕而唔係寫垃圾出嚟，加密嘅 entry 一樣拒絕。
- **支援 Zip64，而且喺呢度唔係可有可無。**過咗 4 GB，或者過咗 65,535 個 entries，zip 會將真嘅 size 同 offset 放喺 Zip64 records，喺傳統欄位留低 `0xFFFFFFFF` sentinels。一個照字面信嗰啲數嘅 reader 會 seek 去 offset 4294967295，然後將一個好端端嘅 20 GB 世界報做 corrupt。
- **Public release 永遠唔需要 token。**冇 token 就用 CDN 下載 URL，唔使認證，亦唔受未認證 API 每粒鐘六十個 request 嘅限制；否則一個二十份嘅世界一個下載就使咗三分之一個 limit。有 token 就用 API asset URL，而 HTTP 層喺 redirect 去 storage 嗰個 cross-origin 跳轉會落走 `Authorization` header，所以個 token 永遠到唔到 CDN。

### 驗證（Verification）

測試對應（全部喺 `design/` 下面）：斬件、砌件、損毀、續傳、邊界、manifest 驗證——`design/packages/parts/src/parts.test.ts`；讀 release 同發現 parts——`design/packages/app/src/main/download/release.test.ts`；`Range` 續傳同 ranged request 嘅三個答案——`design/packages/app/src/main/download/http.test.ts`；zip 解壓同每個 path-escape 情況——`design/packages/app/src/main/download/extract.test.ts`；zip reader 本身（store、deflate、Zip64、CRC 失敗、截斷）——`design/packages/app/src/main/download/zip.test.ts`；成條下載路徑 end to end 對住一個真嘅斬開 archive——`design/packages/app/src/main/download/downloader.test.ts`；啲行、失敗分類、events 贏碟上紀錄——`design/packages/ui/src/components/downloads/downloads.test.ts`；個 panel 同進行緊嘅下載對數、讀返完成咗嘅——`design/packages/ui/src/components/downloads/ReleaseDownloads.test.ts`；行嘅 log disclosure 同 auto-scroll checkbox（預設剔、`role="log"` 加 `aria-live="off"`、剔住就跟、untick 就唔跟、手動碌暫停但唔 untick、碌返落底恢復、永遠唔碌走文字選取、永遠唔郁 keyboard focus、偏好捱得過重新 mount）——`design/packages/ui/src/components/downloads/DownloadRowCard.test.ts`。

執行：

```sh
cd design && npx vitest run packages/parts packages/app packages/ui/src/components/downloads
```

**佢哋冇一個證明到嘅嘢：**上面每個測試都係揸住一個扮 GitHub endpoints 嘅替身行。未試過經應用程式自己個 panel 由 github.com fetch 一個 asset，所以靠 GitHub 行為而唔係靠呢啲 code 嘅部分——特別係去 storage 嘅 redirect 同 rate limits——未對住個服務證明過。個 panel 亦冇 capture。

呢個 package 亦喺一個真心唔就手嘅大小操練過：一個 400 MB 檔斬做三份 150 MB parts 再砌返，兩邊 SHA-256 對過，另外一次砌件刻意喺 part 中間打斷再續傳。兩次都同源檔 digest 一致。

### 相關閱讀

- [`docs/render-in-actions.md`](render-in-actions.md)——喺 CI render 世界，即係產生呢頁要運送嗰啲大 map 嘅嘢。
- [`scripts/README.md`](../scripts/README.md)——release 時嘅 scripts，包括 `split-parts.mjs` 同 `join-parts.mjs`。
- `design/packages/parts/src/manifest.ts`——個格式，每個欄位隔籬都有佢嘅理由。
- `design/packages/app/src/main/download/downloader.ts`——下載步驟嘅次序，同點解個次序就係設計。
- `design/packages/app/src/main/download/zip.ts`——個 zip reader，包括點解係手寫同 Zip64 改變咗乜。
- `design/packages/ui/src/components/downloads/`——個 panel 本身、佢啲行，同一個失敗點樣變成一個解釋加一條去可以修正嘅設定嘅路。
