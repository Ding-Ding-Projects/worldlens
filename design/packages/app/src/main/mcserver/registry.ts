/**
 * Which Minecraft servers this installation knows about.
 *
 * A small, boring file of records, deliberately. It holds what a server IS - its name, its
 * flavour and version, and which of the three places it lives - and nothing about what a
 * server currently *says*. Running state, player counts and log lines are asked of the
 * machine every time, because a cached "running" that survived a reboot is worse than no
 * answer at all: it renders as a green dot beside a server that has been down for hours.
 *
 * Nothing secret lands here. An RCON password is a live credential - anyone holding it can
 * run any command on that server - so it goes to the operating system's credential vault
 * exactly as `locks/store.ts` sends a TOTP secret there, and this file keeps only the fact
 * that one exists. An SSH host is referenced by id, never copied, so key paths and host
 * records stay in the remote module that owns them rather than being duplicated here where
 * they would drift.
 */

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteTextFile } from "../storage/atomicReplace.js";
import { fail, ok, type Answer, type TransportRef } from "./transport/types.js";

export const REGISTRY_FILE = "minecraft-servers.v1.json";
export const REGISTRY_VERSION = 1;

/**
 * A server list is a handful of small records. A file bigger than this is not a long list,
 * it is a corrupt or hostile file, and parsing it would be the only expensive thing here.
 */
export const REGISTRY_MAX_BYTES = 1024 * 1024;
export const REGISTRY_MAX_RECORDS = 500;
const MAX_STRING = 512;
const CONTAINER_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

/** Server ids appear in file names and command lines, so they stay boring on purpose. */
const ID = /^[a-z][a-z0-9-]{0,62}$/;

export type ServerFlavour =
    | "vanilla"
    | "paper"
    | "spigot"
    | "bukkit"
    | "purpur"
    | "fabric"
    | "forge"
    | "neoforge"
    | "velocity"
    | "bungeecord"
    | "unknown";

export const SERVER_FLAVOURS: readonly ServerFlavour[] = [
    "vanilla",
    "paper",
    "spigot",
    "bukkit",
    "purpur",
    "fabric",
    "forge",
    "neoforge",
    "velocity",
    "bungeecord",
    "unknown",
];

/** How this installation came to know about a server. */
export type ServerOrigin =
    /** WorldLens made it, so WorldLens may do anything to it. */
    | "created"
    /**
     * It already existed and the user handed it over.
     *
     * Kept as a first-class field rather than inferred from a missing label, because every
     * destructive path has to be able to say "this was not created here" out loud, and a
     * fact that has to be re-derived at each call site is a fact that will be forgotten at
     * one of them.
     */
    | "adopted";

export interface ServerRecord {
    readonly id: string;
    readonly name: string;
    readonly flavour: ServerFlavour;
    /** Minecraft version, or null when it genuinely is not known yet. Never guessed. */
    readonly minecraftVersion: string | null;
    readonly ref: TransportRef;
    readonly origin: ServerOrigin;
    readonly createdAt: string;
    readonly updatedAt: string;
    /**
     * Whether an RCON password has been stored for this server in the credential vault.
     *
     * The fact, never the value. A record that travels through an export, a log or a
     * screenshot carries only "yes, one exists".
     */
    readonly hasRconSecret: boolean;
    readonly rconPort: number | null;
    /** Directories WorldLens may write to. Empty means the whole server folder. */
    readonly writeScope: readonly string[];
    /**
     * How to actually launch a `local-process` server, or null when it is not known yet.
     *
     * Creation resolves all three of these and used to throw them away, so the transport
     * factory had nothing to build a local server from and every one of them was
     * permanently unstartable. Null is an honest "not resolved yet" that the factory
     * repairs by rediscovering Java, not a reason to refuse.
     */
    readonly localRuntime: LocalRuntimeRecord | null;
}

/** The three values `createLocalProcessTransport` needs, persisted with the server. */
export interface LocalRuntimeRecord {
    readonly javaPath: string;
    readonly jarPath: string;
    readonly memoryMb: number;
}

/** Reads a {@link LocalRuntimeRecord} from untrusted stored JSON. */
function parseLocalRuntime(value: unknown): LocalRuntimeRecord | null | undefined {
    if (value === undefined || value === null) return null;
    if (typeof value !== "object") return undefined;
    const raw = value as Record<string, unknown>;
    if (!hasExactKeys(raw, ["javaPath", "jarPath", "memoryMb"])) return undefined;
    if (!isString(raw.javaPath, 1024) || !isString(raw.jarPath, 1024)) return undefined;
    if (
        typeof raw.memoryMb !== "number" ||
        !Number.isInteger(raw.memoryMb) ||
        raw.memoryMb <= 0 ||
        raw.memoryMb > 1_048_576
    )
        return undefined;
    return { javaPath: raw.javaPath, jarPath: raw.jarPath, memoryMb: raw.memoryMb };
}

/** The renderer may edit labels and version metadata, never transport identity or authority. */
export interface ServerMetadataUpdate {
    readonly id: string;
    readonly name: string;
    readonly flavour: ServerFlavour;
    readonly minecraftVersion: string | null;
}

interface StoredFile {
    readonly version: number;
    readonly servers: readonly ServerRecord[];
}

function isString(value: unknown, max = MAX_STRING): value is string {
    return typeof value === "string" && value.length <= max && !/[\0]/.test(value);
}

function hasExactKeys(
    value: Record<string, unknown>,
    keys: readonly string[],
    optional: readonly string[] = [],
): boolean {
    const allowed = new Set([...keys, ...optional]);
    return (
        Object.keys(value).every((key) => allowed.has(key)) &&
        keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    );
}

function validRef(value: unknown): value is TransportRef {
    if (typeof value !== "object" || value === null) return false;
    const ref = value as Record<string, unknown>;
    if (!isString(ref.serverDir)) return false;
    switch (ref.kind) {
        case "local-process":
            return hasExactKeys(ref, ["kind", "serverDir"]);
        case "local-docker":
            return (
                hasExactKeys(ref, ["kind", "containerRef", "serverDir"]) &&
                isString(ref.containerRef, 128) &&
                CONTAINER_REFERENCE.test(ref.containerRef)
            );
        case "ssh-docker":
            return (
                hasExactKeys(ref, ["kind", "hostId", "containerRef", "serverDir"]) &&
                isString(ref.containerRef, 128) &&
                CONTAINER_REFERENCE.test(ref.containerRef) &&
                isString(ref.hostId, 128) &&
                ID.test(ref.hostId)
            );
        case "aws":
            return (
                hasExactKeys(ref, [
                    "kind",
                    "region",
                    "instanceId",
                    "publicIp",
                    "sshUser",
                    "identityFile",
                    "containerRef",
                    "serverDir",
                ]) &&
                isString(ref.region, 128) &&
                isString(ref.instanceId, 128) &&
                isString(ref.publicIp, 128) &&
                isString(ref.sshUser, 128) &&
                (ref.identityFile === null || isString(ref.identityFile, 1024)) &&
                isString(ref.containerRef, 128) &&
                CONTAINER_REFERENCE.test(ref.containerRef)
            );
        default:
            return false;
    }
}

/**
 * Reads one record, or rejects it.
 *
 * A record that fails validation is DROPPED rather than repaired. A half-understood server
 * record is a record pointing at a container or a folder we are no longer sure about, and
 * acting on it - starting it, writing to it, deleting it - is exactly the operation that
 * must not be performed on a guess.
 */
export function parseRecord(value: unknown): ServerRecord | null {
    if (typeof value !== "object" || value === null) return null;
    const raw = value as Record<string, unknown>;
    if (
        !hasExactKeys(raw, [
            "id",
            "name",
            "flavour",
            "minecraftVersion",
            "ref",
            "origin",
            "createdAt",
            "updatedAt",
            "hasRconSecret",
            "rconPort",
            "writeScope",
        ],
            ["localRuntime"],
        )
    )
        return null;
    if (!isString(raw.id, 64) || !ID.test(raw.id)) return null;
    if (!isString(raw.name) || raw.name.trim() === "") return null;
    if (!validRef(raw.ref)) return null;
    if (!isString(raw.createdAt, 64) || !isString(raw.updatedAt, 64)) return null;
    if (raw.origin !== "created" && raw.origin !== "adopted") return null;
    if (typeof raw.hasRconSecret !== "boolean") return null;
    if (!(raw.minecraftVersion === null || isString(raw.minecraftVersion, 64))) return null;

    const flavour = SERVER_FLAVOURS.includes(raw.flavour as ServerFlavour)
        ? (raw.flavour as ServerFlavour)
        : "unknown";
    const origin: ServerOrigin = raw.origin;
    const rconPort =
        raw.rconPort === null
            ? null
            : typeof raw.rconPort === "number" &&
                Number.isInteger(raw.rconPort) &&
                raw.rconPort > 0 &&
                raw.rconPort < 65_536
              ? raw.rconPort
              : undefined;
    if (rconPort === undefined) return null;
    if (!Array.isArray(raw.writeScope) || !raw.writeScope.every((entry) => isString(entry, 256)))
        return null;
    const writeScope = raw.writeScope as string[];
    const localRuntime = parseLocalRuntime(raw.localRuntime);
    if (localRuntime === undefined) return null;

    return {
        id: raw.id,
        name: raw.name,
        flavour,
        minecraftVersion: raw.minecraftVersion,
        ref: raw.ref,
        origin,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        hasRconSecret: raw.hasRconSecret === true,
        rconPort,
        writeScope,
        localRuntime,
    };
}

function parseMetadataUpdate(value: unknown): ServerMetadataUpdate | null {
    if (typeof value !== "object" || value === null) return null;
    const raw = value as Record<string, unknown>;
    if (!hasExactKeys(raw, ["id", "name", "flavour", "minecraftVersion"])) return null;
    if (!isString(raw.id, 64) || !ID.test(raw.id)) return null;
    if (!isString(raw.name) || raw.name.trim() === "") return null;
    if (!SERVER_FLAVOURS.includes(raw.flavour as ServerFlavour)) return null;
    if (!(raw.minecraftVersion === null || isString(raw.minecraftVersion, 64))) return null;
    return {
        id: raw.id,
        name: raw.name,
        flavour: raw.flavour as ServerFlavour,
        minecraftVersion: raw.minecraftVersion,
    };
}

export interface RegistryOptions {
    readonly dataFolder: string;
    readonly now?: () => string;
}

export interface ServerRegistry {
    list(): Promise<Answer<readonly ServerRecord[]>>;
    get(id: string): Promise<Answer<ServerRecord>>;
    put(record: ServerRecord): Promise<Answer<ServerRecord>>;
    updateMetadata(value: unknown): Promise<Answer<ServerRecord>>;
    remove(id: string): Promise<Answer<void>>;
}

export function createServerRegistry(options: RegistryOptions): ServerRegistry {
    const now = options.now ?? (() => new Date().toISOString());
    const file = join(options.dataFolder, REGISTRY_FILE);

    async function load(): Promise<Answer<ServerRecord[]>> {
        let text: string;
        try {
            const bytes = await readFile(file);
            if (bytes.byteLength > REGISTRY_MAX_BYTES) {
                return fail(
                    "invalid-request",
                    "The saved list of servers is too large to be a real list.",
                    `${file} is ${bytes.byteLength} bytes.`,
                );
            }
            text = bytes.toString("utf8");
        } catch (error) {
            const code = (error as NodeJS.ErrnoException | null)?.code;
            // No file yet is an empty list, not a failure. This is the first-run path.
            if (code === "ENOENT") return ok([]);
            return fail("denied", "The saved list of servers could not be read.", String(error));
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            return fail("invalid-request", "The saved list of servers is not readable.");
        }

        const stored = parsed as Partial<StoredFile>;
        if (typeof stored !== "object" || stored === null || !Array.isArray(stored.servers)) {
            return fail(
                "invalid-request",
                "The saved list of servers is not in the expected shape.",
            );
        }

        const records: ServerRecord[] = [];
        for (const entry of stored.servers.slice(0, REGISTRY_MAX_RECORDS)) {
            const record = parseRecord(entry);
            if (record !== null) records.push(record);
        }
        return ok(records);
    }

    async function save(records: readonly ServerRecord[]): Promise<Answer<void>> {
        try {
            await mkdir(dirname(file), { recursive: true });
            const payload: StoredFile = { version: REGISTRY_VERSION, servers: records };
            await atomicWriteTextFile(file, `${JSON.stringify(payload, null, 2)}\n`);
            return ok(undefined);
        } catch (error) {
            return fail("denied", "The list of servers could not be saved.", String(error));
        }
    }

    return {
        async list(): Promise<Answer<readonly ServerRecord[]>> {
            return load();
        },

        async get(id: string): Promise<Answer<ServerRecord>> {
            const loaded = await load();
            if (!loaded.ok) return loaded;
            const found = loaded.value.find((record) => record.id === id);
            if (found === undefined)
                return fail("not-found", "There is no server with that name here.");
            return ok(found);
        },

        async put(record: ServerRecord): Promise<Answer<ServerRecord>> {
            const canonical = parseRecord(record);
            if (canonical === null) {
                return fail(
                    "invalid-request",
                    "That server record does not match the complete supported schema.",
                );
            }
            const loaded = await load();
            if (!loaded.ok) return loaded;

            const existing = loaded.value.find((entry) => entry.id === canonical.id);
            if (existing === undefined && loaded.value.length >= REGISTRY_MAX_RECORDS) {
                return fail(
                    "invalid-request",
                    `This app keeps at most ${REGISTRY_MAX_RECORDS} servers.`,
                );
            }
            if (
                existing !== undefined &&
                (existing.origin !== canonical.origin ||
                    JSON.stringify(existing.ref) !== JSON.stringify(canonical.ref))
            ) {
                return fail(
                    "denied",
                    "A saved server's transport identity and origin cannot be changed through an edit.",
                );
            }

            const updated: ServerRecord = {
                ...canonical,
                // A record's creation time belongs to the record, not to whoever saved it
                // last - otherwise every edit rewrites history.
                createdAt: existing?.createdAt ?? canonical.createdAt,
                updatedAt: now(),
            };
            const next =
                existing === undefined
                    ? [...loaded.value, updated]
                    : loaded.value.map((entry) => (entry.id === canonical.id ? updated : entry));

            const saved = await save(next);
            if (!saved.ok) return saved;
            return ok(updated);
        },

        async updateMetadata(value: unknown): Promise<Answer<ServerRecord>> {
            const update = parseMetadataUpdate(value);
            if (update === null) {
                return fail(
                    "invalid-request",
                    "Only an existing server's name, flavour and version may be edited here.",
                );
            }
            const loaded = await load();
            if (!loaded.ok) return loaded;
            const existing = loaded.value.find((entry) => entry.id === update.id);
            if (existing === undefined)
                return fail("not-found", "There is no server with that name here.");

            const updated: ServerRecord = {
                ...existing,
                name: update.name,
                flavour: update.flavour,
                minecraftVersion: update.minecraftVersion,
                updatedAt: now(),
            };
            const saved = await save(
                loaded.value.map((entry) => (entry.id === update.id ? updated : entry)),
            );
            if (!saved.ok) return saved;
            return ok(updated);
        },

        async remove(id: string): Promise<Answer<void>> {
            const loaded = await load();
            if (!loaded.ok) return loaded;
            const next = loaded.value.filter((record) => record.id !== id);
            if (next.length === loaded.value.length) {
                return fail("not-found", "There is no server with that name here.");
            }
            // Forgetting a server is not deleting it. The container or folder is untouched,
            // which is what makes releasing an adopted server safe.
            return save(next);
        },
    };
}
