import type { IpcMain } from "electron";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { EditorService } from "./editors.js";

export const EDITOR_CHANNELS = ["editors:list", "editors:choose", "editors:add", "editors:remove", "editors:open", "editors:openInVsCode", "editors:openText"] as const;

export interface EditorIpc {
    readonly service: EditorService;
    dispose(): void;
}

/** Names that can never escape the scratch folder or hide what they are. */
const safeName = (name: unknown): string => {
    const base = typeof name === "string" ? path.basename(name).replace(/[^\w.() -]/gu, "_").slice(0, 80) : "";
    return base && !base.startsWith(".") ? base : "worldlens.txt";
};

/**
 * Registers the external editor channels. Adding an editor opens the system file picker in
 * the main process, so the renderer never hands over an arbitrary program path. Text the app
 * wants to show in an editor (a script, an export) is written to a private scratch folder
 * first and never over an existing file.
 */
export function registerEditorHandlers(
    ipcMain: Pick<IpcMain, "handle" | "removeHandler">,
    options: { readonly dataDir: string; readonly pickProgram: () => Promise<string | null>; readonly service?: EditorService },
): EditorIpc {
    const service = options.service ?? new EditorService(path.join(options.dataDir, "editors", "editors.json"));
    const scratch = path.join(options.dataDir, "editors", "scratch");

    ipcMain.handle("editors:list", async () => await service.list());
    ipcMain.handle("editors:choose", async (_e, id: unknown) => (typeof id === "string" ? await service.choose(id) : false));
    ipcMain.handle("editors:add", async () => {
        const program = await options.pickProgram();
        if (!program) return { ok: false, message: "Nothing was chosen." };
        return await service.add(program);
    });
    ipcMain.handle("editors:remove", async (_e, id: unknown) => {
        if (typeof id === "string") await service.remove(id);
        return await service.list();
    });
    ipcMain.handle("editors:open", async (_e, target: unknown, id: unknown) =>
        typeof target === "string" ? await service.open(target, typeof id === "string" ? id : undefined) : { ok: false, message: "Choose a file or folder.", editor: null },
    );
    ipcMain.handle("editors:openInVsCode", async (_e, target: unknown) =>
        typeof target === "string" ? await service.openInVsCode(target) : { ok: false, message: "Choose a file or folder.", editor: null },
    );
    ipcMain.handle("editors:openText", async (_e, name: unknown, text: unknown) => {
        if (typeof text !== "string" || text.length > 16 * 1024 * 1024) return { ok: false, message: "There is nothing to open, or it is larger than 16 MB.", editor: null };
        await fs.mkdir(scratch, { recursive: true });
        const stem = safeName(name);
        const ext = path.extname(stem);
        const base = stem.slice(0, stem.length - ext.length);
        let file = path.join(scratch, stem);
        for (let n = 1; ; n++) {
            try {
                await fs.writeFile(file, text, { encoding: "utf8", flag: "wx" });
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST" || n > 999) throw error;
                file = path.join(scratch, `${base} (${n})${ext}`);
            }
        }
        return await service.openInVsCode(file);
    });

    return {
        service,
        dispose: () => {
            for (const channel of EDITOR_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

/** For tests: a scratch folder outside the real data directory. */
export const tempDataDir = (): string => path.join(os.tmpdir(), `wl-editors-${process.pid}`);
