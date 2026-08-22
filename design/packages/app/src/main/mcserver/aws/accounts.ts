/**
 * Every AWS account this machine can reach, and what each one is called.
 *
 * There is no limit here and no account list of our own: the accounts are whatever the AWS
 * CLI already has profiles for, read at the moment they are asked for. That is deliberate
 * and it is the whole security posture of this module - a second list would mean this app
 * deciding which credentials exist, and the only way to be sure of that is to hold them.
 * It does not. It never reads an access key, never writes one, and never asks for one.
 *
 * ## Why an alias matters enough to prompt for
 *
 * An account with no alias is a twelve-digit number. Somebody with a personal account, a
 * work account and a client's account sees three rows of digits and picks by guessing,
 * which is a fine way to provision a game server into a production account. AWS lets an
 * account carry one human name, so this reads it, and offers to set one where there is
 * none rather than leaving three identical-looking rows.
 *
 * ## What this cannot tell you, and says so
 *
 * AWS publishes no API for the promotional credit balance remaining on an account. The
 * console shows it; nothing supported returns it. What can be read is how much credit has
 * been APPLIED over a period, through Cost Explorer, which is a different question wearing
 * similar words: it answers "how much did credits cover last month", not "how much is
 * left". Reporting the first as the second would be a number somebody plans around and it
 * would be wrong, so `credits.ts` returns the applied figure clearly labelled and says the
 * balance is unavailable.
 */

import type { CommandRunner } from "../../runtime/command.js";
import { fail, ok, type Answer } from "../transport/types.js";

/** A profile name has to survive a command line. AWS's own rules are narrower than this. */
const PROFILE_NAME = /^[A-Za-z0-9_.@-]{1,128}$/;

/**
 * AWS's own rule for an account alias, which is stricter than most people expect: lower
 * case, digits and hyphens, no leading or trailing hyphen, 3 to 63 characters.
 */
export const ACCOUNT_ALIAS = /^(?!-)[a-z0-9-]{3,63}(?<!-)$/;

export interface AwsAccount {
    /** The CLI profile this account is reached through. */
    readonly profile: string;
    /** The twelve-digit account id, when it could be read. */
    readonly accountId: string | null;
    /**
     * The account's own human name, or null when it has none.
     *
     * Null is the case worth acting on: it is why the interface offers to set one.
     */
    readonly alias: string | null;
    /** The identity the profile actually resolves to, for telling two profiles apart. */
    readonly arn: string | null;
    /** Whether this profile's credentials currently work. */
    readonly reachable: boolean;
    /** Why it is unreachable, in words. Null when it is fine. */
    readonly problem: string | null;
}

export interface AccountsOptions {
    readonly runner: CommandRunner;
    readonly aws?: string;
    readonly timeoutMs?: number;
}

interface CallerIdentity {
    readonly Account?: unknown;
    readonly Arn?: unknown;
}

interface AliasList {
    readonly AccountAliases?: unknown;
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Turns a failed `aws` call into a sentence.
 *
 * The distinction that matters is expired-or-missing credentials against everything else:
 * the first is the ordinary state of a profile somebody has not signed into today, and it
 * has a fix the interface can offer. Reporting it as a generic failure would send them
 * looking for a problem with the account.
 */
function problemFrom(stderr: string, spawnError: string | null): string {
    if (spawnError === "ENOENT") {
        return "The AWS command line is not installed on this computer.";
    }
    const said = stderr.toLowerCase();
    if (said.includes("expiredtoken") || said.includes("token has expired")) {
        return "This profile's session has expired. Sign in to it again.";
    }
    if (said.includes("could not be found") || said.includes("unable to locate credentials")) {
        return "This profile has no working credentials.";
    }
    if (said.includes("accessdenied")) {
        return "This profile's credentials were refused.";
    }
    return stderr.trim().split(/\r?\n/)[0] ?? "This profile could not be checked.";
}

/**
 * Every profile the AWS CLI knows about.
 *
 * `aws configure list-profiles` is the supported way to ask, and it reads the same files
 * the CLI itself reads - so a profile added by any other tool appears here without this app
 * knowing anything about how it got there.
 */
export async function listProfiles(options: AccountsOptions): Promise<Answer<readonly string[]>> {
    const aws = options.aws ?? "aws";
    const output = await options.runner(aws, ["configure", "list-profiles"], {
        timeoutMs: options.timeoutMs ?? 20_000,
    });

    if (!output.ok) {
        if (output.spawnError === "ENOENT") {
            return fail(
                "not-found",
                "The AWS command line is not installed on this computer.",
                "Install it, then this app can use every account it already knows about.",
            );
        }
        return fail("command-failed", "The list of AWS profiles could not be read.", output.stderr.slice(0, 2_000));
    }

    const profiles = output.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== "" && PROFILE_NAME.test(line));

    return ok(profiles);
}

/**
 * Who one profile actually is.
 *
 * Two calls rather than one, because they answer different questions and fail
 * independently: an account can have a working identity and still refuse the alias lookup,
 * which needs an IAM permission that a narrowly-scoped profile may not have. A missing
 * alias for that reason is reported as no alias, not as a broken account.
 */
export async function describeAccount(
    profile: string,
    options: AccountsOptions,
): Promise<Answer<AwsAccount>> {
    if (!PROFILE_NAME.test(profile)) {
        return fail("invalid-request", "That is not a profile name this app will use.");
    }

    const aws = options.aws ?? "aws";
    const timeoutMs = options.timeoutMs ?? 20_000;

    const identity = await options.runner(
        aws,
        ["sts", "get-caller-identity", "--profile", profile, "--output", "json"],
        { timeoutMs },
    );

    if (!identity.ok) {
        return ok({
            profile,
            accountId: null,
            alias: null,
            arn: null,
            reachable: false,
            problem: problemFrom(identity.stderr, identity.spawnError),
        });
    }

    let caller: CallerIdentity = {};
    try {
        caller = JSON.parse(identity.stdout) as CallerIdentity;
    } catch {
        return ok({
            profile,
            accountId: null,
            alias: null,
            arn: null,
            reachable: false,
            problem: "That profile answered with something this app could not read.",
        });
    }

    const aliases = await options.runner(
        aws,
        ["iam", "list-account-aliases", "--profile", profile, "--output", "json"],
        { timeoutMs },
    );

    let alias: string | null = null;
    if (aliases.ok) {
        try {
            const parsed = JSON.parse(aliases.stdout) as AliasList;
            const list = Array.isArray(parsed.AccountAliases) ? parsed.AccountAliases : [];
            // An account has at most one alias. A list is what the API returns, not a set to
            // choose from.
            alias = asString(list[0]);
        } catch {
            alias = null;
        }
    }

    return {
        ok: true,
        value: {
            profile,
            accountId: asString(caller.Account),
            alias,
            arn: asString(caller.Arn),
            reachable: true,
            problem: null,
        },
    };
}

/** Every account, described. Unreachable ones are included, with their reason. */
export async function listAccounts(options: AccountsOptions): Promise<Answer<readonly AwsAccount[]>> {
    const profiles = await listProfiles(options);
    if (!profiles.ok) return profiles;

    const accounts: AwsAccount[] = [];
    for (const profile of profiles.value) {
        const described = await describeAccount(profile, options);
        // `describeAccount` reports an unusable profile as an unreachable account rather
        // than a failure, so an answer that is not ok here is a caller-level problem and
        // dropping the profile silently would hide it.
        if (described.ok) accounts.push(described.value);
    }
    return ok(accounts);
}

/**
 * Gives an account its human name.
 *
 * Refused before the call when the alias could not be valid, because AWS's rule is
 * stricter than people expect - lower case only, no leading or trailing hyphen - and a
 * server-side rejection for a rule nobody stated reads as the app being broken.
 */
export async function setAccountAlias(
    profile: string,
    alias: string,
    options: AccountsOptions,
): Promise<Answer<void>> {
    if (!PROFILE_NAME.test(profile)) {
        return fail("invalid-request", "That is not a profile name this app will use.");
    }
    if (!ACCOUNT_ALIAS.test(alias)) {
        return fail(
            "invalid-request",
            "An account name uses lower-case letters, numbers and hyphens, is 3 to 63 characters, and cannot start or end with a hyphen.",
        );
    }

    const aws = options.aws ?? "aws";
    const output = await options.runner(
        aws,
        ["iam", "create-account-alias", "--account-alias", alias, "--profile", profile],
        { timeoutMs: options.timeoutMs ?? 30_000 },
    );

    if (!output.ok) {
        const said = output.stderr.toLowerCase();
        if (said.includes("entityalreadyexists")) {
            return fail(
                "invalid-request",
                "That name is already taken by another AWS account.",
                "An account name is unique across all of AWS, not only across yours.",
            );
        }
        if (said.includes("accessdenied")) {
            return fail(
                "denied",
                "This profile is not allowed to name the account.",
                "Setting an account name needs the iam:CreateAccountAlias permission.",
            );
        }
        return fail("command-failed", "That account could not be named.", output.stderr.slice(0, 2_000));
    }

    return ok(undefined);
}
