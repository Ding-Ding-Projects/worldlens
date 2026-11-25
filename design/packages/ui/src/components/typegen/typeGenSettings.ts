/**
 * What the type generator remembers between sessions: the source kind, the target language, the
 * top-level name, the inference switches and each language's own option values. The document
 * itself is never stored, because it can hold anything the person pasted.
 */
import {
    DEFAULT_INFERENCE,
    INFERENCE_KEYS,
    SOURCE_KINDS,
    type InferenceSettings,
    type OptionValue,
    type SourceKind,
} from "./typeGenTypes.js";

export const SETTINGS_KEY = "worldlens-typegen";

export interface TypeGenSettings {
    readonly kind: SourceKind;
    readonly language: string;
    readonly topLevelName: string;
    readonly inference: InferenceSettings;
    /** Option values the person changed, per language name. Unchanged options are not stored. */
    readonly options: Readonly<Record<string, Readonly<Record<string, OptionValue>>>>;
}

export const DEFAULT_SETTINGS: TypeGenSettings = {
    kind: "json",
    language: "typescript",
    topLevelName: "Root",
    inference: DEFAULT_INFERENCE,
    options: {},
};

export interface SettingsStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

/** Reads saved settings, ignoring anything that is the wrong shape rather than failing. */
export function parseSettings(text: string | null): TypeGenSettings {
    if (!text) return DEFAULT_SETTINGS;
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return DEFAULT_SETTINGS;
    }
    if (!isRecord(raw)) return DEFAULT_SETTINGS;
    const kind = SOURCE_KINDS.find((candidate) => candidate === raw.kind) ?? DEFAULT_SETTINGS.kind;
    const language = typeof raw.language === "string" && raw.language !== "" ? raw.language : DEFAULT_SETTINGS.language;
    const topLevelName = typeof raw.topLevelName === "string" && raw.topLevelName.trim() !== "" ? raw.topLevelName.slice(0, 80) : DEFAULT_SETTINGS.topLevelName;
    const inference: Record<string, boolean> = { ...DEFAULT_INFERENCE };
    if (isRecord(raw.inference)) {
        for (const key of INFERENCE_KEYS) {
            const value = raw.inference[key];
            if (typeof value === "boolean") inference[key] = value;
        }
    }
    const options: Record<string, Record<string, OptionValue>> = {};
    if (isRecord(raw.options)) {
        for (const [name, values] of Object.entries(raw.options)) {
            if (!isRecord(values)) continue;
            const clean: Record<string, OptionValue> = {};
            for (const [key, value] of Object.entries(values)) {
                if (typeof value === "string" || typeof value === "boolean") clean[key] = value;
            }
            options[name] = clean;
        }
    }
    return { kind, language, topLevelName, inference: inference as unknown as InferenceSettings, options };
}

export function loadSettings(storage: SettingsStorage | null): TypeGenSettings {
    try {
        return parseSettings(storage?.getItem(SETTINGS_KEY) ?? null);
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function saveSettings(storage: SettingsStorage | null, settings: TypeGenSettings): void {
    try {
        storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Settings are a convenience; a full or blocked store must never break the screen.
    }
}

export function defaultStorage(): SettingsStorage | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}
