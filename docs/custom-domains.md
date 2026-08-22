# Putting a map on your own domain

Any of the three hosting routes can answer on a domain you own, through Cloudflare:

| Hosting route | What the record points at |
| --- | --- |
| GitHub Pages | `<owner>.github.io` |
| AWS CloudFront | the distribution's domain name |
| This computer | the tunnel's `<id>.cfargotunnel.com` hostname |

## The Cloudflare token

This is the one credential this application actually holds. The GitHub and AWS routes
never hold one — their CLIs own it and the app asks those CLIs to act — but Cloudflare has
no equivalent broker, so you enter an API token in the app.

Being responsible for it makes the rules stricter, not looser:

- **It goes in the operating system's credential store.** DPAPI on Windows, the Keychain
  on macOS, libsecret on Linux. Never a plain file.
- **A machine with no credential store is refused, not downgraded.** On a Linux desktop
  with no secret service running, the app says so and keeps the token in memory for that
  session only. Writing it in plaintext so it "works everywhere" would produce a file
  readable by every process running as you, in a predictable path, backed up by whatever
  syncs that folder, and indistinguishable from a protected one.
- **It never comes back out.** The app can tell you a token *is* stored, when it was saved,
  and which Cloudflare account it resolved to. It cannot tell you the value, its length,
  its first four characters, or a fingerprint of it — those feel harmless, each narrows a
  search, and none of them helps you do anything.
- **It never enters** a project file, an export, a log, a capture, local history,
  telemetry, or Git.
- **Clearing it clears memory too.** A clear that only removed the file would leave the
  token live until restart, which is not what "forget this" means.

### The two scopes it needs

Create a **token**, not a global API key. A global key carries every permission on your
account including billing, for a job that needs two things:

| Scope | Why |
| --- | --- |
| Zone → DNS → Edit | To create and update the record that points your domain at the map. |
| Account → Cloudflare Tunnel → Edit | Only if you are publishing from your own machine. |

## Pending is not live

When the app writes the DNS record it reports **pending**, and it will keep saying pending
until the address actually answers.

This is deliberate and it is the most important thing on this page. The API call really did
succeed — that is what makes reporting success so tempting — but DNS has to propagate and a
certificate has to be issued, so you open the address thirty seconds later, get an error,
and conclude the app is broken rather than that it is early.

Only a real request to `https://<your hostname>/` that answers turns this **live**. A
request that fails stays *pending* rather than becoming *failed*, because a failure here is
overwhelmingly "not propagated yet" and calling it failed sends you off to fix a working
setup.

## An existing record is never overwritten silently

If something already points at that name and it is not this project's map, the app reports
a **conflict** and changes nothing. That record may be serving a live website, and the only
sign of a silent overwrite would be their site going down. Replacing it is an explicit
choice you make.

## Proxied, or not

The app sets this per route and the choice is not cosmetic:

- **A tunnel must be proxied.** `cfargotunnel.com` only resolves through Cloudflare's edge,
  so an unproxied record for it points at something the public internet cannot reach at all.
- **GitHub Pages must not be.** Pages issues its own certificate, and proxying in front of
  it before that certificate exists produces a redirect loop that is genuinely unpleasant
  to diagnose.
- **CloudFront is not proxied either**, since it is already a CDN.

## Related

- [Cloudflare tunnels](cloudflare-tunnel.md) — reaching a map hosted on your own machine.
- [AWS hosting](aws-hosting.md)
- [Pages hosting](pages-hosting.md)
