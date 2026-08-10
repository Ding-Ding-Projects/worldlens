/** Resolve GitHub CLI once to an absolute executable before any credential-bearing call. */

import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";

export interface GhExecutableResolution {
    readonly executable: string | null;
    readonly message: string;
}

export interface ResolveGhExecutableOptions {
    /** Tests supply an isolated list. Production uses only conventional install roots. */
    readonly candidates?: readonly string[] | undefined;
}

function installedCandidates(): readonly string[] {
    if (process.platform === "win32") {
        const roots = [
            process.env["ProgramFiles"],
            process.env["ProgramFiles(x86)"],
            process.env["LOCALAPPDATA"],
        ].filter((value): value is string => typeof value === "string" && isAbsolute(value));
        return [
            ...roots.slice(0, 2).map((root) => join(root, "GitHub CLI", "gh.exe")),
            ...(roots[2] === undefined
                ? []
                : [join(roots[2], "Programs", "GitHub CLI", "gh.exe")]),
        ];
    }
    return ["/usr/bin/gh", "/usr/local/bin/gh", "/opt/homebrew/bin/gh"];
}

function expectedName(path: string): boolean {
    const name = basename(path).toLowerCase();
    return process.platform === "win32" ? name === "gh.exe" : name === "gh";
}

/**
 * Returns the first real regular executable from a bounded absolute candidate list.
 * PATH lookup is intentionally absent: an executable that can print a credential must
 * not be replaceable by dropping another `gh` earlier on PATH.
 */
export async function resolveGhExecutable(
    options: ResolveGhExecutableOptions = {},
): Promise<GhExecutableResolution> {
    const candidates = options.candidates ?? installedCandidates();
    for (const candidate of candidates) {
        if (!isAbsolute(candidate) || !expectedName(candidate)) continue;
        try {
            const resolved = await realpath(candidate);
            if (!isAbsolute(resolved) || !expectedName(resolved)) continue;
            const facts = await stat(resolved);
            if (!facts.isFile()) continue;
            await access(resolved, process.platform === "win32" ? constants.F_OK : constants.X_OK);
            return {
                executable: resolved,
                message: "GitHub CLI is available through a pinned absolute executable.",
            };
        } catch {
            // Try the next conventional installation location.
        }
    }
    return {
        executable: null,
        message:
            "GitHub CLI was not found in a trusted installation location. Install or upgrade it from Dependencies, then check again.",
    };
}
