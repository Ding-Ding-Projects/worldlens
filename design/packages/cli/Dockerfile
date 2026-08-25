# syntax=docker/dockerfile:1
#
# The standalone BlueMap server CLI, containerised.
#
# Build from the REPOSITORY ROOT (one level above `design/`), not from this
# directory — the build needs both the pnpm workspace (`design/`) and the
# vendored upstream webapp bundle (`vendor/BlueMap/common/webapp/dist`, the
# same MIT-licensed static bundle `bluemap-cli -g` itself would otherwise need
# to be told about at run time; see `packages/cli/scripts/copy-webapp.mjs`):
#
#   docker build -f design/packages/cli/Dockerfile -t worldlens-cli .
#
# Render a world:
#
#   docker run --rm \
#     -v "$PWD/my-config:/data/config" \
#     -v "$PWD/my-world:/data/world:ro" \
#     worldlens-cli -c /data/config -r
#
# Serve what was rendered:
#
#   docker run --rm -p 8100:8100 \
#     -v "$PWD/my-config:/data/config" \
#     worldlens-cli -c /data/config -w
#
# Both in one run (render once, then keep serving the result):
#
#   docker run --rm -p 8100:8100 \
#     -v "$PWD/my-config:/data/config" \
#     -v "$PWD/my-world:/data/world:ro" \
#     worldlens-cli -c /data/config -r -w
#
# `-c /data/config`'s `maps/*.conf` `world` setting has to point at whatever
# path the world is mounted at inside the container (`/data/world` above) —
# this image cannot know that path for you, the same way upstream's own jar
# cannot. See packages/cli/src/config.ts's doc comment for the one sharp edge
# worth knowing here: a relative `world`/`data`/`web` path in the config
# resolves against the CONTAINER's working directory (this image sets it to
# `/app`), not against the config folder — mount an absolute path, or run with
# `--workdir /data` and point the config at a folder there.

###############################################################################
# Stage 1 — install and build only what @worldlens/cli needs
###############################################################################
# `--platform=$BUILDPLATFORM` pins this stage to the builder's own architecture, however
# many target platforms the caller asked for. That is safe here for one specific, checked
# reason: nothing in the CLI's dependency graph is a native module. sql.js is WebAssembly,
# mysql2 and pg are pure JavaScript, and better-sqlite3 belongs to the desktop application
# and is excluded by the --filter below. So everything this stage produces is plain
# architecture-independent JavaScript, and building it once natively rather than a second
# time under emulation costs nothing in correctness and saves most of the wall-clock of a
# multi-architecture build.
#
# The runtime stage below deliberately does NOT carry this, because Node itself is a native
# binary and each target architecture needs its own. The assertion at the end of that stage
# is what keeps this optimisation honest: if a platform-conditional native dependency ever
# enters the graph, that assertion fails the build instead of publishing a broken image.
FROM --platform=$BUILDPLATFORM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# /repo/design is the pnpm workspace root; /repo/vendor is the upstream
# submodule copy-webapp.mjs reaches by walking up from its own script
# location — mirroring that exact relative layout is what lets the ordinary
# `pnpm run build` (no Docker-specific flags) find the webapp bundle here.
WORKDIR /repo

# The full workspace manifest set is copied (not just cli's own package.json)
# because pnpm needs every workspace member's package.json to resolve the
# --filter dependency graph and to honor the committed lockfile exactly —
# --frozen-lockfile refuses to run if the manifests and the lockfile disagree.
COPY design/package.json design/pnpm-lock.yaml design/pnpm-workspace.yaml design/tsconfig.base.json ./design/
COPY design/packages ./design/packages
COPY design/tools ./design/tools

# Only the CLI's own webapp source is needed, not the rest of the upstream
# webapp checkout (its own source, tests and 100+MB of its own node_modules) —
# copy-webapp.mjs only ever reads common/webapp/dist.
COPY vendor/BlueMap/common/webapp/dist ./vendor/BlueMap/common/webapp/dist

# --filter "@worldlens/cli..." installs the CLI and everything it
# actually depends on — never the Electron desktop app, the UI package, or
# their native/heavy build steps (electron's own binary download,
# better-sqlite3's native compile), which this standalone server CLI has
# nothing to do with. devDependencies (typescript itself) are needed here to
# actually run the build below; `pnpm deploy --prod` strips them back out of
# the final runtime copy further down, so this is not the last word on what
# ships. (Not split into a --prod pass followed by a dev pass: pnpm refuses to
# swap a --prod-installed node_modules for a fuller one non-interactively —
# "Aborted removal of modules directory due to no TTY" — so one install that
# already includes dev deps is the correct shape here, not a workaround.)
WORKDIR /repo/design
RUN pnpm install --frozen-lockfile --filter "@worldlens/cli..."

# Runs each dependency's own "build" script in dependency order (pnpm reads
# the workspace:* graph itself), then the CLI's own build, which — per its
# package.json — also runs scripts/copy-webapp.mjs, now able to find the real
# webapp bundle copied in above.
RUN pnpm --filter "@worldlens/cli..." run build

# `pnpm deploy` prunes the result down to exactly what @worldlens/cli
# needs at runtime: real (non-symlinked) copies of its own dist/ and of every
# workspace + external dependency it actually resolved, with devDependencies
# and every unrelated workspace package left out entirely. `--legacy`: pnpm
# v10's new default deploy strategy refuses outright unless the workspace
# opts in with `inject-workspace-packages=true`
# (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE) — this workspace has not, and does
# not need to just to satisfy this one build step, so the flag pnpm's own
# error message names is the direct fix, not a workaround.
RUN pnpm --filter @worldlens/cli deploy --prod --legacy /app

# The SQL drivers are optional at runtime, but they are direct optional
# dependencies of the CLI so `pnpm deploy --prod` carries them into the
# standalone image.  Fail the image build if the deployment ever drops one,
# or if the bundled BlueMap resource extension pack is absent from the engine
# package that the CLI actually runs from.
RUN test -f /app/node_modules/sql.js/package.json \
    && test -f /app/node_modules/mysql2/package.json \
    && test -f /app/node_modules/pg/package.json \
    && test -f /app/node_modules/@worldlens/engine/assets/resourceExtensions/pack.mcmeta \
    && test -d /app/node_modules/@worldlens/engine/assets/resourceExtensions/assets

# Load every optional adapter and execute a real sql.js WASM-backed query from
# the deployed tree.  Package metadata alone does not prove that Node can load
# the adapter or that sql.js can locate its WASM payload.
RUN cd /app && node --input-type=module -e "const mysql = await import('mysql2/promise'); const pg = await import('pg'); const sqlModule = await import('sql.js'); const initSqlJs = sqlModule.default ?? sqlModule; const SQL = await initSqlJs(); const db = new SQL.Database(); db.run('CREATE TABLE delivery_probe (value INTEGER); INSERT INTO delivery_probe VALUES (65);'); const rows = db.exec('SELECT value FROM delivery_probe'); if (rows[0]?.values[0]?.[0] !== 65) throw new Error('sql.js WASM probe returned the wrong value'); db.close(); void mysql; void pg;"

###############################################################################
# Stage 2 — a slim runtime image with nothing but the Node runtime and /app
###############################################################################
FROM node:22-slim AS runtime

# Never root — but not a freshly created user either. The official node:22-slim
# image already ships an unprivileged "node" user at uid/gid 1000 for exactly
# this purpose (verified: `useradd --uid 1000` here fails with "GID '1000'
# already exists", because it does). Reusing it is more correct than masking
# that fact with a different uid, not just less code.
WORKDIR /app
COPY --from=build --chown=node:node /app ./

# The default config/data folder this image expects to be bind-mounted onto;
# created (and owned by the unprivileged user) so a first run does not fail
# trying to create it under a read-only or unmounted /data.
RUN mkdir -p /data/config /data/world && chown -R node:node /data
VOLUME ["/data/config"]
# Mount the actual world read-only at whatever path the config's own
# maps/*.conf "world" setting names — see the top-of-file usage notes. This
# declared volume is the documented default, not an enforced restriction.
VOLUME ["/data/world"]

USER node
WORKDIR /data
EXPOSE 8100

# The one assertion that only the target architecture can make.
#
# Every other check in this file runs in the build stage, which is pinned to the builder's
# architecture — so none of them can tell you whether the *target* image works. buildx runs
# this line once per requested platform, on that platform's own Node, against the payload
# actually copied into that image. It is what turns "the arm64 image is broken" from
# something a person discovers after pulling it into a build failure here.
#
# It runs the same interpreter and the same entry script the ENTRYPOINT below names, with
# the same arguments as the default CMD. RUN does not go through ENTRYPOINT, so this is a
# deliberate restatement of that command rather than an invocation of it; the two are kept
# in step by being three lines apart.
RUN ["node", "/app/dist/index.js", "--help"]

ENTRYPOINT ["node", "/app/dist/index.js"]
# No arguments by default: matches upstream's own "no actions -> write
# default configs, print help, exit 1" behaviour (see cli.ts) rather than
# guessing what the caller wants. A real run always passes at least -c.
CMD ["--help"]

