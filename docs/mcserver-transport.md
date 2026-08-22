# Minecraft server transport

How WorldLens reaches a Minecraft server, wherever it happens to be running.

## Behaviour

A Minecraft server can live in three places, and one interface covers all of them so that
every feature above it — the console, the configuration editor, the plugin manager, the
backup runner — is written once rather than three times.

| Target | `TransportRef.kind` | Reached by |
| --- | --- | --- |
| A process on this computer | `local-process` | A child process, and this machine's own filesystem |
| A container on this computer's Docker daemon | `local-docker` | The `docker` command |
| A container on another machine's daemon | `ssh-docker` | The same `docker` commands, over SSH |

The third is not a second implementation of the second. `remote/ssh.ts` already exports
`sshCommandRunner(options)`, which returns the same `CommandRunner` type
`runtime/command.ts` defines and `dockerhosting/manager.ts` already accepts, so the SSH
transport is the Docker transport handed a different runner. If the two ever need to differ
in *behaviour* rather than in transport, that is a capability flag or a defect — not a
reason to fork the file.

Every call answers with `Answer<T>`: `{ ok: true, value }` or `{ ok: false, failure }`.
Nothing throws. A server that is not running, a daemon that cannot be reached and a path
that is out of bounds are all ordinary answers a caller has to handle differently, and
turning them into exceptions would only mean every caller wrapping every call in the same
`try`/`catch` to turn them back into values.

### `unreachable` is not `not-running`

These are separate failure codes and keeping them apart is the most important distinction
in the module. "I lost the connection to that machine" and "the server has stopped" look
identical from a log stream that went quiet, and a screen that renders the first as the
second offers a restart button for a server that is running perfectly well with people on
it. Liveness is judged by asking Docker directly (`inspect .State.Running`), never by
noticing that output stopped arriving.

### Files

Reads return the whole file plus a SHA-256 of its bytes. Writes are whole-file, atomic, and
gated on the hash the caller last read: if the file moved in between — the server flushed
its defaults on shutdown, a plugin rewrote it — the write is refused as `stale-document`
rather than silently discarding whatever changed. The local transport also copies the
previous contents into `.worldlens-backups/` before replacing a file.

Whole-file only, deliberately. `docker cp` is not a general filesystem — no seeks, no
partial writes — so offering an interface richer than the weakest transport can honour
would produce three implementations that quietly differ.

### The console

Output is read from the server's log. Input goes over RCON, which behaves identically on all
three targets and returns each command's reply — which is what makes a real player and
permission editor possible rather than a command box in disguise.

Attaching is never the lifecycle: a session is a follower that can be dropped and
re-established, and detaching stops the follower without touching the server.

## Configuration

| Option | Meaning |
| --- | --- |
| `serverDir` | The server's root. Everything readable and writable lives at or under it. |
| `writeScope` | Directories, relative to the root, that writes are confined to. Empty means the whole root, which is right for a server WorldLens created; an adopted container narrows it to what the user consented to. |
| `docker` | The Docker binary. A parameter so a test can name one that does not exist. |
| `runner` | How commands are actually executed. Injected everywhere, so no test needs Docker, SSH or Java. |
| `capabilities` | What this transport may do — create, control lifecycle, write files, destroy, and how console commands can be delivered. |

Capabilities are asked rather than assumed. An adopted container may be readable while
WorldLens has no permission to write to it, no way to send it a command, and no business
destroying it. A screen reads these flags to disable a control and say which condition is
unmet, instead of rendering a button it has no right to press.

## Failure modes

| Code | What it means |
| --- | --- |
| `unreachable` | The machine or daemon could not be reached. Says nothing about the server. |
| `not-running` | Reached it; the server or container is not running. |
| `denied` | Reached it; it refused us — permissions, an untrusted host key, a locked file. |
| `not-found` | The container, file or directory is not there. |
| `stale-document` | A write was gated on a hash and the file has changed since it was read. |
| `out-of-scope` | A path resolved outside the server root or outside the permitted write scope. |
| `command-failed` | The command ran and failed. `detail` carries what it said. |
| `timeout` | The command did not answer in time. |
| `invalid-request` | The request itself was malformed — a caller defect, not a machine problem. |
| `unsupported` | This transport cannot do this at all; check `capabilities` first. |

Two behaviours are worth stating plainly because they are deliberate rather than incidental.

**A graceful stop asks the server to stop and then waits.** If it has not finished in time,
that is reported as a timeout and the server is left running. Escalating to a kill is the
user's decision, because it costs whatever the world has not saved since its last autosave.

**A path that leaves the server folder is refused, never adjusted.** Clamping it would turn
a caller defect into a write at a different path than the caller asked for, which is worse
than the error: the caller carries on believing it wrote one file while the bytes landed
somewhere else, and nothing says so.

## Security considerations

**One path check, in one place.** Every file call on every transport passes through
`transport/scope.ts` before touching a machine. Three copies of that check would agree today
and diverge the first time one of them was fixed — and the copy that drifts is the one
running inside somebody's production container over SSH. It compares segment by segment, so
`/srv/minecraft-other` cannot pass as being inside `/srv/minecraft` the way a string-prefix
check would allow, and it refuses NUL bytes and line breaks in paths before they can truncate
a filename or forge an extra line of output.

The check is deliberately lexical and does not consult the filesystem. Resolving symbolic
links first has already lost: `realpath` follows existing link components, so an ancestor
walk then inspects the *resolved* destination and never sees the link that redirected it.

**Bytes never travel through the command runner.** `CommandOutput.stdout` is a string, so a
jar, a region file or a configuration saved in Latin-1 piped through one arrives with every
invalid UTF-8 sequence replaced by U+FFFD — silently, one way, indistinguishable from a file
that was always corrupt. `docker cp` is pointed at a real file on the daemon's own machine
and the bytes are moved from there by something that understands bytes.

**`docker cp` rather than `exec`.** It works on a stopped container, which matters more than
it sounds: a bad configuration is the most common reason a server will not start, so the one
moment a user most needs to edit a file is the moment `exec` is unavailable. It also copies
bytes exactly, with no shell quoting to get wrong and no terminal translating line endings.

**Never `docker attach`.** An attached terminal forwards a stray interrupt straight into a
live JVM, and there may be people standing in that world. Where an attach is unavoidable it
is used with signal proxying disabled and without a terminal.

**Container names are validated** before reaching a command line, and environment values
carrying line breaks are refused rather than passed through.

## Verification

```
cd design
./node_modules/.bin/vitest run packages/app/src/main/mcserver/
```

115 tests at the time of writing, none of which require Docker, SSH or a Java runtime — every
transport takes an injected command runner.

Two guards were verified by breaking them on purpose and watching them fail before being
trusted:

- Replacing the segment-by-segment root comparison in `scope.ts` with a string-prefix check
  turned exactly one test red — the sibling directory case — and restoring it turned that
  test green again.
- Commenting out the handler registration in the shell turned the wiring guard red on the
  "not commented out" assertion specifically, which is the failure mode a substring search
  would have walked straight past.

**What is not verified.** Nothing here has been exercised against a real Docker daemon, a
real SSH host or a real Minecraft server, and no capture exists from a packaged build. The
tests prove the modules behave as specified; they do not prove the feature runs. Issues #85
and #86 track that proof.
