/** IPC boundary for the multi-server dashboard.
 *
 * Only the dashboard's renderer-safe snapshot crosses this boundary. Refresh options are
 * bounded here, and cancellation is explicit so a slow SSH probe cannot outlive the view.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { ProfilesState } from "../profiles/store.js";
import {
    createDashboardSnapshot,
    createHostingDashboardChecker,
    refreshDashboard,
    type DashboardProfile,
    type DashboardRefreshOptions,
    type DashboardSnapshot,
} from "./dashboard.js";
import type { RemoteHostingOrchestrator } from "./hosting.js";

export const DASHBOARD_CHANNELS = ["dashboard:snapshot", "dashboard:refresh", "dashboard:cancel"] as const;

export interface DashboardIpcOptions {
    readonly orchestrator: RemoteHostingOrchestrator;
    readonly readProfiles: () => Promise<ProfilesState>;
    readonly probeProfile: (profileId: string, signal: AbortSignal) => Promise<{
        readonly reachable: boolean;
        readonly version: string | null;
        readonly failure: string | null;
    }>;
}

export interface DashboardIpc {
    dispose(): void;
}

const MAX_CONCURRENCY = 8;
const MAX_RETRIES = 4;
const MAX_BACKOFF_MS = 10_000;

function profilesForDashboard(state: ProfilesState): readonly DashboardProfile[] {
    return state.profiles.map(({ id, name, url, dataRoot }) => ({
        id,
        name,
        url,
        ...(dataRoot === undefined ? {} : { dataRoot }),
    }));
}

function optionsForRefresh(value: unknown): DashboardRefreshOptions {
    if (typeof value !== "object" || value === null) return {};
    const input = value as Record<string, unknown>;
    const bounded = (name: string, fallback: number, max: number): number => {
        const raw = input[name];
        if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
        return Math.min(max, Math.max(0, Math.floor(raw)));
    };
    return {
        concurrency: Math.max(1, bounded("concurrency", 3, MAX_CONCURRENCY)),
        retries: bounded("retries", 2, MAX_RETRIES),
        backoffMs: bounded("backoffMs", 250, MAX_BACKOFF_MS),
    };
}

export function registerDashboardHandlers(ipcMain: IpcMain, options: DashboardIpcOptions): DashboardIpc {
    let active: AbortController | null = null;

    const snapshot = async (): Promise<DashboardSnapshot> => {
        const profiles = await options.readProfiles();
        const hosting = await options.orchestrator.records();
        return createDashboardSnapshot(profilesForDashboard(profiles), hosting);
    };

    ipcMain.handle("dashboard:snapshot", async (): Promise<DashboardSnapshot> => await snapshot());
    ipcMain.handle(
        "dashboard:refresh",
        async (_event: IpcMainInvokeEvent, rawOptions: unknown): Promise<DashboardSnapshot> => {
            active?.abort();
            active = new AbortController();
            const current = active;
            const initial = await snapshot();
            const refreshed = await refreshDashboard(
                initial.entries,
                async ({ entry, signal }) => {
                    if (entry.owner.kind === "profile") {
                        const probe = await options.probeProfile(entry.owner.id, signal);
                        return {
                            reachability: probe.reachable ? "reachable" : "unreachable",
                            version: probe.version,
                            failure: probe.failure,
                        };
                    }
                    return createHostingDashboardChecker(options.orchestrator)({ entry, signal });
                },
                { ...optionsForRefresh(rawOptions), signal: current.signal },
            );
            if (active === current) active = null;
            const refreshedById = new Map(refreshed.map((result) => [result.id, result.entry]));
            return { ...initial, generatedAt: new Date().toISOString(), entries: initial.entries.map((entry) => refreshedById.get(entry.id) ?? entry) };
        },
    );
    ipcMain.handle("dashboard:cancel", (): { cancelled: boolean } => {
        if (active === null) return { cancelled: false };
        active.abort();
        active = null;
        return { cancelled: true };
    });

    return {
        dispose(): void {
            active?.abort();
            active = null;
            for (const channel of DASHBOARD_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
