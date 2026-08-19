# Local live-player tracking

> **Issue #74 acceptance record — 2026-08-19 (documentation-only pass)**
>
> This record defines the local live-player contract. The issue-owned checkout contains an
> optional provider in `design/packages/server/src/live/localLiveProvider.ts`; the
> BlueMap-compatible empty response from `liveDataStubs.ts` remains the safe default when no
> provider is configured. No tests, packaged interaction, or capture was run for this record, so
> issue #74 remains open and runtime verification is unclaimed.

## Behaviour

The feature must discover online players from a world the desktop application can read locally,
with an optional, explicitly configured RCON source for servers whose player data is not available
as ordinary files. It must merge both sources by a stable player identity, choose the freshest valid
position, preserve the dimension and source of that position, and never emit duplicate markers or
carry a player across dimensions because one source went stale.

Each snapshot must carry a timestamp, source (`playerdata`, `rcon`, or both), freshness, and the
server/world identity it belongs to. A map update must replace or remove stale markers without a
reload, while a server restart, a changing `level.dat` identity, or a world switch must clear the
previous world's live state before accepting new observations. The viewer must keep working with an
empty list and must distinguish empty, offline, stale, malformed, and unavailable states.

The surface must provide player search and filtering, per-player hide/show state, bulk hide/show
and export actions, and a command-palette destination that lands on the live-player controls. The
same state must be persisted per project without persisting credentials or raw server responses.

## Configuration and persistence

The local route should be enabled only for a selected world/project and should default to network
access off. Player-data discovery must use a bounded file walk under the selected world root,
recognise the supported Java player-data layout and dimension aliases, and reject paths that escape
that root. NBT decoding must be bounded by file size, nesting depth, list length, and numeric range.
Malformed, locked, truncated, or newer-than-supported files are skipped with a per-source reason;
one bad player file must not discard valid players from the same snapshot.

RCON is opt-in. Its host, port, TLS/transport choice, polling interval, timeout, and backoff must
be explicitly configured. The password belongs in the operating-system credential store under a
stable account key; it must never be written to project files, logs, exports, snapshots, or issue
records. RCON refusal, authentication failure, timeout, protocol error, and clock drift are
non-blocking states that retain the last valid local snapshot and expose a same-surface retry or
disable action. Polling must stop when the map or project closes and must not create duplicate
timers after a reconnect.

The existing BlueMap-compatible `live/players.json` response and event stream should remain the
transport boundary. The desktop bridge must expose freshness and source metadata without changing
the public empty-response shape for consumers that only understand BlueMap's `players` array.
Updates must be coalesced and cancelled when superseded; rapid movement must not create an
unbounded queue or repaint loop.

## Failure modes and security

- A missing `playerdata` directory is an honest empty local source, not a fabricated player list.
- A locked or partially written `.dat` file is reported as unavailable for that player and retried
  on a bounded schedule; it is never read outside the selected world root.
- A malformed NBT payload, unsupported dimension, invalid UUID, non-finite coordinate, or impossible
  position is rejected without partially applying the record.
- An RCON server that refuses, times out, restarts, or returns malformed output leaves the last
  valid snapshot labelled stale and records the next retry time.
- A world or server identity change invalidates the previous snapshot and its hidden-player state;
  no marker may leak between worlds.
- Player names and positions remain local. Exports omit RCON credentials and any sensitive transport
  metadata, and diagnostic logs use redacted player identifiers where the surrounding feature does
  not need the real name.

## Verification boundary

No implementation, focused tests, real player-data reads, isolated RCON session, packaged-artifact
interaction, or capture is claimed by this records-only pass. The acceptance run still needs real
NBT fixtures (valid, malformed, locked, truncated, multiple dimensions, restart, and rapid-change
cases), an isolated disposable RCON server with refusal/timeout/reconnect cases, source-merge and
staleness assertions, credential-store and no-network checks, and the packaged viewer showing live
markers move, disappear, filter, hide, export, and recover after a restart. Until those receipts
exist, issue #74 must remain open.

## Related reading

- [Live preview](./live-preview.md) — the existing rendered-map update and browser preview boundary.
- [Docker world source](./docker-world-source.md) — local world access and the explicit RCON gap for
  safe live-world copying.
- [Measurement and waypoints](./measurement-and-waypoints.md) — the neighbouring map-overlay record.

## 廣東話 / Cantonese

呢篇係 issue #74 嘅 acceptance record，定義本機 `playerdata` NBT 同可選 RCON 點樣合併成
live-player marker。現時 server 仲係由 `liveDataStubs.ts` 回傳 BlueMap-compatible 空陣列，
未有真正讀檔或者 poll RCON；今次只改文檔，冇跑 implementation、tests、packaged interaction
或者 captures，所以 issue 仍然 open，唔當 runtime 已驗證。

正式實作要保留 identity、dimension、source、freshness，清 stale ghost，server/world 轉換時
清乾淨舊 state，仲要有搜尋、filter、hide/show、bulk actions、export 同 command palette 路徑。
RCON password 只可以入 OS credential store，唔可以落 project file、log、export 或 snapshot；
檔案鎖住、NBT 壞咗、RCON 拒絕、timeout、server restart 同 clock drift 都要講真話，唔可以
餵假 event 畀 component 自己拍手。最後要喺 packaged viewer 真係見到 marker 郁、消失、filter、
export 同 restart recovery，先可以收 issue。
