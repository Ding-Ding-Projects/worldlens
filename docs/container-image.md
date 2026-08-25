# The container image

Published to the GitHub container registry on every push, for `linux/amd64` and `linux/arm64`.

## Behaviour

Two images are built from this repository and they do different things:

| Image | What it serves |
| --- | --- |
| `worldlens-cli` | Renders worlds and serves upstream BlueMap's map viewer. A map, and nothing else. |
| The hosted image | The WorldLens application itself. See [hosted mode](hosted-mode.md). |

The CLI image is what CI publishes today. It takes a config folder and a world, renders, and
serves the result on port 8100.

```
docker run --rm -p 8100:8100 \
  -v "$PWD/config:/data/config" \
  -v "$PWD/my-world:/data/world:ro" \
  ghcr.io/ding-ding-projects/worldlens-cli@sha256:… -c /data/config -r -w
```

## Configuration

The image is built from the repository root, because it needs both the pnpm workspace and the
vendored webapp source:

```
docker build -f design/packages/cli/Dockerfile -t worldlens-cli .
```

`/data/config` and `/data/world` are declared volumes. The container's working directory is
`/data`, and that is the one sharp edge worth knowing: a relative `world`, `data` or `web` path
in a mounted `maps/*.conf` resolves against the working directory rather than against the config
folder.

## Failure modes

**A build fails rather than publishing a broken image.** Three assertions do that work:

- The vendored webapp is built inside the image and its output is checked. A Vite build that
  emits nothing still exits 0, and without this it would surface much later as a container
  serving 404s for its own viewer.
- The SQL adapters are imported and a real WebAssembly round trip is executed, so a payload
  that is present but unloadable fails here rather than at first use.
- The runtime stage runs the entry script on the target architecture's own Node.

That last one is the one that keeps the build honest. The expensive half of the build — the
dependency install and the TypeScript compile — is pinned to the builder's own architecture,
because the CLI's dependency graph contains no native modules and its output is therefore
architecture-independent JavaScript. Building it once rather than a second time under emulation
costs nothing in correctness *while that remains true*. The per-architecture assertion is what
turns the day it stops being true into a build failure rather than a published image that dies
on first run.

**The image could not be built from a clean checkout at all until recently.** The vendored
webapp's `dist/` is gitignored upstream — it is a build output, not tracked content — so
`COPY`ing it only ever succeeded on a machine that had already built it. Every "verified" local
build was really a build against a warm tree, which is exactly why nothing in CI had tried. The
webapp is now built inside the image and its prebuilt copy is excluded from the build context
outright, so a warm machine and a clean checkout produce the same image.

## Security considerations

- **Runs as an unprivileged user** (uid 1000), reusing the base image's own rather than masking
  the fact by creating another at a different id.
- **The registry login uses the workflow's own token**, not the shared release-token chain every
  other job uses. That chain exists so GitHub API calls can fall back to a personal or
  organisation token; a token that can publish a release does not thereby carry `write:packages`,
  and reaching for a broader long-lived credential to fix a scope error trades a correct narrow
  token for a wrong wide one.
- **A pull request builds and stops.** It never logs in and never pushes, in two separate steps
  rather than one conditional, so the pull-request path cannot reach a registry even if a
  condition were mis-edited later.
- **`latest` moves only on a push to the default branch.** A dispatch publishes its own immutable
  tags but must not silently become the tag people pull.

## Verification

Every run publishes three references: the version, `sha-<commit>`, and — on the default branch —
`latest`. The digest is recorded in the run's own summary, and the digest is the reference that
matters: both this project's container manager and its sibling deployment application refuse an
image that is not pinned to a `sha256`, so a floating tag is not a usable answer to "which image
did this run produce".

The published manifest carries both architectures, confirmed by inspecting it:

```
linux/amd64   sha256:2348d93c8e478c15b9c…
linux/arm64   sha256:314b82aeff31eb8ac86…
```
