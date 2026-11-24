/**
 * Typed views over the world generation parts' JSON: placed features, ore veins, structure
 * spacing and noise settings.
 *
 * Every edit is a patch on the parsed file, not a rebuild, so a field this editor does not
 * draw is never lost: change the sea level and the noise router you wrote by hand stays as
 * it was. A placement step this editor does not know is shown by name and kept.
 */

type Json = Record<string, unknown>;

const obj = (v: unknown): Json | null =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : null;
const short = (id: unknown): string => (typeof id === "string" ? id.replace(/^minecraft:/, "") : "");

export function parseObject(text: string): Json | null {
    try {
        return obj(JSON.parse(text));
    } catch {
        return null;
    }
}

export const writeJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/* -------------------------------------------------------------------------- */
/* Placed features                                                             */
/* -------------------------------------------------------------------------- */

export type PlacementStep =
    | { kind: "count"; count: number }
    | { kind: "rarity_filter"; chance: number }
    | { kind: "in_square" }
    | { kind: "biome" }
    | { kind: "height_range"; spread: "uniform" | "trapezoid"; low: number; high: number }
    | { kind: "other"; name: string; raw: Json };

export const NEW_PLACEMENT_KINDS = ["count", "rarity_filter", "in_square", "height_range", "biome"] as const;
export type NewPlacementKind = (typeof NEW_PLACEMENT_KINDS)[number];

const absolute = (v: unknown): number | null => {
    const o = obj(v);
    return o !== null && typeof o["absolute"] === "number" && Object.keys(o).length === 1 ? o["absolute"] : null;
};

export function readPlacement(raw: Json): PlacementStep {
    const name = short(raw["type"]);
    const keys = Object.keys(raw).filter((k) => k !== "type");
    const other = (): PlacementStep => ({ kind: "other", name: name || "(no type)", raw });
    switch (name) {
        case "count":
            return typeof raw["count"] === "number" && keys.length === 1 ? { kind: "count", count: raw["count"] } : other();
        case "rarity_filter":
            return typeof raw["chance"] === "number" && keys.length === 1 ? { kind: "rarity_filter", chance: raw["chance"] } : other();
        case "in_square":
        case "biome":
            return keys.length === 0 ? { kind: name } : other();
        case "height_range": {
            const h = obj(raw["height"]);
            if (h === null || keys.length !== 1) return other();
            const spread = short(h["type"]);
            const low = absolute(h["min_inclusive"]);
            const high = absolute(h["max_inclusive"]);
            const extra = Object.keys(h).filter((k) => !["type", "min_inclusive", "max_inclusive"].includes(k));
            if ((spread !== "uniform" && spread !== "trapezoid") || low === null || high === null || extra.length > 0)
                return other();
            return { kind: "height_range", spread, low, high };
        }
        default:
            return other();
    }
}

export function writePlacement(step: PlacementStep): Json {
    switch (step.kind) {
        case "other":
            return step.raw;
        case "count":
            return { type: "minecraft:count", count: step.count };
        case "rarity_filter":
            return { type: "minecraft:rarity_filter", chance: step.chance };
        case "height_range":
            return {
                type: "minecraft:height_range",
                height: {
                    type: `minecraft:${step.spread}`,
                    min_inclusive: { absolute: step.low },
                    max_inclusive: { absolute: step.high },
                },
            };
        default:
            return { type: `minecraft:${step.kind}` };
    }
}

export function newPlacement(kind: NewPlacementKind): PlacementStep {
    switch (kind) {
        case "count":
            return { kind, count: 4 };
        case "rarity_filter":
            return { kind, chance: 8 };
        case "height_range":
            return { kind, spread: "uniform", low: -64, high: 16 };
        default:
            return { kind };
    }
}

export interface PlacedFeature {
    feature: string;
    steps: PlacementStep[];
}

export function readPlaced(text: string): PlacedFeature | null {
    const o = parseObject(text);
    if (o === null || !Array.isArray(o["placement"])) return null;
    const steps = (o["placement"] as unknown[]).map((s) => obj(s));
    if (steps.some((s) => s === null)) return null;
    return {
        feature: typeof o["feature"] === "string" ? o["feature"] : "",
        steps: (steps as Json[]).map(readPlacement),
    };
}

/** Writes the placed feature back, keeping any field this view does not cover. */
export function writePlaced(text: string, placed: PlacedFeature): string {
    const o = parseObject(text) ?? {};
    return writeJson({ ...o, feature: placed.feature, placement: placed.steps.map(writePlacement) });
}

/** The Y band a placed feature can land in, from its height range steps, or null. */
export function placedBand(placed: PlacedFeature): { low: number; high: number } | null {
    const range = placed.steps.find((s) => s.kind === "height_range");
    if (range === undefined || range.kind !== "height_range") return null;
    return { low: Math.min(range.low, range.high), high: Math.max(range.low, range.high) };
}

/* -------------------------------------------------------------------------- */
/* Patches on single fields                                                    */
/* -------------------------------------------------------------------------- */

/** Reads the value at a dotted path, with numeric parts as array indexes. */
export function getAt(o: unknown, path: string): unknown {
    let at: unknown = o;
    for (const part of path.split(".")) {
        if (at === null || typeof at !== "object") return undefined;
        at = (at as Record<string, unknown>)[part];
    }
    return at;
}

/** Sets the value at a dotted path, creating objects on the way. Arrays must already exist. */
export function setAt(text: string, path: string, value: unknown): string {
    const root = parseObject(text) ?? {};
    const parts = path.split(".");
    let at: Record<string, unknown> = root;
    for (const part of parts.slice(0, -1)) {
        const next = at[part];
        if (next === null || typeof next !== "object") at[part] = {};
        at = at[part] as Record<string, unknown>;
    }
    at[parts.at(-1)!] = value;
    return writeJson(root);
}

/* -------------------------------------------------------------------------- */
/* Structure sets                                                              */
/* -------------------------------------------------------------------------- */

/** A random_spread placement's spacing and separation, or null for any other placement. */
export function readSpread(text: string): { spacing: number; separation: number } | null {
    const o = parseObject(text);
    const p = obj(o?.["placement"]);
    if (p === null || short(p["type"]) !== "random_spread") return null;
    const spacing = p["spacing"];
    const separation = p["separation"];
    if (typeof spacing !== "number" || typeof separation !== "number") return null;
    return { spacing, separation };
}

/** The game refuses a spread whose separation is not smaller than its spacing. */
export const spreadProblem = (s: { spacing: number; separation: number }): string | null =>
    s.separation >= s.spacing ? "Separation has to be smaller than spacing." : null;

/* -------------------------------------------------------------------------- */
/* Jigsaw pools                                                                */
/* -------------------------------------------------------------------------- */

export interface PoolPiece {
    weight: number;
    location: string;
    projection: "rigid" | "terrain_matching";
    /** The element object as it was, so fields with no control here are kept. */
    raw: Json;
    /** False for an element kind other than a single or legacy single piece. */
    editable: boolean;
}

export function readPool(text: string): PoolPiece[] | null {
    const o = parseObject(text);
    if (o === null || !Array.isArray(o["elements"])) return null;
    const out: PoolPiece[] = [];
    for (const entry of o["elements"] as unknown[]) {
        const e = obj(entry);
        if (e === null) return null;
        const el = obj(e["element"]) ?? {};
        const kind = short(el["element_type"]);
        const editable = (kind === "single_pool_element" || kind === "legacy_single_pool_element") && typeof el["location"] === "string";
        out.push({
            weight: typeof e["weight"] === "number" ? e["weight"] : 1,
            location: typeof el["location"] === "string" ? el["location"] : "",
            projection: el["projection"] === "terrain_matching" ? "terrain_matching" : "rigid",
            raw: el,
            editable,
        });
    }
    return out;
}

export function writePool(text: string, pieces: readonly PoolPiece[]): string {
    const o = parseObject(text) ?? {};
    return writeJson({
        ...o,
        elements: pieces.map((p) => ({
            weight: p.weight,
            element: p.editable ? { ...p.raw, location: p.location, projection: p.projection } : p.raw,
        })),
    });
}

export function newPoolPiece(namespace: string): PoolPiece {
    return {
        weight: 1,
        location: `${namespace}:new_piece`,
        projection: "rigid",
        raw: { element_type: "minecraft:single_pool_element", location: `${namespace}:new_piece`, processors: "minecraft:empty", projection: "rigid" },
        editable: true,
    };
}

/* -------------------------------------------------------------------------- */
/* Processor lists                                                             */
/* -------------------------------------------------------------------------- */

export type Processor =
    | { kind: "block_rot"; integrity: number; raw: Json }
    | { kind: "gravity"; heightmap: string; offset: number; raw: Json }
    | { kind: "block_ignore"; blocks: string[]; raw: Json }
    | { kind: "other"; name: string; raw: Json };

export const NEW_PROCESSOR_KINDS = ["block_rot", "gravity", "block_ignore"] as const;

export function readProcessors(text: string): Processor[] | null {
    const o = parseObject(text);
    if (o === null || !Array.isArray(o["processors"])) return null;
    return (o["processors"] as unknown[]).map((entry): Processor => {
        const raw = obj(entry) ?? {};
        const name = short(raw["processor_type"]);
        if (name === "block_rot" && typeof raw["integrity"] === "number")
            return { kind: "block_rot", integrity: raw["integrity"], raw };
        if (name === "gravity")
            return {
                kind: "gravity",
                heightmap: typeof raw["heightmap"] === "string" ? raw["heightmap"] : "WORLD_SURFACE_WG",
                offset: typeof raw["offset"] === "number" ? raw["offset"] : 0,
                raw,
            };
        if (name === "block_ignore" && Array.isArray(raw["blocks"]) && (raw["blocks"] as unknown[]).every((b) => typeof obj(b)?.["Name"] === "string"))
            return { kind: "block_ignore", blocks: (raw["blocks"] as Json[]).map((b) => b["Name"] as string), raw };
        return { kind: "other", name: name || "(no type)", raw };
    });
}

export function writeProcessor(p: Processor): Json {
    switch (p.kind) {
        case "block_rot":
            return { ...p.raw, processor_type: "minecraft:block_rot", integrity: p.integrity };
        case "gravity":
            return { ...p.raw, processor_type: "minecraft:gravity", heightmap: p.heightmap, offset: p.offset };
        case "block_ignore":
            return { ...p.raw, processor_type: "minecraft:block_ignore", blocks: p.blocks.map((Name) => ({ Name })) };
        default:
            return p.raw;
    }
}

export function writeProcessors(text: string, list: readonly Processor[]): string {
    const o = parseObject(text) ?? {};
    return writeJson({ ...o, processors: list.map(writeProcessor) });
}

export function newProcessor(kind: (typeof NEW_PROCESSOR_KINDS)[number]): Processor {
    switch (kind) {
        case "block_rot":
            return { kind, integrity: 0.8, raw: {} };
        case "gravity":
            return { kind, heightmap: "WORLD_SURFACE_WG", offset: 0, raw: {} };
        default:
            return { kind, blocks: ["minecraft:structure_block"], raw: {} };
    }
}
