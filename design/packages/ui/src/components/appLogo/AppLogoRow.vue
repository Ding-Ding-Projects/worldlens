<script setup lang="ts">
/**
 * The app-logo customization row: a shipped preset or a locally chosen file, its crop,
 * fit, focal point and background, and previews at every size this application actually
 * draws its own mark at.
 *
 * Picking, validating and committing a custom mark all route through `logoStore.ts`, which
 * is the one place a candidate file's bytes are validated, converted to a `data:` URL and
 * cached; this component never touches `localStorage` directly, the same separation
 * `VocabularyUploadRow.vue` keeps from `vocabularyStore.ts`.
 *
 * ## Review before commit
 *
 * A file that passes validation is not applied immediately. It sits in `pending` until the
 * person presses "Use this file", so any conversion notice - today, only the one JPEG has
 * no transparency - is read before it becomes the active mark rather than after, and
 * cancelling leaves whatever was active before completely untouched.
 *
 * ## Presentation only
 *
 * Nothing in this row, and nothing in `logoStore.ts` underneath it, can reach the
 * application's package identity, executable filename, installer identity, update feed or
 * data directory. Changing the picture changes the picture; `appLogo.identity.note` says so
 * on screen rather than leaving it as an assumption nobody stated.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiRestore, mdiUpload } from "@mdi/js";
import { VAlert, VBtn, VColorPicker, VLabel, VTextField } from "vuetify/components";
import { LOGO_PRESETS, logoPresetById, logoPresetLabel, type LogoPresetId } from "./logoPresets.js";
import { validateLogoBytes, type LogoImageFormat, type LogoRejectionReason } from "./logoValidation.js";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import {
    logoStore,
    resetLogoToShipped,
    selectLogoPreset,
    setCustomLogo,
    updateLogoBackground,
    updateLogoCrop,
    updateLogoFit,
    updateLogoFocalPoint,
    type LogoBackground,
    type LogoCrop,
    type LogoFit,
    type LogoFocalPoint,
} from "./logoStore.js";

const { t } = useI18n();

interface PendingLogo {
    readonly dataUrl: string;
    readonly format: LogoImageFormat;
    readonly width: number | null;
    readonly height: number | null;
    /** A conversion notice that has to be read before this can be applied, if any. */
    readonly notice: string | null;
}

const fileInput = ref<HTMLInputElement | null>(null);
/** Set only while a validated file is waiting for the person to review and confirm it. */
const pending = ref<PendingLogo | null>(null);
/** Set only while a just-picked file has been rejected, cleared by the next pick or reset. */
const rejection = ref<LogoRejectionReason | null>(null);
/** Set only right after a reset, so the confirmation is a moment rather than a permanent state. */
const resetConfirmed = ref(false);

/**
 * A literal `t()` call per branch rather than a key assembled from `reason`, the same
 * reason `VocabularyUploadRow.vue`'s own `reasonText` is written this way: the catalogue
 * coverage guard reads the source for literal calls and cannot follow a key built at
 * runtime.
 */
function reasonText(reason: LogoRejectionReason): string {
    switch (reason) {
        case "too-large":
            return t("appLogo.reason.too-large", "the file is larger than this app allows");
        case "unsupported-format":
            return t(
                "appLogo.reason.unsupported-format",
                "the file is not a PNG, JPEG, WebP or SVG image",
            );
        case "malformed":
            return t(
                "appLogo.reason.malformed",
                "the file's bytes do not match a valid image of its own format",
            );
        case "dimension-too-large":
            return t(
                "appLogo.reason.dimension-too-large",
                "the image is wider or taller than this app allows",
            );
        case "too-many-pixels":
            return t(
                "appLogo.reason.too-many-pixels",
                "the image has more pixels than this app allows",
            );
        case "animated-not-supported":
            return t(
                "appLogo.reason.animated-not-supported",
                "the image is animated, and an app mark must be a single still image",
            );
        case "svg-unsafe-content":
            return t(
                "appLogo.reason.svg-unsafe-content",
                "the SVG file contains script or event-handler content this app will not accept",
            );
        case "read-failed":
            return t("appLogo.reason.read-failed", "the file could not be read from disk");
    }
}

const invalidMessage = computed(() =>
    rejection.value === null
        ? ""
        : t(
              "appLogo.status.invalid",
              { reason: reasonText(rejection.value) },
              "That file was not applied: {reason} The mark already active was not changed.",
          ),
);

const resetMessage = computed(() =>
    t(
        "appLogo.status.resetDone",
        "Reset to the shipped mark. Every crop, fit and background choice is back to its own default.",
    ),
);

const activeSrc = computed(() =>
    logoStore.custom !== null ? logoStore.custom.dataUrl : logoPresetById(logoStore.presetId).src,
);

const statusMessage = computed(() => {
    if (logoStore.custom !== null) {
        return t(
            "appLogo.status.usingCustom",
            {
                format: logoStore.custom.format,
                width: logoStore.custom.width ?? "?",
                height: logoStore.custom.height ?? "?",
            },
            "Using your custom mark: {format}, {width}x{height}.",
        );
    }
    return t("appLogo.status.usingShipped", "Using the shipped mark. No custom logo is active.");
});

const statusSeverity = computed<"success" | "warning" | "info">(() => {
    if (rejection.value !== null) return "warning";
    if (resetConfirmed.value) return "success";
    return logoStore.custom !== null ? "success" : "info";
});

const pickLabel = computed(() =>
    logoStore.custom !== null
        ? t("appLogo.picker.replaceFile", "Replace the logo file...")
        : t("appLogo.picker.chooseFile", "Choose a logo file..."),
);

function openPicker(): void {
    fileInput.value?.click();
}

function selectPreset(id: LogoPresetId): void {
    selectLogoPreset(id);
    pending.value = null;
    rejection.value = null;
    resetConfirmed.value = false;
}

/** Every byte, exactly as read - no rasterization happens here, only base64 framing. */
function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ?? 0);
    return `data:${mime};base64,${btoa(binary)}`;
}

const MIME_BY_FORMAT: Record<LogoImageFormat, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
};

async function onFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset the input's own value so choosing the same filename twice in a row still fires
    // a change event the second time, which browsers otherwise suppress.
    input.value = "";
    if (file === undefined) return;

    resetConfirmed.value = false;
    pending.value = null;

    let buffer: ArrayBuffer;
    try {
        buffer = await file.arrayBuffer();
    } catch {
        rejection.value = "read-failed";
        return;
    }

    const bytes = new Uint8Array(buffer);
    // Bytes only - `file.type` and the picked filename's extension are never consulted,
    // per the "verify the actual bytes" contract.
    const result = validateLogoBytes(bytes);
    if (!result.ok) {
        rejection.value = result.reason;
        return;
    }

    rejection.value = null;
    const notice =
        result.image.format === "jpeg"
            ? t(
                  "appLogo.status.conversionNotice",
                  {
                      detail: t(
                          "appLogo.notice.jpegNoTransparency",
                          "JPEG has no transparency, so a transparent background choice will show this image's own background instead.",
                      ),
                  },
                  "Before this applies: {detail}",
              )
            : null;

    pending.value = {
        dataUrl: bytesToDataUrl(bytes, MIME_BY_FORMAT[result.image.format]),
        format: result.image.format,
        width: result.image.width,
        height: result.image.height,
        notice,
    };
}

function applyPending(): void {
    if (pending.value === null) return;
    setCustomLogo({
        dataUrl: pending.value.dataUrl,
        format: pending.value.format,
        width: pending.value.width,
        height: pending.value.height,
    });
    pending.value = null;
}

/** The reviewed file is discarded; whatever was active before stays exactly as it was. */
function cancelPending(): void {
    pending.value = null;
}

function onReset(): void {
    resetLogoToShipped();
    pending.value = null;
    rejection.value = null;
    resetConfirmed.value = true;
}

function updateCropField(field: keyof LogoCrop, raw: string | number): void {
    const value = typeof raw === "number" ? raw : Number.parseFloat(raw);
    const clamped = Math.min(40, Math.max(0, Number.isFinite(value) ? value : 0));
    const next: LogoCrop = { ...logoStore.crop, [field]: clamped };
    updateLogoCrop(next);
    resetConfirmed.value = false;
}

function updateFocalField(field: keyof LogoFocalPoint, raw: string | number): void {
    const value = typeof raw === "number" ? raw : Number.parseFloat(raw);
    const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
    const next: LogoFocalPoint = { ...logoStore.focalPoint, [field]: clamped };
    updateLogoFocalPoint(next);
    resetConfirmed.value = false;
}

function setFit(fit: LogoFit): void {
    updateLogoFit(fit);
    resetConfirmed.value = false;
}

function setBackground(background: LogoBackground): void {
    updateLogoBackground(background, logoStore.backgroundColor);
    resetConfirmed.value = false;
}

function setBackgroundColor(color: string): void {
    updateLogoBackground(logoStore.background, color);
    resetConfirmed.value = false;
}

function previewContainerStyle(size: number): Record<string, string> {
    return {
        width: `${size}px`,
        height: `${size}px`,
        background: logoStore.background === "solid" ? logoStore.backgroundColor : "transparent",
    };
}

const imageStyle = computed<Record<string, string>>(() => {
    const crop = logoStore.crop;
    const focal = logoStore.focalPoint;
    return {
        top: `${crop.top}%`,
        left: `${crop.left}%`,
        right: `${crop.right}%`,
        bottom: `${crop.bottom}%`,
        width: `calc(100% - ${crop.left + crop.right}%)`,
        height: `calc(100% - ${crop.top + crop.bottom}%)`,
        objectFit: logoStore.fit,
        objectPosition: `${focal.x}% ${focal.y}%`,
    };
});

const PREVIEW_SIZES = [24, 64, 256] as const;

function previewCaption(size: (typeof PREVIEW_SIZES)[number]): string {
    switch (size) {
        case 24:
            return t("appLogo.preview.titleBar", "Title bar (24px)");
        case 64:
            return t("appLogo.preview.settings", "Settings row (64px)");
        case 256:
            return t("appLogo.preview.about", "About screen (256px)");
    }
}
</script>

<template>
    <AppearanceTarget id="app.logo" label="Application logo" as="div">
    <div class="mb-applogo-row">
        <VAlert
            :type="statusSeverity"
            variant="tonal"
            density="comfortable"
            role="status"
            class="mb-applogo-row__status"
        >
            <span v-if="rejection !== null">{{ invalidMessage }}</span>
            <span v-else-if="resetConfirmed">{{ resetMessage }}</span>
            <span v-else>{{ statusMessage }}</span>
        </VAlert>

        <p class="mb-applogo-row__identity-note">
            {{
                t(
                    "appLogo.identity.note",
                    "This changes the picture only. The application's package identity, executable filename, installer identity, update feed and data directory never move because a picture changed.",
                )
            }}
        </p>

        <fieldset class="mb-applogo-row__presets">
            <legend>{{ t("appLogo.preset.groupLabel", "Shipped presets") }}</legend>
            <VBtn
                v-for="preset in LOGO_PRESETS"
                :key="preset.id"
                class="mb-applogo-row__preset-tile"
                variant="text"
                :class="{
                    'mb-applogo-row__preset-tile--active':
                        logoStore.custom === null && logoStore.presetId === preset.id,
                }"
                :aria-pressed="logoStore.custom === null && logoStore.presetId === preset.id"
                @click="selectPreset(preset.id)"
            >
                <img :src="preset.src" :alt="logoPresetLabel(t, preset.id)" width="40" height="40" />
                <span>{{ logoPresetLabel(t, preset.id) }}</span>
            </VBtn>
        </fieldset>

        <div class="mb-applogo-row__actions">
            <VBtn :prepend-icon="mdiUpload" size="small" variant="tonal" @click="openPicker">
                {{ pickLabel }}
            </VBtn>
            <VBtn :prepend-icon="mdiRestore" size="small" variant="text" @click="onReset">
                {{ t("appLogo.action.reset", "Reset to shipped mark") }}
            </VBtn>
            <input
                ref="fileInput"
                class="mb-applogo-row__file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                :aria-label="t('appLogo.picker.fileInputLabel', 'Custom app logo image file')"
                @change="onFileChosen"
            />
        </div>

        <div v-if="pending !== null" class="mb-applogo-row__pending">
            <VAlert
                v-if="pending.notice !== null"
                type="info"
                variant="tonal"
                density="comfortable"
                class="mb-applogo-row__pending-notice"
            >
                <span>{{ pending.notice }}</span>
            </VAlert>
            <img :src="pending.dataUrl" alt="" width="64" height="64" class="mb-applogo-row__pending-preview" />
            <div class="mb-applogo-row__pending-actions">
                <VBtn size="small" variant="tonal" @click="applyPending">
                    {{ t("appLogo.action.apply", "Use this file") }}
                </VBtn>
                <VBtn size="small" variant="text" @click="cancelPending">
                    {{ t("appLogo.action.cancel", "Cancel") }}
                </VBtn>
            </div>
        </div>

        <fieldset class="mb-applogo-row__crop">
            <legend>{{ t("appLogo.crop.title", "Crop") }}</legend>
            <VTextField
                type="number"
                min="0"
                max="40"
                density="compact"
                class="mb-applogo-row__number"
                :model-value="logoStore.crop.top"
                :label="t('appLogo.crop.top', 'Top inset')"
                @update:model-value="(value) => updateCropField('top', value)"
            />
            <VTextField
                type="number"
                min="0"
                max="40"
                density="compact"
                class="mb-applogo-row__number"
                :model-value="logoStore.crop.right"
                :label="t('appLogo.crop.right', 'Right inset')"
                @update:model-value="(value) => updateCropField('right', value)"
            />
            <VTextField
                type="number"
                min="0"
                max="40"
                density="compact"
                class="mb-applogo-row__number"
                :model-value="logoStore.crop.bottom"
                :label="t('appLogo.crop.bottom', 'Bottom inset')"
                @update:model-value="(value) => updateCropField('bottom', value)"
            />
            <VTextField
                type="number"
                min="0"
                max="40"
                density="compact"
                class="mb-applogo-row__number"
                :model-value="logoStore.crop.left"
                :label="t('appLogo.crop.left', 'Left inset')"
                @update:model-value="(value) => updateCropField('left', value)"
            />
        </fieldset>

        <fieldset class="mb-applogo-row__fit">
            <legend>{{ t("appLogo.fit.title", "Fit") }}</legend>
            <VBtn
                size="small"
                :variant="logoStore.fit === 'fill' ? 'tonal' : 'text'"
                :aria-pressed="logoStore.fit === 'fill'"
                @click="setFit('fill')"
            >
                {{ t("appLogo.fit.fill", "Fill") }}
            </VBtn>
            <VBtn
                size="small"
                :variant="logoStore.fit === 'contain' ? 'tonal' : 'text'"
                :aria-pressed="logoStore.fit === 'contain'"
                @click="setFit('contain')"
            >
                {{ t("appLogo.fit.contain", "Contain") }}
            </VBtn>
        </fieldset>

        <fieldset class="mb-applogo-row__focal">
            <legend>{{ t("appLogo.focal.title", "Focal point") }}</legend>
            <VTextField
                type="number"
                min="0"
                max="100"
                density="compact"
                class="mb-applogo-row__number"
                :model-value="logoStore.focalPoint.x"
                :label="t('appLogo.focal.x', 'Horizontal position')"
                @update:model-value="(value) => updateFocalField('x', value)"
            />
            <VTextField
                type="number"
                min="0"
                max="100"
                density="compact"
                class="mb-applogo-row__number"
                :model-value="logoStore.focalPoint.y"
                :label="t('appLogo.focal.y', 'Vertical position')"
                @update:model-value="(value) => updateFocalField('y', value)"
            />
        </fieldset>

        <fieldset class="mb-applogo-row__background">
            <legend>{{ t("appLogo.background.title", "Background") }}</legend>
            <VBtn
                size="small"
                :variant="logoStore.background === 'transparent' ? 'tonal' : 'text'"
                :aria-pressed="logoStore.background === 'transparent'"
                @click="setBackground('transparent')"
            >
                {{ t("appLogo.background.transparent", "Transparent") }}
            </VBtn>
            <VBtn
                size="small"
                :variant="logoStore.background === 'solid' ? 'tonal' : 'text'"
                :aria-pressed="logoStore.background === 'solid'"
                @click="setBackground('solid')"
            >
                {{ t("appLogo.background.solid", "Solid colour") }}
            </VBtn>
            <div v-if="logoStore.background === 'solid'" class="mb-applogo-row__color-label">
                <VLabel>{{ t("appLogo.background.colorLabel", "Background colour") }}</VLabel>
                <VColorPicker
                    :model-value="logoStore.backgroundColor"
                    hide-inputs
                    show-swatches
                    width="280"
                    @update:model-value="setBackgroundColor"
                />
            </div>
        </fieldset>

        <div class="mb-applogo-row__previews">
            <p class="mb-applogo-row__safe-area-label">
                {{ t("appLogo.safeArea.label", "Safe-area preview") }}
            </p>
            <p class="mb-applogo-row__safe-area-description">
                {{
                    t(
                        "appLogo.safeArea.description",
                        "The dashed box shows the area every shipped surface keeps clear around the mark.",
                    )
                }}
            </p>

            <div class="mb-applogo-row__preview-group">
                <figure v-for="size in PREVIEW_SIZES" :key="size" class="mb-applogo-row__preview">
                    <div :style="previewContainerStyle(size)" class="mb-applogo-row__preview-box">
                        <div class="mb-applogo-row__safe-area" aria-hidden="true"></div>
                        <img :src="activeSrc" :style="imageStyle" alt="" class="mb-applogo-row__preview-image" />
                    </div>
                    <figcaption>{{ previewCaption(size) }}</figcaption>
                </figure>
            </div>
        </div>
    </div>
    </AppearanceTarget>
</template>

<style>
.mb-applogo-row {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.mb-applogo-row__status {
    overflow-wrap: anywhere;
}

.mb-applogo-row__identity-note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-applogo-row__presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    border: none;
    padding: 0;
    margin: 0;
}

.mb-applogo-row__presets legend {
    width: 100%;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0 0 4px;
}

.mb-applogo-row__preset-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px;
    min-inline-size: 44px;
    min-block-size: 44px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    font-size: 0.6875rem;
}

.mb-applogo-row__preset-tile--active {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.1);
}

.mb-applogo-row__preset-tile img {
    inline-size: 40px;
    block-size: 40px;
    object-fit: contain;
}

.mb-applogo-row__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

/*
 * Kept in the accessibility tree and reachable by keyboard through the visible button
 * above that clicks it, rather than `display: none`, which some assistive tech treats as
 * removed entirely. Same pattern as `VocabularyUploadRow.vue`'s own file input.
 */
.mb-applogo-row__file {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
}

.mb-applogo-row__pending {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border: 1px dashed rgba(var(--v-theme-on-surface), 0.3);
    border-radius: 8px;
}

.mb-applogo-row__pending-preview {
    inline-size: 64px;
    block-size: 64px;
    object-fit: contain;
}

.mb-applogo-row__pending-actions {
    display: flex;
    gap: 8px;
}

.mb-applogo-row__crop,
.mb-applogo-row__fit,
.mb-applogo-row__focal,
.mb-applogo-row__background {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    border: none;
    padding: 0;
    margin: 0;
}

.mb-applogo-row__crop legend,
.mb-applogo-row__fit legend,
.mb-applogo-row__focal legend,
.mb-applogo-row__background legend {
    width: 100%;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0 0 4px;
}

.mb-applogo-row__number {
    max-inline-size: 140px;
}

.mb-applogo-row__color-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
}

.mb-applogo-row__previews {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mb-applogo-row__safe-area-label {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
}

.mb-applogo-row__safe-area-description {
    margin: 0;
    font-size: 0.6875rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-applogo-row__preview-group {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 16px;
}

.mb-applogo-row__preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin: 0;
}

.mb-applogo-row__preview-box {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
    border-radius: 4px;
}

.mb-applogo-row__safe-area {
    position: absolute;
    inset: 10%;
    border: 1px dashed rgba(var(--v-theme-on-surface), 0.4);
    pointer-events: none;
}

.mb-applogo-row__preview-image {
    position: absolute;
}

.mb-applogo-row__preview figcaption {
    font-size: 0.625rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-align: center;
}
</style>
