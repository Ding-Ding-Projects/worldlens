/**
 * The CoreProtect inspector's model: block changes read from a CoreProtect database, the
 * filters the inspector offers, the highlight layer it draws on the map, the replay clock, and
 * the exact CoreProtect commands its quick actions copy.
 *
 * Pure and framework-free. Facts about CoreProtect's data come from its own schema: a block
 * row has `time` (Unix seconds), `user`, `wid`, `x`, `y`, `z`, `type`, `data`, `action` and
 * `rolled_back`; `action` is 0 for a block removed, 1 for a block placed, 2 for an
 * interaction and 3 for an entity killed. User names that start with `#` are not players
 * (`#tnt`, `#fire`, `#creeper` and so on).
 */

export type ChangeAction = "break" | "place" | "click" | "kill";

export const ACTION_CODES: Readonly<Record<number, ChangeAction>> = { 0: "break", 1: "place", 2: "click", 3: "kill" };

export interface BlockChange {
    /** Unix seconds. */
    readonly time: number;
    readonly user: string;
    readonly world: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** Namespaced material such as `minecraft:oak_log`, or `#<id>` when unmapped. */
    readonly material: string;
    readonly action: ChangeAction;
    readonly rolledBack: boolean;
}

export interface ChangeFilter {
    readonly world: string | null;
    /** Inclusive Unix seconds; null means open-ended. */
    readonly from: number | null;
    readonly to: number | null;
    /** Empty means every user. */
    readonly users: readonly string[];
    readonly actions: readonly ChangeAction[];
    /** Case-insensitive part of the material name; empty means any. */
    readonly material: string;
    readonly includeRolledBack: boolean;
}

export const DEFAULT_FILTER: ChangeFilter = { world: null, from: null, to: null, users: [], actions: ["break", "place"], material: "", includeRolledBack: true };

export function matches(change: BlockChange, filter: ChangeFilter): boolean {
    if (filter.world !== null && change.world !== filter.world) return false;
    if (filter.from !== null && change.time < filter.from) return false;
    if (filter.to !== null && change.time > filter.to) return false;
    if (filter.users.length > 0 && !filter.users.includes(change.user)) return false;
    if (!filter.actions.includes(change.action)) return false;
    if (filter.material && !change.material.toLowerCase().includes(filter.material.toLowerCase())) return false;
    if (!filter.includeRolledBack && change.rolledBack) return false;
    return true;
}

export interface ChangeSummary {
    readonly total: number;
    readonly byAction: Readonly<Record<ChangeAction, number>>;
    readonly users: number;
    readonly first: number | null;
    readonly last: number | null;
    readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number } | null;
}

export function summarize(changes: readonly BlockChange[]): ChangeSummary {
    const byAction = { break: 0, place: 0, click: 0, kill: 0 };
    const users = new Set<string>();
    let first: number | null = null;
    let last: number | null = null;
    let bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
    for (const c of changes) {
        byAction[c.action]++;
        users.add(c.user);
        first = first === null ? c.time : Math.min(first, c.time);
        last = last === null ? c.time : Math.max(last, c.time);
        bounds = bounds
            ? { minX: Math.min(bounds.minX, c.x), maxX: Math.max(bounds.maxX, c.x), minZ: Math.min(bounds.minZ, c.z), maxZ: Math.max(bounds.maxZ, c.z) }
            : { minX: c.x, maxX: c.x, minZ: c.z, maxZ: c.z };
    }
    return { total: changes.length, byAction, users: users.size, first, last, bounds };
}

/** Colours that read on any map, each paired with a word and a glyph so colour is never alone. */
export const ACTION_STYLE: Readonly<Record<ChangeAction, { readonly r: number; readonly g: number; readonly b: number; readonly glyph: string }>> = {
    place: { r: 46, g: 160, b: 67, glyph: "+" },
    break: { r: 217, g: 48, b: 37, glyph: "−" },
    click: { r: 26, g: 115, b: 232, glyph: "•" },
    kill: { r: 242, g: 153, b: 0, glyph: "×" },
};

/** At most this many squares are drawn; the newest win, and the inspector says how many were left out. */
export const HIGHLIGHT_LIMIT = 4000;

export const HIGHLIGHT_SET_ID = "worldlens-coreprotect";

const escapeHtml = (text: string): string => text.replace(/[&<>"']/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The highlight layer as BlueMap marker-set data: one square per changed block, lifted a
 * little above the block so it sits on the surface, with the newest changes brightest. Only
 * the last change at each block is drawn, so a block placed and broken again shows its
 * current state. Labels are escaped: names in a database are someone else's text.
 */
export function highlightData(changes: readonly BlockChange[], options: { readonly label: string; readonly now: number; readonly fadeSeconds: number; readonly words: Readonly<Record<ChangeAction, string>> }) {
    const latest = new Map<string, BlockChange>();
    for (const c of changes) {
        const key = `${c.x},${c.y},${c.z}`;
        const seen = latest.get(key);
        if (!seen || c.time >= seen.time) latest.set(key, c);
    }
    const drawn = [...latest.values()].sort((a, b) => b.time - a.time).slice(0, HIGHLIGHT_LIMIT);
    const markers: Record<string, unknown> = {};
    drawn.forEach((c, i) => {
        const style = ACTION_STYLE[c.action];
        const age = Math.max(0, options.now - c.time);
        const fresh = options.fadeSeconds > 0 ? Math.max(0.25, 1 - age / options.fadeSeconds) : 1;
        // The label shows as plain text in the marker list and the detail as markup in the popup,
        // so markup characters are dropped from the one and escaped in the other.
        const label = `${style.glyph} ${options.words[c.action]} ${c.material.replace(/^minecraft:/u, "")} · ${c.user}`.replace(/[<>&"']/gu, "");
        markers[`cp-${i}`] = {
            type: "shape",
            label,
            detail: escapeHtml(`${label} · ${c.x} ${c.y} ${c.z}`),
            position: { x: c.x + 0.5, y: c.y + 1, z: c.z + 0.5 },
            shape: [
                { x: c.x, z: c.z },
                { x: c.x + 1, z: c.z },
                { x: c.x + 1, z: c.z + 1 },
                { x: c.x, z: c.z + 1 },
            ],
            shapeY: c.y + 1.02,
            lineWidth: 2,
            depthTest: false,
            lineColor: { r: style.r, g: style.g, b: style.b, a: Math.min(1, 0.35 + fresh * 0.65) },
            fillColor: { r: style.r, g: style.g, b: style.b, a: 0.15 + fresh * 0.35 },
            sorting: i,
        };
    });
    return { data: { label: options.label, toggleable: true, defaultHidden: false, sorting: -100, markers }, drawn: drawn.length, distinct: latest.size };
}

/** The replay clock: which changes have happened by `cursor`, and where it moves next. */
export function happenedBy(changes: readonly BlockChange[], cursor: number): BlockChange[] {
    return changes.filter((c) => c.time <= cursor);
}

/** Advances the cursor by `speed` database seconds per real second, stopping at the end. */
export function advance(cursor: number, elapsedMs: number, speed: number, end: number): number {
    return Math.min(end, cursor + (elapsedMs / 1000) * speed);
}

/** Seconds as CoreProtect's time argument, rounded up so the range always covers the change. */
export function coreProtectSpan(seconds: number): string {
    const s = Math.max(1, Math.ceil(seconds));
    if (s % 86400 === 0) return `${s / 86400}d`;
    if (s % 3600 === 0) return `${s / 3600}h`;
    if (s % 60 === 0) return `${s / 60}m`;
    return `${s}s`;
}

export interface CommandScope {
    readonly users: readonly string[];
    readonly world: string | null;
    readonly from: number;
    readonly to: number;
    /** Now, in Unix seconds, when the command is built: CoreProtect times are relative to now. */
    readonly now: number;
}

/** A user name that cannot break out of a command argument. */
const safeName = (name: string): string | null => (/^[#A-Za-z0-9_.-]{1,40}$/u.test(name) ? name : null);
const safeWorld = (name: string): string | null => (/^[A-Za-z0-9_.:-]{1,64}$/u.test(name) ? name : null);

/**
 * The CoreProtect arguments for a scope: users, the world as the radius, and the time range
 * as "between this long ago and that long ago" (CoreProtect's `t:1h-2h`). One second is added
 * on each side so a change at the edge is inside.
 */
export function scopeArguments(scope: CommandScope): string {
    const users = scope.users.map(safeName).filter((u): u is string => u !== null);
    const world = scope.world ? safeWorld(scope.world) : null;
    const newest = Math.max(0, scope.now - scope.to - 1);
    const oldest = Math.max(newest + 1, scope.now - scope.from + 1);
    const parts = [
        users.length ? `u:${users.join(",")}` : null,
        `t:${newest === 0 ? coreProtectSpan(oldest) : `${coreProtectSpan(newest)}-${coreProtectSpan(oldest)}`}`,
        `r:${world ? `#${world}` : "#global"}`,
    ];
    return parts.filter(Boolean).join(" ");
}

export interface QuickAction {
    readonly id: "lookup" | "count" | "preview" | "rollback" | "restore" | "inspect" | "teleport";
    readonly command: string;
    /** Rollback and restore change the live world; the inspector asks for both keys before copying. */
    readonly changesWorld: boolean;
}

export function quickActions(scope: CommandScope, focus: BlockChange | null): QuickAction[] {
    const args = scopeArguments(scope);
    const actions: QuickAction[] = [
        { id: "lookup", command: `/co lookup ${args} a:block`, changesWorld: false },
        { id: "count", command: `/co lookup ${args} a:block #count`, changesWorld: false },
        { id: "preview", command: `/co rollback ${args} #preview`, changesWorld: false },
        { id: "rollback", command: `/co rollback ${args}`, changesWorld: true },
        { id: "restore", command: `/co restore ${args}`, changesWorld: true },
        { id: "inspect", command: "/co inspect", changesWorld: false },
    ];
    // Teleport runs in the world the player is standing in; the inspector says which world it was.
    if (focus) actions.push({ id: "teleport", command: `/tp @s ${focus.x} ${focus.y + 1} ${focus.z}`, changesWorld: false });
    return actions;
}

/** CSV with formula-looking text neutralised, for a spreadsheet. */
export function toCsv(changes: readonly BlockChange[]): string {
    const cell = (v: string | number | boolean): string => {
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        const guarded = /^[=+\-@]/u.test(v) ? `'${v}` : v;
        return /[",\r\n]/u.test(guarded) || guarded !== v ? `"${guarded.replace(/"/gu, '""')}"` : guarded;
    };
    const rows = [["time_utc", "unix_time", "user", "world", "x", "y", "z", "material", "action", "rolled_back"].join(",")];
    for (const c of changes) rows.push([new Date(c.time * 1000).toISOString(), c.time, c.user, c.world, c.x, c.y, c.z, c.material, c.action, c.rolledBack].map(cell).join(","));
    return `${rows.join("\r\n")}\r\n`;
}
