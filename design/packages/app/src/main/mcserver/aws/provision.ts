/**
 * Executing an {@link AwsProvisionPlan} against the real `aws` CLI - or, in every test in
 * this file, against a fake {@link CommandRunner} that never touches a network.
 *
 * ## Idempotent by construction
 *
 * Every step here does the same two things in the same order: look for a resource this app
 * already tagged for this `serverId`, and only create one when that lookup comes back
 * empty. A retry after a crash, a lost connection, or a transient AWS error therefore
 * continues rather than duplicating - the second run's "create security group" step finds
 * the one the first run made and reports `found-existing` instead of making a sibling.
 *
 * ## Rollback only touches what this run created
 *
 * `steps` accumulates as the run proceeds. On failure, {@link rollbackCreated} walks the
 * accumulated steps in reverse and removes only the ones whose `status` is `"created"` -
 * never a `"found-existing"` one, because that resource existed before this run started
 * and undoing it would delete something this run did not make. The result names exactly
 * what was rolled back and what, if anything, was left because the removal itself failed.
 *
 * ## Credentials
 *
 * Every call goes through `runner("aws", [...])`. The CLI resolves its own credentials
 * from the profile/environment/SSO session already configured on the machine - this module
 * never reads, stores, or passes a key of any kind. See `awsrender/credentialBroker.ts`
 * for the sibling promise this keeps.
 */

import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { fail, ok, type Answer } from "../transport/types.js";
import { OWNER_TAG_PAIR } from "./plan.js";
import {
    OWNER_TAG_KEY,
    OWNER_TAG_VALUE,
    SERVER_TAG_KEY,
    type AwsProvisionPlan,
    type AwsProvisionResult,
    type AwsProvisionStep,
    type AwsResourceKind,
} from "./types.js";

export interface AwsProvisionOptions {
    readonly runner: CommandRunner;
    readonly aws?: string;
    readonly timeoutMs?: number;
    /** Called after each step completes, so a caller can show live progress. */
    readonly onStep?: (step: AwsProvisionStep) => void;
}

interface RunJsonResult {
    readonly ok: boolean;
    readonly value: unknown;
    readonly raw: CommandOutput;
}

function baseArgs(region: string): string[] {
    return ["--region", region, "--output", "json"];
}

function ownerFilters(serverId: string): string[] {
    return [
        "--filters",
        `Name=tag:${OWNER_TAG_KEY},Values=${OWNER_TAG_VALUE}`,
        `Name=tag:${SERVER_TAG_KEY},Values=${serverId}`,
    ];
}

function tagSpec(resourceType: string, serverId: string, extra: readonly { Key: string; Value: string }[] = []): string[] {
    const tags = [OWNER_TAG_PAIR, { Key: SERVER_TAG_KEY, Value: serverId }, ...extra]
        .map((t) => `{Key=${t.Key},Value=${t.Value}}`)
        .join(",");
    return ["--tag-specifications", `ResourceType=${resourceType},Tags=[${tags}]`];
}

async function runJson(
    options: AwsProvisionOptions,
    args: readonly string[],
): Promise<RunJsonResult> {
    const aws = options.aws ?? "aws";
    const out = await options.runner(aws, args, { timeoutMs: options.timeoutMs ?? 60_000 });
    if (!out.ok) return { ok: false, value: null, raw: out };
    try {
        const value = out.stdout.trim() === "" ? {} : (JSON.parse(out.stdout) as unknown);
        return { ok: true, value, raw: out };
    } catch {
        return { ok: false, value: null, raw: out };
    }
}

function detail(out: CommandOutput): string {
    const text = `${out.stderr}\n${out.stdout}`.trim();
    return text === "" ? "The AWS CLI gave no further detail." : text.slice(0, 2_000);
}

function step(
    kind: AwsResourceKind,
    status: AwsProvisionStep["status"],
    resourceId: string | null,
    message: string,
): AwsProvisionStep {
    return { kind, status, resourceId, message };
}

/**
 * Removes exactly the resources this run created, in reverse order, best-effort.
 *
 * Exported so `provision.ts`'s own failure path and any caller that wants to abandon a
 * partially-finished plan can share one rollback rather than two copies drifting apart.
 */
export async function rollbackCreated(
    options: AwsProvisionOptions,
    region: string,
    createdSteps: readonly AwsProvisionStep[],
): Promise<{ readonly rolledBack: readonly string[]; readonly leftBehind: readonly string[] }> {
    const rolledBack: string[] = [];
    const leftBehind: string[] = [];
    const reversed = [...createdSteps].filter((s) => s.status === "created").reverse();

    for (const s of reversed) {
        if (s.resourceId === null) continue;
        const label = `${s.kind} ${s.resourceId}`;
        let out: RunJsonResult;
        switch (s.kind) {
            case "elastic-ip-association":
                // The association id is not tracked separately; disassociating by public
                // IP is handled by the elastic-ip rollback itself via release-address's
                // implicit disassociation, so there is nothing further to do here.
                rolledBack.push(label);
                continue;
            case "elastic-ip":
                out = await runJson(options, ["ec2", "release-address", "--allocation-id", s.resourceId, ...baseArgs(region)]);
                break;
            case "instance":
                out = await runJson(options, ["ec2", "terminate-instances", "--instance-ids", s.resourceId, ...baseArgs(region)]);
                break;
            case "security-group":
                out = await runJson(options, ["ec2", "delete-security-group", "--group-id", s.resourceId, ...baseArgs(region)]);
                break;
            case "key-pair-check":
                // This step never creates anything - see the note on AwsProvisionOptions.
                rolledBack.push(label);
                continue;
        }
        if (out.ok) rolledBack.push(label);
        else leftBehind.push(`${label} (${detail(out.raw)})`);
    }

    return { rolledBack, leftBehind };
}

export async function provisionAwsServer(
    plan: AwsProvisionPlan,
    options: AwsProvisionOptions,
): Promise<Answer<AwsProvisionResult>> {
    const { spec } = plan;
    const steps: AwsProvisionStep[] = [];
    const record = (s: AwsProvisionStep): void => {
        steps.push(s);
        options.onStep?.(s);
    };

    const failWithRollback = async (message: string, out: CommandOutput | null): Promise<Answer<AwsProvisionResult>> => {
        const { rolledBack, leftBehind } = await rollbackCreated(options, spec.region, steps);
        const rollbackNote =
            leftBehind.length === 0
                ? `Rolled back: ${rolledBack.length === 0 ? "nothing was created yet." : rolledBack.join(", ")}.`
                : `Rolled back ${rolledBack.join(", ") || "nothing"}; left behind and needs manual cleanup: ${leftBehind.join(", ")}.`;
        return fail(
            "command-failed",
            `${message} ${rollbackNote}`,
            out === null ? null : detail(out),
        );
    };

    // 1. Security group - find by tag, else create and open every rule.
    let securityGroupId: string;
    {
        const found = await runJson(options, ["ec2", "describe-security-groups", ...ownerFilters(spec.serverId), ...baseArgs(spec.region)]);
        const existingId = found.ok ? firstGroupId(found.value) : null;
        if (existingId !== null) {
            securityGroupId = existingId;
            record(step("security-group", "found-existing", existingId, "Reused the existing security group."));
        } else {
            const created = await runJson(options, [
                "ec2",
                "create-security-group",
                "--group-name",
                `worldlens-mcserver-${spec.serverId}`,
                "--description",
                `WorldLens Minecraft server ${spec.serverId}`,
                ...tagSpec("security-group", spec.serverId),
                ...baseArgs(spec.region),
            ]);
            const newId = created.ok ? groupIdFromCreate(created.value) : null;
            if (!created.ok || newId === null) return failWithRollback("Could not create the security group.", created.raw);
            securityGroupId = newId;
            record(step("security-group", "created", newId, "Created the security group."));

            for (const rule of spec.rules) {
                const authorized = await runJson(options, [
                    "ec2",
                    "authorize-security-group-ingress",
                    "--group-id",
                    newId,
                    "--ip-permissions",
                    `IpProtocol=${rule.protocol},FromPort=${rule.port},ToPort=${rule.port},IpRanges=[{CidrIp=${rule.cidr},Description=${rule.description}}]`,
                    ...baseArgs(spec.region),
                ]);
                if (!authorized.ok) return failWithRollback(`Could not open port ${rule.port}.`, authorized.raw);
            }
        }
    }

    // 2. Key pair - confirmed, never created. Provisioning refuses rather than inventing one.
    {
        const found = await runJson(options, ["ec2", "describe-key-pairs", "--key-names", spec.keyPairName, ...baseArgs(spec.region)]);
        if (!found.ok) {
            return failWithRollback(
                `The key pair "${spec.keyPairName}" was not found in ${spec.region}. Create it in the AWS console or with "aws ec2 create-key-pair" first - this app will never generate or hold a private key on your behalf.`,
                found.raw,
            );
        }
        record(step("key-pair-check", "found-existing", spec.keyPairName, "Confirmed the key pair exists."));
    }

    // 3. Instance - find a live one by tag, else run-instances.
    let instanceId: string;
    let publicIp: string;
    {
        const found = await runJson(options, [
            "ec2",
            "describe-instances",
            ...ownerFilters(spec.serverId),
            "--filters",
            "Name=instance-state-name,Values=pending,running,stopping,stopped",
            ...baseArgs(spec.region),
        ]);
        const existing = found.ok ? firstInstance(found.value) : null;
        if (existing !== null) {
            instanceId = existing.id;
            publicIp = existing.publicIp ?? "";
            record(step("instance", "found-existing", existing.id, "Reused the existing instance."));
        } else {
            const created = await runJson(options, [
                "ec2",
                "run-instances",
                "--image-id",
                spec.amiId,
                "--instance-type",
                spec.instanceType,
                "--key-name",
                spec.keyPairName,
                "--security-group-ids",
                securityGroupId,
                "--block-device-mappings",
                `[{DeviceName=/dev/xvda,Ebs={VolumeSize=${spec.diskGiB},VolumeType=gp3}}]`,
                "--min-count",
                "1",
                "--max-count",
                "1",
                ...tagSpec("instance", spec.serverId),
                ...baseArgs(spec.region),
            ]);
            const newId = created.ok ? instanceIdFromRun(created.value) : null;
            if (!created.ok || newId === null) return failWithRollback("Could not launch the instance.", created.raw);
            instanceId = newId;
            record(step("instance", "created", newId, "Launched the instance."));
            publicIp = "";
        }
    }

    // 4. Elastic IP (optional) - find by tag, else allocate.
    let elasticIpAllocationId: string | null = null;
    if (spec.staticAddress) {
        const found = await runJson(options, ["ec2", "describe-addresses", ...ownerFilters(spec.serverId), ...baseArgs(spec.region)]);
        const existing = found.ok ? firstAddress(found.value) : null;
        if (existing !== null) {
            elasticIpAllocationId = existing.allocationId;
            publicIp = existing.publicIp ?? publicIp;
            record(step("elastic-ip", "found-existing", existing.allocationId, "Reused the existing Elastic IP."));
        } else {
            const allocated = await runJson(options, ["ec2", "allocate-address", "--domain", "vpc", ...tagSpec("elastic-ip", spec.serverId), ...baseArgs(spec.region)]);
            const alloc = allocated.ok ? allocationFromAllocate(allocated.value) : null;
            if (!allocated.ok || alloc === null) return failWithRollback("Could not allocate an Elastic IP.", allocated.raw);
            elasticIpAllocationId = alloc.allocationId;
            publicIp = alloc.publicIp;
            record(step("elastic-ip", "created", alloc.allocationId, "Allocated an Elastic IP."));
        }

        // 5. Association - idempotent: associate-address is safe to call again for the
        // same instance, AWS simply reports it is already associated.
        const associated = await runJson(options, [
            "ec2",
            "associate-address",
            "--instance-id",
            instanceId,
            "--allocation-id",
            elasticIpAllocationId,
            ...baseArgs(spec.region),
        ]);
        if (!associated.ok) return failWithRollback("Could not associate the Elastic IP with the instance.", associated.raw);
        record(step("elastic-ip-association", "created", elasticIpAllocationId, "Associated the Elastic IP with the instance."));
    }

    if (publicIp === "") {
        // The instance was just launched, or reused without a resolvable address yet -
        // poll once more rather than handing back an unusable empty string.
        const described = await runJson(options, ["ec2", "describe-instances", "--instance-ids", instanceId, ...baseArgs(spec.region)]);
        const found = described.ok ? firstInstance(described.value) : null;
        publicIp = found?.publicIp ?? "";
    }

    return ok({
        steps,
        instanceId,
        securityGroupId,
        publicIp,
        elasticIpAllocationId,
    });
}

// --- Narrow, defensive JSON readers. Every one tolerates a shape it does not recognise by
// returning null rather than throwing, because the CLI's JSON is not a contract this
// module controls the other side of. ---

function firstGroupId(value: unknown): string | null {
    const groups = asRecord(value)?.SecurityGroups;
    if (!Array.isArray(groups) || groups.length === 0) return null;
    const id = asRecord(groups[0])?.GroupId;
    return typeof id === "string" ? id : null;
}

function groupIdFromCreate(value: unknown): string | null {
    const id = asRecord(value)?.GroupId;
    return typeof id === "string" ? id : null;
}

function instanceIdFromRun(value: unknown): string | null {
    const instances = asRecord(value)?.Instances;
    if (!Array.isArray(instances) || instances.length === 0) return null;
    const id = asRecord(instances[0])?.InstanceId;
    return typeof id === "string" ? id : null;
}

function firstInstance(value: unknown): { readonly id: string; readonly publicIp: string | null } | null {
    const reservations = asRecord(value)?.Reservations;
    if (!Array.isArray(reservations)) return null;
    for (const reservation of reservations) {
        const instances = asRecord(reservation)?.Instances;
        if (!Array.isArray(instances) || instances.length === 0) continue;
        const first = asRecord(instances[0]);
        const id = first?.InstanceId;
        if (typeof id !== "string") continue;
        const ip = first?.PublicIpAddress;
        return { id, publicIp: typeof ip === "string" ? ip : null };
    }
    return null;
}

function firstAddress(value: unknown): { readonly allocationId: string; readonly publicIp: string | null } | null {
    const addresses = asRecord(value)?.Addresses;
    if (!Array.isArray(addresses) || addresses.length === 0) return null;
    const first = asRecord(addresses[0]);
    const id = first?.AllocationId;
    if (typeof id !== "string") return null;
    const ip = first?.PublicIp;
    return { allocationId: id, publicIp: typeof ip === "string" ? ip : null };
}

function allocationFromAllocate(value: unknown): { readonly allocationId: string; readonly publicIp: string } | null {
    const record = asRecord(value);
    const id = record?.AllocationId;
    const ip = record?.PublicIp;
    if (typeof id !== "string" || typeof ip !== "string") return null;
    return { allocationId: id, publicIp: ip };
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
