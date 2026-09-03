import { validateLogoBytes } from "../../appLogo/logoValidation.js";
import {
    logoStore,
    resetLogoToShipped,
    selectLogoPreset,
    setCustomLogo,
    setCreativeOwnedLogo,
    updateLogoBackground,
    updateLogoCrop,
    updateLogoFit,
    updateLogoFocalPoint,
    type LogoCustomMark,
} from "../../appLogo/logoStore.js";
import { LOGO_PRESET_IDS, type LogoPresetId } from "../../appLogo/logoPresets.js";
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

function presentationFromStore() {
    return {
        presetId: logoStore.presetId,
        crop: { ...logoStore.crop },
        fit: logoStore.fit,
        focalPoint: { ...logoStore.focalPoint },
        background: logoStore.background,
        backgroundColor: logoStore.backgroundColor,
    };
}

/**
 * Applies a generated variant through the same logoStore used by AppLogoRow and the title bar.
 * Validation happens before the store is touched, and the prior selection is restored if the
 * store write throws, so the creative canvas never leaves chrome pointing at a half-mark.
 */
export function applyCreativeLogoVariant(
    document: CreativeAppearanceDocument,
    variant: CreativeLogoVariantInput,
): CreativeAppearanceDocument {
    const bytes = svgBytes(variant.dataUrl);
    const validation = validateLogoBytes(bytes);
    if (!validation.ok || validation.image.format !== "svg")
        throw new Error("The generated logo variant failed the app-logo byte validation.");
    const prior = {
        custom: logoStore.custom,
        presetId: logoStore.presetId,
        crop: logoStore.crop,
        fit: logoStore.fit,
        focalPoint: logoStore.focalPoint,
        background: logoStore.background,
        backgroundColor: logoStore.backgroundColor,
    };
    const mark: LogoCustomMark = {
        dataUrl: variant.dataUrl,
        format: "svg",
        width: variant.width,
        height: variant.height,
    };
    const ownsStore =
        document.logo.target === "app-logo" &&
        (document.logo.ownership === null
            ? logoStore.ownership === null
            : logoStore.ownership?.token === document.logo.ownership.token &&
              logoStore.ownership.revision === document.logo.ownership.revision);
    try {
        const variants = [
            ...document.logo.variants.filter((candidate) => candidate.id !== variant.id),
            variant,
        ].slice(-8);
        const ownership =
            document.logo.target === "app-logo" && ownsStore
                ? {
                      token:
                          document.logo.ownership?.token ?? `creative-${Date.now().toString(36)}`,
                      revision: (document.logo.ownership?.revision ?? 0) + 1,
                  }
                : null;
        const next = setCreativeLogo(document, {
            enabled: true,
            activeVariantId: variant.id,
            variants,
            ownership,
            presentation: presentationFromStore(),
        });
        if (document.logo.target !== "app-logo" || !ownsStore) return next;
        setCreativeOwnedLogo(mark, ownership!);
        return next;
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

export function resetCreativeLogoPipeline(
    document: CreativeAppearanceDocument,
): CreativeAppearanceDocument {
    if (document.logo.target === "app-logo") resetLogoToShipped();
    return setCreativeLogo(document, {
        enabled: false,
        target: "appearance-target",
        activeVariantId: null,
        variants: [],
    });
}

/** Replays a logo snapshot during creative undo or redo without creating a second document edit. */
export function syncCreativeLogoStore(document: CreativeAppearanceDocument): void {
    if (document.logo.target !== "app-logo") return;
    if (
        !document.logo.enabled ||
        document.logo.variants.length === 0 ||
        document.logo.activeVariantId === null
    ) {
        const priorOwnership = logoStore.ownership;
        resetLogoToShipped();
        if (priorOwnership !== null)
            logoStore.ownership = document.logo.ownership ?? priorOwnership;
        return;
    }
    const variant = document.logo.variants.find(
        (candidate) => candidate.id === document.logo.activeVariantId,
    );
    if (!variant) return;
    const bytes = svgBytes(variant.dataUrl);
    const validation = validateLogoBytes(bytes);
    if (!validation.ok || validation.image.format !== "svg")
        throw new Error(
            "The saved logo variant failed the app-logo byte validation during history replay.",
        );
    const ownership = document.logo.ownership;
    if (ownership === null) return;
    if (
        logoStore.ownership?.token !== ownership.token ||
        logoStore.ownership?.revision !== ownership.revision
    )
        return;
    if ((LOGO_PRESET_IDS as readonly string[]).includes(document.logo.presentation.presetId))
        selectLogoPreset(document.logo.presentation.presetId as LogoPresetId);
    updateLogoCrop(document.logo.presentation.crop);
    updateLogoFit(document.logo.presentation.fit);
    updateLogoFocalPoint(document.logo.presentation.focalPoint);
    updateLogoBackground(
        document.logo.presentation.background,
        document.logo.presentation.backgroundColor,
    );
    setCreativeOwnedLogo(
        { dataUrl: variant.dataUrl, format: "svg", width: variant.width, height: variant.height },
        ownership,
    );
}

export function releaseCreativeLogoOwnership(
    previousTarget: CreativeAppearanceDocument["logo"]["target"],
    nextTarget: CreativeAppearanceDocument["logo"]["target"],
): void {
    if (previousTarget === "app-logo" && nextTarget !== "app-logo") resetLogoToShipped();
}
