export type ReleaseLedgerVerification = "running" | "failed" | "verified" | "unverified";
export interface ReleaseLedgerAsset { readonly name: string; readonly bytes: number | null; readonly sha256: string | null; readonly kind: string | null; }
export interface ReleaseLedgerEntry {
    readonly id: string; readonly phase: string; readonly integrationSha: string; readonly releaseTag: string | null;
    readonly releaseUrl: string | null; readonly workflowRun: string | null; readonly workflowUrl: string | null;
    readonly workflowState: "running" | "failed" | "success" | "unknown"; readonly startedAt: string | null;
    readonly completedAt: string | null; readonly duration: string | null; readonly codeName: string | null;
    readonly verification: ReleaseLedgerVerification; readonly verificationNote: string; readonly assets: readonly ReleaseLedgerAsset[];
    readonly lineCount: string | null; readonly catalogUrl: string | null;
}
export interface ReleaseLedgerReadout { readonly source: "bridge"; readonly readAt: string; readonly entries: readonly ReleaseLedgerEntry[]; }
export interface ReleaseLedgerBridge { releaseLedgerRead?: () => Promise<ReleaseLedgerReadout>; writeClipboardText?: (text: string) => Promise<void>; }
export function resolveReleaseLedgerBridge(): ReleaseLedgerBridge | null { return (globalThis as { worldlens?: ReleaseLedgerBridge }).worldlens ?? null; }
