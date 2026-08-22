/**
 * Planning the AWS side of a render, against a fake process runner.
 *
 * The assertion worth reading twice: **every billable resource in the plan carries a cost
 * sentence**. Creating a Fargate compute environment and an S3 bucket costs somebody money
 * for as long as they exist, and the one failure this file exists to prevent is a person
 * finding that out from their bill instead of from the screen that offered to create them.
 *
 * The second: **reconciliation reports and never repairs**. Deleting an "orphan" that was a
 * colleague's costs them their work, and recreating something deliberately removed costs
 * money silently. Both belong to a person, so this returns findings and no verbs.
 */

import { describe, expect, it } from "vitest";
import { awsCliLease } from "./credentialBroker.js";
import {
    MANAGED_TAG_KEY,
    MANAGED_TAG_VALUE,
    planAwsProvisioning,
    reconcileAws,
    resourceNames,
} from "./provisioning.js";
import type { AwsBootstrapMarker } from "./provisioning.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "../cirender/gh.js";

/** A runner where nothing exists yet: every describe/head call is refused. */
function emptyAccountRunner(): ProcessRunner {
    return {
        async run(): Promise<ProcessResult> {
            return { started: true, code: 254, stdout: "", stderr: "Not Found" };
        },
        async runToFile(): Promise<ProcessToFileResult> {
            return { started: true, code: 254, bytes: 0, stderr: "Not Found" };
        },
    };
}

function leaseOver(runner: ProcessRunner) {
    return awsCliLease({
        profile: "render",
        region: "eu-west-2",
        accountId: "123456789012",
        runner,
    });
}

describe("the provisioning plan", () => {
    it("gives every billable resource a real cost sentence", async () => {
        const plan = await planAwsProvisioning({
            lease: leaseOver(emptyAccountRunner()),
            prefix: "worldlens-renders",
        });

        const billable = new Set([
            "s3-bucket",
            "batch-compute-environment",
            "cloudwatch-log-group",
        ]);
        for (const resource of plan.resources) {
            if (billable.has(resource.kind)) {
                expect(resource.cost, `${resource.kind} must state its cost`).toBeTruthy();
                // A real number, not "it depends on usage" - which is what somebody reads
                // right before an unexpected bill.
                expect(resource.cost).toMatch(/\$\d/);
            }
        }

        expect(plan.idleCostSummary).toMatch(/\S/);
        expect(plan.renderCostSummary).toMatch(/\$\d/);
    });

    it("plans every resource a render needs and creates none of them", async () => {
        const runner = emptyAccountRunner();
        const calls: string[][] = [];
        const watching: ProcessRunner = {
            async run(command, args) {
                calls.push([...args]);
                return runner.run(command, args);
            },
            async runToFile(command, args, destination) {
                calls.push([...args]);
                return runner.runToFile(command, args, destination);
            },
        };

        const plan = await planAwsProvisioning({
            lease: leaseOver(watching),
            prefix: "worldlens-renders",
        });

        expect(plan.resources.map((resource) => resource.kind)).toEqual([
            "s3-bucket",
            "iam-execution-role",
            "iam-job-role",
            "cloudwatch-log-group",
            "batch-compute-environment",
            "batch-job-queue",
            "batch-job-definition",
        ]);
        expect(plan.complete).toBe(false);

        // Planning reads and never writes. If this ever fails, something billable is being
        // created before anybody has seen what it costs.
        const written = calls.flat().join(" ");
        expect(written).not.toMatch(/\bcreate-bucket\b|\bcreate-role\b|\bcreate-compute-environment\b/);
        expect(written).not.toMatch(/\bcreate-job-queue\b|\bregister-job-definition\b/);
    });

    it("puts the account id in the bucket name, because bucket names are global", () => {
        const names = resourceNames("worldlens-renders", "123456789012");
        // Without this, the first person to try gets BucketAlreadyExists from somebody
        // else's bucket and reads it as the app being broken.
        expect(names.bucket).toBe("worldlens-renders-123456789012");
        expect(names.jobQueue).toBe("worldlens-renders-queue");
        expect(names.logGroup).toBe("/aws/batch/worldlens-renders");
    });

    it("reshapes a prefix S3 would refuse", () => {
        const names = resourceNames("My Renders!!", null);
        expect(names.bucket).toBe("my-renders-");
        expect(names.bucket).toMatch(/^[a-z0-9-]+$/);
    });

    it("keeps one managed tag that nothing else is treated as ours without", () => {
        expect(MANAGED_TAG_KEY).toBe("worldlens:managed");
        expect(MANAGED_TAG_VALUE).toBe("true");
    });
});

describe("reconciliation", () => {
    const marker: AwsBootstrapMarker = {
        tool: "worldlens",
        version: 1,
        region: "eu-west-2",
        resources: [
            { kind: "s3-bucket", name: "worldlens-123" },
            { kind: "batch-job-queue", name: "worldlens-queue" },
        ],
        preparedAt: "2026-08-21T00:00:00.000Z",
    };

    it("reports a resource that is provisioned but was never recorded", () => {
        const findings = reconcileAws(marker, [
            { kind: "s3-bucket", name: "worldlens-123" },
            { kind: "batch-job-queue", name: "worldlens-queue" },
            { kind: "batch-compute-environment", name: "worldlens-compute" },
        ]);

        expect(findings).toEqual([
            { kind: "batch-compute-environment", name: "worldlens-compute", state: "unrecorded" },
        ]);
    });

    it("reports a resource that was recorded and is gone", () => {
        const findings = reconcileAws(marker, [{ kind: "s3-bucket", name: "worldlens-123" }]);

        expect(findings).toEqual([
            { kind: "batch-job-queue", name: "worldlens-queue", state: "missing" },
        ]);
    });

    it("says nothing when the record and the account agree", () => {
        const findings = reconcileAws(marker, [
            { kind: "s3-bucket", name: "worldlens-123" },
            { kind: "batch-job-queue", name: "worldlens-queue" },
        ]);
        expect(findings).toEqual([]);
    });

    it("treats everything as unrecorded when there is no marker at all", () => {
        const findings = reconcileAws(null, [{ kind: "s3-bucket", name: "somebody-elses" }]);
        // Not "delete it". A bucket this app has no record of may well be somebody else's,
        // and the honest report is what lets a person decide.
        expect(findings).toEqual([
            { kind: "s3-bucket", name: "somebody-elses", state: "unrecorded" },
        ]);
    });
});
