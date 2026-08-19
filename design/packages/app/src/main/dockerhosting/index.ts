export {
    DOCKER_HOSTING_INSTANCE_LABEL,
    DOCKER_HOSTING_LABEL,
    DOCKER_HOSTING_NAME_LABEL,
    DOCKER_HOSTING_VERSION_LABEL,
    DockerHostingManager,
    type CreateInstanceRequest,
    type DockerHostingManagerOptions,
    type ManagedInstance,
    type ManagedState,
    type DockerHostingSnapshot,
    type ManagerAnswer,
    type ManagerFailure,
} from "./manager.js";
export type { DockerReport } from "../runtime/docker.js";
export {
    DOCKER_HOSTING_CHANNELS,
    registerDockerHostingHandlers,
    type DockerHostingIpc,
    type DockerHostingIpcOptions,
} from "./ipc.js";
