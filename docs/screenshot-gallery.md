# Screenshot gallery (issue #76)

## Status

The screenshot gallery is an open product feature, not a synonym for the existing verification
capture set. The repository currently contains harness-produced images and evidence manifests for
development and release review, but the application does not yet provide a user-owned library for
organizing, searching, editing, exporting, or reopening screenshots. No user-facing gallery is
claimed by this article until the packaged application implements it.

## Intended behaviour

The gallery will capture the current map view with its map or project identity, coordinates,
camera state, timestamp, dimensions, application version, and source provenance. It will store
the original image in an app-managed library without seeded samples; thumbnails and metadata will
be derived from validated bytes rather than trusted filename extensions.

The library will provide:

- text, date, map, and tag filtering with an anchored regular-expression builder and date control;
- multi-select and complete bulk actions with an explicit preview and partial-result reporting;
- editing for the screenshot name, tags, and notes, with local history for metadata changes;
- copy, reveal, open in Visual Studio Code, faithful export of the original and metadata, and
  re-import;
- destructive deletion behind the application's two-key/full-range confirmation, with recycle or
  recovery where the platform permits it; and
- privacy-preserving sharing metadata that redacts sensitive paths and never uploads
  automatically.

The gallery must remain useful with very large, corrupt, missing, or duplicate files and must
report storage refusal without losing the source. Keyboard and screen-reader operation, Unicode
metadata, narrow layouts, and high display scales are part of the feature rather than follow-up
polish.

## Evidence boundary

Implementation and packaged-artifact interaction evidence are still pending. The existing
repository screenshots prove verification surfaces, not a user-owned gallery. The acceptance run
must populate the gallery only with screenshots created during that run, then capture the genuine
packaged gallery in its empty, populated, search/filter, edit, export/import, failure, and delete
recovery states. Until that run exists, this article deliberately records an open requirement and
does not present a static image or existing harness capture as proof.

## Security and privacy

Screenshot bytes and local metadata remain on the user's computer unless the user explicitly
exports them. Shared metadata must omit account tokens, credentials, private absolute paths, and
other sensitive values. Imports validate type, dimensions, metadata size, and duplicate handling;
failed validation never partially applies a record. Export formats must identify any information
that cannot be represented faithfully before writing the file.

## Related documentation

- [Captures and evidence](README.md#captures)
- [Local version control](config-history.md)
- [Super confirmation](super-confirmation.md)
- [Editing a project](project-editor.md)
