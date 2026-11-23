/**
 * The settings of one live viewer, as a plain JSON document.
 *
 * The same file is read in two places: the desktop application validates it before it
 * ever starts a container, and the container validates it again on boot. Two readers of
 * one contract is deliberate. The application is the friendly one (it names the bad
 * field), the container is the strict one (it refuses to start on anything it does not
 * recognise), and neither is allowed to trust the other.
 *
 * Nothing secret lives here. A Microsoft sign-in is a separate file in a separate
 * mount; see `authCache.ts`.
 */

export const CONFIG_SCHEMA = 1;
export const VIEWER_INTERNAL_PORT = 3007;

export type ViewerKind = "viewer" | "client";
export type AuthKind = "offline" | "microsoft";
export type CameraKind = "follow" | "first";

export interface ReconnectBehaviour {
    readonly enabled: boolean;
    readonly delaySeconds: number;
    readonly tries: number;
}

export interface FollowBehaviour {
    readonly enabled: boolean;
    readonly player: string;
}

export interface BotBehaviours {
    readonly reconnect: ReconnectBehaviour;
    readonly follow: FollowBehaviour;
    readonly lookAtPlayers: boolean;
    readonly relayChat: boolean;
    readonly sleepAtNight: boolean;
}

export interface LiveViewerConfig {
    readonly schema: typeof CONFIG_SCHEMA;
    readonly kind: ViewerKind;
    readonly server: { readonly host: string; readonly port: number };
    /** A Minecraft version such as `1.21.4`, or `auto` to let the bot detect it. */
    readonly version: string;
    readonly botName: string;
    readonly auth: AuthKind;
    readonly viewDistance: number;
    readonly camera: CameraKind;
    readonly mouseLook: boolean;
    readonly showPlayers: boolean;
    readonly showChat: boolean;
    readonly behaviours: BotBehaviours;
    /**
     * Whole-string replacements applied to every visible string the container produces.
     * Supplied by the application at run time from a local file; empty when none is loaded.
     */
    readonly vocabulary: Readonly<Record<string, string>>;
}

export type ConfigResult =
    | { readonly ok: true; readonly config: LiveViewerConfig }
    | { readonly ok: false; readonly field: string; readonly message: string };

const HOST = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$|^\[[0-9A-Fa-f:.]{2,45}\]$/;
const VERSION = /^(auto|\d{1,2}\.\d{1,2}(\.\d{1,2})?)$/;
/** Java names are 3 to 16 of these; offline names are not further restricted by the game. */
const PLAYER_NAME = /^[A-Za-z0-9_]{3,16}$/;
const MAX_VOCABULARY_ENTRIES = 5000;
const MAX_VOCABULARY_STRING = 400;

export const DEFAULT_CONFIG: LiveViewerConfig = {
    schema: CONFIG_SCHEMA,
    kind: "viewer",
    server: { host: "127.0.0.1", port: 25565 },
    version: "auto",
    botName: "LensBot",
    auth: "offline",
    viewDistance: 6,
    camera: "follow",
    mouseLook: true,
    showPlayers: true,
    showChat: true,
    behaviours: {
        reconnect: { enabled: true, delaySeconds: 10, tries: 5 },
        follow: { enabled: false, player: "" },
        lookAtPlayers: false,
        relayChat: true,
        sleepAtNight: false,
    },
    vocabulary: {},
};

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function integer(value: unknown, min: number, max: number): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function bad(field: string, message: string): ConfigResult {
    return { ok: false, field, message };
}

/** Reads untrusted JSON into a configuration, or names the first field that is wrong. */
export function parseLiveViewerConfig(input: unknown): ConfigResult {
    const raw = record(input);
    if (raw === null) return bad("config", "The configuration must be a JSON object.");
    if (raw.schema !== CONFIG_SCHEMA) return bad("schema", `Only configuration schema ${CONFIG_SCHEMA} is understood.`);
    if (raw.kind !== "viewer" && raw.kind !== "client") return bad("kind", "The viewer must be 'viewer' or 'client'.");

    const server = record(raw.server);
    if (server === null) return bad("server", "A server address is required.");
    if (typeof server.host !== "string" || !HOST.test(server.host)) return bad("server.host", "The server host is not a valid name or address.");
    const port = integer(server.port, 1, 65535);
    if (port === null) return bad("server.port", "The server port must be between 1 and 65535.");

    if (typeof raw.version !== "string" || !VERSION.test(raw.version)) return bad("version", "The version must be 'auto' or a version such as 1.21.4.");
    if (typeof raw.botName !== "string" || !PLAYER_NAME.test(raw.botName)) return bad("botName", "The bot name must be 3 to 16 letters, digits or underscores.");
    if (raw.auth !== "offline" && raw.auth !== "microsoft") return bad("auth", "Sign-in must be 'offline' or 'microsoft'.");
    const viewDistance = integer(raw.viewDistance, 2, 16);
    if (viewDistance === null) return bad("viewDistance", "The view distance must be between 2 and 16 chunks.");
    if (raw.camera !== "follow" && raw.camera !== "first") return bad("camera", "The camera must be 'follow' or 'first'.");
    for (const key of ["mouseLook", "showPlayers", "showChat"] as const) {
        if (typeof raw[key] !== "boolean") return bad(key, `${key} must be true or false.`);
    }

    const behaviours = record(raw.behaviours);
    if (behaviours === null) return bad("behaviours", "Bot behaviours are required.");
    const reconnect = record(behaviours.reconnect);
    const follow = record(behaviours.follow);
    if (reconnect === null || typeof reconnect.enabled !== "boolean") return bad("behaviours.reconnect", "Reconnect settings are required.");
    const delaySeconds = integer(reconnect.delaySeconds, 1, 3600);
    if (delaySeconds === null) return bad("behaviours.reconnect.delaySeconds", "The reconnect delay must be 1 to 3600 seconds.");
    const tries = integer(reconnect.tries, 1, 1000);
    if (tries === null) return bad("behaviours.reconnect.tries", "The reconnect tries must be 1 to 1000.");
    if (follow === null || typeof follow.enabled !== "boolean") return bad("behaviours.follow", "Follow settings are required.");
    if (typeof follow.player !== "string" || (follow.player !== "" && !PLAYER_NAME.test(follow.player))) {
        return bad("behaviours.follow.player", "The player to follow must be a valid player name.");
    }
    if (follow.enabled && follow.player === "") return bad("behaviours.follow.player", "Name the player to follow, or turn following off.");
    for (const key of ["lookAtPlayers", "relayChat", "sleepAtNight"] as const) {
        if (typeof behaviours[key] !== "boolean") return bad(`behaviours.${key}`, `${key} must be true or false.`);
    }

    const vocabularyRaw = raw.vocabulary === undefined ? {} : record(raw.vocabulary);
    if (vocabularyRaw === null) return bad("vocabulary", "Vocabulary must be an object of strings.");
    const vocabulary: Record<string, string> = Object.create(null) as Record<string, string>;
    const entries = Object.entries(vocabularyRaw);
    if (entries.length > MAX_VOCABULARY_ENTRIES) return bad("vocabulary", "Vocabulary has too many entries.");
    for (const [key, value] of entries) {
        if (typeof value !== "string" || key.length > MAX_VOCABULARY_STRING || value.length > MAX_VOCABULARY_STRING) {
            return bad("vocabulary", "Vocabulary entries must be short strings.");
        }
        vocabulary[key] = value;
    }

    return {
        ok: true,
        config: {
            schema: CONFIG_SCHEMA,
            kind: raw.kind,
            server: { host: server.host, port },
            version: raw.version,
            botName: raw.botName,
            auth: raw.auth,
            viewDistance,
            camera: raw.camera,
            mouseLook: raw.mouseLook as boolean,
            showPlayers: raw.showPlayers as boolean,
            showChat: raw.showChat as boolean,
            behaviours: {
                reconnect: { enabled: reconnect.enabled, delaySeconds, tries },
                follow: { enabled: follow.enabled, player: follow.player },
                lookAtPlayers: behaviours.lookAtPlayers as boolean,
                relayChat: behaviours.relayChat as boolean,
                sleepAtNight: behaviours.sleepAtNight as boolean,
            },
            vocabulary,
        },
    };
}
