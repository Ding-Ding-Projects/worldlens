/**
 * The superflat layer editor's data model: an ordered list of (block, depth) rows, and
 * the encode/decode to and from vanilla's `generator-settings` layer string.
 *
 * Vanilla writes a flat preset as `depth*block,depth*block,...` from the bedrock floor
 * upward, optionally followed by `;biome` and `;structures`. This module only owns the
 * layer portion - `worldGenSettings.ts` decides the biome and structures separately.
 */

export interface SuperflatLayer {
    readonly block: string;
    readonly depth: number;
}

const LAYER = /^(\d+)\*(.+)$/;

/** Bottom-to-top order in, `depth*block,depth*block,...` out. */
export function encodeSuperflatLayers(layers: readonly SuperflatLayer[]): string {
    return layers.map((layer) => `${layer.depth}*${layer.block}`).join(",");
}

export interface DecodeSuperflatResult {
    readonly ok: boolean;
    readonly layers: readonly SuperflatLayer[];
    readonly error: string | null;
}

/** The inverse of {@link encodeSuperflatLayers}. Rejects anything it cannot round-trip. */
export function decodeSuperflatLayers(preset: string): DecodeSuperflatResult {
    const trimmed = preset.trim();
    if (trimmed === "") return { ok: true, layers: [], error: null };

    const layers: SuperflatLayer[] = [];
    for (const part of trimmed.split(",")) {
        const match = LAYER.exec(part.trim());
        if (match === null) {
            return { ok: false, layers: [], error: `"${part}" is not "depth*block".` };
        }
        const depth = Number(match[1]);
        if (!Number.isInteger(depth) || depth < 1) {
            return { ok: false, layers: [], error: `"${part}" has an invalid depth.` };
        }
        layers.push({ block: match[2], depth });
    }
    return { ok: true, layers, error: null };
}

export function totalSuperflatDepth(layers: readonly SuperflatLayer[]): number {
    return layers.reduce((sum, layer) => sum + layer.depth, 0);
}

export function addSuperflatLayer(
    layers: readonly SuperflatLayer[],
    layer: SuperflatLayer,
    atIndex?: number,
): readonly SuperflatLayer[] {
    const next = [...layers];
    const insertAt = atIndex === undefined ? next.length : Math.max(0, Math.min(atIndex, next.length));
    next.splice(insertAt, 0, layer);
    return next;
}

export function removeSuperflatLayer(layers: readonly SuperflatLayer[], atIndex: number): readonly SuperflatLayer[] {
    return layers.filter((_, index) => index !== atIndex);
}

export function moveSuperflatLayer(
    layers: readonly SuperflatLayer[],
    fromIndex: number,
    toIndex: number,
): readonly SuperflatLayer[] {
    if (fromIndex < 0 || fromIndex >= layers.length) return layers;
    const clamped = Math.max(0, Math.min(toIndex, layers.length - 1));
    if (clamped === fromIndex) return layers;
    const next = [...layers];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(clamped, 0, moved as SuperflatLayer);
    return next;
}

export function updateSuperflatLayer(
    layers: readonly SuperflatLayer[],
    atIndex: number,
    patch: Partial<SuperflatLayer>,
): readonly SuperflatLayer[] {
    return layers.map((layer, index) => (index === atIndex ? { ...layer, ...patch } : layer));
}
