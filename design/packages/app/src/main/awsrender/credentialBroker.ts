/**
 * One AWS credential lease, held in the main process and never handed out.
 *
 * The sibling of `ghcli/credentialBroker.ts`, and it keeps that file's central promise:
 * **a lease is a handle, not a credential**. Nothing here returns an access key id, a
 * secret access key, a session token, or an SSO token; there is no method that could.
 * Callers ask the lease to *do* something, and the `aws` CLI - which owns the credential
 * already - does it.
 *
 * That is why the lease crosses no IPC boundary and never becomes renderer state. The
 * renderer picks a profile *by name*, which is not a secret, and every call that needs
 * the credential happens here.
 */
import { nodeProcessRunner } from "../cirender/gh.js";
import type { ProcessResult, ProcessRunOptions, ProcessToFileResult } from "../cirender/gh.js";
import type { ProcessRunner } from "../cirender/gh.js";
import { AWS_COMMAND, probeAws } from "./awsCli.js";
import type { AwsStatus } from "./awsCli.js";

/** Why an AWS call could not be made, in codes a surface maps to its own copy. */
export type AwsCredentialErrorCode =
    | "cli-missing"
    | "signed-out"
    | "no-profile"
    | "no-region"
    | "refused";

export class AwsCredentialError extends Error {
    readonly code: AwsCredentialErrorCode;
    /** True when the surface should offer its AWS sign-in recovery action. */
    readonly needsSignIn: boolean;

    constructor(
        code: AwsCredentialErrorCode,
        message: string,
        needsSignIn = true,
        cause?: unknown,
    ) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = "AwsCredentialError";
        this.code = code;
        this.needsSignIn = needsSignIn;
    }
}

/**
 * A handle onto one configured AWS profile.
 *
 * Deliberately has no `token()`, no `credentials()`, and no `env()`. Adding one would be
 * the single change that breaks the guarantee this whole file exists to make.
 */
export interface AwsCliAccountLease {
    /** Stable id for this lease. The profile name, which is not a secret. */
    readonly profile: string;
    /** The region every call made through this lease runs in. */
    readonly region: string;
    /** The account id AWS resolved, or null when it was never established. */
    readonly accountId: string | null;
    /** One phrase naming this credential, for a message a person has to act on. */
    readonly describe: string;

    /** Runs one `aws` invocation with the profile and region already applied. */
    run(args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult>;
    /** Streams one `aws` invocation into a file. For an artifact, which is binary. */
    runToFile(
        args: readonly string[],
        destination: string,
        options?: ProcessRunOptions,
    ): Promise<ProcessToFileResult>;
    /**
     * Runs one `aws` invocation and parses its JSON output.
     *
     * Throws {@link AwsCredentialError} when the call was refused, so callers get the
     * coded reason rather than having to pattern-match on stderr themselves.
     */
    json<T>(args: readonly string[], options?: ProcessRunOptions): Promise<T>;
}

export interface AwsLeaseOptions {
    readonly profile: string;
    readonly region: string;
    readonly accountId?: string | null | undefined;
    readonly runner?: ProcessRunner;
}

/**
 * Environment names an `aws` child must not inherit.
 *
 * A key sitting in the parent environment would silently win over the profile the person
 * chose, so a render would run as an identity nobody selected and the surface would name
 * the wrong one. Dropping them makes the profile the single source of truth.
 */
export const AWS_INHERITED_CREDENTIAL_NAMES: readonly string[] = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_SECURITY_TOKEN",
    "AWS_PROFILE",
    "AWS_DEFAULT_PROFILE",
    "AWS_REGION",
    "AWS_DEFAULT_REGION",
];

/** Builds a lease over one profile. Does not verify it; use {@link openAwsLease} for that. */
export function awsCliLease(options: AwsLeaseOptions): AwsCliAccountLease {
    const runner = options.runner ?? nodeProcessRunner();
    const { profile, region } = options;
    const base = ["--profile", profile, "--region", region];

    const withEnvironmentBoundary = (given: ProcessRunOptions | undefined): ProcessRunOptions => ({
        ...given,
        omitEnvironmentVariables: [
            ...AWS_INHERITED_CREDENTIAL_NAMES,
            ...(given?.omitEnvironmentVariables ?? []),
        ],
    });

    return {
        profile,
        region,
        accountId: options.accountId ?? null,
        describe: options.accountId
            ? `AWS profile ${profile} (account ${options.accountId}, ${region})`
            : `AWS profile ${profile} (${region})`,

        run(args, runOptions) {
            return runner.run(AWS_COMMAND, [...base, ...args], withEnvironmentBoundary(runOptions));
        },

        runToFile(args, destination, runOptions) {
            return runner.runToFile(
                AWS_COMMAND,
                [...base, ...args],
                destination,
                withEnvironmentBoundary(runOptions),
            );
        },

        async json<T>(args: readonly string[], runOptions?: ProcessRunOptions): Promise<T> {
            const result = await runner.run(
                AWS_COMMAND,
                [...base, ...args, "--output", "json"],
                withEnvironmentBoundary(runOptions),
            );
            if (!result.started) {
                throw new AwsCredentialError(
                    "cli-missing",
                    "The AWS CLI is not installed, or not on PATH.",
                );
            }
            if (result.code !== 0) {
                throw refusalFrom(result, profile);
            }
            const text = result.stdout.trim();
            if (text.length === 0) {
                // Several AWS commands legitimately print nothing on success. An empty
                // object is the honest reading of that; throwing would turn a successful
                // call into a failure.
                return {} as T;
            }
            try {
                return JSON.parse(text) as T;
            } catch (error) {
                throw new AwsCredentialError(
                    "refused",
                    "The AWS CLI returned output that could not be read as JSON.",
                    false,
                    error,
                );
            }
        },
    };
}

/**
 * Verifies a profile and returns a lease over it, or explains exactly why it cannot.
 *
 * The verification is a real `sts get-caller-identity` call. A profile that merely exists
 * in the config file proves nothing: it can name a region, look complete, and be signed
 * out. Only a call AWS accepts establishes that this will work.
 */
export async function openAwsLease(options: {
    readonly profile: string;
    /** Overrides the profile region. Required when the profile configures none. */
    readonly region?: string | undefined;
    readonly runner?: ProcessRunner;
    readonly signal?: AbortSignal | undefined;
}): Promise<AwsCliAccountLease> {
    const runner = options.runner ?? nodeProcessRunner();
    const status: AwsStatus = await probeAws({
        runner,
        signal: options.signal,
        profile: options.profile,
    });

    if (status.availability === "not-installed") {
        throw new AwsCredentialError("cli-missing", status.detail);
    }
    if (status.availability === "signed-out") {
        throw new AwsCredentialError("signed-out", status.detail);
    }

    const region = options.region ?? status.region;
    if (!region) {
        throw new AwsCredentialError(
            "no-region",
            `AWS profile "${options.profile}" configures no region, and none was chosen. ` +
                `Set one with: aws configure set region <region> --profile ${options.profile}`,
            false,
        );
    }

    return awsCliLease({
        profile: options.profile,
        region,
        accountId: status.accountId,
        runner,
    });
}

function refusalFrom(result: ProcessResult, profile: string): AwsCredentialError {
    const stderr = result.stderr.toLowerCase();
    if (stderr.includes("token has expired") || stderr.includes("sso session")) {
        return new AwsCredentialError(
            "signed-out",
            `The AWS SSO session for profile "${profile}" has expired. Refresh it and try again.`,
        );
    }
    if (stderr.includes("unable to locate credentials")) {
        return new AwsCredentialError(
            "no-profile",
            `No credentials are configured for AWS profile "${profile}".`,
        );
    }
    // Everything else is AWS declining a specific call - a missing permission, a name
    // already taken, a resource that is not there. Carry the CLI's own sentence: it names
    // the operation and the reason far better than a rewrite of it would.
    const detail = result.stderr.trim() || result.stdout.trim();
    return new AwsCredentialError(
        "refused",
        detail.length > 0 ? detail : "AWS refused the request and gave no reason.",
        false,
    );
}
