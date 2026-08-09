/**
 * The `gh` command-line tool's own accounts and main-process operation broker.
 *
 * See `accounts.ts` for the account list/switch itself and `credentialBroker.ts` for the
 * one-account-per-operation lease. `ipc.ts` is the only file in this directory that imports
 * Electron, and only as a type.
 */

export {
    APP_SCOPES_OF_INTEREST,
    listGhCliAccounts,
    parseGhAuthStatusJson,
    switchGhCliAccount,
} from "./accounts.js";
export type {
    GhCliAccountSummary,
    GhCliAccountsStatus,
    GhCliAvailability,
    GhCliRunOptions,
    GhCliSwitchResult,
} from "./accounts.js";

export { registerGhCliHandlers, GH_CLI_CHANNELS } from "./ipc.js";
export type { GhCliIpc, GhCliIpcOptions } from "./ipc.js";
export { GH_CLI_AUTH_ENVIRONMENT } from "./environment.js";

export {
    GH_CLI_LOGIN_HOST,
    GH_CLI_LOGIN_SCOPES,
    GH_CLI_OAUTH_CLIENT_ID,
    loginGhCli,
} from "./login.js";
export type {
    GhCliLoginOptions,
    GhCliLoginResult,
    GhCliLoginStage,
    GhCliLoginState,
} from "./login.js";
