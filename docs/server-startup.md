# Local server startup

Local server commands retain one process transport for each saved server throughout the desktop session. Status, console, repeated Start and graceful Stop use that same process. Editing display metadata does not replace it; stop an active server before forgetting its record.

Start waits for the operating system spawn result and observes the first 500 milliseconds for an early exit. Missing executables or unavailable working directories return an actionable error instead of an unhandled process event. A successful spawn means a process was launched, not that Minecraft finished loading. Check console output and server readiness before connecting. The transport keeps up to 100 recent lines, each capped at 4096 characters, so opening the console after launch retains early diagnostics.

While the list is mounted, running servers receive non-overlapping status refreshes every two seconds; a later exit appears with its exit code. Unmounting stops further refreshes. Single and bulk lifecycle failures appear in a dismissible alert without replacing the server list. No existing server EULA, Java installation or server configuration is changed by this repair.

## Verification

Focused regressions cover independent IPC calls, concurrent starts, metadata edits, active-record retention, asynchronous spawn errors and visible start errors. Real Java startup, protocol readiness and graceful shutdown still require runtime acceptance against an explicitly selected server.

## Retired bundled runtime recovery

A missing Java path under the current user's Worldlens versioned installation is rediscovered from the current bundled or provisioned managed runtime, with its Java requirement checked. Custom executable paths are preserved. The saved server archive, loader arguments and memory setting stay unchanged. A missing server archive or occupied port remains an actionable startup failure; this repair never downloads a replacement server, accepts its EULA or changes its port.
