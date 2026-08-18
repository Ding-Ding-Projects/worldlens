---
name: run-worldlens
description: Build, launch, screenshot and drive the Worldlens desktop app on a hidden Windows desktop. Use when asked to run, start, open, test or screenshot Worldlens, to click through its interface, or to confirm a change actually works in the running app rather than only in its tests.
---

# Run Worldlens

Worldlens is an Electron desktop app (Material Design 3 shell, Vue renderer) plus a headless
CLI, in a pnpm workspace under `design/`.

**Everything here runs on an off-screen Win32 desktop through the cheap Lowlevel MCP headless
route.** The app window never appears on the user's visible desktop, never steals focus and
never touches the real Worldlens profile. Two handles reach the running app:

- **DOM** — `driver.mjs` attaches over the Chrome DevTools protocol and gives you Playwright
  locators: click, read, evaluate, screenshot. This is the one you want.
- **Pixels** — Lowlevel `screenshot(hwnd=…)` captures the window directly, including native
  dialogs the renderer cannot see (an Electron crash box, for instance).

Do **not** use `pnpm --filter @worldlens/app start` or Playwright's `_electron.launch()`. Both
put a real window on the user's visible desktop.

Paths below are relative to the repository root.

## Prerequisites

Already satisfied on this machine; re-run only on a cold checkout.

```bash
node scripts/bootstrap.mjs --check
```

The Electron binary is the usual cold-checkout casualty — `node_modules/electron/dist/electron.exe`
can be missing even when the package installed. Repair it without a reinstall:

```bash
node scripts/ensure-electron-binary.mjs
```

## Build

The driver launches the app from source output, so `design/packages/app/dist` and
`design/packages/ui/dist` must exist and be current. The renderer is built by **`packages/ui`**,
not `packages/app` — an app-only rebuild leaves you driving the previous interface.

```bash
cd design && pnpm build
```

## Run (agent path)

**Step 1 — launch on the hidden desktop.** Call Lowlevel MCP `launch_on_headless_desktop`:

- `name`: `WorldlensDriver`
- `command`: `<launcher> 9333 C:\Users\<you>\AppData\Local\Temp\worldlens-headless-1 <repo>`

The arguments are the debugging port, a **throwaway profile directory**, and the checkout.
Use a fresh profile dir per session; the app then starts at genuine first run.

The launcher is `<repo>\.claude\skills\run-worldlens\launch-headless.cmd` in the checkout, or
`%USERPROFILE%\.claude\skills\run-worldlens\launch-headless.cmd` if you are running the
installed catalog copy. The installed copy cannot infer where the checkout is, which is what
the third argument is for; `WORLDLENS_REPO` does the same job for both the launcher and the
driver, and the driver otherwise walks up from the current directory.

Wait a few seconds, then confirm exactly one debuggable target — this is the isolation proof,
not a formality:

```bash
curl -s --max-time 8 http://127.0.0.1:9333/json/list | head -c 200
```

**Step 2 — drive it.**

```bash
printf 'url\nbuttons\nss onboarding\nclick .v-overlay--active button:has-text("NEXT")\nss step-2\ndetach\n' | node .claude/skills/run-worldlens/driver.mjs
```

Commands are one per line on stdin; each answers with a single `ok …` / `err …` line, so a pipe
or `tmux send-keys` both work. Screenshots land in `.worldlens-driver/`.

| command | does |
|---|---|
| `url` | current renderer URL |
| `ss <name>` | screenshot → `.worldlens-driver/<name>.png` |
| `onboard` | clear the first-run dialog (declines the download consent) — run this first |
| `rail` | navigation rail labels — `["Home","Map","Work"]` |
| `nav <label>` | click a rail item by label |
| `buttons` | button labels in the open dialog, else the whole page |
| `text <selector>` / `count <selector>` / `click <selector>` | Playwright locator, first match |
| `eval <js>` | evaluate in the renderer, JSON-printed |
| `detach` | disconnect; the app keeps running |

**Step 3 — window-level capture,** when the renderer cannot see what you need. Lowlevel
`list_headless_windows` on `WorldlensDriver`, take the `Chrome_WidgetWin_1` entry with a
non-empty title and non-zero size, then `screenshot(hwnd=<handle>)`.

**Step 4 — stop.** Lowlevel `kill_process` on the app pid, then `close_headless_desktop`.

## Run (human path)

`cd design/packages/app && pnpm start` opens a window on the visible desktop. Useful for a
person sitting at the machine; never use it from an agent session.

## Test

```bash
cd design && pnpm test                 # vitest, whole workspace
cd design/packages/app && pnpm screenshots   # the project's own 89-capture matrix (visible desktop)
```

## Gotchas

- **`WORLDLENS_SCREENSHOTS=1` is what makes `--user-data-dir` work at all.** Without it the app
  pins storage to its production identity (`src/main/index.ts:172`) and silently opens the
  **user's real profile**. That is why `launch-headless.cmd` exists.
- **Setting that variable inline through `launch_on_headless_desktop` does not work.**
  `cmd.exe /c set WORLDLENS_SCREENSHOTS=1 && electron.exe …` starts the process with the
  variable unset — verified twice, once landing in the real profile. The tell is a first-run
  launch that shows **no onboarding dialog**, and a throwaway profile directory that stays
  empty. A populated profile dir (≈18 entries) means the seam took.
- **`""quoted""` paths inside a `cmd /c "…"` string break Electron**, which then reads its own
  `electron.exe` as an ES module: `ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".exe"`.
  It surfaces as a native `#32770` "Error" box on the hidden desktop — invisible unless you
  enumerate windows, and it leaves a stray process behind. Use the `.cmd` launcher.
- **A fresh profile opens on a modal 4-step first-run dialog, and the rail is behind it.**
  `nav Work` does not fail loudly — it sits there and times out after 30 s, reading as "the
  rail is broken" when the rail is fine. Run `onboard` first. It answers **DECLINE** to the
  Minecraft download consent on purpose: both answers are real, and an agent must not accept
  a licence for the user. Accept it yourself, deliberately, if a test needs the download path.
- **`--force-prefers-reduced-motion` is load-bearing.** Playwright waits for an element to be
  *stable* before clicking, and this interface animates page arrivals; without the flag clicks
  time out and the failure reads as "the screen is broken" when it is working perfectly.
- **The rail is not a Vuetify drawer.** Labels are `.wl-rail-label` and items `.wl-rail-item`;
  `.v-navigation-drawer .v-list-item-title` matches nothing and returns a confident `[]`.
- **`buttons` with no dialog open dumps the entire page**, because the app renders every
  collapsed section's buttons into the DOM. Scope your own selector when that matters.
- **Enumerate windows by class and title, never by index.** One launch lists 12–18 top-level
  windows: IME frames, UAC indicators, tooltip and power-message stubs, several zero-sized.
- **A `1.0.<run>` version and a green suite are not evidence a change is visible.** Photograph it.

## Troubleshooting

| symptom | cause / fix |
|---|---|
| `Cannot find module 'playwright'` | bare `playwright` is not installed; the driver resolves `@playwright/test`, which re-exports the browser API |
| `curl` to `/json/list` returns nothing | the launch failed; enumerate hidden windows and look for an `Error` dialog, then `kill_process` the stray |
| `expected exactly 1 page target, got N` | a second target got in — do not drive it; kill the process tree and relaunch |
| `nav <label>` times out after 30 s | the first-run dialog is still up; run `onboard` |
| driver attaches but the UI looks stale | `packages/ui` was not rebuilt; `cd design && pnpm build` |
| onboarding dialog missing on a fresh profile | the capture seam did not apply — you are driving the real profile; see the second gotcha |
