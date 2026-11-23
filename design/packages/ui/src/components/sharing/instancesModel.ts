/**
 * Every instance Worldlens created to share a render, from every route, as one list.
 *
 * Each route keeps its own registry in the main process (hosted maps, appliances and, as it
 * lands, the live viewer); this file only reads them through the preload bridge and turns
 * them into rows with the actions that route actually supports. Nothing here invents a
 * state: a row's health is whatever the last real check returned, and "not checked yet"
 * until one has.
 */

export type InstanceKind = "container" | "appliance" | "live";
export type InstanceAction = "start" | "stop" | "restart" | "update" | "remove";
export type Health = "healthy" | "unreachable" | "unchecked";

export interface InstanceRow {
    readonly key: string;
    readonly id: string;
    readonly kind: InstanceKind;
    readonly name: string;
    readonly where: string;
    readonly link: string;
    readonly running: boolean | null;
    readonly detail: string;
    readonly actions: readonly InstanceAction[];
    /** What Remove deletes, named exactly, for the confirmation. */
    readonly removes: string;
}

export interface SharingBridges {
    readonly shareHost?: {
        list(): Promise<unknown>;
        start(id: string): Promise<unknown>;
        stop(id: string): Promise<unknown>;
        restart(id: string): Promise<unknown>;
        update(id: string): Promise<unknown>;
        remove(id: string): Promise<unknown>;
    };
    readonly appliance?: {
        instances(): Promise<unknown>;
        start(id: string): Promise<unknown>;
        stop(id: string): Promise<unknown>;
        remove(id: string): Promise<unknown>;
    };
    readonly liveViewer?: {
        list(): Promise<unknown>;
        control(request: { id: string; action: "start" | "stop" | "restart" }): Promise<unknown>;
        remove(request: { id: string; confirmName: string }): Promise<unknown>;
    };
    readonly sharing?: {
        checkLink(link: string): Promise<unknown>;
        openExternal(url: string): Promise<unknown>;
    };
}

export function resolveSharingBridges(): SharingBridges {
    if (typeof window === "undefined") return {};
    return ((window as { worldlens?: SharingBridges }).worldlens ?? {}) as SharingBridges;
}

function str(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function asArray(value: unknown): readonly Record<string, unknown>[] {
    if (Array.isArray(value)) return value as Record<string, unknown>[];
    const inner = (value as { value?: unknown } | null)?.value;
    return Array.isArray(inner) ? (inner as Record<string, unknown>[]) : [];
}

export function containerRows(raw: unknown): InstanceRow[] {
    return asArray(raw).map((r) => {
        const state = str(r.state, "unknown");
        const id = str(r.instanceId);
        return {
            key: `container:${id}`,
            id,
            kind: "container" as const,
            name: str(r.name, id),
            where: str(r.targetLabel),
            link: str(r.link),
            running: state === "running" || state === "unhealthy" ? true : state === "stopped" ? false : null,
            detail: str(r.detail, state),
            actions: ["start", "stop", "restart", "update", "remove"],
            removes: `the container ${str(r.containerName)} and its map volume ${str(r.volumeName)}`,
        };
    });
}

export function applianceRows(raw: unknown): InstanceRow[] {
    return asArray(raw).map((r) => {
        const id = str(r.id);
        const target = str(r.target) === "virtualbox" ? "VirtualBox" : "VMware";
        return {
            key: `appliance:${id}`,
            id,
            kind: "appliance" as const,
            name: str(r.name, id),
            where: `${target} · ${str(r.hostName)}`,
            link: str(r.link),
            running: null,
            detail: str(r.createdAt),
            actions: ["start", "stop", "remove"],
            removes: `the virtual machine ${str(r.name)} and its folder ${str(r.folder)}`,
        };
    });
}

export function liveRows(raw: unknown): InstanceRow[] {
    return asArray(raw).map((status) => {
        const r = (status.instance ?? status) as Record<string, unknown>;
        const id = str(r.id);
        const state = str(status.state, "unknown");
        const bot = status.botConnected === true ? "bot online" : status.botConnected === false ? "bot offline" : "";
        const target = r.target as { kind?: unknown; label?: unknown } | undefined;
        const where = target?.kind === "ssh" ? str(target.label, "SSH host") : "This PC";
        return {
            key: `live:${id}`,
            id,
            kind: "live" as const,
            name: str(r.name, id),
            where: `${where} · ${str(r.kind) === "web-client" ? "Prismarine Web Client" : "Prismarine Viewer"} · ${str(r.botName)} on ${str(r.serverLabel)}`,
            link: str(r.url),
            running: state === "running" ? true : state === "stopped" ? false : null,
            detail: [state, bot].filter(Boolean).join(" · "),
            actions: ["start", "stop", "restart", "remove"],
            removes: `the live viewer container ${str(r.containerName)} and its settings volumes`,
        };
    });
}

export async function loadRows(bridges: SharingBridges): Promise<InstanceRow[]> {
    const [containers, appliances, live] = await Promise.all([
        bridges.shareHost?.list().catch(() => []) ?? Promise.resolve([]),
        bridges.appliance?.instances().catch(() => []) ?? Promise.resolve([]),
        bridges.liveViewer?.list().catch(() => []) ?? Promise.resolve([]),
    ]);
    return [...containerRows(containers), ...applianceRows(appliances), ...liveRows(live)];
}

export async function runAction(bridges: SharingBridges, row: InstanceRow, action: InstanceAction): Promise<{ ok: boolean; message: string }> {
    if (row.kind === "live") {
        const live = bridges.liveViewer;
        if (!live || !row.actions.includes(action)) return { ok: false, message: "This instance cannot do that." };
        try {
            const answer = (action === "remove"
                ? await live.remove({ id: row.id, confirmName: row.name })
                : await live.control({ id: row.id, action: action as "start" | "stop" | "restart" })) as { ok?: unknown; failure?: { message?: unknown } } | null;
            return { ok: answer?.ok !== false, message: str(answer?.failure?.message) };
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    const target = row.kind === "container" ? bridges.shareHost : bridges.appliance;
    const fn = (target as Record<string, ((id: string) => Promise<unknown>) | undefined> | undefined)?.[action];
    if (typeof fn !== "function" || !row.actions.includes(action)) return { ok: false, message: "This instance cannot do that." };
    try {
        const answer = (await fn.call(target, row.id)) as { ok?: unknown; message?: unknown } | null;
        return { ok: answer?.ok !== false, message: str(answer?.message) };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
}

export function rowSearchText(row: InstanceRow): string {
    return [row.name, row.where, row.link, row.kind, row.detail].join(" ");
}
