import {
    CREATIVE_DOCUMENT_FORMAT,
    CREATIVE_DOCUMENT_VERSION,
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
} from "./creativeTypes.js";
import { DEFAULT_TYPOGRAPHY, type TypographySpec } from "../typographySpec.js";

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

let sequence = 0;
function id(prefix: string): string {
    sequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
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
): CreativeHistoryEntry {
    return {
        id: id("history"),
        action,
        timestamp: new Date().toISOString(),
        canvas: clone(canvas),
        layers: clone(layers),
        selectedLayerIds: [...selectedLayerIds],
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
        history: [snapshot("document created", canvas, layers, selectedLayerIds)],
        historyCursor: 0,
    };
}

export function createCreativeDocument(
    canvas: Partial<CreativeCanvas> = {},
): CreativeAppearanceDocument {
    const width = clamp(canvas.width ?? 1024, 1, 4096);
    const height = clamp(canvas.height ?? 768, 1, 4096);
    return withInitialHistory(
        { width, height, background: canvas.background ?? "#202124" },
        [],
        [],
    );
}

export function createTextLayer(overrides: Partial<CreativeTextLayer> = {}): CreativeTextLayer {
    return {
        id: overrides.id ?? id("text"), name: cleanName(overrides.name ?? "Text", "Text"), kind: "text",
        parentId: overrides.parentId ?? null, visible: overrides.visible ?? true,
        opacity: clamp(overrides.opacity ?? 1, 0, 1), blendMode: overrides.blendMode ?? "normal",
        clipped: overrides.clipped ?? false, mask: overrides.mask ?? null,
        effects: clone(overrides.effects ?? DEFAULT_EFFECTS), text: (overrides.text ?? "Double-click to edit").slice(0, CREATIVE_LIMITS.maxTextLength),
        x: overrides.x ?? 96, y: overrides.y ?? 140, width: overrides.width ?? 640, height: overrides.height ?? 96,
        rotation: overrides.rotation ?? 0, fill: overrides.fill ?? "#f8f9fa",
        typography: clone(overrides.typography ?? ({ ...DEFAULT_TYPOGRAPHY } as Partial<TypographySpec>)),
    };
}

export function createVectorLayer(overrides: Partial<CreativeVectorLayer> = {}): CreativeVectorLayer {
    return {
        id: overrides.id ?? id("shape"), name: cleanName(overrides.name ?? "Shape", "Shape"), kind: "vector",
        parentId: overrides.parentId ?? null, visible: overrides.visible ?? true,
        opacity: clamp(overrides.opacity ?? 1, 0, 1), blendMode: overrides.blendMode ?? "normal",
        clipped: overrides.clipped ?? false, mask: overrides.mask ?? null,
        effects: clone(overrides.effects ?? DEFAULT_EFFECTS), shape: overrides.shape ?? "rect",
        x: overrides.x ?? 128, y: overrides.y ?? 192, width: overrides.width ?? 360, height: overrides.height ?? 180,
        rotation: overrides.rotation ?? 0, fill: overrides.fill ?? "#8ab4f8", stroke: overrides.stroke ?? "#ffffff",
        strokeWidth: clamp(overrides.strokeWidth ?? 2, 0, 64),
    };
}

export function createGradientLayer(overrides: Partial<CreativeGradientLayer> = {}): CreativeGradientLayer {
    return {
        id: overrides.id ?? id("gradient"), name: cleanName(overrides.name ?? "Gradient", "Gradient"), kind: "gradient",
        parentId: overrides.parentId ?? null, visible: overrides.visible ?? true,
        opacity: clamp(overrides.opacity ?? 1, 0, 1), blendMode: overrides.blendMode ?? "normal",
        clipped: overrides.clipped ?? false, mask: overrides.mask ?? null,
        effects: clone(overrides.effects ?? DEFAULT_EFFECTS), x: overrides.x ?? 0, y: overrides.y ?? 0,
        width: overrides.width ?? 1024, height: overrides.height ?? 768, angle: overrides.angle ?? 0,
        stops: clone(overrides.stops ?? [{ offset: 0, color: "#8ab4f8" }, { offset: 1, color: "#c58af9" }]),
    };
}

export function createCreativeLayer(kind: Exclude<CreativeLayer["kind"], "raster">): CreativeLayer {
    if (kind === "text") return createTextLayer();
    if (kind === "vector") return createVectorLayer();
    if (kind === "gradient") return createGradientLayer();
    return {
        id: id("group"), name: "Group", kind: "group", parentId: null, visible: true, opacity: 1,
        blendMode: "normal", clipped: false, mask: null, effects: clone(DEFAULT_EFFECTS),
    };
}

export function createRasterLayer(
    asset: CreativeAssetValidation,
    dataUrl: string,
    overrides: Partial<CreativeLayer> = {},
): CreativeLayer {
    return {
        id: id("image"), name: cleanName(overrides.name ?? "Imported image", "Imported image"), kind: "raster",
        parentId: overrides.parentId ?? null, visible: true, opacity: 1, blendMode: "normal", clipped: false, mask: null,
        effects: clone(DEFAULT_EFFECTS), dataUrl, x: 0, y: 0, width: asset.width, height: asset.height,
        rotation: 0, flipX: false, flipY: false,
    } as CreativeLayer;
}

export function commitCreativeChange(
    document: CreativeAppearanceDocument,
    next: Pick<CreativeAppearanceDocument, "canvas" | "layers" | "selectedLayerIds">,
    action: string,
): CreativeAppearanceDocument {
    const entry = snapshot(action, next.canvas, next.layers, next.selectedLayerIds);
    const retained = document.history.slice(0, document.historyCursor + 1);
    const history = [...retained, entry].slice(-CREATIVE_LIMITS.maxHistory);
    return {
        format: CREATIVE_DOCUMENT_FORMAT, version: CREATIVE_DOCUMENT_VERSION,
        canvas: clone(next.canvas), layers: clone(next.layers), selectedLayerIds: [...next.selectedLayerIds],
        history, historyCursor: history.length - 1,
    };
}

function fromHistory(document: CreativeAppearanceDocument, cursor: number): CreativeAppearanceDocument {
    const entry = document.history[cursor];
    if (entry === undefined) return document;
    return {
        ...document, canvas: clone(entry.canvas), layers: clone(entry.layers),
        selectedLayerIds: [...entry.selectedLayerIds], historyCursor: cursor,
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
    const selected = new Set(ids);
    const removedGroups = new Set(document.layers.filter((layer) => selected.has(layer.id) && layer.kind === "group").map((layer) => layer.id));
    const keep = document.layers.filter((layer) => !selected.has(layer.id) && !removedGroups.has(layer.parentId ?? ""));
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
    const reset = layer.kind === "text" ? createTextLayer({ id: layer.id, name: layer.name, parentId: layer.parentId })
        : layer.kind === "vector" ? createVectorLayer({ id: layer.id, name: layer.name, parentId: layer.parentId })
            : layer.kind === "gradient" ? createGradientLayer({ id: layer.id, name: layer.name, parentId: layer.parentId })
                : layer;
    return updateCreativeLayer(document, layerId, reset, "reset layer");
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validNumber(value: unknown, min = -1_000_000, max = 1_000_000): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validLayer(layer: unknown, depth: number): layer is CreativeLayer {
    if (!isObject(layer) || depth > CREATIVE_LIMITS.maxNesting) return false;
    if (typeof layer.id !== "string" || typeof layer.name !== "string" || typeof layer.kind !== "string") return false;
    if (layer.name.length > CREATIVE_LIMITS.maxNameLength || !["group", "raster", "vector", "text", "gradient"].includes(layer.kind)) return false;
    if (layer.parentId !== null && typeof layer.parentId !== "string") return false;
    if (typeof layer.visible !== "boolean" || !validNumber(layer.opacity, 0, 1) || !BLEND_MODES.includes(layer.blendMode as CreativeBlendMode)) return false;
    if (layer.kind === "text" && (typeof layer.text !== "string" || layer.text.length > CREATIVE_LIMITS.maxTextLength)) return false;
    if (layer.kind === "raster" && (typeof layer.dataUrl !== "string" || !/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i.test(layer.dataUrl))) return false;
    return true;
}

export function validateCreativeDocument(value: unknown): value is CreativeAppearanceDocument {
    if (!isObject(value) || value.format !== CREATIVE_DOCUMENT_FORMAT || value.version !== CREATIVE_DOCUMENT_VERSION) return false;
    const canvas = value.canvas;
    if (!isObject(canvas) || !validNumber(canvas.width, 1, 4096) || !validNumber(canvas.height, 1, 4096) || typeof canvas.background !== "string") return false;
    if (canvas.width * canvas.height > CREATIVE_LIMITS.maxCanvasPixels || !Array.isArray(value.layers) || value.layers.length > CREATIVE_LIMITS.maxLayers) return false;
    if (!value.layers.every((layer) => validLayer(layer, 0)) || !Array.isArray(value.selectedLayerIds) || !value.selectedLayerIds.every((id) => typeof id === "string")) return false;
    if (!Array.isArray(value.history) || value.history.length > CREATIVE_LIMITS.maxHistory || !validNumber(value.historyCursor, 0, value.history.length - 1)) return false;
    return true;
}

export function importCreativeDocument(text: string): CreativeImportResult {
    if (text.length > 12 * 1024 * 1024) throw new Error("The creative document is larger than the 12 MB safety limit.");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error("The creative document is not valid JSON."); }
    if (!validateCreativeDocument(parsed)) throw new Error("The creative document does not match the supported bounded format.");
    return { document: clone(parsed), warnings: [] };
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
        const animated = bytes.length >= 25 && bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58 && (bytes[20] & 0x02) !== 0;
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
