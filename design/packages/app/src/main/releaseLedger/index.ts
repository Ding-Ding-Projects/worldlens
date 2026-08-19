import { app, ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const RELEASE_LEDGER_CHANNEL = "release-ledger:read";

export interface ReleaseLedgerReadout {
    readonly source: "bridge";
    readonly readAt: string;
    readonly entries: readonly ReleaseLedgerEntry[];
}

export interface ReleaseLedgerAsset {
    readonly name: string;
    readonly bytes: number | null;
    readonly sha256: string | null;
    readonly kind: string | null;
}

export interface ReleaseLedgerEntry {
    readonly id: string;
    readonly phase: string;
    readonly integrationSha: string;
    readonly releaseTag: string | null;
    readonly releaseUrl: string | null;
    readonly workflowRun: string | null;
    readonly workflowUrl: string | null;
    readonly workflowState: "running" | "failed" | "success" | "unknown";
    readonly startedAt: string | null;
    readonly completedAt: string | null;
    readonly duration: string | null;
    readonly codeName: string | null;
    readonly verification: "running" | "failed" | "verified" | "unverified";
    readonly verificationNote: string;
    readonly assets: readonly ReleaseLedgerAsset[];
    readonly lineCount: string | null;
    readonly catalogUrl: string | null;
}

const MAX_BYTES = 1024 * 1024;
const SHA = /^[0-9a-f]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validLedger(value: unknown): value is { schemaVersion: 1; phases: readonly Record<string, unknown>[] } {
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.phases)) return false;
    return value.phases.every((phase) => {
        if (!isRecord(phase)) return false;
        return typeof phase.phase === "string" && phase.phase.length > 0 &&
            typeof phase.integrationCommit === "string" && SHA.test(phase.integrationCommit) &&
            ["running", "failed", "verified"].includes(String(phase.verificationState)) &&
            isRecord(phase.timing) && isRecord(phase.evidence) && Array.isArray(phase.assets);
    });
}

async function readJson(path: string): Promise<unknown | null> {
    try {
        const bytes = await readFile(path);
        if (bytes.byteLength > MAX_BYTES) return null;
        return JSON.parse(bytes.toString("utf8")) as unknown;
    } catch {
        return null;
    }
}

function candidates(): string[] {
    return [
        join(app.getPath("userData"), "release-ledger.json"),
        join(app.getAppPath(), "docs", "release-ledger.json"),
        join(app.getAppPath(), "..", "..", "docs", "release-ledger.json"),
        join(process.cwd(), "docs", "release-ledger.json"),
    ];
}

export async function readReleaseLedger(): Promise<ReleaseLedgerReadout> {
    for (const path of candidates()) {
        const value = await readJson(path);
        if (!validLedger(value)) continue;
        return {
            source: "bridge",
            readAt: new Date().toISOString(),
            entries: value.phases.map((phase, index) => {
                const evidence = phase.evidence as Record<string, unknown>;
                const timing = phase.timing as Record<string, unknown>;
                const codeName = isRecord(phase.codeName) ? phase.codeName : null;
                const verification = phase.verificationState === "failed" || phase.verificationState === "verified" ? phase.verificationState : "running";
                const assets = Array.isArray(phase.assets) ? phase.assets : [];
                const workflowRun = typeof evidence.workflowRun === "string" ? evidence.workflowRun : null;
                return {
                    id: `${String(phase.integrationCommit)}-${index}`,
                    phase: String(phase.phase),
                    integrationSha: String(phase.integrationCommit),
                    releaseTag: typeof phase.releaseTag === "string" ? phase.releaseTag : null,
                    releaseUrl: typeof phase.releaseTag === "string" ? `https://github.com/Ding-Ding-Projects/worldlens/releases/tag/${phase.releaseTag}` : null,
                    workflowRun,
                    workflowUrl: typeof evidence.workflowUrl === "string" ? evidence.workflowUrl : null,
                    workflowState: verification === "failed" ? "failed" : verification === "verified" ? "success" : "running",
                    startedAt: typeof timing.started === "string" ? timing.started : null,
                    completedAt: typeof timing.completed === "string" ? timing.completed : null,
                    duration: typeof timing.duration === "string" ? timing.duration : null,
                    codeName: codeName && typeof codeName.en === "string" && typeof codeName.zhHant === "string" ? `${codeName.en} · ${codeName.zhHant}` : null,
                    verification,
                    verificationNote: String(phase.verificationNote),
                    assets: assets.flatMap((asset) => isRecord(asset) && typeof asset.name === "string" ? [{ name: asset.name, bytes: typeof asset.size === "number" ? asset.size : null, sha256: typeof asset.sha256 === "string" ? asset.sha256 : null, kind: typeof asset.kind === "string" ? asset.kind : null }] : []),
                    lineCount: isRecord(phase.lineCount) && typeof phase.lineCount.total === "number" ? `total ${phase.lineCount.total.toLocaleString()} lines` : null,
                    catalogUrl: codeName && typeof codeName.catalogUrl === "string" ? codeName.catalogUrl : null,
                };
            }),
        };
    }
    throw new Error("No valid release-ledger projection was found in app data or the bundled docs.");
}

export function registerReleaseLedgerHandlers(): void {
    if (ipcMain.listenerCount(RELEASE_LEDGER_CHANNEL) > 0) return;
    ipcMain.handle(RELEASE_LEDGER_CHANNEL, () => readReleaseLedger());
}
