/**
 * The window itself.
 *
 * `AppTitleBar` is the application's own caption bar, drawn because the Electron window
 * is frameless and the operating system's grey strip is never shown as product chrome.
 * Mount it once, as a direct child of `v-app` and above `v-main`; it renders nothing at
 * all in a browser build, where there is no window to minimise or close.
 *
 * The rest is exported for tests and for anything that needs the window state without
 * the bar.
 */

export { default as AppTitleBar } from "./AppTitleBar.vue";

export { createWindowControls, resolveWindowBridge } from "./windowControls.js";
export type { WindowBridge, WindowControls } from "./windowControls.js";

export { onRevealRequested, requestReveal, resetRevealRequests, revealCount } from "./revealRequests.js";
export type { RevealRequest } from "./revealRequests.js";

/*
 * The Material Design 3 shell: the application rail, Home's five catalogues, a catalogue page, and
 * the Work host around the existing tab system. Everything else in this folder is the data and
 * state they read - the manifest, the job registry, the capability gate, the live meta resolvers,
 * the activation controller and the workspace migration.
 */
export { default as AppRail } from "./AppRail.vue";
export { default as HomeCatalogues } from "./HomeCatalogues.vue";
export { default as CataloguePage } from "./CataloguePage.vue";
export { default as WorkPane } from "./WorkPane.vue";

export { CATALOGUES, ALL_CATALOGUE_FEATURES, findCatalogue, findFeature } from "./catalogues.js";
export { CATALOGUE_IDS, describeTarget, targetDestination, unwrapTarget } from "./featureTargets.js";
export type {
    CatalogueDefinition,
    CatalogueFeatureDefinition,
    CatalogueId,
    FeatureTarget,
    RailDestination,
} from "./featureTargets.js";
export { JOB_DEFINITIONS, JOB_IDS, JOB_SEED_GROUPS, findJob, isRailPageId } from "./jobRegistry.js";
export type { JobDefinition, JobId } from "./jobRegistry.js";
export { capabilityAvailable, capabilityState, knownCapabilities } from "./capabilities.js";
export { resolveMeta, knownMetaResolvers } from "./catalogueMeta.js";
export type { CatalogueMetaSources } from "./catalogueMeta.js";
export { createShellNavigation } from "./shellNavigation.js";
export type { ShellNavigation, ShellNavigationHost } from "./shellNavigation.js";
export {
    markMigrationRan,
    migrateWorkspace,
    migrationAlreadyRan,
    WORK_DEFAULT_PLACEMENT,
} from "./tabWorkspaceMigration.js";
