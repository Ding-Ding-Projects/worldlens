import {
    DockerHostingManager,
    bindMountArgs,
    checkHostFolderMount,
    describeMount,
    detectHostKind,
    execFileCommandRunner,
    loopbackProbeCommand,
    probeDocker,
    sshArguments,
    sshCommandRunner,
    type CommandRunner,
    type DockerReport,
    type HostFolderMount,
    type ManagerAnswer,
    type PortMapping,
    type RemoteHostKind,
    type SshTarget,
} from "@worldlens/dockhand";

/**
 * Wharf's own fleet: containers this application created, on hosts this application knows.
 *
 * ## What this is, and what it deliberately is not
 *
 * It deploys a container image to a machine. That is the whole scope. It is not a Docker
 * client, it is not a way to inspect somebody else's containers, and it is not a shell.
 *
 * Those exclusions are the design rather than missing features. Every destructive operation
 * here works only on containers carrying Wharf's own ownership labels, which means the set of
 * things it can break is exactly the set of things it made. A tool that can stop any container
 * on the host is a tool that will eventually stop the wrong one, and the moment it can, every
 * other safeguard becomes a matter of the interface being careful.
 *
 * ## The identity, which is the boundary
 *
 * Constructed with Wharf's own namespace, never the package default. The default belongs to
 * the WorldLens desktop application, and sharing it would mean each application listing the
 * other's containers, offering to stop them, and being right to by its own labels.
 */
export const WHARF_IDENTITY = Object.freeze({
    labelNamespace: "dev.wharf",
    ownerPrefix: "wharf",
});

/** A machine Wharf can deploy to. Local means the Docker daemon on this computer. */
export type Destination =
    | { readonly kind: "local" }
    | { readonly kind: "ssh"; readonly target: SshTarget };

export interface DeploymentRequest {
    readonly id: string;
    readonly name: string;
    /** Digest-pinned. A floating tag is refused by the manager, deliberately. */
    readonly image: string;
    readonly ports?: readonly PortMapping[];
    /**
     * The folder this deployment uses, chosen by browsing rather than typed.
     *
     * Optional because not every image needs one, and singular because the control it backs
     * is "the main folder for this application". A deployment that genuinely needs several
     * adds them beside this one; making the common case a list would make the common case
     * harder to get right.
     */
    readonly mainFolder?: HostFolderMount;
    readonly env?: readonly { readonly key: string; readonly value: string }[];
    readonly memory?: string;
    readonly cpus?: string;
}

export interface FleetOptions {
    /** Where records of this application's own deployments are kept. */
    readonly recordFile: string;
    /** The user's own `known_hosts`, used rather than a private one Wharf invents. */
    readonly knownHostsFile: string;
    /** Injected for tests. */
    readonly runner?: CommandRunner;
    /**
     * What the local machine is, for tests.
     *
     * Real deployments read `process.platform`, which is right and is also why the tests
     * needed this: a suite that asked about a local destination got a different answer on a
     * Windows developer machine than on a Linux runner, and asserted on whichever one the
     * author happened to be sitting at.
     */
    readonly localHostKind?: RemoteHostKind;
}

/** What a person is shown before anything happens. */
export interface DeploymentPlan {
    readonly destination: string;
    readonly image: string;
    readonly ports: readonly string[];
    readonly folder: string | null;
    readonly refusals: readonly string[];
}

export class Fleet {
    readonly #options: FleetOptions;
    readonly #localRunner: CommandRunner;

    constructor(options: FleetOptions) {
        this.#options = options;
        this.#localRunner = options.runner ?? execFileCommandRunner;
    }

    /**
     * How to run a command on this destination.
     *
     * The seam that makes local and remote one code path rather than two. Everything below
     * takes a `CommandRunner` and does not know or care which it got, which is why the SSH
     * path cannot drift from the local one - there is only one path.
     */
    #runnerFor(destination: Destination): CommandRunner {
        if (destination.kind === "local") return this.#localRunner;
        return sshCommandRunner({
            target: destination.target,
            knownHostsFile: this.#options.knownHostsFile,
            runner: this.#localRunner,
        });
    }

    /** Whether Docker is usable on this destination, and what is wrong when it is not. */
    async probe(destination: Destination): Promise<DockerReport> {
        return await probeDocker({ runner: this.#runnerFor(destination) });
    }

    /**
     * POSIX or Windows, which decides three things that fail invisibly if guessed.
     *
     * Local answers from this process. Remote is asked, because a Windows server reached over
     * SSH from a Linux laptop is a real configuration and neither end's platform predicts the
     * other's.
     */
    async hostKind(destination: Destination): Promise<RemoteHostKind> {
        if (destination.kind === "local")
            return (
                this.#options.localHostKind ?? (process.platform === "win32" ? "windows" : "posix")
            );
        return await detectHostKind(
            this.#localRunner,
            "ssh",
            sshArguments({
                target: destination.target,
                knownHostsFile: this.#options.knownHostsFile,
            }),
        );
    }

    /**
     * What this deployment would do, and everything wrong with it, before doing any of it.
     *
     * Returns refusals as a list rather than stopping at the first, because somebody
     * correcting a form wants to see all of it. Stopping at the first turns one mistake into
     * three round trips.
     */
    async plan(destination: Destination, request: DeploymentRequest): Promise<DeploymentPlan> {
        const kind = await this.hostKind(destination);
        const refusals: string[] = [];

        if (request.mainFolder !== undefined) {
            const checked = checkHostFolderMount(request.mainFolder, kind);
            if (!checked.ok) refusals.push(checked.reason);
        }
        if (!/@sha256:[a-f0-9]{64}$/.test(request.image))
            refusals.push(
                "That image is not pinned to a digest. A tag can be moved under you, so what you deployed and what you reviewed would not have to be the same thing.",
            );

        return {
            destination:
                destination.kind === "local"
                    ? "this computer"
                    : `${destination.target.user}@${destination.target.host}`,
            image: request.image,
            ports: (request.ports ?? []).map(
                (port) =>
                    `${String(port.port)} (${(port.bindMode ?? "loopback") === "public" ? "reachable from other machines" : "this machine only"})`,
            ),
            folder: request.mainFolder === undefined ? null : describeMount(request.mainFolder),
            refusals,
        };
    }

    /** The manager for this destination, carrying Wharf's own identity. */
    #manager(destination: Destination): DockerHostingManager {
        return new DockerHostingManager({
            identity: WHARF_IDENTITY,
            runner: this.#runnerFor(destination),
            recordFile: this.#options.recordFile,
        });
    }

    /**
     * Deploy, having refused everything the plan refused.
     *
     * The plan is re-run here rather than trusted from the caller. A caller that showed a plan
     * and then sent a different request would otherwise deploy the second one under the first
     * one's confirmation, and the interface would have told the truth about something that did
     * not happen.
     */
    async deploy(
        destination: Destination,
        request: DeploymentRequest,
    ): Promise<ManagerAnswer<unknown>> {
        const plan = await this.plan(destination, request);
        if (plan.refusals.length > 0)
            return {
                ok: false,
                failure: {
                    code: "invalid-request",
                    message: plan.refusals[0] ?? "That deployment was refused.",
                    detail: plan.refusals.join("\n"),
                },
            };

        const manager = this.#manager(destination);
        return await manager.create({
            id: request.id,
            name: request.name,
            image: request.image,
            ...(request.ports === undefined ? {} : { ports: request.ports }),
            ...(request.env === undefined ? {} : { env: request.env }),
            ...(request.memory === undefined ? {} : { memory: request.memory }),
            ...(request.cpus === undefined ? {} : { cpus: request.cpus }),
        });
    }

    /**
     * The `-v` arguments a deployment's folder produces, for the plan to show verbatim.
     *
     * Exposed rather than hidden because "show me the command" is the one thing that settles
     * an argument about what a deployment tool is actually about to do.
     */
    static mountArguments(request: DeploymentRequest): readonly string[] {
        return request.mainFolder === undefined ? [] : bindMountArgs([request.mainFolder]);
    }

    /**
     * Whether a published port is genuinely answering, asked on the destination itself.
     *
     * `docker run` exiting 0 means the container was created, not that anything inside it is
     * listening. The difference is the whole gap between "deployed" and "working", and it is
     * where a deployment tool either tells the truth or does not.
     */
    async verifyPort(destination: Destination, port: number): Promise<boolean> {
        const kind = await this.hostKind(destination);
        const runner = this.#runnerFor(destination);
        const command = loopbackProbeCommand(kind, port);
        const [head, ...rest] = command.split(" ");
        const answer = await runner(head ?? "sh", rest);
        return answer.ok;
    }
}
