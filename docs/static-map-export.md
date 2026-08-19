# Static map export

## Status

Issue #72 tracks the complete static-map export workflow. This article is the contract and
evidence boundary for that work; it does not claim that the workflow is implemented or verified.
The current records-only update did not run tests, create captures, build an installer, or open an
export in a browser. The packaged-artifact proof remains open.

## Behaviour

An export must produce a self-contained map that can be moved to another folder and served by a
plain static server without a network dependency. The export surface must let the user choose:

- a folder export for direct inspection;
- a ZIP archive; and
- a fully configurable 7z archive, including compression method, level, dictionary, solid blocks,
  threading, split volumes, AES-256 content encryption, and encrypted headers.

The export preview names the destination, selected maps, file count, byte estimate, and any
omissions before writing. Folder and archive outputs use relative paths only. A path traversal,
absolute path, reparse point, duplicate output, or unsafe archive entry is rejected before any
user destination is changed.

The generated site keeps the viewer's client-side decompression setting, handles a configured
base path without breaking asset references, and can include `.nojekyll` when the selected host
needs it. It contains no CDN, analytics, tracking, or other external runtime dependency.

## Portable manifest and integrity

Every export carries a versioned manifest with the export identifier, producer commit, renderer and
engine versions, selected maps, settings metadata, relative file list, byte sizes, SHA-256 hashes,
and provenance. The manifest also contains an exact, human-readable omissions statement. A file
referenced by the manifest but absent from the staged output is an export failure, not a warning.
The reader must validate every reference, size, digest, and path before offering the result.

Filtered and bulk exports use the same manifest rules. A selected map may not silently lose tiles,
metadata, markers, viewer assets, or settings: each excluded category is named in the preview and
in the omissions statement.

## Progress, recovery, and user actions

The operation reports byte/file progress where available and supports cancel, resumable staging,
and recovery after interruption. Partial output is isolated from the requested destination and is
removed or offered for explicit recovery; it is never presented as a complete export. Existing
destinations require an overwrite decision, and the conflict path preserves the prior output.

Completed exports enter local history with their manifest and outcome. The surface offers an
open-in-file-manager action and an open-in-Visual-Studio-Code action for the exported folder or
manifest. These actions are integrations, not prerequisites for using the export.

## Verification required before closure

Issue #72 remains open until all of the following evidence is attached:

1. Each export format is exercised with compression on and off where applicable, custom base
   paths, multiple maps, Unicode paths, large output, cancellation, resume, overwrite conflict,
   missing files, and malicious relative paths.
2. Every referenced file is validated, and the result is opened from a plain static server.
3. A genuine packaged export is opened offline in a fresh browser profile, with the manifest,
   checksums, provenance, and omissions statement read back from the packaged output.
4. The packaged application interaction and the corresponding capture evidence are retained beside
   the exact commit that produced the package.

Until that evidence exists, the implementation and packaged export must be described as pending,
not as a shipped or verified feature.

## Suggested articles

- [Publishing a rendered map to GitHub Pages](./pages-hosting.md)
- [Large worlds and rendered maps](./large-worlds.md)
- [The world kept in a Git repository](./world-git-repository.md)
- [Local version history for config folders](./config-history.md)

### 廣東話 / Cantonese

Issue #72 係完整 static map export flow。呢篇係 contract 同 evidence boundary，唔係
runtime 已完成嘅保證。Records-only update 冇行 tests、冇整 captures、冇 build installer，亦
冇喺 browser 打開 export；packaged proof 仲未開綠燈。真正完成之前，folder、ZIP、完整 7z、
manifest/hash/provenance、逐檔 validation、recovery 同 offline fresh-profile reopen 都要逐樣
有證據，唔可以靠「copy 完應該得」當驗證。
