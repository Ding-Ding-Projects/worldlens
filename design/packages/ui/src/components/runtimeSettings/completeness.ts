/** Hand-written runtime-settings inventory. A row disappearing is a red contract failure. */
export interface RuntimeCoverageRow {
    readonly id: string;
    readonly implementation: readonly string[];
    readonly documentation: readonly string[];
    readonly localization: readonly string[];
    readonly persistence: readonly string[];
    readonly tests: readonly string[];
    /** `pending` is honest until the final built-artifact capture wave promotes it. */
    readonly capture: "pending" | string;
}

export const RUNTIME_COVERAGE: readonly RuntimeCoverageRow[] = [
    {
        id: "status-hub",
        implementation: [
            "design/packages/ui/src/components/runtimeSettings/RuntimeSettingsPanel.vue",
            "design/packages/app/src/main/runtimeSettings/ipc.ts",
            "design/packages/app/src/main/runtimeSettings/service.ts",
            "design/packages/app/src/main/runtimeSettings/registry.ts",
            "design/packages/app/src/preload/index.ts",
        ],
        documentation: ["docs/runtime-settings-and-accommodations.md"],
        localization: ["statusTitle", "registerStatusHub", "submitEvidence", "pollReplies", "confirmReply"],
        persistence: ["design/packages/ui/src/components/runtimeSettings/store.ts"],
        tests: [
            "design/packages/ui/src/components/runtimeSettings/model.test.ts",
            "design/packages/app/src/main/runtimeSettings/service.test.ts",
            "design/packages/app/src/main/runtimeSettings/registry.test.ts",
        ],
        capture: "pending",
    },
    {
        id: "spoken-narrator",
        implementation: [
            "design/packages/ui/src/components/runtimeSettings/narrator.ts",
            "design/packages/ui/src/components/runtimeSettings/RuntimeSettingsPanel.vue",
        ],
        documentation: ["docs/runtime-settings-and-accommodations.md"],
        localization: ["narratorTitle", "narrationHint", "testQueued"],
        persistence: ["design/packages/ui/src/components/runtimeSettings/store.ts"],
        tests: ["design/packages/ui/src/components/runtimeSettings/narrator.test.ts"],
        capture: "pending",
    },
    {
        id: "scheduled-settings",
        implementation: [
            "design/packages/ui/src/components/runtimeSettings/model.ts",
            "design/packages/ui/src/components/runtimeSettings/schedule.ts",
        ],
        documentation: ["docs/runtime-settings-and-accommodations.md"],
        localization: ["scheduleTitle", "invalidSchedule", "scheduleAdded"],
        persistence: ["design/packages/ui/src/components/runtimeSettings/store.ts"],
        tests: [
            "design/packages/ui/src/components/runtimeSettings/model.test.ts",
            "design/packages/ui/src/components/runtimeSettings/schedule.test.ts",
        ],
        capture: "pending",
    },
    {
        id: "attention-modes",
        implementation: [
            "design/packages/ui/src/components/runtimeSettings/model.ts",
            "design/packages/ui/src/components/runtimeSettings/RuntimeSettingsPanel.vue",
        ],
        documentation: ["docs/runtime-settings-and-accommodations.md"],
        localization: ["accommodationsTitle", "accommodationsHint", "saved"],
        persistence: ["design/packages/ui/src/components/runtimeSettings/store.ts"],
        tests: ["design/packages/ui/src/components/runtimeSettings/store.test.ts"],
        capture: "pending",
    },
    {
        id: "home-assistant-registry",
        implementation: [
            "design/packages/app/src/main/runtimeSettings/registry.ts",
            "design/packages/app/src/main/runtimeSettings/ipc.ts",
            "design/packages/ui/src/components/runtimeSettings/RuntimeSettingsPanel.vue",
        ],
        documentation: ["docs/runtime-settings-and-accommodations.md"],
        localization: ["homeAssistantSources", "saveHomeAssistant", "homeAssistantCredential"],
        persistence: ["design/packages/app/src/main/runtimeSettings/registry.ts"],
        tests: ["design/packages/app/src/main/runtimeSettings/registry.test.ts"],
        capture: "pending",
    },
    {
        id: "runtime-history",
        implementation: [
            "design/packages/app/src/main/runtimeSettings/history.ts",
            "design/packages/app/src/main/runtimeSettings/ipc.ts",
            "design/packages/ui/src/components/runtimeSettings/RuntimeSettingsPanel.vue",
        ],
        documentation: ["docs/runtime-settings-and-accommodations.md"],
        localization: ["history", "historyPassword", "historySearch", "exportHistory"],
        persistence: ["design/packages/app/src/main/runtimeSettings/history.ts"],
        tests: ["design/packages/app/src/main/runtimeSettings/history.test.ts"],
        capture: "pending",
    },
];

export function validateRuntimeCoverage(
    rows: readonly RuntimeCoverageRow[] = RUNTIME_COVERAGE,
    options: { requireCaptures?: boolean; root?: string; exists?: (path: string) => boolean } = {},
): string[] {
    const errors: string[] = [];
    const ids = new Set<string>();
    for (const row of rows) {
        if (ids.has(row.id)) errors.push(`duplicate:${row.id}`);
        ids.add(row.id);
        for (const [field, values] of Object.entries(row)) {
            if (field === "id" || field === "capture") continue;
            if (
                !Array.isArray(values) ||
                values.length === 0 ||
                values.some((value) => typeof value !== "string" || value.length === 0)
            )
                errors.push(`${row.id}:${field}`);
            if (options.root !== undefined && field !== "localization" && Array.isArray(values)) {
                for (const value of values) {
                    const path = `${options.root}/${value}`.replaceAll("/", "\\");
                    if (options.exists !== undefined && !options.exists(path)) errors.push(`${row.id}:${field}:missing:${value}`);
                }
            }
        }
        if (options.requireCaptures === true && row.capture === "pending")
            errors.push(`${row.id}:capture-pending`);
    }
    for (const required of [
        "status-hub",
        "spoken-narrator",
        "scheduled-settings",
        "attention-modes",
        "home-assistant-registry",
        "runtime-history",
    ]) {
        if (!ids.has(required)) errors.push(`missing:${required}`);
    }
    return errors;
}

/** Release validation is fail-closed for real built-artifact evidence. */
export function validateRuntimeCoverageForRelease(rows: readonly RuntimeCoverageRow[] = RUNTIME_COVERAGE, root?: string): string[] {
    return validateRuntimeCoverage(rows, { requireCaptures: true, ...(root === undefined ? {} : { root }) });
}
