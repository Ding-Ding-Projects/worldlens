/**
 * Pure logic for the AWS provisioning panel: no Vue, no bridge, no clock.
 *
 * The main-process types this mirrors live in `packages/app/src/main/mcserver/aws/types.ts`
 * and are intentionally re-declared here rather than imported, for the same reason
 * `serverModel.ts` re-declares `TransportRef`: this package stays buildable without
 * depending on `packages/app/`'s main-process module graph. Keep the two in step by hand;
 * `AwsProvisionPanel.test.ts` exercises this file against fixtures shaped like the real
 * bridge responses so a drift shows up as a failing test rather than a silent mismatch.
 */

export interface AwsSecurityRule {
    readonly port: number;
    readonly protocol: "tcp" | "udp";
    readonly cidr: string;
    readonly description: string;
}

export interface AwsServerSpec {
    readonly serverId: string;
    readonly region: string;
    readonly instanceType: string;
    readonly diskGiB: number;
    readonly staticAddress: boolean;
    readonly rules: readonly AwsSecurityRule[];
    readonly amiId: string;
    readonly keyPairName: string;
}

export type AwsResourceKind = "security-group" | "key-pair-check" | "instance" | "elastic-ip" | "elastic-ip-association";

export interface AwsPlannedResource {
    readonly kind: AwsResourceKind;
    readonly summary: string;
    readonly estimatedMonthlyUsd: number | null;
}

export interface AwsProvisionPlan {
    readonly spec: AwsServerSpec;
    readonly resources: readonly AwsPlannedResource[];
    readonly estimatedMonthlyUsd: number;
    readonly hasUnknownCost: boolean;
}

export type AwsProvisionStepStatus = "created" | "found-existing" | "failed";

export interface AwsProvisionStep {
    readonly kind: AwsResourceKind;
    readonly status: AwsProvisionStepStatus;
    readonly resourceId: string | null;
    readonly message: string;
}

export interface AwsProvisionResult {
    readonly steps: readonly AwsProvisionStep[];
    readonly instanceId: string;
    readonly securityGroupId: string;
    readonly publicIp: string;
    readonly elasticIpAllocationId: string | null;
}

export interface AwsTeardownStep {
    readonly kind: AwsResourceKind;
    readonly resourceId: string | null;
    readonly status: "removed" | "already-gone" | "refused" | "failed";
    readonly message: string;
}

export interface AwsTeardownResult {
    readonly steps: readonly AwsTeardownStep[];
    readonly complete: boolean;
}

export interface AwsRegionOption {
    readonly id: string;
    readonly name: string;
}

export interface AwsInstanceTypeOption {
    readonly id: string;
    readonly vcpu: number;
    readonly memoryMiB: number;
    readonly estimatedHourlyUsd: number | null;
}

/** The one AWS instance this panel is tracking for a server, kept in local storage. */
export interface AwsTrackedInstance {
    readonly serverId: string;
    readonly region: string;
    readonly instanceId: string;
    readonly securityGroupId: string;
    readonly elasticIpAllocationId: string | null;
    readonly publicIp: string;
    readonly staticAddress: boolean;
}

export const DEFAULT_GAME_PORT = 25565;

/**
 * The security rules a fresh provision opens: the game port to the world, and nothing
 * else. RCON is deliberately never in this default list - the plan's own doc comment on
 * `AwsSecurityRule.cidr` says RCON is never opened wider than the operator's own IP, and
 * this panel has no way to know that IP, so it leaves the field to whoever does rather
 * than guessing 0.0.0.0/0 for a port that controls the server.
 */
export function defaultAwsRules(): readonly AwsSecurityRule[] {
    return [{ port: DEFAULT_GAME_PORT, protocol: "tcp", cidr: "0.0.0.0/0", description: "Minecraft game port" }];
}

export interface AwsFormState {
    readonly region: string | null;
    readonly instanceType: string | null;
    readonly diskGiB: number;
    readonly staticAddress: boolean;
    readonly keyPairName: string;
    readonly amiId: string;
}

/** What is stopping the form from being planned/provisioned, or null when it is ready. */
export function awsFormBlockReason(form: AwsFormState): string | null {
    if (form.region === null || form.region.trim() === "") return "region-missing";
    if (form.instanceType === null || form.instanceType.trim() === "") return "instance-type-missing";
    if (!Number.isFinite(form.diskGiB) || form.diskGiB <= 0 || form.diskGiB > 16_384) return "disk-invalid";
    if (form.keyPairName.trim() === "") return "key-pair-missing";
    if (form.amiId.trim() === "") return "ami-missing";
    return null;
}

export function buildAwsSpec(serverId: string, form: AwsFormState, rules: readonly AwsSecurityRule[]): AwsServerSpec | null {
    if (awsFormBlockReason(form) !== null) return null;
    return {
        serverId,
        region: form.region as string,
        instanceType: form.instanceType as string,
        diskGiB: form.diskGiB,
        staticAddress: form.staticAddress,
        rules,
        amiId: form.amiId.trim(),
        keyPairName: form.keyPairName.trim(),
    };
}

/** "$4.16/mo", or the honest "cost unknown" marker - never 0, never blank. */
export function formatMonthlyUsd(value: number | null): string {
    if (value === null) return "unknown";
    return `$${value.toFixed(2)}/mo`;
}

export function formatHourlyUsd(value: number | null): string {
    if (value === null) return "unknown";
    return `$${value.toFixed(4)}/hr`;
}

export function instanceTypeSummary(option: AwsInstanceTypeOption): string {
    const memoryGiB = Math.round((option.memoryMiB / 1024) * 10) / 10;
    return `${option.vcpu} vCPU, ${memoryGiB} GiB - ${formatHourlyUsd(option.estimatedHourlyUsd)}`;
}

/** True when at least one resource in the plan could not be priced. */
export function planHasUnknownCost(plan: AwsProvisionPlan): boolean {
    return plan.hasUnknownCost || plan.resources.some((r) => r.estimatedMonthlyUsd === null);
}

const STORAGE_PREFIX = "worldlens.mcserver.aws.instance.";

export function awsInstanceStorageKey(serverId: string): string {
    return `${STORAGE_PREFIX}${serverId}`;
}

/** Reads the tracked AWS instance for a server out of `storage`, tolerating garbage. */
export function readTrackedAwsInstance(serverId: string, storage: Pick<Storage, "getItem"> | null): AwsTrackedInstance | null {
    if (storage === null) return null;
    const raw = storage.getItem(awsInstanceStorageKey(serverId));
    if (raw === null) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== "object" || parsed === null) return null;
        const r = parsed as Record<string, unknown>;
        if (typeof r.serverId !== "string" || typeof r.region !== "string") return null;
        if (typeof r.instanceId !== "string" || typeof r.securityGroupId !== "string") return null;
        if (typeof r.publicIp !== "string" || typeof r.staticAddress !== "boolean") return null;
        const elasticIpAllocationId = typeof r.elasticIpAllocationId === "string" ? r.elasticIpAllocationId : null;
        return {
            serverId: r.serverId,
            region: r.region,
            instanceId: r.instanceId,
            securityGroupId: r.securityGroupId,
            elasticIpAllocationId,
            publicIp: r.publicIp,
            staticAddress: r.staticAddress,
        };
    } catch {
        return null;
    }
}

export function writeTrackedAwsInstance(instance: AwsTrackedInstance, storage: Pick<Storage, "setItem"> | null): void {
    storage?.setItem(awsInstanceStorageKey(instance.serverId), JSON.stringify(instance));
}

export function clearTrackedAwsInstance(serverId: string, storage: Pick<Storage, "removeItem"> | null): void {
    storage?.removeItem(awsInstanceStorageKey(serverId));
}

/** Turns a provision result plus its region into the record this panel keeps afterward. */
export function trackedInstanceFromResult(serverId: string, region: string, staticAddress: boolean, result: AwsProvisionResult): AwsTrackedInstance {
    return {
        serverId,
        region,
        instanceId: result.instanceId,
        securityGroupId: result.securityGroupId,
        elasticIpAllocationId: result.elasticIpAllocationId,
        publicIp: result.publicIp,
        staticAddress,
    };
}
