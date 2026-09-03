/**
 * The repair bridge, structurally mirrored from the preload for the same reason
 * `bedrockBridge.ts` restates its own: this package compiles and runs in three places and
 * only one of them has a preload.
 */

export interface AgentAvailability {
    readonly available: boolean;
    readonly command: string;
    readonly version: string | null;
    readonly message: string;
}

export interface FailureSummary {
    readonly id: string;
    readonly subject: "render" | "web-server";
    readonly mode: "local" | "docker";
    readonly exitCode: number | null;
    readonly at: string;
}

export type RepairRemedyKind =
    | "settings"
    | "retry"
    | "retry-container"
    | "restore-config"
    | "fix-config"
    | "none";

export interface SettingsTarget {
    readonly surface: "settings";
    readonly anchor: "mojang-download-consent" | "java-runtime" | "map-storage-directory" | "world-folder";
    readonly missing: boolean;
}

export interface RepairRemedy {
    readonly kind: RepairRemedyKind;
    readonly summary: string;
    readonly settings: SettingsTarget | null;
    readonly retry: Record<string, unknown> | null;
}

export interface RepairDiagnosis {
    readonly code: string;
    readonly message: string;
    readonly because: string;
    readonly remedy: RepairRemedy;
}

export type DiagnoseAnswer =
    | { readonly ok: true; readonly diagnoses: readonly RepairDiagnosis[] }
    | { readonly ok: false; readonly message: string };

export interface RefusedEdit {
    readonly path: string;
    readonly reason: string;
}

export interface AgentReport {
    readonly consulted: boolean;
    readonly available: boolean;
    readonly message: string;
    readonly cause: string | null;
    readonly notes: string | null;
    readonly refused: readonly RefusedEdit[];
}

export interface AppliedChange {
    readonly path: string;
    readonly absolutePath: string;
    readonly before: string | null;
    readonly after: string;
    readonly diff: string;
    readonly linesAdded: number;
    readonly linesRemoved: number;
}

export interface HistoryReport {
    readonly recorded: boolean;
    readonly message: string;
}

export interface RepairResult {
    readonly explained: boolean;
    readonly diagnoses: readonly RepairDiagnosis[];
    readonly agent: AgentReport;
    readonly applied: readonly AppliedChange[];
    readonly history: HistoryReport | null;
    readonly summary: string;
    readonly at: string;
}

export type RepairAnswer =
    | { readonly ok: true; readonly result: RepairResult }
    | { readonly ok: false; readonly message: string };

/**
 * Issue-reporting is deliberately a capability query, not a submit API. The renderer can
 * explain whether a local draft is offline, lacks sign-in, or is merely ready for the user
 * to review and copy; no bridge method accepts or sends a report.
 */
export type IssueReportAvailability =
    | { readonly status: "ready"; readonly accountLabel: string | null }
    | { readonly status: "offline"; readonly reason: string }
    | { readonly status: "not-signed-in"; readonly reason: string };

export interface IssueReportData {
    readonly app: string;
    readonly build: string;
    readonly engine: string;
    readonly platform: string;
    readonly failureCategory: string;
    readonly configFacts: readonly string[];
    readonly reproductionSteps: readonly string[];
    readonly consoleEvidence: readonly string[];
}

export interface IssueReportDraft {
    readonly title: string;
    readonly body: string;
    readonly report: IssueReportData;
    readonly requiresUserConfirmation: true;
    readonly autoSubmitted: false;
}

export interface IssueReportSelection {
    readonly reproductionSteps?: readonly string[];
    readonly consoleEvidence?: readonly string[];
}

export type IssueReportDraftAnswer =
    | { readonly ok: true; readonly draft: IssueReportDraft }
    | {
          readonly ok: false;
          readonly status: "invalid" | "missing";
          readonly message: string;
      };

export type IssueReportExportAnswer =
    | { readonly ok: true; readonly path: string }
    | {
          readonly ok: false;
          readonly status: "invalid" | "cancelled" | "failed";
          readonly message: string;
      };

export type IssueReportSubmitAnswer =
    | { readonly ok: true; readonly url: string }
    | {
          readonly ok: false;
          readonly status: "invalid" | "offline" | "not-signed-in" | "permission-denied" | "failed";
          readonly message: string;
      };

export interface IssueReportSubmitRequest {
    readonly title: string;
    readonly markdown: string;
}

export interface IssueReportBridge {
    availability(): Promise<IssueReportAvailability>;
    draft(failureId: string, selection?: IssueReportSelection): Promise<IssueReportDraftAnswer>;
    export(content: string, format: "json" | "markdown"): Promise<IssueReportExportAnswer>;
    submit(request: IssueReportSubmitRequest): Promise<IssueReportSubmitAnswer>;
}

/** What this surface needs from the shell. All or nothing, per this project's usual rule. */
export interface RepairBridge {
    agentAvailability(): Promise<AgentAvailability>;
    failures(): Promise<readonly FailureSummary[]>;
    diagnose(id: string): Promise<DiagnoseAnswer>;
    run(id: string): Promise<RepairAnswer>;
    readonly issueReport?: IssueReportBridge;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The repair bridge, or null when this build cannot diagnose or repair a failed run. */
export function resolveRepairBridge(): RepairBridge | null {
    const host = (globalThis as { worldlens?: { repair?: unknown } }).worldlens;
    if (host === undefined) return null;
    const api = host.repair;
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<RepairBridge>;
    const required = [candidate.agentAvailability, candidate.failures, candidate.diagnose, candidate.run];
    if (!required.every(isFunction)) return null;

    const complete = api as RepairBridge;
    const reportCandidate = candidate.issueReport;
    const reportBridge =
        typeof reportCandidate === "object" &&
        reportCandidate !== null &&
        isFunction((reportCandidate as { availability?: unknown }).availability)
        && isFunction((reportCandidate as { draft?: unknown }).draft)
        && isFunction((reportCandidate as { export?: unknown }).export)
        && isFunction((reportCandidate as { submit?: unknown }).submit)
            ? {
                  availability: () =>
                      (reportCandidate as { availability: () => Promise<IssueReportAvailability> }).availability(),
                  draft: (failureId: string, selection?: IssueReportSelection) =>
                      (reportCandidate as {
                          draft: (failureId: string, selection?: IssueReportSelection) => Promise<IssueReportDraftAnswer>;
                      }).draft(failureId, selection),
                  export: (content: string, format: "json" | "markdown") =>
                      (reportCandidate as {
                          export: (content: string, format: "json" | "markdown") => Promise<IssueReportExportAnswer>;
                      }).export(content, format),
                  submit: (request: IssueReportSubmitRequest) =>
                      (reportCandidate as {
                          submit: (request: IssueReportSubmitRequest) => Promise<IssueReportSubmitAnswer>;
                      }).submit(request),
              }
            : undefined;
    return {
        agentAvailability: () => complete.agentAvailability(),
        failures: () => complete.failures(),
        diagnose: (id) => complete.diagnose(id),
        run: (id) => complete.run(id),
        ...(reportBridge === undefined ? {} : { issueReport: reportBridge }),
    };
}
