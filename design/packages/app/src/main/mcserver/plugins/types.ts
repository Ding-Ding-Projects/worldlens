/**
 * The shapes every plugin source and the install/manage pipeline agree on.
 *
 * A plugin can come from Modrinth, from Hangar, or - browse-only, no install action -
 * from SpigotMC. Three sources, one search result shape and one version shape, so
 * `compatibility.ts` and `install.ts` are written once against a source rather than
 * three times against three APIs that each name their fields differently.
 */

import type { Answer } from "../transport/types.js";

/** Which loader a plugin or mod actually runs under. Never guessed from a name. */
export type PluginLoader = "bukkit" | "spigot" | "paper" | "purpur" | "fabric" | "forge" | "neoforge" | "unknown";

export type PluginSourceId = "modrinth" | "hangar" | "spigot";

export interface PluginSearchResult {
    readonly sourceId: PluginSourceId;
    /** The id this source uses to look the project up again. */
    readonly projectId: string;
    readonly slug: string;
    readonly name: string;
    readonly summary: string;
    readonly iconUrl: string | null;
    readonly downloads: number | null;
    /** Where a human can read more, or - for Spigot - the only place this can be gotten. */
    readonly pageUrl: string;
    /**
     * False only for Spigot. The UI must not render an install action when this is
     * false; there is no sanctioned way to get Spigot's files automatically.
     */
    readonly installable: boolean;
}

export interface PluginFileHash {
    readonly sha512: string | null;
    readonly sha1: string | null;
}

export interface PluginVersion {
    readonly sourceId: PluginSourceId;
    readonly projectId: string;
    readonly versionId: string;
    readonly versionName: string;
    /** e.g. "1.2.3". The published version string, never a guess. */
    readonly versionNumber: string;
    readonly loaders: readonly PluginLoader[];
    readonly gameVersions: readonly string[];
    readonly downloadUrl: string;
    readonly filename: string;
    readonly fileSize: number | null;
    readonly hash: PluginFileHash;
    readonly publishedAt: string | null;
}

export interface PluginSearchOptions {
    readonly query: string;
    readonly loader?: PluginLoader;
    readonly gameVersion?: string;
    readonly limit?: number;
    readonly signal?: AbortSignal;
}

export interface PluginVersionOptions {
    readonly loader?: PluginLoader;
    readonly gameVersion?: string;
    readonly signal?: AbortSignal;
}

/** What every source implements. Spigot implements `search` and leaves `versions` unsupported. */
export interface PluginSource {
    readonly id: PluginSourceId;
    search(options: PluginSearchOptions): Promise<Answer<readonly PluginSearchResult[]>>;
    versions(projectId: string, options?: PluginVersionOptions): Promise<Answer<readonly PluginVersion[]>>;
}

/**
 * The fetch shape every source takes, so no test ever touches the network.
 *
 * Matches `download/release.ts`'s `FetchLike` exactly (a plain `RequestInit`, not a
 * narrowed subset), so `install.ts` can hand a `PluginFetchLike` straight to
 * `downloadToFile` without a wrapper.
 */
export type PluginFetchLike = (url: string, init?: RequestInit) => Promise<Response>;
