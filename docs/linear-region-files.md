# Linear region files

`LinearRegion` reads the community `.linear` region container alongside Anvil
files. The format stores a whole 32×32 region in one zstd stream: a 1024-entry
table of chunk lengths and timestamps is followed by the populated chunk payloads.

## Behaviour

The on-disk timestamp unit is Unix epoch seconds. The format evidence uses an
unsigned 64-bit region timestamp in the file header and unsigned 32-bit values in
the inner chunk table. `LinearRegion` preserves those widths before invoking the
number-based `ChunkConsumer` filter.

Version 1 has one region timestamp, so every populated chunk is presented to the
filter with that same timestamp. Version 2 has one timestamp per populated table
entry, so the filter can select changed chunks individually. Filtering happens
before chunk decompression; skipped payload bytes are advanced only when a later
accepted chunk requires them.

## Configuration

There is no user-facing setting. Region type selection is determined by the
`.linear` filename and the file's version byte. The supported versions are 1 and
2; other versions are rejected.

## Failure modes

Invalid header or footer signatures, unsupported versions, inconsistent file
lengths, truncated decompressed data, and chunk-loader failures are reported as
format errors. A filter can exclude a populated chunk without loading its payload.

## Security considerations

Linear files are untrusted compressed input. The reader validates the outer
structure before decompressing, keeps the payload in bounded buffers derived from
the file, and never evaluates chunk data as code. The zstd stream remains a
decompression-bomb surface and is handled through the same bounded chunk-loading
boundary as the other region containers.

## Verification

The colocated fixture builder covers a v2 timestamp at `0x80000000` (the first
value beyond signed 32-bit range), a v2 filter boundary, and a v1 region timestamp
above `0xffffffff`. The fixtures are derived from the published format layout and
the upstream BlueMap `LinearRegion` v1/v2 change. The rapid implementation pass
did not execute the test command; run `npx vitest run packages/engine/src/world/mca/region/LinearRegion.test.ts`
from `design/` for the acceptance proof.

## 廣東話

`.linear` region 檔同 Anvil 並行讀。時間係 Unix epoch 秒：header 係 unsigned
64-bit region timestamp，v2 table 內每格係 unsigned 32-bit timestamp。v1 用同一個
region 時間畀所有有內容嘅 chunk；v2 就逐 chunk filter，先 filter 後解壓，唔會為咗
舊 payload 無端端開工。

`0x80000000` 同超過 `0xffffffff` 嘅 fixture 專門守住 2038/wrap 邊界。header/footer
錯、version 唔識、長度唔啱、zstd 解壓截斷同 chunk loader 爆錯都照實報；今次 rapid
pass 冇跑測試，正式 acceptance proof 要用上面嗰條 command。

## Related reading

- [Region-file watch safety](./region-watch-safety.md)
- [World reading on the Pages site](https://github.com/Ding-Ding-Projects/worldlens/blob/main/design/packages/site/src/content/articles/world-reading.ts)
