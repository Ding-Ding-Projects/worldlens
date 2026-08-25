/**
 * Deploying a container image to a machine, over SSH or locally, without knowing or caring
 * what the image does.
 *
 * Everything here was extracted from the WorldLens desktop application, where it grew up
 * doing exactly this for one particular image. What made it worth extracting is that almost
 * none of it was about that image: running a command, probing a Docker daemon, quoting for a
 * remote shell whose dialect is unknown, and deciding whether a host key is the one seen last
 * time are all the same problems whatever is being shipped.
 *
 * What deliberately did **not** come along is the vocabulary of the thing being deployed. The
 * application's failures speak in render terms because its surfaces are render surfaces;
 * repeating that here would hand every future consumer failure codes about renders.
 */
export { execFileCommandRunner } from "./command.js";
export type { CommandOptions, CommandOutput, CommandRunner } from "./command.js";
export { probeDocker, dockerUsable } from "./docker.js";
export type { DockerReport, DockerStatus } from "./docker.js";
export {
    CONNECT_TIMEOUT_SECONDS,
    classifySshOutput,
    firstLine,
    quoteForRemoteShell,
    quoteRemotePath,
    remoteCommandLine,
    scpArguments,
    scpRemotePath,
    sshArguments,
    sshCommandRunner,
    sshScriptArguments,
    sshSecurityOptions,
} from "./ssh.js";
export type { SshOptionsInput, SshOutcome, SshRunnerOptions } from "./ssh.js";
export {
    describeOffers,
    fingerprintOf,
    parseKeyscan,
    recordedFor,
    scanHostKeys,
    trustHostKey,
} from "./hostkey.js";
export type { HostKeyOffer, HostKeyOptions } from "./hostkey.js";
export { encodePowerShellCommand, powershellRemoteCommand, quoteForPowerShell } from "./windowsShell.js";
export { DEFAULT_SSH_PORT, describeTarget, destination } from "./target.js";
export type { SshTarget } from "./target.js";

export { COMMAND_TIMEOUT_MS } from "./command.js";
export { dockerImagePresent, readDockerVersion } from "./docker.js";
export type { ProbeDockerOptions } from "./docker.js";

export {
    DockerHostingManager,
    WORLDLENS_IDENTITY,
    managerLabels,
    DOCKER_HOSTING_LABEL,
    DOCKER_HOSTING_INSTANCE_LABEL,
    DOCKER_HOSTING_NAME_LABEL,
    DOCKER_HOSTING_VERSION_LABEL,
    DOCKER_HOSTING_OWNER_LABEL,
} from "./manager.js";
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
} from "./manager.js";

export { REFUSED_ROOTS, detectHostKind, loopbackProbeCommand, stagingPathRefusal } from "./hostKind.js";
export type { RemoteHostKind } from "./hostKind.js";
