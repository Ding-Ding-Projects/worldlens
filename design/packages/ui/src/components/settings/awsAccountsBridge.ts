/**
 * The seam between the AWS accounts settings panel and the main process.
 *
 * Same shape as `dependencyBridge.ts`: a structural mirror of what the preload exposes,
 * restated rather than imported so this package keeps compiling in a browser tab and
 * under Vitest, where there is no preload at all. Every method is optional and
 * feature-detected, so a host with no bridge gets an honest "not available" state
 * rather than a button that quietly does nothing.
 *
 * This module never reads, stores or displays an access key. The AWS CLI's own
 * profiles are the only account list; see `main/mcserver/aws/accounts.ts` for why.
 */

export interface AwsAccount {
    readonly profile: string;
    readonly accountId: string | null;
    readonly alias: string | null;
    readonly arn: string | null;
    readonly reachable: boolean;
    readonly problem: string | null;
}

export interface AwsCreditsPeriod {
    readonly start: string;
    readonly end: string;
}

export interface AwsAccountSpend {
    readonly period: AwsCreditsPeriod;
    readonly currency: string;
    readonly netUsd: number;
    readonly creditsApplied: number;
    readonly creditBalanceRemaining: null;
    readonly balanceUnavailableReason: string;
    readonly fetchedAt: string;
}

export type AwsAnswer<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly kind: string; readonly message: string; readonly detail?: string };

export interface AwsAccountsBridge {
    list?: () => Promise<AwsAnswer<readonly AwsAccount[]>>;
    setAlias?: (request: { profile: string; alias: string }) => Promise<AwsAnswer<void>>;
    credits?: (request: { profile: string; period?: AwsCreditsPeriod }) => Promise<AwsAnswer<AwsAccountSpend>>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The preload's AWS-accounts slice, or null when there is none to talk to. */
export function resolveAwsAccountsBridge(): AwsAccountsBridge | null {
    const host = (globalThis as { worldlens?: { mcserver?: { awsAccounts?: AwsAccountsBridge } } }).worldlens;
    return host?.mcserver?.awsAccounts ?? null;
}

/** True when this build can list AWS accounts at all. */
export function canListAwsAccounts(bridge: AwsAccountsBridge | null): boolean {
    return isFunction(bridge?.list);
}
