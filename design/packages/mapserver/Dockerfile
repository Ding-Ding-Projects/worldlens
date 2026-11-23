# syntax=docker/dockerfile:1
#
# The map server image: one static Go binary on an empty root filesystem.
#
# Why Go on scratch rather than nginx or node-alpine: the server has to do exactly three
# things (serve files, answer /health, check an access code) plus unpack one tar into a
# volume. A static binary does all four in about 5 MB with no shell, no package manager
# and nothing for a scanner to flag, and the image is small enough to ship inside the
# desktop app as a bundled tar for each architecture.
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS build
ARG TARGETOS=linux
ARG TARGETARCH
ARG MAPSERVER_VERSION=dev
WORKDIR /src
COPY go.mod go.sum ./
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -X main.version=${MAPSERVER_VERSION}" -o /out/mapserver .

FROM scratch
ARG MAPSERVER_VERSION=dev
LABEL org.opencontainers.image.title="worldlens-map-server" \
      org.opencontainers.image.description="Serves a rendered map as static files with a health endpoint and an optional access code." \
      org.opencontainers.image.version="${MAPSERVER_VERSION}" \
      org.opencontainers.image.source="https://github.com/Ding-Ding-Projects/worldlens"
COPY --from=build /out/mapserver /mapserver
# The volume is mounted read-only at /data: worldlens-map.json (settings) and map/ (files). It runs as an
# unprivileged user; only the one-off `--extract-tar` run that fills the volume is root.
USER 65532:65532
EXPOSE 8080
# Exec form, because an empty image has no shell for `--health-cmd` to hand a string to.
HEALTHCHECK --interval=5s --timeout=3s --start-period=2s --retries=3 CMD ["/mapserver", "--healthcheck"]
ENTRYPOINT ["/mapserver"]
