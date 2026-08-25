/**
 * The Docker-hosting manager. Moved to @worldlens/dockhand.
 *
 * Constructed there with an explicit identity rather than the package default, and the two
 * literals below are deliberately spelled out rather than imported. If this application ever
 * silently adopted a different namespace, every container it has already created would
 * vanish from its own listing while continuing to run - and a new instance could then collide
 * with the orphan over a port or a volume name. `manager.identity.test.ts` pins both strings.
 */
export {
    DockerHostingManager,
    WORLDLENS_IDENTITY,
    managerLabels,
    DOCKER_HOSTING_LABEL,
    DOCKER_HOSTING_INSTANCE_LABEL,
    DOCKER_HOSTING_NAME_LABEL,
    DOCKER_HOSTING_VERSION_LABEL,
    DOCKER_HOSTING_OWNER_LABEL,
} from "@worldlens/dockhand";
export type {
    CreateInstanceRequest,
    DockerHostingManagerOptions,
    DockerHostingSnapshot,
    EnvironmentEntry,
    ManagedInstance,
    ManagedState,
    ManagerAnswer,
    ManagerFailure,
    ManagerFailureCode,
    ManagerIdentity,
    PortBindMode,
    PortMapping,
    RestartPolicy,
} from "@worldlens/dockhand";
