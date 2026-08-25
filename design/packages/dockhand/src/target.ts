/**
 * A machine this deployment can reach, and nothing about what it is for.
 *
 * ## Why this is split out rather than moved whole
 *
 * The application's own `remote/target.ts` does two jobs. Most of it is this: a description
 * of an SSH destination, which is the same whatever is being deployed onto it. The rest is
 * validation that answers in the vocabulary of a *render* - its failures carry a
 * `RenderFailureCode` and a settings-screen target, because the surfaces that show them are
 * render surfaces.
 *
 * Only the first half is genuinely shared. Moving the second half here would drag a render's
 * failure vocabulary into a package whose whole point is not to know what it is deploying,
 * and every consumer would then be handed failure codes about renders it has nothing to do
 * with. So the description lives here, the render-flavoured validation stays where its
 * vocabulary already is, and each caller builds the validation its own surfaces can speak.
 */
export interface SshTarget {
    /** Stable id, used in messages and as a settings key. */
    readonly id: string;
    /** What to call it on screen. Never used to build a command. */
    readonly label: string;
    readonly host: string;
    readonly port: number;
    readonly user: string;
    /**
     * Absolute path to the **private** key to offer, or null to use the agent.
     *
     * A path, never contents. Nothing here reads the file, and nothing here will create one.
     */
    readonly identityFile: string | null;
    /** Where on the remote host this deployment stages its files. Absolute and POSIX. */
    readonly workDir: string;
    /** The remote `docker` binary. A field so a host with a wrapper can name it. */
    readonly docker: string;
}

export const DEFAULT_SSH_PORT = 22;

/** `user@host`, the form `ssh` and `scp` both take. */
export function destination(target: Pick<SshTarget, "user" | "host">): string {
    return `${target.user}@${target.host}`;
}

/**
 * `user@host:port` for a message.
 *
 * Deliberately never includes the identity file. A key path in an error message ends up in a
 * screenshot in an issue, and a key path is a map of somebody's machine.
 */
export function describeTarget(target: Pick<SshTarget, "user" | "host" | "port">): string {
    return `${target.user}@${target.host}:${String(target.port)}`;
}
