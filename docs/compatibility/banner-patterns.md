# Typed banner-pattern compatibility

This document defines the Worldlens compatibility boundary for banner block-entity
patterns. It covers the legacy NBT representation used by older Minecraft worlds, the
modern component-shaped representation, and values introduced by a future game version.
The reader is deliberately lossless for values it does not know: an unknown pattern or
colour is retained as data, not converted into a guessed default.

## Supported field names and eras

The list of layers is ordered. The renderer applies entries in that order, so a later
layer is not sorted, deduplicated, or moved ahead of an earlier layer.

| Era / representation | List field | Pattern field | Colour field | Identifier form |
| --- | --- | --- | --- | --- |
| Legacy 1.12 | `Patterns` | `Pattern` | `Color` | compact pattern id and numeric dye id |
| Modern 1.15 through 26.x legacy records | `Patterns` | `Pattern` | `Color` | compact pattern id and numeric dye id |
| Current namespaced components | `patterns` | `pattern` | `color` | namespaced pattern and colour identifiers, with numeric colours still accepted |

Readers accept the legacy and current spellings. Writers emit the current Worldlens
schema and preserve opaque values that the current build cannot interpret. The fixture
metadata in `design/packages/engine/test/fixtures/banner/banner-patterns.json` records
the supported eras and the identifier form for each one; it is the source of truth for
fixture coverage rather than a second parser implementation.

## Pattern identifiers

Legacy compact identifiers are mapped to their current Minecraft resource identifiers
for rendering. Examples include `bs` → `minecraft:stripe_bottom`, `cre` →
`minecraft:creeper`, `flo` → `minecraft:flower`, `glb` → `minecraft:globe`, `moj` →
`minecraft:mojang`, `pig` → `minecraft:piglin`, and `tts` →
`minecraft:triangles_top`. Current namespaced identifiers are retained as supplied.

The typed model includes the complete known pattern table, including base, border,
bricks, circle, creeper, cross, curly border, diagonal variants, flower, globe, gradient
variants, horizontal and vertical halves, Mojang, piglin, rhombus, skull, small stripes,
the four corner squares, the stripe variants, and the triangle variants. An identifier
not in that table is still a valid opaque `BannerPatternId` for preservation. It is
addressed under its own namespace and value when a render layer is built; it is never
silently replaced with `minecraft:base` or a missing-texture guess.

## All sixteen colours

The legacy numeric ids remain the on-disk representation. The current namespaced names
are accepted as well, and both forms map to the same render tint when known.

| Id | Current identifier | Tint role |
| ---: | --- | --- |
| 0 | `minecraft:white` | white |
| 1 | `minecraft:orange` | orange |
| 2 | `minecraft:magenta` | magenta |
| 3 | `minecraft:light_blue` | light blue |
| 4 | `minecraft:yellow` | yellow |
| 5 | `minecraft:lime` | lime |
| 6 | `minecraft:pink` | pink |
| 7 | `minecraft:gray` | gray |
| 8 | `minecraft:light_gray` | light gray |
| 9 | `minecraft:cyan` | cyan |
| 10 | `minecraft:purple` | purple |
| 11 | `minecraft:blue` | blue |
| 12 | `minecraft:brown` | brown |
| 13 | `minecraft:green` | green |
| 14 | `minecraft:red` | red |
| 15 | `minecraft:black` | black |

The reader accepts an NBT `INT` for a numeric colour and an NBT `STRING` for a
namespaced or opaque colour. Numeric values outside 0–15 and strings not present in the
known table are retained as `UnknownBannerColor` or `UnknownBannerColorIdentifier`.
Unknown colour data gets a neutral render tint `[1, 1, 1]` while its original value
remains available for round-trip export.

## Malformed layers and diagnostics

Banner layers use the existing `LenientListAdapter`, the same per-element recovery
shape used by the upstream NBT implementation. Each list element is consumed fully
before it is parsed. When a wrong-tag element raises the adapter's recoverable
`IOException`, the adapter records one bounded fixed diagnostic, drops only that
element, and continues with later layers. A bad element therefore cannot shift the
order of valid entries. Reader state errors still propagate; leniency is limited to an
individual element parse failure.

Diagnostic history is capped at 32 messages. When the cap is reached, the oldest entry
is evicted as the next one is recorded. Each diagnostic is fixed, payload-free text: it
does not include the layer payload, layer index, or parser reason, and it does not expose
credentials or unrelated local data. Missing optional `Pattern` and `Color` fields keep
the historical defaults `b` and `0`; that defaulting is a compatibility boundary, not
malformed-layer recovery. Only a wrong-tag `IOException` layer is skipped and followed
by the remaining valid list. The missing-field defaults still need explicit executable
coverage in the remaining acceptance work.

## Render resource and tint behavior

`bannerRenderLayers` maps each retained ordered layer to a resource path of the form
`<namespace>:entity/banner/<value>`. The base pattern uses `banner_base`; other known
patterns use their resource value. The layer also carries the original typed pattern and
colour, so rendering does not destroy round-trip information.

Known colours receive the fixed Minecraft banner tint table. Unknown colours use the
neutral tint described above. Unknown patterns remain addressable through their supplied
namespace and value, allowing a resource pack or a later build to provide the texture
without rewriting the source entity. Resource lookup is cached by the resource-path
object; the compatibility adapter does not fetch a remote asset or invent one.

The current source still has a renderer seam that is not acceptance evidence:
`bannerRenderLayers` derives each layer's resource path, but
`BlockStateModelRenderer.renderBanner` currently requests the shared
`minecraft:block/white_banner` material for every layer rather than registering or looking
up `layer.texture`. `bannerLayerImage` is a deterministic fixture/test helper; it is not
connected to the `TextureGallery` used by the packaged renderer. Until that seam is
corrected and read back from a real packaged render, a source-level tint assertion or the
patterned-banner oracle shape alone cannot prove pattern-specific textures, layer order, or
colours in the viewer.

## Round-trip and evidence boundary

The focused fixture/test contract covers:

- ordered layers across legacy and current field names;
- all sixteen numeric dye ids and all sixteen current colour identifiers;
- compact and namespaced pattern ids;
- wrong-tag malformed-layer recovery and the 32-message fixed-diagnostic bound;
- preservation of unknown future pattern and colour values through decode/encode;
- resource-path and tint resolution for known layers and neutral handling for unknowns.

The current source pass does not claim the remaining real-world evidence. The following
must be run against a terminal, exact release before Issue #89 can close:

1. decode/encode round trips using representative NBT from every supported era;
2. resource and tint lookup compared with the upstream oracle;
3. a real world containing patterned banners rendered in the oracle and the packaged
   viewer, with layer order and colours inspected in the built artifact;
4. packaged-artifact verification after restart/reopen, including the malformed-layer
   fixed-diagnostic path and the historical missing-field defaults.

No source fixture, unit result, or renderer model is a substitute for that packaged
evidence. Until those runs are read back from the exact release commit, this issue stays
open.

## References

- [`BannerBlockEntity.ts`](../../design/packages/engine/src/world/mca/blockentity/BannerBlockEntity.ts)
- [`banner-patterns.test.ts`](../../design/packages/engine/test/banner-patterns.test.ts)
- [`banner-patterns.json`](../../design/packages/engine/test/fixtures/banner/banner-patterns.json)
- [`LenientListAdapter.ts`](../../design/packages/nbt/src/adapters/LenientListAdapter.ts)
- [`migration-guide.md`](./migration-guide.md)

### 廣東話

Banner 嘅 layer 係有次序嘅，舊版用大寫 `Patterns`、`Pattern`、`Color`，新版 component
可以用細寫 `patterns`、`pattern`、`color`。十六隻 dye colour 會逐隻對返，唔識嘅未來
pattern 或 colour 就原封不動留低；wrong-tag 嘅壞 layer 只會跳過嗰層，後面好嘅繼續行，
diagnostic 係固定而唔帶 payload，最多留三十二條；冇填 `Pattern` 或 `Color` 就保留歷史
預設 `b` 同 `0`，唔可以當成 malformed skip。真正世界、upstream oracle 同 packaged viewer 嘅啱層啱色證明仲未跑，
所以 issue 未可以關，唔可以攞一張普通白旗相扮晒驗收。

今次 acceptance audit 仲搵到一個 renderer seam：`bannerRenderLayers` 會計出每層
pattern-specific resource path，但 `BlockStateModelRenderer.renderBanner` 依家每層都攞
共用嘅 `minecraft:block/white_banner` material，未有將 `layer.texture` 接入
`TextureGallery`。`bannerLayerImage` 只係 deterministic fixture/test helper，唔係
packaged renderer 真正用緊嘅路。未修好呢條 seam，亦未喺真 packaged render 讀返結果之前，
source tint assertion 或 patterned-banner oracle shape 都唔可以當成 viewer 嘅啱 texture、
layer 次序同顏色證明。
