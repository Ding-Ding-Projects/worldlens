# Public API and reference

This is the 1.0 reference for the public Windows distribution. Names listed here are the
compatibility boundary. A symbol that is merely exported from a source file, a private loopback
route, or an undocumented CLI option may change without a 1.0 compatibility promise.

## Standalone CLI

The command defaults to `bluemap-cli`; `BLUEMAP_COMMAND` changes only the displayed command name.
The parser accepts grouped short flags and `--flag=value` in the same way as the upstream CLI
model.

| Short | Long | Meaning |
| --- | --- | --- |
| `-h` | `--help` | Print usage and examples. |
| `-c` | `--config <path>` | Select the configuration directory. |
| `-n` | `--mods <path>` | Select the mods/resource location. |
| `-v` | `--mc-version <version>` | Declare the Minecraft version used for the run. |
| `-l` | `--log-file <path>` | Write the run log to the selected file. |
| `-a` | `--append` | Append to the configured log/file output where the action supports it. |
| `-w` | `--webserver` | Start the webserver without rendering. |
| `-b` | `--verbose` | Enable verbose logging. |
| `-g` | `--generate-webapp` | Generate the webapp assets. |
| `-s` | `--generate-websettings` | Generate web settings. |
| `-r` | `--render` | Render configured maps. |
| `-e` | `--fix-edges` | Run the edge-fixing render operation. |
| `-f` | `--force-render` | Force the render operation. |
| `-m` | `--maps <maps>` | Select maps for the operation. |
| — | `--markers` | Enable the marker action. |
| `-u` | `--watch` | Watch world files and update maps after changes. |
| `-V` | `--version` | Print the CLI version and git hash, one per line. |

Exit code `0` means the selected action completed or was accepted. Exit code `1` is the general
failure result. Exit code `2` means required resources are missing. Invalid arguments and
configuration errors use the general failure result; callers must read stderr/log output rather
than infer a finer taxonomy that is not published.

Resource and SQL behavior is part of the CLI contract too. The resolver layers configured packs,
mod jars, BlueMap's `resourceExtensions.zip`, and the vanilla client jars in a documented
high-to-low first-writer order; it reports the selected extension-pack path and SHA-256 and fails instead of
silently dropping a requested root. SQL maps use `storages/<id>.conf`, support SQLite, MySQL,
MariaDB, and PostgreSQL, and report missing optional drivers, unsupported custom JDBC fields,
unknown dialects, and connection failures as non-zero errors. See
[Standalone CLI resource and SQL parity](./cli-resource-sql-parity.md) for the exact layouts,
configuration fields, precedence, diagnostics, and Docker/installed behavior.

## Map HTTP surface

The server mounts map data at `/maps/{id}/...`. The documented read routes are:

```text
GET /maps/{id}/settings.json
GET /maps/{id}/textures.json
GET /maps/{id}/live/players.json
GET /maps/{id}/live/markers.json
GET /maps/{id}/live/sse
GET /maps/{id}/assets/{path}
GET /maps/{id}/tiles/{lod}/x{x}z{z}[.prbm|.png][.gz]
```

`live/sse` is `text/event-stream` and emits `player`, `marker`, and `tile` events when SSE is
enabled for the mount. The JSON live routes remain available when SSE is disabled. Missing maps or
resources return `404`; malformed percent-encoding returns `400`; an unreadable mounted resource
returns `500`. A missing tile is `204`. Map content is cacheable for one day; live JSON is
`no-cache`.

Worldlens adds one documented render-control route over the upstream read-only map surface:

```text
GET  /maps/{id}/update
POST /maps/{id}/update?force=force_all|force_edge|force_none
```

`GET` returns the current render status. `POST` schedules an update and returns `202` when queued
or `200` when it is handled immediately. Unknown force values return `400`, an unknown map returns
`404`, and another method returns `405` with `Allow: GET, HEAD, POST`. This route is an application
extension; it is not an upstream BlueMap endpoint.

Remote-server browsing uses the application proxy boundary, not a browser-side arbitrary URL. A
documented profile is addressed as `/remote/{profileId}/...`; unknown profiles return `404`,
non-`GET`/`HEAD` methods return `405`, and the proxy preserves the upstream content type and SSE
stream rather than buffering it. Tokens are supplied through the privileged application boundary;
they are not part of public documentation examples or logs.

## TypeScript package entrypoints

The following package exports are public when imported from their package entrypoint:

### `@worldlens/shared`

The entrypoint exports the shared `Grid`, `Key`, `Registry`, HOCON parser and error/options types,
tile-path codec, color and matrix/vector math, and color-role schemes. Consumers should import from
the package entrypoint, not from `src/` paths. The HOCON parser bounds input by its options and
defaults to a maximum depth of 64 and maximum input length of 4 MiB.

### `@worldlens/server`

The entrypoint exports `HttpServer`, `HttpHandler`, `HttpServerOptions`, `StaticHandler`,
`MapStorageHandler`, `MapStorageMount`, `RemoteProxyHandler`, `RemoteProfile`,
`SseConnectionManager`, `LiveDataBroadcaster`, `noLivePlayers`, `noLiveMarkers`, `RenderDriver`,
`RenderStatus`, `UpdateRequestResult`, `RenderQueuePersistence`,
`RenderQueuePersistenceOptions`, `RenderUpdateHandler`, `MapUpdateService`, and
`MapUpdateServiceOptions`. These types describe the documented HTTP/server boundary; internal
classes under package source paths are not automatically public.

### `@worldlens/viewer`

The entrypoint exports the reactive and i18n adapters, viewer-facing map/viewer primitives,
`sanitizeHtml`, `renderMarkdown`, and `slugifyHeading`. Provider-authored HTML/Markdown must pass
through the shared sanitizer/renderer; callers must not insert it directly into the DOM.

The Java `BlueMapAPI` artifact is not part of the desktop distribution. The TypeScript API and
wire formats are the supported integration route for the Windows 1.0 product.

## Compatibility examples

Read an update status without assuming success from the HTTP status alone:

```js
const response = await fetch(`${baseUrl}/maps/world/update`);
if (!response.ok) throw new Error(`status request failed: ${response.status}`);
const status = await response.json();
// Use the documented status fields; do not treat a queued POST as a completed render.
```

Subscribe to live data and handle stream loss as a recoverable condition:

```js
const events = new EventSource(`${baseUrl}/maps/world/live/sse`);
events.addEventListener("player", (event) => consumePlayers(JSON.parse(event.data)));
events.addEventListener("marker", (event) => consumeMarkers(JSON.parse(event.data)));
events.onerror = () => refreshLiveJsonOrReportOffline();
```

## Failure and change rules

Consumers must distinguish `400` invalid input, `404` unknown map/profile/resource, `405` method
not allowed, `500` server-side read failure, `204` missing tile, and a closed SSE connection.
Retrying a permanent `400` or `405` is not a migration. A new route or export becomes stable only
when it is added to this reference and its format/version and failure semantics are documented.

## 廣東話

呢篇列嘅先係 1.0 真正 public API：CLI flags、exit code、`/maps/{id}` map data、live JSON/SSE、render
update route，同 package entrypoint exports。淨係喺 source file 見到嘅 symbol、private loopback route、
未寫入 reference 嘅 flag，都唔好當成穩定 integration contract。CLI 嘅 `0` 係完成/接受，`1` 係 general
failure，`2` 係 required resources 欠奉；版本輸出係 version 同 git hash 各一行。

HTTP 部分要分清 `400`、`404`、`405`、`500`、缺 tile 嘅 `204` 同 SSE 斷線，唔好見到一個 status code 就
當 render 已經完成。 `/maps/{id}/update` 係 Worldlens 自己加嘅 control route，唔係 upstream BlueMap
原生 endpoint；remote proxy 亦只接受已登記 profile，token 由 privileged boundary 處理，唔會塞落 URL、
log 或 public example。 TypeScript API 要由 package entrypoint import，唔好鑽入 `src/` 偷用內部結構。
