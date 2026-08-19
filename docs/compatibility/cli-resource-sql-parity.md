# Standalone CLI resource and SQL parity

This article is the compatibility contract for the standalone `@worldlens/cli` resource and
storage paths covered by issue #65. It describes the inputs the CLI accepts, the order in which
resources are layered, the layouts that are supported by a checkout, package, Docker image, or
installed CLI, and the failure boundaries that must remain visible to an operator.

The CLI must not report a successful render after a requested resource or storage feature was
ignored. A missing resource extension, an unavailable SQL driver, an unsupported custom JDBC
driver, an unknown SQL dialect, and a failed database connection are failures with a non-zero
exit result and a diagnostic that names the actionable cause without disclosing credentials.

## Resource-pack precedence

The resolver builds one ordered list of pack roots in high-to-low precedence. The first root that
defines a resource wins; later roots are fallbacks. This is the same direction used by the upstream
`BlueMapService#getPackRoots` path and by the engine's resource pools.

| Priority | Root | Contents and rules |
| --- | --- | --- |
| 1 (highest) | Configured packs/addons | Entries directly below `config/packs`. Directories and `.zip`/`.jar` files are accepted. Entries are sorted by filename in reverse lexical order, matching upstream's pack-folder order. Addon/nested-pack loading remains inside the normal pack loader. |
| 2 | `-n` / `--mods` | Regular `.jar` files directly below the requested mods folder, sorted in reverse lexical order. A missing folder is a configuration failure. The roots are added only when `core.conf` has `scan-for-mod-resources: true`; when it is false the CLI reports that the requested folder was intentionally not scanned. |
| 3 | BlueMap's `resourceExtensions.zip` | The bundled extension pack, or the checked-out source directory fallback described below. It supplies BlueMap's overlays, legacy compatibility assets, models, and the root-level atlas sources that are not in the vanilla client jar. |
| 4 (fallback) | Vanilla client resource/data jars | The client resource pack and data pack are the final fallback. The client jar is still consent-gated by `accept-download`; it must not replace a resource already provided by a higher-priority root. |

The order is deliberate. Configured packs and mod jars can provide project-specific resources,
BlueMap's extension pack supplies the compatibility layer, and the client jar completes only the
vanilla fallback set. A resolver or test must state both the priority order and the first-writer
winner for a duplicate key; “the file was found” is not enough evidence of precedence.

### Mod-resource scanning

`-n` and `--mods` are aliases. The path is validated before rendering, and only regular `.jar`
files in that directory are considered. The pack loader may then discover nested Fabric jars and
datapacks according to its normal rules. The CLI does not recursively walk arbitrary directories,
load non-JAR files, or treat the path as a second `config/packs` directory.

When scanning is disabled in `core.conf`, the flag is not silently ignored: the log states that
`scan-for-mod-resources=false` disabled mod-resource loading. When the flag names a missing
directory, the run exits with the general failure result rather than rendering without the
requested inputs.

## `resourceExtensions.zip`: layout and evidence

The source form is kept under:

```text
design/packages/engine/assets/resourceExtensions/
├── pack.mcmeta
├── assets/minecraft/{atlases,blockstates,models}/…
├── beds/…
├── signs/…
├── mc1_15/…
├── mc1_17/…
├── mc1_20_3/…
├── mc1_21_9/…
└── mc26_1/…
```

`pack.mcmeta` carries the format-ranged overlays. The extension pack is not interchangeable with
the vanilla client jar: the vanilla jar does not contain BlueMap's extension assets, and the
extension pack's atlas sources cover texture namespaces that otherwise remain absent. The pack
version must be read from a real `version.json` supplied by a resolved root; the resolver must not
guess a hard-coded version or infer it from an unrelated `pack.mcmeta` field.

The CLI searches for a packaged zip before accepting a directory carried by the engine package or
a checkout source directory. Candidate zip layouts are derived from the current working directory,
the configured data directory, and the compiled module directory, walking their ancestors for:

```text
resourceExtensions.zip
resources/resourceExtensions.zip
resources/de/bluecolored/bluemap/resourceExtensions.zip
vendor/BlueMap/core/build/resources/main/de/bluecolored/bluemap/resourceExtensions.zip
```

When the runtime exposes `process.resourcesPath`, it additionally checks:

```text
<resourcesPath>/resourceExtensions.zip
<resourcesPath>/resources/resourceExtensions.zip
<resourcesPath>/app.asar.unpacked/resourceExtensions.zip
```

The installed and Docker layouts produced by `pnpm deploy --prod --legacy` carry the tracked
directory directly inside the engine package rather than manufacturing a zip. The resolver checks
these paths explicitly before the checkout fallbacks:

```text
<cli-package-root>/node_modules/@worldlens/engine/assets/resourceExtensions/
<workspace>/packages/engine/assets/resourceExtensions/
```

In the Docker image the first path is `/app/node_modules/@worldlens/engine/assets/resourceExtensions/`.
The final image build asserts `pack.mcmeta`, the `assets/` directory, all three SQL adapter imports,
and a real sql.js WASM-backed query from the deployed tree.

The configured data directory is also checked at `data/resourceExtensions.zip` (the actual
resolved `core.conf` data path, not a guessed repository-relative path). If no zip is present, the
vendored checkout source directory `vendor/BlueMap/core/src/main/resourceExtensions` is accepted
as a development-only fallback. This fallback is valid only when the process is demonstrably
running from a source checkout. The engine-package directory is the installed/Docker asset;
packaged, installed, and Docker runs must fail with a missing-resource error rather than searching
a source checkout or silently substituting another directory.

Every selected zip is hashed with SHA-256 over its exact bytes. A source-directory fallback is
hashed deterministically by walking sorted relative paths and hashing each relative path followed
by its file bytes; it is not silently archived or reported as an equivalent zip. The log records
the selected path, the kind (`zip` or checkout source), and the full lowercase digest. A missing
extension pack reports every supported layout class in its error and returns the missing-resource
exit result; it does not proceed with a partial resource set.

The evidence record for a packaged build should retain:

| Fact | Required value |
| --- | --- |
| Selected location | The exact absolute path used by the running CLI. |
| Kind | `zip` for a packaged zip, `engine-package-assets` for the installed/Docker engine directory, or `checkout-source` only for an explicit development fallback. |
| SHA-256 | The digest computed from the bytes or deterministic source-directory walk used by that run. |
| Source commit | The commit that built the CLI and its asset bundle. |
| Layout proof | A listing or manifest showing `pack.mcmeta`, the base `assets/` tree, and each overlay directory. |

This evidence proves what the process consumed. A manifest that names a file without a runtime log
or a packaged-artifact inspection is not proof that the CLI could find or load it.

## SQL storage configuration

SQL storage lives in `storages/<id>.conf` and is selected by `storage-type: bluemap:sql` (the
short `storage-type: sql` spelling is accepted by the config key parser). The generated example
contains the following fields:

| Field | Meaning |
| --- | --- |
| `connection-url` | A JDBC-shaped URL. Supported protocol prefixes are `jdbc:sqlite:`, `jdbc:mysql:`, `jdbc:mariadb:`, and `jdbc:postgresql:`. |
| `connection-properties` | Driver properties such as `user` and `password`. These values override credentials embedded in a URL where the driver adapter supports both forms. |
| `dialect` | Optional explicit `bluemap:sqlite`, `bluemap:mysql`, `bluemap:mariadb`, or `bluemap:postgresql`. When omitted, the protocol prefix selects the dialect; an unknown prefix is a configuration failure. |
| `driver-jar` / `driver-class` | Upstream JDBC extension fields. The TypeScript CLI cannot load an arbitrary JVM classpath jar, so either field is rejected by name rather than silently ignored. |
| `max-connections` | A positive pool limit. A non-positive value uses the adapter's bounded default. SQLite is an in-process single database and serializes overlapping transactions. |
| `compression` | The tile compression key, using the same registry as file storage. Unknown keys are rejected. |

Examples:

```hocon
# SQLite file, or jdbc:sqlite::memory: for a disposable process-local database.
storage-type: sql
connection-url: "jdbc:sqlite:data/maps.sqlite"
dialect: sqlite
compression: gzip
```

```hocon
# MySQL and MariaDB use the mysql2 adapter; connection-properties override URL credentials.
storage-type: bluemap:sql
connection-url: "jdbc:mariadb://db.example.test:3306/bluemap"
connection-properties: {
  user: "bluemap"
  password: "provided-out-of-band"
}
dialect: mariadb
max-connections: 10
```

```hocon
storage-type: bluemap:sql
connection-url: "jdbc:postgresql://db.example.test:5432/bluemap"
connection-properties: {
  user: "bluemap"
  password: "provided-out-of-band"
}
dialect: postgresql
```

The CLI creates a real storage from this configuration; it does not downgrade an SQL map to file
storage. The map's `storage` id must resolve to the matching `storages/<id>.conf` entry, and the
SQL storage is initialized before map rendering or serving. A project file may not carry a
`connection-properties` block because projects travel with world data; keep credentials in the
private config directory instead.

### Optional drivers and failure semantics

The JavaScript adapters are optional runtime packages: `sql.js` for SQLite, `mysql2` for MySQL and
MariaDB, and `pg` for PostgreSQL. They are loaded only when the selected dialect needs them. A
missing package produces a `MissingSqlDriverError` naming the dialect and package, with recovery
guidance, rather than a raw module-resolution stack trace. The CLI returns a non-zero general
failure result and never continues with file storage.

Other failures have the same fail-closed rule:

| Condition | Result |
| --- | --- |
| Unknown dialect or malformed SQL config | General failure; name the config field and accepted dialects. |
| `driver-jar` or `driver-class` set | General failure; explain that arbitrary JDBC jars are unsupported in this runtime. |
| Optional package absent | General failure; name only the missing package and installation route. |
| Database unavailable, authentication refused, or schema operation fails | General failure; preserve the actual driver error class/code while redacting credentials. |
| Resource extension or client resources absent | Missing-resource result; do not render a partial pack. |

Diagnostics may include a storage id, dialect, host, port, database name, driver package, and
error code when those facts are useful. They must never include a password, a secret connection
property, a raw URL containing userinfo, a complete query string with credentials, or a raw driver
stack that embeds one. Redaction happens before the message reaches stdout, stderr, a log file,
the HTTP response, or a persisted report.

## Runtime layouts

The same resolver and evidence shape applies in each supported runtime:

| Runtime | Required layout and behavior |
| --- | --- |
| Checkout | The CLI may use the checked-out `resourceExtensions` source directory when no generated zip exists, but logs the `checkout-source` kind and digest as a warning. A built zip is preferred whenever present. This fallback is explicitly development-only. |
| Packaged/installed | The deployed package carries `resourceExtensions` under `@worldlens/engine/assets/resourceExtensions`. The resolver checks that engine-package directory and any packaged zip/resource roots; a missing packaged asset is a packaging failure, not a prompt to download an untracked replacement or use a source-tree fallback. |
| Docker | The image carries `/app/node_modules/@worldlens/engine/assets/resourceExtensions/` alongside the deployed CLI. Configuration and world folders remain operator-mounted (`/data/config` and the configured world path). SQL credentials stay in the mounted/private configuration boundary and are never baked into an image or emitted by `docker logs`. A missing asset fails the image/runtime contract. |
| Installed command | The `bluemap-cli` entrypoint resolves the engine-package asset directory (or an installed zip/resource root), records the digest, and uses the same SQL config and exit meanings as the checkout and Docker paths. |

The Docker image remains non-root. A read-only world mount is supported, while the configured SQL
database and rendered output must remain writable by the runtime user. Relative `world`, `data`,
and `web` paths resolve against the process working directory; use absolute paths in a container
when the mount location matters.

## Phase E status and verification boundary

Phase E already contains the worker pool, render-task hierarchy, watch-driven re-render, HTTP/SSE
routes, standalone CLI branching, and Docker packaging baseline. Issue #65 closes the remaining
CLI parity contract: `-n` resource scanning, the BlueMap-owned extension pack, and SQL storages
from CLI config. The phase is not complete merely because the TypeScript engine or SQL package has
unit coverage; the acceptance evidence must exercise the standalone process and the runtime
layouts above.

The issue's evidence matrix is:

- real filesystem pack and precedence cases, including a duplicate resource key;
- real `resourceExtensions` discovery and digest logging in checkout, engine-package, Docker, and
  installed layouts (zip discovery remains covered where a zip is supplied);
- SQLite round trips and real MySQL, MariaDB, and PostgreSQL server runs;
- CLI subprocess exit-code and credential-redaction cases;
- Docker smoke with a mounted world and storage;
- configuration generation, hand editing, reload, and map-storage round trips; and
- rendered tiles plus metadata read back through each supported storage route.

Until those records are attached to the implementation commit, this document is the contract and
the open proof list, not a claim that every acceptance item has already been verified. Tests,
captures, and release evidence belong to the implementation/release lane; this documentation lane
does not manufacture them.

## Security and recovery notes

- Do not fetch arbitrary packs, drivers, or database clients from URLs in a configuration file.
  Resource packs and optional packages must come from the declared local/package routes.
- Treat `.jar` packs as untrusted input: the loader must bound and report malformed archives and
  never execute code from a pack while reading its resources.
- Keep SQL credentials in the private config boundary. Project export, issue records, logs,
  diagnostics, and ordinary CLI output omit secret values and source paths that would identify
  them.
- A failed resource or storage operation leaves the existing file/SQL data untouched. Temporary
  archives, partial generated output, and failed database initialization must not be presented as
  a successful render.
- Recovery is explicit: fix the named path/config/optional package, rerun the same CLI command,
  and inspect the new path plus digest line. Do not “recover” by silently falling back to file
  storage or by removing a requested resource root.

## Related records

- [Public API and CLI reference](./api-reference.md)
- [Public compatibility contract](./README.md)
- [Phase E and Phase H roadmap](../../design/ROADMAP.md)
- [Current handoff](../../design/HANDOFF.md)
- [SQL storage glossary entry](../glossary.md#sql-storage-jdbc)

## 廣東話

呢篇係 standalone `@worldlens/cli` 嘅資源同 SQL storage 合約。Pack root 由高優先至 fallback
係 `config/packs`、`-n/--mods`、BlueMap 自己嘅 `resourceExtensions.zip`、最後 vanilla client
jar；前面嗰個先寫入就贏，後面嗰啲只係 fallback，所以唔可以淨係話「搵到個檔」就算。
`resourceExtensions` 要講清楚
係 checkout source 定係 packaged zip，連埋實際 path、SHA-256 同 source commit；搵唔到就非零
退出，唔可以扮用緊半套資源。

SQL storage 用 `storages/<id>.conf`，SQLite、MySQL、MariaDB、PostgreSQL 各自有明確 protocol。
`sql.js`、`mysql2`、`pg` 係按需載入；冇 driver、未知 dialect、custom JDBC jar，或者 database
連唔到，都要講真原因兼非零退出。`connection-properties` 係 credentials 位置，但密碼永遠唔
可以入 log、project、export、HTTP response；成件事唔可以靜雞雞跌返做 file storage。
