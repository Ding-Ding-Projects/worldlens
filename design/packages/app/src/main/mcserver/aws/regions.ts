/**
 * The regions and instance types the AWS provisioning wizard offers.
 *
 * A named list, not an API crawl. `aws ec2 describe-regions` and `describe-instance-types`
 * both exist and would return an authoritative answer, but both need a live, signed-in
 * profile - so calling them from the same screen that reports "AWS is not signed in" would
 * mean that screen's own picker breaks first. This is the same trade `plan.ts` makes for
 * pricing: a short, honest, hand-maintained list beats a live call that cannot run yet.
 */

import { EC2_HOURLY_USD } from "./plan.js";
import type { AwsInstanceTypeOption, AwsRegionOption } from "./types.js";

export const AWS_REGIONS: readonly AwsRegionOption[] = [
    { id: "us-east-1", name: "US East (N. Virginia)" },
    { id: "us-east-2", name: "US East (Ohio)" },
    { id: "us-west-1", name: "US West (N. California)" },
    { id: "us-west-2", name: "US West (Oregon)" },
    { id: "eu-west-1", name: "EU (Ireland)" },
    { id: "eu-west-2", name: "EU (London)" },
    { id: "eu-central-1", name: "EU (Frankfurt)" },
    { id: "ap-southeast-1", name: "Asia Pacific (Singapore)" },
    { id: "ap-southeast-2", name: "Asia Pacific (Sydney)" },
    { id: "ap-northeast-1", name: "Asia Pacific (Tokyo)" },
];

const SPECS: Readonly<Record<string, { readonly vcpu: number; readonly memoryMiB: number }>> = {
    "t3.micro": { vcpu: 2, memoryMiB: 1024 },
    "t3.small": { vcpu: 2, memoryMiB: 2048 },
    "t3.medium": { vcpu: 2, memoryMiB: 4096 },
    "t3.large": { vcpu: 2, memoryMiB: 8192 },
    "t3.xlarge": { vcpu: 4, memoryMiB: 16384 },
    "t4g.micro": { vcpu: 2, memoryMiB: 1024 },
    "t4g.small": { vcpu: 2, memoryMiB: 2048 },
    "t4g.medium": { vcpu: 2, memoryMiB: 4096 },
    "t4g.large": { vcpu: 2, memoryMiB: 8192 },
    "m6i.large": { vcpu: 2, memoryMiB: 8192 },
    "m6i.xlarge": { vcpu: 4, memoryMiB: 16384 },
};

export const AWS_INSTANCE_TYPES: readonly AwsInstanceTypeOption[] = Object.entries(SPECS).map(([id, spec]) => ({
    id,
    vcpu: spec.vcpu,
    memoryMiB: spec.memoryMiB,
    estimatedHourlyUsd: EC2_HOURLY_USD[id] ?? null,
}));
