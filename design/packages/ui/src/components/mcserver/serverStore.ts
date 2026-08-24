/**
 * The live state of every hosted Minecraft server this installation knows about.
 *
 * Mirrors the shape of `locks/lockStore.ts` deliberately: a host interface probed from the
 * bridge, a store that is honest about not having one, and every mutating call answering
 * `{ ok, value } | { ok, failure }` rather than throwing - the same contract the preload
 * bridge already promises, carried straight through rather than flattened into exceptions.
 *
 * `canList: false` is not "zero servers". A build with no host, or a build whose main
 * process has not wired the `mcserver` namespace yet, cannot say whether there are any
 * servers at all, and the list screen must say that rather than showing an empty state.
 *
 * Beyond the list/lifecycle/files surface, this also carries the create-wizard's needs
 * (catalogue, java resolution, create) and the operational screens (plugins, players,
 * adoption, worlds, backup, the web console). Every one of those is optional on
 * `McServerHost`: an older shell build that has not wired a given namespace yet still
 * resolves a usable host for the calls it does support, and a caller reaching for a
 * namespace that is not there gets a clear "not available in this build" answer instead
 * of a thrown exception.
 */

import { computed, reactive, ref, shallowRef, type ComputedRef, type Ref } from "vue";

import type { InstanceStatus, ServerRecord, TransportCapabilities } from "./serverModel.js";

export interface Answer<T> {
    readonly ok: boolean;
    readonly value?: T;
    readonly failure?: { readonly code: string; readonly message: string; readonly detail: string | null };
}

export interface FileEntry {
    readonly name: string;
    readonly kind: "file" | "directory" | "symlink" | "other";
    readonly size: number | null;
    readonly modifiedAt: string | null;
}

export interface FileBlob {
    readonly bytes: Uint8Array;
    readonly hash: string;
    readonly size: number;
    readonly truncated: boolean;
}

export interface WriteReceipt {
    readonly hash: string;
    readonly size: number;
    readonly writtenAt: string;
    readonly backupPath: string | null;
}

export interface ConsoleLine {
    readonly stream: "stdout" | "stderr" | "app";
    readonly text: string;
    readonly at: string;
}

export interface ProbeResult {
    readonly reachable: boolean;
    readonly runtimeVersion: string | null;
    readonly message: string;
    readonly checkedAt: string;
    readonly capabilities: TransportCapabilities | null;
}

/* -------------------------------------------------------------------------- */
/* Catalogue + Java resolution, for the create wizard                         */
/* -------------------------------------------------------------------------- */

export type CatalogueFlavourId = "vanilla" | "paper" | "velocity" | "purpur" | "fabric" | "forge" | "neoforge";

export type VersionStability = "release" | "snapshot";

export interface CatalogueVersionEntry {
    readonly version: string;
    readonly stability: VersionStability;
    readonly javaFeature: number;
    readonly downloadUrl: string | null;
    readonly sha256: string | null;
    /** When it was published, ISO-8601, or null where the upstream API does not say. */
    readonly releasedAt: string | null;
}

export interface CatalogueFlavour {
    readonly flavour: CatalogueFlavourId;
    readonly versions: readonly CatalogueVersionEntry[];
    readonly complete?: boolean;
    /** Optional mod-loader metadata supplied by catalogues that publish it. */
    readonly loaderVersions?: readonly string[];
    readonly commonApiLibraries?: readonly string[];
}

export interface CatalogueSnapshot {
    readonly flavours: readonly CatalogueFlavour[];
    readonly fetchedAt: string;
    readonly stale: boolean;
    readonly completeness?: "complete" | "partial";
    readonly failures: readonly { readonly flavour: CatalogueFlavourId; readonly reason: string }[];
}

export interface JavaResolution {
    readonly found: boolean;
    readonly executable: string | null;
    readonly source: "JAVA_HOME" | "PATH" | "provisioned" | null;
    readonly version: string | null;
    readonly requiredFeature: number;
    readonly message: string;
}

export interface JavaProvisionProgress {
    readonly phase: "downloading" | "extracting" | "verifying" | "done" | "failed";
    readonly receivedBytes: number;
    readonly totalBytes: number | null;
    readonly message: string;
}

export interface CreateServerRequest {
    readonly id: string;
    readonly name: string;
    readonly flavour: string;
    readonly version: string;
    readonly memoryMb: number;
    readonly acceptedEula: boolean;
    readonly provisionJavaIfMissing?: boolean;
    readonly fabricInstallerVersion?: string;
    readonly loaderVersion?: string;
    readonly modsDirectory?: string;
    readonly preinstallApiLibraries?: readonly string[];
    readonly runtime?: "local-process" | "local-docker";
    readonly dockerPlan?: {
        readonly image: string;
        readonly imageVerified: boolean;
        readonly containerRef: string;
        readonly serverDir: string;
        readonly ports: readonly { readonly host: number; readonly container: number }[];
    };
}

/* -------------------------------------------------------------------------- */
/* Plugins / mods                                                             */
/* -------------------------------------------------------------------------- */

export type PluginSourceId = "modrinth" | "hangar" | "spigot";

export interface PluginSearchResult {
    readonly sourceId: PluginSourceId;
    readonly projectId: string;
    readonly name: string;
    readonly summary: string;
    readonly installable: boolean;
    readonly downloads: number | null;
    readonly iconUrl: string | null;
}

export interface PluginVersionEntry {
    readonly id: string;
    readonly name: string;
    readonly versionNumber: string;
    readonly gameVersions: readonly string[];
    readonly compatible: boolean | null;
}

export interface InstalledPlugin {
    readonly path: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly sourceId: PluginSourceId | null;
    readonly projectId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Players                                                                    */
/* -------------------------------------------------------------------------- */

export interface PlayerEntry {
    readonly name: string;
    readonly online: boolean;
    readonly op: boolean;
    readonly banned: boolean;
    readonly whitelisted: boolean;
}

/* -------------------------------------------------------------------------- */
/* Adoption                                                                   */
/* -------------------------------------------------------------------------- */

export interface AdoptionCandidate {
    readonly containerId: string;
    readonly containerName: string;
    readonly image: string;
    readonly guessedFlavour: string | null;
    readonly guessedVersion: string | null;
    readonly confidence?: "high" | "medium" | "low";
    readonly evidence?: readonly string[];
    readonly mounts?: readonly { readonly source: string; readonly destination: string }[];
    readonly ports?: readonly { readonly container: number; readonly host: number | null }[];
    readonly blockers?: readonly string[];
    readonly serverDir?: string | null;
    readonly detected?: { readonly serverDir?: string | null };
}

export interface AdoptConfirmRequest {
    readonly id: string;
    readonly containerId: string;
    readonly hostId?: string | null;
    readonly rcon?: { readonly port: number; readonly password: string };
    readonly consent?: {
        readonly configWrite?: boolean;
        readonly lifecycle?: boolean;
        readonly pluginInstall?: boolean;
        readonly consoleWrite?: boolean;
    };
}

/* -------------------------------------------------------------------------- */
/* Worlds / backup / web console                                             */
/* -------------------------------------------------------------------------- */

export interface WorldEntry {
    readonly folder: string;
    readonly dimension: string;
    readonly sizeBytes: number | null;
}

export interface BackupEntry {
    readonly tag: string;
    readonly createdAt: string;
    readonly sizeBytes: number | null;
}

export interface WebConsoleStatus {
    readonly running: boolean;
    readonly host: string | null;
    readonly port: number | null;
    readonly hasPassword: boolean;
}

export interface HostProfileRecord {
    readonly hostId: string;
    readonly target: {
        readonly id: string;
        readonly label: string;
        readonly host: string;
        readonly port: number;
        readonly user: string;
        readonly identityFile: string | null;
        readonly workDir: string;
        readonly image: string;
        readonly docker: string;
        readonly keepRemoteFiles: boolean;
    };
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface HostKeyOffer {
    readonly type: string;
    readonly fingerprint: string;
    readonly line: string;
}

export interface HostProfileScan {
    readonly profile: HostProfileRecord;
    readonly recorded: readonly HostKeyOffer[];
    readonly offers: readonly HostKeyOffer[];
    readonly detail: string | null;
}

/** What the Electron bridge's `mcserver` namespace looks like, from the renderer's side. */
export interface McServerHost {
    readonly name: string;
    list(): Promise<Answer<readonly ServerRecord[]>>;
    get(id: string): Promise<Answer<ServerRecord>>;
    save(record: ServerRecord): Promise<Answer<ServerRecord>>;
    forget(id: string): Promise<Answer<void>>;
    /** Where a new server should live. Optional: an older host simply has no suggestion. */
    suggestFolder?(name?: string): Promise<Answer<string>>;
    probe(id: string): Promise<Answer<ProbeResult>>;
    status(id: string): Promise<Answer<InstanceStatus>>;
    start(id: string): Promise<Answer<void>>;
    stop(id: string, options?: { graceful?: boolean; timeoutMs?: number }): Promise<Answer<void>>;
    files: {
        list(id: string, dir: string): Promise<Answer<readonly FileEntry[]>>;
        read(id: string, path: string): Promise<Answer<FileBlob>>;
        write(
            id: string,
            path: string,
            body: { text: string; expectedHash: string | null; backup?: boolean },
        ): Promise<Answer<WriteReceipt>>;
    };
    logTail(id: string, lines?: number): Promise<Answer<readonly ConsoleLine[]>>;

    readonly catalogue?: {
        list(): Promise<Answer<CatalogueSnapshot>>;
        refresh(): Promise<Answer<CatalogueSnapshot>>;
    };
    readonly java?: {
        resolve(version: string): Promise<Answer<JavaResolution>>;
        provision?(version: string): Promise<Answer<JavaResolution>>;
        onProgress?(listener: (progress: JavaProvisionProgress) => void): () => void;
    };
    create?(request: CreateServerRequest): Promise<Answer<ServerRecord>>;
    readonly plugins?: {
        search(request: {
            sourceId: PluginSourceId;
            query: string;
            loader?: string;
            gameVersion?: string;
            limit?: number;
        }): Promise<Answer<readonly PluginSearchResult[]>>;
        versions(request: {
            sourceId: PluginSourceId;
            projectId: string;
            loader?: string;
            gameVersion?: string;
            serverId?: string;
        }): Promise<Answer<readonly PluginVersionEntry[]>>;
        install(
            id: string,
            request: { version: PluginVersionEntry; pluginsDir?: string; modsDir?: string },
        ): Promise<Answer<InstalledPlugin>>;
        list(id: string, request?: { pluginsDir?: string; modsDir?: string }): Promise<Answer<readonly InstalledPlugin[]>>;
        toggle(id: string, request: { path: string; enable: boolean }): Promise<Answer<void>>;
        remove(id: string, path: string): Promise<Answer<void>>;
    };
    readonly players?: {
        list(id: string): Promise<Answer<readonly PlayerEntry[]>>;
        action(id: string, request: { action: string; name: string; reason?: string }): Promise<Answer<void>>;
    };
    readonly adopt?: {
        discover(request?: { readonly hostId?: string | null }): Promise<Answer<readonly AdoptionCandidate[]>>;
        confirm(request: AdoptConfirmRequest): Promise<Answer<ServerRecord>>;
        release(id: string, options?: { restoreSnapshot?: boolean }): Promise<Answer<void>>;
    };
    readonly worlds?: {
        list(id: string): Promise<Answer<readonly WorldEntry[]>>;
    };
    readonly backup?: {
        create(
            id: string,
            request: {
                owner: string;
                repo: string;
                worldFolder: string;
                accountId?: string;
                acknowledgePublic?: boolean;
                resumeTag?: string;
                backupConsent?: boolean;
            },
        ): Promise<Answer<BackupEntry>>;
        list(owner: string, repo: string): Promise<Answer<readonly BackupEntry[]>>;
        issueRestoreReceipt(id: string, request: { owner: string; repo: string; tag: string; worldFolder?: string; superConfirmed: true }): Promise<Answer<{ receipt: string; expiresAt: number }>>;
        restore(id: string, request: { owner: string; repo: string; tag: string; accountId?: string; worldFolder?: string; restoreConsent?: boolean; restoreReceipt?: string }): Promise<Answer<void>>;
    };
    readonly webConsole?: {
        status(): Promise<Answer<WebConsoleStatus>>;
        start(options?: { host?: string; port?: number; tlsTerminated?: boolean }): Promise<Answer<void>>;
        stop(): Promise<Answer<void>>;
        setPassword(password: string): Promise<Answer<void>>;
        bind(): Promise<Answer<void>>;
    };
    readonly hostProfiles?: {
        list(): Promise<Answer<readonly HostProfileRecord[]>>;
        get(hostId: string): Promise<Answer<HostProfileRecord>>;
        save(request: { hostId: string; target: Record<string, unknown> }): Promise<Answer<HostProfileRecord>>;
        forget(hostId: string): Promise<Answer<void>>;
        scan(hostId: string): Promise<Answer<HostProfileScan>>;
        trust(hostId: string, fingerprint: string): Promise<Answer<{ ok: boolean; message: string }>>;
    };
}

export interface ServerStore {
    /** False when this build cannot see the server list at all. Never confused with "none". */
    readonly canList: boolean;
    readonly servers: Readonly<Ref<readonly ServerRecord[]>>;
    readonly loaded: Readonly<Ref<boolean>>;
    readonly failure: Readonly<Ref<string | null>>;
    /** Cached instance status per server id, refreshed by `refreshStatus`. */
    readonly statuses: Readonly<Record<string, InstanceStatus | undefined>>;
    readonly probes: Readonly<Record<string, ProbeResult | undefined>>;

    load(): Promise<void>;
    get(id: string): ServerRecord | undefined;
    capabilitiesFor(id: string): TransportCapabilities | null;
    save(record: ServerRecord): Promise<Answer<ServerRecord>>;
    forget(id: string): Promise<Answer<void>>;
    /** A suggested folder for a new server, or null when the host cannot suggest one. */
    suggestFolder(name?: string): Promise<string | null>;
    probe(id: string): Promise<Answer<ProbeResult>>;
    refreshStatus(id: string): Promise<Answer<InstanceStatus>>;
    start(id: string): Promise<Answer<void>>;
    stop(id: string, options?: { graceful?: boolean; timeoutMs?: number }): Promise<Answer<void>>;
    files: McServerHost["files"];
    logTail(id: string, lines?: number): Promise<Answer<readonly ConsoleLine[]>>;
    readonly runningCount: ComputedRef<number>;

    /** True when this build's shell has wired the given optional namespace. */
    readonly hasCatalogue: boolean;
    readonly hasJava: boolean;
    readonly hasCreate: boolean;
    readonly hasAdopt: boolean;
    readonly hasHostProfiles: boolean;

    readonly hostProfiles: {
        list(): Promise<Answer<readonly HostProfileRecord[]>>;
        get(hostId: string): Promise<Answer<HostProfileRecord>>;
        save(request: { hostId: string; target: Record<string, unknown> }): Promise<Answer<HostProfileRecord>>;
        forget(hostId: string): Promise<Answer<void>>;
        scan(hostId: string): Promise<Answer<HostProfileScan>>;
        trust(hostId: string, fingerprint: string): Promise<Answer<{ ok: boolean; message: string }>>;
    };

    catalogueList(): Promise<Answer<CatalogueSnapshot>>;
    catalogueRefresh(): Promise<Answer<CatalogueSnapshot>>;
    javaResolve(version: string): Promise<Answer<JavaResolution>>;
    javaProvision(version: string): Promise<Answer<JavaResolution>>;
    onJavaProgress(listener: (progress: JavaProvisionProgress) => void): () => void;
    createServer(request: CreateServerRequest): Promise<Answer<ServerRecord>>;

    adoptDiscover(hostId?: string | null): Promise<Answer<readonly AdoptionCandidate[]>>;
    adoptConfirm(request: AdoptConfirmRequest): Promise<Answer<ServerRecord>>;
    adoptRelease(id: string, options?: { restoreSnapshot?: boolean }): Promise<Answer<void>>;

    worldsList(id: string): Promise<Answer<readonly WorldEntry[]>>;

    playersList(id: string): Promise<Answer<readonly PlayerEntry[]>>;
    playersAction(id: string, request: { action: string; name: string; reason?: string }): Promise<Answer<void>>;
}

export interface ServerStoreOptions {
    readonly host?: McServerHost | null;
}

function fail<T = never>(message: string, code = "unreachable"): Answer<T> {
    return { ok: false, failure: { code, message, detail: null } };
}

export function createServerStore(options: ServerStoreOptions = {}): ServerStore {
    const host = options.host ?? null;

    const servers = shallowRef<readonly ServerRecord[]>([]);
    const loaded = ref(false);
    const failure = ref<string | null>(null);
    const statuses = reactive<Record<string, InstanceStatus | undefined>>({});
    const probes = reactive<Record<string, ProbeResult | undefined>>({});

    function noHost<T>(): Answer<T> {
        return fail("This build cannot reach a Minecraft server host, so this action is unavailable.");
    }

    function notWired<T>(namespace: string): Answer<T> {
        return fail(`This build has not wired up ${namespace} yet, so this action is unavailable.`, "not-wired");
    }

    return {
        canList: host !== null,
        servers,
        loaded,
        failure,
        statuses,
        probes,

        hasCatalogue: host?.catalogue !== undefined,
        hasJava: host?.java !== undefined,
        hasCreate: host?.create !== undefined,
        hasAdopt: host?.adopt !== undefined,
        hasHostProfiles: host?.hostProfiles !== undefined,

        hostProfiles: {
            async list() {
                if (host?.hostProfiles === undefined) return notWired("SSH host profiles");
                return host.hostProfiles.list();
            },
            async get(hostId) {
                if (host?.hostProfiles === undefined) return notWired("SSH host profiles");
                return host.hostProfiles.get(hostId);
            },
            async save(request) {
                if (host?.hostProfiles === undefined) return notWired("SSH host profiles");
                return host.hostProfiles.save(request);
            },
            async forget(hostId) {
                if (host?.hostProfiles === undefined) return notWired("SSH host profiles");
                return host.hostProfiles.forget(hostId);
            },
            async scan(hostId) {
                if (host?.hostProfiles === undefined) return notWired("SSH host profiles");
                return host.hostProfiles.scan(hostId);
            },
            async trust(hostId, fingerprint) {
                if (host?.hostProfiles === undefined) return notWired("SSH host profiles");
                return host.hostProfiles.trust(hostId, fingerprint);
            },
        },

        async load(): Promise<void> {
            if (host === null) {
                loaded.value = true;
                return;
            }
            const result = await host.list();
            if (result.ok) {
                servers.value = result.value ?? [];
                failure.value = null;
            } else {
                // Never an empty list on a failed read - that renders as "there are no
                // servers", which is not the true state.
                failure.value = result.failure?.message ?? "The server list could not be read.";
            }
            loaded.value = true;
        },

        get(id) {
            return servers.value.find((server) => server.id === id);
        },

        capabilitiesFor(id) {
            return probes[id]?.capabilities ?? null;
        },

        async save(record): Promise<Answer<ServerRecord>> {
            if (host === null) return noHost();
            const result = await host.save(record);
            if (result.ok && result.value) {
                const next = servers.value.some((server) => server.id === record.id)
                    ? servers.value.map((server) => (server.id === record.id ? result.value! : server))
                    : [...servers.value, result.value];
                servers.value = next;
            }
            return result;
        },

        async suggestFolder(name?: string): Promise<string | null> {
            // Null rather than a guess. Inventing a plausible-looking path here would put a
            // location in the field that this app has no reason to believe in, and the user
            // would find out only when the server was written somewhere unexpected.
            if (host === null || host.suggestFolder === undefined) return null;
            const result = await host.suggestFolder(name);
            return result.ok && result.value !== undefined ? result.value : null;
        },

        async forget(id): Promise<Answer<void>> {
            if (host === null) return noHost();
            const result = await host.forget(id);
            if (result.ok) {
                servers.value = servers.value.filter((server) => server.id !== id);
                delete statuses[id];
                delete probes[id];
            }
            return result;
        },

        async probe(id): Promise<Answer<ProbeResult>> {
            if (host === null) return noHost();
            const result = await host.probe(id);
            if (result.ok && result.value) probes[id] = result.value;
            return result;
        },

        async refreshStatus(id): Promise<Answer<InstanceStatus>> {
            if (host === null) return noHost();
            const result = await host.status(id);
            if (result.ok && result.value) statuses[id] = result.value;
            return result;
        },

        async start(id): Promise<Answer<void>> {
            if (host === null) return noHost();
            return host.start(id);
        },

        async stop(id, opts): Promise<Answer<void>> {
            if (host === null) return noHost();
            return host.stop(id, opts);
        },

        files: {
            async list(id, dir) {
                if (host === null) return noHost();
                return host.files.list(id, dir);
            },
            async read(id, path) {
                if (host === null) return noHost();
                return host.files.read(id, path);
            },
            async write(id, path, body) {
                if (host === null) return noHost();
                return host.files.write(id, path, body);
            },
        },

        async logTail(id, lines): Promise<Answer<readonly ConsoleLine[]>> {
            if (host === null) return noHost();
            return host.logTail(id, lines);
        },

        runningCount: computed(
            () => Object.values(statuses).filter((status) => status?.state === "running").length,
        ),

        async catalogueList(): Promise<Answer<CatalogueSnapshot>> {
            if (host === null) return noHost();
            if (host.catalogue === undefined) return notWired("the server catalogue");
            return host.catalogue.list();
        },
        async catalogueRefresh(): Promise<Answer<CatalogueSnapshot>> {
            if (host === null) return noHost();
            if (host.catalogue === undefined) return notWired("the server catalogue");
            return host.catalogue.refresh();
        },
        async javaResolve(version): Promise<Answer<JavaResolution>> {
            if (host === null) return noHost();
            if (host.java === undefined) return notWired("Java discovery");
            return host.java.resolve(version);
        },
        async javaProvision(version): Promise<Answer<JavaResolution>> {
            if (host === null) return noHost();
            if (host.java?.provision === undefined) {
                return notWired("installing Java automatically");
            }
            const result = await host.java.provision(version);
            if (!result.ok || result.value === undefined) return result;
            const raw = result.value as unknown as {
                outcome?: string;
                feature?: number;
                java?: { executable?: string; version?: { version?: string } };
            };
            if (raw.java?.executable === undefined) return result as Answer<JavaResolution>;
            return {
                ok: true,
                value: {
                    found: true,
                    executable: raw.java.executable,
                    source: "provisioned",
                    version: raw.java.version?.version ?? null,
                    requiredFeature: raw.feature ?? (Number(version) || 0),
                    message: raw.outcome === "already-installed" ? "Java is already available." : "Java was provisioned and verified.",
                },
            };
        },
        onJavaProgress(listener): () => void {
            if (host?.java?.onProgress === undefined) return () => {};
            return host.java.onProgress(listener);
        },
        async createServer(request): Promise<Answer<ServerRecord>> {
            if (host === null) return noHost();
            if (host.create === undefined) return notWired("creating servers");
            const result = await host.create(request);
            if (result.ok && result.value) {
                servers.value = [...servers.value, result.value];
            }
            return result;
        },

        async adoptDiscover(hostId?: string | null): Promise<Answer<readonly AdoptionCandidate[]>> {
            if (host === null) return noHost();
            if (host.adopt === undefined) return notWired("adopting existing containers");
            return host.adopt.discover(hostId === undefined ? undefined : { hostId });
        },
        async adoptConfirm(request): Promise<Answer<ServerRecord>> {
            if (host === null) return noHost();
            if (host.adopt === undefined) return notWired("adopting existing containers");
            const result = await host.adopt.confirm(request);
            if (result.ok && result.value) {
                servers.value = [...servers.value, result.value];
            }
            return result;
        },
        async adoptRelease(id, opts): Promise<Answer<void>> {
            if (host === null) return noHost();
            if (host.adopt === undefined) return notWired("adopting existing containers");
            const result = await host.adopt.release(id, opts);
            if (result.ok) {
                servers.value = servers.value.filter((server) => server.id !== id);
            }
            return result;
        },

        async worldsList(id): Promise<Answer<readonly WorldEntry[]>> {
            if (host === null) return noHost();
            if (host.worlds === undefined) return notWired("listing worlds");
            return host.worlds.list(id);
        },

        async playersList(id): Promise<Answer<readonly PlayerEntry[]>> {
            if (host === null) return noHost();
            if (host.players === undefined) return notWired("the player list");
            return host.players.list(id);
        },
        async playersAction(id, request): Promise<Answer<void>> {
            if (host === null) return noHost();
            if (host.players === undefined) return notWired("player actions");
            return host.players.action(id, request);
        },
    };
}

/** Why this build cannot manage servers, in one sentence, for a surface to render. */
export function serverHostMissingReason(): string {
    return "This build cannot reach a Minecraft server host. The desktop application is what runs them.";
}
