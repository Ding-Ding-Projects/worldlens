# Screenshot evidence: how staleness is detected, and how to refresh it

This project keeps ~200 committed screenshots under `docs/screenshots/` as evidence that the
interface looks the way the documentation and issue history say it does. Screenshots rot: a UI
change lands, nobody retakes the pictures, and the images quietly start showing an older build
while their captions confidently describe the current one. `scripts/check-screenshot-evidence.mjs`
(run via `pnpm screenshots:check` from the `design/` workspace) exists to catch that before it
ships.

## What the check actually validates

It is a **source-digest fingerprint check, not a pixel diff.** It never opens or compares the PNG
bytes against a reference image. Instead, for each evidence group it:

1. Walks the exact set of source files that can affect that group's rendered output (renderer,
   main process, preload — excluding test files, which cannot change what ships).
2. Hashes that file set into one digest, in a way that ignores file collection order and line-ending
   differences between checkouts, but changes on any real content change to a shipping file.
3. Compares that digest against the `uiSourceDigest` recorded for the group in
   `docs/screenshots/evidence-inventory.json` — the digest that was current at the moment the
   group's images were last captured.
4. Reports the group as stale if the digests disagree, and prints the exact command to regenerate
   it plus the exact follow-up command to record the new digest.

This means the check can pass while an image is subtly wrong pixel-for-pixel (nothing here proves
the capture rendered correctly), and it will fail the instant *any* source file the group depends
on changes, even a change with no visible effect. It answers one narrow question — "is this
picture of the version of the app that exists right now?" — and answers it precisely.

`docs/screenshots/manifest.json` is a different, complementary file: the self-describing record a
single capture run writes, with one entry per image giving its `surface` (what it shows) and a
full `caption`. It is not what the check grades against; `evidence-inventory.json` is.

## The three evidence groups

| group | image count | regenerate command | what it needs |
|---|---|---|---|
| `app-playwright-manifest` | 117 | `cd design && pnpm build && pnpm --filter @worldlens/app screenshots` | The built app, launched headless with remote debugging enabled and driven over the Chrome DevTools Protocol. No dev server, no map data. |
| `app-playwright-map-dependent` | 15 | `cd design && pnpm build && WORLDLENS_CAPTURE_MAP=<a rendered web root: settings.json + maps/> WORLDLENS_CAPTURE_PROVENANCE=<the JSON that render wrote> pnpm --filter @worldlens/app screenshots` | Everything the first group needs, **plus a genuinely rendered map**: real tile output from a real Minecraft world render, served from a local web root. |
| `lowlevel-ui-e2e` | 18 | `cd design && pnpm ui:e2e:lowlevel` | The same built, headless-driven app, exercised through a committed UI action plan instead of the Playwright spec file. |

After any of these, the new digest is recorded with:

```
node scripts/check-screenshot-evidence.mjs --print-interface-digest
```

and that value is written into the corresponding group's `uiSourceDigest` in
`docs/screenshots/evidence-inventory.json`.

### The map-dependent group is not fakeable

`app-playwright-map-dependent` cannot be produced by mocking, stubbing, or hand-editing an image.
It requires an actual rendered map — real tile PNGs and a real `settings.json` describing an
actual Minecraft world, produced by an actual render pass — served from a local directory so the
running app can load it the same way a user's would. There is no shortcut here: no fixture file
substitutes for a real render, and no previously captured image may be reused once the interface
around it has changed, because that would be exactly the stale-but-confident state this whole
check exists to prevent.

## The practical rule: a recapture is only valid on a frozen tree

Because the check grades against a source digest computed at capture time, and any commit to the
watched source files changes that digest, **a recapture is only meaningful if the tree does not
change between the moment the digest is computed and the moment the images are committed.**

In practice this means:

- Do not start a recapture while commits are still landing on the branch being captured. A capture
  taken against a moving tree is stale before the commit that records it even happens — the check
  will immediately flag it again, because by the time it lands, the digest it was captured against
  is already history.
- If a recapture must run alongside ongoing development, run it against an isolated, pinned
  checkout of one exact commit (a separate worktree or clone), not against a shared checkout that
  other work is actively landing on.
- Treat "the digest changed since I last ran the check" as a signal to stop and re-sync, not as
  something to chase — recapturing against every intermediate commit wastes a full app build and a
  multi-minute capture run for a result that is obsolete before it is recorded.
- The fix that actually holds is simple: freeze the tree (branch cut, release candidate, or a
  quiet window with no pending commits), then capture once against that exact commit.
