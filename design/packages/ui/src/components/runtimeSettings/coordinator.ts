import { resolveScheduledValues, type RuntimeSettingsState } from "./model.js";

export interface RuntimeCoordinatorBridge {
    refreshExternal(request: {
        readonly id: string;
        readonly source: "https" | "homeAssistant";
        readonly url?: string;
        readonly entityId?: string;
    }): Promise<{
        readonly ok: boolean;
        readonly message: string;
        readonly values?: Readonly<Record<string, string | number>>;
    }>;
}

export function createRuntimeSettingsCoordinator(options: {
    readState: () => RuntimeSettingsState;
    applyTemporary: (values: Readonly<Record<string, unknown>>) => void;
    clearTemporary?: () => void;
    bridge: RuntimeCoordinatorBridge | null;
    intervalMs?: number;
}): { start(): void; stop(): void; refreshNow(): Promise<void> } {
    let timer: ReturnType<typeof setInterval> | null = null;
    let generation = 0;
    let expiry: ReturnType<typeof setTimeout> | null = null;
    let externalValues: Readonly<Record<string, unknown>> = {};
    const applyLocalSchedule = (): void => {
        const state = options.readState();
        const local = resolveScheduledValues(state.values, state.schedules);
        const changed = Object.keys(local).some((key) => local[key as keyof typeof local] !== state.values[key as keyof typeof state.values]);
        if (changed) options.applyTemporary(local as unknown as Readonly<Record<string, unknown>>);
    };
    const refreshNow = async (): Promise<void> => {
        const run = ++generation;
        applyLocalSchedule();
        if (options.bridge === null) return;
        const rules = options
            .readState()
            .schedules.filter(
                (rule) =>
                    rule.enabled && rule.source !== "local" && rule.sourceConfig.url !== undefined,
            );
        const results = await Promise.all(
            rules.map((rule) =>
                options.bridge!.refreshExternal({
                    id: rule.id,
                    source: rule.source as "https" | "homeAssistant",
                    ...(rule.source === "homeAssistant" ? {} : { url: rule.sourceConfig.url! }),
                    ...(rule.source === "homeAssistant"
                        ? {}
                        : rule.sourceConfig.entityId === undefined
                          ? {}
                          : { entityId: rule.sourceConfig.entityId }),
                }),
            ),
        );
        if (run !== generation) return;
        for (const result of results) {
            if (result.ok && result.values !== undefined) {
                externalValues = { ...externalValues, ...result.values };
                options.applyTemporary(result.values);
                if (expiry !== null) clearTimeout(expiry);
                expiry = setTimeout(
                    () => {
                        externalValues = {};
                        applyLocalSchedule();
                        if (Object.keys(externalValues).length === 0) options.clearTemporary?.();
                        expiry = null;
                    },
                    5 * 60 * 1000,
                );
            }
        }
    };
    return {
        start() {
            void refreshNow();
            timer = setInterval(() => {
                void refreshNow();
            }, options.intervalMs ?? 60_000);
        },
        stop() {
            generation += 1;
            if (timer !== null) clearInterval(timer);
            timer = null;
            if (expiry !== null) clearTimeout(expiry);
            expiry = null;
            externalValues = {};
            options.clearTemporary?.();
        },
        refreshNow,
    };
}
