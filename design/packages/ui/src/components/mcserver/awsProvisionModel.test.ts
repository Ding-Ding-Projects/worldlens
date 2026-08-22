import { describe, expect, it } from "vitest";
import {
    awsFormBlockReason,
    awsInstanceStorageKey,
    buildAwsSpec,
    clearTrackedAwsInstance,
    defaultAwsRules,
    formatHourlyUsd,
    formatMonthlyUsd,
    instanceTypeSummary,
    planHasUnknownCost,
    readTrackedAwsInstance,
    trackedInstanceFromResult,
    writeTrackedAwsInstance,
    type AwsFormState,
    type AwsProvisionPlan,
} from "./awsProvisionModel.js";

function form(overrides: Partial<AwsFormState> = {}): AwsFormState {
    return {
        region: "us-east-1",
        instanceType: "t3.small",
        diskGiB: 10,
        staticAddress: false,
        keyPairName: "my-key",
        amiId: "ami-0abc",
        ...overrides,
    };
}

describe("defaultAwsRules", () => {
    it("opens only the game port, never RCON", () => {
        const rules = defaultAwsRules();
        expect(rules).toHaveLength(1);
        expect(rules[0]).toMatchObject({ port: 25565, protocol: "tcp", cidr: "0.0.0.0/0" });
    });
});

describe("awsFormBlockReason", () => {
    it("is null when every field is filled and valid", () => {
        expect(awsFormBlockReason(form())).toBeNull();
    });
    it("names region as the reason when missing", () => {
        expect(awsFormBlockReason(form({ region: null }))).toBe("region-missing");
    });
    it("names instance type as the reason when missing", () => {
        expect(awsFormBlockReason(form({ instanceType: null }))).toBe("instance-type-missing");
    });
    it("rejects a disk size of zero", () => {
        expect(awsFormBlockReason(form({ diskGiB: 0 }))).toBe("disk-invalid");
    });
    it("rejects a disk size above 16384 GiB", () => {
        expect(awsFormBlockReason(form({ diskGiB: 20_000 }))).toBe("disk-invalid");
    });
    it("rejects a blank key pair name", () => {
        expect(awsFormBlockReason(form({ keyPairName: "   " }))).toBe("key-pair-missing");
    });
    it("rejects a blank AMI id", () => {
        expect(awsFormBlockReason(form({ amiId: "" }))).toBe("ami-missing");
    });
});

describe("buildAwsSpec", () => {
    it("builds a spec once the form is valid", () => {
        const spec = buildAwsSpec("srv-1", form(), defaultAwsRules());
        expect(spec).toMatchObject({ serverId: "srv-1", region: "us-east-1", instanceType: "t3.small", keyPairName: "my-key", amiId: "ami-0abc" });
    });
    it("returns null when the form is not ready", () => {
        expect(buildAwsSpec("srv-1", form({ region: null }), defaultAwsRules())).toBeNull();
    });
    it("trims the key pair name and AMI id", () => {
        const spec = buildAwsSpec("srv-1", form({ keyPairName: "  my-key  ", amiId: "  ami-0abc  " }), defaultAwsRules());
        expect(spec?.keyPairName).toBe("my-key");
        expect(spec?.amiId).toBe("ami-0abc");
    });
});

describe("money formatting", () => {
    it("formats a known monthly cost", () => {
        expect(formatMonthlyUsd(4.16)).toBe("$4.16/mo");
    });
    it("never prints 0 or blank for an unknown cost - says so plainly", () => {
        expect(formatMonthlyUsd(null)).toBe("unknown");
    });
    it("formats a known hourly cost", () => {
        expect(formatHourlyUsd(0.0104)).toBe("$0.0104/hr");
    });
    it("says unknown for an hourly cost with no table entry", () => {
        expect(formatHourlyUsd(null)).toBe("unknown");
    });
});

describe("instanceTypeSummary", () => {
    it("shows vCPU, memory, and the hourly price together", () => {
        expect(instanceTypeSummary({ id: "t3.small", vcpu: 2, memoryMiB: 2048, estimatedHourlyUsd: 0.0208 })).toBe("2 vCPU, 2 GiB - $0.0208/hr");
    });
    it("shows unknown rather than a guess when the price is not in the table", () => {
        expect(instanceTypeSummary({ id: "z1.huge", vcpu: 8, memoryMiB: 32_768, estimatedHourlyUsd: null })).toContain("unknown");
    });
});

describe("planHasUnknownCost", () => {
    function plan(overrides: Partial<AwsProvisionPlan> = {}): AwsProvisionPlan {
        return {
            spec: { serverId: "s", region: "us-east-1", instanceType: "t3.small", diskGiB: 10, staticAddress: false, rules: [], amiId: "a", keyPairName: "k" },
            resources: [],
            estimatedMonthlyUsd: 0,
            hasUnknownCost: false,
            ...overrides,
        };
    }
    it("is false when the plan says so and no resource is null", () => {
        expect(planHasUnknownCost(plan({ resources: [{ kind: "instance", summary: "x", estimatedMonthlyUsd: 5 }] }))).toBe(false);
    });
    it("is true when a resource's cost is null even if the flag was not set", () => {
        expect(planHasUnknownCost(plan({ resources: [{ kind: "instance", summary: "x", estimatedMonthlyUsd: null }] }))).toBe(true);
    });
});

function fakeStorage(): Storage {
    const backing = new Map<string, string>();
    return {
        getItem: (key: string) => backing.get(key) ?? null,
        setItem: (key: string, value: string) => void backing.set(key, value),
        removeItem: (key: string) => void backing.delete(key),
        clear: () => backing.clear(),
        key: () => null,
        length: 0,
    } as unknown as Storage;
}

describe("tracked-instance persistence", () => {
    it("round-trips through storage", () => {
        const storage = fakeStorage();
        const record = trackedInstanceFromResult("srv-1", "us-east-1", true, {
            steps: [],
            instanceId: "i-123",
            securityGroupId: "sg-123",
            publicIp: "1.2.3.4",
            elasticIpAllocationId: "eipalloc-1",
        });
        writeTrackedAwsInstance(record, storage);
        expect(readTrackedAwsInstance("srv-1", storage)).toEqual(record);
    });

    it("reads null when nothing is stored", () => {
        expect(readTrackedAwsInstance("srv-1", fakeStorage())).toBeNull();
    });

    it("tolerates garbage rather than throwing", () => {
        const storage = fakeStorage();
        storage.setItem(awsInstanceStorageKey("srv-1"), "{not json");
        expect(readTrackedAwsInstance("srv-1", storage)).toBeNull();
    });

    it("clear removes the record", () => {
        const storage = fakeStorage();
        const record = trackedInstanceFromResult("srv-1", "us-east-1", false, {
            steps: [],
            instanceId: "i-1",
            securityGroupId: "sg-1",
            publicIp: "",
            elasticIpAllocationId: null,
        });
        writeTrackedAwsInstance(record, storage);
        clearTrackedAwsInstance("srv-1", storage);
        expect(readTrackedAwsInstance("srv-1", storage)).toBeNull();
    });
});
