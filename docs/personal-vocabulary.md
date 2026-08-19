# Personal vocabulary

Your own words, substituted throughout the interface, from a file only you have.

## The control is always there

The settings surface always shows the upload control, even before any file exists. It is a
semantic file picker, keyboard and screen-reader operable, with honest states: no file,
loaded with a count, invalid with the reason, replace, and clear.

## The data only ever comes from you

Until you supply a valid file, every surface renders its original shipped wording,
unchanged. **No built-in mappings ship.** No samples, no templates, no defaults, no guesses.
Clearing purges the cache and restores the original wording immediately.

## What a file has to satisfy

The complete payload is validated before anything is displayed or cached, and a rejected
file **never applies partially**. Its only accepted top-level fields are `schemaVersion`, fixed
at `1`, and `entries`, a flat string-to-string object. Any extra top-level field is rejected.
If a private vocabulary service or another local tool uses a different internal representation,
it must normalize the file before the person chooses it here; WorldLens does not guess at legacy
or undocumented shapes.

- a hard byte ceiling
- a supported schema version, with an unknown version refused rather than guessed at
- maximum nesting depth and entry count
- bounded key and value lengths
- string-only replacement values
- no duplicate keys, no unsafe object keys, no control characters, and no unexpected fields

The current bounds are 256 KiB of UTF-8 input, depth 2, 4,096 entries, 160 characters per key,
and 1,000 characters per replacement. These limits apply before the candidate replaces an
existing valid cache, so an over-limit or malformed file cannot partially change active wording.

Each refusal names the exact bound that was broken rather than saying the file is invalid.

The cache is revalidated on every load and fails closed to the original wording when it is
missing, corrupt, stale or unsupported.

## It never leaves this computer

Parsing, validation, replacement and caching make **no network request**. Vocabulary terms,
mappings, payloads, the source filename and its path never reach logs, telemetry, exports,
history snapshots, crash reports, prompts or any public record. Exports state plainly that
they omitted the vocabulary rather than silently dropping it.

Replacements apply at the user-facing text boundary, including accessible names, and leave
commands, URLs, identifiers, code, file paths and factual external records verbatim.

The application's central localization catalogue applies replacements to the static parts of
its message templates before interpolation. Values supplied at runtime — including template
placeholders such as `{folder}`, paths, URLs, flags, counts, and identifiers — are kept
verbatim. Loading, replacing, or clearing a valid local file refreshes that catalogue in the
open application without sending the data anywhere.

## Verification

Bounds, malformed input, duplicate keys, partial-application refusal, persistence, replace,
clear, no-network behaviour, and absence from every export and log path.

## Issue #141 acceptance boundary

This article is the public compatibility record for the local upload contract. It does not
constitute packaged-runtime evidence. The implementation still needs focused verification in
the built application for the empty control, valid load, invalid and over-limit refusal,
replace, clear/reset, restart persistence, cache corruption, no-network behavior, and private
accessible-name handling. The evidence must come from the real packaged artifact and must not
contain vocabulary values, source paths, or payloads.

Issue #141 remains open until that implementation evidence is recorded. This records-only lane
does not claim tests, builds, runtime interaction, screenshots, captures, or release
verification.

### 廣東話 / Cantonese

呢篇係 Issue #141 本地 upload contract 嘅 public compatibility record，唔係 packaged runtime
evidence。Implementation 仲要喺真正 built app 驗 empty control、valid load、invalid/over-limit
拒絕、replace、clear/reset、restart persistence、cache corruption、no-network 同 private
accessible-name；evidence 唔可以帶 vocabulary value、source path 或 payload。

Issue #141 要等 implementation evidence 齊先可以 close。今次 records-only lane 冇聲稱 tests、
builds、runtime interaction、screenshots、captures 或 release verification 已完成。

## Suggested articles

- [Language modes and funny levels](language-and-tone.md) - the layer this sits on top of
