# Rendering that survives being interrupted

A render of a large world takes hours. In that time the application will be closed, the
machine will sleep, the power will go out, and a CI job will hit its six hour ceiling.
None of that may cost the work already done.

Almost none of it has to, because **BlueMap already renders incrementally**. Everything
below is built on that one fact, and most of the work is not checkpointing at all: it is
knowing that a render was left unfinished, and being careful not to destroy what it had
finished.

<details>
<summary><b>Contents</b></summary>

- [What BlueMap already does](#what-bluemap-already-does)
- [On the desktop](#on-the-desktop)
  - [The session record](#the-session-record)
  - [Detecting a render whose application never came back](#detecting-a-render-whose-application-never-came-back)
  - [Cancelled is not crashed](#cancelled-is-not-crashed)
  - [Refusing a resume whose settings changed](#refusing-a-resume-whose-settings-changed)
  - [Crash-safe writes](#crash-safe-writes)
  - [The IPC surface](#the-ipc-surface)
- [In GitHub Actions](#in-github-actions)
  - [Cache for the working state, an artifact for the output](#cache-for-the-working-state-an-artifact-for-the-output)
  - [The cache key, and the trap in it](#the-cache-key-and-the-trap-in-it)
  - [Completion markers](#completion-markers)
  - [More shards than one matrix can hold](#more-shards-than-one-matrix-can-hold)
  - [Merging a map too large for one runner](#merging-a-map-too-large-for-one-runner)
  - [How `rstate` is cached without reintroducing the merge bug](#how-rstate-is-cached-without-reintroducing-the-merge-bug)
- [Verification](#verification)
- [Limits and things this does not do](#limits-and-things-this-does-not-do)

</details>

## What BlueMap already does

BlueMap keeps its own record of what it has rendered, in a `rstate` directory beside the
tiles. `FileMapStorage` names the path:

```java
private static final String RENDER_STATE_PATH = "rstate";
```

Inside it are three `CellStorage` layers, each a grid of small per-region cells:
`MapTileState` (which hires tiles exist and when they were rendered), `MapChunkState`
(which chunks have changed) and `MapRegionState`. A plain `-r` re-run asks
`TileActionResolver` what each tile needs given that state and renders only what has
actually changed.

So a render that got sixty percent of the way through a world and died has sixty percent
of the world on disk **and** the bookkeeping that says so. Resuming is a re-run of the
same render, with two rules:

1. **Destroy nothing.** No deleting the output, no clearing `rstate`, and no `-f`. Every
   one of those turns a resume back into a full render, which is the outcome the whole
   feature exists to avoid.
2. **Same settings, or no resume.** Rendering the same map with different settings on top
   of tiles produced by the old ones gives a map that is half one thing and half the
   other, with nothing anywhere to say so.

## On the desktop

`design/packages/app/src/main/render/session.ts` and `resume.ts`.

### Issue #64: the separate render-task queue record

The queue persistence format primitive is owned by the TypeScript engine's `RenderManager`,
in `design/packages/engine/src/map/rendermanager/serialization/`. It is separate from the
desktop app's per-render `session.json` records above. The standalone CLI now constructs the
server package's `RenderQueuePersistence` after map construction, using
`<resolved core.data>/tasks.dat`, before rendering; the server package exports the helper but
has no separate construction site. The desktop app's current local Java-render path does not
own this TypeScript queue.

The storage API accepts a caller-supplied absolute path. The CLI currently supplies
`<resolved core.data>/tasks.dat`; the server package has no separate construction-site path.
The focused storage tests use `tasks.dat` in a temporary directory. There is likewise no
retention history beyond that one current file.
The on-disk format is schema/version `1`, a BlueNBT `TasksData` object with `version` and
`render-tasks` fields. `RenderQueuePersistence` is exported by `packages/server` and is
instantiated by the standalone CLI with a default 30-second save cadence.

Load is deliberately fail-closed at the top level and lenient per task. A missing file
means an empty queue. An unreadable, truncated, or wrong-version top-level file is reported
and discarded. An unknown task type or a task whose map is unavailable is skipped without
discarding valid entries, so the process owner must load only after its map set is ready and
must expose the skipped/unknown outcome rather than treating it as a successful full restore.

The CLI-used helper requests periodic saves, coalesces requests while one save is active, uses
a unique `*.staging-<uuid>` sibling before atomic replacement, filters tasks whose
`hasMoreWork()` is false, and performs a final save during `shutdown()`. The CLI loads after
maps are built and logs map-build skips; queue entry skips/unknowns are still reported through
the error callback rather than a structured recovery surface. Retention is one current file,
not a history. Stale crash ordering and a real CLI restart that resumes queued work end to end
remain outstanding acceptance evidence for issue
#64.

Focused acceptance coverage now proves the real queue-file round trip, schema/version refusal,
malformed and unknown-entry handling, terminal-task exclusion, unique staging and reopen,
coalesced non-overlapping saves, and CLI startup/shutdown wiring. The three focused files contain
29 passing tests, including an exact source-guard mutation that turns red when the wiring is
commented or removed and green again after restoration. Structured skipped-task presentation,
stale cross-process crash ordering, and a real CLI restart remain unproven.

### The session record

Every render writes `session.json` into its own workspace, beside the provenance record:

```
<storageDir>/<renderId>/
  render.json     which engine rendered this, and how it ended       (provenance.ts)
  session.json    what is running right now, and how far it got      (session.ts)
  config/         the config the CLI was pointed at
  web/            settings.json, maps/<id>/tiles/... and maps/<id>/rstate/
```

Two files rather than one, deliberately. `render.json` is the attribution record and is
written twice, at the start and at the end; widening it into a live progress file would
mean rewriting the record of which engine produced these tiles every ten seconds for the
whole of a six hour render.

The session carries the render id, every map with its own world folder and dimension, the
config directory, the output root, a hash of the settings, the engine and its version, the
start time, the last observed progress, and a status of `running`, `completed` or
`interrupted`. An interruption also carries its reason.

Progress writes are throttled: the first one lands immediately, because a render that has
started moving is worth knowing about, and the rest are written at most every five seconds.
Whatever ends a render always writes, so the number on disk after a stop is the newest one
seen.

A record that cannot be written never fails the render it describes. Losing the note about
where a render got to is a far smaller harm than losing the render, and the map is on disk
either way.

### Detecting a render whose application never came back

Not by process id. Process ids are reused, and a stale one that happened to match some
unrelated process would make a dead render look alive forever.

Instead each session records the id of the **application instance** that owns it, fresh on
every launch. A render only lives as long as the application that spawned it, so a session
still marked `running` whose owner is not this instance is, by construction, a render whose
application is gone. That is detected on launch, written back so the file stops claiming
something untrue, and offered.

It is _offered_, and never acted on. Silently restarting hours of rendering because
somebody opened the application is not a favour, and silently discarding the record throws
away the only evidence that the work exists. The interface asks, and the answer is
remembered: a declined offer is not made again at the next launch.

The reconciliation is idempotent, so calling it on every launch, and again whenever the
interface asks, changes nothing after the first time.

### Cancelled is not crashed

Cancellation is a first-class outcome. Somebody who pressed Cancel got exactly what they
asked for, and telling them their render "was interrupted" would have them looking for a
problem that does not exist. So the reason is kept, and the three read differently:

| Reason         | What the offer says                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `cancelled`    | "You stopped rendering 'Overworld' at 62.4% of updating map 'overworld'."                              |
| `failed`       | "Rendering 'Overworld' stopped at 62.4% ... (cli-failed)."                                             |
| `process-gone` | "Rendering 'Overworld' was cut off at 62.4% ..., without the application getting a chance to stop it." |

All three are still offered, because the tiles that finished are finished either way.

### Refusing a resume whose settings changed

The session records a SHA-256 of the settings the render was started with. A resume
supplied with different ones is refused, naming both digests and what to do:

> The map settings have changed since this render was started, so it cannot be carried on.
> The tiles already on disk were rendered from the old settings, and rendering the new ones
> on top of them would produce a map that is half one and half the other with nothing to
> show which is which. Either put the settings back to what they were, or start a fresh
> render, which will redo the work.

What is in the hash is everything that changes what a tile contains: map ids, world folders
(resolved, and case-folded on the platforms whose file systems are), dimensions, display
names, the resolved sort order and start positions.

What is deliberately out:

- **Render threads and metrics.** They change how fast the render goes and whether upstream
  is pinged. Neither changes a byte of a tile.
- **`-f` and `-e`.** Arguments to a run rather than settings of a map. `-f` is the opposite
  of a resume.
- **The engine version.** Recorded in the session and reported with the offer, but not a
  refusal. An application update between two halves of a long render is ordinary, and
  refusing every resume after every update would make the feature useless.

### Crash-safe writes

Every session write goes to `session.json.writing` and is renamed over the target, exactly
as `consent.ts` and `provenance.ts` do it. A rename is atomic on every file system this
application runs on, so a reader sees either the previous complete file or the new complete
file and never the bytes in between.

That matters more here than almost anywhere else, because this is the file read by an
application that has just come back from a crash: the half-written file is not a
hypothetical, it is the exact thing this is likely to meet. So the read is strict as well.
A missing, unreadable, truncated, wrong-version or incomplete record is **absent**, never a
partial answer. Parsing one leniently would produce a session with a real render id, no
config hash and an empty map list, which is worse than nothing because it would be offered
to somebody.

### The IPC surface

Three new channels, and three bridge methods mirroring them.

| Channel                | Arguments                   | Returns                                                      |
| ---------------------- | --------------------------- | ------------------------------------------------------------ |
| `render:interrupted`   | none                        | `InterruptedRenderSummary[]`, newest first                   |
| `render:resume`        | `renderId`, optional `maps` | `{ started: true, result }` or `{ started: false, refusal }` |
| `render:dismissResume` | `renderId`                  | `boolean`                                                    |

```ts
window.worldlens.interruptedRenders(): Promise<InterruptedRenderSummary[]>
window.worldlens.resumeRender(renderId: string, maps?: RenderMapRequest[]): Promise<ResumeResult>
window.worldlens.dismissResume(renderId: string): Promise<boolean>
```

A summary carries `renderId`, `reason`, `maps`, `startedAt`, `interruptedAt`, `percent`,
`description`, `engine` and a `message` of plain facts for the interface to style.

A refusal is not folded into `RenderResult`. A render that was refused never started, has
no id in flight and no engine to name, so inventing a failure code for it would be
describing something that is not a failure of rendering at all. `started` says which of the
two shapes came back.

Passing `maps` is what turns the settings check into a real check: omit it and the
session's own settings are used, which is always consistent.

## In GitHub Actions

`design/packages/render-actions/src/resume/`, and the workflows
`.github/workflows/render-world.yml` and `render-shard-wave.yml`.

### Cache for the working state, an artifact for the output

A shard that hits the job ceiling has spent hours producing tiles that are sitting on a
runner about to be thrown away. There are two ways off it, and they are not
interchangeable.

|                 | Holds                                                                          | Why that one                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/cache` | the shard's map directory **including `rstate`**, and BlueMap's data directory | Keyed and restored at the start of a job, which is the shape of "carry on where you left off". Allowed to disappear: an evicted cache costs one shard a full re-render and nothing else. |
| artifact        | the finished shard map and its completion marker                               | What the merge consumes and what a person downloads. Immutable, and not competing with the cache's eviction policy.                                                                      |

The important difference is _when_ each is written. The artifact is written once, at the
end. The cache is written by every shard whether it finished or not, which is the entire
point.

The render step carries its own `timeout-minutes`, shorter than the job's, and
`continue-on-error`. A shard that runs out of time therefore fails one step rather than
having the job cancelled underneath it, and the steps after it - saving the cache,
uploading what exists, reporting honestly - still run. Those steps are what get hours of
real tiles off the runner before it disappears.

### The cache key, and the trap in it

`actions/cache` will not overwrite an existing key. A key identical between two runs
therefore saves nothing on the second: run two restores run one's state, renders for
another six hours, and throws all of it away. Three runs of that make no more progress than
two.

So the key carries the run id and attempt, and the restore falls back to the longest
matching prefix:

```
key:          bluemap-shard-state-v1-<planFingerprint16>-shard-7-<runId>-<attempt>
restore-keys: bluemap-shard-state-v1-<planFingerprint16>-shard-7-
```

The prefix ends in a separator so `shard-1-` cannot match a key for shard 10.

**The plan fingerprint in the prefix is not decoration.** Restoring a cache saved under a
different plan would drop tiles and `rstate` from a shard that covered a _different
rectangle of the world_ on top of this one. `rstate` would then claim work this shard never
did, BlueMap would skip it, and the result is a hole in the map with nothing reporting a
problem. The fingerprint is a digest of the map id, the dimension, the world as measured,
the grid, the layout constants and every shard's own bounds. The estimate is not in it:
passing `--rate` changes the numbers in the run summary without moving a single cut.

### Completion markers

A shard's output directory looks the same whether the job finished or was killed at the
five hour fifty-eighth minute with a tile half flushed. Nothing in it says which.

So a shard that renders to completion declares it, in a file written only after the render
process has exited cleanly:

```
bluemap-out/maps/shard-7.complete.json     <- the marker
bluemap-out/maps/<mapId>/tiles/0/...       <- the map
```

Beside the map directory rather than inside it. The merge is pointed at `<shard>/<mapId>`,
so a marker inside would be a file the merge has to know to ignore; one directory up it
travels in the same artifact and the same cache and the merge never sees it. It has no
leading dot, because `actions/upload-artifact@v4` does not include hidden files by default.

**Only output whose marker is present is trusted.** A shard without one is not a failure
and is not discarded: it is unfinished, and its cached state is exactly what makes
finishing it cheap.

The marker also records how many hires tiles the shard had written, and every check counts
them again. A marker proves the render finished; it does not on its own prove the output
arrived, and a cache restore can be partial, a download can be interrupted, a runner can
run out of disk. A marker saying 240 beside a directory holding 197 is refused with both
numbers rather than trusted because the file exists. A marker written for a different plan
is refused too.

The marker is written staged-and-renamed for the obvious reason: the one file whose job is
to prove a write completed must not itself be readable half written.

Each merge group gates on this before merging anything. A group holding an unfinished shard
stops with an error naming the shards and what to do:

> These shards did not finish and were not merged: 41 47. Their render state is cached;
> re-dispatch this workflow with the same inputs to carry them on.

### More shards than one matrix can hold

A GitHub Actions matrix expands to at most 256 entries. A world needing more shards than
that has two honest options: give each shard a larger area, or run more than one matrix in
sequence.

The first has a hard ceiling. Enlarging shards raises the per-shard time, and a shard that
exceeds the six hour job limit does not finish at all. From figures measured on this
project's reference machine rather than guessed at: a 20 GB world is roughly 4,000 region
files and 4.1 million chunks, and at the measured 49.6 chunks per second (3,969 chunks in
80 seconds) that is about 23 hours of rendering. Against a six hour ceiling it must be
split, and at roughly sixteen regions per shard it wants about 256 shards. A world twice
that size wants about 512, and no amount of enlarging makes 512 shards' worth of work fit
into 256 jobs that each finish in time.

So shards are batched into **waves** of at most 256, and wave N+1 `needs:` wave N. A plan
with 600 shards becomes three waves of 256, 256 and 88. Nothing is dropped and no shard is
silently enlarged to fit.

Waves do not make a render slower than the account's own concurrency already makes it.
Actions concurrency is metered per account - a free account runs 20 jobs at once - so a
256-job matrix is already thirteen sequential batches of twenty as far as the runner fleet
is concerned. Splitting 512 shards into two waves changes when those batches happen rather
than how many there are. What waves do cost is a synchronisation point: a wave does not
start until every shard before it has ended.

That synchronisation is also what makes a failure cheap. Each shard caches its own state
and marks its own completion, so a re-dispatched run skips every shard that is already done.
A run that dies in wave 7 costs wave 7, not the six waves before it.

The workflow declares **twelve** wave jobs, because Actions cannot generate a variable
number of jobs. That is 3,072 shards. A plan needing more fails in the plan step, saying how
many waves it needs and what to change, rather than rendering part of the world and calling
it finished. Raising the ceiling means adding wave jobs to `render-world.yml` and raising
`RENDER_WAVE_SLOTS` to match.

### Merging a map too large for one runner

At the density measured on the reference world - 961 hires tiles covering a million square
blocks in about 47 MB - a 20 GB world renders to something on the order of 40 to 50 GB of
tiles. A runner's free disk is measured, not assumed from the published spec — see
[Disk: measured, not assumed](render-in-actions.md#disk-measured-not-assumed) — and even a
generously measured runner cannot hold that much: one job cannot download every shard and
write a merged copy beside them; it cannot download every shard at all.

So the merge is a tree, and its last level is small:

```
 shards 0..31   ->  merge group 0  ->  partial-hires-0 + partial-lowres-0
 shards 32..63  ->  merge group 1  ->  partial-hires-1 + partial-lowres-1
 ...                                          |
                                              v
                                   merge-lowres (lod 1 composited, lod 2+ rebuilt)
```

A group merge is the ordinary `mergeShardMaps` over a handful of neighbouring shards, so a
group runner only ever holds its own group. Everything that merge knows about the layers is
reused unchanged. It uploads two artifacts rather than one, and that separation is the
point:

- **Hires is finished when its group merge is.** Tiles are disjoint across the whole plan,
  not merely within a group, so a group's hires union is already its final share of the map.
  Nothing downstream opens it again.
- **Lod 1 is not.** A lowres tile is 500 blocks square on an unoffset grid and straddles
  group boundaries exactly as it straddles shard boundaries. So the last level downloads
  only the lowres artifacts, composites what genuinely overlaps, and rebuilds lod 2 upwards
  from the result. That is a few megabytes of PNGs rather than tens of gigabytes of tiles,
  which is why the final step fits on one runner however large the world is.

Group merges compose. Merging (A, B) and then (AB, C) gives the same lod-1 pixels as
merging (A, B, C) in one go, because each pixel is decided by a ranking - rendered terrain
beats an erasure beats an untouched pixel - and taking the best of a set is the same in one
pass or in stages. Two groups holding _different_ terrain for one pixel remains impossible
when every column belongs to exactly one shard, and remains an error rather than a guess.

A group merge passes `--lod-count 1`, so it does not build coarse lods that the final step
would discard: a group's lod 2 is averaged over pixels no shard in that group rendered, and
is wrong in a way that leaves no trace in the file.

**For a world small enough to have one merge group, none of this changes anything.** The
single group is the whole merge, it verifies against every shard exactly as before, and it
publishes one `rendered-map` artifact and, optionally, Pages.

For a larger world the map ships as parts: one `map-lowres` artifact carrying the webapp,
the metadata and the whole lowres pyramid, plus one `partial-hires-N` per group. Unzip
`map-lowres`, then unzip each hires part into `maps/<mapId>/tiles/0/` inside it; they never
overlap, so the order does not matter. Publishing to Pages is not attempted for a map of
that size, because it would need one runner to hold every part at once, which is the
constraint the split exists to avoid. The run summary says all of this rather than leaving
somebody to work it out from a job that failed at 96% with a disk error.

### How `rstate` is cached without reintroducing the merge bug

The shard merge deliberately does **not** merge `rstate`. Its files group tiles into
regions that straddle the shard cuts, so no shard's copy describes the merged map, and a
merged copy would make a later incremental render skip tiles it never actually did.
`merge/mergeMap.ts` counts what it leaves out and says so, and
[docs/render-in-actions.md](render-in-actions.md) explains why at length.

**Nothing here changes that.** The two facts are consistent because they are about
different journeys:

|                 | Where it goes                                                                              | Is it valid there                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Cached `rstate` | back to the same shard, rendering the same rectangle, with the same config, in a later run | Yes. It is precisely the record of what that shard has already done.                                                   |
| Merged `rstate` | into a map assembled from several shards                                                   | No. It describes one shard's rectangle and would make an incremental render of the merged map skip tiles no shard did. |

Concretely: `rstate` is cached per shard, under a key nothing else can restore, because the
key's prefix carries the plan fingerprint. It travels in the cache and never in the shard
artifact, so the merge never sees it, and `mergeShardMaps` continues to count and skip it if
one somehow appeared. `mergeLowresLayers` reads and writes no render state at all, and says
so in its report. The published map still carries none, so a later incremental render of a
published map still starts from scratch: slow and correct, rather than fast and wrong.

## Verification

Desktop, in `session.test.ts` and `resume.test.ts` (38 tests):

- A session left `running` by a previous launch is read as interrupted, the correction is
  written back, and a second launch finds the same thing and changes nothing.
- A render this launch is actually running is left alone.
- A completed render is not offered; a declined one is not offered again.
- A settings change refuses the resume and the message says what would happen otherwise.
- A truncated `session.json`, one that parses but carries no maps, and one from a future
  version are all treated as absent rather than parsed into nonsense.
- A cancelled render is distinguished from a crashed one, through the real orchestrator
  with a real child process, and both are still offered.
- A resume re-runs the recorded maps and does not pass `-f`, checked against the arguments
  actually spawned.

CI, in `resume/resume.test.ts` and `resume/lowresMerge.test.ts` (30 tests):

- A shard with no completion marker is unfinished, and its tiles are reported as kept
  rather than condemned.
- A marker whose count disagrees with the output on disk is refused, with both numbers.
- A marker from a different plan is refused.
- A half-written marker is no marker. An empty shard with no marker is unfinished, not done.
- Every run gets its own cache key; every key for a shard sits behind one restore prefix;
  shard 1's prefix does not match shard 10's key; a different plan gets a different prefix;
  changing only the estimate does not change the fingerprint.
- 600 shards become three waves of 256, 256 and 88 with nothing dropped or duplicated, and
  a plan needing more waves than the workflow has says so rather than truncating.
- The lowres merge composites across group boundaries, never opens the hires tiles,
  discards the partials' wrong lod 2, writes no render state, and refuses groups whose
  texture ordinals disagree.

Both workflows parse as YAML.

## Limits and things this does not do

- **A resume is only as good as the tiles on disk.** BlueMap decides what to skip from its
  own `rstate`; nothing here second-guesses it, and nothing here repairs a tile that was
  half written. On the desktop the process is killed by the application, and on a runner
  the shard is re-rendered from its cache when its marker is missing, so in both cases the
  engine's own bookkeeping is what decides.
- **The desktop resume is offered, never automatic.** There is deliberately no setting to
  make it silent.
- **A dismissed offer is dismissed permanently** for that render, until it is rendered
  again.
- **Twelve waves, so 3,072 shards.** More needs wave jobs added to the workflow.
- **A multi-group render does not publish to Pages** and does not produce one artifact.
- **Cache eviction costs a shard.** GitHub evicts caches by age and by a repository-wide
  size limit, so a run re-dispatched long after the one before it may find nothing to
  restore and render that shard from the beginning.
- **A world that changes between two halves of a render is not detected.** The settings
  hash covers the settings, not the contents of the world folder; editing the world between
  a crash and a resume gives BlueMap a changed world, which it handles the way it handles
  any changed world, by re-rendering what changed.

## 廣東話

### 捱得住中斷嘅 render（Rendering that survives being interrupted）

Render 一個大世界要幾個鐘。喺呢段時間入面，個 application 會被熄、部機會瞓著、會停電，而一個 CI job 會撞到佢六個鐘嘅上限。呢啲全部都唔可以令已經做咗嘅工夫白費。

其實幾乎冇一樣需要白費，因為 **BlueMap 本身就係增量 render 嘅**。下面所有嘢都係建喺呢一個事實上面，而大部分工夫其實根本唔係 checkpoint：而係要知道有一個 render 未做完，同埋要小心唔好毀咗佢已經做完嗰部分。

### BlueMap 本身已經做咗啲乜

BlueMap 自己會記低佢 render 咗啲乜，放喺 tile 隔籬一個 `rstate` 目錄度。`FileMapStorage` 定咗條路徑：

```java
private static final String RENDER_STATE_PATH = "rstate";
```

入面有三層 `CellStorage`，每層都係一格格逐 region 嘅細 cell：`MapTileState`（邊啲 hires tile 存在、幾時 render）、`MapChunkState`（邊啲 chunk 變咗）同 `MapRegionState`。一次普通 `-r` 重跑會問 `TileActionResolver` 喺呢個狀態之下每塊 tile 需要做乜，然後淨係 render 真係變咗嗰啲。

所以一個做咗六成然後死咗嘅 render，磁碟上有六成世界，**而且**有記低呢件事嘅簿記。續做即係將同一個 render 重跑一次，有兩條規則：

1. **咩都唔好毀。** 唔好刪 output、唔好清 `rstate`、亦唔好用 `-f`。任何一樣都會令續做變返一次完整 render，而咁樣正正就係呢個功能存在嚟避免嘅結果。
2. **同樣設定，否則唔准續做。** 用唔同設定喺舊設定造出嚟嘅 tile 上面 render 同一幅地圖，出嚟嘅地圖一半係一樣嘢、一半係另一樣，而且冇任何地方會講到。

### 喺桌面

`design/packages/app/src/main/render/session.ts` 同 `resume.ts`。

#### Issue #64：另一份 render-task queue 紀錄

Queue persistence 個 format primitive 由 TypeScript engine 嘅 `RenderManager` 負責，位置係
`design/packages/engine/src/map/rendermanager/serialization/`；而家
`packages/server` 仲有個 `RenderQueuePersistence` helper，預設每 30 秒 request 一次 save，
會 coalesce 同一時間嘅 request、用 unique staging sibling 做 atomic replace、filter 走
`hasMoreWork()` 已經係 false 嘅 task，同埋喺 `shutdown()` 做最後一次 save。佢由 server
package export 出嚟，而 standalone CLI 會喺 map build 完成之後 instantiate 佢，將 queue 寫去
`<resolved core.data>/tasks.dat`，再開始 render。Desktop 個 local Java-render path 唔係呢份
TypeScript queue 嘅 owner；server package 本身就未有另一個 construction site。

而家 storage API 只收 caller 自己傳入嘅絕對路徑；CLI 會用
`<resolved core.data>/tasks.dat`，focused storage tests 就喺 temporary directory 用
`tasks.dat`。Retention 仍然只係一個 current queue file，唔係 history。Disk format 係
schema/version `1`，一個有 `version` 同 `render-tasks` 欄位嘅 BlueNBT `TasksData` object。

Load 對 top-level 係 fail-closed，對單個 task 就 lenient。冇檔案即係 empty queue；top-level
讀唔到、截斷或者 version 唔啱，就報出嚟再丟棄。Unknown task type，或者 task 指住一幅而家
未 available 嘅 map，就淨係 skip 嗰一項，其他 valid entries 照留低。所以真正 process owner
要等 map set ready 先 load；而家 map-build skip 會寫 log，但 queue entry skipped/unknown
仲未有 structured recovery UI，唔可以當成完整 restore proof。

Server helper 會喺一個 save 行緊嗰陣 coalesce 下一次 request，用 unique `*.staging-<uuid>`
sibling 再 atomic replace，filter 走 `hasMoreWork()` 已經係 false 嘅 task，亦會喺
`shutdown()` 寫最後一次 snapshot；CLI 而家真係用緊呢個 helper。Retention 仍然只係一個
current `tasks.dat`，唔係 history。CLI 會等 map build 完先 load，map build skip 會寫 log，
但 queue entry skip/unknown 仍然係 error callback 層面，未有 structured recovery surface。
仲要證明 stale crash recovery 唔會用舊 queue 蓋過新 queue。真正 CLI restart 後接返 queued
work 嘅 end-to-end proof，仍然係 issue #64 未完成嘅
acceptance evidence。Focused acceptance Chuts 而家已經證明真實 queue-file round trip、schema/version
refusal、malformed/unknown entry、terminal-task exclusion、unique staging/reopen、coalesced
non-overlapping save，同 CLI startup/shutdown wiring；三個 focused files 合共 29 個 test，
包括故意拆走或 comment 條 wiring 後變紅、還原後變返綠嘅 exact source guard。Structured
skipped-task presentation、stale cross-process crash ordering，同真正 CLI restart 後接返
queued work 嘅 end-to-end proof，仍然係 issue #64 未完成嘅 acceptance evidence。

#### Session 紀錄

每次 render 都會喺自己個 workspace 度寫 `session.json`，同 provenance 紀錄放埋一齊：

```
<storageDir>/<renderId>/
  render.json     which engine rendered this, and how it ended       (provenance.ts)
  session.json    what is running right now, and how far it got      (session.ts)
  config/         the config the CLI was pointed at
  web/            settings.json, maps/<id>/tiles/... and maps/<id>/rstate/
```

刻意分兩個檔案而唔係一個。`render.json` 係歸屬紀錄，一頭一尾寫兩次；如果將佢擴闊成一個即時進度檔，就等於喺成個六個鐘嘅 render 期間，每十秒重寫一次「呢啲 tile 係邊個引擎造」嘅紀錄。

個 session 載住 render id、每幅 map 連佢自己嘅世界資料夾同 dimension、config 目錄、output 根目錄、設定嘅 hash、引擎同佢嘅版本、開始時間、最後觀察到嘅進度，以及 `running`、`completed` 或者 `interrupted` 嘅狀態。一次中斷仲會載埋佢嘅原因。

進度寫入係有節流嘅：第一次即刻落，因為一個已經郁得起嘅 render 值得知道，其餘嘅最密五秒一次。無論係咩令個 render 完結，都一定會寫，所以停咗之後磁碟上嗰個數字就係見過嘅最新一個。

寫唔到嘅紀錄永遠唔會令佢所描述嗰個 render 失敗。掉失「render 做到邊」呢張字條，比掉失個 render 細件好多，而且點都好幅地圖都喺磁碟上面。

#### 偵測一個 application 冇返過嚟嘅 render

唔係靠 process id。Process id 會被重用，而一個啱啱撞正某個無關 process 嘅過期 id，會令一個已死嘅 render 永遠睇落仲生。

取而代之，每個 session 記低擁有佢嗰個 **application 實例** 嘅 id，每次啟動都係新嘅。一個 render 只會活到 spawn 佢嗰個 application 為止，所以一個仍然標住 `running`、但擁有者唔係今次呢個實例嘅 session，按定義就係一個 application 已經冇咗嘅 render。呢件事喺啟動嗰陣偵測到、寫返落去令個檔案唔再聲稱一啲唔真嘅嘢，然後提出畀你揀。

佢係 _提出_，永遠唔會自己執行。因為有人開咗個 application 就靜靜雞重新開始幾個鐘嘅 render，唔算幫人；而靜靜雞掉咗個紀錄就等於掉咗「呢份工夫存在」嘅唯一證據。介面會問，而答案會記住：拒絕咗嘅提議下次啟動唔會再提。

呢個調和動作係冪等嘅，所以每次啟動叫一次、介面每次問又叫一次，第一次之後都唔會再改變任何嘢。

#### 「取消咗」唔等於「炸咗」

取消係一等公民嘅結果。撳咗 Cancel 嘅人得到嘅正正就係佢要求嘅嘢，而話畀佢聽個 render「被中斷咗」會令佢去搵一個根本唔存在嘅問題。所以個原因會保留，三者讀落唔同：`cancelled` 會講「你喺更新地圖 'overworld' 做到 62.4% 嗰陣停咗 render 'Overworld'」；`failed` 會講 render 'Overworld' 喺 62.4% 停咗，並附上代碼（例如 `cli-failed`）；`process-gone` 就講 render 'Overworld' 喺 62.4% 被切斷，而 application 冇機會停佢。三種都一樣會提出續做，因為做完咗嘅 tile 點都係做完咗。

#### 拒絕一個設定變咗嘅續做

Session 記低 render 開始嗰陣嗰份設定嘅 SHA-256。如果續做時傳入唔同嘅設定，就會被拒絕，並講出兩個 digest 同應該做乜：

> The map settings have changed since this render was started, so it cannot be carried on.
> The tiles already on disk were rendered from the old settings, and rendering the new ones
> on top of them would produce a map that is half one and half the other with nothing to
> show which is which. Either put the settings back to what they were, or start a fresh
> render, which will redo the work.

Hash 入面有嘅係一切會改變一塊 tile 內容嘅嘢：map id、世界資料夾（已解析，喺檔案系統唔分大細楷嘅平台上會 case-fold）、dimension、顯示名、已解析嘅排序次序同起始位置。

刻意唔放入去嘅有：**render 執行緒同 metrics**（佢哋改變 render 幾快、以及會唔會 ping 上游，兩樣都唔會改變一塊 tile 嘅任何一個 byte）；**`-f` 同 `-e`**（係一次執行嘅參數，唔係一幅地圖嘅設定，而 `-f` 本身就係續做嘅相反）；同埋 **引擎版本**（會記喺 session 度、亦會隨提議一齊報出，但唔會構成拒絕。喺一個長 render 兩半之間更新咗 application 好平常，如果每次更新之後都拒絕每一個續做，呢個功能就冇用）。

#### 抗 crash 嘅寫入

每次 session 寫入都係寫去 `session.json.writing`，再 rename 蓋過目標，同 `consent.ts` 同 `provenance.ts` 做法一樣。喺呢個 application 行得到嘅每個檔案系統上面 rename 都係原子操作，所以讀者見到嘅要麼係之前嗰個完整檔案、要麼係新嗰個完整檔案，永遠唔會見到中間嗰啲 byte。

呢點喺呢度比幾乎任何地方都重要，因為呢個檔案正正係由一個啱啱由 crash 返嚟嘅 application 讀嘅：寫咗一半嘅檔案唔係假設情境，佢就係呢度最有可能撞到嗰樣嘢。所以讀嗰邊都嚴格。一份缺失、讀唔到、被截斷、版本唔啱或者唔完整嘅紀錄一律當 **不存在**，永遠唔會當成局部答案。寬鬆咁 parse 佢會整出一個有真 render id、冇 config hash、map 清單係空嘅 session，咁樣比乜都冇仲衰，因為佢會被攞去提議畀人。

#### IPC 介面

三條新 channel，加三個對應嘅 bridge 方法。`render:interrupted` 唔收參數，回一個由新到舊排嘅 `InterruptedRenderSummary[]`；`render:resume` 收 `renderId` 同可選嘅 `maps`，回 `{ started: true, result }` 或者 `{ started: false, refusal }`；`render:dismissResume` 收 `renderId`，回一個 boolean。

```ts
window.worldlens.interruptedRenders(): Promise<InterruptedRenderSummary[]>
window.worldlens.resumeRender(renderId: string, maps?: RenderMapRequest[]): Promise<ResumeResult>
window.worldlens.dismissResume(renderId: string): Promise<boolean>
```

一份 summary 載住 `renderId`、`reason`、`maps`、`startedAt`、`interruptedAt`、`percent`、`description`、`engine`，同一個純事實嘅 `message` 畀介面自己去排版。

拒絕唔會摺埋入 `RenderResult`。一個被拒絕嘅 render 從來冇開始過、冇 id 喺飛、亦冇引擎可以講出名，所以為佢作一個 failure code 出嚟，即係喺度描述一樣根本唔算 render 失敗嘅嘢。`started` 就講返返嚟嘅係兩種形狀邊一種。

傳 `maps` 就係令設定檢查變成真檢查嘅嘢：唔傳嘅話就用 session 自己嗰份設定，而咁樣永遠都係一致嘅。

### 喺 GitHub Actions

`design/packages/render-actions/src/resume/`，同埋 workflow `.github/workflows/render-world.yml` 同 `render-shard-wave.yml`。

#### 工作狀態用 cache，輸出用 artifact

一個撞到 job 上限嘅 shard，已經花咗幾個鐘造咗一堆 tile，而佢哋正躺喺一部即將被掉嘅 runner 上面。有兩條路攞得走佢哋，而兩者唔可以互換。

`actions/cache` 揸住嘅係 shard 嘅 map 目錄（**包括 `rstate`**）同 BlueMap 嘅 data 目錄。點解用佢：因為佢係喺 job 開始嗰陣按 key 還原，而咁樣正正就係「由上次停低嗰度繼續」嘅形狀。佢係容許消失嘅：一個被逐出嘅 cache 淨係令一個 shard 要完整重 render，冇其他代價。

Artifact 揸住嘅係做完嘅 shard 地圖同佢嘅完成 marker。點解用佢：因為佢係 merge 要食嘅嘢、亦係人下載嘅嘢。佢係不可變嘅，而且唔會同 cache 嘅逐出政策爭嘢。

重要嘅分別係各自*幾時*寫。Artifact 只喺最後寫一次。Cache 就係每個 shard 都寫，唔理佢做唔做完 —— 而呢樣就係整個重點。

Render 步驟有自己嘅 `timeout-minutes`，短過個 job 嘅，加上 `continue-on-error`。所以一個唔夠時間嘅 shard 只係一個步驟失敗，而唔係成個 job 喺佢腳底下被取消，之後嗰啲步驟 —— 儲 cache、上傳現有嘅嘢、誠實報告 —— 仍然行得到。就係呢啲步驟令幾個鐘嘅真實 tile 喺 runner 消失之前走得甩。

#### Cache key，同入面嗰個陷阱

`actions/cache` 唔會覆寫一個已經存在嘅 key。所以兩次 run 之間完全一樣嘅 key，喺第二次乜都儲唔到：run 2 還原咗 run 1 嘅狀態、又 render 多六個鐘、然後將全部掉曬。咁樣行三次 run，進度唔會多過行兩次。

所以個 key 帶住 run id 同 attempt，而還原就退返用最長相符前綴：

```
key:          bluemap-shard-state-v1-<planFingerprint16>-shard-7-<runId>-<attempt>
restore-keys: bluemap-shard-state-v1-<planFingerprint16>-shard-7-
```

個前綴以分隔符結尾，所以 `shard-1-` 唔會撞正 shard 10 嘅 key。

**前綴入面嗰個 plan fingerprint 唔係裝飾。** 還原一個喺唔同 plan 之下儲低嘅 cache，就會將一個覆蓋*世界另一塊矩形*嘅 shard 嘅 tile 同 `rstate` 冚落呢個之上。跟住 `rstate` 就會聲稱呢個 shard 做過一啲佢其實冇做過嘅工夫，BlueMap 就會跳過佢，結果就係地圖上面有個窿而且冇任何嘢報告有問題。呢個 fingerprint 係 map id、dimension、實測嘅世界、網格、佈局常數同每個 shard 自己邊界嘅摘要。估算唔喺入面：傳 `--rate` 會改變 run summary 入面啲數字，但唔會令任何一條切口移動半分。

#### 完成 marker

一個 shard 嘅輸出目錄，唔理個 job 係做完咗定係喺第五個鐘五十八分被殺、有塊 tile 只 flush 咗一半，睇落都一模一樣。入面冇任何嘢講到係邊種。

所以一個 render 到完成嘅 shard 會宣告呢件事，寫喺一個只喺 render process 乾淨結束之後先會寫嘅檔案度：

```
bluemap-out/maps/shard-7.complete.json     <- the marker
bluemap-out/maps/<mapId>/tiles/0/...       <- the map
```

放喺 map 目錄隔籬而唔係入面。Merge 係指住 `<shard>/<mapId>`，所以放喺入面嘅 marker 會變成一個 merge 要識得忽略嘅檔案；上一層目錄嘅話，佢一樣會隨同一個 artifact 同同一個 cache 走，而 merge 永遠見唔到佢。佢個名冇前置點，因為 `actions/upload-artifact@v4` 預設唔會包含隱藏檔案。

**只有帶住 marker 嘅輸出先會被信任。** 冇 marker 嘅 shard 唔算失敗、亦唔會被掉：佢係未做完，而佢嗰份 cache 狀態正正就係令佢做完嗰陣好平嘅嘢。

Marker 亦都記低咗個 shard 寫咗幾多塊 hires tile，而每個檢查都會再數一次。Marker 證明個 render 完成咗；佢自己一個證明唔到啲輸出真係到咗，而 cache 還原可以係局部、下載可以中斷、runner 可以爆硬碟。一個寫住 240、但隔籬個目錄得 197 個嘅 marker，會連兩個數字一齊被拒絕，而唔會因為個檔案存在就信佢。一個為另一個 plan 寫嘅 marker 一樣會被拒。

Marker 用 staged-and-renamed 方式寫，原因好明顯：一個職責就係證明「寫入完成咗」嘅檔案，本身唔可以喺寫咗一半嗰陣讀得到。

每個 merge group 喺 merge 任何嘢之前都會為呢件事把關。一個載住未完成 shard 嘅 group 會停低，並用一個講出邊啲 shard 同應該做乜嘅錯誤訊息交代：

> These shards did not finish and were not merged: 41 47. Their render state is cached;
> re-dispatch this workflow with the same inputs to carry them on.

#### 多過一個 matrix 載得落嘅 shard

一個 GitHub Actions matrix 最多展開到 256 項。一個需要多過咁多 shard 嘅世界有兩個誠實選擇：畀每個 shard 更大範圍，或者順序行多過一個 matrix。

第一個有硬天花板。放大 shard 會抬高每個 shard 嘅時間，而一個超過六個鐘 job 上限嘅 shard 根本完唔到。用呢個 project 參考機器上實測（唔係靠估）嘅數字：一個 20 GB 嘅世界大約係 4,000 個 region 檔、410 萬個 chunk，而按實測嘅每秒 49.6 個 chunk（80 秒 3,969 個 chunk），即係大約 23 個鐘嘅 render。對住六個鐘嘅上限佢一定要切，而大約每個 shard 十六個 region 嘅話，佢想要大約 256 個 shard。一個大一倍嘅世界想要大約 512 個，而點放大都唔會令 512 個 shard 嘅工作量塞得入 256 個而且每個都準時做完嘅 job。

所以 shard 會分批成每批最多 256 個嘅 **wave**，而第 N+1 個 wave `needs:` 第 N 個。一個有 600 個 shard 嘅 plan 變成 256、256、88 三個 wave。冇嘢會被掉，亦冇 shard 會被靜靜雞放大去遷就。

Wave 唔會令一個 render 慢過帳戶本身嘅並行上限已經令佢慢嘅程度。Actions 並行係按帳戶計量嘅 —— 一個免費帳戶同時行 20 個 job —— 所以就 runner 隊列而言，一個 256-job matrix 本來就已經係十三批、每批二十個嘅順序批次。將 512 個 shard 分成兩個 wave，只係改變咗嗰啲批次幾時發生，而唔係改變佢哋有幾多批。Wave 真正嘅代價係一個同步點：一個 wave 要等佢之前每個 shard 都結束咗先開始。

而嗰個同步點亦都係令失敗變平嘅原因。每個 shard 自己 cache 自己嘅狀態、自己標自己嘅完成，所以重新派發嘅 run 會跳過每一個已經做完嘅 shard。喺 wave 7 死咗嘅 run 蝕嘅係 wave 7，唔係前面六個 wave。

Workflow 聲明咗 **十二** 個 wave job，因為 Actions 產生唔到數量可變嘅 job。即係 3,072 個 shard。需要多過呢個數嘅 plan 會喺 plan 步驟失敗，講明佢需要幾多個 wave 同要改乜，而唔會 render 半個世界然後當佢做完。要抬高呢個上限，就要喺 `render-world.yml` 加 wave job，同時將 `RENDER_WAVE_SLOTS` 調高去配合。

#### Merge 一幅大到一部 runner 揸唔落嘅地圖

按參考世界實測嘅密度 —— 961 塊 hires tile 覆蓋一百萬平方 block、大約 47 MB —— 一個 20 GB 嘅世界 render 出嚟大概係 40 到 50 GB 嘅 tile。Runner 嘅可用硬碟係實測嘅，唔係照抄公佈 spec（見 [Disk: measured, not assumed](render-in-actions.md#disk-measured-not-assumed)），而就算量出嚟好闊落嘅 runner 都揸唔落咁多：一個 job 冇可能下載晒所有 shard 再喺隔籬寫一份 merge 副本；佢連下載晒所有 shard 都做唔到。

所以 merge 係一棵樹，而佢最後一層好細：

```
 shards 0..31   ->  merge group 0  ->  partial-hires-0 + partial-lowres-0
 shards 32..63  ->  merge group 1  ->  partial-hires-1 + partial-lowres-1
 ...                                          |
                                              v
                                   merge-lowres (lod 1 composited, lod 2+ rebuilt)
```

一次 group merge 就係對幾個相鄰 shard 做普通嘅 `mergeShardMaps`，所以一部 group runner 由頭到尾只揸住自己嗰個 group。Merge 對各層嘅所有知識都原封不動咁重用。佢上傳兩個 artifact 而唔係一個，而呢個分離正正就係重點：

- **Hires 喺佢個 group merge 做完嗰刻就已經完成。** Tile 喺成個 plan 範圍內都係互不相交嘅，唔淨止喺一個 group 之內，所以一個 group 嘅 hires union 已經係佢喺幅地圖入面最終嗰份。下游冇嘢會再開佢。
- **Lod 1 就未。** 一塊 lowres tile 係 500 block 見方、鋪喺一個冇 offset 嘅網格上面，佢跨 group 邊界就好似佢跨 shard 邊界一樣。所以最後一層淨係下載啲 lowres artifact、合成真正重疊嘅部分，再由結果向上重砌 lod 2 以上。咁樣係幾 MB 嘅 PNG，而唔係幾十 GB 嘅 tile，呢個就係點解無論個世界幾大，最後一步都塞得落一部 runner。

Group merge 係可組合嘅。先 merge (A, B) 再 merge (AB, C)，同一次過 merge (A, B, C) 得出嘅 lod-1 pixel 一樣，因為每個 pixel 都係靠一個排名決定 —— 已 render 地形贏抹除、抹除贏未觸碰 —— 而「攞一組入面最好嗰個」無論一次過做定分階段做都一樣。兩個 group 對同一個 pixel 揸住*唔同*地形，喺每一列都只屬於恰好一個 shard 嘅前提下依然係冇可能嘅，亦依然會被當成錯誤而唔會靠估。

一次 group merge 會傳 `--lod-count 1`，所以佢唔會砌一啲最後一步會掉咗嘅粗 lod：一個 group 嘅 lod 2 係喺嗰個 group 入面冇任何 shard render 過嘅 pixel 上面平均出嚟，而佢錯得喺檔案入面唔留半點痕跡。

**對於細到得一個 merge group 嘅世界，上面呢啲全部都唔改變任何嘢。** 嗰個單一 group 就係成個 merge，佢照舊對住每個 shard 驗證，並且發佈一個 `rendered-map` artifact，同埋（如果你想）Pages。

對於大啲嘅世界，幅地圖會分部件交付：一個 `map-lowres` artifact 載住 webapp、metadata 同整個 lowres 金字塔，加上每個 group 一個 `partial-hires-N`。解壓 `map-lowres`，然後將每個 hires 部件解壓入佢入面嘅 `maps/<mapId>/tiles/0/`；佢哋永遠唔會重疊，所以次序唔緊要。呢種大細嘅地圖唔會嘗試發佈去 Pages，因為咁做需要一部 runner 同時揸住所有部件，而呢個正正就係分割存在嚟避免嘅限制。Run summary 會將呢一切講清楚，而唔係留返畀人由一個喺 96% 因為磁碟錯誤而失敗嘅 job 度自己推敲。

#### `rstate` 點樣 cache 得到而唔會重新引入嗰個 merge bug

Shard merge 係刻意 **唔** merge `rstate` 嘅。佢啲檔案將 tile 分組成跨越 shard 切口嘅 region，所以冇任何 shard 嘅副本描述得到 merge 完嗰幅地圖，而一份 merge 咗嘅副本會令之後嘅增量 render 跳過佢其實冇做過嘅 tile。`merge/mergeMap.ts` 會數返佢略咗幾多並講出嚟，而 [docs/render-in-actions.md](render-in-actions.md) 有詳細解釋原因。

**呢度冇任何嘢改變咗呢件事。** 兩個事實可以並存，因為佢哋講嘅係唔同旅程：cache 咗嘅 `rstate` 係返返去同一個 shard、render 同一塊矩形、用同一份 config、喺之後某次 run —— 喺嗰度佢係有效嘅，因為佢正正就係嗰個 shard 已經做咗乜嘅紀錄。Merge 咗嘅 `rstate` 就會入到一幅由幾個 shard 砌成嘅地圖 —— 喺嗰度佢係無效嘅，因為佢描述嘅係一個 shard 嘅矩形，會令 merge 完嗰幅地圖嘅增量 render 跳過根本冇 shard 做過嘅 tile。

具體嚟講：`rstate` 係逐個 shard cache，放喺一個冇第二樣嘢還原得到嘅 key 底下，因為個 key 嘅前綴帶住 plan fingerprint。佢喺 cache 度走，永遠唔會喺 shard artifact 度走，所以 merge 永遠見唔到佢；而萬一真係出現咗一個，`mergeShardMaps` 一樣會繼續數同跳過佢。`mergeLowresLayers` 完全唔讀亦唔寫任何 render state，並且喺報告度講明。發佈出去嘅地圖依然一份 render state 都冇帶，所以之後對一幅已發佈地圖做增量 render 依然係由頭開始：慢但啱，好過快但錯。

### 驗證

桌面嗰邊，喺 `session.test.ts` 同 `resume.test.ts`（38 個測試）：

- 上一次啟動留低、仍然標住 `running` 嘅 session 會被讀成已中斷，更正會寫返落去，而第二次啟動會搵到同一樣嘢並且乜都唔改。
- 今次啟動真係行緊嘅 render 唔會被郁。
- 已完成嘅 render 唔會被提議；被拒絕過嘅唔會再提議。
- 設定改咗會拒絕續做，而段訊息會講明如果唔拒絕會點。
- 一個被截斷嘅 `session.json`、一個 parse 得到但冇 map 嘅、同一個來自未來版本嘅，全部都當「不存在」處理，而唔會 parse 成廢話。
- 取消咗嘅 render 同炸咗嘅分得開，呢點係透過真實 orchestrator 加真實子 process 驗證，而且兩者一樣都會被提議續做。
- 一次續做會重跑記錄低嗰啲 map，而且唔會傳 `-f`，呢點對住實際 spawn 出嚟嘅參數核實。

CI 嗰邊，喺 `resume/resume.test.ts` 同 `resume/lowresMerge.test.ts`（30 個測試）：

- 冇完成 marker 嘅 shard 算未完成，而佢啲 tile 會被報成「保留」而唔係「判死」。
- 數目同磁碟上輸出對唔上嘅 marker 會被拒絕，連兩個數字一齊講。
- 來自另一個 plan 嘅 marker 會被拒。
- 寫咗一半嘅 marker 等於冇 marker。一個冇 marker 嘅空 shard 係未完成，唔係做完。
- 每次 run 都有自己嘅 cache key；一個 shard 嘅每個 key 都坐喺同一個還原前綴後面；shard 1 嘅前綴唔會撞正 shard 10 嘅 key；唔同 plan 有唔同前綴；淨係改估算唔會改變 fingerprint。
- 600 個 shard 變成 256、256、88 三個 wave，冇嘢被掉亦冇嘢重複，而一個需要多過 workflow 現有 wave 數嘅 plan 會講出嚟而唔會截短。
- Lowres merge 會跨 group 邊界合成、永遠唔會開 hires tile、掉咗 partial 嗰啲錯嘅 lod 2、唔寫任何 render state，並且拒絕 texture ordinal 對唔上嘅 group。

兩個 workflow 都 parse 得到做 YAML。

### 限制，同埋佢唔會做嘅嘢

- **一次續做嘅質素，就等於磁碟上啲 tile 嘅質素。** BlueMap 靠佢自己嘅 `rstate` 決定跳過乜；呢度冇任何嘢會質疑佢，亦冇任何嘢會修復一塊寫咗一半嘅 tile。喺桌面上個 process 係由 application 殺死，而喺 runner 上，當 marker 缺失嗰陣個 shard 會由佢嘅 cache 重新 render，所以兩種情況都係引擎自己嘅簿記話事。
- **桌面嘅續做係提議，永遠唔會自動。** 刻意冇一個令佢靜靜雞執行嘅設定。
- **拒絕咗嘅提議係永久拒絕**（對嗰個 render 而言），直到佢再 render 過為止。
- **十二個 wave，即 3,072 個 shard。** 要多啲就要喺 workflow 加 wave job。
- **多 group 嘅 render 唔會發佈去 Pages**，亦唔會出一個單一 artifact。
- **Cache 被逐出會蝕一個 shard。** GitHub 會按年紀同 repository 整體大細上限逐出 cache，所以一個隔咗好耐先重新派發嘅 run 可能咩都還原唔到，要由頭 render 嗰個 shard。
- **喺一個 render 兩半之間變咗嘅世界唔會被偵測到。** 設定 hash 覆蓋嘅係設定，唔係世界資料夾嘅內容；喺 crash 同續做之間改咗個世界，即係畀咗一個變咗嘅世界 BlueMap，而佢會用佢處理任何變咗嘅世界嘅方式處理 —— 即係重新 render 變咗嗰啲。
