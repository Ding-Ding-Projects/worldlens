# Minecraft server configuration

Editing a server's settings without opening a text editor, and without losing anything that
was already in the file.

## Behaviour

Every setting a Minecraft server has is presented as a real control. This is the rule the
whole feature exists to keep, so it is worth being concrete rather than slogan-shaped:

| What the setting is | What you get | Examples |
| --- | --- | --- |
| A yes/no | A switch | `pvp`, `online-mode`, `spawn-monsters`, `hardcore` |
| A fixed set of choices | A menu | `difficulty`, `gamemode`, `level-type` |
| A bounded number | A stepper that knows its own limits | `view-distance` (2–32), `max-players`, `spawn-protection` |
| A port | A stepper bounded to 1–65535 | `server-port`, `query.port`, `rcon.port` |
| A colour | The colour picker | chat and message-of-the-day colours |
| A folder or file | A field with a native browse button | world and plugin locations |
| A list | A chip editor | allowed hosts, per-world lists |
| Records | A table with an add dialog | operators, whitelist, bans |
| Genuine prose | A text box — and only here | the message of the day, kick messages |

A text box is the failure this feature exists to avoid, so it is not left to whoever writes
each schema to remember. A test enumerates every shipped field and fails the build when a
setting whose type is a boolean, a menu, a number, a port, a colour, a path, a list or a
record has resolved to a plain text control.

### The schema is a view; the file is the truth

The editor never round-trips a configuration through a plain object. It parses the file into
a document that keeps the original bytes, the line endings, the comments, the blank lines
and the order everything appeared in — and then a schema describes *some* of those entries
so they can be rendered as controls.

That ordering matters more than it sounds. Because the document is what gets written back, a
key the schema has never heard of is just another node in it, so **a save that changes one
setting cannot drop a setting it did not understand.** That single property is what makes it
safe to edit a file a plugin wrote, or a file from a newer Minecraft version than this
release knows about.

### Settings nobody has described

Plugins ship their own configuration files and there is no catalogue of them. Rather than
give up and show a text area — which would break the rule above — an unknown file has a
schema *inferred from its own values*: a boolean becomes a switch, a whole number under a
key ending in `port` becomes a bounded port stepper, a `§`- or `#`-prefixed string becomes a
colour, a list of similar records becomes a table. Inferred fields are badged as guesses, so
nobody mistakes an assumption for a documented range.

## Configuration

| Concern | Behaviour |
| --- | --- |
| Which schema applies | Resolved by file kind, server flavour and version range, so Paper 1.21 and Paper 1.17 can describe the same file differently |
| Files understood | `server.properties`, `bukkit.yml`, `spigot.yml`, `paper-global.yml`, `paper-world-defaults.yml`, `ops.json`, `whitelist.json`, `banned-players.json`, `eula.txt`, and arbitrary plugin YAML |
| Where the file lives | Read and written through the server transport, so a local folder, a container and a container on another machine behave identically |
| Backups | The previous contents are copied aside before a file is replaced |

## Failure modes

**The file changed while you had it open.** Every write quotes the hash of the bytes that
were read. If a plugin rewrote the file, or the server flushed its defaults on shutdown, the
write is refused as `stale-document` and **nothing is written**. This is the difference
between an editor and a way of losing whatever the server just saved.

**A value does not match its described type.** The field renders with its proper control and
an option to keep the original text, so declining the conversion leaves the entry
byte-identical.

**A YAML anchor or a merge key.** These are rendered read-only with an explanation. Editing a
value through an alias silently changes another key elsewhere in the file, which is a
surprising thing for a settings screen to do.

**The file cannot be parsed at all.** It is reported as unreadable rather than being
rewritten from an empty document, because rewriting is indistinguishable from deleting it.

## Security considerations

The editor writes only inside the server's own folder, and only inside the directories it has
permission for — every path passes through the transport's single scope check, which refuses
rather than adjusts. An adopted container that was granted file access to `plugins` only
cannot have its `server.properties` rewritten from here.

`eula.txt` is a single switch carrying a link to the agreement. It is never written as
accepted except by an explicit action; nothing in the creation flow sets it as a side effect
of anything else.

Nothing in a configuration file is treated as a credential by this layer. An RCON password
that a server keeps in `server.properties` is held in the operating system's credential
vault instead, and the file's copy is managed rather than displayed.

## Verification

```
cd design
./node_modules/.bin/vitest run packages/app/src/main/mcserver/
```

The two tests that matter most, both watched failing before being trusted:

**The no-text-box guard.** Changing `pvp` from a switch to a text control turned it red and
named the offending key; restoring turned it green. It also caught two genuine defects while
being written — a port pattern that matched `use-native-transport`, and empty-file newline
detection returning the wrong answer — which is a guard doing its job before it has even
shipped.

**Byte-for-byte round-trip.** Parsing and re-serialising a file with no changes must return
the original bytes exactly. The corpus is deliberately awkward: comments and blank lines,
Windows line endings, a missing trailing newline, duplicate keys, unicode escapes, YAML
anchors and aliases, multiple merge keys, deep nesting, flow sequences and block scalars.

**What is not verified.** These files have not been read from or written to a real running
Minecraft server, and no capture exists from a packaged build. The tests show the parser and
the schemas behave as specified; they do not show a server accepted the result.
