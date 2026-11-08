import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * External editors: finds the ones installed on this computer, remembers the person's choice,
 * lets them add their own, and opens a file or a folder in one. Visual Studio Code has its own
 * one-action route because anything the app exports should open there directly.
 *
 * Nothing is installed. When no VS Code is found the answer says so and carries the download
 * page, rather than opening some other program.
 */

export interface EditorInfo {
    readonly id: string;
    readonly name: string;
    /** The program that is started, with the target as its only argument. */
    readonly path: string;
    readonly kind: "vscode" | "other";
    readonly source: "detected" | "added";
}

export interface OpenResult {
    readonly ok: boolean;
    readonly message: string;
    readonly editor: string | null;
    /** Set when VS Code was asked for and is not installed. */
    readonly downloadUrl?: string;
}

export const VSCODE_DOWNLOAD = "https://code.visualstudio.com/download";

interface Candidate {
    readonly id: string;
    readonly name: string;
    readonly kind: "vscode" | "other";
    readonly paths: readonly string[];
    /** Program names looked up on PATH. */
    readonly commands: readonly string[];
}

/** Where each editor installs on each system, per user first, then for the machine. */
export function candidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): Candidate[] {
    const local = env["LOCALAPPDATA"] ?? "";
    const programs = env["ProgramFiles"] ?? "C:\\Program Files";
    const programs86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const home = env["HOME"] ?? env["USERPROFILE"] ?? "";
    if (platform === "win32") {
        const w = path.win32.join;
        return [
            { id: "vscode", name: "Visual Studio Code", kind: "vscode", paths: [w(local, "Programs", "Microsoft VS Code", "Code.exe"), w(programs, "Microsoft VS Code", "Code.exe")], commands: ["code.cmd", "code"] },
            { id: "vscode-insiders", name: "Visual Studio Code Insiders", kind: "vscode", paths: [w(local, "Programs", "Microsoft VS Code Insiders", "Code - Insiders.exe"), w(programs, "Microsoft VS Code Insiders", "Code - Insiders.exe")], commands: ["code-insiders.cmd"] },
            { id: "vscodium", name: "VSCodium", kind: "vscode", paths: [w(local, "Programs", "VSCodium", "VSCodium.exe"), w(programs, "VSCodium", "VSCodium.exe")], commands: ["codium.cmd"] },
            { id: "cursor", name: "Cursor", kind: "other", paths: [w(local, "Programs", "cursor", "Cursor.exe")], commands: [] },
            { id: "notepadpp", name: "Notepad++", kind: "other", paths: [w(programs, "Notepad++", "notepad++.exe"), w(programs86, "Notepad++", "notepad++.exe")], commands: [] },
            { id: "sublime", name: "Sublime Text", kind: "other", paths: [w(programs, "Sublime Text", "sublime_text.exe"), w(programs, "Sublime Text 3", "sublime_text.exe")], commands: ["subl.exe"] },
            { id: "notepad", name: "Notepad", kind: "other", paths: [w(env["SystemRoot"] ?? "C:\\Windows", "System32", "notepad.exe")], commands: [] },
        ];
    }
    if (platform === "darwin") {
        const app = (name: string, bin: string) => [path.posix.join("/Applications", name, "Contents", "Resources", "app", "bin", bin), path.posix.join(home, "Applications", name, "Contents", "Resources", "app", "bin", bin)];
        return [
            { id: "vscode", name: "Visual Studio Code", kind: "vscode", paths: app("Visual Studio Code.app", "code"), commands: ["code"] },
            { id: "vscode-insiders", name: "Visual Studio Code Insiders", kind: "vscode", paths: app("Visual Studio Code - Insiders.app", "code-insiders"), commands: ["code-insiders"] },
            { id: "vscodium", name: "VSCodium", kind: "vscode", paths: app("VSCodium.app", "codium"), commands: ["codium"] },
            { id: "sublime", name: "Sublime Text", kind: "other", paths: ["/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl"], commands: ["subl"] },
        ];
    }
    return [
        { id: "vscode", name: "Visual Studio Code", kind: "vscode", paths: ["/usr/bin/code", "/snap/bin/code"], commands: ["code"] },
        { id: "vscode-insiders", name: "Visual Studio Code Insiders", kind: "vscode", paths: ["/usr/bin/code-insiders"], commands: ["code-insiders"] },
        { id: "vscodium", name: "VSCodium", kind: "vscode", paths: ["/usr/bin/codium", "/snap/bin/codium"], commands: ["codium"] },
        { id: "sublime", name: "Sublime Text", kind: "other", paths: ["/usr/bin/subl"], commands: ["subl"] },
        { id: "gedit", name: "Text Editor", kind: "other", paths: ["/usr/bin/gedit", "/usr/bin/gnome-text-editor"], commands: [] },
    ];
}

/** The first file named `command` on PATH, or null. */
export function onPath(command: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform, exists: (p: string) => boolean = existsSync): string | null {
    const sep = platform === "win32" ? ";" : ":";
    const join = platform === "win32" ? path.win32.join : path.posix.join;
    for (const dir of (env["PATH"] ?? env["Path"] ?? "").split(sep)) {
        if (!dir) continue;
        const full = join(dir, command);
        if (exists(full)) return full;
    }
    return null;
}

interface Saved {
    readonly chosen: string | null;
    readonly added: readonly { readonly id: string; readonly name: string; readonly path: string }[];
}

export type Launcher = (program: string, args: readonly string[]) => Promise<void>;

/** Starts a program detached, so closing the app never closes the editor. */
export const defaultLauncher: Launcher = (program, args) =>
    new Promise((resolve, reject) => {
        const isScript = /\.(cmd|bat)$/iu.test(program);
        const child = spawn(program, [...args], { detached: true, stdio: "ignore", windowsHide: false, shell: isScript });
        child.once("error", reject);
        child.once("spawn", () => {
            child.unref();
            resolve();
        });
    });

export class EditorService {
    constructor(
        private readonly stateFile: string,
        private readonly platform: NodeJS.Platform = process.platform,
        private readonly env: NodeJS.ProcessEnv = process.env,
        private readonly exists: (p: string) => boolean = existsSync,
        private readonly launch: Launcher = defaultLauncher,
    ) {}

    private async saved(): Promise<Saved> {
        try {
            const value = JSON.parse(await fs.readFile(this.stateFile, "utf8")) as Partial<Saved>;
            return { chosen: typeof value.chosen === "string" ? value.chosen : null, added: Array.isArray(value.added) ? value.added.filter((a) => typeof a?.path === "string" && typeof a?.id === "string") : [] };
        } catch {
            return { chosen: null, added: [] };
        }
    }

    private async save(next: Saved): Promise<void> {
        await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
        await fs.writeFile(this.stateFile, JSON.stringify(next, null, 2), "utf8");
    }

    /** Every editor found on this computer plus the ones the person added, and the choice. */
    async list(): Promise<{ readonly editors: readonly EditorInfo[]; readonly chosen: string | null }> {
        const found: EditorInfo[] = [];
        for (const c of candidates(this.platform, this.env)) {
            const hit = c.paths.find((p) => this.exists(p)) ?? c.commands.map((cmd) => onPath(cmd, this.env, this.platform, this.exists)).find((p) => p !== null) ?? null;
            if (hit) found.push({ id: c.id, name: c.name, path: hit, kind: c.kind, source: "detected" });
        }
        const saved = await this.saved();
        for (const a of saved.added) {
            if (this.exists(a.path)) found.push({ id: a.id, name: a.name, path: a.path, kind: /code|codium/iu.test(path.basename(a.path)) ? "vscode" : "other", source: "added" });
        }
        const chosen = saved.chosen && found.some((e) => e.id === saved.chosen) ? saved.chosen : (found[0]?.id ?? null);
        return { editors: found, chosen };
    }

    async choose(id: string): Promise<boolean> {
        const { editors } = await this.list();
        if (!editors.some((e) => e.id === id)) return false;
        await this.save({ ...(await this.saved()), chosen: id });
        return true;
    }

    /** Adds a program the person picked. Refuses anything that is not an existing file. */
    async add(program: string): Promise<{ readonly ok: boolean; readonly message: string; readonly id?: string }> {
        if (!path.isAbsolute(program) || !this.exists(program)) return { ok: false, message: "Choose the editor's program file." };
        const stat = await fs.stat(program).catch(() => null);
        if (stat && !stat.isFile()) return { ok: false, message: "Choose the editor's program file, not a folder." };
        const saved = await this.saved();
        if (saved.added.some((a) => a.path === program)) return { ok: true, message: "Already in the list.", id: saved.added.find((a) => a.path === program)!.id };
        const id = `added-${saved.added.length + 1}-${path.basename(program).replace(/[^\w.-]/gu, "")}`;
        const name = path.basename(program).replace(/\.(exe|cmd|bat|app)$/iu, "");
        await this.save({ chosen: id, added: [...saved.added, { id, name, path: program }] });
        return { ok: true, message: `Added ${name} and chose it.`, id };
    }

    async remove(id: string): Promise<void> {
        const saved = await this.saved();
        await this.save({ chosen: saved.chosen === id ? null : saved.chosen, added: saved.added.filter((a) => a.id !== id) });
    }

    /** Opens a file, or a folder as the workspace, in the chosen editor or the one named. */
    async open(target: string, editorId?: string): Promise<OpenResult> {
        if (!path.isAbsolute(target) || !this.exists(target)) return { ok: false, message: "That file or folder no longer exists.", editor: null };
        const { editors, chosen } = await this.list();
        const editor = editors.find((e) => e.id === (editorId ?? chosen));
        if (!editor) return { ok: false, message: "No external editor was found on this computer. Add one in Settings under External editor.", editor: null };
        return await this.start(editor, target);
    }

    /** One action for anything exported: VS Code, its Insiders build or VSCodium, in that order. */
    async openInVsCode(target: string): Promise<OpenResult> {
        if (!path.isAbsolute(target) || !this.exists(target)) return { ok: false, message: "That file or folder no longer exists.", editor: null };
        const { editors } = await this.list();
        const code = editors.find((e) => e.id === "vscode") ?? editors.find((e) => e.id === "vscode-insiders") ?? editors.find((e) => e.kind === "vscode");
        if (!code) return { ok: false, message: "Visual Studio Code is not installed on this computer. The download page has it.", editor: null, downloadUrl: VSCODE_DOWNLOAD };
        return await this.start(code, target);
    }

    private async start(editor: EditorInfo, target: string): Promise<OpenResult> {
        try {
            await this.launch(editor.path, [target]);
            const folder = (await fs.stat(target)).isDirectory();
            return { ok: true, message: folder ? `Opened the folder in ${editor.name} as a workspace.` : `Opened in ${editor.name}.`, editor: editor.name };
        } catch (error) {
            return { ok: false, message: `${editor.name} did not start: ${error instanceof Error ? error.message : String(error)}`, editor: editor.name };
        }
    }
}
