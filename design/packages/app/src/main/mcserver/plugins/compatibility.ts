/**
 * Whether a plugin version can run on a given server, decided from real facts.
 *
 * Pure and synchronous, deliberately: this is compared against a `ServerRecord` and a
 * `PluginVersion`, both already fetched, and answers from their `loaders` and
 * `gameVersions` fields alone. It never looks at a name - "AntiCheatPlus-Fabric.jar"
 * tells a human something and tells this function nothing, because a filename is
 * exactly the kind of thing a plugin author can get wrong or a mirror can rename.
 */

import type { ServerFlavour, ServerRecord } from "../registry.js";
import type { PluginLoader, PluginVersion } from "./types.js";

export type CompatibilityVerdict = "compatible" | "incompatible" | "unknown";

export interface CompatibilityResult {
    readonly verdict: CompatibilityVerdict;
    readonly reason: string;
}

/**
 * Which plugin loaders a server flavour will actually load.
 *
 * Paper, Purpur and Spigot are all Bukkit-API servers: a plugin built against the
 * `bukkit`, `spigot` or `paper` API loads on any of them (a Paper-only plugin using
 * Paper-specific API will simply not load on plain Spigot - that is a runtime fact this
 * function cannot see from metadata alone, so it says `compatible` on the strength of
 * the loader tag, which is the same promise the platform itself makes).
 */
const ACCEPTED_LOADERS: Readonly<Record<ServerFlavour, readonly PluginLoader[]>> = {
    vanilla: [],
    paper: ["bukkit", "spigot", "paper"],
    spigot: ["bukkit", "spigot"],
    bukkit: ["bukkit"],
    purpur: ["bukkit", "spigot", "paper", "purpur"],
    fabric: ["fabric"],
    forge: ["forge"],
    neoforge: ["neoforge", "forge"],
    velocity: [],
    bungeecord: [],
    unknown: [],
};

export function checkCompatibility(server: ServerRecord, version: PluginVersion): CompatibilityResult {
    if (server.flavour === "unknown") {
        return {
            verdict: "unknown",
            reason: "This server's flavour has not been identified yet, so compatibility cannot be checked.",
        };
    }

    const accepted = ACCEPTED_LOADERS[server.flavour];
    if (accepted.length === 0) {
        return {
            verdict: "incompatible",
            reason: `${flavourLabel(server.flavour)} servers do not load plugins or mods this way.`,
        };
    }

    const knownLoaders = version.loaders.filter((loader) => loader !== "unknown");
    if (knownLoaders.length === 0) {
        return {
            verdict: "unknown",
            reason: "This version did not report which loader it targets.",
        };
    }

    const matchingLoader = knownLoaders.find((loader) => accepted.includes(loader));
    if (matchingLoader === undefined) {
        return {
            verdict: "incompatible",
            reason: `This version targets ${knownLoaders.join(", ")}, but ${server.name} runs ${flavourLabel(
                server.flavour,
            )}.`,
        };
    }

    if (server.minecraftVersion === null) {
        return {
            verdict: "unknown",
            reason: "This server's Minecraft version has not been identified yet, so version compatibility cannot be checked.",
        };
    }
    if (version.gameVersions.length === 0) {
        return {
            verdict: "unknown",
            reason: "This version did not report which Minecraft versions it supports.",
        };
    }
    if (!version.gameVersions.includes(server.minecraftVersion)) {
        return {
            verdict: "incompatible",
            reason: `This version supports ${version.gameVersions.join(", ")}, but ${server.name} runs Minecraft ${server.minecraftVersion}.`,
        };
    }

    return {
        verdict: "compatible",
        reason: `This version targets ${matchingLoader} and Minecraft ${server.minecraftVersion}, which matches ${server.name}.`,
    };
}

function flavourLabel(flavour: ServerFlavour): string {
    return flavour.charAt(0).toUpperCase() + flavour.slice(1);
}
