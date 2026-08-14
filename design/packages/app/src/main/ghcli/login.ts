/**
 * GUI-assisted sign-in for the `gh` command-line tool's own credential store.
 *
 * `gh auth login` cannot expose its device code when this application starts it without
 * a terminal, so this module performs the public device-code exchange itself using the
 * GitHub CLI OAuth application's public client identity. Once GitHub approves the flow,
 * the access token is written once to `gh auth login --with-token` over stdin. It never
 * enters an argument, an environment variable, an intermediary application file, a log
 * message, or an IPC shape. `gh` remains the credential owner; this application retains
 * no copy.
 */

import {
    pollForAccessToken,
    requestDeviceCode,
    type DeviceFlowFailure,
    type FetchLike,
    type SleepLike,
} from "./deviceFlow.js";
import { describeError, redactSecrets } from "../security/redact.js";
import { missingScopes, normalizeRequiredScopes, normalizeScopes } from "./scopes.js";
import type { ProcessRunner } from "../cirender/gh.js";
import { parseGhAuthStatusJson, type GhCliAccountSummary } from "./accounts.js";
import { GH_CLI_AUTH_ENVIRONMENT } from "./environment.js";

/** The public OAuth client identity embedded by the official `cli/cli` project. */
export const GH_CLI_OAUTH_CLIENT_ID = "178c6fc778ccc68e1d6a";

/** This lane deliberately supports github.com only; enterprise needs its own host client. */
export const GH_CLI_LOGIN_HOST = "github.com";

/**
 * One approval carries every permission this application can need through `gh`.
 *
 * `repo`, `read:org`, and `gist` are the GitHub CLI's own minimum set. `workflow` is
 * required by WorldLens dispatches, while both project scopes cover the read/write
 * GitHub Projects operations used by the application's hosted task workflow. Asking once
 * avoids making a person approve a second device flow immediately after the first.
 */
export const GH_CLI_LOGIN_SCOPES: readonly string[] = [
    "repo",
    "workflow",
    "gist",
    "read:org",
    "read:project",
    "project",
];

const NORMALIZED_GH_CLI_LOGIN_SCOPES = normalizeRequiredScopes(GH_CLI_LOGIN_SCOPES);

export type GhCliLoginStage =
    | "requesting-code"
    | "waiting-for-approval"
    | "storing-credential"
    | "verifying"
    | "succeeded"
    | "denied"
    | "expired"
    | "cancelled"
    | "failed";

/**
 * The complete renderer-visible sign-in state. Deliberately exhaustive and secret-free.
 * The OAuth device code and approved access token are absent by construction.
 */
export interface GhCliLoginState {
    readonly stage: GhCliLoginStage;
    readonly host: typeof GH_CLI_LOGIN_HOST;
    readonly expectedLogin: string | null;
    readonly userCode: string | null;
    readonly verificationUri: string | null;
    readonly verificationUriComplete: string | null;
    readonly expiresAt: number | null;
    readonly secondsRemaining: number | null;
    readonly attempt: number;
    readonly account: GhCliAccountSummary | null;
    readonly failureCode: string | null;
    /** Ready to render as-is and guaranteed not to contain the approved token. */
    readonly message: string;
    /**
     * The exact scopes this one approval carries, so the sign-in screen can name every
     * permission before the person approves anything, rather than only after a dispatch
     * fails with a 403 that reads like an unrelated permissions problem. Always the same
     * list `requestDeviceCode` was actually called with; never trimmed or reworded per
     * stage, so a screenshot of any stage shows the truth.
     */
    readonly requestedScopes: readonly string[];
}

export interface GhCliLoginResult {
    readonly ok: boolean;
    readonly state: GhCliLoginState;
}

export interface GhCliLoginOptions {
    readonly runner: ProcessRunner;
    /** The broker-pinned absolute GitHub CLI executable. */
    readonly executable: string;
    readonly fetch: FetchLike;
    readonly sleep?: SleepLike | undefined;
    readonly now?: (() => number) | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly expectedLogin?: string | null | undefined;
    readonly onState?: ((state: GhCliLoginState) => void) | undefined;
    /** Broker lane used only after device approval, while gh stores and verifies the account. */
    readonly withCredentialStoreLock?:
        | (<T>(operation: () => Promise<T>) => Promise<T>)
        | undefined;
}

interface PublicGrant {
    readonly userCode: string;
    readonly verificationUri: string;
    readonly verificationUriComplete: string | null;
    readonly expiresAt: number;
}

function publicState(
    stage: GhCliLoginStage,
    expectedLogin: string | null,
    message: string,
    overrides: Partial<GhCliLoginState> = {},
): GhCliLoginState {
    return {
        stage,
        host: GH_CLI_LOGIN_HOST,
        expectedLogin,
        userCode: null,
        verificationUri: null,
        verificationUriComplete: null,
        expiresAt: null,
        secondsRemaining: null,
        attempt: 0,
        account: null,
        failureCode: null,
        message,
        requestedScopes: GH_CLI_LOGIN_SCOPES,
        ...overrides,
    };
}

function withGrant(
    grant: PublicGrant,
): Pick<GhCliLoginState, "userCode" | "verificationUri" | "verificationUriComplete" | "expiresAt"> {
    return {
        userCode: grant.userCode,
        verificationUri: grant.verificationUri,
        verificationUriComplete: grant.verificationUriComplete,
        expiresAt: grant.expiresAt,
    };
}

function terminalStage(failure: DeviceFlowFailure): GhCliLoginStage {
    if (failure.code === "denied") return "denied";
    if (failure.code === "expired") return "expired";
    if (failure.code === "cancelled") return "cancelled";
    return "failed";
}

function firstLine(text: string): string {
    return (text.split(/\r?\n/)[0] ?? "").trim();
}

function sameLogin(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function devicePageAllowed(url: string, expectedUserCode: string | null): boolean {
    try {
        const parsed = new URL(url);
        const originAllowed =
            parsed.protocol === "https:" &&
            parsed.hostname === GH_CLI_LOGIN_HOST &&
            parsed.port === "" &&
            parsed.username === "" &&
            parsed.password === "" &&
            parsed.pathname === "/login/device" &&
            parsed.hash === "";
        if (!originAllowed) return false;
        if (expectedUserCode === null) return parsed.search === "";
        const parameters = [...parsed.searchParams.entries()];
        return (
            parameters.length === 1 &&
            parameters[0]?.[0] === "user_code" &&
            parameters[0]?.[1] === expectedUserCode
        );
    } catch {
        return false;
    }
}

function realSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal?.aborted === true) {
            resolve();
            return;
        }
        const timer = setTimeout(done, milliseconds);
        function done(): void {
            clearTimeout(timer);
            signal?.removeEventListener("abort", done);
            resolve();
        }
        signal?.addEventListener("abort", done, { once: true });
    });
}

/**
 * Starts, polls, stores, and proves one GitHub CLI sign-in.
 *
 * A caller may request an expected login for scope repair. The approved browser account
 * is still authoritative; if it differs, the newly approved account remains honestly
 * reported and the operation fails instead of pretending the requested account changed.
 */
export async function loginGhCli(options: GhCliLoginOptions): Promise<GhCliLoginResult> {
    const expectedLogin = options.expectedLogin?.trim() || null;
    const emit = (state: GhCliLoginState): GhCliLoginState => {
        options.onState?.(state);
        return state;
    };

    emit(
        publicState(
            "requesting-code",
            expectedLogin,
            "Asking GitHub for a one-time sign-in code. No credential has been stored yet.",
        ),
    );

    const codeResult = await requestDeviceCode({
        clientId: GH_CLI_OAUTH_CLIENT_ID,
        clientKind: "oauth",
        scopes: GH_CLI_LOGIN_SCOPES,
        fetch: options.fetch,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!codeResult.ok) {
        const state = emit(
            publicState(
                terminalStage(codeResult.failure),
                expectedLogin,
                codeResult.failure.message,
                {
                    failureCode: codeResult.failure.code,
                },
            ),
        );
        return { ok: false, state };
    }

    const grant: PublicGrant = {
        userCode: codeResult.grant.userCode,
        verificationUri: codeResult.grant.verificationUri,
        verificationUriComplete: codeResult.grant.verificationUriComplete,
        expiresAt: codeResult.grant.expiresAt,
    };
    if (
        !devicePageAllowed(grant.verificationUri, null) ||
        (grant.verificationUriComplete !== null &&
            !devicePageAllowed(grant.verificationUriComplete, grant.userCode))
    ) {
        const state = emit(
            publicState(
                "failed",
                expectedLogin,
                "GitHub returned an unexpected approval address. It was not opened or shown, and nothing was stored.",
                { failureCode: "unsafe-verification-uri" },
            ),
        );
        return { ok: false, state };
    }
    emit(
        publicState(
            "waiting-for-approval",
            expectedLogin,
            "Open the displayed GitHub address yourself, enter the one-time code, then approve the requested permissions. This application will not open a browser.",
            withGrant(grant),
        ),
    );

    const sleep =
        options.sleep ?? ((milliseconds: number) => realSleep(milliseconds, options.signal));
    const tokenResult = await pollForAccessToken({
        clientId: GH_CLI_OAUTH_CLIENT_ID,
        grant: codeResult.grant,
        fetch: options.fetch,
        sleep,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        onWaiting: (waiting) => {
            emit(
                publicState(
                    "waiting-for-approval",
                    expectedLogin,
                    "Waiting for approval on GitHub. The one-time code remains visible until it expires.",
                    {
                        ...withGrant(grant),
                        secondsRemaining: waiting.secondsRemaining,
                        attempt: waiting.attempt,
                    },
                ),
            );
        },
    });

    if (!tokenResult.ok) {
        const state = emit(
            publicState(
                terminalStage(tokenResult.failure),
                expectedLogin,
                tokenResult.failure.message,
                {
                    ...withGrant(grant),
                    failureCode: tokenResult.failure.code,
                },
            ),
        );
        return { ok: false, state };
    }

    // Keep the token inside this lexical block. It is written to gh once over stdin and
    // is supplied only to redaction after that; it never becomes part of a public value.
    const token = tokenResult.grant.token;
    // Read through a function because AbortSignal.aborted is readonly and a direct false
    // check would be narrowed across later awaits, even though another task can abort it.
    const aborted = (): boolean => options.signal?.aborted === true;
    try {
        const cancelledAfterApproval = (): GhCliLoginResult => {
            const state = emit(
                publicState(
                    "cancelled",
                    expectedLogin,
                    "Sign-in was cancelled after GitHub approved it. gh may already have stored the credential; check the account list before trying again.",
                    {
                        ...withGrant(grant),
                        failureCode: "cancelled",
                    },
                ),
            );
            return { ok: false, state };
        };

        if (aborted()) {
            const state = emit(
                publicState(
                    "cancelled",
                    expectedLogin,
                    "Sign-in was cancelled before gh stored the credential.",
                    {
                        ...withGrant(grant),
                        failureCode: "cancelled",
                    },
                ),
            );
            return { ok: false, state };
        }

        const storeAndVerify = async (): Promise<GhCliLoginResult> => {
            emit(
                publicState(
                    "storing-credential",
                    expectedLogin,
                    "GitHub approved the sign-in. Handing the credential directly to gh's own store.",
                    withGrant(grant),
                ),
            );

            const stored = await options.runner.run(
            options.executable,
            [
                "auth",
                "login",
                "--hostname",
                GH_CLI_LOGIN_HOST,
                "--git-protocol",
                "https",
                "--with-token",
            ],
            {
                input: token,
                omitEnvironmentVariables: GH_CLI_AUTH_ENVIRONMENT,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            },
            );
            if (aborted()) return cancelledAfterApproval();
            if (!stored.started || stored.code !== 0) {
            const said = redactSecrets(firstLine(stored.stderr), [token]);
            const state = emit(
                publicState(
                    "failed",
                    expectedLogin,
                    !stored.started
                        ? "GitHub approved sign-in, but gh is no longer available on PATH. Nothing was handed to a credential store."
                        : `GitHub approved sign-in, but gh did not accept the credential${said === "" ? "." : `: ${said}`}`,
                    {
                        ...withGrant(grant),
                        failureCode: !stored.started ? "gh-not-installed" : "gh-login-failed",
                    },
                ),
            );
                return { ok: false, state };
            }

            emit(
            publicState(
                "verifying",
                expectedLogin,
                "gh accepted the credential. Verifying both its stored account and effective API identity.",
                withGrant(grant),
            ),
            );

            const status = await options.runner.run(
            options.executable,
            ["auth", "status", "--hostname", GH_CLI_LOGIN_HOST, "--json", "hosts"],
            {
                omitEnvironmentVariables: GH_CLI_AUTH_ENVIRONMENT,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            },
            );
            if (aborted()) return cancelledAfterApproval();
            const accounts = status.code === 0 ? parseGhAuthStatusJson(status.stdout) : null;
            const active =
            accounts?.find((account) => account.host === GH_CLI_LOGIN_HOST && account.active) ??
            null;
            if (!status.started || status.code !== 0 || active === null) {
            const said = redactSecrets(firstLine(status.stderr), [token]);
            const state = emit(
                publicState(
                    "failed",
                    expectedLogin,
                    `gh stored the approved credential, but its account status could not be verified${said === "" ? "." : `: ${said}`}`,
                    {
                        ...withGrant(grant),
                        failureCode: "gh-status-unverified",
                    },
                ),
            );
                return { ok: false, state };
            }

            const grantedScopes = normalizeScopes(active.scopes);
            const missing = active.scopesReported
            ? missingScopes(grantedScopes, NORMALIZED_GH_CLI_LOGIN_SCOPES)
            : NORMALIZED_GH_CLI_LOGIN_SCOPES;
            if (missing.length > 0) {
            const state = emit(
                publicState(
                    "failed",
                    expectedLogin,
                    active.scopesReported
                        ? `gh stored ${active.login}'s approved credential, but the active account is missing the requested ${missing.length === 1 ? "scope" : "scopes"}: ${missing.join(", ")}.`
                        : `gh stored ${active.login}'s approved credential, but the active account did not report scopes, so the requested permissions could not be verified.`,
                    {
                        ...withGrant(grant),
                        account: active,
                        failureCode: "insufficient-scopes",
                    },
                ),
            );
                return { ok: false, state };
            }

            const viewer = await options.runner.run(
            options.executable,
            ["api", "--hostname", GH_CLI_LOGIN_HOST, "user", "--jq", ".login"],
            {
                omitEnvironmentVariables: GH_CLI_AUTH_ENVIRONMENT,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            },
            );
            if (aborted()) return cancelledAfterApproval();
            const effectiveLogin = viewer.stdout.trim();
            if (
            !viewer.started ||
            viewer.code !== 0 ||
            effectiveLogin === "" ||
            !sameLogin(active.login, effectiveLogin)
            ) {
            const said = redactSecrets(firstLine(viewer.stderr), [token]);
            const state = emit(
                publicState(
                    "failed",
                    expectedLogin,
                    `gh stored the approved credential as ${active.login}, but its effective API identity could not be proved${said === "" ? "." : `: ${said}`}`,
                    {
                        ...withGrant(grant),
                        account: active,
                        failureCode: "identity-unverified",
                    },
                ),
            );
                return { ok: false, state };
            }

            if (expectedLogin !== null && !sameLogin(expectedLogin, effectiveLogin)) {
            const state = emit(
                publicState(
                    "failed",
                    expectedLogin,
                    `GitHub approved ${effectiveLogin}, not the requested ${expectedLogin}. gh stored and activated ${effectiveLogin}; the requested account was not changed.`,
                    {
                        ...withGrant(grant),
                        account: active,
                        failureCode: "unexpected-account",
                    },
                ),
            );
                return { ok: false, state };
            }

            const state = emit(
            publicState(
                "succeeded",
                expectedLogin,
                `${effectiveLogin} is signed in through gh on ${GH_CLI_LOGIN_HOST}. The requested scopes are verified, and gh status and the API identity agree.`,
                { account: active },
            ),
            );
            return { ok: true, state };
        };
        return await (options.withCredentialStoreLock?.(storeAndVerify) ?? storeAndVerify());
    } catch (error) {
        const state = emit(
            publicState(
                aborted() ? "cancelled" : "failed",
                expectedLogin,
                aborted()
                    ? "Sign-in was cancelled. If GitHub had already approved it, check the gh account list before trying again."
                    : `Sign-in could not finish: ${describeError(error, [token])}`,
                {
                    ...withGrant(grant),
                    failureCode: aborted() ? "cancelled" : "unexpected",
                },
            ),
        );
        return { ok: false, state };
    }
}
