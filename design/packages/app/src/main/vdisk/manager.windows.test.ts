import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIB } from "@worldlens/shared/virtualDisk";
import { VirtualDiskManager } from "./manager.js";
import { createWindowsRunner } from "./runner.js";

/**
 * Real virtual disks on a real Windows host. Runs only on Windows with
 * WL_VDISK_INTEGRATION=1, which the `Virtual disks on Windows` workflow sets on a hosted runner
 * (administrator, no Hyper-V module). Every disk lives in a fresh temporary folder that is
 * detached and deleted at the end; nothing touches an existing disk.
 *
 * Each step prints the route and the details the API reported, so the run log is the evidence.
 */
const enabled = process.platform === "win32" && process.env["WL_VDISK_INTEGRATION"] === "1";

describe.runIf(enabled)("virtual disks on a real Windows host", () => {
    let dir = "";
    let manager: VirtualDiskManager;
    const disk = (name: string): string => path.join(dir, name);
    const log = (step: string, value: unknown): void => console.log(`[vdisk] ${step}: ${JSON.stringify(value)}`);

    beforeAll(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), "wl-vdisk-it-"));
        manager = new VirtualDiskManager(path.join(dir, "state"), createWindowsRunner(path.join(dir, "work")), "win32");
    });

    afterAll(async () => {
        if (!dir) return;
        // Detach anything this run may have left attached, then remove the folder.
        for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
            if (/\.(vhdx?|vhds|avhdx)$/iu.test(name)) {
                try {
                    execFileSync("powershell.exe", ["-NoProfile", "-Command", `Dismount-DiskImage -ImagePath '${disk(name)}' -ErrorAction SilentlyContinue | Out-Null`]);
                } catch {
                    // Not attached.
                }
            }
        }
        await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    });

    it("finds the VirtDisk API, the Storage module and DiskPart", async () => {
        const status = await manager.status();
        log("routes", status.routes);
        expect(status.available).toBe(true);
        expect(status.routes.virtdisk).toBe(true);
        expect(status.routes.storage).toBe(true);
        expect(status.routes.diskpart).toBe(true);
    });

    it("creates a VHDX with a formatted volume mounted to a folder, writes to it and detaches", async () => {
        const mount = disk("mount-a");
        await fs.mkdir(mount);
        const created = await manager.run({
            operation: "create",
            path: disk("a.vhdx"),
            create: { path: disk("a.vhdx"), format: "vhdx", type: "dynamic", sizeBytes: 256 * MIB, volume: { fileSystem: "ntfs", label: "WLTest", partitionStyle: "gpt", mount: { kind: "folder", path: mount } } },
        });
        log("create", { route: created.route, ok: created.ok, message: created.message });
        expect(created.ok).toBe(true);
        await fs.writeFile(path.join(mount, "hello.txt"), "Bayville");
        expect(await fs.readFile(path.join(mount, "hello.txt"), "utf8")).toBe("Bayville");
        const detached = await manager.run({ operation: "detach", path: disk("a.vhdx") });
        log("detach", { route: detached.route, ok: detached.ok, message: detached.message });
        expect(detached.ok).toBe(true);
    });

    it("reads size, type, identifier, alignment and the smallest safe size through the API", async () => {
        const info = await manager.describe(disk("a.vhdx"));
        log("describe", info.details);
        expect(info.ok).toBe(true);
        expect(info.details?.["virtualSize"]).toBe(256 * MIB);
        expect(info.details?.["type"]).toBe("dynamic");
        expect(String(info.details?.["identifier"])).toMatch(/^[0-9a-f-]{36}$/u);
        expect(Number(info.details?.["smallestSafeSize"])).toBeGreaterThan(0);
        expect(Number(info.details?.["smallestSafeSize"])).toBeLessThanOrEqual(256 * MIB);
    });

    it("grows and then shrinks to the smallest safe size without Hyper-V", async () => {
        const grown = await manager.run({ operation: "grow", path: disk("a.vhdx"), sizeBytes: 320 * MIB, route: "virtdisk" });
        log("grow", { route: grown.route, ok: grown.ok, message: grown.message, size: grown.details?.["virtualSize"] });
        expect(grown.ok).toBe(true);
        expect(grown.details?.["virtualSize"]).toBe(320 * MIB);
        const shrunk = await manager.run({ operation: "shrink", path: disk("a.vhdx"), smallestSafe: true });
        log("shrink", { route: shrunk.route, ok: shrunk.ok, message: shrunk.message, size: shrunk.details?.["virtualSize"], smallest: shrunk.details?.["smallestSafeSize"] });
        expect(shrunk.route).toBe("virtdisk");
        expect(shrunk.ok).toBe(true);
        expect(Number(shrunk.details?.["virtualSize"])).toBeLessThan(320 * MIB);
    });

    it("gives the disk a new identifier", async () => {
        const before = String((await manager.describe(disk("a.vhdx"))).details?.["identifier"]);
        const after = await manager.run({ operation: "identity", path: disk("a.vhdx") });
        log("identity", { route: after.route, ok: after.ok, message: after.message, before, after: after.details?.["identifier"] });
        expect(after.ok).toBe(true);
        expect(after.details?.["identifier"]).not.toBe(before);
    });

    it("sets, lists and deletes custom metadata", async () => {
        const key = "6c1e41b2-9a0f-4d7e-8c11-5b0a2f9e77d3";
        const set = await manager.run({ operation: "metadata", path: disk("a.vhdx"), metadata: { action: "set", key, valueBase64: Buffer.from("Bayville main map").toString("base64") } });
        log("metadata set", { ok: set.ok, message: set.message, details: set.details });
        expect(set.ok).toBe(true);
        expect(JSON.stringify(set.details)).toContain(key);
        const removed = await manager.run({ operation: "metadata", path: disk("a.vhdx"), metadata: { action: "delete", key } });
        expect(removed.ok).toBe(true);
        expect(JSON.stringify(removed.details)).not.toContain(key);
    });

    it("turns on change tracking and reports changed ranges", async () => {
        const on = await manager.run({ operation: "changeTracking", path: disk("a.vhdx"), changeTracking: { action: "enable" } });
        log("change tracking", { ok: on.ok, message: on.message, enabled: on.details?.["changeTracking"], id: on.details?.["changeTrackingId"] });
        expect(on.ok).toBe(true);
        expect(on.details?.["changeTracking"]).toBe(true);
        const id = String(on.details?.["changeTrackingId"] ?? "");
        const query = await manager.run({ operation: "changeTracking", path: disk("a.vhdx"), changeTracking: { action: "query", changeTrackingId: id } });
        log("query changes", { ok: query.ok, message: query.message, ranges: query.details?.["ranges"] });
        expect(query.ok).toBe(true);
        const off = await manager.run({ operation: "changeTracking", path: disk("a.vhdx"), changeTracking: { action: "disable" } });
        expect(off.ok).toBe(true);
    });

    it("compacts in Quick and Full mode", async () => {
        for (const mode of ["Quick", "Full"] as const) {
            const result = await manager.run({ operation: "compact", path: disk("a.vhdx"), mode, route: "virtdisk" });
            log(`compact ${mode}`, { ok: result.ok, message: result.message, physical: result.details?.["physicalSize"] });
            expect(result.ok).toBe(true);
        }
    });

    it("converts a VHDX to a fixed VHD and the copy keeps the files", async () => {
        const result = await manager.run({ operation: "convert", path: disk("a.vhdx"), destination: disk("a-copy.vhd"), targetType: "fixed" });
        log("convert", { route: result.route, ok: result.ok, message: result.message, type: result.details?.["type"], size: result.details?.["virtualSize"] });
        expect(result.ok).toBe(true);
        expect(result.details?.["type"]).toBe("fixed");
        const mount = disk("mount-copy");
        await fs.mkdir(mount);
        const ps = `$i = Mount-DiskImage -ImagePath '${disk("a-copy.vhd")}' -NoDriveLetter -PassThru; $p = Get-Partition -DiskNumber ($i | Get-Disk).Number | Where-Object Type -eq 'Basic' | Select-Object -First 1; Add-PartitionAccessPath -DiskNumber $p.DiskNumber -PartitionNumber $p.PartitionNumber -AccessPath '${mount}\\'`;
        execFileSync("powershell.exe", ["-NoProfile", "-Command", ps]);
        expect(await fs.readFile(path.join(mount, "hello.txt"), "utf8")).toBe("Bayville");
        execFileSync("powershell.exe", ["-NoProfile", "-Command", `Dismount-DiskImage -ImagePath '${disk("a-copy.vhd")}' | Out-Null`]);
    });

    it("creates a differencing child, reconnects its parent and merges it back", async () => {
        const child = await manager.run({ operation: "create", path: disk("child.avhdx"), route: "virtdisk", create: { path: disk("child.avhdx"), format: "vhdx", type: "differencing", sizeBytes: 0, parentPath: disk("a.vhdx") } });
        log("differencing", { ok: child.ok, message: child.message, type: child.details?.["type"], parents: child.details?.["parentPaths"] });
        expect(child.ok).toBe(true);
        expect(child.details?.["type"]).toBe("differencing");
        const reparent = await manager.run({ operation: "reparent", path: disk("child.avhdx"), parentPath: disk("a.vhdx") });
        log("reparent", { ok: reparent.ok, message: reparent.message });
        expect(reparent.ok).toBe(true);
        const merged = await manager.run({ operation: "merge", path: disk("child.avhdx"), depth: 1, route: "virtdisk" });
        log("merge", { ok: merged.ok, message: merged.message });
        expect(merged.ok).toBe(true);
    });

    it("creates a VHD Set and takes, applies and deletes a checkpoint", async () => {
        const set = await manager.run({ operation: "create", path: disk("s.vhds"), route: "virtdisk", create: { path: disk("s.vhds"), format: "vhdset", type: "dynamic", sizeBytes: 64 * MIB } });
        log("vhd set", { ok: set.ok, message: set.message });
        expect(set.ok).toBe(true);
        const taken = await manager.run({ operation: "checkpoint", path: disk("s.vhds"), checkpoint: { action: "take" } });
        log("checkpoint take", { ok: taken.ok, message: taken.message, id: taken.details?.["checkpointId"] });
        expect(taken.ok).toBe(true);
        const id = String(taken.details?.["checkpointId"]);
        const applied = await manager.run({ operation: "checkpoint", path: disk("s.vhds"), checkpoint: { action: "apply", checkpointId: id } });
        log("checkpoint apply", { ok: applied.ok, message: applied.message, variant: applied.details?.["variant"] });
        expect(applied.ok).toBe(true);
        const deleted = await manager.run({ operation: "checkpoint", path: disk("s.vhds"), checkpoint: { action: "delete", checkpointId: id } });
        log("checkpoint delete", { ok: deleted.ok, message: deleted.message });
        expect(deleted.ok).toBe(true);
    });

    it("mirrors a disk to a new independent file", async () => {
        const result = await manager.run({ operation: "mirror", path: disk("a.vhdx"), destination: disk("mirror.vhdx") });
        log("mirror", { ok: result.ok, message: result.message, size: result.details?.["virtualSize"] });
        expect(result.ok).toBe(true);
        expect(existsSync(disk("mirror.vhdx"))).toBe(true);
    });

    it("Quick packs a folder into a verified VHDX beside it", async () => {
        const src = disk("Photos");
        await fs.mkdir(path.join(src, "2019"), { recursive: true });
        await fs.writeFile(path.join(src, "a.txt"), "alpha");
        await fs.writeFile(path.join(src, "2019", "b.bin"), Buffer.alloc(3 * 1024 * 1024, 7));
        const result = await manager.quickPack([src], () => undefined);
        log("quick pack", { ok: result.ok, message: result.message, verified: result.verified, size: result.virtualBytes });
        expect(result.ok).toBe(true);
        expect(result.partial).toBe(false);
        expect(result.verified).toBe(2);
        expect(path.basename(result.path!)).toBe("Photos.vhdx");
    });

    const devDriveSupported = enabled && (() => {
        try {
            return execFileSync("powershell.exe", ["-NoProfile", "-Command", "(Get-Command Format-Volume).Parameters.ContainsKey('DevDrive')"]).toString().trim() === "True";
        } catch {
            return false;
        }
    })();

    it.runIf(devDriveSupported)("makes an empty VHDX into a Dev Drive", async () => {
        const created = await manager.run({ operation: "create", path: disk("dev.vhdx"), route: "virtdisk", create: { path: disk("dev.vhdx"), format: "vhdx", type: "dynamic", sizeBytes: 52 * 1024 * MIB } });
        expect(created.ok).toBe(true);
        const dev = await manager.run({ operation: "devdrive", path: disk("dev.vhdx"), devDriveLabel: "WLDev" });
        log("dev drive", { ok: dev.ok, message: dev.message, details: dev.details });
        expect(dev.ok).toBe(true);
        expect(dev.details?.["fileSystem"]).toBe("ReFS");
    });
});
