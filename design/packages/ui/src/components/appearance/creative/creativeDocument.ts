import {
    CREATIVE_DOCUMENT_FORMAT,
    CREATIVE_DOCUMENT_VERSION,
    LEGACY_CREATIVE_DOCUMENT_VERSION,
    CREATIVE_LIMITS,
    DEFAULT_CREATIVE_CAPABILITIES,
    type CreativeAppearanceCapabilities,
    type CreativeAppearanceDocument,
    type CreativeAssetValidation,
    type CreativeBlendMode,
    type CreativeCanvas,
    type CreativeEffectStack,
    type CreativeGradientLayer,
    type CreativeHistoryEntry,
    type CreativeLayer,
    type CreativeMask,
    type CreativeTextLayer,
    type CreativeVectorLayer,
    type CreativeImportResult,
    type CreativePreset,
    type CreativeLogoComposition,
} from "./creativeTypes.js";
import { DEFAULT_TYPOGRAPHY, type TypographySpec } from "../typographySpec.js";
import { validateLogoBytes } from "../../appLogo/logoValidation.js";

const BLEND_MODES: readonly CreativeBlendMode[] = [
    "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
    "color-burn", "hard-light", "soft-light", "difference",
];

export const CREATIVE_BLEND_MODES = BLEND_MODES;

const DEFAULT_EFFECTS: CreativeEffectStack = {
    blur: 0, brightness: 1, contrast: 1, saturation: 1, hue: 0, grayscale: 0, sepia: 0, invert: 0,
    shadow: { x: 0, y: 0, blur: 0, color: "" },
    innerGlow: { radius: 0, color: "" },
    outerGlow: { radius: 0, color: "" },
};
const DEFAULT_MASK: CreativeMask = {
    enabled: false, kind: "rectangle", x: 0, y: 0, width: 100, height: 100, feather: 0,
};
const DEFAULT_LOGO: CreativeLogoComposition = {
    enabled: false,
    target: "appearance-target" as const,
    activeVariantId: null,
    presentation: { presetId: "square", crop: { top: 0, right: 0, bottom: 0, left: 0 }, fit: "contain", focalPoint: { x: 50, y: 50 }, background: "transparent", backgroundColor: "#1e1e1e" },
    safeArea: { inset: 10, enabled: true },
    variants: [],
};

function canvasDefaults(width: number, height: number, background: string): CreativeCanvas {
    return {
        width, height, background,
        crop: { top: 0, right: 0, bottom: 0, left: 0 },
        rulers: true,
        guides: [],
        grid: { enabled: false, size: 16, snap: false },
        safeArea: { inset: 10, enabled: false },
    };
}

let sequence = 0;
function id(prefix: string): string {
    sequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function snapCoordinate(document: CreativeAppearanceDocument, value: number): number {
    return document.canvas.grid.snap ? Math.round(value / document.canvas.grid.size) * document.canvas.grid.size : value;
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function cleanName(name: string, fallback: string): string {
    const value = name.trim().slice(0, CREATIVE_LIMITS.maxNameLength);
    return value || fallback;
}

function snapshot(
    action: string,
    canvas: CreativeCanvas,
    layers: readonly CreativeLayer[],
    selectedLayerIds: readonly string[],
    presets: readonly CreativePreset[] = [],
    logo = DEFAULT_LOGO,
): CreativeHistoryEntry {
    return {
        id: id("history"),
        action,
        timestamp: new Date().toISOString(),
        canvas: clone(canvas),
        layers: clone(layers),
        selectedLayerIds: [...selectedLayerIds],
        presets: clone(presets),
        logo: clone(logo),
    };
}

function withInitialHistory(
    canvas: CreativeCanvas,
    layers: readonly CreativeLayer[],
    selectedLayerIds: readonly string[],
): CreativeAppearanceDocument {
    return {
        format: CREATIVE_DOCUMENT_FORMAT,
        version: CREATIVE_DOCUMENT_VERSION,
        canvas: clone(canvas),
        layers: clone(layers),
        selectedLayerIds: [...selectedLayerIds],
        history: [snapshot("document created", canvas, layers, selectedLayerIds, [], DEFAULT_LOGO)],
        historyCursor: 0,
        presets: [],
        logo: clone(DEFAULT_LOGO),
    };
}

export function createCreativeDocument(
    canvas: Partial<CreativeCanvas> = {},
): CreativeAppearanceDocument {
    const width = clamp(canvas.width ?? 1024, 1, 4096);
    const height = clamp(canvas.height ?? 768, 1, 4096);
    return withInitialHistory(
        canvasDefaults(width, height, canvas.background ?? "#202124"),
        [],
        [],
    );
}

export function createTextLayer(overrides: Partial<CreativeTextLayer> = {}): CreativeTextLayer {
    return {
        id: overrides.id ?? id("text"), name: cleanName(overrides.name ?? "Text", "Text"), kind: "text",
        parentId: overrides.parentId ?? null, visible: overrides.visible ?? true,
        opacity: clamp(overrides.opacity ?? 1, 0, 1), blendMode: overrides.blendMode ?? "normal",
        clipped: overrides.clipped ?? false, clipSourceId: overrides.clipSourceId ?? null, locked: overrides.locked ?? false, mask: overrides.mask ?? null,
        effects: clone(overrides.effects ?? DEFAULT_EFFECTS), text: (overrides.text ?? "Double-click to edit").slice(0, CREATIVE_LIMITS.maxTextLength),
        x: overrides.x ?? 96, y: overrides.y ?? 140, width: overrides.width ?? 640, height: overrides.height ?? 96,
        rotation: overrides.rotation ?? 0, scaleX: overrides.scaleX ?? 1, scaleY: overrides.scaleY ?? 1, fill: overrides.fill ?? "#f8f9fa",
        typography: clone(overrides.typography ?? ({ ...DEFAULT_TYPOGRAPHY } as Partial<TypographySpec>)),
    };
}

export function createVectorLayer(overrides: Partial<CreativeVectorLayer> = {}): CreativeVectorLayer {
    return {
        id: overrides.id ?? id("shape"), name: cleanName(overrides.name ?? "Shape", "Shape"), kind: "vector",
        parentId: overrides.parentId ?? null, visible: overrides.visible ?? true,
        opacity: clamp(overrides.opacity ?? 1, 0, 1), blendMode: overrides.blendMode ?? "normal",
        clipped: overrides.clipped ?? false, clipSourceId: overrides.clipSourceId ?? null, locked: overrides.locked ?? false, mask: overrides.mask ?? null,
        effects: clone(overrides.effects ?? DEFAULT_EFFECTS), shape: overrides.shape ?? "rect",
        x: overrides.x ?? 128, y: overrides.y ?? 192, width: overrides.width ?? 360, height: overrides.height ?? 180,
        rotation: overrides.rotation ?? 0, scaleX: overrides.scaleX ?? 1, scaleY: overrides.scaleY ?? 1, fill: overrides.fill ?? "#8ab4f8", stroke: overrides.stroke ?? "#ffffff",
        strokeWidth: clamp(overrides.strokeWidth ?? 2, 0, 64),
    };
}

export function createGradientLayer(overrides: Partial<CreativeGradientLayer> = {}): CreativeGradientLayer {
    return {
        id: overrides.id ?? id("gradient"), name: cleanName(overrides.name ?? "Gradient", "Gradient"), kind: "gradient",
        parentId: overrides.parentId ?? null, visible: overrides.visible ?? true,
        opacity: clamp(overrides.opacity ?? 1, 0, 1), blendMode: overrides.blendMode ?? "normal",
        clipped: overrides.clipped ?? false, clipSourceId: overrides.clipSourceId ?? null, locked: overrides.locked ?? false, mask: overrides.mask ?? null,
        effects: clone(overrides.effects ?? DEFAULT_EFFECTS), x: overrides.x ?? 0, y: overrides.y ?? 0,
        width: overrides.width ?? 1024, height: overrides.height ?? 768, angle: overrides.angle ?? 0, scaleX: overrides.scaleX ?? 1, scaleY: overrides.scaleY ?? 1,
        stops: clone(overrides.stops ?? [{ offset: 0, color: "#8ab4f8" }, { offset: 1, color: "#c58af9" }]),
    };
}

export function createCreativeLayer(kind: Exclude<CreativeLayer["kind"], "raster">): CreativeLayer {
    if (kind === "text") return createTextLayer();
    if (kind === "vector") return createVectorLayer();
    if (kind === "gradient") return createGradientLayer();
    return {
        id: id("group"), name: "Group", kind: "group", parentId: null, visible: true, opacity: 1,
        blendMode: "normal", clipped: false, clipSourceId: null, locked: false, mask: null, effects: clone(DEFAULT_EFFECTS),
    };
}

export function createRasterLayer(
    asset: CreativeAssetValidation,
    dataUrl: string,
    overrides: Partial<CreativeLayer> = {},
): CreativeLayer {
    return {
        id: id("image"), name: cleanName(overrides.name ?? "Imported image", "Imported image"), kind: "raster",
        parentId: overrides.parentId ?? null, visible: true, opacity: 1, blendMode: "normal", clipped: false, clipSourceId: null, mask: null,
        effects: clone(DEFAULT_EFFECTS), dataUrl, x: 0, y: 0, width: asset.width, height: asset.height,
        rotation: 0, flipX: false, flipY: false,
    } as CreativeLayer;
}

export function commitCreativeChange(
    document: CreativeAppearanceDocument,
    next: Pick<CreativeAppearanceDocument, "canvas" | "layers" | "selectedLayerIds">,
    action: string,
): CreativeAppearanceDocument {
    const entry = snapshot(action, next.canvas, next.layers, next.selectedLayerIds, document.presets, document.logo);
    const retained = document.history.slice(0, document.historyCursor + 1);
    const history = [...retained, entry].slice(-CREATIVE_LIMITS.maxHistory);
    return {
        format: CREATIVE_DOCUMENT_FORMAT, version: CREATIVE_DOCUMENT_VERSION,
        canvas: clone(next.canvas), layers: clone(next.layers), selectedLayerIds: [...next.selectedLayerIds],
        history, historyCursor: history.length - 1,
        presets: clone(document.presets), logo: clone(document.logo),
    };
}

function fromHistory(document: CreativeAppearanceDocument, cursor: number): CreativeAppearanceDocument {
    const entry = document.history[cursor];
    if (entry === undefined) return document;
    return {
        ...document, canvas: clone(entry.canvas), layers: clone(entry.layers),
        selectedLayerIds: [...entry.selectedLayerIds], presets: clone(entry.presets), logo: clone(entry.logo), historyCursor: cursor,
    };
}

export function undoCreative(document: CreativeAppearanceDocument): CreativeAppearanceDocument {
    return document.historyCursor > 0 ? fromHistory(document, document.historyCursor - 1) : document;
}

export function redoCreative(document: CreativeAppearanceDocument): CreativeAppearanceDocument {
    return document.historyCursor + 1 < document.history.length
        ? fromHistory(document, document.historyCursor + 1)
        : document;
}

export function updateCreativeLayer(
    document: CreativeAppearanceDocument,
    layerId: string,
    patch: Partial<CreativeLayer>,
    action = "update layer",
): CreativeAppearanceDocument {
    const layers = document.layers.map((layer) => layer.id === layerId
        ? ({ ...layer, ...clone(patch), opacity: clamp((patch.opacity ?? layer.opacity), 0, 1) } as CreativeLayer)
        : layer);
    return commitCreativeChange(document, { canvas: document.canvas, layers, selectedLayerIds: document.selectedLayerIds }, action);
}

export function addCreativeLayer(document: CreativeAppearanceDocument, layer: CreativeLayer, action = "add layer"):
    CreativeAppearanceDocument {
    if (document.layers.length >= CREATIVE_LIMITS.maxLayers) return document;
    return commitCreativeChange(document, {
        canvas: document.canvas, layers: [...document.layers, layer], selectedLayerIds: [layer.id],
    }, action);
}

export function removeCreativeLayers(document: CreativeAppearanceDocument, ids: readonly string[]): CreativeAppearanceDocument {
    const removed = new Set(ids);
    let changed = true;
    while (changed) {
        changed = false;
        for (const layer of document.layers) {
            if (layer.parentId !== null && removed.has(layer.parentId) && !removed.has(layer.id)) {
                removed.add(layer.id);
                changed = true;
            }
        }
    }
    const keep = document.layers.filter((layer) => !removed.has(layer.id));
    return commitCreativeChange(document, { canvas: document.canvas, layers: keep, selectedLayerIds: [] }, "delete layers");
}

export function reorderCreativeLayer(document: CreativeAppearanceDocument, layerId: string, direction: -1 | 1): CreativeAppearanceDocument {
    const index = document.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) return document;
    const layer = document.layers[index]!;
    const siblings = document.layers.filter((candidate) => candidate.parentId === layer.parentId);
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === layerId);
    const target = siblingIndex + direction;
    if (target < 0 || target >= siblings.length) return document;
    const swapId = siblings[target]!.id;
    const next = [...document.layers];
    const swapIndex = next.findIndex((candidate) => candidate.id === swapId);
    [next[index]!, next[swapIndex]!] = [next[swapIndex]!, next[index]!];
    return commitCreativeChange(document, { canvas: document.canvas, layers: next, selectedLayerIds: [layerId] }, "reorder layer");
}

export function groupCreativeLayers(document: CreativeAppearanceDocument, ids: readonly string[]): CreativeAppearanceDocument {
    if (ids.length === 0 || document.layers.filter((layer) => layer.kind === "group").length >= CREATIVE_LIMITS.maxGroups) return document;
    const group = createCreativeLayer("group");
    const selected = new Set(ids);
    const layers = [group, ...document.layers.map((layer) => selected.has(layer.id) ? { ...layer, parentId: group.id } : layer)];
    return commitCreativeChange(document, { canvas: document.canvas, layers, selectedLayerIds: [group.id] }, "group layers");
}

export function resetCreativeLayer(document: CreativeAppearanceDocument, layerId: string): CreativeAppearanceDocument {
    const layer = document.layers.find((candidate) => candidate.id === layerId);
    if (layer === undefined) return document;
    const reset = layer.kind === "group" ? { ...layer, visible: true, opacity: 1, blendMode: "normal" as const, clipped: false, clipSourceId: null, locked: false, mask: null, effects: clone(DEFAULT_EFFECTS) }
        : layer.kind === "raster" ? { ...layer, visible: true, opacity: 1, blendMode: "normal" as const, clipped: false, clipSourceId: null, locked: false, mask: null, effects: clone(DEFAULT_EFFECTS), x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }
        : layer.kind === "text" ? createTextLayer({ id: layer.id, name: layer.name, parentId: layer.parentId })
        : layer.kind === "vector" ? createVectorLayer({ id: layer.id, name: layer.name, parentId: layer.parentId })
            : layer.kind === "gradient" ? createGradientLayer({ id: layer.id, name: layer.name, parentId: layer.parentId })
                : layer;
    return updateCreativeLayer(document, layerId, reset, "reset layer");
}

export function duplicateCreativeLayers(document: CreativeAppearanceDocument, ids: readonly string[]): CreativeAppearanceDocument {
    const selected = new Set(ids);
    let changed = true;
    while (changed) {
        changed = false;
        for (const layer of document.layers) {
            if (layer.parentId !== null && selected.has(layer.parentId) && !selected.has(layer.id)) {
                selected.add(layer.id);
                changed = true;
            }
        }
    }
    const sourceLayers = document.layers.filter((layer) => selected.has(layer.id));
    const remap = new Map(sourceLayers.map((layer) => [layer.id, id(layer.kind)]));
    const copies = sourceLayers.map((layer) => ({
        ...clone(layer), id: remap.get(layer.id)!, name: `${layer.name} copy`, parentId: layer.parentId !== null && remap.has(layer.parentId) ? remap.get(layer.parentId)! : layer.parentId, x: "x" in layer ? layer.x + 24 : undefined,
        y: "y" in layer ? layer.y + 24 : undefined,
    } as CreativeLayer));
    if (copies.length === 0 || document.layers.length + copies.length > CREATIVE_LIMITS.maxLayers) return document;
    return commitCreativeChange(document, { canvas: document.canvas, layers: [...document.layers, ...copies], selectedLayerIds: copies.map((layer) => layer.id) }, "duplicate layers");
}

export function ungroupCreativeLayers(document: CreativeAppearanceDocument, groupId: string): CreativeAppearanceDocument {
    const group = document.layers.find((layer) => layer.id === groupId && layer.kind === "group");
    if (!group) return document;
    const layers = document.layers.filter((layer) => layer.id !== groupId).map((layer) => layer.parentId === groupId ? { ...layer, parentId: group.parentId } : layer);
    return commitCreativeChange(document, { canvas: document.canvas, layers, selectedLayerIds: layers.filter((layer) => layer.parentId === group.parentId).map((layer) => layer.id) }, "ungroup layers");
}

export function setCreativeCanvas(document: CreativeAppearanceDocument, patch: Partial<CreativeCanvas>, action = "adjust canvas"): CreativeAppearanceDocument {
    const next = { ...document.canvas, ...clone(patch), width: clamp(patch.width ?? document.canvas.width, 1, 4096), height: clamp(patch.height ?? document.canvas.height, 1, 4096) };
    return commitCreativeChange(document, { canvas: next, layers: document.layers, selectedLayerIds: document.selectedLayerIds }, action);
}

export function resetCreativeCanvas(document: CreativeAppearanceDocument): CreativeAppearanceDocument {
    return setCreativeCanvas(document, canvasDefaults(1024, 768, "#202124"), "reset canvas");
}

export function alignCreativeLayers(document: CreativeAppearanceDocument, ids: readonly string[], axis: "left" | "center" | "right" | "top" | "middle" | "bottom"): CreativeAppearanceDocument {
    const selected = document.layers.filter((layer): layer is Exclude<CreativeLayer, { kind: "group" }> => ids.includes(layer.id) && "x" in layer && "y" in layer);
    if (selected.length < 2) return document;
    const minX = Math.min(...selected.map((layer) => layer.x));
    const maxRight = Math.max(...selected.map((layer) => layer.x + layer.width));
    const minY = Math.min(...selected.map((layer) => layer.y));
    const maxBottom = Math.max(...selected.map((layer) => layer.y + layer.height));
    const layers = document.layers.map((layer) => {
        if (!ids.includes(layer.id) || !("x" in layer) || !("y" in layer)) return layer;
        const x = snapCoordinate(document, axis === "left" ? minX : axis === "center" ? (minX + maxRight - layer.width) / 2 : axis === "right" ? maxRight - layer.width : layer.x);
        const y = snapCoordinate(document, axis === "top" ? minY : axis === "middle" ? (minY + maxBottom - layer.height) / 2 : axis === "bottom" ? maxBottom - layer.height : layer.y);
        return { ...layer, x, y } as CreativeLayer;
    });
    return commitCreativeChange(document, { canvas: document.canvas, layers, selectedLayerIds: [...ids] }, `align ${axis}`);
}

export function distributeCreativeLayers(document: CreativeAppearanceDocument, ids: readonly string[], axis: "horizontal" | "vertical"): CreativeAppearanceDocument {
    const selected = document.layers.filter((layer): layer is Exclude<CreativeLayer, { kind: "group" }> => ids.includes(layer.id) && "x" in layer && "y" in layer).sort((left, right) => axis === "horizontal" ? left.x - right.x : left.y - right.y);
    if (selected.length < 3) return document;
    const first = selected[0]!;
    const last = selected[selected.length - 1]!;
    const totalSpan = axis === "horizontal" ? (last.x + last.width - first.x) : (last.y + last.height - first.y);
    const occupied = selected.reduce((sum, layer) => sum + (axis === "horizontal" ? layer.width : layer.height), 0);
    const gap = Math.max(0, (totalSpan - occupied) / (selected.length - 1));
    let cursor = axis === "horizontal" ? first.x : first.y;
    const positions = new Map<string, number>();
    for (const layer of selected) {
        positions.set(layer.id, snapCoordinate(document, cursor));
        cursor += (axis === "horizontal" ? layer.width : layer.height) + gap;
    }
    const layers = document.layers.map((layer) => positions.has(layer.id) ? { ...layer, ...(axis === "horizontal" ? { x: positions.get(layer.id) } : { y: positions.get(layer.id) }) } as CreativeLayer : layer);
    return commitCreativeChange(document, { canvas: document.canvas, layers, selectedLayerIds: [...ids] }, axis === "horizontal" ? "distribute horizontal layers" : "distribute vertical layers");
}

export function setCreativeLogo(document: CreativeAppearanceDocument, logo: Partial<CreativeAppearanceDocument["logo"]>): CreativeAppearanceDocument {
    const next = { ...document, logo: { ...document.logo, ...clone(logo) } };
    const entry = snapshot("adjust logo composition", next.canvas, next.layers, next.selectedLayerIds, next.presets, next.logo);
    const history = [...document.history.slice(0, document.historyCursor + 1), entry].slice(-CREATIVE_LIMITS.maxHistory);
    return { ...next, history, historyCursor: history.length - 1 };
}

export function saveCreativePreset(document: CreativeAppearanceDocument, name: string): CreativeAppearanceDocument {
    const preset = { id: id("preset"), name: cleanName(name, "Untitled preset"), canvas: clone(document.canvas), layers: clone(document.layers) };
    const next = { ...document, presets: [...document.presets, preset].slice(-32) };
    const entry = snapshot("save creative preset", next.canvas, next.layers, next.selectedLayerIds, next.presets, next.logo);
    const history = [...document.history.slice(0, document.historyCursor + 1), entry].slice(-CREATIVE_LIMITS.maxHistory);
    return { ...next, history, historyCursor: history.length - 1 };
}

export function resetCreativeDocument(document: CreativeAppearanceDocument): CreativeAppearanceDocument {
    const next = createCreativeDocument();
    return commitCreativeChange({ ...next, presets: document.presets, logo: document.logo }, { canvas: next.canvas, layers: [], selectedLayerIds: [] }, "reset creative document");
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validNumber(value: unknown, min = -1_000_000, max = 1_000_000): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

const COLOR_RE = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|oklab|oklch|lab|lch|color)\([^\n]{1,180}\)|[a-z]{1,32})$/i;

function validColor(value: unknown): value is string {
    return typeof value === "string" && value.length <= 192 && (value === "" || COLOR_RE.test(value));
}

function validRasterDataUrl(value: unknown): value is string {
    if (typeof value !== "string" || value.length > CREATIVE_LIMITS.maxAssetBytes * 2) return false;
    const match = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([a-z0-9+/=]+)$/i.exec(value);
    if (!match || typeof globalThis.atob !== "function") return false;
    try {
        const binary = globalThis.atob(match[2]!);
        if (binary.length > CREATIVE_LIMITS.maxAssetBytes) return false;
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        validateCreativeAssetBytes(bytes, match[1]!);
        return true;
    } catch {
        return false;
    }
}

function validLogoVariantDataUrl(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const match = /^data:image\/svg\+xml;charset=utf-8,(.+)$/i.exec(value);
    if (!match) return false;
    try {
        const result = validateLogoBytes(new TextEncoder().encode(decodeURIComponent(match[1]!)));
        return result.ok && result.image.format === "svg";
    } catch {
        return false;
    }
}

function validEffects(value: unknown): value is CreativeEffectStack {
    if (!isObject(value) || !validNumber(value.blur, 0, 128) || !validNumber(value.brightness, 0, 8) || !validNumber(value.contrast, 0, 8) || !validNumber(value.saturation, 0, 8) || !validNumber(value.hue, -360, 360) || !validNumber(value.grayscale, 0, 1) || !validNumber(value.sepia, 0, 1) || !validNumber(value.invert, 0, 1) || !isObject(value.shadow) || !isObject(value.innerGlow) || !isObject(value.outerGlow)) return false;
    return validNumber(value.shadow.x, -4096, 4096) && validNumber(value.shadow.y, -4096, 4096) && validNumber(value.shadow.blur, 0, 256) && validColor(value.shadow.color) && validNumber(value.innerGlow.radius, 0, 256) && validColor(value.innerGlow.color) && validNumber(value.outerGlow.radius, 0, 256) && validColor(value.outerGlow.color);
}

function validLayer(layer: unknown, depth: number, ids: Set<string>, canvas: CreativeCanvas): layer is CreativeLayer {
    if (!isObject(layer) || depth > CREATIVE_LIMITS.maxNesting) return false;
    if (typeof layer.id !== "string" || layer.id.length === 0 || ids.has(layer.id) || typeof layer.name !== "string" || typeof layer.kind !== "string") return false;
    ids.add(layer.id);
    if (layer.name.length > CREATIVE_LIMITS.maxNameLength || !["group", "raster", "vector", "text", "gradient"].includes(layer.kind)) return false;
    if (layer.parentId !== null && typeof layer.parentId !== "string") return false;
    if (typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean" || typeof layer.clipped !== "boolean" || (layer.clipSourceId !== null && typeof layer.clipSourceId !== "string") || !validNumber(layer.opacity, 0, 1) || !BLEND_MODES.includes(layer.blendMode as CreativeBlendMode) || !validEffects(layer.effects)) return false;
    if (layer.mask !== null && (!isObject(layer.mask) || typeof layer.mask.enabled !== "boolean" || !["rectangle", "ellipse"].includes(String(layer.mask.kind)) || !validNumber(layer.mask.x) || !validNumber(layer.mask.y) || !validNumber(layer.mask.width, 1, canvas.width) || !validNumber(layer.mask.height, 1, canvas.height) || !validNumber(layer.mask.feather, 0, 256))) return false;
    if (layer.kind === "group") return true;
    if (!validNumber(layer.x, -canvas.width, canvas.width * 2) || !validNumber(layer.y, -canvas.height, canvas.height * 2) || !validNumber(layer.width, 1, canvas.width * 2) || !validNumber(layer.height, 1, canvas.height * 2) || (layer.kind !== "gradient" && !validNumber(layer.rotation, -3600, 3600)) || !validNumber(layer.scaleX, 0.01, 100) || !validNumber(layer.scaleY, 0.01, 100)) return false;
    if (layer.kind === "text" && (typeof layer.text !== "string" || layer.text.length > CREATIVE_LIMITS.maxTextLength || !validColor(layer.fill) || !isObject(layer.typography))) return false;
    if (layer.kind === "raster" && !validRasterDataUrl(layer.dataUrl)) return false;
    if (layer.kind === "vector" && (!validColor(layer.fill) || !validColor(layer.stroke) || !validNumber(layer.strokeWidth, 0, 64) || !["rect", "ellipse", "line"].includes(String(layer.shape)))) return false;
    if (layer.kind === "gradient" && (!validNumber(layer.angle, -3600, 3600) || !Array.isArray(layer.stops) || layer.stops.length < 2 || layer.stops.length > 32 || !layer.stops.every((stop) => isObject(stop) && validNumber(stop.offset, 0, 1) && validColor(stop.color)))) return false;
    return true;
}

function validCanvas(value: unknown): value is CreativeCanvas {
    if (!isObject(value) || !validNumber(value.width, 1, 4096) || !validNumber(value.height, 1, 4096) || !validColor(value.background) || value.width * value.height > CREATIVE_LIMITS.maxCanvasPixels) return false;
    const guideIds = new Set<string>();
    return isObject(value.crop) && validNumber(value.crop.top, 0, value.height) && validNumber(value.crop.right, 0, value.width) && validNumber(value.crop.bottom, 0, value.height) && validNumber(value.crop.left, 0, value.width) && value.crop.top + value.crop.bottom < value.height && value.crop.left + value.crop.right < value.width && typeof value.rulers === "boolean" && isObject(value.grid) && typeof value.grid.enabled === "boolean" && validNumber(value.grid.size, 1, 512) && typeof value.grid.snap === "boolean" && isObject(value.safeArea) && validNumber(value.safeArea.inset, 0, 512) && typeof value.safeArea.enabled === "boolean" && Array.isArray(value.guides) && value.guides.length <= 128 && value.guides.every((guide) => isObject(guide) && typeof guide.id === "string" && !guideIds.has(guide.id) && (guideIds.add(guide.id), ["x", "y"].includes(String(guide.axis)) && validNumber(guide.position, -4096, 8192)));
}

function validLayerGraph(value: unknown, canvas: CreativeCanvas): value is readonly CreativeLayer[] {
    if (!Array.isArray(value) || value.length > CREATIVE_LIMITS.maxLayers) return false;
    const ids = new Set<string>();
    if (!value.every((layer) => validLayer(layer, 0, ids, canvas))) return false;
    for (const layer of value) {
        if (layer.clipSourceId !== null) {
            const source = value.find((candidate) => candidate.id === layer.clipSourceId);
            if (!source || source.id === layer.id || source.parentId !== layer.parentId || source.kind === "group") return false;
        }
        if (layer.parentId === null) continue;
        const parent = value.find((candidate) => candidate.id === layer.parentId);
        if (!parent || parent.kind !== "group") return false;
        const seen = new Set<string>();
        let current: string | null = layer.parentId;
        while (current !== null) {
            if (seen.has(current)) return false;
            seen.add(current);
            const ancestor = value.find((candidate) => candidate.id === current);
            current = ancestor?.parentId ?? null;
            if (seen.size > CREATIVE_LIMITS.maxNesting) return false;
        }
    }
    return value.filter((layer) => layer.kind === "group").length <= CREATIVE_LIMITS.maxGroups;
}

function selectedIdsValid(layers: unknown, selected: unknown): boolean {
    if (!Array.isArray(layers) || !Array.isArray(selected)) return false;
    const ids = new Set(layers.filter(isObject).map((layer) => layer.id).filter((id): id is string => typeof id === "string"));
    return selected.every((id) => typeof id === "string" && ids.has(id));
}

function validLogoComposition(value: unknown): boolean {
    if (!isObject(value) || typeof value.enabled !== "boolean" || !["app-logo", "appearance-target"].includes(String(value.target)) || (value.activeVariantId !== null && typeof value.activeVariantId !== "string") || !isObject(value.presentation) || typeof value.presentation.presetId !== "string" || !isObject(value.presentation.crop) || !validNumber(value.presentation.crop.top, 0, 40) || !validNumber(value.presentation.crop.right, 0, 40) || !validNumber(value.presentation.crop.bottom, 0, 40) || !validNumber(value.presentation.crop.left, 0, 40) || !["fill", "contain"].includes(String(value.presentation.fit)) || !isObject(value.presentation.focalPoint) || !validNumber(value.presentation.focalPoint.x, 0, 100) || !validNumber(value.presentation.focalPoint.y, 0, 100) || !["transparent", "solid"].includes(String(value.presentation.background)) || !validColor(value.presentation.backgroundColor) || !isObject(value.safeArea) || !validNumber(value.safeArea.inset, 0, 512) || typeof value.safeArea.enabled !== "boolean" || !Array.isArray(value.variants) || value.variants.length > 8) return false;
    const variantIds = new Set<string>();
    if (!value.variants.every((variant) => isObject(variant) && typeof variant.id === "string" && !variantIds.has(variant.id) && (variantIds.add(variant.id), validNumber(variant.width, 1, 2048) && validNumber(variant.height, 1, 2048) && validLogoVariantDataUrl(variant.dataUrl)))) return false;
    return value.activeVariantId === null || variantIds.has(value.activeVariantId);
}

export function validateCreativeDocument(value: unknown): value is CreativeAppearanceDocument {
    if (!isObject(value) || value.format !== CREATIVE_DOCUMENT_FORMAT || value.version !== CREATIVE_DOCUMENT_VERSION) return false;
    const canvas = value.canvas;
    if (!validCanvas(canvas)) return false;
    if (!validLayerGraph(value.layers, canvas)) return false;
    if (!selectedIdsValid(value.layers, value.selectedLayerIds)) return false;
    if (!Array.isArray(value.history) || value.history.length > CREATIVE_LIMITS.maxHistory || !validNumber(value.historyCursor, 0, Math.max(0, value.history.length - 1))) return false;
    if (!Array.isArray(value.presets) || value.presets.length > 32 || !value.presets.every((preset) => isObject(preset) && typeof preset.id === "string" && typeof preset.name === "string" && validCanvas(preset.canvas) && validLayerGraph(preset.layers, preset.canvas))) return false;
    if (!validLogoComposition(value.logo)) return false;
    return value.history.every((entry) => isObject(entry) && typeof entry.id === "string" && typeof entry.action === "string" && typeof entry.timestamp === "string" && validCanvas(entry.canvas) && validLayerGraph(entry.layers, entry.canvas) && selectedIdsValid(entry.layers, entry.selectedLayerIds) && Array.isArray(entry.presets) && entry.presets.every((preset) => isObject(preset) && validCanvas(preset.canvas) && validLayerGraph(preset.layers, preset.canvas)) && validLogoComposition(entry.logo));
}

export function importCreativeDocument(text: string): CreativeImportResult {
    if (text.length > 12 * 1024 * 1024) throw new Error("The creative document is larger than the 12 MB safety limit.");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error("The creative document is not valid JSON."); }
    const migrated = migrateCreativeDocument(parsed);
    if (!validateCreativeDocument(migrated)) throw new Error("The creative document does not match the supported bounded format.");
    return { document: clone(migrated), warnings: parsed !== migrated ? ["This document was migrated from creative format version 1."] : [] };
}

function migrateCanvas(raw: unknown): Record<string, unknown> {
    const value = isObject(raw) ? raw : {};
    return {
        ...value,
        crop: isObject(value.crop) ? value.crop : { top: 0, right: 0, bottom: 0, left: 0 },
        rulers: typeof value.rulers === "boolean" ? value.rulers : true,
        guides: Array.isArray(value.guides) ? value.guides : [],
        grid: isObject(value.grid) ? { enabled: Boolean(value.grid.enabled), size: value.grid.size ?? 16, snap: Boolean(value.grid.snap) } : { enabled: false, size: 16, snap: false },
        safeArea: isObject(value.safeArea) ? value.safeArea : { inset: 10, enabled: false },
    };
}

function migrateLayer(raw: unknown): Record<string, unknown> {
    const value = isObject(raw) ? valueOrEmpty(raw) : {};
    const kind = value.kind;
    return {
        ...value,
        locked: typeof value.locked === "boolean" ? value.locked : false,
        clipSourceId: typeof value.clipSourceId === "string" ? value.clipSourceId : null,
        scaleX: "scaleX" in value ? value.scaleX : 1,
        scaleY: "scaleY" in value ? value.scaleY : 1,
        ...(kind === "group" ? {} : {}),
    };
}

function migrateLogo(raw: unknown): Record<string, unknown> {
    const value = isObject(raw) ? raw : {};
    const variants = Array.isArray(value.variants) ? value.variants : [];
    return { ...clone(DEFAULT_LOGO), ...value, presentation: isObject(value.presentation) ? { ...clone(DEFAULT_LOGO.presentation), ...value.presentation } : clone(DEFAULT_LOGO.presentation), safeArea: isObject(value.safeArea) ? value.safeArea : clone(DEFAULT_LOGO.safeArea), variants, activeVariantId: typeof value.activeVariantId === "string" ? value.activeVariantId : (isObject(variants[0]) && typeof variants[0].id === "string" ? variants[0].id : null) };
}

function valueOrEmpty(value: Record<string, unknown>): Record<string, unknown> {
    return value;
}

export function migrateCreativeDocument(value: unknown): unknown {
    if (!isObject(value) || value.format !== CREATIVE_DOCUMENT_FORMAT || value.version !== LEGACY_CREATIVE_DOCUMENT_VERSION) return value;
    const migratedLayers = Array.isArray(value.layers) ? value.layers.map(migrateLayer) : [];
    const migrateHistory = Array.isArray(value.history) ? value.history.map((entry) => {
        const item = isObject(entry) ? entry : {};
        return {
            ...item,
            canvas: migrateCanvas(item.canvas),
            layers: Array.isArray(item.layers) ? item.layers.map(migrateLayer) : [],
            presets: Array.isArray(item.presets) ? item.presets : [],
            logo: migrateLogo(item.logo),
        };
    }) : [];
    return {
        ...value,
        version: CREATIVE_DOCUMENT_VERSION,
        canvas: migrateCanvas(value.canvas),
        layers: migratedLayers,
        history: migrateHistory,
            presets: Array.isArray(value.presets) ? value.presets.map((preset) => {
                const item = isObject(preset) ? preset : {};
                return { ...item, canvas: migrateCanvas(item.canvas), layers: Array.isArray(item.layers) ? item.layers.map(migrateLayer) : [] };
            }) : [],
        logo: migrateLogo(value.logo),
    };
}

export function exportCreativeDocument(document: CreativeAppearanceDocument): string {
    if (!validateCreativeDocument(document)) throw new Error("The creative document is not valid and cannot be exported.");
    return JSON.stringify(document, null, 2);
}

export function safeCreativeCapabilities(capabilities: Partial<CreativeAppearanceCapabilities> = {}): CreativeAppearanceCapabilities {
    return { ...DEFAULT_CREATIVE_CAPABILITIES, ...capabilities, reasonByCapability: { ...capabilities.reasonByCapability } };
}

export function validateCreativeAssetBytes(bytes: Uint8Array, mime = ""): CreativeAssetValidation {
    if (bytes.byteLength > CREATIVE_LIMITS.maxAssetBytes) throw new Error("The image is larger than the 8 MB safety limit.");
    if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        const width = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16);
        const height = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20);
        if (width * height > CREATIVE_LIMITS.maxAssetPixels) throw new Error("The image exceeds the 16 megapixel safety limit.");
        return { format: "png", width, height, frames: 1, mime: mime || "image/png" };
    }
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        const animated = bytes.length >= 25 && bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58 && (bytes[20]! & 0x02) !== 0;
        if (animated || bytes.includes(0x41) && bytes.includes(0x4e) && bytes.includes(0x49) && bytes.includes(0x4d)) throw new Error("Animated images are not supported.");
        return { format: "webp", width: 0, height: 0, frames: 1, mime: mime || "image/webp" };
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        let width = 0;
        let height = 0;
        for (let offset = 2; offset + 9 < bytes.length;) {
            if (bytes[offset] !== 0xff) { offset += 1; continue; }
            const marker = bytes[offset + 1]!;
            const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
            if (marker >= 0xc0 && marker <= 0xc3) {
                height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
                width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
                break;
            }
            offset += Math.max(2, length + 2);
        }
        if (width > 0 && height > 0 && width * height > CREATIVE_LIMITS.maxAssetPixels) throw new Error("The image exceeds the 16 megapixel safety limit.");
        return { format: "jpeg", width, height, frames: 1, mime: mime || "image/jpeg" };
    }
    const text = new TextDecoder().decode(bytes).trimStart();
    if (text.startsWith("<svg") && !/<script|foreignObject|https?:\/\//i.test(text)) return { format: "svg", width: 0, height: 0, frames: 1, mime: mime || "image/svg+xml" };
    throw new Error("The selected file is not a supported PNG, JPEG, WebP, or safe SVG image.");
}

export async function importCreativeAsset(file: File, document: CreativeAppearanceDocument): Promise<CreativeAppearanceDocument> {
    if (file.size > CREATIVE_LIMITS.maxAssetBytes) throw new Error("The image is larger than the 8 MB safety limit.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateCreativeAssetBytes(bytes, file.type);
    if (validation.frames > CREATIVE_LIMITS.maxAssetFrames) throw new Error("Animated images are not supported.");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    const dataUrl = `data:${file.type || validation.mime};base64,${btoa(binary)}`;
    return addCreativeLayer(document, createRasterLayer(validation, dataUrl), "import image");
}
