# syntax=docker/dockerfile:1
#
# The live 3D viewer: a mineflayer bot plus Prismarine Viewer or Prismarine Web Client.
#
# Build from the REPOSITORY ROOT (one level above `design/`):
#
#   docker build -f design/packages/liveviewer/Dockerfile -t worldlens-live-viewer .
#
# Run (the application normally does this for you, with a labelled volume):
#
#   docker run --rm --read-only -p 3007:3007 \
#     -v lv-config:/config:ro -v lv-secrets:/secrets \
#     worldlens-live-viewer
#
# /config/config.json is the non-secret configuration. /secrets/auth.json exists only
# for a Microsoft sign-in and is read with the owner's permissions. Neither is ever
# passed through an environment variable or a command argument.

###############################################################################
# Stage 1 - build the TypeScript package and prune it to its runtime tree
###############################################################################
# Everything in this dependency graph is plain JavaScript, so one build on the builder's
# own architecture serves every target platform (the same reasoning as the CLI image).
FROM --platform=$BUILDPLATFORM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

COPY design/package.json design/pnpm-lock.yaml design/pnpm-workspace.yaml design/tsconfig.base.json ./design/
COPY design/packages ./design/packages
COPY design/tools ./design/tools

WORKDIR /repo/design
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@worldlens/liveviewer..."
RUN pnpm --filter "@worldlens/liveviewer..." run build
RUN pnpm --filter @worldlens/liveviewer deploy --prod --legacy /app

# Prove the pieces the container cannot start without are really in the tree.
RUN test -f /app/dist/bin.js \
    && test -f /app/node_modules/prismarine-viewer/public/index.html \
    && test -f /app/node_modules/mineflayer/package.json

# Load the server modules for real, so a missing runtime module fails the build here
# rather than at first start (the viewer library's index needs a `canvas` package that no
# install provides, which is why view.ts requires only its world view).
RUN cd /app && node --input-type=module -e "await import('./dist/view.js'); await import('./dist/bot.js'); await import('./dist/webClient.js');"

###############################################################################
# Stage 2 - Prismarine Web Client, installed beside (not inside) the workspace
###############################################################################
# The published 1.6.0 package ships its bundle prebuilt. One of its dependencies is a
# GitHub repository, so this stage needs git; the runtime stage does not. Scripts are
# skipped on purpose: its postinstall only patches build-time packages for webpack.
FROM node:22-slim AS web-client
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/web-client
RUN npm install --prefix /opt/web-client --omit=dev --ignore-scripts --no-audit --no-fund prismarine-web-client@1.6.0
RUN test -f /opt/web-client/node_modules/prismarine-web-client/public/index.html \
    && test -d /opt/web-client/node_modules/net-browserify

###############################################################################
# Stage 3 - slim runtime
###############################################################################
FROM node:22-slim AS runtime

WORKDIR /app
COPY --from=build --chown=node:node /app ./
COPY --from=web-client --chown=node:node /opt/web-client /opt/web-client

# Never root: the base image already ships an unprivileged "node" user (uid 1000).
RUN mkdir -p /config /secrets && chown node:node /config /secrets
VOLUME ["/config", "/secrets"]
USER node
EXPOSE 3007

ARG WORLDLENS_SOURCE_COMMIT=""
LABEL org.opencontainers.image.revision="$WORLDLENS_SOURCE_COMMIT"
LABEL org.opencontainers.image.source="https://github.com/Ding-Ding-Projects/worldlens"

# The health route answers 200 while the bot is connecting, connected or reconnecting and
# 503 once it has given up, so an orchestrator sees a bot that has failed.
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3007/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["node", "/app/dist/bin.js"]
