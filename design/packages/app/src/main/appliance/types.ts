/** "rpi" writes the arm64 Raspberry Pi build of the appliance to an SD card or USB drive. */
export type ApplianceTarget = "vmware" | "virtualbox" | "usb" | "rpi" | "export";
export type ApplianceArch = "x86_64" | "aarch64-rpi";
export type ExportFormat = "img" | "vmdk" | "vhdx" | "ova";
export type NetworkMode = "bridged" | "nat";

export interface ApplianceRequest {
    readonly target: ApplianceTarget;
    /** The verified render export folder to serve (see managedHosting/exportContext). */
    readonly mapRoot: string;
    readonly vmName: string;
    readonly network: NetworkMode;
    readonly memoryMb: number;
    readonly cpus: number;
    readonly hostName: string;
    readonly port: number;
    /** Plain access code; only a salted verifier ever leaves this process. Null disables it. */
    readonly accessCode: string | null;
    readonly usbDiskNumber?: number;
    readonly usbConfirmName?: string;
    readonly exportFormat?: ExportFormat;
    readonly exportDir?: string;
}

export type StepState = "pending" | "running" | "done" | "failed";

export interface ApplianceStep {
    readonly id: string;
    readonly label: string;
    readonly state: StepState;
    readonly meta: string;
}

export interface ApplianceProgress {
    readonly target: ApplianceTarget;
    readonly steps: readonly ApplianceStep[];
}

export interface ApplianceResult {
    readonly ok: boolean;
    /** The Windows permission prompt was declined. Nothing was written. */
    readonly cancelled: boolean;
    readonly target: ApplianceTarget;
    /** The verified web link for a VM or USB target; the saved path for an export. */
    readonly link: string | null;
    readonly path: string | null;
    readonly message: string;
    readonly instanceId: string | null;
    readonly steps: readonly ApplianceStep[];
}

export interface ApplianceInstance {
    readonly id: string;
    readonly target: "vmware" | "virtualbox";
    readonly name: string;
    /** `.vmx` path for VMware, VM name for VirtualBox. */
    readonly handle: string;
    /** The folder this tool created for the VM. Only this folder is ever deleted. */
    readonly folder: string;
    readonly link: string;
    readonly port: number;
    readonly hostName: string;
    readonly createdAt: string;
}

export interface ToolStatus {
    readonly id: "vmware" | "virtualbox";
    readonly found: boolean;
    readonly path: string | null;
    readonly version: string | null;
}

export interface UsbDisk {
    readonly number: number;
    readonly name: string;
    readonly sizeBytes: number;
}

export const SETTING_LIMITS = { memoryMin: 256, memoryMax: 16384, cpusMin: 1, cpusMax: 16 } as const;

export function validateRequest(request: ApplianceRequest): string | null {
    if (!request.mapRoot) return "Choose the rendered map to serve.";
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/u.test(request.hostName)) return "The host name can use lower-case letters, digits and hyphens, and must start and end with a letter or digit.";
    if (!Number.isInteger(request.port) || request.port < 1 || request.port > 65535) return "The web port must be a whole number from 1 to 65535.";
    if (request.accessCode !== null && (request.accessCode.length < 4 || request.accessCode.length > 128)) return "The access code must be 4 to 128 characters, or switched off.";
    if (request.target === "vmware" || request.target === "virtualbox") {
        if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/u.test(request.vmName)) return "The virtual machine name can use letters, digits, spaces, dots, dashes and underscores.";
        if (!Number.isInteger(request.memoryMb) || request.memoryMb < SETTING_LIMITS.memoryMin || request.memoryMb > SETTING_LIMITS.memoryMax) return "Memory must be between 256 and 16384 MB.";
        if (!Number.isInteger(request.cpus) || request.cpus < SETTING_LIMITS.cpusMin || request.cpus > SETTING_LIMITS.cpusMax) return "Processors must be between 1 and 16.";
    }
    if (request.target === "usb") {
        if (!Number.isInteger(request.usbDiskNumber) || (request.usbDiskNumber ?? -1) < 0) return "Choose a USB drive.";
        if (!request.usbConfirmName) return "Type the drive name to confirm the erase.";
    }
    if (request.target === "export") {
        if (!request.exportFormat) return "Choose an image format.";
        if (!request.exportDir) return "Choose where to save the image.";
    }
    return null;
}
