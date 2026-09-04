# Getting a world off a live server

A world does not have to come from a release asset, a Docker daemon or a repository. It can be
sitting on a server this computer has never touched the disk of at all — only a live connection
to it, as an ordinary Minecraft client. This is that route: connect as a player, and save every
chunk the server sends, using the bundled Fabric Carpet world downloader jar.

**Contents**

- [Behaviour](#behaviour)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Related reading](#related-reading)
- [廣東話](#廣東話)

## Behaviour

`main/worlddownloader/` is a self-contained module — `ipc.ts`, `jar.ts`, `ping.ts`, `session.ts`,
`secret.ts`, `settingsStore.ts`, `chunks.ts` — registered in `main/index.ts` by
`startWorldDownloader()`, the same shape as its `startDockerWorld()` sibling. It exposes eleven
request/response channels and one event channel (`worlddownloader:event`), reached from the
renderer through `window.worldlens.worldDownloader` (see `preload/index.ts`'s
`WorldDownloaderBridge` and `packages/bridge/src/factory.ts`'s `worldDownloader` namespace).

The flow, end to end:

1. **Get the downloader.** `ensureJar()` downloads the Fabric Carpet world downloader jar from
   its GitHub release into this application's own data directory, verifying it before it is
   trusted. `readJarRecord()` reports what is already there without touching the network.
2. **Fill in the settings.** Server address, output folder, the declared Minecraft version, and
   the account to connect with (`microsoft`, `token`, or `offline`). `readSettings()` /
   `writeSettings()` persist them; a half-filled form is saved as-is, with its problems reported
   alongside rather than refused.
3. **Test the connection**, optionally. `testConnection()` pings the server directly (no jar
   involved) and reports which Minecraft version family the tool would treat it as, so a mismatch
   between the declared version and the server's real one is caught before a session starts.
4. **Start.** `start()` re-validates the settings server-side, resolves Java (see below), and
   spawns the jar as a real subprocess. `status()` reports the running session's id, phase, and
   redacted argument list; `worlddownloader:event` fans `started`/`log`/`sign-in`/`signed-in`/
   `phase`/`finished` events to every open window in real time.
5. **Stop**, or let it finish. `stop(sessionId)` ends the session; a `finished` event carries the
   real byte and chunk counts, per-dimension breakdown, and any notes the tool logged.

## Configuration

| Field | Meaning |
|---|---|
| `server` | The address exactly as it would be typed into Minecraft's own server list, `host` or `host:port`. |
| `outputFolder` | Where the downloaded world is written on this computer. |
| `declaredVersion` | Which Minecraft version the person intends to connect with — compared against the server's actual reported protocol by `testConnection`. |
| `account.mode` | `microsoft`, `token`, or `offline`. Only `token` mode has anything to save through `saveToken`/`clearToken`. |
| `account.username` | The in-game name to present. |
| `options` | Free-form tool options (proxy port and similar), passed through validated but otherwise opaque to the IPC layer. |

Java resolution is deliberately narrow: `startWorldDownloader()`'s `ensureJava` calls
`discoverJava()` (never the provisioning `ensureJava()` from `main/java/`) with the packaged
`resourcesPath`, so a bundled runtime is offered exactly as it is to every other Java-resolving
call site in this application — but nothing here ever downloads a JVM on its own. `status()` is a
call the settings screen polls repeatedly; turning that into an unrequested multi-hundred-megabyte
download would be a status check with a very unwelcome side effect.

## Failure modes

Every one of `registerDownloaderHandlers`'s handlers **answers rather than rejects** — a
`worlddownloader:*` call never throws across the bridge. "No Java on this machine", "that port is
already taken", "the message did not describe a settings record", and "the server could not be
reached" are all ordinary successful answers carrying a `message` a screen can show directly, not
exceptions a screen has to catch and translate. The one thing the module refuses silently to leak
is the access token: `saveToken` takes one in, `clearToken` removes it, and nothing — including a
failure message — ever sends the plaintext back out.

## Security considerations

- The access token lives only in this application's own secret store (`DownloaderSecretStore`,
  backed by Electron's `safeStorage`), never in the renderer, never in a settings export, and
  never in a log line.
- `worlddownloader:start` re-validates the settings it is given with the same
  `validateDownloaderSettings` the renderer's own form uses, because a released renderer and a
  released main process are separate artifacts that can drift, and only one of the two checks is
  actually a security boundary.
- The proxy port probe (`worlddownloader:portFree`) binds and immediately releases the real port
  on `0.0.0.0` rather than reading a table of listening sockets, because a table can miss an
  exclusion or a lingering close state that an actual bind attempt cannot.
- Redacted arguments (`DownloaderSessionStatus.redactedArguments`) are what `status()` reports of
  a running session's command line — with the token replaced by index rather than value, so the
  screen can show "what this session was launched with" without ever holding the secret itself.

## Verification

`design/packages/app/src/main/worlddownloader/*.test.ts` covers the module's own logic (jar
verification, ping parsing, settings persistence, secret storage) in isolation. Two wiring guards
prove the module is actually reachable rather than merely present:

- `design/packages/app/src/main/worldDownloaderWiring.test.ts` reads `main/index.ts`'s real source
  and asserts `startWorldDownloader()` supplies `dataDir`, `safeStorage`, a non-provisioning
  `ensureJava`, and an `onEvent` that fans to every `BrowserWindow` — the same discipline
  `bundledRuntimeWiring.test.ts` already applies to every other Java-resolving call site.
- `design/packages/bridge/src/channels.test.ts` and `factory.test.ts` prove the
  `worlddownloader:*` channels and the `worldDownloader` bridge namespace agree with each other in
  both directions, so a channel cannot go reachable without a hosting-policy review.

On the renderer side, `design/packages/ui/src/components/worlddownloader/worldDownloaderBridge.test.ts`
proves the bridge resolver refuses a partial namespace rather than presenting invented progress,
and `WorldDownloaderScreen.test.ts` mounts the real screen against an injected fake bridge to
prove the unavailable state, the no-jar/no-Java blocked state, the settings form reflecting real
`readSettings()` answers, and a real start failure message all render honestly.

No end-to-end run against a live Minecraft server was performed as part of wiring this module —
that would need a real server to connect to, which this pass did not have. What is verified is
that the button now reaches the real IPC layer, the real IPC layer answers with the real module's
logic, and every failure or success path the module can report has somewhere honest to land.

## Related reading

- [Fetch a world from local Docker](./docker-world-source.md) — the other "fully built module, not
  yet wired to the UI" gap this document closes for the world downloader specifically.
- [Worlds from somebody else's release](./world-sources.md) — the release-asset input route.
- [Backing up a world or a rendered map](./backup.md) — where a downloaded world goes next.

## 廣東話

### 由伺服器攞返個世界 (World downloader)

一個世界唔一定要嚟自一個 release asset、一個 Docker daemon 或者一個 repository。佢可以就淨係坐喺一個
server 度，呢部電腦連隻碟都未掂過——得一條連線去嗰個 server。呢份文件講嘅就係呢條路：扮一個普通玩家連
去，用內置嘅 Fabric Carpet world downloader jar，將 server 送嚟嘅每個 chunk 存低。

`main/worlddownloader/` 一早已經寫晒、測試晒，但一直冇喺 `main/index.ts` 度俾人叫過——一個駁咗一頭、
另一頭冇人接嘅功能。而家 `startWorldDownloader()` 已經同佢個 `startDockerWorld()` 兄弟一樣，喺主程式
度注冊咗，事件經 `worlddownloader:event` 派畀每一個開緊嘅視窗，Java 就經 `discoverJava()` 搵，絕對唔
會偷偷落載成隻 JVM。

Renderer 呢邊，`window.worldlens.worldDownloader` 而家有齊十一條 channel 同一條事件 channel，
`WorldDownloaderScreen.vue` 就用嗰啲 channel 畫一個真.識報狀態嘅畫面：冇 Java 就講冇 Java，port 俾人
用緊就講俾人用緊，冇就靜靜哋等，唔會呃人講緊嘢做緊嘢。
