# BlueMap server-adapter smoke evidence

Issue #83 tracks the missing runtime acceptance proof for the six BlueMap server
adapters. This record is deliberately conservative: a jar that was compiled,
described, hashed, and attached to a release is not thereby proven to load in a
real server.

## Pinned source and release evidence

The adapter source is upstream BlueMap, vendored at `vendor/BlueMap` revision
`4c4cbc291b361ceff6ee239448e9f988f9019dbb` (`v5.23`). The latest release record
that lists the adapters is [Worldlens v1.0.1233](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1233),
whose notes identify that same source revision and Java 25 class-file output.
Its `bluemap-jars.sha256.txt` asset contains the seven published jar digests.

The release artifact is therefore traceable to a source revision and a hash. No
row below has yet been promoted to runtime-smoke-verified.

## Supported matrix from the pinned upstream build files

| Adapter | Published artifact | Installation surface | Supported Minecraft versions | Exact loader/API inputs in the pinned source |
| --- | --- | --- | --- | --- |
| Fabric | `bluemap-5.23-fabric.jar` | Fabric server `mods/` | 26.1, 26.1.1, 26.1.2, 26.2 | Fabric Loader `0.18.4`; Fabric API `0.144.0+26.1` |
| Forge | `bluemap-5.23-forge.jar` | Minecraft Forge server `mods/` | 26.1, 26.1.1, 26.1.2, 26.2 | Forge `62.0.1` for the build-selected Minecraft `26.1`; eventbus-validator `7.0.1` is a build-time annotation processor |
| NeoForge | `bluemap-5.23-neoforge.jar` | NeoForge server `mods/` | 26.1, 26.1.1, 26.1.2, 26.2 | NeoForge `26.1.0.0-alpha.15+pre-3` for the build-selected Minecraft `26.1` |
| Paper | `bluemap-5.23-paper.jar` | Paper, Purpur, or Folia server `plugins/` | 26.1.1, 26.1.2, 26.2 | Paper API `26.1.1.build.29-alpha`; plugin API version `26.1.1`; Folia is declared supported |
| Spigot | `bluemap-5.23-spigot.jar` | Spigot, Bukkit, or CraftBukkit server `plugins/` | 26.1, 26.1.1, 26.1.2, 26.2 | Spigot API `1.16.5-R0.1-SNAPSHOT`; plugin API version `1.16`; on Paper, use the Paper jar instead |
| Sponge | `bluemap-5.23-sponge.jar` | Sponge server `plugins/` | 26.1, 26.1.1, 26.1.2, 26.2 | Sponge API `17.0.0`; Sponge Java-plain loader `1.0` |

The matrix is extracted from the implementation `build.gradle.kts` files at the
pinned revision, not inferred from artifact names. The loader/API values are build
inputs; they are not evidence that a server accepted the plugin.

## Existing build and harness boundary

The repository has packaging utilities and a plan-first adapter smoke harness
contract, but no executed runtime evidence:

- `tools/build-jars.mjs` runs the upstream Gradle tasks and fails if one of the
  seven requested shadow jars is absent.
- `tools/describe-jars.mjs` validates jar structure, manifest/class-file version,
  common version, CLI `Main-Class`, names, and SHA-256 output.
- `.github/workflows/build-jars.yml` builds and uploads one artifact per
  implementation on Java 25. It does not boot Fabric, Forge, NeoForge, Paper,
  Spigot, or Sponge.
- `tools/server-adapter-smoke/smoke.mjs` is plan-only by default and refuses
  execution until an operator supplies local fixtures, a reviewed licence-consent
  file, exact version matrices, and a local artifact index plus jar bytes. Its
  checked-in `contract.json` still has a placeholder source SHA and empty version
  arrays, and `run-config.example.json` is a template rather than a runnable
  fixture. The contract enumerates the required startup, discovery, config,
  render/update, endpoint, shutdown/restart, and negative cases, but no `--execute`
  report exists.

Consequently, the existing tooling proves packaging and release traceability, while
the smoke harness proves only that an operator-supplied run would be bounded to local
fixtures and exact bytes. It does not prove plugin discovery, startup, configuration
generation, a live render/update, HTTP endpoints, clean shutdown, restart persistence,
or the required negative cases until an executed report is produced.

## Issue-83 evidence status

| Acceptance area | Status in this records update |
| --- | --- |
| Exact supported server/game/loader matrix | **Recorded** from pinned source files |
| Published jar identity and release hash record | **Recorded** from v1.0.1233 notes/assets |
| Isolated real-server boot for all six adapters | **Not run** |
| Discovery/startup/config generation | **Not run** |
| Real render/update and HTTP/live endpoints | **Not run** |
| Clean shutdown and restart persistence | **Not run** |
| Missing/incompatible dependency, wrong version, port conflict, corrupt config, permission failure | **Not run** |
| Hash/source-SHA comparison against jars actually loaded by a server | **Not run** |
| Logs, durations, resource measurements, and platform limitations from real servers | **Not available** |
| Repeatable smoke environments | **Not implemented or evidenced** |
| Tests | **Not run in this documentation-only update** |
| Captures | **Not taken in this documentation-only update** |

Issue #83 remains open. A future runtime lane must use the exact published jar
bytes, record the release URL, asset SHA-256, source SHA, server/game/loader
versions, startup and readiness logs, timing/resources, endpoint/render results,
restart receipt, and each negative-case outcome. It must not publish private server
addresses, credentials, world paths, or unrelated workload details.

## Suggested next evidence run

Build one isolated disposable environment per loader family, copy in the exact
release asset selected by hash, install only the declared server dependencies, and
accept any required upstream licence through an explicit, recorded step. For each
environment, collect discovery/startup, generated config, one real render/update,
HTTP/live endpoint, clean shutdown, restart persistence, and the five negative
fixtures. Keep the environments and logs disposable, and retain only redacted
receipts plus the exact version/hash/source tuple needed to reproduce the result.

Related release and build records: [tools/README.md](../tools/README.md),
[Worldlens v1.0.1233](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.0.1233),
and [issue #83](https://github.com/Ding-Ding-Projects/worldlens/issues/83).
