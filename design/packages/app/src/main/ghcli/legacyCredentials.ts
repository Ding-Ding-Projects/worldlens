/** Detect and remove retired Worldlens credential files without ever reading their contents. */

import { lstat, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export interface LegacyCredentialStatus {
    readonly present: boolean;
    readonly locations: number;
    readonly message: string;
}

export interface LegacyCredentialRemoval {
    readonly removed: boolean;
    readonly locations: number;
    readonly message: string;
}

function targets(userDataDirectory: string): readonly string[] {
    if (!isAbsolute(userDataDirectory)) throw new Error("The application data directory is not absolute.");
    const root = resolve(userDataDirectory);
    const candidates = [join(root, "github-credential.json"), join(root, "github-accounts")];
    for (const candidate of candidates) {
        const child = relative(root, resolve(candidate));
        if (child === "" || child.startsWith("..") || isAbsolute(child)) {
            throw new Error("A legacy credential location escaped the application data directory.");
        }
    }
    return candidates;
}

async function exists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT" ? false : Promise.reject(error);
    }
}

/** Metadata only: no legacy file is opened, parsed, decrypted, characterized, or imported. */
export async function legacyCredentialStatus(userDataDirectory: string): Promise<LegacyCredentialStatus> {
    const present = await Promise.all(targets(userDataDirectory).map(exists));
    const locations = present.filter(Boolean).length;
    return {
        present: locations > 0,
        locations,
        message:
            locations === 0
                ? "No retired Worldlens credential files were found."
                : "Retired Worldlens credential files remain locally. Remove them only after signing in again through GitHub CLI.",
    };
}

/** Called only after the renderer's destructive-action super confirmation completes. */
export async function removeLegacyCredentials(
    userDataDirectory: string,
): Promise<LegacyCredentialRemoval> {
    const paths = targets(userDataDirectory);
    let removed = 0;
    for (const path of paths) {
        if (!(await exists(path))) continue;
        await rm(path, { recursive: true, force: false });
        removed += 1;
    }
    return {
        removed: removed > 0,
        locations: removed,
        message:
            removed === 0
                ? "No retired Worldlens credential files were present."
                : "Retired Worldlens credential files were deleted from this computer. This local deletion does not revoke any authorization still listed by GitHub.",
    };
}
