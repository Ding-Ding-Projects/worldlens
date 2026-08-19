# Region-file watch safety

## Behaviour

The incremental map watcher observes each Minecraft `region` folder and delivers changed
`.mca` files as coalesced region positions. It ignores unrelated filenames, batches repeated
events for one region, notices a region folder that is created after the watcher starts, and
closes pending polls, timers, and the underlying watcher together.

On Windows with Node 26 or newer, the service uses chokidar polling at a 100 ms interval. Node's
native Windows `fs.watch` backend can abort the process when a new child is reported in a watched
directory; polling is the bounded compatibility fallback for that runtime only. Other platforms
and older Node versions retain the native watcher.

`MapUpdateService` adds the next safety layer: duplicate region events collapse into one pending
render, cooldown timing prevents a burst from starting overlapping work, and close stops future
scheduling. The CLI watcher owns one service per target map and clears its periodic full-update
timer during shutdown.

## Configuration

There is no user-facing switch for the backend. `usesPollingForCurrentRuntime()` derives the
choice from the runtime platform and Node major version, while the 100 ms polling interval and
one-second not-yet-created-folder check remain bounded implementation constants. The CLI's
existing `update-cooldown` and `full-update-interval` settings continue to control render
coalescing and periodic full updates.

## Failure modes

A missing region folder is retried every second until it exists. A watcher error is logged and
does not become an unhandled rejection; a map-specific watcher-construction error is reported
and does not prevent other targeted maps from starting. Closing a service rejects pending waits
with the normal closed-watcher error and prevents later events or timers from scheduling work.

## Security considerations

The watcher reads only the configured world region folder, accepts only the three relevant
filesystem event kinds, and derives coordinates from the region filename rather than trusting
arbitrary paths. Polling is bounded and local; it adds no network route or external process.

## Verification

The focused watcher guard covers runtime selection, event coalescing, irrelevant-file filtering,
late folder creation, close cleanup, and watcher readiness. `MapUpdateService` and CLI watcher
tests cover real region changes, deduplication, cooldown spacing, error reporting, per-map
isolation, periodic updates, and idempotent shutdown.

Verified locally on the current tree:

- `MCAWorldRegionWatchService.test.ts`: 7/7 tests.
- `map-update-service.test.ts` and `render-watch.test.ts`: 14/14 tests.
- The full 470+ file `pnpm test:ci` run did not reach a terminal verdict before the 20-minute
  harness ceiling; its child emitted `EPIPE` only after the harness closed the output pipe. That
  run is not treated as green evidence.

Suggested articles: [Automatic updates](./automatic-updates.md), [Renders in progress](./renders-in-progress.md),
and [Render console](./render-console.md).
