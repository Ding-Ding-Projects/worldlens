/**
 * Virtual disk model shared by the desktop main process and the interface.
 *
 * Everything here is pure: format limits, request validation, safe naming, Quick pack sizing and
 * the exact DiskPart and PowerShell text for every operation. The main process runs the scripts;
 * the interface shows the same text so a person can copy it and do the step by hand. Keeping one
 * source for both means the script on screen is always the one that runs.
 *
 * Limits come from Microsoft's documentation for the VHD and VHDX formats and DiskPart:
 * a virtual disk is at least 3 MB, a dynamic or differencing VHD at most 2,040 GB, a fixed VHD at
 * most 2,040 GB through DiskPart, and a VHDX at most 64 TB. VHDX block sizes are powers of two
 * from 1 MB to 256 MB; logical and physical sector sizes are 512 or 4096 bytes.
 */

export type VirtualDiskFormat = "vhd" | "vhdx" | "vhdset" | "iso";
export type VirtualDiskType = "fixed" | "dynamic" | "differencing";
/** Every route the manager knows. `hyperv` is never required: each operation has a Home route. */
export type VirtualDiskRoute = "virtdisk" | "storage" | "diskpart" | "hyperv";
export type VirtualDiskOperation =
    | "create"
    | "attach"
    | "detach"
    | "grow"
    | "shrink"
    | "compact"
    | "convert"
    | "merge"
    | "reparent"
    | "identity"
    | "checkpoint"
    | "devdrive"
    | "nativeboot"
    | "describe"
    | "metadata"
    | "changeTracking"
    | "mirror";

export const MIB = 1024 * 1024;
export const GIB = 1024 * MIB;
export const TIB = 1024 * GIB;

export const VIRTUAL_DISK_EXTENSIONS: Readonly<Record<VirtualDiskFormat, string>> = {
    vhd: ".vhd",
    vhdx: ".vhdx",
    vhdset: ".vhds",
    iso: ".iso",
};

/** Every file extension the window accepts as a dropped virtual disk. */
export const DROPPABLE_DISK_EXTENSIONS = [".vhd", ".vhdx", ".vhds", ".avhd", ".avhdx", ".iso"] as const;

export interface FormatLimits {
    readonly minBytes: number;
    readonly maxBytes: number;
}

export function formatLimits(format: VirtualDiskFormat): FormatLimits {
    switch (format) {
        case "vhd":
            return { minBytes: 3 * MIB, maxBytes: 2040 * GIB };
        case "vhdx":
        case "vhdset":
            return { minBytes: 3 * MIB, maxBytes: 64 * TIB };
        case "iso":
            return { minBytes: 0, maxBytes: Number.MAX_SAFE_INTEGER };
    }
}

export function formatFromPath(path: string): VirtualDiskFormat | null {
    const lower = path.toLowerCase();
    if (lower.endsWith(".vhdx") || lower.endsWith(".avhdx")) return "vhdx";
    if (lower.endsWith(".vhds")) return "vhdset";
    if (lower.endsWith(".vhd") || lower.endsWith(".avhd")) return "vhd";
    if (lower.endsWith(".iso")) return "iso";
    return null;
}

export function isDroppableDisk(path: string): boolean {
    const lower = path.toLowerCase();
    return DROPPABLE_DISK_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface CreateRequest {
    readonly path: string;
    readonly format: Exclude<VirtualDiskFormat, "iso">;
    readonly type: VirtualDiskType;
    readonly sizeBytes: number;
    readonly blockSizeBytes?: number;
    readonly logicalSectorBytes?: 512 | 4096;
    readonly physicalSectorBytes?: 512 | 4096;
    readonly parentPath?: string;
    /** When set, the new disk is initialised, formatted and given this volume label. */
    readonly volume?: {
        readonly fileSystem: "ntfs" | "refs" | "exfat" | "fat32";
        readonly label: string;
        readonly partitionStyle: "gpt" | "mbr";
        readonly allocationUnitBytes?: number;
        /** A drive letter like `E`, a folder mount path, or null for neither. */
        readonly mount: { readonly kind: "letter"; readonly letter: string } | { readonly kind: "folder"; readonly path: string } | null;
    };
}

export interface CreateProblem {
    readonly field: "path" | "size" | "blockSize" | "sector" | "parent" | "volume";
    readonly message: string;
}

const isPowerOfTwo = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

export function validateCreate(request: CreateRequest): readonly CreateProblem[] {
    const problems: CreateProblem[] = [];
    const ext = VIRTUAL_DISK_EXTENSIONS[request.format];
    // A differencing child conventionally carries the "a" prefix (.avhdx, .avhd).
    const childExt = request.type === "differencing" && (request.format === "vhdx" || request.format === "vhd") ? `.a${ext.slice(1)}` : null;
    const lower = request.path.toLowerCase();
    if (!lower.endsWith(ext) && !(childExt && lower.endsWith(childExt))) {
        problems.push({ field: "path", message: `A ${formatLabel(request.format)} file name ends with ${ext}.` });
    }
    if (request.path.startsWith("\\\\")) {
        problems.push({ field: "path", message: "Virtual disks cannot be attached from a network share. Choose a local folder." });
    }
    if (request.type !== "differencing") {
        const { minBytes, maxBytes } = formatLimits(request.format);
        if (!Number.isFinite(request.sizeBytes) || request.sizeBytes < minBytes) {
            problems.push({ field: "size", message: `${formatLabel(request.format)} needs at least 3 MB.` });
        } else if (request.sizeBytes > maxBytes) {
            problems.push({
                field: "size",
                message: `${formatLabel(request.format)} holds at most ${formatBytes(maxBytes)}. Choose VHDX for more.`,
            });
        }
    }
    if (request.blockSizeBytes !== undefined) {
        if (request.format === "vhd") {
            problems.push({ field: "blockSize", message: "Block size can only be chosen for VHDX and VHD Set." });
        } else if (!isPowerOfTwo(request.blockSizeBytes) || request.blockSizeBytes < MIB || request.blockSizeBytes > 256 * MIB) {
            problems.push({ field: "blockSize", message: "Block size is a power of two from 1 MB to 256 MB." });
        }
    }
    for (const sector of [request.logicalSectorBytes, request.physicalSectorBytes]) {
        if (sector !== undefined && sector !== 512 && sector !== 4096) {
            problems.push({ field: "sector", message: "Sector sizes are 512 or 4096 bytes." });
        }
    }
    if (request.format === "vhd" && request.logicalSectorBytes === 4096) {
        problems.push({ field: "sector", message: "VHD only supports 512-byte logical sectors." });
    }
    if (request.type === "differencing" && !request.parentPath) {
        problems.push({ field: "parent", message: "A differencing disk needs a parent disk." });
    }
    if (request.volume) {
        if (request.volume.label.length > 32) problems.push({ field: "volume", message: "Volume labels are 32 characters at most." });
        if (request.volume.fileSystem === "fat32" && request.sizeBytes > 32 * GIB) {
            problems.push({ field: "volume", message: "Windows formats FAT32 up to 32 GB. Choose exFAT or NTFS." });
        }
        const mount = request.volume.mount;
        if (mount?.kind === "letter" && !/^[D-Zd-z]$/u.test(mount.letter)) {
            problems.push({ field: "volume", message: "Choose a drive letter from D to Z." });
        }
    }
    return problems;
}

export function formatLabel(format: VirtualDiskFormat): string {
    return { vhd: "VHD", vhdx: "VHDX", vhdset: "VHD Set", iso: "ISO" }[format];
}

export function formatBytes(bytes: number): string {
    if (bytes >= TIB) return `${trim(bytes / TIB)} TB`;
    if (bytes >= GIB) return `${trim(bytes / GIB)} GB`;
    if (bytes >= MIB) return `${trim(bytes / MIB)} MB`;
    return `${bytes} bytes`;
}

function trim(n: number): string {
    return (Math.round(n * 10) / 10).toLocaleString("en-US");
}

/**
 * The first name in `folder` that does not exist: `Photos.vhdx`, then `Photos (1).vhdx`, and so on.
 * Nothing is ever overwritten, so the caller never needs a confirmation for a clash.
 */
export function nextFreeName(stem: string, extension: string, exists: (name: string) => boolean): string {
    const first = `${stem}${extension}`;
    if (!exists(first)) return first;
    for (let n = 1; n < 10_000; n += 1) {
        const candidate = `${stem} (${n})${extension}`;
        if (!exists(candidate)) return candidate;
    }
    throw new Error(`No free name for ${first} after 9,999 tries.`);
}

export interface PackEntry {
    readonly bytes: number;
    readonly isDirectory?: boolean;
}

/**
 * The starting size of a Quick pack VHDX.
 *
 * Each file is rounded up to whole clusters and pays a file record (1 KB on NTFS, 4 KB on ReFS);
 * folders pay a record too. The partition table, the EFI and reserved partitions and the NTFS
 * metadata zone are added, then 10 percent headroom with a 64 MB floor. The result is rounded to
 * whole megabytes and never below the format's 3 MB minimum. If this still turns out short the
 * pack grows the disk automatically; this estimate only decides where it starts.
 */
export function quickPackSize(entries: readonly PackEntry[], clusterBytes = 4096, fileSystem: "ntfs" | "refs" | "exfat" = "ntfs"): number {
    const record = fileSystem === "refs" ? 4096 : fileSystem === "exfat" ? 96 : 1024;
    let data = 0;
    for (const entry of entries) {
        data += record;
        if (!entry.isDirectory) data += Math.ceil(entry.bytes / clusterBytes) * clusterBytes;
    }
    const layout = 1 * MIB + 100 * MIB + 16 * MIB; // GPT headers, EFI, MSR
    const metadata = Math.max(16 * MIB, Math.ceil(data * 0.0125));
    const headroom = Math.max(64 * MIB, Math.ceil(data * 0.1));
    const total = data + layout + metadata + headroom;
    return Math.max(3 * MIB, Math.ceil(total / MIB) * MIB);
}

/**
 * How far to grow a disk that ran short by `shortBytes`: the shortfall plus a quarter of the
 * current size (at least 256 MB), capped at the format limit. Returns null when even the cap
 * cannot hold the shortfall, which the pack reports as a stop with the exact amount.
 */
export function growTarget(currentBytes: number, shortBytes: number, format: VirtualDiskFormat = "vhdx"): number | null {
    const { maxBytes } = formatLimits(format);
    const wanted = currentBytes + shortBytes + Math.max(256 * MIB, Math.ceil(currentBytes / 4));
    const rounded = Math.ceil(wanted / MIB) * MIB;
    if (currentBytes + shortBytes > maxBytes) return null;
    return Math.min(rounded, maxBytes);
}

/** A rendered BlueMap map's starting VHDX size from the region count, used by render-into-VHDX. */
export function mapDiskSize(regionCount: number, tilesPerRegion = 900, averageTileBytes = 6 * 1024): number {
    const tiles = Math.max(1, regionCount) * tilesPerRegion;
    return quickPackSize([{ bytes: tiles * averageTileBytes }], 4096) + tiles * 1024;
}

export interface RouteAvailability {
    readonly virtdisk: boolean;
    readonly storage: boolean;
    readonly diskpart: boolean;
    readonly hyperv: boolean;
}

export interface RouteChoice {
    readonly route: VirtualDiskRoute;
    readonly usable: boolean;
    readonly reason: string;
}

/**
 * Which routes can do an operation, best first. Hyper-V is listed last and only when present;
 * every operation has at least one route that exists on Windows Home.
 */
export function routesFor(operation: VirtualDiskOperation, available: RouteAvailability): readonly RouteChoice[] {
    const can: Readonly<Record<VirtualDiskOperation, readonly VirtualDiskRoute[]>> = {
        create: ["diskpart", "virtdisk", "hyperv"],
        attach: ["storage", "diskpart", "virtdisk"],
        detach: ["storage", "diskpart", "virtdisk"],
        grow: ["diskpart", "virtdisk", "hyperv"],
        shrink: ["virtdisk", "hyperv"],
        compact: ["diskpart", "virtdisk", "hyperv"],
        convert: ["virtdisk", "hyperv"],
        merge: ["diskpart", "virtdisk", "hyperv"],
        reparent: ["virtdisk", "hyperv"],
        identity: ["virtdisk", "hyperv"],
        checkpoint: ["virtdisk", "hyperv"],
        devdrive: ["storage"],
        nativeboot: ["storage"],
        describe: ["virtdisk"],
        metadata: ["virtdisk"],
        changeTracking: ["virtdisk"],
        mirror: ["virtdisk"],
    };
    return can[operation].map((route) => {
        if (!available[route]) {
            return { route, usable: false, reason: route === "hyperv" ? "The Hyper-V module is not installed on this PC." : `${routeLabel(route)} was not found on this PC.` };
        }
        return { route, usable: true, reason: "Available" };
    });
}

export function routeLabel(route: VirtualDiskRoute): string {
    return { virtdisk: "VirtDisk API", storage: "Storage module", diskpart: "DiskPart", hyperv: "Hyper-V module" }[route];
}

/** DiskPart wants quotes around paths and refuses embedded quotes; reject them before any script runs. */
export function assertScriptablePath(path: string): string {
    if (path.includes('"') || /[\r\n]/u.test(path)) throw new Error("Paths with quotes or line breaks cannot be used in a disk script.");
    return path;
}

const q = (path: string): string => `"${assertScriptablePath(path)}"`;
const psq = (path: string): string => `'${assertScriptablePath(path).replace(/'/gu, "''")}'`;

export function createScript(request: CreateRequest): string {
    const lines: string[] = [];
    const mb = Math.ceil(request.sizeBytes / MIB);
    if (request.type === "differencing") {
        lines.push(`create vdisk file=${q(request.path)} parent=${q(request.parentPath ?? "")}`);
    } else {
        lines.push(`create vdisk file=${q(request.path)} maximum=${mb} type=${request.type === "fixed" ? "fixed" : "expandable"}`);
    }
    if (request.volume) {
        const v = request.volume;
        lines.push(`select vdisk file=${q(request.path)}`, "attach vdisk", `convert ${v.partitionStyle}`, "create partition primary");
        const unit = v.allocationUnitBytes ? ` unit=${v.allocationUnitBytes}` : "";
        lines.push(`format fs=${v.fileSystem} label="${v.label.replace(/"/gu, "")}" quick${unit}`);
        if (v.mount?.kind === "letter") lines.push(`assign letter=${v.mount.letter.toUpperCase()}`);
        else if (v.mount?.kind === "folder") lines.push(`assign mount=${q(v.mount.path)}`);
    }
    return lines.join("\n");
}

export function attachScript(path: string, readOnly: boolean): string {
    return [`select vdisk file=${q(path)}`, `attach vdisk${readOnly ? " readonly" : ""}`].join("\n");
}

export function detachScript(path: string): string {
    return [`select vdisk file=${q(path)}`, "detach vdisk"].join("\n");
}

export function growScript(path: string, newSizeBytes: number, extendVolume: string | null): string {
    const lines = [`select vdisk file=${q(path)}`, `expand vdisk maximum=${Math.ceil(newSizeBytes / MIB)}`];
    if (extendVolume) lines.push("attach vdisk", `select volume ${extendVolume}`, "extend");
    return lines.join("\n");
}

export function compactScript(path: string): string {
    return [`select vdisk file=${q(path)}`, "attach vdisk readonly", "compact vdisk", "detach vdisk"].join("\n");
}

export function mergeScript(childPath: string, depth = 1): string {
    return [`select vdisk file=${q(childPath)}`, `merge vdisk depth=${Math.max(1, Math.floor(depth))}`].join("\n");
}

/** PowerShell text for the same operation, for the copy button and for the Storage route. */
export function powerShellEquivalent(operation: VirtualDiskOperation, path: string, extra: { readonly sizeBytes?: number; readonly mode?: CompactMode; readonly destination?: string; readonly readOnly?: boolean; readonly noDriveLetter?: boolean } = {}): string {
    switch (operation) {
        case "attach":
            return `Mount-DiskImage -ImagePath ${psq(path)}${extra.readOnly ? " -Access ReadOnly" : ""}${extra.noDriveLetter ? " -NoDriveLetter" : ""}`;
        case "detach":
            return `Dismount-DiskImage -ImagePath ${psq(path)}`;
        case "grow":
        case "shrink":
            return `# Hyper-V module equivalent\nResize-VHD -Path ${psq(path)} -SizeBytes ${extra.sizeBytes ?? 0}`;
        case "compact":
            return `# Hyper-V module equivalent\nOptimize-VHD -Path ${psq(path)} -Mode ${extra.mode ?? "Full"}`;
        case "convert":
            return `# Hyper-V module equivalent\nConvert-VHD -Path ${psq(path)} -DestinationPath ${psq(extra.destination ?? path)}`;
        case "merge":
            return `# Hyper-V module equivalent\nMerge-VHD -Path ${psq(path)}`;
        default:
            return `Get-DiskImage -ImagePath ${psq(path)} | Format-List *`;
    }
}

export type CompactMode = "Full" | "Quick" | "Retrim" | "Pretrimmed" | "Prezeroed";

export const COMPACT_MODES: readonly { readonly mode: CompactMode; readonly attach: "detached" | "readonly"; readonly help: string }[] = [
    { mode: "Full", attach: "detached", help: "Scans for unused blocks and reclaims them. The disk must be detached." },
    { mode: "Quick", attach: "readonly", help: "Reclaims blocks the file system already marked free. The disk is attached read-only." },
    { mode: "Retrim", attach: "readonly", help: "Sends trims again without reclaiming space." },
    { mode: "Pretrimmed", attach: "readonly", help: "Like Quick, for a disk that was already trimmed." },
    { mode: "Prezeroed", attach: "readonly", help: "Like Quick, for free space already written with zeros." },
];

/**
 * Checks a conversion before anything starts. A VHDX bigger than the VHD limit cannot become a
 * VHD; the source is never deleted unless the person asked and the copy verified.
 */
export function validateConvert(sourceFormat: VirtualDiskFormat, sourceVirtualBytes: number, target: Exclude<VirtualDiskFormat, "iso">): string | null {
    if (sourceFormat === "iso") return "An ISO image cannot be converted to a writable disk.";
    if (sourceFormat === target) return null;
    const { maxBytes } = formatLimits(target);
    if (sourceVirtualBytes > maxBytes) return `This disk is ${formatBytes(sourceVirtualBytes)}; ${formatLabel(target)} holds at most ${formatBytes(maxBytes)}.`;
    return null;
}

export interface DevDriveCheck {
    readonly ok: boolean;
    readonly message: string;
}

/** Microsoft's documented Dev Drive requirements: Windows 11 22621.2338 or later and 50 GB. */
export function devDriveChecks(build: { readonly major: number; readonly build: number; readonly revision: number }, sizeBytes: number, onRemovable: boolean): readonly DevDriveCheck[] {
    const buildOk = build.build > 22621 || (build.build === 22621 && build.revision >= 2338);
    return [
        { ok: buildOk, message: buildOk ? `Windows build ${build.build}.${build.revision} supports Dev Drive.` : "Dev Drive needs Windows 11 build 22621.2338 or later." },
        { ok: sizeBytes >= 50 * GIB, message: sizeBytes >= 50 * GIB ? "Size is 50 GB or more." : "A Dev Drive needs 50 GB or more." },
        { ok: !onRemovable, message: onRemovable ? "Dev Drive cannot live on a removable disk." : "Host file is not on a removable disk." },
    ];
}

const psQuote = (value: string): string => `'${assertScriptablePath(value).replace(/'/gu, "''")}'`;

/**
 * Turns an empty VHDX into a Dev Drive: attach it, give it one GPT partition and format that as
 * a Dev Drive (ReFS). It erases the disk, so the screen asks with two keys first and the script
 * refuses a disk that already has partitions.
 */
export function devDriveScript(path: string, label: string): string {
    const safeLabel = label.replace(/[^A-Za-z0-9 _-]/gu, "").slice(0, 32) || "DevDrive";
    return [
        "$ErrorActionPreference = 'Stop'",
        `$image = Mount-DiskImage -ImagePath ${psQuote(path)} -NoDriveLetter -PassThru`,
        "$disk = $image | Get-Disk",
        "if ($disk.PartitionStyle -ne 'RAW') { Dismount-DiskImage -ImagePath $image.ImagePath | Out-Null; throw 'This disk already has partitions. A Dev Drive starts from an empty disk.' }",
        "Initialize-Disk -Number $disk.Number -PartitionStyle GPT",
        "$part = New-Partition -DiskNumber $disk.Number -UseMaximumSize -AssignDriveLetter",
        `$volume = Format-Volume -Partition $part -DevDrive -NewFileSystemLabel '${safeLabel}' -Confirm:$false`,
        "Write-Output ('{\"ok\":true,\"driveLetter\":\"' + $part.DriveLetter + '\",\"fileSystem\":\"' + $volume.FileSystem + '\"}')",
    ].join("\n");
}

export interface NativeBootRequest {
    readonly path: string;
    readonly imageFile: string;
    readonly imageIndex: number;
    /** Where the boot configuration is exported before anything changes. */
    readonly bcdBackupPath: string;
}

/**
 * Prepares a fixed VHDX for native boot: exports the boot configuration first, applies a Windows
 * image to the disk with DISM, adds a boot entry with bcdboot and detaches. It never restarts
 * the computer; the person restarts when they are ready and picks the new entry.
 */
export function nativeBootScript(request: NativeBootRequest): string {
    if (!request.path.toLowerCase().endsWith(".vhdx")) throw new Error("Native boot needs a VHDX file.");
    if (!/\.(wim|esd)$/iu.test(request.imageFile)) throw new Error("Choose an install.wim or install.esd from Windows setup media.");
    if (!Number.isInteger(request.imageIndex) || request.imageIndex < 1) throw new Error("The image index is a whole number from 1.");
    return [
        "$ErrorActionPreference = 'Stop'",
        `Unblock-File -Path ${psQuote(request.path)} -ErrorAction SilentlyContinue`,
        `bcdedit /export ${psQuote(request.bcdBackupPath)} | Out-Null`,
        "if ($LASTEXITCODE -ne 0) { throw 'Could not export the boot configuration, so nothing was changed.' }",
        `$image = Mount-DiskImage -ImagePath ${psQuote(request.path)} -NoDriveLetter -PassThru`,
        "try {",
        "  $disk = $image | Get-Disk",
        "  if ($disk.PartitionStyle -ne 'RAW') { throw 'This disk already has partitions. Native boot starts from an empty fixed VHDX.' }",
        "  Initialize-Disk -Number $disk.Number -PartitionStyle GPT",
        "  $part = New-Partition -DiskNumber $disk.Number -UseMaximumSize -AssignDriveLetter",
        "  Format-Volume -Partition $part -FileSystem NTFS -NewFileSystemLabel 'Windows' -Confirm:$false | Out-Null",
        "  $root = $part.DriveLetter + ':\\'",
        `  dism /Apply-Image /ImageFile:${psQuote(request.imageFile)} /Index:${request.imageIndex} /ApplyDir:$root`,
        "  if ($LASTEXITCODE -ne 0) { throw ('DISM could not apply the image (exit ' + $LASTEXITCODE + ').') }",
        "  bcdboot ($root + 'Windows')",
        "  if ($LASTEXITCODE -ne 0) { throw ('bcdboot could not add the boot entry (exit ' + $LASTEXITCODE + ').') }",
        "} finally {",
        `  Dismount-DiskImage -ImagePath ${psQuote(request.path)} | Out-Null`,
        "}",
        "Write-Output '{\"ok\":true,\"restartNeeded\":true}'",
    ].join("\n");
}

export interface NativeBootCheck {
    readonly ok: boolean;
    readonly message: string;
}

/** The documented native boot prerequisites the screen checks before offering the step. */
export function nativeBootChecks(input: { readonly path: string; readonly fixed: boolean; readonly virtualBytes: number; readonly hostFreeBytes: number; readonly hostDiskIsDynamic: boolean; readonly onNetworkShare: boolean; readonly hasInternetMark: boolean }): readonly NativeBootCheck[] {
    const need = input.fixed ? 0 : input.virtualBytes;
    return [
        { ok: input.path.toLowerCase().endsWith(".vhdx"), message: input.path.toLowerCase().endsWith(".vhdx") ? "VHDX format." : "Native boot needs a VHDX file." },
        { ok: !input.hostDiskIsDynamic, message: input.hostDiskIsDynamic ? "The host disk is a dynamic disk; native boot needs a basic disk." : "The host disk is basic." },
        { ok: !input.onNetworkShare, message: input.onNetworkShare ? "The file is on a network share; native boot needs a local disk." : "The file is on a local disk." },
        { ok: input.hostFreeBytes >= need, message: input.hostFreeBytes >= need ? "There is room for the disk to reach its full size." : `A dynamic disk expands to its full size at boot: ${formatBytes(need)} must be free.` },
        { ok: !input.hasInternetMark, message: input.hasInternetMark ? "The file has a downloaded-from-the-internet mark; it is removed first." : "No downloaded-from-the-internet mark." },
    ];
}
