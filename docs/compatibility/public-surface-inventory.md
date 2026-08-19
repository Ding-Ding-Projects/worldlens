# Public 1.0 compatibility surface inventory

This inventory is the parent-owned surface list for issue [#60](https://github.com/Ding-Ding-Projects/worldlens/issues/60).
It records the public names and data boundaries that a Windows-only 1.0 release must classify before
the detailed reference and migration articles are written. “Stable” means that a documented caller
may rely on the name, shape, and stated failure semantics through the 1.x line. “Experimental” means
the surface is visible or usable today but is not a 1.0 compatibility promise. “Internal” means it is
an implementation seam and may change without migration support. “Deprecated” means it remains readable
or callable for migration, but new integrations must use the replacement.

## Scope and policy

- **Product scope:** the packaged Windows desktop application and the standalone Windows CLI/server
  shipped from this repository.
- **Supported 1.0 target:** Windows x64. ARM64, macOS, Linux, browser-only deployments, and other
  operating-system combinations are outside the 1.0 promise unless a later reference entry explicitly
  names them.
- **Versioning:** product releases use semantic versions. A 1.x release preserves every Stable name
  and its documented semantics; additions are compatible, while removals, incompatible field changes,
  and changed failure meanings require a new major version.
- **Schema changes:** persisted config, project, history, backup, and export records carry a schema
  identifier/version. Readers must migrate older supported versions before use; writers emit the
  current version. A migration must be reversible through the local history or backup path where that
  record has one, and a failed migration must leave the source untouched.
- **Rollback:** application updates retain the previous runnable version and use the update journal and
  feed handoff records to recover from an interrupted or rejected install. A data migration is not
  silently rolled back by reinstalling the application; the documented history/backup restore route is
  the recovery boundary.
- **Release channels:** the Windows Squirrel.Windows feed is the Stable channel. Preview, development,
  test, and capture feeds are not 1.0 compatibility channels and must not be treated as stable input.
- **Support and security:** security fixes are maintained for the supported 1.x line while that line is
  supported. Unsupported operating systems, architectures, engines, and feed channels receive no 1.0
  compatibility or security-support promise.

## Inventory

| Public surface | Current concrete boundary | 1.0 class | Compatibility rule | Primary evidence |
|---|---|---|---|---|
| CLI command and help/version output | `@worldlens/cli`; `runCli`; `formatHelp`; `formatVersion`; `BLUEMAP_COMMAND` selects the displayed command name | Stable | Preserve documented flags, grouped short flags, `--flag=value`, help wording needed for automation, and version output shape. New flags may be additive. | [`design/packages/cli/src/cli.ts`](../../design/packages/cli/src/cli.ts), [`design/packages/cli/src/args.ts`](../../design/packages/cli/src/args.ts), [`design/packages/config/src/cli/flags.ts`](../../design/packages/config/src/cli/flags.ts) |
| CLI flags and exit codes | `-h/--help`, `-c/--config`, `-n/--mods`, `-v/--mc-version`, `-l/--log-file`, `-a/--append`, `-w/--webserver`, `-b/--verbose`, `-g/--generate-webapp`, `-s/--generate-websettings`, `-r/--render`, `-e/--fix-edges`, `-f/--force-render`, `-m/--maps`, `--markers`, `-u/--watch`, `-V/--version`; exit `0` success, `1` general failure, `2` missing resources | Stable | Automation may branch on the three exit codes. A new error condition must map to an existing documented class or wait for a major-version contract change. | [`design/packages/config/src/cli/flags.ts`](../../design/packages/config/src/cli/flags.ts), [`design/packages/cli/src/cli.ts`](../../design/packages/cli/src/cli.ts) |
| CLI resource and SQL resolution | Pack roots, `resourceExtensions.zip` layouts/digests, `storages/<id>.conf`, SQLite/MySQL/MariaDB/PostgreSQL dialects, optional-driver errors, and credential-safe diagnostics | Stable for documented behavior | Preserve high-to-low pack precedence with first-writer wins and vanilla fallback, reverse filename ordering, packaged/installed/Docker resource lookup, SHA-256 evidence, SQL field meanings, and non-zero failure behavior. Never silently drop a requested root, custom JDBC field, driver, or SQL storage. | [`docs/compatibility/cli-resource-sql-parity.md`](./cli-resource-sql-parity.md), [`design/packages/cli/src/resources.ts`](../../design/packages/cli/src/resources.ts), [`design/packages/cli/src/maps.ts`](../../design/packages/cli/src/maps.ts) |
| Config schemas | `core.conf`, `webapp.conf`, `webserver.conf`, `plugin.conf`, `maps/<name>.conf`, and `storages/<name>.conf`; seven descriptors in `CONFIG_DESCRIPTORS` | Stable, versioned | Keep descriptor IDs and field semantics stable. Unknown fields remain subject to the parser’s documented handling; migrations must be explicit and preserve comments/values where supported. | [`design/packages/config/src/schema/index.ts`](../../design/packages/config/src/schema/index.ts), [`docs/config-history.md`](../config-history.md) |
| Project schema | `worldlens.project.json`, schema ID `worldlens.project`, plus `.worldlens-world.json` and `.worldlens-map.json` markers | Stable, versioned | Preserve the project filename, schema ID, marker meaning, and migration path. Do not infer identity from a user-renamed display name. | [`design/packages/shared/src/productIdentity.ts`](../../design/packages/shared/src/productIdentity.ts), [`docs/project-editor.md`](../project-editor.md) |
| Local history | Per-config, project, profile, and app-settings Git-backed history repositories under application data; history IPC names include `history:*` and `project:*` | Stable, local-only | History is append-only. Restores create new revisions; failed history writes do not discard the user’s successful save. History data is not a synchronization or public API channel. | [`docs/config-history.md`](../config-history.md), `design/packages/app/src/main/history/`, `design/packages/app/src/main/project/history.ts` |
| HTTP static map server | `GET`/`HEAD` static webapp assets and `/maps/{id}/...` map storage paths | Stable for documented routes | Preserve path shape, GET/HEAD semantics, cache/ETag behavior, and ordinary HTTP failure classes. Undocumented implementation routes are not stable. | `design/packages/server/src/http/StaticHandler.ts`, `design/packages/server/src/http/MapStorageHandler.ts` |
| HTTP render/update API | `GET`/`HEAD`/`POST /maps/{id}/update` | Stable for documented routes | Request and response fields, accepted methods, queued/running/completed/error states, and non-success statuses must be documented before external automation relies on them. | `design/packages/server/src/http/RenderUpdateHandler.ts`, `design/packages/server/src/render/RenderDriver.ts` |
| Live data and SSE | `/maps/{id}/live/players.json`, `/maps/{id}/live/markers.json`, `/maps/{id}/live/sse`; `SseConnectionManager` and `LiveDataBroadcaster` | Stable for documented routes; transport internals internal | Preserve event names, JSON shapes, keep-alive/close behavior, and the query-token authentication alternative required by browser `EventSource`. | `design/packages/server/src/http/MapStorageHandler.ts`, `design/packages/server/src/live/SseConnectionManager.ts`, `design/packages/server/src/live/LiveDataBroadcaster.ts` |
| Remote/proxy HTTP boundary | Read-only `GET`/`HEAD` proxying of configured remote map paths, including `live/sse` | Experimental | The proxy is a product integration boundary, not a promise that arbitrary remote servers or future BlueMap endpoints remain compatible. Only explicitly documented paths and authentication behavior become Stable. | `design/packages/server/src/remote/RemoteProxy.ts`, [`docs/remote-hosting.md`](../remote-hosting.md), [`docs/remote-render.md`](../remote-render.md) |
| JavaScript/UI and add-on API | Package exports such as `@worldlens/server`, `@worldlens/config`, `@worldlens/shared`, and viewer/UI bridge globals | Internal unless named | Package-private exports, preload channels, Vue component props, and bridge implementation names may change. An add-on promise exists only for an entrypoint and types listed in the 1.0 API reference. | `design/packages/*/src/index.ts`, [`design/README.md`](../../design/README.md) |
| Workflow inputs | `.github/workflows/render-world.yml`, `render-private-world.yml`, `chunk-world.yml`, `render-shard-wave.yml`, and `scheduled-render.yml`; named inputs include world, release asset, output format, shard and acceptance controls | Stable for documented inputs | Preserve input names, defaults, accepted values, validation, and refusal behavior. YAML job IDs and internal step names are Internal unless published as an input/output contract. | [`.github/workflows/`](../../.github/workflows/), [`docs/ci-repository-setup.md`](../ci-repository-setup.md), [`docs/release-workflow-security.md`](../release-workflow-security.md) |
| Workflow outputs | Release assets, chunk plans/parts, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, provenance/manifest files, and published render artifacts | Stable for documented outputs; other artifacts experimental | Stable outputs require a documented schema, digest, producer commit, and failure semantics. Temporary runner files and cache keys are Internal. | `.github/workflows/`, [`docs/backup.md`](../backup.md), [`docs/large-worlds.md`](../large-worlds.md) |
| Environment variables | Runtime/build controls including `WORLDLENS_ACCEPT_DOWNLOAD`, `WORLDLENS_UPDATE_FEED`, `WORLDLENS_UPDATE_TOKEN`, `WORLDLENS_DISABLE_UPDATES`, `WORLDLENS_SCREENSHOTS`, `WORLDLENS_SCREENSHOT_HOME`, `WORLDLENS_SCREENSHOT_STORAGE`, `BLUEMAP_COMMAND`, `BLUEMAP_GIT_HASH`, and `BLUEMAP_WEBAPP_SOURCE` | Experimental until individually referenced | Only variables listed in the 1.0 reference are public. Current `MATERIAL_BLUEMAP_*` and other legacy names remain Deprecated/readable only where migration code documents them; secrets never become a public variable contract. | `design/packages/app/src/main/update/feed.ts`, `design/packages/app/src/main/consent.ts`, `design/packages/cli/src/args.ts`, `design/packages/cli/src/webapp.ts`, [`design/packages/site/src/content/articles/worldlens-migration.ts`](../../design/packages/site/src/content/articles/worldlens-migration.ts) |
| Windows file layout and identity | Application ID `dev.worldlens.desktop`; Windows application data rooted under `%APPDATA%\Worldlens`; stable project markers and `worldlens.project.json`; update handoff `.worldlens-update-feed-handoff.json`; install journal `.worldlens-update-install.json` | Stable, versioned | Preserve Windows paths, identity, marker filenames, and migration from the legacy Material BlueMap data directory. Display-name changes must not move data or package identity. | `design/packages/shared/src/productIdentity.ts`, `design/packages/app/src/main/index.ts`, [`docs/automatic-updates.md`](../automatic-updates.md) |
| Update feed and installer outputs | Windows Squirrel.Windows feed, `Setup.exe`, `RELEASES`, `.nupkg`, feed metadata, update journal, ready/restart/later states | Stable for Stable channel | Preserve feed identity, version selection, unsigned-artifact disclosure, interrupted-download/install recovery, and user-controlled restart. Preview/test feeds are Experimental. | [`docs/automatic-updates.md`](../automatic-updates.md), `design/packages/app/src/main/update/`, `design/packages/app/electron-builder.config.cjs` |
| Backup pointers and restore manifests | Release-asset backup archive parts, per-part SHA-256, whole-file digest, pointer/sidecar metadata, resumable restore | Stable, versioned | Preserve pointer schema, part ordering, digest semantics, atomic restore, and refusal of incomplete/unverified uploads. A backup is a recovery artifact, not a live sync protocol. | [`docs/backup.md`](../backup.md), `design/packages/app/src/main/backup/`, `design/packages/parts/` |
| Exported formats | Config/history/appearance and site exports; current docs name Markdown, JSON, CSV, and related text forms where each surface supports them | Stable per named format | Each named format must declare encoding, schema/version, omitted fields, and re-import behavior. Unlisted formats are Experimental; secrets and private vocabulary data are never silently serialized. | [`docs/config-history.md`](../config-history.md), [`docs/appearance-editors.md`](../appearance-editors.md), `design/packages/site/src/settings/exportFormats.ts` |
| Accessibility-visible commands | Command palette `Ctrl+Shift+F`, keyboard context-menu paths such as `Shift+F10`/Menu key, tab and appearance commands, and accessible names exposed by the app/site | Stable for documented commands | Preserve shortcut meaning, command labels, focus return, and the target element/page. Internal DOM selectors, CSS classes, and component names are not public compatibility surfaces. | [`docs/command-palette.md`](../command-palette.md), [`docs/appearance-editors.md`](../appearance-editors.md), `design/packages/ui/src/` |

## Deferred or explicitly non-promised surfaces

- Non-Windows installers, operating-system data layouts, architectures, and deployment targets are
  outside the Windows-only 1.0 contract.
- **Linux desktop packaging and support (issue [#81](https://github.com/Ding-Ding-Projects/worldlens/issues/81)) are explicitly deferred and unverified.** The current release records contain no Linux package, fresh-environment install/uninstall/update run, Linux credential-store integration proof, display-server proof, or headless-capture proof. Platform-neutral TypeScript execution and Node-level checks must not be interpreted as Linux desktop support. Until a separately scoped Linux workstream supplies the issue's distribution, architecture, display-server, package, updater, credential-store, filesystem, external-editor, Docker/SSH, and runtime evidence, the public 1.0 promise remains Windows x64 only.
- Undocumented JavaScript exports, preload/IPC channel names, private HTTP routes, workflow job/step
  IDs, cache keys, temporary files, DOM selectors, and CSS classes remain Internal.
- Add-on compatibility is not implied by the existence of TypeScript package exports. It becomes a
  Stable promise only after the 1.0 API reference names the entrypoint, versioned types, supported
  host, and failure modes.
- A current feature row or implementation can be shipped while its compatibility class remains
  Experimental; that status means “usable but not promised,” not “missing.”

## Maintenance rule

When a Stable name, field, path, command, endpoint, workflow input/output, environment variable,
export marker, or accessibility-visible command changes, update this inventory and the corresponding
reference/migration article in the same release change. A deprecated surface remains documented until
the supported migration window ends; it is not removed merely because the replacement exists.
