import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readInstalledAddon } from "./manifest.js";
import type { AddonDiagnostic, InstalledAddon } from "./types.js";

export class AddonRegistry {
    private readonly addons = new Map<string, InstalledAddon>();
    private readonly diagnostics: AddonDiagnostic[] = [];
    private operation: Promise<unknown> = Promise.resolve();

    constructor(private readonly safeMode = false) {}

    async discover(root: string): Promise<InstalledAddon[]> {
        for (const name of (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
            try {
                const addon = await readInstalledAddon(join(root, name));
                if (this.addons.has(addon.manifest.id)) throw new Error("duplicate add-on id");
                this.addons.set(addon.manifest.id, addon);
            } catch (cause) { this.record({ addonId: name, phase: "manifest", message: cause instanceof Error ? cause.message : String(cause), cause }); }
        }
        return this.list();
    }

    /** Serialize manager mutations and roll back the in-memory snapshot on failure. */
    async transact<T>(operation: (registry: AddonRegistry) => Promise<T> | T): Promise<T> {
        const run = this.operation.then(async () => {
            const snapshot = new Map([...this.addons.entries()].map(([id, addon]) => [id, { ...addon, enabled: addon.enabled }]));
            try { return await operation(this); } catch (error) { this.addons.clear(); for (const [id, addon] of snapshot) this.addons.set(id, addon); throw error; }
        });
        this.operation = run.then(() => undefined, () => undefined);
        return run;
    }
    async setEnabled(id: string, enabled: boolean): Promise<void> { await this.transact(() => enabled ? this.enable(id) : this.disable(id)); }

    list(): InstalledAddon[] { return [...this.addons.values()].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id)); }
    diagnosticsSnapshot(): AddonDiagnostic[] { return [...this.diagnostics]; }
    enable(id: string): void { const addon = this.require(id); addon.enabled = true; }
    disable(id: string): void { const addon = this.require(id); addon.enabled = false; }

    loadOrder(): InstalledAddon[] {
        if (this.safeMode) return [];
        const enabled = new Map(this.list().filter((addon) => addon.enabled).map((addon) => [addon.manifest.id, addon]));
        for (const addon of enabled.values()) for (const dependency of Object.keys(addon.manifest.dependencies ?? {})) if (!enabled.has(dependency)) throw new Error(`add-on ${addon.manifest.id} requires disabled or missing ${dependency}`);
        for (const addon of enabled.values()) for (const conflict of addon.manifest.conflicts ?? []) if (enabled.has(conflict)) throw new Error(`add-on ${addon.manifest.id} conflicts with ${conflict}`);
        const result: InstalledAddon[] = [], visiting = new Set<string>(), visited = new Set<string>();
        const visit = (id: string) => { if (visited.has(id)) return; if (visiting.has(id)) throw new Error(`add-on dependency cycle at ${id}`); visiting.add(id); for (const dep of Object.keys(enabled.get(id)!.manifest.dependencies ?? {}).sort()) visit(dep); visiting.delete(id); visited.add(id); result.push(enabled.get(id)!); };
        for (const id of [...enabled.keys()].sort()) visit(id);
        return result;
    }
    record(diagnostic: AddonDiagnostic): void { this.diagnostics.push(diagnostic); }
    private require(id: string): InstalledAddon { const addon = this.addons.get(id); if (!addon) throw new Error(`unknown add-on ${id}`); return addon; }
}
