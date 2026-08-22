/**
 * SpigotMC: browse and link only.
 *
 * SpigotMC has no sanctioned, documented download API - resources are downloaded from
 * a page that requires a signed-in browser session and, for many resources, acceptance
 * of the author's own terms. There is no honest way to fetch a jar from here
 * unattended, so this source never returns an install action. Every result carries
 * `installable: false` and a `pageUrl` pointing at the resource on spigotmc.org, so the
 * UI can render "open on SpigotMC" and nothing that looks like a working install
 * button.
 *
 * `versions()` is unsupported for the same reason: there is nothing to resolve to a
 * downloadable file.
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

export const SPIGOT_API_BASE = "https://api.spiget.org/v2";

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
            `SpigotMC's resource list answered ${String(response.status)} ${response.statusText}.`,
            await response.text().catch(() => null),
        );
    }
    try {
        return ok(await response.json());
    } catch (error) {
        return fail("command-failed", "SpigotMC's resource list could not be read as JSON.", String(error));
    }
}

export interface SpigotSourceOptions {
    readonly fetch: PluginFetchLike;
    /**
     * The Spiget mirror used only to LIST resources for browsing. It is not, and must
     * never become, a download source - every result stays `installable: false`.
     */
    readonly apiBase?: string;
}

export function createSpigotSource(options: SpigotSourceOptions): PluginSource {
    const apiBase = options.apiBase ?? SPIGOT_API_BASE;

    async function search(searchOptions: PluginSearchOptions): Promise<Answer<readonly PluginSearchResult[]>> {
        const limit = clampLimit(searchOptions.limit);
        const params = new URLSearchParams({
            size: String(limit),
            field: "name,tag,id,icon,downloads",
        });
        const url = `${apiBase}/search/resources/${encodeURIComponent(searchOptions.query)}?${params.toString()}`;

        let response: Response;
        try {
            response = await options.fetch(url, {
                ...(searchOptions.signal === undefined ? {} : { signal: searchOptions.signal }),
            });
        } catch (error) {
            return fail("unreachable", "SpigotMC could not be reached.", String(error));
        }
        const parsed = await readJson(response);
        if (!parsed.ok) return parsed;
        if (!Array.isArray(parsed.value)) {
            return fail("command-failed", "SpigotMC's search answer was not shaped as expected.");
        }

        const results: PluginSearchResult[] = [];
        for (const hit of parsed.value) {
            if (!isRecord(hit) || (typeof hit.id !== "number" && typeof hit.id !== "string")) continue;
            if (!isString(hit.name)) continue;
            const id = String(hit.id);
            const icon = isRecord(hit.icon) && isString(hit.icon.url) ? hit.icon.url : null;
            results.push({
                sourceId: "spigot",
                projectId: id,
                slug: id,
                name: hit.name,
                summary: isString(hit.tag) ? hit.tag : "",
                iconUrl: icon !== null ? `https://www.spigotmc.org/${icon}` : null,
                downloads: typeof hit.downloads === "number" ? hit.downloads : null,
                pageUrl: `https://www.spigotmc.org/resources/${id}`,
                // SpigotMC has no sanctioned download API. This is browse-and-link only.
                installable: false,
            });
        }
        return ok(results);
    }

    async function versions(
        _projectId: string,
        _versionOptions?: PluginVersionOptions,
    ): Promise<Answer<readonly PluginVersion[]>> {
        return fail(
            "unsupported",
            "SpigotMC resources cannot be installed automatically. Open the resource page on SpigotMC to download it yourself.",
        );
    }

    return { id: "spigot", search, versions };
}

function clampLimit(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value) || value <= 0) return 20;
    return Math.min(Math.floor(value), 50);
}
