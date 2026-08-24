import {
    validateExternalSettingsPayload,
    type RuntimeSettingKey,
    type RuntimeSettingsState,
    type ScheduledRule,
} from "./model.js";

export function sourceRequest(
    rule: ScheduledRule,
): { url: string; headers: Record<string, string> } | { error: string } {
    const url = rule.sourceConfig.url;
    if (rule.source === "local" || url === undefined)
        return { error: "This rule uses local values and has no external request." };
    try {
        const parsed = new URL(url);
        if (
            parsed.protocol !== "https:" &&
            !(
                parsed.protocol === "http:" &&
                ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
            )
        )
            return {
                error: "External settings require HTTPS, except for an explicitly local development endpoint.",
            };
        return { url: parsed.toString(), headers: { Accept: "application/json" } };
    } catch {
        return { error: "The external settings URL is not valid." };
    }
}

/** Apply a validated external result without allowing it to become a permanent base value. */
export function applyTemporaryExternalValues(
    state: RuntimeSettingsState,
    values: Record<string, unknown>,
): RuntimeSettingsState {
    const validated = validateExternalSettingsPayload(values);
    if (validated === null) return state;
    return {
        ...state,
        values: { ...state.values, ...validated } as RuntimeSettingsState["values"],
    };
}

export function scheduleFieldLabel(setting: RuntimeSettingKey): string {
    switch (setting) {
        case "language":
            return "Language";
        case "theme":
            return "Theme";
        case "density":
            return "Density";
        case "accent":
            return "Accent color";
        case "fontFamily":
            return "Font family";
        case "fontSize":
            return "Font size";
        case "motion":
            return "Motion";
        case "displayName":
            return "Display name";
    }
}
