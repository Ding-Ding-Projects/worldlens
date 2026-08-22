/**
 * Registry resolving (fileKind, flavour, versionRange) to a schema.
 *
 * Only `server.properties` has a hand-written schema today - every other config file a
 * flavour ships (Paper's `config/paper-world-defaults.yml`, a plugin's `config.yml`) has no
 * entry here yet, and `reconcile.ts` falls back to `inferSchema.ts` for those rather than
 * refusing to render them. The registry is deliberately small and append-only: adding a
 * flavour's config later means adding a row here, not changing how resolution works.
 */

import type { FieldMeta } from "@worldlens/config";
import { serverPropertiesFields } from "./serverProperties.js";

export interface SchemaMatch {
    /** File-kind identifier, e.g. `"server.properties"`, `"paper-world-defaults"`. */
    readonly fileKind: string;
    /** Flavour this schema applies to, or `"*"` for every flavour (vanilla keys apply everywhere). */
    readonly flavour: string;
    /** Semver-ish range this schema is valid for; `"*"` means every version. */
    readonly versionRange: string;
    readonly fields: readonly FieldMeta[];
}

const REGISTRY: readonly SchemaMatch[] = [{ fileKind: "server.properties", flavour: "*", versionRange: "*", fields: serverPropertiesFields }];

/**
 * Resolves the best-matching schema for a file. Flavour-specific entries win over `"*"`;
 * among those, the entry is returned as-is (no version-range narrowing yet - every entry
 * today is `"*"`, and this is where per-version key additions/removals would be threaded in
 * once a schema needs one).
 */
export function resolveSchema(fileKind: string, flavour: string, version: string): readonly FieldMeta[] | undefined {
    const exact = REGISTRY.find((entry) => entry.fileKind === fileKind && entry.flavour === flavour);
    if (exact !== undefined) return exact.fields;
    const wildcard = REGISTRY.find((entry) => entry.fileKind === fileKind && entry.flavour === "*");
    return wildcard?.fields;
}

export { serverPropertiesFields } from "./serverProperties.js";
