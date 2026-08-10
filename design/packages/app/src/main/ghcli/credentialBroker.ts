/** Main-process-only account leases that keep credentials wholly inside GitHub CLI. */

import { basename } from "node:path";

import type {
    ProcessResult,
    ProcessRunOptions,
    ProcessRunner,
    ProcessToFileResult,
} from "../cirender/gh.js";
import {
    GH_CLI_AUTH_ENVIRONMENT,
    GIT_CREDENTIAL_DIAGNOSTIC_ENVIRONMENT,
} from "./environment.js";
import {
    listGhCliAccounts,
    logoutGhCliAccount,
    switchGhCliAccount,
    type GhCliAccountSummary,
    type GhCliAccountsStatus,
    type GhCliLogoutResult,
    type GhCliSwitchResult,
} from "./accounts.js";
import { resolveGhExecutable, type ResolveGhExecutableOptions } from "./executable.js";

function credentialHelperFor(executable: string): string {
    const normalized = executable.replaceAll("\\", "/");
    const quoted = `'${normalized.replaceAll("'", `'"'"'`)}'`;
    return `credential.helper=!${quoted} auth git-credential`;
}

export type GhCredentialAccess = "read" | "write";

/**
 * One secret-free handle to a real account held by GitHub CLI.
 *
 * Every command is executed through the broker's serialized account lane. The lane selects
 * this account immediately before the command and restores the account that was active
 * beforehand immediately afterwards. No token is requested, copied into an environment
 * variable, returned to a caller, or placed in IPC.
 */
export interface GhCliAccountLease {
    readonly accountId: string;
    readonly host: string;
    readonly login: string;
    readonly scopes: readonly string[];
    readonly scopesReported: boolean;
    /**
     * Runs one bounded main-process operation while this account is selected, then restores
     * the account that was active on the same host. This is for operations that combine gh
     * and git; no credential is returned to the callback.
     */
    withAccount<T>(operation: (runner: ProcessRunner) => Promise<T>, signal?: AbortSignal): Promise<T>;
    run(args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult>;
    runToFile(
        args: readonly string[],
        destination: string,
        options?: ProcessRunOptions,
    ): Promise<ProcessToFileResult>;
    /** Performs one API request through `gh api`; no authorization value enters this process. */
    api(url: string, init?: RequestInit): Promise<Response>;
    /** Streams one API response to disk through `gh api`. */
    downloadApi(
        url: string,
        destination: string,
        options?: ProcessRunOptions,
    ): Promise<ProcessToFileResult>;
    /** Uploads an existing file through `gh release upload` without replacing an asset. */
    uploadReleaseAsset(
        owner: string,
        repo: string,
        tag: string,
        assetName: string,
        filePath: string,
        options?: ProcessRunOptions,
    ): Promise<ProcessResult>;
}

/** REST base paired with a selected gh host; GitHub Enterprise uses its `/api/v3` root. */
export function ghApiBaseForHost(host: string): string {
    return host.toLowerCase() === "github.com" ? "https://api.github.com" : `https://${host}/api/v3`;
}

export type GhCliAccountProvider = (
    accountId?: string | undefined,
    access?: GhCredentialAccess | undefined,
    signal?: AbortSignal | undefined,
) => Promise<GhCliAccountLease | null>;

export type GhCredentialErrorCode =
    | "gh-not-installed"
    | "gh-incompatible"
    | "account-not-found"
    | "account-ambiguous"
    | "account-unhealthy"
    | "account-restore-failed"
    | "identity-unverified";

export class GhCredentialError extends Error {
    readonly code: GhCredentialErrorCode;
    readonly needsSignIn: boolean;

    constructor(
        code: GhCredentialErrorCode,
        message: string,
        needsSignIn = true,
        cause?: unknown,
    ) {
        super(message, { cause });
        this.name = "GhCredentialError";
        this.code = code;
        this.needsSignIn = needsSignIn;
    }
}

export interface GhCredentialBrokerOptions extends ResolveGhExecutableOptions {
    readonly runner: ProcessRunner;
}

function sameLogin(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function selectAccount(
    status: GhCliAccountsStatus,
    requestedId?: string | undefined,
): GhCliAccountSummary | null {
    const healthy = status.accounts.filter((account) => account.healthy);
    if (requestedId !== undefined && requestedId !== "") {
        const match = status.accounts.find((account) => account.id === requestedId) ?? null;
        if (match === null) {
            throw new GhCredentialError(
                "account-not-found",
                "The selected GitHub CLI account is no longer signed in. Choose another account or sign in again.",
            );
        }
        if (!match.healthy) {
            throw new GhCredentialError(
                "account-unhealthy",
                `${match.login} on ${match.host} needs reauthentication before it can be used.`,
            );
        }
        return match;
    }

    const activeGithubCom = healthy.filter(
        (account) => account.active && account.host.toLowerCase() === "github.com",
    );
    if (activeGithubCom.length === 1) return activeGithubCom[0]!;
    const active = healthy.filter((account) => account.active);
    if (active.length === 1) return active[0]!;
    if (healthy.length === 1) return healthy[0]!;
    if (healthy.length === 0) return null;
    throw new GhCredentialError(
        "account-ambiguous",
        "More than one GitHub CLI account is available and none is uniquely active. Choose the account for this operation; Worldlens will not guess or switch it.",
        false,
    );
}

/**
 * Owns no credential store. It pins one absolute executable and runs every supported GitHub
 * operation through that executable under one explicitly selected account.
 */
export class GhCredentialBroker {
    readonly #options: GhCredentialBrokerOptions;
    readonly #executable: Promise<string | null>;
    #commandTail: Promise<void> = Promise.resolve();

    constructor(options: GhCredentialBrokerOptions) {
        this.#options = options;
        this.#executable = resolveGhExecutable({
            ...(options.candidates === undefined ? {} : { candidates: options.candidates }),
        }).then((result) => result.executable);
    }

    async executable(): Promise<string | null> {
        return await this.#executable;
    }

    async listAccounts(signal?: AbortSignal): Promise<GhCliAccountsStatus> {
        const executable = await this.#executable;
        if (executable === null) {
            return {
                availability: "not-installed",
                version: null,
                accounts: [],
                source: null,
                capabilities: { structuredStatus: false },
                message:
                    "GitHub CLI was not found in a trusted installation location. Install or repair it from Dependencies, then check again.",
            };
        }
        return await listGhCliAccounts({
            runner: this.#options.runner,
            executable,
            ...(signal === undefined ? {} : { signal }),
        });
    }

    async switchAccount(host: string, login: string, signal?: AbortSignal): Promise<GhCliSwitchResult> {
        const executable = await this.#executable;
        if (executable === null) {
            return {
                ok: false,
                account: null,
                message:
                    "GitHub CLI is not installed in a trusted location. Install it from Dependencies, then check again.",
            };
        }
        return await this.#exclusive(
            async () =>
                await switchGhCliAccount(
                    {
                        runner: this.#options.runner,
                        executable,
                        ...(signal === undefined ? {} : { signal }),
                    },
                    host,
                    login,
                ),
        );
    }

    /**
     * Serializes the short credential-store mutation/verification phase of device sign-in
     * with every selected-account lease. Device-code polling happens before this callback,
     * so an approval wait never blocks unrelated GitHub work.
     */
    async withCredentialStoreMutation<T>(work: () => Promise<T>): Promise<T> {
        return await this.#exclusive(work);
    }

    async logoutAccount(host: string, login: string, signal?: AbortSignal): Promise<GhCliLogoutResult> {
        const executable = await this.#executable;
        if (executable === null) {
            return {
                ok: false,
                message: "GitHub CLI is not installed in a trusted location.",
            };
        }
        return await this.#exclusive(
            async () =>
                await logoutGhCliAccount(
                    {
                        runner: this.#options.runner,
                        executable,
                        ...(signal === undefined ? {} : { signal }),
                    },
                    host,
                    login,
                ),
        );
    }

    /**
     * Acquires a secret-free command lease for one selected gh account.
     *
     * A write lease revalidates `user` through `gh api` before it is returned. This is the
     * CLI equivalent of the old `/user` REST probe, except the credential never leaves gh.
     */
    readonly account: GhCliAccountProvider = async (
        accountId,
        access = "read",
        signal,
    ): Promise<GhCliAccountLease | null> => {
        const executable = await this.#executable;
        if (executable === null) {
            throw new GhCredentialError(
                "gh-not-installed",
                "GitHub CLI is not installed in a trusted location. Install it from Dependencies, then sign in.",
            );
        }

        const status = await listGhCliAccounts({
            runner: this.#options.runner,
            executable,
            ...(signal === undefined ? {} : { signal }),
        });
        if (status.availability === "incompatible") {
            throw new GhCredentialError("gh-incompatible", status.message, false);
        }
        if (status.availability === "not-installed") {
            throw new GhCredentialError("gh-not-installed", status.message);
        }
        const selected = selectAccount(status, accountId);
        if (selected === null) return null;

        const lease: GhCliAccountLease = {
            accountId: selected.id,
            host: selected.host,
            login: selected.login,
            scopes: selected.scopes,
            scopesReported: selected.scopesReported,
            withAccount: async (operation, operationSignal) =>
                await this.#withSelectedAccount(
                    executable,
                    selected,
                    operationSignal,
                    async () => await operation(this.#boundRunner(executable, selected)),
                ),
            run: async (args, options = {}) =>
                await this.#runAs(executable, selected, args, options),
            runToFile: async (args, destination, options = {}) =>
                await this.#runToFileAs(executable, selected, args, destination, options),
            api: async (url, options = {}) =>
                await this.#apiAs(executable, selected, url, options),
            downloadApi: async (url, destination, options = {}) =>
                await this.#downloadApiAs(executable, selected, url, destination, options),
            uploadReleaseAsset: async (owner, repo, tag, assetName, filePath, options = {}) =>
                await this.#uploadReleaseAssetAs(
                    executable,
                    selected,
                    owner,
                    repo,
                    tag,
                    assetName,
                    filePath,
                    options,
                ),
        };

        if (access === "write") {
            const identity = await lease.run(
                ["api", "--hostname", selected.host, "--jq", ".login", "user"],
                signal === undefined ? {} : { signal },
            );
            if (!identity.started || identity.code !== 0) {
                throw new GhCredentialError(
                    "identity-unverified",
                    `${selected.login} could not be revalidated through GitHub CLI before this write, so nothing was changed. Reauthenticate it from GitHub settings.`,
                );
            }
            const login = identity.stdout.trim();
            if (!sameLogin(login, selected.login)) {
                throw new GhCredentialError(
                    "identity-unverified",
                    `GitHub CLI did not prove that the selected account is ${selected.login}, so nothing was changed.`,
                    false,
                );
            }
        }

        return lease;
    };

    async #exclusive<T>(work: () => Promise<T>): Promise<T> {
        const previous = this.#commandTail;
        let release!: () => void;
        this.#commandTail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await work();
        } finally {
            release();
        }
    }

    #processOptions(
        options: ProcessRunOptions,
        credentialBoundGit = false,
    ): ProcessRunOptions {
        const omitted = new Map<string, string>();
        for (const name of [
            ...GH_CLI_AUTH_ENVIRONMENT,
            ...(credentialBoundGit ? GIT_CREDENTIAL_DIAGNOSTIC_ENVIRONMENT : []),
            ...(options.omitEnvironmentVariables ?? []),
        ]) {
            const key = name.toLowerCase();
            if (!omitted.has(key)) omitted.set(key, name);
        }
        return {
            ...options,
            ...(credentialBoundGit && options.input === undefined ? { input: "" } : {}),
            omitEnvironmentVariables: [...omitted.values()],
        };
    }

    #boundRunner(executable: string, account: GhCliAccountSummary): ProcessRunner {
        const transform = (command: string, args: readonly string[]) => {
            if (basename(command).toLowerCase() === "gh" || basename(command).toLowerCase() === "gh.exe") {
                return {
                    command: executable,
                    args: this.#hostQualifiedGhArgs(args, account.host),
                    credentialBoundGit: false,
                };
            }
            const credentialBoundGit =
                /^git(?:\.exe)?$/i.test(basename(command)) &&
                args.some((argument) =>
                    /^credential\.helper=!gh(?:\.exe)? auth git-credential$/i.test(argument),
                );
            const transformedArgs = args.map((argument) =>
                /^credential\.helper=!gh(?:\.exe)? auth git-credential$/i.test(argument)
                    ? credentialHelperFor(executable)
                    : account.host.toLowerCase() === "github.com"
                      ? argument
                      : argument.replace(
                            /^https:\/\/github\.com\//i,
                            `https://${account.host}/`,
                        ),
            );
            return {
                command,
                args: credentialBoundGit
                    ? ["-c", "credential.interactive=false", ...transformedArgs]
                    : transformedArgs,
                credentialBoundGit,
            };
        };
        return {
            run: async (command, args, options = {}) => {
                const selected = transform(command, args);
                return await this.#options.runner.run(
                    selected.command,
                    selected.args,
                    this.#processOptions(options, selected.credentialBoundGit),
                );
            },
            runToFile: async (command, args, destination, options = {}) => {
                const selected = transform(command, args);
                return await this.#options.runner.runToFile(
                    selected.command,
                    selected.args,
                    destination,
                    this.#processOptions(options, selected.credentialBoundGit),
                );
            },
        };
    }

    #hostQualifiedGhArgs(args: readonly string[], host: string): readonly string[] {
        if (args[0] === "api" && !args.includes("--hostname")) {
            return ["api", "--hostname", host, ...args.slice(1)];
        }
        if (args[0] === "auth" && args[1] === "status" && !args.includes("--hostname")) {
            return ["auth", "status", "--hostname", host, ...args.slice(2)];
        }
        if (
            args[0] === "repo" &&
            (args[1] === "create" || args[1] === "view") &&
            args[2] !== undefined &&
            !args[2].includes("://") &&
            args[2].split("/").length === 2
        ) {
            return [args[0], args[1], `${host}/${args[2]}`, ...args.slice(3)];
        }
        return args;
    }

    async #withSelectedAccount<T>(
        executable: string,
        account: GhCliAccountSummary,
        signal: AbortSignal | undefined,
        work: () => Promise<T>,
    ): Promise<T> {
        return await this.#exclusive(async () => {
            const status = await listGhCliAccounts({
                runner: this.#options.runner,
                executable,
                ...(signal === undefined ? {} : { signal }),
            });
            const stillPresent = status.accounts.find((candidate) => candidate.id === account.id);
            if (stillPresent === undefined || !stillPresent.healthy) {
                throw new GhCredentialError(
                    "account-unhealthy",
                    `${account.login} on ${account.host} needs reauthentication before it can be used.`,
                );
            }
            const prior = status.accounts.find(
                (candidate) =>
                    candidate.active && candidate.host.toLowerCase() === account.host.toLowerCase(),
            );
            const mustSelect = prior?.id !== account.id;
            if (mustSelect) {
                const selected = await switchGhCliAccount(
                    {
                        runner: this.#options.runner,
                        executable,
                        ...(signal === undefined ? {} : { signal }),
                    },
                    account.host,
                    account.login,
                );
                if (!selected.ok) {
                    throw new GhCredentialError(
                        "account-unhealthy",
                        `GitHub CLI could not select ${account.login} for this operation. Reauthenticate it from GitHub settings.`,
                    );
                }
            }

            let value: T | undefined;
            let workFailed = false;
            let workError: unknown;
            try {
                value = await work();
            } catch (error) {
                workFailed = true;
                workError = error;
            }

            if (mustSelect && prior !== undefined) {
                // Restoration is an invariant of the broker lane, so an operation's aborted
                // signal must not cancel it. A failed restore is surfaced instead of letting a
                // successful result leave another terminal on the wrong active account.
                const restored = await switchGhCliAccount(
                    {
                        runner: this.#options.runner,
                        executable,
                    },
                    prior.host,
                    prior.login,
                );
                if (!restored.ok) {
                    throw new GhCredentialError(
                        "account-restore-failed",
                        `GitHub CLI could not restore ${prior.login} on ${prior.host} after the operation. Reselect that account from GitHub settings before continuing.`,
                        true,
                        workFailed ? workError : undefined,
                    );
                }
            }

            if (workFailed) throw workError;
            return value as T;
        });
    }

    async #runAs(
        executable: string,
        account: GhCliAccountSummary,
        args: readonly string[],
        options: ProcessRunOptions,
    ): Promise<ProcessResult> {
        return await this.#withSelectedAccount(executable, account, options.signal, async () =>
            await this.#options.runner.run(executable, args, this.#processOptions(options)),
        );
    }

    async #runToFileAs(
        executable: string,
        account: GhCliAccountSummary,
        args: readonly string[],
        destination: string,
        options: ProcessRunOptions,
    ): Promise<ProcessToFileResult> {
        return await this.#withSelectedAccount(executable, account, options.signal, async () =>
            await this.#options.runner.runToFile(
                executable,
                args,
                destination,
                this.#processOptions(options),
            ),
        );
    }

    async #apiAs(
        executable: string,
        account: GhCliAccountSummary,
        url: string,
        init: RequestInit,
    ): Promise<Response> {
        const endpoint = apiEndpoint(url, account.host);
        const method = (init.method ?? "GET").toUpperCase();
        const args = ["api", "--hostname", account.host, "-X", method];
        const headers = new Headers(init.headers);
        for (const forbidden of ["authorization", "proxy-authorization", "cookie", "host", "content-length"]) {
            headers.delete(forbidden);
        }
        if (!headers.has("accept")) headers.set("accept", "application/vnd.github+json");
        for (const [name, value] of headers) args.push("-H", `${name}: ${value}`);

        let input: string | undefined;
        if (init.body !== undefined && init.body !== null) {
            if (typeof init.body !== "string") {
                return jsonResponse(400, "Worldlens refused a non-text API body before starting GitHub CLI.");
            }
            input = init.body;
            args.push("--input", "-");
        }
        args.push(endpoint);
        const result = await this.#runAs(executable, account, args, {
            ...(init.signal === undefined || init.signal === null ? {} : { signal: init.signal }),
            ...(input === undefined ? {} : { input }),
        });
        if (!result.started) return jsonResponse(503, "GitHub CLI could not be started.");
        if (result.code !== 0) {
            return jsonResponse(httpStatus(result.stderr), "GitHub CLI refused the request.");
        }
        if (method === "DELETE" && result.stdout.trim() === "") return new Response(null, { status: 204 });
        return new Response(result.stdout, {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    }

    async #downloadApiAs(
        executable: string,
        account: GhCliAccountSummary,
        url: string,
        destination: string,
        options: ProcessRunOptions,
    ): Promise<ProcessToFileResult> {
        return await this.#runToFileAs(
            executable,
            account,
            [
                "api",
                "--hostname",
                account.host,
                "-H",
                "Accept: application/octet-stream",
                apiEndpoint(url, account.host),
            ],
            destination,
            options,
        );
    }

    async #uploadReleaseAssetAs(
        executable: string,
        account: GhCliAccountSummary,
        owner: string,
        repo: string,
        tag: string,
        assetName: string,
        filePath: string,
        options: ProcessRunOptions,
    ): Promise<ProcessResult> {
        if (basename(filePath) !== assetName) {
            return {
                started: false,
                code: null,
                stdout: "",
                stderr: "The staged filename does not match the requested release asset name.",
            };
        }
        return await this.#runAs(
            executable,
            account,
            [
                "release",
                "upload",
                tag,
                filePath,
                "--repo",
                `${account.host}/${owner}/${repo}`,
            ],
            options,
        );
    }
}

function apiEndpoint(rawUrl: string, host: string): string {
    const parsed = new URL(rawUrl);
    const publicHost = host.toLowerCase() === "github.com";
    const allowedHost = publicHost
        ? "api.github.com"
        : new URL(ghApiBaseForHost(host)).host.toLowerCase();
    if (parsed.protocol !== "https:" || parsed.host.toLowerCase() !== allowedHost) {
        throw new GhCredentialError(
            "identity-unverified",
            "Worldlens refused a GitHub CLI API request whose host did not match the selected account.",
            false,
        );
    }
    let pathname = parsed.pathname;
    if (!publicHost) {
        const restPrefix = "/api/v3";
        if (pathname === restPrefix) {
            pathname = "/";
        } else if (pathname.startsWith(`${restPrefix}/`)) {
            pathname = pathname.slice(restPrefix.length);
        } else {
            throw new GhCredentialError(
                "identity-unverified",
                "Worldlens refused a GitHub Enterprise API request outside that host's REST API root.",
                false,
            );
        }
    }
    return `${pathname.replace(/^\/+/, "")}${parsed.search}`;
}

function httpStatus(stderr: string): number {
    const matched = /(?:\(HTTP |HTTP )(\d{3})/.exec(stderr)?.[1];
    if (matched === undefined) return 502;
    const parsed = Number.parseInt(matched, 10);
    return parsed >= 400 && parsed <= 599 ? parsed : 502;
}

function jsonResponse(status: number, message: string): Response {
    return new Response(JSON.stringify({ message }), {
        status,
        headers: { "content-type": "application/json" },
    });
}
