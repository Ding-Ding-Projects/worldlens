export type MeasurementKind = "point" | "distance" | "polyline" | "horizontal" | "vertical" | "area";

export type Coordinate = { x: number; y: number; z: number };

/** Minecraft's normal world border and build-height bounds, used to reject bad imports. */
export const MAX_MAP_COORDINATE = 30_000_000;
export const MIN_MAP_Y = -4_096;
export const MAX_MAP_Y = 4_096;
export const MAX_ANNOTATIONS = 10_000;
export const MAX_POLYLINE_POINTS = 10_000;

export function assertCoordinate(value: unknown): asserts value is Coordinate {
    if (!value || typeof value !== "object") throw new Error("A coordinate must be an object.");
    const point = value as Record<string, unknown>;
    if (![point.x, point.y, point.z].every((item) => typeof item === "number" && Number.isFinite(item)))
        throw new Error("Coordinates must be finite numbers.");
    if (Math.abs(point.x as number) > MAX_MAP_COORDINATE || Math.abs(point.z as number) > MAX_MAP_COORDINATE ||
        (point.y as number) < MIN_MAP_Y || (point.y as number) > MAX_MAP_Y)
        throw new Error(`Coordinates must fit x/z ±${MAX_MAP_COORDINATE} and y ${MIN_MAP_Y}..${MAX_MAP_Y}.`);
}

export function convertCoordinate(coordinate: Coordinate, fromDimension: string, toDimension: string): Coordinate {
    assertCoordinate(coordinate);
    if (fromDimension === toDimension) return { ...coordinate };
    const pair = (fromDimension === "overworld" && toDimension === "nether") || (fromDimension === "nether" && toDimension === "overworld");
    if (!pair) return { ...coordinate };
    const factor = fromDimension === "overworld" ? 1 / 8 : 8;
    const converted = { x: coordinate.x * factor, y: coordinate.y, z: coordinate.z * factor };
    assertCoordinate(converted);
    return converted;
}

export type Waypoint = {
    id: string;
    name: string;
    coordinate: Coordinate;
    dimension: string;
    group: string;
    tags: string[];
    createdAt: string;
};

export type Measurement = {
    id: string;
    kind: MeasurementKind;
    points: Coordinate[];
    dimension: string;
    createdAt: string;
};

export type MeasurementWaypointSnapshot = {
    version: 1;
    scope: { profileId: string; mapId: string; dimension: string };
    waypoints: Waypoint[];
    measurements: Measurement[];
};

export type MeasurementWaypointScope = { profileId: string; mapId: string; dimension: string };
const DEFAULT_SCOPE: MeasurementWaypointScope = { profileId: "default-profile", mapId: "default-map", dimension: "overworld" };
const STORAGE_KEY_PREFIX = "worldlens-measurement-waypoints";
const MAX_ID_LENGTH = 128;
const MAX_DIMENSION_LENGTH = 64;
const MAX_NAME_LENGTH = 256;
const MAX_TAGS = 64;
const MAX_TAG_LENGTH = 128;

function text(value: unknown, label: string, max: number): string {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw new Error(`${label} is invalid.`);
    return value;
}

function instant(value: unknown, label: string): string {
    const parsed = text(value, label, 64);
    if (!Number.isFinite(Date.parse(parsed))) throw new Error(`${label} must be an ISO timestamp.`);
    return parsed;
}

function validateWaypoint(value: unknown): value is Waypoint {
    if (!value || typeof value !== "object") throw new Error("Invalid waypoint record.");
    const waypoint = value as Waypoint;
    text(waypoint.id, "Waypoint id", MAX_ID_LENGTH); text(waypoint.name, "Waypoint name", MAX_NAME_LENGTH);
    text(waypoint.dimension, "Waypoint dimension", MAX_DIMENSION_LENGTH); text(waypoint.group, "Waypoint group", MAX_NAME_LENGTH);
    instant(waypoint.createdAt, "Waypoint createdAt"); assertCoordinate(waypoint.coordinate);
    if (!Array.isArray(waypoint.tags) || waypoint.tags.length > MAX_TAGS || waypoint.tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0 || tag.length > MAX_TAG_LENGTH)) throw new Error("Waypoint tags are invalid.");
    return true;
}

function validateMeasurement(value: unknown): value is Measurement {
    if (!value || typeof value !== "object") throw new Error("Invalid measurement record.");
    const measurement = value as Measurement;
    text(measurement.id, "Measurement id", MAX_ID_LENGTH); text(measurement.dimension, "Measurement dimension", MAX_DIMENSION_LENGTH);
    instant(measurement.createdAt, "Measurement createdAt");
    if (!["point", "distance", "polyline", "horizontal", "vertical", "area"].includes(measurement.kind)) throw new Error("Measurement kind is invalid.");
    if (!Array.isArray(measurement.points) || measurement.points.length > MAX_POLYLINE_POINTS) throw new Error("Measurement points are invalid.");
    measurement.points.forEach(assertCoordinate);
    const minimum = measurement.kind === "point" ? 1 : measurement.kind === "area" || measurement.kind === "polyline" ? 3 : 2;
    if (measurement.points.length < minimum) throw new Error("Measurement has too few points for its kind.");
    return true;
}

function scopeText(scope: MeasurementWaypointScope): MeasurementWaypointScope {
    return { profileId: text(scope.profileId, "Profile id", MAX_ID_LENGTH), mapId: text(scope.mapId, "Map id", MAX_ID_LENGTH), dimension: text(scope.dimension, "Dimension", MAX_DIMENSION_LENGTH) };
}

function scopedStorageKey(scope: MeasurementWaypointScope): string {
    const safe = scopeText(scope);
    return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(safe.profileId)}:${encodeURIComponent(safe.mapId)}:${encodeURIComponent(safe.dimension)}`;
}

function distance(a: Coordinate, b: Coordinate): number {
    assertCoordinate(a); assertCoordinate(b);
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function horizontalDistance(a: Coordinate, b: Coordinate): number {
    assertCoordinate(a); assertCoordinate(b);
    return Math.hypot(a.x - b.x, a.z - b.z);
}

export function horizontalArea(points: readonly Coordinate[]): number {
    if (points.length > MAX_POLYLINE_POINTS) throw new Error(`A measurement may contain at most ${MAX_POLYLINE_POINTS} points.`);
    if (points.length < 3) return 0;
    points.forEach(assertCoordinate);
    let twiceArea = 0;
    for (let index = 0; index < points.length; index++) {
        const a = points[index] as Coordinate;
        const b = points[(index + 1) % points.length] as Coordinate;
        twiceArea += a.x * b.z - b.x * a.z;
    }
    return Math.abs(twiceArea) / 2;
}

export function measurementValue(measurement: Measurement): number | null {
    const [first, ...rest] = measurement.points;
    if (!first) return null;
    if (measurement.kind === "point") return 0;
    if (measurement.kind === "horizontal") return rest[0] ? horizontalDistance(first, rest[0]) : null;
    if (measurement.kind === "vertical") return rest[0] ? Math.abs(first.y - rest[0].y) : null;
    if (measurement.kind === "area") {
        return horizontalArea(measurement.points);
    }
    return rest.length > 0 ? rest.reduce((sum, point, index) => sum + distance(index === 0 ? first : rest[index - 1]!, point), 0) : null;
}

export class MeasurementWaypointModel {
    readonly waypoints: Waypoint[];
    readonly measurements: Measurement[];
    private sequence = 0;
    private readonly storageKey: string;
    private readonly scope: MeasurementWaypointScope;

    constructor(scopeOrStorageKey: MeasurementWaypointScope | string = DEFAULT_SCOPE) {
        this.scope = typeof scopeOrStorageKey === "string" ? DEFAULT_SCOPE : scopeText(scopeOrStorageKey);
        this.storageKey = typeof scopeOrStorageKey === "string" ? scopeOrStorageKey : scopedStorageKey(this.scope);
        const saved = this.read();
        this.waypoints = saved.waypoints;
        this.measurements = saved.measurements;
        this.sequence = Math.max(0, ...[...this.waypoints, ...this.measurements].map((item) => Number(item.id.match(/-(\d+)$/)?.[1] ?? 0)));
    }

    /** Stable identity used by persistence and by callers adding records to this model. */
    get currentScope(): Readonly<MeasurementWaypointScope> { return this.scope; }
    get currentDimension(): string { return this.scope.dimension; }

    private read(): MeasurementWaypointSnapshot {
        try {
            const parsed = JSON.parse(localStorage.getItem(this.storageKey) ?? "null") as Partial<MeasurementWaypointSnapshot> | null;
            if (parsed?.version === 1 && parsed.scope && parsed.scope.profileId === this.scope.profileId && parsed.scope.mapId === this.scope.mapId && parsed.scope.dimension === this.scope.dimension &&
                Array.isArray(parsed.waypoints) && Array.isArray(parsed.measurements) && parsed.waypoints.length + parsed.measurements.length <= MAX_ANNOTATIONS) {
                parsed.waypoints.forEach(validateWaypoint); parsed.measurements.forEach(validateMeasurement);
                if (parsed.waypoints.some((waypoint) => waypoint.dimension !== this.scope.dimension) || parsed.measurements.some((measurement) => measurement.dimension !== this.scope.dimension)) throw new Error("Annotation dimension does not match its storage scope.");
                return { version: 1, scope: this.scope, waypoints: parsed.waypoints, measurements: parsed.measurements };
            }
        } catch { /* corrupt local state is an empty, recoverable collection */ }
        return { version: 1, scope: this.scope, waypoints: [], measurements: [] };
    }

    private persist(): void {
        if (this.waypoints.length + this.measurements.length > MAX_ANNOTATIONS) throw new Error(`At most ${MAX_ANNOTATIONS} annotations are supported.`);
        localStorage.setItem(this.storageKey, JSON.stringify({ version: 1, scope: this.scope, waypoints: this.waypoints, measurements: this.measurements } satisfies MeasurementWaypointSnapshot));
    }

    private id(prefix: string): string {
        let candidate = "";
        const occupied = new Set([...this.waypoints, ...this.measurements].map((item) => item.id));
        do { candidate = `${prefix}-${Date.now()}-${++this.sequence}`; } while (occupied.has(candidate));
        return candidate;
    }

    private withPersistence<T>(mutate: () => T): T {
        const oldWaypoints = this.waypoints.map((waypoint) => ({ ...waypoint, coordinate: { ...waypoint.coordinate }, tags: [...waypoint.tags] }));
        const oldMeasurements = this.measurements.map((measurement) => ({ ...measurement, points: measurement.points.map((point) => ({ ...point })) }));
        try { const result = mutate(); this.persist(); return result; }
        catch (error) { this.waypoints.splice(0, this.waypoints.length, ...oldWaypoints); this.measurements.splice(0, this.measurements.length, ...oldMeasurements); throw error; }
    }

    addWaypoint(input: Omit<Waypoint, "id" | "createdAt">): Waypoint {
        assertCoordinate(input.coordinate);
        if (input.dimension !== this.scope.dimension) throw new Error("Waypoint dimension does not match its storage scope.");
        return this.withPersistence(() => { const waypoint = { ...input, id: this.id("waypoint"), createdAt: new Date().toISOString() }; validateWaypoint(waypoint); this.waypoints.push(waypoint); return waypoint; });
    }

    updateWaypoint(id: string, patch: Partial<Omit<Waypoint, "id" | "createdAt">>): Waypoint | null {
        const waypoint = this.waypoints.find((candidate) => candidate.id === id);
        if (!waypoint) return null;
        return this.withPersistence(() => { Object.assign(waypoint, patch); validateWaypoint(waypoint); if (waypoint.dimension !== this.scope.dimension) throw new Error("Waypoint dimension does not match its storage scope."); return waypoint; });
    }

    addMeasurement(input: Omit<Measurement, "id" | "createdAt">): Measurement {
        if (input.points.length > MAX_POLYLINE_POINTS) throw new Error(`A measurement may contain at most ${MAX_POLYLINE_POINTS} points.`);
        input.points.forEach(assertCoordinate);
        if (input.dimension !== this.scope.dimension) throw new Error("Measurement dimension does not match its storage scope.");
        return this.withPersistence(() => { const measurement = { ...input, id: this.id("measurement"), createdAt: new Date().toISOString() }; validateMeasurement(measurement); this.measurements.push(measurement); return measurement; });
    }

    updateMeasurement(id: string, patch: Partial<Omit<Measurement, "id" | "createdAt">>): Measurement | null {
        const measurement = this.measurements.find((candidate) => candidate.id === id);
        if (!measurement) return null;
        return this.withPersistence(() => { Object.assign(measurement, patch); validateMeasurement(measurement); if (measurement.dimension !== this.scope.dimension) throw new Error("Measurement dimension does not match its storage scope."); return measurement; });
    }

    remove(ids: readonly string[]): void {
        const selected = new Set(ids);
        this.withPersistence(() => {
            for (let index = this.waypoints.length - 1; index >= 0; index--) if (selected.has(this.waypoints[index]!.id)) this.waypoints.splice(index, 1);
            for (let index = this.measurements.length - 1; index >= 0; index--) if (selected.has(this.measurements[index]!.id)) this.measurements.splice(index, 1);
        });
    }

    search(query: string, regex = false, flags = "i"): Array<Waypoint | Measurement> {
        if (!query.trim()) return [...this.waypoints, ...this.measurements];
        let expression: RegExp | null = null;
        if (regex) { try { expression = new RegExp(query, flags.replace(/[gy]/g, "")); } catch { return []; } }
        const matches = (value: string) => expression ? expression.test(value) : value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
        return [...this.waypoints, ...this.measurements].filter((item) => {
            const value = "name" in item ? `${item.name} ${item.group} ${item.tags.join(" ")} ${item.dimension}` : `${item.kind} ${item.dimension}`;
            return matches(value);
        });
    }

    exportJson(): string { return `${JSON.stringify({ version: 1, scope: this.scope, waypoints: this.waypoints, measurements: this.measurements } satisfies MeasurementWaypointSnapshot, null, 2)}\n`; }

    /** Replaces this project collection only after the complete payload validates. */
    importJson(raw: string): { ok: true } | { ok: false; message: string } {
        try {
            if (raw.length > 8 * 1024 * 1024) throw new Error("The annotation file is too large.");
            const parsed = JSON.parse(raw) as Partial<MeasurementWaypointSnapshot>;
            if (parsed.version !== 1 || !parsed.scope || parsed.scope.profileId !== this.scope.profileId || parsed.scope.mapId !== this.scope.mapId || parsed.scope.dimension !== this.scope.dimension || !Array.isArray(parsed.waypoints) || !Array.isArray(parsed.measurements)) throw new Error("Unsupported annotation format, version, or scope.");
            if (parsed.waypoints.length + parsed.measurements.length > MAX_ANNOTATIONS) throw new Error(`At most ${MAX_ANNOTATIONS} annotations are supported.`);
            for (const waypoint of parsed.waypoints) { assertCoordinate(waypoint.coordinate); }
            for (const measurement of parsed.measurements) { if (measurement.points.length > MAX_POLYLINE_POINTS) throw new Error(`A measurement may contain at most ${MAX_POLYLINE_POINTS} points.`); measurement.points.forEach(assertCoordinate); }
            parsed.waypoints.forEach(validateWaypoint); parsed.measurements.forEach(validateMeasurement);
            if (parsed.waypoints.some((waypoint) => waypoint.dimension !== this.scope.dimension) || parsed.measurements.some((measurement) => measurement.dimension !== this.scope.dimension)) throw new Error("Annotation dimension does not match its storage scope.");
            this.withPersistence(() => { this.waypoints.splice(0, this.waypoints.length, ...parsed.waypoints!); this.measurements.splice(0, this.measurements.length, ...parsed.measurements!); });
            return { ok: true };
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : "Invalid annotation file." };
        }
    }
}
