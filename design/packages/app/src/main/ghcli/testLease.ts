import type {
    ProcessResult,
    ProcessRunOptions,
    ProcessToFileResult,
} from "../cirender/gh.js";
import type { GhCliAccountLease } from "./credentialBroker.js";

interface FakeLeaseOptions {
    readonly accountId?: string;
    readonly host?: string;
    readonly login?: string;
    readonly scopes?: readonly string[];
    readonly scopesReported?: boolean;
    readonly withAccount?: GhCliAccountLease["withAccount"];
    readonly api?: (url: string, init?: RequestInit) => Promise<Response>;
    readonly run?: (args: readonly string[], options?: ProcessRunOptions) => Promise<ProcessResult>;
    readonly runToFile?: (
        args: readonly string[],
        destination: string,
        options?: ProcessRunOptions,
    ) => Promise<ProcessToFileResult>;
    readonly downloadApi?: (
        url: string,
        destination: string,
        options?: ProcessRunOptions,
    ) => Promise<ProcessToFileResult>;
    readonly uploadReleaseAsset?: GhCliAccountLease["uploadReleaseAsset"];
}

const OK: ProcessResult = { started: true, code: 0, stdout: "", stderr: "" };
const FILE_OK: ProcessToFileResult = { started: true, code: 0, bytes: 0, stderr: "" };

/** Complete secret-free gh lease fixture shared by main-process tests. */
export function fakeGhAccountLease(options: FakeLeaseOptions = {}): GhCliAccountLease {
    const runToFile = options.runToFile ?? (() => Promise.resolve(FILE_OK));
    return {
        accountId: options.accountId ?? "github.com:test",
        host: options.host ?? "github.com",
        login: options.login ?? "test",
        scopes: options.scopes ?? ["repo", "workflow"],
        scopesReported: options.scopesReported ?? true,
        withAccount:
            options.withAccount ??
            (async (operation) =>
                await operation({
                    run: async (_command, args, processOptions) =>
                        await (options.run ?? (() => Promise.resolve(OK)))(args, processOptions),
                    runToFile: async (_command, args, destination, processOptions) =>
                        await runToFile(args, destination, processOptions),
                })),
        run: options.run ?? (() => Promise.resolve(OK)),
        runToFile,
        api:
            options.api ??
            (() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
        downloadApi:
            options.downloadApi ??
            ((_url, destination, processOptions) => runToFile([], destination, processOptions)),
        uploadReleaseAsset:
            options.uploadReleaseAsset ??
            (() => Promise.resolve(OK)),
    };
}
