/**
 * The drawing board's model: pens, strokes, the partial eraser, Shift-locked lines, undo and
 * redo, and the one segment list that both the canvas and the SVG export draw from, so an
 * export is exactly what is on screen.
 *
 * Pure and framework-free, so every rule here is tested without a canvas.
 */

export type PenId = "pencil" | "pen" | "fineliner" | "marker" | "highlighter" | "brush" | "fountain";
export type ToolId = PenId | "eraser";

export interface PenDef {
    readonly id: PenId;
    /** The key that picks this pen. The same value is shown in its tooltip and menu row. */
    readonly key: string;
    readonly baseSize: number;
    readonly opacity: number;
    /** How the width responds: to speed (thins as it speeds up), to direction, or not at all. */
    readonly response: "speed" | "direction" | "constant";
    /** Smallest width as a share of the base, for the speed and direction responses. */
    readonly floor: number;
}

export const PENS: readonly PenDef[] = [
    { id: "pencil", key: "N", baseSize: 3, opacity: 0.85, response: "speed", floor: 0.55 },
    { id: "pen", key: "P", baseSize: 5, opacity: 1, response: "speed", floor: 0.45 },
    { id: "fineliner", key: "F", baseSize: 2, opacity: 1, response: "constant", floor: 1 },
    { id: "marker", key: "M", baseSize: 10, opacity: 0.9, response: "constant", floor: 1 },
    { id: "highlighter", key: "H", baseSize: 18, opacity: 0.35, response: "constant", floor: 1 },
    { id: "brush", key: "B", baseSize: 14, opacity: 0.95, response: "speed", floor: 0.3 },
    { id: "fountain", key: "I", baseSize: 8, opacity: 1, response: "direction", floor: 0.25 },
];

export const ERASER_KEY = "E";

export const penById = (id: PenId): PenDef => PENS.find((p) => p.id === id) ?? PENS[1]!;

export interface Point {
    readonly x: number;
    readonly y: number;
    /** Milliseconds since the stroke began; drives the speed response. */
    readonly t: number;
}

export interface Stroke {
    readonly id: string;
    readonly pen: PenId;
    readonly color: string;
    /** Multiplier on the pen's base size, from the size slider. */
    readonly scale: number;
    readonly points: readonly Point[];
}

export interface Segment {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly width: number;
    readonly color: string;
    readonly opacity: number;
}

/** Points are kept at most this far apart so the eraser can cut a stroke anywhere along it. */
export const MAX_GAP = 2;

/** Adds `next` to a stroke's points, filling any gap wider than `MAX_GAP` with straight steps. */
export function appendPoint(points: readonly Point[], next: Point): Point[] {
    const out = points.slice();
    const last = out.at(-1);
    if (!last) return [next];
    const distance = Math.hypot(next.x - last.x, next.y - last.y);
    if (distance === 0) return out;
    const steps = Math.ceil(distance / MAX_GAP);
    for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        out.push({ x: last.x + (next.x - last.x) * f, y: last.y + (next.y - last.y) * f, t: last.t + (next.t - last.t) * f });
    }
    return out;
}

/**
 * Shift-lock: the straight line from `start` to `end` snapped to the nearest of eight
 * directions, keeping the pointer's distance along that direction.
 */
export function lockedLine(start: Point, end: Point): Point[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const ux = Math.round(Math.cos(angle) * 1e9) / 1e9;
    const uy = Math.round(Math.sin(angle) * 1e9) / 1e9;
    const length = dx * ux + dy * uy;
    return appendPoint([start], { x: start.x + ux * length, y: start.y + uy * length, t: end.t });
}

/** The width of the segment from `a` to `b` for a pen, from speed or direction. */
export function segmentWidth(pen: PenDef, scale: number, a: Point, b: Point): number {
    const base = pen.baseSize * scale;
    if (pen.response === "constant") return base;
    if (pen.response === "direction") {
        // A nib held at 45 degrees: widest across the nib, thinnest along it.
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const across = Math.abs(Math.sin(angle - Math.PI / 4));
        return base * (pen.floor + (1 - pen.floor) * across);
    }
    const dt = Math.max(1, b.t - a.t);
    const speed = Math.hypot(b.x - a.x, b.y - a.y) / dt; // pixels per millisecond
    const thin = Math.min(1, speed / 1.5);
    return base * (1 - (1 - pen.floor) * thin);
}

/** Every segment of a stroke, the single source for the canvas and the SVG export. */
export function strokeSegments(stroke: Stroke): Segment[] {
    const pen = penById(stroke.pen);
    const out: Segment[] = [];
    const pts = stroke.points;
    if (pts.length === 1) {
        const p = pts[0]!;
        return [{ x1: p.x, y1: p.y, x2: p.x, y2: p.y, width: pen.baseSize * stroke.scale, color: stroke.color, opacity: pen.opacity }];
    }
    // Widths are smoothed over neighbours so a speed change never shows as a step.
    let previous: number | null = null;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const raw = segmentWidth(pen, stroke.scale, a, b);
        const width: number = previous === null ? raw : previous * 0.7 + raw * 0.3;
        previous = width;
        out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: Math.round(width * 100) / 100, color: stroke.color, opacity: pen.opacity });
    }
    return out;
}

/**
 * The partial eraser: removes every point within `radius` of `at` and splits a stroke where
 * points were removed, so erasing the middle of a line leaves two lines.
 */
export function eraseAt(strokes: readonly Stroke[], at: { readonly x: number; readonly y: number }, radius: number, newId: () => string): Stroke[] {
    const out: Stroke[] = [];
    for (const stroke of strokes) {
        const reach = radius + (penById(stroke.pen).baseSize * stroke.scale) / 2;
        let run: Point[] = [];
        const runs: Point[][] = [];
        let touched = false;
        for (const p of stroke.points) {
            if (Math.hypot(p.x - at.x, p.y - at.y) <= reach) {
                touched = true;
                if (run.length) runs.push(run);
                run = [];
            } else {
                run.push(p);
            }
        }
        if (run.length) runs.push(run);
        if (!touched) {
            out.push(stroke);
            continue;
        }
        runs.forEach((points, i) => out.push({ ...stroke, id: i === 0 ? stroke.id : newId(), points }));
    }
    return out;
}

const escapeAttr = (value: string): string => value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;");

/** Only colours that cannot carry markup reach an SVG attribute. */
export function safeColor(value: string): string {
    return /^#[0-9a-f]{3,8}$/iu.test(value) || /^(rgb|hsl)a?\([\d\s.,%/-]+\)$/iu.test(value) ? value : "#000000";
}

export interface ExportOptions {
    readonly width: number;
    readonly height: number;
    /** A background image as a data URL, drawn first. */
    readonly background?: string | null;
    /** A plain background colour for a blank board. */
    readonly fill?: string | null;
}

/** The board as SVG: the same segments the canvas draws, in drawing order. */
export function toSvg(strokes: readonly Stroke[], options: ExportOptions): string {
    const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">`,
    ];
    if (options.fill) parts.push(`<rect width="100%" height="100%" fill="${escapeAttr(safeColor(options.fill))}"/>`);
    if (options.background && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/u.test(options.background)) {
        parts.push(`<image href="${options.background}" width="${options.width}" height="${options.height}" preserveAspectRatio="xMidYMid meet"/>`);
    }
    for (const stroke of strokes) {
        const pen = penById(stroke.pen);
        parts.push(`<g stroke="${escapeAttr(safeColor(stroke.color))}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${pen.opacity}">`);
        for (const s of strokeSegments(stroke)) {
            parts.push(`<line x1="${round(s.x1)}" y1="${round(s.y1)}" x2="${round(s.x2)}" y2="${round(s.y2)}" stroke-width="${s.width}"/>`);
        }
        parts.push("</g>");
    }
    parts.push("</svg>");
    return parts.join("");
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** Undo and redo over whole boards: each change pushes the board it replaced. */
export class DrawingHistory {
    past: Stroke[][] = [];
    future: Stroke[][] = [];
    current: Stroke[] = [];

    constructor(initial: readonly Stroke[] = [], readonly limit = 500) {
        this.current = initial.slice();
    }

    change(next: readonly Stroke[]): void {
        this.past.push(this.current);
        if (this.past.length > this.limit) this.past.shift();
        this.current = next.slice();
        this.future = [];
    }

    undo(): boolean {
        const previous = this.past.pop();
        if (!previous) return false;
        this.future.push(this.current);
        this.current = previous;
        return true;
    }

    redo(): boolean {
        const next = this.future.pop();
        if (!next) return false;
        this.past.push(this.current);
        this.current = next;
        return true;
    }

    get canUndo(): boolean {
        return this.past.length > 0;
    }

    get canRedo(): boolean {
        return this.future.length > 0;
    }
}

export const STORAGE_KEY = "worldlens.drawing.v1";

export interface SavedBoard {
    readonly version: 1;
    readonly strokes: readonly Stroke[];
    readonly past: readonly (readonly Stroke[])[];
    readonly future: readonly (readonly Stroke[])[];
    readonly background: string | null;
    readonly width: number;
    readonly height: number;
}

/** Reads a saved board, refusing anything that is not one rather than drawing garbage. */
export function parseSaved(text: string | null): SavedBoard | null {
    if (!text) return null;
    try {
        const value = JSON.parse(text) as Partial<SavedBoard>;
        if (value.version !== 1 || !Array.isArray(value.strokes)) return null;
        const valid = (s: unknown): s is Stroke =>
            typeof s === "object" && s !== null && typeof (s as Stroke).id === "string" && PENS.some((p) => p.id === (s as Stroke).pen) && Array.isArray((s as Stroke).points);
        const board = (list: unknown): Stroke[] => (Array.isArray(list) ? list.filter(valid) : []);
        return {
            version: 1,
            strokes: board(value.strokes),
            past: Array.isArray(value.past) ? value.past.map(board).slice(-100) : [],
            future: Array.isArray(value.future) ? value.future.map(board).slice(-100) : [],
            background: typeof value.background === "string" ? value.background : null,
            width: typeof value.width === "number" ? value.width : 1200,
            height: typeof value.height === "number" ? value.height : 800,
        };
    } catch {
        return null;
    }
}
