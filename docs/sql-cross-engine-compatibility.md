# SQL storage cross-engine compatibility

This article records the acceptance contract and the current evidence for issue [#66](https://github.com/Ding-Ding-Projects/worldlens/issues/66): proving that the upstream Java engine and the TypeScript port can exchange SQL-backed map storage for the PostgreSQL and SQLite dialects. The MariaDB proof is the reference shape; this article does not call either new dialect proven until the real two-direction runs produce a retained report.

## Behaviour

The proof has two independent directions for each dialect:

1. **Java writes, TypeScript reads.** The unmodified upstream CLI renders the standard oracle world directly into the SQL database or SQLite file. The TypeScript `SQLStorage` then reads that same store and compares the result with an independently rendered Java file-storage control.
2. **TypeScript writes, Java reads.** The TypeScript engine renders the same oracle world into a second isolated SQL database or SQLite file. The upstream CLI is started in webserver-only mode, with no world loaded, and serves the store through its production raw-storage route. The harness fetches every result over HTTP and compares it with the bytes the TypeScript engine wrote.

The comparison inventory is deliberately explicit:

- every hires tile;
- every low-resolution tile in LOD 1, 2, and 3;
- `settings.json` and `textures.json`;
- map identifiers and storage-created grid cells;
- `tileState`, `chunkState`, and `regionState`, including every deterministic field; and
- the page-boundary behaviours used by the storage contract: pagination, purge progress, reopen, and recreation of a deleted map row.

The comparison is not a raw byte comparison for wall-clock fields. `tileState` and `regionState` contain render/update timestamps generated at write time, so two valid runs cannot share those values. The harness must use the existing `tools/oracle/lib/renderstate.mjs` `diffRenderState` classifier (the same classifier used by the Phase D oracle): deterministic fields must match exactly; timestamp-only differences are counted separately as expected; any other difference is a divergence. A raw diff that reports timestamp-only changes as storage incompatibility is a harness defect, not evidence against a dialect.

## Configuration

### Pinned Java and JDBC inputs

The upstream source is the checked-in `vendor/BlueMap` submodule at commit `4c4cbc291b361ceff6ee239448e9f988f9019dbb` (`v5.23`). Its wrapper pins Gradle `9.4.0` in `vendor/BlueMap/gradle/wrapper/gradle-wrapper.properties`; the source build requests Java toolchain 25. The MariaDB proof already uses the following jar and is recorded here as a control:

| Dialect | JDBC coordinate | Driver class | Jar | SHA-256 | Status |
| --- | --- | --- | --- | --- | --- |
| MariaDB control | `org.mariadb.jdbc:mariadb-java-client:3.5.3` | `org.mariadb.jdbc.Driver` | `mariadb-java-client-3.5.3.jar` | `85c4ba2f221d0dfd439c26affbb294f784960763544263c65aba9c2c76858706` | Existing MariaDB proof |
| PostgreSQL | `org.postgresql:postgresql:42.7.13` | `org.postgresql.Driver` | `postgresql-42.7.13.jar` | `6e0e4cc2d8cae902084f8a2b18728b073a6fd9d1f87c9d8bff8f298c18185b93` | Pinned for issue #66; run unverified |
| SQLite | `org.xerial:sqlite-jdbc:3.53.2.1` | `org.sqlite.JDBC` | `sqlite-jdbc-3.53.2.1.jar` | `f55e405ed96d5ffe629e05b7b51b059e1c7d64527c0cc90a972fbac06730ccc1` | Pinned for issue #66; run unverified |

The two new versions and hashes were resolved from Maven Central on 2026-08-19. The jar bytes must be downloaded from Maven Central, hashed before use, and rejected if the digest differs. Do not copy the jars into the repository or commit them. The upstream dialect keys are `bluemap:postgresql` and `bluemap:sqlite`, with JDBC URL prefixes `jdbc:postgresql:` and `jdbc:sqlite:`; the driver classes above are the exact class names to pass to the Java configuration.

### Fetch and build commands

The issue-#66 implementation lane has prepared a driver manifest plus `fetch-drivers.mjs`, but those files are not yet part of the default branch in this documentation-only snapshot. After that lane is integrated, the fetcher is the canonical route: it accepts only the canonical Maven Central URL, verifies the manifest's byte count and SHA-256, writes through a temporary file, and refuses an unverified jar. The commands below are prerequisites and not evidence that issue #66 has run:

```powershell
node tools/oracle/driver-fetch/fetch-drivers.mjs
node tools/oracle/driver-fetch/fetch-drivers.mjs --check
```

Build the unmodified upstream CLI with the checked-in wrapper before either direction:

```powershell
$env:GRADLE_USER_HOME = (Resolve-Path 'tools/oracle/.gradle').Path
vendor/BlueMap/gradlew.bat :cli:shadowJar
```

The issue-#66 implementation lane has prepared `tools/oracle/sql-crosscompat-matrix.mjs`. It creates a fresh SQLite file or a throwaway `postgres:17.6` container bound to loopback, and the invocation used for the report below was:

```powershell
# PostgreSQL and SQLite — issue-#66 matrix run recorded below
node tools/oracle/sql-crosscompat-matrix.mjs --dialects sqlite,postgresql --driver-dir tools/oracle/driver-fetch/build/drivers --json docs/sql-cross-engine-compatibility.report.json
```

The harness must print these report fields before acceptance: `schemaVersion`, `startedAt`, `finishedAt`, `durationMs`, `testedSha`, Java/Gradle/Node versions, the exact resolved command, selected dialects, fixture seed and size, relative driver filenames plus coordinates and SHA-256 digests, relative database/file identifiers, per-direction counts/timings, timestamp-only counts, divergence counts, failure details, and a `cleanup` object stating whether every temporary process, database/file, configuration directory, and work directory was removed. The JSON report must use repository-relative or redacted identifiers only; it must not contain absolute paths, usernames, passwords, connection strings with credentials, host-specific home directories, or ambient environment values. Passwords and connection strings containing credentials must never appear in logs either. The current implementation's direction-2 HTTP route exposes tiles and metadata; before acceptance, it must also retain an independently checkable comparison for every deterministic render-state field required by this article, or document and repair that gap rather than silently marking the matrix complete.

## Failure modes and recovery

| Failure | Required result |
| --- | --- |
| JDBC jar absent, unreadable, or hash mismatch | Stop before creating a database; name the coordinate, expected SHA-256, and actual result. Never download a replacement from an unapproved mirror. |
| Driver class absent or not a JDBC driver | Stop before rendering and report the class name and jar identity. Do not silently fall back to a machine-installed driver. |
| PostgreSQL credentials or `connection-properties` rejected | Keep the credential out of logs and JSON; report the server error category and the redacted connection shape. The run is unverified. |
| SQLite file cannot be opened, locked, or recreated | Stop that dialect, report the file-operation category, and leave the source tree untouched. Do not reuse a stale file from a prior run. |
| Incompatible schema or dialect-specific SQL error | Record the first failing operation, SQL statement identifier (not credential-bearing values), server/driver version, and exit status. A partial database is not a pass. |
| Pagination, purge, reopen, or deleted-row recreation fails | Report the exact operation and item/grid count. Do not downgrade the run to a smaller fixture and call it complete. |
| Timestamp-only render-state differences | Classify with `diffRenderState`, count them as expected time-only matches, and retain the count. Any non-timestamp field difference remains a divergence. |
| Upstream webserver does not become ready | Bound the wait, capture only a redacted log tail, stop the process, and mark direction 2 unverified. |
| One direction passes and the other fails | Keep both direction reports. The dialect remains unproven until both directions are independently green. |

The harness must use a `finally` cleanup path. PostgreSQL runs use a throwaway database/container bound only to loopback; SQLite runs use a fresh temporary file. Stop the Java webserver, drop/remove the database or file, remove the per-run temporary configuration and work directory, and verify with the runtime's process/database/file listing that nothing remains. Cleanup failure is reported separately from the comparison result and never silently converted into success. A credential is generated only for the run, passed through the process environment or protected input path, and cleared after cleanup.

## Dialect-specific deviations

- MariaDB Connector/J 3.5.3 rejects a `jdbc:mariadb://user:password@host:port/db` URL shape even though `mysql2` accepts it. The proven MariaDB harness therefore keeps the URL bare and supplies credentials through `connection-properties`; PostgreSQL follows the same safer configuration boundary.
- SQLite has no server to start or port to reserve. Its JDBC URL points at a newly created file below the run's work root, and the file plus its parent directory are removed in `finally`. A missing file, locked file, or stale file is a failed setup, never an invitation to reuse an older database.
- The Java proof requires `driver-jar` and `driver-class` because upstream does not bundle these JDBC drivers. That is a harness configuration fact, not a change to the TypeScript product contract: `StorageFactory` continues to reject arbitrary Java driver settings rather than silently ignoring them.
- The Java raw-storage HTTP path returns tiles and metadata, not every render-state grid. Direction 1 compares all render-state grids through the TypeScript SQL API; direction 2 must retain a separate SQL/API comparison or another independently checkable source for the same deterministic fields before issue #66 can be marked complete.

## Security considerations

- Use official Maven Central coordinates and verify SHA-256 before loading a driver. The jar is executable code and must not be accepted because its filename or extension looks right.
- Bind throwaway servers and the upstream webserver to `127.0.0.1`; never expose a proof database on a LAN interface.
- Keep PostgreSQL passwords and any SQLite file path containing user-specific information out of source, command-line arguments, ordinary logs, JSON reports, captures, issue comments, and release notes. Use `connection-properties` for Java credentials rather than embedding them in a JDBC URL.
- Do not load a developer's ambient JDBC driver, use a global database, or reuse a previous run's data. The proof must identify the exact jar and isolated store it used.
- The upstream CLI and TypeScript engine both execute against test data only. Remove the database/file and temporary configs immediately after the run, even when a comparison fails.
- Driver loading is a build/test harness concern. It does not change the product's `StorageFactory` contract: the TypeScript port continues to use its built-in dialect adapter and refuses unsupported `driver-jar`/`driver-class` settings rather than pretending to load arbitrary Java classes.

## Verification record

The final matrix report is [`docs/sql-cross-engine-compatibility.report.json`](sql-cross-engine-compatibility.report.json). It started at
`2026-08-19T12:28:28.726Z`, finished at `2026-08-19T12:30:20.049Z`, used seed `1`, fixture size
`64`, and `postgres:17.6`, exited `0`, and reports `111323` ms total duration. Provenance is
tested commit `f3c94d2ff74d007249996850e32b16b96b268ce5`, Node `v24.19.0`, and Java
`25.0.4`; the driver versions and SHA-256 values are in the table above. The final report uses
repository-relative paths and records cleanup explicitly.

| Dialect | Direction | Hires | Lowres LOD 1/2/3 | Metadata | Map IDs/grids | Render-state | Divergences | Elapsed | Cleanup verdict | Status |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- |
| PostgreSQL | Java → TypeScript | 1 | 9 / 4 / 4 | 5 | 1003 / 1251 | 6 state records compared through `diffRenderState`; 0 divergences; separate time-only count not serialized | 0 | 6743 ms | `direction1.target.ok=true`, `state=removed`; `workRootRemoved=true` | **Verified** |
| PostgreSQL | TypeScript → Java | 1 | 9 / 4 / 4 | 5 | 1003 / 1251 | Not compared through HTTP; report explicitly records that Java raw storage exposes tiles/metadata only | 0 | 8246 ms | `direction2.target.ok=true`, `state=removed`; `workRootRemoved=true` | **Verified for payloads; D2 render-state boundary documented** |
| SQLite | Java → TypeScript | 1 | 9 / 4 / 4 | 5 | 1003 / 1251 | 6 state records compared through `diffRenderState`; 0 divergences; separate time-only count not serialized | 0 | 6509 ms | `direction1.target.ok=true`, `state=removed`; `workRootRemoved=true` | **Verified** |
| SQLite | TypeScript → Java | 1 | 9 / 4 / 4 | 5 | 1003 / 1251 | Not compared through HTTP; report explicitly records that Java raw storage exposes tiles/metadata only | 0 | 8446 ms | `direction2.target.ok=true`, `state=removed`; `workRootRemoved=true` | **Verified for payloads; D2 render-state boundary documented** |

For direction 1, all six serialized render-state records (`tileState`, four grid cells as counted
by the report, `chunkState`, and `regionState`) matched with zero divergences under the shared
timestamp-aware classifier. The report does not serialize how many matches were wall-clock-only;
no such count is invented here. For direction 2, the report explicitly sets `renderStateCompared`
to `false`: its production Java HTTP route returns tiles and metadata only, so direction 2 does
not independently prove render-state grids. The four payload comparisons and all three lifecycle
failure probes exited successfully, and every direction/incompatible-schema cleanup target was
removed with its work root removed. The D2 render-state boundary remains an explicit limitation,
not a hidden success claim.

## 廣東話

呢篇文件記錄 issue [#66](https://github.com/Ding-Ding-Projects/worldlens/issues/66) 嘅 SQL 跨引擎驗證：上游 Java 引擎同 TypeScript port，用 PostgreSQL 同 SQLite 互相寫入、互相讀返。durable report 喺 `2026-08-19T12:28:28.726Z` 開始、`2026-08-19T12:30:20.049Z` 完成，seed `1`、fixture size `64`、PostgreSQL image `postgres:17.6`，總時間 `111323 ms`，exit code `0`，tested commit 係 `f3c94d2ff74d007249996850e32b16b96b268ce5`，Node `v24.19.0`，Java `25.0.4`。

每個 dialect 要做兩邊：Java 寫入 SQL/file，TypeScript 讀返；TypeScript 寫入，Java 用正式 webserver-only raw-storage 路徑讀返。每粒 hires、三個 lowres LOD、`settings.json`、`textures.json`、map id、grid、pagination、purge、reopen 同 deleted-row recreation 都要對。`tileState` 同 `regionState` 入面有即時 render/update timestamp，兩次獨立 render 唔會一樣，所以一定要重用 `diffRenderState`：deterministic 欄位要完全相同，純 timestamp 差異另行計數，其餘差異就係真 divergence。

今次鎖定嘅 JDBC driver 係 PostgreSQL `42.7.13`（`org.postgresql:postgresql`，`org.postgresql.Driver`）同 Xerial SQLite `3.53.2.1`（`org.xerial:sqlite-jdbc`，`org.sqlite.JDBC`）。四個方向嘅 payload counters 全部 `0` divergence；Java 寫、TypeScript 讀嗰邊用 `diffRenderState` 對咗 state，純 wall-clock 欄位由 classifier 處理，但 report 冇獨立 time-only 數字，所以唔估。TypeScript 寫、Java HTTP 讀嗰邊只對到 tiles 同 metadata，report 明寫 `renderStateCompared: false`，唔可以講成完整 state proof。

JDBC jar 缺失、hash 唔啱、driver class 唔存在、credential/property 失敗、schema 唔合、pagination/purge/reopen/recreate 失敗、webserver 起唔到，同 cleanup 留低垃圾，都要各自報清楚。今次 durable report 用 relative path，並且 SQLite、PostgreSQL 嘅 direction 1/2 同 incompatible-schema probe 全部記錄 `ok=true`、`state=removed`、`workRootRemoved=true`。四個 row 係 comparison 同 cleanup 都有 evidence；但 direction 2 個 production Java HTTP route 只出 tiles 同 metadata，冇獨立 render-state grid comparison，所以嗰個 boundary 要照實寫，唔可以扮成完整 state proof。
