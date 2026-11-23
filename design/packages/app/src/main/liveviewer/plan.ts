/**
 * The Docker commands that host one viewer, as data.
 *
 * Nothing here runs anything. Every function returns an argv, so the whole hosting plan
 * can be asserted against a fake runner and so no value is ever concatenated into a
 * shell string. A sign-in cache is not in any argv: it travels on standard input.
 */

import { VIEWER_INTERNAL_PORT, type LiveViewerConfig } from "@worldlens/liveviewer";

export const LIVEVIEWER_LABEL = "com.worldlens.liveviewer";
export const LIVEVIEWER_INSTANCE_LABEL = "com.worldlens.liveviewer.instance";
export const LIVEVIEWER_OWNER_LABEL = "com.worldlens.liveviewer.owner";

const ID = /^[a-z0-9][a-z0-9-]{5,40}$/;

export function validInstanceId(id: string): boolean {
    return ID.test(id);
}

/** The name a container uses to reach servers running on its own host. */
export const HOST_GATEWAY_NAME = "host.docker.internal";

export interface InstanceNames {
    readonly container: string;
    readonly configVolume: string;
    readonly secretsVolume: string;
}

export function instanceNames(id: string): InstanceNames {
    return { container: `lv-${id}`, configVolume: `lv-${id}-config`, secretsVolume: `lv-${id}-secrets` };
}

export function ownerLabelArgs(id: string, owner: string): string[] {
    return ["--label", `${LIVEVIEWER_LABEL}=true`, "--label", `${LIVEVIEWER_INSTANCE_LABEL}=${id}`, "--label", `${LIVEVIEWER_OWNER_LABEL}=${owner}`];
}

export function createVolumeArgs(volume: string, id: string, owner: string): string[] {
    return ["volume", "create", ...ownerLabelArgs(id, owner), volume];
}

/**
 * Writes one file into a named volume from standard input.
 *
 * A throwaway container from the viewer image itself (so no second image is needed), run
 * as the same unprivileged user the viewer runs as, with `umask 077` so the file is
 * readable by that user alone. The path and volume are fixed strings built here, never
 * a caller's text.
 */
export function writeVolumeFileArgs(image: string, volume: string, mountPoint: "/config" | "/secrets", fileName: "config.json" | "auth.json"): string[] {
    return [
        "run", "--rm", "-i", "--network", "none", "--user", "1000:1000", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--entrypoint", "sh", "-v", `${volume}:${mountPoint}`, image, "-c", `umask 077 && cat > ${mountPoint}/${fileName}`,
    ];
}

export interface RunPlanInput {
    readonly id: string;
    readonly owner: string;
    readonly image: string;
    readonly hostPort: number;
    readonly withSecrets: boolean;
}

/** The long-running container. Read-only root, no capabilities, bounded memory and processes. */
export function runArgs(input: RunPlanInput): string[] {
    const names = instanceNames(input.id);
    return [
        "run", "-d", "--name", names.container, "--restart", "unless-stopped",
        "--read-only", "--tmpfs", "/tmp:rw,size=64m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--memory", "768m", "--cpus", "1", "--pids-limit", "256",
        "--add-host", `${HOST_GATEWAY_NAME}:host-gateway`,
        "-p", `${input.hostPort}:${VIEWER_INTERNAL_PORT}`,
        "-v", `${names.configVolume}:/config:ro`,
        ...(input.withSecrets ? ["-v", `${names.secretsVolume}:/secrets`] : []),
        ...ownerLabelArgs(input.id, input.owner),
        input.image,
    ];
}

/** The configuration the container reads. Contains no credential. */
export function configJson(config: LiveViewerConfig): string {
    return JSON.stringify(config);
}

export function loadImageArgs(tarPath: string): string[] {
    return ["load", "-i", tarPath];
}

export function inspectImageArgs(image: string): string[] {
    return ["image", "inspect", "--format", "{{.Id}}", image];
}

export function stateArgs(container: string): string[] {
    return ["inspect", "--format", "{{.State.Status}}", container];
}

export function removeContainerArgs(container: string): string[] {
    return ["rm", "-f", container];
}

/** Is something already listening on this host port? Asked of Docker, which knows every published port. */
export function portInUseArgs(): string[] {
    return ["ps", "--format", "{{.Ports}}"];
}

export function portIsPublished(psOutput: string, port: number): boolean {
    const pattern = new RegExp(`(?:^|[\\s,])(?:[0-9.]+|\\[[0-9a-f:]+\\]|::):${port}->`, "m");
    return pattern.test(psOutput);
}

const PRIVATE_V4 = /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

export function isPrivateIPv4(value: string): boolean {
    return PRIVATE_V4.test(value);
}

/** The first private IPv4 in `hostname -I` style output. Container bridge addresses are skipped. */
export function firstLanAddress(output: string): string | null {
    for (const token of output.split(/\s+/)) {
        if (isPrivateIPv4(token) && !token.startsWith("172.17.") && !token.startsWith("172.18.")) return token;
    }
    return null;
}

export function viewerUrl(address: string, port: number): string {
    return `http://${address}:${port}/`;
}
