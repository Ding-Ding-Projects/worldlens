# Release workflow security boundary

The release job turns repository state, prior-job outputs and metadata from the public dim-sum
catalog into release notes and assets. Dynamic values cross into a shell only through explicit
environment mappings. The shell reads those variables inside double quotes and passes them to
data-only consumers; no Actions expression is inserted into executable script text.

## Behaviour

Six steps form the watched boundary: **Resolve release tag**, **Verify nominated release already
exists**, **Resolve dim sum code name**, **Prepare release payload and hash manifest**, **Compose
release notes**, and **Publish**. `scripts/lint-workflows.mjs` names each step, every environment
variable it accepts and the exact Actions expression that may supply that variable. It also pins
SHA-256 fingerprints of each complete normalized `env` and `run` block. It rejects a missing or
duplicated step, changed provenance, a direct or multiline expression in script text, YAML
anchor/alias indirection, an unquoted read, and **any** reviewed-block change. The full-block
fingerprint is the fail-closed boundary: it catches indirect reads such as `printenv`, parameter
indirection and a newly added line without pretending a list of dangerous shell spellings can ever
be complete.

The guard also scans every executable `run:` or `script:` region in the release job, irrespective
of its display name, and pins a SHA-256 fingerprint of the complete normalized release job. The
three named boundaries are therefore not an allowlist with gaps around it: inserting or renaming an
adjacent shell step fails, and a direct Actions expression in that step receives its own diagnostic.

`scripts/pick-dim-sum.mjs` treats catalog and release API responses as untrusted input. It checks
the expected object/array shapes, field types, per-field character sets and bounds, exact dish ID,
safe slug and filename shapes, `catalog-v1*` release tag, asset size, and the exact public
release-asset URL. The English alternative-text boundary is 235 Unicode characters because that is
the real maximum in the current 2,866-record catalog; Traditional Chinese names retain their
legitimate CJK punctuation. Rejected content is never copied into its error message. The consumer
workflow emits only metadata and the public URL: it never downloads, copies, caches, or attaches
the image bytes.

The packaging job calls `scripts/collect-squirrel-release.mjs prepare` before electron-builder.
That phase clears every validated Squirrel output candidate and the collection directory, then
records the expected version and start time. Collection accepts exactly one populated output
directory, one fresh versioned `Setup.exe`, one fresh full `.nupkg`, optional fresh delta packages,
and one non-empty `RELEASES`. Every package record must match the emitted filename, byte count and
SHA-1; empty, stale, duplicate, missing, extra, wrong-version, wrong-size or wrong-hash output fails
closed.

`scripts/release-asset-manifest.mjs` then records the exact unique, non-empty release asset set,
including Setup, full package, `RELEASES`, extras and jar evidence, with each byte count and
SHA-256. Publication downloads every asset again into a new directory and requires an exact name,
count, size and digest match. It also reads the release record back and verifies the exact target
SHA, tag, non-draft/non-prerelease state, notes, and asset inventory.

## Configuration

The watched inventory is deliberately hand-written in `scripts/lint-workflows.mjs`. Adding,
renaming or splitting one of the six release steps requires reviewing the complete changed
blocks, updating their expected bindings and replacing the stored step and complete-job fingerprints
with `stepFingerprint()` and `jobFingerprint()` values. A fingerprint update is a security review
decision, not a mechanical response to a red test. New dynamic values still need an exact `env:`
binding, a quoted data-only use, and negative fixtures for their context.

All 114 external action invocations across the repository's seven executable workflows are pinned
to full commit SHAs. The hand-written inventory must name every workflow, every external action and
its exact per-file use count; a new workflow missing from that inventory fails the guard. To update
one, resolve the intended major tag from the action's official
repository with `git ls-remote <official-repository> refs/tags/v4`, review that commit and its
release, replace the SHA and update the exact per-file count in `ACTION_INVENTORIES`. The tests must
fail on a mutable tag before the new SHA is accepted.

All executable workflows use explicit supported hosted-runner labels (`ubuntu-24.04` or
`windows-2022`); mutable `*-latest`, self-hosted, expression-derived and unknown labels are rejected
by the hand-written job inventory in `cloudRunnerPolicy.test.ts`.

The workflow defaults to `contents: read`; only the release job receives `contents: write`. Every
checkout in every executable workflow sets `persist-credentials: false`, including the release
checkout. The catalog
API may use the configured token for rate limits, but the public asset download never receives it.
The release job explicitly depends on the workflow-security job, so a failing root guard,
actionlint run or `build-changelog.mjs --check` blocks publication. It also depends on application
lint, build, typecheck, the full test suite, the real Java round trip, jar build, real test-world
render and Windows packaging. A failure or skipped fatal dependency means no publish. Screenshot
capture runs as advisory diagnostic evidence with job-level `continue-on-error: true`, uploads
available images and failure traces, and is deliberately absent from the publisher's dependencies.
Pushes on `main` nominate publication automatically; manual dispatch must explicitly retain its
publish input. The serialized publisher checks existing published releases by exact commit SHA, so
one intended commit is nominated at most once and an existing exact target is verified rather than
published again.

## Failure modes

- A workflow-boundary violation fails the early **Lint the workflow files** job before build or
  publication.
- Invalid or unavailable catalog metadata fails only the optional dish-resolution step. The release
  continues without a code name or public photo link and says so in its notes; it never generates,
  downloads, copies, attaches, or substitutes an image.
- Missing, zero-byte, stale, duplicate or mismatched Squirrel output stops before artifact upload.
- A downloaded release asset set with a missing, extra, empty, duplicate, size-mismatched or
  digest-mismatched file fails readback; a wrong target, tag, body or draft state fails metadata
  readback.
- `actionlint` 1.7.12 can deadlock on this Windows host when it feeds many script blocks to the
  Windows `shellcheck` process: its process bridge fills the child input before starting the child.
  Windows syntax-only `actionlint` plus direct shellcheck are supplementary. The authoritative
  combined proof runs on Linux, where actionlint invokes shellcheck normally.

## Security considerations

Environment variables prevent their contents from becoming shell grammar, but quoting alone is not
enough if a later line recovers the value through `printenv`, indirection or another execution
route. Exact whole-block fingerprints make that complete script the reviewed unit. Canonical inline
provenance bindings separately prevent a YAML alias from quietly swapping in a different source.

The picker emits only the four outputs the workflow consumes: English and Traditional Chinese
names, English alternative text and the exact public photo URL. Output values are single-line
validated metadata. No local path exists because the consumer never materializes the photo.

The packaged CLI jar, complete Squirrel installer set and test-world archive carry SHA-256 records
produced in their own jobs and checked after the same-run artifact download. Release notes include
the exact commit, changelog SHA, workflow start/completion/duration, reproducible line-count table,
per-asset byte counts and SHA-256 values, the permanent unsigned warning, and the bilingual code
name plus public photo link when the catalog resolves. These checks prove that the bytes survived
transport unchanged. They do **not** prove that a compromised producer emitted good bytes: the
producer job, pinned action code, repository source, vendored source and hosted runner remain the
trust boundary.

## Verification

```bash
node --test scripts/bootstrap.test.mjs scripts/collect-squirrel-release.test.mjs scripts/lint-workflows.test.mjs scripts/pick-dim-sum.test.mjs scripts/release-asset-manifest.test.mjs
node scripts/lint-workflows.mjs
node scripts/build-changelog.mjs --check
actionlint -no-color -oneline -shellcheck=
```

The regression test reads the historical workflow files directly from Git. Commit `98988e3` must
fail at its original 11 direct-expression sites. The assigned baseline
`e13777927876a3d7898778f18193e9465bc97cc2` must fail at its exact 19 sites. The checked-in fixed
workflow must have zero findings, exact provenance and reviewed block fingerprints. Focused fixtures
also cover multiline expressions, YAML aliases, altered provenance, indirect `printenv`/parameter
execution, harmless block drift, an adjacent differently named shell step, all 114 immutable action
pins across every executable workflow, exact workflow-inventory completeness, advisory screenshot
status, fatal release-gate dependency, real
235-character alternative text, malformed schema, control characters, unsafe Markdown contexts,
wrong asset origins, no-photo-download enforcement, path containment, zero/stale/duplicate/wrong-
version Squirrel fixtures, RELEASES hash/size mismatches, duplicate/empty release-manifest assets,
wrong release target or notes, and downloaded asset-set mismatches. On Windows, `actionlint` with
shellcheck integration can deadlock; the documented local command proves workflow structure with
shellcheck disabled, while the pinned Linux hosted job supplies the authoritative shellcheck pass.

### Suggested articles

- [GitHub-hosted cloud runners](./cloud-runners.md)
- [Changelog and the in-app changelog viewer](./changelog-viewer.md)
- [Large worlds and rendered maps](./large-worlds.md)
