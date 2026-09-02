/**
 * App-owned SSH host profiles for Minecraft servers.
 *
 * The persisted record is intentionally smaller than SshOptionsInput. It contains only
 * validated connection metadata and the identity-file path. Key bytes, passphrases and
 * passwords are never accepted, copied or written here. The app-owned known_hosts path is
 * supplied by the store and is not renderer-configurable.
 */

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteTextFile } from "../storage/atomicReplace.js";
import type { SshOptionsInput } from "../remote/ssh.js";
import { validateTarget, type PartialRemoteTarget, type RemoteTarget } from "../remote/target.js";
import { fail, ok, type Answer } from "./transport/types.js";

export const HOST_PROFILES_FILE = "minecraft-host-profiles.v1.json";
export const HOST_PROFILES_VERSION = 1;
export const HOST_PROFILES_MAX_BYTES = 512 * 1024;
export const HOST_PROFILES_MAX_RECORDS = 100;

const HOST_ID = /^[a-z][a-z0-9-]{0,62}$/;

export interface HostProfileRecord {
    readonly hostId: string;
    readonly target: RemoteTarget;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface HostProfileDraft {
    readonly hostId: string;
    readonly target: PartialRemoteTarget;
}

interface StoredFile {
    readonly version: number;
    readonly profiles: readonly unknown[];
}

export interface HostProfileStoreOptions {
    readonly dataFolder: string;
    readonly knownHostsFile: string;
    readonly userKnownHostsFile?: string | null;
    readonly now?: () => string;
}

export interface HostProfileStore {
    list(): Promise<Answer<readonly HostProfileRecord[]>>;
    get(hostId: string): Promise<Answer<HostProfileRecord>>;
    save(draft: HostProfileDraft): Promise<Answer<HostProfileRecord>>;
    forget(hostId: string): Promise<Answer<void>>;
    sshHost(hostId: string): SshOptionsInput | null;
}

function text(value: unknown, max = 512): string | null {
    return typeof value === "string" && value.length > 0 && value.length <= max && !/[\0\r\n]/.test(value)
        ? value
        : null;
}

function profileFrom(value: unknown): HostProfileRecord | null {
    if (typeof value !== "object" || value === null) return null;
    const raw = value as Record<string, unknown>;
    const hostId = text(raw.hostId, 64);
    const createdAt = text(raw.createdAt, 64);
    const updatedAt = text(raw.updatedAt, 64);
    if (hostId === null || !HOST_ID.test(hostId) || createdAt === null || updatedAt === null) return null;
    const rawTarget = typeof raw.target === "object" && raw.target !== null ? raw.target as Record<string, unknown> : null;
    if (rawTarget === null) return null;
    // Rebuild from an allowlist so an imported profile cannot smuggle password, key bytes,
    // passphrase or other legacy fields into the validated target.
    const partial: PartialRemoteTarget = {
        id: hostId,
        label: text(rawTarget.label, 256) ?? undefined,
        host: rawTarget.host,
        port: rawTarget.port,
        user: rawTarget.user,
        identityFile: rawTarget.identityFile === null ? null : text(rawTarget.identityFile, 4_096),
        workDir: rawTarget.workDir,
        image: rawTarget.image,
        docker: rawTarget.docker,
        keepRemoteFiles: rawTarget.keepRemoteFiles === true,
    };
    const checked = validateTarget(partial);
    return checked.ok ? { hostId, target: checked.target, createdAt, updatedAt } : null;
}

function profileFailure(value: unknown): string | null {
    if (typeof value !== "object" || value === null) return "record is not an object";
    const raw = value as Record<string, unknown>;
    const allowed = new Set(["hostId", "target", "createdAt", "updatedAt"]);
    const extra = Object.keys(raw).find((key) => !allowed.has(key));
    if (extra !== undefined) return `record contains forbidden field ${extra}`;
    const parsed = profileFrom(value);
    if (parsed === null) return "record contains invalid host or connection metadata";
    const target = raw.target as Record<string, unknown>;
    const targetAllowed = new Set(["id", "label", "host", "port", "user", "identityFile", "workDir", "image", "docker", "keepRemoteFiles"]);
    const targetExtra = Object.keys(target).find((key) => !targetAllowed.has(key));
    return targetExtra === undefined ? null : `target contains forbidden field ${targetExtra}`;
}

export function parseHostProfile(value: unknown): HostProfileRecord | null {
    return profileFrom(value);
}

export function createHostProfileStore(options: HostProfileStoreOptions): HostProfileStore {
    const now = options.now ?? (() => new Date().toISOString());
    const file = join(options.dataFolder, HOST_PROFILES_FILE);
    let cache: HostProfileRecord[] | null = null;

    async function load(): Promise<Answer<HostProfileRecord[]>> {
        if (cache !== null) return ok(cache.map((profile) => ({ ...profile, target: { ...profile.target } })));
        let raw: string;
        try {
            const bytes = await readFile(file);
            if (bytes.byteLength > HOST_PROFILES_MAX_BYTES) {
                return fail("invalid-request", "The saved SSH host profiles are too large to be a profile list.");
            }
            raw = bytes.toString("utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
                cache = [];
                return ok([]);
            }
            return fail("denied", "The saved SSH host profiles could not be read.", String(error));
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return fail("invalid-request", "The saved SSH host profiles are not readable.");
        }
        const stored = parsed as Partial<StoredFile>;
        if (stored.version !== HOST_PROFILES_VERSION) {
            return fail("invalid-request", `The saved SSH host profiles use version ${String(stored.version)}; version ${String(HOST_PROFILES_VERSION)} is required.`);
        }
        if (!Array.isArray(stored.profiles)) {
            return fail("invalid-request", "The saved SSH host profiles do not contain a profile list.");
        }
        if (stored.profiles.length > HOST_PROFILES_MAX_RECORDS) {
            return fail("invalid-request", `The saved SSH host profiles contain ${String(stored.profiles.length)} records; at most ${String(HOST_PROFILES_MAX_RECORDS)} are allowed.`);
        }
        const profiles: HostProfileRecord[] = [];
        for (const [index, value] of stored.profiles.entries()) {
            const reason = profileFailure(value);
            if (reason !== null) return fail("invalid-request", `The saved SSH host profile record ${String(index + 1)} is invalid: ${reason}.`);
            const profile = profileFrom(value);
            if (profile === null) return fail("invalid-request", `The saved SSH host profile record ${String(index + 1)} is invalid.`);
            profiles.push(profile);
        }
        cache = profiles;
        return ok(cache);
    }

    async function saveAll(profiles: readonly HostProfileRecord[]): Promise<Answer<void>> {
        try {
            await mkdir(dirname(file), { recursive: true });
            await atomicWriteTextFile(file, `${JSON.stringify({ version: HOST_PROFILES_VERSION, profiles }, null, 2)}\n`);
            cache = [...profiles];
            return ok(undefined);
        } catch (error) {
            return fail("denied", "The SSH host profiles could not be saved.", String(error));
        }
    }

    return {
        async list() {
            return load();
        },
        async get(hostId) {
            const loaded = await load();
            if (!loaded.ok) return loaded;
            const found = loaded.value.find((profile) => profile.hostId === hostId);
            return found === undefined ? fail("not-found", "That SSH host profile is not saved here.") : ok(found);
        },
        async save(draft) {
            if (!HOST_ID.test(draft.hostId)) return fail("invalid-request", "A host profile id may use lower-case letters, numbers and hyphens.");
            const checked = validateTarget({ ...draft.target, id: draft.hostId });
            if (!checked.ok) return fail("invalid-request", checked.failure.message);
            const loaded = await load();
            if (!loaded.ok) return loaded;
            const existing = loaded.value.find((profile) => profile.hostId === draft.hostId);
            if (existing === undefined && loaded.value.length >= HOST_PROFILES_MAX_RECORDS) {
                return fail("invalid-request", `This app keeps at most ${HOST_PROFILES_MAX_RECORDS} SSH host profiles.`);
            }
            const profile: HostProfileRecord = {
                hostId: draft.hostId,
                target: checked.target,
                createdAt: existing?.createdAt ?? now(),
                updatedAt: now(),
            };
            const next = existing === undefined
                ? [...loaded.value, profile]
                : loaded.value.map((entry) => entry.hostId === draft.hostId ? profile : entry);
            const saved = await saveAll(next);
            return saved.ok ? ok(profile) : saved;
        },
        async forget(hostId) {
            const loaded = await load();
            if (!loaded.ok) return loaded;
            const next = loaded.value.filter((profile) => profile.hostId !== hostId);
            if (next.length === loaded.value.length) return fail("not-found", "That SSH host profile is not saved here.");
            return saveAll(next);
        },
        sshHost(hostId) {
            const profile = cache?.find((entry) => entry.hostId === hostId);
            if (profile === undefined) return null;
            return {
                target: profile.target,
                knownHostsFile: options.knownHostsFile,
                ...(options.userKnownHostsFile === undefined ? {} : { userKnownHostsFile: options.userKnownHostsFile }),
            };
        },
    };
}
