# Adoption ownership

## Behaviour

The candidate browser discovers containers on one selected host. Each completed candidate list belongs to the host that produced it. Changing hosts, closing the browser or starting another discovery invalidates older results. A stale result cannot be selected under a newer host identity.

The review begins with configuration, lifecycle, plugin and console permissions off. Reopening it or changing its record, container or host resets those choices and clears RCON input. A synchronous operation lock prevents duplicate adoption requests and mutually excludes adoption and release. Release is available only for an existing adopted record. Pending controls are disabled, and the handler independently checks the lock.

Each operation captures its review identity before awaiting the backend. A late response cannot close a newer review, expose an older failure there or substitute its record for the submitted candidate. The backend mutation may still finish after a parent closes the review; closing is not cancellation or rollback.

## Configuration

Select the local Docker host or a saved SSH host profile in the browser. Review the exact candidate, evidence, mounts, ports and blockers before enabling individual permissions. Optional RCON requires both port and password plus console permission. The existing credential-vault and backend validation boundaries remain in effect.

## Failure modes

Failed discovery remains distinct from a successful empty list. A rejected host-profile request ends its loading state and shows a bounded message while local discovery remains available. Profile, discovery and probe completions are generation-scoped. Rejected adoption/release requests release the operation lock and display a generic message only in their owning review. Old responses are ignored by newer views.

## Security considerations

Permissions are never inherited between candidates. Neither a disabled button alone nor a mutable selected-host value authorizes a backend operation. Requests capture exact identities and copied permissions; backend re-discovery, fingerprint and write-scope checks remain necessary. Component tests use synthetic records and contain no real credential or live container mutation. Transport exception details are not rendered by these rejection handlers.

## Verification

Fourteen mounted component cases exercise ownership and rejection boundaries. The original three regressions reproduced against the baseline; four additional release/profile cases failed against `cf443dec757194f4447c95661e335d693ac3542a`, then passed with the repair. The existing candidate-browser contracts are checked separately. These results prove renderer behaviour with controlled stores, not a functioning live Docker or SSH server. Exact root build, native interaction, current captures and isolated-container adoption acceptance for this increment remain pending.

Production registration omits the optional test runner. Local discovery/confirmation now defaults to the existing bounded execFile command runner, matching the local container transport. An explicit injected runner still takes precedence; SSH requests retain their own profile transport. Three production-shaped registration cases cover successful empty discovery, real command failure reported as unreachable, and injected-runner precedence. Together with14 ownership and7 browser cases,24 focused checks pass. The earlier rebuilt26081239 browser exposed the missing default before any daemon command; its genuine capture is retained as pre-repair evidence. The saved-record release check additionally requires a matching adopted record in the store, because fresh previews already use the adopted origin marker.

Bounded rebuilt verification atdb18561c694015c0be4de15a9867eb4c5d562eab: build.bat /s passes with source digest146294ec3f2f140aa865f0a455c348456988468a0ab15f1a76f6d485da84e43a. Actual local discovery reaches the unavailable daemon. English/dark browser geometry at1280x752 and800x600 CSS, CDP scale2, passes two validated version1 receipts and independent pixel review. The minimum dialog top is64px below a40px caption, footer actions remain within the viewport and the full failure detail is reachable by scrolling. The original promoted capture is in README and both evidence inventories. Four recorded process identities, listener and named desktop are absent after normal close. Real candidate adoption, review-dialog rendering, other languages/themes/scales and physical DPI remain pending.
