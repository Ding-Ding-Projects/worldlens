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

## Which commit an image came from

Both Dockerfiles carry the standard OCI revision label, so `docker inspect` and every registry
UI already know where to look:

```
docker inspect <image> --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
```

CI passes `github.sha` as the `WORLDLENS_SOURCE_COMMIT` build argument. It does not run `git`
inside the build, because the checkout there is whatever the build context copied in rather
than a repository.

**An image built without that argument reads back empty rather than claiming a revision it does
not have.** The `ARG` defaults to `""` deliberately: a plausible-looking default would make an
unstamped image indistinguishable from a stamped one, which is the exact confusion the label
exists to remove.

A build timestamp alone does not settle this. Two builds of different commits can share a
committer date, so the time says *when* and only the commit says *which*.

The running container prints the same value on startup, beside its password line, because an
operator looking at a container cannot pull the image and read its labels. When the build could
not establish a commit it prints `commit unknown` rather than a blank.


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

The revision label was verified on a real daemon rather than asserted. Building exactly the
`ARG`/`LABEL` lines this file describes and inspecting the result:

```
docker build --build-arg WORLDLENS_SOURCE_COMMIT=449506ade841e7fd182990458dd7f57de4374256 .
docker inspect … --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
449506ade841e7fd182990458dd7f57de4374256
```

and the negative, built without the argument, reads back empty rather than a fabricated value.
That proves the argument-to-label wiring. It is not a build of the full image and does not
claim to be.

## 廣東話

呢個 repository 出兩個 image，做唔同嘅嘢：**CLI image** 係 CI 今日會發佈嗰個，攞一個 config
資料夾同一個世界，render 完就收工；**hosted image** 係應用程式本身。呢一點值得講清楚，因為
`Dockerfile.hosted` 到目前為止**完全冇 CI job**，所以「每次 push 都建兩種架構」嗰句只係講緊
CLI 嗰個。

**點知一個 image 係邊個 commit 嚟嘅。** 兩個 Dockerfile 都帶住標準嘅 OCI 版本 label，所以
`docker inspect` 同每個 registry 介面都已經識去邊度搵：

```
docker inspect <image> --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
```

CI 傳 `github.sha` 做 `WORLDLENS_SOURCE_COMMIT` build 參數，唔會喺 build 入面行 `git` ——
嗰度個 checkout 係 build context 抄咗入去嘅嘢，唔係一個 repository。

**一個冇傳過嗰個參數嘅 image，讀返係空白，唔會聲稱一個佢冇嘅版本。** 個 `ARG` 故意預設做
`""`：一個似模似樣嘅預設值，會令一個冇蓋章嘅 image 同一個蓋咗章嘅分唔出，而嗰個混淆正正就係
呢個 label 要消除嘅嘢。

淨係得一個 build 時間解決唔到呢件事：兩個唔同 commit 嘅 build 可以共用同一個 committer
date，所以時間講嘅係「幾時」，只有 commit 先講到「邊份」。

行緊嘅容器啟動時亦會印同一個值，就喺密碼嗰行隔籬，因為一個望住容器嘅操作員唔可能去 pull 個
image 再讀啲 label。當 build 確立唔到 commit 嗰陣，佢會印 `commit unknown`，唔會印一行空白。

**驗證**：個版本 label 係喺一部真嘅 daemon 上面證過，唔係靠斷言 —— 照住呢份文件描述嘅
`ARG`／`LABEL` 幾行建出嚟再 inspect，讀返個 commit 一模一樣；而唔傳參數嗰個反面個案讀返係
空白。呢個證明咗參數到 label 嘅接線，唔係一次完整 image 建置，亦冇聲稱係。
