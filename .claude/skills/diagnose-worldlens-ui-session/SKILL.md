---
name: diagnose-worldlens-ui-session
description: Diagnose Worldlens desktop smoke-session startup, renderer isolation, and capture receipt problems using the packaged application on an off-screen desktop. Use before recording a new UI smoke run or after an attachment failure.
---

# Diagnose a Worldlens UI session

Use the repository's existing `run-worldlens` launch and driver workflow. Keep the visible desktop untouched and use a new disposable profile. A source preview cannot establish packaged behavior.

1. Record the executable and `resources/app.asar` hashes, source receipt when available, and the intended test scope. A package whose source provenance is unavailable may discover a problem, but cannot prove that the current source fixes it.
2. Launch through the installed cheap Lowlevel headless route with `--worldlens-direct-launch`, an explicit disposable `--user-data-dir`, a unique debugging port, and reduced motion. Save the returned PID and desktop name in private scratch storage.
3. Enumerate windows on that exact desktop. Resolve the nonempty `Worldlens` window with class `Chrome_WidgetWin_1`, nonzero dimensions, and the recorded process identity. Never select a tooltip or input-method helper by list position.
4. Capture that HWND and inspect the image before input. A successful capture call alone does not prove the image is correct.
5. Use the driver's complete DevTools target inventory check before attachment. It must contain exactly one target, of page type. Keep its exact URL in memory for equality checks only.
6. Worldlens serves its packaged renderer over an ephemeral loopback HTTP port. Expecting a `file:` URL incorrectly rejects a valid session. Its query contains temporary access material. Never print or persist it. The driver's `safe-url.mjs` removes user information, the entire query, and the fragment from diagnostic output and receipts.
7. Drive visible controls, capture each meaningful transition, and verify outcomes independently. Do not use injected renderer state or direct IPC calls as evidence of UI behavior.
8. Close only the recorded process tree and desktop after revalidating their identities. Keep receipts honest about source provenance, UI interaction, and missing coverage.

## Direct cheap transport and display scale

Set `LOWLEVEL_CHEAP_CLI` to the resolved installed cheap executable and use
`WORLDLENS_UI_ONLY=1` with the current `WORLDLENS_DRIVER_HWND`. The driver calls
the cheap CLI directly with structured arguments, an explicit background HWND,
no shell and no visible-screen fallback. No compatibility server is necessary.

The renderer reports CSS coordinates, while native background clicks require physical
client pixels. Multiply the measured bounding-box center by the renderer's current
`devicePixelRatio`. On the verified 150% session, 1280 x 800 CSS pixels occupied a
1920 x 1200 client surface. The unscaled Map click hit Home; the scaled click selected Map.
Do not infer navigation from a successful native command. Verify the resulting visible
state. Field input must preserve case and match the requested value after delivery.

Run `node --test scripts/worldlens-driver-privacy.test.mjs` after changing URL diagnostics or attachment logic. Keep disclosure tests paired with the exact output bindings; testing an unused sanitizer is insufficient.

## Verified observations

On 2026-09-04, the cheap CLI launched the packaged executable on an off-screen desktop and `screenshot --hwnd` returned a rendered 1920 x 1200 frame. The session's true renderer was loopback HTTP, not a file URL. The original driver exposed the authenticated URL in its attachment message and privacy receipt. The repaired outputs omit authentication material. Current-source UI acceptance remains a separate run after packaging.
