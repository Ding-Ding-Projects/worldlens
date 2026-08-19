/** Privacy-safe diagnostic report assembly.
 *
 * This module deliberately stops at a reviewed draft.  It does not invoke a browser,
 * `gh`, or a network client: submission is an explicit boundary owned by the caller.
 * Keeping the boundary here makes it impossible for collecting diagnostics to become an
 * accidental auto-send path.
 */

import { redactSecrets as redactKnownSecrets } from "../security/redact.js";

export const MAX_REPORT_LOG_CHARS = 16 * 1024;
export const MAX_REPORT_LOG_LINES = 80;
export const MAX_REPORT_ITEMS = 32;
export const MAX_REPORT_FIELD_CHARS = 512;
export const MAX_REPORT_TOTAL_CHARS = 64 * 1024;
export const MAX_REPORT_TITLE_CHARS = 120;
export const MAX_REPORT_INPUT_CHARS = 64 * 1024;
export const REPORT_REDACTED = "[redacted]";

export interface DiagnosticReportInput {
    readonly app: string;
    readonly build: string;
    readonly engine: string;
    readonly platform: string;
    readonly failureCategory: string;
    readonly configFacts?: readonly string[];
    readonly reproductionSteps?: readonly string[];
    readonly consoleEvidence?: readonly string[];
}

export interface DiagnosticReport {
    readonly app: string;
    readonly build: string;
    readonly engine: string;
    readonly platform: string;
    readonly failureCategory: string;
    readonly configFacts: readonly string[];
    readonly reproductionSteps: readonly string[];
    readonly consoleEvidence: readonly string[];
}

export interface IssueDraft {
    readonly title: string;
    readonly body: string;
    readonly report: DiagnosticReport;
    readonly requiresUserConfirmation: true;
    readonly autoSubmitted: false;
}

/** Redact secrets and identifying machine details without deleting diagnostic facts. */
export function redactDiagnosticText(value: string): string {
    let result = redactKnownSecrets(value);

    // Raw bearer shapes may arrive before they have ever touched the credential broker.
    result = result.replace(/\b(?:gh[pousr]_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_\-]{12,}\b/g, REPORT_REDACTED);
    result = result.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, REPORT_REDACTED);
    result = result.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REPORT_REDACTED);

    // User-bearing home paths: keep the useful path shape, not the account name.
    result = result.replace(/([A-Za-z]:[\\/]+Users[\\/])[^\\/\s]+/gi, `$1${REPORT_REDACTED}`);
    result = result.replace(/([\\/]Users[\\/]|[\\/]home[\\/])[^\\/\s]+/gi, `$1${REPORT_REDACTED}`);
    result = result.replace(/^(\\\\)[^\\/]+(\\[^\r\n]*)/gm, `$1${REPORT_REDACTED}$2`);

    // Bearer/API/key assignments and query values are structured secret locations.
    result = result.replace(/(\b(?:authorization\s*:\s*bearer|bearer|token|api[_-]?key|secret|password)\s*[=:]\s*)[^\s,;]+/gi, `$1${REPORT_REDACTED}`);
    result = result.replace(/([?&](?:token|api[_-]?key|secret|password)\s*=)[^&#\s]+/gi, `$1${REPORT_REDACTED}`);
    result = result.replace(/(\b[a-z][a-z\d+.-]*:\/\/)(?:[^@/\s]+@)?(\[[0-9a-f:]+\]|[^/:\s]+)(:\d+)?/gi, `$1${REPORT_REDACTED}$3`);

    // Private addresses and explicit host fields should not identify a private network.
    result = result.replace(/\b(?:127\.0\.0\.1|localhost|0\.0\.0\.0|10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})\b/gi, REPORT_REDACTED);
    result = result.replace(/\b(?:fe80|fc|fd)[0-9a-f:]+\b/gi, REPORT_REDACTED);
    result = result.replace(/(\b(?:host|hostname|server)\s*[=:]\s*)[^\s,;]+/gi, `$1${REPORT_REDACTED}`);

    return result;
}

function boundedLines(lines: readonly string[] | undefined): string[] {
    // Bound untrusted console input before doing any regex work. The final output is
    // still redacted before its own truncation below, so a retained token is never
    // exposed merely because it crossed an output boundary.
    let rawRemaining = MAX_REPORT_INPUT_CHARS;
    const boundedInput: string[] = [];
    for (const line of (lines ?? []).slice(0, MAX_REPORT_ITEMS)) {
        if (rawRemaining <= 0) break;
        const raw = String(line).slice(0, rawRemaining);
        boundedInput.push(raw);
        rawRemaining -= raw.length;
    }
    const clean = boundedInput
        .flatMap((line) => redactDiagnosticText(line).replace(/\r/g, "").split("\n"))
        .filter((line) => line.trim().length > 0);
    const tail = clean.slice(-MAX_REPORT_LOG_LINES);
    let total = 0;
    const bounded: string[] = [];
    for (const line of tail.reverse()) {
        if (total + line.length > MAX_REPORT_LOG_CHARS) break;
        bounded.unshift(line);
        total += line.length;
    }
    return bounded;
}

function boundedField(value: unknown): string {
    // Bound hostile input before regex work, then redact before output truncation.
    const raw = String(value ?? "").slice(0, MAX_REPORT_INPUT_CHARS);
    return redactDiagnosticText(raw).slice(0, MAX_REPORT_FIELD_CHARS);
}

function boundedItems(values: readonly string[] | undefined): string[] {
    return (values ?? []).slice(0, MAX_REPORT_ITEMS).map(boundedField);
}

export function createDiagnosticReport(input: DiagnosticReportInput): DiagnosticReport {
    const report = {
        app: boundedField(input.app),
        build: boundedField(input.build),
        engine: boundedField(input.engine),
        platform: boundedField(input.platform),
        failureCategory: boundedField(input.failureCategory),
        configFacts: boundedItems(input.configFacts),
        reproductionSteps: boundedItems(input.reproductionSteps),
        consoleEvidence: boundedLines(input.consoleEvidence),
    };
    // Keep the exported object bounded even when every optional collection is populated.
    let remaining = Math.max(
        0,
        MAX_REPORT_TOTAL_CHARS -
            report.app.length -
            report.build.length -
            report.engine.length -
            report.platform.length -
            report.failureCategory.length,
    );
    const trimCollection = (items: readonly string[]): string[] => items.map((item) => {
        if (remaining <= 0) return "";
        const kept = item.slice(0, remaining);
        remaining -= kept.length;
        return kept;
    });
    const bounded = {
        ...report,
        configFacts: trimCollection(report.configFacts),
        reproductionSteps: trimCollection(report.reproductionSteps),
        consoleEvidence: trimCollection(report.consoleEvidence),
    };
    return bounded;
}

export function exportDiagnosticReportJson(report: DiagnosticReport): string {
    return `${JSON.stringify(report, null, 2)}\n`;
}

export function exportDiagnosticReportMarkdown(report: DiagnosticReport): string {
    const list = (values: readonly string[]) => values.length === 0 ? "- None provided" : values.map((value) => `- ${value}`).join("\n");
    return [
        `# ${report.failureCategory}`,
        "",
        `- App: ${report.app}`,
        `- Build: ${report.build}`,
        `- Engine: ${report.engine}`,
        `- Platform: ${report.platform}`,
        "",
        "## Configuration facts",
        list(report.configFacts),
        "",
        "## Reproduction steps",
        list(report.reproductionSteps),
        "",
        "## Selected console evidence",
        report.consoleEvidence.length === 0 ? "None provided" : `\n${markdownFence(report.consoleEvidence.join("\n"))}`,
        "",
        "This draft was redacted locally and was not submitted automatically.",
        "",
    ].join("\n");
}

function markdownFence(value: string): string {
    const longestRun = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    return `${fence}text\n${value}\n${fence}`;
}

/** Build a reviewed draft. Calling this function never submits or opens anything. */
export function prepareIssueDraft(report: DiagnosticReport): IssueDraft {
    const title = `[${boundedField(report.failureCategory)}] ${boundedField(report.app)}`.slice(0, MAX_REPORT_TITLE_CHARS);
    return {
        title,
        body: exportDiagnosticReportMarkdown(report),
        report,
        requiresUserConfirmation: true,
        autoSubmitted: false,
    };
}

