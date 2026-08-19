import { mkdtemp, mkdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { exists } from "./files.js";

/**
 * Build an output tree off to the side, then publish it with a recoverable swap.
 *
 * A rerun can produce fewer files than the previous run. Writing directly into the old
 * directory would leave those files behind and make a stale map look complete. The
 * builder therefore never reads or deletes the live output: it writes a fresh sibling,
 * moves the old output into a uniquely named backup, installs the fresh tree, and only
 * then removes the backup. If installation fails, the backup is moved back.
 */
export async function buildAtomicOutput<T>(
    outputDirectory: string,
    build: (stagingDirectory: string) => Promise<T>,
): Promise<T> {
    const output = resolve(outputDirectory);
    const parent = dirname(output);
    const name = basename(output);
    await mkdir(parent, { recursive: true });
    const stagingRoot = await mkdtemp(join(parent, "." + name + ".staging-"));
    const staging = join(stagingRoot, name);
    let backupRoot: string | undefined;
    let backup: string | undefined;
    let installed = false;

    try {
        const result = await build(staging);
        if (await exists(output)) {
            backupRoot = await mkdtemp(join(parent, "." + name + ".backup-"));
            backup = join(backupRoot, name);
            await rename(output, backup);
        }

        try {
            await rename(staging, output);
            installed = true;
        } catch (error) {
            if (backup !== undefined) {
                try {
                    await rename(backup, output);
                } catch (restoreError) {
                    throw new Error(
                        "Atomic merge install failed and restoring the prior output also failed: " +
                            String(restoreError),
                        { cause: error },
                    );
                }
            }
            throw error;
        }

        if (backupRoot !== undefined) await rm(backupRoot, { recursive: true, force: true });
        return result;
    } finally {
        // A cancellation can leave this cleanup for the next run, but it must never touch
        // the live output. The staging and backup names are unique and owned by this call.
        if (!installed || backupRoot === undefined)
            await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
        if (installed) await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
        if (!installed && backupRoot !== undefined)
            await rm(backupRoot, { recursive: true, force: true }).catch(() => undefined);
    }
}
