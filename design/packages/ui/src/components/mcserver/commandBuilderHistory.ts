/**
 * Local presets and history for the command builder.
 *
 * Pure list arithmetic in this file; the actual persistence is a thin wrapper around
 * `window.localStorage`, guarded so a build with no such global (a headless test run, an
 * embedded webview without storage) degrades to "nothing persists" rather than throwing.
 */

export interface CommandHistoryEntry {
    readonly text: string;
    readonly at: number;
}

export interface CommandPreset {
    readonly id: string;
    readonly name: string;
    readonly text: string;
}

const MAX_HISTORY = 100;

/** Prepends a new entry, drops an exact-text duplicate already at the front, and caps length. */
export function pushHistory(history: readonly CommandHistoryEntry[], text: string, at: number): readonly CommandHistoryEntry[] {
    const trimmed = text.trim();
    if (trimmed === "") return history;
    const withoutDuplicateHead = history[0]?.text === trimmed ? history.slice(1) : history;
    return [{ text: trimmed, at }, ...withoutDuplicateHead].slice(0, MAX_HISTORY);
}

export function addPreset(presets: readonly CommandPreset[], name: string, text: string): readonly CommandPreset[] {
    const trimmedName = name.trim();
    const trimmedText = text.trim();
    if (trimmedName === "" || trimmedText === "") return presets;
    const id = `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return [...presets, { id, name: trimmedName, text: trimmedText }];
}

export function removePreset(presets: readonly CommandPreset[], id: string): readonly CommandPreset[] {
    return presets.filter((p) => p.id !== id);
}

const HISTORY_KEY = "wl.mcserver.commandBuilder.history";
const PRESETS_KEY = "wl.mcserver.commandBuilder.presets";

function readLocalStorage<T>(key: string, fallback: T): T {
    try {
        if (typeof window === "undefined" || !window.localStorage) return fallback;
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function writeLocalStorage(key: string, value: unknown): void {
    try {
        if (typeof window === "undefined" || !window.localStorage) return;
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage can be disabled or full; the builder keeps working in-memory for the session.
    }
}

export function loadHistory(): readonly CommandHistoryEntry[] {
    return readLocalStorage<CommandHistoryEntry[]>(HISTORY_KEY, []);
}
export function saveHistory(history: readonly CommandHistoryEntry[]): void {
    writeLocalStorage(HISTORY_KEY, history);
}
export function loadPresets(): readonly CommandPreset[] {
    return readLocalStorage<CommandPreset[]>(PRESETS_KEY, []);
}
export function savePresets(presets: readonly CommandPreset[]): void {
    writeLocalStorage(PRESETS_KEY, presets);
}
