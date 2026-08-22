/**
 * Where a generation job actually runs.
 *
 * Two families exist in this app already and this feature reuses both rather than
 * inventing a third:
 *
 * - `TransportRef` (`../mcserver/transport/types.js`) already knows how to reach a real
 *   Minecraft server process: on this machine, in a local Docker container, in a
 *   container over SSH, or on an AWS instance this app provisioned. Generation on any of
 *   those is "run a real server against these settings, watch it, stop it" - the same
 *   shape the mcserver feature already runs a live server through.
 * - GitHub Actions is not a `TransportRef` at all - there is no long-lived server to
 *   attach to, only a workflow to dispatch and a run to poll, which is exactly what
 *   `../cirender/` already does for map rendering. `RunnerChoice`'s `github-actions`
 *   variant carries the same `owner`/`repo` shape `cirender/transport.ts`'s
 *   `CiRepositoryFacts` already uses, so a generation job dispatches through the same
 *   kind of call `cirender` makes for a render.
 *
 * Nothing in this module talks to a process, a daemon, or a network - it only decides,
 * from a description of what is available, which runner a generation job should use.
 */

import type { TransportRef } from "../mcserver/transport/types.js";

export type RunnerChoice =
    | { readonly kind: "transport"; readonly transport: TransportRef }
    | { readonly kind: "github-actions"; readonly owner: string; readonly repo: string; readonly workflowFile: string };

export interface RunnerCapabilities {
    readonly localProcessAvailable: boolean;
    readonly configuredTransports: readonly TransportRef[];
    /** A GitHub repository this app can dispatch a workflow against, if any. */
    readonly githubRepository: { readonly owner: string; readonly repo: string } | null;
}

export const GENERATE_WORLD_WORKFLOW_FILE = "generate-world.yml";

/** Every runner a generation job could plausibly use right now, in the order the wizard
 * should offer them: the machine you are on first, then configured remotes, then Actions. */
export function listAvailableRunners(capabilities: RunnerCapabilities): readonly RunnerChoice[] {
    const runners: RunnerChoice[] = [];
    if (capabilities.localProcessAvailable) {
        runners.push({ kind: "transport", transport: { kind: "local-process", serverDir: "" } });
    }
    for (const transport of capabilities.configuredTransports) {
        if (transport.kind !== "local-process") {
            runners.push({ kind: "transport", transport });
        }
    }
    if (capabilities.githubRepository !== null) {
        runners.push({
            kind: "github-actions",
            owner: capabilities.githubRepository.owner,
            repo: capabilities.githubRepository.repo,
            workflowFile: GENERATE_WORLD_WORKFLOW_FILE,
        });
    }
    return runners;
}

/** A short, stable label for a runner choice, for list rows and status lines. Never used
 * as an identity key - use {@link runnerKey} for that. */
export function describeRunner(runner: RunnerChoice): string {
    if (runner.kind === "github-actions") {
        return `GitHub Actions (${runner.owner}/${runner.repo})`;
    }
    switch (runner.transport.kind) {
        case "local-process":
            return "This computer";
        case "local-docker":
            return "Local Docker container";
        case "ssh-docker":
            return `Remote host (${runner.transport.hostId})`;
        case "aws":
            return `AWS (${runner.transport.region})`;
    }
}

/** A stable identity string for a runner choice, safe to use as a Vue `:key` or a map key. */
export function runnerKey(runner: RunnerChoice): string {
    if (runner.kind === "github-actions") {
        return `github-actions:${runner.owner}/${runner.repo}`;
    }
    switch (runner.transport.kind) {
        case "local-process":
            return "transport:local-process";
        case "local-docker":
            return `transport:local-docker:${runner.transport.containerRef}`;
        case "ssh-docker":
            return `transport:ssh-docker:${runner.transport.hostId}:${runner.transport.containerRef}`;
        case "aws":
            return `transport:aws:${runner.transport.instanceId}`;
    }
}
