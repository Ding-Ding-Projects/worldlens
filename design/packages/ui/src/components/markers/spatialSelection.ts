import type { MarkerPosition } from "./markerStudio.js";

export type SpatialKind = "point" | "path" | "polygon" | "rectangle" | "circle";
export interface SpatialIdentity { projectId: string; mapId: string; dimension: string }
export interface SpatialSelection { identity: SpatialIdentity; kind: SpatialKind; vertices: MarkerPosition[] }
export function sameSpatialIdentity(a: SpatialIdentity, b: SpatialIdentity): boolean {
    return a.projectId === b.projectId && a.mapId === b.mapId && a.dimension === b.dimension;
}
export function validSpatialPoint(point: MarkerPosition): boolean {
    return [point.x, point.y, point.z].every(Number.isFinite)
        && Math.abs(point.x) <= 30_000_000 && Math.abs(point.z) <= 30_000_000
        && point.y >= -2048 && point.y <= 2048;
}
/** Selection only builds geometry. It never executes a server command or persists a draft. */
export function addSpatialPoint(selection: SpatialSelection, point: MarkerPosition, identity: SpatialIdentity): SpatialSelection {
    if (!sameSpatialIdentity(selection.identity, identity)) throw new Error("The map changed. Start a new selection.");
    if (!validSpatialPoint(point)) throw new Error("Coordinates are outside the supported world bounds.");
    const limit = selection.kind === "point" ? 1 : ["rectangle", "circle"].includes(selection.kind) ? 2 : 128;
    if (selection.vertices.length >= limit) throw new Error("Selection is full. Undo a vertex or start again.");
    return { ...selection, vertices: [...selection.vertices, { ...point }] };
}
export function spatialGeometry(selection: SpatialSelection): MarkerPosition[] {
    const points = selection.vertices;
    if (selection.kind === "point") return points.slice(0, 1);
    if (selection.kind === "path" || selection.kind === "polygon") return points.map(point => ({ ...point }));
    const a = points[0]; const b = points[1];
    if (!a || !b) return points.map(point => ({ ...point }));
    if (selection.kind === "rectangle") return [
        { ...a }, { x: b.x, y: a.y, z: a.z }, { x: b.x, y: a.y, z: b.z }, { x: a.x, y: a.y, z: b.z },
    ];
    const radius = Math.hypot(b.x - a.x, b.z - a.z);
    return Array.from({ length: 48 }, (_, index) => {
        const angle = index * Math.PI * 2 / 48;
        return { x: a.x + Math.cos(angle) * radius, y: a.y, z: a.z + Math.sin(angle) * radius };
    });
}
export function spatialProblem(selection: SpatialSelection): string | null {
    const minimum = selection.kind === "point" ? 1 : selection.kind === "polygon" ? 3 : 2;
    if (selection.vertices.length < minimum) return `Select at least ${minimum} points.`;
    if (selection.vertices.some(point => !validSpatialPoint(point))) return "Coordinates are outside the supported world bounds.";
    const geometry = spatialGeometry(selection);
    if (geometry.some(point => !validSpatialPoint(point))) return "The shape extends outside the supported world bounds.";
    if (["polygon", "rectangle", "circle"].includes(selection.kind)) {
        const area = geometry.reduce((sum, point, index) => {
            const next = geometry[(index + 1) % geometry.length]!;
            return sum + point.x * next.z - next.x * point.z;
        }, 0);
        if (Math.abs(area) < 0.0001) return "The shape must enclose a non-zero area.";
    }
    return null;
}
