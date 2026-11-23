/**
 * Map item pixels: Minecraft's map colour table and the maths around it.
 *
 * A map file (`data/map_<n>.dat`, or `data/minecraft/maps/<n>.dat` from 26.1) holds `data.colors`,
 * a byte array of 16,384 entries: 128 by 128 pixels, whatever the map's scale. Each byte is
 * `base * 4 + shade`; the four shades multiply the base colour by 180, 220, 255 and 135 out of 255,
 * and base 0 is transparent. See `docs/nbt-research.md`.
 *
 * Design: `design/design-sources/nbt-editor-full/MapArt.dc.html`. Pure and DOM-free.
 */

/** Base colours by id (1.17 and later), as [name, red, green, blue]. Id 0 is transparent. */
export const MAP_BASE_COLORS: readonly (readonly [string, number, number, number])[] = [
    ["None", 0, 0, 0],
    ["Grass", 127, 178, 56],
    ["Sand", 247, 233, 163],
    ["Wool", 199, 199, 199],
    ["Fire", 255, 0, 0],
    ["Ice", 160, 160, 255],
    ["Metal", 167, 167, 167],
    ["Plant", 0, 124, 0],
    ["Snow", 255, 255, 255],
    ["Clay", 164, 168, 184],
    ["Dirt", 151, 109, 77],
    ["Stone", 112, 112, 112],
    ["Water", 64, 64, 255],
    ["Wood", 143, 119, 72],
    ["Quartz", 255, 252, 245],
    ["Orange", 216, 127, 51],
    ["Magenta", 178, 76, 216],
    ["Light blue", 102, 153, 216],
    ["Yellow", 229, 229, 51],
    ["Lime", 127, 204, 25],
    ["Pink", 242, 127, 165],
    ["Gray", 76, 76, 76],
    ["Light gray", 153, 153, 153],
    ["Cyan", 76, 127, 153],
    ["Purple", 127, 63, 178],
    ["Blue", 51, 76, 178],
    ["Brown", 102, 76, 51],
    ["Green", 102, 127, 51],
    ["Red", 153, 51, 51],
    ["Black", 25, 25, 25],
    ["Gold", 250, 238, 77],
    ["Diamond", 92, 219, 213],
    ["Lapis", 74, 128, 255],
    ["Emerald", 0, 217, 58],
    ["Podzol", 129, 86, 49],
    ["Nether", 112, 2, 0],
    ["White terracotta", 209, 177, 161],
    ["Orange terracotta", 159, 82, 36],
    ["Magenta terracotta", 149, 87, 108],
    ["Light blue terracotta", 112, 108, 138],
    ["Yellow terracotta", 186, 133, 36],
    ["Lime terracotta", 103, 117, 53],
    ["Pink terracotta", 160, 77, 78],
    ["Gray terracotta", 57, 41, 35],
    ["Light gray terracotta", 135, 107, 98],
    ["Cyan terracotta", 87, 92, 92],
    ["Purple terracotta", 122, 73, 88],
    ["Blue terracotta", 76, 62, 92],
    ["Brown terracotta", 76, 50, 35],
    ["Green terracotta", 76, 82, 42],
    ["Red terracotta", 142, 60, 46],
    ["Black terracotta", 37, 22, 16],
    ["Crimson nylium", 189, 48, 49],
    ["Crimson stem", 148, 63, 97],
    ["Crimson hyphae", 92, 25, 29],
    ["Warped nylium", 22, 126, 134],
    ["Warped stem", 58, 142, 140],
    ["Warped hyphae", 86, 44, 62],
    ["Warped wart block", 20, 180, 133],
    ["Deepslate", 100, 100, 100],
    ["Raw iron", 216, 175, 147],
    ["Glow lichen", 127, 167, 150],
];

export const SHADE_MULTIPLIERS = [180, 220, 255, 135] as const;
export const SHADE_NAMES = ["Darker", "Dark", "Normal", "Darkest"] as const;
export const MAP_SIZE = 128;
export const MAP_PIXELS = MAP_SIZE * MAP_SIZE;

/** RGBA for one colour byte (signed or unsigned); transparent for base 0 and unknown ids. */
export function rgbaForColorId(id: number): readonly [number, number, number, number] {
    const unsigned = id & 0xff;
    const base = unsigned >> 2;
    const shade = unsigned & 3;
    const entry = MAP_BASE_COLORS[base];
    if (base === 0 || entry === undefined) return [0, 0, 0, 0];
    const m = SHADE_MULTIPLIERS[shade]!;
    return [
        Math.floor((entry[1] * m) / 255),
        Math.floor((entry[2] * m) / 255),
        Math.floor((entry[3] * m) / 255),
        255,
    ];
}

export function colorId(base: number, shade: number): number {
    return ((base & 0x3f) << 2) | (shade & 3);
}

/** The colour byte as the signed number the NBT byte array stores. */
export function signedByte(unsigned: number): number {
    const v = unsigned & 0xff;
    return v > 127 ? v - 256 : v;
}

/** RGBA pixels for a whole map, ready for `ImageData`. */
export function mapRgba(colors: readonly number[]): Uint8ClampedArray<ArrayBuffer> {
    const out = new Uint8ClampedArray(MAP_PIXELS * 4);
    for (let i = 0; i < MAP_PIXELS; i++) {
        const [r, g, b, a] = rgbaForColorId(colors[i] ?? 0);
        out[i * 4] = r;
        out[i * 4 + 1] = g;
        out[i * 4 + 2] = b;
        out[i * 4 + 3] = a;
    }
    return out;
}

/** The nearest map colour byte to an RGB value (squared distance), never transparent. */
export function nearestColorId(r: number, g: number, b: number): number {
    let best = colorId(1, 2);
    let bestDistance = Infinity;
    for (let base = 1; base < MAP_BASE_COLORS.length; base++) {
        for (let shade = 0; shade < 4; shade++) {
            const [cr, cg, cb] = rgbaForColorId(colorId(base, shade));
            const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
            if (d < bestDistance) {
                bestDistance = d;
                best = colorId(base, shade);
            }
        }
    }
    return best;
}

/** Every pixel on a straight line between two points, ends included (Bresenham). */
export function linePixels(x0: number, y0: number, x1: number, y1: number): [number, number][] {
    const out: [number, number][] = [];
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (let guard = 0; guard < 4 * MAP_SIZE; guard++) {
        out.push([x, y]);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y += sy;
        }
    }
    return out;
}

/** Flood fill from one pixel over every connected pixel of the same colour byte. */
export function floodFill(colors: number[], x: number, y: number, value: number): number {
    const target = colors[y * MAP_SIZE + x];
    if (target === undefined || (target & 0xff) === (value & 0xff)) return 0;
    const stack: number[] = [y * MAP_SIZE + x];
    let painted = 0;
    while (stack.length > 0) {
        const i = stack.pop()!;
        if ((colors[i]! & 0xff) !== (target & 0xff)) continue;
        colors[i] = value;
        painted += 1;
        const px = i % MAP_SIZE;
        if (px > 0) stack.push(i - 1);
        if (px < MAP_SIZE - 1) stack.push(i + 1);
        if (i >= MAP_SIZE) stack.push(i - MAP_SIZE);
        if (i < MAP_PIXELS - MAP_SIZE) stack.push(i + MAP_SIZE);
    }
    return painted;
}

/** The whole array as SNBT for one `replaceSnbt` edit, so a stroke is one undo step. */
export function colorsSnbt(colors: readonly number[]): string {
    return `[B;${colors.map((c) => `${signedByte(c)}b`).join(",")}]`;
}

/** Pixel colour bytes for an RGBA image already scaled to 128 by 128. */
export function imageToColors(rgba: Uint8ClampedArray): number[] {
    const out: number[] = [];
    const cache = new Map<number, number>();
    for (let i = 0; i < MAP_PIXELS; i++) {
        if ((rgba[i * 4 + 3] ?? 0) < 128) {
            out.push(0);
            continue;
        }
        const key =
            ((rgba[i * 4] ?? 0) << 16) | ((rgba[i * 4 + 1] ?? 0) << 8) | (rgba[i * 4 + 2] ?? 0);
        let id = cache.get(key);
        if (id === undefined) {
            id = nearestColorId(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0);
            cache.set(key, id);
        }
        out.push(signedByte(id));
    }
    return out;
}
