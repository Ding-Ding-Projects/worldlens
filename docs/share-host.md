# Host the map

"Host the map" turns a finished render into a working link in one dialog. The person picks **This PC** or a saved **SSH host**, an instance name, a free port and the maps to include, and Worldlens does the rest: it loads a small map server image into that machine's Docker, copies the maps into a private volume, starts the container and opens the link from this PC before it reports the map as ready.

The design boards are `design/design-sources/share-and-host/HostMap.dc.html` and `Main.dc.html`.

## What runs where

| Piece | Location |
| --- | --- |
| Map server image source (static Go binary on an empty root filesystem) | `design/packages/mapserver/` |
| Image build for the app (tar per architecture + manifest) | `design/packages/app/scripts/build-mapserver-image.mjs` |
| Main-process hosting and instance manager | `design/packages/app/src/main/sharehost/` |
| Dialog and its bridge | `design/packages/ui/src/components/sharehost/` |

### The map server image

* `GET /health` answers JSON without asking for the access code: `{ status, label, title, version, maps, ready, protected, checkedAt }`. It returns 503 while the volume holds no map.
* It serves `/data/map`. BlueMap stores tiles gzip-compressed, so a request for `x.prbm.gz` is answered with the raw gzip bytes, and a request for `x.prbm` when only `x.prbm.gz` exists is answered with `Content-Encoding: gzip`, the way BlueMap's own server does.
* It reads its settings from `/data/worldlens-map.json`: `title`, `healthLabel`, and an optional `access` object holding the viewer name and a salted scrypt verifier (`scrypt$N$r$p$<salt hex>$<hash hex>`). The access code itself is never stored anywhere. Access uses HTTP Basic, compared in constant time; `/health` stays open.
* `mapserver --extract-tar /data` reads a tar from standard input into the volume (regular files and folders only; a link, device or path escaping the destination is refused). The same image fills its own volume, so no second tool is needed and no folder of the sending machine is mounted.
* Listens on 8080 in the container, runs as `65532:65532`, and is started read-only with every capability dropped and `no-new-privileges`.

The packed tar's first member is `worldlens-map.json`, then `map/**`. The image is tagged `worldlens-map-server:bundled`.

### Bundled, never downloaded at host time

`scripts/build-mapserver-image.mjs` writes `build/mapserver/worldlens-map-server-amd64.tar`, `…-arm64.tar` and `mapserver-image.json`, which `package` and `make` ship as `mapserver/` in the app's resources. The manifest records each tar's SHA-256 (checked again before a tar is sent anywhere) and the image's layer ids (so a machine that already has the image skips `docker load`).

* With Docker usable it builds each architecture with `docker buildx build --output type=docker`.
* Without Docker (or with `--from-registry`) it fetches the digest pinned in `scripts/mapserver-image.lock.json` from GHCR over HTTP, verifies every blob against its digest and assembles the tar itself. While the lock holds no digest this route stops with a clear message.
* The CI job `map-server-image` builds the tars on Linux, uploads them as an artifact for the Windows installer job, and pushes the multi-arch image to GHCR with a recorded digest.
* The plain development build runs the script with `--optional`; a build without the image reports that hosting is unavailable.

## The five steps

1. **Load the bundled map server image**: skipped (and reported as already there) when the layer ids match; otherwise `docker load` with the tar streamed from the app, locally or through `ssh`.
2. **Pack the rendered map**: the chosen maps become one tar on this PC. `settings.json` is rewritten inside the tar only (`clientDecompression: true`, map list cut to the chosen maps); the render on disk is never edited.
3. **Copy it into a private volume**: a labelled named volume, filled by the image's own `--extract-tar` run (`--network none`, read-only, capabilities dropped).
4. **Start the container**: ownership labels, restart policy from the first switch, the volume mounted read-only, the port published on `0.0.0.0` (reachable on my network) or `127.0.0.1`.
5. **Check health and the network link**: the host's LAN address is found (this PC: the adapter holding the default route; an SSH host: asked of the host with `ip route`), and `http://<ip>:<port>/health` is requested from this PC. Only an answer from the map server produces the ready card. If this PC cannot open the link the run fails with that reason (a firewall is the usual cause) and is undone.

The ready card shows the link with **Open** and **Copy link**, and, when requested, the viewer name and a generated access code with **Copy code**. The code is shown once: it exists only in the dialog until the dialog closes.

## Failures

A failed step reports the command with its exit code and the last 20 lines it said. Nothing on a command line is secret, because settings and the access verifier travel inside the tar. Whatever the run created (container, volume) is removed again, and the registry only learns about an instance once it is ready. A taken port is caught before Docker is touched and also when `docker run` refuses it; both offer **Use port N and retry**.

## Instances

Every hosted map is recorded in `sharehost/instances.json` in the app's user data (no access code in it). The instance manager (`ShareHostManager`) lists, starts, stops, restarts, updates and removes only recorded instances, and re-checks the container's ownership label and instance id against Docker before acting. A record pointing at a container without those labels is left alone; a labelled container with no record is never listed. Removing an instance removes its container, its volume (also checked by label) and its record, and says which of those it could not remove. Updating sets the old container aside, starts the new image on the same volume and port, deletes the old one only after the new one is healthy, and puts the old one back if the new one fails.

## Personal wording

When a personal vocabulary file is loaded, the labels the map server shows (its health label) and the container's display label are passed through the same whole-string replacement as the rest of the app when the map is packed. The mapping is never written to source, never logged and never placed in the image.

## Security notes

* The access code is generated with a CSPRNG, hashed with scrypt (N=16384, r=8, p=1) and never stored or logged; a lost code means hosting again.
* The container is read-only, unprivileged, has no capabilities, and the map volume is mounted read-only.
* SSH uses the app's existing strict host-key settings, key or agent authentication only, and never a password.
* Hosting on the local network is the person's choice (the third switch); nothing is exposed to the internet by this feature.

## Verification

* `go test ./...` in `design/packages/mapserver` (serving, `.gz` handling, access, traversal, extraction).
* `pnpm --dir design exec vitest run packages/app/src/main/sharehost packages/ui/src/components/sharehost` (scripted Docker and SSH, tar read-back, manager ownership rules, dialog behaviour).
* `node --test design/packages/app/scripts/build-mapserver-image.test.mjs` (tar format, registry assembly, digest checks).
* `WORLDLENS_LIVE_DOCKER=1 pnpm --dir design exec vitest run packages/app/src/main/sharehost/hostMap.live.test.ts` hosts a map on the local Docker daemon and fetches it from the detected LAN address, with and without the access code, then removes it.

Not covered by an automated run: hosting over a real SSH connection, arm64 containers executing, and Windows firewall prompts.
