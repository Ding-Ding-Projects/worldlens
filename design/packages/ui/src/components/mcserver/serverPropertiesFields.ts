/**
 * `FieldMeta` for the `server.properties` keys the editor renders as real typed controls.
 *
 * The authoritative schema lives in the main-process `@worldlens/app` package, which this
 * lane does not own and must not edit. This is a UI-side mirror covering the keys the
 * editor exposes; every one of them is a real `Control` from `@worldlens/config`, never a
 * bare string, so `ConfigControl.vue` renders the right widget with no per-key template
 * branching.
 */

import type { Control, FieldMeta } from "@worldlens/config";

function field(partial: {
    key: string;
    label: string;
    doc: string;
    control: Control;
    default: unknown;
    group?: string;
    secret?: boolean;
}): FieldMeta {
    return {
        path: partial.key,
        key: partial.key,
        segments: [partial.key],
        javaField: partial.key,
        label: partial.label,
        doc: partial.doc,
        group: partial.group ?? "general",
        control: partial.control,
        default: partial.default,
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
        secret: partial.secret ?? false,
    };
}

function boundedInt(min: number, max: number): Control {
    return { kind: "number", integer: true, min, max };
}
function select(options: readonly string[]): Control {
    return { kind: "select", options: options.map((value) => ({ value, label: value })), allowCustom: false };
}
function text(multiline = false): Control {
    return { kind: "text", multiline };
}
function port(): Control {
    return boundedInt(1, 65535);
}
function toggle(): Control {
    return { kind: "switch" };
}

export const SERVER_PROPERTIES_GROUPS = ["general", "world", "network", "gameplay", "advanced"] as const;

export const serverPropertiesFields: readonly FieldMeta[] = [
    field({ key: "motd", label: "Message of the day", doc: "The message shown in the server list.", control: text(), default: "A Minecraft Server", group: "general" }),
    field({ key: "level-name", label: "World folder name", doc: "The name of the world folder on disk.", control: text(), default: "world", group: "world" }),
    field({ key: "difficulty", label: "Difficulty", doc: "How dangerous the world is.", control: select(["peaceful", "easy", "normal", "hard"]), default: "easy", group: "gameplay" }),
    field({ key: "gamemode", label: "Default game mode", doc: "The mode new players join in.", control: select(["survival", "creative", "adventure", "spectator"]), default: "survival", group: "gameplay" }),
    field({ key: "level-type", label: "World type", doc: "The generator used for a new world.", control: select(["minecraft:normal", "minecraft:flat", "minecraft:large_biomes", "minecraft:amplified", "minecraft:single_biome_surface"]), default: "minecraft:normal", group: "world" }),
    field({ key: "max-players", label: "Max players", doc: "The player cap.", control: boundedInt(1, 2000), default: 20, group: "general" }),
    field({ key: "view-distance", label: "View distance", doc: "How many chunks the server sends each client.", control: boundedInt(2, 32), default: 10, group: "world" }),
    field({ key: "simulation-distance", label: "Simulation distance", doc: "How far entities keep ticking.", control: boundedInt(2, 32), default: 10, group: "world" }),
    field({ key: "server-port", label: "Server port", doc: "The game port to listen on.", control: port(), default: 25565, group: "network" }),
    field({ key: "server-ip", label: "Server IP", doc: "Bind address. Leave blank for all interfaces.", control: text(), default: "", group: "network" }),
    field({ key: "spawn-protection", label: "Spawn protection radius", doc: "Blocks around spawn only operators may edit.", control: boundedInt(0, 29999984), default: 16, group: "world" }),
    field({ key: "online-mode", label: "Online mode", doc: "Verifies players against Mojang's session servers.", control: toggle(), default: true, group: "network" }),
    field({ key: "pvp", label: "Player versus player", doc: "Allows players to damage each other.", control: toggle(), default: true, group: "gameplay" }),
    field({ key: "hardcore", label: "Hardcore", doc: "Players are banned instead of respawning.", control: toggle(), default: false, group: "gameplay" }),
    field({ key: "allow-flight", label: "Allow flight", doc: "Permits flight-granting mods in survival.", control: toggle(), default: false, group: "gameplay" }),
    field({ key: "allow-nether", label: "Allow the Nether", doc: "Lets players travel to the Nether.", control: toggle(), default: true, group: "world" }),
    field({ key: "enable-command-block", label: "Enable command blocks", doc: "Turns on command blocks.", control: toggle(), default: false, group: "advanced" }),
    field({ key: "spawn-monsters", label: "Spawn monsters", doc: "Whether hostile mobs can spawn.", control: toggle(), default: true, group: "gameplay" }),
    field({ key: "spawn-animals", label: "Spawn animals", doc: "Whether passive mobs can spawn.", control: toggle(), default: true, group: "gameplay" }),
    field({ key: "generate-structures", label: "Generate structures", doc: "Villages, strongholds and the like.", control: toggle(), default: true, group: "world" }),
    field({ key: "white-list", label: "Whitelist", doc: "Only listed players may join.", control: toggle(), default: false, group: "network" }),
    field({ key: "enable-rcon", label: "Enable RCON", doc: "Remote console access.", control: toggle(), default: false, group: "advanced" }),
    field({ key: "rcon.port", label: "RCON port", doc: "Port for the remote console.", control: port(), default: 25575, group: "advanced" }),
    field({ key: "rcon.password", label: "RCON password", doc: "Password for the remote console.", control: text(), default: "", group: "advanced", secret: true }),
    field({ key: "enable-query", label: "Enable query", doc: "The GameSpy4 status protocol.", control: toggle(), default: false, group: "advanced" }),
    field({ key: "query.port", label: "Query port", doc: "Port for the query protocol.", control: port(), default: 25565, group: "advanced" }),
    field({ key: "max-world-size", label: "Max world size", doc: "The world border radius, in blocks.", control: boundedInt(1, 29999984), default: 29999984, group: "world" }),
    field({ key: "resource-pack", label: "Resource pack URL", doc: "Optional resource pack link.", control: text(), default: "", group: "advanced" }),
    field({ key: "resource-pack-sha1", label: "Resource pack SHA-1", doc: "Digest of the resource pack.", control: text(), default: "", group: "advanced" }),
];
