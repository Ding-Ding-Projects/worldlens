import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp as cpAsync, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { ZipWriter } from "@worldlens/worldgen";
import { prepareStaticHost } from "@worldlens/render-actions";
import { renderWorkspace } from "../render/workspace.js";

export type StaticExportFormat = "folder" | "zip" | "7z";

export interface StaticMapExportRequest {
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

export interface StaticMapExportManifest {
    readonly version: 1;
    readonly renderId: string;
    readonly engine: string | null;
    readonly exportedAt: string;
    readonly format: StaticExportFormat;
    readonly basePath: string;
    readonly maps: readonly string[];
    readonly files: readonly { readonly path: string; readonly bytes: number; readonly sha256: string }[];
    readonly omissions: readonly string[];
}

export interface StaticMapExportReport {
    readonly exportId: string;
    readonly destination: string;
    readonly format: StaticExportFormat;
    readonly bytes: number;
    readonly fileCount: number;
    readonly manifest: StaticMapExportManifest;
}

export type StaticMapExportEvent =
    | { readonly type: "started"; readonly exportId: string; readonly renderId: string; readonly at: string }
    | { readonly type: "progress"; readonly exportId: string; readonly phase: "copying" | "validating" | "packing" | "finished"; readonly done: number; readonly total: number; readonly path: string | null; readonly at: string }
    | { readonly type: "cancelled"; readonly exportId: string; readonly at: string }
    | { readonly type: "failed"; readonly exportId: string; readonly message: string; readonly at: string }
    | { readonly type: "finished"; readonly exportId: string; readonly report: StaticMapExportReport; readonly at: string };

export interface StaticMapExportOptions {
    readonly storageDir: () => string;
    readonly ledgerDir?: () => string;
    readonly onEvent?: (event: StaticMapExportEvent) => void;
}

const MAX_FILES = 500_000;
const MAX_FILE_BYTES = 2_000_000_000;
const MAX_TOTAL_BYTES = 20_000_000_000;

export class StaticMapExportCancelled extends Error {
    constructor() { super("The static map export was cancelled."); this.name = "StaticMapExportCancelled"; }
}

function safeRelativePath(value: string): string {
    const normal = value.replaceAll("\\", "/");
    if (!normal || normal.startsWith("/") || /^[A-Za-z]:/.test(normal) || normal.split("/").some((part) => part === "..")) {
        throw new Error(`Unsafe export path: ${value}`);
    }
    return normal.split("/").filter(Boolean).join("/");
}

function safeMapId(value: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || value === "." || value === "..") {
        throw new Error(`Unsafe map id: ${value}`);
    }
    return value;
}

function safeSevenZipOptions(options: StaticMapExportRequest["sevenZipOptions"]): string[] {
    if (options === undefined) return [];
    const level = options.level ?? 5; const threads = options.threads ?? 2;
    if (!Number.isInteger(level) || level < 0 || level > 9 || !Number.isInteger(threads) || threads < 1 || threads > 32) throw new Error("Invalid 7z compression options.");
    const result = [`-mx=${String(level)}`, `-mmt=${String(threads)}`, `-ms=${options.solid === false ? "off" : "on"}`];
    if (options.dictionaryKb !== undefined) {
        if (!Number.isInteger(options.dictionaryKb) || options.dictionaryKb < 64 || options.dictionaryKb > 1_048_576) throw new Error("Invalid 7z dictionary size.");
        result.push(`-md=${String(options.dictionaryKb)}k`);
    }
    return result;
}

async function filesUnder(root: string, current = "", state = { bytes: 0, files: 0 }): Promise<string[]> {
    if (current.split("/").filter(Boolean).length > 64) throw new Error(`Export path is too deep: ${current}`);
    const rows = await readdir(join(root, current), { withFileTypes: true });
    const files: string[] = [];
    for (const row of rows) {
        const rel = current ? `${current}/${row.name}` : row.name;
        if (row.isDirectory()) {
            const info = await lstat(join(root, rel));
            if (info.isSymbolicLink()) throw new Error(`Symlinks are not allowed in a static export: ${rel}`);
            files.push(...await filesUnder(root, rel, state));
        }
        else if (row.isFile()) {
            const info = await lstat(join(root, rel));
            if (info.size > MAX_FILE_BYTES) throw new Error(`Export file exceeds the per-file limit: ${rel}`);
            state.files += 1; state.bytes += info.size;
            if (state.files > MAX_FILES || state.bytes > MAX_TOTAL_BYTES) throw new Error("The export exceeds its file or size limit.");
            files.push(rel.replaceAll("\\", "/"));
        }
        else throw new Error(`The rendered map contains a non-regular entry: ${rel}`);
    }
    return files.sort((a, b) => a.localeCompare(b));
}

async function sha256(path: string): Promise<{ bytes: number; digest: string }> {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Export source is not a regular file: ${path}`);
    if (info.size > MAX_FILE_BYTES) throw new Error(`Export file exceeds the per-file limit: ${path}`);
    return await new Promise((resolvePromise, reject) => {
        const hash = createHash("sha256"); let bytes = 0;
        const stream = createReadStream(path);
        stream.on("data", (chunk: Buffer) => { bytes += chunk.length; hash.update(chunk); });
        stream.once("error", reject);
        stream.once("end", () => resolvePromise({ bytes, digest: hash.digest("hex") }));
    });
}

async function ensureDestination(destination: string, overwrite: boolean): Promise<void> {
    try {
        await stat(destination);
        if (!overwrite) throw new Error(`The export destination already exists: ${destination}`);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("The export destination")) throw error;
    }
}

async function atomicReplace(source: string, destination: string, overwrite: boolean, tokens: Set<string>, token: string | undefined): Promise<void> {
    await ensureDestination(destination, overwrite);
    let backup: string | null = null;
    try {
        if (overwrite) {
            if (token === undefined || !tokens.delete(token)) throw new Error("A fresh overwrite confirmation is required.");
            backup = `${destination}.previous-${randomUUID()}`;
            await rename(destination, backup);
        }
        await rename(source, destination);
        if (backup !== null) await rm(backup, { recursive: true, force: true });
    } catch (error) {
        if (backup !== null) { try { await rename(backup, destination); } catch { /* keep original error */ } }
        throw error;
    }
}

async function runSevenZip(executable: string, archive: string, source: string, options: readonly string[], signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolvePromise, reject) => {
        const child = spawn(executable, ["a", ...options, archive, join(source, "*")], { shell: false, windowsHide: true });
        const onAbort = (): void => {
            child.kill();
            child.once("close", () => reject(new StaticMapExportCancelled()));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        child.once("error", (error) => { signal.removeEventListener("abort", onAbort); reject(error); });
        child.once("exit", (code) => { signal.removeEventListener("abort", onAbort); code === 0 ? resolvePromise() : reject(new Error(`7z exited with code ${String(code)}`)); });
    });
}

export class StaticMapExporter {
    private readonly active = new Set<string>();
    private readonly overwriteTokens = new Set<string>();
    constructor(private readonly options: StaticMapExportOptions) {}

    cancel(exportId: string): boolean { return this.active.delete(exportId); }
    activeExportIds(): readonly string[] { return [...this.active]; }
    issueOverwriteToken(): string { const token = randomUUID(); this.overwriteTokens.add(token); return token; }
    async resume(exportId: string): Promise<StaticMapExportReport> {
        if (this.options.ledgerDir === undefined) throw new Error("Export resume storage is unavailable.");
        const path = join(this.options.ledgerDir(), `${exportId}.json`);
        const row = JSON.parse(await readFile(path, "utf8")) as { version?: unknown; request?: unknown; stage?: unknown };
        if (row.version !== 1 || typeof row.request !== "object" || row.request === null || typeof row.stage !== "string") throw new Error("The export resume ledger is invalid.");
        const stage = resolve(row.stage);
        const expected = resolve(dirname((row.request as StaticMapExportRequest).destination));
        if (!stage.startsWith(`${expected}${sep}.worldlens-static-export-${exportId}`)) throw new Error("The export resume stage is outside its destination scope.");
        const info = await lstat(stage);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("The export resume stage is not a regular directory.");
        return await this.runExport(row.request as StaticMapExportRequest, exportId, stage);
    }

    async export(request: StaticMapExportRequest): Promise<StaticMapExportReport> {
        return await this.runExport(request, randomUUID());
    }

    private async runExport(request: StaticMapExportRequest, exportId: string, resumedStage?: string): Promise<StaticMapExportReport> {
        if (!request.renderId || !request.destination) throw new Error("A render id and destination are required.");
        if (!["folder", "zip", "7z"].includes(request.format)) throw new Error("Unsupported static export format.");
        if (request.compression === false) throw new Error("Compression-off static export is not supported until uncompressed viewer paths are validated.");
        this.active.add(exportId);
        const started = new Date().toISOString();
        this.options.onEvent?.({ type: "started", exportId, renderId: request.renderId, at: started });
        const check = (): void => { if (!this.active.has(exportId)) throw new StaticMapExportCancelled(); };
        const stage = resumedStage ?? `${resolve(dirname(request.destination))}/.worldlens-static-export-${exportId}`;
        let archiveStage: string | null = null;
        const ledger = this.options.ledgerDir === undefined ? null : join(this.options.ledgerDir(), `${exportId}.json`);
        try {
            if (ledger !== null) { await mkdir(dirname(ledger), { recursive: true }); await writeFile(ledger, JSON.stringify({ version: 1, exportId, request, stage, createdAt: started }) + "\n", "utf8"); }
            const workspace = renderWorkspace(this.options.storageDir(), request.renderId);
            const source = resolve(workspace.webRoot);
            await stat(join(source, "settings.json"));
            await mkdir(stage, { recursive: true });
            const all = await filesUnder(source);
            const selected = request.maps?.map(safeMapId) ?? null;
            if (request.maps !== undefined && request.maps.length > 10_000) throw new Error("Too many maps selected.");
            const copyFiles = all.filter((path) => selected === null || !path.startsWith("maps/") || selected.includes(path.split("/")[1] ?? ""));
            const sourceSnapshot = new Map<string, { ino: bigint | undefined; size: number; mtimeMs: number }>();
            for (const path of copyFiles) { const info = await lstat(join(source, path)); sourceSnapshot.set(path, { ino: typeof info.ino === "bigint" ? info.ino : undefined, size: info.size, mtimeMs: info.mtimeMs }); }
            for (let i = 0; i < copyFiles.length; i += 1) {
                check();
                const rel = safeRelativePath(copyFiles[i]!);
                const sourceInfo = await lstat(join(source, rel));
                if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error(`Export source changed to a non-regular file: ${rel}`);
                if (resumedStage !== undefined) {
                    try {
                        const stagedInfo = await lstat(join(stage, rel));
                        if (stagedInfo.isFile() && !stagedInfo.isSymbolicLink() && stagedInfo.size === sourceInfo.size && (await sha256(join(stage, rel))).digest === (await sha256(join(source, rel))).digest) {
                            this.options.onEvent?.({ type: "progress", exportId, phase: "copying", done: i + 1, total: copyFiles.length, path: rel, at: new Date().toISOString() });
                            continue;
                        }
                    } catch { /* missing or invalid staged file: copy it afresh */ }
                }
                await mkdir(dirname(join(stage, rel)), { recursive: true });
                await cpAsync(join(source, rel), join(stage, rel));
                const stagedInfo = await lstat(join(stage, rel));
                if (!stagedInfo.isFile() || stagedInfo.isSymbolicLink()) throw new Error(`Staged export file is not regular: ${rel}`);
                this.options.onEvent?.({ type: "progress", exportId, phase: "copying", done: i + 1, total: copyFiles.length, path: rel, at: new Date().toISOString() });
            }
            for (const path of copyFiles) { const before = sourceSnapshot.get(path)!; const after = await lstat(join(source, path)); if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || (before.ino !== undefined && after.ino !== before.ino)) throw new Error(`The rendered source changed during export: ${path}`); }
            check();
            const settingsPath = join(stage, "settings.json");
            const settings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
            if (Array.isArray(settings.maps)) {
                for (const entry of settings.maps) {
                    const id = typeof entry === "string" ? entry : typeof entry === "object" && entry !== null ? (entry as { id?: unknown }).id : null;
                    if (typeof id !== "string") throw new Error("Every rendered map entry must have a string id.");
                    safeMapId(id);
                }
            }
            const omissions: string[] = [];
            if (request.basePath !== undefined) settings.basePath = request.basePath.replaceAll("\\", "/");
            if (request.compression !== false) settings.clientDecompression = true;
            if (selected !== null) settings.maps = (Array.isArray(settings.maps) ? settings.maps : []).filter((entry) => selected.includes(typeof entry === "string" ? entry : String((entry as { id?: unknown }).id ?? "")));
            await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
            if (request.noJekyll !== false) await writeFile(join(stage, ".nojekyll"), "", "utf8");
            const prepared = await prepareStaticHost({ webRoot: stage, write: false });
            if (!prepared.servable) throw new Error(`The staged map is not servable: ${prepared.notes.join(" ")}`);
            const files = await filesUnder(stage);
            if (files.length > MAX_FILES) throw new Error("The export contains too many files.");
            const records = [] as { path: string; bytes: number; sha256: string }[];
            let totalBytes = 0;
            for (let i = 0; i < files.length; i += 1) {
                check();
                const rel = safeRelativePath(files[i]!);
                const digest = await sha256(join(stage, rel));
                totalBytes += digest.bytes;
                if (totalBytes > MAX_TOTAL_BYTES) throw new Error("The export exceeds the total size limit.");
                records.push({ path: rel, ...digest });
                this.options.onEvent?.({ type: "progress", exportId, phase: "validating", done: i + 1, total: files.length, path: rel, at: new Date().toISOString() });
            }
            let engine: string | null = null;
            try {
                const value = JSON.parse(await readFile(workspace.recordFile, "utf8")) as { engine?: unknown };
                engine = typeof value.engine === "string" ? value.engine : null;
            } catch { /* provenance is explicit in the manifest when the legacy record is absent */ }
            const manifest: StaticMapExportManifest = { version: 1, renderId: request.renderId, engine, exportedAt: new Date().toISOString(), format: request.format, basePath: request.basePath ?? "", maps: selected ?? prepared.maps.map((map) => map.id), files: records, omissions: [...omissions, "Private application history, credentials and local-only settings are omitted."] };
            await writeFile(join(stage, "worldlens-export-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
            check();
            let destination = resolve(request.destination);
            if (request.format === "folder") {
                await atomicReplace(stage, destination, request.overwrite === true, this.overwriteTokens, request.overwriteToken);
            } else {
                archiveStage = `${destination}.partial-${exportId}`;
                await rm(archiveStage, { force: true });
                if (request.format === "zip") {
                    const zip = await ZipWriter.create(archiveStage);
                    for (let i = 0; i < files.length + 1; i += 1) {
                        check(); const rel = i === files.length ? "worldlens-export-manifest.json" : files[i]!;
                        await zip.addFile(rel, join(stage, rel));
                        this.options.onEvent?.({ type: "progress", exportId, phase: "packing", done: i + 1, total: files.length + 1, path: rel, at: new Date().toISOString() });
                    }
                    await zip.close();
                } else {
                    const controller = new AbortController();
                    const stop = (): void => controller.abort();
                    const timer = setInterval(() => { if (!this.active.has(exportId)) stop(); }, 100);
                    try { await runSevenZip("7z", archiveStage, stage, safeSevenZipOptions(request.sevenZipOptions), controller.signal); }
                    finally { clearInterval(timer); }
                }
                await atomicReplace(archiveStage, destination, request.overwrite === true, this.overwriteTokens, request.overwriteToken);
                archiveStage = null;
                await rm(stage, { recursive: true, force: true });
            }
            const bytes = request.format === "folder" ? recordsTotal(manifest) : (await stat(destination)).size;
            const report = { exportId, destination, format: request.format, bytes, fileCount: manifest.files.length, manifest };
            this.options.onEvent?.({ type: "progress", exportId, phase: "finished", done: 1, total: 1, path: null, at: new Date().toISOString() });
            this.options.onEvent?.({ type: "finished", exportId, report, at: new Date().toISOString() });
            if (ledger !== null) await rm(ledger, { force: true });
            return report;
        } catch (error) {
            if (!(error instanceof StaticMapExportCancelled)) await rm(stage, { recursive: true, force: true });
            if (archiveStage !== null) await rm(archiveStage, { force: true });
            const message = error instanceof Error ? error.message : String(error);
            if (error instanceof StaticMapExportCancelled) this.options.onEvent?.({ type: "cancelled", exportId, at: new Date().toISOString() });
            else this.options.onEvent?.({ type: "failed", exportId, message, at: new Date().toISOString() });
            throw error;
        } finally { this.active.delete(exportId); }
    }
}

function recordsTotal(manifest: StaticMapExportManifest): number {
    return manifest.files.reduce((total, file) => total + file.bytes, 0);
}
