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

The issue-#66 implementation lane has prepared `tools/oracle/sql-crosscompat-matrix.mjs`. It is not yet part of the default branch in this documentation-only snapshot. Once integrated, it creates a fresh SQLite file or a throwaway `postgres:17.6` container bound to loopback, and the required invocation is:

```powershell
# PostgreSQL and SQLite — required issue-#66 matrix; UNRUN in this lane
node tools/oracle/sql-crosscompat-matrix.mjs --dialects sqlite,postgresql --driver-dir tools/oracle/driver-fetch/build/drivers --json tools/oracle/out/sql-crosscompat-matrix/issue-66.json
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

No PostgreSQL or SQLite cross-engine run has been executed in this documentation lane. Counts and timings are intentionally placeholders, not inferred from the MariaDB control:

| Dialect | Direction | Hires | Lowres LOD 1/2/3 | Metadata | Map IDs/grids | Time-only fields | Divergences | Elapsed | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| PostgreSQL | Java → TypeScript | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | Not proven |
| PostgreSQL | TypeScript → Java | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | Not proven |
| SQLite | Java → TypeScript | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | Not proven |
| SQLite | TypeScript → Java | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | **UNRUN** | Not proven |

The MariaDB control remains the only completed cross-engine evidence: 961/961 hires tiles, 24/24 low-resolution tiles, both metadata documents, and deterministic render-state fields matched in both directions; timestamp-only fields were excluded by the shared classifier. That result is context, not a substitute for the four issue-#66 rows above. The implementation lane must replace each `UNRUN` cell only from the corresponding committed JSON report and must record the exact run timestamp, commit, versions, command, cleanup verdict, and any dialect-specific deviation.

## 廣東話

呢篇文件記錄 issue [#66](https://github.com/Ding-Ding-Projects/worldlens/issues/66) 要做嘅 SQL 跨引擎驗證：上游 Java 引擎同 TypeScript port，要用 PostgreSQL 同 SQLite 互相寫入、互相讀返。MariaDB 嗰次係參考格式；未有真實兩個方向嘅報告之前，唔可以話 PostgreSQL 或 SQLite 已經證明。

每個 dialect 要做兩邊：Java 寫入 SQL/file，TypeScript 讀返；TypeScript 寫入，Java 用正式 webserver-only raw-storage 路徑讀返。每粒 hires、三個 lowres LOD、`settings.json`、`textures.json`、map id、grid、pagination、purge、reopen 同 deleted-row recreation 都要對。`tileState` 同 `regionState` 入面有即時 render/update timestamp，兩次獨立 render 唔會一樣，所以一定要重用 `diffRenderState`：deterministic 欄位要完全相同，純 timestamp 差異另行計數，其餘差異就係真 divergence。

今次鎖定嘅 JDBC driver 係 PostgreSQL `42.7.13`（`org.postgresql:postgresql`，`org.postgresql.Driver`）同 Xerial SQLite `3.53.2.1`（`org.xerial:sqlite-jdbc`，`org.sqlite.JDBC`）。SHA-256、Gradle `9.4.0` wrapper、Java 25 toolchain、jar fetch/build 指令、環境隔離同 cleanup 規則全部寫明；但四個 PostgreSQL/SQLite verification row 仍然係 **UNRUN / 未證明**，唔會偷用 MariaDB 嘅數字扮完成。

JDBC jar 缺失、hash 唔啱、driver class 唔存在、credential/property 失敗、schema 唔合、pagination/purge/reopen/recreate 失敗、webserver 起唔到，同 cleanup 留低垃圾，都要各自報清楚。PostgreSQL database/container 只綁 loopback，SQLite 用全新 temporary file；run 完要停 server、刪 database/file/config/work directory，同埋確認冇 process、file 或 database 留低。密碼唔入 command、log、JSON、capture、issue 或 release，driver 亦唔可以由開發者部機偷偷借返嚟。
