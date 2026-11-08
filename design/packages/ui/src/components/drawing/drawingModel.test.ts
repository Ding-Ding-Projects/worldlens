import { describe, expect, it } from "vitest";
import { DrawingHistory, PENS, appendPoint, eraseAt, lockedLine, parseSaved, penById, safeColor, strokeSegments, toSvg, type Point, type Stroke } from "./drawingModel.js";

const line = (from: Point, to: Point): Point[] => appendPoint([from], to);
let n = 0;
const id = (): string => `s${++n}`;

describe("pens", () => {
    it("has the seven pens, each with its own key, plus the eraser key", () => {
        expect(PENS.map((p) => p.id)).toEqual(["pencil", "pen", "fineliner", "marker", "highlighter", "brush", "fountain"]);
        const keys = PENS.map((p) => p.key);
        expect(new Set([...keys, "E"]).size).toBe(8);
    });

    it("thins pencil, pen and brush as the stroke speeds up and keeps fineliner and highlighter constant", () => {
        const slow = line({ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 1000 });
        const fast = line({ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 20 });
        for (const pen of ["pencil", "pen", "brush"] as const) {
            const w = (pts: Point[]) => strokeSegments({ id: "a", pen, color: "#000", scale: 1, points: pts }).at(-1)!.width;
            expect(w(fast), pen).toBeLessThan(w(slow));
        }
        for (const pen of ["fineliner", "highlighter", "marker"] as const) {
            const widths = strokeSegments({ id: "a", pen, color: "#000", scale: 1, points: fast }).map((s) => s.width);
            expect(new Set(widths).size, pen).toBe(1);
            expect(widths[0]).toBe(penById(pen).baseSize);
        }
    });

    it("varies the fountain pen with direction", () => {
        const across = strokeSegments({ id: "a", pen: "fountain", color: "#000", scale: 1, points: line({ x: 0, y: 0, t: 0 }, { x: 0, y: 100, t: 500 }) }).at(-1)!.width;
        const along = strokeSegments({ id: "b", pen: "fountain", color: "#000", scale: 1, points: line({ x: 0, y: 0, t: 0 }, { x: 100, y: 100, t: 500 }) }).at(-1)!.width;
        expect(along).toBeLessThan(across);
    });
});

describe("strokes", () => {
    it("fills gaps so no two points are more than two pixels apart", () => {
        const pts = line({ x: 0, y: 0, t: 0 }, { x: 30, y: 40, t: 50 });
        for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)).toBeLessThanOrEqual(2.0001);
        expect(pts.at(-1)).toMatchObject({ x: 30, y: 40 });
    });

    it("locks a Shift stroke to the nearest of eight directions", () => {
        const start = { x: 10, y: 10, t: 0 };
        expect(lockedLine(start, { x: 110, y: 18, t: 1 }).at(-1)).toMatchObject({ y: 10 });
        const diagonal = lockedLine(start, { x: 100, y: 94, t: 1 }).at(-1)!;
        expect(Math.abs(diagonal.x - start.x - (diagonal.y - start.y))).toBeLessThan(1e-6);
        expect(lockedLine(start, { x: 12, y: -90, t: 1 }).at(-1)).toMatchObject({ x: 10 });
    });

    it("erases part of a stroke and leaves the two ends as separate strokes", () => {
        const stroke: Stroke = { id: "a", pen: "fineliner", color: "#000", scale: 1, points: line({ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 100 }) };
        const after = eraseAt([stroke], { x: 50, y: 0 }, 5, id);
        expect(after).toHaveLength(2);
        expect(after[0]!.id).toBe("a");
        expect(Math.max(...after[0]!.points.map((p) => p.x))).toBeLessThan(45);
        expect(Math.min(...after[1]!.points.map((p) => p.x))).toBeGreaterThan(55);
        expect(eraseAt([stroke], { x: 50, y: 50 }, 5, id)).toEqual([stroke]);
    });
});

describe("SVG export", () => {
    it("draws exactly the segments the canvas draws, erasing included", () => {
        const stroke: Stroke = { id: "a", pen: "pen", color: "#c2410c", scale: 1, points: line({ x: 0, y: 0, t: 0 }, { x: 40, y: 0, t: 40 }) };
        const erased = eraseAt([stroke], { x: 20, y: 0 }, 3, id);
        const svg = toSvg(erased, { width: 100, height: 50, fill: "#ffffff" });
        const lines = svg.match(/<line /gu)?.length ?? 0;
        expect(lines).toBe(erased.flatMap(strokeSegments).length);
        expect(svg).toContain('stroke="#c2410c"');
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"')).toBe(true);
    });

    it("never lets a colour or background carry markup", () => {
        expect(safeColor('red" onload="x')).toBe("#000000");
        const svg = toSvg([{ id: "a", pen: "pen", color: '"/><script>', scale: 1, points: [{ x: 1, y: 1, t: 0 }] }], { width: 10, height: 10, background: "javascript:alert(1)" });
        expect(svg).not.toContain("<script");
        expect(svg).not.toContain("javascript:");
    });
});

describe("undo, redo and saving", () => {
    it("steps back and forward through whole boards and drops redo on a new change", () => {
        const h = new DrawingHistory();
        const a: Stroke = { id: "a", pen: "pen", color: "#000", scale: 1, points: [{ x: 0, y: 0, t: 0 }] };
        h.change([a]);
        h.change([a, { ...a, id: "b" }]);
        expect(h.undo()).toBe(true);
        expect(h.current.map((s) => s.id)).toEqual(["a"]);
        expect(h.redo()).toBe(true);
        expect(h.current).toHaveLength(2);
        h.undo();
        h.change([]);
        expect(h.canRedo).toBe(false);
    });

    it("reads back a saved board and refuses anything else", () => {
        const saved = { version: 1, strokes: [{ id: "a", pen: "pen", color: "#000", scale: 1, points: [] }, { id: "x", pen: "crayon", points: [] }], past: [[]], future: [], background: null, width: 640, height: 480 };
        const board = parseSaved(JSON.stringify(saved))!;
        expect(board.strokes.map((s) => s.id)).toEqual(["a"]);
        expect(board.past).toHaveLength(1);
        expect(parseSaved("{")).toBeNull();
        expect(parseSaved(JSON.stringify({ version: 2 }))).toBeNull();
    });
});
