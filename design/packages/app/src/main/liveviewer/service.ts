/**
 * Hosting one viewer, and managing the ones already hosted.
 *
 * `host` is a short, ordered list of steps and each one either finishes or names why it
 * did not. Every command goes through an injected runner, so the whole sequence is tested
 * against a fake Docker and a fake SSH host; nothing here shells out directly.
 *
 * What it will not do: download an image (the bundled archive is loaded, or hosting stops
 * with a message saying so), put a credential in an argument or an environment variable,
 * touch a container it did not create, or report a link it has not fetched from this PC.
 */

import { randomUUID } from "node:crypto";
import {
    dockerUsable,
    execFileCommandRunner,
    probeDocker,
    scpArguments,
    scpRemotePath,
    sshCommandRunner,
    type CommandOutput,
    type CommandRunner,
    type SshOptionsInput,
} from "@worldlens/dockhand";
import { SECRET_FILE_VERSION, relevantVocabulary, type LiveViewerConfig } from "@worldlens/liveviewer";
import type { BundledImage, BundledImageResult } from "./bundledImage.js";
import { isLoopbackHost, localLanAddress } from "./lan.js";
import {
    configJson,
    createVolumeArgs,
    firstLanAddress,
    inspectImageArgs,
    instanceNames,
    loadImageArgs,
    portInUseArgs,
    portIsPublished,
    HOST_GATEWAY_NAME,
    removeContainerArgs,
    runArgs,
    stateArgs,
    validInstanceId,
    viewerUrl,
    writeVolumeFileArgs,
} from "./plan.js";
import type { InstanceRegistry } from "./registry.js";
import type {
    Answer,
    HostAnswer,
    HostFailure,
    HostRequest,
    HostStep,
    HostTarget,
    InstanceState,
    InstanceStatus,
    LiveViewerAccounts,
    StepId,
    Verification,
    ViewerEvent,
    ViewerInstance,
} from "./types.js";

export interface HealthReply {
    readonly botConnected: boolean;
    readonly state: string;
    readonly botName: string;
    readonly lastError: string | null;
}

export interface ServiceOptions {
    readonly registry: InstanceRegistry;
    /** Identifies this installation, so another installation's containers are never touched. */
    readonly owner: string;
    readonly resolveSsh: (hostId: string) => Promise<SshOptionsInput | null> | SshOptionsInput | null;
    readonly accounts: LiveViewerAccounts | null;
    readonly vocabulary?: () => Promise<Readonly<Record<string, string>>>;
    readonly bundledImage: () => Promise<BundledImageResult>;
    readonly localRunner?: CommandRunner;
    readonly localLan?: () => string | null;
    readonly fetchHealth?: (url: string, timeoutMs: number) => Promise<HealthReply | null>;
    readonly onEvent?: (event: ViewerEvent) => void;
    readonly now?: () => Date;
    readonly newId?: () => string;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly healthTimeoutMs?: number;
    readonly healthIntervalMs?: number;
}

const STEP_ORDER: readonly StepId[] = ["docker", "image", "volumes", "config", "secrets", "start", "health", "verify"];

function failure(code: HostFailure["code"], message: string, detail: string | null = null): HostFailure {
    return { code, message, detail };
}

function firstLine(output: CommandOutput): string | null {
    const line = `${output.stderr}\n${output.stdout}`.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => entry !== "");
    return line === undefined ? null : line.slice(0, 300);
}

export async function defaultFetchHealth(url: string, timeoutMs: number): Promise<HealthReply | null> {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        const body = (await response.json()) as Partial<HealthReply>;
        if (typeof body.state !== "string") return null;
        return {
            botConnected: body.botConnected === true,
            state: body.state,
            botName: typeof body.botName === "string" ? body.botName : "",
            lastError: typeof body.lastError === "string" ? body.lastError : null,
        };
    } catch {
        return null;
    }
}

interface Transport {
    readonly run: CommandRunner;
    readonly docker: string;
    readonly ssh: SshOptionsInput | null;
}

class StepBoard {
    readonly #steps = new Map<StepId, HostStep>();
    constructor(private readonly publish: (steps: readonly HostStep[]) => void, skip: readonly StepId[]) {
        for (const id of STEP_ORDER) this.#steps.set(id, { id, state: skip.includes(id) ? "skipped" : "pending", detail: null });
        this.publish(this.snapshot());
    }
    snapshot(): readonly HostStep[] {
        return STEP_ORDER.map((id) => this.#steps.get(id) as HostStep);
    }
    set(id: StepId, state: HostStep["state"], detail: string | null = null): void {
        this.#steps.set(id, { id, state, detail });
        this.publish(this.snapshot());
    }
}

export class LiveViewerService {
    readonly #options: ServiceOptions;
    readonly #operations = new Map<string, AbortController>();

    constructor(options: ServiceOptions) {
        this.#options = options;
    }

    cancel(operationId: string): boolean {
        const controller = this.#operations.get(operationId);
        if (controller === undefined) return false;
        controller.abort();
        return true;
    }

    async #transport(target: HostTarget, signal?: AbortSignal): Promise<Answer<Transport>> {
        const base: CommandRunner = this.#options.localRunner ?? execFileCommandRunner;
        const withSignal: CommandRunner = (command, args, options) => base(command, args, { ...options, ...(signal === undefined ? {} : { signal }) });
        if (target.kind === "local") return { ok: true, value: { run: withSignal, docker: "docker", ssh: null } };
        const ssh = await this.#options.resolveSsh(target.hostId);
        if (ssh === null) return { ok: false, failure: failure("ssh-unavailable", "That SSH host is not available. Choose a saved host in the remote settings.") };
        return { ok: true, value: { run: sshCommandRunner({ ...ssh, runner: withSignal }), docker: ssh.target.docker, ssh } };
    }

    async #lanAddress(transport: Transport): Promise<string | null> {
        if (transport.ssh === null) return (this.#options.localLan ?? localLanAddress)();
        const asked = await transport.run("hostname", ["-I"], { timeoutMs: 15_000 });
        const found = asked.ok ? firstLanAddress(asked.stdout) : null;
        if (found !== null) return found;
        return firstLanAddress(transport.ssh.target.host);
    }

    async #loadImage(transport: Transport, image: BundledImage, id: string): Promise<Answer<null>> {
        const present = await transport.run(transport.docker, inspectImageArgs(image.reference), { timeoutMs: 20_000 });
        if (present.ok && (image.imageId === null || present.stdout.trim() === image.imageId)) return { ok: true, value: null };

        let archive = image.tarPath;
        let remoteTar: string | null = null;
        if (transport.ssh !== null) {
            const workDir = transport.ssh.target.workDir;
            const made = await transport.run("mkdir", ["-p", workDir], { timeoutMs: 20_000 });
            if (!made.ok) return { ok: false, failure: failure("image-load-failed", "The hosting machine's staging folder could not be created.", firstLine(made)) };
            remoteTar = `${workDir.replace(/\/+$/, "")}/lv-image-${id}.tar`;
            const base: CommandRunner = this.#options.localRunner ?? execFileCommandRunner;
            const copied = await base("scp", [...scpArguments(transport.ssh, ["-q"]), image.tarPath, scpRemotePath(transport.ssh.target, remoteTar)], { timeoutMs: 1_800_000 });
            if (!copied.ok) return { ok: false, failure: failure("image-load-failed", "The viewer image could not be copied to the hosting machine.", firstLine(copied)) };
            archive = remoteTar;
        }
        const loaded = await transport.run(transport.docker, loadImageArgs(archive), { timeoutMs: 600_000 });
        if (remoteTar !== null) await transport.run("rm", ["-f", remoteTar], { timeoutMs: 20_000 });
        if (!loaded.ok) return { ok: false, failure: failure("image-load-failed", "Docker could not load the bundled viewer image.", firstLine(loaded)) };
        const verified = await transport.run(transport.docker, inspectImageArgs(image.reference), { timeoutMs: 20_000 });
        if (!verified.ok || (image.imageId !== null && verified.stdout.trim() !== image.imageId)) {
            return { ok: false, failure: failure("image-load-failed", "Docker loaded the archive but the image it produced is not the one this build ships.") };
        }
        return { ok: true, value: null };
    }

    async host(request: HostRequest, operationId: string = randomUUID()): Promise<HostAnswer> {
        const controller = new AbortController();
        this.#operations.set(operationId, controller);
        const withSecrets = request.config.auth === "microsoft";
        const board = new StepBoard(
            (steps) => this.#options.onEvent?.({ kind: "progress", operationId, steps }),
            withSecrets ? [] : ["secrets"],
        );
        const done = (answer: HostFailure): HostAnswer => ({ ok: false, failure: answer, steps: board.snapshot() });
        try {
            return await this.#host(request, board, controller.signal, done);
        } finally {
            this.#operations.delete(operationId);
        }
    }

    async #host(request: HostRequest, board: StepBoard, signal: AbortSignal, fail: (failure: HostFailure) => HostAnswer): Promise<HostAnswer> {
        const o = this.#options;
        if (!Number.isInteger(request.hostPort) || request.hostPort < 1024 || request.hostPort > 65535) {
            return fail(failure("invalid-request", "Choose a web port between 1024 and 65535."));
        }
        const withSecrets = request.config.auth === "microsoft";
        if (withSecrets && (o.accounts === null || request.accountRef === undefined)) {
            board.set("secrets", "failed", "A Microsoft account is required.");
            return fail(failure("sign-in-required", "Sign in with a Microsoft account before hosting a bot that uses one."));
        }

        const found = await this.#transport(request.target, signal);
        if (!found.ok) return fail(found.failure);
        const transport = found.value;

        board.set("docker", "running");
        const report = await probeDocker({ runner: transport.run, docker: transport.docker });
        if (!dockerUsable(report)) {
            board.set("docker", "failed", report.message);
            return fail(failure("docker-unavailable", report.message, report.detail));
        }
        board.set("docker", "done", report.message);

        const bundled = await o.bundledImage();
        if (!bundled.ok) {
            board.set("image", "failed", bundled.message);
            return fail(failure("image-missing", bundled.message));
        }
        const id = (o.newId ?? (() => randomUUID().replace(/-/g, "").slice(0, 12)))();
        if (!validInstanceId(id)) return fail(failure("invalid-request", "An instance id could not be created."));
        const names = instanceNames(id);

        const lan = await this.#lanAddress(transport);
        if (lan === null) {
            board.set("docker", "failed", "No LAN address was found on the hosting machine.");
            return fail(failure("unreachable", "The hosting machine has no private network address, so no LAN link can be given. Connect it to the network and try again."));
        }

        const ps = await transport.run(transport.docker, portInUseArgs(), { timeoutMs: 20_000 });
        if (ps.ok && portIsPublished(ps.stdout, request.hostPort)) {
            return fail(failure("port-in-use", `Port ${request.hostPort} is already published by another container on that machine. Choose a different web port.`));
        }

        board.set("image", "running", `Loading ${bundled.image.reference}`);
        const loaded = await this.#loadImage(transport, bundled.image, id);
        if (!loaded.ok) {
            board.set("image", "failed", loaded.failure.message);
            return fail(loaded.failure);
        }
        board.set("image", "done", `${bundled.image.reference} is ready`);

        const created: string[] = [];
        const rollback = async (): Promise<void> => {
            await transport.run(transport.docker, removeContainerArgs(names.container), { timeoutMs: 30_000 });
            for (const volume of created) await transport.run(transport.docker, ["volume", "rm", "-f", volume], { timeoutMs: 30_000 });
        };

        board.set("volumes", "running");
        for (const volume of withSecrets ? [names.configVolume, names.secretsVolume] : [names.configVolume]) {
            const made = await transport.run(transport.docker, createVolumeArgs(volume, id, o.owner), { timeoutMs: 30_000 });
            if (!made.ok) {
                board.set("volumes", "failed", firstLine(made));
                await rollback();
                return fail(failure("command-failed", "Docker could not create the viewer's storage.", firstLine(made)));
            }
            created.push(volume);
        }
        board.set("volumes", "done");

        // A server on the hosting machine's loopback is unreachable from inside a container.
        // `host.docker.internal` (mapped to the host gateway by the run command) reaches it on
        // Docker Desktop and on Linux alike; the machine's own LAN address often does not work,
        // because a container cannot always connect back to its host's LAN address.
        const serverHost = isLoopbackHost(request.config.server.host) ? HOST_GATEWAY_NAME : request.config.server.host;
        const vocabulary = o.vocabulary === undefined ? {} : relevantVocabulary(await o.vocabulary());
        const config: LiveViewerConfig = { ...request.config, server: { ...request.config.server, host: serverHost }, vocabulary };

        board.set("config", "running");
        const wroteConfig = await transport.run(transport.docker, writeVolumeFileArgs(bundled.image.reference, names.configVolume, "/config", "config.json"), { input: configJson(config), timeoutMs: 60_000 });
        if (!wroteConfig.ok) {
            board.set("config", "failed", firstLine(wroteConfig));
            await rollback();
            return fail(failure("command-failed", "The viewer's settings could not be written.", firstLine(wroteConfig)));
        }
        board.set("config", "done");

        if (withSecrets) {
            board.set("secrets", "running");
            let secret: string;
            try {
                const exported = await (o.accounts as LiveViewerAccounts).exportForHosting(request.accountRef as string);
                if (Object.keys(exported.caches).length === 0) throw new Error("empty");
                secret = JSON.stringify({ version: SECRET_FILE_VERSION, clientId: exported.clientId, caches: exported.caches });
            } catch {
                board.set("secrets", "failed", "The Microsoft account has no saved sign-in.");
                await rollback();
                return fail(failure("sign-in-required", "That Microsoft account is not signed in yet. Sign in, then host again."));
            }
            const wroteSecret = await transport.run(transport.docker, writeVolumeFileArgs(bundled.image.reference, names.secretsVolume, "/secrets", "auth.json"), { input: secret, timeoutMs: 60_000 });
            secret = "";
            if (!wroteSecret.ok) {
                board.set("secrets", "failed", "The sign-in could not be stored on the hosting machine.");
                await rollback();
                return fail(failure("command-failed", "The sign-in could not be stored on the hosting machine."));
            }
            board.set("secrets", "done", "Stored in a private volume on the hosting machine.");
        }

        board.set("start", "running");
        const started = await transport.run(transport.docker, runArgs({ id, owner: o.owner, image: bundled.image.reference, hostPort: request.hostPort, withSecrets }), { timeoutMs: 120_000 });
        if (!started.ok) {
            const detail = firstLine(started);
            board.set("start", "failed", detail);
            await rollback();
            const taken = /port is already allocated|address already in use|bind for/i.test(`${started.stderr}`);
            return fail(failure(taken ? "port-in-use" : "command-failed", taken ? `Port ${request.hostPort} is already in use on that machine.` : "Docker could not start the viewer.", detail));
        }
        board.set("start", "done");

        const url = viewerUrl(lan, request.hostPort);
        const verification = await this.#waitForHealth(`${url}health`, request.config.botName, board, signal);
        if (verification === "cancelled") {
            await rollback();
            return fail(failure("cancelled", "Hosting was cancelled and the half-started viewer was removed."));
        }
        if (!verification.linkReachable) {
            const logs = await transport.run(transport.docker, ["logs", "--tail", "12", names.container], { timeoutMs: 20_000 });
            board.set("health", "failed", `This PC could not open ${url}`);
            await rollback();
            return fail(failure("unreachable", `The viewer started but this PC could not open ${url}. A firewall on the hosting machine may be blocking port ${request.hostPort}.`, logs.ok ? logs.stdout.split(/\r?\n/).slice(-3).join(" ").slice(0, 300) : null));
        }
        if (verification.botNote !== null && !verification.botJoined && /^failed/.test(verification.botNote)) {
            board.set("verify", "failed", verification.botNote);
        }

        const instance: ViewerInstance = {
            id,
            name: request.name,
            createdAt: (o.now ?? (() => new Date()))().toISOString(),
            target: request.target,
            hostPort: request.hostPort,
            lanAddress: lan,
            url,
            containerName: names.container,
            image: bundled.image.reference,
            kind: request.config.kind,
            botName: request.config.botName,
            serverLabel: `${request.config.server.host}:${request.config.server.port}`,
            auth: request.config.auth,
            accountRef: withSecrets ? (request.accountRef as string) : null,
        };
        await o.registry.add(instance);
        return { ok: true, instance, verification, steps: board.snapshot() };
    }

    async #waitForHealth(url: string, botName: string, board: StepBoard, signal: AbortSignal): Promise<Verification | "cancelled"> {
        const o = this.#options;
        const fetchHealth = o.fetchHealth ?? defaultFetchHealth;
        const sleep = o.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
        const deadline = (o.healthTimeoutMs ?? 90_000) / (o.healthIntervalMs ?? 2_000);
        board.set("health", "running", `Opening ${url}`);
        let reachable = false;
        let last: HealthReply | null = null;
        for (let attempt = 0; attempt < deadline; attempt += 1) {
            if (signal.aborted) return "cancelled";
            last = await fetchHealth(url, 3_000);
            if (last !== null) {
                reachable = true;
                board.set("health", "done", "The link answered from this PC.");
                if (last.botConnected || last.state === "failed") break;
                board.set("verify", "running", "Waiting for the bot to join the server.");
            }
            await sleep(o.healthIntervalMs ?? 2_000);
        }
        const checkedAt = (o.now ?? (() => new Date()))().toISOString();
        const joined = reachable && last?.botConnected === true;
        if (joined) board.set("verify", "done", `${botName} joined the server.`);
        else if (reachable) board.set("verify", "skipped", last?.state === "failed" ? `failed: ${last.lastError ?? "the bot could not join"}` : "The bot has not joined yet. The link works; it keeps trying.");
        return {
            linkReachable: reachable,
            botJoined: joined,
            botName: last?.botName || botName,
            checkedAt,
            botNote: joined ? null : last === null ? null : last.state === "failed" ? `failed: ${last.lastError ?? "the bot could not join"}` : `the bot is ${last.state}`,
        };
    }

    /* ------------------------------ instance manager ------------------------------ */

    async list(): Promise<readonly InstanceStatus[]> {
        const instances = await this.#options.registry.list();
        return Promise.all(instances.map((instance) => this.#status(instance)));
    }

    async #status(instance: ViewerInstance): Promise<InstanceStatus> {
        const found = await this.#transport(instance.target);
        if (!found.ok) return { instance, state: "unknown", botConnected: null };
        const inspected = await found.value.run(found.value.docker, stateArgs(instance.containerName), { timeoutMs: 15_000 });
        let state: InstanceState = "unknown";
        if (inspected.ok) state = inspected.stdout.trim() === "running" ? "running" : "stopped";
        else if (/no such object|no such container/i.test(`${inspected.stderr}`)) state = "missing";
        let botConnected: boolean | null = null;
        if (state === "running") {
            const reply = await (this.#options.fetchHealth ?? defaultFetchHealth)(`${instance.url}health`, 3_000);
            botConnected = reply === null ? null : reply.botConnected;
        }
        return { instance, state, botConnected };
    }

    async #owned(id: string): Promise<Answer<{ instance: ViewerInstance; transport: Transport }>> {
        const instance = await this.#options.registry.get(id);
        if (instance === null) return { ok: false, failure: failure("not-owned", "This installation did not create that viewer.") };
        const found = await this.#transport(instance.target);
        if (!found.ok) return found;
        return { ok: true, value: { instance, transport: found.value } };
    }

    async control(id: string, action: "start" | "stop" | "restart"): Promise<Answer<InstanceStatus>> {
        const owned = await this.#owned(id);
        if (!owned.ok) return owned;
        const { instance, transport } = owned.value;
        const output = await transport.run(transport.docker, [action, instance.containerName], { timeoutMs: 60_000 });
        if (!output.ok) return { ok: false, failure: failure("command-failed", `Docker could not ${action} the viewer.`, firstLine(output)) };
        return { ok: true, value: await this.#status(instance) };
    }

    async logs(id: string, tail = 200): Promise<Answer<string>> {
        if (!Number.isInteger(tail) || tail < 1 || tail > 2000) return { ok: false, failure: failure("invalid-request", "Choose between 1 and 2000 log lines.") };
        const owned = await this.#owned(id);
        if (!owned.ok) return owned;
        const { instance, transport } = owned.value;
        const output = await transport.run(transport.docker, ["logs", "--tail", String(tail), instance.containerName], { timeoutMs: 30_000 });
        if (!output.ok) return { ok: false, failure: failure("command-failed", "Docker could not read the viewer's log.", firstLine(output)) };
        return { ok: true, value: `${output.stdout}\n${output.stderr}`.slice(-200_000) };
    }

    /** Removes the container, its two volumes and the record. The caller passes the instance name back as the confirmation. */
    async remove(id: string, confirmName: string): Promise<Answer<null>> {
        const owned = await this.#owned(id);
        if (!owned.ok) return owned;
        const { instance, transport } = owned.value;
        if (confirmName !== instance.name) return { ok: false, failure: failure("invalid-request", "Type the viewer's name to confirm removing it.") };
        const names = instanceNames(instance.id);
        const removed = await transport.run(transport.docker, removeContainerArgs(names.container), { timeoutMs: 60_000 });
        if (!removed.ok && !/no such container/i.test(removed.stderr)) return { ok: false, failure: failure("command-failed", "Docker could not remove the viewer.", firstLine(removed)) };
        for (const volume of [names.configVolume, names.secretsVolume]) await transport.run(transport.docker, ["volume", "rm", "-f", volume], { timeoutMs: 30_000 });
        await this.#options.registry.remove(instance.id);
        return { ok: true, value: null };
    }
}
