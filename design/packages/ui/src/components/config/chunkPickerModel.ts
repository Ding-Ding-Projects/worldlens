/**
 * "Render only these chunks": which chunks exist, which are picked, and the render mask
 * that picks them.
 *
 * The picker shows the chunks a world has actually generated (read from the region files'
 * headers), lets the user add or remove them with a rectangle, circle or freehand shape, and
 * writes the result as BlueMap `render-mask` boxes: each run of picked chunks in a row becomes
 * one box, and runs that line up across rows merge, so a tidy area stays a handful of boxes.
 * BlueMap renders only what a mask includes once the mask has any entry.
 *
 * Design: `design/design-sources/datapacks-and-chunks/ChunkPicker.dc.html`. Pure.
 */
import type { PlainValue } from "@worldlens/config";

export interface ChunkSpot {
    readonly x: number;
    readonly z: number;
    /** Seconds since 1970 when the game last saved the chunk, or 0 when unknown. */
    readonly saved: number;
}

export interface ChunkBox {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

export type PickShape = "rectangle" | "circle" | "freehand" | "single";

export const keyOf = (x: number, z: number): string => `${x},${z}`;

/** Region folders (relative to the world) that hold one dimension's terrain, old and 26.1 layouts. */
export function regionFoldersFor(dimension: string): string[] {
    const [ns = "minecraft", path = "overworld"] = dimension.includes(":")
        ? dimension.split(":")
        : ["minecraft", dimension];
    const modern = `dimensions/${ns}/${path}/region`;
    if (dimension === "minecraft:overworld") return ["region", modern];
    if (dimension === "minecraft:the_nether") return ["DIM-1/region", modern];
    if (dimension === "minecraft:the_end") return ["DIM1/region", modern];
    return [modern];
}

const REGION_NAME = /^r\.(-?\d+)\.(-?\d+)\.mca$/;

/** The region file coordinates in a relative path inside one of `folders`, or `null`. */
export function regionOf(
    relativePath: string,
    folders: readonly string[],
): { x: number; z: number } | null {
    const path = relativePath.replace(/\\/g, "/");
    const slash = path.lastIndexOf("/");
    const dir = slash < 0 ? "" : path.slice(0, slash);
    if (!folders.includes(dir)) return null;
    const m = REGION_NAME.exec(path.slice(slash + 1));
    return m === null ? null : { x: Number(m[1]), z: Number(m[2]) };
}

/** Chunks a shape covers, judged by each chunk's centre. Coordinates are chunk coordinates. */
export function chunksInShape(
    shape: PickShape,
    points: readonly { x: number; z: number }[],
    present: ReadonlySet<string>,
): string[] {
    const first = points[0];
    const last = points[points.length - 1];
    if (first === undefined || last === undefined) return [];
    const out: string[] = [];
    const consider = (x: number, z: number): void => {
        const k = keyOf(x, z);
        if (present.has(k)) out.push(k);
    };
    if (shape === "single") {
        consider(Math.floor(last.x), Math.floor(last.z));
        return out;
    }
    if (shape === "rectangle") {
        const x0 = Math.floor(Math.min(first.x, last.x));
        const x1 = Math.floor(Math.max(first.x, last.x));
        const z0 = Math.floor(Math.min(first.z, last.z));
        const z1 = Math.floor(Math.max(first.z, last.z));
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) consider(x, z);
        return out;
    }
    if (shape === "circle") {
        const r = Math.hypot(last.x - first.x, last.z - first.z);
        for (let z = Math.floor(first.z - r); z <= Math.ceil(first.z + r); z++) {
            for (let x = Math.floor(first.x - r); x <= Math.ceil(first.x + r); x++) {
                if (Math.hypot(x + 0.5 - first.x, z + 0.5 - first.z) <= r) consider(x, z);
            }
        }
        return out;
    }
    if (points.length < 3) return out;
    const xs = points.map((p) => p.x);
    const zs = points.map((p) => p.z);
    for (let z = Math.floor(Math.min(...zs)); z <= Math.ceil(Math.max(...zs)); z++) {
        for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
            if (insidePolygon(x + 0.5, z + 0.5, points)) consider(x, z);
        }
    }
    return out;
}

function insidePolygon(px: number, pz: number, poly: readonly { x: number; z: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!;
        const b = poly[j]!;
        if (a.z > pz !== b.z > pz && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x)
            inside = !inside;
    }
    return inside;
}

/** Applies a shape: adds its chunks, or removes them when `remove` is set. */
export function applyShape(
    selected: ReadonlySet<string>,
    chunks: readonly string[],
    remove: boolean,
): Set<string> {
    const next = new Set(selected);
    for (const k of chunks) {
        if (remove) next.delete(k);
        else next.add(k);
    }
    return next;
}

/** Merges picked chunks into as few chunk-aligned boxes as row runs allow. */
export function boxesFor(selected: ReadonlySet<string>): ChunkBox[] {
    const rows = new Map<number, number[]>();
    for (const k of selected) {
        const [x, z] = k.split(",").map(Number) as [number, number];
        const row = rows.get(z);
        if (row) row.push(x);
        else rows.set(z, [x]);
    }
    const open = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>();
    const done: ChunkBox[] = [];
    for (const z of [...rows.keys()].sort((a, b) => a - b)) {
        const xs = rows.get(z)!.sort((a, b) => a - b);
        const runs: [number, number][] = [];
        for (const x of xs) {
            const run = runs[runs.length - 1];
            if (run && x === run[1] + 1) run[1] = x;
            else runs.push([x, x]);
        }
        const still = new Set<string>();
        for (const [a, b] of runs) {
            const id = `${a}:${b}`;
            const box = open.get(id);
            if (box && box.maxZ === z - 1) box.maxZ = z;
            else {
                if (box) done.push({ ...box });
                open.set(id, { minX: a, maxX: b, minZ: z, maxZ: z });
            }
            still.add(id);
        }
        for (const [id, box] of open) {
            if (!still.has(id)) {
                done.push({ ...box });
                open.delete(id);
            }
        }
    }
    done.push(...[...open.values()].map((b) => ({ ...b })));
    return done.sort((a, b) => a.minZ - b.minZ || a.minX - b.minX);
}

/** BlueMap `render-mask` box records, in block coordinates, for picked chunks. */
export function maskRecordsFor(selected: ReadonlySet<string>): Record<string, PlainValue>[] {
    return boxesFor(selected).map((b) => ({
        "min-x": b.minX * 16,
        "max-x": b.maxX * 16 + 15,
        "min-z": b.minZ * 16,
        "max-z": b.maxZ * 16 + 15,
    }));
}

/**
 * Reads back an existing mask made of chunk-aligned boxes as picked chunks. Returns `null`
 * when the mask holds anything else (circles, subtractions, off-grid edges), so the picker
 * never silently changes a mask it cannot show.
 */
export function selectionFromMask(records: readonly PlainValue[]): Set<string> | null {
    const out = new Set<string>();
    for (const value of records) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
        const r = value as Record<string, PlainValue>;
        const type = typeof r["type"] === "string" ? r["type"] : "box";
        if (type !== "box" || r["subtract"] === true) return null;
        const nums = ["min-x", "max-x", "min-z", "max-z"].map((k) => r[k]);
        if (!nums.every((n) => typeof n === "number" && Number.isInteger(n))) return null;
        const [minX, maxX, minZ, maxZ] = nums as [number, number, number, number];
        if (minX % 16 !== 0 || minZ % 16 !== 0 || (maxX + 1) % 16 !== 0 || (maxZ + 1) % 16 !== 0)
            return null;
        if ((maxX - minX + 1) * (maxZ - minZ + 1) > 256 * 1_000_000) return null;
        for (let z = minZ / 16; z <= (maxZ + 1) / 16 - 1; z++) {
            for (let x = minX / 16; x <= (maxX + 1) / 16 - 1; x++) out.add(keyOf(x, z));
        }
    }
    return out;
}

/** The chunk-coordinate bounds of what is drawn, padded by one chunk. */
export function viewBounds(chunks: readonly ChunkSpot[]): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
} {
    if (chunks.length === 0) return { minX: -8, maxX: 7, minZ: -8, maxZ: 7 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const c of chunks) {
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minZ = Math.min(minZ, c.z);
        maxZ = Math.max(maxZ, c.z);
    }
    return { minX: minX - 1, maxX: maxX + 1, minZ: minZ - 1, maxZ: maxZ + 1 };
}
