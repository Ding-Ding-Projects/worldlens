import { describe, expect, it } from "vitest";

import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { ACCOUNT_ALIAS, describeAccount, listAccounts, listProfiles, setAccountAlias } from "./accounts.js";
import { BALANCE_UNAVAILABLE, monthTo, readCredits } from "./credits.js";

function out(partial: Partial<CommandOutput> = {}): CommandOutput {
    return { ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null, ...partial };
}

/** An `aws` that answers by the verb it was given. Nothing here needs AWS or a network. */
function fakeAws(answers: (args: readonly string[]) => CommandOutput): {
    runner: CommandRunner;
    calls: (readonly string[])[];
} {
    const calls: (readonly string[])[] = [];
    const runner: CommandRunner = async (_command, args) => {
        calls.push(args);
        return answers(args);
    };
    return { runner, calls };
}

const IDENTITY = JSON.stringify({ Account: "123456789012", Arn: "arn:aws:iam::123456789012:user/pat" });

describe("finding every account this machine can reach", () => {
    it("reads the profiles the AWS CLI already has, rather than keeping a list of its own", async () => {
        // A second list would mean this app deciding which credentials exist, and the only
        // way to be sure of that is to hold them. It does not.
        const { runner, calls } = fakeAws(() => out({ stdout: "default\nwork\nclient-a\n" }));
        const answer = await listProfiles({ runner });

        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value).toEqual(["default", "work", "client-a"]);
        expect(calls[0]).toEqual(["configure", "list-profiles"]);
    });

    it("has no limit on how many accounts there are", async () => {
        const many = Array.from({ length: 250 }, (_unused, index) => `account-${index}`).join("\n");
        const { runner } = fakeAws(() => out({ stdout: many }));
        const answer = await listProfiles({ runner });
        expect(answer.ok && answer.value).toHaveLength(250);
    });

    it("refuses a profile name that has no business on a command line", async () => {
        const { runner, calls } = fakeAws(() => out({ stdout: IDENTITY }));
        const answer = await describeAccount("work; rm -rf /", { runner });

        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("invalid-request");
        expect(calls).toHaveLength(0);
    });

    it("says the command line is missing rather than blaming the account", async () => {
        const { runner } = fakeAws(() => out({ ok: false, spawnError: "ENOENT" }));
        const answer = await listProfiles({ runner });

        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.message).toContain("not installed");
    });
});

describe("describing one account", () => {
    it("reads its number, its identity and its name", async () => {
        const { runner } = fakeAws((args) => {
            if (args[0] === "sts") return out({ stdout: IDENTITY });
            return out({ stdout: JSON.stringify({ AccountAliases: ["acme-production"] }) });
        });

        const answer = await describeAccount("work", { runner });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.accountId).toBe("123456789012");
        expect(answer.value.alias).toBe("acme-production");
        expect(answer.value.reachable).toBe(true);
    });

    it("reports no name rather than a broken account when the alias lookup is refused", async () => {
        // Reading the alias needs an IAM permission a narrowly-scoped profile may not have.
        // That is not a broken account, and calling it one would send somebody to fix
        // credentials that work perfectly.
        const { runner } = fakeAws((args) => {
            if (args[0] === "sts") return out({ stdout: IDENTITY });
            return out({ ok: false, exitCode: 254, stderr: "AccessDenied" });
        });

        const answer = await describeAccount("work", { runner });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.reachable).toBe(true);
        expect(answer.value.alias).toBeNull();
    });

    it("reports an expired session as expired, with the fix implied", async () => {
        const { runner } = fakeAws(() =>
            out({ ok: false, exitCode: 255, stderr: "ExpiredToken: The security token included in the request is expired" }),
        );
        const answer = await describeAccount("work", { runner });

        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.reachable).toBe(false);
        expect(answer.value.problem).toContain("expired");
    });

    it("keeps an unreachable account in the list rather than hiding it", async () => {
        const { runner } = fakeAws((args) => {
            if (args[0] === "configure") return out({ stdout: "good\nbroken\n" });
            if (args[0] === "sts" && args.includes("broken")) {
                return out({ ok: false, exitCode: 255, stderr: "Unable to locate credentials" });
            }
            if (args[0] === "sts") return out({ stdout: IDENTITY });
            return out({ stdout: JSON.stringify({ AccountAliases: [] }) });
        });

        const answer = await listAccounts({ runner });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;

        // Dropping it would leave somebody wondering where their account went.
        expect(answer.value.map((account) => account.profile)).toEqual(["good", "broken"]);
        expect(answer.value[1]?.reachable).toBe(false);
    });
});

describe("naming an account", () => {
    it("accepts a name AWS would accept", () => {
        expect(ACCOUNT_ALIAS.test("acme-production")).toBe(true);
        expect(ACCOUNT_ALIAS.test("abc")).toBe(true);
    });

    it("refuses the ones AWS refuses, before spending a call on it", async () => {
        // AWS's rule is stricter than people expect, and a server-side rejection for a rule
        // nobody stated reads as this app being broken.
        for (const bad of ["AB", "Acme", "-acme", "acme-", "a".repeat(64), "acme_prod"]) {
            expect(ACCOUNT_ALIAS.test(bad), bad).toBe(false);
        }

        const { runner, calls } = fakeAws(() => out());
        const answer = await setAccountAlias("work", "Acme", { runner });
        expect(answer.ok).toBe(false);
        expect(calls).toHaveLength(0);
    });

    it("says plainly when the name is taken by somebody else's account", async () => {
        const { runner } = fakeAws(() => out({ ok: false, exitCode: 254, stderr: "EntityAlreadyExists" }));
        const answer = await setAccountAlias("work", "acme-production", { runner });

        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        // An account name is unique across all of AWS, which is genuinely surprising.
        expect(answer.failure.detail).toContain("all of AWS");
    });

    it("names the permission when it is refused", async () => {
        const { runner } = fakeAws(() => out({ ok: false, exitCode: 254, stderr: "AccessDenied" }));
        const answer = await setAccountAlias("work", "acme-production", { runner });

        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.detail).toContain("iam:CreateAccountAlias");
    });
});

describe("what an account has spent, and what credits covered", () => {
    const spend = (net: string, gross: string): string =>
        JSON.stringify({
            ResultsByTime: [
                { Total: { NetUnblendedCost: { Amount: net, Unit: "USD" }, UnblendedCost: { Amount: gross, Unit: "USD" } } },
            ],
        });

    it("reports credits as an amount covered, and refuses to invent a balance", async () => {
        const { runner } = fakeAws(() => out({ stdout: spend("10.00", "50.00") }));
        const answer = await readCredits("work", { runner, now: () => new Date("2026-08-21T00:00:00Z") });

        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.netUsd).toBeCloseTo(10);
        expect(answer.value.creditsApplied).toBeCloseTo(40);

        // The whole point. AWS publishes no API for the remaining balance, and reporting
        // "credits covered $40" as "$40 left" gives somebody a number they will plan a
        // month of hosting around.
        expect(answer.value.creditBalanceRemaining).toBeNull();
        expect(answer.value.balanceUnavailableReason).toBe(BALANCE_UNAVAILABLE);
    });

    it("never reports a negative amount of credit", async () => {
        // Two separately-rounded figures can put the difference a fraction below zero, and
        // "-0.00 of credit applied" reads as a defect.
        const { runner } = fakeAws(() => out({ stdout: spend("50.01", "50.00") }));
        const answer = await readCredits("work", { runner });
        expect(answer.ok && answer.value.creditsApplied).toBe(0);
    });

    it("asks for both metrics in one request, because each request is billed", async () => {
        const { runner, calls } = fakeAws(() => out({ stdout: spend("1", "1") }));
        await readCredits("work", { runner });

        const ce = calls.find((args) => args[0] === "ce");
        expect(ce).toContain("NetUnblendedCost");
        expect(ce).toContain("UnblendedCost");
        // One call, not two: asking twice for numbers that arrive together pays twice.
        expect(calls.filter((args) => args[0] === "ce")).toHaveLength(1);
    });

    it("says Cost Explorer is switched off rather than reporting no spending", async () => {
        const { runner } = fakeAws(() => out({ ok: false, exitCode: 254, stderr: "DataUnavailableException: not enabled" }));
        const answer = await readCredits("work", { runner });

        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        // Reporting zero would look like a free month rather than a missing setting.
        expect(answer.failure.code).toBe("not-found");
    });

    it("names the permission when billing is not readable", async () => {
        const { runner } = fakeAws(() => out({ ok: false, exitCode: 254, stderr: "AccessDeniedException" }));
        const answer = await readCredits("work", { runner });
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.detail).toContain("ce:GetCostAndUsage");
    });

    it("asks for the calendar month, with an exclusive end as Cost Explorer defines it", () => {
        expect(monthTo(new Date("2026-08-21T12:00:00Z"))).toEqual({ start: "2026-08-01", end: "2026-09-01" });
        // December must roll into the next year rather than month 13.
        expect(monthTo(new Date("2026-12-05T00:00:00Z"))).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    });
});
