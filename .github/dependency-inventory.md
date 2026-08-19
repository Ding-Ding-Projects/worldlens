# CI dependency inventory

This inventory is hand-written against the current `.github/workflows/ci.yml` and its
reusable `.github/workflows/build-jars.yml` workflow. It covers the five remaining
retained jobs and the inputs they require. Four of those jobs produce or publish
artifacts; `check` is a workspace build only, uploads no artifact, and does not gate the
release. The `release` job depends exactly on `package`, `jars`, and `test-world`. It
intentionally does not list removed test or quality jobs.

## Workflow job list

| Job | Runner | First real work after checkout and tool setup | Safe outputs |
| --- | --- | --- | --- |
| `check` — Build workspace | `ubuntu-24.04` | `pnpm install --frozen-lockfile` in `design`, then `pnpm build` | No uploaded artifact. Workspace build output is consumed only in this job; it is not a release asset. |
| `jars` — Build seven BlueMap jars (reusable workflow) | Caller job invokes `build-jars.yml`; its `build` job runs on `ubuntu-24.04` | Resolve the vendored BlueMap version, then run the Gradle wrapper for all seven `shadowJar` tasks | Seven per-implementation jar artifacts, plus the jar index, checksums, and release-notes markdown; reusable outputs include the upstream version and commit. |
| `package` — Windows installer | `windows-2022` | `pnpm install --frozen-lockfile` in `design`, then `pnpm build` before packaging | `windows-installer`: the collected Squirrel.Windows setup, `RELEASES`, `.nupkg` files, and checksum manifest. |
| `test-world` — Generate and render a test world | `ubuntu-24.04` | Install and build the workspace, then run the world generator and the downloaded Java renderer | `test-world`: seeded world ZIP plus checksum; `rendered-map`: rendered web map and provenance JSON. |
| `release` — Publish release | `ubuntu-24.04` | Download the installer, seven jars, and test-world artifacts, then verify their manifests | A single GitHub release containing the validated installer, BlueMap jar bundle, test-world/update extras, checksums, and any bounded split parts. |

## `check`: workspace build

- **Runtime and tools:** Ubuntu 24.04 hosted runner; `pnpm/action-setup@f40ffcd` (v4)
  reads `design/package.json`, which pins `pnpm@10.33.0`; `actions/setup-node@49933ea`
  (v4) installs Node 22 and enables pnpm caching; `actions/checkout@11d5960a`
  (v4) checks out the repository with the required BlueMap submodule at depth 1.
- **Java, Gradle, and Squirrel:** None are invoked by this job.
- **Cache/bootstrap route:** Checkout bootstraps the source and submodule; pnpm setup
  installs the manifest-pinned pnpm version; setup-node supplies Node 22 and restores
  the cache keyed by `design/pnpm-lock.yaml`; `pnpm install --frozen-lockfile` restores
  the locked workspace dependencies.
- **First real work:** `pnpm install --frozen-lockfile`, followed by `pnpm build`.
- **Safe outputs:** No `upload-artifact` step exists. Build directories remain local to
  the job and are not treated as release evidence.

## `jars`: seven BlueMap jar artifacts

The caller's `jars` job uses the local reusable workflow; the actual dependency inventory
is therefore the `build` job in `.github/workflows/build-jars.yml`.

- **Runtime and tools:** Ubuntu 24.04 hosted runner; recursive checkout with full history
  (`fetch-depth: 0`) for vendored version tags and nested submodules; Temurin JDK 8 and
  Temurin JDK 25 through `actions/setup-java@cf277c6` (v4); Gradle wrapper through
  `gradle/actions/setup-gradle@0b6dd65` (v4) with wrapper validation; Node 22 through
  `actions/setup-node@49933ea` (v4) for the staging and description scripts.
- **Java, Gradle, and Squirrel:** Java 8 is supplied for ForgeGradle tooling; Java 25
  is the project compiler/runtime; the checked-in `vendor/BlueMap/gradlew` wrapper runs
  Gradle. Squirrel.Windows is not used by this job.
- **Cache/bootstrap route:** The two setup-java steps install both required JDKs before
  Gradle starts. `setup-gradle` restores and writes the Gradle user-home dependency,
  wrapper, and build caches, and validates wrapper binaries. The Gradle wrapper obtains
  the declared Gradle distribution when it is not cached. Node setup is only for the
  dependency-free staging and description scripts.
- **First real work:** Resolve and validate the upstream BlueMap tag and commit; the
  artifact-producing step is `./gradlew --build-cache --stacktrace` with
  `-Dorg.gradle.java.installations.fromEnv=JAVA_HOME_8_X64,JAVA_HOME_25_X64` and these
  seven tasks: `:cli:shadowJar`, `:fabric:shadowJar`, `:forge:shadowJar`,
  `:neoforge:shadowJar`, `:paper:shadowJar`, `:spigot:shadowJar`, and
  `:sponge:shadowJar`.
- **Safe outputs:** `tools/build-jars.mjs` stages the seven jars; `tools/describe-jars.mjs`
  validates and names them, then writes `bluemap-jars.md`, `bluemap-jars.json`, and
  `bluemap-jars.sha256.txt`. Each jar is uploaded under its own `bluemap-jar-*` name;
  the index files are uploaded as `bluemap-jar-index`.

## `package`: Windows Squirrel installer

- **Runtime and tools:** Windows 2022 hosted runner; checkout without write credentials;
  `pnpm/action-setup@f40ffcd` (v4) reads `design/package.json` and installs pnpm 10.33.0;
  `actions/setup-node@49933ea` (v4) installs Node 22 and caches from
  `design/pnpm-lock.yaml`; PowerShell runs the staging, version, collection, and
  Authenticode/resource checks; `actions/download-artifact@d3f86a1` (v4) supplies the
  same-run CLI jar and jar index.
- **Java and Gradle:** None are invoked here. The CLI jar is an input produced by
  `jars`; this job does not rebuild it.
- **Squirrel and packaging tools:** `pnpm run make` invokes the app manifest's
  `electron-builder --win --config electron-builder.config.cjs --publish never`.
  The configuration selects the x64 `squirrel` target and its Squirrel.Windows settings;
  the checked-in `electron-builder` package supplies the packager. The workflow's
  `collect-squirrel-release.mjs` script discovers the generated Squirrel set, and
  PowerShell `Get-FileHash` plus `Get-AuthenticodeSignature` verifies its integrity and
  unsigned status. No signing tool or signing credential is installed.
- **Cache/bootstrap route:** pnpm setup reads the pinned workspace package manager;
  setup-node restores the pnpm cache; frozen-lockfile installation restores all Node
  dependencies, including the app's electron-builder/Squirrel packaging toolchain.
  The CLI jar and its same-run SHA-256 index arrive only through artifact download.
- **First real work:** Frozen dependency installation and `pnpm build`; then the CLI jar
  is staged, the monotonic version is written, and the Squirrel package is built.
- **Safe outputs:** `installer-out/` is uploaded as `windows-installer` only after the
  collector and unsigned branded-executable checks pass. It contains the setup
  executable, `RELEASES`, full package, delta packages where emitted, and the checksum
  manifest generated by the collector.

## `test-world`: generated and rendered test-world artifact

- **Runtime and tools:** Ubuntu 24.04 hosted runner; `pnpm/action-setup@f40ffcd` (v4)
  reads `design/package.json`; `actions/setup-node@49933ea` (v4) provides Node 22 and
  pnpm caching keyed by `design/pnpm-lock.yaml`; `actions/setup-java@cf277c6` (v4)
  provides Temurin Java 25; `actions/download-artifact@d3f86a1` (v4) downloads
  `bluemap-jar-cli` from `jars`.
- **Java, Gradle, and Squirrel:** Java 25 runs the already-built CLI jar. Gradle and
  Squirrel.Windows are not invoked by this job.
- **Cache/bootstrap route:** pnpm setup and setup-node restore the locked Node workspace;
  frozen-lockfile installation restores the generator and renderer packages; setup-java
  supplies the Java runtime; the CLI jar is accepted only from the same workflow's
  artifact store.
- **First real work:** `pnpm install --frozen-lockfile` and `pnpm build` in `design`.
  The job then runs `design/packages/worldgen/dist/cli.js` to create a 1000x1000 seeded
  world and invokes `java -jar` twice to create and render the map. Shell utilities used
  by the workflow include `find`, `sed`, `mv`, `zip`, `sha256sum`, `du`, and `ls`.
- **Safe outputs:** `test-world-seed-<seed>.zip` and `test-world.sha256.txt` are uploaded
  as `test-world`; rendered `render-out/web` and `render-out/provenance.json` are uploaded
  as `rendered-map`. The provenance records the seed, world size, renderer source, commit,
  and run identifier.

## `release`: publication

- **Runtime and tools:** Ubuntu 24.04 hosted runner; full-history checkout for the committed
  line counter; `pnpm/action-setup@f40ffcd` (v4) reads the workspace package manager;
  `actions/setup-node@49933ea` (v4) provides Node 22 and pnpm cache; download-artifact
  retrieves the installer, all seven jars, their index, and the test-world bundle.
  The job invokes Bash, `node`, `jq`, `gh`, `sha256sum`, `zip`, and the repository scripts
  for release-version resolution, asset-manifest validation, part splitting, dim-sum
  metadata, line counting, and release-note generation.
- **Java, Gradle, and Squirrel:** None are invoked here. The Windows Squirrel set and
  BlueMap jars are consumed as artifacts from the producing jobs.
- **Cache/bootstrap route:** Node and pnpm setup restore the workspace cache; a separate
  `pnpm install --frozen-lockfile --ignore-scripts` restores only what the archive-splitter
  build needs, then `pnpm --filter @worldlens/parts run build` builds that splitter.
  The `GH_TOKEN` input is resolved from `RELEASE_TOKEN`, then `ORG_TOKEN`, then
  `GITHUB_TOKEN`; it is passed to `gh` without being printed.
- **First real work:** Download the same-run artifact sets, verify the seven jar count and
  checksums, and verify installer/test-world provenance checksums. Publication then resolves
  a unique version/tag, composes release archives and notes, creates the draft release, and
  verifies and publishes its exact asset inventory.
- **Safe outputs:** A validated non-draft release is the only external publication. Its
  assets are the Windows installer/update files, BlueMap jar archive and checksum data,
  generated test-world/update extras, and split parts plus manifests when a file exceeds
  the release asset limit. Temporary JSON, staging folders, and downloaded artifacts stay
  within the job workspace and are not published separately.

## Explicitly absent workflow jobs

Tests, lint, typecheck, static analysis, accessibility checks, and screenshot/capture checks
are not workflow jobs in the current CI graph. They are not dependencies of `release` and do
not appear as hidden artifact-producing jobs. The release graph is limited to `package`,
`jars`, and `test-world` inputs plus the `release` publication job; `check` builds the
workspace but uploads no release artifact.
