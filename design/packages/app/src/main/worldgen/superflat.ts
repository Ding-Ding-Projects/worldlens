/**
 * Superflat layers: an ordered list a user can actually edit, and the raw preset string
 * Minecraft's `generator-settings` actually wants.
 *
 * The GUI never asks anyone to type `minecraft:bedrock*1;minecraft:dirt*2;minecraft:grass_block`
 * by hand - that is exactly the "text box where a control could do the job" this feature
 * refuses to ship. Instead it edits a reorderable list of (block, depth) rows, and this
 * module is the only place that knows how to turn that list into the string the server
 * reads, and back again when an existing preset is loaded for editing.
 *
 * Both directions are pure and total: encoding never produces a string the game would
 * reject for a reason this module could have caught, and decoding never throws on
 * malformed input - it reports what it could not parse so the advanced view can show it
 * honestly rather than silently dropping a layer.
 */

export interface SuperflatLayer {
    /** A namespaced block id, e.g. "minecraft:dirt". Never validated against the full
     * registry here - the catalogue of real ids lives in the settings model - but must be
     * non-empty and contain no `;`, `*`, or whitespace, which would corrupt the preset. */
    readonly block: string;
    /** Number of blocks tall. Must be a positive integer; the game accepts up to 4064. */
    readonly depth: number;
}

export const MAX_SUPERFLAT_LAYERS = 64;
export const MAX_LAYER_DEPTH = 4064;
export const MAX_TOTAL_HEIGHT = 4064;

const BLOCK_ID_RE = /^[a-z0-9_.]+:[a-z0-9_./]+$/;

export type LayerFieldError = { readonly index: number; readonly field: "block" | "depth"; readonly message: string };

/** Validates a layer list on its own terms, before it is ever turned into a string. */
export function validateSuperflatLayers(layers: readonly SuperflatLayer[]): readonly LayerFieldError[] {
    const errors: LayerFieldError[] = [];
    if (layers.length === 0) {
        errors.push({ index: -1, field: "block", message: "Add at least one layer." });
    }
    if (layers.length > MAX_SUPERFLAT_LAYERS) {
        errors.push({ index: -1, field: "block", message: `No more than ${MAX_SUPERFLAT_LAYERS} layers.` });
    }
    let total = 0;
    layers.forEach((layer, index) => {
        if (!BLOCK_ID_RE.test(layer.block)) {
            errors.push({ index, field: "block", message: `"${layer.block}" is not a valid block id, e.g. minecraft:dirt.` });
        }
        if (!Number.isInteger(layer.depth) || layer.depth < 1) {
            errors.push({ index, field: "depth", message: "Depth must be a whole number of at least 1." });
        } else if (layer.depth > MAX_LAYER_DEPTH) {
            errors.push({ index, field: "depth", message: `Depth cannot exceed ${MAX_LAYER_DEPTH}.` });
        } else {
            total += layer.depth;
        }
    });
    if (total > MAX_TOTAL_HEIGHT) {
        errors.push({ index: -1, field: "depth", message: `Total layer height (${total}) exceeds the world height limit (${MAX_TOTAL_HEIGHT}).` });
    }
    return errors;
}

/**
 * Encodes an ordered layer list into the `generator-settings` preset string, from the
 * bottom of the world upward, exactly as the game's own superflat preset format expects.
 *
 * Consecutive layers of the same block collapse into one run, because the game's own
 * presets do this too and two separate `minecraft:dirt*1` runs back to back would read as
 * a bug in the export rather than a deliberate choice - never emitted as two, always merged.
 */
export function encodeSuperflatLayers(layers: readonly SuperflatLayer[]): string {
    const runs: SuperflatLayer[] = [];
    for (const layer of layers) {
        const prev = runs[runs.length - 1];
        if (prev !== undefined && prev.block === layer.block) {
            runs[runs.length - 1] = { block: prev.block, depth: prev.depth + layer.depth };
        } else {
            runs.push({ block: layer.block, depth: layer.depth });
        }
    }
    return runs.map((run) => (run.depth === 1 ? run.block : `${run.block}*${run.depth}`)).join(";");
}

export type DecodeSuperflatResult =
    | { readonly ok: true; readonly layers: readonly SuperflatLayer[] }
    | { readonly ok: false; readonly error: string };

/** The inverse of {@link encodeSuperflatLayers}. Rejects rather than guessing on malformed input. */
export function decodeSuperflatPreset(preset: string): DecodeSuperflatResult {
    const trimmed = preset.trim();
    if (trimmed.length === 0) {
        return { ok: false, error: "The preset string is empty." };
    }
    const layers: SuperflatLayer[] = [];
    for (const rawSegment of trimmed.split(";")) {
        const segment = rawSegment.trim();
        if (segment.length === 0) {
            return { ok: false, error: "The preset string has an empty segment between two semicolons." };
        }
        const starIndex = segment.indexOf("*");
        const block = starIndex === -1 ? segment : segment.slice(0, starIndex);
        const depthText = starIndex === -1 ? "1" : segment.slice(starIndex + 1);
        const depth = Number(depthText);
        if (!BLOCK_ID_RE.test(block)) {
            return { ok: false, error: `"${block}" in "${segment}" is not a valid block id.` };
        }
        if (!Number.isInteger(depth) || depth < 1) {
            return { ok: false, error: `"${depthText}" in "${segment}" is not a valid depth.` };
        }
        layers.push({ block, depth });
    }
    return { ok: true, layers };
}
