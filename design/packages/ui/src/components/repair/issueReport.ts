import type { IssueReportData } from "./repairBridge.js";

export const MAX_EVIDENCE_CHARS = 4_000;
export const MAX_FIELD_CHARS = 8_000;

export interface IssueReportField {
    readonly key: string;
    readonly label: string;
    value: string;
    readonly required: boolean;
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

export function buildIssueReportFields(report: IssueReportData): IssueReportField[] {
    return [
        { key: "app", label: "App", value: bounded(report.app), required: true },
        { key: "build", label: "Build", value: bounded(report.build), required: true },
        { key: "engine", label: "Engine", value: bounded(report.engine), required: true },
        { key: "platform", label: "Platform", value: bounded(report.platform), required: true },
        { key: "failureCategory", label: "Failure category", value: bounded(report.failureCategory), required: true },
        { key: "configFacts", label: "Configuration facts", value: bounded(report.configFacts.join("\n")), required: false },
        { key: "reproductionSteps", label: "Reproduction steps", value: bounded(report.reproductionSteps.join("\n")), required: false },
        { key: "consoleEvidence", label: "Selected console evidence", value: bounded(report.consoleEvidence.join("\n"), MAX_EVIDENCE_CHARS), required: false },
    ];
}

function fieldValue(fields: readonly IssueReportField[], key: string): string {
    return redactReportText(fields.find((field) => field.key === key)?.value ?? "").trim();
}

function fieldLines(fields: readonly IssueReportField[], key: string): string[] {
    return fieldValue(fields, key).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function issueReportMarkdown(fields: readonly IssueReportField[]): string {
    const list = (values: readonly string[]) =>
        values.length === 0 ? "- None provided" : values.map((value) => `- ${value}`).join("\n");
    const category = fieldValue(fields, "failureCategory") || "Worldlens diagnostic report";
    return [
        `# ${category}`,
        "",
        `- App: ${fieldValue(fields, "app")}`,
        `- Build: ${fieldValue(fields, "build")}`,
        `- Engine: ${fieldValue(fields, "engine")}`,
        `- Platform: ${fieldValue(fields, "platform")}`,
        "",
        "## Configuration facts",
        list(fieldLines(fields, "configFacts")),
        "",
        "## Reproduction steps",
        list(fieldLines(fields, "reproductionSteps")),
        "",
        "## Selected console evidence",
        fieldLines(fields, "consoleEvidence").length === 0
            ? "None provided"
            : `\n${markdownFence(fieldLines(fields, "consoleEvidence").join("\n"))}`,
        "",
        "This draft was redacted locally and was not submitted automatically.",
        "",
    ].join("\n");
}

/** Keep user-authored evidence faithful without allowing it to become report markup. */
function markdownFence(value: string): string {
    const longestRun = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    return `${fence}text\n${value}\n${fence}`;
}

export function issueReportJson(fields: readonly IssueReportField[]): string {
    return JSON.stringify(
        {
            app: fieldValue(fields, "app"),
            build: fieldValue(fields, "build"),
            engine: fieldValue(fields, "engine"),
            platform: fieldValue(fields, "platform"),
            failureCategory: fieldValue(fields, "failureCategory"),
            configFacts: fieldLines(fields, "configFacts"),
            reproductionSteps: fieldLines(fields, "reproductionSteps"),
            consoleEvidence: fieldLines(fields, "consoleEvidence"),
        },
        null,
        2,
    );
}
