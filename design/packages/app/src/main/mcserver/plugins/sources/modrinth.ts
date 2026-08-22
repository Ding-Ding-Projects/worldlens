/**
 * Modrinth: `/search` for discovery, `/project/{id}/version` for install candidates.
 *
 * Modrinth is the one source here with a fully open, documented, no-auth API - so it
 * is also the one that supplies both `sha512` and `sha1` for every file, which is why
 * `install.ts` prefers whichever hash a source actually gives it rather than demanding
 * one specific algorithm.
 */

import { fail, ok, type Answer } from "../../transport/types.js";
import type {
    PluginFetchLike,
    PluginLoader,
    PluginSearchOptions,
    PluginSearchResult,
    PluginSource,
    PluginVersion,
    PluginVersionOptions,
} from "../types.js";

export const MODRINTH_API_BASE = "https://api.modrinth.com/v2";

const LOADER_ALIASES: Readonly<Record<string, PluginLoader>> = {
    bukkit: "bukkit",
    spigot: "spigot",
    paper: "paper",
    purpur: "purpur",
    fabric: "fabric",
    forge: "forge",
    neoforge: "neoforge",
};

function normaliseLoader(value: unknown): PluginLoader {
    if (typeof value !== "string") return "unknown";
    return LOADER_ALIASES[value.toLowerCase()] ?? "unknown";
}

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
            `Modrinth answered ${String(response.status)} ${response.statusText}.`,
            await response.text().catch(() => null),
        );
    }
    try {
        return ok(await response.json());
    } catch (error) {
        return fail("command-failed", "Modrinth's answer could not be read as JSON.", String(error));
    }
}

export interface ModrinthSourceOptions {
    readonly fetch: PluginFetchLike;
    readonly apiBase?: string;
}

export function createModrinthSource(options: ModrinthSourceOptions): PluginSource {
    const apiBase = options.apiBase ?? MODRINTH_API_BASE;

    async function search(searchOptions: PluginSearchOptions): Promise<Answer<readonly PluginSearchResult[]>> {
        const facets: string[][] = [["project_type:plugin", "project_type:mod"]];
        if (searchOptions.loader !== undefined && searchOptions.loader !== "unknown") {
            facets.push([`categories:${searchOptions.loader}`]);
        }
        if (searchOptions.gameVersion !== undefined && searchOptions.gameVersion !== "") {
            facets.push([`versions:${searchOptions.gameVersion}`]);
        }
        const limit = clampLimit(searchOptions.limit);
        const params = new URLSearchParams({
            query: searchOptions.query,
            limit: String(limit),
            facets: JSON.stringify(facets),
        });

        let response: Response;
        try {
            response = await options.fetch(`${apiBase}/search?${params.toString()}`, {
                ...(searchOptions.signal === undefined ? {} : { signal: searchOptions.signal }),
            });
        } catch (error) {
            return fail("unreachable", "Modrinth could not be reached.", String(error));
        }
        const parsed = await readJson(response);
        if (!parsed.ok) return parsed;
        if (!isRecord(parsed.value) || !Array.isArray(parsed.value.hits)) {
            return fail("command-failed", "Modrinth's search answer was not shaped as expected.");
        }

        const results: PluginSearchResult[] = [];
        for (const hit of parsed.value.hits) {
            if (!isRecord(hit) || !isString(hit.project_id) || !isString(hit.slug) || !isString(hit.title)) continue;
            results.push({
                sourceId: "modrinth",
                projectId: hit.project_id,
                slug: hit.slug,
                name: hit.title,
                summary: isString(hit.description) ? hit.description : "",
                iconUrl: isString(hit.icon_url) ? hit.icon_url : null,
                downloads: typeof hit.downloads === "number" ? hit.downloads : null,
                pageUrl: `https://modrinth.com/plugin/${hit.slug}`,
                installable: true,
            });
        }
        return ok(results);
    }

    async function versions(
        projectId: string,
        versionOptions: PluginVersionOptions = {},
    ): Promise<Answer<readonly PluginVersion[]>> {
        const params = new URLSearchParams();
        if (versionOptions.loader !== undefined && versionOptions.loader !== "unknown") {
            params.set("loaders", JSON.stringify([versionOptions.loader]));
        }
        if (versionOptions.gameVersion !== undefined && versionOptions.gameVersion !== "") {
            params.set("game_versions", JSON.stringify([versionOptions.gameVersion]));
        }
        const query = params.toString();
        const url = `${apiBase}/project/${encodeURIComponent(projectId)}/version${query === "" ? "" : `?${query}`}`;

        let response: Response;
        try {
            response = await options.fetch(url, {
                ...(versionOptions.signal === undefined ? {} : { signal: versionOptions.signal }),
            });
        } catch (error) {
            return fail("unreachable", "Modrinth could not be reached.", String(error));
        }
        const parsed = await readJson(response);
        if (!parsed.ok) return parsed;
        if (!Array.isArray(parsed.value)) {
            return fail("command-failed", "Modrinth's version answer was not shaped as expected.");
        }

        const out: PluginVersion[] = [];
        for (const entry of parsed.value) {
            if (!isRecord(entry) || !isString(entry.id) || !isString(entry.version_number)) continue;
            const files = Array.isArray(entry.files) ? entry.files : [];
            const primary =
                files.find((file): file is Record<string, unknown> => isRecord(file) && file.primary === true) ??
                files.find((file): file is Record<string, unknown> => isRecord(file));
            if (primary === undefined || !isString(primary.url) || !isString(primary.filename)) continue;
            const hashes = isRecord(primary.hashes) ? primary.hashes : {};
            const loaders = Array.isArray(entry.loaders) ? entry.loaders.map(normaliseLoader) : [];
            const gameVersions = Array.isArray(entry.game_versions)
                ? entry.game_versions.filter(isString)
                : [];

            out.push({
                sourceId: "modrinth",
                projectId,
                versionId: entry.id,
                versionName: isString(entry.name) ? entry.name : entry.version_number,
                versionNumber: entry.version_number,
                loaders,
                gameVersions,
                downloadUrl: primary.url,
                filename: primary.filename,
                fileSize: typeof primary.size === "number" ? primary.size : null,
                hash: {
                    sha512: isString(hashes.sha512) ? hashes.sha512 : null,
                    sha1: isString(hashes.sha1) ? hashes.sha1 : null,
                },
                publishedAt: isString(entry.date_published) ? entry.date_published : null,
            });
        }
        return ok(out);
    }

    return { id: "modrinth", search, versions };
}

function clampLimit(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value) || value <= 0) return 20;
    return Math.min(Math.floor(value), 100);
}
