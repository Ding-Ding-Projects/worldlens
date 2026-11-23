/**
 * What the viewer dialog offers in its pickers, derived from records the application
 * already keeps (managed Minecraft servers and saved SSH hosts) rather than from a list
 * written here.
 */

export interface ServerChoice {
    readonly id: string;
    readonly label: string;
    /** `localhost` for a server on this PC: hosting swaps in the PC's LAN address. */
    readonly host: string;
    readonly port: number;
    readonly version: string | null;
    readonly managed: true;
}

export interface HostChoice {
    readonly kind: "local" | "ssh";
    readonly hostId: string | null;
    readonly label: string;
}

/** The default game port, because the registry records what a server IS, not what it listens on. */
export const DEFAULT_MINECRAFT_PORT = 25565;

interface ServerRecordLike {
    readonly id: string;
    readonly name: string;
    readonly minecraftVersion: string | null;
    readonly ref: { readonly kind: string; readonly hostId?: string };
}

export function serverChoices(
    records: readonly ServerRecordLike[],
    sshAddress: (hostId: string) => string | null,
): ServerChoice[] {
    const choices: ServerChoice[] = [];
    for (const record of records) {
        const remote = record.ref.kind === "ssh-process" || record.ref.kind === "ssh-docker";
        const host = remote ? sshAddress(record.ref.hostId ?? "") : "localhost";
        if (host === null) continue;
        choices.push({ id: record.id, label: `${record.name} (${host === "localhost" ? "this PC" : host})`, host, port: DEFAULT_MINECRAFT_PORT, version: record.minecraftVersion, managed: true });
    }
    return choices;
}

export function hostChoices(profiles: readonly { readonly hostId: string; readonly target: { readonly label: string; readonly host: string } }[]): HostChoice[] {
    return [
        { kind: "local", hostId: null, label: "This PC" },
        ...profiles.map((profile): HostChoice => ({ kind: "ssh", hostId: profile.hostId, label: `${profile.target.label} (${profile.target.host})` })),
    ];
}
