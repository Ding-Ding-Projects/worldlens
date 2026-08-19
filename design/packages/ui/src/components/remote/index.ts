/**
 * Where a render runs, and everything needed to say it honestly.
 *
 * Mount {@link RunLocationCard} wherever a render is started. It resolves both Electron
 * bridges itself, decides for itself what this build can actually do, and never presents a
 * place it cannot really send work to.
 *
 * The shell is expected to do two things:
 *
 * - `update:target` carries the machine a remote render would use. Hand it to
 *   {@link createRenderRouter}, which is what makes `startRender` go over SSH without the
 *   progress panel learning that a network was involved.
 * - `openCi` asks for the surface that renders on GitHub's runners, which is a workflow of
 *   its own rather than a fourth radio button.
 */

export { default as RunLocationCard } from "./RunLocationCard.vue";
export { default as RemoteTargetEditor } from "./RemoteTargetEditor.vue";
export { default as RemotePreflightPanel } from "./RemotePreflightPanel.vue";
export { default as DockerStateNote } from "./DockerStateNote.vue";
/*
 * Publishing a finished render to that same machine, so the map keeps answering after this
 * application closes. It is exported here rather than kept folder-private because nothing
 * outside this folder could import it, which is why it shipped with no mount at all.
 */
export { default as RemoteHostingPanel } from "./RemoteHostingPanel.vue";
export { default as RemoteHostingScreen } from "./RemoteHostingScreen.vue";
export { default as DockerHostingScreen } from "./DockerHostingScreen.vue";
export { resolveDockerHostingBridge } from "./dockerHostingBridge.js";
export type {
    DockerHostingBridge,
    DockerHostingContainer,
    DockerHostingDaemonState,
    DockerHostingEvent,
    DockerHostingFailure,
    DockerHostingMutationResult,
    DockerHostingReadResult,
    DockerHostingRequest,
    DockerHostingSnapshot,
} from "./dockerHostingBridge.js";

export { describeDocker, dockerName, dockerNotProbed } from "./dockerStates.js";
export type { DockerNote, DockerTone } from "./dockerStates.js";

export {
    PREFLIGHT_STAGES,
    formatBytes,
    hostKeyDecision,
    offersAcceptance,
    preflightRows,
    stagePurpose,
    stageTitle,
} from "./preflightModel.js";
export type { HostKeyDecision, PreflightRow, PreflightRowState } from "./preflightModel.js";

export { resolveRemoteBridge, resolveRuntimeBridge } from "./remoteBridge.js";
export type {
    DockerStatus,
    DockerSummary,
    HostKeyOffer,
    PreflightCheck,
    PreflightReport,
    PreflightStage,
    RemoteBridge,
    RemoteDisclosure,
    RemoteFailure,
    RemoteRenderResult,
    RemoteTarget,
    RuntimeBridge,
    RuntimeMode,
    RuntimeModesSummary,
    TrustAnswer,
    ValidateAnswer,
} from "./remoteBridge.js";

export {
    filterHostingRenders,
    filterHostingTargets,
    hostingMapsForRender,
    hostingRecordForRender,
    loadRemoteHostingChoices,
} from "./hostingModel.js";
export type { RemoteHostingChoices } from "./hostingModel.js";

export {
    DEFAULT_SSH_PORT,
    DEFAULT_WORK_DIR,
    REMOTE_TARGET_STORAGE_VERSION,
    blankDraft,
    describeTarget,
    draftFromTarget,
    draftToTarget,
    holdsRefusedField,
    loadTargets,
    newTargetId,
    removeTarget,
    sanitiseStoredTarget,
    saveTargets,
    targetText,
    upsertTarget,
} from "./remoteTargets.js";
export type { RemoteTargetDraft, TargetStorage } from "./remoteTargets.js";

export { createRenderRouter } from "./renderRouter.js";
export type { RenderRoute, RenderRouter } from "./renderRouter.js";

export {
    DEFAULT_RUN_LOCATION,
    RUN_LOCATIONS,
    describeChoice,
    effectiveLocation,
    runPlaces,
} from "./runtimeChoice.js";
export type { RunLocation, RunPlace, RunPlaceInput, RunPlaceState } from "./runtimeChoice.js";
