/**
 * The fourth place a Minecraft server can live: an EC2 instance this app provisions.
 *
 * Everything WorldLens already knows how to do with a container on a remote Docker daemon
 * - the console, the config editor, the plugin manager, the backup runner - it does again
 * here for free, because the transport this feature ends in (`transport.ts`) is not a
 * fourth implementation. It is `sshDocker.ts`, unchanged, handed an SSH target that happens
 * to be an instance this app just created rather than a machine somebody already had. The
 * only genuinely new work is getting from "nothing" to "a reachable Docker host with a
 * security group that lets 25565 through" - which is what the rest of this folder does.
 */

/** A rule opening one port to the world, or to loopback only. */
export interface AwsSecurityRule {
    readonly port: number;
    readonly protocol: "tcp" | "udp";
    /** "0.0.0.0/0" for the game port; RCON is never opened wider than the operator's own IP. */
    readonly cidr: string;
    readonly description: string;
}

/**
 * What to provision, before any of it exists.
 *
 * Deliberately narrow. There is no free-text "extra resource" field, because every field
 * here is one this app can tag, price, and tear down again - and a field it cannot do all
 * three for is a field that turns into an orphaned bill nobody can find.
 */
export interface AwsServerSpec {
    /** Stable id of the WorldLens server record this instance belongs to. Becomes a tag. */
    readonly serverId: string;
    readonly region: string;
    readonly instanceType: string;
    /** Root volume size, in GiB. */
    readonly diskGiB: number;
    /** Whether to allocate an Elastic IP so the address survives a stop/start. */
    readonly staticAddress: boolean;
    readonly rules: readonly AwsSecurityRule[];
    /** The AMI to launch. Never guessed here - `plan.ts` and its caller decide it. */
    readonly amiId: string;
    /** Name of an existing EC2 key pair to launch with. This app never generates a key. */
    readonly keyPairName: string;
    readonly docker?: string;
}

/** Every resource kind this feature ever creates. Exhaustive on purpose - see `plan.ts`. */
export type AwsResourceKind =
    | "security-group"
    | "key-pair-check"
    | "instance"
    | "elastic-ip"
    | "elastic-ip-association";

export interface AwsPlannedResource {
    readonly kind: AwsResourceKind;
    /** One line naming what this step does, fit to show beside its cost. */
    readonly summary: string;
    /**
     * Estimated USD per month this resource adds, or null when it is free.
     *
     * An estimate, stated as one. `plan.ts` documents exactly how each number is derived
     * so the honesty of the figure can be checked by reading one file, not trusted blind.
     */
    readonly estimatedMonthlyUsd: number | null;
}

export interface AwsProvisionPlan {
    readonly spec: AwsServerSpec;
    readonly resources: readonly AwsPlannedResource[];
    readonly estimatedMonthlyUsd: number;
    /** True when any cost figure in this plan could not be estimated and was left null. */
    readonly hasUnknownCost: boolean;
}

/** The tag key that marks a resource as WorldLens's own. Every gate checks for its value. */
export const OWNER_TAG_KEY = "worldlens:owner";
/** The tag value this app writes and looks for. A resource without it is never touched. */
export const OWNER_TAG_VALUE = "worldlens-mcserver";
/** The tag carrying which WorldLens server record a resource belongs to. */
export const SERVER_TAG_KEY = "worldlens:server-id";

export type AwsProvisionStepStatus = "created" | "found-existing" | "failed";

export interface AwsProvisionStep {
    readonly kind: AwsResourceKind;
    readonly status: AwsProvisionStepStatus;
    /** The resource's own id (sg-…, i-…, eipalloc-…), once known. */
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

export interface AwsInstanceRecord {
    readonly serverId: string;
    readonly region: string;
    readonly instanceId: string;
    readonly securityGroupId: string;
    readonly elasticIpAllocationId: string | null;
    readonly publicIp: string;
    readonly keyPairName: string;
    readonly sshUser: string;
    readonly identityFile: string | null;
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

/** One AWS region, for the picker. Never invented - always read from the CLI's own list. */
export interface AwsRegionOption {
    readonly id: string;
    readonly name: string;
}

/** One EC2 instance type, for the picker, with the numbers a person needs to choose. */
export interface AwsInstanceTypeOption {
    readonly id: string;
    readonly vcpu: number;
    readonly memoryMiB: number;
    readonly estimatedHourlyUsd: number | null;
}
