import { InvalidRenderRequestError, validateMaps, type RenderMapRequest } from "./config.js";
import type { RenderEngineId } from "./provenance.js";

/** BlueMapConfigManager.sanitiseMapId at upstream fcfea026 uses Java's ASCII \\W. */
export function effectiveMapId(id: string, engine: RenderEngineId): string {
    return engine === "upstream-java" ? id.replace(/[^a-zA-Z0-9_]/g, "_") : id;
}

/** Resolve before any configuration or session writes, never from observed output. */
export function resolveRenderMaps(maps: readonly RenderMapRequest[], engine: RenderEngineId): RenderMapRequest[] {
    validateMaps(maps);
    const seen = new Set<string>();
    return maps.map((map) => {
        const id = effectiveMapId(map.id, engine);
        if (seen.has(id)) throw new InvalidRenderRequestError(`Map ids collide at engine output id '${id}'.`);
        seen.add(id);
        return { ...map, id, name: map.name ?? map.id };
    });
}
