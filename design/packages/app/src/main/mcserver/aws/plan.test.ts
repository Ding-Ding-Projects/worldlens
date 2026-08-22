import { describe, expect, it } from "vitest";

import { planAwsServer } from "./plan.js";
import type { AwsServerSpec } from "./types.js";

function spec(overrides: Partial<AwsServerSpec> = {}): AwsServerSpec {
    return {
        serverId: "srv-1",
        region: "us-east-1",
        instanceType: "t3.medium",
        diskGiB: 20,
        staticAddress: false,
        rules: [{ port: 25565, protocol: "tcp", cidr: "0.0.0.0/0", description: "Minecraft" }],
        amiId: "ami-0123456789abcdef0",
        keyPairName: "my-key",
        ...overrides,
    };
}

describe("planAwsServer", () => {
    it("never calls anything - it is pure", () => {
        // No runner is passed at all; if this function reached for a network call the
        // types would not even compile a call site for it.
        const plan = planAwsServer(spec());
        expect(plan.spec.serverId).toBe("srv-1");
    });

    it("orders the security group before the instance, and the instance before the address", () => {
        const plan = planAwsServer(spec({ staticAddress: true }));
        const kinds = plan.resources.map((r) => r.kind);
        expect(kinds).toEqual(["security-group", "key-pair-check", "instance", "elastic-ip", "elastic-ip-association"]);
    });

    it("omits the elastic IP steps when staticAddress is false", () => {
        const plan = planAwsServer(spec({ staticAddress: false }));
        expect(plan.resources.map((r) => r.kind)).toEqual(["security-group", "key-pair-check", "instance"]);
    });

    it("prices a known instance type as its hourly rate times 730 hours, plus the disk", () => {
        const plan = planAwsServer(spec({ instanceType: "t3.medium", diskGiB: 20 }));
        const instanceCost = plan.resources.find((r) => r.kind === "instance")?.estimatedMonthlyUsd;
        // 0.0416 * 730 = 30.368 -> 30.37, plus 20 * 0.08 = 1.60 -> 31.97
        expect(instanceCost).toBeCloseTo(31.97, 2);
        expect(plan.hasUnknownCost).toBe(false);
    });

    it("reports an unknown instance type's cost as null and flags the plan", () => {
        const plan = planAwsServer(spec({ instanceType: "z9.mystery" }));
        const instance = plan.resources.find((r) => r.kind === "instance");
        expect(instance?.estimatedMonthlyUsd).toBeNull();
        expect(plan.hasUnknownCost).toBe(true);
    });

    it("sums only the known costs into the total, and rounds to cents", () => {
        const plan = planAwsServer(spec({ instanceType: "t3.micro", diskGiB: 8, staticAddress: true }));
        // 0.0104 * 730 = 7.592 -> 7.59, plus 8 * 0.08 = 0.64 -> 8.23; elastic ip pieces are 0.
        expect(plan.estimatedMonthlyUsd).toBeCloseTo(8.23, 2);
    });

    it("names every rule's port and protocol in the security group summary", () => {
        const plan = planAwsServer(
            spec({
                rules: [
                    { port: 25565, protocol: "tcp", cidr: "0.0.0.0/0", description: "Minecraft" },
                    { port: 25575, protocol: "tcp", cidr: "127.0.0.1/32", description: "RCON" },
                ],
            }),
        );
        const sg = plan.resources.find((r) => r.kind === "security-group");
        expect(sg?.summary).toContain("25565/tcp");
        expect(sg?.summary).toContain("25575/tcp");
    });
});
