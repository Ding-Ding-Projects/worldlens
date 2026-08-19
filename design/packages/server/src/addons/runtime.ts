import { readFile } from "node:fs/promises";
import type { AddonRuntime, AddonRuntimeOptions, InstalledAddon } from "./types.js";

/**
 * Fail-closed runtime until a non-Node isolate is bundled. Node's permission model
 * does not provide a network boundary and a child-process/vm wrapper is therefore
 * not a valid security boundary for untrusted ESM. This inspector remains useful to
 * the manager: it validates that the selected entry is bounded and reports why it
 * cannot execute, without ever evaluating package code.
 */
export class SandboxedAddonRuntime implements AddonRuntime {
    readonly executionAvailable = false;
    constructor(private readonly options: AddonRuntimeOptions = {}) {}

    async start(addon: InstalledAddon): Promise<void> {
        await this.inspect(addon);
        throw new Error("add-on execution is unavailable: no bundled non-Node isolate is installed");
    }

    async stop(_addon: InstalledAddon): Promise<void> { return; }

    async invoke(addon: InstalledAddon, hook: string, _payload?: unknown): Promise<unknown> {
        if (!/^[a-z][A-Za-z0-9_]{0,63}$/.test(hook)) throw new Error("invalid add-on hook");
        await this.inspect(addon);
        throw new Error("add-on execution is unavailable: no bundled non-Node isolate is installed");
    }

    async stopAll(): Promise<void> { return; }

    private async inspect(addon: InstalledAddon): Promise<void> {
        const bytes = await readFile(addon.entryPath);
        if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("add-on entry exceeds the 8 MiB inspection limit");
        const source = bytes.toString("utf8");
        if (/\b(?:node:|import\s*\(|require\s*\(|process\b|globalThis\b|fetch\s*\(|WebSocket\b)/.test(source)) {
            this.options.onDiagnostic?.({ addonId: addon.manifest.id, phase: "start", message: "add-on entry requests host capabilities that the inspector cannot execute" });
        }
    }
}
