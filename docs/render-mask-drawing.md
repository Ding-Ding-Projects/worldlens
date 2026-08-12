# Drawing a render mask

`render-mask` decides which part of a world BlueMap actually renders. It used to be configured
entirely by typing block coordinates into numeric fields
(`design/packages/ui/src/components/config/ConfigMaskField.vue`) — a control nobody can use
without already knowing the exact X/Y/Z of the area they care about. This document covers both
halves now: the **value layer** underneath a drawing surface (the two-way-bound numbers, the
honest cost estimate, the engine-fidelity check, and export/import) and the drawing surface
itself, `design/packages/ui/src/components/config/MaskDrawingCanvas.vue`, an SVG canvas with
draggable handles, snap-to-chunk/region, undo/redo, zoom, presets and a keyboard-operable
equivalent for every gesture. The canvas is framed by the selected dimension's measured region
bounds and, for the overworld, the real spawn read from `level.dat`.

## Behaviour

### The mask stays what the config schema already defines

Nothing here invents a new mask representation. `@worldlens/config`'s `MaskConfig` union
— `box` / `circle` / `ellipse` / `polygon` / `blur`, each optionally `subtract`, combined as an
ordered list — is the single source of truth, exactly as `docs/config-history.md` describes for
every other config value. A drawing surface produces the same `Record<string, PlainValue>` shape
`ConfigMaskField.vue`'s own `v-model` already speaks.

### Two-way binding: neither the numbers nor the drawing is the master

`design/packages/ui/src/components/config/maskDraft.ts` holds one shape's numeric fields and its
drawn geometry as one synchronised value, on the same discipline this project's regex builder
already uses for pattern and flags:

- **Typing** a coordinate calls `setFieldText`. A value that parses cleanly commits immediately
  and the drawing can move. A value that does not — `""`, `"-"`, `"12x"`, mid-edit — updates only
  the displayed text and reports why in `error`; the committed number, and therefore the drawn
  shape, is left exactly where it was. A stray keystroke never snaps a shape somewhere absurd.
- **Dragging** a handle on a canvas calls `setFieldNumber`. It always produces a valid value —
  an integer field is rounded to the nearest whole block, the same rounding a typed fractional
  value already gets truncated to, so the two input paths never quietly disagree about where the
  block boundary is.
- **`draftToRecord`** is the only place the two are reconciled back into the plain record the
  config editor saves: it always reads the committed number, never the currently displayed text,
  so a field mid-invalid-edit still saves and draws using the last value that was genuinely
  valid. Non-numeric parts of a shape's record — a polygon's own point list, a blur's nested mask
  list — pass through untouched; this module only owns the numeric fields.

### What it costs, honestly

`design/packages/ui/src/components/config/maskGeometry.ts` turns a mask list into an area figure
in blocks, chunks (16×16 blocks) and regions (512×512 blocks — 32×32 chunks, Minecraft's own
anvil region size), plus the X/Z extent a drawing surface should frame the world in.

The estimate is honest rather than invented wherever exactness would be expensive:

| Situation | What is reported |
|---|---|
| No shapes at all | `whole-world`: the whole world renders, no number to give |
| Exactly one additive, fully bounded shape | `exact`: the real analytic area (box: product of the ranges; circle/ellipse: πr²/πr₁r₂; polygon: the shoelace formula) |
| More than one additive shape, or any `subtract` shape | `upper-bound`: the **sum** of the additive shapes' own footprints. Real overlap or subtraction only ever makes the true rendered area *smaller*, so this bound never understates the real cost |
| Any additive shape unbounded on an axis | `unbounded`: no number at all, rather than a guess |

A combined mask's *exact* rendered area depends on where shapes overlap and what they subtract —
recomputing that precisely means testing every block, which is most of a render, not an estimate
of one. `MaskCostEstimate.exact` says which case applied, so a caller renders "≈" rather than
presenting an upper bound as a fact.

### Getting the drawn mask to every engine intact

`render-mask` reaches the actual render engine through two genuinely different routes, and they
now honour the same semantics:

- **The local desktop render** runs the real upstream BlueMap jar in a real JVM
  (`design/packages/app/src/main/render/orchestrator.ts`), which deserialises `render-mask`
  through the real `CombinedMaskSerializer` — every shape, `subtract`, any number of them, in
  full. Whatever was drawn is exactly what renders.
- **The standalone CLI and cloud/Actions render** use the TypeScript port in
  `design/packages/cli/src/maps.ts`. `createMaskFromConfig`, `combinedMaskFromConfig` and
  `maskFor` construct boxes, circles, ellipses, polygons and recursively nested blur masks,
  preserve list order and subtraction, and match upstream when the first shape subtracts or the
  list is empty. Invalid shapes fail with the schema/upstream-compatible reason instead of
  falling back to an unmasked render.

Actions receives the same config rather than a hand-picked subset. The uploaded project archive
already contains `worldlens.project.json`; `design/packages/render-actions` reads the
selected map's full HOCON from it and writes that configuration into every render job. A shard
adds its boundary as outside-subtraction boxes with HOCON `render-mask +=`, so the shard boundary
intersects any user-authored mask instead of replacing it. The desktop editor therefore reports
**exact local and Actions semantics** for every mask list; the former one-box warning has been
removed rather than left behind as a stale alarm.

### Export and import

`design/packages/ui/src/components/config/maskFile.ts` writes a mask list as a small,
self-describing JSON document rather than requiring hand-copied HOCON:

```json
{
    "format": "worldlens.render-mask",
    "version": 1,
    "units": "blocks",
    "coordinateSystem": "minecraft-world-xyz",
    "exportedAt": "2026-08-05T00:00:00.000Z",
    "masks": [ /* the same MaskConfig[] the schema already validates */ ]
}
```

Units and the coordinate convention are stated in the file itself, not assumed — a reader who has
never seen this app's source still knows what the numbers mean. `parseMaskFile` never throws: a
file that is not JSON, not this format, from a newer version this build does not understand, or
holding a shape `combinedMaskSchema` refuses comes back as `{ ok: false, reason }` naming exactly
what was wrong, so an import failure is reported inline rather than silently importing nothing.
The round trip is exact — export then import reproduces the identical mask list, shape order,
`subtract` flags and all.

### Local version history — inherited, not reimplemented

A drawn mask needs no new history plumbing. It lives in the map's own `maps/<id>.conf` under
`render-mask`, exactly like every other map setting, so it is already covered by the config-folder
history `docs/config-history.md` describes in full: `ConfigScreen.vue` snapshots the folder after
every save, a restore snapshots the current disk state first and then writes the old files back as
a **new** revision — never a rewrite — and a failed history write never fails the save it was
recording. Saving a mask you just drew is a save like any other.

### World-aware framing and direct discovery

The value layer, cost estimate, export/import and drawing canvas are built, wired together and voiced
in the copy catalogue (`design/packages/ui/src/copy/surfaces/maskDraw.ts` is spread into
`SURFACE_VOICED`/`SURFACE_FIXED`/`SURFACE_FACTS` in `copy/surfaces/index.ts`, exactly like every
other finished surface). Main-process world inspection derives an inclusive block extent from
each real `r.<x>.<z>.mca` filename without opening region files and reads `SpawnX`/`SpawnZ` from
`level.dat`. `maskWorldFor` selects the chosen dimension's extent and exposes spawn only for
`minecraft:overworld`; missing or unreadable measurements remain named unavailable states. The
wizard, options editor and project editor all pass that context into `ConfigMaskField.vue`.

The command palette has a dedicated **Render mask editor** destination. It carries
`{ screen: "maps", fieldPath: "render-mask" }` through the shell, selects the first real map,
reveals the field and focuses its editor. It is an exact route, not a link that stops at Maps.

`maskDraft.ts`, `maskGeometry.ts`, `maskFile.ts` and `maskFidelity.ts` are the seam a canvas
component binds to: call `createShapeDraft`/`setFieldText`/`setFieldNumber` for the synchronised
value, `estimateRenderCost` for the live cost readout, `checkCloudFidelity` for the explicit
cross-route parity contract, and `exportMaskFile`/`parseMaskFile` for the share/reuse file.

## Failure modes

- **A field mid-invalid-edit never moves the drawing or the saved value.** `draftToRecord` reads
  only committed numbers.
- **An unbounded shape reports no cost number, never an invented one.** `estimateRenderCost`
  returns `basis: "unbounded"` with `areaBlocks: null` rather than treating Java's
  `Integer.MAX_VALUE` sentinel as a real coordinate.
- **An invalid mask never becomes an unmasked render.** Schema and construction failures retain
  their named reason; every valid shape and ordered/subtracted combination is translated exactly.
- **Missing world measurements never become guessed coordinates.** The canvas names the missing
  extent or spawn and keeps its honest unknown-world framing.
- **A malformed or newer-format mask file is refused with a reason, not silently emptied.**
  `parseMaskFile` never throws and never returns an empty mask for a file that failed to parse.
- **A history write that fails never fails the save.** Inherited unchanged from
  `docs/config-history.md`.

## Security considerations

A mask file is not sensitive on its own — it holds only block coordinates and shape geometry, no
credentials or paths — so export/import needs no special handling beyond the schema validation
`parseMaskFile` already applies before anything reaches `combinedMaskSchema`, the same guard the
config editor already trusts for every other value read from a file.

## Verification

- `design/packages/ui/src/components/config/maskGeometry.test.ts` — bounds, per-shape footprint
  area (box, circle, ellipse, polygon via the shoelace formula, a nested blur), and
  `estimateRenderCost`'s four bases, including that an upper bound for overlapping shapes never
  understates the true combined area.
- `design/packages/ui/src/components/config/maskDraft.test.ts` — typing and dragging never
  clobber each other or an unrelated field, invalid and partial text is reported without being
  discarded, integer rounding agrees between the two input paths, and `draftToRecord` always
  reads the committed value.
- `design/packages/ui/src/components/config/maskFile.test.ts` — export/import round-trips a
  single shape, multiple shapes with a subtract polygon, and an empty (whole-world) mask exactly;
  a non-JSON file, a wrong format, a future version, and an invalid shape are each refused with a
  named reason.
- `design/packages/cli/src/maps.mask.test.ts` — exact box/circle/ellipse/polygon/blur construction,
  recursive nesting, ordering, subtraction, first-subtraction and invalid-input behaviour.
- `design/packages/render-actions/src/config/projectMapConfig.test.ts` and `renderConfig.test.ts` — full
  selected-map config transport from the project archive and additive shard boundaries that do
  not replace an existing arbitrary mask.
- `design/packages/app/src/main/world/levelDat.test.ts` and `inspect.test.ts` — exact spawn reads and
  inclusive block extents derived from region filenames without reading region contents.
- `design/packages/ui/src/components/config/maskWorld.test.ts`, `paletteCatalog.test.ts` and
  `App.test.ts` — selected-dimension context, overworld-only spawn and the structured palette
  target reaching the exact editor field.
- `design/packages/ui/src/copy/surfaces/maskDraw.test.ts` — the catalogue's own shape (five
  levels, both languages, no em dashes), that level 1 and level 5 genuinely read differently, and
  that every pinned fact survives every funny level in both languages; palette copy separately
  pins the exact local/Actions parity and teleport destination.

## Suggested next

- [Local version history for config folders](./config-history.md) — the history a saved mask
  already inherits.
- [The regex builder and the search bars it reaches](./regex-builder.md) — the search-bar pattern
  a mask list's own search bar should follow once the drawing surface's shape list needs one.
- [Language modes and funny levels](./language-and-tone.md) — the voice/facts split
  `maskDraw.ts`'s catalogue follows.

## 廣東話

### 畫一個 render mask（Drawing a render mask）

`render-mask` 決定 BlueMap 實際 render 世界嘅邊一部分。以前佢完全靠喺數字欄位度打 block 座標嚟設定（`design/packages/ui/src/components/config/ConfigMaskField.vue`）—— 呢種控制項，如果你唔係已經知道你關心嗰個區域嘅準確 X/Y/Z，根本用唔到。呢份文件而家講埋兩半：畫圖介面底下嘅**數值層**（雙向綁定嘅數字、誠實嘅成本估算、引擎一致性檢查，同埋匯出／匯入），同埋畫圖介面本身 `design/packages/ui/src/components/config/MaskDrawingCanvas.vue` —— 一個 SVG canvas，有得拉嘅 handle、snap 到 chunk／region、undo/redo、zoom、preset，而且每一個手勢都有一個純鍵盤操作嘅等效做法。個 canvas 嘅取景範圍係按所選 dimension 實測出嚟嘅 region 邊界，而 overworld 就仲會用埋由 `level.dat` 讀返嚟嘅真實 spawn。

### 行為

#### Mask 仍然係 config schema 本來定義嗰個

呢度冇發明任何新嘅 mask 表示法。`@worldlens/config` 嘅 `MaskConfig` union —— `box` / `circle` / `ellipse` / `polygon` / `blur`，每個都可以加 `subtract`，以一個有序清單組合埋 —— 就係唯一嘅 source of truth，同 `docs/config-history.md` 對其他每一個 config 值嘅描述完全一樣。畫圖介面產生嘅，就係 `ConfigMaskField.vue` 自己個 `v-model` 本身講緊嗰個 `Record<string, PlainValue>` 形狀。

#### 雙向綁定：數字同畫圖邊個都唔係主人

`design/packages/ui/src/components/config/maskDraft.ts` 將一個形狀嘅數字欄位同佢畫出嚟嘅幾何當成一個同步嘅值嚟揸，用嘅係呢個 project 個 regex builder 對 pattern 同 flags 已經用緊嘅同一套紀律：

- **打字** 入一個座標會叫 `setFieldText`。一個 parse 得乾淨嘅值即刻 commit，個圖形就可以郁。Parse 唔到嘅 —— `""`、`"-"`、`"12x"`、打到一半 —— 就淨係更新顯示嘅文字，並喺 `error` 度講明點解；已 commit 嘅數字、因而畫出嚟嗰個形狀，會原封不動留喺原位。撳錯一個掣永遠都唔會令個形狀彈去一個荒謬嘅位。
- **拖** canvas 上面一個 handle 會叫 `setFieldNumber`。佢一定產生有效值 —— 整數欄位會四捨五入到最近嘅整格 block，同一個打字入去嘅小數值本來被截到嘅結果一致，所以兩條輸入路徑永遠唔會靜靜雞對 block 邊界喺邊有分歧。
- **`draftToRecord`** 係唯一將兩者調和返做 config 編輯器儲存嗰個 plain record 嘅地方：佢永遠讀已 commit 嘅數字，唔會讀當前顯示嘅文字，所以一個改到一半、內容無效嘅欄位，一樣會用最後一個真正有效嘅值嚟儲存同繪畫。形狀 record 入面非數字嘅部分 —— polygon 自己嗰個點清單、blur 嘅巢狀 mask 清單 —— 原封不動咁過；呢個模組淨係擁有啲數字欄位。

#### 佢要幾多錢，講真話

`design/packages/ui/src/components/config/maskGeometry.ts` 將一個 mask 清單變成以 block、chunk（16×16 block）同 region（512×512 block，即 32×32 chunk，Minecraft 自己嘅 anvil region 大細）計嘅面積數字，加埋畫圖介面應該用嚟框住個世界嘅 X/Z 範圍。

凡係要做到絕對準確會好貴嘅地方，估算都選擇誠實而唔係作數：完全冇形狀嗰陣報 `whole-world`，即係成個世界都 render，冇數字可以畀；剛剛好一個加法、而且各軸都有界嘅形狀就報 `exact`，即真正嘅解析面積（box 係各範圍嘅乘積；circle/ellipse 係 πr² 或者 πr₁r₂；polygon 用鞋帶公式）；多過一個加法形狀、或者有任何 `subtract` 形狀，就報 `upper-bound`，即各個加法形狀自身佔地面積嘅**總和** —— 真正嘅重疊或者相減只會令實際 render 面積*更細*，所以呢個上界永遠唔會低估真實成本；任何加法形狀喺某條軸上無界，就報 `unbounded`，完全唔畀數字，唔靠估。

一個組合 mask 嘅*準確* render 面積取決於啲形狀喺邊度重疊、又減走咗啲乜 —— 要準確重算即係要逐個 block 測試，咁樣已經係做咗大半個 render，唔係估算一個 render。`MaskCostEstimate.exact` 會講明用咗邊個情況，咁 caller 就會顯示「≈」，而唔會將一個上界當成事實咁擺出嚟。

#### 令畫咗嘅 mask 完好無缺咁去到每個引擎

`render-mask` 經兩條真係唔同嘅路去到實際嘅 render 引擎，而佢哋而家遵守同一套語意：

- **本機桌面 render** 喺真 JVM 度行真正嘅上游 BlueMap jar（`design/packages/app/src/main/render/orchestrator.ts`），佢透過真正嘅 `CombinedMaskSerializer` 反序列化 `render-mask` —— 每個形狀、`subtract`、任意數量，全部完整支援。畫咗乜就 render 乜。
- **獨立 CLI 同 cloud/Actions render** 用嘅係 `design/packages/cli/src/maps.ts` 入面嘅 TypeScript port。`createMaskFromConfig`、`combinedMaskFromConfig` 同 `maskFor` 會構造 box、circle、ellipse、polygon 同遞迴巢狀嘅 blur mask，保留清單次序同相減，而且喺第一個形狀就係相減、或者清單係空嘅情況下同上游一致。無效形狀會帶住 schema／上游相容嘅原因失敗，而唔會退返做一個冇 mask 嘅 render。

Actions 收到嘅係同一份 config，唔係一個人手揀嘅子集。上傳嘅 project archive 本身已經有 `worldlens.project.json`；`design/packages/render-actions` 由入面讀出所選地圖嘅完整 HOCON，再將嗰份設定寫入每一個 render job。一個 shard 會用 HOCON `render-mask +=` 將自己嘅邊界當成「外部相減」box 加落去，所以 shard 邊界係同用戶自己寫嘅 mask 相交，而唔係取代佢。所以桌面編輯器對每一個 mask 清單都報 **本機同 Actions 語意皆準確**；以前嗰個「淨係支援一個 box」嘅警告已經移除咗，唔會留低變成一個過時警報。

#### 匯出同匯入

`design/packages/ui/src/components/config/maskFile.ts` 將 mask 清單寫成一份細細嘅、自我描述嘅 JSON 文件，唔使人手抄 HOCON：

```json
{
    "format": "worldlens.render-mask",
    "version": 1,
    "units": "blocks",
    "coordinateSystem": "minecraft-world-xyz",
    "exportedAt": "2026-08-05T00:00:00.000Z",
    "masks": [ /* the same MaskConfig[] the schema already validates */ ]
}
```

單位同座標約定係寫喺個檔案本身度，唔係靠估 —— 一個從來冇睇過呢個 app 源碼嘅讀者，都知道啲數字係咩意思。`parseMaskFile` 永遠唔會 throw：一個唔係 JSON、唔係呢個格式、來自呢個 build 唔識嘅新版本、或者載住一個 `combinedMaskSchema` 唔接受嘅形狀嘅檔案，都會以 `{ ok: false, reason }` 返返嚟並準確講出邊度出錯，所以匯入失敗會就地報出嚟，而唔係靜靜雞乜都冇匯入。往返係精確嘅 —— 匯出再匯入會重現一模一樣嘅 mask 清單、形狀次序、`subtract` 標記，全部齊。

#### 本機版本歷史 —— 繼承返嚟，唔係重新實作

畫咗嘅 mask 唔需要任何新嘅歷史管道。佢住喺地圖自己嗰份 `maps/<id>.conf` 嘅 `render-mask` 底下，同其他每個地圖設定一樣，所以佢已經被 `docs/config-history.md` 完整描述嗰個 config-folder 歷史覆蓋咗：`ConfigScreen.vue` 每次儲存之後為個 folder 影一張快照，而還原嗰陣會先影低當前磁碟狀態，再將舊檔案寫返做一個**新**修訂 —— 永遠唔會覆寫 —— 而且一次失敗嘅歷史寫入永遠唔會令佢正記錄緊嗰次儲存失敗。儲存你啱啱畫好嘅 mask，同任何一次儲存冇分別。

#### 識世界嘅取景，同直接發現途徑

數值層、成本估算、匯出／匯入同繪圖 canvas 都已經建好、駁埋、並喺 copy catalogue 度配咗語調（`design/packages/ui/src/copy/surfaces/maskDraw.ts` 喺 `copy/surfaces/index.ts` 度攤入 `SURFACE_VOICED`/`SURFACE_FIXED`/`SURFACE_FACTS`，同其他每個做完嘅介面一樣）。Main process 嘅世界檢查會由每個真實 `r.<x>.<z>.mca` 檔名推導出一個包含端點嘅 block 範圍，唔使開 region 檔，並且由 `level.dat` 讀 `SpawnX`/`SpawnZ`。`maskWorldFor` 揀所選 dimension 嘅範圍，而 spawn 就淨係為 `minecraft:overworld` 曝露；量度唔到或者讀唔到嘅，會保持做具名嘅「不可用」狀態。Wizard、options 編輯器同 project 編輯器都會將嗰個 context 傳入 `ConfigMaskField.vue`。

Command palette 有一個專屬嘅 **Render mask editor** 目的地。佢會將 `{ screen: "maps", fieldPath: "render-mask" }` 帶過 shell、揀第一幅真實地圖、顯示嗰個欄位並將焦點放喺佢個編輯器度。呢個係一條準確路線，唔係一條去到 Maps 就停低嘅連結。

`maskDraft.ts`、`maskGeometry.ts`、`maskFile.ts` 同 `maskFidelity.ts` 就係一個 canvas 元件綁上去嘅接縫：同步值叫 `createShapeDraft`/`setFieldText`/`setFieldNumber`，即時成本顯示叫 `estimateRenderCost`，明確嘅跨路線對等契約叫 `checkCloudFidelity`，分享／重用檔案就叫 `exportMaskFile`/`parseMaskFile`。

### 失敗模式

- **一個改到一半、內容無效嘅欄位永遠唔會郁到幅圖或者已儲存嘅值。** `draftToRecord` 淨係讀已 commit 嘅數字。
- **無界嘅形狀唔會報成本數字，更加唔會作一個出嚟。** `estimateRenderCost` 會回 `basis: "unbounded"` 同 `areaBlocks: null`，而唔會將 Java 嘅 `Integer.MAX_VALUE` 哨兵值當成真座標。
- **無效嘅 mask 永遠唔會變成一個冇 mask 嘅 render。** Schema 同構造失敗都保留佢哋具名嘅原因；每個有效形狀、每種有序／相減組合都會被準確翻譯。
- **量度唔到嘅世界資料永遠唔會變成估出嚟嘅座標。** Canvas 會講明係邊個範圍或者 spawn 缺失，並保持佢誠實嘅「未知世界」取景。
- **格式錯或者版本更新嘅 mask 檔會帶住原因被拒絕，唔會靜靜雞變空。** `parseMaskFile` 永遠唔會 throw，亦永遠唔會為一個 parse 失敗嘅檔案回一個空 mask。
- **失敗嘅歷史寫入永遠唔會令儲存失敗。** 由 `docs/config-history.md` 原封不動繼承。

### 保安考量

一個 mask 檔本身唔敏感 —— 佢淨係載住 block 座標同形狀幾何，冇憑證亦冇路徑 —— 所以匯出／匯入除咗 `parseMaskFile` 喺任何嘢去到 `combinedMaskSchema` 之前已經套用嘅 schema 驗證之外，唔需要特別處理；呢個守衛就係 config 編輯器對每一個由檔案讀入嘅值一直信賴嗰個。

### 驗證

- `design/packages/ui/src/components/config/maskGeometry.test.ts` —— 邊界、逐個形狀嘅佔地面積（box、circle、ellipse、用鞋帶公式嘅 polygon、一個巢狀 blur），以及 `estimateRenderCost` 嘅四種 basis，包括重疊形狀嘅上界永遠唔會低估真實組合面積。
- `design/packages/ui/src/components/config/maskDraft.test.ts` —— 打字同拖拉唔會踩爛對方或者無關嘅欄位、無效同不完整嘅文字會被報出而唔會被掉、兩條輸入路徑嘅整數捨入一致，以及 `draftToRecord` 永遠讀已 commit 嘅值。
- `design/packages/ui/src/components/config/maskFile.test.ts` —— 匯出／匯入準確往返單一形狀、多個形狀（含一個 subtract polygon）同一個空（whole-world）mask；非 JSON 檔、錯格式、未來版本同無效形狀各自都帶住具名原因被拒。
- `design/packages/cli/src/maps.mask.test.ts` —— box/circle/ellipse/polygon/blur 嘅準確構造、遞迴巢狀、次序、相減、第一個就相減，以及無效輸入嘅行為。
- `design/packages/render-actions/src/config/projectMapConfig.test.ts` 同 `renderConfig.test.ts` —— 由 project archive 傳送完整嘅所選地圖 config，以及加法式 shard 邊界唔會取代一個已存在嘅任意 mask。
- `design/packages/app/src/main/world/levelDat.test.ts` 同 `inspect.test.ts` —— 準確讀 spawn，以及由 region 檔名推導出包含端點嘅 block 範圍而唔使讀 region 內容。
- `design/packages/ui/src/components/config/maskWorld.test.ts`、`paletteCatalog.test.ts` 同 `App.test.ts` —— 所選 dimension 嘅 context、只限 overworld 嘅 spawn，以及結構化 palette 目標去到準確嗰個編輯器欄位。
- `design/packages/ui/src/copy/surfaces/maskDraw.test.ts` —— catalogue 自身嘅形狀（五個級別、兩種語言、冇 em dash）、level 1 同 level 5 真係讀落唔同，以及每個釘死嘅事實喺兩種語言嘅每個 funny level 都生存到；palette copy 另外釘死本機／Actions 對等同 teleport 目的地。

### 建議下一步

- [Local version history for config folders](./config-history.md) —— 儲存咗嘅 mask 本來就繼承嘅嗰套歷史。
- [The regex builder and the search bars it reaches](./regex-builder.md) —— 當繪圖介面嘅形狀清單需要搜尋列嗰陣，應該跟嘅搜尋列模式。
- [Language modes and funny levels](./language-and-tone.md) —— `maskDraw.ts` catalogue 跟緊嘅語調／事實分工。
