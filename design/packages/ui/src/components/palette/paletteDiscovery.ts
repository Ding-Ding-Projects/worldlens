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

export const DISCOVERY_STORAGE_KEY = "worldlens-palette-discovery";
export const MAX_RECENT_DESTINATIONS = 8;

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

function ids(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [
        ...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0)),
    ];
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
            favourites: ids(value.favourites),
            recentDestinations: ids(value.recentDestinations).slice(0, MAX_RECENT_DESTINATIONS),
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
        favourites: ids(state.favourites),
        recentDestinations: ids(state.recentDestinations).slice(0, MAX_RECENT_DESTINATIONS),
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
        : [...state.favourites, id];
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

export function discoveryTags(item: PaletteItem, state: PaletteDiscoveryState): readonly string[] {
    const tags: string[] = [];
    if (state.favourites.includes(item.id)) tags.push("favourite");
    if (state.recentDestinations.includes(item.id)) tags.push("recent");
    return tags;
}
