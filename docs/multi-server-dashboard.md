# Multi-server operations dashboard

## Behaviour

Issue #77 is the product record for a future operations dashboard that brings the
application's saved local, Docker and remote server profiles into one view. The
dashboard is intended to report the source, reachability, BlueMap version, maps,
players, render or update state, and the time of the last check for each profile.
It must keep one slow or refused host from blocking the rest by using bounded
concurrency, backoff, cancellation, and an explicit stale or unknown state.

The planned surface also includes plain-text search with an adjacent full regex
builder, date/status filters, grouping, pinning, reorder, multi-select, and
truthful bulk start/stop/retry/export actions. A result must teleport to the exact
owning profile, render, or settings surface and preserve the dashboard's filter
and selection when the user returns. Layout and appearance are user-managed state;
changes belong in local history and must not contain credentials.

## Configuration

No dashboard configuration is shipped on the current default branch. Existing
server profiles remain in the Maps and servers surface and retain their existing
local history. When the dashboard is implemented, its schema must identify the
profile source and stable profile id, keep layout and appearance records separate
from credentials, and define bounded refresh, retry, and cancellation limits.

## Failure modes

The dashboard must distinguish unreachable, refused, stale, partial, and unknown
profile data from a healthy result. A failed refresh of one host must not turn the
whole collection green, hide other profiles, or erase the last known status. Bulk
actions must report converted, skipped, cancelled, and failed items separately and
must not claim that a batch succeeded when any item did not.

## Security considerations

Refreshes must use the existing profile and credential boundaries. Credentials,
tokens, private paths, and raw remote responses must not enter dashboard layout,
history, exports, notifications, captures, or logs. Any destructive action must
use the application's two-key/full-slider confirmation, and any remote operation
must keep its host and scope visible before it starts.

## Verification

This feature is **pending implementation and verification**. The issue's required
mixed local, Docker, remote, offline, authentication-failure, version-skew,
large-inventory, restart, accessibility, localization, and compact-width cases
have not been run. No packaged multi-server interaction or real isolated-server
capture is claimed. A future completion pass must test the real packaged app
against multiple isolated servers or containers and record the exact commit and
evidence here before closing issue #77.

## 廣東話 / Cantonese

Issue #77 係將本機、Docker 同 remote server profiles 集中落一塊 operations
dashboard 嘅產品記錄。現時 default branch 未有呢個 dashboard；而家仍然係
Maps and servers 清單各自處理。將來要逐項講清楚來源、可達性、BlueMap 版本、
maps、players、render/update 狀態同最後檢查時間，慢機或者拒絕連線嗰部唔可以
拖住全場。stale、unknown、partial 要直接寫明，唔可以擺一格灰色叫人估。

呢篇文件同 issue 一樣保留未完成界線：未有 packaged multi-server interaction，
亦未有多個隔離 server/container 嘅真實 capture。完成之前要有真 app 驗證、完整
混合路徑測試，同埋可追溯嘅 commit/evidence。
