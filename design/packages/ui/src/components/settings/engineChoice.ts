import { computed, reactive } from "vue";
import type { ProjectRenderEngine } from "@worldlens/config";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/** The two render implementations a project can name without guessing. */
/** The project schema owns the canonical ids; the UI only adds the global automatic option. */
export type RenderEngineId = ProjectRenderEngine;
export type RenderEngineSelection = RenderEngineId | "automatic";

export const ENGINE_CHOICE_STORAGE_KEY = "worldlens-render-engine-choice-v1";
export const ENGINE_CHOICE_STORAGE_VERSION = 1 as const;

export interface RenderEngineDescriptor {
    readonly id: RenderEngineId;
    readonly name: string;
    readonly version: string;
    readonly provenance: string;
    readonly capabilities: readonly string[];
    readonly unsupported: readonly string[];
}

export const RENDER_ENGINE_DESCRIPTORS: readonly RenderEngineDescriptor[] = [
    {
        id: "upstream-java",
        name: "BlueMap original engine",
        version: "Resolved from the packaged render-engine manifest",
        provenance:
            "Upstream BlueMap source and packaged Java runtime; existing projects keep this path.",
        capabilities: [
            "Original BlueMap compatibility",
            "JVM-backed local render",
            "Established server/plugin parity",
        ],
        unsupported: [
            "Unavailable when no suitable JVM is present",
            "Needs the packaged or discovered Java runtime",
        ],
    },
    {
        id: "typescript",
        name: "Worldlens app engine",
        version: "Resolved from the packaged render-engine manifest",
        provenance:
            "This application's TypeScript engine, shipped with the app and usable without a JVM.",
        capabilities: [
            "JVM-free local render",
            "Offline packaged operation",
            "Shared project format and render history",
        ],
        unsupported: [
            "Some upstream-only integrations may be unavailable",
            "Capability differences are reported before render",
        ],
    },
];

export interface RenderEngineChoiceState {
    version: typeof ENGINE_CHOICE_STORAGE_VERSION;
    globalDefault: RenderEngineSelection;
}

const freshState = (): RenderEngineChoiceState => ({
    version: ENGINE_CHOICE_STORAGE_VERSION,
    globalDefault: "automatic",
});

function isEngine(value: unknown): value is RenderEngineId {
    return value === "upstream-java" || value === "typescript";
}

function isSelection(value: unknown): value is RenderEngineSelection {
    return value === "automatic" || isEngine(value);
}

function readState(storage: Storage | null | undefined): RenderEngineChoiceState {
    if (storage === null || storage === undefined) return freshState();
    try {
        const raw = storage.getItem(ENGINE_CHOICE_STORAGE_KEY);
        if (raw === null) return freshState();
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
            return freshState();
        const candidate = parsed as Record<string, unknown>;
        if (
            candidate.version !== ENGINE_CHOICE_STORAGE_VERSION ||
            !isSelection(candidate.globalDefault)
        ) {
            return freshState();
        }
        return { version: ENGINE_CHOICE_STORAGE_VERSION, globalDefault: candidate.globalDefault };
    } catch {
        return freshState();
    }
}

const state = reactive<RenderEngineChoiceState>(
    readState(typeof window === "undefined" ? null : window.localStorage),
);

function persist(): void {
    try {
        globalThis.localStorage?.setItem(ENGINE_CHOICE_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // A blocked or full local store does not make the in-session selection unusable.
    }
    recordAppSetting("renderEngineChoice", exportRenderEngineChoice());
}

export const currentRenderEngineChoice = computed(() => state);

export function globalRenderEngineDefault(): RenderEngineSelection {
    return state.globalDefault;
}

/** Resolve automatic deterministically: keep Java where it is available, otherwise use the app engine. */
export function resolveRenderEngine(
    selection: RenderEngineSelection,
    javaAvailable: boolean,
    artifactAvailable = true,
): RenderEngineId {
    if (isEngine(selection)) return selection;
    return javaAvailable && artifactAvailable ? "upstream-java" : "typescript";
}

export function setGlobalRenderEngineDefault(selection: RenderEngineSelection): void {
    state.globalDefault = selection;
    persist();
}

/** The exact versioned record used by export and by a project's local history integration. */
export function exportRenderEngineChoice(): string {
    return JSON.stringify(
        {
            schema: "worldlens.render-engine-choice",
            version: ENGINE_CHOICE_STORAGE_VERSION,
            globalDefault: state.globalDefault,
        },
        null,
        2,
    );
}

export function importRenderEngineChoice(serialized: string): boolean {
    try {
        const parsed: unknown = JSON.parse(serialized);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
        const candidate = parsed as Record<string, unknown>;
        if (
            candidate.schema !== "worldlens.render-engine-choice" ||
            candidate.version !== ENGINE_CHOICE_STORAGE_VERSION ||
            !isSelection(candidate.globalDefault)
        ) {
            return false;
        }
        state.globalDefault = candidate.globalDefault;
        persist();
        return true;
    } catch {
        return false;
    }
}

export function descriptorForRenderEngine(id: RenderEngineId): RenderEngineDescriptor {
    const descriptor = RENDER_ENGINE_DESCRIPTORS.find((candidate) => candidate.id === id);
    if (descriptor !== undefined) return descriptor;
    return RENDER_ENGINE_DESCRIPTORS[0]!;
}

export function renderEngineChoiceSearchValues(
    selection: RenderEngineSelection,
    javaAvailable: boolean,
    artifactAvailable = true,
): string[] {
    const resolved = resolveRenderEngine(selection, javaAvailable, artifactAvailable);
    const descriptor = descriptorForRenderEngine(resolved);
    return [
        selection,
        resolved,
        descriptor.name,
        descriptor.version,
        descriptor.provenance,
        ...descriptor.capabilities,
        ...descriptor.unsupported,
    ];
}
