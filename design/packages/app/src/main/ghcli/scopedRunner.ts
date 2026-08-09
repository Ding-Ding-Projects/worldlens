import { AsyncLocalStorage } from "node:async_hooks";

import type {
    ProcessResult,
    ProcessRunOptions,
    ProcessRunner,
    ProcessToFileResult,
} from "../cirender/gh.js";

/**
 * Delegates child processes to the account-bound runner for one asynchronous operation.
 * Concurrent Pages or World Repository jobs retain independent selected hosts without
 * mutating a shared host object or letting a later account choice repaint an older job.
 */
export interface ScopedProcessRunner extends ProcessRunner {
    withRunner<T>(runner: ProcessRunner, operation: () => Promise<T>): Promise<T>;
}

export function createScopedProcessRunner(fallback: ProcessRunner): ScopedProcessRunner {
    const scope = new AsyncLocalStorage<ProcessRunner>();
    const current = (): ProcessRunner => scope.getStore() ?? fallback;
    return {
        withRunner: async (runner, operation) => await scope.run(runner, operation),
        run: async (
            command: string,
            args: readonly string[],
            options?: ProcessRunOptions,
        ): Promise<ProcessResult> => await current().run(command, args, options),
        runToFile: async (
            command: string,
            args: readonly string[],
            destination: string,
            options?: ProcessRunOptions,
        ): Promise<ProcessToFileResult> =>
            await current().runToFile(command, args, destination, options),
    };
}
