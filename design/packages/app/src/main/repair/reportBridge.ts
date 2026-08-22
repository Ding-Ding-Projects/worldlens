import type {
    App,
    BrowserWindow,
    Dialog,
    IpcMain,
    IpcMainInvokeEvent,
    SaveDialogReturnValue,
    WebContents,
} from "electron";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { GhCredentialBroker, GhCredentialError } from "../ghcli/credentialBroker.js";
import type { ProcessResult } from "../cirender/gh.js";
import { renameWithRetry } from "@worldlens/server";
import {
    MAX_REPORT_BODY_CHARS,
    MAX_REPORT_FIELD_CHARS,
    MAX_REPORT_INPUT_CHARS,
    MAX_REPORT_ITEMS,
    MAX_REPORT_TITLE_CHARS,
    REPORT_REDACTED,
    createDiagnosticReport,
    parseDiagnosticReportInput,
    prepareIssueDraft,
    redactDiagnosticText,
    type DiagnosticReportInput,
    type IssueDraft,
} from "./report.js";
import type { RepairEvidence } from "./evidence.js";

/** Channels owned by the issue-report capability beneath the repair namespace. */
export const REPORT_CHANNELS = [
    "repair:reportAvailability",
    "repair:reportDraft",
    "repair:reportExport",
    "repair:reportSubmit",
] as const;

export type IssueReportAvailability =
    | { readonly status: "ready"; readonly accountLabel: string | null }
    | { readonly status: "offline"; readonly reason: string }
    | { readonly status: "not-signed-in"; readonly reason: string };

export type IssueReportDraftAnswer =
    | { readonly ok: true; readonly draft: IssueDraft }
    | { readonly ok: false; readonly status: "invalid" | "missing"; readonly message: string };

export type IssueReportSubmitAnswer =
    | { readonly ok: true; readonly url: string }
    | {
          readonly ok: false;
          readonly status: "invalid" | "offline" | "not-signed-in" | "permission-denied" | "failed";
          readonly message: string;
      };

export type IssueReportExportAnswer =
    | { readonly ok: true; readonly path: string }
    | { readonly ok: false; readonly status: "invalid" | "cancelled" | "failed"; readonly message: string };

export interface ReportDraftSelection {
    readonly reproductionSteps?: readonly string[];
    readonly consoleEvidence?: readonly string[];
}

export interface ReportBridgeOptions {
    /** The stored record is the only source of evidence; the renderer supplies only its id. */
    readonly evidenceFor: (id: string) => RepairEvidence | null;
    /** A broker lease selects and restores the user-chosen GitHub CLI account. */
    readonly broker: GhCredentialBroker | null;
    readonly appName: () => string;
    readonly buildVersion: () => string;
    readonly platform: () => string;
    readonly dialog?: Dialog;
    readonly app?: App;
    readonly resolveWindow?: (sender: WebContents) => BrowserWindow | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectionOf(value: unknown): ReportDraftSelection | null {
    if (value === undefined) return {};
    if (!isRecord(value)) return null;
    const keys = Object.keys(value);
    if (keys.some((key) => key !== "reproductionSteps" && key !== "consoleEvidence")) return null;
    for (const key of ["reproductionSteps", "consoleEvidence"] as const) {
        const items = value[key];
        if (
            items !== undefined &&
            (!Array.isArray(items) ||
                items.length > MAX_REPORT_ITEMS ||
                items.some((item) => typeof item !== "string" || item.length > MAX_REPORT_INPUT_CHARS))
        ) {
            return null;
        }
    }
    return {
        ...(value.reproductionSteps === undefined ? {} : { reproductionSteps: value.reproductionSteps as string[] }),
        ...(value.consoleEvidence === undefined ? {} : { consoleEvidence: value.consoleEvidence as string[] }),
    };
}

function reportInputFor(
    evidence: RepairEvidence,
    selection: ReportDraftSelection,
    options: ReportBridgeOptions,
): DiagnosticReportInput {
    const engine = evidence.engineId ?? "unknown";
    const configFacts = evidence.config
        .slice(0, MAX_REPORT_ITEMS)
        .map((file) => `${file.path}: ${file.text}`.slice(0, MAX_REPORT_INPUT_CHARS));
    const consoleEvidence =
        selection.consoleEvidence ??
        [...evidence.diagnostics, ...evidence.stderr, ...evidence.setupProblems]
            .slice(0, MAX_REPORT_ITEMS)
            .map((line) => line.slice(0, MAX_REPORT_INPUT_CHARS));
    return {
        app: options.appName(),
        build: options.buildVersion(),
        engine,
        platform: options.platform(),
        failureCategory: evidence.subject,
        configFacts,
        ...(selection.reproductionSteps === undefined ? {} : { reproductionSteps: selection.reproductionSteps }),
        consoleEvidence,
    };
}

function failureFromGhError(error: GhCredentialError): IssueReportSubmitAnswer {
    if (error.code === "gh-not-installed" || error.code === "gh-incompatible") {
        return { ok: false, status: "offline", message: "GitHub CLI is unavailable in this launch." };
    }
    if (error.code === "account-ambiguous") {
        return { ok: false, status: "offline", message: "Choose one active GitHub CLI account before submitting." };
    }
    if (error.code === "account-restore-failed") {
        return {
            ok: false,
            status: "failed",
            message:
                "Issue creation may have completed, but the prior GitHub CLI account could not be restored. Check the account state before retrying.",
        };
    }
    return {
        ok: false,
        status: "not-signed-in",
        message: "The selected GitHub CLI account could not be verified; sign in again before submitting.",
    };
}

function failureFromProcess(result: ProcessResult): IssueReportSubmitAnswer {
    const detail = `${result.stderr}\n${result.stdout}`.toLowerCase();
    if (detail.includes("403") || detail.includes("forbidden") || detail.includes("permission")) {
        return {
            ok: false,
            status: "permission-denied",
            message: "GitHub refused issue creation for this account; grant repository issue permission and try again.",
        };
    }
    if (detail.includes("401") || detail.includes("authentication") || detail.includes("sign in")) {
        return {
            ok: false,
            status: "not-signed-in",
            message: "GitHub CLI authentication was refused; sign in again before submitting.",
        };
    }
    if (
        detail.includes("network") ||
        detail.includes("offline") ||
        detail.includes("timed out") ||
        detail.includes("resolve") ||
        detail.includes("connect")
    ) {
        return { ok: false, status: "offline", message: "GitHub could not be reached; the report was not submitted." };
    }
    return { ok: false, status: "failed", message: "GitHub CLI could not create the issue; the report was not submitted." };
}

function issueUrl(stdout: string): string | null {
    const match = stdout.match(/https:\/\/github\.com\/Ding-Ding-Projects\/worldlens\/issues\/\d+(?:\b|$)/);
    return match?.[0] ?? null;
}

/**
 * Keep the title useful while refusing path, URL, and host-shaped data in command arguments.
 * The full reviewed report remains in the temporary body file, never in argv.
 */
function safeTitle(value: string): string {
    const redacted = redactDiagnosticText(value.slice(0, MAX_REPORT_INPUT_CHARS))
        .replace(/https?:\/\/\S+/gi, REPORT_REDACTED)
        .replace(/[A-Za-z]:[\\/][^\s]*/g, REPORT_REDACTED)
        .replace(/[\\/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const compact = redacted.slice(0, MAX_REPORT_TITLE_CHARS);
    if (
        compact.length === 0 ||
        /\b(?:host|hostname|server)\b/i.test(compact) ||
        /(?:\b\d{1,3}\.){3}\d{1,3}\b/.test(compact) ||
        /\b(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/.test(compact)
    ) {
        return "Worldlens diagnostic report";
    }
    return compact;
}

function parseSubmitRequest(value: unknown): { title: string; markdown: string } | null {
    if (!isRecord(value)) return null;
    if (Object.keys(value).some((key) => key !== "title" && key !== "markdown")) return null;
    if (typeof value.title !== "string" || typeof value.markdown !== "string") return null;
    if (value.title.length > MAX_REPORT_INPUT_CHARS || value.markdown.length > MAX_REPORT_BODY_CHARS) return null;
    if (value.title.trim() === "" || value.markdown.trim() === "") return null;
    return { title: value.title, markdown: value.markdown };
}

const INVALID_JSON = Symbol("invalid-report-json");
const MAX_JSON_DEPTH = 8;
const MAX_JSON_NODES = 256;

class ExportRestoreError extends Error {
    readonly backupPath: string;

    constructor(backupPath: string, cause: unknown) {
        super("The export destination could not be replaced and its original file was preserved.", { cause });
        this.name = "ExportRestoreError";
        this.backupPath = backupPath;
    }
}

function redactJsonValue(
    value: unknown,
    depth: number,
    budget: { nodes: number },
): unknown | typeof INVALID_JSON {
    if (depth > MAX_JSON_DEPTH || budget.nodes >= MAX_JSON_NODES) return INVALID_JSON;
    budget.nodes += 1;
    if (typeof value === "string") {
        if (value.length > MAX_REPORT_INPUT_CHARS) return INVALID_JSON;
        return redactDiagnosticText(value);
    }
    if (value === null || typeof value === "boolean" || typeof value === "number") return value;
    if (Array.isArray(value)) {
        if (value.length > MAX_REPORT_ITEMS) return INVALID_JSON;
        const result: unknown[] = [];
        for (const item of value) {
            const clean = redactJsonValue(item, depth + 1, budget);
            if (clean === INVALID_JSON) return INVALID_JSON;
            result.push(clean);
        }
        return result;
    }
    if (!isRecord(value) || Object.keys(value).length > MAX_REPORT_ITEMS) return INVALID_JSON;
    const result: Record<string, unknown> = {};
    const keys = new Set<string>();
    for (const [key, item] of Object.entries(value)) {
        if (key.length > MAX_REPORT_FIELD_CHARS) return INVALID_JSON;
        const cleanKey = redactDiagnosticText(key).slice(0, MAX_REPORT_FIELD_CHARS);
        if (cleanKey.length === 0 || keys.has(cleanKey)) return INVALID_JSON;
        const clean = redactJsonValue(item, depth + 1, budget);
        if (clean === INVALID_JSON) return INVALID_JSON;
        keys.add(cleanKey);
        Object.defineProperty(result, cleanKey, { value: clean, enumerable: true, writable: true });
    }
    return result;
}

async function writeExportAtomically(destination: string, content: string): Promise<void> {
    const stagingDirectory = await mkdtemp(join(dirname(destination), ".worldlens-report-"));
    const staging = join(stagingDirectory, "report.tmp");
    const backup = join(stagingDirectory, "existing.tmp");
    let movedExisting = false;
    let preserveDirectory = false;
    try {
        await writeFile(staging, content, { encoding: "utf8", flag: "wx" });
        try {
            await renameWithRetry(destination, backup);
            movedExisting = true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        try {
            await renameWithRetry(staging, destination);
        } catch (error) {
            if (movedExisting) {
                try {
                    await renameWithRetry(backup, destination);
                } catch (restoreError) {
                    preserveDirectory = true;
                    throw new ExportRestoreError(backup, restoreError);
                }
            }
            throw error;
        }
        if (movedExisting) await rm(backup, { force: true }).catch(() => undefined);
    } finally {
        if (!preserveDirectory) {
            await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
        }
    }
}

export function registerReportHandlers(
    ipcMain: IpcMain,
    options: ReportBridgeOptions,
): void {
    ipcMain.handle("repair:reportAvailability", async (): Promise<IssueReportAvailability> => {
        if (options.broker === null) {
            return { status: "offline", reason: "GitHub CLI account support is unavailable in this launch." };
        }
        try {
            const lease = await options.broker.account(undefined, "read");
            if (lease === null) {
                return { status: "not-signed-in", reason: "Sign in to GitHub CLI before submitting a report." };
            }
            if (lease.host.toLowerCase() !== "github.com") {
                return { status: "offline", reason: "Report submission is available only for github.com accounts." };
            }
            return { status: "ready", accountLabel: lease.login };
        } catch (error) {
            if (error instanceof GhCredentialError && error.code === "account-ambiguous") {
                return { status: "offline", reason: "Choose one active GitHub CLI account before submitting." };
            }
            return { status: "not-signed-in", reason: "Sign in to GitHub CLI before submitting a report." };
        }
    });

    ipcMain.handle(
        "repair:reportDraft",
        (_event: IpcMainInvokeEvent, id: unknown, rawSelection: unknown): IssueReportDraftAnswer => {
            if (typeof id !== "string" || id.length === 0 || id.length > 128) {
                return { ok: false, status: "invalid", message: "The selected failure id is invalid." };
            }
            const selection = selectionOf(rawSelection);
            if (selection === null) {
                return { ok: false, status: "invalid", message: "The report selections were invalid or too large." };
            }
            const evidence = options.evidenceFor(id);
            if (evidence === null) {
                return { ok: false, status: "missing", message: "That failure is no longer on record." };
            }
            const input = reportInputFor(evidence, selection, options);
            const parsedInput = parseDiagnosticReportInput(input);
            if (parsedInput === null) {
                return { ok: false, status: "invalid", message: "The stored report facts exceeded a safe bound." };
            }
            return { ok: true, draft: prepareIssueDraft(createDiagnosticReport(parsedInput)) };
        },
    );

    ipcMain.handle(
        "repair:reportExport",
        async (
            event: IpcMainInvokeEvent,
            rawRequest: unknown,
        ): Promise<IssueReportExportAnswer> => {
            if (!isRecord(rawRequest) ||
                Object.keys(rawRequest).some((key) => key !== "format" && key !== "content") ||
                (rawRequest.format !== "json" && rawRequest.format !== "markdown") ||
                typeof rawRequest.content !== "string" ||
                rawRequest.content.length > MAX_REPORT_BODY_CHARS ||
                rawRequest.content.trim() === "") {
                return { ok: false, status: "invalid", message: "Choose JSON or Markdown for the report export." };
            }
            if (options.dialog === undefined || options.app === undefined) {
                return { ok: false, status: "failed", message: "Report export is unavailable in this launch." };
            }
            const format = rawRequest.format as "json" | "markdown";
            const rawContent = rawRequest.content as string;
            let content: string;
            if (format === "json") {
                let parsed: unknown;
                try {
                    parsed = JSON.parse(rawContent);
                } catch {
                    return { ok: false, status: "invalid", message: "The reviewed JSON export was malformed." };
                }
                const redacted = redactJsonValue(parsed, 0, { nodes: 0 });
                if (redacted === INVALID_JSON) {
                    return { ok: false, status: "invalid", message: "The reviewed JSON export exceeded its safe structure bounds." };
                }
                content = `${JSON.stringify(redacted, null, 2)}\n`;
            } else {
                content = redactDiagnosticText(rawContent);
            }
            if (content.length === 0 || content.length > MAX_REPORT_BODY_CHARS) {
                return { ok: false, status: "invalid", message: "The reviewed export became empty or exceeded its safe bound." };
            }
            let choice: SaveDialogReturnValue;
            try {
                const parent = options.resolveWindow?.(event.sender) ?? null;
                const dialogOptions = {
                    title: "Export Worldlens diagnostic report",
                    defaultPath: join(
                        options.app.getPath("documents"),
                        `worldlens-diagnostic-report.${format === "json" ? "json" : "md"}`,
                    ),
                    filters:
                        format === "json"
                            ? [{ name: "JSON", extensions: ["json"] }]
                            : [{ name: "Markdown", extensions: ["md"] }],
                };
                choice =
                    parent === null
                        ? await options.dialog.showSaveDialog(dialogOptions)
                        : await options.dialog.showSaveDialog(parent, dialogOptions);
            } catch {
                return { ok: false, status: "failed", message: "The report export dialog was unavailable." };
            }
            if (choice.canceled || choice.filePath === undefined) {
                return { ok: false, status: "cancelled", message: "The report export was cancelled." };
            }
            try {
                await writeExportAtomically(choice.filePath, content);
                return { ok: true, path: choice.filePath };
            } catch {
                return { ok: false, status: "failed", message: "The report could not be written to the selected file." };
            }
        },
    );

    ipcMain.handle(
        "repair:reportSubmit",
        async (_event: IpcMainInvokeEvent, rawRequest: unknown): Promise<IssueReportSubmitAnswer> => {
            const request = parseSubmitRequest(rawRequest);
            if (request === null) {
                return { ok: false, status: "invalid", message: "The reviewed title or report body was invalid or too large." };
            }
            // Re-redact the reviewed bytes in the main process. The renderer is a presentation
            // surface, never the privacy boundary, even when it received a main-built draft.
            const title = safeTitle(request.title);
            const markdown = redactDiagnosticText(request.markdown.slice(0, MAX_REPORT_BODY_CHARS));
            if (markdown.length === 0 || markdown.length > MAX_REPORT_BODY_CHARS) {
                return { ok: false, status: "invalid", message: "The reviewed report body became empty or exceeded its safe bound." };
            }
            if (options.broker === null) {
                return { ok: false, status: "offline", message: "GitHub CLI account support is unavailable in this launch." };
            }

            let temporaryDirectory: string | undefined;
            try {
                const lease = await options.broker.account(undefined, "write");
                if (lease === null) {
                    return { ok: false, status: "not-signed-in", message: "Sign in to GitHub CLI before submitting a report." };
                }
                if (lease.host.toLowerCase() !== "github.com") {
                    return { ok: false, status: "offline", message: "Report submission is available only for github.com accounts." };
                }
                temporaryDirectory = await mkdtemp(join(tmpdir(), "worldlens-report-"));
                const bodyPath = join(temporaryDirectory, "body.md");
                await writeFile(bodyPath, markdown, { encoding: "utf8", flag: "wx" });
                const result = await lease.run([
                    "issue",
                    "create",
                    "--repo",
                    "Ding-Ding-Projects/worldlens",
                    "--title",
                    title,
                    "--body-file",
                    bodyPath,
                ]);
                if (!result.started) {
                    return { ok: false, status: "offline", message: "GitHub CLI could not be started; the report was not submitted." };
                }
                if (result.code !== 0) return failureFromProcess(result);
                const url = issueUrl(result.stdout);
                return url === null
                    ? { ok: false, status: "failed", message: "GitHub CLI returned no issue URL; the report was not submitted." }
                    : { ok: true, url };
            } catch (error) {
                if (error instanceof GhCredentialError) return failureFromGhError(error);
                if (error instanceof Error && error.message.includes("EACCES")) {
                    return { ok: false, status: "offline", message: "The report could not be staged safely; the report was not submitted." };
                }
                return { ok: false, status: "failed", message: "The report could not be submitted." };
            } finally {
                if (temporaryDirectory !== undefined) {
                    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
                }
            }
        },
    );
}
