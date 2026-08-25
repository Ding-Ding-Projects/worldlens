# Hosted mode: the interface in a browser

The same application the desktop ships, served from a container and opened in a browser tab.
The renderer bundle is the same one, in front of the same feature modules; only the transport
between them differs.

This is a different artifact from the [container image](container-image.md) built by CI. That
one renders worlds and serves upstream BlueMap's map viewer — a map, and nothing else. This one
serves the application.

## Behaviour

The desktop application already serves its own renderer over HTTP: an embedded server on
loopback, a random token per launch, and the Electron session attaching that token to every
subsequent request. The only thing welded to Electron was `window.worldlens`, the object every
one of the interface's ~350 calls goes through.

That object now comes from a single factory that takes a transport. The preload supplies one
backed by `ipcRenderer`; a browser supplies one backed by `fetch` and a single `EventSource`.
There is deliberately one factory rather than one per host, so a method added for the desktop
is present in a hosted deployment by construction rather than by anyone remembering.

Two things about the transport are worth knowing because they look wrong at a glance:

- **A handler that throws comes back as HTTP 200**, carrying an error envelope the client
  re-throws. Every call site was written against `ipcRenderer.invoke`, where a throwing handler
  yields a rejection carrying that handler's own words. Making it a 500 would mean the client
  could not tell "this world has no region files" from "the server fell over". Transport failure
  travels in the status; application failure travels in the body.
- **All 22 push channels share one event stream.** Browsers cap concurrent connections to one
  origin at around six, so a stream per channel would exhaust the pool and read as a slow
  server. The cost is real — one stalled reader loses every channel rather than one — which is
  why the stream carries event ids and a short replay buffer, and tells a client that missed
  more than is held rather than handing it an incomplete stream.

## Configuration

Everything comes from the environment, because the thing that starts this is a `docker run`
line or a compose file.

| Variable | What it does |
| --- | --- |
| `WORLDLENS_MOUNTS` | The folders this deployment may touch, as `id:path[:ro][:Label]`, comma separated. |
| `WORLDLENS_PASSWORD` | The password. Hashed immediately; never held or printed. |
| `WORLDLENS_PASSWORD_SHA256` | The same thing pre-hashed, so a compose file need never hold the password itself. |
| `WORLDLENS_CAPABILITIES` | Grants that reach past the container: `docker-socket`, `ssh`, `github`. |
| `WORLDLENS_HOST` / `WORLDLENS_PORT` | Where to listen. Defaults to every interface on 8110. |
| `WORLDLENS_DATA` | Where this deployment keeps its own records. Separate from the operator's mounts. |
| `WORLDLENS_BEHIND_TLS` | Set when a proxy terminates TLS, so the session cookie may be marked `Secure`. |
| `WORLDLENS_INSECURE_NO_PASSWORD` | Say, in as many words, that this network needs no password. |

The mount declaration and the `-v` flags are written twice on purpose, in two similar forms.
The `-v` puts a folder inside the container; the declaration says which folders the application
may touch and what to call them. Neither implies the other, and a folder mounted but not
declared is invisible to the application — which is the safe way round.

## The mount root browser

Three refusals above end with the same sentence, "Choose from the folders the operator
mounted.": `config:pickDirectory`, `config:pickFile`, and the whole `dialog` prefix that
`dialog:pickFolder` and `dialog:pickFile` sit under. Until now that sentence pointed at
nothing: a refusal that names
a replacement which does not exist reads worse than a plain refusal, because it reads as a
feature the person failed to find. This is what it now points at, a dialog for choosing a folder
(or, in file mode, a file) from the deployment's own declared mounts.

**Why a browser, and not a text field asking for a path.** Not mainly for security: a typed path
that escapes a mount is refused by `MountRoots.resolve` regardless of where it came from, exactly
as it already is everywhere else. The real reason is that a text box asks a person to already
know the answer, about a filesystem inside a container they did not lay out, whose paths are
whatever the operator's `-v` flags happened to say. Typing is guessing, and every wrong guess
comes back as a refusal that reads as broken software rather than as a wrong path.

**The mounted-folder list is the browsing surface and the boundary at the same time.** The
interface offers exactly the folders `WORLDLENS_MOUNTS` declared (`MountRoots.list()`), and
opening one or walking into a subfolder calls the same `MountRoots.resolve` that confines every
other channel. That is what makes it impossible to be shown a folder and then refused for
choosing it: what is offered is, by construction, everything that would be permitted.

**Every entry in a listing is resolved, not only the folder being listed.** A directory can hold
a symlink pointing anywhere on the host, so a listing that confined only its own path would print
the names of files outside the mount even though nobody could open them. Names are not contents,
but a listing is exactly how somebody learns what exists, and "you can see it, but you cannot
have it" is not a boundary worth explaining. `browseMount` resolves the folder once and then
resolves each entry again before adding it to the listing; an entry whose resolved path lands
outside the requested root, symlink or not, is dropped rather than listed and then refused. That
case leads the test file, because it is the one that decides whether this is a boundary or a
decoration.

**The root id is checked as well as the resolved path.** Asking to browse root `worlds` with a
path that happens to sit inside root `renders` is refused, naming the mismatch, rather than
quietly returning `renders`'s contents labelled as `worlds`. Without that check the id on a mount
would be decorative, and two mounts with different writability could be made to look like one.

**Three states look alike and are not.** An empty folder, a folder that failed to read, and a
folder whose local search matched nothing all render as "nothing here" unless the interface says
more. Only the first one means there is genuinely nothing there. A read failure gets its own
message rather than an empty list; a search with no matches gets "Nothing here matches that
search" beside a live "Showing X of Y" count from the same regex-capable search bar used
elsewhere in the application, so a filter that hides everything is visibly a filter and not an
empty folder.

**A folder with more entries than one listing will hold is capped, and the cap is reported.** The
ceiling is 2000 entries per folder (`MAX_ENTRIES`), so a folder with a hundred thousand region
files cannot turn one click into a hundred thousand resolve calls and an unusable dialog.
Truncation sets a `truncated` flag on the listing rather than silently shortening it, and the
dialog shows it as a note to search rather than as a shorter, unexplained list. A listing that
quietly stops reads as "that file is not here" to the one person who came looking for it.

**On the interface side**, `MountRootBrowser.vue` is the dialog: the mounted folders first, then
a chosen folder's contents with an Up action and a way back to "all mounted folders," and, in
file-picking mode, a chosen file held selected until confirmed. It talks to the server through
`mountBrowserHost.ts`, which resolves `window.worldlens.mounts` the same way the existing
`pathFieldHost.ts` resolves `window.worldlens.dialog`, and follows the same all-or-nothing rule:
a build exposing only one of `list`/`browse` resolves to no bridge at all, so a caller falls back
cleanly rather than discovering a half-wired control the moment somebody clicks it.

**What has and has not been proved.** `browseMount`, `MountRootBrowser.vue`, the
`mounts:list` / `mounts:browse` channels, their handlers and the path field that opens them are
all in place with tests. What is missing is a capture: nobody has photographed the picker open
against a real container, so the surface is described here rather than shown.

One thing worth knowing about how the path field decides. The mount methods exist on every
build, because the bridge is a single factory for both hosts, so detecting them would send
desktops down the hosted path and swap a working native picker for a browser with nothing to
list. The deployment is asked instead, over `app:deployment`, and while the answer is unknown
the field behaves as a desktop. A hosted deployment whose server never registered the two
channels falls back to the ordinary refusal, which at least says what is wrong.

## Failure modes

**It refuses to start on a network address with no password.** Thrown before anything listens,
not warned: a deployment that warns and starts anyway has started anyway, and the warning
scrolls out of a container's log within seconds. Unlike the CLI image, which serves a public
map, this carries the whole application and everything mounted into it.

**A channel the deployment cannot answer is refused with a reason and, where one exists, the
thing to do instead.** There is no desktop to open a folder picker on, no window to minimise,
no file manager to reveal a file in, and a container does not update itself in place. Each of
those says so rather than doing nothing, because a control that silently fails reads as broken
software rather than as software that knows where it is running.

**A channel that reaches past the container is off until an operator turns it on.** The Docker
socket, SSH and GitHub credentials each have their own grant, and an ungranted channel names
the grant that would allow it.

**A permitted channel that nothing has wired yet answers "no handler is registered".** That gap
is deliberately visible. Narrowing the policy to whatever happens to be wired would hide it.

## Security considerations

Said plainly: this is a single-operator remote control surface with a password in front of it.
It is not multi-tenant, there are no accounts, and everyone who knows the password is the same
person as far as the server is concerned.

- **The session is a cookie**, `HttpOnly` and `SameSite=Strict`. A cookie rather than a header
  because `EventSource` cannot set a header at all, and two mechanisms drift.
- **The interface asks for the password before it mounts.** This was missing for longer than it
  should have been, and the shape of the gap is worth recording because nothing about it looked
  broken. The server side was complete: every bridge call was refused with 401, and
  `/bridge/session` reported `{"required":true,"signedIn":false}` on request. Nothing ever
  asked it. So an unauthenticated visitor got the entire application shell, every destination
  and every control, with a 401 behind all of it and no prompt anywhere. The password was
  protecting the data perfectly and telling nobody it existed, which reads as software that is
  simply broken rather than software that is locked. The prompt now gates the mount rather than
  overlaying it, because mounting first would run every screen's own startup fetch against that
  401 before the person had anywhere to type. A build with no such endpoint, which is every
  desktop build, carries on exactly as before.
- **Every path is confined to the declared mounts**, resolved through `realpath` before being
  compared. A symlink inside a mounted folder pointing out of it is inside the root right up
  until the operating system follows it, which a string comparison never catches.
- **Read-only mounts are enforced twice**: the resolver refuses write-shaped channels naming
  them, and the image documents `:ro` on the bind mount.
- **An unclassified channel is refused**, which is the opposite default from the renderer's own
  capability check. The cost of being wrong there is a hidden button; here it is a hole in a
  network surface arriving by default.

## Verification

- The channel inventory is locked to the bridge factory in both directions, with a tripwire for
  the case where the scanner stops matching and every comparison silently becomes vacuous.
- The capability profile fails when any reachable channel has no policy. Watched fail three
  ways: a prefix dropped, an opt-in quietly made available, and the default flipped from refuse
  to allow.
- The mount confinement was watched fail against the naive prefix comparison it replaces, on
  the symlink case and the traversal case.
- The mount root browser's tests cover the escaping-symlink drop, a root-id/path mismatch, a
  missing root, an unreadable folder reported apart from an empty one, folders-before-files
  ordering and truncation past `MAX_ENTRIES`. Two of these were watched fail on purpose before
  being trusted: removing the per-entry confinement lets an escaping symlink into the listing,
  and deciding the host by whether the mount methods exist sends a desktop down the hosted path.
  Both turned red, then green when restored. The picker has not been captured against a real
  container.
- The container was run: signed in with a password, wrong password refused, real feature modules
  answering through the bridge from inside the image, and a flat refusal to start on a network
  address with none. Running it is also what found that `history:status` reported git missing —
  honest, and a sign the profile was promising something the image could not do.
- Measured at 320, 375 and 768 CSS pixels in a real browser against the real container. Zero
  horizontal overflow at all three. See [the captures](screenshots/hosted-375.caption.txt).
