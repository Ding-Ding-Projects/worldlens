# Screenshot evidence: how staleness is detected, and how to refresh it

This project keeps committed screenshots under `docs/screenshots/` as evidence that the
interface looks the way the documentation and issue history say it does. Screenshots rot: a UI
change lands, nobody retakes the pictures, and the images quietly start showing an older build
while their captions confidently describe the current one. `scripts/check-screenshot-evidence.mjs`
(run via `pnpm screenshots:check` from the `design/` workspace) exists to catch that before it
ships.

## What the check actually validates

It is a **source-digest fingerprint check, not a pixel diff.** It never opens or compares the PNG
bytes against a reference image. Instead, for each group marked `capturedFromInterfaceSource` it:

1. Walks `design/packages/ui/src`, excluding test files and generated changelog data. This
   particular digest does not cover the main process, preload or documentation site sources.
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

## Plan-driven evidence and provenance

| group | image count | regenerate command | what it needs |
|---|---|---|---|
| `app-playwright-manifest` | 117 | `cd design && pnpm build && pnpm --filter @worldlens/app screenshots` | The built app, launched headless with remote debugging enabled and driven over the Chrome DevTools Protocol. No dev server, no map data. |
| `app-playwright-map-dependent` | 15 | `cd design && pnpm build && WORLDLENS_CAPTURE_MAP=<a rendered web root: settings.json + maps/> WORLDLENS_CAPTURE_PROVENANCE=<the JSON that render wrote> pnpm --filter @worldlens/app screenshots` | Everything the first group needs, **plus a genuinely rendered map**: real tile output from a real Minecraft world render, served from a local web root. |
| `lowlevel-ui-e2e` | 14 | `cd design && pnpm ui:e2e:lowlevel -PlanPath scripts/worldlens-lowlevel-e2e.json` | A clean packaged app and Lowlevel MCP on Windows; the default plan uses a fresh isolated profile and declines download consent. |
| `lowlevel-ci-render-history` | 3 | Run `scripts/worldlens-lowlevel-ci-render.json` through the committed driver in a prepared hidden-desktop session. | A real failed render row in the isolated profile. The fresh-profile runner cannot provide it; replay also accepts consent and removes a local row, requiring current authorization. |
| `lowlevel-public-pages-render` | 1 | Run `scripts/worldlens-lowlevel-existing-public-pages-render.json` through the committed driver in a prepared hidden-desktop session. | `WORLDLENS_CI_WORLD`, `WORLDLENS_TARGET_REPOSITORY_SEARCH`, an authenticated account, and authorization for consent, upload, public Pages publication and a real Actions dispatch. |

The inventory's `planFiles` lists are checked against the union of each JSON plan's
`screenshot` step names. The group must list exactly those `docs/screenshots/<name>.png`
outputs, and its command must name every plan. Missing plans, malformed screenshot names,
duplicate outputs and both directions of a target mismatch fail the guard. This is a static
contract check; it does not execute a command, prove a successful capture, or satisfy its
preconditions. Capture output still needs the existing verification and promotion procedure.

The three Lowlevel groups keep the original digest unchanged. The split records which plan can
produce which image; it is not a recapture and does not clear stale evidence. The other inventory
groups retain their own capture, historical-source and external-state requirements.

### Archived compact proof

The 14 `site-compact-proof` PNGs and the one `site-tabs-compact-proof` PNG were last changed on
2026-08-07. Their per-target `sourceCommits` now pin those historical versions. The bottom-tabs
image predates `compact-proof.mjs` itself; it was never an output of that command. The current
script was retargeted at `c60e085f551883af94e9f8ad03946dad26755375` on 2026-08-09 and writes
schema-v3 matrix or single-viewport reports, using `PAGES_PROOF_SCREENSHOT_DIR` and viewport
labels for PNG names. That current interface cannot reproduce the old scenario captures.

`runtimeProofs` explicitly pairs the 14 archived images with their JSON reports. In particular,
`pages-parity-settings-1024x768.png` maps to
`pages-parity-settings-1024x768-english.json`; no image or report needs renaming. Four archived
reports have no tracked screenshot and are explicitly recorded in `reportOnlyProofs`:

- `pages-parity-appearance-414x896-bilingual.json`
- `pages-parity-changelog-414x896-bilingual.json`
- `pages-parity-exports-390x844-bilingual.json`
- `pages-parity-notifications-414x896-cantonese.json`

They remain report-only evidence, outside the screenshot count. The guard rejects missing or
duplicate mappings, unknown reports, unexplained targets and report-only entries without a
reason. No image, report or digest was regenerated by this provenance correction.

After a complete, verified recapture of a graded group, the new digest is recorded with:

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
# Screenshot evidence refresh — issue #160

This record describes the 2026-08-22 refresh attempt on `lane/issue160-captures`, based on
`origin/main` at `a90f588f7c13b93cc43d83acedd116e724a0471d`.

## Staleness before the attempt

`cd design && npm run screenshots:check` ran all 12 unit checks successfully, then failed its
intentional stale-evidence check. Three graded groups were stale:

| Group | Targets | Recorded digest | Current digest |
| --- | ---: | --- | --- |
| `app-playwright-manifest` | 117 | `5ca1cbfd8036f93c9b69bca219edc27a01c111a815c5dfa5293180572187b02e` | `083aa9791081e59043e90426435ed8b82b88f1388b23b10c6214460c659411fe` |
| `app-playwright-map-dependent` | 15 | `5ca1cbfd8036f93c9b69bca219edc27a01c111a815c5dfa5293180572187b02e` | `083aa9791081e59043e90426435ed8b82b88f1388b23b10c6214460c659411fe` |
| `lowlevel-ui-e2e` | 18 | `10e21e51523d90099f5d8f57761aa17510016d08ee2221a930edfd0492374c` | `083aa9791081e59043e90426435ed8b82b88f1388b23b10c6214460c659411fe` |

The inventory contains 229 targets across 14 groups. Other groups are not graded against the UI
source digest; their own reproducibility or external-state boundaries remain authoritative.

## Regeneration attempt and exact blockers

The real application was built with `pnpm build`, packaged with
`pnpm --filter @worldlens/app package`, and launched on a named hidden desktop through the Cheap
Lowlevel route with one CDP page target. The Playwright harness was invoked with the exact
candidate commit and CDP port.

No committed image was replaced. The run captured early no-map surfaces but could not complete the
manifest: it stopped in the map/profile-manager portion because `WORLDLENS_CAPTURE_MAP` was not
set. The harness correctly reported that map/menu/profile states require a rendered local map and
did not promote the partial output as evidence. The map-dependent group therefore remains stale.

`lowlevel-ui-e2e` was not recaptured because the required persistent Lowlevel MCP binding was
unavailable (`WinError 10061`); the installed one-shot direct CLI could launch and enumerate a
desktop but cannot provide the project's persistent driver lifecycle. No substitute visible UI,
ordinary computer-use route, mock, or hand-edited image was used.

The external groups remain intentionally untouched: `live-pages` needs the authorized published
proof sites, and `consent-render` needs current-user consent plus real runtime data. Historical
groups require their recorded source commits and were not regenerated from the current tree.

## Staleness after the attempt

Because no complete capture set was produced, the evidence inventory digests were not changed.
The expected post-attempt result is therefore unchanged: 3 stale graded groups and 0 committed
groups recaptured. Run `cd design && npm run screenshots:check` again after a complete map-backed and
persistent-Lowlevel capture to obtain the next exact verdict.


## 廣東話

截圖清單依家會核對每組 `planFiles` 入面所有 `screenshot` 步驟，確保輸出嘅
`docs/screenshots/<name>.png` 同 `targets` 完全一致，而且記錄嘅指令有寫明每個計劃。
遺漏檔案、錯誤名稱、重複輸出同兩邊對唔上都會報錯。呢個係靜態核對，唔代表真係
跑過截圖指令，亦唔會代替實際執行、驗證、批准同證據提升程序。

原本 18 張 Lowlevel 截圖拆成 14 張一般介面、3 張真實失敗雲端工作歷史，同 1 張
公開 Pages 工作。一般計劃用全新獨立設定檔；歷史計劃需要已有真實失敗記錄；Pages
計劃需要世界路徑、目標倉庫、登入，以及上載、公開發佈同 Actions 執行嘅現時授權。
拆組保留原有 digest，冇重新截圖，亦冇將過期證據扮成最新。

14 張 compact 圖同 1 張底部分頁圖最後喺 2026-08-07 改過，依家按每張圖嘅
`sourceCommits` 當歷史證據處理。底部分頁圖仲早過 `compact-proof.mjs` 出現；現時
schema-v3 指令用 `PAGES_PROOF_SCREENSHOT_DIR` 輸出 viewport 圖，唔可以重製舊場景。
`runtimeProofs` 明確配對 14 份報告，包括 settings 圖同帶 `-english` 名稱嘅 JSON。
四份冇 PNG 嘅報告保留喺 `reportOnlyProofs`，唔會憑空變成截圖，亦唔計入圖片總數。
以上修正冇改動任何圖片、報告或者 digest；完整驗證重拍之前，過期狀態照樣保留。
