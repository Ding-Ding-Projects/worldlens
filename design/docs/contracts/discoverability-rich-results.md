# Discoverability and rich command results

The command palette is the app's searchable feature directory. It keeps the existing
`Ctrl+Shift+F` entry point and the existing catalogues as its source of truth, then adds a
small amount of local navigation memory around them. Every row keeps its original action and
validation path, so making a feature easier to find never removes or forks a feature.

## Behaviour

- Plain-text search is the default. The adjacent regex builder owns the palette query, pattern,
  flags, validation, and preview for this field only.
- Results carry a breadcrumb made from their catalogue group and title. Destination results keep
  their explicit deep-link description, and selecting one invokes the existing host route. Focus
  returns to the opening control after the palette closes.
- A row may be marked as a favourite. Favourites are stored by stable result id, never by title or
  user content, and the real control remains the only state owner.
- Destination selections are remembered in a bounded recent list. Repeated selections move to the
  front, and commands or settings do not enter that list.
- Results can expose related ids and labels, so the user can see a natural next action without
  leaving the current search. Related ids are validated against the same catalogue before use.
- A result that cannot act may provide a disabled reason and recovery text. It remains searchable
  and visible, but its control cannot claim to perform an unavailable action.
- Optional registries can add tab, group, article, appearance, and recovery destinations through
  `directoryEntries`. They use the same result type and deep-link contract as built-in rows.

## Persistence and privacy

The only browser storage record is `worldlens-palette-discovery`. It contains bounded arrays of
stable result ids. It does not contain labels, paths, search queries, regex patterns, document
contents, credentials, or page state. Storage failures fall back to an empty state, preserving
the palette's core behaviour.

## Failure modes and recovery

Malformed storage is discarded and the default empty state is used. Unknown or removed result ids
are harmless: they do not create rows and are ignored by the ordering logic. An invalid regex has
the same explicit no-result message as the rest of the application's search fields, with a direct
invitation to return to plain text or use the adjacent builder deliberately.

## Verification

The hand-written inventory in `components/palette/featureDirectoryInventory.ts` fails when a
canonical route, breadcrumb, or deep-link description disappears. Its negative regression removes
one required result and asserts red, then restores the result and asserts green. Focused tests cover
malformed storage, favourite persistence, recent-destination bounds, metadata validation, related
route integrity, and the no-duplication ordering model. The UI build also compiles the real palette
and row components.

