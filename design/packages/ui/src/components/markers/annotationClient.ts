import { sameSpatialIdentity, type SpatialIdentity } from "./spatialSelection.js";
import { validateStudioDocument, type StudioMarker } from "./markerStudio.js";

export interface SharedAnnotations { version: 1; identity: SpatialIdentity; revision: number; updatedAt: string; updatedBy: string; annotations: StudioMarker[] }
export class AnnotationRevisionConflict extends Error {
    constructor(readonly current: SharedAnnotations) { super("Shared markers changed. Your draft is retained. Reload the shared revision before saving again."); }
}
export function validateAnnotations(value: unknown, identity: SpatialIdentity): SharedAnnotations {
    const record = value as SharedAnnotations | null;
    if (!record || record.version !== 1 || !record.identity || !sameSpatialIdentity(record.identity, identity)
        || !Number.isSafeInteger(record.revision) || record.revision < 0 || typeof record.updatedAt !== "string"
        || typeof record.updatedBy !== "string") throw new Error("The shared annotation response has an invalid identity or revision.");
    const document = validateStudioDocument({ marker: "worldlens-marker-studio", version: 1, mapId: identity.mapId, markers: record.annotations });
    if (!document) throw new Error("The shared annotation response contains invalid markers.");
    return { ...record, annotations: document.markers };
}
export function annotationClient(identity: SpatialIdentity, transport: typeof fetch = fetch) {
    const query = new URLSearchParams({ projectId: identity.projectId, mapId: identity.mapId, dimension: identity.dimension });
    const url = `/bridge/annotations?${query}`;
    async function request(init: RequestInit): Promise<SharedAnnotations> {
        const response = await transport(url, { ...init, credentials: "same-origin", cache: "no-store" });
        if (response.status === 401 || response.status === 403) throw new Error("Sign in with editor access to share markers.");
        if (response.status === 409) {
            const body = await response.json() as { current: unknown };
            throw new AnnotationRevisionConflict(validateAnnotations(body.current, identity));
        }
        if (!response.ok) throw new Error(`Shared markers are unavailable (${response.status}). Your draft is retained.`);
        return validateAnnotations(await response.json(), identity);
    }
    return {
        read: () => request({ method: "GET" }),
        save: (expectedRevision: number, annotations: readonly StudioMarker[]) => request({
            method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision, annotations }),
        }),
    };
}
