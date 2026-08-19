# Windows 1.0 compatibility and migration guide

This guide defines the public compatibility contract for the Windows 1.0 line. It is for
operators, integrators, and tools that upgrade an existing Worldlens installation or project
without losing data. The contract is deliberately conservative: an upgrade may add a new
representation, but it must not silently reinterpret, delete, or overwrite data that the new
build cannot understand.

## Compatibility promise

The 1.0 contract covers the Windows desktop application, its profile data, and the project and
repository markers it owns. A 1.0-compatible build must:

- read the current 1.0 formats and the legacy formats listed in the migration matrix;
- write only the current format after a successful migration;
- preserve unknown fields when it parses and serializes a document it otherwise understands;
- keep the source profile or source project unchanged until the converted result has been
  validated; and
- fail closed when a value is ambiguous, corrupt, unsupported, or concurrently changed.

This is a Windows-only contract. The profile paths, atomic cutover, file-lock behaviour, and
rollback rules below use Windows filesystem semantics. A non-Windows reader must not claim this
contract merely because it can parse one of the JSON examples.

## Upgrade sequencing

An upgrade is a transaction with an explicit order. Do not copy these steps into a script that
changes files in a different order; the order is part of the compatibility guarantee.

1. **Identify the release.** Record the installed version, target version, profile root, project
   paths, and the exact schema versions found. Keep the product identity separate from the user's
   display name: renaming the app must not change its data directory, package identity, installer
   identity, update feed, or schema identity.
2. **Quiesce writers.** Close other Worldlens processes and stop automation that can write the
   profile or project while migration is running. Acquire the application's single-instance
   lock before reading the migration inventory.
3. **Preflight without writing.** Reject links, junctions, reparse indirection, unsupported file
   types, duplicate case-insensitive paths, malformed JSON, and unsupported schema versions.
   Produce a manifest of source paths, byte sizes, and SHA-256 digests.
4. **Create a same-volume staging area.** Copy the source into staging, preserving relative
   paths and file bytes. Do not modify the source. Convert schema records in staging only.
5. **Validate the converted result.** Parse every migrated record with the target schema,
   validate required fields and bounds, preserve unknown fields, and compare the expected
   source-to-target inventory. A migration receipt is not success until this validation passes.
6. **Recheck before cutover.** Re-read the source/current manifest. If a source or current file
   changed during the operation, stop and keep the original active. Never cut over a result based
   on a stale manifest.
7. **Activate atomically.** Flush the journal and staged data, then perform the documented
   same-volume rename/cutover. Retain the old profile or project copy and the transaction journal
   until post-activation verification completes.
8. **Verify and finalize.** Open the migrated data read-only first, verify the receipt and all
   hashes, then allow normal writes. Cleanup of backups is a separate finalization step and must
   never be required for rollback.

If any step fails, the application starts its recovery path before reading a success receipt. A
partial staging directory is quarantined rather than treated as a usable profile.

## Schema migration rules

Schema versions identify the representation, not the application build. A build may support more
than one application version while keeping the same schema contract.

### Profile and preference records

Current values win when both current and legacy preference namespaces exist. Otherwise the legacy
value is copied to the current key. The old value remains available in the retained source and
rollback copy; it is not deleted merely because the new key was written.

Values that the target schema cannot represent are not guessed or silently dropped. Migration
must either preserve them in the target's documented extension area or stop with a field-specific
error explaining the unsupported value.

### Project files and markers

The 1.0 adapters use this compatibility matrix:

| Surface | Current write | Legacy read | Policy |
| --- | --- | --- | --- |
| Project file | `worldlens.project.json`, schema `worldlens.project`, format 2 | `material-bluemap.project.json`, format 1 | Read both; write only the current file after migration. |
| CI ownership marker | `.worldlens-ci.json`, tool `worldlens` | `.material-bluemap-ci.json`, tool `material-bluemap` | Prefer the current marker; preserve the legacy marker until verification. |
| World-repository marker | `.worldlens-world.json`, tool `worldlens` | `.material-bluemap-world.json`, tool `material-bluemap` | Do not merge conflicting markers automatically. |
| Published-map marker | `.worldlens-map.json`, tool `worldlens` | `.material-bluemap-map.json`, tool `material-bluemap` | Convert only after the referenced project and map identity validate. |

Unknown project fields survive parse and serialization. New writes must not create another
legacy identifier, even when a legacy file was the input.

### Example: a safe project upgrade

Legacy input can remain readable while the current file is prepared:

```json
{
  "schema": "worldlens.project",
  "format": 2,
  "name": "Example world",
  "maps": [],
  "extensions": {
    "vendor.example.futureField": { "kept": true }
  }
}
```

The `extensions` member illustrates the preservation rule. It is not permission to invent a
private or application-specific field: an adapter must preserve an unknown value byte-for-byte or
use the target schema's documented canonical serialization, and must report which choice it made.

## Rollback

Rollback means returning to the last verified active state, not deleting the new state and hoping
the old state can be reconstructed.

- Keep the source profile/project and the pre-existing current root until the success boundary.
- Persist a transaction journal before the first rename. It records source, staging, current,
  backup, failed paths, and the durable phase.
- If staging, conversion, verification, or activation fails, restore the previous current root,
  quarantine incomplete staging, retain the source, and mark the attempt failed.
- If a crash occurs before or after backup rename, receipt write, activation, verification, or
  rollback, recover the journal before opening the profile. A completed activation is verified;
  an incomplete activation is rolled back or isolated according to its recorded phase.
- Do not remove backups as part of rollback. Backup cleanup is allowed only after the explicit
  finalize boundary and must report any cleanup failure with the exact paths that remain.

Rollback is not a schema downgrade. A user who returns to an older build must use the retained
legacy/current copy that that build understands. Never rewrite a newer document into an older
schema merely to make an older binary open it.

## Deprecation handling

Deprecation is a compatibility window, not a silent deletion plan.

1. Keep a legacy reader for the published window and identify the legacy source in diagnostics
   and the migration summary.
2. Prefer current identifiers when both generations are present. If their values differ, stop
   and show the conflicting relative paths or fields; do not choose by timestamp or filename
   order.
3. Write only current identifiers for new saves and exports. A normal save is not permission to
   rewrite unrelated legacy files.
4. Give operators a bounded warning containing the legacy identifier, the replacement, the
   first version that can read it, and the planned removal release. Warnings must not claim that
   data has migrated when only a legacy read occurred.
5. Remove a legacy reader only in a declared major compatibility change, with a documented
   conversion command or an explicit refusal that names the unsupported format. A minor 1.0.x
   update must not remove a 1.0 contract reader.

Legacy environment variables follow the same rule. `WORLDLENS_` values take precedence when both
names exist; the former `MATERIAL_BLUEMAP_` update-feed, GitHub-client, and download-consent
names remain readable during the compatibility window. A migration report should identify which
namespace supplied the effective value without printing credentials or tokens.

## Failure modes and operator response

| Failure | Required result | Safe operator action |
| --- | --- | --- |
| Profile or project is already in use | No migration writes occur. | Close the other process and retry. |
| Source or current root is a link, junction, or reparse path | Refuse before copying. | Move data into a normal application-owned directory and retry. |
| Case-insensitive path collision | Keep both roots unchanged and list only the relative collision. | Rename one source entry outside the migration, then retry. |
| Malformed receipt, consent, or schema record | Refuse instead of repairing by guesswork. | Restore a known-good copy or use the documented recovery route. |
| Unknown or newer schema version | Do not open it as an older schema. | Upgrade with a build that supports that schema, or restore the older retained copy. |
| Divergent file exists in both generations | Do not merge or pick a winner. | Review the named paths and choose the source explicitly before retrying. |
| Source changes during staging | Abort cutover; keep the changed source/current root active. | Stop the writer, then rerun from a fresh manifest. |
| Verification or hash mismatch | Quarantine the failed target and roll back. | Preserve the receipt and failure paths for inspection; retry only after the cause is fixed. |
| Disk full or rename blocked | Leave the previous active state usable. | Free space or release the file handle, then retry; do not delete the retained source. |
| Process crash during migration | Recover the durable journal before normal startup. | Allow recovery to finish; do not manually delete staging or backup paths first. |

The user-facing error must name the affected surface, phase, and recovery action. It must not
expose credential values, tokens, or an absolute user-profile path merely to explain a migration
failure.

## Integrator checklist

Before declaring a Windows 1.0 upgrade compatible, confirm that the integration:

- reads the matrix above and writes only current identifiers;
- validates schema version, required fields, bounds, and unknown-field preservation;
- stages and hashes before cutover, then rechecks for concurrent changes;
- keeps a durable journal and a retained rollback copy;
- recovers incomplete transactions before reading a success receipt;
- treats conflicts, newer schemas, links, and corrupt records as explicit failures;
- emits deprecation information without exposing secrets; and
- verifies the result from the built Windows application, not only from a source-level parser.

## Related documentation

- [Migrating from Material BlueMap to Worldlens](../worldlens-migration.md)
- [Startup recovery](../startup-recovery.md)
- [Automatic updates](../automatic-updates.md)
- [Configuration history](../config-history.md)
