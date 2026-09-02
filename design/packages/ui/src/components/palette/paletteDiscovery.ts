/**
 * Small, local-only memory for the feature directory.
 *
 * The palette already owns the authoritative catalogue. This module only remembers how a
 * person prefers to find that catalogue: favourites and a short list of destinations visited
 * recently. It never stores labels, paths, queries, or page contents, so changing a title or
 * language cannot leave stale private text behind.
 */

import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import type { PaletteItem } from "./paletteItems.js";

export interface LivePaletteGroupProjection {
    readonly id: string;
    readonly pageId?: string;
    readonly pageIds?: readonly string[];
}

export const DISCOVERY_STORAGE_KEY = "worldlens-palette-discovery";
export const MAX_RECENT_DESTINATIONS = 8;
export const MAX_FAVOURITES = 32;
export const MAX_DISCOVERY_ID_LENGTH = 160;

/** Empty persisted groups are not actionable, so they never become enabled no-op results. */
export function omitEmptyLiveGroups<T extends LivePaletteGroupProjection>(
    entries: readonly T[],
): readonly T[] {
    return entries.filter((entry) => entry.pageId !== undefined || (entry.pageIds?.length ?? 0) > 0);
}

export interface PaletteDiscoveryState {
    readonly favourites: readonly string[];
    readonly recentDestinations: readonly string[];
}

export interface PaletteDiscoveryStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

export const DEFAULT_DISCOVERY_STATE: PaletteDiscoveryState = {
    favourites: [],
    recentDestinations: [],
};

function defaultStorage(): PaletteDiscoveryStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function ids(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) return [];
    return [
        ...new Set(
            value.filter(
                (id): id is string =>
                    typeof id === "string" && id.length > 0 && id.length <= MAX_DISCOVERY_ID_LENGTH,
            ),
        ),
    ].slice(0, limit);
}

export function readPaletteDiscovery(
    storage: PaletteDiscoveryStorage | null = defaultStorage(),
): PaletteDiscoveryState {
    if (storage === null) return DEFAULT_DISCOVERY_STATE;
    try {
        const raw = storage.getItem(DISCOVERY_STORAGE_KEY);
        if (raw === null) return DEFAULT_DISCOVERY_STATE;
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object") return DEFAULT_DISCOVERY_STATE;
        const value = parsed as { favourites?: unknown; recentDestinations?: unknown };
        return {
            favourites: ids(value.favourites, MAX_FAVOURITES),
            recentDestinations: ids(value.recentDestinations, MAX_RECENT_DESTINATIONS),
        };
    } catch {
        return DEFAULT_DISCOVERY_STATE;
    }
}

export function writePaletteDiscovery(
    state: PaletteDiscoveryState,
    storage: PaletteDiscoveryStorage | null = defaultStorage(),
): void {
    const normalized: PaletteDiscoveryState = {
        favourites: ids(state.favourites, MAX_FAVOURITES),
        recentDestinations: ids(state.recentDestinations, MAX_RECENT_DESTINATIONS),
    };
    recordAppSetting("palette-discovery", normalized);
    if (storage === null) return;
    try {
        storage.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        // A private browsing context or full quota should not make the palette unusable.
    }
}

export function togglePaletteFavourite(
    state: PaletteDiscoveryState,
    id: string,
): PaletteDiscoveryState {
    const favourites = state.favourites.includes(id)
        ? state.favourites.filter((candidate) => candidate !== id)
        : [...state.favourites, id].slice(0, MAX_FAVOURITES);
    return { ...state, favourites };
}

export function recordPaletteDestination(
    state: PaletteDiscoveryState,
    item: Pick<PaletteItem, "id" | "kind">,
): PaletteDiscoveryState {
    if (item.kind !== "destination") return state;
    return {
        ...state,
        recentDestinations: [
            item.id,
            ...state.recentDestinations.filter((id) => id !== item.id),
        ].slice(0, MAX_RECENT_DESTINATIONS),
    };
}

/**
 * Stable ordering that keeps the catalogue's categories intact while surfacing remembered
 * destinations and favourites inside their original category. This avoids duplicate rows and
 * means a favourite never becomes a second, divergent control.
 */
export function orderPaletteItems(
    items: readonly PaletteItem[],
    state: PaletteDiscoveryState,
): PaletteItem[] {
    const recent = new Map(state.recentDestinations.map((id, index) => [id, index]));
    return [...items].sort((left, right) => {
        const leftFavourite = state.favourites.includes(left.id) ? 1 : 0;
        const rightFavourite = state.favourites.includes(right.id) ? 1 : 0;
        if (leftFavourite !== rightFavourite) return rightFavourite - leftFavourite;
        const leftRecent = recent.get(left.id);
        const rightRecent = recent.get(right.id);
        if (leftRecent !== undefined || rightRecent !== undefined) {
            if (leftRecent === undefined) return 1;
            if (rightRecent === undefined) return -1;
            return leftRecent - rightRecent;
        }
        return 0;
    });
}

/** Drops stale ids when a feature was removed or capability-gated in this build. */
export function prunePaletteDiscovery(
    state: PaletteDiscoveryState,
    knownIds: ReadonlySet<string>,
): PaletteDiscoveryState {
    return {
        favourites: state.favourites.filter((id) => knownIds.has(id)),
        recentDestinations: state.recentDestinations.filter((id) => knownIds.has(id)),
    };
}

/** Returns a pruned snapshot only when it still belongs to the latest registry generation. */
export function prunePaletteDiscoveryAtGeneration(
    state: PaletteDiscoveryState,
    knownIds: ReadonlySet<string>,
    generation: number,
    currentGeneration: number,
): PaletteDiscoveryState | null {
    if (generation !== currentGeneration) return null;
    const next = prunePaletteDiscovery(state, knownIds);
    const unchanged =
        next.favourites.length === state.favourites.length &&
        next.favourites.every((id, index) => id === state.favourites[index]) &&
        next.recentDestinations.length === state.recentDestinations.length &&
        next.recentDestinations.every((id, index) => id === state.recentDestinations[index]);
    return unchanged ? null : next;
}

export function discoveryTags(item: PaletteItem, state: PaletteDiscoveryState): readonly string[] {
    const tags: string[] = [];
    if (state.favourites.includes(item.id)) tags.push("favourite");
    if (state.recentDestinations.includes(item.id)) tags.push("recent");
    return tags;
}
