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

The production provider uses the platform-protected account store and a main-owned endpoint
resolver. Enter your registered Microsoft **public application client ID**, save it, prepare an
account label, then select **Sign in to selected account**. The Microsoft device challenge is
shown only in the trusted application window and expires. Cancellation clears the challenge.
No client secret is requested. An application registration and a licensed account are required;
the application does not invent either or imply consent.

Deploy Mineflayer after sign-in. Its actual connection supplies the discovered command graph.
The server endpoint is resolved from the registered transport rather than renderer input. Command
execution is tied to the authenticated profile UUID and connection attempt. Changing the endpoint,
reconnecting or selecting another connection invalidates an older preview. Navigation, cancellation,
stop and reconnect operate on the owned session.

Baritone additionally needs a prepared Java 21/Fabric client, the built bridge and verified official
mod. The production provider accepts the genuine managed launcher only when those inputs and the
approved hidden-desktop launch route are available. Java bridge compilation and first client download
remain distinct operations with their own consent and verification; unavailable preparation is shown
explicitly.

## Failure modes

- A request for an unknown server returns the registry's own not-found answer.
- A malformed request, an unsupported engine or a non-finite coordinate is refused as invalid before
  the registrar is reached.
- A preview that expired or was already executed is refused; so is a concurrent preview beyond
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

The focused command and bot suite contains 32 passing tests, including account-list protection,
public-client configuration persistence, changed-endpoint/session rejection and same-principal
command dispatch. The focused TypeScript check passes with the existing workspace dependencies.
These are source checks, not live acceptance. Real Microsoft account consent, server connection,
Java compilation, packaged worker loading and navigation have not been exercised in this change.

## Sources and suggested articles

- `design/packages/app/src/main/mcserver/bots/README.md`
- `design/packages/app/src/main/mcserver/bots/register.ts`
- `design/packages/app/src/main/mcserver/bots/wiring.ts`
- `design/packages/ui/src/components/mcserver/BotWorkflowPanel.vue`
- [Creating Minecraft servers](./mcserver-hosting.md), [Map drawing and commands](./map-drawing-and-commands.md)
