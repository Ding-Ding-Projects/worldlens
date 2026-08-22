import { describe, expect, it } from "vitest";

import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { planAwsServer } from "./plan.js";
import { provisionAwsServer, rollbackCreated } from "./provision.js";
import type { AwsProvisionStep, AwsServerSpec } from "./types.js";

function out(json: unknown): CommandOutput {
    return { ok: true, exitCode: 0, stdout: JSON.stringify(json), stderr: "", spawnError: null };
}

function failure(stderr: string): CommandOutput {
    return { ok: false, exitCode: 1, stdout: "", stderr, spawnError: null };
}

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

/**
 * A fake `aws` CLI that answers empty for every "does this already exist" lookup and
 * succeeds for every creation call - i.e. a from-nothing provisioning run.
 */
function freshCliRunner(calls: string[][] = []): CommandRunner {
    return async (_command, args) => {
        calls.push([...args]);
        const [service, action] = args;
        if (service === "ec2" && action === "describe-security-groups") return out({ SecurityGroups: [] });
        if (service === "ec2" && action === "create-security-group") return out({ GroupId: "sg-created" });
        if (service === "ec2" && action === "authorize-security-group-ingress") return out({});
        if (service === "ec2" && action === "describe-key-pairs") return out({ KeyPairs: [{ KeyName: "my-key" }] });
        if (service === "ec2" && action === "describe-instances") return out({ Reservations: [] });
        if (service === "ec2" && action === "run-instances") return out({ Instances: [{ InstanceId: "i-created" }] });
        return failure(`unhandled: ${service} ${action}`);
    };
}

describe("provisionAwsServer", () => {
    it("creates every resource in the plan, in order, when nothing exists yet", async () => {
        const calls: string[][] = [];
        const plan = planAwsServer(spec());
        const result = await provisionAwsServer(plan, { runner: freshCliRunner(calls) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.steps.map((s) => s.kind)).toEqual(["security-group", "key-pair-check", "instance"]);
        expect(result.value.steps.map((s) => s.status)).toEqual(["created", "found-existing", "created"]);
        expect(result.value.instanceId).toBe("i-created");
        expect(result.value.securityGroupId).toBe("sg-created");
    });

    it("is idempotent: a retry finds the resources the first run created and duplicates nothing", async () => {
        const runner: CommandRunner = async (_command, args) => {
            const [service, action] = args;
            if (service === "ec2" && action === "describe-security-groups") return out({ SecurityGroups: [{ GroupId: "sg-existing" }] });
            if (service === "ec2" && action === "describe-key-pairs") return out({ KeyPairs: [{ KeyName: "my-key" }] });
            if (service === "ec2" && action === "describe-instances") {
                return out({ Reservations: [{ Instances: [{ InstanceId: "i-existing", PublicIpAddress: "1.2.3.4" }] }] });
            }
            return failure(`unexpected creation call in a retry: ${service} ${action}`);
        };
        const plan = planAwsServer(spec());
        const result = await provisionAwsServer(plan, { runner });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.steps.every((s) => s.status === "found-existing")).toBe(true);
        expect(result.value.instanceId).toBe("i-existing");
        expect(result.value.publicIp).toBe("1.2.3.4");
    });

    it("refuses when the named key pair does not exist, and creates no key of its own", async () => {
        const calls: string[][] = [];
        const runner: CommandRunner = async (_command, args) => {
            calls.push([...args]);
            const [service, action] = args;
            if (service === "ec2" && action === "describe-security-groups") return out({ SecurityGroups: [] });
            if (service === "ec2" && action === "create-security-group") return out({ GroupId: "sg-created" });
            if (service === "ec2" && action === "authorize-security-group-ingress") return out({});
            if (service === "ec2" && action === "describe-key-pairs") return failure("An error occurred (InvalidKeyPair.NotFound)");
            return failure(`unexpected: ${service} ${action}`);
        };
        const plan = planAwsServer(spec());
        const result = await provisionAwsServer(plan, { runner });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toContain("my-key");
        expect(result.failure.message).toContain("was not found");
        // Never asked to create one.
        expect(calls.some((c) => c[1] === "create-key-pair")).toBe(false);
        // And the security group it did create was rolled back.
        expect(result.failure.message).toContain("Rolled back");
        expect(calls.some((c) => c[1] === "delete-security-group")).toBe(true);
    });

    it("rolls back only what this run created when the instance launch fails", async () => {
        const calls: string[][] = [];
        const runner: CommandRunner = async (_command, args) => {
            calls.push([...args]);
            const [service, action] = args;
            if (service === "ec2" && action === "describe-security-groups") return out({ SecurityGroups: [] });
            if (service === "ec2" && action === "create-security-group") return out({ GroupId: "sg-created" });
            if (service === "ec2" && action === "authorize-security-group-ingress") return out({});
            if (service === "ec2" && action === "describe-key-pairs") return out({ KeyPairs: [{ KeyName: "my-key" }] });
            if (service === "ec2" && action === "describe-instances") return out({ Reservations: [] });
            if (service === "ec2" && action === "run-instances") return failure("InsufficientInstanceCapacity");
            if (service === "ec2" && action === "delete-security-group") return out({});
            return failure(`unexpected: ${service} ${action}`);
        };
        const plan = planAwsServer(spec());
        const result = await provisionAwsServer(plan, { runner });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toContain("Rolled back: security-group sg-created");
        expect(calls.some((c) => c[1] === "delete-security-group" && c.includes("sg-created"))).toBe(true);
    });

    it("says plainly what was left behind when a rollback call itself fails", async () => {
        const runner: CommandRunner = async (_command, args) => {
            const [service, action] = args;
            if (service === "ec2" && action === "describe-security-groups") return out({ SecurityGroups: [] });
            if (service === "ec2" && action === "create-security-group") return out({ GroupId: "sg-created" });
            if (service === "ec2" && action === "authorize-security-group-ingress") return out({});
            if (service === "ec2" && action === "describe-key-pairs") return out({ KeyPairs: [{ KeyName: "my-key" }] });
            if (service === "ec2" && action === "describe-instances") return out({ Reservations: [] });
            if (service === "ec2" && action === "run-instances") return failure("InsufficientInstanceCapacity");
            if (service === "ec2" && action === "delete-security-group") return failure("DependencyViolation");
            return failure(`unexpected: ${service} ${action}`);
        };
        const plan = planAwsServer(spec());
        const result = await provisionAwsServer(plan, { runner });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toContain("left behind and needs manual cleanup");
        expect(result.failure.message).toContain("sg-created");
    });

    it("rollbackCreated never touches a step that was found-existing", async () => {
        const calls: string[][] = [];
        const runner: CommandRunner = async (_command, args) => {
            calls.push([...args]);
            return out({});
        };
        const steps: AwsProvisionStep[] = [
            { kind: "security-group", status: "found-existing", resourceId: "sg-old", message: "" },
            { kind: "instance", status: "created", resourceId: "i-new", message: "" },
        ];
        const { rolledBack } = await rollbackCreated({ runner }, "us-east-1", steps);
        expect(rolledBack).toEqual(["instance i-new"]);
        expect(calls.some((c) => c.includes("sg-old"))).toBe(false);
    });
});
