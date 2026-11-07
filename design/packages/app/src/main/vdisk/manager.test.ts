import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VirtualDiskManager } from "./manager.js";
import type { DiskScriptRunner, ScriptOutcome } from "./runner.js";

/**
 * A pretend Windows: DiskPart scripts are recorded, `create vdisk` writes an empty file so the
 * never-overwrite rule can be observed, `assign mount=` creates the folder, and the permission
 * prompt can be declined. No real disk is ever touched.
 */
function fakeRunner(options: { decline?: boolean; hyperv?: boolean } = {}): DiskScriptRunner & { scripts: string[] } {
    const scripts: string[] = [];
    const ok: ScriptOutcome = { ok: true, cancelled: false, output: "DiskPart successfully did it.", exitCode: 0 };
    const exec = async (script: string): Promise<ScriptOutcome> => {
        scripts.push(script);
        if (options.decline) return { ok: false, cancelled: true, output: "", exitCode: null };
        const created = /create vdisk file="([^"]+)"/u.exec(script);
        if (created) await fs.writeFile(created[1]!, "");
        const mount = /assign mount="([^"]+)"/u.exec(script);
        if (mount) await fs.mkdir(mount[1]!, { recursive: true });
        return ok;
    };
    return {
        scripts,
        query: async (script) => {
            if (script.includes("virtdisk")) return JSON.stringify({ virtdisk: true, storage: true, diskpart: true, hyperv: options.hyperv === true });
            return "[]";
        },
        diskpart: exec,
        elevatedPowerShell: exec,
    };
}

let dir: string;
beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "wl-vdisk-"));
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe("availability", () => {
    it("says plainly that it needs Windows elsewhere", async () => {
        const status = await new VirtualDiskManager(dir, null, "linux").status();
        expect(status.available).toBe(false);
        expect(status.reason).toMatch(/Windows/u);
    });
    it("works on Windows Home without the Hyper-V module", async () => {
        const manager = new VirtualDiskManager(path.join(dir, "state"), fakeRunner(), "win32");
        const status = await manager.status();
        expect(status.routes.hyperv).toBe(false);
        const result = await manager.run({ operation: "grow", path: "D:\\a.vhdx", sizeBytes: 80 * 1024 ** 3, extendVolume: "E" });
        expect(result.ok).toBe(true);
        expect(result.route).toBe("diskpart");
        expect(result.script).toContain("expand vdisk maximum=81920");
    });
});

describe("operations", () => {
    it("reports a declined permission prompt as cancelled, not done", async () => {
        const manager = new VirtualDiskManager(path.join(dir, "state"), fakeRunner({ decline: true }), "win32");
        const result = await manager.run({ operation: "detach", path: "D:\\a.vhdx" });
        expect(result.ok).toBe(false);
        expect(result.cancelled).toBe(true);
        expect((await manager.history())[0]?.ok).toBe(false);
    });
    it("refuses to create over an existing file", async () => {
        const manager = new VirtualDiskManager(path.join(dir, "state"), fakeRunner(), "win32");
        const target = path.join(dir, "Data.vhdx");
        await fs.writeFile(target, "keep me");
        const result = await manager.run({ operation: "create", path: target, create: { path: target, format: "vhdx", type: "dynamic", sizeBytes: 1024 ** 3 } });
        expect(result.ok).toBe(false);
        expect(await fs.readFile(target, "utf8")).toBe("keep me");
    });
    it("refuses a shrink when only Home routes exist, naming why", async () => {
        const manager = new VirtualDiskManager(path.join(dir, "state"), fakeRunner(), "win32");
        const result = await manager.run({ operation: "shrink", path: "D:\\a.vhdx", sizeBytes: 1024 ** 3 });
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/Hyper-V/u);
    });
    it("uses Hyper-V for shrink when it is installed", async () => {
        const manager = new VirtualDiskManager(path.join(dir, "state"), fakeRunner({ hyperv: true }), "win32");
        const result = await manager.run({ operation: "shrink", path: "D:\\a.vhdx", sizeBytes: 1024 ** 3 });
        expect(result.ok).toBe(true);
        expect(result.route).toBe("hyperv");
    });
});

describe("library", () => {
    it("adds only disk files and remembers them", async () => {
        const manager = new VirtualDiskManager(path.join(dir, "state"), null, "linux");
        const answer = await manager.addToLibrary(["C:\\a.vhdx", "C:\\notes.txt"]);
        expect(answer.added).toEqual(["C:\\a.vhdx"]);
        expect(answer.refused).toHaveLength(1);
        expect(await manager.library()).toEqual(["C:\\a.vhdx"]);
    });
});

describe("Quick pack", () => {
    async function makeSources(): Promise<string> {
        const src = path.join(dir, "Photos");
        await fs.mkdir(path.join(src, "2019"), { recursive: true });
        await fs.writeFile(path.join(src, "a.txt"), "alpha");
        await fs.writeFile(path.join(src, "2019", "b.bin"), Buffer.alloc(70_000, 7));
        return src;
    }

    it("copies, verifies, never overwrites and leaves the sources alone", async () => {
        const src = await makeSources();
        await fs.writeFile(path.join(dir, "Photos.vhdx"), "existing");
        const runner = fakeRunner();
        const manager = new VirtualDiskManager(path.join(dir, "state"), runner, "win32");
        const phases: string[] = [];
        const result = await manager.quickPack([src], (p) => phases.push(p.phase));
        expect(result.ok).toBe(true);
        expect(result.partial).toBe(false);
        expect(result.verified).toBe(2);
        expect(path.basename(result.path!)).toBe("Photos (1).vhdx");
        expect(await fs.readFile(path.join(dir, "Photos.vhdx"), "utf8")).toBe("existing");
        expect(await fs.readFile(path.join(src, "a.txt"), "utf8")).toBe("alpha");
        expect(phases).toContain("verify");
        expect(phases.at(-1)).toBe("done");
        expect(runner.scripts.at(-1)).toContain("detach vdisk");
    });

    it("grows the disk automatically when a copy runs out of space and carries on", async () => {
        const src = await makeSources();
        const runner = fakeRunner();
        const manager = new VirtualDiskManager(path.join(dir, "state"), runner, "win32", {
            beforeCopy: (rel, attempt) => {
                if (rel.endsWith("b.bin") && attempt === 0) throw Object.assign(new Error("no space"), { code: "ENOSPC" });
            },
        });
        const result = await manager.quickPack([src], () => undefined);
        expect(result.ok).toBe(true);
        expect(result.growths).toHaveLength(1);
        expect(result.growths[0]!.to).toBeGreaterThan(result.growths[0]!.from);
        expect(result.verified).toBe(2);
        expect(runner.scripts.some((s) => s.includes("expand vdisk") && s.includes("extend"))).toBe(true);
    });

    it("removes only its own VHDX on cancel", async () => {
        const src = await makeSources();
        const controller = new AbortController();
        controller.abort();
        const manager = new VirtualDiskManager(path.join(dir, "state"), fakeRunner(), "win32");
        const result = await manager.quickPack([src], () => undefined, controller.signal);
        expect(result.cancelled).toBe(true);
        expect(existsSync(path.join(dir, "Photos.vhdx"))).toBe(false);
        expect(existsSync(path.join(src, "a.txt"))).toBe(true);
    });

    it("reports a declined prompt as nothing created", async () => {
        const src = await makeSources();
        const manager = new VirtualDiskManager(path.join(dir, "state"), fakeRunner({ decline: true }), "win32");
        const result = await manager.quickPack([src], () => undefined);
        expect(result.cancelled).toBe(true);
        expect(result.path).toBeNull();
    });
});

describe("render into a VHDX", () => {
    it("creates and mounts a map disk to a private folder", async () => {
        const runner = fakeRunner();
        const manager = new VirtualDiskManager(path.join(dir, "state"), runner, "win32");
        const result = await manager.prepareMapDisk(path.join(dir, "Bayville-map.vhdx"), 8 * 1024 ** 3);
        expect(result.ok).toBe(true);
        expect(result.mount).toContain("Bayville-map");
        expect(runner.scripts[0]).toContain("unit=4096");
        expect(await manager.library()).toContain(path.join(dir, "Bayville-map.vhdx"));
    });
});
