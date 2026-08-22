/**
 * Turning RCON replies into structured data, and player commands into RCON bodies.
 *
 * Pure functions in both directions, on purpose. Parsing is pure so a test can feed it
 * every reply shape a real server sends (0 players, many, a name with a space nobody
 * should have been allowed to pick) without a socket anywhere. Building is pure and
 * VALIDATING so a caller a layer above (the IPC handler) cannot accidentally forward a
 * hostile string into a live RCON command.
 *
 * ## The one rule that matters most here
 *
 * A player name that is not `/^[A-Za-z0-9_]{1,16}$/` is refused outright by every command
 * builder below, never sanitized or escaped. RCON has no quoting: the wire format in
 * `rcon/protocol.ts` sends the command body as one plain string that the server's own
 * command parser splits on whitespace. A name containing a space or a newline is not a
 * weird player name - it is a way to make the server see a SECOND command tacked onto
 * the first (`op innocent\nban admin`, or an argument boundary that turns "ban x" into
 * "ban x reason-that-is-actually-another-command"). Refusing anything outside the real
 * Minecraft username alphabet closes that off entirely rather than trying to guess which
 * characters are dangerous.
 */

import { type Answer, fail, ok } from "../transport/types.js";

/** The real constraint Mojang enforces on a username. Refuse anything else outright. */
export const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/;

export function isValidPlayerName(name: unknown): name is string {
    return typeof name === "string" && PLAYER_NAME_PATTERN.test(name);
}

export interface OnlinePlayer {
    readonly name: string;
}

export interface PlayerListResult {
    readonly online: number;
    readonly max: number;
    readonly players: readonly OnlinePlayer[];
}

/**
 * Parses the reply to the `list` command.
 *
 * The vanilla/Paper/Spigot form: "There are N of a max of M players online: a, b, c" (the
 * trailing list is omitted entirely, not even a colon, when N is 0). Anything that does
 * not match this shape is reported as a parse failure rather than guessed at - a reply
 * from an unexpected server flavour must not silently produce a plausible-looking but
 * wrong player list.
 */
export function parsePlayerList(reply: string): Answer<PlayerListResult> {
    const text = reply.trim();
    const header = /^There are (\d+) of a max(?:imum)? of (\d+) players online(?::\s*(.*))?$/i.exec(text);
    if (header === null) {
        return fail("invalid-request", "That does not look like a reply to the `list` command.", text.slice(0, 500));
    }
    const online = Number.parseInt(header[1] as string, 10);
    const max = Number.parseInt(header[2] as string, 10);
    const namesPart = header[3];
    const names =
        namesPart === undefined || namesPart.trim() === ""
            ? []
            : namesPart
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter((entry) => entry.length > 0);

    return ok({ online, max, players: names.map((name) => ({ name })) });
}

export interface PlayerFileRecord {
    readonly name: string;
    readonly uuid: string | null;
}

/**
 * Parses the JSON body of `ops.json` or `whitelist.json` - both are an array of objects
 * carrying at least `name` and `uuid`. A malformed entry is dropped rather than failing
 * the whole file, exactly as `registry.ts` drops a malformed server record: one bad row
 * must not hide every valid one.
 */
export function parseNameUuidList(json: string): Answer<readonly PlayerFileRecord[]> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        return fail("invalid-request", "That file is not valid JSON.", String(error));
    }
    if (!Array.isArray(parsed)) {
        return fail("invalid-request", "That file was not a list.");
    }
    const records: PlayerFileRecord[] = [];
    for (const entry of parsed) {
        if (typeof entry !== "object" || entry === null) continue;
        const raw = entry as Record<string, unknown>;
        if (typeof raw.name !== "string" || raw.name.length === 0 || raw.name.length > 16) continue;
        const uuid = typeof raw.uuid === "string" && raw.uuid.length <= 64 ? raw.uuid : null;
        records.push({ name: raw.name, uuid });
    }
    return ok(records);
}

export interface BannedPlayerRecord {
    readonly name: string;
    readonly uuid: string | null;
    readonly reason: string | null;
    readonly source: string | null;
    readonly expires: string | null;
}

/** Parses `banned-players.json`, which carries a few more fields than ops/whitelist. */
export function parseBannedPlayers(json: string): Answer<readonly BannedPlayerRecord[]> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        return fail("invalid-request", "That file is not valid JSON.", String(error));
    }
    if (!Array.isArray(parsed)) {
        return fail("invalid-request", "That file was not a list.");
    }
    const records: BannedPlayerRecord[] = [];
    for (const entry of parsed) {
        if (typeof entry !== "object" || entry === null) continue;
        const raw = entry as Record<string, unknown>;
        if (typeof raw.name !== "string" || raw.name.length === 0 || raw.name.length > 16) continue;
        records.push({
            name: raw.name,
            uuid: typeof raw.uuid === "string" && raw.uuid.length <= 64 ? raw.uuid : null,
            reason: typeof raw.reason === "string" && raw.reason.length <= 512 ? raw.reason : null,
            source: typeof raw.source === "string" && raw.source.length <= 128 ? raw.source : null,
            expires: typeof raw.expires === "string" && raw.expires.length <= 64 ? raw.expires : null,
        });
    }
    return ok(records);
}

export type PlayerAction = "op" | "deop" | "whitelist-add" | "whitelist-remove" | "kick" | "ban" | "pardon";

export interface PlayerActionRequest {
    readonly action: PlayerAction;
    readonly name: string;
    /** Free-text reason, for kick and ban only. Never interpolated unescaped into the command. */
    readonly reason?: string;
}

/**
 * A reason string is genuinely free text a human typed, so it cannot be refused the way
 * a player name is - but it still cannot be allowed to inject a second command. RCON's
 * wire format has no quoting, so this refuses (rather than escapes) any control
 * character, and folds internal whitespace so a reason cannot itself be mistaken for
 * extra command arguments in a way that changes what gets banned or kicked.
 */
function sanitizeReason(reason: string | undefined): string {
    if (reason === undefined) return "";
    // No control characters at all - a newline here is exactly the same class of
    // injection a player name would be, just typed by an operator instead of chosen as
    // a username.
    const withoutControlChars = reason.replace(/[\x00-\x1f\x7f]/g, " ");
    return withoutControlChars.trim().slice(0, 200);
}

/**
 * Builds the exact RCON command body for one player action, or refuses.
 *
 * This is the ONE place every op/deop/whitelist/kick/ban/pardon command is assembled.
 * Every caller - the IPC handler, any future bulk-action surface - goes through this
 * rather than building the string itself, so the name check can never be forgotten at
 * one call site while present at another.
 */
export function buildPlayerCommand(request: PlayerActionRequest): Answer<string> {
    if (!isValidPlayerName(request.name)) {
        return fail(
            "invalid-request",
            "That is not a real Minecraft player name - it must be 1-16 letters, digits or underscores.",
        );
    }

    switch (request.action) {
        case "op":
            return ok(`op ${request.name}`);
        case "deop":
            return ok(`deop ${request.name}`);
        case "whitelist-add":
            return ok(`whitelist add ${request.name}`);
        case "whitelist-remove":
            return ok(`whitelist remove ${request.name}`);
        case "pardon":
            return ok(`pardon ${request.name}`);
        case "kick": {
            const reason = sanitizeReason(request.reason);
            return ok(reason === "" ? `kick ${request.name}` : `kick ${request.name} ${reason}`);
        }
        case "ban": {
            const reason = sanitizeReason(request.reason);
            return ok(reason === "" ? `ban ${request.name}` : `ban ${request.name} ${reason}`);
        }
        default: {
            const exhaustive: never = request.action;
            return fail("invalid-request", "Unknown player action.", String(exhaustive));
        }
    }
}
