# Server configuration editor

Every configuration file a managed Minecraft server has, described as typed fields and edited with
real controls, with changes applied only against the exact file version they were made from.

## Behaviour

The editor lists a server's configuration files and, for the selected file, the fields inside it.
Properties files, YAML, JSON and TOML are parsed into a tree; each leaf is rendered by its actual
type as a switch, a numeric field, a text field, an enumerated selector, a nested object, a list
or a record table. Unknown fields and comments survive a save, and `null`, booleans and numbers keep
their distinction rather than passing through `String(value)`.

**Discover** walks the server folder recursively, to a bounded depth and entry count and without
following symbolic links, so the file list comes from the folder itself. When discovery is not
available the editor keeps its known files and says so.

Explicit record tables cover `ops.json`, `whitelist.json`, `banned-players.json` and
`banned-ips.json`, with typed columns for operator level, bypass flags, ban source, reason and
expiry. Edits accumulate in a draft with validation and a reviewable list of changes before apply.

Apply sends the expected file hash with the changes. If the file changed underneath, the server
answers with a stale-document conflict and the draft is kept, so a reload or reapply is a choice
rather than a silent overwrite. Reset means resetting the draft, never altering a live server.

## Configuration

Describe, discover and apply all use the same server transport the rest of server management uses,
so an SSH or container server is edited the same way a local one is. Discovery limits default to
depth 8 and 10,000 entries and are not renderer-adjustable.

## Failure modes

- A path that is not a plain relative file name is refused before the transport is touched.
- A file the describer cannot parse is reported as not describable; the original is unchanged.
- A change without the file's expected hash is refused: without it there is nothing to check the
  write against.
- Discovery stops at its bounds and reports `truncated` rather than pretending the list is complete.

## Security considerations

All reads and writes go through the server's transport with the capabilities its record allows; an
adopted server keeps exactly what its owner consented to. Path confinement rejects traversal and
absolute paths. Nothing here edits a file outside the server folder.

## Verification

On the integrated tree: the configuration discovery and JSON parsing tests, the server-management
IPC wiring tests, the editor and recursive value editor UI tests pass; the `mcserver:config:discover`
channel is registered in the main process and in the bridge allowlist. Not verified here: editing a
real Paper or Purpur server, and the packaged Windows application.

## Sources and suggested articles

- `design/packages/app/src/main/mcserver/config/describe.ts`
- `design/packages/app/src/main/mcserver/config/discover.ts`
- `design/packages/ui/src/components/mcserver/ServerConfigEditor.vue`
- [Creating Minecraft servers](./mcserver-hosting.md), [Generating a world and project](./server-generation.md)
