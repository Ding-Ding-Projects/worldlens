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
- The container was run: signed in with a password, wrong password refused, real feature modules
  answering through the bridge from inside the image, and a flat refusal to start on a network
  address with none. Running it is also what found that `history:status` reported git missing —
  honest, and a sign the profile was promising something the image could not do.
- Measured at 320, 375 and 768 CSS pixels in a real browser against the real container. Zero
  horizontal overflow at all three. See [the captures](screenshots/hosted-375.caption.txt).
