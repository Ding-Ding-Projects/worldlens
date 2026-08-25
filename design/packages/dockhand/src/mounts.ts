import { stagingPathRefusal, type RemoteHostKind } from "./hostKind.js";

/**
 * A folder on the host machine, handed to a container.
 *
 * ## Why this is not just a string
 *
 * "Pick the folder this application should use" is the single most dangerous control a
 * deployment tool offers, and it is dangerous in a way that does not look dangerous. A free
 * text field accepting a host path is how a graphical tool produces `-v /:/host`, and the
 * person who typed it was not doing anything unreasonable - they were filling in a box.
 *
 * So this is deliberately not a validator bolted onto a text field. A host path only becomes
 * a mount by being **browsed to**, checked against the refusal list for that host's own
 * platform, and then confirmed with both the resolved host path and the container path it
 * will appear at written out. Each of those three is load-bearing:
 *
 *  - browsing means the path exists and the person saw where they were;
 *  - the refusal list is per-platform, because one written for the wrong one is not a weaker
 *    guard but an absent one;
 *  - naming both sides at confirmation is what stops "the app's main folder" quietly meaning
 *    something other than what was chosen.
 *
 * Named volumes remain available beside this and are safer for anything that does not need to
 * be a real folder somebody can open. This exists for the case where it does.
 */
export interface HostFolderMount {
    /** Absolute path on the machine running Docker. */
    readonly hostPath: string;
    /** Where it appears inside the container. Always POSIX: containers are Linux. */
    readonly containerPath: string;
    /** Whether the container may write to it. */
    readonly writable: boolean;
}

export type MountCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Container paths nothing may be mounted over.
 *
 * Mounting over these does not fail loudly - it produces a container that starts and then
 * behaves inexplicably, because the image's own files at that path have been replaced by
 * somebody's photographs.
 */
const REFUSED_CONTAINER_PATHS = Object.freeze([
    "/",
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/lib",
    "/lib64",
    "/proc",
    "/root",
    "/run",
    "/sbin",
    "/sys",
    "/usr",
    "/var",
]);

/** Whether this folder may be handed to a container, and why not when it may not. */
export function checkHostFolderMount(
    mount: HostFolderMount,
    hostKind: RemoteHostKind,
): MountCheck {
    const hostRefusal = stagingPathRefusal(hostKind, mount.hostPath);
    if (hostRefusal !== null) return { ok: false, reason: hostRefusal };

    const container = mount.containerPath.trim();
    if (container === "") return { ok: false, reason: "No container path was given." };
    if (container.includes("\0"))
        return { ok: false, reason: "That path contains a character a path cannot contain." };
    if (!container.startsWith("/"))
        return {
            ok: false,
            reason: `${container} is not an absolute path inside the container.`,
        };
    if (container.includes("\\"))
        return {
            ok: false,
            reason: `${container} uses backslashes, but a container's own paths are always POSIX.`,
        };
    // `..` in a mount destination is resolved by the daemon, so a path that looks confined
    // need not be.
    if (container.split("/").includes(".."))
        return { ok: false, reason: `${container} must not contain "..".` };

    const normalised = container.replace(/\/+$/, "") === "" ? "/" : container.replace(/\/+$/, "");
    for (const refused of REFUSED_CONTAINER_PATHS)
        if (normalised === refused)
            return {
                ok: false,
                reason: `Mounting over ${refused} would replace the image's own files there, and the container would start and then behave inexplicably.`,
            };

    return { ok: true };
}

/**
 * The `-v` arguments for a checked mount.
 *
 * Deliberately takes checked mounts only, and the check is not repeated here. Doing it in
 * both places would let one of them drift and leave the other looking like the guard while it
 * had stopped being one.
 */
export function bindMountArgs(mounts: readonly HostFolderMount[]): string[] {
    return mounts.flatMap((mount) => [
        "-v",
        `${mount.hostPath}:${mount.containerPath}${mount.writable ? "" : ":ro"}`,
    ]);
}

/**
 * What a person is shown before they confirm.
 *
 * Names both sides and the access, because the whole risk here is somebody agreeing to
 * something other than what they meant. "Use this folder" is not a confirmation; "/srv/data
 * on the server, appearing as /data inside the container, writable" is.
 */
export function describeMount(mount: HostFolderMount): string {
    return `${mount.hostPath} on the host, appearing as ${mount.containerPath} inside the container, ${mount.writable ? "writable" : "read-only"}`;
}
