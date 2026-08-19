/**
 * The seam between the `gh` command-line tool's own account surface and the main process.
 *
 * GitHub CLI keeps its credential store, shared by terminals and other tools. Worldlens
 * exposes only the secret-free account metadata and device-login progress described here.
 *
 * Every type here is a structural mirror of what the Electron preload exposes on
 * `window.worldlens`, restated rather than imported, for the same reason
 * other bridges restate their own slices: this package compiles and runs in three places
 * (the desktop app, a browser tab, and under Vitest) and only the first of them has a
 * preload.
 *
 * **No token ever appears in any of these shapes.** `gh` holds its own credential in its
 * own store; this surface only ever learns account logins, hosts and scopes.
 */

/** One account `gh` itself has stored on this computer - never one of this application's own. */
export interface GhCliAccountReadout {
    readonly id: string;
    readonly login: string;
    readonly host: string;
    /** True for the one account `gh` would use on this host right now. */
    readonly active: boolean;
    readonly scopes: readonly string[];
    /** False when `gh` reported no scope text at all for this account (a fine-grained token). */
    readonly scopesReported: boolean;
    readonly tokenSource: string | null;
    readonly gitProtocol: string | null;
    /** True unless `gh`'s own per-account auth check reported something other than success. */
    readonly healthy: boolean;
    readonly stateDetail: string | null;
    /** From this application's own scopes of interest (`repo`, `workflow`), the ones missing. */
    readonly missingAppScopes: readonly string[];
}

export type GhCliAvailabilityReadout =
    | "not-installed"
    | "incompatible"
    | "no-accounts"
    | "ready";

export interface GhCliAccountsStatusReadout {
    readonly availability: GhCliAvailabilityReadout;
    readonly version: string | null;
    readonly accounts: readonly GhCliAccountReadout[];
    readonly source: "json" | null;
    readonly capabilities?:
        | { readonly structuredStatus: boolean }
        | undefined;
    readonly message: string;
}

/**
 * What switching `gh`'s active account actually did.
 *
 * `ok: true` is reported only after the main process re-read the account list and confirmed
 * the switch genuinely took - never from `gh`'s own exit code alone. `message` always names
 * the machine-wide consequence on success.
 */
export interface GhCliSwitchReadout {
    readonly ok: boolean;
    readonly account: GhCliAccountReadout | null;
    readonly message: string;
}

export type GhCliLoginStageReadout =
    | "requesting-code"
    | "waiting-for-approval"
    | "storing-credential"
    | "verifying"
    | "succeeded"
    | "denied"
    | "expired"
    | "cancelled"
    | "failed";

/** The secret polling device code and access token are absent; the public user code is visible. */
export interface GhCliLoginStateReadout {
    readonly stage: GhCliLoginStageReadout;
    readonly host: "github.com";
    readonly expectedLogin: string | null;
    readonly userCode: string | null;
    readonly verificationUri: string | null;
    readonly verificationUriComplete: string | null;
    readonly expiresAt: number | null;
    readonly secondsRemaining: number | null;
    readonly attempt: number;
    readonly account: GhCliAccountReadout | null;
    readonly failureCode: string | null;
    readonly message: string;
    /** Every scope this one approval carries, visible before the person approves anything. */
    readonly requestedScopes: readonly string[];
}

export interface GhCliLoginResultReadout {
    readonly ok: boolean;
    readonly state: GhCliLoginStateReadout;
}

export interface GhCliCancelLoginReadout {
    readonly cancelled: boolean;
    readonly message: string;
}

export interface GhCliLogoutReadout {
    readonly ok: boolean;
    readonly message: string;
    readonly account?: { readonly host: string; readonly login: string };
    readonly localCredential?: "removed" | "not-removed";
    readonly grantRevocation?: {
        readonly attempted: false;
        readonly refused: true;
        readonly reason: "unsupported-by-gh-cli";
    };
    readonly inFlightEffect?: "completed-before-removal" | "none-observed";
    readonly recovery?: "reauthenticate-exact-account";
}

export interface GhCliLegacyCredentialStatusReadout {
    readonly present: boolean;
    readonly locations: number;
    readonly message: string;
}

export interface GhCliLegacyCredentialRemovalReadout {
    readonly removed: boolean;
    readonly locations: number;
    readonly message: string;
}

/**
 * The preload's `gh` CLI namespace, with each method optional and feature-detected one at a
 * time, exactly as `GitHubBridge` treats its own methods: a released shell can load a newer
 * renderer than the one it was built beside.
 */
export interface GhCliBridge {
    ghCliListAccounts?: () => Promise<GhCliAccountsStatusReadout>;
    ghCliSwitchAccount?: (host: string, login: string) => Promise<GhCliSwitchReadout>;
    ghCliLogoutAccount?: (host: string, login: string) => Promise<GhCliLogoutReadout>;
    ghCliStartLogin?: (expectedLogin?: string) => Promise<GhCliLoginResultReadout>;
    ghCliCancelLogin?: () => Promise<GhCliCancelLoginReadout>;
    ghCliLegacyCredentialStatus?: () => Promise<GhCliLegacyCredentialStatusReadout>;
    ghCliRemoveLegacyCredentials?: () => Promise<GhCliLegacyCredentialRemovalReadout>;
    onGhCliLoginState?: (listener: (state: GhCliLoginStateReadout) => void) => () => void;
    writeClipboardText?: (text: string) => Promise<void>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The preload, or null when there is none. */
export function resolveGhCliBridge(): GhCliBridge | null {
    const host = (globalThis as { worldlens?: GhCliBridge }).worldlens;
    return host ?? null;
}

/** True when this build can list gh's own accounts at all. */
export function canListGhCliAccounts(bridge: GhCliBridge | null): boolean {
    return isFunction(bridge?.ghCliListAccounts);
}

/** True when this build can switch gh's own active account. */
export function canSwitchGhCliAccount(bridge: GhCliBridge | null): boolean {
    return isFunction(bridge?.ghCliSwitchAccount);
}

/** True only when this build supports the complete start/progress/cancel GUI flow. */
export function canLoginGhCli(bridge: GhCliBridge | null): boolean {
    return (
        isFunction(bridge?.ghCliStartLogin) &&
        isFunction(bridge?.ghCliCancelLogin) &&
        isFunction(bridge?.onGhCliLoginState)
    );
}

export function canLogoutGhCliAccount(bridge: GhCliBridge | null): boolean {
    return isFunction(bridge?.ghCliLogoutAccount);
}

export function canWriteGhCliClipboard(bridge: GhCliBridge | null): boolean {
    return isFunction(bridge?.writeClipboardText);
}
