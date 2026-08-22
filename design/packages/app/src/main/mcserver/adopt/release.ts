/**
 * Letting go of an adopted server, without ever touching what it owns.
 *
 * This is the file the whole feature's safety rests on, so its rule is short and absolute:
 * `releaseAdoption` never calls `docker stop`, `docker rm`, `docker prune`, or anything
 * else that changes the container or the files under it. It deletes the *record* -
 * `registry.ts`'s own comment already says it for created servers: "forgetting a server is
 * not deleting it" - and for an adopted one that is doubly true, because there is no
 * "WorldLens created this, WorldLens may unmake it" license to fall back on.
 *
 * The existing `remove` path in `registry.ts` is generic - it deletes any `ServerRecord`
 * regardless of origin - so the guard that a *created* server's removal is allowed to be
 * destructive while an *adopted* one's must not be lives here, one level up, as a new
 * failure code: `"adopted-not-created"`. A caller that reaches for the ordinary destroy
 * path on an adopted server is refused before anything happens.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { ServerRegistry } from "../registry.js";
import { fail, ok, type Answer } from "../transport/types.js";
import type { AdoptionRecord, AdoptionStore } from "./record.js";

/** The failure code a generic "destroy this server" path must answer with when it is
 *  handed a server whose origin is `"adopted"`. Not a new `TransportFailureCode` - those
 *  describe transport-level trouble, and this describes a caller reaching for authority
 *  adoption never grants - so it is its own small union kept separate on purpose. */
export type ReleaseGuardFailureCode = "adopted-not-created";

export interface ReleaseGuardFailure {
    readonly code: ReleaseGuardFailureCode;
    readonly message: string;
}

/**
 * Refuses a destructive "remove this server and its files/container" request when the
 * server was adopted rather than created here.
 *
 * Call this from whatever destroy path a UI wires a delete button to, before it reaches
 * `dockerhosting/manager.ts` or any transport's file-delete calls. It answers `null` -
 * meaning "not an adopted server, the ordinary destroy path may proceed" - only when the
 * registry has no record of this id being an adoption at all.
 */
export async function refuseDestroyOfAdopted(
    adoptions: AdoptionStore,
    id: string,
): Promise<ReleaseGuardFailure | null> {
    const found = await adoptions.get(id);
    if (!found.ok) return null; // Not an adopted server; the ordinary destroy path decides.
    return {
        code: "adopted-not-created",
        message:
            "This server was adopted, not created here. WorldLens may forget it, but it will never stop, remove or delete an adopted container or its files.",
    };
}

export interface ReleaseOptions {
    /** Restore the pre-adoption config snapshot before releasing, if one exists. Copies
     *  files back into `serverDir`; never touches the container itself. */
    readonly restoreSnapshot?: boolean;
}

export interface ReleaseResult {
    readonly record: AdoptionRecord;
    readonly restoredFiles: readonly string[];
}

async function restoreSnapshotInto(snapshotDir: string, serverDir: string): Promise<Answer<readonly string[]>> {
    let entries: readonly string[];
    try {
        entries = await readdir(snapshotDir);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code === "ENOENT") return ok([]);
        return fail("denied", "The pre-adoption config snapshot could not be read.", String(error));
    }
    const restored: string[] = [];
    const { copyFile } = await import("node:fs/promises");
    for (const entry of entries) {
        try {
            await copyFile(join(snapshotDir, entry), join(serverDir, entry));
            restored.push(entry);
        } catch (error) {
            return fail("denied", `"${entry}" from the pre-adoption snapshot could not be restored.`, String(error));
        }
    }
    return ok(restored);
}

/**
 * Releases an adopted server: stops WorldLens following it, deletes the `AdoptionRecord`
 * and the server-list `ServerRecord` that pointed at it, and - only if asked - copies a
 * pre-adoption config snapshot back over whatever is on disk now.
 *
 * What never happens, under any option: `docker stop`, `docker rm`, a file *delete* under
 * the server directory, or any call into a `ServerTransport`'s lifecycle or destroy paths.
 * The restore path only ever *writes* files that were already backed up at adoption time.
 */
export async function releaseAdoption(
    adoptions: AdoptionStore,
    servers: ServerRegistry,
    id: string,
    options: ReleaseOptions = {},
): Promise<Answer<ReleaseResult>> {
    const found = await adoptions.get(id);
    if (!found.ok) return found;

    let restoredFiles: readonly string[] = [];
    if (options.restoreSnapshot === true && found.value.preAdoptionBackup !== null) {
        const restored = await restoreSnapshotInto(found.value.preAdoptionBackup, found.value.serverDir);
        if (!restored.ok) return restored;
        restoredFiles = restored.value;
    }

    const removedAdoption = await adoptions.remove(id);
    if (!removedAdoption.ok) return removedAdoption;

    // Forgetting the server-list entry too, so it stops showing up as a managed server at
    // all. Same non-destructive `remove` as every other forgotten server - see the note on
    // `registry.ts`'s own `remove`.
    await servers.remove(id);

    return ok({ record: found.value, restoredFiles });
}

export function isReleaseGuardFailure(value: unknown): value is ReleaseGuardFailure {
    return (
        typeof value === "object" &&
        value !== null &&
        (value as { readonly code?: unknown }).code === "adopted-not-created"
    );
}
