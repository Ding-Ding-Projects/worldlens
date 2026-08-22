/**
 * The AWS lease, against a fake process runner.
 *
 * The assertion worth reading twice is the structural one: **the lease exposes no method
 * that returns a credential**. Not a token, not an access key, not an environment block
 * containing either. That is the whole promise of this file, and it is the kind of promise
 * that gets broken by a well-meaning convenience method a year from now, so it is asserted
 * rather than merely documented.
 *
 * The second is that an `aws` child never inherits an ambient key. A key in the parent
 * environment silently outranks the profile a person chose, so the render would run as an
 * identity nobody selected while the interface named a different one.
 */

import { describe, expect, it } from "vitest";
import {
    AWS_INHERITED_CREDENTIAL_NAMES,
    AwsCredentialError,
    awsCliLease,
    openAwsLease,
} from "./credentialBroker.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "../cirender/gh.js";

interface Call {
    readonly args: readonly string[];
    readonly omittedEnvironment: readonly string[];
}

function fakeRunner(
    answer: (args: readonly string[]) => Partial<ProcessResult>,
): ProcessRunner & { calls: Call[] } {
    const calls: Call[] = [];
    return {
        calls,
        async run(_command, args, options): Promise<ProcessResult> {
            calls.push({ args, omittedEnvironment: options?.omitEnvironmentVariables ?? [] });
            return { started: true, code: 0, stdout: "", stderr: "", ...answer(args) };
        },
        async runToFile(_command, args, _destination, options): Promise<ProcessToFileResult> {
            calls.push({ args, omittedEnvironment: options?.omitEnvironmentVariables ?? [] });
            return { started: true, code: 0, bytes: 0, stderr: "" };
        },
    };
}

describe("the AWS lease", () => {
    it("exposes no way at all to read a credential", () => {
        const lease = awsCliLease({
            profile: "render",
            region: "eu-west-2",
            runner: fakeRunner(() => ({})),
        });

        // Structural, not a spot check. Anything shaped like a credential accessor is
        // refused here rather than in review, because review is where this slips through.
        const forbidden = [
            "token",
            "credentials",
            "credential",
            "accessKey",
            "accessKeyId",
            "secret",
            "secretAccessKey",
            "sessionToken",
            "env",
            "environment",
        ];
        for (const name of forbidden) {
            expect(Object.hasOwn(lease, name), `lease must not expose ${name}`).toBe(false);
        }

        // And nothing the lease does expose serialises to something secret-shaped.
        expect(JSON.stringify(lease)).not.toMatch(/AKIA|aws_secret|SessionToken/i);
    });

    it("never lets an aws child inherit an ambient key", async () => {
        const runner = fakeRunner(() => ({ stdout: "{}" }));
        const lease = awsCliLease({ profile: "render", region: "eu-west-2", runner });

        await lease.run(["s3", "ls"]);
        await lease.json(["sts", "get-caller-identity"]);
        await lease.runToFile(["s3", "cp", "s3://b/k", "-"], "out.bin");

        expect(runner.calls).toHaveLength(3);
        for (const call of runner.calls) {
            for (const name of AWS_INHERITED_CREDENTIAL_NAMES) {
                expect(call.omittedEnvironment).toContain(name);
            }
        }
    });

    it("applies the chosen profile and region to every call", async () => {
        const runner = fakeRunner(() => ({ stdout: "{}" }));
        const lease = awsCliLease({ profile: "render", region: "eu-west-2", runner });

        await lease.run(["s3", "ls"]);

        expect(runner.calls[0]?.args.slice(0, 4)).toEqual([
            "--profile",
            "render",
            "--region",
            "eu-west-2",
        ]);
    });

    it("reports a missing CLI as missing rather than as a refusal", async () => {
        const runner: ProcessRunner = {
            async run() {
                return { started: false, code: null, stdout: "", stderr: "" };
            },
            async runToFile() {
                return { started: false, code: null, bytes: 0, stderr: "" };
            },
        };

        await expect(openAwsLease({ profile: "render", runner })).rejects.toMatchObject({
            code: "cli-missing",
        });
    });

    it("reports an expired SSO session as signed out, not as a broken install", async () => {
        const runner = fakeRunner((args) => {
            if (args.includes("--version")) {
                return { stdout: "aws-cli/2.31.0 Python/3.13.0" };
            }
            if (args.includes("get-caller-identity")) {
                return { code: 255, stderr: "Error loading SSO Token: token has expired" };
            }
            return {};
        });

        await expect(openAwsLease({ profile: "render", runner })).rejects.toMatchObject({
            code: "signed-out",
        });
    });

    it("refuses to guess a region the profile does not configure", async () => {
        const runner = fakeRunner((args) => {
            if (args.includes("--version")) {
                return { stdout: "aws-cli/2.31.0" };
            }
            if (args.includes("get-caller-identity")) {
                return { stdout: JSON.stringify({ Account: "123456789012" }) };
            }
            // `configure get region` exits non-zero when the key is simply unset.
            return { code: 1 };
        });

        const error = await openAwsLease({ profile: "render", runner }).catch(
            (thrown: unknown) => thrown,
        );
        expect(error).toBeInstanceOf(AwsCredentialError);
        expect((error as AwsCredentialError).code).toBe("no-region");
    });
});
