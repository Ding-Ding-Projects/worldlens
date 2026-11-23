import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DiskScriptRunner, ScriptOutcome } from "../vdisk/runner.js";
import { ApplianceBuilder, stepPlan, type ApplianceDeps } from "./builder.js";
import { chooseBridgeAdapter, detectTool, ipFromArp, parseBridgedAdapters, parseGuestIp, virtualBoxCreatePlan, type CommandRunner } from "./commands.js";
import { MIB, SECTOR, writePartition } from "./mbr.js";
import { InstanceRegistry } from "./registry.js";
import { validateRequest, type ApplianceProgress, type ApplianceRequest } from "./types.js";
import { checkUsbChoice, parseUsbDisks, usbWriteScript, runUsbWrite } from "./usb.js";
import { readBundledBase } from "./ipc.js";

let dir = "";
let base = { path: "", sha256: "" };
let mapRoot = "";

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "wl-appliance-b-"));
    const image = Buffer.alloc(3 * MIB);
    writePartition(image, 0, { bootable: true, type: 0x83, startLba: 2048, sectors: 2048 });
    image.writeUInt16LE(0xaa55, 510);
    base = { path: path.join(dir, "base.img"), sha256: createHash("sha256").update(image).digest("hex") };
    await writeFile(base.path, image);
    mapRoot = path.join(dir, "map-src");
    await mkdir(mapRoot, { recursive: true });
    await writeFile(path.join(mapRoot, "index.html"), "<html></html>");
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

interface Call {
    file: string;
    args: readonly string[];
}

function fakeRunner(script: (call: Call) => { code: number; stdout?: string; stderr?: string } | undefined): { runner: CommandRunner; calls: Call[] } {
    const calls: Call[] = [];
    return {
        calls,
        runner: {
            run: async (file, args) => {
                const call = { file, args };
                calls.push(call);
                const r = script(call) ?? { code: 0 };
                return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
            },
        },
    };
}

function request(partial: Partial<ApplianceRequest>): ApplianceRequest {
    return { target: "vmware", mapRoot, vmName: "worldlens-test", network: "bridged", memoryMb: 1024, cpus: 2, hostName: "worldlens-map", port: 80, accessCode: "abcd1234", ...partial };
}

function deps(runner: CommandRunner, extra: Partial<ApplianceDeps> = {}): ApplianceDeps {
    return {
        root: path.join(dir, "work"),
        base: async () => base,
        runner,
        diskRunner: null,
        registry: new InstanceRegistry(path.join(dir, "work")),
        vocabulary: async () => ({}),
        exists: () => true,
        health: async () => true,
        resolveMdns: async () => null,
        sleep: async () => undefined,
        ...extra,
    };
}

describe("request validation", () => {
    it("accepts a good VM request and names exactly what is wrong otherwise", () => {
        expect(validateRequest(request({}))).toBeNull();
        expect(validateRequest(request({ hostName: "Bad Name" }))).toMatch(/host name/);
        expect(validateRequest(request({ port: 70000 }))).toMatch(/port/);
        expect(validateRequest(request({ memoryMb: 64 }))).toMatch(/Memory/);
        expect(validateRequest(request({ accessCode: "ab" }))).toMatch(/access code/);
        expect(validateRequest(request({ target: "usb" }))).toMatch(/USB/);
        expect(validateRequest(request({ target: "export" }))).toMatch(/format/);
        expect(validateRequest(request({ vmName: "bad/../name" }))).toMatch(/name/);
    });
    it("lists the board's steps per target", () => {
        expect(stepPlan("vmware").map((s) => s.id)).toEqual(["base", "pack", "disk", "create", "boot", "check"]);
        expect(stepPlan("usb").map((s) => s.id)).toEqual(["base", "pack", "write", "readback", "safe"]);
        expect(stepPlan("export").map((s) => s.id)).toEqual(["base", "pack", "format", "notes"]);
    });
});

describe("tool detection and command plans", () => {
    it("reports found with the version, or missing", async () => {
        const { runner } = fakeRunner((c) => (c.file.includes("vmrun") ? { code: 0, stdout: "vmrun version 17.6.0 build-1234" } : { code: 0, stdout: "7.1.4r165100\n" }));
        const vm = await detectTool("vmware", runner, () => true);
        expect(vm).toMatchObject({ found: true, version: "17.6.0" });
        const vb = await detectTool("virtualbox", runner, () => true);
        expect(vb.version).toBe("7.1.4");
        expect(await detectTool("vmware", runner, () => false)).toEqual({ id: "vmware", found: false, path: null, version: null });
    });
    it("builds the VirtualBox plan with a bridged adapter, or NAT plus a port forward, by version", () => {
        const input = { vboxmanage: "VBoxManage", name: "wl", folder: "D:/f", vmdk: "D:/f/wl.vmdk", memoryMb: 1024, cpus: 2, hostPort: 8080, guestPort: 80, majorVersion: 7 };
        const bridged = virtualBoxCreatePlan({ ...input, network: "bridged", bridgeAdapter: "Intel(R) Ethernet" });
        expect(bridged.map((p) => p.args[0])).toEqual(["createvm", "modifyvm", "storagectl", "storageattach", "startvm"]);
        const modify = bridged[1]?.args.join(" ") ?? "";
        expect(modify).toContain("--nic1 bridged --bridgeadapter1 Intel(R) Ethernet --nic-type1 82540EM");
        expect(modify).toContain("--memory 1024 --cpus 2");
        const nat = virtualBoxCreatePlan({ ...input, network: "nat", bridgeAdapter: null, majorVersion: 6 });
        expect(nat[1]?.args).toContain("--nictype1");
        expect(nat.some((p) => p.args.includes("--natpf1") && p.args.includes("web,tcp,,8080,,80"))).toBe(true);
    });
    it("parses adapters, picks the default-route adapter, and finds addresses", () => {
        const names = parseBridgedAdapters("Name:            Intel(R) Ethernet\nGUID: x\n\nName:            Wi-Fi\n");
        expect(names).toEqual(["Intel(R) Ethernet", "Wi-Fi"]);
        expect(chooseBridgeAdapter(names, "Wi-Fi")).toBe("Wi-Fi");
        expect(chooseBridgeAdapter(names, "unknown")).toBe("Intel(R) Ethernet");
        expect(chooseBridgeAdapter([], "x")).toBeNull();
        expect(parseGuestIp("192.0.2.141\n")).toBe("192.0.2.141");
        expect(parseGuestIp("0.0.0.0")).toBeNull();
        expect(ipFromArp("  192.0.2.55           aa-bb-cc-00-11-22     dynamic", "AA:BB:CC:00:11:22")).toBe("192.0.2.55");
    });
});

describe("VMware build", () => {
    it("writes the disk, descriptor and vmx, starts it with vmrun, asks for the address and verifies the link", async () => {
        const urls: string[] = [];
        const { runner, calls } = fakeRunner((c) => {
            if (c.args.includes("getGuestIPAddress")) return { code: 0, stdout: "192.0.2.141\n" };
            if (c.file.includes("vmrun") && c.args.length === 0) return { code: 0, stdout: "vmrun version 17.6.0" };
            return { code: 0 };
        });
        const builder = new ApplianceBuilder(deps(runner, { health: async (u) => { urls.push(u); return true; } }));
        const events: ApplianceProgress[] = [];
        const result = await builder.build(request({}), (p) => events.push(p));
        expect(result).toMatchObject({ ok: true, link: "http://192.0.2.141/", cancelled: false });
        expect(urls).toEqual(["http://192.0.2.141/health"]);
        expect(calls.some((c) => c.args.join(" ").includes("-T ws start") && c.args.includes("nogui"))).toBe(true);
        expect(result.steps.every((s) => s.state === "done")).toBe(true);
        expect(events.length).toBeGreaterThan(6);
        const instances = await builder.instances();
        expect(instances).toHaveLength(1);
        const vmx = await readFile(instances[0]?.handle ?? "", "utf8");
        expect(vmx).toContain('memsize = "1024"');
        const folder = instances[0]?.folder ?? "";
        expect((await readFile(path.join(folder, "worldlens-test.vmdk"), "utf8"))).toContain("monolithicFlat");
        expect((await stat(path.join(folder, "worldlens-test.img"))).size % MIB).toBe(0);
    });
    it("does not report ready when the link does not answer, and says so", async () => {
        const { runner } = fakeRunner((c) => (c.args.includes("getGuestIPAddress") ? { code: 0, stdout: "192.0.2.141" } : c.args.length === 0 ? { code: 0, stdout: "vmrun version 17" } : { code: 0 }));
        const builder = new ApplianceBuilder(deps(runner, { health: async () => false }));
        const result = await builder.build(request({}), () => undefined);
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/did not answer/);
        expect(result.steps.find((s) => s.id === "check")?.state).toBe("failed");
        // The VM exists and is still running, so it is recorded: the instance list is the only
        // place a person can stop and remove it.
        const kept = await builder.instances();
        expect(kept).toHaveLength(1);
        expect(result.instanceId).toBe(kept[0]?.id);
    });
    it("fails plainly when the tool is missing or vmrun refuses", async () => {
        const missing = new ApplianceBuilder(deps(fakeRunner(() => undefined).runner, { exists: () => false }));
        expect((await missing.build(request({}), () => undefined)).message).toMatch(/not found/);
        const { runner } = fakeRunner((c) => (c.args.includes("start") ? { code: 1, stderr: "Error: boom" } : c.args.length === 0 ? { code: 0, stdout: "vmrun version 17" } : { code: 0 }));
        const refused = await new ApplianceBuilder(deps(runner)).build(request({}), () => undefined);
        expect(refused.ok).toBe(false);
        expect(refused.message).toContain("boom");
    });
    it("refuses a base whose checksum is wrong before anything is started", async () => {
        const { runner, calls } = fakeRunner(() => undefined);
        const builder = new ApplianceBuilder(deps(runner, { base: async () => ({ path: base.path, sha256: "0".repeat(64) }) }));
        const result = await builder.build(request({}), () => undefined);
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/checksum/);
        expect(calls).toHaveLength(0);
    });
});

describe("VirtualBox build and the instance manager", () => {
    it("creates, starts, reads the guest property, verifies the link, and removes only what it created", async () => {
        const { runner, calls } = fakeRunner((c) => {
            if (c.args[0] === "--version") return { code: 0, stdout: "7.1.4r1\n" };
            if (c.args[0] === "list") return { code: 0, stdout: "Name:            Intel(R) Ethernet\n" };
            if (c.args[0] === "guestproperty") return { code: 0, stdout: "Value: 192.0.2.77\n" };
            return { code: 0 };
        });
        const builder = new ApplianceBuilder(deps(runner));
        const result = await builder.build(request({ target: "virtualbox", vmName: "wl-box" }), () => undefined);
        expect(result.ok).toBe(true);
        expect(result.link).toBe("http://192.0.2.77/");
        expect(calls.some((c) => c.args[0] === "startvm" && c.args.includes("headless"))).toBe(true);
        const [instance] = await builder.instances();
        expect(instance?.target).toBe("virtualbox");
        await builder.remove(instance?.id ?? "");
        expect(calls.some((c) => c.args[0] === "unregistervm" && c.args.includes("--delete"))).toBe(true);
        expect(await builder.instances()).toHaveLength(0);
        await expect(stat(instance?.folder ?? "")).rejects.toThrow();
        await expect(builder.remove("not-ours")).rejects.toThrow(/not one this tool created/);
    });
    it("uses 127.0.0.1 and the forwarded port for NAT, and cleans up a failed create", async () => {
        const { runner, calls } = fakeRunner((c) => (c.args[0] === "--version" ? { code: 0, stdout: "7.0.0" } : c.args[0] === "storagectl" ? { code: 1, stderr: "bad" } : { code: 0 }));
        const failed = await new ApplianceBuilder(deps(runner)).build(request({ target: "virtualbox", network: "nat", port: 8080 }), () => undefined);
        expect(failed.ok).toBe(false);
        expect(calls.some((c) => c.args[0] === "unregistervm")).toBe(true);
        const ok = fakeRunner((c) => (c.args[0] === "--version" ? { code: 0, stdout: "7.0.0" } : { code: 0 }));
        const good = await new ApplianceBuilder(deps(ok.runner)).build(request({ target: "virtualbox", network: "nat", port: 8080 }), () => undefined);
        expect(good.link).toBe("http://127.0.0.1:8080/");
    });
});

describe("export target", () => {
    it("saves the chosen format with its checksum and note, and leaves no work folder behind", async () => {
        const out = path.join(dir, "export-out");
        const builder = new ApplianceBuilder(deps(fakeRunner(() => undefined).runner));
        const result = await builder.build(request({ target: "export", exportFormat: "vhdx", exportDir: out }), () => undefined);
        expect(result).toMatchObject({ ok: true, link: null });
        expect(result.path).toBe(path.join(out, "worldlens-test.vhdx"));
        expect(await readFile(path.join(out, "SHA256SUMS"), "utf8")).toContain("worldlens-test.vhdx");
        await expect(stat(path.join(dir, "work", "vms"))).resolves.toBeTruthy();
    });
});

describe("usb target", () => {
    const disk = { number: 3, name: "SanDisk Ultra", sizeBytes: 32_000_000_000 };
    it("parses the PowerShell list, one disk or many, and ignores junk", () => {
        expect(parseUsbDisks('{"Number":3,"FriendlyName":"SanDisk Ultra ","Size":32000000000}')).toEqual([disk]);
        expect(parseUsbDisks('[{"Number":3,"FriendlyName":"A","Size":1},{"Number":"x"}]')).toHaveLength(1);
        expect(parseUsbDisks("")).toEqual([]);
        expect(parseUsbDisks("not json")).toEqual([]);
    });
    it("checks the typed name, the list and the size before asking for permission", () => {
        expect(checkUsbChoice([disk], 3, "sandisk ultra", 1000).ok).toBe(true);
        expect(checkUsbChoice([disk], 9, "x", 1000)).toMatchObject({ ok: false, reason: "unknown-disk" });
        expect(checkUsbChoice([disk], 3, "wrong", 1000)).toMatchObject({ ok: false, reason: "name-mismatch" });
        expect(checkUsbChoice([disk], 3, "", 1000)).toMatchObject({ ok: false });
        expect(checkUsbChoice([disk], 3, "SanDisk Ultra", 64_000_000_000)).toMatchObject({ ok: false, reason: "too-small" });
    });
    it("builds a script that re-checks the live disk and quotes the name safely", () => {
        const script = usbWriteScript({ diskNumber: 3, diskName: "O'Brien Drive", imagePath: "C:\\img\\a.img", imageBytes: 1048576 });
        expect(script).toContain("$d.BusType -notin @('USB','SD','MMC')");
        expect(script).toContain("$d.IsBoot -or $d.IsSystem");
        expect(script).toContain("'O''Brien Drive'");
        expect(script).toContain("PhysicalDrive");
        expect(script).toContain("READBACK:");
    });
    function disks(outcome: ScriptOutcome, listing = `{"Number":3,"FriendlyName":"SanDisk Ultra","Size":32000000000}`): { runner: DiskScriptRunner; scripts: string[] } {
        const scripts: string[] = [];
        return { scripts, runner: { query: async () => listing, diskpart: async () => outcome, elevatedPowerShell: async (s) => (scripts.push(s), outcome) } };
    }
    it("never claims success when the elevated script prints no read-back", async () => {
        const fake = disks({ ok: true, cancelled: false, output: "", exitCode: 0 });
        const builder = new ApplianceBuilder(deps(fakeRunner(() => undefined).runner, { diskRunner: fake.runner }));
        const probe = await builder.build(request({ target: "usb", usbDiskNumber: 3, usbConfirmName: "SanDisk Ultra" }), () => undefined);
        expect(probe.ok).toBe(false);
        expect(probe.message).toMatch(/failed|did not match/);
        const size = /\$left = (\d+)/u.exec(fake.scripts[0] ?? "")?.[1] ?? "";
        expect(size).not.toBe("");
        expect(fake.scripts).toHaveLength(1);
    });
    it("passes with a matching read-back, and a declined permission prompt is incomplete with nothing claimed", async () => {
        const good = await runUsbWrite({ query: async () => "", diskpart: async () => ({ ok: true, cancelled: false, output: "", exitCode: 0 }), elevatedPowerShell: async () => ({ ok: true, cancelled: false, output: `READBACK:${"a".repeat(64)}`, exitCode: 0 }) }, "x", "a".repeat(64));
        expect(good).toEqual({ ok: true, readbackSha256: "a".repeat(64) });
        const mismatch = await runUsbWrite({ query: async () => "", diskpart: async () => ({ ok: true, cancelled: false, output: "", exitCode: 0 }), elevatedPowerShell: async () => ({ ok: true, cancelled: false, output: `READBACK:${"b".repeat(64)}`, exitCode: 0 }) }, "x", "a".repeat(64));
        expect(mismatch).toMatchObject({ ok: false, cancelled: false });
        const fake = disks({ ok: false, cancelled: true, output: "declined", exitCode: null });
        const builder = new ApplianceBuilder(deps(fakeRunner(() => undefined).runner, { diskRunner: fake.runner }));
        const result = await builder.build(request({ target: "usb", usbDiskNumber: 3, usbConfirmName: "SanDisk Ultra" }), () => undefined);
        expect(result).toMatchObject({ ok: false, cancelled: true, link: null });
        expect(result.steps.find((s) => s.id === "readback")?.state).not.toBe("done");
        const refused = await builder.build(request({ target: "usb", usbDiskNumber: 3, usbConfirmName: "Wrong name" }), () => undefined);
        expect(refused.ok).toBe(false);
        expect(fake.scripts).toHaveLength(1);
    });
    it("is unavailable without a disk runner (not Windows)", async () => {
        const result = await new ApplianceBuilder(deps(fakeRunner(() => undefined).runner, { diskRunner: null })).build(request({ target: "usb", usbDiskNumber: 3, usbConfirmName: "x" }), () => undefined);
        expect(result.message).toMatch(/Windows only/);
    });
});

describe("bundled base", () => {
    it("reads base.json, refuses a path-like file name and a missing file", async () => {
        const res = path.join(dir, "res");
        await mkdir(path.join(res, "appliance"), { recursive: true });
        await writeFile(path.join(res, "appliance", "base.img"), "x");
        await writeFile(path.join(res, "appliance", "base.json"), JSON.stringify({ file: "base.img", sha256: "a".repeat(64) }));
        expect(await readBundledBase(res)).toEqual({ path: path.join(res, "appliance", "base.img"), sha256: "a".repeat(64) });
        await writeFile(path.join(res, "appliance", "base.json"), JSON.stringify({ file: "../x", sha256: "a".repeat(64) }));
        expect(await readBundledBase(res)).toBeNull();
        expect(await readBundledBase(path.join(dir, "nowhere"))).toBeNull();
    });
});

void SECTOR;
