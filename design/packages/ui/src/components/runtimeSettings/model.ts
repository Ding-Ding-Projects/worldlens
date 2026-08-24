/**
 * Versioned runtime preferences shared by the desktop settings surface.
 *
 * This module deliberately contains no Vue or Electron imports. The renderer can use it
 * in a browser-only preview, while the desktop settings panel and its tests share exactly
 * the same validation and schedule semantics.
 */

export const RUNTIME_SETTINGS_VERSION = 1;
export const MAX_SCHEDULE_RULES = 128;
export const MAX_HISTORY_ENTRIES = 100;

export type RuntimeLanguage = "en" | "yue" | "both";
export type RuntimeTheme = "system" | "light" | "dark" | "contrast";
export type RuntimeDensity = "comfortable" | "compact" | "spacious";
export type RuntimeMotion = "system" | "full" | "reduced";
export type RuntimeSettingKey =
    | "language"
    | "theme"
    | "density"
    | "accent"
    | "fontFamily"
    | "fontSize"
    | "motion"
    | "displayName";
export type RuntimeSource = "local" | "https" | "homeAssistant";
export type AccommodationKey =
    "focus" | "lowStimulation" | "timeAwareness" | "oneThingAtATime" | "momentum";
const RUNTIME_SETTING_KEYS: readonly RuntimeSettingKey[] = [
    "language",
    "theme",
    "density",
    "accent",
    "fontFamily",
    "fontSize",
    "motion",
    "displayName",
];

export interface RuntimeAccommodations {
    readonly focus: boolean;
    readonly lowStimulation: boolean;
    readonly timeAwareness: boolean;
    readonly oneThingAtATime: boolean;
    readonly momentum: boolean;
}

export interface NarratorSettings {
    readonly enabled: boolean;
    readonly language: "en" | "yue" | "both";
    readonly englishVoiceId: string | null;
    readonly cantoneseVoiceId: string | null;
    readonly rate: number;
    readonly pitch: number;
    readonly cooldownMs: number;
    readonly quietHours: boolean;
}

export interface RuntimeValues {
    readonly language: RuntimeLanguage;
    readonly theme: RuntimeTheme;
    readonly density: RuntimeDensity;
    readonly accent: string;
    readonly fontFamily: string;
    readonly fontSize: number;
    readonly motion: RuntimeMotion;
    readonly displayName: string;
    readonly nextAction: string;
    readonly accommodations: RuntimeAccommodations;
    readonly narrator: NarratorSettings;
}

export interface RuntimeSourceConfig {
    readonly url?: string;
    readonly entityId?: string;
    /** A credential-vault key reference, never a bearer value. */
    readonly credentialRef?: string;
}

export interface ScheduledRule {
    readonly id: string;
    readonly label: string;
    readonly enabled: boolean;
    readonly priority: number;
    readonly weekdays: readonly number[];
    readonly startDate: string | null;
    readonly endDate: string | null;
    readonly startTime: string;
    readonly endTime: string;
    readonly setting: RuntimeSettingKey;
    readonly value: string | number;
    readonly source: RuntimeSource;
    readonly sourceConfig: RuntimeSourceConfig;
}

export interface RuntimeSettingsState {
    readonly version: number;
    readonly values: RuntimeValues;
    readonly schedules: readonly ScheduledRule[];
}

export interface RuntimeHistoryEntry {
    readonly id: string;
    readonly at: string;
    readonly action: "created" | "updated" | "deleted" | "restored" | "imported";
    readonly fields: readonly string[];
}

export const DEFAULT_RUNTIME_VALUES: RuntimeValues = {
    language: "en",
    theme: "system",
    density: "comfortable",
    accent: "#6750A4",
    fontFamily: "system-ui",
    fontSize: 1,
    motion: "system",
    displayName: "Worldlens",
    nextAction: "",
    accommodations: {
        focus: false,
        lowStimulation: false,
        timeAwareness: false,
        oneThingAtATime: false,
        momentum: false,
    },
    narrator: {
        enabled: false,
        language: "en",
        englishVoiceId: null,
        cantoneseVoiceId: null,
        rate: 1,
        pitch: 1,
        cooldownMs: 1200,
        quietHours: false,
    },
};

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettingsState = {
    version: RUNTIME_SETTINGS_VERSION,
    values: DEFAULT_RUNTIME_VALUES,
    schedules: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
    return typeof value === "string" && value.length <= max;
}

function finiteNumber(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(record).every((key) => allowed.includes(key));
}

function validSourceUrl(url: string, allowPrivateNetwork = false): boolean {
    try {
        const parsed = new URL(url);
        return (
            parsed.protocol === "https:" ||
            (parsed.protocol === "http:" &&
                (parsed.hostname === "localhost" ||
                    parsed.hostname === "127.0.0.1" ||
                    parsed.hostname === "[::1]" ||
                    allowPrivateNetwork))
        );
    } catch {
        return false;
    }
}

function validTime(value: string): boolean {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validDate(value: string | null): boolean {
    if (value === null) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateSourceConfig(source: RuntimeSource, value: unknown): value is RuntimeSourceConfig {
    if (!isRecord(value)) return false;
    if (!hasOnlyKeys(value, ["url", "entityId", "credentialRef"])) return false;
    const url = value.url;
    const entityId = value.entityId;
    const credentialRef = value.credentialRef;
    if (url !== undefined && (!boundedString(url, 2048) || !validSourceUrl(url, source === "homeAssistant"))) return false;
    if (
        entityId !== undefined &&
        (!boundedString(entityId, 256) || !/^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9_.-]+$/.test(entityId))
    )
        return false;
    if (
        credentialRef !== undefined &&
        (!boundedString(credentialRef, 200) || credentialRef.includes(" "))
    )
        return false;
    if (source === "local") return true;
    if (source === "https") return typeof url === "string";
    return (
        typeof url === "string" && typeof entityId === "string" && typeof credentialRef === "string"
    );
}

function validSettingValue(setting: RuntimeSettingKey, value: unknown): boolean {
    if (setting === "fontSize")
        return (
            (typeof value === "number" && finiteNumber(value, 0.75, 2)) ||
            (typeof value === "string" && finiteNumber(Number(value), 0.75, 2))
        );
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > (setting === "displayName" ? 120 : 512)
    )
        return false;
    if (setting === "language") return ["en", "yue", "both"].includes(value);
    if (setting === "theme") return ["system", "light", "dark", "contrast"].includes(value);
    if (setting === "density") return ["comfortable", "compact", "spacious"].includes(value);
    if (setting === "motion") return ["system", "full", "reduced"].includes(value);
    if (setting === "accent") return /^#[0-9a-f]{6,8}$/i.test(value);
    return true;
}

function parseValues(value: unknown): RuntimeValues | null {
    if (!isRecord(value)) return null;
    const accommodations = value.accommodations;
    const narrator = value.narrator;
    if (!isRecord(accommodations) || !isRecord(narrator)) return null;
    if (
        !hasOnlyKeys(value, [
            "language",
            "theme",
            "density",
            "accent",
            "fontFamily",
            "fontSize",
            "motion",
            "displayName",
            "nextAction",
            "accommodations",
            "narrator",
        ])
    )
        return null;
    if (
        !hasOnlyKeys(accommodations, [
            "focus",
            "lowStimulation",
            "timeAwareness",
            "oneThingAtATime",
            "momentum",
        ])
    )
        return null;
    if (
        !hasOnlyKeys(narrator, [
            "enabled",
            "language",
            "englishVoiceId",
            "cantoneseVoiceId",
            "rate",
            "pitch",
            "cooldownMs",
            "quietHours",
        ])
    )
        return null;
    const language = value.language as RuntimeLanguage;
    const theme = value.theme as RuntimeTheme;
    const density = value.density as RuntimeDensity;
    const motion = value.motion as RuntimeMotion;
    if (!(["en", "yue", "both"] as const).includes(language as RuntimeLanguage)) return null;
    if (!(["system", "light", "dark", "contrast"] as const).includes(theme as RuntimeTheme))
        return null;
    if (!(["comfortable", "compact", "spacious"] as const).includes(density as RuntimeDensity))
        return null;
    if (!(["system", "full", "reduced"] as const).includes(motion as RuntimeMotion)) return null;
    if (!boundedString(value.accent, 32) || !/^#[0-9a-f]{6,8}$/i.test(value.accent)) return null;
    if (!boundedString(value.fontFamily, 200) || !finiteNumber(value.fontSize, 0.75, 2))
        return null;
    if (!boundedString(value.displayName, 120) || value.displayName.trim().length === 0)
        return null;
    if (!boundedString(value.nextAction, 240)) return null;
    for (const key of [
        "focus",
        "lowStimulation",
        "timeAwareness",
        "oneThingAtATime",
        "momentum",
    ] as const) {
        if (typeof accommodations[key] !== "boolean") return null;
    }
    if (
        typeof narrator.enabled !== "boolean" ||
        !(["en", "yue", "both"] as const).includes(narrator.language as RuntimeLanguage)
    )
        return null;
    if (
        (narrator.englishVoiceId !== null && !boundedString(narrator.englishVoiceId, 512)) ||
        (narrator.cantoneseVoiceId !== null && !boundedString(narrator.cantoneseVoiceId, 512))
    )
        return null;
    if (
        !finiteNumber(narrator.rate, 0.1, 4) ||
        !finiteNumber(narrator.pitch, 0, 2) ||
        !finiteNumber(narrator.cooldownMs, 0, 60_000) ||
        typeof narrator.quietHours !== "boolean"
    )
        return null;
    return {
        language,
        theme,
        density,
        accent: value.accent,
        fontFamily: value.fontFamily,
        fontSize: value.fontSize,
        motion,
        displayName: value.displayName,
        nextAction: value.nextAction,
        accommodations: {
            focus: accommodations.focus as boolean,
            lowStimulation: accommodations.lowStimulation as boolean,
            timeAwareness: accommodations.timeAwareness as boolean,
            oneThingAtATime: accommodations.oneThingAtATime as boolean,
            momentum: accommodations.momentum as boolean,
        },
        narrator: {
            enabled: narrator.enabled,
            language: narrator.language as "en" | "yue" | "both",
            englishVoiceId: narrator.englishVoiceId,
            cantoneseVoiceId: narrator.cantoneseVoiceId,
            rate: narrator.rate,
            pitch: narrator.pitch,
            cooldownMs: narrator.cooldownMs,
            quietHours: narrator.quietHours,
        },
    };
}

function parseRule(value: unknown): ScheduledRule | null {
    if (!isRecord(value)) return null;
    const source = value.source as RuntimeSource;
    const setting = value.setting as RuntimeSettingKey;
    if (!boundedString(value.id, 80) || !/^[a-zA-Z0-9_.-]+$/.test(value.id)) return null;
    if (
        !boundedString(value.label, 120) ||
        typeof value.enabled !== "boolean" ||
        !finiteNumber(value.priority, -100_000, 100_000)
    )
        return null;
    if (
        !Array.isArray(value.weekdays) ||
        value.weekdays.length > 7 ||
        value.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
    )
        return null;
    if (
        (value.startDate !== null && !boundedString(value.startDate, 10)) ||
        (value.endDate !== null && !boundedString(value.endDate, 10)) ||
        !validDate(value.startDate as string | null) ||
        !validDate(value.endDate as string | null)
    )
        return null;
    if (
        !boundedString(value.startTime, 5) ||
        !boundedString(value.endTime, 5) ||
        !validTime(value.startTime) ||
        !validTime(value.endTime)
    )
        return null;
    if (!RUNTIME_SETTING_KEYS.includes(setting as RuntimeSettingKey)) return null;
    if (
        !boundedString(source, 20) ||
        !(["local", "https", "homeAssistant"] as const).includes(source as RuntimeSource)
    )
        return null;
    if (!(
        typeof value.value === "string" ||
        (typeof value.value === "number" && Number.isFinite(value.value))
    ))
        return null;
    if (typeof value.value === "string" && value.value.length > 512) return null;
    if (!validSettingValue(setting, value.value)) return null;
    if (!validateSourceConfig(source, value.sourceConfig)) return null;
    if (value.startDate !== null && value.endDate !== null && value.startDate > value.endDate)
        return null;
    return {
        id: value.id,
        label: value.label,
        enabled: value.enabled,
        priority: value.priority,
        weekdays: [...new Set(value.weekdays as number[])].sort((a, b) => a - b),
        startDate: value.startDate,
        endDate: value.endDate,
        startTime: value.startTime,
        endTime: value.endTime,
        setting,
        value: value.value,
        source,
        sourceConfig: { ...(value.sourceConfig as RuntimeSourceConfig) },
    };
}

/** Fail-closed parser for persisted or imported state. */
export function parseRuntimeSettingsState(value: unknown): RuntimeSettingsState | null {
    if (
        !isRecord(value) ||
        value.version !== RUNTIME_SETTINGS_VERSION ||
        !Array.isArray(value.schedules) ||
        value.schedules.length > MAX_SCHEDULE_RULES
    )
        return null;
    const values = parseValues(value.values);
    if (values === null) return null;
    const schedules = value.schedules.map(parseRule);
    if (schedules.some((rule) => rule === null)) return null;
    return { version: RUNTIME_SETTINGS_VERSION, values, schedules: schedules as ScheduledRule[] };
}

function parseMinutes(value: string): number {
    const [hours = 0, minutes = 0] = value.split(":").map(Number);
    return hours * 60 + minutes;
}

function dateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/** Local-time rule matching, including cross-midnight windows and date boundaries. */
export function scheduledRuleMatches(rule: ScheduledRule, at: Date): boolean {
    if (!rule.enabled) return false;
    const today = at.getDay();
    const minutes = at.getHours() * 60 + at.getMinutes();
    const start = parseMinutes(rule.startTime);
    const end = parseMinutes(rule.endTime);
    const crossMidnight = start > end;
    const inWindow =
        start === end
            ? true
            : crossMidnight
              ? minutes >= start || minutes < end
              : minutes >= start && minutes < end;
    if (!inWindow) return false;
    const onToday = rule.weekdays.length === 0 || rule.weekdays.includes(today);
    if (!crossMidnight || minutes >= start || !inWindow) {
        if (!onToday) return false;
    } else {
        const yesterday = (today + 6) % 7;
        if (rule.weekdays.length > 0 && !rule.weekdays.includes(yesterday)) return false;
    }
    const effectiveDate =
        crossMidnight && minutes < end ? new Date(at.getTime() - 24 * 60 * 60 * 1000) : at;
    const currentDate = dateOnly(effectiveDate);
    if (rule.startDate !== null && currentDate < rule.startDate) return false;
    if (rule.endDate !== null && currentDate > rule.endDate) return false;
    return true;
}

/** Priority wins, then a stable id tie-breaker makes equal priorities deterministic. */
export function resolveScheduledValues(
    base: RuntimeValues,
    rules: readonly ScheduledRule[],
    at = new Date(),
): RuntimeValues {
    const active = rules
        .filter((rule) => scheduledRuleMatches(rule, at) && rule.source === "local")
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    let next: RuntimeValues = base;
    for (const rule of active) {
        const key = rule.setting;
        const value =
            key === "fontSize" && typeof rule.value === "string" ? Number(rule.value) : rule.value;
        if (key === "fontSize" && !finiteNumber(value, 0.75, 2)) continue;
        next = { ...next, [key]: value } as RuntimeValues;
    }
    return next;
}

/** External payloads may only update known, bounded appearance fields. */
export function validateExternalSettingsPayload(
    value: unknown,
): Partial<Pick<RuntimeValues, RuntimeSettingKey>> | null {
    if (!isRecord(value) || Object.keys(value).length > 8) return null;
    const result: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
        if (!RUNTIME_SETTING_KEYS.includes(key as RuntimeSettingKey)) return null;
        if (key === "fontSize") {
            if (!finiteNumber(raw, 0.75, 2)) return null;
            result.fontSize = raw;
        } else if (
            !boundedString(raw, key === "displayName" ? 120 : 512) ||
            !validSettingValue(key as RuntimeSettingKey, raw)
        )
            return null;
        else (result as Record<string, unknown>)[key] = raw;
    }
    return result as Partial<Pick<RuntimeValues, RuntimeSettingKey>>;
}

export function validateExternalSourcePayload(
    source: RuntimeSource,
    value: unknown,
): Partial<Pick<RuntimeValues, RuntimeSettingKey>> | null {
    if (source === "homeAssistant") {
        if (!isRecord(value) || value.state !== "on") return {};
        return validateExternalSettingsPayload(value.attributes);
    }
    return validateExternalSettingsPayload(value);
}
