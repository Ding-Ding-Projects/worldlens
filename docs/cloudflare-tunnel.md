# Publishing a map from your own machine

A map served from your own computer is reachable on your own network and nowhere else. A
Cloudflare tunnel fixes that **without a port forward, a public IP address, or a hole in
your firewall**, because `cloudflared` dials *out* to Cloudflare and traffic comes back
down that connection.

That single fact removes most of the machinery you would otherwise need. There is no bind
address to choose, no loopback-versus-public decision, and — the part worth checking if you
are suspicious — **no published port at all**. The app asserts that per runtime in its own
tests, because it is the entire security argument for hosting this way.

## Where cloudflared runs

Your choice of three. All three are the same code underneath, so none of them is a
second-class path:

| Runtime | Good when |
| --- | --- |
| **On this computer** | Simplest. A supervised process alongside the local server. |
| **In a container here** | You would rather not install another binary. |
| **In a container on another machine, over SSH** | The map is served by a box that is already on all the time. |

The container runtimes need a **digest-pinned image** — `cloudflare/cloudflared@sha256:…`,
not `:latest`. Every managed container in this app is pinned, and a tag that can change
under you between one run and the next is a poor thing to be holding a tunnel into your own
machine. An unpinned reference is refused rather than accepted with a warning.

The SSH runtime keeps `StrictHostKeyChecking=yes` and password authentication off, exactly
as the existing remote-render support does. Your `identityFile` stays a **path**: this app
has never read a private key and does not start here.

## The tunnel's own credential

Creating a tunnel gives back a token that is itself a secret. It reaches the container as
an **environment variable** rather than a command-line argument, because an argument sits
in `docker ps` output for anybody on that machine to read.

Anywhere the app shows you the command it is about to run — a preflight panel, a
troubleshooting view — the token is replaced with `<tunnel token>`. Showing the real
argument list would put a live credential into your next screenshot.

## Reading the state

- **starting** — the process or container has been launched.
- **connected** — with the public address it is answering on.
- **disconnected** — with the reason, rather than a spinner that never resolves.

Stopping a container tunnel removes the container. The host runtime is a supervised
process, so it is signalled instead — the app deliberately returns *no* stop command for
that case rather than a plausible-looking one, because a caller would run it, see it
succeed, and believe the process had stopped.

## The DNS side

A tunnel's hostname only resolves through Cloudflare's edge, which is why its DNS record
**must** be proxied. An unproxied record for `cfargotunnel.com` points at something the
public internet cannot reach at all. The app sets this for you; it is documented here
because it is the kind of setting somebody changes in the Cloudflare dashboard while
troubleshooting and then cannot work out why nothing resolves.

See [custom domains](custom-domains.md) for the token, its two scopes, and why writing a
record reports *pending* rather than *live*.

## Related

- [Custom domains](custom-domains.md)
- [Remote rendering and hosting](remote-render.md) — the SSH and Docker hosts this reuses.
