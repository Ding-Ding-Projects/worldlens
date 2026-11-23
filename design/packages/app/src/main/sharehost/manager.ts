/**
 * The instance manager: list, start, stop, restart, update and remove hosted maps.
 *
 * ## It only touches what it created
 *
 * Every action starts from a registry record and then proves ownership against Docker
 * itself: the container must carry this feature's labels and the same instance id as the
 * record. A record that points at somebody else's container is refused, and a container that
 * carries the labels but has no record is never listed or touched. Removing an instance
 * removes exactly its container, its volume and its record, in that order, and says which
 * of those it could not remove.
 *
 * ## Update never leaves a gap it cannot close
 *
 * The old container is stopped and renamed aside, the new one is started from the bundled
 * image with the same volume, port and access settings read back from the old container, and
 * the old one is deleted only after the new one reports healthy. If the new one fails, the old
 * one is renamed back and started again, and the failure says so.
 */
import { lastLines, type Executor } from "./exec.js";
import { archFromDocker, readBundledImage, sameLayers } from "./bundledImage.js";
import { MAP_HOST_DISPLAY_LABEL, MAP_HOST_INSTANCE_LABEL, MAP_HOST_LABEL, runArgs, type RunSettings } from "./containers.js";
import type { HostTarget, InstanceRecord, InstanceState, InstanceSummary } from "./types.js";
import type { InstanceRegistry } from "./registry.js";

export interface ManagerDeps {
    registry: InstanceRegistry;
    executorFor(target: HostTarget): Promise<Executor | null>;
    bundledImageDir(): string;
    sleep?: (ms: number) => Promise<void>;
    healthAttempts?: number;
}

export type ManagerAnswer =
    | { readonly ok: true; readonly message: string }
    | { readonly ok: false; readonly message: string; readonly output: string };

interface Inspected {
    readonly owned: boolean;
    readonly state: InstanceState;
    readonly detail: string;
    readonly env: Readonly<Record<string, string>>;
    readonly labels: Readonly<Record<string, string>>;
}

interface InspectJson {
    readonly State?: { readonly Running?: boolean; readonly Status?: string; readonly Health?: { readonly Status?: string } };
    readonly Config?: { readonly Labels?: Record<string, string> | null; readonly Env?: readonly string[] | null };
}

function parseInspect(stdout: string, record: InstanceRecord): Inspected | null {
    let value: InspectJson;
    try { value = JSON.parse(stdout) as InspectJson; } catch { return null; }
    const labels = value.Config?.Labels ?? {};
    const env: Record<string, string> = {};
    for (const entry of value.Config?.Env ?? []) {
        const split = entry.indexOf("=");
        if (split > 0) env[entry.slice(0, split)] = entry.slice(split + 1);
    }
    const owned = labels[MAP_HOST_LABEL] === "true" && labels[MAP_HOST_INSTANCE_LABEL] === record.instanceId;
    const running = value.State?.Running === true;
    const health = value.State?.Health?.Status;
    const state: InstanceState = !running ? "stopped" : health === "unhealthy" ? "unhealthy" : "running";
    const detail = !running ? (value.State?.Status ?? "stopped") : (health ?? "running");
    return { owned, state, detail, env, labels };
}

export class ShareHostManager {
    constructor(private readonly deps: ManagerDeps) {}

    async list(): Promise<readonly InstanceSummary[]> {
        const records = await this.deps.registry.list();
        return Promise.all(records.map(async (record) => {
            const executor = await this.deps.executorFor(record.target);
            if (executor === null) return { ...record, state: "unknown" as const, detail: "That host is no longer saved." };
            const inspected = await this.inspect(executor, record);
            if (inspected === "missing") return { ...record, state: "missing" as const, detail: "The container is gone." };
            if (inspected === null) return { ...record, state: "unknown" as const, detail: `${executor.label} did not answer.` };
            if (!inspected.owned) return { ...record, state: "unknown" as const, detail: "The container no longer carries this app's labels, so it is left alone." };
            return { ...record, state: inspected.state, detail: inspected.detail };
        }));
    }

    start(instanceId: string): Promise<ManagerAnswer> { return this.simple(instanceId, "start"); }
    stop(instanceId: string): Promise<ManagerAnswer> { return this.simple(instanceId, "stop"); }
    restart(instanceId: string): Promise<ManagerAnswer> { return this.simple(instanceId, "restart"); }

    async remove(instanceId: string): Promise<ManagerAnswer> {
        const resolved = await this.resolve(instanceId);
        if ("answer" in resolved) return resolved.answer;
        const { record, executor } = resolved;
        const docker = executor.docker;
        const inspected = await this.inspect(executor, record);
        if (inspected !== "missing" && inspected !== null) {
            if (!inspected.owned) return refuse("That container is not one this app created, so it was not removed.");
            const gone = await executor.exec(docker, ["rm", "-f", record.containerName], { timeoutMs: 60_000 });
            if (!gone.ok) return { ok: false, message: "The container could not be removed.", output: lastLines(gone) };
        } else if (inspected === null) {
            return { ok: false, message: `${executor.label} did not answer, so nothing was removed.`, output: "" };
        }
        const volume = await executor.exec(docker, ["volume", "inspect", "--format", "{{index .Labels \"" + MAP_HOST_INSTANCE_LABEL + "\"}}", record.volumeName], { timeoutMs: 20_000 });
        if (volume.ok) {
            if (volume.stdout.trim() !== record.instanceId) return refuse("The volume is not one this app created, so it was kept.");
            const removed = await executor.exec(docker, ["volume", "rm", record.volumeName], { timeoutMs: 60_000 });
            if (!removed.ok) return { ok: false, message: "The container was removed but its volume could not be.", output: lastLines(removed) };
        }
        await this.deps.registry.remove(instanceId);
        return { ok: true, message: `${record.name} was removed, with its container and its copy of the map.` };
    }

    async update(instanceId: string): Promise<ManagerAnswer> {
        const resolved = await this.resolve(instanceId);
        if ("answer" in resolved) return resolved.answer;
        const { record, executor } = resolved;
        const docker = executor.docker;
        const inspected = await this.inspect(executor, record);
        if (inspected === null || inspected === "missing") return { ok: false, message: "The container could not be read, so it was not updated.", output: "" };
        if (!inspected.owned) return refuse("That container is not one this app created, so it was not updated.");

        const archOut = await executor.exec(docker, ["info", "--format", "{{.Architecture}}"], { timeoutMs: 20_000 });
        const arch = archOut.ok ? archFromDocker(archOut.stdout) : null;
        if (arch === null) return { ok: false, message: "Docker did not report an architecture the bundled image supports.", output: lastLines(archOut) };
        const image = await readBundledImage(this.deps.bundledImageDir(), arch).catch((error: unknown) => error as Error);
        if (image instanceof Error) return { ok: false, message: image.message, output: "" };
        const have = await executor.exec(docker, ["image", "inspect", "--format", "{{json .RootFS.Layers}}", image.ref], { timeoutMs: 20_000 });
        const haveImage = have.ok && sameLayers(have.stdout, image);
        if (!haveImage) {
            const loaded = await executor.execWithStdin(docker, ["load"], { stdinFile: image.tarPath, timeoutMs: 600_000 });
            if (!loaded.ok) return { ok: false, message: "Docker could not load the bundled map server image.", output: lastLines(loaded) };
        }
        if (haveImage) {
            const running = await executor.exec(docker, ["inspect", "--format", "{{.Image}}", record.containerName], { timeoutMs: 20_000 });
            const layers = running.ok ? await executor.exec(docker, ["image", "inspect", "--format", "{{json .RootFS.Layers}}", running.stdout.trim()], { timeoutMs: 20_000 }) : null;
            if (layers !== null && layers.ok && sameLayers(layers.stdout, image)) return { ok: true, message: `${record.name} already runs the bundled map server.` };
        }

        const settings: RunSettings = {
            instanceId: record.instanceId, name: record.name, containerName: record.containerName, volumeName: record.volumeName,
            imageRef: image.ref, port: record.port, lan: record.lan, startOnBoot: record.startOnBoot,
            displayLabel: inspected.labels[MAP_HOST_DISPLAY_LABEL] ?? "Worldlens map",
        };
        const aside = `${record.containerName}-previous`;
        const stopped = await executor.exec(docker, ["stop", record.containerName], { timeoutMs: 60_000 });
        if (!stopped.ok) return { ok: false, message: "The running container could not be stopped.", output: lastLines(stopped) };
        const renamed = await executor.exec(docker, ["rename", record.containerName, aside], { timeoutMs: 20_000 });
        if (!renamed.ok) { await executor.exec(docker, ["start", record.containerName]); return { ok: false, message: "The running container could not be set aside.", output: lastLines(renamed) }; }
        const restoreOld = async (): Promise<void> => {
            await executor.exec(docker, ["rm", "-f", record.containerName], { timeoutMs: 30_000 });
            await executor.exec(docker, ["rename", aside, record.containerName], { timeoutMs: 20_000 });
            await executor.exec(docker, ["start", record.containerName], { timeoutMs: 30_000 });
        };
        const ran = await executor.exec(docker, runArgs(settings), { timeoutMs: 60_000 });
        if (!ran.ok) { await restoreOld(); return { ok: false, message: "The new container did not start. The previous one is running again.", output: lastLines(ran) }; }
        if (!(await this.waitHealthy(executor, record.containerName))) {
            await restoreOld();
            return { ok: false, message: "The new container never reported healthy. The previous one is running again.", output: "" };
        }
        await executor.exec(docker, ["rm", "-f", aside], { timeoutMs: 30_000 });
        await this.deps.registry.put({ ...record, imageRef: image.ref });
        return { ok: true, message: `${record.name} now runs map server ${image.version}.` };
    }

    private async waitHealthy(executor: Executor, container: string): Promise<boolean> {
        const attempts = this.deps.healthAttempts ?? 30;
        const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const status = await executor.exec(executor.docker, ["inspect", "--format", "{{.State.Health.Status}}", container], { timeoutMs: 20_000 });
            if (status.ok && status.stdout.trim() === "healthy") return true;
            await sleep(1000);
        }
        return false;
    }

    private async simple(instanceId: string, verb: "start" | "stop" | "restart"): Promise<ManagerAnswer> {
        const resolved = await this.resolve(instanceId);
        if ("answer" in resolved) return resolved.answer;
        const { record, executor } = resolved;
        const inspected = await this.inspect(executor, record);
        if (inspected === null) return { ok: false, message: `${executor.label} did not answer.`, output: "" };
        if (inspected === "missing") return { ok: false, message: "The container is gone. Host the map again to recreate it.", output: "" };
        if (!inspected.owned) return refuse("That container is not one this app created, so it was left alone.");
        const output = await executor.exec(executor.docker, [verb, record.containerName], { timeoutMs: 90_000 });
        return output.ok ? { ok: true, message: `${record.name}: ${verb} done.` } : { ok: false, message: `${record.name} could not ${verb}.`, output: lastLines(output) };
    }

    private async resolve(instanceId: string): Promise<{ record: InstanceRecord; executor: Executor } | { answer: ManagerAnswer }> {
        const record = await this.deps.registry.get(instanceId);
        if (record === null) return { answer: refuse("That instance is not one this app created.") };
        const executor = await this.deps.executorFor(record.target);
        if (executor === null) return { answer: refuse("That host is no longer saved.") };
        return { record, executor };
    }

    /** `null` when the host did not answer, `"missing"` when Docker has no such container. */
    private async inspect(executor: Executor, record: InstanceRecord): Promise<Inspected | "missing" | null> {
        const output = await executor.exec(executor.docker, ["inspect", "--type", "container", "--format", "{{json .}}", record.containerName], { timeoutMs: 20_000 });
        if (!output.ok) return /no such (?:object|container)/i.test(output.stderr) ? "missing" : null;
        return parseInspect(output.stdout, record);
    }
}

function refuse(message: string): ManagerAnswer {
    return { ok: false, message, output: "" };
}
