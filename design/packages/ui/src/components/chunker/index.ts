/**
 * Converting a Minecraft world, and choosing which machine does the converting.
 *
 * The page itself is `ChunkerScreen.vue`; the four execution routes are
 * {@link ChunkerRoutePicker}, which is mountable on its own so the page decides where in
 * its layout the question belongs.
 *
 * The picker resolves its own bridges, decides for itself which of the four routes this
 * build can honour, and leaves every one of them on screen - an unavailable route is
 * disabled with the exact reason beside it rather than hidden. It starts nothing: it emits
 * `update:route` when a route is chosen and `fix` when somebody presses the button that
 * would clear a refusal, and the shell is expected to open the settings row, the SSH
 * machine editor or the GitHub sign-in that already exists rather than have this card grow
 * a second copy of any of them.
 */

export { default as ChunkerRoutePicker } from "./ChunkerRoutePicker.vue";

export {
    CHUNKER_ROUTE_IDS,
    checkAllRoutes,
    checkRoute,
    defaultRouteFor,
    describeRoute,
    firstReadyRoute,
    fixFor,
    reasonCopyKey,
    routeIdOf,
    unprobedFacts,
} from "./chunkerRoute.js";
export type {
    ChunkerDockerStatus,
    ChunkerRoute,
    ChunkerRouteDescription,
    ChunkerRouteFacts,
    ChunkerRouteFix,
    ChunkerRouteId,
    ChunkerRouteReadiness,
    ChunkerRouteReason,
} from "./chunkerRoute.js";

export {
    chunkerRouteHostFrom,
    chunkerRouteHostFromBridge,
    provideChunkerRouteHost,
    resolveChunkerRouteHost,
    routeHostMissingReason,
    useChunkerRouteHost,
} from "./chunkerRouteHost.js";
export type { ChunkerRouteHost, ChunkerRoutePieces } from "./chunkerRouteHost.js";
