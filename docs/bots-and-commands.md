# Discovered commands and bots

Build a server command from the command graph the server itself declares, preview the exact text
before it is dispatched, and deploy a bot that joins the server with a protected account. This
article describes what the source does and what this build can and cannot offer.

## Behaviour

A command graph comes from an authenticated game-protocol connection's `declare_commands` packet,
or from the official server data-generator report for the exact selected version. The graph keeps
every node, parser identifier, redirect and suggestion provider. Its completeness claim is limited
to the account and permission revision it was read from.

The command builder follows real graph edges. Only verified serializers produce typed controls:
booleans, bounded numbers, exact 64-bit integers, Brigadier string modes, block and vector
positions and dimension identifiers. Every other parser keeps an explicit unavailable descriptor;
a raw copy is an expert fallback, not a claim of safe execution. A spatial operand picked on the
map carries its dimension. `/execute` is its own tab of ordered subcommand clauses.

A preview is held in the main process for sixty seconds and consumed once. Executing it reacquires
the current graph, checks target identity, connection epoch, permission revision, graph revision and
the exact displayed command, then dispatches the rebuilt command on the same principal. Selecting a
point never executes anything.

Bots use either the installed Mineflayer runtime, pinned to 4.39.0 with pathfinder 2.4.5, or a
separately built Baritone client bound to Minecraft 1.21.4. A bot resolves only an opaque account
reference through a protected provider; connected state requires a real spawn, and raw kick or
error text is discarded because it can carry account or server data.

## Configuration

**What this build can honestly do.** The bot workflow channels are registered, so the panel receives
real answers. Profiles are described from the server record's version and the installed Mineflayer
runtime's declared versions, and every engine is reported unavailable with one reason: this build
has no authenticated game-protocol connection and no protected game account store. Deploy, account
preparation, discovery and execution answer with that same reason instead of a missing handler.

Enabling the workflow needs three pieces that do not exist yet: a protected account setup flow with
a Microsoft public client id, a trusted command target that owns a live protocol connection and its
command lock, and, for Baritone, the Java client bridge built by `build-bridge.mjs` after the Java
21 and Gradle bootstrap.

## Failure modes

- A request for an unknown server returns the registry's own not-found answer.
- A malformed request, an unsupported engine or a non-finite coordinate is refused as invalid before
  the registrar is reached.
- A preview that expired or was already executed is refused; so is a sixth concurrent preview beyond
  the 128 outstanding limit, or a seventeenth live bot.
- A reconnect whose client has not finished disconnecting within five seconds stays pending and says
  so.

## Security considerations

Renderer requests never provide executables, target proofs, account values or raw command strings.
Command dispatch always uses the game-protocol principal that read the graph; an elevated console
channel is never substituted. The Baritone bridge opens no control port, and client output is
discarded except for bounded, version-checked bridge events. Every channel requires the
application's own main frame as sender.

## Verification

On the integrated tree: 23 focused command and bot tests in the lane's own tooling package, the 5
bot wiring tests, and the bridge channel inventory tests pass; the app package typechecks. Not
verified here, and not claimed: any real account, client, server connection, Java compilation or bot
navigation.

## Sources and suggested articles

- `design/packages/app/src/main/mcserver/bots/README.md`
- `design/packages/app/src/main/mcserver/bots/register.ts`
- `design/packages/app/src/main/mcserver/bots/wiring.ts`
- `design/packages/ui/src/components/mcserver/BotWorkflowPanel.vue`
- [Creating Minecraft servers](./mcserver-hosting.md), [Map drawing and commands](./map-drawing-and-commands.md)
