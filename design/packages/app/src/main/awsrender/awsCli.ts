/**
 * Finding the `aws` CLI, and saying honestly what it is.
 *
 * The sibling of `cirender/gh.ts`, and it exists for the same reason that file does: the
 * interesting states are "not installed" and "installed but signed out", and neither can
 * be produced on a machine where it is working. Everything here runs through the injected
 * {@link ProcessRunner}, so every test in this folder passes with no `aws` on the machine
 * and no AWS account anywhere.
 *
 * **No credential ever enters this process.** The CLI holds the profile, the SSO session
 * and the keys; this app runs it and reads what it prints. There is deliberately no path
 * here that returns an access key, a secret, or a session token, because the moment one
 * exists somebody will log it.
 */
import { nodeProcessRunner } from "../cirender/gh.js";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "../cirender/gh.js";

export const AWS_COMMAND = "aws";
/** What a person types to sign in. Quoted in copy; never run on their behalf unasked. */
export const AWS_LOGIN_COMMAND = "aws configure sso";
export const AWS_CONFIGURE_COMMAND = "aws configure";

/**
 * What this machine can actually do with AWS right now.
 *
 * Three states rather than a boolean, for the same reason the Docker probe in
 * `runtime/docker.ts` has five: "no" is not one condition, and the recovery for each of
 * these is a completely different sentence.
 */
export type AwsAvailability = "not-installed" | "signed-out" | "ready";

/** The result of asking this machine about AWS, with nothing guessed. */
export interface AwsStatus {
    readonly availability: AwsAvailability;
    /** The CLI version string when it ran at all, otherwise null. Never invented. */
    readonly version: string | null;
    /**
     * The account id the active profile resolves to, or null when nothing resolved it.
     *
     * An account id is not a secret - it appears in every ARN the console shows - but it
     * is also not guessed. Null means "not established", never "none".
     */
    readonly accountId: string | null;
    /** The profile in play, when one is selected. */
    readonly profile: string | null;
    /** The region the profile resolves to, or null when the profile sets none. */
    readonly region: string | null;
    /** One sentence a person can act on. Empty when there is nothing to act on. */
    readonly detail: string;
}

export interface AwsProbeOptions {
    readonly runner?: ProcessRunner;
    readonly signal?: AbortSignal | undefined;
    /** Probe this profile rather than whichever one the environment selects. */
    readonly profile?: string | undefined;
}

function profileArgs(profile: string | undefined): readonly string[] {
    return profile ? ["--profile", profile] : [];
}

/** Reads the CLI version, or null when the executable is not there at all. */
export async function readAwsVersion(options: AwsProbeOptions = {}): Promise<string | null> {
    const runner = options.runner ?? nodeProcessRunner();
    const result = await runner.run(AWS_COMMAND, ["--version"], { signal: options.signal });
    if (!result.started) {
        return null;
    }
    // The CLI prints its version banner on stdout on v2 and stderr on some builds. Read
    // both rather than picking one and reporting a working install as missing.
    const text = `${result.stdout} ${result.stderr}`.trim();
    const match = /aws-cli\/(\S+)/.exec(text);
    return match?.[1] ?? (text.length > 0 ? text.split(/\s+/)[0] ?? null : null);
}

/**
 * The one call that establishes whether AWS will actually do anything for us.
 *
 * `sts get-caller-identity` is the cheapest call that proves a credential resolves *and*
 * is accepted by AWS. A profile can exist in the config file, name a region, and still be
 * signed out; only a real call distinguishes those, which is why the config file is never
 * read as evidence of being signed in.
 */
export async function probeAws(options: AwsProbeOptions = {}): Promise<AwsStatus> {
    const runner = options.runner ?? nodeProcessRunner();
    const version = await readAwsVersion({ ...options, runner });
    if (version === null) {
        return {
            availability: "not-installed",
            version: null,
            accountId: null,
            profile: options.profile ?? null,
            region: null,
            detail: `The AWS CLI is not installed, or not on PATH. Install it, then sign in with ${AWS_LOGIN_COMMAND}.`,
        };
    }

    const identity = await runner.run(
        AWS_COMMAND,
        ["sts", "get-caller-identity", "--output", "json", ...profileArgs(options.profile)],
        { signal: options.signal },
    );

    if (!identity.started) {
        return {
            availability: "not-installed",
            version,
            accountId: null,
            profile: options.profile ?? null,
            region: null,
            detail: "The AWS CLI reported a version but could not be run again.",
        };
    }

    if (identity.code !== 0) {
        return {
            availability: "signed-out",
            version,
            accountId: null,
            profile: options.profile ?? null,
            region: null,
            detail: signedOutDetail(identity, options.profile),
        };
    }

    const accountId = readAccountId(identity.stdout);
    const region = await readRegion({ ...options, runner });
    return {
        availability: "ready",
        version,
        accountId,
        profile: options.profile ?? null,
        region,
        detail: "",
    };
}

/** The active region for a profile, or null when nothing sets one. */
export async function readRegion(options: AwsProbeOptions = {}): Promise<string | null> {
    const runner = options.runner ?? nodeProcessRunner();
    const result = await runner.run(
        AWS_COMMAND,
        ["configure", "get", "region", ...profileArgs(options.profile)],
        { signal: options.signal },
    );
    if (!result.started || result.code !== 0) {
        // `configure get` exits non-zero when the key is simply unset. That is not an
        // error worth surfacing - it is the honest answer "no region configured".
        return null;
    }
    const value = result.stdout.trim();
    return value.length > 0 ? value : null;
}

/** Every profile the CLI knows about, in the order it lists them. */
export async function listProfiles(options: AwsProbeOptions = {}): Promise<readonly string[]> {
    const runner = options.runner ?? nodeProcessRunner();
    const result = await runner.run(AWS_COMMAND, ["configure", "list-profiles"], {
        signal: options.signal,
    });
    if (!result.started || result.code !== 0) {
        return [];
    }
    return result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function readAccountId(stdout: string): string | null {
    try {
        const parsed: unknown = JSON.parse(stdout);
        if (parsed && typeof parsed === "object" && "Account" in parsed) {
            const account = (parsed as { Account?: unknown }).Account;
            return typeof account === "string" && account.length > 0 ? account : null;
        }
    } catch {
        // Unparseable output is not an account id. Returning null says "not established",
        // which is exactly right and is not the same as saying the caller has no account.
    }
    return null;
}

function signedOutDetail(result: ProcessResult, profile: string | undefined): string {
    const named = profile ? ` for profile "${profile}"` : "";
    const stderr = result.stderr.toLowerCase();
    if (stderr.includes("sso") || stderr.includes("token has expired")) {
        return `The AWS SSO session${named} has expired. Refresh it with ${AWS_LOGIN_COMMAND}.`;
    }
    if (stderr.includes("could not be found") || stderr.includes("unable to locate credentials")) {
        return `No AWS credentials are configured${named}. Set one up with ${AWS_CONFIGURE_COMMAND}.`;
    }
    return `AWS refused the credential${named}. Check it with ${AWS_CONFIGURE_COMMAND}.`;
}

export type { ProcessResult, ProcessRunOptions, ProcessRunner };
