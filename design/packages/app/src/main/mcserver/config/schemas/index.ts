/**
 * Registry resolving (fileKind, flavour, versionRange) to a schema.
 *
 * `server.properties` applies to every flavour (`"*"`). `bukkit.yml` and `spigot.yml`
 * predate Paper and are still read by it, so they are registered once for `"*"` too rather
 * than duplicated per flavour - a real per-flavour override still wins because
 * `resolveSchema` checks flavour-specific entries first. `paper-global.yml` and
 * `paper-world-defaults.yml` are Paper-only. `purpur.yml` is Purpur-only.
 *
 * `velocity.toml` now has its own schema, backed by the line-oriented, comment-preserving
 * TOML parser in `parseToml.ts`. Deliberately still missing: the Fabric/Forge/NeoForge
 * loader and mod config formats, which have no single stable schema across mods and are
 * left to per-file inference rather than a fabricated one.
 */

import type { FieldMeta } from "@worldlens/config";
import { bukkitFields } from "./bukkit.js";
import { paperGlobalFields } from "./paperGlobal.js";
import { paperWorldDefaultsFields } from "./paperWorldDefaults.js";
import { purpurFields } from "./purpur.js";
import { serverPropertiesFields } from "./serverProperties.js";
import { spigotFields } from "./spigot.js";
import { velocityFields } from "./velocity.js";
import { fabricFields } from "./fabric.js";
import { forgeFields } from "./forge.js";
import { neoforgeFields } from "./neoforge.js";
import { bannedIpsFields, bannedPlayersFields, opsFields, whitelistFields } from "./recordTables.js";

export interface SchemaMatch {
    /** File-kind identifier, e.g. `"server.properties"`, `"paper-world-defaults.yml"`. */
    readonly fileKind: string;
    /** Flavour this schema applies to, or `"*"` for every flavour (vanilla keys apply everywhere). */
    readonly flavour: string;
    /** Semver-ish range this schema is valid for; `"*"` means every version. */
    readonly versionRange: string;
    readonly fields: readonly FieldMeta[];
}

export const REGISTRY: readonly SchemaMatch[] = [
    { fileKind: "server.properties", flavour: "*", versionRange: "*", fields: serverPropertiesFields },
    { fileKind: "bukkit.yml", flavour: "*", versionRange: "*", fields: bukkitFields },
    { fileKind: "spigot.yml", flavour: "*", versionRange: "*", fields: spigotFields },
    { fileKind: "paper-global.yml", flavour: "paper", versionRange: "*", fields: paperGlobalFields },
    { fileKind: "paper-world-defaults.yml", flavour: "paper", versionRange: "*", fields: paperWorldDefaultsFields },
    { fileKind: "purpur.yml", flavour: "purpur", versionRange: "*", fields: purpurFields },
    { fileKind: "velocity.toml", flavour: "velocity", versionRange: "*", fields: velocityFields },
    { fileKind: "server.properties", flavour: "fabric", versionRange: "*", fields: fabricFields },
    { fileKind: "server.properties", flavour: "forge", versionRange: "*", fields: forgeFields },
    { fileKind: "server.properties", flavour: "neoforge", versionRange: "*", fields: neoforgeFields },
    { fileKind: "ops.json", flavour: "*", versionRange: "*", fields: opsFields },
    { fileKind: "whitelist.json", flavour: "*", versionRange: "*", fields: whitelistFields },
    { fileKind: "banned-players.json", flavour: "*", versionRange: "*", fields: bannedPlayersFields },
    { fileKind: "banned-ips.json", flavour: "*", versionRange: "*", fields: bannedIpsFields },
];

/**
 * Resolves the best-matching schema for a file. Flavour-specific entries win over `"*"`;
 * among those, the entry is returned as-is (no version-range narrowing yet - every entry
 * today is `"*"`, and this is where per-version key additions/removals would be threaded in
 * once a schema needs one).
 */
export function resolveSchema(fileKind: string, flavour: string, _version: string): readonly FieldMeta[] | undefined {
    const exact = REGISTRY.find((entry) => entry.fileKind === fileKind && entry.flavour === flavour);
    if (exact !== undefined) return exact.fields;
    const wildcard = REGISTRY.find((entry) => entry.fileKind === fileKind && entry.flavour === "*");
    return wildcard?.fields;
}

export { bukkitFields } from "./bukkit.js";
export { paperGlobalFields } from "./paperGlobal.js";
export { paperWorldDefaultsFields } from "./paperWorldDefaults.js";
export { purpurFields } from "./purpur.js";
export { serverPropertiesFields } from "./serverProperties.js";
export { spigotFields } from "./spigot.js";
export { velocityFields } from "./velocity.js";
export { fabricFields } from "./fabric.js";
export { forgeFields } from "./forge.js";
export { neoforgeFields } from "./neoforge.js";
export { bannedIpsFields, bannedPlayersFields, opsFields, whitelistFields } from "./recordTables.js";
