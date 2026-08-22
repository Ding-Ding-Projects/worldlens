/**
 * Removing everything this app created for one AWS server - and refusing to touch anything
 * it did not.
 *
 * Every deletion here is gated on reading the resource's own tags back from AWS first and
 * checking `worldlens:owner` and `worldlens:server-id` before issuing the delete. This is
 * not the same check as "provision.ts only creates tagged things" - that would trust the
 * caller's own bookkeeping. This asks AWS, every time, right before the destructive call,
 * so a stale local record pointing at a since-repurposed instance id can never cause this
 * to delete somebody else's machine.
 */

import { ok, type Answer } from "../transport/types.js";
import { OWNER_TAG_KEY, OWNER_TAG_VALUE, SERVER_TAG_KEY, type AwsTeardownResult, type AwsTeardownStep } from "./types.js";
import type { CommandOutput, CommandRunner } from "../../runtime/command.js";

export interface AwsTeardownOptions {
    readonly runner: CommandRunner;
    readonly aws?: string;
    readonly timeoutMs?: number;
    readonly onStep?: (step: AwsTeardownStep) => void;
}

export interface AwsTeardownTarget {
    readonly serverId: string;
    readonly region: string;
    readonly instanceId: string | null;
    readonly elasticIpAllocationId: string | null;
    readonly securityGroupId: string | null;
}

function baseArgs(region: string): string[] {
    return ["--region", region, "--output", "json"];
}

async function runJson(options: AwsTeardownOptions, args: readonly string[]): Promise<{ ok: boolean; value: unknown; raw: CommandOutput }> {
    const aws = options.aws ?? "aws";
    const out = await options.runner(aws, args, { timeoutMs: options.timeoutMs ?? 60_000 });
    if (!out.ok) return { ok: false, value: null, raw: out };
    try {
        return { ok: true, value: out.stdout.trim() === "" ? {} : (JSON.parse(out.stdout) as unknown), raw: out };
    } catch {
        return { ok: false, value: null, raw: out };
    }
}

function detail(out: CommandOutput): string {
    const text = `${out.stderr}\n${out.stdout}`.trim();
    return text === "" ? "The AWS CLI gave no further detail." : text.slice(0, 2_000);
}

function tagValue(tags: unknown, key: string): string | null {
    if (!Array.isArray(tags)) return null;
    for (const entry of tags) {
        if (typeof entry !== "object" || entry === null) continue;
        const record = entry as Record<string, unknown>;
        if (record.Key === key && typeof record.Value === "string") return record.Value;
    }
    return null;
}

/**
 * Confirms a resource carries this app's own ownership tags for exactly this server, by
 * reading them back from AWS rather than trusting a caller's claim.
 *
 * `describeTags` is expected to run the read-only `describe-*` call and hand back the raw
 * `Tags` array AWS reports for that one resource, or null when the resource is already
 * gone (which teardown treats as "already-gone", not as an error).
 */
async function confirmOwned(
    tags: readonly unknown[] | null,
    serverId: string,
): Promise<"owned" | "not-owned" | "gone"> {
    if (tags === null) return "gone";
    const owner = tagValue(tags, OWNER_TAG_KEY);
    const forServer = tagValue(tags, SERVER_TAG_KEY);
    if (owner === OWNER_TAG_VALUE && forServer === serverId) return "owned";
    return "not-owned";
}

async function describeInstanceTags(options: AwsTeardownOptions, region: string, instanceId: string): Promise<readonly unknown[] | null> {
    const described = await runJson(options, ["ec2", "describe-instances", "--instance-ids", instanceId, ...baseArgs(region)]);
    if (!described.ok) return null;
    const reservations = (described.value as Record<string, unknown> | null)?.Reservations;
    if (!Array.isArray(reservations) || reservations.length === 0) return null;
    const instances = (reservations[0] as Record<string, unknown> | undefined)?.Instances;
    if (!Array.isArray(instances) || instances.length === 0) return null;
    const first = instances[0] as Record<string, unknown> | undefined;
    const state = (first?.State as Record<string, unknown> | undefined)?.Name;
    if (state === "terminated") return null;
    const tags = first?.Tags;
    return Array.isArray(tags) ? tags : [];
}

async function describeAddressTags(options: AwsTeardownOptions, region: string, allocationId: string): Promise<readonly unknown[] | null> {
    const described = await runJson(options, ["ec2", "describe-addresses", "--allocation-ids", allocationId, ...baseArgs(region)]);
    if (!described.ok) return null;
    const addresses = (described.value as Record<string, unknown> | null)?.Addresses;
    if (!Array.isArray(addresses) || addresses.length === 0) return null;
    const tags = (addresses[0] as Record<string, unknown> | undefined)?.Tags;
    return Array.isArray(tags) ? tags : [];
}

async function describeGroupTags(options: AwsTeardownOptions, region: string, groupId: string): Promise<readonly unknown[] | null> {
    const described = await runJson(options, ["ec2", "describe-security-groups", "--group-ids", groupId, ...baseArgs(region)]);
    if (!described.ok) return null;
    const groups = (described.value as Record<string, unknown> | null)?.SecurityGroups;
    if (!Array.isArray(groups) || groups.length === 0) return null;
    const tags = (groups[0] as Record<string, unknown> | undefined)?.Tags;
    return Array.isArray(tags) ? tags : [];
}

/**
 * Tears down one server's AWS resources, in reverse creation order: association implicitly
 * via release, then the Elastic IP, then the instance, then the security group last of all
 * because it cannot be deleted while the instance is still attached to it.
 */
export async function teardownAwsServer(target: AwsTeardownTarget, options: AwsTeardownOptions): Promise<Answer<AwsTeardownResult>> {
    const steps: AwsTeardownStep[] = [];
    const record = (s: AwsTeardownStep): void => {
        steps.push(s);
        options.onStep?.(s);
    };

    if (target.elasticIpAllocationId !== null) {
        const tags = await describeAddressTags(options, target.region, target.elasticIpAllocationId);
        const verdict = await confirmOwned(tags, target.serverId);
        if (verdict === "gone") {
            record({ kind: "elastic-ip", resourceId: target.elasticIpAllocationId, status: "already-gone", message: "Already released." });
        } else if (verdict === "not-owned") {
            record({
                kind: "elastic-ip",
                resourceId: target.elasticIpAllocationId,
                status: "refused",
                message: "This Elastic IP no longer carries WorldLens's own tags for this server, so it was left untouched.",
            });
        } else {
            const released = await runJson(options, ["ec2", "release-address", "--allocation-id", target.elasticIpAllocationId, ...baseArgs(target.region)]);
            record(
                released.ok
                    ? { kind: "elastic-ip", resourceId: target.elasticIpAllocationId, status: "removed", message: "Released the Elastic IP." }
                    : { kind: "elastic-ip", resourceId: target.elasticIpAllocationId, status: "failed", message: detail(released.raw) },
            );
        }
    }

    if (target.instanceId !== null) {
        const tags = await describeInstanceTags(options, target.region, target.instanceId);
        const verdict = await confirmOwned(tags, target.serverId);
        if (verdict === "gone") {
            record({ kind: "instance", resourceId: target.instanceId, status: "already-gone", message: "Already terminated." });
        } else if (verdict === "not-owned") {
            record({
                kind: "instance",
                resourceId: target.instanceId,
                status: "refused",
                message: "This instance no longer carries WorldLens's own tags for this server, so it was left untouched.",
            });
        } else {
            const terminated = await runJson(options, ["ec2", "terminate-instances", "--instance-ids", target.instanceId, ...baseArgs(target.region)]);
            record(
                terminated.ok
                    ? { kind: "instance", resourceId: target.instanceId, status: "removed", message: "Terminated the instance." }
                    : { kind: "instance", resourceId: target.instanceId, status: "failed", message: detail(terminated.raw) },
            );
        }
    }

    if (target.securityGroupId !== null) {
        const tags = await describeGroupTags(options, target.region, target.securityGroupId);
        const verdict = await confirmOwned(tags, target.serverId);
        if (verdict === "gone") {
            record({ kind: "security-group", resourceId: target.securityGroupId, status: "already-gone", message: "Already deleted." });
        } else if (verdict === "not-owned") {
            record({
                kind: "security-group",
                resourceId: target.securityGroupId,
                status: "refused",
                message: "This security group no longer carries WorldLens's own tags for this server, so it was left untouched.",
            });
        } else {
            const deleted = await runJson(options, ["ec2", "delete-security-group", "--group-id", target.securityGroupId, ...baseArgs(target.region)]);
            record(
                deleted.ok
                    ? { kind: "security-group", resourceId: target.securityGroupId, status: "removed", message: "Deleted the security group." }
                    : {
                          kind: "security-group",
                          resourceId: target.securityGroupId,
                          status: "failed",
                          // The instance may still be terminating - deletion of its
                          // security group can fail for a few seconds after
                          // terminate-instances returns. Say so rather than a bare error.
                          message: `${detail(deleted.raw)} (the instance may still be shutting down - retry teardown in a moment)`,
                      },
            );
        }
    }

    // Always answered `ok` - a partial teardown is a real, inspectable outcome (see
    // `AwsTeardownResult.complete` and each step's own status), never an exception. A
    // caller that wants to treat "something failed" as an error checks `complete` itself.
    const complete = steps.every((s) => s.status === "removed" || s.status === "already-gone");
    return ok({ steps, complete });
}
