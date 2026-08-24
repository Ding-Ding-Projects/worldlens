import { validateLogoBytes } from "../../appLogo/logoValidation.js";
import {
    logoStore,
    resetLogoToShipped,
    selectLogoPreset,
    setCustomLogo,
    type LogoCustomMark,
} from "../../appLogo/logoStore.js";
import { setCreativeLogo } from "./creativeDocument.js";
import type { CreativeAppearanceDocument } from "./creativeTypes.js";

export interface CreativeLogoVariantInput {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly dataUrl: string;
}

function svgBytes(dataUrl: string): Uint8Array {
    const match = /^data:image\/svg\+xml;charset=utf-8,(.+)$/i.exec(dataUrl);
    if (!match) throw new Error("The generated logo variant is not a local SVG data URL.");
    return new TextEncoder().encode(decodeURIComponent(match[1]!));
}

/**
 * Applies a generated variant through the same logoStore used by AppLogoRow and the title bar.
 * Validation happens before the store is touched, and the prior selection is restored if the
 * store write throws, so the creative canvas never leaves chrome pointing at a half-mark.
 */
export function applyCreativeLogoVariant(document: CreativeAppearanceDocument, variant: CreativeLogoVariantInput): CreativeAppearanceDocument {
    const bytes = svgBytes(variant.dataUrl);
    const validation = validateLogoBytes(bytes);
    if (!validation.ok || validation.image.format !== "svg") throw new Error("The generated logo variant failed the app-logo byte validation.");
    const prior = {
        custom: logoStore.custom,
        presetId: logoStore.presetId,
        crop: logoStore.crop,
        fit: logoStore.fit,
        focalPoint: logoStore.focalPoint,
        background: logoStore.background,
        backgroundColor: logoStore.backgroundColor,
    };
    const mark: LogoCustomMark = { dataUrl: variant.dataUrl, format: "svg", width: variant.width, height: variant.height };
    try {
        setCustomLogo(mark);
        return setCreativeLogo(document, { enabled: true, target: "app-logo" });
    } catch (error) {
        try {
            if (prior.custom !== null) setCustomLogo(prior.custom);
            else selectLogoPreset(prior.presetId);
            logoStore.crop = prior.crop;
            logoStore.fit = prior.fit;
            logoStore.focalPoint = prior.focalPoint;
            logoStore.background = prior.background;
            logoStore.backgroundColor = prior.backgroundColor;
        } catch {
            // Preserve the original failure. The store's own failure state remains authoritative.
        }
        throw error;
    }
}

export function resetCreativeLogoPipeline(document: CreativeAppearanceDocument): CreativeAppearanceDocument {
    resetLogoToShipped();
    return setCreativeLogo(document, { enabled: false, target: "appearance-target", variants: [] });
}
