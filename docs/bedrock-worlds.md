# Bedrock Edition worlds

BlueMap renders Java Edition. A Bedrock Edition world is a different thing on disk, so it
cannot be rendered directly — but it can be converted, and this document covers both
halves: recognising a Bedrock world and saying so, and converting one with Chunker so it
can be rendered.

The two halves are deliberately independent. Detection works with nothing installed — no
Chunker, no JVM, no network — and is worth having on its own, because "this is a Bedrock
world, which has to be converted first" is a far more useful sentence than "not a world".

---

## Behaviour

### What makes a world Bedrock

The two editions look alike at a glance and share exactly one filename.

| | Java Edition | Bedrock Edition |
|---|---|---|
| Chunk storage | `region/*.mca` (Anvil) | `db/` (a LevelDB database) |
| `level.dat` | big-endian NBT, gzip | little-endian NBT behind an 8-byte header |
| World name | `LevelName` inside `level.dat` | `levelname.txt`, plain UTF-8 |
| Extra dimensions | `DIM-1/`, `DIM1/`, `dimensions/` | inside the same database |

Both have a `level.dat`, which is why a Bedrock world used to reach the world list at all.
It listed, the Java NBT reader failed on the header, and the row appeared with a
`detailsError` and no name — which reads as *your world is corrupt*. It is not corrupt. It
is the other edition, and that is a different sentence with a different next step.

`main/bedrock/detect.ts` now answers that properly. It takes the folder listing
`main/world/inspect.ts` already produces and returns a verdict with the markers that
justify it:

- `certain` — a `db` directory holding real LevelDB files, or a `db` directory beside a
  `levelname.txt`.
- `likely` — a bare `db` directory beside a `level.dat`, and nothing corroborating it.

**Java evidence always wins outright.** Any Anvil region file in any dimension, or a
`region/` or `dimensions/` directory, settles the folder as Java no matter what else is
beside it. `db` is not a reserved name — a mod, a datapack or a backup tool can leave one
in a perfectly healthy Java world, and routing that world to a converter it does not need
would be a wrong answer its owner could not diagnose. A freshly created Java world with an
empty `region/` directory is Java too.

In the world list, a detected Bedrock world now carries `edition: "bedrock"`, its real name
read from `levelname.txt`, and the one-sentence explanation — instead of the parse error.

### Converting

Conversion is an explicit step somebody starts. Nothing converts as a side effect of
looking at a folder: it produces a second, multi-gigabyte copy of a world, and that is a
decision, not something that should happen because a screen was opened.

Before the button, the interface has the facts to show:

- **Where the copy goes.** Beside the original — `MyWorld` produces `MyWorld (Java)` in the
  same parent — never inside it. Writing into the Bedrock world would break the promise
  that the original is untouched and would leave Minecraft managing a save with a stray
  directory in it.
- **Roughly how big it will be.** An estimate, labelled as one: between one and two times
  the source world's size. Anvil packs chunks into 32×32 regions with its own compression
  while LevelDB stores them per chunk and compacts, so the ratio genuinely varies. A world
  whose size could not be measured gets no invented estimate.
- **That the original is never modified.** Chunker only reads its input, and this app only
  ever passes the Bedrock world as `-i`.
- **What will be lost.** See [Fidelity](#fidelity-what-conversion-loses) below.
- **Whether the world is large enough that it will probably fail.** Sized against the world
  in front of the person, not stated in general — see
  [Memory](#memory-the-converter-grows-without-bound) below. A world comfortably under the
  threshold says nothing at all, because a warning shown on every world is a warning nobody
  reads.

Progress is reported as it arrives, cancellation is available throughout, and neither a
cancelled nor a failed conversion leaves anything behind — see
[Nothing that looks like a world](#nothing-that-looks-like-a-world).

---

## Chunker

[Chunker](https://github.com/HiveGamesOSS/Chunker) is Hive Games' open-source converter
between Minecraft's Java and Bedrock editions. It is the established tool for this: it is
the converter behind `chunker.app`, it is documented by Microsoft in the Bedrock creator
docs, and the project receives funding from Mojang Studios.

> **Note.** The repository is `HiveGamesOSS/Chunker`, not `HiveGamingNetwork/Chunker`.

It ships as an Electron desktop app *and* as a standalone CLI jar. The CLI is what this app
uses: one file, about 30 MB, no installer and no native components.

### Licence, and why the jar ships inside the installer

Chunker is **MIT licensed**, Copyright (c) 2024 Hive Games
([LICENSE](https://github.com/HiveGamesOSS/Chunker/blob/main/LICENSE)).

- **Redistribution is permitted.** MIT allows use, modification and distribution.
- **Bundling would therefore be permitted**, provided the copyright notice and the licence
  text ship alongside it.
- **Required attribution:** the copyright notice and the permission notice must be included
  in all copies or substantial portions of the software.

**This app bundles it.** `scripts/stage-bundled-runtimes.mjs` stages the pinned
`chunker-cli-1.19.1.jar` into `dist/bundled/chunker/`, electron-builder copies that into the
installer as `resources/bundled/chunker/`, and the app resolves it from there. A person who
installs Worldlens can convert a Bedrock world with the network unplugged.

The old reasoning — 30 MB is a poor trade for a feature most people never use, and a bundled
copy pins a converter version to an app release — was re-decided. The first half is not the
trade it appeared to be: an installer that cannot convert a world until the machine has been
online is not an installer that contains the app. The second half is simply true, and is now
a real consequence rather than a hypothetical one: the converter version moves when the app
version moves, or when somebody points the app at a jar of their own.

<details>
<summary><b>What went wrong in v1.0.2026, and the shape of the mistake</b></summary>

The jar went into the installer and nothing was taught to look for it. v1.0.2026's
`Worldlens-1.0.2026-full.nupkg` contains
`lib/net45/resources/bundled/chunker/chunker-cli-1.19.1.jar` at exactly the pinned
31,790,149 bytes, and `findChunker` had no `resourcesPath` option at all — so every installed
build searched the user's profile, found nothing, and reported the converter as absent while
carrying it. Packaging was green, the extraResources entry was correct, and the only symptom
was the app denying it owned something it was shipping.

It is the general shape recorded elsewhere in this repository: **a feature wired at one end
and consumed at neither ships silently.** The guard against a repeat is
`scripts/assert-packaged-bundles.mjs`, which reads the directory electron-builder actually
produced rather than the configuration that describes it.
</details>

So the app runs the bundled jar first, and fetches one only when there genuinely is none.

### The CLI contract

Read from Chunker's README and from `cli/src/main/java/com/hivemc/chunker/cli/CLI.java`
rather than guessed at.

```
java -jar chunker-cli-<version>.jar -i "<world>" -f JAVA_1_21_4 -o "<output>"
```

**Requirement: Java 17 or higher.** This app does not add a second Java story for it — it
reuses the provisioned, probed Temurin JDK from `main/java/`, whose own requirement is
already well above 17.

Required flags:

| Flag | Long form | Meaning |
|---|---|---|
| `-i` | `--inputDirectory` | the world to read |
| `-o` | `--outputDirectory` | where to write |
| `-f` | `--outputFormat` | target format, `EDITION_X_Y_Z`, or `INPUT` |

Optional flags (`-m` block mappings, `-s` world settings, `-p` pruning, `-c` converter
settings, `-r` dimension registry, `-d` dimension mappings, `-b` biome mappings) all take a
JSON file or object. Chunker also picks these up automatically from `*.chunker.json` files
inside the input world.

<details>
<summary><b>Why <code>--keepOriginalNBT</code> is never passed</b></summary>

`-k` / `--keepOriginalNBT` only works when the output format matches the input. For a
Bedrock-to-Java conversion it never does, and Chunker's guard for that case calls
`System.exit(0)` after printing to stderr. Passing it would turn every conversion into a
silent no-op that reports success.
</details>

The target format defaults to `JAVA_1_21_4`. That is a real identifier in Chunker's writer
registry rather than a guess — the registry enumerates its supported Java versions, and an
identifier is that version with dots replaced by underscores and a trailing `.0` dropped
(`JAVA_1_20`, `JAVA_1_20_5`, `JAVA_1_21_4`, `JAVA_26_1`, …). A modern format BlueMap has
long read, rather than the newest Chunker offers: the target only has to be something the
renderer definitely understands. An unknown identifier is rejected by Chunker with a message
listing every valid value, which this app captures and reports rather than swallowing.

### Obtaining it, and what "verified" honestly means

The app looks, in order, at:

| Order | Source | Reported as |
|---|---|---|
| 1 | a jar configured in settings | `configured` |
| 2 | `CHUNKER_CLI_JAR` | `environment` |
| 3 | **the jar inside this app's own installer**, `<resources>/bundled/chunker/` | `bundled` |
| 4 | a copy the app downloaded into its own data directory | `downloaded` |

The two explicit overrides come first on purpose: somebody who names a converter meant it,
and quietly running a different one is how an afternoon disappears. Nobody has configured
anything on a fresh install, so **the bundled jar is what an ordinary install resolves**, and
the interface says which of the four it is rather than reporting a bare version. A configured
path that does not exist is **reported**, never silently skipped in favour of another copy.

The bundled jar is hashed against the SHA-256 committed in `bundled-runtimes.manifest.json`
before it is run, once per launch. A jar at the bundled path whose bytes are not this
release's bytes is **refused rather than run**: it is either a damaged install or something
that replaced it, and there is no version of "probably fine" worth having with somebody's
only copy of a world at the other end.

Step 4 exists for a development checkout, where nothing has been staged, and for an install
whose bundled copy is genuinely gone. It is automatic, digest-verified and reported with real
progress; there is no browser link and no "fetch it yourself" copy anywhere in the app.

If asked to fetch one, the download is checked against a SHA-256. What that check is worth
was researched rather than assumed, and the answer is narrower than one would like. As of
Chunker 1.19.1:

| | Published? |
|---|---|
| `SHA256SUMS` or equivalent checksum file | **No** |
| Detached signature (`.asc`, `.sig`, `.intoto.jsonl`) | **No** |
| GitHub artifact attestation for the CLI jar | **No** |
| Authenticode signature on the CLI jar | **No** — Hive Games sign their Windows `.exe` artifacts with Azure Trusted Signing, but the CLI jar is not an `.exe` |
| GitHub's own per-asset `sha256` digest on the releases API | **Yes** |

So the strongest available check is a SHA-256, and it is **GitHub's statement about the
bytes it stores, not Hive Games' signature over the bytes they built**. Fetching both the
digest and the file from the same API in the same session proves the transfer was intact —
it does not independently prove provenance.

Two things follow:

1. **The digest is pinned in this app's source** (`main/bedrock/chunker.ts`), reviewed and
   committed like any other code, so the check is against a constant that a compromised API
   cannot move.
2. **Resolving a newer release from the API is a weaker guarantee and is labelled as one.**
   The result carries `digestTrust: "pinned" | "api"`, and the interface says which rather
   than showing an identical green tick for a materially different assurance.

Nothing unverified ever appears at the final path: the download lands in a `.part` file and
is renamed into place only after the hash matches, reusing the same verified-download code
that fetches the JDK.

### Fetching it from the wizard

`bedrock:fetchChunker` — the handler above — existed for a while with nothing in the
interface ever calling it: a missing Chunker jar dead-ended on **Convert** failing with the
main process's own "Chunker is not installed" message and no route out of it. The wizard's
Bedrock note now asks `bedrock:chunker` for the status the moment it detects a Bedrock
world, and while Chunker is missing it shows a **Download Chunker (~30 MB)** button in place
of **Convert** — never both, because a Convert button that is certain to fail is worse than
one that is not offered.

The button states the size before anything moves, and a progress bar (fed by the same
`bedrock:event` channel a conversion's own progress uses, tagged with the fixed conversion
id `"chunker"`) tracks the download while it runs. A failed fetch — a bad digest, a network
error — shows the reason as an alert and leaves the button in place to retry; nothing here
ever leaves a half-written jar at the final path, per the verification section above.
Success re-asks `bedrock:chunker` and reveals **Convert** in the same spot the download
button occupied, so the world can be converted without a second manual refresh.

See [Automatic dependency provisioning](./dependency-provisioning.md) for how this fits
alongside the Java runtime's own download button and every other tool the app can or
cannot fetch for itself.

---

## Fidelity: what conversion loses

Edition conversion is a translation between two games that genuinely differ, and it is
lossy in known ways. This is surfaced **before** the conversion runs, not after — somebody
who learns after twenty minutes that their villages are gone has been told a fact they can
no longer act on.

Chunker's own README states, under *Currently unsupported features*, that the following do
not convert (or convert only partly):

- **Entities**, excluding paintings and item frames. Mobs, dropped items, minecarts, boats,
  armour stands and villagers will not be in the Java copy. This does not change what
  BlueMap draws, since BlueMap renders blocks rather than entities — but the copy is not a
  faithful world to play.
- **Structure data**, such as villages and strongholds. The blocks already generated are
  still there and still render; what is lost is the game's record that a structure exists,
  so village mechanics and `/locate` will not work.

Two further notes are this app's own observation, and are labelled as such rather than
attributed to upstream:

- **Some blocks have no exact Java equivalent.** The editions do not have identical block
  sets. Chunker maps each block to the closest Java block it can; where there is no
  counterpart the result is an approximation, so Bedrock-only blocks and some block states
  render as something near to, rather than exactly, what was there.
- **This is a one-way copy, not a link.** The converted world is a snapshot. Playing the
  Bedrock world afterwards does not update it, and a map rendered from the copy will not
  show anything built since. Convert again to bring it up to date.

The list records which Chunker version it was read from (1.19.1). When the Chunker actually
running is a different version, the briefing says the list may be out of date rather than
presenting notes read from one version as verified against another.

### Provenance

A converted world is indistinguishable from a native Java world by inspection — that is the
point of the conversion, and also the problem. Six months later, looking at a map with an
odd gap where a village should be, there would be nothing on disk to say the world was ever
Bedrock.

So every conversion writes `bedrock-conversion.json` **into the world it produced**:

```json
{
    "recordVersion": 1,
    "converter": "chunker",
    "converterVersion": "1.19.1",
    "converterPath": "…/chunker-cli-1.19.1.jar",
    "javaVersion": "25.0.3",
    "sourceWorld": "…/MyWorld",
    "sourceName": "Survival Island",
    "sourceEdition": "Bedrock 1.21.30",
    "targetEdition": "Java 1.21.4",
    "targetFormat": "JAVA_1_21_4",
    "convertedAt": "2026-08-04T09:12:44.108Z",
    "durationMs": 192_000,
    "regionFiles": 214,
    "knownLosses": [ "…the fidelity notes in force at the time…" ],
    "appVersion": "0.1.0"
}
```

Inside the world rather than beside it, because a world folder gets moved, copied and
renamed, and a sidecar that stays behind is a record of nothing. Minecraft and BlueMap both
ignore files they do not recognise, so the extra file is inert.

The fidelity notes are **copied in** rather than referenced, so the record keeps meaning the
same thing when the app's own list is later edited — a record pointing at whatever the
current build says would silently restate a later version's limitations as though they had
been shown to the person who ran this conversion.

Every field is something that was observed. Where a fact was not established the field is
null and readers render "not recorded" rather than a guess: a provenance record that invents
its contents is worse than none, since its whole value is being trustworthy without checking.

`conversionProvenance()` returns the subset a render record carries, so a map's details
surface can say where its world came from alongside the engine and JVM that
`render.json` already records.

---

## Failure modes

### Exit code zero does not mean it worked

This is the single most important fact about driving this CLI, it is not obvious, and it was
established by reading `CLI.java` rather than by testing the happy path. Three of Chunker's
failure paths print to stderr and then return normally, so picocli returns 0 and the process
exits 0:

- `Failed to find suitable reader for the world.` — the input was not a world Chunker
  recognises. **The most likely failure in this app**, because it is what a corrupt or
  half-copied Bedrock world produces.
- `Failed to find suitable writer for the world.` — the target format was rejected.
- the `--keepOriginalNBT` guard, which calls `System.exit(0)` explicitly.

A caller that trusts the exit code therefore reports a triumphant success over an empty
directory. So **success here requires all three of**: exit code 0, the `Conversion complete!`
line on stdout, and an output directory verified to hold an actual Java world. Any one
missing is a failure and is reported as one.

The codes that *are* meaningful:

| Code | Meaning | What the app says |
|---|---|---|
| `0` | see above — only trustworthy with the other two checks | |
| `1` | conversion threw — **including most out-of-memory deaths** | `out-of-memory` if the output carries an OOM signature, otherwise `chunker-failed` |
| `2` | picocli usage error | `bad-invocation` — this app built the command line wrong |
| `12` | `OutOfMemoryError` on Chunker's main thread only | `out-of-memory` |

### Memory: the converter grows without bound

> [!IMPORTANT]
> **Chunker's memory use grows without bound on larger worlds — past roughly **200 MB** of
> source world it climbs until the JVM dies.**
>
> **This 200 MB figure is this project's own observation from running Chunker. It is not
> something upstream documents**, and the two accounts disagree about the cause — see below.

On a world past that size, out-of-memory is not an exotic case: it is the *likely* ending.
The conversion slows down, then stops part-way. Nothing is left behind (the `.converting`
rename guard sees to that) and the Bedrock world is not modified.

#### Upstream's account, and why this app does not repeat its advice

Chunker's issue tracker carries a steady stream of out-of-memory reports, and the
maintainer's standing reply describes them as a **resource** problem — the world is big, the
machine's RAM is finite — with the remedy being to close other applications, pass a larger
`-Xmx`, or trim the world with a tool like MCASelector first. No issue is labelled or
described as a leak, and no upstream document states a size threshold.

That advice only holds if the memory use has a ceiling. If it grows without bound, a larger
heap is not a fix:

- it does not decide **whether** the conversion fails, only **when**; and
- a larger one makes the landing worse, because a JVM permitted to reach most of physical
  memory drives the machine into paging or gets killed outright by the operating system —
  which arrives as a process that simply vanished, rather than as an `OutOfMemoryError`
  anybody can read.

So this app does not present a heap size as the remedy anywhere: not in the pre-conversion
warning, not in the failure message, and not in its own JVM arguments.

Out-of-memory reports continue against the pinned **1.19.1** — for example
[issue #2482](https://github.com/HiveGamesOSS/Chunker/issues/2482), open, reported against
`1.19.1-main-f642f8f`. There is therefore **no later Chunker release to point at as a fix**,
and nothing here claims one. If upstream later documents the behaviour or ships a fix, this
section is where the citation belongs.

#### What the app actually does about it

Three things, none of which is a workaround. Splitting the world, retrying with a bigger
heap, or otherwise routing around the behaviour would be guesses about somebody else's bug.

**1. Warn beforehand, sized against this world.** `main/bedrock/memory.ts` assesses the
source world's measured size — the number the world list already computes:

| Source size | Level | What is shown |
|---|---|---|
| under 150 MB (75% of the threshold) | `low` | **nothing at all** |
| 150–200 MB | `approaching` | near the mark; may well convert, and what happens if it does not |
| 200 MB and over | `high` | will probably fail, whose limitation it is, and the options that do work |
| not measured | `unknown` | nothing — a risk invented from a size nobody measured is the same failure as an invented size |

The `high` copy states plainly that giving it more memory is not a fix, that this is a
limitation of the converter rather than of the person's world or of this app, and that the
options that do work are a smaller world, trimming this one first, or a machine with
considerably more RAM. The person can still start it and find out.

**2. Recognise the death when it happens.** Given that Chunker exits 0 on several failure
paths, this one gets its own classified failure and its own sentence — *"The converter ran
out of memory, which it is known to do on worlds this size"* — rather than a generic
"conversion failed".

Exit code 12 is **not** a reliable way to spot it. Chunker's `catch (OutOfMemoryError)`
wraps the body of `run()`, which is the **main** thread; the conversion itself runs as a
task, and a failure on one of its worker threads is captured by
`conversionTask.future().exceptionally(...)`, printed as `Failed with exception` plus a
stack trace, and exited with **code 1**. The most likely out-of-memory death therefore looks
exactly like any other exception. Three signals are treated as out-of-memory:

1. an OOM-shaped line anywhere in either stream — `OutOfMemoryError`, `Java heap space`,
   `GC overhead limit exceeded` (what a leak looks like just before the end: the heap is not
   technically full, the collector is simply making no progress), `Terminating due to
   java.lang.OutOfMemoryError`, `Requested array size exceeds VM limit`;
2. exit code 12;
3. a process that ended with **no** exit code and **no** signal, having made real progress
   and never completed — what the operating system's own OOM killer leaves behind. The
   progress requirement is what stops this swallowing a genuine spawn failure.

**3. Convert large worlds in batches**, one JVM at a time — see
[Batched conversion](#batched-conversion) below. This is the one genuine mitigation, and it
works whichever account of the memory behaviour is correct: if it is a leak, a fresh JVM per
batch reclaims everything on exit; if the world is simply too large for available RAM, a
smaller slice needs less. Either way the peak is bounded by the batch rather than the world.

**4. Choose JVM arguments that make the ending honest rather than pretend to fix it.**
`RECOMMENDED_JVM_ARGS` is `["-XX:+ExitOnOutOfMemoryError"]`, and the notable thing about it
is the absence of `-Xmx`. Leaving the heap ceiling off means the JVM's own default applies —
a documented, predictable fraction of physical RAM, and not a claim by this app that the
problem is handled. `-XX:+ExitOnOutOfMemoryError` is not a mitigation either: it changes
nothing about whether the conversion succeeds. It makes the JVM halt at the first
`OutOfMemoryError` on any thread and print a line the classifier above recognises, instead
of letting the process thrash for minutes and then exit 1 like any other crash.

### Large worlds: resumable, margin-protected batches

When the measured world is in the high-risk range, the desktop app can convert it in bounded
batches rather than pretending one JVM has an unlimited appetite. It first asks Chunker's
`SETTINGS` pass which region files actually exist, then groups each dimension into batches of at
most 64 regions, sized toward a 100 MiB source-data budget. Every batch is passed to Chunker with
`-p` pruning boxes expanded by one chunk on every side. That margin is deliberate: Chunker's
pre-transform handlers inspect immediate neighbour columns when deciding fences, panes, stairs,
doors and other connected blocks. Only the batch's owned `r.<x>.<z>.mca` files are kept; the
partial margin files are discarded rather than allowed to overwrite the complete file produced
by its owning batch.

The output remains under a sibling `.converting` directory until every batch has merged and the
assembled world passes the same `level.dat` plus region-file verification as a single-pass
conversion. `batches.json` is written atomically after each merge. If a JVM fails, the completed
batches remain in the staging directory and the next attempt resumes from the first unfinished
batch; if the plan changes, the old merged state is removed instead of mixing two carve-ups.
Cancel stops the live JVM and prevents the next batch from starting. A failure, cancellation or
unreadable `SETTINGS` report never creates a directory that looks renderable, and the original
Bedrock world is never modified.

The planner and runner are unit-tested with injected Chunker processes and real temporary
directories. The current suite covers malformed settings reports, dimension separation, margin
geometry, ownership filtering, sequential execution, progress scaling, retry/resume, plan
changes, cancellation, parallel region directories and the final staging rename. It does not
claim an end-to-end conversion of a real Bedrock world; that still needs a real world, Chunker
and a Java runtime.

### Batched conversion

A world past the memory threshold is converted in pieces: one JVM per batch, sequentially,
each fully exited before the next starts. Worlds under the threshold take the single-pass
path, unchanged — batching is machinery, and machinery that runs when it is not needed is a
new way to be wrong.

Four things had to be true for this to be possible, and all four were established by reading
Chunker's source rather than assumed.

#### 1. The CLI really can convert a subset

`-p` / `--pruning` takes a chunk bounding box per dimension:

```json
{ "configs": { "minecraft:overworld": {
    "include": true,
    "regions": [{ "minChunkX": -1, "minChunkZ": -1, "maxChunkX": 32, "maxChunkZ": 32 }] } } }
```

`include: true` keeps what is inside the boxes and discards the rest; several boxes union.
This is `com.hivemc.chunker.pruning.PruningRegion`, the same mechanism the web app's pruning
tab drives.

#### 2. Pruning skips reading, so it genuinely bounds memory

The idea would have been pointless if pruning were a filter applied after conversion. It is
not. In `BedrockWorldReader`, whole regions are gated before any task is scheduled, and
columns before the reader is even constructed:

```java
for (ChunkCoordPair chunkCoordPair : region.getValue()) {
    if (!converter.shouldProcessColumn(dimension, chunkCoordPair)) continue;
    Task.async("Creating Column Reader", ..., () -> createColumnReader(chunkCoordPair))
```

An excluded chunk is never read, never decoded, never held.

#### 3. The trap: a naive batcher produces subtly broken worlds

> [!WARNING]
> This is the part that would have made a straightforward implementation actively harmful.

Chunker infers block states from **neighbouring columns** after reading
(`ColumnPreTransformConversionHandler`): fences, walls, panes, bars, tripwire, redstone,
stems, double chests, doors and stair shapes all have their connection state decided by what
is in the adjacent chunk. When a required neighbour never arrives — because pruning excluded
it — the final `flushColumns()` transforms the column anyway, and `handlePreTransform` simply
drops the unresolved edges:

```java
// Remove null values and map them back to column, null values are just unresolved edges
requiredColumns.forEach(((edge, columnData) -> { if (columnData == null) return; ... }));
```

So a column at the edge of a pruned area is converted **as though the neighbouring chunk were
empty**. Nothing hangs, nothing is dropped, and the world converts cleanly — and is quietly
wrong along every batch boundary. A fence that renders unconnected looks like a fence somebody
built that way. That is exactly the failure that is worse than refusing.

#### 4. The fix: convert with a margin, keep only what the margin protected

Each batch is a set of whole 32×32 **regions**, and its pruning boxes are those regions grown
by **one chunk** on every side. Every chunk of every region the batch *owns* therefore has all
its neighbours loaded, and its connection states are decided with complete information. The
margin spills into neighbouring regions, whose files are consequently partial — so after the
batch runs, only the region files it owns are kept and the partial ones are discarded.

One chunk is enough, and that is a property of the handlers rather than a hope: a pre-transform
reads its *immediate* neighbour columns' blocks. The transitive clustering in `trySolve` decides
when columns are processed together, not how far a connection query reaches.

Because every region file is produced by exactly one batch, complete, **merging is a file
copy**. Nothing ever splices chunks inside an Anvil file — the one operation that would put the
format's sector allocation at risk.

#### What is not sliced: the input

A Bedrock world is a single LevelDB database whose keys interleave every dimension and chunk.
Cutting it up outside Chunker would mean writing a LevelDB editor and would risk corrupting the
original — the one thing this feature promises never to touch. **All slicing is expressed to
Chunker as pruning**, and the original is only ever opened for reading.

#### Planning, and why it is never guessed

The batch plan needs to know which regions exist. Chunker answers that itself: `-f SETTINGS`
runs its settings-only writer, which reports the world without converting it and writes
`data.json`:

```json
{ "maps": [...], "settings": {...},
  "dimensions": { "minecraft:overworld": [[regionX, regionZ], ...] } }
```

The region set is `chunkerWorld.getRegions()` — the world's own index — so this is an
enumeration rather than a second full read.

If that report is missing or malformed, the conversion is **refused**. A plan built from a
half-read world would convert some unknown subset and report success, which is silent data
loss. There is deliberately no fallback to a guessed grid.

#### On disk, during and after

```
<output>.converting/          the staging root - the name says "unfinished"
  world/                      the merged Java world, built up batch by batch
  batches.json                which batches are already merged in
  batch-<n>/                  one batch's raw output, deleted once merged
<output>                      appears only at the very end, by rename
```

**Resuming.** A merged batch is recorded in `batches.json` before the next starts, so a
conversion stopped by a failure, a cancellation or a closed app carries on from the first
unmerged batch. The ledger records a plan key; if the world or batch size has changed since,
the completed set is discarded rather than merging two incompatible carve-ups into one world.
The ledger is written *after* the merge and *before* the batch directory is deleted, so a crash
between the two costs one repeated batch rather than a missing region.

**Failure and cancellation** keep the staging root — it holds the completed batches a retry
will skip — and it keeps its `.converting` name, so nothing mistakes it for a world.

**Progress** is reported across the whole job rather than per batch, alongside which batch is
running. A bar that ran 0–100 once per batch and snapped back would read as the conversion
restarting.

#### What batching does not fix

- **Fidelity is unchanged.** Entities and structure data still do not convert.
- **A single batch can still exhaust memory** if one batch's share is itself too large. The
  batch size is chosen from the world's measured bytes per region, which is an estimate.
- **The world-level files** (`level.dat`, `data/`, `datapacks/`) come from the first successful
  batch. They are derived from the source world's level data rather than from the chunks a
  batch happened to read, so each batch's copy says the same thing — but this is reasoning
  about Chunker's behaviour, not something measured here.
- **Paintings and item frames** are the one entity class Chunker converts, and they are
  relocated to the chunk they belong to. One near a batch edge could in principle be relocated
  into a discarded margin region and lost.

### Nothing that looks like a world

The conversion writes into a sibling staging directory ending in `.converting`, and that
directory is renamed to the real name **only after** the output has been verified to contain
both a `level.dat` and at least one region file.

A `level.dat` alone is not enough. Chunker writes level data before it writes chunks, so a
conversion killed early leaves a directory that has one and no terrain at all — which
BlueMap would happily render as a completely blank map rather than fail, so nothing
downstream would ever notice.

This means a cancelled conversion, a crashed JVM, a full disk and a machine that lost power
all leave a directory whose name says plainly that it is unfinished, and which the next run
removes before starting. Converting in place and cleaning up afterwards would rely on the
cleanup code getting to run, which is exactly what does not happen in the cases that matter.

A staging directory left by an earlier attempt is deleted rather than converted into —
otherwise Chunker would write into a directory already holding half of an unrelated
conversion, and the result would pass verification while being a mixture of two worlds.

### Cancellation

Chunker's CLI polls a progress value in a loop and has no interrupt path of its own, so
cancelling means ending the process. As `render/runner.ts` documents from measurement,
Windows has no POSIX signals and libuv implements every `kill` as `TerminateProcess`, so the
JVM dies immediately without running a shutdown hook. There is nothing to flush and nothing
to lose: a half-written Java world is worthless, which is exactly why it is written under a
staging name and deleted rather than saved.

The running conversion is handed out through an `onStart` callback so the cancel channel
reaches the live process. Without it a Cancel button could only set a flag nothing reads —
and a Cancel that reports success while a JVM keeps converting is worse than one that plainly
does not work.

### Other failures

| Situation | What happens |
|---|---|
| Chunker not on disk at all | Reported as a value saying the app normally ships it, that this build has no copy, that the app can fetch the same pinned jar, and every path it looked at |
| Bundled Chunker present but altered | Refused, not run, naming both digests |
| Configured jar missing | Reported by path — never silently replaced with another copy |
| No Java 17+ | Reported, with the JVM layer's own reason |
| Folder is actually a Java world | Refused before anything runs; a Java world needs no conversion |
| Process cannot be spawned | An outcome, not an exception |

---

## Security considerations

- **The original is read-only.** The Bedrock world is only ever passed as `-i`. Nothing in
  this feature writes to it, and the converted copy goes to a sibling directory.
- **No shell.** The CLI is spawned directly. A shell between this process and the JVM would
  mean the cancel path kills the shell and leaves a detached JVM writing gigabytes into
  somebody's disk with nothing holding a handle to it.
- **Downloads are verified before use**, against a digest pinned in source, with the limits
  of that assurance stated above rather than glossed.
- **`levelname.txt` is bounded at 4 KB and cut at the first line break.** It is only
  *conventionally* a world name; nothing stops a corrupt or hostile save shipping a hundred
  megabytes under that name, and reading it whole to draw one row of a list would let a
  chosen folder exhaust the process.
- **The `db` count stops at the first match.** It answers a yes/no question, so reading
  forty thousand directory entries for a number nothing displays would make opening a world
  list needlessly slower.
- **No handler rejects.** Every IPC handler returns a value, including every refusal. A
  rejected `invoke` arrives in the renderer as an `Error` whose message Electron's
  serialisation has mangled, turning a sentence somebody could act on into a stack trace they
  cannot.
- **Electron appears as a type only.** `IpcMain` is a parameter and broadcasting is a
  callback, so the whole directory runs and is tested without an Electron runtime.

---

## Verification

From `design/`:

```
npx vitest run packages/app
npx tsc -p packages/app --noEmit
npx eslint packages/app
```

All three are clean. The Bedrock suites are 121 tests across seven files, and **none of them
needs Chunker, a JVM, or a Bedrock world on disk** — the process runner is injected and
detection runs against fixtures built from empty files, because a Bedrock world's *shape* is
the whole of what detection reads.

| File | Covers |
|---|---|
| `detect.test.ts` | A Bedrock world detected and named; a Java world unaffected; a Java world with a stray `db` folder still Java; a fresh Java world with no terrain still Java; a `saves` folder not mistaken for a world; `levelname.txt` trimming and its absence |
| `chunker.test.ts` | The bundled jar found and reported as `bundled`; preferred over a downloaded copy; yielding to a configured one; a bundled jar failing its digest refused rather than run; the fallback to a downloaded copy; absence reported honestly with every search path; never rejecting; the pinned release agreeing with `bundled-runtimes.manifest.json` |
| `packagedBundles.test.ts` | The packaging guard against a real tree: green when both runtimes are present, red when the jar is missing, red when its bytes differ at the same size, red when the JRE is missing |
| `wiring.test.ts` | That the one real call site hands `registerBedrockHandlers` the packaged `resourcesPath`, which is the argument v1.0.2026 omitted |
| `convert.test.ts` | The documented command line; `--keepOriginalNBT` never passed; **no `-Xmx` in the recommended JVM arguments**; progress parsing including a comma decimal separator; the failure that exits zero; **out-of-memory recognised from exit 12, from a worker-thread stack trace that exits 1, and from an OS kill — but not from a spawn failure or a cancellation**; **the OOM message never suggesting a bigger heap**; verification rejecting a `level.dat` with no terrain; **a cancelled conversion cleaning up after itself**; **a failed conversion leaving nothing that looks like a world**; a stale staging directory cleared |
| `memory.test.ts` | Silence below the threshold and on an unmeasured world; the warning above it sized against the world; that it names whose limitation it is, promises the cleanup that actually happens, attributes the figure to observation rather than upstream, and **never offers more memory as the fix** |
| `batch.test.ts` | Malformed settings reports refused; dimension-separated, row-major plans; one-chunk margin geometry; ownership filtering and custom-dimension paths |
| `batchConvert.test.ts` | One JVM at a time; settings planning; margin spill discarded; atomic ledger; progress scaling; failure and cancellation staging; retry/resume; plan changes; parallel region directories; final rename |
| `ipc.test.ts` | Channels registered and disposed from one list; every refusal a value; the memory warning present on the pre-conversion call and absent for a small world; the recommended JVM arguments reaching the conversion; high-risk worlds routed through the injected batcher; a Java world refused before anything runs; cancel reaching the live conversion, and answering false when there is nothing to cancel |

The detection fixtures go through the real `inspectWorldFolder`, so the two halves are proven
to agree — a hand-written listing could satisfy the detector perfectly while the reader never
produces it.

**Not verified:** no end-to-end conversion of a real Bedrock world has been run in this
repository, because that needs a Bedrock world, a 30 MB third-party download and a JVM, none
of which belong in the test suite. The CLI contract driven here — flags, progress format,
exit codes and the three zero-exit failure paths — was read from Chunker's own source at tag
`1.19.1` rather than observed. The size estimate is an estimate and is labelled as one
everywhere it is shown.

On memory specifically, three things are worth separating:

- **Not measured here.** The 200 MB threshold is carried over as an operational observation.
  This repository has not profiled Chunker's heap, established the threshold experimentally,
  or confirmed that the growth is genuinely unbounded rather than merely large. The code and
  the copy both treat it as a soft warning line, never as a hard limit.
- **Not confirmed upstream.** Chunker documents no such limit, and its maintainers describe
  out-of-memory as a world-size-versus-RAM problem. The attribution in the warning copy says
  so explicitly so nobody reads the figure as upstream's.
- **Not observed in this repository.** The OOM classification is exercised against
  synthesised process output — a real Chunker OOM has not been captured here. The
  `OutOfMemoryError` and `Terminating due to …` line shapes are the JVM's documented output;
  the claim that a worker-thread OOM exits 1 rather than 12 is read from `CLI.java`'s control
  flow rather than observed.

On batching, the mechanism is proven from source but **no batched world has been produced and
inspected here**. These are the specific claims a reviewer should want evidence for before
trusting a batched world:

- **That a one-chunk margin is sufficient.** Argued from the pre-transform handlers reading
  only immediate neighbour columns. If any handler reaches two chunks, batch boundaries would
  still carry wrong connection states — the exact failure the margin exists to prevent, and
  invisible without a side-by-side comparison against a single-pass conversion.
- **That region files from separate passes are independent.** Anvil files are per-32×32-area
  and this is how every world-editing tool treats them, but this repository has not diffed a
  batched world against a single-pass one to confirm the merge is lossless.
- **That the world-level files are batch-invariant.** Taking `level.dat` and `data/` from the
  first successful batch assumes each batch would have written the same thing. Reasoned, not
  measured.
- **That `-f SETTINGS` is cheap.** It reports `chunkerWorld.getRegions()`, which is an index
  rather than a chunk read, so it should not itself exhaust memory on a world too large to
  convert in one pass. Not profiled.
- **The `data.json` shape** is read from `SettingsLevelWriter.flushLevel` at `1.19.1`. A
  Chunker whose output format moves would be refused rather than misread — the parser rejects
  anything unexpected — but the refusal would need a code change to fix.

The single highest-value verification, if a Bedrock world and a JVM are available, is to
convert one world both ways and diff the results. That is what would turn the margin argument
from sound reasoning into a demonstrated fact.

## 廣東話

呢篇講 Bedrock Edition 世界。

BlueMap render 嘅係 Java Edition。一個 Bedrock Edition 世界喺 disk 上面係另一樣嘢，所以直接 render 唔到 —— 但可以轉換，而呢份文件講齊兩半：認出一個 Bedrock 世界並且照直講出嚟，以及用 Chunker 轉換佢，令佢 render 得到。

呢兩半刻意獨立。偵測係乜都唔使裝都行得 —— 唔使 Chunker、唔使 JVM、唔使網絡 —— 而且佢本身就值得有，因為「呢個係 Bedrock 世界，要先轉換」呢句說話，遠遠有用過「唔係一個世界」。

### 行為 (Behaviour)

#### 一個世界點解叫做 Bedrock

兩個版本粗略睇好似，而且啱啱好共用一個檔名。Java Edition 嘅 chunk 儲存喺 `region/*.mca`（Anvil），Bedrock 就喺 `db/`（一個 LevelDB 資料庫）。Java 嘅 `level.dat` 係 big-endian NBT 加 gzip，Bedrock 嘅係 little-endian NBT 匿喺一個 8-byte header 後面。Java 嘅世界名喺 `level.dat` 入面嘅 `LevelName`，Bedrock 就用 `levelname.txt`，純 UTF-8。額外維度方面，Java 用 `DIM-1/`、`DIM1/`、`dimensions/`，Bedrock 就全部喺同一個資料庫入面。

兩者都有 `level.dat`，所以一個 Bedrock 世界先至一路以嚟都入得世界清單。佢會列出嚟，Java NBT reader 喺 header 度失敗，然後嗰一行帶住一個 `detailsError` 而冇名字出現 —— 睇落就好似講*你個世界壞咗*。佢冇壞。佢係另一個版本，而嗰句係另一句說話，帶另一個下一步。

`main/bedrock/detect.ts` 而家好好地答呢個問題。佢攞 `main/world/inspect.ts` 本身已經產出嘅資料夾清單，回傳一個判定連同支持佢嘅標記：`certain` 即係有一個載住真 LevelDB 檔案嘅 `db` 目錄，或者一個 `db` 目錄同 `levelname.txt` 並存；`likely` 即係一個光脫脫嘅 `db` 目錄同 `level.dat` 並存，而冇其他嘢佐證。

**Java 證據永遠一鋪清袋。** 任何維度入面嘅任何 Anvil region 檔，或者一個 `region/` 或 `dimensions/` 目錄，都會令個資料夾定性為 Java，唔理隔籬仲有乜。`db` 唔係一個保留名 —— 一個 mod、一個 datapack 或者一個備份工具，都可以喺一個完全健康嘅 Java 世界入面留低一個；將嗰個世界送去一個佢唔需要嘅轉換器，就係一個佢主人診斷唔到嘅錯答案。一個啱啱建立、`region/` 係空嘅 Java 世界，一樣係 Java。

喺世界清單入面，一個偵測到嘅 Bedrock 世界而家會帶 `edition: "bedrock"`、由 `levelname.txt` 讀返嚟嘅真名，同埋嗰句一句起兩句止嘅解釋 —— 而唔係一個解析錯誤。

#### 轉換

轉換係一個由人主動開始嘅明確步驟。唔會因為望咗個資料夾就順手轉換：佢會產生第二份幾 GB 嘅世界副本，而嗰個係一個決定，唔應該因為開咗個畫面就發生。

喺粒掣之前，介面已經有以下事實可以顯示：

- **份副本去邊。** 喺原本隔籬 —— `MyWorld` 會喺同一個上層目錄產生 `MyWorld (Java)` —— 永遠唔會入去佢入面。寫入個 Bedrock 世界會打破「原本嘢冇郁過」呢個承諾，亦會令 Minecraft 管理緊一個入面有個唔知乜目錄嘅存檔。
- **大概會有幾大。** 一個明確標示為估算嘅估算：源世界大細嘅一至兩倍。Anvil 將 chunk 打包成 32×32 嘅 region 再用自己嗰套壓縮，而 LevelDB 就逐 chunk 儲存再 compact，所以個比例真係會浮動。一個度唔到大細嘅世界，唔會有一個作出嚟嘅估算。
- **原本嘅嘢永遠唔會改。** Chunker 淨係讀佢個輸入，而呢個 app 亦永遠淨係將 Bedrock 世界當 `-i` 咁傳。
- **會蝕啲乜。** 見下面保真度嗰節。
- **個世界係咪大到好可能會失敗。** 係對住眼前嗰個世界去衡量，唔係泛泛而談 —— 見下面記憶體嗰節。一個舒舒服服喺門檻以下嘅世界會完全唔出聲，因為一個每個世界都彈嘅警告，就係一個冇人睇嘅警告。

進度會即時報告，全程都可以取消，而且被取消或者失敗嘅轉換都唔會留低任何嘢 —— 見下面「唔會留低任何似世界嘅嘢」。

### Chunker

[Chunker](https://github.com/HiveGamesOSS/Chunker) 係 Hive Games 喺 Minecraft Java 同 Bedrock 版本之間嘅開源轉換器。佢係呢件事嘅公認工具：佢就係 `chunker.app` 背後嗰個轉換器，Microsoft 喺 Bedrock creator 文件入面有記載佢，而且個專案收到 Mojang Studios 嘅資助。

留意：個 repository 係 `HiveGamesOSS/Chunker`，唔係 `HiveGamingNetwork/Chunker`。

佢出嘅形式係一個 Electron 桌面 app *同埋*一個獨立 CLI jar。呢個 app 用嘅係 CLI：一個檔、大約 30 MB、冇 installer、冇原生元件。

#### 授權，同點解乜都唔內置

Chunker 係 **MIT 授權**，Copyright (c) 2024 Hive Games（英文版有 LICENSE 連結）。再散佈係容許嘅；MIT 容許使用、修改同散佈。所以**內置係容許嘅**，只要版權聲明同授權文本一齊出。必須嘅署名係：版權聲明同許可聲明必須包含喺軟件嘅所有副本或者主要部分入面。

**但呢個 app 依然唔內置佢。** 嗰個係一個產品決定，唔係授權限制，而呢個分別重要到要照直講明，而唔係由介面暗示一個根本唔存在嘅禁令。理由係：每個 installer 都要背 30 MB，對一個大部分人永遠唔會用嘅功能嚟講係一單蝕本交易；而一份內置副本會將一個轉換器版本釘死喺一個 app release 上面 —— 個轉換器係按自己嘅節奏追新 Minecraft 版本，應該唔使出新 app 都更新得到。

所以個 app 會先偵測已安裝嘅 Chunker，淨係喺被要求嗰陣先提議去攞一個。

#### CLI 合約

呢個係由 Chunker 嘅 README 同 `cli/src/main/java/com/hivemc/chunker/cli/CLI.java` 讀返嚟，唔係靠估。

```
java -jar chunker-cli-<version>.jar -i "<world>" -f JAVA_1_21_4 -o "<output>"
```

**要求：Java 17 或以上。** 呢個 app 唔會為佢另外開一套 Java 故事 —— 佢重用 `main/java/` 已經備置同探測過嘅 Temurin JDK，而嗰個自己嘅要求已經遠高過 17。

必要 flag 有三個：`-i`（`--inputDirectory`）係要讀嘅世界，`-o`（`--outputDirectory`）係寫去邊，`-f`（`--outputFormat`）係目標格式，形式係 `EDITION_X_Y_Z` 或者 `INPUT`。可選 flag（`-m` block mapping、`-s` world settings、`-p` pruning、`-c` converter settings、`-r` dimension registry、`-d` dimension mapping、`-b` biome mapping）全部收一個 JSON 檔或者 object。Chunker 亦都會自動由輸入世界入面嘅 `*.chunker.json` 檔攞呢啲嘢。

關於點解永遠唔傳 `--keepOriginalNBT`：`-k` / `--keepOriginalNBT` 淨係喺輸出格式同輸入相同嗰陣先有用。Bedrock 轉 Java 永遠都唔會相同，而 Chunker 對呢種情況嘅守衛係印去 stderr 之後叫 `System.exit(0)`。傳咗佢，就會令每一次轉換都變成一個靜靜雞乜都唔做、但報告成功嘅 no-op。

目標格式預設係 `JAVA_1_21_4`。嗰個係 Chunker writer registry 入面一個真實嘅識別碼，唔係靠估 —— 個 registry 會列舉佢支援嘅 Java 版本，而一個識別碼就係嗰個版本將點換成底線、再掉走尾隨嘅 `.0`（`JAVA_1_20`、`JAVA_1_20_5`、`JAVA_1_21_4`、`JAVA_26_1`…）。揀嘅係一個 BlueMap 早就讀得到嘅現代格式，而唔係 Chunker 提供最新嗰個：個目標淨係需要係 renderer 一定識嘅嘢。一個未知識別碼會畀 Chunker 拒絕，並且列出每一個有效值，而呢個 app 會捕捉同報告佢，唔會吞咗。

#### 點樣攞到佢，同「已驗證」老實嚟講係咩意思

個 app 會按次序睇四個地方：設定入面配置嘅 jar（報告為 `configured`）、`CHUNKER_CLI_JAR`（`environment`）、**呢個 app 自己安裝檔入面嗰份 jar**，即 `<resources>/bundled/chunker/`（`bundled`），最後先至係佢自己下載去自己 data 目錄嗰份副本（`downloaded`）。兩個明示嘅覆寫排喺前面係有意嘅：指名咗一個轉換器嘅人係真係想用嗰個。新裝機冇人配置過任何嘢，所以**一部普通安裝解析到嘅就係夾埋喺安裝檔嗰份 jar**，而介面會講明係四個入面邊一個，唔會淨係報一個版本號。一條配置咗但唔存在嘅路徑會被**報告**，永遠唔會靜靜雞跳過去用另一份副本 —— 行緊一個唔係你指名嗰個轉換器，就係一個人花成個下晝諗點解一個設定乜都唔做嘅原因。

夾埋嗰份 jar 喺行之前會同 `bundled-runtimes.manifest.json` 入面 commit 咗嘅 SHA-256 對過，每次開程式對一次。一份擺喺 bundled 路徑、但啲 bytes 唔係呢個 release 嗰啲嘅 jar，會**被拒絕而唔會行**：唔係個安裝壞咗就係有人換咗佢，而另一頭係人哋世界嘅唯一一份副本，冇「應該冇事嘅」呢種講法。

第四步係留返畀開發 checkout（乜都未 stage 過），同埋畀夾埋嗰份真係唔見咗嘅安裝。佢係自動、對 digest、有真進度嘅；個 app 入面冇任何瀏覽器連結，亦冇「你自己去攞」呢種文案。

如果叫佢去攞一個，下載會對一個 SHA-256。嗰個檢查值幾多錢係研究過而唔係假設嘅，而答案比人想要嘅窄。截至 Chunker 1.19.1：冇發佈 `SHA256SUMS` 或者同等 checksum 檔；冇分離簽名（`.asc`、`.sig`、`.intoto.jsonl`）；CLI jar 冇 GitHub artifact attestation；CLI jar 亦冇 Authenticode 簽名（Hive Games 有用 Azure Trusted Signing 簽佢哋嘅 Windows `.exe` 產物，但 CLI jar 唔係 `.exe`）。唯一有嘅，就係 releases API 上面 GitHub 自己嘅逐 asset `sha256` digest。

所以最強嘅可用檢查就係一個 SHA-256，而佢係**GitHub 對佢所儲存嗰啲 bytes 嘅陳述，唔係 Hive Games 對佢哋 build 出嚟嗰啲 bytes 嘅簽名**。喺同一個 session、由同一個 API 攞埋 digest 同檔案，證明到嘅係傳輸完好無缺 —— 唔會獨立證明到來源。

由此有兩件事：一，**個 digest 釘死喺呢個 app 嘅原始碼入面**（`main/bedrock/chunker.ts`），同其他程式碼一樣經過審查同 commit，所以個檢查係對住一個被入侵嘅 API 郁唔到嘅常數。二，**由 API 解析一個更新嘅 release 係一個弱啲嘅保證，而且會標示為弱啲**。結果會帶 `digestTrust: "pinned" | "api"`，而介面會講明係邊個，唔會為兩種實質唔同嘅保證顯示同一個綠剔。

未驗證嘅嘢永遠唔會出現喺最終路徑：下載落一個 `.part` 檔，等 hash 對上先至改名就位，重用同一套攞 JDK 嗰啲已驗證下載程式碼。

#### 由 wizard 度攞佢

呢個 app **有**夾埋 Chunker。`scripts/stage-bundled-runtimes.mjs` 會將釘死嘅 `chunker-cli-1.19.1.jar` stage 落 `dist/bundled/chunker/`，electron-builder 再將佢抄入安裝檔做 `resources/bundled/chunker/`，程式就喺嗰度攞。裝咗 Worldlens 嘅人，就算拔咗網線都轉換到一個 Bedrock 世界。

v1.0.2026 出過嘅事值得寫低：份 jar 入咗安裝檔，但冇任何嘢識去嗰度搵佢。嗰個 `Worldlens-1.0.2026-full.nupkg` 入面實實在在有 `lib/net45/resources/bundled/chunker/chunker-cli-1.19.1.jar`，大細啱啱好係釘死嘅 31,790,149 bytes，而 `findChunker` 根本冇 `resourcesPath` 呢個選項 —— 所以每一部裝咗嘅機都去搵用戶 profile，搵唔到，然後一路揹住份 jar 一路話冇裝到轉換器。打包係綠嘅，extraResources 都啱，唯一嘅症狀就係個 app 否認自己擁有緊佢正喺度出貨嘅嘢。**一頭駁咗、兩頭都冇人用嘅功能，會靜靜雞出貨。** `scripts/assert-packaged-bundles.mjs` 就係防止再發生嘅守衛：佢讀嘅係 electron-builder 真係寫出嚟嗰個目錄，唔係描述佢嗰份設定。

`bedrock:fetchChunker` —— 即係上面嗰個 handler —— 存在咗一段時間，但介面從來冇嘢叫過佢：一個唔見咗嘅 Chunker jar 會喺 **Convert** 度撞死，得返 main process 自己嗰句「Chunker is not installed」，冇路走。而家 wizard 嘅 Bedrock 提示一偵測到 Bedrock 世界就會即刻問 `bedrock:chunker` 攞狀態，而喺 Chunker 唔見咗嗰陣，佢會喺 **Convert** 嘅位置顯示一粒 **Download Chunker (~30 MB)** 掣 —— 永遠唔會兩粒一齊出，因為一粒實會失敗嘅 Convert 掣，仲衰過根本唔提供。

粒掣喺任何嘢郁之前就講明大細，而一條進度條（由轉換自己都用嗰條 `bedrock:event` channel 餵，帶住固定嘅轉換 id `"chunker"`）會喺下載期間追蹤佢。一次失敗嘅攞取 —— digest 唔啱、網絡錯誤 —— 會用 alert 顯示原因，並且留返粒掣畀你重試；按上面驗證嗰節所講，呢度永遠唔會喺最終路徑留低一個寫咗一半嘅 jar。成功之後會再問一次 `bedrock:chunker`，並且喺下載掣原本嗰個位露出 **Convert**，令個世界可以轉換而唔使再手動 refresh 多次。

呢件事點樣同 Java runtime 自己嗰粒下載掣、以及個 app 幫到手同幫唔到手嘅其他工具並存，見 [Automatic dependency provisioning](./dependency-provisioning.md)。

### 保真度：轉換會蝕啲乜

版本轉換係兩個真係有分別嘅遊戲之間嘅翻譯，而且係以已知方式有損。呢啲嘢會喺轉換行之**前**擺出嚟，唔係之後 —— 一個做咗二十分鐘先知自己啲村莊冇咗嘅人，收到嘅係一個佢已經行動唔到嘅事實。

Chunker 自己個 README 喺 *Currently unsupported features* 底下講明以下嘢唔會轉換（或者只會部分轉換）：

- **實體 (Entities)**，畫同物品展示框除外。生物、掉落物、礦車、船、盔甲架同村民，喺 Java 副本入面都唔會有。呢樣唔會改變 BlueMap 畫乜，因為 BlueMap render 嘅係方塊唔係實體 —— 但份副本唔係一個可以忠實去玩嘅世界。
- **結構資料 (Structure data)**，例如村莊同要塞。已經生成咗嘅方塊仍然喺度、仍然 render 得到；蝕咗嘅係遊戲對「呢度有個結構」嘅記錄，所以村莊機制同 `/locate` 唔會 work。

仲有兩點係呢個 app 自己嘅觀察，並且標明係咁，唔會賴上游：

- **有啲方塊冇準確嘅 Java 對應。** 兩個版本嘅方塊集唔一樣。Chunker 會將每個方塊對映到佢搵到最接近嘅 Java 方塊；冇對應嘅話結果就係一個近似，所以 Bedrock 獨有嘅方塊同某啲方塊狀態，render 出嚟會係接近但唔完全等於原本嗰樣。
- **呢個係一次單向副本，唔係一條連結。** 轉換出嚟嘅世界係一個快照。之後再玩嗰個 Bedrock 世界唔會更新佢，而由副本 render 出嚟嘅地圖亦唔會顯示之後起嘅嘢。要更新就再轉換一次。

呢張清單會記低佢係由邊個 Chunker 版本讀返嚟（1.19.1）。當實際行緊嘅 Chunker 係另一個版本，簡報會講明呢張清單可能過時，而唔會將由一個版本讀返嚟嘅筆記，當成對另一個版本驗證過咁呈現。

#### 出處 (Provenance)

一個轉換出嚟嘅世界，靠檢查係同一個原生 Java 世界分唔開 —— 呢個正正就係轉換嘅重點，同時亦係問題。六個月之後，望住一張地圖，村莊嗰個位有個古怪嘅窿，disk 上面根本冇任何嘢話畀你聽呢個世界曾經係 Bedrock。

所以每次轉換都會將 `bedrock-conversion.json` 寫**入佢產生嗰個世界入面**：

```json
{
    "recordVersion": 1,
    "converter": "chunker",
    "converterVersion": "1.19.1",
    "converterPath": "…/chunker-cli-1.19.1.jar",
    "javaVersion": "25.0.3",
    "sourceWorld": "…/MyWorld",
    "sourceName": "Survival Island",
    "sourceEdition": "Bedrock 1.21.30",
    "targetEdition": "Java 1.21.4",
    "targetFormat": "JAVA_1_21_4",
    "convertedAt": "2026-08-04T09:12:44.108Z",
    "durationMs": 192_000,
    "regionFiles": 214,
    "knownLosses": [ "…the fidelity notes in force at the time…" ],
    "appVersion": "0.1.0"
}
```

擺喺世界入面而唔係隔籬，因為一個世界資料夾會畀人搬、複製同改名，而一個留喺原地嘅 sidecar 就係一份乜都唔記錄嘅記錄。Minecraft 同 BlueMap 都會忽略佢哋認唔到嘅檔案，所以呢個額外檔案係惰性嘅。

保真度筆記係**複製入去**而唔係引用，令呢份記錄喺 app 自己張清單日後被改之後仍然講緊同一件事 —— 一份指住「當前 build 講乜」嘅記錄，會靜靜雞將後來版本嘅限制講到好似當初畀行呢次轉換嗰個人睇過咁。

每一個欄位都係觀察到嘅嘢。凡係一個事實冇確立到，嗰個欄位就係 null，而讀取者會顯示「not recorded」而唔係一個估算：一份自己作內容嘅出處記錄，仲衰過冇 —— 因為佢全部價值就係喺唔使核對之下都值得信。

`conversionProvenance()` 會回傳 render 記錄所帶嘅子集，令一張地圖嘅詳情介面可以喺 `render.json` 已經記錄嘅引擎同 JVM 之外，仲講到佢個世界由邊度嚟。

### 失敗情況 (Failure modes)

#### Exit code 零唔代表成功

呢個係駕馭呢個 CLI 最重要嘅一個事實，佢唔顯而易見，而且係靠讀 `CLI.java` 而唔係靠行 happy path 確立嘅。Chunker 有三條失敗路徑會印去 stderr 然後正常返回，所以 picocli 回 0，個 process 亦 exit 0：

- `Failed to find suitable reader for the world.` —— 輸入唔係一個 Chunker 認得嘅世界。**呢個係呢個 app 入面最有可能嘅失敗**，因為一個損壞或者複製到一半嘅 Bedrock 世界就係咁。
- `Failed to find suitable writer for the world.` —— 目標格式被拒絕。
- `--keepOriginalNBT` 嗰個守衛，佢明確咁叫 `System.exit(0)`。

所以一個信 exit code 嘅呼叫者，會對住一個空目錄報告一次凱旋式嘅成功。因此**呢度嘅成功要三樣嘢齊**：exit code 0、stdout 上面有 `Conversion complete!` 嗰行、以及一個經驗證確實載住一個真 Java 世界嘅輸出目錄。少一樣都係失敗，亦會報告成失敗。

*真係*有意義嗰啲 code：`0` 見上，淨係配埋另外兩個檢查先信得過。`1` 即係轉換 throw 咗 —— **包括大部分 out-of-memory 死法** —— 如果輸出帶 OOM 特徵就報 `out-of-memory`，否則報 `chunker-failed`。`2` 係 picocli 用法錯誤，報 `bad-invocation`，即係呢個 app 砌錯咗指令列。`12` 係淨係 Chunker 主執行緒上面嘅 `OutOfMemoryError`，報 `out-of-memory`。

#### 記憶體：個轉換器會無上限咁脹

**Chunker 喺較大嘅世界上面記憶體用量會無上限咁脹 —— 過咗大約 200 MB 源世界，佢就會一路爬到 JVM 死。**呢個 200 MB 數字係本專案自己行 Chunker 嘅觀察，**唔係上游有記載嘅嘢**，而且兩邊對成因嘅講法唔一致，見下。

一個過咗嗰個大細嘅世界，out-of-memory 唔係一個罕見案例：佢係*大概率*嘅結局。轉換會慢落嚟，然後喺中途停低。乜都唔會留低（由 `.converting` 改名守衛負責），而 Bedrock 世界亦唔會被修改。

##### 上游嘅講法，同點解呢個 app 唔覆述佢嘅建議

Chunker 嘅 issue tracker 長期有 out-of-memory 報告，而維護者嘅慣常回覆將佢哋描述成一個**資源**問題 —— 世界大、機嘅 RAM 有限 —— 解決方法係閂咗其他 application、傳一個大啲嘅 `-Xmx`，或者先用 MCASelector 之類嘅工具修剪個世界。冇任何 issue 被標記或者描述成 leak，亦冇任何上游文件講過一個大細門檻。

嗰個建議淨係喺記憶體用量有上限嗰陣先成立。如果佢無上限咁脹，一個更大嘅 heap 唔係一個修復：佢決定唔到轉換**會唔會**失敗，只決定**幾時**失敗；而更大嗰個仲會令收場更差，因為一個獲准去到大部分實體記憶體嘅 JVM，會逼部機 paging，或者索性畀作業系統殺咗 —— 而嗰個到手嘅形態係一個就咁消失咗嘅 process，唔係一個有人讀得明嘅 `OutOfMemoryError`。

所以呢個 app 任何地方都唔會將一個 heap 大細當成解決方法：轉換前警告唔會、失敗訊息唔會、佢自己嘅 JVM 參數都唔會。

針對釘死嘅 **1.19.1** 嘅 out-of-memory 報告仍然持續 —— 例如英文版連結嗰個 issue #2482，仲開住，係對住 `1.19.1-main-f642f8f` 報告嘅。所以**冇一個更新嘅 Chunker release 可以指住話係修復**，呢度亦冇聲稱有。如果上游日後記載咗呢個行為或者出咗修復，呢一節就係擺引用嘅地方。

##### 個 app 實際做咗乜

三樣嘢，全部都唔係 workaround。切開個世界、用大啲嘅 heap 重試，或者其他繞開呢個行為嘅做法，都係對人哋個 bug 亂估。

**1. 事前警告，而且對住呢個世界去衡量。** `main/bedrock/memory.ts` 會評估源世界度到嘅大細 —— 就係世界清單本身已經計算嘅嗰個數字。150 MB 以下（門檻嘅 75%）係 `low`，**乜都唔顯示**。150–200 MB 係 `approaching`，講明接近門檻、好可能仍然轉換到，同埋如果唔得會點。200 MB 或以上係 `high`，講明好可能會失敗、呢個係邊個嘅限制，以及真係 work 嘅選項。度唔到大細係 `unknown`，乜都唔顯示 —— 由一個冇人度過嘅大細作出嚟嘅風險，同一個作出嚟嘅大細係同一種失敗。

`high` 嗰段文案照直講明畀多啲記憶體唔係修復、呢個係轉換器嘅限制而唔係嗰個人個世界或者呢個 app 嘅限制，以及真係 work 嘅選項係一個細啲嘅世界、先修剪呢個，或者一部 RAM 多好多嘅機。個人仍然可以照開，試下點。

**2. 佢真係發生嗰陣認得佢。** 鑑於 Chunker 喺幾條失敗路徑上面都 exit 0，呢一種有佢自己嘅分類失敗同自己嘅一句說話 ——「個轉換器爆咗記憶體，而佢喺呢個大細嘅世界上面係已知會咁」—— 而唔係一句通用嘅「轉換失敗」。

Exit code 12 **唔係**一個可靠嘅偵測方法。Chunker 嘅 `catch (OutOfMemoryError)` 包住 `run()` 個 body，即係**主**執行緒；而轉換本身係當一個 task 咁行，佢其中一條 worker 執行緒上面嘅失敗會由 `conversionTask.future().exceptionally(...)` 捕捉，印成 `Failed with exception` 加一個 stack trace，然後以 **code 1** 退出。所以最有可能嗰種 out-of-memory 死法，睇落同任何其他例外一模一樣。有三個訊號會當成 out-of-memory：

1. 任何一條 stream 入面任何位置有一行 OOM 形狀嘅嘢 —— `OutOfMemoryError`、`Java heap space`、`GC overhead limit exceeded`（一個 leak 喺臨死前嘅樣：heap 技術上未滿，只係 collector 完全冇進展）、`Terminating due to java.lang.OutOfMemoryError`、`Requested array size exceeds VM limit`；
2. exit code 12；
3. 一個**冇** exit code 亦**冇** signal 就結束咗嘅 process，而佢曾經有真實進度、又從未完成 —— 即係作業系統自己個 OOM killer 留低嘅樣。「要有進度」呢個要求，就係阻止呢條規則吞咗一次真正嘅 spawn 失敗。

**3. 大世界分批轉換**，一次一個 JVM —— 見下面分批轉換。呢個係唯一一個真正嘅緩解，而且無論邊個關於記憶體行為嘅講法啱，佢都 work：如果係 leak，每批一個新 JVM 喺退出時會收返所有嘢；如果純粹係世界對可用 RAM 嚟講太大，一片細啲嘅就需要少啲。無論點，峰值都係由批次而唔係由成個世界決定。

**4. 揀一啲令結局老實而唔係扮修復咗嘅 JVM 參數。** `RECOMMENDED_JVM_ARGS` 係 `["-XX:+ExitOnOutOfMemoryError"]`，而佢最值得留意嘅係冇 `-Xmx`。唔設 heap 上限即係用 JVM 自己嘅預設 —— 一個有文件、可預測嘅實體 RAM 比例，而唔係呢個 app 聲稱問題已經處理咗。`-XX:+ExitOnOutOfMemoryError` 亦唔係一個緩解：佢完全唔改變轉換會唔會成功。佢做嘅係令 JVM 喺任何執行緒上面第一個 `OutOfMemoryError` 就即刻停低，並且印一行上面個分類器認得嘅嘢，而唔係畀個 process thrash 幾分鐘之後再好似任何其他 crash 咁 exit 1。

#### 大世界：可續傳、有邊距保護嘅批次

當度到嘅世界喺高風險範圍，桌面 app 可以用有界批次去轉換佢，而唔係扮一個 JVM 有無限胃口。佢會先問 Chunker 嘅 `SETTINGS` pass 實際有邊啲 region 檔存在，然後將每個維度分成最多 64 個 region 一批，按大約 100 MiB 源資料預算去定大細。每一批都會用 `-p` pruning box 傳畀 Chunker，而每邊都向外擴一個 chunk。嗰個邊距係刻意嘅：Chunker 嘅 pre-transform handler 喺決定圍欄、玻璃板、樓梯、門同其他相連方塊嗰陣，會檢視緊鄰嘅 column。淨係保留批次自己擁有嘅 `r.<x>.<z>.mca` 檔；邊距產生嘅部分檔案會掉咗，唔會容許佢覆寫由擁有嗰批產生嘅完整檔案。

輸出會一直留喺一個兄弟 `.converting` 目錄底下，直到每一批都合併咗、而且組裝好嘅世界通過同單次轉換一樣嘅 `level.dat` 加 region 檔驗證為止。`batches.json` 喺每次合併之後原子化咁寫入。如果一個 JVM 失敗，已完成嘅批次會留喺 staging 目錄，下次嘗試會由第一個未完成嘅批次續做；如果個計劃改咗，舊嘅合併狀態會刪走，而唔係將兩種切法撈埋一齊。取消會停低行緊嗰個 JVM，並且阻止下一批開始。失敗、取消或者一份讀唔到嘅 `SETTINGS` 報告，永遠唔會製造一個睇落 render 得嘅目錄，而原本嘅 Bedrock 世界永遠唔會被修改。

Planner 同 runner 都有單元測試，用注入嘅 Chunker process 同真嘅臨時目錄。現時嘅測試組涵蓋畸形 settings 報告、維度分離、邊距幾何、擁有權過濾、順序執行、進度縮放、重試/續傳、計劃改變、取消、平行 region 目錄，同最後嘅 staging 改名。佢冇聲稱做過一個真 Bedrock 世界嘅端到端轉換；嗰樣仍然需要一個真世界、Chunker 同一個 Java runtime。

#### 分批轉換 (Batched conversion)

一個過咗記憶體門檻嘅世界會分件轉換：每批一個 JVM、順序行、每個完全退出咗先開下一個。門檻以下嘅世界照行單次路徑，冇改變 —— 分批係機械，而喺唔需要嗰陣行嘅機械，就係一種新嘅出錯方法。

要令呢件事可能，有四樣嘢必須成立，而四樣都係靠讀 Chunker 原始碼確立，唔係假設。

**一、個 CLI 真係轉換得到一個子集。** `-p` / `--pruning` 收一個逐維度嘅 chunk bounding box：

```json
{ "configs": { "minecraft:overworld": {
    "include": true,
    "regions": [{ "minChunkX": -1, "minChunkZ": -1, "maxChunkX": 32, "maxChunkZ": 32 }] } } }
```

`include: true` 保留 box 入面嘅嘢、掉走其餘；多個 box 會取聯集。呢個就係 `com.hivemc.chunker.pruning.PruningRegion`，同 web app 個 pruning 分頁驅動嘅係同一套機制。

**二、Pruning 係略過讀取，所以佢真係限制到記憶體。** 如果 pruning 係轉換之後先套用嘅過濾器，成個諗法就冇意義。但佢唔係。喺 `BedrockWorldReader` 入面，整個 region 喺任何 task 被排程之前就已經被閘住，而 column 更加係喺 reader 都未建構出嚟之前就閘住：

```java
for (ChunkCoordPair chunkCoordPair : region.getValue()) {
    if (!converter.shouldProcessColumn(dimension, chunkCoordPair)) continue;
    Task.async("Creating Column Reader", ..., () -> createColumnReader(chunkCoordPair))
```

一個被排除嘅 chunk 永遠唔會被讀、唔會被解碼、唔會被持有。

**三、個陷阱：一個天真嘅分批器會產生微妙咁壞咗嘅世界。** 呢一部分就係會令一個直觀實作變成主動有害嘅地方。Chunker 喺讀完之後會由**鄰近 column** 推斷方塊狀態（`ColumnPreTransformConversionHandler`）：圍欄、牆、玻璃板、鐵欄、絆線、紅石、莖、雙箱、門同樓梯形狀，全部都係由隔籬 chunk 有乜去決定佢哋嘅連接狀態。當一個需要嘅鄰居永遠冇到 —— 因為 pruning 排除咗佢 —— 最後嗰個 `flushColumns()` 照樣會 transform 嗰個 column，而 `handlePreTransform` 就索性掉咗啲未解決嘅邊：

```java
// Remove null values and map them back to column, null values are just unresolved edges
requiredColumns.forEach(((edge, columnData) -> { if (columnData == null) return; ... }));
```

所以一個喺被修剪區域邊緣嘅 column，會**當隔籬個 chunk 係空**咁轉換。乜都唔會 hang、乜都唔會唔見、個世界會乾乾淨淨咁轉換完 —— 而且喺每一條批次邊界上面靜靜雞錯咗。一條 render 出嚟冇連接嘅圍欄，睇落就好似有人特登咁起。呢個正正就係嗰種衰過拒絕嘅失敗。

**四、修復方法：帶邊距去轉換，淨係保留邊距保護到嘅嘢。** 每一批係一組完整嘅 32×32 **region**，而佢嘅 pruning box 就係嗰啲 region 每邊向外脹**一個 chunk**。所以嗰批*擁有*嘅每個 region 嘅每個 chunk，佢所有鄰居都載入咗，佢哋嘅連接狀態係喺資訊完整之下決定。個邊距會溢出去鄰近 region，令嗰啲檔案變成部分檔 —— 所以嗰批行完之後，淨係保留佢擁有嘅 region 檔，部分嗰啲掉咗。

一個 chunk 已經夠，而呢個係 handler 嘅性質，唔係一個願望：一個 pre-transform 讀嘅係佢*緊鄰*嘅 column 嘅方塊。`trySolve` 入面嘅遞移聚類決定嘅係幾時將 column 一齊處理，唔係一個連接查詢伸幾遠。

因為每一個 region 檔都係啱啱好由一批完整咁產生，**合併就係一次檔案複製**。呢度永遠唔會喺一個 Anvil 檔入面接駁 chunk —— 嗰個係唯一一個會令格式嘅 sector 分配有風險嘅操作。

**冇被切開嘅係：輸入。** 一個 Bedrock 世界係單一個 LevelDB 資料庫，佢啲 key 將每個維度同 chunk 交錯咁擺。喺 Chunker 之外切開佢，即係要寫一個 LevelDB 編輯器，而且會有損壞原本嘢嘅風險 —— 而嗰樣正正就係呢個功能承諾永遠唔會掂。**所有切割都係以 pruning 嘅形式表達畀 Chunker**，而原本嗰個世界永遠淨係開嚟讀。

**規劃，同點解永遠唔會靠估。** 批次計劃需要知道有邊啲 region 存在。Chunker 自己識答：`-f SETTINGS` 會行佢嘅 settings-only writer，報告個世界而唔轉換佢，並且寫一個 `data.json`：

```json
{ "maps": [...], "settings": {...},
  "dimensions": { "minecraft:overworld": [[regionX, regionZ], ...] } }
```

嗰個 region 集合係 `chunkerWorld.getRegions()` —— 即係世界自己嘅索引 —— 所以呢個係一次列舉，唔係第二次完整讀取。

如果嗰份報告唔見咗或者畸形，轉換會**被拒絕**。一個由讀咗一半嘅世界砌出嚟嘅計劃，會轉換咗一個未知子集然後報告成功，而嗰個就係無聲嘅資料流失。呢度刻意冇「退回去估一個格網」呢條路。

**Disk 上面，期間同之後：**

```
<output>.converting/          the staging root - the name says "unfinished"
  world/                      the merged Java world, built up batch by batch
  batches.json                which batches are already merged in
  batch-<n>/                  one batch's raw output, deleted once merged
<output>                      appears only at the very end, by rename
```

**續傳。** 一批合併咗會喺下一批開始之前記入 `batches.json`，所以一個因為失敗、取消或者 app 被閂而停低嘅轉換，會由第一個未合併嘅批次接住做。個 ledger 會記一個 plan key；如果之後個世界或者批次大細改咗，已完成嗰批會掉咗，而唔會將兩種唔相容嘅切法合併成一個世界。個 ledger 係喺合併*之後*、批次目錄被刪*之前*寫，所以喺兩者之間 crash 嘅代價係重做一批，而唔係少咗一個 region。

**失敗同取消**會保住 staging root —— 因為佢載住重試會跳過嗰啲已完成批次 —— 而且佢會保住個 `.converting` 名，令冇嘢會誤認佢係一個世界。

**進度**係按成份工報告，而唔係逐批報告，同時會講明行緊邊一批。一條每批由 0 跑到 100 再彈返轉頭嘅進度條，讀落就好似轉換重新開始。

**分批修唔到嘅嘢：**保真度冇改變，實體同結構資料一樣唔會轉換。如果一批自己嗰份都太大，**單一批次仍然可以爆記憶體**；批次大細係由世界度到嘅每 region byte 數揀出嚟，而嗰個係一個估算。**世界層級嘅檔案**（`level.dat`、`data/`、`datapacks/`）嚟自第一個成功嘅批次；佢哋係由源世界嘅 level data 推導，而唔係由某一批啱啱讀到嘅 chunk 推導，所以每一批嘅副本都會講同一樣嘢 —— 但呢個係對 Chunker 行為嘅推理，唔係喺呢度度過嘅嘢。**畫同物品展示框**係 Chunker 唯一會轉換嘅實體類別，而佢哋會被重新安置去佢哋所屬嘅 chunk；一個喺批次邊緣附近嘅，原則上可能被重新安置入一個被掉走嘅邊距 region 而消失。

#### 唔會留低任何似世界嘅嘢

轉換會寫入一個以 `.converting` 結尾嘅兄弟 staging 目錄，而嗰個目錄**淨係喺**輸出經驗證確實同時載住一個 `level.dat` 同至少一個 region 檔之後，先會改名成真名。

單單一個 `level.dat` 唔夠。Chunker 係先寫 level data 先寫 chunk，所以一次早早被殺嘅轉換會留低一個有 `level.dat` 但完全冇地形嘅目錄 —— 而 BlueMap 會開開心心咁將佢 render 成一張完全空白嘅地圖而唔會失敗，所以下游永遠唔會有嘢察覺到。

即係話，一次被取消嘅轉換、一個 crash 咗嘅 JVM、一個爆滿嘅 disk 同一部停電嘅機，全部都會留低一個名字照直講明佢未完成嘅目錄，而下次執行會喺開始之前刪走佢。原地轉換再事後清理，就要靠清理程式碼行得到，而喺真正重要嗰啲情況入面，佢正正就係行唔到。

一個早前嘗試留低嘅 staging 目錄係刪走而唔會寫入去 —— 否則 Chunker 就會寫入一個已經載住半次無關轉換嘅目錄，而結果會通過驗證，但實質係兩個世界撈埋。

#### 取消 (Cancellation)

Chunker 個 CLI 係喺一個 loop 入面輪詢一個進度值，佢自己冇中斷路徑，所以取消即係結束個 process。正如 `render/runner.ts` 由實測記錄咁講，Windows 冇 POSIX signal，而 libuv 將每個 `kill` 都實作成 `TerminateProcess`，所以個 JVM 會即刻死，唔會行 shutdown hook。冇嘢要 flush，亦冇嘢會蝕：一個寫咗一半嘅 Java 世界一文不值，而呢個正正就係點解佢係寫喺一個 staging 名底下、然後刪走而唔係保存。

行緊嘅轉換會透過一個 `onStart` callback 交出嚟，令取消 channel 到達到實時嗰個 process。冇咗佢，一粒 Cancel 掣就只可以設一個冇嘢讀嘅 flag —— 而一個報告成功但 JVM 仲喺度轉換緊嘅 Cancel，衰過一個擺明冇用嘅 Cancel。

#### 其他失敗

Chunker 冇裝：當一個值咁報告，講明佢係乜、佢個授權、呢個 app 唔內置佢，同埋個 app 搵過邊度。配置咗嘅 jar 唔見咗：按路徑報告 —— 永遠唔會靜靜雞用另一份副本頂替。冇 Java 17+：報告，連 JVM 層自己嘅原因。資料夾其實係一個 Java 世界：喺任何嘢行之前就拒絕，一個 Java 世界唔需要轉換。Process spawn 唔到：係一個結果，唔係一個例外。

### 保安考慮 (Security considerations)

- **原本嘢係唯讀。** Bedrock 世界永遠淨係以 `-i` 傳入。呢個功能冇任何嘢會寫入佢，而轉換出嚟嘅副本去一個兄弟目錄。
- **冇 shell。** 個 CLI 係直接 spawn。喺呢個 process 同 JVM 之間夾住一個 shell，就意味住取消路徑殺咗個 shell，留低一個脫離咗嘅 JVM 繼續向人哋個 disk 寫幾 GB，而冇任何嘢揸住佢個 handle。
- **下載喺使用之前驗證**，對住一個釘死喺原始碼嘅 digest，而嗰個保證嘅限度喺上面已經講明，唔會含糊過去。
- **`levelname.txt` 上限 4 KB，而且喺第一個換行處切斷。** 佢淨係*按慣例*係一個世界名；冇嘢阻止一個損壞或者有惡意嘅存檔用嗰個名塞一百 MB 入去，而為咗畫清單一行就成個讀晒，會令一個被揀嘅資料夾耗盡個 process。
- **`db` 嘅計數喺第一個命中就停。** 佢答嘅係一條是非題，所以為一個冇嘢顯示嘅數字去讀四萬個目錄項目，只會令打開世界清單無謂咁慢啲。
- **冇 handler 會 reject。** 每個 IPC handler 都回傳一個值，包括每一個拒絕。一個被 reject 嘅 `invoke` 到達 renderer 嗰陣係一個 `Error`，而佢個訊息已經畀 Electron 嘅序列化搞爛咗，將一句人可以據以行動嘅說話，變成一個佢行動唔到嘅 stack trace。
- **Electron 淨係以型別出現。** `IpcMain` 係一個參數，而廣播係一個 callback，所以成個目錄喺冇 Electron runtime 之下都行得到、測得到。

### 驗證 (Verification)

喺 `design/` 度：

```
npx vitest run packages/app
npx tsc -p packages/app --noEmit
npx eslint packages/app
```

三個都乾淨。Bedrock 嘅測試組係跨七個檔案 121 個測試，而且**冇一個需要 Chunker、JVM 或者 disk 上面一個真 Bedrock 世界** —— process runner 係注入嘅，而偵測係對住由空檔案砌出嚟嘅 fixture 行，因為一個 Bedrock 世界嘅*形狀*就係偵測所讀嘅全部。

各檔案覆蓋嘅嘢：`detect.test.ts` 覆蓋一個 Bedrock 世界被偵測同命名、一個 Java 世界唔受影響、一個有多咗個 `db` 資料夾嘅 Java 世界仍然係 Java、一個冇地形嘅新 Java 世界仍然係 Java、一個 `saves` 資料夾唔會被誤認做世界，以及 `levelname.txt` 嘅修剪同佢唔存在嘅情況。`chunker.test.ts` 覆蓋 Chunker 唔存在時老實報告連授權同搜尋路徑、永遠唔 reject、配置嘅優先於下載嘅、一個唔見咗嘅配置 jar 係報告而唔係頂替，以及由 jar 名讀版本、讀唔到就回 `null` 而唔係估。`convert.test.ts` 覆蓋有記載嘅指令列、永遠唔傳 `--keepOriginalNBT`、**建議 JVM 參數入面冇 `-Xmx`**、進度解析（包括逗號做小數點）、嗰個 exit 零嘅失敗、**out-of-memory 由 exit 12、由一個 exit 1 嘅 worker 執行緒 stack trace、同由一次 OS kill 認出 —— 但唔會由一次 spawn 失敗或者一次取消認出**、**OOM 訊息永遠唔會建議大啲嘅 heap**、驗證會拒絕一個冇地形嘅 `level.dat`、**被取消嘅轉換會自己清理乾淨**、**失敗嘅轉換唔會留低任何似世界嘅嘢**，以及過期嘅 staging 目錄會被清走。`memory.test.ts` 覆蓋門檻以下同度唔到大細嘅世界會靜音、門檻以上會出一個對住呢個世界衡量嘅警告，以及嗰段文案會點名係邊個嘅限制、承諾嘅清理係真係會發生嘅、將個數字歸因於觀察而唔係上游，同埋**永遠唔會提出加記憶體做修復**。`batch.test.ts` 覆蓋畸形 settings 報告會被拒絕、按維度分開嘅 row-major 計劃、一個 chunk 嘅邊距幾何，以及擁有權過濾同自訂維度路徑。`batchConvert.test.ts` 覆蓋一次一個 JVM、settings 規劃、邊距溢出被掉走、原子化 ledger、進度縮放、失敗同取消嘅 staging、重試/續傳、計劃改變、平行 region 目錄同最後改名。`ipc.test.ts` 覆蓋 channel 由一份清單註冊同棄置、每個拒絕都係一個值、記憶體警告喺轉換前呼叫時存在而細世界時唔存在、建議 JVM 參數有到達轉換、高風險世界經注入嘅分批器路由、一個 Java 世界喺任何嘢行之前被拒絕，以及取消到達到實時轉換、冇嘢可取消時回 false。

偵測嘅 fixture 會行真嘅 `inspectWorldFolder`，所以兩半嘢係證明咗一致 —— 一份人手寫嘅清單可以完美咁滿足個偵測器，但 reader 根本永遠唔會產出佢。

**未驗證：**呢個 repository 冇行過一個真 Bedrock 世界嘅端到端轉換，因為嗰樣需要一個 Bedrock 世界、一個 30 MB 第三方下載同一個 JVM，三樣都唔應該入測試組。呢度駕馭嘅 CLI 合約 —— flag、進度格式、exit code 同嗰三條 exit 零嘅失敗路徑 —— 係由 Chunker 自己喺 tag `1.19.1` 嘅原始碼讀返嚟，唔係觀察到。個大細估算就係一個估算，而且喺每一個顯示佢嘅地方都標明係咁。

專講記憶體，有三樣嘢值得分開講：

- **呢度冇度過。** 200 MB 門檻係當一個運作觀察沿用落嚟。呢個 repository 冇 profile 過 Chunker 個 heap、冇用實驗確立過嗰個門檻，亦冇確認過個增長真係無上限而唔係純粹好大。程式碼同文案都當佢係一條軟警告線，永遠唔當硬限制。
- **上游冇確認過。** Chunker 冇記載過任何呢類限制，而佢哋嘅維護者將 out-of-memory 描述成一個「世界大細對 RAM」嘅問題。警告文案入面嘅歸因明確咁講咗，令冇人會將呢個數字讀成上游嘅。
- **呢個 repository 冇觀察過。** OOM 分類係對住合成嘅 process 輸出去測試 —— 呢度冇捕捉過一次真嘅 Chunker OOM。`OutOfMemoryError` 同 `Terminating due to …` 嗰啲行嘅形狀係 JVM 有文件嘅輸出；而「worker 執行緒 OOM 係 exit 1 而唔係 12」呢個聲稱，係由 `CLI.java` 嘅控制流讀出嚟，唔係觀察到。

講到分批，機制係由原始碼證明，但**呢度未曾產生同檢查過一個分批出嚟嘅世界**。以下係一個審查者喺信一個分批世界之前，應該想要證據嘅具體聲稱：

- **一個 chunk 嘅邊距係足夠。** 論據係 pre-transform handler 淨係讀緊鄰嘅 column。如果有任何 handler 伸到兩個 chunk，批次邊界就仍然會帶錯嘅連接狀態 —— 正正就係邊距為咗防止而存在嗰種失敗，而且冇同一次單次轉換做並排比較就睇唔出。
- **由唔同 pass 產生嘅 region 檔係獨立。** Anvil 檔係逐 32×32 區域一個，而每個世界編輯工具都係咁對待佢哋，但呢個 repository 未曾將一個分批世界同一個單次世界做 diff 去確認合併係無損。
- **世界層級檔案係與批次無關。** 由第一個成功批次攞 `level.dat` 同 `data/`，係假設咗每一批都會寫同一樣嘢。呢個係推理，唔係度過。
- **`-f SETTINGS` 係平嘅。** 佢報告 `chunkerWorld.getRegions()`，即係一個索引而唔係一次 chunk 讀取，所以佢自己唔應該喺一個大到單次轉換唔到嘅世界上面爆記憶體。冇 profile 過。
- **`data.json` 嘅形狀**係由 `1.19.1` 嘅 `SettingsLevelWriter.flushLevel` 讀返嚟。一個輸出格式郁咗嘅 Chunker 會被拒絕而唔會被誤讀 —— 個 parser 會拒絕任何意料之外嘅嘢 —— 但要修好嗰個拒絕就要改程式碼。

如果有一個 Bedrock 世界同一個 JVM，單一價值最高嘅驗證，就係將同一個世界用兩種方式轉換再 diff 結果。嗰樣先會將邊距論據由一個合理推理變成一個已證實嘅事實。
