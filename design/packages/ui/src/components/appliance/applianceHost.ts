/**
 * The renderer side of the appliance builder: the shapes the main process returns, the form's
 * pure validation and request building, and an all-or-nothing resolver for the preload bridge.
 *
 * The bridge is resolved as a whole or not at all, like the mounts bridge: a half-wired bridge shows
 * a working-looking control that throws the moment somebody presses it.
 */

export type ApplianceTarget = "vmware" | "virtualbox" | "usb" | "rpi" | "export";

/** Targets that write a removable drive: a PC USB stick, or a Raspberry Pi SD card or USB drive. */
export function writesDrive(target: ApplianceTarget): boolean {
    return target === "usb" || target === "rpi";
}
export type ExportFormat = "img" | "vmdk" | "vhdx" | "ova";
export type NetworkMode = "bridged" | "nat";
export type StepState = "pending" | "running" | "done" | "failed";

export interface ApplianceStepView {
    readonly id: string;
    readonly label: string;
    readonly state: StepState;
    readonly meta: string;
}

export interface ApplianceProgressView {
    readonly target: ApplianceTarget;
    readonly steps: readonly ApplianceStepView[];
}

export interface ApplianceResultView {
    readonly ok: boolean;
    readonly cancelled: boolean;
    readonly target: ApplianceTarget;
    readonly link: string | null;
    readonly path: string | null;
    readonly message: string;
    readonly steps: readonly ApplianceStepView[];
}

export interface ToolStatusView {
    readonly id: "vmware" | "virtualbox";
    readonly found: boolean;
    readonly version: string | null;
}

export interface UsbDiskView {
    readonly number: number;
    readonly name: string;
    readonly sizeBytes: number;
}

export interface ApplianceRequestView {
    target: ApplianceTarget;
    mapRoot: string;
    vmName: string;
    network: NetworkMode;
    memoryMb: number;
    cpus: number;
    hostName: string;
    port: number;
    accessCode: string | null;
    usbDiskNumber?: number;
    usbConfirmName?: string;
    exportFormat?: ExportFormat;
    exportDir?: string;
    /** Absent: the finished map. `app`: the whole WorldLens app; only the password's SHA-256 is sent. */
    workload?: { kind: "app"; image: string; passwordSha256: string } | { kind: "minecraft"; serverImage: string; siteImage: string; eulaAccepted: boolean; memoryGb: number };
}

export interface ApplianceBridge {
    tools(): Promise<readonly ToolStatusView[]>;
    usbDisks(): Promise<readonly UsbDiskView[]>;
    build(request: ApplianceRequestView): Promise<ApplianceResultView>;
    onProgress(listener: (progress: ApplianceProgressView) => void): () => void;
    reveal(path: string): Promise<unknown>;
    pickFolder?: () => Promise<string | null>;
}

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === "function";

export function resolveApplianceBridge(): ApplianceBridge | null {
    if (typeof window === "undefined") return null;
    const api = (window as { worldlens?: { appliance?: Partial<ApplianceBridge> } }).worldlens?.appliance;
    if (!api) return null;
    if (!isFunction(api.tools) || !isFunction(api.usbDisks) || !isFunction(api.build) || !isFunction(api.onProgress) || !isFunction(api.reveal)) return null;
    return api as ApplianceBridge;
}

export interface ApplianceFormState {
    target: ApplianceTarget;
    vmName: string;
    network: NetworkMode;
    memoryMb: number;
    cpus: number;
    hostName: string;
    port: string;
    askAccessCode: boolean;
    accessCode: string;
    usbDiskNumber: number | null;
    usbConfirmName: string;
    exportFormat: ExportFormat;
    exportDir: string;
    /** Run the whole WorldLens app instead of only the finished map. */
    runApp: boolean;
    appImage: string;
    appPassword: string;
    /** Run a Minecraft server plus its management site instead. */
    runServer: boolean;
    serverImage: string;
    siteImage: string;
    eulaAccepted: boolean;
    serverMemoryGb: number;
}

export const PINNED_IMAGE_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,200}(:[A-Za-z0-9._-]{1,64})?@sha256:[a-f0-9]{64}$/u;
export const SITE_IMAGE_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,200}\/worldlens-server-site(:[A-Za-z0-9._-]{1,64})?@sha256:[a-f0-9]{64}$/u;

export const HOSTED_IMAGE_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,200}\/worldlens-hosted(:[A-Za-z0-9._-]{1,64})?@sha256:[a-f0-9]{64}$/u;

export function defaultForm(): ApplianceFormState {
    return { target: "vmware", vmName: "worldlens-map", network: "bridged", memoryMb: 1024, cpus: 2, hostName: "worldlens-map", port: "80", askAccessCode: true, accessCode: "", usbDiskNumber: null, usbConfirmName: "", exportFormat: "vmdk", exportDir: "", runApp: false, appImage: "", appPassword: "", runServer: false, serverImage: "", siteImage: "", eulaAccepted: false, serverMemoryGb: 2 };
}

/** The reason the build button is disabled, or null. Mirrors the main process; the main process re-checks. */
export function formProblem(form: ApplianceFormState, mapRoot: string, usb: readonly UsbDiskView[]): string | null {
    if (!mapRoot) return "Choose the rendered map to serve.";
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/u.test(form.hostName)) return "Host name: lower-case letters, digits and hyphens.";
    const port = Number(form.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return "Web port: a whole number from 1 to 65535.";
    if (form.askAccessCode && (form.accessCode.length < 4 || form.accessCode.length > 128)) return "Access code: 4 to 128 characters.";
    if (form.target === "vmware" || form.target === "virtualbox") {
        if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/u.test(form.vmName)) return "Virtual machine name: letters, digits, spaces, dots, dashes, underscores.";
    }
    if (writesDrive(form.target)) {
        const disk = usb.find((d) => d.number === form.usbDiskNumber);
        if (!disk) return form.target === "rpi" ? "Choose the SD card or USB drive for the Raspberry Pi." : "Choose a USB drive.";
        if (form.usbConfirmName.trim().toLowerCase() !== disk.name.toLowerCase()) return "Type the drive name to confirm the erase.";
    }
    if (form.target === "export" && !form.exportDir.trim()) return "Choose where to save the image.";
    if (form.runApp && form.runServer) return "Choose either the WorldLens app or a Minecraft server, not both.";
    if (form.runServer) {
        if (!PINNED_IMAGE_PATTERN.test(form.serverImage.trim())) return "Minecraft server: paste the server image pinned by digest.";
        if (!SITE_IMAGE_PATTERN.test(form.siteImage.trim())) return "Minecraft server: paste the worldlens-server-site image pinned by digest.";
        if (!form.eulaAccepted) return "Minecraft server: accept the Minecraft EULA.";
    }
    if (form.runApp) {
        if (!HOSTED_IMAGE_PATTERN.test(form.appImage.trim())) return "WorldLens app: paste the worldlens-hosted image pinned by digest.";
        if (form.appPassword.length < 8) return "WorldLens app: a password of at least 8 characters.";
    }
    return null;
}

export function buildRequest(form: ApplianceFormState, mapRoot: string): ApplianceRequestView {
    const request: ApplianceRequestView = {
        target: form.target,
        mapRoot,
        vmName: form.vmName,
        network: form.network,
        memoryMb: form.memoryMb,
        cpus: form.cpus,
        hostName: form.hostName,
        port: Number(form.port),
        accessCode: form.askAccessCode ? form.accessCode : null,
    };
    if (writesDrive(form.target)) {
        if (form.usbDiskNumber !== null) request.usbDiskNumber = form.usbDiskNumber;
        request.usbConfirmName = form.usbConfirmName;
    }
    if (form.target === "export") {
        request.exportFormat = form.exportFormat;
        request.exportDir = form.exportDir;
    }
    return request;
}

export function planLabels(target: ApplianceTarget): { id: string; label: string }[] {
    const base = { id: "base", label: "Bundled appliance base (Alpine, Docker, map server)" };
    const pack = { id: "pack", label: "Pack the map onto a data partition" };
    if (target === "export") return [base, pack, { id: "format", label: "Write the chosen format" }, { id: "notes", label: "Write the checksum and install note" }];
    if (writesDrive(target)) return [target === "rpi" ? { id: "base", label: "Bundled Raspberry Pi appliance base (Alpine arm64, Docker, map server)" } : base, pack, { id: "write", label: "Write the drive" }, { id: "readback", label: "Read back and compare" }, { id: "safe", label: "Safe to remove" }];
    return [base, pack, { id: "disk", label: "Make the virtual disk" }, { id: "create", label: "Create and start the virtual machine" }, { id: "boot", label: "Wait for it to boot and report its address" }, { id: "check", label: "Check the link from this PC" }];
}

export const formatBytes = (bytes: number): string => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);
