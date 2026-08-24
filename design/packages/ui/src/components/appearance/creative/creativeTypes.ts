import type { TypographySpec } from "../typographySpec.js";

/** The persisted format identifier. It is deliberately independent of the app package name. */
export const CREATIVE_DOCUMENT_FORMAT = "worldlens-creative-appearance" as const;
export const CREATIVE_DOCUMENT_VERSION = 2 as const;
export const LEGACY_CREATIVE_DOCUMENT_VERSION = 1 as const;

export const CREATIVE_LIMITS = {
    maxLayers: 256,
    maxGroups: 64,
    maxNesting: 8,
    maxHistory: 80,
    maxNameLength: 96,
    maxTextLength: 8_000,
    maxCanvasPixels: 16_777_216,
    maxAssetBytes: 8 * 1024 * 1024,
    maxAssetPixels: 16_777_216,
    maxAssetFrames: 1,
} as const;

export type CreativeLayerKind = "group" | "raster" | "vector" | "text" | "gradient";
export type CreativeBlendMode =
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | "color-dodge"
    | "color-burn"
    | "hard-light"
    | "soft-light"
    | "difference";
export type CreativeVectorShape = "rect" | "ellipse" | "line";

export interface CreativeCanvas {
    readonly width: number;
    readonly height: number;
    readonly background: string;
    readonly crop: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
    readonly rulers: boolean;
    readonly guides: readonly { readonly id: string; readonly axis: "x" | "y"; readonly position: number }[];
    readonly grid: { readonly enabled: boolean; readonly size: number; readonly snap: boolean };
    readonly safeArea: { readonly inset: number; readonly enabled: boolean };
}

export interface CreativeEffectStack {
    readonly blur: number;
    readonly brightness: number;
    readonly contrast: number;
    readonly saturation: number;
    readonly hue: number;
    readonly grayscale: number;
    readonly sepia: number;
    readonly invert: number;
    readonly shadow: {
        readonly x: number;
        readonly y: number;
        readonly blur: number;
        readonly color: string;
    };
    readonly innerGlow: { readonly radius: number; readonly color: string };
    readonly outerGlow: { readonly radius: number; readonly color: string };
}

export interface CreativeMask {
    readonly enabled: boolean;
    readonly kind: "rectangle" | "ellipse";
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly feather: number;
}

export interface CreativeLayerBase {
    readonly id: string;
    readonly name: string;
    readonly kind: CreativeLayerKind;
    readonly parentId: string | null;
    readonly visible: boolean;
    readonly opacity: number;
    readonly blendMode: CreativeBlendMode;
    readonly clipped: boolean;
    readonly locked: boolean;
    readonly mask: CreativeMask | null;
    readonly effects: CreativeEffectStack;
}

export interface CreativeGroupLayer extends CreativeLayerBase {
    readonly kind: "group";
}

export interface CreativeRasterLayer extends CreativeLayerBase {
    readonly kind: "raster";
    readonly dataUrl: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly flipX: boolean;
    readonly flipY: boolean;
}

export interface CreativeVectorLayer extends CreativeLayerBase {
    readonly kind: "vector";
    readonly shape: CreativeVectorShape;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly fill: string;
    readonly stroke: string;
    readonly strokeWidth: number;
}

export interface CreativeTextLayer extends CreativeLayerBase {
    readonly kind: "text";
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly fill: string;
    readonly typography: Partial<TypographySpec>;
}

export interface CreativeGradientLayer extends CreativeLayerBase {
    readonly kind: "gradient";
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly angle: number;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly stops: readonly { readonly offset: number; readonly color: string }[];
}

export type CreativeLayer =
    | CreativeGroupLayer
    | CreativeRasterLayer
    | CreativeVectorLayer
    | CreativeTextLayer
    | CreativeGradientLayer;

export interface CreativeHistoryEntry {
    readonly id: string;
    readonly action: string;
    readonly timestamp: string;
    readonly canvas: CreativeCanvas;
    readonly layers: readonly CreativeLayer[];
    readonly selectedLayerIds: readonly string[];
    readonly presets: readonly CreativePreset[];
    readonly logo: CreativeLogoComposition;
}

export interface CreativeAppearanceDocument {
    readonly format: typeof CREATIVE_DOCUMENT_FORMAT;
    readonly version: typeof CREATIVE_DOCUMENT_VERSION;
    readonly canvas: CreativeCanvas;
    readonly layers: readonly CreativeLayer[];
    readonly selectedLayerIds: readonly string[];
    readonly history: readonly CreativeHistoryEntry[];
    readonly historyCursor: number;
    readonly presets: readonly CreativePreset[];
    readonly logo: CreativeLogoComposition;
}

export interface CreativePreset {
    readonly id: string;
    readonly name: string;
    readonly canvas: CreativeCanvas;
    readonly layers: readonly CreativeLayer[];
}

export interface CreativeLogoComposition {
    readonly enabled: boolean;
    readonly target: "app-logo" | "appearance-target";
    readonly safeArea: { readonly inset: number; readonly enabled: boolean };
    readonly variants: readonly { readonly id: string; readonly width: number; readonly height: number; readonly dataUrl: string }[];
}

/**
 * Capability truth is kept separate from the editor. A control remains visible when false,
 * and the reason is displayed beside it instead of silently dropping the saved value.
 */
export interface CreativeAppearanceCapabilities {
    readonly raster: boolean;
    readonly vector: boolean;
    readonly text: boolean;
    readonly gradient: boolean;
    readonly masks: boolean;
    readonly filters: boolean;
    readonly reasonByCapability: Readonly<Record<string, string>>;
}

export const DEFAULT_CREATIVE_CAPABILITIES: CreativeAppearanceCapabilities = {
    raster: true,
    vector: true,
    text: true,
    gradient: true,
    masks: true,
    filters: true,
    reasonByCapability: {},
};

export interface CreativeImportResult {
    readonly document: CreativeAppearanceDocument;
    readonly warnings: readonly string[];
}

export interface CreativeAssetValidation {
    readonly format: "png" | "jpeg" | "webp" | "svg";
    readonly width: number;
    readonly height: number;
    readonly frames: number;
    readonly mime: string;
}
