import { describe, expect, it } from "vitest";
import {
    GIB,
    MIB,
    TIB,
    attachScript,
    createScript,
    devDriveChecks,
    formatFromPath,
    growScript,
    growTarget,
    isDroppableDisk,
    mapDiskSize,
    mergeScript,
    nextFreeName,
    powerShellEquivalent,
    quickPackSize,
    routesFor,
    validateConvert,
    validateCreate,
} from "./virtualDisk.js";

const base = { path: "D:\\Disks\\Data.vhdx", format: "vhdx" as const, type: "dynamic" as const, sizeBytes: 64 * GIB };

describe("format limits", () => {
    it("accepts a normal VHDX", () => {
        expect(validateCreate(base)).toEqual([]);
    });
    it("refuses below 3 MB", () => {
        expect(validateCreate({ ...base, sizeBytes: 2 * MIB }).map((p) => p.field)).toContain("size");
    });
    it("refuses a VHD over 2,040 GB and a VHDX over 64 TB", () => {
        expect(validateCreate({ ...base, path: "D:\\a.vhd", format: "vhd", sizeBytes: 2041 * GIB })[0]?.message).toMatch(/2 TB|2,040|1,992|2\.0 TB/u);
        expect(validateCreate({ ...base, path: "D:\\a.vhd", format: "vhd", sizeBytes: 2040 * GIB })).toEqual([]);
        expect(validateCreate({ ...base, sizeBytes: 64 * TIB })).toEqual([]);
        expect(validateCreate({ ...base, sizeBytes: 64 * TIB + MIB }).map((p) => p.field)).toEqual(["size"]);
    });
    it("checks block size, sectors, extension, parent and network paths", () => {
        expect(validateCreate({ ...base, blockSizeBytes: 3 * MIB }).map((p) => p.field)).toEqual(["blockSize"]);
        expect(validateCreate({ ...base, blockSizeBytes: 512 * MIB }).map((p) => p.field)).toEqual(["blockSize"]);
        expect(validateCreate({ ...base, blockSizeBytes: 32 * MIB })).toEqual([]);
        expect(validateCreate({ ...base, path: "D:\\a.vhd", format: "vhd", logicalSectorBytes: 4096 }).map((p) => p.field)).toEqual(["sector"]);
        expect(validateCreate({ ...base, path: "D:\\a.vhd" }).map((p) => p.field)).toEqual(["path"]);
        expect(validateCreate({ ...base, type: "differencing" }).map((p) => p.field)).toEqual(["parent"]);
        expect(validateCreate({ ...base, path: "\\\\server\\share\\a.vhdx" }).map((p) => p.field)).toEqual(["path"]);
    });
});

describe("never overwrite", () => {
    it("numbers a clashing name", () => {
        const taken = new Set(["Photos.vhdx", "Photos (1).vhdx"]);
        expect(nextFreeName("Photos", ".vhdx", (n) => taken.has(n))).toBe("Photos (2).vhdx");
        expect(nextFreeName("Maps", ".vhdx", () => false)).toBe("Maps.vhdx");
    });
});

describe("Quick pack sizing and automatic growth", () => {
    it("rounds every file to clusters and adds records and headroom", () => {
        const many = Array.from({ length: 10_000 }, () => ({ bytes: 1 }));
        const size = quickPackSize(many);
        expect(size).toBeGreaterThan(10_000 * (4096 + 1024));
        expect(size % MIB).toBe(0);
    });
    it("grows past the shortfall and stops at the format limit", () => {
        const next = growTarget(GIB, 100 * MIB);
        expect(next).not.toBeNull();
        expect(next!).toBeGreaterThanOrEqual(GIB + 100 * MIB);
        expect(growTarget(64 * TIB - MIB, 2 * MIB)).toBeNull();
    });
    it("sizes a map disk from its region count", () => {
        expect(mapDiskSize(1000)).toBeGreaterThan(mapDiskSize(10));
    });
});

describe("routes", () => {
    it("never depends on Hyper-V alone", () => {
        const home = { virtdisk: true, storage: true, diskpart: true, hyperv: false };
        for (const op of ["create", "attach", "detach", "grow", "shrink", "compact", "convert", "merge", "reparent", "identity", "checkpoint", "devdrive", "nativeboot"] as const) {
            expect(routesFor(op, home).some((r) => r.usable), op).toBe(true);
        }
        expect(routesFor("shrink", home).find((r) => r.route === "hyperv")?.usable).toBe(false);
    });
});

describe("scripts", () => {
    it("writes real DiskPart commands", () => {
        expect(createScript(base)).toBe('create vdisk file="D:\\Disks\\Data.vhdx" maximum=65536 type=expandable');
        expect(createScript({ ...base, type: "fixed", volume: { fileSystem: "ntfs", label: "Data", partitionStyle: "gpt", mount: { kind: "letter", letter: "e" } } })).toContain("assign letter=E");
        expect(attachScript("D:\\a.vhdx", true)).toBe('select vdisk file="D:\\a.vhdx"\nattach vdisk readonly');
        expect(growScript("D:\\a.vhdx", 80 * GIB, "E")).toContain("expand vdisk maximum=81920");
        expect(mergeScript("D:\\b.avhdx", 2)).toContain("merge vdisk depth=2");
        expect(powerShellEquivalent("attach", "D:\\it's.vhdx", { readOnly: true })).toBe("Mount-DiskImage -ImagePath 'D:\\it''s.vhdx' -Access ReadOnly");
    });
    it("refuses paths that would break a script", () => {
        expect(() => attachScript('D:\\a".vhdx', false)).toThrow();
    });
});

describe("conversion and Dev Drive", () => {
    it("refuses a VHDX that a VHD cannot hold", () => {
        expect(validateConvert("vhdx", 3 * TIB, "vhd")).toMatch(/at most/u);
        expect(validateConvert("vhdx", 100 * GIB, "vhd")).toBeNull();
        expect(validateConvert("iso", GIB, "vhdx")).not.toBeNull();
    });
    it("checks the documented Dev Drive requirements", () => {
        expect(devDriveChecks({ major: 10, build: 22621, revision: 2338 }, 50 * GIB, false).every((c) => c.ok)).toBe(true);
        expect(devDriveChecks({ major: 10, build: 22621, revision: 2337 }, 50 * GIB, false)[0]?.ok).toBe(false);
        expect(devDriveChecks({ major: 10, build: 26100, revision: 1 }, 49 * GIB, true).filter((c) => !c.ok)).toHaveLength(2);
    });
});

describe("paths", () => {
    it("recognises every droppable kind", () => {
        expect(["a.VHD", "a.vhdx", "a.vhds", "a.avhd", "a.avhdx", "a.iso"].every(isDroppableDisk)).toBe(true);
        expect(isDroppableDisk("a.txt")).toBe(false);
        expect(formatFromPath("x.avhdx")).toBe("vhdx");
    });
});
