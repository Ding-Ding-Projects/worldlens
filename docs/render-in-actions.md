# Rendering a world in GitHub Actions

**This is for computers that cannot render a big world themselves.** Rendering is hours of
CPU and gigabytes of disk; on a thin laptop that is an afternoon of the fan at full speed
and, on some machines, a render that never finishes. A GitHub standard runner has 4 vCPU
and nothing else to do, and this workflow will use as many of them in parallel as the world
needs. Its free disk is not assumed from the published spec — the plan job measures it live
with `df` and checks it against the render's own estimate before dispatching anything; see
[Disk: measured, not assumed](#disk-measured-not-assumed) below. Your machine uploads the
world and then waits.

### Reopening a failed run

The application persists cloud-render records so closing the window cannot lose a run that is
still useful. On restart it now maps the persisted `rendered`, `failed` and `cancelled` stages back
to those exact visible states. A failed record does not return as a `running` row with an endless
spinner.

Terminal rows include **Remove from list**, protected by the ordinary two-key and full-slider
confirmation. This removes only the local history record under the configured map-storage folder.
It does not cancel or delete the GitHub Actions run, its release, or any remote asset. A row still
running cannot be removed through this action.

### Reopening a run that was still going

A record at `dispatched` with a real run id is resumed automatically when this screen loads. The
resume path is deliberately narrower than starting again:

- it follows only the run id already stored in the local record;
- it does not fingerprint or upload the current world;
- it cannot dispatch a replacement workflow;
- simultaneous requests from multiple mounted copies of the screen share one main-process
  operation instead of turning the second request into a false `already-running` failure; and
- an unexpected exception is persisted as a terminal failure, so the next restart does not repeat
  an endless spinner with no explanation.

The artifact endpoint must be called through GitHub CLI's normal JSON API redirect. Supplying
`Accept: application/octet-stream` is rejected by current GitHub CLI with HTTP 415 before any bytes
are downloaded. Worldlens therefore uses the CLI's normal vendor JSON Accept header and streams the
redirected zip into the bounded destination file.

The complete UI path was verified on 2026-08-19 with
[run 32229964127](https://github.com/Ding-Ding-Projects/worldlens-bayville-example/actions/runs/32229964127).
The workflow planned one shard, rendered it, merged and verified the result, and published a
1,865,207-byte `rendered-map` artifact. Worldlens downloaded it after restart, matched GitHub's
published SHA-256 `354d391bc59bcb428c99a92201d2aca1fdff28c38e2829a0fc695b1c8bf9cdc6`, wrote the render record,
restored the row as `rendered`, and opened the collected map in the viewer. The test world was a
generated disposable fixture; no personal world data appears in the repository or documentation.

![A cancelled cloud-render row restored after restart with its local removal action](./screenshots/lowlevel-ci-render-history-fixed.png)

![Two-key confirmation stating that GitHub data is not deleted for a cancelled row](./screenshots/lowlevel-ci-render-remove-confirmation.png)

![Cloud-render history after the cancelled local row was removed](./screenshots/lowlevel-ci-render-row-removed.png)

This image is from the real current Electron build on a Lowlevel MCP off-screen Windows desktop.
The app was reached through its command palette and scrolled through background mouse input; no
renderer state was injected.

No Java, no BlueMap and no local rendering: start the **Render world** workflow, wait, and
download the map as an artifact. The desktop app can drive the whole loop for you — see
[Doing it from the app](#doing-it-from-the-app) — and the map it brings back opens exactly
like one rendered locally. For a world that changes on its own and needs nobody to press
the button, see [Scheduled re-rendering](./scheduled-render.md): a separate workflow checks
cheaply for a change on a chosen cadence and only starts this one when it finds one.

### The price of that, stated up front

Advertising the upside alone is how somebody wastes an afternoon, so:

- **Uploading is the slow part now.** The world has to reach GitHub before anything can
  render it. A multi-gigabyte world on a domestic connection is measured in hours, not
  minutes, and it is bandwidth you pay for either in time or in a cap.
- **A private repository's Actions minutes are finite.** Public repositories get unlimited
  standard-runner minutes; private ones spend from a monthly allowance, and a sharded
  render spends one runner-minute per runner per minute — a 30-way split burns thirty
  times the wall-clock time.
- **A very large world can still exceed a job's budget.** Six hours is the hard limit per
  job; the plan splits to stay under it, and a world that needs more shards than the twelve
  declared waves can hold fails in the plan step rather than rendering part of itself.
- **There is an upload ceiling.** A world whose archive would pass a release asset's 2 GiB
  limit cannot be sent as one asset, which is what the `release-asset` source reads.

None of that makes it a bad trade for the machine this exists for. It makes it a trade.

When the world is too big for one job, the workflow splits it across parallel jobs and
merges the results. Getting that merge right is most of what this document is about,
because two of the three ways it can go wrong produce a map that looks fine and is
quietly incorrect.

<details>
<summary><b>Contents</b></summary>

- [Running it](#running-it)
- [`map-id` accepts anything; BlueMap sanitizes it before using it as a path](#map-id-accepts-anything-bluemap-sanitizes-it-before-using-it-as-a-path)
- [Doing it from the app](#doing-it-from-the-app)
- [Mojang's EULA](#mojangs-eula)
- [How the split is decided](#how-the-split-is-decided)
- [Disk: measured, not assumed](#disk-measured-not-assumed)
- [Why shard edges land on block 32k+2](#why-shard-edges-land-on-block-32k2)
- [Texture ordinals: the trap, and the evidence](#texture-ordinals-the-trap-and-the-evidence)
- [The lowres layers, which are not a union](#the-lowres-layers-which-are-not-a-union)
- [What the merge does, layer by layer](#what-the-merge-does-layer-by-layer)
- [Verification](#verification)
- [End-to-end evidence](#end-to-end-evidence)
- [Limits and things this does not do](#limits-and-things-this-does-not-do)
- [Running the pieces locally](#running-the-pieces-locally)

</details>

## Running it

Actions → **Render world** → Run workflow.

| Input                 | What it does                                                                 |
| --------------------- | ---------------------------------------------------------------------------- |
| `world-source`        | `repository`, `url` or `release-asset`                                       |
| `world`               | where the world is, read according to `world-source` — see below             |
| `dimension`           | overworld, nether or end                                                     |
| `map-id` / `map-name` | the storage id used in paths, and the display name in the webapp             |
| `output`              | `artifact`, or `artifact-and-pages` to also publish it                       |
| `budget-minutes`      | how long one job may spend rendering before the world is split (default 240) |
| `max-jobs`            | cap on parallel jobs (default 64; GitHub itself refuses more than 256)       |
| `force-shards`        | skip the estimate and use exactly this many shards                           |

### `map-id` accepts anything; BlueMap sanitizes it before using it as a path

Type whatever `map-id` you like — `test-issue44-staging`, `My Map (v2)`, anything. Nothing
here refuses a hyphen, a space, or any other character, and it should not: upstream BlueMap
does not refuse them either. Instead, when BlueMap loads a shard's `maps/<map-id>.conf` file,
it runs the id through its own sanitiser before using it as the map's on-disk storage
directory name —
[`BlueMapConfigManager.sanitiseMapId`](../vendor/BlueMap/common/src/main/java/de/bluecolored/bluemap/common/config/BlueMapConfigManager.java):

```java
private String sanitiseMapId(String id) {
    return id.replaceAll("\\W", "_");
}
```

Java's `\W` here is the _default_, ASCII-only word class (nothing on this call path sets
`UNICODE_CHARACTER_CLASS`), so `\w` means exactly `[A-Za-z0-9_]` and `\W` is everything
outside it. Every character that is not an ASCII letter, digit or underscore — hyphens,
spaces, dots, parentheses, accented and non-Latin letters, emoji, anything — becomes an
underscore. `test-issue44-staging` therefore renders correctly but lands on disk as
`test_issue44_staging`, confirmed against a real render's `settings.json`
(`"maps":["test_issue44_staging"]`) in issue #47.

**This project mirrors that exact rule rather than inventing a stricter one.** The single
source of truth is `sanitizeMapId` in
[`design/packages/render-actions/src/bluemap.ts`](../design/packages/render-actions/src/bluemap.ts),
tested against the upstream rule (including the non-hyphen cases above) in
`bluemap.test.ts`. Every place that predicts or looks for BlueMap's real storage directory —
`config/renderConfig.ts`'s `mapDirectory`, `resume/marker.ts`'s `inspectShard` (backing both
`resume-check` and `shard-complete`), and `cli.ts`'s shard/partial directory resolution
(backing `merge`, `verify` and `merge-lowres`) — calls it, so a hyphenated or otherwise
`\W`-carrying `map-id` is found, counted and merged correctly rather than silently reported
as "0 hires tiles" for a render that worked. `render-world.yml`'s `plan` job also exposes the
already-sanitized id as its `map-id` output, which every downstream job path (the merged
output directory, the published `site/maps/<id>`, the partial-merge staging shape) uses
instead of re-deriving the rule in shell.

The only place the _raw_, un-sanitized id is deliberately kept is the `maps/<map-id>.conf`
file name itself — that is what BlueMap's own sanitiser reads and transforms at load time,
so writing an already-sanitized file name there would be redundant, not required — and the
human-facing `map-name` display string, which is never used in a path at all.

### `world`, one field with three meanings

| `world-source`  | what `world` holds                           | example                              |
| --------------- | -------------------------------------------- | ------------------------------------ |
| `repository`    | a path inside this repository                | `worlds/world`                       |
| `url`           | a link to a `.zip` holding the world         | `https://example.com/world.zip`      |
| `release-asset` | an asset name or glob, optionally `tag/glob` | `world*.zip`, or `v1.4.0/world*.zip` |

For `release-asset` the tag defaults to `latest`. The split is on the **last** slash, and a
release asset's file name cannot contain one, so a tag that does — `release/1.4` — still
works.

> This used to be three separate inputs, consolidated because GitHub documents a cap of
> **ten** `workflow_dispatch` inputs and this file had twelve.

Whatever the source, the world is checked before anything is rendered: there has to be a
`level.dat` and a region directory holding `.mca` files for the dimension you asked for.
An archive with a wrapper folder inside it is handled — the check looks up to three
directories down — and a directory that is not a world fails with a message naming what
it found instead of rendering an empty map.

The result is the **rendered-map** artifact: the complete BlueMap webapp with the map
inside it. Serve the unzipped folder over http; opening `index.html` off the file system
will not work, because the webapp fetches its tiles.

### Publishing to Pages, and the one detail that decides whether it works

`artifact-and-pages` hosts the finished map on this repository's GitHub Pages site, in
addition to producing the downloadable artifact. In the app, the CI render screen offers
it as a tick box, off by default — rendering a world is a private act until somebody says
otherwise, and Pages is public whether or not the repository is.

A repository has one Pages site, and the documentation workflow publishes to the same one.
Rather than one taking the other down, the merge job rebuilds the documentation site and
places the map **underneath it at `/map/`**, so both survive. It refuses outright if the
documentation site already publishes something at `/map/`, rather than overwriting it. The
two workflows share the `pages` concurrency group, so they queue instead of racing.

#### Creating a repository from the app, and retrying honestly

The desktop app can create a public or private repository, install the managed workflows,
enable Actions, configure workflow-based Pages, and dispatch the selected world without
leaving the rendered flow. The public path requires both the upload disclosure (when an
upload is needed) and the stronger public-world disclosure. The Pages checkbox stays an
explicit choice.

The repository name is not assumed to be `worldlens`. The site build and its base-path
assertion both derive `/<repository>/` from the repository that dispatched the workflow.
This matters for app-created repositories: a build can emit the correct new prefix and still
be rejected by a verifier that checks the old project name.

A failed run is terminal evidence, not a run to follow forever. Pressing **Render on GitHub**
again reuses a verified unchanged world archive, clears the terminal run id, and dispatches a
fresh workflow run. Only a record still at `dispatched` may resume its existing run after an
application restart. The dispatch state clears the old id, URL, number and failure in the same
durable write, so a restart while GitHub is still listing the new run cannot reattach to the
previous failure.

Resumed shards cache the complete `bluemap-out` web root, not only `bluemap-out/maps`.
The viewer shell is part of the merge input: restoring completed tiles without it produces no
`webapp` artifact and makes the merge fail even though rendering succeeded. Cache layout v2
uses a separate namespace so a map-only v1 cache cannot be accepted as complete.

Private repository creation and private workflow execution are separate facts. Pages setup may
be refused by the account or plan; the app keeps the exact provider response on the same screen
and allows Pages to be turned off before dispatch. A private workflow can also be refused before
any job starts when account billing or spending limits block Actions. That is an external run
state, not proof that the renderer ran or failed.

#### Why a map that works locally can load to an empty sky

The engine stores hires tiles gzipped: the file on disk is `0.prbm.gz`, and the map's
texture data is `textures.json.gz`. The viewer asks for `0.prbm` and `textures.json`
— _unless_ the web app's `settings.json` says `clientDecompression: true`, in which case it
appends `.gz` itself and inflates the bytes in the browser with `DecompressionStream`.

Upstream defaults that to `false`, correctly, because BlueMap's own web server answers a
request for `0.prbm` out of `0.prbm.gz`. So does this app's embedded server
([render-console.md](render-console.md)). **GitHub Pages does no such thing.** It serves
the files that exist, under the names they have, and 404s everything else. There is no
rewrite rule to add — that is the whole point of it.

So before the map is combined with the documentation site, the merge job runs:

```
node design/packages/render-actions/dist/cli.js static-host --web-root site
```

which flips that flag, **checks the flip against the files actually on disk**, writes
`.nojekyll` (Pages otherwise runs the site through Jekyll, which silently drops anything
whose name starts with an underscore), measures the site against GitHub's limits, and
**exits non-zero rather than publishing a site nobody can use**. A map rendered with
compression off is the case that check exists for: it has `textures.json` and no `.gz`, so
flipping the flag would point the viewer at files nobody wrote.

Verified against a real CI-rendered map published to a real Pages site: the tile URL the
viewer requests returns `200` with gzip magic bytes, and the uncompressed name returns
`404` — which is exactly why the flag has to be set.

#### What Pages will not host

| Limit                                                | What happens                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A map delivered in parts (more than one merge group) | Publishing is skipped, with a note in the run summary. No single runner ever holds the whole map, which is the point of the split — see [large-worlds.md](large-worlds.md). |
| 1 GB site                                            | GitHub's soft limit. `static-host` reports the size and warns past it; publishing may be refused or throttled.                                                              |
| 100 MB per file                                      | GitHub's hard limit. `static-host` fails the run rather than discovering it mid-push.                                                                                       |
| 100 GB/month bandwidth                               | GitHub's soft limit on serving. A popular map is a lot of tiles.                                                                                                            |

## Doing it from the app

`design/packages/app/src/main/cirender/` drives the five manual steps above as one action:

```
upload the world  ->  start the workflow  ->  follow the run  ->  fetch the map  ->  register it
   (main/backup/)      (cirender/actions)     (cirender/sync)    (main/download/)   (main/render/)
```

It reuses what already exists rather than reimplementing any of it. The upload is the
backup subsystem — the same deterministic packer, the same append-only release rules, the
same public-repository warning, word for word ([backup.md](backup.md)). The transfer and
the unpack are the download subsystem's own. The credential comes from the app's GitHub
session. The map is mounted by the render subsystem, so it appears in the map list beside
every local render and the viewer cannot tell the two apart.

### What it refuses, and why each refusal exists

| Refusal                             | Why                                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eula-not-accepted`                 | Mojang's licence has not been accepted on this computer. The app will not accept it for somebody; it points at the setting that already asks.                     |
| `public-not-acknowledged`           | The repository is PUBLIC and the warning has not been accepted. A world carries builds, coordinates and whatever a friend left in a chest.                        |
| `upload-not-acknowledged`           | Uploading a world sends it to GitHub, and that is said in as many words before it happens rather than after.                                                      |
| `world-too-large`                   | The archive would pass a release asset's 2 GiB limit. Refused **before** anything is packed, from the folder's own byte total.                                    |
| `unsupported-dimension`             | The project's map renders a dimension the workflow's `dimension` choice does not offer. Caught here rather than as GitHub's generic 422.                          |
| `map-shipped-in-parts`              | The run published `map-lowres` plus hires parts. Unpacking the lowres alone gives a map that loads and has no detail at any zoom, which reads as a broken render. |
| `run-failure`, `run-timed_out`, ... | The run ended badly. The failing job is named and the tail of its log is carried back, and **no map is downloaded or registered**.                                |

### An unchanged world is not uploaded twice

Before packing anything, the world is fingerprinted: one `stat` pass hashing each file's
relative path, size and modification time. If that matches what was uploaded last time
**and** GitHub still holds that asset on that release, the upload is skipped entirely and
the workflow is dispatched against the release that is already there.

Both halves matter. The local record says what _was_ uploaded; only GitHub can say what is
still there, and a release somebody deleted by hand would otherwise have a re-sync dispatch
a run whose first step cannot find the world. The fingerprint is a change detector rather
than a content digest — a file edited and restored to exactly its old size _and_ mtime
reads as unchanged — so there is a **Upload again even if the world looks unchanged**
control for the case where it is wrong. Computing the real digest means packing the whole
world, which is most of the cost of the upload it would be avoiding.

### It resumes, because closing the app is the likeliest interruption

Every durable fact is written down as it happens: the fingerprint that was uploaded, the
tag and asset it went to, the run that dispatch produced, and how it ended. There is no
separate resume command — starting a sync reads that record first, so closing the
application during a four-hour render and reopening it afterwards finds the run by its id,
reads its outcome, and collects the map.

### Two GitHub credentials, one chosen per sync

A typical machine holds two: the app's own sign-in and `gh`'s. They are not
interchangeable — `gh` routinely carries an enterprise host, an SSO session an organisation
has already authorised, or scopes the in-app flow never asked for. So:

- the **in-app sign-in is preferred** when it exists and can actually see the workflow;
- **`gh` is a real fallback**, not an error message: `gh` on `PATH` plus `gh auth status`
  succeeding is enough to dispatch, follow and download without signing in to the app;
- "gh is not installed" and "gh is installed but nobody is signed in" are reported as
  different sentences, because they have different remedies;
- whichever is chosen **drives every call of that sync**. Dispatching on one credential and
  downloading on another works on a machine where both are authorised and fails halfway
  through on one where only one is;
- when the selected in-app account has to fall back to `gh`, the application finds that login
  in `gh`'s real signed-in account inventory. If it is signed in but inactive, the application
  runs `gh auth switch --hostname <host> --user <login>`, re-reads the inventory, and verifies
  `gh api user` before any release is created. The switch is machine-wide and is deliberately
  left active, matching `gh`'s established account-switch contract rather than quietly restoring
  a different identity after the upload;
- the route is shown on the screen before the button and named on every failure, because
  "permission denied" is unactionable when a person cannot tell which of their two sign-ins
  was refused.

`gh auth login` is **never** driven from inside the app. It suppresses its device-code
prompt when stdin is not a terminal, so a spawned one prints nothing and hangs for ever;
the app says which command to run in a real terminal and detects the result on the next
check. Uploading uses the same packer, part names, digests and resume rules on both credential
routes; only the transport changes. `gh release create` and `gh release upload` receive the
target as `--repo [HOST/]OWNER/REPO`, because those commands do not support `--hostname`.
Enterprise routing is therefore explicit without passing a token or silently falling back to
github.com. A missing account, refused switch, unhealthy account, or identity mismatch stops
before the release command and offers the GitHub accounts settings from the same panel.

### What the workflow cannot be told

The map's own `maps/<id>.conf` is ninety-odd settings of HOCON and there are nine
`workflow_dispatch` inputs, of a documented maximum of ten. **None of the map config travels
through them.** A CI render uses BlueMap's defaults for everything the inputs do not name.
The app reads the project's map config, lists the top-level keys it holds, and says which
settings will not be applied — before the dispatch, not after the picture comes back
looking ordinary.

## Mojang's EULA

This workflow accepts [Mojang's EULA](https://www.minecraft.net/eula) on behalf of the
repository owner, who has already accepted it in the desktop application. There is no
tick box and no second confirmation: dispatch the workflow and it renders.

The desktop app checks that acceptance before it dispatches anything, and refuses when it
is missing. It has no tick box of its own for it either: the acceptance lives in one place,
asked once at first run, and a second door onto a legal acceptance is how one becomes a
button people click to get on with what they were doing.

The acceptance is real and worth stating plainly. BlueMap downloads a Minecraft client
jar from Mojang's servers to get the block models and textures, and it cannot render a
map without one — `accept-download: true` in `core.conf` is what permits that download.
The generated config file says so in a comment, and the run summary repeats it.

A fork that does not want to accept on its owner's behalf sets the repository variable
`BLUEMAP_ACCEPT_DOWNLOAD` to `false`. The render then refuses the download and fails
rather than proceeding.

## How the split is decided

The planner measures the world instead of trusting anything it was told:

1. Every `r.<x>.<z>.mca` file is found, and its **anvil location table** is read to count
   how many of its 1024 chunk slots are actually occupied. A region holding forty chunks
   is planned as forty chunks.
2. The bounding box is derived from the region files that exist.
3. The render time is estimated, and the estimate is printed with its assumptions.

The estimate starts from a real measurement: **3969 chunks rendered to 961 hires tiles in
80 seconds**, using the vendored BlueMap 5.22-27 CLI on a developer workstation. That is
49.6 chunks per second. Two adjustments follow, both stated in the run summary:

- **Runner slowdown, ×0.5.** A GitHub standard runner has 4 vCPU and is slower per core
  than the machine the reference came from.
- **Complexity, ×0.1 to ×1.0.** Terrain complexity dominates render time, and the cheapest
  proxy available before rendering is how many bytes a chunk takes on disk — the same
  block and entity variety that makes a chunk large makes it slow. The factor is
  `sqrt(4104 / bytesPerChunk)`, clamped, where 4104 is the reference world's bytes per
  chunk. It is capped at 1.0, so a world simpler than the reference is never assumed to
  be faster than it.

A ×1.5 safety margin is applied, and the shard count is
`ceil(estimatedSeconds / budgetSeconds)`.

This is an estimate and it says so. If you have measured your own world, pass the real
rate and every assumption above is skipped:

```
plan --rate 31.5 ...
```

The shard grid is laid over the **region** grid, kept as close to square as the world's
shape allows. Shards whose rectangle contains no region files at all are dropped rather
than started, so a sparse or corridor-shaped world does not spend jobs rendering nothing.

### More than 256 jobs

GitHub refuses a matrix that expands past 256 entries. A plan needing more shards than
that is therefore rendered in **sequential waves** of at most 256, each wave a matrix that
waits for the one before it. Nothing is truncated and no shard is silently enlarged to fit:
600 shards become three waves of 256, 256 and 88.

The workflow declares twelve wave jobs, so 3,072 shards. A plan needing more fails in the
plan step with the number it needs rather than rendering part of the world. Every wave is
independently resumable, so a run that dies in wave 7 costs that wave and not the six
before it. [resumable-renders.md](resumable-renders.md) has the arithmetic, the caching and
the completion markers that make it work.

`--max-jobs` still caps the plan, and when the cap is what binds, **each shard covers a
larger area** — the world is never truncated. The run summary says so in as many words,
gives the number of jobs the estimate wanted, and gives the per-shard time to expect
instead of the budget:

> The estimate asked for 1350 jobs but only 256 fit inside the 256-job limit, so each
> shard covers a larger area and is expected to take about 2h 11m rather than the 1h
> budget. Nothing is being skipped; the jobs are simply longer.

If those shards would exceed the six-hour job limit, raise `max-jobs` so more shards are
planned across more waves, or raise `budget-minutes` so the arithmetic is honest and split
the render by dimension.

**Measured on a real hosted run**, not only reasoned about: a 369,664-chunk, 361-region-file
world dispatched with a deliberately small `budget-minutes` so the planner's own arithmetic (not
`--force-shards`) asked for 361 shards — past the 256-job matrix limit for the first time this
project has hosted-run-verified. The plan chose **2 waves**; Wave 1 fanned out to all 256 shards
and every one completed; Wave 2 then appeared carrying exactly the remaining 105
(`wave2-needed: true`, shards 256–360) and began executing before the run was cancelled once the
sequencing was confirmed. See
[large-worlds.md's "Measured: a real two-wave hosted dispatch"](large-worlds.md#measured-a-real-two-wave-hosted-dispatch)
for the full numbers and the run link.

### Disk: measured, not assumed

A GitHub standard runner's published spec has already been caught understating its real
free disk by a wide margin — see [world-sources.md](world-sources.md), where a runner
documented as having roughly 14 GB free actually reported 87 GB free before anything was
cleaned up. The plan step no longer trusts that published number for anything.

Instead, `design/packages/render-actions/src/plan/disk.ts` estimates how much free disk the
render needs at its two disk-heaviest points, and the workflow checks that estimate against
what the runner actually has:

- **Fetching a split-archive world** briefly needs room for three copies of the world at
  once — the downloaded parts, the archive they are joined into, and the tree it is
  unpacked to. The module's `FETCH_PEAK_MULTIPLIER` (3.2×) comes from a real measurement:
  rendering the 6.6 GB Andyville world through this workflow peaked around 21 GB above
  baseline while holding all three.
- **One shard's job** needs the world plus its own share of the rendered tiles, at the
  measured density of roughly 2.5× the world's size for the full map (`TILE_OUTPUT_RATIO`),
  scaled down by that shard's fraction of the world's chunks, plus a fixed margin for the
  Minecraft client jar, its extracted resources and BlueMap's runtime data.

The larger of those two figures, with a 1.2× safety margin (`DISK_SAFETY_FACTOR`), is what
gets checked. The plan job's **Check the runner has enough free disk for this plan** step
runs `df --output=avail -B1 .` on the runner it is actually executing on — not the
published spec — and compares the result to that required figure. It runs once, before any
wave is dispatched and before the (possibly large) world artifact is uploaded, so an
undersized runner fails here with the exact numbers and a named reason, instead of a shard
runner dying mid-render with a bare "no space left on device". Render fewer dimensions per
run, trim the world, or dispatch on a runner with more disk to clear it.

Measured again on the two-wave run described above: the plan required `5825668056` bytes
(~6 GiB with the check's rounding) and the runner reported ~84 GiB free — the same order-of-
magnitude gap between the published spec and a runner's real disk that the Andyville figures
above already showed, this time confirmed on a `ubuntu-latest` runner mid-plan rather than
inferred from a different step. The check passed comfortably, so this run says nothing about
where the ceiling actually is — only that it is well above 6 GiB.

## Why shard edges land on block 32k+2

This is the detail that makes everything else work.

BlueMap's hires tile grid is **32 blocks with an offset of 2**. `BmMap` builds it as
`new Grid(settings.getHiresTileSize(), 2)`, and the `settings.json` of any rendered map
confirms it:

```json
"hires": { "tileSize": [32, 32], "scale": [1, 1], "translate": [2, 2] }
```

So hires tile column `cx` covers blocks `32*cx + 2` through `32*cx + 33`. Tile 15 is
blocks 482 to 513, and tile 16 starts at 514.

An anvil region is 512 blocks, and 512 is a multiple of 32 — but **not** of 32 with the
offset. A shard cut on a region boundary therefore lands _inside_ a hires tile, and both
neighbouring shards render that tile, each with the other half masked away. They write
the same file path with different contents, one silently wins, and a 32-block stripe of
terrain is missing from the map.

Measured, with a cut at block 512 on a 1000×1000 world:

```
lod0  a=496  b=496  overlap=31  identical=0  DIFFERING=31
```

Thirty-one hires tiles produced twice, in two different versions, with no error anywhere.

The planner therefore rounds every interior cut up to the next hires tile boundary:
a region edge at `512*r` becomes `512*r + 2`. Two block columns move to the preceding
shard, which costs nothing. The outermost shard on each side is left **unbounded**, so
the shards' masks partition the whole plane and nothing can fall between two of them.
`validatePlanAlignment` checks both properties before any rendering starts, because the
failure it prevents is invisible afterwards.

### `render-edges: false`

The generated shard configs turn `render-edges` off. With it on, BlueMap treats every
block outside the render-mask as air — correct for someone deliberately cutting a slice
out of a world, wrong for a shard, whose neighbouring blocks are real and are being
rendered by somebody else. Leaving it on changes the lighting of the tiles along each
shard's edge and produces visible seams.

With it off, the mask only decides which columns get rendered, and a shard's tiles come
out **byte for byte identical** to the same tiles from an unsharded render. That is the
property the whole hires merge rests on, and it is measured below.

## Texture ordinals: the trap, and the evidence

Rendered tiles do not name their textures. They store an **ordinal** into the map's
`textures.json`, which is a bare array indexed by that ordinal. If two shards number
their textures differently, merging their tiles produces a map where blocks render with
each other's textures — stone looking like leaves — and nothing anywhere reports an
error. It is the single most dangerous thing about sharding a BlueMap render.

**The ordinals are deterministic for a fixed resource pack.** Two independent lines of
evidence:

### From the source

`core/src/main/java/de/bluecolored/bluemap/core/map/TextureGallery.java`:

```java
public synchronized void put(ResourcePool<Texture> texturePool) {
    this.put(ResourcePack.MISSING_TEXTURE, ResourcePack.MISSING_TEXTURE.getResource()); // put this first
    texturePool.entrySet()
            .stream()
            .sorted(Comparator
                    .comparing((Map.Entry<Key, Texture> entry) ->  {
                        Texture texture = entry.getValue();
                        return texture != null && texture.getColorPremultiplied().a < 1f;
                    })
                    .thenComparing(entry -> entry.getKey().getFormatted())
            )
            .forEach(entry -> put(entry.getKey(), entry.getValue()));
}
```

Ordinals are assigned by `nextId++` in iteration order, so the question is whether that
order is total. It is:

- The missing-texture goes in first and unconditionally, so it is always ordinal 0.
- The pool is then sorted by half-transparency, then by `Key#getFormatted()`.
- `Key` is a map key, so its formatted value is unique within the pool — `Key#equals` is
  `formatted == that.formatted` on an interned string, so two distinct keys cannot share
  a formatted value.

A unique final sort key makes the comparator a **total order**, so the sequence is a pure
function of the pool's contents and does not depend on `HashMap` iteration order. The
audit in this repository's port said the same; this confirms it against the Java.

`BmMap` reinforces it: the constructor loads any gallery already in storage before
calling `put`, and `put(Key, Texture)` preserves an existing key's ordinal. So a shard
pre-seeded with a gallery keeps those ordinals, and a shard starting empty derives them
from the pool alone.

### From an actual render

Two disjoint shards of the same generated world, rendered separately:

```
=== textures.json.gz sha256
dfb92b13e6cf46bbc1a7fa0d0c565daab21ddb40a47b1d26595a451f0baaca91  shard a
dfb92b13e6cf46bbc1a7fa0d0c565daab21ddb40a47b1d26595a451f0baaca91  shard b
=== decompressed sha256
dacf8e325dbf3085999b4149e03e1be2bf4c9efedb7b3c14cc71f36c41b19b18  shard a  (2424728 bytes)
dacf8e325dbf3085999b4149e03e1be2bf4c9efedb7b3c14cc71f36c41b19b18  shard b  (2424728 bytes)
VERDICT: textures.json IDENTICAL
```

Byte-identical, compressed and decompressed, and identical again to the unsharded
reference render. `settings.json` matched across all three too.

### So the merge asserts it anyway

Determinism holds _for a fixed resource pack_. What is not guaranteed is that every shard
resolved the same one: a client jar downloaded at a moment when Mojang published a new
version, a mod jar present on one runner and not another, a partial download. Any of
those changes the pool, changes the ordinals, and corrupts the merge silently.

So `mergeShardMaps` decompresses every shard's `textures.json`, compares the bytes, and
**refuses to merge** if any differ, naming the shards and their hashes. The comparison is
on the decompressed bytes so a difference in gzip settings can never be mistaken for a
difference in ordinals. There is a test that feeds it two galleries holding the same two
textures in opposite order and asserts the merge refuses.

## The lowres layers, which are not a union

Hires tiles can be unioned once the cuts are aligned. The lowres layers cannot, for two
independent reasons, and both were found by measurement rather than by reading.

### Shards actively erase each other's terrain

A shard does not simply skip the tiles outside its render-mask. `HiresModelManager`:

```java
public void unrender(Vector2i tile, TileMetaConsumer tileMetaConsumer) {
    storage.delete(tile.getX(), tile.getY());
    Color color = new Color();
    tileGrid.forEachIntersecting(tile, Grid.UNIT, (x, z) ->
            tileMetaConsumer.set(x, z, color, 0, 0)
    );
}
```

It **deletes** the tile and writes transparent black at height 0 and block-light 0 across
every column that tile covered. Those writes land in the shared lod-1 lowres tiles, and
`LowresTile#set` stamps alpha `0xFF` on the meta pixel for an erasure exactly as it does
for real terrain. A shard's lowres tile therefore contains active denials of terrain its
neighbours rendered, and "take the first shard that wrote this pixel" would let the
denials win.

Measured on the same two-shard render: **509409 lod-1 pixels** where one shard held real
terrain and the other held an erasure.

The merge resolves it by ranking three states rather than two:

| State                              | Meta alpha | Colour and height | Wins against |
| ---------------------------------- | ---------- | ----------------- | ------------ |
| rendered terrain                   | 0xFF       | any non-zero      | everything   |
| erased, or a genuinely void column | 0xFF       | all zero          | untouched    |
| never touched                      | 0          | all zero          | nothing      |

An erasure and a truly void column are indistinguishable, and that is harmless: both
shards then write the identical empty pixel, so the merged result is the same either way.
Two shards holding _different_ terrain for one pixel is impossible when every column is
rendered by exactly one shard, so that case is reported as an error rather than guessed
at.

### Lod 2 and above are wrong at the source

BlueMap builds each coarse lod while rendering, in `LowresLayer#saveTile`: every time it
saves a lod-1 tile it averages 5×5 pixel blocks out of it and writes them into lod 2.

A shard's lod-1 tile is half empty — lowres tiles are 500 blocks square on an unoffset
grid, so they straddle every shard cut no matter where it is put. Averaging over it folds
the pixels the shard never rendered in as transparent black. The resulting lod-2 pixel is
**wrong**, and it carries the same alpha `0xFF` as a correct one, so no amount of
compositing can tell the two apart.

Measured: of shard `p`'s lod tiles, only 2 of 4 at lod 2 and 2 of 4 at lod 3 matched the
reference render, versus 14 of 16 at lod 1.

So the shards' lod 2 and above are **discarded**, and the pyramid is rebuilt from the
merged lod 1 — which is the only complete source of truth, because lod 1 is written
directly from block data. The rebuild reimplements `LowresLayer#saveTile`'s arithmetic,
including the shared-edge writes that keep tile seams invisible.

It reimplements the float arithmetic too. Upstream's `Color` holds `float` fields and
`Color#getInt` **truncates** rather than rounds, so averaging twenty-five samples in
double precision and truncating lands on a different byte from doing it in single
precision. Every operation in the rebuild is wrapped in `Math.fround`. A uniform group of
colour 40 comes back as 39, in Java and here alike; reproducing that is the point, since
a tidier 40 would put every rebuilt tile permanently out of step with a directly rendered
one.

## What the merge does, layer by layer

| Layer              | Treatment                                                       |
| ------------------ | --------------------------------------------------------------- |
| `textures.json.gz` | asserted byte-identical across shards, then copied from shard 0 |
| `settings.json`    | asserted byte-identical, then copied from shard 0               |
| `tiles/0` (hires)  | disjoint union, with zero path collisions asserted              |
| `tiles/1` (lod 1)  | composited pixel by pixel, terrain over erasure                 |
| `tiles/2`+         | shards' versions discarded, rebuilt from the merged lod 1       |
| `live/`            | placeholders, copied from shard 0                               |
| `assets/`          | union; differing duplicates are an error                        |
| `rstate/`          | **not merged** — see below                                      |

`rstate` is BlueMap's own record of which tiles it considers up to date. Its files group
tiles into regions that straddle shard cuts, so no shard's copy describes the merged map.
Carrying one anyway would make a later incremental render skip tiles that still need
doing. Leaving it out makes the next render start from scratch: slow and correct, rather
than fast and wrong. The published map does not read it. The merge counts what it left
out and says so.

A shard's `rstate` **is** cached between runs, which does not contradict this: it is cached
per shard, under a key nothing else can restore, and it goes back to the same shard
rendering the same rectangle rather than into a merged map.
[resumable-renders.md](resumable-renders.md#how-rstate-is-cached-without-reintroducing-the-merge-bug)
sets the two side by side.

## Verification

The merge is checked rather than assumed, because everything it can get wrong is silent:

- **Hires tiles are a disjoint union.** No path was produced by more than one shard.
- **Hires tile count.** The shards' totals equal the merged total, with the missing and
  unexpected counts reported separately.
- **Hires tiles copied without alteration.** Every tile is compared byte for byte against
  the shard it came from.
- **Shard-boundary tiles decompress and parse.** Tiles either side of every cut are
  gunzipped and checked for a PRBM header — version byte `1` then the format-info byte
  `0b00000111` that `PRBMWriter` emits. These are exactly the tiles a misaligned split
  would have damaged.
- **Map metadata present.** `settings.json` and a texture gallery are both there.
- **Lowres pyramid built at every lod.** No lod promised by the map settings is empty.

Each check reports its numbers rather than a pass mark, and the run summary tabulates
them.

## End-to-end evidence

A 1000×1000 generated world (3969 chunks, 4 region files) was rendered three times: once
whole, and once as two shards cut at block 514 with `render-edges: false`.

Shard output against the unsharded reference:

```
ref=961  p=496  q=465  p+q=961
PATH COLLISIONS between p and q: 0
missing from union: 0        extra in union: 0
byte-identical to reference: 961/961
```

Merged output against the unsharded reference:

```
hires: ref=961 merged=961 missing=0 extra=0 byteDiff=0
lod1:  refTiles=16 mergedTiles=16 pixels=4016016 colorDiff=0 metaDiff=0
lod2:  refTiles=4  mergedTiles=4  pixels=1004004 colorDiff=0 metaDiff=0
lod3:  refTiles=4  mergedTiles=4  pixels=1004004 colorDiff=0 metaDiff=0
```

Every hires tile byte-identical, and every one of 6024024 lowres pixels identical in both
colour and metadata, at every level of detail.

### And again as a 2×2 split, through the real CLI

A one-dimensional cut never reaches the case where four shards meet on one corner, so the
whole pipeline was then run again as a 2×2 grid — `plan`, four `config` calls, four
renders, `merge`, `verify` — using the same commands the workflow runs:

```
render-mask per shard:  {max-x 513, max-z 513}  {min-x 514, max-z 513}
                        {max-x 513, min-z 514}  {min-x 514, min-z 514}

Merged 961 hires tiles (256 + 240 + 240 + 225), composited 15 of 16 lod-1 tiles
overruledErasures: 1281987      conflictingPixels: 0      collisions: []

ok  hires tiles are a disjoint union
ok  hires tile count: 256 + 240 + 240 + 225 = 961; 0 missing, 0 unexpected
ok  hires tiles copied without alteration: 961 compared byte for byte, 0 differ
ok  shard-boundary tiles decompress and parse: 16 checked, 0 problems
ok  map metadata present
ok  lowres pyramid built at every lod

hires: ref=961 merged=961 missing=0 extra=0 byteDiff=0
lod1:  pixels=4016016 colorDiff=0 metaDiff=0
lod2:  pixels=1004004 colorDiff=0 metaDiff=0
lod3:  pixels=1004004 colorDiff=0 metaDiff=0
```

Identical again. The merged map is not merely close to the map an unsharded render would
have produced; on this world it is the same map.

That is one world on one machine. It is a strong result and it is not a proof for every
world: it exercised no mods, no custom resource pack, and one flat generated terrain.

## Limits and things this does not do

- **The world travels as an artifact.** It is fetched once and uploaded, so a thirty-way
  split does not download the same archive thirty times. Artifact storage and the runner's
  measured free disk are the practical ceiling on world size — not a published figure. The
  plan job estimates what the render needs (see
  [Disk: measured, not assumed](#disk-measured-not-assumed)) and checks it against `df` on
  the runner it is actually running on, before any wave is dispatched. A world too large
  fails there, by name, rather than a shard runner dying mid-render with no space left on
  device.
- **Six hours per job.** The workflow sets a 350-minute timeout and the render step a
  300-minute one. A shard that exceeds it does not lose its work: its render state is
  cached and a re-dispatched run carries it on. Lower `budget-minutes` so more shards are
  planned if you would rather it did not happen at all. See
  [resumable-renders.md](resumable-renders.md).
- **Nether and end are rendered as separate runs**, one dimension per run, each with its
  own `map-id`.
- **Markers, players and other live data are not rendered.** Placeholder `live/` files are
  carried through so the webapp has something to load.
- **The merge is single-threaded Node.** On a very large map the lod rebuild is the slow
  part; it is proportional to the lod-1 tile count, not to the hires tile count.
- **`rstate` is not merged**, so a later incremental render of the merged map re-renders
  everything.
- **The app's CI sync sends the world as one release asset**, so its ceiling is GitHub's
  2 GiB per asset — refused before packing rather than discovered after an hour of it. A
  larger world can still be rendered by this workflow through the `repository` or `url`
  sources, or dimension by dimension.
- **The app collects only the single `rendered-map` artifact.** A map that shipped in parts
  is refused with the artifacts named, and assembled by hand from the run summary.
- **Cancelling a sync in the app stops watching the run, not the run.** A render already
  going on GitHub carries on there, and a later sync can still collect it.

## Running the pieces locally

The logic is a workspace package, not shell in the workflow, so all of it runs locally:

```bash
cd design
pnpm --filter "@worldlens/render-actions..." run build

node packages/render-actions/dist/cli.js plan   --world path/to/world --out plan.json
node packages/render-actions/dist/cli.js config --plan plan.json --shard 0 --world path/to/world
node packages/render-actions/dist/cli.js merge  --shards shards --plan plan.json --out map/world
node packages/render-actions/dist/cli.js verify --plan plan.json --shards shards --merged map/world
```

Each command takes `--help`. The tests cover world measurement against a world this
repository generates itself, shard planning for one shard, many shards and a world that
would exceed 256 jobs, the lowres composite and lod rebuild, and merge failures including
a deliberate `textures.json` mismatch:

```bash
cd design
npx vitest run packages/render-actions
```

### Real Pages capture

The following capture is from the hosted tiny test world, not a mock or a hand-edited image.
It records the browser address and the map viewer after the published URL answered `200`:

![The hosted tiny test world in the BlueMap viewer, served from GitHub Pages: the viewer's own control bar across the top with live x and z readouts both at zero, and the rendered ground a small sand-coloured patch in the lower right of an otherwise empty frame, because the world is deliberately tiny](screenshots/map-hosted-on-github-pages.png)

The UI-created Bayville repository provides the larger end-to-end proof. Its final workflow
run `32246619712` succeeded through render, merge and Pages deployment. Anonymous requests to
the documentation root and `/map/` returned HTTP 200, then isolated guest Edge captured each
live surface through the Lowlevel headless route:

![The live Worldlens documentation home published alongside Bayville, with searchable tabs, navigation, settings and the Windows download action visible](screenshots/bayville-pages-home.png)

![The live Bayville World v10.1 BlueMap at the Pages map route, with the full rendered terrain, towns, roads, rivers, forests, snow and lake visible](screenshots/bayville-pages-map.png)

## 廣東話

### 呢個係做咩嘅

呢份文件講點樣喺 GitHub Actions 度 render 一個世界（Rendering a world in GitHub Actions）。**佢係為咗嗰啲自己 render 唔到大世界嘅電腦而存在嘅。** Render 要用幾個鐘 CPU 同幾 GB 硬碟；喺一部薄身手提電腦上面，咁樣即係成個下晝把風扇都全速轉，而喺某啲機上面個 render 係永遠都完唔到。一部 GitHub standard runner 有 4 vCPU 而且冇第二樣嘢做，呢個 workflow 會按世界嘅需要盡量用晒佢哋並行去做。佢嘅可用硬碟**唔會**照抄官方公佈嘅 spec —— plan job 會用 `df` 即場量度，再同 render 自己嘅估算比較，先至派發任何嘢出去（睇下面「Disk：實測，唔係靠估」）。你部機負責上傳個世界，之後就等。

唔使裝 Java、唔使裝 BlueMap、唔使喺本機 render：開 **Render world** workflow、等、然後將幅地圖當 artifact 下載返嚟。桌面 app 可以幫你行晒成個流程（睇「喺 app 入面做」），而佢攞返嚟嘅地圖同本機 render 出嚟嘅開起上嚟一模一樣。如果個世界會自己變、又唔想有人喺度撳掣，就睇 [scheduled-render.md](./scheduled-render.md)：嗰度有另一個 workflow 會按你揀嘅節奏用平價方法檢查有冇改動，搵到先至叫呢個 workflow 開工。

### 事先講清楚要付出啲乜

淨係吹好處就係浪費人哋一個下晝嘅做法，所以：

- **而家慢嘅係上傳。** 個世界要先去到 GitHub 度先有得 render。幾 GB 嘅世界喺住宅寬頻上面係以鐘頭計，唔係以分鐘計，而呢啲頻寬你唔係用時間找數就係用流量上限找數。
- **私人 repository 嘅 Actions minutes 係有限嘅。** 公開 repository 有無限 standard-runner 分鐘；私人嘅就要食每月配額，而分咗 shard 嘅 render 每個 runner 每分鐘就燒一個 runner-minute —— 分 30 路即係燒 30 倍嘅實際時間。
- **極大嘅世界仍然可以爆咗一個 job 嘅預算。** 每個 job 硬性上限六個鐘；plan 會切到唔超過呢條線，而如果一個世界需要嘅 shard 多過已聲明嘅十二個 wave 載得落嘅數量，佢會喺 plan 步驟度直接失敗，而唔會 render 咗一半世界出嚟。
- **上傳有天花板。** 如果個世界打包出嚟會過咗 release asset 嘅 2 GiB 上限，就冇辦法當一個 asset 咁送出去，而 `release-asset` 呢個 source 就係讀呢樣嘢。

以上冇一樣令佢對呢類機器嚟講變成一單蝕本生意，只係話畀你聽呢係一單交易。

當個世界大到一個 job 做唔晒，workflow 就會將佢分去多個並行 job，再將結果 merge 返埋。整啱個 merge 就係呢份文件講嘅大部分內容，因為三種出錯方式入面有兩種係會整出一幅睇落好正常、但其實靜靜雞錯咗嘅地圖。

### 點樣行（Running it）

Actions → **Render world** → Run workflow。

輸入欄位嘅意思：`world-source` 揀 `repository`、`url` 定 `release-asset`；`world` 就係世界喺邊，按 `world-source` 去解讀；`dimension` 揀 overworld、nether 定 end；`map-id` 係喺路徑度用嘅 storage id，`map-name` 係 webapp 度顯示嘅名；`output` 揀 `artifact`，或者 `artifact-and-pages`（順便發佈出去）；`budget-minutes` 係一個 job 可以花幾耐 render 先至要切世界（預設 240）；`max-jobs` 係並行 job 上限（預設 64；GitHub 自己都唔畀超過 256）；`force-shards` 就係跳過估算、直接用你指定嘅 shard 數。

### `map-id` 咩都收得，但 BlueMap 攞佢做路徑之前會 sanitize

你想打乜嘢 `map-id` 都得 —— `test-issue44-staging`、`My Map (v2)`，乜都得。呢度冇任何嘢會拒絕連字號、空格或者其他字元，而且亦都唔應該拒絕：上游 BlueMap 自己都唔會拒絕。反而係當 BlueMap 載入某個 shard 嘅 `maps/<map-id>.conf` 嗰陣，佢會將個 id 過一次自己嘅 sanitiser，先至攞嚟做地圖喺磁碟上嘅 storage 目錄名 ——
[`BlueMapConfigManager.sanitiseMapId`](../vendor/BlueMap/common/src/main/java/de/bluecolored/bluemap/common/config/BlueMapConfigManager.java)：

```java
private String sanitiseMapId(String id) {
    return id.replaceAll("\\W", "_");
}
```

Java 呢度個 `\W` 係 _預設_ 嘅、只認 ASCII 嘅 word class（呢條 call path 上面冇任何嘢設過 `UNICODE_CHARACTER_CLASS`），所以 `\w` 準確嚟講就係 `[A-Za-z0-9_]`，而 `\W` 就係佢以外嘅一切。凡係唔屬於 ASCII 字母、數字或者底線嘅字元 —— 連字號、空格、點、括號、帶重音同非拉丁字母、emoji，乜都好 —— 都會變成底線。所以 `test-issue44-staging` render 得啱，但落到磁碟就係 `test_issue44_staging`，呢點喺 issue #47 度用真實 render 嘅 `settings.json`（`"maps":["test_issue44_staging"]`）核實過。

**呢個 project 係照抄嗰條規則，而唔係自己發明一條更嚴嘅。** 唯一嘅 source of truth 係
[`design/packages/render-actions/src/bluemap.ts`](../design/packages/render-actions/src/bluemap.ts) 入面嘅 `sanitizeMapId`，喺 `bluemap.test.ts` 度對住上游規則測試（連上面嗰啲唔係連字號嘅個案都測埋）。凡係要預測或者搵 BlueMap 真實 storage 目錄嘅地方 —— `config/renderConfig.ts` 嘅 `mapDirectory`、`resume/marker.ts` 嘅 `inspectShard`（`resume-check` 同 `shard-complete` 都靠佢）、同埋 `cli.ts` 嘅 shard／partial 目錄解析（`merge`、`verify` 同 `merge-lowres` 都靠佢）—— 全部都會叫佢，所以帶連字號或者其他 `\W` 字元嘅 `map-id` 都搵得返、數得啱、merge 得啱，而唔會將一個其實成功咗嘅 render 靜靜雞報成「0 hires tiles」。`render-world.yml` 嘅 `plan` job 亦都會將已經 sanitize 咗嘅 id 當自己嘅 `map-id` output 放出嚟，下游每個 job 路徑（merge 出嚟嘅目錄、發佈嘅 `site/maps/<id>`、partial-merge 嘅 staging 結構）都係用佢，而唔係喺 shell 度再推導多次條規則。

唯一刻意保留 _原始、未 sanitize_ id 嘅地方，就係 `maps/<map-id>.conf` 個檔名本身 —— 因為 BlueMap 自己個 sanitiser 就係喺載入嗰陣讀同轉呢個名，所以喺嗰度寫個已經 sanitize 咗嘅檔名係多餘、唔係必要 —— 另外就係畀人睇嘅 `map-name` 顯示字串，佢完全唔會出現喺任何路徑入面。

### `world`：一個欄位三種意思

`world-source` 係 `repository` 嗰陣，`world` 放嘅係呢個 repository 入面嘅路徑（例如 `worlds/world`）；係 `url` 嗰陣就放一條指向載住個世界嘅 `.zip` 嘅連結（例如 `https://example.com/world.zip`）；係 `release-asset` 嗰陣就放 asset 名或者 glob，可以係 `tag/glob` 格式（例如 `world*.zip` 或者 `v1.4.0/world*.zip`）。

`release-asset` 嘅 tag 預設係 `latest`。切割係睇**最後**嗰個斜線，而 release asset 嘅檔名本身唔可以有斜線，所以就算 tag 入面有斜線 —— 例如 `release/1.4` —— 一樣行得。

呢度本來係三個獨立輸入，後來合併咗，因為 GitHub 文件寫明 `workflow_dispatch` 輸入上限係**十個**，而呢個檔案有十二個。

唔理個 source 係邊種，render 之前都會先檢查個世界：一定要有 `level.dat`，同埋有一個 region 目錄載住你指定嗰個 dimension 嘅 `.mca` 檔。壓縮檔入面包多一層 folder 係處理到嘅 —— 檢查會向下搵最多三層目錄 —— 而如果個目錄根本唔係一個世界，佢會失敗並且講返佢搵到嘅係乜，而唔係 render 一幅空地圖出嚟。

結果係 **rendered-map** artifact：完整嘅 BlueMap webapp 連埋幅地圖喺入面。解壓之後要用 http 伺服嗰個 folder；直接喺檔案系統度開 `index.html` 係唔得嘅，因為個 webapp 要 fetch 佢啲 tile。

### 發佈去 Pages，同埋決定成敗嘅嗰個細節

`artifact-and-pages` 除咗照樣出一份可下載嘅 artifact 之外，仲會將完成咗嘅地圖 host 喺呢個 repository 嘅 GitHub Pages 站上面。喺 app 入面，CI render 畫面用一個剔格提供呢個選項，預設係熄嘅 —— render 一個世界喺有人講明之前都係一件私人嘅事，而 Pages 係公開嘅，唔理個 repository 係咪公開。

一個 repository 只有一個 Pages 站，而 documentation workflow 都係發佈去同一個。為咗唔好互相拆對方台，merge job 會重新 build 份 documentation 站，再將幅地圖放喺**佢下面嘅 `/map/`**，咁兩邊都生存到。如果份 documentation 站本身已經喺 `/map/` 發佈緊嘢，佢會直接拒絕，唔會蓋過去。兩個 workflow 共用 `pages` 呢個 concurrency group，所以佢哋會排隊，唔會撞埋一齊。

#### 由 app 建立 repository，同埋老實 retry

Desktop app 可以喺同一個 rendered flow 入面建立 public 或 private repository、安裝 managed workflows、啟用 Actions、設定 workflow-based Pages，再 dispatch 揀好嘅 world。Public 路線喺需要 upload 時一定要確認 upload disclosure，亦一定要另外確認更強嘅 public-world disclosure；Pages checkbox 永遠係明確選擇。

Repository 名唔會假設一定係 `worldlens`。Site build 同 base-path assertion 都會由實際 dispatch workflow 嘅 repository 推導 `/<repository>/`。呢點對 app 新建嘅 repository 特別重要：build 可以正確輸出新 prefix，但如果 verifier 仲檢查舊 project 名，一樣會錯手拒絕。

Failed run 係 terminal evidence，唔係永遠跟住睇嘅 run。再撳 **Render on GitHub** 會重用已驗證而且冇改變嘅 world archive，清走 terminal run id，再 dispatch 一個新 workflow run。只有仍然係 `dispatched` 嘅 record 先可以喺 app restart 後 resume 原有 run。Dispatch state 會喺同一個 durable write 清走舊 id、URL、number 同 failure，避免 GitHub 仲未列出新 run 時重開 app 又黐返舊 failure。

Resumed shard 會 cache 完整 `bluemap-out` web root，唔係淨係 `bluemap-out/maps`。Viewer shell 都係 merge input 一部分：淨係 restore 完成 tiles 而冇佢，就唔會有 `webapp` artifact，render 明明成功都會喺 merge 失敗。Cache layout v2 用獨立 namespace，舊 map-only v1 cache 唔可以扮完整。

Private repository 建立成功，同 private workflow 真係執行到，係兩件事。Pages setup 可以因帳戶或者 plan 被拒；app 會喺同一畫面保留 provider 原文，亦容許 dispatch 前關掉 Pages。Account billing 或 spending limit 亦可能喺任何 job 開始前拒絕 private workflow；嗰個係外部 run state，唔代表 renderer 跑過或者 render 失敗。

#### 點解一幅喺本機行得嘅地圖，上到去會載出一片空天

引擎儲 hires tile 係 gzip 過嘅：磁碟上嘅檔案係 `0.prbm.gz`，而地圖嘅 texture 資料係 `textures.json.gz`。Viewer 要求嘅係 `0.prbm` 同 `textures.json` —— _除非_ web app 嘅 `settings.json` 寫住 `clientDecompression: true`，咁樣佢就會自己加返 `.gz`，喺瀏覽器度用 `DecompressionStream` 解壓。

上游預設係 `false`，而且咁樣係啱嘅，因為 BlueMap 自己個 web server 收到 `0.prbm` 嘅請求會攞 `0.prbm.gz` 出嚟答。呢個 app 嘅內嵌 server 都係咁（[render-console.md](render-console.md)）。**但 GitHub Pages 完全唔會咁做。** 佢淨係按檔案本來嘅名去伺服真係存在嘅檔案，其他一律 404。呢度冇 rewrite rule 加得 —— 咁樣正正就係 Pages 嘅重點。

所以喺幅地圖同 documentation 站合埋一齊之前，merge job 會行：

```
node design/packages/render-actions/dist/cli.js static-host --web-root site
```

呢句會反轉個 flag、**再對住磁碟上真正存在嘅檔案核實嗰個反轉係咪啱**、寫 `.nojekyll`（唔寫嘅話 Pages 會將個站過一次 Jekyll，而 Jekyll 會靜靜雞掉咗所有名字以底線開頭嘅嘢）、量度個站有冇超出 GitHub 嘅限制，並且**寧願 exit non-zero 都唔會發佈一個冇人用得到嘅站**。一幅關咗壓縮 render 出嚟嘅地圖就係呢個檢查存在嘅原因：佢有 `textures.json` 而冇 `.gz`，如果照反轉個 flag，viewer 就會去搵一啲根本冇人寫過嘅檔案。

呢點喺一幅真實 CI render、發佈到真實 Pages 站嘅地圖上面核實過：viewer 要求嗰條 tile URL 回 `200` 而且開頭係 gzip magic bytes，而未壓縮嗰個名回 `404` —— 呢個正正就係點解一定要 set 嗰個 flag。

#### Pages 唔會 host 啲乜

有四類情況要留意。第一，分咗幾份交付嘅地圖（多過一個 merge group）：發佈會被跳過，run summary 會有註明；冇任何一部 runner 揸住成幅地圖，而咁樣正正就係分 shard 嘅目的（睇 [large-worlds.md](large-worlds.md)）。第二，1 GB 站容量：呢個係 GitHub 嘅軟性上限，`static-host` 會報返個 size 同埋超過就警告，發佈有機會被拒或者被節流。第三，每個檔案 100 MB：呢個係 GitHub 嘅硬性上限，`static-host` 會令個 run 失敗，而唔會等到 push 到一半先發現。第四，每月 100 GB 頻寬：GitHub 對伺服嘅軟性上限，一幅受歡迎嘅地圖係好多好多 tile。

### 喺 app 入面做

`design/packages/app/src/main/cirender/` 將上面五個手動步驟變成一個動作：

```
upload the world  ->  start the workflow  ->  follow the run  ->  fetch the map  ->  register it
   (main/backup/)      (cirender/actions)     (cirender/sync)    (main/download/)   (main/render/)
```

佢係重用已經有嘅嘢，冇一樣係重新實作。上傳用嘅係 backup 子系統 —— 同一個 deterministic packer、同一套 append-only release 規則、同一段公開 repository 警告，一字不改（[backup.md](backup.md)）。傳輸同解壓係 download 子系統本身嘅嘢。憑證嚟自 app 嘅 GitHub session。幅地圖由 render 子系統掛載，所以佢會同每一幅本機 render 出嚟嘅地圖一齊出現喺地圖清單度，而 viewer 分唔出兩者。

### 佢會拒絕啲乜，同埋點解每個拒絕都存在

`eula-not-accepted`：呢部電腦未接受過 Mojang 嘅授權；app 唔會代人接受，佢會指向本來就有問嘅嗰個設定。`public-not-acknowledged`：個 repository 係 PUBLIC 而個警告未被接受 —— 一個世界載住啲建築、座標，同埋朋友喺個箱度剩低嘅所有嘢。`upload-not-acknowledged`：上傳一個世界即係將佢送去 GitHub，呢句要喺事前講清楚，唔係事後先講。`world-too-large`：打包出嚟會過 release asset 嘅 2 GiB 上限，係喺**打包之前**就用 folder 自己嘅 byte 總數拒絕。`unsupported-dimension`：project 嘅地圖 render 嘅 dimension 唔喺 workflow 個 `dimension` 選項入面，喺呢度攔截好過收到 GitHub 一個籠統嘅 422。`map-shipped-in-parts`：個 run 發佈咗 `map-lowres` 加啲 hires 部件；淨係解壓 lowres 會得到一幅載得到、但任何 zoom 都冇細節嘅地圖，睇落就好似 render 壞咗。`run-failure`、`run-timed_out` 等等：個 run 收得唔好，佢會講出邊個 job 失敗、將嗰個 job 嘅 log 尾段帶返嚟，而且**唔會下載或者註冊任何地圖**。

### 冇改過嘅世界唔會上傳兩次

打包任何嘢之前，個世界會被 fingerprint：行一次 `stat`，將每個檔案嘅相對路徑、大小同修改時間 hash 埋。如果同上次上傳嘅一樣，**而且** GitHub 上面嗰個 release 仲有嗰個 asset，就會完全跳過上傳，直接對住已經喺度嗰個 release 派發 workflow。

兩邊都重要。本機嗰份紀錄講嘅係 _曾經_ 上傳過乜；只有 GitHub 先講到而家仲有乜，而如果有人手動刪咗個 release，冇呢層檢查就會派發一個第一步就搵唔到世界嘅 run。呢個 fingerprint 係一個改動偵測器，唔係內容摘要 —— 一個改完再改返、size _同_ mtime 都同原本一模一樣嘅檔案會被當成冇變 —— 所以有個 **Upload again even if the world looks unchanged** 控制項應付佢判斷錯嘅情況。要計真正嘅 digest 就要打包成個世界，而咁樣已經係佢想慳嗰次上傳嘅大部分成本。

### 佢識續做，因為熄咗個 app 係最有可能嘅中斷

每一件耐久嘅事實都會即時寫低：上傳咗嘅 fingerprint、去咗邊個 tag 同 asset、派發出嚟嗰個 run、以及佢點樣完結。冇一個獨立嘅 resume 指令 —— 開始一次 sync 嗰陣會先讀嗰份紀錄，所以喺四個鐘嘅 render 中途熄咗個 application、之後再開返，會靠 id 搵返個 run、讀返佢嘅結果，然後收返幅地圖。

### 兩個 GitHub 憑證，每次 sync 揀一個

一部典型嘅機會有兩個：app 自己嘅登入同 `gh` 嘅。佢哋唔可以互換 —— `gh` 好多時會帶住一個 enterprise host、一個機構已經授權咗嘅 SSO session，或者一啲 app 內流程從來冇要求過嘅 scope。所以：

- 當 **app 內登入** 存在而且真係睇到個 workflow 嗰陣，優先用佢；
- **`gh` 係真正嘅後備**，唔係一句錯誤訊息：`PATH` 上面有 `gh` 加上 `gh auth status` 成功，就已經夠去派發、追蹤同下載，唔使登入個 app；
- 「gh 未安裝」同「gh 裝咗但冇人登入」係用唔同句子報出嚟嘅，因為兩者嘅解決方法唔同；
- 揀咗邊個就 **由佢負責嗰次 sync 嘅每一個呼叫**。用一個憑證派發、用另一個下載，喺兩邊都有授權嘅機上面行得通，但喺只有一邊有授權嘅機上面就會做到一半死；
- 當選咗嘅 app 內帳戶要退返落 `gh` 嗰陣，application 會喺 `gh` 真正嘅已登入帳戶清單度搵返嗰個 login。如果佢登入咗但唔係 active，application 會行 `gh auth switch --hostname <host> --user <login>`、重新讀一次清單，並且喺建立任何 release 之前用 `gh api user` 核實。呢個切換係全機生效，而且係刻意留住唔還原嘅，跟返 `gh` 一貫嘅帳戶切換約定，而唔係上傳完之後靜靜雞換返另一個身份;
- 揀咗邊條路會喺撳掣之前顯示喺畫面上，而且每次失敗都會講返邊條路，因為當一個人分唔清自己兩個登入邊個被拒嗰陣，「permission denied」係完全冇嘢做得到嘅。

`gh auth login` **永遠唔會** 喺 app 入面被驅動。當 stdin 唔係 terminal 嗰陣佢會收起 device-code 提示，所以 spawn 出嚟嗰個乜都唔會印而且會永遠掛住；app 會講出要喺真 terminal 度行邊句指令，然後喺下一次檢查嗰陣偵測結果。兩條憑證路線嘅上傳都用同一個 packer、同一套 part 名、同一批 digest 同同一套 resume 規則；唔同嘅淨係傳輸方式。`gh release create` 同 `gh release upload` 收目標嘅方式係 `--repo [HOST/]OWNER/REPO`，因為呢兩個指令唔支援 `--hostname`。咁樣 enterprise 路由就係明示嘅，唔使傳 token，亦唔會靜靜雞跌返落 github.com。帳戶唔存在、切換被拒、帳戶唔健康、或者身份對唔上，都會喺 release 指令之前停低，並且喺同一個面板度提供 GitHub 帳戶設定。

### Workflow 收唔到嘅嘢

地圖自己嗰份 `maps/<id>.conf` 有九十幾項 HOCON 設定，而 `workflow_dispatch` 輸入得九個（文件寫明最多十個）。**冇任何 map config 經得過呢啲輸入。** 一次 CI render 對於輸入冇講到嘅嘢一律用 BlueMap 嘅預設值。App 會讀 project 嘅 map config、列出佢有嘅頂層 key，然後講明邊啲設定唔會被套用 —— 係喺派發之前講，唔係等幅畫返嚟睇落好普通之後先講。

### Mojang 嘅 EULA

呢個 workflow 代 repository 擁有者接受 [Mojang 嘅 EULA](https://www.minecraft.net/eula)，因為佢已經喺桌面 application 度接受咗。呢度冇剔格亦冇第二次確認：派發個 workflow，佢就會 render。

桌面 app 喺派發任何嘢之前會檢查嗰個接受紀錄，冇就拒絕。佢自己都冇為呢件事開一個剔格：接受紀錄只住喺一個地方、喺第一次啟動嗰陣問一次；為一個法律上嘅接受開第二道門，就係令佢變成一個「人哋為咗繼續做手上嘢而撳」嘅掣。

呢個接受係真嘅，值得講清楚。BlueMap 要由 Mojang 嘅伺服器下載一個 Minecraft client jar 攞 block model 同 texture，冇咗佢就 render 唔到地圖 —— `core.conf` 入面嘅 `accept-download: true` 就係允許呢個下載嘅嘢。生成出嚟嗰個 config 檔喺註解度有寫明，run summary 亦都會重複一次。

如果有 fork 唔想代自己個 owner 接受，就將 repository variable `BLUEMAP_ACCEPT_DOWNLOAD` set 做 `false`。咁 render 就會拒絕嗰個下載並且失敗，而唔會繼續行落去。

### 點樣決定點切（How the split is decided）

Planner 唔會信人哋話畀佢聽嘅嘢，佢會自己量：

1. 搵晒每個 `r.<x>.<z>.mca` 檔，讀佢嘅 **anvil location table**，數下佢嗰 1024 個 chunk slot 之中真係有嘢嘅有幾多個。一個得四十個 chunk 嘅 region 就當四十個 chunk 嚟計劃。
2. Bounding box 由真正存在嘅 region 檔推導出嚟。
3. 估算 render 時間，而且連埋佢嘅假設一齊印出嚟。

估算由一個真實量度開始：**3969 個 chunk render 成 961 塊 hires tile，用咗 80 秒**，用嘅係 vendored BlueMap 5.22-27 CLI，喺一部開發者工作站上面。即係每秒 49.6 個 chunk。跟住有兩個調整，兩個都會喺 run summary 度講明：

- **Runner 減速，×0.5。** GitHub standard runner 有 4 vCPU，每個核都慢過參考嗰部機。
- **複雜度，×0.1 到 ×1.0。** 地形複雜度主導 render 時間，而 render 之前拎得到嘅最平代理指標就係一個 chunk 喺磁碟上佔幾多 byte —— 令一個 chunk 變大嘅嗰啲 block 同 entity 多樣性，同樣會令佢變慢。個係數係 `sqrt(4104 / bytesPerChunk)`，有 clamp，其中 4104 係參考世界嘅每 chunk byte 數。佢封頂喺 1.0，所以一個比參考世界更簡單嘅世界，永遠都唔會被當成比佢仲快。

之後再加一個 ×1.5 安全邊際，shard 數就係 `ceil(estimatedSeconds / budgetSeconds)`。

呢個係估算，而且佢自己有講明。如果你已經量過自己個世界，就直接傳個真實速率入去，上面所有假設都會被跳過：

```
plan --rate 31.5 ...
```

Shard 網格係鋪喺 **region** 網格上面，喺世界形狀容許嘅範圍內盡量整到接近正方形。如果一個 shard 嘅矩形入面完全冇 region 檔，佢會被丟棄而唔會被啟動，咁樣一個稀疏或者走廊形嘅世界就唔會浪費 job 去 render 空氣。

### 多過 256 個 job

GitHub 唔接受一個展開超過 256 項嘅 matrix。所以一個需要多過咁多 shard 嘅計劃會用**順序 wave** 嚟 render，每個 wave 最多 256 個，每個 wave 都係一個等前一個做完嘅 matrix。冇嘢會被截短，亦冇 shard 會被靜靜雞放大去遷就：600 個 shard 變成 256、256、88 三個 wave。

Workflow 聲明咗十二個 wave job，即係 3,072 個 shard。需要多過呢個數嘅計劃會喺 plan 步驟度失敗、並講出佢需要嘅數量，而唔會 render 半個世界。每個 wave 都可以獨立 resume，所以喺 wave 7 死咗嘅 run 淨係蝕嗰個 wave，唔會蝕埋前面六個。[resumable-renders.md](resumable-renders.md) 有埋條數、caching 同令佢行得通嘅 completion marker。

`--max-jobs` 一樣會封頂個計劃，而當個上限就係綁死佢嗰樣嘢嗰陣，**每個 shard 會覆蓋更大範圍** —— 個世界永遠唔會被截短。Run summary 會白紙黑字咁講、講返估算想要幾多個 job，並且畀返每個 shard 應該預期嘅時間（而唔係嗰個 budget）：

> The estimate asked for 1350 jobs but only 256 fit inside the 256-job limit, so each
> shard covers a larger area and is expected to take about 2h 11m rather than the 1h
> budget. Nothing is being skipped; the jobs are simply longer.

如果咁樣嘅 shard 會爆咗六個鐘嘅 job 上限，就調高 `max-jobs` 令更多 shard 分散到更多 wave，或者調高 `budget-minutes` 令條數誠實返，再按 dimension 分開 render。

**呢樣嘢喺真實 hosted run 上面量度過**，唔淨係喺度講：一個 369,664 chunk、361 個 region 檔嘅世界，用一個刻意調細嘅 `budget-minutes` 派發，令 planner 自己條數（而唔係 `--force-shards`）要求 361 個 shard —— 呢個 project 第一次喺 hosted run 上面核實到超過 256-job matrix 限制。計劃揀咗 **2 個 wave**；Wave 1 展開成全部 256 個 shard 而且每個都完成咗；跟住 Wave 2 出現，帶住剩返嘅正好 105 個（`wave2-needed: true`，shard 256–360）並且開始執行，之後喺確認咗排序行為之後個 run 就被取消。完整數字同 run 連結見 [large-worlds.md 嘅 "Measured: a real two-wave hosted dispatch"](large-worlds.md#measured-a-real-two-wave-hosted-dispatch)。

### Disk：實測，唔係靠估

GitHub standard runner 官方公佈嘅 spec 已經有前科，大幅低估咗佢真正嘅可用硬碟 —— 睇 [world-sources.md](world-sources.md)，嗰度有部文件寫住大約得 14 GB 可用嘅 runner，喺乜都未清理之前實際報 87 GB 可用。Plan 步驟而家已經唔會為任何事信嗰個公佈數字。

取而代之，`design/packages/render-actions/src/plan/disk.ts` 會估算 render 喺兩個最食硬碟嘅時刻需要幾多可用空間，然後 workflow 會攞呢個估算同 runner 實際有嘅比較：

- **攞一個分割壓縮檔嘅世界** 嗰陣，短時間內要同時放得落三份世界 —— 下載返嚟嘅 part、砌返埋一齊嗰個 archive、同埋解壓出嚟嗰棵樹。模組入面嘅 `FETCH_PEAK_MULTIPLIER`（3.2×）嚟自一次真實量度：用呢個 workflow render 6.6 GB 嘅 Andyville 世界，同時揸住三份嗰陣峰值高出 baseline 大約 21 GB。
- **一個 shard 嘅 job** 需要放得落個世界，加上佢自己嗰份 render 出嚟嘅 tile，密度按實測大約係整幅地圖為世界大小嘅 2.5 倍（`TILE_OUTPUT_RATIO`），再按嗰個 shard 佔世界 chunk 嘅比例縮細，再加一個固定邊際畀 Minecraft client jar、佢解壓出嚟嘅資源同 BlueMap 嘅 runtime 資料。

兩個數字之中較大嗰個，乘埋 1.2× 安全邊際（`DISK_SAFETY_FACTOR`），就係實際會被檢查嗰個。Plan job 嘅 **Check the runner has enough free disk for this plan** 步驟會喺佢真正執行緊嗰部 runner 上面行 `df --output=avail -B1 .` —— 唔係睇公佈 spec —— 再同上面嗰個需求數字比較。佢只行一次，喺任何 wave 被派發之前、亦喺（可能好大嗰個）世界 artifact 上傳之前，所以一部空間唔夠嘅 runner 會喺呢度連準確數字同具名原因一齊失敗，而唔係等到某個 shard runner 喺 render 中途淨係扔一句「no space left on device」就死。解決方法：每個 run render 少啲 dimension、修剪個世界，或者派去一部硬碟多啲嘅 runner。

上面講嗰個 two-wave run 亦再量過一次：計劃需要 `5825668056` bytes（照個檢查嘅捨入即係約 6 GiB），而 runner 報大約 84 GiB 可用 —— 同 Andyville 嗰組數字顯示嘅一樣，公佈 spec 同 runner 真實硬碟之間差咗一個數量級，今次係喺 `ubuntu-latest` runner 嘅 plan 中途確認，而唔係由另一個步驟推斷返嚟。個檢查輕鬆通過，所以呢次 run 講唔到天花板實際喺邊 —— 淨係講到佢遠高過 6 GiB。

### 點解 shard 邊界會落喺 block 32k+2

呢個係令其他所有嘢行得通嘅細節。

BlueMap 嘅 hires tile 網格係 **32 個 block、offset 為 2**。`BmMap` 用 `new Grid(settings.getHiresTileSize(), 2)` 起佢，而任何 render 出嚟嘅地圖嘅 `settings.json` 都證實到：

```json
"hires": { "tileSize": [32, 32], "scale": [1, 1], "translate": [2, 2] }
```

所以 hires tile 列 `cx` 覆蓋 block `32*cx + 2` 到 `32*cx + 33`。Tile 15 係 block 482 到 513，而 tile 16 由 514 開始。

一個 anvil region 係 512 個 block，而 512 係 32 嘅倍數 —— 但**唔係**帶 offset 嘅 32 嘅倍數。所以一個切喺 region 邊界嘅 shard 會落喺一塊 hires tile _入面_，兩個相鄰嘅 shard 都會 render 嗰塊 tile，各自遮走對方嗰一半。佢哋寫同一個檔案路徑但內容唔同，其中一個靜靜雞贏咗，於是地圖上面就少咗一條 32 block 闊嘅地形。

喺一個 1000×1000 世界上面切喺 block 512 度量出嚟：

```
lod0  a=496  b=496  overlap=31  identical=0  DIFFERING=31
```

三十一塊 hires tile 被造咗兩次、兩個唔同版本，而任何地方都冇報錯。

所以 planner 會將每一個內部切口向上取整到下一個 hires tile 邊界：`512*r` 嘅 region 邊界變成 `512*r + 2`。兩列 block 移去前一個 shard，成本係零。每邊最外圍嗰個 shard 保持**無界**，咁樣啲 shard 嘅遮罩就分割晒成個平面，冇嘢可以跌落兩個之間。`validatePlanAlignment` 會喺任何 render 開始之前檢查呢兩個性質，因為佢防止嗰種失敗事後係睇唔到嘅。

### `render-edges: false`

生成出嚟嘅 shard config 會熄咗 `render-edges`。開住佢嘅話，BlueMap 會將 render-mask 以外嘅每個 block 當成空氣 —— 對一個刻意由世界度切一片出嚟嘅人嚟講係啱嘅，但對一個 shard 嚟講係錯嘅，因為佢隔籬啲 block 係真實存在、而且正由其他人 render 緊。開住佢會改變每個 shard 邊緣嗰啲 tile 嘅光照，整出睇得見嘅接縫。

熄咗佢之後，遮罩就淨係決定邊啲列會被 render，而一個 shard 嘅 tile 出嚟同一次冇分 shard 嘅 render 嘅同一塊 tile **逐個 byte 都一模一樣**。呢個就係成個 hires merge 依賴嘅性質，下面有量度佐證。

### Texture ordinal：個陷阱同證據

Render 出嚟嘅 tile 唔會寫低自己啲 texture 叫咩名。佢哋存嘅係一個指向地圖 `textures.json` 嘅 **ordinal**，而嗰個 json 就係一個純粹靠 ordinal 索引嘅陣列。如果兩個 shard 為自己啲 texture 編咗唔同號碼，將佢哋啲 tile merge 埋就會整出一幅 block 用住對方 texture 嘅地圖 —— 石頭睇落好似樹葉 —— 而任何地方都唔會報錯。呢樣嘢係將一次 BlueMap render 分 shard 最危險嘅事。

**對於固定嘅 resource pack，啲 ordinal 係 deterministic 嘅。** 有兩條獨立嘅證據線：

#### 由源碼睇

`core/src/main/java/de/bluecolored/bluemap/core/map/TextureGallery.java`：

```java
public synchronized void put(ResourcePool<Texture> texturePool) {
    this.put(ResourcePack.MISSING_TEXTURE, ResourcePack.MISSING_TEXTURE.getResource()); // put this first
    texturePool.entrySet()
            .stream()
            .sorted(Comparator
                    .comparing((Map.Entry<Key, Texture> entry) ->  {
                        Texture texture = entry.getValue();
                        return texture != null && texture.getColorPremultiplied().a < 1f;
                    })
                    .thenComparing(entry -> entry.getKey().getFormatted())
            )
            .forEach(entry -> put(entry.getKey(), entry.getValue()));
}
```

Ordinal 係喺迭代順序度用 `nextId++` 派出嚟嘅，所以問題就係嗰個順序係咪一個全序。答案係係：

- missing-texture 無條件第一個放入去，所以佢永遠係 ordinal 0。
- 個 pool 之後先按半透明排序，再按 `Key#getFormatted()` 排。
- `Key` 係 map 嘅 key，所以佢個 formatted 值喺 pool 入面係唯一嘅 —— `Key#equals` 係喺 interned string 上面做 `formatted == that.formatted`，所以兩個唔同嘅 key 唔可能共用同一個 formatted 值。

一個唯一嘅最終排序鍵令個 comparator 成為一個 **全序**，所以個序列純粹係 pool 內容嘅函數，唔會受 `HashMap` 迭代順序影響。呢個 repository 個 port 嘅 audit 都係咁講；呢度係對住 Java 再確認一次。

`BmMap` 再加強咗呢點：constructor 會喺叫 `put` 之前載入 storage 入面已經有嘅 gallery，而 `put(Key, Texture)` 會保留已存在 key 嘅 ordinal。所以一個預先播咗 gallery 嘅 shard 會保住嗰啲 ordinal，而一個由空開始嘅 shard 就純粹由 pool 推導出嚟。

#### 由真實 render 睇

同一個生成世界嘅兩個互不相交嘅 shard，分開 render：

```
=== textures.json.gz sha256
dfb92b13e6cf46bbc1a7fa0d0c565daab21ddb40a47b1d26595a451f0baaca91  shard a
dfb92b13e6cf46bbc1a7fa0d0c565daab21ddb40a47b1d26595a451f0baaca91  shard b
=== decompressed sha256
dacf8e325dbf3085999b4149e03e1be2bf4c9efedb7b3c14cc71f36c41b19b18  shard a  (2424728 bytes)
dacf8e325dbf3085999b4149e03e1be2bf4c9efedb7b3c14cc71f36c41b19b18  shard b  (2424728 bytes)
VERDICT: textures.json IDENTICAL
```

壓縮同解壓之後都係逐 byte 一樣，而且同冇分 shard 嘅參考 render 都一樣。`settings.json` 三者之間都對得上。

#### 所以 merge 照樣會斷言一次

Determinism 只係 _喺固定 resource pack 之下_ 成立。冇保證嘅係每個 shard 都解析到同一個：喺 Mojang 啱啱出咗新版嗰刻下載嘅 client jar、某部 runner 有而另一部冇嘅 mod jar、下載到一半嘅檔案。呢啲任何一樣都會改變個 pool、改變啲 ordinal，然後靜靜雞搞爛個 merge。

所以 `mergeShardMaps` 會將每個 shard 嘅 `textures.json` 解壓、比較 byte，一有唔同就**拒絕 merge**，並且講出邊啲 shard 同佢哋嘅 hash。比較係做喺解壓後嘅 byte 上面，咁樣 gzip 設定唔同就永遠唔會被誤當成 ordinal 唔同。有一個測試會餵兩個載住相同兩個 texture 但次序相反嘅 gallery 畀佢，並斷言個 merge 會拒絕。

### Lowres 層唔係 union

Hires tile 喺切口對齊咗之後可以做 union。Lowres 層唔可以，有兩個獨立原因，而兩個都係量出嚟嘅，唔係讀出嚟嘅。

#### Shard 會主動抹走對方嘅地形

一個 shard 唔係單純跳過佢 render-mask 以外嗰啲 tile。`HiresModelManager`：

```java
public void unrender(Vector2i tile, TileMetaConsumer tileMetaConsumer) {
    storage.delete(tile.getX(), tile.getY());
    Color color = new Color();
    tileGrid.forEachIntersecting(tile, Grid.UNIT, (x, z) ->
            tileMetaConsumer.set(x, z, color, 0, 0)
    );
}
```

佢會 **刪除** 嗰塊 tile，並且喺嗰塊 tile 覆蓋過嘅每一列上面寫入高度 0、block-light 0 嘅透明黑色。呢啲寫入會落喺共用嘅 lod-1 lowres tile 度，而 `LowresTile#set` 對一次抹除同對真實地形一樣，都會喺 meta pixel 上面蓋 alpha `0xFF`。所以一個 shard 嘅 lowres tile 入面載住對鄰居所 render 地形嘅主動否定，如果用「邊個 shard 先寫呢個 pixel 就用邊個」，啲否定就會贏。

喺同一個兩 shard 嘅 render 度量到：**509409 個 lod-1 pixel** 係一個 shard 有真實地形而另一個係抹除。

Merge 嘅解決方法係將狀態分三級而唔係兩級來排名：已 render 嘅地形（meta alpha `0xFF`、顏色同高度有非零值）贏晒所有嘢；已抹除、或者真係空無一物嘅列（meta alpha `0xFF`、全部零）贏「從未觸碰」；從未觸碰（alpha 0、全部零）咩都贏唔到。

一次抹除同一列真係空嘅係分唔開嘅，而咁樣係無害嘅：兩個 shard 都會寫同一個空 pixel，所以 merge 出嚟嘅結果點都一樣。至於兩個 shard 對同一個 pixel 揸住 _唔同_ 地形，喺每一列都只由恰好一個 shard render 嘅前提下係冇可能發生嘅，所以呢種情況會被當成錯誤報出嚟，而唔會靠估。

#### Lod 2 同以上喺源頭就已經錯

BlueMap 係喺 render 途中喺 `LowresLayer#saveTile` 度砌每一層粗 lod：每次儲一塊 lod-1 tile，就由佢度平均 5×5 嘅 pixel 區塊，寫入 lod 2。

一個 shard 嘅 lod-1 tile 有一半係空嘅 —— lowres tile 係 500 block 見方、鋪喺一個冇 offset 嘅網格上面，所以唔理個 shard 切喺邊，佢都必定跨過每個切口。喺佢上面做平均，就會將 shard 從來冇 render 過嗰啲 pixel 當透明黑摺埋入去。出嚟嘅 lod-2 pixel 係**錯**嘅，而佢帶住同一個啱嘅 pixel 一樣嘅 alpha `0xFF`，所以任何合成手法都分唔出兩者。

實測：shard `p` 嘅 lod tile 之中，lod 2 得 4 塊中 2 塊、lod 3 得 4 塊中 2 塊同參考 render 對得上，而 lod 1 就 16 塊中有 14 塊對得上。

所以啲 shard 嘅 lod 2 同以上會被 **丟棄**，個金字塔會由 merge 完嘅 lod 1 重新砌返 —— 因為 lod 1 係唯一完整嘅 source of truth，佢係直接由 block 資料寫出嚟嘅。重砌嗰段程式碼重新實作咗 `LowresLayer#saveTile` 嘅算術，包括令 tile 接縫睇唔見嘅共用邊寫入。

佢連浮點算術都重新實作埋。上游嘅 `Color` 揸 `float` 欄位，而 `Color#getInt` 係 **截斷** 而唔係四捨五入，所以用雙精度平均二十五個樣本再截斷，同用單精度做，落到嘅 byte 係唔同嘅。重砌入面每一個運算都包咗 `Math.fround`。一組全部都係顏色 40 嘅 pixel 出返嚟會係 39，Java 同呢度都一樣；重現呢個行為正正就係重點，因為一個「整齊啲」嘅 40 會令每一塊重砌出嚟嘅 tile 永遠同直接 render 出嚟嗰塊對唔上。

### Merge 逐層做咩

`textures.json.gz` 會被斷言喺各 shard 之間逐 byte 相同，然後由 shard 0 抄過嚟；`settings.json` 一樣，斷言逐 byte 相同再由 shard 0 抄；`tiles/0`（hires）做互不相交嘅 union，並斷言零路徑碰撞；`tiles/1`（lod 1）逐個 pixel 合成，地形壓過抹除；`tiles/2` 同以上就掉咗 shard 嗰啲版本，由 merge 完嘅 lod 1 重砌；`live/` 係佔位檔，由 shard 0 抄；`assets/` 做 union，內容唔同嘅重複檔案當錯誤；`rstate/` **唔會 merge**。

`rstate` 係 BlueMap 自己記低邊啲 tile 佢當係最新嘅紀錄。佢啲檔案將 tile 分組成一啲會跨過 shard 切口嘅 region，所以冇任何一個 shard 嘅副本描述得到 merge 完嗰幅地圖。夾硬帶一個過去會令之後嘅增量 render 跳過啲其實仲要做嘅 tile。唔帶佢就令下一次 render 由頭開始：慢但啱，好過快但錯。發佈出去嗰幅地圖唔會讀佢。Merge 會數返佢略咗幾多並且講出嚟。

一個 shard 嘅 `rstate` **係會**喺 run 之間被 cache 嘅，而呢點同上面唔矛盾：佢係逐個 shard 分開 cache、放喺一個冇第二樣嘢還原得到嘅 key 底下，而且會返返去同一個 shard render 同一個矩形，唔會入到一幅 merge 完嘅地圖。[resumable-renders.md](resumable-renders.md#how-rstate-is-cached-without-reintroducing-the-merge-bug) 將兩者並排講清楚。

### 驗證（Verification）

Merge 係要檢查嘅，唔係當佢啱就算，因為佢做錯嘅每一樣嘢都係無聲嘅：

- **Hires tile 係互不相交嘅 union。** 冇一條路徑係由多過一個 shard 造出嚟。
- **Hires tile 數量。** 各 shard 嘅總數等於 merge 後嘅總數，缺少同多出嘅數量分開報。
- **Hires tile 抄過去冇改過。** 每塊 tile 都同佢嚟源嗰個 shard 逐 byte 比較。
- **Shard 邊界嘅 tile 解壓同解析得到。** 每個切口兩邊嘅 tile 都會被 gunzip，再檢查有冇 PRBM header —— 版本 byte `1`，跟住係 `PRBMWriter` 發出嗰個 format-info byte `0b00000111`。呢啲正正就係一個對唔齊嘅切割會整壞嘅 tile。
- **地圖 metadata 齊全。** `settings.json` 同一個 texture gallery 兩樣都喺度。
- **Lowres 金字塔每一層 lod 都砌咗。** 地圖設定承諾嘅 lod 冇一層係空嘅。

每個檢查都係報返佢啲數字而唔係報一個「合格」印，run summary 會將佢哋整成表。

### 端對端證據

一個 1000×1000 嘅生成世界（3969 chunk、4 個 region 檔）被 render 咗三次：一次整幅，一次切成兩個 shard、切口喺 block 514、`render-edges: false`。

Shard 輸出對比冇分 shard 嘅參考：

```
ref=961  p=496  q=465  p+q=961
PATH COLLISIONS between p and q: 0
missing from union: 0        extra in union: 0
byte-identical to reference: 961/961
```

Merge 後輸出對比冇分 shard 嘅參考：

```
hires: ref=961 merged=961 missing=0 extra=0 byteDiff=0
lod1:  refTiles=16 mergedTiles=16 pixels=4016016 colorDiff=0 metaDiff=0
lod2:  refTiles=4  mergedTiles=4  pixels=1004004 colorDiff=0 metaDiff=0
lod3:  refTiles=4  mergedTiles=4  pixels=1004004 colorDiff=0 metaDiff=0
```

每塊 hires tile 都逐 byte 一樣，而 6024024 個 lowres pixel 全部喺顏色同 metadata 上面、喺每一個 level of detail 都一樣。

#### 再做多次，今次係 2×2 切割、行真 CLI

一維切割永遠去唔到「四個 shard 喺一隻角碰頭」嗰種情況，所以成條 pipeline 之後再用 2×2 網格行多次 —— `plan`、四次 `config`、四次 render、`merge`、`verify` —— 用嘅係 workflow 行嗰啲同一批指令：

```
render-mask per shard:  {max-x 513, max-z 513}  {min-x 514, max-z 513}
                        {max-x 513, min-z 514}  {min-x 514, min-z 514}

Merged 961 hires tiles (256 + 240 + 240 + 225), composited 15 of 16 lod-1 tiles
overruledErasures: 1281987      conflictingPixels: 0      collisions: []

ok  hires tiles are a disjoint union
ok  hires tile count: 256 + 240 + 240 + 225 = 961; 0 missing, 0 unexpected
ok  hires tiles copied without alteration: 961 compared byte for byte, 0 differ
ok  shard-boundary tiles decompress and parse: 16 checked, 0 problems
ok  map metadata present
ok  lowres pyramid built at every lod

hires: ref=961 merged=961 missing=0 extra=0 byteDiff=0
lod1:  pixels=4016016 colorDiff=0 metaDiff=0
lod2:  pixels=1004004 colorDiff=0 metaDiff=0
lod3:  pixels=1004004 colorDiff=0 metaDiff=0
```

又係一模一樣。Merge 出嚟嗰幅地圖唔止係接近一次冇分 shard 嘅 render 會造出嘅地圖；喺呢個世界上面，佢就係同一幅地圖。

不過呢個係一個世界、一部機。呢個結果好強，但唔係對每個世界嘅證明：佢冇試過任何 mod、冇試過自訂 resource pack，而且淨係一片平坦嘅生成地形。

### 限制，同埋佢唔會做嘅嘢

- **世界係當 artifact 咁走嘅。** 佢只會被攞一次然後上傳，所以分三十路唔會將同一個 archive 下載三十次。Artifact 儲存同 runner 實測嘅可用硬碟先係世界大細嘅實際天花板 —— 唔係一個公佈數字。Plan job 會估算 render 需要幾多（見上面「Disk：實測，唔係靠估」），並且喺任何 wave 派發之前，喺佢真正行緊嗰部 runner 上面用 `df` 核對。太大嘅世界會喺嗰度具名失敗，而唔係某個 shard runner 喺 render 中途因為冇空間而死。
- **每個 job 六個鐘。** Workflow set 咗 350 分鐘 timeout，render 步驟 set 咗 300 分鐘。超時嘅 shard 唔會蝕咗啲工夫：佢嘅 render state 有 cache，重新派發嘅 run 會接落去。如果你根本唔想發生，就調低 `budget-minutes` 令計劃切多啲 shard。詳見 [resumable-renders.md](resumable-renders.md)。
- **Nether 同 end 係分開 run 嚟 render**，每個 run 一個 dimension，各有自己嘅 `map-id`。
- **Marker、玩家同其他 live 資料唔會被 render。** `live/` 佔位檔會被帶過去，令 webapp 有嘢載。
- **Merge 係單執行緒 Node。** 喺一幅好大嘅地圖上面，lod 重砌係慢嗰部分；佢同 lod-1 tile 數量成正比，唔係同 hires tile 數量成正比。
- **`rstate` 唔會 merge**，所以之後對 merge 完嗰幅地圖做增量 render 會全部重新 render。
- **App 嘅 CI sync 係當一個 release asset 送個世界出去**，所以佢嘅天花板就係 GitHub 每個 asset 2 GiB —— 喺打包之前就拒絕，而唔係打咗一個鐘之後先發現。更大嘅世界仲可以經 `repository` 或者 `url` source 用呢個 workflow render，或者逐個 dimension 咁 render。
- **App 淨係收 `rendered-map` 嗰一個 artifact。** 分咗幾份交付嘅地圖會被拒絕、並列出啲 artifact 名，要靠 run summary 手動砌返。
- **喺 app 度取消一次 sync 係停止睇住個 run，唔係停個 run。** 已經喺 GitHub 度行緊嘅 render 會繼續喺嗰邊行，之後一次 sync 仲可以收返佢。

### 喺本機行各個部件

啲邏輯係一個 workspace package，唔係 workflow 入面嘅 shell，所以全部都行得到本機：

```bash
cd design
pnpm --filter "@worldlens/render-actions..." run build

node packages/render-actions/dist/cli.js plan   --world path/to/world --out plan.json
node packages/render-actions/dist/cli.js config --plan plan.json --shard 0 --world path/to/world
node packages/render-actions/dist/cli.js merge  --shards shards --plan plan.json --out map/world
node packages/render-actions/dist/cli.js verify --plan plan.json --shards shards --merged map/world
```

每個指令都收 `--help`。測試覆蓋咗：對住一個由呢個 repository 自己生成嘅世界做世界量度、一個 shard／多個 shard／會超過 256 個 job 嘅世界嘅 shard 規劃、lowres 合成同 lod 重砌，以及各種 merge 失敗（包括刻意整一個 `textures.json` 唔對版）：

```bash
cd design
npx vitest run packages/render-actions
```

上面最後嗰張截圖係由 hosted 嘅細測試世界拍返嚟嘅真實畫面，唔係 mock 亦唔係手改嘅圖，佢記錄咗發佈嘅 URL 回 `200` 之後嘅瀏覽器地址同地圖 viewer。
