import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AddonRegistry, SandboxedAddonRuntime, appendAddonJournal, readInstalledAddon, renameWithRetry, type AddonCapability, type AddonManifest, type AddonDiagnostic, type InstalledAddon } from "@worldlens/server";

const REGISTRY_VERSION = 1 as const;
const MAX_ADDONS = 128;
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;

export interface AddonRecord {
    manifest: AddonManifest;
    source: string;
    enabled: boolean;
    importedAt: string;
    error: string | null;
    grantedCapabilities: AddonCapability[];
    provenance: InstalledAddon["provenance"];
}

export type AddonAnswer<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

interface RegistryFile { version: 1; safeMode?: boolean; addons: AddonRecord[] }

function statePath(root: string): string { return path.join(root, "registry.json"); }
function addonDir(root: string, id: string): string { return path.join(root, "packages", id); }

async function walkSizeAndLinks(root: string): Promise<number> {
    const stack = [root]; let total = 0;
    while (stack.length) {
        const current = stack.pop()!;
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) throw new Error("add-on packages cannot contain symbolic links");
        if (stat.isFile()) { total += stat.size; if (total > MAX_PACKAGE_BYTES) throw new Error("add-on package exceeds the 64 MiB limit"); continue; }
        if (!stat.isDirectory()) throw new Error("add-on package contains an unsupported file type");
        for (const entry of await fs.readdir(current)) stack.push(path.join(current, entry));
    }
    return total;
}

async function copyAtomic(source: string, destination: string): Promise<string | null> {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const temp = `${destination}.tmp-${process.pid}-${randomUUID()}`;
    const backup = `${destination}.backup-${process.pid}-${randomUUID()}`;
    let moved = false;
    try {
        await fs.cp(source, temp, { recursive: true, errorOnExist: true, force: false });
        try { await fs.rename(destination, backup); moved = true; } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        try { await fs.rename(temp, destination); }
        catch (error) {
            try { await fs.rename(backup, destination); } catch { /* preserve the original error */ }
            throw error;
        }
        return moved ? backup : null;
    } catch (error) {
        if (moved) { try { await fs.rename(backup, destination); } catch { /* preserve original failure */ } }
        throw error;
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
}

async function discardBackup(backup: string | null): Promise<void> { if (backup) await fs.rm(backup, { recursive: true, force: true }); }
async function restoreBackup(backup: string | null, destination: string): Promise<void> {
    if (!backup) { await fs.rm(destination, { recursive: true, force: true }); return; }
    await fs.rm(destination, { recursive: true, force: true });
    await renameWithRetry(backup, destination);
}

async function replaceFileAtomic(temp: string, target: string): Promise<void> {
    const backup = `${target}.backup-${process.pid}-${randomUUID()}`;
    let moved = false;
    try {
        try { await fs.rename(target, backup); moved = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        try { await fs.rename(temp, target); }
        catch (error) {
            if (moved) { try { await fs.rename(backup, target); } catch { /* preserve original failure */ } }
            throw error;
        }
        if (moved) await fs.rm(backup, { force: true });
    } finally { await fs.rm(temp, { force: true }); }
}

export class AddonManager {
    private records = new Map<string, AddonRecord>();
    private readonly runtime = new SandboxedAddonRuntime({
        timeoutMs: 1500,
        memoryMb: 64,
        consent: (request) => {
            const record = this.records.get(request.addonId);
            return record !== undefined && request.capabilities.every((capability) => record.grantedCapabilities.includes(capability));
        },
    });
    private loaded = false;
    private loadFailure: { code: string; message: string } | null = null;
    private safeMode = false;
    private readonly diagnosticsLog: AddonDiagnostic[] = [];

    constructor(private readonly root: string) {}

    private async load(): Promise<AddonAnswer<true>> {
        if (this.loaded) return this.loadFailure ? { ok: false, ...this.loadFailure } : { ok: true, value: true };
        this.loaded = true;
        try {
            const raw = JSON.parse(await fs.readFile(statePath(this.root), "utf8")) as RegistryFile;
            if (raw.version !== REGISTRY_VERSION || !Array.isArray(raw.addons) || raw.addons.length > MAX_ADDONS) throw new Error("unsupported or corrupt add-on registry");
            this.safeMode = raw.safeMode === true;
            this.records = new Map(raw.addons.map((record) => [record.manifest.id, { ...record, source: path.posix.join("packages", record.manifest.id), grantedCapabilities: record.grantedCapabilities ?? [] }]));
            return { ok: true, value: true };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, value: true };
            this.loadFailure = { code: "corrupt-registry", message: error instanceof Error ? error.message : "The add-on registry is corrupt." };
            return { ok: false, ...this.loadFailure };
        }
    }

    private async save(): Promise<AddonAnswer<true>> {
        try {
            await fs.mkdir(this.root, { recursive: true });
            const target = statePath(this.root);
            const temp = `${target}.tmp-${process.pid}-${randomUUID()}`;
            await fs.writeFile(temp, `${JSON.stringify({ version: REGISTRY_VERSION, safeMode: this.safeMode, addons: [...this.records.values()] }, null, 2)}\n`, "utf8");
            await replaceFileAtomic(temp, target);
            return { ok: true, value: true };
        } catch (error) { return { ok: false, code: "registry-write-failed", message: error instanceof Error ? error.message : "The add-on registry could not be saved." }; }
    }

    async list(): Promise<AddonAnswer<AddonRecord[]>> {
        const loaded = await this.load();
        if (!loaded.ok) return loaded;
        return { ok: true, value: [...this.records.values()].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id)) };
    }

    async importFromDirectory(source: string): Promise<AddonAnswer<AddonRecord>> {
        const loaded = await this.load(); if (!loaded.ok) return loaded;
        let pendingBackup: string | null = null;
        let pendingDestination: string | null = null;
        try {
            const root = path.resolve(source);
            await walkSizeAndLinks(root);
            const installed = await readInstalledAddon(root);
            const destination = addonDir(this.root, installed.manifest.id);
            pendingDestination = destination;
            const backup = await copyAtomic(root, destination);
            pendingBackup = backup;
            const copied = await readInstalledAddon(destination);
            const previous = this.records.get(copied.manifest.id);
            const record: AddonRecord = { manifest: copied.manifest, source: path.posix.join("packages", copied.manifest.id), enabled: previous?.enabled ?? false, importedAt: new Date().toISOString(), error: null, grantedCapabilities: previous?.grantedCapabilities ?? [], provenance: copied.provenance };
            this.records.set(record.manifest.id, record);
            const saved = await this.save();
            if (!saved.ok) { this.records.set(record.manifest.id, previous ?? record); await restoreBackup(backup, destination); pendingBackup = null; return saved; }
            await discardBackup(backup);
            pendingBackup = null;
            await appendAddonJournal(path.join(this.root, "addons.journal"), { action: previous ? "update" : "import", addonId: record.manifest.id, manifestSha256: record.provenance.manifestSha256 });
            return { ok: true, value: record };
        } catch (error) {
            if (pendingDestination) { try { await restoreBackup(pendingBackup, pendingDestination); } catch { /* retain the original import failure */ } }
            return { ok: false, code: "import-failed", message: error instanceof Error ? error.message : "The add-on package could not be imported." };
        }
    }

    async setEnabled(id: string, enabled: boolean): Promise<AddonAnswer<AddonRecord>> {
        const loaded = await this.load(); if (!loaded.ok) return loaded;
        const record = this.records.get(id); if (!record) return { ok: false, code: "not-found", message: "That add-on is not installed." };
        const started: InstalledAddon[] = [];
        try {
            if (enabled && this.safeMode) return { ok: false, code: "safe-mode", message: "Safe mode is active; add-ons remain disabled until it is turned off." };
            const registry = new AddonRegistry();
            await registry.discover(path.join(this.root, "packages"));
            for (const candidate of this.records.values()) if (candidate.enabled || (candidate.manifest.id === id && enabled)) registry.enable(candidate.manifest.id);
            const order = enabled ? registry.loadOrder() : [];
            if (enabled) for (const candidate of order) {
                const recordForCandidate = this.records.get(candidate.manifest.id);
                if (recordForCandidate === undefined) throw new Error(`add-on ${candidate.manifest.id} is not in the registry`);
                const missing = (candidate.manifest.capabilities ?? []).filter((cap) => !recordForCandidate.grantedCapabilities.includes(cap));
                if (missing.length > 0) throw new Error(`capability consent required: ${missing.join(", ")}`);
                await this.runtime.start(candidate); started.push(candidate);
            }
            if (!enabled) await this.runtime.stop(await readInstalledAddon(addonDir(this.root, id)));
            const next = { ...record, enabled, error: null };
            this.records.set(id, next);
            const saved = await this.save(); if (!saved.ok) { for (const candidate of started) await this.runtime.stop(candidate); this.records.set(id, record); if (!enabled && record.enabled) { try { await this.runtime.start(await readInstalledAddon(addonDir(this.root, id))); } catch { /* preserve the registry-write failure */ } } return saved; }
            return { ok: true, value: next };
        } catch (error) {
            for (const candidate of started) await this.runtime.stop(candidate);
            const message = error instanceof Error ? error.message : "The sandbox could not change the add-on state.";
            this.diagnosticsLog.push({ addonId: id, phase: "start", message });
            const next = { ...record, enabled: false, error: message };
            this.records.set(id, next); await this.save();
            return { ok: false, code: "runtime-failed", message };
        }
    }

    async grant(id: string, capabilities: readonly AddonCapability[]): Promise<AddonAnswer<AddonRecord>> {
        const loaded = await this.load(); if (!loaded.ok) return loaded;
        const record = this.records.get(id); if (!record) return { ok: false, code: "not-found", message: "That add-on is not installed." };
        const allowed = new Set(record.manifest.capabilities ?? []);
        if (capabilities.some((cap) => !allowed.has(cap))) return { ok: false, code: "invalid-capability", message: "The add-on requested a capability not present in its manifest." };
        const next = { ...record, grantedCapabilities: [...new Set(capabilities)] };
        this.records.set(id, next); const saved = await this.save(); if (!saved.ok) { this.records.set(id, record); return saved; } return { ok: true, value: next };
    }

    async revoke(id: string, capability: AddonCapability): Promise<AddonAnswer<AddonRecord>> {
        const loaded = await this.load(); if (!loaded.ok) return loaded;
        const record = this.records.get(id); if (!record) return { ok: false, code: "not-found", message: "That add-on is not installed." };
        try {
            if (record.enabled) await this.runtime.stop(await readInstalledAddon(addonDir(this.root, id)));
            const next = { ...record, enabled: false, error: null, grantedCapabilities: record.grantedCapabilities.filter((item) => item !== capability) };
            this.records.set(id, next); const saved = await this.save(); if (!saved.ok) { this.records.set(id, record); if (record.enabled) { try { await this.runtime.start(await readInstalledAddon(addonDir(this.root, id))); } catch { /* preserve save failure */ } } return saved; } return { ok: true, value: next };
        } catch (error) { return { ok: false, code: "revoke-failed", message: error instanceof Error ? error.message : "The capability could not be revoked." }; }
    }

    async remove(id: string): Promise<AddonAnswer<boolean>> {
        const loaded = await this.load(); if (!loaded.ok) return loaded;
        const record = this.records.get(id); if (!record) return { ok: false, code: "not-found", message: "That add-on is not installed." };
        if (record.enabled) await this.runtime.stop(await readInstalledAddon(addonDir(this.root, id)));
        const destination = addonDir(this.root, id);
        const backup = `${destination}.remove-${process.pid}-${randomUUID()}`;
        await renameWithRetry(destination, backup);
        this.records.delete(id); const saved = await this.save();
        if (!saved.ok) { this.records.set(id, record); await renameWithRetry(backup, destination); return saved; }
        await fs.rm(backup, { recursive: true, force: true });
        await appendAddonJournal(path.join(this.root, "addons.journal"), { action: "remove", addonId: id });
        return { ok: true, value: true };
    }

    async setSafeMode(enabled: boolean): Promise<AddonAnswer<boolean>> {
        const previousSafeMode = this.safeMode;
        const previousRecords = new Map(this.records);
        try {
            this.safeMode = enabled;
            if (enabled) for (const record of this.records.values()) if (record.enabled) {
                await this.runtime.stop(await readInstalledAddon(addonDir(this.root, record.manifest.id)));
                this.records.set(record.manifest.id, { ...record, enabled: false, error: "Safe mode is active." });
            }
        } catch (error) { this.safeMode = previousSafeMode; this.records = previousRecords; return { ok: false, code: "safe-mode-failed", message: error instanceof Error ? error.message : "Safe mode could not stop an add-on." }; }
        const saved = await this.save();
        if (!saved.ok) {
            this.safeMode = previousSafeMode;
            this.records = previousRecords;
            if (!previousSafeMode) for (const record of this.records.values()) if (record.enabled) {
                try { await this.runtime.start(await readInstalledAddon(addonDir(this.root, record.manifest.id))); }
                catch (error) { this.diagnosticsLog.push({ addonId: record.manifest.id, phase: "start", message: error instanceof Error ? error.message : "The add-on could not be restored after the registry save failure." }); }
            }
        }
        return saved.ok ? { ok: true, value: this.safeMode } : saved;
    }

    diagnostics(): AddonDiagnostic[] { return [...this.diagnosticsLog]; }
    async safeModeState(): Promise<boolean> { await this.load(); return this.safeMode; }

    async dispose(): Promise<void> {
        for (const record of this.records.values()) if (record.enabled) {
            try { await this.runtime.stop(await readInstalledAddon(addonDir(this.root, record.manifest.id))); } catch { /* shutdown is best effort */ }
        }
    }
}
