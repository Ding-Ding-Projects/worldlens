# Built-app UI smoke and capture matrix

This directory owns the hand-written Windows desktop smoke contract for the requested WorldLens flows. It is tooling evidence, not a replacement for the product UI. The final driver must use the real built artifact through the approved hidden Lowlevel CDP route.

## What the matrix records

Every row names the exact screen and state, theme, viewport, display scale, precondition, selector or keyboard action, expected dialog or window identity, focus owner, capture path, and issue linkage. Rows marked `opensNewSurface: true` require a screenshot immediately after the action. A render, popup, native picker, dialog, route transition, or tab transition cannot be counted as tested from a later capture.

The matrix includes:

- server list, host profile, server adoption, server detail, and the Back route;
- the full new-server wizard, including grouped version families, exact versions, Java provisioning, resources, custom world browsing, and review;
- Java progress, cancellation, retry, direct world-folder browsing, and mounted installations;
- project create, open, local import, and remote import;
- the render split arrow plus local, Docker, SSH, and GitHub Actions destinations;
- Pages disabled, enabling, published, and failed-retry states;
- finished and failed render result selection;
- core appearance editing, Creative studio, command palette result-row controls, runtime settings, file conversion, Ollama, and documentation routes.

## Dry validation before integration

The tooling lane does not run the final app smoke while integration is incomplete. Validate the hand-written contract and deliberate negative paths with:

```powershell
node scripts/ui-smoke-matrix.mjs --plan-only
node --test scripts/ui-smoke-matrix.test.mjs
```

The validator must fail when a required route, row field, expected surface identity, immediate capture mapping, issue linkage, or duplicate row is removed. A capture manifest is not considered valid until it contains a full SHA, one CDP page target, a dynamic HWND, focus owner, timestamp, and a matching image hash for every new surface.

## Final built-artifact command

After the integrated candidate has a verified package, run the driver on a fresh profile and named hidden desktop. The driver must refuse to continue if the target list is not exactly one page, if the HWND is stale, if a visible desktop route is selected, if an unexpected modal appears, or if the renderer console reports an exception:

```powershell
node scripts/ui-smoke-driver.mjs --built-artifact <path-to-Worldlens.exe> --profile <fresh-profile> --desktop <named-desktop> --matrix docs/ui-smoke/smoke-matrix.json --manifest docs/ui-smoke/capture-manifest.json
node scripts/ui-smoke-matrix.mjs --validate-manifest
node scripts/screenshot-dates.mjs
node scripts/check-screenshot-evidence.mjs
```

The driver uses physical or background input through the hidden desktop. It may use a documented app test profile or real fixture data, but it must not inject fake product DOM. Long actions must expose progress and cancellation, and the driver stops on a failure instead of writing a green report.

## Evidence handoff

The generated `capture-manifest.json` stays machine-readable and is checked against the same matrix commit. Each issue-specific visible defect receives its own before and after mapping. A capture can be promoted into the repository's normal screenshot inventory only after it was read back, hashed, dated, and independently reviewed. No fake or placeholder image is acceptable.
