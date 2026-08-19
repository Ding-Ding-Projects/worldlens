/**
 * The global default and capability-aware choice used when a new project is created.
 *
 * A project stores a concrete id, never the word "automatic". That makes an exported
 * project repeatable on another machine. "automatic" belongs only to the user's global
 * preference: it chooses Java when Java is available and the app-owned engine otherwise.
 * An explicit project choice is never changed because a capability is missing; the route
 * refuses it with the exact missing capability instead of silently changing engines.
 */

import type { ProjectRenderEngine } from "@worldlens/config";
import {
    RENDER_ENGINE_CAPABILITIES,
    type RenderEngineCapability,
    type RenderEngineId,
} from "./provenance.js";

/** Key in the application-settings values bag. */
export const GLOBAL_RENDER_ENGINE_DEFAULT_KEY = "render.engine.default";

export type GlobalRenderEngineDefault = "automatic" | ProjectRenderEngine;

export interface RenderEngineAvailability {
    readonly id: RenderEngineId;
    readonly available: boolean;
    readonly version: string | null;
    readonly reason: string | null;
}

/** The only values accepted from the untyped application-settings bag. */
export function readGlobalRenderEngineDefault(values: Readonly<Record<string, unknown>>): GlobalRenderEngineDefault {
    const value = values[GLOBAL_RENDER_ENGINE_DEFAULT_KEY];
    return value === "automatic" || value === "typescript" || value === "upstream-java"
        ? value
        : "automatic";
}

/**
 * Chooses the concrete engine for a new project.
 *
 * If the preference is explicit, it stays explicit even when unavailable: an unavailable
 * selection is actionable evidence for the UI, whereas silently choosing a different
 * renderer would make a project render a different map than the one it names.
 */
export function chooseNewProjectEngine(
    preference: GlobalRenderEngineDefault,
    availability: readonly RenderEngineAvailability[],
): ProjectRenderEngine {
    if (preference !== "automatic") return preference;
    const java = availability.find((candidate) => candidate.id === "upstream-java");
    if (java?.available === true) return "upstream-java";
    return "typescript";
}

/** Returns a capability fact without allowing an unknown id to become a fallback. */
export function engineCapability(id: RenderEngineId): RenderEngineCapability {
    return RENDER_ENGINE_CAPABILITIES[id];
}

/**
 * Explains why an engine cannot take a route. `null` means the static route is supported;
 * runtime availability (for example Docker or a JDK) remains a separate probe.
 */
export function unsupportedEngineRoute(
    id: RenderEngineId,
    route: "local" | "docker" | "cli" | "restart",
): string | null {
    const capability = engineCapability(id);
    const supported =
        route === "local"
            ? capability.supportsLocal
            : route === "docker"
              ? capability.supportsDocker
              : route === "cli"
                ? capability.supportsCli
                : capability.supportsRestart;
    return supported
        ? null
        : `${capability.label} does not support the ${route} render route; select an engine ` +
              "that advertises this capability instead of falling back silently.";
}
