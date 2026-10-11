import type { SshOptionsInput } from "../../remote/ssh.js";
import type { CommandRunner } from "../../runtime/command.js";
import { createSshProcessLifecycle } from "./sshProcessLifecycle.js";
import { fail, ok, type Answer, type ServerTransport, type SshProcessRef, type TransportCapabilities } from "./types.js";

/** Connect only an already installed, explicitly owned remote JVM. Installation is separate. */
export function createSshProcessTransport(options: {
    readonly ref: SshProcessRef;
    readonly ssh: SshOptionsInput;
    readonly runner?: CommandRunner;
    readonly now?: () => string;
    readonly capabilities?: Partial<TransportCapabilities>;
}): Answer<ServerTransport> {
    const ref = Object.freeze({ ...options.ref });
    if (options.ssh.target.id !== ref.hostId)
        return fail("invalid-request", "The resolved SSH profile does not match this installation's saved host.");
    const lifecycle = createSshProcessLifecycle({
        plan: ref,
        ssh: options.ssh,
        ...(options.runner === undefined ? {} : { runner: options.runner }),
        ...(options.now === undefined ? {} : { now: options.now }),
    });
    if (!lifecycle.ok) return lifecycle;
    const canStart = options.capabilities?.canLifecycle !== false && options.capabilities?.canStart !== false;
    const capabilities: TransportCapabilities = Object.freeze({
        canCreate: false, canLifecycle: false, canStart, canStop: false,
        canWriteFiles: false, canWriteConfig: false, canWritePlugins: false,
        canWriteWorlds: false, canBackupRestore: false, canDestroy: false, console: "none",
    });
    const unsupported = async () => fail("unsupported", "This SSH process operation is not available yet.");
    return ok({
        ref,
        capabilities,
        async probe() {
            const observed = await lifecycle.value.status();
            if (!observed.ok) return observed;
            return ok({ reachable: true, runtimeVersion: null, checkedAt: observed.value.checkedAt,
                message: observed.value.running ? "The owned remote Java process is running." : "The SSH host answered; the owned process is not confirmed running." });
        },
        async status() { return lifecycle.value.status(); },
        async start() {
            if (!canStart) return fail("denied", "This installation does not allow starting its remote process.");
            const started = await lifecycle.value.start();
            return started.ok ? ok(undefined) : started;
        },
        async stop() {
            return fail("unsupported", "Stopping this SSH process requires an authenticated console bound to its invocation. Forced termination is unavailable.");
        },
        create: unsupported, attach: unsupported, fileList: unsupported, fileRead: unsupported,
        fileWrite: unsupported, fileDelete: unsupported, dirEnsure: unsupported,
    });
}
