import {
    DEFAULT_RUNTIME_SETTINGS,
    MAX_HISTORY_ENTRIES,
    parseRuntimeSettingsState,
    type AccommodationKey,
    type RuntimeHistoryEntry,
    type RuntimeSettingsState,
    type RuntimeValues,
} from "./model.js";

export const RUNTIME_SETTINGS_STORAGE_KEY = "worldlens:runtime-settings:v1";
export const RUNTIME_SETTINGS_HISTORY_KEY = "worldlens:runtime-settings-history:v1";

export interface RuntimeStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function storageOrMemory(storage?: RuntimeStorage): RuntimeStorage {
    if (storage !== undefined) return storage;
    if (typeof localStorage !== "undefined") return localStorage;
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
}

function cloneState(state: RuntimeSettingsState): RuntimeSettingsState {
    return JSON.parse(JSON.stringify(state)) as RuntimeSettingsState;
}

export function loadRuntimeSettings(storage?: RuntimeStorage): RuntimeSettingsState {
    const store = storageOrMemory(storage);
    const raw = store.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
    if (raw === null) return cloneState(DEFAULT_RUNTIME_SETTINGS);
    try {
        const parsed = parseRuntimeSettingsState(JSON.parse(raw));
        return parsed === null ? cloneState(DEFAULT_RUNTIME_SETTINGS) : parsed;
    } catch {
        return cloneState(DEFAULT_RUNTIME_SETTINGS);
    }
}

export function saveRuntimeSettings(state: RuntimeSettingsState, storage?: RuntimeStorage): void {
    const parsed = parseRuntimeSettingsState(state);
    if (parsed === null) throw new Error("Runtime settings failed validation and were not saved.");
    storageOrMemory(storage).setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
}

export function readRuntimeHistory(storage?: RuntimeStorage): readonly RuntimeHistoryEntry[] {
    const raw = storageOrMemory(storage).getItem(RUNTIME_SETTINGS_HISTORY_KEY);
    if (raw === null) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry): entry is RuntimeHistoryEntry => {
                if (typeof entry !== "object" || entry === null) return false;
                const record = entry as Record<string, unknown>;
                return (
                    typeof record.id === "string" &&
                    typeof record.at === "string" &&
                    ["created", "updated", "deleted", "restored", "imported"].includes(
                        record.action as string,
                    ) &&
                    Array.isArray(record.fields) &&
                    record.fields.every((field) => typeof field === "string")
                );
            })
            .slice(0, MAX_HISTORY_ENTRIES);
    } catch {
        return [];
    }
}

export function recordRuntimeHistory(
    action: RuntimeHistoryEntry["action"],
    fields: readonly string[],
    storage?: RuntimeStorage,
): RuntimeHistoryEntry {
    const entry: RuntimeHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        action,
        fields: [...new Set(fields)].slice(0, 32),
    };
    const next = [entry, ...readRuntimeHistory(storage)].slice(0, MAX_HISTORY_ENTRIES);
    storageOrMemory(storage).setItem(RUNTIME_SETTINGS_HISTORY_KEY, JSON.stringify(next));
    return entry;
}

export function updateRuntimeValues(
    state: RuntimeSettingsState,
    patch: Partial<RuntimeValues>,
    storage?: RuntimeStorage,
): RuntimeSettingsState {
    const values = { ...state.values, ...patch } as RuntimeValues;
    const next = { ...state, values };
    saveRuntimeSettings(next, storage);
    recordRuntimeHistory("updated", Object.keys(patch), storage);
    return next;
}

export function setAccommodation(
    state: RuntimeSettingsState,
    key: AccommodationKey,
    enabled: boolean,
    storage?: RuntimeStorage,
): RuntimeSettingsState {
    return updateRuntimeValues(
        state,
        { accommodations: { ...state.values.accommodations, [key]: enabled } },
        storage,
    );
}
