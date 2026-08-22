/**
 * Turning a provisioned instance into a `ServerTransport`.
 *
 * This is the whole architectural point of the feature, stated in code: there is no AWS
 * Docker implementation here. `createSshDockerTransport` already runs `docker` over a
 * `CommandRunner` reached through `sshCommandRunner`; an EC2 instance with a Docker daemon
 * on it is just another SSH-reachable Docker host, and the only thing this file supplies
 * is the `RemoteTarget` describing how to reach it - the public IP or Elastic IP this
 * app's own provisioning just produced, and the identity file the instance's key pair
 * needs. Everything past that line - the container lifecycle, the config reads, the write
 * guard, the log replay - is `dockerTransport.ts`, already tested, already used by two
 * other transports.
 */

import { createSshDockerTransport } from "../transport/sshDocker.js";
import type { ServerTransport, TransportCapabilities, TransportRef } from "../transport/types.js";
import type { CommandRunner } from "../../runtime/command.js";
import type { RemoteTarget } from "../../remote/target.js";

export interface AwsTransportOptions {
    readonly ref: Extract<TransportRef, { readonly kind: "aws" }>;
    /** Where the app's own SSH known-hosts file for this instance lives. */
    readonly knownHostsFile: string;
    readonly runner?: CommandRunner;
    readonly docker?: string;
    readonly writeScope?: readonly string[];
    readonly now?: () => string;
    readonly capabilities?: Partial<TransportCapabilities>;
    readonly connectTimeoutSeconds?: number;
}

/** Builds the `RemoteTarget` an AWS-hosted server is reached through. */
export function awsRemoteTarget(ref: Extract<TransportRef, { readonly kind: "aws" }>): RemoteTarget {
    return {
        id: `aws:${ref.instanceId}`,
        label: `AWS ${ref.region} (${ref.instanceId})`,
        host: ref.publicIp,
        port: 22,
        user: ref.sshUser,
        identityFile: ref.identityFile,
        // Unused by this path: `docker` runs over the SSH command runner directly, and
        // no render-style staging directory or image is involved here. Filled in only
        // because `RemoteTarget` is one shared shape with the render feature.
        workDir: "~/.worldlens/mcserver",
        image: "",
        docker: "docker",
        keepRemoteFiles: false,
    };
}

export function createAwsTransport(options: AwsTransportOptions): ServerTransport {
    const target = awsRemoteTarget(options.ref);
    return createSshDockerTransport({
        target,
        knownHostsFile: options.knownHostsFile,
        hostId: `aws:${options.ref.instanceId}`,
        containerRef: options.ref.containerRef,
        serverDir: options.ref.serverDir,
        ...(options.connectTimeoutSeconds === undefined ? {} : { connectTimeoutSeconds: options.connectTimeoutSeconds }),
        ...(options.runner === undefined ? {} : { runner: options.runner }),
        ...(options.docker === undefined ? {} : { docker: options.docker }),
        ...(options.writeScope === undefined ? {} : { writeScope: options.writeScope }),
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    });
}
