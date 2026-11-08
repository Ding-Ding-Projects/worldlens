import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorService, VSCODE_DOWNLOAD, candidates, onPath } from "./editors.js";

let dir: string;
beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "wl-editors-"));
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

const WIN_ENV = { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local", ProgramFiles: "C:\\Program Files", SystemRoot: "C:\\Windows", PATH: "C:\\tools;C:\\Windows" };

function service(present: readonly string[], launched: string[][] = [], env: NodeJS.ProcessEnv = WIN_ENV) {
    const real = new Set(present);
    // The target files are real; the editors are pretend programs that only "exist" by name.
    const exists = (p: string): boolean => real.has(p) || p.startsWith(dir);
    return new EditorService(path.join(dir, "state", "editors.json"), "win32", env, exists, async (program, args) => {
        launched.push([program, ...args]);
    });
}

describe("detecting editors", () => {
    it("finds per-user VS Code, Insiders, Notepad++ and Notepad, per user before machine", async () => {
        const s = service([
            "C:\\Users\\a\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
            "C:\\Program Files\\Microsoft VS Code\\Code.exe",
            "C:\\Program Files\\Microsoft VS Code Insiders\\Code - Insiders.exe",
            "C:\\Program Files\\Notepad++\\notepad++.exe",
            "C:\\Windows\\System32\\notepad.exe",
        ]);
        const { editors, chosen } = await s.list();
        expect(editors.map((e) => e.id)).toEqual(["vscode", "vscode-insiders", "notepadpp", "notepad"]);
        expect(editors[0]!.path).toBe("C:\\Users\\a\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe");
        expect(chosen).toBe("vscode");
    });

    it("finds a portable or PATH install through the command", () => {
        expect(onPath("code.cmd", WIN_ENV, "win32", (p) => p === "C:\\tools\\code.cmd")).toBe("C:\\tools\\code.cmd");
        expect(candidates("linux", {}).find((c) => c.id === "vscode")!.commands).toContain("code");
    });
});

describe("opening", () => {
    it("opens a folder as a workspace in the chosen editor and remembers the choice", async () => {
        const launched: string[][] = [];
        const s = service(["C:\\Program Files\\Microsoft VS Code\\Code.exe", "C:\\Program Files\\Notepad++\\notepad++.exe"], launched);
        expect(await s.choose("notepadpp")).toBe(true);
        const file = path.join(dir, "notes.txt");
        await fs.writeFile(file, "x");
        expect((await s.open(file)).message).toBe("Opened in Notepad++.");
        expect((await s.open(dir, "vscode")).message).toBe("Opened the folder in Visual Studio Code as a workspace.");
        expect(launched).toEqual([["C:\\Program Files\\Notepad++\\notepad++.exe", file], ["C:\\Program Files\\Microsoft VS Code\\Code.exe", dir]]);
        expect((await s.list()).chosen).toBe("notepadpp");
    });

    it("opens exports in VS Code in one action and offers the download when there is none", async () => {
        const file = path.join(dir, "export.json");
        await fs.writeFile(file, "{}");
        const none = await service(["C:\\Program Files\\Notepad++\\notepad++.exe"]).openInVsCode(file);
        expect(none.ok).toBe(false);
        expect(none.downloadUrl).toBe(VSCODE_DOWNLOAD);
        const launched: string[][] = [];
        const insiders = await service(["C:\\Program Files\\Microsoft VS Code Insiders\\Code - Insiders.exe"], launched).openInVsCode(file);
        expect(insiders.ok).toBe(true);
        expect(launched[0]![0]).toContain("Insiders");
    });

    it("says plainly when nothing is installed or the target is gone", async () => {
        const s = new EditorService(path.join(dir, "e.json"), "win32", WIN_ENV, () => false, async () => undefined);
        expect((await s.open(path.join(dir, "missing.txt"))).message).toMatch(/no longer exists/u);
    });

    it("adds an editor the person picked, refusing folders and missing files", async () => {
        const s = service([]);
        const program = path.join(dir, "MyEditor.exe");
        await fs.writeFile(program, "");
        expect((await s.add("relative.exe")).ok).toBe(false);
        expect((await s.add(dir)).ok).toBe(false);
        const added = await s.add(program);
        expect(added.ok).toBe(true);
        const { editors, chosen } = await s.list();
        expect(editors.at(-1)).toMatchObject({ name: "MyEditor", source: "added" });
        expect(chosen).toBe(added.id);
        await s.remove(added.id!);
        expect((await s.list()).editors.some((e) => e.source === "added")).toBe(false);
    });
});
