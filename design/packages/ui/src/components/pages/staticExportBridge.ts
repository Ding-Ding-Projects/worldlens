export type StaticExportFormat = "folder" | "zip" | "7z";

export interface StaticExportCandidate {
    readonly renderId: string;
    readonly maps: readonly string[];
}

export interface StaticExportRequest {
    readonly renderId: string;
    readonly destination: string;
    readonly format: StaticExportFormat;
    readonly maps?: readonly string[];
    readonly basePath?: string;
    readonly noJekyll?: boolean;
    readonly compression?: boolean;
    readonly overwrite?: boolean;
    readonly overwriteToken?: string;
    readonly sevenZipOptions?: Readonly<{ readonly level?: number; readonly threads?: number; readonly solid?: boolean; readonly dictionaryKb?: number }>;
}

export interface StaticExportManifestFile {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
}

export interface StaticExportManifest {
    readonly version: 1;
    readonly renderId: string;
    readonly engine: string | null;
    readonly exportedAt: string;
    readonly format: StaticExportFormat;
    readonly basePath: string;
    readonly maps: readonly string[];
    readonly files: readonly StaticExportManifestFile[];
    readonly omissions: readonly string[];
}

export interface StaticExportReport {
    readonly exportId: string;
    readonly destination: string;
    readonly format: StaticExportFormat;
    readonly bytes: number;
    readonly fileCount: number;
    readonly manifest: StaticExportManifest;
}

export type StaticExportEvent =
    | { readonly type: "started"; readonly exportId: string; readonly renderId: string; readonly at: string }
    | { readonly type: "progress"; readonly exportId: string; readonly phase: "copying" | "validating" | "packing" | "finished"; readonly done: number; readonly total: number; readonly path: string | null; readonly at: string }
    | { readonly type: "cancelled"; readonly exportId: string; readonly at: string }
    | { readonly type: "failed"; readonly exportId: string; readonly message: string; readonly at: string }
    | { readonly type: "finished"; readonly exportId: string; readonly report: StaticExportReport; readonly at: string };

export type StaticExportAnswer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export interface StaticExportBridge {
    readonly listRenders: () => Promise<StaticExportAnswer<readonly StaticExportCandidate[]>>;
    readonly exportMap: (request: StaticExportRequest) => Promise<StaticExportReport | { readonly ok: false; readonly message: string }>;
    readonly cancel: (exportId: string) => Promise<boolean>;
    readonly active: () => Promise<readonly string[]>;
    readonly issueOverwriteToken: () => Promise<string>;
    readonly resume: (exportId: string) => Promise<StaticExportReport | { readonly ok: false; readonly message: string }>;
    readonly ledger: () => Promise<readonly string[]>;
    readonly onEvent: (listener: (event: StaticExportEvent) => void) => () => void;
}

type Host = Partial<{
    pagesRenders: () => Promise<StaticExportAnswer<readonly StaticExportCandidate[]>>;
    exportStaticMap: StaticExportBridge["exportMap"];
    cancelStaticMapExport: StaticExportBridge["cancel"];
    activeStaticMapExports: StaticExportBridge["active"];
    issueStaticMapOverwriteToken: StaticExportBridge["issueOverwriteToken"];
    resumeStaticMapExport: StaticExportBridge["resume"];
    staticMapExportLedger: StaticExportBridge["ledger"];
    onStaticMapExportEvent: StaticExportBridge["onEvent"];
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

export function resolveStaticExportBridge(): StaticExportBridge | null {
    const host = (globalThis as { worldlens?: Host }).worldlens;
    if (host === undefined || !isFunction(host.pagesRenders) || !isFunction(host.exportStaticMap) || !isFunction(host.cancelStaticMapExport) || !isFunction(host.activeStaticMapExports) || !isFunction(host.issueStaticMapOverwriteToken) || !isFunction(host.resumeStaticMapExport) || !isFunction(host.staticMapExportLedger) || !isFunction(host.onStaticMapExportEvent)) return null;
    return {
        listRenders: () => host.pagesRenders!(),
        exportMap: (request) => host.exportStaticMap!(request),
        cancel: (exportId) => host.cancelStaticMapExport!(exportId),
        active: () => host.activeStaticMapExports!(),
        issueOverwriteToken: () => host.issueStaticMapOverwriteToken!(),
        resume: (exportId) => host.resumeStaticMapExport!(exportId),
        ledger: () => host.staticMapExportLedger!(),
        onEvent: (listener) => host.onStaticMapExportEvent!(listener),
    };
}
