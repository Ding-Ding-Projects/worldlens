/**
 * Publishing a locally hosted map through a Cloudflare tunnel.
 *
 * A map served from somebody's own machine is reachable on their own network and nowhere
 * else. A tunnel fixes that without a port forward, a public IP, or a firewall hole,
 * because `cloudflared` dials **out** to Cloudflare and traffic comes back down that
 * connection. That single fact removes a lot of machinery from this file: there is no bind
 * address to choose, no `loopback`-versus-`public` decision, and no published container
 * port. The existing remote-hosting code has all three because it is doing the opposite
 * thing.
 *
 * ## Where cloudflared runs is a choice, and all three are the same code
 *
 * Host binary, a container on the local Docker, or a container on an SSH host. Every one
 * of them is argv through the injected {@link CommandRunner} that
 * `main/runtime/command.ts` already defines and that `dockerhosting/` and `remote/` already
 * use - which is exactly why all three are testable here with no daemon, no remote machine
 * and no `cloudflared` installed.
 */
import type { CommandRunner } from "../runtime/command.js";

/** Where `cloudflared` runs. */
export type TunnelRuntimeId = "host" | "docker" | "ssh";

/** The image used for the container runtimes. Digest-pinned, like every managed container. */
export interface TunnelImage {
    /** Must be digest-pinned: `cloudflare/cloudflared@sha256:...`. A tag is refused. */
    readonly reference: string;
}

/** An SSH host to run the container on, in the shape `remote/target.ts` already uses. */
export interface TunnelSshTarget {
    readonly host: string;
    readonly port: number;
    readonly user: string;
    /** A path to a key, never a key. This app has never read one and does not start here. */
    readonly identityFile: string | null;
    /** The docker command on that host, when it is not plain `docker`. */
    readonly docker: string;
}

export type TunnelRuntime =
    | { readonly id: "host" }
    | { readonly id: "docker"; readonly image: TunnelImage }
    | { readonly id: "ssh"; readonly image: TunnelImage; readonly target: TunnelSshTarget };

/** How a tunnel is going. */
export type TunnelState =
    | "not-configured"
    | "starting"
    | "connected"
    | "disconnected"
    | "failed";

export interface TunnelStatus {
    readonly state: TunnelState;
    /** The address the map is published at, once there is one. */
    readonly url: string | null;
    /** One sentence a person can act on. Empty when there is nothing to act on. */
    readonly detail: string;
    readonly runtime: TunnelRuntimeId;
}

/** Thrown when an image reference is not digest-pinned. */
export class UnpinnedImageError extends Error {
    constructor(reference: string) {
        super(
            `The cloudflared image must be pinned to a digest, not a tag. ` +
                `"${reference}" can change under you between one run and the next, which for ` +
                `something holding a tunnel to your own machine is not a risk worth taking.`,
        );
        this.name = "UnpinnedImageError";
    }
}

/** Every managed container in this app is digest-pinned; this one is no different. */
export function assertDigestPinned(reference: string): void {
    if (!/@sha256:[0-9a-f]{64}$/.test(reference)) {
        throw new UnpinnedImageError(reference);
    }
}

/** The container name a tunnel runs under, so it can be found and stopped again. */
export function tunnelContainerName(tunnelId: string): string {
    return `worldlens-tunnel-${tunnelId.slice(0, 12)}`;
}

/** The label marking a container as ours. Anything without it is invisible to this app. */
export const TUNNEL_OWNER_LABEL = "com.worldlens.owner=worldlens";
export const TUNNEL_ID_LABEL_KEY = "com.worldlens.tunnel";

export interface TunnelRunRequest {
    readonly runtime: TunnelRuntime;
    readonly tunnelId: string;
    /**
     * The tunnel's own credential, from the Cloudflare API.
     *
     * A secret. It reaches the container through an environment variable on the argv this
     * builds, and it must never be written to a log line, a status field, or an error
     * message. {@link describeTunnelCommand} exists precisely so a surface can show what
     * will run without showing this.
     */
    readonly tunnelToken: string;
    /** The local address cloudflared should forward to, e.g. `http://localhost:8100`. */
    readonly origin: string;
}

/**
 * The argv that runs a tunnel, for whichever runtime was chosen.
 *
 * Note what is absent from every branch: any published port. A tunnel dials out, so there
 * is nothing to publish, and adding `-p` would open a hole this design does not need.
 */
export function tunnelRunCommand(request: TunnelRunRequest): {
    readonly command: string;
    readonly args: readonly string[];
} {
    const { runtime, tunnelId, tunnelToken, origin } = request;
    const name = tunnelContainerName(tunnelId);

    if (runtime.id === "host") {
        return {
            command: "cloudflared",
            args: ["tunnel", "--no-autoupdate", "run", "--token", tunnelToken, "--url", origin],
        };
    }

    assertDigestPinned(runtime.image.reference);

    const dockerArgs = [
        "run",
        "--detach",
        "--name",
        name,
        "--restart",
        "unless-stopped",
        "--label",
        TUNNEL_OWNER_LABEL,
        "--label",
        `${TUNNEL_ID_LABEL_KEY}=${tunnelId}`,
        // The token goes in as an environment variable rather than an argument so it does
        // not sit in `docker ps` output for anybody on the machine to read.
        "--env",
        `TUNNEL_TOKEN=${tunnelToken}`,
        // The container must reach a server on the host, which it cannot do through the
        // default bridge network without this.
        "--add-host",
        "host.docker.internal:host-gateway",
        runtime.image.reference,
        "tunnel",
        "--no-autoupdate",
        "run",
        "--url",
        origin,
    ];

    if (runtime.id === "docker") {
        return { command: "docker", args: dockerArgs };
    }

    return {
        command: "ssh",
        args: [
            ...sshOptions(runtime.target),
            `${runtime.target.user}@${runtime.target.host}`,
            runtime.target.docker,
            ...dockerArgs,
        ],
    };
}

/**
 * SSH options, matching what `remote/ssh.ts` already enforces.
 *
 * Host key checking stays on and password authentication stays off. A tunnel is a route
 * into somebody's own machine, which makes it the last place to relax either.
 */
function sshOptions(target: TunnelSshTarget): readonly string[] {
    const options = [
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "PasswordAuthentication=no",
        "-o",
        "BatchMode=yes",
        "-p",
        String(target.port),
    ];
    if (target.identityFile) {
        options.push("-i", target.identityFile);
    }
    return options;
}

/**
 * The same command with the token replaced, for showing a person what will run.
 *
 * Every surface that displays a command must use this. Showing the real argv would print
 * a live tunnel credential into a preflight panel, and from there into a screenshot.
 */
export function describeTunnelCommand(request: TunnelRunRequest): string {
    const { command, args } = tunnelRunCommand(request);
    const redacted = args.map((argument) =>
        argument === request.tunnelToken
            ? "<tunnel token>"
            : argument.replace(
                  `TUNNEL_TOKEN=${request.tunnelToken}`,
                  "TUNNEL_TOKEN=<tunnel token>",
              ),
    );
    return [command, ...redacted].join(" ");
}

/** The argv that stops a tunnel again. */
export function tunnelStopCommand(
    runtime: TunnelRuntime,
    tunnelId: string,
): { readonly command: string; readonly args: readonly string[] } | null {
    const name = tunnelContainerName(tunnelId);
    if (runtime.id === "host") {
        // The host runtime is a supervised child process, stopped by signalling it rather
        // than by running a command. The caller owns that handle; nothing to build here.
        return null;
    }
    const dockerArgs = ["rm", "--force", name];
    if (runtime.id === "docker") {
        return { command: "docker", args: dockerArgs };
    }
    return {
        command: "ssh",
        args: [
            ...sshOptions(runtime.target),
            `${runtime.target.user}@${runtime.target.host}`,
            runtime.target.docker,
            ...dockerArgs,
        ],
    };
}

/** The public address of a tunnel, which only Cloudflare's edge can resolve. */
export function tunnelHostname(tunnelId: string): string {
    return `${tunnelId}.cfargotunnel.com`;
}

/** Checks whether a runtime can actually be used, without pretending to know more. */
export async function probeTunnelRuntime(options: {
    readonly runtime: TunnelRuntimeId;
    readonly runner: CommandRunner;
    readonly signal?: AbortSignal | undefined;
}): Promise<{ readonly usable: boolean; readonly detail: string }> {
    const { runtime, runner } = options;
    if (runtime === "host") {
        // Built conditionally rather than passing `{ signal: undefined }`: under
        // exactOptionalPropertyTypes an explicit undefined is not the same as an absent
        // key, and the compiler is right to refuse it.
        const result = await runner(
            "cloudflared",
            ["--version"],
            options.signal ? { signal: options.signal } : {},
        );
        return result.ok
            ? { usable: true, detail: "" }
            : {
                  usable: false,
                  detail: "cloudflared is not installed on this computer, or not on PATH.",
              };
    }
    // Docker and SSH availability are already answered by the probes those subsystems own
    // - `runtime/docker.ts` and the saved SSH targets. Re-implementing either here would
    // produce a second answer that can disagree with the one the rest of the app shows.
    return {
        usable: false,
        detail: "Ask the Docker or SSH host probe, which owns that answer.",
    };
}
