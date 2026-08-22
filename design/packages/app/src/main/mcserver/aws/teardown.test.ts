import { describe, expect, it } from "vitest";

import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { teardownAwsServer } from "./teardown.js";

function out(json: unknown): CommandOutput {
    return { ok: true, exitCode: 0, stdout: JSON.stringify(json), stderr: "", spawnError: null };
}

const OWNED_TAGS = [
    { Key: "worldlens:owner", Value: "worldlens-mcserver" },
    { Key: "worldlens:server-id", Value: "srv-1" },
];

describe("teardownAwsServer", () => {
    it("removes every owned resource in reverse order: address, then instance, then group", async () => {
        const calls: string[][] = [];
        const runner: CommandRunner = async (_command, args) => {
            calls.push([...args]);
            const [service, action] = args;
            if (service === "ec2" && action === "describe-addresses") return out({ Addresses: [{ Tags: OWNED_TAGS }] });
            if (service === "ec2" && action === "release-address") return out({});
            if (service === "ec2" && action === "describe-instances") {
                return out({ Reservations: [{ Instances: [{ State: { Name: "running" }, Tags: OWNED_TAGS }] }] });
            }
            if (service === "ec2" && action === "terminate-instances") return out({});
            if (service === "ec2" && action === "describe-security-groups") return out({ SecurityGroups: [{ Tags: OWNED_TAGS }] });
            if (service === "ec2" && action === "delete-security-group") return out({});
            throw new Error(`unexpected: ${service} ${action}`);
        };
        const result = await teardownAwsServer(
            { serverId: "srv-1", region: "us-east-1", instanceId: "i-1", elasticIpAllocationId: "eipalloc-1", securityGroupId: "sg-1" },
            { runner },
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.complete).toBe(true);
        expect(result.value.steps.map((s) => s.kind)).toEqual(["elastic-ip", "instance", "security-group"]);
        expect(result.value.steps.every((s) => s.status === "removed")).toBe(true);
    });

    it("REFUSES to delete a resource whose tags no longer match this app's ownership - THE GUARD", async () => {
        // This is the check the task asked to be broken on purpose: teardown must read
        // the resource's own tags back from AWS and refuse when they do not name this
        // exact server as owned by WorldLens, rather than trusting the caller's target.
        const calls: string[][] = [];
        const runner: CommandRunner = async (_command, args) => {
            calls.push([...args]);
            const [service, action] = args;
            if (service === "ec2" && action === "describe-instances") {
                // Tagged for a DIFFERENT server id - this instance id was recycled, or the
                // local record is stale. Teardown must not terminate it.
                return out({
                    Reservations: [
                        {
                            Instances: [
                                {
                                    State: { Name: "running" },
                                    Tags: [
                                        { Key: "worldlens:owner", Value: "worldlens-mcserver" },
                                        { Key: "worldlens:server-id", Value: "some-other-server" },
                                    ],
                                },
                            ],
                        },
                    ],
                });
            }
            throw new Error(`should never be called: ${service} ${action}`);
        };
        const result = await teardownAwsServer(
            { serverId: "srv-1", region: "us-east-1", instanceId: "i-not-mine", elasticIpAllocationId: null, securityGroupId: null },
            { runner },
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.complete).toBe(false);
        expect(result.value.steps[0]?.status).toBe("refused");
        expect(calls.some((c) => c[1] === "terminate-instances")).toBe(false);
    });

    it("treats a resource that no longer exists as already-gone, not as an error", async () => {
        const runner: CommandRunner = async (_command, args) => {
            const [service, action] = args;
            if (service === "ec2" && action === "describe-instances") return out({ Reservations: [] });
            throw new Error(`unexpected: ${service} ${action}`);
        };
        const result = await teardownAwsServer(
            { serverId: "srv-1", region: "us-east-1", instanceId: "i-gone", elasticIpAllocationId: null, securityGroupId: null },
            { runner },
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.steps[0]?.status).toBe("already-gone");
        expect(result.value.complete).toBe(true);
    });
});
