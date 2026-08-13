/**
 * Starting a Chunker world conversion on GitHub Actions.
 *
 * The barrel exports nothing that touches Electron, matching `../bedrock`: everything here
 * is plain planning and one API call, so it can be exercised without a window.
 */

export {
    CHUNK_WORKFLOW_FILE,
    WORKFLOW_OUTPUTS,
    WORKFLOW_WORLD_SOURCES,
    planChunkerRun,
} from "./plan.js";
export type {
    ChunkerOutput,
    ChunkerPlanRefusal,
    ChunkerPlanResult,
    ChunkerPruneBounds,
    ChunkerRunPlan,
    ChunkerRunRequest,
    ChunkerWorldSource,
} from "./plan.js";
export { dispatchChunkerRun } from "./dispatch.js";
export type {
    ChunkerDispatchFailure,
    ChunkerDispatchResult,
    ChunkerDispatchTransport,
} from "./dispatch.js";
