# Minecraft server manager

## Behaviour

This screen manages real Minecraft servers WorldLens can see, wherever they run: a Java
process on this computer, a container on the local Docker daemon, or a container on a Docker
daemon reached over SSH. It is a sixth Home catalogue, **Host a server**, that opens the
`mcservers` workspace job.

The server list shows every server this installation has been told about, with its flavour
(Vanilla, Paper, Spigot, Bukkit, Purpur, Fabric, Forge, NeoForge, Velocity, BungeeCord), its
Minecraft version when known, where it lives, and a state chip (`Running`, `Stopped`,
`Created, not started`, and so on) that is asked of the machine every time it is shown rather
than cached across a restart. A cached "running" that survived a reboot would render as a
green dot beside a server that has been down for hours, which is worse than an honest "not
checked yet".

Opening a server shows its own panel: **Start** and **Stop**, a read-only console tail (the
bridge has no interactive console-send call today, so this is a genuinely honest surface
rather than a command box that silently discards what is typed into it), a
`server.properties` editor built from real typed controls (switches for booleans, selects for
`difficulty` and `gamemode`, bounded steppers for ports and player counts - never a raw text
box standing in for a picker), a plugins-folder listing, and three player-list tables
(whitelist, operators, bans) with an add-player dialog.

A **New server** wizard creates one: an id, a display name, a flavour picker, an optional
version, a server folder chosen through a native browse button, a memory slider bounded to
what a Minecraft server can actually use, and a port stepper bounded to 1-65535.

### Adoption

A server WorldLens did not create - one somebody points this app at after the fact - is
**adopted**, never created. Adoption never assumes full trust: every write, lifecycle and
destroy action asks the transport what it may actually do before offering the control, and a
disabled control names the exact reason (`This server was adopted, not created here, and this
app was not given permission to write its files.`) rather than doing nothing silently. The
**Adopt this server** review dialog shows exactly what will and will not be permitted -
lifecycle, file writes, destroy, and which console mechanism is available - before the server
is added to the list at all.

Forgetting a server (removing it from this app's own list) is always available even for an
adopted server, because forgetting never touches the container or folder itself; it goes
through the same two-key super-confirmation gate every other destructive action in this app
uses, and says plainly that nothing on disk or in Docker is deleted.

## Configuration

Nothing here is configured through a settings page of its own. Every value a server needs -
its flavour, its `server.properties` keys, its whitelist and bans - lives on the server
record or inside the server's own files, read and written through the Electron bridge's
`mcserver` namespace (`list`, `get`, `save`, `forget`, `probe`, `status`, `start`, `stop`,
`files.{list,read,write}`, `logTail`). The renderer never assumes that namespace exists: a
build with no bridge, or an older bridge that has not caught up with a newer renderer,
reports `canList: false` and every surface says plainly that this build cannot reach a
Minecraft server host, rather than showing an empty list that reads as "you have no servers".

## Failure modes

Every call to the bridge answers `{ ok: true, value }` or `{ ok: false, failure: { code,
message, detail } }`; nothing here throws. A failed list load keeps whatever was last shown
and surfaces the failure message rather than emptying the list - an empty list is a claim
that there are zero servers, and a failed read is a different, honest claim. A file write
gated on a stale hash is refused with a stated reason rather than silently overwriting
something that changed underneath it.

Every lifecycle and file action checks the server's transport capabilities first
(`probe`), and a control whose action cannot succeed is disabled with the reason named in its
own tooltip: unreachable host, read-only transport, an adopted server whose owner never
granted that permission, or the action simply not making sense right now (starting something
already running, stopping something already stopped).

## Security considerations

- An RCON password, when one exists, never appears in the renderer. The record only carries
  `hasRconSecret: true/false`; the secret itself lives in the operating system credential
  vault, exactly as a toy-lock TOTP secret does.
- An adopted server's write scope is enforced by the transport, not by this screen trusting
  itself: every write and destroy path asks the transport's own capabilities before offering
  the control, so a server this app was only given read access to cannot be written to by a
  UI bug alone.
- Forgetting a server never deletes anything outside this app's own list. The confirmation
  copy says so explicitly, in both the ordinary and adopted cases, because the one thing this
  action must never be mistaken for is destroying the server itself.
- Player-list edits (whitelist, operators, bans) write real files under the server root; they
  go through the same write-capability gate and the same stale-hash protection as
  `server.properties`.

## Verification

- `packages/ui/src/components/mcserver/serverModel.test.ts` - pure logic: state labels,
  capability-gated block reasons, sort/filter/search, and wizard validation. No Vue, no
  bridge.
- `packages/ui/src/components/mcserver/serverStore.test.ts` - the store against a hostless
  build (reports `canList: false`, every mutation fails with a stated reason) and against a
  fake host (load, save, forget, probe, status caching, running count), plus
  `resolveServerHost`'s host-probing contract.
- `packages/ui/src/components/mcserver/mcserverShellWiring.test.ts` - the seam guard: that
  `App.vue` actually calls `provideServerStore` from the real resolved host, that the
  `mcservers` job and the `host` catalogue exist and route to it, and that the job's content
  renders the real screens. Broken on purpose (commenting out the `provideServerStore` call)
  and confirmed red, then restored and confirmed green, before being relied on.
- Mount-level coverage of the screens lives alongside their own components where practical.

Not yet run: an interactive capture against a real local-process or Docker Minecraft server.
The store and its screens are exercised against a fake host; nothing in this pass launched an
actual `java -jar` process or Docker container to prove the transport layer end to end - that
remains the transport lane's own verification, not this UI lane's.
