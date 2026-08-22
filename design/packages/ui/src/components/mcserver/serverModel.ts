/**
 * Pure logic for the Minecraft server hosting screens: no Vue, no bridge, no clock.
 *
 * Everything here takes a server record (and sometimes an instance status) and answers a
 * question about it - what to call its state, whether a button may be pressed, whether a row
 * survives a search. Kept apart from serverStore.ts so every rule can be exercised with a
 * plain object rather than a mounted store, and so the store's job stays "when", never "what".
 *
 * The registry and transport types are intentionally re-declared here (a structural subset,
 * not an import from the main process) so this file - and everything under packages/ui/ - stays
 * buildable without depending on packages/app/'s main-process module graph.
 */

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
];

export type ServerOrigin = "created" | "adopted";

export type TransportRef =
    | { readonly kind: "local-process"; readonly serverDir: string }
    | { readonly kind: "local-docker"; readonly containerRef: string; readonly serverDir: string }
    | {
          readonly kind: "ssh-docker";
          readonly hostId: string;
          readonly containerRef: string;
          readonly serverDir: string;
      }
    | {
          readonly kind: "aws";
          readonly region: string;
          readonly instanceId: string;
          readonly publicIp: string;
          readonly sshUser: string;
          readonly identityFile: string | null;
          readonly containerRef: string;
          readonly serverDir: string;
      };

export interface ServerRecord {
    readonly id: string;
    readonly name: string;
    readonly flavour: ServerFlavour;
    readonly minecraftVersion: string | null;
    readonly ref: TransportRef;
    readonly origin: ServerOrigin;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly hasRconSecret: boolean;
    readonly rconPort: number | null;
    readonly writeScope: readonly string[];
}

export type InstanceState = "absent" | "created" | "running" | "paused" | "exited" | "unknown";

export interface InstanceStatus {
    readonly state: InstanceState;
    readonly running: boolean;
    readonly startedAt: string | null;
    readonly exitCode: number | null;
    readonly checkedAt: string;
}

export interface TransportCapabilities {
    readonly canCreate: boolean;
    readonly canLifecycle: boolean;
    readonly canWriteFiles: boolean;
    readonly canDestroy: boolean;
    readonly console: "stdin" | "exec-helper" | "rcon" | "none";
}

/** The label a state chip shows, and the colour role it borrows from the theme. */
export interface StateLabel {
    readonly text: string;
    readonly color: "success" | "warning" | "error" | "info" | "surface";
}

/** Turns a transport's instance state into what a chip says and how it reads. */
export function stateLabel(state: InstanceState | null): StateLabel {
    switch (state) {
        case "running":
            return { text: "Running", color: "success" };
        case "created":
            return { text: "Created, not started", color: "info" };
        case "paused":
            return { text: "Paused", color: "warning" };
        case "exited":
            return { text: "Stopped", color: "surface" };
        case "absent":
            return { text: "Not created yet", color: "surface" };
        case "unknown":
            return { text: "Unknown", color: "warning" };
        case null:
        default:
            return { text: "Not checked yet", color: "surface" };
    }
}

/** Where a server record actually lives, for the list row's second line. */
export function transportSummary(record: ServerRecord): string {
    switch (record.ref.kind) {
        case "local-process":
            return "This computer";
        case "local-docker":
            return "This computer, in a container";
        case "ssh-docker":
            return "A remote host, in a container";
        case "aws":
            return "An AWS EC2 host, in a container";
    }
}

const FLAVOUR_NAMES: Record<ServerFlavour, string> = {
    vanilla: "Vanilla",
    paper: "Paper",
    spigot: "Spigot",
    bukkit: "Bukkit",
    purpur: "Purpur",
    fabric: "Fabric",
    forge: "Forge",
    neoforge: "NeoForge",
    velocity: "Velocity",
    bungeecord: "BungeeCord",
    unknown: "Unknown",
};

export function flavourName(flavour: ServerFlavour): string {
    return FLAVOUR_NAMES[flavour];
}

/**
 * Why a control that acts on this server is disabled, or null when it may be pressed.
 *
 * A disabled button with no reason reads as broken, so every caller of this must show the
 * result as the control's tooltip or adjacent text - never swallow it.
 */
export function lifecycleBlockReason(
    record: ServerRecord,
    capabilities: { readonly canLifecycle: boolean } | null,
    action: "start" | "stop",
    state: InstanceState | null,
): string | null {
    if (capabilities === null) {
        return "The host for this server could not be reached, so its state is unknown.";
    }
    if (!capabilities.canLifecycle) {
        return record.origin === "adopted"
            ? "This server was adopted, not created here, and this app was not given permission to start or stop it."
            : "This transport cannot start or stop servers.";
    }
    if (action === "start" && state === "running") return "It is already running.";
    if (action === "stop" && (state === "exited" || state === "absent" || state === null)) {
        return "It is not running.";
    }
    return null;
}

export function writeBlockReason(
    record: ServerRecord,
    capabilities: { readonly canWriteFiles: boolean } | null,
): string | null {
    if (capabilities === null) return "The host for this server could not be reached.";
    if (!capabilities.canWriteFiles) {
        return record.origin === "adopted"
            ? "This server was adopted, not created here, and this app was not given permission to write its files."
            : "This transport is read-only.";
    }
    return null;
}

export function destroyBlockReason(
    record: ServerRecord,
    capabilities: { readonly canDestroy: boolean } | null,
): string | null {
    if (capabilities === null) return "The host for this server could not be reached.";
    if (!capabilities.canDestroy) {
        return record.origin === "adopted"
            ? "This server was adopted, not created here. This app will never delete something it did not make."
            : "This transport cannot remove servers.";
    }
    return null;
}

/* -------------------------------------------------------------------------- */
/* List sort / filter / search                                                */
/* -------------------------------------------------------------------------- */

export type ServerSort = "name" | "recent" | "state";

export function sortServers(
    records: readonly ServerRecord[],
    sort: ServerSort,
    stateOf: (id: string) => InstanceState | null = () => null,
): ServerRecord[] {
    const copy = [...records];
    switch (sort) {
        case "name":
            return copy.sort((a, b) => a.name.localeCompare(b.name));
        case "recent":
            return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        case "state": {
            const rank: Record<InstanceState, number> = {
                running: 0,
                paused: 1,
                created: 2,
                unknown: 3,
                exited: 4,
                absent: 5,
            };
            return copy.sort((a, b) => {
                const ra = rank[stateOf(a.id) ?? "unknown"];
                const rb = rank[stateOf(b.id) ?? "unknown"];
                return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
            });
        }
        default:
            return copy;
    }
}

/** Plain-text predicate for the server list's own search field. Case-insensitive substring. */
export function matchesSearch(record: ServerRecord, query: string): boolean {
    const trimmed = query.trim();
    if (trimmed === "") return true;
    const needle = trimmed.toLowerCase();
    return (
        record.name.toLowerCase().includes(needle) ||
        flavourName(record.flavour).toLowerCase().includes(needle) ||
        (record.minecraftVersion ?? "").toLowerCase().includes(needle) ||
        record.id.toLowerCase().includes(needle)
    );
}

/** Same predicate, but the query may be a regex (the search bar's regex-builder mode). */
export function matchesPattern(record: ServerRecord, pattern: RegExp): boolean {
    return (
        pattern.test(record.name) ||
        pattern.test(flavourName(record.flavour)) ||
        pattern.test(record.minecraftVersion ?? "") ||
        pattern.test(record.id)
    );
}

export function filterServers(
    records: readonly ServerRecord[],
    query: string,
    useRegex: boolean,
    flags = "i",
): ServerRecord[] {
    if (query.trim() === "") return [...records];
    if (!useRegex) return records.filter((record) => matchesSearch(record, query));
    try {
        const pattern = new RegExp(query, flags);
        return records.filter((record) => matchesPattern(record, pattern));
    } catch {
        // An invalid pattern matches nothing rather than throwing through a render.
        return [];
    }
}

/* -------------------------------------------------------------------------- */
/* Create-server wizard validation                                            */
/* -------------------------------------------------------------------------- */

const ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

export function validateServerId(id: string, existingIds: readonly string[]): string | null {
    if (id.trim() === "") return "Choose an id for this server.";
    if (!ID_PATTERN.test(id)) {
        return "Lowercase letters, digits and hyphens only, starting with a letter.";
    }
    if (existingIds.includes(id)) return "A server with this id already exists.";
    return null;
}

export function validateServerName(name: string): string | null {
    return name.trim() === "" ? "Give the server a name." : null;
}

export function validatePort(port: number): string | null {
    if (!Number.isInteger(port)) return "Ports are whole numbers.";
    if (port < 1 || port > 65_535) return "Ports run from 1 to 65535.";
    return null;
}

export function validateMemoryMb(memoryMb: number): string | null {
    if (!Number.isInteger(memoryMb)) return "Memory is a whole number of megabytes.";
    if (memoryMb < 512) return "512 MB is the least a Minecraft server can start with.";
    if (memoryMb > 131_072) return "That is more memory than any host here is likely to have.";
    return null;
}
