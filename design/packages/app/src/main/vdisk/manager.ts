import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import {
    GIB,
    MIB,
    attachScript,
    compactScript,
    createScript,
    detachScript,
    formatFromPath,
    growScript,
    growTarget,
    isDroppableDisk,
    mergeScript,
    nextFreeName,
    powerShellEquivalent,
    quickPackSize,
    routesFor,
    validateCreate,
    devDriveScript,
    nativeBootScript,
    type CreateRequest,
    type RouteAvailability,
    type VirtualDiskOperation,
    type VirtualDiskRoute,
} from "@worldlens/shared/virtualDisk";
import type { DiskScriptRunner, ScriptOutcome } from "./runner.js";
import { parseVirtdiskOutput, virtdiskScript, type VirtDiskCall } from "./virtdiskInterop.js";

export interface VirtualDiskStatus {
    readonly available: boolean;
    /** Why the manager cannot run here, in words a person can act on. */
    readonly reason: string | null;
    readonly routes: RouteAvailability;
}

export interface VirtualDiskEntry {
    readonly path: string;
    readonly format: string | null;
    readonly fileBytes: number | null;
    readonly virtualBytes: number | null;
    readonly attached: boolean;
    readonly diskNumber: number | null;
    readonly readOnly: boolean;
    readonly letters: readonly string[];
    readonly inLibrary: boolean;
    readonly missing: boolean;
}

export interface OperationRequest {
    readonly operation: VirtualDiskOperation;
    readonly path: string;
    readonly route?: VirtualDiskRoute;
    readonly readOnly?: boolean;
    readonly sizeBytes?: number;
    readonly extendVolume?: string | null;
    readonly depth?: number;
    readonly create?: CreateRequest;
    readonly destination?: string;
    readonly mode?: "Full" | "Quick" | "Retrim" | "Pretrimmed" | "Prezeroed";
    /** Shrink as far as possible without cutting a partition. */
    readonly smallestSafe?: boolean;
    /** Convert: the target format and type. Create (VirtDisk): fixed or dynamic. */
    readonly targetType?: "fixed" | "dynamic";
    readonly parentPath?: string;
    readonly sectorSize?: 512 | 4096;
    readonly metadata?: { readonly action: "list" | "set" | "delete"; readonly key?: string; readonly valueBase64?: string };
    readonly changeTracking?: { readonly action: "enable" | "disable" | "query"; readonly changeTrackingId?: string };
    readonly checkpoint?: { readonly action: "take" | "apply" | "delete"; readonly checkpointId?: string };
    readonly devDriveLabel?: string;
    readonly nativeBoot?: { readonly imageFile: string; readonly imageIndex: number };
}

export interface OperationResult {
    readonly ok: boolean;
    readonly cancelled: boolean;
    /** The route that actually did the work, named in the result as the contract requires. */
    readonly route: VirtualDiskRoute | null;
    readonly message: string;
    readonly script: string;
    /** What the VirtDisk API or a PowerShell step reported, such as sizes, ids or ranges. */
    readonly details?: Readonly<Record<string, unknown>>;
}

export interface HistoryEntry {
    readonly at: string;
    readonly operation: VirtualDiskOperation | "quickpack";
    readonly path: string;
    readonly route: VirtualDiskRoute | null;
    readonly ok: boolean;
    readonly message: string;
}

export interface PackProgress {
    readonly phase: "size" | "create" | "copy" | "verify" | "detach" | "done";
    readonly filesDone: number;
    readonly filesTotal: number;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly current: string | null;
    readonly growths: readonly { readonly from: number; readonly to: number; readonly atFile: number }[];
}

export interface PackResult {
    readonly ok: boolean;
    readonly partial: boolean;
    readonly cancelled: boolean;
    readonly path: string | null;
    readonly virtualBytes: number;
    readonly files: number;
    readonly verified: number;
    readonly skipped: readonly { readonly path: string; readonly reason: string }[];
    readonly growths: PackProgress["growths"];
    readonly message: string;
}

const NO_ROUTES: RouteAvailability = { virtdisk: false, storage: false, diskpart: false, hyperv: false };

/**
 * The virtual disk manager behind the IPC layer. All disk-changing work goes through the injected
 * runner, which on Windows asks for permission through the standard prompt; everything else here
 * is local bookkeeping (the library, the history) and file copying with SHA-256 verification.
 */
export class VirtualDiskManager {
    private routes: RouteAvailability | null = null;

    constructor(
        private readonly root: string,
        private readonly runner: DiskScriptRunner | null,
        private readonly platform: NodeJS.Platform = process.platform,
        /** Test seam only: lets a test make a copy run out of space to prove automatic growth. */
        private readonly hooks: { readonly beforeCopy?: (relativePath: string, attempt: number) => void } = {},
    ) {}

    async status(): Promise<VirtualDiskStatus> {
        if (this.platform !== "win32" || this.runner === null) {
            return { available: false, reason: "Virtual disks are a Windows feature. Run Worldlens on Windows to create, attach and pack VHD and VHDX files.", routes: NO_ROUTES };
        }
        if (this.routes === null) {
            try {
                const json = await this.runner.query(
                    "$r = [ordered]@{ virtdisk = (Test-Path \"$env:SystemRoot\\System32\\virtdisk.dll\"); storage = [bool](Get-Command Mount-DiskImage -ErrorAction SilentlyContinue); diskpart = (Test-Path \"$env:SystemRoot\\System32\\diskpart.exe\"); hyperv = [bool](Get-Command Resize-VHD -ErrorAction SilentlyContinue) }; $r | ConvertTo-Json -Compress",
                );
                const parsed = JSON.parse(json) as Partial<RouteAvailability>;
                this.routes = { virtdisk: parsed.virtdisk === true, storage: parsed.storage === true, diskpart: parsed.diskpart === true, hyperv: parsed.hyperv === true };
            } catch (error) {
                return { available: false, reason: `Could not check the disk tools on this PC: ${String(error)}`, routes: NO_ROUTES };
            }
        }
        return { available: true, reason: null, routes: this.routes };
    }

    private libraryFile(): string {
        return path.join(this.root, "library.json");
    }

    private historyFile(): string {
        return path.join(this.root, "history.json");
    }

    async library(): Promise<string[]> {
        try {
            const parsed = JSON.parse(await fs.readFile(this.libraryFile(), "utf8")) as { version: 1; paths: unknown };
            return Array.isArray(parsed.paths) ? parsed.paths.filter((p): p is string => typeof p === "string") : [];
        } catch {
            return [];
        }
    }

    async addToLibrary(paths: readonly string[]): Promise<{ readonly added: readonly string[]; readonly refused: readonly { path: string; reason: string }[] }> {
        const current = await this.library();
        const added: string[] = [];
        const refused: { path: string; reason: string }[] = [];
        for (const p of paths) {
            if (!isDroppableDisk(p)) refused.push({ path: p, reason: "Not a .vhd, .vhdx, .vhds, .avhd, .avhdx or .iso file." });
            else if (!current.some((c) => c.toLowerCase() === p.toLowerCase())) {
                current.push(p);
                added.push(p);
            }
        }
        await this.writeJson(this.libraryFile(), { version: 1, paths: current });
        return { added, refused };
    }

    async removeFromLibrary(target: string): Promise<void> {
        const current = (await this.library()).filter((p) => p.toLowerCase() !== target.toLowerCase());
        await this.writeJson(this.libraryFile(), { version: 1, paths: current });
    }

    async history(): Promise<HistoryEntry[]> {
        try {
            const parsed = JSON.parse(await fs.readFile(this.historyFile(), "utf8")) as { entries?: HistoryEntry[] };
            return Array.isArray(parsed.entries) ? parsed.entries : [];
        } catch {
            return [];
        }
    }

    private async record(entry: Omit<HistoryEntry, "at">): Promise<void> {
        const entries = await this.history();
        entries.unshift({ at: new Date().toISOString(), ...entry });
        await this.writeJson(this.historyFile(), { version: 1, entries: entries.slice(0, 500) });
    }

    private async writeJson(file: string, value: unknown): Promise<void> {
        await fs.mkdir(path.dirname(file), { recursive: true });
        const temp = `${file}.${randomUUID()}.tmp`;
        await fs.writeFile(temp, JSON.stringify(value, null, 2), "utf8");
        await fs.rename(temp, file);
    }

    /** Library files plus every disk attached on the host, with their attach state. */
    async list(): Promise<VirtualDiskEntry[]> {
        const library = await this.library();
        const attached = new Map<string, { number: number | null; readOnly: boolean; letters: string[]; size: number | null }>();
        const status = await this.status();
        if (status.available && this.runner) {
            try {
                const json = await this.runner.query(
                    "@(Get-Disk | Where-Object { $_.BusType -eq 'File Backed Virtual' } | ForEach-Object { $letters = @(Get-Partition -DiskNumber $_.Number -ErrorAction SilentlyContinue | Where-Object DriveLetter | ForEach-Object { [string]$_.DriveLetter }); [ordered]@{ path = $_.Location; number = $_.Number; readOnly = $_.IsReadOnly; size = $_.Size; letters = $letters } }) | ConvertTo-Json -Compress -Depth 3",
                );
                const parsed = json.trim() === "" ? [] : (JSON.parse(json) as unknown);
                for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
                    const r = row as { path?: string; number?: number; readOnly?: boolean; size?: number; letters?: string[] };
                    if (typeof r.path === "string") attached.set(r.path.toLowerCase(), { number: r.number ?? null, readOnly: r.readOnly === true, letters: r.letters ?? [], size: r.size ?? null });
                }
            } catch {
                // The library still lists; attach state reads as unknown rather than wrong.
            }
        }
        const paths = new Map<string, boolean>();
        for (const p of library) paths.set(p, true);
        for (const p of attached.keys()) if (![...paths.keys()].some((k) => k.toLowerCase() === p)) paths.set(p, false);
        const out: VirtualDiskEntry[] = [];
        for (const [p, inLibrary] of paths) {
            const stat = await fs.stat(p).catch(() => null);
            const a = attached.get(p.toLowerCase());
            out.push({ path: p, format: formatFromPath(p), fileBytes: stat?.size ?? null, virtualBytes: a?.size ?? null, attached: a !== undefined, diskNumber: a?.number ?? null, readOnly: a?.readOnly ?? false, letters: a?.letters ?? [], inLibrary, missing: stat === null });
        }
        return out.sort((x, y) => x.path.localeCompare(y.path));
    }

    /** The exact script an operation would run on a route, for the copy button. Never runs anything. */
    script(request: OperationRequest, route: VirtualDiskRoute = "diskpart"): string {
        try {
            return this.build(request, route).script;
        } catch (error) {
            return `# ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    private virtdiskCall(request: OperationRequest): VirtDiskCall {
        const p = request.path;
        switch (request.operation) {
            case "describe":
                return { op: "describe", path: p };
            case "grow":
                return { op: "resize", path: p, newSizeBytes: request.sizeBytes ?? 0, smallestSafe: false };
            case "shrink":
                return { op: "resize", path: p, newSizeBytes: request.smallestSafe ? 0 : request.sizeBytes ?? 0, smallestSafe: request.smallestSafe === true };
            case "compact": {
                const mode = request.mode ?? "Full";
                if (mode !== "Full" && mode !== "Quick") throw new Error(`The VirtDisk route compacts in Full or Quick mode; ${mode} needs the Hyper-V module.`);
                return { op: "compact", path: p, quick: mode === "Quick" };
            }
            case "merge":
                return { op: "merge", path: p, depth: request.depth ?? 1 };
            case "convert":
                if (!request.destination) throw new Error("Choose where the converted copy goes.");
                if (existsSync(request.destination)) throw new Error("A file with that name already exists. Nothing is ever overwritten; choose another name.");
                return { op: "create", path: request.destination, maximumSizeBytes: 0, fixed: request.targetType === "fixed", sourcePath: p };
            case "create": {
                const c = request.create;
                if (!c) throw new Error("Create needs the disk details.");
                return {
                    op: "create",
                    path: c.path,
                    maximumSizeBytes: c.type === "differencing" ? 0 : c.sizeBytes,
                    fixed: c.type === "fixed",
                    ...(c.blockSizeBytes ? { blockSizeBytes: c.blockSizeBytes } : {}),
                    ...(c.logicalSectorBytes ? { logicalSectorBytes: c.logicalSectorBytes } : {}),
                    ...(c.physicalSectorBytes ? { physicalSectorBytes: c.physicalSectorBytes } : {}),
                    ...(c.parentPath ? { parentPath: c.parentPath } : {}),
                };
            }
            case "identity":
                if (request.sectorSize) return { op: "setPhysicalSectorSize", path: p, bytes: request.sectorSize };
                return { op: "newIdentifier", path: p };
            case "reparent":
                if (!request.parentPath) throw new Error("Choose the parent disk.");
                return { op: "setParent", path: p, parentPath: request.parentPath };
            case "metadata": {
                const m = request.metadata ?? { action: "list" as const };
                if (m.action === "set") return { op: "setMetadata", path: p, key: m.key ?? "", valueBase64: m.valueBase64 ?? "" };
                if (m.action === "delete") return { op: "deleteMetadata", path: p, key: m.key ?? "" };
                return { op: "listMetadata", path: p };
            }
            case "changeTracking": {
                const c = request.changeTracking ?? { action: "query" as const };
                if (c.action === "query") return { op: "queryChanges", path: p, changeTrackingId: c.changeTrackingId ?? "" };
                return { op: "setChangeTracking", path: p, enabled: c.action === "enable" };
            }
            case "checkpoint": {
                const c = request.checkpoint ?? { action: "take" as const };
                if (c.action === "take") return { op: "takeCheckpoint", path: p };
                if (c.action === "apply") return { op: "applyCheckpoint", path: p, checkpointId: c.checkpointId ?? "" };
                return { op: "deleteCheckpoint", path: p, checkpointId: c.checkpointId ?? "" };
            }
            case "mirror":
                if (!request.destination) throw new Error("Choose where the mirror copy goes.");
                if (existsSync(request.destination)) throw new Error("A file with that name already exists. Nothing is ever overwritten; choose another name.");
                return { op: "mirror", path: p, destination: request.destination };
            default:
                throw new Error(`${request.operation} has no VirtDisk route.`);
        }
    }

    private build(request: OperationRequest, route: VirtualDiskRoute): { script: string; kind: "diskpart" | "powershell"; json: boolean } {
        const p = request.path;
        const ps = (value: string): string => `'${value.replace(/'/gu, "''")}'`;
        if (route === "virtdisk") return { script: virtdiskScript(this.virtdiskCall(request)), kind: "powershell", json: true };
        switch (request.operation) {
            case "create": {
                if (!request.create) throw new Error("Create needs the disk details.");
                return { script: createScript(request.create), kind: "diskpart", json: false };
            }
            case "attach":
                if (route === "storage") return { script: powerShellEquivalent("attach", p, { readOnly: request.readOnly === true }), kind: "powershell", json: false };
                return { script: attachScript(p, request.readOnly === true), kind: "diskpart", json: false };
            case "detach":
                if (route === "storage") return { script: powerShellEquivalent("detach", p), kind: "powershell", json: false };
                return { script: detachScript(p), kind: "diskpart", json: false };
            case "grow":
                if (route === "hyperv") return { script: `Resize-VHD -Path ${ps(p)} -SizeBytes ${request.sizeBytes ?? 0}`, kind: "powershell", json: false };
                return { script: growScript(p, request.sizeBytes ?? 0, request.extendVolume ?? null), kind: "diskpart", json: false };
            case "shrink":
                return { script: request.smallestSafe ? `Resize-VHD -Path ${ps(p)} -ToMinimumSize` : `Resize-VHD -Path ${ps(p)} -SizeBytes ${request.sizeBytes ?? 0}`, kind: "powershell", json: false };
            case "compact":
                if (route === "hyperv") return { script: `Optimize-VHD -Path ${ps(p)} -Mode ${request.mode ?? "Full"}`, kind: "powershell", json: false };
                return { script: compactScript(p), kind: "diskpart", json: false };
            case "convert":
                return { script: `Convert-VHD -Path ${ps(p)} -DestinationPath ${ps(request.destination ?? "")}${request.targetType ? ` -VHDType ${request.targetType === "fixed" ? "Fixed" : "Dynamic"}` : ""}`, kind: "powershell", json: false };
            case "merge":
                if (route === "hyperv") return { script: `Merge-VHD -Path ${ps(p)}`, kind: "powershell", json: false };
                return { script: mergeScript(p, request.depth ?? 1), kind: "diskpart", json: false };
            case "identity":
                return { script: `Set-VHD -Path ${ps(p)} -ResetDiskIdentifier -Force`, kind: "powershell", json: false };
            case "reparent":
                return { script: `Set-VHD -Path ${ps(p)} -ParentPath ${ps(request.parentPath ?? "")}`, kind: "powershell", json: false };
            case "devdrive":
                return { script: devDriveScript(p, request.devDriveLabel ?? "DevDrive"), kind: "powershell", json: true };
            case "nativeboot": {
                if (!request.nativeBoot) throw new Error("Choose the Windows image to apply.");
                return {
                    script: nativeBootScript({ path: p, imageFile: request.nativeBoot.imageFile, imageIndex: request.nativeBoot.imageIndex, bcdBackupPath: path.join(this.root, `bcd-backup-${Date.now()}.bcd`) }),
                    kind: "powershell",
                    json: true,
                };
            }
            default:
                throw new Error(`${request.operation} has no ${route} route.`);
        }
    }

    /** Read-only details from the VirtDisk API, without the permission prompt when Windows allows it. */
    async describe(diskPath: string): Promise<OperationResult> {
        const status = await this.status();
        if (!status.available || !this.runner) return { ok: false, cancelled: false, route: null, message: status.reason ?? "Unavailable.", script: "" };
        if (!status.routes.virtdisk) return { ok: false, cancelled: false, route: null, message: "The VirtDisk API was not found on this PC.", script: "" };
        const script = virtdiskScript({ op: "describe", path: diskPath });
        let parsed = parseVirtdiskOutput(await this.runner.query(script).catch((error: unknown) => String(error)));
        // Opening some disks needs administrator rights; ask only when Windows says so.
        if (!parsed.ok && parsed["code"] === 5) {
            const outcome = await this.runner.elevatedPowerShell(script);
            if (outcome.cancelled) return { ok: false, cancelled: true, route: "virtdisk", message: "Cancelled at the Windows permission prompt.", script };
            parsed = parseVirtdiskOutput(outcome.output);
        }
        const { ok, message, ...details } = parsed as { ok: boolean; message?: string };
        return { ok, cancelled: false, route: "virtdisk", message: ok ? "Read." : String(message ?? "Could not read the disk."), script, details };
    }

    /**
     * Runs one operation through the first usable route (or the one asked for). A declined
     * permission prompt is reported as cancelled and incomplete; a route that this PC does not
     * have is refused with the reason before anything runs. VirtDisk and PowerShell steps report
     * JSON, and their own verdict decides success, not just the exit code.
     */
    async run(request: OperationRequest): Promise<OperationResult> {
        if (request.operation === "describe") return await this.describe(request.path);
        const status = await this.status();
        if (!status.available || !this.runner) return { ok: false, cancelled: false, route: null, message: status.reason ?? "Unavailable.", script: "" };
        if (request.operation === "create" && request.create) {
            const problems = validateCreate(request.create);
            if (problems.length > 0) return { ok: false, cancelled: false, route: null, message: problems.map((x) => x.message).join(" "), script: "" };
            if (existsSync(request.create.path)) return { ok: false, cancelled: false, route: null, message: "A file with that name already exists. Nothing is ever overwritten; choose another name.", script: "" };
        }
        const choices = routesFor(request.operation, status.routes).filter((c) => c.usable);
        const chosen = request.route ? choices.find((c) => c.route === request.route) : choices[0];
        if (!chosen) {
            const need = routesFor(request.operation, status.routes).map((c) => c.reason).join(" ");
            return { ok: false, cancelled: false, route: null, message: `No route on this PC can do this yet. ${need}`, script: "" };
        }
        let built: { script: string; kind: "diskpart" | "powershell"; json: boolean };
        try {
            built = this.build(request, chosen.route);
        } catch (error) {
            return { ok: false, cancelled: false, route: null, message: error instanceof Error ? error.message : String(error), script: "" };
        }
        const outcome: ScriptOutcome = built.kind === "diskpart" ? await this.runner.diskpart(built.script) : await this.runner.elevatedPowerShell(built.script);
        let ok = outcome.ok;
        let message = outcome.cancelled ? "Cancelled at the Windows permission prompt. Nothing was changed." : outcome.ok ? "Done." : `Did not complete: ${outcome.output.trim().slice(-600)}`;
        let details: Record<string, unknown> | undefined;
        if (built.json && !outcome.cancelled) {
            const parsed = parseVirtdiskOutput(outcome.output) as { ok: boolean; message?: string; [key: string]: unknown };
            const { ok: parsedOk, message: parsedMessage, ...rest } = parsed;
            ok = parsedOk;
            details = rest;
            message = ok ? "Done." : `Did not complete: ${String(parsedMessage ?? "no result")}`;
        }
        await this.record({ operation: request.operation, path: request.path, route: chosen.route, ok, message });
        const created = request.operation === "create" ? request.create?.path : request.operation === "convert" || request.operation === "mirror" ? request.destination : undefined;
        if (ok && created) await this.addToLibrary([created]);
        return { ok, cancelled: outcome.cancelled, route: chosen.route, message, script: built.script, ...(details ? { details } : {}) };
    }

    /**
     * Quick pack: copies the dropped items into one new VHDX beside them, verifies every file by
     * SHA-256, grows the disk automatically when it runs short, then detaches. Sources are only
     * ever read. A cancel detaches and removes only the VHDX this run created.
     */
    async quickPack(sources: readonly string[], onProgress: (p: PackProgress) => void, signal?: AbortSignal): Promise<PackResult> {
        const empty = (message: string, cancelled = false): PackResult => ({ ok: false, partial: false, cancelled, path: null, virtualBytes: 0, files: 0, verified: 0, skipped: [], growths: [], message });
        const status = await this.status();
        if (!status.available || !this.runner) return empty(status.reason ?? "Unavailable.");
        if (sources.length === 0) return empty("Drop at least one file or folder.");
        const runner = this.runner;

        // Size
        const files: { abs: string; rel: string; bytes: number; mtime: Date; atime: Date }[] = [];
        const dirs: string[] = [];
        const entries: { bytes: number; isDirectory?: boolean }[] = [];
        for (const source of sources) {
            const base = path.basename(source);
            const stat = await fs.stat(source);
            if (stat.isDirectory()) {
                const stack: [string, string][] = [[source, base]];
                while (stack.length) {
                    const [abs, rel] = stack.pop()!;
                    dirs.push(rel);
                    entries.push({ bytes: 0, isDirectory: true });
                    for (const child of await fs.readdir(abs, { withFileTypes: true })) {
                        const childAbs = path.join(abs, child.name);
                        const childRel = path.join(rel, child.name);
                        if (child.isDirectory()) stack.push([childAbs, childRel]);
                        else if (child.isFile()) {
                            const s = await fs.stat(childAbs);
                            files.push({ abs: childAbs, rel: childRel, bytes: s.size, mtime: s.mtime, atime: s.atime });
                            entries.push({ bytes: s.size });
                        }
                    }
                }
            } else {
                files.push({ abs: source, rel: base, bytes: stat.size, mtime: stat.mtime, atime: stat.atime });
                entries.push({ bytes: stat.size });
            }
        }
        const bytesTotal = files.reduce((n, f) => n + f.bytes, 0);
        let size = quickPackSize(entries);
        const folder = path.dirname(sources[0]!);
        const stem = sources.length === 1 ? path.basename(sources[0]!).replace(/\.[^.]+$/u, "") || path.basename(sources[0]!) : path.basename(folder);
        const name = nextFreeName(stem, ".vhdx", (n) => existsSync(path.join(folder, n)));
        const vhdx = path.join(folder, name);
        const mount = path.join(this.root, "mounts", randomUUID());
        await fs.mkdir(mount, { recursive: true });
        const growths: { from: number; to: number; atFile: number }[] = [];
        let filesDone = 0;
        let bytesDone = 0;
        const report = (phase: PackProgress["phase"], current: string | null): void =>
            onProgress({ phase, filesDone, filesTotal: files.length, bytesDone, bytesTotal, current, growths: [...growths] });
        report("size", null);

        // Create, format and mount to a private folder in one elevated step.
        report("create", vhdx);
        const label = stem.replace(/[^A-Za-z0-9 _-]/gu, "").slice(0, 32) || "Pack";
        const created = await runner.diskpart(
            createScript({ path: vhdx, format: "vhdx", type: "dynamic", sizeBytes: size, volume: { fileSystem: "ntfs", label, partitionStyle: "gpt", mount: { kind: "folder", path: mount } } }),
        );
        if (!created.ok) {
            await fs.rm(mount, { recursive: true, force: true });
            return empty(created.cancelled ? "Cancelled at the Windows permission prompt. Nothing was created." : `Could not create the disk: ${created.output.trim().slice(-400)}`, created.cancelled);
        }

        const cleanup = async (): Promise<void> => {
            await runner.diskpart(detachScript(vhdx));
            await fs.rm(vhdx, { force: true });
            await fs.rm(mount, { recursive: true, force: true });
        };

        // Copy and verify.
        const skipped: { path: string; reason: string }[] = [];
        let verified = 0;
        for (const rel of dirs) await fs.mkdir(path.join(mount, rel), { recursive: true });
        for (const file of files) {
            if (signal?.aborted) {
                await cleanup();
                return { ...empty("Cancelled. The new VHDX was detached and removed; your files were not touched.", true), growths };
            }
            report("copy", file.rel);
            const target = path.join(mount, file.rel);
            let attempt = 0;
            for (;;) {
                try {
                    this.hooks.beforeCopy?.(file.rel, attempt);
                    const sourceHash = await copyWithHash(file.abs, target);
                    report("verify", file.rel);
                    const targetHash = await hashFile(target);
                    if (sourceHash !== targetHash) throw Object.assign(new Error("The copy did not match its source."), { code: "EVERIFY" });
                    await fs.utimes(target, file.atime, file.mtime).catch(() => undefined);
                    verified += 1;
                    break;
                } catch (error) {
                    const code = (error as NodeJS.ErrnoException).code;
                    if (code === "ENOSPC" && attempt < 8) {
                        attempt += 1;
                        await fs.rm(target, { force: true });
                        const next = growTarget(size, Math.max(file.bytes, 64 * MIB));
                        if (next === null) {
                            await cleanup();
                            return { ...empty("Stopped: the VHDX would pass the 64 TB limit."), growths };
                        }
                        const grown = await runner.diskpart(growScript(vhdx, next, null) + `\nselect volume "${mount}\\"\nextend`);
                        if (!grown.ok) {
                            await cleanup();
                            return { ...empty(grown.cancelled ? "Cancelled at the permission prompt while growing. The new VHDX was removed." : `Stopped: the disk could not grow. ${grown.output.trim().slice(-300)} The host drive may be full.`, grown.cancelled), growths };
                        }
                        growths.push({ from: size, to: next, atFile: filesDone + 1 });
                        size = next;
                        continue;
                    }
                    skipped.push({ path: file.abs, reason: code === "EBUSY" || code === "EPERM" ? "In use by another program." : error instanceof Error ? error.message : String(error) });
                    break;
                }
            }
            filesDone += 1;
            bytesDone += file.bytes;
        }

        // Detach and finish.
        report("detach", null);
        const detached = await runner.diskpart(detachScript(vhdx));
        await fs.rm(mount, { recursive: true, force: true }).catch(() => undefined);
        report("done", null);
        await this.addToLibrary([vhdx]);
        const partial = skipped.length > 0;
        const message = `${partial ? "Partial" : "Packed"}: ${verified} of ${files.length} files verified by SHA-256 into ${name}${growths.length ? `, grew ${growths.length} time${growths.length === 1 ? "" : "s"}` : ""}.${detached.ok ? "" : " The disk is still attached; detach it from the library."}`;
        await this.record({ operation: "quickpack", path: vhdx, route: "diskpart", ok: !partial, message });
        return { ok: true, partial, cancelled: false, path: vhdx, virtualBytes: size, files: files.length, verified, skipped, growths, message };
    }

    /**
     * Render into a VHDX: creates the disk (or attaches an existing one) and mounts it to a private
     * folder so the renderer can use that folder as its map storage. Returns the mount folder.
     */
    async prepareMapDisk(vhdx: string, sizeBytes: number): Promise<{ readonly ok: boolean; readonly mount: string | null; readonly message: string }> {
        const status = await this.status();
        if (!status.available || !this.runner) return { ok: false, mount: null, message: status.reason ?? "Unavailable." };
        const mount = path.join(this.root, "mounts", path.basename(vhdx).replace(/\.[^.]+$/u, ""));
        await fs.mkdir(mount, { recursive: true });
        const exists = existsSync(vhdx);
        const ps = (value: string): string => `'${value.replace(/'/gu, "''")}'`;
        const outcome = exists
            ? await this.runner.elevatedPowerShell(
                  [
                      "$ErrorActionPreference = 'Stop'",
                      `$image = Mount-DiskImage -ImagePath ${ps(vhdx)} -NoDriveLetter -PassThru`,
                      "$disk = $image | Get-Disk",
                      "$part = Get-Partition -DiskNumber $disk.Number | Where-Object { $_.Type -eq 'Basic' } | Select-Object -First 1",
                      `Add-PartitionAccessPath -DiskNumber $disk.Number -PartitionNumber $part.PartitionNumber -AccessPath ${ps(mount + "\\")}`,
                  ].join("\n"),
              )
            : await this.runner.diskpart(
                  createScript({ path: vhdx, format: "vhdx", type: "dynamic", sizeBytes: Math.max(sizeBytes, 2 * GIB), volume: { fileSystem: "ntfs", label: "Map", partitionStyle: "gpt", allocationUnitBytes: 4096, mount: { kind: "folder", path: mount } } }),
              );
        if (!outcome.ok) return { ok: false, mount: null, message: outcome.cancelled ? "Cancelled at the permission prompt. The map stays in a folder." : outcome.output.trim().slice(-400) };
        await this.addToLibrary([vhdx]);
        await this.record({ operation: exists ? "attach" : "create", path: vhdx, route: "diskpart", ok: true, message: `Map storage mounted at ${mount}.` });
        return { ok: true, mount, message: `The map renders into ${path.basename(vhdx)}.` };
    }

    /** Grows a mounted map disk when its free space falls under 10 percent. Returns true if it grew. */
    async growMapDiskIfNeeded(vhdx: string, mount: string, currentBytes: number): Promise<number | null> {
        if (!this.runner) return null;
        const stats = await fs.statfs(mount).catch(() => null);
        if (!stats) return null;
        const free = stats.bavail * stats.bsize;
        const total = stats.blocks * stats.bsize;
        if (total === 0 || free / total >= 0.1) return null;
        const next = growTarget(currentBytes, Math.ceil(total * 0.25));
        if (next === null) return null;
        const outcome = await this.runner.diskpart(`${growScript(vhdx, next, null)}\nselect volume "${mount}\\"\nextend`);
        return outcome.ok ? next : null;
    }
}

async function copyWithHash(source: string, target: string): Promise<string> {
    const hash = createHash("sha256");
    const read = createReadStream(source);
    read.on("data", (chunk) => hash.update(chunk));
    await pipeline(read, createWriteStream(target, { flags: "wx" }));
    return hash.digest("hex");
}

async function hashFile(file: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
    return hash.digest("hex");
}
