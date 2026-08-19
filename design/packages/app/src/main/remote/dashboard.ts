/**
 * The main-process data boundary for the multi-server operations dashboard.
 *
 * The dashboard deliberately consumes the records that already exist rather than
 * inventing a second server registry: profile rows describe configured remote map
 * endpoints, while hosting rows describe containers this application started. The
 * renderer can therefore show one coherent inventory without receiving credentials
 * or learning how either persistence format works.
 */

import type { RemoteHostingRecord, RemoteHostingOrchestrator } from "./hosting.js";
import type { RemoteTarget } from "./target.js";

export const DASHBOARD_FORMAT_VERSION = 1;
export const DASHBOARD_DEFAULT_CONCURRENCY = 3;
export const DASHBOARD_DEFAULT_RETRIES = 2;
export const DASHBOARD_DEFAULT_BACKOFF_MS = 250;

export type DashboardSource = "profile" | "hosting";
export type DashboardReachability = "reachable" | "unreachable" | "unknown" | "stale";
export type DashboardStatus = RemoteHostingRecord["status"] | "configured";

/** The safe subset of a profile needed by the dashboard. */
export interface DashboardProfile {
    readonly id: string;
    readonly name: string;
    readonly url: string;
    readonly dataRoot?: string;
}

export interface DashboardEntry {
    readonly id: string;
    readonly source: DashboardSource;
    readonly label: string;
    readonly target: RemoteTarget | null;
    readonly url: string | null;
    readonly status: DashboardStatus;
    readonly reachability: DashboardReachability;
    readonly version: string | null;
    readonly mapIds: readonly string[];
    readonly players: number | null;
    readonly renderState: string | null;
    readonly lastCheckedAt: string | null;
    readonly failure: string | null;
    readonly owner: { readonly kind: "profile" | "hosting"; readonly id: string };
}

export interface DashboardSnapshot {
    readonly version: typeof DASHBOARD_FORMAT_VERSION;
    readonly generatedAt: string;
    readonly entries: readonly DashboardEntry[];
}

export interface DashboardRefreshResult {
    readonly id: string;
    readonly entry: DashboardEntry;
    readonly attempts: number;
}

export interface DashboardRefreshOptions {
    readonly concurrency?: number;
    readonly retries?: number;
    readonly backoffMs?: number;
    readonly signal?: AbortSignal;
    readonly now?: () => Date;
}

export interface DashboardRefreshContext {
    readonly entry: DashboardEntry;
    readonly signal: AbortSignal;
}

export type DashboardChecker = (
    context: DashboardRefreshContext,
) => Promise<
    Partial<
        Pick<
            DashboardEntry,
            "reachability" | "version" | "players" | "renderState" | "failure" | "url" | "status" | "mapIds" | "lastCheckedAt"
        >
    >
>;

function profileEntry(profile: DashboardProfile): DashboardEntry {
    return {
        id: `profile:${profile.id}`,
        source: "profile",
        label: profile.name,
        target: null,
        url: profile.url || null,
        status: "configured",
        reachability: "unknown",
        version: null,
        mapIds: [],
        players: null,
        renderState: null,
        lastCheckedAt: null,
        failure: null,
        owner: { kind: "profile", id: profile.id },
    };
}

function hostingEntry(record: RemoteHostingRecord): DashboardEntry {
    return {
        id: `hosting:${record.hostingId}`,
        source: "hosting",
        label: record.target.label,
        target: record.target,
        url: record.url,
        status: record.status,
        reachability: record.verified ? "reachable" : record.status === "unknown" ? "unknown" : "unreachable",
        version: null,
        mapIds: record.mapIds,
        players: null,
        renderState: record.status,
        lastCheckedAt: record.lastCheckedAt,
        failure: record.verified ? null : record.notes.at(-1) ?? "The server has not answered a health check.",
        owner: { kind: "hosting", id: record.hostingId },
    };
}

/** Combines saved profiles and hosted-container records into stable, renderer-safe rows. */
export function createDashboardSnapshot(
    profiles: readonly DashboardProfile[],
    hostingRecords: readonly RemoteHostingRecord[],
    now: () => Date = () => new Date(),
): DashboardSnapshot {
    const entries = [...profiles.map(profileEntry), ...hostingRecords.map(hostingEntry)];
    entries.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
    return { version: DASHBOARD_FORMAT_VERSION, generatedAt: now().toISOString(), entries };
}

function sleep(delayMs: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new DOMException("The dashboard refresh was cancelled.", "AbortError"));
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error?: DOMException): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            if (error === undefined) resolve();
            else reject(error);
        };
        const onAbort = (): void => finish(new DOMException("The dashboard refresh was cancelled.", "AbortError"));
        const timer = setTimeout(() => finish(), delayMs);
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

function isAbort(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Refreshes independent dashboard rows with bounded concurrency and retry backoff.
 * A failed row remains visible with an explicit failure; it never prevents other rows
 * from completing. Cancellation rejects only with AbortError and never leaves workers
 * running after the caller has requested a stop.
 */
export async function refreshDashboard(
    entries: readonly DashboardEntry[],
    check: DashboardChecker,
    options: DashboardRefreshOptions = {},
): Promise<readonly DashboardRefreshResult[]> {
    const concurrency = Math.max(1, Math.floor(options.concurrency ?? DASHBOARD_DEFAULT_CONCURRENCY));
    const retries = Math.max(0, Math.floor(options.retries ?? DASHBOARD_DEFAULT_RETRIES));
    const backoffMs = Math.max(0, Math.floor(options.backoffMs ?? DASHBOARD_DEFAULT_BACKOFF_MS));
    const signal = options.signal ?? new AbortController().signal;
    const now = options.now ?? (() => new Date());
    const results: DashboardRefreshResult[] = [];
    let next = 0;

    const worker = async (): Promise<void> => {
        while (true) {
            if (signal.aborted) throw new DOMException("The dashboard refresh was cancelled.", "AbortError");
            const index = next++;
            const entry = entries[index];
            if (entry === undefined) return;
            let attempts = 0;
            let patch: Partial<DashboardEntry> = {};
            let lastError: unknown = null;
            while (attempts <= retries) {
                attempts += 1;
                try {
                    patch = await check({ entry, signal });
                    lastError = null;
                    break;
                } catch (error) {
                    if (isAbort(error) || signal.aborted) throw error;
                    lastError = error;
                    if (attempts <= retries) await sleep(backoffMs * 2 ** (attempts - 1), signal);
                }
            }
            const refreshed: DashboardEntry = {
                ...entry,
                ...patch,
                lastCheckedAt: now().toISOString(),
                ...(lastError === null ? {} : { reachability: "unreachable", failure: describeFailure(lastError) }),
            };
            results.push({ id: entry.id, entry: refreshed, attempts });
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));
    return results.sort((left, right) => left.entry.label.localeCompare(right.entry.label) || left.id.localeCompare(right.id));
}

/** Bridges the existing hosting records into the dashboard refresh contract. */
export function createHostingDashboardChecker(orchestrator: RemoteHostingOrchestrator): DashboardChecker {
    return async ({ entry, signal }) => {
        if (signal.aborted) throw new DOMException("The dashboard refresh was cancelled.", "AbortError");
        if (entry.owner.kind !== "hosting") return {};
        const record = await orchestrator.refresh(entry.owner.id, signal);
        if (record === null) {
            return { reachability: "unknown", failure: "The saved hosting record is no longer available." };
        }
        return {
            reachability: record.verified ? "reachable" : record.status === "unknown" ? "unknown" : "unreachable",
            url: record.url,
            status: record.status,
            mapIds: record.mapIds,
            renderState: record.status,
            lastCheckedAt: record.lastCheckedAt,
            failure: record.verified ? null : record.notes.at(-1) ?? "The server has not answered a health check.",
        };
    };
}

function describeFailure(error: unknown): string {
    if (error instanceof Error && error.message.trim() !== "") return error.message;
    const text = String(error).trim();
    return text === "" ? "The health check failed without a diagnostic." : text;
}
