export { default as MarkerMenu } from "./MarkerMenu.vue";
export { default as MarkerRow } from "./MarkerRow.vue";
export { default as MarkerSetRow } from "./MarkerSetRow.vue";
export { default as MarkerSearchField } from "./MarkerSearchField.vue";
export { default as RegexBuilder } from "./RegexBuilder.vue";
export { default as StudioMarkerLayerHost } from "./StudioMarkerLayerHost.vue";

export {
    MAX_PATTERN_LENGTH,
    compileSearchPattern,
    countListedMarkerSets,
    countListedMarkers,
    createMarkerMatcher,
    distanceToSquared,
    filterMarkerSets,
    filterMarkers,
    findMarkerSetById,
    findPathToSet,
    includesCI,
    isMarkerSetActive,
    markerDisplayLabel,
    markerSearchFields,
} from "./markerFilter.js";
export type { MarkerMatcher, SearchMode, SortOrder } from "./markerFilter.js";

export {
    MAX_EVAL_MS,
    MAX_MATCHES,
    MAX_SAMPLE_LENGTH,
    SUPPORTED_FLAGS,
    compilePreviewPattern,
    escapeLiteral,
    evaluatePattern,
} from "./regexEngine.js";
export type { RegexEvaluation, RegexMatch, SupportedFlag } from "./regexEngine.js";

export type { AnyMarkerData, AnyMarkerSetData, Vec3Like } from "./markerTypes.js";

export {
    DEFAULT_MARKER_COLOUR,
    MARKER_STUDIO_SET_ID,
    MARKER_XZ_LIMIT,
    MARKER_Y_MAX,
    MARKER_Y_MIN,
    createMarker,
    draftFrom,
    editMarker,
    emptyDraft,
    markerProblems,
    markerSearchText,
    toMarkerSetData,
    exportStudioMarkers,
    filterStudioMarkers,
    importStudioMarkers,
    toViewerMarkerData,
    validateStudioDocument,
} from "./markerStudio.js";
export type { MarkerDraft, MarkerPosition, MarkerProblem, MarkerResult, StudioMarker } from "./markerStudio.js";
export {
    addMarker,
    duplicateMarker,
    exportMarkers,
    importMarkers,
    restoreMarkers,
    markerStudioStore,
    markersFor,
    removeMarker,
    removeMarkers,
    setMarkerVisible,
    updateMarker,
} from "./markerStudioStore.js";
