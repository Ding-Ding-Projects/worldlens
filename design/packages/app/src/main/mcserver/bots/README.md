# Command graph and bot backend integration

`registerCommandBotOperations` registers the command and bot methods through an injected main-process registrar. The owning application supplies trusted target resolution, connection locking, account-reference authorization, runtime/client launch ports and its central IPC adapter. Renderer requests never provide executables, target proofs or raw command strings. Command previews are held in main, expire after 60 seconds and are consumed once.

## Commands

`discoverCommands(decodedDeclareCommandsPacket, target)` consumes an actual `declare_commands` packet from an authenticated game-protocol connection. It retains every supplied node, parser identifier/properties, redirect and suggestion provider. Its completeness claim is limited to that connection's principal and permission revision. It does not claim to discover commands unavailable to that account.

`discoverGeneratedReport(bytes, receipt, target)` consumes an exact official server data-generator report. The receipt binds its bytes to the selected server version and distribution. Its `official-report-only` verdict is a static inventory, not a complete plugin inventory or live authorization. It cannot dispatch.

`previewCommand(graph, steps, dimension)` follows actual graph edges and redirects. Only verified serializers are enabled. Every unknown parser retains an explicit unavailable descriptor. Point operands carry their dimension. `regionArguments` converts a validated rectangle to two actual graph coordinate arguments; path operands use the same point/dimension validation.

`dispatchPreview(preview, currentGraph, dispatch)` reacquires the current graph, checks the target identity, connection epoch, permission revision, graph revision and exact displayed command, then dispatches only the rebuilt command. The caller must hold its server/connection operation lock across revalidation and dispatch. Its dispatch callback must use that same principal and connection. Never substitute an elevated console channel for a game-protocol principal.

Implemented typed serializers are boolean, bounded number, exact signed 64-bit integer, Brigadier string modes, block/vector positions and dimension identifiers. Entity selectors, block-state/property editors, registry-backed item/resource controls, components/NBT and extension parsers remain unavailable until their exact version-bound serializers and registries are supplied. This is intentionally visible in the descriptor, not represented as a complete editable command catalog.

## Mineflayer

`loadMineflayerRuntime(navigation)` loads exactly Mineflayer 4.39.0 and optional mineflayer-pathfinder 2.4.5. The owning runtime manifest must pin these dependencies; the backend does not download executable dependencies at operation time. Node 22 or later is required. Exact version membership comes from the installed Mineflayer runtime, with support beyond the documented 26.1 boundary refused.

`MineflayerSession` resolves only an opaque `accountRef` through a protected provider. The provider returns the username, authentication mode and optional protected profile-cache directory. It must use the approved account setup flow and must not expose credentials, device-flow data or cached authentication to logs or projects. Connected state requires a real server spawn. Command graph updates come directly from the underlying protocol client. Navigation uses the actual pathfinder plugin, preserves dimension checks and reports cancellation/results. Stop waits for the observed connection end. Raw error/kick text is not retained because it can contain account or server-private data.

## Genuine Baritone client

The separately managed profile is Minecraft 1.21.4, Java 21, Fabric Loader 0.16.9 and official Baritone 1.13.1. Official newer distributions exist, including 26.3, but this bridge does not claim compatibility with them. The exact source and release-asset digest are recorded in `sources.json`.

`baritone-client/src/main/java/org/worldlens/bot/WorldlensBotBridge.java` is actual Fabric client code. It executes `BaritoneAPI` navigation and cancellation on the real client thread and observes the actual player/world. The private parent-owned stdin/stdout channel opens no control port. Raw client output is discarded; only bounded, version-checked bridge events enter status.

The owning root `build.bat` must invoke `buildBaritoneBridge` from `baritone-client/build-bridge.mjs` after its supported Java/Gradle bootstrap. The helper checks Java 21 and Gradle 8.12.1, downloads the official Baritone release with `gh`, verifies its SHA-256, runs the real Fabric Loom build and emits the bridge jar, official Baritone jar and build receipt. It never substitutes a successful no-op when tools are missing. Fabric Loom 1.9.2 and Yarn 1.21.4+build.8 are pinned in `build.gradle`.

`installBaritoneClient` checks the jar receipts, installs into the caller's explicitly owned client directory without overwriting existing mods and reads both installed digests back. `BaritoneSession` requires a protected launcher that launches this exact verified Fabric client. The launcher must resolve the protected account reference without putting authentication values in process arguments, logs or project files. Client startup alone never establishes connected state. Valid bridge world telemetry establishes connection; navigation acknowledgement and observed path state remain separate. Stop waits for actual child exit, and forced termination affects only the session's owned child.

The protected launcher implementation is present in `launcher.ts`; Java compilation, full client installation and real server/navigation acceptance still require integration and verification. The Node child protocol test verifies the controller only and is not evidence of a Java client or server connection.

## Focused verification

The self-contained tooling package in `commands/` keeps locked development dependencies, without junctions or changes to the application manifest. Run `npm ci --prefix commands`, then `npm test --prefix commands` and `npm run typecheck --prefix commands` from this directory. These checks do not replace the repository root build or installer entrypoints. Runtime, Java build, client authentication and actual server acceptance remain separate verdicts.


## Production provider wiring

Await `createProductionBotPorts` with the application's user-data directory, staged authentication
worker path and a trusted endpoint resolver. An endpoint contains server ID, host, game port, exact
version and distribution digest (or an explicit unknown marker). Never infer an endpoint from a
label. Supply `preparedBaritone` and the approved hidden-client spawn only after actual preparation.
Pass these ports to `registerBotIpc` and use its returned `discover`, `preview` and `execute`
functions for command IPC so the same session registry owns discovery and dispatch.

The trusted bot bridge exposes `configuration`, `configure`, `signIn`, `devicePrompt` and
`cancelSignIn` beside the existing operations. Only the public application identifier is persisted
in `bot-public-client.json`; the account store encrypts its records through OS-protected storage.
Device challenges stay in memory, are bounded and expire; cancellation/completion clears them.
The account picker returns only opaque references and labels.

Packaging must retain `auth-worker.mjs` beside the configured worker path, with its pinned
`prismarine-auth` dependency resolvable in the isolated child. The Java build emits
`worldlens-baritone-client-1.0.0.jar`, `baritone-api-fabric-1.13.1.jar` and
`baritone-build-receipt.json`; stage all three together. A staged file is not live account,
client installation or navigation proof.

`stageBotRuntimeAssets({ outputDirectory, bridgeDirectory? })` copies and reads back the authentication worker. When a bridge directory is supplied it requires the exact Java build receipt and verifies both jar hashes before copying. Omitting that directory stages only authentication and reports `baritoneStaged: false`; it never implies the Java client is available.
