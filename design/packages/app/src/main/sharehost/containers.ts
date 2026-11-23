/**
 * What a hosted map looks like to Docker: names, labels and the exact `docker run` argv.
 *
 * Kept apart from the orchestration so the security posture of the container is one short,
 * reviewable list rather than something spread across the steps that use it: read-only root
 * filesystem, every capability dropped, no privilege escalation, an unprivileged user, the
 * map volume mounted read-only, and a published port bound only where the person asked.
 */
import type { CommandOutput } from "@worldlens/dockhand";
import type { InstanceRecord } from "./types.js";

export const MAP_HOST_LABEL = "org.worldlens.map-host";
export const MAP_HOST_INSTANCE_LABEL = "org.worldlens.map-host.instance";
export const MAP_HOST_NAME_LABEL = "org.worldlens.map-host.name";
export const MAP_HOST_DISPLAY_LABEL = "org.worldlens.map-host.display";

/** Container port the map server listens on. */
export const CONTAINER_PORT = 8080;
/** Where the volume is mounted inside the container: `worldlens-map.json` and `map/`. */
export const VOLUME_MOUNT = "/data";

export function slug(value: string): string {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    return cleaned === "" ? "map" : cleaned;
}

export function containerNameFor(name: string, instanceId: string): string {
    return `worldlens-map-${slug(name)}-${instanceId.slice(0, 4)}`;
}

export function volumeNameFor(instanceId: string): string {
    return `worldlens-map-data-${instanceId}`;
}

export interface RunSettings {
    readonly instanceId: string;
    readonly name: string;
    readonly containerName: string;
    readonly volumeName: string;
    readonly imageRef: string;
    readonly port: number;
    readonly lan: boolean;
    readonly startOnBoot: boolean;
    readonly displayLabel: string;
}

export function ownershipLabels(settings: Pick<RunSettings, "instanceId" | "name" | "displayLabel">): readonly string[] {
    return [
        "--label", `${MAP_HOST_LABEL}=true`,
        "--label", `${MAP_HOST_INSTANCE_LABEL}=${settings.instanceId}`,
        "--label", `${MAP_HOST_NAME_LABEL}=${settings.name}`,
        "--label", `${MAP_HOST_DISPLAY_LABEL}=${settings.displayLabel}`,
    ];
}

export function volumeCreateArgs(settings: Pick<RunSettings, "instanceId" | "name" | "displayLabel" | "volumeName">): readonly string[] {
    return ["volume", "create", ...ownershipLabels(settings), settings.volumeName];
}

/** The one-off run that fills the volume. Root, because a new volume is root-owned; nothing else. */
export function fillArgs(settings: Pick<RunSettings, "volumeName" | "imageRef">): readonly string[] {
    return [
        "run", "--rm", "-i", "--user", "0:0", "--network", "none", "--read-only",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "-v", `${settings.volumeName}:${VOLUME_MOUNT}`,
        settings.imageRef, "--extract-tar", VOLUME_MOUNT,
    ];
}

export function runArgs(settings: RunSettings): readonly string[] {
    const bind = settings.lan ? "0.0.0.0" : "127.0.0.1";
    return [
        "run", "-d", "--name", settings.containerName,
        "--restart", settings.startOnBoot ? "unless-stopped" : "no",
        "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "256",
        "--user", "65532:65532",
        "-p", `${bind}:${String(settings.port)}:${String(CONTAINER_PORT)}`,
        "-v", `${settings.volumeName}:${VOLUME_MOUNT}:ro`,
        ...ownershipLabels(settings),
        settings.imageRef,
    ];
}

/**
 * A command as written into a failure report. No secret is ever on a command line (the
 * access verifier travels inside the tar), so this only quotes arguments that need it.
 */
export function maskArgs(args: readonly string[]): string {
    return args
        .map((arg) => (/[\s"']/.test(arg) ? JSON.stringify(arg) : arg))
        .join(" ");
}

export function describeCommand(command: string, args: readonly string[]): string {
    return `${command} ${maskArgs(args)}`;
}

export function exitCodeOf(output: CommandOutput): number | null {
    return output.exitCode;
}

export function recordFrom(settings: RunSettings, extra: Pick<InstanceRecord, "target" | "targetLabel" | "maps" | "renderId" | "link" | "createdAt" | "protected" | "accessName">): InstanceRecord {
    return {
        instanceId: settings.instanceId,
        name: settings.name,
        target: extra.target,
        targetLabel: extra.targetLabel,
        containerName: settings.containerName,
        volumeName: settings.volumeName,
        port: settings.port,
        lan: settings.lan,
        startOnBoot: settings.startOnBoot,
        protected: extra.protected,
        accessName: extra.accessName,
        maps: extra.maps,
        renderId: extra.renderId,
        imageRef: settings.imageRef,
        link: extra.link,
        createdAt: extra.createdAt,
    };
}
