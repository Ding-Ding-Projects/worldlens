/**
 * Putting the hosting pieces together with the app's real surroundings.
 *
 * `hostMap` and the manager take everything they depend on as parameters so the tests need
 * no Docker. This file is the one place that supplies the real ones: where renders live,
 * which SSH hosts are saved and where their trust file is, where the bundled image is, and
 * where the registry is kept.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SshTarget } from "@worldlens/dockhand";
import { renderWorkspace } from "../render/workspace.js";
import type { VocabularyStore } from "../vocabulary/store.js";
import { localExecutor, sshExecutor, type Executor } from "./exec.js";
import { hostMap, type HostMapDeps } from "./hostMap.js";
import { ShareHostManager } from "./manager.js";
import { checkPort } from "./ports.js";
import { createFileRegistry, type InstanceRegistry } from "./registry.js";
import { listMapSizes } from "./mapPack.js";
import { archFromDocker } from "./bundledImage.js";
import { lastLines } from "./exec.js";
import type { HostMapEvent, HostMapOutcome, HostMapRequest, HostTarget, MapChoice, PortCheck, TargetCheck } from "./types.js";
import { wordingFromStore } from "./wording.js";

export interface ShareHostOptions {
    /** `<storageDir>` that holds one folder per render. */
    readonly storageDir: () => string;
    /** The app's user-data folder; the instance registry lives inside it. */
    readonly userDataDir: () => string;
    /** The saved SSH host with this id, or null. Hosts are saved by the remote settings. */
    readonly sshTarget: (targetId: string) => SshTarget | null;
    /** The app's own known_hosts, the only trust store this feature uses for SSH. */
    readonly knownHostsFile: () => string;
    readonly userKnownHostsFile?: () => string | null;
    /** Folder holding `mapserver-image.json` and the image tars. */
    readonly bundledImageDir: () => string;
    readonly vocabulary?: Pick<VocabularyStore, "read">;
    readonly registry?: InstanceRegistry;
    /** Replaces the real executors in tests. */
    readonly executorFor?: (target: HostTarget) => Promise<Executor | null>;
}

export interface ShareHostService {
    readonly registry: InstanceRegistry;
    readonly manager: ShareHostManager;
    check(target: HostTarget): Promise<TargetCheck>;
    maps(renderId: string): Promise<readonly MapChoice[]>;
    checkPort(target: HostTarget, port: number): Promise<PortCheck>;
    host(request: HostMapRequest, onEvent: (event: HostMapEvent) => void, signal?: AbortSignal): Promise<HostMapOutcome>;
}

export function createShareHostService(options: ShareHostOptions): ShareHostService {
    const registry = options.registry ?? createFileRegistry(join(options.userDataDir(), "sharehost", "instances.json"));
    const executorFor = options.executorFor ?? ((target: HostTarget): Promise<Executor | null> => {
        if (target.kind === "local") return Promise.resolve(localExecutor());
        const ssh = options.sshTarget(target.targetId);
        if (ssh === null) return Promise.resolve(null);
        return Promise.resolve(sshExecutor({ target: ssh, knownHostsFile: options.knownHostsFile(), userKnownHostsFile: options.userKnownHostsFile?.() ?? null }));
    });
    const deps: HostMapDeps = {
        executorFor,
        webRootFor: (renderId) => renderWorkspace(options.storageDir(), renderId).webRoot,
        bundledImageDir: options.bundledImageDir,
        registry,
        tempDir: () => tmpdir(),
        ...(options.vocabulary === undefined ? {} : { wording: () => wordingFromStore(options.vocabulary as Pick<VocabularyStore, "read">) }),
    };
    const manager = new ShareHostManager({ registry, executorFor, bundledImageDir: options.bundledImageDir });
    return {
        registry,
        manager,
        async check(target) {
            const executor = await executorFor(target);
            if (executor === null) return { ok: false, where: "unknown host", dockerVersion: null, arch: null, message: "That SSH host is not saved." };
            const info = await executor.exec(executor.docker, ["info", "--format", "{{.ServerVersion}}|{{.Architecture}}"], { timeoutMs: 20_000 });
            if (!info.ok) return { ok: false, where: executor.label, dockerVersion: null, arch: null, message: lastLines(info) || "Docker did not answer." };
            const [version, arch] = info.stdout.trim().split("|");
            return { ok: true, where: executor.label, dockerVersion: version ?? null, arch: archFromDocker(arch ?? ""), message: "Docker is running." };
        },
        maps: (renderId) => listMapSizes(renderWorkspace(options.storageDir(), renderId).webRoot),
        async checkPort(target, port) {
            const executor = await executorFor(target);
            if (executor === null) return { free: false, suggested: port };
            const known = (await registry.list()).filter((record) => record.target.kind === target.kind && (target.kind === "local" || (record.target.kind === "ssh" && record.target.targetId === target.targetId)));
            return checkPort({ executor, port, known });
        },
        host: (request, onEvent, signal) => hostMap(deps, request, onEvent, signal),
    };
}
