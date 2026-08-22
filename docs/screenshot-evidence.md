# Screenshot evidence refresh — issue #160

This record describes the 2026-08-22 refresh attempt on `lane/issue160-captures`, based on
`origin/main` at `a90f588f7c13b93cc43d83acedd116e724a0471d`.

## Staleness before the attempt

`cd design && npm run screenshots:check` ran all 12 unit checks successfully, then failed its
intentional stale-evidence check. Three graded groups were stale:

| Group | Targets | Recorded digest | Current digest |
| --- | ---: | --- | --- |
| `app-playwright-manifest` | 117 | `5ca1cbfd8036f93c9b69bca219edc27a01c111a815c5dfa5293180572187b02e` | `083aa9791081e59043e90426435ed8b82b88f1388b23b10c6214460c659411fe` |
| `app-playwright-map-dependent` | 15 | `5ca1cbfd8036f93c9b69bca219edc27a01c111a815c5dfa5293180572187b02e` | `083aa9791081e59043e90426435ed8b82b88f1388b23b10c6214460c659411fe` |
| `lowlevel-ui-e2e` | 18 | `10e21e51523d90099f5d8f57761aa17510016d08ee2221a930edfd0492374c` | `083aa9791081e59043e90426435ed8b82b88f1388b23b10c6214460c659411fe` |

The inventory contains 229 targets across 14 groups. Other groups are not graded against the UI
source digest; their own reproducibility or external-state boundaries remain authoritative.

## Regeneration attempt and exact blockers

The real application was built with `pnpm build`, packaged with
`pnpm --filter @worldlens/app package`, and launched on a named hidden desktop through the Cheap
Lowlevel route with one CDP page target. The Playwright harness was invoked with the exact
candidate commit and CDP port.

No committed image was replaced. The run captured early no-map surfaces but could not complete the
manifest: it stopped in the map/profile-manager portion because `WORLDLENS_CAPTURE_MAP` was not
set. The harness correctly reported that map/menu/profile states require a rendered local map and
did not promote the partial output as evidence. The map-dependent group therefore remains stale.

`lowlevel-ui-e2e` was not recaptured because the required persistent Lowlevel MCP binding was
unavailable (`WinError 10061`); the installed one-shot direct CLI could launch and enumerate a
desktop but cannot provide the project's persistent driver lifecycle. No substitute visible UI,
ordinary computer-use route, mock, or hand-edited image was used.

The external groups remain intentionally untouched: `live-pages` needs the authorized published
proof sites, and `consent-render` needs current-user consent plus real runtime data. Historical
groups require their recorded source commits and were not regenerated from the current tree.

## Staleness after the attempt

Because no complete capture set was produced, the evidence inventory digests were not changed.
The expected post-attempt result is therefore unchanged: 3 stale graded groups and 0 committed
groups recaptured. Run `cd design && npm run screenshots:check` again after a complete map-backed and
persistent-Lowlevel capture to obtain the next exact verdict.
