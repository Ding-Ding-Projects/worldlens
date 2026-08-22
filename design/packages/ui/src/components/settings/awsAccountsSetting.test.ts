import { describe, expect, it } from "vitest";
import { AWS_ACCOUNT_ALIAS, awsAccountSearchText, createAwsAccountsSetting } from "./awsAccountsSetting.js";
import type { AwsAccount, AwsAccountsBridge, AwsAccountSpend } from "./awsAccountsBridge.js";

const account = (overrides: Partial<AwsAccount> = {}): AwsAccount => ({
    profile: "personal",
    accountId: "111122223333",
    alias: null,
    arn: "arn:aws:iam::111122223333:user/me",
    reachable: true,
    problem: null,
    ...overrides,
});

describe("AWS_ACCOUNT_ALIAS", () => {
    it("accepts AWS's own shape", () => {
        expect(AWS_ACCOUNT_ALIAS.test("my-game-account")).toBe(true);
    });
    it("refuses upper case, leading/trailing hyphen, and too-short names", () => {
        expect(AWS_ACCOUNT_ALIAS.test("My-Account")).toBe(false);
        expect(AWS_ACCOUNT_ALIAS.test("-abc")).toBe(false);
        expect(AWS_ACCOUNT_ALIAS.test("abc-")).toBe(false);
        expect(AWS_ACCOUNT_ALIAS.test("ab")).toBe(false);
    });
});

describe("createAwsAccountsSetting", () => {
    it("reports unavailable when no bridge is given", () => {
        const setting = createAwsAccountsSetting({ bridge: null });
        expect(setting.available).toBe(false);
    });

    it("loads accounts, including an unreachable one with its problem kept", async () => {
        const unreachable = account({ profile: "stale", reachable: false, problem: "This profile's session has expired. Sign in to it again.", accountId: null, arn: null });
        const bridge: AwsAccountsBridge = {
            list: async () => ({ ok: true, value: [account(), unreachable] }),
        };
        const setting = createAwsAccountsSetting({ bridge });
        await setting.load();
        expect(setting.accounts.value).toHaveLength(2);
        expect(setting.accounts.value[1]).toEqual(unreachable);
        expect(setting.loadError.value).toBeNull();
    });

    it("surfaces a load failure without throwing", async () => {
        const bridge: AwsAccountsBridge = {
            list: async () => ({ ok: false, kind: "command-failed", message: "The list of AWS profiles could not be read." }),
        };
        const setting = createAwsAccountsSetting({ bridge });
        await setting.load();
        expect(setting.accounts.value).toHaveLength(0);
        expect(setting.loadError.value).toBe("The list of AWS profiles could not be read.");
    });

    it("refuses an invalid alias before ever calling the bridge", async () => {
        let called = false;
        const bridge: AwsAccountsBridge = {
            setAlias: async () => {
                called = true;
                return { ok: true, value: undefined };
            },
        };
        const setting = createAwsAccountsSetting({ bridge });
        const result = await setting.setAlias("personal", "Not Valid!");
        expect(result.ok).toBe(false);
        expect(called).toBe(false);
    });

    it("surfaces the two real alias failures plainly: taken, and denied", async () => {
        const taken: AwsAccountsBridge = {
            setAlias: async () => ({ ok: false, kind: "invalid-request", message: "That name is already taken by another AWS account." }),
        };
        const denied: AwsAccountsBridge = {
            setAlias: async () => ({ ok: false, kind: "denied", message: "This profile is not allowed to name the account." }),
        };
        const takenResult = await createAwsAccountsSetting({ bridge: taken }).setAlias("personal", "my-account");
        const deniedResult = await createAwsAccountsSetting({ bridge: denied }).setAlias("personal", "my-account");
        expect(takenResult).toEqual({ ok: false, message: "That name is already taken by another AWS account." });
        expect(deniedResult).toEqual({ ok: false, message: "This profile is not allowed to name the account." });
    });

    it("updates the account's alias locally once the bridge confirms it", async () => {
        const bridge: AwsAccountsBridge = {
            list: async () => ({ ok: true, value: [account()] }),
            setAlias: async () => ({ ok: true, value: undefined }),
        };
        const setting = createAwsAccountsSetting({ bridge });
        await setting.load();
        const result = await setting.setAlias("personal", "my-account");
        expect(result.ok).toBe(true);
        expect(setting.accounts.value[0]?.alias).toBe("my-account");
    });

    it("fetches credits on request only, never polling, and keeps the applied/balance distinction", async () => {
        let calls = 0;
        const spend: AwsAccountSpend = {
            period: { start: "2026-08-01", end: "2026-09-01" },
            currency: "USD",
            netUsd: 4.2,
            creditsApplied: 12.5,
            creditBalanceRemaining: null,
            balanceUnavailableReason: "AWS does not publish the remaining credit balance through any API.",
            fetchedAt: new Date().toISOString(),
        };
        const bridge: AwsAccountsBridge = {
            credits: async () => {
                calls += 1;
                return { ok: true, value: spend };
            },
        };
        const setting = createAwsAccountsSetting({ bridge });
        await setting.fetchCredits("personal");
        expect(calls).toBe(1);
        expect(setting.credits.value.get("personal")?.creditsApplied).toBe(12.5);
        expect(setting.credits.value.get("personal")?.creditBalanceRemaining).toBeNull();
        // A second explicit call is a second explicit request, not automatic polling.
        await setting.fetchCredits("personal");
        expect(calls).toBe(2);
    });
});

describe("awsAccountSearchText", () => {
    it("includes reachability so 'unreachable' finds a broken account", () => {
        const text = awsAccountSearchText(account({ reachable: false, problem: "denied" }));
        expect(text).toContain("unreachable");
        expect(text).toContain("denied");
    });
});
