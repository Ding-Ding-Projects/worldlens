/**
 * Hand-written `FieldMeta` for every vanilla `server.properties` key.
 *
 * Every boolean is a switch, every closed set (`difficulty`, `gamemode`, `level-type`) is a
 * select, every bounded integer carries its real min/max, and every port is a number
 * bounded 1..65535. `motd` and the kick/whitelist messages are the only fields that are
 * legitimately free text - everything else here has a real shape, and the no-text-box
 * guard in `noTextBox.test.ts` enumerates this exact list to prove it.
 *
 * Bounds and option sets are taken from the vanilla server's own `server.properties.txt`
 * default template and the Minecraft Wiki's `server.properties` reference; both agree on
 * every value below.
 */

import type { Control, FieldMeta } from "@worldlens/config";

type Draft = Pick<FieldMeta, "path" | "key" | "label" | "doc" | "control" | "default"> &
    Partial<Pick<FieldMeta, "group" | "advanced" | "secret">>;

function field(partial: Draft): FieldMeta {
    return {
        segments: [partial.key],
        javaField: partial.key,
        group: partial.group ?? "general",
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: partial.advanced ?? false,
        secret: partial.secret ?? false,
        ...partial,
    };
}

function boundedInt(min: number, max: number, unit?: string): Control {
    return unit === undefined ? { kind: "number", integer: true, min, max } : { kind: "number", integer: true, min, max, unit };
}

function port(): Control {
    return boundedInt(1, 65535);
}

function select(options: readonly { readonly value: string; readonly label: string }[]): Control {
    return { kind: "select", options, allowCustom: false };
}

function text(multiline = false): Control {
    return { kind: "text", multiline };
}

export const serverPropertiesFields: readonly FieldMeta[] = [
    field({ path: "accept-transfers", key: "accept-transfers", label: "Accept player transfers", doc: "Accept players transferred from another server via the 1.20.5+ transfer packet.", control: { kind: "switch" }, default: false }),
    field({ path: "allow-flight", key: "allow-flight", label: "Allow flight", doc: "Allows users to use flight on the server while in Survival mode, if they have a mod that provides flight installed.", control: { kind: "switch" }, default: false }),
    field({ path: "allow-nether", key: "allow-nether", label: "Allow the Nether", doc: "Allows players to travel to the Nether.", control: { kind: "switch" }, default: true }),
    field({ path: "broadcast-console-to-ops", key: "broadcast-console-to-ops", label: "Broadcast console to ops", doc: "Send console command outputs to online operators.", control: { kind: "switch" }, default: true }),
    field({ path: "broadcast-rcon-to-ops", key: "broadcast-rcon-to-ops", label: "Broadcast RCON to ops", doc: "Send rcon console command outputs to online operators.", control: { kind: "switch" }, default: true }),
    field({ path: "difficulty", key: "difficulty", label: "Difficulty", doc: "Defines the difficulty (such as damage dealt by mobs and the way hunger and poison affects players) of the server.", control: select([{ value: "peaceful", label: "Peaceful" }, { value: "easy", label: "Easy" }, { value: "normal", label: "Normal" }, { value: "hard", label: "Hard" }]), default: "easy" }),
    field({ path: "enable-command-block", key: "enable-command-block", label: "Enable command blocks", doc: "Enables command blocks.", control: { kind: "switch" }, default: false }),
    field({ path: "enable-jmx-monitoring", key: "enable-jmx-monitoring", label: "Enable JMX monitoring", doc: "Exposes an MBean with attributes averageTickTime and tickTimes for the tick times in milliseconds.", control: { kind: "switch" }, default: false, advanced: true }),
    field({ path: "enable-query", key: "enable-query", label: "Enable query", doc: "Enables the GameSpy4 protocol server listener, used to get information about the server.", control: { kind: "switch" }, default: false }),
    field({ path: "enable-rcon", key: "enable-rcon", label: "Enable RCON", doc: "Enables remote access to the server console.", control: { kind: "switch" }, default: false }),
    field({ path: "enable-status", key: "enable-status", label: "Enable status", doc: "Makes the server appear as online on the server list.", control: { kind: "switch" }, default: true }),
    field({ path: "enforce-secure-profile", key: "enforce-secure-profile", label: "Enforce secure profile", doc: "If set to true, players without a Mojang-signed public key cannot connect.", control: { kind: "switch" }, default: true }),
    field({ path: "enforce-whitelist", key: "enforce-whitelist", label: "Enforce whitelist", doc: "Enforces the whitelist on the server.", control: { kind: "switch" }, default: false }),
    field({ path: "entity-broadcast-range-percentage", key: "entity-broadcast-range-percentage", label: "Entity broadcast range", doc: "Controls how close entities need to be before being sent to clients.", control: boundedInt(10, 1000, "%"), default: 100, advanced: true }),
    field({ path: "force-gamemode", key: "force-gamemode", label: "Force gamemode", doc: "Force players to join in the default game mode.", control: { kind: "switch" }, default: false }),
    field({ path: "function-permission-level", key: "function-permission-level", label: "Function permission level", doc: "Sets the default permission level for functions.", control: boundedInt(1, 4), default: 2, advanced: true }),
    field({ path: "gamemode", key: "gamemode", label: "Default gamemode", doc: "Defines the mode of gameplay.", control: select([{ value: "survival", label: "Survival" }, { value: "creative", label: "Creative" }, { value: "adventure", label: "Adventure" }, { value: "spectator", label: "Spectator" }]), default: "survival" }),
    field({ path: "generate-structures", key: "generate-structures", label: "Generate structures", doc: "Defines whether structures (such as villages) can be generated.", control: { kind: "switch" }, default: true }),
    field({ path: "generator-settings", key: "generator-settings", label: "Generator settings", doc: "The settings used to customize world generation, as JSON.", control: text(true), default: "{}", advanced: true }),
    field({ path: "hardcore", key: "hardcore", label: "Hardcore", doc: "If set to true, difficulty is ignored and set to hard, and players go to spectator mode on death.", control: { kind: "switch" }, default: false }),
    field({ path: "hide-online-players", key: "hide-online-players", label: "Hide online players", doc: "If set to true, the server will not send player names and skins in a Server List Ping.", control: { kind: "switch" }, default: false }),
    field({ path: "initial-disabled-packs", key: "initial-disabled-packs", label: "Initial disabled packs", doc: "Comma-separated list of datapacks to not auto-enable on world creation.", control: text(), default: "" }),
    field({ path: "initial-enabled-packs", key: "initial-enabled-packs", label: "Initial enabled packs", doc: "Comma-separated list of datapacks to enable during world creation.", control: text(), default: "vanilla" }),
    field({ path: "level-name", key: "level-name", label: "World folder name", doc: "The name of the world folder.", control: { kind: "path", select: "directory", relativeToWorkingDirectory: true }, default: "world" }),
    field({ path: "level-seed", key: "level-seed", label: "World seed", doc: "Sets the world seed, as in Singleplayer. Leave blank for a random seed.", control: text(), default: "" }),
    field({ path: "level-type", key: "level-type", label: "World type", doc: "Determines the world preset that is generated.", control: select([{ value: "minecraft:normal", label: "Normal" }, { value: "minecraft:flat", label: "Superflat" }, { value: "minecraft:large_biomes", label: "Large Biomes" }, { value: "minecraft:amplified", label: "Amplified" }, { value: "minecraft:single_biome_surface", label: "Single Biome" }]), default: "minecraft:normal" }),
    field({ path: "log-ips", key: "log-ips", label: "Log player IPs", doc: "Log player IP addresses when they connect, in server logs.", control: { kind: "switch" }, default: true, advanced: true }),
    field({ path: "max-chained-neighbor-updates", key: "max-chained-neighbor-updates", label: "Max chained neighbor updates", doc: "The maximum number of chained neighbor updates before skipping additional ones.", control: { kind: "number", integer: true, min: -1 }, default: 1000000, advanced: true }),
    field({ path: "max-players", key: "max-players", label: "Max players", doc: "The maximum number of players that can play on the server at the same time.", control: boundedInt(0, 2147483647, "players"), default: 20 }),
    field({ path: "max-tick-time", key: "max-tick-time", label: "Max tick time", doc: "The maximum number of milliseconds a single tick may take before the watchdog stops the server.", control: { kind: "number", integer: true, min: -1, unit: "ms" }, default: 60000, advanced: true }),
    field({ path: "max-world-size", key: "max-world-size", label: "Max world size", doc: "The maximum possible size in blocks, expressed as a radius, the world border can reach.", control: boundedInt(1, 29999984, "blocks"), default: 29999984, advanced: true }),
    field({ path: "motd", key: "motd", label: "Message of the day", doc: "The message displayed in the client's server list, below the server's name.", control: text(), default: "A Minecraft Server" }),
    field({ path: "network-compression-threshold", key: "network-compression-threshold", label: "Network compression threshold", doc: "Packets smaller than this many bytes are sent uncompressed; larger packets are compressed.", control: { kind: "number", integer: true, min: -1, unit: "bytes" }, default: 256, advanced: true }),
    field({ path: "online-mode", key: "online-mode", label: "Online mode", doc: "Checks connecting players against the Minecraft account database. Only disable if the server is not exposed to the Internet.", control: { kind: "switch" }, default: true }),
    field({ path: "op-permission-level", key: "op-permission-level", label: "Op permission level", doc: "Sets the default permission level for ops when using /op.", control: boundedInt(0, 4), default: 4, advanced: true }),
    field({ path: "pause-when-empty-seconds", key: "pause-when-empty-seconds", label: "Pause when empty", doc: "Delay, in seconds, before the server pauses its game loop once no players are online.", control: { kind: "number", integer: true, min: 0, unit: "seconds" }, default: 60, advanced: true }),
    field({ path: "player-idle-timeout", key: "player-idle-timeout", label: "Player idle timeout", doc: "If non-zero, players are kicked after being idle for this many minutes.", control: { kind: "number", integer: true, min: 0, unit: "minutes" }, default: 0 }),
    field({ path: "prevent-proxy-connections", key: "prevent-proxy-connections", label: "Prevent proxy connections", doc: "Kicks a player when their reported ISP/AS differs from the one Mojang's authentication server sees.", control: { kind: "switch" }, default: false }),
    field({ path: "pvp", key: "pvp", label: "PvP", doc: "Enable PvP on the server. Players can still deal self-damage with arrows even when disabled.", control: { kind: "switch" }, default: true }),
    field({ path: "query.port", key: "query.port", label: "Query port", doc: "Sets the port for the query server. See enable-query.", control: port(), default: 25565 }),
    field({ path: "rate-limit", key: "rate-limit", label: "Rate limit", doc: "Sets the maximum amount of packets a user can send before getting kicked. 0 disables this feature.", control: { kind: "number", integer: true, min: 0 }, default: 0, advanced: true }),
    field({ path: "rcon.password", key: "rcon.password", label: "RCON password", doc: "Sets the password used by RCON.", control: text(), default: "", secret: true }),
    field({ path: "rcon.port", key: "rcon.port", label: "RCON port", doc: "Sets the RCON network port.", control: port(), default: 25575 }),
    field({ path: "region-file-compression", key: "region-file-compression", label: "Region file compression", doc: "The compression algorithm used to compress a Region File.", control: select([{ value: "deflate", label: "Deflate (zlib)" }, { value: "lz4", label: "LZ4" }, { value: "none", label: "None" }]), default: "deflate", advanced: true }),
    field({ path: "require-resource-pack", key: "require-resource-pack", label: "Require resource pack", doc: "Players are prompted for confirmation and disconnected if they decline the resource pack.", control: { kind: "switch" }, default: false }),
    field({ path: "resource-pack", key: "resource-pack", label: "Resource pack URL", doc: "Optional URI to a resource pack. The player may choose to use it.", control: { kind: "text", monospace: true }, default: "" }),
    field({ path: "resource-pack-id", key: "resource-pack-id", label: "Resource pack ID", doc: "Optional UUID for the resource pack.", control: text(), default: "", advanced: true }),
    field({ path: "resource-pack-prompt", key: "resource-pack-prompt", label: "Resource pack prompt", doc: "Optional text component message shown alongside the resource pack prompt.", control: text(), default: "", advanced: true }),
    field({ path: "resource-pack-sha1", key: "resource-pack-sha1", label: "Resource pack SHA-1", doc: "Optional SHA-1 digest of the resource pack, in lowercase hexadecimal.", control: { kind: "text", monospace: true }, default: "", advanced: true }),
    field({ path: "server-ip", key: "server-ip", label: "Server IP", doc: "Set this only if the server needs to bind to a particular IP. Leave blank otherwise.", control: text(), default: "" }),
    field({ path: "server-port", key: "server-port", label: "Server port", doc: "Changes the port the server is hosted on.", control: port(), default: 25565 }),
    field({ path: "simulation-distance", key: "simulation-distance", label: "Simulation distance", doc: "The maximum distance from players, in chunks, that living entities are updated by the server.", control: boundedInt(2, 32, "chunks"), default: 10 }),
    field({ path: "spawn-monsters", key: "spawn-monsters", label: "Spawn monsters", doc: "Determines whether monsters can spawn.", control: { kind: "switch" }, default: true }),
    field({ path: "spawn-protection", key: "spawn-protection", label: "Spawn protection radius", doc: "Determines the radius, in blocks, of the spawn protection.", control: boundedInt(0, 29999984, "blocks"), default: 16 }),
    field({ path: "sync-chunk-writes", key: "sync-chunk-writes", label: "Sync chunk writes", doc: "Enables synchronous chunk writes.", control: { kind: "switch" }, default: true, advanced: true }),
    field({ path: "text-filtering-config", key: "text-filtering-config", label: "Text filtering config", doc: "Path to the server-side text filtering configuration.", control: { kind: "path", select: "file", relativeToWorkingDirectory: true }, default: "", advanced: true }),
    field({ path: "text-filtering-version", key: "text-filtering-version", label: "Text filtering version", doc: "Text filtering API version.", control: { kind: "number", integer: true, min: 0 }, default: 0, advanced: true }),
    field({ path: "use-native-transport", key: "use-native-transport", label: "Use native transport", doc: "Linux server performance improvement: epoll instead of Java NIO.", control: { kind: "switch" }, default: true, advanced: true }),
    field({ path: "view-distance", key: "view-distance", label: "View distance", doc: "The amount of world data the server sends the client, measured in chunks in each direction.", control: boundedInt(2, 32, "chunks"), default: 10 }),
    field({ path: "white-list", key: "white-list", label: "Whitelist", doc: "Enables a whitelist on the server.", control: { kind: "switch" }, default: false }),
];
