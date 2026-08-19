import type { FailureSummary, RepairDiagnosis, RepairResult } from "./repairBridge.js";

export const MAX_EVIDENCE_CHARS = 4_000;
export const MAX_FIELD_CHARS = 8_000;

export interface IssueReportField {
    readonly key: string;
    readonly label: string;
    value: string;
    readonly required: boolean;
}

export interface IssueReportInput {
    readonly appVersion: string;
    readonly platform: string;
    readonly engine: string;
    readonly failure: FailureSummary;
    readonly diagnoses?: readonly RepairDiagnosis[];
    readonly result?: RepairResult | null;
    readonly consoleEvidence?: string;
    readonly reproductionSteps?: string;
}

/**
 * Redacts only sensitive shapes we can identify confidently. It deliberately preserves
 * surrounding words, error categories and punctuation so a report remains useful.
 */
export function redactReportText(input: string, limit = MAX_FIELD_CHARS): string {
    const redacted = input
        // Raw bearer shapes may arrive without passing through the main-process broker.
        .replace(/\b(?:gh[pousr]_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_\-]{12,}\b/g, "[redacted]")
        .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted]")
        .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted]")
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
        .replace(/((?:password|passwd|secret|token|api[-_]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]")
        .replace(/([?&](?:token|secret|password|key|authorization)=)[^&#\s]+/gi, "$1[redacted]")
        .replace(/(\b[a-z][a-z\d+.-]*:\/\/)([^@/\s]+):([^@/\s]+)@/gi, "$1[redacted]@[redacted]")
        // Replace the whole username-bearing path, not only the first segment. Leaving the
        // remainder behind can still disclose a profile name in slash-normalised paths.
        .replace(/(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]|\/(?:home|Users)\/)[^\s]+/gi, (path) => {
            const prefix = path.match(/^(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]|\/(?:home|Users)\/)/i)?.[0] ?? "";
            return `${prefix}[redacted path]`;
        })
        .replace(/^(\\\\)[^\\/]+(\\[^\r\n]*)/gm, "$1[redacted host]$2")
        .replace(/\b(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.(?:\d{1,3}\.){1,2}\d{1,3}\b/g, "[private address]")
        .replace(/(?:::1|fe80(?::[0-9a-f]+){1,7}|f[cd](?::[0-9a-f]+){1,7})/gi, "[private address]")
        .replace(/\b(?:[a-z0-9-]+\.)+(?:local|lan|internal|home|corp)\b/gi, "[private host]")
        .replace(/(\b(?:host|hostname|server)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted host]");
    // Redact first, then truncate. Comparing the post-redaction size to the raw input
    // incorrectly labels a report as truncated merely because a secret became shorter.
    return redacted.length > limit ? redacted.slice(0, limit) : redacted;
}

function bounded(value: string, limit = MAX_FIELD_CHARS): string {
    const redacted = redactReportText(value);
    const safe = redacted.slice(0, limit);
    return redacted.length > limit ? `${safe}\n[… evidence truncated …]` : safe;
}

export function buildIssueReportFields(input: IssueReportInput): IssueReportField[] {
    const diagnosis = input.diagnoses?.map((item) => `${item.code}: ${item.message}`).join("\n") ?? "No diagnosis has been run yet.";
    const result = input.result?.summary ?? "No repair was run.";
    return [
        { key: "version", label: "App/build", value: bounded(input.appVersion || "unknown"), required: true },
        { key: "platform", label: "Platform", value: bounded(input.platform || "unknown"), required: true },
        { key: "engine", label: "Engine", value: bounded(input.engine || "unknown"), required: true },
        { key: "category", label: "Failure category", value: `${input.failure.subject} / ${input.failure.mode}`, required: true },
        { key: "occurred", label: "Occurred", value: bounded(input.failure.at), required: true },
        { key: "exitCode", label: "Exit code", value: input.failure.exitCode === null ? "not reported" : String(input.failure.exitCode), required: true },
        { key: "diagnosis", label: "Diagnosis", value: bounded(diagnosis), required: false },
        { key: "repair", label: "Repair result", value: bounded(result), required: false },
        { key: "reproduction", label: "Reproduction steps", value: bounded(input.reproductionSteps ?? ""), required: false },
        { key: "console", label: "Selected console evidence", value: bounded(input.consoleEvidence ?? "", MAX_EVIDENCE_CHARS), required: false },
    ];
}

export function issueReportMarkdown(fields: readonly IssueReportField[]): string {
    const sections = fields
        .filter((field) => field.value.trim().length > 0)
        .map((field) => `### ${field.label}\n\n${markdownFence(redactReportText(field.value).trim())}`);
    return ["## Worldlens issue report draft", "", "> Nothing has been submitted. Review and edit this draft before opening GitHub.", "", ...sections].join("\n\n");
}

/** Keep user-authored evidence faithful without allowing it to become report markup. */
function markdownFence(value: string): string {
    const longestRun = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    return `${fence}text\n${value}\n${fence}`;
}

export function issueReportJson(fields: readonly IssueReportField[]): string {
    return JSON.stringify(
        { schema: 1, submitted: false, fields: Object.fromEntries(fields.filter((field) => field.value.trim()).map((field) => [field.key, redactReportText(field.value)])) },
        null,
        2,
    );
}

export function issueReportUrl(title: string): string {
    const safeTitle = redactReportText(title, 120).replace(/[\r\n]/g, " ").trim() || "Issue report";
    return `https://github.com/Ding-Ding-Projects/worldlens/issues/new?title=${encodeURIComponent(safeTitle)}`;
}
