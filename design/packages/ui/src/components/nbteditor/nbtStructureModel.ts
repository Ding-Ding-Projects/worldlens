/**
 * A structure file's blocks as layers you can paint.
 *
 * A `.nbt` structure is `size` (three ints), `palette` (each distinct block state once: `Name` and
 * `Properties`), `blocks` (each with `pos`, a palette index in `state`, and optional `nbt`) and
 * `entities`. See `docs/nbt-research.md`.
 *
 * The editor reads `palette` and `blocks` as SNBT text and works on it here without a full SNBT
 * parser: a bracket- and quote-aware splitter finds each list element and each top-level key, so
 * a block's own `nbt` (a chest's items, a sign's text) is carried through untouched as text. A
 * stroke rewrites only top-level `state` values and appends new `{pos:[x,y,z],state:n}` entries,
 * then the whole list goes back as one `replaceSnbt` edit: one undo step per stroke.
 *
 * Design: `design/design-sources/nbt-editor-full/Structure.dc.html`. Pure.
 */

/** Splits the body of an SNBT list or compound into its top-level members, as raw text. */
export function splitTopLevel(text: string): string[] {
    const trimmed = text.trim();
    let body = trimmed;
    if (
        (body.startsWith("[") && body.endsWith("]")) ||
        (body.startsWith("{") && body.endsWith("}"))
    )
        body = body.slice(1, -1);
    // A typed array prefix such as "I;" belongs to the array, not to its first member.
    body = body.replace(/^\s*[BIL];/, "");
    const out: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i]!;
        if (quote !== null) {
            if (c === "\\") i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'") quote = c;
        else if (c === "[" || c === "{") depth++;
        else if (c === "]" || c === "}") depth--;
        else if (c === "," && depth === 0) {
            out.push(body.slice(start, i).trim());
            start = i + 1;
        }
    }
    const last = body.slice(start).trim();
    if (last !== "") out.push(last);
    return out;
}

/** The top-level `key: value` pairs of one SNBT compound, values as raw text. */
export function topLevelFields(compound: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const member of splitTopLevel(compound)) {
        let quote: string | null = null;
        let colon = -1;
        for (let i = 0; i < member.length; i++) {
            const c = member[i]!;
            if (quote !== null) {
                if (c === "\\") i++;
                else if (c === quote) quote = null;
                continue;
            }
            if (c === '"' || c === "'") quote = c;
            else if (c === ":") {
                colon = i;
                break;
            }
        }
        if (colon < 0) continue;
        const key = member
            .slice(0, colon)
            .trim()
            .replace(/^["']|["']$/g, "");
        out.set(key, member.slice(colon + 1).trim());
    }
    return out;
}

function unquote(value: string): string {
    const v = value.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        return v.slice(1, -1).replace(/\\(.)/g, "$1");
    return v;
}

function intOf(value: string | undefined): number {
    return value === undefined ? NaN : Number.parseInt(value.replace(/[bBsSlL]$/, ""), 10);
}

export interface PaletteEntry {
    readonly name: string;
    readonly properties: Readonly<Record<string, string>>;
    readonly label: string;
}

export function parsePalette(text: string): PaletteEntry[] {
    return splitTopLevel(text).map((entry) => {
        const fields = topLevelFields(entry);
        const name = unquote(fields.get("Name") ?? "minecraft:air");
        const props: Record<string, string> = {};
        const raw = fields.get("Properties");
        if (raw !== undefined) for (const [k, v] of topLevelFields(raw)) props[k] = unquote(v);
        const propText = Object.entries(props)
            .map(([k, v]) => `${k}=${v}`)
            .join(",");
        return { name, properties: props, label: propText === "" ? name : `${name}[${propText}]` };
    });
}

export interface StructureBlock {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    state: number;
    /** The element's own SNBT, so `nbt` and anything else in it survives a rewrite. */
    raw: string;
}

export function parseBlocks(text: string): StructureBlock[] {
    const out: StructureBlock[] = [];
    for (const raw of splitTopLevel(text)) {
        const fields = topLevelFields(raw);
        const pos = splitTopLevel(fields.get("pos") ?? "[]").map((p) => intOf(p));
        const state = intOf(fields.get("state"));
        if (pos.length !== 3 || pos.some((p) => !Number.isFinite(p)) || !Number.isFinite(state))
            continue;
        out.push({ x: pos[0]!, y: pos[1]!, z: pos[2]!, state, raw });
    }
    return out;
}

/** The element text with its top-level `state` set, everything else as it was. */
export function withState(raw: string, state: number): string {
    const fields = topLevelFields(raw);
    if (!fields.has("state")) return raw.replace(/}\s*$/, `,state:${state}}`);
    const members = splitTopLevel(raw).map((m) =>
        /^\s*["']?state["']?\s*:/.test(m) ? `state:${state}` : m,
    );
    return `{${members.join(",")}}`;
}

export function blocksSnbt(blocks: readonly StructureBlock[]): string {
    return `[${blocks.map((b) => b.raw).join(",")}]`;
}

/** A lookup from position to block, for painting a layer. */
export function indexBlocks(blocks: readonly StructureBlock[]): Map<string, StructureBlock> {
    const out = new Map<string, StructureBlock>();
    for (const b of blocks) out.set(`${b.x},${b.y},${b.z}`, b);
    return out;
}

/** Sets a block's palette index, adding the block when the position has none. Returns true on change. */
export function paint(
    blocks: StructureBlock[],
    index: Map<string, StructureBlock>,
    x: number,
    y: number,
    z: number,
    state: number,
): boolean {
    const key = `${x},${y},${z}`;
    const existing = index.get(key);
    if (existing !== undefined) {
        if (existing.state === state) return false;
        existing.state = state;
        existing.raw = withState(existing.raw, state);
        return true;
    }
    const block: StructureBlock = { x, y, z, state, raw: `{pos:[${x},${y},${z}],state:${state}}` };
    blocks.push(block);
    index.set(key, block);
    return true;
}

/** A readable, stable colour per block id, with air see-through. */
export function blockColour(name: string): string {
    if (/(^|:)(cave_|void_)?air$/.test(name)) return "transparent";
    if (name.includes("water")) return "hsl(220 60% 45%)";
    if (name.includes("lava")) return "hsl(20 85% 50%)";
    if (/glass/.test(name)) return "hsl(190 45% 75%)";
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    const stone = /stone|cobble|deepslate|andesite|diorite|granite|brick/.test(name);
    return stone ? `hsl(${h} 6% ${40 + (h % 20)}%)` : `hsl(${h} 42% 42%)`;
}

/** Counts per palette index, for the palette list. */
export function paletteCounts(blocks: readonly StructureBlock[], size: number): number[] {
    const counts = new Array<number>(size).fill(0);
    for (const b of blocks) if (b.state >= 0 && b.state < size) counts[b.state]! += 1;
    return counts;
}
