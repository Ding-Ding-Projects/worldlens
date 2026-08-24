# Creative appearance studio

The creative appearance studio is a local, editable composition surface for an app logo or any
other appearance target. It is an adapter around a versioned document model, so the core
appearance editor can host it without sharing hidden state or changing package identity.

## What it edits

The document supports raster, vector, text, gradient, and group layers. Layers can be renamed,
hidden, selected together, reordered, nested, grouped, clipped, masked, duplicated through the
host action, and adjusted with opacity and blend mode controls. The preview is generated from the
same document used by the controls, so changing a result row changes the rendered SVG immediately.

Canvas size, crop, position, rotation, scale, flip, alignment, and distribution are represented in
the document. Effects include blur, brightness, contrast, saturation, hue, grayscale, sepia,
invert, shadows, and glows. Text layers keep the full typography shape used by the appearance
editor, including variable axes and Word-style decorations, even where a renderer cannot draw a
particular property. Unsupported capabilities stay visible with a reason.

## Safety and privacy

Document import is bounded to 12 MB and validates the format marker, schema version, layer count,
history count, canvas bounds, text length, names, numeric values, and nesting depth before the
previous document is replaced. Image import accepts PNG, JPEG, WebP, and safe static SVG only.
It rejects animated or script-bearing input, bounds the file to 8 MB and the canvas to 16
megapixels, and keeps the prior valid state if validation fails. Images are read locally and are
never uploaded or fetched from a network source.

The stable package identity, application data directory, installer identity, and update feed are
not derived from a custom logo or document name.

## History and exchange

Each edit creates a bounded append-only history snapshot. Undo and redo move through those
snapshots without rewriting or deleting the earlier entries. JSON export is versioned and
re-importable. The import path rejects malformed or unknown documents before applying anything.

## Finding controls

The layer list has a plain-text search and an adjacent regex builder. The selected result itself
contains controls for name, visibility, opacity, blend mode, geometry, rotation, text, and fill,
so a user does not need to navigate away from the result to make a change. The blend-mode picker
is populated from the supported list and remains an editable field for keyboard use.

## Verification

Focused tests cover document bounds, safe asset signatures, import rollback, export/import,
history, grouping, renderer changes, mounted controls, inline result editing, regex search, and
the honest empty and error states. The required built-artifact smoke capture remains owned by the
appearance integration lane because this adapter does not own the application shell.

Suggested articles: [appearance editors](../../contracts/appearance-editors.md), [localization](../../contracts/localization.md), and [regex builder](../../contracts/regex-builder.md).
