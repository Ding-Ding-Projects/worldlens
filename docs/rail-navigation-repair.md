# Rail navigation repair, 2026-10-02

This is a focused repair of the current `design/packages/ui` rail, based on
`abec229c799cd7a0e02835fd6ebbed1b1009c75b`. It relates to issues #184 and #185.
It is not the unpublished 43-file batch described in #185, and it does not claim
that every open Worldlens issue has been fixed.

## Changes

The shortcut group now remains mounted when every shortcut is in More. Previously,
its parent condition required at least one directly visible shortcut, deleting
More at exactly the height where it was needed most.

The ordinary rail remains 80 CSS pixels wide. At an actual available rail height
of 520 CSS pixels or less, a 192-pixel grid keeps the four labelled destinations
above a utility row containing More and the three footer actions. At extreme
heights the destination area can scroll independently. Targets remain at least
44 pixels in the verified fixtures. The detached world-host overlay follows the
same width; map-only and child-mode shells do not gain an unconditional inset.

Destination labels wrap instead of being line-clamped. Sizing observes destination,
footer and shortcut content changes, reserves bottom padding, and increases its
row estimate when real translated or customized text is taller. This estimate
never shrinks merely because the tall row has moved into More, preventing a
show/hide measurement loop. Non-finite geometry retains an explicit More route.

Every transition of the menu's open state clears the filter when closing. Focus
returns after teardown only when it still belongs to the disclosure flow. An
outside click or a newly opened job's deliberate focus is respected. A resize
which removes More closes its menu and allows focus to return to the active
primary destination. The overlay still uses `target`, not a second click activator.

The More panel is bounded by the dynamic viewport, its content can scroll, and
unbroken translated labels wrap rather than widening the panel off screen.

## Reproduce the focused checks

From the repository root, with Node 22.13 or newer:

```sh
node --experimental-strip-types --test scripts/rail-layout.test.mjs
node --experimental-strip-types scripts/rail-layout-proof.mjs --report rail-proof.json
```

The browser check needs an installed Chromium-compatible browser. Set
`CHROMIUM_PATH` to its executable when it is not in a standard Linux location.
It uses a fresh temporary profile and blocks network/file page requests. It does
not connect to an existing browser, production application, user profile or server.

To compare an earlier checkout with the same fixture:

```sh
node --experimental-strip-types scripts/rail-layout-proof.mjs --source-root /path/to/baseline --report baseline-rail-proof.json
```

## Verification completed here

The source-level runner passes **22 of 22 checks**. The baseline failed 12 of those
checks. These include real overflow arithmetic and explicit template/wiring guards;
they are not a substitute for mounting Vue and Vuetify together.

The isolated browser fixture passes **96 of 96 geometry cases** and **5 of 5 focus
cases**. It uses the actual component CSS, measurement function, overflow function
and focus helper with explicit small DOM fixtures. The report records their Git
blob hashes. The matrix covers six CSS viewport sizes from 400x320 to 1280x800,
including 800x320 and 640x240, English, Cantonese, bilingual and extended labels,
left-to-right and right-to-left layouts, and device scale factors 1 and 2.

A device scale factor is not a Windows DPI or browser-zoom test. These fixtures
are explicitly labelled as isolated source-CSS evidence, not application captures.
No screenshot inventory or source digest was refreshed to disguise stale captures.

## Still required before claiming full application verification

Run the workspace build, typecheck, lint and existing Vue/Vuetify tests in a complete
checkout with its dependencies. Exercise the installed Windows application at
100%, 125%, 150% and 200% scaling, including native More clicks, Escape, outside
clicks, job activation, settings, notifications and detached world-host alignment.
Repeat with long localized labels and a 320-pixel-high window.

Unrelated render validation, conversion, IPC, polling and screenshot-harness items
from the existing issue inventory remain outside this focused change. Issues #184
and #185 are not automatically closed by this repair.

The existing CI workflow builds/packages but does not run the focused tests above.
On a branch push it can publish version/SHA-tagged CLI images. Only a push to `main`
can move `latest`, and release publication is separately restricted to `main`.
This repair does not alter that policy, skip checks, merge a branch or publish a
release manually.
