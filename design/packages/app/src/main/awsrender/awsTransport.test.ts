/**
 * The AWS route, against a fake process runner. No AWS account, no `aws` on the machine.
 *
 * Two assertions here are worth reading twice.
 *
 * **RUNNABLE is queued, not running.** A Batch job can sit RUNNABLE for minutes while
 * Fargate finds capacity. Reporting that as running makes somebody watch a progress
 * display that is telling them something false, and then conclude the render is hung.
 *
 * **An artifact's digest is null, not an ETag.** S3's ETag is a content digest only for a
 * single-part object; for a multipart one it is a digest of digests. Passing it off as a
 * SHA-256 would fail verification on exactly the large worlds this route exists for, so
 * the honest answer is that nothing was verified.
 */

import { describe, expect, it } from "vitest";
import { batchConclusion, batchStatus, logStreamOf } from "./batchJob.js";
import { awsCliTransport, sanitiseJobName, WrongProviderError } from "./awsTransport.js";
import { awsCliLease } from "./credentialBroker.js";
import type { CiJobRef } from "../cirender/runTransport.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "../cirender/gh.js";

function runnerAnswering(
    answer: (args: readonly string[]) => Partial<ProcessResult>,
): ProcessRunner & { calls: string[][] } {
    const calls: string[][] = [];
    return {
        calls,
        async run(_command, args): Promise<ProcessResult> {
            calls.push([...args]);
            return { started: true, code: 0, stdout: "{}", stderr: "", ...answer(args) };
        },
        async runToFile(_command, args): Promise<ProcessToFileResult> {
            calls.push([...args]);
            return { started: true, code: 0, bytes: 0, stderr: "" };
        },
    };
}

function transportOver(runner: ProcessRunner) {
    const lease = awsCliLease({ profile: "render", region: "eu-west-2", runner });
    return awsCliTransport({
        lease,
        binding: {
            jobQueue: "worldlens-queue",
            jobDefinition: "worldlens-render:3",
            bucket: "worldlens-worlds",
            outputPrefix: "renders/abc/out/",
        },
    });
}

const awsJob: CiJobRef = { provider: "aws", jobId: "job-1", jobQueue: "worldlens-queue" };

describe("batch status mapping", () => {
    it("calls RUNNABLE queued rather than running", () => {
        expect(batchStatus("SUBMITTED")).toBe("queued");
        expect(batchStatus("PENDING")).toBe("queued");
        expect(batchStatus("RUNNABLE")).toBe("queued");
        expect(batchStatus("STARTING")).toBe("queued");
        expect(batchStatus("RUNNING")).toBe("running");
        expect(batchStatus("SUCCEEDED")).toBe("completed");
        expect(batchStatus("FAILED")).toBe("completed");
    });

    it("treats a state it does not recognise as still going, never as finished", () => {
        // Reporting an unknown state as completed would end the poll loop and announce a
        // render that is still running as done - the one wrong answer that looks right.
        expect(batchStatus("SOMETHING_NEW")).toBe("running");
        expect(batchStatus("")).toBe("running");
    });

    it("separates a cancellation and a timeout from an ordinary failure", () => {
        expect(batchConclusion("SUCCEEDED", null)).toBe("success");
        expect(batchConclusion("FAILED", "Job cancelled by user")).toBe("cancelled");
        expect(batchConclusion("FAILED", "Job attempt duration exceeded")).toBe("timed-out");
        expect(batchConclusion("FAILED", "Essential container in task exited")).toBe("failure");
        expect(batchConclusion("RUNNING", null)).toBeNull();
    });
});

describe("log stream resolution", () => {
    it("prefers the most recent attempt over an earlier one", () => {
        const stream = logStreamOf({
            attempts: [
                { container: { logStreamName: "first-try" } },
                { container: { logStreamName: "second-try" } },
            ],
        });
        // A retried job's interesting log is the latest attempt: that is the failure a
        // person is looking at, not the one that was already retried past.
        expect(stream).toBe("second-try");
    });

    it("answers null rather than inventing a stream name", () => {
        expect(logStreamOf({})).toBeNull();
    });
});

describe("the AWS transport", () => {
    it("submits a single-shard render as a plain job, never an array of one", async () => {
        const runner = runnerAnswering((args) =>
            args.includes("submit-job") ? { stdout: JSON.stringify({ jobId: "job-9" }) } : {},
        );
        const transport = transportOver(runner);

        const ref = await transport.submitJob({ inputs: { MAP: "overworld" }, units: 1, label: "x" });

        expect(ref).toMatchObject({ provider: "aws", jobId: "job-9" });
        const submit = runner.calls.find((call) => call.includes("submit-job"));
        // Batch refuses an array of size 1, so a single-shard render must not ask for one.
        expect(submit).not.toContain("--array-properties");
    });

    it("submits a sharded render as an array job", async () => {
        const runner = runnerAnswering((args) =>
            args.includes("submit-job") ? { stdout: JSON.stringify({ jobId: "job-9" }) } : {},
        );
        const transport = transportOver(runner);

        await transport.submitJob({ inputs: {}, units: 8, label: "x" });

        const submit = runner.calls.find((call) => call.includes("submit-job")) ?? [];
        const index = submit.indexOf("--array-properties");
        expect(index).toBeGreaterThan(-1);
        expect(JSON.parse(submit[index + 1] ?? "{}")).toEqual({ size: 8 });
    });

    it("reports an artifact digest as null rather than passing off an ETag", async () => {
        const runner = runnerAnswering((args) =>
            args.includes("list-objects-v2")
                ? {
                      stdout: JSON.stringify({
                          Contents: [{ Key: "renders/abc/out/map.zip", Size: 4096 }],
                      }),
                  }
                : {},
        );
        const transport = transportOver(runner);

        const artifacts = await transport.listArtifacts(awsJob);

        expect(artifacts).toHaveLength(1);
        expect(artifacts[0]?.name).toBe("map.zip");
        expect(artifacts[0]?.digest).toBeNull();
    });

    it("refuses a job reference minted by the GitHub route", async () => {
        const transport = transportOver(runnerAnswering(() => ({})));
        const ghJob: CiJobRef = { provider: "gh", owner: "o", repo: "r", runId: 1 };

        await expect(transport.readJob(ghJob)).rejects.toBeInstanceOf(WrongProviderError);
    });

    it("says plainly when Batch has forgotten a job rather than reporting it failed", async () => {
        const runner = runnerAnswering((args) =>
            args.includes("describe-jobs") ? { stdout: JSON.stringify({ jobs: [] }) } : {},
        );
        const transport = transportOver(runner);

        await expect(transport.readJob(awsJob)).rejects.toThrow(/no longer knows about job/);
    });

    it("stops a job whether or not it had started", async () => {
        const runner = runnerAnswering(() => ({}));
        const transport = transportOver(runner);

        await transport.cancelJob?.(awsJob, "the person asked");

        // cancel-job only works before a job starts and terminate-job only after, so a
        // "stop" that sent one of them would silently do nothing half the time.
        expect(runner.calls.some((call) => call.includes("cancel-job"))).toBe(true);
        expect(runner.calls.some((call) => call.includes("terminate-job"))).toBe(true);
    });
});

describe("job names", () => {
    it("reshapes an ordinary world name Batch would refuse", () => {
        expect(sanitiseJobName("My World (2024)")).toBe("My-World-2024");
        expect(sanitiseJobName("...")).toBe("worldlens-render");
        expect(sanitiseJobName("a".repeat(200))).toHaveLength(128);
    });
});
