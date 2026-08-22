/**
 * Registry resolving (fileKind, flavour, versionRange) to a schema.
 *
 * `server.properties` applies to every flavour (`"*"`). `bukkit.yml` and `spigot.yml`
 * predate Paper and are still read by it, so they are registered once for `"*"` too rather
 * than duplicated per flavour - a real per-flavour override still wins because
 * `resolveSchema` checks flavour-specific entries first. `paper-global.yml` and
 * `paper-world-defaults.yml` are Paper-only. `purpur.yml` is Purpur-only.
 *
 * Deliberately still missing: `velocity.toml` (no comment-preserving TOML round-trip
 * exists in this package yet - see `parseYaml.ts`'s doc comment for why that matters and
 * `noTextBox.test.ts`/`describe.ts` for how an unschemad file still avoids a text box), and
 * the Fabric/Forge/NeoForge loader and mod config formats, which have no single stable
 * schema across mods and are left to per-file inference rather than a fabricated one.
 */

import type { FieldMeta } from "@worldlens/config";
import { bukkitFields } from "./bukkit.js";
import { paperGlobalFields } from "./paperGlobal.js";
import { paperWorldDefaultsFields } from "./paperWorldDefaults.js";
import { purpurFields } from "./purpur.js";
import { serverPropertiesFields } from "./serverProperties.js";
import { spigotFields } from "./spigot.js";

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
