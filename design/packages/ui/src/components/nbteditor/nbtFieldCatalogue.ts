/**
 * What a tag means to a person, and which control edits it.
 *
 * The tree used to show `SpawnX` with an INT chip and a text box. That is what the file holds,
 * and it is not what anyone is looking for: they want "Spawn X", a whole number, and a stepper.
 * This module turns a tag (its name, the names of the tags above it, its type and its value)
 * into three things:
 *
 *  - a readable label, from a catalogue of known fields or, failing that, from the key itself
 *    split into words;
 *  - a plain-language type ("Whole number", "Yes or no", "Time of day");
 *  - a control spec that says which tailored control edits it, with real bounds.
 *
 * The facts behind every entry are in `docs/nbt-research.md`. Keys are matched without case
 * or underscores, so `keepInventory` (before 1.21.11) and `keep_inventory` (after) are one
 * entry, and the 26.1 renames (`difficulty_settings.difficulty` as a string, `rain_time`) land
 * on the same controls as the older names.
 *
 * Pure and DOM-free, so every mapping is a unit test.
 */
import type { NodeView, TagKind } from "./nbtEditorBridge.js";

export type FieldControl =
    | { readonly type: "switch"; readonly stringBool?: boolean }
    | {
          readonly type: "choice";
          readonly options: readonly { readonly value: string; readonly label: string }[];
      }
    | {
          readonly type: "stepper";
          readonly min: number;
          readonly max: number;
          readonly step: number;
          readonly unit?: string;
      }
    | {
          readonly type: "slider";
          readonly min: number;
          readonly max: number;
          readonly step: number;
          readonly unit?: string;
      }
    | { readonly type: "timeOfDay" }
    | { readonly type: "duration" }
    | { readonly type: "color" }
    | { readonly type: "resource" }
    | { readonly type: "text" }
    | { readonly type: "raw" };

export interface FieldInfo {
    readonly label: string;
    readonly about: string | null;
    readonly plainType: string;
    readonly control: FieldControl;
}

/** The type a person would name, printed on the chip when game names are off. */
export const KIND_PLAIN: Readonly<Record<TagKind, string>> = {
    byte: "Small number",
    short: "Number",
    int: "Whole number",
    long: "Large number",
    float: "Decimal",
    double: "Precise decimal",
    byteArray: "Byte list",
    string: "Text",
    list: "List",
    compound: "Group",
    intArray: "Number list",
    longArray: "Large number list",
};

const INT_LIMITS: Partial<Record<TagKind, readonly [number, number]>> = {
    byte: [-128, 127],
    short: [-32768, 32767],
    int: [-2147483648, 2147483647],
    long: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    float: [-3.4e38, 3.4e38],
    double: [-Number.MAX_VALUE, Number.MAX_VALUE],
};

/** Lower case with underscores and a `minecraft:` prefix removed, for era-proof matching. */
export function normalizeKey(name: string): string {
    return name
        .replace(/^minecraft:/, "")
        .replace(/_/g, "")
        .toLowerCase();
}

/** `SpawnX` → `Spawn X`, `keep_inventory` → `Keep inventory`, `xPos` → `X pos`. */
export function humanizeKey(name: string): string {
    const bare = name.replace(/^[a-z0-9_.-]+:/, "");
    const words = bare
        .replace(/_/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
    if (words.length === 0) return name;
    return words
        .map((w, i) => {
            if (/^[A-Z0-9]{2,}$/.test(w) || /^[A-Z]$/.test(w)) return w; // UUID, XP and axis letters stay as written
            const lower = w.toLowerCase();
            return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
        })
        .join(" ");
}

/** `minecraft:diamond_pickaxe` → `Diamond Pickaxe`; a modded id keeps its namespace in brackets. */
export function readableResource(id: string): string {
    const match = /^([a-z0-9_.-]+):([a-z0-9_./-]+)$/.exec(id);
    if (match === null) return id;
    const [, ns, path] = match;
    const words = (path ?? "").split(/[/_.]/).filter((w) => w.length > 0);
    const title = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return ns === "minecraft" ? title : `${title} (${ns})`;
}

export function isResourceId(text: string): boolean {
    return /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(text);
}

const GAME_MODES = [
    { value: "0", label: "Survival" },
    { value: "1", label: "Creative" },
    { value: "2", label: "Adventure" },
    { value: "3", label: "Spectator" },
] as const;

const DIFFICULTY_NUM = [
    { value: "0", label: "Peaceful" },
    { value: "1", label: "Easy" },
    { value: "2", label: "Normal" },
    { value: "3", label: "Hard" },
] as const;

const DIFFICULTY_TEXT = [
    { value: "peaceful", label: "Peaceful" },
    { value: "easy", label: "Easy" },
    { value: "normal", label: "Normal" },
    { value: "hard", label: "Hard" },
] as const;

const CHUNK_STATUS = [
    "empty",
    "structure_starts",
    "structure_references",
    "biomes",
    "noise",
    "surface",
    "carvers",
    "features",
    "initialize_light",
    "light",
    "spawn",
    "full",
].map((s) => ({ value: `minecraft:${s}`, label: humanizeKey(s) }));

interface Entry {
    readonly label: string;
    readonly about?: string;
    readonly plainType?: string;
    readonly control?: (kind: TagKind) => FieldControl | null;
}

const stepper =
    (min: number, max: number, step = 1, unit?: string) =>
    (kind: TagKind): FieldControl | null =>
        kind === "string" || kind === "compound" || kind === "list"
            ? null
            : { type: "stepper", min, max, step, ...(unit ? { unit } : {}) };
const slider =
    (min: number, max: number, step = 1, unit?: string) =>
    (kind: TagKind): FieldControl | null =>
        kind === "string" || kind === "compound" || kind === "list"
            ? null
            : { type: "slider", min, max, step, ...(unit ? { unit } : {}) };
const duration = (kind: TagKind): FieldControl | null =>
    kind === "int" || kind === "long" ? { type: "duration" } : null;
const color = (kind: TagKind): FieldControl | null => (kind === "int" ? { type: "color" } : null);
const COORD = 30_000_000;

/** Known fields, keyed by `normalizeKey`. Context-dependent keys are handled in `entryFor`. */
const CATALOGUE: Readonly<Record<string, Entry>> = {
    levelname: { label: "World name", about: "The name shown in the world list." },
    gametype: {
        label: "Game mode",
        about: "What new players start in.",
        plainType: "Choice",
        control: () => ({ type: "choice", options: GAME_MODES }),
    },
    playergametype: {
        label: "Game mode",
        plainType: "Choice",
        control: () => ({ type: "choice", options: GAME_MODES }),
    },
    hardcore: {
        label: "Hardcore",
        about: "One life; on death the world is lost or spectator-only.",
        plainType: "Yes or no",
    },
    allowcommands: { label: "Commands allowed", plainType: "Yes or no" },
    difficultylocked: { label: "Difficulty locked", plainType: "Yes or no" },
    spawnx: {
        label: "Spawn X",
        about: "East-west block where players appear.",
        control: stepper(-COORD, COORD),
    },
    spawny: {
        label: "Spawn Y",
        about: "Height of the spawn point.",
        control: stepper(-2048, 2048),
    },
    spawnz: {
        label: "Spawn Z",
        about: "North-south block where players appear.",
        control: stepper(-COORD, COORD),
    },
    spawnangle: { label: "Spawn facing", control: slider(-180, 180, 1, "°") },
    daytime: {
        label: "Time of day",
        about: "Ticks since the world began; 24,000 make one day.",
        plainType: "Time of day",
        control: (k) => (k === "long" || k === "int" ? { type: "timeOfDay" } : null),
    },
    time: {
        label: "World age",
        about: "Ticks the world has run.",
        plainType: "Duration",
        control: duration,
    },
    raining: { label: "Raining", plainType: "Yes or no" },
    thundering: { label: "Thundering", plainType: "Yes or no" },
    raintime: { label: "Rain changes in", plainType: "Duration", control: duration },
    thundertime: { label: "Thunder changes in", plainType: "Duration", control: duration },
    clearweathertime: { label: "Clear weather lasts", plainType: "Duration", control: duration },
    bordersize: { label: "World border size", control: stepper(1, 59_999_968, 1, "blocks") },
    bordercenterx: { label: "World border centre X", control: stepper(-COORD, COORD) },
    bordercenterz: { label: "World border centre Z", control: stepper(-COORD, COORD) },
    borderdamageperblock: { label: "Border damage per block", control: stepper(0, 100, 0.1) },
    bordersafezone: { label: "Border safe zone", control: stepper(0, 1000, 1, "blocks") },
    borderwarningblocks: {
        label: "Border warning distance",
        control: stepper(0, 1000, 1, "blocks"),
    },
    borderwarningtime: { label: "Border warning time", control: stepper(0, 3600, 1, "s") },
    dataversion: { label: "Data version", about: "Which game version wrote this data." },
    version: { label: "Version" },
    lastplayed: { label: "Last played" },
    wanderingtraderspawnchance: {
        label: "Wandering trader chance",
        control: slider(0, 100, 1, "%"),
    },
    spawnchance: { label: "Spawn chance", control: slider(0, 100, 1, "%") },
    wanderingtraderspawndelay: {
        label: "Wandering trader delay",
        plainType: "Duration",
        control: duration,
    },
    spawndelay: { label: "Spawn delay", plainType: "Duration", control: duration },
    health: { label: "Health", about: "20 is ten hearts.", control: stepper(0, 1024, 0.5, "HP") },
    foodlevel: { label: "Food", about: "20 is a full bar.", control: slider(0, 20) },
    foodsaturationlevel: { label: "Saturation", control: slider(0, 20, 0.5) },
    foodexhaustionlevel: { label: "Exhaustion", control: slider(0, 40, 0.1) },
    xplevel: { label: "Experience level", control: stepper(0, 21863) },
    xpp: { label: "Progress to next level", control: slider(0, 1, 0.01) },
    xptotal: { label: "Total experience", control: stepper(0, 2147483647) },
    score: { label: "Score", control: stepper(0, 2147483647) },
    selecteditemslot: { label: "Held hotbar slot", control: slider(0, 8) },
    air: { label: "Air", about: "300 is a full breath.", control: slider(-20, 300, 1, "ticks") },
    fire: { label: "Burning for", plainType: "Duration", control: duration },
    portalcooldown: { label: "Portal cooldown", plainType: "Duration", control: duration },
    invulnerable: { label: "Invulnerable", plainType: "Yes or no" },
    noai: { label: "No AI", plainType: "Yes or no" },
    silent: { label: "Silent", plainType: "Yes or no" },
    glowing: { label: "Glowing", plainType: "Yes or no" },
    nogravity: { label: "No gravity", plainType: "Yes or no" },
    persistencerequired: { label: "Never despawns", plainType: "Yes or no" },
    customnamevisible: { label: "Show name", plainType: "Yes or no" },
    onground: { label: "On the ground", plainType: "Yes or no" },
    count: { label: "Count", control: stepper(1, 99) },
    slot: { label: "Slot" },
    damage: {
        label: "Damage taken",
        about: "Durability used up; 0 is brand new.",
        control: stepper(0, 2147483647),
    },
    repaircost: { label: "Repair cost", control: stepper(0, 2147483647, 1, "levels") },
    unbreakable: { label: "Unbreakable", plainType: "Yes or no" },
    dyedcolor: { label: "Dye colour", plainType: "Colour", control: color },
    custompotioncolor: { label: "Potion colour", plainType: "Colour", control: color },
    customcolor: { label: "Colour", plainType: "Colour", control: color },
    mapcolor: { label: "Map colour", plainType: "Colour", control: color },
    scale: {
        label: "Map scale",
        plainType: "Choice",
        control: (k) =>
            k === "byte" || k === "int"
                ? {
                      type: "choice",
                      options: ["1:1", "1:2", "1:4", "1:8", "1:16"].map((label, i) => ({
                          value: String(i),
                          label,
                      })),
                  }
                : null,
    },
    xcenter: { label: "Centre X", control: stepper(-COORD, COORD) },
    zcenter: { label: "Centre Z", control: stepper(-COORD, COORD) },
    locked: { label: "Locked", plainType: "Yes or no" },
    trackingposition: { label: "Show players", plainType: "Yes or no" },
    unlimitedtracking: { label: "Show players far away", plainType: "Yes or no" },
    inhabitedtime: { label: "Time players spent here", plainType: "Duration", control: duration },
    lastupdate: { label: "Last updated at tick" },
    xpos: { label: "Chunk X" },
    zpos: { label: "Chunk Z" },
    ypos: { label: "Lowest section" },
    status: {
        label: "Generation step",
        plainType: "Choice",
        control: (k) => (k === "string" ? { type: "choice", options: CHUNK_STATUS } : null),
    },
    randomtickspeed: { label: "Random tick speed", control: stepper(0, 4096) },
    spawnradius: { label: "Respawn radius", control: stepper(0, 1000, 1, "blocks") },
    respawnradius: { label: "Respawn radius", control: stepper(0, 1000, 1, "blocks") },
    playerssleepingpercentage: { label: "Players who must sleep", control: slider(0, 100, 1, "%") },
    maxentitycramming: { label: "Max entities in one block", control: stepper(0, 1000) },
    maxcommandchainlength: { label: "Max command chain", control: stepper(0, 2147483647) },
    keepinventory: { label: "Keep inventory on death", plainType: "Yes or no" },
    dodaylightcycle: { label: "Daylight cycle", plainType: "Yes or no" },
    doweathercycle: { label: "Weather cycle", plainType: "Yes or no" },
    domobspawning: { label: "Mobs spawn", plainType: "Yes or no" },
    mobgriefing: { label: "Mobs change blocks", plainType: "Yes or no" },
    dofiretick: { label: "Fire spreads", plainType: "Yes or no" },
    doinsomnia: { label: "Phantoms spawn", plainType: "Yes or no" },
    doimmediaterespawn: { label: "Respawn immediately", plainType: "Yes or no" },
    showdeathmessages: { label: "Death messages", plainType: "Yes or no" },
    announceadvancements: { label: "Announce advancements", plainType: "Yes or no" },
    pvp: { label: "Players can hurt players", plainType: "Yes or no" },
};

/** The entry for a tag, using the tags above it where a key means different things in different places. */
function entryFor(name: string, path: readonly string[], kind: TagKind): Entry | null {
    const key = normalizeKey(name);
    const parent = path.length > 0 ? normalizeKey(path[path.length - 1] ?? "") : "";
    if (key === "difficulty") {
        return kind === "string"
            ? {
                  label: "Difficulty",
                  plainType: "Choice",
                  control: () => ({ type: "choice", options: DIFFICULTY_TEXT }),
              }
            : {
                  label: "Difficulty",
                  about: "How hard mobs hit and how fast hunger drains.",
                  plainType: "Choice",
                  control: () => ({ type: "choice", options: DIFFICULTY_NUM }),
              };
    }
    if (key === "locked" && parent === "difficultysettings")
        return { label: "Difficulty locked", plainType: "Yes or no" };
    if (key === "color" && parent === "display")
        return { label: "Dye colour", plainType: "Colour", control: color };
    if (key === "rgb" && (parent === "dyedcolor" || parent === "mapcolor"))
        return { label: "Colour", plainType: "Colour", control: color };
    if (
        key === "color" &&
        kind === "int" &&
        (parent === "dyedcolor" || parent === "potioncontents")
    )
        return { label: "Colour", plainType: "Colour", control: color };
    if (parent === "levels" && (kind === "int" || kind === "short" || kind === "byte"))
        return {
            label: readableResource(name.includes(":") ? name : `minecraft:${name}`),
            plainType: "Level",
            control: stepper(1, 255),
        };
    if (key === "lvl") return { label: "Level", plainType: "Level", control: stepper(1, 255) };
    if (key === "id" && kind === "string")
        return {
            label: path.length === 0 ? "ID" : "What it is",
            plainType: "ID",
            control: () => ({ type: "resource" }),
        };
    return CATALOGUE[key] ?? null;
}

/** Everything the tree and the value editor need to present one tag. */
export function fieldInfo(node: NodeView, path: readonly string[]): FieldInfo {
    const name = node.name ?? "";
    const entry = name === "" ? null : entryFor(name, path, node.kind);
    const label = entry?.label ?? (name === "" ? "" : humanizeKey(name));
    let control: FieldControl | null = entry?.control?.(node.kind) ?? null;
    let plainType = entry?.plainType ?? KIND_PLAIN[node.kind];
    if (control === null) {
        if (node.isBool) {
            control = { type: "switch" };
            plainType = "Yes or no";
        } else if (node.kind === "string" && (node.text === "true" || node.text === "false")) {
            control = { type: "switch", stringBool: true };
            plainType = "Yes or no";
        } else if (node.kind === "string" && isResourceId(node.text)) {
            control = { type: "resource" };
            plainType = "ID";
        } else if (node.kind === "string") {
            control = { type: "text" };
        } else if (INT_LIMITS[node.kind] !== undefined) {
            const [min, max] = INT_LIMITS[node.kind]!;
            const decimal = node.kind === "float" || node.kind === "double";
            control = { type: "stepper", min, max, step: decimal ? 0.1 : 1 };
        } else {
            control = { type: "raw" };
        }
    } else if (control.type === "switch" || entry?.plainType === "Yes or no") {
        control =
            node.kind === "string" ? { type: "switch", stringBool: true } : { type: "switch" };
    }
    return { label, about: entry?.about ?? null, plainType, control };
}

/** 6000 → `12:00`, the clock the game shows for that tick of the day. */
export function clockFor(ticks: number): string {
    const inDay = ((ticks % 24000) + 24000) % 24000;
    const hours = (Math.floor(inDay / 1000) + 6) % 24;
    const minutes = Math.floor(((inDay % 1000) * 60) / 1000);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** 7_250 ticks → `6 min 2 s`; ticks run at 20 a second. */
export function durationFor(ticks: number): string {
    if (!Number.isFinite(ticks)) return String(ticks);
    const sign = ticks < 0 ? "-" : "";
    let s = Math.floor(Math.abs(ticks) / 20);
    const d = Math.floor(s / 86400);
    s -= d * 86400;
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    s -= m * 60;
    const parts = [
        d > 0 ? `${d} d` : "",
        h > 0 ? `${h} h` : "",
        m > 0 ? `${m} min` : "",
        s > 0 || (d === 0 && h === 0 && m === 0) ? `${s} s` : "",
    ].filter((p) => p !== "");
    return sign + parts.join(" ");
}

/** A signed or unsigned RGB int → `#RRGGBB`. */
export function hexForRgb(value: number): string {
    const v = value >>> 0;
    return `#${(v & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
}

/** `#RRGGBB` → the int the game stores, or null if the text is not a colour. */
export function rgbForHex(hex: string): number | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    return m === null ? null : parseInt(m[1] ?? "0", 16);
}

/** The value as a person reads it, for the tree row. Containers and arrays keep their summary. */
export function readableValue(node: NodeView, info: FieldInfo): string {
    const c = info.control;
    const n = Number(node.text);
    switch (c.type) {
        case "switch":
            return (c.stringBool ? node.text === "true" : node.text === "1") ? "Yes" : "No";
        case "choice":
            return c.options.find((o) => o.value === node.text)?.label ?? node.text;
        case "timeOfDay":
            return Number.isFinite(n)
                ? `${clockFor(n)}, day ${Math.floor(n / 24000) + 1}`
                : node.text;
        case "duration":
            return Number.isFinite(n) ? durationFor(n) : node.text;
        case "color":
            return Number.isFinite(n) ? hexForRgb(n) : node.text;
        case "resource":
            return readableResource(node.text);
        case "stepper":
        case "slider":
            return Number.isFinite(n)
                ? `${n.toLocaleString("en-CA")}${c.unit ? ` ${c.unit}` : ""}`
                : node.text;
        default:
            return node.kind === "compound" ||
                node.kind === "list" ||
                node.kind === "byteArray" ||
                node.kind === "intArray" ||
                node.kind === "longArray"
                ? node.summary
                : node.text;
    }
}
