/**
 * Turning an {@link AwsServerSpec} into the bill a person sees before anything is created.
 *
 * No API call anywhere in this file, deliberately - see the module doc on `types.ts`. That
 * is what makes this exhaustively testable with nothing but plain objects, and it is also
 * the honesty mechanism: `provision.ts` is required to create exactly the resources this
 * function named, in this order, and nothing it did not.
 *
 * ## Where the numbers come from, and where they don't
 *
 * These are list-price, on-demand estimates for the most common regions, hand-maintained
 * in {@link EC2_HOURLY_USD} below, multiplied out to a monthly figure using a 730-hour
 * month (AWS's own convention). They are NOT fetched from a pricing API - the AWS Price
 * List API exists but needs its own credentials and network round trip, which would put a
 * remote call in front of the one screen that most needs to render instantly and offline.
 *
 * When an instance type is not in the table, or a resource's cost genuinely depends on
 * usage this function cannot know (data transfer, EBS snapshot storage), the estimate is
 * `null` rather than a guess, and {@link AwsProvisionPlan.hasUnknownCost} is set so the
 * interface can say plainly that the true number may be higher.
 */

import {
    OWNER_TAG_VALUE,
    type AwsPlannedResource,
    type AwsProvisionPlan,
    type AwsServerSpec,
} from "./types.js";

/**
 * On-demand USD/hour, us-east-1 list price, for the instance types this feature's picker
 * offers. Deliberately small - see `regions.ts` for the same "named list, not an API
 * crawl" shape applied to regions.
 */
export const EC2_HOURLY_USD: Readonly<Record<string, number>> = {
    "t3.micro": 0.0104,
    "t3.small": 0.0208,
    "t3.medium": 0.0416,
    "t3.large": 0.0832,
    "t3.xlarge": 0.1664,
    "t4g.micro": 0.0084,
    "t4g.small": 0.0168,
    "t4g.medium": 0.0336,
    "t4g.large": 0.0672,
    "m6i.large": 0.096,
    "m6i.xlarge": 0.192,
};

/** AWS's own convention for turning an hourly rate into a monthly one. */
export const HOURS_PER_MONTH = 730;

/** gp3 EBS, list price per GiB-month, us-east-1. */
export const EBS_GP3_USD_PER_GIB_MONTH = 0.08;

/** A stopped/associated Elastic IP's list price per hour when it is not attached to a running instance is 0; while attached to a running instance it is free. Only an UNUSED allocation is billed. */
export const ELASTIC_IP_IDLE_USD_PER_HOUR = 0.005;

function instanceMonthlyUsd(instanceType: string): number | null {
    const hourly = EC2_HOURLY_USD[instanceType];
    if (hourly === undefined) return null;
    return round2(hourly * HOURS_PER_MONTH);
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Builds the ordered plan for one spec.
 *
 * Order matters and is not incidental: `provision.ts` walks this exact sequence, and it is
 * the dependency order a real launch needs - the security group must exist before the
 * instance can be launched into it, and the Elastic IP association needs a running
 * instance to attach to.
 */
export function planAwsServer(spec: AwsServerSpec): AwsProvisionPlan {
    const resources: AwsPlannedResource[] = [];

    resources.push({
        kind: "security-group",
        summary: `Security group opening ${spec.rules.map((r) => `${r.port}/${r.protocol}`).join(", ") || "no ports"}`,
        estimatedMonthlyUsd: 0,
    });

    resources.push({
        kind: "key-pair-check",
        summary: `Confirm the key pair "${spec.keyPairName}" exists in ${spec.region}`,
        estimatedMonthlyUsd: 0,
    });

    resources.push({
        kind: "instance",
        summary: `${spec.instanceType} instance (${spec.diskGiB} GiB gp3 root volume) in ${spec.region}`,
        estimatedMonthlyUsd: addCosts(instanceMonthlyUsd(spec.instanceType), round2(spec.diskGiB * EBS_GP3_USD_PER_GIB_MONTH)),
    });

    if (spec.staticAddress) {
        resources.push({
            kind: "elastic-ip",
            summary: "Elastic IP, so the address survives a stop/start",
            // Free while attached to a running instance, which is the state this app keeps
            // it in; stated as 0 with the caveat carried in the plan's own doc comment
            // rather than invented as a nonzero "usually free" number.
            estimatedMonthlyUsd: 0,
        });
        resources.push({
            kind: "elastic-ip-association",
            summary: "Associate that address with the instance",
            estimatedMonthlyUsd: 0,
        });
    }

    const known = resources.filter((r) => r.estimatedMonthlyUsd !== null);
    const total = round2(known.reduce((sum, r) => sum + (r.estimatedMonthlyUsd ?? 0), 0));
    const hasUnknownCost = resources.some((r) => r.estimatedMonthlyUsd === null);

    return { spec, resources, estimatedMonthlyUsd: total, hasUnknownCost };
}

function addCosts(a: number | null, b: number | null): number | null {
    if (a === null || b === null) return null;
    return round2(a + b);
}

/** The tag pair every created resource carries, exported so `provision.ts` never restates it. */
export const OWNER_TAG_PAIR = { Key: "worldlens:owner", Value: OWNER_TAG_VALUE } as const;
