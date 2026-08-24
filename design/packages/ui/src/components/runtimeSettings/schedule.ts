import {
    validateExternalSettingsPayload,
    validateExternalSourcePayload,
    type RuntimeSettingKey,
    type RuntimeSettingsState,
    type ScheduledRule,
} from "./model.js";

export interface ExternalFetchResult {
    readonly ok: boolean;
    readonly value?: Record<string, unknown>;
    readonly message: string;
}

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

export async function readExternalRule(
    rule: ScheduledRule,
    fetcher: typeof fetch = fetch,
    signal?: AbortSignal,
): Promise<ExternalFetchResult> {
    const request = sourceRequest(rule);
    if ("error" in request) return { ok: false, message: request.error };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
        const response = await fetcher(request.url, {
            method: "GET",
            headers: request.headers,
            signal: controller.signal,
            redirect: "error",
        });
        if (!response.ok)
            return {
                ok: false,
                message: `The external settings source answered HTTP ${response.status}.`,
            };
        const text = await response.text();
        if (text.length > 512 * 1024)
            return {
                ok: false,
                message: "The external settings response is larger than the bounded 512 KiB limit.",
            };
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            return { ok: false, message: "The external settings response was not valid JSON." };
        }
        const value = validateExternalSourcePayload(rule.source, parsed);
        return value === null
            ? {
                  ok: false,
                  message: "The external settings response contained an unknown or invalid field.",
              }
            : {
                  ok: true,
                  value: value as Record<string, unknown>,
                  message: "The external settings response was validated.",
              };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error && error.name === "AbortError"
                    ? "The external settings request timed out or was cancelled."
                    : "The external settings source could not be reached.",
        };
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
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
