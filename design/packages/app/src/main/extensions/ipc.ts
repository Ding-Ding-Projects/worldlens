import type { IpcMain } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { installBuiltins } from "./builtins.js";
import { ExtensionHost, MANIFEST_FILE, PERMISSION_TEXT, parseManifest, type ExtensionRecord } from "./host.js";

export const EXTENSION_CHANNELS = ["extensions:list", "extensions:setEnabled", "extensions:run", "extensions:import", "extensions:openFolder"] as const;

export interface ExtensionIpc {
    readonly host: ExtensionHost;
    dispose(): void;
}

/** What the interface sees: no folder paths beyond the extension's own, no environment. */
export function serialize(record: ExtensionRecord) {
    const m = record.manifest;
    return {
        id: m?.id ?? path.basename(record.folder),
        name: m?.name ?? path.basename(record.folder),
        version: m?.version ?? "",
        description: m?.description ?? "",
        builtIn: record.builtIn,
        enabled: record.enabled,
        needsConsent: record.needsConsent,
        problems: [...record.problems],
        permissions: (m?.permissions ?? []).map((p) => ({ id: p, text: PERMISSION_TEXT[p] })),
        commands: (m?.commands ?? []).map((c) => ({ ...c })),
        limits: m?.limits ?? null,
        runtime: m?.run.command ?? "",
    };
}

/**
 * Registers the extension channels. Importing copies a folder the person picked through the
 * system dialog into the extensions folder, refusing one without a valid manifest and never
 * replacing an installed one. A run hands the program only the input its command declares.
 */
export function registerExtensionHandlers(
    ipcMain: Pick<IpcMain, "handle" | "removeHandler">,
    options: { readonly dataDir: string; readonly pickFolder: () => Promise<string | null>; readonly openPath: (folder: string) => Promise<string> },
): ExtensionIpc {
    const builtIn = path.join(options.dataDir, "extensions-builtin");
    const user = path.join(options.dataDir, "extensions");
    const host = new ExtensionHost({ builtIn, user }, path.join(options.dataDir, "extensions-state.json"));
    const ready = installBuiltins(builtIn).catch(() => undefined);

    ipcMain.handle("extensions:list", async () => {
        await ready;
        return (await host.list()).map(serialize);
    });
    ipcMain.handle("extensions:setEnabled", async (_e, id: unknown, enabled: unknown) => {
        const record = typeof id === "string" ? await host.setEnabled(id, enabled === true) : null;
        return record ? serialize(record) : null;
    });
    ipcMain.handle("extensions:run", async (_e, id: unknown, command: unknown, input: unknown) => {
        await ready;
        if (typeof id !== "string" || typeof command !== "string") return { ok: false, message: "Choose an extension and a command.", stderr: "", ms: 0 };
        return await host.run(id, command, input);
    });
    ipcMain.handle("extensions:import", async () => {
        const source = await options.pickFolder();
        if (!source) return { ok: false, message: "Nothing was chosen." };
        let parsed;
        try {
            parsed = parseManifest(JSON.parse(await fs.readFile(path.join(source, MANIFEST_FILE), "utf8")));
        } catch {
            return { ok: false, message: `That folder has no readable ${MANIFEST_FILE}.` };
        }
        if (!parsed.manifest) return { ok: false, message: parsed.problems.join(" ") };
        const target = path.join(user, parsed.manifest.id);
        try {
            await fs.mkdir(user, { recursive: true });
            await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false, filter: (p) => !p.includes(`${path.sep}node_modules${path.sep}.cache`) });
        } catch (error) {
            return { ok: false, message: (error as NodeJS.ErrnoException).code === "ERR_FS_CP_EEXIST" || (error as NodeJS.ErrnoException).code === "EEXIST" ? "An extension with that id is already installed." : String(error) };
        }
        return { ok: true, message: `Installed ${parsed.manifest.name}. Turn it on to agree to its permissions.` };
    });
    ipcMain.handle("extensions:openFolder", async () => {
        await fs.mkdir(user, { recursive: true });
        const failure = await options.openPath(user);
        return failure ? { ok: false, message: failure } : { ok: true, message: "Opened the extensions folder." };
    });

    return {
        host,
        dispose: () => {
            for (const channel of EXTENSION_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
