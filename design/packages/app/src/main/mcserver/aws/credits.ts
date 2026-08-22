/**
 * What an AWS account has spent, and how much of it credits covered.
 *
 * ## The thing this cannot answer, stated first
 *
 * **AWS publishes no API for the promotional credit balance remaining on an account.** The
 * console shows a balance; nothing supported returns one. That is an AWS gap, not an
 * omission here, and it is the first thing in this file because the temptation is to answer
 * the question anyway.
 *
 * What Cost Explorer can answer is how much credit has been APPLIED over a period. That is
 * a different question wearing similar words: "credits covered $40 last month" is not "$40
 * of credit is left". Presenting the first as the second gives somebody a number they will
 * plan a month of hosting around, and it would be wrong in whichever direction their usage
 * happens to lean.
 *
 * So `readCredits` returns what was applied, labelled as what it is, and says the balance
 * is unavailable. An interface built on this must repeat that rather than quietly rounding
 * the distinction away.
 *
 * ## Cost Explorer costs money
 *
 * Every `GetCostAndUsage` request is billed - a cent at the time of writing. A panel that
 * refreshed on every render would quietly run up a charge for the privilege of displaying
 * a charge, which is a genuinely absurd way to lose somebody's money. Results are therefore
 * fetched on request and carry the time they were fetched, so a surface can show an age
 * instead of asking again.
 */

import type { CommandRunner } from "../../runtime/command.js";
import { fail, ok, type Answer } from "../transport/types.js";

const PROFILE_NAME = /^[A-Za-z0-9_.@-]{1,128}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CreditsPeriod {
    /** Inclusive, `YYYY-MM-DD`. */
    readonly start: string;
    /** Exclusive, `YYYY-MM-DD`, as Cost Explorer defines it. */
    readonly end: string;
}

export interface AccountSpend {
    readonly period: CreditsPeriod;
    readonly currency: string;
    /** What was actually charged, after credits were applied. */
    readonly netUsd: number;
    /**
     * How much credit was applied in this period.
     *
     * Positive, and reported as an amount covered rather than a balance.
     */
    readonly creditsApplied: number;
    /**
     * Always null, and always will be until AWS publishes an API for it.
     *
     * Kept as an explicit field rather than left out, so a surface reading this has to
     * decide what to say about it instead of quietly rendering nothing.
     */
    readonly creditBalanceRemaining: null;
    /** Why the balance is null, in words fit to show somebody. */
    readonly balanceUnavailableReason: string;
    readonly fetchedAt: string;
}

export const BALANCE_UNAVAILABLE =
    "AWS does not publish the remaining credit balance through any API. This shows what credits covered during the period, which is not the same as what is left.";

export interface CreditsOptions {
    readonly runner: CommandRunner;
    readonly aws?: string;
    readonly timeoutMs?: number;
    readonly now?: () => Date;
}

interface CostResult {
    readonly ResultsByTime?: unknown;
}

interface TimeResult {
    readonly Total?: Record<string, { readonly Amount?: unknown; readonly Unit?: unknown } | undefined>;
}

function amountOf(total: TimeResult["Total"], key: string): number {
    const raw = total?.[key]?.Amount;
    const value = typeof raw === "string" ? Number.parseFloat(raw) : typeof raw === "number" ? raw : Number.NaN;
    return Number.isFinite(value) ? value : 0;
}

function currencyOf(total: TimeResult["Total"], key: string): string | null {
    const unit = total?.[key]?.Unit;
    return typeof unit === "string" && unit !== "" ? unit : null;
}

/** The calendar month `date` falls in, as Cost Explorer wants it: start inclusive, end exclusive. */
export function monthTo(date: Date): CreditsPeriod {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const iso = (value: Date): string => value.toISOString().slice(0, 10);
    return { start: iso(start), end: iso(end) };
}

/**
 * Reads one account's spend and applied credits for a period.
 *
 * Two metrics in one request rather than two requests, because each request is billed and
 * asking twice for numbers that arrive together is paying twice for one answer.
 */
export async function readCredits(
    profile: string,
    options: CreditsOptions,
    period?: CreditsPeriod,
): Promise<Answer<AccountSpend>> {
    if (!PROFILE_NAME.test(profile)) {
        return fail("invalid-request", "That is not a profile name this app will use.");
    }

    const now = options.now ?? (() => new Date());
    const window = period ?? monthTo(now());
    if (!ISO_DATE.test(window.start) || !ISO_DATE.test(window.end)) {
        return fail("invalid-request", "That period is not a pair of dates this app can use.");
    }

    const aws = options.aws ?? "aws";
    const output = await options.runner(
        aws,
        [
            "ce",
            "get-cost-and-usage",
            "--time-period",
            `Start=${window.start},End=${window.end}`,
            "--granularity",
            "MONTHLY",
            // NetUnblendedCost is what was actually charged after credits; UnblendedCost is
            // before them. Asking for both in one request is how the credit figure is
            // derived without a second billed call.
            "--metrics",
            "NetUnblendedCost",
            "UnblendedCost",
            "--profile",
            profile,
            "--output",
            "json",
        ],
        { timeoutMs: options.timeoutMs ?? 45_000 },
    );

    if (!output.ok) {
        const said = output.stderr.toLowerCase();
        if (said.includes("accessdenied") || said.includes("not authorized")) {
            return fail(
                "denied",
                "This account's billing is not readable with these credentials.",
                "Cost Explorer needs the ce:GetCostAndUsage permission, and it must be enabled for the account.",
            );
        }
        if (said.includes("datanotavailable") || said.includes("not enabled")) {
            return fail(
                "not-found",
                "Cost Explorer has not been switched on for this account yet.",
                "AWS takes up to a day to prepare the data after it is enabled.",
            );
        }
        return fail("command-failed", "This account's spending could not be read.", output.stderr.slice(0, 2_000));
    }

    let parsed: CostResult;
    try {
        parsed = JSON.parse(output.stdout) as CostResult;
    } catch {
        return fail("command-failed", "AWS answered with something this app could not read.");
    }

    const results = Array.isArray(parsed.ResultsByTime) ? (parsed.ResultsByTime as TimeResult[]) : [];
    const first = results[0];
    const net = amountOf(first?.Total, "NetUnblendedCost");
    const gross = amountOf(first?.Total, "UnblendedCost");

    return ok({
        period: window,
        currency: currencyOf(first?.Total, "NetUnblendedCost") ?? "USD",
        netUsd: net,
        // Gross minus net is what credits (and other discounts) covered. Never negative:
        // rounding between two separately-reported figures can put it a fraction below
        // zero, and "-0.00 of credit applied" reads as a defect.
        creditsApplied: Math.max(0, gross - net),
        creditBalanceRemaining: null,
        balanceUnavailableReason: BALANCE_UNAVAILABLE,
        fetchedAt: now().toISOString(),
    });
}
