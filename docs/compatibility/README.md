# Public Windows 1.0 compatibility contract

This is the public compatibility boundary for the Worldlens 1.0 desktop release. It is
Windows-only: the contract covers the installed Windows application, its local data, the
documented CLI/server surfaces, and the release/update artifacts described here. It does not
turn an implementation detail, an undocumented flag, or a package that happens to build on
another operating system into a support promise.

## Version identity and SemVer

Worldlens uses one semantic version for the package, Electron's `app.getVersion()`, the
Squirrel.Windows metadata, the update feed, and the GitHub release tag. The 1.0 release line is
`1.0.<run>` and its tag is `v1.0.<run>`. The numeric run component is a positive decimal integer;
pre-release and build suffixes are not used for the public 1.0 line. The resolver rejects a base
version that is not `major.minor.0`, rejects a zero or non-numeric run number, and refuses values
outside JavaScript's exact integer range.

The version is not the user-editable display name. The machine identity remains `Worldlens`,
`dev.worldlens.desktop`, `Worldlens.exe`, the `Worldlens` data directory, and
`worldlens.project.json`; changing the display name must not move data, change package identity,
or create a second update channel.

## What is stable in 1.0

| Surface | 1.0 promise |
| --- | --- |
| Documented CLI flags and exit meanings | Stable for the names and semantics in [the API reference](./api-reference.md). Undocumented flags and output are internal. |
| Project, configuration, appearance, history, and backup records | Versioned records. Readers must validate the schema and migrate or refuse; writers emit only the current Worldlens identifiers. |
| Map HTTP and live-data routes | Stable only for the documented routes and methods. Private loopback, proxy-internal, and implementation routes are internal. |
| Export formats | Stable once named with a format and schema version. Omitted fields and lossy conversions must be stated. |
| Update feed and rollback receipt | Stable for the exact-version feed metadata, hash check, staged-update states, and receipt outcomes. |
| Workflow inputs, outputs, and artifact names | Stable only when listed in the workflow-facing reference; other workflow details may change. |
| Accessible command names and keyboard routes | Stable for documented commands, roles, and state meanings; localized prose may vary. |
| JavaScript package entrypoints | Stable only for explicitly exported entrypoints. A source file or transitive symbol is not public API. |

Experimental means a surface may change between builds and must not be used as an integration
boundary. Internal means it exists for Worldlens itself. Deprecated means it still works during a
published migration window and has a documented replacement and removal condition. A surface is
not deprecated merely because it is old: its deprecation must be recorded in the changelog and
the migration guide.

## Supported platform and upstream versions

- **Operating system:** the shipped 1.0 desktop installer targets Windows.
- **Architecture:** the installer target is Windows `x64`; no Windows ARM64 or 32-bit installer
  is promised by this contract.
- **Minecraft worlds:** the renderer accepts Minecraft `1.12.2` through `26.x`. The 1.12.2
  decoder and legacy block-state extensions come from upstream BlueMap tag
  `v0.10.3-mc1.12`; current upstream BlueMap supplies the 1.13-and-newer path. A future or
  malformed world outside those declared ranges is an unsupported input, not an automatic
  compatibility claim.
- **BlueMap:** local rendering uses the upstream BlueMap Java renderer built from the vendored
  source. The six server adapters and CLI jars are separate release assets. Their exact supported
  Minecraft list is generated from the upstream implementation declarations for each release;
  this document does not guess a broader list from a jar name.
- **Java and server adapters:** the packaged Java runtime/toolchain requirements are release
  metadata, not a promise that an arbitrary system Java installation is sufficient. The desktop
  app's TypeScript API is not the Java `BlueMapAPI` artifact.

## Release channels and updates

The public channel is the Windows Squirrel.Windows channel. It publishes a setup executable,
`RELEASES`, the full `.nupkg`, and delta packages when produced. The installer and update packages
are intentionally unsigned; SmartScreen may show an unknown-publisher warning. Integrity comes
from HTTPS feed metadata, immutable release identity, and package hashes, not from a signature.

The updater checks 30 seconds after launch and then every six hours, backs off after failures up
to one day, and supports an explicit **Check for updates** action. Download and staging are
background operations. Installation happens only after the user chooses **Restart to install**;
the app does not restart itself. Unsaved configuration, project edits, or an active render keep
restart disabled.

The updater accepts one exact SemVer target. A missing or ambiguous release name is
`feed-mismatch`, not a guessed version. The old `MATERIAL_BLUEMAP_*` environment names remain
readable migration aliases; the `WORLDLENS_*` names win when both are present. See
[`docs/automatic-updates.md`](../automatic-updates.md) for the operational update contract and
[`schemas-and-migrations.md`](./schemas-and-migrations.md) for persisted records.

## Security support

Security fixes follow the same release line and are documented with the affected surface and the
first fixed version. Report product vulnerabilities through the repository's security contact;
BlueMap vulnerabilities belong to upstream BlueMap. Worldlens-specific security boundaries include
sanitizing marker/popup HTML with DOMPurify, avoiding inline handlers under a strict CSP, keeping
tokens in the operating-system credential store where applicable, validating bounded JSON and
backup pointers, and refusing arbitrary remote or filesystem access through undocumented routes.

The 1.0 promise is for supported Windows x64 releases. Unsupported operating systems,
architectures, unlisted Minecraft/BlueMap versions, modified installers, and private
implementation endpoints are outside the supported security response boundary unless a release
note explicitly widens it.

## Related records

- [Schemas and migrations](./schemas-and-migrations.md)
- [API and reference](./api-reference.md)
- [Standalone CLI resource and SQL parity](./cli-resource-sql-parity.md)
- [Three.js upgrade parity and evidence contract](./threejs-upgrade-parity.md)
- [Migration guide](./migration-guide.md)
- [Public surface matrix](./public-surface-matrix.md)
- [JavaScript and ESM add-ons — issue #71](./javascript-esm-add-ons.md)
- [Typed banner-pattern compatibility — issue #89](./banner-patterns.md)
- [Automatic updates](../automatic-updates.md)
- [Backup and restore](../backup.md)

## 廣東話

呢份係 Worldlens 1.0 Windows 桌面版嘅公開兼容承諾。版本號由 package、Electron、Squirrel、update
feed 同 release tag 共用，格式係 `1.0.<run>`；資料、schema、HTTP 路由、CLI 同 export 只可以靠呢度
列明嘅穩定邊界去依賴。支援 Windows x64，同 Minecraft 1.12.2 至 26.x；其他 OS、CPU、未列明嘅
Minecraft/BlueMap 版本，唔會因為「好似行到」就自動變成保證。更新係 unsigned Squirrel.Windows，
會驗 hash，唔會自己重開機；有未儲存設定、project 改動或者 render 進行中，Restart 會等一等，唔會
拎人哋啲功夫去祭天。Schema 改版要有 migration 或清楚拒絕，舊名只係 migration window 讀得，唔會
新寫返落去。 API、schema、rollback 同 release channel 詳情見旁邊三篇 reference 文件。
