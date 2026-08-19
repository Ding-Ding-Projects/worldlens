# Banner pattern compatibility

This document defines the public compatibility contract for typed banner pattern
data. It is the documentation boundary for issue #89; it does not claim that the
runtime implementation, fixtures, or rendered-artifact proof are complete.

## Data model

A banner's `Patterns` list is an ordered list of layers. The typed model must keep
that order and must not collapse the list into a map, set, or color-only summary.
Each accepted layer has two independently typed values:

```text
BannerLayer {
    pattern: BannerPatternId
    color: BannerColor
}
```

`BannerPatternId` and `BannerColor` have two forms:

- a known value resolved by the Minecraft-era compatibility table; or
- an opaque, validated unknown identifier retained exactly for a later reader or
  writer.

Unknown values are data, not permission to guess. A renderer may omit a layer it
cannot draw, but decoding must preserve the banner entity and the layer's position.
Writing a value that was not understood is allowed only when the writer can retain
its original identifier without changing it.

## Supported eras and names

The compatibility adapter selects its vocabulary from the era of the source data;
it must not apply a modern rename table to a legacy record merely because both
records use the same JavaScript object shape.

| Source representation | Pattern names | Color names/values | Required handling |
| --- | --- | --- | --- |
| Legacy banner NBT | Compact legacy pattern identifiers such as `b`, `ts`, `ls`, `rs`, and the other identifiers defined by the legacy table | The legacy dye metadata ordinals `0` through `15`, mapped in the fixed Minecraft order (`white`, `orange`, `magenta`, `light_blue`, `yellow`, `lime`, `pink`, `gray`, `light_gray`, `cyan`, `purple`, `blue`, `brown`, `green`, `red`, `black`) | Decode through the legacy table; preserve list order and retain the original token for round-trip writing |
| Current banner NBT/components | Current canonical pattern identifiers, including namespaced identifiers where the era supplies them | Current canonical color identifiers or the current numeric form documented by that era's adapter | Resolve current names without treating a legacy alias as a different layer; preserve an unknown but syntactically valid identifier |
| Future or newer-than-known data | Any identifier not present in the current compatibility table | Any identifier not present in the current color table | Keep it as an opaque unknown token when it passes the lexical boundary; do not silently map it to a known pattern or color |

The table is deliberately era-scoped. A name is recognized because the selected
adapter says it is valid for that era, not because a string happens to resemble a
known value in another era. Legacy aliases and current names must be represented as
aliases of the same typed concept only where the compatibility table explicitly
states that relationship.

## Exact acceptance boundary

The reader accepts one layer only when all of the following are true:

1. The list item is an NBT compound/object.
2. The compound contains both `Pattern` and `Color` values in the representation
   supported by the selected era adapter.
3. `Pattern` is a non-empty string identifier with no control characters, no NUL,
   no surrounding whitespace, and a bounded length. A known identifier is resolved
   through the era table. An unknown identifier is retained only when it passes this
   same identifier grammar.
4. `Color` is either a known era-supported color token or an integer dye ordinal in
   the era-supported range. Numeric strings, fractional numbers, negative values,
   values above the supported range, and arbitrary objects are not color tokens.
5. No conversion, default, or trimming is needed to make the pair valid. The
   original token is retained alongside the typed value whenever a round trip needs
   the original spelling.

An item that fails any one of these conditions is a malformed layer. The reader
must skip that layer, record a bounded diagnostic, and continue decoding the rest
of the banner entity. It must not invent a default pattern, reinterpret a malformed
color as white, reorder surviving layers, or discard the whole block entity merely
because one list item is bad. A malformed entry is therefore different from an
unknown future identifier: the former is rejected at the boundary; the latter is
accepted as opaque data when its identifier syntax is valid.

The acceptance boundary applies independently to every ordered layer. A banner with
five valid layers and one malformed layer retains the five valid layers in their
original relative order. A banner with an unknown-but-valid pattern retains that
layer in place, even if the current renderer cannot resolve its texture or geometry.

## Read, render, and write behavior

- **Read:** select the era adapter, validate each compound, type known values, and
  retain valid unknown identifiers without mutating unrelated block-entity fields.
- **Render:** draw known layers in list order. Report an unknown layer as an
  unsupported layer and leave it in decoded data; do not substitute a solid color or
  move later layers forward in a way that changes their order.
- **Write:** emit the era-specific field names and token representation. Known
  aliases are written using the target era's canonical spelling. Unknown values are
  written only when their original identifier remains valid for the target format;
  otherwise the writer must report the loss rather than silently changing the data.
- **Failure:** malformed entries produce a localized, non-fatal diagnostic at the
  owning surface. The diagnostic identifies the entry position and failure class,
  not a guessed replacement.

## Required compatibility evidence

Issue #89 is not complete until the implementation and its evidence cover:

- every supported color value and multiple ordered layers;
- legacy and current pattern/color representations, including renamed aliases;
- unknown future pattern and color identifiers that pass the lexical boundary;
- malformed compounds, missing fields, wrong NBT types, invalid numeric ranges,
  control characters, empty identifiers, and overlong identifiers;
- decode/write round trips that prove order, known values, and opaque unknown tokens
  are preserved;
- resource or renderer lookups for known layers; and
- a real patterned-banner world rendered through the supported artifact path, with
  layer order and colors visibly correct.

The compatibility article remains a contract and an acceptance checklist until
those proofs are linked from the issue handoff. It must not be updated to say
“implemented” on the strength of a type declaration, a fixture filename, or a
source-only test.

## Artifact-proof ledger (2026-08-19)

The typed implementation and focused fixture proof are now recorded separately
from the artifact proof:

| Proof item | Current record | State |
| --- | --- | --- |
| Typed ordered layers and era aliases | `47c3f8a5237f9f5f68c3aea63e92bc6cf13c4c1b` | landed |
| Executable legacy/current fixture and round-trip checks | `d14203e7e40a2ae4851b8bfe3476450609451570`, five focused tests | verified for the focused fixture |
| Real patterned-banner world generated from the supported world path | no run record for a world containing at least two patterned banners | unrun |
| Oracle render with visible layer order and colors | no output manifest or explicit layer-order/color assertions | unrun |
| Packaged viewer opening the same rendered world | no packaged-artifact identity or same-world read-back record | unrun |

The last three rows are deliberately not inferred from the source test or from
the existing generic world captures. Closure requires one reproducible world
identifier containing at least two patterned banners, the exact generation and
render commands, an oracle output manifest with explicit layer-order and color
assertions, the packaged viewer build and artifact identity, and a same-world
read-back record showing that the packaged viewer opened that exact patterned-
banner output. Until those records are attached to the issue
handoff, this article and the roadmap must continue to describe issue #89 as
open.

## 廣東話

### 資料模型

一個 banner 嘅 `Patterns` list 係按次序排好嘅 layer 清單。Typed model 要
守住呢個次序，唔可以偷懶將佢壓扁做 map、set，或者淨係剩低顏色摘要。每一層
都有兩個各自 typed 嘅值：

```text
BannerLayer {
    pattern: BannerPatternId
    color: BannerColor
}
```

`BannerPatternId` 同 `BannerColor` 各有兩種形態：

- 由 Minecraft-era compatibility table 認得嘅 known value；或者
- 通過驗證、保持原樣嘅 opaque unknown identifier，留俾將來嘅 reader 或
  writer 再處理。

Unknown value 係資料，唔係叫人亂估嘅邀請卡。Renderer 畫唔到某層可以唔畫，
但 decode 必須保留成個 banner entity 同嗰層原本嘅位置。Writer 只有喺可以
原封不動保留 identifier、唔改佢內容嘅時候，先可以寫返一個未理解嘅值。

### 支援嘅年代同名稱

Compatibility adapter 要按 source data 嘅年代揀 vocabulary；唔可以因為兩份
資料啱啱好用同一款 JavaScript object shape，就將 modern rename table 硬塞落
legacy record 度，扮大家係同一代人。

| Source representation | Pattern names | Color names/values | Required handling |
| --- | --- | --- | --- |
| Legacy banner NBT | Compact legacy pattern identifiers，例如 `b`、`ts`、`ls`、`rs`，以及 legacy table 定義嘅其他 identifiers | Legacy dye metadata ordinal `0` 至 `15`，按固定 Minecraft 次序對應 (`white`、`orange`、`magenta`、`light_blue`、`yellow`、`lime`、`pink`、`gray`、`light_gray`、`cyan`、`purple`、`blue`、`brown`、`green`、`red`、`black`) | 經 legacy table decode；保留 list 次序，同時留住原 token，方便 round-trip 寫返去 |
| Current banner NBT/components | 當代 canonical pattern identifiers，包括嗰個年代提供嘅 namespaced identifiers | 當代 canonical color identifiers，或者該年代 adapter 記錄嘅 current numeric form | 按 current name resolve；legacy alias 唔可以無端端變成另一層；語法啱嘅 unknown identifier 要保留 |
| Future or newer-than-known data | Current compatibility table 未有嘅任何 identifier | Current color table 未有嘅任何 identifier | 通過 lexical boundary 就當 opaque unknown token 留住；唔好靜雞雞映射成已知 pattern 或 color |

呢張表係按年代分區嘅。名稱之所以 recognized，係因為揀中嘅 adapter 話佢喺嗰個
年代有效，唔係因為條 string 似某個其他年代嘅 known value。Legacy alias 同
current name 只有喺 compatibility table 明確講係同一個 typed concept 嘅 alias，
先可以咁樣表示。

### 精確接受邊界

Reader 只會喺以下條件全部成立時接受一層，唔會見到半桶水資料就幫佢補妝：

1. List item 係 NBT compound/object。
2. Compound 同時有 `Pattern` 同 `Color`，而且格式係所揀 era adapter 支援嘅。
3. `Pattern` 係非空 string identifier：唔可以有 control character、NUL、
   頭尾空白，亦要符合 bounded length。Known identifier 經 era table resolve；
   unknown identifier 只有通過同一套 identifier grammar 先會保留。
4. `Color` 係 era 支援嘅 known color token，或者係該年代支援範圍內嘅 integer
   dye ordinal。Numeric string、小數、負數、超出範圍嘅數字同任意 object，全部
   唔係 color token。
5. 唔需要 conversion、default 或 trimming 先至令 pair 有效。需要 round trip
   時，original token 要同 typed value 一齊留低，唔好洗走原本拼法。

任何一項唔合格，就係 malformed layer。Reader 要 skip 嗰層、記一個有界 diagnostic，
再繼續 decode 同一個 banner entity 其餘部分。唔可以自動送 pattern、將壞 color
變白、打亂仲生還嘅 layers，亦唔可以因為一個 list item 壞咗就成個 block entity
抬走。即係話，malformed entry 係喺門口被拒嘅；unknown future identifier 如果
syntax 合法，反而係可以入場、但要戴住 opaque 名牌嘅資料。

Acceptance boundary 要逐層獨立執行。一個五層有效、加一層 malformed 嘅 banner，
要保留五層，而且維持佢哋原本嘅 relative order。一個 unknown-but-valid pattern
亦要留喺原位，即使 current renderer 暫時畫唔出佢嘅 texture 或 geometry。

### Read、render 同 write 行為

- **Read：** 揀 era adapter，逐個 compound 驗證，將 known values typed 化，並且
  保留有效 unknown identifiers；無關嘅 block-entity fields 唔好亂郁。
- **Render：** 按 list order 畫 known layers。Unknown layer 要報 unsupported layer，
  但仍然留喺 decoded data；唔好換成 solid color，亦唔好將後面 layers 偷偷推前，
  令次序走樣。
- **Write：** 輸出該年代嘅 field names 同 token representation。Known alias 用 target
  era 嘅 canonical spelling 寫出；unknown value 只有喺原 identifier 對 target format
  仍然有效時先可以寫，否則要明講 loss，唔好偷偷改名扮成功。
- **Failure：** Malformed entry 要喺所屬 surface 出 localized、non-fatal diagnostic。
  Diagnostic 要講 entry position 同 failure class，唔好幫資料作一個「大概係咁」嘅
  replacement。

### 必須有嘅 compatibility 證明

Issue #89 要到 implementation 同 evidence 一齊齊先算完成，證明清單包括：

- 每個 supported color value 同多層、有次序嘅 layers；
- legacy 同 current pattern/color representations，包括 renamed aliases；
- 通過 lexical boundary 嘅 unknown future pattern 同 color identifiers；
- malformed compounds、缺欄位、錯 NBT types、無效 numeric ranges、control
  characters、空 identifier 同過長 identifier；
- decode/write round trip，證明 order、known values 同 opaque unknown tokens 都原樣
  保留；
- known layers 嘅 resource 或 renderer lookups；以及
- 一個真實 patterned-banner world，經 supported artifact path render，畫面要睇得出
  layer order 同 colors 都正確。

所以而家呢篇 compatibility article 仍然係 contract 同 acceptance checklist，直到
issue handoff 真正連上以上證明之前，都唔可以因為見到 type declaration、fixture filename，
或者淨係 source-only test，就寫成「implemented」。未有證據就話搞掂，係 banner 自己
未出場，documentation 先戴咗冠冕。

## Related records

- [Porting conventions](./porting-conventions.md) defines the strict typed-port rule.
- [Intentional deviations](./deviations.md) records behavior that intentionally
  differs from upstream.
- [Roadmap](../ROADMAP.md) records issue #89 as pending until the evidence above
  exists.
