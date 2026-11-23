import * as dns from "node:dns/promises";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { DiskScriptRunner } from "../vdisk/runner.js";
import { composeDisk, resolveMapDirectory, sha256File } from "./compose.js";
import {
    chooseBridgeAdapter,
    DEFAULT_ROUTE_QUERY,
    detectTool,
    parseBridgedAdapters,
    parseGuestIp,
    type CommandRunner,
    type Planned,
    virtualBoxCreatePlan,
    virtualBoxGuestIp,
    virtualBoxRemove,
    virtualBoxStop,
    vmwareGuestIp,
    vmwareStart,
    vmwareStop,
} from "./commands.js";
import { writeExport } from "./exportFormats.js";
import { buildMapConfig } from "./mapConfig.js";
import type { InstanceRegistry } from "./registry.js";
import { checkUsbChoice, listUsbDisks, runUsbWrite, usbWriteScript } from "./usb.js";
import {
    validateRequest,
    type ApplianceInstance,
    type ApplianceProgress,
    type ApplianceRequest,
    type ApplianceResult,
    type ApplianceStep,
    type ApplianceTarget,
    type ToolStatus,
    type UsbDisk,
} from "./types.js";
import { flatVmdkDescriptor, vmxText } from "./vmdk.js";

export interface ApplianceDeps {
    /** Working folder under the app's own data directory: composed images and created VMs live here. */
    readonly root: string;
    /** The bundled, build-time-pinned base image and its checksum, or null when this build carries none. */
    readonly base: () => Promise<{ readonly path: string; readonly sha256: string } | null>;
    readonly runner: CommandRunner;
    readonly diskRunner: DiskScriptRunner | null;
    readonly registry: InstanceRegistry;
    /** The person's own vocabulary entries, empty when none is loaded. Never logged. */
    readonly vocabulary: () => Promise<Readonly<Record<string, string>>>;
    readonly exists?: (file: string) => boolean;
    /** Resolves true once `url` answers 200 before `timeoutMs` runs out. */
    readonly health?: (url: string, timeoutMs: number) => Promise<boolean>;
    readonly resolveMdns?: (host: string) => Promise<string | null>;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly now?: () => Date;
}

const STEP_LABELS = {
    base: "Bundled appliance base (Alpine, Docker, map server)",
    pack: "Pack the map onto a data partition",
    disk: "Make the virtual disk",
    create: "Create and start the virtual machine",
    boot: "Wait for it to boot and report its address",
    check: "Check the link from this PC",
    write: "Write the drive",
    readback: "Read back and compare",
    safe: "Safe to remove",
    format: "Write the chosen format",
    notes: "Write the checksum and install note",
} as const;

type StepId = keyof typeof STEP_LABELS;

const PLANS: Record<ApplianceTarget, readonly StepId[]> = {
    vmware: ["base", "pack", "disk", "create", "boot", "check"],
    virtualbox: ["base", "pack", "disk", "create", "boot", "check"],
    usb: ["base", "pack", "write", "readback", "safe"],
    export: ["base", "pack", "format", "notes"],
};

export function stepPlan(target: ApplianceTarget): ApplianceStep[] {
    return PLANS[target].map((id) => ({ id, label: STEP_LABELS[id], state: "pending", meta: "" }));
}

class Progress {
    steps: ApplianceStep[];
    constructor(private readonly target: ApplianceTarget, private readonly emit: (p: ApplianceProgress) => void) {
        this.steps = stepPlan(target);
        this.push();
    }
    private push(): void {
        this.emit({ target: this.target, steps: this.steps.map((s) => ({ ...s })) });
    }
    set(id: StepId, state: ApplianceStep["state"], meta = ""): void {
        this.steps = this.steps.map((s) => (s.id === id ? { ...s, state, meta } : s));
        this.push();
    }
    /** Marks whatever is running as failed, with the reason. */
    fail(meta: string): void {
        const running = this.steps.find((s) => s.state === "running") ?? this.steps.find((s) => s.state === "pending");
        if (running) this.set(running.id as StepId, "failed", meta);
    }
}

const mb = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`;
const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "appliance";

export class ApplianceBuilder {
    private readonly exists: (file: string) => boolean;
    constructor(private readonly deps: ApplianceDeps) {
        this.exists = deps.exists ?? existsSync;
    }

    async tools(): Promise<ToolStatus[]> {
        const exists = this.exists;
        return await Promise.all((["vmware", "virtualbox"] as const).map((id) => detectTool(id, this.deps.runner, exists)));
    }

    usbDisks(): Promise<UsbDisk[]> {
        return listUsbDisks(this.deps.diskRunner);
    }

    async build(request: ApplianceRequest, emit: (progress: ApplianceProgress) => void): Promise<ApplianceResult> {
        const invalid = validateRequest(request);
        const progress = new Progress(request.target, emit);
        const result = (partial: Partial<ApplianceResult> & { ok: boolean; message: string }): ApplianceResult => ({
            cancelled: false,
            target: request.target,
            link: null,
            path: null,
            instanceId: null,
            steps: progress.steps,
            ...partial,
        });
        if (invalid) return result({ ok: false, message: invalid });
        try {
            return await this.run(request, progress, result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            progress.fail(message.slice(0, 160));
            return result({ ok: false, message });
        }
    }

    private async run(request: ApplianceRequest, progress: Progress, result: (p: Partial<ApplianceResult> & { ok: boolean; message: string }) => ApplianceResult): Promise<ApplianceResult> {
        const base = await this.deps.base();
        if (!base) return result({ ok: false, message: "This build of Worldlens does not carry the appliance base image. Run the fetch-appliance-base script and rebuild." });

        const workName = `${slug(request.vmName || request.hostName)}-${(this.deps.now?.() ?? new Date()).getTime().toString(36)}`;
        const folder = path.join(this.deps.root, "vms", workName);
        const rawName = `${slug(request.vmName || request.hostName)}.img`;
        const rawPath = path.join(folder, rawName);
        const tidy = request.target === "usb" || request.target === "export";

        progress.set("base", "running");
        const mapDirectory = await resolveMapDirectory(request.mapRoot);
        const vocabulary = await this.deps.vocabulary();
        const config = buildMapConfig({ hostName: request.hostName, port: request.port, accessCode: request.accessCode, vocabulary, now: this.deps.now?.() });
        const composed = await composeDisk({
            baseImage: base.path,
            baseSha256: base.sha256,
            mapDirectory,
            config,
            outFile: rawPath,
            onStep: (step, info) => {
                if (step === "base-verified") {
                    progress.set("base", "done", `${mb(info.bytes)} · sha256 ok`);
                    progress.set("pack", "running");
                } else if (step === "packed") progress.set("pack", "done", mb(info.bytes));
            },
        });

        try {
            if (request.target === "vmware" || request.target === "virtualbox") return await this.runVm(request, progress, result, folder, rawName, composed.bytes);
            if (request.target === "usb") return await this.runUsb(request, progress, result, composed.path, composed.bytes, composed.sha256);
            return await this.runExport(request, progress, result, composed.path);
        } finally {
            if (tidy) await fs.rm(folder, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    private async runExport(request: ApplianceRequest, progress: Progress, result: (p: Partial<ApplianceResult> & { ok: boolean; message: string }) => ApplianceResult, raw: string): Promise<ApplianceResult> {
        const format = request.exportFormat ?? "img";
        progress.set("format", "running");
        const out = await writeExport({ raw, directory: request.exportDir ?? "", baseName: slug(request.vmName || request.hostName), format, hostName: request.hostName, port: request.port, hasAccessCode: request.accessCode !== null, memoryMb: request.memoryMb, cpus: request.cpus });
        const main = out.files[0];
        progress.set("format", "done", `.${format} · ${mb(main?.bytes ?? 0)}`);
        progress.set("notes", "done", "SHA256SUMS · INSTALL.txt");
        return result({ ok: true, message: "The image is saved", path: out.primary, link: null });
    }

    private async runUsb(request: ApplianceRequest, progress: Progress, result: (p: Partial<ApplianceResult> & { ok: boolean; message: string }) => ApplianceResult, raw: string, bytes: number, sha: string): Promise<ApplianceResult> {
        if (!this.deps.diskRunner) return result({ ok: false, message: "Writing a USB drive is available on Windows only." });
        const disks = await this.usbDisks();
        const choice = checkUsbChoice(disks, request.usbDiskNumber ?? -1, request.usbConfirmName ?? "", bytes);
        if (!choice.ok) {
            progress.fail(choice.message);
            return result({ ok: false, message: choice.message });
        }
        progress.set("write", "running");
        const outcome = await runUsbWrite(this.deps.diskRunner, usbWriteScript({ diskNumber: choice.disk.number, diskName: choice.disk.name, imagePath: raw, imageBytes: bytes }), sha);
        if (!outcome.ok) {
            progress.fail(outcome.message.slice(0, 160));
            return result({ ok: false, cancelled: outcome.cancelled, message: outcome.message });
        }
        progress.set("write", "done", mb(bytes));
        progress.set("readback", "done", "sha256 match");
        progress.set("safe", "done");
        return result({ ok: true, message: "The USB drive is ready", link: `http://${request.hostName}.local${request.port === 80 ? "" : `:${request.port}`}/`, path: null });
    }

    private async runVm(request: ApplianceRequest, progress: Progress, result: (p: Partial<ApplianceResult> & { ok: boolean; message: string }) => ApplianceResult, folder: string, rawName: string, bytes: number): Promise<ApplianceResult> {
        const tool = (await this.tools()).find((t) => t.id === request.target);
        if (!tool?.found || !tool.path) {
            progress.fail("not installed");
            return result({ ok: false, message: `${request.target === "vmware" ? "VMware Workstation" : "VirtualBox"} was not found on this PC. Install it, or choose Export image.` });
        }
        progress.set("disk", "running");
        const vmdkName = `${slug(request.vmName)}.vmdk`;
        const vmdkPath = path.join(folder, vmdkName);
        await fs.writeFile(vmdkPath, flatVmdkDescriptor(rawName, bytes / 512), "utf8");
        progress.set("disk", "done", mb(bytes));

        const started = Date.now();
        progress.set("create", "running");
        let handle: string;
        const ranPlans = async (plans: Planned[]): Promise<string | null> => {
            for (const p of plans) {
                const out = await this.deps.runner.run(p.file, p.args, { timeoutMs: 120_000 });
                if (out.code !== 0) return `${p.label} failed (exit ${out.code ?? "unknown"}): ${(out.stderr || out.stdout).trim().slice(-300)}`;
            }
            return null;
        };
        let guestIp: () => Promise<string | null>;
        let linkHost: string | null = null;
        let hostPortForNat: number | null = null;
        if (request.target === "vmware") {
            const vmx = path.join(folder, `${slug(request.vmName)}.vmx`);
            await fs.writeFile(vmx, vmxText({ name: request.vmName, memoryMb: request.memoryMb, cpus: request.cpus, diskFile: vmdkName, bridged: request.network === "bridged" }), "utf8");
            handle = vmx;
            const failure = await ranPlans([vmwareStart(tool.path, vmx)]);
            if (failure) {
                progress.fail(failure.slice(0, 160));
                return result({ ok: false, message: failure });
            }
            const g = vmwareGuestIp(tool.path, vmx);
            guestIp = async () => {
                const out = await this.deps.runner.run(g.file, g.args, { timeoutMs: 90_000 });
                return out.code === 0 ? parseGuestIp(out.stdout) : null;
            };
        } else {
            handle = request.vmName;
            const major = Number((tool.version ?? "7").split(".")[0]) || 7;
            let adapter: string | null = null;
            if (request.network === "bridged") {
                const list = await this.deps.runner.run(tool.path, ["list", "bridgedifs"], { timeoutMs: 20_000 });
                const route = await this.deps.runner.run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", DEFAULT_ROUTE_QUERY], { timeoutMs: 20_000 }).catch(() => null);
                adapter = chooseBridgeAdapter(parseBridgedAdapters(list.stdout), route?.stdout.trim() || null);
            }
            // A NAT port forward onto a host port something else already holds fails silently:
            // VirtualBox starts the VM anyway and the link reaches whatever owns the port.
            if (request.network === "nat" && !(await hostPortFree(request.port))) {
                progress.fail(`port ${request.port} is in use on this PC`);
                return result({ ok: false, message: `Port ${request.port} is already in use on this PC, so a NAT forward to the virtual machine could not reach it. Choose another web port, or use Bridged networking.` });
            }
            const plan = virtualBoxCreatePlan({ vboxmanage: tool.path, name: request.vmName, folder, vmdk: path.join(folder, vmdkName), memoryMb: request.memoryMb, cpus: request.cpus, network: request.network, bridgeAdapter: adapter, hostPort: request.port, guestPort: request.port, majorVersion: major });
            const failure = await ranPlans(plan);
            if (failure) {
                await this.deps.runner.run(tool.path, virtualBoxRemove(tool.path, request.vmName).args).catch(() => undefined);
                progress.fail(failure.slice(0, 160));
                return result({ ok: false, message: failure });
            }
            const g = virtualBoxGuestIp(tool.path, request.vmName);
            guestIp = async () => {
                const out = await this.deps.runner.run(g.file, g.args, { timeoutMs: 20_000 });
                return out.code === 0 ? parseGuestIp(out.stdout.replace(/^Value:\s*/mu, "")) : null;
            };
            if (request.network === "nat") {
                linkHost = "127.0.0.1";
                hostPortForNat = request.port;
            }
        }
        progress.set("create", "done", `${Math.max(1, Math.round((Date.now() - started) / 1000))} s`);

        progress.set("boot", "running");
        const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
        const bootStart = Date.now();
        let ip: string | null = linkHost;
        const deadline = bootStart + 180_000;
        while (!ip && Date.now() < deadline) {
            ip = await guestIp();
            if (!ip) {
                const resolved = await (this.deps.resolveMdns ?? defaultMdns)(`${request.hostName}.local`).catch(() => null);
                ip = resolved;
            }
            if (!ip) await sleep(3000);
        }
        // From here on the VM exists, so every outcome is recorded: a failed check still leaves a
        // running VM that the instance list must be able to stop and remove.
        const record = (link: string) => this.deps.registry.add({ target: request.target as "vmware" | "virtualbox", name: request.vmName, handle, folder, link, port: request.port, hostName: request.hostName });
        if (!ip) {
            progress.fail("no address reported");
            const kept = await record("");
            return result({ ok: false, message: "The virtual machine started but never reported an address within three minutes. It was left running so you can look at its console; remove it from the instance list when done.", instanceId: kept.id });
        }
        progress.set("boot", "done", `${Math.max(1, Math.round((Date.now() - bootStart) / 1000))} s`);

        progress.set("check", "running");
        const port = hostPortForNat ?? request.port;
        const link = `http://${ip}${port === 80 ? "" : `:${port}`}/`;
        // A first boot loads the map server image before it can answer: about a minute in
        // VirtualBox on a fast PC, so the window is generous but still bounded.
        const ok = await (this.deps.health ?? defaultHealth)(`${link}health`, 240_000);
        if (!ok) {
            progress.fail("no answer");
            const kept = await record(link);
            return result({ ok: false, message: `The virtual machine reported ${ip}, but ${link}health did not answer from this PC. The map was not reported ready. It was left running and is on the instance list, where you can open its folder (console.log) or remove it.`, instanceId: kept.id });
        }
        progress.set("check", "done", "200 OK");
        const instance = await record(link);
        return result({ ok: true, message: `The appliance is up in ${request.target === "vmware" ? "VMware" : "VirtualBox"}`, link, instanceId: instance.id });
    }

    // ---- Instance manager: only instances this tool recorded, and only the folder it created. ----

    instances(): Promise<ApplianceInstance[]> {
        return this.deps.registry.list();
    }

    private async find(id: string): Promise<ApplianceInstance> {
        const found = (await this.deps.registry.list()).find((i) => i.id === id);
        if (!found) throw new Error("That appliance is not one this tool created, so it will not touch it.");
        return found;
    }

    private async toolPath(id: ToolStatus["id"]): Promise<string> {
        const t = (await this.tools()).find((x) => x.id === id);
        if (!t?.path) throw new Error("The virtualization tool for this appliance is no longer installed.");
        return t.path;
    }

    async start(id: string): Promise<void> {
        const i = await this.find(id);
        const p = i.target === "vmware" ? vmwareStart(await this.toolPath("vmware"), i.handle) : { file: await this.toolPath("virtualbox"), args: ["startvm", i.handle, "--type", "headless"], label: "Start" };
        await this.must(p);
    }

    async stop(id: string, hard = false): Promise<void> {
        const i = await this.find(id);
        await this.must(i.target === "vmware" ? vmwareStop(await this.toolPath("vmware"), i.handle, hard) : virtualBoxStop(await this.toolPath("virtualbox"), i.handle, hard));
    }

    async remove(id: string): Promise<void> {
        const i = await this.find(id);
        await (i.target === "vmware" ? this.must(vmwareStop(await this.toolPath("vmware"), i.handle, true)) : this.must(virtualBoxStop(await this.toolPath("virtualbox"), i.handle, true))).catch(() => undefined);
        if (i.target === "virtualbox") await this.must(virtualBoxRemove(await this.toolPath("virtualbox"), i.handle)).catch(() => undefined);
        // Only ever delete inside the folder this tool owns.
        const owned = path.resolve(this.deps.root, "vms");
        const target = path.resolve(i.folder);
        if (target.startsWith(owned + path.sep)) await fs.rm(target, { recursive: true, force: true });
        await this.deps.registry.remove(id);
    }

    private async must(p: Planned): Promise<void> {
        const out = await this.deps.runner.run(p.file, p.args, { timeoutMs: 60_000 });
        if (out.code !== 0) throw new Error(`${p.label} failed: ${(out.stderr || out.stdout).trim().slice(-300)}`);
    }

    /** Verifies a base image and returns its recorded checksum (used by the fetch-script self check). */
    static hashBase(file: string): Promise<string> {
        return sha256File(file);
    }
}

async function defaultMdns(host: string): Promise<string | null> {
    try {
        const r = await dns.lookup(host, { family: 4 });
        return r.address;
    } catch {
        return null;
    }
}

/** True when nothing on this PC is listening on `port`, checked by trying to bind it. */
async function hostPortFree(port: number): Promise<boolean> {
    const net = await import("node:net");
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.listen(port, "0.0.0.0", () => server.close(() => resolve(true)));
    });
}

async function defaultHealth(url: string, timeoutMs: number): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (response.status === 200) return true;
        } catch {
            /* not up yet */
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
}
