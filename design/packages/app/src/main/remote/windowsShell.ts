/**
 * Running PowerShell on a remote Windows host. Moved to @worldlens/dockhand.
 *
 * Left here as a forwarding module rather than deleted, so that the roughly forty files
 * importing it from this path did not all have to change in the same commit that moved
 * it. A move that also rewrites forty call sites is a move whose failures cannot be told
 * apart from its rewrites. Those imports can be repointed later, on their own.
 */
export {
    encodePowerShellCommand,
    powershellRemoteCommand,
    quoteForPowerShell,
} from "@worldlens/dockhand";
