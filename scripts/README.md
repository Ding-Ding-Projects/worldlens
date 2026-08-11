# scripts

Release-time scripts. `count-lines.mjs`, `pick-dim-sum.mjs`, `release-version.mjs` and
`lint-workflows.mjs` are plain Node with no dependencies
beyond the standard library and `git`, so they run identically on a developer machine and on a CI
runner. `split-parts.mjs` and `join-parts.mjs` are thin command lines over the workspace package
`@worldlens/parts`, which has to be built first; they say so and exit 2 when it is not.

## `bootstrap.mjs`

Bootstraps the fresh-checkout dependencies and verifies that each one is usable. `--check` is a
strict read-only mode: it checks the already-installed workspace, Electron binary, Java toolchain,
BlueMap shadow JAR and local Playwright CLI without invoking `npm exec`, downloading pnpm, or
installing a browser dependency. The normal mode uses the manifest-pinned pnpm version and the
same local Playwright CLI to install what is missing.

The Electron recovery path verifies the cached archive against Electron's checksum manifest before
extracting it. Its recursive cleanup is bounded to the package directory and rejects lexical escapes
and Windows reparse points (or POSIX symbolic links) before removing anything. Shadow-JAR detection
requires a regular, non-trivial ZIP/JAR with both a local-file header and an end-of-central-directory
record; a zero-byte, tiny, stale or non-JAR file does not satisfy the check.

## `count-lines.mjs`

Prints the line-count table that every release publishes. CI runs it at the tagged commit, so
the number is produced by the same run that built the artifacts and cannot drift from a
hand-typed figure.

```bash
node scripts/count-lines.mjs                    # human-readable table
node scripts/count-lines.mjs --format=markdown  # the form CI pastes into release notes
```

It reports source, tests, styles and markup, config, and docs **separately**, each with both
total and non-blank lines, and it splits per workspace package. A single grand number on its own
is the least informative version of this and the easiest to inflate, so there isn't one.

**Authorship** is attributed per _surviving_ line via `git blame --line-porcelain`, never by
summing added lines from the log, because churn is not authorship and a line that was written
and later deleted belongs to nobody. A commit counts as agent-written when its author is an
automation identity or its message carries a `Co-Authored-By` trailer naming an agent; the
script prints which rule matched how many lines so the figure can be checked. The number is
reported plainly in either direction: a high agent share is not a boast and not an apology.

**Two totals, both labelled.** The project total covers hand-written rows. The grand total
covers everything counted, with the held-out rows still visible in the same table, so a reader
can see both what the project is and what the repository holds.

**Exclusions are stated, never silent:**

| Excluded                              | Why                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `vendor/`                             | the vendored upstream BlueMap Java sources, read as reference, not this project's code |
| `node_modules/`                       | installed third-party dependencies                                                     |
| `dist/`, `out/`, `release/`, `.vite/` | build output, regenerated from the sources that are counted                            |
| `coverage/`                           | test coverage output                                                                   |
| lockfiles                             | a resolver's output, not code anyone wrote                                             |

Held out of the project total but present in the grand total: `design/packages/engine/assets/`
(bundled resource-pack and legacy mapping JSON), `design/packages/ui/public/` (upstream web
assets and translation tables), and recorded test fixtures. Binary files count as zero lines.

The script **self-checks**: if the attribution total and the line total disagree it exits
non-zero rather than publishing two numbers that contradict each other in the same table.

If the breakdown is ever wrong or misses an area, fix the script and re-run it. Do not count by
hand — an ad-hoc `wc -l` sweep silently drops every file that matches no path prefix, and a
total that quietly loses whole directories is exactly the misrepresentation this is meant to
prevent.

## `pick-dim-sum.mjs`

Resolves the authoritative bilingual dim sum code name and the URL of its already-published public
catalog photo. It never reads or writes photo bytes.

```bash
node scripts/pick-dim-sum.mjs --ordinal 1
node scripts/pick-dim-sum.mjs --ordinal 1 --json
```

The photos are **not stored in this repository or attached to its releases**. They live in the
public `Ding-Ding-Projects/dim-sum-photos` repository, published as GitHub Release assets in capped
`catalog-v1*` volumes. The script reads the canonical catalog index and release metadata, validates
the selected record and exact asset URL, then emits a link for Worldlens release notes. It never
downloads, copies, or caches the image in this consumer release.

The volumes are not evenly sized, so the script resolves which one holds a given asset by asking
the releases API rather than by dividing an ordinal by a page size.

Dish selection is derived from the monotonic workflow run number rather than a live release count
or ledger file. A ledger would
have to be committed back by CI, and a workflow that pushes to its own repository is the
automation loop the project rules forbid. The ordinal is monotonic, so a dish is never silently
reused, and the published releases are themselves the auditable mapping. If the catalog runs out
of unused records, selection fails and the non-blocking release step omits the code name instead of
wrapping to an earlier dish.

## `release-version.mjs`

Resolves the one SemVer shared by the Squirrel package, `app.getVersion()`, the update feed and the
GitHub release tag. The checked-in app manifest stays at a `major.minor.0` base; run number 863
becomes package version `major.minor.863` and tag `vmajor.minor.863`.

```bash
node scripts/release-version.mjs --package design/packages/app/package.json --run-number 863
node scripts/release-version.mjs --package design/packages/app/package.json --run-number 863 --write-package --format lines
```

Malformed bases, leading-zero or unsafe run numbers, and any tag that is not exactly the packaged
version with one leading `v` fail closed. Packaging and publication each invoke the helper so one
job cannot silently recover the former split package/tag sequence.

Network metadata is schema-, type-, character- and length-checked before it becomes runner state.
The live 2,866-record catalog validates in full, including its real 235-character longest English
alternative text and Traditional Chinese punctuation. Rejected values are not printed. The public
URL must be HTTPS on `github.com`, must point to the selected `catalog-v1*` asset, and may not carry
credentials, a port, query, or fragment. **Nothing is generated or downloaded.** On failure the
release continues without a code name or photo link and names the failed catalog step rather than
substituting an image.

## `lint-workflows.mjs`

Guards the six release steps that accept dynamic metadata:

```bash
node scripts/lint-workflows.mjs
node --test scripts/bootstrap.test.mjs scripts/collect-squirrel-release.test.mjs scripts/lint-workflows.test.mjs scripts/pick-dim-sum.test.mjs scripts/release-asset-manifest.test.mjs scripts/release-version.test.mjs
node scripts/build-changelog.mjs --check
```

Its hand-written inventory pins each expected environment variable to its exact Actions expression
and pins the complete normalized `env` and `run` blocks with SHA-256. Any added or altered line
fails, including a line that recovers data indirectly through `printenv` or shell parameter
indirection. It additionally scans every executable region in the release job and fingerprints the
complete job, so a differently named adjacent shell step is not outside the inventory. The same
guard inventories all 117 external action uses across all seven executable workflows, requires
immutable full SHAs and explicit supported hosted images, disables persisted checkout credentials,
and proves the release depends on every fatal workflow-security, test, render and packaging job.
Screenshot capture is separately required to remain advisory through job-level
`continue-on-error: true` and must stay outside the publisher's `needs` list. The same early job
proves the committed changelog outputs are current on branch and pull-request runs. Tag-triggered
runs skip only that self-referential assertion because a release tag is created after its target
commit; every other pre-publication validation and packaging check still runs. Generated-only
commits are excluded by the generator so the branch gate remains satisfiable. The tests read the
exact historical workflows
from Git: 11 findings at recovered revision `98988e3`, 19 at the assigned
`e13777927876a3d7898778f18193e9465bc97cc2` baseline, and zero in the fixed workflow.

To change a watched script or the release job structure, review the entire new boundary and
deliberately replace its stored `stepFingerprint()` and `jobFingerprint()` values. To update an
action, resolve and review the intended tag in the action's official repository with
`git ls-remote`, then update its full SHA and per-file inventory count.

Full boundary and verification notes: [Release workflow security](../docs/release-workflow-security.md).

## `split-parts.mjs` and `join-parts.mjs`

A GitHub release asset is capped at **2 GB per file**, and a rendered world is tens of gigabytes of
tiles. These two split an oversized asset into 1.7 GB parts beside a manifest, and put it back
together again.

```bash
node scripts/split-parts.mjs big-world.zip                 # 1.7 GB parts, beside the source
node scripts/split-parts.mjs big-world.zip --out release/  # parts somewhere else
node scripts/split-parts.mjs --check big-world.zip         # would this be split? exits 0 either way

node scripts/join-parts.mjs big-world.zip.parts.json       # rejoin, verifying as it goes
node scripts/join-parts.mjs big-world.zip.parts.json --out ./worlds
```

Both are **thin**: every byte of the logic lives in `design/packages/parts`, is unit tested there,
and is the same code the desktop application runs when it downloads what CI published. Build it
first:

```bash
cd design && pnpm install && pnpm --filter @worldlens/parts run build
```

A file no larger than the part size is **passed through untouched** - nothing is written, and the
report says so. Producing a one-part manifest for a 40 MB installer would make every consumer of
every release learn the join format to open an asset that was never split.

Rejoining verifies **each part** as it appends it and then the **whole file**, and names the exact
part that is wrong rather than only reporting that the result is. A rejoin that skipped that check
would produce a corrupt world which unzips cleanly and then surfaces as a rendering bug three layers
away. An interrupted rejoin picks up from the last complete part, re-verifying the prefix it found
rather than trusting it, and exits 1 with the part named if anything disagrees.

Full documentation: [`docs/large-worlds.md`](../docs/large-worlds.md).
