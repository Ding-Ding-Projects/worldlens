import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import { execFileCommandRunner, type CommandOutput, type CommandRunner } from "../runtime/command.js";
import { probeDocker, type DockerReport } from "../runtime/docker.js";

/** Label namespace owned by this application. Unlabelled containers are never managed. */
export const DOCKER_HOSTING_LABEL = "com.worldlens.docker-hosting";
export const DOCKER_HOSTING_INSTANCE_LABEL = "com.worldlens.docker-instance";
export const DOCKER_HOSTING_NAME_LABEL = "com.worldlens.docker-name";
export const DOCKER_HOSTING_VERSION_LABEL = "com.worldlens.docker-version";
export const DOCKER_HOSTING_OWNER_LABEL = "com.worldlens.docker-owner";

const ID = /^[a-z][a-z0-9-]{0,62}$/;
const IMAGE = /^[a-zA-Z0-9][a-zA-Z0-9._/@:-]{0,254}$/;
const MAX_NAME = 120;
const MAX_LOG_BYTES = 512 * 1024;
const MAX_RECORDS = 256;

export type ManagedState = "created" | "running" | "paused" | "exited" | "unknown";

export interface ManagedInstance {
    readonly id: string;
    readonly name: string;
    readonly image: string;
    readonly containerId: string | null;
    readonly state: ManagedState;
    readonly ports: readonly number[];
    readonly volumes: readonly string[];
    readonly updatedAt: string;
    readonly health: string | null;
    readonly fingerprint: string | null;
}

export interface DockerHostingSnapshot {
    readonly daemon: DockerReport["status"] | "ready";
    readonly clientVersion: string | null;
    readonly serverVersion: string | null;
    readonly message: string;
    readonly detail: string | null;
    readonly containers: readonly (ManagedInstance & { readonly status: string; readonly running: boolean; readonly owned: true; readonly logsAvailable: boolean; readonly mapCount: number | null; readonly configState: "current" | "outdated" | "unknown" })[];
    readonly images: readonly string[];
    readonly volumes: readonly string[];
    readonly checkedAt: string;
}

export interface CreateInstanceRequest {
    readonly id: string;
    readonly name: string;
    readonly image: string;
    readonly ports?: readonly number[];
    readonly volumes?: readonly string[];
    readonly removeToken?: string;
}

export type ManagerFailureCode =
    | "invalid-request"
    | "docker-unavailable"
    | "not-found"
    | "not-owned"
    | "command-failed"
    | "storage-failed";

export interface ManagerFailure {
    readonly code: ManagerFailureCode;
    readonly message: string;
    readonly detail: string | null;
}

export type ManagerAnswer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: ManagerFailure };

export interface DockerHostingManagerOptions {
    readonly docker?: string;
    readonly runner?: CommandRunner;
    readonly recordFile?: string;
    readonly probe?: (options?: { readonly docker?: string; readonly runner?: CommandRunner }) => Promise<DockerReport>;
    readonly now?: () => string;
    readonly managedRoot?: string;
    readonly onEvent?: (event: unknown) => void;
}

interface StoredRecord {
    readonly version: 1;
    readonly instances: readonly ManagedInstance[];
}

interface DockerJsonContainer {
    readonly ID?: unknown;
    readonly Names?: unknown;
    readonly Image?: unknown;
    readonly State?: unknown;
    readonly Status?: unknown;
    readonly Labels?: unknown;
    readonly Ports?: unknown;
    readonly Mounts?: unknown;
}

function failure(code: ManagerFailureCode, message: string, detail: string | null = null): ManagerFailure {
    return { code, message, detail };
}

function outputDetail(output: CommandOutput): string | null {
    const text = `${output.stderr}\n${output.stdout}`.trim();
    return text === "" ? null : text.slice(0, 2_000);
}

function validateId(value: unknown): value is string {
    return typeof value === "string" && ID.test(value);
}

function validateImage(value: unknown): value is string {
    return typeof value === "string" && IMAGE.test(value) && /@sha256:[a-f0-9]{64}$/.test(value) && !value.includes("\\") && !value.includes(" ");
}

function validatePort(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 65_536;
}

function safeName(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_NAME && !/[\r\n]/.test(value);
}

function parseJsonLines(stdout: string): DockerJsonContainer[] {
    const result: DockerJsonContainer[] = [];
    for (const line of stdout.split(/\r?\n/)) {
        if (line.trim() === "") continue;
        try {
            const value: unknown = JSON.parse(line);
            if (typeof value === "object" && value !== null) result.push(value as DockerJsonContainer);
        } catch {
            // Docker may write a warning alongside JSON. Ignore that line, never invent a record.
        }
    }
    return result;
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function managedContainer(value: DockerJsonContainer, owner: string): ManagedInstance | null {
    const labels = typeof value.Labels === "object" && value.Labels !== null ? value.Labels as Record<string, unknown> : {};
    if (labels[DOCKER_HOSTING_LABEL] !== "true" || labels[DOCKER_HOSTING_OWNER_LABEL] !== owner) return null;
    const id = asString(labels[DOCKER_HOSTING_INSTANCE_LABEL]);
    const name = asString(labels[DOCKER_HOSTING_NAME_LABEL]) ?? asString(value.Names)?.replace(/^\//, "");
    const image = asString(value.Image) ?? "";
    if (id === null || !validateId(id) || name === null || !safeName(name) || !validateImage(image)) return null;
    const state = asString(value.State);
    const normalized: ManagedState = state === "running" || state === "paused" || state === "created" || state === "exited" ? state : "unknown";
    const ports = Array.isArray(value.Ports)
        ? value.Ports.map((entry) => typeof entry === "object" && entry !== null ? (entry as { PublicPort?: unknown }).PublicPort : null).filter(validatePort)
        : [];
    const volumes = Array.isArray(value.Mounts)
        ? value.Mounts.map((entry) => typeof entry === "object" && entry !== null ? asString((entry as { Source?: unknown }).Source) : null).filter((entry): entry is string => entry !== null)
        : [];
    return {
        id,
        name,
        image,
        containerId: asString(value.ID),
        state: normalized,
        ports,
        volumes,
        updatedAt: new Date().toISOString(),
        health: asString(value.Status),
        fingerprint: asString(labels["com.worldlens.fingerprint"]),
    };
}

export class DockerHostingManager {
    private readonly docker: string;
    private readonly runner: CommandRunner;
    private readonly recordFile: string | null;
    private readonly probe: NonNullable<DockerHostingManagerOptions["probe"]>;
    private readonly now: () => string;
    private readonly managedRoot: string | null;
    private readonly owner: string;
    private readonly removeTokens = new Map<string, { readonly id: string; readonly expiresAt: number }>();
    private readonly operations = new Map<string, AbortController>();
    private readonly onEvent: (event: unknown) => void;
    private recordsCache: ManagedInstance[] | null = null;

    public constructor(options: DockerHostingManagerOptions = {}) {
        this.docker = options.docker ?? "docker";
        this.runner = options.runner ?? execFileCommandRunner;
        this.recordFile = options.recordFile ?? null;
        this.probe = options.probe ?? ((probeOptions) => probeDocker({
            ...(probeOptions?.docker === undefined ? {} : { docker: probeOptions.docker }),
            ...(probeOptions?.runner === undefined ? {} : { runner: probeOptions.runner }),
        }));
        this.now = options.now ?? (() => new Date().toISOString());
        this.managedRoot = options.managedRoot ?? null;
        this.owner = `worldlens-${createHash("sha256").update(this.recordFile ?? "no-record-file").digest("hex").slice(0, 20)}`;
        this.onEvent = options.onEvent ?? (() => undefined);
    }

    public async status(): Promise<ManagerAnswer<DockerReport>> {
        try {
            return { ok: true, value: await this.probe({ docker: this.docker, runner: this.runner }) };
        } catch (error) {
            return { ok: false, failure: failure("docker-unavailable", "Docker could not be checked on this computer.", String(error)) };
        }
    }

    public async list(): Promise<ManagerAnswer<readonly ManagedInstance[]>> {
        const ready = await this.requireReady();
        if (!ready.ok) return ready;
        const output = await this.runner(this.docker, ["ps", "-a", "--filter", `label=${DOCKER_HOSTING_LABEL}=true`, "--format", "{{json .}}"]);
        if (!output.ok) return { ok: false, failure: failure("command-failed", "Docker could not list app-owned instances.", outputDetail(output)) };
        const records = parseJsonLines(output.stdout).map((entry) => managedContainer(entry, this.owner)).filter((entry): entry is ManagedInstance => entry !== null);
        this.recordsCache = records;
        await this.persist(records);
        return { ok: true, value: records };
    }

    /** One bounded snapshot for the renderer's manager card. */
    public async snapshot(): Promise<ManagerAnswer<DockerHostingSnapshot>> {
        const daemon = await this.status();
        if (!daemon.ok) return daemon;
        if (daemon.value.status !== "available") return { ok: true, value: { daemon: daemon.value.status, clientVersion: daemon.value.clientVersion, serverVersion: daemon.value.serverVersion, message: daemon.value.message, detail: daemon.value.detail, containers: [], images: [], volumes: [], checkedAt: this.now() } };
        const listed = await this.list();
        if (!listed.ok) return listed;
        const [images, volumes] = await Promise.all([
            this.runner(this.docker, ["image", "ls", "--digests", "--filter", `label=${DOCKER_HOSTING_OWNER_LABEL}=${this.owner}`, "--format", "{{.Repository}}@{{.Digest}}"]),
            this.runner(this.docker, ["volume", "ls", "--filter", `label=${DOCKER_HOSTING_OWNER_LABEL}=${this.owner}`, "--format", "{{.Name}}"]),
        ]);
        const asLines = (output: CommandOutput): string[] => output.ok ? [...new Set(output.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].slice(0, MAX_RECORDS) : [];
        const asDigestImages = (output: CommandOutput): string[] => output.ok
            ? [...new Set(output.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^.+@sha256:[a-f0-9]{64}$/.test(line) && !line.includes("<none>")))].slice(0, MAX_RECORDS)
            : [];
        const containers = listed.value.map((entry) => ({ ...entry, status: entry.health ?? entry.state, running: entry.state === "running", owned: true as const, logsAvailable: entry.containerId !== null, mapCount: null, configState: "unknown" as const }));
        return { ok: true, value: { daemon: "ready", clientVersion: daemon.value.clientVersion, serverVersion: daemon.value.serverVersion, message: daemon.value.message, detail: daemon.value.detail, containers, images: asDigestImages(images), volumes: asLines(volumes), checkedAt: this.now() } };
    }

    public async create(request: CreateInstanceRequest): Promise<ManagerAnswer<ManagedInstance>> {
        const checked = this.validateCreate(request);
        if (!checked.ok) return checked;
        const ready = await this.requireReady();
        if (!ready.ok) return ready;
        const ports = request.ports ?? [];
        const conflict = await this.probePorts(ports);
        if (conflict !== null) return { ok: false, failure: conflict };
        const fingerprint = this.fingerprint(request);
        for (const volume of request.volumes ?? []) if (!volume.includes(":")) {
            const inspected = await this.runner(this.docker, ["volume", "inspect", "--format", "{{json .}}", volume]);
            if (inspected.ok && !inspected.stdout.includes(`${DOCKER_HOSTING_OWNER_LABEL}=${this.owner}`)) return { ok: false, failure: failure("not-owned", `Named volume '${volume}' is not owned by this installation.`) };
            const created = inspected.ok ? inspected : await this.runner(this.docker, ["volume", "create", "--label", `${DOCKER_HOSTING_LABEL}=true`, "--label", `${DOCKER_HOSTING_OWNER_LABEL}=${this.owner}`, volume]);
            if (!created.ok) return { ok: false, failure: failure("command-failed", `Docker could not create owned volume '${volume}'.`, outputDetail(created)) };
        }
        const args = ["create", "--label", `${DOCKER_HOSTING_LABEL}=true`, "--label", `${DOCKER_HOSTING_OWNER_LABEL}=${this.owner}`, "--label", `${DOCKER_HOSTING_INSTANCE_LABEL}=${request.id}`, "--label", `${DOCKER_HOSTING_NAME_LABEL}=${request.name}`, "--label", `${DOCKER_HOSTING_VERSION_LABEL}=1`, "--label", `com.worldlens.fingerprint=${fingerprint}`, ...this.portArgs(ports), ...this.volumeArgs(request.volumes ?? []), request.image];
        const output = await this.runner(this.docker, args);
        if (!output.ok) return { ok: false, failure: failure("command-failed", "Docker could not create this app-owned instance.", outputDetail(output)) };
        const refreshed = await this.inspectById(request.id);
        if (!refreshed.ok) {
            const rollbackId = output.stdout.trim().split(/\r?\n/)[0] ?? request.id;
            await this.runner(this.docker, ["rm", "-f", rollbackId]);
            const rollbackCheck = await this.runner(this.docker, ["inspect", rollbackId]);
            if (rollbackCheck.ok) return { ok: false, failure: failure("command-failed", "Docker verification failed and rollback could not be proven; the workload is retained for manual review.") };
            return { ok: false, failure: failure("command-failed", "Docker created an instance but verification failed; the unverified container was removed.", refreshed.failure.message) };
        }
        const mapped = await this.runner(this.docker, ["port", refreshed.value.containerId ?? request.id]);
        if (!mapped.ok || ports.some((port) => !mapped.stdout.includes(`127.0.0.1:${port}`))) {
            await this.runner(this.docker, ["rm", "-f", refreshed.value.containerId ?? request.id]);
            return { ok: false, failure: failure("command-failed", "Docker created an instance but its loopback port mapping could not be verified; it was rolled back.", outputDetail(mapped)) };
        }
        return refreshed;
    }

    public async start(id: string): Promise<ManagerAnswer<ManagedInstance>> { return this.mutate(id, "start"); }
    public async stop(id: string): Promise<ManagerAnswer<ManagedInstance>> { return this.mutate(id, "stop"); }
    public async restart(id: string): Promise<ManagerAnswer<ManagedInstance>> { return this.mutate(id, "restart"); }

    public async update(id: string, image: string): Promise<ManagerAnswer<ManagedInstance>> {
        if (!validateId(id) || !validateImage(image)) return { ok: false, failure: failure("invalid-request", "An instance id and a digest-pinned image reference are required.") };
        return { ok: false, failure: failure("invalid-request", "Image updates are disabled until a transactional recreate plan can preserve mounts, ports, and ownership.") };
    }

    public async remove(id: string, token?: string): Promise<ManagerAnswer<null>> {
        if (!validateId(id)) return { ok: false, failure: failure("invalid-request", "A safe instance id is required.") };
        const issued = token === undefined ? undefined : this.removeTokens.get(token);
        if (issued === undefined || issued.id !== id || issued.expiresAt < Date.now()) return { ok: false, failure: failure("invalid-request", "A fresh one-use removal confirmation is required.") };
        this.removeTokens.delete(token as string);
        const ready = await this.requireReady();
        if (!ready.ok) return ready;
        const current = await this.inspectById(id);
        if (!current.ok) return { ok: false, failure: current.failure };
        const output = await this.runner(this.docker, ["rm", "-f", current.value.containerId ?? id]);
        if (!output.ok) return { ok: false, failure: failure("command-failed", "Docker could not remove this app-owned instance.", outputDetail(output)) };
        await this.persist((this.recordsCache ?? []).filter((entry) => entry.id !== id));
        return { ok: true, value: null };
    }

    public issueRemoveToken(id: string): ManagerAnswer<string> {
        if (!validateId(id)) return { ok: false, failure: failure("invalid-request", "A safe instance id is required.") };
        const token = randomBytes(24).toString("hex");
        this.removeTokens.set(token, { id, expiresAt: Date.now() + 60_000 });
        return { ok: true, value: token };
    }

    public cancel(operationId: string): boolean {
        const controller = this.operations.get(operationId);
        if (controller === undefined) return false;
        controller.abort();
        this.operations.delete(operationId);
        return true;
    }

    public async logs(id: string, tail = 200): Promise<ManagerAnswer<string>> {
        if (!validateId(id) || !Number.isInteger(tail) || tail < 1 || tail > 2_000) return { ok: false, failure: failure("invalid-request", "A safe instance id and a bounded log tail are required.") };
        const current = await this.inspectById(id);
        if (!current.ok) return current;
        const output = await this.runner(this.docker, ["logs", "--tail", String(tail), current.value.containerId ?? id]);
        if (!output.ok) return { ok: false, failure: failure("command-failed", "Docker could not read this instance's logs.", outputDetail(output)) };
        return { ok: true, value: `${output.stdout}\n${output.stderr}`.slice(-MAX_LOG_BYTES) };
    }

    private async mutate(id: string, command: "start" | "stop" | "restart"): Promise<ManagerAnswer<ManagedInstance>> {
        if (!validateId(id)) return { ok: false, failure: failure("invalid-request", "A safe instance id is required.") };
        const ready = await this.requireReady();
        if (!ready.ok) return ready;
        const current = await this.inspectById(id);
        if (!current.ok) return current;
        const controller = new AbortController();
        const operationId = `${id}:${command}:${Date.now()}`;
        this.operations.set(operationId, controller);
        this.onEvent({ type: "started", operationId, operation: command, instanceId: id, at: this.now() });
        this.onEvent({ type: "progress", operationId, phase: command, message: `Running docker ${command}`, done: 0, total: 1, at: this.now() });
        const output = await this.runner(this.docker, [command, current.value.containerId ?? id], { signal: controller.signal });
        this.operations.delete(operationId);
        if (controller.signal.aborted) {
            this.onEvent({ type: "cancelled", operationId, at: this.now() });
            return { ok: false, failure: failure("command-failed", "The Docker operation was cancelled before completion.") };
        }
        if (!output.ok) {
            const result = { ok: false as const, failure: failure("command-failed", `Docker could not ${command} this app-owned instance.`, outputDetail(output)) };
            this.onEvent({ type: "failed", operationId, failure: result.failure, at: this.now() });
            return result;
        }
        const result = await this.inspectById(id);
        this.onEvent({ type: "progress", operationId, phase: command, message: `Docker ${command} completed`, done: 1, total: 1, at: this.now() });
        if (result.ok) this.onEvent({ type: "finished", operationId, instanceId: id, snapshot: await this.snapshot(), at: this.now() });
        return result;
    }

    private async inspectById(id: string): Promise<ManagerAnswer<ManagedInstance>> {
        const output = await this.runner(this.docker, ["ps", "-a", "--filter", `label=${DOCKER_HOSTING_INSTANCE_LABEL}=${id}`, "--format", "{{json .}}"]);
        if (!output.ok) return { ok: false, failure: failure("command-failed", "Docker could not inspect the app-owned instance.", outputDetail(output)) };
        const foundEntries = parseJsonLines(output.stdout).filter((entry) => {
            const labels = typeof entry.Labels === "object" && entry.Labels !== null ? entry.Labels as Record<string, unknown> : {};
            return labels[DOCKER_HOSTING_OWNER_LABEL] === this.owner;
        }).map((entry) => managedContainer(entry, this.owner)).filter((entry): entry is ManagedInstance => entry !== null && entry.id === id);
        if (foundEntries.length === 0) return { ok: false, failure: failure("not-found", "That app-owned Docker instance was not found.") };
        if (foundEntries.length !== 1) return { ok: false, failure: failure("command-failed", "Duplicate app-owned instance labels were found; no mutation was attempted.") };
        const found = foundEntries[0] as ManagedInstance;
        const remembered = this.recordsCache?.find((entry) => entry.id === id);
        if (remembered?.fingerprint !== null && remembered?.fingerprint !== undefined && found.fingerprint !== remembered.fingerprint) return { ok: false, failure: failure("command-failed", "The Docker instance fingerprint changed; no mutation was attempted.") };
        const nextRecords = [...(this.recordsCache ?? []).filter((entry) => entry.id !== id), found];
        this.recordsCache = nextRecords;
        await this.persist(nextRecords);
        return { ok: true, value: found };
    }

    private async requireReady(): Promise<ManagerAnswer<null>> {
        const report = await this.status();
        return report.ok && report.value.status === "available"
            ? { ok: true, value: null }
            : { ok: false, failure: report.ok ? failure("docker-unavailable", report.value.message, report.value.detail) : report.failure };
    }

    private validateCreate(request: CreateInstanceRequest): ManagerAnswer<null> {
        if (!validateId(request.id) || !safeName(request.name) || !validateImage(request.image)) return { ok: false, failure: failure("invalid-request", "Instance id, display name, and digest-pinned image are required.") };
        if ((request.ports ?? []).some((port) => !validatePort(port)) || new Set(request.ports ?? []).size !== (request.ports ?? []).length) return { ok: false, failure: failure("invalid-request", "Ports must be unique integers from 1 through 65535.") };
        if ((request.volumes ?? []).some((volume) => !this.validVolume(volume))) return { ok: false, failure: failure("invalid-request", "Volumes must be named Docker volumes or reside under the app-owned data root.") };
        return { ok: true, value: null };
    }

    private portArgs(ports: readonly number[]): string[] { return ports.flatMap((port) => ["-p", `127.0.0.1:${port}:${port}`]); }
    private volumeArgs(volumes: readonly string[]): string[] { return volumes.flatMap((volume) => ["-v", volume]); }

    private async persist(instances: readonly ManagedInstance[]): Promise<void> {
        if (this.recordFile === null) return;
        if (instances.length > MAX_RECORDS) throw new Error("Docker hosting record limit exceeded");
        await mkdir(dirname(this.recordFile), { recursive: true });
        const value: StoredRecord = { version: 1, instances };
        const temporary = `${this.recordFile}.tmp-${process.pid}-${Date.now()}`;
        await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
        const { rename } = await import("node:fs/promises");
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            try { await rename(temporary, this.recordFile); lastError = null; break; } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1))); }
        }
        if (lastError !== null) throw lastError;
    }

    private validVolume(volume: unknown): volume is string {
        if (typeof volume !== "string" || volume.length === 0 || volume.length > 512 || /[\r\n]/.test(volume)) return false;
        const separator = volume.indexOf(":");
        if (separator < 0) return /^worldlens-[a-z0-9][a-z0-9_.-]{0,120}$/.test(volume);
        return false;
    }

    private fingerprint(request: CreateInstanceRequest): string {
        return createHash("sha256").update(JSON.stringify({ id: request.id, image: request.image, ports: request.ports ?? [], volumes: request.volumes ?? [] })).digest("hex").slice(0, 32);
    }

    private async probePorts(ports: readonly number[]): Promise<ManagerFailure | null> {
        for (const port of ports) {
            const busy = await new Promise<boolean>((resolve) => {
                const socket = createConnection({ host: "127.0.0.1", port });
                const finish = (value: boolean): void => { socket.destroy(); resolve(value); };
                socket.setTimeout(250, () => finish(false));
                socket.once("connect", () => finish(true));
                socket.once("error", () => finish(false));
            });
            if (busy) return failure("invalid-request", `Port ${port} is already in use on loopback; choose another port.`);
        }
        return null;
    }

    public async loadRecords(): Promise<ManagerAnswer<readonly ManagedInstance[]>> {
        if (this.recordFile === null) return { ok: true, value: this.recordsCache ?? [] };
        try {
            const parsed: unknown = JSON.parse(await readFile(this.recordFile, "utf8"));
            if (typeof parsed !== "object" || parsed === null || (parsed as StoredRecord).version !== 1 || !Array.isArray((parsed as StoredRecord).instances)) return { ok: false, failure: failure("storage-failed", "The Docker hosting record is not a valid version 1 file.") };
            const entries = (parsed as StoredRecord).instances.filter((entry): entry is ManagedInstance => {
                if (typeof entry !== "object" || entry === null) return false;
                const item = entry as ManagedInstance;
                return validateId(item.id) && safeName(item.name) && validateImage(item.image) && (item.containerId === null || typeof item.containerId === "string") && Array.isArray(item.ports) && Array.isArray(item.volumes);
            });
            this.recordsCache = entries.slice(0, MAX_RECORDS);
            return { ok: true, value: this.recordsCache };
        } catch (error) {
            if (typeof error === "object" && error !== null && "code" in error && (error as { readonly code?: unknown }).code === "ENOENT") return { ok: true, value: [] };
            return { ok: false, failure: failure("storage-failed", "The Docker hosting record could not be read.", String(error)) };
        }
    }
}
