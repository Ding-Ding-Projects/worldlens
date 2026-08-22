/**
 * Hangar: PaperMC's own plugin index. `/projects` for search, `/projects/{slug}/versions`
 * for install candidates.
 *
 * Hangar only ever carries Bukkit-family plugins, so every version from here is tagged
 * `paper` regardless of what the API literally names its platform - which for Hangar is
 * PAPER, WATERFALL or VELOCITY, none of which are Fabric or Forge loaders. Hangar supplies
 * no published hash, so `hash` on every version is null; `install.ts` computes its own
 * sha256 in that case and simply has nothing published to check it against.
 */

import { fail, ok, type Answer } from "../../transport/types.js";
import type {
    PluginFetchLike,
    PluginSearchOptions,
    PluginSearchResult,
    PluginSource,
    PluginVersion,
    PluginVersionOptions,
} from "../types.js";

export const HANGAR_API_BASE = "https://hangar.papermc.io/api/v1";

function isString(value: unknown): value is string {
    return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

async function readJson(response: Response): Promise<Answer<unknown>> {
    if (!response.ok) {
        return fail(
            "command-failed",
            `Hangar answered ${String(response.status)} ${response.statusText}.`,
            await response.text().catch(() => null),
        );
    }
    try {
        return ok(await response.json());
    } catch (error) {
        return fail("command-failed", "Hangar's answer could not be read as JSON.", String(error));
    }
}

export interface HangarSourceOptions {
    readonly fetch: PluginFetchLike;
    readonly apiBase?: string;
}

export function createHangarSource(options: HangarSourceOptions): PluginSource {
    const apiBase = options.apiBase ?? HANGAR_API_BASE;

    async function search(searchOptions: PluginSearchOptions): Promise<Answer<readonly PluginSearchResult[]>> {
        const limit = clampLimit(searchOptions.limit);
        const params = new URLSearchParams({ q: searchOptions.query, limit: String(limit), offset: "0" });

        let response: Response;
        try {
            response = await options.fetch(`${apiBase}/projects?${params.toString()}`, {
                ...(searchOptions.signal === undefined ? {} : { signal: searchOptions.signal }),
            });
        } catch (error) {
            return fail("unreachable", "Hangar could not be reached.", String(error));
        }
        const parsed = await readJson(response);
        if (!parsed.ok) return parsed;
        if (!isRecord(parsed.value) || !Array.isArray(parsed.value.result)) {
            return fail("command-failed", "Hangar's search answer was not shaped as expected.");
        }

        const results: PluginSearchResult[] = [];
        for (const hit of parsed.value.result) {
            if (!isRecord(hit) || !isString(hit.name)) continue;
            const namespace = isRecord(hit.namespace) ? hit.namespace : null;
            const owner = namespace !== null && isString(namespace.owner) ? namespace.owner : null;
            const slug = namespace !== null && isString(namespace.slug) ? namespace.slug : hit.name;
            if (owner === null) continue;

            results.push({
                sourceId: "hangar",
                projectId: `${owner}/${slug}`,
                slug,
                name: hit.name,
                summary: isString(hit.description) ? hit.description : "",
                iconUrl: isString(hit.avatarUrl) ? hit.avatarUrl : null,
                downloads:
                    isRecord(hit.stats) && typeof hit.stats.downloads === "number" ? hit.stats.downloads : null,
                pageUrl: `https://hangar.papermc.io/${owner}/${slug}`,
                installable: true,
            });
        }
        return ok(results);
    }

    async function versions(
        projectId: string,
        versionOptions: PluginVersionOptions = {},
    ): Promise<Answer<readonly PluginVersion[]>> {
        const limit = 25;
        const params = new URLSearchParams({ limit: String(limit), offset: "0" });
        const url = `${apiBase}/projects/${encodeURIComponent(projectId)}/versions?${params.toString()}`;

        let response: Response;
        try {
            response = await options.fetch(url, {
                ...(versionOptions.signal === undefined ? {} : { signal: versionOptions.signal }),
            });
        } catch (error) {
            return fail("unreachable", "Hangar could not be reached.", String(error));
        }
        const parsed = await readJson(response);
        if (!parsed.ok) return parsed;
        if (!isRecord(parsed.value) || !Array.isArray(parsed.value.result)) {
            return fail("command-failed", "Hangar's version answer was not shaped as expected.");
        }

        const out: PluginVersion[] = [];
        for (const entry of parsed.value.result) {
            if (!isRecord(entry) || !isString(entry.name)) continue;
            const downloads = isRecord(entry.downloads) ? entry.downloads : {};
            // Hangar keys `downloads` by platform ("PAPER", "WATERFALL", "VELOCITY").
            // Take the first platform that carries a real file download.
            let downloadUrl: string | null = null;
            let filename: string | null = null;
            let fileSize: number | null = null;
            for (const platformKey of Object.keys(downloads)) {
                const platform = downloads[platformKey];
                if (!isRecord(platform)) continue;
                const file = isRecord(platform.fileInfo) ? platform.fileInfo : null;
                const external = isString(platform.externalUrl) ? platform.externalUrl : null;
                if (file !== null && isString(file.name)) {
                    downloadUrl = `${apiBase}/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(entry.name)}/${platformKey}/download`;
                    filename = file.name;
                    fileSize = typeof file.sizeBytes === "number" ? file.sizeBytes : null;
                    break;
                }
                if (external !== null) {
                    downloadUrl = external;
                    filename = `${entry.name}.jar`;
                    break;
                }
            }
            if (downloadUrl === null || filename === null) continue;

            const gameVersions: string[] = [];
            for (const platformKey of Object.keys(downloads)) {
                const platform = downloads[platformKey];
                if (!isRecord(platform)) continue;
                const platformVersions = platform.platformVersions;
                if (Array.isArray(platformVersions)) gameVersions.push(...platformVersions.filter(isString));
            }

            out.push({
                sourceId: "hangar",
                projectId,
                versionId: entry.name,
                versionName: entry.name,
                versionNumber: entry.name,
                // Hangar is exclusively a Bukkit-family (Paper-plugin) index.
                loaders: ["paper"],
                gameVersions,
                downloadUrl,
                filename,
                fileSize,
                // Hangar publishes no download hash; install.ts falls back to computing
                // its own sha256 and simply has nothing published to compare it to.
                hash: { sha512: null, sha1: null },
                publishedAt: isString(entry.createdAt) ? entry.createdAt : null,
            });
        }
        return ok(out);
    }

    return { id: "hangar", search, versions };
}

function clampLimit(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value) || value <= 0) return 20;
    return Math.min(Math.floor(value), 100);
}
