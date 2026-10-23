import { realpath } from "node:fs/promises";
import { dirname } from "node:path";
import { readProject } from "../project/file.js";
import type { ServerRegistry } from "../mcserver/registry.js";
import { readRenderRecord } from "./provenance.js";
import { isValidRenderId, renderWorkspace } from "./workspace.js";

export interface ManagedRenderContext {
    readonly mapId?: string;
    readonly dimension?: string;
    readonly projectId?: string;
    readonly serverId?: string;
}

/** Resolve stored identities without matching displayed map or server names. */
export async function readManagedRenderContext(
    storageDir: string,
    renderId: unknown,
    registry?: ServerRegistry,
): Promise<ManagedRenderContext> {
    if (typeof renderId !== "string" || !isValidRenderId(renderId)) return {};
    const record = await readRenderRecord(renderWorkspace(storageDir, renderId).recordFile);
    const map = record?.maps[0];
    if (!record || !map) return {};
    const context: { mapId: string; dimension: string; projectId?: string; serverId?: string } = {
        mapId: map.id, dimension: map.dimension,
    };
    const project = await readProject(map.world);
    if (!project.ok) return context;
    const matchingMap = project.project.maps.some(candidate => {
        const effectiveId = record.engine === "upstream-java"
            ? candidate.id.replace(/[^a-zA-Z0-9_]/g, "_") : candidate.id;
        return effectiveId === map.id && candidate.dimension === map.dimension && candidate.world === null;
    });
    if (!matchingMap) return context;
    context.projectId = project.project.id;
    const serverId = project.project.serverId;
    if (typeof serverId !== "string" || !registry) return context;
    const server = await registry.get(serverId);
    if (!server.ok || server.value.ref.kind !== "local-process") return context;
    try {
        const [world, serverDirectory] = await Promise.all([
            realpath(map.world), realpath(server.value.ref.serverDir),
        ]);
        // Other world layouts require explicit selection and fresh server proof.
        if (dirname(world).toLowerCase() === serverDirectory.toLowerCase()) context.serverId = serverId;
    } catch { /* Missing filesystem identity is not a confirmed association. */ }
    return context;
}
