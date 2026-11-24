/**
 * Item modifiers as typed steps, for the visual editor over an item modifier part's JSON.
 *
 * An item modifier file is one function object or a list of them. The common functions get
 * typed fields; any other function is carried as it was (`other`), shown by name and written
 * back unchanged, so editing one step never loses another. Conditions on a step are kept too.
 */

export type ModifierStep =
    | { kind: "set_count"; min: number; max: number; add: boolean; rest: Record<string, unknown> }
    | { kind: "set_damage"; damage: number; add: boolean; rest: Record<string, unknown> }
    | { kind: "enchant_with_levels"; min: number; max: number; rest: Record<string, unknown> }
    | { kind: "enchant_randomly"; rest: Record<string, unknown> }
    | { kind: "set_name"; name: string; rest: Record<string, unknown> }
    | { kind: "set_lore"; lines: string[]; rest: Record<string, unknown> }
    | { kind: "furnace_smelt"; rest: Record<string, unknown> }
    | { kind: "explosion_decay"; rest: Record<string, unknown> }
    | { kind: "other"; name: string; raw: Record<string, unknown> };

export const STEP_KINDS = [
    "set_count",
    "set_damage",
    "enchant_with_levels",
    "enchant_randomly",
    "set_name",
    "set_lore",
    "furnace_smelt",
    "explosion_decay",
] as const;

export type StepKind = (typeof STEP_KINDS)[number];

const short = (id: unknown): string =>
    typeof id === "string" ? id.replace(/^minecraft:/, "") : "";

/** A number or a uniform range, as min and max. */
function range(value: unknown, fallback: number): [number, number] {
    if (typeof value === "number") return [value, value];
    if (typeof value === "object" && value !== null) {
        const v = value as { min?: unknown; max?: unknown };
        if (typeof v.min === "number" && typeof v.max === "number") return [v.min, v.max];
    }
    return [fallback, fallback];
}

const isPlainRange = (value: unknown): boolean =>
    typeof value === "number" ||
    (typeof value === "object" &&
        value !== null &&
        Object.keys(value).every((k) => k === "min" || k === "max" || k === "type") &&
        typeof (value as { min?: unknown }).min === "number" &&
        typeof (value as { max?: unknown }).max === "number");

const writeRange = (min: number, max: number): unknown =>
    min === max ? min : { type: "minecraft:uniform", min, max };

function textOf(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const v = value as Record<string, unknown>;
        if (Object.keys(v).every((k) => k === "text") && typeof v["text"] === "string") return v["text"];
    }
    return null;
}

export function readStep(raw: Record<string, unknown>): ModifierStep {
    const { function: fn, ...rest } = raw;
    const name = short(fn);
    const other = (): ModifierStep => ({ kind: "other", name: name || "(no function)", raw });
    switch (name) {
        case "set_count": {
            if (!isPlainRange(rest["count"])) return other();
            const [min, max] = range(rest["count"], 1);
            const { count: _c, add, ...more } = rest;
            return { kind: "set_count", min, max, add: add === true, rest: more };
        }
        case "set_damage": {
            if (typeof rest["damage"] !== "number") return other();
            const { damage, add, ...more } = rest;
            return { kind: "set_damage", damage: damage as number, add: add === true, rest: more };
        }
        case "enchant_with_levels": {
            if (!isPlainRange(rest["levels"])) return other();
            const [min, max] = range(rest["levels"], 30);
            const { levels: _l, ...more } = rest;
            return { kind: "enchant_with_levels", min, max, rest: more };
        }
        case "enchant_randomly":
        case "furnace_smelt":
        case "explosion_decay":
            return { kind: name, rest };
        case "set_name": {
            const text = textOf(rest["name"]);
            if (text === null) return other();
            const { name: _n, ...more } = rest;
            return { kind: "set_name", name: text, rest: more };
        }
        case "set_lore": {
            const lore = rest["lore"];
            if (!Array.isArray(lore)) return other();
            const lines = lore.map(textOf);
            if (lines.some((l) => l === null)) return other();
            const { lore: _l, ...more } = rest;
            return { kind: "set_lore", lines: lines as string[], rest: more };
        }
        default:
            return other();
    }
}

export function writeStep(step: ModifierStep): Record<string, unknown> {
    switch (step.kind) {
        case "other":
            return step.raw;
        case "set_count":
            return {
                function: "minecraft:set_count",
                count: writeRange(step.min, step.max),
                ...(step.add ? { add: true } : {}),
                ...step.rest,
            };
        case "set_damage":
            return {
                function: "minecraft:set_damage",
                damage: step.damage,
                ...(step.add ? { add: true } : {}),
                ...step.rest,
            };
        case "enchant_with_levels":
            return { function: "minecraft:enchant_with_levels", levels: writeRange(step.min, step.max), ...step.rest };
        case "set_name":
            return { function: "minecraft:set_name", name: { text: step.name }, ...step.rest };
        case "set_lore":
            return {
                function: "minecraft:set_lore",
                lore: step.lines.map((text) => ({ text })),
                mode: "replace_all",
                ...step.rest,
            };
        default:
            return { function: `minecraft:${step.kind}`, ...step.rest };
    }
}

export function newStep(kind: StepKind): ModifierStep {
    switch (kind) {
        case "set_count":
            return { kind, min: 1, max: 1, add: false, rest: {} };
        case "set_damage":
            return { kind, damage: 1, add: false, rest: {} };
        case "enchant_with_levels":
            return { kind, min: 20, max: 30, rest: {} };
        case "set_name":
            return { kind, name: "New name", rest: {} };
        case "set_lore":
            return { kind, lines: ["A line of lore"], rest: {} };
        default:
            return { kind, rest: {} };
    }
}

/** The steps of an item modifier file, or null when its JSON is not an item modifier. */
export function readModifier(text: string): ModifierStep[] | null {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        return null;
    }
    const list = Array.isArray(value) ? value : [value];
    if (list.some((v) => typeof v !== "object" || v === null || Array.isArray(v))) return null;
    return (list as Record<string, unknown>[]).map(readStep);
}

export function writeModifier(steps: readonly ModifierStep[]): string {
    return `${JSON.stringify(steps.map(writeStep), null, 2)}\n`;
}
