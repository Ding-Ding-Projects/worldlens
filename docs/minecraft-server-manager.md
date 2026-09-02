# Minecraft server manager

## Behaviour

WorldLens manages real Minecraft servers, wherever they run: a Java process on this
computer, a container on the local Docker daemon, or a container on a Docker daemon reached
over SSH. It is a destination in the left rail, **Minecraft servers**, which opens the
`mcservers` workspace job.

The rule that shapes the whole feature: **nothing in it is configured by typing.** Every
setting a server has — every key in `server.properties`, every nested key in
`paper-global.yml`, every plugin's own `config.yml` — is a real typed control, not a text
box standing in for one. See [`docs/mcserver-config.md`](./mcserver-config.md) for exactly
how that is built.

The server list shows every server this installation has been told about: its flavour
(Vanilla, Paper, Spigot, Bukkit, Purpur, Fabric, Forge, NeoForge, Velocity, BungeeCord), its
Minecraft version when known, where it lives, and a state chip (`Running`, `Stopped`,
`Created, not started`) that is asked of the machine every time it is shown rather than
cached across a restart. A cached "running" that survived a reboot would render as a green
dot beside a server that has been down for hours, which is worse than an honest "not checked
yet".

A **New server** wizard creates one: an id, a display name, a flavour picker, a server
folder chosen through a native browse button, a memory slider bounded to what a Minecraft
server can actually use, and a port stepper bounded to 1–65535.

The version step is a picker over a live catalogue rather than a text field: Vanilla reads
Mojang's own complete release and snapshot manifest, Purpur and Fabric read their own project APIs, and Paper and
Velocity read PaperMC's v3 API - which replaced the v2 API this used to read after v2 was
retired and started answering `410` to every request, silently leaving Paper and Velocity
with no versions to show. Vanilla entries are grouped into collapsible families with exact
counts, search keeps matching families visible, and the UI bounds how many controls it mounts
without truncating the cached catalogue. Every catalogued entry carries a release date shown
beside it and a verifiable SHA-256 of its own download where its upstream publishes one. Every
exact row also carries a Wiki action whose state distinguishes a verified article, an unavailable
article, and a link that has not been checked while offline. Typing a version by hand is possible
only behind an explicit switch, for a version newer than the catalogue that was fetched. See
[`docs/minecraft-version-catalogue.md`](./minecraft-version-catalogue.md) for the cache,
validation, grouping, and offline evidence contract.

Opening a server shows a tabbed panel with four real screens:

| Tab     | What it is                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Console | A live log tail plus command input, both over the transport described in [`docs/mcserver-transport.md`](./mcserver-transport.md)              |
| Config  | The typed `server.properties` / `paper-global.yml` / `paper-world-defaults.yml` editor from [`docs/mcserver-config.md`](./mcserver-config.md) |
| Plugins | Search, install and manage plugins — see [`docs/mcserver-plugins.md`](./mcserver-plugins.md)                                                  |
| Players | Whitelist, operators and bans, each a real table with an add-player dialog                                                                    |

### The console is a real console, not a read-only tail

Console input goes over RCON, which behaves identically whether the server is a local
process, a local container or one reached over SSH — a real player and permission editor
rather than a command box that silently discards what is typed into it. Output is read from
the server's own log. Attaching a session is not the same thing as the server's lifecycle: a
session is a follower that can be dropped and re-established, and detaching it stops the
follower without touching the server.

### Adoption exists in the backend and is not reachable from the interface today

A server WorldLens did not create — one somebody points this app at after the fact — is meant
to be **adopted**, never silently claimed. Discovery is read-only: it inspects a container,
its mounts and its logs, scores how confident the match is, and starts, stops or writes
nothing while doing it. Taking one over is meant to be an explicit, per-container decision
with four independent permissions (control it, change its files, install plugins, send it
commands), reviewed in an `AdoptionReviewDialog` before the server is added to the list at
all.

That dialog, and the discovery logic behind it, are built and tested — but **the button that
is supposed to open it does nothing.** `ServerListScreen.vue` emits an `adopt` event when its
"Adopt an existing server" control is clicked; nowhere the screen is mounted (all three sites
in `App.vue`) listens for that event, and `AdoptionReviewDialog.vue` is not mounted anywhere
in the application outside its own tests. There is also no browser screen that lists
candidate containers for adoption to review in the first place. Clicking the button today is
a dead end: nothing opens, nothing happens, and no error is shown either. This is a known gap
tracked in the project's issue tracker, not a documented user-facing capability, and it should
not be described as working until the button is wired to the dialog and a discovery screen
exists to feed it.

Forgetting a server (removing it from this app's own list) is unaffected by that gap and is
always available, including for a server that was manually adopted by hand-editing the
registry: it never touches the container or folder itself, and goes through the same two-key
super-confirmation gate every other destructive action in this app uses, saying plainly that
nothing on disk or in Docker is deleted.

### A server can also live on infrastructure this app provisions

A fourth place a server can live — an EC2 instance this application creates for it — has a
complete, tested planning and provisioning backend (region and instance-type selection, a
priced plan shown before anything is created, security-group rules, an optional Elastic IP,
teardown) documented in [`docs/mcserver-aws.md`](./mcserver-aws.md). The create wizard now
offers **AWS EC2** when the shell exposes the `mcserver.aws` bridge, and routes the completed
server straight to the existing AWS planning/provisioning tab. Older shells without that
bridge omit the option rather than offering a dead button.

### The web management console

A server's console, config, plugins and players are also reachable from an ordinary web
browser, not only from the desktop shell, through a locally hosted, password-protected HTTP
server. See [`docs/mcserver-web-console.md`](./mcserver-web-console.md).

## Configuration

Nothing in this screen is configured through a settings page of its own. Every value a
server needs — its flavour, its `server.properties` keys, its whitelist and bans — lives on
the server record or inside the server's own files, read and written through the Electron
bridge's `mcserver` namespace (`list`, `get`, `save`, `forget`, `probe`, `status`, `start`,
`stop`, `console.*`, `files.{list,read,write}`, `plugins.*`, `players.*`,
`webConsole.*`). The renderer never assumes that namespace exists: a build with no bridge,
or an older bridge that has not caught up with a newer renderer, reports `canList: false`
and every surface says plainly that this build cannot reach a Minecraft server host, rather
than showing an empty list that reads as "you have no servers".

## Failure modes

Every call to the bridge answers `{ ok: true, value }` or `{ ok: false, failure: { code,
message, detail } }`; nothing here throws. A failed list load keeps whatever was last shown
and surfaces the failure message rather than emptying the list — an empty list is a claim
that there are zero servers, and a failed read is a different, honest claim. A file write
gated on a stale hash is refused with a stated reason rather than silently overwriting
something that changed underneath it.

Every lifecycle and file action checks the server's transport capabilities first (`probe`),
and a control whose action cannot succeed is disabled with the reason named in its own
tooltip: unreachable host, read-only transport, an adopted server whose owner never granted
that permission, or the action simply not making sense right now (starting something already
running, stopping something already stopped).

## Security considerations

- An RCON password, when one exists, never appears in the renderer. The record only carries
  `hasRconSecret: true/false`; the secret itself lives in the operating system credential
  vault, exactly as a toy-lock TOTP secret does.
- An adopted server's write scope is meant to be enforced by the transport, not by this
  screen trusting itself: every write and destroy path asks the transport's own capabilities
  before offering the control. This machinery exists and is tested, even though the
  interface path that would let a user reach adoption in the first place does not yet exist
  (see above).
- Forgetting a server never deletes anything outside this app's own list. The confirmation
  copy says so explicitly, because the one thing this action must never be mistaken for is
  destroying the server itself.
- Player-list edits (whitelist, operators, bans) write real files under the server root; they
  go through the same write-capability gate and the same stale-hash protection as
  `server.properties`.

## Verification

- `packages/app/src/main/mcserver/` and `packages/ui/src/components/mcserver/` together carry
  several hundred test cases across the registry, the three transports, config parsing and
  round-tripping, the console session, RCON, players, plugins (install, manage, three
  external sources, compatibility), adoption scoring and consent, the web console (password,
  sessions, lockout ladder, HTTP server) and AWS planning — all against fakes and in-memory
  transports, none against a real Docker daemon, a real SSH host or a real `java -jar`
  process.
- `packages/ui/src/components/mcserver/mcserverShellWiring.test.ts` is the seam guard: that
  `App.vue` actually calls `provideServerStore` from the real resolved host, that the
  `mcservers` job and its catalogue entry exist and route to it, and that the job's content
  renders the real screens.
- Not covered by any test: the adoption button's missing listener, and the absence of an
  adoption-browsing screen — both are read directly from the source in this document rather
  than asserted by a guard, which is exactly why they are called out here in plain language
  instead of only in a status badge.
- Not yet run: an interactive capture against a real local-process or Docker Minecraft
  server, and any exercise of the AWS provisioning path against a real AWS account. The
  store and its screens are exercised against a fake host; nothing in this project has
  launched an actual `java -jar` process, a real Docker container or a real EC2 instance to
  prove the feature end to end.
