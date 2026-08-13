export { default as AppLogoRow } from "./AppLogoRow.vue";

export {
    DEFAULT_LOGO_PRESET_ID,
    LOGO_PRESET_IDS,
    LOGO_PRESETS,
    logoPresetById,
    logoPresetLabel,
} from "./logoPresets.js";
export type { LogoPreset, LogoPresetId } from "./logoPresets.js";

export {
    LOGO_MAX_DECODED_PIXELS,
    LOGO_MAX_DIMENSION,
    LOGO_MAX_FRAME_COUNT,
    LOGO_MAX_INPUT_BYTES,
    validateLogoBytes,
} from "./logoValidation.js";
export type {
    LogoImageFormat,
    LogoRejectionReason,
    LogoValidatedImage,
    LogoValidationFailure,
    LogoValidationResult,
    LogoValidationSuccess,
} from "./logoValidation.js";

export {
    DEFAULT_BACKGROUND,
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_CROP,
    DEFAULT_FIT,
    DEFAULT_FOCAL_POINT,
    LOGO_STORAGE_KEY,
    logoStore,
    reloadLogoStore,
    resetLogoToShipped,
    selectLogoPreset,
    setCustomLogo,
    setLogoPersistence,
    updateLogoBackground,
    updateLogoCrop,
    updateLogoFit,
    updateLogoFocalPoint,
} from "./logoStore.js";
export type {
    LogoBackground,
    LogoCrop,
    LogoCustomMark,
    LogoFit,
    LogoFocalPoint,
} from "./logoStore.js";
