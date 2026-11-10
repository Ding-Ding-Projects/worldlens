import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { CoreProtectDb } from "./coreprotectDb.js";
import { DEFAULT_FILTER, advance, coreProtectSpan, happenedBy, highlightData, quickActions, scopeArguments, summarize, toCsv } from "./coreprotectModel.js";
import { sampleDatabase } from "./testing/sampleDatabase.js";

const require = createRequire(import.meta.url);
let SQL: SqlJsStatic;
const START = 1_762_700_000;
const WORDS = { place: "placed", break: "broke", click: "used", kill: "killed" } as const;

beforeAll(async () => {
    const wasm = require.resolve("sql.js/dist/sql-wasm.wasm");
    SQL = await initSqlJs({ locateFile: () => wasm });
});

describe("reading a CoreProtect database", () => {
    it("finds the tables, worlds, users and time range", async () => {
        const db = await CoreProtectDb.open(sampleDatabase(SQL, { start: START }), SQL);
        expect(db.meta.prefix).toBe("co_");
        expect(db.meta.worlds).toEqual(["world", "world_nether"]);
        expect(db.meta.users).toEqual(["#creeper", "Builder_Amy", "Griefer99", "LumberLee"]);
        expect(db.meta.blockRows).toBeGreaterThan(60);
        expect(db.meta.first).toBe(START + 3);
    });

    it("finds a custom table prefix", async () => {
        const db = await CoreProtectDb.open(sampleDatabase(SQL, { prefix: "cp_" }), SQL);
        expect(db.meta.prefix).toBe("cp_");
    });

    it("refuses files that are not CoreProtect databases", async () => {
        await expect(CoreProtectDb.open(new TextEncoder().encode("x".repeat(200)), SQL)).rejects.toThrow(/not an SQLite database/u);
        const other = new SQL.Database();
        other.run("CREATE TABLE notes (a TEXT)");
        await expect(CoreProtectDb.open(other.export(), SQL)).rejects.toThrow(/no CoreProtect block/u);
    });

    it("filters by world, user, action, material, time and rollback state", async () => {
        const db = await CoreProtectDb.open(sampleDatabase(SQL, { start: START }), SQL);
        const all = db.query({ ...DEFAULT_FILTER, actions: ["break", "place", "click", "kill"] }).changes;
        expect(all.at(-1)!.world).toBe("world_nether");
        const overworld = db.query({ ...DEFAULT_FILTER, world: "world" }).changes;
        expect(overworld.every((c) => c.world === "world")).toBe(true);
        const lee = db.query({ ...DEFAULT_FILTER, users: ["LumberLee"] }).changes;
        expect(lee).toHaveLength(6);
        expect(lee.every((c) => c.action === "break" && c.material === "minecraft:oak_log")).toBe(true);
        expect(db.query({ ...DEFAULT_FILTER, material: "glass" }).changes).toHaveLength(15);
        expect(db.query({ ...DEFAULT_FILTER, actions: ["click"] }).changes).toHaveLength(1);
        const kept = db.query({ ...DEFAULT_FILTER, includeRolledBack: false }).changes;
        expect(kept.some((c) => c.user === "Griefer99")).toBe(false);
        expect(db.query({ ...DEFAULT_FILTER, from: START, to: START + 10 }).changes).toHaveLength(3);
        // A material filter with SQL wildcards matches them literally.
        expect(db.query({ ...DEFAULT_FILTER, material: "%" }).changes).toHaveLength(0);
        expect(db.query({ ...DEFAULT_FILTER }, 5)).toMatchObject({ more: true });
    });
});

describe("the highlight layer and replay", () => {
    it("draws the last change at each block, newest first, with escaped labels", async () => {
        const db = await CoreProtectDb.open(sampleDatabase(SQL, { start: START }), SQL);
        const changes = db.query({ ...DEFAULT_FILTER, world: "world" }).changes;
        const layer = highlightData(changes, { label: "CoreProtect", now: START + 400, fadeSeconds: 600, words: WORDS });
        expect(layer.distinct).toBeLessThan(changes.length);
        const markers = Object.values(layer.data.markers) as { shape: { x: number; z: number }[]; label: string; detail: string; shapeY: number }[];
        // Newest first: the last block the grief broke, at 104 65 -40, which replaced the plank there.
        expect(markers[0]!.label).toBe("− broke oak_planks · Griefer99");
        expect(markers[0]!.shape).toEqual([{ x: 104, z: -40 }, { x: 105, z: -40 }, { x: 105, z: -39 }, { x: 104, z: -39 }]);
        expect(markers[0]!.shapeY).toBeCloseTo(66.02);
        expect(markers.every((m) => m.shape.length === 4)).toBe(true);
        const evil = highlightData([{ time: 1, user: "<img src=x onerror=alert(1)>", world: "w", x: 0, y: 0, z: 0, material: "m", action: "place", rolledBack: false }], { label: "L", now: 1, fadeSeconds: 0, words: WORDS });
        expect(JSON.stringify(evil.data.markers)).not.toContain("<img");
    });

    it("replays changes in order at the chosen speed", () => {
        const changes = [10, 20, 30].map((time) => ({ time, user: "a", world: "w", x: 0, y: 0, z: time, material: "m", action: "place" as const, rolledBack: false }));
        expect(happenedBy(changes, 20)).toHaveLength(2);
        expect(advance(10, 500, 20, 30)).toBe(20);
        expect(advance(25, 1000, 20, 30)).toBe(30);
    });

    it("summarises what a filter found", () => {
        const s = summarize([{ time: 5, user: "a", world: "w", x: -3, y: 0, z: 2, material: "m", action: "break", rolledBack: false }, { time: 9, user: "b", world: "w", x: 4, y: 0, z: -1, material: "m", action: "place", rolledBack: false }]);
        expect(s).toMatchObject({ total: 2, users: 2, first: 5, last: 9, byAction: { break: 1, place: 1 }, bounds: { minX: -3, maxX: 4, minZ: -1, maxZ: 2 } });
    });
});

describe("quick actions", () => {
    const scope = { users: ["Griefer99"], world: "world", from: 1000, to: 1100, now: 1000 + 3600 };
    it("writes CoreProtect's own arguments for the selected users, world and time range", () => {
        expect(coreProtectSpan(3600)).toBe("1h");
        expect(coreProtectSpan(90)).toBe("90s");
        expect(scopeArguments(scope)).toBe("u:Griefer99 t:3499s-3601s r:#world");
        expect(scopeArguments({ ...scope, users: [], world: null, to: 4600 })).toBe("t:3601s r:#global");
    });

    it("marks rollback and restore as world-changing and refuses names that could inject", () => {
        const actions = quickActions({ ...scope, users: ["Griefer99", "x; /op me"] }, null);
        expect(actions.find((a) => a.id === "rollback")).toMatchObject({ changesWorld: true, command: "/co rollback u:Griefer99 t:3499s-3601s r:#world" });
        expect(actions.find((a) => a.id === "lookup")!.changesWorld).toBe(false);
        expect(actions.some((a) => a.command.includes("/op"))).toBe(false);
        const focus = { time: 1, user: "a", world: "world", x: 5, y: 64, z: -9, material: "m", action: "place" as const, rolledBack: false };
        expect(quickActions(scope, focus).at(-1)).toMatchObject({ id: "teleport", command: "/tp @s 5 65 -9" });
    });

    it("exports CSV with formulas neutralised", () => {
        const csv = toCsv([{ time: 0, user: "=HYPERLINK(1)", world: "world", x: -1, y: 2, z: 3, material: "minecraft:tnt", action: "place", rolledBack: false }]);
        expect(csv.split("\r\n")[1]).toBe(`1970-01-01T00:00:00.000Z,0,"'=HYPERLINK(1)",world,-1,2,3,minecraft:tnt,place,false`);
    });
});
