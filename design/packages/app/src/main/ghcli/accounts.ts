/** Secret-free discovery and explicit activation of accounts owned by GitHub CLI. */

import type { ProcessRunner } from "../cirender/gh.js";
import { GH_CLI_AUTH_ENVIRONMENT } from "./environment.js";

export const APP_SCOPES_OF_INTEREST: readonly string[] = ["repo", "workflow"];

export type GhCliAvailability =
    | "not-installed"
    | "incompatible"
    | "no-accounts"
    | "ready";

export interface GhCliAccountSummary {
    /** Stable, secret-free selection key derived only from host and login. */
    readonly id: string;
    readonly login: string;
    readonly host: string;
    readonly active: boolean;
    readonly scopes: readonly string[];
    readonly scopesReported: boolean;
    readonly tokenSource: string | null;
    readonly gitProtocol: string | null;
    readonly healthy: boolean;
    readonly stateDetail: string | null;
    readonly missingAppScopes: readonly string[];
}

export interface GhCliCapabilities {
    readonly structuredStatus: boolean;
}

export interface GhCliAccountsStatus {
    readonly availability: GhCliAvailability;
    readonly version: string | null;
    readonly accounts: readonly GhCliAccountSummary[];
    readonly source: "json" | null;
    readonly capabilities: GhCliCapabilities;
    readonly message: string;
}

export interface GhCliSwitchResult {
    readonly ok: boolean;
    readonly account: GhCliAccountSummary | null;
    readonly message: string;
}

export interface GhCliLogoutResult {
    readonly ok: boolean;
    readonly message: string;
    /** Exact account target; never inferred from the machine-wide active account. */
    readonly account?: { readonly host: string; readonly login: string };
    /** Whether gh confirmed removal from its own local credential store. */
    readonly localCredential?: "removed" | "not-removed";
    /** gh CLI has no supported grant-revocation operation for this flow. */
    readonly grantRevocation?: {
        readonly attempted: false;
        readonly refused: true;
        readonly reason: "unsupported-by-gh-cli";
    };
    /** Active broker work is serialized and is allowed to finish before removal. */
    readonly inFlightEffect?: "completed-before-removal" | "none-observed";
    /** Recovery remains on the same surface: sign in again for this exact account. */
    readonly recovery?: "reauthenticate-exact-account";
}

export interface GhCliRunOptions {
    readonly runner: ProcessRunner;
    /** A previously resolved and pinned absolute executable. */
    readonly executable: string;
    readonly signal?: AbortSignal | undefined;
}

const NO_CAPABILITIES: GhCliCapabilities = {
    structuredStatus: false,
};

export function ghAccountId(host: string, login: string): string {
    return `${encodeURIComponent(host.toLowerCase())}:${encodeURIComponent(login.toLowerCase())}`;
}

function missingAppScopesOf(scopes: readonly string[], scopesReported: boolean): readonly string[] {
    if (!scopesReported) return [];
    return APP_SCOPES_OF_INTEREST.filter((scope) => !scopes.includes(scope));
}

/** Parse only the documented machine-readable `gh auth status --json hosts` shape. */
export function parseGhAuthStatusJson(raw: string): readonly GhCliAccountSummary[] | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const hosts = (parsed as Record<string, unknown>)["hosts"];
    if (typeof hosts !== "object" || hosts === null || Array.isArray(hosts)) return null;

    const accounts: GhCliAccountSummary[] = [];
    for (const [hostKey, entries] of Object.entries(hosts as Record<string, unknown>)) {
        if (!Array.isArray(entries)) return null;
        for (const entry of entries) {
            if (typeof entry !== "object" || entry === null) return null;
            const record = entry as Record<string, unknown>;
            const login = typeof record["login"] === "string" ? record["login"].trim() : "";
            const host =
                typeof record["host"] === "string" && record["host"].trim() !== ""
                    ? record["host"].trim()
                    : hostKey.trim();
            if (login === "" || host === "") return null;

            const scopesRaw = typeof record["scopes"] === "string" ? record["scopes"] : "";
            const scopes = [
                ...new Set(
                    scopesRaw
                        .split(",")
                        .map((scope) => scope.trim().toLowerCase())
                        .filter((scope) => scope.length > 0),
                ),
            ];
            const scopesReported = scopesRaw.trim().length > 0;
            const state = typeof record["state"] === "string" ? record["state"] : "success";
            const healthy = state === "success";
            accounts.push({
                id: ghAccountId(host, login),
                login,
                host,
                active: record["active"] === true,
                scopes,
                scopesReported,
                tokenSource:
                    typeof record["tokenSource"] === "string" ? record["tokenSource"] : null,
                gitProtocol:
                    typeof record["gitProtocol"] === "string" ? record["gitProtocol"] : null,
                healthy,
                stateDetail: healthy ? null : state,
                missingAppScopes: missingAppScopesOf(scopes, scopesReported),
            });
        }
    }
    return accounts;
}

function firstLine(text: string): string {
    return (text.split(/\r?\n/)[0] ?? "").trim();
}

function commandOptions(options: GhCliRunOptions) {
    return {
        omitEnvironmentVariables: GH_CLI_AUTH_ENVIRONMENT,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
}

export async function listGhCliAccounts(options: GhCliRunOptions): Promise<GhCliAccountsStatus> {
    const version = await options.runner.run(
        options.executable,
        ["--version"],
        commandOptions(options),
    );
    if (!version.started || version.code !== 0) {
        return {
            availability: "not-installed",
            version: null,
            accounts: [],
            source: null,
            capabilities: NO_CAPABILITIES,
            message:
                "GitHub CLI could not be started from its trusted installation location. Install or repair it from Dependencies, then check again.",
        };
    }
    const versionText = firstLine(version.stdout) || firstLine(version.stderr) || null;

    const status = await options.runner.run(
        options.executable,
        ["auth", "status", "--json", "hosts"],
        commandOptions(options),
    );
    const accounts = status.started && status.code === 0 ? parseGhAuthStatusJson(status.stdout) : null;
    const capabilities: GhCliCapabilities = {
        structuredStatus: accounts !== null,
    };
    if (!capabilities.structuredStatus || accounts === null) {
        return {
            availability: "incompatible",
            version: versionText,
            accounts: accounts ?? [],
            source: accounts === null ? null : "json",
            capabilities,
            message:
                "This GitHub CLI version lacks the structured account status Worldlens requires. Upgrade it from Dependencies; no account will be guessed.",
        };
    }
    if (accounts.length === 0) {
        return {
            availability: "no-accounts",
            version: versionText,
            accounts: [],
            source: "json",
            capabilities,
            message:
                "GitHub CLI is installed but has no signed-in accounts. Use Add account; the credential will be stored by gh, not Worldlens.",
        };
    }
    return {
        availability: "ready",
        version: versionText,
        accounts,
        source: "json",
        capabilities,
        message: `GitHub CLI has ${accounts.length} signed-in ${accounts.length === 1 ? "account" : "accounts"} available to Worldlens.`,
    };
}

/** An explicit UI action only; broker operations never switch the machine-wide active account. */
export async function switchGhCliAccount(
    options: GhCliRunOptions,
    host: string,
    login: string,
): Promise<GhCliSwitchResult> {
    if (host.trim() === "" || login.trim() === "") {
        return { ok: false, account: null, message: "Give a host and a login to switch to." };
    }
    const result = await options.runner.run(
        options.executable,
        ["auth", "switch", "--hostname", host, "--user", login],
        commandOptions(options),
    );
    const status = await listGhCliAccounts(options);
    const match = status.accounts.find(
        (account) =>
            account.host.toLowerCase() === host.toLowerCase() &&
            account.login.toLowerCase() === login.toLowerCase(),
    );
    if (result.started && result.code === 0 && match?.active === true) {
        return {
            ok: true,
            account: match,
            message:
                `${login} is now gh's active account on ${host}. This explicit change is machine-wide and also affects terminals and other tools.`,
        };
    }
    return {
        ok: false,
        account: match ?? null,
        message: `GitHub CLI did not confirm ${login} as the active account on ${host}.`,
    };
}

/** Removes exactly one named account from gh's own credential store and verifies it is gone. */
export async function logoutGhCliAccount(
    options: GhCliRunOptions,
    host: string,
    login: string,
): Promise<GhCliLogoutResult> {
    const normalizedHost = host.trim();
    const normalizedLogin = login.trim();
    const account = { host: normalizedHost, login: normalizedLogin };
    const grantRevocation = {
        attempted: false as const,
        refused: true as const,
        reason: "unsupported-by-gh-cli" as const,
    };
    if (normalizedHost === "" || normalizedLogin === "") {
        return {
            ok: false,
            message: "Give a host and a login to sign out.",
            account,
            localCredential: "not-removed",
            grantRevocation,
            inFlightEffect: "none-observed",
            recovery: "reauthenticate-exact-account",
        };
    }
    const result = await options.runner.run(
        options.executable,
        ["auth", "logout", "--hostname", normalizedHost, "--user", normalizedLogin],
        commandOptions(options),
    );
    const status = await listGhCliAccounts(options);
    const remains = status.accounts.some(
        (account) =>
            account.host.trim().toLowerCase() === normalizedHost.toLowerCase() &&
            account.login.trim().toLowerCase() === normalizedLogin.toLowerCase(),
    );
    const verifiedStatus = status.availability === "ready" && status.source === "json";
    if (result.started && result.code === 0 && verifiedStatus && !remains) {
        return {
            ok: true,
            message:
                `${normalizedLogin} on ${normalizedHost} was removed from GitHub CLI's credential store. ` +
                "GitHub CLI cannot revoke the authorization grant from this surface; sign in again here if needed.",
            account,
            localCredential: "removed",
            grantRevocation,
            inFlightEffect: "completed-before-removal",
            recovery: "reauthenticate-exact-account",
        };
    }
    return {
        ok: false,
        message: verifiedStatus
            ? `GitHub CLI did not confirm that ${normalizedLogin} on ${normalizedHost} was signed out.`
            : `GitHub CLI could not verify removal of ${normalizedLogin} on ${normalizedHost}; sign in again here only after checking the account status.`,
        account,
        localCredential: "not-removed",
        grantRevocation,
        inFlightEffect: "completed-before-removal",
        recovery: "reauthenticate-exact-account",
    };
}
