#!/usr/bin/env bash
# Linux equivalent of .claude/skills/run-worldlens/launch-headless.cmd: the packaged Linux
# build (electron-builder --dir --linux; the Squirrel package exists only for Windows) under a
# virtual X display, with the same switches, a throwaway profile and an owned capture home.
set -euo pipefail
# Usage: scripts/launch-worldlens-linux.sh <cdp-port> <fresh-profile-dir> <log-file>
# Requires design/packages/app/release/linux-unpacked (electron-builder --dir --linux) and xvfb-run.
PORT="${1:-9333}"; PROFILE="${2:?profile dir}"; LOG="${3:?log file}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$REPO/design/packages/app"
export WORLDLENS_SCREENSHOT_HOME="${WORLDLENS_SCREENSHOT_HOME:-${TMPDIR:-/tmp}/worldlens-capture-home}"
export WORLDLENS_SCREENSHOT_STORAGE="${WORLDLENS_SCREENSHOT_STORAGE:-$WORLDLENS_SCREENSHOT_HOME/maps}"
mkdir -p "$WORLDLENS_SCREENSHOT_STORAGE"
export ELECTRON_DISABLE_SECURITY_WARNINGS=1
export NODE_OPTIONS="${NODE_OPTIONS//--use-openssl-ca/}"
PACKAGED="$APP/release/linux-unpacked/@worldlensapp"
if [ -z "$PACKAGED" ] || [ ! -f "$APP/release/linux-unpacked/resources/app.asar" ]; then
  echo "[launch] no packaged Linux Worldlens under $APP/release/linux-unpacked; refusing a source launch" >&2; exit 1
fi
export WORLDLENS_LAUNCH_ROUTE="Playwright CDP attached to the exact packaged Worldlens (electron-builder linux-unpacked directory built from this commit) launched under Xvfb on a Linux container with the committed launcher's switches; not the Windows Squirrel package and not a Lowlevel hidden desktop"
cd "$APP"
exec xvfb-run -a -s "-screen 0 1920x1080x24" "$PACKAGED" \
  --no-sandbox --disable-gpu --force-prefers-reduced-motion \
  --remote-debugging-port="$PORT" --worldlens-direct-launch "--user-data-dir=$PROFILE" \
  > "$LOG" 2>&1
