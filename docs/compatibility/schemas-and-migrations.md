# Schemas, migrations, rollback, and deprecation

This document defines how 1.0 data survives an application upgrade. A file that can be read is
not automatically compatible: the reader must identify the format, validate bounded input, and
either migrate it deliberately or preserve it unchanged and report why it was refused.

## Identity and versioned records

The immutable product identity is `Worldlens`. These identifiers are part of the compatibility
contract:

| Record or marker | Current identifier |
| --- | --- |
| Application id | `dev.worldlens.desktop` |
| User-data directory | `Worldlens` |
| Project file | `worldlens.project.json` |
| Project schema id | `worldlens.project` |
| CI/world/map markers | `.worldlens-ci.json`, `.worldlens-world.json`, `.worldlens-map.json` |
| Update environment prefix | `WORLDLENS_` |
| Appearance storage/format | `worldlens-appearance`, version `1` |
| Backup sidecar | `backup.json` |

The former `Material BlueMap` identifiers are read-only migration aliases. They are never emitted
by current writers. A display-name setting is cosmetic and cannot be used to derive any of these
machine identifiers.

Every persisted format must carry or have an unambiguous format discriminator and integer schema
version. Unknown versions, duplicate or unsafe keys, malformed JSON, unexpected fields, oversized
payloads, and values outside the declared range are rejected without partial application. Unknown
fields that are explicitly allowed by a format are preserved in that format's extension/preserved
bag; silently dropping a newer field is not a migration.

## Migration rules

1. Read the source bytes without modifying the source.
2. Detect the format id and schema version before interpreting fields.
3. Validate the complete bounded record, including nested values and identifiers.
4. Apply only the documented one-way migration steps in order; do not skip a version.
5. Write the current format atomically to a new destination or staged replacement.
6. Re-open and validate the result, then record the migration in local history.
7. Keep the original source until the new record is proven readable and the user-visible result is
   complete.

Migration is idempotent: repeating it on an already-current record produces no second semantic
change. A collision, invalid source, missing dependency, or failed write leaves the source intact,
reports the exact record and reason, and offers recovery at the surface that discovered the
failure. See [`migration-guide.md`](./migration-guide.md) for the user-facing cutover steps.

## Current known migrations

| Source | Current form | Rule |
| --- | --- | --- |
| `material-bluemap.project.json` and legacy marker names | `worldlens.project.json` and Worldlens markers | Read legacy identity; write current identity only. Keep the old copy until the new record is validated. |
| `MATERIAL_BLUEMAP_UPDATE_FEED`, `MATERIAL_BLUEMAP_UPDATE_TOKEN`, `MATERIAL_BLUEMAP_DISABLE_UPDATES` | `WORLDLENS_UPDATE_FEED`, `WORLDLENS_UPDATE_TOKEN`, `WORLDLENS_DISABLE_UPDATES` | Current names win when both exist. Legacy names remain readable during the migration window and are not written by new configuration. |
| `material-bluemap-appearance` format | `worldlens-appearance`, version `1` | Import accepts the legacy format marker, validates the same bounded shape, and exports only the current marker. Unrecognised appearance properties go in `preserved` rather than disappearing. |
| Older update tags such as `v0.1.0-build.*` | `v1.0.<run>` | Old releases remain historical records. The updater does not reinterpret an old tag as a current SemVer target. |

The table is intentionally finite. A name found in a file or environment is not a migration rule
until it is listed here or in a later release's migration notes.

## Local history and rollback

Configuration, project, backup, and other user-managed records use append-only local history. A
restore is a new history entry; it never rewrites the history that made the restore necessary.
Failed history writes must not be reported as recorded, and a failed history write must not turn a
successful user operation into an invented rollback.

The update controller writes a restricted receipt before requesting `quitAndInstall()`. The receipt
contains only the current version, target version, and request timestamp. On the next launch:

| Observed launch | Result |
| --- | --- |
| Running version equals the requested target | `installed`; receipt may be consumed after renderer acknowledgement. |
| Running version remains the previous version | `rollback`; the target did not take over. |
| Running version is any other value | `feed-mismatch`; the transition is not described as success. |
| Receipt is missing or malformed | `feed-mismatch`; the app cannot prove the transition. |

The receipt is not deleted before the first updater-state acknowledgement from the renderer. A
network check cannot erase rollback evidence, and a failed receipt removal leaves the evidence for
the next launch. The application identity and user-data directory do not change across updates.

Rollback of user data is separate from rollback of an installer. A version transition must not
silently downgrade a current project or configuration record. Use the local history restore path
for data, and keep the update receipt for package-transition evidence.

## Deprecation policy

Stable names remain readable for the supported 1.0 line. A deprecation notice must name the old
surface, replacement, first release carrying the notice, and planned removal boundary. During the
window, readers accept the old form and writers emit the replacement. Removal is allowed only at a
major-version boundary or after an explicitly documented compatibility decision; a minor or patch
release must not silently remove a documented stable field, route, command, or environment name.

Experimental and internal surfaces have no deprecation guarantee because they were never promised
as integration boundaries. A deprecated surface can still fail for malformed input; deprecation
does not waive validation, security checks, or bounded-resource rules.

## Failure semantics

Consumers should treat these outcomes as distinct:

- **unsupported**: the format or version is outside the declared contract;
- **invalid**: the input claims a known format but fails validation;
- **migration-required**: the input is a known older version with a documented path;
- **migration-failed**: the path was known but could not complete; source remains preserved;
- **rollback**: an update request started but the requested package did not become the running one;
- **feed-mismatch**: the app cannot prove that the observed update transition matches one exact
  SemVer target.

Do not collapse these into “old file” or “update failed”. The distinction tells an operator whether
to retry, restore, choose a supported version, or report a release problem.

## 廣東話

Schema 唔係「JSON 開到就算兼容」。讀取一定要先認 format id 同 version，完整 validate，跟住逐級做已
記錄嘅 migration；成功之前舊檔唔郁，失敗就保留原件，唔好半份新資料扮完成。`Worldlens`、
`worldlens.project.json`、`worldlens.project` 同一批 marker 名係目前寫入格式；`Material BlueMap` 舊
名只係 migration window 讀得，唔會新寫返出嚟。Appearance 而家係 `worldlens-appearance` version 1，
舊 format marker 可以 import，但 export 只出新名。

更新 rollback 同資料 restore 係兩件事：updater receipt 只記 current version、target version 同時間，
下一次 launch 會分清 `installed`、`rollback` 同 `feed-mismatch`；project/config 就用 append-only local
history restore，而且 restore 本身再記一筆，唔會偷偷改寫歷史。Deprecated 名稱要有替代品、通知 release
同移除邊界；minor/patch 唔可以突然斬走已承諾嘅 route、command、field 或 env name。
