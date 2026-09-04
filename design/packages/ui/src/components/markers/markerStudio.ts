/**
 * lang-gui-exempt: marker colours a person picks for their own map. Their markers are content.
 */
/** Pure, map-scoped model for user-authored BlueMap markers. */
export type StudioMarkerKind = "poi" | "line" | "shape" | "extrude";
export interface MarkerPosition { x: number; y: number; z: number }
export const DEFAULT_MARKER_COLOUR = "#4f8cff";
export const MARKER_Y_MIN = -2048;
export const MARKER_Y_MAX = 2048;
export const MARKER_XZ_LIMIT = 30_000_000;
export const MARKER_STUDIO_SET_ID = "worldlens:studio";
export const STUDIO_STORAGE_VERSION = 1 as const;
export const STUDIO_EXPORT_MARKER = "worldlens-marker-studio" as const;
export const MAX_STUDIO_MARKERS = 500;
export const MAX_MARKER_NAME = 160;
export const MAX_MARKER_NOTE = 4000;

export interface StudioMarker {
    readonly id: string;
    readonly mapId: string;
    readonly kind?: StudioMarkerKind | undefined;
    label: string;
    detail: string;
    position: MarkerPosition;
    colour: string;
    visible: boolean;
    readonly createdAt: string;
    updatedAt: string;
    /** BlueMap's stable ordering value, retained across edits and export/import. */
    sorting?: number | undefined;
    points?: MarkerPosition[] | undefined;
    /** Unknown BlueMap fields survive a round trip. */
    extra?: Record<string, unknown> | undefined;
}
export interface MarkerDraft {
    label: string; detail: string; position: MarkerPosition; colour: string;
    kind?: StudioMarkerKind | undefined; points?: MarkerPosition[] | undefined; extra?: Record<string, unknown> | undefined;
}
export type MarkerProblem =
    | { readonly field: "label"; readonly message: string }
    | { readonly field: "position"; readonly message: string }
    | { readonly field: "colour"; readonly message: string }
    | { readonly field: "geometry"; readonly message: string };

export function markerProblems(draft: MarkerDraft): readonly MarkerProblem[] {
    const problems: MarkerProblem[] = [];
    if (draft.label.trim() === "") problems.push({ field: "label", message: "A marker needs a name, or the list is a row of blanks." });
    if (draft.label.trim().length > MAX_MARKER_NAME) problems.push({ field: "label", message: `A marker name must be ${MAX_MARKER_NAME} characters or fewer.` });
    const { x, y, z } = draft.position;
    if (![x, y, z].every(Number.isFinite)) problems.push({ field: "position", message: "X, Y and Z all have to be numbers." });
    else if (y < MARKER_Y_MIN || y > MARKER_Y_MAX) problems.push({ field: "position", message: `Y is ${y}, which is outside anything a world builds to (${MARKER_Y_MIN} to ${MARKER_Y_MAX}).` });
    else if (Math.abs(x) > MARKER_XZ_LIMIT || Math.abs(z) > MARKER_XZ_LIMIT) problems.push({ field: "position", message: "X and Z are past the furthest a world border reaches." });
    if (draft.detail.length > MAX_MARKER_NOTE) problems.push({ field: "label", message: `A note must be ${MAX_MARKER_NOTE} characters or fewer.` });
    if (!/^#[0-9a-f]{6}$/i.test(draft.colour)) problems.push({ field: "colour", message: "A colour is six hexadecimal digits after a hash, like #4f8cff." });
    if (draft.kind !== undefined && !["poi", "line", "shape", "extrude"].includes(draft.kind)) problems.push({ field: "geometry", message: "Marker type is not supported." });
    if (draft.kind !== undefined && draft.kind !== "poi") {
        const minimum = draft.kind === "line" ? 2 : 3;
        if (!draft.points || draft.points.length < minimum || draft.points.length > 128 || draft.points.some((point) => ![point.x, point.y, point.z].every(Number.isFinite))) problems.push({ field: "geometry", message: `${draft.kind} markers need ${minimum} to 128 finite points.` });
        else if (draft.points.some((point) => point.y < MARKER_Y_MIN || point.y > MARKER_Y_MAX || Math.abs(point.x) > MARKER_XZ_LIMIT || Math.abs(point.z) > MARKER_XZ_LIMIT)) problems.push({ field: "geometry", message: "Geometry points must remain inside the world bounds." });
        else if ((draft.kind === "shape" || draft.kind === "extrude") && polygonArea(draft.points) === 0) problems.push({ field: "geometry", message: "Shape geometry must enclose a non-zero area." });
        if (draft.kind === "extrude") {
            const heights = draft.extra ?? {};
            const minY = typeof heights.shapeMinY === "number" ? heights.shapeMinY : Math.min(...draft.points!.map((point) => point.y));
            const maxY = typeof heights.shapeMaxY === "number" ? heights.shapeMaxY : Math.max(...draft.points!.map((point) => point.y));
            if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) problems.push({ field: "geometry", message: "Extrude markers need a positive height (maximum Y must exceed minimum Y)." });
        }
    }
    return problems;
}
function polygonArea(points: readonly MarkerPosition[]): number { let twice = 0; for (let index = 0; index < points.length; index += 1) { const current = points[index]!; const next = points[(index + 1) % points.length]!; twice += current.x * next.z - next.x * current.z; } return Math.abs(twice) / 2; }
export function emptyDraft(at?: Partial<MarkerPosition>): MarkerDraft { return { label: "", detail: "", position: { x: Math.round(at?.x ?? 0), y: Math.round(at?.y ?? 64), z: Math.round(at?.z ?? 0) }, colour: DEFAULT_MARKER_COLOUR, kind: "poi" }; }
export interface CreateOptions { readonly id?: string; readonly now?: string }
export type MarkerResult = { readonly ok: true; readonly marker: StudioMarker } | { readonly ok: false; readonly problems: readonly MarkerProblem[] };
function markerId(): string { try { return crypto.randomUUID(); } catch { return `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; } }
function rounded(position: MarkerPosition): MarkerPosition { return { x: Math.round(position.x), y: Math.round(position.y), z: Math.round(position.z) }; }
export function createMarker(mapId: string, draft: MarkerDraft, options: CreateOptions = {}): MarkerResult {
    const problems = markerProblems(draft); if (problems.length) return { ok: false, problems };
    const now = options.now ?? new Date().toISOString();
    return { ok: true, marker: { id: options.id ?? markerId(), mapId, kind: draft.kind ?? "poi", label: draft.label.trim(), detail: draft.detail.trim(), position: rounded(draft.position), colour: draft.colour.toLowerCase(), visible: true, createdAt: now, updatedAt: now, ...(draft.points ? { points: draft.points.map(rounded) } : {}), ...(draft.extra ? { extra: { ...draft.extra } } : {}) } };
}
export function editMarker(marker: StudioMarker, draft: MarkerDraft, now = new Date().toISOString()): MarkerResult {
    const problems = markerProblems(draft); if (problems.length) return { ok: false, problems };
    return { ok: true, marker: { ...marker, kind: draft.kind ?? marker.kind ?? "poi", label: draft.label.trim(), detail: draft.detail.trim(), position: rounded(draft.position), colour: draft.colour.toLowerCase(), updatedAt: now, ...(draft.points ? { points: draft.points.map(rounded) } : {}), ...(draft.extra ? { extra: { ...draft.extra } } : {}) } };
}
export function draftFrom(marker: StudioMarker): MarkerDraft { return { label: marker.label, detail: marker.detail, position: { ...marker.position }, colour: marker.colour, kind: marker.kind ?? "poi", ...(marker.points ? { points: marker.points.map((point) => ({ ...point })) } : {}), ...(marker.extra ? { extra: { ...marker.extra } } : {}) }; }
export function markerSearchText(marker: StudioMarker): string { return [marker.label, marker.detail, marker.kind ?? "poi", `${marker.position.x} ${marker.position.y} ${marker.position.z}`, ...(marker.points ?? []).map((point) => `${point.x} ${point.y} ${point.z}`)].join(" "); }
export function filterStudioMarkers(markers: readonly StudioMarker[], query: string): StudioMarker[] { const needle = query.trim().toLocaleLowerCase(); return needle ? markers.filter((marker) => markerSearchText(marker).toLocaleLowerCase().includes(needle)) : [...markers]; }
export function toViewerMarkerData(marker: StudioMarker): Record<string, unknown> {
    const points = marker.points ?? []; const kind = marker.kind ?? "poi";
    return { ...(marker.extra ?? {}), type: kind, position: { ...marker.position }, label: marker.label, detail: marker.detail || null, listed: true, sorting: marker.sorting ?? 0, ...(kind === "line" ? { line: points.map((point) => ({ ...point })) } : kind === "shape" ? { shape: points.map((point) => ({ x: point.x, z: point.z })) } : kind === "extrude" ? { shape: points.map((point) => ({ x: point.x, z: point.z })), shapeMinY: Math.min(...points.map((point) => point.y), marker.position.y), shapeMaxY: Math.max(...points.map((point) => point.y), marker.position.y) } : {}) };
}
export function toMarkerSetData(markers: readonly StudioMarker[], mapId: string, preview: StudioMarker | null = null): { id: string; label: string; toggleable: boolean; defaultHidden: boolean; markers: Record<string, unknown> } { const entries: Record<string, unknown> = {}; for (const marker of markers.filter((entry) => entry.mapId === mapId && entry.visible)) entries[marker.id] = toViewerMarkerData(marker); if (preview?.mapId === mapId) entries[preview.id] = toViewerMarkerData(preview); return { id: MARKER_STUDIO_SET_ID, label: "My markers", toggleable: true, defaultHidden: false, markers: entries }; }

export interface MarkerStudioDocument { marker: typeof STUDIO_EXPORT_MARKER; version: typeof STUDIO_STORAGE_VERSION; mapId: string; markers: StudioMarker[] }
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validPosition = (value: unknown): value is MarkerPosition => object(value) && [value.x, value.y, value.z].every(Number.isFinite);
const unsafeField = /(html|script|url|path|src|href|onclick|onload|code|command|exec)/i;
function safeExtra(value: unknown): Record<string, unknown> | undefined {
    if (!object(value)) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (unsafeField.test(key) || key.length > 80) continue;
        if (typeof entry === "string" && (entry.length > 2000 || /<\/?[a-z][^>]*>|^\s*[a-z][a-z0-9+.-]*:|^[a-z]:[\\/]|^\.\.?[\\/]/i.test(entry))) continue;
        if (typeof entry === "number" || typeof entry === "boolean" || typeof entry === "string" || entry === null) out[key] = entry;
        else if (Array.isArray(entry) && entry.length <= 128 && entry.every((item) => typeof item === "number" || typeof item === "string" || typeof item === "boolean" || item === null)) out[key] = [...entry];
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
export function validateStudioDocument(value: unknown): MarkerStudioDocument | null {
    if (!object(value) || value.marker !== STUDIO_EXPORT_MARKER || value.version !== STUDIO_STORAGE_VERSION || typeof value.mapId !== "string" || !Array.isArray(value.markers) || value.markers.length > MAX_STUDIO_MARKERS) return null;
    const markers: StudioMarker[] = [];
    for (const item of value.markers) {
        if (!object(item) || typeof item.id !== "string" || typeof item.mapId !== "string" || item.mapId !== value.mapId || typeof item.label !== "string" || typeof item.detail !== "string" || typeof item.colour !== "string" || typeof item.visible !== "boolean" || !validPosition(item.position) || typeof item.createdAt !== "string" || typeof item.updatedAt !== "string") return null;
        if (item.points !== undefined && (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > 128 || item.points.some((point) => !validPosition(point)))) return null;
        const known = new Set(["id", "mapId", "kind", "label", "detail", "position", "colour", "visible", "createdAt", "updatedAt", "points", "extra", "sorting"]);
        const topLevelExtra = Object.fromEntries(Object.entries(item).filter(([key]) => !known.has(key)));
        const extra = safeExtra({ ...(safeExtra(item.extra) ?? {}), ...topLevelExtra });
        const draft: MarkerDraft = {
            label: item.label,
            detail: item.detail,
            position: item.position,
            colour: item.colour,
            ...(item.kind !== undefined ? { kind: item.kind as StudioMarkerKind } : {}),
            ...(item.points !== undefined ? { points: item.points as MarkerPosition[] } : {}),
            ...(extra !== undefined ? { extra } : {}),
        };
        const made = createMarker(value.mapId, draft, { id: item.id, now: item.createdAt });
        if (!made.ok) return null; markers.push({ ...made.marker, visible: item.visible, updatedAt: item.updatedAt, ...(typeof item.sorting === "number" && Number.isFinite(item.sorting) ? { sorting: item.sorting } : {}) });
    }
    return { marker: STUDIO_EXPORT_MARKER, version: STUDIO_STORAGE_VERSION, mapId: value.mapId, markers };
}
export function exportStudioMarkers(mapId: string, markers: readonly StudioMarker[]): string { return `${JSON.stringify({ marker: STUDIO_EXPORT_MARKER, version: STUDIO_STORAGE_VERSION, mapId, markers }, null, 2)}\n`; }
export function importStudioMarkers(raw: string, mapId: string): { markers: StudioMarker[]; errors: string[] } { try { const document = validateStudioDocument(JSON.parse(raw)); return document && document.mapId === mapId ? { markers: document.markers, errors: [] } : { markers: [], errors: ["This file belongs to a different map or is not a marker-studio export."] }; } catch { return { markers: [], errors: ["The marker file is not valid JSON."] }; } }
