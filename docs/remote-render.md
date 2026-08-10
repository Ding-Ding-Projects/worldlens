# Rendering on a remote host

A laptop is a bad place to render a large world. A Linux box with real cores and real disk is a good
one. This hands a render to that machine over SSH, runs it in a container there, and brings the map
back — and the interface reports the whole thing exactly as it reports a local render, because it
*is* the local reporting.

**Contents**

- [What it does](#what-it-does)
- [Configuring a target](#configuring-a-target)
- [Authentication: keys only, never a password](#authentication-keys-only-never-a-password)
- [The host key is a decision, not a default](#the-host-key-is-a-decision-not-a-default)
- [The preflight, and why its order matters](#the-preflight-and-why-its-order-matters)
- [What leaves this machine, and what is left behind](#what-leaves-this-machine-and-what-is-left-behind)
- [Progress, cancellation and failure](#progress-cancellation-and-failure)
- [Closing the app does not stop the render](#closing-the-app-does-not-stop-the-render)
- [Sending the world so an interruption does not cost it](#sending-the-world-so-an-interruption-does-not-cost-it)
- [What genuinely cannot be resumed](#what-genuinely-cannot-be-resumed)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Known limits](#known-limits)
- [Related reading](#related-reading)

## What it does

```
1  preflight     ssh, host key, Docker, disk. Nothing is sent until all four pass.
2  stage         create <workDir>/<renderId>/ on the remote host
3  config        written HERE with CONTAINER paths in it, then uploaded
4  upload        the engine jar, then each world
5  note          write the container's name and host to container.json, BEFORE starting it
6  render        ssh -> docker run, output read line by line as it arrives
7  collect       bring <web>/maps home into this render's own workspace
8  clean up      remove <workDir>/<renderId>/ and the note, unless the target keeps its files
```

The staging layout on the remote host is one directory per render, so an abandoned one is a single
folder somebody can delete:

```
<workDir>/<renderId>/
  config/           mounted at /bluemap/config
  data/             the client jar and the engine's logs
  web/              the tiles. web/maps is what comes home.
  worlds/<mapId>/   mounted READ-ONLY at /worlds/<mapId>
  cli.jar           mounted read-only at /bluemap/cli.jar
```

The container command is built from `main/runtime/` rather than restated: the CLI flags, the
container paths, the `-v` spelling, the container naming rule and the polite stop all come from
there. A remote render is a `docker run` on somebody else's machine, and a second opinion about what
that command should be is a second thing to get wrong.

## Configuring a target

| Field | Meaning |
|---|---|
| `host` | a host name, an IPv4 address, or an IPv6 address in brackets |
| `port` | 22 unless the host has moved SSH |
| `user` | the account to sign in as |
| `identityFile` | the **path** to a private key, or blank to use your SSH agent |
| `workDir` | where renders are staged there. `~/.worldlens/renders` by default |
| `image` | the container image. The same stock JRE the local Docker path uses |
| `docker` | the remote `docker` binary, for a host with a wrapper |
| `keepRemoteFiles` | off. On, the staging directory survives the render — and the app says so |

Every one of those ends up in an `ssh`, `scp` or `docker run` argument, so every one is validated
before anything is spawned. The refusals are not fussiness — they are the shapes that make an
argument mean something other than it appears to:

- a host beginning with `-` is read by `ssh` as an **option**, which is how a host field becomes a
  way to set `ProxyCommand` and run an arbitrary local command;
- a user or host with whitespace in it splits an argument;
- a work directory with a `:` in it ends the source half of a `-v src:dst:ro` early and mounts
  something else;
- a `..` that survives normalisation points somewhere that cannot be decided from the string.

`workDir` is checked by its own POSIX rules rather than by `runtime/mounts.ts`'s. That checker
refuses `/home` and `/var` outright, which is right for a laptop being asked to share a folder with
a container and wrong for a server whose accounts live in exactly those places. Running a laptop's
rules over a server's filesystem would refuse the only sensible place to stage and permit nothing.
The remote list refuses `/`, `/etc`, `/usr`, `/bin`, `/sbin`, `/lib`, `/boot`, `/dev`, `/proc` and
`/sys`.

## Authentication: keys only, never a password

**There is no password field and there is nowhere to put one.** That is the design, not an omission
to be filled in later.

- The app never asks for a password, never stores one and never passes one to `ssh`.
- Every invocation carries `PasswordAuthentication=no`, `KbdInteractiveAuthentication=no`,
  `PreferredAuthentications=publickey` and `BatchMode=yes`, so the client **cannot** fall back to
  one even if a host offers it, and cannot hang on a prompt in a background process.
- Authentication is your **agent** (the default) or an **identity file named by path**. The app
  records where the key is; it never reads it, never copies it, never writes one, and never puts its
  contents anywhere.
- A stored target holds a host, a port, a user name and a path. Nothing in one is a secret, so
  persisting it is safe by construction — and any `password`-shaped field an older build or a
  hand-edited settings file left behind is dropped rather than carried into an invocation.

A password that exists somewhere is a password that ends up in a config file, a log line, a crash
report or a screenshot. The way to not leak one is to not have one.

When a named identity file is used it is passed with `IdentitiesOnly=yes` beside it. Without that,
the agent's keys are offered first and a host with a low `MaxAuthTries` refuses before the named key
is ever reached — which reads as "the key does not work" for a key that does.

## The host key is a decision, not a default

SSH's whole guarantee rests on knowing that the machine answering is the machine that answered last
time. `StrictHostKeyChecking=accept-new` throws that away for the *first* connection to any host,
which is precisely the connection an interceptor needs to survive: after it, the wrong key is the
recorded key and every later connection looks fine.

So every connection uses `StrictHostKeyChecking=yes`, and there are three states:

| State | What happens |
|---|---|
| **trusted** | the key is already in a `known_hosts` the app reads. Nothing is asked. |
| **unknown** | never seen. Nothing is sent. The fingerprints are put in front of you to compare. |
| **changed** | seen, and different. **Refused**, with no button anywhere. |

`changed` has no button because a rebuilt server and an intercepted connection are indistinguishable
from here, and a button that resolves that ambiguity in the app's favour resolves it in an
attacker's favour too. Removing a recorded key is a deliberate act with a file path in it, and the
message says which file.

Two more details that are easy to get wrong and are not:

- **The app reads two trust stores and writes to one.** It reads its own `known_hosts` in the
  application data directory *and* your `~/.ssh/known_hosts`, so a host you already trust needs no
  second decision — but it only ever appends to its own. An app that writes to your personal trust
  store changes the trust of every other program on the machine, and a bug here would be a bug in
  your `git push`.
- **Accepting a key names one rather than supplying one.** What crosses from the interface is a
  `SHA256:` fingerprint. The main process then re-scans the host, recomputes the fingerprints itself,
  and writes a line only if one of them matches. Otherwise the renderer — the least trusted process
  in the application — would be one message away from appending an arbitrary line to a trust store.
  If the host has started offering a different key since you read the fingerprint, nothing is
  recorded and the app says so.

The fingerprint is computed the way `ssh-keygen -l` computes it: base64 of the SHA-256 of the raw
key blob, padding stripped. A fingerprint you cannot compare character-for-character with what the
server prints is a fingerprint nobody checks.

Keys are recorded under `[host]:port` whenever the port is not 22, because that is what OpenSSH
looks them up under. Recorded bare, a non-standard port would ask again every single time.

## The preflight, and why its order matters

Four checks, in this order, each running only when the one before it passed:

| Stage | Question | If it fails |
|---|---|---|
| `ssh` | can this app reach the host and sign in at all? | `unreachable`, `auth-refused`, `ssh-missing` |
| `host-key` | is this the machine that answered last time? | `host-key-unknown`, `host-key-changed` |
| `docker` | is there a Docker there, and is its daemon running? | `docker-missing`, `docker-daemon-down`, `docker-refused` |
| `disk` | is there room under the work directory? | `not-enough-disk` |

The order is not cosmetic. Asking about Docker before the connection works reports "Docker is not
installed" for a host that is simply switched off, which sends somebody to install software on a
machine that was never the problem.

Preflight runs **before anything is uploaded**. A render is gigabytes of upload and hours of compute;
discovering at the end of the upload that the host has no Docker is not a slow failure, it is a
wasted evening on a domestic connection.

The Docker check is `runtime/docker.ts` — the same classifier the local Docker path uses, with its
five distinct states — run over an SSH-backed command runner. There is one Docker classifier in this
repository; a second would drift, and the state it got wrong would be the one nobody tested. Two
translations make that reuse honest rather than merely convenient:

- a remote shell's **127** ("command not found") is reported the way a *locally* missing binary is,
  so "Docker is not installed on that host" does not arrive as "exit code 127";
- a failure of **`ssh` itself** is marked apart from a failure of the command it carried, so a dead
  server is never reported as a broken Docker.

That second one has a subtlety worth recording: **the exit code decides whose failure it is, and the
text only decides which one.** `ssh` exits 255 for its own failures and otherwise returns the remote
command's status. A `docker version` refused by its own daemon prints "permission denied", and
pattern-matching that as an SSH authentication failure turns "add this account to the docker group"
into "your key was rejected" — two problems with nothing in common and different machines to fix them
on. The first version of that classifier did exactly this.

The one thing preflight writes is `mkdir -p <workDir>`, because `df` on a directory that does not
exist yet answers about nothing. It is one empty directory, and it is the directory the render was
about to create anyway.

## What leaves this machine, and what is left behind

The app answers this before a render starts, so it can be put in front of you rather than beside a
log you read afterwards.

**Sent:**

- the world folders of the maps in this render, copied whole;
- the BlueMap engine jar this app runs;
- a generated config file naming those maps and their dimensions.

**Never sent:**

- any GitHub token or sign-in;
- any private key — authentication is your agent, or a key file that stays where it is;
- any password;
- any other world, map or setting from this computer.

**Left behind:** nothing. `<workDir>/<renderId>/` is removed when the render ends, whether it
succeeded, failed or was cancelled. With `keepRemoteFiles` on it is kept, and the app logs a warning
naming the directory and saying it includes a copy of the world — a copy of somebody's world sitting
on a server is a fact they are entitled to know rather than a detail.

A cleanup that fails never turns a finished render into a failed one: the map is already home. It is
reported as a warning naming the directory that is still there, which is what somebody needs to
remove it by hand.

## Progress, cancellation and failure

A remote render emits `RenderEvent` — the *same* union a local render emits — so the same progress
bar, the same log pane, the same cancel button and the same failure banner work with no knowledge
that a network was involved. That is not achieved by copying the event shapes; it is achieved by
using them, and by running the container's own output through the same `RenderOutputTracker` and the
same progress parser the local path uses. `updating map 'overworld': 25.663% (ETA: 47 seconds)`
arrives from a container two thousand miles away exactly as it arrives from a JVM on this desk.

Transfer steps report on the same channel with an honest description. Their percentage measures
**files staged, not bytes moved** — `scp` does not report the second, and inventing it would be a bar
that lies.

**Cancelling stops the container, not the conversation.** This is the one place the remote path
genuinely differs and the expensive kind of wrong to get wrong. Killing the local `ssh` kills a
viewer; the daemon on the other machine owns the container's lifetime and never hears about it, so
the JVM carries on rendering into somebody's disk with nothing left holding a handle to it. So a
cancel asks the *remote daemon*: `docker stop --time 8 <name>`, by name. `--init` in the launch is
what makes that SIGTERM reach the JVM at all — without it the JVM is PID 1, ignores SIGTERM by
default, and every cancellation waits out the full stop timeout before the container is killed,
losing the shutdown that saves the tiles already rendered. Cleanup then runs on the way out, so a
cancelled render does not leave a staging directory behind either.

A cancelled render is reported as **cancelled**, never as a failure with a code. A person who
pressed Cancel must not be shown a red banner saying something went wrong.

Failures carry two codes. `code` is the existing `RenderFailureCode`, so an interface that has never
heard of a remote target still renders and routes the failure; `remoteCode` is the precise reason,
for one that has. Anything found *before* the engine started maps to `invalid-request` — nothing was
spawned and nothing changed on either machine — and anything that started somewhere and stopped maps
to `cli-failed`.

## Closing the app does not stop the render

The same fact as cancellation, from the other side. If killing `ssh` does not stop the container,
then **quitting does not stop it either**: the render that was going when the app closed is still
going when it opens again, tiles still landing in `<workDir>/<renderId>/web/maps` on that host, with
nothing left holding a handle to it. Previously the app would have offered to send the whole world
again beside it.

What was missing was never the work — the work is fine, it is still running — it was the **name**.
So before the container is started, the app writes one down:

```
<storageDir>/<renderId>/
  render.json      which engine rendered this, and how it ended
  session.json     what is running right now, and how far it got
  container.json   which container is doing it, on which host, and where its output goes
```

`container.json` is written *before* the container starts, because the window between the two is
exactly the window in which being killed produces a container nothing can name. It is removed on
every way out of a run — success, failure, cancellation, or a thrown error — so a note left behind
never offers to reattach to something that has already ended. It carries the target's own fields
rather than a settings key, because a record naming only a target id becomes unreadable the moment
somebody renames that target, which is precisely the situation it exists to survive.

On the next launch, and whenever asked, the app puts each name to the daemon that owns it and gets
one of three answers:

| The daemon says | What happens | What you are told |
|---|---|---|
| still running | **reattach**: `docker logs --follow --tail all` is streamed over `ssh` and reported as a live render | *…is still going in container 'x' on renderer@host:2222… Picking it up rather than starting a second one beside it.* |
| exited | **collect**: the tiles are already on that host's disk, so they are fetched and the render finishes | *…finished while the app was closed (exit code 0). The tiles it wrote are still where it wrote them…* |
| no such container | **collect**, honestly: `--rm` removed it the moment it ended, taking its exit status | *…its exit status went with it… nothing here can say whether it got to the end, so run the render again if you need that confirmed. It will only redo what is missing.* |
| nothing (the host did not answer) | **neither.** Nothing is collected, nothing is discarded, the note is kept | *…may well still be going… Try again once that machine answers.* |

Three details worth being exact about:

- **Reattaching is a launch, not a second reporting path.** `docker logs --follow` becomes an
  ordinary `EngineLaunch` whose command is `ssh`, so the line reader, the phase tracker, the
  progress parser and the cancellation are the code the ordinary path already uses. A reattached
  render emits the same `RenderEvent` union, appears in the same list, moves the same bar and is
  stopped by the same button.
- **`--tail all` replays the log from its first line.** A render the app missed two hours of does not
  resume with a bar at zero and no map names: the tracker sees every line since the container
  started and arrives at the real percentage. Replaying costs a few thousand lines of parsing and
  buys a progress bar that is not a lie.
- **`docker logs` cannot tell you whether the render succeeded.** Its exit code is the *client's*,
  and it returns 0 both when a render finished and when it died. So a reattached run is judged the
  way a render is really judged — by whether the engine printed `Your maps are now all up-to-date!`
  — and a log that ended without that is reported as a failure, not a success.

Cancelling a reattached render asks the **remote daemon**, exactly as cancelling a live one does.
Killing the `ssh` carrying `docker logs` would stop only the reading, which is the situation this
whole feature exists to get out of.

A container named the way this app names them with **no record beside it** is reported and never
stopped automatically: without the record there is nothing to say which render it belongs to or
where its output was going, so the only honest thing is to name it and let a person decide.

## Sending the world so an interruption does not cost it

`scp` has no notion of a partial file. A copy that stops at nine gigabytes of ten leaves a
nine-gigabyte file that the next copy overwrites from byte zero. On a domestic connection that is
not an inconvenience — it is the difference between a render that happens and one that never does,
because the upload is longer than the interval between dropped connections.

So the app looks for `rsync` on **both** machines (it runs a copy of itself on each end, so one is
not enough) and uses it when both have it:

```
-a                  archive: recurse, keep times and permissions
--partial           keep a file that was cut off, instead of deleting it
--append-verify     carry it on from where it stopped, after checksumming what is already there
-e "<ssh …>"        the same ssh, with the same security options as everything else
```

`--partial` alone only *keeps* the fragment; `--append-verify` is what makes the next run use it. It
is deliberately not plain `--append`: it reads the bytes already at the destination and checksums
them against the same range of the source, so a fragment of a file that has changed since is re-sent
whole rather than producing a file that is half one version and half another. A world folder is
exactly the kind of source that gets edited between two attempts.

**The log says which tool moved the files, before a byte moves**, and says what an interruption
would cost either way:

> Sending with rsync 3.2.7 here and 3.1.3 on renderer@render.example, so a transfer that is
> interrupted carries on from where it stopped rather than starting again.

> Sending with scp, because render.example has no rsync. scp cannot carry a partial file on, so a
> transfer that is interrupted starts that file again from the beginning. Installing rsync on both
> machines is what changes that.

Which machine is missing it is named, rather than one sentence for both cases — "rsync is not
available" sends somebody to install it on the machine that already has it.

There is one sharp edge and it is handled at use time rather than assumed away. **rsync takes the
remote shell as a single string and splits it itself**, and this app's `known_hosts` lives under the
application data directory — on Windows, `…\Worldlens\known_hosts`. Whether a given rsync build honours the quotes around that is a property of that build. So the
words are quoted, and if an rsync copy fails anyway the same copy is made with `scp` and the log
says so:

> rsync could not send C:\saves\world (…), so scp is being used for it instead. scp cannot carry a
> partial file on, so if this one is interrupted it starts again from the beginning.

A cancellation is never retried through `scp` — that would be a cancel button that starts a second
upload. The guarded remote `rm -rf` and the `mkdir -p` are still `transfer.ts`'s; rsync delegates
them rather than growing a second copy of the most destructive command this app can issue.

## What genuinely cannot be resumed

Some things cannot, and each says which and offers a clean restart as an explicit choice rather than
doing one silently.

| Situation | What the app says |
|---|---|
| the container was removed by `--rm` | the tiles are fetched; its exit status is gone, so nothing claims to know whether it finished |
| the staging directory was deleted on the host | *…could not be fetched… If the staging directory was removed there, the tiles are gone with it and the render has to be started again.* |
| the output folder on this computer was deleted | *…is not there, so there is nothing of this render left to pick up… Rendering it again is the only way forward, and it will start from nothing.* |
| **the host key changed** since the render started | refused, in the same words a fresh connection is refused in, with no button. A rebuilt server and an intercepted one are indistinguishable from here |
| the record itself will not parse, or names a host that is not a host | *…does not describe a host this app is willing to build an ssh command from… The render has to be started again.* |
| the host simply did not answer | nothing is collected and **nothing is discarded**; the note is kept, because it is the only evidence a still-running render exists |

The host, port, user and key path in a record end up in an `ssh` argument, so a record read off disk
goes back through the **same validation a freshly typed target gets**. A record is a file, and an
old build, a hand edit or a restored backup can have put `-oProxyCommand=…` in it.

## Failure modes

| `remoteCode` | What it means | Where the fix is |
|---|---|---|
| `invalid-target` | the target is not usable as written | the target's own fields |
| `ssh-missing` | no `ssh` on **this** computer | install the Windows OpenSSH client |
| `unreachable` | DNS, refused, timed out, no route | the host, the port, the network |
| `host-key-unknown` | never seen this key | compare the fingerprint, then accept it |
| `host-key-changed` | not the recorded key | deliberately, on the recorded key — never automatically |
| `host-key-unavailable` | the host offered no readable key | the host's SSH configuration |
| `auth-refused` | the key was refused | `authorized_keys` there, or your agent here |
| `docker-missing` | no `docker` on the remote PATH | install Docker there |
| `docker-daemon-down` | installed, daemon not running | start it there |
| `docker-refused` | daemon there, account not allowed | the docker group there |
| `docker-unusable` | Docker answered with something unrecognised | the detail carries Docker's own words |
| `not-enough-disk` | less free space than the render needs | free space there, or a bigger volume |
| `transfer-failed` | something did not make it either way | the detail carries `scp`'s own words |
| `remote-command-failed` | a command over SSH failed otherwise | the detail carries the exit code and the words |
| `render-failed` | the container ran and did not finish | the engine's own diagnostics |
| `cancelled` | you pressed Cancel | nothing; this is not an error |

`render-failed` also covers the case that looks like success: the engine prints a warning banner,
updates nothing, and exits **0**. Treating that exit code as the answer would report a render that
produced no tiles as a completed render, so the run is only a success when the engine also said
`Your maps are now all up-to-date!`.

## Security notes

- **No password, anywhere.** No field, no storage, no argument, and SSH options that make the client
  refuse one even when offered.
- **No private key is ever read, written or copied.** Only a path is recorded, and only `ssh` opens
  it.
- **No host key is trusted silently.** `StrictHostKeyChecking=yes` on every invocation; an unknown
  key is a decision for the person, a changed key is a refusal with no override.
- **The app writes only to its own trust store**, never to `~/.ssh/known_hosts`.
- **The renderer cannot supply a key**, only name a fingerprint it was shown.
- **Every remote word is quoted** with POSIX single quotes, which a shell has no way to reinterpret.
  `ssh host <words>` does not run an argv — it joins the words and hands the string to the remote
  login shell — so a world folder called `Saves, old (2)` is not an edge case, it is a broken command
  or, worse, a different one. The single exception is the leading `~` of the work directory, which is
  left outside the quotes for the one command that resolves it, because a quoted tilde is not
  expanded and the render would stage into a directory literally called `~`.
- **The world is mounted read-only** in the container, always. A render reads chunks and writes
  tiles.
- **No port is published.** A remote render has no web server; the tiles come home and are served by
  this app. Opening a port on somebody's server as a side effect of pressing Render is not a thing
  this app does.
- **The remote `rm -rf` is guarded on the remote side as well as on this one.** The path is already
  validated here; the remote script refuses `/`, an empty value and a `..` path before running. `rm
  -rf` with an unexpected variable is the single most destructive command a script can run, and the
  cost of it being wrong is somebody's server.

## Verification

`design/packages/app/src/main/remote/` has 154 tests, and not one of them needs an SSH client, a
container runtime, a server or a network:

| File | What it proves |
|---|---|
| `target.test.ts` | a `-oProxyCommand=` host is refused; a work directory with a `:` is refused; nothing password-shaped survives validation |
| `ssh.test.ts` | the options make a password impossible and never accept an unknown key silently; `ssh -p` versus `scp -P`; quoting a folder name a person would really have; the exit code decides whose failure it is |
| `hostkey.test.ts` | the fingerprint matches an independently computed `ssh-keygen -l` value; a key that was not offered cannot be recorded; recording appends rather than replaces |
| `preflight.test.ts` | an unreachable host never mentions Docker; Docker missing, daemon down and refused are three different sentences; a changed key produces no acceptable fingerprint; `df -Pk` parsing |
| `transfer.test.ts` | the destination's parent is created so a copy cannot land a level too deep; the remote `rm` guard; a cancelled transfer stops rather than finishing |
| `rsync.test.ts` | **an interrupted transfer resumes and sends only what did not arrive**, asserted against a fake host that counts bytes rather than against the presence of a flag; both "this computer has no rsync" and "that host has no rsync" as separate sentences; a `known_hosts` path with a space quoted; a failed rsync completing through `scp` **with the cost stated**; a cancelled copy never retried |
| `plan.test.ts` | the world is mounted read-only, nothing is published, the container is named and `--init`ed |
| `reattach.test.ts` | a record's host goes back through the same validation a typed one gets, and `-oProxyCommand=` in one is refused; a changed host key is reported as itself and never as a container that is gone; the log is streamed over `ssh` as an ordinary launch; the stop reaches the remote daemon; a staging directory that has gone is said to have gone |
| `orchestrator.test.ts` | the whole flow: what is uploaded and in what order, a config with container paths in it, the container's own progress reported as a local render's, a **cancelled** render that cleans up and is not reported as a failure, a refused preflight that uploads nothing, a failed transfer, a container that exits 0 without finishing, and **the container's name written down before it is started and removed however the run ended** |
| `ipc.test.ts` | the channels register and dispose exactly; no handler rejects; only a fingerprint reaches the trust step |

The container states themselves — still running, finished while the app was away, removed by the
daemon, and a cancel that reaches a reattached container — are proved in
`design/packages/app/src/main/runtime/`; see [Running the engine on this computer, or in a
container](./docker-and-local.md#picking-a-container-back-up-after-the-app-closes).

Run them with `npx vitest run packages/app` from `design/`, alongside
`npx tsc -p packages/app --noEmit` and `npx eslint packages/app`.

Not yet verified: an end-to-end render against a real remote host. Every command this builds is
asserted character-for-character and every failure path is exercised against a fake that answers the
way the real tools do, but no capture from a real server exists yet, and this section says so rather
than implying one does.

## Known limits

- **`scp` is still the floor, and it is the slow part.** It opens a channel per file and a world is
  tens of thousands of small region files. It is what is used when either machine has no rsync, and
  it is what the guarded remote delete and the `mkdir -p` always go through. A streamed `tar` would
  be faster than either and is not built.
- **rsync makes a transfer resumable, not incremental in BlueMap's sense.** It skips file content
  that already arrived; it does not know that a world was rendered before. BlueMap's own incremental
  render state lives in the staging directory, which is removed after a render unless
  `keepRemoteFiles` is on — so a second render of the same world is still a full render, and turning
  that setting on is what changes it.
- **A container with no record cannot be reattached, only reported.** Without the note there is
  nothing to say which render a container belongs to or where its output was going. Strays are also
  only looked for on the **local** daemon, because a stray is by definition a container whose record
  is gone, and without a record there is no host to ask.
- **One target at a time per render id**, exactly as a local render is.
- **A failure to reach a settings row.** `render/failure.ts` owns the settings anchors and has none
  for a remote target, so remote failures carry the fix in their message rather than a link. Adding
  one means editing that file.

## Related reading

- [Worlds from somebody else's release](./world-sources.md) — the other way a world moves between
  machines.
- [Worlds hosted on your own SSH server](./ssh-world-sources.md) — the read direction over this
  same connection, host-key and transfer machinery: a world fetched from a server you own
  rather than sent to one.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — the other machine that can render
  for you, and the one that needs no server of your own.
- [Renders that survive being interrupted](./resumable-renders.md) — the same promise for a render
  on this computer, and the incremental behaviour that makes carrying one on cheap.
- [Running the engine on this computer, or in a container](./docker-and-local.md) — where the
  reattachment machinery lives, and the local container it applies to just as much.

## 廣東話

### 概要:喺遠端主機 render (Rendering on a remote host)

手提電腦唔係 render 大 world 嘅好地方;一部有真 core、真 disk 嘅 Linux 機先係。呢個功能將個 render 經 SSH 交畀嗰部機,喺嗰邊嘅 container 入面行,再將幅地圖帶返嚟 — 而介面報告成件事嘅方式同本地 render 一模一樣,因為佢用嘅*就係*本地嗰套報告。

### 佢做啲乜

八步:1 **preflight**(ssh、host key、Docker、disk — 四關全過先會 send 任何嘢);2 **stage**(喺遠端開 `<workDir>/<renderId>/`);3 **config**(喺*呢度*寫好、入面用 CONTAINER 路徑,然後上傳);4 **upload**(engine jar,跟住每個 world);5 **note**(container 開之**前**,將 container 名同 host 寫落 `container.json`);6 **render**(ssh → docker run,輸出一行行即時讀);7 **collect**(將 `<web>/maps` 帶返呢個 render 自己嘅本地 workspace);8 **clean up**(剷走 `<workDir>/<renderId>/` 同個 note,除非個 target 設定保留檔案)。

遠端 staging 佈局係一個 render 一個目錄,所以一個被遺棄嘅 render 係一個人手剷得走嘅單一資料夾:`config/` mount 落 `/bluemap/config`;`data/` 放 client jar 同 engine 啲 log;`web/` 係 tiles(`web/maps` 就係帶返屋企嗰部分);`worlds/<mapId>/` **唯讀** mount 落 `/worlds/<mapId>`;`cli.jar` 唯讀 mount 落 `/bluemap/cli.jar`。

container 命令由 `main/runtime/` 起,唔係重寫一次:CLI flags、container 路徑、`-v` 寫法、container 命名規則同 polite stop 全部嚟自嗰度。remote render 只係一條喺人哋部機行嘅 `docker run`;對呢條命令有第二個意見,就係多一樣會出錯嘅嘢。

### 設定一個 target

欄位:`host`(主機名、IPv4,或者方括號包住嘅 IPv6);`port`(除非個 host 搬咗 SSH,否則 22);`user`(登入帳戶);`identityFile`(私鑰嘅**路徑**,留空就用你嘅 SSH agent);`workDir`(遠端 staging 位置,預設 `~/.worldlens/renders`);`image`(container image,同本地 Docker path 用嘅同一個 stock JRE);`docker`(遠端 `docker` binary,畀有 wrapper 嘅主機用);`keepRemoteFiles`(預設關;開咗 staging 目錄會捱過個 render — 而 app 會講明)。

每一欄最終都會變成 `ssh`、`scp` 或 `docker run` 嘅 argument,所以每一欄都喺 spawn 任何嘢之前驗證。啲拒絕唔係揦手唔成勢 — 係啲會令一個 argument 變成另一樣嘢嘅形狀:以 `-` 開頭嘅 host 會畀 `ssh` 當成 **option**,即係 host 欄變成 set `ProxyCommand` 去行任意本地命令嘅方法;user 或 host 有空白會拆開 argument;workDir 入面有 `:` 會提早斬斷 `-v src:dst:ro` 嘅 source 半邊,mount 咗第二樣嘢;normalise 完仲生存嘅 `..`,指去邊係由條 string 決定唔到嘅。

`workDir` 用自己一套 POSIX 規則檢查,而唔係 `runtime/mounts.ts` 嗰套 — 嗰個 checker 直頭拒絕 `/home` 同 `/var`,對一部要同 container 分享資料夾嘅手提電腦係啱,對一部帳戶正正住喺嗰啲地方嘅伺服器就錯。用手提電腦嘅規則行伺服器嘅檔案系統,會拒絕唯一合理嘅 staging 位置,乜都批唔到。遠端名單拒絕嘅係 `/`、`/etc`、`/usr`、`/bin`、`/sbin`、`/lib`、`/boot`、`/dev`、`/proc` 同 `/sys`。

### 認證:只用 key,永遠冇密碼

**冇密碼欄,亦冇任何地方可以放一個。**呢個係設計,唔係漏咗遲啲補。

- app 從來唔問密碼、唔儲密碼、唔傳密碼畀 `ssh`。
- 每次呼叫都帶 `PasswordAuthentication=no`、`KbdInteractiveAuthentication=no`、`PreferredAuthentications=publickey` 同 `BatchMode=yes`,所以就算主機肯收密碼,client 都**冇得** fallback,亦唔會喺背景 process 卡死喺一個 prompt 度。
- 認證係你嘅 **agent**(預設)或者一個**以路徑指名嘅 identity file**。app 只記條 key 喺邊;從來唔讀佢、唔抄佢、唔寫一條出嚟、唔將內容放去任何地方。
- 一個儲存咗嘅 target 得 host、port、user 同一條路徑,冇一樣係秘密,所以持久化本質上安全 — 而舊 build 或者手改 settings 檔留低嘅任何 `password` 形欄位會被 drop,唔會帶入任何呼叫。

一個存在喺某度嘅密碼,遲早會出現喺 config 檔、log、crash report 或者 screenshot。唔想漏一個密碼,最好嘅方法係根本冇一個。

用指名 identity file 嘅時候會一齊傳 `IdentitiesOnly=yes`。唔加嘅話,agent 啲 key 會先被 offer,一部 `MaxAuthTries` 較低嘅主機會喺輪到指名嗰條 key 之前已經拒絕 — 對一條其實 work 嘅 key,睇落就似「條 key 唔 work」。

### Host key 係一個決定,唔係一個預設

SSH 成套保證建基於「而家答緊嘅機係上次答嗰部」。`StrictHostKeyChecking=accept-new` 對任何主機嘅*第一次*連線放棄咗呢樣嘢,而嗰次正正係攔截者需要捱過嘅一次:過咗之後,錯嘅 key 變成記錄咗嘅 key,之後每次連線睇落都正常。

所以每次連線都用 `StrictHostKeyChecking=yes`,有三個狀態:**trusted**(條 key 已經喺 app 讀嘅 `known_hosts` 入面,乜都唔問);**unknown**(未見過,乜都唔 send,fingerprint 擺喺你面前畀你對);**changed**(見過,但唔同 — **拒絕**,邊度都冇掣)。

`changed` 冇掣,因為一部重灌咗嘅伺服器同一條被攔截嘅連線,喺呢度係分辨唔到嘅;一個將呢種含糊向 app 有利方向解決嘅掣,同時亦係向攻擊者有利方向解決。剷走一條已記錄嘅 key 係一個帶住檔案路徑嘅刻意行為,message 會講明係邊個檔。

兩個容易做錯但呢度冇做錯嘅細節:

- **app 讀兩個 trust store,但只寫一個。**佢讀自己喺 application data 目錄嘅 `known_hosts`,*加*你嘅 `~/.ssh/known_hosts` — 你已經信任嘅主機唔使做第二次決定 — 但佢只會 append 落自己嗰個。一個寫你個人 trust store 嘅 app,係改緊你部機每一個程式嘅信任;呢度出 bug 即係你 `git push` 出 bug。
- **接受一條 key 係「指名一條」而唔係「提供一條」。**由介面過嚟嘅只係一個 `SHA256:` fingerprint。主進程會重新 scan 個 host、自己重新計 fingerprint,有一個吻合先寫一行。如果唔係咁,renderer — 全 app 最唔受信任嘅 process — 一個 message 就可以 append 任意一行落 trust store。如果由你讀 fingerprint 嗰刻起,個 host 開始 offer 一條唔同嘅 key,就乜都唔記錄,app 會講明。

fingerprint 用 `ssh-keygen -l` 嘅計法:raw key blob 嘅 SHA-256 再 base64,去 padding。一個唔可以同伺服器印出嚟嗰個逐隻字對比嘅 fingerprint,係一個冇人會核對嘅 fingerprint。port 唔係 22 嘅 key 記錄做 `[host]:port`,因為 OpenSSH 係咁查;記做淨 host 嘅話,非標準 port 每一次都會再問過。

### Preflight,同點解次序重要

四個檢查,順序行,前一個過咗先行下一個:`ssh`(呢個 app 究竟掂唔掂到部機、簽唔簽到入?fail 係 `unreachable`、`auth-refused`、`ssh-missing`)→ `host-key`(係唔係上次答嗰部機?`host-key-unknown`、`host-key-changed`)→ `docker`(嗰邊有冇 Docker,daemon 行緊未?`docker-missing`、`docker-daemon-down`、`docker-refused`)→ `disk`(work directory 下面夠唔夠位?`not-enough-disk`)。

次序唔係裝飾。連線都未通就問 Docker,會對一部單純熄咗嘅機報「Docker 未安裝」,叫人去一部從來都唔係問題嘅機度裝軟件。preflight 喺**任何嘢上傳之前**行 — 一個 render 係幾 GB 嘅上傳加幾個鐘嘅計算;上傳完先發現嗰邊冇 Docker,喺家用網絡唔係一個慢嘅失敗,係嘥咗成晚。

Docker 檢查就係 `runtime/docker.ts` — 同本地 Docker path 用嘅同一個 classifier,五個唔同狀態,行喺一個 SSH-backed command runner 上面。成個 repo 得一個 Docker classifier;第二個會走樣,而佢搞錯嗰個狀態一定係冇人測試嗰個。兩個翻譯令呢個重用誠實:遠端 shell 嘅 **127**(command not found)按*本地* binary 唔見咗嗰種方式報,所以「嗰部主機冇裝 Docker」唔會以「exit code 127」嘅樣到達;**`ssh` 自己**嘅失敗同佢帶嘅命令嘅失敗分開標記,所以一部死咗嘅伺服器永遠唔會報成一個壞咗嘅 Docker。

第二點有個值得記低嘅微妙位:**exit code 決定係邊個嘅失敗,文字只決定係邊一種。**`ssh` 自己失敗會 exit 255,否則回傳遠端命令嘅 status。一個畀自己 daemon 拒絕嘅 `docker version` 會印 "permission denied";將呢句 pattern-match 成 SSH 認證失敗,就會將「將呢個帳戶加入 docker group」變成「你條 key 被拒絕咗」— 兩個毫無關係嘅問題,仲要喺唔同嘅機度整。第一版 classifier 正正犯咗呢個錯。

preflight 唯一會寫嘅嘢係 `mkdir -p <workDir>`,因為對一個未存在嘅目錄行 `df` 係答緊個空氣。嗰個只係一個空目錄,而且係個 render 本身就快要開嘅目錄。

### 有乜嘢離開呢部機,有乜嘢留低

app 喺 render 開始之前就答到呢條問題,所以可以擺喺你面前,而唔係擺喺一份事後先讀嘅 log 旁邊。

**Send 嘅:**呢次 render 嘅 map 嘅 world 資料夾(成個抄)、呢個 app 行嘅 BlueMap engine jar、一個列明嗰啲 map 同 dimension 嘅生成 config 檔。**永遠唔 send 嘅:**任何 GitHub token 或者登入;任何私鑰 — 認證係你嘅 agent,或者一個留喺原位嘅 key 檔;任何密碼;呢部電腦任何其他 world、map 或者設定。**留低嘅:**冇。`<workDir>/<renderId>/` 喺 render 結束時剷走,成功、失敗定取消都一樣。`keepRemoteFiles` 開咗就保留,而 app 會 log 一個 warning,講明個目錄同埋佢入面有一份 world 嘅 copy — 一份人哋 world 嘅 copy 擺喺一部伺服器度,係當事人有權知道嘅事實,唔係一個細節。

清理失敗永遠唔會將一個完成咗嘅 render 變成失敗:幅地圖已經返到屋企。佢會報成一個 warning,講明邊個目錄仲喺度 — 正正係人手剷走佢所需要嘅資訊。

### 進度、取消同失敗

remote render 發出嘅係 `RenderEvent` — 同本地 render *同一個* union — 所以同一條 progress bar、同一個 log pane、同一個 cancel 掣、同一個 failure banner,完全唔使知有網絡呢回事都照 work。呢個唔係靠抄 event 形狀達成,係靠直接用佢哋,並且將 container 自己嘅輸出行過同一個 `RenderOutputTracker` 同同一個 progress parser。`updating map 'overworld': 25.663% (ETA: 47 seconds)` 由兩千英里外一個 container 到達嘅方式,同由呢張枱上一個 JVM 到達一模一樣。

傳輸步驟喺同一條 channel 報,配一個誠實嘅描述。佢哋嘅 percentage 量嘅係 **staged 咗嘅檔案數,唔係搬咗嘅 byte** — `scp` 唔報後者,發明一個就係一條講大話嘅 bar。

**取消係停個 container,唔係停個對話。**呢個係 remote path 真正唔同嘅一個位,亦係搞錯咗最貴嗰種。殺死本地嘅 `ssh` 只係殺咗一個觀眾;另一部機嘅 daemon 擁有 container 嘅生命,永遠冇聽過呢件事,個 JVM 繼續 render 落人哋隻碟,冇任何嘢揸住個 handle。所以 cancel 係問*遠端 daemon*:`docker stop --time 8 <name>`,用個名。launch 入面嘅 `--init` 係嗰個 SIGTERM 真係到得個 JVM 嘅原因 — 冇佢嘅話 JVM 係 PID 1,預設無視 SIGTERM,每次取消都要等足成個 stop timeout 先強行 kill,失去咗嗰個保存已 render tiles 嘅 shutdown。清理照樣喺出去嗰陣行,所以取消嘅 render 都唔會留低 staging 目錄。

取消嘅 render 報告做 **cancelled**,永遠唔係一個帶 code 嘅失敗。一個撳咗 Cancel 嘅人,唔應該見到一個紅色 banner 話有嘢出錯。

失敗帶兩個 code:`code` 係現有嘅 `RenderFailureCode`,所以一個從未聽過 remote target 嘅介面照樣 render 同 route 到個失敗;`remoteCode` 係精確原因,畀識嘅介面用。engine 開始*之前*發現嘅嘢 map 去 `invalid-request` — 乜都未 spawn,兩邊機都冇變 — 開始咗然後停咗嘅嘢 map 去 `cli-failed`。

### 閂 app 唔會停個 render

同取消係同一個事實,由另一面睇。殺 `ssh` 停唔到個 container,咁**quit 都一樣停唔到**:app 閂嗰陣行緊嘅 render,app 開返嗰陣仲行緊,tiles 繼續落喺嗰部主機嘅 `<workDir>/<renderId>/web/maps`,冇任何嘢揸住個 handle。以前個 app 會喺佢旁邊提出再 send 成個 world 一次。

差咗嘅從來唔係件工作 — 工作好地地,仲行緊 — 差咗嘅係個**名**。所以喺 container 開始之前,app 先寫低一個:`<storageDir>/<renderId>/` 入面有 `render.json`(邊個 engine render 呢個,點收場)、`session.json`(而家行緊乜,去到幾遠)、`container.json`(邊個 container 喺邊部 host 做緊,輸出去咗邊)。

`container.json` 喺 container 開始*之前*寫,因為兩者之間嗰個窗口,正正就係一被殺就會產生一個冇人叫得出名嘅 container 嘅窗口。一個 run 嘅每一條出路 — 成功、失敗、取消、拋 error — 都會剷走佢,所以一個留低嘅 note 永遠唔會提出 reattach 一樣已經完結嘅嘢。佢帶嘅係個 target 自己嘅欄位而唔係一個 settings key,因為一個只寫 target id 嘅紀錄,一到有人改個 target 名嗰刻就變成讀唔到 — 而嗰個情境正正係佢存在嘅意義。

下次啟動(同每次被問到),app 攞每個名去問擁有佢嘅 daemon,得四種答案:

- **still running** → **reattach**:`docker logs --follow --tail all` 經 `ssh` stream 返嚟,報告成一個 live render。你會見到「仲喺 renderer@host:2222 嘅 container 'x' 度行緊…接手佢,而唔係喺旁邊開多個」。
- **exited** → **collect**:啲 tiles 已經喺嗰部機隻碟度,攞返嚟,render 完成。「app 閂咗嘅時候完成咗(exit code 0)…」
- **no such container** → 照 collect,但誠實講:`--rm` 喺佢一結束嗰刻就剷咗佢,exit status 一齊冇埋 — 冇任何嘢可以話佢係咪去到終點,要確認就再 render 一次,佢只會補返漏咗嘅。
- **冇回應(部 host 冇答)** → **兩樣都唔做。**乜都唔收,乜都唔棄,note 留低。「好可能仲行緊…等嗰部機答到先再試。」

三個值得講到明嘅細節:**reattach 係一次 launch,唔係第二條報告路** — `docker logs --follow` 變成一個 command 係 `ssh` 嘅普通 `EngineLaunch`,line reader、phase tracker、progress parser 同 cancellation 全部係普通 path 已經用緊嘅 code,reattached render 發同一個 `RenderEvent` union、出現喺同一個 list、郁同一條 bar、由同一個掣停。**`--tail all` 由第一行重播個 log** — 一個 app miss 咗兩個鐘嘅 render,唔會用一條零進度、冇 map 名嘅 bar 復活:tracker 睇晒 container 開始以嚟嘅每一行,去到真實嘅 percentage;重播嘅代價係幾千行 parsing,買到嘅係一條唔講大話嘅 progress bar。**`docker logs` 講唔到個 render 成唔成功** — 佢嘅 exit code 係 *client* 嘅,render 完成同 render 死咗都回傳 0,所以 reattached run 用 render 真正嘅判斷方法判 — engine 有冇印 `Your maps are now all up-to-date!` — 一份冇呢句就完咗嘅 log 報失敗,唔報成功。

取消一個 reattached render,同取消一個 live 嘅一樣,係問**遠端 daemon**。殺死揸住 `docker logs` 嗰條 `ssh` 只會停咗「讀」,而嗰個正正係成個功能要擺脫嘅處境。

一個用呢個 app 嘅命名規則命名、但**旁邊冇紀錄**嘅 container,只會被報告,永遠唔會自動停:冇紀錄,就冇嘢講到佢屬於邊個 render、輸出去咗邊,唯一誠實嘅做法係講出佢個名,畀人自己決定。

### Send 個 world,令中斷唔會白費

`scp` 冇 partial file 呢個概念。一個十 GB 嘅 copy 去到九 GB 斷咗,留低一個九 GB 嘅檔,下一次 copy 由 byte 零重新寫過佢。喺家用網絡,呢個唔係唔方便 — 係「render 得成」同「永遠 render 唔成」嘅分別,因為上傳時間長過斷線嘅間隔。

所以 app 喺**兩部機**都搵 `rsync`(佢喺每一端各行一份自己,所以一邊有係唔夠嘅),兩邊都有先用:`-a`(archive:遞歸、保留時間同權限)、`--partial`(斷咗嘅檔保留,唔剷)、`--append-verify`(checksum 完已經到咗嘅範圍,先由斷嗰度接落去)、`-e "<ssh …>"`(同一個 ssh,同一堆 security options)。

`--partial` 淨係*保留*塊碎片;`--append-verify` 先係令下一次 run 用得着佢。刻意唔用淨 `--append`:佢會讀 destination 已有嘅 byte,同 source 嘅同一段 checksum 對比,所以一個中途改咗嘅檔嘅碎片會成個重新 send,而唔係產生一個一半舊版一半新版嘅檔。world 資料夾正正係兩次嘗試之間會被編輯嗰種 source。

**log 喺一個 byte 未郁之前講明用邊個工具搬**,同埋兩種情況下中斷嘅代價,例如:「Sending with rsync 3.2.7 here and 3.1.3 on renderer@render.example…」對比「Sending with scp, because render.example has no rsync…」。邊部機冇 rsync 係指名道姓 — 一句「rsync is not available」會叫人去嗰部已經有嘅機度裝。

有一個利位,喺用嗰刻處理而唔係 assume 冇事:**rsync 將 remote shell 當一條 string 收,自己拆**,而呢個 app 嘅 `known_hosts` 住喺 application data 目錄下面 — Windows 係 `…\Worldlens\known_hosts`。一個 rsync build 尊唔尊重嗰啲 quote 係嗰個 build 自己嘅性質。所以啲字照 quote,而如果一個 rsync copy 照樣 fail,同一個 copy 會改用 `scp` 做,log 講明,連 scp 冇得續傳嘅代價都講埋。取消永遠唔會經 `scp` retry — 嗰個會係一個撳咗會開第二次上傳嘅 cancel 掣。有 guard 嘅遠端 `rm -rf` 同 `mkdir -p` 照舊行 `transfer.ts` 嗰套;rsync delegate 畀佢哋,唔會生第二份全 app 最具破壞性嘅命令。

### 真係冇得 resume 嘅嘢

有啲嘢係冇得 resume,每一種都講明係邊種,並且將重新開始擺明係一個明確選擇,而唔係靜靜雞做咗:

- container 畀 `--rm` 剷咗:tiles 照攞返,但佢嘅 exit status 冇埋,所以冇嘢 claim 知佢有冇完成。
- staging 目錄喺嗰部 host 度被剷咗:tiles 一齊冇埋,個 render 要重新開始。
- 呢部電腦嘅輸出資料夾被剷咗:呢個 render 乜都唔剩,重新 render 係唯一出路,而且會由零開始。
- **host key 喺 render 開始之後變咗**:用同一句拒絕新連線嘅說話拒絕,冇掣。一部重灌嘅伺服器同一部被攔截嘅,喺呢度分唔到。
- 個紀錄本身 parse 唔到,或者寫住一個唔似 host 嘅 host:app 唔肯由佢起一條 ssh 命令,個 render 要重新開始。
- 部 host 純粹冇答:乜都唔收,而且**乜都唔棄**;個 note 留低,因為佢係一個可能仲行緊嘅 render 存在嘅唯一證據。

紀錄入面嘅 host、port、user 同 key 路徑會落入一個 `ssh` argument,所以一個由碟讀返嚟嘅紀錄,要行返**一個新打入嘅 target 所行嘅同一套驗證**。紀錄係一個檔案,一個舊 build、一次手改、一個 restore 返嚟嘅 backup,都可以擺咗 `-oProxyCommand=…` 入去。

### 失敗模式

`remoteCode` 一覽(同埋去邊度整):`invalid-target`(target 照寫係用唔到 → target 自己啲欄位);`ssh-missing`(**呢部**電腦冇 `ssh` → 裝 Windows OpenSSH client);`unreachable`(DNS、refused、timeout、no route → 主機、port、網絡);`host-key-unknown`(未見過呢條 key → 對完 fingerprint 先接受);`host-key-changed`(唔係記錄嗰條 → 喺記錄嗰邊刻意處理,永不自動);`host-key-unavailable`(host offer 唔到一條可讀嘅 key → 嗰邊嘅 SSH 設定);`auth-refused`(條 key 被拒 → 嗰邊嘅 `authorized_keys`,或者呢邊嘅 agent);`docker-missing` / `docker-daemon-down` / `docker-refused`(嗰邊裝 Docker / 開 daemon / 入 docker group);`docker-unusable`(Docker 答咗啲認唔到嘅嘢,detail 帶 Docker 原話);`not-enough-disk`(嗰邊唔夠位);`transfer-failed`(有嘢兩邊都冇到齊,detail 帶 `scp` 原話);`remote-command-failed`(一條經 SSH 嘅命令因其他原因 fail,detail 帶 exit code 同原話);`render-failed`(container 行咗但冇完成 → engine 自己嘅診斷);`cancelled`(你撳咗 Cancel — 唔係 error)。

`render-failed` 仲包埋一個睇落似成功嘅 case:engine 印咗個 warning banner、乜都冇 update、exit **0**。信個 exit code 就會將一個冇產出 tiles 嘅 render 報成完成,所以一個 run 只有喺 engine 同時講咗 `Your maps are now all up-to-date!` 先算成功。

### 安全事項

- **邊度都冇密碼。**冇欄、冇儲存、冇 argument,加上一堆令 client 就算被 offer 都拒收嘅 SSH options。
- **私鑰永遠唔會被讀、寫或者抄。**只記一條路徑,只有 `ssh` 開佢。
- **冇 host key 會被靜默信任。**每次呼叫都 `StrictHostKeyChecking=yes`;unknown key 係一個交畀人嘅決定,changed key 係一個冇 override 嘅拒絕。
- **app 只寫自己嘅 trust store**,永不寫 `~/.ssh/known_hosts`。
- **renderer 提供唔到 key**,只可以指名一個佢被展示過嘅 fingerprint。
- **每一個遠端字都用 POSIX 單引號 quote**,shell 冇任何方法重新解釋。`ssh host <words>` 唔係行一個 argv — 佢將啲字 join 埋,成條 string 交畀遠端 login shell — 所以一個叫 `Saves, old (2)` 嘅 world 資料夾唔係 edge case,係一條爛命令,或者更衰,一條唔同嘅命令。唯一例外係 workDir 開頭嘅 `~`,喺唯一負責 resolve 佢嗰條命令度留喺 quote 外面,因為 quote 咗嘅 tilde 唔會展開,個 render 會 stage 落一個名真係叫 `~` 嘅目錄。
- **個 world 喺 container 入面永遠唯讀 mount。**render 讀 chunks,寫 tiles。
- **唔發佈任何 port。**remote render 冇 web server;tiles 返屋企,由呢個 app serve。撳一下 Render 就順手喺人哋伺服器開一個 port,唔係呢個 app 會做嘅嘢。
- **遠端 `rm -rf` 喺遠端嗰邊都有 guard,唔只呢邊。**條路徑呢邊已經驗證;遠端 script 行之前再拒絕 `/`、空值同 `..` 路徑。`rm -rf` 配一個意料之外嘅變數係一個 script 可以行嘅最具破壞性嘅命令,錯咗嘅代價係人哋部伺服器。

### 驗證

`design/packages/app/src/main/remote/` 有 154 個測試,冇一個需要 SSH client、container runtime、伺服器或者網絡。逐個檔:`target.test.ts`(`-oProxyCommand=` 形嘅 host 被拒;帶 `:` 嘅 work directory 被拒;password 形嘅嘢過唔到驗證);`ssh.test.ts`(啲 options 令密碼冇可能、unknown key 永不靜默接受;`ssh -p` 對 `scp -P`;quote 一個真人會有嘅資料夾名;exit code 決定係邊個嘅失敗);`hostkey.test.ts`(fingerprint 同一個獨立計嘅 `ssh-keygen -l` 值吻合;一條冇被 offer 嘅 key 記錄唔到;記錄係 append 唔係 replace);`preflight.test.ts`(unreachable 嘅主機永不提 Docker;Docker missing、daemon down 同 refused 係三句唔同嘅句子;changed key 唔會產生可接受嘅 fingerprint;`df -Pk` parsing);`transfer.test.ts`(destination 嘅 parent 會先開,copy 唔會落深咗一層;遠端 `rm` guard;取消嘅 transfer 係停低而唔係做埋);`rsync.test.ts`(**中斷嘅 transfer 會 resume 而且只 send 未到嘅嘢** — 對住一個數 byte 嘅 fake host assert,而唔係 assert 一個 flag 存在;「呢部電腦冇 rsync」同「嗰部主機冇 rsync」係兩句分開嘅句子;帶空格嘅 `known_hosts` 路徑有 quote;一個 fail 咗嘅 rsync 經 `scp` 完成而且**講明代價**;取消嘅 copy 永不 retry);`plan.test.ts`(world 唯讀 mount、乜都唔發佈、container 有名有 `--init`);`reattach.test.ts`(紀錄嘅 host 行返 typed target 嘅同一套驗證,入面嘅 `-oProxyCommand=` 被拒;changed host key 報成佢自己,永不報成一個唔見咗嘅 container;log 經 `ssh` 當普通 launch 咁 stream;stop 去到遠端 daemon;唔見咗嘅 staging 目錄就話唔見咗);`orchestrator.test.ts`(成條 flow:上傳乜、咩次序、一個入面係 container 路徑嘅 config、container 自己嘅進度報成本地 render 咁、一個**取消咗**嘅 render 清理完而且唔報失敗、一個被拒嘅 preflight 乜都唔上傳、一次 fail 咗嘅 transfer、一個 exit 0 但冇完成嘅 container,同埋 **container 個名喺開始之前寫低、無論個 run 點收場都剷走**);`ipc.test.ts`(channel 註冊同 dispose 準確;冇 handler reject;只有 fingerprint 去到信任步驟)。

container 狀態本身 — still running、app 唔喺度嗰陣完成咗、被 daemon 剷咗、一個 cancel 到達 reattached container — 喺 `design/packages/app/src/main/runtime/` 度證,見 [docker-and-local.md](./docker-and-local.md#picking-a-container-back-up-after-the-app-closes)。喺 `design/` 度行 `npx vitest run packages/app`,加埋 `npx tsc -p packages/app --noEmit` 同 `npx eslint packages/app`。

未驗證嘅:對住一部真遠端主機嘅 end-to-end render。呢度起嘅每一條命令都逐隻字 assert 過,每一條失敗路都對住一個學真工具咁答嘅 fake 行過,但真伺服器嘅 capture 仲未有 — 呢一節直接講明,而唔係暗示有。

### 已知限制

- **`scp` 仍然係地板,而且係慢嗰 part。**佢一個檔開一條 channel,而一個 world 係幾萬個細 region 檔。任何一邊冇 rsync 就用佢;有 guard 嘅遠端 delete 同 `mkdir -p` 亦永遠行佢嗰套。一個 streamed `tar` 會快過兩者,但未起。
- **rsync 令 transfer 變 resumable,唔係 BlueMap 意義上嘅 incremental。**佢跳過已經到咗嘅檔案內容;佢唔知個 world 之前 render 過。BlueMap 自己嘅 incremental render state 住喺 staging 目錄,而 render 完個目錄就會剷(除非 `keepRemoteFiles` 開咗)— 所以同一個 world 嘅第二次 render 照舊係 full render,開嗰個設定先會改變呢樣嘢。
- **一個冇紀錄嘅 container 只能被報告,唔能被 reattach。**冇個 note,就冇嘢講到一個 container 屬於邊個 render、輸出去咗邊。stray 亦只會喺**本地** daemon 度搵,因為 stray 嘅定義就係紀錄唔見咗嘅 container,冇紀錄就冇 host 可問。
- **一個 render id 同一時間一個 target**,同本地 render 一樣。
- **remote failure 冇 settings row 連結。**`render/failure.ts` 擁有啲 settings anchor,但冇 remote target 嗰個,所以 remote 失敗將個 fix 寫喺 message 度而唔係一條 link;加一個即係改嗰個檔。

### 相關閱讀

- [Worlds from somebody else's release](./world-sources.md) — world 喺機器之間移動嘅另一條路。
- [Worlds hosted on your own SSH server](./ssh-world-sources.md) — 同一條連線、同一套 host-key 同 transfer 機器嘅「讀」方向:由你自己嘅伺服器攞 world,而唔係 send 上去。
- [Rendering a world in GitHub Actions](./render-in-actions.md) — 另一部可以幫你 render 嘅機,而且係唔使你自己有伺服器嗰部。
- [Renders that survive being interrupted](./resumable-renders.md) — 本機 render 嘅同一個承諾,同埋令繼續一個 render 變平嘅 incremental 行為。
- [Running the engine on this computer, or in a container](./docker-and-local.md) — reattachment 機器住嘅地方,同埋佢一樣適用嘅本地 container。
