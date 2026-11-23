import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SshTarget } from "@worldlens/dockhand";
import { HOST_PROFILES_FILE } from "../mcserver/hostProfiles.js";
import { validateTarget, type PartialRemoteTarget } from "../remote/target.js";

/**
 * The SSH hosts a person already saved in the server manager, reused for sharing.
 *
 * Hosting a map or a live viewer over SSH asks for "a saved SSH host" rather than a new
 * address form, so the same machine is trusted once and chosen by name everywhere. The
 * file is read on each call: it is small (capped by the profile store), and reading it
 * fresh means a host saved a moment ago in the server manager is offered straight away.
 * Records that no longer validate are skipped rather than offered half-formed.
 */
export interface SavedSshHost {
    readonly id: string;
    readonly label: string;
    readonly summary: string;
}

function readTargets(dataFolder: string): readonly SshTarget[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(join(dataFolder, HOST_PROFILES_FILE), "utf8"));
    } catch {
        return [];
    }
    const profiles = (parsed as { profiles?: unknown }).profiles;
    if (!Array.isArray(profiles)) return [];
    const targets: SshTarget[] = [];
    for (const record of profiles) {
        if (typeof record !== "object" || record === null) continue;
        const { hostId, target } = record as { hostId?: unknown; target?: unknown };
        if (typeof hostId !== "string" || typeof target !== "object" || target === null) continue;
        const check = validateTarget({ ...(target as PartialRemoteTarget), id: hostId });
        if (!check.ok) continue;
        const t = check.target;
        targets.push({
            id: hostId,
            label: t.label,
            host: t.host,
            port: t.port,
            user: t.user,
            identityFile: t.identityFile,
            workDir: t.workDir,
            docker: t.docker,
        });
    }
    return targets;
}

export function savedSshTarget(dataFolder: string, id: string): SshTarget | null {
    return readTargets(dataFolder).find((target) => target.id === id) ?? null;
}

export function listSavedSshHosts(dataFolder: string): readonly SavedSshHost[] {
    return readTargets(dataFolder).map((target) => ({
        id: target.id,
        label: target.label,
        summary: `${target.user}@${target.host}${target.port === 22 ? "" : `:${target.port}`}`,
    }));
}
