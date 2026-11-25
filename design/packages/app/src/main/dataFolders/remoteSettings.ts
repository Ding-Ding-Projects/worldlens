/**
 * The remote choice for the profile history: where to send it, whether to, and whether
 * credential files may go with it.
 *
 * Kept as a small file inside the profile folder so it moves with the profile. It holds no
 * secret: the remote address is refused if it carries a user name and password, and sign-in
 * is always GitHub CLI's or the person's own Git credential manager's.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describeRemoteUrlProblem, remoteUrlProblem } from "./mirror.js";

export const REMOTE_SETTINGS_FILE = "data-folders-remote.json";

export interface RemoteSettings {
    readonly version: 1;
    /** Off by default. Nothing is ever sent while this is false. */
    readonly enabled: boolean;
    readonly url: string | null;
    /** Off by default. Only honoured for a Git server on the person's own network. */
    readonly includeCredentials: boolean;
    /** The `gh` account chosen for a GitHub remote, or null for the person's own Git sign-in. */
    readonly accountId: string | null;
    readonly lastPush: {
        readonly at: string;
        readonly sha: string;
        readonly verified: boolean;
    } | null;
    readonly lastError: string | null;
}

export const DEFAULT_REMOTE_SETTINGS: RemoteSettings = Object.freeze({
    version: 1,
    enabled: false,
    url: null,
    includeCredentials: false,
    accountId: null,
    lastPush: null,
    lastError: null,
});

export function remoteSettingsPath(profileFolder: string): string {
    return join(profileFolder, REMOTE_SETTINGS_FILE);
}

function text(value: unknown, max = 2048): string | null {
    return typeof value === "string" && value.trim() !== "" && value.length <= max ? value.trim() : null;
}

/** Reads the file, treating anything unusable as the safe defaults (off, nothing included). */
export async function readRemoteSettings(profileFolder: string): Promise<RemoteSettings> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(remoteSettingsPath(profileFolder), "utf8"));
    } catch {
        return DEFAULT_REMOTE_SETTINGS;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return DEFAULT_REMOTE_SETTINGS;
    const record = parsed as Record<string, unknown>;
    const url = text(record["url"]);
    const usable = url !== null && remoteUrlProblem(url) === null ? url : null;
    const last = record["lastPush"] as Record<string, unknown> | null | undefined;
    const lastPush =
        last !== null && typeof last === "object" && text(last["at"]) !== null && text(last["sha"]) !== null
            ? { at: text(last["at"]) as string, sha: text(last["sha"]) as string, verified: last["verified"] === true }
            : null;
    return {
        version: 1,
        // An address that no longer passes the checks switches the remote off rather than guessing.
        enabled: record["enabled"] === true && usable !== null,
        url: usable,
        includeCredentials: record["includeCredentials"] === true,
        accountId: text(record["accountId"], 256),
        lastPush,
        lastError: text(record["lastError"], 1024),
    };
}

export async function writeRemoteSettings(profileFolder: string, settings: RemoteSettings): Promise<void> {
    const file = remoteSettingsPath(profileFolder);
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(temporary, file);
}

export interface RemoteChange {
    readonly enabled?: boolean;
    readonly url?: string | null;
    readonly includeCredentials?: boolean;
    readonly accountId?: string | null;
}

export type RemoteChangeResult =
    | { readonly ok: true; readonly settings: RemoteSettings }
    | { readonly ok: false; readonly message: string };

/** Applies a change to the settings, refusing combinations that would be unsafe. */
export function applyRemoteChange(
    current: RemoteSettings,
    change: RemoteChange,
    isLan: (url: string) => boolean,
): RemoteChangeResult {
    const url = change.url === undefined ? current.url : change.url === null ? null : change.url.trim();
    if (url !== null) {
        const problem = remoteUrlProblem(url);
        if (problem !== null) return { ok: false, message: describeRemoteUrlProblem(problem) };
    }
    const enabled = change.enabled ?? current.enabled;
    if (enabled && url === null) {
        return { ok: false, message: "Give the address of a private Git repository before turning this on." };
    }
    const includeCredentials = change.includeCredentials ?? current.includeCredentials;
    if (includeCredentials && (url === null || !isLan(url))) {
        return {
            ok: false,
            message:
                "Credential files can only be included for a Git server on your own network. Set a local server address first.",
        };
    }
    return {
        ok: true,
        settings: {
            ...current,
            enabled,
            url,
            includeCredentials,
            accountId: change.accountId === undefined ? current.accountId : change.accountId,
        },
    };
}
