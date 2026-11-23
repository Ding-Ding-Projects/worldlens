import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolStatus } from "./types.js";

export interface CommandOutcome {
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

/** Runs one program with an argument list (never through a shell). Injected so tests use a fake. */
export interface CommandRunner {
    run(file: string, args: readonly string[], options?: { readonly timeoutMs?: number }): Promise<CommandOutcome>;
}

export const nodeCommandRunner: CommandRunner = {
    run: (file, args, options) =>
        new Promise((resolve) => {
            execFile(file, [...args], { windowsHide: true, timeout: options?.timeoutMs ?? 120_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
                const code = error ? (typeof error.code === "number" ? error.code : null) : 0;
                resolve({ code, stdout: String(stdout), stderr: String(stderr) });
            });
        }),
};

const programFiles = (): string[] => [process.env["ProgramFiles"] ?? "C:\\Program Files", process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"];

export function toolCandidates(id: ToolStatus["id"]): string[] {
    if (id === "vmware") return programFiles().map((root) => path.join(root, "VMware", "VMware Workstation", "vmrun.exe"));
    const fromEnv = process.env["VBOX_MSI_INSTALL_PATH"] ? [path.join(process.env["VBOX_MSI_INSTALL_PATH"], "VBoxManage.exe")] : [];
    return [...fromEnv, ...programFiles().map((root) => path.join(root, "Oracle", "VirtualBox", "VBoxManage.exe"))];
}

export async function detectTool(id: ToolStatus["id"], runner: CommandRunner, exists: (file: string) => boolean = fs.existsSync): Promise<ToolStatus> {
    const found = toolCandidates(id).find((candidate) => exists(candidate));
    if (!found) return { id, found: false, path: null, version: null };
    const outcome = id === "vmware" ? await runner.run(found, [], { timeoutMs: 10_000 }) : await runner.run(found, ["--version"], { timeoutMs: 10_000 });
    const text = `${outcome.stdout}\n${outcome.stderr}`;
    const match = id === "vmware" ? /vmrun version\s+([0-9][0-9.]*)/iu.exec(text) : /^([0-9]+\.[0-9]+\.[0-9]+)/mu.exec(text);
    return { id, found: true, path: found, version: match?.[1] ?? null };
}

const quoteName = (value: string): string => value.replace(/[\r\n"]/gu, "");

export interface Planned {
    readonly file: string;
    readonly args: readonly string[];
    /** Short label for the step list and for failure reports. */
    readonly label: string;
}

/** VMware: start the machine without opening a window. */
export const vmwareStart = (vmrun: string, vmx: string): Planned => ({ file: vmrun, args: ["-T", "ws", "start", vmx, "nogui"], label: "Start the virtual machine" });
export const vmwareStop = (vmrun: string, vmx: string, hard: boolean): Planned => ({ file: vmrun, args: ["-T", "ws", "stop", vmx, hard ? "hard" : "soft"], label: "Stop the virtual machine" });
export const vmwareGuestIp = (vmrun: string, vmx: string): Planned => ({ file: vmrun, args: ["-T", "ws", "getGuestIPAddress", vmx, "-wait"], label: "Ask the guest for its address" });

export interface VirtualBoxPlanInput {
    readonly vboxmanage: string;
    readonly name: string;
    readonly folder: string;
    readonly vmdk: string;
    readonly memoryMb: number;
    readonly cpus: number;
    readonly network: "bridged" | "nat";
    readonly bridgeAdapter: string | null;
    readonly hostPort: number;
    readonly guestPort: number;
    /** VirtualBox 7 renamed `--nictype1` to `--nic-type1`. */
    readonly majorVersion: number;
}

export function virtualBoxCreatePlan(input: VirtualBoxPlanInput): Planned[] {
    const vb = input.vboxmanage;
    const name = quoteName(input.name);
    const nicType = input.majorVersion >= 7 ? "--nic-type1" : "--nictype1";
    const nic: string[] = input.network === "bridged" ? ["--nic1", "bridged", ...(input.bridgeAdapter ? ["--bridgeadapter1", input.bridgeAdapter] : [])] : ["--nic1", "nat"];
    const plan: Planned[] = [
        { file: vb, args: ["createvm", "--name", name, "--ostype", "Linux26_64", "--register", "--basefolder", input.folder], label: "Create the virtual machine" },
        { file: vb, args: ["modifyvm", name, "--memory", String(input.memoryMb), "--cpus", String(input.cpus), "--ioapic", "on", "--boot1", "disk", "--boot2", "none", "--boot3", "none", "--boot4", "none", ...nic, nicType, "82540EM", "--graphicscontroller", "vmsvga", "--vram", "16", "--uart1", "0x3F8", "4", "--uartmode1", "file", `${input.folder}/console.log`], label: "Set memory, processors and network" },
        { file: vb, args: ["storagectl", name, "--name", "SATA", "--add", "sata", "--controller", "IntelAhci"], label: "Add the disk controller" },
        { file: vb, args: ["storageattach", name, "--storagectl", "SATA", "--port", "0", "--device", "0", "--type", "hdd", "--medium", input.vmdk], label: "Attach the appliance disk" },
    ];
    if (input.network === "nat") plan.push({ file: vb, args: ["modifyvm", name, "--natpf1", `web,tcp,,${input.hostPort},,${input.guestPort}`], label: "Forward the web port" });
    plan.push({ file: vb, args: ["startvm", name, "--type", "headless"], label: "Start the virtual machine" });
    return plan;
}

export const virtualBoxStop = (vb: string, name: string, hard: boolean): Planned => ({ file: vb, args: ["controlvm", quoteName(name), hard ? "poweroff" : "acpipowerbutton"], label: "Stop the virtual machine" });
export const virtualBoxRemove = (vb: string, name: string): Planned => ({ file: vb, args: ["unregistervm", quoteName(name), "--delete"], label: "Remove the virtual machine" });
export const virtualBoxGuestIp = (vb: string, name: string): Planned => ({ file: vb, args: ["guestproperty", "get", quoteName(name), "/VirtualBox/GuestInfo/Net/0/V4/IP"], label: "Ask the guest for its address" });

export function parseBridgedAdapters(output: string): string[] {
    return output.split(/\r?\n/u).map((line) => /^Name:\s+(.+?)\s*$/u.exec(line)?.[1]).filter((value): value is string => !!value);
}

/** Picks the bridged adapter whose name contains the default-route adapter's description. */
export function chooseBridgeAdapter(bridged: readonly string[], defaultRouteDescription: string | null): string | null {
    if (bridged.length === 0) return null;
    if (defaultRouteDescription) {
        const wanted = defaultRouteDescription.trim().toLowerCase();
        const hit = bridged.find((name) => name.toLowerCase() === wanted) ?? bridged.find((name) => name.toLowerCase().includes(wanted) || wanted.includes(name.toLowerCase()));
        if (hit) return hit;
    }
    return bridged[0] ?? null;
}

export const DEFAULT_ROUTE_QUERY = "$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1; if ($r) { (Get-NetAdapter -InterfaceIndex $r.InterfaceIndex).InterfaceDescription }";

export function parseGuestIp(output: string): string | null {
    const match = /\b((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})\b/u.exec(output);
    if (!match || match[1] === "0.0.0.0") return null;
    return match[1] ?? null;
}

/** Finds an address for a MAC in `arp -a` output (Windows prints dashes, Linux colons). */
export function ipFromArp(arpOutput: string, mac: string): string | null {
    const wanted = mac.toLowerCase().replace(/[^0-9a-f]/gu, "");
    if (wanted.length !== 12) return null;
    for (const line of arpOutput.split(/\r?\n/u)) {
        const m = /((?:\d{1,3}\.){3}\d{1,3})\s+([0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2})/iu.exec(line);
        if (m && m[2]?.toLowerCase().replace(/[^0-9a-f]/gu, "") === wanted) return m[1] ?? null;
    }
    return null;
}
