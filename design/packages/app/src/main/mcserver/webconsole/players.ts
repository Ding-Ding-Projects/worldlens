/**
 * Players for the management site, read from the server's own files, and console commands
 * sent through its console.
 *
 * The desktop app lists online players over RCON with a password kept in its own vault; the
 * management site has neither, so it lists every player the server knows from
 * `usercache.json`, `ops.json`, `whitelist.json` and `banned-players.json`, with whether each
 * is an operator, whitelisted or banned. Who is online right now comes from the console:
 * the page's "Who is online" sends `list` and the answer appears there.
 *
 * Player actions are built by `buildPlayerCommand`, the same single place the desktop app
 * uses, so a name that is not a real player name never reaches the console. A free command
 * is one line, printable, and at most 256 characters.
 */
import type { Answer, ServerTransport } from "../transport/types.js";
import { fail, ok } from "../transport/types.js";
import { parseBannedPlayers, parseNameUuidList } from "../players/model.js";

export interface KnownPlayer {
    readonly name: string;
    readonly uuid: string | null;
    readonly op: boolean;
    readonly whitelisted: boolean;
    readonly banned: boolean;
    readonly banReason: string | null;
}

async function readText(transport: Pick<ServerTransport, "fileRead">, path: string): Promise<string | null> {
    const read = await transport.fileRead(path, { maxBytes: 4 * 1024 * 1024 });
    return read.ok ? Buffer.from(read.value.bytes).toString("utf8") : null;
}

export async function knownPlayers(transport: Pick<ServerTransport, "fileRead">): Promise<Answer<readonly KnownPlayer[]>> {
    const [cache, ops, whitelist, banned] = await Promise.all([
        readText(transport, "usercache.json"),
        readText(transport, "ops.json"),
        readText(transport, "whitelist.json"),
        readText(transport, "banned-players.json"),
    ]);
    const list = (text: string | null) => {
        if (text === null) return [];
        const parsed = parseNameUuidList(text);
        return parsed.ok ? parsed.value : [];
    };
    const bans = banned === null ? [] : (() => {
        const parsed = parseBannedPlayers(banned);
        return parsed.ok ? parsed.value : [];
    })();
    const byKey = new Map<string, KnownPlayer>();
    const key = (name: string) => name.toLowerCase();
    const touch = (name: string, uuid: string | null, change: Partial<KnownPlayer>) => {
        const was = byKey.get(key(name)) ?? { name, uuid, op: false, whitelisted: false, banned: false, banReason: null };
        byKey.set(key(name), { ...was, uuid: was.uuid ?? uuid, ...change });
    };
    for (const p of list(cache)) touch(p.name, p.uuid, {});
    for (const p of list(ops)) touch(p.name, p.uuid, { op: true });
    for (const p of list(whitelist)) touch(p.name, p.uuid, { whitelisted: true });
    for (const p of bans) touch(p.name, p.uuid, { banned: true, banReason: p.reason });
    if (cache === null && ops === null && whitelist === null && banned === null) {
        return fail("not-found", "This server has no player files yet. They appear after it has run once.");
    }
    return ok([...byKey.values()].sort((a, b) => a.name.localeCompare(b.name)));
}

/** A console command a person typed: one printable line, without the leading slash. */
export function cleanCommand(raw: unknown): Answer<string> {
    if (typeof raw !== "string") return fail("invalid-request", "Type a command.");
    const command = raw.trim().replace(/^\//, "");
    if (command === "") return fail("invalid-request", "Type a command.");
    if (command.length > 256) return fail("invalid-request", "A command can be at most 256 characters.");
    if (/[\x00-\x1f\x7f]/.test(command)) return fail("invalid-request", "A command is one line, with no control characters.");
    return ok(command);
}

/** Sends one command through a short-lived console session. */
export async function sendCommand(
    transport: Pick<ServerTransport, "attach">,
    command: string,
): Promise<Answer<void>> {
    const attached = await transport.attach({ tail: 0 });
    if (!attached.ok) return attached;
    try {
        return await attached.value.send(command);
    } finally {
        attached.value.detach();
    }
}
