/**
 * Hosting a finished render as a Docker-hosted map, in five steps.
 *
 *   1. load-image  the bundled map server image goes into that machine's Docker
 *   2. pack        the chosen maps are packed into one tar on this PC
 *   3. copy        the tar is streamed into a labelled named volume
 *   4. start       the container starts, read-only, with the chosen port
 *   5. health      the link is checked from this PC before it is called ready
 *
 * ## What "ready" means
 *
 * Ready is reported only after a request from this PC to the address in the link has been
 * answered by the map server. A running container, a published port or a passing health
 * check inside Docker is not enough on its own, because each of those is true while a
 * firewall still blocks every other computer, and a link that does not open is the failure
 * this feature exists to remove.
 *
 * ## Failures are exact and undone
 *
 * A failed step reports the command (secrets masked), its exit code and the last twenty
 * lines it said, and offers a one-click fix where there is one (a taken port). Whatever this
 * run created, container and volume, is removed again; nothing from an earlier instance is
 * touched, and the registry only learns about an instance once it is ready.
 */
import { randomBytes } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { generateAccess, type AccessSecrets } from "./access.js";
import { archFromDocker, BundledImageError, readBundledImage, sameLayers, type BundledImage, type ImageArch } from "./bundledImage.js";
import {
    containerNameFor, describeCommand, fillArgs, recordFrom, runArgs, volumeCreateArgs, volumeNameFor, type RunSettings,
} from "./containers.js";
import { lastLines, type Executor } from "./exec.js";
import { packMap, PackCancelled, type PackOptions, type PackReport } from "./mapPack.js";
import { localLanAddress, remoteLanAddress, waitForHealth, type Fetcher } from "./network.js";
import { checkPort } from "./ports.js";
import type { InstanceRegistry } from "./registry.js";
import {
    type HostFailure, type HostFix, type HostMapEvent, type HostMapOutcome, type HostMapRequest, type HostResult, type HostStep, type HostTarget, type StepState,
} from "./types.js";
import { DEFAULT_CONTAINER_LABEL, DEFAULT_HEALTH_LABEL, plainWording, type Wording } from "./wording.js";

export interface HostMapDeps {
    executorFor(target: HostTarget): Promise<Executor | null>;
    webRootFor(renderId: string): string;
    bundledImageDir(): string;
    registry: InstanceRegistry;
    /** A scratch folder for the tar. Removed again, success or not. */
    tempDir(): string;
    wording?: () => Promise<Wording>;
    fetcher?: Fetcher;
    localAddress?: () => Promise<string | null>;
    remoteAddress?: (executor: Executor) => Promise<string | null>;
    newId?: () => string;
    access?: () => AccessSecrets;
    pack?: (options: PackOptions) => Promise<PackReport>;
    localPortFree?: (port: number) => Promise<boolean>;
    sleep?: (ms: number) => Promise<void>;
    healthAttempts?: number;
    healthDelayMs?: number;
    now?: () => Date;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/;
const RENDER_ID = /^[a-z0-9][a-z0-9_-]*$/;

export function formatBytes(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(bytes >= 100_000_000 ? 0 : 1)} MB`;
    return `${String(Math.max(1, Math.round(bytes / 1000)))} kB`;
}

function seconds(ms: number): string {
    return `${String(Math.max(1, Math.round(ms / 1000)))} s`;
}

class Failed extends Error {
    constructor(readonly failure: HostFailure) { super(failure.message); }
}

function failure(step: HostFailure["step"], message: string, extra: Partial<Pick<HostFailure, "command" | "exitCode" | "output" | "fix">> = {}): HostFailure {
    return { step, message, command: extra.command ?? null, exitCode: extra.exitCode ?? null, output: extra.output ?? "", fix: extra.fix ?? null };
}

export function validateRequest(request: HostMapRequest): string | null {
    if (!RENDER_ID.test(request.renderId)) return "Choose a finished render to host.";
    if (!NAME.test(request.name)) return "Give the instance a name of up to 40 letters, numbers, spaces, dots, dashes or underscores.";
    if (!Number.isInteger(request.port) || request.port < 1 || request.port > 65535) return "The port must be a number from 1 to 65535.";
    if (request.maps.length === 0) return "Choose at least one map to include.";
    if (request.target.kind === "ssh" && request.target.targetId.trim() === "") return "Choose an SSH host.";
    return null;
}

export async function hostMap(
    deps: HostMapDeps,
    request: HostMapRequest,
    onEvent: (event: HostMapEvent) => void = () => undefined,
    signal?: AbortSignal,
): Promise<HostMapOutcome> {
    const now = deps.now ?? (() => new Date());
    const emit = (event: HostMapEvent): void => { try { onEvent(event); } catch { /* a listener must not break hosting */ } };
    const step = (id: HostStep, state: StepState, meta = ""): void => emit({ type: "step", step: id, state, meta, at: now().toISOString() });

    const invalid = validateRequest(request);
    if (invalid !== null) {
        const bad = failure("check", invalid);
        emit({ type: "failed", failure: bad, at: now().toISOString() });
        return { ok: false, failure: bad };
    }

    let executor: Executor | null = null;
    const created = { container: null as string | null, volume: null as string | null };
    let tarFile: string | null = null;
    let current: HostStep = "load-image";
    try {
        executor = await deps.executorFor(request.target);
        if (executor === null) throw new Failed(failure("check", "That SSH host is not saved. Add it in the remote settings first."));
        const docker = executor.docker;
        const run = async (args: readonly string[], timeoutMs = 120_000, stage: HostFailure["step"] = current) => {
            const output = await (executor as Executor).exec(docker, args, { timeoutMs, ...(signal === undefined ? {} : { signal }) });
            if (!output.ok) {
                throw new Failed(failure(stage, `${docker} ${args[0] ?? ""} did not finish.`, {
                    command: describeCommand(docker, args), exitCode: output.exitCode, output: lastLines(output),
                }));
            }
            return output;
        };

        const instanceId = (deps.newId ?? (() => randomBytes(4).toString("hex")))();
        const arch = await machineArch(executor, docker, signal);
        const known = (await deps.registry.list()).filter((record) => sameMachine(record.target, request.target));
        const port = await checkPort({ executor, port: request.port, known, ...(deps.localPortFree === undefined ? {} : { localFree: deps.localPortFree }) });
        if (!port.free) {
            throw new Failed(failure("check", `Port ${String(request.port)} is already in use on ${executor.label}.`, {
                fix: portFix(port.suggested, request.port),
            }));
        }

        const secrets = request.accessCode ? (deps.access ?? generateAccess)() : null;
        const wording = await (deps.wording ?? (() => Promise.resolve(plainWording)))();
        const settings: RunSettings = {
            instanceId,
            name: request.name,
            containerName: containerNameFor(request.name, instanceId),
            volumeName: volumeNameFor(instanceId),
            imageRef: "",
            port: request.port,
            lan: request.lan,
            startOnBoot: request.startOnBoot,
            displayLabel: wording.apply(DEFAULT_CONTAINER_LABEL),
        };
        // Settings and the access verifier travel inside the tar, never on a command line.
        const mapConfig = {
            version: 1,
            title: request.name,
            healthLabel: wording.apply(DEFAULT_HEALTH_LABEL),
            access: secrets === null ? null : { name: secrets.name, verifier: secrets.verifier },
        };

        // 1. load the bundled image
        current = "load-image";
        step("load-image", "running");
        let started = Date.now();
        let image: BundledImage;
        try { image = await readBundledImage(deps.bundledImageDir(), arch); }
        catch (error) {
            throw new Failed(failure("load-image", error instanceof BundledImageError ? error.message : "The bundled map server image could not be read.", { output: error instanceof Error ? error.message : "" }));
        }
        const present = await executor.exec(docker, ["image", "inspect", "--format", "{{json .RootFS.Layers}}", image.ref], { timeoutMs: 20_000 });
        let tarSize = 0;
        if (present.ok && sameLayers(present.stdout, image)) {
            step("load-image", "done", "already on the machine");
        } else {
            const loadArgs = ["load"];
            const loaded = await executor.execWithStdin(docker, loadArgs, { stdinFile: image.tarPath, timeoutMs: 600_000, ...(signal === undefined ? {} : { signal }) });
            if (!loaded.ok) throw new Failed(failure("load-image", "Docker could not load the bundled map server image.", { command: describeCommand(docker, loadArgs), exitCode: loaded.exitCode, output: lastLines(loaded) }));
            tarSize = (await stat(image.tarPath)).size;
            step("load-image", "done", `${formatBytes(tarSize)} · ${seconds(Date.now() - started)}`);
        }
        const withImage: RunSettings = { ...settings, imageRef: image.ref };

        // 2. pack the map
        current = "pack";
        step("pack", "running");
        started = Date.now();
        tarFile = join(deps.tempDir(), `worldlens-map-${instanceId}.tar`);
        let packed: PackReport;
        try {
            packed = await (deps.pack ?? packMap)({ webRoot: deps.webRootFor(request.renderId), maps: request.maps, outFile: tarFile, config: mapConfig, ...(signal === undefined ? {} : { signal }) });
        } catch (error) {
            if (error instanceof PackCancelled) throw error;
            throw new Failed(failure("pack", "The rendered map could not be packed.", { output: error instanceof Error ? error.message : String(error) }));
        }
        step("pack", "done", `${formatBytes(packed.contentBytes)} · ${seconds(Date.now() - started)}`);

        // 3. copy into a private volume
        current = "copy";
        step("copy", "running");
        started = Date.now();
        await run(volumeCreateArgs(withImage), 30_000, "copy");
        created.volume = withImage.volumeName;
        const fill = fillArgs(withImage);
        const filled = await executor.execWithStdin(docker, fill, { stdinFile: tarFile, timeoutMs: 3 * 60 * 60_000, ...(signal === undefined ? {} : { signal }) });
        if (!filled.ok) throw new Failed(failure("copy", "The map could not be copied into the volume.", { command: describeCommand(docker, fill), exitCode: filled.exitCode, output: lastLines(filled) }));
        step("copy", "done", seconds(Date.now() - started));

        // 4. start the container
        current = "start";
        step("start", "running");
        started = Date.now();
        const args = runArgs(withImage);
        const ran = await executor.exec(docker, args, { timeoutMs: 60_000, ...(signal === undefined ? {} : { signal }) });
        if (!ran.ok) {
            const taken = /port is already allocated|address already in use|bind for/i.test(`${ran.stderr}${ran.stdout}`);
            throw new Failed(failure("start", "The container did not start.", {
                command: describeCommand(docker, args), exitCode: ran.exitCode, output: lastLines(ran),
                ...(taken ? { fix: portFix((await checkPort({ executor, port: request.port + 1, known, ...(deps.localPortFree === undefined ? {} : { localFree: deps.localPortFree }) })).suggested, request.port) } : {}),
            }));
        }
        created.container = withImage.containerName;
        step("start", "done", seconds(Date.now() - started));

        // 5. prove the link from this PC
        current = "health";
        step("health", "running");
        const link = await proveLink(deps, executor, docker, withImage, request, signal);
        step("health", "done", "200 OK");

        const result: HostResult = {
            instanceId,
            link: link.url,
            where: executor.kind === "local" ? "this PC" : executor.label,
            accessName: secrets?.name ?? null,
            accessCode: secrets?.code ?? null,
            checkedAt: now().toISOString(),
        };
        await deps.registry.put(recordFrom(withImage, {
            target: request.target, targetLabel: executor.label, maps: request.maps, renderId: request.renderId,
            link: link.url, createdAt: result.checkedAt, protected: secrets !== null, accessName: secrets?.name ?? null,
        }));
        emit({ type: "ready", result, at: result.checkedAt });
        return { ok: true, result };
    } catch (error) {
        const bad = error instanceof Failed
            ? error.failure
            : error instanceof PackCancelled || signal?.aborted === true
                ? failure(current, "Hosting was cancelled.")
                : failure(current, "Hosting stopped unexpectedly.", { output: error instanceof Error ? error.message : String(error) });
        step(bad.step === "check" ? current : bad.step, "failed", "failed");
        if (executor !== null) await rollback(executor, created);
        emit({ type: "failed", failure: bad, at: now().toISOString() });
        return { ok: false, failure: bad };
    } finally {
        if (tarFile !== null) await rm(tarFile, { force: true }).catch(() => undefined);
    }
}

function portFix(port: number, current: number): HostFix | null {
    return port === current ? null : { id: "use-port", port, label: `Use port ${String(port)} and retry` };
}

function sameMachine(a: HostTarget, b: HostTarget): boolean {
    return a.kind === b.kind && (a.kind === "local" || (b.kind === "ssh" && a.targetId === b.targetId));
}

async function machineArch(executor: Executor, docker: string, signal?: AbortSignal): Promise<ImageArch> {
    const args = ["info", "--format", "{{.Architecture}}"];
    const output = await executor.exec(docker, args, { timeoutMs: 20_000, ...(signal === undefined ? {} : { signal }) });
    if (!output.ok) {
        throw new Failed(failure("check", `Docker is not answering on ${executor.label}.`, { command: describeCommand(docker, args), exitCode: output.exitCode, output: lastLines(output) }));
    }
    const arch = archFromDocker(output.stdout);
    if (arch === null) throw new Failed(failure("check", `Docker on ${executor.label} reports an architecture (${output.stdout.trim()}) the bundled map server does not support.`));
    return arch;
}

async function proveLink(
    deps: HostMapDeps, executor: Executor, docker: string, settings: RunSettings, request: HostMapRequest, signal?: AbortSignal,
): Promise<{ readonly url: string }> {
    const fetcher: Fetcher = deps.fetcher ?? ((url, init) => fetch(url, init));
    const attempts = deps.healthAttempts ?? 30;
    const delayMs = deps.healthDelayMs ?? 1000;
    const sleep = deps.sleep;
    const options = { attempts, delayMs, ...(sleep === undefined ? {} : { sleep }), ...(signal === undefined ? {} : { signal }) };
    const port = String(settings.port);

    if (!request.lan) {
        if (executor.kind === "local") {
            const found = await waitForHealth([`http://127.0.0.1:${port}/health`], fetcher, options);
            if (found.url === null) throw new Failed(failure("health", "The map server did not answer.", { output: found.lastDetail }));
            return { url: `http://127.0.0.1:${port}/` };
        }
        // Nothing on this PC can reach a host-only port, so Docker's own health report is
        // the evidence, and the link says plainly that it works on that host.
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const status = await executor.exec(docker, ["inspect", "--format", "{{.State.Health.Status}}", settings.containerName], { timeoutMs: 20_000 });
            if (status.ok && status.stdout.trim() === "healthy") return { url: `http://127.0.0.1:${port}/` };
            await (sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(delayMs);
        }
        throw new Failed(failure("health", "Docker never reported the map server healthy.", { output: "health status was not healthy" }));
    }

    const detected = executor.kind === "local"
        ? await (deps.localAddress ?? localLanAddress)()
        : await (deps.remoteAddress ?? remoteLanAddress)(executor);
    const hosts = [detected, ...(executor.kind === "ssh" ? [sshHost(executor.label)] : [])].filter((host): host is string => host !== null && host !== "");
    if (hosts.length === 0) {
        throw new Failed(failure("health", "No network address could be found for this machine, so there is no link to show. Turn off Reachable on my network to keep it on the machine itself."));
    }
    const found = await waitForHealth(hosts.map((host) => `http://${host}:${port}/health`), fetcher, options);
    if (found.url === null) {
        throw new Failed(failure("health", `The map server is running, but this PC could not open it at ${hosts[0] ?? ""}:${port}. A firewall on the host may be blocking that port.`, { output: found.lastDetail }));
    }
    return { url: found.url.replace(/health$/, "") };
}

function sshHost(label: string): string {
    return label.includes("@") ? label.slice(label.indexOf("@") + 1) : label;
}

async function rollback(executor: Executor, created: { container: string | null; volume: string | null }): Promise<void> {
    const docker = executor.docker;
    if (created.container !== null) await executor.exec(docker, ["rm", "-f", created.container], { timeoutMs: 30_000 }).catch(() => undefined);
    if (created.volume !== null) await executor.exec(docker, ["volume", "rm", "-f", created.volume], { timeoutMs: 30_000 }).catch(() => undefined);
}
