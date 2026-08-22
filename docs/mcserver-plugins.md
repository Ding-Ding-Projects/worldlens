# Minecraft server plugins

Finding, installing and managing plugins for a Bukkit-family or mod-loader server, without
uploading a jar by hand.

## Behaviour

The Plugins tab of a server's panel does three things: search a catalogue, install a chosen
version, and manage what is already on disk.

Search reaches three real, independent sources — Hangar (PaperMC's own registry), Modrinth
and SpigotMC (via the Spiget mirror API) — each behind the same `PluginSource` interface, so
the manager never has three different result shapes to render. A version a user picks is
downloaded and written through the server's transport (`fileWrite`), the same seam the config
editor and the backup runner use, so installing a plugin works identically whether the server
is a local process, a local Docker container or one reached over SSH.

What is already installed is listed by reading the plugins (or mods) folder directly through
`transport.fileList` / `fileRead` and parsing each jar's own bundled descriptor —
`plugin.yml` for Bukkit-family plugins, `fabric.mod.json` for Fabric, `META-INF/mods.toml`
for Forge/NeoForge — never the jar's filename, because a filename is a rename away from being
wrong. From there a plugin can be enabled, disabled (renamed with a `.jar.disabled` suffix,
never deleted, so disabling is reversible without needing a backup), removed outright, or
checked for an update against the same source it came from.

### Compatibility is judged from facts, not from a name

Before offering to install a version, the manager checks whether the server's flavour can
actually load it. Paper, Purpur and Spigot are all Bukkit-API servers, so a plugin built
against the `bukkit`, `spigot` or `paper` loader tag loads on any of them — a Paper-only
plugin using Paper-specific API will simply not load on plain Spigot, which is a runtime fact
no metadata can predict, so the verdict there is `compatible` on the strength of the loader
tag, the same promise the platform itself makes. Fabric and Forge/NeoForge mods are judged
against their own loader tags and never treated as interchangeable with a Bukkit plugin. The
verdict is always one of `compatible`, `incompatible` or `unknown` — never a guess dressed up
as certainty — decided purely from the server's flavour and the plugin version's declared
`loaders` and `gameVersions`, with no name-sniffing anywhere in the function.

## Configuration

Nothing here has its own settings screen. Which plugin sources are queried, and the
credentials or rate limits each API imposes, are fixed in the source modules
(`hangar.ts`, `modrinth.ts`, `spigot.ts`) rather than exposed as a user-editable setting,
because none of the three public APIs this feature talks to require one.

## Failure modes

Every call answers `{ ok: true, value }` or `{ ok: false, failure }`; nothing throws. A
source that is unreachable or rate-limited fails that one source's search rather than
failing the whole request — a plugin search still returns results from the sources that did
answer. An install is refused, not partially applied, when the write itself fails partway;
the transport's whole-file, hash-gated write behaviour (described in
[`docs/mcserver-transport.md`](./mcserver-transport.md)) is what plugin installation and
removal are built on, so a plugin write can never leave a half-written jar on disk from a
successful call.

## Security considerations

- A downloaded plugin jar is written to disk exactly as fetched and its SHA-256 is recorded
  alongside the installed record; nothing here executes a plugin's code to inspect it, and
  no source is trusted more than the transport-level write path already trusts any file.
- Disabling a plugin never runs its code and never deletes it — the `.jar.disabled` rename is
  reversible with no data loss, which matters because "disable" is the safer default action
  compared to "remove" when a user is not certain a plugin is the cause of a problem.
- Removing a plugin goes through the same write-capability gate as every other file action on
  a server: an adopted server whose owner never granted `pluginInstall` refuses the action
  and names the exact reason, rather than silently no-op-ing.

## Verification

- `packages/app/src/main/mcserver/plugins/install.test.ts`, `manage.test.ts` and
  `compatibility.test.ts` cover downloading and writing a version, listing/enabling/
  disabling/removing/updating what is on disk, and every compatibility verdict across every
  server flavour and loader combination.
- `packages/app/src/main/mcserver/plugins/sources/hangar.test.ts`, `modrinth.test.ts` and
  `spigot.test.ts` cover each source's request shaping and response parsing against fixture
  responses, not against the live Hangar, Modrinth or Spiget APIs.
- `packages/ui/src/components/mcserver/PluginManager.vue` is exercised through the shared
  `mcserverPanels.mount.test.ts` mount coverage and the bridge contract tests in
  `mcserverBridge.test.ts`.
- Not yet run: a search, install, enable/disable or removal against a real Hangar, Modrinth
  or Spiget endpoint, and any of the above against a real, running Minecraft server rather
  than an in-memory transport.
