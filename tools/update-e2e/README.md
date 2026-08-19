# Installed update E2E contract

This directory defines the evidence contract for issue #79. It is deliberately separate from
the updater unit tests: those tests inject Electron, Squirrel, the feed, the filesystem, and the
clock, while this contract is for two consecutive immutable Squirrel.Windows releases installed
on a clean Windows profile.

The contract is a checklist and a receipt schema, not a claim that the run happened. A report must
keep `status: "unrun"` until the real installed-client flow has produced every required evidence
record. Do not replace a missing record with a unit-test link, a mocked banner, or a statement that
Squirrel should have done the same thing.

## Required run

1. Resolve two consecutive immutable releases from known source SHAs. Read back `Setup.exe`,
   `RELEASES`, the full `.nupkg`, package hashes, tags, and the feed version from the releases
   themselves; do not infer them from a workflow log.
2. Install release N into an isolated Windows profile and record the installed executable,
   package version, data directory, and profile identity.
3. Start the installed client, let its real HTTPS Squirrel feed discover release N+1, and record
   the available, downloading, and ready states. Exercise **Later** and confirm the same staged
   version is still available after a relaunch.
4. Create unsaved configuration/project work and an active render. Confirm every restart attempt
   is refused while either guard is active, then save or explicitly discard through the product
   flow before continuing.
5. Press **Restart to install** once. Before the process exits, preserve the exact receipt bytes
   and the request timestamp. After launch, read the receipt outcome from the new process and
   record the renderer acknowledgement that permits receipt consumption.
6. Verify release N+1 is the version actually running; settings, projects, local history, cache,
   focus return, feed handoff, and the ability to discover a later update remain intact.
7. Exercise offline/backoff, corrupt asset, feed mismatch, rollback, and any supported cancel
   path. If the installed updater has no supported user-download cancellation API, record that
   case as `unverified` rather than simulating it.

The run must be headless and isolated. It must not modify a user's normal profile, rely on a
developer checkout, or claim success from source previews. Capture evidence from the installed
artifact through the approved cheap headless route; no capture is created by this documentation
change.

## Report shape

`contract.json` is the machine-readable source of truth for the required evidence identifiers and
honesty rules. A future runner should emit one JSON report containing:

```json
{
  "schema": 1,
  "status": "verified",
  "sourceCommit": "<full SHA>",
  "releaseN": { "tag": "<tag>", "sha": "<full SHA>", "immutable": true },
  "releaseNPlusOne": { "tag": "<tag>", "sha": "<full SHA>", "immutable": true },
  "evidence": {
    "installed-version-before": { "version": "<version>", "path": "<path>" },
    "receipt-reconciliation": { "status": "installed", "fromVersion": "<version>", "targetVersion": "<version>" }
  },
  "unverified": ["cancelled-download"]
}
```

`status: "verified"` is valid only when both release records are immutable, every identifier in
`contract.json` has an evidence record, and each record names the exact build or installed process
that produced it. A report may be `failed` or `unrun`; neither is a release-quality proof.

Once a real report exists, validate its shape with:

```text
node tools/update-e2e/verify.mjs <evidence-report.json>
```

This validator reads evidence only. It does not install, launch, download, restart, or capture the
application, and it must not be used as a substitute for the real installed-client run.
