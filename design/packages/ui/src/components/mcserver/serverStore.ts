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

/** What the Electron bridge's `mcserver` namespace looks like, from the renderer's side. */
export interface McServerHost {
    readonly name: string;
    list(): Promise<Answer<readonly ServerRecord[]>>;
    get(id: string): Promise<Answer<ServerRecord>>;
    save(record: ServerRecord): Promise<Answer<ServerRecord>>;
    forget(id: string): Promise<Answer<void>>;
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
    probe(id: string): Promise<Answer<ProbeResult>>;
    refreshStatus(id: string): Promise<Answer<InstanceStatus>>;
    start(id: string): Promise<Answer<void>>;
    stop(id: string, options?: { graceful?: boolean; timeoutMs?: number }): Promise<Answer<void>>;
    files: McServerHost["files"];
    logTail(id: string, lines?: number): Promise<Answer<readonly ConsoleLine[]>>;
    readonly runningCount: ComputedRef<number>;
}

export interface ServerStoreOptions {
    readonly host?: McServerHost | null;
}

function fail<T = never>(message: string): Answer<T> {
    return { ok: false, failure: { code: "unreachable", message, detail: null } };
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

    return {
        canList: host !== null,
        servers,
        loaded,
        failure,
        statuses,
        probes,

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
    };
}

/** Why this build cannot manage servers, in one sentence, for a surface to render. */
export function serverHostMissingReason(): string {
    return "This build cannot reach a Minecraft server host. The desktop application is what runs them.";
}
