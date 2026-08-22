/**
 * Hard refusals for adoption, with no override.
 *
 * `discover.ts` already computes `AdoptionCandidate.blockers` so a discovery screen can
 * show them up front, but that list is advisory - a caller could in principle ignore it
 * and adopt anyway. This module is the one place that cannot be talked past: `record.ts`
 * calls `refuseAdoption` before it ever writes an `AdoptionRecord`, and every one of these
 * checks re-derives its own answer from the candidate rather than trusting the blocker
 * strings computed elsewhere, so a bug in `discover.ts`'s explanatory text can never
 * silently widen what this function allows.
 */

import type { AdoptionCandidate, Confidence } from "./discover.js";

export type RefusalReason =
    | "privileged"
    | "host-namespace"
    | "root-mount"
    | "docker-socket-mount"
    | "different-owner"
    | "low-confidence"
    | "bulk-not-allowed";

export interface Refusal {
    readonly reason: RefusalReason;
    readonly message: string;
}

function isRootOrHomeMount(source: string): boolean {
    const normalized = source.replace(/\\/g, "/").toLowerCase();
    if (normalized === "/" || normalized === "") return true;
    // A bare drive root: "c:/", "c:", "d:/". Not "c:/data" - that is an ordinary mount.
    if (/^[a-z]:\/?$/.test(normalized)) return true;
    return false;
}

function isDockerSocketMount(source: string, destination: string): boolean {
    const haystack = `${source} ${destination}`.toLowerCase().replace(/\\/g, "/");
    return haystack.includes("docker.sock") || haystack.includes("//./pipe/docker_engine");
}

/**
 * Every reason `scoreCandidate`'s own `blockers` cannot be traded away.
 *
 * A container may still show `blockers` for other, softer reasons (unclear evidence that a
 * human could plausibly override with their own knowledge); this function only returns the
 * subset that must never be overridden by anyone, ever - a privileged container, a shared
 * host namespace, a root/home/docker-socket bind mount, or ownership by a different
 * installation. Low confidence with genuinely nothing to go on also lands here, because
 * "adopt this because it might be a Minecraft server" is exactly the guess this feature
 * must refuse to make silently.
 */
export function refuseSingleAdoption(candidate: AdoptionCandidate, ownerValue: string): readonly Refusal[] {
    const refusals: Refusal[] = [];

    for (const blocker of candidate.blockers) {
        if (blocker.includes("privileged")) {
            refusals.push({ reason: "privileged", message: blocker });
        } else if (blocker.includes("process namespace") || blocker.includes("network namespace")) {
            refusals.push({ reason: "host-namespace", message: blocker });
        } else if (blocker.includes("root filesystem")) {
            refusals.push({ reason: "root-mount", message: blocker });
        } else if (blocker.includes("Docker socket")) {
            refusals.push({ reason: "docker-socket-mount", message: blocker });
        } else if (blocker.includes("different WorldLens installation")) {
            refusals.push({ reason: "different-owner", message: blocker });
        }
    }

    // Re-derive independently, rather than trusting the discovery-time text alone.
    for (const mount of candidate.mounts) {
        if (isRootOrHomeMount(mount.source) && !refusals.some((r) => r.reason === "root-mount")) {
            refusals.push({
                reason: "root-mount",
                message: `This container mounts "${mount.source}" into itself, which is the whole filesystem root rather than a server folder.`,
            });
        }
        if (isDockerSocketMount(mount.source, mount.destination) && !refusals.some((r) => r.reason === "docker-socket-mount")) {
            refusals.push({
                reason: "docker-socket-mount",
                message: `This container mounts the Docker socket (${mount.source}), which would let it control every other container on this machine.`,
            });
        }
    }

    if (candidate.existingOwner !== null && candidate.existingOwner !== ownerValue) {
        if (!refusals.some((r) => r.reason === "different-owner")) {
            refusals.push({
                reason: "different-owner",
                message: "This container already belongs to a different WorldLens installation.",
            });
        }
    }

    const hasStructuralEvidence = candidate.evidence.some(
        (line) => line.includes("mount layout") || line.includes("log line") || line.includes("log reports"),
    );
    const lowConfidenceRefusal = ((): Refusal | null => {
        const confidence: Confidence = candidate.detected.confidence;
        if (confidence !== "low") return null;
        if (hasStructuralEvidence) return null;
        return {
            reason: "low-confidence",
            message:
                "There isn't enough evidence to treat this as a Minecraft server: no matching filesystem layout and no matching log line, only weaker signals like the image name.",
        };
    })();
    if (lowConfidenceRefusal !== null) refusals.push(lowConfidenceRefusal);

    return refusals;
}

/**
 * The one and only bulk-adoption rule: there isn't one. Every candidate must be adopted
 * through its own confirmed call. Handing this function more than one candidate at a time
 * is itself the refused action, regardless of how clean each individual candidate is.
 */
export function refuseBulkAdoption(candidateIds: readonly string[]): Refusal | null {
    if (candidateIds.length <= 1) return null;
    return {
        reason: "bulk-not-allowed",
        message:
            "Adopting several containers in one step is not offered. Confirm each container one at a time so nobody hands over more than they meant to.",
    };
}
