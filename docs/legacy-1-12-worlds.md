# 1.12.2 worlds: written by the generator, and proved to read back as a map

DataVersion 1343 is Minecraft 1.12.2, the last release before the flattening replaced numeric
block ids with namespaced block-states. This project's world reader has always dispatched on that
threshold. What is new is that the world generator can now *write* that format, so a pre-flattening
world can be produced from a seed and read back through the same reader that opens a real one, and
a render harness checks that what comes out is a map rather than a plausible-looking pile of
nothing.

The code is `design/packages/worldgen/src/legacy*.ts`, with the render harness at
`tools/oracle/render-1-12.mjs`.

## Behaviour

### The threshold, and why 1343 exactly

`MCAChunkLoader` selects `Chunk_1_12` for every chunk whose DataVersion is at or below 1343, so
1343 is both the newest legacy world and the only value that proves the legacy branch was taken
rather than the modern one. Writing 1342 would be a world nobody has; writing 1344 would silently
exercise the modern path.

### What a legacy chunk is made of

The modern writer emits the 1.18-and-later shape: a top-level `sections` list, a per-section
palette of namespaced block-states, and bit-packed indices into it. None of that existed in
1.12.2, where a chunk is a `Level` compound holding a `Sections` list whose entries carry three
parallel arrays over the same 4096 block slots.

| Tag | Type | What it holds |
|---|---|---|
| `Blocks` | `byte[4096]` | The low 8 bits of each block's numeric id |
| `Add` | `byte[2048]` | Optional nibble array holding bits 8 to 11 of the id, so ids above 255 can be expressed |
| `Data` | `byte[2048]` | Nibble array of 4-bit metadata |

Nibble arrays pack two values per byte, low nibble first: value `i` lives in byte `i >> 1`, in the
low half when `i` is even and the high half when it is odd. That is the layout `Chunk_1_12` reads
back, and getting the halves the wrong way round produces a world that decodes to a checkerboard
of two different blocks, plausible enough at a glance to be missed.

Biomes are a flat `byte[256]` on the `Level` compound, one id per column indexed `z * 16 + x`,
rather than a per-section 4 by 4 by 4 palette. The heightmap is a plain `int[256]` under
`HeightMap` rather than a bit-packed long array under `Heightmaps`.

### Ids and metadata are both load-bearing

1.12.2 had 256 usable block ids and four bits of metadata to distinguish everything within one:
every stone variant, every wood species, every leaf type. `1:0` and `1:5` are not two spellings of
one entry, they are stone and andesite, and getting the meta wrong is the easiest possible way to
write a world that decodes into confident nonsense.

Where 1.12.2 has no block corresponding to a modern one, an era-appropriate stand-in is written
and **the substitution is counted, never silent**. The count appears in the generator's JSON
summary and again on stderr, because a legacy world quietly losing a block is exactly the failure
this format exists to rule out and nobody reads the JSON summary of a run that looked like it
worked.

### The world-box projection

A 1.12.2 world is 256 blocks tall starting at y=0; the generator's world box is 384 blocks
starting at y=-64. The terrain already lives entirely inside 0 to 255, so **no block moves**: the
same generated chunk is written at the same coordinates in either format. Two things change at the
bottom of the world:

- the four all-rock sections below y=0 are dropped, because that space does not exist in this era;
- y=0 becomes a solid bedrock floor, because in 1.12.2 that is the world floor and a world without
  one is not a world any 1.12.2 client would accept.

That is what makes the modern world a usable control for the legacy one: seed N produces literally
the same blocks in both, so any difference between two renders of them is a difference in how the
world was read and resolved rather than in what was generated.

### The `level.dat`, and what is deliberately absent

A modern `level.dat` carries a `WorldGenSettings` compound whose per-dimension inline type is
where this project's reader gets the overworld's `min_y` and `height`. 1.12.2 predates the whole
concept and carries none, and that is not an omission to paper over: it is the actual shape of
every real 1.12.2 world, and inventing a `WorldGenSettings` would make the generated world easier
for the reader than any world it will ever meet.

The consequence is visible in a render and is measured rather than avoided.
`MCAWorld#loadDimensionType` finds no dimension settings, falls back to the default overworld, and
therefore believes the world runs from y=-64 to y=319 rather than 0 to 255. Nothing breaks:
`Chunk_1_12` has no sections below 0 and answers air for every block down there, so the renderer
simply scans a world box taller than the world. That is upstream's behaviour for a legacy world
too.

`generatorName`, `generatorVersion`, `generatorOptions`, `RandomSeed` and `MapFeatures` are the
1.12.2 spellings of settings the modern format moved into `WorldGenSettings`, and they are written
so the folder also opens as a normal world in a 1.12.2 client and in era-appropriate third-party
tools. Nothing reads a clock: `LastPlayed` is a fixed 0, because a timestamp would make two runs
of the same seed differ byte for byte.

## Configuration

```
node design/packages/worldgen/dist/cli.js --seed 22 --size 128 --format 1.12.2 --out ./out
```

| Option | Meaning |
|---|---|
| `--format 1.20.4` (default) or `--format 1.12.2` | Which chunk format to write |
| `--data-version 3700` or `--data-version 1343` | The same choice spelled as a DataVersion |
| `--seed`, `--size`, `--out`, `--name`, `--zip`, `--no-zip`, `--quiet` | As for the modern format |

Both spellings exist because both are how people refer to a world's era: a human says "1.12.2" and
a tool reading a chunk says "DataVersion 1343". They resolve to the same thing, and giving both at
once is an error only when they disagree. The two formats also default to different folder names,
so neither run overwrites the other.

The render harness takes its own options and fetches nothing:

```
node tools/oracle/render-1-12.mjs
node tools/oracle/render-1-12.mjs --seed 22 --size 128 --keep
```

It defaults to the resources `compare.mjs` already downloaded into
`tools/oracle/out/gate/bluemap-data/`. The default 128-block world is 8 by 8 chunks, which at the
default seed spans five of the generator's nine biomes and therefore covers grass, podzol, snow,
three wood species, the stone variants and the ground plants. A larger world adds render minutes
and no new block-states; a smaller one lands inside one biome and would pass every check on four
block ids.

## Failure modes

- **A modern block with no 1.12.2 equivalent** is substituted and counted, in the summary and on
  stderr. It is never dropped.
- **`--format` and `--data-version` given together and disagreeing** is an error. Given together
  and agreeing, it is not, because both are ordinary ways of naming the same era.
- **The reader falling back to the modern world box** is expected for this era, is explained
  above, and is asserted by a test rather than treated as a surprise.
- **Four block-states render differently or not at all in a modern resource pack.** These are
  flattening consequences rather than decoding bugs, and each is pinned by name in the harness:
  `minecraft:grass` (the modern overlay defines that name as the grass tuft, so a 1.12.2 grass
  block renders as a cross-shaped plant), `minecraft:podzol` (26.x keys its variants on a `snowy`
  property that did not exist in 1.12.2, so no variant matches), `minecraft:snow_layer` (renamed
  to `minecraft:snow` by the flattening, so nothing answers the old name), and `minecraft:snow`
  (the mirror image: the same name means the full block in 1.12.2 and the layer in a modern pack).
  The harness fails if an undocumented fifth appears **and** fails if one of the four quietly
  starts working, so the list cannot go stale in either direction.
- **The harness cannot find its resources.** It says so and stops; it downloads nothing itself.

## Security considerations

Nothing in the generator reads a clock, a network or an environment variable, so a world is a pure
function of its seed, its size and its format. That is what makes the byte-identical determinism
test possible, and it is also why a generated world can be published as a fixture without carrying
anything about the machine that produced it.

The render harness reads a Minecraft client jar and BlueMap's resource extensions from disk and
fetches nothing. Those files are the ones the modern parity gate already downloaded; this script
never reaches the network, so running it cannot pull a resource pack from anywhere.

Reading a legacy world is the same trust boundary as reading any other world: the region files are
untrusted input, parsed by the same decoders, and a malformed chunk is a decode failure rather
than something that reaches further in.

## Verification

### The decoding half is a unit test

`design/packages/worldgen/test/legacy-worldgen.test.ts` reads a generated world back through this
project's own `MCAWorld` and checks, among other things:

- the folder declares itself 1.12.2, which is what selects the legacy chunk reader at all, and
  DataVersion 1343 really does dispatch to `Chunk_1_12`;
- every block 1.12.2 cannot express is reported rather than lost quietly;
- the same seed produces byte-identical output, and the two formats write different folder names
  so neither overwrites the other;
- every written block decodes back to the block-state its id and meta mean, across the world;
- the 4-bit metadata survives, which is the half a byte array alone cannot hold;
- bedrock sits on the world floor with nothing at all below it;
- every biome byte resolves through the bundled legacy biome table;
- the `HeightMap` is served as an absolute y with no world-floor offset;
- sky light is present above the terrain and absent under it;
- the `snowy` property is put back by the legacy neighbour extensions;
- and the absent dimension settings do make the reader fall back to the modern world box.

Run it with `npx vitest run packages/worldgen` from `design/`.

### The rendering half is a script, and says why

Rendering needs a Minecraft client jar, BlueMap's resource extensions, a full resource-pack load
of roughly 2,100 textures and two complete map renders: a minute of work and a few hundred
megabytes of resident memory, on files that are downloaded rather than committed. So it is a
script rather than a unit test. Nothing is softened by that: every check is an assertion, a
failure exits non-zero, and the exact divergence is printed rather than summarised.

**There is no Java oracle for this era, and the script says so.** Upstream BlueMap 5.22 carries no
pre-flattening chunk loader at all, so there is no Java render of a 1.12.2 world to compare bytes
against, and there cannot be one without reviving a decade-old branch whose output format predates
everything this engine writes. The byte-exact gate the modern comparison runs is therefore
impossible here, and claiming otherwise would be the easiest way to make this look stronger than
it is.

What stands in for it is a **control render of the same terrain**. Both formats come from the same
generator, so rendering both and diffing the two maps isolates the format. The script asserts that
every material a tile references resolves to a gallery entry with an embedded texture, that no
part of the map is the missing-texture placeholder, that the map is made of at least fifteen
distinct materials rather than one repeated block, that no single material is more than 60 per
cent of it, that everything the modern render draws and the legacy one does not is one of the four
documented flattening gaps, that the legacy render draws nothing the modern one does not, and that
any material both draw in wildly different amounts is documented. Two further checks fail when a
documented gap or divergence stops being real, so the pinned lists cannot rot into fiction.

That is a weaker claim than byte equality and it is stated as such. It is also a real one, and it
is what found the four block-states the harness now pins.

## Suggested reading

- The `world-reading` article on the documentation site, for the decoder matrix this format is one
  branch of.
- The `test-world-generator` article, for the modern format and why a synthetic world exists at
  all.
- [Rendering a world in GitHub Actions](./render-in-actions.md), which renders generated worlds on
  runners.

## 廣東話

### 概要

DataVersion 1343 係 Minecraft 1.12.2，即係 flattening 將數字 block id 換成 namespaced block-states 之前最後一個版本。呢個 project 嘅 world reader 一直都係喺呢條界線 dispatch。新嘅嘢係 world generator 而家識*寫*呢個格式，所以一個 pre-flattening 世界可以由一粒 seed 生成出嚟，再經開一個真世界用嘅同一個 reader 讀返，另外有一個 render harness 檢查出嚟嘅嘢係一幅 map，而唔係一堆睇落似樣嘅乜都唔係。

代碼喺 `design/packages/worldgen/src/legacy*.ts`，render harness 喺 `tools/oracle/render-1-12.mjs`。

### 行為（Behaviour）

#### 條界線，同點解啱啱好係 1343

`MCAChunkLoader` 對每個 DataVersion 係 1343 或以下嘅 chunk 揀 `Chunk_1_12`，所以 1343 既係最新嘅 legacy 世界，亦係唯一可以證明行咗 legacy branch 而唔係 modern branch 嘅值。寫 1342 係一個冇人擁有嘅世界；寫 1344 就會靜靜行咗 modern path。

#### 一個 legacy chunk 由乜組成

Modern writer 寫嘅係 1.18 之後嗰個形狀：top-level `sections` list、每個 section 一個 namespaced block-states palette、加 bit-pack 咗嘅 index。呢啲喺 1.12.2 全部唔存在：嗰時一個 chunk 係一個 `Level` compound，入面個 `Sections` list 每個 entry 帶三個平行 array 覆蓋同一批 4096 個 block 位——`Blocks` 係 `byte[4096]`，載每個 block 數字 id 嘅低 8 位；`Add` 係可選嘅 `byte[2048]` nibble array，載 id 嘅第 8 至 11 位，令 255 以上嘅 id 表達到；`Data` 係 `byte[2048]` nibble array，載 4-bit metadata。

Nibble array 一個 byte 裝兩個值，低 nibble 先行：值 `i` 住喺 byte `i >> 1`，`i` 係雙數就喺低半，單數就喺高半。呢個就係 `Chunk_1_12` 讀返嘅排法，兩半調轉咗會 decode 出一個兩種 block 梅花間竹嘅世界，一眼睇落夠似樣，好易走漏眼。

Biomes 係 `Level` compound 上一個扁平嘅 `byte[256]`，每條 column 一個 id，index 係 `z * 16 + x`，而唔係每 section 4×4×4 palette。Heightmap 係 `HeightMap` 下面一個普通 `int[256]`，唔係 `Heightmaps` 下面 bit-pack 嘅 long array。

#### Id 同 metadata 兩樣都受力

1.12.2 得 256 個用得嘅 block id，靠 4 bit metadata 分辨一個 id 入面嘅所有嘢：每種石、每種木、每種樹葉。`1:0` 同 `1:5` 唔係一樣嘢兩種串法，佢哋係 stone 同 andesite——meta 搞錯係寫出一個「自信地錯晒」嘅世界嘅最容易方法。

1.12.2 冇對應 modern block 嘅位置，會寫一個合乎年代嘅代替品，而且**個代替一定會被點算，永遠唔會靜靜過骨**。個 count 會出現喺 generator 嘅 JSON summary，再喺 stderr 出多次，因為一個 legacy 世界靜靜跌咗一種 block 正正係呢個格式存在嚟排除嘅失敗，而冇人會去讀一個睇落成功嘅 run 嘅 JSON summary。

#### World-box 投影

1.12.2 世界高 256 blocks，由 y=0 開始；generator 嘅 world box 係 384 blocks，由 y=-64 開始。啲地形本身全部住喺 0 到 255 之內，所以**冇 block 需要郁**：同一個生成 chunk 喺兩個格式寫喺同一個座標。世界底部有兩樣嘢改變：

- y=0 以下嗰四個全石 section 剷走，因為呢個年代嗰個空間唔存在；
- y=0 變成一層實心 bedrock 地板，因為喺 1.12.2 嗰個就係世界地板，冇地板嘅世界冇一個 1.12.2 client 會接受。

呢樣嘢令 modern 世界成為 legacy 世界嘅可用對照組：seed N 喺兩個格式產生嘅係字面上同一批 blocks，所以兩個 render 之間任何差異，都係「世界點樣被讀同解析」嘅差異，唔係「生成咗乜」嘅差異。

#### 個 `level.dat`，同刻意冇嘅嘢

Modern `level.dat` 帶一個 `WorldGenSettings` compound，呢個 project 嘅 reader 就係由入面每個 dimension 嘅 inline type 攞 overworld 嘅 `min_y` 同 `height`。1.12.2 早過成個概念存在，所以冇——而呢個唔係一個要遮醜嘅遺漏：呢個就係每個真實 1.12.2 世界嘅實際形狀，發明一個 `WorldGenSettings` 出嚟會令生成世界對個 reader 嚟講易過佢將來會遇到嘅任何世界。

後果喺 render 度睇得見，而且係被量度而唔係迴避。`MCAWorld#loadDimensionType` 搵唔到 dimension settings，跌返去預設 overworld，於是以為個世界由 y=-64 去到 y=319 而唔係 0 到 255。冇嘢壞：`Chunk_1_12` 喺 0 以下冇 sections，嗰啲位置全部答 air，renderer 只係掃一個高過個世界嘅 world box。上游對 legacy 世界都係咁樣。

`generatorName`、`generatorVersion`、`generatorOptions`、`RandomSeed` 同 `MapFeatures` 係 modern 格式搬入咗 `WorldGenSettings` 嗰啲設定嘅 1.12.2 串法，寫低佢哋係為咗個 folder 喺 1.12.2 client 同埋年代相符嘅第三方工具都開得做一個正常世界。冇嘢會讀時鐘：`LastPlayed` 固定係 0，因為一個 timestamp 會令同一粒 seed 兩次 run 逐 byte 唔同。

### 配置（Configuration）

```
node design/packages/worldgen/dist/cli.js --seed 22 --size 128 --format 1.12.2 --out ./out
```

選項：`--format 1.20.4`（預設）或 `--format 1.12.2` 揀寫邊個 chunk 格式；`--data-version 3700` 或 `--data-version 1343` 係同一個選擇用 DataVersion 講法；`--seed`、`--size`、`--out`、`--name`、`--zip`、`--no-zip`、`--quiet` 同 modern 格式一樣。

兩種串法都存在，因為兩種都係人講一個世界年代嘅方式：人會講「1.12.2」，讀 chunk 嘅工具會講「DataVersion 1343」。佢哋解析做同一樣嘢，兩個一齊畀只有喺佢哋唔一致嗰陣先係 error。兩個格式亦預設唔同嘅 folder 名，所以兩次 run 唔會互相覆蓋。

Render harness 有自己嘅選項，而且乜都唔會 fetch：

```
node tools/oracle/render-1-12.mjs
node tools/oracle/render-1-12.mjs --seed 22 --size 128 --keep
```

佢預設用 `compare.mjs` 已經下載落 `tools/oracle/out/gate/bluemap-data/` 嗰啲資源。預設嘅 128-block 世界係 8×8 chunks，喺預設 seed 下橫跨 generator 九個 biome 入面五個，所以覆蓋到草、podzol、雪、三種木、各種石同地面植物。世界再大只會加 render 分鐘，唔會加新 block-states；再細就會困喺一個 biome 入面，四個 block id 就 pass 晒所有檢查。

### 失敗情況（Failure modes）

- **一個 modern block 冇 1.12.2 對應**：代替再點算，喺 summary 同 stderr 兩度。永遠唔會直接跌咗佢。
- **`--format` 同 `--data-version` 一齊畀而且唔一致**：error。一齊畀而且一致就唔係，因為兩者都係同一個年代嘅普通講法。
- **Reader 跌返去 modern world box**：對呢個年代係預期行為，上面解釋咗，而且有測試 assert，唔係當佢意外。
- **四個 block-states 喺 modern resource pack 度 render 唔同咗或者 render 唔出**。呢啲係 flattening 嘅後果而唔係 decode bug，harness 逐個名 pin 住：`minecraft:grass`（modern overlay 將呢個名定義做草叢，所以 1.12.2 嘅 grass block render 成一棵十字形植物）、`minecraft:podzol`（26.x 用一個 1.12.2 未存在嘅 `snowy` property 做 variant key，所以冇 variant match）、`minecraft:snow_layer`（flattening 改名做 `minecraft:snow`，所以個舊名冇嘢應）、`minecraft:snow`（鏡像：同一個名喺 1.12.2 係全塊，喺 modern pack 係雪層）。Harness 喺出現未記錄嘅第五個時會 fail，**而且**喺四個之一靜靜開始正常運作時都會 fail，所以個清單兩個方向都爛唔到。
- **Harness 搵唔到佢啲資源**：講明然後停；佢自己乜都唔下載。

### 保安考量（Security considerations）

Generator 入面冇嘢讀時鐘、網絡或者環境變數，所以一個世界係佢粒 seed、個 size 同個 format 嘅純函數。呢樣嘢令 byte-identical 決定性測試變得可能，亦係一個生成世界可以當 fixture 發佈、而唔會帶住任何關於生產佢嗰部機嘅嘢嘅原因。

Render harness 由碟讀一個 Minecraft client jar 同 BlueMap 嘅 resource extensions，乜都唔 fetch。嗰啲檔係 modern parity gate 已經下載咗嘅；呢個 script 永遠唔掂網絡，所以行佢冇可能由任何地方拉一個 resource pack 返嚟。

讀一個 legacy 世界同讀任何世界係同一條信任邊界：region 檔係唔可信輸入，由同一批 decoder parse，一個變咗形嘅 chunk 係一個 decode failure，唔係一樣可以伸得更入嘅嘢。

### 驗證（Verification）

#### Decode 嗰半係 unit test

`design/packages/worldgen/test/legacy-worldgen.test.ts` 用呢個 project 自己嘅 `MCAWorld` 讀返一個生成世界，檢查（除其他外）：

- 個 folder 自我聲明係 1.12.2——即係揀 legacy chunk reader 嘅嗰樣嘢——而 DataVersion 1343 真係 dispatch 去 `Chunk_1_12`；
- 每個 1.12.2 表達唔到嘅 block 都有報告，唔會靜靜唔見；
- 同一粒 seed 產生逐 byte 相同嘅輸出，兩個格式寫唔同 folder 名所以唔會互相覆蓋；
- 每個寫低嘅 block decode 返做佢 id 加 meta 所指嗰個 block-state，全世界都係；
- 4-bit metadata 生存到——即係齋 byte array 裝唔到嗰一半；
- bedrock 坐喺世界地板，下面乜都冇；
- 每個 biome byte 經內置 legacy biome table 解析得到；
- `HeightMap` 以絕對 y 提供，冇 world-floor offset；
- 地形上面有 sky light，下面冇；
- `snowy` property 由 legacy neighbour extensions 放返落去；
- 缺席嘅 dimension settings 確實令 reader 跌返去 modern world box。

喺 `design/` 用 `npx vitest run packages/worldgen` 執行。

#### Render 嗰半係 script，而且講明點解

Render 需要一個 Minecraft client jar、BlueMap 嘅 resource extensions、load 大約 2,100 個 texture 嘅完整 resource-pack，再加兩次完整 map render：一分鐘嘅工作、幾百 MB resident memory，而且用嘅係下載返嚟而唔係 commit 落 repo 嘅檔。所以佢係一個 script 而唔係 unit test。但冇嘢因此鬆手：每個檢查都係 assertion，fail 會以非零 exit，具體分歧會印出嚟而唔係summarise咗事。

**呢個年代冇 Java oracle，個 script 直認。**上游 BlueMap 5.22 完全冇 pre-flattening chunk loader，所以冇一個 1.12.2 世界嘅 Java render 可以逐 byte 對，除非復活一條十年前嘅 branch，而佢嘅輸出格式早過呢個 engine 寫嘅所有嘢。Modern 比較行嗰個 byte-exact gate 喺呢度所以係不可能，扮做可能就係令呢樣嘢睇落強過實際嘅最容易方法。

頂上嘅係一個**同一地形嘅對照 render**。兩個格式出自同一個 generator，所以 render 兩個再 diff 兩幅 map，就隔離到格式呢個變數。個 script assert：每個 tile 引用嘅 material 都解析到一個有嵌入 texture 嘅 gallery entry；冇任何部分係 missing-texture placeholder；幅 map 由至少十五種唔同 material 組成而唔係一種 block 重覆；冇單一 material 佔超過六成；modern render 畫到而 legacy 冇畫嘅嘢全部係嗰四個已記錄嘅 flattening gaps 之一；legacy render 冇畫任何 modern 冇畫嘅嘢；兩邊都畫但份量差天共地嘅 material 全部有記錄。另外兩個檢查會喺一個已記錄嘅 gap 或分歧唔再真實時 fail，所以 pin 住嘅清單爛唔成小說。

呢個係一個弱過 byte equality 嘅主張，文件都係咁講。但佢係一個真主張，而且正正係佢搵到 harness 而家 pin 住嗰四個 block-states。

### 建議閱讀

- 文檔網站嘅 `world-reading` 文章——呢個格式係嗰個 decoder matrix 嘅其中一條 branch。
- `test-world-generator` 文章——modern 格式，同點解會有一個合成世界存在。
- [Rendering a world in GitHub Actions](./render-in-actions.md)——喺 runner 上面 render 生成世界。
